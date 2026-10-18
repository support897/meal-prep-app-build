/* Meal Prep payments (payments build, inventory items 58 + 62):
   the client wiring for the rails Ilse accepted on 15 Oct: Apple
   IAP + Google Play Billing inside the apps, Stripe on the web,
   RevenueCat as the one subscription brain. Built dormant, the
   accounts wave pattern: until payments-config.js is filled at the
   Paid Apps sitting, this module charges nothing, calls nothing
   and holds NO opinion about entitlement, so every surface
   behaves exactly as the pre-payments build.

   THE ENTITLEMENT SEAM: account-sync.js getEntitlement() asks
   entitlementOpinion() on every read, and a "pro" from either
   source wins (the union rule: a payments answer never downgrades
   a comped or tier user, and a payment never needs the tier's
   permission). Dormant, the opinion is null and the accounts
   answer stands untouched, byte for byte the v32 read.

   THE PROVIDER: RevenueCat-shaped (getCustomerInfo /
   purchasePackage / restorePurchases). The stub below is the
   dormant shape: it would answer an empty customer if it were ever
   called, and it never is, because every entry point below checks
   enabled() first. The sitting swaps the real provider in through
   useProvider() and fills the config + product ids. Nothing else
   in the app changes on that day.

   THE TRY ROAD: app.js asks tryPlus() when the popup's Try is
   tapped. Dormant, it resolves { dormant: true } WITHOUT touching
   the provider, and app.js keeps today's honest route to the Plans
   card, whose disclosure ships beside the offer (Finance's
   inseparability condition, UPGRADE-COPY.md). */
(function (global) {
  "use strict";
  var cfg = global.MP_PAYMENTS_CONFIG;

  /* The entitlement name the brain reports for Plus, agreed with
     the app's own word for the paid tier ("pro", as getEntitlement
     has resolved it since v32). */
  var PLUS_ENTITLEMENT = "plus";

  var stubProvider = {
    name: "stub",
    getCustomerInfo: function () {
      return Promise.resolve({ entitlements: { active: {} } });
    },
    purchasePackage: function () { return Promise.resolve({ dormant: true }); },
    restorePurchases: function () { return Promise.resolve({ dormant: true }); }
  };

  var provider = stubProvider;
  var opinion = null; /* the cached opinion: null = no opinion held */

  function enabled() {
    return !!(cfg && typeof cfg.isEnabled === "function" && cfg.isEnabled());
  }

  /* The seam's one question. Dormant: null, always, so the caller
     keeps today's answer exactly. Live: the last refreshed opinion. */
  function entitlementOpinion() {
    return enabled() ? opinion : null;
  }

  /* Refresh the opinion from the provider. Dormant: clears to no
     opinion and resolves at once: no provider call, no network.
     Live: one getCustomerInfo read; "pro" when the Plus entitlement
     is active, "free" when the provider answered and it is not. A
     failed read keeps the last opinion (fail quiet: a network blip
     never locks a paying user out mid-session). */
  function refresh() {
    if (!enabled()) { opinion = null; return Promise.resolve(null); }
    return provider.getCustomerInfo().then(function (info) {
      var active = (info && info.entitlements && info.entitlements.active) || {};
      opinion = active[PLUS_ENTITLEMENT] ? "pro" : "free";
      return opinion;
    }).catch(function () { return opinion; });
  }

  /* What the popup's Try starts. Dormant: { dormant: true } and the
     Plans card route stands. Live: the purchase of the Plus product
     the period names; a completed purchase refreshes the opinion so
     the gates open at once. A provider answer of dormant (the stub
     shape) passes through untouched, so even a mis-wired live build
     falls back to the honest route rather than faking a checkout. */
  function tryPlus(want, period) {
    if (!enabled()) return Promise.resolve({ dormant: true });
    var productId = period === "year" ? cfg.products.plusYearly : cfg.products.plusMonthly;
    return provider.purchasePackage({ productId: productId, want: want || null }).then(function (r) {
      if (r && r.dormant) return r;
      return refresh().then(function () { return { purchased: opinion === "pro" }; });
    });
  }

  function restore() {
    if (!enabled()) return Promise.resolve({ dormant: true });
    return provider.restorePurchases().then(function () { return refresh(); });
  }

  var api = {
    enabled: enabled,
    entitlementOpinion: entitlementOpinion,
    refresh: refresh,
    tryPlus: tryPlus,
    restore: restore,
    PLUS_ENTITLEMENT: PLUS_ENTITLEMENT,
    providerName: function () { return provider.name; },
    /* The sitting's swap point, named so the real provider lands in
       exactly one place. */
    useProvider: function (p) {
      if (p && typeof p.getCustomerInfo === "function" &&
        typeof p.purchasePackage === "function" &&
        typeof p.restorePurchases === "function") provider = p;
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.MP_PAYMENTS = api;
})(typeof window !== "undefined" ? window : globalThis);
