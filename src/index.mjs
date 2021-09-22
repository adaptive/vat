import { parse } from "fast-xml-parser";
import { allowed, mime, welcome } from "./_const";
import { checkVAT, countries } from "jsvat";

export { Counter } from "./counter.mjs";

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (e) {
      console.log(e);
      return new Response(e.message);
    }
  },
  async scheduled(event, env) {
    try {
      return await handleSchedule(request, env);
    } catch (e) {
      console.log(e);
      return new Response(e.message);
    }
  }
};

const version = "0.1.3";
const cache_time = 86400;
const cache = caches.default;

const handleRequest = async (request, env, ctx) => {
  const address = new URL(request.url);
  const elements = address.pathname.split("/").filter(n => n);

  let id = env.COUNTER.idFromName(request.headers.get("CF-Connecting-IP"));
  let obj = env.COUNTER.get(id);
  let resp = await obj.fetch(request.url);
  let count = parseInt(await resp.text());
  const epoch = 1609459200; // TODO next our reset

  if (count < 1) {
    return new Response(`Too Many Request! Limit resets at ${epoch}`, {
      status: 429
    });
    s;
  }

  /** Check for Cached Result*/
  let response = await cache.match(request.url);
  if (!response) {
    /** Invalid vat number */
    if (allowed.includes(elements[0]) && elements[1]) {
      const key = (elements[0] + elements[1]).toUpperCase();
      if (!checkVAT(key, countries).isValid) {
        return new Response("Not Accept Identification Number", {
          status: 400
        });
      }

      /** Use KV instead of calling original source of truth */
      let output = await env.vatKV.get(key, "json");
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

        ctx.waitUntil(
          await env.vatKV.put(key, JSON.stringify(output), {
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
          "X-Version": version,
          "X-Rate-Limit-Limit": 600,
          "X-Rate-Limit-Remaining": count,
          "X-Rate-Limit-Reset": epoch
        }
      });
      // ctx.waitUntil(await cache.put(request.url, response.clone()));
      /** Invalid Country */
    } else if (!allowed.includes(elements[0]) && elements[1]) {
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
          "Content-Type": mime.txt,
          "Cache-Control": `public, max-age=${cache_time}, immutable`,
          "X-Version": version,
          "X-Rate-Limit-Limit": 600,
          "X-Rate-Limit-Remaining": count,
          "X-Rate-Limit-Reset": epoch
        }
      });
    }
  }

  return response;
};

const handleSchedule = async (event, env) => {
  await env.COUNTER.deleteAll();
  console.log("test");
};
