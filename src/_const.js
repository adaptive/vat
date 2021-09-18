export const countries = [
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
  "xi"
];

export const mime = {
  html: "text/html",
  js: "application/javascript",
  json: "application/json",
  xml: "application/xml",
  txt: "text/plain"
};

export const welcome = `VAT Status Validation - VIES Relay API
Validation across the European Union
AT BE BG CY CZ DE DK EE EL ES FI FR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK XI


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
