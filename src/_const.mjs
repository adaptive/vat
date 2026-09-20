export const allowed = [
  "at",
  "be",
  "bg",
  "cy",
  "cz",
  "de",
  "dk",
  "ee",
  "el",
  "es",
  "fi",
  "fr",
  "hr",
  "hu",
  "ie",
  "it",
  "lt",
  "lu",
  "lv",
  "mt",
  "nl",
  "pl",
  "pt",
  "ro",
  "se",
  "si",
  "sk",
  "xi",
];

export const VERSION = "0.1.4";
export const CACHE_TTL_SECONDS = 86_400;
export const RATE_LIMIT = 60;
export const RATE_PERIOD_SECONDS = 60;

export const welcome = `VAT Status Validation - VIES Relay API
Validation across the European Union
AT BE BG CY CZ DE DK EE EL ES FI FR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK XI

API Limits:
To avoid abuse each IP address is rate limited at ${RATE_LIMIT} requests/${RATE_PERIOD_SECONDS} seconds. Header X-Rate-Limit-Remaining tells you the amount of requests left per period.

Usage:
Request
  GET /:country/:number

Examples:
- Request
    GET /es/W0184081H

  Response
    application/json
    {"country":"ES","vat":"W0184081H","status":true}

- Request
    GET /pt/515486817

  Response
    application/json
    {"country":"PT","vat":"515486817","status":true}
    
repo: https://github.com/adaptive/vat`;
