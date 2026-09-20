import assert from "node:assert/strict";
import { test } from "node:test";
import { Counter } from "../src/counter.mjs";

function createCounter() {
  const data = new Map();
  let queue = Promise.resolve();
  const storage = {
    async get(key) {
      return structuredClone(data.get(key));
    },
    async put(key, value) {
      data.set(key, structuredClone(value));
    },
    async delete(key) {
      return data.delete(key);
    },
    async setAlarm(time) {
      storage.alarm = time;
    },
    transaction(callback) {
      const result = queue.then(() => callback(storage));
      queue = result.catch(() => {});
      return result;
    },
  };
  return { counter: new Counter({ storage }), storage };
}

test("allows exactly 60 requests, then continues rejecting at zero", async () => {
  const { counter } = createCounter();
  const responses = await Promise.all(
    Array.from({ length: 65 }, () => counter.fetch()),
  );
  assert.equal(responses.filter((r) => r.status === 200).length, 60);
  assert.equal(responses.filter((r) => r.status === 429).length, 5);
  assert.equal(responses[59].headers.get("X-Rate-Limit-Remaining"), "0");
  assert.equal(responses[60].headers.get("X-Rate-Limit-Remaining"), "0");
  assert.ok(Number(responses[60].headers.get("Retry-After")) > 0);
});

test("persists the limit across object recreation and resets at the boundary", async (t) => {
  let now = 100_000;
  t.mock.method(Date, "now", () => now);
  const { counter, storage } = createCounter();
  await counter.fetch();
  assert.equal(storage.alarm, 160_000);
  const recreated = new Counter({ storage });
  assert.equal(
    (await recreated.fetch()).headers.get("X-Rate-Limit-Remaining"),
    "58",
  );
  now = 160_000;
  assert.equal(
    (await recreated.fetch()).headers.get("X-Rate-Limit-Remaining"),
    "59",
  );
  assert.equal(storage.alarm, 220_000);
  await recreated.alarm();
  assert.ok(
    await storage.get("window"),
    "Delayed alarm removed the new window",
  );
  now = 220_000;
  await recreated.alarm();
  assert.equal(await storage.get("window"), undefined);
});

test("separate client objects have independent limits", async () => {
  const first = createCounter().counter;
  const second = createCounter().counter;
  for (let i = 0; i < 60; i++) await first.fetch();
  assert.equal((await first.fetch()).status, 429);
  assert.equal((await second.fetch()).status, 200);
});
