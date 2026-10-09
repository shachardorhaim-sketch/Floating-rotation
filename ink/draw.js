/* Floating Ink: drawings, like a paint program. This file loads only when a drawing is opened or made
   (loadDrawKit in index.html), so documents, presentations and spreadsheets never wait for it.
   A drawing is a document in the same list, store, versions, trash and backup, whose meta.kind is 'draw'
   and whose body is JSON (README "ציורים"):
   { v: 1, w, h, bg: '#rrggbb', or '' for see-through, active: the layer being drawn on,
     layers: [{ id, name, op: 0..1, vis, src: the layer's pixels as a PNG data URL }] }   (the bottom layer first)
   On screen every layer is a canvas of its own, stacked in the "paper", and zooming and moving around are a CSS
   transform of the paper, so a big drawing is never redrawn for them.
   It works with the app's own helpers from index.html: h, T, toast, modal, openPop, markDirty, S, PREFS... */
(() => {
'use strict';

/* =========================================================
   sizes, tools and what each one remembers
   ========================================================= */
const MAX_SIDE = 4096, MIN_SIDE = 16;
const DPI = 150;   // a drawing's pixels are 150 to the inch, so an A4 drawing prints, and becomes a PDF page, the size of A4
const SMALL = matchMedia('(max-width:900px)').matches || /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
const PX_BUDGET = SMALL ? 48e6 : 160e6;   // the pixels of all the layers together (4 bytes each). Phones stop drawing canvases past their memory
const UNDO_BYTES = SMALL ? 160e6 : 480e6, UNDO_STEPS = 400;
const PRESETS = () => [
  { k: 'a4p', ic: 'crop_portrait', n: T('A4 לאורך'), w: 1240, h: 1754 },
  { k: 'a4l', ic: 'crop_landscape', n: T('A4 לרוחב'), w: 1754, h: 1240 },
  { k: 'wide', ic: 'computer', n: T('מסך רחב'), w: 1920, h: 1080 },
  { k: 'square', ic: 'crop_square', n: T('ריבוע'), w: 1500, h: 1500 },
  { k: 'anim', ic: 'movie', n: T('אנימציה'), w: 1280, h: 720 },   // lighter, so many frames fit, even on a phone
];
/* brush: draws with the pointer; shape: drawn by dragging from corner to corner; key: its keyboard letter (by place, so a Hebrew keyboard works too) */
const TOOLS = {
  pen: { ic: 'ink_pen', n: N_('עט'), key: 'KeyP', brush: true },
  pencil: { ic: 'edit', n: N_('עיפרון'), key: 'KeyN', brush: true },
  marker: { ic: 'ink_marker', n: N_('טוש'), key: 'KeyK', brush: true },
  brush: { ic: 'brush', n: N_('מכחול'), key: 'KeyB', brush: true },
  spray: { ic: 'blur_on', n: N_('ספריי'), key: 'KeyA', brush: true },
  eraser: { ic: 'ink_eraser', n: N_('מחק'), key: 'KeyE', brush: true },
  fill: { ic: 'format_color_fill', n: N_('דלי צבע'), key: 'KeyG' },
  pick: { ic: 'colorize', n: N_('טפטפת'), key: 'KeyI' },
  text: { ic: 'text_fields', n: N_('טקסט'), key: 'KeyT' },
  select: { ic: 'select', n: N_('בחירה'), key: 'KeyM' },
  lasso: { ic: 'lasso_select', n: N_('בחירה חופשית'), key: 'KeyL' },
  move: { ic: 'open_with', n: N_('הזזה'), key: 'KeyV' },
  line: { ic: 'horizontal_rule', n: N_('קו'), key: 'KeyU', shape: true },
  arrow: { ic: 'arrow_right_alt', n: N_('חץ'), key: 'KeyW', shape: true },
  rect: { ic: 'rectangle', n: N_('מלבן'), key: 'KeyR', shape: true },
  ellipse: { ic: 'circle', n: N_('עיגול'), key: 'KeyO', shape: true },
};
const BRUSHES = ['pen', 'pencil', 'marker', 'brush', 'spray', 'eraser'];
/* how each brush puts paint down. cap: round segments, as wide as the pressure allows within pr; stamp: soft dots close together;
   grain: paper texture, like graphite; erase: takes away instead of adding */
const BR = {
  pen: { kind: 'cap', pr: [0.18, 1] },
  pencil: { kind: 'cap', pr: [0.6, 1], grain: true },
  marker: { kind: 'cap', pr: [1, 1] },
  brush: { kind: 'stamp', pr: [0.12, 1], flow: 0.3, hard: 0.35 },
  spray: { kind: 'spray', pr: [1, 1] },
  eraser: { kind: 'cap', pr: [0.35, 1], erase: true },
};
/* s: size in the drawing's pixels, o: opacity %, sm: smoothing %, tol: how alike colors the bucket takes in % */
const DEF = { pen: { s: 6, o: 100, sm: 50 }, pencil: { s: 3, o: 90, sm: 40 }, marker: { s: 22, o: 70, sm: 45 }, brush: { s: 36, o: 100, sm: 45 }, spray: { s: 50, o: 100, sm: 0 },
  eraser: { s: 34, o: 100, sm: 30 }, shape: { s: 6, o: 100 }, fill: { o: 100, tol: 30 }, text: { s: 64, o: 100 } };
const setKey = t => TOOLS[t] && TOOLS[t].shape ? 'shape' : t;
const SIZE_MAX = 400;
/* the classic 20 colors of a paint program, and more in the color window */
const PALETTE = ['#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4',
  '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7'];
const MORE_COLORS = [...PALETTE, '#3b2314', '#6f4a2f', '#a0694b', '#d39e7a', '#f2c9a8', '#ffe0c7', '#0b3d2e', '#0e7c66', '#4fd1c5', '#c6f6d5',
  '#1a237e', '#5c6bc0', '#e91e63', '#f8bbd0', '#ff5722', '#ffd180', '#263238', '#546e7a', '#b0bec5', '#eceff1'];

function prefs() { if (!PREFS.draw || typeof PREFS.draw !== 'object') PREFS.draw = {}; return PREFS.draw; }
/* a tool's own settings: each brush keeps its size, opacity and smoothing, as in drawing programs */
function opt(t = TOOL) {
  const k = setKey(t), p = prefs();
  if (!p.br || typeof p.br !== 'object') p.br = {};
  const o = p.br[k] && typeof p.br[k] === 'object' ? p.br[k] : (p.br[k] = {});
  for (const [a, v] of Object.entries(DEF[k] || {})) if (typeof o[a] !== 'number' || !isFinite(o[a])) o[a] = v;
  return o;
}
const hex6 = c => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim()); return m ? '#' + m[1].toLowerCase() : null; };
const rgbOf = c => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const hexOfRgb = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const lid = () => 'L' + Math.random().toString(36).slice(2, 9);
const now = () => performance.now();

/* =========================================================
   state
   ========================================================= */
let D = null, LOADED = null, GEN = 0;   // the drawing on screen: { w, h, bg, layers, active, frames, f, fps, loop }, and the app's S.cur it belongs to
let TOOL = 'pen', BEFORE_PICK = null;
let COLOR = '#000000';
const VIEW = { z: 1, x: 0, y: 0 };   // the paper is at x, y in the viewport, z screen pixels to a drawing pixel
const V = {};   // the elements
let ACT = null;   // what the pointer that went down is doing
const PTR = new Map();   // the pointers down on the drawing, by id: { x, y, t (its type) } in viewport pixels
let PEN = false, SPACE = false;
let SEL = null;   // the selection: { path: [[x, y]...] (a closed outline in drawing pixels), box: { x, y, w, h }, rect }
let FL = null;    // pixels being moved or placed: { L, cv, x, y, w, h, ow, oh, kind: 'lift' | 'paste' | 'layer', from, once, pre }
let TX = null;    // the text being written: { x, y, el, grip }
let CLIP = null;  // what Ctrl+C copied here: a canvas
let PLAY = null;  // the animation playing: { seq, n, next, raf }
const HX = { bk: null, st: null, tmp: null };   // helper canvases the drawing's size: the layer as it was, the stroke alone, a scratch copy
const HIST = { steps: [], at: 0, bytes: 0 };
let REV = 0, DONE_REV = 0, BODY = null, ENCODING = false, AGAIN = false;

function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
/* iPhones stop drawing canvases once all of them together pass a limit, so the ones done with are emptied */
const freeCanvas = c => { if (c) { c.width = 0; c.height = 0; } };
function helper(k) {
  let c = HX[k];
  if (!c || c.width !== D.w || c.height !== D.h) { freeCanvas(c); c = HX[k] = newCanvas(D.w, D.h); }
  return c;
}
/* a layer's pixels in one frame (or in every frame, for a layer pinned to all of them): a canvas, how many times it was
   drawn on (0: never, so it can go when its frame is left) and its last PNG */
function newCell(w = D.w, hh = D.h) { const cv = newCanvas(w, hh); cv.className = 'dw-lc'; return { cv, cx: cv.getContext('2d'), ver: 0, enc: null }; }
/* a layer: its settings, and its cells by frame id ('*' when it is pinned to every frame). cv and cx are always its cell
   of the frame on screen (bind), so everything that draws works on the frame being drawn */
function makeLayer(name, o = {}) {
  return { id: o.id || lid(), name: String(name), op: typeof o.op === 'number' ? clamp(o.op, 0, 1) : 1, vis: o.vis !== false, fx: !!o.fx, cells: new Map(), cell: null, cv: null, cx: null };
}
const fid = () => 'F' + Math.random().toString(36).slice(2, 9);
const keyOf = (L, i = D.f) => L.fx ? '*' : D.frames[i].id;
const cellAt = (L, i = D.f) => L.cells.get(keyOf(L, i)) || null;
function bind(L) {
  const k = keyOf(L);
  let c = L.cells.get(k);
  if (!c || !c.cv.width) { c = newCell(); L.cells.set(k, c); }
  L.cell = c; L.cv = c.cv; L.cx = c.cx;
}
const bindAll = () => { for (const L of D.layers) bind(L); };
/* the cells of the frame on screen that were never drawn on go, before another frame comes */
function freeUnused() {
  for (const L of D.layers) {
    const c = L.cell;
    if (L.fx || !c || c.ver) continue;
    const k = keyOf(L);
    if (L.cells.get(k) === c) L.cells.delete(k);
    freeCanvas(c.cv); L.cell = L.cv = L.cx = null;
  }
}
const layerOf = (id = D && D.active) => D && (D.layers.find(L => L.id === id) || D.layers[D.layers.length - 1]);
/* every cell is a canvas the drawing's size, so the device's memory decides how many layers and frames fit */
const cellCount = () => D.layers.reduce((n, L) => n + L.cells.size, 0);
const room = n => (cellCount() + n) * D.w * D.h <= PX_BUDGET;
const fullMsg = () => toast(T('אין מספיק זיכרון במכשיר בשביל עוד שכבות או פריימים בגודל הזה. אפשר למחוק שכבות או פריימים, או לבחור קנבס קטן יותר.'), { ms: 7000 });
const layerName = n => T('שכבה {0}', n);
function nextLayerName() {
  let n = D.layers.length + 1;
  const names = new Set(D.layers.map(L => L.name));
  while (names.has(layerName(n))) n++;
  return layerName(n);
}

/* =========================================================
   the body: read, written, and turned into one picture
   ========================================================= */
const SRC_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const okSrc = s => typeof s === 'string' && SRC_RE.test(s) ? s : '';
const LOOPS = ['loop', 'ping', 'once'];
/* any body, checked and in one shape: frames [{ id, d }] (at least one; d is how many ticks it shows), and each layer's
   pictures by frame id, or by '*' when it is pinned to every frame. A drawing of one frame is stored the way it was before
   animation came: each layer's picture in src */
function parseBody(body) {
  let j = null;
  try { j = typeof body === 'string' ? JSON.parse(body) : body; } catch {}
  if (!j || typeof j !== 'object') j = {};
  const w = clamp(Math.round(+j.w) || 1920, MIN_SIDE, MAX_SIDE), hh = clamp(Math.round(+j.h) || 1080, MIN_SIDE, MAX_SIDE);
  const bg = j.bg === '' ? '' : hex6(j.bg) || '#ffffff', seen = new Set(), seenF = new Set();
  let frames = (Array.isArray(j.frames) ? j.frames : []).filter(f => f && typeof f.id === 'string' && /^[\w-]{1,24}$/.test(f.id) && !seenF.has(f.id) && seenF.add(f.id))
    .slice(0, 3000).map(f => ({ id: f.id, d: clamp(Math.round(+f.d) || 1, 1, 60) }));
  const anim = frames.length > 0;
  if (!anim) frames = [{ id: 'F1', d: 1 }];
  const layers = (Array.isArray(j.layers) ? j.layers : []).filter(l => l && typeof l === 'object').slice(0, 60).map((l, i) => {
    let id = typeof l.id === 'string' && /^[\w-]{1,24}$/.test(l.id) ? l.id : lid();
    if (seen.has(id)) id = lid();
    seen.add(id);
    const fx = !!l.fx, cells = {};
    if (fx) cells['*'] = okSrc(l.src);
    else if (anim && l.cells && typeof l.cells === 'object') { for (const f of frames) { const s = okSrc(l.cells[f.id]); if (s) cells[f.id] = s; } }
    else cells[frames[0].id] = okSrc(l.src);
    return { id, name: String(l.name || '').trim().slice(0, 60) || layerName(i + 1), op: typeof l.op === 'number' && isFinite(l.op) ? clamp(l.op, 0, 1) : 1, vis: l.vis !== false, fx, cells };
  });
  if (!layers.length) layers.push({ id: lid(), name: layerName(1), op: 1, vis: true, fx: false, cells: {} });
  const active = layers.some(l => l.id === j.active) ? j.active : layers[layers.length - 1].id;
  return { w, h: hh, bg, active, layers, frames, f: clamp(Math.round(+j.f) || 0, 0, frames.length - 1), fps: clamp(Math.round(+j.fps) || 12, 1, 30), loop: LOOPS.includes(j.loop) ? j.loop : 'loop' };
}
/* the body in its stored shape; srcOf(layer, key) gives a cell's picture */
function bodyFrom(d, srcOf) {
  const anim = d.frames.length > 1, o = { v: anim ? 2 : 1, w: d.w, h: d.h, bg: d.bg, active: d.active, fps: d.fps, loop: d.loop };
  if (anim) Object.assign(o, { f: d.f, frames: d.frames.map(f => ({ id: f.id, d: f.d })) });
  o.layers = d.layers.map(L => {
    const x = { id: L.id, name: L.name, op: L.op, vis: L.vis };
    if (L.fx) x.fx = true;
    if (L.fx || !anim) x.src = srcOf(L, L.fx ? '*' : d.frames[0].id) || '';
    else { x.cells = {}; for (const f of d.frames) { const s = srcOf(L, f.id); if (s) x.cells[f.id] = s; } }
    return x;
  });
  return JSON.stringify(o);
}
const norm = body => bodyFrom(parseBody(body), (l, k) => l.cells[k]);
/* a new drawing: one empty layer on a background of one color, or on nothing at all */
const blankBody = (w, hh, bg) => JSON.stringify({ v: 1, w, h: hh, bg, active: 'L1', layers: [{ id: 'L1', name: layerName(1), op: 1, vis: true, src: '' }] });
const bodyOf = d => bodyFrom(d, (L, k) => { const c = L.cells.get(k); return c && c.ver > 0 && c.enc ? c.enc.src : ''; });
/* the order the frames play in: forward, and for "back and forth" back again (without showing the ends twice) */
const seqOf = (n, loop) => { const a = [...Array(n).keys()]; return loop === 'ping' && n > 2 ? a.concat(a.slice(1, -1).reverse()) : a; };
/* each frame as a picture, from the drawing on screen or from any body: { w, h, bg, frames, fps, loop, draw(cx, i, cw, ch) }.
   A body's pictures are decoded as they are needed; only the pinned layers' are kept */
async function framesOf(body) {
  if (body == null) {
    commitPending();
    const d = D;
    return { w: d.w, h: d.h, bg: d.bg, frames: d.frames.map(f => ({ ...f })), fps: d.fps, loop: d.loop, done() {},
      async draw(cx, i, cw, ch) {
        for (const L of d.layers) {
          const c = L.vis && L.op > 0 && cellAt(L, i);
          if (!c || (!c.ver && c !== L.cell)) continue;
          cx.globalAlpha = L.op; cx.drawImage(c.cv, 0, 0, d.w, d.h, 0, 0, cw, ch);
        }
        cx.globalAlpha = 1;
      } };
  }
  const j = parseBody(body), kept = new Map();
  return { w: j.w, h: j.h, bg: j.bg, frames: j.frames, fps: j.fps, loop: j.loop, done() { kept.clear(); },
    async draw(cx, i, cw, ch) {
      for (const l of j.layers) {
        const s = l.vis && l.op > 0 && l.cells[l.fx ? '*' : j.frames[i].id];
        if (!s) continue;
        let im = kept.get(s);
        if (!im) { im = await loadImg(s).catch(() => null); if (im && l.fx) kept.set(s, im); }
        if (!im) continue;
        cx.globalAlpha = l.op; cx.drawImage(im, 0, 0, j.w, j.h, 0, 0, cw, ch);
      }
      cx.globalAlpha = 1;
    } };
}
/* everything that shows, on one canvas: the background (white for a JPEG, when there is none), then each layer that isn't hidden */
function flatTo(c, w, hh, bg, list) {
  const cx = c.getContext('2d');
  cx.clearRect(0, 0, c.width, c.height);
  if (bg) { cx.fillStyle = bg; cx.fillRect(0, 0, c.width, c.height); }
  cx.imageSmoothingQuality = 'high';
  for (const x of list) { cx.globalAlpha = x.op; cx.drawImage(x.im || x.cv, 0, 0, w, hh, 0, 0, c.width, c.height); }
  cx.globalAlpha = 1;
  return c;
}
const fitSize = (w, hh, max) => { const k = max ? Math.min(1, max / Math.max(w, hh)) : 1; return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(hh * k))]; };
/* the open drawing, or any body, as one picture: the frame on screen, or the one the body was left at.
   type 'image/png' keeps see-through parts; a JPEG gets white behind them */
async function flatten(body, { type = 'image/png', max = 0, q = 0.92 } = {}) {
  const src = await framesOf(body), i = body == null ? D.f : parseBody(body).f;
  const [cw, ch] = fitSize(src.w, src.h, max), c = newCanvas(cw, ch), x = c.getContext('2d'), bg = src.bg || (type === 'image/png' ? '' : '#ffffff');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, cw, ch); }
  x.imageSmoothingQuality = 'high';
  await src.draw(x, i, cw, ch);
  src.done();
  const blob = await new Promise(r => c.toBlob(r, type, q));
  freeCanvas(c);
  if (!blob) throw new Error('blob');
  return blob;
}
/* a version's picture, for the versions window */
function preview(body) {
  const img = h('img', { class: 'dw-ver', alt: '' });
  flatten(body, { max: 900 }).then(b => blobToDataURL(b)).then(u => { img.src = u; }).catch(() => {});
  return h('div', { class: 'dw-verbox' }, img);
}

/* --- saving: each cell is written as a PNG only when it changed since the last time, and in the background
   (toBlob), so drawing never waits for it. The app saves BODY a moment later, as it saves any document --- */
const encodeSoon = debounce(() => encodeNow(), 450);
function changed(L, cell) {
  if (L) (cell || L.cell).ver++;
  REV++;
  if (LOADED && S.cur === LOADED && !S.cur.isSample) setSave('dirty');
  encodeSoon();
  thumbsSoon(); framesSoon();
  stat();
}
async function encodeCell(c) {
  if (c.enc && c.enc.ver === c.ver) return;
  const ver = c.ver, blob = await new Promise(r => c.cv.toBlob(r, 'image/png'));
  if (!blob) throw new Error('blob');
  const src = await blobToDataURL(blob);
  if (c.ver === ver) c.enc = { ver, src };
}
const cellsOf = d => d.layers.flatMap(L => [...L.cells.values()]);
const stale = c => c.ver > 0 && (!c.enc || c.enc.ver !== c.ver);
function metaOf(d, cur) {
  if (!cur) return;
  Object.assign(cur.meta, { layers: d.layers.length, frames: d.frames.length, w: d.w, h: d.h });
  // the small picture shown when choosing a drawing to put in a document or a presentation: the frame on screen
  const [tw, th] = fitSize(d.w, d.h, 160), c = flatTo(newCanvas(tw, th), d.w, d.h, d.bg || '#ffffff', d.layers.filter(L => L.vis && L.op > 0 && L.cv).map(L => ({ op: L.op, cv: L.cv })));
  cur.meta.thumb = c.toDataURL('image/jpeg', 0.72);
  freeCanvas(c);
}
async function encodeNow() {
  if (!D || REV === DONE_REV) return;
  if (ENCODING) { AGAIN = true; return; }
  ENCODING = true;
  const d = D, cur = LOADED, rev = REV;
  try {
    for (const c of cellsOf(d)) if (stale(c)) await encodeCell(c);
    if (D !== d || S.cur !== cur) return;
    if (cellsOf(d).some(stale)) { AGAIN = true; return; }   // drawn on while it was being written
    BODY = bodyOf(d); DONE_REV = rev;
    metaOf(d, cur);
    markDirty();
  } catch (e) { console.warn(e); AGAIN = true; }
  finally { ENCODING = false; if (AGAIN) { AGAIN = false; encodeSoon(); } }
}
/* now, without waiting: before the app saves on leaving the drawing, makes a version or a backup, or the window closes */
function flush() {
  if (!D || !LOADED) return false;
  commitPending();
  if (REV === DONE_REV) return false;
  encodeSoon.cancel();
  for (const c of cellsOf(D)) if (stale(c)) c.enc = { ver: c.ver, src: c.cv.toDataURL('image/png') };
  BODY = bodyOf(D); DONE_REV = REV;
  metaOf(D, LOADED);
  markDirty();
  return true;
}
/* what the app saves: the body as of the last time the cells were written (a newer change is written a moment later, and saved then) */
const body = cur => D && LOADED === cur ? BODY : null;

/* =========================================================
   undo: each step keeps only what it changed. A stroke keeps the rectangle it touched, as it was;
   a change to the layers keeps the list as it was (the canvases themselves, so nothing is copied)
   ========================================================= */
function push(step) {
  for (const s of HIST.steps.splice(HIST.at)) HIST.bytes -= s.bytes || 0;
  HIST.steps.push(step); HIST.at++; HIST.bytes += step.bytes || 0;
  while (HIST.steps.length > 1 && (HIST.bytes > UNDO_BYTES || HIST.steps.length > UNDO_STEPS)) { const s = HIST.steps.shift(); HIST.at--; HIST.bytes -= s.bytes || 0; }
  undoUI();
}
function pxStep(L, R, before, cell = L.cell, fk = L.fx ? null : D.frames[D.f].id) {
  let after = null;
  // a change on another frame is undone there: that frame comes on screen first
  const show = () => { if (fk && D.frames[D.f].id !== fk) { const i = D.frames.findIndex(f => f.id === fk); if (i >= 0) goFrame(i, true); } };
  const st = {
    bytes: R.w * R.h * 4,
    undo() { show(); if (!after) { after = cell.cx.getImageData(R.x, R.y, R.w, R.h); st.bytes *= 2; HIST.bytes += R.w * R.h * 4; } cell.cx.putImageData(before, R.x, R.y); changed(L, cell); },
    redo() { show(); cell.cx.putImageData(after, R.x, R.y); changed(L, cell); },
  };
  return st;
}
/* the layers, their cells and the frames as they are now (the canvases themselves, so nothing is copied) */
const snapLayers = () => ({ layers: D.layers.slice(), props: D.layers.map(L => [L.name, L.op, L.vis, L.fx, new Map(L.cells)]), active: D.active, bg: D.bg, w: D.w, h: D.h,
  frames: D.frames.map(f => ({ ...f })), f: D.f, fps: D.fps, loop: D.loop });
function setLayers(s) {
  stopPlay();
  D.layers = s.layers.slice();
  s.layers.forEach((L, i) => { const [name, op, vis, fx, cells] = s.props[i]; Object.assign(L, { name, op, vis, fx }); L.cells = new Map(cells); });
  D.active = s.active; D.bg = s.bg; D.frames = s.frames.map(f => ({ ...f })); D.f = clamp(s.f, 0, D.frames.length - 1); D.fps = s.fps; D.loop = s.loop;
  if (D.w !== s.w || D.h !== s.h) { D.w = s.w; D.h = s.h; for (const k of Object.keys(HX)) { freeCanvas(HX[k]); HX[k] = null; } fit(); }
  // a cell let go when its frame was left (it had never been drawn on) comes back empty
  for (const L of D.layers) for (const [k, c] of L.cells) if (!c.cv.width) L.cells.delete(k);
  bindAll(); paintPaper(); layersUI(); canvasUI(); framesUI(); onionSoon();
}
const cellsBytes = list => list.reduce((n, c) => n + c.cv.width * c.cv.height * 4, 0);
/* a change to the layers, the frames or their settings, as one step: fn changes D, and may return pixel steps that belong to it */
function struct(fn) {
  commitPending();
  const a = snapLayers(), parts = [].concat(fn() || []);
  bindAll();
  const b = snapLayers();
  // what the step holds on to: the cells that are in one of its two states and not in the other
  const inA = new Set(a.props.flatMap(p => [...p[4].values()])), inB = new Set(b.props.flatMap(p => [...p[4].values()]));
  const only = [...inA].filter(c => !inB.has(c)).concat([...inB].filter(c => !inA.has(c)));
  push({
    bytes: cellsBytes(only) + parts.reduce((n, p) => n + p.bytes, 0),
    undo() { for (const p of parts.slice().reverse()) p.undo(); setLayers(a); changed(); },
    redo() { setLayers(b); for (const p of parts) p.redo(); changed(); },
  });
  paintPaper(); layersUI(); framesUI(); onionSoon(); changed();
}
function undo() {
  if (ACT) return;
  if (FXS) { fxCancel(); return; }   // the filter being tried goes first
  if (TX) { cancelText(); return; }   // the text being written, or the pixels being moved, go back first
  if (FL) { cancelFloat(); return; }
  if (!HIST.at) return;
  const s = HIST.steps[--HIST.at];
  s.undo(); SEL = null; drawOverlay(); undoUI();
}
function redo() {
  if (ACT || HIST.at >= HIST.steps.length) return;
  commitPending();
  const s = HIST.steps[HIST.at++];
  s.redo(); SEL = null; drawOverlay(); undoUI();
}
function undoUI() {
  for (const b of document.querySelectorAll('#ribbon [data-cmd="dwUndo"]')) b.disabled = !HIST.at && !FL && !TX;
  for (const b of document.querySelectorAll('#ribbon [data-cmd="dwRedo"]')) b.disabled = HIST.at >= HIST.steps.length;
}
const clipR = (x, y, w, hh) => { const x0 = clamp(Math.floor(x), 0, D.w), y0 = clamp(Math.floor(y), 0, D.h), x1 = clamp(Math.ceil(x + w), 0, D.w), y1 = clamp(Math.ceil(y + hh), 0, D.h); return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null; };
const unionR = (a, b) => !a ? b : !b ? a : { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) };
/* the layer as it is now, kept in the helper canvas, so a stroke can be redrawn over it and its rectangle kept for undo */
function keepLayer(L) {
  const bk = helper('bk'), bx = bk.getContext('2d');
  bx.clearRect(0, 0, D.w, D.h); bx.drawImage(L.cv, 0, 0);
  return bk;
}
const keptRect = R => HX.bk.getContext('2d').getImageData(R.x, R.y, R.w, R.h);

/* =========================================================
   the look
   ========================================================= */
const CSS = `
#drawView{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;position:relative;background:var(--surface-3)}
.dw-body{flex:1;min-height:0;display:flex;position:relative}
.dw-main{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;position:relative}
.dw-vp{flex:1;min-height:0;position:relative;overflow:hidden;touch-action:none;direction:ltr;outline:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:crosshair}
.dw-vp.c-text{cursor:text}.dw-vp.c-move{cursor:move}.dw-vp.c-pan{cursor:grab}.dw-vp.c-panning{cursor:grabbing}.dw-vp.c-wait{cursor:progress}
.dw-paper{position:absolute;left:0;top:0;transform-origin:0 0;box-shadow:0 1px 3px rgba(0,0,0,.16),0 8px 28px rgba(0,0,0,.14)}
.dw-paper.clear{background-color:#fff;background-image:conic-gradient(#d3d7df 25%,#fff 0 50%,#d3d7df 0 75%,#fff 0)}
.dw-paper canvas{position:absolute;left:0;top:0;width:100%;height:100%}
.dw-paper canvas.dw-fl{right:auto;bottom:auto}
.dw-paper.px canvas{image-rendering:pixelated}
.dw-ov{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.dw-ants{fill:none;stroke:#fff;stroke-width:1.3}
.dw-ants.b{stroke:#1b1f2a;stroke-dasharray:5 4;animation:dw-ants .7s linear infinite}
@keyframes dw-ants{to{stroke-dashoffset:-9}}
.dw-hd{fill:#fff;stroke:var(--accent);stroke-width:1.6}
.dw-cur{position:absolute;left:0;top:0;border-radius:50%;border:1px solid rgba(0,0,0,.75);box-shadow:0 0 0 1px rgba(255,255,255,.85);pointer-events:none;display:none;box-sizing:border-box}
.dw-txt{position:absolute;margin:0;padding:0 2px;border:1px dashed var(--accent);background:rgba(255,255,255,.12);outline:none;resize:none;overflow:hidden;white-space:pre;line-height:1.25;min-width:16px;box-sizing:content-box;z-index:2}
.dw-tgrip{position:absolute;width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;cursor:move;touch-action:none;box-shadow:0 1px 4px rgba(0,0,0,.3);z-index:3;border:2px solid #fff;padding:0}
.dw-tgrip .ms{font-size:15px}
.dw-zoom{position:absolute;bottom:10px;inset-inline-end:10px;display:flex;align-items:center;gap:2px;padding:3px;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow);z-index:4}
.dw-zoom .rb{min-width:32px;height:32px}
.dw-zp{min-width:56px;font-variant-numeric:tabular-nums;direction:ltr}
.dw-zoom i{width:1px;align-self:stretch;margin:4px 3px;background:var(--line)}
.dw-zoom .rb.on{background:var(--accent-soft);color:var(--accent)}
.dw-side{width:236px;flex:none;display:flex;flex-direction:column;min-height:0;background:var(--surface);border-inline-start:1px solid var(--line)}
.dw-side[hidden]{display:none}
.dw-sh{display:flex;align-items:center;gap:8px;padding:8px 10px 6px;font-weight:700;font-size:13.5px}
.dw-sh .ms{color:var(--text-3)}
.dw-sh .grow{flex:1}
.dw-list{flex:1;min-height:0;overflow-y:auto;padding:0 6px 6px}
.dw-row{display:flex;align-items:center;gap:8px;padding:5px 6px;margin-bottom:2px;border-radius:8px;border:1px solid transparent;cursor:pointer;user-select:none}
.dw-row:hover{background:var(--surface-2)}
.dw-row.on{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 30%,transparent)}
.dw-row.off .dw-nm,.dw-row.off .dw-th{opacity:.45}
.dw-th{flex:none;width:46px;height:46px;display:grid;place-items:center;border:1px solid var(--line);border-radius:5px;background:#fff conic-gradient(#e2e5eb 25%,#fff 0 50%,#e2e5eb 0 75%,#fff 0) 0 0/10px 10px;overflow:hidden}
.dw-th canvas{display:block;max-width:44px;max-height:44px}
.dw-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.dw-nm input{width:100%;font:inherit;padding:2px 4px;border:1px solid var(--accent);border-radius:5px;background:var(--surface);color:var(--text)}
.dw-lop{display:flex;align-items:center;gap:8px;padding:8px 10px;border-top:1px solid var(--line);font-size:12.5px;color:var(--text-2)}
.dw-lop input{flex:1;min-width:0;accent-color:var(--accent)}
.dw-lop b{min-width:38px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;text-align:end}
.dw-lbar{display:flex;justify-content:space-between;gap:2px;padding:6px 8px;border-top:1px solid var(--line)}
.dw-tg,.dw-sg{display:grid;grid-template-columns:repeat(3,auto);gap:2px}
.dw-opts{gap:5px}
.dw-sl{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2);white-space:nowrap}
.dw-sl input[type=range]{width:112px;accent-color:var(--accent)}
.dw-sl .ms{font-size:18px;color:var(--text-3)}
.dw-sl b{min-width:46px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums}
.dw-sl input[type=number]{width:64px;height:28px}
.dw-sl input[type=checkbox]{accent-color:var(--accent)}
.dw-hint{max-width:230px;white-space:normal;font-size:12px;color:var(--text-2);line-height:1.4}
.dw-cur-sw{width:42px;height:42px;border-radius:10px;border:1px solid rgba(0,0,0,.2);padding:0;box-shadow:inset 0 0 0 3px var(--surface);flex:none}
.dw-cols{display:flex;flex-direction:column;gap:3px}
.dw-pal{display:grid;grid-template-columns:repeat(10,18px);gap:3px}
.dw-pal .sw{width:18px;height:18px;border-radius:4px}
.dw-pal .sw.empty{background:none;border-style:dashed;pointer-events:none}
.dw-cpop{display:flex;flex-direction:column;gap:10px;padding:4px}
.dw-cpop .dw-pal{grid-template-columns:repeat(10,24px);gap:5px}
.dw-cpop .dw-pal .sw{width:24px;height:24px;border-radius:5px}
.dw-crow{display:flex;align-items:center;gap:8px;font-size:13px}
.dw-crow input[type=color]{width:38px;height:30px;padding:0;border:1px solid var(--line);border-radius:6px;background:none;cursor:pointer}
.dw-hex{width:96px;height:30px;font:600 13px var(--mono);direction:ltr;text-align:left}
.dw-clear{display:inline-flex;align-items:center;gap:8px}
.dw-sizes{display:grid;grid-template-columns:repeat(auto-fill,minmax(122px,1fr));gap:10px}
.dw-size{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;padding:12px 8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--text);min-height:118px}
.dw-size:hover{border-color:var(--accent)}
.dw-size[aria-pressed="true"]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent);background:var(--accent-soft)}
.dw-size i{display:block;border:1.5px solid currentColor;border-radius:2px;opacity:.65}
.dw-size b{font-size:13px}
.dw-size span{font-size:11.5px;color:var(--text-3);direction:ltr}
.dw-custom{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:12px;font-size:13px}
.dw-custom input{width:86px}
.dw-h4{font-size:13px;font-weight:700;margin:18px 0 8px;color:var(--text-2)}
.dw-bgrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dw-bgrow .sw{width:30px;height:30px;border-radius:8px}
.dw-bgrow .sw.none{background:#fff conic-gradient(#d3d7df 25%,#fff 0 50%,#d3d7df 0 75%,#fff 0) 0 0/10px 10px}
.dw-bgrow input[type=color]{width:38px;height:30px;padding:0;border:1px solid var(--line);border-radius:8px;background:none;cursor:pointer}
.dw-go{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
.dw-check{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px}
.dw-verbox{display:grid;place-items:center;background:var(--surface-3);padding:12px;border-radius:8px}
.dw-ver{max-width:100%;max-height:62vh;box-shadow:var(--shadow);background:#fff conic-gradient(#e2e5eb 25%,#fff 0 50%,#e2e5eb 0 75%,#fff 0) 0 0/16px 16px}
.dw-picks{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;max-height:60vh;overflow-y:auto;padding:2px}
.dw-pk{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--line);border-radius:10px;background:var(--surface);text-align:start;color:var(--text);min-width:0}
.dw-pk:hover{border-color:var(--accent)}
.dw-pk .im{aspect-ratio:4/3;display:grid;place-items:center;background:var(--surface-2);border-radius:6px;overflow:hidden}
.dw-pk .im img{max-width:100%;max-height:100%;display:block}
.dw-pk .im .ms{font-size:34px;color:var(--text-3)}
.dw-pk b{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dw-pk small{font-size:11.5px;color:var(--text-3)}
.dw-dl{display:flex;flex-direction:column;gap:2px;max-height:46vh;overflow-y:auto}
.dw-dl .mi .ms{color:var(--text-3)}
.dw-dl .mi small{margin-inline-start:auto;color:var(--text-3);font-size:12px}
.dw-new{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.dw-stage{flex:1;min-height:0;position:relative;display:flex;flex-direction:column}
.dw-paper.playing canvas.dw-lc{visibility:hidden!important}
.dw-time{flex:none;display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface);border-top:1px solid var(--line);min-width:0}
.dw-time[hidden]{display:none}
.dw-tplay{flex:none;width:44px;height:44px;border-radius:50%;border:0;background:var(--accent);color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:var(--shadow);padding:0}
.dw-tplay.on{background:#cf3727}
.dw-tplay .ms{font-size:26px}
.dw-tadd{flex:none;width:40px;height:62px;border:1.5px dashed var(--line);border-radius:8px;background:none;color:var(--text-2);display:grid;place-items:center;cursor:pointer;padding:0}
.dw-tadd:hover{border-color:var(--accent);color:var(--accent)}
.dw-frs{flex:1;min-width:0;display:flex;align-items:stretch;gap:6px;overflow-x:auto;overflow-y:hidden;padding:3px 2px;scrollbar-width:thin}
.dw-fr{position:relative;flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;padding:3px;border:2px solid transparent;border-radius:8px;cursor:pointer;user-select:none;-webkit-user-select:none;background:var(--surface-2)}
.dw-fr:hover{border-color:var(--line)}
.dw-fr.on{border-color:var(--accent);background:var(--accent-soft)}
.dw-fr.pl{border-color:#cf3727}
.dw-fr.drag{opacity:.4}
.dw-fr.drop{box-shadow:0 0 0 2px var(--accent)}
.dw-fth{display:grid;place-items:center;width:72px;height:50px;border-radius:4px;overflow:hidden}
.dw-fth canvas{display:block;max-width:72px;max-height:50px;background:#fff conic-gradient(#e2e5eb 25%,#fff 0 50%,#e2e5eb 0 75%,#fff 0) 0 0/10px 10px;box-shadow:0 0 0 1px var(--line)}
.dw-fn{font-size:11px;line-height:1.1;color:var(--text-2);font-variant-numeric:tabular-nums}
.dw-fd{position:absolute;top:5px;inset-inline-start:5px;font-size:10.5px;font-weight:700;line-height:1.5;background:var(--accent);color:#fff;border-radius:6px;padding:0 4px}
.dw-fm{position:absolute;top:2px;inset-inline-end:2px;width:22px;height:22px;border-radius:6px;border:0;background:var(--surface);box-shadow:var(--shadow);display:grid;place-items:center;padding:0;cursor:pointer;color:var(--text)}
.dw-fm .ms{font-size:16px}
.dw-durs{display:flex;gap:4px;padding:2px 8px 8px}
.dw-durs .opt{min-width:36px;height:28px;border:1px solid var(--line);border-radius:6px;background:var(--surface);font-weight:600;font-size:12.5px;color:var(--text);cursor:pointer}
.dw-durs .opt.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
.dw-col{display:flex;flex-direction:column;justify-content:center;gap:6px}
.dw-col .sel{height:28px}
.dw-pin .ms{font-size:18px}
.dw-pin.on{color:var(--accent)}
#drawPrint{display:none}
@media print{
  html.draw-print #app{display:none!important}
  html.draw-print #drawPrint{display:block}
  #drawPrint img{display:block;width:100vw;height:100vh;object-fit:contain;break-after:page}
  #drawPrint img:last-child{break-after:auto}
}
.dw-fx{position:absolute;top:10px;inset-inline-end:10px;width:304px;max-height:calc(100% - 70px);overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:12px 14px 14px;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--pop);z-index:5;box-sizing:border-box}
.dw-fxh{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14.5px}
.dw-fxh>.ms{color:var(--accent)}
.dw-fxh .grow{flex:1}
.dw-fxd{font-size:12.5px;color:var(--text-2);line-height:1.45;margin-top:-4px}
.dw-fxw{font-size:12px;color:var(--text-3);margin-top:-4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dw-fxp{display:flex;flex-direction:column;gap:10px}
.dw-fxs{display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 8px;font-size:12.5px;color:var(--text-2)}
.dw-fxs input[type=range]{grid-column:1/-1;width:100%;margin:0;accent-color:var(--accent)}
.dw-fxs b{font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate}
.dw-fxc{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text)}
.dw-fxc input{accent-color:var(--accent);margin:0}
.dw-fxrow{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-2);flex-wrap:wrap}
.dw-fxrow .grow{flex:1}
.dw-fxsw{width:30px;height:30px;border-radius:8px;flex:none}
.dw-fxb{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;position:sticky;bottom:-14px;margin-bottom:-14px;padding:10px 0 14px;border-top:1px solid var(--line);background:var(--surface);z-index:1}
.dw-fxb2{display:flex;gap:6px}
.dw-fxb2.end{margin-inline-start:auto}
.dw-fxb .btn{height:32px;padding:0 9px;gap:4px}
.dw-fxb .btn.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
.dw-fxcw{display:flex;flex-direction:column;gap:8px}
.dw-fxseg{display:flex;margin:0;flex-wrap:nowrap}
.dw-fxseg button{flex:1 1 auto;min-width:0;padding-inline:6px;white-space:nowrap}
.dw-fxcv{width:100%;max-width:236px;align-self:center;aspect-ratio:1;display:block;border:1px solid var(--line);border-radius:6px;touch-action:none;cursor:crosshair}
.dw-fxgw{display:flex;flex-direction:column;gap:8px;direction:ltr}
.dw-fxgbar{height:22px;border-radius:6px;border:1px solid var(--line)}
.dw-fxgr{display:flex;align-items:center;gap:6px}
.dw-fxgr .grow{flex:1}
.dw-fxgp{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.dw-fxg{height:20px;border-radius:5px;border:1px solid var(--line);padding:0;cursor:pointer}
.dw-fxpt{fill:none;stroke:#fff;stroke-width:3}
.dw-fxpt.b{stroke:#1b1f2a;stroke-width:1.4}
@media (max-width:700px){.dw-fx{top:auto;bottom:0;inset-inline:0;width:auto;max-height:58%;border-radius:14px 14px 0 0}}
@media (max-width:700px){.dw-fth{width:56px;height:40px}.dw-fth canvas{max-width:56px;max-height:40px}.dw-tplay{width:40px;height:40px}.dw-tadd{height:52px}.dw-side{position:absolute;inset-block:0;inset-inline-end:0;z-index:6;box-shadow:var(--pop);width:min(84vw,280px)}.dw-zoom{bottom:8px;inset-inline-end:8px}}
`;

/* =========================================================
   the ribbon, the layers and the view
   ========================================================= */
const rbtn = (cmd, ic, label, o = {}) => h('button', { class: 'rb' + (o.big ? ' big' : '') + (o.cls ? ' ' + o.cls : ''), type: 'button', 'data-cmd': cmd, 'data-arg': o.arg, title: o.title || label, 'aria-label': label },
  ic ? icon(ic, o.flip ? 'flip' : null) : null, o.big || o.text ? h('span', { text: o.text || label }) : null);
const group = (name, cls, ...kids) => h('div', { class: 'grp' }, h('div', { class: 'gb' + (cls ? ' ' + cls : '') }, kids), h('div', { class: 'gn', text: name }));
const toolTitle = k => `${T(TOOLS[k].n)} (${TOOLS[k].key.slice(3)})`;
const toolBtn = (k, big) => h('button', { class: 'rb' + (big ? ' big' : ''), type: 'button', 'data-cmd': 'dwTool', 'data-arg': k, 'data-tool': k, title: toolTitle(k), 'aria-label': T(TOOLS[k].n), 'aria-pressed': 'false' },
  icon(TOOLS[k].ic), big ? h('span', { text: T(TOOLS[k].n) }) : null);
const sw = (c, cmd = 'dwSw') => h('button', { class: 'sw', type: 'button', style: { background: c }, 'data-cmd': cmd, 'data-arg': c, title: c, 'aria-label': c });
function ribbonPanels() {
  V.home = h('div', { class: 'panel draw-only', 'data-panel': 'dwhome', hidden: true },
    group(T('ביטול@undo'), 'col', rbtn('dwUndo', 'undo', T('ביטול (Ctrl+Z)'), { flip: true }), rbtn('dwRedo', 'redo', T('חזרה (Ctrl+Y)'), { flip: true })),
    group(T('כלים'), '', h('div', { class: 'dw-tg' }, ['select', 'lasso', 'move', 'fill', 'pick', 'text'].map(k => toolBtn(k)))),
    group(T('מברשות'), '', BRUSHES.map(k => toolBtn(k, true))),
    group(T('צורות'), '', h('div', { class: 'dw-sg' }, ['line', 'arrow', 'rect', 'ellipse'].map(k => toolBtn(k)), rbtn('dwShapeFill', 'format_color_fill', T('צורה מלאה'), { cls: 'dw-shf', title: T('מלבן ועיגול מלאים בצבע, ולא רק המסגרת') }))),
    V.opts = group(T('הגדרות'), 'col dw-opts'),
    group(T('צבעים'), '', V.curSw = h('button', { class: 'dw-cur-sw', type: 'button', 'data-cmd': 'dwColor', title: T('הצבע שמציירים בו. לחיצה פותחת עוד צבעים'), 'aria-label': T('צבע') }),
      h('div', { class: 'dw-cols' }, h('div', { class: 'dw-pal' }, PALETTE.map(c => sw(c))), V.recent = h('div', { class: 'dw-pal', title: T('צבעים אחרונים') }))),
    group(T('הוספה'), '', rbtn('dwImage', 'add_photo_alternate', T('תמונה'), { big: true, title: T('תמונה מהמחשב, בשכבה חדשה. אפשר גם להדביק תמונה או לגרור קובץ לציור') })));
  V.canvasP = h('div', { class: 'panel draw-only', 'data-panel': 'dwcanvas', hidden: true },
    group(T('קנבס'), '', rbtn('dwSize', 'aspect_ratio', T('גודל הקנבס'), { big: true }), rbtn('dwBg', 'wallpaper', T('רקע'), { big: true, title: T('צבע הרקע, או רקע שקוף') })),
    group(T('תצוגה@view'), '', rbtn('dwZoom', 'zoom_in', T('הגדלה@zoom'), { big: true, arg: 'in', title: T('הגדלה (Ctrl++)') }), rbtn('dwZoom', 'zoom_out', T('הקטנה'), { big: true, arg: 'out', title: T('הקטנה (Ctrl+-)') }),
      rbtn('dwZoom', 'fit_screen', T('כל הציור'), { big: true, arg: 'fit', title: T('כל הציור בחלון (Ctrl+0)') }), rbtn('dwZoom', 'search', T('גודל אמיתי'), { big: true, arg: '1', title: T('פיקסל של הציור לכל פיקסל במסך (Ctrl+1)') })),
    group(T('שמירה כקובץ'), '', rbtn('exportAs', 'image', T('תמונת PNG'), { big: true, arg: 'png', title: T('שומר את מה שרואים כתמונה. רקע שקוף נשאר שקוף') }),
      rbtn('exportAs', 'imagesmode', T('תמונת JPG'), { big: true, arg: 'jpg', title: T('תמונה קטנה יותר. רקע שקוף נהיה לבן') }), rbtn('exportAs', 'picture_as_pdf', 'PDF', { big: true, arg: 'pdf', title: T('שמירה כ-PDF') })),
    group(T('שימוש בציור'), '', rbtn('dwSend', 'input', T('הכנסה למסמך או למצגת'), { big: true, title: T('הציור נכנס כתמונה למסמך או למצגת שבוחרים') })));
  const sel = (label, title, opts) => h('select', { class: 'sel', 'aria-label': label, title }, opts.map(([v, t]) => h('option', { value: v, text: t })));
  V.fps = sel(T('מהירות'), T('כמה פריימים מוצגים בשנייה'), FPS_LIST.map(v => [v, TN('{n} בשנייה', v)]));
  V.loop = sel(T('חזרה@loop'), T('מה קורה כשהאנימציה נגמרת'), [['loop', T('בלולאה')], ['ping', T('הלוך וחזור')], ['once', T('פעם אחת')]]);
  V.onBf = sel(T('לפני'), T('כמה פריימים מלפני מופיעים, באדום'), [0, 1, 2, 3].map(n => [n, String(n)]));
  V.onAf = sel(T('אחרי'), T('כמה פריימים מאחרי מופיעים, בירוק'), [0, 1, 2, 3].map(n => [n, String(n)]));
  V.animP = h('div', { class: 'panel draw-only', 'data-panel': 'dwanim', hidden: true },
    group(T('פריימים'), '', rbtn('dwFrameAdd', 'add_box', T('פריים חדש'), { big: true, title: T('פריים ריק אחרי הפריים הזה. הפריים הקודם מופיע בו בשקיפות, כדי לצייר את הצעד הבא') }),
      rbtn('dwFrameDup', 'content_copy', T('שכפול הפריים'), { big: true, title: T('עותק של הפריים הזה אחריו, כדי לשנות בו רק מעט') }), rbtn('dwFrameDel', 'delete', T('מחיקת הפריים'), { big: true })),
    group(T('ניגון'), '', rbtn('dwPlay', 'play_arrow', T('ניגון'), { big: true }), h('div', { class: 'dw-col' }, h('label', { class: 'dw-sl' }, h('span', { text: T('מהירות') }), V.fps), h('label', { class: 'dw-sl' }, h('span', { text: T('חזרה@loop') }), V.loop))),
    group(T('שכבות בצל'), '', rbtn('dwOnion', 'auto_awesome_motion', T('שכבות בצל'), { big: true, title: T('הפריימים שלפני ושאחרי מופיעים חלש מתחת לפריים, כדי שיהיה קל לצייר את הצעד הבא') }),
      h('div', { class: 'dw-col' }, h('label', { class: 'dw-sl' }, h('span', { text: T('לפני') }), V.onBf), h('label', { class: 'dw-sl' }, h('span', { text: T('אחרי') }), V.onAf))),
    group(T('שמירה כקובץ'), '', rbtn('dwAnimExport', 'gif', 'GIF', { big: true, arg: 'gif', title: T('תמונה שזזה לבד, לשליחה ולשיתוף') }), rbtn('dwAnimExport', 'movie', T('סרטון'), { big: true, arg: 'video', title: T('סרטון MP4, למשל ליוטיוב') })));
  const fxBtn = (k, f) => h('button', { class: 'rb big', type: 'button', 'data-cmd': 'dwFx', 'data-arg': k, 'data-fx': k, title: T(f.d), 'aria-label': T(f.n), 'aria-pressed': 'false' }, icon(f.ic), h('span', { text: T(f.n) }));
  V.fxP = h('div', { class: 'panel draw-only', 'data-panel': 'dwfx', hidden: true }, FX_GROUPS.map(([g, name]) => {
    const list = Object.entries(FXL).filter(([, f]) => f.g === g);
    return group(T(name), '', list.filter(([, f]) => f.big).map(([k, f]) => fxBtn(k, f)),
      list.some(([, f]) => !f.big) ? rbtn('dwFxMenu', 'expand_more', T('עוד'), { big: true, arg: g, title: T('עוד פילטרים') }) : null);
  }));
  return [V.home, V.fxP, V.canvasP, V.animP];
}
function mount() {
  if (V.vp) return;
  document.head.append(h('style', { id: 'drawcss' }, CSS));
  const tabs = $('#tabs');
  for (const [k, label] of [['dwhome', T('ציור')], ['dwfx', T('פילטרים')], ['dwcanvas', T('קנבס')], ['dwanim', T('אנימציה')]]) tabs.append(h('button', { class: 'tab draw-only', role: 'tab', 'data-tab': k, 'aria-selected': 'false' }, label));
  const ribbon = $('#ribbon');
  for (const p of ribbonPanels()) ribbon.append(p);
  const view = $('#drawView');
  view.querySelectorAll('.dw-wait').forEach(n => n.remove());
  V.paper = h('div', { class: 'dw-paper' });
  V.ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  V.ov.setAttribute('class', 'dw-ov');
  V.cur = h('div', { class: 'dw-cur' });
  V.vp = h('div', { class: 'dw-vp', tabindex: '-1', 'aria-label': T('הציור') }, V.paper, V.ov, V.cur);
  V.wait = h('div', { class: 'sh-wait', style: { position: 'absolute', inset: '0' } }, h('span', { class: 'dots', text: T('טוען') }));
  V.zp = h('button', { class: 'rb dw-zp', type: 'button', 'data-cmd': 'dwZoom', 'data-arg': '1', title: T('גודל אמיתי (Ctrl+1)') }, '100%');
  V.zoom = h('div', { class: 'dw-zoom' }, h('button', { class: 'rb dw-ltog', type: 'button', 'data-cmd': 'dwLayers', title: T('שכבות'), 'aria-label': T('שכבות') }, icon('layers')), h('i'),
    rbtn('dwZoom', 'remove', T('הקטנה'), { arg: 'out' }), V.zp, rbtn('dwZoom', 'add', T('הגדלה@zoom'), { arg: 'in' }), rbtn('dwZoom', 'fit_screen', T('כל הציור'), { arg: 'fit' }));
  V.stage = h('div', { class: 'dw-stage' }, V.vp, V.zoom, V.wait);
  // the frames, under the drawing
  V.onion = newCanvas(1, 1); V.onion.className = 'dw-on';
  V.frs = h('div', { class: 'dw-frs', role: 'listbox', 'aria-label': T('פריימים') });
  V.time = h('div', { class: 'dw-time', hidden: true },
    h('button', { class: 'dw-tplay', type: 'button', 'data-cmd': 'dwPlay', title: T('ניגון'), 'aria-label': T('ניגון') }, icon('play_arrow')), V.frs,
    h('button', { class: 'dw-tadd', type: 'button', 'data-cmd': 'dwFrameAdd', title: T('פריים חדש'), 'aria-label': T('פריים חדש') }, icon('add')));
  V.main = h('div', { class: 'dw-main' }, V.stage, V.time);
  // the layers, at the side
  V.list = h('div', { class: 'dw-list', role: 'listbox', 'aria-label': T('שכבות') });
  V.lop = h('input', { type: 'range', min: '0', max: '100', 'aria-label': T('שקיפות השכבה') });   // transparency: 0 is the layer as it is
  V.lopv = h('b');
  const lb = (cmd, ic, label) => h('button', { class: 'rb', type: 'button', 'data-cmd': cmd, title: label, 'aria-label': label }, icon(ic));
  V.side = h('aside', { class: 'dw-side', 'aria-label': T('שכבות') },
    h('div', { class: 'dw-sh' }, icon('layers'), h('span', { class: 'grow', text: T('שכבות') }), lb('dwLayers', 'close', T('סגירה'))),
    V.list,
    h('label', { class: 'dw-lop' }, h('span', { text: T('שקיפות') }), V.lop, V.lopv),
    h('div', { class: 'dw-lbar' }, lb('dwLayerAdd', 'add', T('שכבה חדשה')), lb('dwLayerDup', 'content_copy', T('שכפול השכבה')), lb('dwLayerUp', 'move_up', T('העברה למעלה')),
      lb('dwLayerDown', 'move_down', T('העברה למטה')), lb('dwLayerMerge', 'vertical_align_bottom', T('מיזוג עם השכבה שמתחת')), lb('dwLayerDel', 'delete', T('מחיקת השכבה')), lb('dwLayerMenu', 'more_horiz', T('עוד'))));
  V.side.hidden = SMALL ? true : prefs().side === false;
  view.append(h('div', { class: 'dw-body' }, V.main, V.side));
  document.body.append(V.print = h('div', { id: 'drawPrint', 'aria-hidden': 'true' }));
  // drawing
  const vp = V.vp;
  vp.addEventListener('pointerdown', onDown);
  vp.addEventListener('pointermove', onMove);
  vp.addEventListener('pointerup', onUp);
  vp.addEventListener('pointercancel', onUp);
  vp.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') V.cur.style.display = 'none'; });
  vp.addEventListener('wheel', onWheel, { passive: false });
  vp.addEventListener('contextmenu', e => e.preventDefault());
  vp.addEventListener('dblclick', e => e.preventDefault());
  // Safari's own pinch gesture would zoom the whole page
  for (const k of ['gesturestart', 'gesturechange']) vp.addEventListener(k, e => e.preventDefault());
  vp.addEventListener('dragover', e => { if (D && [...(e.dataTransfer.items || [])].some(i => i.kind === 'file' && /^image\//.test(i.type))) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  vp.addEventListener('drop', e => {
    const f = D && [...(e.dataTransfer.files || [])].find(x => /^image\//.test(x.type));
    if (!f) return;
    e.preventDefault(); e.stopPropagation();
    placeImage(f, true, toCanvas(viewPt(e)));
  });
  if (window.ResizeObserver) new ResizeObserver(() => { if (!D) return; if (NEED_FIT) fit(); else { keepInView(); applyView(); } }).observe(vp);
  // the layers
  V.list.addEventListener('click', e => {
    const row = e.target.closest('.dw-row');
    if (!row || e.target.closest('input')) return;
    if (e.target.closest('.dw-eye')) { toggleVis(row.dataset.id); return; }
    if (e.target.closest('.dw-pin')) { toggleFix(row.dataset.id); return; }
    setActive(row.dataset.id);
  });
  V.list.addEventListener('dblclick', e => { const row = e.target.closest('.dw-row'); if (row && !e.target.closest('.dw-eye,.dw-pin')) renameLayer(row.dataset.id); });
  let opBefore = null;
  V.lop.addEventListener('input', () => {
    const L = layerOf(); if (!L) return;
    if (opBefore == null) { commitPending(); opBefore = snapLayers(); }
    L.op = (100 - +V.lop.value) / 100; L.cv.style.opacity = String(L.op); V.lopv.textContent = V.lop.value + '%';
    if (FL && FL.L === L) FL.cv.style.opacity = String(L.op);
  });
  V.lop.addEventListener('change', () => {
    if (opBefore == null) return;
    const a = opBefore, b = snapLayers(); opBefore = null;
    push({ bytes: 0, undo() { setLayers(a); changed(); }, redo() { setLayers(b); changed(); } });
    changed(); V.lop.blur();
  });
  // the frames: a click goes to one, dragging moves it, its menu (or a right click) does the rest
  V.frs.addEventListener('pointerdown', e => {
    const el = e.target.closest('.dw-fr');
    if (!el || e.button > 0 || e.target.closest('.dw-fm')) return;
    const i = +el.dataset.i, x0 = e.clientX;
    let drag = false, to = i;
    if (e.pointerType !== 'touch') try { V.frs.setPointerCapture(e.pointerId); } catch {}
    const mv = ev => {
      if (!drag && (ev.pointerType === 'touch' || Math.abs(ev.clientX - x0) < 8)) return;   // a finger scrolls the strip
      drag = true; el.classList.add('drag');
      const over = [...V.frs.children].find(it => { const r = it.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right; });
      if (over) to = +over.dataset.i;
      for (const it of V.frs.children) it.classList.toggle('drop', +it.dataset.i === to && to !== i);
      const r = V.frs.getBoundingClientRect();
      if (ev.clientX < r.left + 24) V.frs.scrollLeft -= 12; else if (ev.clientX > r.right - 24) V.frs.scrollLeft += 12;
    };
    const end = ev => {
      V.frs.removeEventListener('pointermove', mv); V.frs.removeEventListener('pointerup', end); V.frs.removeEventListener('pointercancel', end);
      if (drag) { el.classList.remove('drag'); moveFrame(i, to); } else if (ev.type === 'pointerup') goFrame(i);
    };
    V.frs.addEventListener('pointermove', mv); V.frs.addEventListener('pointerup', end); V.frs.addEventListener('pointercancel', end);
  });
  V.frs.addEventListener('click', e => { const b = e.target.closest('.dw-fm'); if (b) frameMenu(b, D.f); });
  V.frs.addEventListener('contextmenu', e => { const el = e.target.closest('.dw-fr'); if (!el) return; e.preventDefault(); goFrame(+el.dataset.i); const cur = V.frs.children[D.f]; frameMenu(cur || el, D.f); });
  V.fps.addEventListener('change', () => { setFps(V.fps.value); V.fps.blur(); });
  V.loop.addEventListener('change', () => { setLoop(V.loop.value); V.loop.blur(); });
  for (const [el, k] of [[V.onBf, 'b'], [V.onAf, 'a']]) el.addEventListener('change', () => { onionOpt()[k] = +el.value; savePrefs(); onionNow(); el.blur(); });
  new MutationObserver(() => framesUI()).observe(V.animP, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('keyup', e => { if (e.code === 'Space' && SPACE) { SPACE = false; cursorUI(); } });
  addEventListener('blur', () => { if (SPACE) { SPACE = false; cursorUI(); } });
  document.addEventListener('paste', onPaste);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && D && LOADED && S.cur === LOADED && REV !== DONE_REV) { flush(); saveNow(); } });
  Object.assign(CMD, COMMANDS);
  // the tab chosen before these tabs existed is shown now
  if (DRAW_TABS.includes(S.tab)) selectTab(S.tab);
  toolUI(); colorUI();
}
function toggleSide(on) {
  if (!V.side) return;
  on = typeof on === 'boolean' ? on : V.side.hidden;
  V.side.hidden = !on;
  if (!SMALL) { prefs().side = on; savePrefs(); }
  for (const b of document.querySelectorAll('.dw-ltog')) b.classList.toggle('on', on);
  if (on) layersUI();
}

/* --- the view: zoom and position, as a transform of the paper --- */
let NEED_FIT = false;
const clampZ = z => clamp(z, 0.02, 32);
const vpRect = () => V.vp.getBoundingClientRect();
const viewPt = e => { const r = vpRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
const toCanvas = p => ({ x: (p.x - VIEW.x) / VIEW.z, y: (p.y - VIEW.y) / VIEW.z });
const toView = (x, y) => [VIEW.x + x * VIEW.z, VIEW.y + y * VIEW.z];
function applyView() {
  if (!D || !V.paper) return;
  V.paper.style.transform = `translate(${VIEW.x}px,${VIEW.y}px) scale(${VIEW.z})`;
  V.paper.classList.toggle('px', VIEW.z >= 2);
  const s = 20 / VIEW.z;
  V.paper.style.backgroundSize = D.bg ? '' : `${s}px ${s}px`;
  V.zp.textContent = Math.round(VIEW.z * 100) + '%';
  drawOverlay(); placeText();
}
function keepInView() {
  const r = vpRect(), m = 40, pw = D.w * VIEW.z, ph = D.h * VIEW.z;
  VIEW.x = clamp(VIEW.x, Math.min(m - pw, (r.width - pw) / 2), Math.max(r.width - m, (r.width - pw) / 2));
  VIEW.y = clamp(VIEW.y, Math.min(m - ph, (r.height - ph) / 2), Math.max(r.height - m, (r.height - ph) / 2));
}
function fit() {
  if (!D || !V.vp) return;
  const r = vpRect();
  if (r.width < 20 || r.height < 20) { NEED_FIT = true; return; }
  NEED_FIT = false;
  const pad = r.width < 500 ? 10 : 28;
  VIEW.z = clampZ(Math.min((r.width - 2 * pad) / D.w, (r.height - 2 * pad) / D.h));
  VIEW.x = (r.width - D.w * VIEW.z) / 2; VIEW.y = (r.height - D.h * VIEW.z) / 2;
  applyView();
}
function zoomAt(z, sx, sy) {
  z = clampZ(z);
  const cx = (sx - VIEW.x) / VIEW.z, cy = (sy - VIEW.y) / VIEW.z;
  VIEW.z = z; VIEW.x = sx - cx * z; VIEW.y = sy - cy * z;
  keepInView(); applyView();
}
const zoomBy = k => { const r = vpRect(); zoomAt(VIEW.z * k, r.width / 2, r.height / 2); };
const zoomTo = z => { const r = vpRect(); zoomAt(z, r.width / 2, r.height / 2); };
/* the mouse wheel zooms where the mouse is; a touchpad's two fingers move the drawing, and its pinch zooms */
function onWheel(e) {
  if (!D) return;
  e.preventDefault();
  const p = viewPt(e), k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1, dx = e.deltaX * k, dy = e.deltaY * k;
  const pinch = e.ctrlKey || e.metaKey;
  const wheel = !pinch && !dx && (e.deltaMode !== 0 || (Math.abs(dy) >= 50 && (!e.wheelDeltaY || Math.abs(e.wheelDeltaY) % 120 === 0)));
  if (e.shiftKey && !pinch) { VIEW.x -= dy || dx; keepInView(); applyView(); return; }
  if (pinch || wheel) { zoomAt(VIEW.z * Math.exp(-dy * (pinch ? 0.01 : 0.0016)), p.x, p.y); return; }
  VIEW.x -= dx; VIEW.y -= dy; keepInView(); applyView();
}

/* --- the paper: one canvas for each layer, the lowest first, and what is being moved on the layer it belongs to --- */
function paintPaper() {
  if (!D || !V.paper) return;
  bindAll();
  const kids = [], under = D.frames.length > 1 ? D.layers.findIndex(L => !L.fx) : -1;
  for (const [i, L] of D.layers.entries()) {
    if (i === under && V.onion) kids.push(V.onion);
    L.cv.style.opacity = String(L.op); L.cv.style.visibility = L.vis ? '' : 'hidden';
    kids.push(L.cv);
    if (FXS && FXS.L === L && GLX.cv) { GLX.cv.style.opacity = String(L.op); GLX.cv.style.visibility = L.vis ? '' : 'hidden'; kids.push(GLX.cv); }
    if (FL && FL.L === L) { FL.cv.style.opacity = String(L.op); FL.cv.style.visibility = L.vis ? '' : 'hidden'; kids.push(FL.cv); }
  }
  if (PLAY && V.play) kids.push(V.play);
  V.paper.replaceChildren(...kids);
  V.paper.style.width = D.w + 'px'; V.paper.style.height = D.h + 'px';
  V.paper.classList.toggle('clear', !D.bg);
  V.paper.style.backgroundColor = D.bg || '';
  applyView();
}
function placeFloat() {
  if (!FL) return;
  Object.assign(FL.cv.style, { left: FL.x + 'px', top: FL.y + 'px', width: FL.w + 'px', height: FL.h + 'px' });
  drawOverlay();
}

/* --- the layers' list, the top layer first --- */
const thumbsSoon = debounce(() => thumbsNow(), 220);
function thumbsNow() {
  if (!D || !V.side || V.side.hidden) return;
  for (const L of D.layers) {
    if (!L.th) continue;
    const [tw, th] = fitSize(D.w, D.h, 44);
    if (L.th.width !== tw || L.th.height !== th) { L.th.width = tw; L.th.height = th; }
    const x = L.th.getContext('2d');
    x.clearRect(0, 0, tw, th); x.drawImage(L.cv, 0, 0, tw, th);
  }
}
function layersUI() {
  if (!V.list || !D) return;
  if (V.side.hidden) { layerButtons(); return; }
  V.list.textContent = '';
  const anim = D.frames.length > 1;
  for (const L of D.layers.slice().reverse()) {
    if (!L.th) L.th = newCanvas(1, 1);
    const on = L.id === D.active;
    V.list.append(h('div', { class: 'dw-row' + (on ? ' on' : '') + (L.vis ? '' : ' off'), role: 'option', 'aria-selected': String(on), 'data-id': L.id, title: L.name },
      h('div', { class: 'dw-th' }, L.th), h('div', { class: 'dw-nm', text: L.name }),
      anim || L.fx ? h('button', { class: 'rb dw-pin' + (L.fx ? ' on' : ''), type: 'button', title: L.fx ? T('נעוצה: מופיעה בכל הפריימים. לחיצה משחררת') : T('נעיצה: השכבה תופיע בכל הפריימים, כמו רקע'), 'aria-label': T('נעיצה בכל הפריימים'), 'aria-pressed': String(L.fx) }, icon('push_pin')) : null,
      h('button', { class: 'rb dw-eye', type: 'button', title: L.vis ? T('הסתרת השכבה') : T('הצגת השכבה'), 'aria-label': L.vis ? T('הסתרת השכבה') : T('הצגת השכבה'), 'aria-pressed': String(!L.vis) }, icon(L.vis ? 'visibility' : 'visibility_off'))));
  }
  thumbsNow(); layerButtons();
}
function layerButtons() {
  const L = layerOf(), i = D.layers.indexOf(L), dis = (cmd, off) => { for (const b of document.querySelectorAll(`.dw-lbar [data-cmd="${cmd}"]`)) b.disabled = off; };
  const see = 100 - Math.round(L.op * 100);
  V.lop.value = String(see); V.lopv.textContent = see + '%';
  dis('dwLayerAdd', !room(1)); dis('dwLayerDup', !room(L.cells.size)); dis('dwLayerUp', i >= D.layers.length - 1); dis('dwLayerDown', i <= 0); dis('dwLayerMerge', i <= 0); dis('dwLayerDel', D.layers.length <= 1);
}
function setActive(id) {
  if (!D || D.active === id || !D.layers.some(L => L.id === id)) return;
  commitPending();
  D.active = id; SEL = null; drawOverlay(); layersUI();
}

/* --- the status bar --- */
const LRI = String.fromCharCode(0x2066), PDI = String.fromCharCode(0x2069);
function stat() {
  if (!D || S.cur !== LOADED) return;
  $('#stPage').textContent = T('קנבס {0}', `${LRI}${D.w} × ${D.h}${PDI}`);
  const n = TN('{n} שכבות', D.layers.length);
  $('#stWords').textContent = D.frames.length > 1 ? `${n} · ${T('פריים {0} מתוך {1}', D.f + 1, D.frames.length)}` : n;
}
const canvasUI = () => stat();

/* =========================================================
   the pointer: a mouse, a pen or a finger draws; two fingers, the middle button or Space with the mouse move and zoom
   ========================================================= */
const pressureOf = e => e.pointerType === 'pen' ? clamp(e.pressure || 0, 0, 1) : 1;
function onDown(e) {
  if (!D || !LOADED) return;
  if (PLAY) { stopPlay(); return; }   // a touch on the drawing stops it playing
  if (TX && (e.target === TX.el || TX.grip.contains(e.target))) return;   // writing in the text box, or moving it
  const p = { ...viewPt(e), t: e.pointerType, id: e.pointerId };
  if (e.pointerType === 'pen') PEN = true;
  PTR.set(e.pointerId, p);
  try { V.vp.setPointerCapture(e.pointerId); } catch {}
  if (e.pointerType === 'touch') {
    const touches = [...PTR.values()].filter(q => q.t === 'touch');
    if (touches.length >= 2) {
      // a second finger: what the first one began is let go, unless it was clearly drawing already
      if (ACT && ACT.kind === 'stroke' && now() - ACT.t0 > 320) { const a = ACT; ACT = null; strokeEnd(a); } else abortAct();
      startPinch(touches);
      return;
    }
    if (ACT) return;
    if (PEN) { startPan(p); return; }   // a pen drew here: a hand resting on the screen only moves the drawing
  }
  if (ACT) return;
  if (e.button === 1 || (e.button === 0 && SPACE)) { e.preventDefault(); startPan(p); return; }
  if (e.button !== 0) return;
  e.preventDefault();
  if (FXS) { if (fxHasPoint()) { ACT = { kind: 'fxpt', id: p.id }; fxPoint(toCanvas(p)); } return; }
  if (document.activeElement !== V.vp && !(TX && document.activeElement === TX.el)) V.vp.focus({ preventScroll: true });
  const c = toCanvas(p);
  if (TX) { commitText(); if (TOOL === 'text') return; }   // a click outside the text box finishes it
  if (e.altKey && TOOLS[TOOL].brush) { startPick(p, c, true); return; }
  const t = TOOL;
  if (TOOLS[t].brush) startStroke(e, p, c);
  else if (TOOLS[t].shape) startShape(p, c);
  else if (t === 'fill') fillAt(c);
  else if (t === 'pick') startPick(p, c, false);
  else if (t === 'text') openText(c);
  else startSelect(e, p, c);
}
function onMove(e) {
  if (!D) return;
  const p = viewPt(e), q = PTR.get(e.pointerId);
  if (q) { q.x = p.x; q.y = p.y; }
  if (e.pointerType !== 'touch') { V.lastHover = p; cursorAt(p); }
  const a = ACT;
  if (!a || (a.kind !== 'pinch' && a.id !== e.pointerId)) return;
  if (a.kind === 'pinch') pinchMove(a);
  else if (a.kind === 'pan') { VIEW.x = a.v.x + p.x - a.x0; VIEW.y = a.v.y + p.y - a.y0; keepInView(); applyView(); }
  else if (a.kind === 'stroke') strokeMove(a, e);
  else if (a.kind === 'shape') shapeMove(a, toCanvas(p), e.shiftKey);
  else if (a.kind === 'pick') pickMove(a, toCanvas(p));
  else if (a.kind === 'selnew') selMove(a, toCanvas(p), e.shiftKey);
  else if (a.kind === 'drag') dragMove(a, toCanvas(p), e.shiftKey);
  else if (a.kind === 'fxpt') fxPoint(toCanvas(p));
}
function onUp(e) {
  PTR.delete(e.pointerId);
  const a = ACT;
  if (!a) return;
  if (a.kind === 'pinch') { if (a.ids.includes(e.pointerId)) pinchEnd(a); return; }
  if (a.kind === 'wait') { if (![...PTR.values()].some(q => q.t === 'touch')) ACT = null; return; }
  if (a.id !== e.pointerId) return;
  ACT = null;
  if (a.kind === 'pan') cursorUI();
  else if (a.kind === 'stroke') strokeEnd(a);
  else if (a.kind === 'shape') shapeEnd(a);
  else if (a.kind === 'pick') pickEnd(a);
  else if (a.kind === 'selnew') selEnd(a);
  else if (a.kind === 'drag') dragEnd(a);
}
function startPan(p) { ACT = { kind: 'pan', id: p.id, x0: p.x, y0: p.y, v: { ...VIEW } }; V.vp.classList.add('c-panning'); V.cur.style.display = 'none'; }
function startPinch(touches) {
  const [a, b] = touches;
  ACT = { kind: 'pinch', id: null, ids: [a.id, b.id], d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v: { ...VIEW }, t0: now(), moved: 0 };
}
function pinchMove(a) {
  const p1 = PTR.get(a.ids[0]), p2 = PTR.get(a.ids[1]);
  if (!p1 || !p2) return;
  const d = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, m = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const z = clampZ(a.v.z * d / a.d0), cx = (a.m0.x - a.v.x) / a.v.z, cy = (a.m0.y - a.v.y) / a.v.z;
  VIEW.z = z; VIEW.x = m.x - cx * z; VIEW.y = m.y - cy * z;
  a.moved = Math.max(a.moved, Math.abs(d - a.d0) + Math.hypot(m.x - a.m0.x, m.y - a.m0.y));
  keepInView(); applyView();
}
function pinchEnd(a) {
  ACT = [...PTR.values()].some(q => q.t === 'touch') ? { kind: 'wait', id: null } : null;   // the finger still down draws nothing until all are lifted
  if (now() - a.t0 < 280 && a.moved < 14) { const w = ACT; ACT = null; undo(); ACT = w; }   // two fingers tapped together undo, as in drawing apps on tablets
}
/* what one finger began goes without a trace when a second finger joins: it was the start of a pinch */
function abortAct() {
  const a = ACT;
  ACT = null;
  if (!a) return;
  if (a.timer) clearInterval(a.timer);
  if ((a.kind === 'stroke' || a.kind === 'shape') && a.box) {
    const R = clipR(a.box.x, a.box.y, a.box.w, a.box.h);
    if (R) { const x = a.L.cx; x.save(); x.beginPath(); x.rect(R.x, R.y, R.w, R.h); x.clip(); x.clearRect(R.x, R.y, R.w, R.h); x.drawImage(HX.bk, 0, 0); x.restore(); }
  } else if (a.kind === 'selnew') { SEL = a.prev; drawOverlay(); }
  else if (a.kind === 'pick') setColor(a.c0);
}
function cursorUI() {
  if (!V.vp) return;
  const v = V.vp.classList;
  v.remove('c-text', 'c-move', 'c-pan', 'c-panning');
  if (SPACE) v.add('c-pan');
  else if (TOOL === 'text') v.add('c-text');
  else if (TOOL === 'move') v.add('c-move');
  if (SPACE || !TOOLS[TOOL].brush) V.cur.style.display = 'none';
}
/* the brush's size around the mouse or the pen */
function cursorAt(p) {
  if (!TOOLS[TOOL].brush || SPACE || FXS || (ACT && ACT.kind === 'pan')) { V.cur.style.display = 'none'; return; }
  const d = opt().s * VIEW.z;
  if (d < 5) { V.cur.style.display = 'none'; return; }
  Object.assign(V.cur.style, { display: 'block', width: d + 'px', height: d + 'px', transform: `translate(${p.x - d / 2}px,${p.y - d / 2}px)` });
}

/* =========================================================
   brushes. The pointer's points are smoothed twice: the line trails the pointer on a short string (so a shaking hand
   doesn't shake it), and runs through the points as curves. Everything a stroke paints goes to the stroke canvas at
   full strength; the layer is then redrawn, only where it changed, as it was with the stroke over it at the brush's
   opacity. So a stroke never darkens where it crosses itself, and the eraser takes away evenly
   ========================================================= */
const canDraw = L => {
  if (!L) return false;
  if (!L.vis) { toast(T('השכבה הזאת מוסתרת. כדי לצייר עליה, מציגים אותה קודם.'), { icon: 'visibility_off' }); return false; }
  return true;
};
let FRAME = 0;
function frameSoon() {
  if (FRAME) return;
  FRAME = requestAnimationFrame(() => { FRAME = 0; const a = ACT; if (a && a.pend && (a.kind === 'stroke' || a.kind === 'shape')) { comp(a, a.pend); a.pend = null; } });
}
let GRAIN = null, TIP = null;
/* paper texture for the pencil: a square of random see-through dots, repeated */
function grainOf(cx) {
  if (!GRAIN) {
    const n = 128, c = newCanvas(n, n), x = c.getContext('2d'), id = x.createImageData(n, n);
    for (let i = 0; i < n * n; i++) id.data[i * 4 + 3] = 70 + Math.random() * 185 | 0;
    x.putImageData(id, 0, 0); GRAIN = c;
  }
  return cx.createPattern(GRAIN, 'repeat');
}
/* the soft brush's dot in the brush's color: solid in the middle, fading to nothing at the edge */
function tipOf(color, hard) {
  const key = color + hard;
  if (TIP && TIP.key === key) return TIP.cv;
  const n = 128, c = newCanvas(n, n), x = c.getContext('2d'), [r, g, b] = rgbOf(color), gr = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`); gr.addColorStop(hard, `rgba(${r},${g},${b},1)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, n, n);
  if (TIP) freeCanvas(TIP.cv);
  TIP = { key, cv: c };
  return c;
}
/* the layer inside R: as it was before the stroke, with the stroke over it */
function comp(a, R0) {
  const R = R0 && clipR(R0.x, R0.y, R0.w, R0.h);
  if (!R) return;
  const { x, y, w, h: hh } = R;
  let src = HX.st;
  if (a.br && a.br.grain) {
    const t = helper('tmp'), tx = t.getContext('2d');
    tx.save(); tx.beginPath(); tx.rect(x, y, w, hh); tx.clip();
    tx.clearRect(x, y, w, hh); tx.drawImage(HX.st, x, y, w, hh, x, y, w, hh);
    tx.globalCompositeOperation = 'destination-in'; tx.fillStyle = grainOf(tx); tx.fillRect(x, y, w, hh);
    tx.restore(); src = t;
  }
  const lx = a.L.cx;
  lx.save(); lx.beginPath(); lx.rect(x, y, w, hh); lx.clip();
  lx.clearRect(x, y, w, hh);
  lx.drawImage(HX.bk, x, y, w, hh, x, y, w, hh);
  lx.globalAlpha = a.op;
  lx.globalCompositeOperation = a.erase ? 'destination-out' : 'source-over';
  lx.drawImage(src, x, y, w, hh, x, y, w, hh);
  lx.restore();
}
function grow(a, x, y, r) { const R = { x: x - r - 2, y: y - r - 2, w: 2 * r + 4, h: 2 * r + 4 }; a.box = unionR(a.box, R); a.pend = unionR(a.pend, R); }
/* how wide the line is at this point. Only a pen has pressure; a mouse and a finger draw at the full size */
const widthOf = (a, p) => a.size * (a.pen ? a.br.pr[0] + (a.br.pr[1] - a.br.pr[0]) * Math.pow(clamp(p, 0, 1), 0.8) : 1);
function startStroke(e, p, c) {
  if (FL) drop();
  const L = layerOf();
  if (!canDraw(L)) return;
  const t = TOOL, o = opt(t), br = BR[t];
  keepLayer(L);
  const sx = helper('st').getContext('2d');
  sx.clearRect(0, 0, D.w, D.h);
  sx.fillStyle = COLOR; sx.globalAlpha = 1;
  const a = ACT = { kind: 'stroke', id: e.pointerId, L, t, br, size: o.s, op: o.o / 100, sm: (o.sm || 0) / 100, color: COLOR, erase: !!br.erase, pen: e.pointerType === 'pen',
    pts: [], s: null, raw: null, box: null, pend: null, t0: now(), carry: 0, sx, r: vpRect() };
  if (br.kind === 'stamp') a.tip = tipOf(COLOR, br.hard);
  feed(a, c.x, c.y, pressureOf(e));
  if (br.kind === 'spray') a.timer = setInterval(() => { if (ACT === a && a.s) { sprayAt(a, a.s.x, a.s.y, a.s.p, 1); frameSoon(); } }, 24);
  frameSoon();
}
function strokeMove(a, e) {
  const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ce of list.length ? list : [e]) feed(a, (ce.clientX - a.r.left - VIEW.x) / VIEW.z, (ce.clientY - a.r.top - VIEW.y) / VIEW.z, pressureOf(ce));
  frameSoon();
}
function feed(a, x, y, p) {
  a.raw = { x, y };
  if (!a.s) { a.s = { x, y, p }; a.pts.push({ x, y, p }); dot(a, a.pts[0]); return; }
  a.s.p += (p - a.s.p) * 0.3;
  const R = a.sm * 12 / VIEW.z, dx = x - a.s.x, dy = y - a.s.y, d = Math.hypot(dx, dy);
  if (d <= R) return;   // still within the string's slack
  const k = (d - R) / d;
  a.s.x += dx * k; a.s.y += dy * k;
  const last = a.pts[a.pts.length - 1];
  if (Math.hypot(a.s.x - last.x, a.s.y - last.y) < 0.35) return;
  a.pts.push({ x: a.s.x, y: a.s.y, p: a.s.p });
  curve(a);
}
const mid = (u, v) => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2, p: (u.p + v.p) / 2 });
/* the newest piece of the line: from the middle of the last two points, curving through the last, to the middle of the next two */
function curve(a) {
  const P = a.pts, n = P.length - 1;
  if (n === 1) { seg(a, P[0], mid(P[0], P[1])); return; }
  const s = mid(P[n - 2], P[n - 1]), c = P[n - 1], e = mid(P[n - 1], P[n]);
  const len = Math.hypot(c.x - s.x, c.y - s.y) + Math.hypot(e.x - c.x, e.y - c.y), step = a.br.kind === 'cap' ? clamp(widthOf(a, c.p) * 0.35, 0.6, 3) : 1.5;
  const k = Math.max(1, Math.ceil(len / step));
  let prev = s;
  for (let i = 1; i <= k; i++) {
    const t = i / k, u = 1 - t, q = { x: u * u * s.x + 2 * u * t * c.x + t * t * e.x, y: u * u * s.y + 2 * u * t * c.y + t * t * e.y, p: s.p + (e.p - s.p) * t };
    seg(a, prev, q); prev = q;
  }
}
function dot(a, q) {
  const r = widthOf(a, q.p) / 2;
  if (a.br.kind === 'cap') { a.sx.beginPath(); a.sx.arc(q.x, q.y, Math.max(0.3, r), 0, Math.PI * 2); a.sx.fill(); grow(a, q.x, q.y, r); }
  else if (a.br.kind === 'stamp') stampAt(a, q.x, q.y, r);
  else sprayAt(a, q.x, q.y, q.p, 1);
}
function seg(a, u, v) {
  const x = a.sx, d = Math.hypot(v.x - u.x, v.y - u.y);
  if (a.br.kind === 'cap') {
    const r0 = Math.max(0.3, widthOf(a, u.p) / 2), r1 = Math.max(0.3, widthOf(a, v.p) / 2);
    x.beginPath(); x.arc(v.x, v.y, r1, 0, Math.PI * 2); x.fill();
    if (d > 0.01) {
      const nx = -(v.y - u.y) / d, ny = (v.x - u.x) / d;
      x.beginPath(); x.moveTo(u.x + nx * r0, u.y + ny * r0); x.lineTo(v.x + nx * r1, v.y + ny * r1); x.lineTo(v.x - nx * r1, v.y - ny * r1); x.lineTo(u.x - nx * r0, u.y - ny * r0); x.closePath(); x.fill();
    }
    grow(a, u.x, u.y, r0); grow(a, v.x, v.y, r1);
  } else if (a.br.kind === 'stamp') {
    // soft dots a tenth of their width apart, carrying the leftover distance into the next piece
    let t = a.carry;
    while (true) {
      const r = widthOf(a, u.p + (v.p - u.p) * (d ? t / d : 1)) / 2, gap = Math.max(0.5, r * 0.2);
      if (t > d) { a.carry = t - d; break; }
      const k = d ? t / d : 0;
      stampAt(a, u.x + (v.x - u.x) * k, u.y + (v.y - u.y) * k, r);
      t += gap;
    }
  } else sprayAt(a, v.x, v.y, v.p, d / Math.max(2, a.size * 0.3));
}
function stampAt(a, x, y, r) {
  r = Math.max(0.5, r);
  a.sx.globalAlpha = a.br.flow; a.sx.drawImage(a.tip, x - r, y - r, 2 * r, 2 * r); a.sx.globalAlpha = 1;
  grow(a, x, y, r);
}
function sprayAt(a, x, y, p, amount) {
  const r = a.size / 2, n = Math.max(1, Math.round(amount * (3 + r * 0.55) * (0.35 + 0.65 * (a.pen ? p : 1)))), s = Math.max(1, a.size / 45);
  for (let i = 0; i < n; i++) { const ang = Math.random() * Math.PI * 2, rr = r * Math.sqrt(Math.random()); a.sx.fillRect(x + Math.cos(ang) * rr - s / 2, y + Math.sin(ang) * rr - s / 2, s, s); }
  grow(a, x, y, r + s);
}
function strokeEnd(a) {
  if (a.timer) clearInterval(a.timer);
  if (a.br.kind !== 'spray' && a.s) {
    // the line reaches where the pointer was lifted, not only where the smoothing had got to
    const last = a.pts[a.pts.length - 1];
    if (a.raw && Math.hypot(a.raw.x - last.x, a.raw.y - last.y) > 0.35) { a.pts.push({ x: a.raw.x, y: a.raw.y, p: a.s.p }); curve(a); }
    const P = a.pts, n = P.length - 1;
    if (n >= 1) seg(a, n === 1 ? mid(P[0], P[1]) : mid(P[n - 1], P[n]), P[n]);
  }
  if (a.pend) { comp(a, a.pend); a.pend = null; }
  const R = a.box && clipR(a.box.x, a.box.y, a.box.w, a.box.h);
  if (!R) return;
  push(pxStep(a.L, R, keptRect(R)));
  changed(a.L);
  if (!a.erase) addRecent(a.color);
}

/* =========================================================
   shapes: a line, an arrow, a rectangle and an ellipse, dragged from one corner to the other. Shift keeps
   lines at steps of 45°, and makes a square and a circle
   ========================================================= */
function startShape(p, c) {
  if (FL) drop();
  const L = layerOf();
  if (!canDraw(L)) return;
  keepLayer(L);
  const sx = helper('st').getContext('2d');
  sx.clearRect(0, 0, D.w, D.h);
  const o = opt('shape');
  ACT = { kind: 'shape', id: p.id, t: TOOL, L, a: c, b: c, size: o.s, op: o.o / 100, color: COLOR, fill: prefs().shf === 'fill', sx, box: null, pend: null, br: null, erase: false, t0: now() };
}
function shapeMove(a, c, shift) {
  let b = c;
  const dx = c.x - a.a.x, dy = c.y - a.a.y;
  if (shift && (a.t === 'line' || a.t === 'arrow')) { const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), d = Math.hypot(dx, dy); b = { x: a.a.x + Math.cos(ang) * d, y: a.a.y + Math.sin(ang) * d }; }
  else if (shift) { const m = Math.max(Math.abs(dx), Math.abs(dy)); b = { x: a.a.x + (dx < 0 ? -m : m), y: a.a.y + (dy < 0 ? -m : m) }; }
  a.b = b;
  const old = a.box;
  if (old) a.sx.clearRect(old.x, old.y, old.w, old.h);
  a.box = drawShape(a.sx, a);
  a.pend = unionR(a.pend, unionR(old, a.box));
  frameSoon();
}
function drawShape(x, a) {
  const w = a.size, A = a.a, B = a.b;
  x.save();
  x.fillStyle = x.strokeStyle = a.color; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round';
  let box;
  if (a.t === 'line' || a.t === 'arrow') {
    const ang = Math.atan2(B.y - A.y, B.x - A.x), hl = Math.max(w * 3.4, 14), hw = hl * 0.62, cs = Math.cos(ang), sn = Math.sin(ang), arrow = a.t === 'arrow' && Math.hypot(B.x - A.x, B.y - A.y) > 2;
    // an arrow's line stops inside its head, so the line's round end doesn't poke out of the point
    const ex = arrow ? B.x - cs * hl * 0.7 : B.x, ey = arrow ? B.y - sn * hl * 0.7 : B.y;
    x.beginPath(); x.moveTo(A.x, A.y); x.lineTo(ex, ey); x.stroke();
    if (arrow) { x.beginPath(); x.moveTo(B.x, B.y); x.lineTo(B.x - cs * hl - sn * hw, B.y - sn * hl + cs * hw); x.lineTo(B.x - cs * hl + sn * hw, B.y - sn * hl - cs * hw); x.closePath(); x.fill(); }
    const pad = w + (arrow ? hl : 0);
    box = { x: Math.min(A.x, B.x) - pad, y: Math.min(A.y, B.y) - pad, w: Math.abs(B.x - A.x) + 2 * pad, h: Math.abs(B.y - A.y) + 2 * pad };
  } else {
    const x0 = Math.min(A.x, B.x), y0 = Math.min(A.y, B.y), ww = Math.abs(B.x - A.x), hh = Math.abs(B.y - A.y);
    x.beginPath();
    if (a.t === 'rect') { x.lineJoin = 'miter'; x.rect(x0, y0, ww, hh); } else x.ellipse(x0 + ww / 2, y0 + hh / 2, ww / 2, hh / 2, 0, 0, Math.PI * 2);
    if (a.fill) x.fill(); else x.stroke();
    box = { x: x0 - w, y: y0 - w, w: ww + 2 * w, h: hh + 2 * w };
  }
  x.restore();
  return box;
}
function shapeEnd(a) {
  if (a.pend) { comp(a, a.pend); a.pend = null; }
  const R = a.box && clipR(a.box.x, a.box.y, a.box.w, a.box.h);
  if (!R) return;
  push(pxStep(a.L, R, keptRect(R)));
  changed(a.L); addRecent(a.color);
}

/* =========================================================
   the eyedropper and the bucket
   ========================================================= */
/* the color as it shows at a point: each visible layer over the background */
function colorAt(c) {
  const x = Math.floor(c.x), y = Math.floor(c.y);
  if (!D || x < 0 || y < 0 || x >= D.w || y >= D.h) return null;
  let col = D.bg ? [...rgbOf(D.bg), 1] : [0, 0, 0, 0];
  for (const L of D.layers) {
    if (!L.vis || L.op <= 0) continue;
    const d = L.cx.getImageData(x, y, 1, 1).data, a = d[3] / 255 * L.op;
    if (!a) continue;
    const oa = a + col[3] * (1 - a);
    col = [0, 1, 2].map(i => (d[i] * a + col[i] * col[3] * (1 - a)) / oa).concat(oa);
  }
  return col[3] > 0.02 ? hexOfRgb(col[0], col[1], col[2]) : null;
}
function startPick(p, c, temp) { ACT = { kind: 'pick', id: p.id, c0: COLOR, temp }; pickMove(ACT, c); }
function pickMove(a, c) { const col = colorAt(c); if (col && col !== COLOR) setColor(col); }
/* the color taken, the tool from before comes back, as in Paint */
function pickEnd(a) { if (!a.temp && BEFORE_PICK && BEFORE_PICK !== 'pick') setTool(BEFORE_PICK); }
/* the area of alike colors around a point. One quick pass marks every pixel alike to the one clicked (1), by tables
   of which values of each channel are near enough; then the area grows line by line through those only (2).
   tol: 0 takes only the very same color, 100 everything */
function flood(img, sx, sy, tol) {
  const W = img.width, H = img.height, d = img.data, n = W * H, k0 = (sy * W + sx) * 4, t = tol * 2.55, m = new Uint8Array(n);
  const near = v0 => { const a = new Uint8Array(256); for (let v = 0; v < 256; v++) a[v] = Math.abs(v - v0) <= t ? 1 : 0; return a; };
  const nr = near(d[k0]), ng = near(d[k0 + 1]), nb = near(d[k0 + 2]), na = near(d[k0 + 3]);
  if (d[k0 + 3] === 0) for (let i = 0, k = 3; i < n; i++, k += 4) m[i] = na[d[k]];   // see-through is see-through, whatever color it hides
  else for (let i = 0, k = 0; i < n; i++, k += 4) m[i] = nr[d[k]] & ng[d[k + 1]] & nb[d[k + 2]] & na[d[k + 3]];
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop(), x = stack.pop(), row = y * W;
    if (m[row + x] !== 1) continue;
    let l = x, r = x;
    while (l > 0 && m[row + l - 1] === 1) l--;
    while (r < W - 1 && m[row + r + 1] === 1) r++;
    m.fill(2, row + l, row + r + 1);
    if (l < x0) x0 = l; if (r > x1) x1 = r; if (y < y0) y0 = y; if (y > y1) y1 = y;
    for (let ny = y - 1; ny <= y + 1; ny += 2) {
      if (ny < 0 || ny >= H) continue;
      const rr = ny * W;
      let run = false;
      for (let i = l; i <= r; i++) {
        if (m[rr + i] === 1) { if (!run) { stack.push(i, ny); run = true; } } else run = false;
      }
    }
  }
  return x1 < 0 ? null : { m, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}
const nextFrame = () => Promise.race([new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))), sleep(60)]);
async function fillAt(c) {
  if (FL) drop();
  const L = layerOf();
  if (!canDraw(L)) return;
  const x = Math.floor(c.x), y = Math.floor(c.y);
  if (x < 0 || y < 0 || x >= D.w || y >= D.h) return;
  // a big drawing takes a moment: the wait cursor shows first, and nothing else starts meanwhile
  const busy = ACT = { kind: 'busy', id: null }, d0 = D;
  V.vp.classList.add('c-wait');
  try {
    await nextFrame();
    if (D !== d0 || !D.layers.includes(L)) return;
    const o = opt('fill'), all = prefs().all !== false, t = helper('tmp'), tx = t.getContext('2d');
    // what the bucket sees: every visible layer together (lines on one layer, color on another), or this layer alone
    let img;
    if (all) {
      tx.clearRect(0, 0, D.w, D.h);
      for (const M of D.layers) if (M.vis && M.op > 0) { tx.globalAlpha = M.op; tx.drawImage(M.cv, 0, 0); }
      tx.globalAlpha = 1;
      img = tx.getImageData(0, 0, D.w, D.h);
    } else img = L.cx.getImageData(0, 0, D.w, D.h);
    const f = flood(img, x, y, o.tol);
    if (!f) return;
    const B = f.box, out = new ImageData(B.w, B.h), px = new Uint32Array(out.data.buffer), [r, g, b] = rgbOf(COLOR), m = f.m;
    const v = ((255 << 24) | (b << 16) | (g << 8) | r) | 0;   // the bytes of one pixel, read as one number (little-endian: A B G R)
    for (let yy = 0, j = 0; yy < B.h; yy++) for (let i = (B.y + yy) * D.w + B.x, e = i + B.w; i < e; i++, j++) px[j] = v & -(m[i] >> 1);
    // one pixel more all round, so the paint goes under the soft edge of the line around it and leaves no pale rim:
    // the area drawn again a pixel to each side, by the graphics card
    const R = clipR(B.x - 1, B.y - 1, B.w + 2, B.h + 2);
    tx.clearRect(R.x, R.y, R.w, R.h); tx.putImageData(out, B.x, B.y);
    tx.save(); tx.beginPath(); tx.rect(R.x, R.y, R.w, R.h); tx.clip();
    const src = newCanvas(B.w, B.h); src.getContext('2d').putImageData(out, 0, 0);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) tx.drawImage(src, B.x + dx, B.y + dy);
    tx.restore(); freeCanvas(src);
    const before = !all && R.w === D.w && R.h === D.h ? img : L.cx.getImageData(R.x, R.y, R.w, R.h);
    L.cx.save(); L.cx.globalAlpha = o.o / 100; L.cx.drawImage(t, R.x, R.y, R.w, R.h, R.x, R.y, R.w, R.h); L.cx.restore();
    push(pxStep(L, R, before));
    changed(L); addRecent(COLOR);
  } finally {
    if (ACT === busy) ACT = null;
    V.vp.classList.remove('c-wait');
  }
}

/* =========================================================
   text: a box on the drawing to write in, with the font, size and color from the ribbon. Clicking outside it
   (or Ctrl+Enter, or Esc) paints it onto the layer
   ========================================================= */
const RTL_RE = new RegExp('[' + String.fromCharCode(0x590) + '-' + String.fromCharCode(0x8ff) + String.fromCharCode(0xfb1d) + '-' + String.fromCharCode(0xfefc) + ']');
const dirOf = s => { for (const ch of s) { if (RTL_RE.test(ch)) return 'rtl'; if (/[A-Za-z]/.test(ch)) return 'ltr'; } return UI_DIR; };
const defFont = () => LANG_FONTS[0] || 'Rubik';
function textStyle() { const p = prefs(), o = opt('text'); return { font: FONT_NAMES.has(p.font) ? p.font : defFont(), size: clamp(o.s, 6, 800), bold: p.bold !== false, op: o.o / 100 }; }
function openText(c) {
  if (FL) drop();
  const L = layerOf();
  if (!canDraw(L)) return;
  const el = h('textarea', { class: 'dw-txt', dir: 'auto', spellcheck: 'false', autocomplete: 'off', rows: '1', wrap: 'off', 'aria-label': T('טקסט') });
  const grip = h('button', { class: 'dw-tgrip', type: 'button', title: T('גוררים כדי להזיז את הטקסט'), 'aria-label': T('הזזת הטקסט') }, icon('open_with'));
  TX = { x: c.x, y: c.y, el, grip, L };
  el.addEventListener('input', () => placeText());
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitText(); } });
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    try { grip.setPointerCapture(e.pointerId); } catch {}
    const x0 = e.clientX, y0 = e.clientY, tx0 = TX.x, ty0 = TX.y;
    const mv = ev => { if (!TX) return; TX.x = tx0 + (ev.clientX - x0) / VIEW.z; TX.y = ty0 + (ev.clientY - y0) / VIEW.z; placeText(); };
    const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); if (TX) TX.el.focus(); };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  });
  V.vp.append(el, grip);
  styleText();
  setTimeout(() => { if (TX && TX.el === el) el.focus({ preventScroll: true }); }, 0);
  undoUI();
}
function styleText() {
  if (!TX) return;
  const s = textStyle();
  Object.assign(TX.el.style, { fontFamily: `"${s.font}"`, fontWeight: s.bold ? '700' : '400', color: COLOR, opacity: String(s.op) });
  TX.fs = s.size; TX.color = COLOR;
  placeText();
  const t = TX;
  if (document.fonts) document.fonts.load(`${s.bold ? 700 : 400} 20px "${s.font}"`, 'אבגa').then(() => { if (TX === t) placeText(); }, () => {});
}
/* the box follows the drawing when it is zoomed or moved, and grows with what is written. In right to left it grows to the left */
function placeText() {
  if (!TX) return;
  const el = TX.el, z = VIEW.z, [sx, sy] = toView(TX.x, TX.y), rtl = UI_DIR === 'rtl';
  el.style.fontSize = (TX.fs * z) + 'px';
  el.style.textAlign = rtl ? 'right' : 'left';
  el.style.width = '0px'; el.style.height = '0px';
  const w = Math.max(el.scrollWidth, TX.fs * z * 0.5) + TX.fs * z * 0.3, hh = Math.max(el.scrollHeight, TX.fs * z * 1.25);
  el.style.width = w + 'px'; el.style.height = hh + 'px';
  el.style.top = (sy - 1) + 'px';
  el.style.left = (rtl ? sx - w - 3 : sx - 3) + 'px';
  Object.assign(TX.grip.style, { top: (sy - 32) + 'px', left: (rtl ? sx - 13 : sx - 13) + 'px' });
}
function cancelText() { const t = TX; if (!t) return; TX = null; t.el.remove(); t.grip.remove(); undoUI(); }
function commitText() {
  const t = TX;
  if (!t) return;
  cancelText();
  const txt = t.el.value.replace(/\s+$/, '');
  if (!txt.trim() || !D || !D.layers.includes(t.L)) return;
  const s = textStyle(), lines = txt.split('\n'), fs = t.fs, lh = fs * 1.25, rtl = UI_DIR === 'rtl', L = t.L, x = L.cx;
  x.save();
  x.font = `${s.bold ? 700 : 400} ${fs}px "${s.font}"`;
  const wmax = Math.max(1, ...lines.map(l => x.measureText(l).width));
  const R = clipR(rtl ? t.x - wmax - fs : t.x - fs, t.y - fs * 0.5, wmax + fs * 2, lines.length * lh + fs);
  if (!R) { x.restore(); return; }
  const before = x.getImageData(R.x, R.y, R.w, R.h);
  x.globalAlpha = s.op; x.fillStyle = t.color; x.textBaseline = 'middle'; x.textAlign = rtl ? 'right' : 'left';
  lines.forEach((ln, i) => { x.direction = dirOf(ln); x.fillText(ln, t.x, t.y + i * lh + lh / 2); });
  x.restore();
  push(pxStep(L, R, before));
  changed(L); addRecent(t.color);
}

/* =========================================================
   choosing part of the layer, and moving it: a rectangle, or a free outline (lasso). Dragging inside lifts the
   pixels off the layer; they float until a click outside, Enter or another tool puts them down. The handles
   change their size (a corner keeps the shape; with Shift it stretches)
   ========================================================= */
const PCX = newCanvas(1, 1).getContext('2d');
const MOVE_TOOLS = ['select', 'lasso', 'move'];
function selPath(s = SEL) { const p = new Path2D(); s.path.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); return p; }
const inBox = (b, c) => c.x >= b.x && c.y >= b.y && c.x <= b.x + b.w && c.y <= b.y + b.h;
const inSel = c => !!SEL && inBox(SEL.box, c) && (SEL.rect || PCX.isPointInPath(selPath(), c.x, c.y));
function rectSel(R) { return { rect: true, box: R, path: [[R.x, R.y], [R.x + R.w, R.y], [R.x + R.w, R.y + R.h], [R.x, R.y + R.h]] }; }
function freeSel(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const box = clipR(x0, y0, x1 - x0, y1 - y0);
  return box ? { rect: false, box, path: pts } : null;
}
function handlesOf() {
  const b = FL || (SEL && SEL.box);
  if (!b) return [];
  const [x0, y0] = toView(b.x, b.y), [x1, y1] = toView(b.x + b.w, b.y + b.h), xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  return [[x0, y0], [xm, y0], [x1, y0], [x1, ym], [x1, y1], [xm, y1], [x0, y1], [x0, ym]];
}
function handleAt(p, hz) { const hs = handlesOf(); for (let i = 0; i < hs.length; i++) if (Math.abs(p.x - hs[i][0]) <= hz && Math.abs(p.y - hs[i][1]) <= hz) return i; return -1; }
function startSelect(e, p, c) {
  const hd = handleAt(p, p.t === 'touch' ? 18 : 9);
  if (hd >= 0 && (FL || SEL)) { if (!FL && !lift()) return; startDrag(p, c, hd); return; }
  if (FL && inBox(FL, c)) { startDrag(p, c, -1); return; }
  if (!FL && inSel(c)) { if (lift()) startDrag(p, c, -1); return; }
  if (TOOL === 'move') {
    if (FL) { drop(); return; }
    // the move tool, with nothing chosen, moves the whole layer
    SEL = rectSel({ x: 0, y: 0, w: D.w, h: D.h });
    if (lift(true)) startDrag(p, c, -1); else SEL = null;
    return;
  }
  if (FL) drop();
  ACT = { kind: 'selnew', id: p.id, a: c, b: c, pts: [[c.x, c.y]], prev: SEL, lasso: TOOL === 'lasso' };
  SEL = null; drawOverlay();
}
function selMove(a, c, shift) {
  if (a.lasso) { const l = a.pts[a.pts.length - 1]; if (Math.hypot(c.x - l[0], c.y - l[1]) * VIEW.z >= 2) a.pts.push([c.x, c.y]); }
  else if (shift) { const dx = c.x - a.a.x, dy = c.y - a.a.y, m = Math.max(Math.abs(dx), Math.abs(dy)); a.b = { x: a.a.x + (dx < 0 ? -m : m), y: a.a.y + (dy < 0 ? -m : m) }; }
  else a.b = c;
  drawOverlay();
}
function selEnd(a) {
  if (a.lasso) SEL = a.pts.length > 2 ? freeSel(a.pts) : null;
  else {
    const R = clipR(Math.min(a.a.x, a.b.x), Math.min(a.a.y, a.b.y), Math.abs(a.b.x - a.a.x), Math.abs(a.b.y - a.a.y));
    SEL = R && (R.w * VIEW.z >= 3 || R.h * VIEW.z >= 3) ? rectSel(R) : null;
  }
  drawOverlay(); optsUI();
}
/* the chosen pixels off the layer, into a canvas of their own that floats over it */
function lift(once) {
  if (FL) return true;
  if (!SEL) return false;
  const L = layerOf();
  if (!canDraw(L)) return false;
  const b = clipR(SEL.box.x, SEL.box.y, SEL.box.w, SEL.box.h);
  if (!b) return false;
  keepLayer(L);
  const cv = newCanvas(b.w, b.h), x = cv.getContext('2d');
  x.drawImage(L.cv, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
  const path = SEL.rect ? null : selPath();
  if (path) { x.globalCompositeOperation = 'destination-in'; x.translate(-b.x, -b.y); x.fill(path); }
  L.cx.save(); if (path) L.cx.clip(path); L.cx.clearRect(b.x, b.y, b.w, b.h); L.cx.restore();
  cv.className = 'dw-lc dw-fl';
  FL = { L, cv, x: b.x, y: b.y, w: b.w, h: b.h, ow: b.w, oh: b.h, kind: 'lift', from: b, once: !!once };
  SEL = null;
  paintPaper(); placeFloat(); undoUI(); optsUI();
  return true;
}
function startDrag(p, c, hd) { ACT = { kind: 'drag', id: p.id, c0: c, hd, b0: { x: FL.x, y: FL.y, w: FL.w, h: FL.h } }; }
function dragMove(a, c, shift) {
  if (!FL) return;
  const dx = c.x - a.c0.x, dy = c.y - a.c0.y, b = a.b0;
  if (a.hd < 0) {
    FL.x = b.x + dx; FL.y = b.y + dy;
    if (FL.w === FL.ow && FL.h === FL.oh) { FL.x = Math.round(FL.x); FL.y = Math.round(FL.y); }   // whole pixels, so a picture moved and not resized stays sharp
  } else {
    // the handles, round from the top left corner: 0 corner, 1 top, 2 corner, 3 right, 4 corner, 5 bottom, 6 corner, 7 left
    const H = a.hd, left = H === 0 || H === 6 || H === 7, right = H >= 2 && H <= 4, top = H <= 2, bottom = H >= 4 && H <= 6;
    let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
    if (left) x0 += dx; if (right) x1 += dx; if (top) y0 += dy; if (bottom) y1 += dy;
    if (H % 2 === 0 && !shift) {
      const sx = (x1 - x0) / b.w, sy = (y1 - y0) / b.h, s = Math.abs(sx) > Math.abs(sy) ? sx : sy;
      if (left) x0 = x1 - b.w * s; else x1 = x0 + b.w * s;
      if (top) y0 = y1 - b.h * s; else y1 = y0 + b.h * s;
    }
    FL.x = Math.min(x0, x1); FL.y = Math.min(y0, y1); FL.w = Math.max(1, Math.abs(x1 - x0)); FL.h = Math.max(1, Math.abs(y1 - y0));
  }
  placeFloat();
}
function dragEnd() { if (FL && FL.once) drop(); drawOverlay(); }
/* the floating pixels put down where they are now, as one step to undo */
function drop() {
  const f = FL;
  if (!f) return;
  FL = null; f.cv.remove();
  const L = f.L;
  if (!D || !D.layers.includes(L)) { freeCanvas(f.cv); paintPaper(); return; }
  const to = clipR(f.x, f.y, f.w, f.h);
  const put = () => { const x = L.cx; x.save(); x.imageSmoothingQuality = 'high'; x.drawImage(f.cv, 0, 0, f.ow, f.oh, f.x, f.y, f.w, f.h); x.restore(); };
  if (f.kind === 'lift') {
    if (f.x === f.from.x && f.y === f.from.y && f.w === f.ow && f.h === f.oh) {   // back where it came from: nothing changed
      const b = f.from, x = L.cx;
      x.save(); x.beginPath(); x.rect(b.x, b.y, b.w, b.h); x.clip(); x.clearRect(b.x, b.y, b.w, b.h); x.drawImage(HX.bk, 0, 0); x.restore();
    } else {
      put();
      const R = unionR(f.from, to);
      push(pxStep(L, R, keptRect(R)));
      changed(L);
    }
  } else {
    const before = to && L.cx.getImageData(to.x, to.y, to.w, to.h);
    put();
    const px = to ? pxStep(L, to, before) : null;
    if (f.kind === 'layer') {
      const { a, b } = f.pre;
      push({ bytes: (px ? px.bytes : 0) + D.w * D.h * 4, undo() { if (px) px.undo(); setLayers(a); changed(); }, redo() { setLayers(b); if (px) px.redo(); changed(); } });
      changed(L);
    } else if (px) { push(px); changed(L); }
  }
  freeCanvas(f.cv);
  paintPaper(); layersUI(); undoUI(); optsUI();
}
/* the floating pixels go back: lifted ones to where they were, a pasted picture away (with the layer made for it) */
function cancelFloat() {
  const f = FL;
  if (!f) return;
  FL = null; f.cv.remove();
  if (f.kind === 'lift' && D.layers.includes(f.L)) { const b = f.from, x = f.L.cx; x.save(); x.beginPath(); x.rect(b.x, b.y, b.w, b.h); x.clip(); x.clearRect(b.x, b.y, b.w, b.h); x.drawImage(HX.bk, 0, 0); x.restore(); }
  else if (f.kind === 'layer') setLayers(f.pre.a);
  freeCanvas(f.cv);
  paintPaper(); layersUI(); undoUI(); optsUI();
}
function commitPending() { stopPlay(); if (FXS) fxApply(); if (TX) commitText(); if (FL) drop(); }
function selectAll() {
  if (!D) return;
  commitPending();
  if (!MOVE_TOOLS.includes(TOOL)) setTool('select');
  SEL = rectSel({ x: 0, y: 0, w: D.w, h: D.h }); drawOverlay(); optsUI();
}
function deselect() { if (FL) drop(); SEL = null; drawOverlay(); optsUI(); }
function delSel() {
  if (FL) {
    const f = FL;
    if (f.kind !== 'lift') { cancelFloat(); return; }
    FL = null; f.cv.remove(); freeCanvas(f.cv);
    push(pxStep(f.L, f.from, keptRect(f.from)));   // the hole stays: what was lifted is gone
    changed(f.L); paintPaper(); undoUI(); optsUI();
    return;
  }
  if (!SEL) return;
  const L = layerOf();
  if (!canDraw(L)) return;
  const R = clipR(SEL.box.x, SEL.box.y, SEL.box.w, SEL.box.h);
  if (!R) return;
  const before = L.cx.getImageData(R.x, R.y, R.w, R.h);
  L.cx.save(); if (!SEL.rect) L.cx.clip(selPath()); L.cx.clearRect(R.x, R.y, R.w, R.h); L.cx.restore();
  push(pxStep(L, R, before));
  changed(L);
}
function copySel(cut) {
  let c;
  if (FL) { c = newCanvas(Math.round(FL.w), Math.round(FL.h)); c.getContext('2d').drawImage(FL.cv, 0, 0, c.width, c.height); c._at = { x: Math.round(FL.x), y: Math.round(FL.y) }; }
  else if (SEL) {
    const L = layerOf(), R = clipR(SEL.box.x, SEL.box.y, SEL.box.w, SEL.box.h);
    if (!R) return;
    c = newCanvas(R.w, R.h);
    const x = c.getContext('2d');
    x.drawImage(L.cv, R.x, R.y, R.w, R.h, 0, 0, R.w, R.h);
    if (!SEL.rect) { x.globalCompositeOperation = 'destination-in'; x.translate(-R.x, -R.y); x.fill(selPath()); }
    c._at = { x: R.x, y: R.y };
  } else return;
  freeCanvas(CLIP); CLIP = c;
  // the computer's clipboard too, so it can be pasted in other programs
  try { c.toBlob(b => { if (b && navigator.clipboard && window.ClipboardItem) navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).catch(() => {}); }, 'image/png'); } catch {}
  if (cut) delSel();
  toast(cut ? T('נגזר') : T('הועתק'), { icon: cut ? 'content_cut' : 'content_copy' });
}
/* a pasted picture, or one from a file: floating where it can be moved and resized before it is put down.
   As a picture from the computer it comes on a layer of its own; pasted, on the layer being drawn on */
async function placeImage(src, newLayer, at) {
  if (!D) return;
  commitPending();
  let im = src;
  if (!(src instanceof HTMLCanvasElement)) {
    try { im = await loadImg(await blobToDataURL(src)); } catch { toast(T('לא הצלחתי לפתוח את התמונה')); return; }
  }
  if (!D) return;
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  if (!iw || !ih) return;
  // the picture is kept at its own size (up to twice the drawing's), so making it bigger later stays sharp
  const kk = Math.min(1, 2 * Math.max(D.w, D.h) / Math.max(iw, ih)), cv = newCanvas(Math.round(iw * kk), Math.round(ih * kk));
  cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
  // and comes in no bigger than the drawing
  const k = Math.min(1, D.w * 0.92 / iw, D.h * 0.92 / ih), w = Math.max(1, Math.round(iw * k)), hh = Math.max(1, Math.round(ih * k));
  if (newLayer && !room(1)) { toast(T('אין מקום בזיכרון של המכשיר לעוד שכבה. התמונה נכנסת לשכבה שבחרת.'), { ms: 6000 }); newLayer = false; }
  let L = layerOf(), pre = null;
  if (!newLayer && !canDraw(L)) { freeCanvas(cv); return; }
  if (!MOVE_TOOLS.includes(TOOL)) setTool('move');
  if (newLayer) {
    const a = snapLayers(), name = src && src.name ? String(src.name).replace(/\.[^.]+$/, '').trim().slice(0, 40) : '';
    L = makeLayer(name && name !== 'image' ? name : T('תמונה'));
    D.layers.splice(D.layers.indexOf(layerOf()) + 1, 0, L); D.active = L.id;
    bind(L);
    pre = { a, b: snapLayers() };
  }
  const r = vpRect(), mc = at || (src && src._at ? null : toCanvas({ x: r.width / 2, y: r.height / 2 }));
  const x = src && src._at && !at ? src._at.x : Math.round(clamp(mc.x, 0, D.w) - w / 2), y = src && src._at && !at ? src._at.y : Math.round(clamp(mc.y, 0, D.h) - hh / 2);
  cv.className = 'dw-lc dw-fl';
  FL = { L, cv, x, y, w, h: hh, ow: cv.width, oh: cv.height, kind: newLayer ? 'layer' : 'paste', pre };
  SEL = null;
  paintPaper(); placeFloat(); layersUI(); undoUI(); optsUI();
}
function onPaste(e) {
  if (!D || !LOADED || S.cur !== LOADED || MODALS.length || !drawOpen()) return;
  if (e.target && e.target.closest && e.target.closest('input,textarea,[contenteditable="true"]')) return;   // text pasted into a box
  const item = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.kind === 'file' && /^image\//.test(i.type));
  const f = item && item.getAsFile();
  if (f) {
    e.preventDefault();
    // the picture copied here a moment ago comes back to where it was
    if (CLIP) loadImg(URL.createObjectURL(f)).then(im => { const same = im.naturalWidth === CLIP.width && im.naturalHeight === CLIP.height; URL.revokeObjectURL(im.src); placeImage(same ? copyOf(CLIP) : f, false); }, () => placeImage(f, false));
    else placeImage(f, false);
    return;
  }
  if (CLIP) { e.preventDefault(); placeImage(copyOf(CLIP), false); }
}
function copyOf(c) { const n = newCanvas(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); n._at = c._at; return n; }
function pickImage() {
  const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) placeImage(f, true); });
  document.body.append(inp); inp.click();
}

/* =========================================================
   the outline of what is chosen, in the viewport's own pixels
   ========================================================= */
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, at) => { const e = document.createElementNS(SVGNS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };
const pathD = (pts, open) => pts.length ? 'M' + pts.map(([x, y]) => { const [a, b] = toView(x, y); return a.toFixed(1) + ' ' + b.toFixed(1); }).join('L') + (open ? '' : 'Z') : '';
function drawOverlay() {
  if (!V.ov) return;
  V.ov.textContent = '';
  if (!D) return;
  let d = null;
  const making = ACT && ACT.kind === 'selnew';
  if (FL) { const [x0, y0] = toView(FL.x, FL.y), [x1, y1] = toView(FL.x + FL.w, FL.y + FL.h); d = `M${x0} ${y0}H${x1}V${y1}H${x0}Z`; }
  else if (making) d = ACT.lasso ? pathD(ACT.pts, true) : pathD([[ACT.a.x, ACT.a.y], [ACT.b.x, ACT.a.y], [ACT.b.x, ACT.b.y], [ACT.a.x, ACT.b.y]]);
  else if (SEL) d = pathD(SEL.path);
  if (d) V.ov.append(sv('path', { d, class: 'dw-ants' }), sv('path', { d, class: 'dw-ants b' }));
  if ((FL || SEL) && !making && MOVE_TOOLS.includes(TOOL)) for (const [x, y] of handlesOf()) V.ov.append(sv('rect', { x: x - 5, y: y - 5, width: 10, height: 10, rx: 2, class: 'dw-hd' }));
  if (fxHasPoint()) {
    const [x, y] = toView(FXS.p.c[0], FXS.p.c[1]);
    for (const cls of ['dw-fxpt', 'dw-fxpt b']) V.ov.append(sv('circle', { cx: x, cy: y, r: 10, class: cls }), sv('path', { d: `M${x - 18} ${y}H${x - 6}M${x + 6} ${y}H${x + 18}M${x} ${y - 18}V${y - 6}M${x} ${y + 6}V${y + 18}`, class: cls }));
  }
}

/* =========================================================
   the tool, its settings and the color
   ========================================================= */
function setTool(t) {
  if (!TOOLS[t] || ACT) return;
  stopPlay();
  if (FXS) fxApply();
  if (TX && t !== 'text') commitText();
  if (FL && !MOVE_TOOLS.includes(t)) drop();
  if (!MOVE_TOOLS.includes(t)) SEL = null;
  if (t === 'pick' && TOOL !== 'pick') BEFORE_PICK = TOOL;
  TOOL = t;
  prefs().tool = t; savePrefs();
  toolUI(); cursorUI(); drawOverlay();
}
function toolUI() {
  for (const b of document.querySelectorAll('#ribbon [data-tool]')) { const on = b.dataset.tool === TOOL; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  for (const b of document.querySelectorAll('#ribbon .dw-shf')) b.classList.toggle('on', prefs().shf === 'fill');
  optsUI();
}
/* the size slider goes up in steps that grow with the size: fine for thin lines, quick for big brushes */
const posOf = s => Math.round(Math.log(clamp(s, 1, SIZE_MAX)) / Math.log(SIZE_MAX) * 1000);
const sizeOfPos = v => Math.max(1, Math.round(Math.exp(v / 1000 * Math.log(SIZE_MAX))));
function slider(ic, label, val, min, max, show, set) {
  const r = h('input', { type: 'range', min: String(min), max: String(max), value: String(val), 'aria-label': label }), b = h('b', { text: show(val) });
  r.addEventListener('input', () => { const v = set(+r.value); b.textContent = show(v); savePrefs(); });
  r.addEventListener('change', () => r.blur());
  return h('label', { class: 'dw-sl', title: label }, icon(ic), r, b);
}
const pctSlider = (ic, label, o, k, min = 0) => slider(ic, label, o[k], min, 100, v => v + '%', v => { o[k] = v; if (TX) styleText(); return v; });
/* opacity is kept, and shown as transparency, as everywhere in the app: 0% is the full color */
const seeSlider = o => slider('opacity', T('שקיפות'), 100 - o.o, 0, 99, v => v + '%', v => { o.o = 100 - v; if (TX) styleText(); return v; });
function optsUI() {
  if (!V.opts) return;
  const gb = V.opts.querySelector('.gb'), t = TOOL, o = opt(t);
  gb.textContent = '';
  if (TOOLS[t].brush || TOOLS[t].shape) {
    V.size = slider('line_weight', T('גודל ([ ו-])'), posOf(o.s), 0, 1000, () => o.s + ' px', v => (o.s = sizeOfPos(v)));
    gb.append(V.size, seeSlider(o));
    if (TOOLS[t].brush && t !== 'spray') gb.append(pctSlider('gesture', T('החלקה'), o, 'sm'));
  } else if (t === 'fill') {
    const all = h('input', { type: 'checkbox' });
    all.checked = prefs().all !== false;
    all.addEventListener('change', () => { prefs().all = all.checked; savePrefs(); all.blur(); });
    gb.append(pctSlider('tune', T('רגישות'), o, 'tol'), seeSlider(o),
      h('label', { class: 'dw-sl', title: T('הדלי רואה את הקווים מכל השכבות, ולא רק מהשכבה שמציירים בה') }, all, T('לפי כל השכבות')));
  } else if (t === 'text') {
    const s = textStyle(), font = h('select', { class: 'sel', 'aria-label': T('גופן'), title: T('גופן') }, FONTS.map(f => h('option', { value: f, text: f, style: { fontFamily: `"${f}"` } })));
    font.value = s.font;
    font.addEventListener('change', () => { prefs().font = font.value; savePrefs(); styleText(); if (TX) TX.el.focus(); });
    const size = h('input', { class: 'field', type: 'number', min: '6', max: '800', value: String(s.size), 'aria-label': T('גודל הכתב'), title: T('גודל הכתב, בפיקסלים של הציור') });
    size.addEventListener('change', () => { opt('text').s = clamp(Math.round(+size.value) || 64, 6, 800); size.value = String(opt('text').s); savePrefs(); styleText(); });
    const bold = h('button', { class: 'rb' + (s.bold ? ' on' : ''), type: 'button', title: T('מודגש'), 'aria-label': T('מודגש'), 'aria-pressed': String(s.bold), onclick: () => { prefs().bold = !textStyle().bold; savePrefs(); optsUI(); styleText(); if (TX) TX.el.focus(); } }, icon('format_bold'));
    gb.append(h('div', { class: 'dw-sl' }, font, size, bold), seeSlider(o));
  } else if (t === 'pick') gb.append(h('div', { class: 'dw-hint', text: T('לוחצים על הציור כדי לקחת ממנו צבע. עם כל מברשת אפשר גם להחזיק Alt וללחוץ.') }));
  else {
    const has = !!(SEL || FL);
    gb.append(h('div', { class: 'row' }, rbtn('dwSelAll', 'select_all', T('בחירת הכל'), { text: T('בחירת הכל'), title: T('בחירת הכל (Ctrl+A)') }), rbtn('dwSelDel', 'delete', T('מחיקה'), { text: T('מחיקה'), title: T('מחיקת מה שנבחר (Delete)'), cls: has ? '' : 'dw-dis' })),
      h('div', { class: 'dw-hint', text: t === 'move' ? T('גוררים כדי להזיז את כל השכבה, או את מה שבחרתם.') : T('גוררים כדי לבחור, ואז גוררים את הבחירה כדי להזיז אותה. הפינות משנות את הגודל.') }));
    for (const b of gb.querySelectorAll('.dw-dis')) b.disabled = true;
  }
}
function sizeBy(dir) {
  const t = TOOLS[TOOL];
  if (!t.brush && !t.shape && TOOL !== 'text') return;
  const o = opt();
  o.s = clamp(dir > 0 ? Math.max(o.s + 1, Math.round(o.s * 1.18)) : Math.min(o.s - 1, Math.round(o.s / 1.18)), 1, TOOL === 'text' ? 800 : SIZE_MAX);
  savePrefs(); optsUI(); styleText();
  const p = PTR.size ? null : V.lastHover;
  if (p) cursorAt(p);
}
function setColor(c) {
  c = hex6(c);
  if (!c) return;
  COLOR = c; prefs().color = c; savePrefs();
  colorUI();
  if (TX) styleText();
}
function addRecent(c) {
  const p = prefs(), list = (Array.isArray(p.recent) ? p.recent : []).filter(x => hex6(x) && x !== c);
  p.recent = [c, ...list].slice(0, 10); savePrefs();
  colorUI();
}
function colorUI() {
  if (!V.curSw) return;
  V.curSw.style.background = COLOR;
  V.curSw.title = T('הצבע שמציירים בו. לחיצה פותחת עוד צבעים') + ' (' + COLOR + ')';
  const list = (Array.isArray(prefs().recent) ? prefs().recent : []).filter(hex6).slice(0, 10);
  V.recent.replaceChildren(...list.map(c => sw(c)), ...Array.from({ length: 10 - list.length }, () => h('span', { class: 'sw empty' })));
}
/* more colors: a bigger palette, any color through the system's color picker, or a #code */
function colorPop(anchor, cur, pick, extra) {
  const native = h('input', { type: 'color', value: cur || '#000000', 'aria-label': T('צבע אחר') });
  native.addEventListener('input', () => pick(native.value));
  const code = h('input', { class: 'field dw-hex', type: 'text', value: cur || '', maxlength: '7', spellcheck: 'false', 'aria-label': T('קוד צבע') });
  code.addEventListener('keydown', e => { if (e.key === 'Enter') { const c = hex6(code.value); if (c) { pick(c); closePopover(); } } });
  code.addEventListener('change', () => { const c = hex6(code.value); if (c) pick(c); });
  openPop(anchor, h('div', { class: 'dw-cpop' },
    h('div', { class: 'dw-pal' }, MORE_COLORS.map(c => h('button', { class: 'sw', type: 'button', style: { background: c }, title: c, 'aria-label': c, onclick: () => { pick(c); closePopover(); } }))),
    h('div', { class: 'dw-crow' }, h('label', { class: 'dw-crow' }, native, T('צבע אחר')), h('span', { class: 'grow' }), code), extra || null));
}
function bgPop(anchor) {
  const set = c => { if (c === D.bg) return; struct(() => { D.bg = c; }); };
  const none = h('button', { class: 'btn small dw-clear', type: 'button', onclick: () => { set(''); closePopover(); } }, h('span', { class: 'sw none', style: { width: '18px', height: '18px' } }), T('רקע שקוף'));
  colorPop(anchor, D.bg || '#ffffff', c => set(c), none);
}

/* =========================================================
   layers
   ========================================================= */
function addLayer() {
  if (!room(1)) { fullMsg(); return; }
  struct(() => { const L = makeLayer(nextLayerName()); D.layers.splice(D.layers.indexOf(layerOf()) + 1, 0, L); D.active = L.id; });
}
/* a copy of the layer in every frame */
function dupLayer() {
  const S0 = layerOf(), list = [...S0.cells].filter(([, c]) => c.ver || c === S0.cell);
  if (!room(list.length)) { fullMsg(); return; }
  struct(() => {
    const L = makeLayer(T('{0} (עותק)', S0.name).slice(0, 60), { op: S0.op, vis: S0.vis, fx: S0.fx });
    for (const [k, c] of list) { const n = newCell(); n.cx.drawImage(c.cv, 0, 0); n.ver = c.ver ? 1 : 0; L.cells.set(k, n); }
    D.layers.splice(D.layers.indexOf(S0) + 1, 0, L); D.active = L.id;
  });
}
function moveLayer(dir) {
  const L = layerOf(), i = D.layers.indexOf(L), j = i + dir;
  if (j < 0 || j >= D.layers.length) return;
  struct(() => { D.layers.splice(i, 1); D.layers.splice(j, 0, L); });
}
function delLayer() {
  if (D.layers.length <= 1) { toast(T('בציור צריכה להיות לפחות שכבה אחת')); return; }
  const L = layerOf(), i = D.layers.indexOf(L);
  struct(() => { D.layers.splice(i, 1); D.active = D.layers[Math.max(0, i - 1)].id; });
}
/* the layer onto the one under it, as it shows (its opacity too), in every frame, and the two become one.
   The merged cells are new canvases, so undo only puts the old ones back */
function mergeDown() {
  const L = layerOf(), i = D.layers.indexOf(L);
  if (i <= 0) return;
  const B = D.layers[i - 1], anim = D.frames.length > 1;
  if (!B.vis) { toast(T('השכבה שמתחת מוסתרת. כדי למזג, מציגים אותה קודם.')); return; }
  if (anim && L.fx !== B.fx) { toast(T('אפשר למזג רק שתי שכבות נעוצות, או שתי שכבות שאינן נעוצות.'), { ms: 6000 }); return; }
  const pairs = anim ? [...new Set([...B.cells.keys(), ...L.cells.keys()])].map(k => [k, B.cells.get(k), L.cells.get(k)]) : [[keyOf(B), B.cell, L.cell]];
  if (!room(pairs.length)) { fullMsg(); return; }
  struct(() => {
    const cells = new Map();
    for (const [k, b, l] of pairs) {
      const n = newCell();
      if (b && b.ver) n.cx.drawImage(b.cv, 0, 0);
      if (l && l.ver && L.vis) { n.cx.globalAlpha = L.op; n.cx.drawImage(l.cv, 0, 0); n.cx.globalAlpha = 1; }
      n.ver = (b && b.ver) || (l && l.ver) ? 1 : 0;
      cells.set(k, n);
    }
    B.cells = cells;
    D.layers.splice(i, 1); D.active = B.id;
  });
}
function clearLayer() {
  const L = layerOf();
  if (!canDraw(L)) return;
  commitPending();
  const before = L.cx.getImageData(0, 0, D.w, D.h);
  L.cx.clearRect(0, 0, D.w, D.h);
  push(pxStep(L, { x: 0, y: 0, w: D.w, h: D.h }, before));
  changed(L);
}
function toggleVis(id) { const L = D.layers.find(x => x.id === id); if (L) struct(() => { L.vis = !L.vis; }); }
function renameLayer(id) {
  const L = D.layers.find(x => x.id === id), row = L && V.list.querySelector(`.dw-row[data-id="${id}"] .dw-nm`);
  if (!row) return;
  const inp = h('input', { type: 'text', value: L.name, maxlength: '60', 'aria-label': T('שם השכבה') });
  row.textContent = ''; row.append(inp); inp.focus(); inp.select();
  let done = false;
  const end = ok => { if (done) return; done = true; const v = inp.value.trim().slice(0, 60); if (ok && v && v !== L.name) struct(() => { L.name = v; }); else layersUI(); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); end(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); } });
  inp.addEventListener('blur', () => end(true));
}
function layerMenu(anchor) {
  const L = layerOf(), items = [['edit', T('שינוי שם'), () => renameLayer(L.id)], ['ink_eraser', T('ניקוי השכבה'), clearLayer], ['vertical_align_bottom', T('מיזוג עם השכבה שמתחת'), mergeDown]];
  openPop(anchor, h('div', { class: 'menu' }, items.map(([ic, label, fn]) => h('button', { class: 'mi', type: 'button', onclick: () => { closePopover(); fn(); } }, icon(ic), label))));
}

/* =========================================================
   the keyboard
   ========================================================= */
function onKey(e) {
  if (!D || !LOADED || MODALS.length) return false;
  const tg = e.target;
  if (FXS && !e.altKey) {   // the filter's window, even from its sliders: Enter keeps the filter, Ctrl+Z puts the layer back
    if (e.code === 'Enter' && !(tg && tg.closest && tg.closest('button,select'))) { e.preventDefault(); fxApply(); return true; }
    if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); fxCancel(); return true; }
  }
  if (tg && tg.closest && tg.closest('input,textarea,select,[contenteditable="true"]')) return false;   // typing in a box, the text tool's too
  const mod = e.ctrlKey || e.metaKey, c = e.code;
  if (mod && !e.altKey) {
    if (c === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return true; }
    if (c === 'KeyY') { e.preventDefault(); redo(); return true; }
    if (c === 'KeyA') { e.preventDefault(); selectAll(); return true; }
    if (c === 'KeyD') { e.preventDefault(); deselect(); return true; }
    if ((c === 'KeyC' || c === 'KeyX') && (SEL || FL)) { e.preventDefault(); copySel(c === 'KeyX'); return true; }
    if (c === 'Digit0' || c === 'Numpad0') { e.preventDefault(); fit(); return true; }
    if (c === 'Digit1' || c === 'Numpad1') { e.preventDefault(); zoomTo(1); return true; }
    if (c === 'Equal' || c === 'NumpadAdd') { e.preventDefault(); zoomBy(1.25); return true; }
    if (c === 'Minus' || c === 'NumpadSubtract') { e.preventDefault(); zoomBy(0.8); return true; }
    return false;   // Ctrl+V goes on to the paste event, Ctrl+S to the app
  }
  if (e.altKey) return false;
  if (c === 'Space') { e.preventDefault(); if (!SPACE) { SPACE = true; cursorUI(); } return true; }
  if ((c === 'Delete' || c === 'Backspace') && (SEL || FL)) { e.preventDefault(); delSel(); return true; }
  if (c === 'Enter' && FL) { e.preventDefault(); drop(); return true; }
  if (FL && /^Arrow/.test(e.key)) {   // the arrows move what floats a pixel at a time (ten with Shift)
    e.preventDefault();
    const s = e.shiftKey ? 10 : 1;
    FL.x += e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0; FL.y += e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0;
    placeFloat(); return true;
  }
  // the arrows go from frame to frame: toward the reading direction is forward
  if ((c === 'ArrowLeft' || c === 'ArrowRight') && D.frames.length > 1 && !e.shiftKey) { e.preventDefault(); goFrame(D.f + ((c === 'ArrowLeft') === (UI_DIR === 'rtl') ? 1 : -1)); return true; }
  if (c === 'BracketLeft' || c === 'BracketRight') { e.preventDefault(); sizeBy(c === 'BracketRight' ? 1 : -1); return true; }
  if (e.shiftKey) return false;
  const t = Object.keys(TOOLS).find(k => TOOLS[k].key === c);
  if (t) { e.preventDefault(); setTool(t); return true; }
  return false;
}
/* Esc: the text is put down, then what floats, then the selection goes */
function onEsc() {
  if (!D) return false;
  if (PLAY) { stopPlay(); return true; }
  if (FXS) { fxCancel(); return true; }
  if (TX) { commitText(); return true; }
  if (FL) { drop(); return true; }
  if (SEL) { SEL = null; drawOverlay(); optsUI(); return true; }
  return false;
}

/* =========================================================
   a new drawing, and the size of this one
   ========================================================= */
/* the sizes to choose from, each drawn to its shape; and a size of one's own */
function sizePicker(cur, onPick) {
  const p = prefs(), list = PRESETS();
  let pick = cur.k, cw = cur.w, ch = cur.h;
  const grid = h('div', { class: 'dw-sizes', role: 'radiogroup' }), wIn = h('input', { class: 'field', type: 'number', min: String(MIN_SIDE), max: String(MAX_SIDE), value: String(cw), 'aria-label': T('רוחב') }),
    hIn = h('input', { class: 'field', type: 'number', min: String(MIN_SIDE), max: String(MAX_SIDE), value: String(ch), 'aria-label': T('גובה') });
  const shape = (w, hh) => { const k = 54 / Math.max(w, hh); return h('i', { style: { width: Math.round(w * k) + 'px', height: Math.round(hh * k) + 'px' } }); };
  const draw = () => {
    grid.textContent = '';
    for (const s of list) grid.append(h('button', { class: 'dw-size', type: 'button', role: 'radio', 'aria-pressed': String(pick === s.k), 'aria-checked': String(pick === s.k), onclick: () => { pick = s.k; draw(); onPick(get()); } }, shape(s.w, s.h), h('b', { text: s.n }), h('span', { text: `${s.w} × ${s.h}` })));
    grid.append(h('button', { class: 'dw-size', type: 'button', role: 'radio', 'aria-pressed': String(pick === 'custom'), 'aria-checked': String(pick === 'custom'), onclick: () => { pick = 'custom'; draw(); onPick(get()); wIn.focus(); } }, shape(cw, ch), h('b', { text: T('גודל חופשי') }), h('span', { text: `${cw} × ${ch}` })));
  };
  const norm1 = v => clamp(Math.round(+v) || 0, MIN_SIDE, MAX_SIDE);
  const typed = () => { cw = norm1(wIn.value); ch = norm1(hIn.value); pick = 'custom'; draw(); onPick(get()); };
  wIn.addEventListener('change', () => { typed(); wIn.value = String(cw); });
  hIn.addEventListener('change', () => { typed(); hIn.value = String(ch); });
  const get = () => { const s = list.find(x => x.k === pick); return s ? { k: s.k, w: s.w, h: s.h } : { k: 'custom', w: norm1(wIn.value), h: norm1(hIn.value) }; };
  draw();
  return { el: h('div', {}, grid, h('div', { class: 'dw-custom' }, h('span', { text: T('גודל חופשי:') }), wIn, h('span', { text: '×' }), hIn, h('span', { class: 'muted', text: T('פיקסלים, עד {0} בכל צד', MAX_SIDE) }))), get };
}
/* inside the "New" window: the size and the background, then the drawing opens */
function chooser(box, close) {
  mount();
  box.textContent = '';
  const p = prefs(), list = PRESETS(), k0 = list.some(s => s.k === p.size) || p.size === 'custom' ? p.size : 'a4p', s0 = list.find(s => s.k === k0);
  const sz = sizePicker({ k: k0, w: s0 ? s0.w : clamp(+p.cw || 1600, MIN_SIDE, MAX_SIDE), h: s0 ? s0.h : clamp(+p.ch || 1200, MIN_SIDE, MAX_SIDE) }, () => {});
  let bg = p.bgc === '' ? '' : hex6(p.bgc) || '#ffffff';
  const row = h('div', { class: 'dw-bgrow', role: 'radiogroup' }), native = h('input', { type: 'color', value: bg || '#ffffff', title: T('צבע אחר'), 'aria-label': T('צבע אחר') });
  const BGS = ['#ffffff', '#fdf6e3', '#eef2f7', '#1b1f2a', '#000000'];
  const drawBg = () => {
    row.textContent = '';
    for (const c of BGS) row.append(h('button', { class: 'sw' + (bg === c ? ' on' : ''), type: 'button', style: { background: c }, title: c, 'aria-label': c, onclick: () => { bg = c; drawBg(); } }));
    row.append(native, h('button', { class: 'btn small dw-clear' + (bg === '' ? ' primary' : ''), type: 'button', onclick: () => { bg = ''; drawBg(); } }, h('span', { class: 'sw none', style: { width: '18px', height: '18px' } }), T('רקע שקוף')));
  };
  native.addEventListener('input', () => { bg = native.value; drawBg(); });
  drawBg();
  const go = h('button', { class: 'btn primary', type: 'button' }, icon('palette'), T('יצירת ציור'));
  go.addEventListener('click', async () => {
    const s = sz.get();
    Object.assign(p, { size: s.k, bgc: bg }); if (s.k === 'custom') Object.assign(p, { cw: s.w, ch: s.h });
    savePrefs(); close();
    await createDoc({ html: blankBody(s.w, s.h, bg), kind: 'draw' });
  });
  box.append(h('div', { class: 'dw-h4', text: T('גודל הקנבס') }), sz.el, h('div', { class: 'dw-h4', text: T('רקע') }), row, h('div', { class: 'dw-go' }, go));
}
function sizeDialog() {
  if (!D) return;
  commitPending();
  const list = PRESETS(), now0 = list.find(s => s.w === D.w && s.h === D.h);
  const sz = sizePicker({ k: now0 ? now0.k : 'custom', w: D.w, h: D.h }, () => {});
  const stretch = h('input', { type: 'checkbox' });
  modal({ title: T('גודל הקנבס'), wide: true, body: h('div', {}, sz.el, h('label', { class: 'dw-check' }, stretch, T('למתוח את הציור לגודל החדש')),
    h('p', { class: 'muted small', text: T('בלי מתיחה, הציור נשאר באמצע בגודל שלו: קנבס קטן יותר חותך את השוליים, וגדול יותר מוסיף מקום מסביב.') })),
  actions: [{ label: T('שינוי הגודל'), kind: 'primary', run: () => { const s = sz.get(); return resizeCanvas(s.w, s.h, stretch.checked); } }, { label: T('ביטול'), value: false }] });
}
function resizeCanvas(w, hh, stretch) {
  if (!D || (w === D.w && hh === D.h)) return;
  const cells = D.layers.reduce((n, L) => n + [...L.cells.values()].filter(c => c.ver).length + 1, 0);
  if (cells * w * hh > PX_BUDGET) { toast(T('בגודל הזה כל השכבות לא ייכנסו לזיכרון של המכשיר. אפשר למזג או למחוק שכבות, או לבחור גודל קטן יותר.'), { ms: 7000 }); return false; }
  struct(() => {
    const ox = Math.round((w - D.w) / 2), oy = Math.round((hh - D.h) / 2);
    D.w = w; D.h = hh;
    for (const k of Object.keys(HX)) { freeCanvas(HX[k]); HX[k] = null; }
    // every cell of every frame, on a canvas of the new size
    D.layers = D.layers.map(L => {
      const N = makeLayer(L.name, { id: L.id, op: L.op, vis: L.vis, fx: L.fx });
      for (const [k, c] of L.cells) {
        if (!c.ver) continue;
        const n = newCell();
        n.cx.imageSmoothingQuality = 'high';
        if (stretch) n.cx.drawImage(c.cv, 0, 0, w, hh); else n.cx.drawImage(c.cv, ox, oy);
        n.ver = 1; N.cells.set(k, n);
      }
      return N;
    });
  });
  fit();
}

/* =========================================================
   files, printing, and the drawing in a document or a presentation
   ========================================================= */
const png = () => flatten(null, { type: 'image/png' });
const jpg = () => flatten(null, { type: 'image/jpeg', q: 0.92 });
/* a page for each frame, the drawing's size (150 pixels to the inch): an animation printed is a flip book */
async function pdf() {
  await loadScript(LIB.jspdf);
  const J = window.jspdf && window.jspdf.jsPDF;
  if (!J || !D) throw new Error('lib');
  const src = await framesOf(null), W = src.w * 72 / DPI, H = src.h * 72 / DPI, o = W > H ? 'landscape' : 'portrait', c = newCanvas(src.w, src.h), x = c.getContext('2d');
  const doc = new J({ orientation: o, unit: 'pt', format: [W, H] });
  try {
    for (let i = 0; i < src.frames.length; i++) {
      x.fillStyle = src.bg || '#ffffff'; x.fillRect(0, 0, c.width, c.height);
      await src.draw(x, i, c.width, c.height);
      if (i) doc.addPage([W, H], o);
      doc.addImage(c.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, W, H);
    }
  } finally { freeCanvas(c); }
  return doc.output('blob');
}
async function print() {
  if (!D) return null;
  const src = await framesOf(null), [w, hh] = fitSize(src.w, src.h, 2000), c = newCanvas(w, hh), x = c.getContext('2d'), rule = $('#pageRule'), before = rule.textContent;
  V.print.textContent = '';
  for (let i = 0; i < src.frames.length; i++) {
    x.clearRect(0, 0, w, hh);
    if (src.bg) { x.fillStyle = src.bg; x.fillRect(0, 0, w, hh); }
    await src.draw(x, i, w, hh);
    V.print.append(h('img', { src: c.toDataURL('image/png'), alt: '' }));
  }
  freeCanvas(c);
  rule.textContent = `@page{size:${(D.w / DPI).toFixed(3)}in ${(D.h / DPI).toFixed(3)}in;margin:0}`;
  await Promise.race([Promise.all([...V.print.querySelectorAll('img')].map(im => im.decode().catch(() => {}))), sleep(2500)]);   // decode can wait forever in a hidden window
  document.documentElement.classList.add('draw-print');
  return () => { document.documentElement.classList.remove('draw-print'); V.print.textContent = ''; rule.textContent = before; };
}
/* the picture that goes into a document or a slide: an animation as a GIF that moves there too; a drawing as a JPEG when
   it has a background (smaller), else a PNG that keeps see-through */
async function insertBlob(body, max) {
  const j = body == null ? D : parseBody(body);
  if (j.frames.length > 1) return makeGif(body, { max: Math.min(max, 960) });
  return flatten(body, { type: j.bg ? 'image/jpeg' : 'image/png', max, q: 0.9 });
}
const fileOf = (blob, title) => new File([blob], safeName(title) + ({ 'image/png': '.png', 'image/gif': '.gif' }[blob.type] || '.jpg'), { type: blob.type });
/* from the drawing: choose a document or a presentation (or a new one); the drawing goes in at the end of the
   document, or on a new slide at the end of the presentation */
function sendTo() {
  if (!D) return;
  commitPending();
  const list = aliveDocs().filter(d => !d.kind || d.kind === 'deck');
  const m = modal({ title: T('הכנסת הציור למסמך או למצגת'), body: h('div', {},
    h('div', { class: 'dw-new' }, h('button', { class: 'btn', type: 'button', onclick: () => go('doc') }, icon('note_add'), T('מסמך חדש')), h('button', { class: 'btn', type: 'button', onclick: () => go('deck') }, icon('slideshow'), T('מצגת חדשה'))),
    list.length ? h('div', { class: 'dw-dl', role: 'list' }, list.map(d => h('button', { class: 'mi', type: 'button', onclick: () => go(d.id) }, icon(isDeck(d) ? 'slideshow' : 'description'), h('span', { text: displayTitle(d) }), h('small', { text: relTime(d.updatedAt || Date.now()) }))))
      : h('p', { class: 'muted', text: T('אין עדיין מסמכים או מצגות. אפשר ליצור חדשים כאן למעלה.') }),
    h('p', { class: 'muted small', text: T('במסמך הציור נכנס בסוף, ובמצגת בשקופית חדשה. הציור עצמו נשאר ברשימה כמו שהוא.') })) });
  async function go(id) {
    m.close();
    const title = displayTitle(S.cur.meta), deck = id === 'deck' || (id !== 'doc' && isDeck(findMeta(id)));
    const busy = toast(T('מכין את הציור…'), { icon: 'hourglass_top', ms: 60000 });
    let blob;
    try { blob = await insertBlob(null, deck ? 1920 : 2000); }
    catch (e) { console.error(e); busy.remove(); toast(T('לא הצלחתי להכין את הציור')); return; }
    try {
      await flushSave();
      if (id === 'doc') await createDoc({});
      else if (id === 'deck') await createDoc({ kind: 'deck' });
      else await openDoc(id);
    } finally { busy.remove(); }
    if (deck) { if (!deckOpen()) return; addSlide('blank', DK.deck.slides.length); await deckImageFile(fileOf(blob, title)); }
    else { if (!S.cur || S.cur.meta.kind) return; placeCaretAtEnd(); await insertImageBlob(blob); }
    toast(T('הציור "{0}" נוסף', title), { icon: 'check_circle' });
  }
}
/* from a document or a presentation: one of the drawings in the list, as a picture where the cursor is, or on the slide */
function pickInto() {
  const deck = deckOpen();
  if (!S.cur || (!deck && S.cur.meta.kind)) return;
  mount();
  const saved = !deck && lastRange ? lastRange.cloneRange() : null, list = aliveDocs().filter(d => d.kind === 'draw');
  const okThumb = t => typeof t === 'string' && /^data:image\/(jpeg|png);base64,/.test(t);
  const m = modal({ title: T('ציור מהרשימה'), wide: true, body: list.length
    ? h('div', { class: 'dw-picks' }, list.map(d => h('button', { class: 'dw-pk', type: 'button', onclick: () => go(d) },
      h('div', { class: 'im' }, okThumb(d.thumb) ? h('img', { src: d.thumb, alt: '' }) : icon('palette')), h('b', { text: displayTitle(d) }), h('small', { text: relTime(d.updatedAt || Date.now()) }))))
    : h('div', {}, h('p', { class: 'muted', text: T('אין עדיין ציורים ברשימה.') }),
      h('button', { class: 'btn primary', type: 'button', onclick: () => { m.close(); PREFS.newKind = 'draw'; savePrefs(); openNewDialog(); } }, icon('palette'), T('ציור חדש'))) });
  async function go(d) {
    m.close();
    const cur = S.cur, busy = toast(T('מכין את הציור…'), { icon: 'hourglass_top', ms: 60000 });
    let blob;
    try { blob = await insertBlob(await S.store.readBody(d.id, d.chunks || 1), deck ? 1920 : 2000); }
    catch (e) { console.error(e); toast(T('לא הצלחתי להכין את הציור')); return; }
    finally { busy.remove(); }
    if (S.cur !== cur) return;
    if (deck) { if (deckOpen()) await deckImageFile(fileOf(blob, displayTitle(d))); }
    else { if (saved) lastRange = saved; await insertImageBlob(blob); }
  }
}

/* =========================================================
   opening and closing a drawing
   ========================================================= */
function reset() {
  fxClose();
  if (PLAY) { cancelAnimationFrame(PLAY.raf); PLAY = null; }
  if (V.play) { V.play.remove(); V.play.width = V.play.height = 1; }
  if (V.paper) V.paper.classList.remove('playing');
  for (const c of FTH.values()) freeCanvas(c);
  FTH.clear();
  if (V.frs) V.frs.textContent = '';
  if (V.time) V.time.hidden = true;
  if (V.onion) { V.onion.width = V.onion.height = 1; }
  if (ACT && ACT.timer) clearInterval(ACT.timer);
  ACT = null; PTR.clear(); SPACE = false;
  if (TX) { TX.el.remove(); TX.grip.remove(); TX = null; }
  if (FL) { FL.cv.remove(); freeCanvas(FL.cv); FL = null; }
  SEL = null;
  if (D) for (const c of cellsOf(D)) freeCanvas(c.cv);
  HIST.steps = []; HIST.at = 0; HIST.bytes = 0;
  for (const k of Object.keys(HX)) { freeCanvas(HX[k]); HX[k] = null; }
  encodeSoon.cancel();
  D = null; LOADED = null; BODY = null; REV = DONE_REV = 0;
  if (V.paper) V.paper.replaceChildren();
  if (V.ov) V.ov.textContent = '';
  if (V.list) V.list.textContent = '';
  if (V.cur) V.cur.style.display = 'none';
}
/* a body's layers with a canvas for each picture it has (a frame without one gets an empty canvas when it comes on screen) */
async function layersFrom(j, gen) {
  const out = [];
  for (const l of j.layers) {
    const L = makeLayer(l.name, l);
    out.push(L);
    for (const [k, src] of Object.entries(l.cells)) {
      if (!src) continue;
      const c = newCell(j.w, j.h);
      try { c.cx.drawImage(await loadImg(src), 0, 0); } catch (e) { console.warn(e); }
      c.ver = 1; c.enc = { ver: 1, src };
      L.cells.set(k, c);
      if (gen != null && gen !== GEN) return out;
    }
  }
  return out;
}
async function load(html, cur) {
  mount();
  const gen = ++GEN;
  reset();
  LOADED = cur;
  V.wait.hidden = false;
  const j = parseBody(html), layers = await layersFrom(j, gen);
  if (gen !== GEN || S.cur !== cur) { if (gen === GEN) LOADED = null; layers.forEach(L => { for (const c of L.cells.values()) freeCanvas(c.cv); }); return; }
  D = { w: j.w, h: j.h, bg: j.bg, layers, active: j.active, frames: j.frames, f: j.f, fps: j.fps, loop: j.loop };
  BODY = bodyOf(D);
  V.wait.hidden = true;
  TOOL = TOOLS[prefs().tool] ? prefs().tool : 'pen';
  COLOR = hex6(prefs().color) || '#000000';
  paintPaper(); fit(); layersUI(); toolUI(); colorUI(); undoUI(); cursorUI(); stat(); framesUI(); onionNow();
  for (const b of document.querySelectorAll('.dw-ltog')) b.classList.toggle('on', !V.side.hidden);
  // a drawing from a backup or a copy has no small picture yet: it gets one now
  if (!cur.isSample && !(typeof cur.meta.thumb === 'string' && cur.meta.thumb.startsWith('data:image/'))) { metaOf(D, cur); markDirty(); }
}
/* another body in place of this one (a version brought back, a draft found), as one step that can be undone */
async function replace(html) {
  if (!D) return;
  commitPending();
  const d = D, j = parseBody(html), layers = await layersFrom(j);
  if (D !== d) return;
  struct(() => {
    D.layers = layers; D.active = j.active; D.bg = j.bg; D.frames = j.frames; D.f = j.f; D.fps = j.fps; D.loop = j.loop;
    if (D.w !== j.w || D.h !== j.h) { D.w = j.w; D.h = j.h; for (const k of Object.keys(HX)) { freeCanvas(HX[k]); HX[k] = null; } }
  });
  fit();
}
/* what Claude is told about a drawing it opens: its size and layers, the top one first. It can't draw yet */
const infoOf = d => ({ width: d.w, height: d.h, background: d.bg || 'transparent', ...(d.frames.length > 1 ? { frames: d.frames.length, frames_per_second: d.fps } : {}), layers: d.layers.slice().reverse().map(l => ({ name: l.name, visible: l.vis, opacity: Math.round(l.op * 100) / 100 })) });
const info = html => D && LOADED === S.cur ? infoOf(D) : infoOf(parseBody(html));   // the one on screen as it is now, not as it was last saved

/* =========================================================
   animation: frames shown one after another. Each layer has its own picture in each frame, unless it is pinned to
   all of them (a background). The strip under the drawing shows the frames, and the frames before and after the one
   on screen show faintly under it (onion skin), so the next step is easy to draw
   ========================================================= */
const GIFENC = 'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js';
const MP4MUX = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.mjs';
const FPS_LIST = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30];
const onionOpt = () => {
  const p = prefs();
  if (!p.onion || typeof p.onion !== 'object') p.onion = { on: true, b: 1, a: 1 };
  return p.onion;
};
function goFrame(i, quiet) {
  if (!D) return;
  i = clamp(i, 0, D.frames.length - 1);
  if (quiet) stopPlay(); else commitPending();
  if (i === D.f) return;
  freeUnused();
  D.f = i; SEL = null;
  bindAll(); paintPaper(); layersUI(); framesUI(); stat(); onionSoon(); optsUI();
}
/* a new frame after the one on screen: empty (the one before shows through the onion skin), or a copy of it */
function addFrame(copy) {
  if (!D) return;
  const anim = D.layers.filter(L => !L.fx), need = copy ? anim.filter(L => L.cell && L.cell.ver).length : anim.length;
  if (!room(need)) { fullMsg(); return; }
  const first = D.frames.length === 1;
  struct(() => {
    const f = { id: fid(), d: copy ? D.frames[D.f].d : 1 };
    if (copy) for (const L of anim) {
      const c = L.cell;
      if (!c || !c.ver) continue;
      const n = newCell(); n.cx.drawImage(c.cv, 0, 0); n.ver = 1;
      L.cells.set(f.id, n);
    }
    freeUnused();
    D.frames.splice(D.f + 1, 0, f);
    D.f++;
  });
  stat();
  if (first && D.layers.length > 1) toast(T('שכבה שצריכה להופיע בכל הפריימים, כמו רקע, נועצים בחלונית השכבות.'), { icon: 'push_pin', ms: 8000 });
}
function delFrame(i = D.f) {
  if (!D) return;
  if (D.frames.length <= 1) { toast(T('באנימציה צריך להיות לפחות פריים אחד')); return; }
  struct(() => {
    const f = D.frames[i];
    for (const L of D.layers) if (!L.fx) L.cells.delete(f.id);
    D.frames.splice(i, 1);
    if (D.f > i || D.f >= D.frames.length) D.f = Math.max(0, D.f - 1);
  });
  stat();
}
function moveFrame(from, to) {
  if (!D || from === to || to < 0 || to >= D.frames.length) return;
  struct(() => { const cur = D.frames[D.f].id, [f] = D.frames.splice(from, 1); D.frames.splice(to, 0, f); D.f = D.frames.findIndex(x => x.id === cur); });
}
function setDur(i, d) { if (D && D.frames[i] && D.frames[i].d !== d) struct(() => { D.frames[i].d = d; }); }
function setFps(v) { v = clamp(Math.round(+v) || 12, 1, 30); if (D && v !== D.fps) struct(() => { D.fps = v; }); }
function setLoop(m) { if (D && LOOPS.includes(m) && m !== D.loop) struct(() => { D.loop = m; }); }
/* pinned: one picture for every frame, the one this frame has. Unpinned: that picture goes to this frame only */
function toggleFix(id) {
  const L = D.layers.find(x => x.id === id);
  if (!L) return;
  struct(() => {
    if (L.fx) { const c = L.cells.get('*'); L.fx = false; L.cells = new Map(c ? [[D.frames[D.f].id, c]] : []); }
    else { const c = L.cell; L.fx = true; L.cells = new Map(c ? [['*', c]] : []); }
  });
  if (D.frames.length > 1) toast(L.fx ? T('השכבה מופיעה עכשיו בכל הפריימים') : T('השכבה מופיעה עכשיו רק בפריים הזה'), { icon: 'push_pin' });
}

/* --- the onion skin: the frames before in red, the frames after in green, fainter the further they are.
   Drawn at a lower resolution, under the first layer that changes from frame to frame --- */
const onionSoon = debounce(() => onionNow(), 40);
let ONT = null;
function onionNow() {
  const c = V.onion;
  if (!c || !D) return;
  const o = onionOpt(), on = o.on && D.frames.length > 1 && !PLAY && D.layers.some(L => !L.fx);
  c.style.display = on ? '' : 'none';
  for (const b of document.querySelectorAll('#ribbon [data-cmd="dwOnion"]')) b.classList.toggle('on', !!o.on);
  if (!on) { if (c.width > 1) { c.width = 1; c.height = 1; } return; }
  const [w, hh] = fitSize(D.w, D.h, 1200);
  if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
  if (!ONT || ONT.width !== w || ONT.height !== hh) { freeCanvas(ONT); ONT = newCanvas(w, hh); }
  const x = c.getContext('2d'), tx = ONT.getContext('2d');
  x.clearRect(0, 0, w, hh);
  const one = (i, tint, a) => {
    if (i < 0 || i >= D.frames.length) return;
    tx.globalCompositeOperation = 'source-over'; tx.globalAlpha = 1; tx.clearRect(0, 0, w, hh);
    let any = false;
    for (const L of D.layers) {
      const cl = !L.fx && L.vis && L.op > 0 && L.cells.get(D.frames[i].id);
      if (!cl || !cl.ver) continue;
      tx.globalAlpha = L.op; tx.drawImage(cl.cv, 0, 0, w, hh); any = true;
    }
    if (!any) return;
    tx.globalAlpha = 0.75; tx.globalCompositeOperation = 'source-atop'; tx.fillStyle = tint; tx.fillRect(0, 0, w, hh);
    x.globalAlpha = a; x.drawImage(ONT, 0, 0); x.globalAlpha = 1;
  };
  for (let k = o.b; k >= 1; k--) one(D.f - k, '#e5484d', 0.5 * Math.pow(0.55, k - 1));
  for (let k = o.a; k >= 1; k--) one(D.f + k, '#1f9d73', 0.42 * Math.pow(0.55, k - 1));
}

/* --- playing: each frame for its ticks at the drawing's speed, on a canvas of its own over the paper --- */
function playUI() {
  for (const b of document.querySelectorAll('[data-cmd="dwPlay"]')) {
    const ic = b.querySelector('.ms'), t = b.querySelector('span:not(.ms)'), label = PLAY ? T('עצירה') : T('ניגון');
    if (ic) ic.textContent = PLAY ? 'stop' : 'play_arrow';
    if (t) t.textContent = label;
    b.title = label; b.setAttribute('aria-label', label); b.classList.toggle('on', !!PLAY);
  }
}
function paintFrame(c, i) {
  const x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  for (const L of D.layers) {
    const cl = L.vis && L.op > 0 && cellAt(L, i);
    if (!cl || (!cl.ver && cl !== L.cell)) continue;
    x.globalAlpha = L.op; x.drawImage(cl.cv, 0, 0, c.width, c.height);
  }
  x.globalAlpha = 1;
}
function markPlay(i) { if (V.frs) for (const el of V.frs.children) el.classList.toggle('pl', +el.dataset.i === i); }
function play() {
  if (!D) return;
  if (PLAY) { stopPlay(); return; }
  if (D.frames.length < 2) { toast(T('כדי לנגן צריך לפחות שני פריימים. "פריים חדש" מוסיף אחד.')); return; }
  commitPending();
  const [w, hh] = fitSize(D.w, D.h, 1600), c = V.play || (V.play = newCanvas(1, 1));
  c.className = 'dw-pl'; c.width = w; c.height = hh;
  V.paper.append(c); V.paper.classList.add('playing');
  PLAY = { seq: seqOf(D.frames.length, D.loop), n: 0, next: performance.now(), raf: 0 };
  onionNow(); playUI();
  const step = () => {
    const p = PLAY;
    if (!p) return;
    const t = performance.now();
    if (t >= p.next) {
      if (p.n >= p.seq.length) { if (D.loop === 'once') { stopPlay(); return; } p.n = 0; }
      const i = p.seq[p.n++], dur = D.frames[i].d * 1000 / D.fps;
      paintFrame(c, i); markPlay(i);
      p.next += dur;
      if (p.next < t) p.next = t + dur;   // after the window was hidden: no rushing to catch up
    }
    p.raf = requestAnimationFrame(step);
  };
  step();
}
function stopPlay() {
  if (!PLAY) return;
  cancelAnimationFrame(PLAY.raf); PLAY = null;
  if (V.play) { V.play.remove(); V.play.width = V.play.height = 1; }
  if (V.paper) V.paper.classList.remove('playing');
  markPlay(-1); onionNow(); playUI();
}

/* --- the strip of frames under the drawing: shown in an animation, or while the animation tab is open --- */
const FTH = new Map();   // the strip's pictures, by frame id
const framesSoon = debounce(() => frameThumbs(), 300);
const stripOn = () => !!D && (D.frames.length > 1 || (!!V.animP && !V.animP.hidden));
function framesUI() {
  if (!V.time || !D) return;
  animUI();
  const on = stripOn();
  V.time.hidden = !on;
  if (!on) return;
  V.frs.textContent = '';
  for (const k of [...FTH.keys()]) if (!D.frames.some(f => f.id === k)) { freeCanvas(FTH.get(k)); FTH.delete(k); }
  D.frames.forEach((f, i) => {
    let th = FTH.get(f.id);
    if (!th) FTH.set(f.id, th = newCanvas(1, 1));
    const cur = i === D.f;
    V.frs.append(h('div', { class: 'dw-fr' + (cur ? ' on' : ''), role: 'option', 'aria-selected': String(cur), 'data-i': i, title: T('פריים {0}', i + 1) },
      h('div', { class: 'dw-fth' }, th), h('span', { class: 'dw-fn', text: String(i + 1) }), f.d > 1 ? h('span', { class: 'dw-fd', text: '×' + f.d }) : null,
      cur ? h('button', { class: 'dw-fm', type: 'button', title: T('פעולות על הפריים'), 'aria-label': T('פעולות על הפריים') }, icon('more_horiz')) : null));
  });
  frameThumbs(); playUI();
  const el = V.frs.children[D.f];
  if (el) { const r = el.getBoundingClientRect(), s = V.frs.getBoundingClientRect(); if (r.left < s.left || r.right > s.right) V.frs.scrollLeft += (r.left + r.right) / 2 - (s.left + s.right) / 2; }
}
function frameThumbs() {
  if (!D || !V.time || V.time.hidden) return;
  const [tw, th] = fitSize(D.w, D.h, 72);
  D.frames.forEach((f, i) => {
    const c = FTH.get(f.id);
    if (!c) return;
    if (c.width !== tw || c.height !== th) { c.width = tw; c.height = th; }
    const x = c.getContext('2d');
    x.clearRect(0, 0, tw, th);
    if (D.bg) { x.fillStyle = D.bg; x.fillRect(0, 0, tw, th); }
    for (const L of D.layers) {
      const cl = L.vis && L.op > 0 && cellAt(L, i);
      if (!cl || (!cl.ver && cl !== L.cell)) continue;
      x.globalAlpha = L.op; x.drawImage(cl.cv, 0, 0, tw, th);
    }
    x.globalAlpha = 1;
  });
}
/* the animation tab's controls, as the drawing has them */
function animUI() {
  if (!V.fps || !D) return;
  if (!FPS_LIST.includes(D.fps) && ![...V.fps.options].some(o => +o.value === D.fps)) V.fps.append(h('option', { value: D.fps, text: TN('{n} בשנייה', D.fps) }));
  V.fps.value = String(D.fps); V.loop.value = D.loop;
  const o = onionOpt();
  V.onBf.value = String(o.b); V.onAf.value = String(o.a);
  for (const b of document.querySelectorAll('#ribbon [data-cmd="dwOnion"]')) b.classList.toggle('on', !!o.on);
}
function frameMenu(anchor, i) {
  const f = D.frames[i], rtl = UI_DIR === 'rtl';
  const mi = (ic, label, fn, off) => h('button', { class: 'mi', type: 'button', disabled: off ? true : null, onclick: () => { closePopover(); fn(); } }, icon(ic), label);
  openPop(anchor, h('div', { class: 'menu' },
    mi('content_copy', T('שכפול הפריים'), () => addFrame(true)),
    mi('add_box', T('פריים ריק אחריו'), () => addFrame(false)),
    mi(rtl ? 'arrow_forward' : 'arrow_back', T('הזזה אחורה'), () => moveFrame(i, i - 1), i === 0),
    mi(rtl ? 'arrow_back' : 'arrow_forward', T('הזזה קדימה'), () => moveFrame(i, i + 1), i >= D.frames.length - 1),
    mi('delete', T('מחיקת הפריים'), () => delFrame(i), D.frames.length <= 1),
    h('div', { class: 'pop-t', text: T('כמה זמן הפריים מוצג') }),
    h('div', { class: 'dw-durs' }, [1, 2, 3, 4, 6, 8].map(d => h('button', { class: 'opt' + (f.d === d ? ' on' : ''), type: 'button', onclick: () => { closePopover(); setDur(i, d); } }, '×' + d)))));
}

/* --- files: GIF (moves by itself, everywhere), video (MP4, for YouTube and phones), and the frames as PDF pages --- */
const loadMod = url => import(url).catch(() => { throw new Error('lib'); });
async function makeGif(body, { k = 1, max = 0, prog } = {}) {
  const { GIFEncoder, quantize, applyPalette } = await loadMod(GIFENC);
  const src = await framesOf(body), [w, hh] = fitSize(Math.round(src.w * k), Math.round(src.h * k), max), seq = seqOf(src.frames.length, src.loop);
  const c = newCanvas(w, hh), x = c.getContext('2d', { willReadFrequently: true }), gif = GIFEncoder(), see = !src.bg, repeat = src.loop === 'once' ? -1 : 0;
  x.imageSmoothingQuality = 'high';
  try {
    for (let n = 0; n < seq.length; n++) {
      const i = seq[n], delay = src.frames[i].d * 1000 / src.fps;
      x.clearRect(0, 0, w, hh);
      if (src.bg) { x.fillStyle = src.bg; x.fillRect(0, 0, w, hh); }
      await src.draw(x, i, w, hh);
      const data = x.getImageData(0, 0, w, hh).data;
      if (see) {   // a see-through background stays see-through: one color of the palette is "nothing"
        const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true }), index = applyPalette(data, palette, 'rgba4444'), ti = palette.findIndex(p => p[3] === 0);
        gif.writeFrame(index, w, hh, { palette, delay, repeat, transparent: ti >= 0, transparentIndex: Math.max(0, ti) });
      } else {
        const palette = quantize(data, 256), index = applyPalette(data, palette);
        gif.writeFrame(index, w, hh, { palette, delay, repeat });
      }
      if (prog) prog((n + 1) / seq.length);
      await sleep(0);   // the window stays responsive meanwhile
    }
    gif.finish();
    return new Blob([gif.bytes()], { type: 'image/gif' });
  } finally { freeCanvas(c); src.done(); }
}
/* MP4 made frame by frame with the browser's own video encoder (no waiting for it to play); where there is none,
   the frames are played into a recording, in real time */
async function makeVideo({ k = 1, times = 1, prog } = {}) {
  const src = await framesOf(null), seq = seqOf(src.frames.length, src.loop), fps = src.fps;
  let [w, hh] = fitSize(Math.round(src.w * k), Math.round(src.h * k), 1920);
  w = Math.max(2, w - w % 2); hh = Math.max(2, hh - hh % 2);   // H.264 wants even sizes
  const c = newCanvas(w, hh), x = c.getContext('2d'), list = [];
  for (let r = 0; r < times; r++) list.push(...seq);
  const ticks = list.reduce((s, i) => s + src.frames[i].d, 0), br = clamp(Math.round(w * hh * fps * 0.15), 600e3, 12e6);
  const paint = async i => { x.fillStyle = src.bg || '#ffffff'; x.fillRect(0, 0, w, hh); await src.draw(x, i, w, hh); };
  let codec = null;
  if (window.VideoEncoder && window.VideoFrame) for (const cd of ['avc1.640028', 'avc1.4d0028', 'avc1.42e01f']) {
    try { if ((await VideoEncoder.isConfigSupported({ codec: cd, width: w, height: hh, bitrate: br, framerate: fps })).supported) { codec = cd; break; } } catch {}
  }
  try {
    if (codec) {
      const { Muxer, ArrayBufferTarget } = await loadMod(MP4MUX);
      const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: w, height: hh, frameRate: fps }, fastStart: 'in-memory' });
      let fail = null, n = 0;
      const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { fail = e; } });
      enc.configure({ codec, width: w, height: hh, bitrate: br, framerate: fps });
      const us = 1e6 / fps;
      for (let m = 0; m < list.length; m++) {
        const i = list[m];
        await paint(i);
        for (let r = 0; r < src.frames[i].d; r++, n++) {
          const vf = new VideoFrame(c, { timestamp: Math.round(n * us), duration: Math.round(us) });
          enc.encode(vf, { keyFrame: n % (fps * 2) === 0 });
          vf.close();
          while (enc.encodeQueueSize > 6 && !fail) await sleep(4);
          if (fail) throw fail;
        }
        if (prog) prog((m + 1) / list.length);
      }
      await enc.flush(); enc.close();
      if (fail) throw fail;
      muxer.finalize();
      return new Blob([muxer.target.buffer], { type: 'video/mp4' });
    }
    const mime = window.MediaRecorder && ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    if (!mime || !c.captureStream) throw new Error('video');
    const stream = c.captureStream(0), track = stream.getVideoTracks()[0], rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: br }), parts = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    rec.start();
    let done = 0;
    for (const i of list) {
      await paint(i);
      if (track.requestFrame) track.requestFrame();
      await sleep(src.frames[i].d * 1000 / fps);
      done += src.frames[i].d;
      if (prog) prog(done / ticks);
    }
    rec.stop(); await stopped;
    stream.getTracks().forEach(t => t.stop());
    return new Blob(parts, { type: mime.split(';')[0] });
  } finally { freeCanvas(c); src.done(); }
}
/* saving an animation: GIF or video, its size, and for a video how many times it plays */
function animDialog(kind) {
  if (!D) return;
  commitPending();
  if (D.frames.length < 2) { toast(T('כדי לשמור אנימציה צריך לפחות שני פריימים. "פריים חדש" בלשונית אנימציה מוסיף אחד.'), { ms: 6000 }); return; }
  let fmt = kind === 'video' ? 'video' : 'gif';
  const seg = h('div', { class: 'seg', role: 'tablist' }), body = h('div'), size = h('select', { class: 'sel', 'aria-label': T('גודל') });
  const times = h('select', { class: 'sel', 'aria-label': T('כמה פעמים לנגן') }, [1, 2, 3, 5, 10].map(n => h('option', { value: n, text: TN('{n} פעמים', n) })));
  const secs = seqOf(D.frames.length, D.loop).reduce((s, i) => s + D.frames[i].d, 0) / D.fps;
  const draw = () => {
    seg.textContent = '';
    for (const [k, ic, label] of [['gif', 'gif', 'GIF'], ['video', 'movie', T('סרטון')]]) seg.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(fmt === k), onclick: () => { fmt = k; draw(); } }, icon(ic), label));
    const cap = fmt === 'gif' ? 1600 : 1920, seen = new Set();
    size.textContent = '';
    for (const k of [1, 0.5, 0.25]) {
      const [w, hh] = fitSize(Math.round(D.w * k), Math.round(D.h * k), cap), t = `${w} × ${hh}`;
      if (!seen.has(t)) { seen.add(t); size.append(h('option', { value: k, text: LRI + t + PDI })); }
    }
    // a GIF the size of a phone screen is plenty, and far lighter than a big one
    if (fmt === 'gif') { const o = [...size.options].find(x => Math.max(...fitSize(Math.round(D.w * +x.value), Math.round(D.h * +x.value), cap)) <= 960); if (o) size.value = o.value; }
    body.textContent = '';
    body.append(h('label', { class: 'fld' }, h('span', { text: T('גודל') }), size),
      fmt === 'video' ? h('label', { class: 'fld' }, h('span', { text: T('כמה פעמים לנגן') }), times) : null,
      h('p', { class: 'muted small', text: `${TN('{n} פריימים', D.frames.length)} · ${T('{0} שניות', (Math.round(secs * 10) / 10).toLocaleString(LOCALE))}` }),
      h('p', { class: 'muted small', text: fmt === 'gif' ? T('GIF זז לבד בכל מקום: בהודעות, באתרים ובמצגות. רקע שקוף נשאר שקוף.') : T('סרטון MP4 נפתח בכל טלפון ומחשב, ואפשר להעלות אותו ליוטיוב. רקע שקוף נהיה לבן.') }));
  };
  draw();
  modal({ title: T('שמירת האנימציה'), body: h('div', {}, seg, body), actions: [{ label: T('שמירה'), kind: 'primary', icon: 'download', run: () => { saveAnim(fmt, +size.value, +times.value); } }, { label: T('ביטול'), value: false }] });
}
async function saveAnim(fmt, k, times) {
  if (!D) return;
  const name = safeName(displayTitle(S.cur.meta)), what = fmt === 'gif' ? T('מכין את ה-GIF…') : T('מכין את הסרטון…');
  const t = toast(what, { icon: 'hourglass_top', ms: 900000 }), txt = t.querySelector('span:not(.ms)');
  const prog = p => { if (txt) txt.textContent = `${what} ${Math.round(p * 100)}%`; };
  try {
    const blob = fmt === 'gif' ? await makeGif(null, { k, max: 1600, prog }) : await makeVideo({ k, times, prog });
    t.remove();
    await offerFile(`${name}.${fmt === 'gif' ? 'gif' : /mp4/.test(blob.type) ? 'mp4' : 'webm'}`, blob);
  } catch (e) {
    console.error(e); t.remove();
    toast(e && e.message === 'lib' ? T('לא הצלחתי לטעון את כלי השמירה. כדאי לבדוק את החיבור לאינטרנט.') : e && e.message === 'video' ? T('הדפדפן הזה לא יודע ליצור סרטונים. אפשר לשמור כ-GIF.') : T('לא הצלחתי להכין את הקובץ. כדאי לנסות שוב.'), { ms: 7000 });
  }
}

/* =========================================================
   filters. Each is a few small programs for the graphics card (WebGL 2), so even a big layer changes the moment a
   slider moves. While a filter's window is open, the card's own canvas shows the result over the layer, in the place
   it changes (the layer has a hole there meanwhile), so trying costs no copying; "ביטול" (or Esc, or Ctrl+Z) fills the
   hole as it was, and "החלה" (or going on to anything else) copies the result in, as one step to undo. With part of
   the layer chosen, only that part changes. The pictures on the card are premultiplied (each color already times its alpha), as the
   canvas keeps them: a blur mixes them as they are, and the color filters take the alpha out and put it back
   ========================================================= */
const FX_GROUPS = [['color', N_('צבע')], ['blur', N_('טשטוש וחדות')], ['fx', N_('אפקטים')], ['style', N_('סגנון')]];
/* a slider: its setting, label, range, starting value and unit */
const rng = (k, n, min, max, def, u = '') => ({ k, n, t: 'range', min, max, def, u });
const chk = (k, n, def = false) => ({ k, n, t: 'check', def });
const clr = (k, def) => ({ k, n: N_('צבע'), t: 'color', def });
const PT = { k: 'c', t: 'point' };   // a place on the drawing, the middle until a click on the drawing moves it
const angOf = d => [Math.cos(d * Math.PI / 180), Math.sin(d * Math.PI / 180)];
const GRADS = [['#2b0f54', '#e2445c', '#ffd27a'], ['#0b1026', '#2f6fb5', '#bfe9ff'], ['#2a1a0f', '#a0703c', '#f6e7c8'], ['#13002b', '#ff2fa0', '#3cfffa'],
  ['#0b2414', '#3e8c4a', '#e8f5c8'], ['#1a1206', '#b8860b', '#fff4c2'], ['#000000', '#7f7f7f', '#ffffff'], ['#3d0000', '#ff4500', '#ffff66']];
/* g: its group in the ribbon; big: a button of its own there (the rest are in the group's menu); ps: its settings;
   pad: how far from a pixel it reads, so a chosen part takes in what is around it; run: the passes, the last into the canvas */
const FXL = {
  hsl: { g: 'color', big: 1, ic: 'palette', n: N_('גוון ורוויה'), d: N_('מסובב את הצבעים בגלגל הצבעים, ומחזק או מחליש אותם'),
    ps: [rng('hue', N_('גוון'), -180, 180, 0, '°'), rng('sat', N_('רוויה'), -100, 100, 0, '%'), rng('light', N_('בהירות'), -100, 100, 0, '%'), chk('col', N_('הכול בצבע אחד'))],
    run: (p, X) => X.fin('hsl', { hue: p.hue / 360, sat: p.sat / 100, light: p.light / 100, col: +p.col }) },
  bc: { g: 'color', big: 1, ic: 'contrast', n: N_('בהירות וניגודיות'), d: N_('מבהיר או מכהה, ומרחיק או מקרב את הבהיר והכהה'),
    ps: [rng('br', N_('בהירות'), -100, 100, 0, '%'), rng('ct', N_('ניגודיות'), -100, 100, 0, '%')],
    run: (p, X) => X.fin('bc', { br: p.br / 100, ct: p.ct / 100 }) },
  curves: { g: 'color', big: 1, ic: 'show_chart', n: N_('עקומות'), d: N_('גוררים את הקו: למעלה מבהיר, למטה מכהה. שמאל הוא הכהה בציור וימין הבהיר'),
    ps: [{ k: 'cv', t: 'curves', def: { a: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]] } }],
    run: (p, X) => X.fin('curves', {}, { src: X.src, lut: X.lut(curvesLut(p.cv)) }) },
  temp: { g: 'color', ic: 'thermostat', n: N_('חמימות'), d: N_('צבעים חמים יותר, כמו בשקיעה, או קרים יותר, כמו בחורף'),
    ps: [rng('wa', N_('חמימות'), -100, 100, 0, '%')],
    run: (p, X) => X.fin('temp', { wa: p.wa / 100 }) },
  gmap: { g: 'color', ic: 'gradient', n: N_('מפת צבעים'), d: N_('צובע כל מקום לפי כמה הוא כהה או בהיר: הכהה בצבע הראשון, והבהיר באחרון'),
    ps: [{ k: 'gr', t: 'grad', def: GRADS[0] }, rng('amt', N_('חוזק'), 0, 100, 100, '%')],
    run: (p, X) => X.fin('gmap', { amt: p.amt / 100 }, { src: X.src, lut: X.lut(gradLut(p.gr)) }) },
  gray: { g: 'color', ic: 'filter_b_and_w', n: N_('גווני אפור'), d: N_('בלי צבעים, כמו תמונה ישנה בשחור-לבן'),
    ps: [rng('amt', N_('חוזק'), 0, 100, 100, '%')], run: (p, X) => X.fin('mono', { mode: 0, amt: p.amt / 100 }) },
  sepia: { g: 'color', ic: 'filter_vintage', n: N_('ספיה'), d: N_('חום-צהבהב, כמו תמונה מלפני מאה שנה'),
    ps: [rng('amt', N_('חוזק'), 0, 100, 100, '%')], run: (p, X) => X.fin('mono', { mode: 1, amt: p.amt / 100 }) },
  invert: { g: 'color', ic: 'invert_colors', n: N_('היפוך צבעים'), d: N_('כל צבע נהיה ההפך שלו: שחור לבן, וכחול כתום'),
    ps: [rng('amt', N_('חוזק'), 0, 100, 100, '%')], run: (p, X) => X.fin('mono', { mode: 2, amt: p.amt / 100 }) },
  post: { g: 'color', ic: 'tonality', n: N_('פוסטר'), d: N_('רק כמה גוונים לכל צבע, כמו בכרזה מודפסת'),
    ps: [rng('lv', N_('גוונים'), 2, 16, 4)], run: (p, X) => X.fin('mono', { mode: 3, amt: 1, lv: p.lv }) },
  thr: { g: 'color', ic: 'exposure', n: N_('שחור-לבן'), d: N_('כל מקום נהיה שחור או לבן. טוב לציור על דף שצילמו או סרקו'),
    ps: [rng('t', N_('סף'), 1, 99, 50, '%'), chk('clr', N_('הלבן נהיה שקוף'))], run: (p, X) => X.fin('thr', { t: p.t / 100, clr: +p.clr }) },
  blur: { g: 'blur', big: 1, ic: 'lens_blur', n: N_('טשטוש'), d: N_('מרכך הכול, כמו מבעד לזכוכית מטושטשת'),
    ps: [rng('r', N_('עוצמה'), 0, 200, 10, ' px')], pad: p => p.r * 1.6 + 2,
    run: (p, X) => X.fin('copy', {}, { src: X.blur(X.src, p.r / 2) }) },
  motion: { g: 'blur', big: 1, ic: 'motion_blur', n: N_('טשטוש תנועה'), d: N_('כאילו הכול זז מהר בכיוון אחד'),
    ps: [rng('len', N_('מרחק'), 0, 400, 40, ' px'), rng('ang', N_('כיוון'), -180, 180, 0, '°')], pad: p => p.len / 2 + 2,
    run: (p, X) => {
      const [c, s] = angOf(p.ang), dx = c * p.len / X.W, dy = s * p.len / X.H, n = 24, a = X.tmp();
      X.pass('line', { dir: [dx, dy], n }, { src: X.src }, a);
      X.fin('line', { dir: [dx / (n - 1), dy / (n - 1)], n }, { src: a });   // and the gaps between the samples
    } },
  zoom: { g: 'blur', big: 1, ic: 'blur_circular', n: N_('טשטוש זום'), d: N_('כאילו טסים לתוך הציור. לחיצה על הציור קובעת את המרכז'),
    ps: [rng('s', N_('עוצמה'), 0, 100, 30, '%'), PT],
    run: (p, X) => {
      const s = p.s / 100 * 0.6, n = 24, a = X.tmp(), c = X.at(p.c);
      X.pass('zoom', { c, s, n }, { src: X.src }, a);
      X.fin('zoom', { c, s: s / (n - 1), n }, { src: a });
    } },
  sharp: { g: 'blur', big: 1, ic: 'deblur', n: N_('חידוד'), d: N_('קצוות ופרטים חדים יותר'),
    ps: [rng('amt', N_('עוצמה'), 0, 300, 100, '%'), rng('r', N_('רוחב'), 1, 20, 2, ' px')], pad: p => p.r * 1.6 + 2,
    run: (p, X) => X.fin('usm', { amt: p.amt / 100 }, { src: X.src, b: X.blur(X.src, p.r / 2) }) },
  glow: { g: 'fx', big: 1, ic: 'flare', n: N_('זוהר'), d: N_('המקומות הבהירים זורחים החוצה'),
    ps: [rng('t', N_('מאיזו בהירות'), 0, 100, 60, '%'), rng('r', N_('גודל'), 1, 150, 30, ' px'), rng('amt', N_('עוצמה'), 0, 300, 100, '%')], pad: p => p.r * 1.6 + 2,
    run: (p, X) => { const a = X.tmp(); X.pass('bright', { t: p.t / 100 }, { src: X.src }, a); X.fin('screen', { amt: p.amt / 100 }, { src: X.src, b: X.blur(a, p.r / 2) }); } },
  noise: { g: 'fx', big: 1, ic: 'grain', n: N_('רעש'), d: N_('גרגרים קטנים, כמו בצילום ישן'),
    ps: [rng('amt', N_('כמות'), 0, 100, 20, '%'), rng('gs', N_('גודל הגרגר'), 1, 20, 1, ' px'), chk('col', N_('גרגרים צבעוניים'))],
    run: (p, X) => X.fin('noise', { amt: p.amt / 100, gs: p.gs, col: +p.col }) },
  pix: { g: 'fx', big: 1, ic: 'grid_on', n: N_('פיקסלים'), d: N_('ריבועים גדולים, כמו במשחק מחשב ישן'),
    ps: [rng('cell', N_('גודל'), 2, 120, 16, ' px')],
    run: (p, X) => {
      // the color of each square first, a pixel for each, then the squares the size they are
      const cell = p.cell, b0 = [Math.floor(X.org[0] / cell) * cell, Math.floor(X.org[1] / cell) * cell];
      const a = X.tmp(Math.ceil((X.org[0] + X.W - b0[0]) / cell), Math.ceil((X.org[1] + X.H - b0[1]) / cell), true);
      X.pass('pxavg', { cell, base: b0 }, { src: X.src }, a);
      X.fin('pxput', { cell, base: b0 }, { b: a });
    } },
  half: { g: 'fx', ic: 'blur_on', n: N_('נקודות דפוס'), d: N_('נקודות קטנות וגדולות, כמו בקומיקס מודפס'),
    ps: [rng('cell', N_('גודל'), 3, 60, 10, ' px'), chk('mono', N_('בשחור בלבד'))], pad: p => p.cell * 2,
    run: (p, X) => X.fin('half', { cell: p.cell, mono: +p.mono }, { src: X.src, b: X.blur(X.src, p.cell * 0.35) }) },
  glitch: { g: 'fx', ic: 'broken_image', n: N_('גליץ\''), d: N_('קלקול של מסך: פסים שקופצים הצידה, והצבעים נפרדים'),
    ps: [rng('amt', N_('עוצמה'), 0, 100, 40, '%'), { k: 'seed', t: 'seed', def: 1 }], pad: p => p.amt * 0.0021 * Math.max(D.w, D.h) + 4,
    run: (p, X) => X.fin('glitch', { amt: p.amt / 100, seed: p.seed }) },
  chroma: { g: 'fx', ic: 'filter_tilt_shift', n: N_('הפרדת צבעים'), d: N_('האדום והכחול זזים הצידה, כמו בעדשה זולה. לחיצה על הציור קובעת את המרכז'),
    ps: [rng('amt', N_('עוצמה'), 0, 100, 30, '%'), PT], pad: p => p.amt * 0.0003 * Math.hypot(D.w, D.h) + 2,
    run: (p, X) => X.fin('chroma', { c: p.c, k: p.amt / 100 * 0.03 }) },
  vig: { g: 'fx', ic: 'vignette', n: N_('וינייטה'), d: N_('הקצוות כהים יותר, והעין נמשכת למרכז. לחיצה על הציור קובעת את המרכז'),
    ps: [rng('amt', N_('עוצמה'), 0, 100, 60, '%'), rng('size', N_('גודל המרכז'), 0, 100, 40, '%'), clr('col', '#000000'), PT],
    run: (p, X) => X.fin('vig', { c: p.c, amt: p.amt / 100, s0: p.size / 100 * 0.8, col: rgbOf(p.col).map(v => v / 255) }) },
  edges: { g: 'fx', ic: 'draw', n: N_('קווי מתאר'), d: N_('נשארים רק הקווים, כמו בדף צביעה'),
    ps: [rng('amt', N_('עוצמה'), 0, 100, 50, '%'), rng('soft', N_('החלקה'), 0, 10, 1, ' px'), chk('white', N_('רקע לבן'))], pad: p => p.soft * 1.6 + 3,
    run: (p, X) => X.fin('edges', { amt: p.amt / 100, white: +p.white }, { src: X.blur(X.src, p.soft / 2) }) },
  emboss: { g: 'fx', ic: 'landscape', n: N_('הבלטה'), d: N_('כאילו הציור חרוט באבן או בלוח מתכת'),
    ps: [rng('amt', N_('עוצמה'), 0, 300, 100, '%'), rng('ht', N_('גובה'), 1, 10, 2, ' px'), rng('ang', N_('כיוון האור'), -180, 180, -135, '°'), chk('col', N_('בצבע'))], pad: p => p.ht + 2,
    run: (p, X) => { const [c, s] = angOf(p.ang); X.fin('emboss', { d: [c * p.ht / X.W, s * p.ht / X.H], amt: p.amt / 100 * 3, col: +p.col }); } },
  outline: { g: 'style', big: 1, ic: 'border_outer', n: N_('קו מסביב'), d: N_('קו מסביב לכל מה שמצויר בשכבה, כמו מדבקה'),
    ps: [rng('w', N_('עובי'), 1, 64, 6, ' px'), clr('col', '#000000')], pad: p => p.w + 2,
    run: (p, X) => {
      // the distance to the nearest drawn pixel, by jumping: each pass looks around at half the distance of the one before
      let a = X.tmp(X.W, X.H, true), b = X.tmp(X.W, X.H, true);
      X.pass('jfa0', {}, { src: X.src }, a);
      for (let st = 2 ** Math.ceil(Math.log2(p.w + 1)); st >= 1; st = st / 2) { X.pass('jfa', { st }, { b: a }, b); [a, b] = [b, a]; }
      X.pass('jfa', { st: 1 }, { b: a }, b); [a, b] = [b, a];
      X.fin('outl', { w: p.w, col: rgbOf(p.col).map(v => v / 255) }, { src: X.src, b: a });
    } },
  shadow: { g: 'style', big: 1, ic: 'shadow', n: N_('צל'), d: N_('צל מתחת לכל מה שמצויר בשכבה'),
    ps: [rng('dist', N_('מרחק'), 0, 200, 14, ' px'), rng('ang', N_('כיוון'), -180, 180, 45, '°'), rng('soft', N_('רכות'), 0, 100, 12, ' px'), rng('see', N_('שקיפות'), 0, 100, 40, '%'), clr('col', '#000000')],
    pad: p => p.dist + p.soft * 1.6 + 2,
    run: (p, X) => { const [c, s] = angOf(p.ang); X.fin('shad', { off: [c * p.dist / X.W, s * p.dist / X.H], op: 1 - p.see / 100, col: rgbOf(p.col).map(v => v / 255) }, { src: X.src, b: X.blur(X.src, p.soft / 2) }); } },
};

/* --- the programs --- */
const VS = `#version 300 es
uniform float flip;
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = p;
  gl_Position = vec4(p.x * 2.0 - 1.0, (p.y * 2.0 - 1.0) * flip, 0.0, 1.0);
}`;
/* uv runs down the picture as it does on the canvas: (0, 0) is its top left. tx is one pixel of src; us the size of the
   part being changed, org where it is in the drawing, cs the drawing's size */
const FS_HEAD = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D src, b, lut;
uniform vec2 tx, us, org, cs;
vec3 un(vec4 c) { return c.a > 0.0 ? c.rgb / c.a : vec3(0.0); }
vec4 pm(vec3 c, float a) { return vec4(clamp(c, 0.0, 1.0) * a, a); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec2 dpx() { return org + uv * us; }
vec2 duv(vec2 p) { return (p - org) / us; }
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
`;
const FS = {
  copy: `void main() { o = texture(src, uv); }`,
  present: `uniform float cut, lasso; uniform vec4 box;
void main() {
  vec4 c = texture(src, uv);
  if (cut > 0.5) {
    c *= step(box.x, uv.x) * step(box.y, uv.y) * step(uv.x, box.z) * step(uv.y, box.w);
    if (lasso > 0.5) c *= texture(b, uv).a;
  }
  o = c;
}`,
  gauss: `uniform vec2 dir; uniform float sig;
void main() {
  int r = int(ceil(sig * 3.0));
  float k = -0.5 / (sig * sig), ws = 0.0;
  vec4 acc = vec4(0.0);
  for (int i = -r; i <= r; i++) { float w = exp(float(i * i) * k); acc += texture(src, uv + dir * float(i)) * w; ws += w; }
  o = acc / ws;
}`,
  line: `uniform vec2 dir; uniform float n;
void main() {
  int k = int(n); vec4 acc = vec4(0.0);
  for (int i = 0; i < k; i++) acc += texture(src, uv + dir * (float(i) / float(k - 1) - 0.5));
  o = acc / float(k);
}`,
  zoom: `uniform vec2 c; uniform float s, n;
void main() {
  int k = int(n); vec4 acc = vec4(0.0);
  for (int i = 0; i < k; i++) acc += texture(src, c + (uv - c) * (1.0 - s * float(i) / float(k - 1)));
  o = acc / float(k);
}`,
  hsl: `uniform float hue, sat, light, col;
vec3 toHsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), l = (mx + mn) * 0.5, d = mx - mn, h = 0.0, s = 0.0;
  if (d > 1e-5) {
    s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}
vec3 toRgb(vec3 c) {
  vec3 k = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z + c.y * (k - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
}
void main() {
  vec4 c = texture(src, uv);
  if (c.a <= 0.0) { o = c; return; }
  vec3 h = toHsl(un(c));
  if (col > 0.5) { h.x = fract(hue + 1.0); h.y = clamp(0.5 + sat * 0.5, 0.0, 1.0); }
  else { h.x = fract(h.x + hue + 1.0); h.y = clamp(h.y * (1.0 + sat), 0.0, 1.0); }
  h.z = light >= 0.0 ? h.z + (1.0 - h.z) * light : h.z * (1.0 + light);
  o = pm(toRgb(h), c.a);
}`,
  bc: `uniform float br, ct;
void main() {
  vec4 c = texture(src, uv);
  if (c.a <= 0.0) { o = c; return; }
  vec3 v = un(c);
  v = br >= 0.0 ? v + (1.0 - v) * br : v * (1.0 + br);
  v = (v - 0.5) * tan((min(ct, 0.97) + 1.0) * 0.785398) + 0.5;
  o = pm(v, c.a);
}`,
  curves: `void main() {
  vec4 c = texture(src, uv);
  if (c.a <= 0.0) { o = c; return; }
  vec3 m = (un(c) * 255.0 + 0.5) / 256.0;
  o = pm(vec3(texture(lut, vec2(m.r, 0.5)).r, texture(lut, vec2(m.g, 0.5)).g, texture(lut, vec2(m.b, 0.5)).b), c.a);
}`,
  temp: `uniform float wa;
void main() {
  vec4 c = texture(src, uv);
  if (c.a <= 0.0) { o = c; return; }
  o = pm(un(c) * vec3(1.0 + wa * 0.25, 1.0 + wa * 0.03, 1.0 - wa * 0.25), c.a);
}`,
  gmap: `uniform float amt;
void main() {
  vec4 c = texture(src, uv);
  if (c.a <= 0.0) { o = c; return; }
  vec3 v = un(c);
  o = pm(mix(v, texture(lut, vec2((lum(v) * 255.0 + 0.5) / 256.0, 0.5)).rgb, amt), c.a);
}`,
  mono: `uniform float mode, amt, lv;
void main() {
  vec4 c = texture(src, uv);
  if (c.a <= 0.0) { o = c; return; }
  vec3 v = un(c), r;
  int m = int(mode + 0.5);
  if (m == 0) r = vec3(lum(v));
  else if (m == 1) r = vec3(dot(v, vec3(0.393, 0.769, 0.189)), dot(v, vec3(0.349, 0.686, 0.168)), dot(v, vec3(0.272, 0.534, 0.131)));
  else if (m == 2) r = 1.0 - v;
  else r = min(floor(v * lv), lv - 1.0) / (lv - 1.0);
  o = pm(mix(v, r, amt), c.a);
}`,
  thr: `uniform float t, clr;
void main() {
  vec4 c = texture(src, uv);
  if (c.a <= 0.0) { o = c; return; }
  float k = smoothstep(t - 0.006, t + 0.006, lum(un(c)));
  o = clr > 0.5 ? vec4(0.0, 0.0, 0.0, (1.0 - k) * c.a) : pm(vec3(k), c.a);
}`,
  usm: `uniform float amt;
void main() {
  vec4 c = texture(src, uv);
  if (c.a <= 0.0) { o = c; return; }
  vec3 v = un(c);
  o = pm(v + (v - un(texture(b, uv))) * amt, c.a);
}`,
  bright: `uniform float t;
void main() { vec4 c = texture(src, uv); o = c * smoothstep(t, t + 0.15, lum(un(c))); }`,
  screen: `uniform float amt;
void main() { vec4 c = texture(src, uv), g = clamp(texture(b, uv) * amt, 0.0, 1.0); o = c + g - c * g; }`,
  noise: `uniform float amt, gs, col;
void main() {
  vec4 c = texture(src, uv);
  if (c.a <= 0.0) { o = c; return; }
  vec2 q = floor(dpx() / gs);
  vec3 n = col > 0.5 ? vec3(hash(q), hash(q + 17.13), hash(q + 41.71)) - 0.5 : vec3(hash(q) - 0.5);
  o = pm(un(c) + n * amt, c.a);
}`,
  pxavg: `uniform float cell; uniform vec2 base;
void main() {
  vec2 c0 = base + floor(gl_FragCoord.xy) * cell;
  vec4 acc = vec4(0.0);
  for (int j = 0; j < 8; j++) for (int i = 0; i < 8; i++) acc += texture(src, duv(c0 + (vec2(float(i), float(j)) + 0.5) * cell / 8.0));
  o = acc / 64.0;
}`,
  pxput: `uniform float cell; uniform vec2 base;
void main() { o = texelFetch(b, ivec2(floor((dpx() - base) / cell)), 0); }`,
  half: `uniform float cell, mono;
vec2 rot(vec2 p, float a) { float s = sin(a), c = cos(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
float ink(vec2 p, float a, int ch) {
  vec2 q = rot(p, -a), qc = (floor(q / cell) + 0.5) * cell;
  vec4 s = texture(b, duv(rot(qc, a)));
  vec3 v = s.rgb + (1.0 - s.a);   // over white paper
  float k = 1.0 - max(v.r, max(v.g, v.b)), amt;
  if (ch == 3) amt = mono > 0.5 ? 1.0 - lum(v) : k;
  else { vec3 cmy = (1.0 - v - k) / max(1.0 - k, 0.001); amt = ch == 0 ? cmy.x : ch == 1 ? cmy.y : cmy.z; }
  float r = sqrt(clamp(amt, 0.0, 1.0)) * cell * 0.71;
  return 1.0 - smoothstep(r - 0.7, r + 0.7, length(q - qc));
}
void main() {
  vec4 c = texture(src, uv);
  if (c.a <= 0.0) { o = c; return; }
  vec2 p = dpx();
  vec3 col = vec3(1.0 - ink(p, 0.7854, 3));
  if (mono < 0.5) col *= vec3(1.0 - ink(p, 0.2618, 0), 1.0 - ink(p, 1.309, 1), 1.0 - ink(p, 0.0, 2));
  o = pm(col, c.a);
}`,
  glitch: `uniform float amt, seed;
float h1(float x) { return hash(vec2(x, seed * 7.31)); }
void main() {
  vec2 p = dpx();
  float big = floor(p.y / 64.0), ht = 6.0 + floor(h1(big) * 5.0) * 12.0, row = floor(p.y / ht) + big * 97.0;
  float sl = h1(row + 3.1) > 1.0 - amt * 0.6 ? (h1(row + 11.7) - 0.5) * amt * 0.12 * max(cs.x, cs.y) * (1.0 + 2.0 * step(0.8, h1(row + 5.3))) : 0.0;
  float sp = amt * 0.012 * max(cs.x, cs.y) * (0.5 + h1(row + 23.9));
  vec2 q = p + vec2(sl, 0.0);
  vec4 r = texture(src, duv(q + vec2(sp, 0.0))), g = texture(src, duv(q)), bl = texture(src, duv(q - vec2(sp, 0.0)));
  o = vec4(r.r, g.g, bl.b, max(r.a, max(g.a, bl.a)));
}`,
  chroma: `uniform vec2 c; uniform float k;
void main() {
  vec2 p = dpx(), d = (p - c) * k;
  vec4 r = texture(src, duv(p + d)), g = texture(src, uv), bl = texture(src, duv(p - d));
  o = vec4(r.r, g.g, bl.b, max(r.a, max(g.a, bl.a)));
}`,
  vig: `uniform vec2 c; uniform float amt, s0; uniform vec3 col;
void main() {
  vec4 v = texture(src, uv);
  if (v.a <= 0.0) { o = v; return; }
  float f = smoothstep(s0, s0 + 0.75, length((dpx() - c) / (cs * 0.5)) / 1.2);
  o = pm(mix(un(v), col, f * amt), v.a);
}`,
  edges: `uniform float amt, white;
float L(vec2 q) { vec4 c = texture(src, q); return lum(c.rgb + (1.0 - c.a)); }
void main() {
  vec2 e = tx;
  float tl = L(uv - e), t = L(uv + vec2(0.0, -e.y)), tr = L(uv + vec2(e.x, -e.y)), l = L(uv + vec2(-e.x, 0.0)), r = L(uv + vec2(e.x, 0.0)),
    bl = L(uv + vec2(-e.x, e.y)), bt = L(uv + vec2(0.0, e.y)), br = L(uv + e);
  float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl), gy = (bl + 2.0 * bt + br) - (tl + 2.0 * t + tr);
  float m = clamp(length(vec2(gx, gy)) * mix(0.6, 6.0, amt), 0.0, 1.0);
  o = white > 0.5 ? vec4(vec3(1.0 - m), 1.0) : vec4(0.0, 0.0, 0.0, m);
}`,
  emboss: `uniform vec2 d; uniform float amt, col;
float L(vec2 q) { vec4 c = texture(src, q); return lum(c.rgb + (1.0 - c.a)); }
void main() {
  vec4 c = texture(src, uv);
  if (c.a <= 0.0) { o = c; return; }
  float r = (L(uv - d) - L(uv + d)) * amt;
  o = col > 0.5 ? pm(un(c) + r, c.a) : pm(vec3(0.5 + r), c.a);
}`,
  jfa0: `vec4 enc(vec2 p) { return vec4(mod(p.x, 256.0), floor(p.x / 256.0), mod(p.y, 256.0), floor(p.y / 256.0)) / 255.0; }
void main() { o = texture(src, uv).a >= 0.5 ? enc(floor(gl_FragCoord.xy)) : vec4(1.0); }`,
  jfa: `uniform float st;
vec4 enc(vec2 p) { return vec4(mod(p.x, 256.0), floor(p.x / 256.0), mod(p.y, 256.0), floor(p.y / 256.0)) / 255.0; }
vec2 dec(vec4 v) { v = floor(v * 255.0 + 0.5); return vec2(v.x + v.y * 256.0, v.z + v.w * 256.0); }
void main() {
  ivec2 me = ivec2(gl_FragCoord.xy), n = textureSize(b, 0);
  vec2 best = vec2(0.0); float bd = 1e20; bool got = false;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 q = me + ivec2(i, j) * int(st);
    if (q.x < 0 || q.y < 0 || q.x >= n.x || q.y >= n.y) continue;
    vec4 v = texelFetch(b, q, 0);
    if (v == vec4(1.0)) continue;
    vec2 s = dec(v); float d = dot(s - vec2(me), s - vec2(me));
    if (d < bd) { bd = d; best = s; got = true; }
  }
  o = got ? enc(best) : vec4(1.0);
}`,
  outl: `uniform float w; uniform vec3 col;
vec2 dec(vec4 v) { v = floor(v * 255.0 + 0.5); return vec2(v.x + v.y * 256.0, v.z + v.w * 256.0); }
void main() {
  vec4 c = texture(src, uv), v = texelFetch(b, ivec2(uv * vec2(textureSize(b, 0))), 0);
  float cov = v == vec4(1.0) ? 0.0 : clamp(w + 0.5 - length(dec(v) - floor(uv * vec2(textureSize(b, 0)))), 0.0, 1.0);
  o = c + vec4(col * cov, cov) * (1.0 - c.a);
}`,
  shad: `uniform vec2 off; uniform float op; uniform vec3 col;
void main() {
  vec4 c = texture(src, uv);
  float a = texture(b, uv - off).a * op;
  o = c + vec4(col * a, a) * (1.0 - c.a);
}`,
};
/* the curves of the "עקומות" window, through their points (smooth, and never past a point's height between two points) */
function curveFn(pts) {
  const n = pts.length, xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  if (n < 2) return x => x;
  const d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / ((xs[i + 1] - xs[i]) || 1));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (!d[i]) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const hh = xs[i + 1] - xs[i], t = (x - xs[i]) / hh, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * hh * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * hh * m[i + 1];
  };
}
/* each color's own curve first, then the one for all of them */
function curvesLut(cv) {
  const a = curveFn(cv.a), out = new Uint8Array(1024);
  ['r', 'g', 'b'].forEach((k, j) => { const f = curveFn(cv[k]); for (let i = 0; i < 256; i++) out[i * 4 + j] = clamp(Math.round(a(clamp(f(i), 0, 255))), 0, 255); });
  for (let i = 0; i < 256; i++) out[i * 4 + 3] = 255;
  return out;
}
function gradLut(cols) {
  const c = cols.map(rgbOf), out = new Uint8Array(1024);
  for (let i = 0; i < 256; i++) {
    const t = i / 255 * (c.length - 1), j = Math.min(Math.floor(t), c.length - 2), f = t - j;
    for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round(c[j][k] + (c[j + 1][k] - c[j][k]) * f);
    out[i * 4 + 3] = 255;
  }
  return out;
}

/* --- the graphics card: one hidden canvas, its programs, and the pictures in between, kept for the next time --- */
const GLX = { cv: null, gl: null, P: {}, pool: [], once: [] };
function glx() {
  if (GLX.gl && !GLX.gl.isContextLost()) return GLX.gl;
  GLX.cv = newCanvas(1, 1);
  const gl = GLX.cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false });
  GLX.gl = gl || null; GLX.P = {}; GLX.pool = []; GLX.once = [];
  // the card can be taken back (a phone short of memory, a driver restarting): the layer goes back as it was
  if (gl) GLX.cv.addEventListener('webglcontextlost', e => { e.preventDefault(); if (FXS) fxFail(new Error('gl lost')); });
  return GLX.gl;
}
function prog(name) {
  const gl = GLX.gl;
  if (GLX.P[name]) return GLX.P[name];
  const sh = (type, txt) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, txt); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(name + ': ' + gl.getShaderInfoLog(s));
    return s;
  };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS_HEAD + FS[name]));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(name + ': ' + gl.getProgramInfoLog(pr));
  const loc = new Map();
  return (GLX.P[name] = { pr, u: k => { if (!loc.has(k)) loc.set(k, gl.getUniformLocation(pr, k)); return loc.get(k); } });
}
function texParams(gl, near) {
  const f = near ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
/* a picture to draw into, from the ones kept (each is used once in a run) */
function tmpTex(w, hh, near) {
  const gl = GLX.gl;
  let t = GLX.pool.find(x => !x.used && x.w === w && x.h === hh && x.near === !!near);
  if (!t) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, hh);
    texParams(gl, near);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    t = { t: tex, fb, w, h: hh, near: !!near };
    GLX.pool.push(t);
  }
  t.used = true;
  return t;
}
/* a canvas onto the card, premultiplied as the canvas keeps it */
function upTex(c) {
  const gl = GLX.gl, t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  texParams(gl, false);
  return { t, w: c.width, h: c.height };
}
function lutTex(bytes) {
  const gl = GLX.gl, t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  texParams(gl, false);
  GLX.once.push(t);
  return { t, w: 256, h: 1 };
}
function glPass(name, uni, ins, out, U) {
  const gl = GLX.gl, p = prog(name), w = out ? out.w : GLX.cv.width, hh = out ? out.h : GLX.cv.height;
  gl.useProgram(p.pr);
  gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null);
  gl.viewport(0, 0, w, hh);
  let unit = 0;
  for (const [k, t] of Object.entries(ins)) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.t); gl.uniform1i(p.u(k), unit); unit++; }
  const s = ins.src || ins.b;
  for (const [k, v] of Object.entries({ flip: out ? 1 : -1, tx: [1 / s.w, 1 / s.h], us: [U.w, U.h], org: [U.x, U.y], cs: [D.w, D.h], ...uni })) {
    const l = p.u(k);
    if (l == null) continue;
    if (typeof v === 'number') gl.uniform1f(l, v);
    else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
    else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
    else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
  }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
/* a filter over a picture of the part U of a layer: the result is in GLX.cv, the size of U. For the window, only where
   the layer changes (and the picture as it was, while "לפני" is held); to keep, all of it */
function fxRender(s, src, final) {
  const gl = GLX.gl, U = s.U, R = s.R;
  for (const t of GLX.pool) t.used = false;
  if (GLX.cv.width !== U.w || GLX.cv.height !== U.h) { GLX.cv.width = U.w; GLX.cv.height = U.h; }
  const pass = (name, uni, ins, out) => glPass(name, uni, ins, out, U);
  let res = src;
  if (final || !s.before) {
    res = tmpTex(U.w, U.h);
    const X = {
      src, W: U.w, H: U.h, org: [U.x, U.y],
      tmp: (w = U.w, hh = U.h, near) => tmpTex(Math.max(1, w), Math.max(1, hh), near),
      pass, fin: (name, uni, ins = { src }) => pass(name, uni, ins, res),
      lut: lutTex,
      at: c => [(c[0] - U.x) / U.w, (c[1] - U.y) / U.h],
      // a gaussian blur: smaller copies first for a wide one, so it costs the same whatever its size
      blur(t, sig) {
        if (sig < 0.3) return t;
        let cur = t, k = 0;
        while (sig / 2 ** k > 6 && cur.w > 16 && cur.h > 16) { const n = X.tmp(Math.ceil(cur.w / 2), Math.ceil(cur.h / 2)); pass('copy', {}, { src: cur }, n); cur = n; k++; }
        const sg = sig / 2 ** k, a = X.tmp(cur.w, cur.h), b = X.tmp(cur.w, cur.h);
        pass('gauss', { dir: [1 / cur.w, 0], sig: sg }, { src: cur }, a);
        pass('gauss', { dir: [0, 1 / cur.h], sig: sg }, { src: a }, b);
        if (!k) return b;
        const up = X.tmp(t.w, t.h);
        pass('copy', {}, { src: b }, up);
        return up;
      },
    };
    s.f.run(s.p, X);
  }
  pass('present', { cut: final ? 0 : 1, lasso: s.mk ? 1 : 0, box: [(R.x - U.x) / U.w, (R.y - U.y) / U.h, (R.x + R.w - U.x) / U.w, (R.y + R.h - U.y) / U.h] }, s.mk ? { src: res, b: s.mk } : { src: res }, null);
  for (const t of GLX.once) gl.deleteTexture(t);
  GLX.once = [];
  if (gl.isContextLost()) throw new Error('gl');
  return GLX.cv;
}
/* the pictures kept on the card go when the window closes: a big drawing's are big */
function glFree() {
  const gl = GLX.gl;
  if (!gl) return;
  for (const t of GLX.pool) { gl.deleteTexture(t.t); gl.deleteFramebuffer(t.fb); }
  GLX.pool = [];
  if (GLX.cv) { GLX.cv.remove(); GLX.cv.width = 1; GLX.cv.height = 1; }
}

/* --- the filter being tried, and its window over the drawing --- */
let FXS = null;   // { id, f, p (its settings), L, cell, R (what changes), U (what it reads: R and around it), sel (a free outline), tex, el, raf, before, all }
const curvesOk = v => !!v && typeof v === 'object' && ['a', 'r', 'g', 'b'].every(k => Array.isArray(v[k]) && v[k].length >= 2 && v[k].length <= 16
  && v[k].every((q, i) => Array.isArray(q) && q.length === 2 && q.every(n => typeof n === 'number' && n >= 0 && n <= 255) && (!i || q[0] > v[k][i - 1][0])));
/* the settings a filter starts with: as they were the last time it was used, or its own */
function fxSettings(id, fresh) {
  const fx = prefs().fx && typeof prefs().fx === 'object' ? prefs().fx : {}, saved = !fresh && fx[id] && typeof fx[id] === 'object' ? fx[id] : {}, p = {};
  for (const q of FXL[id].ps) {
    const v = saved[q.k];
    if (q.t === 'range') p[q.k] = typeof v === 'number' && isFinite(v) ? clamp(Math.round(v), q.min, q.max) : q.def;
    else if (q.t === 'check') p[q.k] = typeof v === 'boolean' ? v : q.def;
    else if (q.t === 'color') p[q.k] = hex6(v) || q.def;
    else if (q.t === 'grad') p[q.k] = Array.isArray(v) && v.length === 3 && v.every(hex6) ? v.map(hex6) : q.def.slice();
    else if (q.t === 'curves') p[q.k] = JSON.parse(JSON.stringify(curvesOk(v) ? v : q.def));
    else if (q.t === 'seed') p[q.k] = typeof v === 'number' && isFinite(v) ? v : q.def;
    else if (q.t === 'point') p[q.k] = [D.w / 2, D.h / 2];   // the middle of the drawing, each time
  }
  return p;
}
function fxKeep(s) {
  const p = prefs();
  if (!p.fx || typeof p.fx !== 'object') p.fx = {};
  const o = {};
  for (const q of s.f.ps) if (q.t !== 'point') o[q.k] = s.p[q.k];
  p.fx[s.id] = o; savePrefs();
}
/* a part of a canvas as a canvas of its own (the canvas itself when the part is all of it) */
function partOf(c, U) {
  if (!U.x && !U.y && U.w === c.width && U.h === c.height) return c;
  const n = newCanvas(U.w, U.h);
  n.getContext('2d').drawImage(c, U.x, U.y, U.w, U.h, 0, 0, U.w, U.h);
  return n;
}
function fxOpen(id) {
  const f = FXL[id];
  if (!D || !LOADED || !f) return;
  if (FXS) { if (FXS.id === id) return; fxApply(); }
  // what floats is put down first, and stays chosen
  const fl = FL ? clipR(FL.x, FL.y, FL.w, FL.h) : null;
  commitPending();
  if (fl) SEL = rectSel(fl);
  const L = layerOf();
  if (!canDraw(L)) return;
  if (!glx()) { toast(T('הדפדפן הזה לא יכול להפעיל פילטרים.'), { ms: 6000 }); return; }
  const R = SEL ? clipR(SEL.box.x, SEL.box.y, SEL.box.w, SEL.box.h) : { x: 0, y: 0, w: D.w, h: D.h };
  if (!R) return;
  const p = fxSettings(id), far = {};
  for (const q of f.ps) far[q.k] = q.t === 'range' ? q.max : p[q.k];
  const pad = f.pad ? Math.ceil(f.pad(far)) : 0, U = clipR(R.x - pad, R.y - pad, R.w + 2 * pad, R.h + 2 * pad);
  keepLayer(L);
  const s = { id, f, p, L, cell: L.cell, R, U, sel: SEL && !SEL.rect ? selPath() : null, tex: null, mk: null, el: null, raf: 0, before: false, all: false };
  try {
    const c = partOf(HX.bk, U);
    s.tex = upTex(c);
    if (c !== HX.bk) freeCanvas(c);
    if (s.sel) {   // a free outline, as a picture: where it is, the result shows
      const m = newCanvas(U.w, U.h), mx = m.getContext('2d');
      mx.translate(-U.x, -U.y); mx.fillStyle = '#fff'; mx.fill(s.sel);
      s.mk = upTex(m); freeCanvas(m);
    }
  } catch (e) { console.error(e); if (s.tex && GLX.gl) GLX.gl.deleteTexture(s.tex.t); toast(T('לא הצלחתי להפעיל את הפילטר.')); return; }
  FXS = s;
  const cx = s.cell.cx;
  cx.save(); cx.beginPath(); cx.rect(R.x, R.y, R.w, R.h); cx.clip(); if (s.sel) cx.clip(s.sel); cx.clearRect(R.x, R.y, R.w, R.h); cx.restore();
  GLX.cv.className = 'dw-fl';
  Object.assign(GLX.cv.style, { left: U.x + 'px', top: U.y + 'px', width: U.w + 'px', height: U.h + 'px' });
  paintPaper();
  fxPanel(s);
  V.cur.style.display = 'none';
  drawOverlay(); fxUI();
  try { fxShow(s); } catch (e) { fxFail(e); }   // now, so the hole is never seen
}
/* into a layer's canvas, only where the filter changes it */
function fxPut(cx, s, from, sx, sy) {
  const R = s.R;
  cx.save();
  cx.beginPath(); cx.rect(R.x, R.y, R.w, R.h); cx.clip();
  if (s.sel) cx.clip(s.sel);
  cx.clearRect(R.x, R.y, R.w, R.h);
  cx.drawImage(from, sx, sy, R.w, R.h, R.x, R.y, R.w, R.h);
  cx.restore();
}
const fxShow = s => fxRender(s, s.tex, false);
const fxBack = s => fxPut(s.cell.cx, s, HX.bk, s.R.x, s.R.y);
function fxSoon() {
  const s = FXS;
  if (!s || s.raf) return;
  s.raf = requestAnimationFrame(() => {
    s.raf = 0;
    if (FXS !== s) return;
    try { fxShow(s); } catch (e) { fxFail(e); }
  });
}
function fxFail(e) {
  console.error(e);
  const s = FXS;
  if (!s) return;
  try { fxBack(s); } catch {}
  fxClose();
  toast(T('הפילטר לא הצליח. אולי הציור גדול מדי בשביל המכשיר הזה.'), { ms: 7000 });
}
/* kept: one step to undo, for the frame on screen and, when asked, for the layer's other frames too */
function fxApply() {
  const s = FXS;
  if (!s) return;
  if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
  const L = s.L;
  if (!D || !D.layers.includes(L) || L.cell !== s.cell) { fxCancel(); return; }
  try { fxPut(s.cell.cx, s, fxRender(s, s.tex, true), s.R.x - s.U.x, s.R.y - s.U.y); } catch (e) { fxFail(e); return; }
  const steps = [pxStep(L, s.R, keptRect(s.R))], more = [];
  if (s.all && !L.fx) {
    try {
      D.frames.forEach((fr, i) => {
        const cell = cellAt(L, i);
        if (i === D.f || !cell || !cell.ver || !cell.cv.width) return;   // a frame where nothing was drawn stays empty
        const before = cell.cx.getImageData(s.R.x, s.R.y, s.R.w, s.R.h), c = partOf(cell.cv, s.U), tex = upTex(c);
        if (c !== cell.cv) freeCanvas(c);
        try { fxPut(cell.cx, s, fxRender(s, tex, true), s.R.x - s.U.x, s.R.y - s.U.y); } finally { GLX.gl.deleteTexture(tex.t); }
        steps.push(pxStep(L, s.R, before, cell, null)); more.push(cell);
      });
    } catch (e) { console.error(e); toast(T('הפילטר לא הצליח בחלק מהפריימים.'), { ms: 6000 }); }
  }
  fxClose();
  push(steps.length === 1 ? steps[0] : { bytes: steps.reduce((n, st) => n + st.bytes, 0), undo() { for (const st of steps.slice().reverse()) st.undo(); }, redo() { for (const st of steps) st.redo(); } });
  for (const c of more) changed(L, c);
  changed(L);
}
function fxCancel() {
  const s = FXS;
  if (!s) return;
  if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
  if (D) { try { fxBack(s); } catch (e) { console.error(e); } }   // the hole filled, even in a cell no longer on screen
  fxClose();
}
function fxClose() {
  const s = FXS;
  if (!s) return;
  FXS = null;
  if (s.raf) cancelAnimationFrame(s.raf);
  if (s.el) s.el.remove();
  if (GLX.gl) for (const t of [s.tex, s.mk]) if (t) GLX.gl.deleteTexture(t.t);
  glFree();
  paintPaper(); drawOverlay(); cursorUI(); fxUI();
}
const fxUI = () => { for (const b of document.querySelectorAll('#ribbon [data-fx]')) { const on = !!FXS && FXS.id === b.dataset.fx; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } };
/* a click on the drawing moves the middle of the filters that have one */
const fxHasPoint = () => !!FXS && FXS.f.ps.some(q => q.t === 'point');
function fxPoint(c) {
  if (!FXS) return;
  FXS.p.c = [clamp(Math.round(c.x), 0, D.w), clamp(Math.round(c.y), 0, D.h)];
  drawOverlay(); fxSoon();
}
function fxMenu(g, anchor) {
  const list = Object.entries(FXL).filter(([, f]) => f.g === g && !f.big);
  openPop(anchor, h('div', { class: 'menu' }, list.map(([k, f]) => h('button', { class: 'mi', type: 'button', title: T(f.d), onclick: () => { closePopover(); fxOpen(k); } }, icon(f.ic), T(f.n)))));
}

/* the window: the filter's name and what it does, its settings, and the buttons */
const fmtFx = (q, v) => (q.min < 0 && v > 0 ? '+' : '') + v + q.u;
function fxPanel(s) {
  const f = s.f, L = s.L, body = h('div', { class: 'dw-fxp' });
  const fill = () => { body.textContent = ''; for (const q of f.ps) { const el = fxCtl(s, q); if (el) body.append(el); } };
  fill();
  let all = null;
  if (D.frames.length > 1 && !L.fx) {
    all = h('input', { type: 'checkbox' });
    all.addEventListener('change', () => { s.all = all.checked; });
  }
  // pressed and held: the layer as it was
  const cmp = h('button', { class: 'btn', type: 'button', title: T('לוחצים ומחזיקים כדי לראות איך היה לפני') }, icon('compare'), T('לפני'));
  const hold = on => { if (FXS === s && s.before !== on) { s.before = on; cmp.classList.toggle('on', on); fxSoon(); } };
  cmp.addEventListener('pointerdown', e => { if (e.button > 0) return; try { cmp.setPointerCapture(e.pointerId); } catch {} hold(true); });
  for (const k of ['pointerup', 'pointercancel', 'lostpointercapture']) cmp.addEventListener(k, () => hold(false));
  cmp.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hold(true); } });
  cmp.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') hold(false); });
  cmp.addEventListener('contextmenu', e => e.preventDefault());
  const reset = h('button', { class: 'btn', type: 'button', title: T('ההגדרות שהפילטר מתחיל בהן'), onclick: () => { const c = s.p.c; s.p = fxSettings(s.id, true); if (c) s.p.c = c; fill(); fxSoon(); fxKeep(s); } }, icon('restart_alt'), T('איפוס'));
  s.el = h('div', { class: 'dw-fx', role: 'dialog', 'aria-label': T(f.n) },
    h('div', { class: 'dw-fxh' }, icon(f.ic), h('span', { class: 'grow', text: T(f.n) }), h('button', { class: 'rb', type: 'button', title: T('ביטול (Esc)'), 'aria-label': T('ביטול'), onclick: fxCancel }, icon('close'))),
    h('div', { class: 'dw-fxd', text: T(f.d) }),
    h('div', { class: 'dw-fxw', text: SEL ? T('רק בחלק שבחרת, בשכבה: {0}', L.name) : T('בשכבה: {0}', L.name) }),
    body,
    all ? h('label', { class: 'dw-fxc' }, all, T('בכל הפריימים של השכבה')) : null,
    h('div', { class: 'dw-fxb' }, h('div', { class: 'dw-fxb2' }, cmp, reset),
      h('div', { class: 'dw-fxb2 end' }, h('button', { class: 'btn', type: 'button', onclick: fxCancel }, T('ביטול')), h('button', { class: 'btn primary', type: 'button', title: T('החלה (Enter)'), onclick: fxApply }, T('החלה')))));
  V.stage.append(s.el);
}
function fxCtl(s, q) {
  const set = v => { s.p[q.k] = v; fxSoon(); };
  if (q.t === 'range') {
    const r = h('input', { type: 'range', min: String(q.min), max: String(q.max), step: '1', value: String(s.p[q.k]), 'aria-label': T(q.n) }), b = h('b', { text: fmtFx(q, s.p[q.k]) });
    r.addEventListener('input', () => { set(+r.value); b.textContent = fmtFx(q, +r.value); });
    r.addEventListener('change', () => fxKeep(s));
    // a double click puts it back where it starts
    r.addEventListener('dblclick', () => { r.value = String(q.def); set(q.def); b.textContent = fmtFx(q, q.def); fxKeep(s); });
    return h('label', { class: 'dw-fxs' }, h('span', { text: T(q.n) }), b, r);
  }
  if (q.t === 'check') {
    const c = h('input', { type: 'checkbox' });
    c.checked = !!s.p[q.k];
    c.addEventListener('change', () => { set(c.checked); fxKeep(s); });
    return h('label', { class: 'dw-fxc' }, c, T(q.n));
  }
  if (q.t === 'color') {
    const b = h('button', { class: 'sw dw-fxsw', type: 'button', style: { background: s.p[q.k] }, title: s.p[q.k], 'aria-label': T(q.n) });
    b.addEventListener('click', () => colorPop(b, s.p[q.k], c => { b.style.background = c; b.title = c; set(c); fxKeep(s); }));
    return h('div', { class: 'dw-fxrow' }, h('span', { text: T(q.n) }), b);
  }
  if (q.t === 'point') {
    return h('div', { class: 'dw-fxrow' }, h('span', { class: 'grow', text: T('לחיצה על הציור קובעת את המרכז') }),
      h('button', { class: 'btn small', type: 'button', onclick: () => fxPoint({ x: D.w / 2, y: D.h / 2 }) }, T('באמצע')));
  }
  if (q.t === 'seed') {
    return h('div', { class: 'dw-fxrow' }, h('button', { class: 'btn small', type: 'button', onclick: () => { set(1 + Math.floor(Math.random() * 9999)); fxKeep(s); } }, icon('refresh'), T('סידור אחר')));
  }
  if (q.t === 'grad') return fxGrad(s, q);
  if (q.t === 'curves') return fxCurves(s, q);
  return null;
}
/* the three colors of the color map, from the dark to the light, and ready ones to start from */
function fxGrad(s, q) {
  const cols = s.p[q.k], bar = h('div', { class: 'dw-fxgbar' });
  const done = () => { paint(); fxSoon(); fxKeep(s); };
  const sws = [T('הצבע של הכהה'), T('הצבע של האמצע'), T('הצבע של הבהיר')].map((label, i) => {
    const b = h('button', { class: 'sw dw-fxsw', type: 'button', 'aria-label': label });
    b.addEventListener('click', () => colorPop(b, cols[i], c => { cols[i] = c; done(); }));
    return b;
  });
  function paint() {
    bar.style.background = `linear-gradient(to right,${cols.join(',')})`;
    sws.forEach((b, i) => { b.style.background = cols[i]; b.title = `${b.getAttribute('aria-label')} ${cols[i]}`; });
  }
  paint();
  return h('div', { class: 'dw-fxgw' }, bar,
    h('div', { class: 'dw-fxgr' }, sws, h('span', { class: 'grow' }), h('button', { class: 'rb', type: 'button', title: T('הפוך את הסדר'), 'aria-label': T('הפוך את הסדר'), onclick: () => { cols.reverse(); done(); } }, icon('swap_horiz'))),
    h('div', { class: 'dw-fxgp' }, GRADS.map((g, i) => h('button', { class: 'dw-fxg', type: 'button', style: { background: `linear-gradient(to right,${g.join(',')})` }, title: T('מעבר צבעים {0}', i + 1), 'aria-label': T('מעבר צבעים {0}', i + 1),
      onclick: () => { g.forEach((c, j) => { cols[j] = c; }); done(); } }))));
}
/* how much of each brightness the part has, for behind the curve */
function histOf(s) {
  const k = Math.min(1, 400 / Math.max(s.R.w, s.R.h)), w = Math.max(1, Math.round(s.R.w * k)), hh = Math.max(1, Math.round(s.R.h * k));
  const c = newCanvas(w, hh), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(HX.bk, s.R.x, s.R.y, s.R.w, s.R.h, 0, 0, w, hh);
  const d = x.getImageData(0, 0, w, hh).data, H = { a: new Float32Array(256), r: new Float32Array(256), g: new Float32Array(256), b: new Float32Array(256) };
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (!a) continue;
    H.r[d[i]] += a; H.g[d[i + 1]] += a; H.b[d[i + 2]] += a; H.a[Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114)] += a;
  }
  freeCanvas(c);
  return H;
}
/* the curves: dragging a point moves it, a click elsewhere adds one, and one dragged off the square (or clicked twice) goes.
   Left is the dark in the drawing and right the light, whatever the language, as in every drawing program */
const CURVE_COLS = { r: '#e5484d', g: '#1f9d73', b: '#3e63dd' };
function fxCurves(s, q) {
  const cv = s.p[q.k], N = 512, hist = histOf(s);
  let ch = 'a', drag = -1, ghost = null;
  const can = h('canvas', { class: 'dw-fxcv', width: N, height: N, role: 'img', 'aria-label': T('עקומות') }), seg = h('div', { class: 'seg dw-fxseg', role: 'tablist' });
  const tabs = () => {
    seg.textContent = '';
    for (const [k, label] of [['a', T('כל הצבעים')], ['r', T('אדום')], ['g', T('ירוק')], ['b', T('כחול')]]) seg.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(ch === k), onclick: () => { ch = k; tabs(); paint(); } }, label));
  };
  const css = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim() || '#888';
  function paint() {
    const x = can.getContext('2d');
    x.clearRect(0, 0, N, N);
    x.fillStyle = css('--surface-2'); x.fillRect(0, 0, N, N);
    // the brightnesses there are, faintly
    const hs = hist[ch];
    let mx = 0;
    for (const v of hs) mx = Math.max(mx, Math.sqrt(v));
    if (mx) {
      x.fillStyle = ch === 'a' ? 'rgba(128,128,128,.28)' : CURVE_COLS[ch] + '40';
      x.beginPath(); x.moveTo(0, N);
      for (let i = 0; i < 256; i++) x.lineTo(i / 255 * N, N - Math.sqrt(hs[i]) / mx * N * 0.92);
      x.lineTo(N, N); x.closePath(); x.fill();
    }
    x.strokeStyle = css('--line'); x.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(i * N / 4, 0); x.lineTo(i * N / 4, N); x.moveTo(0, i * N / 4); x.lineTo(N, i * N / 4); x.stroke(); }
    x.setLineDash([6, 6]); x.beginPath(); x.moveTo(0, N); x.lineTo(N, 0); x.stroke(); x.setLineDash([]);
    const line = (pts, col, wd) => {
      const fn = curveFn(pts);
      x.strokeStyle = col; x.lineWidth = wd; x.beginPath();
      for (let i = 0; i <= 255; i++) { const y = N - clamp(fn(i), 0, 255) / 255 * N; if (i) x.lineTo(i / 255 * N, y); else x.moveTo(0, y); }
      x.stroke();
    };
    for (const k of ['r', 'g', 'b']) if (k !== ch && JSON.stringify(cv[k]) !== '[[0,0],[255,255]]') line(cv[k], CURVE_COLS[k] + '80', 2);
    line(cv[ch], ch === 'a' ? css('--text') : CURVE_COLS[ch], 4);
    for (const [i, [px, py]] of cv[ch].entries()) {
      x.beginPath(); x.arc(px / 255 * N, N - py / 255 * N, i === drag ? 13 : 10, 0, Math.PI * 2);
      x.fillStyle = i === drag ? (ch === 'a' ? css('--accent') : CURVE_COLS[ch]) : '#fff'; x.fill();
      x.strokeStyle = ch === 'a' ? css('--text') : CURVE_COLS[ch]; x.lineWidth = 3; x.stroke();
    }
  }
  const at = e => { const r = can.getBoundingClientRect(); return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, tol: 14 / r.width * 255 }; };
  can.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const pts = cv[ch], { fx, fy, tol } = at(e), x = clamp(fx * 255, 0, 255), y = clamp((1 - fy) * 255, 0, 255);
    let i = pts.findIndex(p => Math.abs(p[0] - x) <= tol && Math.abs(p[1] - y) <= tol);
    if (i < 0) {
      if (pts.length >= 16 || pts.some(p => Math.abs(p[0] - x) < 2)) return;
      i = pts.findIndex(p => p[0] > x);
      if (i < 0) i = pts.length;
      pts.splice(i, 0, [Math.round(x), Math.round(y)]);
    }
    drag = i; ghost = null;
    try { can.setPointerCapture(e.pointerId); } catch {}
    paint(); fxSoon();
  });
  can.addEventListener('pointermove', e => {
    if (drag < 0 && !ghost) return;
    const pts = cv[ch], { fx, fy } = at(e), inside = fx > -0.12 && fx < 1.12 && fy > -0.12 && fy < 1.12;
    if (ghost) {
      if (!inside) return;
      // back in the square: the point comes back
      const x = Math.round(clamp(fx * 255, 0, 255));
      if (pts.some(p => p[0] === x)) return;
      drag = pts.findIndex(p => p[0] > x); if (drag < 0) drag = pts.length;
      pts.splice(drag, 0, [x, 0]); ghost = null;
    } else if (!inside && drag > 0 && drag < pts.length - 1) { ghost = pts.splice(drag, 1)[0]; drag = -1; paint(); fxSoon(); return; }
    const lo = drag > 0 ? pts[drag - 1][0] + 1 : 0, hi = drag < pts.length - 1 ? pts[drag + 1][0] - 1 : 255;
    pts[drag] = [Math.round(clamp(fx * 255, lo, hi)), Math.round(clamp((1 - fy) * 255, 0, 255))];
    paint(); fxSoon();
  });
  const end = () => { if (drag < 0 && !ghost) return; drag = -1; ghost = null; paint(); fxKeep(s); };
  can.addEventListener('pointerup', end); can.addEventListener('pointercancel', end);
  can.addEventListener('dblclick', e => {
    const pts = cv[ch], { fx, fy, tol } = at(e), x = fx * 255, y = (1 - fy) * 255;
    const i = pts.findIndex(p => Math.abs(p[0] - x) <= tol && Math.abs(p[1] - y) <= tol);
    if (i > 0 && i < pts.length - 1) { pts.splice(i, 1); paint(); fxSoon(); fxKeep(s); }
  });
  tabs(); paint();
  return h('div', { class: 'dw-fxcw' }, seg, can);
}

const COMMANDS = {
  dwUndo: () => undo(), dwRedo: () => redo(),
  dwTool: a => setTool(a),
  dwShapeFill: () => { const p = prefs(); p.shf = p.shf === 'fill' ? 'line' : 'fill'; savePrefs(); if (!TOOLS[TOOL].shape) setTool('rect'); toolUI(); },
  dwColor: (a, b) => colorPop(b, COLOR, c => setColor(c)),
  dwSw: a => setColor(a),
  dwImage: () => pickImage(),
  dwLayers: () => toggleSide(),
  dwLayerAdd: () => addLayer(), dwLayerDup: () => dupLayer(), dwLayerUp: () => moveLayer(1), dwLayerDown: () => moveLayer(-1),
  dwLayerMerge: () => mergeDown(), dwLayerDel: () => delLayer(), dwLayerMenu: (a, b) => layerMenu(b),
  dwSize: () => sizeDialog(), dwBg: (a, b) => bgPop(b),
  dwZoom: a => { if (a === 'in') zoomBy(1.25); else if (a === 'out') zoomBy(0.8); else if (a === 'fit') fit(); else zoomTo(1); },
  dwSelAll: () => selectAll(), dwSelDel: () => delSel(),
  dwSend: () => sendTo(),
  dwPlay: () => play(), dwFrameAdd: () => addFrame(false), dwFrameDup: () => addFrame(true), dwFrameDel: () => delFrame(),
  dwOnion: () => { const o = onionOpt(); o.on = !o.on; savePrefs(); onionNow(); },
  dwAnimExport: a => animDialog(a),
  dwFx: a => fxOpen(a), dwFxMenu: (a, b) => fxMenu(a, b),
};

window.INK_DRAW = {
  load, unload: reset, replace, preview, chooser, flush, body, norm, info, pickInto,
  png, jpg, pdf, print,
  key: onKey, esc: onEsc, stat,
  image: f => placeImage(f, true),
  ready: cur => !!D && LOADED === cur,
  count: () => D ? D.layers.length : 0,
  frames: () => D ? D.frames.length : 0,
};

// ==DRAW-END==
})();
