/* Meal Prep account sync (app v23, accounts wave): the browser glue.
   Wires MP_AUTH + the accounts.js engine + the app together.

   DORMANCY LAW: if the project slot in accounts-config.js is empty
   (the shipped state), this file does NOTHING at all — no provider is
   created, no listener is wired, no DOM changes, the Account card
   stays hidden, and the app behaves exactly as the guest only build.
   The hooks app.js calls (window.MP_ACCOUNT_HOOK) are only installed
   when accounts are live, so a dormant build never even calls in.

   When live: the app's own localStorage state stays the working
   copy. Sign in pulls the account, adopts it as the working copy
   (one reload), offers the one tap guest import when the gate says
   offer, and pushes changes back on a short debounce. Sign out
   snapshots the account copy to its per account cache key, restores
   the guest copy (or a fresh blank guest when the pot was consumed),
   and reloads. The server copy is never deleted by any of this. */
(function () {
  "use strict";
  var cfg = window.MP_ACCOUNTS_CONFIG;
  var A = window.MP_ACCOUNTS;
  window.MP_ACCOUNTS_ENABLED = !!(cfg && cfg.isEnabled());
  /* getEntitlement (v32) lets app.js read this session's resolved
     entitlement for the upgrade moment popup; it resolves fail
     closed ("free" until syncTier lands, and in dormant builds,
     where the accounts layer never runs, everyone is free). The
     session value it reads is resolved once at sign in: the tier
     (syncTier, from the comp record) joined by the entitlement
     record read (app v45: subscriptions/{uid}, system written
     only) on that same path in onUser below. This function itself
     never touches the store, so no feature render ever consults
     the record.
     SOLE AUTHORITY (app v47, HQ's fence, spoken for this build in
     v45): the session value is the whole answer. The transitional
     local-opinion seam that stood here in v45 and v46 is DELETED
     whole: from this build on, the server-owned records (the comp
     record behind syncTier; the entitlement record at
     subscriptions/{uid}) alone — present or absent — decide, and a
     local plan flag or a cached provider opinion opens nothing.
     The payments module is never consulted on this read. */
  window.MP_ACCOUNT_SYNC = { enabled: window.MP_ACCOUNTS_ENABLED, getEntitlement: function () {
    return typeof entitlement === "string" ? entitlement : "free";
  }, _doorFail: doorFail, _doorLineFor: doorLineFor, _demoLineFor: demoLineFor, getAccountAnchorMs: function () {
    /* The session's free month anchor (app v51): the signed in
       account's Auth creation stamp in milliseconds, or null when
       the Auth record carried none. It comes from the Auth record
       alone (accounts.js accountAnchorMs), never from the client
       writable Firestore createdAt field, so no reader of this
       value can be moved by the account owner. */
    return typeof sessionAnchorMs === "number" ? sessionAnchorMs : null;
  } };
  /* The door's credential code fence (app v33). It stands above
     the dormancy return (moved up in v42) so the door's error
     words resolve on any load and the suite can drive them
     through the hook above; the walk below reads the same fence
     at tap time, exactly as it always has. */
  var DOOR_CRED_CODES = { "auth/invalid-credential": true, "auth/wrong-password": true, "auth/user-not-found": true, "auth/invalid-login-credentials": true };
  if (!window.MP_ACCOUNTS_ENABLED) return;

  var L = window.MP_LOGIC, D = window.MP_DATA;
  /* Language (app v34): every word this layer renders routes
     through t() in lang.js, like the rest of the app. */
  var t = window.MP_LANG.t;
  var storage = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    remove: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  function nowIso() { return new Date().toISOString(); }
  function todayStr() { return nowIso().slice(0, 10); }
  function liveState() { try { return JSON.parse(storage.get(A.LIVE_KEY) || "null"); } catch (e) { return null; } }
  function setLive(stateObj) { storage.set(A.LIVE_KEY, JSON.stringify(stateObj)); }
  function blankState() { return L.blankState(); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function toast(msg) { var t = document.getElementById("toast"); if (t) { t.textContent = msg; t.classList.remove("hidden"); setTimeout(function () { t.classList.add("hidden"); }, 3200); } }

  var provider = window.MP_AUTH.useFirebase(cfg);
  /* The shared bounding helper (app v49): auth.js loads before
     this file and stands it on the global as MP_WAIT. Every cure
     below races through it; no bound is copied or re-invented
     here. */
  var WAIT = window.MP_WAIT;
  /* The boot watchdog's held state (app v49, U1): whether the
     first auth answer has landed, whether the watchdog had to
     land the door itself, and whether the person took the guest
     exit from that watchdog door. */
  var authAnswered = false, watchdogLanded = false, preAnswerGuestExit = false;
  var storePromise = provider.store();
  var device = A.readDevice(storage);
  var currentUser = null;
  var snapshot = null;        /* last synced documents for the signed in uid */
  var entitlement = "free";   /* this session's resolved entitlement */
  var sessionAnchorMs = null; /* the signed in account's Auth creation stamp (app v51); null = the record carried none */
  var pushTimer = null, pushPending = false, adopting = false, deleting = false;
  /* The door page's held state (app v33): which step is showing and
     the email carried from step one to step two. Memory only: the
     typed password lives in its field and nowhere else, and leaving
     the door (or signing out, which reloads) clears all three. */
  var doorStep = 1, doorEmail = "";

  function saveDevice() { device = A.writeDevice(storage, device); }

  /* ---------------- the Account card (Preferences) ---------------- */
  var card = document.getElementById("accountCard");
  var body = document.getElementById("accountBody");
  if (card) card.classList.remove("hidden");

  /* The signed out Account card (app v33): the sign up itself lives
     on the door page now (renderDoorStep1/2 below); the card keeps a
     quiet way back to it, plus the demo entries that have always
     lived here. */
  function renderSignedOut(msg) {
    if (!body) return;
    body.innerHTML =
      "<p class='hint'>" + t("account.signinHint") + "</p>" +
      "<div class='row'><button class='primaryBtn' id='accOpenDoor'>" + t("account.openDoor") + "</button></div>" +
      "<p class='hint' id='accMsg'>" + esc(msg || "") + "</p>" +
      "<h3>" + t("account.justLooking") + "</h3>" +
      "<p class='hint'>" + t("demo.exploreLine") + "</p>" +
      "<div class='row'><button class='pillBtn' id='accDemo'>" + t("demo.exploreBtn") + "</button></div>" +
      "<div class='grid2'><label>" + t("demo.codeLabel") + "<input id='accDemoCode' type='text' autocomplete='off' placeholder='" + t("demo.codePh") + "'></label></div>" +
      "<div class='row'><button class='pillBtn' id='accDemoCodeBtn'>" + t("demo.openWithCode") + "</button></div>";
    var fail = function (e) { var m = document.getElementById("accMsg"); if (m) m.textContent = " " + demoLineFor(e); };
    document.getElementById("accOpenDoor").addEventListener("click", function () { showDoorPage(); });
    document.getElementById("accDemo").addEventListener("click", function () { enterDemo(null).catch(fail); });
    document.getElementById("accDemoCodeBtn").addEventListener("click", function () {
      var code = document.getElementById("accDemoCode").value.trim();
      if (!code) { fail(new Error(t("demo.typeCode"))); return; }
      enterDemoCode(code).catch(fail);
    });
  }

  /* ---------------- the door page (app v33, the v4 shape) ----------
     A signed out user lands on a full first page holding ONLY the
     sign up, big and centred: the mark, the two provider doors as
     icon buttons, one email field and a big round next arrow.
     Nothing else: no password, no name, no plan, no mode switch.
     Step two swaps in on the same page: the email with a Change
     line, one password field with a show toggle, ONE Continue
     button and the caption that says what it does. The walk is
     settled: try sign in first; only a credential refusal earns a
     create attempt with the same pair; an already in use answer
     earns the SAME generic line as a wrong password, so the page
     never says whether an account exists; no other error ever
     triggers a create. Leaving the page clears the step, the held
     email and the typed password. */
  var GOOGLE_G = "<svg width='24' height='24' viewBox='0 0 48 48' aria-hidden='true'><path fill='#FFC107' d='M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34.3 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z'/><path fill='#FF3D00' d='M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34.3 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z'/><path fill='#4CAF50' d='M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z'/><path fill='#1976D2' d='M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z'/></svg>";
  var APPLE_G = "<svg width='23' height='23' viewBox='0 0 24 24' fill='#33231C' aria-hidden='true'><path d='M17.05 12.54c-.03-2.89 2.36-4.27 2.47-4.34-1.35-1.97-3.44-2.24-4.18-2.27-1.78-.18-3.47 1.05-4.37 1.05-.9 0-2.29-1.02-3.77-1-1.94.03-3.72 1.13-4.72 2.86-2.01 3.49-.51 8.66 1.45 11.5.96 1.39 2.1 2.94 3.6 2.88 1.45-.06 2-.93 3.74-.93s2.24.93 3.77.9c1.56-.02 2.55-1.41 3.5-2.8 1.1-1.62 1.56-3.18 1.58-3.26-.03-.02-3.04-1.17-3.07-4.59zM14.16 4.06c.8-.97 1.34-2.32 1.19-3.66-1.15.05-2.55.77-3.38 1.74-.74.86-1.39 2.23-1.22 3.55 1.29.1 2.6-.65 3.41-1.63z'/></svg>";
  function doorMsg(text) { var m = document.getElementById("doorMsg"); if (m) m.textContent = text || ""; }
  /* The door's error words (app v42 fix round): a provider error
     NEVER reaches the page raw. A credential refusal earns the
     one generic credential line, the same line the walk gives an
     already in use answer; everything else (a provider internal
     error, a network failure, an unknown code, no code at all)
     earns the plain did-not-work line. Before v42 doorFail printed
     the provider's own message, so a network hiccup at the door
     showed raw SDK text ("Firebase: Error (auth/internal-error).").
     The translator resolves at call time so the hook above can be
     driven on a dormant load, where the t binding below the
     dormancy return never runs. */
  function doorLineFor(e) {
    var tt = (typeof t === "function") ? t : window.MP_LANG.t;
    var generic = tt("door.genericLine");
    if (e && e.message && e.message === generic) return generic;
    var code = e && e.code ? String(e.code) : "";
    if (DOOR_CRED_CODES[code]) return generic;
    return tt("common.didNotWork");
  }
  function doorFail(e) { doorMsg(" " + doorLineFor(e)); }
  /* The demo entries' error words (app v42 fold-in): the two demo
     fail closures (the Account card's and the door page's) printed
     the provider's raw message the same way doorFail once did, so
     a store failure inside the demo walk could put SDK text on
     the page ("Firebase: Error ..."). The demo walk's own lines
     are the app's words and still land whole (not switched on,
     code did not match, code unreachable, type the code); ANY
     other error earns the plain did-not-work line, which is
     doorLineFor's generic outcome. The translator resolves at
     call time, like doorLineFor, so the hook above can be driven
     on a dormant load. */
  function demoLineFor(e) {
    var tt = (typeof t === "function") ? t : window.MP_LANG.t;
    var m = e && e.message ? String(e.message) : "";
    var own = [tt("demo.notOn"), tt("demo.codeNoMatch"), tt("demo.codeUnreachable"), tt("demo.typeCode")];
    if (own.indexOf(m) >= 0) return m;
    return tt("common.didNotWork");
  }
  function showDoorPage() {
    var page = document.getElementById("doorPage");
    if (!page) return;
    renderDoorStep1();
    page.classList.remove("hidden");
  }
  function hideDoorPage() {
    var page = document.getElementById("doorPage");
    if (page) page.classList.add("hidden");
    doorStep = 1; doorEmail = "";
    var b = document.getElementById("doorBody");
    if (b) b.innerHTML = "";
  }
  /* U3's door half (app v49): a tapped social door carries a
     quiet pending mark (the isPending class, the busy attribute
     and the one moment line) while its sheet is awaited, and a
     second tap on the SAME pending door starts nothing new.
     Every other control stays live throughout: the door never
     locks. The mark clears on any settle: success hands over to
     onUser, and a failure, the 60 second sheet bound included,
     lands in doorFail exactly as it always has. */
  var doorPending = { google: false, apple: false };
  function doorSocial(kind, btn) {
    if (doorPending[kind]) return;
    doorPending[kind] = true;
    btn.classList.add("isPending");
    btn.setAttribute("aria-busy", "true");
    doorMsg(t("door.oneMoment"));
    var call = kind === "google" ? window.MP_AUTH.signInGoogle() : window.MP_AUTH.signInApple();
    call.then(function () { /* onUser takes over */ }, doorFail).then(function () {
      doorPending[kind] = false;
      btn.classList.remove("isPending");
      btn.removeAttribute("aria-busy");
    });
  }
  function renderDoorStep1() {
    doorStep = 1;
    var b = document.getElementById("doorBody");
    if (!b) return;
    b.innerHTML =
      "<img class='doorMark' src='logo.svg' alt=''>" +
      "<h1 class='doorName'>Meal Prep</h1>" +
      "<p class='doorSub'>" + t("door.sub") + "</p>" +
      "<div class='doorSocial'>" +
      "<button class='doorIconBtn' id='doorGoogle' aria-label='" + t("door.googleAria") + "'>" + GOOGLE_G + "</button>" +
      "<button class='doorIconBtn' id='doorApple' aria-label='" + t("door.appleAria") + "'>" + APPLE_G + "</button>" +
      "</div>" +
      "<div class='doorDivider'><span>" + t("door.orEmail") + "</span></div>" +
      "<div class='doorField'><label>" + t("door.email") + "<input id='doorEmail' type='email' autocomplete='email' placeholder='" + t("door.emailPh") + "'></label></div>" +
      "<button class='doorNext' id='doorNext' aria-label='" + t("tour.next") + "'>→</button>" +
      "<p class='doorMsg' id='doorMsg'></p>" +
      "<div class='doorFoot'>" +
      "<button class='doorFootLine' id='doorDemoLine'>" + t("door.demoLine") + "</button>" +
      "<button class='doorFootLine' id='doorGuestLine'>" + t("door.guestLine") + "</button>" +
      "</div>" +
      "<div id='doorDemoBlock'></div>";
    document.getElementById("doorGoogle").addEventListener("click", function () { doorSocial("google", this); });
    document.getElementById("doorApple").addEventListener("click", function () { doorSocial("apple", this); });
    var input = document.getElementById("doorEmail");
    if (doorEmail) input.value = doorEmail;
    function goNext() {
      var em = input.value.trim();
      if (!em) { doorMsg(t("door.emailFirst")); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { doorMsg(t("door.emailBad")); return; }
      doorEmail = em;
      renderDoorStep2();
    }
    document.getElementById("doorNext").addEventListener("click", goNext);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); goNext(); } });
    document.getElementById("doorGuestLine").addEventListener("click", function () {
      /* A guest exit taken while the boot watchdog's door stands
         (before the first auth answer) is remembered, so the late
         signed out answer does not land the door again over a
         person who already chose the guest road (app v49, U1). */
      if (watchdogLanded && !authAnswered) preAnswerGuestExit = true;
      hideDoorPage();
    });
    document.getElementById("doorDemoLine").addEventListener("click", function () { renderDoorDemo(); });
  }
  function renderDoorStep2() {
    doorStep = 2;
    var b = document.getElementById("doorBody");
    if (!b) return;
    b.innerHTML =
      "<div class='doorPwTop'><button class='doorBack' id='doorBack' aria-label='" + t("door.backAria") + "'>←</button></div>" +
      "<img class='doorMark' src='logo.svg' alt=''>" +
      "<h1 class='doorName'>Meal Prep</h1>" +
      "<p class='doorSub'>" + t("door.sub") + "</p>" +
      "<div class='doorEmailRow'><span class='doorEmailText'>" + esc(doorEmail) + "</span><button class='linkBtn' id='doorChange'>" + t("door.change") + "</button></div>" +
      "<div class='doorField'><label>" + t("door.passwordLabel") + "</label><div class='doorPwWrap'><input id='doorPw' type='password' autocomplete='current-password' placeholder='" + t("door.passwordLabel") + "'><button type='button' class='doorEye' id='doorEye' aria-label='" + t("door.eyeAria") + "'>" + t("door.eyeShow") + "</button></div></div>" +
      "<button class='primaryBtn doorPrimary' id='doorGo'>" + t("tour.continue") + "</button>" +
      "<p class='doorCaption'>" + t("door.caption") + "</p>" +
      "<p class='doorMsg' id='doorMsg'></p>" +
      "<div class='doorFoot'><button class='doorFootLine' id='doorReset'>" + t("door.forgot") + "</button></div>";
    function back() { renderDoorStep1(); }
    document.getElementById("doorBack").addEventListener("click", back);
    document.getElementById("doorChange").addEventListener("click", back);
    var pw = document.getElementById("doorPw");
    document.getElementById("doorEye").addEventListener("click", function () {
      var show = pw.type === "password";
      pw.type = show ? "text" : "password";
      this.textContent = show ? t("door.eyeHide") : t("door.eyeShow");
    });
    document.getElementById("doorReset").addEventListener("click", function () {
      window.MP_AUTH.resetPassword(doorEmail).then(function () { doorMsg(t("door.resetSent")); }).catch(doorFail);
    });
    document.getElementById("doorGo").addEventListener("click", function () {
      if (!pw.value) { doorMsg(t("door.pwFirst")); return; }
      doorWalk(doorEmail, pw.value);
    });
    pw.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); document.getElementById("doorGo").click(); } });
    setTimeout(function () { try { pw.focus(); } catch (e) {} }, 60);
  }
  /* The walk (settled by the v4 rulings): sign in first; create
     only on a credential refusal; already in use earns the same
     generic line as a wrong password; any other error is answered
     by doorFail in the app's own words, never the provider's, and
     never reaches the create call. The code fence stands above
     the dormancy return since v42. */
  var DOOR_GENERIC_LINE = t("door.genericLine");
  function doorWalk(em, pw) {
    window.MP_AUTH.signInEmail(em, pw).then(function () { /* onUser takes over */ }, function (e1) {
      var code = e1 && e1.code ? String(e1.code) : "";
      if (!DOOR_CRED_CODES[code]) { doorFail(e1); return; }
      window.MP_AUTH.signUpEmail(em, pw).then(function () { /* onUser takes over */ }, function (e2) {
        var code2 = e2 && e2.code ? String(e2.code) : "";
        if (code2 === "auth/email-already-in-use") { doorFail(new Error(DOOR_GENERIC_LINE)); return; }
        doorFail(e2);
      });
    });
  }
  /* The demo and reviewer entries, opened from the door's foot line:
     the same doors the Account card has always carried. */
  function renderDoorDemo() {
    var block = document.getElementById("doorDemoBlock");
    if (!block || block.innerHTML) return;
    block.innerHTML =
      "<div class='cardInner doorDemo'><p class='hint'>" + t("demo.exploreLine") + "</p>" +
      "<div class='row'><button class='pillBtn' id='doorDemo'>" + t("demo.exploreBtn") + "</button></div>" +
      "<label>" + t("demo.codeLabel") + "<input id='doorDemoCode' type='text' autocomplete='off' placeholder='" + t("demo.codePh") + "'></label>" +
      "<div class='row'><button class='pillBtn' id='doorDemoCodeBtn'>" + t("demo.openWithCode") + "</button></div>" +
      "<p class='hint' id='doorDemoMsg'></p></div>";
    var fail = function (e) { var m = document.getElementById("doorDemoMsg"); if (m) m.textContent = " " + demoLineFor(e); };
    document.getElementById("doorDemo").addEventListener("click", function () { enterDemo(null).catch(fail); });
    document.getElementById("doorDemoCodeBtn").addEventListener("click", function () {
      var code = document.getElementById("doorDemoCode").value.trim();
      if (!code) { fail(new Error(t("demo.typeCode"))); return; }
      enterDemoCode(code).catch(fail);
    });
  }

  function renderSignedIn(user, opts) {
    opts = opts || {};
    if (!body) return;
    var html = "";
    if (device.demo) {
      html += "<p class='hint'><strong>" + t("account.demoSessionWord") + "</strong> " + t("account.demoSessionRest") + "</p>";
    } else {
      /* The card greets the person by their own name (HQ ruling,
         15 Oct 16:28): the name the profile carries, asked on the
         screen right after the door (door-first, 15 Oct 21:26) or
         taken from the Google or Apple profile, and editable
         here. The plan line is built from this session's
         entitlement, which syncTier resolved from the rules gated
         write on the mirror — the display can never outrun the
         rules (contracts 5b). */
      var myName = (snapshot && snapshot.profile && typeof snapshot.profile.name === "string" && snapshot.profile.name) || user.displayName || "";
      if (myName) html += "<p class='hint'>" + t("account.hello", { name: esc(myName) }) + "</p>";
      html += "<p class='hint'>" + t("account.signedInAs", { email: esc(user.email || t("account.yourAccountFallback")) }) + "</p>" +
        "<p class='hint'>" + t("account.planLine", { plan: t(window.MP_ACCOUNT_SYNC.getEntitlement() === "pro" ? "account.planTop" : "account.planFree") }) + "</p>" +
        "<div class='row'><button class='pillBtn' id='accNameEdit'>" + (myName ? t("account.editName") : t("account.addName")) + "</button></div>" +
        "<div id='accNameBox'></div>";
    }
    if (opts.importOffer) {
      html += "<div class='cardInner'><p class='hint'>" + t("account.importOffer") + "</p>" +
        "<div class='row'><button class='primaryBtn' id='accImport'>" + t("account.bringIn") + "</button><button class='pillBtn' id='accImportNo'>" + t("upgrade.notNow") + "</button></div>" +
        "<p class='hint' id='accImportMsg'></p></div>";
    }
    html += "<div class='row'><button class='pillBtn' id='accOut'>" + (device.demo ? t("account.leaveDemo") : t("account.signOut")) + "</button>";
    if (!device.demo) html += "<button class='pillBtn' id='accRemoveDevice'>" + t("account.removeDevice") + "</button>";
    html += "</div><p class='hint' id='accMsg2'></p>";
    if (!device.demo) html += "<p class='hint'>" + t("account.removeDeviceNote") + "</p>";
    if (!device.demo) {
      /* Delete my account (design section 7): the one system path
         that deletes user data, and it runs only by the user's own
         hand. The export is offered FIRST, the forever warning is
         plain, and the fresh sign in check inside the flow means a
         wrong password deletes nothing. Demo sessions never see
         this door at all: deleting is off in the demo. */
      html += "<h3>" + t("account.deleteTitle") + "</h3>" +
        "<p class='hint'>" + t("account.deleteWarn1") + "</p>" +
        "<p class='hint'>" + t("account.deleteWarn2") + "</p>" +
        "<div class='row'><button class='pillBtn' id='accExportFirst'>" + t("account.downloadFirst") + "</button>" +
        "<button class='pillBtn danger' id='accDeleteStart'>" + t("account.deleteTitle") + "</button></div>" +
        "<div id='accDeleteBox'></div>";
    }
    /* The delete box survives this rebuild (app v54, Cure 6 —
       QA's night verdict on build 16, Finding N3; the night
       bisect's F3 scenario proved the mechanism): the confirm
       box stands open BELOW this card's own markup, and a
       resolution landing that re-renders the card mid flow (a
       retry landing, a refresh) used to destroy it silently —
       the rebuilt card carried an empty box and the password
       the person had typed died with the old elements, the tap
       on Delete then doing nothing at all. So an open box is
       captured before the rebuild (its markup and the typed
       password) and restored into the rebuilt box below, wired
       live through wireDeleteConfirm. A closed box captures
       nothing, and idle renders are untouched. */
    var delBoxWas = document.getElementById("accDeleteBox");
    var delOpenHtml = delBoxWas && delBoxWas.innerHTML ? delBoxWas.innerHTML : "";
    var delPwWas = null;
    if (delOpenHtml) { var delPwEl = document.getElementById("accDeletePw"); delPwWas = delPwEl ? delPwEl.value : null; }
    body.innerHTML = html;
    var nameEdit = document.getElementById("accNameEdit");
    if (nameEdit) nameEdit.addEventListener("click", function () { renderNameEdit(user); });
    document.getElementById("accOut").addEventListener("click", function () { signOutFlow().catch(function () {}); });
    var rm = document.getElementById("accRemoveDevice");
    if (rm) rm.addEventListener("click", function () {
      var gone = A.removeDeviceData(storage, user.uid);
      var m = document.getElementById("accMsg2");
      if (m) m.textContent = gone ? t("account.removedOk") : t("account.removedGone");
    });
    var expFirst = document.getElementById("accExportFirst");
    if (expFirst) expFirst.addEventListener("click", function () { var b = document.getElementById("exportBtn"); if (b) b.click(); });
    var delStart = document.getElementById("accDeleteStart");
    if (delStart) delStart.addEventListener("click", function () { renderDeleteConfirm(user); });
    var imp = document.getElementById("accImport");
    if (imp) imp.addEventListener("click", function () { doImport(user).catch(function () {}); });
    var impNo = document.getElementById("accImportNo");
    if (impNo) impNo.addEventListener("click", function () { device.importDeclinedFor = user.uid; saveDevice(); renderSignedIn(user, {}); });
    /* The delete box's restoration (app v54, Cure 6, the capture
       above): the box stands open again with what the person
       typed still in its field, wired through the same function
       the render itself uses. */
    if (delOpenHtml) {
      var delBoxNow = document.getElementById("accDeleteBox");
      if (delBoxNow) {
        delBoxNow.innerHTML = delOpenHtml;
        var delPwNow = document.getElementById("accDeletePw");
        if (delPwNow && delPwWas != null) delPwNow.value = delPwWas;
        wireDeleteConfirm(user, window.MP_AUTH.reauthKind(user));
      }
    }
  }

  /* ---------------- the name (Law F, sequenced by the v4 tour) ----
     The name is still collected at joining; in v33 it is asked by
     Mina's tour, at its first stop, after the door. The door creates
     the account with NO name on it, and the profile is created at
     that same first sign in with whatever name is known by then
     (a provider name, or none at all): the name is DATA on the
     profile, never a gate on saving (app v50, the save-forever
     cure for QA's build 12 Finding 1, verdict c894e00a). The v33
     shape DEFERRED the join until the name landed and held every
     push behind it, so a person who skipped the optional name
     cooked in an account nothing ever reached; now the profile
     exists from the first moment, every push runs from the first
     moment, and the answer, whenever it comes, updates the profile
     through saveName like any other edit. If the name stop is
     closed unanswered, the re-ask rule offers it once more on the
     NEXT visit (a later session, never the same one), then never
     again; after that the name lives only in the Account card's
     Edit. A name known by any road ends every ask at once. */
  function knownName(user, docs) {
    var carried = (docs && docs.profile && typeof docs.profile.name === "string" && docs.profile.name) || (user && user.displayName) || "";
    if (carried) return carried;
    var st = liveState();
    return (st && typeof st.accountName === "string" && st.accountName) || "";
  }
  function saveName(user, nm) {
    var st = liveState();
    if (st) { st.accountName = nm; setLive(st); }
    /* The snapshot is NOT pre-written with the name (app v52,
       QA's build 14 retest, Leg D): the snapshot is the push's
       diff baseline, and writing the answer into it here
       starved pushAccount's docEq — the profile built from the
       working copy compared equal to the baseline on the name,
       the profile write never fired, and the name reached the
       server only when an unrelated change later forced the
       write (QA: it landed in one of three answering arms).
       The working copy above carries the name from this moment;
       the push the hook schedules now SEES the change against
       the untouched baseline and writes it, and the push's own
       completion replaces the snapshot with the documents it
       landed, name included, so the card's reads (the snapshot
       name, else the sign in record's) stay true. */
    /* The name ALSO rides through the state owner (app v53,
       QA's build 15 nameflow bisect,
       verdict-mealprep-b15-nameflow-bisect.md — the verdict
       that proved the remaining fault at the byte level):
       the live key has two writers — this
       layer's stored copy, written above, and app.js's own
       in-memory state, whose save() serialises that whole
       object over the key on every save. The bisect's trail:
       the answer stood in storage at +0.2 s; the tour walk's
       first step saved at +1.6 s and wrote the owner's
       name-less copy over it; and the push — composing at
       fire time from the stored copy, inside its 2 second
       debounce — read the clobbered value and wrote nothing.
       The control arm, its walk delayed past the window,
       landed the name, which is how the fault hid. So the
       name takes the road guideState has always taken
       through bumpNameAsks below: the owner's copy carries
       it from this moment, no save inside any window can
       write it away, and the owner's save (which fires the
       hook below through app.js's own save path) keeps the
       two copies agreeing. With no tour standing (the seam
       absent), the stored write above stands exactly as
       it always has. */
    if (window.MP_TOUR && window.MP_TOUR.setAccountName) window.MP_TOUR.setAccountName(nm);
    if (window.MP_ACCOUNT_HOOK && window.MP_ACCOUNT_HOOK.onSave) window.MP_ACCOUNT_HOOK.onSave();
    window.MP_AUTH.setDisplayName(nm).then(function () {}, function () {});
  }
  /* One visit = one browser session (sessionStorage). The ask
     bookkeeping rides the guide state, repaired like every slice. */
  function visitId() {
    try {
      var v = sessionStorage.getItem("mpVisitId");
      if (!v) { v = "v" + Date.now() + "." + Math.floor(Math.random() * 1e9); sessionStorage.setItem("mpVisitId", v); }
      return v;
    } catch (e) { return "session"; }
  }
  function bumpNameAsks(n, visit) {
    /* The write goes through the tour's owner (app.js): the tour
       saves the guide state as it walks, and a write made here on
       a parsed copy would be overwritten by the tour's next save. */
    if (window.MP_TOUR && window.MP_TOUR.bumpNameAsks) { window.MP_TOUR.bumpNameAsks(n, visit); return; }
    var st = liveState();
    if (!st) return;
    if (!st.guideState || typeof st.guideState !== "object") st.guideState = { status: "notStarted", step: 1 };
    st.guideState.nameAsks = n; st.guideState.nameAskVisit = visit; st.guideState.v = 2;
    setLive(st);
    if (window.MP_ACCOUNT_HOOK && window.MP_ACCOUNT_HOOK.onSave) window.MP_ACCOUNT_HOOK.onSave();
  }
  /* The re-ask decision (the ruling, in order): a known name ends
     it; two offers made ends it; the second offer waits for a new
     visit; the first offer is the tour's name stop when the tour
     will show it this session, and the quiet pop otherwise. */
  function nameAskFlow(user, docs) {
    if (!user || user.isAnonymous || device.demo) return;
    if (knownName(user, docs)) return;
    var st = liveState();
    if (!st) return;
    var gs = (st.guideState && typeof st.guideState === "object") ? st.guideState : {};
    var asks = typeof gs.nameAsks === "number" ? gs.nameAsks : 0;
    if (asks >= 2) return;
    var visit = visitId();
    if (asks === 1) {
      if (gs.nameAskVisit === visit) return;
      bumpNameAsks(2, visit);
      if (window.MP_NAME_ASK) window.MP_NAME_ASK.show();
      return;
    }
    var tourWillAsk = gs.status === "notStarted" || (gs.status === "inProgress" && gs.step === 1);
    /* The first offer counts whichever surface makes it: when the
       tour will show the name stop this session, the tour is the
       first ask (counted here, so the next visit's pop is the one
       re-offer and there is never a third); otherwise the quiet
       pop makes the first ask now. */
    bumpNameAsks(1, visit);
    if (tourWillAsk) return;
    if (window.MP_NAME_ASK) window.MP_NAME_ASK.show();
  }
  /* The name lands. It is a plain save, the same one the Account
     card's Edit has always made (app v50): the profile already
     exists (created at the first sign in, name or no name), so
     the answer updates it as data through the ordinary push, and
     the sign in record's display name follows inside saveName.
     Before v50 this function also carried the deferred join's
     first write for a pending join; the join no longer defers,
     so there is no pending write left to carry. */
  function tourNameAnswered(nm) {
    var user = currentUser;
    if (!user || user.isAnonymous || device.demo) return Promise.resolve();
    saveName(user, nm);
    renderSignedIn(user, {});
    toast(t("account.nameSavedToast"));
    return Promise.resolve();
  }
  /* The tour asks app.js which stop 1 to draw: the name stop only
     for a signed in person with no name known by any road. */
  function nameStopApplies() {
    if (!currentUser || currentUser.isAnonymous || device.demo) return false;
    return !knownName(currentUser, snapshot ? { profile: snapshot.profile } : null);
  }
  window.MP_TOUR_HOOK = { nameStopApplies: nameStopApplies, tourNameAnswered: tourNameAnswered };

  /* ---------------- your name (HQ ruling, 15 Oct 16:28) ----------------
     The name lives on the profile document and on the sign in record
     (its display name). Saving here updates both, plus this device's
     working copy, so the next sync push carries the same name and the
     guide can greet by it after the next load. */
  function renderNameEdit(user) {
    var box = document.getElementById("accNameBox");
    if (!box) return;
    var current = (snapshot && snapshot.profile && typeof snapshot.profile.name === "string" && snapshot.profile.name) || user.displayName || "";
    box.innerHTML = "<div class='cardInner'><label>" + t("tour.yourName") + "<input id='accNameInput' type='text' autocomplete='name' value='" + esc(current) + "'></label>" +
      "<div class='row'><button class='primaryBtn' id='accNameSave'>" + t("account.saveMyName") + "</button>" +
      "<button class='pillBtn' id='accNameCancel'>" + t("account.cancel") + "</button></div>" +
      "<p class='hint' id='accNameMsg'></p></div>";
    document.getElementById("accNameCancel").addEventListener("click", function () { box.innerHTML = ""; });
    document.getElementById("accNameSave").addEventListener("click", function () {
      var msg = document.getElementById("accNameMsg");
      var nm = document.getElementById("accNameInput").value.trim();
      if (!nm) { if (msg) msg.textContent = t("account.typeNameFirst"); return; }
      /* A name typed here ends every ask; it lands as data on the
         profile that has existed since the first sign in (app v50). */
      saveName(user, nm);
      renderSignedIn(user, {});
      toast(t("account.nameSavedToast"));
    });
  }

  /* ---------------- delete my account (design section 7) ---------------- */
  function stepWord(stage) { var w = t("delete.step." + stage); return w === "delete.step." + stage ? t("delete.oneStep") : w; }
  function renderDeleteConfirm(user) {
    var box = document.getElementById("accDeleteBox");
    if (!box) return;
    var kind = window.MP_AUTH.reauthKind(user);
    var html = "<div class='cardInner'><p class='hint'><strong>" + t("delete.sureWord") + "</strong> " + t("delete.sureRest") + "</p>";
    if (kind === "password") {
      html += "<label>" + t("door.passwordLabel") + "<input id='accDeletePw' type='password' autocomplete='current-password' placeholder='" + t("door.passwordLabel") + "'></label>" +
        "<p class='hint'>" + t("delete.pwHint") + "</p>";
    } else {
      html += "<p class='hint'>" + t("delete.confirmWith", { provider: kind === "apple" ? "Apple" : "Google" }) + "</p>";
    }
    html += "<div class='row'><button class='pillBtn danger' id='accDeleteGo'>" + t("delete.yesForever") + "</button>" +
      "<button class='pillBtn' id='accDeleteCancel'>" + t("delete.keepAccount") + "</button></div>" +
      "<p class='hint' id='accDeleteMsg'></p></div>";
    box.innerHTML = html;
    wireDeleteConfirm(user, kind);
  }
  /* The delete box's own wiring, standing apart from the render
     (app v54, Cure 6 — QA's night verdict on build 16, Finding
     N3, and the night bisect's F3 scenario): a card rebuild
     (renderSignedIn) replaces the box's elements wholesale, so a
     box restored by renderSignedIn below is re-wired through this
     same function and lands live, never as dead markup. */
  function wireDeleteConfirm(user, kind) {
    var box = document.getElementById("accDeleteBox");
    var cancel = document.getElementById("accDeleteCancel");
    if (cancel) cancel.addEventListener("click", function () { if (box) box.innerHTML = ""; });
    var go = document.getElementById("accDeleteGo");
    if (go) go.addEventListener("click", function () { runDeletion(user, kind).catch(function () {}); });
  }
  function runDeletion(user, kind) {
    var msg = document.getElementById("accDeleteMsg");
    var pw = "";
    if (kind === "password") {
      var f = document.getElementById("accDeletePw");
      pw = f ? f.value : "";
      if (!pw) { if (msg) msg.textContent = t("delete.typePwFirst"); return Promise.resolve(); }
    }
    if (msg) msg.textContent = t("delete.checking");
    /* While the sweep runs, no push or pull may recreate or readopt
       the data being deleted. */
    deleting = true; adopting = true;
    /* The delete chain takes the house bound on its reauth
       leg (app v58, Clause C — the F-B20-1 bisect verdict,
       Part 5, defect D2): every neighbouring chain in this
       file is bounded (the resolutions' U5, the sign-out's
       U6), and this chain's reauth was the one unbounded
       await left in the file. On a channel that pends —
       a reauth that never answers — the tap hung at the
       checking line forever, no line, no retry, and the
       flags above stayed held, silently freezing the
       session's own saves behind it for the rest of the
       session. The bound rides the reauth dependency
       itself, in the U6 shape (WAIT.bound, 30 s from the
       tap): a pended reauth settles the flow at the bound
       as that stage's timeout, read at the seam below,
       where the flags stand down and the existing
       not-finished line stands — a told, retryable
       failure. The bound is NOT wrapped around the whole
       chain, on staged evidence: a delete that is
       ANSWERING, doc by doc on a slow channel, is
       progressing, and a whole-chain timer staged against
       the standing C6-B drive fired mid-sweep and reported
       not-finished over a deletion that then completed
       behind the message (the account gone, no reset
       fired) — this clause's own words in the verdict are
       "no behaviour change when the channel answers". The
       sweep's stages settle by refusal on a wedged
       channel, as every wedge staging on record shows;
       the pend this clause answers is the reauth's. */
    var reauthTimedOut = false;
    var reauthBounded = WAIT.bound(window.MP_AUTH.reauthFor(user, pw), 30000);
    /* The rider marks the bound's own timeout (read with
       the wait helper's own isTimeout) for the seam below,
       and keeps a flow that never starts (a store that
       never readies) from surfacing the rejection
       unhandled. */
    reauthBounded.catch(function (err) { if (WAIT.isTimeout(err)) reauthTimedOut = true; });
    return storePromise.then(function (store) {
      return A.deleteAccountFlow(store, user.uid, {
        reauth: function () { return reauthBounded; },
        deleteAuthUser: function () { return window.MP_AUTH.deleteCurrentUser(); }
      });
    }).then(function (res) {
      if (!res.ok) {
        deleting = false; adopting = false;
        if (res.stage === "reauth" && reauthTimedOut) {
          /* Clause C's settle: the pend became the bound's
             own timeout. The honest line is the
             not-finished one, not the wrong-password one,
             and the element is re-read at settle time —
             a rebuild during the wait may have replaced
             the one captured at the start. */
          var msgNow = document.getElementById("accDeleteMsg");
          if (msgNow) msgNow.textContent = t("delete.notFinished");
        }
        else if (msg) {
          if (res.stage === "reauth") msg.textContent = t("delete.reauthFail");
          else if (res.stage === "authUser") msg.textContent = t("delete.authUserFail");
          else msg.textContent = t("delete.stoppedAt", { step: stepWord(res.stage) });
        }
        return;
      }
      /* Deleted. This device keeps nothing for the account: its
         cache key goes, the device record forgets the uid, and the
         working copy becomes a fresh guest state whose guide stays
         closed (the guide does not reopen on a person who just
         deleted their account). One plain notice waits on the other
         side of the reload. */
      storage.remove(A.cacheKeyFor(user.uid));
      device.uid = null; device.adoptedUid = null; device.pendingImportUid = null; device.pendingJoinUid = null; device.lastActiveUid = null; device.activatedAt = null; saveDevice();
      var fresh = blankState();
      fresh.guideState = { status: "done", step: 8, v: 2, nameAsks: 0, nameAskVisit: "" };
      setLive(fresh);
      storage.set("mealPrepNotice", t("account.deletedNotice"));
      return window.MP_AUTH.signOut().then(function () { location.reload(); }, function () { location.reload(); });
    }, function () {
      deleting = false; adopting = false;
      /* The message element is re-read at settle time (app
         v58, Clause C): a card rebuild during the wait may
         have replaced the element this flow captured at its
         start, and the line must stand on the element that
         stands. */
      var msgNow = document.getElementById("accDeleteMsg");
      if (msgNow) msgNow.textContent = t("delete.notFinished");
    });
  }

  /* ---------------- demo ---------------- */
  function demoState() {
    var seed = JSON.parse(JSON.stringify(window.MP_DEMO_SEED.state));
    var today = L.dateKey(new Date());
    seed.pantry.forEach(function (it) { it.added = today; });
    var first = L.dateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
    var days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    var plan = L.buildPlan(first, days, { preferences: seed.preferences, family: seed.family, expiringNames: seed.pantry.map(function (i) { return i.name; }), customRecipes: seed.customRecipes }, D);
    Object.keys(plan).forEach(function (k) { seed.plan[k] = plan[k]; });
    return seed;
  }
  /* The demo unlock attempt (app v35, B-F1). The check is real and it
     is the server's: the rules hold the desk's record at _demo/config
     and adjudicate the unlock write against it, and the client can
     never read that record, so presenting the hash with an anonymous
     sign in IS the check. Three outcomes, three honest lines, and the
     line is chosen only once the outcome is known:
       match:       the write landed; the hash matched the record.
       nomatch:     the write was refused (permission denied); the
                    check ran and the code did not match.
       unavailable: the check could not run at all (the sign in or the
                    store never answered, e.g. no connection); the
                    generic honest line, never a verdict on the code. */
  function demoUnlock(hash) {
    return window.MP_AUTH.signInAnon().then(function (user) {
      return storePromise.then(function (store) {
        return store.setDoc("_unlocks/" + user.uid, { codeHash: hash }).then(function () {
          return { outcome: "match", user: user, store: store };
        }, function (err) {
          var text = String((err && err.code) || "") + " " + String((err && err.message) || "");
          return { outcome: /permission/i.test(text) ? "nomatch" : "unavailable" };
        });
      }, function () { return { outcome: "unavailable" }; });
    }, function () { return { outcome: "unavailable" }; });
  }
  function enterDemo(presentedHash) {
    var seedFile = window.MP_DEMO_SEED;
    if (!seedFile) return Promise.reject(new Error(t("demo.notOn")));
    var hash = presentedHash || seedFile.codeHash;
    /* The one tap Explore door presents the shipped record; an empty
       slot means this build carries none, and its honest line stays
       demo.notOn. A typed code always earns the real check, whatever
       the shipped slot holds. */
    if (!hash) return Promise.reject(new Error(t("demo.notOn")));
    return reloadOnTimeout(demoUnlock(hash).then(function (res) {
      if (res.outcome === "nomatch") throw new Error(t("demo.codeNoMatch"));
      if (res.outcome !== "match") throw new Error(t("demo.codeUnreachable"));
      var st = demoState();
      return A.pushAccount(res.store, res.user.uid, st, null, nowIso()).then(function () {
        var raw = storage.get(A.LIVE_KEY);
        if (raw && !device.guestPotConsumed) storage.set(A.guestCacheKey(), raw);
        setLive(st);
        device.demo = true; device.demoUid = res.user.uid; device.uid = null; saveDevice();
        location.reload();
      });
    }));
  }
  /* The code forms' one shared path (app v35): both the Account card
     form and the door page form hash what was typed and hand it to
     enterDemo, so both choose their line from the same known outcome. */
  function enterDemoCode(code) {
    return A.sha256Hex(code).then(function (hash) { return enterDemo(hash); });
  }
  /* Deleting stays off inside a demo session (DEMO-ACCOUNT-SPEC): the
     destructive buttons are stopped at the door with a plain word.
     The demo's data is a per session copy and a fresh session
     re-seeds, so nothing real can be lost here either way. */
  document.addEventListener("click", function (e) {
    if (!device.demo) return;
    var t = e.target;
    var btn = t && t.closest ? t.closest("[data-remove-meal], [data-remove-extra], .danger") : null;
    if (btn) { e.preventDefault(); e.stopPropagation(); toast(t("demo.guardToast")); }
  }, true);

  /* ---------------- guest import ---------------- */
  function doImport(user) {
    var msg = document.getElementById("accImportMsg");
    var potRaw = storage.get(A.guestCacheKey());
    var pot = null;
    try { pot = potRaw ? JSON.parse(potRaw) : null; } catch (e) {}
    if (!pot) { if (msg) msg.textContent = t("import.guestUnread"); return Promise.resolve(); }
    return storePromise.then(function (store) {
      return A.runImport(store, user.uid, pot, nowIso()).then(function (docs) {
        /* Success consumes the pot (design section 6): the guest
           copies go, the device is flagged, and the imported data
           becomes this account's working copy on this device. */
        snapshot = docs;
        setLive(pot);
        /* App v57 (clause 1 + the reload deferral): the
           import lands in the owner's memory too, and its
           reload parks like every landing's. */
        ownerAdopt(pot);
        storage.remove(A.guestCacheKey());
        device.guestPotConsumed = true; saveDevice();
        storage.set(A.cacheKeyFor(user.uid), JSON.stringify(pot));
        toast(t("import.dataInAccountToast"));
        reloadAfterLanding();
      }, function () {
        /* Failure leaves the pot fully intact; the offer can be made
           again (design section 6, Security case 1). */
        if (msg) msg.textContent = t("import.moveFailed");
      });
    });
  }

  /* ---------------- sync ---------------- */
  function schedulePush() {
    if (!currentUser || adopting || deleting) return;
    /* Pushes are never held for a name (app v50, QA build 12
       Finding 1): the profile exists from the first sign in, so
       the save hook carries changes from the first moment, name
       answered or not. Before v50 a pending join held every push
       here, and an unanswered optional name silently starved the
       account of every save it ever made. */
    pushPending = true;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      var st = liveState();
      if (!st || !currentUser) { pushPending = false; return; }
      var uid = currentUser.uid;
      storePromise.then(function (store) {
        return A.pushAccount(store, uid, st, snapshot, nowIso());
      }).then(function (next) { snapshot = next; pushPending = false; }, function () { pushPending = false; });
    }, 2000);
  }
  window.MP_ACCOUNT_HOOK = {
    onSave: function () { schedulePush(); },
    onPlanned: function (source) {
      var r = A.noteActivation({ activatedAt: device.activatedAt }, source, nowIso());
      if (!r.stamped) return;
      device.activatedAt = r.meta.activatedAt; saveDevice();
      if (currentUser && !currentUser.isAnonymous) {
        var uid = currentUser.uid, at = r.meta.activatedAt;
        storePromise.then(function (store) {
          return store.updateDoc("users/" + uid, { activatedAt: at }).then(function () {
            /* Build 8 follow on: the contrib prev is the profile
               mirror in the last synced docs, never the contrib
               document itself (owner only reads, by design — the
               getDoc that stood here refused and the stamp died at
               the read). With no pulled profile in hand there is
               nothing honest to source prev from, so the contrib
               write is skipped rather than guessed; the mirror is
               the second belt behind the device stamp above, and
               an already stamped mirror makes the chain a no-op. */
            if (!snapshot || !snapshot.profile) return null;
            return A.stampChain(store, uid, snapshot.profile.stamps, "activation", todayStr());
          });
        }).then(function (res) {
          if (snapshot && snapshot.profile) {
            snapshot.profile.activatedAt = at;
            if (res) snapshot.profile.stamps = res.mirror;
          }
        }, function () {});
      }
    }
  };

  /* ---------------- answer adjudication (app v51) ----------------
     QA's build 13 retest (verdict 5ff194fe, Finding 2 STANDS
     UNCURED on v50) sharpened the shape past v50's cure: the wedge
     pends every Firestore request forever (the route held exactly
     one, the Listen channel), yet the { source: "server" } gets
     still RESOLVED, empty, out of the SDK's internal state — the
     resolution completed into the fail soft signed in state at
     about 19 seconds, the slowLoad line (wired only to the
     timeout class in the catches below) never stood, and after
     the heal nothing ever re-asked, so the planted data never
     landed. A resolved empty answer reaches NO catch, so the
     adjudication stands on the SUCCESS path, in the open: both
     resolution pulls judge their resolved value through
     A.adjudicatePull (accounts.js) before a single thing is
     adopted or created from it. NOT LOADED means: render the
     session from its local truth, stand the honest slowLoad
     line at once (on the FIRST pull's answer, inside the first
     sampling window, not after any retry delay), create nothing,
     adopt nothing, and retry the WHOLE resolution pull on a
     bounded interval until an adjudicated LOADED answer lands.
     The pend and reject classes kept their v49/v50 fallbacks
     when this was written; app v54 (Cure 4) retired the bare
     fallback whole — every non-loaded landing of a resolution
     chain now takes this treatment, whatever class carried it
     there (see the catch at resolveAdopted's tail). */
  var NOT_LOADED_CODE = "mp/not-loaded";
  function notLoadedError() { var e = new Error(NOT_LOADED_CODE); e.code = NOT_LOADED_CODE; return e; }
  function isNotLoaded(e) { return !!e && e.code === NOT_LOADED_CODE; }
  /* The unavailable class (app v52, QA's build 14 retest and
     the F2 bisect, verdict-mealprep-b14-f2-bisect.md): under the
     Listen wedge the resolution pull neither pends nor resolves
     empty — it REJECTS, about ten seconds in, with the
     Firestore error code "unavailable" ("Failed to get document
     because the client is offline."). That class is neither the
     bound's timeout nor the adjudication's not loaded, so the
     terminal catches used to take their bare fallback on it: the
     card rendered, no honest line stood, and no retry was ever
     armed — the session sat in its local empty state forever,
     through the heal and past every would be retry interval.
     The class is named here, beside the not loaded class it now
     joins: a rejection belongs to it when its code is
     "unavailable", or when its words are the SDK's offline
     words. Its treatment is landNotLoaded, at the catches below
     and at the visibility refresh's rejection arm. */
  function isUnavailable(e) {
    if (!e) return false;
    if (e.code === "unavailable") return true;
    return typeof e.message === "string" && e.message.indexOf("client is offline") !== -1;
  }
  /* A working copy's collection census, keyed by the engine's own
     collection kinds (accounts.js COLLECTIONS) — the one ruler
     the v54 cures read: the adjudication's proof carries it for
     the cached copy (Cure 1), and the adopted road's convergence
     compares it between the pulled state and the live copy
     (Cure 2). Counts only; the states themselves never travel
     through the proof. */
  function stateCounts(st) {
    var counts = {};
    A.COLLECTIONS.forEach(function (kind) { counts[kind] = 0; });
    if (!st || typeof st !== "object") return counts;
    counts.familyMembers = Array.isArray(st.family) ? st.family.length : 0;
    counts.pantryItems = Array.isArray(st.pantry) ? st.pantry.length : 0;
    /* A plan day counts toward the census only when it
       carries content (app v57, the F-B19-1 cure, clause 2):
       a tombstone day — present but empty, the mark a
       landing leaves for a day another device deleted, so
       a reloaded boot's auto-fill never refills it — is not
       planned content on either side of a comparison this
       census feeds. The adjudication in accounts.js counts
       a pulled tombstone document as a day standing at the
       server, so a device copy holding the same day empty
       must not read poorer for it; a copy holding the day
       WITH content reads exactly as it always has. */
    counts.planDays = 0;
    if (st.plan && typeof st.plan === "object" && !Array.isArray(st.plan)) Object.keys(st.plan).forEach(function (day) { var d = st.plan[day]; if (d && typeof d === "object" && Object.keys(d).length) counts.planDays++; });
    counts.customRecipes = Array.isArray(st.customRecipes) ? st.customRecipes.length : 0;
    counts.shoppingExtras = Array.isArray(st.extras) ? st.extras.length : 0;
    var items = 0;
    if (st.doneItems && typeof st.doneItems === "object") items += Object.keys(st.doneItems).length;
    if (st.hiddenItems && typeof st.hiddenItems === "object") items += Object.keys(st.hiddenItems).length;
    counts.shoppingItemState = items;
    counts.importedEvents = Array.isArray(st.events) ? st.events.length : 0;
    counts.imports = Array.isArray(st.imports) ? st.imports.length : 0;
    return counts;
  }
  /* The plain object test the census stand reads shapes with
     (the engine's own test, restated for the glue — accounts.js
     does not export it, and this round does not touch the
     engine), and the PULLED answer's own census (app v55, Cure
     F1): the identical vector the adjudicator compares against
     the proof's cache census, counted off the documents the
     pull resolved with, kind by kind in the engine's order. */
  function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
  function docsCounts(docs) {
    var counts = {};
    var cols = isObj(docs) && isObj(docs.collections) ? docs.collections : {};
    A.COLLECTIONS.forEach(function (kind) {
      var bag = cols[kind];
      counts[kind] = isObj(bag) ? Object.keys(bag).length : 0;
    });
    return counts;
  }
  /* The item identity the reconciliations union by: an item's own
     id where it carries one, else its import key, else its whole
     shape (events ride positionally in the docs, so shape is
     their honest identity on the state side). */
  function itemKey(it) {
    if (!it || typeof it !== "object") return "j:" + JSON.stringify(it);
    if (it.id != null) return "i:" + String(it.id);
    if (it.key != null) return "k:" + String(it.key);
    return "j:" + JSON.stringify(it);
  }
  /* RECONCILED ADOPTION (app v54, Cure 1's second half — the belt
     to the adjudication's braces, under the data never deleted
     law): a loaded pull adopted into the live key carries, per
     collection, any items this device's cached copy of the same
     account holds that the pull lacks (union by item identity;
     the pulled item wins on a shared identity). The session
     snapshot stays the PULLED documents, so a carried item
     re-lands as a write on the next push, never as a delete:
     the resolution layer never deletes. A stale cache may
     resurrect an item deleted on another device, which the
     never-delete law prefers to a silent loss. */
  function reconcileWithCache(uid, pulledState) {
    var cached = null;
    try { var rawC = storage.get(A.cacheKeyFor(uid)); cached = rawC ? JSON.parse(rawC) : null; } catch (e) { cached = null; }
    if (!cached || typeof cached !== "object" || Array.isArray(cached)) return pulledState;
    var merged = JSON.parse(JSON.stringify(pulledState));
    ["family", "pantry", "customRecipes", "extras", "events", "imports"].forEach(function (field) {
      if (!Array.isArray(merged[field])) merged[field] = [];
      var have = {};
      merged[field].forEach(function (it) { have[itemKey(it)] = true; });
      (Array.isArray(cached[field]) ? cached[field] : []).forEach(function (it) {
        var k = itemKey(it);
        if (!have[k]) { merged[field].push(JSON.parse(JSON.stringify(it))); have[k] = true; }
      });
    });
    if (cached.plan && typeof cached.plan === "object") {
      if (!merged.plan || typeof merged.plan !== "object") merged.plan = {};
      Object.keys(cached.plan).forEach(function (day) { if (!(day in merged.plan)) merged.plan[day] = JSON.parse(JSON.stringify(cached.plan[day])); });
    }
    ["doneItems", "hiddenItems"].forEach(function (field) {
      if (cached[field] && typeof cached[field] === "object") {
        if (!merged[field] || typeof merged[field] !== "object") merged[field] = {};
        Object.keys(cached[field]).forEach(function (k) { if (!(k in merged[field])) merged[field][k] = cached[field][k]; });
      }
    });
    return merged;
  }
  /* The landed state is adopted by the state owner too (app
     v57, the F-B19-1 cure, clause 1 — the seam itself and its
     ruling stand written at MP_TOUR.adoptLandedState in
     app.js): every landing that writes the live key routes
     its state through the owner beside its setLive, guarded
     exactly as the single-field routings (saveName's,
     bumpNameAsks') are guarded — seam absent, the storage
     write stands as it always has. */
  function ownerAdopt(st) {
    if (window.MP_TOUR && window.MP_TOUR.adoptLandedState) window.MP_TOUR.adoptLandedState(st);
  }
  /* No baseline without its state (app v58, the F-B20-1
     cure, Clause A — QA's build 20 retest verdict,
     verdict-mealprep-b20-retest.md, blob ce43e1ed, finding
     F-B20-1; the F-B20-1 bisect verdict, Part 6): the
     invariant the session already lives by after every
     save is that the baseline is the documents of the
     state the session would compose. Two refreshes broke
     it, taking the PULLED documents as the baseline while
     the state stood older — the adopted road's resolution
     (B1 in the bisect census) and the convergence
     re-check (B2) — and the first writer after either,
     the sign-out in QA's staging, composed the stale
     state against the fresh baseline and wrote another
     device's deletion back at the server. This helper is
     the discipline, at the glue seam beside ownerAdopt:
     given the state a landing leaves standing, the
     baseline that belongs to it. A landing that leaves
     no readable state leaves the baseline exactly as it
     stands. pushAccount and the adjudication are NOT
     touched — the engine is faithful and the judge
     unchanged; the cure lives where the refresh happens. */
  function baselineFrom(state) {
    if (!state || typeof state !== "object") return snapshot;
    return A.stateToDocs(state);
  }
  /* Tombstones (app v57, the F-B19-1 cure, clause 2 — the
     bisect verdict's Face 1, Road B): a day this device holds
     (in its cache, or in the working copy standing at the
     landing) that the pulled state does NOT hold was deleted
     on another device — the deletion is real, and the day
     must land present-but-empty in the adopted state. Left
     absent, a reloaded boot's INIT treats it as never
     planned and its auto-fill refills it with fresh picks
     (the regeneration road), and the next save carries the
     refill back to the server: the deletion undone. The
     empty day round-trips honestly: the engine writes it as
     an empty plan day document, its repair keeps an empty
     document an empty day, the app renders it an unplanned
     day, and a later plan on that day writes normally. The
     census never counts it (see stateCounts): a tombstone
     is a deletion honoured, not content held. Mutates and
     returns the landed state it is given; the pre-landing
     copies are read BEFORE the caller writes anything, so
     the call stands ahead of its setLive. */
  function withTombstones(uid, landedState, pulledState) {
    if (!landedState || typeof landedState !== "object") return landedState;
    if (!landedState.plan || typeof landedState.plan !== "object" || Array.isArray(landedState.plan)) landedState.plan = {};
    var held = {};
    var live = liveState();
    if (live && live.plan && typeof live.plan === "object" && !Array.isArray(live.plan)) Object.keys(live.plan).forEach(function (day) { held[day] = true; });
    try {
      var rawC = storage.get(A.cacheKeyFor(uid));
      var cached = rawC ? JSON.parse(rawC) : null;
      if (cached && cached.plan && typeof cached.plan === "object" && !Array.isArray(cached.plan)) Object.keys(cached.plan).forEach(function (day) { held[day] = true; });
    } catch (e) {}
    var pulledPlan = (pulledState && pulledState.plan && typeof pulledState.plan === "object" && !Array.isArray(pulledState.plan)) ? pulledState.plan : {};
    Object.keys(held).forEach(function (day) { if (!(day in pulledPlan) && !(day in landedState.plan)) landedState.plan[day] = {}; });
    return landedState;
  }
  /* The adjudication's proof, from this device and this session:
     the account's Auth creation stamp (never a client written
     field), whether this device already holds a per account
     cache copy for the uid, and (app v54) that copy's collection
     census for the suspect-partial arm (Cure 1) plus the Auth
     record's last sign in stamp for the provably new judgement's
     second witness (Cure 3). App v56 (F-B17-3) adds the provably
     new judgement's third witness at the literal's end: this
     session's door verdict (auth.js's doorNewUserFor — the sign
     in result's own newness flag, granularity free where the
     last sign in stamp is not), read behind a typeof guard
     because a surface without the reader (the test harness's
     stubs) must read ABSENT and keep its standing verdicts. */
  function pullProof(user) {
    var raw = storage.get(A.cacheKeyFor(user.uid));
    var hasCache = false, cacheCounts = null;
    if (raw) { try { var c = JSON.parse(raw); hasCache = !!c && typeof c === "object" && !Array.isArray(c); if (hasCache) cacheCounts = stateCounts(c); } catch (e) {} }
    return { authCreatedAtMs: A.accountAnchorMs(user), authLastSignInAtMs: A.accountLastSignInMs(user), hasDeviceCache: hasCache, cacheCounts: cacheCounts, nowMs: Date.now(), doorIsNewUser: (window.MP_AUTH && typeof window.MP_AUTH.doorNewUserFor === "function") ? window.MP_AUTH.doorNewUserFor(user.uid) : null };
  }
  /* THE BOUNDED CENSUS STAND (app v55, Cure F1 — QA's build 17
     retest, verdict-mealprep-b17-retest.md, Finding F-B17-1,
     caught live in their census2 leg; the design and its proofs
     stand in ~/smoke/b17-bisect-verdict.md, Part 2): Cure 1's
     suspect-partial arm judges a pull poorer than the device
     cache's census NOT LOADED, and the judge is pure — the same
     pair re-judges identically forever (the Test chair's
     determinism, confirmed at function level on the shipped
     bytes). A LEGITIMATE deletion made on another device leaves
     this device's stash richer than the server for good, so the
     arm became a deadlock: the session never landed on this
     device, on an honest channel, the honest line its only
     word. The bound lives here, in the landing layer, not in
     the judge (adjudicatePull stays pure — the seam ruling,
     Test and QA pair-converged): a census-shaped NOT LOADED
     verdict (a standing profile, a non-empty answer, a cache
     census to judge against) is counted by its census PAIR —
     the pulled census against the proof's cache census, keyed
     with the uid — one count per resolution run, a changed pair
     restarting at one, and any loaded verdict, a sign out, or
     the trip itself clearing the stand. At the bound (four
     identical verdicts: the first answer and three retry
     cycles, about 45 seconds at the standing cadence — inside
     the heal envelope QA's legs already score) the stand TRIPS:
     the pulled documents are treated as loaded WITHOUT
     reconciliation (the trip landings in adopt and convergeLive
     below), because the server is canonical and a stable
     richer stash is a deletion to honour, not a partial answer
     to fear. The trip landing writes nothing, and the cache
     write inside each landing refreshes the stash from the
     landed truth, so the deadlock cannot re-form for that
     deletion and the deleted item stays deleted. Stability
     alone cannot tell a systematic lie from a deletion (the
     bisect's D-3: the two evidences are the same pair, and no
     seam carries provenance), so the worst case is named, not
     hidden: a channel lying identically forever lands the
     session on the server's ANSWERED set — the hidden items
     absent from this device's copy until a richer pull lands
     them, the server itself untouched, no delete able to
     compose from an answered snapshot. Bounded visibility on
     one device, against the proven permanent lockout. Below the
     bound, every suspect-partial verdict keeps the NOT LOADED
     treatment exactly, and the fluctuating wedge never trips
     the stand at all (its lie is a per-pull lottery: no two
     consecutive pairs are identical). The visibility refresh
     never counts: it is not a resolution run, and the deadlock
     is a resolution shape. */
  var censusStand = null, resolutionRunSeq = 0;
  var CENSUS_STAND_BOUND = 4;
  function censusStandVerdict(user, docs, proof, verdict) {
    if (verdict === "loaded") { censusStand = null; return "clear"; }
    /* Only the census shape counts: the empty answer stands are
       the age and cache arms' own country, whose verdicts the
       bound does not govern — asserted by shape here, not
       assumed: with a profile standing, a non-empty answer and
       a cache census, a NOT LOADED verdict can only have failed
       the census arm. */
    if (!isObj(docs) || !isObj(docs.profile) || A.docsAreEmpty(docs) || !isObj(proof) || !isObj(proof.cacheCounts)) return "stand";
    /* One count per resolution run, however the run is shaped:
       this run's sequence against the stand's last counted run. */
    if (censusStand && censusStand.runId >= resolutionRunSeq) return "stand";
    var key = user.uid + "|" + JSON.stringify(docsCounts(docs)) + "|" + JSON.stringify(proof.cacheCounts);
    if (censusStand && censusStand.key === key) { censusStand.count++; censusStand.runId = resolutionRunSeq; }
    else censusStand = { key: key, count: 1, runId: resolutionRunSeq };
    if (censusStand.count >= CENSUS_STAND_BOUND) { censusStand = null; return "trip"; }
    return "stand";
  }
  /* The retry: one timer at most, for one uid, re-running the
     whole resolution (the same server source pull and the chain
     behind it) every 15 seconds while the app stays open on this
     session. It stops on sign out (onUser's signed out branch
     clears it, and the fire time check names the uid it was armed
     for), it never stacks (a second schedule for the same uid is
     a no-op), and a LOADED answer simply never schedules another:
     the chain that lands clears the line by rendering over it,
     like every landing. */
  var resolutionRetryTimer = null, resolutionRetryUid = null;
  function stopResolutionRetry() {
    if (resolutionRetryTimer) { clearTimeout(resolutionRetryTimer); resolutionRetryTimer = null; }
    resolutionRetryUid = null;
  }
  function scheduleResolutionRetry(user) {
    if (resolutionRetryTimer && resolutionRetryUid === user.uid) return;
    stopResolutionRetry();
    resolutionRetryUid = user.uid;
    resolutionRetryTimer = setTimeout(function () {
      resolutionRetryTimer = null;
      var uid = resolutionRetryUid; resolutionRetryUid = null;
      if (!currentUser || currentUser.uid !== uid || currentUser.isAnonymous) return;
      resolveSignedIn(currentUser);
    }, 15000);
  }
  /* The tour re-render (app v52, QA's build 14 retest, Leg D):
     the tour can already stand open when a sign in lands (the
     app loads before the session resolves), drawn as the
     welcome variant from a moment when no session existed to
     ask the name of. app.js stands the re-render hook for
     exactly this (MP_TOUR.refresh, whose own comment names this
     layer as its caller) and until this build it had NO caller,
     so stop 1 never became the name stop on a first run. Every
     sign in landing below asks for the re-render; the tour
     itself decides what stop 1 shows (the name stop only when
     this file's hook says it applies), and a closed tour is
     left closed by the hook itself. */
  function tourRefresh() {
    if (window.MP_TOUR && window.MP_TOUR.refresh) window.MP_TOUR.refresh();
  }
  /* The NOT LOADED landing, shared by both resolution roads: the
     card renders from the session alone (its local truth — the
     empty answer was adopted over NOTHING), the honest line
     stands on it, and the retry is armed. */
  function landNotLoaded(user) {
    renderSignedIn(user, {});
    slowLoadLine();
    scheduleResolutionRetry(user);
    tourRefresh();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible" || !currentUser || currentUser.isAnonymous || adopting || pushPending) return;
    var uid = currentUser.uid;
    /* The refresh pull races the same 30 second bound (app v49,
       U5): a hang lands in the rejection handler beside it and
       the session simply keeps its working copy. It reads from
       the server (app v50, Finding 2's second shape): an answer
       out of the SDK's offline semantics here would be adopted
       over the working copy below, so this read must be the
       server's truth or no answer at all. And the answer is
       adjudicated like the resolution's (app v51): the build 13
       wedge resolves even a server source read EMPTY, and an
       empty answer is never adopted over the working copy — the
       refresh simply does not land, and the session keeps its
       truth until a loaded answer exists. (App v52: the same
       wedge also REJECTS this pull in the unavailable class —
       the F2 bisect's named mechanism — and a rejected refresh
       used to die in the silent swallow below, its session
       keeping an unlanded truth with no word spoken and nothing
       re-asked; the v52 rejection arm gave that one class the
       not loaded treatment. App v54 (Cure 4) widens the arm to
       every refusal: the night bisect's S2 stops showed the
       retry chain dying at landings in classes nobody had named,
       so the swallow is retired whole.) */
    WAIT.bound(storePromise.then(function (store) { return A.pullAccount(store, uid, { source: "server" }); }), 30000).then(function (docs) {
      if (A.adjudicatePull(docs, pullProof(currentUser)) === "notLoaded") return;
      if (JSON.stringify(docs) !== JSON.stringify(snapshot)) {
        snapshot = docs;
        var pulledState = A.docsToState(docs).state;
        /* App v57 (the F-B19-1 cure): this landing too gains
           its tombstones, the owner's adoption, and the
           deferral-gated reload — it writes the live key like
           every other landing, so it carries the same three
           obligations. */
        withTombstones(uid, pulledState, pulledState);
        setLive(pulledState);
        storage.set(A.cacheKeyFor(uid), JSON.stringify(pulledState));
        ownerAdopt(pulledState);
        reloadAfterLanding();
      }
    }, function (e) {
      /* Every refusal of the refresh pull takes the treatment
         now (app v54, Cure 4): the honest line and the retry,
         while the session stands. The v52 arm named this for
         the unavailable class alone; the night bisect's S2-5
         showed the chain the arm fed dying at the retry's own
         landing classes, so no class keeps the old swallow. */
      if (currentUser && !currentUser.isAnonymous) { slowLoadLine(); scheduleResolutionRetry(currentUser); }
    });
  });

  /* ---------------- sign in adoption ---------------- */
  function adopt(user, docs, opts) {
    adopting = true;
    var pulled = A.docsToState(docs);
    snapshot = docs;
    if (pulled.recovered.length) {
      storePromise.then(function (store) { return A.fileRecovered(store, user.uid, pulled.recovered, nowIso()); }).then(function () {}, function () {});
    }
    var raw = storage.get(A.LIVE_KEY);
    if (raw && !device.guestPotConsumed) storage.set(A.guestCacheKey(), raw);
    /* The adoption is reconciled (app v54, Cure 1 — see
       reconcileWithCache): the live key and the cache take the
       pulled state carrying anything the device's cached copy
       holds that the pull lacks, while the snapshot above stays
       the pulled documents alone. A census stand trip (app v55,
       Cure F1) lands UNRECONCILED instead: reconciliation is
       precisely what would carry the honourably deleted item
       back in, so the pulled state lands as it stands — and the
       cache write below stores that same pulled state, which
       refreshes the stash to the server's truth and ends the
       deadlock for that deletion. */
    var landedState = (opts && opts.suppressReconcile) ? pulled.state : reconcileWithCache(user.uid, pulled.state);
    /* App v57 (the F-B19-1 cure): the landed state gains its
       tombstones (clause 2 — on the reconciled road they mark
       the days the cache holds that neither the pull nor the
       reconciliation carried; on the trip road, the days the
       stash held that the server's truth deleted), the state
       owner adopts it (clause 1), and the reload takes the
       deferral (the reload cure) — returning whether it fired,
       which the first-sign-in road's convergence re-check
       reads. The guest pot stash above has already read the
       pre-landing copy, and the tombstone read inside
       withTombstones still sees it too: nothing has written
       the live key yet. */
    withTombstones(user.uid, landedState, pulled.state);
    setLive(landedState);
    storage.set(A.cacheKeyFor(user.uid), JSON.stringify(landedState));
    device.uid = user.uid; device.adoptedUid = user.uid; saveDevice();
    ownerAdopt(landedState);
    /* A parked landing is COMPLETE (app v57, the reload
       deferral): the adopting flag, which the reload used to
       make moot, stands down when the reload parks, or this
       session would never push again. The caller still reads
       the return for the parked case. */
    var fired = reloadAfterLanding();
    if (!fired) adopting = false;
    return fired;
  }
  function dailyStamps(user, isSignup) {
    if (device.lastActiveDay === todayStr() && device.lastActiveUid === user.uid) return Promise.resolve();
    device.lastActiveDay = todayStr(); device.lastActiveUid = user.uid; saveDevice();
    return storePromise.then(function (store) {
      var jobs = [store.updateDoc("users/" + user.uid, { lastActiveAt: nowIso() })];
      /* Build 8 follow on: the stamp chain's prev is the profile
         mirror in the last synced docs (snapshot), never the
         contrib document — its reads are owner only by design, so
         the getDoc that stood here refused and the chain died at
         the read. stampChain writes the moved mirror back to the
         profile and the event's delta onto the contrib document;
         the mirror in the snapshot follows what landed. */
      var mirror = snapshot && snapshot.profile ? snapshot.profile.stamps : null;
      jobs.push(A.stampChain(store, user.uid, mirror, isSignup ? "signup" : "session", todayStr()).then(function (r) {
        if (snapshot && snapshot.profile) snapshot.profile.stamps = r.mirror;
      }));
      return Promise.all(jobs);
    }).then(function () {}, function () {});
  }

  /* The create window's additions (app v54, Cure 5 — QA's night
     verdict on build 16 and the night bisect verdict, S1-B1/B2):
     what the working copy gained between a create's compose and
     its landing, per collection, by item identity. Anything
     already standing in the copy when the create began is NOT an
     addition and is never swept in — the guest pot at the import
     gate's offer and every other road keep exactly their own
     handling of what was already there. */
  function windowAdditions(entry, now) {
    var delta = { family: [], pantry: [], customRecipes: [], extras: [], events: [], imports: [], plan: {}, doneItems: {}, hiddenItems: {} };
    if (!now || typeof now !== "object") return delta;
    ["family", "pantry", "customRecipes", "extras", "events", "imports"].forEach(function (field) {
      var had = {};
      (entry && Array.isArray(entry[field]) ? entry[field] : []).forEach(function (it) { had[itemKey(it)] = true; });
      (Array.isArray(now[field]) ? now[field] : []).forEach(function (it) { if (!had[itemKey(it)]) delta[field].push(it); });
    });
    if (now.plan && typeof now.plan === "object") Object.keys(now.plan).forEach(function (day) { if (!entry || !entry.plan || !(day in entry.plan)) delta.plan[day] = now.plan[day]; });
    ["doneItems", "hiddenItems"].forEach(function (field) {
      if (now[field] && typeof now[field] === "object") Object.keys(now[field]).forEach(function (k) { if (!entry || !entry[field] || !(k in entry[field])) delta[field][k] = now[field][k]; });
    });
    return delta;
  }
  function windowDeltaEmpty(delta) {
    return !delta.family.length && !delta.pantry.length && !delta.customRecipes.length && !delta.extras.length && !delta.events.length && !delta.imports.length &&
      !Object.keys(delta.plan).length && !Object.keys(delta.doneItems).length && !Object.keys(delta.hiddenItems).length;
  }
  /* The plain road's landing merge: the start state UNIONED
     with the working copy as it stands AT LANDING TIME (app
     v57, the F-B19-1 cure, clause 3 — the bisect verdict's
     Face 2, link A). Cure 5 measured the window's additions
     against the copy as the create BEGAN — but on this road
     that copy is captured after the person's first work
     already stands in it (their saves during the door's
     answer ride the same working copy the create reads), so
     the member they added and the month they planned counted
     as pre-existing, the delta came back empty, and the
     landing wrote the blank start over the working copy:
     the erase QA's birth-session staging caught, in about
     half of its runs. The merge now unions against the
     landing-time copy itself, in reconcileWithCache's shape
     (identity union; the start state's fields win on a
     shared identity; the landing copy's non-empty name wins
     over the start's): work done during the create window
     can never be classified pre-existing-and-erasable, and
     no landing on this road writes a working copy poorer
     than the one it replaces — the cross-cutting rule of
     this round, in all four copies. entryLive stands as the
     parameter of record (the offer road's stash still
     measures against it); the union no longer consults it. */
  function mergeCreateWindow(entryLive, startState) {
    var now = liveState();
    var merged = JSON.parse(JSON.stringify(startState));
    if (!now || typeof now !== "object") return merged;
    ["family", "pantry", "customRecipes", "extras", "events", "imports"].forEach(function (field) {
      if (!Array.isArray(merged[field])) merged[field] = [];
      var have = {};
      merged[field].forEach(function (it) { have[itemKey(it)] = true; });
      (Array.isArray(now[field]) ? now[field] : []).forEach(function (it) { var k = itemKey(it); if (!have[k]) { merged[field].push(JSON.parse(JSON.stringify(it))); have[k] = true; } });
    });
    if (now.plan && typeof now.plan === "object") {
      if (!merged.plan || typeof merged.plan !== "object") merged.plan = {};
      Object.keys(now.plan).forEach(function (day) { if (!(day in merged.plan)) merged.plan[day] = JSON.parse(JSON.stringify(now.plan[day])); });
    }
    ["doneItems", "hiddenItems"].forEach(function (field) {
      if (!merged[field] || typeof merged[field] !== "object") merged[field] = {};
      if (now[field] && typeof now[field] === "object") Object.keys(now[field]).forEach(function (k) { if (!(k in merged[field])) merged[field][k] = now[field][k]; });
    });
    if (typeof now.accountName === "string" && now.accountName) merged.accountName = now.accountName;
    return merged;
  }

  /* Create a brand new account's profile from the designed empty
     state, carrying the name known by any road at that moment
     (the name on the Google or Apple profile, or none at all:
     app v50 creates the profile at once either way, and a name
     the tour asks later lands as an ordinary profile update
     through tourNameAnswered's save). When the import gate is
     about to offer the guest pot, the account is created empty
     and the pot waits in the guest cache, one tap from the
     Account card; otherwise the working copy starts as the
     designed empty state. Either way the device adopts the
     account and reloads onto it. (App v54, Cure 5: the create
     push can take seconds, and what the person saves into the
     working copy in that window used to die at the landing —
     setLive(startState) wrote the composed blank over it after
     its debounce had nowhere true to compose against (the night
     bisect's S1-B1/B2: the anchor plants, account B's member).
     Both landings below now re-read the working copy before
     they set it.) */
  function createProfile(store, user, gate, acctName) {
    /* The working copy as the create begins: the offer
       road's stash below still measures the window against
       this. The plain road's merge no longer does (app v57,
       clause 3 — see mergeCreateWindow): it unions against
       the copy as it stands at landing time. */
    var entryLive = liveState();
    if (gate === "offer") {
      adopting = true;
      var raw = storage.get(A.LIVE_KEY);
      if (raw) storage.set(A.guestCacheKey(), raw);
      device.uid = user.uid; device.adoptedUid = user.uid; device.pendingImportUid = user.uid; saveDevice();
      var startBlank = blankState();
      startBlank.accountName = acctName;
      /* The create chain races the shared bound DIRECTLY (app
         v55, Cure F2-a — QA's build 17 retest, Finding F-B17-2,
         and the b17 bisect verdict's B2a-3: this chain used to
         ride reloadOnTimeout, whose reload fired DETACHED when
         its own 30 seconds expired — in the instant pull shape
         (the pull answering empty at once, the create writes
         pending) that instant was the same one in which the
         resolution's own bound landed the session NOT LOADED:
         the reload discarded the honest line and the armed
         retry before either could be witnessed, and the whole
         cycle re-fired every 30 seconds, forever. The pend now
         belongs to the resolution's bound and retry, which own
         this chain's caller end to end: the bound lands the
         line, the retry re-runs the whole resolution — this
         create included — on its cadence until the channel
         answers. The race that remains is benign and is named:
         a pended create push may still land late at the server;
         it composes a blank start against a null baseline (the
         create arm — no deletes), a retry's second create is
         the same shape, and the landed snapshot governs what
         the session composes against from there.) */
      return WAIT.bound(A.pushAccount(store, user.uid, startBlank, null, nowIso()).then(function (created) {
        snapshot = created;
        /* The account starts empty on screen too: the pot waits
           in the guest cache, one tap from the Account card. What
           the window added belongs to that pot, not the account:
           the stash is refreshed from the working copy, so the
           window's saves ride the import like the rest of it. */
        var nowOff = liveState();
        if (!windowDeltaEmpty(windowAdditions(entryLive, nowOff))) storage.set(A.guestCacheKey(), JSON.stringify(nowOff));
        setLive(startBlank);
        storage.set(A.cacheKeyFor(user.uid), JSON.stringify(startBlank));
        /* App v57 (clause 1 + the reload deferral): the owner
           adopts the blank start too, and the reload parks
           behind an open delete flow like every landing's. */
        ownerAdopt(startBlank);
        return dailyStamps(user, true);
      }).then(function () { if (!reloadAfterLanding()) adopting = false; }), 30000);
    }
    var startState = blankState();
    startState.accountName = acctName;
    /* The shared bound directly, not the detached reload (app
       v55, Cure F2-a — see the offer road above): a pended
       create belongs to the resolution's bound and retry. */
    return WAIT.bound(A.pushAccount(store, user.uid, startState, null, nowIso()).then(function (created) {
      snapshot = created;
      /* The window merge (Cure 5): re-read the working copy,
         carry its additions into the start state, and land THAT
         — then push the merged copy against the created
         documents inside this same chain, so the additions stand
         on the server under the new snapshot before the reload,
         not on some later save's mercy. A quiet window merges
         to the start state itself and pushes nothing more. */
      var merged = mergeCreateWindow(entryLive, startState);
      var mergedDocs = A.stateToDocs(merged);
      var windowLanded = JSON.stringify(A.canonical(mergedDocs.collections)) !== JSON.stringify(A.canonical(created.collections)) ||
        (merged.accountName || "") !== ((created.profile && created.profile.name) || "");
      storage.set(A.cacheKeyFor(user.uid), JSON.stringify(merged));
      setLive(merged);
      /* App v57 (clause 1): the owner adopts the merged copy
         at the landing — the post-create page used to boot on
         whatever the erase left, and the NEXT landing's
         convergence repaired the stored copies while this
         page's memory kept the blank (the bisect verdict's
         Face 2, link B). */
      ownerAdopt(merged);
      device.uid = user.uid; device.adoptedUid = user.uid; saveDevice();
      if (!windowLanded) return dailyStamps(user, true);
      return A.pushAccount(store, user.uid, merged, created, nowIso()).then(function (next) {
        snapshot = next;
        return dailyStamps(user, true);
      });
    }).then(function () { reloadAfterLanding(); }), 30000);
  }

  /* U5's honest line (app v49): the line lands on the Account
     card's own message line, which the landing's render has just
     built. Since app v54 (Cure 4) every non-loaded landing
     renders first and stands this line after (landNotLoaded),
     so a rebuild can never erase it. */
  function slowLoadLine() {
    var m = document.getElementById("accMsg2");
    if (m) m.textContent = t("account.slowLoad");
  }

  /* The observation cure (app v50, QA build 12 round): views render
     on entry only, so a resolution that lands while a view stands
     open leaves that view showing its pre-pull paint until the
     person navigates. When a resolution lands WITHOUT a reload,
     the open view is re-rendered once through the app's own hook,
     so what landed is what the person sees. Landings that reload
     (adoptions, profile creates) need no call: the reload repaints
     everything from the adopted copy. */
  function rerenderOpenView() {
    if (window.MP_RERENDER) window.MP_RERENDER();
  }

  function onUser(user) {
    currentUser = user;
    if (!user) {
      /* The adjudication retry dies with the session (app v51),
         and the session anchor goes with it. The census stand
         dies too (app v55, Cure F1): a counted stand belongs to
         the signed in session that formed it. */
      stopResolutionRetry();
      sessionAnchorMs = null;
      censusStand = null;
      /* The convergence re-check dies with the session too
         (app v57, clause 4): its pull belongs to the account
         that armed it. */
      if (convergenceRecheckTimer) { clearTimeout(convergenceRecheckTimer); convergenceRecheckTimer = null; }
      var notice = storage.get("mealPrepNotice");
      if (notice) storage.remove("mealPrepNotice");
      renderSignedOut(notice || "");
      /* A signed out user lands on the door page (the v4 shape).
         A deletion notice takes the landing instead, once. */
      if (!notice) showDoorPage();
      return;
    }
    hideDoorPage();
    if (user.isAnonymous) {
      /* A demo session: labelled, fenced, and already seeded by the
         door that opened it. */
      if (device.demo && device.demoUid === user.uid) {
        document.body.classList.add("demoOn");
        renderSignedIn(user, {});
      } else {
        renderSignedOut(t("demo.sessionClosed"));
      }
      return;
    }
    document.body.classList.remove("demoOn");
    resolveSignedIn(user);
  }

  /* The sign in resolution, in its two roads. In app v51 the
     roads stand as their own functions so the adjudication retry
     can re-run the WHOLE resolution — the same server source
     pull and the chain behind it — rather than a lighter re-read:
     under the build 13 wedge the retry's reads resolve empty
     while the channel is down and resolve real once it heals,
     which is the only honest way to land. The dispatcher picks
     the road by the device's adopted flag at run time, exactly
     as onUser always has, and it takes the session's anchor from
     the Auth record on every run. */
  function resolveSignedIn(user) {
    /* Every run takes the next sequence number (app v55, Cure
       F1): the census stand counts verdicts by runs, and this is
       what makes one count per run structural. */
    resolutionRunSeq++;
    sessionAnchorMs = A.accountAnchorMs(user);
    if (device.adoptedUid === user.uid && device.uid === user.uid) { resolveAdopted(user); return; }
    resolveFirst(user);
  }

  /* SNAPSHOT/LIVE CONVERGENCE (app v54, Cure 2 — QA's night
     verdict on build 16, Finding N1; the night bisect verdict,
     S1 chain M4): the adopted road never wrote the live copy, so
     after an adoption reload the snapshot could hold the full
     truth while the live key stood poorer (an adoption formed
     from a shape the gate could not see, a copy blanked by any
     road), and the first push after that — a person's own save,
     a sign out, the next visit's name re-ask bookkeeping —
     deleted from the server whatever the live copy lacked.
     Now: after an adjudicated LOADED pull on this road, when
     the pulled state differs from the live copy in the loss
     direction (any collection poorer in the live copy, or no
     live copy at all), the pull LANDS in the working copy the
     way the visibility refresh lands it — reconciled with the
     device cache per Cure 1, cached at the account's cache key,
     the snapshot staying the pulled documents — so snapshot and
     live agree before any push can compose. A live copy at
     least as rich as the pull in every collection is the
     person's own newer truth and is left exactly as it stands.
     No reload is added: the landing's own render and the open
     view's re-render (rerenderOpenView, in the chain below)
     show what landed. (App v58, the F-B20-1 cure, Clause A:
     the function RETURNS the state it leaves standing — the
     landed state where it lands, the standing live copy
     where it refuses — so its two callers can take their
     baseline from that state through baselineFrom, never
     from the pulled documents; see the helper and the two
     call sites.) */
  function convergeLive(user, docs, opts) {
    var pulledState = A.docsToState(docs).state;
    /* A census stand trip (app v55, Cure F1) lands the pulled
       truth UNCONDITIONALLY and unreconciled: the loss
       direction test below guards a working copy that may hold
       the person's newer truth, but a never-landed stand's live
       copy is the signed out or local one — the server's truth
       is canonical for this landing — and reconciliation would
       carry the honourably deleted item back in. The setLive
       and the cache write are the landing's own, so snapshot,
       live and stash agree on the pulled documents and the
       deadlock cannot re-form for that deletion. */
    if (opts && opts.suppressReconcile) {
      /* App v57 (the F-B19-1 cure): the pulled state gains its
         tombstones and is adopted by the state owner before it
         lands — on the shipped build this landing wrote the
         stored copies alone, and the resolution tail's own
         bookkeeping save then serialised the pre-landing
         memory over them, so the trip's first later push
         carried the deleted day back to the server (QA's
         build 19 retest, leg (b)). */
      withTombstones(user.uid, pulledState, pulledState);
      setLive(pulledState);
      try { storage.set(A.cacheKeyFor(user.uid), JSON.stringify(pulledState)); } catch (e) {}
      ownerAdopt(pulledState);
      return pulledState;
    }
    var live = liveState();
    var want = stateCounts(pulledState);
    var have = stateCounts(live);
    var poorer = !live || A.COLLECTIONS.some(function (kind) { return (have[kind] || 0) < (want[kind] || 0); });
    if (!poorer) return live;
    var landedState = reconcileWithCache(user.uid, pulledState);
    /* App v57: tombstones ride the reconciled landing too,
       and the owner adopts what landed (clause 1) — this
       convergence repaired the stored copies only, and the
       landing tail's bookkeeping could clobber the repair
       back out of the live key within the same landing (the
       bisect verdict's Face 2 link B and Face 3-B). */
    withTombstones(user.uid, landedState, pulledState);
    setLive(landedState);
    try { storage.set(A.cacheKeyFor(user.uid), JSON.stringify(landedState)); } catch (e) {}
    ownerAdopt(landedState);
    return landedState;
  }

  /* THE RELOAD DEFERRAL (app v57, the cure for Cure 6's open
     edge — QA's build 19 retest, leg (d), and the bisect
     verdict's C6-B): Cure 6 proved an open delete flow
     survives a card REBUILD; it cannot survive the landing's
     RELOAD, which takes the box and the typed password with
     the page. So a resolution landing's reload PARKS while a
     delete flow stands open. The signal is the one the
     verdict proved readable at the reload instant: the
     delete box standing in the card's DOM with content, and
     its go control (and, on the password road, the password
     field) present. The alternative cure — preserving the
     typed password across the reload — was rejected in the
     verdict: a typed password held in any storage is a
     credential exposure, and this shape parks the navigation
     instead of the secret. Storage writes land immediately;
     only the reload parks; the parked resolution is COMPLETE
     (nothing re-arms behind it — the resolution retry belongs
     to answers that never landed, and this one landed). The
     delete flow's own reload (runDeletion) never parks: it
     is not a landing. When the person closes the box, no
     retroactive reload fires — the session simply continues
     on the landed storage, and the next natural reload or
     boot reads the landed truth like any other. Returns true
     when the reload fired, false when it parked. */
  function deleteFlowOpen() {
    var box = document.getElementById("accDeleteBox");
    if (!box || !box.innerHTML) return false;
    return !!document.getElementById("accDeletePw") || !!document.getElementById("accDeleteGo");
  }
  function reloadAfterLanding() {
    if (deleteFlowOpen()) return false;
    location.reload();
    return true;
  }

  /* THE POST-LANDING CONVERGENCE RE-CHECK (app v57, the
     F-B19-1 cure, clause 4 — the bisect verdict's Face 3-A):
     on a cache-less device the suspect-partial arm cannot
     speak (it judges against a cache census that does not
     exist), so a partial answer — the profile and most
     collections standing, one collection read empty by an
     SDK-internal shape — adjudicates LOADED and lands as the
     truth, and a loaded verdict owns no retry: nothing inside
     the visit ever re-asks. The cure is ONE silent re-check:
     when a loaded landing's own shape is the one the arm
     could not judge (a profile standing, no device cache
     behind the verdict, at least one collection empty, and
     the account not provably new — a provably new account's
     empties are its truth), the resolution re-pulls once, on
     the house retry cadence (15 seconds, the same rhythm the
     NOT LOADED retry keeps), and re-adjudicates. A richer
     answer converges in through the standing landing (clause
     1 carries it into the owner's memory with it); an answer
     that agrees, or fails to load, moves nothing — the
     landed state stands either way, and a truly empty
     collection stays empty at the cost of one bounded pull.
     The warrant is computed where the verdict is known; on
     the first-sign-in road the landing reloads, which would
     kill the timer, so the warrant crosses the reload in
     session storage, keyed by uid and consumed once by the
     adopted road's landing — or in-page, when the adoption's
     reload parks behind an open delete flow and no second
     page life is coming. */
  var CONVERGENCE_RECHECK_MS = 15000;
  var RECHECK_WARRANT_KEY = "mpConvergenceRecheck";
  var convergenceRecheckTimer = null;
  function recheckWarranted(docs, proof) {
    if (!isObj(docs) || !isObj(docs.profile) || !isObj(proof)) return false;
    if (proof.hasDeviceCache) return false;
    if (A.provablyNewAccount(proof)) return false;
    var counts = docsCounts(docs);
    return A.COLLECTIONS.some(function (kind) { return (counts[kind] || 0) === 0; });
  }
  function recheckWarrantSet(uid) { try { sessionStorage.setItem(RECHECK_WARRANT_KEY, uid); } catch (e) {} }
  function recheckWarrantTake(uid) {
    try {
      if (sessionStorage.getItem(RECHECK_WARRANT_KEY) === uid) { sessionStorage.removeItem(RECHECK_WARRANT_KEY); return true; }
    } catch (e) {}
    return false;
  }
  function scheduleConvergenceRecheck(user) {
    if (convergenceRecheckTimer) return;
    var uid = user.uid;
    convergenceRecheckTimer = setTimeout(function () {
      convergenceRecheckTimer = null;
      if (!currentUser || currentUser.uid !== uid || currentUser.isAnonymous) return;
      WAIT.bound(storePromise.then(function (store) { return A.pullAccount(store, uid, { source: "server" }); }), 30000).then(function (docs2) {
        if (!currentUser || currentUser.uid !== uid) return;
        if (A.adjudicatePull(docs2, pullProof(currentUser)) === "notLoaded") return;
        var before = docsCounts(snapshot), after = docsCounts(docs2);
        var richer = A.COLLECTIONS.some(function (kind) { return (after[kind] || 0) > (before[kind] || 0); });
        if (!richer) return;
        /* App v58 (the F-B20-1 cure, Clause A — the bisect
           census's B2): this assignment used to take the
           re-check's pulled documents as the baseline
           outright, on a richer-in-any-kind answer that
           could be poorer in another kind — a plan day
           another device deleted inside the window — while
           the convergence's landing went through the cache
           union and carried that day back into the state.
           Baseline fresh, state stale: the pair the
           sign-out later composed. The baseline is now
           taken from the state the convergence leaves
           standing, through baselineFrom, so state and
           baseline describe the same copy after the
           refresh and no later writer can compose the
           deletion back. */
        snapshot = baselineFrom(convergeLive(currentUser, docs2));
      }, function () {});
    }, CONVERGENCE_RECHECK_MS);
  }

  function resolveAdopted(user) {
      /* Already adopted on this device: resolve the tier, refresh the
         card, and let the save hook carry changes from here. A
         profile that still carries no name runs the re-ask decision
         (the tour's name stop, or one quiet re-offer on a later
         visit, then never again). */
      /* U5 (app v49): the whole resolution chain (the pull, the
         tier, the record read) races a 30 second bound through
         the shared helper. (App v54, Cure 4 — QA's night verdict
         on build 16, Finding N2, and the night bisect verdict's
         S2 stops A and B: the retry used to arm only from the
         NOT LOADED landing, so a retried pull that pended into
         this bound, or refused in any class without a name,
         landed in the terminal catch's bare fallback — the card
         rendered, nothing re-armed, and the render itself wiped
         the standing honest line; the chain died at pull 2 while
         the identical bytes healed on another run. The terminal
         catch below now takes the NOT LOADED treatment for EVERY
         non-loaded landing, whatever class carried it there —
         the adjudicated not loaded, the unavailable refusal, the
         bound's own timeout, any other refusal: render the
         session, stand the line AFTER the render so no rebuild
         can erase it, arm the retry — until an adjudicated LOADED
         answer lands or the session signs out. The classes keep
         their names in the classifiers above; none of them is a
         dead end any more.) */
      WAIT.bound(storePromise.then(function (store) {
        var pulledDocs = null;
        /* Whether this run's answer tripped the census stand
           (app v55, Cure F1): set at the adjudication below and
           read at the convergence, the way pulledDocs is. */
        var censusTripped = false;
        /* The convergence re-check's warrant for this run (app
           v57, clause 4): set at the adjudication below and
           read at the landing's tail, the same way. */
        var recheckOwn = false;
        /* The resolution pull reads from the SERVER (app v50,
           Finding 2): with the Listen channel wedged the SDK used
           to answer this pull out of its offline semantics within
           seconds, an empty account with no rejection, no timeout
           and no honest line, and for an account holding real data
           that empty answer is what the person would have been
           shown. A server source read pends or refuses instead,
           so the bound above and its fallback own the shape and
           account.slowLoad stands. (App v51: QA's build 13 retest
           proved the server source read can also RESOLVE, empty,
           out of the SDK's internal state while every network
           request pends — the adjudication directly below now
           judges that resolved answer before anything touches
           it, and the bound keeps the classes it always owned.) */
        return A.pullAccount(store, user.uid, { source: "server" }).then(function (docs) {
          /* The adjudication (app v51): the resolved value is
             judged HERE, on the success path, before the heal,
             the tier or the record read may touch it. An empty
             answer for an account that is not provably new is
             no answer: it is thrown to the terminal catch, whose
             NOT LOADED treatment (app v54, Cure 4) stands the
             line on the first pull and arms the retry — no catch
             wired only to a timeout can ever see this class. */
          /* The verdict is routed through the census stand (app
             v55, Cure F1, censusStandVerdict above): a loaded
             verdict clears any stand this session was holding,
             and a census-shaped NOT LOADED verdict below the
             bound throws to the terminal catch exactly as it
             always has — but at the bound the stand trips, and
             this answer is treated as loaded, unreconciled, at
             the convergence below. */
          var proof = pullProof(user);
          var verdict = A.adjudicatePull(docs, proof);
          censusTripped = verdict === "notLoaded" && censusStandVerdict(user, docs, proof, verdict) === "trip";
          if (verdict === "loaded") censusStandVerdict(user, docs, proof, verdict);
          if (verdict === "notLoaded" && !censusTripped) throw notLoadedError();
          recheckOwn = verdict === "loaded" && !censusTripped && recheckWarranted(docs, proof);
          if (docs.profile) return docs;
          /* No profile on the server for an adopted account (app
             v50, the Finding 1 heal): the pre-v50 deferred join
             could leave exactly this behind, a device flagged
             adopted whose every push was held for a name that
             never came, its cooking living only in the working
             copy. The cure creates the profile at once FROM that
             working copy, so everything on this device is saved
             from this moment and the held edits finally land; the
             resolution then continues on the created documents. */
          var healed = liveState() || blankState();
          return A.pushAccount(store, user.uid, healed, null, nowIso()).then(function (created) {
            if (device.pendingJoinUid) { device.pendingJoinUid = null; saveDevice(); }
            return created;
          });
        }).then(function (docs) {
          pulledDocs = docs;
          /* The convergence (app v54, Cure 2, convergeLive
             above): the loaded pull lands in the working copy
             wherever the copy stands poorer, before the tier,
             the record or any later push can read the split. A
             census stand trip (app v55, Cure F1) converges
             unconditionally and unreconciled instead.
             (App v58, the F-B20-1 cure, Clause A — the bisect
             census's B1: this resolution used to assign the
             pulled documents to the baseline BEFORE the
             convergence judged the landing, so a pull poorer
             in a deleted collection — refused by the
             convergence's loss-direction guard, rightly —
             still refreshed the baseline past the standing
             state, and the first later writer composed the
             pair and undid the deletion. The baseline is now
             taken from the state the convergence leaves
             standing, through baselineFrom.) */
          snapshot = baselineFrom(convergeLive(user, docs, censusTripped ? { suppressReconcile: true } : undefined));
          return A.syncTier(store, user.uid, { demo: false, source: "server" });
        }).then(function (t) {
          if (t) {
            entitlement = t.entitlement;
            /* The entitlement record joins the resolution here
               (payments wiring, app v45; PAYMENTS-CHAPTER-PLAN
               section 3) — for a paying user it is the primary
               and shaping authority: the client reads its OWN
               record at subscriptions/{uid} — system written only,
               the rules deny every client write — and a live Plus
               stamp folds pro into the session entitlement the
               gates read. This is the record's one read in the
               app: it happens once, on this resolution path, and
               getEntitlement itself stays a pure session read, so
               no free feature ever consults the record. A denied
               or failed read resolves free (fail closed). */
            return A.readEntitlementRecord(store, user.uid, { demo: false, source: "server" }).then(function (r) {
              if (r && r.entitlement === "pro") entitlement = "pro";
              /* The payments module warms up beside the record read
                 (enabling build, app v47): refresh hands the real
                 provider this account's id (the app user id in the
                 brain is the app's own account id, RC-MAPPING), so a
                 later buy or restore speaks for the right person.
                 No gate reads its opinion: the record above is the
                 sole authority (HQ's fence). */
              if (window.MP_PAYMENTS && window.MP_PAYMENTS.enabled()) window.MP_PAYMENTS.refresh(user.uid);
              renderSignedIn(user, {});
              rerenderOpenView();
              tourRefresh();
              nameAskFlow(user, pulledDocs);
              /* The convergence re-check arms (app v57,
                 clause 4): this landing's own warrant, or the
                 one the first-sign-in road left in session
                 storage ahead of its adoption reload. */
              if (recheckOwn || recheckWarrantTake(user.uid)) scheduleConvergenceRecheck(user);
              return dailyStamps(user, false);
            });
          }
        });
      }), 30000).catch(function (e) { landNotLoaded(user); });
  }

  function resolveFirst(user) {
    /* First sign in of this account on this device. The chain
       races the same 30 second bound as the adopted road above
       (app v49, U5), and its terminal catch takes the same NOT
       LOADED treatment as every non-loaded landing (app v54,
       Cure 4 — see the catch at resolveAdopted's tail). */
    /* Whether this run's answer tripped the census stand (app
       v55, Cure F1): set at the adjudication below and read at
       the standing account branch's adoption. */
    var censusTripped = false;
    WAIT.bound(storePromise.then(function (store) {
      /* The server source again (app v50, Finding 2): a signup
         decision made on an offline empty answer would create a
         blank profile over a real account. (App v51: the answer
         is adjudicated below before the signup decision is made
         from it at all — the build 13 wedge resolves the server
         source read empty, and createProfile never fires off an
         unadjudicated answer.) */
      return A.pullAccount(store, user.uid, { source: "server" }).then(function (docs) {
        /* The verdict is routed through the census stand (app
           v55, Cure F1, censusStandVerdict above), as on the
           adopted road: below the bound a NOT LOADED verdict
           throws to the terminal catch exactly as it always has;
           at the bound the stand trips and this answer is
           treated as loaded, unreconciled, at the adoption
           below. A loaded verdict clears any stand. */
        var proof = pullProof(user);
        var verdict = A.adjudicatePull(docs, proof);
        censusTripped = verdict === "notLoaded" && censusStandVerdict(user, docs, proof, verdict) === "trip";
        if (verdict === "loaded") censusStandVerdict(user, docs, proof, verdict);
        if (verdict === "notLoaded" && !censusTripped) throw notLoadedError();
        var pot = liveState();
        var gate = A.importGate({ profile: docs.profile, potState: pot, docs: docs, deviceConsumed: device.guestPotConsumed });
        var isSignup = !docs.profile;
        if (isSignup) {
          /* A brand new account. The door created it and asked
             nothing else (the v4 shape): the profile is created at
             once, carrying the name known by any road (a Google or
             Apple profile name, or none at all). The name is data,
             never a gate (app v50, QA build 12 Finding 1): Mina's
             tour still asks it at its first stop inside the app,
             and the answer updates the profile through the ordinary
             save, but no save ever waits for it, and the guest pot
             keeps the import gate's own road either way. */
          var acctName = user.displayName || "";
          /* The legacy heal (app v50): a device the pre-v50 deferred
             join left behind can hold this account's only copy in
             its per account cache (the copy its last sign out set
             aside) while the server still has no profile. That copy
             is the account's own, keyed by its uid and written only
             from its own sessions: create the profile FROM it, so
             the stranded cooking is saved and adopted, never
             overwritten by a blank start. The guest pot is not that
             copy and keeps its road: when the gate would offer it,
             it is stashed for the offer exactly as createProfile
             leaves it, and the offer re-runs after the reload. */
          var cachedRaw = storage.get(A.cacheKeyFor(user.uid));
          var cached = null;
          try { cached = cachedRaw ? JSON.parse(cachedRaw) : null; } catch (e) {}
          if (cached && A.hasUserData(cached)) {
            adopting = true;
            if (gate === "offer") {
              var raw0 = storage.get(A.LIVE_KEY);
              if (raw0 && !device.guestPotConsumed) storage.set(A.guestCacheKey(), raw0);
              device.pendingImportUid = user.uid;
            }
            device.uid = user.uid; device.adoptedUid = user.uid;
            if (device.pendingJoinUid) device.pendingJoinUid = null;
            saveDevice();
            /* The shared bound directly, not the detached
               reload (app v55, Cure F2-a — see createProfile's
               offer road): a pended heal push belongs to the
               resolution's bound and retry, like the creates. */
            return WAIT.bound(A.pushAccount(store, user.uid, cached, null, nowIso()).then(function (created) {
              snapshot = created;
              setLive(cached);
              storage.set(A.cacheKeyFor(user.uid), JSON.stringify(cached));
              /* App v57 (clause 1 + the reload deferral): the
                 owner adopts the healed copy, and the reload
                 parks like every landing's. */
              ownerAdopt(cached);
              return dailyStamps(user, true);
            }).then(function () { if (!reloadAfterLanding()) adopting = false; }), 30000);
          }
          return createProfile(store, user, gate, acctName);
        }
        /* A census stand trip (app v55, Cure F1) adopts
           unreconciled, like the adopted road's convergence. A
           trip never reaches the signup branch above: its
           counted shape requires a standing profile, so this
           branch is the only one a trip can land on. */
        /* The convergence re-check's warrant (app v57, clause
           4): a loaded landing on the shape the suspect-partial
           arm could not judge arms one silent re-pull — set
           BEFORE the adoption, because the adoption's reload
           would kill an in-page timer; the warrant crosses the
           reload in session storage instead. When the reload
           parks behind an open delete flow, the adopted road
           never runs in this page life, so the re-check arms
           here. A trip landing is the census stand's own
           convergence and never arms it. */
        var recheckWarrant = !censusTripped && recheckWarranted(docs, proof);
        if (recheckWarrant) recheckWarrantSet(user.uid);
        var adoptReloaded = adopt(user, docs, censusTripped ? { suppressReconcile: true } : undefined);
        if (recheckWarrant && adoptReloaded === false) { recheckWarrantTake(user.uid); scheduleConvergenceRecheck(user); }
        return dailyStamps(user, false);
      });
    }), 30000).catch(function (e) { landNotLoaded(user); });
  }

  /* After an adoption reload with an import waiting, re-offer it. */
  function maybeOfferImport(user) {
    if (!user || user.isAnonymous || device.pendingImportUid !== user.uid) return;
    /* The same 30 second bound as the resolution path (app v49,
       U5): a pull that never answers lands in the swallow catch
       below, exactly as a refused one does. */
    WAIT.bound(storePromise.then(function (store) {
      return A.pullAccount(store, user.uid, { source: "server" }).then(function (docs) {
        var potRaw = storage.get(A.guestCacheKey());
        var pot = null;
        try { pot = potRaw ? JSON.parse(potRaw) : null; } catch (e) {}
        var gate = A.importGate({ profile: docs.profile, potState: pot, docs: { profile: docs.profile, collections: {} }, deviceConsumed: device.guestPotConsumed });
        /* The account was created empty for this choice, so its own
           collections are disregarded here; the profile stamp is the
           gate that matters, plus the pot itself. */
        if (pot && !docs.profile.dataImportedAt && !device.guestPotConsumed) {
          renderSignedIn(user, { importOffer: true });
          rerenderOpenView();
        } else {
          device.pendingImportUid = null; saveDevice();
        }
      });
    }), 30000).catch(function () {});
  }

  /* U6 (app v49): the reload gated chains race a 30 second
     bound. Local state is already consistent when these chains
     run (the device record and the live copy are written before
     the push they wait on), so a chain that never answers reloads
     anyway and the sign in resolution on the other side reads
     the truth. Any other rejection keeps the behaviour it always
     had: the bound adds duration handling beside the settle
     handling, never instead of it. (App v55, Cure F2-a: from
     this build only the demo entry rides this wrapper — the
     create and legacy heal chains race the shared bound
     directly at their sites, because their pend belongs to a
     resolution that carries its own bound and retry; the demo
     road's local state IS consistent when its chain runs, so
     the U6 premise holds here exactly as written.) */
  function reloadOnTimeout(promise) {
    return WAIT.bound(promise, 30000).then(function (v) { return v; }, function (e) {
      if (WAIT.isTimeout(e)) { location.reload(); return undefined; }
      throw e;
    });
  }
  /* Sign out is the one reload gated chain that does NOT reload
     on a timeout (app v49, U6): the person is told, on the
     Account card's own message line, and the session stands
     exactly as it stands. */
  function boundSignOut(promise) {
    return WAIT.bound(promise, 30000).then(function () {}, function (e) {
      if (WAIT.isTimeout(e)) {
        var m = document.getElementById("accMsg2");
        if (m) m.textContent = t("account.slowSignOut");
        return;
      }
      throw e;
    });
  }

  function signOutFlow() {
    var user = currentUser;
    if (!user) return Promise.resolve();
    var finish = function () {
      return window.MP_AUTH.signOut().then(function () { location.reload(); });
    };
    if (device.demo) {
      storage.remove(A.cacheKeyFor(user.uid));
      var guestRaw = storage.get(A.guestCacheKey());
      if (guestRaw && !device.guestPotConsumed) setLive(JSON.parse(guestRaw)); else setLive(blankState());
      device.demo = false; device.demoUid = null; saveDevice();
      return boundSignOut(finish());
    }
    var raw = storage.get(A.LIVE_KEY);
    if (raw) storage.set(A.cacheKeyFor(user.uid), raw);
    var st = liveState();
    /* Sign out pushes the working copy first, always (app v50):
       every signed in account has had a profile to push to since
       its first moment, so no join state signs out unsaved. */
    var push = st ? storePromise.then(function (store) { return A.pushAccount(store, user.uid, st, snapshot, nowIso()); }) : Promise.resolve();
    return boundSignOut(push.then(function () {}, function () {}).then(function () {
      var guestRaw2 = storage.get(A.guestCacheKey());
      if (guestRaw2 && !device.guestPotConsumed) { try { setLive(JSON.parse(guestRaw2)); } catch (e) { setLive(blankState()); } }
      else setLive(blankState());
      device.uid = null; device.adoptedUid = null; device.pendingImportUid = null; device.pendingJoinUid = null; saveDevice();
      return finish();
    }));
  }

  /* The tour's last stop offer (design section 2): one soft door at
     the end of the tour, handled here so app.js stays free of
     account code. In v33 the tap opens the door page itself, the
     one sign up surface the app has. */
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.id === "guideAccount") {
      var gm = document.getElementById("guideModal");
      if (gm) gm.classList.add("hidden");
      showDoorPage();
    }
  });

  /* U1, the boot watchdog (app v49): the first auth answer rides
     the SDK load and the provider's subscription, and a load that
     stalls used to leave the boot on its first paint forever, the
     door never shown at all. If no first answer has landed within
     15 seconds of the listener registering, the door lands anyway,
     in its signed out shape, with the honest slow line, and every
     road on it stays live: the guest exit works (and is remembered,
     below), the social doors run under their own bounds, and the
     email walk runs. A late answer still resolves the session
     normally: onUser re-renders over the watchdog's landing and
     the line goes with the old door. */
  var doorWatchdog = setTimeout(function () {
    if (authAnswered) return;
    watchdogLanded = true;
    var notice = storage.get("mealPrepNotice");
    if (notice) { onUser(null); return; }
    renderSignedOut("");
    showDoorPage();
    doorMsg(" " + t("door.slowSignin"));
  }, 15000);
  window.MP_AUTH.onChange(function (user) {
    if (!authAnswered) { authAnswered = true; clearTimeout(doorWatchdog); }
    /* A guest exit taken from the watchdog's door stands: the late
       signed out answer refreshes the card behind the app instead
       of landing the door again. */
    if (!user && watchdogLanded && preAnswerGuestExit) { renderSignedOut(""); return; }
    onUser(user);
    if (user && !user.isAnonymous) maybeOfferImport(user);
  });
})();
