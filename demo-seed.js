/* Meal Prep reviewer demo seed (app v23, accounts wave).
   The ONE exception to Empty Start (DEMO-ACCOUNT-SPEC.md): a demo
   session is seeded with INVENTED data that exercises every feature
   in the listing. Every person, meal and item below is fictional,
   made up for the demo; it is never the owner's data and never a
   copy of anyone's real kitchen. A demo session lives in its own
   per-session space, is labelled Demo in the app, never converts
   into a real account, and deletion stays off inside it; a fresh
   demo session re-seeds from this fixture automatically.
   The plan itself is built at seed time from the app's own planner
   (account-sync.js) so the demo always shows a current week. */
(function (global) {
  "use strict";
  var seed = {
    /* The SHA-256 of the current reviewer access code, set by the desk
       per submission (the code itself lives only in the store review
       notes; the rules hold the matching record at _demo/config).
       REPLACE: set the hash when the demo doors are switched on for a
       submission. Empty means the demo doors stay shut, honestly. */
    codeHash: "",
    state: {
      onboarded: true,
      notifications: "off",
      preferences: ["Healthy", "Mediterranean"],
      eatTimes: { breakfast: "07:30", lunch: "12:30", dinner: "18:30" },
      setupMinutes: 5,
      extraReminders: { breakfast: 0, lunch: 0, dinner: 0 },
      family: [
        { id: "p1", name: "Sam", color: "#B3401E", tags: ["Demo cook"], dislikes: ["capsicum"], allergies: [] },
        { id: "p2", name: "Alex", color: "#4C7A3F", tags: ["Kid"], dislikes: ["mushroom"], allergies: ["peanut"] },
        { id: "p3", name: "Jo", color: "#8A5E0B", tags: ["Grandparent"], dislikes: [], allergies: [] }
      ],
      pantry: [
        { id: "g1", name: "salmon fillet", qty: 400, unit: "g", storage: "fridge", added: "DEMO_TODAY", shelfDays: 2 },
        { id: "g2", name: "greek yogurt", qty: 500, unit: "g", storage: "fridge", added: "DEMO_TODAY", shelfDays: 7 },
        { id: "g3", name: "egg", qty: 12, unit: "pcs", storage: "fridge", added: "DEMO_TODAY", shelfDays: 28 },
        { id: "g4", name: "spinach", qty: 100, unit: "g", storage: "fridge", added: "DEMO_TODAY", shelfDays: 5 },
        { id: "g5", name: "rice", qty: 1000, unit: "g", storage: "pantry", added: "DEMO_TODAY", shelfDays: 180 }
      ],
      plan: {},
      planCleared: false,
      customRecipes: [
        { id: "own.demo", name: "Demo Tomato Pasta", meal: "dinner", cuisines: ["Italian"], minutes: 25, servings: 2, ingredients: [{ name: "pasta", qty: 200, unit: "g" }, { name: "tomato", qty: 400, unit: "g" }, { name: "basil", qty: 10, unit: "g" }], steps: ["Boil the pasta.", "Warm the tomato with a little oil.", "Mix through with basil and serve."], custom: true }
      ],
      extras: [
        { id: "e1", name: "dish soap", qty: 1, unit: "pcs", category: "Household" }
      ],
      events: [],
      imports: [],
      doneItems: {},
      hiddenItems: {},
      guideState: { status: "done", step: 6 },
      autoPlan: true
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = seed;
  global.MP_DEMO_SEED = seed;
})(typeof window !== "undefined" ? window : globalThis);
