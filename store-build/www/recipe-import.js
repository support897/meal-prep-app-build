/* Save a recipe from anywhere (29 Oct, proposal item 4): three
   doors, no server. A recipe page carries its recipe as schema.org
   JSON-LD on most recipe sites, and that is what the link door
   reads. Pasted words (a recipe copied from a page, or a TikTok or
   Instagram caption) are split into ingredients and steps on the
   device. Every door lands on the Add a recipe form, which is the
   check screen: nothing saves until the person reads it and taps
   Save my recipe. A photo of a page is NOT a door here: this module
   reads words, and the honest photo reader is the parked AI road. */

export function isoMinutes(iso) {
  if (typeof iso !== "string") return 0;
  const m = iso.match(/^P(?:\d+D)?T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!m) return 0;
  return Math.round((Number(m[1]) || 0) * 60 + (Number(m[2]) || 0) + (Number(m[3]) || 0) / 60);
}

function flattenInstructions(x) {
  if (!x) return [];
  if (typeof x === "string") return x.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  if (Array.isArray(x)) { const out = []; x.forEach(function (e) { flattenInstructions(e).forEach(function (s) { out.push(s); }); }); return out; }
  if (typeof x === "object") {
    if (typeof x.text === "string" && x.text.trim()) return [x.text.trim()];
    if (x.itemListElement) return flattenInstructions(x.itemListElement);
  }
  return [];
}

function yieldServings(y) {
  if (typeof y === "number" && y > 0) return Math.round(y);
  const s = Array.isArray(y) ? String(y[0] || "") : String(y || "");
  const m = s.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function candidatesOf(parsed, out) {
  if (!parsed || typeof parsed !== "object") return out;
  if (Array.isArray(parsed)) { parsed.forEach(function (p) { candidatesOf(p, out); }); return out; }
  out.push(parsed);
  if (Array.isArray(parsed["@graph"])) parsed["@graph"].forEach(function (p) { candidatesOf(p, out); });
  return out;
}

function isRecipe(o) {
  const ty = o && o["@type"];
  return ty === "Recipe" || (Array.isArray(ty) && ty.indexOf("Recipe") !== -1);
}

/* The link door: pull the recipe card data out of a page's HTML.
   Returns the form shape { name, minutes, servings, cuisine,
   ingredientLines, stepLines } or null when the page carries no
   readable recipe card. */
export function recipeFromJsonLd(html) {
  if (typeof html !== "string" || !html) return null;
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let bm;
  while ((bm = re.exec(html)) !== null) blocks.push(bm[1]);
  for (let bi = 0; bi < blocks.length; bi++) {
    let parsed = null;
    try { parsed = JSON.parse(blocks[bi].trim()); } catch (e) { continue; }
    const cands = candidatesOf(parsed, []);
    for (let ci = 0; ci < cands.length; ci++) {
      const o = cands[ci];
      if (!isRecipe(o)) continue;
      const ings = Array.isArray(o.recipeIngredient) ? o.recipeIngredient.map(function (s) { return String(s).trim(); }).filter(Boolean) : [];
      const steps = flattenInstructions(o.recipeInstructions);
      if (!o.name || ings.length < 2 || !steps.length) continue;
      let minutes = isoMinutes(o.totalTime);
      if (!minutes) minutes = isoMinutes(o.prepTime) + isoMinutes(o.cookTime);
      const cuisine = Array.isArray(o.recipeCuisine) ? String(o.recipeCuisine[0] || "") : String(o.recipeCuisine || "");
      return { name: String(o.name).trim(), minutes: minutes || 30, servings: yieldServings(o.recipeYield) || 2, cuisine: cuisine.trim(), ingredientLines: ings, stepLines: steps };
    }
  }
  return null;
}

const FRACS = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 0.33, "⅔": 0.67, "⅛": 0.125 };
function leadAmount(line) {
  const f = line.match(/^(\d+)\s*\/\s*(\d+)\s*/);
  if (f) return String(Math.round((Number(f[1]) / Number(f[2])) * 100) / 100) + " " + line.slice(f[0].length);
  const u = line.match(/^([¼½¾⅓⅔⅛])\s*/);
  if (u) return String(FRACS[u[1]]) + " " + line.slice(u[0].length);
  return line;
}
function looksLikeIngredient(line) {
  return /^(\d|[¼½¾⅓⅔⅛])/.test(line) && line.length <= 90;
}

/* The paste door: split pasted words into a title, ingredients and
   steps. A line that opens with an amount counts as an ingredient
   until the long sentences start; section headings (Ingredients,
   Ingredientes, Steps, Preparación and friends) switch the road
   explicitly when the person kept them. */
export function recipeFromText(text) {
  const lines = String(text || "").split(/\r?\n/).map(function (s) { return s.replace(/^[\s•\-*]+/, "").trim(); }).filter(Boolean);
  if (lines.length < 3) return null;
  let minutes = 0, servings = 0;
  lines.forEach(function (line) {
    const h = line.match(/(\d+)\s*(?:hours?|hrs?|horas?)\b/i);
    const mi = line.match(/(\d+)\s*(?:minutes?|mins?|minutos?)\b/i);
    if (!minutes && (h || mi)) minutes = (h ? Number(h[1]) * 60 : 0) + (mi ? Number(mi[1]) : 0);
    if (!servings) { const sv = line.match(/(?:serves|servings|porciones|rinde)\s*:?\s*(\d+)/i); if (sv) servings = Number(sv[1]); }
  });
  let name = "", mode = "head", inSteps = false;
  const ings = [], steps = [];
  lines.forEach(function (rawLine) {
    const line = leadAmount(rawLine);
    if (/^(ingredients?|ingredientes)\b/i.test(rawLine)) { mode = "ing"; return; }
    if (/^(steps?|method|directions|instructions|preparaci[oó]n|instrucciones)\b/i.test(rawLine)) { mode = "steps"; return; }
    /* Short housekeeping lines (Serves 4, Ready in 35 minutes) are
       facts about the recipe, never a step. */
    if (rawLine.length <= 45 && /^(serves|servings|ready in|prep time|cook time|total time|porciones|rinde)\b/i.test(rawLine)) return;
    if (mode === "ing") { ings.push(line); return; }
    if (mode === "steps" || inSteps) { steps.push(line); return; }
    if (!name && !looksLikeIngredient(line)) { name = rawLine; return; }
    if (looksLikeIngredient(line)) { ings.push(line); return; }
    inSteps = true; steps.push(line);
  });
  if (!name || ings.length < 2 || !steps.length) return null;
  return { name: name, minutes: minutes || 30, servings: servings || 2, cuisine: "", ingredientLines: ings, stepLines: steps };
}
