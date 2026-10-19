/* Meal Prep payments (payments build, inventory items 58 + 62;
   the real provider landed by the enabling build, app v47):
   the client wiring for the rails Ilse accepted on 15 Oct: Apple
   IAP + Google Play Billing inside the apps, Stripe on the web,
   RevenueCat as the one subscription brain.

   THE ENTITLEMENT: since the enabling build, NO local opinion
   opens a paid feature. The server entitlement record is the
   sole authority (account-sync reads it on the sign-in
   resolution path; HQ's fence, app v47): this module's cached
   opinion below answers only its own buy flow's receipt and
   the restore return, and account-sync never asks it.

   THE PROVIDER (app v47): RevenueCat-shaped (getCustomerInfo /
   purchasePackage / restorePurchases). The real provider stands
   installed the first time an entry point runs live inside the
   package, where its plugin stands on the bundled bridge (the
   v39 doors' idiom: window.Capacitor.Plugins.Purchases, class
   PurchasesPlugin, in the packaged census). It configures with
   the config's key and the signed in account's id (the app user
   id is the app's own account id, RC-MAPPING), buys the package
   the Current offering holds for the mapped product, and restores
   through the brain. The stub below stays as the fallback wherever
   the native bridge does not stand (the open web until the web
   lane's own sitting, the test rig): its dormant answers keep the
   exact shape the app was proven on.
   A purchase answer is normalised at the seam: dormant (the rails
   cannot run here), cancelled (the person changed their mind at
   the store sheet), error (the purchase did not go through); none
   of them fakes a purchase.

   THE FREE MONTH is the app's own mechanism (PAYMENTS-CHAPTER
   section 2), granted in app from the account's age: it is never
   a store introductory offer (forbidden fleet wide, forever), so
   the purchase below is always the plain package at the plain
   price, no offer attached or requested.

   THE TRY ROAD: app.js asks tryPlus() when the popup's Try is
   tapped. A dormant answer keeps today's honest route to the Plans
   card, whose priced on-sale statement ships beside the offer
   (Finance's inseparability condition, UPGRADE-COPY.md). */
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

  /* The RevenueCat provider (app v47). It reads the plugin off the
     bundled bridge at call time and normalises the bridge's answers
     to the seam's: getCustomerInfo and restorePurchases arrive
     wrapped ({ customerInfo }) and are unwrapped here; a purchase
     finds its package whole in the Current offering (the bridge's
     purchasePackage takes the package, never a bare product id); a
     change of mind answers { cancelled: true }; any other failure
     answers { error }. */
  var appUserId = null;       /* the signed in account's id, once known */
  var rcConfiguredFor = null; /* the id configure last ran with; null = not yet */
  function nativePurchases() {
    var cap = global.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== "function") return null;
    var on = false;
    try { on = !!cap.isNativePlatform(); } catch (e) { on = false; }
    if (!on) return null;
    var p = (cap.Plugins || {}).Purchases;
    if (!p || typeof p.configure !== "function" || typeof p.getCustomerInfo !== "function" ||
        typeof p.purchasePackage !== "function" || typeof p.restorePurchases !== "function") return null;
    return p;
  }
  function rcErrText(e) { return String((e && e.message) || e || "The purchase did not go through."); }
  function rcCancelled(e) {
    if (e && (e.userCancelled === true || (e.data && e.data.userCancelled === true))) return true;
    return /cancel/i.test(rcErrText(e));
  }
  function rcEnsureConfigured(P) {
    if (rcConfiguredFor === null) {
      var opts = { apiKey: cfg.revenueCatApiKey };
      if (appUserId) opts.appUserID = appUserId;
      return Promise.resolve(P.configure(opts)).then(function () { rcConfiguredFor = appUserId || ""; });
    }
    if (appUserId && rcConfiguredFor !== appUserId && typeof P.logIn === "function") {
      return Promise.resolve(P.logIn({ appUserID: appUserId })).then(function () { rcConfiguredFor = appUserId; });
    }
    return Promise.resolve();
  }
  var rcProvider = {
    name: "revenuecat",
    getCustomerInfo: function () {
      var P = nativePurchases();
      if (!P) return Promise.resolve({ dormant: true });
      return rcEnsureConfigured(P).then(function () { return P.getCustomerInfo(); })
        .then(function (r) { return (r && r.customerInfo) || r || {}; });
    },
    purchasePackage: function (what) {
      var P = nativePurchases();
      if (!P) return Promise.resolve({ dormant: true });
      var productId = what && what.productId;
      return rcEnsureConfigured(P).then(function () { return P.getOfferings(); }).then(function (offerings) {
        var cur = offerings && offerings.current;
        var pkgs = (cur && cur.availablePackages) || [];
        var found = null;
        for (var i = 0; i < pkgs.length; i++) {
          var prod = pkgs[i] && pkgs[i].product;
          if (prod && prod.identifier === productId) { found = pkgs[i]; break; }
        }
        if (!found) return { error: "That plan is not in the offering right now." };
        /* The plain package at the plain price: no introductory
           offer is attached or requested, ever (the free month is
           the app's own in app mechanism, chapter section 2). */
        return P.purchasePackage({ aPackage: found }).then(function () { return { purchased: true }; }, function (e) {
          if (rcCancelled(e)) return { cancelled: true };
          return { error: rcErrText(e) };
        });
      }).then(null, function (e) { return { error: rcErrText(e) }; });
    },
    restorePurchases: function () {
      var P = nativePurchases();
      if (!P) return Promise.resolve({ dormant: true });
      return rcEnsureConfigured(P).then(function () { return P.restorePurchases(); })
        .then(function (r) { return (r && r.customerInfo) || r || {}; });
    }
  };

  var provider = stubProvider;
  var opinion = null; /* the cached opinion: null = no opinion held */

  function enabled() {
    return !!(cfg && typeof cfg.isEnabled === "function" && cfg.isEnabled());
  }
  /* The install is lazy and native gated: the first live entry
     point inside the package swaps the stub for the real provider;
     everywhere else the stub's dormant answers stand. */
  function installNative() {
    if (provider !== stubProvider) return;
    if (nativePurchases()) api.useProvider(rcProvider);
  }

  /* The provider's cached opinion. Since the enabling build no
     gate consumes it (the server record is the sole authority);
     it answers the buy flow's own receipt and nothing more.
     Disabled config: null, always. Live: the last refreshed
     opinion. */
  function entitlementOpinion() {
    return enabled() ? opinion : null;
  }

  /* Refresh the opinion from the provider, and hand the provider
     the account it is reading for (the sign-in path passes the
     uid; the app user id in the brain is that same id). Disabled:
     clears to no opinion and resolves at once: no provider call,
     no network. Live: one getCustomerInfo read; "pro" when the
     Plus entitlement is active, "free" when the provider answered
     and it is not. A dormant answer (no bridge where this copy
     runs) and a failed read both keep the last opinion (fail
     quiet: a blip never locks a paying user out mid-session). */
  function refresh(uid) {
    if (typeof uid === "string" && uid !== "") appUserId = uid;
    if (!enabled()) { opinion = null; return Promise.resolve(null); }
    installNative();
    return provider.getCustomerInfo().then(function (info) {
      if (info && info.dormant) return opinion;
      var active = (info && info.entitlements && info.entitlements.active) || {};
      opinion = active[PLUS_ENTITLEMENT] ? "pro" : "free";
      return opinion;
    }).catch(function () { return opinion; });
  }

  /* What the popup's Try starts. Disabled: { dormant: true } and
     the Plans card route stands. Live: the purchase of the Plus
     product the period names; a completed purchase refreshes the
     opinion so the buy flow can report it. A provider answer of
     dormant, cancelled or error passes through untouched, so a
     copy that cannot run the rails falls back to the honest route
     rather than faking a checkout. */
  function tryPlus(want, period) {
    if (!enabled()) return Promise.resolve({ dormant: true });
    installNative();
    var productId = period === "year" ? cfg.products.plusYearly : cfg.products.plusMonthly;
    return provider.purchasePackage({ productId: productId, want: want || null }).then(function (r) {
      if (r && (r.dormant || r.cancelled || r.error)) return r;
      return refresh().then(function () { return { purchased: opinion === "pro" }; });
    });
  }

  function restore() {
    if (!enabled()) return Promise.resolve({ dormant: true });
    installNative();
    return provider.restorePurchases().then(function (r) {
      if (r && r.dormant) return r;
      return refresh();
    });
  }

  var api = {
    enabled: enabled,
    entitlementOpinion: entitlementOpinion,
    refresh: refresh,
    tryPlus: tryPlus,
    restore: restore,
    PLUS_ENTITLEMENT: PLUS_ENTITLEMENT,
    providerName: function () { return provider.name; },
    /* The swap point, named so a provider lands in exactly one
       place (the native install above uses it too). */
    useProvider: function (p) {
      if (p && typeof p.getCustomerInfo === "function" &&
        typeof p.purchasePackage === "function" &&
        typeof p.restorePurchases === "function") provider = p;
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.MP_PAYMENTS = api;
})(typeof window !== "undefined" ? window : globalThis);
