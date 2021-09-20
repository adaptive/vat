# VAT VIES API

Simple API to validate VAT numbers. Cloudflare Workers and Cloudflare KV to offload the official European Union API. This solution guarantees that within 24 hours, only one request per unique VAT number to EU servers. SOAP conversion to JSON. VAT numbers are format validated before calling VIES API to check deductibility status.
[Demo Pages](https://vat.pages.dev/) [Demo API](https://vat.adaptive.workers.dev/)


## 🛠️ Usage

```http
GET /:country/:number
```

## 🥰 [Cloudflare Workers®](https://workers.cloudflare.com/)
> Cloudflare Workers provides a serverless execution environment that allows you to create entirely new applications or augment existing ones without configuring or maintaining infrastructure.

## 🥰 [Cloudflare Developer Summer Challenge](https://challenge.developers.cloudflare.com/)

- [x] Cloudflare Workers
- [x] Cloudflare KV
- [x] Cloudflare Pages
- [ ] Durable Objects (TODO)