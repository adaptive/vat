# VAT VIES API

A Cloudflare Worker that validates VAT number formats, queries the EU's VIES SOAP service, and returns JSON. Successful lookups (including `status: false`) are cached in Workers KV for 24 hours.

[Demo pages](https://vat.pages.dev/) · [Demo API](https://vat.adaptive.workers.dev/)

## Usage

```http
GET /:country/:number
```

```sh
curl https://vat.adaptive.workers.dev/pt/515486817
```

```json
{ "country": "PT", "vat": "515486817", "status": true }
```

Country codes and VAT numbers are case-insensitive. Supply the number without its country prefix, spaces, or punctuation. Use `EL` for Greece and `XI` for Northern Ireland. `GET /` returns usage information.

The API permits 60 GET requests per IP address in a 60-second window, including cached lookups and invalid routes. Responses include `X-Rate-Limit-Limit`, `X-Rate-Limit-Remaining`, and `X-Rate-Limit-Period-Seconds`. A rejected request returns `429` with `Retry-After` in seconds. Local requests without `CF-Connecting-IP` share one bucket.

| Status | Meaning                                          |
| ------ | ------------------------------------------------ |
| `200`  | Lookup completed, or usage information at `/`    |
| `400`  | Unsupported country or invalid VAT number        |
| `404`  | Unknown or malformed route                       |
| `405`  | Unsupported HTTP method; use GET                 |
| `429`  | Rate limit reached                               |
| `500`  | Internal service failure                         |
| `502`  | VIES unavailable or returned an invalid response |
| `504`  | VIES did not complete within 10 seconds          |

VIES failures are never cached as invalid VAT numbers. Responses use `Cache-Control: no-store` so shared HTTP caches do not replay another client's rate-limit headers. The 24-hour result cache lives in KV. KV is eventually consistent, so concurrent misses or requests in different locations can make multiple VIES calls; this is not a once-per-day guarantee.

## Development

Use Node.js 22 or newer; `.nvmrc` selects Node.js 24.

```sh
npm ci
npm run dev
```

Wrangler simulates KV and Durable Objects locally. Local development does not use production storage, but uncached valid VAT lookups still contact VIES.

```sh
npm test              # Offline regression tests using Node's built-in test runner
npm run build        # Validate and bundle into dist/ without deploying
npm run format       # Format source, tests, and configuration
npm run check        # Formatting check, tests, and build
```

Wrangler handles bundling and minification directly. Runtime dependencies are `fast-xml-parser` for SOAP parsing and `jsvat` for format/checksum validation. Northern Ireland uses jsvat's UK checks with the original `XI` code passed to VIES.

## Deployment

`wrangler.jsonc` retains this project's existing account, KV namespace, and `Counter` Durable Object binding. The `Counter` export declares `legacy-kv` storage to match the original deployment. Before updating an existing deployment, verify its storage backend matches; storage types cannot be switched in place. For a new deployment, set your own account and KV namespace IDs and change `exports.Counter.storage` to `sqlite`. See [Cloudflare's Durable Object exports documentation](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/).

```sh
npx wrangler login
npm run check
npm run deploy
```

Each IP now maps to its own Durable Object, so the first deployment of this update starts fresh rate-limit windows. Existing object storage is not deleted. Transactions protect concurrent increments, and alarms remove expired window records. The static documentation site remains in `_site/` for Cloudflare Pages.
