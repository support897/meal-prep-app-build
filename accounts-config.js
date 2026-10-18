/* Meal Prep accounts: the Firebase project slot (app v23, accounts wave).
   This file is the ONE place the app's Firebase project is named.
   The three values below (the project id, the web apiKey and the auth
   domain from that project's console) are identifiers, not secrets:
   the Security Rules are the lock. The accounts layer is live only
   when all three values are present; if any one is missing, the whole
   layer sleeps and the app runs guest-only (the isEnabled check below
   carries that rule). Either way, guest mode stays forever (design
   MULTI-USER-DESIGN.md): sign in is offered, never forced. */
(function (global) {
  "use strict";
  var config = {
    /* Meal Prep production project (filled at Layer 2, 15 Oct 2026). */
    projectId: "meal-prep-c8bf7",
    /* Meal Prep production project (filled at Layer 2, 15 Oct 2026). */
    apiKey: "AIzaSyCE5H9dDC2zM8YiqA7vqufXGzhQoqt1Cuc",
    /* Meal Prep production project (filled at Layer 2, 15 Oct 2026). */
    authDomain: "meal-prep-c8bf7.firebaseapp.com"
  };
  /* Accounts are live only when the slot is fully filled. Anything less
     and the whole wave sleeps: no doors render, no SDK loads, no network. */
  config.isEnabled = function () {
    return typeof config.projectId === "string" && config.projectId !== "" &&
      typeof config.apiKey === "string" && config.apiKey !== "" &&
      typeof config.authDomain === "string" && config.authDomain !== "";
  };
  if (typeof module !== "undefined" && module.exports) module.exports = config;
  global.MP_ACCOUNTS_CONFIG = config;
})(typeof window !== "undefined" ? window : globalThis);
