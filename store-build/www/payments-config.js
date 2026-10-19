/* Meal Prep payments: the rails slot (payments build, items 58 + 62;
   filled by the enabling build, app v47).
   This file is the ONE place the app's payment rails are named, the
   same pattern as accounts-config.js for the Firebase project.
   The values are public identifiers, not secrets: a publishable key
   is printed in every checkout page by design, a public SDK key is
   shipped in every app that carries the subscription brain, and the
   product ids are catalogue names. The real locks live server side
   (the stores' own signing, the subscription brain's receipt checks).

   FILLED (app v47, Finance's RevenueCat call, 19 Oct): the brain's
   project stands (Meal Prep, project cd867e55), its App Store app
   is attached (bundle com.ilseplacencia.mealprep, Apple only: no
   Play app stands in the project, so no Play side config belongs
   in this build), the two Plus products stand created in the brain
   and in the store under the chapter's canonical ids, attached to
   the plus entitlement, and Finance read the App Store app's
   public SDK key from the project's API keys page and filled it
   below. The app door is live on this config: the subscription
   brain key plus the two product ids are its whole slot.
   The Stripe slot is the WEB lane's own: it fills at the web
   sitting and never gates the app door.
   Family is NOT here: it is sold only once its extras are built
   (PRICING.md), and the paywall offers Plus only until then. */
(function (global) {
  "use strict";
  var config = {
    /* The subscription brain's public SDK key (RevenueCat is the one
       brain, Ilse's rails ruling 15 Oct: Apple IAP + Google Play
       Billing inside the apps, Stripe on the web, RevenueCat over
       all of it). The App Store app's key, filled by Finance's call
       (19 Oct) from the project's API keys page. */
    revenueCatApiKey: "appl_tDaGYsYJZOtWpZcFwVPhQJSXQEA",
    /* Stripe publishable key, for the web road. The web lane's own
       slot: filled at the web sitting; the app door below does not
       wait for it. */
    stripePublishableKey: "",
    /* The Plus products in the brain's catalogue, by their store
       product ids (PAYMENTS-CHAPTER-PLAN section 2 + RC-MAPPING:
       the one id convention across store and brain alike). */
    products: {
      plusMonthly: "mealprep_plus_monthly",
      plusYearly: "mealprep_plus_yearly"
    }
  };
  /* The app door is live when its own slot is filled: the brain's
     key plus both Plus products. Anything less and the purchase
     road sleeps (the dormant answers in payments.js), while the
     entitlement read stands on the server record alone either way. */
  config.isEnabled = function () {
    return typeof config.revenueCatApiKey === "string" && config.revenueCatApiKey !== "" &&
      !!config.products &&
      typeof config.products.plusMonthly === "string" && config.products.plusMonthly !== "" &&
      typeof config.products.plusYearly === "string" && config.products.plusYearly !== "";
  };
  if (typeof module !== "undefined" && module.exports) module.exports = config;
  global.MP_PAYMENTS_CONFIG = config;
})(typeof window !== "undefined" ? window : globalThis);
