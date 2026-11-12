/* Meal Prep language layer (app v34, the LANGUAGE BUILD).
   One strings table, keyed by dotted ids. English is the source of
   truth: every word the app shows lives here first in English.
   Spanish is the first complete UI language. t(key) resolves the
   active language, then English, then the key itself, so a missing
   word is never a blank.

   The app follows the device language (navigator.language primary
   subtag) unless the user picks otherwise in Preferences: the
   Language row (Auto, English, Español) is saved in settings (user
   data, Law B). A small mirror of that choice lives in localStorage
   so the very first paint of the next load is already in the right
   language; app.js reconciles the mirror from settings at boot.
   An unknown locale (fr, say) falls back to English whole: only
   languages with a complete table resolve.

   LEGAL FLAGGED SET (FLAGGED below): the allergy-safety wording and
   the calorie method lines ship in ENGLISH under every language
   until a human-checked translation exists. The Spanish table
   deliberately omits those keys, so t() falls back to English for
   them; the suite pins the set by name so no translation can
   silently cover it. The privacy and delete-account pages are
   separate files, untouched, and stay English the same way.

   Recipe CONTENT (names, ingredients, steps) is not in this table:
   it landed as phase 2 in app v36, in data.js (RECIPES_ES, the
   Quality pair read pack landed verbatim), and renders through the
   helpers in app.js. User-entered data is never translated. Numbers,
   amounts and units stay data. No em or en dash appears in either
   language, by the standing copy rule.

   PRICES (payments build, item 62): the three strings that name
   prices (upgrade.offer, plans.plusLine, plans.familyLine) carry
   price TOKENS, never figures: {plusMonthly}, {plusYearly},
   {familyMonthly}, {familyYearly} and the beside-note tokens
   {worthPlusMonthly} and friends. t() fills them from the prices
   table (prices-table.js, loaded before this file) for the active
   currency. While only the AUD row exists, the filled words are
   the locked prices, byte for byte as they shipped in v32; when
   Finance's country build adds rows, the same strings render in
   the user's own currency with the A$ worth beside. */
(function (root) {
  "use strict";

  var EN = {
    /* common words */
    "common.close": "Close",
    "common.add": "Add",
    "common.remove": "Remove",
    "common.undo": "Undo",
    "common.day": "day",
    "common.days": "days",
    "common.dayLeft": "{n} day left",
    "common.daysLeft": "{n} days left",
    "common.didNotWork": "That did not work. Try again.",
    "common.removedToast": "{name} removed.",
    "meal.breakfast": "Breakfast",
    "meal.lunch": "Lunch",
    "meal.dinner": "Dinner",
    "app.tagline": "Plan. Cook. Enjoy.",
    "app.loadingMeals": "Loading your meals.",
    /* the menu */
    "nav.group.plan": "Plan",
    "nav.group.kitchen": "Kitchen",
    "nav.group.people": "People",
    "nav.calendar": "Calendar",
    "nav.bottomPlan": "Plan",
    "nav.bottomFridge": "Fridge",
    "nav.bottomList": "List",
    "nav.bottomMore": "More",
    "nav.recipes": "Recipes",
    "nav.groceries": "Groceries",
    "nav.list": "Grocery List",
    "nav.photocal": "Photo calories",
    "nav.family": "Family",
    "nav.reminders": "Reminders",
    "nav.prefs": "Preferences",
    "nav.savedForLater": "Saved for later",
    "nav.useFirst": "Use first",
    "nav.today": "Today",
    "nav.nothingExpiring": "Nothing expiring soon.",
    "nav.tuckAway": "Tuck away",
    "nav.tuckPlan": "Tuck away the Plan group",
    "nav.tuckKitchen": "Tuck away the Kitchen group",
    "nav.tuckPeople": "Tuck away the People group",
    "nav.tuckedToast": "{group} tucked away. Find it under Saved for later.",
    "nav.restoredToast": "{group} is back in the menu.",
    "nav.bringBack": "Bring back",
    "nav.nothingTucked": "Nothing tucked away yet.",
    "nav.tuckTitleUsing": "You are using this area now, so it stays in the menu",
    "nav.tuckTitleLast": "One area always stays in the menu",
    "nav.menuLabel": "Main",
    "nav.toggleLabel": "Hide or show the side menu",
    /* side cards */
    "side.pastBest": "past its best",
    "side.useToday": "use today",
    "side.nothingPlanned": "Nothing planned",
    "side.noDinner": "No dinner planned for tonight.",
    "side.planDinner": "Plan dinner",
    /* calendar */
    "cal.sub": "Tap a day to see the meals. Tap a meal to open the full recipe.",
    "cal.month": "Month",
    "cal.week": "Week",
    "cal.day": "Day",
    "cal.year": "Year",
    "cal.prev": "Previous",
    "cal.next": "Next",
    "cal.import": "Bring my calendar in",
    "cal.noMeals": "No meals planned yet.",
    "cal.planFirstWeek": "Plan my first month",
    "cal.firstWeekPlanned": "Your first month is planned.",
    "cal.weekOf": "Week of",
    "cal.more": "+ {n} more",
    "cal.openDay": "Open day",
    "cal.cardMeta": "{min} min · eats {time}",
    "cal.dayMeta": "{min} min to cook · eat at {eat} · start cooking {start}",
    "cal.openFullRecipe": "Open full recipe",
    "cal.swapMeal": "Swap this meal",
    "cal.chooseMeal": "Choose a meal",
    "cal.removeMeal": "Remove meal",
    "cal.skip": "Skip",
    "cal.skipped": "Skipped",
    "cal.mealSwapped": "Meal swapped.",
    "cal.alsoOnThisDay": "Also on this day",
    "cal.removedFromPlan": "{name} removed from your plan.",
    "cal.mealFallback": "Meal",
    /* the recipe pop-up */
    "recipe.changesForFamily": "Changes for your family",
    "recipe.noChanges": "No listed family food conflicts were found. Check labels and cross-contact for allergies.",
    "recipe.dislikeLeaveOut": "Leave out the {food} for them.",
    "recipe.dislikeSwap": "Swap the {food} for {swap}.",
    "recipe.everyoneElse": "Everyone else gets the normal meal.",
    "recipe.metaLine": "{min} minutes · serves {n}",
    "recipe.notSuitable": "This recipe does not fit your saved food choices. Refill the plan or change your preferences.",
    "recipe.saveFavorite": "Save to favourites",
    "recipe.markCooked": "Mark as cooked",
    "recipe.cookedWord": "Cooked",
    "recipe.saveLeftovers": "Save leftovers",
    "toast.cookedShelf": "Cooked. Your shelf is updated: {names} used.",
    "toast.cookedPlain": "Cooked.",
    "toast.leftoversSaved": "{name} is on your shelf, best within 3 days.",
    "toast.dinnerPlanned": "Tonight: {name}.",
    "recipe.removeFavorite": "Remove from favourites",
    "recipe.favoriteSaved": "Saved to favourites.",
    "recipe.favoriteRemoved": "Removed from favourites.",
    "recipe.perServing": "per serving",
    "recipe.ingredients": "Ingredients",
    "recipe.howTo": "How to make it",
    "recipe.addMissing": "Add missing food to my grocery list",
    "recipe.cookingFor": "Cooking for",
    "recipe.startCooking": "Start cooking",
    "cook.title": "Cooking",
    "cook.back": "Recipe",
    "cook.stepOf": "Step {a} of {b}",
    "cook.prev": "Back",
    "cook.next": "Next step",
    "cook.finish": "Finish",
    "cook.timeUp": "time is up",
    "cook.timerDone": "Timer done: {label}",
    "cook.alsoToday": "Also today",
    "reel.watch": "Watch",
    "reel.pause": "Pause",
    "reel.play": "Play",
    "reel.replay": "Watch again",
    "recipe.deleteMine": "Delete my recipe",
    "recipe.deletedToast": "{name} deleted.",
    "toast.addedItems": "Added {n} items to your grocery list.",
    "toast.haveEverything": "You already have everything.",
    "kcal.about": "about {n} kcal",
    "kcal.roughly": "(roughly {low} to {high})",
    /* recipes view */
    "recipes.sub": "Add recipes your way, or search the ones you have.",
    "recipes.addTitle": "Add your recipe",
    "recipes.addHint": "Two ways to add: write your own recipe in full, or search the library by name.",
    "recipes.modeOwn": "My own recipe",
    "recipes.modeName": "Just the name",
    "recipes.nameLabel": "Recipe name",
    "recipes.namePh": "Grandma soup",
    "recipes.mealLabel": "Meal",
    "recipes.cookTime": "Cook time in minutes",
    "recipes.cuisineLabel": "Cuisine",
    "recipes.cuisinePh": "Mexican",
    "recipes.ingredientsLabel": "Ingredients, one per line. Start each line with the amount, like 200 g chicken breast",
    "recipes.ingredientsPh": "200 g chicken breast",
    "recipes.stepsLabel": "Steps, one per line",
    "recipes.stepsPh": "Cook the chicken until golden",
    "recipes.saveMine": "Save my recipe",
    "recipes.servingsLabel": "Serves (people)",
    "import.linkBtn": "From a link",
    "import.pasteBtn": "Paste the words",
    "import.fileBtn": "From a file",
    "import.linkLabel": "Recipe page link",
    "import.getBtn": "Get the recipe",
    "import.pasteLabel": "Paste the recipe words here",
    "import.makeBtn": "Make the card",
    "import.reading": "Reading the page...",
    "import.linkFailed": "That page could not be read here. Copy the recipe words from the page and use Paste the words instead.",
    "import.pasteFailed": "Those words did not split into a recipe. Keep the title first, then the ingredients, then the steps.",
    "import.fileFailed": "That file did not hold recipes I can read.",
    "import.checkThenSave": "Here is the card. Check it, fix anything, then Save my recipe.",
    "import.fileOne": "That file holds {n} new recipes. Check this one and save it, then pick the file again for the next.",
    "import.fileAllOld": "Those recipes are already in Your recipes.",
    "recipes.nameHint": "Search the recipe library by name. If nothing matches, add your own recipe details.",
    "recipes.nameInputPh": "Type a meal name",
    "recipes.getRecipe": "Find a recipe",
    "recipes.yoursTitle": "Your recipes",
    "recipes.allTitle": "All recipes",
    "recipes.matchTitle": "Find meals from what you have",
    "recipes.matchHint": "Your groceries are selected by default. Add or remove foods to change the matches.",
    "recipes.matchInputLabel": "Add an ingredient",
    "recipes.matchInputPh": "For example, tomato",
    "recipes.matchAdd": "Add food",
    "recipes.useGroceries": "Use all my groceries",
    "recipes.noIngredients": "No ingredients selected yet. Add foods or use your grocery list.",
    "recipes.addForMatches": "Add foods to see ingredient matches.",
    "recipes.usesCount": "You have {used} of {total} ingredients",
    "recipes.missingOne": "Missing 1 item",
    "recipes.missingMany": "Missing {n} items",
    "recipes.haveEverything": "You have everything",
    "recipes.stillNeed": "Still need: {items}",
    "recipes.removeIngredient": "Remove {name}",
    "recipes.toTaste": "to taste",
    "recipes.sourceLine": "Recipe source and license:",
    "recipes.sourceEnglishNote": "Recipe names, ingredient names, and steps from this source are in English.",
    "recipes.searchPh": "Search recipes",
    "recipes.showMore": "Show {n} more recipes",
    "recipes.ownEmpty": "Your own recipes will live here.",
    "recipes.favoritesTitle": "Favourites",
    "recipes.favoritesEmpty": "Recipes you save will appear here.",
    "recipes.favoriteFiltered": "Your saved recipes do not fit the current food choices. Change Preferences to see them.",
    "recipes.cardMeta": "{min} minutes · {n} ingredients",
    "recipes.noMatch": "No recipes match.",
    "recipes.noSuggestedMatch": "No recipe in the library matched that name. Add the recipe details yourself instead.",
    "recipes.addOwnInstead": "Add my own recipe details",
    "recipes.preferenceEmpty": "No recipes fit these food choices. Try changing your diet, cook time, or family food lists.",
    "recipes.matchLine": "Here is the recipe that matches that name. It is already in your list, so there is nothing to approve.",
    "recipes.openIt": "Open it",
    "recipes.approveLine": "Here is your recipe. Read it through. If you like it, approve it and we save it to your list.",
    "recipes.approveSave": "Approve and save",
    "recipes.startAgain": "Start again",
    "recipes.savedLine": "Approved and saved. It is in All recipes below now, and the planner can use it.",
    "recipes.openNamed": "Open {name}",
    "recipes.needName": "Give your recipe a name first.",
    "recipes.needMinutes": "Type how many minutes it takes, more than zero.",
    "recipes.needIngStep": "Add at least one ingredient and one step.",
    "recipes.ownSaved": "Saved. Find it in All recipes below, and the planner can now use it.",
    "toast.typeMealName": "Type a meal name first.",
    "toast.alreadyInList": "That recipe is already in your list.",
    "toast.recipeSaved": "Recipe approved and saved.",
    /* food styles (the pickers; recipe cards keep content wording) */
    "cuisine.Mexican": "Mexican",
    "cuisine.Greek": "Greek",
    "cuisine.Mediterranean": "Mediterranean",
    "cuisine.Italian": "Italian",
    "cuisine.Asian": "Asian",
    "cuisine.Indian": "Indian",
    "cuisine.American": "American",
    "cuisine.Australian": "Australian",
    "cuisine.Healthy": "Healthy",
    "cuisine.Comfort": "Comfort",
    "cuisine.Quick": "Quick",
    /* groceries */
    "storage.fridge": "Fridge",
    "storage.freezer": "Freezer",
    "storage.pantry": "Pantry",
    "groc.in.fridge": "in the fridge",
    "groc.in.freezer": "in the freezer",
    "groc.in.pantry": "in the pantry",
    "groc.sub": "Everything you have, in one place. Food that goes bad sooner is used in recipes first.",
    "groc.addTitle": "Add groceries",
    "groc.foodName": "Food name",
    "groc.foodNamePh": "Chicken breast",
    "groc.amount": "Amount",
    "groc.needAmount": "Add an amount more than zero.",
    "groc.unit": "Unit",
    "groc.storedIn": "Stored in",
    "groc.dateAdded": "Date added",
    "groc.shelfHintDefault": "Pick a food and we show how long it lasts. Times come from USDA food storage research and are a guide only.",
    "groc.shelfLine": "{label} lasts about {days} {dayWord} {place}.",
    "groc.addBtn": "Add to groceries",
    "groc.photoTitle": "Photo of your fridge or groceries",
    "groc.photoHint": "Photo suggestions are free for every account right now. The on-device food finder looks at your photo in pieces and can still miss or misname things. Check each name and amount; your photo stays on this device.",
    "groc.lookPhoto": "Look at my photo",
    "groc.haveTitle": "What you have",
    "groc.haveHint": "Sorted so the food to use first is at the top.",
    "groc.statusUseToday": "Use today",
    "groc.useFirst1": "Use first · {n} day left",
    "groc.useFirstN": "Use first · {n} days left",
    "groc.statusUseSoon": "Use soon · {n} days left",
    "groc.statusFresh": "Fresh · {n} days left",
    "groc.bestUntil": "best until",
    "groc.noGuideDate": "no standard guide date for this food yet",
    "groc.expiryGuide": "Best until dates are a standard guide for each food, not a promise. Trust your eyes and nose first.",
    "groc.empty": "Your kitchen shelves are empty.",
    "groc.addGroceryBtn": "Add a grocery",
    "toast.typeFoodName": "Type the food name first.",
    "toast.groceryAdded": "Added. Your planner now uses it before it goes bad.",
    /* fridge photo + photo calories */
    "photo.altFridge": "Your fridge or groceries photo",
    "photo.altFood": "Your food photo",
    "photo.addToGroceries": "Add to groceries",
    "photo.added": "Added",
    "photo.looking": "Looking at your photo now. The first time can take a minute.",
    "photo.downloading": "Getting the food finder ready (one time only): {pct}%",
    "photo.lookingPhoto": "The food finder is ready. Looking through your photo now.",
    "photo.maybeTitle": "Maybe also in your photo. Tap to add.",
    "photo.lasts": "Lasts about {n} days in the fridge.",
    "photo.foundTitle": "Possible matches. Please check.",
    "photo.foundHint": "Best guesses first. Tap a name below to correct it, and check each amount; nothing is saved until you confirm it. The confidence score is only a rough clue.",
    "photo.confidence": "Model confidence: {pct}%. Check this suggestion.",
    "photo.confidenceLow": "Low model confidence: {pct}%. This may be wrong; please check.",
    "photo.tapTitle": "I could not recognize a supported food in this photo.",
    "photo.tapHint": "Tell me what food you see below. Nothing is saved until you confirm it.",
    "photo.confirmName": "Food name to confirm or correct",
    "photo.manualLabel": "Food you see",
    "photo.manualPlaceholder": "Type a food or recipe ingredient",
    "photo.manualAdd": "Review this food",
    "photo.manualHint": "Use a suggestion or type any food. Confirm its name and amount before it is saved.",
    "photo.nameRequired": "Enter a food name first.",
    "photo.nameTooLong": "Keep food names to 80 characters or fewer.",
    "toast.addPhotoFirst": "Add a photo first.",
    "toast.itemAddedToGroceries": "{name} added to your groceries.",
    "photocal.sub": "Take a photo of food and get a rough calorie count for what the app can see.",
    "photocal.cardTitle": "Photo of food",
    "photocal.cardHint": "On-device photo suggestions cover only a few common foods and can miss or misname them. Your photo stays on this device.",
    "photocal.tapTitle": "Tap to add",
    "photocal.tapHint": "If the photo missed a food, tap it here. Each food counts as one typical serving, with the same rough guess as above.",
    "photocal.noneTitle": "Nothing named in this photo",
    "photocal.noneHint": "The quick look could not name any food in this photo. Use the tap to add list below and pick what is in it.",
    /* grocery list */
    "list.sub": "Built from your next 7 days of meals. Add or remove anything.",
    "list.addPh": "Add anything, like dish soap",
    "list.fromPlan": "From your plan",
    "list.gateHint": "Plus builds this list from your next 7 days of planned meals, grouped, with the amounts worked out.",
    "list.buildBtn": "Build my list from my plan",
    "list.seePlans": "See the Plans card",
    "list.addedByYou": "Added by you",
    "list.youHaveThis": "You have this",
    "list.youHaveAmount": "you have {qty} {unit} at home",
    "list.forRecipes": "For {names}",
    "list.sendBtn": "Send this list",
    "list.sendTitle": "My grocery list",
    "toast.listCopied": "List copied. Paste it anywhere.",
    "toast.listCopyFailed": "Copying did not work here. The list is on this screen.",
    "list.atHomeTitle": "Already at home",
    "list.putBack": "Put on the list",
    "list.emptyAuto": "Your list builds itself from your planned meals.",
    "list.emptyHand": "Nothing added by hand yet.",
    "toast.listReady": "Your first month is planned. Your list is ready.",
    "toast.addedToList": "Added to your grocery list.",
    "toast.removedFromList": "Removed from your list.",
    /* family */
    "fam.sub": "Each person has their own colour, tags, dislikes and allergies. New plans leave out recipes with listed foods for everyone. Check labels and shared equipment for allergies.",
    "fam.addTitle": "Add a person",
    "fam.name": "Name",
    "fam.colour": "Colour",
    "fam.colourWord": "Colour",
    "fam.tags": "Tags, split with commas",
    "fam.tagsPh": "Dad, loves spicy",
    "fam.dislikes": "Does not like, split with commas",
    "fam.dislikesPh": "capsicum, mushroom",
    "fam.allergies": "Allergies, split with commas",
    "fam.allergiesPh": "peanut",
    "fam.addBtn": "Add person",
    "fam.doesNotLike": "Does not like:",
    "fam.allergiesWord": "Allergies:",
    "fam.nothingListed": "nothing listed",
    "fam.noneListed": "none listed",
    "fam.empty": "Nobody here yet. Add the people you cook for.",
    "toast.addNameFirst": "Add a name first.",
    "toast.personAdded": "{name} added. New plans avoid their listed foods.",
    /* preferences */
    "prefs.sub": "Your food likes shape every plan the app makes.",
    "prefs.foodLike": "Food you like",
    "prefs.foodLikeHint": "Tap the food styles you want more of.",
    "prefs.dietStyle": "Diet",
    "prefs.diet.none": "No preference",
    "prefs.diet.vegetarian": "Vegetarian",
    "prefs.diet.vegan": "Vegan",
    "prefs.diet.pescatarian": "Pescatarian",
    "prefs.diet.dairyFree": "Dairy-free",
    "prefs.diet.glutenFree": "Avoid common gluten ingredients",
    "prefs.diet.halalFriendly": "Halal-friendly (check meat source)",
    "prefs.diet.kidFriendly": "Kid-friendly (milder foods)",
    "prefs.maxCook": "Maximum cook time, in minutes",
    "prefs.busyTitle": "Busy nights",
    "prefs.busyHint": "Tap the nights you get home late or tired. On those nights the planner only picks quick meals.",
    "prefs.quickLabel": "Quick means a cook time up to (minutes)",
    "prefs.anyTime": "Any time",
    "prefs.halalNote": "Halal-friendly excludes listed pork and alcohol, but check meat certification and every label.",
    "prefs.kidNote": "Kid-friendly is a mild-food guide, not a food-safety guarantee.",
    "prefs.defaultServings": "Servings per meal",
    "prefs.recipeSafetyHint": "Filters use ingredient names only. Always check labels and cross-contact for allergies.",
    "prefs.eatTimes": "Eating times",
    "prefs.breakfastAt": "Breakfast at",
    "prefs.lunchAt": "Lunch at",
    "prefs.dinnerAt": "Dinner at",
    "prefs.setupTime": "Setup time before cooking, in minutes",
    "prefs.alsoBreakfast": "Also remind me before breakfast, in minutes",
    "prefs.alsoLunch": "Also remind me before lunch, in minutes",
    "prefs.alsoDinner": "Also remind me before dinner, in minutes",
    "prefs.reminderHint": "Your start cooking reminder is your eating time, minus the cook time, minus your setup time.",
    "prefs.alsoHint": "The also remind me times are a second reminder, only if you want one. Each one lands that many minutes before you eat, and 0 means off.",
    "prefs.modeBreakfast": "Breakfast reminder",
    "prefs.modeLunch": "Lunch reminder",
    "prefs.modeDinner": "Dinner reminder",
    "prefs.byCookTime": "By cook time",
    "prefs.sameTimeDaily": "Same time daily",
    "prefs.modeHint": "By cook time works each reminder out from the dish you are cooking. Same time daily rings at one saved time instead.",
    "prefs.save": "Save preferences",
    "prefs.savedMsg": " Saved. New plans use these food choices. Reminders use these times.",
    "prefs.planTitle": "Plan",
    "prefs.fillMonth": "Fill this month with meals",
    "prefs.clearPlan": "Clear my plan",
    "prefs.planHint": "New plans favor food you have and leave out listed allergies and dislikes. Check labels and cross-contact.",
    "prefs.language": "Language",
    "prefs.langAuto": "Auto",
    "prefs.languageHint": "Auto follows the language of your device.",
    "toast.monthFilled": "Month filled with meals.",
    "toast.planCleared": "Plan cleared.",
    "confirm.clearPlanTitle": "Clear your plan?",
    "confirm.clearPlanText": "This removes every meal in your plan. Your recipes, family and groceries stay as they are.",
    /* plans card (the v32 offer's honest home) */
    "plans.title": "Plans",
    "plans.freeLine": "You are on the Free plan. The calendar, recipes, cooking reminders and data export are included. Allergy and dislike filters stay free in every plan.",
    "plans.freeNowLine": "Everything in Meal Prep is free right now. Every feature is open, and no plan is needed. Allergy and dislike filters are always free.",
    "plans.topLine": "You are on the Top plan. The calendar, recipes, cooking reminders and data export are included. Allergy and dislike filters stay free in every plan.",
    "plans.plusLine": "Meal Prep Plus is {plusMonthly}{worthPlusMonthly} a month or {plusYearly}{worthPlusYearly} a year, and your first month is free. Plus adds profiles for your whole table, the grocery list built from your plan, best until dates on your groceries, limited fridge photo suggestions to review, and unlimited plans and your own recipes.",
    "plans.onSaleLine": "Plus is on sale now, and this card is where you start it.",
    "plans.familyLine": "Meal Prep Family is {familyMonthly}{worthFamilyMonthly} a month or {familyYearly}{worthFamilyYearly} a year. It comes later, when its extras are built.",
    /* buy surface (app v46): the enabling build's buttons, built
       first and in brand; prices ride the table tokens like every
       other price in the app, never written into the words */
    "plans.buyFreeLine": "Your first month is free. Cancel any time.",
    "plans.buyMonthly": "Plus, {plusMonthly}{worthPlusMonthly} a month",
    "plans.buyYearly": "Plus, {plusYearly}{worthPlusYearly} a year",
    "plans.restore": "Restore a purchase",
    /* paywall disclosure + links row (app v48, SR's G7 item): the
       three renewal truths under the buy box, in plain words, with
       the prices riding the table tokens like every other price */
    "plans.disclosure": "Plus renews automatically at {plusMonthly} a month or {plusYearly} a year until you cancel. Cancel any time in your Apple ID subscriptions. Plus stays open until the end of the period you have paid for.",
    "plans.terms": "Terms of Use",
    "plans.buyDone": "Plus is on for this account. Thank you.",
    "plans.buyCancelled": "The purchase was cancelled. Nothing was charged.",
    "plans.buyFailed": "The purchase did not go through. Nothing was charged.",
    "plans.buySlow": "This is taking a long while. Check your connection and try again.",
    "plans.buyDormant": "Buying is not switched on in this copy yet.",
    "plans.restoreFound": "Your Plus purchase is back on for this account.",
    "plans.restoreNone": "No Plus purchase was found for this account.",
    "plans.restoreUnknown": "We could not check your purchases just now. Check your connection and try again.",
    /* appearance */
    "appear.title": "Appearance",
    "appear.hint": "Pick the background the app wears. Brand is the Meal Prep look, and it stays the standard look.",
    "appear.groupLabel": "Background",
    "appear.brand": "Brand",
    "appear.white": "White",
    "appear.black": "Black",
    "appear.yourPhoto": "Your photo",
    "appear.photoHint": "Your photo sits behind the app, under a soft veil so words stay easy to read. It is saved on this device only, as part of your data. Only you can replace or remove it. The app never deletes it.",
    "appear.choosePhoto": "Choose a photo",
    "appear.replacePhoto": "Replace photo",
    "appear.removePhoto": "Remove photo",
    "appear.photoSaved": "Your photo is saved on this device and is part of your data.",
    "appear.noPhotoYet": "No photo yet. Choose one and it becomes your background.",
    "toast.choosePhotoBg": "Choose a photo and it becomes your background.",
    "toast.photoRemoved": "Photo removed. Your background is Brand again.",
    "toast.photoNowBg": "Your photo is the background now.",
    "toast.photoUnreadable": "That photo could not be read. Try another one.",
    "confirm.removePhotoTitle": "Remove your photo?",
    "confirm.removePhotoText": "Your background photo is removed from this device. This is the only copy, so it cannot be brought back.",
    /* setup guide card + your data card */
    "setup.title": "Setup guide",
    "setup.hint": "Walk through the setup with Mina, from where you left off. Nothing in the app waits on it.",
    "setup.open": "Open the setup guide",
    "importcard.hint": "Copy your events from Google, Apple, Outlook or a calendar file into this calendar. Read only: nothing in your old calendar changes, and importing again never doubles anything.",
    "account.title": "Account",
    "data.title": "Your data",
    "data.download": "Download my data",
    "data.localLine": "Everything is saved on this device only.",
    "data.exportHint": "One file with your recipes, plans, lists, groceries and settings.",
    "data.backedUpLine": "Backed up to your account ({email}). A copy also stays on this device.",
    "data.privacy": "Privacy policy",
    /* reminders */
    "rem.sub": "Start cooking times for your next 7 days, worked out from each recipe and your eating times.",
    "rem.notifTitle": "Notifications",
    "rem.statusOff": "Notifications are off.",
    "rem.statusOn": "Notifications are on for this device.",
    "rem.statusBlocked": "Notifications were blocked by the browser. You can turn them on in your browser settings for this site.",
    "rem.turnOn": "Turn on notifications",
    "rem.sendTest": "Send a test",
    "rem.comingUp": "Coming up",
    "rem.empty": "No reminders yet. They come from your planned meals.",
    "rem.gotoCalendar": "Go to my calendar",
    "rem.startCooking": "start cooking",
    "rem.dayBefore": "the day before",
    "rem.eatAt": "eat at",
    "rem.cookTime": "cook time",
    "rem.setupWord": "setup",
    "rem.alsoWord": "also at",
    "toast.browserNoNotif": "This browser cannot show notifications.",
    "toast.notifOn": "Notifications are on.",
    "toast.notifNotOn": "Notifications were not turned on.",
    "notif.testTitle": "Meal Prep test",
    "notif.testBody": "Cooking reminders will look like this.",
    "notif.startTitle": "Time to start cooking",
    "notif.expiryTitle": "Use it before it goes off",
    "notif.expiryBody": "{name} needs using by {date}.",
    "notif.startBody": "{name} for {meal}. You eat at {time}, so start now and take {setup} minutes to set up first.",
    "notif.soonTitle": "Coming up soon",
    "notif.soonBody": "{name} for {meal}. You eat at {time}, in {min} minutes.",
    "confirm.keepIt": "Keep it",
    /* calendar import sheet */
    "import.readonlyHint": "Read only. This copies your events into Meal Prep. Nothing in your old calendar changes, and importing again never doubles anything.",
    "import.groupLabel": "Where is your calendar?",
    "import.srcFile": "A calendar file",
    "import.linkLabel": "Paste the calendar link",
    "import.bringItIn": "Bring it in",
    "import.chooseFile": "Choose a file instead",
    "import.done": "Done",
    "import.guide.google": "In Google Calendar: Settings → your calendar → “Secret address in iCal format”. Copy it, paste it below.",
    "import.guide.apple": "On iCloud.com: Calendar → the share icon beside a calendar → Public Calendar gives a link. Or export a .ics file from the Calendar app and choose it below.",
    "import.guide.outlook": "In Outlook on the web: Settings → Calendar → Shared calendars → publish, and copy the ICS link. Paste it below.",
    "import.guide.file": "Pick the .ics file your old calendar exported. It is read once, copied in, and the file itself is never changed.",
    "import.label.file": "a calendar file",
    "import.notCalendar": "That did not read as a calendar. Nothing was brought in.",
    "import.broughtIn1": "{n} event brought in",
    "import.broughtInN": "{n} events brought in",
    "import.alreadyHere": "{n} already here",
    "import.couldNotRead": "{n} could not be read",
    "import.pasteFirst": "Paste a calendar link first, or choose a file below.",
    "import.fetching": "Fetching...",
    "import.fetchFail": "That link could not be fetched. Some calendars block links. Export a .ics file from it instead; that always works.",
    "import.fileFail": "That file could not be read.",
    "toast.calendarIn": "Calendar brought in.",
    "toast.nothingNew": "Nothing new to bring in."
  };

  /* The upgrade moment popup (v32 copy of record, UPGRADE-COPY.md)
     and the tour ride the same table. */
  var EN2 = {
    "upgrade.bubble": "This one is a Plus treat.",
    "upgrade.offer": "Try Plus free for your first month. After that, Plus is {plusMonthly}{worthPlusMonthly} a month or {plusYearly}{worthPlusYearly} a year. Cancel any time.",
    "upgrade.try": "Try Plus free",
    "upgrade.notNow": "Not now",
    "upgrade.family.title": "Cook for your whole table",
    "upgrade.family.body": "The Free plan covers one person profile. Plus gives everyone at your table their own profile, with their own dislikes and tags, so new plans can avoid each person’s listed foods.",
    "upgrade.family.gate": "Free covers one person profile. The whole table is a Plus extra, and everything else here still works.",
    "upgrade.list.title": "Your list, written for you",
    "upgrade.list.body": "Plus builds your grocery list from the next 7 days of planned meals, grouped, with the amounts worked out. No more writing it out by hand.",
    "upgrade.list.gate": "The list built from your plan is a Plus extra.",
    "upgrade.photo.title": "Fridge photo suggestions",
    "upgrade.photo.body": "Your first fridge photo scan is free. After that, Plus uses an on-device model to suggest a few common items. It may miss or misname foods. Check each suggestion and confirm its amount before adding it to groceries. Your photo stays on this device.",
    "upgrade.photo.gate": "Your free fridge photo scan has been used. Photo suggestions are a Plus extra. You can still type your groceries in above.",
    /* Mina's tour (the sheet words of record) */
    "tour.bubble1": "I will watch the clock.",
    "tour.bubble2": "This is your menu. Everything lives here.",
    "tour.bubble3": "Pick your food styles.",
    "tour.bubble4": "Who is at your table?",
    "tour.bubble5": "What is in your kitchen?",
    "tour.bubble6": "Let us plan your first month.",
    "tour.bubble7": "When do you eat?",
    "tour.bubble8": "Dinner is on me.",
    "tour.bubbleCelebrate": "First meal planned. Lovely work.",
    "tour.welcomeBubbleNamed": "Hello, {name}. I will watch the clock.",
    "tour.nameTitle": "Hi! I'm Mina. Welcome in! What should we call you?",
    "tour.yourName": "Your name",
    "tour.next": "Next",
    "tour.start": "Start",
    "tour.continue": "Continue",
    "tour.finish": "Finish",
    "tour.done": "Done",
    "tour.skip": "Skip tour",
    "tour.closeAria": "Close the tour",
    "tour.minaAlt": "Mina the Timer, your guide",
    "tour.minaWaveAlt": "Mina the Timer, waving goodbye",
    "tour.welcomeLine": "Plan your week of meals, use food before it goes bad, and get reminded when to start cooking.",
    "guide.gotIt": "Got it",
    "guide.moment.groceries": "This is your fridge shelf. Add what you bought today, and I will watch the dates for you.",
    "guide.moment.groceriesBtn": "Add a food",
    "guide.moment.list": "This list builds itself from your plan. Plan a meal, then come and watch it fill up.",
    "guide.moment.listBuilt": "Your plan built this list. Tick things off as you shop.",
    "guide.moment.photocal": "Point your camera at a meal, and I will take a rough, honest guess at the calories.",
    "guide.moment.photocalBtn": "Take a photo",
    "guide.moment.family": "Everyone at your table gets a colour. Their allergies and dislikes shape every plan.",
    "guide.moment.familyBtn": "Add a person",
    "guide.moment.reminders": "Reminders tap you when it is time to cook, so nothing needs watching.",
    "guide.moment.remindersBtn": "Turn on reminders",
    "guide.moment.recipes": "This is your recipe box. Add your own, or bring one in from a link, a paste or a file.",
    "guide.moment.recipesBtn": "Add a recipe",
    "guide.moment.cook": "Cook mode keeps one big step on screen. Tap a time inside a step and its timer starts.",
    "guide.checkTitle": "Getting started",
    "guide.check.table": "Add yourself to the table",
    "guide.check.styles": "Pick your food styles",
    "guide.check.plan": "Plan your first meal",
    "guide.check.list": "See your list build itself",
    "guide.check.fridge": "Add a food to your fridge",
    "guide.check.person": "Add someone to your table",
    "guide.check.reminders": "Turn on reminders",
    "guide.checkDone": "You know your way around now. Mina stays close if you need her.",
    "guide.back": "Welcome back. It is good to see you.",
    "guide.backNoPlan": "Today has no meals planned yet.",
    "guide.newTitle": "Two things changed",
    "guide.newLine": "Everything in Meal Prep is free now, no plan needed. And the app is in English only for a while. Everything you saved is still here.",
    "tour.menuLine": "Plan is your calendar and your recipes. Kitchen is your groceries, your list and photo calories. People is your table and your reminders.",
    "tour.stylesLine": "Tap the styles you like. Taps save at once.",
    "tour.tableLine": "Add the people you cook for. Each person is saved the moment you add them.",
    "tour.tagsLabel": "Tags",
    "tour.tagsPh": "partner, kids",
    "tour.dislikesLabel": "Foods they do not like",
    "tour.dislikesPh": "olives, mushrooms",
    "tour.allergiesLabel": "Allergies",
    "tour.allergiesPh": "peanuts, shellfish",
    "tour.personSaved": " {name} saved. Add another, or continue.",
    "tour.wholeTablePlus": " The whole table is a Plus extra.",
    "tour.kitchenLine": "Add what is in your kitchen. Items save at once, and the planner uses them before they go bad.",
    "tour.foodNamePh": "spinach",
    "tour.keptIn": "Kept in",
    "tour.addToKitchen": "Add to my kitchen",
    "tour.itemSaved": " {name} saved.",
    "tour.photoInstead": "Use a fridge photo instead",
    "tour.planLinePlanned": "Your first month is in the calendar. Mina is pleased.",
    "tour.planLineEmpty": "One tap fills this month with meals that suit your table.",
    "tour.planAgain": "Plan it again",
    "tour.timesLine": "Set your eating times and how long you need to get set up. Changes save at once.",
    "tour.setupLabel": "Minutes to set up",
    "tour.notifHint": "We remind you when to start cooking. You can say Not now instead.",
    "tour.importHintQ": "Want to bring your old calendar in?",
    "tour.importBtn": "Bring my old calendar in",
    "tour.goodbyeLine": "That is everything. Your meals, your people and your kitchen are all in the app now.",
    "tour.backupBtn": "Back up my data with an account",
    "tour.backupHint": "Optional. Your data also lives safely on this device.",
    "tour.saveBtn": "Save",
    "toast.planReady": "Your plan is ready. Tap any day to see the meals.",
    /* the door page (v33, the v4 shape; ruled words) */
    "door.sub": "Sign in or make your account",
    "door.googleAria": "Continue with Google",
    "door.appleAria": "Continue with Apple",
    "door.orEmail": "or with email",
    "door.email": "Email",
    "door.emailPh": "you@example.com",
    "door.demoLine": "Just looking? Open the demo with a code",
    "door.guestLine": "Continue as a guest",
    "door.backAria": "Back",
    "door.change": "Change",
    "door.passwordLabel": "Your password",
    "door.eyeShow": "Show",
    "door.eyeHide": "Hide",
    "door.eyeAria": "Show or hide the password",
    "door.caption": "This one button does both. It signs you in, or makes your account if you are new.",
    "door.forgot": "Forgot password?",
    "door.emailFirst": "Type your email first, then continue.",
    "door.emailBad": "That email does not look right. Check it and try again.",
    "door.pwFirst": "Type your password first, then continue.",
    "door.resetSent": " Password reset email sent. Follow its steps, then sign in here.",
    "door.genericLine": "That email and password did not work. Check them both and try again.",
    "door.slowSignin": "Signing in is taking a long while. You can wait here, or try one of the doors below.",
    "door.oneMoment": "One moment.",
    /* demo entries */
    "demo.exploreLine": "Explore the demo: a made up kitchen, seeded so you can try everything. Nothing in it is real, and deleting is off in the demo.",
    "demo.exploreBtn": "Explore the demo",
    "demo.codeLabel": "Reviewer access code",
    "demo.codePh": "From the review notes",
    "demo.openWithCode": "Open with code",
    "demo.typeCode": "Type the access code from the review notes.",
    "demo.codeNoMatch": "That code did not match.",
    "demo.notOn": "The demo is not switched on for this build yet.",
    "demo.codeUnreachable": "We could not check that code just now. Check your connection and try again.",
    "demo.sessionClosed": "That demo session has closed. Open the demo again to look around.",
    "demo.guardToast": "Deleting is off in the demo.",
    /* account card + name + import offer */
    "account.signinHint": "Sign in to keep your data safe and see it on your other devices.",
    "account.openDoor": "Sign in or create your account",
    "account.justLooking": "Just looking?",
    "account.demoSessionWord": "Demo session.",
    "account.demoSessionRest": "This kitchen is made up, so you can try everything. Deleting is off in the demo, and nothing here is real.",
    "account.hello": "Hello, {name}.",
    "account.signedInAs": "Signed in as {email}.",
    "account.yourAccountFallback": "your account",
    "account.planLine": "Plan: {plan}",
    "account.planTop": "Top plan",
    "account.planFree": "Free plan",
    "account.editName": "Edit your name",
    "account.addName": "Add your name",
    "account.importOffer": "This device holds your guest data (your family, groceries and plans from before you had an account). Bring it into your account? It moves: after a successful move it lives in your account, not as loose guest data on this device.",
    "account.bringIn": "Bring my data in",
    "account.leaveDemo": "Leave the demo",
    "account.signOut": "Sign out",
    "account.removeDevice": "Remove my data from this device",
    "account.removeDeviceNote": "Removing data from this device clears this device's saved copy only. Your account copy stays safe and comes back when you sign in.",
    "account.removedOk": " Removed from this device. Your account copy is untouched.",
    "account.removedGone": " That copy was already gone.",
    "account.nameSavedToast": "Your name is saved.",
    "account.typeNameFirst": " Type your name first.",
    "account.saveMyName": "Save my name",
    "account.cancel": "Cancel",
    "account.deletedNotice": "Your account is deleted. Everything in it is gone, and this device no longer holds a copy.",
    "account.slowLoad": "Your account is taking a long while to load. Check your connection and try again.",
    "account.slowSignOut": "Signing out is taking a long while. Check your connection and try again.",
    "import.guestUnread": " The guest data could not be read on this device. Nothing was moved.",
    "import.dataInAccountToast": "Your data is in your account now.",
    "import.moveFailed": " The move did not finish. Your data is still on this device, nothing was lost. Try again when the connection is better.",
    /* delete my account (the in-app door) */
    "account.deleteTitle": "Delete my account",
    "account.deleteWarn1": "Deleting is forever. Your family, groceries, plans, recipes, lists and settings are deleted from your account and cannot be brought back.",
    "account.deleteWarn2": "The only thing that stays is the anonymous counters your account added to the app totals: counts only, never your name or anything you made.",
    "account.downloadFirst": "Download my data first",
    "delete.sureWord": "Are you sure?",
    "delete.sureRest": "This is forever. Once it runs, your account and everything in it are gone, and nobody can bring them back.",
    "delete.pwHint": "Type your password to prove this account is yours. Nothing is deleted until this check passes.",
    "delete.confirmWith": "You will confirm with {provider} to prove this account is yours. Nothing is deleted until this check passes.",
    "delete.yesForever": "Yes, delete my account forever",
    "delete.keepAccount": "Keep my account",
    "delete.typePwFirst": " Type your password first.",
    "delete.checking": " Checking it is you, then deleting. This can take a moment.",
    "delete.reauthFail": " The sign in check did not pass, so nothing was deleted. Check your password and try again.",
    "delete.authUserFail": " Your data is deleted, but the sign in record could not be removed. Sign out, then sign in again and run Delete my account once more to finish.",
    "delete.stoppedAt": " Deleting stopped at {step}. Everything before that step is gone; the rest is still in your account. Run Delete my account again to finish.",
    "delete.oneStep": "one step",
    "delete.notFinished": " Deleting did not finish. Your account is still here. Try again when the connection is better.",
    "delete.step.familyMembers": "your family",
    "delete.step.pantryItems": "your groceries",
    "delete.step.planDays": "your planned days",
    "delete.step.customRecipes": "your recipes",
    "delete.step.shoppingExtras": "your shopping extras",
    "delete.step.shoppingItemState": "your shopping list marks",
    "delete.step.importedEvents": "your imported events",
    "delete.step.imports": "your import records",
    "delete.step.recoveredItems": "your recovered items",
    "delete.step.tier": "your plan record",
    "delete.step.profile": "your profile",
    /* ---- LEGAL FLAGGED SET: English under every language, until a
       human-checked translation exists. The Spanish table omits
       every one of these keys on purpose. ---- */
    "legal.allergyWord": "Allergy.",
    "legal.allergyLeaveOut": "Leave out the {food} for them.",
    "legal.allergySwap": "Swap the {food} for {swap}.",
    "legal.allergyEveryone": "Everyone else gets the normal meal.",
    "legal.shelfGuide": "Guide only, always check food before eating it.",
    "legal.pastBest": "Past its best. Check before use.",
    "legal.calorieMethod": "Calorie estimates are worked out from USDA FoodData Central values and the recipe amounts. Information only, not medical advice.",
    "legal.photoCalorieNote": "A photo cannot weigh food. These numbers are a rough guess based on a typical serving."
  };
  Object.keys(EN2).forEach(function (k) { EN[k] = EN2[k]; });

  var FLAGGED = ["legal.allergyWord", "legal.allergyLeaveOut", "legal.allergySwap", "legal.allergyEveryone", "legal.shelfGuide", "legal.pastBest", "legal.calorieMethod", "legal.photoCalorieNote"];

  /* Spanish: the first complete UI language. Plain words, short
     warm lines, the app's voice. The legal flagged set is NOT
     here: those keys fall back to English by design. */
  /* Spanish is HELD BACK (the 2 Nov ruling): the shipped app is
     English only. The full Spanish table is saved, unshipped, in
     spanish-saved.js at the app root; it is not in the packaged app
     and not in the precache. Restore by pasting the table back here.
     The empty table below keeps the language machinery whole and
     dormant: with no Spanish words in the shipped file, every
     resolution falls back to English. */
  var ES = {};

  var STRINGS = { en: EN, es: ES };
  var MIRROR_KEY = "mealPrepLangChoice";

  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function cleanChoice(c) { return c === "en" || c === "es" ? c : "auto"; }
  /* Only a language with a complete table resolves; anything else
     (fr, de, a half-known locale) falls back to English whole. */
  function resolve(choice) {
    /* HELD (the 2 Nov ruling): the shipped app is English only.
       Every resolution lands on English while the hold stands, so
       dates, day names and the page language are English too, on
       any device. The Spanish table is saved in spanish-saved.js;
       lifting the hold is deleting this line and the one in
       resolveFor, once the table is pasted back. */
    return "en";
    if (choice === "en" || choice === "es") return choice;
    var nav = "";
    try { nav = (typeof navigator !== "undefined" && navigator.language) || ""; } catch (e) {}
    var primary = String(nav).toLowerCase().split("-")[0];
    return STRINGS[primary] ? primary : "en";
  }

  var choice = cleanChoice(storeGet(MIRROR_KEY) || "auto");
  var active = resolve(choice);

  /* t(key, params): active language, then English, then the key
     itself. {name} style tokens are filled from params. */
  function t(key, params) {
    var s = (STRINGS[active] && STRINGS[active][key]) || EN[key] || key;
    if (params) {
      s = s.replace(/\{([a-zA-Z]+)\}/g, function (m, name) {
        return params[name] != null ? String(params[name]) : m;
      });
    }
    /* Price tokens fill from the prices table (see the header):
       the copy paths never carry a figure of their own. */
    if (root.MP_PRICES && typeof root.MP_PRICES.fill === "function") s = root.MP_PRICES.fill(s);
    return s;
  }

  /* Static words: index.html carries data-i18n keys (text),
     data-i18n-ph (placeholder), data-i18n-label (aria-label) and
     data-i18n-title (title). Applied at boot, before first paint,
     and the English words stay in the markup as the no-JS floor. */
  function applyStatic(scope) {
    if (typeof document === "undefined") return;
    var rootEl = scope || document;
    rootEl.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    rootEl.querySelectorAll("[data-i18n-ph]").forEach(function (el) { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
    rootEl.querySelectorAll("[data-i18n-label]").forEach(function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-label"))); });
    rootEl.querySelectorAll("[data-i18n-title]").forEach(function (el) { el.setAttribute("title", t(el.getAttribute("data-i18n-title"))); });
  }

  var API = {
    STRINGS: STRINGS,
    FLAGGED: FLAGGED,
    t: t,
    lang: function () { return active; },
    locale: function () { return active === "es" ? "es-ES" : "en-AU"; },
    choice: function () { return choice; },
    setChoice: function (c) { choice = cleanChoice(c); storeSet(MIRROR_KEY, choice); active = resolve(choice); },
    /* app.js calls this once, right after the state loads: the
       settings choice is the record; the mirror is only a boot
       cache. Returns true when the resolved language changed, so
       the caller reloads before anything renders. */
    adoptSettingsChoice: function (c) {
      var before = active;
      var want = cleanChoice(c || "auto");
      if (want !== choice) { choice = want; storeSet(MIRROR_KEY, choice); active = resolve(choice); }
      return active !== before;
    },
    resolveFor: function (navLang, ch) {
      return "en"; /* HELD, the same 2 Nov ruling as resolve() above. */
      if (ch === "en" || ch === "es") return ch;
      var primary = String(navLang || "").toLowerCase().split("-")[0];
      return STRINGS[primary] ? primary : "en";
    },
    applyStatic: applyStatic
  };
  root.MP_LANG = API;

  /* Boot (browser only): the html lang follows the active language
     and the static words land before first paint. */
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.setAttribute("lang", active);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { applyStatic(document); });
    else applyStatic(document);
  }
})(typeof window !== "undefined" ? window : globalThis);
