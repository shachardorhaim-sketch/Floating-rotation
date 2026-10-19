/* Floating Ink: comics and manga. This file loads only when a comic is opened or made (loadComicKit in index.html,
   which loads draw.js first: a panel is drawn in with the drawing's own tools, through INK_DRAW.embed).
   A comic is a document in the same list, store, versions, trash and backup, whose meta.kind is 'comic' and whose
   body is JSON (README "קומיקס"):
   { v: 1, dir: 'rtl' | 'ltr' (the way it is read), size, w, h (every page, in pixels), dpi, p (the page on screen),
     pages: [{ id, gut (the white between the panels), mar (around them), bw (the width of their frames), bc, bg,
       lay: the panels. { id } is a panel; { d: 'h' | 'v', a, b, k: [first, second] } cuts its part of the page in two,
            across (h) or down (v). The cut starts at a and ends at b, fractions of the part's height (h) or width (v),
            so a cut can lean, as in manga. k[0] is the top or left part,
       pan: { [panel id]: { bg, art (a drawing's body, the page's size, cut to the panel when shown), nt (what to draw
            in it: a note for the one drawing, never printed) } },
       its: [{ id, t: 'bub' | 'sfx' | 'speed' | 'focus' | 'tone' | 'img', x, y, w, h (a box on the page), pn (the panel
            it is cut to, if any), un (under the panel's drawing), ...what each kind has }],
       th (a small picture of the page, for the strip and the list) }] }
   The page is drawn on a canvas by one function, drawPage, for the editor, the reader, the strip, PDF and pictures.
   It works with the app's own helpers from index.html (h, T, toast, modal, markDirty, S, PREFS...) */
(() => {
'use strict';

/* =========================================================
   sizes, kinds and what a new one looks like
   ========================================================= */
const SIZES = [
  { k: 'comic', n: N_('קומיקס'), d: N_('דף של חוברת קומיקס'), w: 1300, h: 2000, dpi: 200 },
  { k: 'manga', n: N_('מנגה'), d: N_('דף של ספר מנגה'), w: 1260, h: 1800, dpi: 200 },
  { k: 'a4', n: 'A4', d: N_('דף רגיל להדפסה'), w: 1240, h: 1754, dpi: 150 },
  { k: 'square', n: N_('ריבוע'), d: N_('לשיתוף ברשתות'), w: 1600, h: 1600, dpi: 200 },
  { k: 'strip', n: N_('רצועה'), d: N_('רצועת קומיקס קצרה, כמו בעיתון'), w: 2400, h: 800, dpi: 200 },
];
const MAX_PAGES = 300, MAX_PANELS = 40, MAX_ITEMS = 400, MIN_SIDE = 400, MAX_SIDE = 4096;
/* fonts for the words: each has Hebrew letters (and Latin; the Rubik ones Cyrillic too). The first ones are for what
   the characters say, the rest for sounds. The ones the app doesn't load already come from Google Fonts here */
const TALK_FONTS = ['Fredoka', 'Varela Round', 'Rubik', 'Playpen Sans Hebrew', 'Assistant', 'Amatic SC', 'Secular One'];   // Playpen is Hebrew handwriting (cursive letters)
const SFX_FONTS = ['Rubik Bubbles', 'Karantina', 'Secular One', 'Suez One', 'Rubik Wet Paint', 'Rubik Doodle Shadow', 'Rubik Spray Paint', 'Rubik Glitch', 'Rubik Dirt', 'Fredoka'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Playpen+Sans+Hebrew:wght@400;700&family=Rubik+Bubbles&family=Rubik+Wet+Paint&family=Rubik+Doodle+Shadow&family=Rubik+Spray+Paint&family=Rubik+Glitch&family=Rubik+Dirt&display=swap';
const ALL_FONTS = new Set([...TALK_FONTS, ...SFX_FONTS]);
const okFontC = f => typeof f === 'string' && (ALL_FONTS.has(f) || FONT_NAMES.has(f));
const BUBS = [['speech', N_('דיבור'), N_('בלון של דיבור, עם זנב אל מי שמדבר')], ['thought', N_('מחשבה'), N_('ענן של מחשבה, עם עיגולים קטנים אל מי שחושב')],
  ['shout', N_('צעקה'), N_('בלון עם קוצים, למי שצועק')], ['whisper', N_('לחישה'), N_('בלון בקו מקווקו, למי שלוחש')], ['box', N_('קריין'), N_('תיבה של מספר הסיפור, בלי זנב')]];
const BUB_KEYS = new Set(BUBS.map(b => b[0]));
const KINDS = new Set(['bub', 'sfx', 'speed', 'focus', 'tone', 'img']);
const SMALL = matchMedia('(max-width:900px)').matches || /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent);

/* =========================================================
   small helpers
   ========================================================= */
const hex6 = c => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim()); return m ? '#' + m[1].toLowerCase() : null; };
const col = (c, d) => hex6(c) || d;
const num = (v, lo, hi, d) => { v = +v; return isFinite(v) ? clamp(v, lo, hi) : d; };
const ID_RE = /^[\w-]{1,24}$/;
const IMG_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const rid = p => p + Math.random().toString(36).slice(2, 9);
const newCanvas = (w, hh) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hh)); return c; };
const freeCanvas = c => { if (c) { c.width = 0; c.height = 0; } };   // iPhones stop drawing once all the canvases together pass a limit
const r1 = n => Math.round(n * 10) / 10;
const hashStr = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
/* the same "random" numbers every time for the same seed, so lines and bumps stay where they were */
const rng = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const RTL_CH = new RegExp('[' + String.fromCharCode(0x590) + '-' + String.fromCharCode(0x8ff) + String.fromCharCode(0xfb1d) + '-' + String.fromCharCode(0xfefc) + ']');
const LTR_CH = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ぀-ヿ一-鿿]/;
/* the direction of a text: its first letter that has one */
function textDir(s, d = UI_DIR) {
  for (const ch of String(s || '')) { if (RTL_CH.test(ch)) return 'rtl'; if (LTR_CH.test(ch)) return 'ltr'; }
  return d;
}
const cprefs = () => { if (!PREFS.comic || typeof PREFS.comic !== 'object') PREFS.comic = {}; return PREFS.comic; };

/* =========================================================
   the body: read (everything checked), written, and its words
   ========================================================= */
let C = null;          // the comic on screen
let LOADED = null;     // the app's S.cur it belongs to
let GEN = 0;
const unit = c => (c || C).w / 1300;   // sizes are made for a page 1300 pixels wide, and grow or shrink with it
function newPage(c, lay) {
  const u = unit(c);
  return { id: rid('G'), gut: Math.round(24 * u), mar: Math.round(56 * u), bw: Math.round(5 * u), bc: '#111111', bg: '#ffffff', lay: lay || preset('r212', c.dir), pan: {}, its: [] };
}
function parseLay(n, seen, depth) {
  if (!n || typeof n !== 'object' || depth > 16) return null;
  if (Array.isArray(n.k) && n.k.length === 2 && (n.d === 'h' || n.d === 'v')) {
    const a = parseLay(n.k[0], seen, depth + 1), b = parseLay(n.k[1], seen, depth + 1);
    if (!a || !b) return a || b;   // a broken half: the other takes its place
    return { d: n.d, a: num(n.a, 0.03, 0.97, 0.5), b: num(n.b, 0.03, 0.97, 0.5), k: [a, b] };
  }
  if (seen.size >= MAX_PANELS) return null;
  let id = typeof n.id === 'string' && ID_RE.test(n.id) && !seen.has(n.id) ? n.id : null;
  while (!id || seen.has(id)) id = rid('P');
  seen.add(id);
  return { id };
}
const strIn = (s, max) => typeof s === 'string' ? s.slice(0, max) : '';
function parseItem(it, ids, panels) {
  if (!it || typeof it !== 'object' || !KINDS.has(it.t)) return null;
  const u = unit();
  let id = typeof it.id === 'string' && ID_RE.test(it.id) && !ids.has(it.id) ? it.id : rid('i');
  ids.add(id);
  const o = { id, t: it.t, x: num(it.x, -C.w, 2 * C.w, 100), y: num(it.y, -C.h, 2 * C.h, 100), w: num(it.w, 8, 3 * C.w, 300 * u), h: num(it.h, 8, 3 * C.h, 200 * u) };
  if (typeof it.pn === 'string' && panels.has(it.pn)) o.pn = it.pn;
  if (it.un) o.un = true;
  if (it.fit && o.pn && it.t !== 'bub' && it.t !== 'sfx') o.fit = true;   // it covers its panel, and follows it when the panel changes size
  const d = DEF[it.t](u);
  switch (it.t) {
    case 'bub':
      Object.assign(o, { k: BUB_KEYS.has(it.k) ? it.k : 'speech', txt: strIn(it.txt, 2000), f: okFontC(it.f) ? it.f : d.f, fs: num(it.fs, 8, 300, d.fs), b: !!it.b,
        fc: col(it.fc, d.fc), fill: col(it.fill, d.fill), sc: col(it.sc, d.sc), sw: num(it.sw, 0, 30, d.sw), tl: it.tl !== false,
        tx: num(it.tx, -C.w, 2 * C.w, o.x + o.w * 0.4), ty: num(it.ty, -C.h, 2 * C.h, o.y + o.h * 1.5) });
      break;
    case 'sfx':
      Object.assign(o, { txt: strIn(it.txt, 300), f: okFontC(it.f) ? it.f : d.f, fc: col(it.fc, d.fc), oc: col(it.oc, d.oc), ow: num(it.ow, 0, 0.4, d.ow),
        sh: num(it.sh, 0, 0.3, d.sh), shc: col(it.shc, d.shc), r: num(it.r, -180, 180, 0), sk: num(it.sk, -40, 40, 0) });
      break;
    case 'speed': Object.assign(o, { n: num(it.n, 5, 300, d.n), lw: num(it.lw, 1, 60, d.lw), len: num(it.len, 0.1, 1, d.len), col: col(it.col, d.col), r: num(it.r, -180, 180, 0) }); break;
    case 'focus': Object.assign(o, { n: num(it.n, 10, 400, d.n), lw: num(it.lw, 1, 80, d.lw), ix: num(it.ix, 0.05, 0.95, d.ix), iy: num(it.iy, 0.05, 0.95, d.iy), cx: num(it.cx, -0.5, 0.5, 0), cy: num(it.cy, -0.5, 0.5, 0), col: col(it.col, d.col) }); break;
    case 'tone': Object.assign(o, { sh: it.sh === 'ellipse' ? 'ellipse' : 'rect', sp: num(it.sp, 4, 80, d.sp), ds: num(it.ds, 0.05, 1, d.ds), ang: num(it.ang, -90, 90, 45), col: col(it.col, d.col), gr: !!it.gr, gd: num(it.gd, -180, 180, 90) }); break;
    case 'img':
      if (typeof it.src !== 'string' || !IMG_RE.test(it.src)) return null;
      o.src = it.src;
      break;
  }
  return o;
}
/* what each kind starts as (u: the page's unit) */
const DEF = {
  bub: u => ({ f: 'Fredoka', fs: Math.round(46 * u), fc: '#111111', fill: '#ffffff', sc: '#111111', sw: Math.max(1, Math.round(4 * u)) }),
  sfx: () => ({ f: 'Rubik Bubbles', fc: '#ffd23f', oc: '#111111', ow: 0.1, sh: 0.06, shc: '#e5482d' }),
  speed: u => ({ n: 70, lw: Math.round(7 * u), len: 0.75, col: '#111111' }),
  focus: u => ({ n: 140, lw: Math.round(12 * u), ix: 0.42, iy: 0.42, col: '#111111' }),
  tone: u => ({ sp: Math.round(16 * u), ds: 0.55, col: '#111111' }),
  img: () => ({}),
};
function parseBody(body) {
  let j = null;
  try { j = typeof body === 'string' ? JSON.parse(body) : body; } catch {}
  if (!j || typeof j !== 'object') j = {};
  const sz = SIZES.find(s => s.k === j.size);
  const w = Math.round(num(j.w, MIN_SIDE, MAX_SIDE, sz ? sz.w : 1300)), hh = Math.round(num(j.h, MIN_SIDE, MAX_SIDE, sz ? sz.h : 2000));
  const c = { v: 1, dir: j.dir === 'ltr' ? 'ltr' : j.dir === 'rtl' ? 'rtl' : UI_DIR, size: sz ? sz.k : 'custom', w, h: hh, dpi: Math.round(num(j.dpi, 72, 600, sz ? sz.dpi : 200)), p: 0, pages: [] };
  const was = C; C = c;   // parseItem reads the page's size from C
  try {
    const seenPages = new Set();
    for (const pg of (Array.isArray(j.pages) ? j.pages : []).slice(0, MAX_PAGES)) {
      if (!pg || typeof pg !== 'object') continue;
      const u = unit(c), seen = new Set();
      let id = typeof pg.id === 'string' && ID_RE.test(pg.id) && !seenPages.has(pg.id) ? pg.id : rid('G');
      seenPages.add(id);
      const lay = parseLay(pg.lay, seen, 0) || preset('g1', c.dir);
      if (!seen.size) leafIds(lay).forEach(x => seen.add(x));
      const pan = {};
      if (pg.pan && typeof pg.pan === 'object') for (const [k, v] of Object.entries(pg.pan)) {
        if (!seen.has(k) || !v || typeof v !== 'object') continue;
        const art = typeof v.art === 'string' && v.art.startsWith('{') ? v.art : '', nt = strIn(v.nt, 3000), bg = col(v.bg, '#ffffff');
        if (art || nt || bg !== '#ffffff') pan[k] = { bg, art, nt };
      }
      const ids = new Set(), its = [];
      for (const it of (Array.isArray(pg.its) ? pg.its : []).slice(0, MAX_ITEMS)) { const o = parseItem(it, ids, seen); if (o) its.push(o); }
      c.pages.push({ id, gut: num(pg.gut, 0, 200 * u, 24 * u), mar: num(pg.mar, 0, 400 * u, 56 * u), bw: num(pg.bw, 0, 40 * u, 5 * u), bc: col(pg.bc, '#111111'), bg: col(pg.bg, '#ffffff'),
        lay, pan, its, th: typeof pg.th === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(pg.th) ? pg.th : '' });
    }
    if (!c.pages.length) c.pages.push(newPage(c));
    c.p = clamp(Math.round(+j.p) || 0, 0, c.pages.length - 1);
  } finally { C = was; }
  return c;
}
/* a new comic's body (the New window, and Claude) */
function blankBody({ size = 'comic', dir = UI_DIR, lay = 'r212', pages = 1 } = {}) {
  const sz = SIZES.find(s => s.k === size) || SIZES[0], c = { v: 1, dir: dir === 'ltr' ? 'ltr' : 'rtl', size: sz.k, w: sz.w, h: sz.h, dpi: sz.dpi, p: 0, pages: [] };
  for (let i = 0; i < pages; i++) c.pages.push(newPage(c, preset(lay, c.dir)));
  return JSON.stringify(c);
}
const bodyOf = c => JSON.stringify(c);
/* the words of a comic, in reading order: for the list's line under its name, word counts and search */
function textOf(c) {
  const out = [];
  for (const pg of c.pages) {
    const order = panelOrder(pg.lay, c.dir === 'rtl');
    const rank = it => it.pn ? order.indexOf(it.pn) : 99;
    for (const it of pg.its.filter(x => (x.t === 'bub' || x.t === 'sfx') && x.txt.trim()).sort((a, b) => rank(a) - rank(b) || a.y - b.y)) out.push(it.txt.trim());
  }
  return out.join('\n');
}
const textOfBody = body => textOf(parseBody(body));
/* how many pages, for the list, without parsing every picture in it */
function metaOf(body) { let j = null; try { j = JSON.parse(body); } catch {} return { pages: j && Array.isArray(j.pages) ? j.pages.length || 1 : 1, w: j ? Math.round(+j.w) || 0 : 0, h: j ? Math.round(+j.h) || 0 : 0 }; }

/* =========================================================
   undo: each step keeps the whole comic as it was. Copies share their strings (the drawings and pictures in it),
   so a step costs only the small objects around them
   ========================================================= */
const clone = v => Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v;
const HIST = { steps: [], at: 0 };
const UNDO_STEPS = 200;
const snap = () => clone(C);
function push(before) {
  HIST.steps.splice(HIST.at);
  HIST.steps.push({ before, after: null });
  if (HIST.steps.length > UNDO_STEPS) HIST.steps.shift();
  HIST.at = HIST.steps.length;
  undoUI();
}
/* a change, as one step that can be undone */
function edit(fn) {
  if (!C) return;
  commitText();
  const before = snap();
  if (fn() === false) return;
  push(before);
  changed();
}
function undo() {
  if (DRAWING) return;
  if (EDIT) { cancelText(); return; }
  if (!HIST.at) return;
  const s = HIST.steps[--HIST.at];
  s.after = snap(); C = clone(s.before);
  afterHistory();
}
function redo() {
  if (DRAWING || HIST.at >= HIST.steps.length) return;
  commitText();
  const s = HIST.steps[HIST.at++];
  if (!s.after) return;
  C = clone(s.after);
  afterHistory();
}
function afterHistory() {
  C.p = clamp(C.p, 0, C.pages.length - 1);
  if (SEL && !selected()) SEL = null;
  changed(); stripUI(); sideUI(); undoUI();
}
function undoUI() {
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmUndo"]')) b.disabled = !HIST.at && !EDIT;
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmRedo"]')) b.disabled = HIST.at >= HIST.steps.length;
}
/* something changed: drawn again, saved a moment later, and the page's small picture made again */
function changed() {
  if (!C) return;
  refit(page());
  if (LOADED && S.cur === LOADED) markDirty();
  paint(); stat(); thumbSoon(); sideSoon();
}

/* =========================================================
   the panels: a page's part cut in two again and again. Each part is a convex polygon of corners
   { x, y, c }, where c tells that the side starting at that corner is a cut between two panels (it gets half of the
   white between them) and not the edge of the page's area
   ========================================================= */
const leafIds = (n, out = []) => { if (n.k) { leafIds(n.k[0], out); leafIds(n.k[1], out); } else out.push(n.id); return out; };
/* the order panels are read in: a cut across is read top first, a cut down from the side the comic is read from */
function panelOrder(n, rtl, out = []) {
  if (!n.k) { out.push(n.id); return out; }
  const [p, q] = n.d === 'v' && rtl ? [n.k[1], n.k[0]] : n.k;
  panelOrder(p, rtl, out); panelOrder(q, rtl, out);
  return out;
}
const cross = (A, B, P) => (B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x);
/* the part of polygon P on one side of the line through A and B (sg 1: where cross >= 0, the inside of a clockwise
   polygon's side; -1: the other side). New sides along the line are cuts */
function clipPoly(P, A, B, sg) {
  const out = [], n = P.length;
  for (let i = 0; i < n; i++) {
    const p = P[i], q = P[(i + 1) % n], fp = sg * cross(A, B, p), fq = sg * cross(A, B, q);
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) {
      const t = fp / (fp - fq), I = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
      out.push({ ...I, c: fp >= 0 ? true : p.c });
    }
  }
  // corners closer than a pixel are one
  return out.filter((p, i) => { const q = out[(i + 1) % out.length]; return out.length < 4 || Math.hypot(q.x - p.x, q.y - p.y) > 0.5; });
}
function bbox(P) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of P) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const area = P => P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;
/* the line of a cut, through the part's box: across from a (at its left) to b (at its right), or down from a (top) to b */
const cutLine = (n, bb) => n.d === 'h' ? [{ x: bb.x, y: bb.y + n.a * bb.h }, { x: bb.x + bb.w, y: bb.y + n.b * bb.h }] : [{ x: bb.x + n.a * bb.w, y: bb.y }, { x: bb.x + n.b * bb.w, y: bb.y + bb.h }];
/* the panel inside its part: each side that is a cut moves in by half the white between panels. Done as one cut for each
   side, so a side too short for the white simply goes */
function insetPoly(P, d) {
  if (!(d > 0)) return P.map(p => ({ x: p.x, y: p.y }));
  let Q = P.map(p => ({ x: p.x, y: p.y }));
  for (let i = 0; i < P.length && Q.length >= 3; i++) {
    const p = P[i], q = P[(i + 1) % P.length];
    if (!p.c) continue;
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1, nx = -(q.y - p.y) / len * d, ny = (q.x - p.x) / len * d;
    Q = clipPoly(Q, { x: p.x + nx, y: p.y + ny }, { x: q.x + nx, y: q.y + ny }, 1);
  }
  return Q.length >= 3 && area(Q) > 400 ? Q.map(p => ({ x: p.x, y: p.y })) : null;
}
/* the part of the line A-B inside convex polygon P */
function segIn(P, A, B) {
  let t0 = -1e9, t1 = 1e9;
  const dx = B.x - A.x, dy = B.y - A.y;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length], ex = q.x - p.x, ey = q.y - p.y;
    const den = ex * dy - ey * dx, num0 = ex * (A.y - p.y) - ey * (A.x - p.x);   // inside: ex*(y-p.y) - ey*(x-p.x) >= 0
    if (Math.abs(den) < 1e-9) { if (num0 < 0) return null; continue; }
    const t = -num0 / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
  }
  return t1 > t0 ? [{ x: A.x + dx * t0, y: A.y + dy * t0 }, { x: A.x + dx * t1, y: A.y + dy * t1 }] : null;
}
/* a page's panels: { panels: [{ id, raw (its part), P (the panel itself, or null when too small), box }] in reading
   order, cuts: [{ path (child indexes from the top of lay), n, bb (its part's box), seg }] } */
const GEOM = new Map();
function geom(pg, c = C) {
  const key = `${c.w}x${c.h}|${c.dir}|${pg.gut}|${pg.mar}|${JSON.stringify(pg.lay)}`;
  let g = GEOM.get(key);
  if (g) return g;
  const m = Math.min(pg.mar, c.w / 3, c.h / 3), raw = new Map(), cuts = [];
  const page = [{ x: m, y: m }, { x: c.w - m, y: m }, { x: c.w - m, y: c.h - m }, { x: m, y: c.h - m }];
  (function walk(n, P, path) {
    if (!n.k) { raw.set(n.id, P); return; }
    const bb = bbox(P), [A, B] = cutLine(n, bb), seg = segIn(P, A, B);
    // across: the top part is where cross <= 0; down: the left part is where cross >= 0
    const s0 = n.d === 'h' ? -1 : 1;
    cuts.push({ path, n, bb, seg });
    walk(n.k[0], clipPoly(P, A, B, s0), path.concat(0));
    walk(n.k[1], clipPoly(P, A, B, -s0), path.concat(1));
  })(pg.lay, page, []);
  const panels = panelOrder(pg.lay, c.dir === 'rtl').map(id => {
    const R = raw.get(id), P = R && R.length >= 3 ? insetPoly(R, pg.gut / 2) : null;
    return { id, raw: R, P, box: bbox(P || R || page) };
  });
  g = { panels, cuts };
  if (GEOM.size > 300) GEOM.clear();
  GEOM.set(key, g);
  return g;
}
const nodeAt = (lay, path) => path.reduce((n, i) => n && n.k && n.k[i], lay);
/* effects and pictures that fill their panel take its new box (after a cut moved, or the page was cut another way) */
function refit(pg) {
  const g = geom(pg);
  for (const it of pg.its) {
    if (!it.fit) continue;
    const p = g.panels.find(q => q.id === it.pn);
    if (!p) { delete it.fit; continue; }
    if (it.t === 'img') { const e = IMGS.get(it.src); if (e && e.im) Object.assign(it, coverBox(e.im.naturalWidth, e.im.naturalHeight, p.box)); }
    else Object.assign(it, { x: p.box.x, y: p.box.y, w: p.box.w, h: p.box.h });
  }
}
/* how far a convex polygon reaches left and right between two heights (a slanted panel is narrower at one end) */
function spanAt(P, y0, y1) {
  const at = y => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      if ((a.y - y) * (b.y - y) > 0 || a.y === b.y) continue;
      const x = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
      lo = Math.min(lo, x); hi = Math.max(hi, x);
    }
    return [lo, hi];
  };
  const [a0, a1] = at(y0), [b0, b1] = at(y1);
  return { lo: Math.max(a0, b0), hi: Math.min(a1, b1) };
}
/* a box moved sideways (and made narrower if it must) to stay inside the panel at its height */
function inside(P, box, m) {
  if (!P) return box;
  const s = spanAt(P, box.y, box.y + box.h);
  if (!(s.hi > s.lo)) return box;
  const w = Math.min(box.w, s.hi - s.lo - 2 * m);
  return { ...box, w, x: clamp(box.x, s.lo + m, s.hi - m - w) };
}
function inPoly(P, p) {
  for (let i = 0; i < P.length; i++) if (cross(P[i], P[(i + 1) % P.length], p) < 0) return false;
  return true;
}
/* every panel big enough to draw in (a cut moved too far is refused) */
const layOk = pg => geom(pg).panels.every(p => p.P && p.box.w >= 40 * unit() && p.box.h >= 40 * unit());

/* --- ready-made ways to cut a page (the gallery under "חלוקה"), made for comics read from right to left and
   mirrored for the other way. stack: parts one under another (h) or side by side (v), sizes their shares, lean how
   much each cut slants --- */
const L = () => ({ id: rid('P') });
function stack(d, parts, sizes, lean) {
  if (parts.length === 1) return parts[0];
  const total = sizes.reduce((s, v) => s + v, 0), f = sizes[0] / total, l = (lean && lean[0]) || 0;
  return { d, a: f - l, b: f + l, k: [parts[0], stack(d, parts.slice(1), sizes.slice(1), lean && lean.slice(1))] };
}
const ones = n => Array(n).fill(1);
const row = (n, lean) => n === 1 ? L() : stack('v', Array.from({ length: n }, L), ones(n), lean);
const rows = (counts, sizes, lean, colLean) => stack('h', counts.map((n, i) => row(n, colLean && colLean[i])), sizes || ones(counts.length), lean);
const PRESETS = [
  { k: 'g1', g: 'grid', n: () => L() },
  { k: 'g2', g: 'grid', n: () => rows([1, 1]) },
  { k: 'g2v', g: 'grid', n: () => row(2) },
  { k: 'g4', g: 'grid', n: () => rows([2, 2]) },
  { k: 'g6', g: 'grid', n: () => rows([2, 2, 2]) },
  { k: 'g8', g: 'grid', n: () => rows([2, 2, 2, 2]) },
  { k: 'g9', g: 'grid', n: () => rows([3, 3, 3]) },
  { k: 'c3', g: 'grid', n: () => row(3) },
  { k: 'c4', g: 'grid', n: () => row(4) },
  { k: 'r3', g: 'rows', n: () => rows([1, 1, 1]) },
  { k: 'r4', g: 'rows', n: () => rows([1, 1, 1, 1]) },
  { k: 'r121', g: 'rows', n: () => rows([1, 2, 1]) },
  { k: 'r212', g: 'rows', n: () => rows([2, 1, 2]) },
  { k: 'r122', g: 'rows', n: () => rows([1, 2, 2], [1.4, 1, 1]) },
  { k: 'r221', g: 'rows', n: () => rows([2, 2, 1], [1, 1, 1.4]) },
  { k: 'r232', g: 'rows', n: () => rows([2, 3, 2]) },
  { k: 'r1222', g: 'rows', n: () => rows([1, 2, 2, 2], [1.3, 1, 1, 1]) },
  { k: 'm212', g: 'manga', n: () => rows([2, 1, 2], [1, 1.1, 1], [0.035, -0.035], [[0.07], null, [-0.07]]) },
  { k: 'm2d', g: 'manga', n: () => ({ d: 'h', a: 0.62, b: 0.36, k: [L(), L()] }) },
  { k: 'm3d', g: 'manga', n: () => rows([1, 2, 1], [1, 1.15, 1], [0.06, -0.06], [null, [0.12], null]) },
  { k: 'mside', g: 'manga', n: () => ({ d: 'v', a: 0.44, b: 0.4, k: [stack('h', [L(), L(), L()], [1, 1, 1], [0.05, -0.05]), L()] }) },
  { k: 'mact', g: 'manga', n: () => stack('h', [L(), { d: 'v', a: 0.64, b: 0.34, k: [L(), L()] }, row(3, [0.06, -0.06])], [0.8, 1.3, 1], [0.04, -0.03]) },
  { k: 'mz', g: 'manga', n: () => rows([1, 2, 1, 2], [1, 1, 1, 1], [0.05, -0.05, 0.05], [null, [0.1], null, [-0.1]]) },
  { k: 'mbig', g: 'manga', n: () => stack('h', [row(2, [0.08]), L(), row(2, [-0.08])], [0.75, 1.6, 0.75], [-0.04, 0.04]) },
];
const PRESET_KEYS = PRESETS.map(p => p.k);
/* the same cuts seen in a mirror: for comics read from left to right, so the first panel is on the left */
function mirror(n) {
  if (!n.k) return n;
  return n.d === 'v' ? { d: 'v', a: 1 - n.a, b: 1 - n.b, k: [mirror(n.k[1]), mirror(n.k[0])] } : { d: 'h', a: n.b, b: n.a, k: [mirror(n.k[0]), mirror(n.k[1])] };
}
function preset(k, dir) {
  const p = PRESETS.find(x => x.k === k) || PRESETS[0], n = p.n();
  return dir === 'ltr' ? mirror(n) : n;
}
/* the preset that has this many panels, for Claude's pages */
const BY_COUNT = { 1: 'g1', 2: 'g2', 3: 'r3', 4: 'g4', 5: 'r212', 6: 'g6', 7: 'r232', 8: 'g8', 9: 'g9' };

/* =========================================================
   shapes: every bubble and effect is a path, in the item's own place (around its middle for bubbles, sounds and speed
   lines; from its corner for focus lines and dots). The same path is drawn on the page, hit by the mouse, and saved
   ========================================================= */
const PATHS = new Map();
function pathOf(key, make) {
  let p = PATHS.get(key);
  if (!p) { if (PATHS.size > 600) PATHS.clear(); p = new Path2D(make()); PATHS.set(key, p); }
  return p;
}
const ell = (rx, ry, t) => [rx * Math.cos(t), ry * Math.sin(t)];
const circleD = (x, y, r) => `M${r1(x + r)} ${r1(y)}a${r1(r)} ${r1(r)} 0 1 0 ${r1(-2 * r)} 0a${r1(r)} ${r1(r)} 0 1 0 ${r1(2 * r)} 0Z`;
/* the tail's tip as seen from the bubble's middle, or null when it is inside the bubble (or the bubble has none) */
function tipOf(b, k = 1.12) {
  if (!b.tl || b.k === 'box') return null;
  const rx = b.w / 2, ry = b.h / 2, x = b.tx - (b.x + rx), y = b.ty - (b.y + ry);
  return (x / rx) ** 2 + (y / ry) ** 2 > k * k ? { x, y } : null;
}
/* speech and whisper: an oval, and a tail that leaves it between two points and bends a little on its way to the tip */
function ovalD(rx, ry, tip) {
  if (!tip) return `M${r1(rx)} 0A${r1(rx)} ${r1(ry)} 0 1 1 ${r1(-rx)} 0A${r1(rx)} ${r1(ry)} 0 1 1 ${r1(rx)} 0Z`;
  const th = Math.atan2(tip.y / ry, tip.x / rx), dl = 0.2;
  const [x1, y1] = ell(rx, ry, th - dl), [x2, y2] = ell(rx, ry, th + dl), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const c1 = [((x1 * 0.65 + mx * 0.35) + tip.x) / 2, ((y1 * 0.65 + my * 0.35) + tip.y) / 2], c2 = [((x2 * 0.65 + mx * 0.35) + tip.x) / 2, ((y2 * 0.65 + my * 0.35) + tip.y) / 2];
  return `M${r1(x2)} ${r1(y2)}A${r1(rx)} ${r1(ry)} 0 1 1 ${r1(x1)} ${r1(y1)}Q${r1(c1[0])} ${r1(c1[1])} ${r1(tip.x)} ${r1(tip.y)}Q${r1(c2[0])} ${r1(c2[1])} ${r1(x2)} ${r1(y2)}Z`;
}
const perim = (rx, ry) => Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
/* thought: a cloud of bumps, and small circles growing smaller toward the one thinking */
function cloudD(rx, ry, tip, seed) {
  const R = rng(seed), n = clamp(Math.round(perim(rx, ry) / (Math.min(rx, ry) * 0.62)), 8, 18), ph = R() * Math.PI * 2;
  const ts = Array.from({ length: n }, (_, i) => ph + (i + (R() - 0.5) * 0.3) / n * Math.PI * 2);
  const P = t => ell(rx * 0.9, ry * 0.9, t), N = t => { const x = Math.cos(t) / rx, y = Math.sin(t) / ry, l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  let d = '';
  for (let i = 0; i < n; i++) {
    const t0 = ts[i], t1 = ts[(i + 1) % n] + (i + 1 === n ? Math.PI * 2 : 0), [ax, ay] = P(t0), [bx, by] = P(t1);
    const hb = Math.hypot(bx - ax, by - ay) * (0.55 + R() * 0.15), [n0x, n0y] = N(t0), [n1x, n1y] = N(t1);
    if (!i) d += `M${r1(ax)} ${r1(ay)}`;
    d += `C${r1(ax + n0x * hb)} ${r1(ay + n0y * hb)} ${r1(bx + n1x * hb)} ${r1(by + n1y * hb)} ${r1(bx)} ${r1(by)}`;
  }
  d += 'Z';
  if (tip) {
    const th = Math.atan2(tip.y / ry, tip.x / rx), [ex, ey] = ell(rx * 1.02, ry * 1.02, th), rb = Math.min(rx, ry) * 0.17;
    [[0.3, 1], [0.6, 0.68], [0.88, 0.44]].forEach(([f, k]) => { d += circleD(ex + (tip.x - ex) * f, ey + (tip.y - ey) * f, rb * k); });
  }
  return d;
}
/* shout: spikes all round, and the spike nearest the tip reaches all the way to it */
function burstD(rx, ry, tip, seed) {
  const R = rng(seed), n = clamp(Math.round(perim(rx, ry) / (Math.min(rx, ry) * 0.42)), 10, 28), pts = [];
  for (let i = 0; i < 2 * n; i++) {
    const out = i % 2 === 0, t = (i + (out ? (R() - 0.5) * 0.5 : 0)) / (2 * n) * Math.PI * 2, k = out ? 1.06 + R() * 0.16 : 0.8 + R() * 0.06;
    pts.push([rx * k * Math.cos(t), ry * k * Math.sin(t), t, out]);
  }
  if (tip) {
    const th = Math.atan2(tip.y / ry, tip.x / rx), diff = t => Math.abs(Math.atan2(Math.sin(t - th), Math.cos(t - th)));
    let best = 0;
    pts.forEach((p, i) => { if (p[3] && diff(p[2]) < diff(pts[best][2])) best = i; });
    pts[best] = [tip.x, tip.y, 0, true];
  }
  return 'M' + pts.map(p => `${r1(p[0])} ${r1(p[1])}`).join('L') + 'Z';
}
function bubbleD(b) {
  const rx = b.w / 2, ry = b.h / 2, seed = hashStr(b.id);
  if (b.k === 'box') return `M${r1(-rx)} ${r1(-ry)}H${r1(rx)}V${r1(ry)}H${r1(-rx)}Z`;
  if (b.k === 'thought') return cloudD(rx, ry, tipOf(b, 1.05), seed);
  if (b.k === 'shout') return burstD(rx, ry, tipOf(b, 1.25), seed);
  return ovalD(rx, ry, tipOf(b));
}
const bubbleKey = b => `b|${b.k}|${r1(b.w)}|${r1(b.h)}|${b.tl && b.k !== 'box' ? r1(b.tx - b.x) + ',' + r1(b.ty - b.y) : ''}|${b.id}`;
const bubblePath = b => pathOf(bubbleKey(b), () => bubbleD(b));

/* speed lines: thin spears along the box's length (it can be turned), each a different length and place */
function speedD(it) {
  const R = rng(hashStr(it.id) + it.n), w = it.w, hh = it.h;
  let d = '';
  for (let i = 0; i < it.n; i++) {
    const y = -hh / 2 + R() * hh, len = w * it.len * (0.45 + 0.55 * R()), x0 = -w / 2 + R() * (w - len), t = it.lw * (0.3 + 0.7 * R()), m = x0 + len * (0.25 + R() * 0.15);
    d += `M${r1(x0)} ${r1(y)}L${r1(m)} ${r1(y - t / 2)}L${r1(x0 + len)} ${r1(y)}L${r1(m)} ${r1(y + t / 2)}Z`;
  }
  return d;
}
/* focus lines (manga's concentration lines): from the box's edges toward a point, stopping round a clear oval around it */
function focusD(it) {
  const R = rng(hashStr(it.id) + it.n), w = it.w, hh = it.h, cx = w / 2 + it.cx * w, cy = hh / 2 + it.cy * hh, irx = it.ix * w / 2, iry = it.iy * hh / 2;
  let d = '';
  for (let i = 0; i < it.n; i++) {
    const a = (i + R() * 0.8) / it.n * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
    // where the ray leaves the box
    const tx = dx > 0 ? (w - cx) / dx : dx < 0 ? -cx / dx : Infinity, ty = dy > 0 ? (hh - cy) / dy : dy < 0 ? -cy / dy : Infinity, t = Math.min(tx, ty) * 1.02;
    const k = 1 + R() * 0.5, ix = cx + dx * irx * k, iy = cy + dy * iry * k, ox = cx + dx * t, oy = cy + dy * t;
    if ((ox - cx) * dx + (oy - cy) * dy <= (ix - cx) * dx + (iy - cy) * dy) continue;   // the clear oval reaches the edge here
    const wd = it.lw * (0.3 + R() * 0.9) / 2;
    d += `M${r1(ox - dy * wd)} ${r1(oy + dx * wd)}L${r1(ix)} ${r1(iy)}L${r1(ox + dy * wd)} ${r1(oy - dx * wd)}Z`;
  }
  return d;
}
/* screentone: dots on a turned grid inside a rectangle or an oval, all one size or growing along a direction */
function toneD(it) {
  const w = it.w, hh = it.h, cx = w / 2, cy = hh / 2, R = Math.hypot(w, hh) / 2;
  let sp = it.sp;
  while ((2 * R / sp) ** 2 > 40000) sp *= 1.25;   // never more dots than a phone draws quickly
  const a = it.ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), g = it.gd * Math.PI / 180, gx = Math.cos(g), gy = Math.sin(g);
  const ext = Math.abs(w / 2 * gx) + Math.abs(hh / 2 * gy) || 1, rmax = sp / 2 * it.ds * 1.25;
  let d = '';
  for (let u = -R; u <= R; u += sp) for (let v = -R; v <= R; v += sp) {
    const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca;
    if (it.sh === 'ellipse' ? ((x - cx) / (w / 2)) ** 2 + ((y - cy) / (hh / 2)) ** 2 > 1 : x < 0 || y < 0 || x > w || y > hh) continue;
    const r = it.gr ? rmax * clamp(((x - cx) * gx + (y - cy) * gy) / ext * 0.5 + 0.5, 0, 1) : rmax;
    if (r >= 0.35) d += circleD(x, y, r);
  }
  return d;
}
const fxPath = it => it.t === 'speed' ? pathOf(`s|${it.id}|${it.n}|${r1(it.w)}|${r1(it.h)}|${it.lw}|${it.len}`, () => speedD(it))
  : it.t === 'focus' ? pathOf(`f|${it.id}|${it.n}|${r1(it.w)}|${r1(it.h)}|${it.lw}|${it.ix}|${it.iy}|${it.cx}|${it.cy}`, () => focusD(it))
  : pathOf(`t|${r1(it.w)}|${r1(it.h)}|${it.sh}|${it.sp}|${it.ds}|${it.ang}|${it.gr ? it.gd : ''}`, () => toneD(it));

/* =========================================================
   words in a bubble: the biggest size (up to the bubble's own) at which the text fits inside the bubble's shape,
   each line as wide as the shape is at its height, the lines in the middle
   ========================================================= */
const MX = newCanvas(1, 1).getContext('2d');
const fontOf = (f, bold, s) => `${bold ? 700 : 400} ${r1(s)}px "${f}", "Fredoka", "Rubik", sans-serif`;
const LAY = new Map();
/* how wide a line may be at height y (from the middle) for a bubble of this kind */
function roomOf(b) {
  const rx = b.w / 2, ry = b.h / 2, pad = b.sw / 2 + Math.min(rx, ry) * 0.06 + 3;
  if (b.k === 'box') { const ex = Math.max(0, rx - pad - Math.min(rx, ry) * 0.08), ey = Math.max(0, ry - pad); return { ey, half: () => ex }; }
  const k = b.k === 'thought' ? [0.8, 0.74] : b.k === 'shout' ? [0.74, 0.68] : [0.88, 0.84], ex = Math.max(0, rx * k[0] - pad), ey = Math.max(0, ry * k[1] - pad);
  return { ey, half: y => ey > 0 && y < ey ? ex * Math.sqrt(1 - (y / ey) ** 2) : 0 };
}
/* the text broken into lines for these widths, or null when it needs more lines. A word wider than its line is broken
   between letters (Chinese has no spaces at all) */
function fillLines(paras, widths) {
  const lines = [];
  let j = 0;
  const fits = t => MX.measureText(t).width <= widths[j] + 0.01;
  for (const para of paras) {
    let cur = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if (j >= widths.length) return null;
      const t = cur ? cur + ' ' + w : w;
      if (fits(t)) { cur = t; continue; }
      if (cur) { lines.push(cur); j++; cur = ''; if (j >= widths.length) return null; }
      if (fits(w)) { cur = w; continue; }
      let part = '';
      for (const ch of Array.from(w)) {
        if (!part || fits(part + ch)) part += ch;
        else { lines.push(part); j++; if (j >= widths.length) return null; part = ch; }
      }
      cur = part;
    }
    lines.push(cur); j++;
    if (j > widths.length) return null;
  }
  return lines;
}
function layoutText(b) {
  const key = [b.k, r1(b.w), r1(b.h), b.f, b.b ? 1 : 0, b.fs, b.sw, b.txt].join('|');
  let L0 = LAY.get(key);
  if (L0) return L0;
  const txt = b.txt.replace(/\r/g, '').trim(), room = roomOf(b), paras = txt.split('\n');
  const slots = (n, lh) => Array.from({ length: n }, (_, j) => { const y = (j - (n - 1) / 2) * lh, yy = Math.abs(y) + lh * 0.5; return Math.max(0, 2 * Math.min(room.half(Math.abs(y)), room.half(yy))); });
  const tryAt = s => {
    MX.font = fontOf(b.f, b.b, s);
    const lh = s * 1.18, max = Math.floor(2 * room.ey / lh);
    for (let n = Math.max(1, paras.length); n <= max; n++) {
      const lines = fillLines(paras, slots(n, lh));
      if (!lines) continue;
      if (lines.length < n) { const again = fillLines(paras, slots(lines.length, lh)); if (again && again.length === lines.length) return { s, lh, lines }; }
      return { s, lh, lines };
    }
    return null;
  };
  let out = null;
  if (txt) {
    let lo = 6, hi = Math.max(6, b.fs);
    out = tryAt(hi);
    if (!out) {
      out = tryAt(lo);
      if (out) { for (let i = 0; i < 9 && hi - lo > 0.5; i++) { const m = (lo + hi) / 2, r = tryAt(m); if (r) { lo = m; out = r; } else hi = m; } }
      else { MX.font = fontOf(b.f, b.b, lo); const lines = fillLines(paras, Array(400).fill(Math.max(20, 2 * room.half(0)))) || [txt]; out = { s: lo, lh: lo * 1.18, lines, over: true }; }
    }
  }
  L0 = out ? { ...out, dir: textDir(txt) } : { s: b.fs, lh: b.fs * 1.18, lines: [], dir: UI_DIR };
  if (LAY.size > 800) LAY.clear();
  LAY.set(key, L0);
  return L0;
}
/* a sound: its lines as big as the box allows (the box's shape stretches them a little, like hand lettering) */
function sfxLayout(it) {
  MX.font = fontOf(it.f, false, 100);
  const lines = (it.txt.trim() || ' ').split('\n'), mw = Math.max(1, ...lines.map(l => MX.measureText(l).width)), n = lines.length;
  const s = Math.max(4, Math.min(it.w * 0.86 * 100 / mw, it.h * 0.86 / (n * 1.02))), sx = clamp((it.w * 0.86) / (mw * s / 100), 0.7, 1.6);
  return { s, lines, lh: s * 1.02, sx, dir: textDir(it.txt) };
}

/* =========================================================
   what a page needs before it can be drawn: each panel's drawing as one picture (draw.js makes it), the pictures in
   it decoded, and its fonts. Kept for the pages near the one on screen
   ========================================================= */
const ART = new Map();   // a drawing's body -> { cv: its picture, cut to r (on the page), at: last use } or { job }
const IMGS = new Map();  // a picture's data URL -> an Image, decoded
const ART_PX = SMALL ? 14e6 : 48e6;
const pad = (b, k) => ({ x: b.x - b.w * k, y: b.y - b.h * k, w: b.w * (1 + 2 * k), h: b.h * (1 + 2 * k) });
const covers = (a, b) => a.x <= b.x + 0.5 && a.y <= b.y + 0.5 && a.x + a.w >= b.x + b.w - 0.5 && a.y + a.h >= b.y + b.h - 0.5;
function pageClip(r) { const x0 = clamp(Math.floor(r.x), 0, C.w), y0 = clamp(Math.floor(r.y), 0, C.h), x1 = clamp(Math.ceil(r.x + r.w), 0, C.w), y1 = clamp(Math.ceil(r.y + r.h), 0, C.h); return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) }; }
function artFree() {
  let px = 0;
  const list = [...ART.entries()].filter(([, e]) => e.cv).sort((a, b) => b[1].at - a[1].at);
  for (const [k, e] of list) { px += e.cv.width * e.cv.height; if (px > ART_PX) { freeCanvas(e.cv); ART.delete(k); } }
}
/* the picture of a panel's drawing, cut a little wider than the panel (so moving a cut a little needs no new one) */
function artLoad(art, box) {
  const e = ART.get(art);
  if (e && e.cv && covers(e.r, box)) { e.at = performance.now(); return Promise.resolve(e); }
  if (e && e.job && covers(e.want, box)) return e.job;
  const want = pageClip(pad(e && e.r ? { x: Math.min(e.r.x, box.x), y: Math.min(e.r.y, box.y), w: Math.max(e.r.x + e.r.w, box.x + box.w) - Math.min(e.r.x, box.x), h: Math.max(e.r.y + e.r.h, box.y + box.h) - Math.min(e.r.y, box.y) } : box, 0.12));
  const n = { want, job: null, cv: e && e.cv, r: e && e.r, at: performance.now() };
  n.job = (async () => {
    const cv = newCanvas(want.w, want.h), cx = cv.getContext('2d');
    cx.translate(-want.x, -want.y);
    try { await window.INK_DRAW.paint(cx, art, C.w, C.h); }
    catch (err) { console.warn(err); }
    if (ART.get(art) !== n) { freeCanvas(cv); return ART.get(art); }
    if (n.cv && n.cv !== cv) freeCanvas(n.cv);
    Object.assign(n, { cv, r: want, job: null, at: performance.now() });
    artFree();
    return n;
  })();
  ART.set(art, n);
  return n.job;
}
function imgLoad(src) {
  const e = IMGS.get(src);
  if (e) return e.job || Promise.resolve(e);
  const n = { im: null, job: null };
  n.job = loadImg(src).then(im => { n.im = im; n.job = null; return n; }).catch(() => { n.job = null; return n; });
  IMGS.set(src, n);
  if (IMGS.size > 80) IMGS.delete(IMGS.keys().next().value);
  return n.job;
}
/* the comic fonts the app doesn't load itself come from Google Fonts the first time a comic opens (and are kept for
   working offline by the service worker, as all its fonts are) */
let FONTS_ADDED = false;
function addFonts() {
  if (FONTS_ADDED) return;
  FONTS_ADDED = true;
  document.head.append(h('link', { rel: 'stylesheet', href: FONT_CSS }));
}
const FONT_DONE = new Set();
function fontsFor(pg) {
  const want = new Set();
  for (const it of pg.its) if (it.t === 'bub') want.add(fontOf(it.f, it.b, 40)); else if (it.t === 'sfx') want.add(fontOf(it.f, false, 40));
  const jobs = [...want].filter(f => !FONT_DONE.has(f)).map(f => Promise.race([document.fonts.load(f, 'אבגabc').then(() => FONT_DONE.add(f)), sleep(4000)]).catch(() => {}));
  return jobs.length ? Promise.all(jobs) : null;
}
/* everything the page needs, ready (for pictures and PDF; the editor draws what is ready and again when the rest is) */
async function prepare(pg) {
  const g = geom(pg), jobs = [];
  for (const p of g.panels) { const a = pg.pan[p.id] && pg.pan[p.id].art; if (a) jobs.push(artLoad(a, p.box)); }
  for (const it of pg.its) if (it.t === 'img') jobs.push(imgLoad(it.src));
  const f = fontsFor(pg);
  if (f) jobs.push(f);
  await Promise.all(jobs);
}

/* =========================================================
   drawing a page. o.skip: the panel being drawn in (draw.js shows its drawing itself), with o.layer 'under' (the page
   without that panel's drawing and what is above it) or 'over' (only what is above it, faint, and the rest of the page
   dimmed). o.editor: notes in empty panels. o.noText: the item whose words are being written (the box shows them).
   o.missing: called when something wasn't ready, so it can be drawn again
   ========================================================= */
const polyPath = P => { const p = new Path2D(); P.forEach((q, i) => i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)); p.closePath(); return p; };
const center = it => ({ x: it.x + it.w / 2, y: it.y + it.h / 2 });
function drawItem(cx, it, o) {
  cx.save();
  if (it.t === 'img') {
    const e = IMGS.get(it.src);
    if (e && e.im) cx.drawImage(e.im, it.x, it.y, it.w, it.h);
    else { imgLoad(it.src).then(() => o.missing && o.missing()); cx.fillStyle = 'rgba(128,128,128,.15)'; cx.fillRect(it.x, it.y, it.w, it.h); }
  } else if (it.t === 'bub') {
    const c = center(it), p = bubblePath(it);
    cx.translate(c.x, c.y);
    cx.lineJoin = 'round'; cx.lineCap = 'round';
    cx.fillStyle = it.fill; cx.fill(p);
    if (it.sw > 0) {
      if (it.k === 'whisper') cx.setLineDash([it.sw * 2.6, it.sw * 2]);
      cx.lineWidth = it.sw; cx.strokeStyle = it.sc; cx.stroke(p);
      cx.setLineDash([]);
    }
    if (o.noText !== it.id) {
      const L0 = layoutText(it);
      cx.fillStyle = it.fc; cx.font = fontOf(it.f, it.b, L0.s); cx.textAlign = 'center'; cx.textBaseline = 'middle';
      try { cx.direction = L0.dir; } catch {}
      L0.lines.forEach((t, j) => cx.fillText(t, 0, (j - (L0.lines.length - 1) / 2) * L0.lh));
    }
  } else if (it.t === 'sfx') {
    const c = center(it), L0 = sfxLayout(it);
    cx.translate(c.x, c.y); cx.rotate(it.r * Math.PI / 180); cx.transform(1, 0, Math.tan(it.sk * Math.PI / 180), 1, 0, 0); cx.scale(L0.sx, 1);
    if (o.noText !== it.id) {
      cx.font = fontOf(it.f, false, L0.s); cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineJoin = 'round';
      try { cx.direction = L0.dir; } catch {}
      const ys = L0.lines.map((_, j) => (j - (L0.lines.length - 1) / 2) * L0.lh), ow = it.ow * L0.s * 2;
      const pass = (dx, dy, fill, line) => L0.lines.forEach((t, j) => {
        if (ow > 0) { cx.lineWidth = ow; cx.strokeStyle = line; cx.strokeText(t, dx, ys[j] + dy); }
        cx.fillStyle = fill; cx.fillText(t, dx, ys[j] + dy);
      });
      if (it.sh > 0) { const d = it.sh * L0.s; pass(d * 0.7 / L0.sx, d, it.shc, it.shc); }
      pass(0, 0, it.fc, it.oc);
    }
  } else {
    // effects: speed lines turn around their middle; focus lines and dots are drawn from the box's corner
    if (it.t === 'speed') { const c = center(it); cx.translate(c.x, c.y); cx.rotate(it.r * Math.PI / 180); }
    else cx.translate(it.x, it.y);
    cx.fillStyle = it.col; cx.fill(fxPath(it));
  }
  cx.restore();
}
function drawArt(cx, art, p, o) {
  const e = ART.get(art);
  if (e && e.cv && covers(e.r, p.box)) { e.at = performance.now(); cx.drawImage(e.cv, e.r.x, e.r.y); return; }
  if (e && e.cv) cx.drawImage(e.cv, e.r.x, e.r.y);   // the old picture until the wider one is ready
  artLoad(art, p.box).then(() => o.missing && o.missing());
}
/* a note in a panel nobody drew in yet: what should be drawn there (only while editing) */
function drawNote(cx, txt, p) {
  const s = Math.max(16, Math.min(40 * unit(), p.box.w / 11)), lh = s * 1.3;
  cx.save();
  cx.font = fontOf('Assistant', false, s); cx.fillStyle = 'rgba(70,82,110,.78)'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  try { cx.direction = textDir(txt); } catch {}
  MX.font = cx.font;
  const lines = (fillLines(txt.split('\n'), Array(12).fill(p.box.w * 0.82)) || [txt]).slice(0, Math.floor(p.box.h * 0.8 / lh));
  const c = { x: p.box.x + p.box.w / 2, y: p.box.y + p.box.h / 2 };
  lines.forEach((t, j) => cx.fillText(t, c.x, c.y + (j - (lines.length - 1) / 2) * lh));
  cx.restore();
}
function drawPage(cx, pg, o = {}) {
  const g = geom(pg), u = o.layer;
  cx.save();
  if (u !== 'over') { cx.fillStyle = pg.bg; cx.fillRect(0, 0, C.w, C.h); }
  for (const p of g.panels) {
    if (!p.P) continue;
    const info = pg.pan[p.id] || {}, mine = o.skip === p.id, its = pg.its.filter(it => it.pn === p.id);
    if (u === 'over' && !mine) continue;
    cx.save(); cx.clip(polyPath(p.P));
    if (u !== 'over') {
      cx.fillStyle = info.bg || '#ffffff'; cx.fillRect(p.box.x - 2, p.box.y - 2, p.box.w + 4, p.box.h + 4);
      for (const it of its) if (it.t === 'img') drawItem(cx, it, o);
      for (const it of its) if (it.un && it.t !== 'img') drawItem(cx, it, o);
      if (info.art && !mine) drawArt(cx, info.art, p, o);
      else if (o.editor && info.nt && !mine && !its.some(it => it.t === 'img')) drawNote(cx, info.nt, p);
    }
    if (!mine || u === 'over') { if (u === 'over') cx.globalAlpha = 0.45; for (const it of its) if (!it.un && it.t !== 'img') drawItem(cx, it, o); }
    cx.restore();
  }
  if (u === 'over') {
    // around the panel being drawn in, the page is dimmed
    const p = g.panels.find(q => q.id === o.skip);
    if (p && p.P) { const d = new Path2D(); d.rect(0, 0, C.w, C.h); d.addPath(polyPath(p.P)); cx.fillStyle = 'rgba(30,34,46,.42)'; cx.fill(d, 'evenodd'); }
  }
  if (pg.bw > 0) {
    cx.lineWidth = pg.bw; cx.strokeStyle = pg.bc; cx.lineJoin = 'miter';
    for (const p of g.panels) if (p.P && (u === 'over' ? p.id === o.skip : u === 'under' ? p.id !== o.skip : true)) cx.stroke(polyPath(p.P));
  }
  if (u !== 'under') {
    if (u === 'over') cx.globalAlpha = 0.45;
    for (const it of pg.its) if (!it.pn) drawItem(cx, it, o);
    cx.globalAlpha = 1;
  }
  cx.restore();
}
/* a page as a picture: scale 1 is the page's own pixels */
async function pageCanvas(pg, scale = 1, o = {}) {
  await prepare(pg);
  const c = newCanvas(C.w * scale, C.h * scale), cx = c.getContext('2d');
  cx.imageSmoothingQuality = 'high';
  cx.scale(c.width / C.w, c.height / C.h);
  drawPage(cx, pg, o);
  return c;
}
const toBlob = (c, type = 'image/png', q = 0.92) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('blob')), type, q));

/* --- the small pictures of the pages: made a moment after a page changes, kept in the body (so the strip and the
   list never wait for the drawings), the first page's also as the list's picture --- */
const TH_W = 180;
let THUMB_PAGE = null;
const thumbSoon = debounce(() => thumbNow(), 900);
async function thumbNow(pg = C && C.pages[C.p]) {
  if (!C || !pg) return;
  const c0 = C, id = pg.id;
  THUMB_PAGE = id;
  const c = await pageCanvas(pg, TH_W / C.w).catch(() => null);
  if (!c) return;
  const th = c.toDataURL('image/jpeg', 0.72);
  freeCanvas(c);
  if (C !== c0) return;
  const now = C.pages.find(p => p.id === id);
  if (!now || now.th === th) return;
  now.th = th;   // not a step of its own: only a picture of what is there
  stripThumb(id, th);
  if (LOADED && S.cur === LOADED) { if (C.pages[0] && C.pages[0].id === id) LOADED.meta.thumb = th; markDirty(); }
}

/* =========================================================
   the look
   ========================================================= */
const CSS = `
#comicView{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;position:relative;background:var(--surface-3)}
.cm-body{flex:1;min-height:0;display:flex;position:relative}
.cm-strip{width:128px;flex:none;display:flex;flex-direction:column;border-inline-end:1px solid var(--line);background:var(--surface-2);min-height:0}
.cm-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:10px 8px;display:flex;flex-direction:column;gap:8px}
.cm-pg{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:5px;border:2px solid transparent;border-radius:9px;cursor:pointer;flex:none;outline:none}
.cm-pg:hover{background:var(--surface-3)}
.cm-pg.on{border-color:var(--accent);background:var(--accent-soft)}
.cm-pg:focus-visible{box-shadow:0 0 0 2px var(--accent)}
.cm-pg img,.cm-pg .ph{width:100%;display:block;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);border-radius:2px;pointer-events:none}
.cm-pg .n{font-size:11.5px;color:var(--text-2);font-weight:600}
.cm-pg .m{position:absolute;top:7px;inset-inline-end:7px;min-width:24px;height:24px;padding:0;background:var(--surface);border:1px solid var(--line);opacity:0}
.cm-pg:hover .m,.cm-pg.on .m{opacity:1}
.cm-pg.drag{opacity:.45}
.cm-pg.drop{box-shadow:0 -4px 0 -1px var(--accent)}
.cm-pg.drop.after{box-shadow:0 4px 0 -1px var(--accent)}
.cm-add{margin:6px 8px 10px;flex:none}
.cm-main{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;position:relative}
.cm-vp{flex:1;min-height:0;position:relative;overflow:hidden;touch-action:none;outline:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:default}
.cm-vp.c-move{cursor:move}.cm-vp.c-ns{cursor:ns-resize}.cm-vp.c-ew{cursor:ew-resize}.cm-vp.c-nwse{cursor:nwse-resize}.cm-vp.c-nesw{cursor:nesw-resize}
.cm-vp.c-grab{cursor:grab}.cm-vp.c-panning{cursor:grabbing}.cm-vp.c-pt{cursor:pointer}.cm-vp.c-cross{cursor:crosshair}
.cm-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.cm-ta{position:absolute;z-index:3;margin:0;border:1.5px dashed var(--accent);border-radius:6px;background:rgba(255,255,255,.9);outline:none;resize:none;overflow:hidden;text-align:center;padding:2px;box-sizing:border-box;color:#111;line-height:1.18;unicode-bidi:plaintext}
.cm-bar{position:absolute;bottom:10px;inset-inline-end:10px;display:flex;align-items:center;gap:2px;padding:3px;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow);z-index:4}
.cm-bar i{width:1px;height:20px;background:var(--line);margin:0 3px}
.cm-bar .cm-pgn{min-width:64px;font-variant-numeric:tabular-nums;text-align:center;direction:ltr;unicode-bidi:isolate}
.cm-hint{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:4;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:5px 14px;font-size:12.5px;color:var(--text-2);box-shadow:var(--shadow);pointer-events:none;white-space:nowrap;max-width:calc(100% - 20px);overflow:hidden;text-overflow:ellipsis}
.cm-side{width:268px;flex:none;overflow-y:auto;border-inline-start:1px solid var(--line);background:var(--surface);display:flex;flex-direction:column}
.cm-sh{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);font-weight:600;position:sticky;top:0;background:var(--surface);z-index:1}
.cm-sh .grow{flex:1}
.cm-sb{padding:10px 12px 40px;display:flex;flex-direction:column;gap:10px}
.cm-sb h5{margin:6px 0 0;font-size:12px;color:var(--text-3);font-weight:600}
.cm-f{display:flex;align-items:center;gap:8px;font-size:13px}
.cm-f>span:first-child{flex:none;min-width:84px;color:var(--text-2)}
.cm-f input[type=range]{flex:1;min-width:0;accent-color:var(--accent)}
.cm-f b{min-width:38px;text-align:end;font-weight:500;font-size:12px;color:var(--text-2);font-variant-numeric:tabular-nums}
.cm-f .sel{flex:1;min-width:0;direction:ltr;text-align:left}
.cm-f input[type=color]{width:38px;height:28px;padding:1px;border:1px solid var(--line);border-radius:6px;background:var(--surface)}
.cm-f input[type=checkbox]{width:17px;height:17px;accent-color:var(--accent)}
.cm-txt{width:100%;min-height:76px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2);padding:8px 10px;color:var(--text);font:inherit;font-size:14px;resize:vertical;unicode-bidi:plaintext}
.cm-kinds{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}
.cm-kinds .rb{height:46px;padding:2px}
.cm-kinds .rb.on{background:var(--accent-soft);border-color:var(--accent)}
.cm-btns{display:flex;flex-wrap:wrap;gap:6px}
.cm-btns .btn{flex:1 1 auto}
.cm-ic{display:inline-flex;width:30px;height:26px;align-items:center;justify-content:center}
.cm-ic svg{width:100%;height:100%;overflow:visible}
.rb .cm-ic{color:var(--text)}
.rb.big .cm-ic{width:34px;height:28px}
.cm-col{display:flex;flex-direction:column;gap:1px;align-items:stretch}
.cm-col .rb{justify-content:flex-start}
.cm-rsl{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2);height:22px}
.cm-rsl span{min-width:66px}
.cm-rsl input{width:92px;accent-color:var(--accent)}
.cm-clr{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2);height:28px}
.cm-clr input{width:34px;height:24px;padding:1px;border:1px solid var(--line);border-radius:6px;background:var(--surface)}
.cm-gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px;max-height:min(62vh,520px);overflow:auto;padding:2px}
.cm-gal h6{grid-column:1/-1;margin:6px 0 0;font-size:12px;color:var(--text-3)}
.cm-newgal .cm-gal{max-height:min(30vh,260px);border:1px solid var(--line);border-radius:10px;padding:8px;grid-template-columns:repeat(auto-fill,minmax(54px,1fr))}
.cm-lay{border:1px solid var(--line);border-radius:8px;background:var(--surface);padding:5px;cursor:pointer}
.cm-lay:hover{border-color:var(--accent)}
.cm-lay.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}
.cm-lay svg{display:block;width:100%;height:auto}
.cm-pop{padding:10px;width:min(420px,92vw)}
.cm-sizes{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
.cm-size,.cm-dirb{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border:1.5px solid var(--line);border-radius:10px;background:var(--surface);cursor:pointer;text-align:center;font-size:12px;color:var(--text-2)}
.cm-size b,.cm-dirb b{font-size:13px;color:var(--text)}
.cm-size i{display:block;background:#fff;border:1.5px solid var(--text-3);border-radius:2px}
.cm-size[aria-checked=true],.cm-dirb[aria-checked=true]{border-color:var(--accent);background:var(--accent-soft)}
.cm-dirs{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cm-dirb .ms{font-size:28px;color:var(--text)}
.cm-h4{font-weight:600;margin:14px 0 8px;font-size:13.5px}
.cm-h4:first-child{margin-top:0}
.cm-go{display:flex;align-items:center;gap:8px;margin-top:16px}
.cm-go .grow{flex:1}
.cm-wait{position:absolute;inset:0;display:grid;place-items:center;color:var(--text-2)}
.cm-verpages{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.cm-verpages img{width:100%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2)}
/* the reader */
.cm-read{position:fixed;inset:0;z-index:300;background:#0d0f14;color:#fff;outline:none;touch-action:none;user-select:none;-webkit-user-select:none;overflow:hidden}
.cm-rst{position:absolute;inset:0;overflow:hidden}
.cm-rw{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.cm-rw.anim{transition:transform .5s cubic-bezier(.22,.7,.2,1)}
.cm-rw img{display:block;width:100%;height:100%;box-shadow:0 4px 30px rgba(0,0,0,.5);background:#fff}
.cm-rw svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;transition:opacity .35s}
.cm-rbar{position:absolute;top:0;inset-inline:0;display:flex;align-items:center;gap:8px;padding:10px 12px;background:linear-gradient(rgba(0,0,0,.7),rgba(0,0,0,0));transition:opacity .25s;z-index:2}
.cm-rbar.off{opacity:0;pointer-events:none}
.cm-rbar .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.cm-rbar button{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:9px;height:36px;min-width:36px;padding:0 10px;display:inline-flex;align-items:center;gap:6px;font-size:13px}
.cm-rbar button.on{background:#fff;color:#111}
.cm-rbar .cm-rn{font-variant-numeric:tabular-nums;font-size:13px;opacity:.85;white-space:nowrap}
.cm-rnav{position:absolute;top:50%;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;border:0;background:rgba(255,255,255,.12);color:#fff;display:grid;place-items:center;z-index:2;transition:opacity .25s}
.cm-rnav.off{opacity:0;pointer-events:none}
.cm-rnav.l{left:12px}.cm-rnav.r{right:12px}
.cm-rnav .ms{font-size:30px}
.cm-rend{position:absolute;inset:0;display:grid;place-items:center;text-align:center;z-index:1;pointer-events:none}
.cm-rend>div{background:rgba(255,255,255,.1);border-radius:16px;padding:20px 26px;font-size:15px}
#comicPrint{display:none}
@media print{
  html.comic-print #app{display:none!important}
  html.comic-print #comicPrint{display:block}
  html.comic-print #comicPrint img{display:block;width:100%;height:auto;break-after:page;page-break-after:always}
}
@media (max-width:700px){
  .cm-body{flex-direction:column}
  .cm-strip{order:2;width:auto;flex-direction:row;border-inline-end:0;border-top:1px solid var(--line);height:96px}
  .cm-list{flex-direction:row;overflow-x:auto;overflow-y:hidden;padding:6px}
  .cm-pg{width:58px;padding:3px}
  .cm-pg .m{display:none}
  .cm-add{margin:6px;align-self:center;height:auto;padding:0 8px}
  .cm-side{position:absolute;inset-inline:0;bottom:0;width:auto;max-height:52%;z-index:6;border-inline-start:0;border-top:1px solid var(--line);border-radius:14px 14px 0 0;box-shadow:var(--pop)}
  .cm-bar{bottom:8px;inset-inline-end:8px}
  .cm-rnav{display:none}
}
`;

/* =========================================================
   the ribbon
   ========================================================= */
const rbtn = (cmd, ic, label, o = {}) => h('button', { class: 'rb' + (o.big ? ' big' : '') + (o.cls ? ' ' + o.cls : ''), type: 'button', 'data-cmd': cmd, 'data-arg': o.arg, title: o.title || label, 'aria-label': label },
  ic ? (typeof ic === 'string' ? icon(ic, o.flip ? 'flip' : null) : ic) : null, o.big || o.text ? h('span', { text: o.text || label }) : null);
const group = (name, cls, ...kids) => h('div', { class: 'grp' }, h('div', { class: 'gb' + (cls ? ' ' + cls : '') }, kids), h('div', { class: 'gn', text: name }));
function svgIcon(inner, vb = '-60 -45 120 90') { const s = h('span', { class: 'cm-ic', 'aria-hidden': 'true' }); s.innerHTML = `<svg viewBox="${vb}">${inner}</svg>`; return s; }
const bubIcon = k => svgIcon(`<path d="${bubbleD({ id: 'icon' + k, k, x: -46, y: -34, w: 92, h: 56, tl: true, tx: -20, ty: 42, sw: 6 })}" fill="${k === 'box' ? '#fff3b8' : '#fff'}" stroke="currentColor" stroke-width="6"${k === 'whisper' ? ' stroke-dasharray="10 8"' : ''} stroke-linejoin="round"/>`);
const fxIcon = t => {
  if (t === 'sfx') return svgIcon(`<path d="${burstD(40, 30, null, 7)}" fill="#ffd23f" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><text x="0" y="14" text-anchor="middle" font-size="40" font-weight="900" fill="currentColor" font-family="Rubik,sans-serif">!</text>`);
  if (t === 'speed') return svgIcon(`<path d="${speedD({ id: 'icon', n: 11, w: 110, h: 76, lw: 9, len: 0.95 })}" fill="currentColor"/>`);
  if (t === 'focus') return svgIcon(`<path d="${focusD({ id: 'icon', n: 26, w: 110, h: 84, lw: 9, ix: 0.5, iy: 0.5, cx: 0, cy: 0 })}" fill="currentColor" transform="translate(-55 -42)"/>`);
  return svgIcon(`<path d="${toneD({ w: 100, h: 76, sp: 14, ds: 0.85, ang: 45, sh: 'ellipse', gr: true, gd: 0 })}" fill="currentColor" transform="translate(-50 -38)"/>`);
};
const rsl = (label, key, min, max) => h('label', { class: 'cm-rsl', title: label }, h('span', { text: label }), h('input', { type: 'range', min: String(min), max: String(max), 'data-pg': key, 'aria-label': label }));
const rclr = (label, key) => h('label', { class: 'cm-clr', title: label }, h('input', { type: 'color', 'data-pg': key, 'aria-label': label }), h('span', { text: label }));
function ribbonPanels() {
  const undoGrp = () => group(T('ביטול@undo'), 'col', rbtn('cmUndo', 'undo', T('ביטול (Ctrl+Z)'), { flip: true }), rbtn('cmRedo', 'redo', T('חזרה (Ctrl+Y)'), { flip: true }));
  V.home = h('div', { class: 'panel comic-only', 'data-panel': 'cmhome', hidden: true },
    undoGrp(),
    group(T('דפים'), '', rbtn('cmPageAdd', 'note_add', T('דף חדש'), { big: true, title: T('דף חדש אחרי הדף הזה, באותה חלוקה') }),
      h('div', { class: 'cm-col' }, rbtn('cmPageDup', 'content_copy', T('שכפול הדף'), { text: T('שכפול'), cls: 'txt' }), rbtn('cmPageDel', 'delete', T('מחיקת הדף'), { text: T('מחיקה'), cls: 'txt' }))),
    group(T('משבצות@panels'), '', rbtn('cmLayout', 'view_quilt', T('חלוקה'), { big: true, title: T('איך הדף מחולק למשבצות: רשת, שורות, או משבצות באלכסון כמו במנגה') }),
      h('div', { class: 'cm-col' }, rbtn('cmSplit', 'splitscreen', T('חיתוך המשבצת לרוחב'), { arg: 'h', text: T('לרוחב@cut'), cls: 'txt', title: T('המשבצת נחתכת לשתיים, אחת מעל השנייה') }),
        rbtn('cmSplit', 'vertical_split', T('חיתוך המשבצת לאורך'), { arg: 'v', text: T('לאורך@cut'), cls: 'txt', title: T('המשבצת נחתכת לשתיים, זו ליד זו') }),
        rbtn('cmMerge', 'cell_merge', T('מחיקת המשבצת'), { text: T('מחיקה'), cls: 'txt', title: T('המשבצת נעלמת, והמשבצת שלידה גדלה למקומה') }))),
    group(T('ציור'), '', rbtn('cmDraw', 'brush', T('ציור במשבצת'), { big: true, title: T('ציור בתוך המשבצת עם כל כלי הציור: מברשות, שכבות, צבעים ולחץ של עט. אפשר גם ללחוץ פעמיים על המשבצת') }),
      rbtn('cmImage', 'add_photo_alternate', T('תמונה'), { big: true, title: T('תמונה בתוך המשבצת. היא נחתכת לפי המשבצת') })),
    group(T('בלונים'), '', BUBS.map(([k, n, d]) => rbtn('cmBub', bubIcon(k), T(n), { big: true, arg: k, title: T(d) }))),
    group(T('קריאה'), '', rbtn('cmRead', 'auto_stories', T('קריאה'), { big: true, title: T('קריאת הקומיקס במסך מלא, דף אחרי דף או משבצת אחרי משבצת (F5)') })));
  V.fxP = h('div', { class: 'panel comic-only', 'data-panel': 'cmfx', hidden: true },
    undoGrp(),
    group(T('צליל'), '', rbtn('cmAdd', fxIcon('sfx'), T('מילת צליל'), { big: true, arg: 'sfx', title: T('מילה גדולה של צליל, כמו "בום!" או "טראח!"') })),
    group(T('קווים'), '', rbtn('cmAdd', fxIcon('speed'), T('קווי מהירות'), { big: true, arg: 'speed', title: T('קווים שמראים תנועה מהירה') }),
      rbtn('cmAdd', fxIcon('focus'), T('קווי ריכוז'), { big: true, arg: 'focus', title: T('קווים מהשוליים אל נקודה, כמו במנגה: הפתעה, מתח או משהו חשוב') })),
    group(T('צל'), '', rbtn('cmAdd', fxIcon('tone'), T('נקודות צל'), { big: true, arg: 'tone', title: T('נקודות של מנגה, לצל ולגוון') })),
    group(T('סידור'), 'col', rbtn('cmOrder', 'flip_to_front', T('הבאה קדימה'), { arg: 'up', text: T('קדימה'), cls: 'txt' }), rbtn('cmOrder', 'flip_to_back', T('שליחה אחורה'), { arg: 'down', text: T('אחורה'), cls: 'txt' })),
    group(T('מה שבחרת'), 'col', rbtn('cmDup', 'content_copy', T('שכפול (Ctrl+D)'), { text: T('שכפול'), cls: 'txt' }), rbtn('cmDel', 'delete', T('מחיקה (Delete)'), { text: T('מחיקה'), cls: 'txt' })));
  V.pageP = h('div', { class: 'panel comic-only', 'data-panel': 'cmpage', hidden: true },
    group(T('משבצות@panels'), '', rbtn('cmLayout', 'view_quilt', T('חלוקה'), { big: true, title: T('איך הדף מחולק למשבצות: רשת, שורות, או משבצות באלכסון כמו במנגה') })),
    group(T('רווחים'), 'col', rsl(T('בין משבצות'), 'gut', 0, 120), rsl(T('שוליים'), 'mar', 0, 200), rsl(T('מסגרת'), 'bw', 0, 24)),
    group(T('צבעים'), 'col', rclr(T('צבע המסגרות'), 'bc'), rclr(T('צבע הדף'), 'bg')),
    group(T('כיוון קריאה'), '', rbtn('cmDir', 'format_textdirection_r_to_l', T('מימין לשמאל'), { big: true, arg: 'rtl', title: T('מנגה וקומיקס בעברית: קוראים מימין לשמאל, והדף הבא בצד שמאל') }),
      rbtn('cmDir', 'format_textdirection_l_to_r', T('משמאל לימין'), { big: true, arg: 'ltr', title: T('קומיקס באנגלית: קוראים משמאל לימין, והדף הבא בצד ימין') })),
    group(T('תצוגה@view'), '', rbtn('cmNotes', 'visibility', T('הערות לציור'), { big: true, title: T('מה צריך לצייר בכל משבצת, למשל מה שקלוד כתב. ההערות לא מודפסות') })),
    group(T('שמירה כקובץ'), '', rbtn('exportAs', 'picture_as_pdf', 'PDF', { big: true, arg: 'pdf', title: T('כל הקומיקס כקובץ PDF, דף אחרי דף') }),
      rbtn('cmPng', 'image', T('תמונות'), { big: true, title: T('כל דף כתמונת PNG') })));
  // the page's sliders and colors change it as they move, as one step that can be undone
  V.pageP.addEventListener('input', e => {
    const k = e.target.dataset.pg, pg = C && page();
    if (!k || !pg) return;
    liveStep(() => { if (k === 'bc' || k === 'bg') pg[k] = col(e.target.value, pg[k]); else pg[k] = Math.round(+e.target.value * unit()); });
  });
  V.pageP.addEventListener('change', e => { if (e.target.dataset.pg) { liveEnd(); e.target.blur(); } });
  return [V.home, V.fxP, V.pageP];
}
/* the ribbon shows the comic as it is now */
function ribbonUI() {
  if (!V.pageP || !C) return;
  const pg = page(), u = unit();
  for (const el of V.pageP.querySelectorAll('[data-pg]')) {
    const k = el.dataset.pg;
    el.value = k === 'bc' || k === 'bg' ? pg[k] : String(Math.round(pg[k] / u));
  }
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmDir"]')) b.classList.toggle('on', b.dataset.arg === C.dir);
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmNotes"]')) b.classList.toggle('on', cprefs().notes !== false);
  const it = selItem(), pan = selPanel() || (!it && geom(pg).panels.length);
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmOrder"],#ribbon [data-cmd="cmDup"],#ribbon [data-cmd="cmDel"]')) b.disabled = !it;
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmPageDel"]')) b.disabled = C.pages.length <= 1;
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmMerge"]')) b.disabled = !selPanel() || geom(pg).panels.length <= 1;
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmSplit"]')) b.disabled = !pan;
  undoUI();
}

/* =========================================================
   the view: the page on a canvas the size of the window, zoomed and moved by its own numbers
   ========================================================= */
const V = {};   // the elements
const VIEW = { z: 1, x: 0, y: 0 };
let NEED_FIT = true, PAINT = 0;
let SEL = null;     // what is chosen: { k: 'item' | 'panel', id }
let HOVER = null;   // what the mouse is over: { k: 'panel', id } or { k: 'cut', path, end }
let EDIT = null;    // the words being written in a bubble or a sound: { id, before }
let DRAWING = null; // the panel being drawn in: { pid, pgId, pre, before, host }
let LIVE = null;    // the comic before a slider or a text box started changing it
const page = () => C.pages[C.p];
const findItem = id => C && page().its.find(it => it.id === id);
const selItem = () => SEL && SEL.k === 'item' ? findItem(SEL.id) : null;
const selPanel = () => SEL && SEL.k === 'panel' && geom(page()).panels.some(p => p.id === SEL.id) ? SEL.id : null;
const selected = () => !!(selItem() || selPanel());
const vpRect = () => V.vp.getBoundingClientRect();
const viewPt = e => { const r = vpRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
const toPage = s => ({ x: (s.x - VIEW.x) / VIEW.z, y: (s.y - VIEW.y) / VIEW.z });
const toScreen = (x, y) => ({ x: VIEW.x + x * VIEW.z, y: VIEW.y + y * VIEW.z });
function liveStep(fn) { if (!C) return; if (!LIVE) LIVE = snap(); fn(); paint(); }
function liveEnd() { if (!LIVE) return; push(LIVE); LIVE = null; changed(); ribbonUI(); }
function fit() {
  if (!C || !V.vp) return;
  const r = vpRect();
  if (r.width < 20 || r.height < 20) { NEED_FIT = true; return; }
  NEED_FIT = false;
  const pad = r.width < 500 ? 10 : 28, bar = V.bar ? V.bar.offsetHeight + 16 : 0;   // the bar at the bottom stays off the page
  VIEW.z = clamp(Math.min((r.width - 2 * pad) / C.w, (r.height - pad - Math.max(pad, bar)) / C.h), 0.03, 12);
  VIEW.x = (r.width - C.w * VIEW.z) / 2; VIEW.y = pad + (r.height - pad - Math.max(pad, bar) - C.h * VIEW.z) / 2;
  viewChanged();
}
function keepInView() {
  const r = vpRect(), m = 60, pw = C.w * VIEW.z, ph = C.h * VIEW.z;
  VIEW.x = clamp(VIEW.x, Math.min(m - pw, (r.width - pw) / 2), Math.max(r.width - m, (r.width - pw) / 2));
  VIEW.y = clamp(VIEW.y, Math.min(m - ph, (r.height - ph) / 2), Math.max(r.height - m, (r.height - ph) / 2));
}
function zoomAt(z, sx, sy) {
  z = clamp(z, 0.03, 12);
  const px = (sx - VIEW.x) / VIEW.z, py = (sy - VIEW.y) / VIEW.z;
  VIEW.z = z; VIEW.x = sx - px * z; VIEW.y = sy - py * z;
  keepInView(); viewChanged();
}
const zoomBy = k => { const r = vpRect(); zoomAt(VIEW.z * k, r.width / 2, r.height / 2); };
function viewChanged() { if (V.zp) V.zp.textContent = Math.round(VIEW.z * 100) + '%'; placeText(); paint(); }
function onWheel(e) {
  if (!C || DRAWING) return;
  e.preventDefault();
  const p = viewPt(e), k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1, dx = e.deltaX * k, dy = e.deltaY * k;
  if (e.ctrlKey || e.metaKey) { zoomAt(VIEW.z * Math.exp(-dy * 0.0025), p.x, p.y); return; }
  if (e.shiftKey) { VIEW.x -= dy || dx; } else { VIEW.x -= dx; VIEW.y -= dy; }
  keepInView(); viewChanged();
}
const paint = () => { if (!PAINT && V.cv) PAINT = requestAnimationFrame(render); };
function render() {
  if (PAINT) cancelAnimationFrame(PAINT);
  PAINT = 0;
  if (!C || !V.cv || DRAWING) return;
  const r = vpRect(), dpr = Math.min(window.devicePixelRatio || 1, 2.5), W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (V.cv.width !== W || V.cv.height !== H) { V.cv.width = W; V.cv.height = H; }
  const cx = V.cx;
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, W, H);
  cx.setTransform(dpr * VIEW.z, 0, 0, dpr * VIEW.z, dpr * VIEW.x, dpr * VIEW.y);
  cx.save(); cx.shadowColor = 'rgba(0,0,0,.22)'; cx.shadowBlur = 16 * dpr; cx.shadowOffsetY = 3 * dpr; cx.fillStyle = '#fff'; cx.fillRect(0, 0, C.w, C.h); cx.restore();
  cx.save(); cx.beginPath(); cx.rect(0, 0, C.w, C.h); cx.clip();
  cx.imageSmoothingQuality = 'high';
  drawPage(cx, page(), { editor: cprefs().notes !== false, noText: EDIT && EDIT.id, missing: paint });
  cx.restore();
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  overlay(cx);
}
/* --- what is drawn over the page, in screen pixels: the panels' numbers, what is chosen and its handles --- */
const ACC = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2743d8';
function screenPoly(cx, P) { cx.beginPath(); P.forEach((q, i) => { const s = toScreen(q.x, q.y); if (i) cx.lineTo(s.x, s.y); else cx.moveTo(s.x, s.y); }); cx.closePath(); }
function overlay(cx) {
  const pg = page(), g = geom(pg), acc = ACC(), z = VIEW.z;
  cx.save();
  cx.lineJoin = 'round';
  // the order the panels are read in
  const nr = clamp(10 * Math.sqrt(z * 2), 8, 12);
  g.panels.forEach((p, i) => {
    if (!p.P) return;
    // in the panel's own corner on the side it is read from (a slanted panel's box corner can be outside it)
    const want = { x: C.dir === 'rtl' ? p.box.x + p.box.w : p.box.x, y: p.box.y }, v = p.P.reduce((b, q) => Math.hypot(q.x - want.x, q.y - want.y) < Math.hypot(b.x - want.x, b.y - want.y) ? q : b);
    const vs = toScreen(v.x, v.y), cs = toScreen(p.box.x + p.box.w / 2, p.box.y + p.box.h / 2), dl = Math.hypot(cs.x - vs.x, cs.y - vs.y) || 1, k = Math.min(nr * 2.1, dl * 0.5);
    const x = vs.x + (cs.x - vs.x) / dl * k, y = vs.y + (cs.y - vs.y) / dl * k;
    cx.globalAlpha = 0.78; cx.fillStyle = selPanel() === p.id ? acc : 'rgba(40,46,60,.62)';
    cx.beginPath(); cx.arc(x, y, nr, 0, Math.PI * 2); cx.fill();
    cx.globalAlpha = 1; cx.fillStyle = '#fff'; cx.font = `600 ${Math.round(nr * 1.15)}px system-ui,sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(String(i + 1), x, y + 0.5);
  });
  const hp = HOVER && HOVER.k === 'panel' && HOVER.id !== selPanel() && g.panels.find(p => p.id === HOVER.id);
  if (hp && hp.P) { screenPoly(cx, hp.P); cx.setLineDash([6, 5]); cx.lineWidth = 1.5; cx.strokeStyle = acc; cx.stroke(); cx.setLineDash([]); }
  const sp = selPanel() && g.panels.find(p => p.id === selPanel());
  if (sp && sp.P) { screenPoly(cx, sp.P); cx.lineWidth = 3; cx.strokeStyle = acc; cx.stroke(); }
  // a cut the mouse is on: the white between the panels lights up, with its two ends for leaning it
  const hc = HOVER && HOVER.k === 'cut' ? g.cuts.find(c => c.path.join() === HOVER.path.join()) : ACT && ACT.k === 'cut' ? g.cuts.find(c => c.path.join() === ACT.path.join()) : null;
  if (hc && hc.seg) {
    const [a, b] = hc.seg.map(q => toScreen(q.x, q.y));
    cx.lineCap = 'round'; cx.strokeStyle = acc; cx.globalAlpha = 0.35; cx.lineWidth = Math.max(6, pg.gut * z);
    cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke(); cx.globalAlpha = 1;
    for (const q of [a, b]) { cx.beginPath(); cx.arc(q.x, q.y, 6.5, 0, Math.PI * 2); cx.fillStyle = '#fff'; cx.fill(); cx.lineWidth = 2; cx.strokeStyle = acc; cx.stroke(); }
  }
  const it = selItem();
  if (it) {
    const corners = boxCorners(it).map(q => toScreen(q.x, q.y));
    cx.beginPath(); corners.forEach((q, i) => i ? cx.lineTo(q.x, q.y) : cx.moveTo(q.x, q.y)); cx.closePath();
    cx.lineWidth = 1.5; cx.strokeStyle = acc; cx.setLineDash([5, 4]); cx.stroke(); cx.setLineDash([]);
    if (it.t === 'bub' && layoutText(it).over) { cx.strokeStyle = '#d93025'; cx.lineWidth = 2.5; cx.stroke(); }
    for (const hd of handlesOf(it)) {
      const s = toScreen(hd.x, hd.y);
      if (hd.k === 'rot') { const top = toScreen(hd.bx, hd.by); cx.beginPath(); cx.moveTo(top.x, top.y); cx.lineTo(s.x, s.y); cx.lineWidth = 1.5; cx.strokeStyle = acc; cx.stroke(); }
      cx.beginPath();
      if (hd.k === 'tail' || hd.k === 'fc' || hd.k === 'rot') cx.arc(s.x, s.y, 7.5, 0, Math.PI * 2); else cx.rect(s.x - 5.5, s.y - 5.5, 11, 11);
      cx.fillStyle = hd.k === 'tail' ? acc : '#fff'; cx.fill(); cx.lineWidth = 2; cx.strokeStyle = hd.k === 'tail' ? '#fff' : acc; cx.stroke();
    }
  }
  cx.restore();
}

/* =========================================================
   choosing and moving: a mouse, a pen or a finger. Words (bubbles, sounds) are on top; then the white between the panels
   (dragging it makes panels bigger or smaller, its ends lean it); then effects and pictures, then the panel itself:
   pressing again in the same place goes one deeper. Pressing twice writes in a bubble or draws in a panel.
   Two fingers, the middle button or Space with the mouse move and zoom
   ========================================================= */
let ACT = null;
const PTR = new Map();
let SPACE = false, LASTUP = null, LASTHIT = null;
const HCX = newCanvas(1, 1).getContext('2d');
const rot = (x, y, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return { x: x * c - y * s, y: x * s + y * c }; };
const turns = it => it.t === 'sfx' || it.t === 'speed';
/* a point on the page in the item's own frame: from its middle, before it was turned */
function local(it, p) { const c = center(it); return turns(it) ? rot(p.x - c.x, p.y - c.y, -it.r) : { x: p.x - c.x, y: p.y - c.y }; }
function boxCorners(it) {
  const c = center(it), a = turns(it) ? it.r : 0;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => { const q = rot(sx * it.w / 2, sy * it.h / 2, a); return { x: c.x + q.x, y: c.y + q.y }; });
}
function handlesOf(it) {
  const c = center(it), a = turns(it) ? it.r : 0, out = [];
  const at = (lx, ly) => { const q = rot(lx, ly, a); return { x: c.x + q.x, y: c.y + q.y }; };
  const big = it.w * VIEW.z > 36 && it.h * VIEW.z > 36;
  for (const [k, sx, sy] of [['nw', -1, -1], ['ne', 1, -1], ['se', 1, 1], ['sw', -1, 1], ['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]]) {
    if (!big && sx && sy === 0) continue;
    if (!big && sy && sx === 0) continue;
    out.push({ k, ...at(sx * it.w / 2, sy * it.h / 2) });
  }
  if (turns(it)) { const top = at(0, -it.h / 2), q = at(0, -it.h / 2 - 30 / VIEW.z); out.push({ k: 'rot', x: q.x, y: q.y, bx: top.x, by: top.y }); }
  if (it.t === 'bub' && it.k !== 'box' && it.tl) out.push({ k: 'tail', x: it.tx, y: it.ty });
  if (it.t === 'focus') out.push({ k: 'fc', x: it.x + it.w / 2 + it.cx * it.w, y: it.y + it.h / 2 + it.cy * it.h });
  return out;
}
function itemHit(it, p, g) {
  if (it.pn) { const pan = g.panels.find(q => q.id === it.pn); if (!pan || !pan.P || !inPoly(pan.P, p)) return false; }
  const q = local(it, p);
  if (Math.abs(q.x) <= it.w / 2 && Math.abs(q.y) <= it.h / 2) return true;
  return it.t === 'bub' && HCX.isPointInPath(bubblePath(it), q.x, q.y);
}
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function cutAt(p, g, tol) {
  let best = null;
  for (const c of g.cuts) {
    if (!c.seg) continue;
    const d = segDist(p, c.seg[0], c.seg[1]);
    if (d <= Math.max(tol, page().gut / 2 + 2 / VIEW.z) && (!best || d < best.d)) {
      const ea = Math.hypot(p.x - c.seg[0].x, p.y - c.seg[0].y), eb = Math.hypot(p.x - c.seg[1].x, p.y - c.seg[1].y), near = tol * 1.7;
      best = { k: 'cut', d, path: c.path, end: ea <= near ? 'a' : eb <= near ? 'b' : 'mid', cut: c };
    }
  }
  return best;
}
function hitAt(p, touch) {
  const pg = page(), g = geom(pg), tol = (touch ? 18 : 9) / VIEW.z, it = selItem();
  if (it) for (const hd of handlesOf(it)) if (Math.hypot(p.x - hd.x, p.y - hd.y) <= tol) return { k: 'handle', it, hd };
  const top = [...pg.its.filter(x => x.pn), ...pg.its.filter(x => !x.pn)].reverse();
  for (const x of top) if ((x.t === 'bub' || x.t === 'sfx') && itemHit(x, p, g)) return { k: 'item', it: x };
  const cut = cutAt(p, g, tol);
  if (cut) return cut;
  const list = top.filter(x => x.t !== 'bub' && x.t !== 'sfx' && itemHit(x, p, g)).map(x => ({ k: 'item', it: x }));
  const pan = g.panels.find(q => q.P && inPoly(q.P, p));
  if (pan) list.push({ k: 'panel', id: pan.id });
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  // pressing again in the same place: the next one down
  const i = list.findIndex(e => (e.k === 'item' && SEL && SEL.k === 'item' && SEL.id === e.it.id) || (e.k === 'panel' && SEL && SEL.k === 'panel' && SEL.id === e.id));
  const again = LASTHIT && Math.hypot(LASTHIT.x - p.x, LASTHIT.y - p.y) * VIEW.z < 6;
  return list[again && i >= 0 ? (i + 1) % list.length : 0];
}
function select(s) {
  const was = JSON.stringify(SEL);
  SEL = s;
  if (JSON.stringify(SEL) !== was) { sideUI(); ribbonUI(); }
  paint();
}
const cursorFor = hit => !hit ? '' : hit.k === 'handle' ? ({ tail: 'cross', fc: 'cross', rot: 'grab', n: 'ns', s: 'ns', e: 'ew', w: 'ew', nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw' })[hit.hd.k] || 'move'
  : hit.k === 'item' ? 'move' : hit.k === 'cut' ? (hit.end !== 'mid' ? 'cross' : hit.cut.n.d === 'h' ? 'ns' : 'ew') : hit.k === 'panel' ? 'pt' : '';
function setCursor(k) { V.vp.className = 'cm-vp' + (k ? ' c-' + k : ''); }
function onDown(e) {
  if (!C || DRAWING) return;
  if (EDIT && e.target === V.ta) return;
  const sp = viewPt(e), p = toPage(sp), touch = e.pointerType === 'touch';
  PTR.set(e.pointerId, { ...sp, t: e.pointerType });
  try { V.vp.setPointerCapture(e.pointerId); } catch {}
  if (touch) {
    const touches = [...PTR.entries()].filter(([, q]) => q.t === 'touch');
    if (touches.length >= 2) { endAct(true); startPinch(touches); return; }
  }
  if (ACT) return;
  if (EDIT) commitText();
  if (e.button === 1 || (e.button === 0 && SPACE)) { e.preventDefault(); startPan(e.pointerId, sp); return; }
  if (e.button !== 0) return;
  e.preventDefault();
  V.vp.focus({ preventScroll: true });
  const dbl = LASTUP && performance.now() - LASTUP.t < 420 && Math.hypot(LASTUP.x - sp.x, LASTUP.y - sp.y) < (touch ? 24 : 8);
  const hit = hitAt(p, touch);
  LASTHIT = p;
  if (dbl && hit) {
    LASTUP = null;
    const it = hit.k === 'item' ? hit.it : hit.k === 'handle' ? hit.it : null;
    if (it && (it.t === 'bub' || it.t === 'sfx')) { startText(it); return; }
    const g = geom(page()), pan = it && it.pn ? it.pn : hit.k === 'panel' ? hit.id : (g.panels.find(q => q.P && inPoly(q.P, p)) || {}).id;
    if (pan) { drawPanel(pan); return; }
  }
  const base = { id: e.pointerId, s0: sp, p0: p, moved: false, touch, pre: null };
  if (!hit) { select(null); ACT = { ...base, k: 'pan', v: { ...VIEW } }; return; }
  if (hit.k === 'handle') { ACT = { ...base, k: 'handle', hd: hit.hd.k, iid: hit.it.id, it0: clone(hit.it) }; return; }
  if (hit.k === 'item') { select({ k: 'item', id: hit.it.id }); ACT = { ...base, k: 'move', iid: hit.it.id, it0: clone(hit.it) }; return; }
  if (hit.k === 'cut') { const n = nodeAt(page().lay, hit.path); ACT = { ...base, k: 'cut', path: hit.path, end: hit.end, n0: { a: n.a, b: n.b }, bb: hit.cut.bb, d: n.d }; paint(); return; }
  select({ k: 'panel', id: hit.id });
  ACT = { ...base, k: 'pan', v: { ...VIEW }, soft: true };   // dragging on a panel moves the page around
}
function onMove(e) {
  if (!C || DRAWING) return;
  const sp = viewPt(e), q = PTR.get(e.pointerId);
  if (q) { q.x = sp.x; q.y = sp.y; }
  const a = ACT;
  if (!a) {
    if (e.pointerType === 'touch') return;
    const hit = hitAt(toPage(sp), false), hv = hit && hit.k === 'cut' ? { k: 'cut', path: hit.path, end: hit.end } : hit && hit.k === 'panel' ? { k: 'panel', id: hit.id } : null;
    if (JSON.stringify(hv) !== JSON.stringify(HOVER)) { HOVER = hv; paint(); }
    setCursor(SPACE ? 'grab' : cursorFor(hit));
    return;
  }
  if (a.k === 'pinch') { pinchMove(a); return; }
  if (a.id !== e.pointerId) return;
  const p = toPage(sp), dx = p.x - a.p0.x, dy = p.y - a.p0.y;
  if (!a.moved) {
    if (Math.hypot(sp.x - a.s0.x, sp.y - a.s0.y) < (a.touch ? 7 : 3)) return;
    a.moved = true;
    if (a.k !== 'pan') a.pre = snap();
    if (a.k === 'pan') setCursor('panning');
  }
  if (a.k === 'pan') { VIEW.x = a.v.x + sp.x - a.s0.x; VIEW.y = a.v.y + sp.y - a.s0.y; keepInView(); viewChanged(); return; }
  if (a.k === 'cut') {
    const n = nodeAt(page().lay, a.path);
    if (!n) return;
    const d = a.d === 'h' ? dy / a.bb.h : dx / a.bb.w, oa = n.a, ob = n.b;
    let na = a.end === 'b' ? a.n0.a : clamp(a.n0.a + d, 0.03, 0.97), nb = a.end === 'a' ? a.n0.b : clamp(a.n0.b + d, 0.03, 0.97);
    if (a.end !== 'mid' && Math.abs(na - nb) < 0.012 && !e.shiftKey) { if (a.end === 'a') na = nb; else nb = na; }   // a cut that is almost straight becomes straight
    n.a = na; n.b = nb;
    if (!layOk(page())) { n.a = oa; n.b = ob; }
    refit(page());
    paint();
    return;
  }
  const it = findItem(a.iid);
  if (!it) return;
  const o = a.it0;
  delete it.fit;
  if (a.k === 'move') {
    let mx = dx, my = dy;
    if (e.shiftKey) { if (Math.abs(mx) > Math.abs(my)) my = 0; else mx = 0; }
    it.x = o.x + mx; it.y = o.y + my;
  } else if (a.hd === 'tail') { it.tx = p.x; it.ty = p.y; }
  else if (a.hd === 'fc') { it.cx = clamp((p.x - o.x - o.w / 2) / o.w, -0.5, 0.5); it.cy = clamp((p.y - o.y - o.h / 2) / o.h, -0.5, 0.5); }
  else if (a.hd === 'rot') {
    const c = center(o);
    let deg = Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI + 90;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    deg = ((deg + 180) % 360 + 360) % 360 - 180;
    it.r = Math.abs(deg) < 2.5 ? 0 : Math.round(deg * 10) / 10;
  } else resizeBy(it, o, a.hd, p, e.shiftKey);
  if (EDIT) placeText();
  paint();
}
/* resizing by a handle: the opposite side stays where it is (in the item's own turned frame) */
function resizeBy(it, o, hd, p, shift) {
  const c0 = center(o), a = turns(o) ? o.r : 0, q = rot(p.x - c0.x, p.y - c0.y, -a), min = 16;
  let L0 = -o.w / 2, R0 = o.w / 2, T0 = -o.h / 2, B0 = o.h / 2;
  if (hd.includes('e')) R0 = Math.max(L0 + min, q.x);
  if (hd.includes('w')) L0 = Math.min(R0 - min, q.x);
  if (hd.includes('s')) B0 = Math.max(T0 + min, q.y);
  if (hd.includes('n')) T0 = Math.min(B0 - min, q.y);
  if (hd.length === 2 && (o.t === 'img' ? !shift : shift)) {
    // a picture keeps its shape (Shift lets it stretch); anything else keeps it with Shift
    const k = Math.max((R0 - L0) / o.w, (B0 - T0) / o.h), w = o.w * k, hh = o.h * k;
    if (hd.includes('e')) R0 = L0 + w; else L0 = R0 - w;
    if (hd.includes('s')) B0 = T0 + hh; else T0 = B0 - hh;
  }
  const mid = rot((L0 + R0) / 2, (T0 + B0) / 2, a);
  it.w = R0 - L0; it.h = B0 - T0;
  it.x = c0.x + mid.x - it.w / 2; it.y = c0.y + mid.y - it.h / 2;
}
function onUp(e) {
  PTR.delete(e.pointerId);
  const a = ACT;
  if (!a) return;
  if (a.k === 'pinch') { if (a.ids.includes(e.pointerId)) { ACT = null; if ([...PTR.values()].some(q => q.t === 'touch')) ACT = { k: 'wait' }; } return; }
  if (a.k === 'wait') { if (![...PTR.values()].some(q => q.t === 'touch')) ACT = null; return; }
  if (a.id !== e.pointerId) return;
  endAct(false);
  if (!a.moved && e.type === 'pointerup') LASTUP = { t: performance.now(), ...viewPt(e) };
}
/* the drag is over: what it changed is one step */
function endAct(cancel) {
  const a = ACT;
  ACT = null;
  if (!a) return;
  if (a.k === 'pan') { setCursor(''); return; }
  if (a.pre && a.moved) {
    if (cancel) { C = a.pre; paint(); return; }
    push(a.pre); changed(); sideUI(); ribbonUI();
  }
  paint();
}
function startPan(id, sp) { ACT = { k: 'pan', id, s0: sp, v: { ...VIEW }, moved: true }; setCursor('panning'); }
function startPinch(touches) {
  const [[ia, a], [ib, b]] = touches;
  ACT = { k: 'pinch', ids: [ia, ib], d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v: { ...VIEW } };
}
function pinchMove(a) {
  const A = PTR.get(a.ids[0]), B = PTR.get(a.ids[1]);
  if (!A || !B) return;
  const d = Math.hypot(A.x - B.x, A.y - B.y) || 1, m = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, z = clamp(a.v.z * d / a.d0, 0.03, 12);
  const px = (a.m0.x - a.v.x) / a.v.z, py = (a.m0.y - a.v.y) / a.v.z;
  VIEW.z = z; VIEW.x = m.x - px * z; VIEW.y = m.y - py * z;
  keepInView(); viewChanged();
}

/* =========================================================
   the keyboard (index.html hands the keys over while a comic is open)
   ========================================================= */
function onKey(e) {
  if (!C || !LOADED) return false;
  if (DRAWING) return window.INK_DRAW.key(e);
  if (MODALS.length || READ) return false;
  const t = e.target, typing = t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]');
  const mod = e.ctrlKey || e.metaKey, c = e.code;
  if (typing) {
    if (t === V.ta && ((e.key === 'Enter' && mod) || e.key === 'Tab')) { e.preventDefault(); commitText(); V.vp.focus(); return true; }
    return false;
  }
  if (e.key === 'F5') { e.preventDefault(); openReader(); return true; }
  if (mod && c === 'KeyZ' && !e.altKey) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return true; }
  if (mod && c === 'KeyY') { e.preventDefault(); redo(); return true; }
  if (mod && (c === 'Equal' || c === 'NumpadAdd')) { e.preventDefault(); zoomBy(1.25); return true; }
  if (mod && (c === 'Minus' || c === 'NumpadSubtract')) { e.preventDefault(); zoomBy(0.8); return true; }
  if (mod && (c === 'Digit0' || c === 'Numpad0')) { e.preventDefault(); fit(); return true; }
  if (e.key === 'PageDown' || (mod && e.key === 'ArrowDown')) { e.preventDefault(); goPage(C.p + 1); return true; }
  if (e.key === 'PageUp' || (mod && e.key === 'ArrowUp')) { e.preventDefault(); goPage(C.p - 1); return true; }
  // the rest is for the page itself: a button, the strip or the side keep their own keys
  if (t && t.closest && t.closest('button,a,[role=option],[role=tab],.cm-strip,.cm-side,#ribbon,#tabs,#drawer,.menu') && t !== V.vp) return false;
  if (c === 'Space' && !mod) { if (!SPACE) { SPACE = true; setCursor('grab'); } e.preventDefault(); return true; }
  const it = selItem();
  if (mod && c === 'KeyD' && it) { e.preventDefault(); dupItem(); return true; }
  if (mod && (c === 'KeyC' || c === 'KeyX') && it) { e.preventDefault(); CLIP = clone(it); if (c === 'KeyX') delItem(); return true; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && it) { e.preventDefault(); delItem(); return true; }
  if (e.key === 'Enter' && !mod) {
    if (it && (it.t === 'bub' || it.t === 'sfx')) { e.preventDefault(); startText(it); return true; }
    if (selPanel()) { e.preventDefault(); drawPanel(selPanel()); return true; }
  }
  if (it && /^Arrow/.test(e.key) && !mod) {
    e.preventDefault();
    const s = e.shiftKey ? 10 : 1, d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
    if (!NUDGE) NUDGE = snap();
    it.x += d[0]; it.y += d[1];
    paint(); nudgeEnd();
    return true;
  }
  return false;
}
let NUDGE = null;
const nudgeEnd = debounce(() => { if (NUDGE) { push(NUDGE); NUDGE = null; changed(); } }, 600);
function onEsc() {
  if (!C) return false;
  if (DRAWING) { if (window.INK_DRAW.esc()) return true; endDraw(); return true; }
  if (EDIT) { commitText(); V.vp.focus(); return true; }
  if (ACT) { endAct(true); return true; }
  if (SEL) { select(null); return true; }
  return false;
}

/* =========================================================
   writing the words of a bubble or a sound, right on it: the text fits itself to the bubble as it is written
   ========================================================= */
function startText(it, fresh) {
  commitText();
  if (!it || (it.t !== 'bub' && it.t !== 'sfx')) return;
  select({ k: 'item', id: it.id });
  EDIT = { id: it.id, before: snap(), was: it.txt, fresh: fresh && it.t === 'bub' ? { x: it.x, y: it.y, w: it.w, h: it.h, tx: it.tx, ty: it.ty } : null };
  V.ta.value = it.txt;
  V.ta.hidden = false;
  placeText();
  V.ta.focus({ preventScroll: true });
  V.ta.select();
  undoUI(); paint();
}
function placeText() {
  const it = EDIT && findItem(EDIT.id), ta = V.ta;
  if (!it || !ta) return;
  const z = VIEW.z, c = center(it);
  let w, hh, font, color;
  if (it.t === 'bub') {
    const room = roomOf(it), L0 = layoutText(it);
    w = Math.max(2 * room.half(0), 80 / z); hh = Math.max(2 * room.ey, 40 / z);
    font = fontOf(it.f, it.b, L0.s * z); color = it.fc;
  } else {
    const L0 = sfxLayout(it);
    w = Math.max(it.w * 0.9, 80 / z); hh = Math.max(it.h * 0.9, 40 / z);
    font = fontOf(it.f, false, Math.min(L0.s, it.h * 0.6) * z); color = '#111';
  }
  const s = toScreen(c.x - w / 2, c.y - hh / 2);
  Object.assign(ta.style, { left: s.x + 'px', top: s.y + 'px', width: w * z + 'px', height: hh * z + 'px', font, color, direction: textDir(ta.value) });
}
function onTextInput() {
  const it = EDIT && findItem(EDIT.id);
  if (!it) return;
  it.txt = V.ta.value.slice(0, it.t === 'sfx' ? 300 : 2000);
  if (EDIT.fresh) grow(it, EDIT.fresh);
  if (LOADED && S.cur === LOADED) markDirty();
  placeText(); paint(); sideSync();
}
/* a bubble just made grows with its words, from its corner on the side it is read from, as far as its panel allows */
function grow(it, f) {
  const u = unit(), p = geom(page()).panels.find(q => q.P && inPoly(q.P, { x: f.x + f.w / 2, y: f.y + f.h / 2 })), b = p ? p.box : { x: 0, y: 0, w: C.w, h: C.h };
  const sz = bubbleSize(it.txt || ' ', it.fs * (it.k === 'box' ? 0.95 : 1), b.w * 0.8, b.h * 0.6);
  const w = Math.max(f.w, Math.min(sz.w, b.w * 0.8)), hh = Math.max(f.h, Math.min(sz.h, b.h * 0.6)), rtl = C.dir === 'rtl';
  it.w = w; it.h = hh;
  it.x = rtl ? Math.max(b.x + 4 * u, f.x + f.w - w) : Math.min(f.x, b.x + b.w - w - 4 * u);
  it.y = Math.min(f.y, b.y + b.h - hh - 4 * u);
  if (it.tl) { it.tx = f.tx + (it.x + w / 2 - f.x - f.w / 2); it.ty = Math.max(f.ty, it.y + hh + 24 * u); }
}
function commitText() {
  const e = EDIT;
  if (!e) return;
  EDIT = null;
  V.ta.hidden = true;
  const it = findItem(e.id);
  if (it && it.txt !== e.was) { push(e.before); changed(); }
  undoUI(); paint(); sideUI();
}
function cancelText() {
  const e = EDIT;
  if (!e) return;
  EDIT = null;
  V.ta.hidden = true;
  const it = findItem(e.id);
  if (it) it.txt = e.was;
  undoUI(); paint(); sideUI();
}

/* =========================================================
   the side: what the chosen thing has, to change (the page's own things when nothing is chosen)
   ========================================================= */
const sideSoon = debounce(() => sideSync(), 120);
function field(label, ...kids) { return h('label', { class: 'cm-f' }, h('span', { text: label }), ...kids); }
/* a slider; set(v) changes the comic as it moves, as one step */
function slider(label, val, min, max, step, show, set) {
  const out = h('b', { text: show(val) }), inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val), 'aria-label': label });
  inp.addEventListener('input', () => { const v = +inp.value; out.textContent = show(v); liveStep(() => set(v)); });
  inp.addEventListener('change', () => liveEnd());
  return field(label, inp, out);
}
function color(label, val, set) {
  const inp = h('input', { type: 'color', value: val, 'aria-label': label });
  inp.addEventListener('input', () => liveStep(() => set(inp.value)));
  inp.addEventListener('change', () => liveEnd());
  return field(label, inp);
}
function check(label, on, set, title) {
  const inp = h('input', { type: 'checkbox' });
  inp.checked = !!on;
  inp.addEventListener('change', () => edit(() => set(inp.checked)));
  const f = field(label, inp);
  if (title) f.title = title;
  return f;
}
function choose(label, list, val, set) {
  const s = h('select', { class: 'sel', 'aria-label': label }, list.map(([v, t]) => h('option', { value: v, text: t })));
  s.value = val;
  s.addEventListener('change', () => { edit(() => set(s.value)); s.blur(); });
  return field(label, s);
}
const fontList = list => list.map(f => [f, f]);
function textBox(it) {
  const ta = h('textarea', { class: 'cm-txt', 'aria-label': T('המילים'), placeholder: it.t === 'bub' ? T('מה הדמות אומרת?') : T('הצליל, למשל בום!') });
  ta.value = it.txt;
  ta.dataset.id = it.id;
  ta.addEventListener('input', () => { const x = findItem(it.id); if (x) liveStep(() => { x.txt = ta.value.slice(0, x.t === 'sfx' ? 300 : 2000); }); });
  ta.addEventListener('change', () => liveEnd());
  ta.addEventListener('blur', () => liveEnd());
  return ta;
}
/* the text box in the side follows what is written on the bubble itself */
function sideSync() {
  const ta = V.side && V.side.querySelector('.cm-txt'), it = ta && findItem(ta.dataset.id);
  if (it && document.activeElement !== ta && ta.value !== it.txt) ta.value = it.txt;
}
const pct = v => Math.round(v * 100) + '%';
const px = v => String(Math.round(v));
function sideUI() {
  if (!V.side || !C) return;
  const it = selItem(), pid = selPanel(), body = V.sbody, u = unit();
  body.textContent = '';
  const g = geom(page()), nOf = id => g.panels.findIndex(p => p.id === id) + 1;
  const act = (ic, label, fn, cls) => h('button', { class: 'btn small' + (cls ? ' ' + cls : ''), type: 'button', onclick: fn }, icon(ic), label);
  const on = (fn) => () => { const x = selItem(); if (x) fn(x); };
  if (it) {
    const set = fn => v => { const x = findItem(it.id); if (x) fn(x, v); };
    if (it.t === 'bub') {
      V.stitle.textContent = T('בלון');
      body.append(h('div', { class: 'cm-kinds', role: 'radiogroup', 'aria-label': T('סוג הבלון') }, BUBS.map(([k, n]) => {
        const b = rbtn('', bubIcon(k), T(n), { title: T(n) });
        b.removeAttribute('data-cmd');
        b.classList.toggle('on', it.k === k); b.setAttribute('aria-checked', String(it.k === k)); b.setAttribute('role', 'radio');
        b.addEventListener('click', () => edit(() => { const x = findItem(it.id); if (!x || x.k === k) return false; x.k = k; x.b = k === 'shout' || (x.b && x.k !== 'shout'); if (k === 'box' && x.fill === '#ffffff') x.fill = '#fff6cc'; else if (k !== 'box' && x.fill === '#fff6cc') x.fill = '#ffffff'; }));
        return b;
      })), textBox(it),
      choose(T('גופן'), fontList(TALK_FONTS.concat(SFX_FONTS.filter(f => !TALK_FONTS.includes(f)))), it.f, set((x, v) => { x.f = v; })),
      slider(T('גודל מרבי'), Math.round(it.fs / u), 12, 120, 1, px, set((x, v) => { x.fs = Math.round(v * u); })),
      check(T('מודגש'), it.b, set((x, v) => { x.b = v; })),
      it.k !== 'box' ? check(T('זנב'), it.tl, set((x, v) => { x.tl = v; }), T('הזנב מצביע אל מי שמדבר. גוררים את הנקודה שבקצה שלו')) : null,
      h('h5', { text: T('צבעים') }),
      color(T('טקסט'), it.fc, set((x, v) => { x.fc = v; })), color(T('רקע'), it.fill, set((x, v) => { x.fill = v; })), color(T('קו'), it.sc, set((x, v) => { x.sc = v; })),
      slider(T('עובי הקו'), it.sw / u, 0, 16, 0.5, v => String(r1(v)), set((x, v) => { x.sw = v * u; })),
      clipRow(it));
    } else if (it.t === 'sfx') {
      V.stitle.textContent = T('מילת צליל');
      body.append(textBox(it),
        choose(T('גופן'), fontList(SFX_FONTS.concat(TALK_FONTS.filter(f => !SFX_FONTS.includes(f)))), it.f, set((x, v) => { x.f = v; })),
        color(T('מילוי'), it.fc, set((x, v) => { x.fc = v; })), color(T('קו מסביב'), it.oc, set((x, v) => { x.oc = v; })),
        slider(T('עובי הקו'), it.ow, 0, 0.4, 0.01, pct, set((x, v) => { x.ow = v; })),
        color(T('צל'), it.shc, set((x, v) => { x.shc = v; })), slider(T('עומק הצל'), it.sh, 0, 0.3, 0.01, pct, set((x, v) => { x.sh = v; })),
        slider(T('סיבוב@turn'), it.r, -180, 180, 1, v => Math.round(v) + '°', set((x, v) => { x.r = v; })),
        slider(T('הטיה'), it.sk, -40, 40, 1, v => Math.round(v) + '°', set((x, v) => { x.sk = v; })),
        clipRow(it));
    } else if (it.t === 'speed') {
      V.stitle.textContent = T('קווי מהירות');
      body.append(slider(T('כמות'), it.n, 5, 300, 1, px, set((x, v) => { x.n = v; })), slider(T('עובי'), it.lw / u, 1, 40, 1, px, set((x, v) => { x.lw = v * u; })),
        slider(T('אורך'), it.len, 0.1, 1, 0.01, pct, set((x, v) => { x.len = v; })), slider(T('סיבוב@turn'), it.r, -180, 180, 1, v => Math.round(v) + '°', set((x, v) => { x.r = v; })),
        color(T('צבע'), it.col, set((x, v) => { x.col = v; })), underRow(it), clipRow(it));
    } else if (it.t === 'focus') {
      V.stitle.textContent = T('קווי ריכוז');
      body.append(slider(T('כמות'), it.n, 10, 400, 1, px, set((x, v) => { x.n = v; })), slider(T('עובי'), it.lw / u, 1, 60, 1, px, set((x, v) => { x.lw = v * u; })),
        slider(T('גודל המרכז'), it.ix, 0.05, 0.95, 0.01, pct, set((x, v) => { const k = x.iy / x.ix; x.ix = v; x.iy = clamp(v * k, 0.05, 0.95); })),
        color(T('צבע'), it.col, set((x, v) => { x.col = v; })), h('p', { class: 'muted small', text: T('גוררים את העיגול כדי להזיז את המרכז') }), underRow(it), clipRow(it));
    } else if (it.t === 'tone') {
      V.stitle.textContent = T('נקודות צל');
      body.append(choose(T('צורה'), [['rect', T('מלבן')], ['ellipse', T('אליפסה')]], it.sh, set((x, v) => { x.sh = v; })),
        slider(T('רווח'), it.sp / u, 4, 60, 1, px, set((x, v) => { x.sp = v * u; })), slider(T('גודל הנקודות'), it.ds, 0.05, 1, 0.01, pct, set((x, v) => { x.ds = v; })),
        slider(T('זווית@tone'), it.ang, -90, 90, 1, v => Math.round(v) + '°', set((x, v) => { x.ang = v; })),
        check(T('הדרגתי'), it.gr, set((x, v) => { x.gr = v; }), T('הנקודות קטנות לאט לאט עד שנעלמות')),
        it.gr ? slider(T('כיוון'), it.gd, -180, 180, 1, v => Math.round(v) + '°', set((x, v) => { x.gd = v; })) : null,
        color(T('צבע'), it.col, set((x, v) => { x.col = v; })), underRow(it), clipRow(it));
    } else if (it.t === 'img') {
      V.stitle.textContent = T('תמונה');
      body.append(h('div', { class: 'cm-btns' }, act('crop_free', T('מילוי המשבצת'), on(x => coverPanel(x))), act('image', T('החלפה'), on(x => pickImage(x.pn, x.id)))),
        h('p', { class: 'muted small', text: T('התמונה נחתכת לפי המשבצת. גוררים אותה כדי להזיז, ואת הפינות כדי לשנות גודל') }));
    }
    body.append(h('div', { class: 'cm-btns' }, act('flip_to_front', T('קדימה'), () => orderItem('up')), act('flip_to_back', T('אחורה'), () => orderItem('down')),
      act('content_copy', T('שכפול'), () => dupItem()), act('delete', T('מחיקה'), () => delItem(), 'danger')));
  } else if (pid) {
    const pan = page().pan[pid] || {};
    V.stitle.textContent = T('משבצת {0}', nOf(pid));
    const nt = h('textarea', { class: 'cm-txt', placeholder: T('מה קורה במשבצת? (הערה לציור, לא מודפסת)'), 'aria-label': T('הערה לציור') });
    nt.value = pan.nt || '';
    nt.addEventListener('input', () => liveStep(() => { panOf(pid).nt = nt.value.slice(0, 3000); }));
    nt.addEventListener('change', () => liveEnd()); nt.addEventListener('blur', () => liveEnd());
    body.append(h('div', { class: 'cm-btns' }, act('brush', T('ציור במשבצת'), () => drawPanel(pid), 'primary'), act('add_photo_alternate', T('תמונה'), () => pickImage(pid))),
      h('div', { class: 'cm-btns' }, act('splitscreen', T('לרוחב@cut'), () => splitPanel('h')), act('vertical_split', T('לאורך@cut'), () => splitPanel('v')), act('cell_merge', T('מחיקה'), () => mergePanel(), 'danger')),
      color(T('רקע המשבצת'), pan.bg || '#ffffff', v => { panOf(pid).bg = v; }),
      h('h5', { text: T('הערה לציור') }), nt,
      pan.art ? h('div', { class: 'cm-btns' }, act('ink_eraser', T('מחיקת הציור'), () => edit(() => { panOf(pid).art = ''; }), 'danger')) : null);
  } else {
    V.stitle.textContent = T('דף {0}', C.p + 1);
    body.append(h('p', { class: 'muted small', text: T('לוחצים על משבצת כדי לבחור אותה, ופעמיים כדי לצייר בה. גוררים את הרווח בין משבצות כדי לשנות את הגודל שלהן, ואת הקצוות שלו כדי להטות אותו.') }),
      h('div', { class: 'cm-btns' }, act('view_quilt', T('חלוקה'), e => layoutPop(e.currentTarget)), act('auto_stories', T('קריאה'), () => openReader())),
      slider(T('בין משבצות'), page().gut / u, 0, 120, 1, px, v => { page().gut = v * u; }),
      slider(T('שוליים'), page().mar / u, 0, 200, 1, px, v => { page().mar = v * u; }),
      slider(T('מסגרת'), page().bw / u, 0, 24, 0.5, v => String(r1(v)), v => { page().bw = v * u; }),
      color(T('צבע המסגרות'), page().bc, v => { page().bc = v; }), color(T('צבע הדף'), page().bg, v => { page().bg = v; }));
  }
}
function clipRow(it) {
  return check(T('בתוך משבצת'), !!it.pn, v => { const x = findItem(it.id); if (!x) return; if (v) { const p = panelAt(center(x)); if (p) x.pn = p; } else delete x.pn; }, T('מה שיוצא מהמשבצת לא נראה'));
}
function underRow(it) { return check(T('מאחורי הציור'), !!it.un, v => { const x = findItem(it.id); if (x) x.un = v; }, T('הציור של המשבצת מכסה את זה')); }
const panelAt = pt => { const g = geom(page()), p = g.panels.find(q => q.P && inPoly(q.P, pt)); return p ? p.id : null; };
function panOf(id) { const pg = page(); return pg.pan[id] || (pg.pan[id] = { bg: '#ffffff', art: '', nt: '' }); }

/* =========================================================
   pages
   ========================================================= */
function goPage(i) {
  if (!C) return;
  i = clamp(i, 0, C.pages.length - 1);
  if (i === C.p) return;
  commitText(); endAct(true);
  C.p = i; SEL = null; HOVER = null;
  stripUI(); sideUI(); ribbonUI(); stat(); paint();
  const el = V.list && V.list.children[i];
  if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  for (const j of [i - 1, i + 1]) if (C.pages[j]) prepare(C.pages[j]).catch(() => {});   // the pages around it, ready for when they come
}
function addPage(at = C.p + 1, dup) {
  if (C.pages.length >= MAX_PAGES) { toast(T('אפשר עד {0} דפים בקומיקס אחד', MAX_PAGES)); return; }
  edit(() => {
    const cur = page();
    let pg;
    if (dup) {
      pg = clone(cur); pg.id = rid('G');
      const map = {};
      // new ids for the panels and the items, so the copy is a page of its own
      (function re(n) { if (n.k) { re(n.k[0]); re(n.k[1]); } else { const id = rid('P'); map[n.id] = id; n.id = id; } })(pg.lay);
      pg.pan = Object.fromEntries(Object.entries(pg.pan).map(([k, v]) => [map[k], v]).filter(([k]) => k));
      for (const it of pg.its) { it.id = rid('i'); if (it.pn) it.pn = map[it.pn]; }
    } else {
      pg = newPage(C, sameCuts(cur.lay));
      Object.assign(pg, { gut: cur.gut, mar: cur.mar, bw: cur.bw, bc: cur.bc, bg: cur.bg });
    }
    C.pages.splice(at, 0, pg);
    C.p = at; SEL = null;
  });
  stripUI(); sideUI(); ribbonUI(); stat();
}
/* the same cuts, with new panels */
function sameCuts(n) { return n.k ? { d: n.d, a: n.a, b: n.b, k: [sameCuts(n.k[0]), sameCuts(n.k[1])] } : { id: rid('P') }; }
async function delPage(i = C.p) {
  if (C.pages.length <= 1) return;
  const pg = C.pages[i], drawn = Object.values(pg.pan).some(p => p.art) || pg.its.length;
  if (drawn && !(await confirmBox(T('מחיקת הדף'), T('דף {0} יימחק עם כל מה שיש בו. אפשר להחזיר אותו עם ביטול (Ctrl+Z).', i + 1), T('מחיקה'), true))) return;
  edit(() => { C.pages.splice(i, 1); C.p = clamp(C.p > i ? C.p - 1 : C.p, 0, C.pages.length - 1); SEL = null; });
  stripUI(); sideUI(); ribbonUI(); stat();
}
function movePage(from, to) {
  if (from === to || to < 0 || to >= C.pages.length) return;
  edit(() => { const [pg] = C.pages.splice(from, 1); C.pages.splice(to, 0, pg); C.p = to; });
  stripUI(); stat();
}
function pageMenu(anchor, i) {
  const items = [['content_copy', T('שכפול הדף'), () => { goPage(i); addPage(i + 1, true); }], ['note_add', T('דף חדש אחריו'), () => { goPage(i); addPage(i + 1); }],
    ['arrow_upward', T('הזזה למעלה'), () => movePage(i, i - 1), i === 0], ['arrow_downward', T('הזזה למטה'), () => movePage(i, i + 1), i === C.pages.length - 1],
    ['delete', T('מחיקת הדף'), () => delPage(i), C.pages.length <= 1, true]];
  openPop(anchor, h('div', { class: 'menu' }, items.map(([ic, label, fn, off, danger]) => h('button', { class: 'mi' + (danger ? ' danger' : ''), disabled: off || null, onclick: () => { closePopover(); fn(); } }, icon(ic), label))));
}
/* --- the strip of pages: a click goes to one, dragging moves it, its menu does the rest --- */
function stripUI() {
  if (!V.list || !C) return;
  const kids = C.pages.map((pg, i) => {
    const im = pg.th ? h('img', { src: pg.th, alt: '' }) : h('div', { class: 'ph', style: { aspectRatio: `${C.w} / ${C.h}` } });
    return h('div', { class: 'cm-pg' + (i === C.p ? ' on' : ''), role: 'option', 'aria-selected': String(i === C.p), 'data-i': String(i), 'data-id': pg.id, tabindex: '0', title: T('דף {0}', i + 1) },
      im, h('span', { class: 'n', text: String(i + 1) }), h('button', { class: 'rb m', type: 'button', title: T('פעולות'), 'aria-label': T('פעולות על הדף') }, icon('more_horiz')));
  });
  V.list.replaceChildren(...kids);
  V.list.setAttribute('aria-label', T('דפים'));
  if (V.pgn) V.pgn.textContent = `${C.p + 1} / ${C.pages.length}`;
  fillThumbs();
}
function stripThumb(id, th) {
  const el = V.list && V.list.querySelector(`.cm-pg[data-id="${id}"]`), old = el && el.querySelector('img,.ph');
  if (old) old.replaceWith(h('img', { src: th, alt: '' }));
}
/* pages that have no small picture yet (a comic Claude made, an old backup) get one, one after another */
let FILLING = false;
async function fillThumbs() {
  if (FILLING || !C) return;
  FILLING = true;
  try {
    const c0 = C;
    for (let i = 0; i < 400; i++) {
      if (C !== c0) return;
      const pg = C.pages.find(p => !p.th);
      if (!pg) return;
      await thumbNow(pg);
      if (!pg.th) return;
      await sleep(30);
    }
  } finally { FILLING = false; }
}
function stripEvents() {
  const L0 = V.list;
  L0.addEventListener('pointerdown', e => {
    const el = e.target.closest('.cm-pg');
    if (!el || e.button > 0) return;
    if (e.target.closest('.m')) return;
    const i = +el.dataset.i, horiz = getComputedStyle(L0).flexDirection === 'row', at = ev => horiz ? ev.clientX : ev.clientY, s0 = at(e);
    let drag = false, to = i, after = false;
    if (e.pointerType !== 'touch') try { L0.setPointerCapture(e.pointerId); } catch {}
    const mv = ev => {
      if (!drag && (ev.pointerType === 'touch' || Math.abs(at(ev) - s0) < 8)) return;   // a finger scrolls the strip
      drag = true; el.classList.add('drag');
      for (const it of L0.children) {
        const r = it.getBoundingClientRect(), a = horiz ? r.left : r.top, b = horiz ? r.right : r.bottom;
        if (at(ev) >= a && at(ev) <= b) { to = +it.dataset.i; after = at(ev) > (a + b) / 2; }
        it.classList.toggle('drop', +it.dataset.i === to && to !== i);
        it.classList.toggle('after', +it.dataset.i === to && after);
      }
      const r = L0.getBoundingClientRect();
      if (horiz) { if (ev.clientX < r.left + 24) L0.scrollLeft -= 12; else if (ev.clientX > r.right - 24) L0.scrollLeft += 12; }
      else if (ev.clientY < r.top + 24) L0.scrollTop -= 12; else if (ev.clientY > r.bottom - 24) L0.scrollTop += 12;
    };
    const end = ev => {
      L0.removeEventListener('pointermove', mv); L0.removeEventListener('pointerup', end); L0.removeEventListener('pointercancel', end);
      for (const it of L0.children) it.classList.remove('drop', 'after', 'drag');
      if (drag) { let t = to + (after ? 1 : 0); if (t > i) t--; movePage(i, t); }
      else if (ev.type === 'pointerup') goPage(i);
    };
    L0.addEventListener('pointermove', mv); L0.addEventListener('pointerup', end); L0.addEventListener('pointercancel', end);
  });
  L0.addEventListener('click', e => { const b = e.target.closest('.m'); if (b) pageMenu(b, +b.closest('.cm-pg').dataset.i); });
  L0.addEventListener('contextmenu', e => { const el = e.target.closest('.cm-pg'); if (!el) return; e.preventDefault(); pageMenu(el, +el.dataset.i); });
  L0.addEventListener('keydown', e => {
    const el = e.target.closest('.cm-pg');
    if (!el) return;
    const i = +el.dataset.i;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goPage(i); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const j = clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, C.pages.length - 1); goPage(j); L0.children[j].focus(); }
    else if (e.key === 'Delete') { e.preventDefault(); delPage(i); }
  });
}

/* =========================================================
   panels: cutting one in two, taking one away, and a new way to cut the page
   ========================================================= */
/* the panel an action is for: the one chosen, or the one the chosen item is in */
function targetPanel(quiet) {
  const p = selPanel() || (selItem() && (selItem().pn || panelAt(center(selItem()))));
  if (!p && !quiet) toast(T('קודם בוחרים משבצת: לוחצים עליה'), { icon: 'info' });
  return p;
}
function splitPanel(d) {
  const id = targetPanel();
  if (!id) return;
  if (geom(page()).panels.length >= MAX_PANELS) { toast(T('אפשר עד {0} משבצות בדף', MAX_PANELS)); return; }
  let fresh = null;
  edit(() => {
    const pg = page(), nid = rid('P');
    const swap = n => { if (n.k) return { ...n, k: [swap(n.k[0]), swap(n.k[1])] }; if (n.id !== id) return n;
      // the first one read keeps the panel's own id (and its note); both halves keep its drawing and color
      const first = d === 'v' && C.dir === 'rtl' ? 1 : 0, k = [{ id: nid }, { id: nid }];
      k[first] = { id }; return { d, a: 0.5, b: 0.5, k }; };
    const before = pg.lay;
    pg.lay = swap(pg.lay);
    if (!layOk(pg)) { pg.lay = before; toast(T('המשבצת קטנה מדי לחיתוך')); return false; }
    if (pg.pan[id]) pg.pan[nid] = { bg: pg.pan[id].bg, art: pg.pan[id].art, nt: '' };
    fresh = nid;
  });
  if (fresh) select({ k: 'panel', id: fresh });
}
async function mergePanel() {
  const id = targetPanel();
  if (!id) return;
  const pg = page();
  if (geom(pg).panels.length <= 1) return;
  if (pg.pan[id] && pg.pan[id].art && !(await confirmBox(T('מחיקת המשבצת'), T('הציור שבמשבצת יימחק איתה. אפשר להחזיר אותו עם ביטול (Ctrl+Z).'), T('מחיקה'), true))) return;
  edit(() => {
    let keep = null;
    const cut = n => {
      if (!n.k) return n;
      if (!n.k[0].k && n.k[0].id === id) { keep = n.k[1]; return n.k[1]; }
      if (!n.k[1].k && n.k[1].id === id) { keep = n.k[0]; return n.k[0]; }
      return { ...n, k: [cut(n.k[0]), cut(n.k[1])] };
    };
    pg.lay = cut(pg.lay);
    delete pg.pan[id];
    // what was cut to the panel goes to the panel that took its place
    const heir = keep ? leafIds(keep)[0] : null;
    for (const it of pg.its) if (it.pn === id) { const p = panelAt(center(it)); it.pn = p || heir; if (!it.pn) delete it.pn; }
    SEL = heir ? { k: 'panel', id: heir } : null;
  });
  sideUI(); ribbonUI();
}
/* a page cut another way: its panels go to the new ones in the order they are read (the first one's drawing to the
   first new one...). Returns how many drawings had no panel left to go to */
function layoutTo(pg, k) {
  const old = geom(pg).panels.map(p => p.id), lay = preset(k, C.dir), now = panelOrder(lay, C.dir === 'rtl'), map = {};
  old.forEach((id, i) => { if (now[i]) map[id] = now[i]; });
  const lost = old.filter(id => !map[id] && pg.pan[id] && pg.pan[id].art).length;
  pg.pan = Object.fromEntries(Object.entries(pg.pan).filter(([id]) => map[id]).map(([id, v]) => [map[id], v]));
  pg.lay = lay;
  for (const it of pg.its) if (it.pn) { if (map[it.pn]) it.pn = map[it.pn]; else delete it.pn; }
  return lost;
}
function applyLayout(k) {
  let lost = 0;
  edit(() => { lost = layoutTo(page(), k); SEL = null; });
  if (lost) toast(TN('{n} ציורים לא נכנסו לחלוקה החדשה. אפשר להחזיר אותם עם ביטול (Ctrl+Z).', lost), { icon: 'info', ms: 6000 });
  cprefs().lay = k; savePrefs();
  sideUI(); ribbonUI();
}
/* the small drawing of a way to cut a page, for the gallery */
function layoutSvg(lay, w = C ? C.w : 1300, hh = C ? C.h : 2000, dir = C ? C.dir : UI_DIR) {
  const fake = { gut: w * 0.035, mar: w * 0.05, lay }, g = geom(fake, { w, h: hh, dir });
  const ps = g.panels.filter(p => p.P).map(p => `<path d="M${p.P.map(q => `${r1(q.x)} ${r1(q.y)}`).join('L')}Z" fill="#fff" stroke="currentColor" stroke-width="${r1(w * 0.012)}"/>`).join('');
  const s = h('span', { 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 ${w} ${hh}"><rect width="${w}" height="${hh}" fill="var(--surface-3)"/>${ps}</svg>`;
  return s.firstChild;
}
function layoutPop(anchor) {
  commitText();
  const el = h('div', { class: 'cm-pop' }, h('div', { class: 'pop-t', text: T('חלוקת הדף למשבצות') }), layoutGalleryFor(k => { closePopover(); applyLayout(k); }, null, C.dir, C.w, C.h),
    h('p', { class: 'muted small', text: T('הציורים עוברים למשבצות החדשות לפי הסדר. אחר כך אפשר לגרור את הרווחים ביניהן.') }));
  openPop(anchor, el);
}
function setDir(d) {
  if (!C || C.dir === d) return;
  edit(() => { C.dir = d; });
  ribbonUI(); stat();
  toast(d === 'rtl' ? T('הקומיקס נקרא עכשיו מימין לשמאל') : T('הקומיקס נקרא עכשיו משמאל לימין'), { icon: d === 'rtl' ? 'format_textdirection_r_to_l' : 'format_textdirection_l_to_r' });
}

/* =========================================================
   bubbles, sounds, effects and pictures
   ========================================================= */
/* where a new thing goes: the chosen panel, or the panel in the middle of the window, or the first one */
function placeFor() {
  const g = geom(page()), id = targetPanel(true);
  let p = id && g.panels.find(q => q.id === id);
  if (!p) { const r = vpRect(), mid = toPage({ x: r.width / 2, y: r.height / 2 }); p = g.panels.find(q => q.P && inPoly(q.P, mid)) || g.panels.find(q => q.P); }
  return p || { id: null, box: { x: C.w * 0.1, y: C.h * 0.1, w: C.w * 0.8, h: C.h * 0.8 } };
}
function addItem(it) {
  edit(() => { page().its.push(it); SEL = { k: 'item', id: it.id }; });
  sideUI(); ribbonUI();
  return it;
}
function addBubble(k) {
  const p = placeFor(), b = p.box, u = unit(), rtl = C.dir === 'rtl', d = DEF.bub(u);
  const mine = page().its.filter(it => it.t === 'bub' && p.id && panelAt(center(it)) === p.id).length;
  let w, hh, x, y;
  if (k === 'box') { w = clamp(b.w * 0.55, 160 * u, 700 * u); hh = clamp(b.h * 0.16, 70 * u, 220 * u); x = rtl ? b.x + b.w - w - 14 * u : b.x + 14 * u; y = b.y + 14 * u + mine * 30 * u; }
  else {
    w = clamp(b.w * 0.42, 200 * u, 560 * u); hh = clamp(w * 0.62, 120 * u, b.h * 0.5);
    // each new bubble a little lower, first on the side the panel is read from, then the other
    const first = mine % 2 === 0;
    x = (rtl === first) ? b.x + b.w - w - b.w * 0.05 : b.x + b.w * 0.05; y = b.y + b.h * 0.05 + mine * hh * 0.55;
    y = Math.min(y, b.y + b.h - hh - 10 * u);
  }
  if (p.P) ({ x, w } = inside(p.P, { x, y, w, h: hh }, 10 * u));
  const it = { id: rid('i'), t: 'bub', k, x, y, w, h: hh, txt: '', f: d.f, fs: d.fs, b: k === 'shout', fc: d.fc, fill: k === 'box' ? '#fff6cc' : d.fill, sc: d.sc, sw: d.sw, tl: k !== 'box',
    tx: x + w / 2 + (rtl ? -1 : 1) * w * 0.12, ty: Math.min(b.y + b.h - 20 * u, y + hh + b.h * 0.2) };
  addItem(it);
  startText(it, true);
}
function addFx(t) {
  const p = placeFor(), b = p.box, u = unit(), d = DEF[t](u);
  let it;
  if (t === 'sfx') {
    const w = clamp(b.w * 0.6, 220 * u, 900 * u), hh = clamp(w * 0.42, 100 * u, b.h * 0.5);
    it = { id: rid('i'), t, x: b.x + (b.w - w) / 2, y: b.y + (b.h - hh) / 2, w, h: hh, txt: T('בום!'), ...d, r: -8, sk: 0 };
  } else {
    it = { id: rid('i'), t, x: b.x, y: b.y, w: b.w, h: b.h, ...d };
    if (p.id) it.pn = p.id;
    if (t === 'speed') it.r = 0;
    if (t === 'focus') Object.assign(it, { cx: 0, cy: 0 });
    if (t === 'tone') Object.assign(it, { sh: 'rect', ang: 45, gr: true, gd: 90, un: true });
    if (p.id) it.fit = true;
  }
  addItem(it);
  if (t === 'sfx') startText(it);
}
function dupItem() {
  const it = selItem();
  if (!it) return;
  const u = unit(), c = { ...clone(it), id: rid('i'), x: it.x + 30 * u, y: it.y + 30 * u };
  if (c.t === 'bub') { c.tx += 30 * u; c.ty += 30 * u; }
  addItem(c);
}
function pasteItem() {
  if (!CLIP) return;
  const u = unit(), c = { ...clone(CLIP), id: rid('i'), x: CLIP.x + 24 * u, y: CLIP.y + 24 * u };
  if (c.t === 'bub') { c.tx += 24 * u; c.ty += 24 * u; }
  if (c.pn && !geom(page()).panels.some(p => p.id === c.pn)) { const p = panelAt(center(c)); if (p) c.pn = p; else delete c.pn; }
  CLIP = clone(c);
  addItem(c);
}
let CLIP = null;   // what Ctrl+C copied here
function delItem() {
  const it = selItem();
  if (!it) return;
  edit(() => { const pg = page(); pg.its = pg.its.filter(x => x.id !== it.id); SEL = it.pn ? { k: 'panel', id: it.pn } : null; });
  sideUI(); ribbonUI();
}
function orderItem(dir) {
  const it = selItem();
  if (!it) return;
  edit(() => {
    const its = page().its, i = its.indexOf(it), j = dir === 'up' ? i + 1 : i - 1;
    if (j < 0 || j >= its.length) return false;
    [its[i], its[j]] = [its[j], its[i]];
  });
}
/* a picture in a panel: it covers the panel, keeping its shape, and is cut by it */
function coverBox(iw, ih, b) { const k = Math.max(b.w / iw, b.h / ih); return { w: iw * k, h: ih * k, x: b.x + (b.w - iw * k) / 2, y: b.y + (b.h - ih * k) / 2 }; }
function coverPanel(it) {
  const p = geom(page()).panels.find(q => q.id === it.pn), e = IMGS.get(it.src);
  if (!p || !e || !e.im) return;
  edit(() => { const x = findItem(it.id); if (x) Object.assign(x, coverBox(e.im.naturalWidth, e.im.naturalHeight, p.box), { fit: true }); });
}
async function imageItem(file, pid, replaceId) {
  let src;
  try { src = await blobToDataURL(await shrinkImage(file, 2400)); } catch { toast(T('לא הצלחתי לפתוח את התמונה')); return; }
  if (!C || !IMG_RE.test(src)) return;
  const e = await imgLoad(src);
  if (!e.im) { toast(T('לא הצלחתי לפתוח את התמונה')); return; }
  const g = geom(page()), p = g.panels.find(q => q.id === pid) || placeFor();
  if (replaceId) { edit(() => { const x = findItem(replaceId); if (!x) return false; const r = coverBox(e.im.naturalWidth, e.im.naturalHeight, p.box); Object.assign(x, { src, ...r }); }); return; }
  // a picture goes under the panel's drawing, before anything else in the panel
  const it = { id: rid('i'), t: 'img', src, ...coverBox(e.im.naturalWidth, e.im.naturalHeight, p.box) };
  if (p.id) { it.pn = p.id; it.fit = true; }
  edit(() => { page().its.unshift(it); SEL = { k: 'item', id: it.id }; });
  sideUI(); ribbonUI();
}
function pickImage(pid, replaceId) {
  const target = pid || targetPanel(true);
  const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) imageItem(f, target, replaceId); });
  document.body.append(inp);
  inp.click();
}

/* =========================================================
   drawing in a panel: the drawing's own view takes the window (#drawView, with the drawing's tabs), showing this
   panel's drawing, which is the page's size and seen only inside the panel; the rest of the page shows around it.
   Everything drawn there is one step here when it is done
   ========================================================= */
const emptyArt = b => !b || !b.includes('data:image/');
async function drawPanel(pid) {
  if (!C || DRAWING || !LOADED) return;
  pid = pid || targetPanel();
  if (!pid) return;
  commitText(); endAct(true); liveEnd();
  const K = window.INK_DRAW, pg = page(), p = geom(pg).panels.find(q => q.id === pid);
  if (!p || !p.P || !K || !K.embed) return;
  const cur = LOADED, pgId = pg.id;
  const busy = toast(T('פותח את המשבצת לציור…'), { icon: 'brush', ms: 30000 });
  try { await prepare(pg); } catch {}
  if (C === null || LOADED !== cur || DRAWING || page().id !== pgId) { busy.remove(); return; }
  const under = newCanvas(C.w, C.h), over = newCanvas(C.w, C.h);
  drawPage(under.getContext('2d'), pg, { skip: pid, layer: 'under' });
  drawPage(over.getContext('2d'), pg, { skip: pid, layer: 'over' });
  const before = (pg.pan[pid] && pg.pan[pid].art) || '';
  const pan = () => { if (!C || LOADED !== cur) return null; const g0 = C.pages.find(q => q.id === pgId); return g0 ? g0.pan[pid] || (g0.pan[pid] = { bg: '#ffffff', art: '', nt: '' }) : null; };
  const host = {
    body: before || K.blank(C.w, C.h, ''), under, over, clip: p.P.map(q => [r1(q.x), r1(q.y)]), focus: pad(p.box, 0.04),
    onBody: b => { if (S.cur !== cur) return; const x = pan(); if (x) { x.art = b; markDirty(); } },
    dirty: () => { if (S.cur === cur && !cur.isSample) setSave('dirty'); },
    done: () => endDraw(),
  };
  DRAWING = { pid, pgId, pre: snap(), before, host };
  $('#app').classList.add('cdraw');
  selectTab(PREFS.wtab === 'dwfx' ? 'dwfx' : 'dwhome');
  const ok = await K.embed(host).catch(e => { console.error(e); return false; });
  busy.remove();
  if (DRAWING && DRAWING.host === host) {
    if (!ok) { endDraw(); toast(T('לא הצלחתי לפתוח את המשבצת לציור')); return; }
    selectTab(PREFS.wtab === 'dwfx' ? 'dwfx' : 'dwhome');
  }
}
function endDraw() {
  const d = DRAWING;
  if (!d) return;
  DRAWING = null;
  const out = window.INK_DRAW.unembed();
  freeCanvas(d.host.under); freeCanvas(d.host.over);
  $('#app').classList.remove('cdraw');
  if (!C || !LOADED || S.cur !== LOADED) return;
  const g0 = C.pages.find(q => q.id === d.pgId), x = g0 && g0.pan[d.pid];
  if (x && out != null) x.art = emptyArt(out) ? '' : out;
  if (x && (x.art || '') !== d.before) { push(d.pre); changed(); }
  selectTab(COMIC_TABS.includes(PREFS.ctab) ? PREFS.ctab : 'cmhome');
  if (g0) C.p = C.pages.indexOf(g0);
  SEL = { k: 'panel', id: d.pid };
  stripUI(); sideUI(); ribbonUI(); stat();
  requestAnimationFrame(() => { if (NEED_FIT) fit(); else paint(); });
}

/* =========================================================
   reading: the whole window, a page at a time (swiped, clicked or with the arrows), or a panel at a time, which
   moves and zooms from one panel to the next in the order they are read (good on a phone)
   ========================================================= */
let READ = null;
function readerPanels(pg) { return geom(pg).panels.filter(p => p.P); }
async function pageUrl(pg) {
  const R = READ;
  if (!R) return '';
  if (R.urls.has(pg.id)) return R.urls.get(pg.id);
  const job = (async () => {
    const k = Math.min(1, 2600 / Math.max(C.w, C.h)), c = await pageCanvas(pg, k);
    const b = await toBlob(c, 'image/jpeg', 0.92);
    freeCanvas(c);
    return URL.createObjectURL(b);
  })();
  R.urls.set(pg.id, job);
  const url = await job;
  if (READ !== R) { URL.revokeObjectURL(url); return ''; }
  R.urls.set(pg.id, url);
  // only the pages near the one being read stay
  const near = new Set([R.i - 1, R.i, R.i + 1].map(j => C.pages[j] && C.pages[j].id));
  for (const [id, u] of R.urls) if (!near.has(id) && typeof u === 'string') { URL.revokeObjectURL(u); R.urls.delete(id); }
  return url;
}
function openReader(at = C ? C.p : 0) {
  if (!C || READ) return;
  commitText(); endAct(true); liveEnd();
  const p0 = cprefs(), rtl = C.dir === 'rtl';
  const ov = h('div', { class: 'cm-read', tabindex: '-1', role: 'dialog', 'aria-modal': 'true', 'aria-label': T('קריאה') });
  const R = READ = { ov, i: clamp(at, 0, C.pages.length - 1), k: 0, mode: p0.rmode === 'panel' || p0.rmode === 'page' ? p0.rmode : (isNarrow() ? 'panel' : 'page'), urls: new Map(), cur: null, busy: false, idle: 0 };
  R.st = h('div', { class: 'cm-rst' });
  R.num = h('span', { class: 'cm-rn' });
  const modeBtn = (m, ic, label) => h('button', { type: 'button', 'data-m': m, title: label, onclick: () => setMode(m) }, icon(ic), h('span', { text: label }));
  R.modes = [modeBtn('page', 'description', T('דף שלם')), modeBtn('panel', 'crop_free', T('משבצת אחרי משבצת'))];
  R.bar = h('div', { class: 'cm-rbar' },
    h('button', { type: 'button', title: T('סגירה (Esc)'), 'aria-label': T('סגירה'), onclick: () => closeReader() }, icon('close')),
    h('span', { class: 'grow', text: displayTitle(LOADED.meta) }), R.num, ...R.modes,
    document.documentElement.requestFullscreen ? h('button', { type: 'button', title: T('מסך מלא'), 'aria-label': T('מסך מלא'), onclick: () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else ov.requestFullscreen().catch(() => {}); } }, icon('fullscreen')) : null);
  // the arrows at the sides: the next page is on the side the comic goes to
  const nav = (side, step) => h('button', { class: 'cm-rnav ' + side, type: 'button', title: step > 0 ? T('הבא') : T('הקודם'), 'aria-label': step > 0 ? T('הבא') : T('הקודם'), onclick: e => { e.stopPropagation(); readGo(step); } }, icon(side === 'l' ? 'chevron_left' : 'chevron_right'));
  R.navs = [nav('l', rtl ? 1 : -1), nav('r', rtl ? -1 : 1)];
  ov.append(R.st, R.bar, ...R.navs);
  document.body.append(ov);
  ov.focus();
  ov.addEventListener('keydown', readKey);
  ov.addEventListener('pointerdown', readDown);
  ov.addEventListener('pointermove', readMove);
  ov.addEventListener('pointerup', readUp);
  ov.addEventListener('pointercancel', readUp);
  ov.addEventListener('wheel', e => { e.preventDefault(); if (R.wheelT && performance.now() - R.wheelT < 450) return; if (Math.abs(e.deltaY) + Math.abs(e.deltaX) < 8) return; R.wheelT = performance.now(); readGo((e.deltaY || e.deltaX) > 0 ? 1 : -1); }, { passive: false });
  R.onResize = () => place(false);
  addEventListener('resize', R.onResize);
  modeUI();
  show(R.i, R.mode === 'panel' ? 0 : 0, 0);
  barSoon();
}
function closeReader() {
  const R = READ;
  if (!R) return;
  READ = null;
  removeEventListener('resize', R.onResize);
  if (document.fullscreenElement === R.ov) document.exitFullscreen().catch(() => {});
  R.ov.remove();
  for (const u of R.urls.values()) if (typeof u === 'string') URL.revokeObjectURL(u);
  if (C && LOADED && S.cur === LOADED && R.i !== C.p) goPage(R.i);
}
function setMode(m) {
  const R = READ;
  if (!R || R.mode === m) return;
  R.mode = m; R.k = 0;
  cprefs().rmode = m; savePrefs();
  modeUI(); place(true);
}
function modeUI() {
  const R = READ;
  for (const b of R.modes) b.classList.toggle('on', b.dataset.m === R.mode);
  R.num.textContent = R.mode === 'panel' && R.cur ? `${T('דף {0} מתוך {1}', R.i + 1, C.pages.length)} · ${T('משבצת {0}', R.k + 1)}` : T('דף {0} מתוך {1}', R.i + 1, C.pages.length);
}
/* the page's place on the screen: all of it, or zoomed onto one panel */
function viewFor(pg, k) {
  const vw = innerWidth, vh = innerHeight, fitK = Math.min(vw / C.w, vh / C.h) * (READ.mode === 'panel' ? 1 : 0.97);
  if (READ.mode !== 'panel') return { s: fitK, x: (vw - C.w * fitK) / 2, y: (vh - C.h * fitK) / 2 };
  const p = readerPanels(pg)[k];
  if (!p) return { s: fitK, x: (vw - C.w * fitK) / 2, y: (vh - C.h * fitK) / 2 };
  const b = pad(p.box, 0.03), s = Math.min(vw * 0.96 / b.w, vh * 0.9 / b.h, fitK * 6);
  return { s, x: vw / 2 - (b.x + b.w / 2) * s, y: vh / 2 - (b.y + b.h / 2) * s };
}
/* a page's element: its picture, and over it the dark around the panel being read */
function pageEl(pg) {
  const img = h('img', { alt: T('דף {0}', C.pages.indexOf(pg) + 1), draggable: 'false' });
  const wrap = h('div', { class: 'cm-rw', style: { width: C.w + 'px', height: C.h + 'px' } }, img);
  wrap.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${C.w} ${C.h}" aria-hidden="true"><path fill="#0d0f14" fill-opacity=".93" fill-rule="evenodd" d=""/></svg>`);
  const el = h('div', { style: { position: 'absolute', inset: '0' } }, wrap);
  pageUrl(pg).then(u => { if (u) img.src = u; });
  return { el, wrap, img, mask: wrap.querySelector('path'), pg };
}
function place(anim) {
  const R = READ;
  if (!R || !R.cur) return;
  const pg = R.cur.pg, v = viewFor(pg, R.k), p = R.mode === 'panel' && readerPanels(pg)[R.k];
  R.cur.wrap.classList.toggle('anim', !!anim);
  R.cur.wrap.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.s})`;
  R.cur.mask.setAttribute('d', p ? `M0 0H${C.w}V${C.h}H0Z` + 'M' + p.P.map(q => `${r1(q.x)} ${r1(q.y)}`).join('L') + 'Z' : '');
  R.cur.wrap.querySelector('svg').style.opacity = p ? '1' : '0';
  modeUI();
}
/* page i on screen (panel k), coming from the side the reading goes to (dir 1 forward, -1 back, 0 just there) */
function show(i, k, dir) {
  const R = READ;
  const pg = C.pages[i], old = R.cur, n = pageEl(pg);
  R.i = i; R.k = k; R.cur = n;
  R.st.append(n.el);
  place(false);
  const rtl = C.dir === 'rtl', vw = innerWidth, from = dir === 0 ? 0 : (dir > 0) === rtl ? -vw : vw;
  if (old) {
    if (dir && n.el.animate) {
      n.el.animate([{ transform: `translateX(${from}px)` }, { transform: 'translateX(0)' }], { duration: 380, easing: 'cubic-bezier(.22,.7,.2,1)' });
      const a = old.el.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-from}px)`, opacity: 0.4 }], { duration: 380, easing: 'cubic-bezier(.22,.7,.2,1)' });
      a.onfinish = () => old.el.remove();
    } else old.el.remove();
  }
  for (const j of [i + 1, i - 1]) if (C.pages[j]) pageUrl(C.pages[j]);
}
function readGo(step) {
  const R = READ;
  if (!R || !R.cur) return;
  const n = readerPanels(R.cur.pg).length;
  if (R.mode === 'panel' && R.k + step >= 0 && R.k + step < n) { R.k += step; place(true); return; }
  const j = R.i + step;
  if (j < 0 || j >= C.pages.length) { readEnd(step); return; }
  show(j, R.mode === 'panel' && step < 0 ? Math.max(0, readerPanels(C.pages[j]).length - 1) : 0, step);
}
function readEnd(step) {
  const R = READ;
  if (R.endEl) R.endEl.remove();
  R.endEl = h('div', { class: 'cm-rend' }, h('div', { text: step > 0 ? T('זה הסוף') : T('זה הדף הראשון') }));
  R.ov.append(R.endEl);
  const el = R.endEl;
  setTimeout(() => el.remove(), 1400);
}
function barSoon() {
  const R = READ;
  if (!R) return;
  R.bar.classList.remove('off'); for (const b of R.navs) b.classList.remove('off');
  clearTimeout(R.idle);
  R.idle = setTimeout(() => { if (READ !== R) return; R.bar.classList.add('off'); for (const b of R.navs) b.classList.add('off'); }, 2600);
}
function readKey(e) {
  const R = READ;
  if (!R) return;
  const rtl = C.dir === 'rtl', k = e.key;
  const go = s => { e.preventDefault(); e.stopPropagation(); readGo(s); };
  if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); closeReader(); return; }
  if (k === 'F5') { e.preventDefault(); e.stopPropagation(); return; }
  if (k === 'ArrowLeft') return go(rtl ? 1 : -1);
  if (k === 'ArrowRight') return go(rtl ? -1 : 1);
  if (k === ' ' || k === 'Enter' || k === 'PageDown' || k === 'ArrowDown') return go(e.shiftKey && k === ' ' ? -1 : 1);
  if (k === 'PageUp' || k === 'ArrowUp' || k === 'Backspace') return go(-1);
  if (k === 'Home') { e.preventDefault(); if (R.i) show(0, 0, -1); return; }
  if (k === 'End') { e.preventDefault(); if (R.i < C.pages.length - 1) show(C.pages.length - 1, 0, 1); return; }
  if (k === 'f' || k === 'F') { e.preventDefault(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else R.ov.requestFullscreen && R.ov.requestFullscreen().catch(() => {}); }
}
/* a finger: swiping goes to the next page or panel (to the right for a comic read from right to left), a tap at a
   side goes that way, a tap in the middle shows or hides the bar */
function readDown(e) {
  const R = READ;
  if (!R || e.target.closest('.cm-rbar,.cm-rnav') || e.button > 0) return;
  R.sw = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
  try { R.ov.setPointerCapture(e.pointerId); } catch {}
}
function readMove(e) {
  const R = READ;
  if (!R) return;
  if (e.pointerType !== 'touch') barSoon();
  const s = R.sw;
  if (!s || s.id !== e.pointerId || R.mode !== 'page' || !R.cur) return;
  const dx = e.clientX - s.x;
  if (Math.abs(dx) > 8) R.cur.el.style.transform = `translateX(${dx}px)`;
}
function readUp(e) {
  const R = READ;
  if (!R) return;
  const s = R.sw;
  if (!s || s.id !== e.pointerId) return;
  R.sw = null;
  if (R.cur) R.cur.el.style.transform = '';
  if (e.type !== 'pointerup') return;
  const dx = e.clientX - s.x, dy = e.clientY - s.y, dt = performance.now() - s.t, rtl = C.dir === 'rtl';
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) { readGo((dx > 0) === rtl ? 1 : -1); return; }
  if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 500) {
    const third = innerWidth / 3;
    if (e.clientX < third) readGo(rtl ? 1 : -1);
    else if (e.clientX > 2 * third) readGo(rtl ? -1 : 1);
    else if (R.mode === 'panel') readGo(1);
    else if (R.bar.classList.contains('off')) barSoon();
    else { clearTimeout(R.idle); R.bar.classList.add('off'); for (const b of R.navs) b.classList.add('off'); }
  }
}

/* =========================================================
   the view's parts and what they do
   ========================================================= */
function css() { if (!document.getElementById('comiccss')) document.head.append(h('style', { id: 'comiccss' }, CSS)); addFonts(); }
function mount() {
  if (V.vp) return;
  css();
  const tabs = $('#tabs');
  for (const [k, label] of [['cmhome', T('קומיקס')], ['cmfx', T('אפקטים')], ['cmpage', T('דף')]]) tabs.append(h('button', { class: 'tab comic-only', role: 'tab', 'data-tab': k, 'aria-selected': 'false' }, label));
  const rb = $('#ribbon');
  for (const p of ribbonPanels()) rb.append(p);
  const view = $('#comicView');
  view.querySelectorAll('.cm-wait').forEach(n => n.remove());
  V.list = h('div', { class: 'cm-list', role: 'listbox', 'aria-label': T('דפים') });
  V.strip = h('div', { class: 'cm-strip' }, V.list, h('button', { class: 'btn small cm-add', type: 'button', 'data-cmd': 'cmPageAdd', title: T('דף חדש') }, icon('add'), T('דף')));
  V.cv = h('canvas', { class: 'cm-cv' });
  V.cx = V.cv.getContext('2d');
  V.ta = h('textarea', { class: 'cm-ta', hidden: true, 'aria-label': T('המילים'), spellcheck: 'false' });
  V.vp = h('div', { class: 'cm-vp', tabindex: '-1', 'aria-label': T('דף הקומיקס') }, V.cv, V.ta);
  V.zp = h('button', { class: 'rb', type: 'button', 'data-cmd': 'cmZoom', 'data-arg': 'fit', title: T('כל הדף (Ctrl+0)') }, '100%');
  V.pgn = h('span', { class: 'cm-pgn', 'aria-live': 'polite' });
  const back = UI_DIR === 'rtl' ? 'chevron_right' : 'chevron_left', fwd = UI_DIR === 'rtl' ? 'chevron_left' : 'chevron_right';
  V.bar = h('div', { class: 'cm-bar' },
    rbtn('cmSide', 'tune', T('הגדרות'), { cls: 'cm-stog' }), h('i'),
    rbtn('cmPrev', back, T('הדף הקודם (PageUp)')), V.pgn, rbtn('cmNext', fwd, T('הדף הבא (PageDown)')), h('i'),
    rbtn('cmZoom', 'remove', T('הקטנה'), { arg: 'out' }), V.zp, rbtn('cmZoom', 'add', T('הגדלה@zoom'), { arg: 'in' }));
  V.main = h('div', { class: 'cm-main' }, V.vp, V.bar);
  V.stitle = h('span', { class: 'grow' });
  V.sbody = h('div', { class: 'cm-sb' });
  V.side = h('aside', { class: 'cm-side', 'aria-label': T('הגדרות') }, h('div', { class: 'cm-sh' }, icon('tune'), V.stitle, rbtn('cmSide', 'close', T('סגירה'))), V.sbody);
  V.side.hidden = SMALL ? true : cprefs().side === false;
  view.append(h('div', { class: 'cm-body' }, V.strip, V.main, V.side));
  document.body.append(V.print = h('div', { id: 'comicPrint', 'aria-hidden': 'true' }));
  const vp = V.vp;
  vp.addEventListener('pointerdown', onDown);
  vp.addEventListener('pointermove', onMove);
  vp.addEventListener('pointerup', onUp);
  vp.addEventListener('pointercancel', onUp);
  vp.addEventListener('pointerleave', () => { if (!ACT && HOVER) { HOVER = null; paint(); } });
  vp.addEventListener('wheel', onWheel, { passive: false });
  vp.addEventListener('contextmenu', e => e.preventDefault());
  vp.addEventListener('dblclick', e => e.preventDefault());
  for (const k of ['gesturestart', 'gesturechange']) vp.addEventListener(k, e => e.preventDefault());
  vp.addEventListener('dragover', e => { if ([...(e.dataTransfer.items || [])].some(i => i.kind === 'file' && /^image\//.test(i.type))) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  vp.addEventListener('drop', e => {
    const f = C && [...(e.dataTransfer.files || [])].find(x => /^image\//.test(x.type));
    if (!f) return;
    e.preventDefault(); e.stopPropagation();
    imageItem(f, panelAt(toPage(viewPt(e))));
  });
  if (window.ResizeObserver) new ResizeObserver(() => { if (!C || DRAWING) return; if (NEED_FIT) fit(); else { keepInView(); viewChanged(); } }).observe(vp);
  V.ta.addEventListener('input', onTextInput);
  V.ta.addEventListener('blur', () => { if (EDIT) commitText(); });
  document.addEventListener('keyup', e => { if (e.code === 'Space' && SPACE) { SPACE = false; setCursor(''); } });
  addEventListener('blur', () => { SPACE = false; });
  document.addEventListener('paste', e => {
    if (!C || !LOADED || S.cur !== LOADED || DRAWING || READ || MODALS.length) return;
    if (e.target && e.target.closest && e.target.closest('input,textarea,[contenteditable="true"]')) return;
    const item = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.kind === 'file' && /^image\//.test(i.type)), f = item && item.getAsFile();
    // a picture from the computer goes into the chosen panel; otherwise what Ctrl+C copied here comes back
    if (f) { e.preventDefault(); imageItem(f, targetPanel(true)); }
    else if (CLIP) { e.preventDefault(); pasteItem(); }
  });
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => { LAY.clear(); if (C) { paint(); placeText(); } });
  stripEvents();
  Object.assign(CMD, COMMANDS);
  if (COMIC_TABS.includes(S.tab)) selectTab(S.tab);
}
function toggleSide(on) {
  if (!V.side) return;
  on = typeof on === 'boolean' ? on : V.side.hidden;
  V.side.hidden = !on;
  if (!SMALL) { cprefs().side = on; savePrefs(); }
  for (const b of document.querySelectorAll('.cm-stog')) b.classList.toggle('on', on);
  if (on) sideUI();
}
function stat() {
  if (!C || !LOADED || S.cur !== LOADED) return;
  $('#stPage').textContent = T('דף {0} מתוך {1}', C.p + 1, C.pages.length);
  $('#stWords').textContent = wordsLabel(countWords(textOf(C)));
  if (V.pgn) V.pgn.textContent = `${C.p + 1} / ${C.pages.length}`;
}
const COMMANDS = {
  cmUndo: () => undo(), cmRedo: () => redo(),
  cmPageAdd: () => addPage(), cmPageDup: () => addPage(C.p + 1, true), cmPageDel: () => delPage(),
  cmLayout: (a, b) => layoutPop(b), cmSplit: a => splitPanel(a), cmMerge: () => mergePanel(),
  cmDraw: () => drawPanel(), cmImage: () => pickImage(),
  cmBub: a => addBubble(a), cmAdd: a => addFx(a),
  cmOrder: a => orderItem(a), cmDup: () => dupItem(), cmDel: () => delItem(),
  cmDir: a => setDir(a === 'ltr' ? 'ltr' : 'rtl'),
  cmNotes: () => { const p = cprefs(); p.notes = p.notes === false; savePrefs(); ribbonUI(); paint(); },
  cmRead: () => openReader(), cmPng: () => pngDialog(),
  cmZoom: a => { if (a === 'in') zoomBy(1.25); else if (a === 'out') zoomBy(0.8); else fit(); },
  cmPrev: () => goPage(C.p - 1), cmNext: () => goPage(C.p + 1),
  cmSide: () => toggleSide(),
};

/* =========================================================
   opening and closing a comic
   ========================================================= */
function reset() {
  if (DRAWING) endDraw();
  closeReader();
  if (EDIT) { EDIT = null; if (V.ta) V.ta.hidden = true; }
  C = null; LOADED = null; SEL = null; HOVER = null; ACT = null; LIVE = null; NUDGE = null;
  PTR.clear();
  HIST.steps = []; HIST.at = 0;
  thumbSoon.cancel(); nudgeEnd.cancel();
  for (const e of ART.values()) freeCanvas(e.cv);
  ART.clear(); IMGS.clear(); GEOM.clear(); PATHS.clear();
  if (V.list) V.list.textContent = '';
  if (V.sbody) V.sbody.textContent = '';
  if (V.cx) { V.cx.setTransform(1, 0, 0, 1, 0, 0); V.cx.clearRect(0, 0, V.cv.width, V.cv.height); }
}
async function load(html, cur) {
  mount();
  GEN++;
  reset();
  LOADED = cur;
  C = parseBody(html);
  NEED_FIT = true;
  stripUI(); sideUI(); ribbonUI(); stat();
  for (const b of document.querySelectorAll('.cm-stog')) b.classList.toggle('on', !V.side.hidden);
  fit();
  const gen = GEN;
  prepare(page()).then(() => { if (gen === GEN) paint(); }).catch(() => {});
  if (!cur.isSample && !(typeof cur.meta.thumb === 'string' && cur.meta.thumb.startsWith('data:image/'))) thumbSoon();
}
/* another body in place of this one (a version brought back, a draft found), as one step that can be undone */
function replace(html) {
  if (!C) return;
  if (DRAWING) endDraw();
  edit(() => { const n = parseBody(html); n.p = clamp(C.p, 0, n.pages.length - 1); C = n; SEL = null; });
  stripUI(); sideUI(); ribbonUI(); stat(); fit();
}
const body = cur => C && LOADED === cur ? bodyOf(C) : null;
/* everything still on its way into the comic goes in now: the panel being drawn in, the words being written, a slider */
function flush() {
  if (!C) return false;
  if (DRAWING) window.INK_DRAW.flush();
  commitText(); liveEnd();
  if (NUDGE) { nudgeEnd.cancel(); push(NUDGE); NUDGE = null; changed(); }
  return true;
}
/* the versions window: the pages' small pictures */
function preview(html) {
  const c = parseBody(html);
  return h('div', { class: 'cm-verpages' }, c.pages.map((pg, i) => pg.th ? h('img', { src: pg.th, alt: T('דף {0}', i + 1) }) : h('div', { class: 'ph', style: { aspectRatio: `${c.w} / ${c.h}`, background: '#fff' } })));
}

/* =========================================================
   files: PDF (a page for each page, in the comic's own size), PNG for a page or all of them, and printing
   ========================================================= */
async function pdf() {
  flush();
  await loadScript(LIB.jspdf);
  const J = window.jspdf && window.jspdf.jsPDF;
  if (!J || !C) throw new Error('lib');
  const c0 = C, W = c0.w * 72 / c0.dpi, H = c0.h * 72 / c0.dpi, o = W > H ? 'landscape' : 'portrait';
  const doc = new J({ orientation: o, unit: 'pt', format: [W, H], compress: true });
  for (let i = 0; i < c0.pages.length; i++) {
    if (C !== c0) throw new Error('closed');
    const cv = await pageCanvas(c0.pages[i], 1);
    if (i) doc.addPage([W, H], o);
    doc.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, H);
    freeCanvas(cv);
  }
  return doc.output('blob');
}
function pngDialog() {
  if (!C) return;
  flush();
  let all = false;
  const seg = h('div', { class: 'seg', role: 'tablist' });
  const draw = () => { seg.textContent = ''; for (const [k, ic, label] of [[false, 'image', T('הדף הזה')], [true, 'photo_library', T('כל הדפים')]]) seg.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(all === k), onclick: () => { all = k; draw(); } }, icon(ic), label)); };
  draw();
  modal({ title: T('שמירה כתמונות'), body: h('div', {}, seg, h('p', { class: 'muted small', text: T('כל דף נשמר כתמונת PNG בגודל המלא שלו. כמה דפים נשמרים יחד בקובץ ZIP.') })),
    actions: [{ label: T('שמירה'), kind: 'primary', icon: 'download', run: () => { savePngs(all); } }, { label: T('ביטול'), value: false }] });
}
async function savePngs(all) {
  const c0 = C, list = all ? c0.pages.map((_, i) => i) : [c0.p], name = safeName(displayTitle(LOADED.meta)), what = T('מכין את התמונות…');
  const t = toast(what, { icon: 'hourglass_top', ms: 900000 }), txt = t.querySelector('span:not(.ms)');
  try {
    const files = [];
    for (const [n, i] of list.entries()) {
      if (C !== c0) throw new Error('closed');
      const cv = await pageCanvas(c0.pages[i], 1);
      files.push([i, await toBlob(cv)]); freeCanvas(cv);
      if (txt) txt.textContent = `${what} ${Math.round((n + 1) / list.length * 100)}%`;
    }
    const num = i => String(i + 1).padStart(String(c0.pages.length).length, '0');
    if (files.length === 1) { t.remove(); await offerFile(`${name} ${num(files[0][0])}.png`, files[0][1]); return; }
    await loadScript(LIB.pptx);   // JSZip comes with it
    const z = new window.JSZip();
    for (const [i, b] of files) z.file(`${name} ${num(i)}.png`, b);
    const zip = await z.generateAsync({ type: 'blob' });
    t.remove();
    await offerFile(`${name}.zip`, zip);
  } catch (e) {
    console.error(e); t.remove();
    toast(e && e.message === 'lib' ? T('לא הצלחתי לטעון את כלי השמירה. כדאי לבדוק את החיבור לאינטרנט.') : T('לא הצלחתי להכין את הקובץ. כדאי לנסות שוב.'), { ms: 7000 });
  }
}
async function print() {
  if (!C) return null;
  flush();
  const rule = $('#pageRule'), before = rule.textContent, k = Math.min(1, 2000 / Math.max(C.w, C.h));
  V.print.textContent = '';
  for (const pg of C.pages) {
    const cv = await pageCanvas(pg, k);
    V.print.append(h('img', { src: cv.toDataURL('image/jpeg', 0.92), alt: '' }));
    freeCanvas(cv);
  }
  rule.textContent = `@page{size:${(C.w / C.dpi).toFixed(3)}in ${(C.h / C.dpi).toFixed(3)}in;margin:0}`;
  await Promise.race([Promise.all([...V.print.querySelectorAll('img')].map(im => im.decode().catch(() => {}))), sleep(2500)]);   // decode can wait forever in a hidden window
  document.documentElement.classList.add('comic-print');
  return () => { document.documentElement.classList.remove('comic-print'); V.print.textContent = ''; rule.textContent = before; };
}

/* =========================================================
   a new comic: the "New" window's part (size, the way it is read, how the first page is cut)
   ========================================================= */
function chooser(box, close) {
  css();
  box.textContent = '';
  const p = cprefs();
  let size = SIZES.some(s => s.k === p.size) ? p.size : 'comic', dir = p.dir === 'ltr' || p.dir === 'rtl' ? p.dir : UI_DIR, lay = PRESET_KEYS.includes(p.lay) ? p.lay : 'r212';
  const sizes = h('div', { class: 'cm-sizes', role: 'radiogroup', 'aria-label': T('גודל הדף') }), dirs = h('div', { class: 'cm-dirs', role: 'radiogroup', 'aria-label': T('כיוון קריאה') }), gal = h('div', { class: 'cm-newgal' });
  const draw = () => {
    sizes.textContent = ''; dirs.textContent = ''; gal.textContent = '';
    for (const s of SIZES) {
      const k = 46 / Math.max(s.w, s.h);
      sizes.append(h('button', { class: 'cm-size', type: 'button', role: 'radio', 'aria-checked': String(size === s.k), onclick: () => { size = s.k; draw(); } },
        h('i', { style: { width: Math.round(s.w * k) + 'px', height: Math.round(s.h * k) + 'px' } }), h('b', { text: T(s.n) }), h('span', { text: T(s.d) })));
    }
    for (const [d, ic, n, sub] of [['rtl', 'format_textdirection_r_to_l', T('מימין לשמאל'), T('מנגה, וקומיקס בעברית')], ['ltr', 'format_textdirection_l_to_r', T('משמאל לימין'), T('קומיקס באנגלית')]])
      dirs.append(h('button', { class: 'cm-dirb', type: 'button', role: 'radio', 'aria-checked': String(dir === d), onclick: () => { dir = d; draw(); } }, icon(ic), h('b', { text: n }), h('span', { text: sub })));
    const sz = SIZES.find(s => s.k === size);
    const g = layoutGalleryFor(k => { lay = k; draw(); }, lay, dir, sz.w, sz.h);
    gal.append(g);
  };
  draw();
  const go = h('button', { class: 'btn primary', type: 'button' }, icon('auto_stories'), T('יצירת קומיקס'));
  go.addEventListener('click', async () => {
    Object.assign(p, { size, dir, lay }); savePrefs(); close();
    await createDoc({ html: blankBody({ size, dir, lay }), kind: 'comic' });
  });
  box.append(h('div', { class: 'cm-h4', text: T('גודל הדף') }), sizes, h('div', { class: 'cm-h4', text: T('כיוון קריאה') }), dirs,
    h('div', { class: 'cm-h4', text: T('החלוקה של הדף הראשון') }), gal, h('div', { class: 'cm-go' }, h('span', { class: 'muted small grow', text: T('אפשר לשנות את החלוקה של כל דף גם אחר כך') }), go));
}
/* the gallery for a page of this size (the New window has no comic open yet) */
function layoutGalleryFor(pick, cur, dir, w, hh) {
  const box = h('div', { class: 'cm-gal', role: 'listbox', 'aria-label': T('חלוקה') });
  for (const [g, name] of [['grid', T('רשת')], ['rows', T('שורות')], ['manga', T('מנגה, באלכסון')]]) {
    box.append(h('h6', { text: name }));
    for (const p of PRESETS.filter(x => x.g === g)) {
      const lay = preset(p.k, dir);
      box.append(h('button', { class: 'cm-lay' + (cur === p.k ? ' on' : ''), type: 'button', role: 'option', 'aria-selected': String(cur === p.k), title: TN('{n} משבצות', leafIds(lay).length), onclick: () => pick(p.k) }, layoutSvg(lay, w, hh, dir)));
    }
  }
  return box;
}

/* =========================================================
   Claude, through the connector: a story becomes pages and panels with what is said in them, and a note in each panel
   of what to draw there. The drawing itself is the user's
   ========================================================= */
const AI_MAX_PAGES = 60;
const BUB_NAMES = { speech: 'speech', say: 'speech', talk: 'speech', thought: 'thought', think: 'thought', shout: 'shout', yell: 'shout', scream: 'shout', whisper: 'whisper', narration: 'box', narrator: 'box', caption: 'box', box: 'box' };
const kindOf = k => BUB_NAMES[String(k == null ? 'speech' : k).toLowerCase()];
const EFFECTS = ['speed', 'focus', 'tone'];
function aiCheckPage(pg, n) {
  if (!pg || typeof pg !== 'object') throw new Error(`Page ${n}: give an object with "panels".`);
  const panels = Array.isArray(pg.panels) ? pg.panels : [];
  if (!panels.length) throw new Error(`Page ${n}: "panels" is empty. A page has 1 to 9 panels.`);
  if (pg.layout != null && !PRESET_KEYS.includes(pg.layout)) throw new Error(`Page ${n}: there is no layout "${pg.layout}". The layouts: ${PRESET_KEYS.join(', ')}.`);
  const want = pg.layout ? leafIds(preset(pg.layout)).length : null;
  if (want && want !== panels.length) throw new Error(`Page ${n}: layout "${pg.layout}" has ${want} panels, and ${panels.length} were given.`);
  if (!want && !BY_COUNT[panels.length]) throw new Error(`Page ${n} has ${panels.length} panels; a page holds 1 to 9. Put the rest on the next page.`);
  panels.forEach((p, j) => {
    if (!p || typeof p !== 'object') throw new Error(`Page ${n}, panel ${j + 1}: give an object.`);
    for (const b of Array.isArray(p.bubbles) ? p.bubbles : []) {
      if (!b || !kindOf(b.kind)) throw new Error(`Page ${n}, panel ${j + 1}: there is no bubble kind "${b && b.kind}". The kinds: speech, thought, shout, whisper, narration.`);
      if (typeof b.text !== 'string' || !b.text.trim()) throw new Error(`Page ${n}, panel ${j + 1}: a bubble without text.`);
    }
    if (p.effect != null && !EFFECTS.includes(p.effect)) throw new Error(`Page ${n}, panel ${j + 1}: there is no effect "${p.effect}". The effects: speed, focus, tone.`);
  });
}
/* about how big a bubble must be for its words at the usual size: the words take about half of its box */
function bubbleSize(txt, fs, maxW, maxH) {
  const n = Math.max(4, Array.from(txt).length), A = n * fs * 0.6 * fs * 1.25 / 0.48;
  let w = Math.sqrt(A * 1.7), hh = A / w;
  if (w > maxW) { w = maxW; hh = A / w; }
  return { w, h: Math.min(hh, maxH) };
}
/* what Claude wrote for a panel, put in it: narration at the top on the side it is read from, then what is said,
   one under another and side to side, each tail toward the lower part where the characters will be drawn */
function fillPanel(pg, p, spec) {
  const u = unit(), b = p.box, rtl = C.dir === 'rtl', d = DEF.bub(u);
  if (typeof spec.note === 'string' && spec.note.trim()) pg.pan[p.id] = { bg: '#ffffff', art: '', ...(pg.pan[p.id] || {}), nt: spec.note.trim().slice(0, 3000) };
  const mine = pg.its.filter(it => it.t === 'bub' && b.x <= center(it).x && center(it).x <= b.x + b.w && b.y <= center(it).y && center(it).y <= b.y + b.h);
  let y = mine.length ? Math.max(...mine.map(it => it.y + it.h)) + 12 * u : b.y + 14 * u, side = mine.length;
  const bubs = (Array.isArray(spec.bubbles) ? spec.bubbles : []).map(x => ({ k: kindOf(x.kind), txt: String(x.text).trim().slice(0, 2000) }));
  for (const s of [...bubs.filter(x => x.k === 'box'), ...bubs.filter(x => x.k !== 'box')]) {
    const box = s.k === 'box', sz = bubbleSize(s.txt, d.fs * (box ? 0.8 : 1), b.w * (box ? 0.7 : 0.62), b.h * 0.42);
    const w = clamp(sz.w, 150 * u, b.w * 0.92), hh = clamp(sz.h, (box ? 60 : 100) * u, b.h * 0.6), first = side % 2 === 0;
    const x = box ? (rtl ? b.x + b.w - w - 10 * u : b.x + 10 * u) : (rtl === first) ? b.x + b.w - w - b.w * 0.04 : b.x + b.w * 0.04;
    const yy = Math.max(b.y + 8 * u, Math.min(y, b.y + b.h * 0.8 - hh)), fit = inside(p.P, { x, y: yy, w, h: hh }, 10 * u);
    const mid = fit.x + fit.w / 2, tx = mid + (b.x + b.w / 2 - mid) * 0.35;
    pg.its.push({ id: rid('i'), t: 'bub', k: s.k, x: fit.x, y: yy, w: fit.w, h: hh, txt: s.txt, f: d.f, fs: Math.round(d.fs * (box ? 0.8 : 1)), b: s.k === 'shout', fc: d.fc, fill: box ? '#fff6cc' : d.fill, sc: d.sc, sw: d.sw, tl: !box,
      tx, ty: Math.max(yy + hh + 30 * u, b.y + b.h * 0.78) });
    y = yy + hh * (box ? 1 : 0.8) + 8 * u;
    if (!box) side++;
  }
  (Array.isArray(spec.sounds) ? spec.sounds : Array.isArray(spec.sfx) ? spec.sfx : []).forEach((t, i) => {
    const txt = String(t || '').trim().slice(0, 300);
    if (!txt) return;
    const w = clamp(b.w * 0.5, 200 * u, 800 * u), hh = clamp(w * 0.42, 90 * u, b.h * 0.4);
    pg.its.push({ id: rid('i'), t: 'sfx', x: b.x + (b.w - w) / 2 + (i % 2 ? -1 : 1) * b.w * 0.08 * i, y: b.y + b.h * 0.55 - hh / 2 + i * hh * 0.4, w, h: hh, txt, ...DEF.sfx(u), r: i % 2 ? 8 : -8, sk: 0 });
  });
  if (EFFECTS.includes(spec.effect)) {
    const t = spec.effect, it = { id: rid('i'), t, x: b.x, y: b.y, w: b.w, h: b.h, pn: p.id, ...DEF[t](u) };
    if (t === 'speed') it.r = 0;
    if (t === 'focus') Object.assign(it, { cx: 0, cy: 0 });
    if (t === 'tone') Object.assign(it, { y: b.y + b.h * 0.55, h: b.h * 0.45, sh: 'rect', ang: 45, gr: true, gd: 90, un: true });
    pg.its.unshift(it);
  }
}
function aiPage(spec) {
  const panels = spec.panels, pg = newPage(C, preset(spec.layout || BY_COUNT[panels.length] || 'r212', C.dir)), g = geom(pg);
  g.panels.forEach((p, j) => { if (panels[j]) fillPanel(pg, p, panels[j]); });
  return pg;
}
/* a new comic's body from Claude's pages (index.html makes the document) */
function aiBlank(a = {}) {
  const pages = Array.isArray(a.pages) ? a.pages : [];
  if (pages.length > AI_MAX_PAGES) throw new Error(`At most ${AI_MAX_PAGES} pages at once; add the rest with edit_comic (add_pages).`);
  pages.forEach((pg, i) => aiCheckPage(pg, i + 1));
  if (a.size != null && !SIZES.some(s => s.k === a.size)) throw new Error(`There is no size "${a.size}". The sizes: ${SIZES.map(s => s.k).join(', ')}.`);
  const sz = SIZES.find(s => s.k === a.size) || SIZES[0];
  const said = pages.flatMap(pg => pg.panels.flatMap(p => (p.bubbles || []).map(b => b.text))).join(' ');
  const dir = a.direction === 'ltr' || a.direction === 'left_to_right' ? 'ltr' : a.direction === 'rtl' || a.direction === 'right_to_left' ? 'rtl' : textDir(said, UI_DIR);
  const c = { v: 1, dir, size: sz.k, w: sz.w, h: sz.h, dpi: sz.dpi, p: 0, pages: [] };
  const was = C;
  C = c;
  try { for (const spec of pages.length ? pages : [{ panels: [{}, {}, {}, {}, {}] }]) c.pages.push(aiPage(spec)); }
  finally { C = was; }
  return JSON.stringify(c);
}
const pageAt = (n, k) => { const i = Math.round(+n) - 1; if (!(i >= 0 && i < C.pages.length)) throw new Error(`Change ${k}: there is no page ${n} (the comic has ${C.pages.length}).`); return i; };
function panelAtN(pg, n, k) {
  const ps = geom(pg).panels, i = Math.round(+n) - 1;
  if (!(i >= 0 && i < ps.length)) throw new Error(`Change ${k}: there is no panel ${n} on that page (it has ${ps.length}, numbered in reading order).`);
  return ps[i];
}
function itemAt(pg, id, k) { const it = pg.its.find(x => x.id === id); if (!it) throw new Error(`Change ${k}: there is no item "${id}" on that page. read_document lists the ids.`); return it; }
function aiOp(op, k) {
  const a = op && op.action;
  if (a === 'add_pages') {
    const list = Array.isArray(op.pages) ? op.pages : [];
    if (!list.length) throw new Error(`Change ${k}: "pages" is empty.`);
    if (C.pages.length + list.length > MAX_PAGES) throw new Error(`Change ${k}: a comic has at most ${MAX_PAGES} pages.`);
    list.forEach((pg, i) => aiCheckPage(pg, i + 1));
    let at = op.at == null ? C.pages.length : clamp(Math.round(+op.at) - 1, 0, C.pages.length);
    for (const spec of list) C.pages.splice(at++, 0, aiPage(spec));
    return `added ${list.length} page(s)`;
  }
  if (a === 'set_direction') {
    const d = op.direction === 'ltr' || op.direction === 'left_to_right' ? 'ltr' : op.direction === 'rtl' || op.direction === 'right_to_left' ? 'rtl' : null;
    if (!d) throw new Error(`Change ${k}: direction is "rtl" or "ltr".`);
    C.dir = d;
    return `reading direction ${d}`;
  }
  const i = pageAt(op.page, k), pg = C.pages[i];
  switch (a) {
    case 'delete_page':
      if (C.pages.length <= 1) throw new Error(`Change ${k}: the only page can't be deleted.`);
      C.pages.splice(i, 1); C.p = clamp(C.p, 0, C.pages.length - 1);
      return `deleted page ${i + 1}`;
    case 'move_page': {
      const j = pageAt(op.to, k);
      C.pages.splice(i, 1); C.pages.splice(j, 0, pg);
      return `moved page ${i + 1} to ${j + 1}`;
    }
    case 'set_layout':
      if (!PRESET_KEYS.includes(op.layout)) throw new Error(`Change ${k}: there is no layout "${op.layout}". The layouts: ${PRESET_KEYS.join(', ')}.`);
      layoutTo(pg, op.layout);
      return `page ${i + 1} cut as ${op.layout}`;
    case 'set_note': { const p = panelAtN(pg, op.panel, k); const pan = pg.pan[p.id] || (pg.pan[p.id] = { bg: '#ffffff', art: '', nt: '' }); pan.nt = String(op.note || '').slice(0, 3000); return `note on page ${i + 1}, panel ${op.panel}`; }
    case 'add_bubble': {
      if (!kindOf(op.kind)) throw new Error(`Change ${k}: there is no bubble kind "${op.kind}". The kinds: speech, thought, shout, whisper, narration.`);
      if (typeof op.text !== 'string' || !op.text.trim()) throw new Error(`Change ${k}: the bubble needs text.`);
      fillPanel(pg, panelAtN(pg, op.panel, k), { bubbles: [{ kind: op.kind, text: op.text }] });
      return `bubble ${pg.its[pg.its.length - 1].id} on page ${i + 1}`;
    }
    case 'add_sound':
      if (typeof op.text !== 'string' || !op.text.trim()) throw new Error(`Change ${k}: the sound needs text.`);
      fillPanel(pg, panelAtN(pg, op.panel, k), { sounds: [op.text] });
      return `sound on page ${i + 1}`;
    case 'add_effect':
      if (!EFFECTS.includes(op.effect)) throw new Error(`Change ${k}: there is no effect "${op.effect}". The effects: speed, focus, tone.`);
      fillPanel(pg, panelAtN(pg, op.panel, k), { effect: op.effect });
      return `${op.effect} on page ${i + 1}, panel ${op.panel}`;
    case 'set_text': {
      const it = itemAt(pg, op.item, k);
      if (it.t !== 'bub' && it.t !== 'sfx') throw new Error(`Change ${k}: "${op.item}" has no words.`);
      if (typeof op.text === 'string') it.txt = op.text.slice(0, it.t === 'sfx' ? 300 : 2000);
      if (op.kind != null && it.t === 'bub') { const kk = kindOf(op.kind); if (!kk) throw new Error(`Change ${k}: there is no bubble kind "${op.kind}".`); it.k = kk; it.tl = kk !== 'box'; }
      return `changed ${op.item}`;
    }
    case 'delete_item':
      itemAt(pg, op.item, k);
      pg.its = pg.its.filter(x => x.id !== op.item);
      return `deleted ${op.item}`;
  }
  throw new Error(`Change ${k}: there is no action "${a}". The actions: add_pages, delete_page, move_page, set_layout, set_note, add_bubble, add_sound, add_effect, set_text, delete_item, set_direction.`);
}
/* the changes all happen, or none (the comic goes back as it was), as one step the user can undo */
function aiEdit({ actions } = {}) {
  if (!C) throw new Error('No comic is open.');
  if (!Array.isArray(actions) || !actions.length) throw new Error('Give "actions": a list of changes.');
  flush();
  const before = snap(), done = [];
  try { actions.forEach((op, i) => done.push(aiOp(op, i + 1))); }
  catch (e) { C = before; paint(); throw e; }
  push(before);
  C.p = clamp(C.p, 0, C.pages.length - 1);
  SEL = null;
  for (const pg of C.pages) if (!geom(pg).panels.some(p => p.P)) pg.th = '';
  changed(); stripUI(); sideUI(); ribbonUI();
  return { done, ...aiInfo() };
}
/* the comic as Claude reads it: each page's panels in reading order, with their notes and what is said in them */
function aiInfo() {
  return { direction: C.dir === 'rtl' ? 'right_to_left' : 'left_to_right', size: C.size, width: C.w, height: C.h, page_on_screen: C.p + 1,
    layouts: PRESET_KEYS.join(', '),
    pages: C.pages.map((pg, i) => {
      const g = geom(pg), where = it => it.pn || (g.panels.find(p => p.P && inPoly(p.P, center(it))) || {}).id;
      const words = list => list.filter(x => x.t === 'bub' || x.t === 'sfx').sort((a, b) => a.y - b.y).map(x => x.t === 'sfx' ? { id: x.id, sound: x.txt } : { id: x.id, kind: x.k === 'box' ? 'narration' : x.k, text: x.txt });
      const out = pg.its.filter(it => !where(it));
      return { page: i + 1, panels: g.panels.map((p, j) => {
        const pan = pg.pan[p.id] || {}, its = pg.its.filter(it => where(it) === p.id), pics = its.filter(x => x.t === 'img').length, fx = its.filter(x => EFFECTS.includes(x.t));
        return { panel: j + 1, ...(pan.nt ? { note: pan.nt } : {}), drawn: !!pan.art, ...(pics ? { pictures: pics } : {}), words: words(its), ...(fx.length ? { effects: fx.map(x => ({ id: x.id, effect: x.t })) } : {}) };
      }), ...(out.length ? { outside_panels: words(out) } : {}) };
    }) };
}
async function aiLook({ page: n, max = 1024 } = {}) {
  if (!C) throw new Error('No comic is open.');
  const i = n == null ? C.p : pageAt(n, 1), k = Math.min(1, clamp(Math.round(+max) || 1024, 64, 2048) / Math.max(C.w, C.h));
  const c = await pageCanvas(C.pages[i], k), url = c.toDataURL('image/jpeg', 0.86);
  freeCanvas(c);
  return { data: url.slice(url.indexOf(',') + 1), mimeType: 'image/jpeg' };
}

window.INK_COMIC = {
  load, unload: reset, replace, preview, chooser, flush, body, text: textOfBody, meta: metaOf, blank: blankBody,
  norm: html => bodyOf(parseBody(html)),   // a body from a backup, checked
  pdf, print, pngs: () => pngDialog(),
  key: onKey, esc: onEsc, stat,
  image: f => { if (DRAWING) window.INK_DRAW.image(f); else if (C) imageItem(f, targetPanel(true)); },
  ready: cur => !!C && LOADED === cur, drawing: () => !!DRAWING, count: () => C ? C.pages.length : 0,
  // what is on screen, read only (for checking it from outside)
  peek: () => C && { view: { ...VIEW }, p: C.p, dir: C.dir, w: C.w, h: C.h, sel: SEL && { ...SEL }, edit: !!EDIT, drawing: !!DRAWING, reading: READ && { i: READ.i, k: READ.k, mode: READ.mode }, undo: HIST.at, page: clone(page()), panels: geom(page()).panels.map(p => ({ id: p.id, box: p.box, P: p.P })), cuts: geom(page()).cuts.map(c => ({ path: c.path, d: c.n.d, a: c.n.a, b: c.n.b, seg: c.seg })) },
  ai: { blank: aiBlank, info: () => aiInfo(), edit: aiEdit, look: aiLook },
};

// ==COMIC-END==
})();
