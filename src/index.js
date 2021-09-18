import { parse } from "fast-xml-parser";
import { countries, mime, welcome } from "./_const";
import { version } from "../package.json";

const cache_time = 86400;

const cache = caches.default;

const handleRequest = async event => {
  const url = new URL(event.request.url);
  const elements = url.pathname.split("/").filter(n => n);

  /** Check for Cached Result*/
  let response = await cache.match(event.request.url);
  if (!response) {
    /** Invalid vat number */
    if (countries.includes(elements[0]) && elements[1]) {
      if (elements[1].length > 12) {
        return new Response("Not Accept Identification Number", {
          status: 400
        });
      }

      /** Use KV instead of calling original source of truth */
      const key = (elements[0] + elements[1]).toLowerCase();
      let output = await vatKV.get(key, "json");
      if (output === null) {
        /** Promise Race  */
        const Resp = await Promise.race([
          fetch(
            "https://ec.europa.eu/taxation_customs/vies/services/checkVatService",
            {
              method: "POST",
              headers: {
                "Content-Type": mime.xml
              },
              body: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types"><soapenv:Header/><soapenv:Body><urn:checkVat><urn:countryCode>${elements[0].toUpperCase()}</urn:countryCode><urn:vatNumber>${elements[1].toUpperCase()}</urn:vatNumber></urn:checkVat></soapenv:Body></soapenv:Envelope>`
            }
          )
        ]);
        let xml = await Resp.text();
        let parsed = await parse(xml);
        output = {
          country: elements[0].toUpperCase(),
          vat: elements[1].toUpperCase(),
          status:
            parsed["soap:Envelope"]["soap:Body"]["checkVatResponse"]["valid"]
        };
        event.waitUntil(
          vatKV.put(key, JSON.stringify(output), {
            expirationTtl: cache_time
          })
        );
      }
      const body = JSON.stringify(output);
      response = new Response(body, {
        status: 200,
        headers: {
          "Content-Type": mime.json,
          "Cache-Control": `public, max-age=${cache_time}, immutable`,
          "X-Version": version
        }
      });
      event.waitUntil(cache.put(event.request.url, response.clone()));
      /** Invalid Country */
    } else if (!countries.includes(elements[0]) && elements[1]) {
      response = new Response("Invalid Country", {
        status: 400
      });
      /** No Favicon */
    } else if (elements[0] === "favicon.ico") {
      response = new Response("Not Found", {
        status: 404
      });
      /** Main Page */
    } else if (elements[0] === undefined) {
      response = new Response(welcome, {
        headers: {
          "Content-Type": mime.json,
          "Cache-Control": `public, max-age=${cache_time}, immutable`,
          "X-Version": version
        }
      });
    }
  }
  return response;
};

addEventListener("fetch", event => event.respondWith(handleRequest(event)));
