/* Meal Prep app. State lives on this device in localStorage. */
(function () {
  "use strict";
  const D = window.MP_DATA, L = window.MP_LOGIC, NUT = window.MP_NUTRITION;
  const STORE_KEY = "mealPrepStateV1";
  /* Language (app v34): every rendered word routes through t() in
     lang.js; month and day names come from Intl in the active
     language. Meal and cuisine labels are display words over data
     keys: the stored values stay the English data words, only the
     showing is translated. */
  const LANG = window.MP_LANG;
  const t = LANG.t;
  function monthName(d) { return new Intl.DateTimeFormat(LANG.locale(), { month: "long" }).format(d); }
  function weekdayName(d) { return new Intl.DateTimeFormat(LANG.locale(), { weekday: "short" }).format(d); }
  function fullDate(d) { return new Intl.DateTimeFormat(LANG.locale(), { day: "numeric", month: "long", year: "numeric" }).format(d); }
  function mealLabel(meal) { return t("meal." + meal); }
  function cuisineLabel(name) { return LANG.STRINGS.en["cuisine." + name] ? t("cuisine." + name) : name; }
  function storagePlace(storage) { return t("groc.in." + storage); }
  let state = load();
  /* The settings language choice is the record (Law B user data).
     If it resolves to a different language than this page booted
     in (an account adopted from another device, say), the mirror
     is corrected inside adoptSettingsChoice and the page reloads
     before anything renders. */
  if (LANG.adoptSettingsChoice(state.settings && state.settings.language)) { location.reload(); return; }
  let cursor = new Date(); cursor.setHours(12, 0, 0, 0);
  let viewMode = "month";
  let currentView = "calendar";

  function todayKey() { return L.dateKey(new Date()); }
  function daysAgoKey(n) { const d = new Date(); d.setDate(d.getDate() - n); return L.dateKey(d); }
  /* Empty start (design section 3A): a brand new state holds no seed
     household. The shape lives in MP_LOGIC.blankState so the unit tests
     can hold it to the law. Existing saved states never pass through here:
     they are repaired field by field in normaliseState and never reset. */
  function defaultState() { return L.blankState(); }
  function load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) return normaliseState(JSON.parse(raw)); } catch (e) {}
    return defaultState();
  }
  /* Saved data is the only copy of her data, so a wrong shaped field must never break the app.
     Every field is checked against the default shape and repaired, per QA bug 1 (13 Oct). */
  function isPlainObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
  function strList(x) { return Array.isArray(x) ? x.map(function (v) { return String(v == null ? "" : v); }).filter(Boolean) : []; }
  function timeOk(x) { return typeof x === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(x); }
  function normaliseState(s) {
    const d = defaultState();
    if (!isPlainObj(s)) return d;
    const out = Object.assign({}, d, s);
    out.onboarded = s.onboarded === true;
    out.notifications = typeof s.notifications === "string" ? s.notifications : d.notifications;
    out.preferences = Array.isArray(s.preferences) ? strList(s.preferences) : d.preferences;
    out.diet = L.cleanDiet(s.diet);
    out.maxCookMinutes = L.cleanCookMinutes(s.maxCookMinutes);
    out.busyNights = L.cleanBusyNights(s.busyNights);
    out.quickMinutes = L.cleanQuickMinutes(s.quickMinutes);
    /* Cooked ticks and leftover links (29 Oct, item 12) only survive
       in their exact shape and only for the last fortnight, so the
       record stays small and honest. */
    out.cooked = {}; out.leftovers = {};
    const cookedCutoff = new Date(); cookedCutoff.setDate(cookedCutoff.getDate() - 14);
    if (isPlainObj(s.cooked)) Object.keys(s.cooked).forEach(function (k) { if (s.cooked[k] === true && /^\d{4}\.\d{2}\.\d{2}\.(breakfast|lunch|dinner)$/.test(k) && L.parseKey(k.slice(0, 10)) >= cookedCutoff) out.cooked[k] = true; });
    if (isPlainObj(s.leftovers)) Object.keys(s.leftovers).forEach(function (k) { if (typeof s.leftovers[k] === "string" && s.leftovers[k] && /^\d{4}\.\d{2}\.\d{2}\.(breakfast|lunch|dinner)$/.test(k) && L.parseKey(k.slice(0, 10)) >= cookedCutoff) out.leftovers[k] = s.leftovers[k]; });
    out.defaultServings = L.cleanServings(s.defaultServings);
    out.recipeIngredients = L.cleanRecipeIngredients(s.recipeIngredients);
    out.recipeIngredientsManual = s.recipeIngredientsManual === true;
    out.photoTrialUsed = s.photoTrialUsed === true;
    out.eatTimes = {};
    ["breakfast", "lunch", "dinner"].forEach(function (m) { out.eatTimes[m] = isPlainObj(s.eatTimes) && timeOk(s.eatTimes[m]) ? s.eatTimes[m] : d.eatTimes[m]; });
    out.setupMinutes = (typeof s.setupMinutes === "number" && isFinite(s.setupMinutes) && s.setupMinutes >= 0 && s.setupMinutes <= 240) ? s.setupMinutes : d.setupMinutes;
    /* The second reminder offsets (app v35): one number per meal,
       0 to 240 minutes before the eating time, 0 meaning off. A state
       saved before the field existed repairs to all off, never on. */
    out.extraReminders = {};
    ["breakfast", "lunch", "dinner"].forEach(function (m) { const v = isPlainObj(s.extraReminders) ? s.extraReminders[m] : 0; out.extraReminders[m] = (typeof v === "number" && isFinite(v) && v >= 0 && v <= 240) ? Math.floor(v) : 0; });
    /* Meal skips (build 5, the reminders spec (a)): "<day>.<meal>"
       mapped to true. A skipped meal stays in the plan and on the
       grocery list; only its reminder silences. Repaired by the pure
       cleaner in logic.js; an absent map repairs to {}. */
    out.skips = L.cleanSkips(s.skips);
    /* The per meal reminder mode and its saved fixed times (build 5,
       spec (c)): "cook" fires at eat minus cook minus setup, "fixed"
       fires at the meal's own clock time every day. Bad shapes repair
       to cook mode with no saved time, the shipped behaviour. */
    out.reminderMode = L.cleanReminderMode(s.reminderMode);
    out.reminderTimes = L.cleanReminderTimes(s.reminderTimes);
    out.family = Array.isArray(s.family) ? s.family.filter(isPlainObj).map(function (p, i) {
      /* Colours the app shipped before the palette existed map to their new
         twins at load (QA F3); a colour outside that old set is the user's
         own pick and is carried through exactly as stored. */
      return { id: typeof p.id === "string" && p.id ? p.id : "p" + (i + 1), name: String(p.name || "Person " + (i + 1)), color: typeof p.color === "string" && p.color ? L.mapPersonColor(p.color) : L.PERSON_COLORS[0], tags: strList(p.tags), dislikes: strList(p.dislikes), allergies: strList(p.allergies) };
    }) : d.family;
    /* Guide-date honesty (b32 cure, QA F-MP32-2): a shelfDays number
       on a food the shelf table does not know can only be the old add
       path's fallback stamp, never a real guide, so it is dropped at
       this repair boundary and the item goes back to having no date.
       Leftover items keep theirs: their 3 days are the app's own
       spoken guide, linked from out.leftovers above. */
    const leftoverIds = {}; Object.keys(out.leftovers).forEach(function (k) { leftoverIds[out.leftovers[k]] = true; });
    out.pantry = Array.isArray(s.pantry) ? s.pantry.filter(isPlainObj).map(function (it, i) {
      const itId = typeof it.id === "string" && it.id ? it.id : "g" + i;
      return { id: itId, name: String(it.name || "food"), qty: (typeof it.qty === "number" && isFinite(it.qty) && it.qty >= 0) ? it.qty : 0, unit: typeof it.unit === "string" && it.unit ? it.unit : "pcs", storage: ["fridge", "freezer", "pantry"].indexOf(it.storage) !== -1 ? it.storage : "fridge", added: typeof it.added === "string" && it.added ? it.added : todayKey(), shelfDays: (typeof it.shelfDays === "number" && isFinite(it.shelfDays) && (L.shelfKnown(it.name, D) || leftoverIds[itId])) ? it.shelfDays : undefined };
    }) : d.pantry;
    out.plan = isPlainObj(s.plan) ? s.plan : {};
    out.planCleared = s.planCleared === true;
    out.customRecipes = Array.isArray(s.customRecipes) ? s.customRecipes.filter(isPlainObj).map(function (r, i) {
      return { id: typeof r.id === "string" && r.id ? r.id : "own." + i, name: String(r.name || "My recipe"), meal: ["breakfast", "lunch", "dinner"].indexOf(r.meal) !== -1 ? r.meal : "dinner", cuisines: strList(r.cuisines).length ? strList(r.cuisines) : ["Comfort"], minutes: (typeof r.minutes === "number" && isFinite(r.minutes) && r.minutes > 0) ? r.minutes : 30, servings: (typeof r.servings === "number" && r.servings > 0) ? r.servings : 2, ingredients: Array.isArray(r.ingredients) ? r.ingredients : [], steps: Array.isArray(r.steps) ? r.steps : [], custom: true };
    }) : [];
    out.extras = Array.isArray(s.extras) ? s.extras.filter(isPlainObj) : [];
    /* Calendar import (app v22): the events slice and the import registry
       are repaired by the pure helpers in logic.js, like every other
       field. Imported events are the user's own data and a repair never
       drops them. */
    out.events = L.cleanEvents(s.events);
    out.imports = L.cleanImports(s.imports);
    out.doneItems = isPlainObj(s.doneItems) ? s.doneItems : {};
    out.hiddenItems = isPlainObj(s.hiddenItems) ? s.hiddenItems : {};
    /* The at home put back choices (build 8): a local, per list choice
       kept through repairs like the other item state maps. It is not a
       spec field and does not ride the account round trip. */
    out.atHomeBack = isPlainObj(s.atHomeBack) ? s.atHomeBack : {};
    out.sentReminders = isPlainObj(s.sentReminders) ? s.sentReminders : {};
    /* Tucked away menu areas are an organisation choice, so they persist like food
       preferences. Cleaned to real group ids so a wrong shaped value can never hide
       the whole menu. Which group is open never persists (see renderNav). */
    out.navTucked = L.cleanTucked(s.navTucked);
    /* Law E: the background choice and the user's photo are settings, cleaned by
       the pure repair in logic.js. A valid photo is never dropped by a repair;
       only the user's own buttons in the Appearance card can remove it. */
    out.settings = L.cleanBackgroundSettings(s.settings);
    /* The guide state (design section 3B) is repaired like every other
       field, never a lost one. Upgraders stay silent (app v21): a state
       carrying the user's own data (the slices repaired just above), or a
       finished welcome, predates the guide and repairs to done; a begun
       or early closed guide is kept exactly; only an empty state with no
       begun guide starts at step 1. The guideState slice is the only
       write this repair makes. */
    out.guideState = L.cleanGuideState(s.guideState, s.onboarded === true, L.stateHasUserData(out));
    /* Auto planning: new states start with an empty plan and only fill it
       when the user plans (the guide, Fill this month, Plan my first week).
       A saved state with no autoPlan field predates the flag and belongs to
       an established user, so it keeps the auto fill it has always had. */
    out.autoPlan = typeof s.autoPlan === "boolean" ? s.autoPlan : true;
    /* The account holder's own name (HQ ruling, 15 Oct 16:28): asked at
       sign up, carried on the profile, and used only to greet the person
       by their own name. A guest state simply has none. */
    out.accountName = typeof s.accountName === "string" ? s.accountName : "";
    /* Sidebar Adaptive Law (14 Oct, the house standard section 5): the app NEVER greets anyone
       with the menu already out. Every load starts hidden, whatever the last session chose.
       The toggle works inside the session only, so the saved value is normalised to hidden. */
    out.ui = { sidebarHidden: true };
    return out;
  }
  let notifReschedTimer = null;
  let localSaveTimer = null;
  const SAVE_DEBOUNCE_MS = 500;
  function writeLocalState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }
  function flushLocalSave() {
    if (localSaveTimer === null) return;
    clearTimeout(localSaveTimer);
    localSaveTimer = null;
    writeLocalState();
  }
  function flushPendingSave() {
    flushLocalSave();
    const hook = window.MP_ACCOUNT_HOOK;
    if (hook && hook.flushPush) {
      try { return hook.flushPush(); } catch (e) { return Promise.reject(e); }
    }
    return Promise.resolve();
  }
  window.MP_APP_HOOK = { flushLocal: flushLocalSave };
  let leaveFlush = null;
  function flushOnLeave() {
    if (leaveFlush) return leaveFlush;
    leaveFlush = flushPendingSave().catch(function () {});
    return leaveFlush;
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") { leaveFlush = null; return; }
    flushOnLeave();
  });
  window.addEventListener("pagehide", flushOnLeave);
  window.addEventListener("beforeunload", flushOnLeave);
  function save() {
    if (localSaveTimer !== null) clearTimeout(localSaveTimer);
    localSaveTimer = setTimeout(function () { localSaveTimer = null; writeLocalState(); }, SAVE_DEBOUNCE_MS);
    if (window.MP_ACCOUNT_HOOK && window.MP_ACCOUNT_HOOK.onSave) window.MP_ACCOUNT_HOOK.onSave();
    queueNotifReschedule();
  }
  /* Accounts wave (v23): the activation stamp hook. A meal landing on a
     day through the user's OWN action (an add or swap in the day view,
     or a planner run the user tapped) is the app's activation event
     (design section 11). Automatic fills (ensureDay) never call this.
     The hook exists only when accounts are live; dormant builds have
     no hook installed and nothing changes. */
  function notePlanned(src) { if (window.MP_ACCOUNT_HOOK && window.MP_ACCOUNT_HOOK.onPlanned) window.MP_ACCOUNT_HOOK.onPlanned(src); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function $(id) { return document.getElementById(id); }
  /* Icon set: Lucide (ISC licence, see ICONS-LICENCE.md). One consistent set across the
     whole app, drawn from the inline sprite in index.html and tinted by CSS colour. */
  const MEAL_ICONS = { breakfast: "egg", lunch: "salad", dinner: "utensils" };
  function icon(name, cls) { return "<svg class='icon" + (cls ? " " + cls : "") + "' aria-hidden='true'><use href='#i-" + name + "'/></svg>"; }
  function mealIcon(meal) { return "<svg class='icon mealGlyph' style='color:" + D.MEALS[meal].color + "' aria-hidden='true'><use href='#i-" + MEAL_ICONS[meal] + "'/></svg>"; }
  /* The legend glyph wears the meal's ink twin (app v35, item 64):
     it sits on the meal's own soft chip in the legend, the fixed light
     ground where the raw colour reads under the floor. */
  function mealIconInk(meal) { return "<svg class='icon mealGlyph' style='color:" + D.MEALS[meal].ink + "' aria-hidden='true'><use href='#i-" + MEAL_ICONS[meal] + "'/></svg>"; }
  /* Designed empty states (design section 3A): the screen's icon large in
     the brand colour, one short line, and one first action button when the
     screen has one. The button carries data-empty-action and its handler is
     bound by the view that rendered it. The line is app copy, never user
     data, so it is not escaped. */
  function emptyState(iconName, text, btnLabel, btnAction) { return "<div class='emptyState'><span class='emptyCircle'>" + icon(iconName, "iconEmpty") + "</span><p class='hint'>" + text + "</p>" + (btnLabel ? "<button class='pillBtn' data-empty-action='" + (btnAction || "") + "'>" + btnLabel + "</button>" : "") + "</div>"; }
  function allRecipes() { return D.RECIPES.concat(state.customRecipes); }
  function eligibleRecipes() { return allRecipes().filter(function (r) { return L.recipeAllowed(r, planCtx(), D); }); }
  function recipesForServingCount() { return eligibleRecipes().map(function (r) { return L.scaleRecipe(r, state.defaultServings); }); }
  function recipeById(id) { return allRecipes().filter(function (r) { return r.id === id; })[0]; }
  /* Recipe content in the active language (app v36, the LANGUAGE
     BUILD phase 2). A built in recipe carries Spanish fields (data.js
     RECIPES_ES, landed verbatim from the Quality pair read pack); the
     showing follows the active language through these helpers and
     falls back to the recipe's own English fields whenever a Spanish
     field is missing or blank, so a gap renders English, never a
     blank. A user's own recipe carries no Spanish fields and is never
     translated: it always shows its own words. Amounts, units and
     aisles stay data. The allergy and calorie lines in the recipe
     view keep resolving through the legal flagged keys in lang.js,
     untouched by this content. */
  function rName(r) { return r && LANG.lang() === "es" && r.es && r.es.name ? r.es.name : (r ? r.name : ""); }
  function rIngName(r, i) { const ing = r.ingredients[i]; return LANG.lang() === "es" && r.es && r.es.ingredients && r.es.ingredients[i] ? r.es.ingredients[i] : ing.name; }
  function rIngLine(r, ingredient, index) {
    const hasQty = ingredient.qty !== null && ingredient.qty !== undefined && ingredient.qty !== "";
    const amount = hasQty ? [String(ingredient.qty), ingredient.unit && ingredient.unit !== "to taste" ? ingredient.unit : ""].filter(Boolean).join(" ") : (ingredient.unit === "to taste" ? t("recipes.toTaste") : "");
    const note = ingredient.note ? " (" + ingredient.note + ")" : "";
    return esc([amount, rIngName(r, index)].filter(Boolean).join(" ") + note);
  }
  function rSteps(r) { return LANG.lang() === "es" && r.es && Array.isArray(r.es.steps) && r.es.steps.length === r.steps.length && r.es.steps.every(function (s) { return !!s; }) ? r.es.steps : r.steps; }
  /* The grocery list built from the plan shows ingredient names that
     exist only because recipes were planned, so its showing follows
     the same rule through one canonical name map, built from the
     recipes' own Spanish fields (the suite pins that every English
     ingredient name carries exactly one Spanish rendering). Only the
     showing changes: list keys, pantry matching and the items a user
     adds by hand keep the data words, always. */
  const ING_ES = {};
  D.RECIPES.forEach(function (r) { if (r.es) r.ingredients.forEach(function (ing, i) { const k = ing.name.toLowerCase(); if (!(k in ING_ES)) ING_ES[k] = r.es.ingredients[i]; }); });
  Object.assign(ING_ES, {
    "egg": "huevo", "milk": "leche", "cheese": "queso", "chicken breast": "pechuga de pollo",
    "beef mince": "carne molida de res", "tomato": "tomate", "cucumber": "pepino",
    "carrot": "zanahoria", "spinach": "espinaca", "avocado": "aguacate", "lemon": "limón",
    "yogurt": "yogur", "butter": "mantequilla", "broccoli": "brócoli", "capsicum": "pimiento"
  });
  function listIngName(name) { return LANG.lang() === "es" && ING_ES[name.toLowerCase()] ? ING_ES[name.toLowerCase()] : name; }
  /* Shelf labels resolve the same way recipe names do (QA F1): under
     Spanish the entry's Spanish label shows; a missing or blank
     Spanish label renders the English one, never a blank. Only the
     showing changes: the lookup keys and the days stay data. */
  function shelfLabel(s) { return s && LANG.lang() === "es" && s.es ? s.es : (s ? s.label : ""); }
  function toast(msg) { const t = $("toast"); if (pendingUndo) { clearTimeout(pendingUndo.timer); pendingUndo = null; } t.textContent = msg; t.classList.remove("hidden"); setTimeout(function () { if (!pendingUndo) t.classList.add("hidden"); }, 2600); }
  /* Delete safety (Law B2, app v20). One shared pair for the whole app.
     Item deletes go through toastUndo: the delete lands at once, the toast
     holds the exact record, Undo puts it back byte for byte, and the toast
     expiring lets the user's delete stand. Bulk and one way deletes (clear
     the plan, remove the background photo) go through askConfirm instead:
     one safety step, asked before anything is lost. Both read the theme
     tokens, so they hold up in all four Law E themes. */
  let pendingUndo = null;
  function toastUndo(msg, restore) {
    if (pendingUndo) { clearTimeout(pendingUndo.timer); pendingUndo = null; }
    /* The element rides as el, never t: t is the translator, and a
       local const t here shadows it, so the Undo label line threw
       and no Undo button ever rendered (build 5 dogfood, Law B2). */
    const el = $("toast");
    el.innerHTML = "";
    el.appendChild(document.createTextNode(msg + " "));
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "toastUndoBtn"; btn.textContent = t("common.undo");
    el.appendChild(btn);
    el.classList.remove("hidden");
    const timer = setTimeout(function () { pendingUndo = null; el.classList.add("hidden"); }, 6500);
    pendingUndo = { timer: timer };
    btn.addEventListener("click", function () {
      if (!pendingUndo) return;
      clearTimeout(pendingUndo.timer); pendingUndo = null;
      el.classList.add("hidden");
      restore();
    });
  }
  let confirmAction = null;
  function askConfirm(title, text, yesLabel, fn) {
    $("confirmTitle").textContent = title;
    $("confirmText").textContent = text;
    $("confirmYes").textContent = yesLabel;
    confirmAction = fn;
    $("confirmModal").classList.remove("hidden");
  }
  /* ================= upgrade moment popup (v32) =================
     One component, shown only at the moment of wanting: a person on
     the free tier reaching for a Plus thing. The fences and the copy
     of record are UPGRADE-COPY.md, from PRICING.md: Free Forever
     covers ONE eater profile with dislikes; Plus adds the planning
     extras (unlimited family profiles, the grocery list built from
     the plan, fridge photo help, and more). Allergy adaptations and
     allergen warnings are free in every tier and no trigger ever
     sits on an allergy surface. The popup never appears on open, on
     a timer, or on navigation; a paid or comped user never sees it
     (the tier is the accounts layer's resolved entitlement; while
     accounts are dormant everyone is on the free tier); the demo
     kitchen is never gated, it exists to try everything. One showing
     per want per session; dismissing leaves the app fully usable and
     the gated thing explains itself in one line. */
  const PLUS_WANTS = {
    family: { title: t("upgrade.family.title"), body: t("upgrade.family.body"), gate: t("upgrade.family.gate"), gateEl: "gateLineFamily" },
    list: { title: t("upgrade.list.title"), body: t("upgrade.list.body"), gate: t("upgrade.list.gate") },
    photo: { title: t("upgrade.photo.title"), body: t("upgrade.photo.body"), gate: t("upgrade.photo.gate"), gateEl: "gateLinePhoto" }
  };
  const plusShown = {}; /* session only: one popup per want */
  let upgradeWant = null;
  function plusActive() {
    if (document.body.classList.contains("demoOn")) return true;
    const s = window.MP_ACCOUNT_SYNC;
    return !!(s && typeof s.getEntitlement === "function" && s.getEntitlement() === "pro");
  }
  /* True when the want is gated and the tap stops here: the popup
     shows the first time, the one line explanation after that. */
  function plusGate(want) {
    if (plusActive()) return false;
    if (plusShown[want]) { showGateLine(want); return true; }
    plusShown[want] = true;
    showUpgrade(want);
    return true;
  }
  function showGateLine(want) {
    const w = PLUS_WANTS[want]; if (!w) return;
    if (w.gateEl) { const el = $(w.gateEl); if (el) { el.textContent = w.gate; el.classList.remove("hidden"); } }
    if (want === "list") renderList();
  }
  function showUpgrade(want) {
    const w = PLUS_WANTS[want]; if (!w) return;
    upgradeWant = want;
    $("upgradeTitle").textContent = w.title;
    $("upgradeBody").textContent = w.body;
    $("upgradeModal").classList.remove("hidden");
  }
  function hideUpgrade() {
    const w = upgradeWant;
    $("upgradeModal").classList.add("hidden");
    upgradeWant = null;
    if (w) showGateLine(w);
  }
  /* The honest route: Try starts the real purchase through the
     payments seam (live since the enabling build, app v47). Only
     a dormant answer falls through to the Plans card in
     Preferences: the copy that cannot run the rails (the open
     web, until the web lane's own sitting) fakes no checkout, no
     trial start and no store sheet, and lands on the card, whose
     priced on-sale statement stands beside the offer. */
  function goPlans() { switchView("prefs"); const c = $("plansCard"); if (c) setTimeout(function () { c.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60); }
  $("upgradeNotNow").addEventListener("click", hideUpgrade);
  $("upgradeX").addEventListener("click", hideUpgrade);
  $("upgradeModal").addEventListener("click", function (e) { if (e.target === $("upgradeModal")) hideUpgrade(); });
  $("upgradeTry").addEventListener("click", function () {
    const w = upgradeWant; $("upgradeModal").classList.add("hidden"); upgradeWant = null; if (w) showGateLine(w);
    const P = window.MP_PAYMENTS;
    /* The popup road consumes its answer too (app v49, U7): a
       dormant answer, and now a timed out one, land on the Plans
       card, the honest surface for both. */
    if (P && typeof P.tryPlus === "function" && P.enabled()) { P.tryPlus(w).then(function (r) { if (r && (r.dormant || r.timeout)) goPlans(); }); }
    else goPlans();
  });

  /* The buy surface (app v46; the buy button law of 19 Oct, via
     Finance: in the payments enabling build the buy buttons are
     built FIRST, in the app's whole brand, indistinguishable from
     the app's own buttons; a generic or bolted on button is a gate
     failure). These are the app's own buttons and nothing else:
     the same primaryBtn the door's Continue and Save preferences
     wear, the same quiet linkBtn the door's Change line speaks in,
     the app's own DOM built here in app.js, no hosted paywall
     surface anywhere. The words are the copy of record's voice and
     the prices are never written here: the labels route through
     the language strings, whose price tokens the prices table
     fills at render, exactly like the offer line above.
     The surface stands only while the payment rails are live
     (payments.js enabled, the config the enabling build filled,
     app v47). While the rails sleep it renders NOTHING: no box,
     no buttons, and the Plans card reads by its written lines
     alone. Plus only: the other plan has no products, so it has
     no buttons. A buy tap starts that period's purchase through
     the payments seam; the restore line asks the seam to restore.
     App v48 (SR's G7 item) adds the paywall's legal furniture under
     the restore line, in the same quiet voices: the renewal
     disclosure (the three truths, prices riding the table tokens)
     and the links row, Privacy Policy and Terms of Use. */
  /* U7's consumption (app v49): the buy and restore taps CONSUME
     the seam's answers, which used to be discarded whole. The
     tapped button carries the quiet isPending mark while its
     sheet is awaited, a second tap on the same pending button
     starts nothing new, and every answer the seam shapes lands
     as one quiet line in the box: done, cancelled (nothing was
     charged), the seam's own error words, dormant (the honest
     not switched on line), a restore found or not found or not
     readable, and the 60 second bound's timeout. Nothing here
     ever claims a success the seam did not report. */
  const plansBuyPending = { month: false, year: false, restore: false };
  function plansBuyMsg(text) { const m = $("plansBuyMsg"); if (m) m.textContent = text || ""; }
  function plansBuyTap(kind, btn) {
    if (plansBuyPending[kind]) return;
    plansBuyPending[kind] = true;
    btn.classList.add("isPending");
    plansBuyMsg("");
    const clear = function () { plansBuyPending[kind] = false; btn.classList.remove("isPending"); };
    const P = window.MP_PAYMENTS;
    if (kind === "restore") {
      P.restore().then(function (r) {
        clear();
        if (r && r.timeout) plansBuyMsg(t("plans.buySlow"));
        else if (r && r.dormant) plansBuyMsg(t("plans.buyDormant"));
        else if (r === "pro") plansBuyMsg(t("plans.restoreFound"));
        else if (r === "free") plansBuyMsg(t("plans.restoreNone"));
        else plansBuyMsg(t("plans.restoreUnknown"));
      }, function () { clear(); plansBuyMsg(t("plans.buyFailed")); });
      return;
    }
    P.tryPlus(null, kind).then(function (r) {
      clear();
      if (r && r.purchased) plansBuyMsg(t("plans.buyDone"));
      else if (r && r.cancelled) plansBuyMsg(t("plans.buyCancelled"));
      else if (r && r.timeout) plansBuyMsg(t("plans.buySlow"));
      else if (r && r.dormant) plansBuyMsg(t("plans.buyDormant"));
      else if (r && r.error) plansBuyMsg(String(r.error));
      else plansBuyMsg(t("plans.buyFailed"));
    }, function () { clear(); plansBuyMsg(t("plans.buyFailed")); });
  }

  /* Apple's standard EULA: the Terms of Use target, named once. */
  const PLANS_TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
  function renderPlansBuy() {
    const card = $("plansCard"); if (!card) return;
    /* The card's state line speaks the LIVE entitlement (app v51,
       the sweep line cure: QA's build 13 sweep found the shipped
       line was static markup telling EVERY reader "You are on
       the Free plan", a resolved Plus holder included, while the
       truth stood only on the account card). It renders here,
       ahead of the dormancy gate below: which plan a person
       holds never waits on the buy surface. A free session hears
       the standing free sentence; a resolved Plus session hears
       its plan named the way the account card names it
       (plans.topLine, the Top plan). The entitlement resolution
       re-renders the open view and this call rides the prefs
       render, so the line lands with the resolution; a language
       switch reloads the page into the same render. */
    const stateLine = $("plansStateLine");
    if (stateLine) stateLine.textContent = t(plusActive() ? "plans.topLine" : "plans.freeLine");
    const P = window.MP_PAYMENTS;
    let box = $("plansBuy");
    if (box) box.remove();
    if (!P || typeof P.enabled !== "function" || !P.enabled()) return;
    /* The Privacy Policy link speaks the address the Settings row
       already carries: read it off that row, so the address stands
       written in exactly one place in the app. */
    const privRow = document.querySelector("a[data-i18n='data.privacy']");
    const privHref = privRow ? privRow.getAttribute("href") : "";
    box = document.createElement("div"); box.id = "plansBuy";
    box.innerHTML =
      "<p class='hint'>" + t("plans.buyFreeLine") + "</p>" +
      "<div class='row'><button class='primaryBtn' id='buyPlusMonthly'>" + t("plans.buyMonthly") + "</button>" +
      "<button class='primaryBtn' id='buyPlusYearly'>" + t("plans.buyYearly") + "</button></div>" +
      "<div class='row'><button class='linkBtn' id='restorePurchase'>" + t("plans.restore") + "</button></div>" +
      "<p class='hint' id='plansBuyMsg'></p>" +
      "<p class='hint'>" + t("plans.disclosure") + "</p>" +
      "<div class='row'>" +
      (privHref ? "<a class='linkBtn' id='plansPrivacyLink' href='" + privHref + "' target='_blank' rel='noopener'>" + t("data.privacy") + "</a>" : "") +
      "<a class='linkBtn' id='plansTermsLink' href='" + PLANS_TERMS_URL + "' target='_blank' rel='noopener'>" + t("plans.terms") + "</a></div>";
    card.appendChild(box);
    box.querySelector("#buyPlusMonthly").addEventListener("click", function () { plansBuyTap("month", this); });
    box.querySelector("#buyPlusYearly").addEventListener("click", function () { plansBuyTap("year", this); });
    box.querySelector("#restorePurchase").addEventListener("click", function () { plansBuyTap("restore", this); });
  }

  function expiringNames() {
    return L.sortByExpiry(state.pantry, new Date()).slice(0, 8).map(function (i) { return i.name; });
  }
  function planCtx() {
    return { preferences: state.preferences, family: state.family, expiringNames: expiringNames(), pantryNames: state.pantry.map(function (item) { return item.name; }), customRecipes: state.customRecipes, diet: state.diet, maxCookMinutes: state.maxCookMinutes, defaultServings: state.defaultServings, busyNights: state.busyNights, quickMinutes: state.quickMinutes };
  }
  function ensureDay(key) {
    if (state.plan[key]) return;
    /* Empty start: until the user plans something themselves (guide, Fill
       this month, Plan my first week), viewed days stay empty. Established
       users carry autoPlan true from their saved state and never see this. */
    if (state.planCleared || !state.autoPlan) { state.plan[key] = {}; return; }
    const usedCounts = {}; const recent = [];
    /* The no repeat memory is the last 14 days (29 Oct, item 5):
       use counts still span the whole plan, but the recent penalty
       only looks back a fortnight, in day order. */
    const target = L.parseKey(key); const windowStart = new Date(target); windowStart.setDate(windowStart.getDate() - 14);
    Object.keys(state.plan).sort().forEach(function (k) {
      const inWindow = L.parseKey(k) >= windowStart && L.parseKey(k) < target;
      ["breakfast", "lunch", "dinner"].forEach(function (m) {
        const id = state.plan[k][m]; if (id) { usedCounts[id] = (usedCounts[id] || 0) + 1; if (inWindow) recent.push(id); }
      });
    });
    const dayPlan = {};
    const dayCtx = L.planCtxForDay(planCtx(), key);
    ["breakfast", "lunch", "dinner"].forEach(function (meal) {
      const r = L.pickRecipe(meal, Object.assign({}, dayCtx, { recentIds: recent.slice(-42), usedCounts: usedCounts }), D);
      if (r) { dayPlan[meal] = r.id; recent.push(r.id); usedCounts[r.id] = (usedCounts[r.id] || 0) + 1; }
    });
    state.plan[key] = dayPlan; save();
  }
  function ensureRange(startKey, days) { for (let i = 0; i < days; i++) { const d = L.parseKey(startKey); d.setDate(d.getDate() + i); ensureDay(L.dateKey(d)); } }
  /* "Plan my first week" (guide step 5 and the Calendar and Grocery List
     empty states): the planner behind "Fill this month with meals", run for
     the month on screen. Planning is the user planning on purpose, so it
     also switches auto fill on from here. Returns true when a meal landed. */
  function planMyFirstWeek() {
    state.planCleared = false; state.autoPlan = true;
    const first = L.dateKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12));
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const plan = L.buildPlan(first, days, planCtx(), D);
    Object.keys(plan).forEach(function (k) { state.plan[k] = plan[k]; });
    save();
    if (planHasMeals()) notePlanned("planner");
    return planHasMeals();
  }
  function planHasMeals() { return Object.keys(state.plan).some(function (k) { const p = state.plan[k]; return p && (p.breakfast || p.lunch || p.dinner); }); }
  function mealBadge(meal) { const m = D.MEALS[meal]; return "<span class='badge' style='background:" + m.soft + ";color:#111827'>" + mealIcon(meal) + mealLabel(meal) + "</span>"; }
  function dateTitle(d) { return d.toLocaleDateString(LANG.locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }

  /* Nav shape (two-shape law: HQ ruling 15 Oct 16:26, desktop realigned
     15 Oct 16:31; supersedes the 14 Oct reflow shape): the menu is hidden
     on every load and is never remembered; the top strip button is always
     visible. Phone (up to 900px): open, the menu takes most of the screen
     and the page shrinks to a thin sliver at the edge (styles.css carries
     the geometry); while it is open the page underneath is inert, and the
     capture listener below turns any tap on it into a close, so the
     controls under the sliver never fire. Desktop (over 900px): a 272px
     panel sits beside live content, so content clicks never close it; only
     the strip button or Escape does. */
  function applySidebar() {
    const hidden = !state.ui ? true : state.ui.sidebarHidden === true;
    document.body.classList.toggle("sidebarHidden", hidden);
    const t = $("sidebarToggle"); if (t) t.setAttribute("aria-pressed", hidden ? "true" : "false");
    const more = $("bottomMoreBtn"); if (more) more.setAttribute("aria-expanded", hidden ? "false" : "true");
  }
  function setSidebar(hidden, moveFocus) {
    if (!state.ui) state.ui = { sidebarHidden: true };
    state.ui.sidebarHidden = hidden; save(); applySidebar();
    if (!moveFocus) return;
    if (hidden) { const t = $("sidebarToggle"); if (t) t.focus(); }
    else { const first = document.querySelector("#sidebar button"); if (first) first.focus(); }
  }
  $("sidebarToggle").addEventListener("click", function () {
    const hidden = !state.ui ? true : state.ui.sidebarHidden === true;
    setSidebar(!hidden, true);
  });
  $("app").addEventListener("click", function (e) {
    if (document.body.classList.contains("sidebarHidden")) return;
    if (!window.matchMedia("(max-width: 900px)").matches) return;
    if (e.target.closest && e.target.closest("#sidebar")) return;
    e.preventDefault(); e.stopPropagation();
    setSidebar(true, true);
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !document.body.classList.contains("sidebarHidden")) setSidebar(true, true);
  });

  /* Navigation calm (house law, 14 Oct): the menu is grouped by main area and only
     one area is open at a time. Which area is open is a session choice only, never
     saved; on load the area holding the current page is open. Areas a person does
     not use can be tucked into Saved for later; those choices are saved settings
     (state.navTucked). The menu wears the one open shape at every width, so
     the groups, their heads and Saved for later render the same everywhere. */
  let openGroupId = null;   /* session only, never written into saved state */
  let savedOpen = false;    /* session only */
  const VIEW_LABELS = { calendar: t("nav.calendar"), recipes: t("nav.recipes"), groceries: t("nav.groceries"), list: t("nav.list"), photocal: t("nav.photocal"), family: t("nav.family"), reminders: t("nav.reminders") };
  function tuckedList() { return L.cleanTucked(state.navTucked); }
  function groupLabel(id) { return t("nav.group." + id); }
  function firstUntuckedGroup() { const t = tuckedList(); const g = L.NAV_GROUPS.filter(function (x) { return t.indexOf(x.id) === -1; })[0]; return g ? g.id : null; }
  function renderNav() {
    const tucked = tuckedList();
    if (openGroupId === null || tucked.indexOf(openGroupId) !== -1) {
      const mine = L.navGroupForView(currentView);
      openGroupId = mine && tucked.indexOf(mine) === -1 ? mine : firstUntuckedGroup();
    }
    document.querySelectorAll(".navGroup").forEach(function (el) {
      const id = el.getAttribute("data-group");
      el.classList.toggle("tucked", tucked.indexOf(id) !== -1);
      el.classList.toggle("closed", openGroupId !== id);
      const head = el.querySelector("[data-group-btn]");
      if (head) head.setAttribute("aria-expanded", openGroupId === id ? "true" : "false");
      const tuck = el.querySelector("[data-tuck]");
      if (tuck) {
        const can = L.canTuckGroup(tucked, id, currentView);
        tuck.disabled = !can;
        tuck.title = can ? t("nav.tuckAway") : L.navGroupForView(currentView) === id ? t("nav.tuckTitleUsing") : t("nav.tuckTitleLast");
      }
    });
    const saved = $("navSaved");
    saved.classList.toggle("empty", tucked.length === 0);
    saved.classList.toggle("closed", !savedOpen);
    $("savedHead").setAttribute("aria-expanded", savedOpen ? "true" : "false");
    $("savedBody").innerHTML = tucked.length ? tucked.map(function (id) {
      const g = L.NAV_GROUPS.filter(function (x) { return x.id === id; })[0];
      const names = g.items.map(function (v) { return VIEW_LABELS[v]; }).join(", ");
      return "<div class='savedRow'><div><div class='savedRowName'>" + esc(groupLabel(id)) + "</div><div class='savedRowItems'>" + esc(names) + "</div></div><button class='bringBack' data-restore='" + id + "'>" + t("nav.bringBack") + "</button></div>";
    }).join("") : "<p class='hint' style='margin:4px 10px'>" + t("nav.nothingTucked") + "</p>";
    $("savedBody").querySelectorAll("[data-restore]").forEach(function (b) {
      b.addEventListener("click", function () { restoreGroup(b.getAttribute("data-restore")); });
    });
  }
  function tuckGroup(id) {
    if (!L.canTuckGroup(tuckedList(), id, currentView)) return;
    state.navTucked = tuckedList().concat([id]);
    if (openGroupId === id) openGroupId = null;
    save(); renderNav();
    toast(t("nav.tuckedToast", { group: groupLabel(id) }));
  }
  function restoreGroup(id) {
    state.navTucked = tuckedList().filter(function (x) { return x !== id; });
    save(); renderNav();
    toast(t("nav.restoredToast", { group: groupLabel(id) }));
  }
  document.querySelectorAll("[data-group-btn]").forEach(function (b) {
    b.addEventListener("click", function () {
      const id = b.getAttribute("data-group-btn");
      openGroupId = openGroupId === id ? null : id;
      renderNav();
    });
  });
  document.querySelectorAll("[data-tuck]").forEach(function (b) {
    b.addEventListener("click", function () { tuckGroup(b.getAttribute("data-tuck")); });
  });
  $("savedHead").addEventListener("click", function () { savedOpen = !savedOpen; renderNav(); });

  /* Navigation */
  document.querySelectorAll(".navBtn").forEach(function (b) {
    b.addEventListener("click", function () { switchView(b.getAttribute("data-nav")); });
  });
  document.querySelectorAll(".bottomNavBtn[data-view]").forEach(function (b) {
    b.addEventListener("click", function () { switchView(b.getAttribute("data-view")); });
  });
  $("bottomMoreBtn").addEventListener("click", function () {
    const hidden = document.body.classList.contains("sidebarHidden");
    setSidebar(!hidden, hidden);
  });
  function syncBottomNav(v) {
    const core = ["calendar", "recipes", "groceries", "list"];
    document.querySelectorAll(".bottomNavBtn[data-view]").forEach(function (b) {
      const on = b.getAttribute("data-view") === v;
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    const more = $("bottomMoreBtn");
    if (more) {
      const on = core.indexOf(v) === -1;
      more.classList.toggle("active", on);
      if (on) more.setAttribute("aria-current", "page"); else more.removeAttribute("aria-current");
    }
  }
  function switchView(v) {
    currentView = v;
    document.querySelectorAll(".navBtn").forEach(function (b) {
      const on = b.getAttribute("data-nav") === v;
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    document.querySelectorAll(".view").forEach(function (s) { s.classList.remove("active"); });
    $("view-" + v).classList.add("active");
    const g = L.navGroupForView(v);
    if (g && tuckedList().indexOf(g) === -1) openGroupId = g;
    renderNav();
    syncBottomNav(v);
    render();
    /* QA F1 (build 9): a nav choice on the phone shape lands the
       person ON the view, so the drawer closes with the switch.
       Left open, the drawer stayed up over the new view (the page
       squeezed into the sliver) and the app capture listener above
       ate the first tap on the new view just to close the drawer;
       only the second tap worked. Desktop keeps its panel beside
       the content: its nav choices never close it. */
    if (window.matchMedia("(max-width: 900px)").matches && state.ui && state.ui.sidebarHidden !== true) setSidebar(true, false);
  }
  function render() {
    syncBottomNav(currentView);
    renderSide();
    if (currentView === "calendar") renderCalendar();
    if (currentView === "recipes") renderRecipes();
    if (currentView === "groceries") renderGroceries();
    if (currentView === "list") renderList();
    if (currentView === "family") renderFamily();
    if (currentView === "prefs") renderPrefs();
    if (currentView === "reminders") renderReminders();
    if (currentView === "photocal") renderPhotoCalChips();
  }
  /* Calories come from the USDA table in nutrition.js. A recipe with an
     ingredient outside the table returns null and shows no number at all. */
  function kcalPerServing(r) {
    const sourceKcal = r && r.nutritionPerServing && Number(r.nutritionPerServing.calories);
    return isFinite(sourceKcal) && sourceKcal > 0 ? Math.round(sourceKcal) : L.recipeKcal(r, NUT);
  }
  function kcalText(r) { const k = kcalPerServing(r); return k ? t("kcal.about", { n: k }) : ""; }
  function renderSide() {
    const sorted = L.sortByExpiry(state.pantry, new Date());
    const soon = sorted.filter(function (i) { return (typeof i.shelfDays === "number" || L.shelfKnown(i.name, D)) && L.daysLeft(i, new Date()) <= 3; });
    $("expiringList").innerHTML = soon.length ? soon.map(function (i) {
      const dl = L.daysLeft(i, new Date());
      return "<div><strong>" + esc(i.name) + "</strong> · " + (dl < 0 ? t("side.pastBest") : dl === 0 ? t("side.useToday") : t(dl === 1 ? "common.dayLeft" : "common.daysLeft", { n: dl })) + "</div>";
    }).join("") : t("nav.nothingExpiring");
    const key = todayKey(); ensureDay(key);
    const plan = state.plan[key];
    $("todayCard").innerHTML = ["breakfast", "lunch", "dinner"].map(function (meal) {
      const r = recipeById(plan[meal]);
      return "<div>" + mealIcon(meal) + "<strong>" + mealLabel(meal) + ":</strong> " + (r ? esc(rName(r)) : t("side.nothingPlanned")) + "</div>";
    }).join("") + (plan.dinner ? "" : "<div class='row'><span class='hint'>" + t("side.noDinner") + "</span><button class='miniBtn' id='planDinnerBtn'>" + t("side.planDinner") + "</button></div>");
    /* No dinner tonight (29 Oct, item 14): one kind line, one tap,
       and the planner fills tonight only, busy night rules included.
       The tap is the person planning on purpose, so it also stands
       under the Empty Start law. */
    const pdb = $("planDinnerBtn");
    if (pdb) pdb.addEventListener("click", function () {
      const key = todayKey();
      const r = L.pickRecipe("dinner", Object.assign({}, L.planCtxForDay(planCtx(), key)), D);
      if (!r) return;
      if (!state.plan[key]) state.plan[key] = {};
      state.plan[key].dinner = r.id;
      state.planCleared = false;
      save(); renderSide(); renderCalendar();
      toast(t("toast.dinnerPlanned", { name: rName(r) }));
    });
  }

  /* Calendar */
  $("viewSwitch").querySelectorAll(".seg").forEach(function (b) {
    b.addEventListener("click", function () {
      viewMode = b.getAttribute("data-viewmode");
      $("viewSwitch").querySelectorAll(".seg").forEach(function (x) { x.classList.toggle("active", x === b); });
      renderCalendar();
    });
  });
  $("prevBtn").addEventListener("click", function () { moveCursor(-1); });
  $("nextBtn").addEventListener("click", function () { moveCursor(1); });
  $("todayBtn").addEventListener("click", function () { cursor = new Date(); cursor.setHours(12, 0, 0, 0); renderCalendar(); });
  function moveCursor(dir) {
    if (viewMode === "month") cursor.setMonth(cursor.getMonth() + dir);
    else if (viewMode === "year") cursor.setFullYear(cursor.getFullYear() + dir);
    else if (viewMode === "week") cursor.setDate(cursor.getDate() + dir * 7);
    else cursor.setDate(cursor.getDate() + dir);
    renderCalendar();
  }
  function mondayOf(d) { const x = new Date(d); const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); x.setHours(12, 0, 0, 0); return x; }
  function mealChip(key, meal) {
    const r = recipeById(state.plan[key][meal]); if (!r) return "";
    const m = D.MEALS[meal];
    return "<button class='mealChip' style='background:" + m.soft + "' data-open-recipe='" + r.id + "' data-stop='1'>" + esc(rName(r)) + "</button>";
  }
  /* Imported events (app v22) sit under the day's meals. The module's
     dates are YYYY-MM-DD; our plan keys are YYYY.MM.DD; the conversion
     happens here, at render, and nowhere else. */
  function eventsOn(dotKey) {
    const iso = dotKey.replace(/\./g, "-");
    return state.events.filter(function (e) { return e.date === iso; }).sort(function (a, b) { return String(a.time || "").localeCompare(String(b.time || "")) || a.title.localeCompare(b.title); });
  }
  function impLine(e) {
    return "<div class='impLine'>" + (e.time ? esc(L.formatTime(e.time)) + " " : "") + esc(e.title) + "</div>";
  }
  function dayCell(d, dim) {
    const key = L.dateKey(d); ensureDay(key);
    const isToday = key === todayKey();
    const evs = eventsOn(key);
    return "<div class='dayCell" + (dim ? " dim" : "") + (isToday ? " today" : "") + "' data-open-day='" + key + "' role='button' tabindex='0'><div class='dayNum'>" + d.getDate() + "</div>" +
      ["breakfast", "lunch", "dinner"].map(function (meal) { return mealChip(key, meal); }).join("") +
      evs.slice(0, 2).map(impLine).join("") + (evs.length > 2 ? "<div class='impLine'>" + t("cal.more", { n: evs.length - 2 }) + "</div>" : "") + "</div>";
  }
  function renderCalendar() {
    $("mealLegend").innerHTML = ["breakfast", "lunch", "dinner"].map(function (meal) {
      return "<span class='legendChip' style='background:" + D.MEALS[meal].soft + "'>" + mealIconInk(meal) + mealLabel(meal) + "</span>";
    }).join("");
    /* Calendar empty state (design section 3A): the days still render; this
       card sits above them while nothing is planned yet. */
    const calEmpty = $("calEmpty");
    if (!planHasMeals()) {
      calEmpty.innerHTML = "<div class='card'>" + emptyState("calendar", t("cal.noMeals"), t("cal.planFirstWeek"), "planWeek") + "</div>";
      calEmpty.querySelector("[data-empty-action='planWeek']").addEventListener("click", function () { planMyFirstWeek(); renderCalendar(); renderSide(); toast(t("cal.firstWeekPlanned")); });
    } else { calEmpty.innerHTML = ""; }
    const root = $("calendarRoot");
    if (viewMode === "month") {
      $("calTitle").textContent = monthName(cursor) + " " + cursor.getFullYear();
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
      const start = mondayOf(first);
      let html = "<div class='monthGrid'>" + [0, 1, 2, 3, 4, 5, 6].map(function (i) { const hd = new Date(start); hd.setDate(start.getDate() + i); return "<div class='weekHead'>" + weekdayName(hd) + "</div>"; }).join("");
      for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); html += dayCell(d, d.getMonth() !== cursor.getMonth()); }
      root.innerHTML = html + "</div>";
    } else if (viewMode === "week") {
      const start = mondayOf(cursor);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      $("calTitle").textContent = t("cal.weekOf") + " " + start.getDate() + " " + monthName(start) + " " + start.getFullYear();
      let html = "<div class='weekGrid'>";
      for (let i = 0; i < 7; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i); const key = L.dateKey(d); ensureDay(key);
        html += "<div class='weekCol'><h3>" + weekdayName(d) + " " + d.getDate() + "</h3>" + ["breakfast", "lunch", "dinner"].map(function (meal) {
          const r = recipeById(state.plan[key][meal]); const m = D.MEALS[meal];
          return r ? "<button class='mealCard' style='background:" + m.soft + "' data-open-recipe='" + r.id + "'><div class='mealType' style='color:" + m.ink + "'>" + mealIcon(meal) + mealLabel(meal) + "</div><div class='mealName'>" + esc(rName(r)) + "</div><div class='mealMeta'>" + icon("clock", "iconSm") + " " + t("cal.cardMeta", { min: r.minutes, time: L.formatTime(state.eatTimes[meal]) }) + "</div></button>" : "";
        }).join("") + eventsOn(key).map(impLine).join("") + "<button class='miniBtn' data-open-day='" + key + "'>" + t("cal.openDay") + "</button></div>";
      }
      root.innerHTML = html + "</div>";
    } else if (viewMode === "day") {
      const key = L.dateKey(cursor); ensureDay(key);
      $("calTitle").textContent = dateTitle(cursor);
      root.innerHTML = "<div class='dayMeals'>" + ["breakfast", "lunch", "dinner"].map(function (meal) {
        const r = recipeById(state.plan[key][meal]); const m = D.MEALS[meal];
        if (!r) return "";
        const start = L.reminderTime(state.eatTimes[meal], r.minutes, state.setupMinutes);
        const options = eligibleRecipes().filter(function (x) { return x.meal === meal; }).map(function (x) {
          return "<option value='" + x.id + "'" + (x.id === r.id ? " selected" : "") + ">" + esc(rName(x)) + "</option>";
        }).join("");
        /* The skip tick (build 5, spec (a)): one tap on the meal's own
           row silences that meal's reminder. The meal stays planned
           and stays on the grocery list; a skipped meal just renders
           dimmed and wears the Skipped label. */
        const skipped = !!state.skips[key + "." + meal];
        return "<div class='dayMealBig" + (skipped ? " skipped" : "") + "'><span class='badge' style='background:" + m.soft + ";color:#111827'>" + mealIcon(meal) + mealLabel(meal) + "</span>" + (skipped ? "<span class='skippedTag'>" + t("cal.skipped") + "</span>" : "") +
          "<div class='mealName'>" + esc(rName(r)) + "</div>" +
          "<p class='hint'>" + t("cal.dayMeta", { min: r.minutes, eat: L.formatTime(state.eatTimes[meal]), start: L.formatTime(start) }) + (kcalText(r) ? " · " + kcalText(r) : "") + "</p>" +
          "<button class='primaryBtn' data-open-recipe='" + r.id + "'>" + t("cal.openFullRecipe") + "</button>" +
          "<select class='swapSel' data-swap='" + meal + "' data-day='" + key + "' aria-label='" + t("cal.swapMeal") + "'>" + options + "</select>" +
          "<button class='miniBtn' data-remove-meal='" + meal + "' data-day='" + key + "'>" + icon("trash-2", "iconSm") + " " + t("cal.removeMeal") + "</button>" +
          "<label class='skipTick'><input type='checkbox' data-skip='" + meal + "' data-day='" + key + "'" + (skipped ? " checked" : "") + "> " + t("cal.skip") + "</label></div>";
      }).join("") + "</div>";
      const dayEvs = eventsOn(key);
      if (dayEvs.length) {
        root.innerHTML += "<div class='card dayEvents'><h2>" + t("cal.alsoOnThisDay") + "</h2>" + dayEvs.map(function (e) {
          return "<div class='impRow'><div><div class='pName'>" + (e.time ? esc(L.formatTime(e.time)) + " · " : "") + esc(e.title) + "</div>" +
            ((e.location || e.notes) ? "<div class='pMeta'>" + [e.location, e.notes].filter(Boolean).map(esc).join(" · ") + "</div>" : "") + "</div></div>";
        }).join("") + "</div>";
      }
    } else {
      $("calTitle").textContent = String(cursor.getFullYear());
      let html = "<div class='yearGrid'>";
      for (let mo = 0; mo < 12; mo++) {
        const first = new Date(cursor.getFullYear(), mo, 1, 12);
        const start = mondayOf(first);
        const daysIn = new Date(cursor.getFullYear(), mo + 1, 0).getDate();
        html += "<div class='yearMonth'><h3><button class='miniBtn' data-goto-month='" + mo + "'>" + monthName(new Date(cursor.getFullYear(), mo, 1, 12)) + "</button></h3><div class='miniGrid'>";
        for (let i = 0; i < 42; i++) {
          const d = new Date(start); d.setDate(start.getDate() + i);
          if (d.getMonth() !== mo) { html += "<span></span>"; continue; }
          const key = L.dateKey(d); ensureDay(key);
          html += "<button class='miniDay planned" + (key === todayKey() ? " today" : "") + "' data-open-day='" + key + "'>" + d.getDate() + "</button>";
          if (i > 34 && d.getDate() >= daysIn) break;
        }
        html += "</div></div>";
      }
      root.innerHTML = html + "</div>";
    }
    bindCalendarClicks(root);
  }
  function bindCalendarClicks(root) {
    root.querySelectorAll("[data-open-recipe]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); openRecipe(b.getAttribute("data-open-recipe")); });
    });
    root.querySelectorAll("[data-open-day]").forEach(function (b) {
      b.addEventListener("click", function () { cursor = L.parseKey(b.getAttribute("data-open-day")); viewMode = "day"; syncSeg(); renderCalendar(); });
    });
    root.querySelectorAll("[data-goto-month]").forEach(function (b) {
      b.addEventListener("click", function () { cursor.setMonth(Number(b.getAttribute("data-goto-month"))); viewMode = "month"; syncSeg(); renderCalendar(); });
    });
    root.querySelectorAll("[data-swap]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        state.plan[sel.getAttribute("data-day")][sel.getAttribute("data-swap")] = sel.value; save(); notePlanned("swap"); renderCalendar(); renderSide(); toast(t("cal.mealSwapped"));
      });
    });
    /* Planned meal delete (Law B2): the slot empties at once and the Undo
       toast holds the exact recipe id, so Undo puts the same meal back. */
    root.querySelectorAll("[data-remove-meal]").forEach(function (b) {
      b.addEventListener("click", function () {
        const key = b.getAttribute("data-day"), meal = b.getAttribute("data-remove-meal");
        const prevId = state.plan[key] ? state.plan[key][meal] : null;
        if (!prevId) return;
        const prev = recipeById(prevId);
        delete state.plan[key][meal]; save(); renderCalendar(); renderSide();
        toastUndo(t("cal.removedFromPlan", { name: prev ? rName(prev) : t("cal.mealFallback") }), function () {
          if (!state.plan[key]) state.plan[key] = {};
          state.plan[key][meal] = prevId; save(); renderCalendar(); renderSide();
        });
      });
    });
    /* The skip tick: flipping it writes (or clears) the one skip
       record for that day and meal. save() carries the change to the
       native schedule; the re-render shows the dimmed state. */
    root.querySelectorAll("[data-skip]").forEach(function (box) {
      box.addEventListener("change", function () {
        const key = box.getAttribute("data-day"), meal = box.getAttribute("data-skip");
        if (box.checked) state.skips[key + "." + meal] = true; else delete state.skips[key + "." + meal];
        save(); renderCalendar();
      });
    });
  }
  function syncSeg() { $("viewSwitch").querySelectorAll(".seg").forEach(function (x) { x.classList.toggle("active", x.getAttribute("data-viewmode") === viewMode); }); }

  /* Recipe modal */
  /* Who is eating (29 Oct, item 13): the sheet opens at the saved
     servings, and the stepper or the family chips can change the
     amounts for this open only. The choice is remembered while the
     same recipe stays open and forgotten for the next one. */
  let modalRecipeId = null, modalServings = null, modalEaters = null;
  function openRecipe(id) {
    const baseRecipe = recipeById(id); if (!baseRecipe) return;
    if (!L.recipeAllowed(baseRecipe, planCtx(), D)) { toast(t("recipe.notSuitable")); return; }
    if (modalRecipeId !== id) { modalRecipeId = id; modalServings = null; modalEaters = null; }
    if (!modalEaters) modalEaters = state.family.map(function (p) { return p.id; });
    const targetServings = modalServings || state.defaultServings;
    const r = L.scaleRecipe(baseRecipe, targetServings);
    const ads = L.adaptations(r, state.family, D);
    const favorite = state.favorites.indexOf(r.id) !== -1;
    const sourceHtml = r.sourceName ? "<p class='hint recipeSource'>" + t("recipes.sourceLine") + " <a href='" + esc(r.sourceUrl) + "' target='_blank' rel='noopener noreferrer'>" + esc(r.sourceName) + "</a> · <a href='" + esc(r.sourceLicenseUrl) + "' target='_blank' rel='noopener noreferrer'>" + esc(r.sourceLicense) + "</a></p>" : "";
    const sourceLanguageHtml = r.sourceName && LANG.lang() === "es" ? "<p class='hint'>" + t("recipes.sourceEnglishNote") + "</p>" : "";
    const dietNote = r.halalFriendly && state.diet === "halalFriendly" ? "<p class='hint'>" + t("prefs.halalNote") + "</p>" : "";
    /* The allergy boxes are legal flagged wording (v34): their lines
       resolve through the legal.* keys, which ship in English under
       every language. The dislike boxes use the translated keys. */
    const adsHtml = ads.length ? "<h3>" + t("recipe.changesForFamily") + "</h3>" + ads.map(function (a) {
      const person = state.family.filter(function (p) { return p.name === a.person; })[0];
      const color = person ? person.color : "#111827";
      const line = a.swap === "leaving it out"
        ? t(a.allergy ? "legal.allergyLeaveOut" : "recipe.dislikeLeaveOut", { food: esc(a.ingredient) })
        : t(a.allergy ? "legal.allergySwap" : "recipe.dislikeSwap", { food: esc(a.ingredient), swap: esc(a.swap) });
      return "<div class='adaptBox'><span class='avatarCircle' style='background:" + color + "'>" + esc(a.person.slice(0, 1)) + "</span> <strong>" + esc(a.person) + "</strong>: " +
        (a.allergy ? "<span class='useFirst'>" + icon("triangle-alert", "iconSm") + " " + t("legal.allergyWord") + "</span> " : "") + line + " " + t(a.allergy ? "legal.allergyEveryone" : "recipe.everyoneElse") + "</div>";
    }).join("") : "<p class='hint'>" + t("recipe.noChanges") + "</p>";
    /* Cooked today (29 Oct, item 12): when this recipe is on today's
       plan, the sheet offers the cooked tick for that meal, and after
       it, one tap to keep the leftovers on the shelf. */
    const cookedKey = todayKey();
    const cookedSlots = ["breakfast", "lunch", "dinner"].filter(function (m) { return state.plan[cookedKey] && state.plan[cookedKey][m] === r.id && !state.skips[cookedKey + "." + m]; });
    const cookedHtml = cookedSlots.map(function (m) {
      const ck = cookedKey + "." + m;
      if (state.cooked[ck]) return "<div class='row'><span class='pMeta'>" + mealLabel(m) + "</span><span class='fresh'>" + t("recipe.cookedWord") + "</span>" + (state.leftovers[ck] ? "" : "<button class='pillBtn' data-leftovers='" + ck + "'>" + t("recipe.saveLeftovers") + "</button>") + "</div>";
      return "<div class='row'><span class='pMeta'>" + mealLabel(m) + "</span><button class='pillBtn' data-cooked='" + ck + "'>" + t("recipe.markCooked") + "</button></div>";
    }).join("");
    $("recipeModalCard").innerHTML =
      "<div class='row' style='justify-content:space-between'><span>" + mealBadge(r.meal) + "</span><button class='roundBtn' id='closeRecipe' aria-label='" + t("common.close") + "'>" + icon("x") + "</button></div>" +
      "<h2>" + esc(rName(r)) + "</h2>" +
      "<p class='hint'>" + t("recipe.metaLine", { min: r.minutes, n: r.servings }) + (kcalText(r) ? " · " + kcalText(r) + " " + t("recipe.perServing") : "") + " · " + r.cuisines.map(esc).join(", ") + "</p>" +
      (kcalText(r) ? "<p class='hint'>" + t("legal.calorieMethod") + "</p>" : "") + sourceHtml + sourceLanguageHtml + dietNote +
      "<div class='row'><span class='pMeta'>" + t("recipe.cookingFor") + "</span><button class='miniBtn' id='servMinus' aria-label='-'>-</button><strong>" + targetServings + "</strong><button class='miniBtn' id='servPlus' aria-label='+'>+</button></div>" +
      (state.family.length ? "<div class='chipRow'>" + state.family.map(function (p) { return "<button class='chip" + (modalEaters.indexOf(p.id) !== -1 ? " on" : "") + "' data-eater='" + p.id + "'>" + esc(p.name) + "</button>"; }).join("") + "</div>" : "") +
      "<h3>" + t("recipe.ingredients") + "</h3><ul class='ingList'>" + r.ingredients.map(function (i, ix) { return "<li>" + rIngLine(r, i, ix) + "</li>"; }).join("") + "</ul>" +
      "<h3>" + t("recipe.howTo") + "</h3><ol class='stepsList'>" + rSteps(r).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
      adsHtml +
      cookedHtml +
      "<div class='row'><button class='pillBtn' id='toggleFavorite' aria-pressed='" + (favorite ? "true" : "false") + "'>" + t(favorite ? "recipe.removeFavorite" : "recipe.saveFavorite") + "</button><button class='primaryBtn' id='startCook'>" + t("recipe.startCooking") + "</button><button class='primaryBtn' id='addMissing'>" + t("recipe.addMissing") + "</button><button class='pillBtn' id='closeRecipe2'>" + t("common.close") + "</button>" +
      (state.customRecipes.some(function (x) { return x.id === r.id; }) ? "<button class='pillBtn danger' id='deleteRecipe'>" + icon("trash-2", "iconSm") + " " + t("recipe.deleteMine") + "</button>" : "") + "</div>";
    $("recipeModal").classList.remove("hidden");
    const close = function () { $("recipeModal").classList.add("hidden"); };
    $("closeRecipe").addEventListener("click", close);
    $("closeRecipe2").addEventListener("click", close);
    $("toggleFavorite").addEventListener("click", function () {
      const index = state.favorites.indexOf(r.id);
      if (index === -1) state.favorites.push(r.id); else state.favorites.splice(index, 1);
      const isSaved = state.favorites.indexOf(r.id) !== -1;
      this.setAttribute("aria-pressed", isSaved ? "true" : "false");
      this.textContent = t(isSaved ? "recipe.removeFavorite" : "recipe.saveFavorite");
      save(); renderFavorites();
      toast(t(isSaved ? "recipe.favoriteSaved" : "recipe.favoriteRemoved"));
    });
    /* Servings stepper and who is eating (29 Oct, item 13): both
       re-open the sheet at the new scale. A chip tap sets the count
       to the people eating; the last lit chip cannot go out,
       because somebody is eating. */
    $("servMinus").addEventListener("click", function () { modalServings = Math.max(1, targetServings - 1); openRecipe(r.id); });
    $("servPlus").addEventListener("click", function () { modalServings = Math.min(12, targetServings + 1); openRecipe(r.id); });
    $("recipeModalCard").querySelectorAll("[data-eater]").forEach(function (b) {
      b.addEventListener("click", function () {
        const pid = b.getAttribute("data-eater");
        const ix = modalEaters.indexOf(pid);
        if (ix === -1) modalEaters.push(pid);
        else if (modalEaters.length > 1) modalEaters.splice(ix, 1);
        modalServings = Math.max(1, modalEaters.length);
        openRecipe(r.id);
      });
    });
    $("startCook").addEventListener("click", function () { renderCook(r, cookPlace[r.id] || 0); });
    $("addMissing").addEventListener("click", function () {
      let n = 0;
      r.ingredients.forEach(function (i) {
        const have = state.pantry.some(function (p) { return p.name.toLowerCase() === i.name.toLowerCase(); });
        const already = state.extras.some(function (x) { return x.name.toLowerCase() === i.name.toLowerCase(); });
        if (!have && !already) { state.extras.push({ id: "e" + Date.now() + n, name: i.name, qty: i.qty, unit: i.unit, category: i.category || "Other" }); n++; }
      });
      save(); toast(n ? t("toast.addedItems", { n: n }) : t("toast.haveEverything"));
    });
    /* Mark cooked (29 Oct, item 12): the shelf loses what the meal
       used, at the servings the plan cooks for, and the sheet
       reopens so the tick and the leftovers button show at once. */
    $("recipeModalCard").querySelectorAll("[data-cooked]").forEach(function (b) {
      b.addEventListener("click", function () {
        const ck = b.getAttribute("data-cooked");
        const scaled = recipesForServingCount().filter(function (x) { return x.id === r.id; })[0] || L.scaleRecipe(r, state.defaultServings);
        const res = L.applyCooked(state.pantry, scaled);
        state.pantry = res.pantry;
        state.cooked[ck] = true;
        save(); renderSide(); if (currentView === "groceries") renderGroceries();
        openRecipe(r.id);
        toast(res.taken.length ? t("toast.cookedShelf", { names: res.taken.join(", ") }) : t("toast.cookedPlain"));
      });
    });
    $("recipeModalCard").querySelectorAll("[data-leftovers]").forEach(function (b) {
      b.addEventListener("click", function () {
        const ck = b.getAttribute("data-leftovers");
        const item = { id: "g" + Date.now(), name: r.name, qty: L.cleanServings(state.defaultServings), unit: "pcs", storage: "fridge", added: todayKey(), shelfDays: 3 };
        state.pantry.push(item);
        state.leftovers[ck] = item.id;
        save(); renderSide(); if (currentView === "groceries") renderGroceries();
        openRecipe(r.id);
        toast(t("toast.leftoversSaved", { name: rName(r) }));
      });
    });
    /* A recipe the user added is theirs to delete (Law B2 undo toast). The
       exact record is held, so Undo puts the same recipe back. */
    const delBtn = $("deleteRecipe");
    if (delBtn) delBtn.addEventListener("click", function () {
      const idx = state.customRecipes.findIndex(function (x) { return x.id === r.id; });
      if (idx === -1) { close(); return; }
      const wasFavorite = state.favorites.indexOf(r.id) !== -1;
      const cut = L.removeAt(state.customRecipes, idx);
      state.customRecipes = cut.list;
      state.favorites = state.favorites.filter(function (favoriteId) { return favoriteId !== r.id; });
      close(); save(); renderRecipes();
      toastUndo(t("recipe.deletedToast", { name: rName(r) }), function () {
        state.customRecipes = L.restoreAt(state.customRecipes, cut.item, cut.index);
        if (wasFavorite && state.favorites.indexOf(r.id) === -1) state.favorites.push(r.id);
        save(); renderRecipes();
      });
    });
  }
  /* Cook mode (29 Oct, item 7): one big step at a time, the screen
     kept awake where the platform allows it, and any time written
     inside a step ("roast 45 minutes") becomes a tap to start timer.
     Several timers can run at once. Your place is remembered per
     recipe while the app stays open, and today's other meals sit
     one tap away, like pinned recipes. */
  const cookPlace = {};
  const cookTimers = {};
  let cookTick = null, cookWake = null, cookSeq = 0;
  async function cookLockScreen() { try { if (navigator.wakeLock) cookWake = await navigator.wakeLock.request("screen"); } catch (e) { /* the screen may sleep; cooking goes on */ } }
  function cookUnlockScreen() { try { if (cookWake) { cookWake.release(); cookWake = null; } } catch (e) { /* already released */ } }
  function stepSegments(text) {
    const re = /(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|horas?|minutes?|mins?|minutos?|seconds?|secs?|segundos?)/gi;
    const out = []; let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ text: text.slice(last, m.index) });
      const n = parseFloat(m[1].replace(",", "."));
      const unit = m[2].toLowerCase();
      const secs = Math.round(n * (/^h/.test(unit) ? 3600 : /^se/.test(unit) ? 1 : 60));
      out.push({ timer: secs, label: m[0] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
  }
  function cookClock(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function cookTickFn() {
    let any = false;
    Object.keys(cookTimers).forEach(function (tid) {
      const tm = cookTimers[tid]; const el = document.getElementById(tid);
      if (!el) { delete cookTimers[tid]; return; }
      any = true;
      const left = tm.endsAt - Date.now();
      if (left <= 0) { el.textContent = tm.label + " · " + t("cook.timeUp"); el.classList.add("timerDone"); el.classList.remove("timerRun"); delete cookTimers[tid]; toast(t("cook.timerDone", { label: tm.label })); }
      else el.textContent = tm.label + " · " + cookClock(left);
    });
    if (!any && cookTick) { clearInterval(cookTick); cookTick = null; }
  }
  function renderCook(r, ix) {
    const steps = rSteps(r);
    const stepIx = Math.max(0, Math.min(ix, steps.length - 1));
    cookPlace[r.id] = stepIx;
    cookLockScreen();
    const todayPlan = state.plan[todayKey()] || {};
    const others = ["breakfast", "lunch", "dinner"].map(function (m) { return todayPlan[m]; }).filter(function (oid, pos, arr) { return oid && oid !== r.id && arr.indexOf(oid) === pos; }).map(function (oid) { return recipeById(oid); }).filter(Boolean);
    const segs = stepSegments(steps[stepIx] || "");
    $("recipeModalCard").innerHTML =
      "<div class='row' style='justify-content:space-between'><button class='pillBtn' id='cookBack'>" + t("cook.back") + "</button><strong>" + t("cook.title") + "</strong><button class='roundBtn' id='cookClose' aria-label='" + t("common.close") + "'>" + icon("x") + "</button></div>" +
      "<h2>" + esc(rName(r)) + "</h2>" +
      (others.length ? "<p class='pMeta'>" + t("cook.alsoToday") + "</p><div class='chipRow'>" + others.map(function (o) { return "<button class='chip' data-cook-switch='" + o.id + "'>" + esc(rName(o)) + "</button>"; }).join("") + "</div>" : "") +
      "<p class='pMeta'>" + t("cook.stepOf", { a: stepIx + 1, b: steps.length }) + "</p>" +
      "<div class='cookStep'>" + segs.map(function (s) { return s.timer ? "<button class='timerChip' id='tm" + (++cookSeq) + "' data-timer-secs='" + s.timer + "' data-timer-label='" + esc(s.label) + "'>" + icon("clock", "iconSm") + " " + esc(s.label) + "</button>" : esc(s.text); }).join("") + "</div>" +
      "<details class='cookIng'><summary>" + t("recipe.ingredients") + "</summary><ul class='ingList'>" + r.ingredients.map(function (i, ix2) { return "<li>" + rIngLine(r, i, ix2) + "</li>"; }).join("") + "</ul></details>" +
      "<div class='row'><button class='pillBtn' id='cookPrev'" + (stepIx === 0 ? " disabled" : "") + ">" + t("cook.prev") + "</button><button class='primaryBtn' id='cookNext'>" + (stepIx >= steps.length - 1 ? t("cook.finish") : t("cook.next")) + "</button></div>";
    $("recipeModal").classList.remove("hidden");
    $("cookBack").addEventListener("click", function () { cookUnlockScreen(); openRecipe(r.id); });
    $("cookClose").addEventListener("click", function () { cookUnlockScreen(); $("recipeModal").classList.add("hidden"); });
    const prev = $("cookPrev"); if (prev) prev.addEventListener("click", function () { renderCook(r, stepIx - 1); });
    $("cookNext").addEventListener("click", function () { if (stepIx >= steps.length - 1) { cookUnlockScreen(); openRecipe(r.id); } else renderCook(r, stepIx + 1); });
    $("recipeModalCard").querySelectorAll("[data-cook-switch]").forEach(function (b) { b.addEventListener("click", function () { const o = recipeById(b.getAttribute("data-cook-switch")); if (o) renderCook(L.scaleRecipe(o, modalServings || state.defaultServings), cookPlace[o.id] || 0); }); });
    $("recipeModalCard").querySelectorAll("[data-timer-secs]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (cookTimers[b.id]) return;
        cookTimers[b.id] = { endsAt: Date.now() + Number(b.getAttribute("data-timer-secs")) * 1000, label: b.getAttribute("data-timer-label") };
        b.classList.add("timerRun");
        if (!cookTick) cookTick = setInterval(cookTickFn, 500);
        cookTickFn();
      });
    });
  }
  $("recipeModal").addEventListener("click", function (e) { if (e.target === $("recipeModal")) $("recipeModal").classList.add("hidden"); });

  /* Favourites are recipe ids on the signed-in profile, so the list
     follows its owner across sign-in and devices without duplicating recipes. */
  function renderFavorites() {
    const root = $("favoriteRecipeList");
    const saved = state.favorites.map(function (id) { return recipeById(id); }).filter(Boolean);
    const shown = saved.filter(function (r) { return L.recipeAllowed(r, planCtx(), D); });
    if (!shown.length) {
      root.innerHTML = emptyState("chef-hat", saved.length ? t("recipes.favoriteFiltered") : t("recipes.favoritesEmpty"));
      return;
    }
    root.innerHTML = shown.map(function (r) {
      return "<button class='recipeCard' data-favorite-recipe='" + r.id + "'>" + mealBadge(r.meal) + "<div class='mealName'>" + esc(rName(r)) + "</div><div class='pMeta'>" + icon("clock", "iconSm") + " " + t("recipes.cardMeta", { min: r.minutes, n: r.ingredients.length }) + "</div></button>";
    }).join("");
    root.querySelectorAll("[data-favorite-recipe]").forEach(function (b) { b.addEventListener("click", function () { openRecipe(b.getAttribute("data-favorite-recipe")); }); });
  }
  /* Recipes view */
  let recipeListLimit = 30;
  function recipeIngredientsNow() {
    return L.cleanRecipeIngredients(state.recipeIngredientsManual ? state.recipeIngredients : state.pantry.map(function (item) { return item.name; }));
  }
  function renderRecipeIngredientChips() {
    const root = $("recipeIngredientChips"); if (!root) return;
    const names = recipeIngredientsNow();
    root.innerHTML = names.length ? names.map(function (name) {
      return "<button type='button' class='chip recipeIngredientChip' data-remove-recipe-ingredient='" + esc(name) + "' aria-label='" + esc(t("recipes.removeIngredient", { name: name })) + "'>" + esc(listIngName(name)) + " <span aria-hidden='true'>×</span></button>";
    }).join("") : "<p class='hint'>" + t("recipes.noIngredients") + "</p>";
    root.querySelectorAll("[data-remove-recipe-ingredient]").forEach(function (button) {
      button.addEventListener("click", function () {
        const name = button.getAttribute("data-remove-recipe-ingredient").toLowerCase();
        state.recipeIngredients = recipeIngredientsNow().filter(function (item) { return item.toLowerCase() !== name; });
        state.recipeIngredientsManual = true; save(); renderRecipes();
      });
    });
  }
  function recipeMatchLine(result) {
    const match = result.match;
    if (!match.availableCount) return "<div class='recipeMatchMeta'>" + t("recipes.addForMatches") + "</div>";
    const use = t("recipes.usesCount", { used: match.usedCount, total: match.needCount });
    const missing = match.missing.length ? t(match.missing.length === 1 ? "recipes.missingOne" : "recipes.missingMany", { n: match.missing.length }) : t("recipes.haveEverything");
    const needs = match.missing.length ? "<span class='recipeMissingNames'>" + t("recipes.stillNeed", { items: match.missing.slice(0, 3).map(esc).join(", ") + (match.missing.length > 3 ? "…" : "") }) + "</span>" : "";
    return "<div class='recipeMatchMeta'><strong>" + use + "</strong><span>" + missing + "</span>" + needs + "</div>";
  }
  function renderRecipes() {
    const own = $("ownRecipeList");
    const eligibleOwn = state.customRecipes.filter(function (r) { return L.recipeAllowed(r, planCtx(), D); });
    if (!eligibleOwn.length) {
      own.innerHTML = state.customRecipes.length ? emptyState("chef-hat", t("recipes.preferenceEmpty")) : emptyState("chef-hat", t("recipes.ownEmpty"), t("recipes.addTitle"), "addRecipe");
      const addOwn = own.querySelector("[data-empty-action='addRecipe']");
      if (addOwn) addOwn.addEventListener("click", function () { $("ownName").scrollIntoView({ block: "center" }); $("ownName").focus(); });
    } else {
      own.innerHTML = "<div class='recipeGrid'>" + eligibleOwn.map(function (r) {
        return "<button class='recipeCard' data-own-recipe='" + esc(r.id) + "'>" + mealBadge(r.meal) + "<div class='mealName'>" + esc(r.name) + "</div><div class='pMeta'>" + icon("clock", "iconSm") + " " + t("recipes.cardMeta", { min: r.minutes, n: r.ingredients.length }) + "</div></button>";
      }).join("") + "</div>";
      own.querySelectorAll("[data-own-recipe]").forEach(function (b) { b.addEventListener("click", function () { openRecipe(b.getAttribute("data-own-recipe")); }); });
    }
    renderFavorites();
    renderRecipeIngredientChips();
    const q = ($("recipeSearch").value || "").trim().toLowerCase();
    const available = recipeIngredientsNow();
    const base = eligibleRecipes().filter(function (r) {
      const searchable = [r.name, rName(r), (r.cuisines || []).join(" "), r.originCountry || "", (r.ingredients || []).map(function (i) { return i.name; }).join(" ")].join(" ").toLowerCase();
      return !q || searchable.indexOf(q) !== -1;
    });
    const ranked = L.rankRecipes(base, Object.assign({}, planCtx(), { matchIngredients: available }), D);
    const visible = ranked.slice(0, recipeListLimit);
    $("recipeList").innerHTML = visible.map(function (result) {
      const r = result.recipe;
      return "<button class='recipeCard' data-recipe='" + esc(r.id) + "'>" + mealBadge(r.meal) + "<div class='mealName'>" + esc(rName(r)) + "</div><div class='pMeta'>" + icon("clock", "iconSm") + " " + t("recipes.cardMeta", { min: r.minutes, n: r.ingredients.length }) + (kcalText(r) ? " · " + kcalText(r) + " " + t("recipe.perServing") : "") + " · " + (r.cuisines || []).map(esc).join(", ") + "</div>" + recipeMatchLine(result) + "</button>";
    }).join("") || emptyState("chef-hat", q ? t("recipes.noMatch") : t("recipes.preferenceEmpty"));
    const remaining = ranked.length - visible.length;
    if (remaining > 0) $("recipeList").insertAdjacentHTML("beforeend", "<div class='recipeMore'><button type='button' class='pillBtn' id='showMoreRecipes'>" + t("recipes.showMore", { n: Math.min(30, remaining) }) + "</button></div>");
    $("recipeList").querySelectorAll("[data-recipe]").forEach(function (b) { b.addEventListener("click", function () { openRecipe(b.getAttribute("data-recipe")); }); });
    const more = $("showMoreRecipes");
    if (more) more.addEventListener("click", function () { recipeListLimit = Math.min(ranked.length, recipeListLimit + 30); renderRecipes(); });
  }
  function recipeIngredientChoices() {
    const list = photoFoodChoices();
    $("recipeIngredientOptions").innerHTML = list.map(function (name) { return "<option value='" + esc(name) + "'>"; }).join("");
  }
  function addRecipeIngredient() {
    const field = $("recipeIngredientInput");
    const name = String(field.value || "").trim().slice(0, 80);
    if (!name) { field.focus(); return; }
    const values = recipeIngredientsNow();
    if (!values.some(function (item) { return item.toLowerCase() === name.toLowerCase(); })) values.push(name);
    state.recipeIngredients = values; state.recipeIngredientsManual = true; field.value = "";
    save(); renderRecipes(); field.focus();
  }
  $("recipeIngredientAdd").addEventListener("click", addRecipeIngredient);
  $("recipeIngredientInput").addEventListener("keydown", function (event) { if (event.key === "Enter") { event.preventDefault(); addRecipeIngredient(); } });
  $("recipeUseGroceries").addEventListener("click", function () {
    state.recipeIngredients = []; state.recipeIngredientsManual = false; save(); renderRecipes();
  });
  recipeIngredientChoices();
  $("recipeSearch").addEventListener("input", function () { recipeListLimit = 30; renderRecipes(); });
  /* Add your recipe: two ways. My own recipe shows the full form. Just the name fetches a recipe for approval first. */
  function setAddMode(mode) {
    document.querySelectorAll("#addModeSwitch .seg").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-addmode") === mode); });
    $("ownWrap").classList.toggle("hidden", mode !== "own");
    $("nameWrap").classList.toggle("hidden", mode !== "name");
  }
  document.querySelectorAll("#addModeSwitch .seg").forEach(function (b) {
    b.addEventListener("click", function () { setAddMode(b.getAttribute("data-addmode")); });
  });
  $("nameMealBtn").addEventListener("click", function () {
    let name = $("nameMealInput").value.trim(); if (!name) { toast(t("toast.typeMealName")); return; }
    name = name.charAt(0).toUpperCase() + name.slice(1);
    const r = L.makeRecipeFromName(name, D, state.customRecipes);
    if (!r) {
      $("nameMealResult").innerHTML = "<p class='hint'>" + t("recipes.noSuggestedMatch") + "</p><div class='row'><button class='primaryBtn' id='nameMealUseOwn'>" + t("recipes.addOwnInstead") + "</button></div>";
      $("nameMealUseOwn").addEventListener("click", function () { setAddMode("own"); $("ownName").value = name; $("ownName").focus(); });
      return;
    }
    if (!L.recipeAllowed(r, planCtx(), D)) { $("nameMealResult").innerHTML = "<p class='hint'>" + t("recipe.notSuitable") + "</p>"; return; }
    const isNew = !recipeById(r.id);
    const preview = "<div class='adaptBox'><div class='row' style='justify-content:space-between'><span>" + mealBadge(r.meal) + "</span><span class='pMeta'>" + t("recipe.metaLine", { min: r.minutes, n: r.servings }) + "</span></div>" +
      "<h3 style='margin-top:6px'>" + esc(rName(r)) + "</h3>" +
      "<p class='hint'>" + r.cuisines.map(esc).join(", ") + "</p>" +
      "<h3>" + t("recipe.ingredients") + "</h3><ul class='ingList'>" + r.ingredients.map(function (i, ix) { return "<li>" + rIngLine(r, i, ix) + "</li>"; }).join("") + "</ul>" +
      "<h3>" + t("recipe.howTo") + "</h3><ol class='stepsList'>" + rSteps(r).map(function (s2) { return "<li>" + esc(s2) + "</li>"; }).join("") + "</ol></div>";
    if (!isNew) {
      $("nameMealResult").innerHTML = "<p class='hint'>" + t("recipes.matchLine") + "</p>" + preview +
        "<div class='row'><button class='primaryBtn' id='nmOpen'>" + t("recipes.openIt") + "</button></div>";
      $("nmOpen").addEventListener("click", function () { openRecipe(r.id); });
      return;
    }
    window._pendingMeal = r;
    $("nameMealResult").innerHTML = "<p class='hint'>" + t("recipes.approveLine") + "</p>" + preview +
      "<div class='row'><button class='primaryBtn' id='nmApprove'>" + t("recipes.approveSave") + "</button><button class='pillBtn' id='nmRedo'>" + t("recipes.startAgain") + "</button></div>";
    $("nmApprove").addEventListener("click", function () {
      if (recipeById(r.id)) { toast(t("toast.alreadyInList")); return; }
      state.customRecipes.push(r); save(); window._pendingMeal = null;
      $("nameMealResult").innerHTML = "<p class='hint'>" + t("recipes.savedLine") + "</p><div class='row'><button class='primaryBtn' id='nmOpenSaved'>" + t("recipes.openNamed", { name: esc(rName(r)) }) + "</button></div>";
      $("nmOpenSaved").addEventListener("click", function () { openRecipe(r.id); });
      $("nameMealInput").value = "";
      toast(t("toast.recipeSaved"));
      renderRecipes();
    });
    $("nmRedo").addEventListener("click", function () { $("nameMealResult").innerHTML = ""; $("nameMealInput").value = ""; $("nameMealInput").focus(); });
  });
  const origOpen = openRecipe;
  openRecipe = function (id) {
    if (window._pendingMeal && window._pendingMeal.id === id) {
      const r = window._pendingMeal;
      $("recipeModalCard").innerHTML = "<div class='row' style='justify-content:space-between'><span>" + mealBadge(r.meal) + "</span><button class='roundBtn' id='closeRecipe' aria-label='" + t("common.close") + "'>" + icon("x") + "</button></div><h2>" + esc(rName(r)) + "</h2><p class='hint'>" + t("recipe.metaLine", { min: r.minutes, n: r.servings }) + "</p><h3>" + t("recipe.ingredients") + "</h3><ul class='ingList'>" + r.ingredients.map(function (i, ix) { return "<li>" + rIngLine(r, i, ix) + "</li>"; }).join("") + "</ul><h3>" + t("recipe.howTo") + "</h3><ol class='stepsList'>" + rSteps(r).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol><div class='row'><button class='pillBtn' id='closeRecipe2'>" + t("common.close") + "</button></div>";
      $("recipeModal").classList.remove("hidden");
      const close = function () { $("recipeModal").classList.add("hidden"); };
      $("closeRecipe").addEventListener("click", close); $("closeRecipe2").addEventListener("click", close);
      return;
    }
    origOpen(id);
  };
  /* Save a recipe from anywhere (29 Oct, item 4): three doors, and
     every door lands on this same form, which is the check screen.
     The link door reads the page directly inside the app shell,
     where the platform fetch can reach it; on the open web, where a
     site may refuse to be read, the door says so plainly and opens
     the paste door instead of failing quietly. */
  function fillOwnForm(rec) {
    $("ownName").value = rec.name || "";
    if (rec.minutes) $("ownMinutes").value = rec.minutes;
    if (rec.servings) $("ownServings").value = rec.servings;
    $("ownCuisine").value = rec.cuisine || "";
    $("ownIngredients").value = (rec.ingredientLines || []).join("\n");
    $("ownSteps").value = (rec.stepLines || []).join("\n");
    $("ownMsg").textContent = t("import.checkThenSave");
    $("ownWrap").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function fetchRecipePage(url) {
    const cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
    if (cap) { const res = await cap.get({ url: url }); return typeof res.data === "string" ? res.data : ""; }
    const res = await fetch(url);
    if (!res.ok) throw new Error("unreadable");
    return await res.text();
  }
  $("importLinkBtn").addEventListener("click", function () { $("importLinkRow").classList.toggle("hidden"); $("importPasteRow").classList.add("hidden"); });
  $("importPasteBtn").addEventListener("click", function () { $("importPasteRow").classList.toggle("hidden"); $("importLinkRow").classList.add("hidden"); });
  $("importFileBtn").addEventListener("click", function () { $("importRecipeFile").click(); });
  $("importUrlGo").addEventListener("click", async function () {
    const url = $("importUrlInput").value.trim();
    if (!/^https?:\/\//i.test(url)) { $("ownMsg").textContent = t("import.linkFailed"); return; }
    $("ownMsg").textContent = t("import.reading");
    try {
      const mod = await import("./recipe-import.js");
      const html = await fetchRecipePage(url);
      const rec = mod.recipeFromJsonLd(html);
      if (rec) { fillOwnForm(rec); $("importLinkRow").classList.add("hidden"); }
      else { $("ownMsg").textContent = t("import.linkFailed"); $("importLinkRow").classList.add("hidden"); $("importPasteRow").classList.remove("hidden"); }
    } catch (e) {
      $("ownMsg").textContent = t("import.linkFailed");
      $("importLinkRow").classList.add("hidden");
      $("importPasteRow").classList.remove("hidden");
    }
  });
  $("importPasteGo").addEventListener("click", async function () {
    const mod = await import("./recipe-import.js");
    const rec = mod.recipeFromText($("importPasteText").value);
    if (rec) { fillOwnForm(rec); $("importPasteRow").classList.add("hidden"); }
    else $("ownMsg").textContent = t("import.pasteFailed");
  });
  $("importRecipeFile").addEventListener("change", async function () {
    const file = $("importRecipeFile").files && $("importRecipeFile").files[0];
    $("importRecipeFile").value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed && Array.isArray(parsed.customRecipes)) {
        /* The check screen law (b32 cure, QA F-MP32-3): a file never
           adds recipes behind the form's back, and never doubles one
           already in the book. The file's new recipes queue behind
           the form one at a time: this pick fills the form with the
           first new one; saving it makes the next pick offer the
           next, because the saved ones are now filtered out. */
        const owned = {}; state.customRecipes.forEach(function (r) { owned[String(r.name || "").trim().toLowerCase()] = true; });
        const fresh = parsed.customRecipes.filter(function (rec) { return rec && typeof rec.name === "string" && rec.name.trim() && Array.isArray(rec.ingredients) && Array.isArray(rec.steps) && !owned[rec.name.trim().toLowerCase()]; });
        if (!fresh.length) { toast(t("import.fileAllOld")); return; }
        const rec0 = fresh[0];
        fillOwnForm({ name: rec0.name, minutes: rec0.minutes || 30, servings: rec0.servings || 2, cuisine: Array.isArray(rec0.cuisines) ? rec0.cuisines[0] : "", ingredientLines: rec0.ingredients.map(function (i) { return typeof i === "string" ? i : [i.qty, i.unit, i.name].filter(function (x) { return x !== null && x !== undefined && x !== ""; }).join(" "); }), stepLines: rec0.steps.map(String) });
        if (fresh.length > 1) toast(t("import.fileOne", { n: fresh.length }));
        return;
      }
      if (parsed && Array.isArray(parsed.ingredients) && Array.isArray(parsed.steps)) {
        fillOwnForm({ name: parsed.name || "", minutes: parsed.minutes || 30, servings: parsed.servings || 2, cuisine: Array.isArray(parsed.cuisines) ? parsed.cuisines[0] : "", ingredientLines: parsed.ingredients.map(function (i) { return typeof i === "string" ? i : [i.qty, i.unit, i.name].filter(function (x) { return x !== null && x !== undefined && x !== ""; }).join(" "); }), stepLines: parsed.steps.map(String) });
        return;
      }
      $("ownMsg").textContent = t("import.fileFailed");
    } catch (e) { $("ownMsg").textContent = t("import.fileFailed"); }
  });
  $("ownSave").addEventListener("click", function () {
    const name = $("ownName").value.trim();
    if (!name) { $("ownMsg").textContent = t("recipes.needName"); return; }
    const ings = $("ownIngredients").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean).map(function (line) {
      const m = line.match(/^([\d]+(?:[.,]\d+)?)\s*([a-zA-Z]+)?\s+(.*)$/);
      if (m) return { name: m[3].trim(), qty: Number(m[1].replace(",", ".")), unit: m[2] || "pcs", category: "Other" };
      return { name: line, qty: 1, unit: "pcs", category: "Other" };
    });
    const steps = $("ownSteps").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!ings.length || !steps.length) { $("ownMsg").textContent = t("recipes.needIngStep"); return; }
    const cuisine = $("ownCuisine").value.trim() || "Comfort";
    /* Issue 9b (Test filing): minutes of 0 used to be stored as a
       silent 30. The form names the problem instead of replacing
       the person's number behind their back. */
    const mins = Number($("ownMinutes").value);
    if (!(mins >= 1)) { $("ownMsg").textContent = t("recipes.needMinutes"); return; }
    state.customRecipes.push({ id: "own." + Date.now(), name: name, meal: $("ownMeal").value, cuisines: [cuisine], minutes: mins, servings: L.cleanServings($("ownServings").value), ingredients: ings, steps: steps, custom: true });
    save(); $("ownMsg").textContent = t("recipes.ownSaved");
    $("ownName").value = ""; $("ownIngredients").value = ""; $("ownSteps").value = "";
    renderRecipes();
  });

  /* Groceries view */
  function shelfHint() {
    const name = $("gName").value.trim(); if (!name) { $("gShelfHint").textContent = t("groc.shelfHintDefault"); return; }
    const storage = $("gStorage").value;
    const s = L.shelfLookup(name, D);
    const days = L.shelfDays(name, storage, D);
    /* The safety tail is legal flagged wording: English in every
       language, through the legal.* key. */
    $("gShelfHint").textContent = t("groc.shelfLine", { label: shelfLabel(s), days: days, dayWord: t(days === 1 ? "common.day" : "common.days"), place: storagePlace(storage) }) + " " + t("legal.shelfGuide");
  }
  $("gName").addEventListener("input", shelfHint);
  $("gStorage").addEventListener("change", shelfHint);
  $("gAdd").addEventListener("click", function () {
    const name = $("gName").value.trim().toLowerCase(); if (!name) { toast(t("toast.typeFoodName")); return; }
    /* Issue 9a (Test filing): a typed zero amount used to land in the
       pantry as a "0 g" food with a success toast. An amount typed in
       must be more than zero. An empty field still means one piece. */
    if ($("gQty").value !== "" && !(Number($("gQty").value) > 0)) { toast(t("groc.needAmount")); return; }
    const addedVal = $("gAdded").value;
    const added = addedVal ? addedVal.replace(/-/g, ".") : todayKey();
    state.pantry.push({ id: "g" + Date.now(), name: name, qty: $("gQty").value === "" ? 1 : Math.max(0, Number($("gQty").value) || 0), unit: $("gUnit").value, storage: $("gStorage").value, added: added, shelfDays: L.shelfKnown(name, D) ? L.shelfDays(name, $("gStorage").value, D) : undefined });
    save(); $("gName").value = ""; renderGroceries(); renderSide(); toast(t("toast.groceryAdded"));
  });
  function renderGroceries() {
    const sorted = L.sortByExpiry(state.pantry, new Date());
    $("pantryList").innerHTML = sorted.map(function (i) {
      const dl = L.daysLeft(i, new Date());
      const status = dl < 0 ? "<span class='useFirst'>" + icon("triangle-alert", "iconSm") + " " + t("legal.pastBest") + "</span>" : dl === 0 ? "<span class='useFirst'>" + icon("triangle-alert", "iconSm") + " " + t("groc.statusUseToday") + "</span>" : dl <= 2 ? "<span class='useFirst'>" + icon("triangle-alert", "iconSm") + " " + t(dl === 1 ? "groc.useFirst1" : "groc.useFirstN", { n: dl }) + "</span>" : dl <= 5 ? "<span class='useSoon'>" + t("groc.statusUseSoon", { n: dl }) + "</span>" : "<span class='fresh'>" + t("groc.statusFresh", { n: dl }) + "</span>";
      const exp = L.expiryFor(i);
      const dateKnown = typeof i.shelfDays === "number" || L.shelfKnown(i.name, D);
      return "<div class='pantryRow'><div><div class='pName'>" + esc(i.name) + "</div><div class='pMeta'>" + esc(i.qty) + " " + esc(i.unit) + " · " + storagePlace(i.storage) + " · " + (dateKnown ? t("groc.bestUntil") + " " + fullDate(exp) : t("groc.noGuideDate")) + (dateKnown ? "<br>" + status : "") + "</div></div><button class='miniBtn' data-remove-pantry='" + i.id + "'>" + icon("trash-2", "iconSm") + " " + t("common.remove") + "</button></div>";
    }).join("") || emptyState("refrigerator", t("groc.empty"), t("groc.addGroceryBtn"), "addGrocery");
    const gBtn = $("pantryList").querySelector("[data-empty-action='addGrocery']");
    if (gBtn) gBtn.addEventListener("click", function () { $("gName").scrollIntoView({ block: "center" }); $("gName").focus(); });
    /* Pantry delete (Law B2 undo toast): the exact item is held, so Undo
       brings the same item back at its old place. */
    $("pantryList").querySelectorAll("[data-remove-pantry]").forEach(function (b) {
      b.addEventListener("click", function () {
        const idx = state.pantry.findIndex(function (x) { return x.id === b.getAttribute("data-remove-pantry"); });
        if (idx === -1) return;
        const cut = L.removeAt(state.pantry, idx);
        state.pantry = cut.list; save(); renderGroceries(); renderSide();
        toastUndo(t("common.removedToast", { name: cut.item.name }), function () {
          state.pantry = L.restoreAt(state.pantry, cut.item, cut.index);
          save(); renderGroceries(); renderSide();
        });
      });
    });
  }
  /* Fridge photo */
  let photoDataUrl = "";
  /* v60 (Polar M4): the file input itself is hidden (the house shape,
     the background photo and the import already ride it); this styled
     button is the picker, so the raw browser control never shows. */
  $("fridgePhotoBtn").addEventListener("click", function () { $("fridgePhoto").click(); });
  $("fridgePhoto").addEventListener("change", function () {
    const f = $("fridgePhoto").files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = function () { photoDataUrl = String(reader.result); $("photoPreview").innerHTML = "<img class='photoImg' alt='" + t("photo.altFridge") + "' src='" + photoDataUrl + "'>"; };
    reader.readAsDataURL(f);
  });
  function photoFoodChoices() {
    const names = D.FRIDGE_COMMON.slice();
    allRecipes().forEach(function (recipe) {
      (recipe.ingredients || []).forEach(function (ingredient) { if (ingredient && ingredient.name) names.push(ingredient.name); });
    });
    state.pantry.forEach(function (item) { if (item && item.name) names.push(item.name); });
    const seen = Object.create(null);
    return names.map(function (name) { return String(name || "").trim(); }).filter(function (name) {
      const key = name.toLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }
  function photoFoodOptions() {
    return "<datalist id='photoFoodOptions'>" + photoFoodChoices().map(function (name) { return "<option value='" + esc(name) + "'>"; }).join("") + "</datalist>";
  }
  function photoManualEntry() {
    return "<div class='photoManualEntry'><label class='photoManualField'><span>" + t("photo.manualLabel") + "</span><input id='photoManualName' type='text' maxlength='80' list='photoFoodOptions' autocomplete='off' placeholder='" + t("photo.manualPlaceholder") + "'></label><button type='button' class='miniBtn' data-photo-manual>" + icon("plus", "iconSm") + " " + t("photo.manualAdd") + "</button><p class='hint'>" + t("photo.manualHint") + "</p></div>" + photoFoodOptions();
  }
  function foodDefault(name) {
    const n = String(name || "").toLowerCase();
    const pcs = ["egg", "apple", "orange", "lemon", "lime", "avocado", "banana", "onion", "carrot", "tomato", "capsicum", "cucumber", "zucchini", "garlic", "lettuce", "cabbage", "sausage", "potato", "pumpkin", "pizza", "donut", "cake"];
    const ml = ["milk", "juice", "cream", "soy sauce"];
    if (ml.some(function (k) { return n.indexOf(k) !== -1; })) return { qty: 500, unit: "ml" };
    if (pcs.some(function (k) { return n.indexOf(k) !== -1; })) return { qty: n.indexOf("egg") !== -1 ? 6 : 2, unit: "pcs" };
    return { qty: 200, unit: "g" };
  }
  function detectRow(name, confidence) {
    const fd = foodDefault(name);
    const confidenceHtml = typeof confidence === "number" && isFinite(confidence) ? "<p class='hint photoConfidence'>" + t(confidence < 0.5 ? "photo.confidenceLow" : "photo.confidence", { pct: Math.round(confidence * 100) }) + "</p>" : "";
    return "<div class='detectRow'><label class='detectFoodField'><span>" + t("photo.confirmName") + "</span><input type='text' maxlength='80' list='photoFoodOptions' value='" + esc(name) + "' data-dname autocomplete='off'></label><p class='hint photoShelf'>" + t("photo.lasts", { n: L.shelfDays(name, "fridge", D) }) + "</p><input type='number' min='0' step='any' value='" + fd.qty + "' data-dqty aria-label='" + t("groc.amount") + "'><select data-dunit aria-label='" + t("groc.unit") + "'>" + ["g", "pcs", "ml", "kg"].map(function (u) { return "<option" + (u === fd.unit ? " selected" : "") + ">" + u + "</option>"; }).join("") + "</select><button type='button' class='miniBtn' data-dadd>" + icon("plus", "iconSm") + " " + t("photo.addToGroceries") + "</button>" + confidenceHtml + "</div>";
  }
  function bindDetectRows() {
    $("photoResults").querySelectorAll("[data-dadd]").forEach(function (b) {
      if (b.dataset.bound) return; b.dataset.bound = "1";
      b.addEventListener("click", function () {
        const row = b.parentElement;
        const nameField = row.querySelector("[data-dname]");
        const name = nameField ? nameField.value.trim() : "";
        if (!name) { toast(t("photo.nameRequired")); if (nameField) nameField.focus(); return; }
        if (name.length > 80) { toast(t("photo.nameTooLong")); if (nameField) nameField.focus(); return; }
        const qtyField = row.querySelector("[data-dqty]");
        const qty = Number(qtyField.value);
        if (qtyField.value === "" || !isFinite(qty) || qty <= 0) { toast(t("groc.needAmount")); qtyField.focus(); return; }
        const unit = row.querySelector("[data-dunit]").value;
        const existing = state.pantry.find(function (item) { return item.name.trim().toLowerCase() === name.toLowerCase() && item.unit === unit && item.storage === "fridge"; });
        if (existing) existing.qty = Number(existing.qty || 0) + qty;
        else state.pantry.push({ id: "g" + Date.now() + Math.floor(Math.random() * 999), name: name, qty: qty, unit: unit, storage: "fridge", added: todayKey(), shelfDays: L.shelfKnown(name, D) ? L.shelfDays(name, "fridge", D) : undefined });
        save(); b.textContent = t("photo.added"); b.disabled = true; renderGroceries(); renderSide(); toast(t("toast.itemAddedToGroceries", { name: name }) + " " + t("photo.lasts", { n: L.shelfDays(name, "fridge", D) }));
      });
    });
    $("photoResults").querySelectorAll("[data-common]").forEach(function (b) {
      if (b.dataset.bound) return; b.dataset.bound = "1";
      b.addEventListener("click", function () {
        $("photoResults").insertAdjacentHTML("beforeend", detectRow(b.getAttribute("data-common"))); bindDetectRows();
      });
    });
    const manual = $("photoResults").querySelector("[data-photo-manual]");
    if (manual && !manual.dataset.bound) {
      manual.dataset.bound = "1";
      manual.addEventListener("click", function () {
        const field = $("photoManualName");
        const name = field.value.trim();
        if (!name) { toast(t("photo.nameRequired")); field.focus(); return; }
        if (name.length > 80) { toast(t("photo.nameTooLong")); field.focus(); return; }
        $("photoResults").insertAdjacentHTML("beforeend", detectRow(name));
        field.value = "";
        bindDetectRows();
        const rows = $("photoResults").querySelectorAll("[data-dname]");
        if (rows.length) rows[rows.length - 1].focus();
      });
    }
  }
  function loadScript(src) { return new Promise(function (res, rej) { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  $("photoScan").addEventListener("click", async function () {
    if (!photoDataUrl) { toast(t("toast.addPhotoFirst")); return; }
    /* Everyone gets one on-device scan before the Plus gate. The flag
       is saved only after model.detect resolves, so a load/error does
       not consume the try. */
    if (!plusActive() && state.photoTrialUsed) { plusGate("photo"); return; }
    $("photoResults").innerHTML = "<p class='hint'>" + t("photo.looking") + "</p>";
    const foundByName = Object.create(null);
    let modelCompleted = false;
    try {
      /* U8 (app v49): the model load races a 30 second bound. A
         load that never settles used to hold the looking line
         forever; the timeout now falls into the same catch a
         failed load has always taken, and the tap to confirm
         fallback below lands exactly as it does for a refusal. */
      await window.MP_WAIT.bound((async function () {
        const eye = await import("./food-eye.js");
        const img = $("photoPreview").querySelector("img");
        const ranked = await eye.findFoods(img.src, function (p) {
          if (p && p.status === "progress" && p.total > 1e6) $("photoResults").innerHTML = "<p class='hint'>" + t("photo.downloading", { pct: Math.round(p.loaded / p.total * 100) }) + "</p>";
        });
        modelCompleted = true;
        ranked.forEach(function (r) { foundByName[r.name] = { name: r.name, score: undefined, rank: r.rank }; });
      })(), 180000);
    } catch (e) { /* local model could not load: fall back to tap to confirm list */ }
    if (modelCompleted && !plusActive() && !state.photoTrialUsed) { state.photoTrialUsed = true; save(); }
    const found = Object.keys(foundByName).map(function (key) { return foundByName[key]; }).sort(function (a, b) { return a.rank - b.rank; });
    const sure = found.slice(0, 6), maybe = found.slice(6);
    let html = "";
    if (sure.length) html += "<h3>" + t("photo.foundTitle") + "</h3><p class='hint'>" + t("photo.foundHint") + "</p>" + sure.map(function (item) { return detectRow(item.name); }).join("");
    else html += "<h3>" + t("photo.tapTitle") + "</h3><p class='hint'>" + t("photo.tapHint") + "</p>";
    if (maybe.length) html += "<h3>" + t("photo.maybeTitle") + "</h3><div class='chipRow'>" + maybe.map(function (c) { return "<button class='chip' data-common='" + esc(c.name) + "'>" + esc(listIngName(c.name)) + "</button>"; }).join("") + "</div>";
    html += photoManualEntry();
    html += "<div class='chipRow'>" + D.FRIDGE_COMMON.map(function (c) { return "<button class='chip' data-common='" + esc(c) + "'>" + esc(listIngName(c)) + "</button>"; }).join("") + "</div>";
    $("photoResults").innerHTML = html;
    bindDetectRows();
  });

  /* Photo calories view. Same on device model as the fridge photo. Numbers
     are estimates for a typical serving of the food the model names, with a
     plus or minus 30 percent range, because a photo cannot weigh food. */
  let calPhotoDataUrl = "";
  /* v60 (Polar M4): the styled button picks; the input stays hidden. */
  $("calPhotoBtn").addEventListener("click", function () { $("calPhoto").click(); });
  $("calPhoto").addEventListener("change", function () {
    const f = $("calPhoto").files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = function () { calPhotoDataUrl = String(reader.result); $("calPhotoPreview").innerHTML = "<img class='photoImg' alt='" + t("photo.altFood") + "' src='" + calPhotoDataUrl + "'>"; };
    reader.readAsDataURL(f);
  });
  function calRow(est) {
    const title = est.food.charAt(0).toUpperCase() + est.food.slice(1);
    return "<div class='detectRow'><div><strong>" + esc(title) + "</strong><div class='pMeta'>" + esc(est.label) + "</div></div><div><strong>" + t("kcal.about", { n: est.kcal }) + "</strong><div class='pMeta'>" + t("kcal.roughly", { low: est.low, high: est.high }) + "</div></div></div>";
  }
  function renderPhotoCalChips() {
    $("calChips").innerHTML = D.FRIDGE_COMMON.map(function (c) { return "<button class='chip' data-calfood='" + esc(c) + "'>" + esc(c) + "</button>"; }).join("");
    $("calChips").querySelectorAll("[data-calfood]").forEach(function (b) {
      b.addEventListener("click", function () {
        const est = L.fridgeKcal(b.getAttribute("data-calfood"), NUT);
        if (est) $("calResults").insertAdjacentHTML("beforeend", calRow(est));
      });
    });
  }
  $("calPhotoScan").addEventListener("click", async function () {
    if (!calPhotoDataUrl) { toast(t("toast.addPhotoFirst")); return; }
    $("calResults").innerHTML = "<p class='hint'>" + t("photo.looking") + "</p>";
    const found = [];
    try {
      /* U8 (app v49): the same 30 second bound as the fridge
         photo beside it; the timeout takes this handler's own
         existing fallback, the tap to add list below. */
      await window.MP_WAIT.bound((async function () {
        if (!window.cocoSsd) {
          await loadScript("vendor/tf.min.js");
          await loadScript("vendor/coco-ssd.min.js");
        }
        const model = await cocoSsd.load({ modelUrl: "vendor/model/model.json" });
        const img = $("calPhotoPreview").querySelector("img");
        const preds = await model.detect(img);
        const map = { apple: "apple", banana: "banana", orange: "orange", broccoli: "broccoli", carrot: "carrot", pizza: "pizza", cake: "cake", sandwich: "sandwich", donut: "donut" };
        preds.forEach(function (p) { if (map[p.class] && found.indexOf(map[p.class]) === -1) found.push(map[p.class]); });
      })(), 30000);
    } catch (e) { /* local model could not load: the tap to add list below still works */ }
    if (found.length) {
      $("calResults").innerHTML = "<h3>" + t("photo.foundTitle") + "</h3>" + found.map(function (c) { return calRow(L.photoKcal(c, NUT)); }).join("");
    } else {
      $("calResults").innerHTML = "<h3>" + t("photocal.noneTitle") + "</h3><p class='hint'>" + t("photocal.noneHint") + "</p>";
    }
  });

  /* Grocery list view */
  function groceryAmount(i) {
    return i && i.unit === "to taste" ? esc(t("recipes.toTaste")) : esc(i && i.qty) + " " + esc(i && i.unit);
  }
  function renderList() {
    const start = todayKey(); ensureRange(start, 7);
    const sub = {}; for (let i = 0; i < 7; i++) { const d = L.parseKey(start); d.setDate(d.getDate() + i); sub[L.dateKey(d)] = state.plan[L.dateKey(d)]; }
    /* Pantry covered items come off the buy list (the ruling of
       18 Oct, build 8; amounts from 29 Oct, item 9) and wait in the
       at home set; a put back choice in state.atHomeBack returns one
       to the buy list with its full planned amount. */
    const built = L.buildGroceryList(sub, recipesForServingCount(), state.pantry, state.atHomeBack);
    const auto = built.buy.filter(function (i) { return !state.hiddenItems[i.name + "|" + i.unit]; });
    const atHome = built.atHome;
    const groups = {};
    auto.forEach(function (i) { (groups[i.category] = groups[i.category] || []).push(i); });
    let html = "";
    /* The list built from the plan is a Plus extra (v32 trigger: list).
       On the free tier the auto list is replaced by the gate card;
       the hand added list below stays fully usable either way. */
    if (!plusActive()) {
      html += "<div class='groupTitle'>" + t("list.fromPlan") + "</div>";
      if (plusShown.list) {
        html += "<p class='hint'>" + esc(PLUS_WANTS.list.gate) + "</p><div class='row'><button class='pillBtn' data-plans='1'>" + t("list.seePlans") + "</button></div>";
      } else {
        html += "<p class='hint'>" + t("list.gateHint") + "</p><div class='row'><button class='primaryBtn' data-build-list='1'>" + t("list.buildBtn") + "</button></div>";
      }
    } else Object.keys(groups).sort().forEach(function (cat) {
      html += "<div class='groupTitle'>" + esc(cat) + "</div>" + groups[cat].map(function (i) {
        const key = i.name + "|" + i.unit; const done = !!state.doneItems[key];
        const haveNote = i.haveQty ? " · <span class='fresh'>" + t("list.youHaveAmount", { qty: i.haveQty, unit: i.unit }) + "</span>" : (i.haveIt ? " · <span class='fresh'>" + t("list.youHaveThis") + "</span>" : "");
        const forLine = i.forRecipes && i.forRecipes.length ? "<span class='pMeta' style='display:block'>" + t("list.forRecipes", { names: i.forRecipes.map(function (n, ix) { const rr = i.forRecipeIds && recipeById(i.forRecipeIds[ix]); return rr ? rName(rr) : n; }).join(", ") }) + "</span>" : "";
        return "<div class='shopRow'><label style='display:flex;gap:10px;align-items:center;margin:0'><input type='checkbox' data-done='" + esc(key) + "'" + (done ? " checked" : "") + "><span><span class='pName'" + (done ? " style='text-decoration:line-through'" : "") + ">" + esc(listIngName(i.name)) + "</span><span class='pMeta'> " + groceryAmount(i) + haveNote + "</span>" + forLine + "</span></label><button class='miniBtn' data-hide-item='" + esc(key) + "'>" + icon("trash-2", "iconSm") + " " + t("common.remove") + "</button></div>";
      }).join("");
    });
    /* Grocery List empty state (design section 3A): nothing planned and
       nothing added by hand, so the list itself is the empty screen. */
    if (plusActive() && !auto.length && !atHome.length && !state.extras.length) {
      $("shopList").innerHTML = emptyState("clipboard-list", t("list.emptyAuto"), t("cal.planFirstWeek"), "planWeek");
      $("shopList").querySelector("[data-empty-action='planWeek']").addEventListener("click", function () { planMyFirstWeek(); renderList(); renderSide(); toast(t("toast.listReady")); });
      return;
    }
    html += "<div class='groupTitle'>" + t("list.addedByYou") + "</div>";
    html += state.extras.map(function (x) {
      return "<div class='shopRow'><div><span class='pName'>" + esc(x.name) + "</span><span class='pMeta'> " + esc(x.qty) + " " + esc(x.unit) + "</span></div><button class='miniBtn' data-remove-extra='" + x.id + "'>" + icon("trash-2", "iconSm") + " " + t("common.remove") + "</button></div>";
    }).join("") || emptyState("clipboard-list", t("list.emptyHand"));
    /* The Already at home strip (the ruling of 18 Oct, build 8): the covered
       items sit at the bottom of the list, visible, each with one tap
       to put it back on the buy list at its planned amount. It rides
       the same Plus gate as the built list it came from. */
    if (plusActive() && atHome.length) {
      html += "<div class='groupTitle'>" + t("list.atHomeTitle") + "</div>" + atHome.map(function (i) {
        const key = i.name + "|" + i.unit;
        return "<div class='shopRow'><div><span class='pName'>" + esc(listIngName(i.name)) + "</span><span class='pMeta'> " + groceryAmount(i) + "</span></div><button class='miniBtn' data-athome-back='" + esc(key) + "'>" + t("list.putBack") + "</button></div>";
      }).join("");
    }
    $("shopList").innerHTML = html;
    const buildBtn = $("shopList").querySelector("[data-build-list]");
    if (buildBtn) buildBtn.addEventListener("click", function () { plusGate("list"); });
    const plansBtn = $("shopList").querySelector("[data-plans]");
    if (plansBtn) plansBtn.addEventListener("click", goPlans);
    $("shopList").querySelectorAll("[data-done]").forEach(function (c) { c.addEventListener("change", function () { state.doneItems[c.getAttribute("data-done")] = c.checked; save(); renderList(); }); });
    /* List deletes (Law B2 undo toast): hiding an item holds its key, and
       removing an added item holds the exact record. Undo restores both. */
    $("shopList").querySelectorAll("[data-hide-item]").forEach(function (b) { b.addEventListener("click", function () {
      const key = b.getAttribute("data-hide-item");
      state.hiddenItems[key] = true; save(); renderList();
      toastUndo(t("toast.removedFromList"), function () { delete state.hiddenItems[key]; save(); renderList(); });
    }); });
    /* Put back (build 8): the tap records the override and the item
       rejoins the buy list at its planned amount on the re-render. */
    $("shopList").querySelectorAll("[data-athome-back]").forEach(function (b) { b.addEventListener("click", function () {
      state.atHomeBack[b.getAttribute("data-athome-back")] = true; save(); renderList();
    }); });
    $("shopList").querySelectorAll("[data-remove-extra]").forEach(function (b) { b.addEventListener("click", function () {
      const idx = state.extras.findIndex(function (x) { return x.id === b.getAttribute("data-remove-extra"); });
      if (idx === -1) return;
      const cut = L.removeAt(state.extras, idx);
      state.extras = cut.list; save(); renderList();
      toastUndo(t("common.removedToast", { name: cut.item.name }), function () {
        state.extras = L.restoreAt(state.extras, cut.item, cut.index);
        save(); renderList();
      });
    }); });
  }
  $("extraAdd").addEventListener("click", function () {
    const name = $("extraName").value.trim(); if (!name) return;
    state.extras.push({ id: "e" + Date.now(), name: name, qty: 1, unit: "pcs", category: "Other" });
    $("extraName").value = ""; save(); renderList(); toast(t("toast.addedToList"));
  });

  /* Family view. The colour comes from the app palette (QA F3): every
     colour passes 4.5 under the white initial the avatar circle wears.
     One shared addPerson is used by this form and by guide step 3, so both
     doors write the same record shape. */
  function splitList(v) { return String(v || "").split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean); }
  let formColor = L.PERSON_COLORS[0];
  let guideColor = L.PERSON_COLORS[0];
  function colorChipsHtml(selected) {
    return L.PERSON_COLORS.map(function (c) {
      return "<button type='button' class='colorChip" + (c === selected ? " on" : "") + "' role='radio' aria-checked='" + (c === selected ? "true" : "false") + "' aria-label='" + t("fam.colourWord") + " " + c + "' data-color='" + c + "' style='background:" + c + "'></button>";
    }).join("");
  }
  function bindColorChips(container, get, set) {
    container.querySelectorAll("[data-color]").forEach(function (b) {
      b.addEventListener("click", function () { set(b.getAttribute("data-color")); container.innerHTML = colorChipsHtml(get()); bindColorChips(container, get, set); });
    });
  }
  function addPerson(fields) {
    const person = { id: "p" + Date.now(), name: fields.name, color: fields.color, tags: fields.tags, dislikes: fields.dislikes, allergies: fields.allergies };
    state.family.push(person); save();
    return person;
  }
  $("fAdd").addEventListener("click", function () {
    const name = $("fName").value.trim(); if (!name) { toast(t("toast.addNameFirst")); return; }
    /* Free covers one profile; a second is a Plus extra (v32 trigger: family). */
    if (state.family.length >= 1 && plusGate("family")) return;
    addPerson({ name: name, color: formColor, tags: $("fTags").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean), dislikes: splitList($("fDislikes").value), allergies: splitList($("fAllergies").value) });
    $("fName").value = ""; $("fTags").value = ""; $("fDislikes").value = ""; $("fAllergies").value = "";
    renderFamily(); toast(t("toast.personAdded", { name: name }));
  });
  function renderFamily() {
    $("fColorChips").innerHTML = colorChipsHtml(formColor);
    bindColorChips($("fColorChips"), function () { return formColor; }, function (c) { formColor = c; });
    $("familyList").innerHTML = state.family.map(function (p) {
      return "<div class='recipeCard'><div class='personHead'><span class='avatarCircle' style='background:" + esc(p.color) + "'>" + esc(p.name.slice(0, 1)) + "</span><div class='mealName'>" + esc(p.name) + "</div></div>" +
        (p.tags.length ? "<div>" + p.tags.map(function (t) { return "<span class='tag'>" + esc(t) + "</span>"; }).join("") + "</div>" : "") +
        "<p class='pMeta'>" + t("fam.doesNotLike") + " " + (p.dislikes.length ? p.dislikes.map(esc).join(", ") : t("fam.nothingListed")) + "<br>" + t("fam.allergiesWord") + " " + (p.allergies.length ? "<strong>" + p.allergies.map(esc).join(", ") + "</strong>" : t("fam.noneListed")) + "</p>" +
        "<button class='miniBtn' data-remove-person='" + p.id + "'>" + icon("trash-2", "iconSm") + " " + t("common.remove") + "</button></div>";
    }).join("") || emptyState("users", t("fam.empty"), t("fam.addTitle"), "addPerson");
    const pBtn = $("familyList").querySelector("[data-empty-action='addPerson']");
    if (pBtn) pBtn.addEventListener("click", function () { $("fName").scrollIntoView({ block: "center" }); $("fName").focus(); });
    /* Person delete (Law B2 undo toast): the whole record goes, allergy
       notes included, and the toast holds that exact record, so Undo
       brings the person back byte for byte. */
    $("familyList").querySelectorAll("[data-remove-person]").forEach(function (b) { b.addEventListener("click", function () {
      const idx = state.family.findIndex(function (x) { return x.id === b.getAttribute("data-remove-person"); });
      if (idx === -1) return;
      const cut = L.removeAt(state.family, idx);
      state.family = cut.list; save(); renderFamily();
      toastUndo(t("common.removedToast", { name: cut.item.name }), function () {
        state.family = L.restoreAt(state.family, cut.item, cut.index);
        save(); renderFamily();
      });
    }); });
  }

  /* Preferences view */
  function chipHtml(name, on) { return "<button class='chip" + (on ? " on" : "") + "' data-cuisine='" + esc(name) + "'>" + esc(cuisineLabel(name)) + "</button>"; }
  function renderPrefs() {
    $("cuisineChips").innerHTML = D.CUISINES.map(function (c) { return chipHtml(c, state.preferences.indexOf(c) !== -1); }).join("");
    $("cuisineChips").querySelectorAll("[data-cuisine]").forEach(function (b) {
      b.addEventListener("click", function () {
        const c = b.getAttribute("data-cuisine");
        const i = state.preferences.indexOf(c);
        if (i === -1) state.preferences.push(c); else state.preferences.splice(i, 1);
        save(); renderPrefs();
      });
    });
    $("recipeDiet").value = state.diet;
    $("maxCookMinutes").value = String(state.maxCookMinutes);
    $("defaultServings").value = String(state.defaultServings);
    /* Busy nights (29 Oct, item 6): weekday chips save the moment
       they are tapped, like the cuisine chips above. Day names come
       from the phone's own calendar words, so both languages are
       right without extra strings. 25 Oct 2026 was a Sunday. */
    $("busyChips").innerHTML = [0, 1, 2, 3, 4, 5, 6].map(function (wd) {
      const label = new Date(2026, 9, 25 + wd).toLocaleDateString(LANG.locale(), { weekday: "short" });
      return "<button class='chip" + (state.busyNights.indexOf(wd) !== -1 ? " on" : "") + "' data-busy='" + wd + "'>" + esc(label) + "</button>";
    }).join("");
    $("busyChips").querySelectorAll("[data-busy]").forEach(function (b) {
      b.addEventListener("click", function () {
        const wd = Number(b.getAttribute("data-busy"));
        const i = state.busyNights.indexOf(wd);
        if (i === -1) state.busyNights.push(wd); else state.busyNights.splice(i, 1);
        state.busyNights = L.cleanBusyNights(state.busyNights);
        save(); renderPrefs();
      });
    });
    $("quickMinutes").value = String(state.quickMinutes);
    $("eatBreakfast").value = state.eatTimes.breakfast;
    $("eatLunch").value = state.eatTimes.lunch;
    $("eatDinner").value = state.eatTimes.dinner;
    $("alsoBreakfast").value = state.extraReminders.breakfast;
    $("alsoLunch").value = state.extraReminders.lunch;
    $("alsoDinner").value = state.extraReminders.dinner;
    /* The reminder mode choice (build 5, spec (c)): each meal fires
       by cook time, or at its own saved fixed time. The time input
       only shows when fixed is the meal's chosen mode. */
    ["Breakfast", "Lunch", "Dinner"].forEach(function (cap) {
      const m = cap.toLowerCase();
      $("mode" + cap).value = state.reminderMode[m];
      $("fixed" + cap).value = state.reminderTimes[m];
      $("fixed" + cap).classList.toggle("hidden", state.reminderMode[m] !== "fixed");
    });
    $("setupMinutes").value = state.setupMinutes;
    renderAppearance();
    renderLanguage();
    /* The Plans card's buy surface (app v46): renders its buttons
       only while the payment rails are live; while they sleep this
       call leaves the card exactly as it ships. */
    renderPlansBuy();
  }
  /* Language row (app v34): the pick is saved in settings (user
     data, Law B), mirrored for the next boot's first paint, and the
     page reloads so every word, static and rendered, lands in the
     new language at once. */
  function renderLanguage() {
    const s = bgSettings();
    document.querySelectorAll(".langChip").forEach(function (c) {
      c.setAttribute("aria-checked", c.getAttribute("data-lang-choice") === s.language ? "true" : "false");
    });
  }
  document.querySelectorAll(".langChip").forEach(function (c) {
    c.addEventListener("click", function () {
      const s = bgSettings();
      const pick = c.getAttribute("data-lang-choice");
      if (pick === s.language) return;
      s.language = pick;
      save();
      LANG.setChoice(pick);
      /* The reload waits for both the local copy and the account
         push. The normal save is debounced for 500 ms; this flush
         keeps a language change from being lost to its own reload.
         With accounts dormant, the local copy still flushes first. */
      flushPendingSave().then(function () { location.reload(); }, function () { location.reload(); });
    });
  });

  /* Law E backgrounds (the house standard section 5, Law E): Brand, White, Black or
     the user's own photo. The theme is applied by swapping token values on
     body[data-bg] (styles.css). The photo is user data: it lives in settings,
     is resized on this device, and only the user's own Replace and Remove
     buttons in the Appearance card can change it. The app never deletes it.
     The veil strengths live in styles.css and are solved by
     brand-board/contrast-themes.py so text stays AA over any photo. */
  const PHOTO_MODE_THRESHOLD = 0.35; /* average linear luminance: at or above, the photo reads light */
  function bgSettings() { return state.settings || (state.settings = L.cleanBackgroundSettings(null)); }
  function applyBackground() {
    const s = bgSettings();
    let kind = s.background.kind;
    if (kind === "photo" && !s.backgroundPhoto) kind = "brand"; /* no photo yet: wear Brand until one is picked */
    document.body.setAttribute("data-bg", kind);
    if (kind === "photo") {
      document.body.setAttribute("data-photo-mode", s.background.photoMode === "dark" ? "dark" : "light");
      $("bgPhoto").style.backgroundImage = "url(" + s.backgroundPhoto + ")";
    } else {
      document.body.removeAttribute("data-photo-mode");
      $("bgPhoto").style.backgroundImage = "";
    }
    document.querySelectorAll(".bgChip").forEach(function (c) {
      c.setAttribute("aria-checked", c.getAttribute("data-bg-kind") === s.background.kind ? "true" : "false");
    });
  }
  function renderAppearance() {
    const s = bgSettings();
    const has = !!s.backgroundPhoto;
    $("bgPhotoControls").classList.toggle("hidden", !(s.background.kind === "photo" || has));
    $("bgChoose").classList.toggle("hidden", has);
    $("bgReplace").classList.toggle("hidden", !has);
    $("bgRemove").classList.toggle("hidden", !has);
    $("bgPhotoMsg").textContent = has ? t("appear.photoSaved") : (s.background.kind === "photo" ? t("appear.noPhotoYet") : "");
    applyBackground();
  }
  document.querySelectorAll(".bgChip").forEach(function (c) {
    c.addEventListener("click", function () {
      const s = bgSettings();
      s.background.kind = c.getAttribute("data-bg-kind");
      save(); renderAppearance();
      if (s.background.kind === "photo" && !s.backgroundPhoto) toast(t("toast.choosePhotoBg"));
    });
  });
  $("bgChoose").addEventListener("click", function () { $("bgPhotoInput").click(); });
  $("bgReplace").addEventListener("click", function () { $("bgPhotoInput").click(); });
  /* Removing the background photo is a one way delete (the photo has no
     other copy), so Law B2 gives it the confirm step. */
  $("bgRemove").addEventListener("click", function () {
    askConfirm(t("confirm.removePhotoTitle"), t("confirm.removePhotoText"), t("appear.removePhoto"), function () {
      const s = bgSettings();
      s.backgroundPhoto = "";
      if (s.background.kind === "photo") s.background.kind = "brand";
      save(); renderAppearance(); toast(t("toast.photoRemoved"));
    });
  });
  $("bgPhotoInput").addEventListener("change", function () {
    const f = $("bgPhotoInput").files[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      /* The reading is picked by the photo itself: average the linear luminance
         of a small copy. Light photos get the light veil and light tokens,
         dark photos the dark veil and dark tokens, so words stay readable. */
      const small = document.createElement("canvas"); small.width = 48; small.height = 48;
      const sx = small.getContext("2d"); sx.drawImage(cv, 0, 0, 48, 48);
      const px = sx.getImageData(0, 0, 48, 48).data;
      const lin = function (c) { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      let total = 0;
      for (let i = 0; i < px.length; i += 4) total += 0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]);
      const avg = total / (48 * 48);
      const s = bgSettings();
      s.backgroundPhoto = cv.toDataURL("image/jpeg", 0.85);
      s.background.kind = "photo";
      s.background.photoMode = avg >= PHOTO_MODE_THRESHOLD ? "light" : "dark";
      save(); renderAppearance();
      toast(t("toast.photoNowBg"));
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast(t("toast.photoUnreadable")); };
    img.src = url;
    $("bgPhotoInput").value = "";
  });
  /* The mode select shows its fixed time input the moment fixed is
     picked, before anything is saved. */
  ["Breakfast", "Lunch", "Dinner"].forEach(function (cap) {
    $("mode" + cap).addEventListener("change", function () {
      $("fixed" + cap).classList.toggle("hidden", $("mode" + cap).value !== "fixed");
    });
  });
  $("prefsSave").addEventListener("click", function () {
    state.diet = L.cleanDiet($("recipeDiet").value);
    state.maxCookMinutes = L.cleanCookMinutes($("maxCookMinutes").value);
    state.defaultServings = L.cleanServings($("defaultServings").value);
    state.quickMinutes = L.cleanQuickMinutes($("quickMinutes").value);
    state.eatTimes = { breakfast: $("eatBreakfast").value || "07:30", lunch: $("eatLunch").value || "12:30", dinner: $("eatDinner").value || "18:30" };
    state.setupMinutes = Math.max(0, Number($("setupMinutes").value) || 5);
    state.extraReminders = { breakfast: Math.min(240, Math.max(0, Math.floor(Number($("alsoBreakfast").value) || 0))), lunch: Math.min(240, Math.max(0, Math.floor(Number($("alsoLunch").value) || 0))), dinner: Math.min(240, Math.max(0, Math.floor(Number($("alsoDinner").value) || 0))) };
    /* Reminder modes ride the same save (build 5, spec (c)): a meal
       set to fixed with no time typed yet takes its eating time as
       the saved time, so fixed always has a real time to fire at. */
    ["breakfast", "lunch", "dinner"].forEach(function (m) {
      const cap = m.charAt(0).toUpperCase() + m.slice(1);
      const mode = $("mode" + cap).value === "fixed" ? "fixed" : "cook";
      state.reminderMode[m] = mode;
      let ft = $("fixed" + cap).value;
      if (mode === "fixed" && !timeOk(ft)) ft = state.eatTimes[m];
      state.reminderTimes[m] = timeOk(ft) ? ft : "";
    });
    save(); $("prefsMsg").textContent = t("prefs.savedMsg"); renderSide();
  });
  $("fillMonth").addEventListener("click", function () {
    state.planCleared = false; state.autoPlan = true;
    const first = L.dateKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12));
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const plan = L.buildPlan(first, days, planCtx(), D);
    Object.keys(plan).forEach(function (k) { state.plan[k] = plan[k]; });
    save(); notePlanned("planner"); toast(t("toast.monthFilled")); if (currentView === "calendar") renderCalendar();
  });
  /* Clear my plan is a bulk delete, so Law B2 gives it the confirm step. */
  $("clearPlan").addEventListener("click", function () {
    askConfirm(t("confirm.clearPlanTitle"), t("confirm.clearPlanText"), t("prefs.clearPlan"), function () {
      state.plan = {}; state.planCleared = true; save(); toast(t("toast.planCleared")); render();
    });
  });
  $("exportBtn").addEventListener("click", function () {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "meal-prep-data.json"; a.click();
  });
  /* Send this list (29 Oct, item 10, the part that fits the Multi
     User Law): the list leaves as a plain copy the person sends
     themselves. Nothing is shared live and no other account can see
     this data; the household gets words, not access. Unticked buy
     items and hand added extras only. */
  $("sendListBtn").addEventListener("click", async function () {
    const start = todayKey(); ensureRange(start, 7);
    const sub = {}; for (let i = 0; i < 7; i++) { const d = L.parseKey(start); d.setDate(d.getDate() + i); sub[L.dateKey(d)] = state.plan[L.dateKey(d)]; }
    const built = L.buildGroceryList(sub, recipesForServingCount(), state.pantry, state.atHomeBack);
    const lines = [t("list.sendTitle")];
    built.buy.filter(function (i) { return !state.hiddenItems[i.name + "|" + i.unit] && !state.doneItems[i.name + "|" + i.unit]; }).forEach(function (i) { lines.push("• " + listIngName(i.name) + " " + (i.unit === "to taste" ? t("recipes.toTaste") : i.qty + " " + i.unit)); });
    state.extras.forEach(function (x) { lines.push("• " + x.name + " " + x.qty + " " + x.unit); });
    const text = lines.join("\n");
    if (navigator.share) { try { await navigator.share({ title: t("list.sendTitle"), text: text }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(text); toast(t("toast.listCopied")); }
    catch (e) { toast(t("toast.listCopyFailed")); }
  });

  /* Reminders and notifications */
  function upcomingReminders() {
    const out = []; const start = todayKey(); ensureRange(start, 7);
    for (let i = 0; i < 7; i++) {
      const d = L.parseKey(start); d.setDate(d.getDate() + i); const key = L.dateKey(d);
      ["breakfast", "lunch", "dinner"].forEach(function (meal) {
        const r = recipeById(state.plan[key][meal]); if (!r) return;
        /* Skipped meals stay listed (build 5, spec (a)) but promise
           no times: the row shows the skipped state instead. Fixed
           mode meals (spec (c)) show their saved clock time as the
           start; the also moment still rides the eating time. */
        const skipped = !!state.skips[key + "." + meal];
        const fixed = state.reminderMode[meal] === "fixed" && timeOk(state.reminderTimes[meal]);
        out.push({ key: key, date: d, meal: meal, recipe: r, skipped: skipped, fixed: fixed, eat: state.eatTimes[meal], start: fixed ? state.reminderTimes[meal] : L.reminderTime(state.eatTimes[meal], r.minutes, state.setupMinutes), also: skipped ? null : L.extraReminderTime(state.eatTimes[meal], state.extraReminders[meal]) });
      });
    }
    return out;
  }
  function renderReminders() {
    $("notifStatus").textContent = state.notifications === "granted" ? t("rem.statusOn") : state.notifications === "denied" ? t("rem.statusBlocked") : t("rem.statusOff");
    $("reminderList").innerHTML = upcomingReminders().map(function (x) {
      const dayStr = new Intl.DateTimeFormat(LANG.locale(), { day: "numeric", month: "long" }).format(x.date);
      if (x.skipped) return "<div class='reminderRow skipped'><div><div class='pName'>" + esc(rName(x.recipe)) + "</div><div class='pMeta'>" + dayStr + " · " + mealLabel(x.meal) + " · " + t("cal.skipped") + "</div></div>" + mealBadge(x.meal) + "</div>";
      const wraps = (function () { const sp = x.start.split(":"); const ep = x.eat.split(":"); return (Number(sp[0]) * 60 + Number(sp[1])) > (Number(ep[0]) * 60 + Number(ep[1])); })();
      return "<div class='reminderRow'><div><div class='pName'>" + esc(rName(x.recipe)) + "</div><div class='pMeta'>" + dayStr + " · " + mealLabel(x.meal) + " · " + t("rem.startCooking") + " " + L.formatTime(x.start) + (wraps ? " " + t("rem.dayBefore") : "") + " · " + t("rem.eatAt") + " " + L.formatTime(x.eat) + (x.fixed ? " · " + t("prefs.sameTimeDaily") : " · " + t("rem.cookTime") + " " + x.recipe.minutes + " min · " + t("rem.setupWord") + " " + state.setupMinutes + " min") + (x.also ? " · " + t("rem.alsoWord") + " " + L.formatTime(x.also) : "") + "</div></div>" + mealBadge(x.meal) + "</div>";
    }).join("") || emptyState("bell", t("rem.empty"), t("rem.gotoCalendar"), "gotoCalendar");
    const rBtn = $("reminderList").querySelector("[data-empty-action='gotoCalendar']");
    if (rBtn) rBtn.addEventListener("click", function () { switchView("calendar"); });
  }
  /* Native notifications (build 5). The packaged WebView has no
     Notification API at all — the web ask died there on the owner's phone
     ("This browser cannot show notifications.") — so inside the
     package the OS carries the reminders through the maintained
     @capacitor/local-notifications plugin (8.3.1, store-build). The
     detection idiom is the native doors' own (app v39): the branch
     stands only when the app runs inside the package AND the plugin
     stands on the bundled bridge (window.Capacitor.Plugins.
     LocalNotifications, never a network load). On the open web there
     is no bridge, this returns null, and the shipped web checker runs
     byte for byte as before. The moments themselves come from the
     one pure schedule (L.reminderSchedule) on both roads. */
  const NOTIF_TEST_ID = 424242;
  function nativeNotifPlugin() {
    const cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;
    const plug = (cap.Plugins || {}).LocalNotifications;
    if (!plug || typeof plug.schedule !== "function" || typeof plug.cancel !== "function" || typeof plug.getPending !== "function" || typeof plug.requestPermissions !== "function") return null;
    return plug;
  }
  /* Rebuild the OS schedule from the state: cancel every pending
     meal notification (the test notification keeps its own id and is
     never cancelled here), then book the next 7 days of the pure
     schedule, future moments only, each under its deterministic id,
     so this pass replaces its own work and never doubles up. Runs on
     app start and, debounced through save(), on every state change
     that can move a reminder. A re-entrant call while a pass is
     running is dropped: the running pass already reads the newest
     state before it books. Native only; on web this is a no-op. */
  let notifReschedBusy = false;
  async function rescheduleNative() {
    const plug = nativeNotifPlugin(); if (!plug) return;
    if (notifReschedBusy) return;
    notifReschedBusy = true;
    /* U9 (app v49): a plugin call that never settles never
       reaches the finally below, and the busy flag used to stay
       set for the whole session, so the reminders silently
       stopped re-booking. The flag now clears itself on a 30
       second timer whatever the pass does; a pass that settles
       clears its own timer in the finally, exactly as before. */
    const busyWatchdog = setTimeout(function () { notifReschedBusy = false; }, 30000);
    try {
      const pending = await plug.getPending();
      const stale = ((pending && pending.notifications) || []).filter(function (n) { return n.id !== NOTIF_TEST_ID; });
      if (stale.length) await plug.cancel({ notifications: stale.map(function (n) { return { id: n.id }; }) });
      if (state.notifications === "granted") {
        ensureRange(todayKey(), 7);
        const now = new Date();
        const list = [];
        L.expirySchedule(state, D, now, 7).forEach(function (e) {
          if (e.at <= now) return;
          list.push({ id: e.id, title: t("notif.expiryTitle"), body: t("notif.expiryBody", { name: e.name, date: L.parseKey(e.expiryKey).toLocaleDateString(LANG.locale(), { weekday: "long", day: "numeric", month: "long" }) }), schedule: { at: e.at, allowWhileIdle: true }, extra: { key: e.key, kind: "expiry" } });
        });
        L.reminderSchedule(state, D, new Date(), 7).forEach(function (e) {
          if (e.at <= now) return;
          const r = recipeById(e.recipeId); if (!r) return;
          if (e.kind === "also") {
            list.push({ id: e.id, title: t("notif.soonTitle"), body: t("notif.soonBody", { name: rName(r), meal: mealLabel(e.meal).toLowerCase(), time: L.formatTime(state.eatTimes[e.meal]), min: state.extraReminders[e.meal] }), schedule: { at: e.at, allowWhileIdle: true }, extra: { key: e.key, meal: e.meal, kind: e.kind } });
          } else {
            list.push({ id: e.id, title: t("notif.startTitle"), body: t("notif.startBody", { name: rName(r), meal: mealLabel(e.meal).toLowerCase(), time: L.formatTime(state.eatTimes[e.meal]), setup: state.setupMinutes }), schedule: { at: e.at, allowWhileIdle: true }, extra: { key: e.key, meal: e.meal, kind: e.kind } });
          }
        });
        if (list.length) await plug.schedule({ notifications: list });
      }
    } catch (err) { /* The OS schedule is best effort: the in-app Coming up list still stands, and the next save rebuilds. */ }
    finally { clearTimeout(busyWatchdog); notifReschedBusy = false; }
  }
  function queueNotifReschedule() {
    if (!nativeNotifPlugin()) return;
    if (notifReschedTimer) clearTimeout(notifReschedTimer);
    notifReschedTimer = setTimeout(function () { notifReschedTimer = null; rescheduleNative(); }, 250);
  }
  async function turnOnNotifications() {
    /* The native branch stands FIRST, so the browser cannot-show
       toast is unreachable inside the package: the ask goes to the
       OS, and the answer mirrors into state.notifications exactly as
       the web road's answer does (granted, denied, or the quiet
       default, which the status line reads as off). */
    const plug = nativeNotifPlugin();
    if (plug) {
      let perm = "default";
      try {
        const res = await plug.requestPermissions();
        perm = res && res.display === "granted" ? "granted" : res && res.display === "denied" ? "denied" : "default";
      } catch (e) { perm = "default"; }
      state.notifications = perm; save();
      if (perm === "granted") { toast(t("toast.notifOn")); rescheduleNative(); return true; }
      toast(t("toast.notifNotOn")); return false;
    }
    if (!("Notification" in window)) { toast(t("toast.browserNoNotif")); return false; }
    const perm = await Notification.requestPermission();
    state.notifications = perm; save();
    if (perm === "granted") { toast(t("toast.notifOn")); return true; }
    toast(t("toast.notifNotOn")); return false;
  }
  $("notifOn").addEventListener("click", async function () { await turnOnNotifications(); renderReminders(); });
  $("notifTest").addEventListener("click", async function () {
    if (state.notifications !== "granted") { const ok = await turnOnNotifications(); if (!ok) return; }
    /* On native the test is booked with the OS about 10 seconds out,
       so a packaged walk can watch it land like a real reminder. */
    const plug = nativeNotifPlugin();
    if (plug) {
      try { await plug.schedule({ notifications: [{ id: NOTIF_TEST_ID, title: t("notif.testTitle"), body: t("notif.testBody"), schedule: { at: new Date(Date.now() + 10000), allowWhileIdle: true } }] }); } catch (e) {}
      return;
    }
    new Notification(t("notif.testTitle"), { body: t("notif.testBody"), icon: "icon.svg" });
  });
  function mealStartEnd(dayDate, meal, recipe) {
    /* The web checker's moments read from the same pure schedule the
       native road books (L.reminderSchedule): a fixed mode meal
       starts at its saved clock time, a skipped meal earns no entry
       at all. The raw formula below only stands as the fallback for
       a meal the schedule does not carry. */
    const entries = L.reminderSchedule(state, D, dayDate, 1);
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].meal === meal && entries[i].kind === "start") return { start: entries[i].at, eat: entries[i].eatDate };
    }
    const ep = state.eatTimes[meal].split(":");
    const eat = new Date(dayDate); eat.setHours(Number(ep[0]), Number(ep[1]), 0, 0);
    const start = new Date(eat.getTime() - (recipe.minutes + state.setupMinutes) * 60000);
    return { start: start, eat: eat };
  }
  function checkReminders() {
    if (state.notifications !== "granted") return;
    /* Inside the package the OS schedule carries the reminders; the
       web checker must never fire a web Notification there. */
    if (nativeNotifPlugin()) return;
    if (!("Notification" in window)) return;
    const now = new Date();
    /* Offsets 0 and 1: a meal eaten just after midnight starts cooking the evening before,
       so tomorrows meals must be checked tonight too (QA bug 2, 13 Oct). Real date maths
       handles the midnight wrap that minute maths could not. */
    [0, 1].forEach(function (off) {
      const day = new Date(); day.setHours(12, 0, 0, 0); day.setDate(day.getDate() + off);
      const key = L.dateKey(day); ensureDay(key);
      ["breakfast", "lunch", "dinner"].forEach(function (meal) {
        const r = recipeById(state.plan[key] && state.plan[key][meal]); if (!r) return;
        /* A skipped meal never fires (build 5, spec (a)). */
        if (state.skips[key + "." + meal]) return;
        const se = mealStartEnd(day, meal, r);
        const sentKey = key + "." + meal;
        if (now >= se.start && now < se.eat && !state.sentReminders[sentKey]) {
          state.sentReminders[sentKey] = true; save();
          new Notification(t("notif.startTitle"), { body: t("notif.startBody", { name: rName(r), meal: mealLabel(meal).toLowerCase(), time: L.formatTime(state.eatTimes[meal]), setup: state.setupMinutes }), icon: "icon.svg" });
        }
        /* The second moment (app v35): armed only when the meal's also
           offset is above zero. It fires once, in its own window
           between the moment and the eating time, under its own sent
           key, so it can never swallow or repeat the start reminder. */
        const alsoMin = state.extraReminders[meal] || 0;
        if (alsoMin > 0) {
          const alsoAt = new Date(se.eat.getTime() - alsoMin * 60000);
          const alsoKey = sentKey + ".also";
          if (now >= alsoAt && now < se.eat && !state.sentReminders[alsoKey]) {
            state.sentReminders[alsoKey] = true; save();
            new Notification(t("notif.soonTitle"), { body: t("notif.soonBody", { name: rName(r), meal: mealLabel(meal).toLowerCase(), time: L.formatTime(state.eatTimes[meal]), min: alsoMin }), icon: "icon.svg" });
          }
        }
      });
    });
  }
  setInterval(checkReminders, 30000);
  /* App start (build 5): rebuild the OS schedule from the state as
     it stands, so a packaged install always holds the coming week. */
  rescheduleNative();

  /* Mina's tour (design section 3B; the v20 guide re-homed, app v33).
     One pop-up in the middle of the screen, the whole app visible
     behind it, walking the user around the app: each stop lands them
     on that stop's own view. Eight stops: 1 the name (account joiners
     who have no name yet; everyone else gets the welcome card), 2 the
     menu (the tour opens the sidebar), 3 food styles, 4 your table,
     5 your kitchen, 6 plan week one, 7 eating times, 8 done. The
     working stops keep the v20 guide's controls verbatim and still
     save at once. The chrome at every stop is the X, a quiet Skip
     tour, and Next: the X and Skip tour close the whole tour at that
     stop, and nothing about the tour blocks the app behind it. The
     Preferences Setup guide row reopens it where the user left off.
     Poses are the art of record only: WELCOME, POINT AND SHOW,
     CELEBRATE when the first plan lands, WAVE GOODBYE on the last
     stop. Speech bubbles are six words at most, and stop wording is
     the design's where the design gives it. */
  const GUIDE_POSES = { 1: "mina-welcome.svg", 2: "mina-point-show.svg", 3: "mina-point-show.svg", 4: "mina-point-show.svg", 5: "mina-point-show.svg", 6: "mina-point-show.svg", 7: "mina-point-show.svg" };
  const GUIDE_BUBBLES = { 1: t("tour.bubble1"), 2: t("tour.bubble2"), 3: t("tour.bubble3"), 4: t("tour.bubble4"), 5: t("tour.bubble5"), 6: t("tour.bubble6"), 7: t("tour.bubble7"), 8: t("tour.bubble8") };
  const TOUR_VIEWS = { 1: "calendar", 2: "calendar", 3: "prefs", 4: "family", 5: "groceries", 6: "calendar", 7: "prefs" };
  let guideStep = 1;
  let tourOpenedSidebar = false;
  /* The tour's step 1 memory for this page life (app v57, the
     tour cure — QA's build 19 retest, leg (e) arm 3, and the
     F-B19-1 bisect verdict's tour section): whether step 1 has
     been DRAWN in the welcome shape here, and whether the name
     stop has been DRAWN here. A landing's refresh re-renders
     only the standing step, so a walk that consumed step 1 in
     the welcome shape before the session landed carries no
     second chance from the refresh alone — these two flags
     are what the refresh's rewind (at MP_TOUR below) reads.
     A stop that drew and was sailed past blank sets the
     second flag too: it was asked, and the re-offer
     discipline owns any later asking, never a rewind. */
  let tourStep1WelcomeDrawn = false;
  let tourNameStopDrawn = false;
  /* The name stop shows only for an account session with no name
     known yet; the accounts layer answers (it owns the session).
     Guests and named users get the welcome card at stop 1 instead. */
  function tourNameVariant() {
    return !!(window.MP_TOUR_HOOK && window.MP_TOUR_HOOK.nameStopApplies && window.MP_TOUR_HOOK.nameStopApplies());
  }
  function guideSetStep(step) {
    guideStep = step;
    state.guideState = Object.assign({}, state.guideState, { status: "inProgress", step: step, v: 2 });
    save();
  }
  function openGuide(step) {
    guideStep = typeof step === "number" ? step : ((state.guideState && state.guideState.step) || 1);
    if (guideStep < 1) guideStep = 1;
    if (guideStep > 8) guideStep = 8;
    if (!state.guideState || state.guideState.status !== "done") {
      state.guideState = Object.assign({}, state.guideState, { status: state.guideState && state.guideState.status === "skipped" ? "skipped" : "inProgress", step: guideStep, v: 2 });
      save();
    }
    renderGuideStep();
    $("guideModal").classList.remove("hidden");
  }
  function closeGuide(finished) {
    $("guideModal").classList.add("hidden");
    if (tourOpenedSidebar) { tourOpenedSidebar = false; setSidebar(true, false); }
    if (finished) {
      state.guideState = Object.assign({}, state.guideState, { status: "done", step: 8, v: 2 });
      state.onboarded = true;
    } else if (state.guideState && state.guideState.status !== "done") {
      state.guideState = Object.assign({}, state.guideState, { status: "skipped", step: guideStep, v: 2 });
    }
    save();
  }
  function guideDots() {
    let out = "<span class='guideDots' aria-hidden='true'>";
    for (let i = 1; i <= 8; i++) out += "<span class='guideDot" + (i === guideStep ? " on" : "") + "'></span>";
    return out + "</span>";
  }
  function guideShell(pose, bubble, line, controlHtml, primaryLabel, title) {
    return "<div class='guideTop'><img class='minaPose' src='" + pose + "' alt='" + t("tour.minaAlt") + "'>" +
      (bubble ? "<div class='guideBubble'>" + esc(bubble) + "</div>" : "") +
      "<button class='roundBtn guideX' id='guideX' aria-label='" + t("tour.closeAria") + "'>" + icon("x") + "</button></div>" +
      (title ? "<h2 class='tourTitle'>" + esc(title) + "</h2>" : "") +
      (line ? "<p class='guideLine'>" + esc(line) + "</p>" : "") +
      "<div class='guideControl'>" + controlHtml + "</div>" +
      "<div class='guideFoot'>" + guideDots() +
      "<button class='linkBtn' id='guideSkip'>" + t("tour.skip") + "</button>" +
      "<span class='guideFootBtns'>" +
      (primaryLabel ? "<button class='primaryBtn' id='guideNext'>" + esc(primaryLabel) + "</button>" : "") + "</span></div>";
  }
  /* One Next for the whole tour. At the name stop, Next sails: a
     blank name simply moves on (skip semantics; the one re-offer on
     the next visit is the catch for a passed by name), and a typed
     name goes to the accounts layer's pending name path, which
     lands it on the profile's first write and on the sign in
     record, as the walk moves on. A typed name also saves on the
     Skip tour and X exits from the name stop (see saveTypedTourName):
     a typed name saves on ANY exit. */
  function tourNext() {
    if (guideStep === 1 && tourNameVariant()) {
      /* The variant is decided AT ADVANCE TIME (app v57, the
         tour cure): the card standing here may have been drawn
         as the welcome variant before the session landed (at
         INIT no session exists to ask the name of), while this
         live read says the name stop applies now — so when the
         drawn card carries no name field, the stop renders
         first and the walk waits on it, instead of the
         collection below sailing past a field that was never
         drawn. The drawn card is the witness (its own HTML),
         not a lookup: the stop is what renderGuideStep drew.
         The next Next collects through the standing branch,
         blank sails included. */
      const card = $("guideCard");
      if (!card || card.innerHTML.indexOf("tourName") === -1) { renderGuideStep(); return; }
      const input = $("tourName");
      const nm = input ? input.value.trim() : "";
      guideSetStep(2); renderGuideStep();
      if (nm && window.MP_TOUR_HOOK && window.MP_TOUR_HOOK.tourNameAnswered) window.MP_TOUR_HOOK.tourNameAnswered(nm);
      return;
    }
    if (guideStep >= 7) { renderGuideGoodbye(); return; }
    guideSetStep(guideStep + 1); renderGuideStep();
  }
  /* Leaving the name stop with a name typed but not yet saved
     still saves it: the field's contents are the user's answer,
     whichever exit they take. */
  function saveTypedTourName() {
    if (guideStep !== 1 || !tourNameVariant()) return;
    const input = $("tourName");
    const nm = input ? input.value.trim() : "";
    if (nm && window.MP_TOUR_HOOK && window.MP_TOUR_HOOK.tourNameAnswered) window.MP_TOUR_HOOK.tourNameAnswered(nm);
  }
  function renderGuideStep() {
    const card = $("guideCard");
    const step = guideStep;
    if (step >= 8) { renderGuideGoodbye(); return; }
    /* The walk: each stop lands the user on that stop's own view
       behind the pop-up, and the menu stop opens the sidebar in the
       nav law's own shapes. */
    const view = TOUR_VIEWS[step];
    if (view) switchView(view);
    if (step === 2 && state.ui && state.ui.sidebarHidden) { tourOpenedSidebar = true; setSidebar(false, false); }
    if (step === 1) {
      if (tourNameVariant()) {
        tourNameStopDrawn = true;
        /* Stop 1, the name: asked inside the tour, in Mina's own
           words, one field, one Next. The answer lands through the
           accounts layer's pending name path (see tourNext). */
        card.innerHTML = guideShell(GUIDE_POSES[1], "", "",
          "<div class='guideForm'><label>" + t("tour.yourName") + "<input id='tourName' type='text' autocomplete='name' placeholder='" + t("tour.yourName") + "'></label></div>", t("tour.next"), t("tour.nameTitle"));
        const ti = $("tourName");
        if (ti) setTimeout(function () { try { ti.focus(); } catch (e) {} }, 60);
      } else {
        tourStep1WelcomeDrawn = true;
        /* Stop 1, the welcome card (guests, and anyone whose name is
           already known): when the person's name is known, Mina
           greets them by it. The six word bubble cap bends only by
           the name itself. */
        const welcomeBubble = state.accountName ? t("tour.welcomeBubbleNamed", { name: state.accountName }) : GUIDE_BUBBLES[1];
        card.innerHTML = guideShell(GUIDE_POSES[1], welcomeBubble, t("tour.welcomeLine"), "", t("tour.start"));
      }
    } else if (step === 2) {
      card.innerHTML = guideShell(GUIDE_POSES[2], GUIDE_BUBBLES[2], t("tour.menuLine"), "", t("tour.next"));
    } else if (step === 3) {
      card.innerHTML = guideShell(GUIDE_POSES[3], GUIDE_BUBBLES[3], t("tour.stylesLine"), "<div class='chipRow' id='guideCuisines'></div>", t("tour.continue"));
      renderGuideCuisines();
    } else if (step === 4) {
      card.innerHTML = guideShell(GUIDE_POSES[4], GUIDE_BUBBLES[4], t("tour.tableLine"),
        "<div class='guideForm'><label>" + t("fam.name") + "<input id='gPName' type='text'></label>" +
        "<div><span class='fieldLabel'>" + t("fam.colour") + "</span><div id='gPColorChips' class='colorChips'></div></div>" +
        "<label>" + t("tour.tagsLabel") + "<input id='gPTags' type='text' placeholder='" + t("tour.tagsPh") + "'></label>" +
        "<label>" + t("tour.dislikesLabel") + "<input id='gPDislikes' type='text' placeholder='" + t("tour.dislikesPh") + "'></label>" +
        "<label>" + t("tour.allergiesLabel") + "<input id='gPAllergies' type='text' placeholder='" + t("tour.allergiesPh") + "'></label>" +
        "<div class='row'><button class='primaryBtn' id='gPAdd'>" + t("fam.addBtn") + "</button><span class='hint' id='gPMsg'></span></div></div>", t("tour.continue"));
      $("gPColorChips").innerHTML = colorChipsHtml(guideColor);
      bindColorChips($("gPColorChips"), function () { return guideColor; }, function (c) { guideColor = c; });
      $("gPAdd").addEventListener("click", function () {
        const name = $("gPName").value.trim(); if (!name) { $("gPMsg").textContent = " " + t("toast.addNameFirst"); return; }
        /* Same door as the Family form: a second profile is a Plus extra (v32). */
        if (state.family.length >= 1 && plusGate("family")) { $("gPMsg").textContent = t("tour.wholeTablePlus"); return; }
        addPerson({ name: name, color: guideColor, tags: $("gPTags").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean), dislikes: splitList($("gPDislikes").value), allergies: splitList($("gPAllergies").value) });
        $("gPName").value = ""; $("gPTags").value = ""; $("gPDislikes").value = ""; $("gPAllergies").value = "";
        $("gPMsg").textContent = t("tour.personSaved", { name: name });
        renderFamily();
      });
    } else if (step === 5) {
      card.innerHTML = guideShell(GUIDE_POSES[5], GUIDE_BUBBLES[5], t("tour.kitchenLine"),
        "<div class='guideForm'><label>" + t("groc.foodName") + "<input id='gGName' type='text' placeholder='" + t("tour.foodNamePh") + "'></label>" +
        "<div class='row'><label>" + t("groc.amount") + "<input id='gGQty' type='number' min='0' step='any' value='200'></label>" +
        "<label>" + t("groc.unit") + "<select id='gGUnit'><option>g</option><option>pcs</option><option>ml</option><option>kg</option></select></label>" +
        "<label>" + t("tour.keptIn") + "<select id='gGStorage'><option value='fridge'>" + t("storage.fridge") + "</option><option value='pantry'>" + t("storage.pantry") + "</option><option value='freezer'>" + t("storage.freezer") + "</option></select></label></div>" +
        "<div class='row'><button class='primaryBtn' id='gGAdd'>" + t("tour.addToKitchen") + "</button><span class='hint' id='gGMsg'></span></div>" +
        "<div class='row'><button class='pillBtn' id='gGPhoto'>" + icon("camera", "iconSm") + " " + t("tour.photoInstead") + "</button></div></div>", t("tour.continue"));
      $("gGAdd").addEventListener("click", function () {
        const name = $("gGName").value.trim().toLowerCase(); if (!name) { $("gGMsg").textContent = " " + t("toast.typeFoodName"); return; }
        /* Issue 9a: the same zero amount refusal as the grocery form. */
        if ($("gGQty").value !== "" && !(Number($("gGQty").value) > 0)) { $("gGMsg").textContent = " " + t("groc.needAmount"); return; }
        state.pantry.push({ id: "g" + Date.now(), name: name, qty: $("gGQty").value === "" ? 1 : Math.max(0, Number($("gGQty").value) || 0), unit: $("gGUnit").value, storage: $("gGStorage").value, added: todayKey(), shelfDays: L.shelfKnown(name, D) ? L.shelfDays(name, $("gGStorage").value, D) : undefined });
        save(); $("gGName").value = "";
        $("gGMsg").textContent = t("tour.itemSaved", { name: name });
        renderGroceries(); renderSide();
      });
      /* The fridge photo door: the guide pauses here, at this step, and the
         real photo card on the Groceries screen takes over. The guide
         reopens at this step from Preferences whenever the user wants. */
      $("gGPhoto").addEventListener("click", function () {
        state.guideState = Object.assign({}, state.guideState, { status: "inProgress", step: 5, v: 2 }); save();
        $("guideModal").classList.add("hidden");
        switchView("groceries");
        /* v60 (Polar M4): the scroll lands on the visible picker
           button; the hidden input has no box to scroll to. */
        $("fridgePhotoBtn").scrollIntoView({ block: "center" });
      });
    } else if (step === 6) {
      const planned = planHasMeals();
      card.innerHTML = guideShell(planned ? "mina-celebrate.svg" : GUIDE_POSES[6], planned ? t("tour.bubbleCelebrate") : GUIDE_BUBBLES[6],
        planned ? t("tour.planLinePlanned") : t("tour.planLineEmpty"),
        "<div class='row'><button class='primaryBtn' id='gPlan'>" + (planned ? t("tour.planAgain") : t("cal.planFirstWeek")) + "</button></div>", t("tour.continue"));
      $("gPlan").addEventListener("click", function () {
        planMyFirstWeek(); renderGuideStep(); renderCalendar(); renderSide();
      });
    } else if (step === 7) {
      card.innerHTML = guideShell(GUIDE_POSES[7], GUIDE_BUBBLES[7], t("tour.timesLine"),
        "<div class='guideForm'><div class='row'>" +
        "<label>" + t("meal.breakfast") + "<input id='gEatB' type='time' value='" + esc(state.eatTimes.breakfast) + "'></label>" +
        "<label>" + t("meal.lunch") + "<input id='gEatL' type='time' value='" + esc(state.eatTimes.lunch) + "'></label>" +
        "<label>" + t("meal.dinner") + "<input id='gEatD' type='time' value='" + esc(state.eatTimes.dinner) + "'></label></div>" +
        "<label>" + t("tour.setupLabel") + "<input id='gSetup' type='number' min='0' max='120' value='" + esc(state.setupMinutes) + "'></label>" +
        "<div class='row'><button class='primaryBtn' id='gNotif'>" + t("rem.turnOn") + "</button><span class='hint'>" + t("tour.notifHint") + "</span></div><div class='row'><span class='hint'>" + t("tour.importHintQ") + "</span><button class='pillBtn' id='guideImport'>" + t("tour.importBtn") + "</button></div></div>", t("tour.finish"));
      const saveTimes = function () {
        state.eatTimes = { breakfast: $("gEatB").value || "07:30", lunch: $("gEatL").value || "12:30", dinner: $("gEatD").value || "18:30" };
        state.setupMinutes = Math.max(0, Number($("gSetup").value) || 0);
        save(); renderSide();
      };
      ["gEatB", "gEatL", "gEatD", "gSetup"].forEach(function (id) { $(id).addEventListener("change", saveTimes); });
      $("gNotif").addEventListener("click", async function () { await turnOnNotifications(); });
      /* The guide offers the calendar import once, on its last step
         (IMPORT-DESIGN). Offered, never forced: it closes the guide and
         opens the same sheet as every other door. */
      $("guideImport").addEventListener("click", function () { closeGuide(false); openImport(); });
    }
    bindGuideChrome();
  }
  function renderGuideGoodbye() {
    /* Stop 8, done: the tour's last stop, on the calendar, with the
       wave. Showing it is what makes the tour done (design
       section 3B). */
    guideStep = 8;
    switchView("calendar");
    const card = $("guideCard");
    card.innerHTML = "<div class='guideTop'><img class='minaPose' src='mina-wave-goodbye.svg' alt='" + t("tour.minaWaveAlt") + "'>" +
      "<div class='guideBubble'>" + GUIDE_BUBBLES[8] + "</div>" +
      "<button class='roundBtn guideX' id='guideX' aria-label='" + t("tour.closeAria") + "'>" + icon("x") + "</button></div>" +
      "<p class='guideLine'>" + t("tour.goodbyeLine") + "</p>" +
      /* The soft sign in offer (design section 2) rides the last stop,
         and only when accounts are live: dormant builds never render
         it. account-sync.js handles the tap (it opens the door page). */
      (window.MP_ACCOUNTS_ENABLED ? "<div class='row'><button class='pillBtn' id='guideAccount'>" + t("tour.backupBtn") + "</button><span class='hint'>" + t("tour.backupHint") + "</span></div>" : "") +
      "<div class='guideFoot'>" + guideDots() + "<span class='guideFootBtns'><button class='primaryBtn' id='guideDone'>" + t("tour.done") + "</button></span></div>";
    $("guideDone").addEventListener("click", function () { closeGuide(true); render(); toast(t("toast.planReady")); });
    $("guideX").addEventListener("click", function () { closeGuide(true); render(); });
    state.guideState = Object.assign({}, state.guideState, { status: "done", step: 8, v: 2 });
    state.onboarded = true; save();
  }
  function bindGuideChrome() {
    /* The tour's exits (the v4 shape): the X and Skip tour both close
       the whole tour at the stop showing; Next walks on. From the
       name stop, a typed name saves on the way out, whichever exit
       is taken. */
    $("guideX").addEventListener("click", function () { saveTypedTourName(); closeGuide(false); });
    $("guideSkip").addEventListener("click", function () { saveTypedTourName(); closeGuide(false); });
    const next = $("guideNext");
    if (next) next.addEventListener("click", tourNext);
  }
  function renderGuideCuisines() {
    $("guideCuisines").innerHTML = D.CUISINES.map(function (c) { return chipHtml(c, state.preferences.indexOf(c) !== -1); }).join("");
    $("guideCuisines").querySelectorAll("[data-cuisine]").forEach(function (b) {
      b.addEventListener("click", function () {
        const c = b.getAttribute("data-cuisine");
        const i = state.preferences.indexOf(c);
        if (i === -1) state.preferences.push(c); else state.preferences.splice(i, 1);
        save(); renderGuideCuisines();
      });
    });
  }
  $("guideReopen").addEventListener("click", function () {
    openGuide(state.guideState && state.guideState.status === "done" ? 1 : undefined);
  });
  /* The tour's handles for the accounts layer. A sign in can land
     while the tour is already open (the app loads before the session
     resolves), which can change what stop 1 shows, so the accounts
     layer asks for a re-render through MP_TOUR.refresh. The name
     re-ask pop is the tour's name question on its own: when the name
     stop was closed unanswered, the accounts layer may offer it once
     more on a later visit (never the same visit, never a third
     time); the pop renders here, in the tour's own register, and its
     Save answers through the same hook as the tour's name stop. */
  window.MP_TOUR = {
    refresh: function () {
      if ($("guideModal").classList.contains("hidden")) return;
      /* The step-bound flip's other half (app v57, the tour
         cure): a landing that finds the guide already PAST
         step 1, with step 1 consumed in the welcome shape in
         this page life and the name stop never drawn, rewinds
         the walk to step 1 so the stop renders — the refresh
         re-renders only the standing step, so without the
         rewind the stop is lost for the whole run and only
         the weaker pop ever asks. A stop that drew and was
         sailed past (tourNameStopDrawn) is never re-armed
         here: the re-offer discipline owns that road. */
      if (guideStep > 1 && tourStep1WelcomeDrawn && !tourNameStopDrawn && tourNameVariant()) {
        guideSetStep(1);
        /* The accounts layer chooses between this stop and its
           quieter re-ask immediately after refresh. Make the rewound
           step visible to that decision before the local-save debounce. */
        flushLocalSave();
      }
      renderGuideStep();
    },
    /* The ask count is written HERE, by the state owner: the tour
       itself saves the guide state as it walks, so a write made on
       a parsed copy in the accounts layer would be overwritten by
       the tour's next save. */
    bumpNameAsks: function (n, visit) {
      state.guideState = Object.assign({}, state.guideState, { nameAsks: n, nameAskVisit: visit, v: 2 });
      save();
    },
    /* The answered name is written HERE, by the state owner, for
       the same reason (app v53, QA's build 15 nameflow bisect,
       verdict-mealprep-b15-nameflow-bisect.md): this object is
       the copy save() serialises over the live key on every
       save, so a name the accounts layer wrote into the stored
       copy alone was overwritten by the tour's own next save
       inside the push's debounce window, and the push composed
       from the clobbered copy and wrote nothing — the name
       never left the device. Carrying the name on this copy
       from the answering moment means no later save can write
       it away; the accounts layer routes the answer through
       here, as the ask count already rides. */
    setAccountName: function (nm) {
      state.accountName = nm;
      save();
    },
    /* A landing's state, adopted WHOLESALE (app v57, the
       F-B19-1 cure, clause 1 — QA's build 19 retest verdict,
       blob 63b8104f, Finding F-B19-1, and the F-B19-1 bisect
       verdict's root): the wholesale form of the routing the
       two fields above already ride. This object is the copy
       save() serialises over the live key on every save, so a
       sign in landing that wrote the stored copies alone left
       this copy stale — and the landing tail's own bookkeeping
       save (the name ask's bump, riding the write just below)
       then serialised the stale copy over the landing and
       pushed it against the fresh snapshot, deleting at the
       server what the landing had just repaired: a birth
       session's member, a return's whole account, a census
       trip's deleted day — one mechanism, three faces. Every
       landing that writes the live key now routes its state
       through here (the accounts layer calls it beside its
       setLive, guarded exactly as the fields above are
       guarded), so from the landing on, memory, live key,
       cache and snapshot agree, and no later save — the
       tail's or the person's — can compose from a pre-landing
       copy. The landed state is repaired through the same
       normaliseState a boot parses with, so the adopted copy
       is the copy a reload would have produced. Landings
       whose road reloads call it too: a reload can be parked
       by the delete flow deferral (the accounts layer's cure
       for the reload-on-adopt loss), and a parked session
       lives on in this page. */
    adoptLandedState: function (st) {
      if (!st || typeof st !== "object") return;
      state = normaliseState(JSON.parse(JSON.stringify(st)));
      save();
      render();
    }
  };
  /* The accounts layer's landing hook (app v50, QA build 12
     observation): views render on entry only, so when a sign in
     resolution lands without a reload, the layer calls this and
     the view standing open re-renders once, showing what landed
     instead of its pre-pull paint until the person navigates. */
  window.MP_RERENDER = function () { render(); };
  function ensureNameAsk() {
    let m = $("nameAskModal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "nameAskModal";
    m.className = "modal hidden";
    m.innerHTML = "<div class='modalCard small guideCard'>" +
      "<div class='guideTop'><img class='minaPose' src='mina-welcome.svg' alt='" + t("tour.minaAlt") + "'>" +
      "<div class='guideBubble'>" + GUIDE_BUBBLES[1] + "</div>" +
      "<button class='roundBtn guideX' id='nameAskX' aria-label='" + t("common.close") + "'>" + icon("x") + "</button></div>" +
      "<h2 class='tourTitle'>" + t("tour.nameTitle") + "</h2>" +
      "<div class='guideControl'><div class='guideForm'><label>" + t("tour.yourName") + "<input id='nameAskInput' type='text' autocomplete='name' placeholder='" + t("tour.yourName") + "'></label>" +
      "<p class='hint hidden' id='nameAskMsg'></p></div></div>" +
      "<div class='guideFoot'><span></span><span class='guideFootBtns'><button class='primaryBtn' id='nameAskSave'>" + t("tour.saveBtn") + "</button></span></div>" +
      "</div>";
    document.body.appendChild(m);
    $("nameAskX").addEventListener("click", function () { m.classList.add("hidden"); });
    m.addEventListener("click", function (e) { if (e.target === m) m.classList.add("hidden"); });
    $("nameAskSave").addEventListener("click", function () {
      const nm = $("nameAskInput").value.trim();
      /* A blank Save closes quietly: no stop line, no message. The
         ask was the offer; passing it by is a complete answer. */
      m.classList.add("hidden");
      if (nm && window.MP_TOUR_HOOK && window.MP_TOUR_HOOK.tourNameAnswered) window.MP_TOUR_HOOK.tourNameAnswered(nm);
    });
    return m;
  }
  window.MP_NAME_ASK = {
    show: function () {
      const m = ensureNameAsk();
      const msg = $("nameAskMsg"); if (msg) msg.classList.add("hidden");
      const input = $("nameAskInput"); if (input) input.value = "";
      m.classList.remove("hidden");
      if (input) setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    },
    hide: function () { const m = $("nameAskModal"); if (m) m.classList.add("hidden"); }
  };
  $("confirmYes").addEventListener("click", function () {
    const fn = confirmAction; confirmAction = null;
    $("confirmModal").classList.add("hidden");
    if (fn) fn();
  });
  $("confirmNo").addEventListener("click", function () { confirmAction = null; $("confirmModal").classList.add("hidden"); });
  $("confirmModal").addEventListener("click", function (e) { if (e.target === $("confirmModal")) { confirmAction = null; $("confirmModal").classList.add("hidden"); } });


  /* Bring my calendar in (shared module: calendar-import.js and
     IMPORT-DESIGN.md). One button on the calendar, one sheet, counts on
     the result line. The module is handed only this user's own space:
     their events slice for dedupe and their own registry. Imported
     events land in state.events, never in the meal plan. Read only
     against the source: nothing ever writes back to the old calendar.
     Demo sessions: the entry points do not exist (the guard below),
     exactly as the design fences it. */
  const DEMO_SESSION = /[?&]demo=1\b/.test(location.search);
  /* The guide lines are app copy and route through the language
     table (v34); the source labels are registry data (the names of
     the source calendars) and stay as data. */
  function importGuideText(src) { return t("import.guide." + src); }
  const IMPORT_LABELS = { google: "Google Calendar", apple: "Apple / iCloud", outlook: "Outlook", file: "a calendar file" };
  let importSource = "google";
  function openImport() { if (DEMO_SESSION) return; $("importResult").textContent = ""; $("importSheet").classList.remove("hidden"); }
  function closeImport() { $("importSheet").classList.add("hidden"); }
  /* shapeToEvent is Meal Prep's shapeToTask: the module's shape becomes
     one of our event records. Notes and location stay as their own
     fields and render in the day view, where the user can see them. */
  function shapeToEvent(s) {
    return { id: "imp." + Date.now() + "." + Math.floor(Math.random() * 1e6), title: s.title, date: s.date, time: s.time, durationMin: s.durationMin, notes: s.notes || "", location: s.location || "", repeat: s.repeat || null, source: "import", importUid: s.importUid, importKey: s.importKey };
  }
  function runImport(text, label) {
    const parsed = window.CI.parseICS(text);
    if (parsed.error || !parsed.events.length) { $("importResult").textContent = t("import.notCalendar"); return; }
    /* Meal Prep has no repeat model, so the module is told to expand
       every series into dated instances inside the window (fence 8):
       nothing is ever promised as a repeat this app cannot keep. */
    const plan = window.CI.planImport(parsed, state.events, { sourceLabel: label, repeatModel: "none" });
    /* applyImport writes a tasks list and the registry. Meal Prep hands
       it a collector array for the records and our own registry array,
       then commits through our own save, as the design describes. */
    const host = { tasks: [], imports: state.imports };
    const res = window.CI.applyImport(host, plan, label, shapeToEvent);
    state.events = state.events.concat(host.tasks);
    state.imports = host.imports;
    save(); renderCalendar(); renderSide();
    const bits = [t(res.added === 1 ? "import.broughtIn1" : "import.broughtInN", { n: res.added })];
    if (res.dupes) bits.push(t("import.alreadyHere", { n: res.dupes }));
    if (res.skipped) bits.push(t("import.couldNotRead", { n: res.skipped }));
    $("importResult").textContent = bits.join(" · ") + ".";
    toast(res.added ? t("toast.calendarIn") : t("toast.nothingNew"));
  }
  if (DEMO_SESSION) { $("importBtn").hidden = true; $("importOpen2").hidden = true; }
  $("importBtn").addEventListener("click", openImport);
  $("importOpen2").addEventListener("click", openImport);
  $("importClose").addEventListener("click", closeImport);
  $("importSheet").addEventListener("click", function (e) { if (e.target === $("importSheet")) closeImport(); });
  document.querySelectorAll(".import-src").forEach(function (b) {
    b.addEventListener("click", function () {
      importSource = b.getAttribute("data-src");
      document.querySelectorAll(".import-src").forEach(function (x) { x.classList.toggle("on", x === b); });
      $("importGuide").textContent = importGuideText(importSource);
    });
  });
  $("importGo").addEventListener("click", function () {
    const url = $("importUrl").value.trim();
    if (!url) { $("importResult").textContent = t("import.pasteFirst"); return; }
    $("importResult").textContent = t("import.fetching");
    fetch(url).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.text(); })
      .then(function (txt) { runImport(txt, IMPORT_LABELS[importSource]); })
      .catch(function () { $("importResult").textContent = t("import.fetchFail"); });
  });
  $("importFileBtn").addEventListener("click", function () { $("importFile").click(); });
  $("importFile").addEventListener("change", function () {
    const f = $("importFile").files && $("importFile").files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = function () { runImport(String(rd.result || ""), importSource === "file" ? t("import.label.file") : IMPORT_LABELS[importSource]); };
    rd.onerror = function () { $("importResult").textContent = t("import.fileFail"); };
    rd.readAsText(f);
    $("importFile").value = "";
  });

  /* Init */
  (function init() {
    const g = $("gAdded"); const now = new Date();
    g.value = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    ensureRange(todayKey(), 7);
    applySidebar();
    applyBackground();
    renderNav();
    render();
    checkReminders();
    /* The guide opens uninvited only on a genuine first run (guideState
       notStarted). A guide the user began and left, or closed early, stays
       closed until the Preferences Setup guide row opens it again at the
       saved step. It never blocks the app behind it. */
    if (state.guideState && state.guideState.status === "notStarted") openGuide(state.guideState.step);
    if ("serviceWorker" in navigator) { navigator.serviceWorker.register("service-worker.js").catch(function () {}); }
  })();
})();
