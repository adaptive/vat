import assert from "node:assert/strict";
import { test } from "node:test";
import { checkVies } from "../src/vies.mjs";

test("aborts a timed-out upstream fetch", async (t) => {
  let expire;
  t.mock.method(globalThis, "setTimeout", (callback) => {
    expire = callback;
    return 1;
  });
  const clear = t.mock.method(globalThis, "clearTimeout", () => {});
  t.mock.method(
    globalThis,
    "fetch",
    async (_, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  );
  const pending = checkVies("PT", "515486817");
  expire();
  await assert.rejects(pending, { status: 504 });
  assert.equal(clear.mock.callCount(), 1);
});

test("keeps the timeout active while reading the upstream body", async (t) => {
  let expire;
  let reading;
  const started = new Promise((resolve) => {
    reading = resolve;
  });
  t.mock.method(globalThis, "setTimeout", (callback) => {
    expire = callback;
    return 1;
  });
  t.mock.method(globalThis, "clearTimeout", () => {});
  t.mock.method(
    globalThis,
    "fetch",
    async (_, { signal }) =>
      new Response(
        new ReadableStream({
          start(controller) {
            signal.addEventListener(
              "abort",
              () => controller.error(signal.reason),
              { once: true },
            );
          },
          pull() {
            reading();
          },
        }),
      ),
  );
  const pending = checkVies("PT", "515486817");
  await started;
  expire();
  await assert.rejects(pending, { status: 504 });
});
