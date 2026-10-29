/* Meal Prep core logic. Pure functions, tested by tests/run-tests.mjs */
(function (global) {
  "use strict";
  function dataRef() {
    if (typeof module !== "undefined" && module.exports && typeof require !== "undefined") {
      try { return require("./data-node.js"); } catch (e) { return null; }
    }
    return global.MP_DATA;
  }
  function shelfLookup(name, DATA) {
    const d = DATA || dataRef();
    const n = String(name || "").toLowerCase();
    let best = null;
    d.SHELF.forEach(function (s) {
      if (s.key !== "default" && n.indexOf(s.key) !== -1) {
        if (!best || s.key.length > best.key.length) best = s;
      }
    });
    return best || d.SHELF[d.SHELF.length - 1];
  }
  /* A food has a guide date only when the shelf table truly knows
     it (29 Oct, item 11 honesty, carried from the v63 fix): a name
     that only meets the silent default entry has no date the app
     may present as real. An item carrying its own shelfDays number
     is known by its own record, checked at the call site. */
  function shelfKnown(name, DATA) {
    const d = DATA || dataRef();
    const n = String(name || "").toLowerCase();
    return d.SHELF.some(function (s) { return s.key !== "default" && n.indexOf(s.key) !== -1; });
  }
  function shelfDays(name, storage, DATA) {
    const s = shelfLookup(name, DATA);
    const days = s[storage];
    return days && days > 0 ? days : (s.fridge || s.pantry || 5);
  }
  function expiryFor(item, DATA) {
    const added = new Date(String(item.added).replace(/\./g, "-") + "T12:00:00");
    const days = item.shelfDays || shelfDays(item.name, item.storage, DATA);
    const exp = new Date(added.getTime() + days * 86400000);
    return exp;
  }
  function daysLeft(item, today, DATA) {
    const t = new Date((today || new Date()).toISOString().slice(0, 10) + "T12:00:00");
    const exp = expiryFor(item, DATA);
    return Math.round((exp - t) / 86400000);
  }
  function sortByExpiry(items, today, DATA) {
    return items.slice().sort(function (a, b) { return daysLeft(a, today, DATA) - daysLeft(b, today, DATA); });
  }
  function norm(s) { return String(s || "").toLowerCase().trim(); }
  /* Issue 8 (Test filing, safety): a typed allergy word arrives the way
     people say it, plurals and all ("peanuts", "eggs", "tree nuts"),
     while the groups and ingredient names carry the stem. termForms
     widens a typed word to its spoken forms and never narrows it: the
     raw word always stays a keyword, and its singular stem joins it,
     so a natural word can no longer fall through every net. */
  function singularWord(w) {
    if (w.length > 3 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (/(oes|ches|shes|xes|zes|sses)$/.test(w)) return w.slice(0, -2);
    if (w.length > 1 && /s$/.test(w) && !/ss$/.test(w) && !/us$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function termForms(term) {
    const t = norm(term);
    const forms = [];
    const add = function (f) { if (f && forms.indexOf(f) === -1) forms.push(f); };
    add(t); add(singularWord(t));
    const toks = t.split(/\s+/);
    if (toks.length > 1) {
      add(toks.map(singularWord).join(" "));
      add(toks.slice(0, -1).concat([singularWord(toks[toks.length - 1])]).join(" "));
    }
    return forms;
  }
  function termKeywords(term, DATA) {
    const d = DATA || dataRef();
    const groups = d.ALLERGEN_GROUPS || {};
    const out = [];
    termForms(term).forEach(function (f) {
      if (out.indexOf(f) === -1) out.push(f);
      (groups[f] || []).forEach(function (g) { if (out.indexOf(g) === -1) out.push(g); });
    });
    return out;
  }
  function ingredientMatchesTerm(ingredientName, term, DATA) {
    const n = norm(ingredientName); const t = norm(term);
    if (!n || !t) return false;
    /* Peanut butter and coconut milk or cream carry no dairy, so a milk allergy must not fire on them. */
    if (t === "milk" && (/\b(coconut|almond|soy|oat|rice|cashew|hemp|pea) milk\b/.test(n) || n.indexOf("peanut butter") !== -1)) return false;
    /* Coconut is its own food in this app (the dairy swaps lean on it),
       so a nut word must not fire on it either, the same precision. */
    if ((t === "nut" || t === "nuts" || t === "tree nut" || t === "tree nuts") && n.indexOf("coconut") !== -1) return false;
    /* Forward: a keyword inside the ingredient name (the group members'
       job). Reverse: the ingredient name inside the typed word itself,
       for a longer typed word over a shorter name ("eggs" over "egg"),
       and never inside a group member, or "butter" would slip in
       through "peanut butter" (Issue 8 matrix catch). */
    return termKeywords(term, DATA).some(function (k) { return n.indexOf(k) !== -1; })
      || termForms(term).some(function (f) { return f.indexOf(n) !== -1; });
  }
  function personConflicts(recipe, person, DATA) {
    const bad = (person.dislikes || []).concat(person.allergies || []).map(norm).filter(Boolean);
    const hits = [];
    recipe.ingredients.forEach(function (i) {
      bad.forEach(function (b) {
        if (ingredientMatchesTerm(i.name, b, DATA)) {
          if (hits.indexOf(i.name) === -1) hits.push(i.name);
        }
      });
    });
    return hits;
  }
  const DIET_BLOCKS = {
    vegetarian: ["beef", "lamb", "pork", "chicken", "turkey", "duck", "bacon", "ham", "salami", "sausage", "tuna", "salmon", "fish", "prawn", "shrimp", "crab", "squid", "anchovy", "meat", "gelatin"],
    pescatarian: ["beef", "lamb", "pork", "chicken", "turkey", "duck", "bacon", "ham", "salami", "sausage", "meat", "gelatin"],
    vegan: ["beef", "lamb", "pork", "chicken", "turkey", "duck", "bacon", "ham", "salami", "sausage", "tuna", "salmon", "fish", "prawn", "shrimp", "crab", "squid", "anchovy", "meat", "gelatin", "egg", "eggs", "milk", "yogurt", "cheese", "feta", "halloumi", "mozzarella", "parmesan", "cream", "butter", "honey", "mayonnaise", "sour cream"],
    dairyFree: ["milk", "yogurt", "cheese", "feta", "halloumi", "mozzarella", "parmesan", "cream", "butter", "sour cream"],
    glutenFree: ["wheat", "flour", "bread", "pasta", "spaghetti", "couscous", "barley", "rye", "tortilla", "pita", "soy sauce", "taco shells", "granola"],
    halalFriendly: ["pork", "ham", "bacon", "lard", "gelatin", "wine", "beer", "vodka", "rum", "brandy", "sake", "mirin", "cognac", "sherry", "marsala", "bourbon", "whisky", "whiskey", "liqueur"],
    kidFriendly: ["chili", "chilli", "cayenne", "jalapeno", "habanero", "sriracha", "wasabi", "harissa", "hot sauce", "pepper flakes", "chile"]
  };
  function cleanDiet(value) {
    return ["none", "vegetarian", "vegan", "pescatarian", "dairyFree", "glutenFree", "halalFriendly", "kidFriendly"].indexOf(value) !== -1 ? value : "none";
  }
  function cleanServings(value) {
    const n = Math.round(Number(value));
    return n >= 1 && n <= 12 ? n : 2;
  }
  function cleanCookMinutes(value) {
    const n = Number(value);
    return [0, 15, 20, 30, 45, 60, 90, 120, 180].indexOf(n) !== -1 ? n : 60;
  }
  /* Busy nights (29 Oct, item 6): the weekdays (0 Sunday to 6
     Saturday) the person marked busy, and the quick cap for those
     nights. The quick cap never reads 0: a busy night always has a
     real cap, defaulting to 30. */
  function cleanBusyNights(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    value.forEach(function (v) { const n = Number(v); if (Number.isInteger(n) && n >= 0 && n <= 6 && out.indexOf(n) === -1) out.push(n); });
    return out.sort(function (a, b) { return a - b; });
  }
  function cleanQuickMinutes(value) {
    const n = Number(value);
    return [15, 20, 30, 45, 60].indexOf(n) !== -1 ? n : 30;
  }
  function cleanRecipeIngredients(value) {
    if (!Array.isArray(value)) return [];
    const seen = Object.create(null), out = [];
    value.forEach(function (item) {
      const name = String(item == null ? "" : item).trim().slice(0, 80);
      const key = norm(name);
      if (name && !seen[key] && out.length < 50) { seen[key] = true; out.push(name); }
    });
    return out;
  }
  const INGREDIENT_SYNONYMS = [
    ["capsicum", "bell pepper", "sweet pepper"], ["aubergine", "eggplant"], ["courgette", "zucchini"],
    ["coriander", "cilantro"], ["chickpea", "chickpeas", "garbanzo", "garbanzo bean", "garbanzo beans"],
    ["spring onion", "green onion", "scallion"], ["prawn", "shrimp"], ["ground beef", "minced beef", "beef mince"],
    ["ground pork", "minced pork", "pork mince"], ["rocket", "arugula"], ["corn starch", "cornstarch"],
    ["powdered sugar", "icing sugar"]
  ];
  function matchFoodText(value) {
    return norm(value).replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean).map(singularWord).join(" ");
  }
  function matchFoodCanonical(value) {
    const text = matchFoodText(value);
    for (let i = 0; i < INGREDIENT_SYNONYMS.length; i++) {
      const group = INGREDIENT_SYNONYMS[i].map(matchFoodText);
      if (group.some(function (name) { return text === name || text.endsWith(" " + name) || text.indexOf(name + " ") === 0; })) return group[0];
    }
    return text;
  }
  function matchIngredientNames(recipeName, availableName) {
    const a = matchFoodCanonical(recipeName), b = matchFoodCanonical(availableName);
    if (!a || !b) return false;
    if (a === b || a.indexOf(" " + b + " ") !== -1 || b.indexOf(" " + a + " ") !== -1) return true;
    const stop = { fresh: true, dried: true, ground: true, chopped: true, minced: true, cooked: true, raw: true, large: true, small: true, medium: true, whole: true, finely: true, sliced: true, peeled: true, optional: true, extra: true, virgin: true, the: true, with: true, for: true };
    const left = a.split(/\s+/).filter(function (w) { return w.length > 2 && !stop[w]; });
    const right = b.split(/\s+/).filter(function (w) { return w.length > 2 && !stop[w]; });
    return left.some(function (w) { return right.indexOf(w) !== -1; });
  }
  function ingredientHasFoodWord(name, word) {
    const n = " " + norm(name).replace(/[^a-z0-9]+/g, " ").trim() + " ";
    const w = " " + norm(word).replace(/[^a-z0-9]+/g, " ").trim() + " ";
    if (word === "milk" && / (coconut|almond|soy|oat|rice|cashew|hemp|pea) milk /.test(n)) return false;
    return n.indexOf(w) !== -1;
  }
  function recipeDietConflicts(recipe, diet) {
    const choice = cleanDiet(diet);
    const blocked = DIET_BLOCKS[choice] || [];
    if (choice === "halalFriendly" && recipe.halalFriendly === false) return true;
    if (choice === "kidFriendly" && recipe.kidFriendly === false) return true;
    return (recipe.ingredients || []).some(function (ingredient) {
      return blocked.some(function (word) { return ingredientHasFoodWord(ingredient.name, word); });
    });
  }
  function recipeAllowed(recipe, ctx, DATA) {
    const c = ctx || {};
    if (!recipe || !Array.isArray(recipe.ingredients)) return false;
    const maxMinutes = Number(c.maxCookMinutes);
    if (isFinite(maxMinutes) && maxMinutes > 0 && Number(recipe.minutes || 0) > maxMinutes) return false;
    if ((c.family || []).some(function (person) { return personConflicts(recipe, person, DATA).length > 0; })) return false;
    return !recipeDietConflicts(recipe, c.diet);
  }
  function scaleRecipe(recipe, servings) {
    if (!recipe) return recipe;
    const target = cleanServings(servings);
    const base = Number(recipe.servings) > 0 ? Number(recipe.servings) : 2;
    const factor = target / base;
    return Object.assign({}, recipe, { servings: target, ingredients: (recipe.ingredients || []).map(function (ingredient) {
      const copy = Object.assign({}, ingredient);
      const qty = Number(ingredient.qty);
      if (ingredient.qty !== null && ingredient.qty !== undefined && ingredient.qty !== "" && isFinite(qty)) copy.qty = Math.round(qty * factor * 100) / 100;
      return copy;
    }) });
  }
  function swapFor(ingredientName, DATA) {
    const d = DATA || dataRef();
    const n = norm(ingredientName);
    for (let i = 0; i < d.SWAPS.length; i++) {
      if (n.indexOf(d.SWAPS[i].match) !== -1) return d.SWAPS[i].swap;
    }
    return "leaving it out";
  }
  function adaptations(recipe, family, DATA) {
    const out = [];
    (family || []).forEach(function (p) {
      const hits = personConflicts(recipe, p, DATA);
      hits.forEach(function (h) {
        let swap = swapFor(h, DATA);
        if (swap === "leaving it out") {
          const terms = (p.dislikes || []).concat(p.allergies || []);
          for (let ti = 0; ti < terms.length; ti++) {
            if (ingredientMatchesTerm(h, terms[ti], DATA)) { const ts = swapFor(terms[ti], DATA); if (ts !== "leaving it out") { swap = ts; break; } }
          }
        }
        out.push({ person: p.name, ingredient: h, swap: swap, allergy: (p.allergies || []).some(function (a) { return ingredientMatchesTerm(h, a, DATA); }) });
      });
    });
    return out;
  }
  /* Expiring first is a hard tier, not a bonus (app v35, item 20; her
     founding words: recipes get made from the food that goes bad
     sooner "first, before all the others"). While a use first food
     has no home yet in the plan being built, a recipe that uses it
     carries the tier step on its score, so it sorts ahead of every
     recipe that does not, whatever the cuisine match says. Once a
     food is covered (a picked recipe already uses it), the step
     lifts for that food and the ordinary ordering resumes, so the
     week's variety survives: first means first, not only. Inside a
     tier the old ordering stands untouched: cuisine matches, the per
     ingredient bonus and the variety penalties still decide between
     recipes of the same tier. The step is sized to dominate any in
     build differential: the variety penalty is 22 per earlier use
     inside one build plus 40 for a recent pick, and a build spans at
     most a year of days, so the widest possible gap stays under the
     step with room to spare. */
  const EXPIRING_TIER = 10000;
  function recipeUsesExpiring(recipe, expiring, covered) {
    const skip = (covered || []).map(norm);
    const list = (expiring || []).map(norm).filter(function (e) { return skip.indexOf(e) === -1; });
    return recipe.ingredients.some(function (i) {
      return list.some(function (e) { return norm(i.name).indexOf(e) !== -1 || e.indexOf(norm(i.name)) !== -1; });
    });
  }
  function recipeScore(recipe, ctx) {
    let score = 0;
    const c = ctx || {};
    const prefs = (c.preferences || []).map(norm);
    (recipe.cuisines || []).forEach(function (cuisine) { if (prefs.indexOf(norm(cuisine)) !== -1) score += 25; });
    const expiring = (c.expiringNames || []).map(norm);
    const pantry = (c.pantryNames || []).map(norm);
    (recipe.ingredients || []).forEach(function (ingredient) {
      expiring.forEach(function (e) { if (norm(ingredient.name).indexOf(e) !== -1 || e.indexOf(norm(ingredient.name)) !== -1) score += 12; });
      if (pantry.some(function (p) { return p && (norm(ingredient.name).indexOf(p) !== -1 || p.indexOf(norm(ingredient.name)) !== -1); })) score += 5;
    });
    if (recipeUsesExpiring(recipe, expiring, c.coveredExpiring)) score += EXPIRING_TIER;
    const used = (c.usedCounts || {})[recipe.id] || 0;
    score -= used * 22;
    if (Number(c.defaultServings) > 0) score -= Math.abs((Number(recipe.servings) || 2) - Number(c.defaultServings)) * 2;
    if ((c.recentIds || []).indexOf(recipe.id) !== -1) score -= 40;
    return score;
  }
  function recipeMatch(recipe, available) {
    const foods = cleanRecipeIngredients(available);
    const matched = [], missing = [];
    (recipe && recipe.ingredients || []).forEach(function (ingredient) {
      const found = foods.some(function (food) { return matchIngredientNames(ingredient.name, food); });
      if (found) matched.push(ingredient.name); else missing.push(ingredient.name);
    });
    return { matched: matched, missing: missing, usedCount: matched.length, needCount: matched.length + missing.length, availableCount: foods.length };
  }
  function rankRecipes(recipes, ctx, DATA) {
    const c = ctx || {};
    const available = cleanRecipeIngredients(c.matchIngredients !== undefined ? c.matchIngredients : c.pantryNames);
    const scoringCtx = Object.assign({}, c, { pantryNames: available });
    return (recipes || []).filter(function (recipe) { return recipeAllowed(recipe, c, DATA); }).map(function (recipe) {
      const match = recipeMatch(recipe, available);
      const ratio = match.needCount ? match.usedCount / match.needCount : 0;
      const score = recipeScore(recipe, scoringCtx) + match.usedCount * 80 + ratio * 40 - match.missing.length * 4;
      return { recipe: recipe, match: match, score: score };
    }).sort(function (a, b) {
      return b.score - a.score || b.match.usedCount - a.match.usedCount || a.match.missing.length - b.match.missing.length || String(a.recipe.name).localeCompare(String(b.recipe.name));
    });
  }
  function pickRecipe(meal, ctx, DATA) {
    const d = DATA || dataRef();
    const c = ctx || {};
    const pool = d.RECIPES.filter(function (r) { return r.meal === meal; });
    const custom = (c.customRecipes || []).filter(function (r) { return r.meal === meal; });
    const all = pool.concat(custom).filter(function (recipe) { return recipeAllowed(recipe, c, d); });
    let best = null, bestScore = -Infinity;
    all.forEach(function (r) {
      const s = recipeScore(r, c) + Math.random() * 15;
      if (s > bestScore) { bestScore = s; best = r; }
    });
    return best;
  }
  function dateKey(date) {
    const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), dd = String(date.getDate()).padStart(2, "0");
    return y + "." + m + "." + dd;
  }
  function parseKey(key) { const p = key.split("."); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12); }
  /* Busy nights (29 Oct proposal, item 6): on a weekday the person
     marked busy, the planner's cook time cap tightens to the quick
     cap, so only fast meals land there. Any other day the context
     passes through untouched. A global cap, when set, still wins
     when it is the tighter of the two. */
  function planCtxForDay(ctx, key) {
    const c = ctx || {};
    const busy = Array.isArray(c.busyNights) ? c.busyNights : [];
    if (!busy.length) return c;
    if (busy.indexOf(parseKey(key).getDay()) === -1) return c;
    const quick = Number(c.quickMinutes) > 0 ? Number(c.quickMinutes) : 30;
    const global = Number(c.maxCookMinutes) > 0 ? Number(c.maxCookMinutes) : 0;
    const cap = global > 0 ? Math.min(global, quick) : quick;
    return Object.assign({}, c, { maxCookMinutes: cap });
  }
  function buildPlan(startKey, numDays, ctx, DATA) {
    const plan = {};
    const recent = [];
    const usedCounts = {};
    /* The use first coverage for this build (app v35): a food leaves
       the top tier the moment a picked recipe gives it a home. */
    const coveredExpiring = [];
    for (let i = 0; i < numDays; i++) {
      const dt = parseKey(startKey); dt.setDate(dt.getDate() + i);
      const key = dateKey(dt);
      plan[key] = {};
      const dayCtx = planCtxForDay(ctx, key);
      ["breakfast", "lunch", "dinner"].forEach(function (meal) {
        const r = pickRecipe(meal, Object.assign({}, dayCtx, { recentIds: recent.slice(-42), usedCounts: usedCounts, coveredExpiring: coveredExpiring }), DATA);
        if (r) {
          plan[key][meal] = r.id; recent.push(r.id); usedCounts[r.id] = (usedCounts[r.id] || 0) + 1;
          (ctx.expiringNames || []).forEach(function (e) {
            if (coveredExpiring.indexOf(norm(e)) === -1 && recipeUsesExpiring(r, [e])) coveredExpiring.push(norm(e));
          });
        }
      });
    }
    return plan;
  }
  function reminderTime(eatTime, cookMinutes, setupMinutes) {
    const parts = eatTime.split(":");
    let total = Number(parts[0]) * 60 + Number(parts[1]) - Number(cookMinutes) - Number(setupMinutes);
    if (total < 0) total += 1440;
    const h = Math.floor(total / 60), m = total % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }
  /* The second, optional reminder moment (app v35, item 26): a per
     meal offset in minutes before the eating time. Off (0, missing or
     a bad shape) earns no moment at all, so an unarmed meal behaves
     exactly as it always has. The start cooking reminder above is the
     default and never moves. */
  function extraReminderTime(eatTime, offsetMinutes) {
    const off = Number(offsetMinutes);
    if (!isFinite(off) || off <= 0) return null;
    return reminderTime(eatTime, Math.floor(off), 0);
  }
  function formatTime(t) {
    const p = t.split(":"); let h = Number(p[0]); const m = p[1];
    const suffix = h >= 12 ? "pm" : "am"; h = h % 12; if (h === 0) h = 12;
    return h + ":" + m + " " + suffix;
  }
  /* Meal skips (build 5, the reminders spec (a)): state.skips maps
     "<day>.<meal>" to true. A skipped meal STAYS in the plan and in
     the grocery list; only its reminder silences. The map is repaired
     like every other field: only keys shaped like a real day and meal
     with a truthy value survive, coerced to true; an absent or wrong
     shaped map repairs to {}. Nothing else about the state is read. */
  var SKIP_KEY_RE = /^\d{4}\.\d{2}\.\d{2}\.(breakfast|lunch|dinner)$/;
  function cleanSkips(x) {
    const out = {};
    if (!x || typeof x !== "object" || Array.isArray(x)) return out;
    Object.keys(x).forEach(function (k) { if (SKIP_KEY_RE.test(k) && x[k]) out[k] = true; });
    return out;
  }
  /* The per meal reminder mode (build 5, spec (c)): "cook" fires at
     the eating time minus the dish's cook time minus the setup time;
     "fixed" fires at the meal's own saved clock time every day. Only
     the exact word "fixed" opts in; anything else repairs to "cook",
     so an old or wrong shaped state keeps the shipped behaviour. */
  function cleanReminderMode(x) {
    const out = { breakfast: "cook", lunch: "cook", dinner: "cook" };
    if (!x || typeof x !== "object" || Array.isArray(x)) return out;
    ["breakfast", "lunch", "dinner"].forEach(function (m) { if (x[m] === "fixed") out[m] = "fixed"; });
    return out;
  }
  /* The saved fixed clock times, one per meal ("HH:MM" or "" when the
     user has not saved one). A bad shape repairs to "", which the
     schedule reads as "fall back to the cook maths", never a crash. */
  function cleanReminderTimes(x) {
    const out = { breakfast: "", lunch: "", dinner: "" };
    if (!x || typeof x !== "object" || Array.isArray(x)) return out;
    ["breakfast", "lunch", "dinner"].forEach(function (m) {
      if (typeof x[m] === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(x[m])) out[m] = x[m];
    });
    return out;
  }
  function timeOnDay(day, hhmm) {
    const p = String(hhmm || "").split(":");
    const d = new Date(day);
    d.setHours(Number(p[0]) || 0, Number(p[1]) || 0, 0, 0);
    return d;
  }
  function hhmmOf(d) {
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  /* The one reminder schedule (build 5). Pure: given the state, the
     data module and a start date, it lists every reminder moment for
     the next `days` days — one "start" entry per planned, non-skipped
     meal, plus one "also" entry per meal whose second reminder offset
     is armed. The native scheduler books these moments with the OS;
     the web checker fires them from the same list, so the two roads
     can never disagree about the maths. Cook mode fires at eat minus
     (cook + setup) — the shipped formula, via reminderTime's
     arithmetic on real Dates. Fixed mode fires at the meal's saved
     clock time that day instead; the also moment always rides the
     eating time. Each entry carries a deterministic integer id from
     (day, meal, kind), so a reschedule replaces its own notification
     and never a neighbour's. The test notification id lives outside
     this space (app.js NOTIF_TEST_ID). */
  function reminderSchedule(state, DATA, fromDate, days) {
    const out = [];
    if (!state || typeof state !== "object") return out;
    const recipes = ((DATA && DATA.RECIPES) || []).concat(Array.isArray(state.customRecipes) ? state.customRecipes : []);
    const byId = {};
    recipes.forEach(function (r) { if (r && typeof r.id === "string") byId[r.id] = r; });
    const plan = (state.plan && typeof state.plan === "object") ? state.plan : {};
    const skips = (state.skips && typeof state.skips === "object") ? state.skips : {};
    const modes = (state.reminderMode && typeof state.reminderMode === "object") ? state.reminderMode : {};
    const fixedTimes = (state.reminderTimes && typeof state.reminderTimes === "object") ? state.reminderTimes : {};
    const base = new Date(fromDate); base.setHours(12, 0, 0, 0);
    const n = Math.max(0, Math.floor(Number(days)) || 0);
    for (let i = 0; i < n; i++) {
      const day = new Date(base); day.setDate(base.getDate() + i);
      const key = dateKey(day);
      const planDay = plan[key]; if (!planDay) continue;
      const dayId = Math.round(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86400000) * 100;
      ["breakfast", "lunch", "dinner"].forEach(function (meal, mi) {
        const rid = planDay[meal]; if (typeof rid !== "string" || !rid) return;
        if (skips[key + "." + meal]) return;
        const r = byId[rid]; if (!r) return;
        const eatTime = (state.eatTimes && state.eatTimes[meal]) || "12:00";
        const eat = timeOnDay(day, eatTime);
        const fixed = modes[meal] === "fixed" && typeof fixedTimes[meal] === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(fixedTimes[meal]) ? fixedTimes[meal] : "";
        const at = fixed ? timeOnDay(day, fixed) : new Date(eat.getTime() - ((Number(r.minutes) || 0) + (Number(state.setupMinutes) || 0)) * 60000);
        out.push({ id: dayId + mi * 10, key: key, date: day, meal: meal, kind: "start", recipeId: rid, at: at, eatDate: eat, eat: eatTime, start: hhmmOf(at) });
        const alsoMin = Math.floor(Number(state.extraReminders && state.extraReminders[meal]) || 0);
        if (alsoMin > 0) {
          const alsoAt = new Date(eat.getTime() - alsoMin * 60000);
          out.push({ id: dayId + mi * 10 + 1, key: key, date: day, meal: meal, kind: "also", recipeId: rid, at: alsoAt, eatDate: eat, eat: eatTime, start: hhmmOf(alsoAt), alsoMinutes: alsoMin });
        }
      });
    }
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  }
  /* The grocery list, split in two (the ruling of 18 Oct, build 8;
     amounts added 29 Oct, proposal item 9): what the pantry covers
     comes OFF the buy list. Where the pantry holds a known amount in
     the same unit, that amount is subtracted and only the shortfall
     rides the buy list, carrying haveQty so the row can say what is
     already at home. Where the amount is unknown or the unit differs,
     the cover stays whole, as in build 8: the maths never guesses.
     Covered items land in the atHome set with their full planned
     amount, shown in the Already at home strip. backOnList is the
     per list override (state.atHomeBack, keyed name|unit like
     doneItems and hiddenItems): a covered item the person put back
     rides the buy list again, amount intact. The aggregation itself
     (amounts summed per name and unit, aisle grouping, ordering) is
     unchanged, and each line now also names the recipes that need it
     (forRecipes, proposal item 8). */
  function buildGroceryList(plan, allRecipes, pantry, backOnList) {
    const need = {};
    Object.keys(plan || {}).forEach(function (day) {
      ["breakfast", "lunch", "dinner"].forEach(function (meal) {
        const id = plan[day][meal]; if (!id) return;
        const r = allRecipes.filter(function (x) { return x.id === id; })[0]; if (!r) return;
        r.ingredients.forEach(function (i) {
          const k = norm(i.name) + "|" + i.unit;
          if (!need[k]) need[k] = { name: i.name, qty: 0, unit: i.unit, category: i.category || "Other", forRecipes: [], forRecipeIds: [] };
          need[k].qty += Number(i.qty) || 0;
          if (need[k].forRecipes.indexOf(r.name) === -1) { need[k].forRecipes.push(r.name); need[k].forRecipeIds.push(r.id); }
        });
      });
    });
    const have = {};
    (pantry || []).forEach(function (p) { have[norm(p.name)] = p; });
    const back = backOnList || {};
    const buy = [], atHome = [];
    Object.keys(need).forEach(function (k) {
      const item = need[k];
      const stocked = have[norm(item.name)];
      item.haveIt = !!stocked;
      item.qty = Math.round(item.qty * 10) / 10;
      const putBack = !!back[item.name + "|" + item.unit];
      const haveQty = stocked && typeof stocked.qty === "number" && isFinite(stocked.qty) && stocked.qty > 0 && String(stocked.unit || "").toLowerCase() === String(item.unit || "").toLowerCase() ? stocked.qty : null;
      if (stocked && !putBack && haveQty !== null && haveQty >= item.qty) { item.haveQty = haveQty; atHome.push(item); }
      else if (stocked && !putBack && haveQty !== null) { item.haveQty = haveQty; item.qty = Math.round((item.qty - haveQty) * 10) / 10; buy.push(item); }
      else if (stocked && !putBack) atHome.push(item);
      else buy.push(item);
    });
    const byAisle = function (a, b) { return (a.category + a.name).localeCompare(b.category + b.name); };
    return { buy: buy.sort(byAisle), atHome: atHome.sort(byAisle) };
  }
  /* Mark cooked (29 Oct, item 12): the recipe's ingredients come off
     the pantry where the name matches, the unit matches, and an
     amount is known, the same honesty rule as the grocery cover.
     An item that reaches zero leaves the shelf. Returns the new
     pantry and the names that were used, so the app can say what
     happened in plain words. The input pantry is not mutated. */
  function applyCooked(pantry, recipe) {
    const out = (pantry || []).map(function (p) { return Object.assign({}, p); });
    const taken = [];
    (recipe && recipe.ingredients || []).forEach(function (ing) {
      const q = Number(ing.qty);
      if (ing.qty === null || ing.qty === undefined || ing.qty === "" || !isFinite(q) || q <= 0 || !ing.unit || ing.unit === "to taste") return;
      const ix = out.findIndex(function (p) { return typeof p.qty === "number" && isFinite(p.qty) && String(p.unit || "").toLowerCase() === String(ing.unit).toLowerCase() && matchIngredientNames(ing.name, p.name); });
      if (ix === -1) return;
      const item = out[ix];
      const left = Math.round((item.qty - q) * 10) / 10;
      if (taken.indexOf(item.name) === -1) taken.push(item.name);
      if (left <= 0) out.splice(ix, 1); else item.qty = left;
    });
    return { pantry: out, taken: taken };
  }
  /* Expiry nudges (29 Oct, item 14): one entry per food, at 9 in the
     morning on the day before its best until date, inside the next
     days window. At most three foods share a morning, soonest first,
     so the nudge stays kind. Ids live at dayId + 50 and up, clear of
     the meal reminder ids (dayId + 0, 1, 10, 11, 20, 21). */
  function expirySchedule(state, DATA, fromDate, days) {
    const out = [];
    if (!state || !Array.isArray(state.pantry)) return out;
    const from = new Date(fromDate); from.setHours(0, 0, 0, 0);
    const until = new Date(from.getTime() + Math.max(0, Math.floor(Number(days)) || 0) * 86400000);
    const byDay = {};
    state.pantry.forEach(function (item) {
      if (!item || !item.name) return;
      /* A nudge is a promise: foods with no known guide date (no
         recorded shelfDays and no shelf table match) never nudge,
         because their date would be invented. */
      if (typeof item.shelfDays !== "number" && !shelfKnown(item.name, DATA)) return;
      const exp = expiryFor(item, DATA); exp.setHours(12, 0, 0, 0);
      const noteDay = new Date(exp.getTime() - 86400000); noteDay.setHours(9, 0, 0, 0);
      if (noteDay < from || noteDay > until) return;
      const k = dateKey(noteDay);
      (byDay[k] = byDay[k] || []).push({ item: item, exp: exp, at: noteDay });
    });
    Object.keys(byDay).sort().forEach(function (k) {
      byDay[k].sort(function (a, b) { return a.exp - b.exp || String(a.item.name).localeCompare(String(b.item.name)); });
      const dayId = Math.round(Date.UTC(byDay[k][0].at.getFullYear(), byDay[k][0].at.getMonth(), byDay[k][0].at.getDate()) / 86400000) * 100;
      byDay[k].slice(0, 3).forEach(function (e, ix) {
        out.push({ id: dayId + 50 + ix, kind: "expiry", key: k, name: e.item.name, at: e.at, expiryKey: dateKey(e.exp) });
      });
    });
    return out.sort(function (a, b) { return a.at - b.at; });
  }
  function findRecipeByName(name, DATA, custom) {
    const d = DATA || dataRef();
    const n = norm(name);
    const all = d.RECIPES.concat(custom || []);
    /* A built in recipe is findable by its Spanish name too: data.js
       attaches a sound es field to each one, and both names go through
       the same norm and the same two passes, so the tolerance is
       identical in either language. A custom recipe carries no es
       field, so it keeps matching its own name only. */
    function namesOf(r) {
      const out = [r.name];
      if (r.es && typeof r.es.name === "string" && norm(r.es.name)) out.push(r.es.name);
      return out;
    }
    let exact = all.filter(function (r) { return namesOf(r).some(function (nm) { return norm(nm).indexOf(n) !== -1; }); })[0];
    if (exact) return exact;
    const words = n.split(/\s+/).filter(function (w) { return w.length > 2; });
    /* Form words describe the shape of a dish, not its identity, so they cannot carry a match on their own. */
    const FORM = ["soup", "salad", "wrap", "wraps", "bowl", "bowls", "and", "with", "the"];
    const keyWords = words.filter(function (w) { return FORM.indexOf(w) === -1; });
    let best = null, bestRatio = 0;
    all.forEach(function (r) {
      /* Each name is judged on its own words; a recipe never borrows
         words across its two names to fake a match. */
      namesOf(r).forEach(function (nm) {
        const hay = norm(nm);
        let matched = 0;
        keyWords.forEach(function (w) { if (hay.indexOf(w) !== -1) matched++; });
        const ratio = keyWords.length ? matched / keyWords.length : 0;
        if (ratio > bestRatio) { bestRatio = ratio; best = r; }
      });
    });
    return bestRatio >= 0.6 ? best : null;
  }
  /* --- Calories, from the USDA FoodData Central table in nutrition.js ---
     Unit constants: 1 tbsp counts as 15 g, 1 tsp as 5 g, 1 clove of garlic
     as 3 g. Piece weights (1 egg, 1 medium banana, 1 slice of bread and so
     on) live in the table as PIECE_G. 1 ml counts as 1 g for the liquids in
     these recipes (milk, coconut milk, vegetable stock, tomato passata,
     cream). A recipe with any ingredient missing from the table returns
     null, so the app shows no number rather than a partial fake. */
  function nutritionRef() {
    if (typeof module !== "undefined" && module.exports && typeof require !== "undefined") {
      try { return require("./nutrition-node.js"); } catch (e) { /* fall through */ }
    }
    return (typeof window !== "undefined" ? window : globalThis).MP_NUTRITION;
  }
  function ingredientGrams(ing, nutrition) {
    const q = Number(ing.qty) || 0;
    if (ing.unit === "g" || ing.unit === "ml") return q;
    if (ing.unit === "tbsp") return q * 15;
    if (ing.unit === "tsp") return q * 5;
    if (ing.unit === "cloves") return q * 3;
    if (ing.unit === "pcs" || ing.unit === "slices") {
      const w = nutrition.PIECE_G ? nutrition.PIECE_G[ing.name] : null;
      return (w === null || w === undefined) ? null : q * w;
    }
    return null;
  }
  function round5(x) { return Math.round(x / 5) * 5; }
  function recipeKcal(recipe, nutrition) {
    const n = nutrition || nutritionRef();
    if (!n || !n.KCAL100 || !recipe || !recipe.ingredients || !recipe.servings) return null;
    let total = 0;
    for (let i = 0; i < recipe.ingredients.length; i++) {
      const ing = recipe.ingredients[i];
      const per100 = n.KCAL100[ing.name];
      if (per100 === null || per100 === undefined) return null;
      const g = ingredientGrams(ing, n);
      if (g === null) return null;
      total += g / 100 * per100;
    }
    return round5(total / recipe.servings);
  }
  function servingKcal(grams, per100) { return round5(grams / 100 * per100); }
  function estimateRange(kcal) { return { low: round5(kcal * 0.7), high: round5(kcal * 1.3) }; }
  function photoKcal(className, nutrition) {
    const n = nutrition || nutritionRef();
    if (!n || !n.PHOTO_SERVINGS || !n.KCAL100) return null;
    const s = n.PHOTO_SERVINGS[className];
    if (!s) return null;
    const per100 = n.KCAL100[s.food];
    if (per100 === null || per100 === undefined) return null;
    const kcal = servingKcal(s.grams, per100);
    const r = estimateRange(kcal);
    return { food: s.food, label: s.label, grams: s.grams, kcal: kcal, low: r.low, high: r.high };
  }
  function fridgeKcal(name, nutrition) {
    const n = nutrition || nutritionRef();
    if (!n || !n.FRIDGE_SERVINGS || !n.KCAL100) return null;
    const s = n.FRIDGE_SERVINGS[name];
    if (!s) return null;
    const per100 = n.KCAL100[name];
    if (per100 === null || per100 === undefined) return null;
    const kcal = servingKcal(s.grams, per100);
    const r = estimateRange(kcal);
    return { food: name, label: s.label, grams: s.grams, kcal: kcal, low: r.low, high: r.high };
  }
  /* A recipe name may find an existing built-in or saved recipe. It must
     never fabricate ingredients or cooking steps for an unknown dish. */
  function makeRecipeFromName(name, DATA, custom) {
    return findRecipeByName(name, DATA, custom || []);
  }
  /* Navigation calm (14 Oct house law): the side menu is grouped by main area.
     Preferences is a footer row, not a group, so it is in no group here. */
  const NAV_GROUPS = [
    { id: "plan", label: "Plan", items: ["calendar", "recipes"] },
    { id: "kitchen", label: "Kitchen", items: ["groceries", "list", "photocal"] },
    { id: "people", label: "People", items: ["family", "reminders"] }
  ];
  function navGroupForView(view) {
    for (let i = 0; i < NAV_GROUPS.length; i++) if (NAV_GROUPS[i].items.indexOf(view) !== -1) return NAV_GROUPS[i].id;
    return null;
  }
  function cleanTucked(tucked) {
    if (!Array.isArray(tucked)) return [];
    const out = [];
    tucked.forEach(function (id) {
      if (NAV_GROUPS.some(function (g) { return g.id === id; }) && out.indexOf(id) === -1) out.push(id);
    });
    return out;
  }
  /* A group may be tucked away only when it is a real group, not already tucked,
     does not hold the page on screen, and is not the last group left in the menu. */
  function canTuckGroup(tucked, groupId, currentView) {
    const clean = cleanTucked(tucked);
    if (!NAV_GROUPS.some(function (g) { return g.id === groupId; })) return false;
    if (clean.indexOf(groupId) !== -1) return false;
    if (navGroupForView(currentView) === groupId) return false;
    const left = NAV_GROUPS.filter(function (g) { return clean.indexOf(g.id) === -1 && g.id !== groupId; });
    return left.length >= 1;
  }
  /* Law E backgrounds (the house standard section 5): the user picks the background,
     Brand, White, Black or their own photo. The choice and the photo live in
     settings and are repaired at load like every other field. A repair never
     drops a valid photo: the photo is the user's own data and only the user
     can replace or remove it. */
  const BG_KINDS = ["brand", "white", "black", "photo"];
  function cleanBackgroundKind(kind) {
    return BG_KINDS.indexOf(kind) !== -1 ? kind : "brand";
  }
  function cleanBackgroundPhoto(x) {
    return (typeof x === "string" && x.indexOf("data:image/") === 0) ? x : "";
  }
  /* The language choice (app v34): "auto" follows the device, "en"
     and "es" are the user's own picks. It lives in settings (user
     data, Law B) and is repaired here like the background, so a
     wrong shaped value falls back to "auto" and never breaks. */
  const LANG_CHOICES = ["auto", "en", "es"];
  function cleanLanguageChoice(choice) {
    return LANG_CHOICES.indexOf(choice) !== -1 ? choice : "auto";
  }
  function cleanBackgroundSettings(settings) {
    const s = (settings && typeof settings === "object" && !Array.isArray(settings)) ? settings : {};
    const bg = (s.background && typeof s.background === "object" && !Array.isArray(s.background)) ? s.background : {};
    return {
      background: {
        kind: cleanBackgroundKind(bg.kind),
        photoMode: bg.photoMode === "dark" ? "dark" : "light"
      },
      backgroundPhoto: cleanBackgroundPhoto(s.backgroundPhoto),
      language: cleanLanguageChoice(s.language)
    };
  }
  /* Family colours (QA F3, app v20): the colour a person wears carries their
     initial in white, and the initial is text, so every colour in the set
     passes 4.5 under a white initial (proven in
     brand-board/contrast-themes.py; the weakest pair is pinned there).
     The set is drawn from the approved board's world: Paprika family, Basil,
     deepened Turmeric, deepened Apricot, the Espresso family. The old berry
     pink #ec4899 (3.53 under white) is gone from the set for good. */
  const PERSON_COLORS = ["#B3401E", "#8C3217", "#4C7A3F", "#38602E", "#8A5E0B", "#9C4A1F", "#6F4A2F", "#33231C"];
  /* Colours the app shipped as defaults before the palette existed (the seed
     person's pink and the old form default sky) map to their new twins in
     the same spirit: the warm red family lands on Paprika, the old cool
     default lands on Basil. A colour outside this old set is the user's own
     pick and is left exactly as stored. */
  const OLD_PERSON_COLOR_MAP = { "#ec4899": "#B3401E", "#0ea5e9": "#4C7A3F" };
  function mapPersonColor(color) {
    if (typeof color !== "string") return color;
    const twin = OLD_PERSON_COLOR_MAP[color.toLowerCase()];
    return twin || color;
  }
  /* The setup guide (design section 3B): guideState lives on the saved state.
     Status starts at notStarted, becomes inProgress with the step while the
     user works, records skipped with the step it stopped at when closed
     early, and becomes done when the goodbye has shown. Repairs clamp,
     never drop.
     Upgraders stay silent (desk ruling, app v21): the guide is for
     genuinely new first runs only. A saved state that predates the guide
     but carries the user's own data (hasData), or a finished old welcome
     (onboarded), counts as pre-guide and repairs to done, so the guide
     never greets an established user uninvited. A guide the user already
     began (inProgress) or closed early (skipped) is their own and is kept
     exactly, step included; only a state with nothing in it and no begun
     guide starts at step 1. */
  const GUIDE_STATUSES = ["notStarted", "inProgress", "skipped", "done"];
  /* The tour map (app v33): the guide became Mina's tour, 8 stops.
     A state written by the old six step guide carries no v:2 marker;
     its step is translated onto the tour map (old step 2, food
     styles, is tour stop 3, and so on) so a guide in progress
     resumes on the matching stop, never starts over, never
     vanishes. A finished guide stays finished. The name ask
     bookkeeping rides along: nameAsks counts the name offers made
     and left unanswered (the tour's name stop, then one quiet
     re-offer on a later visit, then never again), nameAskVisit
     remembers which visit the last offer happened in. Repairs
     clamp, never drop. */
  const GUIDE_STEP_FROM_OLD = { 1: 1, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7 };
  function cleanGuideState(x, onboarded, hasData) {
    const obj = (x && typeof x === "object" && !Array.isArray(x)) ? x : null;
    const nameAsks = (obj && typeof obj.nameAsks === "number" && isFinite(obj.nameAsks)) ? Math.min(2, Math.max(0, Math.round(obj.nameAsks))) : 0;
    const nameAskVisit = (obj && typeof obj.nameAskVisit === "string") ? obj.nameAskVisit : "";
    let step = (obj && typeof obj.step === "number" && isFinite(obj.step)) ? Math.round(obj.step) : 1;
    const status = obj ? obj.status : undefined;
    if (status === "done") return { status: "done", step: 8, v: 2, nameAsks: nameAsks, nameAskVisit: nameAskVisit };
    if (status === "skipped" || status === "inProgress") {
      if (!obj || obj.v !== 2) step = GUIDE_STEP_FROM_OLD[Math.min(6, Math.max(1, step))] || 1;
      if (step < 1) step = 1;
      if (step > 8) step = 8;
      return { status: status, step: step, v: 2, nameAsks: nameAsks, nameAskVisit: nameAskVisit };
    }
    if (onboarded || hasData) return { status: "done", step: 8, v: 2, nameAsks: nameAsks, nameAskVisit: nameAskVisit };
    if (step < 1) step = 1;
    if (step > 8) step = 8;
    return { status: "notStarted", step: step, v: 2, nameAsks: nameAsks, nameAskVisit: nameAskVisit };
  }
  /* Does this saved state hold anything the user put there? A person, a
     pantry item, any planned meal, or a recipe of their own. Settings and
     organisation choices do not count: the question is only whether an
     established household already lives in the app. Pure, so the guide
     repair above and the unit tests can both hold it to account. */
  function stateHasUserData(s) {
    if (!s || typeof s !== "object") return false;
    if (Array.isArray(s.family) && s.family.length) return true;
    if (Array.isArray(s.pantry) && s.pantry.length) return true;
    if (Array.isArray(s.customRecipes) && s.customRecipes.length) return true;
    if (Array.isArray(s.favorites) && s.favorites.length) return true;
    if (s.plan && typeof s.plan === "object") {
      const keys = Object.keys(s.plan);
      for (let i = 0; i < keys.length; i++) {
        const day = s.plan[keys[i]];
        if (day && (day.breakfast || day.lunch || day.dinner)) return true;
      }
    }
    return false;
  }
  /* Empty start (design section 3A, app v20): a brand new state holds no
     seed household at all. Family, pantry and food styles start empty; the
     guide is what fills them. The eat times and setup minutes are neutral
     settings the app runs on (the familiar times), not seeded content. */
  function blankState() {
    return {
      onboarded: false, notifications: "off",
      preferences: [],
      diet: "none", maxCookMinutes: 60, defaultServings: 2,
      busyNights: [], quickMinutes: 30,
      cooked: {}, leftovers: {},
      recipeIngredients: [], recipeIngredientsManual: false, photoTrialUsed: false,
      eatTimes: { breakfast: "07:30", lunch: "12:30", dinner: "18:30" },
      setupMinutes: 5,
      extraReminders: { breakfast: 0, lunch: 0, dinner: 0 },
      skips: {},
      reminderMode: { breakfast: "cook", lunch: "cook", dinner: "cook" },
      reminderTimes: { breakfast: "", lunch: "", dinner: "" },
      family: [], pantry: [],
      plan: {}, planCleared: false, customRecipes: [], favorites: [], extras: [], events: [], imports: [], doneItems: {}, hiddenItems: {}, atHomeBack: {}, sentReminders: {},
      navTucked: [],
      guideState: { status: "notStarted", step: 1, v: 2, nameAsks: 0, nameAskVisit: "" },
      accountName: "",
      autoPlan: false,
      settings: { background: { kind: "brand", photoMode: "light" }, backgroundPhoto: "", language: "auto" },
      ui: { sidebarHidden: true }
    };
  }
  /* Delete safety (Law B2): an item delete holds the exact record so Undo
     can put it back byte for byte at its old place. These two pure helpers
     are the whole mechanism; the toast in app.js wraps them. */
  function removeAt(list, index) {
    if (!Array.isArray(list) || index < 0 || index >= list.length) return { list: Array.isArray(list) ? list.slice() : [], item: null, index: -1 };
    const out = list.slice();
    const item = out.splice(index, 1)[0];
    return { list: out, item: item, index: index };
  }
  function restoreAt(list, item, index) {
    const out = Array.isArray(list) ? list.slice() : [];
    if (item === null || item === undefined) return out;
    const at = Math.max(0, Math.min(typeof index === "number" ? index : out.length, out.length));
    out.splice(at, 0, item);
    return out;
  }

  /* Calendar import (shared module, app v22): imported events are the
     user's own data (Law B). They live in their own slice, never in the
     meal plan: an imported event is an event, not a meal. Dates stay in
     the module's format (YYYY-MM-DD) because the import dedupe compares
     them exactly; the calendar converts when it renders. Repairs coerce
     field by field and keep every plain object record. */
  function cleanEvents(x) {
    if (!Array.isArray(x)) return [];
    const out = [];
    x.forEach(function (e, i) {
      if (!e || typeof e !== "object" || Array.isArray(e)) return;
      out.push({
        id: typeof e.id === "string" && e.id ? e.id : "imp." + i,
        title: String(e.title == null ? "" : e.title),
        date: typeof e.date === "string" ? e.date : "",
        time: (typeof e.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)) ? e.time : null,
        durationMin: (typeof e.durationMin === "number" && isFinite(e.durationMin) && e.durationMin > 0) ? Math.round(e.durationMin) : 30,
        notes: typeof e.notes === "string" ? e.notes : "",
        location: typeof e.location === "string" ? e.location : "",
        repeat: typeof e.repeat === "string" ? e.repeat : null,
        source: "import",
        importUid: typeof e.importUid === "string" ? e.importUid : "",
        importKey: typeof e.importKey === "string" ? e.importKey : ""
      });
    });
    return out;
  }
  /* The import registry (design fence 3): one row per import that brought
     events in: { key, source, at, count }. Repaired the same way Pace
     repairs it: rows without a string key are dropped, the rest are
     coerced field by field, never lost. */
  function cleanImports(x) {
    if (!Array.isArray(x)) return [];
    return x.filter(function (r) { return r && typeof r === "object" && !Array.isArray(r) && typeof r.key === "string"; }).map(function (r) {
      return { key: r.key, source: String(r.source || "calendar"), at: String(r.at || ""), count: Math.max(0, Math.round(+r.count) || 0) };
    });
  }
  const API = { shelfLookup: shelfLookup, shelfKnown: shelfKnown, shelfDays: shelfDays, expiryFor: expiryFor, daysLeft: daysLeft, sortByExpiry: sortByExpiry, personConflicts: personConflicts, recipeDietConflicts: recipeDietConflicts, recipeAllowed: recipeAllowed, scaleRecipe: scaleRecipe, cleanDiet: cleanDiet, cleanCookMinutes: cleanCookMinutes, cleanServings: cleanServings, cleanRecipeIngredients: cleanRecipeIngredients, matchIngredientNames: matchIngredientNames, recipeMatch: recipeMatch, rankRecipes: rankRecipes, swapFor: swapFor, adaptations: adaptations, recipeScore: recipeScore, recipeUsesExpiring: recipeUsesExpiring, EXPIRING_TIER: EXPIRING_TIER, pickRecipe: pickRecipe, planCtxForDay: planCtxForDay, cleanBusyNights: cleanBusyNights, cleanQuickMinutes: cleanQuickMinutes, dateKey: dateKey, parseKey: parseKey, buildPlan: buildPlan, reminderTime: reminderTime, extraReminderTime: extraReminderTime, formatTime: formatTime, cleanSkips: cleanSkips, cleanReminderMode: cleanReminderMode, cleanReminderTimes: cleanReminderTimes, reminderSchedule: reminderSchedule, expirySchedule: expirySchedule, applyCooked: applyCooked, buildGroceryList: buildGroceryList, findRecipeByName: findRecipeByName, makeRecipeFromName: makeRecipeFromName, recipeKcal: recipeKcal, photoKcal: photoKcal, fridgeKcal: fridgeKcal, ingredientGrams: ingredientGrams, NAV_GROUPS: NAV_GROUPS, navGroupForView: navGroupForView, cleanTucked: cleanTucked, canTuckGroup: canTuckGroup, BG_KINDS: BG_KINDS, cleanBackgroundKind: cleanBackgroundKind, cleanBackgroundPhoto: cleanBackgroundPhoto, cleanBackgroundSettings: cleanBackgroundSettings, LANG_CHOICES: LANG_CHOICES, cleanLanguageChoice: cleanLanguageChoice, PERSON_COLORS: PERSON_COLORS, OLD_PERSON_COLOR_MAP: OLD_PERSON_COLOR_MAP, mapPersonColor: mapPersonColor, GUIDE_STATUSES: GUIDE_STATUSES, cleanGuideState: cleanGuideState, stateHasUserData: stateHasUserData, blankState: blankState, removeAt: removeAt, restoreAt: restoreAt, cleanEvents: cleanEvents, cleanImports: cleanImports };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  global.MP_LOGIC = API;
})(typeof window !== "undefined" ? window : globalThis);
