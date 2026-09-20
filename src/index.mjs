import { checkVAT, countries } from "jsvat";
import { allowed, CACHE_TTL_SECONDS, welcome, VERSION } from "./_const.mjs";
import { checkVies, UpstreamError } from "./vies.mjs";

export { Counter } from "./counter.mjs";

export default {
  async fetch(request, env, ctx) {
    const headers = new Headers({
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Version": VERSION,
    });

    try {
      if (request.method !== "GET") {
        headers.set("Allow", "GET");
        return new Response("Method Not Allowed", { status: 405, headers });
      }

      // Cloudflare supplies this header. Requests without it share a local bucket.
      const ip = request.headers.get("CF-Connecting-IP") || "local";
      const counter = env.COUNTER.get(env.COUNTER.idFromName(`ip:${ip}`));
      const limit = await counter.fetch("https://counter.internal/");
      if (limit.status !== 200 && limit.status !== 429) {
        throw new Error("Rate limiter unavailable");
      }
      for (const [name, value] of limit.headers) {
        if (name.startsWith("x-rate-limit-") || name === "retry-after") {
          headers.set(name, value);
        }
      }
      if (limit.status === 429) {
        return new Response("Too Many Requests", { status: 429, headers });
      }

      const pathname = new URL(request.url).pathname;
      if (pathname === "/") return new Response(welcome, { headers });
      const match = /^\/([a-z]{2})\/([a-z0-9]+)\/?$/i.exec(pathname);
      if (!match) return new Response("Not Found", { status: 404, headers });

      const country = match[1].toUpperCase();
      const vat = match[2].toUpperCase();
      if (!allowed.includes(country.toLowerCase())) {
        return new Response("Invalid Country", { status: 400, headers });
      }
      // jsvat has no XI entry; Northern Ireland uses UK number checks.
      const validationCountry = country === "XI" ? "GB" : country;
      if (
        vat.length > 14 ||
        !checkVAT(validationCountry + vat, countries).isValid
      ) {
        return new Response("Invalid VAT Number", { status: 400, headers });
      }

      const key = country + vat;
      let output = await env.vatKV.get(key, "json");
      if (
        output?.country !== country ||
        output?.vat !== vat ||
        typeof output?.status !== "boolean"
      ) {
        output = await checkVies(country, vat);
        ctx.waitUntil(
          env.vatKV
            .put(key, JSON.stringify(output), {
              expirationTtl: CACHE_TTL_SECONDS,
            })
            .catch(() => console.error({ event: "vat_cache_write_failed" })),
        );
      }
      headers.set("Content-Type", "application/json; charset=utf-8");
      return new Response(JSON.stringify(output), { headers });
    } catch (error) {
      const status = error instanceof UpstreamError ? error.status : 500;
      console.error({ event: "vat_request_failed", status });
      return new Response(
        status === 504
          ? "VIES request timed out"
          : status === 502
            ? "VIES service unavailable"
            : "Internal Server Error",
        { status, headers },
      );
    }
  },
};
