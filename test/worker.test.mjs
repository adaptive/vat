import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index.mjs";

const result = { country: "PT", vat: "515486817", status: true };

function setup(t, cached = null) {
  const pending = [];
  const ids = [];
  const writes = [];
  const env = {
    COUNTER: {
      idFromName(name) {
        ids.push(name);
        return name;
      },
      get() {
        return {
          async fetch() {
            return new Response(null, {
              headers: { "X-Rate-Limit-Remaining": "59" },
            });
          },
        };
      },
    },
    vatKV: {
      async get(key, type) {
        assert.equal(key, "PT515486817");
        assert.equal(type, "json");
        return cached;
      },
      async put(...args) {
        writes.push(args);
      },
    },
  };
  const ctx = {
    waitUntil(promise) {
      assert.equal(typeof promise?.then, "function");
      pending.push(promise);
    },
  };
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected upstream request");
  });
  t.mock.method(console, "error", () => {});
  const request = (path = "/pt/515486817", init = {}) =>
    worker.fetch(
      new Request(`https://example.com${path}`, {
        headers: { "CF-Connecting-IP": "192.0.2.1" },
        ...init,
      }),
      env,
      ctx,
    );
  return { env, request, pending, ids, writes, fetchMock };
}

function soap(valid = "true", prefix = "soap") {
  return `<${prefix}:Envelope xmlns:${prefix}="http://schemas.xmlsoap.org/soap/envelope/"><${prefix}:Body><ns:checkVatResponse xmlns:ns="urn:ec.europa.eu:taxud:vies:services:checkVat:types"><ns:countryCode>PT</ns:countryCode><ns:vatNumber>515486817</ns:vatNumber><ns:valid>${valid}</ns:valid></ns:checkVatResponse></${prefix}:Body></${prefix}:Envelope>`;
}

test("validates routes and methods without calling VIES", async (t) => {
  const { request, fetchMock } = setup(t);
  for (const [path, status] of [
    ["/", 200],
    ["/favicon.ico", 404],
    ["/pt", 404],
    ["/pt/515486817/extra", 404],
    ["/pt//515486817", 404],
    ["/zz/515486817", 400],
    ["/pt/123", 400],
    ["/pt/515486817%3C", 404],
    ["/pt/515486817%20", 404],
  ])
    assert.equal((await request(path)).status, status, path);
  const response = await request("/", { method: "POST" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET");
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("uses normalized KV keys and preserves cached false results", async (t) => {
  const { request, ids, fetchMock, writes } = setup(t, {
    ...result,
    status: false,
  });
  const response = await request("/PT/515486817/?ignored=1");
  assert.deepEqual(await response.json(), { ...result, status: false });
  assert.deepEqual(ids, ["ip:192.0.2.1"]);
  assert.equal(response.headers.get("X-Rate-Limit-Remaining"), "59");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(writes.length, 0);
});

test("parses namespace-independent SOAP and caches the boolean result", async (t) => {
  const { request, fetchMock, writes, pending } = setup(t);
  fetchMock.mock.mockImplementation(async (url, options) => {
    assert.equal(new URL(url).hostname, "ec.europa.eu");
    assert.equal(options.method, "POST");
    assert.match(options.body, /<urn:countryCode>PT<\/urn:countryCode>/);
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(soap("true", "env"));
  });
  const response = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), result);
  await Promise.all(pending);
  assert.deepEqual(writes, [
    ["PT515486817", JSON.stringify(result), { expirationTtl: 86400 }],
  ]);
});

test("invalid cached values are refreshed", async (t) => {
  const { request, fetchMock } = setup(t, { ...result, status: "false" });
  fetchMock.mock.mockImplementation(async () => new Response(soap("false")));
  assert.deepEqual(await (await request()).json(), {
    ...result,
    status: false,
  });
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("accepts XI numbers without sending GB to VIES", async (t) => {
  const { env, request, fetchMock } = setup(t);
  env.vatKV.get = async () => null;
  fetchMock.mock.mockImplementation(async (_, options) => {
    assert.match(options.body, /<urn:countryCode>XI<\/urn:countryCode>/);
    return new Response(
      soap().replace(">PT<", ">XI<").replace("515486817", "980780684"),
    );
  });
  assert.deepEqual(await (await request("/xi/980780684")).json(), {
    country: "XI",
    vat: "980780684",
    status: true,
  });
});

test("rejects upstream HTTP errors, SOAP faults, malformed or oversized XML", async (t) => {
  const { request, fetchMock, writes } = setup(t);
  const cases = [
    () => new Response("Unavailable", { status: 503 }),
    () =>
      new Response(
        "<Envelope><Body><Fault><faultstring>PRIVATE</faultstring></Fault></Body></Envelope>",
      ),
    () => new Response("<Envelope>"),
    () => new Response(soap("maybe")),
    () => new Response(soap().replace(">PT<", ">ES<")),
    () => new Response(soap().replace("515486817", "123456789")),
    () => new Response(`<!DOCTYPE Envelope>${soap()}`),
    () => new Response("x".repeat(65537)),
    () => {
      throw new Error("PRIVATE network details");
    },
  ];
  for (const makeResponse of cases) {
    fetchMock.mock.mockImplementation(async () => makeResponse());
    const response = await request();
    assert.equal(response.status, 502);
    assert.equal(await response.text(), "VIES service unavailable");
  }
  assert.equal(writes.length, 0);
});

test("returns 429 before reading KV and forwards retry headers", async (t) => {
  const { env, request, fetchMock } = setup(t);
  env.COUNTER.get = () => ({
    fetch: async () =>
      new Response(null, {
        status: 429,
        headers: { "X-Rate-Limit-Remaining": "0", "Retry-After": "25" },
      }),
  });
  env.vatKV.get = () => assert.fail("Rate-limited request reached KV");
  const response = await request();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "25");
  assert.equal(response.headers.get("X-Rate-Limit-Remaining"), "0");
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("internal failures return 500 without leaking details", async (t) => {
  const { env, request } = setup(t);
  env.vatKV.get = async () => {
    throw new Error("PRIVATE database details");
  };
  const response = await request();
  assert.equal(response.status, 500);
  assert.equal(await response.text(), "Internal Server Error");
});

test("cache write failures do not discard a successful validation", async (t) => {
  const { env, request, fetchMock, pending } = setup(t);
  env.vatKV.put = async () => {
    throw new Error("Unavailable");
  };
  fetchMock.mock.mockImplementation(async () => new Response(soap()));
  assert.deepEqual(await (await request()).json(), result);
  await Promise.all(pending);
});
