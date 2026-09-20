import { RATE_LIMIT, RATE_PERIOD_SECONDS } from "./_const.mjs";

// Retain the existing Counter class and KV storage backend for deployed objects.
export class Counter {
  constructor(state) {
    this.state = state;
  }

  async fetch() {
    const result = await this.state.storage.transaction(async (storage) => {
      const now = Date.now();
      let window = await storage.get("window");
      if (!window || now >= window.resetAt) {
        window = {
          remaining: RATE_LIMIT,
          resetAt: now + RATE_PERIOD_SECONDS * 1000,
        };
        await storage.setAlarm(window.resetAt);
      }
      const allowed = window.remaining > 0;
      if (allowed) {
        window.remaining -= 1;
        await storage.put("window", window);
      }
      return { ...window, allowed };
    });

    const headers = {
      "X-Rate-Limit-Limit": String(RATE_LIMIT),
      "X-Rate-Limit-Remaining": String(result.remaining),
      "X-Rate-Limit-Period-Seconds": String(RATE_PERIOD_SECONDS),
      "Cache-Control": "no-store",
    };
    if (!result.allowed) {
      headers["Retry-After"] = String(
        Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)),
      );
    }
    return new Response(null, { status: result.allowed ? 200 : 429, headers });
  }

  async alarm() {
    // A delayed alarm must not delete a window opened by a newer request.
    await this.state.storage.transaction(async (storage) => {
      const window = await storage.get("window");
      if (window && window.resetAt <= Date.now())
        await storage.delete("window");
    });
  }
}
