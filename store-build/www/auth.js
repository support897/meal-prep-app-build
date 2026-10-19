/* Meal Prep sign in (app v23, accounts wave).
   The sign in set is FIXED by ruling (HQ, 15 Oct 2026): exactly
   three doors — Google, Apple, and email + the user's own password
   (Firebase Authentication holds the passwords, hashed). There is NO
   passwordless email link door in this app: no link is offered, sent
   or completed anywhere in this file or its UI (the grep proof lives
   in the unit suite). Password reset rides Firebase's own reset
   email, which is part of the password door, not a sign in door.

   Shape: a thin facade (MP_AUTH) over a provider seam. Tests drive
   the facade with a fake provider; the browser gets the Firebase
   provider below. The Firebase SDK is loaded LAZILY, by script tag,
   the first time a sign in action needs it, and only ever when the
   project slot in accounts-config.js is filled. With the slot empty
   (the shipped state) this file defines objects and does nothing:
   no SDK, no network, no doors. */
(function (global) {
  "use strict";

  var DOORS = ["google", "apple", "email"];
  var provider = null;

  /* QA F1-LATENT: every door checks the provider FIRST and, with no
     provider installed, returns this rejection. The old shape called
     a method on the rejected promise returned here, which threw a
     TypeError synchronously instead of refusing politely. */
  function notOn() {
    return Promise.reject(new Error("sign in is not switched on"));
  }

  /* ----------------------------------------------------------------
     The one bounding helper (app v49, the fleet wait census cures).
     Every wait that used to pend forever now races through
     boundWait: a promise that has not settled inside its bound
     rejects with the timeout error below, and every rejection path
     the call already owned receives it unchanged, so a wait that
     runs long lands exactly where a refusal always landed. The
     error's code (mp/timeout) is an internal marker only: no
     surface ever prints it (the door's fence and every other line
     map it like the network failure it stands beside). The helper
     is shared, never copied: this file loads before payments.js,
     app.js and account-sync.js, and each of them reads it off the
     global as MP_WAIT. */
  function timeoutError() {
    var e = new Error("the wait timed out");
    e.code = "mp/timeout";
    e.timeout = true;
    return e;
  }
  function isTimeout(e) { return !!(e && (e.code === "mp/timeout" || e.timeout === true)); }
  function boundWait(promise, ms) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(timeoutError());
      }, ms);
      Promise.resolve(promise).then(function (v) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      }, function (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }
  global.MP_WAIT = { bound: boundWait, isTimeout: isTimeout, TIMEOUT_CODE: "mp/timeout" };

  var MP_AUTH = {
    DOORS: DOORS,
    /* Tests and the browser glue install the provider here. */
    setProvider: function (p) { provider = p; },
    hasProvider: function () { return !!provider; },
    currentUser: function () { return provider ? provider.currentUser : null; },
    onChange: function (cb) {
      if (!provider) return function () {};
      return provider.onChange(cb);
    },
    signInGoogle: function () { return provider ? provider.signInGoogle() : notOn(); },
    signInApple: function () { return provider ? provider.signInApple() : notOn(); },
    signInEmail: function (email, password) { return provider ? provider.signInEmail(email, password) : notOn(); },
    /* The user's own name is collected at joining (HQ ruling, 15 Oct
       16:28), sequenced door-first (15 Oct 21:26): the door creates
       the account with no name on it, the name is asked on the very
       next screen, set as the sign in record's display name, and
       carried onto the profile by the sync glue. The optional name
       argument stays for a caller that already holds the name (the
       provider profile path); the door passes none. */
    signUpEmail: function (email, password, name) { return provider ? provider.signUpEmail(email, password, name) : notOn(); },
    setDisplayName: function (name) { return provider ? provider.setDisplayName(name) : notOn(); },
    resetPassword: function (email) { return provider ? provider.resetPassword(email) : notOn(); },
    signInAnon: function () { return provider ? provider.signInAnon() : notOn(); },
    signOut: function () { return provider ? provider.signOut() : notOn(); },
    /* Account deletion (design section 7): the fresh sign in check
       runs before the sweep, and the sign in record is deleted last.
       reauthKind tells the caller which door this account uses, so
       the words and the field on screen match the account; reauthFor
       runs that door's check. Like every door above, each of these
       checks the provider first and refuses politely without one. */
    reauthKind: function (user) {
      var provs = (user && user.providers) || [];
      if (provs.indexOf("password") !== -1) return "password";
      if (provs.indexOf("google.com") !== -1) return "google";
      if (provs.indexOf("apple.com") !== -1) return "apple";
      return user && user.email ? "password" : "google";
    },
    reauthFor: function (user, password) {
      var kind = MP_AUTH.reauthKind(user);
      if (kind === "google") return MP_AUTH.reauthGoogle();
      if (kind === "apple") return MP_AUTH.reauthApple();
      return MP_AUTH.reauthEmail(password);
    },
    reauthEmail: function (password) { return provider ? provider.reauthEmail(password) : notOn(); },
    reauthGoogle: function () { return provider ? provider.reauthGoogle() : notOn(); },
    reauthApple: function () { return provider ? provider.reauthApple() : notOn(); },
    deleteCurrentUser: function () { return provider ? provider.deleteCurrentUser() : notOn(); }
  };

  /* ----------------------------------------------------------------
     The Firebase provider (browser only). The compat builds are used
     because this app is global scripts end to end; they expose the
     one firebase namespace and load fine in the store shell's web
     view. Loading is by injected script tag, once, on first use.
     The SDK set is VENDORED (app v39, the recipe of record): the
     compat files at the version pinned below live beside the app in
     vendor-firebase/ and the loader reads them from there, so the
     app makes zero remote module loads, on the web and inside the
     package alike. (Before v39 this loader fetched the same pinned
     version from gstatic at runtime; inside the package that remote
     load was the single throat for every door.) */
  var SDK_VERSION = "10.12.2";
  var sdkPromise = null;
  function loadSdk() {
    if (sdkPromise) return sdkPromise;
    var attempt = new Promise(function (resolve, reject) {
      if (global.firebase && global.firebase.auth && global.firebase.firestore) { resolve(global.firebase); return; }
      var base = "vendor-firebase/";
      var files = ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"];
      var i = 0;
      function next() {
        if (i >= files.length) {
          if (global.firebase) resolve(global.firebase); else reject(new Error("firebase sdk did not load"));
          return;
        }
        var fileLoaded = new Promise(function (res, rej) {
          var s = global.document.createElement("script");
          s.src = base + files[i++];
          s.onload = res;
          s.onerror = function () { rej(new Error("firebase sdk failed to load: " + s.src)); };
          global.document.head.appendChild(s);
        });
        /* U2a (app v49): a script tag that neither loads nor errors
           used to pend this promise, and with it every door,
           forever. Each file now races a 20 second bound through
           the shared helper, and the timeout reaches the load's
           own rejection below like any failed load. */
        boundWait(fileLoaded, 20000).then(next, reject);
      }
      next();
    });
    /* U2b (app v49): a rejected load used to stay cached, so one
       failure bricked sign in until a reload. The cached promise
       clears itself on rejection and the next call retries the
       load; a load that succeeded stays cached as before. */
    sdkPromise = attempt.then(function (fb) { return fb; }, function (e) { sdkPromise = null; throw e; });
    return sdkPromise;
  }

  /* The Auth record's own time stamps, in milliseconds (app v51):
     creationTime is stamped by the Auth service when the account
     was created and no client write path moves it in either
     direction, which is why the free month anchor and the sign in
     resolution's provably new test read it (accounts.js,
     accountAnchorMs and provablyNewAccount) and never the client
     writable Firestore createdAt field (QA's build 13 anchor
     probe, verdict 5ff194fe). Any shape the record may carry the
     stamp in is read; an absent or unreadable stamp is null, and
     null anchors to nothing. */
  function authTsMs(v) {
    if (typeof v === "number" && isFinite(v) && v > 0) return v;
    if (typeof v === "string" && v) { var ms = Date.parse(v); return isFinite(ms) ? ms : null; }
    if (v && typeof v === "object" && typeof v.seconds === "number" && isFinite(v.seconds)) return v.seconds * 1000 + Math.floor((typeof v.nanoseconds === "number" && isFinite(v.nanoseconds) ? v.nanoseconds : 0) / 1e6);
    return null;
  }

  function normUser(u) {
    if (!u) return null;
    var md = u.metadata && typeof u.metadata === "object" ? u.metadata : {};
    return { uid: u.uid, email: u.email || null, displayName: u.displayName || null, isAnonymous: u.isAnonymous === true, providers: (u.providerData || []).map(function (p) { return p.providerId; }), createdAtMs: authTsMs(md.creationTime), lastSignInAtMs: authTsMs(md.lastSignInTime) };
  }

  /* ----------------------------------------------------------------
     The native door route (app v39). Inside the store package the
     web popup doors cannot complete: QA's config census on build 3
     found the package carried no GoogleService-Info.plist, no URL
     scheme and no Apple entitlement, so the popups had nothing to
     land on. The package now wires the maintained Capacitor
     Firebase Authentication plugin (@capacitor-firebase/
     authentication 8.5.2, capawesome-team) on the native side, and
     when this code runs inside the package AND that plugin is on
     the bridge, the Google and Apple doors sign in natively through
     it. The credential the plugin returns is then handed to the
     SAME Firebase JS auth as the web path (the pattern in the
     plugin's own Firebase JavaScript SDK guide):
       Google: GoogleAuthProvider.credential(result.credential.idToken)
       Apple:  OAuthProvider("apple.com").credential({ idToken,
               rawNonce: result.credential.nonce }) — the plugin
               generates the nonce, sends its SHA-256 hash to Apple
               and returns the raw nonce for exactly this hand off,
               and Apple runs with skipNativeAuth true, the guide's
               stated requirement for the JS SDK road.
     The signed in user, the auth state listener and every
     Firestore flow are then exactly the web path's. On the open
     web nothing changes: there is no Capacitor bridge, the plugin
     check returns null and the popup doors run byte for byte as
     before. The plugin is read off the bundled bridge
     (window.Capacitor.Plugins.FirebaseAuthentication), never
     loaded from a network URL, so the zero external requests rule
     stands. Fail safe: the native road is chosen ONLY when native
     and plugin are both present, and a plugin error, or a result
     carrying no id token, rejects down the same promise chain the
     popup errors take, so the door answers through its usual
     handler (account-sync.js doorFail) and never hangs. */
  function nativeAuthPlugin() {
    var cap = global.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;
    var plug = (cap.Plugins || {}).FirebaseAuthentication;
    if (!plug || typeof plug.signInWithGoogle !== "function" || typeof plug.signInWithApple !== "function") return null;
    return plug;
  }
  /* Exposed for the unit suite: the branch choice is pinned there.
     The doors themselves read the plugin only through the provider
     below. */
  MP_AUTH._nativeAuthPlugin = nativeAuthPlugin;

  /* The timestamp serialiser for the store seam: the one place the
     "__MP_SERVER_TS__" sentinel becomes the SDK's server timestamp.
     A factory so the unit suite can drive the shipped function
     itself against a fake SDK (build 8's join pin: the contrib
     delta and this serialiser are the two halves that were pinned
     separately for too long). */
  function makeSwapTs(fb) {
    return function swapTs(v) {
      if (v === "__MP_SERVER_TS__") return fb.firestore.FieldValue.serverTimestamp();
      if (Array.isArray(v)) return v.map(swapTs);
      if (v && typeof v === "object") { var o = {}; Object.keys(v).forEach(function (k) { o[k] = swapTs(v[k]); }); return o; }
      return v;
    };
  }
  MP_AUTH._makeSwapTs = makeSwapTs;

  function firebaseProvider(config) {
    /* U2b, the provider half (app v49): the SDK context is derived
       through ensureApp, and a rejected derivation clears itself
       exactly like the loader does, so the next door tap or store
       call retries the whole road instead of meeting the same dead
       promise. Listener attempts that arrived while the road was
       down are retried the moment a derivation succeeds (see
       onChange), so a sign in completed after a recovered load
       still reaches the app. */
    var appPromise = null;
    var waitingListeners = [];
    function ensureApp() {
      if (appPromise) return appPromise;
      appPromise = loadSdk().then(function (fb) {
        var app = fb.apps && fb.apps.length ? fb.app() : fb.initializeApp({ apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId });
        return { fb: fb, app: app, auth: fb.auth(), db: fb.firestore() };
      });
      appPromise.then(function () {
        var waiting = waitingListeners;
        waitingListeners = [];
        waiting.forEach(function (attempt) { attempt(); });
      }, function () { appPromise = null; });
      return appPromise;
    }
    /* Firestore offline persistence stays OFF (design section 5): the
       app's own per account localStorage cache is the offline layer,
       so the library's second cache is never enabled here. */
    /* The native door credentials (app v39): run the plugin door,
       then shape its answer into the Firebase JS credential the web
       layer signs in (or reauthenticates) with. A result carrying
       no id token is a failed door, never a silent pass: it throws,
       and the caller's chain rejects like any popup error. */
    function googleCredential(ctx, plug) {
      /* U3 (app v49): the native sheet is the OS's own surface and
         earns the long bound, 60 seconds. A sheet that never
         answers used to pend the door forever: the fleet census's
         hung door class, present here. The timeout rejects down
         the same chain a plugin error takes, to doorFail, and the
         door re-arms (account-sync.js clears its pending mark on
         any settle, this one included). Every caller of this
         helper (the doors and the deletion re-checks) inherits
         the bound. */
      return boundWait(plug.signInWithGoogle(), 60000).then(function (result) {
        var idToken = result && result.credential && result.credential.idToken;
        if (!idToken) throw new Error("sign in did not finish");
        return ctx.fb.auth.GoogleAuthProvider.credential(idToken);
      });
    }
    function appleCredential(ctx, plug) {
      /* U3 (app v49): the same 60 second sheet bound as the
         Google door beside it. */
      return boundWait(plug.signInWithApple({ skipNativeAuth: true }), 60000).then(function (result) {
        var cred = (result && result.credential) || {};
        if (!cred.idToken) throw new Error("sign in did not finish");
        var provider = new ctx.fb.auth.OAuthProvider("apple.com");
        return provider.credential({ idToken: cred.idToken, rawNonce: cred.nonce });
      });
    }
    var p = {
      currentUser: null,
      ready: ensureApp(),
      onChange: function (cb) {
        var unsub = function () {};
        var stopped = false;
        function attempt() {
          ensureApp().then(function (ctx) {
            if (stopped) return;
            unsub = ctx.auth.onAuthStateChanged(function (u) { p.currentUser = normUser(u); cb(p.currentUser); });
          }, function () {
            /* The load is down (its own bound already spoke
               through the doors that retried it). Stay waiting:
               ensureApp re-runs this attempt when a later
               derivation succeeds, and the boot watchdog in
               account-sync.js owns the surface meanwhile. */
            waitingListeners.push(attempt);
          });
        }
        attempt();
        return function () { stopped = true; unsub(); };
      },
      signInGoogle: function () {
        var plug = nativeAuthPlugin();
        if (plug) {
          return ensureApp().then(function (ctx) { return googleCredential(ctx, plug).then(function (cred) { return boundWait(ctx.auth.signInWithCredential(cred), 30000); }); }).then(function (r) { return normUser(r.user); });
        }
        return ensureApp().then(function (ctx) { return ctx.auth.signInWithPopup(new ctx.fb.auth.GoogleAuthProvider()); }).then(function (r) { return normUser(r.user); });
      },
      signInApple: function () {
        var plug = nativeAuthPlugin();
        if (plug) {
          return ensureApp().then(function (ctx) { return appleCredential(ctx, plug).then(function (cred) { return boundWait(ctx.auth.signInWithCredential(cred), 30000); }); }).then(function (r) { return normUser(r.user); });
        }
        return ensureApp().then(function (ctx) { return ctx.auth.signInWithPopup(new ctx.fb.auth.OAuthProvider("apple.com")); }).then(function (r) { return normUser(r.user); });
      },
      /* U4 (app v49): the JS auth network calls race a 30 second
         bound. The timeout error rides the rejection path each
         call already owns (the door walk and doorFail, the demo's
         unavailable line) exactly as a network failure does: its
         code is no credential code, so no surface mistakes it for
         a refusal. The web popup doors are NOT raced: closing the
         popup is the user's own exit and already rejects. */
      signInEmail: function (email, password) {
        return ensureApp().then(function (ctx) { return boundWait(ctx.auth.signInWithEmailAndPassword(email, password), 30000); }).then(function (r) { return normUser(r.user); });
      },
      signUpEmail: function (email, password, name) {
        return ensureApp().then(function (ctx) { return boundWait(ctx.auth.createUserWithEmailAndPassword(email, password), 30000); }).then(function (r) {
          var nm = typeof name === "string" ? name.trim() : "";
          if (nm && r.user) return boundWait(r.user.updateProfile({ displayName: nm }), 30000).then(function () { return normUser(r.user); });
          return normUser(r.user);
        });
      },
      setDisplayName: function (name) {
        return ensureApp().then(function (ctx) {
          var u = ctx.auth.currentUser;
          if (!u) throw new Error("no account is signed in");
          return boundWait(u.updateProfile({ displayName: typeof name === "string" ? name.trim() : "" }), 30000);
        }).then(function () { return true; });
      },
      resetPassword: function (email) {
        return ensureApp().then(function (ctx) { return boundWait(ctx.auth.sendPasswordResetEmail(email), 30000); });
      },
      signInAnon: function () {
        return ensureApp().then(function (ctx) { return boundWait(ctx.auth.signInAnonymously(), 30000); }).then(function (r) { return normUser(r.user); });
      },
      signOut: function () {
        /* Inside the package the native layer holds its own session
           (app v39): sign it out first, best effort — a native sign
           out failure never blocks the web sign out below. On the
           web plug is null and this is the old chain untouched. */
        var plug = nativeAuthPlugin();
        var nativeOut = plug ? Promise.resolve().then(function () { return plug.signOut(); }).catch(function () { return null; }) : Promise.resolve();
        return nativeOut.then(function () {
          return ensureApp().then(function (ctx) { return ctx.auth.signOut(); });
        });
      },
      /* The deletion check and the last step (design section 7).
         Reauth goes through Firebase's own reauthenticate calls, so
         a wrong password is refused by Firebase itself and nothing
         downstream ever runs. */
      reauthEmail: function (password) {
        return ensureApp().then(function (ctx) {
          var u = ctx.auth.currentUser;
          if (!u || !u.email) throw new Error("no email account is signed in");
          return boundWait(u.reauthenticateWithCredential(ctx.fb.auth.EmailAuthProvider.credential(u.email, password)), 30000);
        }).then(function () { return true; });
      },
      reauthGoogle: function () {
        var plug = nativeAuthPlugin();
        if (plug) {
          return ensureApp().then(function (ctx) {
            var u = ctx.auth.currentUser;
            if (!u) throw new Error("no account is signed in");
            return googleCredential(ctx, plug).then(function (cred) { return boundWait(u.reauthenticateWithCredential(cred), 30000); });
          }).then(function () { return true; });
        }
        return ensureApp().then(function (ctx) {
          var u = ctx.auth.currentUser;
          if (!u) throw new Error("no account is signed in");
          return u.reauthenticateWithPopup(new ctx.fb.auth.GoogleAuthProvider());
        }).then(function () { return true; });
      },
      reauthApple: function () {
        var plug = nativeAuthPlugin();
        if (plug) {
          return ensureApp().then(function (ctx) {
            var u = ctx.auth.currentUser;
            if (!u) throw new Error("no account is signed in");
            return appleCredential(ctx, plug).then(function (cred) { return boundWait(u.reauthenticateWithCredential(cred), 30000); });
          }).then(function () { return true; });
        }
        return ensureApp().then(function (ctx) {
          var u = ctx.auth.currentUser;
          if (!u) throw new Error("no account is signed in");
          return u.reauthenticateWithPopup(new ctx.fb.auth.OAuthProvider("apple.com"));
        }).then(function () { return true; });
      },
      deleteCurrentUser: function () {
        return ensureApp().then(function (ctx) {
          var u = ctx.auth.currentUser;
          if (!u) throw new Error("no account is signed in");
          return u.delete();
        });
      },
      /* The Firestore document store seam (accounts.js engine shape),
         wired over the same loaded SDK for account-sync.js. */
      store: function () {
        return ensureApp().then(function (ctx) {
          var db = ctx.db;
          function ref(path) {
            var parts = path.split("/");
            var r = db.collection(parts[0]);
            for (var i = 1; i < parts.length; i++) { r = (i % 2 === 1) ? r.doc(parts[i]) : r.collection(parts[i]); }
            return r;
          }
          var swapTs = makeSwapTs(ctx.fb);
          return {
            /* A caller may name the read source (app v50):
               { source: "server" } forces the read to the server,
               so a strangled Listen channel PENDS or REFUSES
               instead of answering out of the SDK's offline cache
               with a silent empty (QA build 12 round, Finding 2).
               No source named: the SDK's default read, exactly as
               before. */
            getDoc: function (path, opts) { var r = ref(path); return (opts && opts.source ? r.get({ source: opts.source }) : r.get()).then(function (s) { return s.exists ? s.data() : null; }); },
            setDoc: function (path, data) { return ref(path).set(swapTs(data)); },
            /* Merge write (build 8): the delta lands on the stored
               doc and fields the delta does not name keep their
               stored values. The aggregates contrib writer is the
               caller: its rules fence reads the post merge doc. */
            setDocMerge: function (path, data) { return ref(path).set(swapTs(data), { merge: true }); },
            updateDoc: function (path, data) { return ref(path).update(swapTs(data)); },
            deleteDoc: function (path) { return ref(path).delete(); },
            listCollection: function (path, opts) {
              var r = ref(path);
              return (opts && opts.source ? r.get({ source: opts.source }) : r.get()).then(function (qs) { var out = {}; qs.forEach(function (d) { out[d.id] = d.data(); }); return out; });
            }
          };
        });
      }
    };
    return p;
  }

  MP_AUTH.useFirebase = function (config) {
    var p = firebaseProvider(config);
    provider = p;
    return p;
  };
  MP_AUTH._loadSdk = loadSdk;

  if (typeof module !== "undefined" && module.exports) module.exports = MP_AUTH;
  global.MP_AUTH = MP_AUTH;
})(typeof window !== "undefined" ? window : globalThis);
