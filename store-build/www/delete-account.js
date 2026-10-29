/* Meal Prep · /delete-account page logic (design section 7).
   The page is dormant gated like the app: while the accounts config
   slot is empty, the words and the written request route are the
   whole page, and the sign in route stays off. With the config
   filled, the sign in route runs the IDENTICAL deletion path as the
   in app door: MP_ACCOUNTS.deleteAccountFlow, a fresh sign in check
   first, the sweep second, the sign in record deleted last. Nothing
   on this page can delete anything without that check passing. */
(function () {
  "use strict";
  var cfg = window.MP_ACCOUNTS_CONFIG;
  var A = window.MP_ACCOUNTS;
  var box = document.getElementById("delWebBox");
  if (!box) return;
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  if (!cfg || !cfg.isEnabled() || !window.MP_AUTH) {
    box.innerHTML = "<p>Sign in deletion is not switched on in this build yet. Way two below works today: write to us, and we will delete your account after the identity checks.</p>";
    return;
  }
  var provider = window.MP_AUTH.useFirebase(cfg);
  var storePromise = provider.store();
  var done = false;
  var STEP_WORDS = { familyMembers: "your family", pantryItems: "your groceries", planDays: "your planned days", customRecipes: "your recipes", shoppingExtras: "your shopping extras", shoppingItemState: "your shopping list marks", importedEvents: "your imported events", imports: "your import records", recoveredItems: "your recovered items", tier: "your plan record", profile: "your profile" };

  function renderDoors(msg) {
    if (done) return;
    box.innerHTML = "<div class='delDoors'>" +
      "<div class='row'><button class='primaryBtn' id='dwGoogle'>Continue with Google</button>" +
      "<button class='primaryBtn' id='dwApple'>Continue with Apple</button></div>" +
      "<label>Email<input id='dwEmail' type='email' autocomplete='email' placeholder='you@example.com'></label>" +
      "<label>Password<input id='dwPw' type='password' autocomplete='current-password' placeholder='Your password'></label>" +
      "<div class='row'><button class='primaryBtn' id='dwEmailGo'>Sign in with email</button></div>" +
      "<p class='hint' id='dwMsg'>" + (msg ? " " + esc(msg) : "") + "</p></div>";
    document.getElementById("dwGoogle").addEventListener("click", function () { door(window.MP_AUTH.signInGoogle()); });
    document.getElementById("dwApple").addEventListener("click", function () { door(window.MP_AUTH.signInApple()); });
    document.getElementById("dwEmailGo").addEventListener("click", function () {
      var em = document.getElementById("dwEmail").value.trim();
      var pw = document.getElementById("dwPw").value;
      if (!em || !pw) { document.getElementById("dwMsg").textContent = " Type your email and password first."; return; }
      door(window.MP_AUTH.signInEmail(em, pw));
    });
  }
  function door(p) {
    var m = document.getElementById("dwMsg");
    if (m) m.textContent = " Opening the door.";
    p.then(function () {}, function (err) {
      var m2 = document.getElementById("dwMsg");
      if (m2) m2.textContent = " " + String(err && err.message || err);
    });
  }
  function renderConfirm(user) {
    var kind = window.MP_AUTH.reauthKind(user);
    var html = "<p>You are signed in as <strong>" + esc(user.email || "your account") + "</strong>.</p>" +
      "<p>Deleting is forever. Once it runs, your account and everything in it are gone, and nobody can bring them back.</p>";
    if (kind === "password") {
      html += "<label>Your password<input id='dwRePw' type='password' autocomplete='current-password' placeholder='Your password'></label>" +
        "<p>Type your password to prove this account is yours. Nothing is deleted until this check passes.</p>";
    } else {
      html += "<p>You will confirm with " + (kind === "apple" ? "Apple" : "Google") + " to prove this account is yours. Nothing is deleted until this check passes.</p>";
    }
    html += "<div class='row'><button class='pillBtn danger' id='dwGo'>Yes, delete my account forever</button>" +
      "<button class='pillBtn' id='dwOut'>Sign out</button></div>" +
      "<p class='hint' id='dwMsg2'></p>";
    box.innerHTML = html;
    document.getElementById("dwOut").addEventListener("click", function () { window.MP_AUTH.signOut().then(function () {}, function () {}); });
    document.getElementById("dwGo").addEventListener("click", function () { runDeletion(user, kind).catch(function () {}); });
  }
  function runDeletion(user, kind) {
    var msg = document.getElementById("dwMsg2");
    var pw = "";
    if (kind === "password") {
      var f = document.getElementById("dwRePw");
      pw = f ? f.value : "";
      if (!pw) { if (msg) msg.textContent = " Type your password first."; return Promise.resolve(); }
    }
    if (msg) msg.textContent = " Checking it is you, then deleting. This can take a moment.";
    return storePromise.then(function (store) {
      return A.deleteAccountFlow(store, user.uid, {
        reauth: function () { return window.MP_AUTH.reauthFor(user, pw); },
        deleteAuthUser: function () { return window.MP_AUTH.deleteCurrentUser(); }
      });
    }).then(function (res) {
      if (!res.ok) {
        if (msg) {
          if (res.stage === "reauth") msg.textContent = " The sign in check did not pass, so nothing was deleted. Check your password and try again.";
          else if (res.stage === "authUser") msg.textContent = " Your data is deleted, but the sign in record could not be removed. Sign in again and run the deletion once more to finish.";
          else msg.textContent = " Deleting stopped at " + (STEP_WORDS[res.stage] || "one step") + ". Everything before that step is gone; the rest is still in your account. Run the deletion again to finish.";
        }
        return;
      }
      done = true;
      box.innerHTML = "<h2>Your account is deleted</h2><p>Everything in it is gone. Thank you for using Meal Prep.</p>";
      return window.MP_AUTH.signOut().then(function () {}, function () {});
    }, function () {
      if (msg) msg.textContent = " Deleting did not finish. Your account is still here. Try again when the connection is better.";
    });
  }
  window.MP_AUTH.onChange(function (user) {
    if (done) return;
    if (!user || user.isAnonymous) renderDoors("");
    else renderConfirm(user);
  });
})();
