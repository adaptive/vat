import { XMLParser } from "fast-xml-parser";

const VIES_URL =
  "https://ec.europa.eu/taxation_customs/vies/services/checkVatService";
const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const parser = new XMLParser({
  removeNSPrefix: true,
  parseTagValue: false,
  processEntities: false,
});

export class UpstreamError extends Error {
  constructor(status = 502) {
    super("VIES request failed");
    this.name = "UpstreamError";
    this.status = status;
  }
}

async function readXml(response) {
  if (!response.body) throw new UpstreamError();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let xml = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new UpstreamError();
      }
      xml += decoder.decode(value, { stream: true });
    }
    return xml + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function checkVies(country, vat) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // country and vat are restricted to ASCII letters and digits by the router.
    const response = await fetch(VIES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: '""',
      },
      signal: controller.signal,
      body: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types"><soapenv:Header/><soapenv:Body><urn:checkVat><urn:countryCode>${country}</urn:countryCode><urn:vatNumber>${vat}</urn:vatNumber></urn:checkVat></soapenv:Body></soapenv:Envelope>`,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new UpstreamError();
    }
    const xml = await readXml(response);
    if (/<!DOCTYPE/i.test(xml)) throw new UpstreamError();
    const body = parser.parse(xml, true)?.Envelope?.Body;
    const result = body?.checkVatResponse;
    if (
      body?.Fault ||
      result?.countryCode !== country ||
      result?.vatNumber !== vat ||
      !["true", "false", "1", "0"].includes(result?.valid)
    ) {
      throw new UpstreamError();
    }
    return { country, vat, status: ["true", "1"].includes(result.valid) };
  } catch (error) {
    if (controller.signal.aborted) throw new UpstreamError(504);
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError();
  } finally {
    clearTimeout(timeout);
  }
}
