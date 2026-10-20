/* Floating Ink: taking the background away from what is chosen in a picture, and making things in a picture
   disappear. This file loads only when it is used (loadPhotoKit in index.html), from a picture in a document,
   a presentation, a comic or a drawing's layer, and gives back a new picture.
   Two small models run in the browser itself, so the picture is never sent anywhere:
   SlimSAM (Apache-2.0) finds the thing under a click, and LaMa (Apache-2.0, OpenCV's build) fills in what was taken
   away. MI-GAN (28MB) was tried first and invented shapes in the hole, where LaMa (93MB) carries on what is around it.
   Without a graphics card (no WebGPU) both run on the processor in a worker: slower (filling takes about half a
   minute), but the window doesn't freeze.
   They are downloaded once from Hugging Face and kept (Cache API, 'floating-ink-models': a name sw.js doesn't
   clean up), and onnxruntime-web comes from jsDelivr, which sw.js keeps for working offline.
   INK_PHOTO.edit(src, { mode: 'bg' | 'erase', title }) -> Promise<Blob | null> (null when nothing changed).
   INK_PHOTO.tidy(src, cut) -> how many pixels went: what a drawing's one-click "הסרת רקע" left, kept only near the figure.
   It works with the app's own helpers from index.html (h, T, icon, toast, confirmBox, MODALS...) */
(() => {
'use strict';

const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
const SAM = 'https://huggingface.co/Xenova/slimsam-77-uniform/resolve/5850ab45f587c112167512ffef949107115e26a0/onnx/';
const LAMA = 'https://huggingface.co/opencv/inpainting_lama/resolve/aee6d22f0a13e5e35af1c9a1c3afd62841fc6f3f/inpainting_lama_2025jan.onnx';
const FILL_SIDE = 512;   // LaMa sees a square this size
const CACHE = 'floating-ink-models';
const MAX_SIDE = 2400;   // a bigger picture is made smaller first: the models see 1024 pixels anyway
const SAM_SIDE = 1024, MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
const HIST_MAX = 30;

const newCanvas = (w, hh) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hh)); return c; };
const freeCanvas = c => { if (c) { c.width = 0; c.height = 0; } };
const ctx = c => c.getContext('2d', { willReadFrequently: true });

/* =========================================================
   the models: downloaded once with how far along it is, kept, and run on the graphics card when there is one
   ========================================================= */
let ORTM = null, GPU = null;
async function runtime() {
  if (ORTM) return ORTM;
  const g = await gpuKind(), m = await import(ORT + 'ort.webgpu.min.mjs');
  if (ORTM) return ORTM;
  m.env.wasm.wasmPaths = ORT;
  m.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  m.env.wasm.proxy = !g;   // without a graphics card the processor works in a worker, so the window doesn't freeze meanwhile
  m.env.logLevel = 'error';
  try { m.env.webgpu.powerPreference = 'high-performance'; } catch {}
  ORTM = m;
  return m;
}
/* one model is made ready at a time, and one runs at a time: the graphics card part refuses two at once */
let LOCK = Promise.resolve();
function locked(fn) { const p = LOCK.then(fn); LOCK = p.catch(() => {}); return p; }
const run = (sess, feeds) => locked(() => sess.run(feeds));
/* 'f16' when the graphics card can do half floats, 'gpu' when it works without them, '' without it */
async function gpuKind() {
  if (GPU != null) return GPU;
  try {
    const a = navigator.gpu && await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    GPU = !a ? '' : a.features.has('shader-f16') ? 'f16' : 'gpu';
  } catch { GPU = ''; }
  return GPU;
}
const samFiles = g => g === 'f16' ? ['vision_encoder_fp16.onnx', 'prompt_encoder_mask_decoder_fp16.onnx'] : g === 'gpu' ? ['vision_encoder.onnx', 'prompt_encoder_mask_decoder.onnx'] : ['vision_encoder_quantized.onnx', 'prompt_encoder_mask_decoder_quantized.onnx'];
/* how far the downloads are: each file adds itself when it starts */
const DL = { files: new Map(), on: null };
function dlProgress() {
  let got = 0, all = 0;
  for (const f of DL.files.values()) { got += f.got; all += f.total || f.got; }
  if (DL.on) DL.on(all ? got / all : 0, all);
}
async function fetchModel(url) {
  let cache = null;
  try { cache = await caches.open(CACHE); const hit = await cache.match(url); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch {}
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error('net');
  const f = { got: 0, total: +res.headers.get('content-length') || 0 };
  DL.files.set(url, f);
  const reader = res.body.getReader(), parts = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); f.got += value.length; dlProgress();
  }
  const buf = new Uint8Array(f.got);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  DL.files.delete(url);
  try { if (cache) await cache.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } })); } catch {}
  return buf;
}
const SES = {};
function session(key, url, opt = {}) {
  if (!SES[key]) SES[key] = (async () => {
    const ort = await runtime(), g = await gpuKind(), buf = await fetchModel(url);
    return locked(() => ort.InferenceSession.create(buf, { executionProviders: g ? ['webgpu', 'wasm'] : ['wasm'], logSeverityLevel: 3, ...opt }));
  })().catch(e => { delete SES[key]; throw e; });
  return SES[key];
}
async function samSessions() { const [a, b] = samFiles(await gpuKind()); return Promise.all([session('enc', SAM + a), session('dec', SAM + b)]); }
/* LaMa's weights come packed as int8 in blocks of 8. The graphics card part unpacks those wrongly (the hole came out
   white, on Intel), so they are unpacked once by the processor while the model is made ready; a batch fixed at 1 lets
   the shapes be worked out then too, which makes that quicker */
const lamaSession = () => session('lama', LAMA, { extra: { session: { disable_quant_qdq: '1' } }, freeDimensionOverrides: { batch: 1 } });

/* --- finding things: the picture is seen once (the encoder, the slow part), then each click is quick --- */
const EMB = new WeakMap();   // a picture's canvas -> what the encoder saw in it
function embed(img) {
  let e = EMB.get(img);
  if (e) return e;
  e = (async () => {
    const [enc] = await samSessions(), ort = await runtime();
    const W = img.width, H = img.height, k = SAM_SIDE / Math.max(W, H), rw = Math.round(W * k), rh = Math.round(H * k);
    const c = newCanvas(SAM_SIDE, SAM_SIDE), x = ctx(c);
    x.fillStyle = '#fff'; x.fillRect(0, 0, rw, rh);   // see-through parts look white to it
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, rw, rh);
    const d = x.getImageData(0, 0, SAM_SIDE, SAM_SIDE).data, n = SAM_SIDE * SAM_SIDE, px = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      if (i % SAM_SIDE >= rw || i >= rh * SAM_SIDE) continue;   // the padding stays 0, as the model was taught
      for (let ch = 0; ch < 3; ch++) px[ch * n + i] = (d[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
    }
    freeCanvas(c);
    const out = await run(enc, { pixel_values: new ort.Tensor('float32', px, [1, 3, SAM_SIDE, SAM_SIDE]) });
    return { emb: out.image_embeddings, pos: out.image_positional_embeddings, k, rw, rh, W, H };
  })();
  e.catch(() => EMB.delete(img));
  EMB.set(img, e);
  return e;
}
/* the thing the points are on (label 1) and not on (label 0), as a soft mask the picture's size */
const decode = async (img, points) => maskOf(await decodeLow(img, points));
/* that thing on SAM's own 256 grid: the logits of the answer taken (m, from o), which cells belong (keep), and how sure
   SAM is of it (score), of its surest answer (top), and how firm its edge is (firm) */
async function decodeLow(img, points) {
  const [, dec] = await samSessions(), ort = await runtime(), E = await embed(img);
  const pts = new Float32Array(points.flatMap(p => [p.x * E.k, p.y * E.k])), lab = BigInt64Array.from(points.map(p => BigInt(p.l)));
  // a copy every time: without a graphics card the model runs in a worker, and what is sent there is handed over and
  // gone from here (the next click would fail, and the worker's queue with it)
  const copy = t => new ort.Tensor(t.type, t.data.slice(), t.dims);
  const out = await run(dec, { input_points: new ort.Tensor('float32', pts, [1, 1, points.length, 2]), input_labels: new ort.Tensor('int64', lab, [1, 1, points.length]),
    image_embeddings: copy(E.emb), image_positional_embeddings: copy(E.pos) });
  const sc = [...out.iou_scores.data], m = out.pred_masks.data, n = 256 * 256;
  // of the three answers (a part, a bigger part, the whole thing), the biggest it is nearly as sure of as of its surest:
  // a click on a shirt means the whole person. The surest alone was a part (a shirt, a face, hair) in 7 of 10 pictures
  const area = [0, 1, 2].map(j => { let c = 0; for (let i = j * n; i < j * n + n; i++) if (m[i] > 0) c++; return c; });
  const top = Math.max(...sc);
  let best = sc.indexOf(top);
  for (let j = 0; j < 3; j++) if (sc[j] >= top - 0.1 && area[j] > area[best]) best = j;
  const keep = islands(m.subarray(best * n, best * n + n), points.filter(p => p.l).map(p => [p.x * E.k / 4, p.y * E.k / 4]));
  // and how firm its edge is (SAM's stability: what is in it at a logit over 1, against over -1): a figure's is, a
  // misty patch of forest's isn't
  let hi = 0, lo = 0;
  for (let i = best * n; i < best * n + n; i++) { if (m[i] > 1) hi++; if (m[i] > -1) lo++; }
  return { E, m, o: best * n, keep, score: sc[best], top, firm: hi / Math.max(1, lo) };
}
/* such an answer as a soft mask the picture's size */
function maskOf({ E, m, o, keep }) {
  const n = 256 * 256, s = newCanvas(256, 256), sx = ctx(s), id = sx.createImageData(256, 256);
  for (let i = 0; i < n; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = keep[i] ? Math.round(255 / (1 + Math.exp(-m[o + i]))) : 0; }
  sx.putImageData(id, 0, 0);
  const mc = newCanvas(E.W, E.H), mx = ctx(mc);
  mx.imageSmoothingQuality = 'high';
  mx.drawImage(s, 0, 0, E.rw / 4, E.rh / 4, 0, 0, E.W, E.H);   // the mask covers the padded square; the picture is its top left part
  freeCanvas(s);
  // the mask came from 256 pixels, so blowing it up widened its soft edge: it is made steeper again
  const md = mx.getImageData(0, 0, E.W, E.H), a = md.data;
  for (let i = 3; i < a.length; i += 4) a[i] = Math.max(0, Math.min(255, (a[i] - 128) * 3 + 128));
  mx.putImageData(md, 0, 0);
  return mc;
}
/* the parts of a mask (256 x 256 logits) that belong: the ones a click is on (or the biggest, when a click fell on an
   edge), and any other part at least a third as big. Small scraps elsewhere go. Cells just outside a kept part keep
   their soft edge; anything else is 0 */
function islands(m, pts) {
  const N = 256, lab = new Int32Array(N * N), sizes = [0];
  for (let i = 0; i < N * N; i++) {
    if (m[i] <= 0 || lab[i]) continue;
    const id = sizes.length, q = [i];
    lab[i] = id;
    let cnt = 0;
    while (q.length) {
      const c = q.pop(), x = c % N, y = (c - x) / N;
      cnt++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy, j = yy * N + xx;
        if (xx >= 0 && yy >= 0 && xx < N && yy < N && !lab[j] && m[j] > 0) { lab[j] = id; q.push(j); }
      }
    }
    sizes.push(cnt);
  }
  const kept = new Set();
  for (const [px, py] of pts) {
    // the click's own part, or one right next to it (a click on an edge)
    let best = 0, bd = 1e9;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = Math.round(px) + dx, y = Math.round(py) + dy, l = x >= 0 && y >= 0 && x < N && y < N ? lab[y * N + x] : 0;
      if (l && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = l; }
    }
    if (best) kept.add(best);
  }
  if (!kept.size && sizes.length > 1) kept.add(sizes.indexOf(Math.max(...sizes.slice(1)), 1));
  const big = Math.max(0, ...[...kept].map(l => sizes[l]));
  sizes.forEach((sz, l) => { if (l && sz >= big / 3) kept.add(l); });
  const keep = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    if (lab[i]) { keep[i] = kept.has(lab[i]) ? 1 : 0; continue; }
    const x = i % N, y = (i - x) / N;
    for (let dy = -1; dy <= 1 && !keep[i]; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < N && yy < N && kept.has(lab[yy * N + xx])) { keep[i] = 1; break; }
    }
  }
  return keep;
}
/* --- filling what was taken away. mask: a canvas whose alpha is what goes --- */
/* LaMa sees a square around what goes, with as much again around it on every side (the picture around is what it
   fills from), at 512 pixels. The answer is the picture again, filled in that square */
async function fill(img, mask) {
  const W = img.width, H = img.height, sess = await lamaSession(), ort = await runtime();
  const md = ctx(mask).getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (md[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const side = Math.min(Math.max(W, H), Math.max(FILL_SIDE / 2, 2 * Math.max(x1 - x0 + 1, y1 - y0 + 1)));
  const cw = Math.min(W, side), ch = Math.min(H, side);
  const sx = clamp(Math.round((x0 + x1) / 2 - cw / 2), 0, W - cw), sy = clamp(Math.round((y0 + y1) / 2 - ch / 2), 0, H - ch);
  const N = FILL_SIDE, n = N * N, c = newCanvas(N, N), cx = ctx(c), m = newCanvas(N, N), mx = ctx(m);
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, N, N);   // see-through parts count as white
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(img, sx, sy, cw, ch, 0, 0, N, N);
  mx.drawImage(mask, sx, sy, cw, ch, 0, 0, N, N);
  const d = cx.getImageData(0, 0, N, N).data, mm = mx.getImageData(0, 0, N, N).data, im = new Float32Array(3 * n), mk = new Float32Array(n);
  for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) im[k * n + i] = d[i * 4 + k] / 255; mk[i] = mm[i * 4 + 3] > 8 ? 1 : 0; }
  freeCanvas(m);
  const o = (await run(sess, { image: new ort.Tensor('float32', im, [1, 3, N, N]), mask: new ort.Tensor('float32', mk, [1, 1, N, N]) })).output.data;
  const od = cx.createImageData(N, N);
  for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) od.data[i * 4 + k] = Math.max(0, Math.min(255, o[k * n + i])); od.data[i * 4 + 3] = 255; }
  cx.putImageData(od, 0, 0);
  const out = newCanvas(W, H), ox = ctx(out);
  ox.drawImage(img, 0, 0);
  ox.imageSmoothingQuality = 'high';
  ox.drawImage(c, 0, 0, N, N, sx, sy, cw, ch);
  freeCanvas(c);
  return out;
}
/* --- "הסרת רקע" in a drawing (draw.js bgCut) finds the backdrop by its colors. What it leaves of it, a floor's shadow or
   the darker corners of a backdrop, is no part of the figure for SAM: each big part that is left is clicked where the
   figure most likely is, and what is not near what those clicks find goes. cut: what bgCut left (ImageData, changed in
   place); src: the picture as it was (a canvas the same size); onProgress(p, bytes) while the models download.
   Well inside the figure, what the colors took away comes back. Resolves to how many pixels changed: 0 when none
   did, or when nothing SAM found looked like the figure --- */
async function tidy(src, cut, onProgress) {
  const W = cut.width, H = cut.height, d = cut.data, sd = ctx(src).getImageData(0, 0, W, H).data;
  // only once the colors found a backdrop (a fifth of the picture went): when they took little, as in a busy room, which
  // thing is the figure is anyone's guess
  let was = 0, left = 0;
  for (let o = 3; o < d.length; o += 4) { if (sd[o] > 128) was++; if (d[o] > 128) left++; }
  if (left > was * 0.8) return 0;
  // only the part with something left in it, and a margin: a picture put small on a big drawing is then seen big
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0, o = 3; y < H; y++) for (let x = 0; x < W; x++, o += 4) if (d[o] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  if (x1 < 0) return 0;
  const mg = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
  x0 = Math.max(0, x0 - mg); y0 = Math.max(0, y0 - mg); x1 = Math.min(W - 1, x1 + mg); y1 = Math.min(H - 1, y1 + mg);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, row = (y, from, to) => [((y + y0) * W + x0) * 4 + from, ((y + y0) * W + x0) * 4 + to];
  const sc = newCanvas(cw, ch), part = new ImageData(cw, ch);
  ctx(sc).drawImage(src, x0, y0, cw, ch, 0, 0, cw, ch);
  for (let y = 0; y < ch; y++) part.data.set(d.subarray(...row(y, 0, cw * 4)), y * cw * 4);   // copied, not through a canvas: its soft edge keeps its colors
  let went = 0;
  try { went = await tidyPart(sc, part, onProgress); } finally { freeCanvas(sc); }
  if (went) for (let y = 0; y < ch; y++) d.set(part.data.subarray(y * cw * 4, (y + 1) * cw * 4), row(y, 0, 0)[0]);
  return went;
}
async function tidyPart(src, cut, onProgress) {
  const W = cut.width, H = cut.height, a = cut.data;
  // what is left, on a grid of up to 256 cells a side: a cell is on when most of it is
  const k = Math.min(1, 256 / Math.max(W, H)), gw = Math.max(1, Math.round(W * k)), gh = Math.max(1, Math.round(H * k)), G = gw * gh;
  const cc = newCanvas(W, H), gc = newCanvas(gw, gh), gx = ctx(gc);
  ctx(cc).putImageData(cut, 0, 0);
  gx.drawImage(cc, 0, 0, gw, gh);
  freeCanvas(cc);
  const gd = gx.getImageData(0, 0, gw, gh).data, on = new Uint8Array(G);
  for (let i = 0; i < G; i++) on[i] = gd[i * 4 + 3] > 128 ? 1 : 0;
  freeCanvas(gc);
  // its parts, and how deep inside its part each cell is (steps to the nearest cell that is off, or to the edge)
  const lab = new Int32Array(G), sizes = [0];
  for (let i = 0; i < G; i++) {
    if (!on[i] || lab[i]) continue;
    const id = sizes.length, q = [i];
    lab[i] = id;
    let cnt = 0;
    while (q.length) {
      const c = q.pop(), x = c % gw, y = (c - x) / gw;
      cnt++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy, j = yy * gw + xx;
        if (xx >= 0 && yy >= 0 && xx < gw && yy < gh && on[j] && !lab[j]) { lab[j] = id; q.push(j); }
      }
    }
    sizes.push(cnt);
  }
  const big = Math.max(0, ...sizes.slice(1));
  if (big < 16) return 0;
  const dist = new Float32Array(G), at = (x, y) => x < 0 || y < 0 || x >= gw || y >= gh ? 0 : dist[y * gw + x];
  for (let i = 0; i < G; i++) dist[i] = on[i] ? 1e9 : 0;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x; if (on[i]) dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4); }
  for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) { const i = y * gw + x; if (on[i]) dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4); }
  // where to click: in each part at least a sixth the size of the biggest (a second figure), its thickest places, up to
  // six and apart from each other; and first the very middle, even where the colors took it (a black apron there).
  // Every answer that looks like a figure is kept (figureLike), so a woman and the frame she holds both stay. The
  // smaller parts (a shadow by the feet) stay only where they are near what is kept
  const pts = [Math.floor(gh / 2) * gw + Math.floor(gw / 2)], R = Math.max(3, Math.round(Math.max(gw, gh) * 0.15));
  for (let l = 1; l < sizes.length; l++) {
    if (sizes[l] * 6 < big) continue;
    const mine = [], took = [];
    for (let i = 0; i < G; i++) if (lab[i] === l && dist[i] >= 2) mine.push(i);
    mine.sort((p, q) => dist[q] - dist[p]);
    for (const i of mine) {
      const x = i % gw, y = (i - x) / gw;
      if (!took.every(j => Math.hypot(j % gw - x, Math.floor(j / gw) - y) >= R)) continue;
      took.push(i);
      if (took.length === 6) break;
    }
    pts.push(...took);
  }
  const prev = DL.on, got = new Uint8Array(G), found = [];
  DL.on = onProgress || null;
  try {
    for (const i of pts) {
      if (got[i]) continue;   // inside something found already
      const r = await decodeLow(src, [{ x: ((i % gw) + 0.5) / k, y: (Math.floor(i / gw) + 0.5) / k, l: 1 }]), cells = figureLike(r, on, got, gw, gh);
      if (cells) found.push({ r, cells, mid: i === pts[0] });
    }
  } finally { DL.on = prev; }
  if (!found.length) return 0;
  // the figure: what the very middle found (or else the biggest), with the firm things that touch it, again and again
  // (the frame she holds; misty forest by a monkey isn't firm). When it is most of what the colors left, the backdrop
  // was plain, and a firm thing at least a third its size, in a part of what was left of its own, is a second figure
  // (one in the same part was a branch over a monkey, kept on one run and not the next). Otherwise the backdrop was
  // busy, and a thing apart is a piece of it SAM saw as a thing (pine needles, a lamp on a shelf): only the figure stays
  const main = found.find(f => f.mid) || found.reduce((p, q) => q.cells.length > p.cells.length ? q : p);
  const near = new Uint8Array(G), group = [];
  const join = f => {
    group.push(f);
    for (const g of f.cells) { const x = g % gw, y = (g - x) / gw; for (let yy = Math.max(0, y - 2); yy <= Math.min(gh - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(gw - 1, x + 2); xx++) near[yy * gw + xx] = 1; }
  };
  join(main);
  for (let more = true; more;) {
    more = false;
    for (const f of found) if (!group.includes(f) && f.r.firm >= 0.75 && f.cells.some(g => near[g])) { join(f); more = true; }
  }
  let onN = 0, onIn = 0;
  for (let g = 0; g < G; g++) if (on[g]) { onN++; if (near[g]) onIn++; }
  const plain = onIn >= onN * 0.5, size = Math.max(...group.map(f => f.cells.length));
  // which of the colors' parts a thing is mostly in: a second figure stands apart, in a part of its own
  const partOf = f => { const c = new Map(); for (const g of f.cells) if (lab[g]) c.set(lab[g], (c.get(lab[g]) || 0) + 1); let b = 0, bn = 0; for (const [l, n] of c) if (n > bn) { b = l; bn = n; } return b; };
  const mainPart = partOf(main);
  const keepers = plain ? found.filter(f => group.includes(f) || (f.r.firm >= 0.75 && f.cells.length * 3 >= size && partOf(f) !== mainPart)) : group;
  const U = newCanvas(W, H), ux = ctx(U);
  let any = false;
  for (const { r } of keepers) {
    const mc = maskOf(r);
    ux.drawImage(mc, 0, 0);
    freeCanvas(mc);
    any = true;
  }
  if (!any) { freeCanvas(U); return 0; }
  // well inside what is taken, what the colors took away comes back (black clothes by a dark floor)
  const core = newCanvas(W, H), cx2 = ctx(core);
  cx2.filter = `blur(${Math.max(2, Math.round(Math.max(W, H) * 0.003))}px)`; cx2.drawImage(U, 0, 0); cx2.filter = 'none';
  const cd = cx2.getImageData(0, 0, W, H).data, od = ctx(src).getImageData(0, 0, W, H).data;
  freeCanvas(core);
  // near it stays: SAM's answer grown by about one of its own pixels (blurred, and from a line between 100 and 200 of
  // 255), for the hair and fingers it draws a little thin. Two kept a floor's shadow around the shoes
  const g = newCanvas(W, H), gx2 = ctx(g);
  gx2.filter = `blur(${Math.max(2, Math.round(Math.max(W, H) * 0.003))}px)`; gx2.drawImage(U, 0, 0); gx2.drawImage(U, 0, 0); gx2.filter = 'none';
  const gate = gx2.getImageData(0, 0, W, H).data, ud = ux.getImageData(0, 0, W, H).data;
  freeCanvas(g); freeCanvas(U);
  // what is kept has to hold a tenth of what is left at least (a waitress was 18% of what a restaurant left); less
  // means SAM found something small, and the cut stays
  let kept = 0, inside = 0;
  for (let o = 3; o < a.length; o += 4) if (a[o] > 128) { kept++; if (gate[o] > 8) inside++; }
  if (!kept || inside < kept * 0.1) return 0;
  // after a busy backdrop its colors are right next to the figure too (a light wall by a waitress's arm stayed as a
  // white line): there the edge is SAM's own
  const busy = !plain;
  let went = 0;
  for (let o = 3; o < a.length; o += 4) {
    if (cd[o] >= 250) {   // well inside: as in the picture
      if (a[o] < od[o]) { a[o - 3] = od[o - 3]; a[o - 2] = od[o - 2]; a[o - 1] = od[o - 1]; a[o] = od[o]; went++; }
      continue;
    }
    if (!a[o] || (!busy && gate[o] >= 200) || (busy && ud[o] >= 250)) continue;
    const na = Math.round(a[o] * (busy ? ud[o] / 255 : Math.max(0, (gate[o] - 100) / 100)));
    if (a[o] > 8 && na <= 8) went++;
    if (na) a[o] = na; else a[o - 3] = a[o - 2] = a[o - 1] = a[o] = 0;
  }
  return went;
}
/* whether SAM's answer r looks like a figure: SAM is sure of it, it doesn't touch the top or the sides (a wall does; a
   figure stands on the bottom at most), it is neither tiny nor most of the picture, and most of it is what the colors
   left too (on: the grid, gw by gh). When it does, its cells go into got (the same grid), and it gives them (null when
   it doesn't) */
function figureLike(r, on, got, gw, gh) {
  if (r.top < 0.85 || r.score < 0.75) return null;   // the surest answer: the one taken can be a little less sure, and right at a line it flipped from run to run
  const { E, m, o, keep } = r, cw = Math.max(1, Math.floor(E.rw / 4)), chh = Math.max(1, Math.floor(E.rh / 4)), cells = [];
  let rimN = 0, rimOn = 0, inK = 0;
  for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
    const hit = keep[y * 256 + x] && m[o + y * 256 + x] > 0, rim = y < 2 || x < 2 || x >= cw - 2;
    if (rim) rimN++;
    if (!hit) continue;
    if (rim) rimOn++;
    const g = Math.min(gh - 1, Math.floor(y * gh / chh)) * gw + Math.min(gw - 1, Math.floor(x * gw / cw));
    cells.push(g);
    if (on[g]) inK++;
  }
  const area = cells.length / (cw * chh);
  if (rimOn > rimN * 0.03 || area < 0.005 || area > 0.7 || inK < cells.length * 0.5) return null;
  for (const g of cells) got[g] = 1;
  return cells;
}

/* =========================================================
   the window: the picture, what is chosen in it, and the two things that can be done with it
   ========================================================= */
const CSS = `
.ph-ov{position:fixed;inset:0;z-index:95;background:rgba(10,12,18,.55);display:grid;place-items:center}
.ph-box{width:min(1320px,96vw);height:min(880px,94vh);background:var(--surface);color:var(--text);border-radius:14px;box-shadow:var(--pop);display:flex;flex-direction:column;overflow:hidden}
.ph-head{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.ph-head .seg{margin:0}
.ph-head .grow{flex:1}
.ph-body{flex:1;min-height:0;display:flex}
.ph-side{width:260px;flex:none;border-inline-end:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;background:var(--surface-2)}
.ph-side h5{margin:4px 0 0;font-size:12px;color:var(--text-3);font-weight:600}
.ph-tools{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.ph-tools .btn{justify-content:flex-start;padding:0 10px}
.ph-tools .btn.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
.ph-row{display:flex;align-items:center;gap:8px;font-size:13px}
.ph-row span{min-width:78px;color:var(--text-2)}
.ph-row input[type=range]{flex:1;min-width:0;accent-color:var(--accent)}
.ph-row b{min-width:30px;text-align:end;font-weight:500;font-size:12px;color:var(--text-2)}
.ph-go{height:46px;font-size:15px}
.ph-hint{font-size:13px;color:var(--text-2);line-height:1.5;margin:0}
.ph-stage{flex:1;min-width:0;position:relative;overflow:hidden;background-color:#fff;background-image:conic-gradient(#d9dde5 25%,#fff 0 50%,#d9dde5 0 75%,#fff 0);background-size:22px 22px;touch-action:none;cursor:crosshair}
.ph-stage canvas{position:absolute;left:0;top:0;width:100%;height:100%}
.ph-stage.pan{cursor:grab}.ph-stage.panning{cursor:grabbing}.ph-stage.wait{cursor:progress}
.ph-status{position:absolute;top:12px;left:50%;transform:translateX(-50%);background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:6px 16px;font-size:13px;box-shadow:var(--shadow);max-width:calc(100% - 24px);text-align:center;pointer-events:none}
.ph-status[hidden]{display:none}
.ph-bar{position:absolute;bottom:12px;inset-inline-end:12px;display:flex;gap:2px;padding:3px;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow)}
.ph-prog{height:4px;border-radius:4px;background:var(--surface-3);overflow:hidden;margin-top:6px}
.ph-prog i{display:block;height:100%;width:0;background:var(--accent);transition:width .2s}
`;
let ED = null;   // the window that is open
function css() { if (!document.getElementById('photocss')) document.head.append(h('style', { id: 'photocss' }, CSS)); }
const ACC = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2743d8';

/* a picture from anything the app has: a canvas, a Blob, or an address (data:, blob:, or one that allows it) */
async function toCanvas(src, max = MAX_SIDE) {
  let im = src, url = null;
  if (src instanceof Blob) { url = URL.createObjectURL(src); im = await loadImg(url); }
  else if (typeof src === 'string') im = await new Promise((res, rej) => { const i = new Image(); if (/^https?:/.test(src) && !src.startsWith(location.origin)) i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height;
  if (!w0 || !h0) throw new Error('empty');
  const k = Math.min(1, max / Math.max(w0, h0)), c = newCanvas(w0 * k, h0 * k), x = ctx(c);
  x.imageSmoothingQuality = 'high';
  x.drawImage(im, 0, 0, c.width, c.height);
  if (url) URL.revokeObjectURL(url);
  x.getImageData(0, 0, 1, 1);   // a picture from another site that doesn't allow it throws here, not later
  return c;
}

function edit(src, o = {}) {
  css();
  if (ED) ED.cancel();
  return new Promise(resolve => open(src, o, resolve));
}
async function open(src, o, resolve) {
  let img;
  try { img = await toCanvas(src, o.max || MAX_SIDE); }
  catch (e) { console.warn(e); toast(T('אי אפשר לערוך את התמונה הזאת')); resolve(null); return; }
  const W = img.width, H = img.height;
  const S0 = { img, points: [], strokes: [] };
  const E = ED = { mode: o.mode === 'erase' ? 'erase' : 'bg', tool: 'pick', sub: false, brush: 30, feather: 1, st: S0, hist: [], fut: [], changed: false, busy: 0, view: { z: 1, x: 0, y: 0 },
    sam: null, samFor: null, add: newCanvas(W, H), subc: newCanvas(W, H), sel: newCanvas(W, H), tint: newCanvas(W, H), gen: 0, cancel: () => finish(null) };
  const modal = { close: () => finish(null) };
  MODALS.push(modal);
  // the window
  const seg = h('div', { class: 'seg', role: 'tablist' });
  const save = h('button', { class: 'btn primary', type: 'button' }, icon('check'), T('שמירה'));
  const cancelB = h('button', { class: 'btn', type: 'button' }, T('ביטול'));
  const status = h('div', { class: 'ph-status', hidden: true }), statusTxt = h('span'), prog = h('div', { class: 'ph-prog', hidden: true }, h('i'));
  status.append(statusTxt, prog);
  const cv = h('canvas'), stage = h('div', { class: 'ph-stage' }, cv, status);
  const zbtn = (ic, label, fn) => h('button', { class: 'rb', type: 'button', title: label, 'aria-label': label, onclick: fn }, icon(ic));
  stage.append(h('div', { class: 'ph-bar' }, zbtn('zoom_out', T('הקטנה'), () => zoomBy(0.8)), zbtn('fit_screen', T('כל התמונה'), () => fitView()), zbtn('zoom_in', T('הגדלה@zoom'), () => zoomBy(1.25))));
  const side = h('div', { class: 'ph-side' });
  const box = h('div', { class: 'ph-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || T('עריכת תמונה') },
    h('div', { class: 'ph-head' }, seg, h('span', { class: 'grow' }), cancelB, save), h('div', { class: 'ph-body' }, side, stage));
  const ov = h('div', { class: 'ph-ov' }, box);
  document.body.append(ov);
  const cx = cv.getContext('2d');

  /* --- what is shown --- */
  let raf = 0;
  const paint = () => { if (!raf) raf = requestAnimationFrame(draw); };
  function draw() {
    raf = 0;
    if (ED !== E) return;
    const r = stage.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2), cw = Math.round(r.width * dpr), ch = Math.round(r.height * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const v = E.view;
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cw, ch);
    cx.setTransform(dpr * v.z, 0, 0, dpr * v.z, dpr * v.x, dpr * v.y);
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(E.st.img, 0, 0);
    if (E.lookZ && Math.abs(Math.log(v.z / E.lookZ)) > 0.4) lookNow();
    cx.drawImage(E.tint, 0, 0);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the points: green where it is, red where it isn't
    for (const p of E.st.points) {
      const sx = v.x + p.x * v.z, sy = v.y + p.y * v.z;
      cx.beginPath(); cx.arc(sx, sy, 7, 0, Math.PI * 2);
      cx.fillStyle = p.l ? '#1d9d5a' : '#d93025'; cx.fill(); cx.lineWidth = 2; cx.strokeStyle = '#fff'; cx.stroke();
      cx.fillStyle = '#fff'; cx.fillRect(sx - 3.5, sy - 1, 7, 2); if (p.l) cx.fillRect(sx - 1, sy - 3.5, 2, 7);
    }
    if (E.hover && E.tool !== 'pick') { cx.beginPath(); cx.arc(E.hover.x, E.hover.y, E.brush / 2, 0, Math.PI * 2); cx.lineWidth = 1.5; cx.strokeStyle = '#fff'; cx.stroke(); cx.lineWidth = 1; cx.strokeStyle = '#111'; cx.stroke(); }
  }
  function fitView() {
    const r = stage.getBoundingClientRect(), pad = 24, z = Math.min((r.width - 2 * pad) / W, (r.height - 2 * pad) / H, 4);
    E.view = { z, x: (r.width - W * z) / 2, y: (r.height - H * z) / 2 };
    paint();
  }
  function zoomAt(z, sx, sy) {
    const v = E.view, nz = clamp(z, 0.05, 16), px = (sx - v.x) / v.z, py = (sy - v.y) / v.z;
    E.view = { z: nz, x: sx - px * nz, y: sy - py * nz };
    paint();
  }
  const zoomBy = k => { const r = stage.getBoundingClientRect(); zoomAt(E.view.z * k, r.width / 2, r.height / 2); };
  /* the chosen part: what the clicks found, with what the brush added, without what it took away; and its tint */
  function selNow() {
    const s = ctx(E.sel);
    s.globalCompositeOperation = 'source-over'; s.clearRect(0, 0, W, H);
    if (E.sam && E.samFor === E.st) s.drawImage(E.sam, 0, 0);
    s.drawImage(E.add, 0, 0);
    s.globalCompositeOperation = 'destination-out'; s.drawImage(E.subc, 0, 0);
    s.globalCompositeOperation = 'source-over';
    lookNow();
  }
  /* over the picture: in "background", what will go is veiled; in "erase", what goes is red. Both get an edge that
     is the same width on screen at any zoom */
  const edge = newCanvas(W, H);
  function lookNow() {
    const t = ctx(E.tint), x = ctx(edge), w = Math.max(1, 1.8 / E.view.z), col = E.mode === 'bg' ? ACC() : '#e53935';
    E.lookZ = E.view.z;
    t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, W, H);
    if (!hasSel() && !E.st.points.length) { paint(); return; }
    if (E.mode === 'bg') { t.fillStyle = 'rgba(255,255,255,.66)'; t.fillRect(0, 0, W, H); t.globalCompositeOperation = 'destination-out'; t.drawImage(E.sel, 0, 0); }
    else { t.drawImage(E.sel, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = 'rgba(229,57,53,.5)'; t.fillRect(0, 0, W, H); }
    x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, W, H);
    for (const [dx, dy] of [[w, 0], [-w, 0], [0, w], [0, -w]]) x.drawImage(E.sel, dx, dy);
    x.globalCompositeOperation = 'destination-out'; x.drawImage(E.sel, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, W, H);
    t.globalCompositeOperation = 'source-over'; t.drawImage(edge, 0, 0);
    x.globalCompositeOperation = 'source-over';
    paint();
  }
  /* the brush strokes again, in their order (the last one wins where two cross) */
  function strokesNow() {
    const a = ctx(E.add), b = ctx(E.subc);
    a.clearRect(0, 0, W, H); b.clearRect(0, 0, W, H);
    for (const s of E.st.strokes) strokeOn(s, s.pts.length - 1, 0);
  }
  function strokeOn(s, upto, from) {
    const a = ctx(E.add), b = ctx(E.subc), [on, off] = s.m === 'add' ? [a, b] : [b, a];
    for (const [c, op] of [[on, 'source-over'], [off, 'destination-out']]) {
      c.globalCompositeOperation = op; c.lineCap = c.lineJoin = 'round'; c.lineWidth = s.r * 2; c.strokeStyle = c.fillStyle = '#fff';
      c.beginPath();
      const p0 = s.pts[Math.max(0, from)];
      c.moveTo(p0.x, p0.y);
      if (upto === 0) { c.arc(p0.x, p0.y, s.r, 0, Math.PI * 2); c.fill(); }
      else { for (let i = Math.max(1, from); i <= upto; i++) c.lineTo(s.pts[i].x, s.pts[i].y); c.stroke(); }
      c.globalCompositeOperation = 'source-over';
    }
  }
  const hasSel = () => E.st.points.some(p => p.l) || E.st.strokes.some(s => s.m === 'add');

  /* --- what is going on, at the top of the picture --- */
  function say(txt, p) {
    status.hidden = !txt; statusTxt.textContent = txt || '';
    prog.hidden = p == null; if (p != null) prog.firstChild.style.width = Math.round(p * 100) + '%';
  }
  const hint = () => E.mode === 'bg' ? T('לוחצים על מה שרוצים להשאיר. מה שלא נבחר יהיה שקוף.') : T('לוחצים על מה שרוצים להעלים, או צובעים עליו במכחול.');
  DL.on = (p, all) => { if (ED !== E || !E.busy) return; if (p < 1) say(T('מוריד את הכלים, פעם אחת (בערך {0}MB)… {1}%', Math.round(all / 1e6), Math.round(p * 100)), p); else say(E.label); };
  /* work that takes a moment: the window waits, and says so */
  async function work(txt, fn) {
    E.busy++; E.label = txt; stage.classList.add('wait'); say(txt);
    try { return await fn(); }
    finally { E.busy--; if (!E.busy) { stage.classList.remove('wait'); say(''); } }
  }
  /* the clicks, as one mask (the newest wins when several come quickly) */
  let decoding = null, again = false;
  async function decodeNow() {
    if (decoding) { again = true; return decoding; }
    const st = E.st;
    if (!st.points.length) { E.sam = null; E.samFor = st; selNow(); return; }
    decoding = (async () => {
      try {
        const m = await work(EMB.has(st.img) ? T('מחפש…') : T('מסתכל על התמונה…'), () => decode(st.img, st.points));
        if (ED !== E) return;
        if (E.st === st) { freeCanvas(E.sam); E.sam = m; E.samFor = st; selNow(); } else freeCanvas(m);
      } catch (e) { fail(e); }
      finally { decoding = null; if (again) { again = false; decodeNow(); } }
    })();
    return decoding;
  }
  function fail(e) {
    console.error(e);
    toast(e && e.message === 'net' || (e && /fetch|network|Failed/i.test(String(e.message))) ? T('לא הצלחתי להוריד את הכלים. בפעם הראשונה צריך אינטרנט.') : T('משהו השתבש בעריכת התמונה. כדאי לנסות שוב.'), { ms: 7000 });
  }

  /* --- steps: each click, stroke and change to the picture can be undone --- */
  function step(next) {
    E.hist.push(E.st); if (E.hist.length > HIST_MAX) E.hist.shift();
    E.fut = []; E.st = next; ui();
  }
  function restore(st) {
    const imgChanged = st.img !== E.st.img;
    E.st = st;
    strokesNow();
    if (imgChanged || E.samFor !== st) { E.sam = null; E.samFor = null; }
    decodeNow(); selNow(); ui();
  }
  function undo() { if (E.busy || !E.hist.length) return; E.fut.push(E.st); restore(E.hist.pop()); }
  function redo() { if (E.busy || !E.fut.length) return; E.hist.push(E.st); restore(E.fut.pop()); }

  /* --- the two things that can be done --- */
  async function removeBg() {
    if (!hasSel()) { toast(T('קודם בוחרים משהו: לוחצים עליו'), { icon: 'info' }); return; }
    await decoding;
    const out = newCanvas(W, H), x = ctx(out);
    x.drawImage(E.st.img, 0, 0);
    x.globalCompositeOperation = 'destination-in';
    if (E.feather) x.filter = `blur(${E.feather}px)`;
    x.drawImage(E.sel, 0, 0);
    x.filter = 'none'; x.globalCompositeOperation = 'source-over';
    E.changed = true;
    step({ img: out, points: [], strokes: [] });
    strokesNow(); E.sam = null; E.samFor = E.st; selNow();
    toast(T('הרקע הוסר. אפשר לבטל עם Ctrl+Z'), { icon: 'auto_fix_high' });
  }
  async function erase() {
    if (!hasSel()) { toast(T('קודם בוחרים משהו: לוחצים עליו או צובעים עליו'), { icon: 'info' }); return; }
    await decoding;
    const img = E.st.img;
    // what goes is a little bigger than what was chosen, so its edge and shadow go with it
    const grow = Math.max(4, Math.round(Math.max(W, H) * 0.006)), m = newCanvas(W, H), mx = ctx(m);
    mx.filter = `blur(${grow}px)`; mx.drawImage(E.sel, 0, 0); mx.drawImage(E.sel, 0, 0); mx.filter = 'none';
    // made solid: all of it goes, edge included (a soft edge here would leave a ghost of what was there)
    const hd = mx.getImageData(0, 0, W, H);
    for (let i = 3; i < hd.data.length; i += 4) hd.data[i] = hd.data[i] > 8 ? 255 : 0;
    mx.putImageData(hd, 0, 0);
    // around it the picture is see-through (a drawing's layer): there, what goes simply goes
    const ring = ctx(img).getImageData(0, 0, W, H).data, md = mx.getImageData(0, 0, W, H).data;
    let seen = 0, solid = 0;
    for (let i = 0; i < W * H; i += 7) if (md[i * 4 + 3] > 8 && md[i * 4 + 3] < 200) { seen++; if (ring[i * 4 + 3] > 128) solid++; }
    const clearOnly = seen > 0 && solid / seen < 0.5;
    let out;
    try {
      if (clearOnly) {
        out = newCanvas(W, H); const x = ctx(out);
        x.drawImage(img, 0, 0); x.globalCompositeOperation = 'destination-out'; x.drawImage(m, 0, 0); x.globalCompositeOperation = 'source-over';
      } else {
        const filled = await work(GPU ? T('ממלא את המקום…') : T('ממלא את המקום… במחשב הזה זה לוקח בערך חצי דקה'), () => fill(img, m));
        if (ED !== E || !filled) return;
        out = newCanvas(W, H); const x = ctx(out);
        x.drawImage(img, 0, 0);
        // only what was taken away comes from the fill, with a soft edge
        const f = ctx(filled); f.globalCompositeOperation = 'destination-in'; f.filter = 'blur(1px)'; f.drawImage(m, 0, 0); f.filter = 'none';
        x.drawImage(filled, 0, 0);
        freeCanvas(filled);
      }
    } catch (e) { fail(e); return; }
    finally { freeCanvas(m); }
    E.changed = true;
    step({ img: out, points: [], strokes: [] });
    strokesNow(); E.sam = null; E.samFor = E.st; selNow();
    embed(out).catch(() => {});   // the next click on the new picture needs it looked at again
  }

  /* --- the side --- */
  function ui() {
    seg.textContent = '';
    for (const [k, ic, label] of [['bg', 'auto_fix_high', T('הסרת רקע')], ['erase', 'ink_eraser', T('מחיקת אובייקט')]])
      seg.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(E.mode === k), onclick: () => { if (E.mode !== k) { E.mode = k; ui(); lookNow(); } } }, icon(ic), label));
    const tool = (k, ic, label, title) => h('button', { class: 'btn small' + (E.tool === k ? ' on' : ''), type: 'button', title, 'aria-pressed': String(E.tool === k), onclick: () => { E.tool = k; ui(); stage.classList.toggle('pan', false); paint(); } }, icon(ic), label);
    const side2 = (k, ic, label) => h('button', { class: 'btn small' + (E.sub === k ? ' on' : ''), type: 'button', 'aria-pressed': String(E.sub === k), onclick: () => { E.sub = k; ui(); } }, icon(ic), label);
    const slider = (label, val, min, max, step0, show, set) => {
      const out = h('b', { text: show(val) }), inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step0), value: String(val), 'aria-label': label });
      inp.addEventListener('input', () => { set(+inp.value); out.textContent = show(+inp.value); });
      return h('label', { class: 'ph-row' }, h('span', { text: label }), inp, out);
    };
    const go = E.mode === 'bg'
      ? h('button', { class: 'btn primary ph-go', type: 'button', onclick: () => removeBg() }, icon('auto_fix_high'), T('הסרת הרקע'))
      : h('button', { class: 'btn primary ph-go', type: 'button', onclick: () => erase() }, icon('ink_eraser'), T('מחיקה@photo'));
    side.replaceChildren(...[
      h('p', { class: 'ph-hint', text: hint() }),
      h('h5', { text: T('בחירה') }),
      h('div', { class: 'ph-tools' }, tool('pick', 'arrow_selector_tool', T('לחיצה'), T('לוחצים על דבר בתמונה, והוא נבחר כולו')), tool('brush', 'brush', T('מכחול'), T('צובעים על מה שרוצים לבחור'))),
      h('div', { class: 'ph-tools' }, side2(false, 'add', T('הוספה@sel')), side2(true, 'remove', T('הורדה@sel'))),
      E.tool === 'brush' ? slider(T('גודל המכחול'), E.brush, 4, 160, 1, v => String(v), v => { E.brush = v; paint(); }) : h('p', { class: 'ph-hint', text: T('לחיצה ימנית, או Alt ולחיצה, מורידה מהבחירה') }),
      h('button', { class: 'btn small', type: 'button', disabled: !hasSel() && !E.st.points.length, onclick: () => { step({ img: E.st.img, points: [], strokes: [] }); strokesNow(); E.sam = null; E.samFor = E.st; selNow(); } }, icon('layers_clear'), T('ניקוי הבחירה')),
      E.mode === 'bg' ? slider(T('רכות הקצוות'), E.feather, 0, 12, 0.5, v => String(v), v => { E.feather = v; }) : null,
      go,
      h('div', { class: 'ph-tools' }, h('button', { class: 'btn small', type: 'button', disabled: !E.hist.length, title: T('ביטול (Ctrl+Z)'), onclick: () => undo() }, icon('undo', 'flip'), T('ביטול@undo')),
        h('button', { class: 'btn small', type: 'button', disabled: !E.fut.length, title: T('חזרה (Ctrl+Y)'), onclick: () => redo() }, icon('redo', 'flip'), T('חזרה')))].filter(Boolean));
    say(E.busy ? statusTxt.textContent : '');
  }

  /* --- the mouse, a pen or a finger --- */
  const toImg = e => { const r = stage.getBoundingClientRect(), v = E.view; return { x: (e.clientX - r.left - v.x) / v.z, y: (e.clientY - r.top - v.y) / v.z, sx: e.clientX - r.left, sy: e.clientY - r.top }; };
  let act = null, space = false;
  stage.addEventListener('contextmenu', e => e.preventDefault());
  stage.addEventListener('pointerdown', e => {
    if (ED !== E || act) return;
    const p = toImg(e);
    try { stage.setPointerCapture(e.pointerId); } catch {}
    if (e.button === 1 || space) { act = { k: 'pan', id: e.pointerId, s: p, v: { ...E.view } }; stage.classList.add('panning'); return; }
    if (E.tool === 'brush' && e.button === 0) {
      const s = { m: (E.sub || e.altKey) ? 'sub' : 'add', r: E.brush / 2 / E.view.z, pts: [{ x: p.x, y: p.y }] };
      act = { k: 'stroke', id: e.pointerId, s, before: E.st };
      strokeOn(s, 0, 0); selNow();
      return;
    }
    act = { k: 'click', id: e.pointerId, s: p, v: { ...E.view }, b: e.button, alt: e.altKey };
  });
  stage.addEventListener('pointermove', e => {
    const p = toImg(e);
    if (E.tool !== 'pick') { E.hover = { x: p.sx, y: p.sy }; paint(); }
    if (!act || act.id !== e.pointerId) return;
    if (act.k === 'pan' || (act.k === 'click' && Math.hypot(p.sx - act.s.sx, p.sy - act.s.sy) > 6)) {
      // dragging after a press in the picture moves it around
      if (act.k === 'click') { act.k = 'pan'; stage.classList.add('panning'); }
      E.view = { ...act.v, x: act.v.x + p.sx - act.s.sx, y: act.v.y + p.sy - act.s.sy }; paint();
      return;
    }
    if (act.k === 'stroke') {
      const s = act.s, last = s.pts[s.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) * E.view.z < 2) return;
      s.pts.push({ x: p.x, y: p.y }); strokeOn(s, s.pts.length - 1, s.pts.length - 2); selNow();
    }
  });
  const up = e => {
    const a = act;
    if (!a || a.id !== e.pointerId) return;
    act = null; stage.classList.remove('panning');
    if (e.type !== 'pointerup') { if (a.k === 'stroke') strokesNow(), selNow(); return; }
    if (a.k === 'stroke') { step({ img: E.st.img, points: E.st.points, strokes: E.st.strokes.concat(a.s) }); E.samFor = E.st; selNow(); return; }
    if (a.k === 'click') {
      const p = a.s;
      if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) return;
      const l = a.b === 2 || a.alt || E.sub ? 0 : 1;
      if (a.b !== 0 && a.b !== 2) return;
      const prevSam = E.sam;
      step({ img: E.st.img, points: E.st.points.concat({ x: p.x, y: p.y, l }), strokes: E.st.strokes });
      E.sam = prevSam; E.samFor = E.st;   // the old mask stays on screen until the new one is ready
      decodeNow();
    }
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('pointerleave', () => { E.hover = null; paint(); });
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const p = toImg(e);
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= 50) zoomAt(E.view.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), p.sx, p.sy);
    else { E.view = { ...E.view, x: E.view.x - e.deltaX, y: E.view.y - e.deltaY }; paint(); }
  }, { passive: false });
  const key = e => {
    if (ED !== E) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.code === 'Space' && !e.repeat && document.activeElement && !document.activeElement.closest('input,textarea,select,button')) { space = e.type === 'keydown'; stage.classList.toggle('pan', space); if (space) e.preventDefault(); return; }
    if (e.type !== 'keydown') return;
    if (mod && e.code === 'KeyZ') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) redo(); else undo(); }
    else if (mod && e.code === 'KeyY') { e.preventDefault(); e.stopPropagation(); redo(); }
    else if (mod && e.code === 'Digit0') { e.preventDefault(); e.stopPropagation(); fitView(); }
  };
  addEventListener('keydown', key, true); addEventListener('keyup', key, true);
  const ro = new ResizeObserver(() => fitView());
  ro.observe(stage);

  /* --- leaving: the picture back (only when it changed), or nothing --- */
  let done = false;
  async function finish(blob) {
    if (done) return;
    if (blob === null && E.changed && !E.saving) {
      if (!(await confirmBox(T('לצאת בלי לשמור?'), T('מה ששינית בתמונה לא יישמר.'), T('יציאה בלי שמירה'), true))) return;
    }
    done = true;
    removeEventListener('keydown', key, true); removeEventListener('keyup', key, true);
    ro.disconnect();
    const i = MODALS.indexOf(modal); if (i >= 0) MODALS.splice(i, 1);
    ov.remove();
    if (DL.on && ED === E) DL.on = null;
    for (const c of [E.add, E.subc, E.sel, E.tint, E.sam, edge]) freeCanvas(c);
    if (ED === E) ED = null;
    resolve(blob || null);
  }
  cancelB.addEventListener('click', () => finish(null));
  save.addEventListener('click', async () => {
    if (!E.changed) { finish(null); return; }
    E.saving = true;
    const img = E.st.img, d = ctx(img).getImageData(0, 0, W, H).data;
    let clear = false;
    for (let i = 3; i < d.length; i += 16) if (d[i] < 250) { clear = true; break; }
    // see-through parts need a PNG; a whole picture is smaller as a JPEG
    const blob = await new Promise(r => img.toBlob(r, clear ? 'image/png' : 'image/jpeg', 0.92));
    finish(blob);
  });

  ui(); fitView(); selNow();
  // the models start coming at once, and the picture is looked at before the first click
  work(T('מכין את הכלים…'), () => embed(img)).catch(fail);
}

// what the open window holds, read only (for checking it from outside)
function peek() {
  const E = ED;
  if (!E) return null;
  const W = E.sel.width, H = E.sel.height, d = ctx(E.sel).getImageData(0, 0, W, H).data;
  let on = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 127) on++;
  return { mode: E.mode, tool: E.tool, busy: E.busy, points: E.st.points.length, strokes: E.st.strokes.length, sam: !!E.sam, samNow: E.samFor === E.st, selected: on / (W * H), changed: E.changed, undo: E.hist.length, w: W, h: H, view: { ...E.view }, gpu: GPU };
}
window.INK_PHOTO = { edit, tidy, peek, parts: { toCanvas, embed, decode, fill, gpuKind } };   // parts: for checking each step from outside
// ==PHOTO-END==
})();
