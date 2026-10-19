/* Floating Ink: comics and manga. This file loads only when a comic is opened or made (loadComicKit in index.html,
   which loads draw.js first: a panel is drawn in with the drawing's own tools, through INK_DRAW.embed).
   A comic is a document in the same list, store, versions, trash and backup, whose meta.kind is 'comic' and whose
   body is JSON (README "קומיקס"):
   { v: 1, dir: 'rtl' | 'ltr' (the way it is read), size, w, h (every page, in pixels), dpi, p (the page on screen),
     tr (how a page gives way to the next while reading), cast (the characters: drawn once, standing in any panel),
     pages: [{ id, h (a webtoon's part only: its own height), gut (the white between the panels), mar (around them), bw (the width of their frames), bc, bg,
       lay: the panels. { id } is a panel; { d: 'h' | 'v', a, b, k: [first, second] } cuts its part of the page in two,
            across (h) or down (v). The cut starts at a and ends at b, fractions of the part's height (h) or width (v),
            so a cut can lean, as in manga. k[0] is the top or left part,
       pan: { [panel id]: { bg, art (a drawing's body, the page's size, cut to the panel when shown; with frames, it moves),
            nt (what to draw in it: a note for the one drawing, never printed), cam (its camera while it is read) } },
       its: [{ id, t: 'bub' | 'sfx' | 'speed' | 'focus' | 'tone' | 'img' | 'chr', x, y, w, h (a box on the page), pn (the
            panel it is cut to, if any), un (under the panel's drawing), mo (how it comes in while reading), ...what each
            kind has }],
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
  // a webtoon: one long strip read by scrolling down on a phone, made of parts one under another (its "pages", each as tall as
  // it needs). Drawn twice as wide as Webtoon's 800 pixels, so it stays sharp on phones; its pictures come out 800 wide
  { k: 'webtoon', n: N_('וובטון'), d: N_('רצועה ארוכה שגוללים בטלפון'), w: 1600, h: 2560, dpi: 200 },
];
const MAX_PAGES = 300, MAX_PANELS = 40, MAX_ITEMS = 400, MIN_SIDE = 400, MAX_SIDE = 4096, MIN_SEG = 640;
const isWt = c => !!c && c.size === 'webtoon';
const pgH = (pg, c = C) => (isWt(c) && pg && pg.h) || c.h;   // a page's height: a webtoon's parts have their own
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
const KINDS = new Set(['bub', 'sfx', 'speed', 'focus', 'tone', 'img', 'chr']);
/* the characters: drawn once, put in any panel again and again (README "קומיקס", "דמויות"). Each gets a color of its own,
   for its outline while it isn't drawn yet */
const MAX_CAST = 40, MAX_LOOKS = 12;
const CAST_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#e03131', '#5f3dc4'];
/* motion while reading (README "קומיקס", "תנועה"): how each thing comes in when its panel is read (du: seconds; a bubble
   that types itself takes as long as its letters), how the camera moves in a panel, and how a page gives way to the next */
const MOTIONS = { fade: { n: N_('דהייה'), ic: 'blur_on', du: 0.5 }, pop: { n: N_('קפיצה@pop'), ic: 'auto_awesome', du: 0.45 }, slide: { n: N_('עפיפה פנימה'), ic: 'swipe_left', du: 0.5, dir: true },
  zoom: { n: N_('זום'), ic: 'zoom_in', du: 0.55 }, shake: { n: N_('רעידה'), ic: 'vibration', du: 0.8 }, type: { n: N_('הקלדה'), ic: 'keyboard', du: 0 } };
const CAMS = { in: { n: N_('התקרבות'), ic: 'zoom_in' }, out: { n: N_('התרחקות'), ic: 'zoom_out' }, pan: { n: N_('תזוזה'), ic: 'open_with', dir: true }, shake: { n: N_('רעידה'), ic: 'vibration' } };
const MOTION_TIPS = { fade: N_('מופיע לאט מתוך כלום'), pop: N_('קופץ פנימה וגדל, כמו בועה'), slide: N_('עף פנימה מהצד'), zoom: N_('מגיע מקרוב, גדול, ומתכווץ למקום'), shake: N_('רועד כשהוא מופיע'), type: N_('המילים נכתבות אות אחרי אות') };
const CAM_TIPS = { in: N_('המצלמה מתקרבת לאט'), out: N_('המצלמה מתרחקת לאט'), pan: N_('המצלמה זזה לאורך המשבצת'), shake: N_('כל המשבצת רועדת, כמו ברעידת אדמה') };
const PAGE_TRANS = { push: N_('דחיפה'), fade: N_('דהייה'), turn: N_('דפדוף'), zoom: N_('זום'), none: N_('בלי@none') };
const FROM = { r: N_('מימין'), l: N_('משמאל'), t: N_('מלמעלה'), b: N_('מלמטה') }, TOWARD = { r: N_('ימינה'), l: N_('שמאלה'), t: N_('למעלה'), b: N_('למטה') };
const CPS = 28;   // letters a second, for words that type themselves
function parseMo(m) {
  if (!m || typeof m !== 'object' || !MOTIONS[m.k]) return null;
  const o = { k: m.k };
  if (MOTIONS[m.k].dir) o.d = FROM[m.d] ? m.d : 'b';
  if (+m.dl > 0) o.dl = r1(num(m.dl, 0, 10, 0));
  if (m.du != null && +m.du > 0) o.du = r1(num(m.du, 0.1, 10, 1));
  return o;
}
function parseCam(m) {
  if (!m || typeof m !== 'object' || !CAMS[m.k]) return null;
  const o = { k: m.k, s: Math.round(num(m.s, 0.05, 0.5, 0.15) * 100) / 100 };
  if (CAMS[m.k].dir) o.d = FROM[m.d] ? m.d : 'r';
  return o;
}
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
  // a webtoon's panels have wide white between them (it is read one panel at a time, scrolling), and the white at the top
  // and bottom of a part is half of it, so the parts meet as if they were one
  if (isWt(c)) return { id: rid('G'), gut: Math.round(150 * u), mar: Math.round(75 * u), bw: Math.round(4 * u), bc: '#111111', bg: '#ffffff', lay: lay || preset('w2', c.dir), pan: {}, its: [], h: c.h };
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
  if (it.fit && o.pn && it.t !== 'bub' && it.t !== 'sfx' && it.t !== 'chr') o.fit = true;   // it covers its panel, and follows it when the panel changes size
  const mo = parseMo(it.mo);
  if (mo) o.mo = mo;
  const d = DEF[it.t](u);
  switch (it.t) {
    case 'bub':
      Object.assign(o, { k: BUB_KEYS.has(it.k) ? it.k : 'speech', txt: strIn(it.txt, 2000), f: okFontC(it.f) ? it.f : d.f, fs: num(it.fs, 8, 300, d.fs), b: !!it.b,
        fc: col(it.fc, d.fc), fill: col(it.fill, d.fill), sc: col(it.sc, d.sc), sw: num(it.sw, 0, 30, d.sw), tl: it.tl !== false,
        tx: num(it.tx, -C.w, 2 * C.w, o.x + o.w * 0.4), ty: num(it.ty, -C.h, 2 * C.h, o.y + o.h * 1.5) });
      if (typeof it.who === 'string' && C.cast.some(x => x.id === it.who)) o.who = it.who;   // the character saying it
      break;
    case 'chr': {
      const ch = C.cast.find(x => x.id === it.c);
      if (!ch) return null;
      Object.assign(o, { c: ch.id, lk: ch.lk.some(l => l.id === it.lk) ? it.lk : ch.lk[0].id, fl: !!it.fl, r: num(it.r, -180, 180, 0) });
      break;
    }
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
  chr: () => ({}),
};
/* the characters: each has a name, a color, a few words of what it looks like (for the one drawing it, and for Claude),
   and its looks (faces or poses), each a drawing of the character's own size with nothing around it */
function castSize(c) { const hh = Math.round(clamp(c.h * 0.75, 600, 1800)); return { w: Math.round(hh * 0.7), h: hh }; }
const okThumbPng = s => typeof s === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s);
function parseCast(list, c) {
  const out = [], ids = new Set(), d = castSize(c);
  for (const x of (Array.isArray(list) ? list : []).slice(0, MAX_CAST)) {
    if (!x || typeof x !== 'object') continue;
    const id = typeof x.id === 'string' && ID_RE.test(x.id) && !ids.has(x.id) ? x.id : rid('c');
    ids.add(id);
    const lids = new Set(), lk = [];
    for (const l of (Array.isArray(x.lk) ? x.lk : []).slice(0, MAX_LOOKS)) {
      if (!l || typeof l !== 'object') continue;
      const lid = typeof l.id === 'string' && ID_RE.test(l.id) && !lids.has(l.id) ? l.id : rid('k');
      lids.add(lid);
      lk.push({ id: lid, n: strIn(l.n, 40), art: typeof l.art === 'string' && l.art.startsWith('{') ? l.art : '', th: okThumbPng(l.th) ? l.th : '' });
    }
    if (!lk.length) lk.push({ id: rid('k'), n: '', art: '', th: '' });
    out.push({ id, n: strIn(x.n, 60).trim() || T('דמות {0}', out.length + 1), col: col(x.col, CAST_COLORS[out.length % CAST_COLORS.length]), ds: strIn(x.ds, 1000),
      w: Math.round(num(x.w, 100, MAX_SIDE, d.w)), h: Math.round(num(x.h, 100, MAX_SIDE, d.h)), lk });
  }
  return out;
}
function parseBody(body) {
  let j = null;
  try { j = typeof body === 'string' ? JSON.parse(body) : body; } catch {}
  if (!j || typeof j !== 'object') j = {};
  const sz = SIZES.find(s => s.k === j.size);
  const w = Math.round(num(j.w, MIN_SIDE, MAX_SIDE, sz ? sz.w : 1300)), hh = Math.round(num(j.h, MIN_SIDE, MAX_SIDE, sz ? sz.h : 2000));
  const c = { v: 1, dir: j.dir === 'ltr' ? 'ltr' : j.dir === 'rtl' ? 'rtl' : UI_DIR, size: sz ? sz.k : 'custom', w, h: hh, dpi: Math.round(num(j.dpi, 72, 600, sz ? sz.dpi : 200)), p: 0, pages: [],
    tr: PAGE_TRANS[j.tr] ? j.tr : 'push', cast: [] };
  const was = C; C = c;   // parseItem reads the page's size from C
  try {
    c.cast = parseCast(j.cast, c);
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
        const art = typeof v.art === 'string' && v.art.startsWith('{') ? v.art : '', nt = strIn(v.nt, 3000), bg = col(v.bg, '#ffffff'), cam = parseCam(v.cam);
        if (art || nt || bg !== '#ffffff' || cam) pan[k] = { bg, art, nt, ...(cam ? { cam } : {}) };
      }
      const ids = new Set(), its = [];
      for (const it of (Array.isArray(pg.its) ? pg.its : []).slice(0, MAX_ITEMS)) { const o = parseItem(it, ids, seen); if (o) its.push(o); }
      const o = { id, gut: num(pg.gut, 0, 200 * u, 24 * u), mar: num(pg.mar, 0, 400 * u, 56 * u), bw: num(pg.bw, 0, 40 * u, 5 * u), bc: col(pg.bc, '#111111'), bg: col(pg.bg, '#ffffff'),
        lay, pan, its, th: typeof pg.th === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(pg.th) ? pg.th : '' };
      if (isWt(c)) o.h = Math.round(num(pg.h, MIN_SEG, MAX_SIDE, c.h));   // a webtoon's parts each have a height of their own
      c.pages.push(o);
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
  const H = pgH(pg, c), key = `${c.w}x${H}|${c.dir}|${pg.gut}|${pg.mar}|${JSON.stringify(pg.lay)}`;
  let g = GEOM.get(key);
  if (g) return g;
  const m = Math.min(pg.mar, c.w / 3, H / 3), raw = new Map(), cuts = [];
  const page = [{ x: m, y: m }, { x: c.w - m, y: m }, { x: c.w - m, y: H - m }, { x: m, y: H - m }];
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
/* a webtoon part made taller or shorter (from: the page as it was): what is in each panel keeps its place in it. Words
   keep their distance from its top, characters stand on its bottom, and the rest keep their middle as far down it */
function setPartH(pg, hh, from) {
  const was = pg.h;
  pg.h = Math.round(clamp(hh, MIN_SEG, MAX_SIDE));
  if (!layOk(pg)) { pg.h = was; return false; }
  const g0 = geom(from), g1 = geom(pg);
  pg.its.forEach((it, i) => {
    const o = from.its[i];
    if (!o || o.id !== it.id || it.fit) return;
    const pid = panelOf(from, g0, o), a = g0.panels.find(q => q.id === pid), b = g1.panels.find(q => q.id === pid);
    if (!a || !b) return;
    const my = y => b.box.y + (y - a.box.y) * b.box.h / a.box.h;
    it.y = o.t === 'bub' ? my(o.y) : o.t === 'chr' ? my(o.y + o.h) - o.h : my(o.y + o.h / 2) - o.h / 2;
    if (o.t === 'bub') it.ty = my(o.ty);
  });
  refit(pg);
  return true;
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
/* a box moved sideways to stay inside the panel; where a slanted panel is too narrow for it, it moves down first
   (as far as maxY), and only then is it made narrower */
function inside(P, box, m, maxY = box.y) {
  if (!P) return box;
  let best = null;
  for (let y = box.y, i = 0; i < 24; i++, y += Math.max(4, box.h * 0.12)) {
    if (i && y > maxY) break;
    const s = spanAt(P, y, y + box.h), room = s.hi - s.lo - 2 * m;
    if (!(room > 0)) continue;
    if (box.x >= s.lo + m - 0.5 && box.x + box.w <= s.hi - m + 0.5) return { ...box, y };   // it fits where it is meant to be, at this height
    if (!best || room > best.room + 0.5) best = { y, s, room };
  }
  if (!best) return box;
  const w = Math.min(box.w, best.room);
  return { ...box, y: best.y, w, x: clamp(box.x, best.s.lo + m, best.s.hi - m - w) };
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
  // a webtoon's parts: mostly panels as wide as the strip, one under another
  { k: 'w1', g: 'webtoon', n: () => L() },
  { k: 'w2', g: 'webtoon', n: () => rows([1, 1]) },
  { k: 'w3', g: 'webtoon', n: () => rows([1, 1, 1]) },
  { k: 'wt2', g: 'webtoon', n: () => rows([1, 1], [1.7, 1]) },
  { k: 'w12', g: 'webtoon', n: () => rows([1, 2], [1.3, 1]) },
  { k: 'w21', g: 'webtoon', n: () => rows([2, 1], [1, 1.3]) },
  { k: 'wl2', g: 'webtoon', n: () => ({ d: 'h', a: 0.58, b: 0.42, k: [L(), L()] }) },
  { k: 'wz', g: 'webtoon', n: () => stack('h', [L(), L(), L()], [1, 1, 1], [0.05, -0.05]) },
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
const byCount = n => (isWt(C) && { 1: 'w1', 2: 'w2', 3: 'w3', 4: 'g4' }[n]) || BY_COUNT[n];

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
   what a page needs before it can be drawn: each panel's drawing and each character's look as pictures (draw.js makes
   them; one for each frame of a drawing that moves), the pictures in it decoded, and its fonts. Kept for the pages near
   the one on screen
   ========================================================= */
const ART = new Map();   // a drawing's body -> { cvs: its picture for each frame, cut to r (in the drawing's own pixels), hd: its size, an: when its frames show (null when it doesn't move), mask, at: last use } or, while it is made, { job }
const IMGS = new Map();  // a picture's data URL -> an Image, decoded
const ART_PX = SMALL ? 14e6 : 48e6;
const pad = (b, k) => ({ x: b.x - b.w * k, y: b.y - b.h * k, w: b.w * (1 + 2 * k), h: b.h * (1 + 2 * k) });
const covers = (a, b) => a.x <= b.x + 0.5 && a.y <= b.y + 0.5 && a.x + a.w >= b.x + b.w - 0.5 && a.y + a.h >= b.y + b.h - 0.5;
const clipTo = (r, w, hh) => { const x0 = clamp(Math.floor(r.x), 0, w), y0 = clamp(Math.floor(r.y), 0, hh), x1 = clamp(Math.ceil(r.x + r.w), 0, w), y1 = clamp(Math.ceil(r.y + r.h), 0, hh); return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) }; };
const HEAD_RE = /^\{"v":(\d+),"w":(\d+),"h":(\d+)/;
/* a drawing's size, and whether it has frames, from the start of its body (draw.js writes v, w and h first). A panel's
   drawing is as big as its page was when it was drawn; a webtoon part that grew since has nothing drawn below it */
function artHead(art) {
  const m = HEAD_RE.exec(art);
  if (m) return { anim: m[1] === '2', w: +m[2], h: +m[3] };
  let j = null;
  try { j = JSON.parse(art); } catch {}
  return { anim: !!(j && Array.isArray(j.frames) && j.frames.length > 1), w: Math.round(+(j && j.w)) || C.w, h: Math.round(+(j && j.h)) || C.h };
}
const artPx = e => e.cvs ? e.cvs.reduce((s, c) => s + c.width * c.height, 0) : 0;
const artDrop = e => { if (e.cvs) e.cvs.forEach(freeCanvas); };
function artFree() {
  let px = 0;
  const list = [...ART.entries()].filter(([, e]) => e.cvs).sort((a, b) => b[1].at - a[1].at);
  for (const [k, e] of list) { px += artPx(e); if (px > ART_PX) { artDrop(e); ART.delete(k); } }
}
/* the picture of a drawing: for a panel's, cut a little wider than the panel (so moving a cut a little needs no new one),
   for a character's (box null), all of it. A drawing with frames gets a picture for each */
function artLoad(art, box) {
  const e = ART.get(art), hd = (e && e.hd) || artHead(art), need = box ? clipTo(box, hd.w, hd.h) : { x: 0, y: 0, w: hd.w, h: hd.h };
  if (e && e.cvs && covers(e.r, need)) { e.at = performance.now(); return Promise.resolve(e); }
  if (e && e.job && covers(e.want, need)) return e.job;
  const want = box ? clipTo(pad(e && e.r ? { x: Math.min(e.r.x, need.x), y: Math.min(e.r.y, need.y), w: Math.max(e.r.x + e.r.w, need.x + need.w) - Math.min(e.r.x, need.x), h: Math.max(e.r.y + e.r.h, need.y + need.h) - Math.min(e.r.y, need.y) } : need, 0.12), hd.w, hd.h) : need;
  const n = { want, hd, job: null, cvs: e && e.cvs, r: e && e.r, an: e && e.an, at: performance.now() };
  n.job = (async () => {
    const cvs = [];
    let an = null;
    try {
      const src = await window.INK_DRAW.source(art);
      try {
        const count = hd.anim ? src.frames.length : 1;
        for (let i = 0; i < count; i++) {
          const cv = newCanvas(want.w, want.h), cx = cv.getContext('2d');
          cx.translate(-want.x, -want.y);
          await src.draw(cx, i, hd.w, hd.h);
          cvs.push(cv);
        }
        if (count > 1) an = { frames: src.frames.map(f => ({ d: f.d })), fps: src.fps, loop: src.loop };
      } finally { src.done(); }
    } catch (err) { console.warn(err); }
    if (!cvs.length) cvs.push(newCanvas(1, 1));
    if (ART.get(art) !== n) { cvs.forEach(freeCanvas); return ART.get(art); }
    if (n.cvs && n.cvs !== cvs) n.cvs.forEach(freeCanvas);
    Object.assign(n, { cvs, r: want, an, mask: null, job: null, at: performance.now() });
    artFree();
    return n;
  })();
  ART.set(art, n);
  return n.job;
}
/* the frame of a moving drawing at t milliseconds of its loop (t undefined: a picture that stays, the first frame) */
const artPic = (e, t) => e.cvs[e.an && t != null ? window.INK_DRAW.frameAt(e.an.frames, e.an.fps, e.an.loop, t) : 0] || e.cvs[0];
/* where a drawing has something on it, small: a character is chosen by what is drawn, not by the see-through around it */
function maskOf(e) {
  if (e.mask) return e.mask;
  const k = Math.min(1, 96 / Math.max(e.r.w, e.r.h)), w = Math.max(1, Math.round(e.r.w * k)), hh = Math.max(1, Math.round(e.r.h * k)), c = newCanvas(w, hh), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(e.cvs[0], 0, 0, w, hh);
  const d = x.getImageData(0, 0, w, hh).data, a = new Uint8Array(w * hh);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  freeCanvas(c);
  // what is drawn, as a box in the drawing's own pixels (its top is where a character's head is)
  let x0 = w, y0 = hh, x1 = -1, y1 = -1;
  for (let y = 0; y < hh; y++) for (let xx = 0; xx < w; xx++) if (a[y * w + xx] > 40) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; y1 = y; }
  const sx = e.r.w / w, sy = e.r.h / hh;
  const bb = x1 < 0 ? { x: e.r.x, y: e.r.y, w: e.r.w, h: e.r.h } : { x: e.r.x + x0 * sx, y: e.r.y + y0 * sy, w: (x1 - x0 + 1) * sx, h: (y1 - y0 + 1) * sy };
  return (e.mask = { w, h: hh, a, bb });
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
  for (const it of pg.its) if (it.t === 'img') jobs.push(imgLoad(it.src)); else if (it.t === 'chr') { const a = lookArt(it); if (a) jobs.push(artLoad(a, null)); }
  const f = fontsFor(pg);
  if (f) jobs.push(f);
  await Promise.all(jobs);
}

/* =========================================================
   drawing a page. o.skip: the panel being drawn in (draw.js shows its drawing itself), with o.layer 'under' (the page
   without that panel's drawing and what is above it) or 'over' (only what is above it, faint, and the rest of the page
   dimmed). o.ed: in the editor (characters not drawn yet show as outlines); o.editor: and notes in empty panels.
   o.noText: the item whose words are being written (the box shows them). o.missing: called when something wasn't
   ready, so it can be drawn again. While reading: o.t, the milliseconds the drawings that move are at; o.mo(it), how far
   a thing is in its motion ({ hide } before it starts, or { a: opacity, s: scale, dx, dy, n: letters shown }); o.cam(p,
   cam), where the camera is in a panel ({ k: zoom, x, y })
   ========================================================= */
const polyPath = P => { const p = new Path2D(); P.forEach((q, i) => i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)); p.closePath(); return p; };
const center = it => ({ x: it.x + it.w / 2, y: it.y + it.h / 2 });
const castOf = id => C && C.cast.find(x => x.id === id);
const lookOf = (ch, id) => ch.lk.find(l => l.id === id) || ch.lk[0];
const lookArt = it => { const ch = castOf(it.c); return ch ? lookOf(ch, it.lk).art : ''; };
/* the words of a bubble as they type themselves: the first n letters, each line starting where it will be when it is whole */
function typedLines(cx, L0, n) {
  let left = n;
  L0.lines.forEach((t, j) => {
    if (left <= 0) return;
    const part = Array.from(t).slice(0, left).join(''), y = (j - (L0.lines.length - 1) / 2) * L0.lh, w = cx.measureText(t).width;
    left -= Array.from(t).length + 1;
    cx.textAlign = 'start';
    cx.fillText(part, L0.dir === 'rtl' ? w / 2 : -w / 2, y);
  });
}
/* a character nobody drew yet: an outline in its color with its name, only while editing (as a panel's note is) */
function standIn(cx, it, ch) {
  const w = it.w, hh = it.h, r = Math.min(w * 0.2, hh * 0.12), top = -hh / 2, sh = top + r * 2.45, u = unit();
  const p = new Path2D();
  p.arc(0, top + r * 1.1, r, 0, Math.PI * 2);
  p.moveTo(w * 0.36, hh / 2); p.bezierCurveTo(w * 0.38, sh + r * 0.8, w * 0.2, sh, 0, sh); p.bezierCurveTo(-w * 0.2, sh, -w * 0.38, sh + r * 0.8, -w * 0.36, hh / 2); p.closePath();
  const colr = ch ? ch.col : '#888888';
  cx.save(); cx.globalAlpha *= 0.16; cx.fillStyle = colr; cx.fill(p); cx.restore();
  cx.lineWidth = Math.max(2, 3 * u); cx.setLineDash([10 * u, 7 * u]); cx.strokeStyle = colr; cx.stroke(p); cx.setLineDash([]);
  if (!ch) return;
  cx.font = fontOf('Assistant', true, clamp(w / 7, 12, 64 * u)); cx.fillStyle = colr; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  try { cx.direction = textDir(ch.n); } catch {}
  cx.fillText(ch.n, 0, sh + (hh / 2 - sh) * 0.4, w * 0.92);
}
function paintLook(cx, art, it, o) {
  const e = ART.get(art);
  if (e && e.cvs) { e.at = performance.now(); const sx = it.w / e.hd.w, sy = it.h / e.hd.h; cx.drawImage(artPic(e, o.t), -it.w / 2 + e.r.x * sx, -it.h / 2 + e.r.y * sy, e.r.w * sx, e.r.h * sy); return; }
  artLoad(art, null).then(() => o.missing && o.missing());
}
function drawItem(cx, it, o) {
  const ms = o.mo && o.mo(it);
  if (ms && ms.hide) return;
  cx.save();
  if (ms) {
    const c = center(it);
    cx.globalAlpha *= clamp(ms.a, 0, 1);
    cx.translate(c.x + (ms.dx || 0), c.y + (ms.dy || 0)); cx.scale(ms.s || 1, ms.s || 1); cx.translate(-c.x, -c.y);
  }
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
      if (ms && ms.n != null) typedLines(cx, L0, ms.n);
      else L0.lines.forEach((t, j) => cx.fillText(t, 0, (j - (L0.lines.length - 1) / 2) * L0.lh));
    }
  } else if (it.t === 'chr') {
    const ch = castOf(it.c), lk = ch && lookOf(ch, it.lk), c = center(it);
    cx.translate(c.x, c.y);
    if (it.r) cx.rotate(it.r * Math.PI / 180);
    if (lk && lk.art) { if (it.fl) cx.scale(-1, 1); paintLook(cx, lk.art, it, o); }
    else if (o.ed) standIn(cx, it, ch);
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
  if (e && e.cvs && covers(e.r, clipTo(p.box, e.hd.w, e.hd.h))) { e.at = performance.now(); cx.drawImage(artPic(e, o.t), e.r.x, e.r.y); return; }
  if (e && e.cvs) cx.drawImage(artPic(e, o.t), e.r.x, e.r.y);   // the old picture until the wider one is ready
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
  const g = geom(pg), u = o.layer, H = pgH(pg);
  cx.save();
  if (u !== 'over') { cx.fillStyle = pg.bg; cx.fillRect(0, 0, C.w, H); }
  for (const p of g.panels) {
    if (!p.P) continue;
    const info = pg.pan[p.id] || {}, mine = o.skip === p.id, its = pg.its.filter(it => it.pn === p.id);
    if (u === 'over' && !mine) continue;
    cx.save(); cx.clip(polyPath(p.P));
    if (u !== 'over') { cx.fillStyle = info.bg || '#ffffff'; cx.fillRect(p.box.x - 2, p.box.y - 2, p.box.w + 4, p.box.h + 4); }
    // the camera: what is in the panel moves and grows inside its frame
    const cam = o.cam && info.cam && o.cam(p, info.cam);
    if (cam) { const c = center(p.box); cx.translate(c.x + cam.x, c.y + cam.y); cx.scale(cam.k, cam.k); cx.translate(-c.x, -c.y); }
    if (u !== 'over') {
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
    if (p && p.P) { const d = new Path2D(); d.rect(0, 0, C.w, H); d.addPath(polyPath(p.P)); cx.fillStyle = 'rgba(30,34,46,.42)'; cx.fill(d, 'evenodd'); }
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
  const H = pgH(pg), c = newCanvas(C.w * scale, H * scale), cx = c.getContext('2d');
  cx.imageSmoothingQuality = 'high';
  cx.scale(c.width / C.w, c.height / H);
  drawPage(cx, pg, o);
  return c;
}
const toBlob = (c, type = 'image/png', q = 0.92) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('blob')), type, q));

/* =========================================================
   motion while reading: each thing with motion (mo) comes in when its panel is read, one after another in the order
   they are read; the camera (a panel's cam) moves what is in the panel inside its frame. The same timings make the
   reader, the preview in the editor, the GIF and the video
   ========================================================= */
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIO = t => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const backOut = t => { t = clamp(t, 0, 1) - 1; return 1 + 2.70158 * t * t * t + 1.70158 * t * t; };   // a little past the end and back, like a pop
const CAM_S = 5;   // seconds a camera move takes
const VECS = { r: [1, 0], l: [-1, 0], t: [0, -1], b: [0, 1] };
/* seconds a thing takes to come in: its own, or its kind's; words that type themselves take as long as their letters */
function moDur(it) {
  const m = it.mo;
  if (m.du) return m.du;
  if (m.k === 'type') return clamp(Array.from(it.txt || '').length / CPS, 0.4, 8);
  return MOTIONS[m.k].du;
}
/* where a thing is in its motion, p from 0 (just starting) to 1 (in its place): see drawPage's o.mo */
function moAt(it, p) {
  if (p >= 1) return null;
  if (p < 0) return { hide: true };
  const m = it.mo, u = unit();
  switch (m.k) {
    case 'fade': return { a: ease(p) };
    case 'pop': return { a: clamp(p * 3, 0, 1), s: 0.25 + 0.75 * backOut(p) };
    case 'slide': { const v = VECS[m.d] || VECS.b, L = Math.max(it.w, it.h) * 0.55 + 90 * u, d = 1 - ease(p); return { a: clamp(p * 2.5, 0, 1), dx: v[0] * L * d, dy: v[1] * L * d }; }
    case 'zoom': return { a: clamp(p * 2, 0, 1), s: 1 + 1.4 * (1 - ease(p)) };
    case 'shake': { const k = (1 - p) * (0.05 * Math.min(it.w, it.h) + 8 * u); return { a: clamp(p * 6, 0, 1), dx: Math.sin(p * 48) * k, dy: Math.cos(p * 37) * k * 0.6 }; }
    case 'type': return { n: Math.floor(Array.from(it.txt || '').length * p) };
  }
  return null;
}
/* the camera in a panel p of the way through its move: see drawPage's o.cam */
function camAt(cam, p, box) {
  const s = cam.s, e = easeIO(p);
  if (cam.k === 'in') return { k: 1 + s * e, x: 0, y: 0 };
  if (cam.k === 'out') return { k: 1 + s * (1 - e), x: 0, y: 0 };
  if (cam.k === 'pan') { const v = VECS[cam.d] || VECS.r, f = e * 2 - 1; return { k: 1 + s, x: -v[0] * box.w * s / 2 * f, y: -v[1] * box.h * s / 2 * f }; }
  if (cam.k === 'shake') { const q = p * CAM_S / 0.9; if (q >= 1) return null; const a = (1 - q) * Math.min(box.w, box.h) * 0.16 * s; return { k: 1 + s * 0.4, x: Math.sin(q * 52) * a, y: Math.cos(q * 41) * a }; }
  return null;
}
/* the panel a thing belongs to: the one it is cut to, the one its middle is in, or the nearest */
function panelOf(pg, g, it) {
  if (it.pn) return it.pn;
  const c = center(it), ps = g.panels.filter(p => p.P), p = ps.find(q => inPoly(q.P, c));
  if (p) return p.id;
  let best = null, bd = Infinity;
  for (const q of ps) { const d = Math.hypot(q.box.x + q.box.w / 2 - c.x, q.box.y + q.box.h / 2 - c.y); if (d < bd) { bd = d; best = q.id; } }
  return best;
}
/* what comes in in a panel and when, in seconds after the panel is reached: the scene first (pictures, effects,
   characters), then the words in the order they are read */
function panelScript(pg, pid, g = geom(pg)) {
  const rtl = C.dir === 'rtl', rank = it => it.t === 'bub' || it.t === 'sfx' ? 1 : 0;
  const its = pg.its.filter(it => it.mo && !(it.t === 'chr' && !lookArt(it)) && panelOf(pg, g, it) === pid).sort((a, b) => rank(a) - rank(b) || (Math.abs(a.y - b.y) > Math.min(a.h, b.h) * 0.5 ? a.y - b.y : rtl ? b.x + b.w - (a.x + a.w) : a.x - b.x));
  let t = 0.15;
  // each one a little before the one before it is done (words that type themselves are read to the end first)
  const out = its.map(it => { const s = t + (it.mo.dl || 0), d = moDur(it); t = s + (it.mo.k === 'type' ? d + 0.15 : d * 0.75 + 0.05); return { it, s }; });
  return { list: out, end: its.length ? t : 0 };
}
const moves = art => !!art && artHead(art).anim;
/* a page that has anything moving on it (it is drawn again and again while it is read) */
const pageMoves = pg => pg.its.some(it => it.mo || (it.t === 'chr' && moves(lookArt(it)))) || Object.values(pg.pan).some(x => x.cam || moves(x.art));
const motionAny = c => c.pages.some(pg => pg.its.some(it => it.mo) || Object.values(pg.pan).some(x => x.cam));
/* motion for everything at once (the "אוטומטית" button, and Claude): what is said pops in, narration fades in, a sound
   word zooms in shaking, effects fade in, characters slide in from their side; clear takes it all away */
function autoMotion(c, clear) {
  for (const pg of c.pages) {
    for (const it of pg.its) {
      if (clear) { delete it.mo; continue; }
      if (it.t === 'bub') it.mo = { k: it.k === 'box' ? 'fade' : it.k === 'shout' ? 'zoom' : 'pop' };
      else if (it.t === 'sfx') it.mo = { k: 'shake' };
      else if (it.t === 'chr') { const side = center(it).x < c.w / 2 ? 'l' : 'r'; it.mo = { k: 'slide', d: side }; }
      else if (it.t !== 'img') it.mo = { k: 'fade' };
    }
    if (clear) for (const x of Object.values(pg.pan)) delete x.cam;
  }
}

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
.cm-rw img,.cm-rw canvas{display:block;width:100%;height:100%;box-shadow:0 4px 30px rgba(0,0,0,.5);background:#fff}
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
/* the characters */
.cm-cgal{display:flex;gap:4px;max-width:min(560px,46vw);overflow-x:auto;overflow-y:hidden;padding:2px 2px 4px;scrollbar-width:thin;align-items:stretch}
.cm-cast{flex:none;width:60px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:3px 2px;border:1.5px solid transparent;border-radius:8px;background:none;color:var(--text);cursor:grab;font-size:11px;touch-action:pan-x}
.cm-cast:hover{background:var(--surface-3)}
.cm-cast.on{border-color:var(--accent);background:var(--accent-soft)}
.cm-cast img,.cm-cast .cm-face{width:42px;height:42px;object-fit:contain;pointer-events:none}
.cm-cast span{max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-face{display:inline-grid;place-items:center;border-radius:50%;color:#fff;font-style:normal;font-weight:700;font-size:18px;line-height:1}
.cm-cnone{font-size:12px;color:var(--text-3);max-width:230px;white-space:normal;align-self:center;padding:0 6px}
.cm-ghost{position:fixed;z-index:500;pointer-events:none;width:64px;height:64px;transform:translate(-50%,-60%);opacity:.88;filter:drop-shadow(0 4px 10px rgba(0,0,0,.3))}
.cm-ghost img,.cm-ghost .cm-face{width:100%;height:100%;object-fit:contain}
.cm-looks{display:flex;flex-wrap:wrap;gap:6px}
.cm-look{width:54px;height:54px;padding:3px;border:1.5px solid var(--line);border-radius:9px;background:var(--surface-2);display:grid;place-items:center;cursor:pointer;color:var(--text-2)}
.cm-look img,.cm-look .cm-face{width:42px;height:42px;object-fit:contain}
.cm-look.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}
.cm-look.add{border-style:dashed}
.cm-lk{position:relative}
.cm-ldel{position:absolute;top:-6px;inset-inline-end:-6px;width:22px;height:22px;border-radius:50%;border:1px solid var(--line);background:var(--surface);display:grid;place-items:center;padding:0;cursor:pointer;color:var(--text-2)}
.cm-ldel .ms{font-size:15px}
.cm-castlist{display:flex;flex-direction:column;gap:12px;min-width:min(560px,100%)}
.cm-crow{display:flex;gap:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2)}
.cm-cface{flex:none;width:72px;height:96px;display:grid;place-items:center}
.cm-cface img{max-width:100%;max-height:100%;object-fit:contain}
.cm-cface .cm-face{width:56px;height:56px;font-size:24px}
.cm-cmain{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.cm-cmain h5{margin:2px 0 0;font-size:12px;color:var(--text-3);font-weight:600}
.cm-cline{display:flex;gap:8px;align-items:center}
.cm-cline .field{flex:1;min-width:0}
.cm-cline input[type=color]{width:40px;height:34px;padding:2px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
.cm-cmain .cm-txt{min-height:52px}
.cm-cnew,.cm-imp{display:flex;flex-direction:column;gap:10px;min-width:min(420px,100%)}
.cm-imp{gap:6px}
.cm-impr{display:flex;align-items:center;gap:10px;padding:6px 8px;border:1px solid var(--line);border-radius:10px;cursor:pointer}
.cm-impr .cm-cface{width:44px;height:52px}
.cm-impr .cm-cface .cm-face{width:40px;height:40px;font-size:18px}
.cm-impr b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.cm-picks{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;max-height:60vh;overflow-y:auto;padding:2px}
.cm-pk{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--line);border-radius:10px;background:var(--surface);text-align:start;color:var(--text);min-width:0;cursor:pointer}
.cm-pk:hover{border-color:var(--accent)}
.cm-pk .im{aspect-ratio:3/4;display:grid;place-items:center;background:var(--surface-2);border-radius:6px;overflow:hidden}
.cm-pk .im img{max-width:100%;max-height:100%;display:block}
.cm-pk .im .ms{font-size:34px;color:var(--text-3)}
.cm-pk b{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-pk small{font-size:11.5px;color:var(--text-3)}
.cm-cams{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.cm-cams .rb.on{background:var(--accent-soft);border-color:var(--accent)}
.cm-trs{width:118px;height:30px;margin-bottom:4px}
.cm-vid{display:flex;flex-direction:column;gap:12px;min-width:min(440px,100%)}
.cm-vid .seg{flex-wrap:wrap}
.cm-rpg{position:absolute;inset:0}
.cm-read.scroll .cm-rnav{display:none}
.cm-rsc{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;touch-action:pan-y;overscroll-behavior:contain}
.cm-rcol{width:min(100%,960px);margin:0 auto;padding:60px 0 0;display:flex;flex-direction:column;gap:18px}
.cm-rsc.wt .cm-rcol{width:min(100%,800px);gap:0}
.cm-rsp{position:relative;width:100%;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.45)}
.cm-rsc.wt .cm-rsp{box-shadow:none}
.cm-rsimg{position:absolute;inset:0;width:100%;height:100%;display:block}
.cm-rsend{padding:40px 16px 45vh;text-align:center;opacity:.7;font-size:15px}
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
  .cm-rbar [data-m] span:not(.ms){display:none}
  .cm-cgal{max-width:72vw}
  .cm-crow{flex-direction:column}
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
  V.castP = h('div', { class: 'panel comic-only', 'data-panel': 'cmcast', hidden: true },
    undoGrp(),
    group(T('דמויות'), '', rbtn('cmCastNew', 'group_add', T('דמות חדשה'), { big: true, title: T('דמות שמציירים פעם אחת, ומכניסים לכל משבצת שרוצים') }),
      rbtn('cmCast', 'group', T('כל הדמויות'), { big: true, title: T('השמות, הצבעים, התיאורים וההבעות של כל הדמויות בקומיקס') })),
    group(T('הכנסה למשבצת'), 'cm-cg', V.castGal = h('div', { class: 'cm-cgal', role: 'list', 'aria-label': T('הדמויות') })),
    group(T('הדמות שבחרת'), '', rbtn('cmLook', 'add_reaction', T('הבעה'), { big: true, title: T('הבעה או תנוחה אחרת של הדמות') }),
      h('div', { class: 'cm-col' }, rbtn('cmFlip', 'flip', T('היפוך@mirror'), { text: T('היפוך@mirror'), cls: 'txt', title: T('הדמות מסתכלת לצד השני') }),
        rbtn('cmCastDraw', 'brush', T('ציור הדמות'), { text: T('ציור@verb'), cls: 'txt', title: T('ציור ההבעה הזאת. כל המקומות שהדמות מופיעה בהם משתנים יחד') }))),
    group(T('מקומיקס אחר'), '', rbtn('cmCastImport', 'input', T('ייבוא דמויות'), { big: true, title: T('דמויות שכבר ציירת בקומיקס אחר') })));
  castEvents();
  V.trSel = h('select', { class: 'sel cm-trs', 'aria-label': T('מעבר בין דפים'), title: T('איך דף מתחלף בדף הבא בזמן הקריאה') }, Object.entries(PAGE_TRANS).map(([k, n]) => h('option', { value: k, text: T(n) })));
  V.trSel.addEventListener('change', () => { const v = V.trSel.value; if (C && PAGE_TRANS[v] && C.tr !== v) edit(() => { C.tr = v; }); V.trSel.blur(); });
  V.moP = h('div', { class: 'panel comic-only', 'data-panel': 'cmmotion', hidden: true },
    undoGrp(),
    group(T('איך זה נכנס'), '', ...Object.entries(MOTIONS).map(([k, m]) => rbtn('cmMo', m.ic, T(m.n), { big: true, arg: k, title: T(MOTION_TIPS[k]) })),
      rbtn('cmMo', 'block', T('בלי@none'), { big: true, arg: 'none', title: T('בלי תנועה: מופיע כמו שהוא') })),
    group(T('משבצת'), '', rbtn('cmCam', 'videocam', T('מצלמה'), { big: true, title: T('המצלמה זזה בתוך המשבצת בזמן הקריאה: מתקרבת, מתרחקת, זזה לצד או רועדת') }),
      rbtn('cmAnim', 'animation', T('משבצת שזזה'), { big: true, title: T('אנימציה בתוך המשבצת: מציירים כמה פריימים, והמשבצת זזה בלולאה בעורך ובקריאה') })),
    group(T('בין דפים'), 'col', V.trSel, rbtn('cmPlay', 'play_circle', T('ניגון בעורך'), { text: T('ניגון בעורך'), cls: 'txt', title: T('משבצות ודמויות שזזות זזות גם כאן, בזמן העבודה') })),
    group(T('לכל הקומיקס'), '', rbtn('cmAuto', 'auto_awesome', T('תנועה אוטומטית'), { big: true, title: T('תנועה לכל הבלונים, מילות הצליל, הדמויות והאפקטים בכל הדפים בבת אחת') }),
      rbtn('cmAutoClear', 'motion_photos_off', T('בלי תנועה'), { big: true, title: T('מוריד את כל התנועה מכל הקומיקס') })),
    group(T('צפייה'), '', rbtn('cmPreview', 'play_arrow', T('תצוגה מקדימה'), { big: true, title: T('הדף הזה מתנגן כאן כמו בזמן הקריאה. בקריאה (F5) הכול זז') })),
    group(T('שמירה כקובץ'), '', rbtn('cmVideo', 'movie', T('סרטון'), { big: true, title: T('הקומיקס כסרטון MP4 שמתנגן לבד, עם כל התנועה, למשל ליוטיוב') }),
      rbtn('cmGif', 'gif', 'GIF', { big: true, title: T('הדף הזה כתמונה שזזה, לשליחה ולשיתוף') })));
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
    V.hGrp = group(T('וובטון'), 'col', rsl(T('גובה הקטע'), 'h', MIN_SEG, MAX_SIDE), h('span', { class: 'cm-rsl', text: T('אפשר גם לגרור את הידית שבתחתית הקטע') })),
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
    liveStep(() => {
      if (k === 'bc' || k === 'bg') pg[k] = col(e.target.value, pg[k]);
      else if (k === 'h') { if (isWt(C)) setPartH(pg, +e.target.value, LIVE.pages[C.p]); }
      else pg[k] = Math.round(+e.target.value * unit());
    });
  });
  V.pageP.addEventListener('change', e => { if (e.target.dataset.pg) { liveEnd(); e.target.blur(); } });
  return [V.home, V.castP, V.fxP, V.moP, V.pageP];
}
/* the ribbon shows the comic as it is now */
function ribbonUI() {
  if (!V.pageP || !C) return;
  const pg = page(), u = unit();
  for (const el of V.pageP.querySelectorAll('[data-pg]')) {
    const k = el.dataset.pg;
    el.value = k === 'bc' || k === 'bg' ? pg[k] : k === 'h' ? String(pgH(pg)) : String(Math.round(pg[k] / u));
  }
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmDir"]')) b.classList.toggle('on', b.dataset.arg === C.dir);
  if (V.hGrp) V.hGrp.hidden = !isWt(C);
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmNotes"]')) b.classList.toggle('on', cprefs().notes !== false);
  const it = selItem(), pan = selPanel() || (!it && geom(pg).panels.length);
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmOrder"],#ribbon [data-cmd="cmDup"],#ribbon [data-cmd="cmDel"]')) b.disabled = !it;
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmPageDel"]')) b.disabled = C.pages.length <= 1;
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmMerge"]')) b.disabled = !selPanel() || geom(pg).panels.length <= 1;
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmSplit"]')) b.disabled = !pan;
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmLook"],#ribbon [data-cmd="cmFlip"],#ribbon [data-cmd="cmCastDraw"]')) b.disabled = !(it && it.t === 'chr');
  // the motion of what is chosen, the camera of the chosen panel, how pages turn, and whether things play here
  const mk = it ? (it.mo ? it.mo.k : 'none') : null, sp = selPanel(), cam = sp && page().pan[sp] && page().pan[sp].cam;
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmMo"]')) { b.classList.toggle('on', b.dataset.arg === mk); b.disabled = b.dataset.arg === 'type' && !!it && it.t !== 'bub'; }
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmCam"]')) b.classList.toggle('on', !!cam);
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmPlay"]')) b.classList.toggle('on', playOn());
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmAutoClear"]')) b.disabled = !motionAny(C);
  if (V.trSel) V.trSel.value = C.tr;
  castUI();
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
/* a webtoon shows all its parts one under another, so VIEW places the whole strip, and the page being worked on
   (C.p) starts OFF() pixels down it. Everything else speaks in that page's own pixels */
const topOf = i => { let y = 0; for (let j = 0; j < i; j++) y += pgH(C.pages[j]); return y; };
const stripH = () => C.pages.reduce((s, pg) => s + pgH(pg), 0);
const OFF = () => isWt(C) ? topOf(C.p) : 0;
function pageAtY(y) { let top = 0; for (let i = 0; i < C.pages.length; i++) { top += pgH(C.pages[i]); if (y < top) return i; } return C.pages.length - 1; }
const toPage = s => ({ x: (s.x - VIEW.x) / VIEW.z, y: (s.y - VIEW.y) / VIEW.z - OFF() });
const toScreen = (x, y) => ({ x: VIEW.x + x * VIEW.z, y: VIEW.y + (y + OFF()) * VIEW.z });
function liveStep(fn) { if (!C) return; if (!LIVE) LIVE = snap(); fn(); paint(); }
function liveEnd() { if (!LIVE) return; push(LIVE); LIVE = null; changed(); ribbonUI(); }
function fit() {
  if (!C || !V.vp) return;
  const r = vpRect();
  if (r.width < 20 || r.height < 20) { NEED_FIT = true; return; }
  NEED_FIT = false;
  const pad = r.width < 500 ? 10 : 28, bar = V.bar ? V.bar.offsetHeight + 16 : 0;   // the bar at the bottom stays off the page
  if (isWt(C)) {
    // a webtoon: as wide as a phone's reading of it would be (or the window), its part at the top
    VIEW.z = clamp(Math.min((r.width - 2 * pad) / C.w, 760 / C.w), 0.03, 12);
    VIEW.x = (r.width - C.w * VIEW.z) / 2; VIEW.y = pad - OFF() * VIEW.z;
    keepInView(); viewChanged();
    return;
  }
  VIEW.z = clamp(Math.min((r.width - 2 * pad) / C.w, (r.height - pad - Math.max(pad, bar)) / C.h), 0.03, 12);
  VIEW.x = (r.width - C.w * VIEW.z) / 2; VIEW.y = pad + (r.height - pad - Math.max(pad, bar) - C.h * VIEW.z) / 2;
  viewChanged();
}
function keepInView() {
  const r = vpRect(), m = 60, pw = C.w * VIEW.z, ph = (isWt(C) ? stripH() : C.h) * VIEW.z;
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
function viewChanged() {
  if (V.zp) V.zp.textContent = Math.round(VIEW.z * 100) + '%';
  // a webtoon scrolled away from the part being worked on: the part in the middle of the window is the one now
  if (isWt(C) && !EDIT && !(ACT && ACT.k !== 'pan')) {
    const r = vpRect(), y0 = -VIEW.y / VIEW.z, y1 = (r.height - VIEW.y) / VIEW.z, top = OFF();
    if (top + pgH(page()) < y0 || top > y1) setPage(pageAtY((y0 + y1) / 2));
  }
  placeText(); paint();
}
/* another page is the one worked on, without moving the view (a webtoon's part clicked or scrolled to) */
function setPage(i) {
  if (!C || i === C.p || !C.pages[i]) return;
  commitText();
  C.p = i; SEL = null; HOVER = null;
  stripUI(); sideUI(); ribbonUI(); stat();
  const el = V.list && V.list.children[i];
  if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
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
  const cx = V.cx, z = VIEW.z, now = performance.now(), cur = page(), pv = PREVIEW && PREVIEW.pg === cur.id ? PREVIEW : null, t = playOn() ? now - T0 : undefined;
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, W, H);
  cx.setTransform(dpr * z, 0, 0, dpr * z, dpr * VIEW.x, dpr * VIEW.y);
  cx.save(); cx.shadowColor = 'rgba(0,0,0,.22)'; cx.shadowBlur = 16 * dpr; cx.shadowOffsetY = 3 * dpr; cx.fillStyle = '#fff'; cx.fillRect(0, 0, C.w, isWt(C) ? stripH() : C.h); cx.restore();
  for (const pg of shownPages()) {
    const top = isWt(C) ? topOf(C.pages.indexOf(pg)) : 0, mine = pg === cur && pv;
    cx.setTransform(dpr * z, 0, 0, dpr * z, dpr * VIEW.x, dpr * (VIEW.y + top * z));
    cx.save(); cx.beginPath(); cx.rect(0, 0, C.w, pgH(pg)); cx.clip();
    cx.imageSmoothingQuality = 'high';
    drawPage(cx, pg, { ed: !mine, editor: !mine && cprefs().notes !== false, noText: pg === cur && EDIT && EDIT.id, missing: paint, t, mo: mine ? moFn(pv.sc, pg, now) : null, cam: mine ? camFn(pv.sc, pg, now) : null });
    cx.restore();
  }
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!pv) overlay(cx);
  tickSoon();
}
/* the pages in the window: the one worked on, or a webtoon's parts that show */
function shownPages() {
  if (!isWt(C)) return [page()];
  const r = vpRect(), y0 = -VIEW.y / VIEW.z, y1 = (r.height - VIEW.y) / VIEW.z, out = [];
  let top = 0;
  for (const pg of C.pages) { const H = pgH(pg); if (top + H > y0 && top < y1) out.push(pg); top += H; }
  return out.length ? out : [page()];
}
/* --- the editor plays the drawings with frames (unless "ניגון בעורך" is off), and "תצוגה מקדימה" plays the page's
   motion once, as it will be read --- */
const T0 = performance.now();
let TICK = 0, LASTF = '', PREVIEW = null;
const playOn = () => cprefs().play !== false;
function tickSoon() { if (!TICK) TICK = requestAnimationFrame(tick); }
function tick() {
  TICK = 0;
  if (!C || DRAWING || READ || !V.cv) return;
  const now = performance.now();
  if (PREVIEW && now > PREVIEW.end) { stopPreview(); return; }
  const arts = playOn() ? shownPages().flatMap(movingArts) : [];
  let key = PREVIEW ? 'p' + Math.floor(now / 30) : '';
  for (const art of arts) { const e = ART.get(art); if (e && e.an) key += window.INK_DRAW.frameAt(e.an.frames, e.an.fps, e.an.loop, now - T0) + ','; }
  if (key !== LASTF) { LASTF = key; render(); }
  if (PREVIEW || arts.length) tickSoon();
}
function playPreview() {
  if (!C) return;
  commitText(); endAct(true);
  const pg = page(), sc = newSched(), now = performance.now(), end = schedPage(sc, pg, now + 300);
  if (!pg.its.some(it => it.mo) && !Object.values(pg.pan).some(x => x.cam)) { toast(T('בדף הזה עוד אין תנועה. בוחרים בלון, דמות או משבצת, ואז תנועה בלשונית "תנועה".'), { icon: 'info', ms: 6000 }); return; }
  PREVIEW = { pg: pg.id, sc, end: Math.max(end + 1200, Object.values(pg.pan).some(x => x.cam) ? now + 300 + CAM_S * 1000 : 0) };
  SEL = null; HOVER = null;
  sideUI(); ribbonUI(); previewUI();
  LASTF = '';
  tickSoon();
}
function stopPreview() {
  if (!PREVIEW) return;
  PREVIEW = null;
  previewUI(); paint();
}
function previewUI() {
  for (const b of document.querySelectorAll('#ribbon [data-cmd="cmPreview"]')) {
    const ic = b.querySelector('.ms'), t = b.querySelector('span:not(.ms)'), label = PREVIEW ? T('עצירה') : T('תצוגה מקדימה');
    if (ic) ic.textContent = PREVIEW ? 'stop' : 'play_arrow';
    if (t) t.textContent = label;
    b.title = label; b.setAttribute('aria-label', label); b.classList.toggle('on', !!PREVIEW);
  }
}
/* --- what is drawn over the page, in screen pixels: the panels' numbers, what is chosen and its handles --- */
const ACC = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2743d8';
function screenPoly(cx, P) { cx.beginPath(); P.forEach((q, i) => { const s = toScreen(q.x, q.y); if (i) cx.lineTo(s.x, s.y); else cx.moveTo(s.x, s.y); }); cx.closePath(); }
function overlay(cx) {
  const pg = page(), g = geom(pg), acc = ACC(), z = VIEW.z;
  cx.save();
  cx.lineJoin = 'round';
  if (isWt(C)) {
    // where one part of the webtoon ends and the next starts (only here, never in what is read), and the grip that
    // makes the part being worked on taller or shorter
    const shown = shownPages(), r = vpRect();
    cx.font = '600 11.5px system-ui,sans-serif'; cx.textBaseline = 'bottom';
    for (const q of shown) {
      const i = C.pages.indexOf(q);
      if (!i) continue;
      const y = Math.round(VIEW.y + topOf(i) * z) + 0.5, x0 = VIEW.x, x1 = VIEW.x + C.w * z;
      cx.setLineDash([7, 6]); cx.lineWidth = 1; cx.strokeStyle = 'rgba(80,90,120,.55)';
      cx.beginPath(); cx.moveTo(x0, y); cx.lineTo(x1, y); cx.stroke(); cx.setLineDash([]);
      const label = T('קטע {0}', i + 1), lw = cx.measureText(label).width + 12, lx = clamp(UI_DIR === 'rtl' ? x1 + 6 : x0 - 6 - lw, 4, r.width - lw - 4);
      cx.fillStyle = 'rgba(80,90,120,.75)'; cx.textAlign = 'left'; cx.fillText(label, lx + 6, y - 3);
    }
    const gp = toScreen(C.w / 2, pgH(pg));
    cx.fillStyle = HOVER && HOVER.k === 'seg' || (ACT && ACT.k === 'seg') ? acc : 'rgba(255,255,255,.95)'; cx.strokeStyle = acc; cx.lineWidth = 1.5;
    cx.beginPath(); cx.roundRect ? cx.roundRect(gp.x - 26, gp.y - 7, 52, 14, 7) : cx.rect(gp.x - 26, gp.y - 7, 52, 14); cx.fill(); cx.stroke();
    cx.strokeStyle = HOVER && HOVER.k === 'seg' || (ACT && ACT.k === 'seg') ? '#fff' : acc;
    for (const d of [-3, 3]) { cx.beginPath(); cx.moveTo(gp.x - 12, gp.y + d); cx.lineTo(gp.x + 12, gp.y + d); cx.stroke(); }
  }
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
const turns = it => it.t === 'sfx' || it.t === 'speed' || it.t === 'chr';
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
  if (Math.abs(q.x) <= it.w / 2 && Math.abs(q.y) <= it.h / 2) return it.t !== 'chr' || chrHit(it, q);
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
const onGrip = (p, touch) => isWt(C) && Math.abs(p.y - pgH(page())) * VIEW.z <= (touch ? 14 : 9) && Math.abs(p.x - C.w / 2) * VIEW.z <= 34;
function hitAt(p, touch) {
  const pg = page(), g = geom(pg), tol = (touch ? 18 : 9) / VIEW.z, it = selItem();
  if (onGrip(p, touch)) return { k: 'seg' };
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
  : hit.k === 'item' ? 'move' : hit.k === 'cut' ? (hit.end !== 'mid' ? 'cross' : hit.cut.n.d === 'h' ? 'ns' : 'ew') : hit.k === 'panel' ? 'pt' : hit.k === 'seg' ? 'ns' : '';
function setCursor(k) { V.vp.className = 'cm-vp' + (k ? ' c-' + k : ''); }
function onDown(e) {
  if (!C || DRAWING) return;
  if (EDIT && e.target === V.ta) return;
  if (PREVIEW) stopPreview();
  const sp = viewPt(e), touch = e.pointerType === 'touch';
  let p = toPage(sp);
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
  // a webtoon: pressing on another part makes it the one worked on (the grip at the bottom of this one excepted)
  if (isWt(C) && !onGrip(p, touch)) { const i = pageAtY((sp.y - VIEW.y) / VIEW.z); if (i !== C.p) { setPage(i); p = toPage(sp); LASTUP = null; } }
  const dbl = LASTUP && performance.now() - LASTUP.t < 420 && Math.hypot(LASTUP.x - sp.x, LASTUP.y - sp.y) < (touch ? 24 : 8);
  // twice on the chosen character draws it (not the panel under it, which a second press would choose)
  const was = selItem();
  if (dbl && was && was.t === 'chr' && itemHit(was, p, geom(page()))) { LASTUP = null; drawLook(was.c, was.lk); return; }
  const hit = hitAt(p, touch);
  LASTHIT = p;
  if (dbl && hit) {
    LASTUP = null;
    const it = hit.k === 'item' ? hit.it : hit.k === 'handle' ? hit.it : null;
    if (it && (it.t === 'bub' || it.t === 'sfx')) { startText(it); return; }
    if (it && it.t === 'chr') { select({ k: 'item', id: it.id }); drawLook(it.c, it.lk); return; }
    const g = geom(page()), pan = it && it.pn ? it.pn : hit.k === 'panel' ? hit.id : (g.panels.find(q => q.P && inPoly(q.P, p)) || {}).id;
    if (pan) { drawPanel(pan); return; }
  }
  const base = { id: e.pointerId, s0: sp, p0: p, moved: false, touch, pre: null };
  if (hit && hit.k === 'seg') { ACT = { ...base, k: 'seg', h0: pgH(page()) }; paint(); return; }
  if (!hit) { select(null); ACT = { ...base, k: 'pan', v: { ...VIEW } }; return; }
  if (hit.k === 'handle') { ACT = { ...base, k: 'handle', hd: hit.hd.k, iid: hit.it.id, it0: clone(hit.it) }; return; }
  if (hit.k === 'item') { select({ k: 'item', id: hit.it.id }); ACT = { ...base, k: 'move', iid: hit.it.id, it0: clone(hit.it), tails: hit.it.t === 'chr' ? tailsOn(hit.it) : null }; return; }
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
    const hit = hitAt(toPage(sp), false), hv = hit && hit.k === 'cut' ? { k: 'cut', path: hit.path, end: hit.end } : hit && hit.k === 'panel' ? { k: 'panel', id: hit.id } : hit && hit.k === 'seg' ? { k: 'seg' } : null;
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
  if (a.k === 'seg') {   // a webtoon's part made taller or shorter, as far as its panels allow
    setPartH(page(), a.h0 + (sp.y - a.s0.y) / VIEW.z, a.pre.pages[C.p]);
    paint();
    return;
  }
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
    for (const t of a.tails || []) { const b = findItem(t.id); if (b) { b.tx = t.tx + mx; b.ty = t.ty + my; } }   // what the character says points at it still
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
  if (hd.length === 2 && (o.t === 'img' || o.t === 'chr' ? !shift : shift)) {
    // a picture or a character keeps its shape (Shift lets it stretch); anything else keeps it with Shift
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
  if (PREVIEW && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== 'Shift') stopPreview();
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
    if (it && it.t === 'chr') { e.preventDefault(); drawLook(it.c, it.lk); return true; }
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
  if (PREVIEW) { stopPreview(); return true; }
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
  if (it.who) aimTail(it);
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
  const it = selItem(), pid = selPanel(), u = unit();
  V.sbody.textContent = '';
  const body = { append: (...xs) => V.sbody.append(...xs.filter(x => x != null && x !== false)) };   // a row some things don't have is null: nothing, not the word
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
      C.cast.length && it.k !== 'box' ? choose(T('מי אומר'), [['', T('אף אחד')], ...C.cast.map(x => [x.id, x.n])], it.who || '', set((x, v) => { if (castOf(v)) { x.who = v; aimTail(x); } else delete x.who; })) : null,
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
    } else if (it.t === 'chr') {
      const ch = castOf(it.c);
      V.stitle.textContent = ch ? ch.n : T('דמות');
      body.append(C.cast.length > 1 ? choose(T('דמות'), C.cast.map(x => [x.id, x.n]), it.c, set((x, v) => { const n = castOf(v); if (!n || x.c === v) return; x.c = v; x.lk = n.lk[0].id; const c = center(x); x.w = x.h * n.w / n.h; x.x = c.x - x.w / 2; })) : null,
        h('h5', { text: T('הבעות') }), looksPick(it),
        h('div', { class: 'cm-btns' }, act('brush', T('ציור הדמות'), () => drawLook(it.c, it.lk), 'primary'), act('flip', T('היפוך@mirror'), () => flipChar())),
        slider(T('סיבוב@turn'), it.r, -180, 180, 1, v => Math.round(v) + '°', set((x, v) => { x.r = v; })),
        clipRow(it),
        h('p', { class: 'muted small', text: T('הדמות נשמרת פעם אחת: ציור שלה משנה אותה בכל מקום שהיא מופיעה בו. לחיצה כפולה עליה פותחת את הציור.') }));
    } else if (it.t === 'img') {
      V.stitle.textContent = T('תמונה');
      body.append(h('div', { class: 'cm-btns' }, act('crop_free', T('מילוי המשבצת'), on(x => coverPanel(x))), act('image', T('החלפה'), on(x => pickImage(x.pn, x.id)))),
        h('p', { class: 'muted small', text: T('התמונה נחתכת לפי המשבצת. גוררים אותה כדי להזיז, ואת הפינות כדי לשנות גודל') }));
    }
    if (it.t !== 'img') body.append(...motionRows(it));
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
      pan.art ? h('div', { class: 'cm-btns' }, act('ink_eraser', T('מחיקת הציור'), () => edit(() => { panOf(pid).art = ''; }), 'danger')) : null,
      ...camRows(pid));
  } else {
    V.stitle.textContent = pageName(page());
    body.append(h('p', { class: 'muted small', text: T('לוחצים על משבצת כדי לבחור אותה, ופעמיים כדי לצייר בה. גוררים את הרווח בין משבצות כדי לשנות את הגודל שלהן, ואת הקצוות שלו כדי להטות אותו.') }),
      h('div', { class: 'cm-btns' }, act('view_quilt', T('חלוקה'), e => layoutPop(e.currentTarget)), act('auto_stories', T('קריאה'), () => openReader())),
      slider(T('בין משבצות'), page().gut / u, 0, 120, 1, px, v => { page().gut = v * u; }),
      slider(T('שוליים'), page().mar / u, 0, 200, 1, px, v => { page().mar = v * u; }),
      slider(T('מסגרת'), page().bw / u, 0, 24, 0.5, v => String(r1(v)), v => { page().bw = v * u; }),
      isWt(C) ? slider(T('גובה הקטע'), pgH(page()), MIN_SEG, MAX_SIDE, 10, px, v => { setPartH(page(), v, LIVE.pages[C.p]); }) : null,
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
  if (isWt(C) && V.vp) { VIEW.y = (vpRect().width < 500 ? 10 : 28) - topOf(i) * VIEW.z; keepInView(); viewChanged(); }   // a webtoon scrolls to the part
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
      if (isWt(C)) pg.h = pgH(cur);
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
    const im = pg.th ? h('img', { src: pg.th, alt: '' }) : h('div', { class: 'ph', style: { aspectRatio: `${C.w} / ${pgH(pg)}` } });
    return h('div', { class: 'cm-pg' + (i === C.p ? ' on' : ''), role: 'option', 'aria-selected': String(i === C.p), 'data-i': String(i), 'data-id': pg.id, tabindex: '0', title: pageName(pg) },
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
  const el = h('div', { class: 'cm-pop' }, h('div', { class: 'pop-t', text: T('חלוקת הדף למשבצות') }), layoutGalleryFor(k => { closePopover(); applyLayout(k); }, null, C.dir, C.w, pgH(page()), isWt(C)),
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
  const sp = selItem(), who = sp && sp.t === 'chr' && k !== 'box' ? sp : null;   // a character chosen: the bubble is what it says
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
    if (who) { x = clamp(center(who).x - w / 2, b.x + b.w * 0.04, b.x + b.w * 0.96 - w); y = clamp(headOf(who).y - hh - 40 * u, b.y + 10 * u, b.y + b.h - hh - 10 * u); }
  }
  if (p.P) ({ x, y, w } = inside(p.P, { x, y, w, h: hh }, 10 * u, b.y + b.h * 0.7 - hh));
  const it = { id: rid('i'), t: 'bub', k, x, y, w, h: hh, txt: '', f: d.f, fs: d.fs, b: k === 'shout', fc: d.fc, fill: k === 'box' ? '#fff6cc' : d.fill, sc: d.sc, sw: d.sw, tl: k !== 'box',
    tx: x + w / 2 + (rtl ? -1 : 1) * w * 0.12, ty: Math.min(b.y + b.h - 20 * u, y + hh + b.h * 0.2) };
  if (who) { it.who = who.c; aimTail(it); }
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
   characters: drawn once, put in any panel again and again. Where one stands is an item ('chr') that points at its
   character and one of its looks, so drawing a look again changes it everywhere. A bubble can say who says it (who):
   its tail then points at that character's head, and moves with it
   ========================================================= */
const castByName = name => { const n = String(name == null ? '' : name).trim().toLowerCase(); return n && C ? C.cast.find(x => x.id === name || x.n.trim().toLowerCase() === n) || null : null; };
const usesOf = cid => C.pages.reduce((n, pg) => n + pg.its.filter(it => it.t === 'chr' && it.c === cid).length, 0);
function newCast(name, ds) {
  const sz = castSize(C);
  return { id: rid('c'), n: String(name || '').trim().slice(0, 60) || T('דמות {0}', C.cast.length + 1), col: CAST_COLORS[C.cast.length % CAST_COLORS.length], ds: String(ds || '').trim().slice(0, 1000), w: sz.w, h: sz.h, lk: [{ id: rid('k'), n: '', art: '', th: '' }] };
}
/* a character where it stands: on the bottom of the panel, most of its height, beside the ones already there */
function placeChar(pg, p, ch, lkId) {
  const b = p.box, others = pg.its.filter(it => it.t === 'chr' && (p.id ? it.pn === p.id : !it.pn)).length, rtl = C.dir === 'rtl';
  let hh = b.h * 0.76, w = hh * ch.w / ch.h;
  if (w > b.w * 0.62) { w = b.w * 0.62; hh = w * ch.h / ch.w; }
  const slot = [0.3, 0.7, 0.5, 0.15, 0.85][others % 5];
  const it = { id: rid('i'), t: 'chr', c: ch.id, lk: lkId && ch.lk.some(l => l.id === lkId) ? lkId : ch.lk[0].id, x: b.x + b.w * (rtl ? 1 - slot : slot) - w / 2, y: b.y + b.h - hh + b.h * 0.03, w, h: hh, fl: false, r: 0 };
  if (p.id) it.pn = p.id;
  pg.its.push(it);
  return it;
}
/* about where a character's mouth is where it stands: a little under the top of what is drawn */
function headOf(it) {
  const ch = castOf(it.c), lk = ch && lookOf(ch, it.lk), e = lk && lk.art && ART.get(lk.art), c = center(it);
  let fx = 0.5, fy = 0.1;
  if (e && e.cvs) { const bb = maskOf(e).bb; fx = (bb.x + bb.w / 2) / e.hd.w; fy = (bb.y + Math.min(bb.h, bb.w) * 0.3) / e.hd.h; }
  const q = rot((it.fl ? 1 - fx : fx) * it.w - it.w / 2, fy * it.h - it.h / 2, it.r || 0);
  return { x: c.x + q.x, y: c.y + q.y };
}
/* a bubble's tail toward the one saying it: where that character stands in the bubble's panel, or the nearest place on the page */
function aimTail(b, pg = page()) {
  if (!b.who || !b.tl || b.k === 'box') return false;
  const bc = center(b), bp = geom(pg).panels.find(p => p.P && inPoly(p.P, bc)), mine = pg.its.filter(it => it.t === 'chr' && it.c === b.who);
  if (!mine.length) return false;
  const d = it => Math.hypot(center(it).x - bc.x, center(it).y - bc.y);
  const at = mine.find(it => bp && it.pn === bp.id) || mine.reduce((a, x) => d(x) < d(a) ? x : a), hd = headOf(at);
  // along the line to the head: a little short of it, but always long enough to be seen outside the bubble
  const dx = hd.x - bc.x, dy = hd.y - bc.y, L = Math.hypot(dx, dy) || 1, rx = b.w / 2, ry = b.h / 2;
  const edge = 1 / Math.sqrt((dx / L / rx) ** 2 + (dy / L / ry) ** 2), t = Math.max(edge + Math.max(0.7 * Math.min(rx, ry), 40 * unit()), L - Math.min(L * 0.15, 60 * unit()));
  b.tx = bc.x + dx / L * t; b.ty = bc.y + dy / L * t;
  return true;
}
/* the tails pointing into a character, which move with it when it is dragged */
const tailsOn = it => page().its.filter(b => b.t === 'bub' && b.who === it.c && b.tl && Math.abs(b.tx - it.x - it.w / 2) <= it.w * 0.6 && Math.abs(b.ty - it.y - it.h / 2) <= it.h * 0.6).map(b => ({ id: b.id, tx: b.tx, ty: b.ty }));
function chrHit(it, q) {
  if (SEL && SEL.k === 'item' && SEL.id === it.id) return true;   // the chosen one anywhere in its box, to drag it
  const art = lookArt(it), e = art && ART.get(art);
  if (!e || !e.cvs) return true;   // not drawn yet (its outline fills the box), or still on its way
  const m = maskOf(e), ax = ((it.fl ? -q.x : q.x) / it.w + 0.5) * e.hd.w, ay = (q.y / it.h + 0.5) * e.hd.h;
  const mx = Math.floor((ax - e.r.x) / e.r.w * m.w), my = Math.floor((ay - e.r.y) / e.r.h * m.h);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = mx + dx, y = my + dy; if (x >= 0 && y >= 0 && x < m.w && y < m.h && m.a[y * m.w + x] > 24) return true; }
  return false;
}
/* a character in the chosen panel (or the one at pt, where it was dropped), chosen */
function addChar(cid, pt) {
  const ch = castOf(cid);
  if (!ch || !C) return;
  commitText();
  const g = geom(page()), p = (pt && g.panels.find(q => q.P && inPoly(q.P, pt))) || placeFor();
  edit(() => {
    const it = placeChar(page(), p, ch);
    if (pt) it.x = pt.x - it.w / 2;
    SEL = { k: 'item', id: it.id };
  });
  sideUI(); ribbonUI(); castUI();
  if (!ch.lk.some(l => l.art)) toast(T('הדמות "{0}" עוד לא מצוירת. לחיצה כפולה עליה פותחת את הציור שלה.', ch.n), { icon: 'brush', ms: 5000 });
}
/* a new character: its name and what it looks like, then straight to drawing it (in the chosen panel, when there is one) */
function castNew() {
  if (!C) return;
  if (C.cast.length >= MAX_CAST) { toast(T('אפשר עד {0} דמויות בקומיקס אחד', MAX_CAST)); return; }
  commitText();
  const pid = targetPanel(true), name = h('input', { class: 'field', type: 'text', value: T('דמות {0}', C.cast.length + 1), maxlength: '60', autofocus: true });
  const ds = h('textarea', { class: 'cm-txt', placeholder: T('איך היא נראית? (לא חובה. עוזר לזכור, וגם לקלוד)'), maxlength: '1000' });
  let go = null;
  const m = modal({ title: T('דמות חדשה'), body: h('div', { class: 'cm-cnew' }, h('label', { class: 'fld' }, h('span', { text: T('שם') }), name), h('label', { class: 'fld' }, h('span', { text: T('תיאור') }), ds)),
    actions: [{ label: T('ציור הדמות'), kind: 'primary', icon: 'brush', run: () => { go = 'draw'; } }, { label: T('בלי ציור עכשיו'), run: () => { go = 'keep'; } }, { label: T('ביטול'), value: false }],
    onClose: () => {
      if (!go || !C) return;
      const ch = newCast(name.value, ds.value);
      edit(() => {
        C.cast.push(ch);
        const p = pid && geom(page()).panels.find(q => q.id === pid);
        if (p) SEL = { k: 'item', id: placeChar(page(), p, ch).id };
      });
      castUI(); sideUI(); ribbonUI();
      if (go === 'draw') drawLook(ch.id, ch.lk[0].id);
    } });
  setTimeout(() => name.select(), 40);
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { go = 'draw'; m.close(true); } });
}
/* another look of a character, starting as a copy of one it has (the way a new frame starts from the one before) */
function newLook(cid, from) {
  const ch = castOf(cid);
  if (!ch) return null;
  if (ch.lk.length >= MAX_LOOKS) { toast(T('אפשר עד {0} הבעות לכל דמות', MAX_LOOKS)); return null; }
  const src = ch.lk.find(l => l.id === from), lk = { id: rid('k'), n: '', art: src ? src.art : '', th: src ? src.th : '' };
  edit(() => { castOf(cid).lk.push(lk); const it = selItem(); if (it && it.t === 'chr' && it.c === cid) it.lk = lk.id; });
  castUI(); sideUI();
  return lk;
}
function delLook(cid, lkid) {
  edit(() => {
    const ch = castOf(cid);
    if (!ch || ch.lk.length <= 1) return false;
    ch.lk = ch.lk.filter(l => l.id !== lkid);
    for (const pg of C.pages) for (const it of pg.its) if (it.t === 'chr' && it.c === cid && it.lk === lkid) it.lk = ch.lk[0].id;
  });
  castUI(); sideUI();
}
async function delCast(cid) {
  const ch = castOf(cid);
  if (!ch) return false;
  const n = usesOf(cid);
  if (!(await confirmBox(T('מחיקת הדמות'), n ? T('"{0}" תימחק מכל המקומות שהיא מופיעה בהם. אפשר להחזיר אותה עם ביטול (Ctrl+Z).', ch.n) : T('"{0}" תימחק. אפשר להחזיר אותה עם ביטול (Ctrl+Z).', ch.n), T('מחיקה'), true))) return false;
  edit(() => {
    C.cast = C.cast.filter(x => x.id !== cid);
    for (const pg of C.pages) { pg.its = pg.its.filter(it => !(it.t === 'chr' && it.c === cid)); for (const it of pg.its) if (it.who === cid) delete it.who; }
    if (SEL && SEL.k === 'item' && !findItem(SEL.id)) SEL = null;
  });
  castUI(); sideUI(); ribbonUI();
  return true;
}
/* a look's small picture, cut to what is drawn in it (for the gallery and the windows) */
async function lookThumb(cid, lkid) {
  const ch = castOf(cid), lk = ch && ch.lk.find(l => l.id === lkid), art = lk && lk.art;
  if (lk && !art) { lk.th = ''; castUI(); sideUI(); return; }
  if (!art) return;
  const e = await artLoad(art, null).catch(() => null);
  if (!e || !e.cvs) return;
  const bb = pad(maskOf(e).bb, 0.04), k = Math.min(1, 120 / Math.max(bb.w, bb.h)), c = newCanvas(bb.w * k, bb.h * k), x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(e.cvs[0], (e.r.x - bb.x) * k, (e.r.y - bb.y) * k, e.r.w * k, e.r.h * k);
  const th = c.toDataURL('image/png');
  freeCanvas(c);
  const l2 = castOf(cid) && castOf(cid).lk.find(l => l.id === lkid);
  if (!l2 || l2.art !== art) return;
  l2.th = th;   // not a step of its own: only a picture of what is there
  castUI(); sideUI();
  if (LOADED && S.cur === LOADED) markDirty();
}
/* a character's small picture: its look, or its color and first letter while nobody drew it */
function castFace(ch, lk = ch.lk[0]) {
  if (lk && lk.th) return h('img', { src: lk.th, alt: '', draggable: 'false' });
  return h('i', { class: 'cm-face', style: { background: ch.col }, text: Array.from(ch.n.trim())[0] || '?' });
}
/* the ribbon's gallery: a click puts the character in the chosen panel; with a mouse or a pen it can be dragged onto the page */
function castUI() {
  if (!V.castGal || !C) return;
  const it = selItem(), on = it && it.t === 'chr' ? it.c : null;
  const kids = C.cast.map(ch => h('button', { class: 'cm-cast' + (ch.id === on ? ' on' : ''), type: 'button', 'data-cmd': 'cmCastAdd', 'data-arg': ch.id, role: 'listitem', title: T('{0}: לחיצה מכניסה למשבצת, ואפשר גם לגרור לדף', ch.n) }, castFace(ch), h('span', { text: ch.n })));
  if (!kids.length) kids.push(h('span', { class: 'cm-cnone', text: T('עוד אין דמויות. "דמות חדשה" מוסיפה אחת.') }));
  V.castGal.replaceChildren(...kids);
}
function castEvents() {
  V.castGal.addEventListener('pointerdown', e => {
    const b = e.target.closest('.cm-cast');
    if (!b || e.button > 0 || e.pointerType === 'touch') return;   // a finger scrolls the ribbon; it taps instead
    const s0 = { x: e.clientX, y: e.clientY }, ghost = h('div', { class: 'cm-ghost' }, b.firstChild.cloneNode(true));
    let drag = false;
    const mv = ev => {
      if (!drag && Math.hypot(ev.clientX - s0.x, ev.clientY - s0.y) < 8) return;
      if (!drag) { drag = true; document.body.append(ghost); }
      Object.assign(ghost.style, { left: ev.clientX + 'px', top: ev.clientY + 'px' });
    };
    const up = ev => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      ghost.remove();
      if (!drag) return;
      // a drag is not a click: the gallery's own click must not put a second one in
      const stop = c => { c.stopPropagation(); c.preventDefault(); };
      addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', stop, { capture: true }), 0);
      const r = vpRect();
      if (ev.type === 'pointerup' && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) addChar(b.dataset.arg, toPage(viewPt(ev)));
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
}
/* the chosen character's looks: a click wears one, "+" makes a new one from it and opens it for drawing */
function looksPick(it, after) {
  const ch = castOf(it.c);
  return h('div', { class: 'cm-looks', role: 'radiogroup', 'aria-label': T('הבעות') }, ch.lk.map(lk => h('button', { class: 'cm-look' + (lk.id === it.lk ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': String(lk.id === it.lk), title: T('ההבעה הזאת'),
    onclick: () => { edit(() => { const x = findItem(it.id); if (!x || x.lk === lk.id) return false; x.lk = lk.id; }); sideUI(); if (after) after(); } }, castFace(ch, lk))),
    h('button', { class: 'cm-look add', type: 'button', title: T('הבעה חדשה: עותק של ההבעה הזאת, לציור'), 'aria-label': T('הבעה חדשה'), onclick: () => { if (after) after(); const lk = newLook(it.c, it.lk); if (lk) drawLook(it.c, lk.id); } }, icon('add')));
}
function lookPop(anchor) {
  const it = selItem();
  if (!it || it.t !== 'chr') { toast(T('קודם בוחרים דמות בדף: לוחצים עליה'), { icon: 'info' }); return; }
  openPop(anchor, h('div', { class: 'cm-pop' }, h('div', { class: 'pop-t', text: T('ההבעות של {0}', castOf(it.c).n) }), looksPick(it, () => closePopover())));
}
function flipChar() { edit(() => { const x = selItem(); if (!x || x.t !== 'chr') return false; x.fl = !x.fl; }); }
/* all the characters: names, colors, what they look like, their looks, and taking one away */
function castDialog() {
  if (!C) return;
  commitText();
  const box = h('div', { class: 'cm-castlist' });
  const m = modal({ title: T('הדמויות בקומיקס'), wide: true, body: box, actions: [{ label: T('סגירה'), value: false }] });
  const draw = () => {
    box.textContent = '';
    if (!C) return;
    if (!C.cast.length) box.append(h('p', { class: 'muted', text: T('עוד אין דמויות בקומיקס הזה. דמות מציירים פעם אחת, ומכניסים אותה לכל משבצת שרוצים.') }));
    for (const ch of C.cast) box.append(castRow(ch, draw, m));
    box.append(h('div', { class: 'cm-btns' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { m.close(); castNew(); } }, icon('group_add'), T('דמות חדשה')),
      h('button', { class: 'btn', type: 'button', onclick: () => { m.close(); importCast(); } }, icon('input'), T('ייבוא מקומיקס אחר'))));
  };
  draw();
}
function castRow(ch, redraw, m) {
  const id = ch.id, name = h('input', { class: 'field', type: 'text', value: ch.n, maxlength: '60', 'aria-label': T('שם') });
  name.addEventListener('change', () => { const v = name.value.trim().slice(0, 60); if (!v) { name.value = ch.n; return; } edit(() => { const x = castOf(id); if (!x || x.n === v) return false; x.n = v; }); castUI(); sideUI(); });
  const colr = h('input', { type: 'color', value: ch.col, 'aria-label': T('צבע'), title: T('הצבע של הדמות, לקו שלה כשהיא עוד לא מצוירת') });
  colr.addEventListener('change', () => { edit(() => { const x = castOf(id); if (!x || x.col === colr.value) return false; x.col = colr.value; }); castUI(); redraw(); });
  const ds = h('textarea', { class: 'cm-txt', placeholder: T('איך היא נראית? (לא חובה. עוזר לזכור, וגם לקלוד)'), 'aria-label': T('תיאור') });
  ds.value = ch.ds;
  ds.addEventListener('change', () => edit(() => { const x = castOf(id); if (!x || x.ds === ds.value) return false; x.ds = ds.value.slice(0, 1000); }));
  const looks = h('div', { class: 'cm-looks' }, ch.lk.map(lk => h('div', { class: 'cm-lk' },
    h('button', { class: 'cm-look', type: 'button', title: T('ציור ההבעה הזאת'), onclick: () => { m.close(); drawLook(id, lk.id); } }, castFace(ch, lk)),
    ch.lk.length > 1 ? h('button', { class: 'cm-ldel', type: 'button', title: T('מחיקת ההבעה'), 'aria-label': T('מחיקת ההבעה'), onclick: () => { delLook(id, lk.id); redraw(); } }, icon('close')) : null)),
    h('button', { class: 'cm-look add', type: 'button', title: T('הבעה חדשה: עותק של ההבעה האחרונה, לציור'), 'aria-label': T('הבעה חדשה'), onclick: () => { const x = castOf(id), lk = x && newLook(id, x.lk[x.lk.length - 1].id); if (lk) { m.close(); drawLook(id, lk.id); } } }, icon('add')));
  const n = usesOf(id);
  return h('div', { class: 'cm-crow' }, h('div', { class: 'cm-cface' }, castFace(ch)),
    h('div', { class: 'cm-cmain' }, h('div', { class: 'cm-cline' }, name, colr), ds, h('h5', { text: T('הבעות') }), looks,
      h('div', { class: 'cm-btns' }, h('span', { class: 'muted small grow', text: n ? T('מופיעה בקומיקס {0}', TN('{n} פעמים', n)) : T('עוד לא מופיעה בקומיקס') }),
        h('button', { class: 'btn small', type: 'button', onclick: () => { m.close(); addChar(id); } }, icon('add'), T('הוספה לדף')),
        h('button', { class: 'btn small danger', type: 'button', onclick: async () => { if (await delCast(id)) redraw(); } }, icon('delete'), T('מחיקה')))));
}
/* characters from another comic in the list: chosen there, copied here with their looks */
function importCast() {
  if (!C || !LOADED) return;
  const cur = LOADED, list = aliveDocs().filter(d => d.kind === 'comic' && d.id !== cur.id);
  if (!list.length) { toast(T('אין עוד קומיקסים ברשימה, אז אין מאיפה לייבא דמויות.'), { icon: 'info', ms: 5000 }); return; }
  const okTh = t => typeof t === 'string' && /^data:image\/jpeg;base64,/.test(t);
  const m = modal({ title: T('דמויות מקומיקס אחר'), wide: true, body: h('div', { class: 'cm-picks' }, list.map(d => h('button', { class: 'cm-pk', type: 'button', onclick: () => pick(d) },
    h('div', { class: 'im' }, okTh(d.thumb) ? h('img', { src: d.thumb, alt: '' }) : icon('auto_stories')), h('b', { text: displayTitle(d) }), h('small', { text: relTime(d.updatedAt || Date.now()) })))) });
  async function pick(d) {
    m.close();
    let cast = [];
    try { cast = parseCast(JSON.parse(await S.store.readBody(d.id, d.chunks || 1)).cast, C); } catch (e) { console.error(e); }
    if (S.cur !== cur || !C) return;
    if (!cast.length) { toast(T('בקומיקס "{0}" אין דמויות', displayTitle(d)), { icon: 'info' }); return; }
    const boxes = cast.map(ch => { const b = h('input', { type: 'checkbox' }); b.checked = true; return b; });
    modal({ title: T('אילו דמויות לייבא?'), body: h('div', { class: 'cm-imp' }, cast.map((ch, i) => h('label', { class: 'cm-impr' }, boxes[i], h('span', { class: 'cm-cface' }, castFace(ch)), h('b', { text: ch.n }), h('small', { class: 'muted', text: TN('{n} הבעות', ch.lk.length) })))),
      actions: [{ label: T('ייבוא'), kind: 'primary', icon: 'input', run: () => {
        const take = cast.filter((_, i) => boxes[i].checked).slice(0, MAX_CAST - C.cast.length);
        if (!take.length) return;
        edit(() => {
          for (const ch of take) {
            let n = ch.n;
            for (let k = 2; C.cast.some(x => x.n === n); k++) n = `${ch.n} ${k}`;
            C.cast.push({ ...ch, id: rid('c'), n, lk: ch.lk.map(l => ({ ...l, id: rid('k') })) });
          }
        });
        castUI();
        toast(TN('{n} דמויות נוספו. הן ברשימה שבלשונית "דמויות".', take.length), { icon: 'group_add' });
      } }, { label: T('ביטול'), value: false }] });
  }
}

/* =========================================================
   motion: the "תנועה" tab and the side's part of it. A motion goes on what is chosen (a panel chosen: on everything in
   it), and plays at once so its look is seen; a panel's camera and its frames are set from there too
   ========================================================= */
/* the side a thing flies in from: the nearer edge of its panel */
function sideFrom(pg, it) {
  const p = geom(pg).panels.find(q => q.id === panelOf(pg, geom(pg), it)), c = center(it);
  return p && c.x < p.box.x + p.box.w / 2 ? 'l' : 'r';
}
function setMotion(k) {
  if (!C) return;
  const pg = page(), it = selItem(), pid = !it && selPanel();
  if (!it && !pid) { toast(T('קודם בוחרים בלון, דמות או אפקט בדף, או משבצת בשביל כל מה שבתוכה'), { icon: 'info', ms: 5000 }); return; }
  const g = geom(pg), list = (it ? [it] : pg.its.filter(x => x.t !== 'img' && panelOf(pg, g, x) === pid)).filter(x => k !== 'type' || x.t === 'bub');
  if (!list.length) { toast(k === 'type' ? T('רק המילים של בלון נכתבות אות אחרי אות') : T('במשבצת הזאת עוד אין בלונים, דמויות או אפקטים')); return; }
  edit(() => {
    for (const x0 of list) {
      const x = findItem(x0.id);
      if (!x) continue;
      if (k === 'none') delete x.mo;
      else x.mo = parseMo({ k, d: (x.mo && x.mo.d) || sideFrom(pg, x), dl: x.mo && x.mo.dl, du: x.mo && x.mo.k === k ? x.mo.du : null });
    }
  });
  sideUI(); ribbonUI();
  if (k !== 'none') tasteMotion(list.map(x => x.id));
}
/* what was just given motion plays once, the rest of the page as it ends */
function tasteMotion(ids) {
  const pg = page(), sc = newSched(), now = performance.now() + 120;
  schedSet(sc, pg, null);
  let end = now;
  for (const id of ids) { const it = findItem(id); if (it && it.mo) { sc.it.set(pg.id + '/' + id, now); end = Math.max(end, now + moDur(it) * 1000); } }
  PREVIEW = { pg: pg.id, sc, end: end + 350 };
  LASTF = ''; previewUI(); tickSoon();
}
/* the chosen panel's camera: a window of the moves, which way it goes, and how much */
function camPop(anchor) {
  const pid = targetPanel();
  if (!pid) return;
  const pan = () => page().pan[pid], cur = (pan() && pan().cam) || null;
  const pick = (k, d, s) => {
    edit(() => { const x = panOf(pid); if (!k) delete x.cam; else x.cam = parseCam({ k, d, s }); });
    closePopover(); sideUI(); ribbonUI();
    if (k) { const pg = page(), sc = newSched(), now = performance.now() + 100; schedSet(sc, pg, null); sc.cam.set(pg.id + '/' + pid, now); PREVIEW = { pg: pg.id, sc, end: now + CAM_S * 1000 + 200 }; LASTF = ''; previewUI(); tickSoon(); }
  };
  const kinds = h('div', { class: 'cm-cams' }, Object.entries(CAMS).map(([k, m]) => h('button', { class: 'rb big' + (cur && cur.k === k ? ' on' : ''), type: 'button', title: T(CAM_TIPS[k]), onclick: () => pick(k, cur && cur.d, cur && cur.s) }, icon(m.ic), h('span', { text: T(m.n) }))),
    h('button', { class: 'rb big' + (!cur ? ' on' : ''), type: 'button', title: T('בלי מצלמה שזזה'), onclick: () => pick(null) }, icon('block'), h('span', { text: T('בלי@none') })));
  const dirs = h('div', { class: 'cm-btns' }, Object.entries(TOWARD).map(([d, n]) => h('button', { class: 'btn small' + (cur && cur.k === 'pan' && cur.d === d ? ' primary' : ''), type: 'button', onclick: () => pick('pan', d, cur && cur.s) }, T(n))));
  const amt = h('input', { type: 'range', min: '0.05', max: '0.5', step: '0.01', value: String(cur ? cur.s : 0.15), 'aria-label': T('חוזק') });
  amt.addEventListener('change', () => { const c2 = pan() && pan().cam; pick(c2 ? c2.k : 'in', c2 && c2.d, +amt.value); });
  openPop(anchor, h('div', { class: 'cm-pop' }, h('div', { class: 'pop-t', text: T('המצלמה במשבצת {0}', geom(page()).panels.findIndex(p => p.id === pid) + 1) }), kinds,
    h('div', { class: 'cm-h4', text: T('תזוזה לאן') }), dirs, h('label', { class: 'cm-f' }, h('span', { text: T('חוזק') }), amt),
    h('p', { class: 'muted small', text: T('המצלמה זזה בזמן הקריאה, בתוך המסגרת של המשבצת. גם בסרטון.') })));
}
/* the side's motion part for a thing, and its camera part for a panel */
function motionRows(it) {
  const set = fn => v => { const x = findItem(it.id); if (x) fn(x, v); };
  const kinds = Object.entries(MOTIONS).filter(([k]) => k !== 'type' || it.t === 'bub').map(([k, m]) => [k, T(m.n)]), m = it.mo;
  return [h('h5', { text: T('בזמן הקריאה') }),
    choose(T('איך נכנס'), [['', T('בלי@none')], ...kinds], m ? m.k : '', set((x, v) => { if (MOTIONS[v]) x.mo = parseMo({ k: v, d: (x.mo && x.mo.d) || sideFrom(page(), x), dl: x.mo && x.mo.dl }); else delete x.mo; })),
    m && MOTIONS[m.k].dir ? choose(T('מאיפה'), Object.entries(FROM).map(([d, n]) => [d, T(n)]), m.d, set((x, v) => { if (x.mo) x.mo.d = v; })) : null,
    m ? slider(T('השהיה@delay'), m.dl || 0, 0, 5, 0.1, v => T('{0} שניות', (Math.round(v * 10) / 10).toLocaleString(LOCALE)), set((x, v) => { if (!x.mo) return; if (v > 0) x.mo.dl = r1(v); else delete x.mo.dl; })) : null,
    m && m.k !== 'type' ? slider(T('משך'), moDur(it), 0.1, 4, 0.05, v => T('{0} שניות', (Math.round(v * 10) / 10).toLocaleString(LOCALE)), set((x, v) => { if (x.mo) x.mo.du = r1(v); })) : null,
    m ? h('div', { class: 'cm-btns' }, h('button', { class: 'btn small', type: 'button', onclick: () => tasteMotion([it.id]) }, icon('play_arrow'), T('ניגון'))) : null];
}
function camRows(pid) {
  const pan = page().pan[pid] || {}, cam = pan.cam, art = pan.art;
  return [h('h5', { text: T('בזמן הקריאה') }),
    choose(T('מצלמה'), [['', T('בלי@none')], ...Object.entries(CAMS).map(([k, m]) => [k, T(m.n)])], cam ? cam.k : '', v => { const x = panOf(pid); if (CAMS[v]) x.cam = parseCam({ k: v, d: x.cam && x.cam.d, s: x.cam && x.cam.s }); else delete x.cam; }),
    cam && cam.k === 'pan' ? choose(T('לאן'), Object.entries(TOWARD).map(([d, n]) => [d, T(n)]), cam.d, v => { const x = panOf(pid); if (x.cam) x.cam.d = v; }) : null,
    cam ? slider(T('חוזק'), cam.s, 0.05, 0.5, 0.01, pct, v => { const x = panOf(pid); if (x.cam) x.cam.s = Math.round(v * 100) / 100; }) : null,
    h('div', { class: 'cm-btns' }, h('button', { class: 'btn small', type: 'button', title: T('אנימציה בתוך המשבצת: מציירים כמה פריימים, והמשבצת זזה בלולאה'), onclick: () => drawPanel(pid, 'dwanim') }, icon('animation'), moves(art) ? T('הפריימים של המשבצת') : T('משבצת שזזה'))),
    moves(art) ? h('p', { class: 'muted small', text: T('המשבצת זזה: יש בה ציור של כמה פריימים. ב-PDF, בתמונות ובהדפסה רואים את הפריים הראשון.') }) : null];
}

/* =========================================================
   the comic read by itself, for a video or a page's GIF: shots one after another, each a page ('page'), or a panel
   with the page moved and zoomed onto it ('panel'); or the pages one under another, scrolled down and stopping at each
   panel ('scroll'). Each shot waits as long as its words take to read (pace: faster or slower)
   ========================================================= */
const FILM_TR = 0.7, FILM_MOVE = 0.6, DARK = '#0d0f14';
const lettersIn = (pg, g, pid) => pg.its.filter(it => (it.t === 'bub' || it.t === 'sfx') && (!pid || panelOf(pg, g, it) === pid)).reduce((n, it) => n + Array.from(it.txt.trim()).length, 0);
const holdFor = (letters, pace) => clamp(0.9 + letters / (14 * pace), letters ? 1.4 : 1.1, 9);
function film({ way, W, H, pace = 1, pages, gif }) {
  const sc = newSched(), list = pages.map(i => C.pages[i]).filter(Boolean), shots = [];
  let t = 0;
  if (way === 'scroll') {
    // the column: the pages one under another (a webtoon's parts touching), as wide as the frame allows
    const gap = isWt(C) ? 0 : Math.round(C.w * 0.05), tops = [];
    let y = 0;
    for (const pg of list) { tops.push(y); y += pgH(pg) + gap; }
    const total = y - gap, s = Math.min(W / C.w, H / (C.w * 0.9)), viewH = H / s, maxY = Math.max(0, total - viewH), keys = [{ t: 0, y: 0 }];
    list.forEach((pg, n) => {
      const g = geom(pg);
      for (const p of readerPanels(pg)) {
        const to = clamp(tops[n] + p.box.y + p.box.h / 2 - viewH / 2, 0, maxY), last = keys[keys.length - 1];
        const move = Math.abs(to - last.y) < 2 ? 0 : clamp(Math.abs(to - last.y) / (viewH * 1.2), 0.5, 1.4);
        t += move;
        keys.push({ t, y: to });
        const end = schedPanel(sc, pg, p.id, (t - 0.25) * 1000) / 1000;
        t = Math.max(t, end) + holdFor(lettersIn(pg, g, p.id), pace) * 0.8 + (pg.pan[p.id] && pg.pan[p.id].cam ? 1.2 : 0);
        keys.push({ t, y: to });
      }
    });
    t += 0.8; keys.push({ t, y: maxY });
    return { way, W, H, sc, list, tops, s, x: (W - C.w * s) / 2, keys, dur: t + 0.5 };
  }
  list.forEach((pg, n) => {
    const g = geom(pg), ps = readerPanels(pg), cams = Object.values(pg.pan).some(x => x.cam);
    if (way === 'page') {
      const tr = n ? FILM_TR : gif ? 0 : 0.4, end = schedPage(sc, pg, (t + tr + 0.15) * 1000) / 1000;
      const len = Math.max(end - t, tr + 0.4) + holdFor(lettersIn(pg, g, null), pace) * 0.6 + (cams ? 1.5 : 0);
      shots.push({ pg, at: t, tr, len, view: gif ? { s: W / C.w, x: 0, y: 0 } : viewFor(pg, 0, W, H, 'page'), P: null });   // a GIF is the page itself, edge to edge
      t += len;
    } else ps.forEach((p, k) => {
      const tr = k ? FILM_MOVE : n ? FILM_TR : 0.4, sp = panelScript(pg, p.id, g);
      schedPanel(sc, pg, p.id, (t + tr) * 1000);
      const len = tr + sp.end + Math.max(holdFor(lettersIn(pg, g, p.id), pace), pg.pan[p.id] && pg.pan[p.id].cam ? 2.6 : 0);
      shots.push({ pg, at: t, tr, len, view: viewFor(pg, k, W, H, 'panel'), P: p.P });
      t += len;
    });
  });
  return { way, W, H, sc, shots, dur: t + 0.4 };
}
const lerpView = (a, b, e) => ({ s: a.s + (b.s - a.s) * e, x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
/* one frame of the film at t seconds, on cx (F.W x F.H) */
async function filmDraw(F, cx, t) {
  const ms = t * 1000, W = F.W, H = F.H;
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.imageSmoothingQuality = 'high';
  cx.fillStyle = DARK; cx.fillRect(0, 0, W, H);
  const page1 = async (pg, v, P, a = 1) => {
    await prepare(pg);
    const Hp = pgH(pg);
    cx.save();
    cx.globalAlpha = a;
    cx.translate(v.x, v.y); cx.scale(v.s, v.s);
    cx.beginPath(); cx.rect(0, 0, C.w, Hp); cx.clip();
    drawPage(cx, pg, { t: ms, mo: moFn(F.sc, pg, ms), cam: camFn(F.sc, pg, ms) });
    if (P) { const d = new Path2D(); d.rect(0, 0, C.w, Hp); d.addPath(polyPath(P)); cx.fillStyle = 'rgba(13,15,20,.93)'; cx.fill(d, 'evenodd'); }
    cx.restore();
  };
  if (F.way === 'scroll') {
    let i = 0;
    while (i < F.keys.length - 2 && F.keys[i + 1].t <= t) i++;
    const a = F.keys[i], b = F.keys[i + 1] || a, y = b.t > a.t ? a.y + (b.y - a.y) * easeIO((t - a.t) / (b.t - a.t)) : b.y;
    for (let n = 0; n < F.list.length; n++) {
      const pg = F.list[n], top = (F.tops[n] - y) * F.s;
      if (top > H || top + pgH(pg) * F.s < 0) continue;
      await page1(pg, { s: F.s, x: F.x, y: top }, null);
    }
    return;
  }
  let i = 0;
  while (i < F.shots.length - 1 && F.shots[i + 1].at <= t) i++;
  const s = F.shots[i], prev = F.shots[i - 1], local = t - s.at;
  if (!prev || local >= s.tr) { await page1(s.pg, s.view, s.P, prev || s.tr <= 0 ? 1 : clamp(local / s.tr, 0, 1)); return; }
  const e = easeIO(local / s.tr);
  if (prev.pg === s.pg) { await page1(s.pg, lerpView(prev.view, s.view, e), s.P); return; }   // the camera moves on to the next panel
  // one page gives way to the next, as in the reader
  const rtl = C.dir === 'rtl', tr = C.tr;
  if (tr === 'none') { await page1(s.pg, s.view, s.P); return; }
  if (tr === 'fade') { await page1(prev.pg, prev.view, prev.P, 1 - e); await page1(s.pg, s.view, s.P, e); return; }
  if (tr === 'zoom') {
    const at = (v, k) => ({ s: v.s * k, x: W / 2 - (W / 2 - v.x) * k, y: H / 2 - (H / 2 - v.y) * k });
    await page1(prev.pg, at(prev.view, 1 + 0.16 * e), prev.P, 1 - e); await page1(s.pg, at(s.view, 0.86 + 0.14 * e), s.P, e);
    return;
  }
  if (tr === 'turn') {
    // the old page folds over its spine (squeezed toward it, darker as it turns), the new one under it
    await page1(s.pg, s.view, s.P);
    const v = prev.view, spine = rtl ? v.x + C.w * v.s : v.x, k = Math.cos(e * Math.PI / 2);
    cx.save(); cx.translate(spine, 0); cx.scale(Math.max(0.001, k), 1); cx.translate(-spine, 0);
    await page1(prev.pg, v, prev.P);
    cx.fillStyle = `rgba(0,0,0,${0.45 * e})`; cx.fillRect(v.x, v.y, C.w * v.s, pgH(prev.pg) * v.s);
    cx.restore();
    return;
  }
  const from = rtl ? -W : W;   // pushed: the next page comes in from the side it is read toward
  await page1(prev.pg, { ...prev.view, x: prev.view.x - from * e }, prev.P);
  await page1(s.pg, { ...s.view, x: s.view.x + from * (1 - e) }, s.P);
}
/* the frames of a film, the way draw.js makes GIFs and videos of a drawing's frames */
function filmSource(F, fps, bg) {
  const n = Math.max(2, Math.ceil(F.dur * fps));
  return { w: F.W, h: F.H, bg, fps, loop: 'loop', f: 0, frames: Array.from({ length: n }, () => ({ d: 1 })), done() {}, async draw(cx, i) { await filmDraw(F, cx, i / fps); } };
}
const SHAPES = { wide: [1920, 1080], tall: [1080, 1920], square: [1080, 1080] };
function videoDialog() {
  if (!C) return;
  flush();
  const vk = isWt(C) ? 'wvid' : 'vid', p0 = cprefs()[vk] && typeof cprefs()[vk] === 'object' ? cprefs()[vk] : {};   // a webtoon remembers its own way
  let way = ['panel', 'page', 'scroll'].includes(p0.way) ? p0.way : isWt(C) ? 'scroll' : 'panel', all = true;
  const shape = h('select', { class: 'sel', 'aria-label': T('צורה') }, [['wide', T('רחב (16:9), ליוטיוב')], ['tall', T('לאורך (9:16), לטלפון ולשורטס')], ['square', T('ריבוע')]].map(([v, n]) => h('option', { value: v, text: n })));
  shape.value = SHAPES[p0.shape] ? p0.shape : isWt(C) ? 'tall' : 'wide';
  const pace = h('select', { class: 'sel', 'aria-label': T('קצב') }, [[0.7, T('לאט')], [1, T('רגיל')], [1.5, T('מהר')]].map(([v, n]) => h('option', { value: v, text: n })));
  pace.value = String([0.7, 1, 1.5].includes(+p0.pace) ? +p0.pace : 1);
  const seg = h('div', { class: 'seg', role: 'tablist' }), which = h('div', { class: 'seg', role: 'tablist' }), info = h('p', { class: 'muted small' });
  const opts = () => ({ way, shape: shape.value, pace: +pace.value, pages: all ? C.pages.map((_, i) => i) : [C.p] });
  const draw = () => {
    seg.textContent = ''; which.textContent = '';
    for (const [k, ic, label] of [['panel', 'view_carousel', T('משבצת אחרי משבצת')], ['page', 'description', T('דף שלם')], ['scroll', 'view_agenda', T('גלילה')]]) seg.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(way === k), onclick: () => { way = k; draw(); } }, icon(ic), label));
    for (const [k, label] of [[true, T('כל הקומיקס')], [false, T('הדף הזה')]]) which.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(all === k), onclick: () => { all = k; draw(); } }, label));
    const o = opts(), [W, H] = SHAPES[o.shape], F = film({ way: o.way, W, H, pace: o.pace, pages: o.pages });
    info.textContent = T('בערך {0} שניות. הסרטון מתנגן לבד: המצלמה עוברת בסדר הקריאה, וכל מה שזז זז.', Math.round(F.dur).toLocaleString(LOCALE));
  };
  shape.addEventListener('change', draw); pace.addEventListener('change', draw);
  draw();
  modal({ title: T('הקומיקס כסרטון'), body: h('div', { class: 'cm-vid' }, seg, h('label', { class: 'fld' }, h('span', { text: T('צורה') }), shape), h('label', { class: 'fld' }, h('span', { text: T('קצב הקריאה') }), pace), which, info),
    actions: [{ label: T('שמירה'), kind: 'primary', icon: 'download', run: () => { const o = opts(); cprefs()[vk] = { way: o.way, shape: o.shape, pace: o.pace }; savePrefs(); saveFilm('video', o); } }, { label: T('ביטול'), value: false }] });
}
async function saveFilm(kind, o) {
  const c0 = C, name = safeName(displayTitle(LOADED.meta)), what = kind === 'gif' ? T('מכין את ה-GIF…') : T('מכין את הסרטון…');
  const t = toast(what, { icon: 'hourglass_top', ms: 900000 }), txt = t.querySelector('span:not(.ms)');
  const prog = p => { if (txt) txt.textContent = `${what} ${Math.round(p * 100)}%`; };
  try {
    let blob;
    if (kind === 'gif') {
      const pg = c0.pages[c0.p], k = Math.min(1, 720 / Math.max(c0.w, pgH(pg))), W = Math.round(c0.w * k), H = Math.round(pgH(pg) * k);
      const F = film({ way: 'page', W, H, pace: 1, pages: [c0.p], gif: true });
      // a page whose only motion is its drawings with frames: one round of the longest of them (at most 10 seconds)
      if (!pg.its.some(it => it.mo) && !Object.values(pg.pan).some(x => x.cam)) {
        await prepare(pg);
        let ms = 0;
        for (const art of movingArts(pg)) { const e = ART.get(art); if (e && e.an) ms = Math.max(ms, window.INK_DRAW.cycleMs(e.an.frames, e.an.fps, e.an.loop)); }
        F.dur = clamp(ms / 1000, 1, 10);
      }
      F.shots.forEach(s => { s.P = null; });
      blob = await window.INK_DRAW.encode.gif(filmSource(F, 12, pg.bg), { k: 1, max: 0, prog });
    } else {
      const [W, H] = SHAPES[o.shape] || SHAPES.wide, F = film({ way: o.way, W, H, pace: o.pace, pages: o.pages });
      blob = await window.INK_DRAW.encode.video(filmSource(F, 30, DARK), { k: 1, prog });
    }
    t.remove();
    if (C !== c0) return;
    await offerFile(`${name}.${kind === 'gif' ? 'gif' : /mp4/.test(blob.type) ? 'mp4' : 'webm'}`, blob);
  } catch (e) {
    console.error(e); t.remove();
    toast(e && e.message === 'lib' ? T('לא הצלחתי לטעון את כלי השמירה. כדאי לבדוק את החיבור לאינטרנט.') : e && e.message === 'video' ? T('הדפדפן הזה לא יודע ליצור סרטונים. אפשר לשמור כ-GIF.') : T('לא הצלחתי להכין את הקובץ. כדאי לנסות שוב.'), { ms: 7000 });
  }
}
function saveGif() {
  if (!C) return;
  flush();
  const pg = page();
  if (!pageMoves(pg)) { toast(T('בדף הזה שום דבר לא זז. אפשר לתת תנועה לבלונים ולדמויות, או לצייר משבצת שזזה.'), { icon: 'info', ms: 6000 }); return; }
  saveFilm('gif');
}

/* =========================================================
   drawing in a panel, or a character's look: the drawing's own view takes the window (#drawView, with the drawing's
   tabs). A panel's drawing is the page's size and seen only inside the panel, with the rest of the page around it; a
   look is the character's own size, with nothing around it. Frames (the drawing's "אנימציה" tab) make it move.
   Everything drawn there is one step here when it is done
   ========================================================= */
const emptyArt = b => !b || !b.includes('data:image/');
const drawTab = () => ['dwfx', 'dwanim'].includes(PREFS.wtab) ? PREFS.wtab : 'dwhome';
/* the drawing's view with this host on it; d: what is needed to finish (DRAWING) */
async function startDraw(host, d, tab, failMsg) {
  const K = window.INK_DRAW;
  DRAWING = { ...d, pre: snap(), host };
  $('#app').classList.add('cdraw');
  selectTab(tab || drawTab());
  const ok = await K.embed(host).catch(e => { console.error(e); return false; });
  if (DRAWING && DRAWING.host === host) {
    if (!ok) { endDraw(); toast(failMsg); return; }
    selectTab(tab || drawTab());
  }
}
async function drawPanel(pid, tab) {
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
  const before = (pg.pan[pid] && pg.pan[pid].art) || '', H = pgH(pg);
  // a webtoon's part that grew since the panel was drawn: its drawing grows too (and never shrinks, so nothing drawn is lost)
  const hd = before ? artHead(before) : null, dw = hd ? Math.max(hd.w, C.w) : C.w, dh = hd ? Math.max(hd.h, H) : H;
  const under = newCanvas(dw, dh), over = newCanvas(dw, dh);
  drawPage(under.getContext('2d'), pg, { skip: pid, layer: 'under' });
  drawPage(over.getContext('2d'), pg, { skip: pid, layer: 'over' });
  const pan = () => { if (!C || LOADED !== cur) return null; const g0 = C.pages.find(q => q.id === pgId); return g0 ? g0.pan[pid] || (g0.pan[pid] = { bg: '#ffffff', art: '', nt: '' }) : null; };
  const host = {
    body: before || K.blank(C.w, H, ''), under, over, clip: p.P.map(q => [r1(q.x), r1(q.y)]), focus: pad(p.box, 0.04),
    onBody: b => { if (S.cur !== cur) return; const x = pan(); if (x) { x.art = b; markDirty(); } },
    dirty: () => { if (S.cur === cur && !cur.isSample) setSave('dirty'); },
    done: () => endDraw(),
    ...(hd && (hd.w !== dw || hd.h !== dh) ? { w: dw, h: dh } : {}),
  };
  await startDraw(host, { pid, pgId, before }, tab, T('לא הצלחתי לפתוח את המשבצת לציור'));
  busy.remove();
}
/* a faint outline to draw a new character over, where its head and body could be (it is not part of the drawing) */
function lookGuide(ch) {
  const c = newCanvas(ch.w, ch.h), x = c.getContext('2d');
  x.globalAlpha = 0.3; x.translate(ch.w / 2, ch.h / 2);
  standIn(x, { w: ch.w * 0.8, h: ch.h * 0.94 }, null);
  return c;
}
/* a character's look, drawn with everything a drawing has; every place it stands changes with it */
async function drawLook(cid, lkid, tab) {
  if (!C || DRAWING || !LOADED) return;
  const K = window.INK_DRAW, ch = castOf(cid), lk = ch && ch.lk.find(l => l.id === lkid);
  if (!lk || !K || !K.embed) return;
  commitText(); endAct(true); liveEnd();
  const cur = LOADED, busy = toast(T('פותח את הדמות לציור…'), { icon: 'brush', ms: 30000 });
  const look = () => { if (!C || LOADED !== cur) return null; const x = castOf(cid); return x && x.lk.find(l => l.id === lkid); };
  const host = {
    body: lk.art || K.blank(ch.w, ch.h, ''), under: lk.art ? null : lookGuide(ch), over: null, clip: null, focus: null,
    onBody: b => { if (S.cur !== cur) return; const x = look(); if (x) { x.art = b; markDirty(); } },
    dirty: () => { if (S.cur === cur && !cur.isSample) setSave('dirty'); },
    done: () => endDraw(),
  };
  await startDraw(host, { cid, lkid, before: lk.art, sel: SEL && { ...SEL }, pgId: page().id }, tab, T('לא הצלחתי לפתוח את הדמות לציור'));
  busy.remove();
  if (DRAWING && DRAWING.host === host && !lk.art) toast(T('מציירים את {0} על רקע שקוף. כשמסיימים, הדמות מופיעה בכל מקום שהיא נמצאת בו.', ch.n), { icon: 'brush', ms: 6000 });
}
function endDraw() {
  const d = DRAWING;
  if (!d) return;
  DRAWING = null;
  const out = window.INK_DRAW.unembed();
  freeCanvas(d.host.under); freeCanvas(d.host.over);
  $('#app').classList.remove('cdraw');
  if (!C || !LOADED || S.cur !== LOADED) return;
  const g0 = C.pages.find(q => q.id === d.pgId);
  if (d.cid) {
    const ch = castOf(d.cid), lk = ch && ch.lk.find(l => l.id === d.lkid);
    if (lk && out != null) lk.art = emptyArt(out) ? '' : out;
    if (lk && (lk.art || '') !== (d.before || '')) { push(d.pre); changed(); lookThumb(d.cid, d.lkid); }
    SEL = d.sel && (d.sel.k !== 'item' || (g0 && g0.its.some(it => it.id === d.sel.id))) ? d.sel : null;
  } else {
    const x = g0 && g0.pan[d.pid];
    if (x && out != null) x.art = emptyArt(out) ? '' : out;
    if (x && (x.art || '') !== d.before) { push(d.pre); changed(); }
    SEL = { k: 'panel', id: d.pid };
  }
  selectTab(COMIC_TABS.includes(PREFS.ctab) ? PREFS.ctab : 'cmhome');
  if (g0) C.p = C.pages.indexOf(g0);
  stripUI(); sideUI(); ribbonUI(); castUI(); stat();
  requestAnimationFrame(() => { if (NEED_FIT) fit(); else paint(); });
}

/* =========================================================
   reading: the whole window. "דף שלם": a page at a time (swiped, clicked or with the arrows); "משבצת אחרי משבצת": the
   page moves and zooms from one panel to the next in the order they are read (good on a phone); "גלילה": the pages one
   under another, scrolled (a webtoon's own way: its parts meet with nothing between them). Things with motion come in
   when their panel is read, the cameras move, drawings with frames play, and pages turn the comic's way (C.tr)
   ========================================================= */
let READ = null;
function readerPanels(pg) { return geom(pg).panels.filter(p => p.P); }
const pageName = pg => (isWt(C) ? T('קטע {0}', C.pages.indexOf(pg) + 1) : T('דף {0}', C.pages.indexOf(pg) + 1));
/* a page where nothing moves, as one picture (made once; the pages around the one read are made ahead) */
async function pageUrl(pg) {
  const R = READ;
  if (!R) return '';
  if (R.urls.has(pg.id)) return R.urls.get(pg.id);
  const job = (async () => {
    const k = Math.min(1, 2600 / Math.max(C.w, pgH(pg))), c = await pageCanvas(pg, k);
    const b = await toBlob(c, 'image/jpeg', 0.92);
    freeCanvas(c);
    return URL.createObjectURL(b);
  })();
  R.urls.set(pg.id, job);
  const url = await job;
  if (READ !== R) { URL.revokeObjectURL(url); return ''; }
  R.urls.set(pg.id, url);
  // only the pages near the one being read stay (while scrolling, the column lets go of its far pages itself)
  if (R.mode !== 'scroll') {
    const near = new Set([R.i - 1, R.i, R.i + 1].map(j => C.pages[j] && C.pages[j].id));
    for (const [id, u] of R.urls) if (!near.has(id) && typeof u === 'string') { URL.revokeObjectURL(u); R.urls.delete(id); }
  }
  return url;
}
/* the schedule of what comes in: when (performance.now ms) each thing with motion starts, and each panel's camera */
const newSched = () => ({ it: new Map(), cam: new Map() });
function schedPanel(sc, pg, pid, at) {
  const sp = panelScript(pg, pid);
  for (const { it, s } of sp.list) sc.it.set(pg.id + '/' + it.id, at + s * 1000);
  sc.cam.set(pg.id + '/' + pid, at);
  return at + sp.end * 1000;
}
function schedPage(sc, pg, at) { for (const p of readerPanels(pg)) at = schedPanel(sc, pg, p.id, at) + 120; return at; }
/* a panel's things already in their places (read before, or hurried by a click), or (clear) waiting again */
function schedSet(sc, pg, pid, clear) {
  const g = geom(pg);
  for (const it of pg.its) if (it.mo && (!pid || panelOf(pg, g, it) === pid)) { if (clear) sc.it.delete(pg.id + '/' + it.id); else sc.it.set(pg.id + '/' + it.id, -1e12); }
  for (const p of g.panels) if (!pid || p.id === pid) { if (clear) sc.cam.delete(pg.id + '/' + p.id); else sc.cam.set(pg.id + '/' + p.id, -1e12); }
}
const moFn = (sc, pg, now) => it => { if (!it.mo) return null; const s = sc.it.get(pg.id + '/' + it.id); return s == null ? { hide: true } : moAt(it, (now - s) / (moDur(it) * 1000)); };
const camFn = (sc, pg, now) => (p, cam) => { const s = sc.cam.get(pg.id + '/' + p.id); return camAt(cam, s == null ? 0 : clamp((now - s) / (CAM_S * 1000), 0, 1), p.box); };
const schedBusy = (sc, pg, now) => pg.its.some(it => { if (!it.mo) return false; const s = sc.it.get(pg.id + '/' + it.id); return s != null && now < s + moDur(it) * 1000; })
  || Object.entries(pg.pan).some(([pid, x]) => { if (!x.cam) return false; const s = sc.cam.get(pg.id + '/' + pid); return s != null && now < s + CAM_S * 1000; });
const movingArts = pg => { const out = []; for (const x of Object.values(pg.pan)) if (moves(x.art)) out.push(x.art); for (const it of pg.its) if (it.t === 'chr' && moves(lookArt(it))) out.push(lookArt(it)); return out; };
function openReader(at = C ? C.p : 0) {
  if (!C || READ) return;
  commitText(); endAct(true); liveEnd(); stopPreview();
  const p0 = cprefs(), rtl = C.dir === 'rtl', MODES = ['page', 'panel', 'scroll'];
  const want = isWt(C) ? p0.wmode : p0.rmode, mode = MODES.includes(want) ? want : isWt(C) ? 'scroll' : isNarrow() ? 'panel' : 'page';
  const ov = h('div', { class: 'cm-read', tabindex: '-1', role: 'dialog', 'aria-modal': 'true', 'aria-label': T('קריאה') });
  const R = READ = { ov, i: clamp(at, 0, C.pages.length - 1), k: 0, mode, urls: new Map(), cur: null, idle: 0, sc: newSched(), live: new Set(), ver: 0, t0: performance.now(), raf: 0 };
  R.st = h('div', { class: 'cm-rst' });
  R.num = h('span', { class: 'cm-rn' });
  const modeBtn = (m, ic, label) => h('button', { type: 'button', 'data-m': m, title: label, onclick: () => setMode(m) }, icon(ic), h('span', { text: label }));
  R.modes = [modeBtn('page', 'description', T('דף שלם')), modeBtn('panel', 'view_carousel', T('משבצת אחרי משבצת')), modeBtn('scroll', 'view_agenda', T('גלילה'))];
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
  ov.addEventListener('wheel', e => {
    if (R.mode === 'scroll') return;   // the column scrolls by itself
    e.preventDefault();
    if (R.wheelT && performance.now() - R.wheelT < 450) return;
    if (Math.abs(e.deltaY) + Math.abs(e.deltaX) < 8) return;
    R.wheelT = performance.now(); readGo((e.deltaY || e.deltaX) > 0 ? 1 : -1);
  }, { passive: false });
  R.onResize = () => { place(false); scrollTick(); };
  addEventListener('resize', R.onResize);
  enter(R.i);
  barSoon();
  R.raf = requestAnimationFrame(readFrame);
}
/* the reading's first view in its mode, from page i */
function enter(i) {
  const R = READ;
  for (const n of R.live) if (n.cv) freeCanvas(n.cv);
  R.live.clear();
  R.st.textContent = ''; R.cur = null; R.scEl = null; R.items = null;
  R.sc = newSched(); R.ver++;
  R.ov.classList.toggle('scroll', R.mode === 'scroll');
  if (R.mode === 'scroll') scrollUI(i); else show(i, 0, 0);
  modeUI();
}
function closeReader() {
  const R = READ;
  if (!R) return;
  READ = null;
  cancelAnimationFrame(R.raf);
  removeEventListener('resize', R.onResize);
  if (document.fullscreenElement === R.ov) document.exitFullscreen().catch(() => {});
  R.ov.remove();
  for (const n of R.live) if (n.cv) freeCanvas(n.cv);
  for (const u of R.urls.values()) if (typeof u === 'string') URL.revokeObjectURL(u);
  if (C && LOADED && S.cur === LOADED && R.i !== C.p) goPage(R.i);
}
function setMode(m) {
  const R = READ;
  if (!R || R.mode === m) return;
  R.mode = m; R.k = 0;
  cprefs()[isWt(C) ? 'wmode' : 'rmode'] = m; savePrefs();
  enter(R.i);
}
function modeUI() {
  const R = READ;
  for (const b of R.modes) b.classList.toggle('on', b.dataset.m === R.mode);
  const of = isWt(C) ? T('קטע {0} מתוך {1}', R.i + 1, C.pages.length) : T('דף {0} מתוך {1}', R.i + 1, C.pages.length);
  R.num.textContent = R.mode === 'panel' && R.cur ? `${of} · ${T('משבצת {0}', R.k + 1)}` : of;
}
/* about 30 times a second: the pages on screen where something moves are drawn again (only while something does) */
function readFrame() {
  const R = READ;
  if (!R) return;
  R.raf = requestAnimationFrame(readFrame);
  const now = performance.now();
  if (now - (R.last || 0) < 30) return;
  R.last = now;
  if (R.mode === 'scroll') scrollMotion(now);
  for (const n of R.live) liveDraw(n, now);
}
function liveDraw(n, now) {
  const R = READ;
  if (n.ver === R.ver && !movingArts(n.pg).length && !schedBusy(R.sc, n.pg, now) && !n.missing) return;
  n.ver = R.ver; n.missing = false;
  const c = n.cv, cx = c.getContext('2d');
  cx.setTransform(c.width / C.w, 0, 0, c.height / n.H, 0, 0);
  cx.imageSmoothingQuality = 'high';
  drawPage(cx, n.pg, { t: now - R.t0, mo: moFn(R.sc, n.pg, now), cam: camFn(R.sc, n.pg, now), missing: () => { n.missing = true; } });
}
/* the page's place on the screen: all of it, or zoomed onto one panel */
function viewFor(pg, k, vw = innerWidth, vh = innerHeight, mode = READ.mode) {
  const H = pgH(pg), fitK = Math.min(vw / C.w, vh / H) * (mode === 'panel' ? 1 : 0.97);
  if (mode !== 'panel') return { s: fitK, x: (vw - C.w * fitK) / 2, y: (vh - H * fitK) / 2 };
  const p = readerPanels(pg)[k];
  if (!p) return { s: fitK, x: (vw - C.w * fitK) / 2, y: (vh - H * fitK) / 2 };
  const b = pad(p.box, 0.03), s = Math.min(vw * 0.96 / b.w, vh * 0.9 / b.h, fitK * 6);
  return { s, x: vw / 2 - (b.x + b.w / 2) * s, y: vh / 2 - (b.y + b.h / 2) * s };
}
/* a page's element: its picture (or, where something moves, a canvas drawn again and again), and over it the dark
   around the panel being read */
function pageEl(pg) {
  const R = READ, H = pgH(pg), wrap = h('div', { class: 'cm-rw', style: { width: C.w + 'px', height: H + 'px' } });
  const n = { pg, H, wrap, img: null, cv: null };
  if (pageMoves(pg)) {
    const k = Math.min(1, 2600 / Math.max(C.w, H));
    n.cv = newCanvas(C.w * k, H * k);
    wrap.append(n.cv);
    R.live.add(n);
    prepare(pg).then(() => { n.missing = true; }).catch(() => {});
  } else {
    n.img = h('img', { alt: pageName(pg), draggable: 'false' });
    wrap.append(n.img);
    pageUrl(pg).then(u => { if (u) n.img.src = u; });
  }
  wrap.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${C.w} ${H}" aria-hidden="true"><path fill="#0d0f14" fill-opacity=".93" fill-rule="evenodd" d=""/></svg>`);
  n.mask = wrap.querySelector('path');
  n.el = h('div', { class: 'cm-rpg' }, wrap);
  return n;
}
function dropEl(n) {
  if (!n) return;
  n.el.remove();
  if (READ) READ.live.delete(n);
  if (n.cv) freeCanvas(n.cv);
}
function place(anim) {
  const R = READ;
  if (!R || !R.cur || R.mode === 'scroll') return;
  const pg = R.cur.pg, v = viewFor(pg, R.k), p = R.mode === 'panel' && readerPanels(pg)[R.k];
  R.cur.wrap.classList.toggle('anim', !!anim);
  R.cur.wrap.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.s})`;
  R.cur.mask.setAttribute('d', p ? `M0 0H${C.w}V${R.cur.H}H0Z` + 'M' + p.P.map(q => `${r1(q.x)} ${r1(q.y)}`).join('L') + 'Z' : '');
  R.cur.wrap.querySelector('svg').style.opacity = p ? '1' : '0';
  modeUI();
}
/* page i on screen (panel k), coming from the side the reading goes to (dir 1 forward, -1 back, 0 just there) */
function show(i, k, dir) {
  const R = READ, pg = C.pages[i], old = R.cur, n = pageEl(pg);
  R.i = i; R.k = k; R.cur = n;
  R.st.append(n.el);
  place(false);
  const at = performance.now() + (old && dir ? 450 : 200);
  if (R.mode === 'page') { if (dir < 0) schedSet(R.sc, pg, null); else schedPage(R.sc, pg, at); }
  else arrive(pg, k, at, dir < 0);
  R.ver++;
  turnPages(old, n, dir);
  for (const j of [i + 1, i - 1]) if (C.pages[j] && !pageMoves(C.pages[j])) pageUrl(C.pages[j]);
}
/* reading reaches panel k of a page: the panels before it are as they end, its own things come in, the ones after wait */
function arrive(pg, k, at, back) {
  const R = READ, ps = readerPanels(pg);
  ps.forEach((p, j) => { if (j < k || (back && j === k)) schedSet(R.sc, pg, p.id); else if (j > k) schedSet(R.sc, pg, p.id, true); });
  if (!back && ps[k]) schedPanel(R.sc, pg, ps[k].id, at);
  R.ver++;
}
/* one page gives way to the next: pushed aside, faded, turned like a book's page, or zoomed */
function turnPages(old, n, dir) {
  if (!old) return;
  const tr = C.tr;
  if (!dir || tr === 'none' || !n.el.animate) { dropEl(old); return; }
  const rtl = C.dir === 'rtl', fwd = dir > 0, vw = innerWidth, E = 'cubic-bezier(.22,.7,.2,1)', gone = () => dropEl(old);
  if (tr === 'fade') {
    n.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, easing: 'ease-out' });
    old.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, easing: 'ease-out', fill: 'forwards' }).onfinish = gone;
  } else if (tr === 'zoom') {
    n.el.animate([{ opacity: 0, transform: `scale(${fwd ? 0.86 : 1.16})` }, { opacity: 1, transform: 'none' }], { duration: 480, easing: E });
    old.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `scale(${fwd ? 1.16 : 0.86})` }], { duration: 480, easing: E, fill: 'forwards' }).onfinish = gone;
  } else if (tr === 'turn') {
    // like a book's page: forward, the old page lifts from the side it is read toward and turns over its spine; back,
    // the page before turns back over it. The page that turns is on top
    const top = fwd ? old : n, r = top.wrap.getBoundingClientRect(), spine = rtl ? r.right : r.left, deg = rtl ? 90 : -90;
    top.el.style.zIndex = '2';
    top.el.style.transformOrigin = `${spine}px 50%`;
    const kf = [{ transform: 'perspective(2200px) rotateY(0deg)', filter: 'brightness(1)' }, { transform: `perspective(2200px) rotateY(${deg}deg)`, filter: 'brightness(.55)' }];
    const a = top.el.animate(fwd ? kf : kf.slice().reverse(), { duration: 650, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' });
    a.onfinish = () => { top.el.style.zIndex = ''; top.el.style.transformOrigin = ''; a.cancel(); gone(); };
  } else {
    const from = fwd === rtl ? -vw : vw;
    n.el.animate([{ transform: `translateX(${from}px)` }, { transform: 'none' }], { duration: 380, easing: E });
    old.el.animate([{ transform: 'none' }, { transform: `translateX(${-from}px)`, opacity: 0.4 }], { duration: 380, easing: E, fill: 'forwards' }).onfinish = gone;
  }
}
function readGo(step) {
  const R = READ;
  if (!R) return;
  if (R.mode === 'scroll') { if (R.scEl) R.scEl.scrollBy({ top: step * R.scEl.clientHeight * 0.85, behavior: 'smooth' }); return; }
  if (!R.cur) return;
  const now = performance.now(), ps = readerPanels(R.cur.pg);
  // a press while things are still coming in puts them in their places first
  if (step > 0 && schedBusy(R.sc, R.cur.pg, now)) { schedSet(R.sc, R.cur.pg, R.mode === 'panel' && ps[R.k] ? ps[R.k].id : null); R.ver++; return; }
  if (R.mode === 'panel' && R.k + step >= 0 && R.k + step < ps.length) { R.k += step; arrive(R.cur.pg, R.k, now + 480, step < 0); place(true); return; }
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
/* --- scrolling: the pages in one column, each one's picture there only while it is near the window --- */
function scrollUI(i) {
  const R = READ, col = h('div', { class: 'cm-rcol' });
  R.scEl = h('div', { class: 'cm-rsc' + (isWt(C) ? ' wt' : '') }, col);
  R.items = C.pages.map((pg, j) => { const box = h('div', { class: 'cm-rsp', role: 'img', 'aria-label': pageName(pg), style: { aspectRatio: `${C.w} / ${pgH(pg)}` } }); col.append(box); return { box, pg, j, n: null }; });
  col.append(h('div', { class: 'cm-rsend', text: T('זה הסוף') }));
  R.st.append(R.scEl);
  R.scEl.addEventListener('scroll', () => scrollTick(), { passive: true });
  requestAnimationFrame(() => { if (READ !== R || !R.scEl) return; R.scEl.scrollTop = i > 0 && R.items[i] ? R.items[i].box.offsetTop - 56 : 0; scrollTick(); });
}
function scrollEl(x) {
  const R = READ, pg = x.pg, H = pgH(pg), n = { pg, H, box: x.box, img: null, cv: null };
  if (pageMoves(pg)) {
    const W = Math.round(Math.min(C.w, Math.max(320, x.box.clientWidth * Math.min(2, devicePixelRatio || 1))));
    n.cv = newCanvas(W, W * H / C.w); n.cv.className = 'cm-rsimg';
    x.box.append(n.cv);
    R.live.add(n);
    prepare(pg).then(() => { n.missing = true; }).catch(() => {});
  } else {
    n.img = h('img', { class: 'cm-rsimg', alt: '', draggable: 'false' });
    x.box.append(n.img);
    pageUrl(pg).then(u => { if (u && n.img) n.img.src = u; });
  }
  return n;
}
function scrollDrop(x) {
  const R = READ, n = x.n;
  x.n = null;
  if (!n) return;
  if (n.cv) { R.live.delete(n); n.cv.remove(); freeCanvas(n.cv); }
  if (n.img) { n.img.remove(); n.img = null; const u = R.urls.get(n.pg.id); if (typeof u === 'string') URL.revokeObjectURL(u); R.urls.delete(n.pg.id); }
}
function scrollTick() {
  const R = READ;
  if (!R || R.mode !== 'scroll' || !R.items) return;
  const top = R.scEl.scrollTop, vh = R.scEl.clientHeight;
  let cur = R.i;
  for (const x of R.items) {
    const t = x.box.offsetTop, hh = x.box.offsetHeight, near = t + hh > top - vh * 1.5 && t < top + vh * 2.5;
    if (near && !x.n) x.n = scrollEl(x);
    else if (!near && x.n) scrollDrop(x);
    if (t <= top + vh / 2 && t + hh > top + vh / 2) cur = x.j;
  }
  if (cur !== R.i) { R.i = cur; modeUI(); }
}
/* a panel coming up into the window starts its motion, once a third of it is past 85% of the window's height */
function scrollMotion(now) {
  const R = READ;
  if (!R.items) return;
  const top = R.scEl.scrollTop, vh = R.scEl.clientHeight;
  for (const x of R.items) {
    if (!x.n || !x.n.cv) continue;
    const t = x.box.offsetTop, k = x.box.offsetHeight / pgH(x.pg);
    for (const p of readerPanels(x.pg)) {
      if (R.sc.cam.has(x.pg.id + '/' + p.id)) continue;
      if (t + (p.box.y + p.box.h * 0.33) * k < top + vh * 0.85) { schedPanel(R.sc, x.pg, p.id, now + 80); R.ver++; }
    }
  }
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
  if (k === 'Home') { e.preventDefault(); if (R.mode === 'scroll') R.scEl.scrollTo({ top: 0, behavior: 'smooth' }); else if (R.i) show(0, 0, -1); return; }
  if (k === 'End') { e.preventDefault(); if (R.mode === 'scroll') R.scEl.scrollTo({ top: R.scEl.scrollHeight, behavior: 'smooth' }); else if (R.i < C.pages.length - 1) show(C.pages.length - 1, 0, 1); return; }
  if (k === 'f' || k === 'F') { e.preventDefault(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else R.ov.requestFullscreen && R.ov.requestFullscreen().catch(() => {}); }
}
/* a finger: swiping goes to the next page or panel (to the right for a comic read from right to left), a tap at a
   side goes that way, a tap in the middle shows or hides the bar. While scrolling, the column takes the finger */
function readDown(e) {
  const R = READ;
  if (!R || e.target.closest('.cm-rbar,.cm-rnav') || e.button > 0) return;
  R.sw = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
  if (R.mode !== 'scroll') try { R.ov.setPointerCapture(e.pointerId); } catch {}
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
  const tap = Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 500, hideBar = () => { clearTimeout(R.idle); R.bar.classList.add('off'); for (const b of R.navs) b.classList.add('off'); };
  if (R.mode === 'scroll') { if (tap) { if (R.bar.classList.contains('off')) barSoon(); else hideBar(); } return; }
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) { readGo((dx > 0) === rtl ? 1 : -1); return; }
  if (tap) {
    const third = innerWidth / 3;
    if (e.clientX < third) readGo(rtl ? 1 : -1);
    else if (e.clientX > 2 * third) readGo(rtl ? -1 : 1);
    else if (R.mode === 'panel') readGo(1);
    else if (R.bar.classList.contains('off')) barSoon();
    else hideBar();
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
  for (const [k, label] of [['cmhome', T('קומיקס')], ['cmcast', T('דמויות')], ['cmfx', T('אפקטים')], ['cmmotion', T('תנועה')], ['cmpage', T('דף')]]) tabs.append(h('button', { class: 'tab comic-only', role: 'tab', 'data-tab': k, 'aria-selected': 'false' }, label));
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
  $('#stPage').textContent = isWt(C) ? T('קטע {0} מתוך {1}', C.p + 1, C.pages.length) : T('דף {0} מתוך {1}', C.p + 1, C.pages.length);
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
  cmCastNew: () => castNew(), cmCast: () => castDialog(), cmCastAdd: a => addChar(a), cmCastImport: () => importCast(),
  cmLook: (a, b) => lookPop(b), cmFlip: () => flipChar(), cmCastDraw: () => { const it = selItem(); if (it && it.t === 'chr') drawLook(it.c, it.lk); },
  cmMo: a => setMotion(a), cmCam: (a, b) => camPop(b), cmAnim: () => { const p = targetPanel(); if (p) drawPanel(p, 'dwanim'); },
  cmPlay: () => { const p = cprefs(); p.play = !playOn(); savePrefs(); ribbonUI(); LASTF = ''; paint(); },
  cmAuto: () => { edit(() => autoMotion(C)); sideUI(); ribbonUI(); toast(T('לכל הבלונים, מילות הצליל, הדמויות והאפקטים יש עכשיו תנועה. "תצוגה מקדימה" מראה אותה.'), { icon: 'auto_awesome', ms: 6000 }); },
  cmAutoClear: () => { if (!motionAny(C)) return; edit(() => autoMotion(C, true)); sideUI(); ribbonUI(); },
  cmPreview: () => { if (PREVIEW) stopPreview(); else playPreview(); }, cmVideo: () => videoDialog(), cmGif: () => saveGif(),
};

/* =========================================================
   opening and closing a comic
   ========================================================= */
function reset() {
  if (DRAWING) endDraw();
  closeReader();
  PREVIEW = null; LASTF = '';
  if (TICK) { cancelAnimationFrame(TICK); TICK = 0; }
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
  const c0 = C, W = c0.w * 72 / c0.dpi, Hof = pg => pgH(pg, c0) * 72 / c0.dpi, H0 = Hof(c0.pages[0]), o = W > H0 ? 'landscape' : 'portrait';
  const doc = new J({ orientation: o, unit: 'pt', format: [W, H0], compress: true });
  for (let i = 0; i < c0.pages.length; i++) {
    if (C !== c0) throw new Error('closed');
    const cv = await pageCanvas(c0.pages[i], 1), H = Hof(c0.pages[i]);   // a webtoon's part: a page as tall as it is
    if (i) doc.addPage([W, H], W > H ? 'landscape' : 'portrait');
    doc.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, H);
    freeCanvas(cv);
  }
  return doc.output('blob');
}
function pngDialog() {
  if (!C) return;
  flush();
  let all = isWt(C) ? 'wt' : false;
  const seg = h('div', { class: 'seg', role: 'tablist' }), note = h('p', { class: 'muted small' });
  const draw = () => {
    seg.textContent = '';
    for (const [k, ic, label] of [...(isWt(C) ? [['wt', 'view_agenda', T('לוובטון')]] : []), [false, 'image', isWt(C) ? T('הקטע הזה') : T('הדף הזה')], [true, 'photo_library', isWt(C) ? T('כל הקטעים') : T('כל הדפים')]]) seg.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(all === k), onclick: () => { all = k; draw(); } }, icon(ic), label));
    note.textContent = all === 'wt' ? T('כל הוובטון, חתוך לתמונות ברוחב 800 פיקסלים ובגובה של עד 1280, לפי הסדר: כמו שאתרי וובטון מבקשים להעלות.') : T('כל דף נשמר כתמונת PNG בגודל המלא שלו. כמה דפים נשמרים יחד בקובץ ZIP.');
  };
  draw();
  modal({ title: T('שמירה כתמונות'), body: h('div', {}, seg, note),
    actions: [{ label: T('שמירה'), kind: 'primary', icon: 'download', run: () => { if (all === 'wt') saveSlices(); else savePngs(all); } }, { label: T('ביטול'), value: false }] });
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
/* a webtoon for the sites that show them: the whole strip, 800 pixels wide, cut every 1280 pixels (their size for each
   picture), in a ZIP. The parts are drawn one at a time, so even a long one needs little memory */
async function saveSlices() {
  const c0 = C, name = safeName(displayTitle(LOADED.meta)), what = T('מכין את התמונות…'), OUT_W = 800, OUT_H = 1280, k = OUT_W / c0.w;
  const t = toast(what, { icon: 'hourglass_top', ms: 900000 }), txt = t.querySelector('span:not(.ms)');
  try {
    const total = c0.pages.reduce((s, pg) => s + Math.max(1, Math.round(pgH(pg, c0) * k)), 0), files = [];   // as tall as the parts' pictures will be
    let slice = newCanvas(OUT_W, Math.min(OUT_H, total)), sx = slice.getContext('2d'), filled = 0, done = 0;
    const out = async () => { files.push(await toBlob(slice)); freeCanvas(slice); const left = total - done; if (left > 0) { slice = newCanvas(OUT_W, Math.min(OUT_H, left)); sx = slice.getContext('2d'); } filled = 0; };
    for (const [i, pg] of c0.pages.entries()) {
      if (C !== c0) throw new Error('closed');
      const cv = await pageCanvas(pg, k);
      let y = 0;
      while (y < cv.height) {
        const n = Math.min(cv.height - y, slice.height - filled);
        sx.drawImage(cv, 0, y, cv.width, n, 0, filled, OUT_W, n);
        y += n; filled += n; done += n;
        if (filled >= slice.height) await out();
      }
      freeCanvas(cv);
      if (txt) txt.textContent = `${what} ${Math.round((i + 1) / c0.pages.length * 100)}%`;
    }
    if (filled > 0) await out();
    await loadScript(LIB.pptx);   // JSZip comes with it
    const z = new window.JSZip(), num = i => String(i + 1).padStart(String(files.length).length, '0');
    files.forEach((b, i) => z.file(`${name} ${num(i)}.png`, b));
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
  const rule = $('#pageRule'), before = rule.textContent, k = Math.min(1, 2000 / Math.max(C.w, ...C.pages.map(pg => pgH(pg))));
  V.print.textContent = '';
  for (const pg of C.pages) {
    const cv = await pageCanvas(pg, k);
    V.print.append(h('img', { src: cv.toDataURL('image/jpeg', 0.92), alt: '' }));
    freeCanvas(cv);
  }
  rule.textContent = `@page{size:${(C.w / C.dpi).toFixed(3)}in ${(Math.max(...C.pages.map(pg => pgH(pg))) / C.dpi).toFixed(3)}in;margin:0}`;
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
      // a webtoon starts with its own way to cut a part, and the others with theirs
      sizes.append(h('button', { class: 'cm-size', type: 'button', role: 'radio', 'aria-checked': String(size === s.k), onclick: () => { const was = size === 'webtoon'; size = s.k; if ((size === 'webtoon') !== was) lay = was ? 'r212' : 'w2'; draw(); } },
        h('i', { style: { width: Math.round(s.w * k) + 'px', height: Math.round(s.h * k) + 'px' } }), h('b', { text: T(s.n) }), h('span', { text: T(s.d) })));
    }
    for (const [d, ic, n, sub] of [['rtl', 'format_textdirection_r_to_l', T('מימין לשמאל'), T('מנגה, וקומיקס בעברית')], ['ltr', 'format_textdirection_l_to_r', T('משמאל לימין'), T('קומיקס באנגלית')]])
      dirs.append(h('button', { class: 'cm-dirb', type: 'button', role: 'radio', 'aria-checked': String(dir === d), onclick: () => { dir = d; draw(); } }, icon(ic), h('b', { text: n }), h('span', { text: sub })));
    const sz = SIZES.find(s => s.k === size);
    const g = layoutGalleryFor(k => { lay = k; draw(); }, lay, dir, sz.w, sz.h, size === 'webtoon');
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
function layoutGalleryFor(pick, cur, dir, w, hh, wt) {
  const box = h('div', { class: 'cm-gal', role: 'listbox', 'aria-label': T('חלוקה') });
  // a webtoon's own ways first; other comics don't get them (they repeat the grid's first ones)
  for (const [g, name] of [...(wt ? [['webtoon', T('וובטון')]] : []), ['grid', T('רשת')], ['rows', T('שורות')], ['manga', T('מנגה, באלכסון')]]) {
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
  if (pg.height != null && !(+pg.height >= MIN_SEG && +pg.height <= MAX_SIDE)) throw new Error(`Page ${n}: "height" is from ${MIN_SEG} to ${MAX_SIDE} pixels (only a webtoon's parts have a height of their own).`);
  panels.forEach((p, j) => {
    if (!p || typeof p !== 'object') throw new Error(`Page ${n}, panel ${j + 1}: give an object.`);
    for (const b of Array.isArray(p.bubbles) ? p.bubbles : []) {
      if (!b || !kindOf(b.kind)) throw new Error(`Page ${n}, panel ${j + 1}: there is no bubble kind "${b && b.kind}". The kinds: speech, thought, shout, whisper, narration.`);
      if (typeof b.text !== 'string' || !b.text.trim()) throw new Error(`Page ${n}, panel ${j + 1}: a bubble without text.`);
      if (b.character != null && typeof b.character !== 'string') throw new Error(`Page ${n}, panel ${j + 1}: a bubble's "character" is the name of the one saying it.`);
    }
    if (p.characters != null && (!Array.isArray(p.characters) || p.characters.some(x => typeof x !== 'string' || !x.trim()))) throw new Error(`Page ${n}, panel ${j + 1}: "characters" is a list of the names of the characters in the panel.`);
    if (p.effect != null && !EFFECTS.includes(p.effect)) throw new Error(`Page ${n}, panel ${j + 1}: there is no effect "${p.effect}". The effects: speed, focus, tone.`);
  });
}
/* about how big a bubble must be for its words at the usual size: the words take about half of its box */
function bubbleSize(txt, fs, maxW, maxH) {
  const n = Math.max(6, Array.from(txt).length), A = n * fs * 0.6 * fs * 1.25 / 0.36;
  let w = Math.sqrt(A * 1.6), hh = A / w;
  if (w > maxW) { w = maxW; hh = A / w; }
  return { w, h: Math.min(hh, maxH) };
}
/* what Claude wrote for a panel, put in it: narration at the top on the side it is read from, then what is said,
   one under another and side to side, each tail toward the lower part where the characters will be drawn */
/* a character Claude named that the comic doesn't have yet: it joins the cast, not drawn */
function aiCast(name) {
  const ch = castByName(name);
  if (ch || C.cast.length >= MAX_CAST) return ch;
  const n = newCast(String(name).trim());
  C.cast.push(n);
  return n;
}
function fillPanel(pg, p, spec) {
  const u = unit(), b = p.box, rtl = C.dir === 'rtl', d = DEF.bub(u);
  if (typeof spec.note === 'string' && spec.note.trim()) pg.pan[p.id] = { bg: '#ffffff', art: '', ...(pg.pan[p.id] || {}), nt: spec.note.trim().slice(0, 3000) };
  // the characters in it first, standing on its bottom, so what they say can point at them
  const at = {};
  for (const nm of (Array.isArray(spec.characters) ? spec.characters : []).slice(0, 5)) { const ch = aiCast(nm); if (ch && !at[ch.id]) at[ch.id] = pg.its.find(it => it.t === 'chr' && it.c === ch.id && it.pn === p.id) || placeChar(pg, p, ch); }
  const mine = pg.its.filter(it => it.t === 'bub' && b.x <= center(it).x && center(it).x <= b.x + b.w && b.y <= center(it).y && center(it).y <= b.y + b.h);
  let y = mine.length ? Math.max(...mine.map(it => it.y + it.h)) + 12 * u : b.y + 14 * u, side = mine.length, prev = null;
  const taken = mine.map(it => ({ x: it.x, y: it.y, w: it.w, h: it.h })), said = [];
  const bubs = (Array.isArray(spec.bubbles) ? spec.bubbles : []).map(x => ({ k: kindOf(x.kind), txt: String(x.text).trim().slice(0, 2000), ch: x.character != null && kindOf(x.kind) !== 'box' ? aiCast(x.character) : null }));
  for (const s of [...bubs.filter(x => x.k === 'box'), ...bubs.filter(x => x.k !== 'box')]) {
    const box = s.k === 'box', sz = bubbleSize(s.txt, d.fs * (box ? 0.8 : 1), b.w * (box ? 0.7 : 0.62), b.h * 0.42);
    const w = clamp(sz.w, (box ? 180 : 230) * u, b.w * 0.92), hh = clamp(sz.h, (box ? 70 : 140) * u, b.h * 0.6), first = side % 2 === 0, by = s.ch && at[s.ch.id];
    let x, y0 = y;
    if (box) x = rtl ? b.x + b.w - w - 10 * u : b.x + 10 * u;
    else if (by) {
      // over the one saying it, as high as it can be while it is still read after the bubble before it
      x = clamp(center(by).x - w / 2, b.x + b.w * 0.04, b.x + b.w * 0.96 - w);
      y0 = b.y + 14 * u;
      if (prev) { const after = rtl ? x + w / 2 < prev.x + prev.w / 2 : x + w / 2 > prev.x + prev.w / 2; y0 = Math.max(y0, after ? prev.y : prev.y + prev.h * 0.6); }
      for (let n = 0; n < 12; n++) { const hit = taken.find(r => r.x < x + w + 6 * u && x < r.x + r.w + 6 * u && r.y < y0 + hh + 6 * u && y0 < r.y + r.h + 6 * u); if (!hit) break; y0 = hit.y + hit.h + 8 * u; }
    } else x = (rtl === first) ? b.x + b.w - w - b.w * 0.04 : b.x + b.w * 0.04;   // first on the side the panel is read from, then the other
    const fit = inside(p.P, { x, y: Math.max(b.y + 8 * u, Math.min(y0, b.y + b.h * 0.8 - hh)), w, h: hh }, 10 * u, b.y + b.h * 0.8 - hh), yy = fit.y;
    const mid = fit.x + fit.w / 2, tx = mid + (b.x + b.w / 2 - mid) * 0.35;
    const it = { id: rid('i'), t: 'bub', k: s.k, x: fit.x, y: yy, w: fit.w, h: hh, txt: s.txt, f: d.f, fs: Math.round(d.fs * (box ? 0.8 : 1)), b: s.k === 'shout', fc: d.fc, fill: box ? '#fff6cc' : d.fill, sc: d.sc, sw: d.sw, tl: !box,
      tx, ty: clamp(yy + hh + Math.max(70 * u, hh * 0.9), yy + hh + 30 * u, b.y + b.h * 0.85) };   // toward where the characters will be drawn, not too far
    if (s.ch) it.who = s.ch.id;
    pg.its.push(it); said.push(it);
    prev = { x: fit.x, y: yy, w: fit.w, h: hh };
    taken.push(prev);
    y = Math.max(y, yy + hh * (box ? 1 : 0.8) + 8 * u);
    if (!box) side++;
  }
  // a character with words over its head gets shorter where it stands, so its head is under them (never under 45% of the panel)
  for (const it of Object.values(at)) {
    const over = taken.filter(r => r.x < it.x + it.w * 0.8 && r.x + r.w > it.x + it.w * 0.2), bottom = it.y + it.h;
    if (!over.length) continue;
    const top = Math.max(...over.map(r => r.y + r.h)) + 16 * u;
    if (it.y >= top) continue;
    const nh = Math.max(b.h * 0.45, bottom - top), k = nh / it.h, cx0 = it.x + it.w / 2;
    Object.assign(it, { h: nh, w: it.w * k, x: cx0 - it.w * k / 2, y: bottom - nh });
  }
  for (const it of said) if (it.who) aimTail(it, pg);
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
  const panels = spec.panels, pg = newPage(C, preset(spec.layout || byCount(panels.length) || 'r212', C.dir));
  if (isWt(C) && spec.height != null) pg.h = Math.round(clamp(+spec.height, MIN_SEG, MAX_SIDE));
  const g = geom(pg);
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
  if (a.transition != null && !PAGE_TRANS[a.transition]) throw new Error(`There is no transition "${a.transition}". The transitions: ${Object.keys(PAGE_TRANS).join(', ')}.`);
  const chars = Array.isArray(a.characters) ? a.characters : [];
  if (chars.length > MAX_CAST) throw new Error(`At most ${MAX_CAST} characters.`);
  for (const x of chars) if (!x || typeof x.name !== 'string' || !x.name.trim()) throw new Error('Each character needs a "name".');
  const c = { v: 1, dir, size: sz.k, w: sz.w, h: sz.h, dpi: sz.dpi, p: 0, pages: [], tr: a.transition || 'push', cast: [] };
  const was = C;
  C = c;
  try {
    for (const x of chars) if (!castByName(x.name)) c.cast.push(newCast(x.name, typeof x.description === 'string' ? x.description : ''));
    for (const spec of pages.length ? pages : [{ panels: [{}, {}, {}, {}, {}] }]) c.pages.push(aiPage(spec));
    if (a.motion) autoMotion(c);
  } finally { C = was; }
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
  const who = (name, k2) => { const ch = castByName(name); if (!ch) throw new Error(`Change ${k2}: there is no character "${name}". The characters: ${C.cast.map(x => x.n).join(', ') || 'none yet (add_character adds one)'}.`); return ch; };
  if (a === 'add_character') {
    if (typeof op.name !== 'string' || !op.name.trim()) throw new Error(`Change ${k}: the character needs a "name".`);
    if (castByName(op.name)) throw new Error(`Change ${k}: there is already a character named "${op.name.trim()}".`);
    if (C.cast.length >= MAX_CAST) throw new Error(`Change ${k}: a comic has at most ${MAX_CAST} characters.`);
    C.cast.push(newCast(op.name, typeof op.description === 'string' ? op.description : ''));
    return `character "${op.name.trim()}" added`;
  }
  if (a === 'change_character') {
    const ch = who(op.character, k);
    if (typeof op.name === 'string' && op.name.trim()) { const o2 = castByName(op.name); if (o2 && o2 !== ch) throw new Error(`Change ${k}: there is already a character named "${op.name.trim()}".`); ch.n = op.name.trim().slice(0, 60); }
    if (typeof op.description === 'string') ch.ds = op.description.slice(0, 1000);
    return `changed character "${ch.n}"`;
  }
  if (a === 'delete_character') {
    const ch = who(op.character, k);
    C.cast = C.cast.filter(x => x !== ch);
    for (const pg of C.pages) { pg.its = pg.its.filter(it => !(it.t === 'chr' && it.c === ch.id)); for (const it of pg.its) if (it.who === ch.id) delete it.who; }
    return `deleted character "${ch.n}"`;
  }
  if (a === 'set_transition') {
    if (!PAGE_TRANS[op.transition]) throw new Error(`Change ${k}: there is no transition "${op.transition}". The transitions: ${Object.keys(PAGE_TRANS).join(', ')}.`);
    C.tr = op.transition;
    return `pages turn with ${op.transition}`;
  }
  if (a === 'auto_motion') { autoMotion(C, !!op.clear); return op.clear ? 'no motion anywhere' : 'motion on every bubble, sound and effect'; }
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
      if (op.character != null && op.character !== '') who(op.character, k);
      fillPanel(pg, panelAtN(pg, op.panel, k), { bubbles: [{ kind: op.kind, text: op.text, character: op.character || undefined }] });
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
    case 'place_character': {
      const ch = who(op.character, k), p = panelAtN(pg, op.panel, k), lk = op.look == null ? null : ch.lk[Math.round(+op.look) - 1];
      if (op.look != null && !lk) throw new Error(`Change ${k}: "${ch.n}" has ${ch.lk.length} look(s).`);
      return `placed "${ch.n}" (${placeChar(pg, p, ch, lk && lk.id).id}) on page ${i + 1}, panel ${op.panel}`;
    }
    case 'set_speaker': {
      const it = itemAt(pg, op.item, k);
      if (it.t !== 'bub' || it.k === 'box') throw new Error(`Change ${k}: "${op.item}" is not a bubble someone says.`);
      if (op.character == null || op.character === '') { delete it.who; return `${op.item} is said by nobody`; }
      const ch = who(op.character, k);
      it.who = ch.id; aimTail(it, pg);
      return `${op.item} is said by "${ch.n}"`;
    }
    case 'set_height': {
      if (!isWt(C)) throw new Error(`Change ${k}: only a webtoon's parts have a height of their own.`);
      if (!setPartH(pg, +op.height || 0, clone(pg))) throw new Error(`Change ${k}: at that height the panels of page ${i + 1} would be too small.`);
      return `page ${i + 1} is ${pg.h} pixels tall`;
    }
    case 'set_motion': {
      const it = itemAt(pg, op.item, k);
      if (op.motion == null || op.motion === 'none') { delete it.mo; return `${op.item} has no motion`; }
      if (!MOTIONS[op.motion]) throw new Error(`Change ${k}: there is no motion "${op.motion}". The motions: none, ${Object.keys(MOTIONS).join(', ')}.`);
      if (op.motion === 'type' && it.t !== 'bub') throw new Error(`Change ${k}: only a bubble's words type themselves.`);
      it.mo = parseMo({ k: op.motion, d: op.from, dl: op.delay, du: op.duration });
      return `${op.item} comes in with ${op.motion}`;
    }
    case 'set_camera': {
      const p = panelAtN(pg, op.panel, k), pan = pg.pan[p.id] || (pg.pan[p.id] = { bg: '#ffffff', art: '', nt: '' });
      if (op.camera == null || op.camera === 'none') { delete pan.cam; return `no camera move in page ${i + 1}, panel ${op.panel}`; }
      if (!CAMS[op.camera]) throw new Error(`Change ${k}: there is no camera move "${op.camera}". The moves: none, ${Object.keys(CAMS).join(', ')}.`);
      pan.cam = parseCam({ k: op.camera, d: op.toward, s: op.strength });
      return `camera ${op.camera} in page ${i + 1}, panel ${op.panel}`;
    }
  }
  throw new Error(`Change ${k}: there is no action "${a}". The actions: add_pages, delete_page, move_page, set_layout, set_height, set_note, add_bubble, add_sound, add_effect, set_text, delete_item, set_direction, add_character, change_character, delete_character, place_character, set_speaker, set_motion, set_camera, set_transition, auto_motion.`);
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
  const mo = x => x.mo ? { motion: x.mo.k } : {};
  return { direction: C.dir === 'rtl' ? 'right_to_left' : 'left_to_right', size: C.size, width: C.w, height: C.h, page_on_screen: C.p + 1,
    layouts: PRESET_KEYS.join(', '), transition: C.tr,
    characters: C.cast.map(x => ({ name: x.n, ...(x.ds ? { description: x.ds } : {}), drawn: x.lk.some(l => !!l.art), looks: x.lk.length })),
    pages: C.pages.map((pg, i) => {
      const g = geom(pg), where = it => it.pn || (g.panels.find(p => p.P && inPoly(p.P, center(it))) || {}).id;
      const words = list => list.filter(x => x.t === 'bub' || x.t === 'sfx').sort((a, b) => a.y - b.y).map(x => x.t === 'sfx' ? { id: x.id, sound: x.txt, ...mo(x) }
        : { id: x.id, kind: x.k === 'box' ? 'narration' : x.k, text: x.txt, ...(x.who && castOf(x.who) ? { character: castOf(x.who).n } : {}), ...mo(x) });
      const out = pg.its.filter(it => !where(it));
      return { page: i + 1, ...(isWt(C) ? { height: pgH(pg) } : {}), panels: g.panels.map((p, j) => {
        const pan = pg.pan[p.id] || {}, its = pg.its.filter(it => where(it) === p.id), pics = its.filter(x => x.t === 'img').length, fx = its.filter(x => EFFECTS.includes(x.t)), cs = its.filter(x => x.t === 'chr' && castOf(x.c));
        return { panel: j + 1, ...(pan.nt ? { note: pan.nt } : {}), drawn: !!pan.art, ...(pan.art && artHead(pan.art).anim ? { moving: true } : {}), ...(pics ? { pictures: pics } : {}),
          ...(cs.length ? { characters: cs.map(x => ({ id: x.id, name: castOf(x.c).n, ...mo(x) })) } : {}), words: words(its),
          ...(fx.length ? { effects: fx.map(x => ({ id: x.id, effect: x.t, ...mo(x) })) } : {}), ...(pan.cam ? { camera: pan.cam.k } : {}) };
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
