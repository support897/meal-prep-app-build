/* Food eye: on-device CLIP zero-shot food finder for the fridge photo.
   Splits the photo into overlapping tiles, scores each tile against food
   descriptions (text vectors are precomputed in vendor/hf/food-labels.json)
   and ranks the foods. The model file downloads once, then is cached. */
const MODEL = "Xenova/clip-vit-base-patch16";
let cache = null;
async function load(progress) {
  if (cache) return cache;
  cache = (async function () {
    const hf = await import("./vendor/hf/transformers.min.js");
    hf.env.allowLocalModels = false;
    hf.env.useBrowserCache = true;
    try { hf.env.backends.onnx.wasm.proxy = true; } catch (e) { /* run on main thread */ }
    const labels = await (await fetch("vendor/hf/food-labels.json")).json();
    const proc = await hf.AutoProcessor.from_pretrained(MODEL);
    const vm = await hf.CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: "q8", progress_callback: progress });
    return { hf: hf, labels: labels, proc: proc, vm: vm };
  })();
  cache.catch(function () { cache = null; });
  return cache;
}
function norm(v) { let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i]; n = Math.sqrt(n) || 1; return Array.from(v, function (x) { return x / n; }); }
async function tiles(hf, src, grids) {
  const img = await hf.RawImage.fromURL(src);
  const W = img.width, H = img.height, out = [img];
  for (const n of grids) {
    const tw = Math.round(W / n * 1.3), th = Math.round(H / n * 1.3);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = Math.min(W - tw, Math.round(i * (W - tw) / (n - 1))), y = Math.min(H - th, Math.round(j * (H - th) / (n - 1)));
      out.push(await img.crop([x, y, x + tw - 1, y + th - 1]));
    }
  }
  return out;
}
/* Returns [{ name, score, rank }] best first (up to 20). */
export async function findFoods(src, progress, grids) {
  const m = await load(progress);
  const keys = m.labels.keys, raw = {};
  for (const t of await tiles(m.hf, src, grids || [2, 3, 4])) {
    await new Promise(function (r) { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
    const o = await m.vm(await m.proc(t));
    const e = norm(o.image_embeds.data);
    const lg = m.labels.emb.map(function (l) { let s = 0; for (let i = 0; i < e.length; i++) s += l[i] * e[i]; return 100 * s; });
    lg.forEach(function (v, i) { if (i < keys.length) { const r = raw[keys[i]] || (raw[keys[i]] = { mx: -99, top5: 0 }); if (v > r.mx) r.mx = v; } });
    lg.map(function (v, i) { return [v, i]; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, 5).forEach(function (p) { if (p[1] < keys.length) raw[keys[p[1]]].top5++; });
  }
  return Object.keys(raw).map(function (k) { return { name: k, top5: raw[k].top5, mx: raw[k].mx }; })
    .sort(function (a, b) { return (b.top5 * 100 + b.mx) - (a.top5 * 100 + a.mx); })
    .slice(0, 20).map(function (x, i) { return { name: x.name, score: x.top5, rank: i }; });
}
