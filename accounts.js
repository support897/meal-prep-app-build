/* Meal Prep accounts core (app v23, accounts wave).
   The pure heart of the accounts layer: state <-> Firestore document
   mapping, the repair contract (counts in equal counts out, unfixable
   records move to recoveredItems, a missing slice repairs to EMPTY),
   the two-hat tier and entitlement mechanics, the activation stamp,
   the aggregates writer shapes and maths, and the guest import gate.
   Nothing in here touches the network, the DOM or storage directly:
   the sync engine works against small seams (a document store and a
   key value storage) so the unit tests drive it with fakes, and the
   browser glue (account-sync.js) wires the real Firebase behind the
   same seams. Design of record: MULTI-USER-DESIGN.md sections 3 to 11;
   record shapes: CEO-DATA-CONTRACTS.md. */
(function (global) {
  "use strict";

  /* The browser store adapter swaps this sentinel for a real server
     timestamp on writes; everywhere else it is just a marker value. */
  var TS = "__MP_SERVER_TS__";

  var DOORS = ["google", "apple", "email"];
  var LIVE_KEY = "mealPrepStateV1";
  var DEVICE_KEY = "mealPrepDeviceV1";

  function isPlainObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
  function str(x, fallback) { return typeof x === "string" && x !== "" ? x : (fallback || ""); }
  function strList(x) { return Array.isArray(x) ? x.map(function (v) { return String(v == null ? "" : v); }).filter(Boolean) : []; }
  function num(x, fallback) { return (typeof x === "number" && isFinite(x)) ? x : fallback; }
  /* The reminder settings shapes (app v42). accounts.js stands
     alone, so these mirror logic.js cleanSkips / cleanReminderMode /
     cleanReminderTimes rule for rule; the suite pins the two in
     step. Repairs never drop: a bad key or value repairs away, a
     good one always survives. */
  function cleanSkipsMap(v) {
    var out = {};
    if (!isPlainObj(v)) return out;
    Object.keys(v).forEach(function (k) { if (/^\d{4}\.\d{2}\.\d{2}\.(breakfast|lunch|dinner)$/.test(k) && v[k]) out[k] = true; });
    return out;
  }
  function cleanModeMap(v) {
    var src = isPlainObj(v) ? v : {};
    var pick = function (m) { return src[m] === "fixed" ? "fixed" : "cook"; };
    return { breakfast: pick("breakfast"), lunch: pick("lunch"), dinner: pick("dinner") };
  }
  function cleanTimesMap(v) {
    var src = isPlainObj(v) ? v : {};
    var pick = function (m) { var x = src[m]; return typeof x === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(x) ? x : ""; };
    return { breakfast: pick("breakfast"), lunch: pick("lunch"), dinner: pick("dinner") };
  }
  /* The stamp mirror (app v43, build 8 follow on). The aggregates
     stamp chain needs to know what it has already stamped — whether
     the signup stamp ever landed, whether the activation stamp
     landed, the session counter, and the last day a daily stamp
     landed (daily idempotence across devices) — but the contrib
     document it writes is owner read only BY DESIGN, so the chain
     can never read its own prev back. The mirror is that prev,
     carried on the user's OWN profile (their readable doc) beside
     the other carried fields, in the same cleaner discipline: a
     profile that carries none restores the defaults, and a bad
     shaped value repairs field by field, never drops. The shape is
     one map, stamps, and it is MONOTONE: the flags only ever set,
     the counter only ever grows, the day only ever moves forward —
     mergeStamps is that order, and pushAccount leans on it so a
     push from a state that never learned the latest mirror can
     never regress it (two devices racing resolve exactly there:
     the fresher mirror wins field by field, the standing later
     push wins semantics applied to one map). */
  function cleanStamps(v) {
    var src = isPlainObj(v) ? v : {};
    return {
      signedUp: src.signedUp === true,
      activated: src.activated === true,
      sessions: Math.max(0, Math.round(num(src.sessions, 0))),
      lastDay: (typeof src.lastDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(src.lastDay)) ? src.lastDay : ""
    };
  }
  function mergeStamps(a, b) {
    var x = cleanStamps(a), y = cleanStamps(b);
    return {
      signedUp: x.signedUp || y.signedUp,
      activated: x.activated || y.activated,
      sessions: Math.max(x.sessions, y.sessions),
      lastDay: x.lastDay > y.lastDay ? x.lastDay : y.lastDay
    };
  }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function cacheKeyFor(uid) { return "mealPrepCache." + uid; }
  function guestCacheKey() { return "mealPrepCache.guest"; }

  /* Does this state hold anything that is the user's own? The same test
     the load repair uses (family, pantry, a planned meal, an own recipe):
     a device pot with none of these is not offered for import. */
  function hasUserData(s) {
    if (!isPlainObj(s)) return false;
    if (Array.isArray(s.family) && s.family.length) return true;
    if (Array.isArray(s.pantry) && s.pantry.length) return true;
    if (Array.isArray(s.customRecipes) && s.customRecipes.length) return true;
    if (isPlainObj(s.plan)) {
      return Object.keys(s.plan).some(function (k) { var p = s.plan[k]; return isPlainObj(p) && (p.breakfast || p.lunch || p.dinner); });
    }
    return false;
  }

  /* ------------------------------------------------------------------
     State -> documents (design section 3: one document per slice, the
     folder users/{uid} is the ownership proof, no owner field exists).
     Device only slices (sentReminders, notifications, ui/sidebar and
     navTucked) are NEVER mapped: they stay on the device by design. */
  var COLLECTIONS = ["familyMembers", "pantryItems", "planDays", "customRecipes", "shoppingExtras", "shoppingItemState", "importedEvents", "imports"];

  function stateToProfile(state) {
    return {
      /* The user's own name, asked at sign up (HQ ruling, 15 Oct
         16:28): carried on the profile so the app can address the
         person by their own name. An ordinary profile field, never
         plan shaped, so the rules profile gate never trips on it. */
      name: str(state.accountName, ""),
      preferences: strList(state.preferences),
      eatTimes: isPlainObj(state.eatTimes) ? { breakfast: str(state.eatTimes.breakfast, "07:30"), lunch: str(state.eatTimes.lunch, "12:30"), dinner: str(state.eatTimes.dinner, "18:30") } : { breakfast: "07:30", lunch: "12:30", dinner: "18:30" },
      setupMinutes: num(state.setupMinutes, 5),
      /* The second reminder offsets (app v35) ride the profile beside
         the eat times they belong to; a missing or bad shaped value
         maps to 0, which is off. */
      extraReminders: isPlainObj(state.extraReminders) ? { breakfast: num(state.extraReminders.breakfast, 0), lunch: num(state.extraReminders.lunch, 0), dinner: num(state.extraReminders.dinner, 0) } : { breakfast: 0, lunch: 0, dinner: 0 },
      /* The reminder settings (app v42) ride the profile beside the
         extra reminders: the per meal mode and fixed time, and the
         skip ticks as a "<day>.<meal>" -> true map. Before v42 these
         never left the phone, so a fresh sign in rebuilt the
         defaults and the user's ticks and timers were gone. */
      reminderMode: cleanModeMap(state.reminderMode),
      reminderTimes: cleanTimesMap(state.reminderTimes),
      skips: cleanSkipsMap(state.skips),
      /* The stamp mirror rides the profile (app v43): the stamp
         chain's own memory, on the one server document the client
         may always read back. */
      stamps: cleanStamps(state.stamps),
      planCleared: state.planCleared === true,
      autoPlan: state.autoPlan !== false,
      guideState: isPlainObj(state.guideState) ? { status: str(state.guideState.status, "notStarted"), step: num(state.guideState.step, 1), v: num(state.guideState.v, 2), nameAsks: num(state.guideState.nameAsks, 0), nameAskVisit: str(state.guideState.nameAskVisit, "") } : { status: "notStarted", step: 1, v: 2, nameAsks: 0, nameAskVisit: "" },
      settings: isPlainObj(state.settings) ? clone(state.settings) : { background: { kind: "brand", photoMode: "light" }, backgroundPhoto: "" },
      updatedAt: TS
    };
  }
  /* The fields only a first write may set (contracts section 1: the user
     record carries the default free plan only, never client raised). */
  function profileCreateFields(nowIso) {
    return { plan: "free", deletedByUser: false, createdAt: TS, lastActiveAt: nowIso, sessions: 0 };
  }

  function stateToDocs(state) {
    var cols = { familyMembers: {}, pantryItems: {}, planDays: {}, customRecipes: {}, shoppingExtras: {}, shoppingItemState: {}, importedEvents: {}, imports: {} };
    (Array.isArray(state.family) ? state.family : []).forEach(function (p, i) {
      var id = str(p && p.id, "p" + (i + 1));
      cols.familyMembers[id] = { name: str(p && p.name, "Person " + (i + 1)), color: str(p && p.color, ""), tags: strList(p && p.tags), dislikes: strList(p && p.dislikes), allergies: strList(p && p.allergies) };
    });
    (Array.isArray(state.pantry) ? state.pantry : []).forEach(function (it, i) {
      var id = str(it && it.id, "g" + i);
      var doc = { name: str(it && it.name, "food"), qty: num(it && it.qty, 0), unit: str(it && it.unit, "pcs"), storage: str(it && it.storage, "fridge"), addedKey: str(it && it.added, "") };
      if (typeof (it && it.shelfDays) === "number" && isFinite(it.shelfDays)) doc.shelfDays = it.shelfDays;
      cols.pantryItems[id] = doc;
    });
    if (isPlainObj(state.plan)) Object.keys(state.plan).forEach(function (k) {
      var day = state.plan[k]; if (!isPlainObj(day)) return;
      var doc = {};
      ["breakfast", "lunch", "dinner"].forEach(function (m) { if (typeof day[m] === "string" && day[m]) doc[m] = day[m]; });
      cols.planDays[k] = doc;
    });
    (Array.isArray(state.customRecipes) ? state.customRecipes : []).forEach(function (r, i) {
      var id = str(r && r.id, "own." + i);
      cols.customRecipes[id] = { name: str(r && r.name, "My recipe"), meal: str(r && r.meal, "dinner"), cuisines: strList(r && r.cuisines), minutes: num(r && r.minutes, 30), servings: num(r && r.servings, 2), ingredients: Array.isArray(r && r.ingredients) ? clone(r.ingredients) : [], steps: strList(r && r.steps) };
    });
    (Array.isArray(state.extras) ? state.extras : []).forEach(function (x, i) {
      var id = str(x && x.id, "e" + i);
      cols.shoppingExtras[id] = { name: str(x && x.name, ""), qty: num(x && x.qty, 1), unit: str(x && x.unit, "pcs"), category: str(x && x.category, "Other") };
    });
    var itemKeys = {};
    if (isPlainObj(state.doneItems)) Object.keys(state.doneItems).forEach(function (k) { itemKeys[k] = true; });
    if (isPlainObj(state.hiddenItems)) Object.keys(state.hiddenItems).forEach(function (k) { itemKeys[k] = true; });
    Object.keys(itemKeys).forEach(function (k) {
      cols.shoppingItemState[k] = { done: !!(isPlainObj(state.doneItems) && state.doneItems[k]), hidden: !!(isPlainObj(state.hiddenItems) && state.hiddenItems[k]) };
    });
    (Array.isArray(state.events) ? state.events : []).forEach(function (e, i) {
      var id = str(e && e.id, "imp." + i);
      cols.importedEvents[id] = { title: str(e && e.title, ""), date: str(e && e.date, ""), time: (e && typeof e.time === "string") ? e.time : null, durationMin: num(e && e.durationMin, 30), notes: str(e && e.notes, ""), location: str(e && e.location, ""), repeat: (e && typeof e.repeat === "string") ? e.repeat : null, source: "import", importUid: str(e && e.importUid, ""), importKey: str(e && e.importKey, "") };
    });
    (Array.isArray(state.imports) ? state.imports : []).forEach(function (r, i) {
      if (!isPlainObj(r) || typeof r.key !== "string") return;
      var id = "imp" + i + "." + r.key.length;
      cols.imports[id] = { key: r.key, source: str(r.source, "calendar"), at: str(r.at, ""), count: Math.max(0, Math.round(num(r.count, 0))) };
    });
    return { profile: stateToProfile(state), collections: cols };
  }

  /* ------------------------------------------------------------------
     Documents -> state, under the repair contract (design section 3C):
     the record count going in equals the count coming out. A record
     with bad fields is coerced field by field. A record too broken to
     place is NOT dropped: it comes back in `recovered`, raw and
     untouched, with the collection it came from and a plain reason,
     for the caller to file under recoveredItems. A missing slice
     repairs to EMPTY, never to sample content. */
  function repairDoc(kind, raw) {
    if (!isPlainObj(raw)) return { ok: false, reason: "the record was not a record at all" };
    if (kind === "familyMembers") {
      var name = str(raw.name, "");
      if (!name && !strList(raw.allergies).length && !strList(raw.dislikes).length && !strList(raw.tags).length) return { ok: false, reason: "no name and nothing else saved on it" };
      return { ok: true, doc: { name: name || "Person", color: str(raw.color, ""), tags: strList(raw.tags), dislikes: strList(raw.dislikes), allergies: strList(raw.allergies) } };
    }
    if (kind === "pantryItems") {
      if (!str(raw.name, "")) return { ok: false, reason: "no food name on it" };
      var doc = { name: raw.name, qty: Math.max(0, num(raw.qty, 0)), unit: str(raw.unit, "pcs"), storage: ["fridge", "freezer", "pantry"].indexOf(raw.storage) !== -1 ? raw.storage : "fridge", added: str(raw.addedKey, "") };
      if (typeof raw.shelfDays === "number" && isFinite(raw.shelfDays)) doc.shelfDays = raw.shelfDays;
      return { ok: true, doc: doc };
    }
    if (kind === "planDays") {
      var day = {}, any = false;
      ["breakfast", "lunch", "dinner"].forEach(function (m) { if (typeof raw[m] === "string" && raw[m]) { day[m] = raw[m]; any = true; } });
      /* An empty day document is a real, repairable thing (the day was
         cleared); it is kept as an empty day, not recovered. */
      return { ok: true, doc: day };
    }
    if (kind === "customRecipes") {
      if (!str(raw.name, "")) return { ok: false, reason: "no recipe name on it" };
      return { ok: true, doc: { name: raw.name, meal: ["breakfast", "lunch", "dinner"].indexOf(raw.meal) !== -1 ? raw.meal : "dinner", cuisines: strList(raw.cuisines).length ? strList(raw.cuisines) : ["Comfort"], minutes: num(raw.minutes, 30) > 0 ? num(raw.minutes, 30) : 30, servings: num(raw.servings, 2) > 0 ? num(raw.servings, 2) : 2, ingredients: Array.isArray(raw.ingredients) ? clone(raw.ingredients) : [], steps: strList(raw.steps), custom: true } };
    }
    if (kind === "shoppingExtras") {
      if (!str(raw.name, "")) return { ok: false, reason: "no item name on it" };
      return { ok: true, doc: { name: raw.name, qty: num(raw.qty, 1), unit: str(raw.unit, "pcs"), category: str(raw.category, "Other") } };
    }
    if (kind === "shoppingItemState") {
      return { ok: true, doc: { done: raw.done === true, hidden: raw.hidden === true } };
    }
    if (kind === "importedEvents") {
      if (!str(raw.date, "")) return { ok: false, reason: "no day on it" };
      return { ok: true, doc: { title: str(raw.title, ""), date: raw.date, time: typeof raw.time === "string" ? raw.time : null, durationMin: num(raw.durationMin, 30), notes: str(raw.notes, ""), location: str(raw.location, ""), repeat: typeof raw.repeat === "string" ? raw.repeat : null, source: "import", importUid: str(raw.importUid, ""), importKey: str(raw.importKey, "") } };
    }
    if (kind === "imports") {
      if (typeof raw.key !== "string") return { ok: false, reason: "no import key on it" };
      return { ok: true, doc: { key: raw.key, source: str(raw.source, "calendar"), at: str(raw.at, ""), count: Math.max(0, Math.round(num(raw.count, 0))) } };
    }
    return { ok: false, reason: "a slice this app does not know" };
  }

  /* docs: { profile: docOrNull, collections: { name: { id: doc } } }
     -> { state (app shaped, partial-safe), recovered: [...], counts } */
  function docsToState(docs) {
    var recovered = [], counts = { in: 0, kept: 0, recovered: 0 };
    var state = { accountName: "", preferences: [], eatTimes: { breakfast: "07:30", lunch: "12:30", dinner: "18:30" }, setupMinutes: 5, extraReminders: { breakfast: 0, lunch: 0, dinner: 0 }, reminderMode: { breakfast: "cook", lunch: "cook", dinner: "cook" }, reminderTimes: { breakfast: "", lunch: "", dinner: "" }, skips: {}, stamps: { signedUp: false, activated: false, sessions: 0, lastDay: "" }, planCleared: false, autoPlan: false, guideState: { status: "notStarted", step: 1, v: 2, nameAsks: 0, nameAskVisit: "" }, settings: { background: { kind: "brand", photoMode: "light" }, backgroundPhoto: "" }, family: [], pantry: [], plan: {}, customRecipes: [], extras: [], events: [], imports: [], doneItems: {}, hiddenItems: {} };
    var profile = isPlainObj(docs && docs.profile) ? docs.profile : null;
    if (profile) {
      state.accountName = str(profile.name, "");
      state.preferences = strList(profile.preferences);
      if (isPlainObj(profile.eatTimes)) { state.eatTimes = { breakfast: str(profile.eatTimes.breakfast, "07:30"), lunch: str(profile.eatTimes.lunch, "12:30"), dinner: str(profile.eatTimes.dinner, "18:30") }; }
      state.setupMinutes = num(profile.setupMinutes, 5);
      if (isPlainObj(profile.extraReminders)) { state.extraReminders = { breakfast: num(profile.extraReminders.breakfast, 0), lunch: num(profile.extraReminders.lunch, 0), dinner: num(profile.extraReminders.dinner, 0) }; }
      /* The reminder settings restore (app v42) through the same
         cleaners they were written with: a profile that carries
         them restores them exactly; a profile written before v42
         carries none and keeps the defaults above. */
      if (isPlainObj(profile.reminderMode)) state.reminderMode = cleanModeMap(profile.reminderMode);
      if (isPlainObj(profile.reminderTimes)) state.reminderTimes = cleanTimesMap(profile.reminderTimes);
      if (isPlainObj(profile.skips)) state.skips = cleanSkipsMap(profile.skips);
      /* The stamp mirror restores through its cleaner (app v43):
         a profile written before the mirror existed carries none
         and keeps the defaults above. */
      if (isPlainObj(profile.stamps)) state.stamps = cleanStamps(profile.stamps);
      state.planCleared = profile.planCleared === true;
      state.autoPlan = profile.autoPlan !== false;
      if (isPlainObj(profile.guideState)) state.guideState = { status: str(profile.guideState.status, "notStarted"), step: num(profile.guideState.step, 1), v: num(profile.guideState.v, 2), nameAsks: num(profile.guideState.nameAsks, 0), nameAskVisit: str(profile.guideState.nameAskVisit, "") };
      if (isPlainObj(profile.settings)) state.settings = clone(profile.settings);
    }
    var cols = isPlainObj(docs && docs.collections) ? docs.collections : {};
    COLLECTIONS.forEach(function (kind) {
      var bag = isPlainObj(cols[kind]) ? cols[kind] : {};
      Object.keys(bag).sort().forEach(function (id) {
        counts.in++;
        var raw = bag[id];
        var r = repairDoc(kind, raw);
        if (!r.ok) { counts.recovered++; recovered.push({ fromSlice: kind, id: id, raw: clone(raw), reason: r.reason }); return; }
        counts.kept++;
        var d = r.doc;
        if (kind === "familyMembers") state.family.push(Object.assign({ id: id }, d));
        else if (kind === "pantryItems") state.pantry.push(Object.assign({ id: id }, d));
        else if (kind === "planDays") state.plan[id] = d;
        else if (kind === "customRecipes") state.customRecipes.push(Object.assign({ id: id }, d));
        else if (kind === "shoppingExtras") state.extras.push(Object.assign({ id: id }, d));
        else if (kind === "shoppingItemState") { if (d.done) state.doneItems[id] = true; if (d.hidden) state.hiddenItems[id] = true; }
        else if (kind === "importedEvents") state.events.push(Object.assign({ id: id }, d));
        else if (kind === "imports") state.imports.push(d);
      });
    });
    return { state: state, recovered: recovered, counts: counts, profile: profile };
  }

  function accountHasData(docs) {
    var pulled = docsToState(docs || {});
    return hasUserData(pulled.state) || pulled.counts.kept > 0;
  }

  /* ------------------------------------------------------------------
     The two hats, hat 1 (design section 11 + the Fit mechanics):
     the tier slice users/{uid}/slices/tier = { value: { plan } }
     MIRRORS the plan for display only. It never grants anything by
     itself. Entitlement RESOLVES at sign in from the comp record at
     _comp/{uid}: the write that claims the top plan is accepted by
     the rules only when that record exists, so syncTier attempts the
     top write and believes the result, never the mirror. Fail closed:
     until a top write succeeds THIS session, entitlement is free.
     A stale top mirror behind a removed comp heals itself here: the
     attempt is denied and the mirror is reset to free (TW-3R). */
  function tierPath(uid) { return "users/" + uid + "/slices/tier"; }
  function planLineFor(entitlement) { return entitlement === "pro" ? "Top plan" : "Free plan"; }

  function syncTier(store, uid, opts) {
    opts = opts || {};
    if (!uid || opts.demo) return Promise.resolve({ entitlement: "free", mirror: null, writes: 0, skipped: true });
    var path = tierPath(uid);
    return store.getDoc(path).then(function (doc) {
      var mirror = doc && isPlainObj(doc.value) ? doc.value.plan : null;
      var writes = 0;
      return store.setDoc(path, { value: { plan: "pro" } }).then(function () {
        writes++;
        return { entitlement: "pro", mirror: "pro", writes: writes, skipped: false };
      }, function (err) {
        /* The rules gate said no (no comp record): that IS the answer.
           Heal a stale mirror, then resolve free for this session. */
        if (mirror !== "free") {
          writes++;
          return store.setDoc(path, { value: { plan: "free" } }).then(function () {
            return { entitlement: "free", mirror: "free", writes: writes, skipped: false };
          });
        }
        return { entitlement: "free", mirror: "free", writes: writes, skipped: false };
      });
    });
  }

  /* ------------------------------------------------------------------
     The entitlement record (PAYMENTS-CHAPTER-PLAN section 3, the
     wiring order of 19 Oct): subscriptions/{uid}, ONE record per
     user, written ONLY by the payment receivers (the RevenueCat
     and Stripe webhook receivers). The rules deny every client
     write to it (allow write: if false) and this app never
     attempts one: it READS its own record and resolves from it.
     The shape is the chapter's: app_user_id, entitlement, status,
     product, lane, trial_ends_at, period_ends_at, expires_at,
     updated_at, source_event_id. THE UNLOCK RULE (the chapter's
     only rule): a paid feature opens when the record shows the
     app's entitlement ("plus" for Meal Prep) with status trialing
     or active and the period or window has not ended. Cancel
     closes at period end (the chapter's section 6 proof order),
     so a cancelled record still inside its paid period opens and
     past it stays shut; a cancel naming no period end cannot
     prove a live window and stays shut. Past due, expired, an
     unknown or missing status, a record for another entitlement
     (Family's held entitlement included: it has no products and
     opens nothing), a missing record and a read the rules refuse
     all resolve free: fail closed, like every entitlement read
     in this file. Free features never consult the record at all:
     the one read lives on the sign in entitlement resolution in
     account-sync.js, beside syncTier above, and getEntitlement
     only ever reads the resolved session value. */
  function subscriptionPath(uid) { return "subscriptions/" + uid; }
  /* An end field in the shapes the record may carry it: epoch
     milliseconds (a number), an ISO string, or a Firestore
     timestamp ({ seconds, nanoseconds } or { toMillis() }).
     Anything else is not an end and reads as absent. */
  function recordEndMs(v) {
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string" && v) { var ms = Date.parse(v); return isFinite(ms) ? ms : null; }
    if (isPlainObj(v)) {
      if (typeof v.toMillis === "function") { try { var m = v.toMillis(); return typeof m === "number" && isFinite(m) ? m : null; } catch (e) { return null; } }
      if (typeof v.seconds === "number" && isFinite(v.seconds)) return v.seconds * 1000 + Math.floor(num(v.nanoseconds, 0) / 1e6);
    }
    return null;
  }
  function entitlementFromRecord(record, nowMs) {
    if (!isPlainObj(record)) return "free";
    if (record.entitlement !== "plus") return "free";
    var now = typeof nowMs === "number" && isFinite(nowMs) ? nowMs : Date.now();
    var ends = [recordEndMs(record.period_ends_at), recordEndMs(record.expires_at)].filter(function (x) { return x !== null; });
    if (record.status === "trialing") {
      var trialEnd = recordEndMs(record.trial_ends_at);
      if (trialEnd !== null) ends.push(trialEnd);
      return ends.some(function (e) { return now >= e; }) ? "free" : "pro";
    }
    if (record.status === "active") {
      return ends.some(function (e) { return now >= e; }) ? "free" : "pro";
    }
    if (record.status === "cancelled") {
      if (!ends.length) return "free";
      return ends.some(function (e) { return now >= e; }) ? "free" : "pro";
    }
    return "free";
  }
  /* The read itself, through the store seam: getDoc only. This is
     the record's only read in client code, and the record is
     written nowhere in client code at all. A denied or failed
     read resolves free: an unreadable record proves nothing, and
     only proof opens a paid gate. Demo sessions are skipped
     before any call (the rules refuse an anonymous read anyway,
     and the demo never carries a purchased record). */
  function readEntitlementRecord(store, uid, opts) {
    opts = opts || {};
    if (!uid || opts.demo) return Promise.resolve({ entitlement: "free", record: null, skipped: true });
    return store.getDoc(subscriptionPath(uid)).then(function (rec) {
      return { entitlement: entitlementFromRecord(rec, opts.nowMs), record: isPlainObj(rec) ? rec : null, skipped: false };
    }, function () {
      return { entitlement: "free", record: null, skipped: false };
    });
  }

  /* ------------------------------------------------------------------
     Activation (design section 11, confirmed with the pattern owner):
     "first meal planned" — the first meal that lands on a day through
     the user's OWN action: an add, a swap, or the Plan my first week
     planner run. Stamped once, never overwritten. An automatic fill
     the user did not trigger (a repair, the established user auto
     plan in ensureDay) never stamps. */
  var ACTIVATION_SOURCES = { add: true, swap: true, planner: true };
  function noteActivation(meta, source, nowIso) {
    meta = isPlainObj(meta) ? meta : {};
    if (!ACTIVATION_SOURCES[source]) return { meta: meta, stamped: false };
    if (meta.activatedAt) return { meta: meta, stamped: false };
    var out = {}; Object.keys(meta).forEach(function (k) { out[k] = meta[k]; });
    out.activatedAt = nowIso;
    return { meta: out, stamped: true };
  }

  /* ------------------------------------------------------------------
     The aggregates writer (contracts sections 1 and 2). The app
     writes ONE contribution document per user, counters and times
     only — never a name, an email or any content — at the path the
     rules delta opens for exactly this (see RULES-DELTA.md). The CEO
     surface reads those contributions and computes the spine numbers
     client side; computeAggregates is that maths, kept here so the
     writer and the reader can never drift apart. */
  function contribPath(uid) { return "_owner/aggregates/contrib/" + uid; }
  /* Build 8 (go-live audit RED): buildContrib returns the DELTA the
     event sets, and the caller merge writes it (setDocMerge), so the
     fields an event does not set never ride the write at all. The old
     whole doc shape could never land: it sent the three time fields
     as ISO strings or present nulls, and the rules demand a real
     timestamp for any time field present, so every stamp was refused
     and the refusal was swallowed at the call sites. Now a set time
     field rides as the server timestamp sentinel (the store seam
     swaps it for the server stamp), an unset one is simply absent,
     and a field already stamped on the stored doc is never re-sent,
     so the original signup and activation times can never be
     overwritten by a later day's write. The stored doc keeps exactly
     the four fields and the same daily stamp semantics; nowIso stays
     in the signature for the callers and the suite, which resolve the
     sentinel to the event's own clock when they emulate the server. */
  function buildContrib(prev, event, nowIso) {
    var p = isPlainObj(prev) ? prev : {};
    var has = function (k) { return p[k] !== null && p[k] !== undefined && p[k] !== ""; };
    var sessions = Math.max(0, Math.round(num(p.sessions, 0)));
    var out = {};
    if (event === "signup") { if (!has("signedUpAt")) { out.signedUpAt = TS; out.sessions = sessions; } }
    if (event === "session") { out.lastSessionAt = TS; out.sessions = sessions + 1; }
    if (event === "activation") { if (!has("activatedAt")) out.activatedAt = TS; }
    return out;
  }
  /* The stamp chain (app v43, build 8 follow on). buildContrib
     needs a prev, and the contrib document is the one document in
     the design its writer may never read (owner only reads,
     RULES-DELTA item 4): the shipped call sites read it anyway, the
     read refused, and the chain died at the read before the (now
     correct) write — probed live on the twin, a self read answers
     403 PERMISSION_DENIED. So prev is sourced from the PROFILE
     MIRROR (cleanStamps above): the mirror is translated into the
     prev shape buildContrib reads (a stamped field shows as
     present, the counter rides as the number), the event's delta
     comes from the shipped emitter unchanged, and the next mirror
     is derived from what the delta actually set. A daily event
     (signup or session) whose mirror day is already today is
     skipped whole: the account has stamped today, on whichever
     device landed it, and a second device's sign in must not
     count the day twice. stampChain performs the writes: the
     mirror back onto the profile (only when it moved) and a non
     empty delta onto the contrib document through the merge
     write. If one write lands and the other fails, the pull at
     the next sign in re-reads the profile as it stands and the
     chain retries from the truth; nothing here reads the contrib
     document, ever. */
  function stampStep(mirror, event, todayKey) {
    var m = cleanStamps(mirror);
    var prev = { sessions: m.sessions };
    if (m.signedUp) prev.signedUpAt = "mirror";
    if (m.activated) prev.activatedAt = "mirror";
    var delta = buildContrib(prev, event, "");
    var next = { signedUp: m.signedUp, activated: m.activated, sessions: m.sessions, lastDay: m.lastDay };
    if (delta.signedUpAt !== undefined) next.signedUp = true;
    if (delta.activatedAt !== undefined) next.activated = true;
    if (typeof delta.sessions === "number") next.sessions = delta.sessions;
    if ((event === "signup" || event === "session") && typeof todayKey === "string" && todayKey) next.lastDay = todayKey;
    return { delta: delta, mirror: next, changed: !docEq(m, next) };
  }
  function stampChain(store, uid, mirror, event, todayKey) {
    var m = cleanStamps(mirror);
    if ((event === "signup" || event === "session") && todayKey && m.lastDay === todayKey) {
      return Promise.resolve({ delta: {}, mirror: m, wrote: false, skippedDay: true });
    }
    var step = stampStep(m, event, todayKey);
    var jobs = [];
    if (step.changed) jobs.push(store.updateDoc(userPath(uid), { stamps: step.mirror }));
    if (Object.keys(step.delta).length) jobs.push(store.setDocMerge(contribPath(uid), step.delta));
    return Promise.all(jobs).then(function () {
      return { delta: step.delta, mirror: step.mirror, wrote: jobs.length > 0, skippedDay: false };
    });
  }
  function weekKey(iso) {
    var d = new Date(iso); if (isNaN(d.getTime())) return "";
    var day = (d.getDay() + 6) % 7; /* Monday first */
    d.setDate(d.getDate() - day); d.setHours(12, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }
  function daysBetween(aIso, bIso) { return Math.floor((new Date(bIso).getTime() - new Date(aIso).getTime()) / 86400000); }
  function computeAggregates(contribs, subscriptions, reviews, nowIso) {
    var list = Array.isArray(contribs) ? contribs.filter(isPlainObj) : [];
    var weekly = {};
    var newThisWeek = 0, thisWeek = weekKey(nowIso);
    var actStamped = 0, actWithin = 0, returning = 0;
    list.forEach(function (c) {
      if (typeof c.signedUpAt === "string") {
        var wk = weekKey(c.signedUpAt);
        if (wk) { weekly[wk] = (weekly[wk] || 0) + 1; if (wk === thisWeek) newThisWeek++; }
        if (typeof c.activatedAt === "string") {
          actStamped++;
          var gap = daysBetween(c.signedUpAt, c.activatedAt);
          if (gap >= 0 && gap <= 7) {
            actWithin++;
            if (typeof c.lastSessionAt === "string") {
              var back = daysBetween(c.activatedAt, c.lastSessionAt);
              if (back >= 2 && back <= 7) returning++;
            }
          }
        }
      }
    });
    var weeklySeries = Object.keys(weekly).sort().map(function (wk) { return { week: wk, count: weekly[wk] }; });
    var subs = Array.isArray(subscriptions) ? subscriptions.filter(isPlainObj) : [];
    var paying = 0, pend = 0, ended = 0, reasons = [], mrr = 0;
    subs.forEach(function (s) {
      if (s.status === "active") { paying++; mrr += Math.max(0, num(s.amountCents, 0)); }
      else if (s.status === "pending-cancel") { pend++; if (typeof s.cancelReason === "string" && s.cancelReason) reasons.push({ text: s.cancelReason }); }
      else if (s.status === "ended") { ended++; if (typeof s.cancelReason === "string" && s.cancelReason) reasons.push({ text: s.cancelReason }); }
    });
    var revs = Array.isArray(reviews) ? reviews.filter(isPlainObj) : [];
    return {
      signups: { total: list.length, newThisWeek: newThisWeek, weekly: weeklySeries },
      activation: { coreAction: "first meal planned", stamped: actStamped, ofSignups: list.length, within7d: actWithin, shareWithin7d: list.length ? actWithin / list.length : 0 },
      returning7d: returning,
      paying: paying,
      cancels: { pending: pend, ended: ended, reasons: reasons },
      /* Failed payments read the provider's own events and are never
         estimated (contracts section 1): no provider, no number. */
      failedPayments: null,
      mrrEstimate: { amountCents: mrr, label: "ESTIMATE" },
      reviews: { count: revs.length, unreplied: revs.filter(function (r) { return r.replied !== true; }).length }
    };
  }

  /* ------------------------------------------------------------------
     Feed record shapes (contracts sections 1 and 4). Builders validate
     and normalise; anything that cannot be made honest is refused, so
     a bad record never reaches the feed. Payments are NOT wired in
     this build: subscriptions stay a dormant, honest empty until the
     payment path exists; the shapes land now so it has one to write. */
  var SUB_STATUSES = ["active", "pending-cancel", "ended"];
  function subscriptionRecord(x) {
    if (!isPlainObj(x)) return { ok: false, errors: ["not a record"] };
    var errors = [];
    if (SUB_STATUSES.indexOf(x.status) === -1) errors.push("status must be active, pending-cancel or ended");
    if (typeof x.plan !== "string" || !x.plan) errors.push("plan is missing");
    if (typeof x.amountCents !== "number" || !isFinite(x.amountCents) || x.amountCents < 0) errors.push("amountCents must be a number at or above 0");
    if (typeof x.currency !== "string" || !/^[A-Z]{3}$/.test(x.currency)) errors.push("currency must be a 3 letter code");
    var reason = "";
    if (typeof x.cancelReason === "string") { reason = x.cancelReason.replace(/\s*\n\s*/g, " ").trim().slice(0, 140); }
    if (errors.length) return { ok: false, errors: errors };
    return { ok: true, record: { plan: x.plan, status: x.status, amountCents: Math.round(x.amountCents), currency: x.currency, renewsAt: typeof x.renewsAt === "string" ? x.renewsAt : null, provider: str(x.provider, ""), cancelReason: reason } };
  }
  function reviewRecord(x) {
    if (!isPlainObj(x)) return { ok: false, errors: ["not a record"] };
    var errors = [];
    if (typeof x.rating !== "number" || x.rating < 1 || x.rating > 5) errors.push("rating must be 1 to 5");
    if (!str(x.platform, "")) errors.push("platform is missing");
    if (errors.length) return { ok: false, errors: errors };
    return { ok: true, record: { platform: x.platform, rating: x.rating, title: str(x.title, ""), body: str(x.body, ""), author: str(x.author, ""), date: str(x.date, ""), replied: x.replied === true } };
  }
  /* A sale counts ONLY when the payment record names the piece or the
     offer; otherwise the row carries could-not-verify and the roll up
     excludes it. A piece missing any trust rail (disclosure, AI label,
     metadata zero) flags and is excluded from shipped counts. */
  function avatarRowShips(row) {
    return isPlainObj(row) && row.disclosure === "y" && row.aiLabel === "y" && row.metadataZero === "y";
  }
  function avatarSaleCounts(row) {
    return isPlainObj(row) && typeof row.salesCount === "number" && typeof row.salesAmountCents === "number";
  }
  function avatarRollup(rows) {
    var byPresenter = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!isPlainObj(row) || !row.presenterId) return;
      var p = byPresenter[row.presenterId] || (byPresenter[row.presenterId] = { presenterId: row.presenterId, presenterName: str(row.presenterName, ""), viewsTotal: 0, salesCount: 0, salesAmountCents: 0, flagged: 0, unverifiable: 0 });
      if (!avatarRowShips(row)) { p.flagged++; return; }
      p.viewsTotal += Math.max(0, num(row.views, 0));
      if (avatarSaleCounts(row)) { p.salesCount += row.salesCount; p.salesAmountCents += row.salesAmountCents; }
      else p.unverifiable++;
    });
    return byPresenter;
  }

  /* ------------------------------------------------------------------
     The guest import (design section 6, Security case 1). One tap
     brings the device guest pot into an EMPTY account, once: the
     profile stamp dataImportedAt is what makes it once. Success
     CONSUMES the pot (the caller clears the device guest copies and
     flags the device); any failure leaves the pot fully intact and
     the offer can be made again. */
  function importGate(input) {
    input = input || {};
    if (input.deviceConsumed) return "consumed";
    if (isPlainObj(input.profile) && input.profile.dataImportedAt) return "stamped";
    if (!hasUserData(input.potState)) return "nodata";
    if (accountHasData(input.docs)) return "notempty";
    return "offer";
  }

  /* The sync engine. The store seam:
       getDoc(path) -> Promise<doc|null>
       setDoc(path, data) -> Promise   (create or overwrite)
       setDocMerge(path, data) -> Promise   (merge onto the stored doc)
       updateDoc(path, data) -> Promise   (field level update)
       deleteDoc(path) -> Promise
       listCollection(path) -> Promise<{ id: doc }>
     Paths are Firestore style: users/{uid}, users/{uid}/familyMembers. */
  function userPath(uid) { return "users/" + uid; }

  function pullAccount(store, uid) {
    return store.getDoc(userPath(uid)).then(function (profile) {
      var docs = { profile: profile || null, collections: {} };
      return COLLECTIONS.reduce(function (chain, kind) {
        return chain.then(function () {
          return store.listCollection(userPath(uid) + "/" + kind).then(function (bag) { docs.collections[kind] = bag || {}; });
        });
      }, Promise.resolve()).then(function () { return docs; });
    });
  }

  /* Canonical comparison: object keys are sorted at every depth
     before the JSON compare, so two documents with the same values
     compare equal whatever order their fields arrived in. Firestore
     returns a document's fields in different orders on its get and
     list surfaces (measured on the test twin, Activation Run 3), and
     the old plain string compare rewrote value identical records
     after a pull round trip: extra writes of content that never
     changed. */
  function canonical(x) {
    if (Array.isArray(x)) return x.map(canonical);
    if (isPlainObj(x)) { var o = {}; Object.keys(x).sort().forEach(function (k) { o[k] = canonical(x[k]); }); return o; }
    return x === undefined ? null : x;
  }
  function docEq(a, b) { return JSON.stringify(canonical(a == null ? null : a)) === JSON.stringify(canonical(b == null ? null : b)); }

  /* Push the state's documents, writing only what changed since the
     snapshot. Documents that vanished from the state are deleted:
     those are the user's own deletes on their own things, the only
     deletes sync ever sends (design sections 3C and 5). */
  function pushAccount(store, uid, state, prevDocs, nowIso) {
    var next = stateToDocs(state);
    var jobs = [];
    var profile = next.profile;
    var isCreate = !prevDocs || !prevDocs.profile;
    if (isCreate) {
      var create = profileCreateFields(nowIso);
      Object.keys(create).forEach(function (k) { if (profile[k] === undefined) profile[k] = create[k]; });
    } else {
      /* Server managed fields are carried forward exactly as read, so a
         push can never wipe the creation stamp, the import stamp, the
         activation stamp or the counters (design sections 3C and 6). */
      ["createdAt", "dataImportedAt", "activatedAt", "sessions", "lastActiveAt", "plan", "deletedByUser"].forEach(function (k) {
        if (prevDocs.profile[k] !== undefined) profile[k] = prevDocs.profile[k];
      });
      /* A state that never learned the name (an older device copy)
         must not wipe the name the profile already carries. */
      if (!profile.name && typeof prevDocs.profile.name === "string" && prevDocs.profile.name) profile.name = prevDocs.profile.name;
      /* The stamp mirror is monotone, so it merges forward the
         same way: the fresher of the snapshot's mirror and the
         state's wins field by field, and a push from a state the
         stamp chain has already moved past (or an older device
         copy that never learned it) can never regress the flags,
         the counter or the day. */
      profile.stamps = mergeStamps(prevDocs.profile.stamps, profile.stamps);
    }
    if (!prevDocs || !docEq(prevDocs.profile, profile)) {
      jobs.push(store.setDoc(userPath(uid), profile));
    }
    COLLECTIONS.forEach(function (kind) {
      var nextBag = next.collections[kind];
      var prevBag = (prevDocs && prevDocs.collections && prevDocs.collections[kind]) || {};
      Object.keys(nextBag).forEach(function (id) {
        if (!docEq(prevBag[id], nextBag[id])) jobs.push(store.setDoc(userPath(uid) + "/" + kind + "/" + id, nextBag[id]));
      });
      Object.keys(prevBag).forEach(function (id) {
        if (!(id in nextBag)) jobs.push(store.deleteDoc(userPath(uid) + "/" + kind + "/" + id));
      });
    });
    return Promise.all(jobs).then(function () { return next; });
  }

  /* Run the import: write the whole pot, stamp the profile, and only
     then report success. Any write failing rejects, and the caller
     leaves the guest pot exactly as it was (retry safe). */
  function runImport(store, uid, potState, nowIso) {
    var docs = stateToDocs(potState);
    var profile = docs.profile;
    var create = profileCreateFields(nowIso);
    Object.keys(create).forEach(function (k) { if (profile[k] === undefined) profile[k] = create[k]; });
    profile.dataImportedAt = nowIso;
    var jobs = [store.setDoc(userPath(uid), profile)];
    COLLECTIONS.forEach(function (kind) {
      Object.keys(docs.collections[kind]).forEach(function (id) {
        jobs.push(store.setDoc(userPath(uid) + "/" + kind + "/" + id, docs.collections[kind][id]));
      });
    });
    return Promise.all(jobs).then(function () { return docs; });
  }

  /* ------------------------------------------------------------------
     Account deletion (design sections 7 and 3C): the ONE system path
     that deletes user data, run only by the user's own hand after a
     fresh sign in check (see deleteAccountFlow for the order). The
     sweep removes every document in every slice, then the tier
     mirror, then the profile document. Firestore does not delete the
     contents of a folder when the folder document goes, so the sweep
     is built, not assumed, and phase 4 proved its rules doors open.
     The sweep never touches the aggregates contribution row: the
     rules deny that delete to every client, and the row is a content
     free counter (four counter and time fields, never a name, an
     email or any content), so what stays after deletion is an
     anonymous count, not a person. Subscription records are written
     by nobody in version 1 (clients cannot write them and payments
     are not wired), so there is nothing there for the sweep to
     remove; when the payment path lands it owns its records' ends.
     Every step is idempotent: deleting a document that is already
     gone is success, so a sweep that stopped halfway can simply be
     run again. A step that fails stops the sweep where it stands and
     the report names the step, so the caller can tell the user
     exactly where it stopped. */
  var SWEEP_COLLECTIONS = COLLECTIONS.concat(["recoveredItems"]);
  function deleteAccountSweep(store, uid) {
    var steps = [], failedStep = null;
    function total() { return steps.reduce(function (n, s) { return n + (s.deleted || 0); }, 0); }
    function attempt(name, job) {
      return function () {
        if (failedStep) return null;
        var step = { name: name, deleted: 0, ok: true };
        steps.push(step);
        return job(step).then(function () { return null; }, function (err) {
          step.ok = false; step.error = String(err && err.message || err); failedStep = name; return null;
        });
      };
    }
    var chain = Promise.resolve(null);
    SWEEP_COLLECTIONS.forEach(function (kind) {
      chain = chain.then(attempt(kind, function (step) {
        return store.listCollection(userPath(uid) + "/" + kind).then(function (bag) {
          var ids = Object.keys(bag || {});
          return ids.reduce(function (c, id) {
            return c.then(function () { return store.deleteDoc(userPath(uid) + "/" + kind + "/" + id); })
              .then(function () { step.deleted++; });
          }, Promise.resolve());
        });
      }));
    });
    chain = chain.then(attempt("tier", function (step) {
      return store.getDoc(tierPath(uid)).then(function (doc) {
        if (doc == null) return null;
        return store.deleteDoc(tierPath(uid)).then(function () { step.deleted = 1; });
      });
    }));
    chain = chain.then(attempt("profile", function (step) {
      return store.getDoc(userPath(uid)).then(function (doc) {
        if (doc == null) return null;
        return store.deleteDoc(userPath(uid)).then(function () { step.deleted = 1; });
      });
    }));
    return chain.then(function () {
      return { ok: !failedStep, uid: uid, failedStep: failedStep, steps: steps, totalDeleted: total(), contribRemains: true };
    });
  }

  /* The full deletion flow: ONE code path for the in app door and
     the /delete-account web page (design section 7: the web route
     runs the identical sweep, because it is the same account and the
     same data). The order is the safety. The fresh sign in check
     (reauth) runs FIRST, so a wrong password deletes nothing at all.
     The sweep runs second. The Firebase sign in user is deleted
     LAST, so a sweep that stopped halfway leaves a person who can
     still sign in and run it again. deps: { reauth, deleteAuthUser },
     both seams, so tests and the twin battery drive the same flow
     the screens call. */
  function deleteAccountFlow(store, uid, deps) {
    deps = deps || {};
    var reauth = typeof deps.reauth === "function" ? deps.reauth : function () { return Promise.resolve(); };
    var deleteAuthUser = typeof deps.deleteAuthUser === "function" ? deps.deleteAuthUser : function () { return Promise.resolve(); };
    return Promise.resolve().then(reauth).then(function () {
      return deleteAccountSweep(store, uid);
    }).then(function (report) {
      if (!report.ok) return { ok: false, stage: report.failedStep, sweep: report };
      return Promise.resolve().then(deleteAuthUser).then(function () {
        return { ok: true, stage: "done", sweep: report };
      }, function (err) {
        return { ok: false, stage: "authUser", sweep: report, error: String(err && err.message || err) };
      });
    }, function (err) {
      return { ok: false, stage: "reauth", error: String(err && err.message || err) };
    });
  }

  /* File the recovered records from a pull under the user's own
     recoveredItems, raw and untouched (design section 3C). */
  function fileRecovered(store, uid, recovered, nowIso) {
    if (!Array.isArray(recovered) || !recovered.length) return Promise.resolve(0);
    var jobs = recovered.map(function (r, i) {
      return store.setDoc(userPath(uid) + "/recoveredItems/" + nowIso.replace(/[^0-9]/g, "") + "." + i, { fromSlice: r.fromSlice, raw: r.raw, reason: r.reason, foundAt: TS });
    });
    return Promise.all(jobs).then(function () { return recovered.length; });
  }

  /* ------------------------------------------------------------------
     Device side bookkeeping (kept OUT of the app state, in its own
     storage key, so the user's Download my data export can never
     carry account machinery, tier or aggregate material). The storage
     seam: get(k) -> string|null, set(k, v), remove(k). */
  function readDevice(storage) {
    try { var raw = storage.get(DEVICE_KEY); if (raw) { var d = JSON.parse(raw); if (isPlainObj(d)) return d; } } catch (e) {}
    return { guestPotConsumed: false, activatedAt: null, uid: null, demo: false, lastActiveDay: "" };
  }
  function writeDevice(storage, device) { try { storage.set(DEVICE_KEY, JSON.stringify(device)); } catch (e) {} return device; }
  /* Remove my data from this device (design section 5): deletes that
     account's cache key and reads back to prove it is gone, not just
     hidden. The account copy on the server is never touched. */
  function removeDeviceData(storage, uid) {
    if (!uid) return false;
    storage.remove(cacheKeyFor(uid));
    return storage.get(cacheKeyFor(uid)) == null;
  }
  /* Consume the guest pot after a successful import: the old guest key
     and the guest cache go, and the device remembers the pot is spent
     so no later account on this device is offered that data. */
  function consumeGuestPot(storage, device) {
    storage.remove(LIVE_KEY);
    storage.remove(guestCacheKey());
    device.guestPotConsumed = true;
    return writeDevice(storage, device);
  }

  /* SHA-256 hex, for the demo access code (the app presents the hash,
     never a stored code; DEMO-ACCOUNT-SPEC.md, the Spark shape). */
  function sha256Hex(text) {
    if (typeof require === "function") {
      try { return Promise.resolve(require("crypto").createHash("sha256").update(String(text), "utf8").digest("hex")); } catch (e) {}
    }
    if (global.crypto && global.crypto.subtle && global.TextEncoder) {
      return global.crypto.subtle.digest("SHA-256", new global.TextEncoder().encode(String(text))).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      });
    }
    return Promise.reject(new Error("no sha256 available"));
  }

  var API = {
    TS: TS, DOORS: DOORS, LIVE_KEY: LIVE_KEY, DEVICE_KEY: DEVICE_KEY, COLLECTIONS: COLLECTIONS,
    cacheKeyFor: cacheKeyFor, guestCacheKey: guestCacheKey, hasUserData: hasUserData,
    stateToProfile: stateToProfile, profileCreateFields: profileCreateFields,
    stateToDocs: stateToDocs, repairDoc: repairDoc, docsToState: docsToState, accountHasData: accountHasData,
    tierPath: tierPath, planLineFor: planLineFor, syncTier: syncTier,
    subscriptionPath: subscriptionPath, entitlementFromRecord: entitlementFromRecord, readEntitlementRecord: readEntitlementRecord,
    ACTIVATION_SOURCES: ACTIVATION_SOURCES, noteActivation: noteActivation,
    contribPath: contribPath, buildContrib: buildContrib, cleanStamps: cleanStamps, mergeStamps: mergeStamps, stampStep: stampStep, stampChain: stampChain, computeAggregates: computeAggregates, weekKey: weekKey,
    subscriptionRecord: subscriptionRecord, reviewRecord: reviewRecord,
    avatarRowShips: avatarRowShips, avatarSaleCounts: avatarSaleCounts, avatarRollup: avatarRollup,
    importGate: importGate, pullAccount: pullAccount, pushAccount: pushAccount, runImport: runImport, fileRecovered: fileRecovered,
    docEq: docEq, canonical: canonical, SWEEP_COLLECTIONS: SWEEP_COLLECTIONS, deleteAccountSweep: deleteAccountSweep, deleteAccountFlow: deleteAccountFlow,
    readDevice: readDevice, writeDevice: writeDevice, removeDeviceData: removeDeviceData, consumeGuestPot: consumeGuestPot,
    sha256Hex: sha256Hex
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  global.MP_ACCOUNTS = API;
})(typeof window !== "undefined" ? window : globalThis);
