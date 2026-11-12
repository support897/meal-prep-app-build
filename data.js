/* Meal Prep data. Recipes, shelf life and swaps.
Shelf life times are a guide from USDA FoodKeeper and FoodSafety dot gov storage times.
Times are for best quality and safe planning, not a promise. Always check food before eating it. */
window.MP_DATA = (function () {
  const CUISINES = ["Mexican", "Greek", "Mediterranean", "Italian", "Asian", "Indian", "American", "Australian", "Healthy", "Comfort", "Quick"];
  /* The ink twins (app v35, named debt item 64): color is the meal's
     functional coding and never changes; ink is the dark tuned twin of
     the same hue, worn by the meal label text and the legend glyphs,
     which sit on the meal's own soft chip in every theme. Computed
     pairs (ink on soft): breakfast #92400E on #fef3c7 = 6.37, lunch
     #0369A1 on #e0f2fe = 5.17, dinner #6D28D9 on #ede9fe = 5.98, each
     past the 4.5 text floor the raw colours miss (1.93 / 2.42 / 3.57).
     The table is pinned in the unit suite. */
  const MEALS = {
    breakfast: { label: "Breakfast", color: "#f59e0b", ink: "#92400E", soft: "#fef3c7", defaultTime: "07:30" },
    lunch: { label: "Lunch", color: "#0ea5e9", ink: "#0369A1", soft: "#e0f2fe", defaultTime: "12:30" },
    dinner: { label: "Dinner", color: "#8b5cf6", ink: "#6D28D9", soft: "#ede9fe", defaultTime: "18:30" }
  };
  function ing(name, qty, unit, category) { return { name: name, qty: qty, unit: unit, category: category }; }
  const R = [
    { id: "avo-eggs", name: "Avocado Eggs on Toast", meal: "breakfast", cuisines: ["Australian", "Healthy"], minutes: 15, servings: 2,
      ingredients: [ing("egg", 4, "pcs", "Dairy"), ing("avocado", 1, "pcs", "Produce"), ing("bread", 4, "slices", "Bakery"), ing("lemon", 0.5, "pcs", "Produce"), ing("chilli flakes", 1, "tsp", "Pantry")],
      steps: ["Toast the bread until golden.", "Boil or scramble the eggs to your liking.", "Mash the avocado with lemon juice and a pinch of salt.", "Spread avocado on toast, top with egg and chilli flakes.", "Serve right away."] },
    { id: "greek-yogurt-bowl", name: "Greek Yogurt Berry Bowl", meal: "breakfast", cuisines: ["Greek", "Healthy"], minutes: 10, servings: 2,
      ingredients: [ing("greek yogurt", 300, "g", "Dairy"), ing("mixed berries", 200, "g", "Produce"), ing("honey", 2, "tbsp", "Pantry"), ing("granola", 80, "g", "Pantry"), ing("chia seeds", 2, "tbsp", "Pantry")],
      steps: ["Spoon yogurt into two bowls.", "Wash the berries and pat them dry.", "Top yogurt with berries and granola.", "Drizzle honey and scatter chia seeds.", "Eat fresh."] },
    { id: "spinach-omelette", name: "Spinach and Feta Omelette", meal: "breakfast", cuisines: ["Mediterranean", "Healthy"], minutes: 15, servings: 2,
      ingredients: [ing("egg", 5, "pcs", "Dairy"), ing("spinach", 100, "g", "Produce"), ing("feta", 60, "g", "Dairy"), ing("tomato", 1, "pcs", "Produce"), ing("olive oil", 1, "tbsp", "Pantry")],
      steps: ["Whisk the eggs with a pinch of salt.", "Cook spinach in olive oil for 2 minutes until soft.", "Pour in the eggs and cook gently.", "Add chopped tomato and crumbled feta.", "Fold, rest 1 minute, then serve."] },
    { id: "oat-bowls", name: "Warm Oats with Banana and Peanut Butter", meal: "breakfast", cuisines: ["Healthy", "Comfort"], minutes: 12, servings: 2,
      ingredients: [ing("rolled oats", 120, "g", "Pantry"), ing("milk", 400, "ml", "Dairy"), ing("banana", 2, "pcs", "Produce"), ing("peanut butter", 2, "tbsp", "Pantry"), ing("cinnamon", 1, "tsp", "Pantry")],
      steps: ["Put oats and milk in a pot on medium heat.", "Stir for 5 to 7 minutes until thick.", "Spoon into bowls.", "Top with sliced banana, peanut butter and cinnamon.", "Serve warm."] },
    { id: "breakfast-burrito", name: "Breakfast Burritos", meal: "breakfast", cuisines: ["Mexican"], minutes: 20, servings: 2,
      ingredients: [ing("tortilla", 4, "pcs", "Bakery"), ing("egg", 4, "pcs", "Dairy"), ing("black beans", 200, "g", "Pantry"), ing("cheese", 60, "g", "Dairy"), ing("capsicum", 1, "pcs", "Produce"), ing("salsa", 4, "tbsp", "Pantry")],
      steps: ["Scramble the eggs in a warm pan.", "Warm the beans with chopped capsicum.", "Fill each tortilla with egg, beans and cheese.", "Roll up tight and toast seam side down for 2 minutes.", "Serve with salsa."] },
    { id: "pancakes", name: "Fluffy Pancakes with Berries", meal: "breakfast", cuisines: ["American", "Comfort"], minutes: 25, servings: 4,
      ingredients: [ing("flour", 250, "g", "Pantry"), ing("milk", 300, "ml", "Dairy"), ing("egg", 2, "pcs", "Dairy"), ing("baking powder", 2, "tsp", "Pantry"), ing("mixed berries", 200, "g", "Produce"), ing("maple syrup", 4, "tbsp", "Pantry")],
      steps: ["Mix flour and baking powder in a big bowl.", "Whisk milk and eggs in a second bowl, then combine. Rest 5 minutes.", "Cook small ladles of batter for 2 minutes each side.", "Stack and top with berries and maple syrup."] },
    { id: "shakshuka", name: "Shakshuka", meal: "breakfast", cuisines: ["Mediterranean", "Healthy"], minutes: 25, servings: 2,
      ingredients: [ing("egg", 4, "pcs", "Dairy"), ing("crushed tomato", 400, "g", "Pantry"), ing("capsicum", 1, "pcs", "Produce"), ing("onion", 1, "pcs", "Produce"), ing("cumin", 1, "tsp", "Pantry"), ing("bread", 2, "slices", "Bakery")],
      steps: ["Cook onion and capsicum in a pan for 5 minutes.", "Add cumin and crushed tomato. Simmer 8 minutes.", "Make 4 wells and crack an egg into each.", "Cover and cook 6 minutes until whites are set.", "Serve with warm bread."] },
    { id: "smoothie-green", name: "Green Smoothie and Toast Soldiers", meal: "breakfast", cuisines: ["Healthy", "Quick"], minutes: 8, servings: 2,
      ingredients: [ing("banana", 2, "pcs", "Produce"), ing("spinach", 60, "g", "Produce"), ing("greek yogurt", 200, "g", "Dairy"), ing("milk", 200, "ml", "Dairy"), ing("bread", 2, "slices", "Bakery")],
      steps: ["Put banana, spinach, yogurt and milk in a blender.", "Blend 60 seconds until smooth.", "Toast the bread and cut into strips.", "Pour and serve right away."] },
    { id: "chicken-wrap", name: "Grilled Chicken Wraps", meal: "lunch", cuisines: ["Healthy", "Quick"], minutes: 20, servings: 2,
      ingredients: [ing("chicken breast", 300, "g", "Meat"), ing("tortilla", 4, "pcs", "Bakery"), ing("lettuce", 100, "g", "Produce"), ing("tomato", 1, "pcs", "Produce"), ing("mayonnaise", 2, "tbsp", "Pantry")],
      steps: ["Season chicken and grill 6 to 7 minutes each side.", "Rest 5 minutes, then slice.", "Warm the tortillas.", "Fill with lettuce, tomato, chicken and mayonnaise.", "Roll, cut in half and serve."] },
    { id: "greek-salad", name: "Greek Salad with Grilled Halloumi", meal: "lunch", cuisines: ["Greek", "Mediterranean", "Healthy"], minutes: 18, servings: 2,
      ingredients: [ing("halloumi", 200, "g", "Dairy"), ing("cucumber", 1, "pcs", "Produce"), ing("tomato", 2, "pcs", "Produce"), ing("red onion", 0.5, "pcs", "Produce"), ing("olives", 80, "g", "Pantry"), ing("olive oil", 2, "tbsp", "Pantry"), ing("lemon", 1, "pcs", "Produce")],
      steps: ["Chop cucumber, tomato and red onion into chunks.", "Add olives, olive oil and lemon juice. Toss well.", "Fry halloumi slices 2 minutes each side until golden.", "Lay halloumi over the salad and serve."] },
    { id: "tuna-rice", name: "Tuna Rice Bowls", meal: "lunch", cuisines: ["Healthy", "Quick"], minutes: 15, servings: 2,
      ingredients: [ing("tuna", 290, "g", "Pantry"), ing("rice", 200, "g", "Pantry"), ing("corn", 150, "g", "Frozen"), ing("cucumber", 1, "pcs", "Produce"), ing("mayonnaise", 2, "tbsp", "Pantry"), ing("soy sauce", 1, "tbsp", "Pantry")],
      steps: ["Cook the rice and let it rest 5 minutes.", "Warm the corn.", "Mix tuna with mayonnaise.", "Bowl up rice, tuna, corn and chopped cucumber.", "Drizzle soy sauce and serve."] },
    { id: "quesadillas", name: "Bean and Cheese Quesadillas", meal: "lunch", cuisines: ["Mexican", "Quick"], minutes: 15, servings: 2,
      ingredients: [ing("tortilla", 4, "pcs", "Bakery"), ing("black beans", 200, "g", "Pantry"), ing("cheese", 100, "g", "Dairy"), ing("corn", 100, "g", "Frozen"), ing("salsa", 4, "tbsp", "Pantry")],
      steps: ["Mash half the beans with a fork.", "Spread beans on tortillas, add cheese and corn.", "Fold and toast in a dry pan 3 minutes each side.", "Cut into wedges and serve with salsa."] },
    { id: "pumpkin-soup", name: "Roast Pumpkin Soup", meal: "lunch", cuisines: ["Healthy", "Comfort"], minutes: 40, servings: 4,
      ingredients: [ing("pumpkin", 900, "g", "Produce"), ing("onion", 1, "pcs", "Produce"), ing("garlic", 3, "cloves", "Produce"), ing("vegetable stock", 750, "ml", "Pantry"), ing("cream", 100, "ml", "Dairy"), ing("bread", 4, "slices", "Bakery")],
      steps: ["Roast pumpkin chunks at 200 degrees for 25 minutes.", "Cook onion and garlic in a pot for 5 minutes.", "Add pumpkin and stock. Simmer 10 minutes.", "Blend until smooth, stir in cream.", "Serve with warm bread."] },
    { id: "falafel-pita", name: "Falafel Pitas with Tzatziki", meal: "lunch", cuisines: ["Mediterranean", "Healthy"], minutes: 25, servings: 2,
      ingredients: [ing("falafel", 8, "pcs", "Frozen"), ing("pita bread", 4, "pcs", "Bakery"), ing("greek yogurt", 150, "g", "Dairy"), ing("cucumber", 0.5, "pcs", "Produce"), ing("lettuce", 80, "g", "Produce"), ing("tomato", 1, "pcs", "Produce")],
      steps: ["Bake falafel as the pack says, about 15 minutes.", "Grate cucumber, squeeze dry, mix with yogurt.", "Warm the pitas.", "Fill pitas with lettuce, tomato, falafel and tzatziki."] },
    { id: "pasta-salad", name: "Italian Pasta Salad", meal: "lunch", cuisines: ["Italian", "Quick"], minutes: 20, servings: 4,
      ingredients: [ing("pasta", 300, "g", "Pantry"), ing("cherry tomato", 250, "g", "Produce"), ing("mozzarella", 150, "g", "Dairy"), ing("basil", 20, "g", "Produce"), ing("olive oil", 3, "tbsp", "Pantry"), ing("salami", 100, "g", "Meat")],
      steps: ["Cook pasta, drain and cool under cold water.", "Halve the cherry tomatoes and tear the mozzarella.", "Mix pasta with tomato, mozzarella, salami and basil.", "Dress with olive oil, rest 10 minutes, serve."] },
    { id: "fried-rice", name: "Veggie Fried Rice", meal: "lunch", cuisines: ["Asian", "Quick"], minutes: 15, servings: 2,
      ingredients: [ing("rice", 250, "g", "Pantry"), ing("egg", 3, "pcs", "Dairy"), ing("frozen peas", 150, "g", "Frozen"), ing("carrot", 2, "pcs", "Produce"), ing("soy sauce", 2, "tbsp", "Pantry"), ing("spring onion", 3, "pcs", "Produce")],
      steps: ["Cook rice ahead and chill it if you can. Cold rice fries best.", "Scramble eggs in a hot pan, set aside.", "Fry diced carrot and peas for 4 minutes.", "Add rice and soy sauce, toss 3 minutes.", "Fold in egg and spring onion. Serve hot."] },
    { id: "tacos", name: "Beef Tacos with Slaw", meal: "dinner", cuisines: ["Mexican"], minutes: 25, servings: 4,
      ingredients: [ing("beef mince", 500, "g", "Meat"), ing("taco shells", 8, "pcs", "Bakery"), ing("cabbage", 300, "g", "Produce"), ing("lime", 1, "pcs", "Produce"), ing("sour cream", 150, "g", "Dairy"), ing("cheese", 80, "g", "Dairy"), ing("taco seasoning", 2, "tbsp", "Pantry")],
      steps: ["Brown the mince in a hot pan, breaking it up.", "Add taco seasoning and a splash of water. Simmer 5 minutes.", "Shred cabbage and mix with lime juice.", "Warm the shells.", "Fill shells with mince, slaw, cheese and sour cream."] },
    { id: "sheet-chicken", name: "Lemon Chicken Tray Bake", meal: "dinner", cuisines: ["Mediterranean", "Healthy"], minutes: 45, servings: 4,
      ingredients: [ing("chicken thigh", 800, "g", "Meat"), ing("potato", 600, "g", "Produce"), ing("zucchini", 2, "pcs", "Produce"), ing("lemon", 1, "pcs", "Produce"), ing("olive oil", 3, "tbsp", "Pantry"), ing("oregano", 1, "tbsp", "Pantry")],
      steps: ["Heat the oven to 200 degrees.", "Cut potato into chunks and zucchini into thick slices.", "Toss everything on a tray with oil, oregano and lemon.", "Bake 35 to 40 minutes until chicken is cooked through.", "Rest 5 minutes and serve."] },
    { id: "salmon-greens", name: "Salmon with Greens and Rice", meal: "dinner", cuisines: ["Healthy"], minutes: 25, servings: 2,
      ingredients: [ing("salmon", 300, "g", "Meat"), ing("rice", 180, "g", "Pantry"), ing("broccoli", 250, "g", "Produce"), ing("garlic", 2, "cloves", "Produce"), ing("lemon", 1, "pcs", "Produce"), ing("soy sauce", 1, "tbsp", "Pantry")],
      steps: ["Cook the rice.", "Steam broccoli for 5 minutes.", "Pan fry salmon skin side down for 6 minutes, then 2 minutes more.", "Add garlic, soy sauce and lemon to the pan.", "Serve salmon over rice with greens."] },
    { id: "spaghetti-bol", name: "Spaghetti Bolognese", meal: "dinner", cuisines: ["Italian", "Comfort"], minutes: 40, servings: 4,
      ingredients: [ing("spaghetti", 400, "g", "Pantry"), ing("beef mince", 500, "g", "Meat"), ing("crushed tomato", 400, "g", "Pantry"), ing("onion", 1, "pcs", "Produce"), ing("carrot", 1, "pcs", "Produce"), ing("garlic", 2, "cloves", "Produce"), ing("parmesan", 40, "g", "Dairy")],
      steps: ["Cook onion, carrot and garlic for 5 minutes.", "Add mince and brown it well.", "Add crushed tomato and simmer 25 minutes.", "Cook spaghetti in salty water.", "Serve sauce over spaghetti with parmesan."] },
    { id: "curry-chicken", name: "Chicken Coconut Curry", meal: "dinner", cuisines: ["Indian", "Asian"], minutes: 35, servings: 4,
      ingredients: [ing("chicken thigh", 600, "g", "Meat"), ing("coconut milk", 400, "ml", "Pantry"), ing("curry paste", 3, "tbsp", "Pantry"), ing("sweet potato", 400, "g", "Produce"), ing("rice", 250, "g", "Pantry"), ing("spinach", 100, "g", "Produce")],
      steps: ["Fry curry paste for 1 minute until it smells great.", "Add chicken pieces and coat them well.", "Add coconut milk and sweet potato chunks. Simmer 20 minutes.", "Stir in spinach until soft.", "Serve over rice."] },
    { id: "stir-fry", name: "Beef and Veggie Stir Fry", meal: "dinner", cuisines: ["Asian", "Quick"], minutes: 20, servings: 2,
      ingredients: [ing("beef strips", 400, "g", "Meat"), ing("capsicum", 1, "pcs", "Produce"), ing("broccoli", 200, "g", "Produce"), ing("soy sauce", 3, "tbsp", "Pantry"), ing("ginger", 20, "g", "Produce"), ing("rice", 180, "g", "Pantry")],
      steps: ["Cook the rice.", "Sear beef in a very hot pan for 3 minutes. Set aside.", "Stir fry capsicum, broccoli and ginger for 4 minutes.", "Return beef, add soy sauce, toss 1 minute.", "Serve over rice."] },
    { id: "lamb-kofta", name: "Lamb Kofta with Couscous", meal: "dinner", cuisines: ["Mediterranean", "Greek"], minutes: 30, servings: 4,
      ingredients: [ing("lamb mince", 500, "g", "Meat"), ing("couscous", 250, "g", "Pantry"), ing("cucumber", 1, "pcs", "Produce"), ing("greek yogurt", 200, "g", "Dairy"), ing("cumin", 2, "tsp", "Pantry"), ing("parsley", 20, "g", "Produce")],
      steps: ["Mix lamb with cumin, parsley and salt. Shape into logs.", "Grill or fry 10 to 12 minutes, turning often.", "Pour hot water over couscous, cover 5 minutes, fluff.", "Mix yogurt with grated cucumber.", "Serve kofta on couscous with the yogurt."] },
    { id: "veggie-chilli", name: "Bean Chilli with Rice", meal: "dinner", cuisines: ["Mexican", "Healthy"], minutes: 35, servings: 4,
      ingredients: [ing("black beans", 400, "g", "Pantry"), ing("kidney beans", 400, "g", "Pantry"), ing("crushed tomato", 400, "g", "Pantry"), ing("onion", 1, "pcs", "Produce"), ing("corn", 200, "g", "Frozen"), ing("rice", 250, "g", "Pantry"), ing("smoked paprika", 2, "tsp", "Pantry")],
      steps: ["Cook onion for 5 minutes.", "Add paprika, beans, tomato and corn.", "Simmer 20 minutes until thick.", "Cook the rice.", "Serve chilli over rice."] },
    { id: "pizza-night", name: "Homemade Pizza Night", meal: "dinner", cuisines: ["Italian", "Comfort"], minutes: 30, servings: 4,
      ingredients: [ing("pizza base", 4, "pcs", "Bakery"), ing("tomato paste", 120, "g", "Pantry"), ing("mozzarella", 250, "g", "Dairy"), ing("ham", 150, "g", "Meat"), ing(" capsicum", 1, "pcs", "Produce"), ing("mushroom", 150, "g", "Produce")],
      steps: ["Heat the oven to 220 degrees.", "Spread tomato paste on each base.", "Top with mozzarella, ham, capsicum and mushroom.", "Bake 12 to 15 minutes until bubbling.", "Slice and serve."] },
    { id: "fish-chips", name: "Oven Fish and Sweet Potato Chips", meal: "dinner", cuisines: ["Australian", "Comfort"], minutes: 35, servings: 2,
      ingredients: [ing("white fish", 400, "g", "Meat"), ing("sweet potato", 500, "g", "Produce"), ing("breadcrumbs", 80, "g", "Pantry"), ing("egg", 1, "pcs", "Dairy"), ing("lemon", 1, "pcs", "Produce"), ing("frozen peas", 200, "g", "Frozen")],
      steps: ["Heat the oven to 200 degrees.", "Cut sweet potato into chips, bake 25 minutes.", "Dip fish in beaten egg, then breadcrumbs.", "Bake fish 12 to 15 minutes.", "Serve with peas and lemon wedges."] },
    { id: "butter-chicken-lite", name: "Easy Butter Chicken", meal: "dinner", cuisines: ["Indian"], minutes: 35, servings: 4,
      ingredients: [ing("chicken thigh", 600, "g", "Meat"), ing("tomato passata", 400, "g", "Pantry"), ing("cream", 150, "ml", "Dairy"), ing("butter", 40, "g", "Dairy"), ing("garam masala", 2, "tbsp", "Pantry"), ing("rice", 250, "g", "Pantry")],
      steps: ["Melt butter and fry garam masala for 30 seconds.", "Add chicken and brown for 6 minutes.", "Add passata and simmer 15 minutes.", "Stir in cream and warm through.", "Serve over rice."] },
    { id: "pesto-pasta", name: "Pesto Pasta with Green Beans", meal: "dinner", cuisines: ["Italian", "Quick"], minutes: 18, servings: 2,
      ingredients: [ing("pasta", 250, "g", "Pantry"), ing("pesto", 120, "g", "Pantry"), ing("green beans", 200, "g", "Produce"), ing("parmesan", 30, "g", "Dairy"), ing("pine nuts", 30, "g", "Pantry")],
      steps: ["Cook pasta in salty water.", "Add green beans for the last 4 minutes.", "Drain, keeping a cup of pasta water.", "Toss pasta with pesto and a splash of pasta water.", "Top with parmesan and pine nuts."] },
    { id: "soup-minestrone", name: "Minestrone Soup with Crusty Bread", meal: "dinner", cuisines: ["Italian", "Healthy"], minutes: 35, servings: 4,
      ingredients: [ing("crushed tomato", 400, "g", "Pantry"), ing("kidney beans", 400, "g", "Pantry"), ing("pasta", 120, "g", "Pantry"), ing("zucchini", 1, "pcs", "Produce"), ing("carrot", 2, "pcs", "Produce"), ing("vegetable stock", 900, "ml", "Pantry"), ing("bread", 4, "slices", "Bakery")],
      steps: ["Put stock, tomato, carrot and zucchini in a big pot.", "Simmer 15 minutes.", "Add beans and small pasta. Cook 10 minutes more.", "Rest 5 minutes.", "Serve with crusty bread."] },
    { id: "satay-noodles", name: "Chicken Satay Noodles", meal: "dinner", cuisines: ["Asian"], minutes: 22, servings: 2,
      ingredients: [ing("chicken breast", 300, "g", "Meat"), ing("noodles", 200, "g", "Pantry"), ing("peanut butter", 3, "tbsp", "Pantry"), ing("soy sauce", 2, "tbsp", "Pantry"), ing("capsicum", 1, "pcs", "Produce"), ing("lime", 1, "pcs", "Produce")],
      steps: ["Cook noodles as the pack says.", "Fry chicken strips for 7 minutes.", "Mix peanut butter, soy sauce, lime juice and warm water into a sauce.", "Toss noodles, chicken, capsicum and sauce together.", "Serve hot."] }
  ];
  R.forEach(function (r) { r.ingredients.forEach(function (i) { i.name = i.name.trim(); }); });
  /* Spanish recipe content (app v36, the LANGUAGE BUILD phase 2):
     the Quality pair read pack (v35-staging/i18n-recipes/recipes-es.json,
     pair read PASS 17 Oct, all nine flags ruled), landed VERBATIM by
     script: no translated word was retyped or altered in the merge.
     Each built in recipe gains an es field holding its Spanish name,
     its ingredient names (parallel to ingredients, in order) and its
     steps. Amounts, units and aisles stay data, untranslated, exactly
     as the v34 convention files them. The app shows this content when
     the active language is Spanish and falls back to the recipe's own
     English fields whenever a Spanish field is missing or blank, so
     a gap renders English, never a blank. A user's own recipe never
     gains an es field and is never translated. The allergy and calorie
     lines keep following the legal flagged set in lang.js, untouched
     by this content. The suite pins the census, the verbatim landing
     and the fallback; the merge record is in BUILD-LOG (v36 tranche). */
  /* Spanish recipe content is HELD BACK with the rest of the
     Spanish (the 2 Nov ruling): the saved table lives in
     spanish-saved.js at the app root, unshipped. Restore by pasting
     it back here. Empty here: the attach below finds nothing and
     every recipe shows its English, exactly as the ruling asks. */
  const RECIPES_ES = {};
  R.forEach(function (r) { const es = RECIPES_ES[r.id]; if (es) r.es = es; });
  const SHELF = [
    { key: "pizza", label: "Pizza, cooked or leftover", fridge: 4, freezer: 60, pantry: 1 },
    { key: "cake", label: "Cake", fridge: 5, freezer: 90, pantry: 3 },
    { key: "sandwich", label: "Sandwich, made", fridge: 3, freezer: 30, pantry: 1 },
    { key: "donut", label: "Donuts", fridge: 5, freezer: 60, pantry: 2 },
    { key: "chicken", label: "Chicken, raw", fridge: 2, freezer: 270, pantry: 0 },
    { key: "beef mince", label: "Mince, raw", fridge: 2, freezer: 120, pantry: 0 },
    { key: "lamb mince", label: "Mince, raw", fridge: 2, freezer: 120, pantry: 0 },
    { key: "mince", label: "Mince, raw", fridge: 2, freezer: 120, pantry: 0 },
    { key: "beef", label: "Beef cuts, raw", fridge: 4, freezer: 270, pantry: 0 },
    { key: "lamb", label: "Lamb cuts, raw", fridge: 4, freezer: 270, pantry: 0 },
    { key: "salmon", label: "Fish, fresh", fridge: 2, freezer: 90, pantry: 0 },
    { key: "fish", label: "Fish, fresh", fridge: 2, freezer: 90, pantry: 0 },
    { key: "ham", label: "Ham, sliced", fridge: 5, freezer: 60, pantry: 0 },
    { key: "salami", label: "Salami", fridge: 21, freezer: 60, pantry: 0 },
    { key: "milk", label: "Milk", fridge: 7, freezer: 90, pantry: 0 },
    { key: "cream", label: "Cream", fridge: 7, freezer: 60, pantry: 0 },
    { key: "yogurt", label: "Yogurt", fridge: 10, freezer: 30, pantry: 0 },
    { key: "cheese", label: "Hard cheese", fridge: 28, freezer: 180, pantry: 0 },
    { key: "feta", label: "Feta", fridge: 7, freezer: 0, pantry: 0 },
    { key: "mozzarella", label: "Mozzarella", fridge: 7, freezer: 90, pantry: 0 },
    { key: "halloumi", label: "Halloumi", fridge: 14, freezer: 90, pantry: 0 },
    { key: "butter", label: "Butter", fridge: 60, freezer: 180, pantry: 0 },
    { key: "egg", label: "Eggs", fridge: 28, freezer: 0, pantry: 0 },
    { key: "avocado", label: "Avocado", fridge: 5, freezer: 90, pantry: 3 },
    { key: "banana", label: "Bananas", fridge: 7, freezer: 90, pantry: 4 },
    { key: "berries", label: "Berries", fridge: 4, freezer: 270, pantry: 0 },
    { key: "tomato", label: "Tomatoes", fridge: 7, freezer: 60, pantry: 5 },
    { key: "cucumber", label: "Cucumber", fridge: 7, freezer: 0, pantry: 0 },
    { key: "lettuce", label: "Leafy greens", fridge: 5, freezer: 0, pantry: 0 },
    { key: "spinach", label: "Leafy greens", fridge: 5, freezer: 270, pantry: 0 },
    { key: "broccoli", label: "Broccoli", fridge: 5, freezer: 300, pantry: 0 },
    { key: "carrot", label: "Carrots", fridge: 21, freezer: 300, pantry: 0 },
    { key: "potato", label: "Potatoes", fridge: 30, freezer: 300, pantry: 30 },
    { key: "sweet potato", label: "Sweet potato", fridge: 14, freezer: 300, pantry: 10 },
    { key: "pumpkin", label: "Pumpkin", fridge: 30, freezer: 300, pantry: 30 },
    { key: "onion", label: "Onions", fridge: 60, freezer: 240, pantry: 60 },
    { key: "capsicum", label: "Capsicum", fridge: 7, freezer: 240, pantry: 0 },
    { key: "zucchini", label: "Zucchini", fridge: 7, freezer: 300, pantry: 0 },
    { key: "lemon", label: "Lemons and limes", fridge: 21, freezer: 120, pantry: 7 },
    { key: "lime", label: "Lemons and limes", fridge: 21, freezer: 120, pantry: 7 },
    { key: "corn", label: "Corn", fridge: 4, freezer: 300, pantry: 0 },
    { key: "peas", label: "Peas, frozen", fridge: 4, freezer: 300, pantry: 0 },
    { key: "bread", label: "Bread", fridge: 7, freezer: 90, pantry: 4 },
    { key: "tortilla", label: "Wraps and tortillas", fridge: 30, freezer: 180, pantry: 14 },
    { key: "pita", label: "Pita bread", fridge: 7, freezer: 90, pantry: 4 },
    { key: "rice", label: "Rice, dry", fridge: 0, freezer: 0, pantry: 365 },
    { key: "pasta", label: "Pasta, dry", fridge: 0, freezer: 0, pantry: 730 },
    { key: "spaghetti", label: "Pasta, dry", fridge: 0, freezer: 0, pantry: 730 },
    { key: "noodles", label: "Noodles, dry", fridge: 0, freezer: 0, pantry: 365 },
    { key: "oats", label: "Oats", fridge: 0, freezer: 0, pantry: 365 },
    { key: "flour", label: "Flour", fridge: 0, freezer: 0, pantry: 270 },
    { key: "beans", label: "Beans, canned or dry", fridge: 4, freezer: 180, pantry: 365 },
    { key: "tuna", label: "Tuna, canned", fridge: 3, freezer: 0, pantry: 730 },
    { key: "falafel", label: "Falafel, frozen", fridge: 3, freezer: 180, pantry: 0 },
    { key: "mushroom", label: "Mushrooms", fridge: 5, freezer: 270, pantry: 0 },
    { key: "pickles", label: "Pickles, opened jar", fridge: 90, freezer: 0, pantry: 1 },
    { key: "jam", label: "Jam, opened jar", fridge: 180, freezer: 0, pantry: 30 },
    { key: "mayonnaise", label: "Mayonnaise, opened jar", fridge: 60, freezer: 0, pantry: 1 },
    { key: "mustard", label: "Mustard, opened jar", fridge: 365, freezer: 0, pantry: 30 },
    { key: "ketchup", label: "Ketchup, opened bottle", fridge: 180, freezer: 0, pantry: 30 },
    { key: "soy sauce", label: "Soy sauce, opened bottle", fridge: 365, freezer: 0, pantry: 180 },
    { key: "orange juice", label: "Orange juice, opened", fridge: 7, freezer: 270, pantry: 0 },
    { key: "ice cream", label: "Ice cream", fridge: 0, freezer: 60, pantry: 0 },
    { key: "apple", label: "Apples", fridge: 28, freezer: 270, pantry: 7 },
    { key: "orange", label: "Oranges", fridge: 21, freezer: 0, pantry: 7 },
    { key: "grapes", label: "Grapes", fridge: 7, freezer: 270, pantry: 2 },
    { key: "strawberr", label: "Strawberries", fridge: 5, freezer: 270, pantry: 1 },
    { key: "garlic", label: "Garlic", fridge: 60, freezer: 0, pantry: 30 },
    { key: "celery", label: "Celery", fridge: 14, freezer: 0, pantry: 2 },
    { key: "cabbage", label: "Cabbage", fridge: 14, freezer: 0, pantry: 3 },
    { key: "bacon", label: "Bacon, raw", fridge: 7, freezer: 30, pantry: 0 },
    { key: "sausage", label: "Sausages, raw", fridge: 2, freezer: 60, pantry: 0 },
    { key: "tofu", label: "Tofu, opened", fridge: 5, freezer: 150, pantry: 0 },
    { key: "hummus", label: "Hummus, opened", fridge: 6, freezer: 0, pantry: 0 },
    { key: "olives", label: "Olives, opened jar", fridge: 14, freezer: 0, pantry: 1 },
    { key: "shrimp", label: "Shrimp, raw", fridge: 2, freezer: 180, pantry: 0 },
    { key: "default", label: "Most fresh food", fridge: 5, freezer: 90, pantry: 7 }
  ];
  /* Spanish shelf labels (QA F1 on the v37 vehicle): the shelf table
     was the one data surface the language build never reached, so in
     Spanish the shelf hint mixed the two languages. Each entry now
     carries its Spanish label, in the same Latin-American-leaning
     voice as the recipe pack, attached the same way RECIPES_ES
     attaches to recipes. The days, the storage and the keys stay
     data, untouched; only the showing of the label changes. */
  /* Spanish shelf labels, held back the same way (2 Nov ruling):
     the saved table lives in spanish-saved.js, unshipped. */
  const SHELF_ES = {};
  SHELF.forEach(function (s) { const es = SHELF_ES[s.key]; if (es) s.es = es; });
  const SWAPS = [
    { match: "peanut", swap: "toasted sunflower seeds" },
    { match: "pine nuts", swap: "toasted seeds" },
    { match: "nut", swap: "toasted seeds" },
    { match: "milk", swap: "oat milk" },
    { match: "cream", swap: "coconut cream" },
    { match: "cheese", swap: "dairy free cheese" },
    { match: "feta", swap: "olives for the salty bite" },
    { match: "yogurt", swap: "coconut yogurt" },
    { match: "butter", swap: "olive oil" },
    { match: "egg", swap: "a chia egg, 1 tbsp chia plus 3 tbsp water" },
    { match: "beef", swap: "lentils" },
    { match: "chicken", swap: "tofu" },
    { match: "lamb", swap: "chickpeas" },
    { match: "salmon", swap: "tofu" },
    { match: "fish", swap: "tofu" },
    { match: "ham", swap: "roast capsicum" },
    { match: "gluten", swap: "a gluten free version" }
  ];
  const FRIDGE_COMMON = ["egg", "milk", "cheese", "chicken breast", "beef mince", "tomato", "cucumber", "carrot", "spinach", "avocado", "lemon", "yogurt", "butter", "broccoli", "capsicum"];
  /* Allergen groups: ingredient words that carry the allergen without naming it.
     Milk means dairy foods, cheese means the named cheeses, gluten means wheat foods, egg includes mayonnaise.
     Wheat reads as the gluten group (Issue 8, Test filing: the typed word "wheat" used to match nothing).
     Peanut hides in peanut butter and satay. Nut is the umbrella word a person types: peanut and the
     tree nuts together. Tree nut is the tree nuts alone, never peanut (a different allergy). */
  const ALLERGEN_GROUPS = {
    "milk": ["butter", "cheese", "feta", "mozzarella", "yogurt", "cream", "halloumi", "parmesan", "ghee", "whey", "buttermilk", "casein"],
    "dairy": ["milk", "butter", "cheese", "feta", "mozzarella", "yogurt", "cream", "halloumi", "parmesan", "ghee", "whey", "buttermilk", "casein"],
    "cheese": ["feta", "mozzarella", "halloumi", "parmesan"],
    "gluten": ["flour", "bread", "pasta", "spaghetti", "couscous", "barley", "rye", "tortilla", "pita", "pizza base", "noodles", "taco shells", "soy sauce", "rolled oats"],
    "wheat": ["flour", "bread", "pasta", "spaghetti", "couscous", "barley", "rye", "tortilla", "pita", "pizza base", "noodles", "taco shells", "soy sauce", "rolled oats"],
    "egg": ["mayonnaise", "egg yolk", "egg white", "albumen"],
    "peanut": ["peanut butter", "peanut sauce", "satay"],
    "soy": ["soy sauce", "tamari", "tofu", "tempeh", "edamame", "miso", "soybean", "soybeans"],
    "sesame": ["tahini", "sesame oil", "sesame seeds"],
    "fish": ["salmon", "tuna", "cod", "anchovy", "sardine", "mackerel", "fish sauce", "trout", "haddock"],
    "shellfish": ["shrimp", "prawn", "crab", "lobster", "mussel", "clam", "oyster", "scallop", "crayfish", "prawn paste"],
    "nut": ["peanut butter", "pine nuts", "almond", "walnut", "cashew", "hazelnut", "pecan", "pistachio", "macadamia", "brazil nut", "chestnut"],
    "tree nut": ["pine nuts", "almond", "walnut", "cashew", "hazelnut", "pecan", "pistachio", "macadamia", "brazil nut", "chestnut"]
  };
  if (Array.isArray(window.MP_OPEN_RECIPES)) Array.prototype.push.apply(R, window.MP_OPEN_RECIPES);
  return { CUISINES: CUISINES, MEALS: MEALS, RECIPES: R, SHELF: SHELF, SWAPS: SWAPS, FRIDGE_COMMON: FRIDGE_COMMON, ALLERGEN_GROUPS: ALLERGEN_GROUPS, OPEN_RECIPES_META: window.MP_OPEN_RECIPES_META || null };
})();
