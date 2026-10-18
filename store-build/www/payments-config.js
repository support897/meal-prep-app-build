/* Meal Prep payments: the rails slot (payments build, items 58 + 62).
   This file is the ONE place the app's payment rails are named, the
   same pattern as accounts-config.js for the Firebase project.
   The values are public identifiers, not secrets: a publishable key
   is printed in every checkout page by design, a public SDK key is
   shipped in every app that carries the subscription brain, and the
   product ids are catalogue names. The real locks live server side
   (the stores' own signing, the subscription brain's receipt checks).

   Payments are live only when every slot is filled (the isEnabled
   check below carries that rule). Until Ilse's Paid Apps sitting
   fills them, the whole payments layer sleeps: no provider is
   created, no purchase is offered, no network call is made, and the
   app behaves exactly as the pre-payments build: the popup's Try
   lands on the Plans card and the card's plain disclosure ships
   beside the offer (UPGRADE-COPY.md; Finance's condition of record
   holds the two inseparable in every build). */
(function (global) {
  "use strict";
  var config = {
    /* The subscription brain's public SDK key (RevenueCat is the one
       brain, Ilse's rails ruling 15 Oct: Apple IAP + Google Play
       Billing inside the apps, Stripe on the web, RevenueCat over
       all of it). Filled at the Paid Apps sitting. */
    revenueCatApiKey: "",
    /* Stripe publishable key, for the web road. Filled at the same
       sitting. */
    stripePublishableKey: "",
    /* The Plus products in the brain's catalogue, by their store
       product ids. Family is NOT here: it is sold only once its
       extras are built (PRICING.md), and the paywall offers Plus
       only until then. */
    products: {
      plusMonthly: "",
      plusYearly: ""
    }
  };
  /* Payments are live only when the slot is fully filled. Anything
     less and the whole layer sleeps. */
  config.isEnabled = function () {
    return typeof config.revenueCatApiKey === "string" && config.revenueCatApiKey !== "" &&
      typeof config.stripePublishableKey === "string" && config.stripePublishableKey !== "" &&
      !!config.products &&
      typeof config.products.plusMonthly === "string" && config.products.plusMonthly !== "" &&
      typeof config.products.plusYearly === "string" && config.products.plusYearly !== "";
  };
  if (typeof module !== "undefined" && module.exports) module.exports = config;
  global.MP_PAYMENTS_CONFIG = config;
})(typeof window !== "undefined" ? window : globalThis);
