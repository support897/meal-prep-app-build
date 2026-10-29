/* Meal Prep prices table (inventory item 62): the ONE place prices
   live as data. The popup's offer line and the Plans card carry price
   TOKENS ({plusMonthly} and friends) in the language table; lang.js
   fills them from the active row of this table at render time, so no
   price is ever written into copy again.

   Row shape: Finance's country build of record (160 fixed per
   currency prices, locked 15 Oct) drops one row per currency into
   ROWS and nothing else changes: the templates, the renderer and
   the gates above all read rows, never numbers.

     code             the ISO currency code, also the row's key
     plusMonthly      Plus for one month, formatted in that currency
     plusYearly       Plus for one year, formatted
     familyMonthly    Family for one month, formatted
     familyYearly     Family for one year, formatted
     worthPlusMonthly the A$ worth of plusMonthly as a beside note
                      WITH its leading space, e.g. " (about A$7.60)":
                      her pricing law shows the A$ worth beside every
                      price. EMPTY in the AUD row, where the price
                      already IS the A$ worth.
     worthPlusYearly, worthFamilyMonthly, worthFamilyYearly: the same

   Prices are fixed per currency and are never converted at runtime.
   The AUD row below is filled from the locked prices of record
   (PRICING.md: Plus A$6.99/mo, A$49.99/yr; Family A$9.99/mo,
   A$79.99/yr, sold only once its extras are built). The active row
   is the device currency when a row exists for it, else AUD. */
(function (global) {
  "use strict";
  var ROWS = {
    AUD: {
      code: "AUD",
      plusMonthly: "A$6.99",
      plusYearly: "A$49.99",
      familyMonthly: "A$9.99",
      familyYearly: "A$79.99",
      worthPlusMonthly: "",
      worthPlusYearly: "",
      worthFamilyMonthly: "",
      worthFamilyYearly: ""
    }
  };
  var FALLBACK = "AUD";
  var TOKENS = ["plusMonthly", "plusYearly", "familyMonthly", "familyYearly",
    "worthPlusMonthly", "worthPlusYearly", "worthFamilyMonthly", "worthFamilyYearly"];

  function deviceCurrency() {
    try {
      var c = new Intl.NumberFormat().resolvedOptions().currency;
      return typeof c === "string" ? c.toUpperCase() : "";
    } catch (e) { return ""; }
  }
  function activeCode() {
    var c = deviceCurrency();
    return ROWS[c] ? c : FALLBACK;
  }
  function active() { return ROWS[activeCode()]; }

  /* fill(text): swap the price tokens in a language string for the
     active row's values. Tokens this table does not own (a person's
     {name}, a recipe's {food}) are left exactly as they are. */
  function fill(text) {
    if (typeof text !== "string") return text;
    var row = active();
    if (!row) return text;
    return text.replace(/\{([a-zA-Z]+)\}/g, function (m, name) {
      return TOKENS.indexOf(name) !== -1 && row[name] != null ? String(row[name]) : m;
    });
  }

  var api = {
    ROWS: ROWS,
    FALLBACK: FALLBACK,
    TOKENS: TOKENS,
    deviceCurrency: deviceCurrency,
    activeCode: activeCode,
    active: active,
    fill: fill
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.MP_PRICES = api;
})(typeof window !== "undefined" ? window : globalThis);
