/* Floating Ink: spreadsheets, like Excel. This file loads only when a spreadsheet is opened or made
   (loadSheetKit in index.html), so documents and presentations never wait for it.
   A spreadsheet is a document in the same list, store, versions, trash and backup, whose meta.kind is
   'sheet' and whose body is JSON (README "גיליונות"):
   { v: 1, dir, active, sheets: [{ id, name, dir, cells: { A1: { v | e, f, x, st } }, cw, rh, hc, hr, cs, rs, ds,
     fr, fc, merges, af, gl, tab, dw, dh, ac, zoom }], names: [{ n, f, s, c }] }
   It works with the app's own helpers from index.html: h, T, toast, modal, openPop, markDirty, S, PREFS... */
(() => {
'use strict';

/* =========================================================
   cells and ranges. Rows and columns count from 0 here; A1 is row 0, column 0
   ========================================================= */
const MAXR = 1048576, MAXC = 16384;
const KEY = (r, c) => r * MAXC + c;
const kr = k => Math.floor(k / MAXC), kc = k => k % MAXC;
function colName(c) { let s = '', n = c + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - 1 - m) / 26; } return s; }
function colNum(s) { let n = 0; for (const ch of String(s).toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
const A1 = (r, c) => colName(c) + (r + 1);
function parseA1(s) {
  const m = /^\$?([A-Za-z]{1,3})\$?([1-9]\d{0,6})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const c = colNum(m[1]), r = +m[2] - 1;
  return c < MAXC && r < MAXR ? { r, c } : null;
}
const G4 = (ra, ca, rb, cb) => ({ r1: Math.min(ra, rb), c1: Math.min(ca, cb), r2: Math.max(ra, rb), c2: Math.max(ca, cb) });
/* 'B2', 'A1:C3', 'A:C' (whole columns) or '2:5' (whole rows) */
function parseRange(s) {
  const t = String(s ?? '').trim().replace(/\$/g, '');
  let m;
  if ((m = /^([A-Za-z]{1,3}\d{1,7})(?::([A-Za-z]{1,3}\d{1,7}))?$/.exec(t))) { const a = parseA1(m[1]), b = m[2] ? parseA1(m[2]) : a; return a && b ? G4(a.r, a.c, b.r, b.c) : null; }
  if ((m = /^([A-Za-z]{1,3}):([A-Za-z]{1,3})$/.exec(t))) { const a = colNum(m[1]), b = colNum(m[2]); return a < MAXC && b < MAXC ? G4(0, a, MAXR - 1, b) : null; }
  if ((m = /^(\d{1,7}):(\d{1,7})$/.exec(t))) { const a = +m[1] - 1, b = +m[2] - 1; return a >= 0 && b >= 0 && a < MAXR && b < MAXR ? G4(a, 0, b, MAXC - 1) : null; }
  return null;
}
const wholeCols = g => g.r1 === 0 && g.r2 === MAXR - 1, wholeRows = g => g.c1 === 0 && g.c2 === MAXC - 1;
function rangeA1(g) {
  if (wholeCols(g) && !wholeRows(g)) return colName(g.c1) + ':' + colName(g.c2);
  if (wholeRows(g) && !wholeCols(g)) return (g.r1 + 1) + ':' + (g.r2 + 1);
  const a = A1(g.r1, g.c1);
  return g.r1 === g.r2 && g.c1 === g.c2 ? a : a + ':' + A1(g.r2, g.c2);
}
const inG = (g, r, c) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2;
const meets = (a, b) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;
const sameG = (a, b) => !!a && !!b && a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2;

/* errors, the way Excel shows them */
class Err { constructor(c) { this.c = c; } }
const ERR = {};
for (const c of ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#SPILL!', '#CALC!']) ERR[c] = new Err(c);
const isErr = v => v instanceof Err;
const E_DIV = ERR['#DIV/0!'], E_VAL = ERR['#VALUE!'], E_REF = ERR['#REF!'], E_NAME = ERR['#NAME?'], E_NUM = ERR['#NUM!'], E_NA = ERR['#N/A'], E_SPILL = ERR['#SPILL!'], E_CALC = ERR['#CALC!'];

/* =========================================================
   the workbook. Cells are a Map by KEY(r, c), each { v, f?, x?, a?, st? }: v the value (for a formula, its last
   result), f the formula without its "=", x a formula this app can't compute (it keeps the value the file had),
   l a formula from an older Excel file (a range standing alone in it takes the cell in the formula's own row or
   column, as Excel always did, instead of spilling), st the look. A cell object is never changed in place once it is in a sheet (only a formula's result is
   written onto it), so undo can keep the old ones
   ========================================================= */
let WB = null;          // the open workbook
let WS = null;          // its sheet on screen
let LOADED = null;      // the S.cur that WB belongs to
const DEF_FONT = 'Arial', DEF_FS = 10, DEF_W = 100, DEF_H = 21;
const sid = () => { let s = ''; while (s.length < 8) s += Math.random().toString(36).slice(2); return s.slice(0, 8); };
function newSheet(name, dir) {
  return { id: sid(), name, dir, cells: new Map(), cw: new Map(), rh: new Map(), hc: new Set(), hr: new Set(), cs: new Map(), rs: new Map(), ds: null,
    fr: 0, fc: 0, merges: [], af: null, gl: true, tab: null, dw: DEF_W, dh: DEF_H, ac: { r: 0, c: 0 }, zoom: 100, charts: [], pics: [], tables: [], pivots: [], cf: [], dv: [] };
}
/* pictures: a sheet's pics say where each one sits (as a chart does: a cell, the distance from its corner, a size) and
   which image it shows (img); the images themselves are the workbook's (WB.imgs), each under a key made from its data,
   so one image is kept once, travels once in a room, and moving a picture moves only a few numbers. PNG, JPEG and GIF,
   which every Excel shows; anything else is turned into one of them when it comes in */
const IMG_RE = /^data:image\/(?:png|jpeg|gif);base64,[A-Za-z0-9+/]+=*$/, IMG_MAX = 6e6, IMG_KEY = /^i[0-9a-z]{1,20}$/;
const imgKey = d => 'i' + hash53(d);
const okImg = d => typeof d === 'string' && d.length <= IMG_MAX && IMG_RE.test(d);
function normPic(x) {
  if (!x || typeof x !== 'object' || typeof x.img !== 'string' || !IMG_KEY.test(x.img)) return null;
  const at = parseA1(x.at);
  if (!at) return null;
  const n = (v, lo, hi, d) => Number.isFinite(+v) ? clamp(Math.round(+v), lo, hi) : d;
  const pic = { id: typeof x.id === 'string' && /^[a-z0-9]{4,24}$/.test(x.id) ? x.id : sid(), img: x.img, at: { r: at.r, c: at.c, dx: n(x.dx, 0, 5000, 0), dy: n(x.dy, 0, 5000, 0) }, w: n(x.w, 8, 4000, 200), h: n(x.h, 8, 4000, 150) };
  if (typeof x.alt === 'string' && x.alt.trim()) pic.alt = x.alt.trim().slice(0, 1000);   // what a screen reader says for it
  return pic;
}
function picOut(x) {
  const o = { id: x.id, img: x.img, at: A1(x.at.r, x.at.c), w: x.w, h: x.h };
  if (x.at.dx) o.dx = x.at.dx;
  if (x.at.dy) o.dy = x.at.dy;
  if (x.alt) o.alt = x.alt;
  return o;
}
function normImgs(o) {
  const m = new Map();
  if (o && typeof o === 'object') for (const [k, d] of Object.entries(o)) if (IMG_KEY.test(k) && okImg(d)) m.set(k, d);
  return m;
}
/* only the images some picture shows */
function imgsOut(b) {
  const o = {};
  for (const sh of b.sheets) for (const x of sh.pics || []) { const d = b.imgs && b.imgs.get(x.img); if (d) o[x.img] = d; }
  return Object.keys(o).length ? { imgs: o } : {};
}
const sheetWord = n => T('גיליון{0}', n);
/* Excel's rules for a sheet's name: up to 31 letters, none of : \ / ? * [ ], no ' at either end */
const cleanName = n => String(n ?? '').replace(/[\x00-\x1f:\\/?*[\]]/g, '').replace(/^'+|'+$/g, '').trim().slice(0, 31);
function freeName(n, taken) {
  if (!taken.has(n.toLowerCase())) return n;
  for (let i = 2; ; i++) { const t = n.slice(0, 26) + ' (' + i + ')'; if (!taken.has(t.toLowerCase())) return t; }
}
const HEX = /^#[0-9a-f]{6}$/i, BORDER = /^[123][sdo=]#[0-9a-f]{6}$/i, BD_SIDES = ['bt', 'bb', 'bs', 'be'];
/* the look of a cell: b i u s (strike), wr (wrap), c (text color), bg (fill), fs (size, pt), ff (font), ha (l c r, the
   side on screen, as Excel keeps it), va (t m b), nf (Excel's number format code), and borders bt bb bs be: top,
   bottom, and the start and end sides (toward column A, and away from it; Excel's "left" and "right"). A border is
   width 1-3, s solid / d dashed / o dotted / = double, and its color */
function normStyle(x) {
  if (!x || typeof x !== 'object') return null;
  const s = {};
  for (const k of ['b', 'i', 'u', 's', 'wr']) if (x[k] === true) s[k] = true;
  for (const k of ['c', 'bg']) if (HEX.test(x[k])) s[k] = x[k].toLowerCase();
  if (+x.fs >= 6 && +x.fs <= 96) s.fs = Math.round(+x.fs * 2) / 2;
  if (typeof x.ff === 'string' && okFont(x.ff)) s.ff = x.ff;
  if (x.ha === 'l' || x.ha === 'c' || x.ha === 'r') s.ha = x.ha;
  if (x.va === 't' || x.va === 'm' || x.va === 'b') s.va = x.va;
  if (typeof x.nf === 'string' && x.nf && x.nf.length <= 200 && x.nf.toLowerCase() !== 'general') s.nf = x.nf;
  for (const k of ['bt', 'bb', 'bs', 'be']) if (BORDER.test(x[k])) s[k] = x[k].toLowerCase();
  return Object.keys(s).length ? s : null;
}
/* a link a cell may hold: a web address, an email, or # and a place in the workbook ('Sheet 2'!B7, a defined name).
   Anything else (javascript:, a file on the computer) is left out, also from a room or a file */
const linkOk = t => { t = typeof t === 'string' ? t.trim() : ''; return t.length <= 2083 && /^(?:https?:\/\/\S+|mailto:\S+|#\S.*)$/i.test(t) ? t : null; };
function normCell(x) {
  if (!x || typeof x !== 'object') return null;
  const c = {};
  if (typeof x.f === 'string' && x.f.trim()) c.f = x.f.slice(0, 8000);
  if (typeof x.e === 'string' && ERR[x.e]) c.v = ERR[x.e];
  else if (typeof x.v === 'number' && Number.isFinite(x.v)) c.v = x.v;
  else if (typeof x.v === 'string') c.v = x.v.slice(0, 32767);
  else if (typeof x.v === 'boolean') c.v = x.v;
  if (c.f && x.x === true) c.x = true;
  if (c.f && x.l === true) c.l = true;
  const st = normStyle(x.st); if (st) c.st = st;
  if (typeof x.n === 'string' && x.n.trim()) c.n = x.n.slice(0, 32767);   // a note on the cell
  const k = linkOk(x.k); if (k) c.k = k;   // a link
  return c.f || c.v !== undefined || c.st || c.n || c.k ? c : null;
}
function normSheet(x, dir, taken) {
  if (!x || typeof x !== 'object') return null;
  const s = newSheet('', x.dir === 'ltr' ? 'ltr' : x.dir === 'rtl' ? 'rtl' : dir);
  if (typeof x.id === 'string' && /^[a-z0-9]{4,24}$/.test(x.id)) s.id = x.id;
  s.name = freeName(cleanName(x.name) || sheetWord(taken.size + 1), taken);
  taken.add(s.name.toLowerCase());
  if (x.cells && typeof x.cells === 'object') for (const [a, v] of Object.entries(x.cells)) { const p = parseA1(a), c = p && normCell(v); if (c) s.cells.set(KEY(p.r, p.c), c); }
  const nums = (o, max, lo, hi) => { const m = new Map(); if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { const i = Math.round(+k), n = +v; if (i >= 0 && i < max && Number.isFinite(n)) m.set(i, clamp(Math.round(n), lo, hi)); } return m; };
  const ints = (a, max) => new Set((Array.isArray(a) ? a : []).map(v => Math.round(+v)).filter(i => i >= 0 && i < max));
  const looks = (o, max) => { const m = new Map(); if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { const i = Math.round(+k), st = normStyle(v); if (i >= 0 && i < max && st) m.set(i, st); } return m; };
  s.cw = nums(x.cw, MAXC, 2, 2000); s.rh = nums(x.rh, MAXR, 4, 800);
  s.hc = ints(x.hc, MAXC); s.hr = ints(x.hr, MAXR);
  s.cs = looks(x.cs, MAXC); s.rs = looks(x.rs, MAXR); s.ds = normStyle(x.ds);
  s.fr = clamp(Math.round(+x.fr || 0), 0, 200); s.fc = clamp(Math.round(+x.fc || 0), 0, 60);
  for (const m of Array.isArray(x.merges) ? x.merges : []) {
    const g = parseRange(m);
    if (g && (g.r1 !== g.r2 || g.c1 !== g.c2) && g.r2 - g.r1 < 5000 && g.c2 - g.c1 < 500 && !s.merges.some(o => meets(o, g))) s.merges.push(g);
  }
  if (x.af && typeof x.af === 'object') {
    const g = parseRange(x.af.ref);
    if (g && !wholeCols(g) && !wholeRows(g)) {
      const hide = {};
      if (x.af.hide && typeof x.af.hide === 'object') for (const [k, v] of Object.entries(x.af.hide)) { const c = Math.round(+k); if (c >= g.c1 && c <= g.c2 && Array.isArray(v)) hide[c] = v.filter(t => typeof t === 'string').slice(0, 20000); }
      s.af = { ...g, hide };
    }
  }
  s.gl = x.gl !== false;
  if (HEX.test(x.tab)) s.tab = x.tab.toLowerCase();
  if (+x.dw >= 10 && +x.dw <= 600) s.dw = Math.round(+x.dw);
  if (+x.dh >= 8 && +x.dh <= 200) s.dh = Math.round(+x.dh);
  const ac = parseA1(x.ac); if (ac) s.ac = ac;
  if (+x.zoom >= 25 && +x.zoom <= 400) s.zoom = Math.round(+x.zoom);
  s.charts = (Array.isArray(x.charts) ? x.charts : []).slice(0, 50).map(normSheetChart).filter(Boolean);
  s.pics = (Array.isArray(x.pics) ? x.pics : []).slice(0, 100).map(normPic).filter(Boolean);
  s.tables = [];
  for (const t of (Array.isArray(x.tables) ? x.tables : []).slice(0, 100).map(normTable)) if (t && !s.tables.some(o => meets(o.g, t.g))) s.tables.push(headsOf(s, t));
  if (!s.af) { const t = s.tables.find(y => y.fb && y.hr); if (t) s.af = { r1: t.g.r1, c1: t.g.c1, r2: t.g.r2 - t.tr, c2: t.g.c2, hide: {} }; }   // a table's filter buttons, when the sheet has no filter of its own
  s.pivots = (Array.isArray(x.pivots) ? x.pivots : []).slice(0, 50).map(normPivot).filter(Boolean);
  s.cf = (Array.isArray(x.cf) ? x.cf : []).slice(0, 500).map(normCf).filter(Boolean);
  s.dv = (Array.isArray(x.dv) ? x.dv : []).slice(0, DV_MAX).map(normDv).filter(Boolean);
  // in a shared room: the ids of its rows and columns (see the rooms, at the end)
  const ri = x.ri && unpackIds(x.ri, s.id + '/ri', RMAX), ci = x.ci && unpackIds(x.ci, s.id + '/ci', CMAX);
  if (ri) s.ri = ri;
  if (ci) s.ci = ci;
  return s;
}
/* a workbook from anywhere (storage, a version, a backup, a room, Claude) comes through here */
function normBook(j) {
  const o = j && typeof j === 'object' ? j : {};
  const dir = o.dir === 'ltr' || o.dir === 'rtl' ? o.dir : UI_DIR;
  const book = { v: 1, dir, active: 0, sheets: [] }, taken = new Set();
  for (const x of Array.isArray(o.sheets) ? o.sheets : []) { const s = normSheet(x, dir, taken); if (s) book.sheets.push(s); if (book.sheets.length >= 250) break; }
  if (!book.sheets.length) book.sheets.push(newSheet(sheetWord(1), dir));
  book.active = clamp(Math.round(+o.active || 0), 0, book.sheets.length - 1);
  book.names = normNames(o.names, book.sheets);
  book.imgs = normImgs(o.imgs);
  // a table's name is the workbook's, like a defined name's: one taken already gets a free one
  const tn = new Set((book.names || []).map(x => x.n.toLowerCase()));
  for (const sh of book.sheets) for (const t of sh.tables) { if (tn.has(t.name.toLowerCase())) t.name = freeTableName(t.name, tn); tn.add(t.name.toLowerCase()); }
  // a formula kept as the file had it, because it used what wasn't here then (INDIRECT, a name): worked out from now on,
  // the way a plain formula of an Excel file is
  for (const s of book.sheets) for (const c of s.cells.values()) if (c.x && !missingIn(c.f, s, book)) { delete c.x; if (olderWay(c.f)) c.l = true; }
  return book;
}
function parseBook(body) { let j = null; try { j = JSON.parse(body); } catch {} return normBook(j); }
function cellOut(c) {
  const j = {};
  if (c.f) j.f = c.f;
  if (isErr(c.v)) j.e = c.v.c; else if (c.v !== undefined && c.v !== null) j.v = c.v;
  if (c.x) j.x = true;
  if (c.l) j.l = true;
  if (c.st) j.st = c.st;
  if (c.n) j.n = c.n;
  if (c.k) j.k = c.k;
  return j;
}
function sheetOut(s) {
  const o = { id: s.id, name: s.name, dir: s.dir, cells: {} };
  for (const k of [...s.cells.keys()].sort((a, b) => a - b)) o.cells[A1(kr(k), kc(k))] = cellOut(s.cells.get(k));
  if (s.cw.size) o.cw = Object.fromEntries(s.cw);
  if (s.rh.size) o.rh = Object.fromEntries(s.rh);
  if (s.hc.size) o.hc = [...s.hc];
  if (s.hr.size) o.hr = [...s.hr];
  if (s.cs.size) o.cs = Object.fromEntries(s.cs);
  if (s.rs.size) o.rs = Object.fromEntries(s.rs);
  if (s.ds) o.ds = s.ds;
  if (s.fr) o.fr = s.fr;
  if (s.fc) o.fc = s.fc;
  if (s.merges.length) o.merges = s.merges.map(rangeA1);
  if (s.af) o.af = { ref: rangeA1(s.af), ...(Object.keys(s.af.hide).length ? { hide: s.af.hide } : {}) };
  if (!s.gl) o.gl = false;
  if (s.tab) o.tab = s.tab;
  if (s.dw !== DEF_W) o.dw = s.dw;
  if (s.dh !== DEF_H) o.dh = s.dh;
  const ac = s === WS && SEL ? SEL : s.ac;
  if (ac.r || ac.c) o.ac = A1(ac.r, ac.c);
  if (s.zoom !== 100) o.zoom = s.zoom;
  if (s.charts.length) o.charts = s.charts.map(chartOut);
  if (s.pics.length) o.pics = s.pics.map(picOut);
  if (s.tables.length) o.tables = s.tables.map(tableOut);
  if (s.pivots.length) o.pivots = s.pivots.map(pivotOut);
  if (s.cf.length) o.cf = s.cf.map(cfOut);
  if (s.dv.length) o.dv = s.dv.map(cfOut);
  if (s.ri && s.ri.length) o.ri = packIds(s.ri, s.id + '/ri');
  if (s.ci && s.ci.length) o.ci = packIds(s.ci, s.id + '/ci');
  return o;
}
const bookOut = b => ({ v: 1, dir: b.dir, active: b.sheets.includes(WS) ? b.sheets.indexOf(WS) : clamp(b.active | 0, 0, b.sheets.length - 1), sheets: b.sheets.map(sheetOut),
  ...(b.names && b.names.length ? { names: b.names.map(nameOut) } : {}), ...imgsOut(b) });

/* =========================================================
   numbers and dates the way this language writes them, and Excel's number formats
   ========================================================= */
const NBSP = String.fromCharCode(0xA0), NNBSP = String.fromCharCode(0x202F);
const NUMPARTS = new Intl.NumberFormat(LOCALE).formatToParts(12345.6);
const DEC = (NUMPARTS.find(p => p.type === 'decimal') || { value: '.' }).value;
const GRP = (NUMPARTS.find(p => p.type === 'group') || { value: ',' }).value;
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const GRP_CLASS = GRP === NBSP || GRP === NNBSP || GRP === ' ' ? '[ ' + NBSP + NNBSP + ']' : reEsc(GRP);
/* the order of day, month and year in this language's short dates: dmy, mdy or ymd */
const DORD = new Intl.DateTimeFormat(LOCALE).formatToParts(new Date(2026, 8, 29)).filter(p => /^(day|month|year)$/.test(p.type)).map(p => p.type[0]).join('');
const DATE_NF = { he: 'dd/mm/yyyy', en: 'm/d/yyyy', ar: 'dd/mm/yyyy', zh: 'yyyy/m/d', es: 'dd/mm/yyyy', fr: 'dd/mm/yyyy', pt: 'dd/mm/yyyy', ru: 'dd.mm.yyyy', de: 'dd.mm.yyyy' }[LANG] || 'dd/mm/yyyy';
const LDATE_NF = { he: 'd mmmm yyyy', en: 'mmmm d, yyyy', ar: 'd mmmm yyyy', zh: 'yyyy"年"m"月"d"日"', es: 'd "de" mmmm "de" yyyy', fr: 'd mmmm yyyy', pt: 'd "de" mmmm "de" yyyy', ru: 'd mmmm yyyy', de: 'd. mmmm yyyy' }[LANG] || 'd mmmm yyyy';
const TIME_NF = LANG === 'en' ? 'h:mm AM/PM' : 'hh:mm';
const CUR = { he: '₪', en: '$', ar: '$', zh: '¥', es: '€', fr: '€', pt: 'R$', ru: '₽', de: '€' }[LANG] || '₪';
const CURS = ['₪', '$', '€', '£', '¥', '₽', 'R$'];
/* the symbol before the number the way English writes $5, after it the way Hebrew and Europe write 5 ₪ and 5 € */
const curNf = (sym, dec = 2) => { const n = '#,##0' + (dec ? '.' + '0'.repeat(dec) : ''); return ['$', '£', '¥', 'R$'].includes(sym) ? `"${sym}"${n}` : `${n} "${sym}"`; };
const NUM_NF = '#,##0.00', PCT_NF = '0%';

const DAY = 86400000, EPOCH = Date.UTC(1899, 11, 30);
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/* Excel's day numbers, with its famous 29 February 1900 (day 60) that never was */
function toSerial(y, m, d, H = 0, M = 0, s = 0) {
  let n = Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY);
  if (n < 61) n--;
  return n + (H * 3600 + M * 60 + s) / 86400;
}
function fromSerial(v) {
  let days = Math.floor(v), secs = Math.round((v - days) * 86400000) / 1000;
  if (secs >= 86400) { days++; secs -= 86400; }
  let y, m, d, w;
  if (days === 60) { y = 1900; m = 2; d = 29; w = 3; }
  else { const t = new Date(EPOCH + (days < 60 ? days + 1 : days) * DAY); y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate(); w = t.getUTCDay(); }
  return { y, m, d, w, H: Math.floor(secs / 3600), M: Math.floor(secs % 3600 / 60), s: secs % 60 };
}
const jsDateSerial = dt => dt.getTime() / DAY + 25569;
const todaySerial = () => { const n = new Date(); return toSerial(n.getFullYear(), n.getMonth() + 1, n.getDate()); };
const names = (o, list) => list.map(d => new Intl.DateTimeFormat(LOCALE, { ...o, timeZone: 'UTC' }).format(d));
const MONTH_DAYS = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, i, 15)));
const WEEK_DAYS = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 8, 27 + i)));   // 27.9.2026 was a Sunday
const M_LONG = names({ month: 'long' }, MONTH_DAYS), M_SHORT = names({ month: 'short' }, MONTH_DAYS);
/* Russian says "29 сентября": the month's name as it stands next to a day */
const M_DAY = LANG === 'ru' ? MONTH_DAYS.map(d => { const p = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', timeZone: 'UTC' }).formatToParts(d).find(x => x.type === 'month'); return p ? p.value : ''; }) : M_LONG;
const D_LONG = names({ weekday: 'long' }, WEEK_DAYS), D_SHORT = names({ weekday: 'short' }, WEEK_DAYS);
const pad2 = n => String(n).padStart(2, '0');

/* what a person typed, as a number in this language (1,234.5 or 1.234,5), or null. A dot always works as the
   decimal point too, unless it is plainly a thousands mark (1.234 in German) */
function numText(t) {
  let s = String(t).trim(), neg = false;
  if (!s) return null;
  if (/^\(.+\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  if (s[0] === '-' || s[0] === '+') { if (s[0] === '-') neg = !neg; s = s.slice(1).trim(); }
  let grouped = false;
  if (new RegExp('^\\d{1,3}(' + GRP_CLASS + '\\d{3})+(' + reEsc(DEC) + '\\d*)?$').test(s)) { grouped = true; s = s.replace(new RegExp(GRP_CLASS, 'g'), ''); }
  if (DEC !== '.' && s.includes(DEC)) { if (s.includes('.')) return null; s = s.replace(DEC, '.'); }
  if (!/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const v = +s;
  if (!Number.isFinite(v)) return null;
  return { v: neg ? -v : v, grouped, dec: (s.split('.')[1] || '').replace(/e.*$/i, '').length };
}
/* a date, a time or both, in this language's order, or year-month-day */
function dateText(t) {
  const s = String(t).trim();
  let y, mo, d, H = 0, M = 0, sec = 0, hasD = false, hasT = false, rest = s, m;
  const tm = /(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(s);
  if (tm) {
    H = +tm[1]; M = +tm[2]; sec = tm[3] ? +tm[3] : 0;
    if (tm[4]) { if (H < 1 || H > 12) return null; H = H % 12 + (/^p/i.test(tm[4]) ? 12 : 0); }
    if (H > 23 || M > 59 || sec > 59) return null;
    hasT = true; rest = s.slice(0, tm.index).trim();
  }
  if (rest) {
    if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(rest))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{1,2})([-/.])(\d{1,2})(?:\2(\d{4}|\d{2}))?$/.exec(rest))) {
      const a = +m[1], b = +m[3];
      if (DORD === 'dmy') { d = a; mo = b; } else { mo = a; d = b; }
      y = m[4] ? +m[4] : new Date().getFullYear();
      if (m[4] && m[4].length === 2) y += y < 30 ? 2000 : 1900;
    } else return null;
    if (!(mo >= 1 && mo <= 12 && y >= 1900 && y <= 9999 && d >= 1 && d <= daysIn(y, mo))) return null;
    hasD = true;
  }
  if (!hasD && !hasT) return null;
  const tf = sec ? 'hh:mm:ss' : 'hh:mm';
  return { v: (hasD ? toSerial(y, mo, d) : 0) + (H * 3600 + M * 60 + sec) / 86400, nf: hasD && hasT ? DATE_NF + ' ' + tf : hasD ? DATE_NF : sec ? 'h:mm:ss' : TIME_NF };
}
/* what goes into a cell from the keyboard, a paste or a file: a formula, a number (with the format its
   writing implies: 1,234 5% ₪12 29/9/2026), TRUE/FALSE, an error, or text. ' before anything keeps it text.
   cellNf is the format the cell has already: a number typed into a percent cell is a percent, as in Excel */
function parseInput(raw, cellNf) {
  const s = String(raw ?? '');
  if (s === '') return null;
  if (s[0] === '=' && s.length > 1) return { f: s.slice(1) };
  if (s[0] === "'") return { v: s.slice(1) };
  if (cellNf === '@') return { v: s };
  const t = s.trim(), kind = nfKind(cellNf);
  if (/^(true|false)$/i.test(t)) return { v: /^t/i.test(t) };
  if (ERR[t.toUpperCase()]) return { v: ERR[t.toUpperCase()] };
  let m, n;
  if ((m = /^(.*?)\s*%$/.exec(t)) && (n = numText(m[1]))) return { v: n.v / 100, nf: kind === 'pct' ? cellNf : n.dec ? '0.00%' : PCT_NF };
  if ((m = /^([-+]?)\s*(R\$|[₪$€£¥₽])\s*([^₪$€£¥₽]+)$/.exec(t)) || (m = /^([-+]?)()([^₪$€£¥₽]+?)\s*(R\$|[₪$€£¥₽])$/.exec(t))) {
    const sym = m[2] || m[4];
    n = numText(m[1] + m[3]);
    if (n) return { v: n.v, nf: kind === 'cur' ? cellNf : curNf(sym, n.dec ? 2 : 0) };
  }
  if ((n = numText(t))) {
    if (kind === 'pct') return { v: n.v / 100 };
    return n.grouped && kind === 'gen' ? { v: n.v, nf: n.dec ? NUM_NF : '#,##0' } : { v: n.v };
  }
  const d = dateText(t);
  if (d) return kind === 'date' || kind === 'ldate' || kind === 'time' ? { v: d.v } : d;
  return { v: s };
}

/* --- Excel's number format codes: up to four sections (positive; negative; zero; text), each made of digit
   places (0 # ?), the decimal point, thousands marks, %, E+00, dates and times (d m y h s AM/PM, [h] for elapsed
   hours), "literal text", \x, _x (a space), [Red] and the like, and [$₪-40D] currency marks. Compiled once each --- */
const FMT_COLORS = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#00ff00', blue: '#0000ff', yellow: '#ffff00', magenta: '#ff00ff', cyan: '#00ffff' };
/* Excel's 56 legacy colors, for [ColorN] in formats and indexed colors in old files */
const PALETTE = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF',
  'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99', '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300',
  '333300', '993300', '993366', '333399', '333333'].map(c => '#' + c.toLowerCase());
const FMTS = new Map();
function splitSections(code) {
  const out = [];
  let cur = '', q = false, br = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (q) { cur += ch; if (ch === '"') q = false; continue; }
    if (ch === '\\' || ch === '_' || ch === '*') { cur += ch + (code[i + 1] || ''); i++; continue; }
    if (ch === '"') { q = true; cur += ch; continue; }
    if (ch === '[') br = true; else if (ch === ']') br = false;
    if (ch === ';' && !br) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.slice(0, 4);
}
function compileSection(src) {
  const toks = [], sec = { toks, date: false, text: false, gen: false, pct: 0, color: null, cond: null, ampm: false, digits: false };
  let i = 0;
  const lastDate = () => { for (let j = toks.length - 1; j >= 0; j--) if (/^[ymdhs]$|^el$/.test(toks[j].t)) return toks[j]; return null; };
  while (i < src.length) {
    const ch = src[i], rest = src.slice(i);
    let m;
    if (ch === '"') { const j = src.indexOf('"', i + 1); toks.push({ t: 'l', s: src.slice(i + 1, j < 0 ? src.length : j) }); i = j < 0 ? src.length : j + 1; continue; }
    if (ch === '\\') { toks.push({ t: 'l', s: src[i + 1] || '' }); i += 2; continue; }
    if (ch === '_') { toks.push({ t: 'l', s: ' ' }); i += 2; continue; }
    if (ch === '*') { i += 2; continue; }
    if (ch === '[') {
      const j = src.indexOf(']', i), inner = src.slice(i + 1, j < 0 ? src.length : j);
      i = j < 0 ? src.length : j + 1;
      if ((m = /^\$([^-]*)(-[0-9A-Za-z-]+)?$/.exec(inner))) { if (m[1]) toks.push({ t: 'l', s: m[1] }); continue; }
      if ((m = /^(h+|m+|s+)$/i.exec(inner))) { toks.push({ t: 'el', u: m[1][0].toLowerCase(), n: m[1].length }); sec.date = true; continue; }
      if ((m = /^(<=|>=|<>|<|>|=)\s*(-?\d+(?:\.\d+)?)$/.exec(inner))) { sec.cond = [m[1], +m[2]]; continue; }
      if ((m = /^color\s*(\d+)$/i.exec(inner))) { sec.color = PALETTE[+m[1] - 1] || null; continue; }
      if (FMT_COLORS[inner.toLowerCase()]) sec.color = FMT_COLORS[inner.toLowerCase()];
      continue;
    }
    if (/^general/i.test(rest)) { toks.push({ t: 'g' }); sec.gen = true; i += 7; continue; }
    if ((m = /^(am\/pm|a\/p)/i.exec(rest))) { toks.push({ t: 'ap', k: m[1] }); sec.date = sec.ampm = true; i += m[1].length; continue; }
    if ((m = /^(y+|m+|d+|h+|s+)/i.exec(rest))) { toks.push({ t: m[1][0].toLowerCase(), n: m[1].length }); sec.date = true; i += m[1].length; continue; }
    if (ch === '.' && sec.date && (m = /^\.(0+)/.exec(rest)) && (lastDate() || {}).t === 's') { toks.push({ t: 'fs', n: m[1].length }); i += m[0].length; continue; }
    if ((m = /^[eE][+-]/.exec(rest)) && !sec.date) { toks.push({ t: 'E', s: m[0][1] }); i += 2; continue; }
    if ('0#?'.includes(ch) && !sec.date) { toks.push({ t: 'd', k: ch }); sec.digits = true; i++; continue; }
    if ((ch === '.' || ch === ',') && !sec.date) { toks.push({ t: ch }); i++; continue; }
    if (ch === '%') { toks.push({ t: 'l', s: '%' }); sec.pct++; i++; continue; }
    if (ch === '@') { toks.push({ t: '@' }); sec.text = true; i++; continue; }
    toks.push({ t: 'l', s: ch }); i++;
  }
  // m is minutes right after hours or right before seconds, else months
  toks.forEach((t, j) => {
    if (t.t !== 'm') return;
    let prev = null, next = null;
    for (let k = j - 1; k >= 0 && !prev; k--) if (/^[ydhs]$|^el$|^m$/.test(toks[k].t)) prev = toks[k];
    for (let k = j + 1; k < toks.length && !next; k++) if (/^[ydhs]$|^el$|^m$/.test(toks[k].t)) next = toks[k];
    if ((prev && (prev.t === 'h' || (prev.t === 'el' && prev.u === 'h'))) || (next && (next.t === 's' || (next.t === 'el' && next.u === 's')))) t.t = 'mi';
  });
  if (sec.date) for (const t of toks) if (t.t === 'd' && t.k) { t.t = 'l'; t.s = t.k; }
  return sec;
}
function compileFmt(code) {
  let f = FMTS.get(code);
  if (!f) { if (FMTS.size > 400) FMTS.clear(); f = splitSections(code).map(compileSection); FMTS.set(code, f); }
  return f;
}
/* a number rounded to d places, as text with a dot: half away from zero, the way Excel rounds */
function fixed(a, d) {
  if (!(a >= 1e-6) || a >= 1e15) return a.toFixed(Math.min(d, 20));
  return Number(Math.round(Number(a + 'e' + d)) + 'e-' + d).toFixed(Math.min(d, 20));
}
function numPart(x, sec) {
  const toks = sec.toks, dp = toks.findIndex(t => t.t === '.'), ei = toks.findIndex(t => t.t === 'E');
  const intEnd = dp >= 0 ? dp : ei >= 0 ? ei : toks.length;
  const ip = [], fp = [], ep = [];
  toks.forEach((t, j) => { if (t.t !== 'd') return; if (ei >= 0 && j > ei) ep.push(j); else if (j < intEnd) ip.push(j); else fp.push(j); });
  // thousands: a comma between integer digit places; commas right after the last one divide by 1000
  let group = false, scale = 0;
  const lastI = ip.length ? ip[ip.length - 1] : -1;
  toks.forEach((t, j) => {
    if (t.t !== ',' || (ei >= 0 && j > ei)) return;
    if (j > lastI && lastI >= 0 && j < intEnd && toks.slice(lastI + 1, j).every(u => u.t === ',')) scale++;
    else if (ip.length && j > ip[0] && j < lastI) group = true;
  });
  x /= Math.pow(1000, scale);
  let e = 0;
  if (ei >= 0 && x) { e = Math.floor(Math.log10(x)); const k = Math.max(1, ip.length); if (k > 1 && toks.some((t, j) => ip.includes(j) && t.k === '#')) e = Math.floor(e / k) * k; x /= Math.pow(10, e); if (+fixed(x, fp.length) >= Math.pow(10, Math.max(1, ip.length))) { x /= 10; e++; } }
  const s = fixed(x, fp.length), [intS, fracS = ''] = s.split('.');
  let ints = intS === '0' && !ip.some(j => toks[j].k === '0') ? '' : intS;
  const minI = ip.filter(j => toks[j].k === '0').length;
  if (ints.length < minI) ints = ints.padStart(minI, '0');
  const out = new Array(toks.length).fill('');
  if (group || !ip.length) {
    let g = ints;
    if (group) g = g.replace(/\B(?=(\d{3})+(?!\d))/g, GRP);
    if (ip.length) out[ip[0]] = g; else if (ints && ints !== '0') out.push(g);
  } else {
    let k = ints.length - 1;
    for (let q = ip.length - 1; q >= 0; q--) {
      const t = toks[ip[q]];
      if (q === 0) { out[ip[q]] = k >= 0 ? ints.slice(0, k + 1) : t.k === '0' ? '0' : t.k === '?' ? ' ' : ''; break; }
      out[ip[q]] = k >= 0 ? ints[k] : t.k === '0' ? '0' : t.k === '?' ? ' ' : '';
      k--;
    }
  }
  const fr = fracS.split('');
  for (let q = fp.length - 1; q >= 0; q--) { const t = toks[fp[q]]; if (fr[q] !== '0' || t.k === '0') break; fr[q] = t.k === '?' ? ' ' : ''; }
  fp.forEach((j, q) => { out[j] = fr[q] ?? ''; });
  if (ei >= 0) { const es = String(Math.abs(e)).padStart(Math.max(1, ep.length), '0'); out[ei] = 'E' + (e < 0 ? '-' : toks[ei].s === '+' ? '+' : ''); ep.forEach((j, q) => { out[j] = q === 0 ? es.slice(0, es.length - ep.length + 1) : es[es.length - ep.length + q]; }); }
  toks.forEach((t, j) => { if (t.t === 'l') out[j] = t.s; else if (t.t === '.') out[j] = DEC; else if (t.t === 'g') out[j] = genText(x, 11); });
  return out.join('');
}
function datePart(v, sec) {
  if (v < 0 || v >= 2958466) return null;
  const t = fromSerial(v), hasDay = sec.toks.some(x => x.t === 'd');
  let secs = t.s;
  if (!sec.toks.some(x => x.t === 'fs')) secs = Math.round(secs);
  return sec.toks.map(x => {
    switch (x.t) {
      case 'l': return x.s;
      case 'y': return x.n <= 2 ? pad2(t.y % 100) : String(t.y);
      case 'm': return x.n === 1 ? String(t.m) : x.n === 2 ? pad2(t.m) : x.n === 3 ? M_SHORT[t.m - 1] : x.n === 5 ? M_LONG[t.m - 1][0] : (hasDay ? M_DAY : M_LONG)[t.m - 1];
      case 'd': return x.n === 1 ? String(t.d) : x.n === 2 ? pad2(t.d) : x.n === 3 ? D_SHORT[t.w] : D_LONG[t.w];
      case 'h': { const hh = sec.ampm ? t.H % 12 || 12 : t.H; return x.n === 1 ? String(hh) : pad2(hh); }
      case 'mi': return x.n === 1 ? String(t.M) : pad2(t.M);
      case 's': { const s = Math.min(59, Math.floor(secs)); return x.n === 1 ? String(s) : pad2(s); }
      case 'fs': return DEC + String(Math.floor((secs % 1) * Math.pow(10, x.n))).padStart(x.n, '0');
      case 'ap': return x.k.length > 3 ? (t.H < 12 ? 'AM' : 'PM') : (t.H < 12 ? 'A' : 'P');
      case 'el': { const n = x.u === 'h' ? Math.floor(v * 24) : x.u === 'm' ? Math.floor(v * 1440) : Math.round(v * 86400); return String(n).padStart(x.n, '0'); }
      case 'g': return genText(v, 11);
      default: return x.s || '';
    }
  }).join('');
}
/* Excel's General: up to sig significant digits, E notation for very big or small numbers */
function genText(v, sig = 11) {
  if (!Number.isFinite(v)) return '#NUM!';
  if (v === 0) return '0';
  const a = Math.abs(v);
  let s;
  if (a >= 1e11 || a < 1e-9) {
    const [mant, ex] = a.toExponential(Math.max(0, Math.min(sig, 20) - 6)).split('e');
    s = mant.replace(/\.?0+$/, '') + 'E' + (+ex < 0 ? '-' : '+') + pad2(Math.abs(+ex));
  } else {
    s = fixed(a, Math.max(0, Math.min(20, sig - 1 - Math.floor(Math.log10(a)))));
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  }
  return (v < 0 ? '-' : '') + s.replace('.', DEC);
}
const condOk = (c, v) => ({ '<': v < c[1], '>': v > c[1], '=': v === c[1], '<=': v <= c[1], '>=': v >= c[1], '<>': v !== c[1] })[c[0]];
/* a number through a format code: { t: text, c: color }, or t null when it can't be shown (a negative date) */
function fmtNumber(v, code) {
  const secs = compileFmt(code);
  let sec, x = v, minus = false;
  if (secs.some(s => s.cond)) {
    sec = secs.find(s => s.cond && condOk(s.cond, v)) || secs.find(s => !s.cond && !s.text) || secs[0];
    if (v < 0 && !sec.cond) { x = -v; minus = secs.filter(s => !s.text).length < 3; }
  } else if (secs.length === 1 || secs[1].text && secs.length === 2) { sec = secs[0]; if (v < 0 && !sec.date) { x = -v; minus = true; } }
  else if (v > 0 || (v === 0 && secs.length < 3)) sec = secs[0];
  else if (v < 0) { sec = secs[1]; x = -v; }
  else sec = secs[2];
  if (sec.text && !sec.digits && !sec.date && !sec.gen) return { t: genText(v), c: null };
  let t;
  if (sec.date) t = datePart(x, sec);
  else if (sec.digits) t = numPart(x * Math.pow(100, sec.pct), sec);
  else if (sec.gen) t = sec.toks.map(k => k.t === 'l' ? k.s : k.t === 'g' ? genText(x * Math.pow(100, sec.pct)) : '').join('');
  else t = sec.toks.map(k => k.t === 'l' ? k.s : '').join('');
  if (t == null) return { t: null, c: null };
  return { t: (minus && /[1-9]/.test(t) ? '-' : '') + t, c: sec.color };
}
function fmtText(s, code) {
  const secs = compileFmt(code), sec = secs.length === 4 ? secs[3] : secs.find(x => x.text);
  if (!sec) return { t: s, c: null };
  return { t: sec.toks.map(k => k.t === '@' ? s : k.t === 'l' ? k.s : '').join(''), c: sec.color };
}
/* what kind of format a code is, for the ribbon's list and for Claude */
function nfKind(nf) {
  if (!nf) return 'gen';
  if (nf === '@') return 'text';
  const secs = compileFmt(nf), s = secs[0];
  if (s.date) {
    const ks = new Set(s.toks.map(t => t.t));
    if (!ks.has('y') && !ks.has('m') && !ks.has('d')) return 'time';
    return s.toks.some(t => t.t === 'm' && t.n >= 3) ? 'ldate' : 'date';
  }
  if (s.pct) return 'pct';
  if (s.toks.some(t => t.t === 'l' && CURS.some(c => t.s.includes(c)))) return 'cur';
  if (s.toks.some(t => t.t === 'E')) return 'sci';
  if (s.digits) return 'num';
  return 'custom';
}
const isDateNf = nf => { const k = nfKind(nf); return k === 'date' || k === 'ldate' || k === 'time'; };
/* the decimal places a format shows, and the same format with d of them */
function nfDecimals(nf) { const s = compileFmt(nf)[0], dp = s.toks.findIndex(t => t.t === '.'); if (dp < 0) return 0; let n = 0; for (let j = dp + 1; j < s.toks.length && s.toks[j].t === 'd'; j++) n++; return n; }
function nfWithDecimals(nf, d) {
  return splitSections(nf).map(sec => {
    if (compileSection(sec).date) return sec;
    // the last digit place outside "quotes", [brackets] and escapes, before any E+ (a mantissa's decimals, not the exponent's)
    let last = -1, q = false, br = false;
    for (let i = 0; i < sec.length; i++) {
      const ch = sec[i];
      if (q) { if (ch === '"') q = false; continue; }
      if (ch === '"') { q = true; continue; }
      if (ch === '\\' || ch === '_' || ch === '*') { i++; continue; }
      if (ch === '[') { br = true; continue; }
      if (ch === ']') { br = false; continue; }
      if (br) continue;
      if ((ch === 'E' || ch === 'e') && /[+-]/.test(sec[i + 1] || '')) break;
      if ('0#?'.includes(ch)) last = i;
    }
    if (last < 0) return sec;
    let a = last;
    while (a > 0 && '0#?.,'.includes(sec[a - 1])) a--;
    const run = sec.slice(a, last + 1), dot = run.indexOf('.');
    return sec.slice(0, a) + (dot >= 0 ? run.slice(0, dot) : run) + (d > 0 ? '.' + '0'.repeat(d) : '') + sec.slice(last + 1);
  }).join(';');
}

/* =========================================================
   formulas: tokens, a parser, the functions, and recalculation in the order the cells depend on each other.
   Formulas are kept the way Excel writes them in its files: English names, commas between arguments, A1 references
   ========================================================= */
const RX = {
  ws: /\s+/y,
  str: /"(?:[^"]|"")*"/y,
  err: /#(?:NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|SPILL!|CALC!)/iy,
  sheet: /(?:'((?:[^']|'')+)'|([\p{L}_][\p{L}\p{N}_.]*))!/uy,
  cell: /(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d{0,6})(?::(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d{0,6}))?(?![\p{L}\p{N}_(.!$])/uy,
  cols: /(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![\p{L}\p{N}_(.!$])/uy,
  rows: /(\$?)([1-9]\d{0,6}):(\$?)([1-9]\d{0,6})(?![\p{L}\p{N}_(.!$])/uy,
  num: /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y,
  fn: /(?:_xl(?:fn|ws)\.)*[\p{L}_][\p{L}\p{N}_.]*(?=\s*\()/uy,
  name: /[\p{L}_\\][\p{L}\p{N}_.?\\]*/uy,
  op: /<>|<=|>=|[-+*/^&=<>%@:]/y,
  opt: /\[\s*([\p{L}_\\][\p{L}\p{N}_.?\\]*)\s*\]/uy,
  open: /\s*\(/y,
};
const execAt = (re, s, i) => { re.lastIndex = i; return re.exec(s); };
/* a structured reference, Excel's grammar: [Col], [@Col], [@[Col 1]:[Col 2]], [@], [#Totals], [[#Headers],[Col]],
   [[Col 1]:[Col 2]], [] (the table's data). ' before [ ] # ' @ makes it part of a column's name. src[i] is the [ */
const T_SPEC = { '#all': 'all', '#data': 'data', '#headers': 'hdr', '#totals': 'tot', '#this row': 'row' };
function trefScan(src, i) {
  let p = i + 1;
  const sp = {}, cols = [];
  const text = () => { let t = ''; while (p < src.length && src[p] !== ']') { if (src[p] === "'" && p + 1 < src.length) p++; t += src[p++]; } return src[p] === ']' ? t : null; };
  const item = () => { if (src[p] !== '[') return null; p++; const t = text(); if (t == null) return null; p++; return t; };
  const ws = () => { while (src[p] === ' ') p++; };
  const word = t => { const k = T_SPEC[t.trim().toLowerCase()]; if (k) sp[k] = true; return !!k; };
  const pair = () => { const a = item(); if (a == null) return false; cols.push(a); ws(); if (src[p] === ':') { p++; ws(); const b = item(); if (b == null) return false; cols.push(b); } return true; };
  ws();
  if (src[p] === ']') return { end: p + 1, sp, cols };
  if (src[p] === '@') {
    sp.row = true; p++;
    if (src[p] === ']') return { end: p + 1, sp, cols };
    if (src[p] === '[') { if (!pair()) return null; ws(); return src[p] === ']' ? { end: p + 1, sp, cols } : null; }
    const t = text(); if (t == null) return null;
    cols.push(t);
    return { end: p + 1, sp, cols };
  }
  if (src[p] === '[') {
    for (;;) {
      const at = p, a = item();
      if (a == null) return null;
      if (!word(a)) { p = at; if (!pair()) return null; }
      ws();
      if (src[p] === ',') { p++; ws(); continue; }
      return src[p] === ']' && cols.length <= 2 ? { end: p + 1, sp, cols } : null;
    }
  }
  const t = text();
  if (t == null) return null;
  if (!word(t)) cols.push(t);
  return { end: p + 1, sp, cols };
}
/* a reference at position j: one cell (k 'c'), an area (k 'a'), whole columns (k 'C') or whole rows (k 'R').
   a: whether each part is fixed with $: [row1, col1, row2, col2] */
function refAt(src, j) {
  let m;
  if ((m = execAt(RX.cell, src, j))) {
    const c1 = colNum(m[2]), r1 = +m[4] - 1, end = j + m[0].length;
    if (c1 < MAXC && r1 < MAXR) {
      if (!m[6]) return { end, k: 'c', r1, c1, r2: r1, c2: c1, a: [!!m[3], !!m[1], !!m[3], !!m[1]] };
      const c2 = colNum(m[6]), r2 = +m[8] - 1;
      if (c2 < MAXC && r2 < MAXR) return { end, k: 'a', r1, c1, r2, c2, a: [!!m[3], !!m[1], !!m[7], !!m[5]] };
    }
  }
  if ((m = execAt(RX.cols, src, j))) { const c1 = colNum(m[2]), c2 = colNum(m[4]); if (c1 < MAXC && c2 < MAXC) return { end: j + m[0].length, k: 'C', r1: 0, c1, r2: MAXR - 1, c2, a: [true, !!m[1], true, !!m[3]] }; }
  if ((m = execAt(RX.rows, src, j))) { const r1 = +m[2] - 1, r2 = +m[4] - 1; if (r1 < MAXR && r2 < MAXR) return { end: j + m[0].length, k: 'R', r1, c1: 0, r2, c2: MAXC - 1, a: [!!m[1], true, !!m[3], true] }; }
  return null;
}
/* the tokens of a formula. Inside { } (an array written in the formula) a comma parts columns and ; parts rows;
   elsewhere ; parts arguments too, the way many languages' Excel writes them. A # right after one cell (B2#) is all
   the cells its formula spills into */
function tokenize(src) {
  const toks = [];
  let i = 0, bad = false, brace = 0;
  while (i < src.length) {
    const ch = src[i];
    let m;
    if ((m = execAt(RX.ws, src, i))) { toks.push({ t: 'ws', s: m[0], p: i }); i += m[0].length; continue; }
    if (ch === '"') {
      if (!(m = execAt(RX.str, src, i))) { toks.push({ t: 'bad', s: src.slice(i), p: i }); bad = true; break; }
      toks.push({ t: 'str', s: m[0], v: m[0].slice(1, -1).replace(/""/g, '"'), p: i }); i += m[0].length; continue;
    }
    if (ch === '#' && (m = execAt(RX.err, src, i))) { toks.push({ t: 'err', s: m[0].toUpperCase(), v: m[0].toUpperCase(), p: i }); i += m[0].length; continue; }
    let j = i, sheet = null, q = false;
    if ((m = execAt(RX.sheet, src, i))) { sheet = m[1] != null ? m[1].replace(/''/g, "'") : m[2]; q = m[1] != null; j = i + m[0].length; }
    const r = refAt(src, j);
    if (r) {
      let end = r.end, sp = false;
      if (r.k === 'c' && src[end] === '#' && !execAt(RX.err, src, end)) { end++; sp = true; }
      toks.push({ t: 'ref', s: src.slice(i, end), sheet, q, p: i, ...r, end, sp }); i = end; continue;
    }
    if (sheet != null && (m = execAt(RX.err, src, j)) && m[0].toUpperCase() === '#REF!') { toks.push({ t: 'err', s: src.slice(i, j + 5), v: '#REF!', p: i }); i = j + 5; continue; }
    // a defined name that belongs to one sheet, written with the sheet before it: Sales!Total
    if (sheet != null && (m = execAt(RX.name, src, j)) && !execAt(RX.open, src, j + m[0].length)) { const end = j + m[0].length; toks.push({ t: 'name', s: src.slice(i, end), n: m[0], sheet, q, p: i }); i = end; continue; }
    if ((m = execAt(RX.num, src, i))) { toks.push({ t: 'num', s: m[0], v: +m[0], p: i }); i += m[0].length; continue; }
    if ((m = execAt(RX.fn, src, i))) { toks.push({ t: 'fn', s: m[0], n: m[0].replace(/^(?:_xl(?:fn|ws)\.)+/i, '').toUpperCase(), p: i }); i += m[0].length; continue; }
    if ((m = execAt(RX.name, src, i)) && src[i + m[0].length] === '[') {   // a table's name and its [ ]
      const q = trefScan(src, i + m[0].length);
      if (q) { toks.push({ t: 'tref', s: src.slice(i, q.end), tbl: m[0], sp: q.sp, cols: q.cols, p: i }); i = q.end; continue; }
    }
    if ((m = execAt(RX.name, src, i))) { const u = m[0].toUpperCase(); toks.push(u === 'TRUE' || u === 'FALSE' ? { t: 'bool', s: m[0], v: u === 'TRUE', p: i } : { t: 'name', s: m[0], n: m[0], sheet: null, p: i }); i += m[0].length; continue; }
    if ((m = execAt(RX.op, src, i))) { toks.push({ t: 'op', s: m[0], p: i }); i += m[0].length; continue; }
    if (ch === '{' || ch === '}') { brace = Math.max(0, brace + (ch === '{' ? 1 : -1)); toks.push({ t: ch, s: ch, p: i }); i++; continue; }
    if (ch === ';') { toks.push({ t: brace ? ';' : ',', s: ch, p: i }); i++; continue; }
    if ('(),'.includes(ch)) { toks.push({ t: ch, s: ch, p: i }); i++; continue; }
    if (ch === '[' && (m = execAt(RX.opt, src, i))) { toks.push({ t: 'opt', s: m[0], n: m[1], p: i }); i += m[0].length; continue; }   // [name]: a LAMBDA's parameter that may be left out, or a column of the table the formula is in
    if (ch === '[') { const q = trefScan(src, i); if (q) { toks.push({ t: 'tref', s: src.slice(i, q.end), tbl: null, sp: q.sp, cols: q.cols, p: i }); i = q.end; continue; } }
    toks.push({ t: 'bad', s: ch, p: i }); bad = true; i++;
  }
  toks.bad = bad;
  return toks;
}
/* Excel's order: : (from one reference to another) - (negation) % ^ * / + - & comparisons. ^ goes left to right, and
   -2^2 is 4 */
const BIN = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5, ':': 7 };
/* what may stand on a side of the : when it isn't inside one address (A1:INDEX(...), two functions, names): an address,
   a name, another such range, and the functions that can answer with a reference. Excel takes nothing else there when
   a formula is typed (A1:SUM(B2) is refused), and so does this; a function nobody knows passes, and is #NAME? */
const REF_FN = new Set(['INDEX', 'OFFSET', 'INDIRECT', 'IF', 'CHOOSE', 'XLOOKUP']);
const refSide = n => n.t === 'ref' || n.t === 'name' || n.t === 'span' || n.t === 'err' || n.t === 'tref' || n.t === 'opt' || (n.t === 'fn' && (REF_FN.has(n.n) || !FUNCS[n.n]));
function parseFormula(src) {
  const all = tokenize(src);
  if (all.bad) throw new Error('bad');
  const toks = all.filter(t => t.t !== 'ws');
  let i = 0;
  const peek = () => toks[i], take = () => toks[i++];
  const expect = t => { const x = take(); if (!x || x.t !== t) throw new Error(t); };
  // one value inside { }: a number (a - before it too), text, TRUE/FALSE or an error
  function konst() {
    let t = take(), neg = false;
    if (t && t.t === 'op' && (t.s === '-' || t.s === '+')) { neg = t.s === '-'; t = take(); if (!t || t.t !== 'num') throw new Error('arr'); }
    if (!t) throw new Error('end');
    if (t.t === 'num') return neg ? -t.v : t.v;
    if (t.t === 'str' || t.t === 'bool') return t.v;
    if (t.t === 'err') return ERR[t.v] || E_REF;
    throw new Error('arr');
  }
  // the values in a function's brackets, after its ( was taken
  function argList() {
    const args = [];
    if (peek() && peek().t === ')') { take(); return args; }
    for (;;) {
      const p = peek();
      args.push(p && (p.t === ',' || p.t === ')') ? { t: 'miss' } : expr(0));
      const x = take();
      if (!x) throw new Error('end');
      if (x.t === ')') break;
      if (x.t !== ',') throw new Error(',');
    }
    return args;
  }
  // what a function or brackets gave may be called in turn, when it is a LAMBDA: LAMBDA(x,x+1)(5)
  const called = n => { while (peek() && peek().t === '(') { take(); n = { t: 'call', f: n, args: argList() }; } return n; };
  function prim() {
    const t = take();
    if (!t) throw new Error('end');
    switch (t.t) {
      case 'num': return { t: 'num', v: t.v };
      case 'str': return { t: 'str', v: t.v };
      case 'bool': return { t: 'bool', v: t.v };
      case 'err': return { t: 'err', v: ERR[t.v] || E_REF };
      case 'ref': return { t: 'ref', sheet: t.sheet, k: t.k, g: G4(t.r1, t.c1, t.r2, t.c2), r1: t.r1, c1: t.c1, r2: t.r2, c2: t.c2, ab: t.a, sp: t.sp };
      case 'name': return { t: 'name', n: t.n, sheet: t.sheet };
      case 'fn': expect('('); return called({ t: 'fn', n: t.n, args: argList() });
      case 'opt': return { t: 'opt', n: t.n };
      case 'tref': return { t: 'tref', tbl: t.tbl, sp: t.sp, cols: t.cols };
      case '{': {
        const rows = [[]];
        for (;;) {
          rows[rows.length - 1].push(konst());
          const x = take();
          if (!x) throw new Error('end');
          if (x.t === '}') break;
          if (x.t === ';') rows.push([]);
          else if (x.t !== ',') throw new Error('arr');
        }
        const w = rows[0].length;
        if (rows.some(r => r.length !== w)) throw new Error('arr');
        return { t: 'arr', v: { arr: true, h: rows.length, w, d: rows.flat() } };
      }
      case '(': { const e = expr(0); expect(')'); return called(e); }
      case 'op':
        if (t.s === '-' || t.s === '+') return { t: 'neg', neg: t.s === '-', a: expr(6) };
        if (t.s === '@') return { t: 'at', a: expr(7) };
        break;
    }
    throw new Error('token');
  }
  function expr(min) {
    let left = prim();
    for (;;) {
      const t = peek();
      if (!t || t.t !== 'op') break;
      if (t.s === '%') { if (min > 6) break; take(); left = { t: 'pct', a: left }; continue; }   // A1:INDEX(...)% is the whole range's
      const p = BIN[t.s];
      if (p == null || p < min) break;
      take();
      const b = expr(p + 1);
      if (t.s !== ':') left = { t: 'bin', op: t.s, a: left, b };
      else if (refSide(left) && refSide(b)) left = { t: 'span', a: left, b };
      else throw new Error(':');
    }
    return left;
  }
  const ast = expr(0);
  if (i < toks.length) throw new Error('rest');
  return ast;
}
const ASTS = new Map();
function astOf(f) {
  let a = ASTS.get(f);
  if (a === undefined) {
    try { a = parseFormula(f); } catch { a = null; }
    if (ASTS.size > 30000) ASTS.clear();
    ASTS.set(f, a);
  }
  return a;
}
function walk(n, fn) {
  if (!n) return;
  fn(n);
  if (n.t === 'fn') for (const x of n.args) walk(x, fn);
  else if (n.t === 'call') { walk(n.f, fn); for (const x of n.args) walk(x, fn); }
  else if (n.a) { walk(n.a, fn); if (n.b) walk(n.b, fn); }
}

/* --- values: Excel's rules for turning one kind into another --- */
let CTX = { si: 0, r: 0, c: 0, dyn: false };   // the cell whose formula is being worked out
let AX = false;     // arrays are on: a range stays whole, and math on it is done cell by cell (off only in formulas from older Excel files, outside what takes arrays)
let OFF = null;     // conditional formatting: a rule's formula, moved to the cell it is checked for ({ dr, dc })
let LIMR = MAXR, LIMC = MAXC;   // a whole column (or row) as an array ends after the last row (or column) in use
const COLL = new Intl.Collator(LOCALE, { sensitivity: 'accent', numeric: false });
/* Text in the order Excel has it (measured there, in Data > Sort and in < between two texts): the scripts go Latin,
   Greek, Cyrillic, Hebrew, Arabic, Chinese, whatever the language of the interface (the browser's own order for
   Hebrew puts Hebrew first); a hyphen or an apostrophe inside a word isn't counted (co-op goes with coop), and only
   settles a tie */
const ROOT_COLL = new Intl.Collator('en', { sensitivity: 'accent' });
const scriptOf = t => { const ch = t.codePointAt(0); return ch === undefined || ch < 0x250 ? 0 : /^\p{sc=Grek}/u.test(t) ? 1 : /^\p{sc=Cyrl}/u.test(t) ? 2 : /^\p{sc=Hebr}/u.test(t) ? 3 : /^\p{sc=Arab}/u.test(t) ? 4 : /^[\p{sc=Han}\p{sc=Hira}\p{sc=Kana}\p{sc=Hang}]/u.test(t) ? 6 : 5; };
const WORD_SIGN = /['\u2019-]/, WORD_SIGNS = /['\u2019-]/g;
function textCmp(a, b, coll = COLL) {
  const by = (x, y) => scriptOf(x) !== scriptOf(y) ? ROOT_COLL.compare(x, y) : coll.compare(x, y);
  return WORD_SIGN.test(a) || WORD_SIGN.test(b) ? by(a.replace(WORD_SIGNS, ''), b.replace(WORD_SIGNS, '')) || a.length - b.length || by(a, b) : by(a, b);
}
const sheetNamed = name => { if (name == null) return WB.sheets[CTX.si]; const n = name.toLowerCase(); return WB.sheets.find(s => s.name.toLowerCase() === n) || null; };
/* a cell's value; an empty cell another formula spills into shows that formula's value */
function valAt(s, r, c) {
  const k = KEY(r, c), cell = s.cells.get(k);
  if (cell && cell.v !== undefined) return cell.v;
  const x = s._sp && s._sp.get(k);
  if (x && typeof x.a === 'string') PV_READ = true;   // a pivot table's cell
  return x ? x.v : null;
}
function toNum(v) {
  if (typeof v === 'number') return v;
  if (v == null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isErr(v)) return v;
  const p = String(v).trim() ? parseInput(String(v).trim()) : null;
  return p && !p.f && typeof p.v === 'number' ? p.v : E_VAL;
}
function toStr(v) { return typeof v === 'string' ? v : v == null || v.lam ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : isErr(v) ? v.c : genText(v, 15); }
function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v == null) return false;
  if (isErr(v)) return v;
  const u = String(v).trim().toUpperCase();
  return u === 'TRUE' ? true : u === 'FALSE' ? false : E_VAL;
}
/* one value where a range stands alone: the cell of the range in the formula's own row (or column); of an array, its first */
function scal(v) {
  if (!v || typeof v !== 'object' || isErr(v)) return v;
  if (v.arr) return v.d.length ? v.d[0] : null;
  if (!v.rng) return v;
  const { s, g } = v;
  if (g.r1 === g.r2 && g.c1 === g.c2) return valAt(s, g.r1, g.c1);
  if (g.c1 === g.c2 && CTX.r >= g.r1 && CTX.r <= g.r2) return valAt(s, CTX.r, g.c1);
  if (g.r1 === g.r2 && CTX.c >= g.c1 && CTX.c <= g.c2) return valAt(s, g.r1, CTX.c);
  return E_VAL;
}
const scalR = v => v && v.rng ? scal(v) : v;
function compare(op, a, b) {
  if (a == null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b == null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const rank = v => typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2, ra = rank(a), rb = rank(b);
  let c;
  if (ra !== rb) c = ra < rb ? -1 : 1;
  else if (ra === 1) c = a.toLowerCase() === b.toLowerCase() ? 0 : textCmp(a, b) < 0 ? -1 : 1;
  else c = a < b ? -1 : a > b ? 1 : 0;
  return op === '=' ? c === 0 : op === '<>' ? c !== 0 : op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
}
function binop(op, a, b) {
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  if (isLam(a) || isLam(b)) return E_VAL;
  if (op === '&') return toStr(a) + toStr(b);
  if (BIN[op] === 1) return compare(op, a, b);
  const x = toNum(a); if (isErr(x)) return x;
  const y = toNum(b); if (isErr(y)) return y;
  let r;
  if (op === '+' || op === '-') {
    r = op === '+' ? x + y : x - y;
    if (r && Math.abs(r) < Math.max(Math.abs(x), Math.abs(y)) * 1e-15) r = 0;   // 0.1+0.2-0.3 is 0, as Excel shows it
  } else if (op === '*') r = x * y;
  else if (op === '/') { if (y === 0) return E_DIV; r = x / y; }
  else { if (x === 0 && y === 0) return E_NUM; if (x === 0 && y < 0) return E_DIV; r = Math.pow(x, y); }
  return Number.isFinite(r) ? r : E_NUM;
}
function unop(n, x) {
  if (!n.neg && n.t === 'neg') return x;   // + in front changes nothing, as in Excel
  const v = toNum(x);
  return isErr(v) ? v : n.t === 'pct' ? v / 100 : -v;
}
function ev(n) {
  switch (n.t) {
    case 'num': case 'str': case 'bool': case 'err': case 'arr': case 'val': return n.v;
    case 'miss': return null;
    case 'opt': case 'tref': return trefVal(n, KEEP);
    case 'call': {
      const keep = KEEP;
      KEEP = false;
      const f = ev(n.f);
      return isLam(f) ? applyLam(f, n.args.map(argL), keep) : isErr(f) ? f : E_VAL;
    }
    case 'name': return nameVal(n);
    case 'ref': return refVal(n);
    case 'fn': {
      const f = FUNCS[n.n], keep = KEEP;
      KEEP = false;
      if (!f) return callNamed(n, keep);
      const [lo, hi] = f.n;
      if (n.args.length < lo || n.args.length > hi) return E_VAL;
      if (f.dyn) CTX.dyn = true;
      try { return f.f(n.args, keep); } catch (e) { if (e instanceof Err) return e; throw e; }
    }
    case 'span': {
      // from one reference to another: the smallest range that holds both, on one sheet. It isn't written in the
      // formula, so it is kept for the order of the next pass (pointsAt)
      const a = refOf(n.a), b = isErr(a) ? a : refOf(n.b);
      if (isErr(b)) return b;
      if (!a || !a.rng || !b || !b.rng || a.s !== b.s) return E_VAL;
      const rv = { rng: true, s: a.s, g: { r1: Math.min(a.g.r1, b.g.r1), c1: Math.min(a.g.c1, b.g.c1), r2: Math.max(a.g.r2, b.g.r2), c2: Math.max(a.g.c2, b.g.c2) } };
      pointsAt(rv);
      return rv;
    }
    case 'at': return scal(ev(n.a));
    case 'neg': case 'pct': { let v = one(ev(n.a)); if (!AX) v = scalR(v); return isA(v) ? mapArr([v], x => unop(n, x[0])) : isLam(v) ? E_VAL : unop(n, v); }
    case 'bin': {
      let a = one(ev(n.a)), b = one(ev(n.b));
      if (!AX) { a = scalR(a); b = scalR(b); }
      return isA(a) || isA(b) ? mapArr([a, b], x => binop(n.op, x[0], x[1])) : binop(n.op, a, b);
    }
  }
  return E_VAL;
}
/* a row or column number moved by d inside a rule's formula: past the sheet's edge it comes round the other side, as
   Excel has it for conditional formatting and data validation (a part fixed with $ stays) */
const wrapAt = (v, d, fixed, max) => fixed ? v : ((v + d) % max + max) % max;
/* the cells a structured reference names now: its table (by its name, or the one the formula's cell is in), its columns
   (all of them when none is named), its rows: #All, #Data (also when nothing is said), #Headers, #Totals, or the
   formula's own row (@, #This Row), which must be one of the table's data rows on the same sheet */
function trefRange(n, si, r, c) {
  const x = n.t === 'opt' ? { tbl: null, sp: {}, cols: [n.n] } : n, here = WB.sheets[si];
  let s = here, t = null;
  if (x.tbl != null) { const f = tableByName(x.tbl); if (!f) return E_REF; s = f.s; t = f.t; }
  else if (!(t = here && tableAt(here, r, c))) return E_REF;
  const g = t.g, d = dataRows(t), idx = nm => t.cols.findIndex(y => y.n.toLowerCase() === nm.toLowerCase());
  let c1 = g.c1, c2 = g.c2;
  if (x.cols.length) { const a = idx(x.cols[0]), b = x.cols.length > 1 ? idx(x.cols[1]) : a; if (a < 0 || b < 0) return E_REF; c1 = g.c1 + Math.min(a, b); c2 = g.c1 + Math.max(a, b); }
  const sp = x.sp;
  let r1, r2;
  if (sp.row) { if (s !== here || r < d.r1 || r > d.r2) return E_VAL; r1 = r2 = r; }
  else if (sp.all) { r1 = g.r1; r2 = g.r2; }
  else {
    const rows = [];
    if (sp.hdr) { if (!t.hr) return E_REF; rows.push(g.r1); }
    if (sp.data || (!sp.hdr && !sp.tot)) rows.push(d.r1, d.r2);
    if (sp.tot) { if (!t.tr) return E_REF; rows.push(g.r2); }
    r1 = Math.min(...rows); r2 = Math.max(...rows);
  }
  return { rng: true, s, g: { r1, c1, r2, c2 } };
}
function trefVal(n, keep) {
  const R = trefRange(n, CTX.si, CTX.r, CTX.c);
  if (isErr(R)) return R;
  return !keep && R.g.r1 === R.g.r2 && R.g.c1 === R.g.c2 ? valAt(R.s, R.g.r1, R.g.c1) : R;
}
/* a structured reference written back: the way it shows (inside its own table without the table's name, and @ for the
   formula's own row), or the way a file keeps it (always with the name, and [#This Row]) */
const T_WORD = { all: '#All', hdr: '#Headers', data: '#Data', tot: '#Totals' };   // in Excel's order
const tColEsc = n => n.replace(/['#[\]@]/g, m => "'" + m);
const tNeedBr = n => /[\t\n\r,:.[\]#'"{}$^&*+=\-<>/]/.test(n) || /^\s|\s$/.test(n);   // Excel's marks that need the column in [ ] of its own
function trefText(x, own, file) {
  const name = file ? (x.tbl || own || '') : x.tbl && !(own && x.tbl.toLowerCase() === own.toLowerCase()) ? x.tbl : '';
  const cols = x.cols.map(tColEsc), words = Object.keys(T_WORD).filter(k => x.sp[k]);
  const pair = cols.length > 1 ? `[${cols[0]}]:[${cols[1]}]` : cols.length ? `[${cols[0]}]` : '';
  let body;
  if (x.sp.row) {
    if (file) body = '[' + ['[#This Row]', pair].filter(Boolean).join(',') + ']';
    else body = cols.length === 1 && !tNeedBr(x.cols[0]) && !/\s/.test(x.cols[0]) ? `[@${cols[0]}]` : `[@${pair}]`;
  } else if (!words.length) { if (!cols.length && name && !file) return name; body = !cols.length ? '[]' : cols.length === 1 && !tNeedBr(x.cols[0]) ? `[${cols[0]}]` : `[${pair}]`; }   // Sales[] shows as Sales
  else if (words.length === 1 && !cols.length) body = `[${T_WORD[words[0]]}]`;
  else body = '[' + [...words.map(k => `[${T_WORD[k]}]`), pair].filter(Boolean).join(',') + ']';
  return name + body;
}
/* a reference's value: one cell's value, or the range itself (keep: even for one cell, the way SUM and its family want it) */
function refVal(n, keep) {
  const s = sheetNamed(n.sheet);
  if (!s) return E_REF;
  let g = n.g;
  if (OFF) {   // conditional formatting and data validation: the parts without $ move with the cell being checked
    const a = n.ab;
    g = G4(wrapAt(n.r1, OFF.dr, a[0], MAXR), wrapAt(n.c1, OFF.dc, a[1], MAXC), wrapAt(n.r2, OFF.dr, a[2], MAXR), wrapAt(n.c2, OFF.dc, a[3], MAXC));
  }
  if (n.sp) {   // B2#: the cells B2's formula spills into
    const k = KEY(g.r1, g.c1), x = s.cells.get(k);
    if (!x || x.f == null) return E_REF;
    return { rng: true, s, g: (s._sa && s._sa.get(k)) || { r1: g.r1, c1: g.c1, r2: g.r1, c2: g.c1 } };
  }
  return n.k === 'c' && !keep ? valAt(s, g.r1, g.c1) : { rng: true, s, g };
}
/* a range of one cell is that cell's value: what INDIRECT, OFFSET, INDEX or a name give back for a single cell works
   like the cell's own address */
const one = v => v && v.rng && v.g.r1 === v.g.r2 && v.g.c1 === v.g.c2 ? valAt(v.s, v.g.r1, v.g.c1) : v;
/* a defined name's value: what its formula gives. A name for cells is those cells (keep: even one cell stays a
   reference, for SUM, ROW and their like). The parts of its references without $ are written for cell A1, and move to
   the cell that uses the name, the way Excel keeps relative names. A name that uses itself is #NAME?, as in Excel */
const NAMING = [];
function nameVal(n, keep) {
  if (ENV && n.sheet == null) { const b = envGet(n.n); if (b !== undefined) return b === OMITTED ? null : keep ? b : one(b); }   // a name LET or a LAMBDA gave
  const nm = nameOf(n, WB.sheets[CTX.si]), ast = nm ? astOf(nm.f) : null;
  if (!nm && n.sheet == null && tableByName(n.n)) return trefVal({ tbl: n.n, sp: {}, cols: [] }, keep);   // a table's name alone: its data
  if (!ast || NAMING.includes(nm)) return E_NAME;
  const was = [OFF, AX];
  NAMING.push(nm);
  OFF = { dr: CTX.r, dc: CTX.c };
  try {
    if (ast.t === 'ref') return refVal(ast, keep);
    if (ast.t === 'name') return nameVal(ast, keep);
    AX = true;   // a name's formula works on whole ranges, as Excel's do
    return keep ? refOf(ast) : ev(ast);
  } finally { NAMING.pop(); [OFF, AX] = was; }
}
/* a value kept as the reference it is, where it is one: an address or a name for cells even when they are one cell,
   and the branch IF or CHOOSE picks (KEEP tells the function, which gets it as its second argument). The sides of the
   : are read this way, and so is the source of a list */
let KEEP = false, XKEEP = false;
function refOf(n) {
  if (n.t === 'ref') return refVal(n, true);
  if (n.t === 'tref' || n.t === 'opt') return trefVal(n, true);
  if (n.t === 'name') return nameVal(n, true);
  KEEP = n.t === 'fn' || n.t === 'call';
  try { return ev(n); } finally { KEEP = false; }
}
/* LET and LAMBDA. The names they give stand in ENV with their values, the innermost first. A value stays what was
   given: a reference stays a reference (ROW(x) works on it), an array an array. A LAMBDA is a value too:
   { lam, params, body, env: the names around it when it was made, off: where its relative references stand }; it is
   worked out when it is called — LAMBDA(x,x+1)(5), a name LET gave it, or a defined name that holds it, which may
   call itself. A cell that ends up holding one shows #CALC!, as in Excel */
let ENV = null, LAM_DEPTH = 0, LAM_N = 0;
const tooDeep = e => e instanceof RangeError || (!!e && e.name === 'InternalError');   // the browser's stack ran out (Firefox names it InternalError)
const OMITTED = { omit: true };   // a parameter in [ ] that was left out; ISOMITTED sees it, anything else reads an empty value
const isLam = v => !!v && v.lam === true;
function envGet(name) { const k = name.toLowerCase(); for (let e = ENV; e; e = e.up) { const v = e.names.get(k); if (v !== undefined) return v; } return undefined; }
/* a value handed to a LAMBDA, as it is */
const argL = n => n.t === 'miss' ? OMITTED : argA(n);
function applyLam(lam, vals, keep) {
  if (lam.native) { const f = FUNCS[lam.native]; try { return vals.length < f.n[0] || vals.length > f.n[1] ? E_VAL : f.f(vals.map(v => ({ t: 'val', v: v === OMITTED ? null : v }))); } catch (e) { if (e instanceof Err) return e; throw e; } }
  const ps = lam.params, names = new Map();
  if (vals.length > ps.length) return E_VAL;
  for (let i = 0; i < ps.length; i++) {
    let v = i < vals.length ? vals[i] : OMITTED;
    if (v === OMITTED && !ps[i].opt) { if (i >= vals.length) return E_VAL; v = null; }
    names.set(ps[i].k, v);
  }
  // A LAMBDA that calls itself without end, or far too many times: #NUM!, as in Excel. Once that happens, every call
  // still waiting inside the same outermost call ends at once (two calls on each level would otherwise never finish).
  // The browser's own stack may end before the 1024th level; that is the same #NUM!
  const e0 = ENV, a0 = AX, o0 = OFF, d0 = LAM_DEPTH;
  if (!d0) LAM_N = 0;
  if (d0 >= 1024 || ++LAM_N > 3e6) { LAM_N = Infinity; return E_NUM; }
  ENV = { names, up: lam.env }; AX = true; OFF = lam.off; LAM_DEPTH = d0 + 1;
  try { return keep ? refOf(lam.body) : ev(lam.body); }
  catch (e) { if (e instanceof Err) return e; if (!d0 && tooDeep(e)) return E_NUM; throw e; }
  finally { ENV = e0; AX = a0; OFF = o0; LAM_DEPTH = d0; }
}
/* a name used as a function, F(3): one that LET or a LAMBDA's parameters gave, or a defined name, when it holds a LAMBDA */
function callNamed(n, keep) {
  let f = ENV ? envGet(n.n) : undefined;
  if (f === undefined) { const nm = nameOf({ n: n.n, sheet: null }, WB.sheets[CTX.si]); if (!nm) return E_NAME; f = nameVal({ t: 'name', n: nm.n, sheet: null }, true); }
  return isLam(f) ? applyLam(f, n.args.map(argL), keep) : isErr(f) ? f : E_VAL;
}
/* the LAMBDA an argument holds (MAP's, REDUCE's...): one written there, a name for one, or the bare name of a function
   (BYROW(A1:C3,SUM)) */
function lamOf(n) {
  if (n.t === 'name' && n.sheet == null && !(ENV && envGet(n.n) !== undefined) && FUNCS[n.n.toUpperCase()] && !nameOf(n, WB.sheets[CTX.si])) return { lam: true, native: n.n.toUpperCase() };
  const f = ev(n);
  if (isErr(f)) throw f;
  if (!isLam(f)) throw E_VAL;
  return f;
}
/* what a LAMBDA gave, as one cell's value: a reference to one cell is its value; more than one value (or a LAMBDA) can't
   stand in one place of an array */
function oneV(v) {
  v = one(v);
  if (isLam(v)) return E_CALC;
  if (isA(v)) { const A = toArr(v); return isErr(A) ? A : A.h * A.w === 1 ? zero(A.d[0]) : E_CALC; }
  return zero(v);
}
/* the places of an array or a range as a LAMBDA takes them one by one: a range's cells as references (ROW(x) works),
   by rows. A whole column ends at the last row in use */
function placesIn(v) {
  if (v && v.rng) {
    const g = v.g, big = (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1) > 1e5, r2 = big ? Math.min(g.r2, Math.max(g.r1, LIMR - 1)) : g.r2, c2 = big ? Math.min(g.c2, Math.max(g.c1, LIMC - 1)) : g.c2;
    const h = r2 - g.r1 + 1, w = c2 - g.c1 + 1;
    if (h * w > 1e6) throw E_NUM;
    return { h, w, at: (i, j) => i < h && j < w ? { rng: true, s: v.s, g: { r1: g.r1 + i, c1: g.c1 + j, r2: g.r1 + i, c2: g.c1 + j } } : MISS, row: i => ({ rng: true, s: v.s, g: { r1: g.r1 + i, c1: g.c1, r2: g.r1 + i, c2 } }), col: j => ({ rng: true, s: v.s, g: { r1: g.r1, c1: g.c1 + j, r2, c2: g.c1 + j } }) };
  }
  const A = arrOf(v);
  return { h: A.h, w: A.w, at: (i, j) => elt(A, i, j), row: i => lineOf(A, i, false), col: j => lineOf(A, j, true) };
}
/* INDIRECT, OFFSET, INDEX and the : between two of them point at cells their formula doesn't name. While a cell's
   formula is worked out, each range they gave is kept (DD), so the next pass works out those cells first (see recalc) */
let DDON = false, DD = null;
function pointsAt(rv) {
  if (!DDON) return;
  if (!DD) DD = [];
  if (DD.length < 200 && !DD.some(d => d.s === rv.s && sameG(d.g, rv.g))) DD.push({ s: rv.s, g: rv.g });
}
/* the reference a text names, for INDIRECT: an address the way Excel writes it (B2, $B$2:$C$9, A:A, 2:5, Sheet2!B2,
   'My sheet'!B2), R1C1 style when a1 is off (R2C3, R[-1]C, C4), or a defined name that stands for cells. null when it
   is none of these. Measured in Excel: spaces may follow the text, the ! and the colon, but not come first */
function refOfText(text, a1) {
  let t = text.replace(/\s+$/, ''), s = WB.sheets[CTX.si], sheet = null;
  if (!t || /^\s/.test(t)) return null;
  const m = execAt(RX.sheet, t, 0);
  if (m) { sheet = m[1] != null ? m[1].replace(/''/g, "'") : m[2]; s = sheetNamed(sheet); t = t.slice(m[0].length).replace(/^\s+/, ''); }
  if (!s) return null;
  const sp = a1 && t.endsWith('#');
  const parts = (sp ? t.slice(0, -1) : t).split(/\s*:\s*/), P = parts.length <= 2 ? parts.map(a1 ? partA1 : partRC) : [null];
  if (P.every(Boolean) && P.every(p => p.k === P[0].k) && (P.length === 2 || P[0].k === 'c' || !a1)) {
    const a = P[0], b = P[P.length - 1], g = a.k === 'c' ? G4(a.r, a.c, b.r, b.c) : a.k === 'C' ? G4(0, a.c, MAXR - 1, b.c) : G4(a.r, 0, b.r, MAXC - 1);
    if (!sp) return { rng: true, s, g };
    const k = KEY(g.r1, g.c1), x = P.length === 1 ? s.cells.get(k) : null;
    return x && x.f != null ? { rng: true, s, g: (s._sa && s._sa.get(k)) || g } : null;
  }
  // a name: only one that is a reference itself (Excel takes no name for a number, a formula, or another name)
  const nm = execAt(RX.name, t, 0);
  if (!nm || nm[0].length !== t.length) return null;
  const def = nameOf({ n: t, sheet }, WB.sheets[CTX.si]), ast = def ? astOf(def.f) : null;
  if (!ast || ast.t !== 'ref') return null;
  const was = OFF;
  OFF = null;   // its parts without $ stay where they are written: for A1 (measured in Excel)
  try { const rv = refVal(ast, true); return rv && rv.rng ? rv : null; } finally { OFF = was; }
}
function partA1(p) {
  let m;
  if ((m = /^\$?([A-Za-z]{1,3})\$?0*([1-9]\d{0,6})$/.exec(p))) { const c = colNum(m[1]), r = +m[2] - 1; return c < MAXC && r < MAXR ? { k: 'c', r, c } : null; }
  if ((m = /^\$?([A-Za-z]{1,3})$/.exec(p))) { const c = colNum(m[1]); return c < MAXC ? { k: 'C', c } : null; }
  if ((m = /^\$?0*([1-9]\d{0,6})$/.exec(p))) { const r = +m[1] - 1; return r < MAXR ? { k: 'R', r } : null; }
  return null;
}
/* R1C1 style: a number is the row or column itself, [n] is n away from the formula's own (round the sheet's edge), and
   nothing is the formula's own */
function partRC(p) {
  const at = (t, cur, max) => {
    if (t === '') return cur;
    if (t[0] !== '[') { const n = +t; return n >= 1 && n <= max ? n - 1 : null; }
    const d = +t.slice(1, -1);
    return Math.abs(d) < max ? ((cur + d) % max + max) % max : null;
  };
  let m;
  if ((m = RC_CELL.exec(p))) { const r = at(m[1], CTX.r, MAXR), c = at(m[2], CTX.c, MAXC); return r == null || c == null ? null : { k: 'c', r, c }; }
  if ((m = RC_ROW.exec(p))) { const r = at(m[1], CTX.r, MAXR); return r == null ? null : { k: 'R', r }; }
  if ((m = RC_COL.exec(p))) { const c = at(m[1], CTX.c, MAXC); return c == null ? null : { k: 'C', c }; }
  return null;
}
const RC_CELL = /^R(\[[+-]?\d+\]|\d*)C(\[[+-]?\d+\]|\d*)$/i, RC_ROW = /^R(\[[+-]?\d+\]|\d*)$/i, RC_COL = /^C(\[[+-]?\d+\]|\d*)$/i;
/* each value in a range: fn(value, r, c) for every cell that holds one; a value fn returns stops it */
function eachIn(rv, fn) {
  const { s, g } = rv, area = (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1), sp = s._sp && s._sp.size ? s._sp : null;
  if (area > (s.cells.size + (sp ? sp.size : 0)) * 2) {
    for (const [k, cell] of s.cells) { if (cell.v == null) continue; const r = kr(k), c = kc(k); if (inG(g, r, c)) { const x = fn(cell.v, r, c); if (x !== undefined) return x; } }
    if (sp) for (const [k, o] of sp) { if (o.v == null) continue; const r = kr(k), c = kc(k); if (!inG(g, r, c)) continue; const cell = s.cells.get(k); if (cell && cell.v != null) continue; if (typeof o.a === 'string') PV_READ = true; const x = fn(o.v, r, c); if (x !== undefined) return x; }
  } else {
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const v = valAt(s, r, c); if (v != null) { const x = fn(v, r, c); if (x !== undefined) return x; } }
  }
}

/* --- arrays: a range's values, or what a formula makes, as rows of values { arr, h, w, d } --- */
const isA = v => !!v && typeof v === 'object' && (v.arr === true || v.rng === true);
const mkArr = (h, w, d) => ({ arr: true, h, w, d });
const MISS = {};
function toArr(v) {
  if (isErr(v)) return v;
  if (v && v.arr) return v;
  if (v && v.rng) {
    const { s, g } = v;
    let r2 = g.r2, c2 = g.c2;
    if ((r2 - g.r1 + 1) * (c2 - g.c1 + 1) > 1e5) { r2 = Math.min(r2, Math.max(g.r1, LIMR - 1)); c2 = Math.min(c2, Math.max(g.c1, LIMC - 1)); }
    const h = r2 - g.r1 + 1, w = c2 - g.c1 + 1;
    if (h * w > 4e6) return E_NUM;
    const kept = DDON && w <= 16 && h * w >= 32 ? keptArr(s, g.r1, g.c1, r2, c2) : null;
    if (kept && kept.A) return kept.A;
    const d = new Array(h * w);
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) d[i * w + j] = valAt(s, g.r1 + i, g.c1 + j);
    const A = mkArr(h, w, d);
    if (kept) { d._c = true; kept.A = A; if ((KEPT_N += h * w) > 3e6) { KEPT.clear(); KEPT_N = 0; } }
    return A;
  }
  return mkArr(1, 1, [v]);
}
/* A range's values are kept while one formula after another reads them in a pass: a lookup in each of 2,000 rows reads
   the same 20,000 cells, and finds its value through one index (findExact, sortedPos) instead of reading them all.
   They are good as long as no cell of their columns has changed since: s._cv counts each column's changes, s._sv the
   spills. Only narrow ranges are kept, where lookups look; nothing is kept outside a pass */
const KEPT = new Map();
let KEPT_N = 0;
function keptArr(s, r1, c1, r2, c2) {
  const key = s.id + ':' + r1 + ',' + c1 + ',' + r2 + ',' + c2;
  let stamp = s._sv || 0;
  if (s._cv) for (let c = c1; c <= c2; c++) stamp += s._cv.get(c) || 0;
  const e = KEPT.get(key);
  if (e && e.stamp === stamp) return e;
  const n = { stamp, A: null };
  KEPT.set(key, n);
  return n;
}
const changedAt = (s, c) => { (s._cv || (s._cv = new Map())).set(c, (s._cv.get(c) || 0) + 1); };
const arrOf = v => { const A = toArr(v); if (isErr(A)) throw A; return A; };
const dims = v => v && v.rng ? [v.g.r2 - v.g.r1 + 1, v.g.c2 - v.g.c1 + 1] : v && v.arr ? [v.h, v.w] : [1, 1];
/* each value of a range (only cells that hold one) or of an array (but its empty places) */
function eachV(v, fn) {
  if (v.rng) return eachIn(v, fn);
  for (let i = 0; i < v.d.length; i++) { const x = v.d[i]; if (x != null) { const r = fn(x, Math.floor(i / v.w), i % v.w); if (r !== undefined) return r; } }
}
function elt(A, i, j) { const r = A.h === 1 ? 0 : i, c = A.w === 1 ? 0 : j; return r < A.h && c < A.w ? A.d[r * A.w + c] : MISS; }
/* the same work for each place of the arrays among vals: one value, or an array one row (column) wide, goes with every
   place; where an array is too small for the others, #N/A */
function mapArr(vals, fn) {
  const As = vals.map(v => isA(v) ? toArr(v) : null);
  for (const A of As) if (isErr(A)) return A;
  let h = 1, w = 1;
  for (const A of As) if (A) { if (A.h > h) h = A.h; if (A.w > w) w = A.w; }
  if (h * w > 4e6) return E_NUM;
  CTX.dyn = true;
  const d = new Array(h * w), cur = vals.slice();
  for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
    let miss = false;
    for (let k = 0; k < vals.length; k++) if (As[k]) { const x = elt(As[k], i, j); if (x === MISS) miss = true; else cur[k] = x; }
    d[i * w + j] = miss ? E_NA : fn(cur);
  }
  return mkArr(h, w, d);
}
/* a function's own work, where a wrong kind of value throws its error */
function call(fn, v) {
  try { const r = fn(...v); return typeof r === 'number' && !Number.isFinite(r) ? E_NUM : r === undefined ? E_VAL : r; }
  catch (e) { if (e instanceof Err) return e; throw e; }
}
const num = v => { const x = toNum(v); if (isErr(x)) throw x; return x; };
const str = v => { if (isErr(v)) throw v; if (v && v.lam) throw E_VAL; return toStr(v); };
const bool = v => { const x = toBool(v); if (isErr(x)) throw x; return x; };
const int = v => Math.trunc(num(v));
const opt = (v, d) => v === undefined ? d : v;
/* an argument as one value: a range there is the cell in the formula's own row or column (outside arrays) */
function argS(n) { const v = one(ev(n)); return !AX && v && v.rng ? scal(v) : v; }
/* an argument that takes arrays: a reference stays a reference (even to one cell), and math in it is done cell by cell */
function argA(n) {
  if (n.t === 'ref') return refVal(n, true);
  if (n.t === 'tref' || n.t === 'opt') return trefVal(n, true);
  if (n.t === 'name') return nameVal(n, true);
  const k = AX;
  AX = true;
  KEEP = n.t === 'call' || (n.t === 'fn' && (n.n === 'IF' || n.n === 'CHOOSE' || n.n === 'XLOOKUP' || n.n === 'LET' || !FUNCS[n.n]));   // the cell they pick stays a reference: ROW(IF(TRUE,A3)) is 3, as in Excel
  try { return ev(n); } finally { AX = k; KEEP = false; }
}
/* a function of single values. kinds tells how each argument is taken (the last goes on for the rest, or a function of
   its place): v one value, a an array or a reference as it is. Where an array stands for a v, the function answers for
   each of its places, and the answer is an array */
function fx(lo, hi, kinds, fn, more) {
  const kindAt = typeof kinds === 'function' ? kinds : i => kinds[Math.min(i, kinds.length - 1)];
  return { n: [lo, hi], ...more, f: args => {
    const vals = args.map((a, i) => a.t === 'miss' ? null : kindAt(i) === 'v' ? argS(a) : argA(a));
    let lift = null;
    vals.forEach((v, i) => { if (kindAt(i) === 'v' && isA(v)) (lift || (lift = [])).push(i); });
    if (!lift) return call(fn, vals);
    return mapArr(lift.map(i => vals[i]), xs => { const v = vals.slice(); lift.forEach((i, k) => { v[i] = xs[k]; }); const r = call(fn, v); return r && r.rng ? zero(scal(r)) : r; });
  } };
}

/* the numbers SUM and its family work on. From a reference or an array only its numbers count (text and TRUE/FALSE
   there are skipped); typed in directly, TRUE/FALSE and text that reads as a number count too. An error stops them,
   but COUNT just leaves it out */
function numsOf(args, count) {
  const out = [];
  for (const a of args) {
    if (a.t === 'miss') { out.push(0); continue; }
    const v = argA(a);
    if (isA(v)) { const e = eachV(v, x => { if (typeof x === 'number') out.push(x); else if (isErr(x) && !count) return x; }); if (e) return e; continue; }
    if (isErr(v)) { if (count) continue; return v; }
    if (typeof v === 'number') out.push(v);
    else if (typeof v === 'boolean') out.push(v ? 1 : 0);
    else if (v == null) out.push(0);
    else { const n = toNum(v); if (isErr(n)) { if (count) continue; return n; } out.push(n); }
  }
  return out;
}
const sumOf = n => { let s = 0; for (const x of n) s += x; return s; };
const nums = args => { const n = numsOf(args); if (isErr(n)) throw n; return n; };
/* the numbers in a range or an array (text and TRUE/FALSE there are left out) */
function numsIn(v) {
  const out = [];
  if (isA(v)) { const e = eachV(v, x => { if (typeof x === 'number') out.push(x); else if (isErr(x)) return x; }); if (e) throw e; }
  else if (isErr(v)) throw v;
  else if (v != null) out.push(num(v));
  return out;
}
/* every value the arguments hold, in order (a range or an array row by row); fromRef says it came out of one */
function valsOf(args, fn) {
  for (const a of args) {
    if (a.t === 'miss') { fn(null, false); continue; }
    const v = argA(a);
    if (isA(v)) { for (const x of arrOf(v).d) fn(x, true); }
    else fn(v, false);
  }
}
const sorted = a => a.slice().sort((x, y) => x - y);
function varOf(n, pop) {
  const k = n.length;
  if (k < (pop ? 1 : 2)) throw E_DIV;
  const m = sumOf(n) / k;
  let s = 0;
  for (const x of n) s += (x - m) * (x - m);
  return s / (pop ? k : k - 1);
}
function pctl(n, k) {
  if (!n.length || k < 0 || k > 1) throw E_NUM;
  const a = sorted(n), p = k * (a.length - 1), i = Math.floor(p);
  return i + 1 < a.length ? a[i] + (p - i) * (a[i + 1] - a[i]) : a[i];
}
function modeOf(n) {
  const cnt = new Map();
  let best = null, bn = 1;
  for (const x of n) { const c = (cnt.get(x) || 0) + 1; cnt.set(x, c); if (c > bn) { bn = c; best = x; } }
  if (best === null) throw E_NA;
  for (const x of n) if (cnt.get(x) === bn) return x;   // the first of the most common, as Excel picks
  return best;
}
/* Excel's rounding: half away from zero, after the tiny errors of binary fractions are taken off (ROUND(1.005,2) is 1.01) */
function roundTo(x, d, way) {
  d = Math.trunc(d);
  const m = Math.pow(10, Math.min(Math.abs(d), 300));
  let y = +(d >= 0 ? x * m : x / m).toPrecision(15);
  y = way > 0 ? Math.sign(y) * Math.ceil(Math.abs(y)) : way < 0 ? Math.trunc(y) : Math.sign(y) * Math.round(Math.abs(y));
  return d >= 0 ? y / m : y * m;
}
const q15 = x => +x.toPrecision(15);

/* --- conditions like COUNTIF's: 5, ">5", "<>done", "a*" (* any letters, ? one letter, ~ before them for the sign
   itself), "" for empty cells, TRUE, or an error --- */
function wildRe(t, whole = true) {
  let re = '';
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '~' && i + 1 < t.length && '*?~'.includes(t[i + 1])) { re += reEsc(t[++i]); continue; }
    re += ch === '*' ? '[\\s\\S]*' : ch === '?' ? '[\\s\\S]' : reEsc(ch);
  }
  return new RegExp(whole ? '^' + re + '$' : re, 'i');
}
const CRITS = new Map();
function critOf(c) {
  if (typeof c === 'string') {
    let f = CRITS.get(c);
    if (!f) { f = critText(c); if (CRITS.size > 500) CRITS.clear(); CRITS.set(c, f); }
    return f;
  }
  if (isErr(c)) return v => v === c;
  if (typeof c === 'boolean') return v => v === c;
  if (c == null) c = 0;   // an empty cell as the condition means 0
  return v => typeof v === 'number' ? v === c : typeof v === 'string' && numLike(v) === c;
}
/* text that reads as a number ("5", "1/10/2026"), as its number; otherwise null */
function numLike(v) { const t = v.trim(); if (!t) return null; const p = parseInput(t); return p && p.f == null && typeof p.v === 'number' ? p.v : null; }
function critText(s) {
  const m = /^(<=|>=|<>|=|<|>)/.exec(s), op = m ? m[1] : '=', t = m ? s.slice(op.length) : s;
  if (t === '') return !m ? v => v == null || v === '' : op === '=' ? v => v == null : op === '<>' ? v => v != null : () => false;
  const u = t.trim().toUpperCase();
  if (ERR[u]) { const e = ERR[u]; return op === '=' ? v => v === e : op === '<>' ? v => v !== e : () => false; }
  const test = (want, rel) => op === '=' ? v => want(v) && rel(v) === 0 : op === '<>' ? v => !(want(v) && rel(v) === 0)
    : v => { if (!want(v)) return false; const c = rel(v); return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0; };
  if (u === 'TRUE' || u === 'FALSE') { const b = u === 'TRUE'; return test(v => typeof v === 'boolean', v => v === b ? 0 : v ? 1 : -1); }
  // a number: = also finds it written as text ("5"), but <> and the others look at numbers only, as Excel does
  const x = numLike(t);
  if (x != null) return op === '=' ? v => typeof v === 'number' ? v === x : typeof v === 'string' && numLike(v) === x
    : op === '<>' ? v => !(typeof v === 'number' && v === x) : test(v => typeof v === 'number', v => v < x ? -1 : v > x ? 1 : 0);
  if (op === '=' || op === '<>') { const re = wildRe(t); return op === '=' ? v => typeof v === 'string' && re.test(v) : v => !(typeof v === 'string' && re.test(v)); }
  return test(v => typeof v === 'string', v => v.toLowerCase() === t.toLowerCase() ? 0 : textCmp(v, t) < 0 ? -1 : 1);
}
/* the places (from the top corner) of the cells that pass every condition: pairs of [range, condition] of one size */
function ifsCells(pairs) {
  const [h, w] = dims(pairs[0][0]);
  for (const [r] of pairs) { const [h2, w2] = dims(r); if (h2 !== h || w2 !== w) throw E_VAL; }
  const tests = pairs.map(([r, c]) => [arrOf(r), critOf(c), c]), A0 = tests[0][0], out = [];
  // a condition that asks for one value, on a kept range (see keptArr): its places come from the range's index, and
  // only they are checked against the other conditions
  const lead = tests.find(([A, , c]) => A.d._c && eqKey(c, A.d) !== undefined);
  if (lead) { for (const i of placesOf(lead[0].d).get(eqKey(lead[2], lead[0].d)) || []) if (tests.every(([A, f]) => f(A.d[i]))) out.push(i); }
  else for (let i = 0; i < A0.d.length; i++) if (tests.every(([A, f]) => f(A.d[i]))) out.push(i);
  // a whole column is looked at only down to the last row in use; the empty rest passes when empty cells pass
  return { out, rest: h * w - A0.d.length, restOk: tests.every(([, f]) => f(null)) };
}
/* the one value a condition asks for, as the key of a kept range's index (keyOf): text without * ? ~, or a number
   when no text in the range reads as a number (COUNTIF's 5 also finds "5"). undefined for any other condition */
function eqKey(c, list) {
  let x = c;
  if (typeof c === 'string') {
    const m = /^(<=|>=|<>|=|<|>)/.exec(c);
    if (m && m[1] !== '=') return undefined;
    const t = m ? c.slice(1) : c, u = t.trim().toUpperCase();
    if (t === '' || /[*?~]/.test(t) || ERR[u] || u === 'TRUE' || u === 'FALSE') return undefined;
    x = numLike(t);
    if (x == null) return 's' + t.toLowerCase();
  }
  if (x == null) x = 0;
  if (typeof x !== 'number') return undefined;
  if (list._nt === undefined) list._nt = list.some(v => typeof v === 'string' && numLike(v) != null);
  return list._nt ? undefined : x;
}
/* every place of each value in a kept range, by key */
function placesOf(list) {
  let all = list._all;
  if (!all) { all = list._all = new Map(); for (let i = 0; i < list.length; i++) { const k = keyOf(list[i]); if (k !== undefined) { const at = all.get(k); if (at) at.push(i); else all.set(k, [i]); } } }
  return all;
}
/* COUNTIF(range, ">5") on a kept range: how many of its numbers pass, through the numbers in order (undefined: count
   the usual way) */
function cmpCount(A, c) {
  if (!A.d._c || typeof c !== 'string') return undefined;
  const m = /^(<=|>=|<|>)([\s\S]*)$/.exec(c), x = m ? numLike(m[2]) : null;
  if (x == null) return undefined;
  const sn = A.d._sn || (A.d._sn = Float64Array.from(A.d.filter(v => typeof v === 'number')).sort());
  const under = strict => { let a = 0, b = sn.length; while (a < b) { const mid = (a + b) >> 1; if (strict ? sn[mid] < x : sn[mid] <= x) a = mid + 1; else b = mid; } return a; };   // how many are < x (strict) or <= x
  return m[1] === '<' ? under(true) : m[1] === '<=' ? under(false) : m[1] === '>' ? sn.length - under(false) : sn.length - under(true);
}
/* the range to add up (average, ...), grown or shrunk to the size of the first range from its top corner, as Excel does */
function sameSize(v, like) {
  if (!v || !v.rng) return v;
  const [h, w] = dims(like), g = v.g;
  return { rng: true, s: v.s, g: { r1: g.r1, c1: g.c1, r2: Math.min(MAXR - 1, g.r1 + h - 1), c2: Math.min(MAXC - 1, g.c1 + w - 1) } };
}
/* the numbers at the places that passed */
function numsAt(v, places) { const A = arrOf(v), out = []; for (const i of places) { const x = A.d[i]; if (typeof x === 'number') out.push(x); } return out; }
const pairsOf = (a, from) => { const p = []; if ((a.length - from) % 2) throw E_VAL; for (let i = from; i < a.length; i += 2) p.push([a[i], a[i + 1]]); return p; };

/* --- finding a value: exactly (capitals don't matter; * and ? when wild), or its place among sorted values --- */
const kindOf = v => typeof v === 'number' ? 'n' : typeof v === 'string' ? 's' : typeof v === 'boolean' ? 'b' : null;
const cmp3 = (a, b) => typeof a === 'string' ? (a.toLowerCase() === b.toLowerCase() ? 0 : textCmp(a, b) < 0 ? -1 : 1) : a < b ? -1 : a > b ? 1 : 0;
const keyOf = v => typeof v === 'number' ? v : typeof v === 'string' ? 's' + v.toLowerCase() : typeof v === 'boolean' ? (v ? 'bT' : 'bF') : undefined;
function findExact(list, x, wild, back) {
  if (isErr(x)) throw x;
  if (list._c && !(typeof x === 'string' && wild && /[*?~]/.test(x))) {   // a kept range: each value's first and last place, found once
    let ix = list._ix;
    if (!ix) { ix = list._ix = [new Map(), new Map()]; for (let i = 0; i < list.length; i++) { const k = keyOf(list[i]); if (k !== undefined) { if (!ix[0].has(k)) ix[0].set(k, i); ix[1].set(k, i); } } }
    const i = ix[back ? 1 : 0].get(keyOf(x == null ? 0 : x));
    return i === undefined ? -1 : i;
  }
  let test;
  if (typeof x === 'string') {
    if (wild && /[*?~]/.test(x)) { const re = wildRe(x); test = v => typeof v === 'string' && re.test(v); }
    else { const l = x.toLowerCase(); test = v => typeof v === 'string' && v.toLowerCase() === l; }
  } else { const y = x == null ? 0 : x; test = v => v === y; }
  if (back) { for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return i; }
  else for (let i = 0; i < list.length; i++) if (test(list[i])) return i;
  return -1;
}
/* the last value ≤ x in rising values (falling: the last ≥ x), by halving the way Excel does it (measured on values out
   of order, where the path shows): where the middle holds a value of another kind than x, the next one of x's kind
   after it is looked at; when there is none up to the end of the part, the search goes on before the middle */
function sortedPos(list, x, desc) {
  if (isErr(x)) throw x;
  if (x == null) x = 0;
  const kind = kindOf(x), n = list.length;
  let next = null;   // a kept list remembers, for each place, the next place that holds a value of this kind
  if (list._c) {
    const all = list._nx || (list._nx = {});
    if (!(next = all[kind])) { next = all[kind] = new Int32Array(n + 1); next[n] = n; for (let i = n - 1; i >= 0; i--) next[i] = kindOf(list[i]) === kind ? i : next[i + 1]; }
  }
  let lo = 0, hi = n - 1, best = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    let j = m;
    if (next) j = next[m]; else while (j <= hi && kindOf(list[j]) !== kind) j++;
    if (j > hi) { hi = m - 1; continue; }
    const c = cmp3(list[j], x);
    if (desc ? c >= 0 : c <= 0) { best = j; lo = j + 1; } else hi = m - 1;
  }
  return best;
}
/* XLOOKUP's and XMATCH's search: mode 0 exact, -1 exact or the next smaller, 1 exact or the next larger, 2 with * and ?;
   from the end when search is negative */
function xfind(list, x, mode, search) {
  if (mode === 0 || mode === 2) return findExact(list, x, mode === 2, search < 0);
  if (mode !== -1 && mode !== 1) throw E_VAL;
  if (isErr(x)) throw x;
  let best = -1, bv;
  const k = kindOf(x == null ? 0 : x), y = x == null ? 0 : x;
  for (let n = 0; n < list.length; n++) {
    const i = search < 0 ? list.length - 1 - n : n, v = list[i];
    if (kindOf(v) !== k) continue;
    const c = cmp3(v, y);
    if (c === 0) return i;
    if (mode < 0 ? c < 0 && (best < 0 || cmp3(v, bv) > 0) : c > 0 && (best < 0 || cmp3(v, bv) < 0)) { best = i; bv = v; }
  }
  return best;
}
/* row i (or column, across) of a range as a range, of an array as an array */
function lineOf(v, i, across) {
  if (v.rng) { const g = v.g; return { rng: true, s: v.s, g: across ? { r1: g.r1, r2: g.r2, c1: g.c1 + i, c2: g.c1 + i } : { r1: g.r1 + i, r2: g.r1 + i, c1: g.c1, c2: g.c2 } }; }
  const A = arrOf(v);
  return across ? mkArr(A.h, 1, Array.from({ length: A.h }, (_, r) => A.d[r * A.w + i])) : mkArr(1, A.w, A.d.slice(i * A.w, i * A.w + A.w));
}
const col0 = A => Array.from({ length: A.h }, (_, i) => A.d[i * A.w]);
const zero = v => v == null ? 0 : v;
/* the order SORT and UNIQUE see: numbers, then text, then FALSE and TRUE, then errors; empty places last */
function arrCmp(a, b) {
  const rk = v => v == null ? 4 : typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3, ra = rk(a), rb = rk(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return a - b;
  if (ra === 1) return a.toLowerCase() === b.toLowerCase() ? 0 : textCmp(a, b);
  if (ra === 2) return (a ? 1 : 0) - (b ? 1 : 0);
  return 0;
}
const sameVal = (a, b) => typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b || (a == null && b == null);
const rowsOf = (A, byCol) => byCol ? Array.from({ length: A.w }, (_, j) => Array.from({ length: A.h }, (_, i) => A.d[i * A.w + j])) : Array.from({ length: A.h }, (_, i) => A.d.slice(i * A.w, i * A.w + A.w));
const fromRows = (rows, byCol) => {
  if (!rows.length) throw E_CALC;
  const n = rows[0].length;
  return byCol ? mkArr(n, rows.length, Array.from({ length: n * rows.length }, (_, k) => zero(rows[k % rows.length][Math.floor(k / rows.length)])))
    : mkArr(rows.length, n, rows.flatMap(r => r.map(zero)));
};

/* --- dates: Excel's day numbers --- */
const dowOf = v => ((Math.floor(v) - 1) % 7 + 7) % 7;   // 0 is Sunday (day 1, 1 January 1900, was a Sunday in Excel's calendar)
function dateNum(v) { const n = num(v); if (n < 0 || n >= 2958466) throw E_NUM; return n; }
function ymd(v) { const n = dateNum(v); return fromSerial(Math.floor(n)); }
function monthsOn(v, k, end) {
  const a = ymd(v), t = a.m - 1 + Math.trunc(num(k)), y = a.y + Math.floor(t / 12), m = (t % 12 + 12) % 12 + 1;
  if (y < 1900 || y > 9999) throw E_NUM;
  return toSerial(y, m, end ? daysIn(y, m) : Math.min(a.d, daysIn(y, m)));
}
/* the days off: weekend numbers 1–7 (two days: 1 Saturday and Sunday ... 7 Friday and Saturday), 11–17 (one day:
   11 Sunday ... 17 Saturday), or seven 0/1 from Monday ("0000011") */
function weekendOf(w) {
  const off = [false, false, false, false, false, false, false];   // by day, 0 Sunday
  if (w == null) w = 1;
  if (typeof w === 'string') {
    if (!/^[01]{7}$/.test(w) || w === '1111111') throw E_VAL;
    for (let i = 0; i < 7; i++) off[(i + 1) % 7] = w[i] === '1';
    return off;
  }
  const k = Math.trunc(num(w));
  if (k >= 1 && k <= 7) { off[(k + 5) % 7] = true; off[(k + 6) % 7] = true; }
  else if (k >= 11 && k <= 17) off[(k - 11) % 7] = true;
  else throw E_NUM;
  return off;
}
const holidaySet = h => { const s = new Set(); if (h != null) for (const x of numsIn(h)) s.add(Math.floor(x)); return s; };
function workdays(a, b, off, hol) {
  let s = Math.floor(dateNum(a)), e = Math.floor(dateNum(b)), sign = 1;
  if (s > e) { [s, e] = [e, s]; sign = -1; }
  let n = 0;
  for (let d = s; d <= e; d++) if (!off[dowOf(d)] && !hol.has(d)) n++;
  return sign * n;
}
function workday(a, k, off, hol) {
  let d = Math.floor(dateNum(a)), left = Math.trunc(num(k));
  const step = left < 0 ? -1 : 1;
  if (off.every(Boolean)) throw E_VAL;
  while (left) { d += step; if (d < 0 || d > 2958465) throw E_NUM; if (!off[dowOf(d)] && !hol.has(d)) left -= step; }
  return d;
}
function isoWeek(n) {
  const d = Math.floor(n), wd = (dowOf(d) + 6) % 7, thu = d - wd + 3, y = fromSerial(thu).y, jan1 = toSerial(y, 1, 1);
  return Math.floor((thu - jan1) / 7) + 1;
}
function dateOfText(v) {
  if (typeof v !== 'string') throw E_VAL;
  const p = v.trim() ? parseInput(v.trim()) : null;
  if (!p || p.f != null || typeof p.v !== 'number' || !p.nf || !/[dmyhs]/i.test(p.nf)) throw E_VAL;
  return p.v;
}
const secsOf = v => Math.round((v - Math.floor(v)) * 86400) % 86400;
function datedif(a, b, u) {
  const s = Math.floor(dateNum(a)), e = Math.floor(dateNum(b));
  if (s > e) throw E_NUM;
  const x = fromSerial(s), y = fromSerial(e), k = str(u).toUpperCase();
  const months = (y.y - x.y) * 12 + y.m - x.m - (y.d < x.d ? 1 : 0);
  if (k === 'Y') return Math.floor(months / 12);
  if (k === 'M') return months;
  if (k === 'D') return e - s;
  if (k === 'YM') return months % 12;
  if (k === 'MD') { if (y.d >= x.d) return y.d - x.d; const pm = y.m === 1 ? 12 : y.m - 1, py = y.m === 1 ? y.y - 1 : y.y; return daysIn(py, pm) - x.d + y.d; }
  if (k === 'YD') {
    let st = toSerial(y.y, x.m, Math.min(x.d, daysIn(y.y, x.m)));
    if (st > e) st = toSerial(y.y - 1, x.m, Math.min(x.d, daysIn(y.y - 1, x.m)));
    return e - st;
  }
  throw E_NUM;
}

/* --- text --- */
const MAXT = 32767;
const txt = s => { if (s.length > MAXT) throw E_VAL; return s; };
/* TEXTBEFORE and TEXTAFTER: where the n-th delimiter is (from the end when n < 0) */
function delimAt(t, delims, n, ci, atEnd) {
  const hay = ci ? t.toLowerCase() : t, ds = delims.map(d => ci ? d.toLowerCase() : d);
  if (!n) throw E_VAL;
  const hits = [];
  for (let i = 0; i <= hay.length; i++) { const d = ds.find(x => x && hay.startsWith(x, i)); if (d) { hits.push([i, d.length]); i += d.length - 1; } }
  if (ds.some(d => !d)) return n > 0 ? [0, 0] : [t.length, 0];
  const k = n > 0 ? n - 1 : hits.length + n;
  if (k >= 0 && k < hits.length) return hits[k];
  if (atEnd && (k === hits.length || k === -1)) return n > 0 ? [t.length, 0] : [0, 0];
  return null;
}
const strList = v => isA(v) ? arrOf(v).d.map(x => str(x)) : [str(v)];

/* --- money: loans and savings (PMT and its family), flows of cash (NPV, IRR), things that lose their worth (SLN, DB),
   and bonds and bills. Each was measured against Excel --- */
const payAt = t => t != null && num(t) ? 1 : 0;   // payments at the start of each period (1) or at its end (0)
const growth = (r, n) => { if (r === -1 && !n) throw E_NUM; return Math.pow(1 + r, n); };
function fvOf(r, n, pmt, pv, t) { if (!r) return -(pv + pmt * n); const g = growth(r, n); return -(pv * g + pmt * (1 + r * t) * (g - 1) / r); }
function pvOf(r, n, pmt, fv, t) { if (!r) return -(fv + pmt * n); const g = growth(r, n); if (g === 0 || g === Infinity) throw E_DIV; return -(fv + pmt * (1 + r * t) * (g - 1) / r) / g; }
function pmtOf(r, n, pv, fv, t) { if (!n || r <= -1) throw E_NUM; if (!r) return -(pv + fv) / n; const g = growth(r, n); return -r * (pv * g + fv) / ((1 + r * t) * (g - 1)); }
/* the interest inside payment number per */
function ipmtOf(r, per, n, pv, fv, t) {
  if (per < 1 || per >= n + 1) throw E_NUM;
  const p = pmtOf(r, n, pv, fv, t);
  if (per === 1) return t ? 0 : -pv * r;
  return (t ? fvOf(r, per - 2, p, pv, 1) - p : fvOf(r, per - 1, p, pv, 0)) * r;
}
/* CUMIPMT and CUMPRINC: the interest (or the principal) paid in payments start to end */
function cumOf(rate, nper, pv, start, end, type, princ) {
  const r = num(rate), n = num(nper), v = num(pv), a = num(start), b = num(end), t = num(type);
  if (r <= 0 || n <= 0 || v <= 0 || a < 1 || b < 1 || a > b || b > n || (t !== 0 && t !== 1)) throw E_NUM;
  const p = pmtOf(r, n, v, 0, t);
  let sum = 0;
  for (let i = Math.ceil(a); i <= Math.trunc(b); i++) { const ip = i === 1 ? (t ? 0 : -v * r) : (t ? fvOf(r, i - 2, p, v, 1) - p : fvOf(r, i - 1, p, v, 0)) * r; sum += princ ? p - ip : ip; }
  return sum;
}
/* the x where f(x) is 0, by Newton's steps from a first guess (kept above lo); null when the steps don't settle */
function rootOf(f, guess, lo) {
  let x = guess;
  for (let i = 0; i < 100; i++) {
    const y = f(x);
    if (!Number.isFinite(y)) return null;
    if (y === 0) return x;
    const h = Math.max(Math.abs(x), 1) * 1e-7, d = (f(x + h) - f(x - h)) / (2 * h);
    if (!d || !Number.isFinite(d)) return null;
    let nx = x - y / d;
    if (lo != null && nx <= lo) nx = (x + lo) / 2;
    if (Math.abs(nx - x) <= 1e-13 * Math.max(1, Math.abs(nx))) return nx;
    x = nx;
  }
  return null;
}
/* XNPV's and XIRR's values and dates: as many of each, and all numbers. XNPV takes no date before the first (strict) */
function flows(vals, dates, strict) {
  const V = isA(vals) ? arrOf(vals).d : [vals], D = isA(dates) ? arrOf(dates).d : [dates];
  for (const x of [...V, ...D]) { if (isErr(x)) throw x; if (typeof x !== 'number') throw strict ? E_NUM : E_VAL; }
  if (V.length !== D.length) throw E_NUM;
  const d = D.map(x => Math.floor(dateNum(x)));
  if (strict && d.some(x => x < d[0])) throw E_NUM;
  return [V, d];
}
const xnpvOf = (r, v, d) => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] / Math.pow(1 + r, (d[i] - d[0]) / 365); return s; };
/* an asset's loss of worth in period p when it loses a fixed part of what is left (DDB). Before the first period is
   over, the whole first period's loss (measured) */
function ddbOf(c, s, l, p, f) {
  if (p < 1) p = 1;
  let rate = f / l, old;
  if (rate >= 1) { rate = 1; old = p === 1 ? c : 0; } else old = c * Math.pow(1 - rate, p - 1);
  const now = c * Math.pow(1 - rate, p);
  return Math.max(0, now < s ? old - s : old - now);
}
/* VDB from a to b, as Excel works it out: a fixed part of what is left each period, moving for good to a straight
   line once that would lose more. The periods are counted from where a's fraction falls: first the part of a period
   before it, then whole periods (measured: a start of 2.5 makes the move at 1.5, not at 2) */
function vdbOf(c, s, life, a, b, f) {
  const rate = f / life, f0 = a - Math.floor(a);
  let left = c, line = null, sum = 0;
  const lose = t => { if (line == null && (left - s) / (life - t) > left * rate) line = (left - s) / (life - t); return line != null ? line : Math.min(left * rate, left - s); };
  if (f0) left -= lose(0) * f0;
  for (let k = 0, t = f0; t < b; t = f0 + ++k) {
    const term = lose(t);
    sum += term * Math.max(0, Math.min(b, t + 1) - Math.max(a, t));
    left -= term;
  }
  return sum;
}
/* how Excel counts the days between two dates (basis): 0 months of 30 days the US way, 1 the real days over the real
   year, 2 real days over 360, 3 real days over 365, 4 months of 30 days the European way. Each rule here was measured
   in Excel, its oddities too */
const leapY = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const lastDay = d => d.d === daysIn(d.y, d.m);
const lastFeb = d => d.m === 2 && lastDay(d);
/* the US way: February's last day and the 31st count as the 30th (both: the end date's do whatever the start is) */
function us360(s, e, both) {
  const a = fromSerial(s), b = fromSerial(e);
  let d1 = a.d, d2 = b.d;
  if (lastFeb(b) && (lastFeb(a) || both)) d2 = 30;
  if (d2 === 31 && (d1 >= 30 || both)) d2 = 30;
  if (d1 === 31) d1 = 30;
  if (lastFeb(a)) d1 = 30;
  return (b.y - a.y) * 360 + (b.m - a.m) * 30 + d2 - d1;
}
function eu360(s, e) { const a = fromSerial(s), b = fromSerial(e); return (b.y - a.y) * 360 + (b.m - a.m) * 30 + Math.min(b.d, 30) - Math.min(a.d, 30); }
const daysBy = (s, e, basis) => basis === 0 ? us360(s, e) : basis === 4 ? eu360(s, e) : e - s;
/* the days of a year: 360 or 365 by the basis. For basis 1: 366 when the dates are within a year of each other and
   29 February falls between them (else 365), and the average length of the years they touch when further apart */
function yearBy(s, e, basis) {
  if (basis !== 1) return basis === 3 ? 365 : 360;
  const a = fromSerial(s), b = fromSerial(e);
  if (a.y === b.y) return leapY(a.y) ? 366 : 365;
  if (b.y === a.y + 1 && (a.m > b.m || (a.m === b.m && a.d >= b.d))) return (b.m === 2 && b.d === 29) || (leapY(a.y) ? a.m <= 2 : leapY(b.y) && b.m > 2) ? 366 : 365;
  return (toSerial(b.y + 1, 1, 1) - toSerial(a.y, 1, 1)) / (b.y - a.y + 1);
}
function yearFrac(s, e, basis) { if (s > e) [s, e] = [e, s]; return s === e ? 0 : daysBy(s, e, basis) / yearBy(s, e, basis); }
const day0 = v => Math.floor(dateNum(v));
const basisOf = v => { const b = v == null ? 0 : Math.trunc(num(v)); if (b < 0 || b > 4) throw E_NUM; return b; };
const freqOf = v => { const f = Math.trunc(num(v)); if (f !== 1 && f !== 2 && f !== 4) throw E_NUM; return f; };
/* a security's two dates: settlement (when it is bought) before maturity (when it is paid back) */
const twoDates = (s, m) => { const a = day0(s), b = day0(m); if (a >= b) throw E_NUM; return [a, b]; };
/* a date k months on (back when k < 0): on its month's last day when eom, else on the same day, or the last one the
   month has */
function addMonths(n, k, eom) {
  const d = fromSerial(n), t = d.y * 12 + d.m - 1 + k, y = Math.floor(t / 12), m = t - y * 12 + 1;
  return toSerial(y, m, eom ? daysIn(y, m) : Math.min(d.d, daysIn(y, m)));
}
/* a bond's coupon dates are counted back from maturity, freq times a year; when maturity is its month's last day, so
   is each of them. The dates around settlement (pcd on or before it, ncd after it), and how many coupons are to come */
function coupons(settle, mat, freq) {
  const eom = lastDay(fromSerial(mat)), at = k => addMonths(mat, -k * 12 / freq, eom), a = fromSerial(settle), b = fromSerial(mat);
  let k = Math.max(1, Math.floor(((b.y - a.y) * 12 + b.m - a.m) * freq / 12) - 1);
  while (at(k) > settle) k++;
  while (k > 1 && at(k - 1) <= settle) k--;
  return { pcd: at(k), ncd: at(k - 1), n: k };
}
/* COUPDAYS: the days of the coupon period settlement is in. Basis 1 counts real days, and where coupon dates fall on
   the ends of months Excel's count is not always the days between COUPPCD and COUPNCD. Measured there, the closest
   walk is this one: back from maturity's day in the year of settlement, a month's last day staying a month's last day
   from one step to the next; and from a settlement that is a coupon date, up to its own day 12 / freq months on */
function coupDays(settle, mat, freq, basis) {
  if (basis !== 1) return (basis === 3 ? 365 : 360) / freq;
  const S = fromSerial(settle), M = fromSerial(mat), step = 12 / freq, at = y => toSerial(y, M.m, Math.min(M.d, daysIn(y, M.m)));
  let cur = at(S.y) < settle ? at(S.y + 1) : at(S.y), next = null;
  while (cur > settle) { next = cur; cur = addMonths(cur, -step, lastDay(fromSerial(cur))); }
  return (next == null || cur === settle ? addMonths(cur, step, false) : next) - cur;
}
/* what a bond's price is made of: n coupons to come, E the days of the coupon period (the real ones between its two
   coupon dates for basis 1), A the days of it that are gone */
function coupParts(a, b, fr, basis) { const c = coupons(a, b, fr); return { n: c.n, E: basis === 1 ? c.ncd - c.pcd : (basis === 3 ? 365 : 360) / fr, A: daysBy(c.pcd, a, basis), pcd: c.pcd, ncd: c.ncd }; }
function priceOf(a, b, rate, yld, red, fr, basis) {
  const { n, E, A } = coupParts(a, b, fr, basis), c = 100 * rate / fr, y = 1 + yld / fr, x = (E - A) / E;
  if (n === 1) return (c + red) / (1 + x * yld / fr) - c * A / E;
  let p = red / Math.pow(y, n - 1 + x) - c * A / E;
  for (let k = 0; k < n; k++) p += c / Math.pow(y, k + x);
  return p;
}
function durOf(a, b, cpn, yld, fr, basis) {
  const { n, E, A } = coupParts(a, b, fr, basis), c = 100 * cpn / fr, y = 1 + yld / fr, x = (E - A) / E;
  let top = 0, all = 0;
  for (let k = 1; k <= n; k++) { const t = k - 1 + x, v = (c + (k === n ? 100 : 0)) / Math.pow(y, t); top += t * v; all += v; }
  return top / all / fr;
}
/* ACCRINT the way Excel has it: the time from the issue to settlement is counted through "quasi-coupon" periods that
   run from the first interest date, back and on. A whole period counts 1 (and 0 when method is FALSE); the part at
   the issue counts its days over the days of its period, and the part up to settlement its days over the days of the
   period before the first interest date */
function accrOf(issue, first, settle, rate, par, freq, basis, method) {
  const months = 12 / freq, eom = lastDay(fromSerial(first)), back = n => addMonths(n, -months, eom);
  let q = back(first);   // the quasi-coupon date the last part starts from: the one before the first interest date,
  const len = basis === 1 ? first - q : (basis === 3 ? 365 : 360) / freq;   // whose period's length serves that part
  if (settle > first && method) { q = first; for (let nx = addMonths(q, months, eom); nx < settle; nx = addMonths(q, months, eom)) q = nx; }
  let a = daysBy(Math.max(issue, q), settle, basis) / len;
  for (let late = q; late > issue;) {
    const early = back(late);
    if (issue <= early) a += method ? 1 : 0;
    else a += daysBy(issue, late, basis) / (basis === 3 ? 365 / freq : basis === 4 ? eu360(early, late) : basis === 1 ? late - early : us360(early, late, true));
    late = early;
  }
  return par * rate / freq * a;
}
/* ODDLPRICE and ODDLYIELD: a last period of another length, cut into quasi-coupon periods from the last interest date */
function oddLast(settle, mat, last, rate, v, red, freq, basis, price) {
  const months = 12 / freq, nc = coupons(last, mat, freq).n;
  const len = (s, e) => Math.max(0, basis === 0 ? us360(s, e, true) : daysBy(s, e, basis)), days = (s, e) => Math.max(0, daysBy(s, e, basis));
  let early = last, dcnl = 0, anl = 0, dscnl = 0;
  for (let i = 1; i <= nc; i++) {
    const late = addMonths(early, months, false), nl = len(early, late), dci = i === nc ? len(early, mat) : nl;
    dcnl += dci / nl;
    anl += (late < settle ? dci : early < settle ? days(early, settle) : 0) / nl;
    dscnl += days(Math.max(settle, early), Math.min(mat, late)) / nl;
    early = late;
  }
  const x = 100 * rate / freq, t = dcnl * x + red;
  return price ? t / (dscnl * v / freq + 1) - anl * x : (t - (anl * x + v)) / (anl * x + v) * freq / dscnl;
}
/* ODDFPRICE: a first period of another length. A short one is a part of one coupon period; a long one is cut into
   quasi-coupon periods back from the first coupon date */
function oddFirst(settle, mat, issue, first, rate, yld, red, freq, basis) {
  const months = 12 / freq, E = coupParts(settle, first, freq, basis).E, c = 100 * rate / freq, x = 1 + yld / freq;
  const days = (s, e) => Math.max(0, daysBy(s, e, basis)), dfc = days(issue, first);
  if (dfc < E) {
    const n = coupons(settle, mat, freq).n, y = days(settle, first) / E;
    let p = red / Math.pow(x, n - 1 + y) + c * dfc / E / Math.pow(x, y) - c * days(issue, settle) / E;
    for (let k = 2; k <= n; k++) p += c / Math.pow(x, k - 1 + y);
    return p;
  }
  const nc = coupons(issue, first, freq).n;
  let late = first, dcnl = 0, anl = 0;
  for (let i = nc; i >= 1; i--) {
    const early = addMonths(late, -months, false), nl = basis === 1 ? days(early, late) : E;
    dcnl += (i > 1 ? nl : days(issue, late)) / nl;
    anl += days(Math.max(issue, early), Math.min(settle, late)) / nl;
    late = early;
  }
  const cp = coupons(settle, first, freq), dsc = basis === 2 || basis === 3 ? days(settle, cp.ncd) : E - daysBy(cp.pcd, settle, basis);
  let nq = 0;   // the whole quasi-coupon periods between settlement and the first coupon
  for (let d = addMonths(settle, months, false); d < first; d = addMonths(d, months, false)) nq++;
  const n = coupons(first, mat, freq).n, y = dsc / E;
  let p = red / Math.pow(x, y + nq + n) + c * dcnl / Math.pow(x, nq + y) - c * anl;
  for (let k = 1; k <= n; k++) p += c / Math.pow(x, k + nq + y);
  return p;
}
/* AMORLINC's and AMORDEGRC's first period: the part of a year from the purchase to the end of the first period (a
   purchase on that very day counts a whole year) */
function amorFirst(cost, bought, first, salvage, rate, basis) {
  const fix = n => { const d = fromSerial(n); return (basis === 1 || basis === 3) && leapY(d.y) && d.m === 2 && d.d >= 28 ? toSerial(d.y, 2, 28) : n; };
  const year = basis === 1 ? (leapY(fromSerial(bought).y) ? 366 : 365) : basis === 3 ? 365 : 360;
  const part = daysBy(fix(bought), fix(first), basis) / year * rate * cost;
  return { first: Math.min(part || cost * rate, cost - salvage), whole: !part };
}
/* a bill of the US Treasury: paid back within a year */
function bill(s, m) { const [a, b] = twoDates(s, m), d = fromSerial(a); if (b > toSerial(d.y + 1, d.m, d.d)) throw E_NUM; return b - a; }
/* the functions that came from Excel's Analysis ToolPak take no TRUE or FALSE where a number goes (flag: the one
   argument that is a TRUE or FALSE; noBool: for the ones that take any number of arguments) */
const noBool = args => { valsOf(args, v => { if (typeof v === 'boolean') throw E_VAL; }); return args; };
const fa = (lo, hi, kinds, fn, flag = -1) => fx(lo, hi, kinds, (...v) => { v.forEach((x, i) => { if (typeof x === 'boolean' && i !== flag) throw E_VAL; }); return fn(...v); });

/* the functions: n is how many arguments each takes. Each gets its arguments unworked, and works them out itself */
const FUNCS = {
  // math
  SUM: { n: [1, 255], f: a => { const n = numsOf(a); return isErr(n) ? n : sumOf(n); } },
  PRODUCT: { n: [1, 255], f: a => { const n = nums(a); let p = 1; for (const x of n) p *= x; return n.length ? p : 0; } },
  SUMSQ: { n: [1, 255], f: a => { let s = 0; for (const x of nums(a)) s += x * x; return s; } },
  SUMPRODUCT: { n: [1, 255], f: a => {
    const arrs = a.map(x => arrOf(argA(x))), { h, w } = arrs[0];
    if (arrs.some(A => A.h !== h || A.w !== w)) return E_VAL;
    let s = 0;
    for (let i = 0; i < h * w; i++) { let p = 1; for (const A of arrs) { const x = A.d[i]; if (isErr(x)) return x; p *= typeof x === 'number' ? x : 0; } s += p; }
    return s;
  } },
  SUMIF: fx(2, 3, 'ava', (r, c, sr) => { const x = ifsCells([[r, c]]); return sumOf(numsAt(sr == null ? r : sameSize(sr, r), x.out)); }),
  SUMIFS: fx(3, 255, i => i && i % 2 === 0 ? 'v' : 'a', (sr, ...rest) => { const p = pairsOf(rest, 0); if (dims(sr).join() !== dims(p[0][0]).join()) throw E_VAL; return sumOf(numsAt(sr, ifsCells(p).out)); }),
  ROUND: fx(2, 2, 'v', (x, d) => roundTo(num(x), num(d), 0)),
  ROUNDUP: fx(2, 2, 'v', (x, d) => roundTo(num(x), num(d), 1)),
  ROUNDDOWN: fx(2, 2, 'v', (x, d) => roundTo(num(x), num(d), -1)),
  TRUNC: fx(1, 2, 'v', (x, d) => roundTo(num(x), d == null ? 0 : num(d), -1)),
  INT: fx(1, 1, 'v', x => Math.floor(q15(num(x)))),
  ABS: fx(1, 1, 'v', x => Math.abs(num(x))),
  SIGN: fx(1, 1, 'v', x => Math.sign(num(x))),
  MOD: fx(2, 2, 'v', (x, d) => { const a = num(x), b = num(d); if (!b) throw E_DIV; const r = a - b * Math.floor(q15(a / b)); return Math.abs(r) < Math.abs(b) * 1e-15 ? 0 : r; }),
  QUOTIENT: fa(2, 2, 'v', (x, d) => { const b = num(d); if (!b) throw E_DIV; return Math.trunc(q15(num(x) / b)); }),
  POWER: fx(2, 2, 'v', (x, y) => { const r = binop('^', x, y); if (isErr(r)) throw r; return r; }),
  SQRT: fx(1, 1, 'v', x => { const n = num(x); if (n < 0) throw E_NUM; return Math.sqrt(n); }),
  EXP: fx(1, 1, 'v', x => Math.exp(num(x))),
  LN: fx(1, 1, 'v', x => { const n = num(x); if (n <= 0) throw E_NUM; return Math.log(n); }),
  LOG: fx(1, 2, 'v', (x, b) => { const n = num(x), k = b === undefined ? 10 : num(b); if (n <= 0 || k <= 0) throw E_NUM; if (k === 1) throw E_DIV; return q15(Math.log(n) / Math.log(k)); }),
  LOG10: fx(1, 1, 'v', x => { const n = num(x); if (n <= 0) throw E_NUM; return Math.log10(n); }),
  PI: { n: [0, 0], f: () => Math.PI },
  CEILING: fx(2, 2, 'v', (x, s) => { const n = num(x), k = num(s); if (!k) return 0; if (n > 0 && k < 0) throw E_NUM; return Math.ceil(q15(n / k)) * k; }),
  FLOOR: fx(2, 2, 'v', (x, s) => { const n = num(x), k = num(s); if (!k) { if (!n) return 0; throw E_DIV; } if (n > 0 && k < 0) throw E_NUM; return Math.floor(q15(n / k)) * k; }),
  'CEILING.MATH': fx(1, 3, 'v', (x, s, m) => { const n = num(x), k = Math.abs(s == null ? 1 : num(s)); if (!k) return 0; return n < 0 && m != null && num(m) ? -Math.ceil(q15(-n / k)) * k : Math.ceil(q15(n / k)) * k; }),
  'FLOOR.MATH': fx(1, 3, 'v', (x, s, m) => { const n = num(x), k = Math.abs(s == null ? 1 : num(s)); if (!k) return 0; return n < 0 && m != null && num(m) ? -Math.floor(q15(-n / k)) * k : Math.floor(q15(n / k)) * k; }),
  MROUND: fa(2, 2, 'v', (x, s) => { const n = num(x), k = num(s); if (!k) return 0; if (n * k < 0) throw E_NUM; return roundTo(n / k, 0, 0) * k; }),
  EVEN: fx(1, 1, 'v', x => { const n = num(x), a = Math.ceil(q15(Math.abs(n) / 2)) * 2; return n < 0 ? -a : a; }),
  ODD: fx(1, 1, 'v', x => { const n = num(x); let a = Math.ceil(q15(Math.abs(n))); if (a % 2 === 0) a++; return n < 0 ? -a : a; }),
  FACT: fx(1, 1, 'v', x => { const n = Math.trunc(num(x)); if (n < 0) throw E_NUM; let p = 1; for (let i = 2; i <= n; i++) p *= i; return p; }),
  COMBIN: fx(2, 2, 'v', (x, y) => { const n = Math.trunc(num(x)), k = Math.trunc(num(y)); if (n < 0 || k < 0 || k > n) throw E_NUM; let p = 1; for (let i = 1; i <= k; i++) p = p * (n - k + i) / i; return Math.round(p); }),
  GCD: { n: [1, 255], f: a => { const n = nums(noBool(a)).map(Math.trunc); if (n.some(x => x < 0)) return E_NUM; const g = (x, y) => y ? g(y, x % y) : x; return n.reduce(g, 0); } },
  LCM: { n: [1, 255], f: a => { const n = nums(noBool(a)).map(Math.trunc); if (n.some(x => x < 0)) return E_NUM; if (n.some(x => !x)) return 0; const g = (x, y) => y ? g(y, x % y) : x; return n.reduce((l, x) => l / g(l, x) * x, 1); } },
  RAND: { n: [0, 0], f: () => Math.random() },
  RANDBETWEEN: fa(2, 2, 'v', (a, b) => { const lo = Math.ceil(num(a)), hi = Math.floor(num(b)); if (lo > hi) throw E_NUM; return lo + Math.floor(Math.random() * (hi - lo + 1)); }),
  SIN: fx(1, 1, 'v', x => Math.sin(num(x))),
  COS: fx(1, 1, 'v', x => Math.cos(num(x))),
  TAN: fx(1, 1, 'v', x => Math.tan(num(x))),
  ASIN: fx(1, 1, 'v', x => { const n = num(x); if (Math.abs(n) > 1) throw E_NUM; return Math.asin(n); }),
  ACOS: fx(1, 1, 'v', x => { const n = num(x); if (Math.abs(n) > 1) throw E_NUM; return Math.acos(n); }),
  ATAN: fx(1, 1, 'v', x => Math.atan(num(x))),
  ATAN2: fx(2, 2, 'v', (x, y) => { const a = num(x), b = num(y); if (!a && !b) throw E_DIV; return Math.atan2(b, a); }),
  RADIANS: fx(1, 1, 'v', x => num(x) * Math.PI / 180),
  DEGREES: fx(1, 1, 'v', x => num(x) * 180 / Math.PI),
  SEQUENCE: fx(1, 4, 'v', (r, c, s, st) => {
    const h = Math.trunc(num(r)), w = c == null ? 1 : Math.trunc(num(c)), a = s == null ? 1 : num(s), k = st == null ? 1 : num(st);
    if (h < 1 || w < 1) throw E_CALC;
    if (h * w > 1e6) throw E_NUM;
    return mkArr(h, w, Array.from({ length: h * w }, (_, i) => q15(a + i * k)));
  }, { dyn: true }),
  SUBTOTAL: { n: [2, 255], f: a => {
    const k = Math.trunc(num(argS(a[0]))), fn = k > 100 ? k - 100 : k;
    if (fn < 1 || fn > 11) return E_VAL;
    SUBT = true;
    const n = [];
    let all = 0;
    for (const x of a.slice(1)) {
      const v = argA(x);
      if (!v || !v.rng) return E_VAL;
      const { s } = v;
      const e = eachIn(v, (val, r, c) => {
        if ((s._fh && s._fh.has(r)) || (k > 100 && s.hr.has(r))) return;
        const cell = s.cells.get(KEY(r, c));
        if (cell && cell.f && /SUBTOTAL\s*\(/i.test(cell.f)) return;   // other subtotals aren't counted twice
        if (isErr(val)) return val;
        all++;
        if (typeof val === 'number') n.push(val);
      });
      if (e) return e;
    }
    switch (fn) {
      case 1: return n.length ? sumOf(n) / n.length : E_DIV;
      case 2: return n.length;
      case 3: return all;
      case 4: return n.length ? Math.max(...n) : 0;
      case 5: return n.length ? Math.min(...n) : 0;
      case 6: return n.length ? n.reduce((p, x) => p * x, 1) : 0;
      case 7: return Math.sqrt(varOf(n));
      case 8: return Math.sqrt(varOf(n, true));
      case 9: return sumOf(n);
      case 10: return varOf(n);
      default: return varOf(n, true);
    }
  } },
  // statistics
  AVERAGE: { n: [1, 255], f: a => { const n = numsOf(a); return isErr(n) ? n : n.length ? sumOf(n) / n.length : E_DIV; } },
  AVERAGEIF: fx(2, 3, 'ava', (r, c, ar) => { const n = numsAt(ar == null ? r : sameSize(ar, r), ifsCells([[r, c]]).out); if (!n.length) throw E_DIV; return sumOf(n) / n.length; }),
  AVERAGEIFS: fx(3, 255, i => i && i % 2 === 0 ? 'v' : 'a', (ar, ...rest) => { const p = pairsOf(rest, 0); if (dims(ar).join() !== dims(p[0][0]).join()) throw E_VAL; const n = numsAt(ar, ifsCells(p).out); if (!n.length) throw E_DIV; return sumOf(n) / n.length; }),
  COUNT: { n: [1, 255], f: a => numsOf(a, true).length },
  COUNTA: { n: [1, 255], f: a => { let n = 0; for (const x of a) { if (x.t === 'miss') { n++; continue; } const v = argA(x); if (isA(v)) eachV(v, () => { n++; }); else n++; } return n; } },
  COUNTBLANK: fx(1, 1, 'a', r => { if (!isA(r)) throw E_VAL; const [h, w] = dims(r); let full = 0; eachV(r, v => { if (v !== '') full++; }); return h * w - full; }),
  COUNTIF: fx(2, 2, 'av', (r, c) => { const n = isA(r) ? cmpCount(arrOf(r), c) : undefined; if (n !== undefined) return n; const x = ifsCells([[r, c]]); return x.out.length + (x.restOk ? x.rest : 0); }),
  COUNTIFS: fx(2, 255, i => i % 2 ? 'v' : 'a', (...a) => { const x = ifsCells(pairsOf(a, 0)); return x.out.length + (x.restOk ? x.rest : 0); }),
  MAX: { n: [1, 255], f: a => { const n = numsOf(a); if (isErr(n)) return n; let m = -Infinity; for (const x of n) if (x > m) m = x; return n.length ? m : 0; } },
  MIN: { n: [1, 255], f: a => { const n = numsOf(a); if (isErr(n)) return n; let m = Infinity; for (const x of n) if (x < m) m = x; return n.length ? m : 0; } },
  MAXIFS: fx(3, 255, i => i && i % 2 === 0 ? 'v' : 'a', (mr, ...rest) => { const p = pairsOf(rest, 0); if (dims(mr).join() !== dims(p[0][0]).join()) throw E_VAL; const n = numsAt(mr, ifsCells(p).out); return n.length ? Math.max(...n) : 0; }),
  MINIFS: fx(3, 255, i => i && i % 2 === 0 ? 'v' : 'a', (mr, ...rest) => { const p = pairsOf(rest, 0); if (dims(mr).join() !== dims(p[0][0]).join()) throw E_VAL; const n = numsAt(mr, ifsCells(p).out); return n.length ? Math.min(...n) : 0; }),
  MEDIAN: { n: [1, 255], f: a => { const n = sorted(nums(a)), k = n.length; if (!k) return E_NUM; return k % 2 ? n[(k - 1) / 2] : (n[k / 2 - 1] + n[k / 2]) / 2; } },
  MODE: { n: [1, 255], f: a => modeOf(nums(a)) },
  'MODE.SNGL': { n: [1, 255], f: a => modeOf(nums(a)) },
  LARGE: fx(2, 2, 'av', (r, k) => { const n = sorted(numsIn(r)), i = Math.ceil(q15(num(k))); if (i < 1 || i > n.length) throw E_NUM; return n[n.length - i]; }),
  SMALL: fx(2, 2, 'av', (r, k) => { const n = sorted(numsIn(r)), i = Math.ceil(q15(num(k))); if (i < 1 || i > n.length) throw E_NUM; return n[i - 1]; }),
  RANK: fx(2, 3, 'vav', (x, r, o) => rankOf(x, r, o)),
  'RANK.EQ': fx(2, 3, 'vav', (x, r, o) => rankOf(x, r, o)),
  'RANK.AVG': fx(2, 3, 'vav', (x, r, o) => rankOf(x, r, o, true)),
  STDEV: { n: [1, 255], f: a => Math.sqrt(varOf(nums(a))) },
  'STDEV.S': { n: [1, 255], f: a => Math.sqrt(varOf(nums(a))) },
  STDEVP: { n: [1, 255], f: a => Math.sqrt(varOf(nums(a), true)) },
  'STDEV.P': { n: [1, 255], f: a => Math.sqrt(varOf(nums(a), true)) },
  VAR: { n: [1, 255], f: a => varOf(nums(a)) },
  'VAR.S': { n: [1, 255], f: a => varOf(nums(a)) },
  VARP: { n: [1, 255], f: a => varOf(nums(a), true) },
  'VAR.P': { n: [1, 255], f: a => varOf(nums(a), true) },
  PERCENTILE: fx(2, 2, 'av', (r, k) => pctl(numsIn(r), num(k))),
  'PERCENTILE.INC': fx(2, 2, 'av', (r, k) => pctl(numsIn(r), num(k))),
  QUARTILE: fx(2, 2, 'av', (r, q) => { const k = Math.trunc(num(q)); if (k < 0 || k > 4) throw E_NUM; return pctl(numsIn(r), k / 4); }),
  'QUARTILE.INC': fx(2, 2, 'av', (r, q) => { const k = Math.trunc(num(q)); if (k < 0 || k > 4) throw E_NUM; return pctl(numsIn(r), k / 4); }),
  // logic
  IF: { n: [2, 3], f: (a, keep) => {
    const c = argS(a[0]);
    if (isA(c)) {   // a condition for each place: the answers are picked place by place
      const t = a[1].t === 'miss' ? 0 : argS(a[1]), e = !a[2] ? false : a[2].t === 'miss' ? 0 : argS(a[2]);
      return mapArr([c, t, e], ([x, y, z]) => { const b = toBool(x); return isErr(b) ? b : b ? zero(y) : zero(z); });
    }
    const b = toBool(c);
    if (isErr(b)) return b;
    const pick = b ? a[1] : a[2];
    if (!pick) return false;
    return pick.t === 'miss' ? 0 : keep ? refOf(pick) : ev(pick);
  } },
  // names for values inside one formula, and functions of one's own
  LET: { n: [3, 253], f: (a, keep) => {
    if (a.length % 2 === 0) return E_VAL;
    const was = ENV, names = new Map();
    ENV = { names, up: was };
    try {
      for (let i = 0; i + 1 < a.length; i += 2) {
        if (a[i].t !== 'name' || a[i].sheet != null) return E_VAL;
        names.set(a[i].n.toLowerCase(), a[i + 1].t === 'miss' ? null : argA(a[i + 1]));   // each value may use the names before it
      }
      const last = a[a.length - 1];
      return keep ? refOf(last) : ev(last);
    } finally { ENV = was; }
  } },
  LAMBDA: { n: [1, 254], f: a => {
    const params = [], seen = new Set();
    for (const x of a.slice(0, -1)) {
      if (!((x.t === 'name' && x.sheet == null) || x.t === 'opt')) return E_VAL;
      const k = x.n.toLowerCase();
      if (seen.has(k)) return E_VAL;
      seen.add(k); params.push({ k, opt: x.t === 'opt', s: x.n });
    }
    return { lam: true, params, body: a[a.length - 1], env: ENV, off: OFF };
  } },
  ISOMITTED: { n: [1, 1], f: a => a[0].t === 'name' && a[0].sheet == null && !!ENV && envGet(a[0].n) === OMITTED },
  MAP: { n: [2, 254], dyn: true, f: a => {
    const f = lamOf(a[a.length - 1]), src = a.slice(0, -1).map(x => placesIn(argA(x)));
    const h = Math.max(...src.map(p => p.h)), w = Math.max(...src.map(p => p.w)), d = new Array(h * w);
    if (h * w > 1e6) return E_NUM;
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) { const vals = src.map(p => p.at(i, j)); d[i * w + j] = vals.includes(MISS) ? E_NA : oneV(applyLam(f, vals)); }
    return mkArr(h, w, d);
  } },
  REDUCE: { n: [3, 3], f: a => {
    const f = lamOf(a[2]), p = placesIn(argA(a[1])), n = p.h * p.w;
    let acc, k = 0;
    if (a[0].t === 'miss') { if (!n) return E_CALC; acc = p.at(0, 0); k = 1; } else acc = argA(a[0]);   // with no first value, the array's first one starts
    for (; k < n; k++) acc = applyLam(f, [acc, p.at(Math.floor(k / p.w), k % p.w)]);
    return acc;
  } },
  SCAN: { n: [3, 3], dyn: true, f: a => {
    const f = lamOf(a[2]), p = placesIn(argA(a[1])), n = p.h * p.w, d = new Array(n);
    let acc, k = 0;
    if (a[0].t === 'miss') { if (!n) return E_CALC; acc = p.at(0, 0); d[0] = oneV(acc); k = 1; } else acc = argA(a[0]);
    for (; k < n; k++) { acc = applyLam(f, [acc, p.at(Math.floor(k / p.w), k % p.w)]); d[k] = oneV(acc); }
    return mkArr(p.h, p.w, d);
  } },
  BYROW: { n: [2, 2], dyn: true, f: a => { const f = lamOf(a[1]), p = placesIn(argA(a[0])); return mkArr(p.h, 1, Array.from({ length: p.h }, (_, i) => oneV(applyLam(f, [p.row(i)])))); } },
  BYCOL: { n: [2, 2], dyn: true, f: a => { const f = lamOf(a[1]), p = placesIn(argA(a[0])); return mkArr(1, p.w, Array.from({ length: p.w }, (_, j) => oneV(applyLam(f, [p.col(j)])))); } },
  MAKEARRAY: { n: [3, 3], dyn: true, f: a => {
    const h = Math.trunc(num(argS(a[0]))), w = Math.trunc(num(argS(a[1]))), f = lamOf(a[2]);
    if (h < 1 || w < 1) return E_VAL;
    if (h * w > 1e6) return E_NUM;
    return mkArr(h, w, Array.from({ length: h * w }, (_, k) => oneV(applyLam(f, [Math.floor(k / w) + 1, k % w + 1]))));
  } },
  IFS: fx(2, 254, 'v', (...v) => { if (v.length % 2) throw E_VAL; for (let i = 0; i < v.length; i += 2) if (bool(v[i])) return zero(v[i + 1]); throw E_NA; }),
  IFERROR: { n: [2, 2], f: a => ifErr(a, isErr) },
  IFNA: { n: [2, 2], f: a => ifErr(a, x => x === E_NA) },
  AND: { n: [1, 255], f: a => logicals(a).every(Boolean) },
  OR: { n: [1, 255], f: a => logicals(a).some(Boolean) },
  XOR: { n: [1, 255], f: a => logicals(a).filter(Boolean).length % 2 === 1 },
  NOT: fx(1, 1, 'v', x => !bool(x)),
  SWITCH: fx(3, 254, 'v', (x, ...v) => {
    if (isErr(x)) throw x;
    for (let i = 0; i + 1 < v.length; i += 2) if (!isErr(v[i]) && kindOf(x) === kindOf(v[i]) && cmp3(zero(v[i]), zero(x)) === 0) return zero(v[i + 1]);
    if (v.length % 2) return zero(v[v.length - 1]);
    throw E_NA;
  }),
  TRUE: { n: [0, 0], f: () => true },
  FALSE: { n: [0, 0], f: () => false },
  // text
  CONCATENATE: fx(1, 255, 'v', (...v) => txt(v.map(str).join(''))),
  CONCAT: { n: [1, 254], f: a => { let s = ''; valsOf(a, v => { s += str(v); }); return txt(s); } },
  TEXTJOIN: { n: [3, 254], f: a => {
    const ds = strList(argA(a[0])), skip = bool(argS(a[1])), parts = [];
    valsOf(a.slice(2), v => { const t = str(v); if (!(skip && t === '')) parts.push(t); });
    let s = '';
    parts.forEach((p, i) => { if (i) s += ds.length ? ds[(i - 1) % ds.length] : ''; s += p; });
    return txt(s);
  } },
  LEFT: fx(1, 2, 'v', (t, n) => { const k = n == null ? (n === null ? 0 : 1) : Math.trunc(num(n)); if (k < 0) throw E_VAL; return str(t).slice(0, k); }),
  RIGHT: fx(1, 2, 'v', (t, n) => { const k = n == null ? (n === null ? 0 : 1) : Math.trunc(num(n)), s = str(t); if (k < 0) throw E_VAL; return k ? s.slice(-k) : ''; }),
  MID: fx(3, 3, 'v', (t, a, n) => { const s = str(t), i = Math.trunc(num(a)), k = Math.trunc(num(n)); if (i < 1 || k < 0) throw E_VAL; return s.substr(i - 1, k); }),
  LEN: fx(1, 1, 'v', t => str(t).length),
  UPPER: fx(1, 1, 'v', t => str(t).toUpperCase()),
  LOWER: fx(1, 1, 'v', t => str(t).toLowerCase()),
  PROPER: fx(1, 1, 'v', t => str(t).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (m, p, ch) => p + ch.toUpperCase())),
  TRIM: fx(1, 1, 'v', t => str(t).replace(/ {2,}/g, ' ').replace(/^ | $/g, '')),
  CLEAN: fx(1, 1, 'v', t => str(t).replace(/[\x00-\x1f]/g, '')),
  SUBSTITUTE: fx(3, 4, 'v', (t, o, nw, k) => {
    const s = str(t), old = str(o), rep = str(nw);
    if (!old) return s;
    if (k == null) return txt(s.split(old).join(rep));
    const n = Math.trunc(num(k));
    if (n < 1) throw E_VAL;
    let i = -1;
    for (let j = 0; j < n; j++) { i = s.indexOf(old, i + 1); if (i < 0) return s; }
    return txt(s.slice(0, i) + rep + s.slice(i + old.length));
  }),
  REPLACE: fx(4, 4, 'v', (t, a, n, nw) => { const s = str(t), i = Math.trunc(num(a)), k = Math.trunc(num(n)); if (i < 1 || k < 0) throw E_VAL; return txt(s.slice(0, i - 1) + str(nw) + s.slice(i - 1 + k)); }),
  FIND: fx(2, 3, 'v', (f, t, a) => { const w = str(f), s = str(t), i = a == null ? 1 : Math.trunc(num(a)); if (i < 1 || i > s.length + 1) throw E_VAL; const p = s.indexOf(w, i - 1); if (p < 0) throw E_VAL; return p + 1; }),
  SEARCH: fx(2, 3, 'v', (f, t, a) => {
    const w = str(f), s = str(t), i = a == null ? 1 : Math.trunc(num(a));
    if (i < 1 || i > s.length + 1) throw E_VAL;
    if (!w) return i;
    const m = wildRe(w, false).exec(s.slice(i - 1));
    if (!m) throw E_VAL;
    return m.index + i;
  }),
  TEXT: fx(2, 2, 'v', (v, f) => {
    if (isErr(v)) throw v;
    const code = str(f);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    const n = typeof v === 'number' ? v : v == null ? 0 : typeof v === 'string' ? numLike(v) : null;
    if (n == null) return fmtText(v, code).t;
    const r = fmtNumber(n, code);
    if (r.t == null) throw E_VAL;
    return r.t;
  }),
  VALUE: fx(1, 1, 'v', v => { if (typeof v === 'number') return v; if (typeof v === 'boolean') throw E_VAL; if (v == null) return 0; if (isErr(v)) throw v; const n = numLike(v); if (n == null) throw E_VAL; return n; }),
  REPT: fx(2, 2, 'v', (t, n) => { const k = Math.trunc(num(n)), s = str(t); if (k < 0 || s.length * k > MAXT) throw E_VAL; return s.repeat(k); }),
  EXACT: fx(2, 2, 'v', (a, b) => str(a) === str(b)),
  CHAR: fx(1, 1, 'v', n => { const k = Math.trunc(num(n)); if (k < 1 || k > 255) throw E_VAL; return String.fromCharCode(k); }),
  CODE: fx(1, 1, 'v', t => { const s = str(t); if (!s) throw E_VAL; return s.charCodeAt(0); }),
  UNICHAR: fx(1, 1, 'v', n => { const k = Math.trunc(num(n)); if (k < 1 || k > 0x10ffff || (k >= 0xd800 && k <= 0xdfff)) throw E_VAL; return String.fromCodePoint(k); }),
  UNICODE: fx(1, 1, 'v', t => { const s = str(t); if (!s) throw E_VAL; return s.codePointAt(0); }),
  T: fx(1, 1, 'v', v => { if (isErr(v)) throw v; return typeof v === 'string' ? v : ''; }),
  N: fx(1, 1, 'v', v => { if (isErr(v)) throw v; return typeof v === 'number' ? v : v === true ? 1 : 0; }),
  TEXTBEFORE: fx(2, 6, 'vavvvv', (t, d, n, m, e, nf) => textAround(t, d, n, m, e, nf, true)),
  TEXTAFTER: fx(2, 6, 'vavvvv', (t, d, n, m, e, nf) => textAround(t, d, n, m, e, nf, false)),
  TEXTSPLIT: fx(2, 6, 'vaavva', (t, cd, rd, ig, m, pad) => {
    const s = str(t), ci = m != null && num(m) === 1, cols = cd == null ? [] : strList(cd).filter(Boolean), rows = rd == null ? [] : strList(rd).filter(Boolean);
    if (!cols.length && !rows.length) throw E_VAL;
    const split = (x, ds) => { if (!ds.length) return [x]; const re = new RegExp(ds.map(reEsc).join('|'), ci ? 'gi' : 'g'); let p = x.split(re); if (ig != null && bool(ig)) p = p.filter(Boolean); return p; };
    const grid = split(s, rows).map(r => split(r, cols)), w = Math.max(...grid.map(r => r.length)), fill = pad === undefined ? E_NA : isA(pad) ? scal(pad) : pad;
    return mkArr(grid.length, w, grid.flatMap(r => Array.from({ length: w }, (_, j) => j < r.length ? r[j] : fill)));
  }, { dyn: true }),
  // dates and times
  TODAY: { n: [0, 0], f: () => todaySerial() },
  NOW: { n: [0, 0], f: () => { const d = new Date(); return toSerial(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()); } },
  DATE: fx(3, 3, 'v', (y, m, d) => {
    let Y = Math.trunc(num(y));
    if (Y < 0 || Y > 9999) throw E_NUM;
    if (Y < 1900) Y += 1900;
    const t = new Date(Date.UTC(Y, Math.trunc(num(m)) - 1, 1) + (Math.trunc(num(d)) - 1) * DAY);   // months and days past the end roll over
    const n = toSerial(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    if (n < 0 || t.getUTCFullYear() > 9999) throw E_NUM;
    return n;
  }),
  TIME: fx(3, 3, 'v', (h, m, s) => { const t = Math.trunc(num(h)) * 3600 + Math.trunc(num(m)) * 60 + Math.trunc(num(s)); if (t < 0) throw E_NUM; return (t % 86400) / 86400; }),
  YEAR: fx(1, 1, 'v', v => ymd(v).y),
  MONTH: fx(1, 1, 'v', v => ymd(v).m),
  DAY: fx(1, 1, 'v', v => ymd(v).d),
  HOUR: fx(1, 1, 'v', v => Math.floor(secsOf(dateNum(v)) / 3600)),
  MINUTE: fx(1, 1, 'v', v => Math.floor(secsOf(dateNum(v)) % 3600 / 60)),
  SECOND: fx(1, 1, 'v', v => secsOf(dateNum(v)) % 60),
  WEEKDAY: fx(1, 2, 'v', (v, t) => {
    const d = dowOf(dateNum(v)), k = t == null ? 1 : Math.trunc(num(t));
    if (k === 1 || k === 17) return d + 1;
    if (k === 2 || k === 11) return (d + 6) % 7 + 1;
    if (k === 3) return (d + 6) % 7;
    if (k >= 12 && k <= 16) return (d - (k - 10) + 7) % 7 + 1;
    throw E_NUM;
  }),
  WEEKNUM: fa(1, 2, 'v', (v, t) => {
    const n = Math.floor(dateNum(v)), k = t == null ? 1 : Math.trunc(num(t));
    if (k === 21) return isoWeek(n);
    const first = k === 1 || k === 17 ? 0 : k === 2 || k === 11 ? 1 : k >= 12 && k <= 16 ? k - 10 : -1;
    if (first < 0) throw E_NUM;
    const jan1 = toSerial(fromSerial(n).y, 1, 1);
    return Math.floor((n - jan1 + (dowOf(jan1) - first + 7) % 7) / 7) + 1;
  }),
  ISOWEEKNUM: fx(1, 1, 'v', v => isoWeek(dateNum(v))),
  DATEDIF: fx(3, 3, 'v', datedif),
  DAYS: fx(2, 2, 'v', (e, s) => Math.floor(dateNum(e)) - Math.floor(dateNum(s))),
  EDATE: fa(2, 2, 'v', (v, k) => monthsOn(v, k, false)),
  EOMONTH: fa(2, 2, 'v', (v, k) => monthsOn(v, k, true)),
  NETWORKDAYS: fa(2, 3, 'vva', (a, b, h) => workdays(a, b, weekendOf(1), holidaySet(h))),
  'NETWORKDAYS.INTL': fx(2, 4, 'vvva', (a, b, w, h) => workdays(a, b, weekendOf(w), holidaySet(h))),
  WORKDAY: fa(2, 3, 'vva', (a, k, h) => workday(a, k, weekendOf(1), holidaySet(h))),
  'WORKDAY.INTL': fx(2, 4, 'vvva', (a, k, w, h) => workday(a, k, weekendOf(w), holidaySet(h))),
  DATEVALUE: fx(1, 1, 'v', v => Math.floor(dateOfText(v))),
  TIMEVALUE: fx(1, 1, 'v', v => { const n = dateOfText(v); return n - Math.floor(n); }),
  YEARFRAC: fa(2, 3, 'v', (s, e, b) => yearFrac(day0(s), day0(e), basisOf(b))),
  DAYS360: fx(2, 3, 'v', (s, e, m) => {
    const x = day0(s), y = day0(e);
    if (m != null && bool(m)) return eu360(x, y);
    // the US way here: a start on its month's last day is the 30th; an end on the 31st is the 30th too, or the 1st of
    // the next month when the start is before the 30th
    const a = fromSerial(x), b = fromSerial(y);
    let d1 = a.d, d2 = b.d, m2 = b.m;
    if (lastDay(a)) d1 = 30;
    if (d2 === 31) { if (d1 < 30) { d2 = 1; m2++; } else d2 = 30; }
    return (b.y - a.y) * 360 + (m2 - a.m) * 30 + d2 - d1;
  }),
  // money
  PV: fx(3, 5, 'v', (r, n, p, f, t) => pvOf(num(r), num(n), num(p), f == null ? 0 : num(f), payAt(t))),
  FV: fx(3, 5, 'v', (r, n, p, v, t) => fvOf(num(r), num(n), num(p), v == null ? 0 : num(v), payAt(t))),
  PMT: fx(3, 5, 'v', (r, n, v, f, t) => pmtOf(num(r), num(n), num(v), f == null ? 0 : num(f), payAt(t))),
  NPER: fx(3, 5, 'v', (rate, pmt, pv, fv, type) => {
    const r = num(rate), p = num(pmt), v = num(pv), f = fv == null ? 0 : num(fv), t = payAt(type);
    if (!r) { if (!p) throw E_DIV; return -(v + f) / p; }
    const q = (p * (1 + r * t) - f * r) / (p * (1 + r * t) + v * r);
    if (r <= -1 || !(q > 0)) throw E_NUM;
    return Math.log(q) / Math.log(1 + r);
  }),
  RATE: fx(3, 6, 'v', (nper, pmt, pv, fv, type, guess) => {
    const n = num(nper), p = num(pmt), v = num(pv), f = fv == null ? 0 : num(fv), t = payAt(type);
    if (n <= 0) throw E_NUM;
    const r = rootOf(x => { if (Math.abs(x) < 1e-10) return v + p * n + f; const g = Math.expm1(n * Math.log1p(x)); return v * (g + 1) + p * (1 + x * t) * g / x + f; }, guess == null ? 0.1 : num(guess), -1);
    if (r == null) throw E_NUM;
    return r;
  }),
  IPMT: fx(4, 6, 'v', (r, per, n, v, f, t) => ipmtOf(num(r), num(per), num(n), num(v), f == null ? 0 : num(f), payAt(t))),
  PPMT: fx(4, 6, 'v', (r, per, n, v, f, t) => { const R = num(r), N = num(n), V = num(v), F = f == null ? 0 : num(f), T = payAt(t); return pmtOf(R, N, V, F, T) - ipmtOf(R, num(per), N, V, F, T); }),
  ISPMT: fx(4, 4, 'v', (r, per, n, v) => { const N = num(n); if (!N) throw E_DIV; return num(v) * num(r) * (num(per) / N - 1); }),
  CUMIPMT: fa(6, 6, 'v', (r, n, v, s, e, t) => cumOf(r, n, v, s, e, t, false)),
  CUMPRINC: fa(6, 6, 'v', (r, n, v, s, e, t) => cumOf(r, n, v, s, e, t, true)),
  NPV: { n: [2, 255], f: a => {
    const r = num(scalR(argS(a[0]))), v = nums(a.slice(1));
    if (r === -1) return E_DIV;
    let s = 0, d = 1;
    for (const x of v) { d *= 1 + r; s += x / d; }
    return s;
  } },
  IRR: fx(1, 2, 'av', (vals, guess) => {
    const v = numsIn(vals);
    if (!v.some(x => x > 0) || !v.some(x => x < 0)) throw E_NUM;
    const r = rootOf(x => { let s = 0, d = 1; for (const y of v) { s += y / d; d *= 1 + x; } return s; }, guess == null ? 0.1 : num(guess), -1);
    if (r == null) throw E_NUM;
    return r;
  }),
  MIRR: fx(3, 3, 'avv', (vals, fr, rr) => {
    const v = numsIn(vals), f = num(fr), r = num(rr), n = v.length;
    let pos = 0, neg = 0;
    v.forEach((x, i) => { if (x > 0) pos += x / Math.pow(1 + r, i); else neg += x / Math.pow(1 + f, i); });
    if (!neg || n < 2) throw E_DIV;   // nothing paid in: no rate. Nothing paid out is -100%, as Excel has it
    return Math.pow(-pos * Math.pow(1 + r, n - 1) / neg, 1 / (n - 1)) - 1;
  }),
  XNPV: fa(3, 3, 'vaa', (rate, vals, dates) => { const r = num(rate), [v, d] = flows(vals, dates, true); if (r <= 0) throw E_NUM; return xnpvOf(r, v, d); }),
  XIRR: fa(2, 3, 'aav', (vals, dates, guess) => {
    const [v, d] = flows(vals, dates, false), g = guess == null ? 0.1 : num(guess);
    if (g <= -1 || !v.some(x => x > 0) || !v.some(x => x < 0)) throw E_NUM;
    const r = rootOf(x => xnpvOf(x, v, d), g, -1);
    if (r == null) throw E_NUM;
    return r;
  }),
  SLN: fx(3, 3, 'v', (c, s, l) => { const life = num(l); if (!life) throw E_DIV; return (num(c) - num(s)) / life; }),
  SYD: fx(4, 4, 'v', (cost, salvage, life, per) => {
    const c = num(cost), s = num(salvage), l = num(life), p = num(per);
    if (s < 0 || l <= 0 || p <= 0 || p > l) throw E_NUM;
    return (c - s) * (l - p + 1) * 2 / (l * (l + 1));
  }),
  DB: fx(4, 5, 'v', (cost, salvage, life, period, month) => {
    const c = num(cost), s = num(salvage), l = num(life), p = num(period), m = month == null ? 12 : Math.trunc(num(month));
    if (c < 0 || s < 0 || l <= 0 || p <= 0 || m < 1 || m > 12 || p > l + (m < 12 ? 1 : 0)) throw E_NUM;
    if (!c) return 0;
    const rate = roundTo(1 - Math.pow(s / c, 1 / l), 3, 0);
    let total = 0, d = c * rate * m / 12;
    for (let i = 2; i <= p; i++) { total += d; d = (c - total) * rate * (i > l ? (12 - m) / 12 : 1); }
    return d;
  }),
  DDB: fx(4, 5, 'v', (cost, salvage, life, period, factor) => {
    const c = num(cost), s = num(salvage), l = num(life), p = num(period), f = factor == null ? 2 : num(factor);
    if (c < 0 || s < 0 || l <= 0 || p <= 0 || p > l || f <= 0) throw E_NUM;
    return ddbOf(c, s, l, p, f);
  }),
  VDB: fx(5, 7, 'v', (cost, salvage, life, start, end, factor, noSwitch) => {
    const c = num(cost), s = num(salvage), l = num(life), a = num(start), b = num(end), f = factor == null ? 2 : num(factor);
    if (c < 0 || s < 0 || l <= 0 || a < 0 || b < a || b > l || f <= 0) throw E_NUM;
    if (noSwitch != null && bool(noSwitch)) {
      const a0 = Math.floor(q15(a)), b0 = Math.ceil(q15(b));
      let sum = 0;
      for (let i = a0 + 1; i <= b0; i++) {
        let term = ddbOf(c, s, l, i, f);
        if (i === a0 + 1) term *= Math.min(b, a0 + 1) - a;
        else if (i === b0) term *= b + 1 - b0;
        sum += term;
      }
      return sum;
    }
    return vdbOf(c, s, l, a, b, f);
  }),
  AMORLINC: fa(6, 7, 'v', (cost, bought, first, salvage, period, rate, bs) => {
    const c = num(cost), s = num(salvage), per = num(period), r = num(rate), basis = basisOf(bs), d = day0(bought), f1 = day0(first);
    if (c <= 0 || s < 0 || s > c || per < 0 || r <= 0 || d > f1 || basis === 2) throw E_NUM;
    if (c === s || per > Math.ceil(1 / r)) return 0;
    const f = amorFirst(c, d, f1, s, r, basis).first;
    if (per < 1) return per ? r * c : f;
    let depr = r * c, left = c - s - f;
    for (let i = 1; i <= per; i++) { depr = Math.min(depr, left); left = Math.max(0, left - depr); }
    return depr;
  }),
  AMORDEGRC: fa(6, 7, 'v', (cost, bought, first, salvage, period, rate, bs) => {
    const c = num(cost), s = num(salvage), per = num(period), r = num(rate), basis = basisOf(bs), d = day0(bought), f1 = day0(first);
    if (c <= 0 || s < 0 || s > c || per < 0 || r <= 0 || d > f1 || basis === 2) throw E_NUM;
    const life = Math.ceil(1 / r);
    if (life < 3) throw E_NUM;
    if (c === s || per > life) return 0;
    // the rate grows with the life, and the last two periods take half of what is left each
    let k = r * (life >= 3 && life <= 4 ? 1.5 : life >= 5 && life <= 6 ? 2 : life > 6 ? 2.5 : 1);
    const f = amorFirst(c, d, f1, s, k, basis), all = f.whole ? life : life + 1, n0 = roundTo(f.first, 0, 0);
    if (per < 1) return n0;
    let left = c - n0, depr = 0;
    for (let i = 1; i <= per; i++) {
      const half = all - (i + 1) === 2, now = half ? left * 0.5 : k * left;
      if (half) k = 1;
      depr = left < s ? 0 : now;
      left -= depr;
    }
    return roundTo(depr, 0, 0);
  }),
  EFFECT: fa(2, 2, 'v', (rate, npery) => { const r = num(rate), n = Math.trunc(num(npery)); if (r <= 0 || n < 1) throw E_NUM; return Math.pow(1 + r / n, n) - 1; }),
  NOMINAL: fa(2, 2, 'v', (rate, npery) => { const r = num(rate), n = Math.trunc(num(npery)); if (r <= 0 || n < 1) throw E_NUM; return (Math.pow(r + 1, 1 / n) - 1) * n; }),
  FVSCHEDULE: fa(2, 2, 'va', (p, sch) => {
    let v = num(p);
    for (const x of isA(sch) ? arrOf(sch).d : [sch]) { if (x == null) continue; if (isErr(x)) throw x; if (typeof x !== 'number') throw E_VAL; v *= 1 + x; }
    return v;
  }),
  PDURATION: fx(3, 3, 'v', (rate, pv, fv) => { const r = num(rate), p = num(pv), f = num(fv); if (r <= 0 || p <= 0 || f <= 0) throw E_NUM; return (Math.log(f) - Math.log(p)) / Math.log(1 + r); }),
  RRI: fx(3, 3, 'v', (nper, pv, fv) => { const n = num(nper), p = num(pv), f = num(fv); if (n <= 0 || !p || f / p < 0) throw E_NUM; return Math.pow(f / p, 1 / n) - 1; }),
  DOLLARDE: fa(2, 2, 'v', (d, fr) => { const x = num(d), f = Math.trunc(num(fr)); if (f < 0) throw E_NUM; if (!f) throw E_DIV; const i = Math.trunc(x); return i + (x - i) * Math.pow(10, Math.ceil(Math.log10(f))) / f; }),
  DOLLARFR: fa(2, 2, 'v', (d, fr) => { const x = num(d), f = Math.trunc(num(fr)); if (f < 0) throw E_NUM; if (!f) throw E_DIV; const i = Math.trunc(x); return i + (x - i) * f / Math.pow(10, Math.ceil(Math.log10(f))); }),
  TBILLPRICE: fa(3, 3, 'v', (s, m, d) => { const days = bill(s, m), r = num(d); if (r <= 0) throw E_NUM; const p = 100 * (1 - r * days / 360); if (p < 0) throw E_NUM; return p; }),
  TBILLYIELD: fa(3, 3, 'v', (s, m, pr) => { const days = bill(s, m), p = num(pr); if (p <= 0) throw E_NUM; return (100 - p) / p * 360 / days; }),
  TBILLEQ: fa(3, 3, 'v', (s, m, d) => {
    const days = bill(s, m), r = num(d);
    if (r <= 0) throw E_NUM;
    if (days <= 182) return 365 * r / (360 - r * days);
    const p = 1 - r * days / 360, x = days / (days === 366 ? 366 : 365);   // over half a year, the interest is counted twice
    return (-2 * x + 2 * Math.sqrt(x * x - (2 * x - 1) * (1 - 1 / p))) / (2 * x - 1);
  }),
  DISC: fa(4, 5, 'v', (s, m, pr, red, bs) => { const [a, b] = twoDates(s, m), p = num(pr), r = num(red); if (p <= 0 || r <= 0) throw E_NUM; return (1 - p / r) / yearFrac(a, b, basisOf(bs)); }),
  INTRATE: fa(4, 5, 'v', (s, m, inv, red, bs) => { const [a, b] = twoDates(s, m), i = num(inv), r = num(red); if (i <= 0 || r <= 0) throw E_NUM; return (r - i) / i / yearFrac(a, b, basisOf(bs)); }),
  RECEIVED: fa(4, 5, 'v', (s, m, inv, disc, bs) => { const [a, b] = twoDates(s, m), i = num(inv), d = num(disc); if (i <= 0 || d <= 0) throw E_NUM; const k = 1 - d * yearFrac(a, b, basisOf(bs)); if (k <= 0) throw E_NUM; return i / k; }),
  PRICEDISC: fa(4, 5, 'v', (s, m, disc, red, bs) => { const [a, b] = twoDates(s, m), d = num(disc), r = num(red); if (d <= 0 || r <= 0) throw E_NUM; return r * (1 - d * yearFrac(a, b, basisOf(bs))); }),
  YIELDDISC: fa(4, 5, 'v', (s, m, pr, red, bs) => { const [a, b] = twoDates(s, m), p = num(pr), r = num(red); if (p <= 0 || r <= 0) throw E_NUM; return (r / p - 1) / yearFrac(a, b, basisOf(bs)); }),
  // a security that pays its interest at maturity: one year's length (by issue and settlement) serves all three times
  PRICEMAT: fa(5, 6, 'v', (s, m, iss, rate, yld, bs) => {
    const [a, b] = twoDates(s, m), i = day0(iss), r = num(rate), y = num(yld), basis = basisOf(bs);
    if (r < 0 || y < 0 || i >= a) throw E_NUM;
    const B = yearBy(i, a, basis), dim = daysBy(i, b, basis), A = daysBy(i, a, basis);
    return (100 + dim / B * r * 100) / (1 + (dim - A) / B * y) - A / B * r * 100;
  }),
  YIELDMAT: fa(5, 6, 'v', (s, m, iss, rate, pr, bs) => {
    const [a, b] = twoDates(s, m), i = day0(iss), r = num(rate), p = num(pr), basis = basisOf(bs);
    if (r < 0 || p <= 0 || i >= a) throw E_NUM;
    const B = yearBy(i, a, basis), dim = daysBy(i, b, basis), A = daysBy(i, a, basis);
    return (dim / B * r + 1 - p / 100 - A / B * r) / (p / 100 + A / B * r) * B / (dim - A);
  }),
  ACCRINTM: fa(4, 5, 'v', (iss, s, rate, par, bs) => { const [a, b] = twoDates(iss, s), r = num(rate), p = par == null ? 1000 : num(par); if (r <= 0 || p <= 0) throw E_NUM; return p * r * yearFrac(a, b, basisOf(bs)); }),
  ACCRINT: fa(6, 8, 'v', (iss, first, settle, rate, par, freq, bs, method) => {
    const [i, s] = twoDates(iss, settle), f1 = day0(first), r = num(rate), p = par == null ? 1000 : num(par), fr = freqOf(freq), basis = basisOf(bs);
    if (r <= 0 || p <= 0) throw E_NUM;
    return accrOf(i, f1, s, r, p, fr, basis, method == null || bool(method));
  }, 7),
  COUPPCD: fa(3, 4, 'v', (s, m, f, bs) => { const [a, b] = twoDates(s, m), fr = freqOf(f); basisOf(bs); return coupons(a, b, fr).pcd; }),
  COUPNCD: fa(3, 4, 'v', (s, m, f, bs) => { const [a, b] = twoDates(s, m), fr = freqOf(f); basisOf(bs); return coupons(a, b, fr).ncd; }),
  COUPNUM: fa(3, 4, 'v', (s, m, f, bs) => { const [a, b] = twoDates(s, m), fr = freqOf(f); basisOf(bs); return coupons(a, b, fr).n; }),
  COUPDAYBS: fa(3, 4, 'v', (s, m, f, bs) => { const [a, b] = twoDates(s, m); return coupParts(a, b, freqOf(f), basisOf(bs)).A; }),
  COUPDAYS: fa(3, 4, 'v', (s, m, f, bs) => { const [a, b] = twoDates(s, m); return coupDays(a, b, freqOf(f), basisOf(bs)); }),
  COUPDAYSNC: fa(3, 4, 'v', (s, m, f, bs) => { const [a, b] = twoDates(s, m), basis = basisOf(bs), p = coupParts(a, b, freqOf(f), basis); return basis ? daysBy(a, p.ncd, basis) : p.pcd === a ? us360(a, p.ncd, true) : p.E - p.A; }),
  PRICE: fa(6, 7, 'v', (s, m, rate, yld, red, f, bs) => {
    const [a, b] = twoDates(s, m), r = num(rate), y = num(yld), rd = num(red);
    if (r < 0 || y < 0 || rd <= 0) throw E_NUM;
    return priceOf(a, b, r, y, rd, freqOf(f), basisOf(bs));
  }),
  YIELD: fa(6, 7, 'v', (s, m, rate, pr, red, f, bs) => {
    const [a, b] = twoDates(s, m), r = num(rate), p = num(pr), rd = num(red), fr = freqOf(f), basis = basisOf(bs);
    if (r < 0 || p <= 0 || rd <= 0) throw E_NUM;
    const c = coupons(a, b, fr);
    if (c.n === 1) {   // one coupon left: no search is needed. Here bases 1 to 3 all count the real days (measured)
      const real = basis > 0 && basis < 4, E = real ? c.ncd - c.pcd : 360 / fr, A = real ? a - c.pcd : daysBy(c.pcd, a, basis), k = p / 100 + A / E * r / fr;
      return ((rd / 100 + r / fr) - k) / k * fr * E / daysBy(a, b, basis);
    }
    const y = rootOf(x => priceOf(a, b, r, x, rd, fr, basis) - p, r || 0.1, -fr);
    if (y == null) throw E_NUM;
    return y;
  }),
  DURATION: fa(5, 6, 'v', (s, m, cpn, yld, f, bs) => { const [a, b] = twoDates(s, m), c = num(cpn), y = num(yld); if (c < 0 || y < 0) throw E_NUM; return durOf(a, b, c, y, freqOf(f), basisOf(bs)); }),
  MDURATION: fa(5, 6, 'v', (s, m, cpn, yld, f, bs) => { const [a, b] = twoDates(s, m), c = num(cpn), y = num(yld), fr = freqOf(f); if (c < 0 || y < 0) throw E_NUM; return durOf(a, b, c, y, fr, basisOf(bs)) / (1 + y / fr); }),
  ODDLPRICE: fa(7, 8, 'v', (s, m, last, rate, yld, red, f, bs) => {
    const [a, b] = twoDates(s, m), l = day0(last), r = num(rate), y = num(yld), rd = num(red);
    if (r < 0 || y < 0 || rd <= 0 || l >= a) throw E_NUM;
    return oddLast(a, b, l, r, y, rd, freqOf(f), basisOf(bs), true);
  }),
  ODDLYIELD: fa(7, 8, 'v', (s, m, last, rate, pr, red, f, bs) => {
    const [a, b] = twoDates(s, m), l = day0(last), r = num(rate), p = num(pr), rd = num(red);
    if (r < 0 || p <= 0 || rd <= 0 || l >= a) throw E_NUM;
    return oddLast(a, b, l, r, p, rd, freqOf(f), basisOf(bs), false);
  }),
  ODDFPRICE: fa(8, 9, 'v', (s, m, iss, first, rate, yld, red, f, bs) => {
    const [a, b] = twoDates(s, m), i = day0(iss), f1 = day0(first), r = num(rate), y = num(yld), rd = num(red);
    const fr = freqOf(f);
    if (r < 0 || y < 0 || rd <= 0 || !(b > f1 && f1 > a && a > i) || coupons(f1, b, fr).pcd !== f1) throw E_NUM;
    return oddFirst(a, b, i, f1, r, y, rd, fr, basisOf(bs));
  }),
  ODDFYIELD: fa(8, 9, 'v', (s, m, iss, first, rate, pr, red, f, bs) => {
    const [a, b] = twoDates(s, m), i = day0(iss), f1 = day0(first), r = num(rate), p = num(pr), rd = num(red), fr = freqOf(f), basis = basisOf(bs);
    if (r < 0 || p <= 0 || rd <= 0 || !(b > f1 && f1 > a && a > i) || coupons(f1, b, fr).pcd !== f1) throw E_NUM;
    const y = rootOf(x => oddFirst(a, b, i, f1, r, x, rd, fr, basis) - p, r || 0.1, -fr);
    if (y == null) throw E_NUM;
    return y;
  }),
  // finding values, and references
  VLOOKUP: fx(3, 4, 'vavv', (x, t, c, ap) => lookIn(x, t, c, ap, false)),
  HLOOKUP: fx(3, 4, 'vavv', (x, t, r, ap) => lookIn(x, t, r, ap, true)),
  LOOKUP: fx(2, 3, 'vaa', (x, lv, rv) => {
    let L = lv, R = rv;
    if (R == null) {   // one table: search its first row (when wider than tall) or column, answer from the last
      const [h, w] = dims(lv);
      if (w > h) { L = lineOf(lv, 0, false); R = lineOf(lv, h - 1, false); } else { L = lineOf(lv, 0, true); R = lineOf(lv, w - 1, true); }
    }
    const i = sortedPos(arrOf(L).d, x, false);
    if (i < 0) throw E_NA;
    const B = arrOf(R);
    if (i >= B.d.length) throw E_NA;
    return zero(B.d[i]);
  }),
  MATCH: fx(2, 3, 'vav', (x, arr, t) => {
    const A = arrOf(arr);
    if (A.h > 1 && A.w > 1) throw E_NA;
    const k = t === undefined ? 1 : num(t), i = k === 0 ? findExact(A.d, x, true) : sortedPos(A.d, x, k < 0);
    if (i < 0) throw E_NA;
    return i + 1;
  }),
  XMATCH: fx(2, 4, 'vavv', (x, arr, m, s) => {
    const A = arrOf(arr);
    if (A.h > 1 && A.w > 1) throw E_VAL;
    const i = xfind(A.d, x, m == null ? 0 : Math.trunc(num(m)), s == null ? 1 : Math.trunc(num(s)));
    if (i < 0) throw E_NA;
    return i + 1;
  }),
  XLOOKUP: (() => {
    const look = fx(3, 6, 'vaaavv', (x, look, ret, nf, m, s) => {
      const L = arrOf(look);
      if (L.h > 1 && L.w > 1) throw E_VAL;
      const across = L.h === 1 && L.w > 1, [rh, rw] = dims(ret);
      if (across ? rw !== dims(look)[1] : rh !== dims(look)[0]) throw E_VAL;
      const i = xfind(L.d, x, m == null ? 0 : Math.trunc(num(m)), s == null ? 1 : Math.trunc(num(s)));
      if (i < 0) { if (nf !== undefined) return nf == null ? 0 : nf; throw E_NA; }
      const out = lineOf(ret, i, across), [h, w] = dims(out);
      return h * w === 1 && !(XKEEP && out.rng) ? zero(scal(out)) : out;
    });
    // beside the : it answers with the cell it found, as a reference: SUM(XLOOKUP(...):XLOOKUP(...))
    return { n: look.n, f: (a, keep) => { XKEEP = !!keep; try { return look.f(a); } finally { XKEEP = false; } } };
  })(),
  // INDEX answers with a reference. The cells it gives aren't the ones written in it (the whole range it looks in is
  // not read, only what it picks), so they are kept for the order of the next pass, like INDIRECT's and OFFSET's
  INDEX: { n: [2, 4], f: a => {
    const src = argA(a[0]);
    if (isErr(src)) return src;
    const rv = a[1].t === 'miss' ? null : argS(a[1]), cv = a.length > 2 && a[2].t !== 'miss' ? argS(a[2]) : null;
    if (isA(rv) || isA(cv)) {
      if (src.rng) pointsAt(src);
      return mapArr([rv, cv], ([r, c]) => { try { return zero(scal(indexOf(src, r, c, a.length))); } catch (e) { if (e instanceof Err) return e; throw e; } });
    }
    const out = indexOf(src, rv, cv, a.length);
    if (out && out.rng) pointsAt(out);
    return out;
  } },
  CHOOSE: { n: [2, 255], f: (a, keep) => {
    const k = argS(a[0]);
    if (isA(k)) { const opts = a.slice(1).map(x => x.t === 'miss' ? 0 : argS(x)); return mapArr([k, ...opts], ([i, ...o]) => { const j = Math.trunc(toNum(i)); return isErr(j) ? j : j >= 1 && j <= o.length ? zero(o[j - 1]) : E_VAL; }); }
    const j = Math.trunc(num(k));
    if (j < 1 || j >= a.length) return E_VAL;
    return a[j].t === 'miss' ? 0 : keep ? refOf(a[j]) : ev(a[j]);
  } },
  ROW: { n: [0, 1], f: a => rowCol(a, true) },
  COLUMN: { n: [0, 1], f: a => rowCol(a, false) },
  AREAS: { n: [1, 1], f: a => { const v = refOf(a[0]); return isErr(v) ? v : v && v.rng ? 1 : E_VAL; } },   // one: an address here is always one block
  ROWS: fx(1, 1, 'a', v => { if (isErr(v)) throw v; return dims(v)[0]; }),
  COLUMNS: fx(1, 1, 'a', v => { if (isErr(v)) throw v; return dims(v)[1]; }),
  ADDRESS: fx(2, 5, 'v', (r, c, ab, a1, sh) => {
    const R = Math.trunc(num(r)), C = Math.trunc(num(c)), k = ab == null ? 1 : Math.trunc(num(ab));
    if (R < 1 || C < 1 || R > MAXR || C > MAXC || k < 1 || k > 4) throw E_VAL;
    const t = a1 != null && !bool(a1) ? (k === 1 || k === 2 ? 'R' + R : 'R[' + R + ']') + (k === 1 || k === 3 ? 'C' + C : 'C[' + C + ']')
      : (k === 1 || k === 3 ? '$' : '') + colName(C - 1) + (k === 1 || k === 2 ? '$' : '') + R;
    return sh == null ? t : sheetPrefix(str(sh)) + t;
  }),
  // the cells a text names. They aren't written in the formula, so each range is kept for the order of the next pass (pointsAt)
  INDIRECT: { n: [1, 2], f: a => {
    const t = argS(a[0]), mode = a.length < 2 ? true : a[1].t === 'miss' ? false : argS(a[1]);
    const at = (x, m) => {
      if (isErr(x)) return x;
      const a1 = toBool(m);
      if (isErr(a1)) return a1;
      const rv = refOfText(toStr(x), a1);
      if (!rv) return E_REF;
      pointsAt(rv);
      return rv;
    };
    if (isA(t) || isA(mode)) return mapArr([t, mode], ([x, m]) => { const rv = at(x, m); return rv && rv.rng ? (rv.g.r1 === rv.g.r2 && rv.g.c1 === rv.g.c2 ? zero(one(rv)) : E_VAL) : rv; });
    return at(t, mode);
  } },
  // a range some rows and columns away from a reference, of its own size or of the height and width given (a minus
  // size grows up or back from that cell). Whole numbers, as Excel cuts them; off the sheet, or of no size, is #REF!
  OFFSET: { n: [3, 5], f: a => {
    const ref = argA(a[0]);
    if (isErr(ref)) return ref;
    if (!ref || !ref.rng) return E_VAL;
    const g = ref.g, n = [0, 0, g.r2 - g.r1 + 1, g.c2 - g.c1 + 1];
    for (let i = 1; i < a.length; i++) {
      if (a[i].t === 'miss') continue;
      const v = argS(a[i]);
      if (isA(v)) return E_VAL;
      const x = toNum(v);
      if (isErr(x)) return x;
      n[i - 1] = Math.trunc(x);
    }
    const [dr, dc, h, w] = n;
    if (!h || !w) return E_REF;
    const r0 = g.r1 + dr, c0 = g.c1 + dc, out = { r1: h > 0 ? r0 : r0 + h + 1, c1: w > 0 ? c0 : c0 + w + 1, r2: h > 0 ? r0 + h - 1 : r0, c2: w > 0 ? c0 + w - 1 : c0 };
    if (offSheet(out)) return E_REF;
    const rv = { rng: true, s: ref.s, g: out };
    pointsAt(rv);
    return rv;
  } },
  TRANSPOSE: fx(1, 1, 'a', v => { const A = arrOf(v); return mkArr(A.w, A.h, Array.from({ length: A.h * A.w }, (_, k) => zero(A.d[(k % A.h) * A.w + Math.floor(k / A.h)]))); }, { dyn: true }),
  FILTER: fx(2, 3, 'aaa', (arr, inc, empty) => {
    const A = arrOf(arr), I = arrOf(inc), keep = [];
    const pick = i => { const b = toBool(I.d[i]); if (isErr(b)) throw b; return b; };
    if (I.w === 1 && I.h === A.h) { for (let i = 0; i < A.h; i++) if (pick(i)) keep.push(A.d.slice(i * A.w, i * A.w + A.w)); if (keep.length) return fromRows(keep, false); }
    else if (I.h === 1 && I.w === A.w) { const cols = rowsOf(A, true); for (let j = 0; j < A.w; j++) if (pick(j)) keep.push(cols[j]); if (keep.length) return fromRows(keep, true); }
    else throw E_VAL;
    if (empty !== undefined) return empty == null ? 0 : empty;
    throw E_CALC;
  }, { dyn: true }),
  SORT: fx(1, 4, 'aaav', (arr, idx, ord, bc) => {
    const A = arrOf(arr), byCol = bc != null && bool(bc), rows = rowsOf(A, byCol);
    const keys = idx == null ? [1] : arrOf(idx).d.map(x => Math.trunc(num(x))), ords = ord == null ? [1] : arrOf(ord).d.map(x => num(x));
    const n = byCol ? A.h : A.w;
    if (keys.some(k => k < 1 || k > n) || ords.some(o => o !== 1 && o !== -1)) throw E_VAL;
    rows.sort((x, y) => { for (let i = 0; i < keys.length; i++) { const c = arrCmp(x[keys[i] - 1], y[keys[i] - 1]); if (c) return c * (ords[Math.min(i, ords.length - 1)] || 1); } return 0; });
    return fromRows(rows, byCol);
  }, { dyn: true }),
  SORTBY: { n: [2, 255], dyn: true, f: a => {
    const A = arrOf(argA(a[0])), by = [];
    for (let i = 1; i < a.length; i += 2) {
      const B = arrOf(argA(a[i])), o = i + 1 < a.length && a[i + 1].t !== 'miss' ? num(argS(a[i + 1])) : 1;
      if (o !== 1 && o !== -1) return E_VAL;
      by.push([B, o]);
    }
    const byCol = by[0][0].h === 1 && by[0][0].w > 1 && A.w === by[0][0].w;
    const n = byCol ? A.w : A.h;
    if (by.some(([B]) => (byCol ? B.h !== 1 || B.w !== n : B.w !== 1 || B.h !== n))) return E_VAL;
    const rows = rowsOf(A, byCol), order = rows.map((_, i) => i);
    order.sort((x, y) => { for (const [B, o] of by) { const c = arrCmp(B.d[x], B.d[y]); if (c) return c * o; } return x - y; });
    return fromRows(order.map(i => rows[i]), byCol);
  } },
  UNIQUE: fx(1, 3, 'avv', (arr, bc, once) => {
    const A = arrOf(arr), byCol = bc != null && bool(bc), only = once != null && bool(once), rows = rowsOf(A, byCol), groups = [];
    for (const r of rows) { const g = groups.find(x => x.r.length === r.length && x.r.every((v, i) => sameVal(v, r[i]))); if (g) g.n++; else groups.push({ r, n: 1 }); }
    return fromRows(groups.filter(g => !only || g.n === 1).map(g => g.r), byCol);
  }, { dyn: true }),
  // information
  ISBLANK: fx(1, 1, 'v', v => v == null),
  ISNUMBER: fx(1, 1, 'v', v => typeof v === 'number'),
  ISTEXT: fx(1, 1, 'v', v => typeof v === 'string'),
  ISNONTEXT: fx(1, 1, 'v', v => typeof v !== 'string'),
  ISLOGICAL: fx(1, 1, 'v', v => typeof v === 'boolean'),
  ISERROR: fx(1, 1, 'v', v => isErr(v)),
  ISERR: fx(1, 1, 'v', v => isErr(v) && v !== E_NA),
  ISNA: fx(1, 1, 'v', v => v === E_NA),
  ISEVEN: fx(1, 1, 'v', v => { if (typeof v === 'boolean') throw E_VAL; return Math.trunc(num(v)) % 2 === 0; }),
  ISODD: fx(1, 1, 'v', v => { if (typeof v === 'boolean') throw E_VAL; return Math.abs(Math.trunc(num(v))) % 2 === 1; }),
  ISREF: { n: [1, 1], f: a => { const v = refOf(a[0]); return !!v && v.rng === true; } },
  GETPIVOTDATA: { n: [2, 254], f: a => getPivotData(a) },
  HYPERLINK: fx(1, 2, 'v', (loc, name) => { CTX.link = str(loc); return name === undefined ? CTX.link : name ?? 0; }),   // without a name it shows the address as text
  ISFORMULA: fx(1, 1, 'a', r => { if (!r || !r.rng) throw E_VAL; const x = r.s.cells.get(KEY(r.g.r1, r.g.c1)); return !!(x && x.f != null); }),
  NA: { n: [0, 0], f: () => E_NA },
  'ERROR.TYPE': fx(1, 1, 'v', v => { if (!isErr(v)) throw E_NA; return { '#NULL!': 1, '#DIV/0!': 2, '#VALUE!': 3, '#REF!': 4, '#NAME?': 5, '#NUM!': 6, '#N/A': 7, '#SPILL!': 9, '#CALC!': 14 }[v.c]; }),
  TYPE: { n: [1, 1], f: a => { const v = argA(a[0]); if (isLam(v)) return 128; if (isA(v)) { const [h, w] = dims(v); if (h * w > 1) return 64; } const x = isA(v) ? scal(v) : v; return typeof x === 'number' || x == null ? 1 : typeof x === 'string' ? 2 : typeof x === 'boolean' ? 4 : 16; } },
  // what newer Excel writes for @ and # inside its files
  SINGLE: { n: [1, 1], f: a => scal(ev(a[0])) },
  ANCHORARRAY: { n: [1, 1], f: a => a[0].t === 'ref' ? refVal({ ...a[0], sp: true }) : E_REF },
};
/* RANK: the place of x among the numbers (from the biggest, or from the smallest when order isn't 0) */
function rankOf(x, r, o, avg) {
  const v = num(x), n = numsIn(r), up = o != null && num(o) !== 0;
  let before = 0, same = 0;
  for (const y of n) { if (y === v) same++; else if (up ? y < v : y > v) before++; }
  if (!same) throw E_NA;
  return avg ? before + (same + 1) / 2 : before + 1;
}
/* VLOOKUP and HLOOKUP: find x in the first column (row) of the table, and answer from column (row) k */
function lookIn(x, t, k, ap, across) {
  const A = arrOf(t), i = Math.trunc(num(k)), [h, w] = dims(t);
  if (i < 1) throw E_VAL;
  if (i > (across ? h : w)) throw E_REF;
  let first = across ? A._r0 : A._c0;
  if (!first) { first = across ? A.d.slice(0, A.w) : col0(A); if (A.d._c) { first._c = true; if (across) A._r0 = first; else A._c0 = first; } }
  const p = (ap === undefined ? true : bool(ap)) ? sortedPos(first, x, false) : findExact(first, x, true);
  if (p < 0) throw E_NA;
  return zero(across ? (i - 1 < A.h ? A.d[(i - 1) * A.w + p] : null) : A.d[p * A.w + i - 1]);
}
/* INDEX: the cell at row r and column c of a range (0: the whole column or row) — itself a reference — or of an array */
function indexOf(src, r, c, nargs) {
  const [h, w] = dims(src);
  let R = r == null ? 0 : Math.trunc(num(r)), C = c == null ? 0 : Math.trunc(num(c));
  if (nargs === 2 && h === 1 && w > 1) { C = R; R = 0; }   // one row: the number is the column
  if (R < 0 || C < 0 || R > h || C > w) throw E_REF;
  if (src.rng) { const g = src.g; return { rng: true, s: src.s, g: { r1: R ? g.r1 + R - 1 : g.r1, r2: R ? g.r1 + R - 1 : g.r2, c1: C ? g.c1 + C - 1 : g.c1, c2: C ? g.c1 + C - 1 : g.c2 } }; }
  const A = arrOf(src);
  if (R && C) return zero(A.d[(R - 1) * A.w + C - 1]);
  if (R) return lineOf(A, R - 1, false);
  if (C) return lineOf(A, C - 1, true);
  return A;
}
function rowCol(a, isRow) {
  if (!a.length || a[0].t === 'miss') return (isRow ? CTX.r : CTX.c) + 1;
  const v = argA(a[0]);
  if (!v || !v.rng) return isErr(v) ? v : E_VAL;
  const g = v.g, lo = isRow ? g.r1 : g.c1, hi = isRow ? g.r2 : g.c2;
  if (lo === hi) return lo + 1;
  let n = hi - lo + 1;
  if (n > 1e5) n = Math.max(1, Math.min(n, (isRow ? LIMR : LIMC) - lo));   // a whole column: down to the last row in use
  const d = Array.from({ length: n }, (_, i) => lo + i + 1);
  return isRow ? mkArr(n, 1, d) : mkArr(1, n, d);
}
function ifErr(a, isIt) {
  const v = argS(a[0]);
  if (isA(v)) { const alt = argS(a[1]); return mapArr([v, alt], ([x, y]) => isIt(x) ? zero(y) : zero(x)); }
  return isIt(v) ? (a[1].t === 'miss' ? 0 : ev(a[1])) : zero(v);
}
/* AND, OR and XOR: TRUE/FALSE and numbers; text inside a reference is left out, and typed text must say TRUE or FALSE */
function logicals(a) {
  const out = [];
  valsOf(a, (v, fromRef) => {
    if (v == null) return;
    if (isErr(v)) throw v;
    if (typeof v === 'boolean') out.push(v);
    else if (typeof v === 'number') out.push(v !== 0);
    else if (!fromRef) out.push(bool(v));
  });
  if (!out.length) throw E_VAL;
  return out;
}
function textAround(t, d, n, m, e, nf, before) {
  const s = str(t), ds = strList(d), k = n == null ? 1 : Math.trunc(num(n)), ci = m != null && num(m) === 1, atEnd = e != null && num(e) === 1;
  const hit = delimAt(s, ds, k, ci, atEnd);
  if (!hit) { if (nf !== undefined) return zero(nf); throw E_NA; }
  return before ? s.slice(0, hit[0]) : s.slice(hit[0] + hit[1]);
}

/* the words the formula helper shows: each function's kind, what it does, its arguments (names from ARGN; [ ] when
   it may be left out) and an example */
const FN_CATS = [['logic', N_('לוגיות'), 'call_split'], ['text', N_('טקסט'), 'text_fields'], ['date', N_('תאריך ושעה'), 'calendar_today'],
  ['look', N_('חיפוש והפניה'), 'search'], ['math', N_('מתמטיקה'), 'calculate'], ['stat', N_('סטטיסטיקה'), 'bar_chart'], ['fin', N_('כספים'), 'payments'], ['info', N_('מידע'), 'info']];
const ARGN = {
  link_location: N_('כתובת_הקישור'), friendly_name: N_('שם_להצגה'), data_field: N_('שדה_ערכים'), pivot_table: N_('טבלת_ציר'), field: N_('שדה@arg'), item: N_('פריט@arg'),
  number: N_('מספר'), value: N_('ערך'), text: N_('טקסט'), range: N_('טווח'), criteria: N_('תנאי'), criteria_range: N_('טווח_תנאי'),
  sum_range: N_('טווח_סכום'), average_range: N_('טווח_ממוצע'), max_range: N_('טווח_מקסימום'), min_range: N_('טווח_מינימום'),
  lookup_value: N_('ערך_לחיפוש'), table_array: N_('טבלה'), col_index_num: N_('מספר_עמודה'), row_index_num: N_('מספר_שורה'), range_lookup: N_('התאמה_משוערת'),
  lookup_array: N_('מערך_חיפוש'), return_array: N_('מערך_תוצאה'), if_not_found: N_('אם_לא_נמצא'), match_mode: N_('סוג_התאמה'), search_mode: N_('כיוון_חיפוש'),
  match_type: N_('סוג_התאמה'), array: N_('מערך'), row_num: N_('מספר_שורה'), column_num: N_('מספר_עמודה'), reference: N_('הפניה'), index_num: N_('מספר_בחירה'),
  num_digits: N_('ספרות'), significance: N_('כפולה'), divisor: N_('מחלק'), power: N_('חזקה'), base: N_('בסיס'), k: N_('מקום'), order: N_('סדר'),
  ref: N_('טווח'), bottom: N_('מספר_נמוך'), top: N_('מספר_גבוה'), rows: N_('שורות@arg'), columns: N_('עמודות@arg'), start: N_('התחלה'), step: N_('קפיצה'),
  include: N_('תנאי_הכללה'), if_empty: N_('אם_ריק'), sort_index: N_('עמודת_מיון'), sort_order: N_('סדר_מיון'), by_col: N_('לפי_עמודות'), by_array: N_('מערך_מיון'),
  exactly_once: N_('רק_פעם_אחת'), delimiter: N_('מפריד'), ignore_empty: N_('לדלג_על_ריקים'), start_num: N_('מיקום_התחלה'), num_chars: N_('מספר_תווים'),
  old_text: N_('טקסט_ישן'), new_text: N_('טקסט_חדש'), instance_num: N_('מופע'), find_text: N_('טקסט_לחיפוש'), within_text: N_('בתוך_טקסט'),
  format_text: N_('תבנית'), number_times: N_('מספר_פעמים'), year: N_('שנה'), month: N_('חודש'), day: N_('יום'), hour: N_('שעה'), minute: N_('דקה'),
  second: N_('שנייה'), serial_number: N_('תאריך'), return_type: N_('סוג_החזרה'), start_date: N_('תאריך_התחלה'), end_date: N_('תאריך_סיום'),
  unit: N_('יחידה'), months: N_('חודשים'), days: N_('ימים'), holidays: N_('חגים'), weekend: N_('סוף_שבוע'), date_text: N_('תאריך_כטקסט'),
  time_text: N_('שעה_כטקסט'), logical: N_('תנאי'), logical_test: N_('תנאי'), value_if_true: N_('אם_נכון'), value_if_false: N_('אם_לא_נכון'),
  value_if_error: N_('אם_שגיאה'), value_if_na: N_('אם_לא_נמצא'), expression: N_('ביטוי'), result: N_('תוצאה'), default: N_('ברירת_מחדל'),
  x_num: N_('x'), y_num: N_('y'), angle: N_('זווית'), quart: N_('רבעון'), function_num: N_('מספר_פונקציה'), number_chosen: N_('מספר_נבחרים'),
  col_delimiter: N_('מפריד_עמודות'), row_delimiter: N_('מפריד_שורות'), pad_with: N_('מילוי'), match_end: N_('סוף_כמפריד'), mode: N_('כיוון'),
  row: N_('שורה'), column: N_('עמודה'), abs_num: N_('סוג_כתובת'), a1: N_('סגנון_A1'), sheet_text: N_('שם_גיליון'), error_val: N_('שגיאה'), times: N_('פעמים'),
  ref_text: N_('כתובת_כטקסט'), cols: N_('עמודות@arg'), height: N_('גובה@arg'), width: N_('רוחב@arg'),
  rate: N_('ריבית'), nper: N_('מספר_תשלומים'), pmt: N_('תשלום'), pv: N_('ערך_נוכחי'), fv: N_('ערך_עתידי'), type: N_('סוג_תשלום'), per: N_('תקופה'), period: N_('תקופה'),
  guess: N_('ניחוש'), values: N_('ערכים@arg'), dates: N_('תאריכים@arg'), finance_rate: N_('ריבית_מימון'), reinvest_rate: N_('ריבית_השקעה_מחדש'), cost: N_('עלות'),
  salvage: N_('ערך_גרט'), life: N_('אורך_חיים'), factor: N_('מקדם'), start_period: N_('תקופת_התחלה'), end_period: N_('תקופת_סיום'), no_switch: N_('בלי_מעבר'),
  nominal_rate: N_('ריבית_נקובה'), effect_rate: N_('ריבית_אפקטיבית'), npery: N_('תקופות_בשנה'), principal: N_('קרן'), schedule: N_('לוח_ריביות'),
  fractional_dollar: N_('מחיר_בשבר'), decimal_dollar: N_('מחיר_עשרוני'), fraction: N_('מכנה'), settlement: N_('סליקה'), maturity: N_('פדיון'), discount: N_('ניכיון'),
  pr: N_('מחיר'), redemption: N_('ערך_פדיון'), basis: N_('בסיס_ימים'), investment: N_('השקעה'), issue: N_('הנפקה'), yld: N_('תשואה'), first_interest: N_('ריבית_ראשונה'),
  par: N_('ערך_נקוב'), frequency: N_('תשלומים_בשנה'), calc_method: N_('שיטת_חישוב'), coupon: N_('קופון'), first_coupon: N_('קופון_ראשון'),
  last_interest: N_('ריבית_אחרונה'), date_purchased: N_('תאריך_רכישה'), first_period: N_('תקופה_ראשונה'), method: N_('שיטה'),
  name: N_('שם@arg'), name_value: N_('ערך_השם'), calculation_or_name: N_('חישוב_או_שם'), parameter_or_calculation: N_('פרמטר_או_חישוב'), lambda: N_('פונקציה@arg'),
  lambda_or_array: N_('פונקציה_או_מערך'), initial_value: N_('ערך_התחלתי'), argument: N_('פרמטר'),
};
const FN_INFO = {
  // math
  SUM: ['math', N_('הסכום של כל המספרים'), 'number1, [number2], ...', 'SUM(B2:B10)'],
  SUMIF: ['math', N_('הסכום של המספרים בתאים שעומדים בתנאי'), 'range, criteria, [sum_range]', 'SUMIF(A2:A10,"x",B2:B10)'],
  SUMIFS: ['math', N_('הסכום של המספרים בתאים שעומדים בכמה תנאים'), 'sum_range, criteria_range1, criteria1, ...', 'SUMIFS(C2:C10,A2:A10,"x",B2:B10,">100")'],
  SUMPRODUCT: ['math', N_('כופל מערכים איבר באיבר ומחבר את התוצאות'), 'array1, [array2], ...', 'SUMPRODUCT(B2:B5,C2:C5)'],
  PRODUCT: ['math', N_('כופל את כל המספרים'), 'number1, [number2], ...', 'PRODUCT(B2:B5)'],
  SUMSQ: ['math', N_('מחבר את הריבועים של המספרים'), 'number1, [number2], ...', 'SUMSQ(3,4)'],
  ROUND: ['math', N_('עיגול של מספר למספר הספרות שבוחרים'), 'number, num_digits', 'ROUND(3.14159,2)'],
  ROUNDUP: ['math', N_('עיגול כלפי מעלה (הרחק מאפס)'), 'number, num_digits', 'ROUNDUP(3.2,0)'],
  ROUNDDOWN: ['math', N_('עיגול כלפי מטה (לכיוון אפס)'), 'number, num_digits', 'ROUNDDOWN(3.8,0)'],
  INT: ['math', N_('עיגול כלפי מטה למספר שלם'), 'number', 'INT(7.9)'],
  TRUNC: ['math', N_('חותך את החלק שאחרי הנקודה'), 'number, [num_digits]', 'TRUNC(-7.9)'],
  ABS: ['math', N_('הערך המוחלט: המספר בלי סימן מינוס'), 'number', 'ABS(-5)'],
  SIGN: ['math', N_('1 למספר חיובי, ‎-1 לשלילי, 0 לאפס'), 'number', 'SIGN(-5)'],
  MOD: ['math', N_('השארית של חילוק'), 'number, divisor', 'MOD(10,3)'],
  QUOTIENT: ['math', N_('החלק השלם של חילוק'), 'number, divisor', 'QUOTIENT(10,3)'],
  POWER: ['math', N_('מספר בחזקה'), 'number, power', 'POWER(2,10)'],
  SQRT: ['math', N_('שורש ריבועי'), 'number', 'SQRT(16)'],
  EXP: ['math', N_('e בחזקת המספר'), 'number', 'EXP(1)'],
  LN: ['math', N_('הלוגריתם הטבעי'), 'number', 'LN(10)'],
  LOG: ['math', N_('לוגריתם לפי בסיס (10 אם לא כותבים)'), 'number, [base]', 'LOG(8,2)'],
  LOG10: ['math', N_('לוגריתם לפי בסיס 10'), 'number', 'LOG10(1000)'],
  PI: ['math', N_('המספר פאי (3.14159...)'), '', 'PI()'],
  CEILING: ['math', N_('עיגול כלפי מעלה לכפולה הקרובה'), 'number, significance', 'CEILING(23,5)'],
  'CEILING.MATH': ['math', N_('עיגול כלפי מעלה לכפולה הקרובה'), 'number, [significance], [mode]', 'CEILING.MATH(23,5)'],
  FLOOR: ['math', N_('עיגול כלפי מטה לכפולה הקרובה'), 'number, significance', 'FLOOR(23,5)'],
  'FLOOR.MATH': ['math', N_('עיגול כלפי מטה לכפולה הקרובה'), 'number, [significance], [mode]', 'FLOOR.MATH(23,5)'],
  MROUND: ['math', N_('עיגול לכפולה הקרובה ביותר'), 'number, significance', 'MROUND(23,5)'],
  EVEN: ['math', N_('עיגול למספר הזוגי הבא'), 'number', 'EVEN(3)'],
  ODD: ['math', N_('עיגול למספר האי־זוגי הבא'), 'number', 'ODD(4)'],
  FACT: ['math', N_('עצרת: 1×2×3×… עד המספר'), 'number', 'FACT(5)'],
  COMBIN: ['math', N_('בכמה דרכים אפשר לבחור פריטים מתוך קבוצה'), 'number, number_chosen', 'COMBIN(5,2)'],
  GCD: ['math', N_('המחלק המשותף הגדול ביותר'), 'number1, [number2], ...', 'GCD(12,18)'],
  LCM: ['math', N_('הכפולה המשותפת הקטנה ביותר'), 'number1, [number2], ...', 'LCM(4,6)'],
  RAND: ['math', N_('מספר אקראי בין 0 ל-1'), '', 'RAND()'],
  RANDBETWEEN: ['math', N_('מספר שלם אקראי בין שני מספרים'), 'bottom, top', 'RANDBETWEEN(1,6)'],
  SIN: ['math', N_('סינוס של זווית (ברדיאנים)'), 'number', 'SIN(PI()/2)'],
  COS: ['math', N_('קוסינוס של זווית (ברדיאנים)'), 'number', 'COS(0)'],
  TAN: ['math', N_('טנגנס של זווית (ברדיאנים)'), 'number', 'TAN(PI()/4)'],
  ASIN: ['math', N_('הזווית שזה הסינוס שלה (ברדיאנים)'), 'number', 'ASIN(1)'],
  ACOS: ['math', N_('הזווית שזה הקוסינוס שלה (ברדיאנים)'), 'number', 'ACOS(0)'],
  ATAN: ['math', N_('הזווית שזה הטנגנס שלה (ברדיאנים)'), 'number', 'ATAN(1)'],
  ATAN2: ['math', N_('הזווית של נקודה (x, y) (ברדיאנים)'), 'x_num, y_num', 'ATAN2(1,1)'],
  RADIANS: ['math', N_('ממיר מעלות לרדיאנים'), 'angle', 'RADIANS(180)'],
  DEGREES: ['math', N_('ממיר רדיאנים למעלות'), 'angle', 'DEGREES(PI())'],
  SEQUENCE: ['math', N_('רשימה של מספרים עוקבים, שנשפכת לתאים'), 'rows, [columns], [start], [step]', 'SEQUENCE(10)'],
  SUBTOTAL: ['math', N_('סכום (או ממוצע, ספירה…) של השורות שנשארו גלויות אחרי סינון'), 'function_num, ref1, ...', 'SUBTOTAL(9,B2:B100)'],
  // statistics
  AVERAGE: ['stat', N_('הממוצע של המספרים'), 'number1, [number2], ...', 'AVERAGE(B2:B10)'],
  AVERAGEIF: ['stat', N_('הממוצע של התאים שעומדים בתנאי'), 'range, criteria, [average_range]', 'AVERAGEIF(B2:B10,">50")'],
  AVERAGEIFS: ['stat', N_('הממוצע של התאים שעומדים בכמה תנאים'), 'average_range, criteria_range1, criteria1, ...', 'AVERAGEIFS(C2:C10,A2:A10,"x")'],
  COUNT: ['stat', N_('ספירה של התאים שיש בהם מספר'), 'value1, [value2], ...', 'COUNT(B2:B10)'],
  COUNTA: ['stat', N_('ספירה של התאים שאינם ריקים'), 'value1, [value2], ...', 'COUNTA(A2:A10)'],
  COUNTBLANK: ['stat', N_('ספירה של התאים הריקים'), 'range', 'COUNTBLANK(A2:A10)'],
  COUNTIF: ['stat', N_('ספירה של התאים שעומדים בתנאי'), 'range, criteria', 'COUNTIF(B2:B10,">=55")'],
  COUNTIFS: ['stat', N_('ספירה של התאים שעומדים בכמה תנאים'), 'criteria_range1, criteria1, ...', 'COUNTIFS(A2:A10,"x",B2:B10,">5")'],
  MAX: ['stat', N_('המספר הגדול ביותר'), 'number1, [number2], ...', 'MAX(B2:B10)'],
  MIN: ['stat', N_('המספר הקטן ביותר'), 'number1, [number2], ...', 'MIN(B2:B10)'],
  MAXIFS: ['stat', N_('המספר הגדול ביותר מבין התאים שעומדים בתנאים'), 'max_range, criteria_range1, criteria1, ...', 'MAXIFS(C2:C10,A2:A10,"x")'],
  MINIFS: ['stat', N_('המספר הקטן ביותר מבין התאים שעומדים בתנאים'), 'min_range, criteria_range1, criteria1, ...', 'MINIFS(C2:C10,A2:A10,"x")'],
  MEDIAN: ['stat', N_('החציון: המספר שבאמצע'), 'number1, [number2], ...', 'MEDIAN(B2:B10)'],
  MODE: ['stat', N_('המספר שחוזר הכי הרבה פעמים'), 'number1, [number2], ...', 'MODE(B2:B10)'],
  'MODE.SNGL': ['stat', N_('המספר שחוזר הכי הרבה פעמים'), 'number1, [number2], ...', 'MODE.SNGL(B2:B10)'],
  LARGE: ['stat', N_('המספר ה-k בגודלו מלמעלה'), 'array, k', 'LARGE(B2:B10,2)'],
  SMALL: ['stat', N_('המספר ה-k בגודלו מלמטה'), 'array, k', 'SMALL(B2:B10,2)'],
  RANK: ['stat', N_('המקום של מספר ברשימה'), 'number, ref, [order]', 'RANK(B2,$B$2:$B$10)'],
  'RANK.EQ': ['stat', N_('המקום של מספר ברשימה'), 'number, ref, [order]', 'RANK.EQ(B2,$B$2:$B$10)'],
  'RANK.AVG': ['stat', N_('המקום של מספר ברשימה (ממוצע כשיש תיקו)'), 'number, ref, [order]', 'RANK.AVG(B2,$B$2:$B$10)'],
  STDEV: ['stat', N_('סטיית התקן של מדגם'), 'number1, [number2], ...', 'STDEV(B2:B10)'],
  'STDEV.S': ['stat', N_('סטיית התקן של מדגם'), 'number1, [number2], ...', 'STDEV.S(B2:B10)'],
  STDEVP: ['stat', N_('סטיית התקן של כל האוכלוסייה'), 'number1, [number2], ...', 'STDEVP(B2:B10)'],
  'STDEV.P': ['stat', N_('סטיית התקן של כל האוכלוסייה'), 'number1, [number2], ...', 'STDEV.P(B2:B10)'],
  VAR: ['stat', N_('השונות של מדגם'), 'number1, [number2], ...', 'VAR(B2:B10)'],
  'VAR.S': ['stat', N_('השונות של מדגם'), 'number1, [number2], ...', 'VAR.S(B2:B10)'],
  VARP: ['stat', N_('השונות של כל האוכלוסייה'), 'number1, [number2], ...', 'VARP(B2:B10)'],
  'VAR.P': ['stat', N_('השונות של כל האוכלוסייה'), 'number1, [number2], ...', 'VAR.P(B2:B10)'],
  PERCENTILE: ['stat', N_('האחוזון: המספר שחלק k מהרשימה קטן ממנו'), 'array, k', 'PERCENTILE(B2:B10,0.9)'],
  'PERCENTILE.INC': ['stat', N_('האחוזון: המספר שחלק k מהרשימה קטן ממנו'), 'array, k', 'PERCENTILE.INC(B2:B10,0.9)'],
  QUARTILE: ['stat', N_('הרבעון (0 עד 4) של הרשימה'), 'array, quart', 'QUARTILE(B2:B10,1)'],
  'QUARTILE.INC': ['stat', N_('הרבעון (0 עד 4) של הרשימה'), 'array, quart', 'QUARTILE.INC(B2:B10,1)'],
  // logic
  IF: ['logic', N_('בודק תנאי: ערך אחד אם הוא נכון, ואחר אם לא'), 'logical_test, value_if_true, [value_if_false]', 'IF(B2>=55,"✓","✗")'],
  LET: ['logic', N_('נותן שמות לערכים בתוך הנוסחה, כדי לחשב כל אחד פעם אחת ולקרוא לו בשמו'), 'name1, name_value1, calculation_or_name2, [name_value2], ...', 'LET(x,B2*2,x+x)'],
  LAMBDA: ['logic', N_('פונקציה משלך: שמות של פרמטרים ואחריהם החישוב. קוראים לה עם סוגריים, או נותנים לה שם מוגדר'), 'parameter_or_calculation1, [parameter_or_calculation2], ...', 'LAMBDA(x,x*2)(5)'],
  MAP: ['logic', N_('מפעיל פונקציה על כל ערך במערך, ומחזיר מערך של התוצאות'), 'array1, lambda_or_array2, [lambda_or_array3], ...', 'MAP(A2:A9,LAMBDA(x,x*2))'],
  REDUCE: ['logic', N_('מצמצם מערך לערך אחד: הפונקציה מקבלת את מה שנצבר ואת הערך הבא'), 'initial_value, array, lambda', 'REDUCE(0,A2:A9,LAMBDA(a,b,a+b))'],
  SCAN: ['logic', N_('כמו REDUCE, אבל מחזיר את כל שלבי הביניים'), 'initial_value, array, lambda', 'SCAN(0,A2:A9,LAMBDA(a,b,a+b))'],
  BYROW: ['logic', N_('מפעיל פונקציה על כל שורה, ומחזיר ערך לכל שורה'), 'array, lambda', 'BYROW(A2:C9,LAMBDA(r,SUM(r)))'],
  BYCOL: ['logic', N_('מפעיל פונקציה על כל עמודה, ומחזיר ערך לכל עמודה'), 'array, lambda', 'BYCOL(A2:C9,LAMBDA(c,MAX(c)))'],
  MAKEARRAY: ['logic', N_('בונה מערך בגודל שבוחרים: הפונקציה מקבלת את מספר השורה והעמודה'), 'rows, cols, lambda', 'MAKEARRAY(3,3,LAMBDA(r,c,r*c))'],
  ISOMITTED: ['logic', N_('בודק אם פרמטר של LAMBDA הושמט'), 'argument', 'LAMBDA(x,[y],IF(ISOMITTED(y),x,x+y))(5)'],
  IFS: ['logic', N_('בודק כמה תנאים לפי הסדר, ומחזיר את הערך של הראשון שנכון'), 'logical_test1, value_if_true1, ...', 'IFS(B2>=90,"A",B2>=55,"B",TRUE,"C")'],
  IFERROR: ['logic', N_('ערך אחר במקום שגיאה'), 'value, value_if_error', 'IFERROR(A2/B2,0)'],
  IFNA: ['logic', N_('ערך אחר במקום ‎#N/A'), 'value, value_if_na', 'IFNA(VLOOKUP(A2,D:E,2,FALSE),"-")'],
  AND: ['logic', N_('נכון (TRUE) רק אם כל התנאים נכונים'), 'logical1, [logical2], ...', 'AND(B2>50,C2>50)'],
  OR: ['logic', N_('נכון (TRUE) אם לפחות תנאי אחד נכון'), 'logical1, [logical2], ...', 'OR(B2>90,C2>90)'],
  XOR: ['logic', N_('נכון (TRUE) כשמספר התנאים הנכונים אי־זוגי'), 'logical1, [logical2], ...', 'XOR(B2>50,C2>50)'],
  NOT: ['logic', N_('הופך נכון ללא נכון, ולהפך'), 'logical', 'NOT(B2>50)'],
  SWITCH: ['logic', N_('משווה ערך לרשימה, ומחזיר את התוצאה של מה שתואם'), 'expression, value1, result1, ..., [default]', 'SWITCH(A2,1,"A",2,"B","?")'],
  TRUE: ['logic', N_('הערך הלוגי TRUE (נכון)'), '', 'TRUE()'],
  FALSE: ['logic', N_('הערך הלוגי FALSE (לא נכון)'), '', 'FALSE()'],
  // text
  CONCATENATE: ['text', N_('מחבר כמה טקסטים לאחד'), 'text1, [text2], ...', 'CONCATENATE(A2," ",B2)'],
  CONCAT: ['text', N_('מחבר טקסטים, גם מטווחים שלמים'), 'text1, [text2], ...', 'CONCAT(A2:C2)'],
  TEXTJOIN: ['text', N_('מחבר טקסטים עם מפריד ביניהם'), 'delimiter, ignore_empty, text1, ...', 'TEXTJOIN(", ",TRUE,A2:A10)'],
  LEFT: ['text', N_('התווים הראשונים של טקסט'), 'text, [num_chars]', 'LEFT(A2,3)'],
  RIGHT: ['text', N_('התווים האחרונים של טקסט'), 'text, [num_chars]', 'RIGHT(A2,3)'],
  MID: ['text', N_('תווים מאמצע טקסט'), 'text, start_num, num_chars', 'MID(A2,2,3)'],
  LEN: ['text', N_('כמה תווים יש בטקסט'), 'text', 'LEN(A2)'],
  UPPER: ['text', N_('הופך אותיות לגדולות'), 'text', 'UPPER(A2)'],
  LOWER: ['text', N_('הופך אותיות לקטנות'), 'text', 'LOWER(A2)'],
  PROPER: ['text', N_('אות גדולה בתחילת כל מילה'), 'text', 'PROPER(A2)'],
  TRIM: ['text', N_('מוריד רווחים מיותרים'), 'text', 'TRIM(A2)'],
  CLEAN: ['text', N_('מוריד תווים שלא מודפסים'), 'text', 'CLEAN(A2)'],
  SUBSTITUTE: ['text', N_('מחליף טקסט אחד באחר'), 'text, old_text, new_text, [instance_num]', 'SUBSTITUTE(A2,"-"," ")'],
  REPLACE: ['text', N_('מחליף חלק מטקסט לפי מקום'), 'old_text, start_num, num_chars, new_text', 'REPLACE(A2,1,3,"abc")'],
  FIND: ['text', N_('איפה מתחיל טקסט בתוך טקסט (עם הבדל בין אותיות גדולות לקטנות)'), 'find_text, within_text, [start_num]', 'FIND("@",A2)'],
  SEARCH: ['text', N_('איפה מתחיל טקסט בתוך טקסט (בלי הבדל בין גדולות לקטנות, עם * ו-?)'), 'find_text, within_text, [start_num]', 'SEARCH("a*",A2)'],
  TEXT: ['text', N_('מספר כטקסט בתבנית שבוחרים'), 'value, format_text', 'TEXT(B2,"0.00")'],
  VALUE: ['text', N_('ממיר טקסט של מספר למספר'), 'text', 'VALUE("12.5")'],
  REPT: ['text', N_('חוזר על טקסט כמה פעמים'), 'text, number_times', 'REPT("★",B2)'],
  EXACT: ['text', N_('בודק אם שני טקסטים זהים בדיוק'), 'text1, text2', 'EXACT(A2,B2)'],
  CHAR: ['text', N_('התו של מספר'), 'number', 'CHAR(65)'],
  CODE: ['text', N_('המספר של התו הראשון'), 'text', 'CODE("A")'],
  UNICHAR: ['text', N_('התו של מספר יוניקוד'), 'number', 'UNICHAR(9733)'],
  UNICODE: ['text', N_('מספר היוניקוד של התו הראשון'), 'text', 'UNICODE("A")'],
  T: ['text', N_('הטקסט, או ריק אם זה לא טקסט'), 'value', 'T(A2)'],
  N: ['text', N_('המספר, או 0 אם זה לא מספר'), 'value', 'N(A2)'],
  TEXTBEFORE: ['text', N_('הטקסט שלפני מפריד'), 'text, delimiter, [instance_num], [match_mode], [match_end], [if_not_found]', 'TEXTBEFORE(A2," ")'],
  TEXTAFTER: ['text', N_('הטקסט שאחרי מפריד'), 'text, delimiter, [instance_num], [match_mode], [match_end], [if_not_found]', 'TEXTAFTER(A2," ")'],
  TEXTSPLIT: ['text', N_('מפצל טקסט לתאים לפי מפריד'), 'text, col_delimiter, [row_delimiter], [ignore_empty], [match_mode], [pad_with]', 'TEXTSPLIT(A2,",")'],
  // dates and times
  TODAY: ['date', N_('התאריך של היום'), '', 'TODAY()'],
  NOW: ['date', N_('התאריך והשעה עכשיו'), '', 'NOW()'],
  DATE: ['date', N_('תאריך משנה, חודש ויום'), 'year, month, day', 'DATE(2026,9,30)'],
  TIME: ['date', N_('שעה משעות, דקות ושניות'), 'hour, minute, second', 'TIME(14,30,0)'],
  YEAR: ['date', N_('השנה של תאריך'), 'serial_number', 'YEAR(A2)'],
  MONTH: ['date', N_('החודש של תאריך (1 עד 12)'), 'serial_number', 'MONTH(A2)'],
  DAY: ['date', N_('היום בחודש של תאריך'), 'serial_number', 'DAY(A2)'],
  HOUR: ['date', N_('השעה (0 עד 23)'), 'serial_number', 'HOUR(A2)'],
  MINUTE: ['date', N_('הדקות (0 עד 59)'), 'serial_number', 'MINUTE(A2)'],
  SECOND: ['date', N_('השניות (0 עד 59)'), 'serial_number', 'SECOND(A2)'],
  WEEKDAY: ['date', N_('היום בשבוע (1 = ראשון)'), 'serial_number, [return_type]', 'WEEKDAY(A2)'],
  WEEKNUM: ['date', N_('מספר השבוע בשנה'), 'serial_number, [return_type]', 'WEEKNUM(A2)'],
  ISOWEEKNUM: ['date', N_('מספר השבוע בשנה לפי ISO'), 'serial_number', 'ISOWEEKNUM(A2)'],
  DATEDIF: ['date', N_('ההפרש בין תאריכים בשנים ("Y"), חודשים ("M") או ימים ("D")'), 'start_date, end_date, unit', 'DATEDIF(A2,TODAY(),"Y")'],
  DAYS: ['date', N_('כמה ימים בין שני תאריכים'), 'end_date, start_date', 'DAYS(B2,A2)'],
  EDATE: ['date', N_('התאריך כמה חודשים לפני או אחרי'), 'start_date, months', 'EDATE(A2,3)'],
  EOMONTH: ['date', N_('היום האחרון בחודש, כמה חודשים לפני או אחרי'), 'start_date, months', 'EOMONTH(A2,0)'],
  NETWORKDAYS: ['date', N_('כמה ימי עבודה (שני עד שישי) בין תאריכים'), 'start_date, end_date, [holidays]', 'NETWORKDAYS(A2,B2)'],
  'NETWORKDAYS.INTL': ['date', N_('כמה ימי עבודה בין תאריכים, עם סוף שבוע לבחירה (7 = שישי ושבת)'), 'start_date, end_date, [weekend], [holidays]', 'NETWORKDAYS.INTL(A2,B2,7)'],
  WORKDAY: ['date', N_('התאריך אחרי מספר ימי עבודה'), 'start_date, days, [holidays]', 'WORKDAY(A2,10)'],
  'WORKDAY.INTL': ['date', N_('התאריך אחרי מספר ימי עבודה, עם סוף שבוע לבחירה'), 'start_date, days, [weekend], [holidays]', 'WORKDAY.INTL(A2,10,7)'],
  DATEVALUE: ['date', N_('ממיר תאריך שכתוב כטקסט לתאריך'), 'date_text', 'DATEVALUE("30/09/2026")'],
  TIMEVALUE: ['date', N_('ממיר שעה שכתובה כטקסט לשעה'), 'time_text', 'TIMEVALUE("14:30")'],
  YEARFRAC: ['date', N_('החלק של השנה שבין שני תאריכים'), 'start_date, end_date, [basis]', 'YEARFRAC(A2,B2,1)'],
  DAYS360: ['date', N_('מספר הימים בין שני תאריכים, בשנה של 12 חודשים בני 30 יום'), 'start_date, end_date, [method]', 'DAYS360(A2,B2)'],
  // finding values
  VLOOKUP: ['look', N_('מחפש ערך בעמודה הראשונה של טבלה, ומחזיר ערך מאותה שורה'), 'lookup_value, table_array, col_index_num, [range_lookup]', 'VLOOKUP(A2,D2:F20,3,FALSE)'],
  HLOOKUP: ['look', N_('מחפש ערך בשורה הראשונה של טבלה, ומחזיר ערך מאותה עמודה'), 'lookup_value, table_array, row_index_num, [range_lookup]', 'HLOOKUP(A2,D1:H3,2,FALSE)'],
  GETPIVOTDATA: ['look', N_('ערך שטבלת ציר מראה: לפי שדה הערכים שלה, ושדות של השורות והעמודות שלה עם פריט של כל אחד'), 'data_field, pivot_table, [field1, item1], ...', 'GETPIVOTDATA("Sales",A3,"Region","North")'],
  HYPERLINK: ['look', N_('קישור: מראה את השם שבוחרים, ולחיצה עליו פותחת את הכתובת (או מקום בחוברת, עם # לפניו)'), 'link_location, [friendly_name]', 'HYPERLINK("https://example.com","אתר")'],
  XLOOKUP: ['look', N_('מחפש ערך ברשימה, ומחזיר את מה שעומד מולו ברשימה אחרת'), 'lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode]', 'XLOOKUP(A2,D2:D20,F2:F20,"-")'],
  LOOKUP: ['look', N_('מחפש ערך ברשימה ממוינת'), 'lookup_value, lookup_array, [return_array]', 'LOOKUP(B2,{0,55,90},{"C","B","A"})'],
  MATCH: ['look', N_('המקום של ערך ברשימה'), 'lookup_value, lookup_array, [match_type]', 'MATCH(D1,A2:A10,0)'],
  XMATCH: ['look', N_('המקום של ערך ברשימה (גרסה חדשה)'), 'lookup_value, lookup_array, [match_mode], [search_mode]', 'XMATCH(D1,A2:A10)'],
  INDEX: ['look', N_('הערך בשורה ובעמודה שבוחרים מתוך טווח'), 'array, row_num, [column_num]', 'INDEX(A2:C10,3,2)'],
  CHOOSE: ['look', N_('בוחר ערך מרשימה לפי מספר'), 'index_num, value1, [value2], ...', 'CHOOSE(2,"A","B","C")'],
  ROW: ['look', N_('מספר השורה של תא'), '[reference]', 'ROW()'],
  AREAS: ['look', N_('מספר האזורים שבהפניה'), 'reference', 'AREAS(A1:C3)'],
  COLUMN: ['look', N_('מספר העמודה של תא'), '[reference]', 'COLUMN()'],
  ROWS: ['look', N_('כמה שורות יש בטווח'), 'array', 'ROWS(A2:A10)'],
  COLUMNS: ['look', N_('כמה עמודות יש בטווח'), 'array', 'COLUMNS(A1:D1)'],
  ADDRESS: ['look', N_('הכתובת של תא כטקסט'), 'row, column, [abs_num], [a1], [sheet_text]', 'ADDRESS(2,3)'],
  INDIRECT: ['look', N_('הופך טקסט של כתובת או של שם מוגדר לתאים עצמם'), 'ref_text, [a1]', 'INDIRECT(A2)'],
  OFFSET: ['look', N_('טווח שנמצא כמה שורות ועמודות מתא, בגודל שבוחרים'), 'reference, rows, cols, [height], [width]', 'OFFSET(A1,2,1)'],
  TRANSPOSE: ['look', N_('הופך שורות לעמודות ועמודות לשורות'), 'array', 'TRANSPOSE(A1:C3)'],
  FILTER: ['look', N_('רק השורות שעומדות בתנאי, שנשפכות לתאים'), 'array, include, [if_empty]', 'FILTER(A2:C20,C2:C20>50)'],
  SORT: ['look', N_('טווח ממוין, שנשפך לתאים'), 'array, [sort_index], [sort_order], [by_col]', 'SORT(A2:B20,2,-1)'],
  SORTBY: ['look', N_('טווח ממוין לפי טווח אחר'), 'array, by_array1, [sort_order1], ...', 'SORTBY(A2:A20,B2:B20,-1)'],
  UNIQUE: ['look', N_('הערכים בלי כפילויות, שנשפכים לתאים'), 'array, [by_col], [exactly_once]', 'UNIQUE(A2:A20)'],
  // money
  PMT: ['fin', N_('התשלום הקבוע של הלוואה, בריבית קבועה'), 'rate, nper, pv, [fv], [type]', 'PMT(5%/12,60,100000)'],
  PV: ['fin', N_('הערך של היום של תשלומים קבועים בעתיד'), 'rate, nper, pmt, [fv], [type]', 'PV(5%/12,60,-500)'],
  FV: ['fin', N_('הערך בעתיד של חיסכון בהפקדות קבועות'), 'rate, nper, pmt, [pv], [type]', 'FV(4%/12,120,-200)'],
  NPER: ['fin', N_('מספר התשלומים עד שהלוואה נגמרת או שחיסכון מגיע לסכום'), 'rate, pmt, pv, [fv], [type]', 'NPER(5%/12,-1000,50000)'],
  RATE: ['fin', N_('הריבית לתקופה של הלוואה או של חיסכון'), 'nper, pmt, pv, [fv], [type], [guess]', 'RATE(60,-1900,100000)*12'],
  IPMT: ['fin', N_('החלק של הריבית בתשלום מסוים של הלוואה'), 'rate, per, nper, pv, [fv], [type]', 'IPMT(5%/12,1,60,100000)'],
  PPMT: ['fin', N_('החלק של הקרן בתשלום מסוים של הלוואה'), 'rate, per, nper, pv, [fv], [type]', 'PPMT(5%/12,1,60,100000)'],
  ISPMT: ['fin', N_('הריבית בתקופה מסוימת של הלוואה שהקרן שלה מוחזרת בחלקים שווים'), 'rate, per, nper, pv', 'ISPMT(5%/12,1,60,100000)'],
  CUMIPMT: ['fin', N_('כל הריבית ששולמה בין שני תשלומים של הלוואה'), 'rate, nper, pv, start_period, end_period, type', 'CUMIPMT(5%/12,60,100000,1,12,0)'],
  CUMPRINC: ['fin', N_('כל הקרן שהוחזרה בין שני תשלומים של הלוואה'), 'rate, nper, pv, start_period, end_period, type', 'CUMPRINC(5%/12,60,100000,1,12,0)'],
  NPV: ['fin', N_('הערך הנוכחי הנקי של תזרימי כסף, לפי ריבית היוון'), 'rate, value1, [value2], ...', 'NPV(8%,B2:B6)+B1'],
  IRR: ['fin', N_('שיעור התשואה הפנימי של תזרימי כסף'), 'values, [guess]', 'IRR(B1:B6)'],
  MIRR: ['fin', N_('שיעור תשואה פנימי, כשהמימון וההשקעה מחדש בריביות שונות'), 'values, finance_rate, reinvest_rate', 'MIRR(B1:B6,10%,12%)'],
  XNPV: ['fin', N_('ערך נוכחי נקי של תזרימי כסף שהתאריכים שלהם לא קבועים'), 'rate, values, dates', 'XNPV(9%,B2:B6,A2:A6)'],
  XIRR: ['fin', N_('שיעור תשואה פנימי של תזרימי כסף שהתאריכים שלהם לא קבועים'), 'values, dates, [guess]', 'XIRR(B2:B6,A2:A6)'],
  EFFECT: ['fin', N_('הריבית השנתית האמיתית, מריבית נקובה שמחושבת כמה פעמים בשנה'), 'nominal_rate, npery', 'EFFECT(5.25%,4)'],
  NOMINAL: ['fin', N_('הריבית השנתית הנקובה, מהריבית האמיתית'), 'effect_rate, npery', 'NOMINAL(5.35%,4)'],
  FVSCHEDULE: ['fin', N_('הערך בעתיד של סכום, אחרי כמה ריביות שונות זו אחר זו'), 'principal, schedule', 'FVSCHEDULE(1000,{0.09,0.11,0.1})'],
  PDURATION: ['fin', N_('מספר התקופות עד שהשקעה מגיעה לסכום'), 'rate, pv, fv', 'PDURATION(2.5%,2000,2200)'],
  RRI: ['fin', N_('הריבית לתקופה שמתאימה לגידול של השקעה'), 'nper, pv, fv', 'RRI(96,10000,11000)'],
  SLN: ['fin', N_('הפחת של נכס בתקופה אחת, בקו ישר'), 'cost, salvage, life', 'SLN(30000,7500,10)'],
  SYD: ['fin', N_('הפחת של נכס בתקופה מסוימת, בשיטת סכום ספרות השנים'), 'cost, salvage, life, per', 'SYD(30000,7500,10,1)'],
  DB: ['fin', N_('הפחת של נכס בתקופה מסוימת, ביתרה פוחתת בשיעור קבוע'), 'cost, salvage, life, period, [month]', 'DB(30000,7500,10,1)'],
  DDB: ['fin', N_('הפחת של נכס בתקופה מסוימת, ביתרה פוחתת כפולה'), 'cost, salvage, life, period, [factor]', 'DDB(30000,7500,10,1)'],
  VDB: ['fin', N_('הפחת של נכס בין שתי תקופות, ביתרה פוחתת שעוברת לקו ישר'), 'cost, salvage, life, start_period, end_period, [factor], [no_switch]', 'VDB(30000,7500,10,0,1)'],
  AMORLINC: ['fin', N_('הפחת בכל תקופת חשבון, בקו ישר (חשבונאות צרפתית)'), 'cost, date_purchased, first_period, salvage, period, rate, [basis]', 'AMORLINC(2400,A2,B2,300,1,15%,1)'],
  AMORDEGRC: ['fin', N_('הפחת בכל תקופת חשבון, פוחת (חשבונאות צרפתית)'), 'cost, date_purchased, first_period, salvage, period, rate, [basis]', 'AMORDEGRC(2400,A2,B2,300,1,15%,1)'],
  DOLLARDE: ['fin', N_('מחיר שכתוב כשבר (1.02 הוא 1 ועוד 2/16) כמספר עשרוני'), 'fractional_dollar, fraction', 'DOLLARDE(1.02,16)'],
  DOLLARFR: ['fin', N_('מחיר עשרוני כמחיר שכתוב כשבר'), 'decimal_dollar, fraction', 'DOLLARFR(1.125,16)'],
  PRICE: ['fin', N_('המחיר לכל 100 ערך נקוב של אגרת חוב שמשלמת ריבית כל תקופה'), 'settlement, maturity, rate, yld, redemption, frequency, [basis]', 'PRICE(A2,B2,5.75%,6.5%,100,2,0)'],
  YIELD: ['fin', N_('התשואה של אגרת חוב שמשלמת ריבית כל תקופה'), 'settlement, maturity, rate, pr, redemption, frequency, [basis]', 'YIELD(A2,B2,5.75%,95.04,100,2,0)'],
  DURATION: ['fin', N_('משך החיים הממוצע (מח"מ) של אגרת חוב, בשנים'), 'settlement, maturity, coupon, yld, frequency, [basis]', 'DURATION(A2,B2,8%,9%,2,1)'],
  MDURATION: ['fin', N_('מח"מ מתוקן של אגרת חוב'), 'settlement, maturity, coupon, yld, frequency, [basis]', 'MDURATION(A2,B2,8%,9%,2,1)'],
  ACCRINT: ['fin', N_('הריבית שנצברה בנייר ערך שמשלם ריבית כל תקופה'), 'issue, first_interest, settlement, rate, par, frequency, [basis], [calc_method]', 'ACCRINT(A2,B2,C2,10%,1000,2,0)'],
  ACCRINTM: ['fin', N_('הריבית שנצברה בנייר ערך שמשלם ריבית בפדיון'), 'issue, settlement, rate, par, [basis]', 'ACCRINTM(A2,B2,10%,1000,3)'],
  COUPPCD: ['fin', N_('תאריך הקופון האחרון לפני הסליקה'), 'settlement, maturity, frequency, [basis]', 'COUPPCD(A2,B2,2,1)'],
  COUPNCD: ['fin', N_('תאריך הקופון הבא אחרי הסליקה'), 'settlement, maturity, frequency, [basis]', 'COUPNCD(A2,B2,2,1)'],
  COUPNUM: ['fin', N_('מספר הקופונים שנשארו מהסליקה עד הפדיון'), 'settlement, maturity, frequency, [basis]', 'COUPNUM(A2,B2,2,1)'],
  COUPDAYBS: ['fin', N_('מספר הימים מתחילת תקופת הקופון עד הסליקה'), 'settlement, maturity, frequency, [basis]', 'COUPDAYBS(A2,B2,2,1)'],
  COUPDAYS: ['fin', N_('מספר הימים בתקופת הקופון שהסליקה בתוכה'), 'settlement, maturity, frequency, [basis]', 'COUPDAYS(A2,B2,2,1)'],
  COUPDAYSNC: ['fin', N_('מספר הימים מהסליקה עד הקופון הבא'), 'settlement, maturity, frequency, [basis]', 'COUPDAYSNC(A2,B2,2,1)'],
  DISC: ['fin', N_('שיעור הניכיון של נייר ערך'), 'settlement, maturity, pr, redemption, [basis]', 'DISC(A2,B2,97.975,100,1)'],
  INTRATE: ['fin', N_('הריבית של נייר ערך שמוחזק עד הפדיון'), 'settlement, maturity, investment, redemption, [basis]', 'INTRATE(A2,B2,1000000,1014420,2)'],
  RECEIVED: ['fin', N_('הסכום שמתקבל בפדיון של נייר ערך שמוחזק עד הפדיון'), 'settlement, maturity, investment, discount, [basis]', 'RECEIVED(A2,B2,1000000,5.75%,2)'],
  PRICEDISC: ['fin', N_('המחיר לכל 100 ערך נקוב של נייר ערך שנמכר בניכיון'), 'settlement, maturity, discount, redemption, [basis]', 'PRICEDISC(A2,B2,5.25%,100,2)'],
  YIELDDISC: ['fin', N_('התשואה השנתית של נייר ערך שנמכר בניכיון'), 'settlement, maturity, pr, redemption, [basis]', 'YIELDDISC(A2,B2,99.795,100,2)'],
  PRICEMAT: ['fin', N_('המחיר לכל 100 ערך נקוב של נייר ערך שמשלם ריבית בפדיון'), 'settlement, maturity, issue, rate, yld, [basis]', 'PRICEMAT(A2,B2,C2,6.1%,6.1%,0)'],
  YIELDMAT: ['fin', N_('התשואה השנתית של נייר ערך שמשלם ריבית בפדיון'), 'settlement, maturity, issue, rate, pr, [basis]', 'YIELDMAT(A2,B2,C2,6.25%,100.0123,0)'],
  TBILLPRICE: ['fin', N_('המחיר לכל 100 ערך נקוב של מלווה קצר מועד'), 'settlement, maturity, discount', 'TBILLPRICE(A2,B2,9%)'],
  TBILLYIELD: ['fin', N_('התשואה של מלווה קצר מועד'), 'settlement, maturity, pr', 'TBILLYIELD(A2,B2,98.45)'],
  TBILLEQ: ['fin', N_('התשואה של מלווה קצר מועד, כמו שמחשבים באגרת חוב'), 'settlement, maturity, discount', 'TBILLEQ(A2,B2,9%)'],
  ODDFPRICE: ['fin', N_('המחיר של אגרת חוב שהתקופה הראשונה שלה באורך אחר'), 'settlement, maturity, issue, first_coupon, rate, yld, redemption, frequency, [basis]', 'ODDFPRICE(A2,B2,C2,D2,7.85%,6.25%,100,2,1)'],
  ODDFYIELD: ['fin', N_('התשואה של אגרת חוב שהתקופה הראשונה שלה באורך אחר'), 'settlement, maturity, issue, first_coupon, rate, pr, redemption, frequency, [basis]', 'ODDFYIELD(A2,B2,C2,D2,5.75%,84.5,100,2,0)'],
  ODDLPRICE: ['fin', N_('המחיר של אגרת חוב שהתקופה האחרונה שלה באורך אחר'), 'settlement, maturity, last_interest, rate, yld, redemption, frequency, [basis]', 'ODDLPRICE(A2,B2,C2,3.75%,4.05%,100,2,0)'],
  ODDLYIELD: ['fin', N_('התשואה של אגרת חוב שהתקופה האחרונה שלה באורך אחר'), 'settlement, maturity, last_interest, rate, pr, redemption, frequency, [basis]', 'ODDLYIELD(A2,B2,C2,3.75%,99.875,100,2,0)'],
  // information
  ISBLANK: ['info', N_('בודק אם תא ריק'), 'value', 'ISBLANK(A2)'],
  ISNUMBER: ['info', N_('בודק אם זה מספר'), 'value', 'ISNUMBER(A2)'],
  ISTEXT: ['info', N_('בודק אם זה טקסט'), 'value', 'ISTEXT(A2)'],
  ISNONTEXT: ['info', N_('בודק אם זה לא טקסט'), 'value', 'ISNONTEXT(A2)'],
  ISLOGICAL: ['info', N_('בודק אם זה TRUE או FALSE'), 'value', 'ISLOGICAL(A2)'],
  ISERROR: ['info', N_('בודק אם זו שגיאה'), 'value', 'ISERROR(A2)'],
  ISERR: ['info', N_('בודק אם זו שגיאה שאינה ‎#N/A'), 'value', 'ISERR(A2)'],
  ISNA: ['info', N_('בודק אם זו השגיאה ‎#N/A'), 'value', 'ISNA(A2)'],
  ISEVEN: ['info', N_('בודק אם המספר זוגי'), 'number', 'ISEVEN(A2)'],
  ISODD: ['info', N_('בודק אם המספר אי־זוגי'), 'number', 'ISODD(A2)'],
  ISFORMULA: ['info', N_('בודק אם יש בתא נוסחה'), 'reference', 'ISFORMULA(A2)'],
  ISREF: ['info', N_('בודק אם זו הפניה לתאים'), 'value', 'ISREF(A2)'],
  NA: ['info', N_('השגיאה ‎#N/A: אין ערך'), '', 'NA()'],
  'ERROR.TYPE': ['info', N_('המספר של סוג השגיאה'), 'error_val', 'ERROR.TYPE(A2)'],
  TYPE: ['info', N_('סוג הערך: 1 מספר, 2 טקסט, 4 לוגי, 16 שגיאה, 64 מערך'), 'value', 'TYPE(A2)'],
};
const FN_LIST = Object.keys(FN_INFO);
const fnDesc = fn => FN_INFO[fn] ? T(FN_INFO[fn][1]) : '';
/* a function's argument names in this language: number1 is "מספר1", [..] may be left out, ... more of the same */
const fnArgs = fn => !FN_INFO[fn] || !FN_INFO[fn][2] ? [] : FN_INFO[fn][2].split(', ').map(p => {
  const id = p.replace(/[[\]]/g, ''), wrap = t => p[0] === '[' ? '[' + t + ']' : t, m = /^([a-z_]+?)(\d+)$/.exec(id);
  return ARGN[id] ? wrap(T(ARGN[id])) : m && ARGN[m[1]] ? wrap(T(ARGN[m[1]]) + m[2]) : p;
});
/* what a formula on sheet s needs that isn't here: { fn } a function this app doesn't have (also inside a name the
   formula uses), so nothing can be worked out; { name } a name nobody defined, which is #NAME? as in Excel */
function missingIn(f, s, book = WB, used) {
  const a = astOf(f);
  if (!a) return { fn: '?' };
  let bad = null;
  const named = n => {   // a defined name: there, and nothing missing inside it (a table's name is one too)
    if (book && n.sheet == null && book.sheets.some(sh => sh.tables && sh.tables.some(t => t.name.toLowerCase() === String(n.n).toLowerCase()))) return true;
    const nm = book ? nameOf(n, s, book) : null;
    if (nm && !(used && used.has(nm))) bad = missingIn(nm.f, s, book, new Set(used || []).add(nm));
    return !!nm;
  };
  const visit = (n, own) => {   // own: the names LET and LAMBDA gave around here
    if (bad || !n) return;
    if (n.t === 'fn') {
      const scope = n.n === 'LET' || n.n === 'LAMBDA', last = n.args.length - 1;
      if (scope) own = new Set(own);
      else if (!FUNCS[n.n] && !own.has(n.n.toLowerCase()) && !named({ n: n.n, sheet: null })) { bad = { fn: n.n }; return; }
      n.args.forEach((x, i) => {
        if (scope && i < last && (n.n === 'LAMBDA' || i % 2 === 0) && ((x.t === 'name' && x.sheet == null) || x.t === 'opt')) own.add(x.n.toLowerCase());
        else if (i === last && LAM_FNS.has(n.n) && x.t === 'name' && x.sheet == null && FUNCS[x.n.toUpperCase()] && !own.has(x.n.toLowerCase())) return;   // a function's bare name: BYROW(A1:C3,SUM)
        else visit(x, own);
      });
    } else if (n.t === 'call') { visit(n.f, own); for (const x of n.args) visit(x, own); }
    else if (n.t === 'name') { if (!(n.sheet == null && own.has(n.n.toLowerCase())) && !named(n)) bad = { name: n.n }; }
    else if (n.a) { visit(n.a, own); if (n.b) visit(n.b, own); }
  };
  visit(a, new Set());
  return bad;
}
const LAM_FNS = new Set(['MAP', 'REDUCE', 'SCAN', 'BYROW', 'BYCOL', 'MAKEARRAY']);
const lacksFn = (f, s) => { const m = missingIn(f, s); return !!m && !!m.fn; };

/* --- recalculating: every formula, in an order where each comes after the formulas it reads. Formulas that read
   each other in a loop show 0, as in Excel, and the status line names the first of them. A formula whose answer is an
   array spills it into the empty cells below and beside it (s._sp: each such cell's value; s._sa: each formula's
   area). Where a formula spilled last time tells what reads it; when the areas change, everything is worked out
   once more --- */
let CIRC = null, SUBT = false;
function rowsIn(rows, lo, hi, fn) {
  let a = 0, b = rows.length;
  while (a < b) { const m = (a + b) >> 1; if (rows[m] < lo) a = m + 1; else b = m; }
  for (let i = a; i < rows.length && rows[i] <= hi; i++) fn(rows[i]);
}
/* Where INDIRECT and OFFSET pointed last time (s._dd, by formula) is part of the order too, and a pass that found them
   pointing elsewhere is followed by another. A loop that runs through such a formula may be an old story (it pointed
   there before this change): the formulas in it are worked out once without that part of the order (st.doubt), and
   only if they point there still is it a loop (st.sure), as Excel calls it */
function recalc() {
  if (!WB) return;
  // a pivot table's cells are in place while the formulas are worked out (a formula may read them, or GETPIVOTDATA), and
  // are worked out again after them, from its source. When they change and a formula read them, the formulas go again
  if (WB.sheets.some(s => s.pivots.length && !s._pvc)) placePivots();
  for (let round = 0; round < 3; round++) {
    const st = { doubt: null, sure: new Set() };
    PV_READ = false;
    try { for (let pass = 0; pass < 16 && calcPass(pass, st); pass++); } finally { KEPT.clear(); KEPT_N = 0; }
    if (!placePivots() || !PV_READ) break;
  }
}
/* every sheet's pivot tables into their places (s._pvc: their cells, s._pva: where each stands); true when their cells
   are not what they were */
let PV_READ = false;   // a formula read a pivot table's cell (or used GETPIVOTDATA) in this round
function placePivots() {
  let moved = false;
  for (const s of WB.sheets) {
    const old = s._pvc || new Map();
    if (!s._sp) s._sp = new Map();
    for (const k of old.keys()) { const o = s._sp.get(k); if (o && typeof o.a === 'string') s._sp.delete(k); }
    s._pva = new Map(); s._pvc = new Map();
    for (const x of s.pivots) placePivot(s, x);
    if (old.size !== s._pvc.size || [...old].some(([k, o]) => { const q = s._pvc.get(k); return !q || q.v !== o.v; })) moved = true;
  }
  return moved;
}
/* the references a formula reads, each through fn(sheet number, range): the ones written in it, and the ones in the
   names it uses (their parts without $ are for A1, and move to the formula's cell). The cell OFFSET starts from is
   not read, nor the range INDEX picks from (only what it picks, which pointsAt keeps), nor the cells ROW, COLUMN, ROWS
   and COLUMNS ask about: =SUM(OFFSET(B9,-3,0,3,1)) and =SUM(B1:INDEX(B:B,ROW()-1)) in B9 are no loops, as in Excel */
const ASKS = new Set(['OFFSET', 'INDEX', 'ROW', 'COLUMN', 'ROWS', 'COLUMNS']);
function walkRead(n, fn) {
  if (!n) return;
  fn(n);
  if (n.t === 'fn') n.args.forEach((x, i) => { if (i || !ASKS.has(n.n) || x.t !== 'ref' || x.sp) walkRead(x, fn); });
  else if (n.t === 'call') { walkRead(n.f, fn); for (const x of n.args) walkRead(x, fn); }
  else if (n.a) { walkRead(n.a, fn); if (n.b) walkRead(n.b, fn); }
}
function readsOf(ast, si, r, c, byName, fn, used) {
  walkRead(ast, x => {
    if (x.t === 'ref') {
      const ti = x.sheet == null ? si : byName.get(x.sheet.toLowerCase());
      if (ti != null) fn(ti, used ? G4(wrapAt(x.r1, r, x.ab[0], MAXR), wrapAt(x.c1, c, x.ab[1], MAXC), wrapAt(x.r2, r, x.ab[2], MAXR), wrapAt(x.c2, c, x.ab[3], MAXC)) : x.g);
    } else if (x.t === 'tref' || x.t === 'opt' || (x.t === 'name' && x.sheet == null && !nameOf(x, WB.sheets[si]) && tableByName(x.n))) {
      const R = trefRange(x.t === 'name' ? { tbl: x.n, sp: {}, cols: [] } : x, si, r, c);
      if (!isErr(R)) fn(WB.sheets.indexOf(R.s), R.g);
    } else if (x.t === 'name' || (x.t === 'fn' && !FUNCS[x.n])) {   // a defined name, also one called as a function (a name LET gave isn't one: nameOf finds none, or one that adds what it reads)
      const nm = nameOf(x.t === 'name' ? x : { n: x.n, sheet: null }, WB.sheets[si]), a = nm && !(used && used.has(nm)) ? astOf(nm.f) : null;
      if (a) readsOf(a, si, r, c, byName, fn, new Set(used || []).add(nm));
    }
  });
}
const NO_DD = new Map();
/* one pass over every formula; true when another is needed */
function calcPass(pass, st) {
  const sheets = WB.sheets, nodes = [], at = new Map(), cols = sheets.map(() => new Map()), num = new Map(sheets.map((s, i) => [s, i]));
  LIMR = 1; LIMC = 1; SUBT = false;
  KEPT.clear(); KEPT_N = 0;
  sheets.forEach((s, si) => {
    const u = usedEnd(s);
    LIMR = Math.max(LIMR, u.r); LIMC = Math.max(LIMC, u.c);
    s._sa0 = s._sa || new Map(); s._sa = new Map(); s._sp = new Map(s._pvc || []);   // with a pivot table's cells, as it stands
    s._dd0 = s._dd || NO_DD; s._dd = new Map();
    for (const [k, c] of s.cells) {
      if (!c.f) continue;
      at.set(si * 4e10 + k, nodes.length);
      nodes.push({ si, k, c });
      const col = kc(k); let l = cols[si].get(col); if (!l) cols[si].set(col, l = []); l.push(kr(k));
    }
  });
  for (const m of cols) for (const l of m.values()) l.sort((a, b) => a - b);
  const byName = new Map(sheets.map((s, i) => [s.name.toLowerCase(), i]));
  const indeg = new Int32Array(nodes.length), out = new Array(nodes.length), seq = new Int32Array(nodes.length).fill(-1);
  // the formulas a range of sheet si takes its values from, each through fn(its place in nodes): the ones in it, and
  // the ones that spill into it (areas: where each formula spilled)
  const inRange = (si, g, areas, fn) => {
    const fc = cols[si], hit = (r, c) => fn(at.get(si * 4e10 + KEY(r, c)));
    if (g.c2 - g.c1 + 1 > fc.size) { for (const [c, rows] of fc) if (c >= g.c1 && c <= g.c2) rowsIn(rows, g.r1, g.r2, r => hit(r, c)); }
    else for (let c = g.c1; c <= g.c2; c++) { const rows = fc.get(c); if (rows) rowsIn(rows, g.r1, g.r2, r => hit(r, c)); }
    for (const [k, area] of areas) if (meets(area, g)) hit(kr(k), kc(k));
  };
  nodes.forEach((n, i) => {
    const ast = !n.c.x && astOf(n.c.f);
    if (!ast) return;
    const seen = new Set();
    const dep = j => { if (j != null && !seen.has(j)) { seen.add(j); (out[j] || (out[j] = [])).push(i); indeg[i]++; } };
    const reads = (si, g) => inRange(si, g, sheets[si]._sa0, dep);
    readsOf(ast, n.si, kr(n.k), kc(n.k), byName, reads);
    const dd = sheets[n.si]._dd0.get(n.k);
    if (dd && !(st.doubt && st.doubt.has(n.c))) { n.dd = true; for (const d of dd) { const si = num.get(d.s); if (si != null) reads(si, d.g); } }
  });
  let tick = 0;
  const run = (list, deg) => {
    const q = list.filter(i => !deg[i]);
    for (let h = 0; h < q.length; h++) { const i = q[h]; seq[i] = tick++; evalCell(nodes[i]); for (const j of out[i] || []) if (--deg[j] === 0) q.push(j); }
    return q.length;
  };
  const done = run(nodes.map((_, i) => i), indeg);
  CIRC = null;
  if (done < nodes.length) {
    // the formulas left read each other in a loop, or read one that does: the loops show 0, and what reads them is worked out after
    const left = []; for (let i = 0; i < nodes.length; i++) if (indeg[i] > 0) left.push(i);
    const loop = loopsIn(left, out);
    const doubt = pass < 12 ? [...loop].filter(i => nodes[i].dd && !st.sure.has(nodes[i].c)) : [];
    if (doubt.length) {
      // this pass is dropped, and the next looks again at where these formulas point
      for (const s of sheets) { s._sa = s._sa0; s._dd = s._dd0; }
      if (!st.doubt) st.doubt = new Map();
      for (const i of doubt) st.doubt.set(nodes[i].c, nodes[i]);
      return true;
    }
    for (const i of loop) { const n = nodes[i], dd = sheets[n.si]._dd0.get(n.k); if (n.c.v !== 0) changedAt(sheets[n.si], kc(n.k)); n.c.v = 0; if (dd) sheets[n.si]._dd.set(n.k, dd); if (!CIRC) CIRC = n; }
    const rest = left.filter(i => !loop.has(i)), inRest = new Set(rest), deg = new Int32Array(nodes.length);
    for (const i of rest) for (const j of out[i] || []) if (inRest.has(j)) deg[j]++;
    run(rest, deg);
  }
  if (st.doubt) {
    // the formulas in doubt were worked out without their part of the order: the ones that still point where they did are in a real loop
    for (const [c, n] of st.doubt) if (sameDeps(sheets[n.si]._dd.get(n.k), sheets[n.si]._dd0.get(n.k))) st.sure.add(c);
    st.doubt = null;
    return true;
  }
  // a formula that points somewhere new took the right values if every formula there was worked out before it. One
  // that wasn't (or the formula itself) needs another pass, which has that part of the order
  const late = () => sheets.some((s, si) => {
    for (const [k, dd] of s._dd) {
      if (sameDeps(dd, s._dd0.get(k))) continue;
      const me = seq[at.get(si * 4e10 + k)];
      let found = false;
      for (const d of dd) { const sj = num.get(d.s); if (sj != null) inRange(sj, d.g, sheets[sj]._sa, j => { if (j != null && seq[j] >= me) found = true; }); }
      if (found) return true;
    }
    return false;
  });
  return (pass < 2 && sheets.some(s => !sameSpills(s._sa, s._sa0))) || (pass < 12 && late());
}
const sameMap = (a, b, eq) => { if (a.size !== b.size) return false; for (const [k, g] of a) if (!eq(g, b.get(k))) return false; return true; };
const sameSpills = (a, b) => sameMap(a, b, sameG);
const sameDeps = (a, b) => a === b || (!!a && !!b && a.length === b.length && a.every((d, i) => d.s === b[i].s && sameG(d.g, b[i].g)));
/* the formulas that are part of a loop (Tarjan's strongly connected parts, without recursion) */
function loopsIn(ids, out) {
  const inSet = new Set(ids), index = new Map(), low = new Map(), on = new Set(), st = [], loop = new Set();
  let n = 0;
  const succ = v => (out[v] || []).filter(w => inSet.has(w));
  for (const s of ids) {
    if (index.has(s)) continue;
    index.set(s, n); low.set(s, n); n++; st.push(s); on.add(s);
    const work = [[s, 0, succ(s)]];
    while (work.length) {
      const top = work[work.length - 1], v = top[0];
      if (top[1] < top[2].length) {
        const w = top[2][top[1]++];
        if (!index.has(w)) { index.set(w, n); low.set(w, n); n++; st.push(w); on.add(w); work.push([w, 0, succ(w)]); }
        else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
        continue;
      }
      work.pop();
      if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(low.get(u), low.get(v))); }
      if (low.get(v) === index.get(v)) {
        const comp = [];
        let w;
        do { w = st.pop(); on.delete(w); comp.push(w); } while (w !== v);
        if (comp.length > 1 || (out[v] || []).includes(v)) for (const x of comp) loop.add(x);
      }
    }
  }
  return loop;
}
function evalCell(n) {
  const c = n.c;
  if (c.x) return;   // the value from the file stays
  const ast = astOf(c.f);
  if (!ast) { c.v = E_NAME; return; }
  const r = kr(n.k), col = kc(n.k);
  CTX = { si: n.si, r, c: col, dyn: false };
  AX = !c.l;
  DDON = true; DD = null;
  let v;
  ENV = null; LAM_DEPTH = 0;
  try { v = ev(ast); } catch (e) { v = e instanceof Err ? e : tooDeep(e) ? E_NUM : E_VAL; }
  if (isLam(v)) v = E_CALC;
  AX = false; DDON = false; ENV = null;
  if (DD) { WB.sheets[n.si]._dd.set(n.k, DD); DD = null; }
  // an array (or a range) as the answer spills into the cells below and beside, as in Excel 365; a formula from an
  // older file takes the one cell in its own row or column instead
  if (c.l) v = scal(v);
  else if (isA(v)) v = spill(WB.sheets[n.si], n.k, r, col, v);
  if (v == null) v = 0;
  else if (typeof v === 'number' && !Number.isFinite(v)) v = E_NUM;
  if (c.v !== v) changedAt(WB.sheets[n.si], col);
  c.v = v;
  c.dx = CTX.dyn;
  if (CTX.link != null) c.hl = CTX.link; else if (c.hl) delete c.hl;   // what HYPERLINK gave: the cell follows it when clicked
}
/* an array answer: its first value stays in the formula's cell, the rest fill the cells beside and below. Anything in
   the way (a value, a merged cell, another formula's spill) gives #SPILL! */
function spill(s, k, r, c, v) {
  const A = toArr(v);
  if (isErr(A)) return A;
  if (A.h === 1 && A.w === 1) return A.d[0];
  CTX.dyn = true;
  const g = { r1: r, c1: c, r2: r + A.h - 1, c2: c + A.w - 1 };
  if (g.r2 >= MAXR || g.c2 >= MAXC || (s.merges.length && s.merges.some(m => meets(m, g)))) return E_SPILL;
  for (let i = 0; i < A.h; i++) for (let j = 0; j < A.w; j++) {
    if (!i && !j) continue;
    const key = KEY(r + i, c + j);
    if (hasVal(s.cells.get(key)) || s._sp.has(key)) return E_SPILL;
  }
  for (let i = 0; i < A.h; i++) for (let j = 0; j < A.w; j++) if (i || j) s._sp.set(KEY(r + i, c + j), { v: isLam(A.d[i * A.w + j]) ? E_CALC : zero(A.d[i * A.w + j]), a: k });
  s._sv = (s._sv || 0) + 1;
  s._sa.set(k, g);
  return isLam(A.d[0]) ? E_CALC : A.d[0];
}

/* --- formulas rewritten: tidied when typed, moved when copied, and kept pointing at the same cells when rows,
   columns or sheets change around them --- */
function sheetPrefix(name) {
  if (name == null) return '';
  const plain = /^[\p{L}_][\p{L}\p{N}_.]*$/u.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) && !/^(R\d*C?\d*|C\d*|TRUE|FALSE)$/i.test(name);
  return plain ? name + '!' : "'" + name.replace(/'/g, "''") + "'!";
}
function refText(t, g, sheet = t.sheet) {
  const p = sheetPrefix(sheet), a = t.a, cell = (r, c, ar, ac) => (ac ? '$' : '') + colName(c) + (ar ? '$' : '') + (r + 1);
  if (t.k === 'c') return p + cell(g.r1, g.c1, a[0], a[1]) + (t.sp ? '#' : '');
  if (t.k === 'a') return p + cell(g.r1, g.c1, a[0], a[1]) + ':' + cell(g.r2, g.c2, a[2], a[3]);
  if (t.k === 'C') return p + (a[1] ? '$' : '') + colName(g.c1) + ':' + (a[3] ? '$' : '') + colName(g.c2);
  return p + (a[0] ? '$' : '') + (g.r1 + 1) + ':' + (a[2] ? '$' : '') + (g.r2 + 1);
}
/* a formula with each reference changed by fn (null: as it is); names: fn gets the defined names in it too */
function mapRefs(f, fn, names) {
  const toks = tokenize(f);
  let changed = false;
  const out = toks.map(t => { if (t.t !== 'ref' && !(names && (t.t === 'name' || (t.t === 'fn' && !FUNCS[t.n])))) return t.s; const n = fn(t); if (n == null || n === t.s) return t.s; changed = true; return n; });   // (a name called as a function, Double(4), is one of the names too)
  return changed ? out.join('') : f;
}
/* the way Excel keeps a typed formula: functions and references in capitals, a sheet's name and a defined name the way
   they are written where they were made */
function tidyFormula(f, book = WB) {
  return tokenize(f).map(t => {
    if (t.t === 'fn') {   // a function in capitals; a name called as a function (one LET gave, or a defined name) the way it is written
      if (FUNCS[t.n]) return t.s.replace(/^(_xl(?:fn|ws)\.)?(.*)$/i, (m, p, n) => (p ? p.toLowerCase() : '') + n.toUpperCase());
      const nm = book ? nameIndex(book).any.get(t.s.toLowerCase()) : null;
      return nm ? nm.n : t.s;
    }
    if (t.t === 'ref') { const s = t.sheet == null || !book ? null : book.sheets.find(x => x.name.toLowerCase() === t.sheet.toLowerCase()); return refText(t, t, s ? s.name : t.sheet); }
    if (t.t === 'name') {
      const s = t.sheet == null || !book ? null : book.sheets.find(x => x.name.toLowerCase() === t.sheet.toLowerCase()), nm = book ? nameIndex(book).any.get(t.n.toLowerCase()) : null;
      return sheetPrefix(s ? s.name : t.sheet) + (nm ? nm.n : t.n);
    }
    if (t.t === 'bool' || t.t === 'err') return t.s.toUpperCase();
    if (t.t === ',') return ',';
    return t.s;
  }).join('');
}
const offSheet = g => g.r1 < 0 || g.c1 < 0 || g.r2 < 0 || g.c2 < 0 || g.r1 >= MAXR || g.r2 >= MAXR || g.c1 >= MAXC || g.c2 >= MAXC;
/* a formula copied dr rows and dc columns away: its relative parts move with it; what falls off the sheet is #REF! */
function shiftFormula(f, dr, dc) {
  if (!dr && !dc) return f;
  return mapRefs(f, t => {
    const a = t.a, g = { r1: t.r1 + (a[0] ? 0 : dr), c1: t.c1 + (a[1] ? 0 : dc), r2: t.r2 + (a[2] ? 0 : dr), c2: t.c2 + (a[3] ? 0 : dc) };
    return offSheet(g) ? sheetPrefix(t.sheet) + '#REF!' : refText(t, g);
  });
}
/* n rows (axis 'r') or columns put in at `at` of sheet shName (n < 0: taken out). References to that sheet move;
   one to what was taken out becomes #REF!, and a range loses the part that was taken out */
function spliceFormula(f, selfName, shName, axis, at, n) {
  const low = shName.toLowerCase();
  return mapRefs(f, t => {
    if ((t.sheet ?? selfName).toLowerCase() !== low) return null;
    const R = axis === 'r';
    if ((R && t.k === 'C') || (!R && t.k === 'R')) return null;
    let lo = R ? Math.min(t.r1, t.r2) : Math.min(t.c1, t.c2), hi = R ? Math.max(t.r1, t.r2) : Math.max(t.c1, t.c2);
    const max = R ? MAXR : MAXC;
    if (n > 0) { if (lo >= at) lo += n; if (hi >= at) hi += n; if (lo >= max) return sheetPrefix(t.sheet) + '#REF!'; hi = Math.min(hi, max - 1); }
    else {
      const end = at - n - 1;
      if (lo >= at && hi <= end) return sheetPrefix(t.sheet) + '#REF!';
      lo = lo > end ? lo + n : lo >= at ? at : lo;
      hi = hi > end ? hi + n : hi >= at ? at - 1 : hi;
    }
    const g = R ? { r1: lo, r2: hi, c1: Math.min(t.c1, t.c2), c2: Math.max(t.c1, t.c2) } : { c1: lo, c2: hi, r1: Math.min(t.r1, t.r2), r2: Math.max(t.r1, t.r2) };
    return refText(t, g);
  });
}
/* cells g of sheet `from` cut and pasted dr, dc away into sheet `to`: what pointed at them follows them */
function moveFormula(f, selfName, from, g, dr, dc, to) {
  const low = from.toLowerCase();
  return mapRefs(f, t => {
    if ((t.sheet ?? selfName).toLowerCase() !== low) return null;
    const r = G4(t.r1, t.c1, t.r2, t.c2);
    if (!(r.r1 >= g.r1 && r.r2 <= g.r2 && r.c1 >= g.c1 && r.c2 <= g.c2)) return null;
    const ng = { r1: t.r1 + dr, c1: t.c1 + dc, r2: t.r2 + dr, c2: t.c2 + dc };
    if (offSheet(ng)) return sheetPrefix(t.sheet) + '#REF!';
    const sheet = to.toLowerCase() === low ? t.sheet : to.toLowerCase() === selfName.toLowerCase() ? null : to;
    return refText(t, ng, sheet);
  });
}
/* a formula that moved to another sheet keeps pointing at the sheet it came from */
const anchorFormula = (f, from) => mapRefs(f, t => t.sheet == null ? refText(t, t, from) : null);
const renameInFormula = (f, oldName, newName) => mapRefs(f, t => t.sheet == null || t.sheet.toLowerCase() !== oldName.toLowerCase() ? null : t.t === 'name' ? sheetPrefix(newName) + t.n : refText(t, t, newName), true);
const dropSheetInFormula = (f, name) => mapRefs(f, t => t.sheet != null && t.sheet.toLowerCase() === name.toLowerCase() ? '#REF!' : null, true);

/* =========================================================
   defined names, as Excel's: a name for cells (Fruits is Lists!$A$2:$A$9), for a number or for a formula, to use in
   formulas, as a list's source and in conditional formatting. The workbook's names are WB.names, each { n the name,
   f what it stands for (a formula without its =, its sheets written out), s the id of the sheet it belongs to (none:
   the whole workbook, as most do), c a note, h hidden (from a file) }. The list is never changed in place, so undo
   can keep the old one. On a sheet, that sheet's own name comes before the workbook's of the same name.
   A reference in f without $ is written for cell A1 and moves with the cell that uses the name, as Excel's files keep
   relative names
   ========================================================= */
const NO_NAMES = [], MAX_NAMES = 5000;
const NAME_RE = /^[\p{L}_\\][\p{L}\p{N}_.?\\]*$/u;
const nameKey = x => (x.s || '') + '|' + x.n.toLowerCase();
const sortNames = list => list.sort((a, b) => { const x = a.n.toLowerCase(), y = b.n.toLowerCase(); return x < y ? -1 : x > y ? 1 : (a.s || '') < (b.s || '') ? -1 : (a.s || '') > (b.s || '') ? 1 : 0; });
/* a name from storage, a file, a room or Claude: anything that reads as one name in a formula (so not B2, nor TRUE).
   Its sheet has to be one of sheets (from a room, where the sheet may still be on its way: any id) */
function normName(x, sheets) {
  if (!x || typeof x !== 'object' || typeof x.n !== 'string' || typeof x.f !== 'string') return null;
  const n = x.n.trim(), f = x.f.trim().replace(/^=/, '').slice(0, 8000), toks = n.length <= 255 && NAME_RE.test(n) ? tokenize(n) : [];
  if (!f || toks.length !== 1 || toks[0].t !== 'name') return null;
  const o = { n, f };
  if (x.s != null) { if (sheets ? !sheets.some(s => s.id === x.s) : !okId(x.s)) return null; o.s = x.s; }
  const c = typeof x.c === 'string' ? x.c.replace(/[\x00-\x1f]+/g, ' ').trim().slice(0, 255) : '';
  if (c) o.c = c;
  if (x.h === true) o.h = true;
  return o;
}
function normNames(list, sheets) {
  const out = [], seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    const o = normName(x, sheets), k = o && nameKey(o);
    if (!o || seen.has(k)) continue;
    seen.add(k); out.push(o);
    if (out.length >= MAX_NAMES) break;
  }
  return sortNames(out);
}
const nameOut = x => ({ n: x.n, f: x.f, ...(x.s ? { s: x.s } : {}), ...(x.c ? { c: x.c } : {}), ...(x.h ? { h: true } : {}) });
const sameNames = (a, b) => a.length === b.length && a.every((x, i) => x === b[i] || (x.n === b[i].n && x.f === b[i].f && (x.s || '') === (b[i].s || '') && (x.c || '') === (b[i].c || '') && !x.h === !b[i].h));
/* the names by scope and name, made again when the list changes; any: a name by its letters alone, whatever its scope */
const NIX = { a: null, m: null, any: null };
function nameIndex(book) {
  const a = book.names || NO_NAMES;
  if (NIX.a !== a) {
    NIX.a = a; NIX.m = new Map(); NIX.any = new Map();
    for (const x of a) { NIX.m.set(nameKey(x), x); const low = x.n.toLowerCase(); if (!x.s || !NIX.any.has(low)) NIX.any.set(low, x); }
  }
  return NIX;
}
/* the name a formula on sheet s means by n ({ n, sheet: the sheet written before it, if any }) */
function nameOf(n, s, book = WB) {
  const m = nameIndex(book).m, low = n.n.toLowerCase();
  if (n.sheet != null) { const q = n.sheet.toLowerCase(), sh = book.sheets.find(x => x.name.toLowerCase() === q); return sh ? m.get(sh.id + '|' + low) || m.get('|' + low) || null : null; }
  return (s && m.get(s.id + '|' + low)) || m.get('|' + low) || null;
}
/* what Excel reads as an address and not as a name: a cell (B2), and whatever starts as an R1C1 one (R1, C3PO, RC2) */
const a1Like = n => { const m = /^([A-Za-z]{1,3})(\d+)$/.exec(n); return !!m && colNum(m[1]) < MAXC && +m[2] >= 1 && +m[2] <= MAXR; };
const rcLike = n => { const m = /^(rc|r|c)(\d+)/i.exec(n); return !!m && +m[2] >= 1 && +m[2] <= (m[1].toLowerCase() === 'r' ? MAXR : MAXC); };
const NAME_WORD = /^(true|false|r|c|rc)$/i;
/* why a new name can't be used, in words; null when it can. Excel's rules, as measured there: letters, digits, _ . ?
   and \ after a first letter or _; no spaces; not TRUE or FALSE; and nothing Excel could read as an address (B2, R1C1) */
function nameProblem(n) {
  if (!n) return T('צריך לכתוב שם');
  if (n.length > 255) return T('השם ארוך מדי (עד 255 תווים)');
  if (/\s/.test(n)) return T('בשם אין רווחים. אפשר לכתוב קו תחתון במקומם: {0}', n.trim().replace(/\s+/g, '_'));
  if (!/^[\p{L}_][\p{L}\p{N}_.?\\]*$/u.test(n)) return T('שם מתחיל באות או בקו תחתון, ויש בו רק אותיות, ספרות, נקודות וקווים תחתונים');
  if (a1Like(n) || rcLike(n) || NAME_WORD.test(n)) return T('אי אפשר להשתמש בשם {0}, כי בנוסחאות הוא כבר אומר משהו אחר (כתובת של תא, או TRUE ו-FALSE)', n);
  return null;
}
/* the workbook's names take a new list, inside edit() so undo takes it back */
function setNames(list) {
  const next = sortNames(list.slice());
  if (sameNames(next, WB.names || NO_NAMES)) return;
  if (TX && TX.names === undefined) TX.names = WB.names || NO_NAMES;
  if (RM.on) RM.names = true;
  WB.names = next;
  // a formula kept as its file had it, because its name wasn't here, is worked out now that the name is
  for (const s of WB.sheets) {
    const back = [];
    for (const [k, x] of s.cells) if (x.x && !missingIn(x.f, s)) back.push([k, x]);
    for (const [k, x] of back) { const y = { ...x }; delete y.x; if (olderWay(y.f)) y.l = true; setCell(s, kr(k), kc(k), y); }
  }
}
/* each name's formula through fn(formula, name) */
function eachName(fn) {
  const cur = WB.names || NO_NAMES;
  if (cur.length) setNames(cur.map(x => { const f = fn(x.f, x); return f === x.f ? x : { ...x, f }; }));
}
/* a range the way a name keeps it: every part fixed with $, and its sheet written out */
const absA1 = g => wholeCols(g) && !wholeRows(g) ? '$' + colName(g.c1) + ':$' + colName(g.c2) : wholeRows(g) && !wholeCols(g) ? '$' + (g.r1 + 1) + ':$' + (g.r2 + 1)
  : '$' + colName(g.c1) + '$' + (g.r1 + 1) + (g.r1 === g.r2 && g.c1 === g.c2 ? '' : ':$' + colName(g.c2) + '$' + (g.r2 + 1));
const nameRefText = (s, g) => sheetPrefix(s.name) + absA1(g);
/* the cells a name stands for, when it is a plain reference to cells: { s, g, fixed: every part has its $ } */
function nameCells(x, book = WB) {
  const a = astOf(x.f);
  if (!a || a.t !== 'ref' || a.sp || a.sheet == null) return null;
  const q = a.sheet.toLowerCase(), s = book.sheets.find(y => y.name.toLowerCase() === q);
  return s ? { s, g: a.g, fixed: a.ab.every(Boolean) } : null;
}
/* what was typed as a name's "refers to": a formula (the = may be left out), tidied. A single address typed without $
   gets them, because a name's cells stay where they are; an address without a sheet gets sheet s. { f } or { err } */
function nameFormulaIn(text, s, book = WB) {
  const t = closeBrackets(String(text ?? '').trim().replace(/^=/, '').trim());
  if (!t) return { err: T('צריך לכתוב למה השם מתייחס: טווח של תאים, מספר או נוסחה') };
  if (!astOf(t)) return { err: T('לא הבנתי למה השם מתייחס. כותבים טווח כמו {0}, מספר או נוסחה.', '=' + nameRefText(s, { r1: 1, c1: 0, r2: 9, c2: 0 })) };
  const toks = tokenize(t).filter(k => k.t !== 'ws'), lone = toks.length === 1 && toks[0].t === 'ref' && !toks[0].a.some(Boolean);
  return { f: tidyFormula(mapRefs(t, k => { const a = lone ? [true, true, true, true] : k.a; return refText({ ...k, a }, k, k.sheet ?? s.name); }), book) };
}
/* --- names from the labels around a selection, as Excel's Create from Selection (each rule here was measured there) --- */
/* a label cell's text: a text, or a date the way it shows. No other number is a label, nor TRUE, FALSE or an error */
function labelText(s, r, c) {
  const x = cellSp(s, r, c), v = x ? x.v : null;
  if (typeof v === 'string') return v;
  const nf = typeof v === 'number' && x.st ? x.st.nf : null, k = nf ? nfKind(nf) : '';
  return k === 'date' || k === 'ldate' ? fmtNumber(v, nf).t || '' : '';
}
/* a label as a name, the way Excel writes it: what a name can't have goes from the ends and becomes _ inside; a digit,
   a dot or a ? at the start gets _ before it; what reads as an address gets _ after it (A1_), or before it when it
   reads as an R1C1 one (_R1C1); TRUE and FALSE get _ after. '' when no name comes out (%, or a lone _) */
const NAME_JUNK = /[^\p{L}\p{N}_.?\\]/gu, NAME_ENDS = /^[^\p{L}\p{N}_.?\\]+|[^\p{L}\p{N}_.?\\]+$/gu;
function labelName(text) {
  let n = String(text).replace(/[\p{M}\p{Cf}]/gu, '').replace(NAME_ENDS, '').replace(NAME_JUNK, '_');
  if (!n || n === '_' || n[0] === '\\') return '';
  if (/^[\p{N}.?]/u.test(n) || rcLike(n)) n = '_' + n;
  else if (a1Like(n) || NAME_WORD.test(n)) n += '_';
  n = n.slice(0, 255);
  return nameProblem(n) ? '' : n;
}
/* the names the labels on the chosen sides of range g of sheet s make: [{ n, g: the cells it names }]. side: t the top
   row, l the first column, b the bottom row, e the last column. A label names the cells of its column (or row) that
   are inside the other sides' labels, and a corner between two chosen sides names all of them. Excel's order, so that
   a later label with an earlier one's name takes its place: top, first column, bottom, last column, and the corners
   last */
function labelNames(s, g, side) {
  const d = { r1: g.r1 + (side.t ? 1 : 0), c1: g.c1 + (side.l ? 1 : 0), r2: g.r2 - (side.b ? 1 : 0), c2: g.c2 - (side.e ? 1 : 0) };
  if (d.r1 > d.r2 || d.c1 > d.c2) return [];
  const u = usedEnd(s), out = new Map(), corners = [];
  const add = (r, c, cells) => { const n = labelName(labelText(s, r, c)); if (n) out.set(n.toLowerCase(), { n, g: cells }); };
  const row = r => { for (let c = g.c1; c <= g.c2 && c < u.c; c++) if ((side.l && c === g.c1) || (side.e && c === g.c2)) corners.push([r, c]); else add(r, c, { r1: d.r1, c1: c, r2: d.r2, c2: c }); };
  const col = c => { for (let r = g.r1; r <= g.r2 && r < u.r; r++) if (!((side.t && r === g.r1) || (side.b && r === g.r2))) add(r, c, { r1: r, c1: d.c1, r2: r, c2: d.c2 }); };
  if (side.t) row(g.r1);
  if (side.l) col(g.c1);
  if (side.b) row(g.r2);
  if (side.e) col(g.c2);
  for (const [r, c] of corners) add(r, c, d);
  return [...out.values()];
}
/* the sides Excel looks at when it isn't told which: the row whose second cell is a label (the top one, or else the
   bottom one) and the column whose second cell is (the first, or else the last); in one row or one column, the end
   that is a label */
function labelSides(s, g) {
  const is = (r, c) => labelText(s, r, c).trim() !== '', rows = g.r2 > g.r1, cols = g.c2 > g.c1;
  if (!rows || !cols) { const a = is(g.r1, g.c1), z = !a && is(g.r2, g.c2); return rows ? { t: a, l: false, b: z, e: false } : { t: false, l: cols && a, b: false, e: cols && z }; }
  const t = is(g.r1, g.c1 + 1), l = is(g.r1 + 1, g.c1);
  return { t, l, b: !t && is(g.r2, g.c1 + 1), e: !l && is(g.r1 + 1, g.c2) };
}
/* the workbook's names with those of list (labelNames) for sheet s: a name the sheet has of its own, or else the
   workbook's, takes the new cells and the label's capitals, and a name that isn't there is added to the workbook */
function withLabelNames(s, list) {
  const names = (WB.names || NO_NAMES).slice(), at = new Map();
  names.forEach((y, i) => { if (!y.s || y.s === s.id) at.set((y.s ? '1' : '0') + y.n.toLowerCase(), i); });
  for (const x of list) {
    const low = x.n.toLowerCase(), f = nameRefText(s, x.g), i = at.get('1' + low) ?? at.get('0' + low);
    if (i == null) names.push({ n: x.n, f }); else names[i] = { ...names[i], n: x.n, f };
  }
  return names;
}
/* a name changed its letters: every formula that meant it says the new ones */
function renameName(old, to) {
  const swap = (f, s) => mapRefs(f, t => (t.t === 'name' ? nameOf(t, s) : t.t === 'fn' ? nameOf({ n: t.s, sheet: null }, s) : null) === old ? sheetPrefix(t.sheet) + to : null, true);
  for (const s of WB.sheets) {
    for (const [k, x] of [...s.cells]) if (x.f != null) { const f = swap(x.f, s); if (f !== x.f) setCell(s, kr(k), kc(k), { ...x, f }); }
    for (const key of RULE_KEYS) eachRuleOf(s, key, f => swap(f, s));
  }
  eachChart((f, self) => swap(f, WB.sheets.find(s => s.name === self)));   // a chart whose range is the name
  return (WB.names || NO_NAMES).map(x => { if (x === old) return x; const f = swap(x.f, x.s ? WB.sheets.find(s => s.id === x.s) : null); return f === x.f ? x : { ...x, f }; });
}

/* =========================================================
   the sheet on screen: what is chosen, the sizes of rows and columns, and every change as one step undo takes back
   ========================================================= */
/* r, c: the active cell (it starts every range); er, ec: the range's other corner */
let SEL = { r: 0, c: 0, er: 0, ec: 0 };
const cellAt = (s, r, c) => s.cells.get(KEY(r, c));
/* the look of an empty cell: the whole sheet's, then its column's and its row's (Excel keeps formats of whole columns) */
function emptyLook(s, r, c) {
  const a = s.ds, b = s.cs.get(c), d = s.rs.get(r);
  return a || b || d ? { ...(a || {}), ...(b || {}), ...(d || {}) } : null;
}
const lookAt = (s, r, c) => { const x = cellAt(s, r, c); return x ? x.st || null : emptyLook(s, r, c); };
const hasVal = x => !!x && (x.f != null || (x.v != null && x.v !== ''));
/* a cell, or for an empty one a formula spills into, a stand-in with the spilled value, the cell's own look, and the
   formula's number format when the cell has none */
function cellSp(s, r, c) {
  const x = cellAt(s, r, c);
  if (x && x.v !== undefined) return x;
  const o = s._sp && s._sp.get(KEY(r, c));
  if (!o) return x;
  let st = x ? x.st : emptyLook(s, r, c);
  if (o.st) st = { ...o.st, ...(st || {}) };   // a pivot table's own look
  const a = s.cells.get(o.a), nf = a && a.st && a.st.nf;
  if (nf && !(st && st.nf)) st = { ...(st || {}), nf };
  return st ? { v: o.v, st, sp: o.a } : { v: o.v, sp: o.a };
}
const filled = (s, r, c) => hasVal(cellAt(s, r, c)) || !!(s._sp && s._sp.has(KEY(r, c)));
/* the cells a formula's array fills, when (r, c) is that formula or one of them */
function spillArea(s, r, c) {
  if (!s._sa || !s._sa.size) return null;
  const k = KEY(r, c), o = s._sp.get(k);
  return s._sa.get(o ? o.a : k) || null;
}
/* the merged area a cell is in (a map of them, made again when the list of merges changes) */
const MM = { arr: null, map: null };
function mergeAt(s, r, c) {
  if (!s.merges.length) return null;
  if (MM.arr !== s.merges) {
    MM.arr = s.merges; MM.map = null;
    let n = 0;
    for (const m of s.merges) n += (m.r2 - m.r1 + 1) * (m.c2 - m.c1 + 1);
    if (n < 300000) { MM.map = new Map(); for (const m of s.merges) for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) MM.map.set(KEY(r, c), m); }
  }
  if (MM.map) return MM.map.get(KEY(r, c)) || null;
  for (const m of s.merges) if (inG(m, r, c)) return m;
  return null;
}
/* the chosen range, grown to take in whole merged areas it touches. whole: 'c' columns, 'r' rows, 'a' the sheet */
function selG(sel = SEL) {
  const g = G4(sel.r, sel.c, sel.er, sel.ec);
  if (sel.whole === 'c' || sel.whole === 'a') { g.r1 = 0; g.r2 = MAXR - 1; }
  if (sel.whole === 'r' || sel.whole === 'a') { g.c1 = 0; g.c2 = MAXC - 1; }
  if (!WS.merges.length || wholeCols(g) || wholeRows(g)) return g;
  for (let again = true; again;) {
    again = false;
    for (const m of WS.merges) if (meets(m, g) && !(m.r1 >= g.r1 && m.r2 <= g.r2 && m.c1 >= g.c1 && m.c2 <= g.c2)) { g.r1 = Math.min(g.r1, m.r1); g.c1 = Math.min(g.c1, m.c1); g.r2 = Math.max(g.r2, m.r2); g.c2 = Math.max(g.c2, m.c2); again = true; }
  }
  return g;
}
/* the last row and column with anything in them (+1), and the range from A1 to there */
function usedEnd(s) {
  let r = 0, c = 0;
  for (const k of s.cells.keys()) { const rr = kr(k) + 1, cc = kc(k) + 1; if (rr > r) r = rr; if (cc > c) c = cc; }
  for (const m of s.merges) { r = Math.max(r, m.r2 + 1); c = Math.max(c, m.c2 + 1); }
  for (const m of [s._sa, s._pva]) if (m) for (const g of m.values()) { r = Math.max(r, g.r2 + 1); c = Math.max(c, g.c2 + 1); }   // what formulas spill, and pivot tables
  return { r, c };
}
function usedRange(s) {
  let r2 = -1, c2 = -1;
  for (const [k, x] of s.cells) { if (!hasVal(x) && !x.st) continue; const r = kr(k), c = kc(k); if (r > r2) r2 = r; if (c > c2) c2 = c; }
  for (const m of s.merges) { r2 = Math.max(r2, m.r2); c2 = Math.max(c2, m.c2); }
  for (const m of [s._sa, s._pva]) if (m) for (const g of m.values()) { r2 = Math.max(r2, g.r2); c2 = Math.max(c2, g.c2); }   // what formulas spill, and pivot tables, as in Excel
  return r2 < 0 ? null : { r1: 0, c1: 0, r2, c2 };
}
/* the block of filled cells around a cell, the way Excel finds a table (for sorting, filtering and AutoSum) */
function region(s, r, c) {
  const g = { r1: r, c1: c, r2: r, c2: c }, full = (rr, cc) => filled(s, rr, cc);
  const lineHas = (ra, ca, rb, cb) => { for (let rr = Math.max(0, ra); rr <= Math.min(MAXR - 1, rb); rr++) for (let cc = Math.max(0, ca); cc <= Math.min(MAXC - 1, cb); cc++) if (full(rr, cc)) return true; return false; };
  for (let grew = true; grew && g.r2 - g.r1 < 200000;) {
    grew = false;
    if (g.r1 > 0 && lineHas(g.r1 - 1, g.c1 - 1, g.r1 - 1, g.c2 + 1)) { g.r1--; grew = true; }
    if (g.r2 < MAXR - 1 && lineHas(g.r2 + 1, g.c1 - 1, g.r2 + 1, g.c2 + 1)) { g.r2++; grew = true; }
    if (g.c1 > 0 && lineHas(g.r1 - 1, g.c1 - 1, g.r2 + 1, g.c1 - 1)) { g.c1--; grew = true; }
    if (g.c2 < MAXC - 1 && lineHas(g.r1 - 1, g.c2 + 1, g.r2 + 1, g.c2 + 1)) { g.c2++; grew = true; }
  }
  return g;
}

/* --- sizes: the width of each column and height of each row (0 when hidden or filtered out), and where each one
   starts. Only the ones that differ from the sheet's default are kept, sorted, with running sums --- */
let GEO = null;
function axisOf(n, def, custom, hidden, hidden2) {
  const d = new Map();
  for (const [i, w] of custom) d.set(i, w - def);
  for (const i of hidden) d.set(i, -def);
  if (hidden2) for (const i of hidden2) d.set(i, -def);
  const idx = [...d.keys()].sort((a, b) => a - b), pre = new Float64Array(idx.length + 1);
  idx.forEach((i, j) => { pre[j + 1] = pre[j] + d.get(i); });
  return { def, idx, pre, n, size: i => def + (d.has(i) ? d.get(i) : 0) };
}
function geo() {
  if (!GEO || GEO.s !== WS || GEO.dirty) GEO = { s: WS, cols: axisOf(MAXC, WS.dw, WS.cw, WS.hc), rows: axisOf(MAXR, WS.dh, WS.rh, WS.hr, WS._fh), dirty: false };
  return GEO;
}
const geoDirty = () => { if (GEO) GEO.dirty = true; };
function startOf(ax, i) {
  let a = 0, b = ax.idx.length;
  while (a < b) { const m = (a + b) >> 1; if (ax.idx[m] < i) a = m + 1; else b = m; }
  return i * ax.def + ax.pre[a];
}
function indexAt(ax, x) {
  if (x <= 0) return 0;
  let a = 0, b = ax.n - 1;
  while (a < b) { const m = (a + b + 1) >> 1; if (startOf(ax, m) <= x) a = m; else b = m - 1; }
  return a;
}
/* screen pixels, with the zoom: where column c starts (after the row numbers), its width, and the same for rows */
let Z = 1, RHW = 46, CHH = 22;
const colX = c => RHW + startOf(geo().cols, c) * Z, colW = c => geo().cols.size(c) * Z;
const rowY = r => CHH + startOf(geo().rows, r) * Z, rowH = r => geo().rows.size(r) * Z;
const colAtX = x => indexAt(geo().cols, (x - RHW) / Z), rowAtY = y => indexAt(geo().rows, (y - CHH) / Z);
const spanW = (c1, c2) => colX(c2 + 1) - colX(c1), spanH = (r1, r2) => rowY(r2 + 1) - rowY(r1);
/* the rows the filter hides, worked out again after every change */
function filterRows(s) {
  const f = s.af, hide = new Set();
  if (f) {
    const crit = Object.entries(f.hide).filter(([, v]) => v.length).map(([c, v]) => [+c, new Set(v)]);
    if (crit.length) for (let r = f.r1 + 1; r <= f.r2; r++) for (const [c, set] of crit) if (set.has(shown(s, r, c))) { hide.add(r); break; }
  }
  const same = s._fh && s._fh.size === hide.size && [...hide].every(r => s._fh.has(r));
  if (!same) { s._fh = hide; geoDirty(); }
}

/* --- undo: a step keeps each changed cell and sheet setting before and after, and the selection --- */
const HIST = { list: [], at: 0 };
let TX = null;
const selSnap = () => ({ sid: WS.id, ...SEL });
function edit(fn) {
  if (TX) { fn(); return true; }
  const tx = TX = { cells: new Map(), props: new Map(), book: null, names: undefined, sel0: selSnap() };
  try { fn(); if (tx.cells.size) headersWritten(tx); } finally { TX = null; }
  const cells = [], props = [];
  for (const x of tx.cells.values()) { const after = x.s.cells.get(x.k) || null; if (after !== x.before) cells.push({ ...x, after }); }
  for (const x of tx.props.values()) { const after = x.s[x.name]; if (after !== x.before) props.push({ ...x, after }); }
  let book = null;
  if (tx.book) { const a = { sheets: [...WB.sheets], dir: WB.dir }, b = tx.book; if (a.dir !== b.dir || a.sheets.length !== b.sheets.length || a.sheets.some((s, i) => s !== b.sheets[i])) book = { before: b, after: a }; }
  const names = tx.names !== undefined && tx.names !== WB.names ? { before: tx.names, after: WB.names } : null;
  if (!cells.length && !props.length && !book && !names) { refresh(); return false; }
  HIST.list.length = HIST.at;
  HIST.list.push({ cells, props, book, names, sel0: tx.sel0, sel1: selSnap() });
  if (HIST.list.length > 300) HIST.list.shift();
  HIST.at = HIST.list.length;
  changed();
  return true;
}
function setCell(s, r, c, cell) {
  const k = KEY(r, c);
  if (TX) { const id = s.id + '|' + k; if (!TX.cells.has(id)) TX.cells.set(id, { s, k, before: s.cells.get(k) || null }); }
  if (RM.on) RM.cells.add(s.id + '|' + k);
  if (cell) s.cells.set(k, cell); else s.cells.delete(k);
}
function setProp(s, name, val) {
  if (TX) { const id = s.id + '|' + name; if (!TX.props.has(id)) TX.props.set(id, { s, name, before: s[name] }); }
  if (RM.on) (name === 'ri' || name === 'ci' ? RM.lists : RM.props).add(s.id);
  s[name] = val;
}
function bookStep(fn) {
  if (TX && !TX.book) TX.book = { sheets: [...WB.sheets], dir: WB.dir };
  if (RM.on) RM.book = true;
  fn();
}
function applyStep(st, back) {
  for (const x of st.cells) { const v = back ? x.before : x.after; if (v) x.s.cells.set(x.k, v); else x.s.cells.delete(x.k); if (RM.on) RM.cells.add(x.s.id + '|' + x.k); }
  for (const x of st.props) { x.s[x.name] = back ? x.before : x.after; if (RM.on) (x.name === 'ri' || x.name === 'ci' ? RM.lists : RM.props).add(x.s.id); }
  if (st.book) { const b = back ? st.book.before : st.book.after; WB.sheets = [...b.sheets]; WB.dir = b.dir; if (RM.on) RM.book = true; }
  if (st.names) { WB.names = back ? st.names.before : st.names.after; if (RM.on) RM.names = true; }
  const snap = back ? st.sel0 : st.sel1, s = WB.sheets.find(x => x.id === snap.sid) || WB.sheets[0];
  if (s !== WS) showSheet(s, true);
  SEL = { r: snap.r, c: snap.c, er: snap.er, ec: snap.ec };
  changed();
  scrollToSel();
}
function undo() {
  if (ED.on) { endEdit(false); return; }
  if (!HIST.at) { toast(T('אין מה לבטל')); return; }
  applyStep(HIST.list[--HIST.at], true);
}
function redo() {
  if (ED.on || HIST.at >= HIST.list.length) return;
  applyStep(HIST.list[HIST.at++], false);
}
/* after any change: the formulas again, the filters, the drawing, and the save */
function changed() {
  geoDirty();
  recalc();
  CHV++;
  let again = false;
  for (const s of WB.sheets) { const before = s._fh; filterRows(s); if (SUBT && s._fh !== before) again = true; }
  if (again) recalc();   // SUBTOTAL counts only the rows the filter leaves
  markDirty();
  refresh();
}
function refresh() {
  if (!WB || !V.view) return;
  render();
  renderTabs();
  selInfo();
}
const renderSoon = rafOnce(() => { if (WB && V.view) render(); });

/* =========================================================
   drawing: only the cells in view. Inside one scrolling box there are four layers: the cells that scroll, and three
   that stay put (sticky): the column letters with the frozen rows, the row numbers with the frozen columns, and the
   corner where they meet. Each layer keeps its elements by key, and changes only what changed
   ========================================================= */
const V = {};
const EXT = { rows: 1000, cols: 26 };
const MCTX = document.createElement('canvas').getContext('2d');
const TW = new Map();
function textW(s, font) {
  const k = font + '|' + s;
  let w = TW.get(k);
  if (w == null) { MCTX.font = font; w = MCTX.measureText(s).width; if (TW.size > 10000) TW.clear(); TW.set(k, w); }
  return w;
}
const fontOf = (st, size) => `${st && st.i ? 'italic ' : ''}${st && st.b ? 700 : 400} ${Math.round(size * 100) / 100}px "${(st && st.ff) || DEF_FONT}", Arial, sans-serif`;
const fontPx = st => ((st && st.fs) || DEF_FS) * 4 / 3 * Z;
/* the first letter with a direction decides where text sits by itself: Hebrew and Arabic on the right, other text on
   the left, in a sheet of either direction (Excel does the same) */
const RTL_CH = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/, LTR_CH = /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u3040-\u9fff\uac00-\ud7af]/;
function textDir(s) { for (const ch of s) { if (RTL_CH.test(ch)) return 'rtl'; if (LTR_CH.test(ch)) return 'ltr'; } return null; }
let SHOWF = false;      // formulas instead of their results (Ctrl+`)
/* what a cell shows: t the text, k its kind (n number, s text, b TRUE/FALSE, e error), col a color from its format */
function view(x) {
  const st = x.st, nf = st && st.nf, v = x.v;
  if (SHOWF && x.f) return { t: editText(x), k: 's' };
  if (v == null || v === '') return { t: '', k: '' };
  if (isErr(v)) return { t: v.c, k: 'e' };
  if (typeof v === 'boolean') return { t: v ? 'TRUE' : 'FALSE', k: 'b' };
  if (typeof v === 'number') {
    if (!nf) return { t: genText(v, 11), k: 'n', gen: true };
    const f = fmtNumber(v, nf);
    return { t: f.t, k: 'n', col: f.c, bad: f.t == null };
  }
  if (nf) { const f = fmtText(v, nf); return { t: f.t, k: 's', col: f.c }; }
  return { t: v, k: 's' };
}
function shown(s, r, c) { const x = cellSp(s, r, c); return x ? view(x).t : ''; }
function alignOf(st, vw, dir) {
  if (st && st.ha) return st.ha;
  if (vw.k === 'n') return 'r';
  if (vw.k === 'b' || vw.k === 'e') return 'c';
  return (textDir(vw.t) || dir) === 'rtl' ? 'r' : 'l';
}
/* a number too wide for its column: General gives up decimals (then turns to E notation); other formats show ### */
function fitNumber(x, vw, w, font) {
  const hashes = () => '#'.repeat(Math.max(1, Math.floor(w / Math.max(1, textW('#', font)))));
  if (vw.bad) return hashes();
  if (textW(vw.t, font) <= w) return vw.t;
  if (vw.gen) for (let sig = 10; sig >= 1; sig--) { const t = genText(x.v, sig); if (textW(t, font) <= w) return t; }
  return hashes();
}
/* a layer's elements by key: get (or make) one for this pass, then drop the ones this pass didn't use */
function pass(L) { if (!L._m) L._m = new Map(); L._seen = new Set(); }
function part(L, key, cls) {
  let e = L._m.get(key);
  if (!e) { e = document.createElement('div'); e.className = cls; L._m.set(key, e); L.append(e); }
  L._seen.add(key);
  return e;
}
function sweep(L) { for (const [k, e] of L._m) if (!L._seen.has(k)) { e.remove(); L._m.delete(k); } }
const px = n => Math.round(n * 100) / 100 + 'px';
let SIDE = 'right';     // the side the columns count from: right in a right-to-left sheet
/* an element's place; its signature says when nothing needs to change */
function place(e, x, y, w, hgt, extra) {
  const sig = x + ',' + y + ',' + w + ',' + hgt + (extra || '');
  if (e._p === sig) return false;
  e._p = sig;
  e.style[SIDE] = px(x); e.style.top = px(y); e.style.width = px(Math.max(0, w)); e.style.height = px(Math.max(0, hgt));
  return true;
}
function render() {
  if (!WS || !V.view) return;
  const sc = V.scroll, rtl = WS.dir === 'rtl';
  if (sc.dir !== WS.dir) {   // the other direction: everything is placed again from the other side
    sc.dir = WS.dir; V.over.dir = WS.dir;
    for (const L of [V.body, V.top, V.side, V.corner]) if (L._m) { for (const e of L._m.values()) e.remove(); L._m.clear(); }
  }
  SIDE = rtl ? 'right' : 'left';
  Z = WS.zoom / 100;
  const vw = sc.clientWidth, vh = sc.clientHeight, sx = Math.abs(sc.scrollLeft), sy = sc.scrollTop;
  // how far the sheet reaches: what's used, room after it, and more whenever the view goes further
  const used = usedEnd(WS), g0 = geo(), g = selG();
  EXT.rows = clamp(Math.max(used.r + 60, 200, indexAt(g0.rows, (sy + vh * 2) / Z) + 40, SEL.r + 20, wholeCols(g) ? 0 : g.r2 + 20), 1, MAXR);
  EXT.cols = clamp(Math.max(used.c + 8, 26, indexAt(g0.cols, (sx + vw * 2) / Z) + 6, SEL.c + 6, wholeRows(g) ? 0 : g.c2 + 6), 1, MAXC);
  RHW = Math.round((Math.max(4, String(EXT.rows).length) * 7.2 + 14) * Math.max(0.7, Math.min(Z, 1.6)));
  CHH = Math.round(22 * Math.max(0.7, Math.min(Z, 1.6)));
  const W = colX(EXT.cols), H = rowY(EXT.rows), FW = colX(WS.fc) - RHW, FH = rowY(WS.fr) - CHH;
  for (const [el, w, hh] of [[V.canvas, W, H], [V.body, W, H], [V.top, W, CHH + FH], [V.side, RHW + FW, H], [V.corner, RHW + FW, CHH + FH]]) { el.style.width = px(w); el.style.height = px(hh); }
  // in view: the scrolling rows and columns, and the frozen ones
  const c0 = Math.max(WS.fc, colAtX(sx + RHW + FW)), c1 = Math.min(EXT.cols - 1, colAtX(sx + vw) + 1);
  const r0 = Math.max(WS.fr, rowAtY(sy + CHH + FH)), r1 = Math.min(EXT.rows - 1, rowAtY(sy + vh) + 2);
  const fcols = [0, WS.fc - 1], frows = [0, WS.fr - 1], cols = [c0, c1], rows = [r0, r1];
  V.vis = { c0, c1, r0, r1, sx, sy, vw, vh, FW, FH };
  const layers = [[V.body, rows, cols], [V.top, frows, cols], [V.side, rows, fcols], [V.corner, frows, fcols]];
  for (const [L, rr, cc] of layers) {
    pass(L);
    if (rr[1] >= rr[0] && cc[1] >= cc[0]) { gridLines(L, rr, cc); drawCells(L, rr, cc); drawBorders(L, rr, cc); drawFilterButtons(L, rr, cc); }
  }
  headers(V.top, cols, 'c', g); headers(V.side, rows, 'r', g);
  headers(V.corner, fcols, 'c', g); headers(V.corner, frows, 'r', g);
  const corner = part(V.corner, 'corner', 'sh-cor');
  place(corner, 0, 0, RHW, CHH);
  if (WS.fr) place(part(V.top, 'frz', 'sh-frz'), 0, CHH + FH - 1, W, 1);
  if (WS.fc) place(part(V.side, 'frz', 'sh-frz'), RHW + FW - 1, 0, 1, H);
  if (WS.fr && WS.fc) { place(part(V.corner, 'frzh', 'sh-frz'), 0, CHH + FH - 1, RHW + FW, 1); place(part(V.corner, 'frzv', 'sh-frz'), RHW + FW - 1, 0, 1, CHH + FH); }
  drawCharts();
  for (const [L, rr, cc] of layers) drawSel(L, rr, cc, g);
  if (WS._rings && WS.dv.length) for (const [L, rr, cc] of layers) if (rr[1] >= rr[0] && cc[1] >= cc[0]) drawRings(L, rr, cc);
  if (RM.peers.length) for (const [L, rr, cc] of layers) drawPeers(L, rr, cc);
  for (const L of [V.body, V.top, V.side, V.corner]) sweep(L);
  placeEditor();
  linkTip();
  dvTip();
  noteTip();
}
/* gridlines: each column's end and each row's bottom, as lines across the part of the sheet in view */
function gridLines(L, rr, cc) {
  if (!WS.gl) return;
  const x0 = colX(cc[0]), x1 = colX(cc[1] + 1), y0 = rowY(rr[0]), y1 = rowY(rr[1] + 1);
  for (let c = cc[0]; c <= cc[1]; c++) if (colW(c)) place(part(L, 'v' + c, 'sh-gl'), colX(c + 1) - 1, y0, 1, y1 - y0);
  for (let r = rr[0]; r <= rr[1]; r++) if (rowH(r)) place(part(L, 'h' + r, 'sh-gl'), x0, rowY(r + 1) - 1, x1 - x0, 1);
}
function headers(L, span, axis, g) {
  if (span[1] < span[0]) return;
  const allR = wholeCols(g), allC = wholeRows(g), flt = axis === 'r' && WS.af && WS._fh && WS._fh.size;
  for (let i = span[0]; i <= span[1]; i++) {
    const size = axis === 'c' ? colW(i) : rowH(i);
    if (!size) continue;
    const e = part(L, axis + i, 'sh-hd');
    if (axis === 'c') place(e, colX(i), 0, size, CHH); else place(e, 0, rowY(i), RHW, size);
    const on = axis === 'c' ? i >= g.c1 && i <= g.c2 : i >= g.r1 && i <= g.r2;
    const cls = 'sh-hd ' + axis + (on ? ((axis === 'c' ? allR : allC) ? ' all' : ' on') : '') + (flt && i > WS.af.r1 && i <= WS.af.r2 ? ' flt' : '');
    if (e.className !== cls) e.className = cls;
    const t = axis === 'c' ? colName(i) : String(i + 1);
    if (e.textContent !== t) e.textContent = t;
  }
}
/* the cells: values, fills and alignment. Text too long for its cell runs over the empty cells beside it, as in Excel */
function drawCells(L, rr, cc) {
  const s = WS, looks = s.ds || s.cs.size || s.rs.size, done = new Set(), sp = s._sp && s._sp.size ? s._sp : null;
  for (let r = rr[0]; r <= rr[1]; r++) {
    const hh = rowH(r);
    if (!hh) continue;
    for (let c = cc[0]; c <= cc[1]; c++) {
      const w = colW(c);
      if (!w) continue;
      const m = s.merges.length ? mergeAt(s, r, c) : null;
      if (m) {
        if (done.has(m)) continue;
        done.add(m);
        const a = cellAt(s, m.r1, m.c1);
        drawCell(L, 'm' + m.r1 + ',' + m.c1, a, underTable(s, m.r1, m.c1, a ? a.st : emptyLook(s, m.r1, m.c1)), colX(m.c1), rowY(m.r1), spanW(m.c1, m.c2), spanH(m.r1, m.r2), null, true, cfAt(s, m.r1, m.c1));
        if (a && a.n) noteMark(L, m.r1, m.c1, colX(m.c1), rowY(m.r1), spanW(m.c1, m.c2));
        continue;
      }
      let x = cellAt(s, r, c);
      if (sp && (!x || x.v === undefined) && sp.has(KEY(r, c))) x = cellSp(s, r, c);
      const st = underTable(s, r, c, x ? x.st : looks ? emptyLook(s, r, c) : null), cf = cfAt(s, r, c);
      if (!x && !(st && st.bg) && !cf) continue;
      drawCell(L, 'c' + r + ',' + c, x, st, colX(c), rowY(r), w, hh, { r, c }, false, cf);
      if (x && x.n) noteMark(L, r, c, colX(c), rowY(r), w);
    }
  }
}
/* a note's mark: a small red triangle in the cell's top corner on the end side (the top left in a right-to-left sheet) */
function noteMark(L, r, c, X, Y, w) {
  const z = Math.max(5, Math.round(6 * Z));
  place(part(L, 'n' + r + ',' + c, 'sh-nmark'), X + w - z - 1, Y, z, z);
}
function drawCell(L, key, x, st, X, Y, w, hgt, spill, merged, cf) {
  if (cf && cf.st) st = { ...(st || {}), ...cf.st };   // what the conditional formatting gives wins over the cell's own look
  const e = part(L, key, 'sh-c');
  const vw = x ? view(x) : { t: '', k: '' }, size = fontPx(st), font = fontOf(st, size);
  let text = cf && cf.hide ? '' : vw.t, ew = w, ex = X;
  const al = alignOf(st, vw, WS.dir);
  if (vw.k === 'n' && text) text = fitNumber(x, vw, w - 6 * Z, font);
  if (spill && vw.k === 's' && text && !(st && st.wr)) {
    const need = textW(text, font) + 6 * Z;
    if (need > w) {
      // left-aligned text runs to the right, right-aligned to the left; in a right-to-left sheet the right is toward A
      const rtl = WS.dir === 'rtl', toward = side => side === 'R' ? (rtl ? -1 : 1) : (rtl ? 1 : -1);
      let lo = spill.c, hi = spill.c;
      const grow = (d, want) => {
        let cur = spill.c, room = 0;
        while (room < want) {
          const n = cur + d;
          if (n < 0 || n >= EXT.cols || Math.abs(n - spill.c) > 30 || filled(WS, spill.r, n) || (WS.merges.length && mergeAt(WS, spill.r, n))) break;
          cur = n; room += colW(n);
        }
        if (d > 0) hi = cur; else lo = cur;
      };
      if (al === 'l') grow(toward('R'), need - w);
      else if (al === 'r') grow(toward('L'), need - w);
      else { grow(1, (need - w) / 2); grow(-1, (need - w) / 2); }
      ew = spanW(lo, hi); ex = colX(lo);
    }
  }
  const bg = (st && st.bg) || '', color = (cf && cf.st && cf.st.c) || vw.col || (st && st.c) || '', va = (st && st.va) || 'b', wrap = !!(st && st.wr);
  place(e, ex, Y, ew, hgt);
  const sig = [text, al, va, bg, color, font, st && st.u ? 1 : 0, st && st.s ? 1 : 0, wrap ? 1 : 0, vw.k, merged ? 1 : 0, ew !== w ? 1 : 0, (st && st.ind) || 0,
    cf && (cf.bar || cf.icon) ? JSON.stringify([cf.bar, cf.icon, w, hgt, Z, WS.dir]) : ''].join('|');
  if (e._s === sig) return;
  e._s = sig;
  e.className = 'sh-c' + (merged || ew !== w ? ' over' : '') + (wrap ? ' wr' : '');
  e.style.background = bg;
  e.style.color = color;
  e.style.font = font;
  e.style.textDecoration = [st && st.u ? 'underline' : '', st && st.s ? 'line-through' : ''].filter(Boolean).join(' ') || '';
  e.style.justifyContent = al === 'l' ? 'flex-start' : al === 'c' ? 'center' : 'flex-end';
  e.style.alignItems = va === 't' ? 'flex-start' : va === 'm' ? 'center' : 'flex-end';
  e.style.textAlign = al === 'l' ? 'left' : al === 'c' ? 'center' : 'right';
  e.textContent = '';
  e.style.paddingLeft = e.style.paddingRight = '';
  if (st && st.ind) e.style[WS.dir === 'rtl' ? 'paddingRight' : 'paddingLeft'] = (3 + st.ind * 12) * Z + 'px';   // a pivot table's inner rows step in
  if (text) {
    const sp = document.createElement('span');
    sp.textContent = text;
    sp.dir = vw.k === 's' ? 'auto' : 'ltr';
    e.append(sp);
  }
  if (cf && cf.bar) e.append(...barEls(cf.bar, w, WS.dir === 'rtl'));
  if (cf && cf.icon) {
    const side = 'left', z = Math.round(15 * Z), ic = document.createElement('span');   // on the left in both directions, as Excel draws it
    ic.className = 'sh-cfic';
    ic.innerHTML = iconSvg(cf.icon.set, cf.icon.i, z);
    ic.style[side] = Math.round(2 * Z) + 'px';
    if (va === 't') ic.style.top = Math.round(2 * Z) + 'px'; else if (va === 'm') { ic.style.top = '50%'; ic.style.marginTop = -z / 2 + 'px'; } else ic.style.bottom = Math.round(3 * Z) + 'px';
    e.style[side === 'left' ? 'paddingLeft' : 'paddingRight'] = z + 5 * Z + 'px';
    e.append(ic);
  }
}
/* a data bar in a cell w wide: from the axis (a) to the value (b), as parts of the width; it grows from the sheet's
   start side, and a negative one is red and grows the other way from the axis */
function barEls(b, w, rtl) {
  const inner = Math.max(0, w - 4 * Z), x0 = Math.min(b.a, b.b), x1 = Math.max(b.a, b.b), col = b.neg ? '#ff0000' : b.c, side = rtl ? 'right' : 'left';
  const bar = h('div', { class: 'sh-cfbar' });
  bar.style[side] = 2 * Z + x0 * inner + 'px';
  bar.style.width = Math.max(x1 > x0 ? 1 : 0, (x1 - x0) * inner) + 'px';
  bar.style.top = bar.style.bottom = Math.round(2 * Z) + 'px';
  bar.style.background = b.solid ? col : `linear-gradient(to ${rtl !== b.neg ? 'left' : 'right'}, ${col}, ${mixColor(col, '#ffffff', 0.88)})`;
  if (!b.solid) bar.style.borderColor = col;
  if (!(b.a > 0 && b.a < 1)) return [bar];
  const axis = h('div', { class: 'sh-cfaxis' });
  axis.style[side] = 2 * Z + b.a * inner + 'px';
  return [bar, axis];
}
/* borders sit on the line between two cells, so two neighbors' borders meet as one */
const BD_CSS = { s: 'solid', d: 'dashed', o: 'dotted', '=': 'double' };
function drawBorders(L, rr, cc) {
  const s = WS, looks = s.ds || s.cs.size || s.rs.size;
  for (let r = rr[0]; r <= rr[1]; r++) {
    if (!rowH(r)) continue;
    for (let c = cc[0]; c <= cc[1]; c++) {
      if (!colW(c)) continue;
      const x = cellAt(s, r, c), st = underTable(s, r, c, x ? x.st : looks ? emptyLook(s, r, c) : null), cf = cfAt(s, r, c), cb = cf && cf.st;   // a rule's border wins on its side
      if (!(st && (st.bt || st.bb || st.bs || st.be)) && !(cb && (cb.bt || cb.bb || cb.bs || cb.be))) continue;
      for (const k of BD_SIDES) {
        const b = (cb && cb[k]) || (st && st[k]);
        if (!b) continue;
        const kind = b[1], lw = kind === '=' ? 3 : +b[0], horiz = k === 'bt' || k === 'bb', e = part(L, 'b' + k + r + ',' + c, 'sh-bd');
        const p = k === 'bt' ? rowY(r) - 1 : k === 'bb' ? rowY(r + 1) - 1 : k === 'bs' ? colX(c) - 1 : colX(c + 1) - 1, o = p - Math.floor((lw - 1) / 2);
        if (horiz) place(e, colX(c) - 1, o, colW(c) + 1, lw, b); else place(e, o, rowY(r) - 1, lw, rowH(r) + 1, b);
        const css = `${lw}px ${BD_CSS[kind] || 'solid'} ${b.slice(2)}`;
        if (e._b !== css) { e._b = css; e.style.border = '0'; e.style[horiz ? 'borderTop' : 'borderLeft'] = css; }
      }
    }
  }
}
/* the filter's buttons, on its header row */
function drawFilterButtons(L, rr, cc) {
  const f = WS.af;
  if (!f || f.r1 < rr[0] || f.r1 > rr[1] || !rowH(f.r1)) return;
  for (let c = Math.max(f.c1, cc[0]); c <= Math.min(f.c2, cc[1]); c++) {
    if (!colW(c)) continue;
    const on = !!(f.hide[c] && f.hide[c].length), b = part(L, 'f' + c, 'sh-fb'), size = Math.min(rowH(f.r1) - 3, 17 * Z);
    place(b, colX(c + 1) - size - 3, rowY(f.r1 + 1) - size - 3, size, size);
    if (!b.firstChild) b.append(icon('arrow_drop_down'));
    b.classList.toggle('on', on);
    b.firstChild.textContent = on ? 'filter_alt' : 'arrow_drop_down';
  }
}
/* the selection in one layer: the part of the range in it, tinted but for the active cell, a frame on the range's real
   edges, the fill handle on its bottom corner at the end side, the ants around what was copied, and the colored
   frames of the ranges a formula being written points at */
function drawSel(L, rr, cc, g) {
  if (rr[1] < rr[0] || cc[1] < cc[0]) return;
  const frR = L === V.top || L === V.corner, frC = L === V.side || L === V.corner;
  const lo = { r: frR ? 0 : WS.fr, c: frC ? 0 : WS.fc }, hi = { r: frR ? WS.fr - 1 : EXT.rows - 1, c: frC ? WS.fc - 1 : EXT.cols - 1 };
  const clip = x => ({ r1: Math.max(x.r1, lo.r), c1: Math.max(x.c1, lo.c), r2: Math.min(x.r2, hi.r), c2: Math.min(x.c2, hi.c) });
  // frames sit on the gridlines around the range (one pixel out on the start side and the top)
  const box = (key, x, cls, frame) => {
    const y = clip(x);
    if (y.r1 > y.r2 || y.c1 > y.c2) return null;
    const e = part(L, key, cls), o = frame ? 1 : 0;
    place(e, colX(y.c1) - o, rowY(y.r1) - o, colX(y.c2 + 1) - colX(y.c1) + o, rowY(y.r2 + 1) - rowY(y.r1) + o);
    return { e, y };
  };
  const am = mergeAt(WS, SEL.r, SEL.c) || { r1: SEL.r, c1: SEL.c, r2: SEL.r, c2: SEL.c };
  const single = sameG(g, am) || (g.r1 === g.r2 && g.c1 === g.c2);
  if (!single) [{ r1: g.r1, c1: g.c1, r2: am.r1 - 1, c2: g.c2 }, { r1: am.r2 + 1, c1: g.c1, r2: g.r2, c2: g.c2 }, { r1: am.r1, c1: g.c1, r2: am.r2, c2: am.c1 - 1 }, { r1: am.r1, c1: am.c2 + 1, r2: am.r2, c2: g.c2 }]
    .forEach((p, i) => { if (p.r1 <= p.r2 && p.c1 <= p.c2) box('tint' + i, p, 'sh-tint'); });
  const fr = box('sel', g, 'sh-sel', true);
  if (fr) {
    const y = fr.y, cls = 'sh-sel' + (y.r1 !== g.r1 ? ' nt' : '') + (y.r2 !== g.r2 ? ' nb' : '') + (y.c1 !== g.c1 ? ' ns' : '') + (y.c2 !== g.c2 ? ' ne' : '') + (ED.on && ED.point ? ' pt' : '');
    if (fr.e.className !== cls) fr.e.className = cls;
  }
  if (!single) box('act', am, 'sh-act', true);
  const hr = Math.min(g.r2, EXT.rows - 1), hc = Math.min(g.c2, EXT.cols - 1);
  if (!ED.on && hr >= lo.r && hr <= hi.r && hc >= lo.c && hc <= hi.c && !wholeCols(g) && !wholeRows(g)) place(part(L, 'fh', 'sh-fh'), colX(hc + 1) - 5, rowY(hr + 1) - 5, 7, 7);
  if (CLIP && CLIP.sid === WS.id && CLIP.ants) box('clip', CLIP.g, 'sh-clip', true);
  const sa = !ED.on && spillArea(WS, SEL.r, SEL.c);
  if (sa) box('spa', sa, 'sh-spa', true);
  const dva = dvArrow();   // the arrow of the active cell's list
  if (dva && dva.m.r2 >= lo.r && dva.m.r2 <= hi.r && dva.m.c2 >= lo.c && dva.m.c2 <= hi.c) {
    const b = part(L, 'dvb', 'sh-dvb');
    place(b, dva.x, dva.y, dva.size, dva.size);
    if (!b.firstChild) b.append(icon('arrow_drop_down'));
  }
  if (ED.on && ED.refs) ED.refs.forEach((x, i) => { if (x.sid !== WS.id) return; const b = box('ref' + i, x.g, 'sh-ref', true); if (b) b.e.style.setProperty('--rc', REF_COLORS[x.n % REF_COLORS.length]); });
}
const REF_COLORS = ['#2f6fdf', '#d9383a', '#7a3fc9', '#1d8249', '#c2388a', '#d9701a', '#0e8a8c', '#8a5a1e'];

/* =========================================================
   choosing cells, and writing in them. One textarea (V.ed) always has the keyboard: invisible on the active cell until
   a key is typed, then it is the cell's editor. The formula bar (V.bar) is a second view of the same text
   ========================================================= */
/* mode 'enter' (started by typing: arrows finish the entry, or point at cells in a formula) or 'edit' (F2, a double
   click, the formula bar: arrows move in the text). point: the reference being pointed at, as text positions */
const ED = { on: false, mode: 'enter', r: 0, c: 0, sid: '', from: 'cell', orig: '', refs: null, point: null, all: false, dv: null };
let TOUCHY = false;     // the last pointer was a finger: no keyboard pops up until a cell is opened for writing
const taOf = () => ED.from === 'bar' ? V.bar : V.ed;
function focusGrid() {
  if (!V.view || !LOADED || LOADED !== S.cur) return;
  if (TOUCHY && !ED.on) { if (document.activeElement !== V.scroll) V.scroll.focus({ preventScroll: true }); return; }
  const t = ED.on ? taOf() : V.ed;
  if (document.activeElement !== t) t.focus({ preventScroll: true });
}
/* the text a cell is opened with: its formula, a date the way it is written here, a percent with %, and text that
   would read as something else with ' before it (so it stays text) */
function editText(x) {
  if (!x) return '';
  if (x.f != null) return '=' + x.f.replace(/_xl(fn|ws)\./gi, '');
  const v = x.v, nf = x.st && x.st.nf;
  if (v == null) return '';
  if (isErr(v)) return v.c;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') {
    const k = nfKind(nf);
    if (k === 'date' || k === 'ldate') return fmtNumber(v, v % 1 ? DATE_NF + ' hh:mm:ss' : DATE_NF).t || genText(v, 15);
    if (k === 'time') return fmtNumber(v, 'h:mm:ss').t || genText(v, 15);
    if (k === 'pct') return genText(v * 100, 15) + '%';
    return genText(v, 15);
  }
  const p = parseInput(v);
  return p && (p.f != null || typeof p.v !== 'string') ? "'" + v : v;
}
function startEdit(mode, text, from = 'cell') {
  if (ED.on || !WS) return;
  const m = mergeAt(WS, SEL.r, SEL.c), r = m ? m.r1 : SEL.r, c = m ? m.c1 : SEL.c;
  if (pivotAt(WS, r, c)) { V.ed.value = ''; toast(T('אי אפשר לשנות חלק של טבלת ציר. משנים אותה ברשימת השדות.'), { icon: 'pivot_table_chart' }); return; }
  const p = RM.on && RM.peers.find(x => x.pr && x.pr.ed && x.pr.ed.s === WS.id && x.pr.ed.r === r && x.pr.ed.c === c);
  if (p) { V.ed.value = ''; toast(T('התא הזה בעריכה אצל {0}', p.name), { icon: 'edit' }); return; }
  Object.assign(ED, { on: true, mode, r, c, sid: WS.id, from, point: null, refs: null, all: false, dv: dvChoices(WS, r, c) });
  ED.orig = editText(cellAt(WS, r, c));
  const t = text == null ? ED.orig : text;
  if (V.ed.value !== t) V.ed.value = t;
  if (V.bar.value !== t) V.bar.value = t;
  V.over.classList.add('editing');
  const ta = taOf();
  if (document.activeElement !== ta) ta.focus({ preventScroll: true });
  if (text == null && from === 'cell') { const n = ta.value.length; ta.setSelectionRange(n, n); }
  scrollToSel();
  edChanged();
}
/* missing closing brackets are added, as Excel does; a formula Excel would refuse gets its words, else null */
function closeBrackets(f) {
  let depth = 0, q = false;
  for (const ch of f) { if (ch === '"') q = !q; else if (!q) { if (ch === '(') depth++; else if (ch === ')') depth--; } }
  return depth > 0 && !q ? f + ')'.repeat(depth) : f;
}
function formulaProblem(f) {
  const a = astOf(f);
  if (!a) return T('יש בעיה בנוסחה הזאת. כדאי לבדוק את הסוגריים, הפסיקים והמירכאות.');
  let bad = null;
  walk(a, n => { if (!bad && n.t === 'fn' && FUNCS[n.n] && (n.args.length < FUNCS[n.n].n[0] || n.args.length > FUNCS[n.n].n[1])) bad = n.n; });
  return bad ? T('לפונקציה {0} יש מספר לא נכון של ערכים בסוגריים.', bad) : null;
}
function endEdit(commit, move, force) {
  if (!ED.on) return true;
  if (DVA.open) return false;   // an alert about what was typed is waiting for its answer
  let text = taOf().value;
  if (commit && text !== ED.orig) {
    if (text[0] === '=' && text.length > 1) {
      text = '=' + closeBrackets(text.slice(1));
      const why = formulaProblem(text.slice(1));
      if (why) { toast(why, { icon: 'error', ms: 6000 }); taOf().focus(); return false; }
    }
    const s = WB.sheets.find(x => x.id === ED.sid) || WS, g = ED.all ? selG() : null, r = ED.r, c = ED.c;
    const rule = force ? null : dvAt(s, r, c);
    ED.on = false;
    const did = edit(() => { writeInput(s, r, c, text, g); if (s.tables.length && !g) { tableGrow(s, r, c); tableFill(s, r, c, text); } widenFor(s, r, c); });
    if (did && rule && rule.t !== 'any' && !rule.ne && !dvOk(s, rule, r, c)) {
      // the cell's rule doesn't take this (a formula is judged by its answer, once everything is worked out): it
      // comes out again, and the alert asks what to do with it
      applyStep(HIST.list[--HIST.at], true);
      HIST.list.length = HIST.at;
      ED.on = true;
      V.ed.value = V.bar.value = text;
      edChanged();
      dvAlert(rule, move);
      return false;
    }
  }
  ED.on = false; ED.refs = null; ED.point = null;
  V.over.classList.remove('editing');
  V.ed.value = '';
  V.ed.style.width = V.ed.style.height = '';
  acHide();
  if (move) moveSel(move[0], move[1], false, false);
  else refresh();
  focusGrid();
  return true;
}
/* The number format a formula's cell takes when it has none, as Excel gives one (each rule measured there). TODAY and
   DATE are a date, NOW a date with the time, TIME a time, PMT and its family money (minus in red), RATE and IRR a
   percent. A reference takes its first cell's format, on the formula's own sheet only. + and - take the first side's
   that has one, but two dates (or two money functions) give a plain number. * / ^ % & and comparisons give a plain
   number whatever stands in them, and that wins over anything added to it. SUM, AVERAGE, MAX, MIN, MEDIAN, ROUND and
   its family, INT and MOD take their first argument's that has one. Every other function has none of its own, so
   what is added to it decides. (One thing is left out on purpose: Excel hands on the Text format too, and the next
   edit of that cell then shows the formula instead of working it out.) */
const MONEY_NF = () => curNf(CUR) + ';[Red]-' + curNf(CUR);
const NF_MONEY = {}, NF_PLAIN = {};
const NF_OWN = { TODAY: () => DATE_NF, DATE: () => DATE_NF, NOW: () => DATE_NF + (LANG === 'en' ? ' h:mm' : ' hh:mm'), TIME: () => TIME_NF, RATE: () => PCT_NF, IRR: () => PCT_NF, MIRR: () => PCT_NF };
for (const f of ['PMT', 'PV', 'FV', 'NPV', 'IPMT', 'PPMT', 'SLN', 'DB', 'DDB', 'SYD', 'VDB']) NF_OWN[f] = () => NF_MONEY;
const NF_PASS = new Set(['SUM', 'AVERAGE', 'MAX', 'MIN', 'MEDIAN', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'TRUNC', 'INT', 'MOD']);
const withDate = nf => { const k = typeof nf === 'string' ? nfKind(nf) : ''; return k === 'date' || k === 'ldate'; };
function nfOfAst(n, s) {   // a format code, NF_MONEY, NF_PLAIN (a plain number that wins), or null (none of its own)
  switch (n.t) {
    case 'ref': {
      if (n.sheet != null) return null;
      const x = cellAt(s, n.g.r1, n.g.c1), look = x ? x.st : emptyLook(s, n.g.r1, n.g.c1), nf = look && look.nf;
      return nf && nf !== '@' ? nf : null;
    }
    case 'neg': return nfOfAst(n.a, s);
    case 'pct': return NF_PLAIN;
    case 'bin': {
      if (n.op !== '+' && n.op !== '-') return NF_PLAIN;
      const a = nfOfAst(n.a, s), b = nfOfAst(n.b, s);
      if (a === NF_PLAIN || b === NF_PLAIN || (withDate(a) && withDate(b)) || (a === NF_MONEY && b === NF_MONEY)) return NF_PLAIN;
      return a || b;
    }
    case 'fn': {
      if (NF_OWN[n.n]) return NF_OWN[n.n]();
      if (NF_PASS.has(n.n)) for (const x of n.args) { const f = nfOfAst(x, s); if (f) return f; }
      return null;
    }
  }
  return null;
}
function autoNf(f, s) {
  const ast = astOf(f), nf = ast ? nfOfAst(ast, s) : null;
  return nf === NF_MONEY ? MONEY_NF() : typeof nf === 'string' ? nf : null;
}
/* what was typed into a cell; with Ctrl+Enter into every chosen cell, where a formula moves with each one */
function writeInput(s, r, c, text, g) {
  const cur = cellAt(s, r, c), look = cur ? cur.st : emptyLook(s, r, c), p = parseInput(text, look && look.nf);
  const put = (rr, cc, pp) => {
    const x = cellAt(s, rr, cc), st0 = x ? x.st : emptyLook(s, rr, cc);
    if (!pp) { setCell(s, rr, cc, keepOn(x, st0 ? { st: st0 } : null)); return; }
    const cell = {};
    if (pp.f != null) { cell.f = tidyFormula(pp.f); cell.v = 0; } else cell.v = pp.v;
    const nf = pp.nf || (pp.f != null && !(st0 && st0.nf) ? autoNf(cell.f, s) : null), st = nf ? { ...(st0 || {}), nf } : st0;
    if (st) cell.st = st;
    setCell(s, rr, cc, keepOn(x, cell));
  };
  if (!g || (g.r1 === g.r2 && g.c1 === g.c2) || sameG(g, mergeAt(s, r, c))) { put(r, c, p); return; }
  const u = usedEnd(s), r2 = Math.min(g.r2, Math.max(u.r, r) + 1000), c2 = Math.min(g.c2, Math.max(u.c, c) + 100);
  for (let rr = g.r1; rr <= r2; rr++) for (let cc = g.c1; cc <= c2; cc++) {
    const m = mergeAt(s, rr, cc);
    if (m && (m.r1 !== rr || m.c1 !== cc)) continue;
    put(rr, cc, p && p.f != null ? { f: shiftFormula(tidyFormula(p.f), rr - r, cc - c) } : p);
  }
}
/* A number that was just typed and doesn't fit (a date with its hour, money): the column grows to show it, as Excel's
   does, when nobody chose that column's width */
function widenFor(s, r, c) {
  const x = s.cells.get(KEY(r, c)), st = x && x.st;
  if (!st || !st.nf || s.cw.has(c) || mergeAt(s, r, c)) return;
  if (x.f != null) recalc();
  const vw = view(x);
  if (vw.k !== 'n' || vw.bad) return;
  const need = Math.ceil(textW(vw.t, fontOf(st, (st.fs || DEF_FS) * 4 / 3))) + 10;
  if (need > s.dw + 4) { const m = new Map(s.cw); m.set(c, Math.min(900, need)); setProp(s, 'cw', m); }
}
/* after each change to the text being written: the other box, the colored references, the helper, the size */
function edChanged() {
  const ta = taOf(), other = ta === V.ed ? V.bar : V.ed;
  if (other.value !== ta.value) other.value = ta.value;
  scanRefs();
  acUpdate();
  render();
}
/* the references in a formula being written, each in its own color on the sheet */
function scanRefs() {
  const t = taOf().value;
  if (t[0] !== '=') { ED.refs = null; return; }
  const out = [], seen = new Map();
  const here = WB.sheets.find(x => x.id === ED.sid);
  for (const k of tokenize(t.slice(1))) {
    if (k.t !== 'ref' && k.t !== 'name') continue;
    // a defined name for cells is shown like the address it stands for
    const nm = k.t === 'name' ? nameOf(k, here) : null, cells = nm ? nameCells(nm) : null;
    if (k.t === 'name' && !(cells && cells.fixed)) continue;
    const s = cells ? cells.s : k.sheet == null ? here : WB.sheets.find(x => x.name.toLowerCase() === k.sheet.toLowerCase());
    if (!s) continue;
    const g = cells ? cells.g : G4(k.r1, k.c1, k.r2, k.c2), key = s.id + rangeA1(g);
    if (!seen.has(key)) seen.set(key, seen.size);
    out.push({ sid: s.id, g, n: seen.get(key) });
  }
  ED.refs = out;
}
/* where a reference can go: right after =, (, a comma or an operator, or in place of the one just pointed at */
function pointable() {
  const ta = taOf(), v = ta.value;
  if (!ED.on || v[0] !== '=' || ta.selectionStart !== ta.selectionEnd) return false;
  const pos = ta.selectionStart;
  if (ED.point && ED.point.e === pos) return true;
  return /[=(,;+\-*/^&<>:]\s*$/.test(v.slice(0, pos));
}
function putRef(g, text) {
  const ta = taOf(), t = text || rangeA1(g), p = ED.point && ED.point.e === ta.selectionStart ? ED.point : { s: ta.selectionStart, e: ta.selectionStart };
  ta.value = ta.value.slice(0, p.s) + t + ta.value.slice(p.e);
  const e = p.s + t.length;
  ta.setSelectionRange(e, e);
  ED.point = { s: p.s, e, g };
  edChanged();
}
/* arrows while pointing: the reference moves (Shift makes it a range), starting from the cell being written in */
function pointKey(k, shift) {
  const d = arrowStep(k), p = ED.point && ED.point.g ? ED.point : null;
  let a = p ? { r: p.ar, c: p.ac } : { r: ED.r, c: ED.c }, b = p ? { r: p.br, c: p.bc } : { ...a };
  if (shift && p) b = { r: clamp(b.r + d[0], 0, MAXR - 1), c: clamp(b.c + d[1], 0, MAXC - 1) };
  else { a = { r: clamp(a.r + d[0], 0, MAXR - 1), c: clamp(a.c + d[1], 0, MAXC - 1) }; b = { ...a }; }
  putRef(G4(a.r, a.c, b.r, b.c), a.r === b.r && a.c === b.c && PREFS.shGpd !== false && pivotRefText(WS, a.r, a.c));   // a pivot table's value: GETPIVOTDATA, as with the mouse
  Object.assign(ED.point, { ar: a.r, ac: a.c, br: b.r, bc: b.c });
  scrollToCell(b.r, b.c);
}
/* F4: the reference at the caret goes A1 → $A$1 → A$1 → $A1 → A1 */
function cycleAbs() {
  const ta = taOf(), v = ta.value;
  if (v[0] !== '=') return;
  const pos = ta.selectionStart - 1;
  for (const k of tokenize(v.slice(1))) {
    if (k.t !== 'ref' || pos < k.p || pos > k.p + k.s.length) continue;
    const a = k.a, st = a[0] && a[1] ? 1 : a[0] ? 2 : a[1] ? 3 : 0, n = [[true, true], [true, false], [false, true], [false, false]][st];
    const t = refText({ ...k, a: [n[0], n[1], n[0], n[1]] }, k);
    ta.value = v.slice(0, k.p + 1) + t + v.slice(k.p + 1 + k.s.length);
    const e = k.p + 1 + t.length;
    ta.setSelectionRange(e, e);
    ED.point = null;
    edChanged();
    return;
  }
}
/* the editor over its cell: the cell's size, wider as the text grows (toward the end side) up to the view's edge */
function placeEditor() {
  if (!V.vis) return;
  const e = V.ed, r = ED.on ? ED.r : SEL.r, c = ED.on ? ED.c : SEL.c;
  const m = mergeAt(WS, r, c) || { r1: r, c1: c, r2: r, c2: c };
  let x = colX(m.c1), y = rowY(m.r1);
  if (m.c1 >= WS.fc) x -= V.vis.sx;
  if (m.r1 >= WS.fr) y -= V.vis.sy;
  e.style.right = e.style.left = '';
  e.style[SIDE] = px(x - 1);
  e.style.top = px(y - 1);
  e._cw = spanW(m.c1, m.c2) + 1; e._ch = spanH(m.r1, m.r2) + 1; e._x = x;
  if (ED.on) sizeEditor();
}
function sizeEditor() {
  const e = V.ed, st = lookAt(WS, ED.r, ED.c), font = fontOf(st, fontPx(st)), wrap = !!(st && st.wr);
  e.style.font = font;
  const lines = e.value.split('\n'), room = Math.max(e._cw, V.scroll.clientWidth - e._x - 4);
  e.style.width = px(wrap ? e._cw : clamp(Math.max(...lines.map(l => textW(l, font))) + 14 * Z, e._cw, room));
  e.style.whiteSpace = wrap ? 'pre-wrap' : 'pre';
  e.style.height = '0px';
  e.style.height = px(Math.max(e._ch, e.scrollHeight + 2));
}

/* --- moving around --- */
const hiddenR = r => rowH(r) === 0, hiddenC = c => colW(c) === 0;
function stepOver(r, c, dr, dc) {
  const m = mergeAt(WS, r, c);
  if (m) { if (dr > 0) r = m.r2; if (dr < 0) r = m.r1; if (dc > 0) c = m.c2; if (dc < 0) c = m.c1; }
  do { r += dr; c += dc; } while (r > 0 && r < MAXR - 1 && c > 0 && c < MAXC - 1 && ((dr && hiddenR(r)) || (dc && hiddenC(c))));
  return [clamp(r, 0, MAXR - 1), clamp(c, 0, MAXC - 1)];
}
/* Ctrl+arrow: to the edge of the block of filled cells, or to the next filled cell, or to the sheet's edge */
function jump(r, c, dr, dc) {
  const full = (rr, cc) => hasVal(cellAt(WS, rr, cc)), u = usedEnd(WS), inside = (rr, cc) => rr >= 0 && cc >= 0 && rr < MAXR && cc < MAXC;
  let nr = r + dr, nc = c + dc;
  if (!inside(nr, nc)) return [r, c];
  if (full(r, c) && full(nr, nc)) { while (inside(nr + dr, nc + dc) && full(nr + dr, nc + dc)) { nr += dr; nc += dc; } return [nr, nc]; }
  while (inside(nr, nc) && !full(nr, nc)) {
    if ((dr > 0 && nr >= u.r) || (dc > 0 && nc >= u.c)) return dr ? [MAXR - 1, c] : [r, MAXC - 1];
    nr += dr; nc += dc;
  }
  return [clamp(nr, 0, MAXR - 1), clamp(nc, 0, MAXC - 1)];
}
function moveSel(dr, dc, extend, far) {
  if (extend) {
    const [r, c] = far ? jump(SEL.er, SEL.ec, dr, dc) : stepOver(SEL.er, SEL.ec, dr, dc);
    if (SEL.whole !== 'c' && SEL.whole !== 'a') SEL.er = r;
    if (SEL.whole !== 'r' && SEL.whole !== 'a') SEL.ec = c;
    scrollToCell(SEL.er, SEL.ec);
  } else {
    const [r, c] = far ? jump(SEL.r, SEL.c, dr, dc) : stepOver(SEL.r, SEL.c, dr, dc);
    SEL = { r, c, er: r, ec: c };
    scrollToSel();
  }
  after();
}
/* Enter and Tab inside a chosen range move the active cell through it, as in Excel */
function stepInSel(dr, dc) {
  const g = selG();
  if ((g.r1 === g.r2 && g.c1 === g.c2) || SEL.whole || sameG(g, mergeAt(WS, SEL.r, SEL.c))) { moveSel(dr, dc, false); return; }
  let { r, c } = SEL;
  if (dr) { r += dr; if (r > g.r2) { r = g.r1; c = c + 1 > g.c2 ? g.c1 : c + 1; } else if (r < g.r1) { r = g.r2; c = c - 1 < g.c1 ? g.c2 : c - 1; } }
  else { c += dc; if (c > g.c2) { c = g.c1; r = r + 1 > g.r2 ? g.r1 : r + 1; } else if (c < g.c1) { c = g.c2; r = r - 1 < g.r1 ? g.r2 : r - 1; } }
  SEL.r = r; SEL.c = c;
  scrollToCell(r, c);
  after();
}
function selectCell(r, c) { SEL = { r, c, er: r, ec: c }; after(); }
function selectRange(g, active) {
  const a = active || { r: g.r1, c: g.c1 };
  SEL = { r: a.r, c: a.c, er: a.r === g.r1 ? g.r2 : g.r1, ec: a.c === g.c1 ? g.c2 : g.c1 };
  if (wholeCols(g) && wholeRows(g)) SEL.whole = 'a'; else if (wholeCols(g)) SEL.whole = 'c'; else if (wholeRows(g)) SEL.whole = 'r';
  after();
}
const topRow = () => V.vis ? (WS.fr ? 0 : V.vis.r0) : 0, firstCol = () => V.vis ? (WS.fc ? 0 : V.vis.c0) : 0;
function selectCols(c1, c2) { SEL = { r: topRow(), c: c1, er: MAXR - 1, ec: c2, whole: 'c' }; after(); }
function selectRows(r1, r2) { SEL = { r: r1, c: firstCol(), er: r2, ec: MAXC - 1, whole: 'r' }; after(); }
function selectAll() { SEL = { r: topRow(), c: firstCol(), er: MAXR - 1, ec: MAXC - 1, whole: 'a' }; after(); }
function after() { if (!V.view) return; render(); selInfo(); }
function scrollToSel() { scrollToCell(SEL.r, SEL.c); }
function scrollToCell(r, c) {
  if (!V.vis || !V.view) return;
  render();
  const sc = V.scroll, vis = V.vis, rtl = WS.dir === 'rtl', FW = colX(WS.fc), FH = rowY(WS.fr);
  if (c >= WS.fc && c < MAXC) {
    const x1 = colX(c), x2 = colX(c + 1), left = vis.sx + FW, right = vis.sx + sc.clientWidth;
    let sx = vis.sx;
    if (x1 < left) sx = x1 - FW; else if (x2 > right) sx = Math.min(x1 - FW, x2 - sc.clientWidth);
    if (sx !== vis.sx) sc.scrollLeft = rtl ? -Math.max(0, sx) : Math.max(0, sx);
  }
  if (r >= WS.fr && r < MAXR) {
    const y1 = rowY(r), y2 = rowY(r + 1), top = vis.sy + FH, bottom = vis.sy + sc.clientHeight;
    let sy = vis.sy;
    if (y1 < top) sy = y1 - FH; else if (y2 > bottom) sy = Math.min(y1 - FH, y2 - sc.clientHeight);
    if (sy !== vis.sy) sc.scrollTop = Math.max(0, sy);
  }
  render();
}

/* --- the pointer on the sheet: where it is, and what a press there starts --- */
function hit(e, loose) {
  const sc = V.scroll, rect = sc.getBoundingClientRect(), rtl = WS.dir === 'rtl', vis = V.vis;
  if (!vis) return null;
  const vx = rtl ? rect.right - e.clientX : e.clientX - rect.left, vy = e.clientY - rect.top;
  if (!loose && (vx < 0 || vy < 0 || vx > sc.clientWidth || vy > sc.clientHeight)) return null;
  const inFC = vx < RHW + vis.FW, inFR = vy < CHH + vis.FH;
  const x = inFC ? vx : vx + vis.sx, y = inFR ? vy : vy + vis.sy;
  const c = colAtX(Math.max(x, RHW)), r = rowAtY(Math.max(y, CHH));
  if (!loose) {
    if (vy < CHH && vx < RHW) return { kind: 'corner' };
    if (vy < CHH) {
      const end = colX(c + 1), start = colX(c);
      if (end - x <= 4) return { kind: 'colb', i: c };
      if (x - start <= 4 && c > 0) { let p = c - 1; while (p > 0 && !colW(p)) p--; return { kind: 'colb', i: p }; }
      return { kind: 'colh', c };
    }
    if (vx < RHW) {
      const end = rowY(r + 1), start = rowY(r);
      if (end - y <= 3) return { kind: 'rowb', i: r };
      if (y - start <= 3 && r > 0) { let p = r - 1; while (p > 0 && !rowH(p)) p--; return { kind: 'rowb', i: p }; }
      return { kind: 'rowh', r };
    }
    const g = selG();
    if (!ED.on && !wholeCols(g) && !wholeRows(g) && Math.abs(x - colX(g.c2 + 1)) <= 6 && Math.abs(y - rowY(g.r2 + 1)) <= 6) return { kind: 'fill' };
    const dva = dvArrow();
    if (dva && x >= dva.x - 1 && x <= dva.x + dva.size + 1 && y >= dva.y - 1 && y <= dva.y + dva.size + 1) return { kind: 'dv' };
    const f = WS.af;
    if (f && r === f.r1 && c >= f.c1 && c <= f.c2) {
      const size = Math.min(rowH(f.r1) - 3, 17 * Z), bx = colX(c + 1) - size - 3, by = rowY(f.r1 + 1) - size - 3;
      if (x >= bx - 1 && x <= bx + size + 2 && y >= by - 1) return { kind: 'filt', c };
    }
  }
  return { kind: 'cell', r, c, m: mergeAt(WS, r, c) };
}
/* --- notes: a cell's note shows beside it while the pointer is on the cell, as in Excel --- */
const NOTE = { at: null, ed: null };
function noteHover(hh) {
  const r = hh ? (hh.m ? hh.m.r1 : hh.r) : -1, c = hh ? (hh.m ? hh.m.c1 : hh.c) : -1, x = hh && !NOTE.ed ? cellAt(WS, r, c) : null;
  const at = x && x.n ? WS.id + ':' + r + ',' + c : null;
  if (at === NOTE.at) return;
  NOTE.at = at;
  noteTip();
}
/* where a note's box goes: beside the cell on its end side, or on the other side when there is no room */
function notePlace(e, r, c) {
  const vis = V.vis, m = mergeAt(WS, r, c), c2 = m ? m.c2 : c;
  const x0 = colX(c) - (c >= WS.fc ? vis.sx : 0), x1 = colX(c2 + 1) - (c2 >= WS.fc ? vis.sx : 0), y = rowY(r) - (r >= WS.fr ? vis.sy : 0), w = e.offsetWidth || 200;
  e.style.right = e.style.left = '';
  e.style[SIDE] = px(x1 + 10 + w > vis.vw && x0 - 10 - w > RHW ? x0 - 10 - w : x1 + 10);
  e.style.top = px(Math.max(CHH, Math.min(y, vis.vh - (e.offsetHeight || 60) - 4)));
}
function noteTip() {
  const at = NOTE.at && NOTE.at.split(':')[0] === WS.id ? NOTE.at.split(':')[1].split(',').map(Number) : null, x = at && cellAt(WS, at[0], at[1]);
  if (!x || !x.n || NOTE.ed || ED.on) { if (V.note) V.note.hidden = true; return; }
  if (!V.note) { V.note = h('div', { class: 'sh-note', role: 'note', dir: 'auto' }); V.over.append(V.note); }
  V.note.hidden = false;
  if (V.note.textContent !== x.n) V.note.textContent = x.n;
  notePlace(V.note, at[0], at[1]);
}
/* a note written or changed in its box on the sheet (Shift+F2): it is kept when the box loses focus, or with Esc */
function noteEdit(r = SEL.r, c = SEL.c) {
  if (!WS || (ED.on && !endEdit(true))) return;
  const m = mergeAt(WS, r, c);
  if (m) { r = m.r1; c = m.c1; }
  if (NOTE.ed) NOTE.ed.ta.blur();
  const s = WS, x = cellAt(s, r, c), ta = h('textarea', { class: 'sh-note ed', dir: 'auto', spellcheck: 'true', 'aria-label': T('הערה') });
  ta.value = (x && x.n) || '';
  NOTE.ed = { ta };
  NOTE.at = null;
  noteTip();
  V.over.append(ta);
  notePlace(ta, r, c);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); ta.blur(); } });
  ta.addEventListener('blur', () => {
    if (!NOTE.ed || NOTE.ed.ta !== ta) return;
    NOTE.ed = null;
    ta.remove();
    if (WB && WB.sheets.includes(s)) setNote(s, r, c, ta.value.replace(/\s+$/, ''));
    if (WS === s) focusGrid();
  });
}
function setNote(s, r, c, text) {
  const x = cellAt(s, r, c);
  if (text === ((x && x.n) || '')) return false;
  return edit(() => { const n = { ...(x || {}) }; if (text) n.n = text.slice(0, 32767); else delete n.n; setCell(s, r, c, n.f != null || n.v !== undefined || n.st || n.n ? n : null); });
}
/* every note in the chosen cells goes (Excel's Delete Note) */
function deleteNotes() {
  const g = selG();
  edit(() => { for (const [k, x] of [...WS.cells]) if (x.n && inG(g, kr(k), kc(k))) { const n = { ...x }; delete n.n; setCell(WS, kr(k), kc(k), n.f != null || n.v !== undefined || n.st ? n : null); } });
}
const notesIn = g => { for (const [k, x] of WS.cells) if (x.n && inG(g, kr(k), kc(k))) return true; return false; };

/* --- links: a cell's link (Ctrl+K, or HYPERLINK in its formula) shows under it when it is the active cell; the address
   there opens it, and Ctrl+click on the cell does too --- */
const LINK_LOOK = { c: '#0563c1', u: true };   // Excel's Hyperlink style
const linkAt = (s, r, c) => { const x = cellAt(s, r, c); return x ? x.k || x.hl || null : null; };
function followLink(t) {
  t = String(t || '').trim();
  if (t[0] === '#') { if (!goPlace(placeOf(t.slice(1)))) toast(T('המקום שהקישור מצביע עליו לא נמצא בחוברת'), { icon: 'error' }); return; }
  if (/^www\./i.test(t)) t = 'https://' + t;
  if (!/^(?:https?:\/\/|mailto:)/i.test(t)) { if (goPlace(placeOf(t))) return; toast(T('אי אפשר לפתוח את הקישור הזה'), { icon: 'error' }); return; }
  window.open(t, '_blank', 'noopener,noreferrer');
}
/* what a link shows in its chip: the address, or the place in the workbook */
const linkWords = t => t[0] === '#' ? T('מקום בחוברת: {0}', t.slice(1)) : t.replace(/^mailto:/i, '');
function linkTip() {
  const g = selG(), m = mergeAt(WS, SEL.r, SEL.c), one = (g.r1 === g.r2 && g.c1 === g.c2) || (m && sameG(g, m)), t = one && !ED.on && !NOTE.ed ? linkAt(WS, m ? m.r1 : SEL.r, m ? m.c1 : SEL.c) : null, vis = V.vis;
  if (!t || !vis) { if (V.link) V.link.hidden = true; return; }
  if (!V.link) {
    V.link = h('div', { class: 'sh-link', role: 'note' });
    V.link.addEventListener('pointerdown', e => e.stopPropagation());
    V.over.append(V.link);
  }
  const own = !!(cellAt(WS, m ? m.r1 : SEL.r, m ? m.c1 : SEL.c) || {}).k, sig = t + '|' + own;
  if (V.link._s !== sig) {
    V.link._s = sig;
    V.link.textContent = '';
    V.link.append(icon(t[0] === '#' ? 'move_down' : /^mailto:/i.test(t) ? 'mail' : 'public'), h('a', { href: t[0] === '#' ? '#' : t, dir: 'auto', title: t, text: linkWords(t), onclick: e => { e.preventDefault(); followLink(t); } }),
      own ? h('button', { class: 'icon-btn', type: 'button', title: T('עריכת קישור'), 'aria-label': T('עריכת קישור'), onclick: () => linkDialog() }, icon('edit')) : '',
      own ? h('button', { class: 'icon-btn', type: 'button', title: T('הסרת קישור'), 'aria-label': T('הסרת קישור'), onclick: () => removeLinks() }, icon('link_off')) : '');
  }
  const r2 = m ? m.r2 : SEL.r, c0 = m ? m.c1 : SEL.c, x = colX(c0) - (c0 >= WS.fc ? vis.sx : 0), y = rowY(r2 + 1) - (r2 >= WS.fr ? vis.sy : 0);
  V.link.hidden = (r2 >= WS.fr && y < CHH + vis.FH) || (c0 >= WS.fc && x < RHW + vis.FW) || y > vis.vh - 20 || x > vis.vw - 20;
  V.link.style.right = V.link.style.left = '';
  V.link.style[SIDE] = px(x);
  V.link.style.top = px(y + 4);
}
/* a link for the chosen cells (Ctrl+K), as Excel's Insert Link: a web address, a place in this workbook, or an email */
function linkDialog() {
  if (!WS || (ED.on && !endEdit(true))) return;
  const g = selG(), m = mergeAt(WS, SEL.r, SEL.c), r0 = m ? m.r1 : SEL.r, c0 = m ? m.c1 : SEL.c, x0 = cellAt(WS, r0, c0), k0 = (x0 && x0.k) || '';
  const fld = (label, ...kids) => h('label', { class: 'fld' }, h('span', { text: label }), ...kids);
  const kind0 = k0[0] === '#' ? 'place' : /^mailto:/i.test(k0) ? 'mail' : 'web';
  const kind = h('select', { class: 'field', 'aria-label': T('קישור אל') }, h('option', { value: 'web', text: T('כתובת אינטרנט') }), h('option', { value: 'place', text: T('מקום בחוברת') }), h('option', { value: 'mail', text: T('דואר אלקטרוני') }));
  kind.value = kind0;
  const hasText = x0 && x0.f == null && x0.v != null && x0.v !== '';
  const text = h('input', { class: 'field', dir: 'auto', value: hasText ? view(x0).t : '', maxlength: '255', autocomplete: 'off', 'aria-label': T('טקסט להצגה') });
  text.disabled = !!(x0 && x0.f != null);
  const url = h('input', { class: 'field', dir: 'ltr', value: kind0 === 'web' ? k0 : '', placeholder: 'https://', spellcheck: 'false', autocomplete: 'off', 'aria-label': T('כתובת'), autofocus: true });
  const p0 = kind0 === 'place' ? placeOf(k0.slice(1)) : null;
  const sheet = h('select', { class: 'field', 'aria-label': T('גיליון') }, WB.sheets.map(s => h('option', { value: s.id, text: s.name })));
  sheet.value = (p0 && p0.s ? p0.s : WS).id;
  const cellRef = h('input', { class: 'field', dir: 'ltr', value: p0 && p0.g ? rangeA1(p0.g) : p0 && p0.nm ? p0.nm.n : 'A1', spellcheck: 'false', autocomplete: 'off', 'aria-label': T('תא או שם') });
  const mail = h('input', { class: 'field', dir: 'ltr', value: kind0 === 'mail' ? decodeURIComponent(k0.slice(7).split('?')[0]) : '', placeholder: 'name@example.com', spellcheck: 'false', autocomplete: 'off', 'aria-label': T('כתובת דואר') });
  const subj0 = kind0 === 'mail' && /[?&]subject=([^&]*)/i.exec(k0);
  const subj = h('input', { class: 'field', dir: 'auto', value: subj0 ? decodeURIComponent(subj0[1]) : '', autocomplete: 'off', 'aria-label': T('נושא') });
  const parts = { web: [fld(T('כתובת'), url)], place: [fld(T('גיליון'), sheet), fld(T('תא או שם'), cellRef)], mail: [fld(T('כתובת דואר'), mail), fld(T('נושא'), subj)] };
  const holder = h('div', { class: 'sh-lkd-parts' });
  const show = () => { holder.textContent = ''; holder.append(...parts[kind.value]); };
  kind.addEventListener('change', show);
  show();
  const err = h('p', { class: 'sh-ch-err', role: 'alert', hidden: true });
  const fail = t => { err.textContent = t; err.hidden = false; return false; };
  const apply = () => {
    let k;
    if (kind.value === 'web') {
      let u = url.value.trim();
      if (!u) return fail(T('כותבים את הכתובת של הקישור'));
      if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
      if (!/^https?:\/\/\S+$/i.test(u)) return fail(T('זו לא כתובת של אתר. למשל: https://example.com'));
      k = u;
    } else if (kind.value === 'place') {
      const s = WB.sheets.find(y => y.id === sheet.value) || WS, t = cellRef.value.trim() || 'A1', q = /^[\p{L}_][\p{L}\p{N}_.]*$/u.test(s.name) ? s.name : "'" + s.name.replace(/'/g, "''") + "'";
      const pl = placeOf(q + '!' + t);
      if (!pl.g && !pl.nm) return fail(T('זו לא כתובת של תא או שם בחוברת. למשל: B7'));
      k = '#' + (pl.g ? q + '!' + rangeA1(pl.g) : pl.nm.n);
    } else {
      const a = mail.value.trim().replace(/^mailto:/i, '');
      if (!/^[^\s@]+@[^\s@]+$/.test(a)) return fail(T('זו לא כתובת דואר. למשל: name@example.com'));
      k = 'mailto:' + a + (subj.value.trim() ? '?subject=' + encodeURIComponent(subj.value.trim()) : '');
    }
    if (!linkOk(k)) return fail(T('הקישור ארוך מדי'));
    setLinks(g, k, text.disabled ? null : text.value);
    return true;
  };
  const acts = [{ label: T('אישור'), kind: 'primary', run: apply }, { label: T('ביטול'), value: false }];
  if (k0) acts.splice(1, 0, { label: T('הסרת קישור'), run: () => { removeLinks(); return true; } });
  const md = modal({ title: k0 ? T('עריכת קישור') : T('הוספת קישור'), body: h('div', { class: 'sh-nmd' }, fld(T('קישור אל'), kind), holder, fld(T('טקסט להצגה'), text), err), actions: acts, onClose: () => { if (!MODALS.length) focusGrid(); } });
  md.body.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.target.tagName === 'INPUT') { e.preventDefault(); if (apply()) md.close(true); } });
}
/* the link on each chosen cell (or the area of a merge): an empty cell shows the text, or the address itself; the look
   becomes Excel's link look where the cell has no color of its own */
function setLinks(g, k, text) {
  const s = WS, u = usedEnd(s), r2 = Math.min(g.r2, Math.max(u.r, g.r1)), c2 = Math.min(g.c2, Math.max(u.c, g.c1));
  edit(() => {
    for (let r = g.r1; r <= r2; r++) for (let c = g.c1; c <= c2; c++) {
      const m = mergeAt(s, r, c);
      if (m && (m.r1 !== r || m.c1 !== c)) continue;
      const x = cellAt(s, r, c), n = { ...(x || {}), k }, st = { ...((x ? x.st : emptyLook(s, r, c)) || {}) };
      if (n.f == null) { if (text != null && text.trim() && r === g.r1 && c === g.c1) n.v = text.trim(); else if (n.v == null || n.v === '') n.v = k[0] === '#' ? k.slice(1) : k.replace(/^mailto:/i, '').split('?')[0]; }
      if (!st.c) Object.assign(st, LINK_LOOK);
      n.st = normStyle(st) || undefined;
      if (!n.st) delete n.st;
      setCell(s, r, c, n);
    }
  });
}
/* the links of the chosen cells go, and Excel's link look with them (Remove Hyperlinks) */
function removeLinks() {
  const g = selG();
  edit(() => {
    for (const [key, x] of [...WS.cells]) {
      if (!x.k || !inG(g, kr(key), kc(key))) continue;
      const n = { ...x }; delete n.k;
      if (n.st && n.st.c === LINK_LOOK.c && n.st.u) { const st = { ...n.st }; delete st.c; delete st.u; n.st = normStyle(st) || undefined; if (!n.st) delete n.st; }
      setCell(WS, kr(key), kc(key), n.f != null || n.v !== undefined || n.st || n.n ? n : null);
    }
  });
}
const linksIn = g => { for (const [k, x] of WS.cells) if (x.k && inG(g, kr(k), kc(k))) return true; return false; };
let DRAG = null;
function onDown(e) {
  if (!WS || (e.button !== 0 && e.button !== 2)) return;
  const ce = e.target.closest && e.target.closest('.sh-chart');
  if (ce) { chartDown(e, ce); return; }
  if (CH.id) { CH.id = null; renderSoon(); }
  TOUCHY = e.pointerType === 'touch';
  const hh = hit(e);
  if (!hh) return;
  const listOpen = !!document.querySelector('#pop .sh-dvl');
  closePopover();
  if (e.button === 2) {   // a right click in the selection keeps it; outside it, it chooses that cell first
    if (hh.kind === 'cell' && !inG(selG(), hh.r, hh.c)) { if (ED.on && !endEdit(true)) return; selectCell(hh.m ? hh.m.r1 : hh.r, hh.m ? hh.m.c1 : hh.c); }
    return;
  }
  if (hh.kind === 'dv') {   // the arrow of the cell's list opens it, and closes it again; what was being typed is dropped
    e.preventDefault();
    if (ED.on) endEdit(false);
    if (!listOpen) openDvList();
    return;
  }
  if (TOUCHY && hh.kind === 'cell' && !ED.on) { DRAG = { kind: 'tap', x: e.clientX, y: e.clientY, hh }; return; }
  e.preventDefault();
  if (ED.on) {
    if (hh.kind === 'cell' && pointable()) {
      const gp = PREFS.shGpd !== false && pivotRefText(WS, hh.r, hh.c);
      if (gp) { putRef(G4(hh.r, hh.c, hh.r, hh.c), gp); return; }   // a pivot table's value: Excel writes GETPIVOTDATA for it
      putRef(G4(hh.r, hh.c, hh.r, hh.c));
      Object.assign(ED.point, { ar: hh.r, ac: hh.c, br: hh.r, bc: hh.c });
      DRAG = { kind: 'point' };
      V.scroll.setPointerCapture(e.pointerId);
      return;
    }
    if (!endEdit(true)) return;
  }
  focusGrid();
  switch (hh.kind) {
    case 'corner': selectAll(); return;
    case 'colb': case 'rowb': startResize(hh, e); return;
    case 'filt': openFilterMenu(hh.c); return;
    case 'colh': selectCols(e.shiftKey && SEL.whole === 'c' ? SEL.c : hh.c, hh.c); DRAG = { kind: 'cols' }; break;
    case 'rowh': selectRows(e.shiftKey && SEL.whole === 'r' ? SEL.r : hh.r, hh.r); DRAG = { kind: 'rows' }; break;
    case 'fill': DRAG = { kind: 'fill', g: selG(), to: null }; break;
    case 'cell':
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) { const l = linkAt(WS, hh.m ? hh.m.r1 : hh.r, hh.m ? hh.m.c1 : hh.c); if (l) { selectCell(hh.m ? hh.m.r1 : hh.r, hh.m ? hh.m.c1 : hh.c); followLink(l); return; } }
      if (e.shiftKey) { SEL.er = hh.r; SEL.ec = hh.c; SEL.whole = null; after(); }
      else selectCell(hh.m ? hh.m.r1 : hh.r, hh.m ? hh.m.c1 : hh.c);
      DRAG = { kind: 'cells' };
      break;
  }
  V.scroll.setPointerCapture(e.pointerId);
}
function onMove(e) {
  if (!WS) return;
  if (!DRAG) {   // the pointer shows where a column or row can be resized, the fill handle and the filter buttons
    const hh = hit(e), cur = hh ? { colb: 'col-resize', rowb: 'row-resize', fill: 'crosshair', filt: 'pointer', dv: 'pointer' }[hh.kind] || '' : '';
    if (V.scroll.style.cursor !== cur) V.scroll.style.cursor = cur;
    noteHover(hh && hh.kind === 'cell' && e.pointerType !== 'touch' ? hh : null);
    return;
  }
  if (DRAG.kind === 'chart') { chartMove(e); return; }
  if (DRAG.kind === 'tap') { if (Math.hypot(e.clientX - DRAG.x, e.clientY - DRAG.y) > 8) DRAG = null; return; }
  if (DRAG.kind === 'resize') { moveResize(e); return; }
  DRAG.ev = { clientX: e.clientX, clientY: e.clientY };
  dragTo(DRAG.ev);
  autoScroll();
}
function dragTo(ev) {
  const hh = hit(ev, true), d = DRAG;
  if (!hh || !d) return;
  if (d.kind === 'cells') { if (SEL.er !== hh.r || SEL.ec !== hh.c) { SEL.er = hh.r; SEL.ec = hh.c; after(); } }
  else if (d.kind === 'cols') { if (SEL.ec !== hh.c) { SEL.ec = hh.c; after(); } }
  else if (d.kind === 'rows') { if (SEL.er !== hh.r) { SEL.er = hh.r; after(); } }
  else if (d.kind === 'point') { const p = ED.point; if (p && (p.br !== hh.r || p.bc !== hh.c)) { const a = { r: p.ar, c: p.ac }; putRef(G4(a.r, a.c, hh.r, hh.c)); Object.assign(ED.point, { ar: a.r, ac: a.c, br: hh.r, bc: hh.c }); } }
  else if (d.kind === 'fill') {
    // the fill goes the way the pointer went furthest out of the range: down, up, or to either side
    const g = d.g, dn = hh.r - g.r2, up = g.r1 - hh.r, fw = hh.c - g.c2, bw = g.c1 - hh.c, best = Math.max(dn, up, fw, bw);
    const to = best <= 0 ? null : best === dn ? { ...g, r2: hh.r } : best === up ? { ...g, r1: hh.r } : best === fw ? { ...g, c2: hh.c } : { ...g, c1: hh.c };
    d.to = to;
    const t = to || g;
    SEL = { r: SEL.r, c: SEL.c, er: t.r1 === SEL.r ? t.r2 : t.r1, ec: t.c1 === SEL.c ? t.c2 : t.c1 };
    render();
  }
}
let SCROLLER = 0;
function autoScroll() {
  cancelAnimationFrame(SCROLLER);
  if (!DRAG || !DRAG.ev) return;
  const sc = V.scroll, rect = sc.getBoundingClientRect(), ev = DRAG.ev, rtl = WS.dir === 'rtl';
  const vx = rtl ? rect.right - ev.clientX : ev.clientX - rect.left, vy = ev.clientY - rect.top;
  let dx = 0, dy = 0;
  if (vy > sc.clientHeight - 8) dy = Math.min(40, (vy - sc.clientHeight + 8) / 2 + 4); else if (vy < CHH + 4 && DRAG.kind !== 'cols') dy = -Math.min(40, (CHH + 4 - vy) / 2 + 4);
  if (vx > sc.clientWidth - 8) dx = Math.min(40, (vx - sc.clientWidth + 8) / 2 + 4); else if (vx < RHW + 4 && DRAG.kind !== 'rows') dx = -Math.min(40, (RHW + 4 - vx) / 2 + 4);
  if (!dx && !dy) return;
  SCROLLER = requestAnimationFrame(() => {
    if (!DRAG) return;
    if (dy) sc.scrollTop += dy;
    if (dx) sc.scrollLeft += rtl ? -dx : dx;
    render();
    dragTo(DRAG.ev);
    autoScroll();
  });
}
function onUp(e) {
  cancelAnimationFrame(SCROLLER);
  const d = DRAG;
  DRAG = null;
  if (!d) return;
  try { V.scroll.releasePointerCapture(e.pointerId); } catch {}
  if (d.kind === 'tap') {   // a finger: a tap chooses the cell, and a tap on the chosen cell opens it for writing
    const hh = d.hh, r = hh.m ? hh.m.r1 : hh.r, c = hh.m ? hh.m.c1 : hh.c, g = selG();
    if (SEL.r === r && SEL.c === c && (g.r1 === g.r2 && g.c1 === g.c2 || sameG(g, hh.m))) { TOUCHY = false; startEdit('edit'); }
    else selectCell(r, c);
    return;
  }
  if (d.kind === 'resize') { endResize(d); return; }
  if (d.kind === 'chart') { chartUp(d); return; }
  if (d.kind === 'fill') { if (d.to) fillRange(d.g, d.to); else { SEL = { r: SEL.r, c: SEL.c, er: d.g.r1 === SEL.r ? d.g.r2 : d.g.r1, ec: d.g.c1 === SEL.c ? d.g.c2 : d.g.c1 }; after(); } return; }
  if (d.kind === 'point') { taOf().focus({ preventScroll: true }); return; }
  focusGrid();
}
function onDbl(e) {
  const ce = chartAt(e);
  if (ce) { objDialog(ce.dataset.id); return; }
  const hh = hit(e);
  if (!hh) return;
  if (hh.kind === 'colb') autoFit('c', hh.i);
  else if (hh.kind === 'rowb') autoFit('r', hh.i);
  else if (hh.kind === 'fill') fillDownAuto();
  else if (hh.kind === 'cell' && !ED.on) { TOUCHY = false; startEdit('edit'); }
}
/* resizing a column or row by its edge (every chosen one, when the edge belongs to one of them) */
function startResize(hh, e) {
  const axis = hh.kind === 'colb' ? 'c' : 'r', i = hh.i;
  const start = axis === 'c' ? (WS.dir === 'rtl' ? -e.clientX : e.clientX) : e.clientY, size0 = axis === 'c' ? colW(i) : rowH(i);
  const line = h('div', { class: 'sh-guide ' + axis });
  V.over.append(line);
  DRAG = { kind: 'resize', axis, i, start, size0, size: size0, line };
  V.scroll.setPointerCapture(e.pointerId);
  moveResize(e);
}
function moveResize(e) {
  const d = DRAG, now = d.axis === 'c' ? (WS.dir === 'rtl' ? -e.clientX : e.clientX) : e.clientY, vis = V.vis;
  d.size = Math.max(d.axis === 'c' ? 4 : 6, d.size0 + now - d.start);
  if (d.axis === 'c') { d.line.style.right = d.line.style.left = ''; d.line.style[SIDE] = px(colX(d.i) - (d.i >= WS.fc ? vis.sx : 0) + d.size - 1); }
  else d.line.style.top = px(rowY(d.i) - (d.i >= WS.fr ? vis.sy : 0) + d.size - 1);
  d.line.dataset.size = fmt(Math.round(d.size / Z)) + ' px';
}
function endResize(d) {
  d.line.remove();
  const g = selG(), mine = d.axis === 'c' ? (SEL.whole === 'c' || SEL.whole === 'a') && d.i >= g.c1 && d.i <= g.c2 : (SEL.whole === 'r' || SEL.whole === 'a') && d.i >= g.r1 && d.i <= g.r2;
  const list = !mine ? [d.i] : d.axis === 'c' ? span(g.c1, Math.min(g.c2, EXT.cols)) : span(g.r1, Math.min(g.r2, EXT.rows));
  setSizes(d.axis, list, Math.round(d.size / Z));
}
const span = (a, b) => { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; };
function setSizes(axis, list, size) {
  edit(() => {
    const key = axis === 'c' ? 'cw' : 'rh', hid = axis === 'c' ? 'hc' : 'hr', m = new Map(WS[key]), hs = new Set(WS[hid]), def = axis === 'c' ? WS.dw : WS.dh;
    for (const i of list) { if (size <= 0) hs.add(i); else { hs.delete(i); if (size === def) m.delete(i); else m.set(i, size); } }
    setProp(WS, key, m); setProp(WS, hid, hs);
  });
}
/* the width that fits everything in a column (or the height for a row), as a double click on its edge gives */
function autoFit(axis, i) {
  const g = selG(), u = usedEnd(WS);
  const list = axis === 'c' && (SEL.whole === 'c' || SEL.whole === 'a') && i >= g.c1 && i <= g.c2 ? span(g.c1, Math.min(g.c2, u.c)) : axis === 'r' && (SEL.whole === 'r' || SEL.whole === 'a') && i >= g.r1 && i <= g.r2 ? span(g.r1, Math.min(g.r2, u.r)) : [i];
  const want = new Set(list), best = new Map();
  for (const [k, x] of WS.cells) {
    const j = axis === 'c' ? kc(k) : kr(k);
    if (!want.has(j) || !hasVal(x) || mergeAt(WS, kr(k), kc(k))) continue;
    const st = x.st, size = (st && st.fs || DEF_FS) * 4 / 3, font = fontOf(st, size), t = view(x).t;
    const need = axis === 'c' ? (st && st.wr ? 0 : textW(t, font) + 10) : size * 1.3 * (st && st.wr ? Math.max(1, Math.ceil((textW(t, font) + 8) / Math.max(20, geo().cols.size(kc(k))))) + t.split('\n').length - 1 : t.split('\n').length) + 6;
    best.set(j, Math.max(best.get(j) || 0, need));
  }
  edit(() => {
    const key = axis === 'c' ? 'cw' : 'rh', m = new Map(WS[key]), hs = new Set(WS[axis === 'c' ? 'hc' : 'hr']), def = axis === 'c' ? WS.dw : WS.dh;
    for (const j of list) {
      hs.delete(j);
      const b = best.get(j), size = b ? Math.ceil(Math.min(axis === 'c' ? 900 : 400, Math.max(axis === 'c' ? 24 : def, b))) : def;
      if (size === def) m.delete(j); else m.set(j, size);
    }
    setProp(WS, key, m); setProp(WS, axis === 'c' ? 'hc' : 'hr', hs);
  });
}

/* --- the keyboard --- */
function arrowStep(k) { const rtl = WS.dir === 'rtl'; return { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, rtl ? 1 : -1], ArrowRight: [0, rtl ? -1 : 1] }[k]; }
function onKey(e) {
  if (!WB || !V.view || MODALS.length || !LOADED || LOADED !== S.cur) return false;
  const t = e.target, inBar = t === V.bar, inGrid = t === V.ed || t === V.scroll || t === document.body;
  if (!inBar && !inGrid) return false;
  if (e.isComposing || e.keyCode === 229) return false;
  if (AC.on && acKey(e)) return true;
  if (CH.id && !ED.on && !inBar) return chartKey(e);
  return ED.on ? editKey(e) : inBar ? false : gridKey(e);
}
function editKey(e) {
  const mod = e.ctrlKey || e.metaKey, k = e.key;
  if (k === 'Escape') { e.preventDefault(); endEdit(false); return true; }
  if (k === 'Enter' && e.altKey) { e.preventDefault(); const ta = taOf(); ta.setRangeText('\n', ta.selectionStart, ta.selectionEnd, 'end'); ED.point = null; edChanged(); return true; }
  if (k === 'Enter') { e.preventDefault(); ED.all = mod; endEdit(true, mod ? null : [e.shiftKey ? -1 : 1, 0]); return true; }
  if (k === 'Tab') { e.preventDefault(); endEdit(true, [0, e.shiftKey ? -1 : 1]); return true; }
  if (k === 'F2') { e.preventDefault(); ED.mode = ED.mode === 'enter' ? 'edit' : 'enter'; ED.point = null; return true; }
  if (k === 'F4') { e.preventDefault(); cycleAbs(); return true; }
  if (/^Arrow/.test(k) && ED.mode === 'enter' && ED.from === 'cell' && !mod && !e.altKey) {
    e.preventDefault();
    if (pointable()) pointKey(k, e.shiftKey); else endEdit(true, arrowStep(k));
    return true;
  }
  return false;
}
function gridKey(e) {
  const mod = e.ctrlKey || e.metaKey, k = e.key, c = e.code, d = arrowStep(k);
  if (d && !e.altKey) { e.preventDefault(); moveSel(d[0], d[1], e.shiftKey, mod); return true; }
  if (e.altKey && !mod && (k === 'ArrowDown' || k === 'ArrowUp') && openDvList()) { e.preventDefault(); return true; }   // Alt+↓ opens the cell's list, as in Excel
  if (k === 'Enter' && !mod) { e.preventDefault(); stepInSel(e.shiftKey ? -1 : 1, 0); return true; }
  if (k === 'Tab' && !mod) { e.preventDefault(); stepInSel(0, e.shiftKey ? -1 : 1); return true; }
  if (k === 'Home') { e.preventDefault(); if (mod) { SEL = { r: 0, c: 0, er: 0, ec: 0 }; scrollToSel(); after(); } else moveSel(0, -SEL.c, e.shiftKey); return true; }
  if (k === 'End' && mod) { e.preventDefault(); const u = usedEnd(WS), r = Math.max(0, u.r - 1), cc = Math.max(0, u.c - 1); SEL = { r, c: cc, er: r, ec: cc }; scrollToSel(); after(); return true; }
  if (k === 'PageDown' || k === 'PageUp') {
    e.preventDefault();
    if (mod) { const s = WB.sheets[WB.sheets.indexOf(WS) + (k === 'PageDown' ? 1 : -1)]; if (s) showSheet(s); return true; }
    const n = Math.max(1, V.vis.r1 - V.vis.r0 - 2);
    moveSel(k === 'PageDown' ? n : -Math.min(n, SEL.r), 0, e.shiftKey);
    return true;
  }
  if (k === 'F2' && e.shiftKey && !mod) { e.preventDefault(); noteEdit(); return true; }
  if (mod && !e.shiftKey && !e.altKey && (k === 'k' || k === 'K' || e.code === 'KeyK')) { e.preventDefault(); linkDialog(); return true; }
  if (k === 'F2') { e.preventDefault(); startEdit('edit'); return true; }
  if (k === 'F3' && e.shiftKey && !mod) { e.preventDefault(); fnDialog(); return true; }
  if (k === 'F3' && mod) { e.preventDefault(); if (e.shiftKey) namesFromSelection(); else nameManager(); return true; }
  if (k === 'Delete' && !mod) { e.preventDefault(); clearSel('v'); return true; }
  if (k === 'Backspace' && !mod) { e.preventDefault(); startEdit('enter', ''); return true; }
  if (k === 'Escape') return onEsc();
  if (k === 'ContextMenu' || (e.shiftKey && k === 'F10')) { e.preventDefault(); const r = V.ed.getBoundingClientRect(); openCellMenu(r.left + 10, r.bottom); return true; }
  if (e.altKey && !mod && (k === '=' || c === 'Equal')) { e.preventDefault(); autoSum('SUM'); return true; }
  if (e.shiftKey && !mod && !e.altKey && k === ' ') { e.preventDefault(); const g = selG(); selectRows(g.r1, g.r2); return true; }
  if (mod && !e.altKey) {
    const act = {
      KeyZ: () => e.shiftKey ? redo() : undo(), KeyY: redo, KeyB: () => toggleLook('b'), KeyI: () => toggleLook('i'), KeyU: () => toggleLook('u'), Digit5: () => toggleLook('s'),
      KeyA: selectAll, KeyD: () => fillDir('d'), KeyR: () => fillDir('r'), Backquote: toggleFormulas, KeyF: () => openFind(false), KeyH: () => openFind(true),
      Semicolon: () => startEdit('enter', editText({ v: todaySerial(), st: { nf: DATE_NF } })),
      Space: () => { const g = selG(); selectCols(g.c1, g.c2); }, KeyT: () => tableDialog(),
    }[c] || (c === 'KeyL' ? (e.shiftKey ? toggleFilter : () => tableDialog()) : null);
    if (c === 'KeyV' && e.shiftKey) { PASTE_AS = 'v'; setTimeout(() => { PASTE_AS = null; }, 1000); return false; }   // the browser's own paste event follows
    if (act) { e.preventDefault(); act(); return true; }
    return false;
  }
  if (e.target === V.scroll && k.length === 1 && !e.altKey) { e.preventDefault(); TOUCHY = false; startEdit('enter', k); return true; }
  return false;
}
function onEsc() {
  if (!WB || !LOADED || LOADED !== S.cur) return false;
  if (AC.on) { acHide(); return true; }
  if (ED.on) { endEdit(false); return true; }
  if (CH.id) { CH.id = null; renderSoon(); return true; }
  if (CLIP && CLIP.ants) { CLIP.ants = false; render(); return true; }
  return false;
}

/* --- the formula helper: the functions whose names start with what is typed, and the arguments of the function the
   caret is in, with the current one in bold --- */
const AC = { on: false, list: [], i: 0, from: 0, box: null, hint: null, dv: false };
function acUpdate() {
  const ta = taOf(), v = ta.value, pos = ta.selectionStart, was = AC.on ? AC.list[AC.i] : undefined;
  AC.on = false; AC.list = []; AC.hint = null; AC.dv = false;
  if (ED.on && ED.dv && v[0] !== '=') {
    // a cell with a list: the items that hold what was typed, those that start with it first. None is marked until an
    // arrow goes into them, so Enter still enters what was typed
    const t = v.trim().toLowerCase(), has = t ? ED.dv.filter(it => it.t.toLowerCase().includes(t)) : [];
    AC.list = [...has.filter(it => it.t.toLowerCase().startsWith(t)), ...has.filter(it => !it.t.toLowerCase().startsWith(t))].slice(0, 10);
    AC.dv = true; AC.i = AC.list.indexOf(was); AC.on = AC.list.length > 0 && !(AC.list.length === 1 && AC.list[0].t === v.trim());
  } else if (ED.on && v[0] === '=' && pos === ta.selectionEnd) {
    const before = v.slice(0, pos), m = /(?:^=|[=(,;:+\-*/^&<>\s])([\p{L}_][\p{L}\p{N}_.]*)$/u.exec(before);
    // right after a : only what can answer with a reference is offered, and nothing while the letters may still be a
    // column's (A:C, A1:IV9): Enter takes the marked name, and would spoil a plain range
    const colon = !!m && before[before.length - m[1].length - 1] === ':';
    if (m && !/^[A-Za-z]{1,3}\d+$/.test(m[1]) && !(colon && /^[A-Za-z]{1,3}$/.test(m[1]))) {
      // the functions and the defined names that start with what was typed, in one list by the alphabet (a name is { nm })
      const up = m[1].toUpperCase(), low = m[1].toLowerCase(), sheet = WB.sheets.find(x => x.id === ED.sid) || WS;
      const names = namesFor(sheet).filter(x => x.n.toLowerCase().startsWith(low) && x.n.toLowerCase() !== low).map(x => ({ nm: x }));
      AC.list = [...FN_LIST.filter(n => n.startsWith(up) && n !== up && (!colon || REF_FN.has(n))), ...names].sort((a, b) => COLL.compare(a.nm ? a.nm.n : a, b.nm ? b.nm.n : b));
      AC.from = pos - m[1].length; AC.i = Math.max(0, AC.list.findIndex(it => it === was || (!!it.nm && !!was && it.nm === was.nm))); AC.on = AC.list.length > 0;   // the marked name stays marked (a key going up asks again)
    }
    const stack = [];
    for (const k of tokenize(before.slice(1))) {
      if (k.t === 'fn') stack.push({ n: k.n, a: 0, open: false });
      else if (k.t === '(') { const top = stack[stack.length - 1]; if (top && top.n && !top.open) top.open = true; else stack.push({ n: null, a: 0, open: true }); }
      else if (k.t === ')') stack.pop();
      else if (k.t === ',' && stack.length) stack[stack.length - 1].a++;
    }
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].n && stack[i].open) { if (FN_INFO[stack[i].n]) AC.hint = { fn: stack[i].n, arg: stack[i].a }; break; }
  }
  acShow();
}
function acShow() {
  if (!AC.box) { AC.box = h('div', { class: 'sh-ac', role: 'listbox' }); V.over.append(AC.box); }
  const box = AC.box;
  box.textContent = '';
  if (!ED.on || (!AC.on && !AC.hint)) { box.hidden = true; return; }
  if (AC.on) AC.list.forEach((n, i) => box.append(h('div', { class: 'sh-aci' + (AC.dv ? ' dv' : '') + (i === AC.i ? ' on' : ''), role: 'option', onpointerdown: ev => { ev.preventDefault(); AC.i = i; acTake(); } },
    AC.dv ? h('span', { text: n.t, dir: 'auto' }) : n.nm ? [h('b', { text: n.nm.n, dir: 'auto' }), h('span', {}, T('שם מוגדר') + ' · ', h('bdi', { dir: 'ltr', text: '=' + (n.nm.f.length > 40 ? n.nm.f.slice(0, 39) + '…' : n.nm.f) }))]
      : [h('b', { text: n, dir: 'ltr' }), h('span', { text: fnDesc(n) })])));
  else {
    const parts = fnArgs(AC.hint.fn), on = Math.min(AC.hint.arg, parts.length - 1);
    box.append(h('div', { class: 'sh-hint' }, h('b', { text: AC.hint.fn + '(', dir: 'ltr' }), ...parts.flatMap((p, i) => [i ? ', ' : '', h('span', { class: i === on ? 'on' : null, dir: 'auto', text: p })]), ')'), h('div', { class: 'sh-hint-t', text: fnDesc(AC.hint.fn) }));
  }
  box.hidden = false;
  const r = taOf().getBoundingClientRect(), o = V.over.getBoundingClientRect();
  box.style.top = px(Math.min(r.bottom - o.top + 2, Math.max(0, o.height - box.offsetHeight - 4)));
  box.style.right = box.style.left = '';
  if (WS.dir === 'rtl') box.style.right = px(clamp(o.right - r.right, 0, Math.max(0, o.width - box.offsetWidth))); else box.style.left = px(clamp(r.left - o.left, 0, Math.max(0, o.width - box.offsetWidth)));
}
function acHide() { AC.on = false; AC.list = []; AC.hint = null; AC.dv = false; if (AC.box) AC.box.hidden = true; }
function acTake() {
  const ta = taOf(), n = AC.list[AC.i];
  if (!n) return;
  if (AC.dv) { const r = ED.r, c = ED.c; endEdit(false); dvPut(r, c, n); return; }   // an item of the cell's list, in place of what was typed
  ta.setRangeText(n.nm ? n.nm.n + (/^LAMBDA\s*\(/i.test(n.nm.f) ? '(' : '') : n + '(', AC.from, ta.selectionStart, 'end');   // a name that holds a LAMBDA is called like a function
  ED.point = null;
  edChanged();
}
function acKey(e) {
  const n = AC.list.length, step = e.key === 'ArrowDown' ? 1 : -1;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); AC.i = AC.dv ? clamp(AC.i + step, -1, n - 1) : (AC.i + step + n) % n; acShow(); return true; }
  if (e.key === 'Tab' || (e.key === 'Enter' && !e.altKey && !e.ctrlKey)) {
    if (AC.dv && AC.i < 0) return false;
    e.preventDefault();
    const go = AC.dv ? (e.key === 'Tab' ? [0, e.shiftKey ? -1 : 1] : [e.shiftKey ? -1 : 1, 0]) : null;
    acTake();
    if (go) moveSel(go[0], go[1], false, false);   // and on to the next cell, as the key does after typing
    return true;
  }
  if (e.key === 'Escape') { e.preventDefault(); acHide(); return true; }
  return false;
}

/* =========================================================
   changing what is chosen: the look, number formats, borders, clearing, rows and columns, merging, filling, sorting,
   filtering, and the sheets themselves
   ========================================================= */
/* a range that reaches the sheet's edges, cut down to where there is something */
function usedPart(g) {
  if (!wholeCols(g) && !wholeRows(g)) return g;
  const u = usedEnd(WS);
  return { r1: g.r1, c1: g.c1, r2: Math.min(g.r2, Math.max(g.r1, u.r - 1)), c2: Math.min(g.c2, Math.max(g.c1, u.c - 1)) };
}
const withLook = (x, st) => { const n = { ...x }; if (st) n.st = st; else delete n.st; return hasVal(n) || n.st || n.n || n.k ? n : null; };
/* what stays on a cell when what is written in it changes or is cleared: its note and its link, as in Excel */
const keepOn = (x, cell) => x && (x.n || x.k) ? { ...(cell || {}), ...(x.n ? { n: x.n } : {}), ...(x.k ? { k: x.k } : {}) } : cell;
/* one change to the look of every chosen cell. Whole columns, rows or the sheet keep it as their own look too, so
   what is typed there later gets it, as in Excel */
function patchLook(fn, g = selG()) {
  const apply = st => { const n = { ...(st || {}) }; fn(n); return normStyle(n); };
  edit(() => {
    const s = WS, all = wholeCols(g) && wholeRows(g);
    if (all) setProp(s, 'ds', apply(s.ds));
    else if (wholeCols(g)) { const m = new Map(s.cs); for (let c = g.c1; c <= g.c2; c++) { const st = apply(m.get(c)); if (st) m.set(c, st); else m.delete(c); } setProp(s, 'cs', m); }
    else if (wholeRows(g)) { const m = new Map(s.rs); for (let r = g.r1; r <= g.r2; r++) { const st = apply(m.get(r)); if (st) m.set(r, st); else m.delete(r); } setProp(s, 'rs', m); }
    const big = (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1) > 60000;
    if (wholeCols(g) || wholeRows(g) || big) { for (const [k, x] of [...s.cells]) { const r = kr(k), c = kc(k); if (inG(g, r, c)) setCell(s, r, c, withLook(x, apply(x.st))); } return; }
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
      const x = cellAt(s, r, c), st = apply(x ? x.st : emptyLook(s, r, c));
      if (x) setCell(s, r, c, withLook(x, st)); else if (st) setCell(s, r, c, { st });
    }
  });
}
/* bold and the like: on for all, unless the active cell has it already */
function toggleLook(k) { const cur = lookAt(WS, SEL.r, SEL.c), on = !(cur && cur[k]); patchLook(st => { if (on) st[k] = true; else delete st[k]; }); }
function setLook(k, v) { patchLook(st => { if (v == null || v === '') delete st[k]; else st[k] = v; }); }
/* number formats */
const NF_OF = { gen: null, num: NUM_NF, int: '#,##0', cur: curNf(CUR), pct: PCT_NF, date: DATE_NF, ldate: LDATE_NF, time: TIME_NF, text: '@' };
function setNf(nf) { patchLook(st => { if (nf) st.nf = nf; else delete st.nf; }); }
function stepDecimals(d) {
  const x = cellAt(WS, SEL.r, SEL.c), nf = x && x.st && x.st.nf;
  if (nf && isDateNf(nf)) return;
  let next;
  if (!nf || nfKind(nf) === 'gen') {
    const v = x && typeof x.v === 'number' ? x.v : 0, t = genText(v, 11), have = t.includes(DEC) ? t.split(DEC)[1].length : 0;
    next = nfWithDecimals('0', Math.max(0, have + d));
  } else next = nfWithDecimals(nf, Math.max(0, nfDecimals(nf) + d));
  setNf(next);
}
/* borders: the chosen color and line kind, on the sides a choice names (right and left are the sides on screen) */
const bdPref = () => Object.assign({ c: '#000000', k: '1s' }, PREFS.shBd || {});
function setBorders(kind) {
  const g = usedPart(selG()), p = bdPref(), rtl = WS.dir === 'rtl', spec = kind === 'thick' ? '2s' + p.c : kind === 'double' ? '1=' + p.c : p.k + p.c;
  const right = rtl ? 'bs' : 'be', left = rtl ? 'be' : 'bs';
  edit(() => {
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
      const x = cellAt(WS, r, c), st = { ...((x ? x.st : emptyLook(WS, r, c)) || {}) };
      const top = r === g.r1, bot = r === g.r2, sta = c === g.c1, end = c === g.c2;
      if (kind === 'none') { delete st.bt; delete st.bb; delete st.bs; delete st.be; }
      else if (kind === 'all') { st.bt = st.bb = st.bs = st.be = spec; }
      else if (kind === 'outer' || kind === 'thick') { if (top) st.bt = spec; if (bot) st.bb = spec; if (sta) st.bs = spec; if (end) st.be = spec; }
      else if (kind === 'bottom' || kind === 'double') { if (bot) st.bb = spec; }
      else if (kind === 'top') { if (top) st.bt = spec; }
      else if (kind === 'right') { if (right === 'bs' ? sta : end) st[right] = spec; }
      else if (kind === 'left') { if (left === 'bs' ? sta : end) st[left] = spec; }
      else if (kind === 'inner') { if (!bot) st.bb = spec; if (!end) st.be = spec; }
      const ns = normStyle(st);
      if (x) setCell(WS, r, c, withLook(x, ns)); else if (ns) setCell(WS, r, c, { st: ns });
    }
  });
}
/* Delete clears what's written (the look stays); formats only; or everything, merges too */
function clearSel(what) {
  const g = selG();
  edit(() => {
    for (const [k, x] of [...WS.cells]) {
      const r = kr(k), c = kc(k);
      if (!inG(g, r, c)) continue;
      if (what === 'v') setCell(WS, r, c, keepOn(x, x.st ? { st: x.st } : null));
      else if (what === 'f') setCell(WS, r, c, withLook(x, null));
      else setCell(WS, r, c, null);
    }
    if (what !== 'v') {
      cutRules(WS, 'cf', g);
      if (what === 'a') cutRules(WS, 'dv', g);   // Excel's Clear All takes data validation away; Clear Formats leaves it
      const inside = m => m.r1 >= g.r1 && m.r2 <= g.r2 && m.c1 >= g.c1 && m.c2 <= g.c2;
      if (WS.merges.some(inside)) setProp(WS, 'merges', WS.merges.filter(m => !inside(m)));
      if (wholeCols(g) && wholeRows(g)) setProp(WS, 'ds', null);
      else if (wholeCols(g)) { const m = new Map(WS.cs); for (let c = g.c1; c <= g.c2; c++) m.delete(c); setProp(WS, 'cs', m); }
      else if (wholeRows(g)) { const m = new Map(WS.rs); for (let r = g.r1; r <= g.r2; r++) m.delete(r); setProp(WS, 'rs', m); }
    }
  });
}
/* every formula in the workbook through fn(formula, the name of its own sheet) */
function eachFormula(fn) {
  for (const s of WB.sheets) for (const [k, x] of [...s.cells]) {
    if (x.f == null) continue;
    const f = fn(x.f, s.name);
    if (f !== x.f) setCell(s, kr(k), kc(k), { ...x, f });
  }
}
/* a Map or Set of row or column numbers after n are put in at `at` (or taken out, n < 0) */
function shiftKeys(m, at, n, max) {
  const out = m instanceof Set ? new Set() : new Map(), end = at - n - 1;
  for (const e of m instanceof Set ? [...m].map(i => [i]) : m) {
    const i = e[0];
    if (n < 0 && i >= at && i <= end) continue;
    const j = i >= at ? i + n : i;
    if (j < 0 || j >= max) continue;
    if (out instanceof Set) out.add(j); else out.set(j, e[1]);
  }
  return out;
}
function shiftRange(g, axis, at, n) {
  const R = axis === 'r', a = R ? 'r1' : 'c1', b = R ? 'r2' : 'c2', out = { ...g };
  if (n > 0) { if (g[a] >= at) out[a] += n; if (g[b] >= at) out[b] += n; return out; }
  const end = at - n - 1;
  if (g[a] >= at && g[b] <= end) return null;
  out[a] = g[a] > end ? g[a] + n : g[a] >= at ? at : g[a];
  out[b] = g[b] > end ? g[b] + n : g[b] >= at ? at - 1 : g[b];
  return out;
}
/* rows or columns in (n > 0) or out (n < 0) at `at`: the cells after them move, and every formula that points past
   them follows, as in Excel. New rows take the look of the row above them */
function spliceSheet(axis, at, n) {
  const s = WS, R = axis === 'r';
  if (n > 0 && ((R ? usedEnd(s).r : usedEnd(s).c) + n > (R ? MAXR : MAXC))) { toast(T('אין מקום להוסיף כאן עוד שורות או עמודות, כי הגיליון מלא עד הסוף.')); return; }
  edit(() => {
    if (s.ri || s.ci || RM.on) {   // in a shared room: new rows (or columns) get new ids, and the ids of the ones taken out go
      const key = R ? 'ri' : 'ci', used = usedEnd(s);
      grow(s, key, Math.min((R ? used.r : used.c) + 1, R ? RMAX : CMAX));
      const a = s[key].slice();
      if (n > 0) { if (at <= a.length) a.splice(at, 0, ...Array.from({ length: n }, newId)); }
      else a.splice(at, -n);
      setProp(s, key, a);
    }
    const moved = [];
    for (const [k, x] of s.cells) { const r = kr(k), c = kc(k); if ((R ? r : c) >= at) moved.push([r, c, x]); }
    for (const [r, c] of moved) setCell(s, r, c, null);
    for (const [r, c, x] of moved) {
      const i = R ? r : c;
      if (n < 0 && i < at - n) continue;
      const nr = R ? r + n : r, nc = R ? c : c + n;
      if (nr < MAXR && nc < MAXC) setCell(s, nr, nc, x);
    }
    if (n > 0 && at > 0) for (const [k, x] of [...s.cells]) {   // the look of the row (or column) before, for the new ones
      if ((R ? kr(k) : kc(k)) !== at - 1 || !x.st) continue;
      for (let j = 0; j < n; j++) { const r = R ? at + j : kr(k), c = R ? kc(k) : at + j; if (!cellAt(s, r, c)) setCell(s, r, c, { st: x.st }); }
    }
    const sizeKey = R ? 'rh' : 'cw', hidKey = R ? 'hr' : 'hc', lookKey = R ? 'rs' : 'cs';
    for (const key of [sizeKey, hidKey, lookKey]) setProp(s, key, shiftKeys(s[key], at, n, R ? MAXR : MAXC));
    const merges = [];
    for (const m of s.merges) { const g = shiftRange(m, axis, at, n); if (g && (g.r1 !== g.r2 || g.c1 !== g.c2)) merges.push(g); }
    setProp(s, 'merges', merges);
    if (s.af) {
      // the filter's header row taken out ends the filter; otherwise its range moves, and its columns' choices with it
      const g = shiftRange(s.af, axis, at, n), headGone = R && n < 0 && s.af.r1 >= at && s.af.r1 < at - n;
      if (!g || headGone) setProp(s, 'af', null);
      else {
        const hide = {};
        for (const [c, v] of Object.entries(s.af.hide)) {
          const cc = +c;
          if (!R && n < 0 && cc >= at && cc < at - n) continue;
          hide[!R && cc >= at ? cc + n : cc] = v;
        }
        setProp(s, 'af', { ...g, hide });
      }
    }
    eachFormula((f, self) => spliceFormula(f, self, s.name, axis, at, n));
    eachChart((f, self) => spliceFormula(f, self, s.name, axis, at, n));
    // a name follows its cells too; a part of it without $ is a distance from the cell that uses the name, and stays
    eachName(f => mapRefs(f, t => (R ? t.a[0] && t.a[2] : t.a[1] && t.a[3]) ? spliceFormula(t.s, '', s.name, axis, at, n) : null));
    moveCharts(s, axis, at, n);
    if (s.tables.length) spliceTables(s, axis, at, n);
    for (const key of RULE_KEYS) {
      spliceRules(s, key, axis, at, n);
      for (const sh of WB.sheets) if (sh !== s) eachRuleOf(sh, key, f => spliceFormula(f, sh.name, s.name, axis, at, n));
    }
  });
}
function insertRows(where) {
  const g = selG(), n = Math.min(wholeRows(g) || !wholeCols(g) ? g.r2 - g.r1 + 1 : 1, 5000);
  if (wholeCols(g)) { toast(T('כדי להוסיף שורות, בוחרים שורות או תאים')); return; }
  const at = where === 'after' ? g.r2 + 1 : g.r1;
  spliceSheet('r', at, n);
  SEL = { r: at, c: SEL.c, er: at + n - 1, ec: SEL.ec, whole: SEL.whole === 'r' ? 'r' : null };
  if (SEL.whole !== 'r') SEL = { r: at, c: g.c1, er: at + n - 1, ec: g.c2 };
  after();
}
function insertCols(where) {
  const g = selG(), n = Math.min(wholeCols(g) || !wholeRows(g) ? g.c2 - g.c1 + 1 : 1, 500);
  if (wholeRows(g)) { toast(T('כדי להוסיף עמודות, בוחרים עמודות או תאים')); return; }
  const at = where === 'after' ? g.c2 + 1 : g.c1;
  spliceSheet('c', at, n);
  SEL = SEL.whole === 'c' ? { r: SEL.r, c: at, er: MAXR - 1, ec: at + n - 1, whole: 'c' } : { r: g.r1, c: at, er: g.r2, ec: at + n - 1 };
  after();
}
function deleteRows() {
  const g = selG();
  if (wholeCols(g) && !wholeRows(g)) { toast(T('כדי למחוק שורות, בוחרים שורות או תאים')); return; }
  const u = usedEnd(WS), r2 = Math.min(g.r2, Math.max(g.r1, u.r));
  spliceSheet('r', g.r1, -(r2 - g.r1 + 1));
  SEL = { r: g.r1, c: SEL.c, er: g.r1, ec: SEL.c };
  after();
}
function deleteCols() {
  const g = selG();
  if (wholeRows(g) && !wholeCols(g)) { toast(T('כדי למחוק עמודות, בוחרים עמודות או תאים')); return; }
  const u = usedEnd(WS), c2 = Math.min(g.c2, Math.max(g.c1, u.c));
  spliceSheet('c', g.c1, -(c2 - g.c1 + 1));
  SEL = { r: SEL.r, c: g.c1, er: SEL.r, ec: g.c1 };
  after();
}
/* merge and center, or undo merges the range touches */
async function toggleMerge() {
  const g = selG();
  if (wholeCols(g) || wholeRows(g)) { toast(T('אי אפשר למזג שורות או עמודות שלמות')); return; }
  const hits = WS.merges.filter(m => meets(m, g));
  if (hits.length) { edit(() => setProp(WS, 'merges', WS.merges.filter(m => !meets(m, g)))); return; }
  if (g.r1 === g.r2 && g.c1 === g.c2) return;
  if (WS.af && meets(WS.af, g)) { toast(T('אי אפשר למזג תאים בתוך טבלה עם מסנן')); return; }
  let lost = 0;
  for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) if ((r !== g.r1 || c !== g.c1) && hasVal(cellAt(WS, r, c))) lost++;
  if (lost && !(await confirmBox(T('מיזוג תאים'), T('אחרי המיזוג יישאר רק מה שכתוב בתא הראשון, ושאר הערכים יימחקו.'), T('מיזוג')))) return;
  edit(() => {
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
      if (r === g.r1 && c === g.c1) continue;
      const x = cellAt(WS, r, c);
      if (x && hasVal(x)) setCell(WS, r, c, x.st ? { st: x.st } : null);
    }
    const a = cellAt(WS, g.r1, g.c1), st = normStyle({ ...((a && a.st) || {}), ha: 'c', va: (a && a.st && a.st.va) || 'm' });
    setCell(WS, g.r1, g.c1, a ? withLook(a, st) : { st });
    setProp(WS, 'merges', [...WS.merges, { ...g }]);
  });
  SEL = { r: g.r1, c: g.c1, er: g.r1, ec: g.c1 };
  after();
}

/* --- filling: the fill handle, Ctrl+D and Ctrl+R. A series goes on (1, 2, 3... dates, "פריט 1", weekdays and months),
   formulas move with each cell, and everything else is copied in its pattern --- */
const LISTS = (() => {
  const en = (o, list) => list.map(d => new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' }).format(d));
  const enDays = en({ weekday: 'long' }, WEEK_DAYS), enMonths = en({ month: 'long' }, MONTH_DAYS);
  // Hebrew weekdays are written "ראשון" as often as "יום ראשון"
  const bare = D_LONG.map(d => d.replace(/^יום /, ''));
  return [D_LONG, D_SHORT, M_LONG, M_SHORT, ...(bare.some((d, i) => d !== D_LONG[i]) ? [bare] : []), enDays, enDays.map(d => d.slice(0, 3)), enMonths, enMonths.map(m => m.slice(0, 3))];
})();
function listOf(t) { const s = String(t).trim().toLowerCase(); for (const l of LISTS) { const i = l.findIndex(x => x.toLowerCase() === s); if (i >= 0) return { l, i }; } return null; }
/* the series of one line of source cells (in fill order), continued k steps */
function seriesOf(src) {
  const vals = src.map(x => x ? x.v : null), n = src.length;
  const allNum = n && src.every(x => x && x.f == null && typeof x.v === 'number');
  if (allNum && (n > 1 || isDateNf(src[0].st && src[0].st.nf))) {
    let slope = 1, icpt = vals[0];
    if (n > 1) { const mx = (n - 1) / 2, my = vals.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0; vals.forEach((v, i) => { sxy += (i - mx) * (v - my); sxx += (i - mx) * (i - mx); }); slope = sxy / sxx; icpt = my - slope * mx; }
    return i => ({ v: +(icpt + slope * (n + i)).toPrecision(15) });
  }
  const pat = src.map(x => x && x.f == null && typeof x.v === 'string' ? /^(.*?)(\d+)(\D*)$/.exec(x.v) : null);
  if (n && pat.every(Boolean) && pat.every(m => m[1] === pat[0][1] && m[3] === pat[0][3])) {
    const nums = pat.map(m => +m[2]), step = n > 1 ? nums[n - 1] - nums[n - 2] : 1, w = pat[0][2].length, z = pat[0][2][0] === '0';
    return i => { const v = nums[n - 1] + step * (i + 1); return { v: pat[0][1] + (z ? String(Math.max(0, v)).padStart(w, '0') : String(v)) + pat[0][3] }; };
  }
  const lists = src.map(x => x && typeof x.v === 'string' && x.f == null ? listOf(x.v) : null);
  if (n && lists.every(Boolean) && lists.every(q => q.l === lists[0].l)) {
    const l = lists[0].l, step = n > 1 ? (lists[n - 1].i - lists[n - 2].i + l.length) % l.length || 1 : 1;
    return i => ({ v: l[((lists[n - 1].i + step * (i + 1)) % l.length + l.length) % l.length] });
  }
  return null;
}
function fillRange(g, to) {
  const down = to.r2 > g.r2, up = to.r1 < g.r1, fwd = to.c2 > g.c2, vert = down || up;
  const rev = up || (!vert && !fwd);
  edit(() => {
    const lines = vert ? span(g.c1, g.c2) : span(g.r1, g.r2);
    for (const L of lines) {
      const srcPos = vert ? span(g.r1, g.r2).map(r => [r, L]) : span(g.c1, g.c2).map(c => [L, c]);
      if (rev) srcPos.reverse();
      const src = srcPos.map(([r, c]) => cellAt(WS, r, c) || null), series = seriesOf(src);
      const targets = vert ? (down ? span(g.r2 + 1, to.r2) : span(to.r1, g.r1 - 1).reverse()).map(r => [r, L]) : (fwd ? span(g.c2 + 1, to.c2) : span(to.c1, g.c1 - 1).reverse()).map(c => [L, c]);
      targets.forEach(([r, c], i) => {
        const k = i % src.length, from = src[k], [fr, fc] = srcPos[k];
        const st = from ? from.st : emptyLook(WS, fr, fc);
        let cell = null;
        if (series && !(from && from.f != null)) cell = { ...series(i), ...(st ? { st } : {}) };
        else if (from) { cell = { ...from }; if (from.f != null) cell.f = shiftFormula(from.f, r - fr, c - fc); delete cell.x; }
        else if (st) cell = { st };
        setCell(WS, r, c, cell);
      });
    }
    for (const key of RULE_KEYS) fillRules(WS, key, g, to);
  });
  const all = { r1: Math.min(g.r1, to.r1), c1: Math.min(g.c1, to.c1), r2: Math.max(g.r2, to.r2), c2: Math.max(g.c2, to.c2) };
  SEL = { r: all.r1, c: all.c1, er: all.r2, ec: all.c2 };
  after();
}
/* Ctrl+D copies the first row of the range down through it (one cell: the cell above), Ctrl+R the first column across */
function fillDir(d) {
  const g = usedPart(selG()), vert = d === 'd';
  const src = vert ? (g.r1 === g.r2 ? g.r1 - 1 : g.r1) : (g.c1 === g.c2 ? g.c1 - 1 : g.c1);
  if (src < 0) return;
  edit(() => {
    if (vert) for (let r = Math.max(g.r1, src + 1); r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const x = cellAt(WS, src, c); setCell(WS, r, c, x ? (x.f != null ? { ...x, f: shiftFormula(x.f, r - src, 0) } : { ...x }) : null); }
    else for (let c = Math.max(g.c1, src + 1); c <= g.c2; c++) for (let r = g.r1; r <= g.r2; r++) { const x = cellAt(WS, r, src); setCell(WS, r, c, x ? (x.f != null ? { ...x, f: shiftFormula(x.f, 0, c - src) } : { ...x }) : null); }
    const from = vert ? { ...g, r1: src, r2: src } : { ...g, c1: src, c2: src };
    for (const key of RULE_KEYS) fillRules(WS, key, from, vert ? { ...g, r1: src } : { ...g, c1: src });
  });
}
/* a double click on the fill handle fills down as far as the column beside it goes */
function fillDownAuto() {
  const g = selG();
  let last = -1;
  for (const c of [g.c1 - 1, g.c2 + 1]) {
    if (c < 0 || c >= MAXC) continue;
    let r = g.r2;
    while (r + 1 < MAXR && hasVal(cellAt(WS, r + 1, c))) r++;
    if (r > g.r2) { last = r; break; }
  }
  if (last > g.r2) fillRange(g, { ...g, r2: last });
}

/* --- sorting: by the active cell's column, or by several columns in the dialog. The table is found around the active
   cell when one cell is chosen, and a header row stays on top --- */
const SORT_COLL = new Intl.Collator(LOCALE, { sensitivity: 'base' });
function sortRank(v) { return v == null || v === '' ? 4 : typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3; }
function sortCmp(a, b, desc) {
  const ra = sortRank(a), rb = sortRank(b);
  if (ra === 4 || rb === 4) return ra === rb ? 0 : ra === 4 ? 1 : -1;   // empty cells always go last
  let c;
  if (ra !== rb) c = ra - rb;
  else if (ra === 0) c = a - b;
  else if (ra === 1) c = textCmp(a, b, SORT_COLL);
  else if (ra === 2) c = (a ? 1 : 0) - (b ? 1 : 0);
  else c = String(a.c).localeCompare(String(b.c));
  return desc ? -c : c;
}
function sortArea() {
  const g = selG(), one = (g.r1 === g.r2 && g.c1 === g.c2) || sameG(g, mergeAt(WS, SEL.r, SEL.c)) || wholeCols(g) || wholeRows(g);
  if (WS.af && inG(WS.af, SEL.r, SEL.c) && one) return { g: { ...WS.af, r2: filterEnd(WS.af) }, head: true };
  if (!one) return { g, head: guessHead(g) };
  const r = region(WS, SEL.r, SEL.c);
  return { g: r, head: guessHead(r) };
}
/* a first row of text over rows with numbers or dates (or a bold first row) is a header */
function guessHead(g) {
  if (g.r2 <= g.r1) return false;
  let text = 0, full = 0, under = 0, bold = 0;
  for (let c = g.c1; c <= g.c2; c++) {
    const x = cellAt(WS, g.r1, c);
    if (!hasVal(x)) continue;
    full++;
    if (typeof x.v === 'string' && x.f == null) text++;
    if (x.st && x.st.b) bold++;
    const y = cellAt(WS, g.r1 + 1, c);
    if (y && typeof y.v !== 'string' && hasVal(y)) under++;
  }
  return full > 0 && text === full && (under > 0 || bold === full);
}
function doSort(g, head, keys) {
  if (WS.merges.some(m => meets(m, g))) { toast(T('אי אפשר למיין אזור שיש בו תאים ממוזגים')); return; }
  const r1 = g.r1 + (head ? 1 : 0);
  if (r1 >= g.r2 + 1) return;
  const rows = span(r1, g.r2).map(r => ({ r, cells: span(g.c1, g.c2).map(c => cellAt(WS, r, c) || null) }));
  const key = (row, c) => { const x = row.cells[c - g.c1]; return x ? x.v : null; };
  rows.sort((a, b) => { for (const k of keys) { const d = sortCmp(key(a, k.c), key(b, k.c), k.desc); if (d) return d; } return a.r - b.r; });
  edit(() => rows.forEach((row, i) => {
    const r = r1 + i;
    row.cells.forEach((x, j) => setCell(WS, r, g.c1 + j, x ? (x.f != null && r !== row.r ? { ...x, f: shiftFormula(x.f, r - row.r, 0) } : x) : null));
  }));
}
function quickSort(desc) {
  const { g, head } = sortArea();
  if (!inG(g, SEL.r, SEL.c) && !(SEL.c >= g.c1 && SEL.c <= g.c2)) return;
  doSort(g, head, [{ c: clamp(SEL.c, g.c1, g.c2), desc }]);
}
function sortDialog() {
  const { g, head } = sortArea();
  const headBox = h('input', { type: 'checkbox' }); headBox.checked = head;
  const colName2 = c => { const x = headBox.checked ? cellAt(WS, g.r1, c) : null, t = x ? view(x).t : ''; return t ? `${t} (${colName(c)})` : T('עמודה {0}', colName(c)); };
  const levels = h('div', { class: 'sh-levels' });
  const addLevel = (c = clamp(SEL.c, g.c1, g.c2), desc = false) => {
    const cs = h('select', { class: 'field' }, span(g.c1, g.c2).map(i => h('option', { value: i, text: colName2(i), selected: i === c })));
    const os = h('select', { class: 'field' }, h('option', { value: '0', text: T('מהקטן לגדול (א עד ת)'), selected: !desc }), h('option', { value: '1', text: T('מהגדול לקטן (ת עד א)'), selected: desc }));
    const row = h('div', { class: 'sh-level' }, h('span', { class: 'muted', text: levels.children.length ? T('ואחר כך לפי') : T('מיון לפי') }), cs, os,
      h('button', { class: 'icon-btn', title: T('הסרה'), 'aria-label': T('הסרה'), onclick: () => { if (levels.children.length > 1) row.remove(); } }, icon('close')));
    levels.append(row);
  };
  addLevel();
  headBox.addEventListener('change', () => { for (const s of levels.querySelectorAll('select:first-of-type')) for (const o of s.options) o.textContent = colName2(+o.value); });
  modal({ title: T('מיון'), body: h('div', {},
    h('p', { class: 'muted small', text: T('מיון של {0}', rangeA1(g)) }),
    h('label', { class: 'check' }, headBox, T('בשורה הראשונה יש כותרות')),
    levels,
    h('button', { class: 'btn small', onclick: () => { if (levels.children.length < 4) addLevel(); } }, icon('add'), T('עוד רמה'))),
    actions: [{ label: T('מיון'), kind: 'primary', run: () => {
      const keys = [...levels.children].map(r => { const [a, b] = r.querySelectorAll('select'); return { c: +a.value, desc: b.value === '1' }; });
      doSort(g, headBox.checked, keys);
    } }, { label: T('ביטול'), value: false }] });
}

/* --- the filter: buttons on a table's header row. Its rows reach down to the last filled row under it --- */
function filterEnd(f, s = WS) {
  let r = f.r1;
  const u = usedEnd(s).r;
  for (let rr = f.r1 + 1; rr < u; rr++) { let any = false; for (let c = f.c1; c <= f.c2; c++) if (hasVal(cellAt(s, rr, c))) { any = true; break; } if (any) r = rr; else if (rr > f.r2) break; }
  return Math.max(r, f.r2 > u ? f.r1 : f.r2);
}
function toggleFilter() {
  if (WS.af) { edit(() => setProp(WS, 'af', null)); return; }
  let g = selG();
  if ((g.r1 === g.r2 && g.c1 === g.c2) || wholeCols(g) || wholeRows(g)) g = region(WS, SEL.r, SEL.c);
  if (!hasVal(cellAt(WS, g.r1, g.c1)) && g.r1 === g.r2 && g.c1 === g.c2) { toast(T('כדי לסנן, בוחרים תא בתוך טבלה')); return; }
  if (WS.merges.some(m => meets(m, g))) { toast(T('אי אפשר לסנן אזור שיש בו תאים ממוזגים')); return; }
  edit(() => setProp(WS, 'af', { ...g, r2: Math.max(g.r2, g.r1 + 1), hide: {} }));
}
function clearFilter() { if (WS.af) edit(() => setProp(WS, 'af', { ...WS.af, hide: {} })); }
function openFilterMenu(c) {
  const f = WS.af;
  if (!f) return;
  const end = filterEnd(f), vals = new Map();
  let blanks = false;
  for (let r = f.r1 + 1; r <= end; r++) {
    const x = cellAt(WS, r, c), t = x ? view(x).t : '';
    if (t === '') { blanks = true; continue; }
    if (!vals.has(t)) vals.set(t, x.v);
  }
  const hidden = new Set(f.hide[c] || []);
  const list = [...vals].sort((a, b) => sortCmp(a[1], b[1], false)).map(([t]) => t);
  if (blanks) list.push('');
  const boxes = new Map(), q = h('input', { class: 'field', type: 'search', placeholder: T('חיפוש'), 'aria-label': T('חיפוש') });
  const all = h('input', { type: 'checkbox' });
  const box = h('div', { class: 'sh-fl' });
  const draw = () => {
    box.textContent = '';
    const needle = q.value.trim().toLowerCase();
    for (const t of list.slice(0, 2000)) {
      if (needle && !(t || T('(ריקים)')).toLowerCase().includes(needle)) continue;
      let b = boxes.get(t);
      if (!b) { b = h('input', { type: 'checkbox' }); b.checked = !hidden.has(t); boxes.set(t, b); b.addEventListener('change', sync); }
      box.append(h('label', { class: 'check' }, b, h('span', { dir: 'auto', text: t || T('(ריקים)') })));
    }
    if (list.length > 2000) box.append(h('p', { class: 'muted small', text: T('מוצגים 2,000 הערכים הראשונים') }));
  };
  const sync = () => { const n = [...boxes.values()].filter(b => b.checked).length; all.checked = n === list.length; all.indeterminate = n > 0 && n < list.length; };
  all.addEventListener('change', () => { for (const t of list) { let b = boxes.get(t); if (!b) { b = h('input', { type: 'checkbox' }); boxes.set(t, b); b.addEventListener('change', sync); } b.checked = all.checked; } draw(); });
  q.addEventListener('input', draw);
  for (const t of list) { const b = h('input', { type: 'checkbox' }); b.checked = !hidden.has(t); boxes.set(t, b); b.addEventListener('change', sync); }
  draw(); sync();
  const apply = () => {
    const hide = list.filter(t => !boxes.get(t).checked);
    closePopover();
    edit(() => setProp(WS, 'af', { ...f, r2: end, hide: { ...f.hide, [c]: hide } }));
    focusGrid();
  };
  const sortBy = desc => { closePopover(); doSort({ ...f, r2: end }, true, [{ c, desc }]); focusGrid(); };
  const anchor = [V.body, V.top, V.side, V.corner].map(L => L._m && L._m.get('f' + c)).find(Boolean);
  if (!anchor) return;
  openPop(anchor, h('div', { class: 'sh-fmenu' },
    h('button', { class: 'mi', onclick: () => sortBy(false) }, icon('arrow_upward'), T('מיון מהקטן לגדול')),
    h('button', { class: 'mi', onclick: () => sortBy(true) }, icon('arrow_downward'), T('מיון מהגדול לקטן')),
    hidden.size ? h('button', { class: 'mi', onclick: () => { closePopover(); const hide = { ...f.hide }; delete hide[c]; edit(() => setProp(WS, 'af', { ...f, hide })); } }, icon('filter_alt_off'), T('ניקוי הסינון בעמודה הזאת')) : null,
    h('div', { class: 'sh-fsep' }), q,
    h('label', { class: 'check sh-fall' }, all, T('(בחירת הכל)')), box,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary small', onclick: apply }, T('אישור')), h('button', { class: 'btn small', onclick: () => { closePopover(); focusGrid(); } }, T('ביטול')))));
}

/* --- AutoSum (Σ): the numbers right above the cell, or right before it; a range of numbers gets one under each column --- */
const isNumCell = (r, c) => { const x = cellAt(WS, r, c); return !!x && typeof x.v === 'number'; };
function autoSum(fn) {
  if (ED.on) endEdit(true);
  const g = selG();
  if (!(g.r1 === g.r2 && g.c1 === g.c2) && !sameG(g, mergeAt(WS, SEL.r, SEL.c)) && !wholeCols(g) && !wholeRows(g)) {
    edit(() => {
      if (g.r1 === g.r2) { const c = g.c2 + 1; if (c < MAXC && !hasVal(cellAt(WS, g.r1, c))) setCell(WS, g.r1, c, { f: `${fn}(${rangeA1(g)})`, v: 0, ...(lookAt(WS, g.r1, g.c2) ? { st: lookAt(WS, g.r1, g.c2) } : {}) }); }
      else for (let c = g.c1; c <= g.c2; c++) { const r = g.r2 + 1; if (r < MAXR && !hasVal(cellAt(WS, r, c))) { const st = lookAt(WS, g.r2, c); setCell(WS, r, c, { f: `${fn}(${rangeA1({ r1: g.r1, c1: c, r2: g.r2, c2: c })})`, v: 0, ...(st ? { st } : {}) }); } }
    });
    return;
  }
  const r = SEL.r, c = SEL.c;
  let rg = null, r0 = r - 1, c0 = c - 1;
  while (r0 >= 0 && isNumCell(r0, c)) r0--;
  if (r0 < r - 1) rg = { r1: r0 + 1, c1: c, r2: r - 1, c2: c };
  else { while (c0 >= 0 && isNumCell(r, c0)) c0--; if (c0 < c - 1) rg = { r1: r, c1: c0 + 1, r2: r, c2: c - 1 }; }
  SEL = { r, c, er: r, ec: c };
  const inner = rg ? rangeA1(rg) : '';
  startEdit('enter', '=' + fn + '(' + inner + ')');
  const ta = taOf(), s = fn.length + 2;
  ta.setSelectionRange(s + inner.length, s + inner.length);
  if (rg) ED.point = { s, e: s + inner.length, g: rg, ar: rg.r1, ac: rg.c1, br: rg.r2, bc: rg.c2 };
  edChanged();
}
function insertFn(fn) {
  if (!ED.on) { startEdit('enter', '=' + fn + '('); const ta = taOf(), n = ta.value.length; ta.setSelectionRange(n, n); edChanged(); return; }
  const ta = taOf();
  ta.setRangeText((ta.value ? '' : '=') + fn + '(', ta.selectionStart, ta.selectionEnd, 'end');
  if (ta.value[0] !== '=') { ta.value = '=' + ta.value; }
  ED.point = null;
  edChanged();
  ta.focus();
}
function toggleFormulas() { SHOWF = !SHOWF; TW.clear(); refresh(); }

/* --- find and replace, in what the cells show (replace: in text only, not in formulas) --- */
function openFind(replace) {
  if (ED.on && !endEdit(true)) return;
  const q = h('input', { class: 'field', type: 'text', autocomplete: 'off', spellcheck: 'false' }), rep = h('input', { class: 'field', type: 'text', autocomplete: 'off', spellcheck: 'false' });
  const count = h('span', { class: 'muted small' });
  const matches = () => {
    const n = q.value.trim().toLowerCase(), out = [];
    if (!n) return out;
    for (const [k, x] of WS.cells) if (hasVal(x) && view(x).t.toLowerCase().includes(n)) out.push(k);
    return out.sort((a, b) => a - b);
  };
  const go = d => {
    const list = matches();
    count.textContent = list.length ? TN('{n} תאים', list.length) : T('לא נמצא');
    if (!list.length) return;
    const cur = KEY(SEL.r, SEL.c);
    let k = d > 0 ? list.find(x => x > cur) : [...list].reverse().find(x => x < cur);
    if (k == null) k = d > 0 ? list[0] : list[list.length - 1];
    SEL = { r: kr(k), c: kc(k), er: kr(k), ec: kc(k) };
    scrollToSel(); after();
  };
  const replaceIn = (x, n, to) => typeof x.v === 'string' && x.f == null ? { ...x, v: x.v.replace(new RegExp(reEsc(n), 'gi'), () => to) } : null;
  const one = () => { const x = cellAt(WS, SEL.r, SEL.c), n = q.value.trim(); if (!x || !n) return go(1); const y = replaceIn(x, n, rep.value); if (y && y.v !== x.v) edit(() => setCell(WS, SEL.r, SEL.c, y)); go(1); };
  const all = () => {
    const n = q.value.trim(); if (!n) return;
    let k = 0;
    edit(() => { for (const [key, x] of [...WS.cells]) { const y = replaceIn(x, n, rep.value); if (y && y.v !== x.v) { setCell(WS, kr(key), kc(key), y); k++; } } });
    toast(TN('הוחלפו {n} מקומות', k), { icon: 'find_replace' });
  };
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } });
  modal({ title: replace ? T('חיפוש והחלפה') : T('חיפוש'), body: h('div', { class: 'sh-find' },
    h('label', { class: 'fld' }, h('span', { text: T('חיפוש') }), q),
    replace ? h('label', { class: 'fld' }, h('span', { text: T('להחליף ב־') }), rep) : null,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => go(-1) }, icon('expand_less'), T('הקודם')), h('button', { class: 'btn primary', onclick: () => go(1) }, icon('expand_more'), T('הבא')),
      replace ? h('button', { class: 'btn', onclick: one }, T('החלפה')) : null, replace ? h('button', { class: 'btn', onclick: all }, T('החלפת הכל')) : null, count)),
    onClose: () => focusGrid() });
}

/* --- the sheets of the workbook --- */
function showSheet(s, quiet) {
  if (!s || s === WS) return;
  if (ED.on && !endEdit(true)) return;
  if (WS) { WS.ac = { r: SEL.r, c: SEL.c }; if (V.scroll) WS._sc = [V.scroll.scrollLeft, V.scroll.scrollTop]; }
  WS = s; GEO = null;
  if (CLIP) CLIP.ants = CLIP.ants && CLIP.sid === s.id;
  SEL = { r: s.ac.r, c: s.ac.c, er: s.ac.r, ec: s.ac.c };
  if (!V.view) return;
  render();
  const [sl, st] = s._sc || [0, 0];
  V.scroll.scrollLeft = sl; V.scroll.scrollTop = st;
  if (quiet) return;
  WB.active = WB.sheets.indexOf(s);
  markDirty();
  refresh();
  focusGrid();
}
const takenNames = except => new Set(WB.sheets.filter(s => s !== except).map(s => s.name.toLowerCase()));
function addSheet(after = WS) {
  const s = newSheet(freeName(sheetWord(WB.sheets.length + 1), takenNames()), WB.dir);
  edit(() => { bookStep(() => { WB.sheets.splice(WB.sheets.indexOf(after) + 1, 0, s); }); showSheet(s, true); });
  WB.active = WB.sheets.indexOf(s);
  refresh(); focusGrid();
}
async function renameSheet(s = WS) {
  const name = await promptBox(T('שינוי שם הגיליון'), T('השם החדש (עד 31 תווים, בלי : \\ / ? * [ ])'), s.name);
  if (name == null) return;
  const n = cleanName(name);
  if (!n) { toast(T('לגיליון צריך להיות שם')); return; }
  if (takenNames(s).has(n.toLowerCase())) { toast(T('כבר יש גיליון בשם הזה')); return; }
  if (n === s.name) return;
  const old = s.name;
  edit(() => { setProp(s, 'name', n); eachFormula(f => renameInFormula(f, old, n)); eachChart(f => renameInFormula(f, old, n)); eachName(f => renameInFormula(f, old, n)); for (const sh of WB.sheets) for (const key of RULE_KEYS) eachRuleOf(sh, key, f => renameInFormula(f, old, n)); });
}
async function deleteSheet(s = WS) {
  if (WB.sheets.length < 2) { toast(T('בחוברת צריך להישאר לפחות גיליון אחד')); return; }
  if (s.cells.size && !(await confirmBox(T('מחיקת גיליון'), T('הגיליון "{0}" יימחק עם כל מה שבו. אפשר לבטל עם Ctrl+Z.', s.name), T('מחיקה'), true))) return;
  const i = WB.sheets.indexOf(s), next = WB.sheets[i + 1] || WB.sheets[i - 1];
  edit(() => {
    bookStep(() => { WB.sheets.splice(i, 1); });
    eachFormula(f => dropSheetInFormula(f, s.name));
    eachChart(f => dropSheetInFormula(f, s.name));
    for (const sh of WB.sheets) for (const key of RULE_KEYS) eachRuleOf(sh, key, f => dropSheetInFormula(f, s.name));
    // the sheet's own names go with it, as in Excel; a name that pointed at it says #REF!
    setNames((WB.names || NO_NAMES).filter(x => x.s !== s.id).map(x => { const f = dropSheetInFormula(x.f, s.name); return f === x.f ? x : { ...x, f }; }));
    if (s === WS) showSheet(next, true);
  });
  WB.active = WB.sheets.indexOf(WS);
  refresh(); focusGrid();
}
function dupSheet(s = WS) {
  // each formula's cell is its own in the copy: its answer is written onto it, and the copy's answer may differ
  const c = { ...s, id: sid(), name: freeName(s.name.slice(0, 26) + ' (2)', takenNames()), cells: new Map([...s.cells].map(([k, x]) => [k, x.f != null ? { ...x } : x])), cw: new Map(s.cw), rh: new Map(s.rh), hc: new Set(s.hc), hr: new Set(s.hr), cs: new Map(s.cs), rs: new Map(s.rs), merges: s.merges.map(m => ({ ...m })), af: s.af ? { ...s.af, hide: { ...s.af.hide } } : null, ac: { ...s.ac }, _sc: null, _fh: null, ri: undefined, ci: undefined, _ri: null, _ci: null, charts: s.charts.map(ch => ({ ...bare(ch), id: sid() })), pics: s.pics.map(x => ({ ...x, id: sid() })), tables: [], pivots: s.pivots.map(x => ({ ...x, id: sid() })) };
  edit(() => {
    bookStep(() => { WB.sheets.splice(WB.sheets.indexOf(s) + 1, 0, c); });
    // as Excel does: the copy gets its own names, for the sheet's own and for every name that points at the sheet
    const own = (WB.names || NO_NAMES).filter(x => x.s === s.id || (!x.s && renameInFormula(x.f, s.name, c.name) !== x.f)).map(x => ({ ...x, s: c.id, f: renameInFormula(x.f, s.name, c.name) }));
    if (own.length) setNames([...(WB.names || NO_NAMES), ...own]);
    // its tables come too, each under a name of its own, as Excel names them
    if (s.tables.length) { const taken = tableNames(); setProp(c, 'tables', s.tables.map(t => { const n = freeTableName(t.name, taken); taken.add(n.toLowerCase()); return { ...t, id: sid(), name: n, cols: t.cols.map(y => ({ ...y })) }; })); }
    showSheet(c, true);
  });
  WB.active = WB.sheets.indexOf(c);
  refresh(); focusGrid();
}
function moveSheet(s, to) {
  const i = WB.sheets.indexOf(s);
  to = clamp(to, 0, WB.sheets.length - 1);
  if (i === to) return;
  edit(() => bookStep(() => { WB.sheets.splice(i, 1); WB.sheets.splice(to, 0, s); }));
}
function setTabColor(s, c) { edit(() => setProp(s, 'tab', c || null)); }
/* the view: freezing panes, gridlines, the sheet's direction, zoom */
function freeze(mode) {
  const fr = mode === 'row' ? 1 : mode === 'col' ? 0 : mode === 'sel' ? SEL.r : 0, fc = mode === 'col' ? 1 : mode === 'row' ? 0 : mode === 'sel' ? SEL.c : 0;
  if (mode === 'sel' && !fr && !fc) { toast(T('כדי להקפיא עד תא, בוחרים תא שיש שורות מעליו או עמודות לפניו')); return; }
  edit(() => { setProp(WS, 'fr', Math.min(fr, 200)); setProp(WS, 'fc', Math.min(fc, 60)); });
  V.scroll.scrollTop = 0; V.scroll.scrollLeft = 0;
  refresh();
}
function setZoom(z) {
  WS.zoom = clamp(Math.round(z / 10) * 10, 30, 400);
  TW.clear(); geoDirty();
  markDirty();
  refresh();
}

/* =========================================================
   copy, cut and paste. A copy carries the cells three ways: this app's own (formulas and all, moved to where they are
   pasted), HTML (a table with its look, for Excel, Google Sheets, Word and documents here) and plain text (tabs).
   A paste takes this app's own first, then a table (from Excel or Google Sheets), then text
   ========================================================= */
let CLIP = null;   // the last copy made here: { sid, g, cut, ants, pack }
const CELLS_MIME = 'application/x-floating-ink-cells';
const sheetHasKeys = e => { const t = e && e.target; return !!V.view && !!LOADED && LOADED === S.cur && !ED.on && !MODALS.length && (t === V.ed || t === V.scroll || t === document.body); };
function packRange(s, g) {
  const cells = [], lines = [];
  for (let r = g.r1; r <= g.r2; r++) {
    const line = [];
    for (let c = g.c1; c <= g.c2; c++) {
      const x = cellSp(s, r, c);
      if (x) cells.push([r - g.r1, c - g.c1, cellOut(x)]);
      const t = x ? view(x).t : '';
      line.push(/[\t\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t);
    }
    lines.push(line.join('\t'));
  }
  const merges = s.merges.filter(m => m.r1 >= g.r1 && m.r2 <= g.r2 && m.c1 >= g.c1 && m.c2 <= g.c2).map(m => [m.r1 - g.r1, m.c1 - g.c1, m.r2 - g.r1, m.c2 - g.c1]);
  return { text: lines.join('\r\n') + '\r\n', html: '<meta charset="utf-8">' + tableEl(s, g, { clip: true }).outerHTML,
    json: { app: 'floating-ink', v: 1, stamp: uid(), sheet: s.name, r: g.r1, c: g.c1, h: g.r2 - g.r1 + 1, w: g.c2 - g.c1 + 1, cells, merges, cf: packRules(s, 'cf', g), dv: packRules(s, 'dv', g) } };
}
function copyNow(cut) {
  const g = usedPart(selG());
  const pack = packRange(WS, g);
  CLIP = { sid: WS.id, g, cut, ants: true, pack: pack.json, text: pack.text };
  render();
  return pack;
}
function onCopy(e, cut) {
  if (!sheetHasKeys(e) || !e.clipboardData) return;
  e.preventDefault();
  const p = copyNow(cut);
  e.clipboardData.setData('text/plain', p.text);
  e.clipboardData.setData('text/html', p.html);
  e.clipboardData.setData(CELLS_MIME, JSON.stringify(p.json));
}
/* the ribbon's copy and cut: the same, through the async clipboard */
async function copyButton(cut) {
  const p = copyNow(cut);
  try { await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([p.text], { type: 'text/plain' }), 'text/html': new Blob([p.html], { type: 'text/html' }) })]); }
  catch { try { await navigator.clipboard.writeText(p.text); } catch {} }
  focusGrid();
}
let PASTE_AS = null;   // Ctrl+Shift+V: the next paste brings values only
function onPaste(e) {
  if (!sheetHasKeys(e) || !e.clipboardData) return;
  e.preventDefault();
  const what = PASTE_AS || 'all';
  PASTE_AS = null;
  const dt = e.clipboardData, own = dt.getData(CELLS_MIME);
  if (own) { try { const j = JSON.parse(own); if (j && j.app === 'floating-ink') { pastePack(j, what); return; } } catch {} }
  // a picture alone on the clipboard (a screenshot, an image copied from a program) becomes a picture on the sheet
  const file = [...(dt.files || [])].find(f => /^image\//.test(f.type));
  if (file && what === 'all' && !dt.getData('text/plain')) { insertPicture(file); return; }
  pasteData(dt.getData('text/html'), dt.getData('text/plain'), what);
}
/* the ribbon's paste (and paste values / formats only): what the clipboard has, or this app's last copy */
async function pasteButton(what) {
  let html = '', text = '';
  try {
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
      if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
    }
  } catch {
    try { text = await navigator.clipboard.readText(); } catch {}
  }
  if (CLIP && CLIP.pack && (!text || text.replace(/\r/g, '') === CLIP.text.replace(/\r/g, ''))) { pastePack(CLIP.pack, what); return; }
  if (!html && !text) { toast(T('כדי להדביק, לוחצים Ctrl+V'), { icon: 'content_paste' }); return; }
  pasteData(html, text, what);
}
function pasteData(html, text, what) {
  const grid = html && /<table/i.test(html) ? htmlGrid(html) : null;
  if (grid && grid.cells.length) { pasteGrid(grid, what); return; }
  if (text) pasteGrid(textGrid(text), what);
}
/* where a paste goes: from the active range's corner; one cell copied fills the whole range, and a range that is a
   whole number of copies of what was copied gets it repeated, as in Excel */
function pasteTiles(h0, w0) {
  const g = selG(), multi = !(g.r1 === g.r2 && g.c1 === g.c2) && !wholeCols(g) && !wholeRows(g);
  const rh = multi && (g.r2 - g.r1 + 1) % h0 === 0 ? (g.r2 - g.r1 + 1) / h0 : 1, cw = multi && (g.c2 - g.c1 + 1) % w0 === 0 ? (g.c2 - g.c1 + 1) / w0 : 1;
  const tiles = [];
  for (let i = 0; i < Math.min(rh, 2000); i++) for (let j = 0; j < Math.min(cw, 200); j++) tiles.push([g.r1 + i * h0, g.c1 + j * w0]);
  return { tiles, r0: g.r1, c0: g.c1, h: h0 * rh, w: w0 * cw };
}
function pastePack(p, what) {
  // a cut from here, pasted once: the cells move, and every formula pointing at them follows
  if (CLIP && CLIP.cut && CLIP.pack && CLIP.pack.stamp === p.stamp && what === 'all') { moveCut(); return; }
  const cells = (Array.isArray(p.cells) ? p.cells : []).map(([r, c, j]) => ({ r, c, x: normCell(j) })).filter(q => q.x);
  pasteCells({ h: p.h, w: p.w, merges: p.merges || [], cf: Array.isArray(p.cf) ? p.cf : [], dv: Array.isArray(p.dv) ? p.dv : [], r: p.r | 0, c: p.c | 0 }, cells, what, (q, r, c) => q.x.f != null ? { f: shiftFormula(q.x.f, r - (p.r + q.r), c - (p.c + q.c)) } : null);
}
function pasteGrid(grid, what) {
  const cells = grid.cells.map(q => {
    let x = null;
    if (q.v !== undefined) x = { v: q.v };
    else if (q.t != null && !q.fr) { const pp = parseInput(q.t, q.st && q.st.nf); x = pp ? (pp.f != null ? { f: pp.f } : { v: pp.v }) : {}; if (pp && pp.nf) q.st = { ...(q.st || {}), nf: q.st && q.st.nf ? q.st.nf : pp.nf }; }
    else x = {};
    if (q.st) x.st = normStyle(q.st);
    if (!x.st) delete x.st;
    return { r: q.r, c: q.c, x, fr: q.fr };
  });
  pasteCells(grid, cells, what, (q, r, c) => q.fr ? { f: r1c1ToA1(q.fr, r, c) } : q.x.f != null ? { f: q.x.f } : null);
}
function pasteCells(src, cells, what, formulaAt) {
  const { tiles, r0, c0, h: hh, w } = pasteTiles(src.h, src.w);
  const target = { r1: r0, c1: c0, r2: Math.min(MAXR - 1, r0 + hh - 1), c2: Math.min(MAXC - 1, c0 + w - 1) };
  if (WS.merges.some(m => meets(m, target) && !(m.r1 >= target.r1 && m.r2 <= target.r2 && m.c1 >= target.c1 && m.c2 <= target.c2))) { toast(T('אי אפשר להדביק על חלק מתאים ממוזגים')); return; }
  edit(() => {
    if (what !== 'v') setProp(WS, 'merges', WS.merges.filter(m => !meets(m, target)));
    for (const [tr, tc] of tiles) {
      if (what !== 'f') for (let r = tr; r < tr + src.h && r < MAXR; r++) for (let c = tc; c < tc + src.w && c < MAXC; c++) { const x = cellAt(WS, r, c); if (x && what === 'all') setCell(WS, r, c, null); else if (x && what === 'v') setCell(WS, r, c, x.st ? { st: x.st } : null); }
      for (const q of cells) {
        const r = tr + q.r, c = tc + q.c;
        if (r >= MAXR || c >= MAXC) continue;
        const cur = cellAt(WS, r, c), f = formulaAt(q, r, c);
        let n;
        if (what === 'f') n = withLook(cur || {}, q.x.st || null);
        else {
          n = {};
          if (f && f.f != null && what === 'all') { n.f = tidyFormula(f.f); n.v = 0; }
          else if (q.x.v !== undefined) n.v = q.x.v;
          const st = what === 'v' ? (cur ? cur.st : emptyLook(WS, r, c)) : q.x.st;
          if (what === 'v' && q.x.st && q.x.st.nf && !(st && st.nf)) n.st = { ...(st || {}), nf: q.x.st.nf };
          else if (st) n.st = st;
          if (!hasVal(n) && !n.st) n = null;
        }
        setCell(WS, r, c, n);
      }
      if (what !== 'v') for (const [a, b, cc, d] of src.merges || []) { const m = { r1: tr + a, c1: tc + b, r2: tr + cc, c2: tc + d }; if (m.r2 < MAXR && m.c2 < MAXC) WS.merges = [...WS.merges, m]; }
    }
    // cells copied here bring their conditional formatting, in place of what the target had
    if (what !== 'v' && src.cf) {
      cutRules(WS, 'cf', target);
      const add = tiles.flatMap(([tr, tc]) => unpackRules('cf', src.cf, tr, tc, src.r, src.c));
      if (add.length) setProp(WS, 'cf', [...WS.cf, ...add].slice(0, 500));
    }
    // and their data validation, when everything is pasted (not values alone, nor formats alone), as in Excel
    if (what === 'all' && src.dv) {
      cutRules(WS, 'dv', target);
      const add = tiles.flatMap(([tr, tc]) => unpackRules('dv', src.dv, tr, tc, src.r, src.c));
      if (add.length) setProp(WS, 'dv', [...WS.dv, ...add].slice(0, DV_MAX));
    }
  });
  if (CLIP && !CLIP.cut) CLIP.ants = CLIP.ants && CLIP.sid === WS.id;
  SEL = { r: r0, c: c0, er: target.r2, ec: target.c2 };
  after();
}
/* a cut pasted: the cells go to their new place, and formulas anywhere that pointed at them point there now */
function moveCut() {
  const from = WB.sheets.find(s => s.id === CLIP.sid), g = CLIP.g, to = WS, r0 = SEL.r, c0 = SEL.c;
  if (!from) { CLIP = null; return; }
  const dr = r0 - g.r1, dc = c0 - g.c1;
  if (to === from && !dr && !dc) { CLIP = null; render(); return; }
  if (r0 + (g.r2 - g.r1) >= MAXR || c0 + (g.c2 - g.c1) >= MAXC) return;
  const items = [];
  for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const x = cellAt(from, r, c); if (x) items.push([r, c, x]); }
  const target = { r1: r0, c1: c0, r2: r0 + g.r2 - g.r1, c2: c0 + g.c2 - g.c1 };
  edit(() => {
    for (const [r, c] of items) setCell(from, r, c, null);
    for (let r = target.r1; r <= target.r2; r++) for (let c = target.c1; c <= target.c2; c++) if (cellAt(to, r, c)) setCell(to, r, c, null);
    for (const [r, c, x] of items) setCell(to, r + dr, c + dc, x.f != null && to !== from ? { ...x, f: anchorFormula(x.f, from.name) } : x);
    const inside = m => m.r1 >= g.r1 && m.r2 <= g.r2 && m.c1 >= g.c1 && m.c2 <= g.c2, moved = from.merges.filter(inside);
    setProp(from, 'merges', from.merges.filter(m => !inside(m)));
    setProp(to, 'merges', [...to.merges.filter(m => !meets(m, target)), ...moved.map(m => ({ r1: m.r1 + dr, c1: m.c1 + dc, r2: m.r2 + dr, c2: m.c2 + dc }))]);
    eachFormula((f, self) => moveFormula(f, self, from.name, g, dr, dc, to.name));
    eachName(f => mapRefs(f, t => t.a.every(Boolean) ? moveFormula(t.s, '', from.name, g, dr, dc, to.name) : null));
    // the cells' rules go with them; a rule anywhere that pointed at the cells (a list's source) points at their new place
    const follow = f => mapRefs(to === from ? f : anchorFormula(f, from.name), t => t.a.every(Boolean) ? moveFormula(t.s, to.name, from.name, g, dr, dc, to.name) : null);
    for (const key of RULE_KEYS) {
      const rules = packRules(from, key, g);
      cutRules(from, key, g);
      cutRules(to, key, target);
      for (const sh of WB.sheets) eachRuleOf(sh, key, f => moveFormula(f, sh.name, from.name, g, dr, dc, to.name));
      const back = unpackRules(key, rules, target.r1, target.c1, g.r1, g.c1).map(rule => cfFormulas(rule, follow));
      if (back.length) setProp(to, key, [...to[key], ...back]);
    }
  });
  CLIP = null;
  SEL = { r: target.r1, c: target.c1, er: target.r2, ec: target.c2 };
  after();
}
/* plain text: rows by line, cells by tab, "quoted" cells may hold tabs and line breaks (as Excel writes them) */
function textGrid(text) {
  const rows = [[]];
  let cur = '', q = false, i = 0;
  const t = text.replace(/\r\n?/g, '\n');
  while (i < t.length) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i += 2; continue; } q = false; i++; continue; } cur += ch; i++; continue; }
    if (ch === '"' && cur === '') { q = true; i++; continue; }
    if (ch === '\t') { rows[rows.length - 1].push(cur); cur = ''; i++; continue; }
    if (ch === '\n') { rows[rows.length - 1].push(cur); cur = ''; rows.push([]); i++; continue; }
    cur += ch; i++;
  }
  rows[rows.length - 1].push(cur);
  while (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  const cells = [];
  rows.forEach((row, r) => row.forEach((t0, c) => { if (t0 !== '') cells.push({ r, c, t: t0 }); }));
  return { h: rows.length, w: Math.max(1, ...rows.map(r => r.length)), cells, merges: [] };
}
/* a table from Excel, Google Sheets or a web page: each cell's text or value (Excel's x:num, Google's own), Google's
   formula, merged cells, and the look from its style attribute and the page's CSS classes */
const COLOR_PROBE = document.createElement('canvas').getContext('2d');
function cssColor(v) {
  v = String(v || '').trim().toLowerCase();
  if (!v || v === 'transparent' || v === 'none' || v === 'auto' || v === 'inherit') return null;
  if (v === 'windowtext') return '#000000';
  COLOR_PROBE.fillStyle = '#010203'; COLOR_PROBE.fillStyle = v;
  const out = COLOR_PROBE.fillStyle;
  if (out === '#010203' && v !== '#010203') return null;
  if (/^#[0-9a-f]{6}$/.test(out)) return out;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(out);
  if (!m || (m[4] != null && +m[4] < 0.1)) return null;
  return '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('');
}
function cssDecls(text) {
  const out = {};
  for (const part of String(text || '').split(';')) { const i = part.indexOf(':'); if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim(); }
  return out;
}
function cssClasses(doc) {
  const rules = {};
  for (const st of doc.querySelectorAll('style')) {
    const css = st.textContent.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--|-->/g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) for (const sel of m[1].split(',')) { const k = sel.trim().toLowerCase(); rules[k] = { ...(rules[k] || {}), ...cssDecls(m[2]) }; }
  }
  return rules;
}
function bdSpec(v) {
  const s = String(v || '').toLowerCase();
  if (!s || /none|hidden/.test(s) || /^0/.test(s)) return null;
  const w = /(\d*\.?\d+)(pt|px)/.exec(s), n = w ? (w[2] === 'pt' ? +w[1] * 4 / 3 : +w[1]) : 1;
  const kind = /double/.test(s) ? '=' : /dashed/.test(s) ? 'd' : /dotted/.test(s) ? 'o' : 's';
  const col = cssColor(s.replace(/(\d*\.?\d+)(pt|px)|solid|dashed|dotted|double|none/g, '').trim()) || '#000000';
  return (kind === '=' ? '1' : n >= 2.5 ? '3' : n >= 1.5 ? '2' : '1') + kind + col;
}
function msoFormat(v) {
  let s = String(v || '').trim();
  if (!s) return null;
  if (/^"?percent"?$/i.test(s)) return '0.00%';
  if (/^"?short date"?$/i.test(s)) return DATE_NF;
  if (/^"?fixed"?$/i.test(s)) return '0.00';
  if (/^"?standard"?$/i.test(s)) return NUM_NF;
  s = s.replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1');
  return s === 'General' ? null : s;
}
function styleOfCss(d, rtl) {
  const st = {};
  if (/bold|[6-9]00/.test(d['font-weight'] || '')) st.b = true;
  if (/italic/.test(d['font-style'] || '')) st.i = true;
  const deco = (d['text-decoration'] || '') + ' ' + (d['text-decoration-line'] || '');
  if (/underline/.test(deco)) st.u = true;
  if (/line-through/.test(deco)) st.s = true;
  const c = cssColor(d.color); if (c && c !== '#000000') st.c = c;
  const bg = cssColor(d['background-color'] || (d.background || '').split(/\s+/).find(x => cssColor(x)));
  if (bg && bg !== '#ffffff') st.bg = bg;
  const ha = (d['text-align'] || '').toLowerCase(); if (/^(left|center|right)$/.test(ha)) st.ha = ha[0];
  const va = (d['vertical-align'] || '').toLowerCase(); if (va === 'top' || va === 'middle' || va === 'bottom') st.va = va[0];
  const fs = /(\d*\.?\d+)(pt|px)/.exec(d['font-size'] || ''); if (fs) { const pt = fs[2] === 'px' ? +fs[1] * 0.75 : +fs[1]; if (Math.abs(pt - DEF_FS) > 0.2) st.fs = Math.round(pt * 2) / 2; }
  const ff = (d['font-family'] || '').split(',')[0].replace(/["']/g, '').trim(); if (ff && ff !== DEF_FONT && okFont(ff)) st.ff = ff;
  if (/normal|pre-wrap/.test(d['white-space'] || '')) st.wr = true;
  const all = d.border ? bdSpec(d.border) : null;
  const side = k => d['border-' + k] != null ? bdSpec(d['border-' + k]) : all;
  const T_ = side('top'), B_ = side('bottom'), L_ = side('left'), R_ = side('right');
  if (T_) st.bt = T_; if (B_) st.bb = B_;
  if (L_) st[rtl ? 'be' : 'bs'] = L_; if (R_) st[rtl ? 'bs' : 'be'] = R_;
  const nf = msoFormat(d['mso-number-format']); if (nf) st.nf = nf;
  return Object.keys(st).length ? st : null;
}
const BR_MARK = String.fromCharCode(1);
function htmlGrid(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html'), table = doc.querySelector('table');
  if (!table) return null;
  const rules = cssClasses(doc), rtl = WS.dir === 'rtl', taken = new Set(), cells = [], merges = [];
  const base = { ...(rules.td || {}) };
  let r = 0, w = 0, hmax = 0;
  for (const tr of table.rows) {
    let c = 0;
    for (const td of tr.cells) {
      while (taken.has(r + ',' + c)) c++;
      const cs = clamp(+td.colSpan || 1, 1, 500), rs = clamp(+td.rowSpan || 1, 1, 5000);
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) taken.add((r + i) + ',' + (c + j));
      if (cs > 1 || rs > 1) merges.push([r, c, r + rs - 1, c + cs - 1]);
      let d = { ...base, ...(rules[td.tagName.toLowerCase()] || {}) };
      for (const k of td.classList) d = { ...d, ...(rules['.' + k.toLowerCase()] || {}), ...(rules[td.tagName.toLowerCase() + '.' + k.toLowerCase()] || {}) };
      d = { ...d, ...cssDecls(td.getAttribute('style')) };
      for (const el of td.querySelectorAll('b,strong')) if (el.textContent.trim() === td.textContent.trim()) d['font-weight'] = 'bold';
      for (const el of td.querySelectorAll('font[color]')) d.color = el.getAttribute('color');
      // a <br> is a line break in the cell; the page's own line breaks are only spaces
      for (const br of td.querySelectorAll('br')) br.replaceWith(BR_MARK);
      const text = td.textContent.replace(/\s+/g, ' ').split(BR_MARK).map(s => s.trim()).join('\n').trim();
      const q = { r, c, t: text, st: styleOfCss(d, rtl) };
      const num = td.getAttribute('x:num');
      if (num != null && num !== '' && Number.isFinite(+num)) q.v = +num;
      const gv = td.getAttribute('data-sheets-value');
      if (gv) { try { const j = JSON.parse(gv); if (j[1] === 3 && typeof j[3] === 'number') q.v = j[3]; else if (j[1] === 4) q.v = !!j[4]; else if (j[1] === 2 && typeof j[2] === 'string') q.v = j[2]; } catch {} }
      const gf = td.getAttribute('data-sheets-formula');
      if (gf && gf[0] === '=') q.fr = gf.slice(1);
      cells.push(q);
      c += cs; w = Math.max(w, c); hmax = Math.max(hmax, r + rs);
    }
    r++;
  }
  return { h: Math.max(r, hmax), w: Math.max(1, w), cells: cells.filter(q => q.t !== '' || q.v !== undefined || q.fr || q.st), merges };
}
/* Google Sheets writes copied formulas as R1C1: R[-1]C[0] is one row up, R2C3 is $C$2 */
function r1c1ToA1(f, r, c) {
  const part = m => m.startsWith('[') ? { rel: true, n: +m.slice(1, -1) } : m === '' ? { rel: true, n: 0 } : { rel: false, n: +m - 1 };
  return f.replace(/("(?:[^"]|"")*")|(?<![A-Za-z0-9_.$])R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?(?![A-Za-z0-9_(])/g, (m, str, rr, cc) => {
    if (str) return str;
    const R = part(rr ?? ''), C = part(cc ?? '');
    const row = R.rel ? r + R.n : R.n, col = C.rel ? c + C.n : C.n;
    if (row < 0 || col < 0 || row >= MAXR || col >= MAXC) return '#REF!';
    return (C.rel ? '' : '$') + colName(col) + (R.rel ? '' : '$') + (row + 1);
  });
}

/* =========================================================
   a range as an HTML table with its look: for copying out, printing, PDF and the versions' preview.
   grid: light lines around cells that have no border of their own (and whose neighbor has none there either)
   ========================================================= */
function tableEl(s, g, o = {}) {
  const rtl = s.dir === 'rtl', cols = [], rows = [];
  for (let c = g.c1; c <= g.c2; c++) if (!s.hc.has(c)) cols.push(c);
  for (let r = g.r1; r <= g.r2; r++) if (!s.hr.has(r) && !(s._fh && s._fh.has(r))) rows.push(r);
  const colSet = new Set(cols), rowSet = new Set(rows), covered = new Set(), anchors = new Map();
  for (const m of s.merges) {
    if (!meets(m, g)) continue;
    anchors.set(KEY(m.r1, m.c1), m);
    for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(KEY(r, c));
  }
  let W = 0;
  const cg = h('colgroup');
  for (const c of cols) { const w = s.cw.get(c) ?? s.dw; W += w; cg.append(h('col', { style: { width: w + 'px' } })); }
  const t = h('table', { dir: s.dir, cellspacing: '0', cellpadding: '0', style: { borderCollapse: 'collapse', tableLayout: 'fixed', width: W + 'px', fontFamily: `"${DEF_FONT}", Arial, sans-serif`, fontSize: DEF_FS + 'pt', color: '#000', background: '#fff' } }, cg);
  const look = (r, c) => { const x = s.cells.get(KEY(r, c)), st = underTable(s, r, c, x ? x.st : emptyLook(s, r, c)), cf = cfAt(s, r, c); return cf && cf.st ? { ...(st || {}), ...cf.st } : st; };
  const tb = h('tbody');
  for (const r of rows) {
    const tr = h('tr', { style: { height: (s.rh.get(r) ?? s.dh) + 'px' } });
    for (const c of cols) {
      const k = KEY(r, c);
      if (covered.has(k)) continue;
      const x = cellSp(s, r, c), cf = cfAt(s, r, c), vw = x ? view(x) : { t: '', k: '' }, m = anchors.get(k);
      let st = underTable(s, r, c, x ? x.st : emptyLook(s, r, c));
      if (cf && cf.st) st = { ...(st || {}), ...cf.st };
      if (cf && cf.hide) vw.t = '';
      const td = h('td');
      if (m) { const cs = span(m.c1, m.c2).filter(i => colSet.has(i)).length, rs = span(m.r1, m.r2).filter(i => rowSet.has(i)).length; if (cs > 1) td.colSpan = cs; if (rs > 1) td.rowSpan = rs; }
      const al = alignOf(st, vw, s.dir), css = [`text-align:${al === 'l' ? 'left' : al === 'c' ? 'center' : 'right'}`, `vertical-align:${{ t: 'top', m: 'middle', b: 'bottom' }[(st && st.va) || 'b']}`, 'padding:1px 3px', 'overflow:hidden',
        st && st.wr ? 'white-space:pre-wrap;word-break:break-word' : 'white-space:pre'];
      if (st && st.b) css.push('font-weight:700');
      if (st && st.i) css.push('font-style:italic');
      const deco = [st && st.u && 'underline', st && st.s && 'line-through'].filter(Boolean).join(' ');
      if (deco) css.push('text-decoration:' + deco);
      const tc = (cf && cf.st && cf.st.c) || vw.col || (st && st.c);
      if (tc) css.push('color:' + tc);
      if (st && st.bg) css.push('background:' + st.bg);
      if (!o.clip && cf && (cf.bar || cf.icon)) css.push('position:relative');
      if (st && st.fs) css.push('font-size:' + st.fs + 'pt');
      if (st && st.ff) css.push(`font-family:"${st.ff}"`);
      // each side: its own border, else the neighbor's on the same line, else (printing) a light gridline
      const sides = [['bt', 'top', r - 1, c, 'bb'], ['bb', 'bottom', (m ? m.r2 : r) + 1, c, 'bt'], ['bs', rtl ? 'right' : 'left', r, c - 1, 'be'], ['be', rtl ? 'left' : 'right', r, (m ? m.c2 : c) + 1, 'bs']];
      for (const [key, side, nr, nc, other] of sides) {
        const own = st && st[key], nb = !own && nr >= 0 && nc >= 0 ? (look(nr, nc) || {})[other] : null, b = own || nb;
        if (b) css.push(`border-${side}:${b[1] === '=' ? 3 : b[0]}px ${BD_CSS[b[1]] || 'solid'} ${b.slice(2)}`);
        else if (o.grid) css.push(`border-${side}:1px solid #d4d8df`);
      }
      if (o.clip && st && st.nf && !/["\\]/.test(st.nf)) css.push(`mso-number-format:"${st.nf}"`);
      td.style.cssText = css.join(';');
      if (vw.t) { if (o.clip) td.textContent = vw.t; else td.append(h('span', { dir: vw.k === 's' ? 'auto' : 'ltr', style: cf && cf.bar ? { position: 'relative', zIndex: '1' } : null, text: vw.k === 'n' ? fitNumber(x, vw, (m ? span(m.c1, m.c2).reduce((a, i) => a + (s.cw.get(i) ?? s.dw), 0) : s.cw.get(c) ?? s.dw) - 6, fontOf(st, (st && st.fs || DEF_FS) * 4 / 3)) : vw.t })); }
      if (o.clip && x && typeof x.v === 'number') td.setAttribute('x:num', String(x.v));
      if (!o.clip && cf && cf.bar) { const keep = Z; Z = 1; try { td.append(...barEls(cf.bar, s.cw.get(c) ?? s.dw, rtl)); } finally { Z = keep; } }
      if (!o.clip && cf && cf.icon) { const ic = h('span', { style: { display: 'inline-block', verticalAlign: 'middle', marginRight: '4px', float: 'left', lineHeight: '0' } }); ic.innerHTML = iconSvg(cf.icon.set, cf.icon.i, 14); td.prepend(ic); }
      tr.append(td);
    }
    tb.append(tr);
  }
  t.append(tb);
  t._w = W;
  return t;
}

/* =========================================================
   the interface: the sheet's look (CSS), its ribbon tabs, the formula bar, the sheet tabs, menus and the status line
   ========================================================= */
const CSS = `
#app.sheet #stPage:empty,#app.sheet #stChars,#app.sheet #stGoal{display:none!important}
#app.sheet #stPage.warn{color:var(--amber);font-weight:600}
#sheetView{position:relative}
#sheetView>#banner{margin:10px auto 6px}
.sh-fbar{flex:none;display:flex;align-items:flex-start;gap:6px;padding:5px 8px;border-bottom:1px solid var(--line);background:var(--surface)}
.sh-nbox{flex:none;display:flex;align-items:stretch;height:28px;box-sizing:border-box;border:1px solid var(--line);border-radius:6px;background:var(--surface-2);overflow:hidden}
.sh-nbox:focus-within{border-color:var(--accent);background:var(--surface)}
.sh-name{flex:none;width:92px;min-width:0;border:0;background:none;padding:0 8px;font:500 12.5px var(--ui);text-align:center;direction:ltr;color:var(--text);text-overflow:ellipsis}
.sh-name:focus{outline:none}
.sh-nmb{flex:none;width:20px;border:0;border-inline-start:1px solid var(--line);background:none;color:var(--text-2);display:grid;place-items:center;padding:0}
.sh-nmb:hover{background:var(--surface-3);color:var(--text)}
.sh-nmb .ms{font-size:18px;width:auto}
.sh-nmm{display:flex;flex-direction:column;gap:8px;min-width:min(720px,88vw)}
.sh-nmm-head,.sh-nmm-row{display:grid;grid-template-columns:minmax(80px,1.1fr) minmax(70px,1fr) minmax(110px,1.7fr) minmax(70px,.8fr);gap:8px;align-items:center}
.sh-nmm-head{font-size:12px;color:var(--text-2);padding:0 10px}
.sh-nmm-list{border:1px solid var(--line);border-radius:8px;height:min(280px,40vh);overflow:auto;padding:4px;background:var(--surface);outline:none}
.sh-nmm-row{padding:6px;border-radius:6px;cursor:pointer;font-size:13px}
.sh-nmm-row.on{background:var(--accent-soft)}
.sh-nmm-row>*{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:start}
.sh-nmm-row b{font-weight:600}
.sh-nmm-note{font-size:12.5px;color:var(--text-2);min-height:18px;overflow-wrap:anywhere}
.sh-nmd{display:flex;flex-direction:column;min-width:min(440px,100%)}
.sh-nfs{display:flex;flex-direction:column}
.sh-nfs>p{margin:0 0 10px}
.sh-nfs-t{font-size:12px;color:var(--text-2);margin:8px 0 4px}
.sh-nfs .sh-nmm-list{height:min(178px,30vh);margin-bottom:8px}
.sh-nfs .sh-ch-err{min-height:20px}
.sh-nfs-row{display:grid;grid-template-columns:minmax(80px,1fr) minmax(60px,.6fr) minmax(0,1.25fr);gap:8px;padding:4px 6px;font-size:13px}
.sh-nfs-row>*{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:start}
.sh-nfs-row b{font-weight:600}
.sh-fxb{flex:none;height:28px;min-width:32px;border:0;border-radius:6px;background:none;color:var(--text-2);font:italic 700 14px Georgia,"Times New Roman",serif}
.sh-fxb:hover{background:var(--surface-3);color:var(--accent)}
.sh-bar{flex:1;min-width:0;height:28px;max-height:140px;border:1px solid var(--line);border-radius:6px;background:var(--surface-2);padding:4px 8px;font:13px/1.45 var(--ui);resize:none;color:var(--text);overflow:hidden;white-space:pre-wrap}
.sh-bar:focus{outline:none;border-color:var(--accent);background:var(--surface);overflow:auto}
.sh-bar.ghost:not(:focus){color:var(--text-3,#8a8f98)}
.sh-wrap{flex:1;min-height:0;position:relative;overflow:hidden}
.sh-scroll{position:absolute;inset:0;overflow:auto;background:#fff;outline:none;overscroll-behavior:contain;user-select:none;-webkit-user-select:none;scrollbar-width:auto}
.sh-canvas{position:relative;display:grid}
.sh-l{grid-area:1/1;position:relative;overflow:hidden}
.sh-body{z-index:0}
.sh-top{position:sticky;top:0;z-index:3;align-self:start;background:#fff}
.sh-side{position:sticky;inset-inline-start:0;z-index:2;justify-self:start;background:#fff}
.sh-corner{position:sticky;top:0;inset-inline-start:0;z-index:4;align-self:start;justify-self:start;background:#fff}
.sh-l>div{position:absolute;box-sizing:border-box}
.sh-gl{background:#e1e4e9}
.sh-c{z-index:1;display:flex;direction:ltr;padding:0 3px;overflow:hidden;white-space:pre;line-height:1.2;color:#1b1f2a;font:13.33px Arial,sans-serif}
.sh-c.over{background:#fff}
.sh-c>span{flex:none}
.sh-c.wr{white-space:pre-wrap}
.sh-c>span{position:relative;z-index:1}
.sh-cfbar{position:absolute;box-sizing:border-box;border:1px solid transparent;pointer-events:none}
.sh-cfaxis{position:absolute;top:0;bottom:0;width:0;border-left:1px dashed #333;pointer-events:none}
.sh-cfic{position:absolute;display:flex;line-height:0;pointer-events:none;z-index:1}
.sh-cfgal{display:flex;flex-direction:column;gap:6px;width:min(340px,86vw)}
.sh-cfgal-t{font-size:12px;color:var(--text-2);margin-top:4px}
.sh-cfgal-g{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}
.sh-cfgal-g.wide{grid-template-columns:repeat(auto-fill,minmax(96px,1fr))}
.sh-cfgal-b{display:flex;align-items:center;justify-content:center;min-height:40px;border:1px solid var(--line);border-radius:6px;background:#fff;cursor:pointer;padding:4px}
.sh-cfgal-b:hover,.sh-cfgal-b.on{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.sh-cfgal-pic.bars{display:flex;flex-direction:column;gap:3px;width:40px;align-items:flex-start}
.sh-cfgal-pic.bars i{display:block;height:7px;box-sizing:border-box;border:1px solid transparent}
.sh-cfgal-pic.scale{display:flex;flex-direction:column;width:26px;height:30px;border:1px solid #cfd3da}
.sh-cfgal-pic.scale i{flex:1}
.sh-cfgal-pic.icons{display:flex;gap:1px;direction:ltr;line-height:0}
.sh-cfsw{display:inline-flex;align-items:center;justify-content:center;width:96px;height:24px;padding:0 6px;border:1px solid var(--line);border-radius:4px;font-size:12px;background:#fff;color:#1b1f2a;box-sizing:border-box;flex:none;overflow:hidden;white-space:nowrap}
.sh-cfsw.ic{gap:1px;direction:ltr;line-height:0}
.sh-cfsw.big{width:auto;min-width:170px;height:34px;font-size:14px}
.sh-cfsw-bar{display:block;width:70%;height:14px;box-sizing:border-box;border:1px solid transparent}
.sh-cflook{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px}
.sh-cflook-row{display:flex;align-items:center;gap:4px}
.sh-cfq p{margin:0 0 10px}
.sh-cfq-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.sh-cfq-row .field{flex:1;min-width:110px;margin:0}
.sh-cfq-row .check{margin:0}
.sh-cfn{max-width:90px}
.sh-cfed{display:flex;flex-direction:column;min-width:min(560px,82vw)}
.sh-cfed-area{margin-bottom:6px}
.sh-cfed-vo{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.sh-cfed-vo .field{margin:0;flex:1;min-width:0}
.sh-cfed-vo input[type=color]{width:44px;height:30px;padding:0;border:1px solid var(--line);border-radius:6px;background:none;flex:none}
.sh-cfed-l{min-width:84px;font-size:12.5px;color:var(--text-2)}
.sh-cfed-sets{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px;margin-bottom:12px}
.sh-cfed-ic{display:inline-flex;width:18px;flex:none;line-height:0}
.sh-cfed-th .sh-cfed-vo select.field:first-of-type{flex:none;width:auto}
.sh-cfm{display:flex;flex-direction:column;gap:8px;min-width:min(760px,88vw)}
.sh-cfm-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.sh-cfm-bar .fld{margin:0}
.sh-cfm .fld.inline{flex-direction:row;align-items:center;gap:8px;margin-inline-end:auto}
.sh-cfm-head,.sh-cfm-row{display:grid;grid-template-columns:96px minmax(0,1fr) 190px 84px;gap:8px;align-items:center}
.sh-cfm-head{font-size:12px;color:var(--text-2);padding:0 10px}
.sh-cfm-list{border:1px solid var(--line);border-radius:8px;height:min(300px,40vh);overflow:auto;padding:4px;background:var(--surface)}
.sh-cfm-row{padding:5px 6px;border-radius:6px;cursor:pointer}
.sh-cfm-row.on{background:var(--accent-soft)}
.sh-cfm-row .field,.sh-cfm-row .check{margin:0}
.sh-cfm-d{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sh-c.wr>span{flex:0 1 auto;min-width:0;width:100%;overflow-wrap:anywhere}
.sh-bd{z-index:3}
.sh-nmark{z-index:6;pointer-events:none;background:linear-gradient(to bottom left,#e3242b 50%,transparent 50%)}
.sh-scroll[dir=rtl] .sh-nmark{background:linear-gradient(to bottom right,#e3242b 50%,transparent 50%)}
.sh-note{position:absolute;z-index:9;width:200px;min-height:56px;max-height:260px;overflow:auto;box-sizing:border-box;padding:6px 8px;background:#ffffe1;color:#1b1f2a;border:1px solid #8a8a5c;box-shadow:2px 2px 6px rgba(0,0,0,.18);font:12.5px/1.45 Tahoma,Arial,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;text-align:start;pointer-events:none}
.sh-link{position:absolute;z-index:9;display:flex;align-items:center;gap:6px;max-width:380px;padding:3px 4px 3px 10px;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:8px;box-shadow:var(--pop);font:13px var(--ui);pointer-events:auto}
.sh-link a{color:#0563c1;text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;min-width:0}
.sh-link .icon-btn{width:28px;height:28px}
.sh-note.ed{pointer-events:auto;resize:both;height:110px;max-height:none;outline:2px solid #2743d8;outline-offset:-1px}
.sh-fb{z-index:4;display:grid;place-items:center;border:1px solid #b9bfca;border-radius:3px;background:#f3f4f7;color:#3d4556}
.sh-fb .ms{font-size:15px;width:auto}
.sh-fb.on{background:#e3e8fd;border-color:#2743d8;color:#2743d8}
.sh-hd{z-index:7;display:flex;align-items:center;justify-content:center;background:var(--surface-2);color:var(--text-2);font:500 11.5px var(--ui);border-inline-end:1px solid var(--line);border-bottom:1px solid var(--line);white-space:nowrap;overflow:hidden;font-variant-numeric:tabular-nums}
.sh-hd.on{background:var(--accent-soft);color:var(--accent);font-weight:700;box-shadow:inset 0 -2px 0 var(--accent)}
.sh-hd.r.on{box-shadow:none;border-inline-end:2px solid var(--accent)}
.sh-hd.all{background:var(--accent);color:var(--on-accent)}
.sh-hd.flt{color:#2743d8}
.sh-cor{z-index:8;background:var(--surface-2);border-inline-end:1px solid var(--line);border-bottom:1px solid var(--line);cursor:pointer}
.sh-cor::after{content:"";position:absolute;inset-inline-end:3px;bottom:3px;width:0;height:0;border-style:solid;border-width:0 0 9px 9px;border-color:transparent transparent #aeb5c3 transparent}
.sh-frz{z-index:2;background:#8e97aa}
.sh-tint{z-index:4;background:rgba(39,67,216,.1)}
.sh-sel,.sh-act{z-index:5;border:2px solid #2743d8}
.sh-sel.nt{border-top-color:transparent}.sh-sel.nb{border-bottom-color:transparent}.sh-sel.ns{border-inline-start-color:transparent}.sh-sel.ne{border-inline-end-color:transparent}
.sh-sel.pt{border-style:dashed}
.sh-spa{z-index:5;border:1px solid #4f8ef7;pointer-events:none}
.sh-dvb{z-index:6;display:grid;place-items:center;border:1px solid #8b93a5;border-radius:2px;background:#f3f4f7;color:#3d4556}
.sh-dvb .ms{font-size:18px;width:auto}
.sh-dvr{z-index:5;border:2px solid #e03131;border-radius:50%;pointer-events:none}
.sh-dvtip{position:absolute;z-index:8;max-width:250px;padding:6px 10px;background:#fffbe6;color:#1b1f2a;border:1px solid #c9b458;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.14);font:12.5px/1.45 var(--ui);pointer-events:none;white-space:pre-wrap;overflow-wrap:anywhere;text-align:start}
.sh-dvtip b,.sh-dvtip span{display:block}
.sh-dvl{max-height:252px;overflow:auto;outline:none;font:13px var(--ui)}
.sh-dvl p{margin:4px 6px;max-width:260px}
.sh-dvi{padding:6px 10px;border-radius:6px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:min(420px,80vw);text-align:start}
.sh-dvi:hover,.sh-dvi.on{background:var(--accent-soft)}
.sh-aci.dv span{font-size:13px;color:var(--text)}
.sh-dva{display:flex;gap:12px;align-items:flex-start}
.sh-dva .ms{font-size:34px;width:auto;flex:none}
.sh-dva .ms.stop{color:#e03131}.sh-dva .ms.warn{color:#e8a100}.sh-dva .ms.info{color:#2743d8}
.sh-dva p{margin:4px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.sh-dvd{display:flex;flex-direction:column;min-width:min(520px,100%);min-height:min(350px,60vh)}
.sh-dvd .seg{align-self:flex-start;margin-bottom:12px}
.sh-dvd textarea.field{height:84px;padding:8px 10px;resize:vertical}
.sh-dvd .check{margin-bottom:10px}
.sh-dvd p{margin:0 0 8px}
.sh-dvd code{font:600 12.5px var(--mono);unicode-bidi:isolate;background:var(--surface-2);border-radius:5px;padding:1px 6px}
.sh-fh{z-index:6;background:#2743d8;border:1px solid #fff}
.sh-clip{z-index:6;background:linear-gradient(90deg,#2743d8 50%,transparent 0) repeat-x 0 0/8px 2px,linear-gradient(90deg,#2743d8 50%,transparent 0) repeat-x 0 100%/8px 2px,linear-gradient(0deg,#2743d8 50%,transparent 0) repeat-y 0 0/2px 8px,linear-gradient(0deg,#2743d8 50%,transparent 0) repeat-y 100% 0/2px 8px;animation:shants .5s linear infinite}
@keyframes shants{to{background-position:8px 0,-8px 100%,0 -8px,100% 8px}}
.sh-ref{z-index:5;border:2px solid var(--rc);background:color-mix(in srgb,var(--rc) 9%,transparent)}
.sh-peer{z-index:4;border:2px solid var(--pc);pointer-events:none}
.sh-chart{z-index:8;background:#fff;border:1px solid #d9d9d9;box-sizing:border-box;cursor:move;touch-action:none}
.sh-chart.on{outline:2px solid #2743d8;outline-offset:0}
.sh-pic{background:none;border:0}
.sh-tgal{max-height:min(70vh,520px);overflow:auto;width:300px}
.sh-tgal-row{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}
.sh-tgal-b{padding:3px;border:1px solid transparent;border-radius:6px;background:none;cursor:pointer}
.sh-tgal-b:hover,.sh-tgal-b.on{border-color:#2743d8;background:var(--hover,#eef2ff)}
.sh-tsw{display:grid;grid-template-columns:repeat(4,10px);grid-auto-rows:7px;direction:ltr}
.sh-tsw i{display:block;box-sizing:border-box}
.sh-rchk{display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap;cursor:pointer}
.sh-topts{display:grid;grid-template-columns:repeat(3,auto);gap:4px 12px;align-content:center;padding:2px 4px}
.sh-tprops{display:flex;flex-direction:column;gap:3px;justify-content:center;padding:0 4px}
.sh-tname{width:128px;height:28px;padding:2px 6px}
.sh-pvpane{position:absolute;top:0;bottom:0;inset-inline-end:0;width:264px;z-index:12;overflow:auto;padding:10px 12px;background:var(--surface);color:var(--text);border-inline-start:1px solid var(--line);box-shadow:var(--pop);font:13px var(--ui);box-sizing:border-box}
.sh-pvhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
.sh-pvfields{display:flex;flex-direction:column;gap:2px;max-height:38%;overflow:auto;padding:4px 0;border-bottom:1px solid var(--line);margin-bottom:8px}
.sh-pvf{font-size:13px}
.sh-pvareas{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.sh-pvarea{min-height:70px;border:1px solid var(--line);border-radius:6px;padding:4px;display:flex;flex-direction:column;gap:3px}
.sh-pvat{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-2,#555)}
.sh-pvat .ms{font-size:16px}
.sh-pvchip{display:flex;align-items:center;justify-content:space-between;gap:2px;width:100%;padding:3px 6px;border:1px solid var(--line);border-radius:5px;background:var(--surface-2,#f4f6fb);color:var(--text);font:12px var(--ui);cursor:pointer;text-align:start}
.sh-pvchip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sh-pvflist{display:flex;flex-direction:column;gap:4px;max-height:50vh;overflow:auto}
.sh-pic-img{display:block;width:100%;height:100%;pointer-events:none;user-select:none;-webkit-user-drag:none}
.sh-ch-in{position:absolute;inset:0;overflow:hidden;pointer-events:none;direction:ltr;color:#404040}
.sh-ch-in svg{position:absolute;inset:0;width:100%;height:100%}
.sh-ch-in .ch-l{position:absolute;white-space:nowrap;line-height:1.2}
.sh-ch-none{position:absolute;inset:0;display:grid;place-items:center;padding:12px;text-align:center;color:#8a8f98;font:13px var(--ui)}
.sh-hd{position:absolute;width:9px;height:9px;background:#fff;border:1.5px solid #2743d8;border-radius:50%;display:none;z-index:1}
.sh-chart.on .sh-hd{display:block}
.h-ts,.h-t,.h-te{top:-5px}.h-bs,.h-b,.h-be{bottom:-5px}.h-s,.h-e{top:calc(50% - 5px)}
.h-ts,.h-s,.h-bs{inset-inline-start:-5px}.h-te,.h-e,.h-be{inset-inline-end:-5px}.h-t,.h-b{inset-inline-start:calc(50% - 5px)}
.h-ts,.h-be{cursor:nwse-resize}.h-te,.h-bs{cursor:nesw-resize}.h-t,.h-b{cursor:ns-resize}.h-s,.h-e{cursor:ew-resize}
[dir=rtl] .h-ts,[dir=rtl] .h-be{cursor:nesw-resize}[dir=rtl] .h-te,[dir=rtl] .h-bs{cursor:nwse-resize}
.sh-ch-dlg{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
.sh-ch-side{flex:1 1 260px;display:flex;flex-direction:column;gap:9px;min-width:0}
.sh-ch-types{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.sh-ch-type{display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 2px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--text);font-size:12px}
.sh-ch-type .ms{font-size:24px}
.sh-ch-type.on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}
.sh-ch-prev{flex:0 0 440px;max-width:100%;height:260px;position:relative;border:1px solid #d9d9d9;background:#fff;border-radius:6px;overflow:hidden}
.sh-ch-err{color:var(--danger,#c0392b);font-size:13px;margin:0}
@media (max-width:700px){.sh-ch-prev{flex-basis:100%;height:220px}}
.sh-ptag{z-index:7;width:auto!important;height:16px!important;padding:0 5px;border-radius:4px 4px 4px 0;background:var(--pc);color:#fff;font:600 11px/16px var(--ui);white-space:nowrap;pointer-events:none}
.sh-over{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:7}
.sh-ed{position:absolute;width:2px;height:2px;min-width:0;min-height:0;opacity:0;border:0;padding:0;margin:0;resize:none;overflow:hidden;background:#fff;color:#1b1f2a;outline:none;caret-color:transparent;white-space:pre;line-height:1.2;pointer-events:none}
.sh-over.editing .sh-ed{opacity:1;padding:2px 3px 0;border:2px solid #2743d8;caret-color:#1b1f2a;box-shadow:0 3px 10px rgba(0,0,0,.18);pointer-events:auto}
.sh-guide{position:absolute;background:#2743d8;z-index:9}
.sh-guide.c{top:0;bottom:0;width:2px}
.sh-guide.r{left:0;right:0;height:2px}
.sh-guide::after{content:attr(data-size);position:absolute;top:6px;inset-inline-start:8px;background:var(--text);color:var(--surface);font:500 11px var(--ui);padding:2px 7px;border-radius:5px;white-space:nowrap;direction:ltr}
.sh-guide.r::after{top:6px}
.sh-ac{position:absolute;z-index:10;pointer-events:auto;min-width:230px;max-width:360px;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:9px;box-shadow:var(--pop);padding:4px;font:13px var(--ui)}
.sh-aci{display:flex;flex-direction:column;gap:1px;padding:5px 9px;border-radius:6px;cursor:pointer}
.sh-aci b{font:700 12.5px var(--ui);direction:ltr;text-align:start}
.sh-aci span{font-size:11.5px;color:var(--text-2)}
.sh-aci.on,.sh-aci:hover{background:var(--accent-soft)}
.sh-hint{padding:5px 8px 2px;font:12.5px var(--ui);direction:ltr;text-align:left}
.sh-hint span{unicode-bidi:isolate}
.sh-hint .on{font-weight:700;color:var(--accent)}
.sh-hint-t{font-size:11.5px;color:var(--text-2);padding:0 8px 5px}
.sh-fndlg{display:flex;flex-direction:column;gap:10px}
.sh-fnbar{display:flex;gap:8px;align-items:center}
.sh-fnbar .field{flex:1;min-width:0;margin:0}
.sh-fnbar .sel{flex:none;width:auto;max-width:45%}
.sh-fnlist{height:min(290px,38vh);overflow:auto;border:1px solid var(--line);border-radius:8px;padding:4px;background:var(--surface);outline:none}
.sh-fnlist .sh-aci{padding:6px 9px}
.sh-fnlist .sh-aci b{direction:inherit;text-align:start}
.sh-fnabout{min-height:92px;padding:2px 2px 0}
.sh-fnabout p{margin:4px 0}
.sh-fnsig{font:600 14px/1.5 var(--ui);direction:ltr;text-align:start;unicode-bidi:isolate}
.sh-fnsig b{color:var(--accent)}
.sh-bottom{flex:none;display:flex;align-items:stretch;gap:2px;height:34px;padding:0 6px;border-top:1px solid var(--line);background:var(--surface-2)}
.sh-add{flex:none;width:32px;border:0;background:none;color:var(--text-2);border-radius:6px;margin:3px 0;display:grid;place-items:center}
.sh-add:hover{background:var(--surface-3);color:var(--text)}
.sh-tabs{flex:1;min-width:0;display:flex;align-items:stretch;gap:1px;overflow-x:auto;scrollbar-width:thin}
.sh-tab{flex:none;position:relative;display:flex;align-items:center;max-width:200px;padding:0 14px;border:0;border-radius:0 0 8px 8px;background:none;color:var(--text-2);font:500 12.5px var(--ui);white-space:nowrap;cursor:pointer;touch-action:pan-x}
.sh-tab span{overflow:hidden;text-overflow:ellipsis}
.sh-tab:hover{background:var(--surface-3);color:var(--text)}
.sh-tab.on{background:var(--surface);color:#1d8249;font-weight:700;box-shadow:inset 0 -3px 0 #1d8249}
.sh-tab.col::before{content:"";position:absolute;inset-inline:8px;top:0;height:4px;border-radius:0 0 3px 3px;background:var(--tc)}
.sh-tab.drag{opacity:.55}
.sh-tab.drop-a{box-shadow:inset 3px 0 0 var(--accent)}.sh-tab.drop-b{box-shadow:inset -3px 0 0 var(--accent)}
.sh-fmenu{display:flex;flex-direction:column;gap:2px;width:260px;max-width:calc(100vw - 32px)}
.sh-fmenu .field{height:32px;margin:4px 0}
.sh-fsep{height:1px;background:var(--line);margin:4px 0}
.sh-fl{max-height:min(42vh,300px);overflow:auto;border:1px solid var(--line);border-radius:8px;padding:4px 8px;margin-bottom:8px}
.sh-fl .check{margin:3px 0;color:var(--text)}
.sh-fl .check span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sh-fall{margin:2px 0 4px;color:var(--text)}
.sh-levels{display:flex;flex-direction:column;gap:8px;margin:10px 0}
.sh-level{display:grid;grid-template-columns:auto 1fr 1fr auto;align-items:center;gap:8px}
.sh-level .muted{font-size:12.5px;white-space:nowrap}
.sh-find .btn-row{align-items:center}
.sh-nf{min-width:106px;justify-content:space-between;border:1px solid var(--line);background:var(--surface);padding:0 6px 0 8px}
.sh-sel-font{width:128px}
.sh-sel-size{width:58px}
.sh-cur{font:600 15px var(--ui);min-width:30px}
.sh-num{font:600 12px var(--ui);direction:ltr}
.panel.fit1 .fit-a>.gb,.panel.fit2 .fit-b>.gb,.panel.fit3 .fit-c>.gb{display:grid;grid-template-rows:repeat(2,30px);grid-auto-flow:column;align-content:center;gap:4px 3px}
.panel.fit1 .fit-a .rb.big,.panel.fit2 .fit-b .rb.big,.panel.fit3 .fit-c .rb.big{flex-direction:row;height:30px;min-width:30px;padding:0 5px}
.panel.fit1 .fit-a .rb.big>span:not(.ms),.panel.fit2 .fit-b .rb.big>span:not(.ms),.panel.fit3 .fit-c .rb.big>span:not(.ms){display:none}
.panel.fit1 .fit-a .rb.big .ms,.panel.fit2 .fit-b .rb.big .ms,.panel.fit3 .fit-c .rb.big .ms{font-size:20px}
.mi .sh-sample{margin-inline-start:auto;color:var(--text-3);font-size:12px;padding-inline-start:16px;direction:ltr}
.sh-bdrow{display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}
.sh-bdrow .opt{min-width:36px;height:28px}
.sh-bdrow .opt i{display:block;width:24px;border-top:2px solid currentColor}
.sh-help h4{margin:14px 0 4px;font-size:14px}
.sh-help p{margin:0 0 6px;color:var(--text-2);font-size:13px;line-height:1.55}
.sh-help code{font:600 12.5px var(--mono);direction:ltr;unicode-bidi:isolate;background:var(--surface-2);border-radius:5px;padding:1px 6px}
.sh-tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.sh-tpl .ms{color:#1d8249}
#sheetPrint{display:none}
@media print{
  html.sheet-print #app{display:none!important}
  html.sheet-print #sheetPrint{display:block}
  #sheetPrint table{break-inside:auto}
  #sheetPrint tr{break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  #sheetPrint td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sh-print-sheet{break-after:page}
  .sh-print-sheet:last-child{break-after:auto}
  .sh-print-sheet h2{font:700 13pt Arial,sans-serif;margin:0 0 6pt}
}
@media (max-width:700px){.sh-name{width:64px}.sh-fxb{display:none}.sh-tab{padding:0 10px}}
`;

/* --- the ribbon: its tabs and panels are made here, in the app's own ribbon, and show only for a spreadsheet --- */
const rbtn = (cmd, ic, label, o = {}) => h('button', { class: 'rb' + (o.big ? ' big' : '') + (o.cls ? ' ' + o.cls : ''), type: 'button', 'data-cmd': cmd, 'data-arg': o.arg, title: o.title || label, 'aria-label': label, id: o.id },
  ic ? (typeof ic === 'string' ? icon(ic, o.flip ? 'flip' : null) : ic) : null, o.big || o.text ? h('span', { text: o.text || label }) : null);
const split = (cmd, menu, ic, label, o = {}) => h('span', { class: 'split' }, rbtn(cmd, ic, label, o), h('button', { class: 'rb', type: 'button', 'data-cmd': menu, title: o.menuTitle || label, 'aria-label': o.menuTitle || label }, icon('arrow_drop_down')));
const group = (name, cls, ...kids) => h('div', { class: 'grp' }, h('div', { class: 'gb' + (cls ? ' ' + cls : '') }, kids), h('div', { class: 'gn', text: name }));
const row = (...kids) => h('div', { class: 'row' }, kids);
const tag = (el, cls) => (el.classList.add(cls), el);
/* a window too narrow for a tab shrinks it as Excel does: the buttons of one group (fit-a), and then of another (fit-b),
   become small icons. On the home tab those are the editing and the cells buttons, on the formulas tab its last two groups */
function fitRibbon() {
  for (const p of [V.home, V.fxTab]) {
    const r = p && p.parentNode;
    if (!r || p.hidden) continue;
    p.classList.remove('fit1', 'fit2', 'fit3');
    for (const c of ['fit1', 'fit2', 'fit3']) { if (r.scrollWidth <= r.clientWidth) break; p.classList.add(c); }
  }
}
function ribbonPanels() {
  const rtl = UI_DIR === 'rtl';
  const aligns = [['r', 'format_align_right', T('יישור לימין')], ['c', 'format_align_center', T('מרכוז')], ['l', 'format_align_left', T('יישור לשמאל')]];
  if (!rtl) aligns.reverse();
  V.font = h('select', { class: 'sel sh-sel-font', 'aria-label': T('גופן'), title: T('גופן') }, FONTS.map(f => h('option', { value: f, text: f, style: { fontFamily: `"${f}"` } })));
  V.size = h('select', { class: 'sel sh-sel-size', 'aria-label': T('גודל'), title: T('גודל') }, SIZES.map(s => h('option', { value: s, text: s })));
  V.nf = h('button', { class: 'rb sh-nf', type: 'button', 'data-cmd': 'shNfMenu', title: T('תבנית המספרים'), 'aria-label': T('תבנית המספרים') }, h('span', { text: T('כללי') }), icon('expand_more'));
  const home = V.home = h('div', { class: 'panel sheet-only', 'data-panel': 'shome', hidden: true },
    group(T('ביטול@undo'), 'col', rbtn('shUndo', 'undo', T('ביטול (Ctrl+Z)'), { flip: true }), rbtn('shRedo', 'redo', T('חזרה (Ctrl+Y)'), { flip: true })),
    group(T('לוח'), '', rbtn('shPaste', 'content_paste', T('הדבקה'), { big: true, title: T('הדבקה (Ctrl+V)') }),
      h('div', { class: 'gb col' }, rbtn('shCut', 'content_cut', T('גזירה'), { text: T('גזירה'), title: T('גזירה (Ctrl+X)') }), rbtn('shCopy', 'content_copy', T('העתקה'), { text: T('העתקה'), title: T('העתקה (Ctrl+C)') }))),
    group(T('גופן'), 'col', row(V.font, V.size),
      row(rbtn('shLook', 'format_bold', T('מודגש (Ctrl+B)'), { arg: 'b' }), rbtn('shLook', 'format_italic', T('נטוי (Ctrl+I)'), { arg: 'i' }), rbtn('shLook', 'format_underlined', T('קו תחתון (Ctrl+U)'), { arg: 'u' }), rbtn('shLook', 'strikethrough_s', T('קו חוצה'), { arg: 's' }),
        h('span', { class: 'sep' }),
        split('shColor', 'shColorMenu', h('span', { class: 'cbar', id: 'shColorBar' }, icon('format_color_text')), T('צבע הטקסט'), { menuTitle: T('בחירת צבע טקסט') }),
        split('shFill', 'shFillMenu', h('span', { class: 'cbar', id: 'shFillBar' }, icon('format_color_fill')), T('צבע רקע לתא'), { menuTitle: T('בחירת צבע רקע') }),
        split('shBorder', 'shBorderMenu', 'border_bottom', T('גבול תחתון'), { menuTitle: T('גבולות') }))),
    group(T('יישור'), 'col',
      row(rbtn('shVa', 'vertical_align_top', T('יישור למעלה'), { arg: 't' }), rbtn('shVa', 'vertical_align_center', T('יישור לאמצע'), { arg: 'm' }), rbtn('shVa', 'vertical_align_bottom', T('יישור למטה'), { arg: 'b' }), h('span', { class: 'sep' }), rbtn('shWrap', 'wrap_text', T('גלישת טקסט: כמה שורות בתא'))),
      row(...aligns.map(([a, ic, l]) => rbtn('shHa', ic, l, { arg: a })), h('span', { class: 'sep' }), rbtn('shMerge', 'cell_merge', T('מיזוג ומרכוז'), { id: 'shMergeBtn' }))),
    group(T('מספר'), 'col', row(V.nf),
      row(split('shCur', 'shCurMenu', h('span', { class: 'sh-cur', text: CUR }), T('מטבע'), { menuTitle: T('בחירת מטבע') }), rbtn('shPct', 'percent', T('אחוזים')), rbtn('shComma', h('span', { class: 'sh-num', text: '000' }), T('מפריד אלפים')),
        rbtn('shDec', 'decimal_increase', T('עוד ספרות אחרי הנקודה'), { arg: '1' }), rbtn('shDec', 'decimal_decrease', T('פחות ספרות אחרי הנקודה'), { arg: '-1' }))),
    tag(tag(group(T('סגנונות'), '', rbtn('shCfMenu', 'palette', T('עיצוב מותנה'), { big: true, title: T('צביעת תאים לפי הערכים שלהם, פסי נתונים, סולמות צבעים וסמלים') }),
      rbtn('shTblGallery', 'table_view', T('עיצוב כטבלה'), { big: true, title: T('טבלה בסגנון שבוחרים מתוך 60 הסגנונות של אקסל') })), 'sh-styles'), 'fit-c'),   // the third to shrink
    tag(group(T('תאים'), '', rbtn('shInsMenu', 'add_row_above', T('הוספה'), { big: true, title: T('הוספת שורות או עמודות') }), rbtn('shDelMenu', 'delete', T('מחיקה'), { big: true, title: T('מחיקת שורות או עמודות') }), rbtn('shCellMenu', 'width', T('גודל'), { big: true, title: T('רוחב עמודות, גובה שורות, הסתרה') })), 'fit-b'),
    tag(group(T('עריכה'), '', split('shSum', 'shSumMenu', 'functions', T('סכום אוטומטי (Alt+=)'), { menuTitle: T('פונקציות נוספות'), big: false }),
      rbtn('shSortMenu', 'sort', T('מיון וסינון'), { big: true }), rbtn('shClearMenu', 'ink_eraser', T('ניקוי'), { big: true }), rbtn('shFind', 'search', T('חיפוש'), { big: true, title: T('חיפוש והחלפה (Ctrl+F)') })), 'fit-a'));
  const formulas = V.fxTab = h('div', { class: 'panel sheet-only', 'data-panel': 'sformula', hidden: true },
    group(T('ספריית פונקציות'), '', rbtn('shFnDlg', 'function', T('הוספת פונקציה'), { big: true, title: T('כל הפונקציות, עם חיפוש (Shift+F3)') }),
      rbtn('shSumMenu', 'functions', T('סכום אוטומטי'), { big: true, title: T('סכום, ממוצע, ספירה, הכי גדול, הכי קטן') }),
      ...FN_CATS.map(([k, name, ic]) => rbtn('shFnCat', ic, T(name), { big: true, arg: k }))),
    tag(group(T('שמות מוגדרים'), '', rbtn('shNames', 'sell', T('מנהל השמות'), { big: true, title: T('כל השמות המוגדרים: חדש, עריכה ומחיקה (Ctrl+F3)') }),
      rbtn('shNameNew', 'new_label', T('הגדרת שם'), { big: true, title: T('שם לתאים שבחרת, לשימוש בנוסחאות וברשימות נפתחות') }),
      rbtn('shNameUse', 'label', T('שימוש בנוסחה'), { big: true, title: T('הוספת שם מוגדר לנוסחה') }),
      rbtn('shNameCreate', 'style', T('יצירה מהבחירה'), { big: true, title: T('שמות לתאים שבחרת, לפי הכותרות שלידם (Ctrl+Shift+F3)') })), 'fit-b'),
    tag(group(T('נוסחאות'), '', rbtn('shShowF', 'function', T('הצגת נוסחאות'), { big: true, title: T('הצגת הנוסחאות עצמן בתאים (Ctrl+`)') }), rbtn('shFxHelp', 'school', T('איך כותבים נוסחה'), { big: true })), 'fit-a'));
  const data = h('div', { class: 'panel sheet-only', 'data-panel': 'sdata', hidden: true },
    group(T('מיון'), '', rbtn('shSort', 'arrow_upward', T('מהקטן לגדול'), { big: true, arg: 'a', title: T('מיון מהקטן לגדול (א עד ת)') }), rbtn('shSort', 'arrow_downward', T('מהגדול לקטן'), { big: true, arg: 'd', title: T('מיון מהגדול לקטן (ת עד א)') }), rbtn('shSortDlg', 'sort', T('מיון מותאם'), { big: true })),
    group(T('סינון'), '', rbtn('shFilter', 'filter_alt', T('סינון'), { big: true, id: 'shFilterBtn', title: T('כפתורי סינון בשורת הכותרות (Ctrl+Shift+L)') }), rbtn('shFilterClear', 'filter_alt_off', T('ניקוי הסינון'), { big: true })),
    group(T('כלי נתונים'), '', rbtn('shDvList', 'arrow_drop_down', T('רשימה נפתחת'), { big: true, title: T('רשימה של ערכים לבחירה בתוך התא') }),
      rbtn('shDvMenu', UI_DIR === 'rtl' ? 'checklist_rtl' : 'checklist', T('אימות נתונים'), { big: true, title: T('מה מותר להקליד בתאים, הודעות, וסימון של ערכים לא תקינים') })));
  const viewP = h('div', { class: 'panel sheet-only', 'data-panel': 'sview', hidden: true },
    group(T('חלון'), '', rbtn('shFreezeMenu', 'ac_unit', T('הקפאה'), { big: true, title: T('השורות והעמודות הראשונות נשארות במקום בגלילה') })),
    group(T('תצוגה@view'), '', rbtn('shGrid', 'grid_on', T('קווי רשת'), { big: true, id: 'shGridBtn' }), rbtn('shDir', 'format_textdirection_r_to_l', T('גיליון מימין לשמאל'), { big: true, id: 'shDirBtn' })),
    group(T('זום'), '', rbtn('shZoom', 'remove', T('הקטנה'), { arg: '-1' }), h('button', { class: 'rb txt', type: 'button', 'data-cmd': 'shZoom', 'data-arg': '0', id: 'shZoomPct', title: T('חזרה ל-100%') }, '100%'), rbtn('shZoom', 'add', T('הגדלה'), { arg: '1' })));
  const insert = h('div', { class: 'panel sheet-only', 'data-panel': 'sinsert', hidden: true },
    group(T('טבלאות'), '', rbtn('shPivot', 'pivot_table_chart', T('טבלת ציר'), { big: true, title: T('סיכום של הנתונים לפי קבוצות: סכומים, ספירות וממוצעים בשורות ובעמודות') }),
      rbtn('shTable', 'table', T('טבלה'), { big: true, title: T('טבלה מהתאים שבחרת: שם, כותרות, פסים, סינון ושורת סיכום') })),
    group(T('איורים'), '', rbtn('shPic', 'add_photo_alternate', T('תמונה'), { big: true, title: T('תמונה מהמחשב. אפשר גם להדביק תמונה או לגרור קובץ לגיליון') })),
    group(T('גרפים'), '', ...CKS.map(k => rbtn('shChart', CHARTS[k].ic, T(CHARTS[k].n), { big: true, arg: k, title: T('גרף חדש מהתאים שבחרת') }))),
    group(T('קישורים'), '', rbtn('shLink', 'link', T('קישור'), { big: true, title: T('קישור לאתר, למקום בחוברת או לדואר (Ctrl+K)') })),
    group(T('הערות'), '', rbtn('shNote', 'sticky_note_2', T('הערה'), { big: true, title: T('הערה על התא, שמופיעה כשהעכבר עליו (Shift+F2)') })));
  return [home, insert, formulas, data, viewP, tablePanel(), pivotPanel()];
}
const SHEET_TAB_LIST = () => [['shome', T('בית')], ['sinsert', T('הוספה')], ['sformula', T('נוסחאות')], ['sdata', T('נתונים')], ['sview', T('תצוגה@view')]];
function mount() {
  if (V.view) return;
  document.head.append(h('style', { id: 'sheetcss' }, CSS));
  const tabs = $('#tabs');
  for (const [k, label] of SHEET_TAB_LIST()) tabs.append(h('button', { class: 'tab sheet-only', role: 'tab', 'data-tab': k, 'aria-selected': 'false' }, label));
  tabs.append(V.tblTab = h('button', { class: 'tab ctx sheet-only', role: 'tab', 'data-tab': 'stable', 'aria-selected': 'false', hidden: true }, T('עיצוב טבלה')));   // only while a table's cell is chosen
  tabs.append(V.pvTab = h('button', { class: 'tab ctx sheet-only', role: 'tab', 'data-tab': 'spivot', 'aria-selected': 'false', hidden: true }, T('ניתוח טבלת ציר')));   // and a pivot table's
  const ribbon = $('#ribbon');
  for (const p of ribbonPanels()) ribbon.append(p);
  if (window.ResizeObserver) { const ro = new ResizeObserver(fitRibbon); ro.observe(V.home); ro.observe(V.fxTab); }   // they change size when shown, and with the window
  // only the waiting line goes: the app's banner may already live here
  const view = $('#sheetView');
  view.querySelectorAll('.sh-wait').forEach(n => n.remove());
  V.view = view;
  V.name = h('input', { class: 'sh-name', type: 'text', 'aria-label': T('שם התא'), title: T('התא הפעיל. כתובת (כמו B7) ו-Enter עוברים אליה; שם חדש ו-Enter נותנים שם לתאים שנבחרו'), spellcheck: 'false', autocomplete: 'off' });
  V.nameBtn = h('button', { class: 'sh-nmb', type: 'button', title: T('שמות מוגדרים'), 'aria-label': T('שמות מוגדרים') }, icon('arrow_drop_down'));
  V.fx = h('button', { class: 'sh-fxb', type: 'button', title: T('הוספת פונקציה'), 'aria-label': T('הוספת פונקציה') }, 'fx');
  V.bar = h('textarea', { class: 'sh-bar', rows: '1', spellcheck: 'false', 'aria-label': T('התוכן של התא'), dir: 'auto' });
  V.body = h('div', { class: 'sh-l sh-body' }); V.side = h('div', { class: 'sh-l sh-side' }); V.top = h('div', { class: 'sh-l sh-top' }); V.corner = h('div', { class: 'sh-l sh-corner' });
  V.canvas = h('div', { class: 'sh-canvas' }, V.body, V.side, V.top, V.corner);
  V.scroll = h('div', { class: 'sh-scroll', tabindex: '-1' }, V.canvas);
  V.ed = h('textarea', { class: 'sh-ed', spellcheck: 'false', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', rows: '1', wrap: 'off', dir: 'auto', 'aria-label': T('התא הפעיל') });
  V.over = h('div', { class: 'sh-over' }, V.ed);
  V.add = h('button', { class: 'sh-add', type: 'button', title: T('גיליון חדש'), 'aria-label': T('גיליון חדש') }, icon('add'));
  V.tabs = h('div', { class: 'sh-tabs', role: 'tablist', 'aria-label': T('גיליונות') });
  V.anchor = h('div', { style: { position: 'fixed', width: '1px', height: '1px', pointerEvents: 'none' } });
  view.append(h('div', { class: 'sh-fbar' }, h('div', { class: 'sh-nbox' }, V.name, V.nameBtn), V.fx, V.bar), h('div', { class: 'sh-wrap' }, V.scroll, V.over), h('div', { class: 'sh-bottom' }, V.add, V.tabs));
  document.body.append(V.anchor, V.print = h('div', { id: 'sheetPrint', 'aria-hidden': 'true' }));
  // the sheet
  const sc = V.scroll;
  sc.addEventListener('pointerdown', onDown);
  sc.addEventListener('pointermove', onMove);
  sc.addEventListener('pointerup', onUp);
  sc.addEventListener('pointercancel', () => { cancelAnimationFrame(SCROLLER); if (DRAG && DRAG.line) DRAG.line.remove(); DRAG = null; });
  sc.addEventListener('dblclick', onDbl);
  sc.addEventListener('pointerleave', () => noteHover(null));
  // an image file dropped on the sheet: a picture where it fell
  sc.addEventListener('dragover', e => { if (WS && [...(e.dataTransfer.items || [])].some(i => i.kind === 'file' && /^image\//.test(i.type))) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  sc.addEventListener('drop', e => {
    const f = WS && [...(e.dataTransfer.files || [])].find(x => /^image\//.test(x.type));
    if (!f) return;
    e.preventDefault(); e.stopPropagation();
    const hh = hit(e);
    insertPicture(f, hh && hh.kind === 'cell' ? { r: hh.r, c: hh.c } : null);
  });
  sc.addEventListener('contextmenu', e => { if (!WS) return; e.preventDefault(); const ce = chartAt(e); if (ce) { CH.id = ce.dataset.id; renderSoon(); openChartMenu(e.clientX, e.clientY); return; } const hh = hit(e); if (hh && hh.kind === 'filt') return; openCellMenu(e.clientX, e.clientY); });
  sc.addEventListener('scroll', () => { renderSoon(); if (AC.box && !AC.box.hidden) requestAnimationFrame(acShow); }, { passive: true });
  sc.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey) || !WS) return; e.preventDefault(); setZoom(WS.zoom + (e.deltaY < 0 ? 10 : -10)); }, { passive: false });
  if (window.ResizeObserver) new ResizeObserver(() => renderSoon()).observe(sc);
  // the editor, and the keyboard's home when nothing is being written
  V.ed.addEventListener('input', () => { if (!ED.on) { TOUCHY = false; startEdit('enter', V.ed.value); return; } ED.point = null; edChanged(); });
  V.ed.addEventListener('compositionstart', () => { if (!ED.on) startEdit('enter', V.ed.value); });
  V.ed.addEventListener('keyup', e => { if (ED.on && /^(Arrow|Home|End)/.test(e.key)) acUpdate(); });
  V.ed.addEventListener('pointerup', () => { if (ED.on) acUpdate(); });
  V.ed.addEventListener('blur', () => { if (ED.on && ED.from === 'cell') setTimeout(() => { const a = document.activeElement; if (ED.on && ED.from === 'cell' && a !== V.ed && a !== V.bar && !(a && a.closest && a.closest('#pop,.modal,.sh-ac'))) endEdit(true); }, 0); });
  // the formula bar
  V.bar.addEventListener('focus', () => { if (!ED.on) startEdit('edit', null, 'bar'); else if (ED.from !== 'bar') { ED.from = 'bar'; ED.mode = 'edit'; } });
  V.bar.addEventListener('input', () => { if (!ED.on) startEdit('edit', V.bar.value, 'bar'); else { ED.point = null; edChanged(); } });
  V.bar.addEventListener('keyup', () => { if (ED.on) acUpdate(); });
  V.bar.addEventListener('blur', () => setTimeout(() => { const a = document.activeElement; if (ED.on && ED.from === 'bar' && a !== V.bar && a !== V.ed && !(a && a.closest && a.closest('#pop,.modal,.sh-ac'))) endEdit(true); }, 0));
  // the name box: an address (B7, A1:C9, or a sheet's name with one) takes you there, and so does a defined name; a
  // new name names the chosen cells
  V.name.addEventListener('focus', () => V.name.select());
  V.name.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); selInfo(); focusGrid(); return; }
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    nameBoxEnter();
  });
  V.name.addEventListener('blur', () => setTimeout(() => { if (WB && document.activeElement !== V.name) selInfo(); }, 0));
  V.nameBtn.addEventListener('click', () => nameBoxMenu(V.nameBtn));
  V.fx.addEventListener('click', () => fnDialog());
  // the sheet tabs: a click shows one, a double click renames it, dragging moves it, a right click has the rest
  V.add.addEventListener('click', () => addSheet(WB.sheets[WB.sheets.length - 1]));
  V.tabs.addEventListener('pointerdown', tabDown);
  V.tabs.addEventListener('dblclick', e => { const b = e.target.closest('.sh-tab'); if (b) renameSheet(WB.sheets[+b.dataset.i]); });
  V.tabs.addEventListener('contextmenu', e => { const b = e.target.closest('.sh-tab'); if (!b) return; e.preventDefault(); const s = WB.sheets[+b.dataset.i]; if (s !== WS) showSheet(s); openTabMenu(b, s); });
  V.font.addEventListener('change', () => { setLook('ff', V.font.value === DEF_FONT ? null : V.font.value); focusGrid(); });
  V.size.addEventListener('change', () => { setLook('fs', +V.size.value === DEF_FS ? null : +V.size.value); focusGrid(); });
  document.addEventListener('copy', e => onCopy(e, false));
  document.addEventListener('cut', e => onCopy(e, true));
  document.addEventListener('paste', onPaste);
  Object.assign(CMD, COMMANDS);
  // the tab chosen before these tabs existed is shown now
  if (SHEET_TABS.includes(S.tab)) selectTab(S.tab);
}
/* dragging a tab: the tabs move in their row; a short press without moving is a click */
function tabDown(e) {
  const b = e.target.closest('.sh-tab');
  if (!b || e.button !== 0) return;
  const i = +b.dataset.i, s = WB.sheets[i], x0 = e.clientX;
  let moved = false, to = i;
  const tabs = [...V.tabs.children];
  const mv = ev => {
    if (!moved && Math.abs(ev.clientX - x0) < 6) return;
    moved = true; b.classList.add('drag');
    to = i;
    tabs.forEach((t, j) => { t.classList.remove('drop-a', 'drop-b'); const r = t.getBoundingClientRect(); if (ev.clientX >= r.left && ev.clientX <= r.right) to = j; });
    if (to !== i && tabs[to]) tabs[to].classList.add((to > i) === (getComputedStyle(V.tabs).direction === 'rtl') ? 'drop-a' : 'drop-b');
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    tabs.forEach(t => t.classList.remove('drag', 'drop-a', 'drop-b'));
    if (moved && to !== i) moveSheet(s, to);
    else if (!moved && s !== WS) showSheet(s);
    else focusGrid();
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
function renderTabs() {
  if (!V.tabs) return;
  const box = V.tabs;
  box.textContent = '';
  WB.sheets.forEach((s, i) => box.append(h('button', { class: 'sh-tab' + (s === WS ? ' on' : '') + (s.tab ? ' col' : ''), type: 'button', role: 'tab', 'aria-selected': String(s === WS), 'data-i': i, title: s.name, style: s.tab ? { '--tc': s.tab } : null }, h('span', { dir: 'auto', text: s.name }))));
  const cur = box.querySelector('.on');
  if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/* --- menus --- */
function menuItems(items) {
  return items.filter(Boolean).map(it => it === '-' ? h('div', { class: 'sh-fsep' }) : h('button', { class: 'mi' + (it.danger ? ' danger' : ''), type: 'button', disabled: it.off || null, onclick: () => { closePopover(); it.run(); if (!it.keep) focusGrid(); } },
    icon(it.ic || 'chevron_right'), h('span', { text: it.label }), it.sample ? h('span', { class: 'sh-sample', text: it.sample }) : it.key ? h('small', { text: it.key }) : null));
}
function menuAt(anchor, title, items) { openPop(anchor, h('div', { class: 'menu' }, title ? h('div', { class: 'pop-t', text: title }) : null, menuItems(items))); }
function menuAtPoint(x, y, items) {
  V.anchor.style.left = x + 'px'; V.anchor.style.top = y + 'px';
  menuAt(V.anchor, null, items);
}
function insertItems() {
  const g = selG(), rtl = WS.dir === 'rtl';
  return [
    { ic: 'add_row_above', label: T('שורות מעל'), run: () => insertRows('before'), off: wholeCols(g) },
    { ic: 'add_row_below', label: T('שורות מתחת'), run: () => insertRows('after'), off: wholeCols(g) },
    { ic: rtl ? 'add_column_right' : 'add_column_left', label: rtl ? T('עמודות מימין') : T('עמודות משמאל'), run: () => insertCols('before'), off: wholeRows(g) },
    { ic: rtl ? 'add_column_left' : 'add_column_right', label: rtl ? T('עמודות משמאל') : T('עמודות מימין'), run: () => insertCols('after'), off: wholeRows(g) },
    '-', { ic: 'tab', label: T('גיליון חדש'), run: () => addSheet() },
  ];
}
function deleteItems() {
  const g = selG();
  return [{ ic: 'table_rows', label: T('מחיקת שורות'), run: deleteRows, off: wholeCols(g) && !wholeRows(g), danger: true }, { ic: 'view_column', label: T('מחיקת עמודות'), run: deleteCols, off: wholeRows(g) && !wholeCols(g), danger: true }, '-', { ic: 'delete', label: T('מחיקת הגיליון'), run: () => deleteSheet(), danger: true }];
}
function sizeItems() {
  const g = selG(), cols = !wholeRows(g) || wholeCols(g), rows = !wholeCols(g) || wholeRows(g);
  const cl = usedPart(g);
  return [
    cols && { ic: 'width', label: T('רוחב עמודה…'), run: async () => { const v = await promptBox(T('רוחב עמודה'), T('רוחב בפיקסלים'), String(Math.round(colW(SEL.c) / Z))); if (v != null && +v > 0) setSizes('c', span(cl.c1, cl.c2), clamp(Math.round(+v), 4, 2000)); } },
    rows && { ic: 'height', label: T('גובה שורה…'), run: async () => { const v = await promptBox(T('גובה שורה'), T('גובה בפיקסלים'), String(Math.round(rowH(SEL.r) / Z))); if (v != null && +v > 0) setSizes('r', span(cl.r1, cl.r2), clamp(Math.round(+v), 6, 800)); } },
    cols && { ic: 'width', label: T('רוחב שמתאים לתוכן'), run: () => autoFit('c', SEL.c) },
    '-',
    cols && { ic: 'visibility_off', label: T('הסתרת עמודות'), run: () => setSizes('c', span(cl.c1, cl.c2), 0) },
    rows && { ic: 'visibility_off', label: T('הסתרת שורות'), run: () => setSizes('r', span(cl.r1, cl.r2), 0) },
    { ic: 'visibility', label: T('הצגת מה שמוסתר'), run: unhideSel },
  ];
}
function unhideSel() {
  const g = selG();
  edit(() => {
    if (WS.hc.size && (wholeCols(g) || !wholeRows(g))) setProp(WS, 'hc', new Set([...WS.hc].filter(c => c < g.c1 - 1 || c > g.c2 + 1 || (!wholeCols(g) && !wholeRows(g) && (c < g.c1 || c > g.c2)))));
    if (WS.hr.size && (wholeRows(g) || !wholeCols(g))) setProp(WS, 'hr', new Set([...WS.hr].filter(r => r < g.r1 - 1 || r > g.r2 + 1 || (!wholeCols(g) && !wholeRows(g) && (r < g.r1 || r > g.r2)))));
  });
}
function openCellMenu(x, y) {
  const g = selG(), cols = wholeCols(g) && !wholeRows(g), rows = wholeRows(g) && !wholeCols(g);
  menuAtPoint(x, y, [
    { ic: 'content_cut', label: T('גזירה'), key: 'Ctrl+X', run: () => copyButton(true) },
    { ic: 'content_copy', label: T('העתקה'), key: 'Ctrl+C', run: () => copyButton(false) },
    { ic: 'content_paste', label: T('הדבקה'), key: 'Ctrl+V', run: () => pasteButton('all') },
    { ic: 'tag', label: T('הדבקת ערכים בלבד'), key: 'Ctrl+Shift+V', run: () => pasteButton('v') },
    { ic: 'format_paint', label: T('הדבקת עיצוב בלבד'), run: () => pasteButton('f') },
    '-',
    !cols && { ic: 'add_row_above', label: T('הוספת שורות מעל'), run: () => insertRows('before') },
    !rows && { ic: WS.dir === 'rtl' ? 'add_column_right' : 'add_column_left', label: WS.dir === 'rtl' ? T('הוספת עמודות מימין') : T('הוספת עמודות משמאל'), run: () => insertCols('before') },
    !cols && { ic: 'table_rows', label: T('מחיקת שורות'), run: deleteRows },
    !rows && { ic: 'view_column', label: T('מחיקת עמודות'), run: deleteCols },
    { ic: 'ink_eraser', label: T('ניקוי התוכן'), key: 'Delete', run: () => clearSel('v') },
    '-',
    (() => { const x = cellAt(WS, SEL.r, SEL.c); return { ic: 'sticky_note_2', label: x && x.n ? T('עריכת הערה') : T('הוספת הערה'), key: 'Shift+F2', run: () => noteEdit() }; })(),
    notesIn(g) && { ic: 'speaker_notes_off', label: T('מחיקת הערה'), run: deleteNotes },
    (() => { const l = linkAt(WS, SEL.r, SEL.c); return { ic: 'link', label: l && cellAt(WS, SEL.r, SEL.c).k ? T('עריכת קישור') + '…' : T('קישור') + '…', key: 'Ctrl+K', run: () => linkDialog() }; })(),
    linkAt(WS, SEL.r, SEL.c) && { ic: 'open_in_new', label: T('פתיחת הקישור'), run: () => followLink(linkAt(WS, SEL.r, SEL.c)) },
    linksIn(g) && { ic: 'link_off', label: T('הסרת קישור'), run: removeLinks },
    '-',
    { ic: 'arrow_upward', label: T('מיון מהקטן לגדול'), run: () => quickSort(false) },
    { ic: 'arrow_downward', label: T('מיון מהגדול לקטן'), run: () => quickSort(true) },
    { ic: 'filter_alt', label: WS.af ? T('הסרת הסינון') : T('סינון'), run: toggleFilter },
    { ic: 'bar_chart', label: T('גרף מהתאים האלה'), run: () => insertChart('col') },
    '-',
    ...sizeItems().filter(it => it && it !== '-'),
  ]);
}
function openTabMenu(anchor, s) {
  const i = WB.sheets.indexOf(s), rtl = getComputedStyle(V.tabs).direction === 'rtl';
  const pick = c => setTabColor(s, c);
  openPop(anchor, h('div', { class: 'menu' }, menuItems([
    { ic: 'add', label: T('גיליון חדש'), run: () => addSheet(s) },
    { ic: 'edit', label: T('שינוי שם'), run: () => renameSheet(s) },
    { ic: 'content_copy', label: T('שכפול'), run: () => dupSheet(s) },
    { ic: rtl ? 'arrow_forward' : 'arrow_back', label: rtl ? T('הזזה ימינה') : T('הזזה שמאלה'), run: () => moveSheet(s, i - 1), off: i === 0 },
    { ic: rtl ? 'arrow_back' : 'arrow_forward', label: rtl ? T('הזזה שמאלה') : T('הזזה ימינה'), run: () => moveSheet(s, i + 1), off: i === WB.sheets.length - 1 },
    { ic: 'delete', label: T('מחיקה'), run: () => deleteSheet(s), danger: true, off: WB.sheets.length < 2 },
  ]), h('div', { class: 'pop-t sub', text: T('צבע הלשונית') }), deckSwatches(s.tab, TAB_COLORS, pick, T('בלי צבע'))));
}
const TAB_COLORS = [['#cf3727', N_('אדום')], ['#d9701a', N_('כתום')], ['#e5b300', N_('צהוב')], ['#1d8249', N_('ירוק')], ['#0e8a8c', N_('טורקיז')], ['#2743d8', N_('כחול')], ['#7a3fc9', N_('סגול')], ['#c2388a', N_('ורוד')], ['#5a6580', N_('אפור')]].map(([c, n]) => [c, T(n)]);
const FILL_COLORS = [['#ffff00', N_('צהוב')], ['#fff2cc', N_('צהוב בהיר')], ['#fce4d6', N_('כתום בהיר')], ['#f8cbad', N_('אפרסק')], ['#ffc7ce', N_('ורוד')], ['#e2efda', N_('ירוק בהיר')], ['#c6efce', N_('ירוק')], ['#ddebf7', N_('תכלת')], ['#bdd7ee', N_('כחול בהיר')], ['#e4dfec', N_('סגול בהיר')], ['#ededed', N_('אפור בהיר')], ['#d9d9d9', N_('אפור')],
  ['#1d8249', N_('ירוק כהה')], ['#2743d8', N_('כחול כהה')], ['#cf3727', N_('אדום')], ['#7a3fc9', N_('סגול')], ['#404040', N_('אפור כהה')], ['#000000', N_('שחור')]].map(([c, n]) => [c, T(n)]);
function colorMenu(anchor, kind) {
  const fill = kind === 'bg', cur = (lookAt(WS, SEL.r, SEL.c) || {})[kind] || null;
  const pick = c => { PREFS[fill ? 'shFill' : 'shColor'] = c; savePrefs(); barColors(); setLook(kind, c); focusGrid(); };
  openPop(anchor, h('div', {}, h('div', { class: 'pop-t', text: fill ? T('צבע רקע לתא') : T('צבע הטקסט') }),
    deckSwatches(cur, fill ? FILL_COLORS : TEXT_COLORS, pick, fill ? T('בלי צבע רקע') : T('אוטומטי (שחור)')), customColor(pick)));
}
function barColors() {
  const c = PREFS.shColor || '#cf3727', f = PREFS.shFill || '#ffff00';
  const a = $('#shColorBar'), b = $('#shFillBar');
  if (a) a.style.setProperty('--c', c);
  if (b) b.style.setProperty('--c', f);
}
function borderMenu(anchor) {
  const p = bdPref();
  const it = (k, ic, label) => ({ ic, label, run: () => setBorders(k) });
  const kinds = [['1s', T('דק')], ['2s', T('בינוני')], ['3s', T('עבה')], ['1d', T('מקווקו')], ['1o', T('מנוקד')]];
  const styleRow = h('div', { class: 'sh-bdrow' }, kinds.map(([k, name]) => h('button', { class: 'opt' + (p.k === k ? ' on' : ''), type: 'button', title: name, 'aria-label': name,
    onclick: () => { PREFS.shBd = { ...p, k }; savePrefs(); closePopover(); borderMenu(anchor); } }, h('i', { style: { borderTopWidth: (+k[0] + 0.5) + 'px', borderTopStyle: BD_CSS[k[1]] } }))));
  const colorRow = h('div', { class: 'sh-bdrow' }, deckSwatches(p.c, TEXT_COLORS.slice(0, 11), c => { PREFS.shBd = { ...p, c }; savePrefs(); borderMenu(anchor); }, null));
  openPop(anchor, h('div', { class: 'menu' }, h('div', { class: 'pop-t', text: T('גבולות') }), menuItems([
    it('all', 'border_all', T('כל הגבולות')), it('outer', 'border_outer', T('גבולות חיצוניים')), it('thick', 'border_outer', T('גבול חיצוני עבה')), it('inner', 'border_inner', T('גבולות פנימיים')),
    it('bottom', 'border_bottom', T('גבול תחתון')), it('top', 'border_top', T('גבול עליון')), it('right', 'border_right', T('גבול ימני')), it('left', 'border_left', T('גבול שמאלי')), it('double', 'border_bottom', T('גבול תחתון כפול')),
    it('none', 'border_clear', T('בלי גבולות')),
  ]), h('div', { class: 'pop-t sub', text: T('סוג קו') }), styleRow, h('div', { class: 'pop-t sub', text: T('צבע קו') }), colorRow));
}
function nfMenu(anchor) {
  const x = cellAt(WS, SEL.r, SEL.c), v = x && typeof x.v === 'number' ? x.v : 1234.5, d = x && typeof x.v === 'number' ? x.v : todaySerial() + 0.6;
  const sample = nf => { const r = nf ? fmtNumber(nf === 'text' ? v : (nf === DATE_NF || nf === LDATE_NF || nf === TIME_NF ? d : v), nf).t : genText(v); return r || ''; };
  menuAt(anchor, T('תבנית המספרים'), [
    { ic: 'text_fields', label: T('כללי'), sample: sample(null), run: () => setNf(null) },
    { ic: 'tag', label: T('מספר'), sample: sample(NUM_NF), run: () => setNf(NUM_NF) },
    { ic: 'payments', label: T('מטבע'), sample: sample(NF_OF.cur), run: () => setNf(NF_OF.cur) },
    { ic: 'percent', label: T('אחוזים'), sample: sample('0.00%'), run: () => setNf('0.00%') },
    { ic: 'calendar_today', label: T('תאריך קצר'), sample: sample(DATE_NF), run: () => setNf(DATE_NF) },
    { ic: 'event', label: T('תאריך ארוך'), sample: sample(LDATE_NF), run: () => setNf(LDATE_NF) },
    { ic: 'schedule', label: T('שעה'), sample: sample(TIME_NF), run: () => setNf(TIME_NF) },
    { ic: 'abc', label: T('טקסט'), sample: 'abc', run: () => setNf('@') },
    '-',
    { ic: 'edit', label: T('תבנית מותאמת…'), run: async () => {
      const cur = (lookAt(WS, SEL.r, SEL.c) || {}).nf || '0.00';
      const v2 = await promptBox(T('תבנית מספרים'), T('קוד כמו באקסל, למשל 0.00 או #,##0 "₪" או dd/mm/yyyy'), cur);
      if (v2 != null) setNf(v2.trim() && v2.trim().toLowerCase() !== 'general' ? v2.trim().slice(0, 200) : null);
    } },
  ]);
}
function curMenu(anchor) {
  menuAt(anchor, T('מטבע'), CURS.map(sym => ({ ic: 'payments', label: sym, sample: fmtNumber(1234.5, curNf(sym)).t, run: () => setNf(curNf(sym)) })));
}
function sumMenu(anchor) {
  menuAt(anchor, null, [...['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN'].map(fn => ({ ic: 'functions', label: fn, sample: fnDesc(fn), run: () => autoSum(fn), keep: true })),
    '-', { ic: 'function', label: T('עוד פונקציות…'), run: () => fnDialog(), keep: true }]);
}
/* one kind of functions (the ribbon's buttons), each with what it does */
function fnCatMenu(cat, anchor) {
  if (ED.on && taOf().value[0] !== '=') endEdit(true);
  const k = FN_CATS.find(x => x[0] === cat);
  menuAt(anchor, k ? T(k[1]) : null, FN_LIST.filter(fn => FN_INFO[fn][0] === cat).map(fn => ({ ic: 'function', label: fn, sample: fnDesc(fn), run: () => insertFn(fn), keep: true })));
}
/* every function, like Excel's Insert Function: a search (by name or by what it does), the kinds, and the chosen
   function's arguments and example */
function fnDialog() {
  if (ED.on && taOf().value[0] !== '=' && !endEdit(true)) return;
  const q = h('input', { class: 'field', type: 'search', autocomplete: 'off', spellcheck: 'false', placeholder: T('חיפוש: שם של פונקציה, או מה היא עושה') });
  const cat = h('select', { class: 'sel', 'aria-label': T('סוג') }, h('option', { value: '', text: T('כל הסוגים') }), FN_CATS.map(([k, n]) => h('option', { value: k, text: T(n) })));
  const list = h('div', { class: 'sh-fnlist', role: 'listbox', tabindex: '0' }), about = h('div', { class: 'sh-fnabout' });
  let shown = [], pick = null;
  const norm = t => t.toLowerCase().normalize('NFKD').replace(/[\u0591-\u05c7\u0300-\u036f]/g, '');
  const show = () => {
    about.textContent = '';
    if (!pick) return;
    const args = fnArgs(pick);
    about.append(h('div', { class: 'sh-fnsig', dir: 'ltr' }, h('b', { text: pick }), '(', ...args.flatMap((p, i) => [i ? ', ' : '', h('span', { dir: 'auto', text: p })]), ')'),
      h('p', { text: fnDesc(pick) }), h('p', { class: 'muted small' }, T('דוגמה:') + ' ', h('code', { dir: 'ltr', text: '=' + FN_INFO[pick][3] })));
  };
  const fill = () => {
    const t = norm(q.value.trim()), k = cat.value;
    const kind = fn => { const c = FN_CATS.find(x => x[0] === FN_INFO[fn][0]); return c ? T(c[1]) : ''; };
    // every word of the search in the name, in what it does, or in its kind ("תאריך" finds the date functions)
    shown = FN_LIST.filter(fn => (!k || FN_INFO[fn][0] === k) && (!t || t.split(/\s+/).every(w => (fn + ' ' + norm(fnDesc(fn)) + ' ' + norm(kind(fn))).toLowerCase().includes(w))));
    if (t) shown.sort((x, y) => (y.toLowerCase().startsWith(t) ? 1 : 0) - (x.toLowerCase().startsWith(t) ? 1 : 0));
    if (!shown.includes(pick)) pick = shown[0] || null;
    list.textContent = '';
    for (const fn of shown) list.append(h('div', { class: 'sh-aci' + (fn === pick ? ' on' : ''), role: 'option', 'aria-selected': String(fn === pick), onclick: () => { pick = fn; fill(); }, ondblclick: () => { pick = fn; done(); } },
      h('b', { text: fn, dir: 'ltr' }), h('span', { text: fnDesc(fn) })));
    if (!shown.length) list.append(h('div', { class: 'muted small', style: { padding: '8px' }, text: T('לא נמצאה פונקציה כזאת') }));
    const on = list.querySelector('.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
    show();
  };
  let close = null;
  const done = () => { if (!pick) return false; const fn = pick; if (close) close(); insertFn(fn); return true; };
  q.addEventListener('input', fill);
  cat.addEventListener('change', fill);
  const keys = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const i = shown.indexOf(pick) + (e.key === 'ArrowDown' ? 1 : -1); if (shown[i]) { pick = shown[i]; fill(); } }
    else if (e.key === 'Enter') { e.preventDefault(); done(); }
  };
  q.addEventListener('keydown', keys); list.addEventListener('keydown', keys);
  fill();
  const m = modal({ title: T('הוספת פונקציה'), wide: true, body: h('div', { class: 'sh-fndlg' }, h('div', { class: 'sh-fnbar' }, q, cat), list, about),
    actions: [{ label: T('הוספה'), kind: 'primary', run: () => { if (!pick) return false; const fn = pick; setTimeout(() => insertFn(fn)); } }, { label: T('ביטול'), value: false }], onClose: () => { if (!ED.on) focusGrid(); } });
  close = () => m.close(true);
}
function sortMenu(anchor) {
  menuAt(anchor, null, [
    { ic: 'arrow_upward', label: T('מיון מהקטן לגדול'), run: () => quickSort(false) },
    { ic: 'arrow_downward', label: T('מיון מהגדול לקטן'), run: () => quickSort(true) },
    { ic: 'sort', label: T('מיון מותאם…'), run: sortDialog, keep: true },
    '-',
    { ic: 'filter_alt', label: WS.af ? T('הסרת הסינון') : T('סינון'), key: 'Ctrl+Shift+L', run: toggleFilter },
    { ic: 'filter_alt_off', label: T('ניקוי הסינון'), run: clearFilter, off: !WS.af },
  ]);
}
function clearMenu(anchor) {
  menuAt(anchor, T('ניקוי'), [
    { ic: 'ink_eraser', label: T('ניקוי התוכן'), key: 'Delete', run: () => clearSel('v') },
    { ic: 'format_clear', label: T('ניקוי העיצוב'), run: () => clearSel('f') },
    { ic: 'delete_sweep', label: T('ניקוי הכל'), run: () => clearSel('a') },
  ]);
}
function freezeMenu(anchor) {
  menuAt(anchor, T('הקפאה'), [
    { ic: 'ac_unit', label: T('הקפאת השורה העליונה'), run: () => freeze('row') },
    { ic: 'ac_unit', label: T('הקפאת העמודה הראשונה'), run: () => freeze('col') },
    { ic: 'ac_unit', label: T('הקפאה עד התא הנבחר'), run: () => freeze('sel') },
    { ic: 'close', label: T('ביטול ההקפאה'), run: () => freeze('none'), off: !WS.fr && !WS.fc },
  ]);
}
function formulaHelp() {
  const ex = (code, what) => h('p', {}, h('code', { text: code }), ' — ', what);
  modal({ title: T('איך כותבים נוסחה'), wide: true, body: h('div', { class: 'sh-help' },
    h('p', { text: T('נוסחה מתחילה תמיד ב-= . אחרי ה-= כותבים חשבון, כתובות של תאים ופונקציות, ולוחצים Enter. התא מראה את התוצאה, ושורת הנוסחאות למעלה מראה את הנוסחה עצמה.') }),
    h('h4', { text: T('חשבון') }), ex('=5+3*2', T('חיבור, חיסור (-), כפל (*), חילוק (/) וחזקה (^), כמו במחשבון')),
    h('h4', { text: T('תאים') }), ex('=B2*C2', T('כתובת של תא היא אות של עמודה ומספר של שורה. במקום להקליד אותה, אפשר ללחוץ על התא בזמן שכותבים')),
    ex('=SUM(B2:B10)', T('טווח: כל התאים בין שני התאים, עם נקודתיים ביניהם')),
    h('h4', { text: T('פונקציות') }), ...['SUM', 'AVERAGE', 'IF', 'COUNTIF', 'SUMIF', 'IFERROR', 'XLOOKUP', 'VLOOKUP', 'ROUND', 'TODAY', 'TEXT'].map(fn => ex('=' + FN_INFO[fn][3], fnDesc(fn))),
    h('p', { text: T('יש כאן עוד הרבה פונקציות, כמו באקסל. הכפתור fx שליד שורת הנוסחאות מציג את כולן, עם חיפוש ועם דוגמה לכל אחת.') }),
    h('h4', { text: T('תוצאות שנשפכות לתאים') }), ex('=SORT(A2:B20,2,-1)', T('פונקציות כמו SORT, FILTER ו-UNIQUE מחזירות כמה ערכים, והם ממלאים לבד את התאים שמתחת ולצד הנוסחה. אם יש שם כבר משהו, מופיע #SPILL!')),
    h('h4', { text: T('שמות מוגדרים') }), ex('=SUM(' + T('מחירים@name') + ')', T('אפשר לתת שם לטווח של תאים: בוחרים אותו, כותבים שם בתיבה שליד שורת הנוסחאות ולוחצים Enter. אחר כך כותבים את השם בנוסחאות במקום הכתובת. כל השמות נמצאים בלשונית "נוסחאות", במנהל השמות.')),
    ex('=INDIRECT(A2)', T('הופך טקסט שכתוב בתא (כתובת או שם מוגדר) לתאים עצמם. כך בונים רשימה נפתחת שתלויה ברשימה אחרת.')),
    h('h4', { text: T('טיפים') }),
    h('p', { text: T('כשמשנים מספר, כל הנוסחאות שמשתמשות בו מתעדכנות לבד. גוררים את הריבוע הקטן בפינת התא כדי להעתיק נוסחה לתאים שליד, והכתובות בה זזות איתה. $ לפני אות או מספר (כמו $B$2) משאיר אותם קבועים; F4 מוסיף אותו.') }),
    h('p', { text: T('שגיאות כמו באקסל: #DIV/0! חילוק באפס, #VALUE! חשבון עם טקסט, #REF! תא שנמחק, #NAME? פונקציה שלא קיימת כאן, #N/A ערך שלא נמצא בחיפוש, #SPILL! אין מקום לתוצאות שנשפכות.') })),
    actions: [{ label: T('הבנתי'), kind: 'primary' }], onClose: () => focusGrid() });
}
/* --- defined names on screen: the name box beside the formula bar (a name typed there names the chosen cells, or goes
   to the cells of a name that is there), the Name Manager (Formulas tab, Ctrl+F3) where each change is its own step
   for undo, and a name's own window --- */
/* the names a formula on sheet s can use: the sheet's own, and the workbook's that the sheet has no name of its own for */
function namesFor(s) {
  const all = WB.names || NO_NAMES, own = new Set();
  for (const x of all) if (x.s === s.id) own.add(x.n.toLowerCase());
  return all.filter(x => !x.h && (x.s === s.id || (!x.s && !own.has(x.n.toLowerCase())))).sort((a, b) => COLL.compare(a.n, b.n));
}
/* the name whose cells are exactly range g of sheet s: the name box shows it in place of the address, as Excel's does */
const NBX = { a: null, m: null };
function nameAt(s, g) {
  const a = WB.names || NO_NAMES;
  if (!a.length) return null;
  if (NBX.a !== a) {
    NBX.a = a; NBX.m = new Map();
    for (const x of a) { const c = x.h ? null : nameCells(x); if (c && c.fixed && (!x.s || x.s === c.s.id)) { const k = c.s.id + '|' + rangeA1(c.g); if (x.s || !NBX.m.has(k)) NBX.m.set(k, x); } }
  }
  return NBX.m.get(s.id + '|' + rangeA1(g)) || null;
}
function goToName(x) {
  const c = nameCells(x);
  if (!c) { toast(T('השם {0} הוא לא טווח של תאים, אז אין לאן לעבור', x.n)); return; }
  if (c.s !== WS) showSheet(c.s);
  selectRange(c.g);
  scrollToCell(c.g.r1, c.g.c1);
  focusGrid();
}
/* what was typed into the name box: an address goes there, a name that is there goes to its cells, and a new name is
   given to the chosen cells */
/* where a text points in the workbook: B7, A1:C9, 'Sheet 2'!B7, or a defined name (the name box, and links) */
function placeOf(t) {
  let s = WS, sheet = null;
  const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(t);
  if (m) { sheet = (m[1] ?? m[2]).replace(/''/g, "'"); const n = sheet.toLowerCase(); s = WB.sheets.find(x => x.name.toLowerCase() === n); t = m[3]; }
  const g = s ? parseRange(t) : null, nm = !g && s && NAME_RE.test(t) ? nameOf({ n: t, sheet }, WS) : null;
  return { s, sheet, t, g, nm };
}
function goPlace(p) {
  if (p.g) { if (p.s !== WS) showSheet(p.s); selectRange(p.g); scrollToCell(p.g.r1, p.g.c1); focusGrid(); return true; }
  if (p.nm) { goToName(p.nm); return true; }
  return false;
}
function nameBoxEnter() {
  const p = placeOf(V.name.value.trim()), { s, sheet, t } = p;
  if (goPlace(p)) return;
  const why = !s ? T('אין גיליון בשם הזה') : sheet != null ? T('זו לא כתובת של תא. למשל: B7 או A1:C9') : nameProblem(t);
  if (why) { toast(why, { icon: 'error', ms: 6000 }); V.name.select(); return; }
  const cells = selG();
  edit(() => setNames([...(WB.names || NO_NAMES), { n: t, f: nameRefText(WS, cells) }]));
  toast(T('השם {0} ניתן לתאים {1}', t, rangeA1(cells)), { icon: 'label' });
  focusGrid();
}
function nameBoxMenu(anchor) {
  if (ED.on && !endEdit(true)) return;
  const names = namesFor(WS);
  menuAt(anchor, T('שמות מוגדרים'), [...names.map(x => ({ ic: 'label', label: x.n, sample: nameCells(x) ? rangeA1(nameCells(x).g) : '', run: () => goToName(x), keep: true })), names.length ? '-' : null,
    { ic: 'new_label', label: T('שם לתאים שנבחרו…'), run: () => nameDialog(null), keep: true }, { ic: 'style', label: T('יצירת שמות מהבחירה') + '…', key: 'Ctrl+Shift+F3', run: () => namesFromSelection(), keep: true },
    { ic: 'sell', label: T('מנהל השמות…'), key: 'Ctrl+F3', run: () => nameManager(), keep: true }]);
}
/* a name into the formula being written (or a new formula) */
function insertName(n) {
  if (!ED.on) { startEdit('enter', '=' + n); const ta = taOf(), k = ta.value.length; ta.setSelectionRange(k, k); edChanged(); return; }
  const ta = taOf();
  ta.setRangeText((ta.value ? '' : '=') + n, ta.selectionStart, ta.selectionEnd, 'end');
  if (ta.value[0] !== '=') ta.value = '=' + ta.value;
  ED.point = null;
  edChanged();
  ta.focus();
}
function nameUseMenu(anchor) {
  if (ED.on && taOf().value[0] !== '=' && !endEdit(true)) return;
  const s = (ED.on && WB.sheets.find(x => x.id === ED.sid)) || WS, names = namesFor(s);
  menuAt(anchor, T('שימוש בנוסחה'), [...names.map(x => ({ ic: 'label', label: x.n, sample: '=' + (x.f.length > 28 ? x.f.slice(0, 27) + '…' : x.f), run: () => insertName(x.n), keep: true })),
    names.length ? null : { ic: 'info', label: T('עוד אין שמות מוגדרים'), off: true, run: () => {} }, '-', { ic: 'sell', label: T('מנהל השמות…'), key: 'Ctrl+F3', run: () => nameManager(), keep: true }]);
}
/* what a name is worth now, in a few words, as Excel's Name Manager shows it: a number, a text, or its first cells in { } */
function nameShows(x) {
  const s = (x.s && WB.sheets.find(y => y.id === x.s)) || WS, keep = [CTX, AX, OFF];
  CTX = { si: WB.sheets.indexOf(s), r: SEL.r, c: SEL.c, dyn: false }; AX = true; OFF = null;
  let v;
  try { v = nameVal({ n: x.n, sheet: x.s ? s.name : null }, true); } catch (e) { v = e instanceof Err ? e : E_VAL; } finally { [CTX, AX, OFF] = keep; }
  const word = y => y == null ? '' : isErr(y) ? y.c : typeof y === 'string' ? '"' + y + '"' : typeof y === 'boolean' ? (y ? 'TRUE' : 'FALSE') : genText(y, 11);
  if (isLam(v)) return T('פונקציה ({0})', (v.params || []).map(p => p.opt ? '[' + p.s + ']' : p.s).join(', '));   // a LAMBDA: what it takes
  if (!isA(v)) return word(v);
  const [h, w] = dims(v), A = toArr(v.rng ? { rng: true, s: v.s, g: { r1: v.g.r1, c1: v.g.c1, r2: Math.min(v.g.r2, v.g.r1 + 3), c2: Math.min(v.g.c2, v.g.c1 + 3) } } : v);
  if (isErr(A)) return A.c;
  if (h * w === 1) return word(A.d[0]);
  const rows = [];
  for (let i = 0; i < Math.min(A.h, 4); i++) rows.push(Array.from({ length: Math.min(A.w, 4) }, (_, j) => word(A.d[i * A.w + j])).join(','));
  return '{' + rows.join(';') + (h > 4 || w > 4 ? '…' : '') + '}';
}
/* a name suggested for the chosen cells: the text above them, or beside them (their heading), as Excel suggests */
function guessName() {
  const g = selG(), tries = [[g.r1 - 1, g.c1], [g.r1, g.c1 - 1]];
  for (const [r, c] of tries) {
    const v = r >= 0 && c >= 0 ? valAt(WS, r, c) : null, n = typeof v === 'string' ? v.trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_.]/gu, '').slice(0, 60) : '';
    if (n && !nameProblem(n) && !nameOf({ n, sheet: null }, null)) return n;
  }
  return '';
}
/* a name's own window: a new name (for the chosen cells), or one that is there. Its scope can't change later, as in Excel */
function nameDialog(x0, done) {
  if (ED.on && !endEdit(true)) return;
  const fld = (label, ...kids) => h('label', { class: 'fld' }, h('span', { text: label }), ...kids);
  const name = h('input', { class: 'field', dir: 'auto', value: x0 ? x0.n : guessName(), maxlength: '255', spellcheck: 'false', autocomplete: 'off', 'aria-label': T('שם'), autofocus: true });
  const scope = h('select', { class: 'field', 'aria-label': T('היקף') }, h('option', { value: '', text: T('כל חוברת העבודה') }), WB.sheets.map(s => h('option', { value: s.id, text: T('רק הגיליון {0}', s.name) })));
  scope.value = (x0 && x0.s) || ''; scope.disabled = !!x0;
  const note = h('input', { class: 'field', dir: 'auto', value: (x0 && x0.c) || '', maxlength: '255', autocomplete: 'off', 'aria-label': T('הערה') });
  const ref = h('input', { class: 'field', dir: 'ltr', value: '=' + (x0 ? x0.f : nameRefText(WS, selG())), spellcheck: 'false', autocomplete: 'off', 'aria-label': T('מתייחס אל') });
  const err = h('p', { class: 'sh-ch-err', role: 'alert', hidden: true });
  const fail = t => { err.textContent = t; err.hidden = false; return false; };
  const apply = () => {
    const n = name.value.trim(), why = nameProblem(n), sc = scope.value || null, sh = sc ? WB.sheets.find(s => s.id === sc) : null, all = WB.names || NO_NAMES;
    if (why) return fail(why);
    if (all.some(y => y !== x0 && (y.s || '') === (sc || '') && y.n.toLowerCase() === n.toLowerCase())) return fail(T('כבר יש שם כזה. אפשר לבחור שם אחר, או לערוך את השם הקיים.'));
    const src = nameFormulaIn(ref.value, sh || WS);
    if (src.err) return fail(src.err);
    const o = { n, f: src.f, ...(sc ? { s: sc } : {}), ...(note.value.trim() ? { c: note.value.trim().slice(0, 255) } : {}), ...(x0 && x0.h ? { h: true } : {}) };
    edit(() => {
      const rest = x0 && x0.n !== n ? renameName(x0, n) : all;   // the formulas that used the old letters say the new ones
      setNames(x0 ? rest.map(y => y === x0 ? o : y) : [...rest, o]);
    });
    if (done) done(nameKey(o));
    return true;
  };
  const m = modal({ title: x0 ? T('עריכת שם') : T('שם חדש'), body: h('div', { class: 'sh-nmd' }, fld(T('שם'), name), fld(T('היקף'), scope), fld(T('מתייחס אל'), ref), fld(T('הערה'), note),
    h('p', { class: 'muted small', text: T('שם מתייחס לטווח של תאים, למספר או לנוסחה. אחר כך כותבים אותו בנוסחאות במקום הכתובת, או כמקור של רשימה נפתחת.') }), err),
    actions: [{ label: T('אישור'), kind: 'primary', run: apply }, { label: T('ביטול'), value: false }], onClose: () => { if (!MODALS.length) focusGrid(); } });
  for (const i of [name, note, ref]) i.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); if (apply()) m.close(true); } });
}
/* names for the chosen cells from the labels at their sides (Formulas tab, Ctrl+Shift+F3), as Excel's Create from
   Selection. The window opens with the sides Excel would pick by itself, and shows the names before it makes them */
function namesFromSelection() {
  if (ED.on && !endEdit(true)) return;
  const g = selG(), rtl = WS.dir === 'rtl';
  if (g.r1 === g.r2 && g.c1 === g.c2) { toast(T('בוחרים קודם את הכותרות יחד עם התאים שלידן, ואז יוצרים מהן שמות'), { icon: 'info', ms: 6000 }); return; }
  const first = labelSides(WS, g);
  const check = (text, on) => { const i = h('input', { type: 'checkbox' }); i.checked = !!on; return [h('label', { class: 'check' }, i, h('span', { text })), i]; };
  const [tL, t] = check(T('בשורה העליונה'), first.t), [lL, l] = check(rtl ? T('בעמודה הימנית') : T('בעמודה השמאלית'), first.l);
  const [bL, b] = check(T('בשורה התחתונה'), first.b), [eL, e] = check(rtl ? T('בעמודה השמאלית') : T('בעמודה הימנית'), first.e);
  const list = h('div', { class: 'sh-nmm-list', 'aria-label': T('השמות שייווצרו:') }), err = h('p', { class: 'sh-ch-err', role: 'alert' });
  let found = [];
  const draw = () => {
    const any = t.checked || l.checked || b.checked || e.checked;
    found = labelNames(WS, g, { t: t.checked, l: l.checked, b: b.checked, e: e.checked });
    err.textContent = '';
    list.textContent = '';
    if (!found.length) list.append(h('p', { class: 'muted small', style: { padding: '8px' }, text: any ? T('במקום הזה אין כותרות. כותרת היא תא עם טקסט, ולידו התאים שיקבלו את השם.') : T('מסמנים איפה הכותרות, והשמות יופיעו כאן.') }));
    for (const x of found.slice(0, 300)) {
      const had = nameOf({ n: x.n, sheet: null }, WS), swap = !!had && had.f !== nameRefText(WS, x.g);
      list.append(h('div', { class: 'sh-nfs-row' }, h('b', {}, h('bdi', { text: x.n })), h('span', {}, h('bdi', { dir: 'ltr', text: rangeA1(x.g) })), h('span', { class: 'muted', title: swap ? T('מחליף שם קיים') : null, text: swap ? T('מחליף שם קיים') : '' })));
    }
    if (found.length > 300) list.append(h('div', { class: 'sh-nfs-row' }, h('b', { text: '…' })));
  };
  const apply = () => {
    if (!found.length) return false;
    const next = withLabelNames(WS, found);
    if (next.length > MAX_NAMES) { err.textContent = T('אלה יותר מדי שמות: בחוברת עבודה יש מקום ל-{0} שמות', fmt(MAX_NAMES)); return false; }
    edit(() => setNames(next));
    toast(TN('{n} שמות הוגדרו', found.length), { icon: 'style' });
    return true;
  };
  for (const i of [t, l, b, e]) i.addEventListener('change', draw);
  draw();
  modal({ title: T('יצירת שמות מהבחירה'), body: h('div', { class: 'sh-nfs' }, h('p', { text: T('כל כותרת נותנת שם לתאים שלידה. איפה הכותרות?') }), tL, lL, bL, eL,
    h('div', { class: 'sh-nfs-t', text: T('השמות שייווצרו:') }), list, err),
    actions: [{ label: T('יצירת השמות'), kind: 'primary', run: apply }, { label: T('ביטול'), value: false }], onClose: () => focusGrid() });
}
function nameManager() {
  if (ED.on && !endEdit(true)) return;
  let pick = null;
  const list = h('div', { class: 'sh-nmm-list', role: 'listbox', tabindex: '0', 'aria-label': T('שמות מוגדרים') }), note = h('div', { class: 'sh-nmm-note', dir: 'auto' });
  const all = () => (WB.names || NO_NAMES).filter(x => !x.h), cur = () => all().find(x => nameKey(x) === pick) || null;
  const scopeOf = x => x.s ? (WB.sheets.find(s => s.id === x.s) || {}).name || '' : T('חוברת העבודה');
  const draw = () => {
    const names = all();
    if (!names.some(x => nameKey(x) === pick)) pick = names.length ? nameKey(names[0]) : null;
    list.textContent = '';
    if (!names.length) list.append(h('p', { class: 'muted small', style: { padding: '10px' }, text: T('עוד אין כאן שמות. שם נותנים לטווח של תאים, ואז כותבים אותו בנוסחאות במקום הכתובת.') }));
    for (const x of names) {
      const k = nameKey(x);
      list.append(h('div', { class: 'sh-nmm-row' + (k === pick ? ' on' : ''), role: 'option', 'aria-selected': String(k === pick), onclick: () => { pick = k; draw(); }, ondblclick: () => { pick = k; editPick(); } },
        h('b', {}, h('bdi', { text: x.n })), h('span', {}, h('bdi', { text: nameShows(x) })), h('span', { title: '=' + x.f }, h('bdi', { dir: 'ltr', text: '=' + x.f })), h('span', {}, h('bdi', { text: scopeOf(x) }))));
    }
    const x = cur();
    note.textContent = x && x.c ? x.c : '';
    ed.disabled = del.disabled = !x;
    const on = list.querySelector('.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const editPick = () => { const x = cur(); if (x) nameDialog(x, k => { pick = k; draw(); }); };
  const drop = () => { const x = cur(); if (!x) return; edit(() => setNames((WB.names || NO_NAMES).filter(y => y !== x))); draw(); };
  const btn = (ic, label, run) => h('button', { type: 'button', class: 'btn small', onclick: run }, icon(ic), label);
  const add = btn('add', T('שם חדש'), () => nameDialog(null, k => { pick = k; draw(); })), ed = btn('edit', T('עריכה@verb'), editPick), del = btn('delete', T('מחיקה'), drop);
  list.addEventListener('keydown', e => {
    const names = all(), i = names.findIndex(x => nameKey(x) === pick), step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (step && names[i + step]) { pick = nameKey(names[i + step]); draw(); }
    else if (e.key === 'Enter') editPick();
    else if (e.key === 'Delete') drop();
    else if (!step) return;
    e.preventDefault(); e.stopPropagation();
  });
  draw();
  modal({ title: T('מנהל השמות'), wide: true, body: h('div', { class: 'sh-nmm' }, h('div', { class: 'sh-cfm-bar' }, add, ed, del),
    h('div', { class: 'sh-nmm-head' }, h('span', { text: T('שם') }), h('span', { text: T('ערך@col') }), h('span', { text: T('מתייחס אל') }), h('span', { text: T('היקף') })), list, note,
    h('p', { class: 'muted small', text: T('שם של כל חוברת העבודה פועל בכל הגיליונות. אחרי מחיקה של שם, הנוסחאות שהשתמשו בו מראות שגיאה. אפשר לבטל את המחיקה עם Ctrl+Z.') })),
    actions: [{ label: T('סגירה'), kind: 'primary' }], onClose: () => focusGrid() });
}
/* the commands the ribbon's buttons call (data-cmd), added to the app's own list */
const COMMANDS = {
  shNames: () => nameManager(), shNameNew: () => nameDialog(null), shNameUse: (a, b) => nameUseMenu(b), shNameCreate: () => namesFromSelection(),
  shUndo: () => undo(), shRedo: () => redo(), shChart: a => insertChart(a),
  shCut: () => copyButton(true), shCopy: () => copyButton(false), shPaste: () => pasteButton('all'),
  shLook: a => toggleLook(a),
  shColor: () => setLook('c', PREFS.shColor || '#cf3727'), shColorMenu: (a, b) => colorMenu(b, 'c'),
  shFill: () => setLook('bg', PREFS.shFill || '#ffff00'), shFillMenu: (a, b) => colorMenu(b, 'bg'),
  shBorder: () => setBorders('bottom'), shBorderMenu: (a, b) => borderMenu(b),
  shHa: a => { const cur = (lookAt(WS, SEL.r, SEL.c) || {}).ha; setLook('ha', cur === a ? null : a); },
  shVa: a => setLook('va', a === 'b' ? null : a),
  shWrap: () => toggleLook('wr'), shMerge: () => toggleMerge(),
  shNfMenu: (a, b) => nfMenu(b), shCur: () => setNf(NF_OF.cur), shCurMenu: (a, b) => curMenu(b), shPct: () => setNf(PCT_NF), shComma: () => setNf(NUM_NF), shDec: a => stepDecimals(+a),
  shInsMenu: (a, b) => menuAt(b, T('הוספה'), insertItems()), shDelMenu: (a, b) => menuAt(b, T('מחיקה'), deleteItems()), shCellMenu: (a, b) => menuAt(b, T('גודל ותצוגה'), sizeItems()),
  shSum: () => autoSum('SUM'), shSumMenu: (a, b) => sumMenu(b),
  shSortMenu: (a, b) => sortMenu(b), shClearMenu: (a, b) => clearMenu(b), shFind: () => openFind(false),
  shSort: a => quickSort(a === 'd'), shSortDlg: () => sortDialog(), shFilter: () => toggleFilter(), shFilterClear: () => clearFilter(),
  shDvList: () => dvDialog('list'), shDvMenu: (a, b) => dvMenu(b),
  shNote: () => noteEdit(), shLink: () => linkDialog(), shPic: () => pickPicture(),
  shTable: () => tableDialog(), shPivot: () => pivotDialog(), shPvFields: () => pivotPaneToggle(), shPvGpd: () => { PREFS.shGpd = PREFS.shGpd === false; savePrefs(); pivotTab(); }, shPvSource: () => pivotSourceDialog(), shPvDelete: () => pivotDelete(), shTblGallery: (a, b) => tableGallery(b), shTblStyle: (a, b) => tableGallery(b, true), shTblConvert: () => tableToRange(), shShowF: () => toggleFormulas(), shFxHelp: () => formulaHelp(), shFnDlg: () => fnDialog(), shFnCat: (a, b) => fnCatMenu(a, b), shCfMenu: (a, b) => cfMenu(b),
  shFreezeMenu: (a, b) => freezeMenu(b), shGrid: () => edit(() => setProp(WS, 'gl', !WS.gl)), shDir: () => edit(() => setProp(WS, 'dir', WS.dir === 'rtl' ? 'ltr' : 'rtl')),
  shZoom: a => setZoom(+a === 0 ? 100 : WS.zoom + (+a > 0 ? 10 : -10)),
};

/* --- after every move: the name box, the formula bar, the ribbon, and the status line --- */
function selInfo() {
  if (!V.view || !WS) return;
  if (!ED.on && document.activeElement !== V.name) { const nm = nameAt(WS, selG()); V.name.value = nm ? nm.n : A1(SEL.r, SEL.c); }   // the cells' name when they have one
  const m = mergeAt(WS, SEL.r, SEL.c), x = cellAt(WS, m ? m.r1 : SEL.r, m ? m.c1 : SEL.c);
  if (!ED.on) {
    const o = (!x || x.v === undefined) && WS._sp && WS._sp.get(KEY(SEL.r, SEL.c)), from = o && WS.cells.get(o.a), t = editText(from || x);
    if (V.bar.value !== t) V.bar.value = t;
    V.bar.classList.toggle('ghost', !!from);
  }
  updateRibbon(x);
  tableTab();
  pivotTab();
  // sum, average and count of what's chosen, as in Excel's status bar; and a word about a loop or a missing function
  const g = usedPart(selG());
  let cnt = 0, n = 0, sum = 0;
  const hid = r => WS.hr.has(r) || (WS._fh && WS._fh.has(r));
  if (!(g.r1 === g.r2 && g.c1 === g.c2) && !sameG(g, m)) eachIn({ s: WS, g }, (v, r, c) => { if (v === '' || hid(r) || WS.hc.has(c)) return; cnt++; if (typeof v === 'number') { n++; sum += v; } });
  const numText2 = v => { const nf = x && x.st && x.st.nf && !isDateNf(x.st.nf) ? x.st.nf : null; return nf ? fmtNumber(v, nf).t : genText(v, 11); };
  const words = $('#stWords');
  if (words) words.textContent = cnt > 1 ? [n ? T('ממוצע: {0}', numText2(sum / n)) : '', T('ספירה: {0}', fmt(cnt)), n ? T('סכום: {0}', numText2(sum)) : ''].filter(Boolean).join('   ') : '';
  const note = $('#stPage');
  if (note) {
    let t = '';
    if (CIRC) t = T('יש הפניה מעגלית: נוסחה שמשתמשת בעצמה ({0})', WB.sheets[CIRC.si].name + '!' + A1(kr(CIRC.k), kc(CIRC.k)));
    else if (x && x.f != null) {
      const u = missingIn(x.f, WS);
      if (u && u.name) t = T('השם {0} לא מוגדר כאן', u.name);
      else if (u && u.fn !== '?') t = x.x ? T('הפונקציה {0} עוד לא קיימת כאן. מוצג הערך שנשמר בקובץ.', u.fn) : T('הפונקציה {0} עוד לא קיימת כאן', u.fn);
    }
    note.textContent = t;
    note.classList.toggle('warn', !!t);
  }
}
function updateRibbon(x) {
  if (!V.nf) return;
  const st = x ? x.st || {} : emptyLook(WS, SEL.r, SEL.c) || {};
  const on = (cmd, arg, v) => { for (const b of document.querySelectorAll(`#ribbon [data-cmd="${cmd}"]${arg != null ? `[data-arg="${arg}"]` : ''}`)) b.classList.toggle('on', !!v); };
  for (const k of ['b', 'i', 'u', 's']) on('shLook', k, st[k]);
  for (const a of ['l', 'c', 'r']) on('shHa', a, st.ha === a);
  for (const a of ['t', 'm', 'b']) on('shVa', a, (st.va || 'b') === a);
  on('shWrap', null, st.wr);
  on('shMerge', null, !!mergeAt(WS, SEL.r, SEL.c));
  on('shFilter', null, !!WS.af);
  on('shGrid', null, WS.gl);
  on('shDir', null, WS.dir === 'rtl');
  on('shShowF', null, SHOWF);
  const ff = st.ff || DEF_FONT;
  if (![...V.font.options].some(o => o.value === ff)) V.font.append(h('option', { value: ff, text: ff, style: { fontFamily: `"${ff}"` } }));
  if (document.activeElement !== V.font) V.font.value = ff;
  const fs = String(st.fs || DEF_FS);
  if (![...V.size.options].some(o => o.value === fs)) V.size.append(h('option', { value: fs, text: fs }));
  if (document.activeElement !== V.size) V.size.value = fs;
  V.nf.firstChild.textContent = { gen: T('כללי'), num: T('מספר'), cur: T('מטבע'), pct: T('אחוזים'), date: T('תאריך קצר'), ldate: T('תאריך ארוך'), time: T('שעה'), text: T('טקסט'), sci: T('מדעי'), custom: T('מותאם') }[nfKind(st.nf)] || T('מותאם');
  const z = $('#shZoomPct'); if (z) z.textContent = WS.zoom + '%';
  for (const b of document.querySelectorAll('#ribbon [data-cmd="shUndo"]')) b.disabled = !HIST.at;
  for (const b of document.querySelectorAll('#ribbon [data-cmd="shRedo"]')) b.disabled = HIST.at >= HIST.list.length;
  barColors();
}

/* =========================================================
   files: Excel (.xlsx, through ExcelJS, MIT licence), CSV, PDF and printing
   ========================================================= */
const EXCELJS = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function excelLib() { await loadScript(EXCELJS); if (!window.ExcelJS) throw new Error('lib'); return window.ExcelJS; }
const pxToChars = px => Math.max(0, Math.round((px - 5) / 7 * 100) / 100), charsToPx = w => Math.round(w * 7 + 5);
/* the theme's colors, in the order Excel numbers them (0 is the background, 1 the text) */
const OFFICE_THEME = ['#ffffff', '#000000', '#e7e6e6', '#44546a', '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47', '#0563c1', '#954f72'];
function themeOf(wb) {
  const out = [...OFFICE_THEME], xml = wb._themes && (wb._themes.theme1 || Object.values(wb._themes)[0]);
  if (typeof xml !== 'string') return out;
  const doc = new DOMParser().parseFromString(xml, 'application/xml'), scheme = doc.getElementsByTagNameNS('*', 'clrScheme')[0];
  if (!scheme) return out;
  ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].forEach((n, i) => {
    const el = scheme.getElementsByTagNameNS('*', n)[0], c = el && el.firstElementChild, v = c && (c.getAttribute('lastClr') || c.getAttribute('val'));
    if (v && /^[0-9a-f]{6}$/i.test(v)) out[i] = '#' + v.toLowerCase();
  });
  return out;
}
/* a color shifted lighter or darker, the way Excel's "tint" does it (in HSL lightness) */
function tint(hex, t) {
  if (!t) return hex;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let hh = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6; }
  l = t < 0 ? l * (1 + t) : l * (1 - t) + t;
  const f = (p, q, x) => { if (x < 0) x += 1; if (x > 1) x -= 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 0.5 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
  let out;
  if (!s) out = [l, l, l]; else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; out = [f(p, q, hh + 1 / 3), f(p, q, hh), f(p, q, hh - 1 / 3)]; }
  return '#' + out.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
}
function xlColor(c, theme) {
  if (!c) return null;
  let hex = null;
  if (typeof c.argb === 'string' && /^[0-9a-f]{6,8}$/i.test(c.argb)) hex = '#' + c.argb.slice(-6).toLowerCase();
  else if (c.theme != null) hex = theme[c.theme] || null;
  else if (c.indexed != null) hex = c.indexed === 64 ? '#000000' : c.indexed === 65 ? '#ffffff' : PALETTE[c.indexed < 8 ? c.indexed : c.indexed - 8] || null;
  return hex && c.tint ? tint(hex, c.tint) : hex;
}
function xlLook(cell, theme) {
  const st = {}, f = cell.font || {}, a = cell.alignment || {}, fl = cell.fill, b = cell.border || {};
  if (f.bold) st.b = true;
  if (f.italic) st.i = true;
  if (f.underline && f.underline !== 'none') st.u = true;
  if (f.strike) st.s = true;
  const fc = xlColor(f.color, theme); if (fc && fc !== '#000000') st.c = fc;
  if (f.size && Math.abs(f.size - DEF_FS) > 0.01) st.fs = f.size;
  if (f.name && f.name !== DEF_FONT && okFont(f.name)) st.ff = f.name;
  if (fl && fl.type === 'pattern' && fl.pattern && fl.pattern !== 'none') { const bg = xlColor(fl.fgColor, theme) || xlColor(fl.bgColor, theme); if (bg) st.bg = bg; }
  else if (fl && fl.type === 'gradient' && fl.stops && fl.stops[0]) { const bg = xlColor(fl.stops[0].color, theme); if (bg) st.bg = bg; }
  if (/^(left|center|right)$/.test(a.horizontal || '')) st.ha = a.horizontal[0];
  else if (a.horizontal === 'centerContinuous') st.ha = 'c';
  if (a.vertical === 'top') st.va = 't'; else if (a.vertical === 'middle') st.va = 'm';
  if (a.wrapText) st.wr = true;
  const bd = x => { if (!x || !x.style) return null; const w = /thick/.test(x.style) ? 3 : /medium/i.test(x.style) ? 2 : 1, k = x.style === 'double' ? '=' : /dash/i.test(x.style) ? 'd' : /dot|hair/i.test(x.style) ? 'o' : 's'; return (k === '=' ? 1 : w) + k + (xlColor(x.color, theme) || '#000000'); };
  const bt = bd(b.top), bb = bd(b.bottom), bs = bd(b.left), be = bd(b.right);
  if (bt) st.bt = bt; if (bb) st.bb = bb; if (bs) st.bs = bs; if (be) st.be = be;
  // ExcelJS names Excel's built-in short date (format 14, shown in the computer's own date order) mm-dd-yy
  if (cell.numFmt && cell.numFmt !== 'General') st.nf = XL_BUILTIN[cell.numFmt] || cell.numFmt;
  return normStyle(st);
}
const XL_BUILTIN = { 'mm-dd-yy': DATE_NF, 'm/d/yy h:mm': DATE_NF + ' hh:mm', 'm/d/yy': DATE_NF };
const xlResult = v => v instanceof Date ? jsDateSerial(v) : v && typeof v === 'object' && v.error ? ERR[v.error] || E_NA : typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' ? v : '';
/* an Excel workbook as a workbook here, with a count of what couldn't come across */
async function readXlsx(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xD0 && u8[1] === 0xCF) throw new Error('locked');
  if (u8[0] !== 0x50 || u8[1] !== 0x4B) throw new Error('notxlsx');
  const names = new TextDecoder('latin1').decode(u8), count = re => (names.match(re) || []).length;
  const rep = new Map(), hasCharts = count(/xl\/charts\/chart\d+\.xml/g) > 0 || count(/xl\/media\//g) > 0, hasPivots = count(/xl\/pivotTables\/pivotTable\d+\.xml/g) > 0;   // charts, or pictures
  const add = (k, n = 1) => rep.set(k, (rep.get(k) || 0) + n);
  const ExcelJS = await excelLib(), wb = new ExcelJS.Workbook();
  // ExcelJS lists a data validation under every one of its cells, a million for a whole column. The rules are read
  // from the file's own XML (importDv), so here each of their ranges counts as one cell
  const dims = new ExcelJS.Workbook().addWorksheet('a').dimensions, RP = dims && Object.getPrototypeOf(dims), each = RP && RP.forEachAddress;
  if (each) RP.forEachAddress = function (cb) { cb(this.tl); };
  try { await wb.xlsx.load(buf); } finally { if (each) RP.forEachAddress = each; }
  const theme = themeOf(wb), VT = ExcelJS.ValueType, taken = new Set(), book = { v: 1, dir: UI_DIR, active: 0, sheets: [] }, xlNames = [];
  let hasCf = false;
  let anyRtl = null;
  // the file's defined names come first, so a formula that uses one is worked out like any other. Each sheet gets its
  // id now, for the names that belong to one sheet
  const ids = new Map();
  wb.eachSheet(ws => { if (ws.state !== 'veryHidden') ids.set(ws.name, sid()); });
  const known = { sheets: [...ids].map(([name, id]) => ({ id, name })), names: NO_NAMES };
  try { const xn = await readXlsxNames(buf); known.names = normNames(xn.names.map(x => ({ ...x, ...(x.li == null ? {} : { s: ids.get(xn.sheets[x.li]) || '?' }) })), known.sheets); } catch (e) { console.warn(e); }
  let xt = new Map();
  try { xt = await readXlsxTables(buf); } catch (e) { console.warn(e); }
  for (const ks of known.sheets) ks.tables = xt.get(ks.name) || [];
  wb.eachSheet(ws => {
    if (ws.state === 'veryHidden') return;
    if (ws.state === 'hidden') add('hidden');
    const view = (ws.views && ws.views[0]) || {};
    const s = newSheet(freeName(cleanName(ws.name) || sheetWord(book.sheets.length + 1), taken), view.rightToLeft ? 'rtl' : 'ltr'), arrays = [];
    s.id = ids.get(ws.name);
    taken.add(s.name.toLowerCase());
    if (anyRtl == null) anyRtl = !!view.rightToLeft;
    if (view.state === 'frozen') { s.fr = clamp(view.ySplit | 0, 0, 200); s.fc = clamp(view.xSplit | 0, 0, 60); }
    if (view.showGridLines === false) s.gl = false;
    if (view.zoomScale) s.zoom = clamp(view.zoomScale, 25, 400);
    const p = ws.properties || {};
    if (p.defaultColWidth) s.dw = clamp(charsToPx(p.defaultColWidth), 10, 600); else s.dw = 64;
    if (p.defaultRowHeight) s.dh = clamp(Math.round(p.defaultRowHeight * 4 / 3), 8, 200); else s.dh = 20;
    const tab = p.tabColor && xlColor(p.tabColor, theme); if (tab) s.tab = tab;
    (ws.columns || []).forEach((col, i) => {
      if (!col) return;
      if (col.hidden) s.hc.add(i);
      if (col.width != null && Math.abs(charsToPx(col.width) - s.dw) > 1) s.cw.set(i, clamp(charsToPx(col.width), 2, 2000));
    });
    ws.eachRow({ includeEmpty: true }, (row, rn) => {
      const r = rn - 1;
      if (r >= MAXR) return;
      if (row.hidden) s.hr.add(r);
      if (row.height != null && Math.abs(row.height * 4 / 3 - s.dh) > 1) s.rh.set(r, clamp(Math.round(row.height * 4 / 3), 4, 800));
      row.eachCell({ includeEmpty: true }, (cell, cn) => {
        const c = cn - 1, v = cell.value, x = {};
        if (c >= MAXC) return;
        switch (cell.type) {
          case VT.Number: case VT.String: case VT.Boolean: x.v = v; break;
          case VT.Date: x.v = jsDateSerial(v); break;
          case VT.RichText: x.v = (v.richText || []).map(t => t.text).join(''); break;
          case VT.Hyperlink: x.v = typeof v.text === 'string' ? v.text : v.text && v.text.richText ? v.text.richText.map(t => t.text).join('') : String(v.hyperlink || ''); break;   // the link itself: importExtras
          case VT.Error: x.v = ERR[v.error] || E_NA; break;
          case VT.Formula: {
            let f = v.formula;
            if (v.sharedFormula) { const m = ws.getCell(v.sharedFormula), mf = m.value && m.value.formula; if (mf) f = shiftFormula(mf, rn - +m.row, cn - +m.col); }
            if (f == null) f = cell.formula;
            x.v = xlResult(cell.result);   // not v.result: the library's copy of the value leaves out an answer of 0 or FALSE
            if (f) {
              x.f = fromXl(String(f).replace(/^=/, ''));
              if (x.f.includes('[')) { const tt = (xt.get(ws.name) || []).find(t => inG(t.g, r, c)); x.f = trefShow(x.f, tt && tt.name); }   // Sales[[#This Row],[Price]] shows [@Price] in its own table
              if (missingIn(x.f, s, known)) { x.x = true; add('fn'); }
              else if (v.shareType === 'array') { const g = parseRange(v.ref); if (g && (g.r1 !== g.r2 || g.c1 !== g.c2)) arrays.push(g); }
              else if (olderWay(x.f) && tokenize(x.f).some(t => (t.t === 'ref' && t.k !== 'c') || t.t === 'name' || (t.t === 'op' && t.s === ':') || (t.t === 'fn' && (t.n === 'INDIRECT' || t.n === 'OFFSET')))) x.l = true;   // an older formula: a range alone in it (or what a name, INDIRECT or OFFSET gives) takes one cell
            }
            break;
          }
          default: break;
        }
        const st = xlLook(cell, theme);
        if (st) x.st = st;
        if (x.v !== undefined || x.f || x.st) { const n = normCell(x.v instanceof Err ? { ...x, v: undefined, e: x.v.c } : x); if (n) s.cells.set(KEY(r, c), n); }
      });
    });
    // what an array formula filled is its answer, not the cells' own: only their look stays
    for (const g of arrays) for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
      if (r === g.r1 && c === g.c1) continue;
      const k = KEY(r, c), x = s.cells.get(k);
      if (x && x.f == null) { if (x.st) s.cells.set(k, { st: x.st }); else s.cells.delete(k); }
    }
    for (const m of Object.values(ws._merges || {})) {
      const mm = m && m.model;
      if (!mm) continue;
      const g = G4(mm.top - 1, mm.left - 1, mm.bottom - 1, mm.right - 1);
      if ((g.r1 !== g.r2 || g.c1 !== g.c2) && !s.merges.some(o => meets(o, g))) s.merges.push(g);
    }
    const af = ws.autoFilter;
    if (af) { const g = typeof af === 'string' ? parseRange(af) : af.from && af.to ? G4(af.from.row - 1, af.from.column - 1, af.to.row - 1, af.to.column - 1) : null; if (g && !wholeCols(g) && !wholeRows(g)) s.af = { ...g, hide: {} }; }
    const cf = ws.conditionalFormattings || (ws.model && ws.model.conditionalFormattings);
    if (cf && cf.length) hasCf = true;
    book.sheets.push(sheetOut(s));
    xlNames.push(ws.name);
  });
  if (!book.sheets.length) throw new Error('empty');
  const act = wb.views && wb.views[0] && wb.views[0].activeTab;
  book.active = clamp(act | 0, 0, book.sheets.length - 1);
  book.dir = anyRtl ? 'rtl' : anyRtl === false ? 'ltr' : UI_DIR;
  book.names = known.names.map(nameOut);
  const nb = normBook(book);
  // the tables onto their sheets, each with a name of its own in the workbook; a table's filter is the sheet's when the
  // sheet has none of its own
  const tn = new Set((nb.names || []).map(x => x.n.toLowerCase()));
  nb.sheets.forEach((s, i) => {
    for (const t of xt.get(xlNames[i]) || []) {
      if (s.tables.some(o => meets(o.g, t.g)) || s.merges.some(m => meets(m, t.g))) { add('table'); continue; }
      if (tn.has(t.name.toLowerCase())) t.name = freeTableName(t.name, tn);
      tn.add(t.name.toLowerCase());
      s.tables.push(t);
      if (t._af && !s.af) s.af = { r1: t.g.r1, c1: t.g.c1, r2: t.g.r2 - t.tr, c2: t.g.c2, hide: {} };
      delete t._af;
    }
  });
  if (hasCharts) await importCharts(buf, nb, xlNames, rep);
  if (hasCf) await importCf(buf, nb, xlNames, rep, theme);
  await importDv(buf, nb, xlNames, rep);
  await importExtras(buf, nb, xlNames, rep);   // notes and links, which the file's compressed parts hide from a quick look
  if (hasPivots) await importPivots(buf, nb, xlNames, rep);
  return { book: bookOut(nb), rep };
}
/* the file's notes (xl/commentsN.xml, through each sheet's links) and links (the sheet's <hyperlinks>), read here:
   ExcelJS loses a note on a cell that has nothing else, and Excel writes such cells only into the notes' part; and it
   keeps a link only on a cell of text. The author's name, which Excel writes as a note's first line, stays part of the
   text. A link to another file or to a place on the computer is left out, and counted for the report */
async function importExtras(buf, nb, xlNames, rep) {
  try {
    const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf), dp = new DOMParser();
    const xml = async p => { const f = zip.file(p); return f ? dp.parseFromString(await f.async('string'), 'application/xml') : null; };
    const wbx = await xml('xl/workbook.xml'), wr = await xml(relsOf('xl/workbook.xml'));
    if (!wbx || !wr) return;
    const rels = new Map(xdesc(wr, 'Relationship').map(r => [xat(r, 'Id'), partPath('xl/workbook.xml', xat(r, 'Target') || '')]));
    for (const sh of xdesc(wbx, 'sheet')) {
      const s = nb.sheets[xlNames.indexOf(xat(sh, 'name'))], rid = [...sh.attributes].find(a => a.localName === 'id' && /relationships/.test(a.namespaceURI || '')), path = rid && rels.get(rid.value);
      const sr = s && path && await xml(relsOf(path));
      if (!sr) continue;
      const sx = await xml(path), hl = sx ? xdesc(sx, 'hyperlink') : [];
      for (const e of hl) {
        const g = parseRange(xat(e, 'ref') || ''), rid = [...e.attributes].find(a => a.localName === 'id' && /relationships/.test(a.namespaceURI || ''));
        const rel = rid && xdesc(sr, 'Relationship').find(r => xat(r, 'Id') === rid.value), loc = xat(e, 'location');
        const k = linkOk(rel ? (xat(rel, 'Target') || '') + (loc ? '#' + loc : '') : loc ? '#' + loc : '');
        if (!g) continue;
        if (!k) { rep.set('link', (rep.get('link') || 0) + 1); continue; }
        let n = 0;
        for (let r = g.r1; r <= Math.min(g.r2, MAXR - 1); r++) for (let c = g.c1; c <= Math.min(g.c2, MAXC - 1) && n < 2000; c++, n++) { const key = KEY(r, c); s.cells.set(key, { ...(s.cells.get(key) || {}), k }); }
      }
      for (const r of xdesc(sr, 'Relationship').filter(r => /\/comments$/.test(xat(r, 'Type') || ''))) {
        const doc = await xml(partPath(path, xat(r, 'Target') || ''));
        if (!doc) continue;
        for (const cm of xdesc(doc, 'comment')) {
          const at = parseA1(xat(cm, 'ref') || ''), text = xdesc(cm, 't').map(t => t.textContent).join('').replace(/\r\n?/g, '\n');
          if (!at || !text.trim() || at.r >= MAXR || at.c >= MAXC) continue;
          const k = KEY(at.r, at.c), x = s.cells.get(k);
          s.cells.set(k, { ...(x || {}), n: text.slice(0, 32767) });
        }
      }
    }
  } catch (e) { console.warn(e); }
}
/* structured references the way they show (Sales[[#This Row],[Price]] is [@Price] inside Sales) */
const trefShow = (f, own) => tokenize(f).map(t => t.t === 'tref' ? trefText(t, own, false) : t.s).join('');
/* the file's tables (xl/tables/tableN.xml, through each sheet's links): sheet's name → its tables. A style of the file's
   own (not one of Excel's 60) gives the default look */
async function readXlsxTables(buf) {
  const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf), dp = new DOMParser(), out = new Map();
  const xml = async p => { const f = zip.file(p); return f ? dp.parseFromString(await f.async('string'), 'application/xml') : null; };
  const wbx = await xml('xl/workbook.xml'), wr = await xml(relsOf('xl/workbook.xml'));
  if (!wbx || !wr) return out;
  const rels = new Map(xdesc(wr, 'Relationship').map(r => [xat(r, 'Id'), partPath('xl/workbook.xml', xat(r, 'Target') || '')]));
  for (const sh of xdesc(wbx, 'sheet')) {
    const rid = [...sh.attributes].find(a => a.localName === 'id' && /relationships/.test(a.namespaceURI || '')), path = rid && rels.get(rid.value), sr = path && await xml(relsOf(path));
    if (!sr) continue;
    const list = [];
    for (const r of xdesc(sr, 'Relationship').filter(r => /\/table$/.test(xat(r, 'Type') || ''))) {
      const d = await xml(partPath(path, xat(r, 'Target') || '')), e = d && d.documentElement;
      if (!e || e.localName !== 'table') continue;
      const num = (k, dflt) => { const v = xat(e, k); return v == null || v === '' ? dflt : +v; };
      const si = xkid(e, 'tableStyleInfo'), on = k => !!si && (xat(si, k) === '1' || xat(si, k) === 'true');
      const cols = xkids(xkid(e, 'tableColumns'), 'tableColumn').map(c => {
        const o = { n: (xat(c, 'name') || '').replace(/_x([0-9a-f]{4})_/gi, (m, hx) => String.fromCharCode(parseInt(hx, 16))) };
        const fn = xat(c, 'totalsRowFunction'), lbl = xat(c, 'totalsRowLabel'), cf = xkid(c, 'calculatedColumnFormula');
        if (fn && fn !== 'none' && fn !== 'custom') o.fn = fn;
        if (lbl) o.lbl = lbl;
        if (cf && cf.textContent.trim()) o.cf = cf.textContent.trim();
        return o;
      });
      const t = normTable({ name: xat(e, 'displayName') || xat(e, 'name') || '', ref: xat(e, 'ref') || '', hr: num('headerRowCount', 1) ? 1 : 0, tr: num('totalsRowCount', 0) ? 1 : 0,
        style: si ? xat(si, 'name') : TS_DEF, sr: si ? on('showRowStripes') : true, sc: on('showColumnStripes'), fc: on('showFirstColumn'), lc: on('showLastColumn'), fb: !!xkid(e, 'autoFilter'), cols });
      if (!t) continue;
      t.cols.forEach(c => { if (c.cf) c.cf = trefShow(fromXl(c.cf), t.name); });
      t._af = !!xkid(e, 'autoFilter') && t.hr;
      list.push(t);
    }
    if (list.length) out.set(xat(sh, 'name'), list);
  }
  return out;
}
/* the tables into a workbook ExcelJS wrote: a part for each (with its columns, its total row, its filter and its style)
   and the sheet's <tableParts>, as Excel writes them */
async function addXlsxTables(buf) {
  const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf), x = v => esc(String(v));
  let ct = await zip.file('[Content_Types].xml').async('string'), id = 0, tn = 0;
  for (let i = 0; i < WB.sheets.length; i++) {
    const s = WB.sheets[i], sp = `xl/worksheets/sheet${i + 1}.xml`, sf = zip.file(sp);
    if (!s.tables.length || !sf) continue;
    const rp = relsOf(sp), rf = zip.file(rp);
    let rx = rf ? await rf.async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    const parts = [];
    for (const t of s.tables) {
      id++;
      do tn++; while (zip.file(`xl/tables/table${tn}.xml`));
      const cols = t.cols.map((c, j) => {
        const tc = t.tr ? cellAt(s, t.g.r2, t.g.c1 + j) : null;
        let attrs = '', inner = '';
        if (t.tr && c.fn) attrs += ` totalsRowFunction="${c.fn}"`;
        else if (t.tr && tc && tc.f == null && typeof tc.v === 'string' && tc.v) attrs += ` totalsRowLabel="${x(tc.v)}"`;
        else if (t.tr && tc && tc.f != null) { attrs += ' totalsRowFunction="custom"'; inner += `<totalsRowFormula>${x(xlFormula(tc.f, false, t.name))}</totalsRowFormula>`; }
        if (c.cf) inner = `<calculatedColumnFormula>${x(xlFormula(c.cf, false, t.name))}</calculatedColumnFormula>` + inner;
        return `<tableColumn id="${j + 1}" name="${x(c.n)}"${attrs}${inner ? '>' + inner + '</tableColumn>' : '/>'}`;
      }).join('');
      const af = t.hr && t.fb ? `<autoFilter ref="${rangeA1({ ...t.g, r2: t.g.r2 - t.tr })}"/>` : '';
      const xmlT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${id}" name="${x(t.name)}" displayName="${x(t.name)}" ref="${rangeA1(t.g)}"` +
        `${t.hr ? '' : ' headerRowCount="0"'}${t.tr ? ' totalsRowCount="1"' : ' totalsRowShown="0"'}>${af}<tableColumns count="${t.cols.length}">${cols}</tableColumns>` +
        `<tableStyleInfo name="${x(t.style)}" showFirstColumn="${t.fc ? 1 : 0}" showLastColumn="${t.lc ? 1 : 0}" showRowStripes="${t.sr ? 1 : 0}" showColumnStripes="${t.sc ? 1 : 0}"/></table>`;
      zip.file(`xl/tables/table${tn}.xml`, xmlT);
      ct = ct.replace('</Types>', `<Override PartName="/xl/tables/table${tn}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>`);
      let k = 1; while (rx.includes(`Id="rId${k}"`)) k++;
      rx = rx.replace('</Relationships>', `<Relationship Id="rId${k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${tn}.xml"/></Relationships>`);
      parts.push(`<tablePart r:id="rId${k}"/>`);
    }
    zip.file(rp, rx);
    let sx = await sf.async('string');
    if (!/xmlns:r=/.test(sx.slice(0, 600))) sx = sx.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    const at = ['<extLst', '</worksheet>'].map(t => sx.indexOf(t)).filter(q => q >= 0), pos = Math.min(...at);
    sx = sx.slice(0, pos) + `<tableParts count="${parts.length}">${parts.join('')}</tableParts>` + sx.slice(pos);
    zip.file(sp, sx);
  }
  zip.file('[Content_Types].xml', ct);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
/* pivot tables into a workbook ExcelJS wrote, as Excel writes them: for each, a cache (its source's fields, the items of
   those in its rows, columns and filters, and the records) and its own part (where it stands, its fields in each area,
   the items a filter lets through, its values and its style), the workbook's <pivotCaches> and the sheet's link to it.
   The cells it shows are already in the sheet as values; Excel works it out again when it opens the file (refreshOnLoad),
   so there too it follows its data. One with no room on its sheet, or no source, stays only as the cells it shows */
async function addXlsxPivots(buf) {
  const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf);
  const a = v => xlAttr(String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')).replace(/\r/g, '&#13;').replace(/\t/g, '&#9;');
  const XH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n', NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/', RELS = XH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const link = (rx, type, target) => { let k = 1; while (rx.includes(`Id="rId${k}"`)) k++; return [rx.replace('</Relationships>', `<Relationship Id="rId${k}" Type="${REL}${type}" Target="${target}"/></Relationships>`), 'rId' + k]; };
  const item = v => v == null || v === '' ? '<m/>' : typeof v === 'number' ? `<n v="${v}"/>` : typeof v === 'string' ? `<s v="${a(v)}"/>` : typeof v === 'boolean' ? `<b v="${v ? 1 : 0}"/>` : `<e v="${OLD_ERRS.has(v.c) ? v.c : '#VALUE!'}"/>`;
  let ct = await zip.file('[Content_Types].xml').async('string'), wr = await zip.file(relsOf('xl/workbook.xml')).async('string'), n = 0;
  const caches = [];
  for (let si = 0; si < WB.sheets.length; si++) {
    const s = WB.sheets[si], sp = `xl/worksheets/sheet${si + 1}.xml`;
    if (!s.pivots.length || !zip.file(sp)) continue;
    const rp = relsOf(sp), rf = zip.file(rp), names = new Set();
    let rx = rf ? await rf.async('string') : RELS;
    for (const p of s.pivots) {
      const D = pivotData(s, p), R = pivotSrc(s, p), g = s._pva && s._pva.get(p.id);
      if (!D || !R || !g || g.bad || !D.head.length || D.head.some(h1 => !h1)) continue;
      n++;
      // the fields, each with one name (a second "Sales" is Sales2, as Excel names it)
      const fn = [], low = new Set();
      for (const h1 of D.head) { let nm = h1.slice(0, 255), k = 2; while (low.has(nm.toLowerCase())) nm = h1.slice(0, 250) + k++; low.add(nm.toLowerCase()); fn.push(nm); }
      const fi = f => D.head.findIndex(h1 => h1.toLowerCase() === f.toLowerCase());
      const rows = p.rows.map(fi).filter(i => i >= 0), cols = p.cols.map(fi).filter(i => i >= 0), filt = p.filt.map(f => ({ ...f, i: fi(f.f) })).filter(f => f.i >= 0), vals = p.vals.map(v => ({ ...v, i: fi(v.f) })).filter(v => v.i >= 0);
      const axis = new Map([...rows.map(i => [i, 'axisRow']), ...cols.map(i => [i, 'axisCol']), ...filt.map(f => [f.i, 'axisPage'])]);
      // what each field holds (Excel's marks for it), and the items of those in an area: in the order of the records, and
      // in the order they show
      const F = D.head.map((h1, j) => {
        const kinds = new Set(), seen = axis.has(j) ? new Map() : null;
        let int = true, min = Infinity, max = -Infinity, long = false;
        for (const rec of D.recs) {
          const v = rec[j];
          if (v == null || v === '') kinds.add('m');
          else if (typeof v === 'number') { kinds.add('n'); if (!Number.isInteger(v)) int = false; if (v < min) min = v; if (v > max) max = v; }
          else if (typeof v === 'string') { kinds.add('s'); if (v.length > 255) long = true; }
          else kinds.add(typeof v === 'boolean' ? 'b' : 'e');
          if (seen) { const k = pvKey(v); if (!seen.has(k)) seen.set(k, v); }
        }
        const only = (...k) => [...kinds].every(q => k.includes(q));
        let at = '';
        if (kinds.size && only('n')) at += ' containsSemiMixedTypes="0"';
        if (kinds.has('n') && only('n', 'm')) at += ' containsString="0"';
        if (kinds.has('m')) at += ' containsBlank="1"';
        if (['s', 'n', 'b', 'e'].filter(q => kinds.has(q)).length > 1) at += ' containsMixedTypes="1"';
        if (kinds.has('n')) at += ` containsNumber="1"${int ? ' containsInteger="1"' : ''} minValue="${min}" maxValue="${max}"`;
        if (long) at += ' longText="1"';
        if (!seen) return { xml: `<cacheField name="${a(fn[j])}" numFmtId="0"><sharedItems${at}/></cacheField>` };
        const keys = [...seen.keys()], idx = new Map(keys.map((k, i) => [k, i])), order = keys.slice().sort((p1, q1) => pvCmp(seen.get(p1), seen.get(q1)));
        return { idx, order, xml: `<cacheField name="${a(fn[j])}" numFmtId="0"><sharedItems${at} count="${keys.length}">${keys.map(k => item(seen.get(k))).join('')}</sharedItems></cacheField>` };
      });
      const recs = D.recs.map(rec => '<r>' + rec.map((v, j) => F[j].idx ? `<x v="${F[j].idx.get(pvKey(v))}"/>` : item(v)).join('') + '</r>').join('');
      // the source: a table, or a name of the workbook, by its name; else the range and its sheet
      const tb = tableByName(p.src), nm = !tb && (WB.names || NO_NAMES).find(q => !q.s && q.n.toLowerCase() === p.src.toLowerCase());
      const ws = tb ? `<worksheetSource name="${a(tb.t.name)}"/>` : nm ? `<worksheetSource name="${a(nm.n)}"/>` : `<worksheetSource ref="${rangeA1(R.g)}" sheet="${a(R.s.name)}"/>`;
      zip.file(`xl/pivotCache/pivotCacheDefinition${n}.xml`, XH + `<pivotCacheDefinition ${NS} r:id="rId1" refreshOnLoad="1" createdVersion="6" refreshedVersion="6" minRefreshableVersion="3" recordCount="${D.recs.length}">` +
        `<cacheSource type="worksheet">${ws}</cacheSource><cacheFields count="${F.length}">${F.map(f => f.xml).join('')}</cacheFields></pivotCacheDefinition>`);
      zip.file(`xl/pivotCache/pivotCacheRecords${n}.xml`, XH + `<pivotCacheRecords ${NS} count="${D.recs.length}">${recs}</pivotCacheRecords>`);
      zip.file(`xl/pivotCache/_rels/pivotCacheDefinition${n}.xml.rels`, link(RELS, 'pivotCacheRecords', `pivotCacheRecords${n}.xml`)[0]);
      // the table: each field in its area (a filter's items: the one it shows, or those it hides), and the values with
      // their captions (Excel shows none without one; one that would repeat a name gets a space after it, as Excel's users do)
      const pf = D.head.map((h1, j) => {
        const ax = axis.get(j), dat = vals.some(v => v.i === j) ? ' dataField="1"' : '';
        if (!ax) return `<pivotField${dat} showAll="0"/>`;
        const f = ax === 'axisPage' && filt.find(q => q.i === j);
        let on = f && f.v && f.v.length > 1 ? new Set(f.v) : null;
        if (on && !F[j].order.some(k => on.has(k))) on = null;
        return `<pivotField axis="${ax}"${dat}${on ? ' multipleItemSelectionAllowed="1"' : ''} showAll="0"><items count="${F[j].order.length + 1}">${F[j].order.map(k => `<item${on && !on.has(k) ? ' h="1"' : ''} x="${F[j].idx.get(k)}"/>`).join('')}<item t="default"/></items></pivotField>`;
      }).join('');
      const taken = new Set(fn.map(q => q.toLowerCase()));
      const df = vals.map(v => {
        let cap = (v.n || T(PV_FN[v.fn], v.f)).slice(0, 250);
        while (taken.has(cap.toLowerCase())) cap += ' ';
        taken.add(cap.toLowerCase());
        return `<dataField name="${a(cap)}" fld="${v.i}"${v.fn === 'sum' ? '' : ` subtotal="${v.fn}"`} baseField="0" baseItem="0"/>`;
      }).join('');
      const pages = filt.map(f => { const k = f.v && f.v.length === 1 ? F[f.i].order.indexOf(f.v[0]) : -1; return `<pageField fld="${f.i}"${k >= 0 ? ` item="${k}"` : ''} hier="-1"/>`; }).join('');
      // where it stands: below its filters (and a row between); one with nothing in it yet keeps Excel's empty frame
      const PG = pivotGrid(s, p), top = g.r1 + (filt.length ? filt.length + 1 : 0), body = PG.rows.slice(filt.length ? filt.length + 1 : 0);
      const w = Math.max(1, ...body.map(r => r.length)), empty = !rows.length && !cols.length && !vals.length;
      const loc = empty ? rangeA1({ r1: top, c1: g.c1, r2: Math.min(MAXR - 1, top + 17), c2: Math.min(MAXC - 1, g.c1 + 2) }) : rangeA1({ r1: top, c1: g.c1, r2: Math.max(top, top + body.length - 1), c2: g.c1 + w - 1 });
      const nc = cols.length + (vals.length > 1 ? 1 : 0), fh = cols.length || vals.length < 2 ? 1 : 0, fd = cols.length ? cols.length + 1 + (vals.length > 1 ? 1 : 0) : 1, fc = rows.length || (cols.length && vals.length < 2) ? 1 : 0;
      // the layout as Excel writes it (measured): each row and column by its items' places in their fields (x), the ones
      // it shares with the one before it counted (r), its value field (i), and the subtotals (default) and grand totals
      const at = (f, key) => F[f].order.indexOf(key), xs = l => l.map(v => v ? `<x v="${v}"/>` : '<x/>').join('');
      const rowItems = G => {
        const it = rows.length ? G.rowList.map(l => l ? `<i${l.length > 1 ? ` r="${l.length - 1}"` : ''}>${xs([at(rows[l.length - 1], l[l.length - 1])])}</i>` : '<i t="grand"><x/></i>') : ['<i/>'];
        return `<rowItems count="${it.length}">${it.join('')}</rowItems>`;
      };
      const colItems = G => {
        if (!cols.length && vals.length < 2) return '<colItems count="1"><i/></colItems>';
        let prev = [];
        const it = G.cols.map(c => {
          const ia = c.j ? ` i="${c.j}"` : '', path = c.path ? c.path.map((q, d) => at(cols[d], q.k)) : [];
          if (c.grand) { prev = []; return `<i t="grand"${ia}><x/></i>`; }
          if (c.sub) { prev = path; return `<i t="default"${path.length > 1 ? ` r="${path.length - 1}"` : ''}${ia}>${xs(path.slice(-1))}</i>`; }
          const l = vals.length > 1 ? [...path, c.j] : path;
          let r = 0;
          while (r < l.length - 1 && r < prev.length && prev[r] === l[r]) r++;
          prev = l;
          return `<i${r ? ` r="${r}"` : ''}${ia}>${xs(l.slice(r))}</i>`;
        });
        return `<colItems count="${it.length}">${it.join('')}</colItems>`;
      };
      let name = p.name, k = 2;
      while (names.has(name.toLowerCase())) name = p.name.slice(0, 250) + k++;
      names.add(name.toLowerCase());
      zip.file(`xl/pivotTables/pivotTable${n}.xml`, XH + `<pivotTableDefinition ${NS} name="${a(name)}" cacheId="${n}" applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="1"` +
        ` dataCaption="${a(T('ערכים'))}" updatedVersion="6" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" createdVersion="6" indent="0" outline="1" outlineData="1" multipleFieldFilters="0">` +
        `<location ref="${loc}" firstHeaderRow="${fh}" firstDataRow="${fd}" firstDataCol="${fc}"${filt.length ? ` rowPageCount="${filt.length}" colPageCount="1"` : ''}/>` +
        `<pivotFields count="${F.length}">${pf}</pivotFields>` +
        (rows.length ? `<rowFields count="${rows.length}">${rows.map(i => `<field x="${i}"/>`).join('')}</rowFields>` : '') + (empty ? '' : rowItems(PG)) +
        (nc ? `<colFields count="${nc}">${[...cols, ...(vals.length > 1 ? [-2] : [])].map(i => `<field x="${i}"/>`).join('')}</colFields>` : '') + (empty ? '' : colItems(PG)) +
        (filt.length ? `<pageFields count="${filt.length}">${pages}</pageFields>` : '') + (vals.length ? `<dataFields count="${vals.length}">${df}</dataFields>` : '') +
        '<pivotTableStyleInfo name="PivotStyleLight16" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>' +
        '<extLst><ext uri="{962EF5D1-5CA2-4c93-8EF4-DBF5C05439D2}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:pivotTableDefinition hideValuesRow="1" xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"/></ext></extLst></pivotTableDefinition>');
      zip.file(`xl/pivotTables/_rels/pivotTable${n}.xml.rels`, link(RELS, 'pivotCacheDefinition', `../pivotCache/pivotCacheDefinition${n}.xml`)[0]);
      rx = link(rx, 'pivotTable', `../pivotTables/pivotTable${n}.xml`)[0];
      let id;
      [wr, id] = link(wr, 'pivotCacheDefinition', `pivotCache/pivotCacheDefinition${n}.xml`);
      caches.push(`<pivotCache cacheId="${n}" r:id="${id}"/>`);
      ct = ct.replace('</Types>', [['pivotCache/pivotCacheDefinition', 'pivotCacheDefinition'], ['pivotCache/pivotCacheRecords', 'pivotCacheRecords'], ['pivotTables/pivotTable', 'pivotTable']].map(([f, t]) =>
        `<Override PartName="/xl/${f}${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.${t}+xml"/>`).join('') + '</Types>');
    }
    zip.file(rp, rx);
  }
  if (!n) return buf;
  let wx = await zip.file('xl/workbook.xml').async('string');
  const at = ['<smartTagPr', '<smartTagTypes', '<webPublishing', '<fileRecoveryPr', '<webPublishObjects', '<extLst', '</workbook>'].map(t => wx.indexOf(t)).filter(q => q >= 0), pos = Math.min(...at);
  wx = wx.slice(0, pos) + `<pivotCaches>${caches.join('')}</pivotCaches>` + wx.slice(pos);
  zip.file('xl/workbook.xml', wx);
  zip.file(relsOf('xl/workbook.xml'), wr);
  zip.file('[Content_Types].xml', ct);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
/* the file's pivot tables, each onto its sheet in place of the cells Excel wrote for it, and worked out here from its
   source. One that this can't show the way Excel does (a source outside the workbook, values in its rows, grouped or
   calculated fields, items hidden in its rows or columns or put in an order of their own, filters on its labels or
   values, values shown as a part of something, a layout other than the compact one, no subtotals or grand totals) stays
   as the cells it showed, and is counted for the report */
async function importPivots(buf, nb, xlNames, rep) {
  try {
    const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf), dp = new DOMParser();
    const xml = async p => { const f = zip.file(p); return f ? dp.parseFromString(await f.async('string'), 'application/xml') : null; };
    const wbx = await xml('xl/workbook.xml'), wr = await xml(relsOf('xl/workbook.xml'));
    if (!wbx || !wr) return;
    const rels = new Map(xdesc(wr, 'Relationship').map(r => [xat(r, 'Id'), partPath('xl/workbook.xml', xat(r, 'Target') || '')]));
    const keep = [WB, WS];
    WB = nb;   // a source names this workbook's sheets, tables and names
    try {
      for (const sh of xdesc(wbx, 'sheet')) {
        const s = nb.sheets[xlNames.indexOf(xat(sh, 'name'))], rid = [...sh.attributes].find(q => q.localName === 'id' && /relationships/.test(q.namespaceURI || '')), path = rid && rels.get(rid.value);
        const sr = s && path && await xml(relsOf(path));
        if (!sr) continue;
        for (const r of xdesc(sr, 'Relationship').filter(r => /\/pivotTable$/.test(xat(r, 'Type') || ''))) {
          const tp = partPath(path, xat(r, 'Target') || ''), td = await xml(tp), tr = td && await xml(relsOf(tp));
          const cr = tr && xdesc(tr, 'Relationship').find(q => /\/pivotCacheDefinition$/.test(xat(q, 'Type') || ''));
          const cd = cr && await xml(partPath(tp, xat(cr, 'Target') || ''));
          let got = null;
          try { got = td && cd ? pivotFromXml(td.documentElement, cd.documentElement, xlNames, nb) : null; } catch (e) { console.warn(e); }
          if (!got || s.pivots.length >= 50 || s.pivots.some(q => q.name.toLowerCase() === got.p.name.toLowerCase())) { rep.set('pivot', (rep.get('pivot') || 0) + 1); continue; }
          for (const g of got.area) for (let rr = g.r1; rr <= g.r2; rr++) for (let cc = g.c1; cc <= g.c2; cc++) s.cells.delete(KEY(rr, cc));   // Excel's cells for it: it shows its own
          s.pivots.push(got.p);
        }
      }
    } finally { [WB, WS] = keep; }
  } catch (e) { console.warn(e); }
}
/* one pivot table from its part (e) and its cache's (c): { p: the pivot table, area: the cells Excel wrote for it }, or
   null for one this keeps as cells */
function pivotFromXml(e, c, xlNames, nb) {
  const yes = (el, k) => /^(1|true)$/.test(xat(el, k) || ''), no = (el, k) => /^(0|false)$/.test(xat(el, k) || '');
  const src = xkid(c, 'cacheSource'), ws = xkid(src, 'worksheetSource'), loc = xkid(e, 'location'), g = loc && parseRange(xat(loc, 'ref') || '');
  if (!src || (xat(src, 'type') || 'worksheet') !== 'worksheet' || !ws || [...ws.attributes].some(q => q.localName === 'id') || !g) return null;   // another file, or another kind of source
  let source = xat(ws, 'name');
  if (!source) { const i = xlNames.indexOf(xat(ws, 'sheet') || ''), sg = parseRange(xat(ws, 'ref') || ''); if (i < 0 || !sg) return null; source = sheetPrefix(nb.sheets[i].name) + absA1(sg); }
  if (no(e, 'rowGrandTotals') || no(e, 'colGrandTotals') || yes(e, 'dataOnRows') || no(e, 'compact') || no(e, 'compactData') || yes(e, 'gridDropZones') || no(e, 'showHeaders') || xkid(e, 'filters') || +(xat(loc, 'colPageCount') || 1) > 1) return null;
  const dec = t => (t || '').replace(/_x([0-9a-f]{4})_/gi, (m, hx) => String.fromCharCode(parseInt(hx, 16)));
  const cfs = xkids(xkid(c, 'cacheFields'), 'cacheField'), pfs = xkids(xkid(e, 'pivotFields'), 'pivotField');
  if (pfs.length !== cfs.length) return null;
  const names = cfs.map(f => dec(xat(f, 'name')));
  const one = el => { const v = xat(el, 'v'); switch (el.localName) { case 's': return v ?? ''; case 'n': return +v; case 'b': return v === '1' || v === 'true'; case 'e': return ERR[v] || E_NA; case 'd': return jsDateSerial(new Date(String(v).replace(/Z?$/, 'Z'))); default: return null; } };
  const shared = cfs.map(f => xkids(xkid(f, 'sharedItems')).map(one));
  const plain = i => i >= 0 && i < cfs.length && !xat(cfs[i], 'formula') && !xkid(cfs[i], 'fieldGroup') && xat(cfs[i], 'databaseField') !== '0';   // a field of the source itself
  const items = i => xkids(xkid(pfs[i], 'items'), 'item').filter(it => !xat(it, 't') && !yes(it, 'm'));
  const fields = el => xkids(el, 'field').map(f => +xat(f, 'x'));
  const rows = fields(xkid(e, 'rowFields')), cols0 = fields(xkid(e, 'colFields')), cols = cols0.filter(i => i !== -2), pages = xkids(xkid(e, 'pageFields'), 'pageField');
  if (rows.includes(-2) || (cols0.includes(-2) && cols0[cols0.length - 1] !== -2)) return null;   // the values in rows, or not innermost
  // rows and columns: as Excel shows them by itself (sorted, every item, subtotals above)
  for (const i of [...rows, ...cols]) {
    const f = pfs[i], its = items(i);
    if (!plain(i) || no(f, 'compact') || no(f, 'outline') || no(f, 'subtotalTop') || no(f, 'defaultSubtotal') || !no(f, 'showAll') || yes(f, 'insertBlankRow') || xat(f, 'sortType') === 'descending' || xkid(f, 'autoSortScope')) return null;
    if (['sum', 'countA', 'avg', 'max', 'min', 'product', 'count', 'stdDev', 'stdDevP', 'var', 'varP'].some(k => yes(f, k + 'Subtotal'))) return null;
    if (its.some(it => yes(it, 'h') || no(it, 'sd'))) return null;
    const vs = its.map(it => shared[i][+xat(it, 'x')]);
    if (vs.some((v, j) => j && pvCmp(vs[j - 1], v) > 0)) return null;   // an order of its own
  }
  // the filters: the item a filter shows, or those it lets through
  const filt = [];
  for (const pg of pages) {
    const i = +xat(pg, 'fld'), its = plain(i) ? items(i) : null;
    if (!its) return null;
    const key = it => pvKey(shared[i][+xat(it, 'x')]), k = xat(pg, 'item');
    let v = null;
    if (k != null && k !== '') { const it = its[+k]; if (it) v = [key(it)]; }
    else if (its.some(it => yes(it, 'h'))) v = its.filter(it => !yes(it, 'h')).map(key);
    filt.push({ f: names[i], ...(v ? { v } : {}) });
  }
  const vals = [];
  for (const d of xkids(xkid(e, 'dataFields'), 'dataField')) {
    const i = +xat(d, 'fld'), fn = xat(d, 'subtotal') || 'sum', sda = xat(d, 'showDataAs');
    if (!plain(i) || !PV_FN[fn] || (sda && sda !== 'normal')) return null;
    const cap = (xat(d, 'name') || '').trim();
    vals.push({ f: names[i], fn, ...(cap && cap !== T(PV_FN[fn], names[i]) ? { n: cap } : {}) });   // Excel's own caption, in this language, stays this language's
  }
  const r0 = g.r1 - (pages.length ? pages.length + 1 : 0);
  if (r0 < 0) return null;
  const p = normPivot({ name: xat(e, 'name') || 'PivotTable1', src: source, at: A1(r0, g.c1), rows: rows.map(i => names[i]), cols: cols.map(i => names[i]), vals, filt });
  return p && { p, area: [g, ...(pages.length ? [{ r1: r0, c1: g.c1, r2: g.r1 - 1, c2: Math.min(MAXC - 1, g.c1 + 1) }] : [])] };
}
/* the file's charts onto its sheets (by the sheet's name in the file); kinds that aren't here are counted for the report */
async function importCharts(buf, nb, xlNames, rep) {
  let found;
  try { found = await readXlsxCharts(buf); } catch (e) { console.warn(e); return; }
  const keep = [WB, WS];
  WB = nb;   // references name this workbook's sheets
  try {
    for (const [name, list] of found) {
      const s = nb.sheets[xlNames.indexOf(name)];
      if (!s) continue;
      for (const x of list) {
        if ('pic' in x) { const q = x.pic ? placeXlsxPic(s, nb, x) : null; if (q && s.pics.length < 100) s.pics.push(q); else rep.set('img', (rep.get('img') || 0) + 1); continue; }
        const ch = x.chart ? placeXlsxChart(s, x) : null;
        if (ch && s.charts.length < 50) s.charts.push(ch); else rep.set('chart', (rep.get('chart') || 0) + 1);
      }
    }
  } finally { [WB, WS] = keep; }
}
/* newer Excel functions need _xlfn. before their names inside the file (FILTER and SORT _xlfn._xlws.), or Excel reads
   them as unknown. B2# is written _xlfn.ANCHORARRAY(B2). @ is left out of a plain formula (it works that way by itself),
   and in an array formula it is written _xlfn.SINGLE( ) */
const NEW_FNS = new Set(['CONCAT', 'TEXTJOIN', 'IFS', 'SWITCH', 'MAXIFS', 'MINIFS', 'XLOOKUP', 'XMATCH', 'SORTBY', 'UNIQUE', 'SEQUENCE', 'RANDARRAY', 'LET', 'LAMBDA',
  'IFNA', 'XOR', 'DAYS', 'ISOWEEKNUM', 'ISFORMULA', 'UNICHAR', 'UNICODE', 'STDEV.S', 'STDEV.P', 'VAR.S', 'VAR.P', 'MODE.SNGL', 'RANK.EQ', 'RANK.AVG', 'PERCENTILE.INC',
  'QUARTILE.INC', 'CEILING.MATH', 'FLOOR.MATH', 'AGGREGATE', 'FORMULATEXT', 'TEXTBEFORE', 'TEXTAFTER', 'TEXTSPLIT', 'VSTACK', 'HSTACK', 'TAKE', 'DROP', 'CHOOSECOLS',
  'CHOOSEROWS', 'TOCOL', 'TOROW', 'WRAPROWS', 'WRAPCOLS', 'EXPAND', 'ANCHORARRAY', 'SINGLE', 'PDURATION', 'RRI', 'MAP', 'REDUCE', 'SCAN', 'BYROW', 'BYCOL', 'MAKEARRAY', 'ISOMITTED']);
/* the functions only an Excel with arrays that spill has: a formula of a file that uses one was never written the older
   way (a range standing alone taking one cell) */
const DA_FNS = new Set(['LET', 'LAMBDA', 'MAP', 'REDUCE', 'SCAN', 'BYROW', 'BYCOL', 'MAKEARRAY', 'ISOMITTED', 'FILTER', 'SORT', 'SORTBY', 'UNIQUE', 'SEQUENCE', 'RANDARRAY', 'XLOOKUP', 'XMATCH', 'TEXTSPLIT',
  'TEXTBEFORE', 'TEXTAFTER', 'VSTACK', 'HSTACK', 'TAKE', 'DROP', 'CHOOSECOLS', 'CHOOSEROWS', 'TOCOL', 'TOROW', 'WRAPROWS', 'WRAPCOLS', 'EXPAND']);
const olderWay = f => !tokenize(f).some(t => (t.t === 'fn' && DA_FNS.has(t.n)) || (t.t === 'op' && t.s === '@') || (t.t === 'ref' && t.sp));
const XLWS = new Set(['FILTER', 'SORT']);
/* an error as a file keeps it. #SPILL! and #CALC! came with Excel 365, and an older Excel refuses a whole file that has
   one of them as a value (measured in Excel 2016): they are written #VALUE!, and the formula gives the real one again */
const OLD_ERRS = new Set(['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A']);
const xlErr = v => ({ error: OLD_ERRS.has(v.c) ? v.c : '#VALUE!' });
function xlFormula(f, arr, tbl) {
  const toks = tokenize(f), out = [];
  // LET and LAMBDA: inside their brackets the names they give are written _xlpm.name, and [name] _xlop.name, as Excel
  // keeps them. scopes: each one's bracket depth, which argument the walk is in, and its names
  const scopes = [], near = (i, d) => { do i += d; while (toks[i] && toks[i].t === 'ws'); return toks[i]; };
  let depth = 0, opening = null;
  const given = n => scopes.some(sc => sc.names.has(n.toLowerCase()));
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], top = scopes[scopes.length - 1];
    if (t.t === '(') { depth++; if (opening) { scopes.push({ depth, kind: opening, arg: 0, names: new Set() }); opening = null; } }
    else if (t.t === ')') { while (scopes.length && scopes[scopes.length - 1].depth === depth) scopes.pop(); depth--; }
    else if (t.t === ',' && top && top.depth === depth) top.arg++;
    else if (t.t !== 'ws') opening = t.t === 'fn' && (t.n === 'LET' || t.n === 'LAMBDA') ? t.n : null;
    if (top && top.depth === depth && (t.t === 'opt' || (t.t === 'name' && t.sheet == null)) && ['(', ','].includes((near(i, -1) || {}).t) && (near(i, 1) || {}).t === ',' && (top.kind === 'LAMBDA' || top.arg % 2 === 0)) {
      top.names.add(t.n.toLowerCase());   // here a name is given
      out.push(t.t === 'opt' ? '_xlop.' + t.n : '_xlpm.' + t.s);
      continue;
    }
    if ((t.t === 'name' && t.sheet == null && given(t.n)) || (t.t === 'fn' && !FUNCS[t.n] && given(t.s))) { out.push('_xlpm.' + t.s); continue; }
    if (t.t === 'tref' || t.t === 'opt') { out.push(trefText(t.t === 'opt' ? { tbl: null, sp: {}, cols: [t.n] } : t, tbl, true)); continue; }
    if (t.t === 'name' && t.sheet == null && WB && !nameOf(t, null) && tableByName(t.n)) { out.push(t.s + '[]'); continue; }   // a table's name alone: Sales[]
    if (t.t === 'fn' && !/^_xl/i.test(t.s)) out.push((XLWS.has(t.n) ? '_xlfn._xlws.' : NEW_FNS.has(t.n) ? '_xlfn.' : '') + t.s);
    else if (t.t === 'ref' && t.sp) out.push('_xlfn.ANCHORARRAY(' + t.s.slice(0, -1) + ')');
    else if (t.t === 'op' && t.s === '@') {
      if (!arr) continue;
      // what @ stands before: a reference, or a function or brackets up to where they close, and on through any : after it
      const skip = j => { while (toks[j] && toks[j].t === 'ws') j++; return j; };
      const endOf = j => {
        let end = j;
        if (toks[j] && (toks[j].t === 'fn' || toks[j].t === '(')) { let depth = 0; for (end = toks[j].t === 'fn' ? j + 1 : j; end < toks.length; end++) { if (toks[end].t === '(') depth++; else if (toks[end].t === ')' && --depth === 0) break; } }
        return end;
      };
      const j = skip(i + 1);
      let end = endOf(j);
      for (let k = skip(end + 1); toks[k] && toks[k].t === 'op' && toks[k].s === ':'; k = skip(end + 1)) end = endOf(skip(k + 1));
      out.push('_xlfn.SINGLE(' + xlFormula(toks.slice(j, end + 1).map(x => x.s).join(''), true, tbl) + ')');
      i = end;
    }
    else out.push(t.t === ',' ? ',' : t.s);
  }
  return out.join('');
}
/* and back: what the file wrote for # and @ */
function fromXl(f) {
  const out = f.replace(/_xlfn\.ANCHORARRAY\(((?:'(?:[^']|'')+'!|[^()'!,]+!)?\$?[A-Za-z]{1,3}\$?\d+)\)/gi, '$1#').replace(/_xlfn\.SINGLE\(/gi, '@(');
  if (!/_xl(?:pm|op)\./i.test(out)) return out;
  return tokenize(out).map(t => t.t === 'name' && /^_xlop\./i.test(t.s) ? '[' + t.s.slice(6) + ']' : (t.t === 'name' || t.t === 'fn') && /^_xlpm\./i.test(t.s) ? t.s.slice(6) : t.s).join('');
}
/* a name's formula from a file without the _xlfn. before the functions known here (a cell's keeps it, and shows without) */
const bareFns = f => /_xl(?:fn|ws)\./i.test(f) ? tokenize(f).map(t => t.t === 'fn' && FUNCS[t.n] ? t.s.replace(/^(?:_xl(?:fn|ws)\.)+/i, '') : t.s).join('') : f;
/* the part Excel 365 adds for its array formulas, which cm="1" on a cell points to */
const XL_META = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray"><metadataTypes count="1"><metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/></metadataTypes><futureMetadata name="XLDAPR" count="1"><bk><extLst><ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}"><xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata><cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata></metadata>';
/* array formulas marked the way Excel 365 marks its own, so it spills them instead of showing {=...} */
async function addDynamic(buf) {
  const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf);
  for (const p of Object.keys(zip.files).filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))) {
    const x = await zip.file(p).async('string'), y = x.replace(/<c ([^>]*?)>(<f t="array")/g, (m, a, f) => /\bcm=/.test(a) ? m : `<c ${a} cm="1">${f}`);
    if (y !== x) zip.file(p, y);
  }
  zip.file('xl/metadata.xml', XL_META);
  let ct = await zip.file('[Content_Types].xml').async('string');
  if (!ct.includes('/xl/metadata.xml')) ct = ct.replace('</Types>', '<Override PartName="/xl/metadata.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml"/></Types>');
  zip.file('[Content_Types].xml', ct);
  const rp = 'xl/_rels/workbook.xml.rels';
  let rx = await zip.file(rp).async('string');
  if (!rx.includes('Target="metadata.xml"')) {
    let k = 1;
    while (rx.includes(`Id="rId${k}"`)) k++;
    rx = rx.replace('</Relationships>', `<Relationship Id="rId${k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata" Target="metadata.xml"/></Relationships>`);
    zip.file(rp, rx);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
const XL_BD = { 1: 'thin', 2: 'medium', 3: 'thick' };
function bdOut(b) {
  if (!b) return undefined;
  const w = +b[0], k = b[1], style = k === '=' ? 'double' : k === 'd' ? (w > 1 ? 'mediumDashed' : 'dashed') : k === 'o' ? 'dotted' : XL_BD[w];
  return { style, color: { argb: 'FF' + b.slice(3).toUpperCase() } };
}
function xlStyleOut(st) {
  st = st || {};
  const out = { font: { name: st.ff || DEF_FONT, size: st.fs || DEF_FS } };
  if (st.b) out.font.bold = true;
  if (st.i) out.font.italic = true;
  if (st.u) out.font.underline = true;
  if (st.s) out.font.strike = true;
  if (st.c) out.font.color = { argb: 'FF' + st.c.slice(1).toUpperCase() };
  if (st.bg) out.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + st.bg.slice(1).toUpperCase() } };
  const al = {};
  if (st.ha) al.horizontal = { l: 'left', c: 'center', r: 'right' }[st.ha];
  if (st.va) al.vertical = { t: 'top', m: 'middle', b: 'bottom' }[st.va];
  if (st.wr) al.wrapText = true;
  if (Object.keys(al).length) out.alignment = al;
  if (st.bt || st.bb || st.bs || st.be) out.border = { top: bdOut(st.bt), bottom: bdOut(st.bb), left: bdOut(st.bs), right: bdOut(st.be) };
  if (st.nf) out.numFmt = st.nf;
  return out;
}
async function writeXlsx() {
  const ExcelJS = await excelLib(), wb = new ExcelJS.Workbook();
  wb.creator = 'Floating Ink'; wb.created = wb.modified = new Date();
  wb.views = [{ activeTab: Math.max(0, WB.sheets.indexOf(WS)), firstSheet: 0, visibility: 'visible' }];
  if (WS) WS.ac = { r: SEL.r, c: SEL.c };
  let dyn = false;
  for (const s of WB.sheets) {
    const view = { rightToLeft: s.dir === 'rtl', showGridLines: s.gl, activeCell: A1(s.ac.r, s.ac.c), zoomScale: s.zoom };
    if (s.fr || s.fc) Object.assign(view, { state: 'frozen', xSplit: s.fc, ySplit: s.fr, topLeftCell: A1(s.fr, s.fc) });
    const ws = wb.addWorksheet(s.name, { views: [view], properties: { defaultRowHeight: +(s.dh * 0.75).toFixed(2), defaultColWidth: pxToChars(s.dw), ...(s.tab ? { tabColor: { argb: 'FF' + s.tab.slice(1).toUpperCase() } } : {}) } });
    const u = usedEnd(s);
    let lastC = u.c;
    for (const c of s.cw.keys()) lastC = Math.max(lastC, c + 1);
    for (const c of s.hc) lastC = Math.max(lastC, c + 1);
    for (const c of s.cs.keys()) lastC = Math.max(lastC, c + 1);
    lastC = Math.min(lastC + 5, MAXC);
    for (let c = 0; c < lastC; c++) {
      const col = ws.getColumn(c + 1);
      col.width = pxToChars(s.cw.get(c) ?? s.dw);
      if (s.hc.has(c)) col.hidden = true;
      const cs = s.cs.get(c) || s.ds;
      if (cs) col.style = xlStyleOut(cs);
    }
    for (const [r, hgt] of s.rh) ws.getRow(r + 1).height = +(hgt * 0.75).toFixed(2);
    for (const r of s.hr) ws.getRow(r + 1).hidden = true;
    for (const r of s._fh || []) ws.getRow(r + 1).hidden = true;
    for (const [r, st] of s.rs) ws.getRow(r + 1).style = xlStyleOut(st);
    for (const k of [...s.cells.keys()].sort((a, b) => a - b)) {
      const x = s.cells.get(k), cell = ws.getCell(kr(k) + 1, kc(k) + 1);
      if (x.f != null && !x.x && !astOf(x.f)) cell.value = '=' + x.f;   // a formula that can't be read (Claude's tool takes any text): written as text, because Excel refuses a whole file for one such formula
      else if (x.f != null) {
        // an array answer (or math done cell by cell) is written the way Excel 365 writes it: an array formula over the cells it fills
        const area =!x.l && !x.x && s._sa && s._sa.get(k), arr = !x.l && !x.x && !!(area || x.dx), result = isErr(x.v) ? xlErr(x.v) : x.v ?? 0;
        const tb = s.tables.length ? tableAt(s, kr(k), kc(k)) : null;   // [Col] inside a table is its column
        cell.value = arr ? { formula: xlFormula(x.f, true, tb && tb.name), result, shareType: 'array', ref: area ? rangeA1(area) : A1(kr(k), kc(k)) } : { formula: xlFormula(x.f, false, tb && tb.name), result };
        if (arr) dyn = true;
      }
      else if (isErr(x.v)) cell.value = xlErr(x.v);
      else if (x.v != null) cell.value = x.v;   // a text of no letters too (what a file has where "" was pasted as a value): COUNTA and "*" count it
      cell.style = xlStyleOut(x.st);
      if (x.n) cell.note = x.n;
    }
    // the values a formula spilled, as plain values the way Excel keeps them
    if (s._sp) for (const [k, o] of s._sp) {
      const x = s.cells.get(k);
      if ((x && x.v !== undefined) || o.v == null || o.v === '') continue;
      const cell = ws.getCell(kr(k) + 1, kc(k) + 1);
      cell.value = isErr(o.v) ? xlErr(o.v) : o.v;
      if (!x) cell.style = xlStyleOut(emptyLook(s, kr(k), kc(k)));
    }
    for (const m of s.merges) ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1);
    if (s.af && !s.tables.some(t => meets(t.g, s.af))) ws.autoFilter = { from: { row: s.af.r1 + 1, column: s.af.c1 + 1 }, to: { row: filterEnd(s.af, s) + 1, column: s.af.c2 + 1 } };   // a table's filter is written in the table's own part
  }
  let buf = await xlTheme(await wb.xlsx.writeBuffer());
  if (WB.sheets.some(s => s.charts.length || s.pics.length)) buf = await addXlsxCharts(buf);
  if (dyn) buf = await addDynamic(buf);
  if (WB.sheets.some(s => s.dv.length)) buf = await addXlsxDv(buf);
  if (WB.sheets.some(s => s.cf.length)) buf = await addXlsxCf(buf);
  if (WB.sheets.some(s => { for (const x of s.cells.values()) if (x.k) return true; return false; })) buf = await addXlsxLinks(buf);
  if ((WB.names || NO_NAMES).length) buf = await addXlsxNames(buf);
  if (WB.sheets.some(s => s.tables.length)) buf = await addXlsxTables(buf);
  if (WB.sheets.some(s => s.pivots.length)) buf = await addXlsxPivots(buf);
  return new Blob([buf], { type: XLSX_MIME });
}
/* the file's theme: Excel's own since Office 2013 (its colors are OFFICE_THEME), in place of the older one ExcelJS writes,
   so the styles of tables and pivot tables, which take their colors from it, look in Excel as they do here */
async function xlTheme(buf) {
  const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf), p = 'xl/theme/theme1.xml', f = zip.file(p);
  if (!f) return buf;
  const one = (n, i) => `<a:${n}><a:srgbClr val="${OFFICE_THEME[i].slice(1).toUpperCase()}"/></a:${n}>`;
  const scheme = '<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    one('dk2', 3) + one('lt2', 2) + ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map((n, i) => one(n, i + 4)).join('') + '</a:clrScheme>';
  zip.file(p, (await f.async('string')).replace(/<a:clrScheme[\s\S]*?<\/a:clrScheme>/, () => scheme).replace(/(<a:majorFont>\s*<a:latin typeface=")[^"]*"/, '$1Calibri Light"'));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
/* links into each sheet's <hyperlinks>: a web address or an email through the sheet's links (TargetMode External), a
   place in the workbook as location, the way Excel writes them. ExcelJS writes a link only on a cell of text */
async function addXlsxLinks(buf) {
  const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf);
  for (let i = 0; i < WB.sheets.length; i++) {
    const list = [...WB.sheets[i].cells].filter(([, x]) => x.k).sort((a, b) => a[0] - b[0]);
    const sp = `xl/worksheets/sheet${i + 1}.xml`, sf = zip.file(sp);
    if (!list.length || !sf) continue;
    const rp = relsOf(sp), rf = zip.file(rp);
    let rx = rf ? await rf.async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>', id = 1;
    const out = list.map(([k, x]) => {
      const ref = A1(kr(k), kc(k));
      if (x.k[0] === '#') return `<hyperlink ref="${ref}" location="${esc(x.k.slice(1))}"/>`;
      while (rx.includes(`Id="rId${id}"`)) id++;
      rx = rx.replace('</Relationships>', `<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(x.k)}" TargetMode="External"/></Relationships>`);
      return `<hyperlink ref="${ref}" r:id="rId${id}"/>`;
    });
    zip.file(rp, rx);
    let sx = await sf.async('string');
    if (!/xmlns:r=/.test(sx.slice(0, 600))) sx = sx.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    const at = ['<printOptions', '<pageMargins', '<pageSetup', '<headerFooter', '<rowBreaks', '<colBreaks', '<customProperties', '<cellWatches', '<ignoredErrors', '<smartTags', '<drawing', '<legacyDrawing', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>'].map(t => sx.indexOf(t)).filter(q => q >= 0);
    const pos = Math.min(...at);
    sx = sx.slice(0, pos) + '<hyperlinks>' + out.join('') + '</hyperlinks>' + sx.slice(pos);
    zip.file(sp, sx);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
/* defined names in Excel files: ExcelJS keeps only names for plain cells, without their scope or note, so they are
   written into the workbook's own part here, and read from it. A name of one sheet has that sheet's number
   (localSheetId), counted among all the file's sheets */
async function addXlsxNames(buf) {
  const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf), p = 'xl/workbook.xml', file = zip.file(p);
  if (!file) return buf;
  let x = await file.async('string');
  const xml = WB.names.map(nm => {
    const i = nm.s ? WB.sheets.findIndex(s => s.id === nm.s) : -1;
    return `<definedName name="${esc(nm.n)}"${nm.c ? ` comment="${xlAttr(nm.c)}"` : ''}${i >= 0 ? ` localSheetId="${i}"` : ''}${nm.h ? ' hidden="1"' : ''}>${esc(xlFormula(nm.f))}</definedName>`;
  }).join('');
  // (through a function: in a plain replacement text a $ of a formula could be read as a pattern)
  if (x.includes('<definedNames>')) x = x.replace('<definedNames>', () => '<definedNames>' + xml);
  else if (/<definedNames\s*\/>/.test(x)) x = x.replace(/<definedNames\s*\/>/, () => `<definedNames>${xml}</definedNames>`);
  else if (x.includes('</sheets>')) x = x.replace('</sheets>', () => `</sheets><definedNames>${xml}</definedNames>`);
  else return buf;
  zip.file(p, x);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
/* a file's names: { sheets: every sheet's name in the file's order, names: [{ n, f, li: the number of its sheet, c, h }] }.
   Left out: Excel's own (the print area, a filter's range: _xlnm.), what newer functions leave behind (_xl...), and
   names that point into another file or a table ([ ]), which can't be kept true here */
async function readXlsxNames(buf) {
  const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf), f = zip.file('xl/workbook.xml'), out = { sheets: [], names: [] };
  if (!f) return out;
  const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
  out.sheets = xdesc(doc, 'sheet').map(e => xat(e, 'name') || '');
  for (const e of xdesc(doc, 'definedName')) {
    const n = xat(e, 'name') || '', t = e.textContent.trim().replace(/^=/, ''), li = xat(e, 'localSheetId');
    if (!n || /^_xl/i.test(n) || !t || t.includes('[')) continue;
    out.names.push({ n, f: bareFns(fromXl(t)), li: li == null || li === '' ? null : +li, c: xat(e, 'comment') || '', h: xat(e, 'hidden') === '1' || xat(e, 'hidden') === 'true' });
  }
  return out;
}
/* CSV: each cell as text another program reads back the same: numbers plain (no ₪ or thousands marks), dates, times and
   percents the way they show. A comma between cells (a semicolon where the comma is the decimal point), and a BOM
   first, so Excel reads Hebrew in it right */
const BOM_CH = String.fromCharCode(0xFEFF);
function csvOut(s = WS, sep = DEC === ',' ? ';' : ',') {
  const u = usedRange(s);
  if (!u) return BOM_CH;
  const lines = [];
  for (let r = 0; r <= u.r2; r++) {
    const row = [];
    for (let c = 0; c <= u.c2; c++) {
      const x = cellSp(s, r, c), k = x && typeof x.v === 'number' ? nfKind(x.st && x.st.nf) : null;
      const t = !x ? '' : k && !['date', 'ldate', 'time', 'pct'].includes(k) ? genText(x.v, 15) : view(x).t;
      row.push(t.includes(sep) || /["\r\n]/.test(t) || /^\s|\s$/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t);
    }
    lines.push(row.join(sep));
  }
  return BOM_CH + lines.join('\r\n') + '\r\n';
}
function csvRows(text, tabs) {
  const t = text.startsWith(BOM_CH) ? text.slice(1) : text;
  let sep = '\t';
  if (!tabs) {
    const head = t.split(/\r?\n/).slice(0, 8).join('\n').replace(/"(?:[^"]|"")*"/g, '');
    const n = ch => head.split(ch).length - 1;
    sep = [',', ';', '\t', '|'].sort((a, b) => n(b) - n(a))[0];
  }
  const rows = [[]];
  let cur = '', q = false, quoted = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"' && cur === '' && !quoted) { q = quoted = true; continue; }
    if (ch === sep) { rows[rows.length - 1].push({ t: cur, q: quoted }); cur = ''; quoted = false; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { rows[rows.length - 1].push({ t: cur, q: quoted }); cur = ''; quoted = false; rows.push([]); continue; }
    cur += ch;
  }
  if (cur !== '' || quoted || rows[rows.length - 1].length) rows[rows.length - 1].push({ t: cur, q: quoted });
  if (rows.length && !rows[rows.length - 1].length) rows.pop();
  return rows;
}
function csvBook(text, name, tabs) {
  const rows = csvRows(text, tabs), s = newSheet(cleanName(name) || sheetWord(1), UI_DIR), widths = new Map();
  rows.slice(0, MAXR).forEach((row, r) => row.slice(0, MAXC).forEach((f, c) => {
    if (f.t === '') return;
    const p = parseInput(f.t);
    if (!p) return;
    const x = p.f != null ? { f: p.f, v: 0 } : { v: p.v };
    if (p.nf) x.st = { nf: p.nf };
    s.cells.set(KEY(r, c), x);
    widths.set(c, Math.max(widths.get(c) || 0, Math.min(320, textW(f.t, fontOf(null, DEF_FS * 4 / 3)) + 14)));
  }));
  for (const [c, w] of widths) if (w > s.dw) s.cw.set(c, Math.ceil(w));
  let rtl = 0, ltr = 0;
  for (const x of s.cells.values()) if (typeof x.v === 'string') { const d = textDir(x.v); if (d === 'rtl') rtl++; else if (d === 'ltr') ltr++; }
  s.dir = rtl || ltr ? (rtl >= ltr ? 'rtl' : 'ltr') : UI_DIR;
  if (rows.length > 1 && guessHeadOf(s)) s.fr = 1;
  return bookOut(normBook({ v: 1, dir: s.dir, active: 0, sheets: [sheetOut(s)] }));
}
/* a first row of text over numbers is a header, and stays in view */
function guessHeadOf(s) { const keep = WS; WS = s; try { const u = usedRange(s); return !!u && guessHead({ r1: 0, c1: 0, r2: Math.min(u.r2, 50), c2: u.c2 }); } finally { WS = keep; } }
/* a file picked, dropped or opened from File Explorer: an Excel workbook or a CSV */
async function readFile(f) {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') { const { text } = await readText(f); return { book: csvBook(text, f.name.replace(/\.[^.]+$/, ''), ext === 'tsv'), rep: new Map() }; }
  return readXlsx(await f.arrayBuffer());
}
const REP = {
  chart: N_('{n} גרפים מסוג שעוד אין כאן לא נפתחו'), pivot: N_('{n} טבלאות ציר נפתחו כתאים רגילים'), img: N_('{n} תמונות לא נפתחו'),
  fn: N_('{n} נוסחאות משתמשות בפונקציות שעוד אין כאן. הן מראות את הערך שנשמר בקובץ'), note: N_('{n} הערות על תאים לא נפתחו'), link: N_('{n} קישורים נפתחו כטקסט רגיל'),
  cond: N_('{n} כללים של עיצוב מותנה מסוג שעוד אין כאן לא נפתחו'), valid: N_('{n} כללים של אימות נתונים לא נפתחו'), dvfn: N_('{n} כללים של אימות נתונים משתמשים בפונקציה או בשם שעוד אין כאן, ולכן לא נבדקים'), table: N_('{n} גיליונות עם טבלאות מעוצבות נפתחו כתאים רגילים'),
  hidden: N_('{n} גיליונות מוסתרים נפתחו כגיליונות רגילים'),
};
const repLines = rep => [...rep].filter(([k, n]) => REP[k] && n > 0).map(([k, n]) => TN(REP[k], n));

/* PDF: the used part of the sheet on A4 pages (sideways when it is wide), shrunk to the page's width if needed, the
   frozen rows again at the top of every page. Each page is drawn to a picture (html2canvas) and put in the PDF (jsPDF) */
async function sheetPdf() {
  await Promise.all([loadScript(LIB.jspdf), loadScript(LIB.html2canvas)]);
  if (!window.jspdf || !window.html2canvas) throw new Error('lib');
  const u = usedRange(WS) || { r1: 0, c1: 0, r2: 0, c2: 0 };
  const table = tableEl(WS, u, { grid: WS.gl });
  const W = table._w, land = W > 760, pageW = land ? 1047 : 718, pageH = (land ? 718 : 1047) - 4, k = Math.min(1, pageW / W);
  const host = h('div', { style: { position: 'fixed', left: '-20000px', top: '0', background: '#fff', width: W + 'px' } }, table);
  document.body.append(host);
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const rows = [...table.tBodies[0].rows], head = rows.slice(0, Math.min(WS.fr, rows.length - 1)), headH = head.reduce((a, r) => a + r.offsetHeight, 0) * k;
    const pages = [];
    let cur = [], hgt = headH;
    for (const r of rows.slice(head.length)) { const rh = r.offsetHeight * k; if (cur.length && hgt + rh > pageH) { pages.push(cur); cur = []; hgt = headH; } cur.push(r); hgt += rh; }
    if (cur.length || !pages.length) pages.push(cur);
    const pdf = new window.jspdf.jsPDF({ orientation: land ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
    const mm = 25.4 / 96;
    let lastY = 10;
    for (let i = 0; i < pages.length; i++) {
      const t = table.cloneNode(false);
      t.append(table.querySelector('colgroup').cloneNode(true));
      const tb = h('tbody');
      for (const r of [...head, ...pages[i]]) tb.append(r.cloneNode(true));
      t.append(tb);
      const box = h('div', { style: { position: 'fixed', left: '-20000px', top: '0', background: '#fff', width: W + 'px', direction: WS.dir } }, t);
      document.body.append(box);
      const cv = await window.html2canvas(box, { scale: 2 * Math.max(k, 0.5), backgroundColor: '#ffffff', logging: false, useCORS: true });
      box.remove();
      if (i) pdf.addPage('a4', land ? 'landscape' : 'portrait');
      const wmm = W * k * mm, hmm = cv.height / cv.width * wmm, x = WS.dir === 'rtl' ? (land ? 297 : 210) - 10 - wmm : 10;
      pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', x, 10, wmm, hmm);
      cv.width = cv.height = 0;
      lastY = 10 + hmm;
    }
    // the charts after the table: each at its size (or the page's width), below it while there is room
    const pw = (land ? 297 : 210) - 20, ph = (land ? 210 : 297) - 10;
    let y = lastY + 6;
    for (const box of chartEls(WS, pw / mm)) {
      const holder = h('div', { style: { position: 'fixed', left: '-20000px', top: '0' } }, box);
      document.body.append(holder);
      const cv = await window.html2canvas(box, { scale: 2, backgroundColor: '#ffffff', logging: false });
      holder.remove();
      const wmm = parseFloat(box.style.width) * mm, hmm = parseFloat(box.style.height) * mm;
      if (y + hmm > ph) { pdf.addPage('a4', land ? 'landscape' : 'portrait'); y = 10; }
      pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', WS.dir === 'rtl' ? (land ? 297 : 210) - 10 - wmm : 10, y, wmm, hmm);
      cv.width = cv.height = 0;
      y += hmm + 6;
    }
    return pdf.output('blob');
  } finally { host.remove(); }
}
/* printing: the used part of the sheet as a table, its frozen rows repeated on each page, sideways when it is wide */
async function sheetPrint() {
  const u = usedRange(WS) || { r1: 0, c1: 0, r2: 0, c2: 0 };
  const t = tableEl(WS, u, { grid: WS.gl }), W = t._w, land = W > 760, room = land ? 1047 : 718;
  if (WS.fr) { const th = h('thead'), rows = [...t.tBodies[0].rows].slice(0, WS.fr); for (const r of rows) th.append(r); t.insertBefore(th, t.tBodies[0]); }
  if (W > room) t.style.zoom = String(room / W);
  const rule = $('#pageRule'), before = rule.textContent;
  rule.textContent = `@page{size:A4 ${land ? 'landscape' : 'portrait'};margin:10mm}`;
  V.print.textContent = '';
  V.print.append(h('div', { class: 'sh-print-sheet', dir: WS.dir }, t, ...chartEls(WS, room).map(b => h('div', { style: { marginTop: '14px', breakInside: 'avoid' } }, b))));
  document.documentElement.classList.add('sheet-print');
  return () => { document.documentElement.classList.remove('sheet-print'); V.print.textContent = ''; rule.textContent = before; };
}

/* =========================================================
   ready-made spreadsheets, and spreadsheets described by Claude through the connector
   ========================================================= */
const NF_NAMES = () => ({ general: null, number: NUM_NF, integer: '#,##0', currency: curNf(CUR), currency_ils: curNf('₪'), currency_usd: curNf('$'), currency_eur: curNf('€'), percent: PCT_NF, percent2: '0.00%', date: DATE_NF, long_date: LDATE_NF, time: TIME_NF, text: '@' });
/* one sheet's part of a description: rows from a start cell, single cells, formats, column widths, freezing */
function applySpec(book, s, spec, log) {
  const put = (r, c, v) => {
    if (r >= MAXR || c >= MAXC) return 0;
    if (log && log.length < 5000) log.push([r, c]);
    const cur = cellAt(s, r, c), st0 = cur ? cur.st : emptyLook(s, r, c);
    if (v == null || v === '') { setCell(s, r, c, keepOn(cur, st0 ? { st: st0 } : null)); return 1; }
    const p = typeof v === 'number' ? (Number.isFinite(v) ? { v } : null) : typeof v === 'boolean' ? { v } : parseInput(String(v), st0 && st0.nf);
    if (!p) return 0;
    const x = p.f != null ? { f: tidyFormula(closeBrackets(p.f), book), v: 0 } : { v: p.v };
    const nf = p.nf || (p.f != null && !(st0 && st0.nf) ? autoNf(x.f, s) : null), st = nf ? { ...(st0 || {}), nf } : st0;
    if (st) x.st = st;
    setCell(s, r, c, keepOn(cur, x));
    return 1;
  };
  let n = 0;
  if (spec.clear) { const g = parseRange(spec.clear); if (g) for (const [k] of [...s.cells]) if (inG(g, kr(k), kc(k))) { setCell(s, kr(k), kc(k), null); n++; } }
  const at = parseA1(spec.start || 'A1') || { r: 0, c: 0 };
  if (Array.isArray(spec.rows)) spec.rows.slice(0, 5000).forEach((row, i) => { if (Array.isArray(row)) row.slice(0, 500).forEach((v, j) => { if (v !== undefined) n += put(at.r + i, at.c + j, v); }); });
  if (spec.cells && typeof spec.cells === 'object') for (const [a, v] of Object.entries(spec.cells)) { const p = parseA1(a); if (p) n += put(p.r, p.c, v); }
  if (spec.notes && typeof spec.notes === 'object') for (const [a, t] of Object.entries(spec.notes).slice(0, 5000)) {
    const p = parseA1(a), text = t == null ? '' : String(t).replace(/\s+$/, '');
    if (!p || p.r >= MAXR || p.c >= MAXC) continue;
    const x = cellAt(s, p.r, p.c), m = { ...(x || {}) };
    if (text) m.n = text.slice(0, 32767); else delete m.n;
    setCell(s, p.r, p.c, m.f != null || m.v !== undefined || m.st || m.n ? m : null);
    n++;
  }
  // formatted tables: the range's first row is the header row (its names); a total row takes the next row when it is free
  for (const d of Array.isArray(spec.tables) ? spec.tables.slice(0, 50) : []) {
    const g = d && typeof d === 'object' ? parseRange(String(d.range || '').replace(/^=/, '')) : null;
    if (!g || wholeCols(g) || wholeRows(g) || s.tables.some(t => meets(t.g, g)) || s.merges.some(m => meets(m, g))) continue;
    const taken = new Set((book.names || []).map(x => x.n.toLowerCase()));
    for (const sh of book.sheets) for (const t of sh.tables) taken.add(t.name.toLowerCase());
    const st = String(d.style || '').replace(/\s+/g, ''), style = tsOf(/^TableStyle/i.test(st) ? 'TableStyle' + st.slice(10).replace(/^./, m => m.toUpperCase()) : 'TableStyle' + st.replace(/^./, m => m.toUpperCase()));
    let t = tableOn(s, g, { name: d.name, style, sr: d.banded_rows !== false, sc: d.banded_columns === true, fc: d.first_column === true, lc: d.last_column === true, fb: d.filter_button !== false }, taken);
    if (d.total_row === true) { const y = totalRowOn(s, t); if (y) { setProp(s, 'tables', s.tables.map(o => o === t ? y : o)); t = y; } }
    n++;
  }
  // pivot tables: { source (a range or a table's name), at, rows, columns, values: [{ field, summarize, name }], filters: [{ field, values: the items it lets through }] }
  const pvNames = new Set(); for (const sh of book.sheets) for (const x of sh.pivots) pvNames.add(x.name.toLowerCase());
  for (const d of Array.isArray(spec.pivots) ? spec.pivots.slice(0, 20) : []) {
    if (!d || typeof d !== 'object' || typeof d.source !== 'string' || !d.source.trim()) continue;
    let srcT = d.source.trim().replace(/^=/, '');
    const g0 = parseRange(srcT);
    if (g0) srcT = sheetPrefix(s.name) + absA1(g0);   // a range without its sheet is on this sheet
    const at = parseA1(String(d.at || '').replace(/^=/, '')) || { r: 0, c: usedEnd(s).c + 1 };
    let k = 1; while (pvNames.has(('PivotTable' + k).toLowerCase())) k++;
    const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim() : 'PivotTable' + k;
    pvNames.add(name.toLowerCase());
    const fnOf = v => ({ sum: 'sum', count: 'count', average: 'average', avg: 'average', max: 'max', min: 'min', product: 'product', count_numbers: 'countNums', countnums: 'countNums', stddev: 'stdDev', std_dev: 'stdDev', stddevp: 'stdDevp', std_dev_p: 'stdDevp', var: 'var', variance: 'var', varp: 'varp', var_p: 'varp' })[String(v || 'sum').toLowerCase()] || 'sum';
    const x = normPivot({ name, src: srcT, at: A1(at.r, at.c), rows: d.rows, cols: d.columns, vals: (Array.isArray(d.values) ? d.values : []).map(v => typeof v === 'string' ? { f: v } : v && { f: v.field, fn: fnOf(v.summarize), n: v.name }), filt: (Array.isArray(d.filters) ? d.filters : []).map(f => typeof f === 'string' ? { f } : f && { f: f.field, ...(Array.isArray(f.values) && f.values.length ? { v: f.values.map(pvKey) } : {}) }) });
    if (x) { setProp(s, 'pivots', [...s.pivots, x]); n++; }
  }
  if (spec.links && typeof spec.links === 'object') for (const [a, t] of Object.entries(spec.links).slice(0, 5000)) {
    const p = parseA1(a), k = t ? linkOk(/^www\./i.test(String(t).trim()) ? 'https://' + String(t).trim() : t) : null;
    if (!p || p.r >= MAXR || p.c >= MAXC || (t && !k)) continue;
    const x = cellAt(s, p.r, p.c), m = { ...(x || {}) };
    if (k) { m.k = k; if (!(m.st && m.st.c)) m.st = normStyle({ ...(m.st || {}), ...LINK_LOOK }); if (m.f == null && (m.v == null || m.v === '')) m.v = k[0] === '#' ? k.slice(1) : k.replace(/^mailto:/i, ''); }
    else delete m.k;
    setCell(s, p.r, p.c, m.f != null || m.v !== undefined || m.st || m.n || m.k ? m : null);
    n++;
  }
  const cw = spec.column_widths;
  if (cw && typeof cw === 'object') {
    const m = new Map(s.cw);
    for (const [k, v] of Array.isArray(cw) ? cw.map((v, i) => [i, v]) : Object.entries(cw)) { const c = typeof k === 'number' ? k : /^\d+$/.test(k) ? +k : colNum(k); if (c >= 0 && c < MAXC && +v > 0) m.set(c, clamp(Math.round(+v), 4, 2000)); }
    setProp(s, 'cw', m);
  }
  const nfs = NF_NAMES();
  for (const f of Array.isArray(spec.formats) ? spec.formats.slice(0, 500) : []) {
    const g = f && parseRange(f.range);
    if (!g || wholeCols(g) || wholeRows(g) || (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1) > 100000) continue;
    const patch = {};
    if (f.bold != null) patch.b = !!f.bold;
    if (f.italic != null) patch.i = !!f.italic;
    if (f.underline != null) patch.u = !!f.underline;
    if (f.wrap != null) patch.wr = !!f.wrap;
    if (f.color) patch.c = cssColor(f.color);
    if (f.fill) patch.bg = cssColor(f.fill);
    if (f.font_size) patch.fs = +f.font_size;
    if (f.align) patch.ha = { left: 'l', center: 'c', right: 'r' }[f.align] || null;
    if (f.valign) patch.va = { top: 't', middle: 'm', bottom: 'b' }[f.valign] || null;
    if (f.number_format != null) patch.nf = f.number_format in nfs ? nfs[f.number_format] : String(f.number_format).slice(0, 200);
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
      const x = cellAt(s, r, c), st = { ...((x ? x.st : emptyLook(s, r, c)) || {}) };
      for (const [k, v] of Object.entries(patch)) { if (v == null || v === false) delete st[k]; else st[k] = v; }
      if (f.border) {
        const spec2 = f.border === 'thick_outside' ? '2s#000000' : '1s#000000', top = r === g.r1, bot = r === g.r2, sta = c === g.c1, end = c === g.c2;
        if (f.border === 'none') { delete st.bt; delete st.bb; delete st.bs; delete st.be; }
        else if (f.border === 'all') st.bt = st.bb = st.bs = st.be = spec2;
        else if (f.border === 'outside' || f.border === 'thick_outside') { if (top) st.bt = spec2; if (bot) st.bb = spec2; if (sta) st.bs = spec2; if (end) st.be = spec2; }
        else if (f.border === 'bottom' && bot) st.bb = spec2;
        else if (f.border === 'top' && top) st.bt = spec2;
      }
      const ns = normStyle(st);
      if (x) setCell(s, r, c, withLook(x, ns)); else if (ns) setCell(s, r, c, { st: ns });
    }
    if (f.merge && (g.r1 !== g.r2 || g.c1 !== g.c2)) setProp(s, 'merges', [...s.merges.filter(m => !meets(m, g)), { ...g }]);
  }
  for (const c of Array.isArray(spec.charts) ? spec.charts.slice(0, 20) : []) {
    const g = c && parseRange(c.range);
    if (!g || wholeCols(g) || wholeRows(g)) continue;
    const src = guessSrc(s, g);
    if (c.series_in === 'rows') src.by = 'r'; else if (c.series_in === 'columns') src.by = 'c';
    const at = parseA1(c.at) || { r: g.r1, c: g.c2 + 2 };
    const ch = normSheetChart({ ck: CK_API[c.type] || 'col', src, at: A1(at.r, at.c), w: c.width || 480, h: c.height || 288, ti: c.title, leg: c.legend !== false, lab: c.labels === true });
    if (ch) { setProp(s, 'charts', [...s.charts, ch]); n++; }
  }
  const add = [];
  for (const c of Array.isArray(spec.conditional_formats) ? spec.conditional_formats.slice(0, 100) : []) { const r = cfFromSpec(c); if (r) add.push(r); }
  if (add.length) { setProp(s, 'cf', [...s.cf, ...add].slice(0, 500)); n += add.length; }
  // data validation: each rule takes the place of what its cells had; type "none" only takes rules away
  let dv = s.dv;
  for (const c of Array.isArray(spec.validations) ? spec.validations.slice(0, 200) : []) {
    const g = c && typeof c === 'object' ? String(c.range || '').split(/[\s,;]+/).filter(Boolean).map(t => parseRange(t)) : [];
    const rule = g.length && g.every(Boolean) && c.type !== 'none' ? dvFromSpec(c, g, book) : null;
    if (!g.length || !g.every(Boolean) || (!rule && c.type !== 'none')) continue;
    for (const x of g) dv = cutList(dv, x);
    if (rule) dv = [...dv, rule];
    n++;
  }
  if (dv !== s.dv) setProp(s, 'dv', dv.slice(-DV_MAX));
  if (spec.freeze_rows != null) setProp(s, 'fr', clamp(Math.round(+spec.freeze_rows) || 0, 0, 200));
  if (spec.freeze_columns != null) setProp(s, 'fc', clamp(Math.round(+spec.freeze_columns) || 0, 0, 60));
  if (spec.direction === 'rtl' || spec.direction === 'ltr') setProp(s, 'dir', spec.direction);
  return n;
}
/* for Claude: defined names from a description [{ name, refers_to, sheet (the one sheet the name belongs to; without
   it, the whole workbook), comment, delete }] put into a list of names (a name that is there already takes the new
   meaning). Gives the new list, and the ones that couldn't be taken with the reason */
function namesFromSpec(list, cur, book, s0) {
  const next = cur.slice(), skipped = [];
  for (const x of Array.isArray(list) ? list.slice(0, 500) : []) {
    if (!x || typeof x !== 'object') continue;
    const n = String(x.name ?? '').trim(), sn = x.sheet == null ? '' : String(x.sheet).trim(), scope = sn ? book.sheets.find(s => s.name.toLowerCase() === sn.toLowerCase()) : null;
    if (sn && !scope) { skipped.push({ name: n, why: `There is no sheet named "${sn}".` }); continue; }
    const key = (scope ? scope.id : '') + '|' + n.toLowerCase(), at = next.findIndex(y => nameKey(y) === key);
    if (x.delete === true) { if (at >= 0) next.splice(at, 1); else skipped.push({ name: n, why: 'There is no such name.' }); continue; }
    if (nameProblem(n)) { skipped.push({ name: n, why: 'Not a valid name: letters, digits, _ and . after a first letter or _, no spaces, and nothing that reads as a cell address (B2, R1C1) or as TRUE or FALSE.' }); continue; }
    const src = nameFormulaIn(x.refers_to, scope || s0, book);
    if (src.err) { skipped.push({ name: n, why: 'refers_to must be a range like =Sheet1!$A$2:$A$9, a number, or a formula.' }); continue; }
    const o = { n, f: src.f, ...(scope ? { s: scope.id } : {}), ...(x.comment ? { c: String(x.comment) } : {}) };
    if (at >= 0) next[at] = o; else next.push(o);
  }
  return { names: normNames(next, book.sheets), skipped };
}
/* a whole workbook from a description: { sheets: [{ name, rows, cells, formats, column_widths, freeze_rows, direction }], names }.
   What couldn't be taken goes into rep */
function fromSpec(spec, rep) {
  const list = (Array.isArray(spec && spec.sheets) ? spec.sheets : []).filter(x => x && typeof x === 'object').slice(0, 50);
  const words = JSON.stringify(list).slice(0, 20000);
  const dir = (spec && (spec.direction === 'rtl' || spec.direction === 'ltr')) ? spec.direction : RTL_CH.test(words) ? 'rtl' : /[A-Za-z]/.test(words) ? 'ltr' : UI_DIR;
  const book = { v: 1, dir, active: 0, sheets: [], names: NO_NAMES }, taken = new Set();
  for (const sp of list.length ? list : [{}]) {
    const s = newSheet(freeName(cleanName(sp.name) || sheetWord(book.sheets.length + 1), taken), sp.direction === 'ltr' || sp.direction === 'rtl' ? sp.direction : dir);
    taken.add(s.name.toLowerCase());
    book.sheets.push(s);
  }
  if (spec && Array.isArray(spec.names)) {   // before the cells, so formulas write the names the way they were made
    const r = namesFromSpec(spec.names, NO_NAMES, book, book.sheets[0]);
    book.names = r.names;
    if (rep && r.skipped.length) rep.names_not_defined = r.skipped;
  }
  const logs = list.map(() => []);
  list.forEach((sp, i) => applySpec(book, book.sheets[i], sp, logs[i]));
  const keep = WB;
  WB = book;
  try { recalc(); if (rep) Object.assign(rep, formulaNotes(book, logs.flatMap((l, i) => l.map(([r, c]) => [book.sheets[i], r, c])))); } finally { WB = keep; }
  return bookOut({ ...book, sheets: book.sheets });
}
function templates() {
  const cur = 'currency';
  return [
    { key: 'blank', icon: 'table_view', name: T('גיליון ריק'), desc: T('טבלה חלקה'), spec: { sheets: [{ name: sheetWord(1) }] } },
    { key: 'budget', icon: 'savings', name: T('תקציב חודשי'), desc: T('מתוכנן מול בפועל, עם סיכום'), spec: { sheets: [{ name: T('תקציב'), freeze_rows: 3, column_widths: { A: 150, B: 110, C: 110, D: 110 },
      rows: [[T('תקציב חודשי')], [], [T('קטגוריה'), T('מתוכנן'), T('בפועל'), T('הפרש')], [T('אוכל'), 800, 740], [T('תחבורה'), 200, 230], [T('בילויים'), 300, 280], [T('בגדים'), 250, 190], [T('חיסכון'), 400, 400], [T('אחר'), 100, 60],
        [T('סה״כ'), '=SUM(B4:B9)', '=SUM(C4:C9)', '=SUM(D4:D9)']].map((r, i) => i >= 3 && i <= 8 ? [...r, `=B${i + 1}-C${i + 1}`] : r),
      formats: [{ range: 'A1:D1', merge: true, bold: true, font_size: 16, align: 'center' }, { range: 'A3:D3', bold: true, fill: '#ddebf7', border: 'all', align: 'center' }, { range: 'A4:D9', border: 'all' },
        { range: 'B4:D10', number_format: cur }, { range: 'A10:D10', bold: true, fill: '#fff2cc', border: 'all' }] }] } },
    { key: 'grades', icon: 'school', name: T('מעקב ציונים'), desc: T('ציונים, ממוצע, ומי עבר'), spec: { sheets: [{ name: T('ציונים'), freeze_rows: 1, column_widths: { A: 140, E: 90, F: 90 },
      rows: [[T('מקצוע'), T('מבחן 1'), T('מבחן 2'), T('מבחן 3'), T('ממוצע'), T('עבר?')], ...[[T('מתמטיקה'), 85, 92, 78], [T('אנגלית'), 90, 88, 95], [T('היסטוריה'), 70, 75, 82], [T('מדעים'), 95, 89, 91], [T('לשון'), 80, 84, 77]]
        .map((r, i) => [...r, `=AVERAGE(B${i + 2}:D${i + 2})`, `=IF(E${i + 2}>=55,"${T('עבר')}","${T('לא עבר')}")`])],
      formats: [{ range: 'A1:F1', bold: true, fill: '#e2efda', border: 'bottom', align: 'center' }, { range: 'E2:E6', number_format: '0.0', bold: true }, { range: 'F2:F6', align: 'center' }] }] } },
    { key: 'shopping', icon: 'shopping_cart', name: T('רשימת קניות'), desc: T('כמויות, מחירים וסכום'), spec: { sheets: [{ name: T('קניות'), freeze_rows: 1, column_widths: { A: 150, B: 70, C: 110, D: 110 },
      rows: [[T('פריט'), T('כמות'), T('מחיר ליחידה'), T('סה״כ')], ...[[T('לחם'), 2, 8.9], [T('חלב'), 3, 6.5], [T('ביצים'), 1, 14], [T('תפוחים'), 6, 1.8], [T('גבינה'), 2, 11.9]].map((r, i) => [...r, `=B${i + 2}*C${i + 2}`]),
        [T('סה״כ'), '=SUM(B2:B6)', '', '=SUM(D2:D6)']],
      formats: [{ range: 'A1:D1', bold: true, fill: '#fce4d6', border: 'bottom' }, { range: 'C2:D7', number_format: cur }, { range: 'A7:D7', bold: true, border: 'top' }] }] } },
  ];
}
/* the "New" dialog's spreadsheet side */
function chooser(body, close) {
  body.textContent = '';
  const grid = h('div', { class: 'tpl-grid sh-tpl-grid' });
  for (const t of templates()) grid.append(h('button', { class: 'tpl sh-tpl', type: 'button', onclick: async () => { close(); await createDoc({ title: t.key === 'blank' ? '' : t.name, html: JSON.stringify(fromSpec(t.spec)), kind: 'sheet', page: { dir: UI_DIR } }); } }, icon(t.icon), h('b', { text: t.name }), h('span', { text: t.desc })));
  body.append(grid);
}
/* for Claude: what the sheet shows, and its formulas */
function forAI(args = {}) {
  let s = WS;
  if (args.sheet != null) { const n = String(args.sheet).toLowerCase(); s = WB.sheets.find(x => x.name.toLowerCase() === n); if (!s) throw new Error(`There is no sheet named "${args.sheet}". The sheets are: ${WB.sheets.map(x => x.name).join(', ')}.`); }
  const used = usedRange(s);
  let g = args.range ? parseRange(args.range) : used;
  if (args.range && !g) throw new Error(`"${args.range}" is not a range. Use A1 notation, like A1:D20.`);
  const out = { sheets: WB.sheets.map(x => { const u = usedRange(x); return { name: x.name, used_range: u ? rangeA1(u) : null }; }), sheet: s.name, direction: s.dir };
  if (s.pics.length) out.pictures = s.pics.map(x => ({ at: A1(x.at.r, x.at.c), width: x.w, height: x.h, ...(x.alt ? { alt: x.alt } : {}) }));
  if (s.pivots.length) out.pivots = s.pivots.map(x => ({ name: x.name, at: A1(x.at.r, x.at.c), source: x.src, rows: x.rows, columns: x.cols, values: x.vals.map(v => v.n || T(PV_FN[v.fn], v.f)), ...(x.filt.length ? { filters: x.filt.map(f => f.f) } : {}),
    note: 'Its cells show in the rows above (worked out from the source each time); they can not be written over' }));
  if (s.tables.length) out.tables = s.tables.map(t => ({ name: t.name, range: rangeA1(t.g), columns: t.cols.map(c => c.n), style: t.style, ...(t.hr ? {} : { header_row: false }), ...(t.tr ? { total_row: true } : {}),
    note: 'A formula may use its columns: =SUM(' + t.name + '[' + tColEsc(t.cols[t.cols.length - 1].n) + ']), or [@Column] for the same row inside the table' }));
  if (s.charts.length) out.charts = s.charts.map(ch => ({ type: Object.keys(CK_API).find(k => CK_API[k] === ch.ck), ...(ch.ti ? { title: ch.ti } : {}), data: ch.src ? ch.src.ref : ch.ser.map(x => x.v).join(', '), at: A1(ch.at.r, ch.at.c) }));
  if (s.cf.length) out.conditional_formats = s.cf.map(r => ({ range: r.g.map(rangeA1).join(' '), rule: cfDesc(r).replace(/[\u2066-\u2069]/g, '') }));
  if (s.dv.length) out.validations = s.dv.map(dvToSpec);
  const names = (WB.names || NO_NAMES).filter(x => !x.h).map(x => ({ name: x.n, refers_to: '=' + x.f, ...(x.s ? { sheet: (WB.sheets.find(y => y.id === x.s) || {}).name } : {}), ...(x.c ? { comment: x.c } : {}) }));
  if (names.length) out.names = names;
  if (!g) return { ...out, range: null, rows: [], note: 'This sheet is empty.' };
  g = { r1: g.r1, c1: g.c1, r2: Math.min(g.r2, used ? used.r2 : g.r2, g.r1 + 399), c2: Math.min(g.c2, used ? used.c2 : g.c2, g.c1 + 59) };
  const rows = [], formulas = {}, notes = {}, links = {};
  for (let r = g.r1; r <= g.r2; r++) {
    const row = [];
    for (let c = g.c1; c <= g.c2; c++) { const x = cellSp(s, r, c); row.push(x ? view(x).t : ''); if (x && x.f != null) formulas[A1(r, c)] = editText(x); if (x && x.n) notes[A1(r, c)] = x.n; if (x && (x.k || x.hl)) links[A1(r, c)] = x.k || x.hl; }
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every(t => t === '')) rows.pop();
  const spills = {};
  if (s._sa) for (const [k, a] of s._sa) if (meets(a, g)) spills[A1(kr(k), kc(k))] = rangeA1(a);
  const res = { ...out, range: rangeA1(g), rows, ...(Object.keys(formulas).length ? { formulas } : {}), ...(Object.keys(notes).length ? { notes } : {}), ...(Object.keys(links).length ? { links } : {}), ...(Object.keys(spills).length ? { spills } : {}),
    note: 'rows[0] is row ' + (g.r1 + 1) + ' and each row starts at column ' + colName(g.c1) + '. Each value is what the cell shows (with its number format); formulas lists the cells that hold one' + (Object.keys(spills).length ? ', and spills the cells an array formula (SORT, FILTER, UNIQUE...) fills from its own cell.' : '.') };
  if (s === WS) res.selected = rangeA1(usedPart(selG()));
  if (used && (used.r2 > g.r2 || used.c2 > g.c2) && !args.range) res.truncated = 'Only part of the sheet was returned. Read the rest with the range argument.';
  return res;
}
/* for Claude: which of the formulas it wrote can't be read, use what isn't here, or answer with an error (cells: each
   [sheet, row, column] it wrote) */
function formulaNotes(book, cells) {
  const bad = [], unknown = [], errs = {}, many = book.sheets.length > 1;
  let n = 0;
  for (const [s, r, c] of cells) {
    const x = s.cells.get(KEY(r, c));
    if (!x || x.f == null) continue;
    const at = (many ? sheetPrefix(s.name) : '') + A1(r, c);
    if (!astOf(x.f)) { if (bad.length < 30) bad.push(at); continue; }
    const m = missingIn(x.f, s, book);
    if (m) { if (unknown.length < 30) unknown.push({ cell: at, ...(m.fn ? { function: m.fn } : { name: m.name }) }); }
    else if (isErr(x.v) && n < 30) { errs[at] = x.v.c; n++; }
  }
  if (!bad.length && !unknown.length && !n) return {};
  return { ...(bad.length ? { formulas_not_read: bad } : {}), ...(unknown.length ? { formulas_unknown: unknown } : {}), ...(n ? { formula_errors: errs } : {}),
    formulas_note: 'formulas_not_read: what was written after the = is not a formula this app can read (check the brackets and the quotes, commas between arguments, English function names, A1 references); such a cell shows #NAME?. '
      + 'formulas_unknown: a function this app does not have, or a name nobody defined. formula_errors: the formula was read, and this error is its answer. Fix the ones that were not meant.' };
}
/* for Claude: cells written (and formatted), as one step the user can undo */
function writeCells(args = {}) {
  let s = WS, made = false;
  if (args.sheet != null && String(args.sheet).trim()) {
    const n = cleanName(args.sheet);
    s = WB.sheets.find(x => x.name.toLowerCase() === n.toLowerCase());
    if (!s) { s = newSheet(freeName(n || sheetWord(WB.sheets.length + 1), takenNames()), WB.dir); made = true; }
  }
  let n = 0, named = null;
  const log = [];
  edit(() => {
    if (made) bookStep(() => WB.sheets.push(s));
    if (s !== WS) showSheet(s, true);
    if (Array.isArray(args.names)) { named = namesFromSpec(args.names, WB.names || NO_NAMES, WB, s); setNames(named.names); }   // before the cells, so formulas write the names the way they were made
    n = applySpec(WB, s, args, log);
  });
  WB.active = WB.sheets.indexOf(WS);
  refresh();
  // Excel checks only what a person types, and so does this app: Claude's values go in, and it is told which of them their cells' rules don't allow
  const bad = s.dv.length ? [...new Set(log.filter(([r, c]) => { const rule = dvAt(s, r, c); return !!rule && !dvOk(s, rule, r, c); }).map(([r, c]) => A1(r, c)))].slice(0, 30) : [];
  const u = usedRange(s);
  return { sheet: s.name, cells_written: n, used_range: u ? rangeA1(u) : null, ...(made ? { new_sheet: true } : {}),
    ...(named ? { names: (WB.names || NO_NAMES).filter(x => !x.h).map(x => x.n) } : {}), ...(named && named.skipped.length ? { names_not_defined: named.skipped } : {}),
    ...(bad.length ? { not_allowed: bad, note: 'These cells now hold values that their data validation does not allow (read_spreadsheet lists the validations). The values were written anyway, because validation only stops what a person types. Fix them if that was not intended.' } : {}),
    ...formulaNotes(WB, log.map(([r, c]) => [s, r, c])) };
}

/* =========================================================
   what index.html calls
   ========================================================= */
function load(body, cur) {
  mount();
  WB = parseBook(body);
  LOADED = cur;
  HIST.list = []; HIST.at = 0; CLIP = null; SHOWF = false; TX = null; DRAG = null;
  Object.assign(ED, { on: false, refs: null, point: null });
  V.over.classList.remove('editing');
  V.ed.value = '';
  acHide();
  for (const L of [V.body, V.top, V.side, V.corner]) if (L._m) { for (const e of L._m.values()) e.remove(); L._m.clear(); }
  WS = WB.sheets[WB.active] || WB.sheets[0];
  GEO = null;
  SEL = { r: WS.ac.r, c: WS.ac.c, er: WS.ac.r, ec: WS.ac.c };
  recalc();
  CHV++; CH.id = null;
  for (const s of WB.sheets) filterRows(s);
  V.scroll.scrollTop = 0; V.scroll.scrollLeft = 0;
  refresh();
  scrollToSel();
  focusGrid();
}
/* leaving the workbook: whatever was being written was committed before (commit, from flushSave), so it only goes */
function unload() {
  Object.assign(ED, { on: false, refs: null, point: null });
  WB = WS = LOADED = null;
  HIST.list = []; HIST.at = 0; CLIP = null;
  if (V.view) { for (const L of [V.body, V.top, V.side, V.corner]) if (L._m) { for (const e of L._m.values()) e.remove(); L._m.clear(); } V.over.classList.remove('editing'); acHide(); }
}
/* a whole version (restoring one, or a draft), as one step undo can take back */
function replace(body) {
  if (!WB) return;
  if (ED.on) endEdit(false);
  const nb = parseBook(body);
  edit(() => { bookStep(() => { WB.sheets = nb.sheets; WB.dir = nb.dir; }); setNames(nb.names); showSheet(WB.sheets[nb.active] || WB.sheets[0], true); });
  if (RM.on) RM.all = true;
  refresh();
}
function preview(body) {
  const b = parseBook(body), s = b.sheets[b.active] || b.sheets[0], keep = [WB, WS];
  WB = b; WS = s;
  try { recalc(); const u = usedRange(s) || { r1: 0, c1: 0, r2: 0, c2: 0 }; const t = tableEl(s, { r1: 0, c1: 0, r2: Math.min(u.r2, 60), c2: Math.min(u.c2, 15) }, { grid: true }); return h('div', { class: 'sh-prev', style: { overflow: 'auto', maxHeight: '60vh', direction: s.dir } }, h('p', { class: 'muted small', text: b.sheets.map(x => x.name).join(' · ') }), t); }
  finally { [WB, WS] = keep; }
}

/* =========================================================
   charts: drawn over the sheet from its cells, the way Excel's are. A chart keeps where its numbers are: src, a range
   with its series down the columns (by 'c') or along the rows (by 'r'), names in its first row (hr) and categories in
   its first column (hc) or the other way round; or ser, each series' own references, as Excel files keep them. It
   also keeps where it sits (at: a cell, and a distance from that cell's corner in pixels at 100%) and its size. The
   drawing is the presentations' (drawChart)
   ========================================================= */
const OFFICE = ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47', '#264478', '#9e480e', '#636363', '#997300'];
const SHEET_LOOK = { accent: '#4472c4', a2: '#ed7d31', text: '#404040', bg: '#ffffff', fBody: DEF_FONT, fTitle: DEF_FONT };
const CKS = ['col', 'bar', 'line', 'pie', 'donut'];
const CK_API = { column: 'col', bar: 'bar', line: 'line', pie: 'pie', donut: 'donut' };   // the names Claude uses
/* a conditional formatting rule from Claude's description: { range, type, value, value2, text, formula, count, period,
   style (red, yellow, green) or fill / text_color / bold, border / border_style / border_color, and for bars, scales
   and icons their colors and icons } */
const CF_API_ICONS = { arrows: '3Arrows', traffic_lights: '3TrafficLights1', signs: '3Signs', symbols: '3Symbols', flags: '3Flags', stars: '3Stars', ratings: '5Rating', quarters: '5Quarters', triangles: '3Triangles' };
function cfFromSpec(c) {
  if (!c || typeof c !== 'object') return null;
  const g = String(c.range || '').split(/[\s,;]+/).filter(Boolean).map(t => parseRange(t));
  if (!g.length || g.some(x => !x)) return null;
  const look = CF_LOOKS.find(([k]) => k === c.style);
  const st = look ? { ...look[2] } : cfStyle({ bg: c.fill, c: c.text_color, b: c.bold, i: c.italic });
  // a border on each cell the rule changes: all four sides, or the top or bottom one; a thin line, solid, dashed or dotted
  const line = '1' + ({ dashed: 'd', dotted: 'o' }[c.border_style] || 's') + (HEX.test(c.border_color) ? c.border_color.toLowerCase() : '#000000');
  for (const k of { all: BD_SIDES, outside: BD_SIDES, top: ['bt'], bottom: ['bb'] }[c.border] || []) st[k] = line;
  if (!look && !Object.keys(st).length) Object.assign(st, CF_LOOKS[0][2]);
  const val = v => v == null ? null : typeof v === 'number' ? String(v) : cfValIn(String(v));
  const ops = { greater_than: 'gt', greater_or_equal: 'ge', less_than: 'lt', less_or_equal: 'le', equal: 'eq', not_equal: 'ne', between: 'bw', not_between: 'nb' };
  const x = { g, st, stop: c.stop_if_true === true };
  if (ops[c.type]) Object.assign(x, { k: 'cell', op: ops[c.type], a: val(c.value), b: val(c.value2) });
  else if (c.type === 'text_contains' || c.type === 'text_not_contains' || c.type === 'text_begins' || c.type === 'text_ends') Object.assign(x, { k: 'text', op: { text_contains: 'has', text_not_contains: 'not', text_begins: 'begins', text_ends: 'ends' }[c.type], t: String(c.text ?? c.value ?? '') });
  else if (c.type === 'date') Object.assign(x, { k: 'date', p: { last_7_days: 'last7', last_week: 'lastweek', this_week: 'thisweek', next_week: 'nextweek', last_month: 'lastmonth', this_month: 'thismonth', next_month: 'nextmonth' }[c.period] || c.period });
  else if (['blanks', 'no_blanks', 'errors', 'no_errors'].includes(c.type)) x.k = { blanks: 'blank', no_blanks: 'noblank', errors: 'err', no_errors: 'noerr' }[c.type];
  else if (c.type === 'top' || c.type === 'bottom') Object.assign(x, { k: 'top', n: c.count || 10, pct: c.percent === true, bot: c.type === 'bottom' });
  else if (c.type === 'above_average' || c.type === 'below_average') Object.assign(x, { k: 'avg', below: c.type === 'below_average' });
  else if (c.type === 'duplicates' || c.type === 'unique') x.k = c.type === 'duplicates' ? 'dup' : 'uniq';
  else if (c.type === 'formula') Object.assign(x, { k: 'expr', f: String(c.formula || c.value || '').replace(/^=/, '') });
  else if (c.type === 'data_bar') Object.assign(x, { k: 'bar', c: HEX.test(c.color) ? c.color : '#638ec6', solid: c.solid === true, lo: { t: 'auto' }, hi: { t: 'auto' }, only: c.hide_values === true });
  else if (c.type === 'color_scale') {
    const cs = (Array.isArray(c.colors) ? c.colors : ['#f8696b', '#ffeb84', '#63be7b']).filter(v => HEX.test(v)).slice(0, 3);
    if (cs.length < 2) return null;
    Object.assign(x, { k: 'scale', cs: cs.map((col, i) => ({ t: i === 0 ? 'min' : i === cs.length - 1 ? 'max' : 'pctl', v: 50, c: col })) });
  }
  else if (c.type === 'icon_set') Object.assign(x, { k: 'icons', set: CF_API_ICONS[c.icons] || (ICON_SETS[c.icons] ? c.icons : '3Arrows'), rev: c.reverse === true, only: c.hide_values === true });
  else return null;
  return normCf(x);
}
const CH_PALS = { office: N_('צבעים רגילים'), bright: N_('צבעוני'), mono: N_('גוונים של צבע אחד') };
const CH = { id: null };   // the chart chosen on screen
let CHV = 0;               // goes up with every change, so a chart works out its numbers again only then
const bare = ch => { const o = { ...ch }; delete o._v; delete o._d; delete o._s; return o; };
function normSheetChart(x) {
  if (!x || typeof x !== 'object') return null;
  const at = parseA1(x.at);
  if (!at) return null;
  const n = (v, lo, hi, d) => Number.isFinite(+v) ? clamp(Math.round(+v), lo, hi) : d;
  const ch = { id: typeof x.id === 'string' && /^[a-z0-9]{4,24}$/.test(x.id) ? x.id : sid(), ck: CKS.includes(x.ck) ? x.ck : 'col',
    at: { r: at.r, c: at.c, dx: n(x.dx, 0, 5000, 0), dy: n(x.dy, 0, 5000, 0) }, w: n(x.w, 60, 4000, 480), h: n(x.h, 40, 4000, 288),
    leg: x.leg !== false, pal: CH_PALS[x.pal] ? x.pal : 'office' };
  if (typeof x.ti === 'string' && x.ti.trim()) ch.ti = x.ti.trim().slice(0, 150);
  if (x.lab === true) ch.lab = true;
  if (x.dir === 'ltr' || x.dir === 'rtl') ch.dir = x.dir;   // a chart from a file keeps its own direction; one made here follows its sheet
  const ref = v => typeof v === 'string' && v.trim() && v.length <= 300 ? v.trim() : null;
  if (x.src && typeof x.src === 'object' && ref(x.src.ref)) ch.src = { ref: ref(x.src.ref), by: x.src.by === 'r' ? 'r' : 'c', hr: x.src.hr ? 1 : 0, hc: x.src.hc ? 1 : 0 };
  else if (Array.isArray(x.ser)) {
    ch.ser = x.ser.slice(0, 50).map(s => s && ref(s.v) ? { v: ref(s.v), ...(ref(s.nr) ? { nr: ref(s.nr) } : typeof s.n === 'string' ? { n: s.n.slice(0, 80) } : {}) } : null).filter(Boolean);
    if (!ch.ser.length) return null;
    if (ref(x.cats)) ch.cats = ref(x.cats);
  } else return null;
  return ch;
}
function chartOut(ch) {
  const o = { id: ch.id, ck: ch.ck, at: A1(ch.at.r, ch.at.c), w: ch.w, h: ch.h };
  if (ch.at.dx) o.dx = ch.at.dx;
  if (ch.at.dy) o.dy = ch.at.dy;
  if (ch.ti) o.ti = ch.ti;
  if (!ch.leg) o.leg = false;
  if (ch.lab) o.lab = true;
  if (ch.pal !== 'office') o.pal = ch.pal;
  if (ch.dir) o.dir = ch.dir;
  if (ch.src) o.src = { ...ch.src };
  else { o.ser = ch.ser.map(x => ({ ...x })); if (ch.cats) o.cats = ch.cats; }
  return o;
}
/* 'B2:B9' on the chart's own sheet, or after a sheet's name ('Sheet 2'!B2:B9), or a defined name that stands for cells
   (Sales, Data!Sales): the cells its formula gives now, so a name made with OFFSET or INDEX grows with its cells and
   the chart with it. Whole columns stop at the last row in use. name: the defined name, when the text is one */
function chartRef(s, ref) {
  const t = String(ref || '').trim(), i = t.lastIndexOf('!');
  let sh = s, part = t, name = null;
  if (i > 0) {
    let nm = t.slice(0, i).trim();
    if (nm[0] === "'" && nm.endsWith("'")) nm = nm.slice(1, -1).replace(/''/g, "'");
    const low = nm.toLowerCase();
    sh = WB && WB.sheets.find(x => x.name.toLowerCase() === low);
    part = t.slice(i + 1);
  }
  let g = sh && parseRange(part);
  if (!g) {
    const k = WB && s ? tokenize(t).filter(x => x.t !== 'ws') : [];
    name = k.length === 1 && k[0].t === 'name' ? nameOf(k[0], s) : null;
    if (!name) return null;
    const keep = [CTX, AX, OFF];
    CTX = { si: WB.sheets.indexOf(s), r: 0, c: 0, dyn: false }; AX = true; OFF = null;
    let v;
    try { v = nameVal(k[0], true); } catch (e) { v = null; } finally { [CTX, AX, OFF] = keep; }
    if (!v || !v.rng) return null;
    sh = v.s; g = v.g;
  }
  if (wholeCols(g) || wholeRows(g)) { const u = usedEnd(sh); g = { r1: g.r1, c1: g.c1, r2: Math.min(g.r2, Math.max(g.r1, u.r - 1)), c2: Math.min(g.c2, Math.max(g.c1, u.c - 1)) }; }
  return name ? { s: sh, g, name } : { s: sh, g };
}
const cellText = (sh, r, c) => { const x = cellSp(sh, r, c); return x ? view(x).t : ''; };
const cellNum = (sh, r, c) => { const v = valAt(sh, r, c); return typeof v === 'number' ? v : 0; };
const shownR = (sh, r) => !sh.hr.has(r) && !(sh._fh && sh._fh.has(r)), shownC = (sh, c) => !sh.hc.has(c);
const upTo = (a, b, ok, max = 1000) => { const out = []; for (let i = a; i <= b && out.length < max; i++) if (ok(i)) out.push(i); return out; };
/* the numbers of a range, in reading order (it is one row or one column); hidden rows and columns aren't drawn, as in Excel */
function refList(s, ref, num) {
  const R = chartRef(s, ref);
  if (!R) return [];
  const { s: sh, g } = R, out = [];
  for (const r of upTo(g.r1, g.r2, r => shownR(sh, r))) for (const c of upTo(g.c1, g.c2, c => shownC(sh, c))) out.push(num ? cellNum(sh, r, c) : cellText(sh, r, c));
  return out;
}
function dataOfRange(s, src) {
  const R = chartRef(s, src.ref);
  if (!R) return { cats: [], ser: [] };
  const { s: sh, g } = R, rows = upTo(g.r1 + src.hr, g.r2, r => shownR(sh, r)), cols = upTo(g.c1 + src.hc, g.c2, c => shownC(sh, c));
  if (src.by === 'r') return {
    cats: cols.map((c, i) => src.hr ? cellText(sh, g.r1, c) : fmt(i + 1)),
    ser: rows.slice(0, 50).map((r, j) => ({ n: src.hc ? cellText(sh, r, g.c1) : T('סדרה {0}', fmt(j + 1)), v: cols.map(c => cellNum(sh, r, c)) })) };
  return {
    cats: rows.map((r, i) => src.hc ? cellText(sh, r, g.c1) : fmt(i + 1)),
    ser: cols.slice(0, 50).map((c, j) => ({ n: src.hr ? cellText(sh, g.r1, c) : T('סדרה {0}', fmt(j + 1)), v: rows.map(r => cellNum(sh, r, c)) })) };
}
function dataOfSeries(s, ch) {
  const ser = ch.ser.map((x, j) => ({ n: x.nr ? refList(s, x.nr).join(' ') : x.n != null ? x.n : T('סדרה {0}', fmt(j + 1)), v: refList(s, x.v, true) }));
  const n = Math.max(0, ...ser.map(x => x.v.length)), cats = ch.cats ? refList(s, ch.cats) : [];
  return { cats: Array.from({ length: n }, (_, i) => cats[i] != null && cats[i] !== '' ? String(cats[i]) : fmt(i + 1)), ser: ser.map(x => ({ n: x.n, v: Array.from({ length: n }, (_, i) => x.v[i] || 0) })) };
}
/* the chart's categories and series now */
function chartData(s, ch) {
  if (ch._v === CHV && ch._s === s) return ch._d;
  let d = { cats: [], ser: [] };
  try { d = ch.src ? dataOfRange(s, ch.src) : dataOfSeries(s, ch); } catch (e) { console.warn(e); }
  ch._v = CHV; ch._s = s; ch._d = d;
  return d;
}
/* Excel's guess for a new chart: the first row names the series when it holds words over numbers, the first column is the
   categories when it holds words (or dates), and the series go down the columns when there are at least as many rows */
function guessSrc(s, g) {
  const x = (r, c) => s.cells.get(KEY(r, c));
  const num = (r, c) => { const v = x(r, c); return !!v && typeof v.v === 'number' && !/^(date|ldate|time)$/.test(nfKind(v.st && v.st.nf)); };
  const word = (r, c) => { const v = x(r, c); return !!v && hasVal(v) && !num(r, c); };
  const words = (cells) => cells.some(([r, c]) => word(r, c)) && !cells.some(([r, c]) => num(r, c));
  const hr = g.r2 > g.r1 && words(upTo(Math.min(g.c1 + 1, g.c2), g.c2, () => true).map(c => [g.r1, c])) ? 1 : 0;
  const hc = g.c2 > g.c1 && words(upTo(g.r1 + hr, g.r2, () => true).map(r => [r, g.c1])) ? 1 : 0;
  return { ref: rangeA1(g), by: g.r2 - g.r1 + 1 - hr >= g.c2 - g.c1 + 1 - hc ? 'c' : 'r', hr, hc };
}
/* the chart itself, into a box: drawn by the presentations' code, in Excel's colors */
function paintChart(box, ch, d, w, hh, k = 1) {
  box.textContent = '';
  if (!d.cats.length || !d.ser.length || !d.ser.some(x => x.v.some(v => v))) { box.append(h('div', { class: 'sh-ch-none', text: ch.src || ch.ser ? T('אין עדיין מספרים לגרף הזה') : '' })); return; }
  const el = { ck: ch.ck, cats: d.cats, ser: d.ser, leg: ch.leg, lab: ch.lab, pal: ch.pal === 'office' ? 'theme' : ch.pal, size: 9 * k, w, h: hh, font: DEF_FONT };
  if (ch.ti) el.ti = ch.ti;
  if (ch.dir) el.dir = ch.dir;
  if (ch.pal === 'office') el.cols = OFFICE;
  drawChart(box, el, SHEET_LOOK, WS ? WS.dir : UI_DIR);
}
const chartBox = ch => ({ x: colX(ch.at.c) + ch.at.dx * Z, y: rowY(ch.at.r) + ch.at.dy * Z, w: ch.w * Z, h: ch.h * Z });
/* on the sheet: each chart where it sits, drawn again only when its numbers, look or size changed */
const HANDLES = ['ts', 't', 'te', 's', 'e', 'bs', 'b', 'be'];
/* a chart or a picture of the sheet on screen, by its id */
const objOf = id => { const ch = WS.charts.find(x => x.id === id); if (ch) return { o: ch, pic: false }; const pc = WS.pics.find(x => x.id === id); return pc ? { o: pc, pic: true } : null; };
function drawPics() {
  for (const x of WS.pics) {
    const b = DRAG && DRAG.kind === 'chart' && DRAG.id === x.id && DRAG.box ? DRAG.box : chartBox(x);
    const e = part(V.body, 'pic:' + x.id, 'sh-chart sh-pic');
    if (!e._in) { e._in = h('img', { class: 'sh-pic-img', alt: '', draggable: 'false' }); e.append(e._in, ...HANDLES.map(k => h('div', { class: 'sh-hd h-' + k, 'data-h': k }))); }
    e.dataset.id = x.id;
    place(e, b.x, b.y, b.w, b.h);
    if (e._img !== x.img) { const d = WB.imgs.get(x.img); if (d) { e._img = x.img; e._in.src = d; } }   // an image still on its way in a room comes later
    if (e._in.alt !== (x.alt || '')) e._in.alt = x.alt || '';
    e.classList.toggle('on', CH.id === x.id);
  }
}
function drawCharts() {
  if (CH.id && !objOf(CH.id)) CH.id = null;
  drawPics();
  for (const ch of WS.charts) {
    const p = DRAG && DRAG.kind === 'chart' && DRAG.id === ch.id && DRAG.box ? DRAG.box : chartBox(ch);
    const e = part(V.body, 'chart:' + ch.id, 'sh-chart');
    if (!e._in) {
      e._in = h('div', { class: 'sh-ch-in' });
      e.append(e._in, ...HANDLES.map(k => h('div', { class: 'sh-hd h-' + k, 'data-h': k })));
    }
    e.dataset.id = ch.id;
    place(e, p.x, p.y, p.w, p.h);
    const d = chartData(WS, ch), sig = [CHV, ch.ck, ch.ti, ch.leg, ch.lab, ch.pal, Math.round(p.w), Math.round(p.h), Z, WS.dir, JSON.stringify(ch.src || ch.ser)].join('|');
    if (e._sig !== sig) { e._sig = sig; paintChart(e._in, ch, d, p.w, p.h, Z); }
    e.classList.toggle('on', CH.id === ch.id);
  }
}
/* the chart under the pointer. By its place, not the event's target: after a drag the sheet holds the pointer, and a
   double click's target is the sheet */
function chartAt(e) {
  for (const el of V.body.querySelectorAll('.sh-chart')) { const r = el.getBoundingClientRect(); if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return el; }
  return null;
}
/* choosing, moving and resizing a chart with the pointer */
function chartDown(e, ce) {
  const ob = objOf(ce.dataset.id), ch = ob && ob.o;
  if (!ch) return;
  e.preventDefault();
  if (ED.on && !endEdit(true)) return;
  closePopover();
  if (CH.id !== ch.id) { CH.id = ch.id; renderSoon(); }
  focusGrid();
  if (e.button !== 0) return;
  DRAG = { kind: 'chart', id: ch.id, pic: ob.pic, h: e.target.dataset.h || null, x0: e.clientX, y0: e.clientY, b0: chartBox(ch), box: null };
  V.scroll.setPointerCapture(e.pointerId);
}
function chartMove(e) {
  const d = DRAG, dx = (e.clientX - d.x0) * (WS.dir === 'rtl' ? -1 : 1), dy = e.clientY - d.y0, min = 40;
  if (!d.box && Math.hypot(dx, dy) < 3) return;
  let { x, y, w, h: hh } = d.b0;
  const k = d.h;
  if (!k) { x += dx; y += dy; }
  else {
    const top = k[0] === 't', bot = k[0] === 'b', st = k === 's' || k.endsWith('s'), en = k === 'e' || k.endsWith('e');
    if (top) { y += dy; hh -= dy; }
    if (bot) hh += dy;
    if (st) { x += dx; w -= dx; }
    if (en) w += dx;
    if (w < min) { if (st) x -= min - w; w = min; }
    if (hh < min) { if (top) y -= min - hh; hh = min; }
    if (d.pic && k.length === 2) {   // a picture's corner keeps its shape, as in Excel
      const b = d.b0, f = Math.max(w / b.w, hh / b.h);
      w = b.w * f; hh = b.h * f;
      if (st) x = b.x + b.w - w;
      if (top) y = b.y + b.h - hh;
    }
  }
  d.box = { x: Math.max(RHW, x), y: Math.max(CHH, y), w, h: hh };
  renderSoon();
}
function chartUp(d) {
  const ob = objOf(d.id);
  if (!ob || !d.box) { renderSoon(); return; }
  const b = d.box, c = colAtX(b.x), r = rowAtY(b.y);
  const patch = { at: { r, c, dx: Math.max(0, Math.round((b.x - colX(c)) / Z)), dy: Math.max(0, Math.round((b.y - rowY(r)) / Z)) }, w: Math.round(b.w / Z), h: Math.round(b.h / Z) };
  if (ob.pic) setPic(d.id, patch); else setChart(d.id, patch);
}
function chartKey(e) {
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteChart(CH.id); return true; }
  if (k === 'Escape') { e.preventDefault(); CH.id = null; renderSoon(); return true; }
  if ((k === 'Enter' || k === 'F2') && !mod) { e.preventDefault(); objDialog(CH.id); return true; }
  if (/^Arrow/.test(k) && !mod) { e.preventDefault(); return true; }
  if (k.length === 1 && !mod && !e.altKey) { e.preventDefault(); return true; }   // letters don't go into the cell under the chart
  return false;
}
/* one step for undo */
function setChart(id, patch, s = WS) { edit(() => setProp(s, 'charts', s.charts.map(x => x.id === id ? { ...bare(x), ...patch } : x))); }
function setPic(id, patch, s = WS) { edit(() => setProp(s, 'pics', s.pics.map(x => x.id === id ? { ...x, ...patch } : x))); }
/* a chart's window, or a picture's words for a screen reader */
const objDialog = id => { const ob = objOf(id); if (ob && ob.pic) picAltDialog(id); else if (ob) openChartDialog(id); };
function deleteChart(id, s = WS) {   // a picture too
  const key = s.charts.some(x => x.id === id) ? 'charts' : s.pics.some(x => x.id === id) ? 'pics' : null;
  if (!key) return;
  edit(() => setProp(s, key, s[key].filter(x => x.id !== id)));
  if (CH.id === id) CH.id = null;
  focusGrid();
}
/* an image file as data the workbook keeps: PNG, JPEG or GIF as it is when it is small enough; a bigger one (or another
   kind) drawn again, at most 2000 pixels on its long side */
async function imageData(file) {
  if (!/^image\//.test(file.type) || /svg/.test(file.type)) throw new Error('type');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('type')); i.src = url; });
    const W0 = img.naturalWidth, H0 = img.naturalHeight, k = Math.min(1, 2000 / Math.max(W0, H0, 1));
    let d = null;
    if (k === 1 && file.size <= 1.5e6 && /^image\/(png|jpeg|gif)$/.test(file.type)) d = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    if (!okImg(d)) {
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(W0 * k)); c.height = Math.max(1, Math.round(H0 * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      d = c.toDataURL(/png|gif|webp|bmp/.test(file.type) ? 'image/png' : 'image/jpeg', 0.88);
      if (d.length > 3e6) d = c.toDataURL('image/jpeg', 0.8);
    }
    if (!okImg(d)) throw new Error('big');
    return { d, w: W0, h: H0 };
  } finally { URL.revokeObjectURL(url); }
}
/* the picture at the active cell (or the cell it was dropped on), at its own size up to 640 by 480, as one step */
async function insertPicture(file, at) {
  if (!WS || (ED.on && !endEdit(true))) return;
  let got;
  try { got = await imageData(file); } catch (e) { toast(e.message === 'big' ? T('התמונה גדולה מדי') : T('אפשר להוסיף כאן תמונות מסוג PNG, ‏JPEG או GIF (וגם WebP ו-BMP, שנשמרות כ-PNG)'), { icon: 'error', ms: 6000 }); return; }
  const key = imgKey(got.d), k = Math.min(1, 640 / got.w, 480 / got.h);
  WB.imgs.set(key, got.d);
  const m = at || { r: SEL.r, c: SEL.c }, x = { id: sid(), img: key, at: { r: m.r, c: m.c, dx: 0, dy: 0 }, w: Math.max(8, Math.round(got.w * k)), h: Math.max(8, Math.round(got.h * k)) };
  if (WS.pics.length >= 100) { toast(T('בגיליון יש כבר 100 תמונות'), { icon: 'error' }); return; }
  edit(() => setProp(WS, 'pics', [...WS.pics, x]));
  CH.id = x.id;
  refresh();
  const b = chartBox(x), sc = V.scroll, sx = Math.abs(sc.scrollLeft);
  if (b.x + b.w > sx + sc.clientWidth) { const to = Math.max(0, b.x + b.w - sc.clientWidth + 20); sc.scrollLeft = WS.dir === 'rtl' ? -to : to; }
  if (b.y + b.h > sc.scrollTop + sc.clientHeight) sc.scrollTop = Math.max(0, b.y + b.h - sc.clientHeight + 20);
  focusGrid();
}
function pickPicture() {
  const inp = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/bmp' });
  inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; if (f) insertPicture(f); });
  inp.click();
}
/* the words a screen reader says for a picture (Excel's Alt Text) */
function picAltDialog(id) {
  const x = WS.pics.find(y => y.id === id);
  if (!x) return;
  const ta = h('textarea', { class: 'field', dir: 'auto', rows: '3', maxlength: '1000', 'aria-label': T('טקסט חלופי'), autofocus: true });
  ta.value = x.alt || '';
  modal({ title: T('טקסט חלופי'), body: h('div', { class: 'sh-nmd' }, h('p', { class: 'muted small', text: T('מה רואים בתמונה, במילים, בשביל מי שלא רואה אותה') }), ta),
    actions: [{ label: T('אישור'), kind: 'primary', run: () => { const t = ta.value.trim().slice(0, 1000); if (t !== (x.alt || '')) { const n = { ...x }; if (t) n.alt = t; else delete n.alt; edit(() => setProp(WS, 'pics', WS.pics.map(y => y.id === id ? n : y))); } } }, { label: T('ביטול'), value: false }],
    onClose: () => { if (!MODALS.length) focusGrid(); } });
}
/* back to the image's own size (Excel's Reset Picture and Size) */
function picOwnSize(id) {
  const x = WS.pics.find(y => y.id === id), d = x && WB.imgs.get(x.img);
  if (!d) return;
  const img = new Image();
  img.onload = () => setPic(id, { w: clamp(img.naturalWidth, 8, 4000), h: clamp(img.naturalHeight, 8, 4000) });
  img.src = d;
}
/* a new chart from the chosen cells (or the block of filled cells around the active one), beside them */
function insertChart(ck) {
  if (ED.on && !endEdit(true)) return;
  let g = selG();
  if (wholeCols(g) || wholeRows(g)) g = usedPart(g);
  if (g.r1 === g.r2 && g.c1 === g.c2) g = region(WS, SEL.r, SEL.c);
  let any = false;
  for (let r = g.r1; r <= g.r2 && !any; r++) for (let c = g.c1; c <= g.c2 && !any; c++) { const x = WS.cells.get(KEY(r, c)); if (x && typeof x.v === 'number') any = true; }
  if (!any) { toast(T('כדי ליצור גרף, בוחרים קודם את התאים עם המספרים (ואפשר גם את הכותרות שלהם).'), { icon: 'bar_chart', ms: 6000 }); return; }
  const src = guessSrc(WS, g);
  // beside everything filled in those rows, so it covers no data, and below the frozen rows, which would hide its top
  let end = g.c2;
  for (const k of WS.cells.keys()) { const r = kr(k), c = kc(k); if (r >= g.r1 && r <= g.r2 && c > end && hasVal(WS.cells.get(k))) end = c; }
  const ch = { id: sid(), ck: CKS.includes(ck) ? ck : 'col', src, at: { r: Math.max(g.r1, WS.fr), c: Math.max(end + 2, WS.fc), dx: 0, dy: 0 }, w: 480, h: 288, leg: true, pal: 'office' };
  const d = dataOfRange(WS, src);
  if (d.ser.length === 1 && src.hr + src.hc && d.ser[0].n) ch.ti = d.ser[0].n;   // one series: its name on top, as Excel does
  edit(() => setProp(WS, 'charts', [...WS.charts, ch]));
  CH.id = ch.id;
  refresh();
  const b = chartBox(ch), sc = V.scroll, sx = Math.abs(sc.scrollLeft);
  if (b.x + b.w > sx + sc.clientWidth) { const to = Math.max(0, b.x + b.w - sc.clientWidth + 20); sc.scrollLeft = WS.dir === 'rtl' ? -to : to; }
  if (b.y + b.h > sc.scrollTop + sc.clientHeight) sc.scrollTop = Math.max(0, b.y + b.h - sc.clientHeight + 20);
  focusGrid();
}
function openChartMenu(x, y) {
  const id = CH.id, ob = id && objOf(id);
  if (!ob) return;
  if (ob.pic) {
    menuAtPoint(x, y, [
      { ic: 'text_fields', label: T('טקסט חלופי…'), key: 'Enter', run: () => picAltDialog(id) },
      { ic: 'aspect_ratio', label: T('הגודל המקורי'), run: () => picOwnSize(id) },
      '-',
      { ic: 'delete', label: T('מחיקת התמונה'), key: 'Delete', run: () => deleteChart(id), danger: true },
    ]);
    return;
  }
  menuAtPoint(x, y, [
    { ic: 'edit', label: T('עריכת הגרף…'), key: 'Enter', run: () => openChartDialog(id) },
    '-',
    ...CKS.map(k => ({ ic: CHARTS[k].ic, label: T(CHARTS[k].n), run: () => setChart(id, { ck: k }) })),
    '-',
    { ic: 'delete', label: T('מחיקת הגרף'), key: 'Delete', run: () => deleteChart(id), danger: true },
  ]);
}
/* the chart's window: its kind, where its numbers are, its title, legend, numbers and colors, with a picture of the result */
function openChartDialog(id) {
  const ch0 = WS && WS.charts.find(x => x.id === id);
  if (!ch0) return;
  const st = bare(ch0);
  const check = (text, on) => { const i = h('input', { type: 'checkbox' }); i.checked = !!on; return [h('label', { class: 'check' }, i, h('span', { text })), i]; };
  const types = h('div', { class: 'sh-ch-types', role: 'radiogroup' });
  const refIn = h('input', { class: 'field', dir: 'ltr', value: st.src ? st.src.ref : '', placeholder: 'A1:C7', spellcheck: 'false', 'aria-label': T('טווח הנתונים') });
  const by = h('select', { class: 'field' }, [['c', T('סדרות בעמודות')], ['r', T('סדרות בשורות')]].map(([v, t]) => h('option', { value: v, text: t })));
  by.value = st.src ? st.src.by : 'c';
  const [hrL, hr] = check(T('בשורה הראשונה יש כותרות'), st.src ? st.src.hr : 1), [hcL, hc] = check(T('בעמודה הראשונה יש כותרות'), st.src ? st.src.hc : 1);
  const ti = h('input', { class: 'field', maxlength: '150', value: st.ti || '', 'aria-label': T('כותרת') });
  const [legL, leg] = check(T('מקרא'), st.leg), [labL, lab] = check(T('מספרים על הגרף'), st.lab);
  const pal = h('select', { class: 'field', 'aria-label': T('צבעים') }, Object.entries(CH_PALS).map(([v, t]) => h('option', { value: v, text: T(t) })));
  pal.value = st.pal;
  const err = h('p', { class: 'sh-ch-err', role: 'alert', hidden: true }), note = h('p', { class: 'muted small', hidden: !!st.src, text: T('הגרף הזה הגיע מקובץ, והנתונים שלו באים מכמה מקומות. אפשר לכתוב כאן טווח אחד במקומם.') });
  const prev = h('div', { class: 'sh-ch-prev' });
  const read = () => {
    err.hidden = true;
    const t = refIn.value.trim();
    if (t) {
      if (!chartRef(WS, t)) { err.textContent = T('הטווח "{0}" לא נמצא. כותבים אותו כמו A1:C7, עם שם של גיליון (\'גיליון2\'!A1:C7), או שם מוגדר של טווח', t); err.hidden = false; return false; }
      st.src = { ref: t, by: by.value, hr: hr.checked ? 1 : 0, hc: hc.checked ? 1 : 0 };
      delete st.ser; delete st.cats;
    } else if (!ch0.ser) { err.textContent = T('כותבים איפה המספרים של הגרף, למשל A1:C7'); err.hidden = false; return false; }
    st.ti = ti.value.trim() || undefined;
    st.leg = leg.checked; st.lab = lab.checked || undefined; st.pal = pal.value;
    return true;
  };
  const draw = () => {
    types.textContent = '';
    for (const k of CKS) types.append(h('button', { type: 'button', class: 'sh-ch-type' + (st.ck === k ? ' on' : ''), role: 'radio', 'aria-checked': String(st.ck === k), onclick: () => { st.ck = k; draw(); } }, icon(CHARTS[k].ic), h('span', { text: T(CHARTS[k].n) })));
    prev.textContent = '';
    if (!read()) return;
    const box = h('div', { class: 'sh-ch-in' });
    prev.append(box);
    paintChart(box, st, st.src ? dataOfRange(WS, st.src) : dataOfSeries(WS, st), 440, 260);
  };
  for (const x of [refIn, ti]) x.addEventListener('input', debounce(draw, 250));
  for (const x of [by, hr, hc, leg, lab, pal]) x.addEventListener('change', draw);
  const fld = (label, ...kids) => h('label', { class: 'fld' }, h('span', { text: label }), ...kids);
  const body = h('div', { class: 'sh-ch-dlg' },
    h('div', { class: 'sh-ch-side' }, types,
      fld(T('טווח הנתונים'), refIn), note, err,
      h('div', { class: 'sh-ch-row' }, by), hrL, hcL,
      fld(T('כותרת'), ti), legL, labL, fld(T('צבעים'), pal)),
    prev);
  draw();
  modal({ title: T('עריכת הגרף'), wide: true, body, actions: [
    { label: T('אישור'), kind: 'primary', run: () => { if (!read()) return false; if (!WS.charts.some(x => x.id === id)) return; setChart(id, bare(st)); } },
    { label: T('ביטול'), value: false },
  ] });
}
/* rows or columns in or out: the charts' numbers follow their cells (fn changes a reference the way formulas change) */
function eachChart(fn) {
  for (const sh of WB.sheets) {
    let any = false;
    const f = r => { if (r == null) return r; const t = fn(r, sh.name); if (t !== r) any = true; return t; };
    const next = sh.charts.map(ch => {
      const c = bare(ch);
      if (c.src) c.src = { ...c.src, ref: f(c.src.ref) };
      if (c.ser) c.ser = c.ser.map(x => ({ ...x, v: f(x.v), ...(x.nr ? { nr: f(x.nr) } : {}) }));
      if (c.cats) c.cats = f(c.cats);
      return c;
    });
    if (any) setProp(sh, 'charts', next);
    const pv = sh.pivots.map(x => { const t = fn(x.src, sh.name); return t === x.src ? x : { ...x, src: t }; });   // a pivot table's source, written like a chart's range
    if (pv.some((x, i) => x !== sh.pivots[i])) setProp(sh, 'pivots', pv);
  }
}
/* and the charts under or after the change move with their cells */
function moveCharts(s, axis, at, n) {   // and the pictures, and the pivot tables
  const k = axis === 'r' ? 'r' : 'c';
  for (const key of ['charts', 'pics', 'pivots']) {
    let any = false;
    const next = s[key].map(ch => {
      const p = ch.at[k];
      if (p < at) return ch;
      any = true;
      return { ...bare(ch), at: { ...ch.at, [k]: n < 0 && p < at - n ? at : Math.max(0, p + n) } };
    });
    if (any) setProp(s, key, next);
  }
}

/* --- Excel files: charts in, and charts out. ExcelJS reads and writes neither, so the file's parts are read and
   written here, with JSZip --- */
const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
async function zipLib() { if (!window.JSZip) await loadScript(JSZIP); if (!window.JSZip) throw new Error('lib'); return window.JSZip; }
const XK = { barChart: 'bar', bar3DChart: 'bar', lineChart: 'line', line3DChart: 'line', areaChart: 'line', area3DChart: 'line', pieChart: 'pie', pie3DChart: 'pie', doughnutChart: 'donut' };
const EMU = 9525;
const partPath = (base, target) => {   // a relationship's target, from the folder of the part that points to it
  if (target[0] === '/') return target.slice(1);
  const out = base.split('/').slice(0, -1);
  for (const p of target.split('/')) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); }
  return out.join('/');
};
const relsOf = p => p.replace(/([^/]+)$/, '_rels/$1.rels');
/* the charts in an Excel file, sheet by sheet (by the sheet's name in the file): each as a chart of ours, or null when its kind isn't here */
async function readXlsxCharts(buf) {
  const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf), dp = new DOMParser();
  const xml = async p => { const f = zip.file(p); return f ? dp.parseFromString(await f.async('string'), 'application/xml') : null; };
  const rels = async p => { const d = await xml(relsOf(p)), m = new Map(); if (d) for (const r of xdesc(d, 'Relationship')) m.set(xat(r, 'Id'), { type: xat(r, 'Type') || '', target: partPath(p, xat(r, 'Target') || '') }); return m; };
  const out = new Map(), wbx = await xml('xl/workbook.xml');
  if (!wbx) return out;
  const wrels = await rels('xl/workbook.xml');
  for (const sh of xdesc(wbx, 'sheet')) {
    const rid = [...sh.attributes].find(a => a.localName === 'id' && /relationships/.test(a.namespaceURI || ''));
    const sp = rid && wrels.get(rid.value);
    if (!sp) continue;
    const list = [];
    for (const r of (await rels(sp.target)).values()) {
      if (!/\/drawing$/.test(r.type)) continue;
      const dx = await xml(r.target); if (!dx) continue;
      const drels = await rels(r.target);
      for (const an of xkids(dx.documentElement).filter(e => /Anchor$/.test(e.localName))) {
        const num = (e, k) => +((xkid(e, k) || {}).textContent || 0) || 0, pos = e => e && { c: num(e, 'col'), co: num(e, 'colOff'), r: num(e, 'row'), ro: num(e, 'rowOff') };
        const pe = xkid(an, 'pic');
        if (pe) {
          const bl = xdesc(pe, 'blip')[0], er = bl && [...bl.attributes].find(a => a.localName === 'embed'), mp = er && drels.get(er.value), nv = xdesc(pe, 'cNvPr')[0];
          const kind = mp && /\.(png|jpe?g|gif)$/i.exec(mp.target), f = kind && zip.file(mp.target);
          const d = f ? 'data:image/' + (/^jpe?g$/i.test(kind[1]) ? 'jpeg' : kind[1].toLowerCase()) + ';base64,' + await f.async('base64') : null;
          const xf = xdesc(pe, 'xfrm')[0], pext = xf && xkid(xf, 'ext');   // its size (not the blip's own extLst)
          list.push({ pic: okImg(d) ? { d, alt: (nv && (xat(nv, 'descr') || '')) || '' } : null, from: pos(xkid(an, 'from')), to: pos(xkid(an, 'to')), ext: pext && { cx: +xat(pext, 'cx') || 0, cy: +xat(pext, 'cy') || 0 } });
          continue;
        }
        const ce = xdesc(an, 'chart')[0], cr = ce && [...ce.attributes].find(a => a.localName === 'id');
        const cp = cr && drels.get(cr.value);
        if (!cp) continue;
        const from = pos(xkid(an, 'from')), to = pos(xkid(an, 'to')), ext = xkid(an, 'ext');
        list.push({ chart: chartFromXml(await xml(cp.target)), from, to, ext: ext && { cx: +xat(ext, 'cx') || 0, cy: +xat(ext, 'cy') || 0 } });
      }
    }
    if (list.length) out.set(xat(sh, 'name'), list);
  }
  return out;
}
function chartFromXml(doc) {
  const plot = doc && xdesc(doc, 'plotArea')[0];
  if (!plot) return null;
  const ty = xkids(plot).find(e => XK[e.localName]);
  if (!ty) return null;
  let ck = XK[ty.localName];
  if (ck === 'bar') ck = xat(xkid(ty, 'barDir'), 'val') === 'bar' ? 'bar' : 'col';
  const fOf = e => { const f = e && xdesc(e, 'f')[0]; return f ? f.textContent.trim().replace(/^\[0\]!/, '') : null; };   // [0]!Sales: a name of the workbook
  const ser = [];
  for (const s of xkids(ty, 'ser')) {
    const v = fOf(xkid(s, 'val'));
    if (!v || /[(),]/.test(v)) return null;
    const tx = xkid(s, 'tx'), nr = fOf(tx), lit = tx && xkid(tx, 'v');
    ser.push({ v, ...(nr ? { nr } : lit ? { n: lit.textContent.slice(0, 80) } : {}) });
  }
  if (!ser.length) return null;
  const s0 = xkids(ty, 'ser')[0], cats = fOf(xkid(s0, 'cat'));
  const chart = xdesc(doc, 'chart')[0], title = xkid(chart, 'title'), auto = xat(xkid(chart, 'autoTitleDeleted'), 'val') === '1';
  const ch = { ck, ser, leg: !!xkid(chart, 'legend'), pal: 'office' };
  if (ck !== 'pie' && ck !== 'donut') { const ax = xkid(plot, ck === 'bar' ? 'valAx' : 'catAx'); ch.dir = xat(xkid(xkid(ax, 'scaling'), 'orientation'), 'val') === 'maxMin' ? 'rtl' : 'ltr'; }
  if (cats && !/[(),]/.test(cats)) ch.cats = cats;
  const rich = title ? xdesc(title, 't').map(t => t.textContent).join('').trim() : '';
  const tcache = title && fOf(title) ? xdesc(title, 'v').map(t => t.textContent).join('').trim() : '';
  if (rich || tcache) ch.ti = (rich || tcache).slice(0, 150);
  else if (!auto && ser.length === 1) ch.tiSer = true;   // Excel's own title for one series: its name
  if (xdesc(ty, 'showVal').some(e => xat(e, 'val') === '1') || xdesc(ty, 'showPercent').some(e => xat(e, 'val') === '1')) ch.lab = true;
  return ch;
}
/* where a drawing's object sits on sheet s, by its anchor: its cell, the distance from the cell's corner, its size */
function anchorBox(s, x) {
  const wOf = i => s.hc.has(i) ? 0 : s.cw.get(i) ?? s.dw, hOf = i => s.hr.has(i) ? 0 : s.rh.get(i) ?? s.dh;
  const f = x.from || { c: 0, co: 0, r: 0, ro: 0 };
  let w = 480, hh = 288;
  if (x.to) {
    w = -f.co / EMU; for (let i = f.c; i < x.to.c && i < f.c + 500; i++) w += wOf(i); w += x.to.co / EMU;
    hh = -f.ro / EMU; for (let i = f.r; i < x.to.r && i < f.r + 5000; i++) hh += hOf(i); hh += x.to.ro / EMU;
  } else if (x.ext && x.ext.cx) { w = x.ext.cx / EMU; hh = x.ext.cy / EMU; }
  return { at: A1(f.r, f.c), dx: f.co / EMU, dy: f.ro / EMU, w, h: hh };
}
/* a picture from a file: its image into the workbook's images */
function placeXlsxPic(s, nb, x) {
  const key = imgKey(x.pic.d);
  nb.imgs.set(key, x.pic.d);
  return normPic({ ...anchorBox(s, x.ext && x.ext.cx ? { ...x, to: null } : x), img: key, alt: x.pic.alt });   // its own size when the file says it: the cells it covers have other widths here
}
/* a chart from a file on sheet s: where it sits by its anchor, and its references as one range when they make one */
function placeXlsxChart(s, x) {
  const c = x.chart;
  const ch = normSheetChart({ ...c, id: sid(), ...anchorBox(s, x) });
  if (!ch) return null;
  if (c.tiSer) { const d = dataOfSeries(s, ch); if (d.ser[0] && d.ser[0].n) ch.ti = d.ser[0].n; }
  const src = toSrc(s, ch);
  if (src) { ch.src = src; delete ch.ser; delete ch.cats; }
  return ch;
}
/* series that sit side by side, each one column (or one row), with their names above them and the categories beside
   them, are one range: a chart made here keeps it that way, and its window can show it */
function toSrc(s, ch) {
  if (ch.ser.some(x => x.n != null && !x.nr)) return null;
  const vs = ch.ser.map(x => chartRef(s, x.v));
  if (vs.some(v => !v)) return null;
  const sh = vs[0].s, g0 = vs[0].g;
  if (vs.some(v => v.s !== sh)) return null;
  const cat = ch.cats ? chartRef(s, ch.cats) : null, names = ch.ser.map(x => x.nr ? chartRef(s, x.nr) : null);
  if (ch.cats && (!cat || cat.s !== sh)) return null;
  if ([...vs, cat, ...names].some(x => x && x.name)) return null;   // a series that is a defined name stays one, and follows it
  const one = (x, r, c) => !!x && x.s === sh && x.g.r1 === r && x.g.r2 === r && x.g.c1 === c && x.g.c2 === c;
  const pre = sh === s ? '' : "'" + sh.name.replace(/'/g, "''") + "'!";
  if (vs.every((v, i) => v.g.c1 === v.g.c2 && v.g.c1 === g0.c1 + i && v.g.r1 === g0.r1 && v.g.r2 === g0.r2)) {
    const hr = names.every(n => !n) ? 0 : names.every((n, i) => one(n, g0.r1 - 1, g0.c1 + i)) ? 1 : -1;
    const hc = !cat ? 0 : cat.g.c1 === g0.c1 - 1 && cat.g.c2 === g0.c1 - 1 && cat.g.r1 === g0.r1 && cat.g.r2 === g0.r2 ? 1 : -1;
    if (hr < 0 || hc < 0 || (hr && !hc && cat)) return null;
    return { ref: pre + rangeA1({ r1: g0.r1 - hr, c1: g0.c1 - hc, r2: g0.r2, c2: g0.c1 + vs.length - 1 }), by: 'c', hr, hc };
  }
  if (vs.every((v, i) => v.g.r1 === v.g.r2 && v.g.r1 === g0.r1 + i && v.g.c1 === g0.c1 && v.g.c2 === g0.c2)) {
    const hc = names.every(n => !n) ? 0 : names.every((n, i) => one(n, g0.r1 + i, g0.c1 - 1)) ? 1 : -1;
    const hr = !cat ? 0 : cat.g.r1 === g0.r1 - 1 && cat.g.r2 === g0.r1 - 1 && cat.g.c1 === g0.c1 && cat.g.c2 === g0.c2 ? 1 : -1;
    if (hr < 0 || hc < 0) return null;
    return { ref: pre + rangeA1({ r1: g0.r1 - hr, c1: g0.c1 - hc, r2: g0.r1 + vs.length - 1, c2: g0.c2 }), by: 'r', hr, hc };
  }
  return null;
}
/* each series as references Excel reads: 'Sheet'!$B$2:$B$9, with the values they hold now */
function xlSeries(s, ch) {
  const q = sh => "'" + sh.name.replace(/'/g, "''") + "'!";
  const abs = (sh, g) => q(sh) + (g.r1 === g.r2 && g.c1 === g.c2 ? '$' + colName(g.c1) + '$' + (g.r1 + 1) : '$' + colName(g.c1) + '$' + (g.r1 + 1) + ':$' + colName(g.c2) + '$' + (g.r2 + 1));
  const vals = (sh, g, num) => { const out = []; for (let r = g.r1; r <= g.r2 && out.length < 4000; r++) for (let c = g.c1; c <= g.c2 && out.length < 4000; c++) out.push(num ? cellNum(sh, r, c) : cellText(sh, r, c)); return out; };
  // a series that is a defined name is written as the name, the way Excel's files do: [0]!Sales for the workbook's, 'Sheet'!Sales for a sheet's own
  const named = nm => { const own = nm.s && WB.sheets.find(x => x.id === nm.s); return (own ? q(own) : '[0]!') + nm.n; };
  const one = ref => { const R = chartRef(s, ref); return R && { f: R.name ? named(R.name) : abs(R.s, R.g), sh: R.s, g: R.g }; };
  const out = { cats: null, ser: [] };
  if (ch.src) {
    const R = chartRef(s, ch.src.ref); if (!R) return null;
    const { s: sh, g } = R, { hr, hc } = ch.src;
    if (ch.src.by === 'r') {
      if (hr) { const cg = { r1: g.r1, c1: g.c1 + hc, r2: g.r1, c2: g.c2 }; out.cats = { f: abs(sh, cg), v: vals(sh, cg) }; }
      for (let r = g.r1 + hr; r <= g.r2; r++) { const vg = { r1: r, c1: g.c1 + hc, r2: r, c2: g.c2 }; out.ser.push({ name: hc ? { f: abs(sh, { r1: r, c1: g.c1, r2: r, c2: g.c1 }), v: cellText(sh, r, g.c1) } : null, val: { f: abs(sh, vg), v: vals(sh, vg, true) } }); }
    } else {
      if (hc) { const cg = { r1: g.r1 + hr, c1: g.c1, r2: g.r2, c2: g.c1 }; out.cats = { f: abs(sh, cg), v: vals(sh, cg) }; }
      for (let c = g.c1 + hc; c <= g.c2; c++) { const vg = { r1: g.r1 + hr, c1: c, r2: g.r2, c2: c }; out.ser.push({ name: hr ? { f: abs(sh, { r1: g.r1, c1: c, r2: g.r1, c2: c }), v: cellText(sh, g.r1, c) } : null, val: { f: abs(sh, vg), v: vals(sh, vg, true) } }); }
    }
  } else {
    const cr = ch.cats && one(ch.cats);
    if (cr) out.cats = { f: cr.f, v: vals(cr.sh, cr.g) };
    for (const x of ch.ser) {
      const vr = one(x.v); if (!vr) continue;
      const nr = x.nr && one(x.nr);
      out.ser.push({ name: nr ? { f: nr.f, v: vals(nr.sh, nr.g).join(' ') } : x.n != null ? { lit: x.n } : null, val: { f: vr.f, v: vals(vr.sh, vr.g, true) } });
    }
  }
  return out.ser.length ? out : null;
}
/* one chart part, the way Excel writes it */
function xlChartXml(s, ch) {
  const S = xlSeries(s, ch);
  if (!S) return null;
  const x = t => esc(String(t)), round = ch.ck === 'pie' || ch.ck === 'donut';
  const strRef = (r, one) => `<c:strRef><c:f>${x(r.f)}</c:f><c:strCache><c:ptCount val="${one ? 1 : r.v.length}"/>${(one ? [r.v] : r.v).map((v, i) => `<c:pt idx="${i}"><c:v>${x(v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef>`;
  const numRef = r => `<c:numRef><c:f>${x(r.f)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${r.v.length}"/>${r.v.map((v, i) => `<c:pt idx="${i}"><c:v>${+v || 0}</c:v></c:pt>`).join('')}</c:numCache></c:numRef>`;
  const fill = c => `<c:spPr><a:solidFill><a:srgbClr val="${c.slice(1).toUpperCase()}"/></a:solidFill>${ch.ck === 'line' ? `<a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${c.slice(1).toUpperCase()}"/></a:solidFill><a:round/></a:ln>` : round ? '<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>' : ''}</c:spPr>`;
  const cols = ch.pal === 'bright' ? BRIGHT : OFFICE;
  const labels = ch.lab ? `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="${round ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${round ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>` : '';
  const ser = S.ser.map((sr, i) => {
    const tx = sr.name ? sr.name.lit != null ? `<c:tx><c:v>${x(sr.name.lit)}</c:v></c:tx>` : `<c:tx>${strRef(sr.name, true)}</c:tx>` : '';
    const pts = round ? sr.val.v.map((_, j) => `<c:dPt><c:idx val="${j}"/><c:bubble3D val="0"/>${fill(cols[j % cols.length])}</c:dPt>`).join('') : '';
    const cat = S.cats ? `<c:cat>${strRef(S.cats)}</c:cat>` : '';
    const c = cols[i % cols.length].slice(1).toUpperCase(), dot = `<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></a:ln></c:spPr></c:marker>`;
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}${round ? '' : fill(cols[i % cols.length])}${ch.ck === 'line' ? dot : ch.ck === 'col' || ch.ck === 'bar' ? '<c:invertIfNegative val="0"/>' : ''}${pts}${cat}<c:val>${numRef(sr.val)}</c:val>${ch.ck === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
  }).join('');
  // a right-to-left sheet's chart runs right to left, as it does here: the categories (or, for bars, the values) reversed
  const rtl = (ch.dir || s.dir) === 'rtl', cRev = rtl && ch.ck !== 'bar' ? 'maxMin' : 'minMax', vRev = rtl && ch.ck === 'bar' ? 'maxMin' : 'minMax';
  const axes = `<c:catAx><c:axId val="500000001"/><c:scaling><c:orientation val="${cRev}"/></c:scaling><c:delete val="0"/><c:axPos val="${ch.ck === 'bar' ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="500000002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
    + `<c:valAx><c:axId val="500000002"/><c:scaling><c:orientation val="${vRev}"/></c:scaling><c:delete val="0"/><c:axPos val="${ch.ck === 'bar' ? 'b' : 'l'}"/><c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="500000001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  const ax = '<c:axId val="500000001"/><c:axId val="500000002"/>';
  const body = ch.ck === 'line' ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}${labels}<c:marker val="1"/>${ax}</c:lineChart>${axes}`
    : ch.ck === 'pie' ? `<c:pieChart><c:varyColors val="1"/>${ser}${labels}<c:firstSliceAng val="0"/></c:pieChart>`
    : ch.ck === 'donut' ? `<c:doughnutChart><c:varyColors val="1"/>${ser}${labels}<c:firstSliceAng val="0"/><c:holeSize val="50"/></c:doughnutChart>`
    : `<c:barChart><c:barDir val="${ch.ck === 'bar' ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}${labels}<c:gapWidth val="150"/>${ax}</c:barChart>${axes}`;
  const title = ch.ti ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="0"/></a:pPr><a:r><a:rPr lang="he-IL" sz="1400" b="0"/><a:t>${x(ch.ti)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${title}<c:autoTitleDeleted val="${ch.ti ? 0 : 1}"/><c:plotArea><c:layout/>${body}</c:plotArea>${ch.leg ? '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' : ''}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:latin typeface="${DEF_FONT}"/><a:cs typeface="${DEF_FONT}"/></a:defRPr></a:pPr><a:endParaRPr lang="he-IL"/></a:p></c:txPr></c:chartSpace>`;
}
/* where a chart sits, as Excel keeps it: from a cell to a cell, each with a distance in EMU */
/* where a chart or a picture starts: its cell and the distance from the cell's corner. Its size goes into the file as
   it is (oneCellAnchor's ext), so Excel shows it at the same size whatever width its columns turn out to have there */
function xlFrom(ch) {
  return `<xdr:from><xdr:col>${ch.at.c}</xdr:col><xdr:colOff>${Math.round(ch.at.dx * EMU)}</xdr:colOff><xdr:row>${ch.at.r}</xdr:row><xdr:rowOff>${Math.round(ch.at.dy * EMU)}</xdr:rowOff></xdr:from>`;
}
/* the charts into a workbook ExcelJS wrote: a drawing for each sheet that has some, and a chart part for each chart */
async function addXlsxCharts(buf) {   // and the pictures, in the same drawing
  const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf);
  let ct = await zip.file('[Content_Types].xml').async('string'), dn = 0, cn = 0, mn = 0;
  const used = p => !!zip.file(p), media = new Map();
  for (let i = 0; i < WB.sheets.length; i++) {
    const s = WB.sheets[i], charts = s.charts.map(ch => [ch, xlChartXml(s, ch)]).filter(x => x[1]), pics = s.pics.filter(x => WB.imgs.get(x.img));
    if (!charts.length && !pics.length) continue;
    const sp = `xl/worksheets/sheet${i + 1}.xml`, sf = zip.file(sp);
    if (!sf) continue;
    do dn++; while (used(`xl/drawings/drawing${dn}.xml`));
    const anchors = [], drels = [];
    charts.forEach(([ch, xml], j) => {
      do cn++; while (used(`xl/charts/chart${cn}.xml`));
      zip.file(`xl/charts/chart${cn}.xml`, xml);
      ct = ct.replace('</Types>', `<Override PartName="/xl/charts/chart${cn}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
      drels.push(`<Relationship Id="rId${j + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${cn}.xml"/>`);
      anchors.push(`<xdr:oneCellAnchor>${xlFrom(ch)}<xdr:ext cx="${Math.round(ch.w * EMU)}" cy="${Math.round(ch.h * EMU)}"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${j + 2}" name="${esc(T('גרף {0}', j + 1))}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${j + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`);
    });
    pics.forEach((x, j) => {
      const d = WB.imgs.get(x.img), m = /^data:image\/(png|jpeg|gif);base64,/.exec(d), ext = m[1], rid = charts.length + j + 1;
      let path = media.get(x.img);   // one image is one file, also when several pictures show it
      if (!path) {
        do mn++; while (used(`xl/media/image${mn}.${ext}`));
        path = `xl/media/image${mn}.${ext}`;
        zip.file(path, d.slice(m[0].length), { base64: true });
        media.set(x.img, path);
        if (!new RegExp(`Extension="${ext}"`, 'i').test(ct)) ct = ct.replace('<Default ', `<Default Extension="${ext}" ContentType="image/${ext}"/><Default `);
      }
      drels.push(`<Relationship Id="rId${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${path.split('/').pop()}"/>`);
      // its own size in the file (oneCellAnchor), not the cells it covers: Excel measures columns in letters of its font
      anchors.push(`<xdr:oneCellAnchor>${xlFrom(x)}<xdr:ext cx="${Math.round(x.w * EMU)}" cy="${Math.round(x.h * EMU)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${charts.length + j + 2}" name="${esc(T('תמונה {0}', j + 1))}"${x.alt ? ` descr="${esc(x.alt)}"` : ''}/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
        `<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
        `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(x.w * EMU)}" cy="${Math.round(x.h * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`);
    });
    zip.file(`xl/drawings/drawing${dn}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.join('')}</xdr:wsDr>`);
    zip.file(`xl/drawings/_rels/drawing${dn}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drels.join('')}</Relationships>`);
    ct = ct.replace('</Types>', `<Override PartName="/xl/drawings/drawing${dn}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
    // the sheet points to its drawing
    const rp = relsOf(sp), rf = zip.file(rp);
    let rx = rf ? await rf.async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    let k = 1; while (rx.includes(`Id="rId${k}"`)) k++;
    rx = rx.replace('</Relationships>', `<Relationship Id="rId${k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${dn}.xml"/></Relationships>`);
    zip.file(rp, rx);
    let sx = await sf.async('string');
    if (!/xmlns:r=/.test(sx.slice(0, 600))) sx = sx.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    const at = ['<legacyDrawing', '<legacyDrawingHF', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>'].map(t => sx.indexOf(t)).filter(p => p >= 0);
    const pos = Math.min(...at);
    sx = sx.slice(0, pos) + `<drawing r:id="rId${k}"/>` + sx.slice(pos);
    zip.file(sp, sx);
  }
  zip.file('[Content_Types].xml', ct);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
/* printing and PDF: the charts after the table, each at its size (or the page's width) */
function chartEls(s, maxW) {   // and the pictures after them
  const pics = s.pics.map(x => { const d = WB.imgs.get(x.img), k = Math.min(1, maxW / x.w); return d ? h('img', { src: d, alt: x.alt || '', style: { display: 'block', width: x.w * k + 'px', height: x.h * k + 'px' } }) : null; }).filter(Boolean);
  return [...chartBoxes(s, maxW), ...pics];
}
function chartBoxes(s, maxW) {
  return s.charts.map(ch => {
    const k = Math.min(1, maxW / ch.w), w = ch.w * k, hh = ch.h * k;
    const box = h('div', { class: 'sh-ch-in sh-ch-print', style: { position: 'relative', width: w + 'px', height: hh + 'px', background: '#fff', border: '1px solid #d9d9d9', direction: 'ltr' } });
    const keep = WS; WS = s;
    try { paintChart(box, ch, chartData(s, ch), w, hh, k); } finally { WS = keep; }
    return box;
  });
}

/* =========================================================
   shared rooms (the rooms themselves are in index.html): the workbook as entries, each with its own stamp.
   m its direction, o the order of the sheets, g/<sheet> a sheet's settings, r/<sheet> and k/<sheet> the ids of its
   rows and columns, c/<sheet>/<row>/<column> a cell, n/<id> a defined name. A row and a column are known by an id that moves with it, so
   what someone writes stays in its row while someone else adds or takes out rows above it. The ids follow from
   each other (nextId), so rows nobody moved have the same ids in every browser without being sent: a list travels
   as the ids that don't follow, with counts for the runs that do
   ========================================================= */
const RM = { on: false, cells: new Set(), props: new Set(), lists: new Set(), full: new Set(), book: false, names: false, all: false, peers: [] };
const RMAX = 100000;   // rows past this in a room aren't shared (a sheet in a room is small; Excel's last row would cost a second)
const CMAX = MAXC;
const ID = /^[a-z0-9]{1,12}$/;
const nextId = id => 'x' + hash53(id + '/').slice(0, 10);
const newId = () => 'n' + (Math.random().toString(36).slice(2) + '0000000').slice(0, 7);
function packIds(a, seed) {
  const out = [];
  let prev = seed, run = 0;
  for (const id of a) {
    if (id === nextId(prev)) run++;
    else { if (run) out.push(run); run = 0; out.push(id); }
    prev = id;
  }
  if (run) out.push(run);
  return out;
}
function unpackIds(p, seed, max) {
  if (!Array.isArray(p)) return null;
  const out = [];
  let prev = seed;
  for (const x of p) {
    if (typeof x === 'string') { if (!ID.test(x)) return null; out.push(prev = x); }
    else if (Number.isInteger(x) && x > 0 && out.length + x <= max) for (let i = 0; i < x; i++) out.push(prev = nextId(prev));
    else return null;
    if (out.length > max) return null;
  }
  return out;
}
/* a sheet's row (ri) or column (ci) ids, long enough to reach n */
function grow(s, key, n) {
  const a = s[key] || [];
  if (a.length >= n) { s[key] = a; return; }
  let last = a.length ? a[a.length - 1] : s.id + '/' + key;
  const add = [];
  while (a.length + add.length < n) { last = nextId(last); add.push(last); }
  s[key] = a.concat(add);
  if (RM.on) RM.lists.add(s.id);
}
const idAt = (s, key, i) => i < (key === 'ri' ? RMAX : CMAX) ? (grow(s, key, i + 1), s[key][i]) : null;
function posOf(s, key) {   // id → row or column
  const a = s[key] || [], c = s['_' + key];
  if (c && c.a === a) return c;
  const m = new Map();
  a.forEach((id, i) => m.set(id, i));
  m.a = a; s['_' + key] = m;
  return m;
}
const cellKey = (s, r, c) => { const a = idAt(s, 'ri', r), b = idAt(s, 'ci', c); return a && b ? 'c/' + s.id + '/' + a + '/' + b : null; };
/* a cell as it travels: a formula without its result, which each browser works out */
function recOut(x) { const j = cellOut(x); if (x.f != null && !x.x) { delete j.v; delete j.e; } return j; }
/* a sheet's settings, by row and column ids */
function gOut(s) {
  const rid = r => idAt(s, 'ri', r), cid = c => idAt(s, 'ci', c);
  const pairs = (m, f) => [...m].map(([i, v]) => [f(i), v]).filter(p => p[0]);
  const box = g => { const b = [rid(g.r1), cid(g.c1), rid(g.r2), cid(g.c2)]; return b.every(Boolean) ? b : null; };
  const o = { name: s.name, dir: s.dir };
  if (s.fr) o.fr = s.fr;
  if (s.fc) o.fc = s.fc;
  if (!s.gl) o.gl = false;
  if (s.tab) o.tab = s.tab;
  if (s.dw !== DEF_W) o.dw = s.dw;
  if (s.dh !== DEF_H) o.dh = s.dh;
  if (s.ds) o.ds = s.ds;
  if (s.cw.size) o.cw = pairs(s.cw, cid);
  if (s.rh.size) o.rh = pairs(s.rh, rid);
  if (s.cs.size) o.cs = pairs(s.cs, cid);
  if (s.rs.size) o.rs = pairs(s.rs, rid);
  if (s.hc.size) o.hc = [...s.hc].map(cid).filter(Boolean);
  if (s.hr.size) o.hr = [...s.hr].map(rid).filter(Boolean);
  if (s.merges.length) o.mg = s.merges.map(box).filter(Boolean);
  if (s.af) { const b = box(s.af); if (b) o.af = { g: b, hide: Object.entries(s.af.hide).map(([c, v]) => [cid(+c), v]).filter(p => p[0]) }; }
  if (s.charts.length) o.ch = s.charts.map(ch => { const x = chartOut(ch), a = rid(ch.at.r), b = cid(ch.at.c); delete x.dx; delete x.dy; return a && b ? { ...x, at: [a, b, ch.at.dx, ch.at.dy] } : null; }).filter(Boolean);
  if (s.pics.length) o.pi = s.pics.map(x => { const y = picOut(x), a = rid(x.at.r), b = cid(x.at.c); delete y.dx; delete y.dy; return a && b ? { ...y, at: [a, b, x.at.dx, x.at.dy] } : null; }).filter(Boolean);
  for (const key of RULE_KEYS) if (s[key].length) o[key] = s[key].map(rule => { const x = cfOut(rule), b = rule.g.map(box); delete x.ref; return b.every(Boolean) ? { ...x, g: b } : null; }).filter(Boolean);
  if (s.tables.length) o.tb = s.tables.map(t => { const x = tableOut(t), b = box(t.g); delete x.ref; return b ? { ...x, g: b } : null; }).filter(Boolean);
  if (s.pivots.length) o.pv = s.pivots.map(x => { const y = pivotOut(x), a = rid(x.at.r), b = cid(x.at.c); delete y.at; return a && b ? { ...y, at: [a, b] } : null; }).filter(Boolean);
  return o;
}
/* the same, checked, from someone else */
function gNorm(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || typeof v.name !== 'string') return undefined;
  const okid = x => typeof x === 'string' && ID.test(x);
  const n = (x, lo, hi) => Number.isFinite(+x) ? clamp(Math.round(+x), lo, hi) : null;
  const pairs = (l, f) => (Array.isArray(l) ? l : []).slice(0, RMAX).filter(p => Array.isArray(p) && okid(p[0])).map(p => [p[0], f(p[1])]).filter(p => p[1] != null);
  const box = b => Array.isArray(b) && b.length === 4 && b.every(okid) ? b.slice() : null;
  const o = { name: cleanName(v.name) || sheetWord(1), dir: v.dir === 'ltr' ? 'ltr' : 'rtl' };
  if (v.fr) o.fr = n(v.fr, 0, 200);
  if (v.fc) o.fc = n(v.fc, 0, 60);
  if (v.gl === false) o.gl = false;
  if (HEX.test(v.tab)) o.tab = v.tab.toLowerCase();
  if (v.dw != null) o.dw = n(v.dw, 10, 600);
  if (v.dh != null) o.dh = n(v.dh, 8, 200);
  const ds = normStyle(v.ds); if (ds) o.ds = ds;
  for (const [k, f] of [['cw', x => n(x, 2, 2000)], ['rh', x => n(x, 4, 800)], ['cs', normStyle], ['rs', normStyle]]) { const p = pairs(v[k], f); if (p.length) o[k] = p; }
  for (const k of ['hc', 'hr']) { const l = (Array.isArray(v[k]) ? v[k] : []).filter(okid).slice(0, RMAX); if (l.length) o[k] = l; }
  const mg = (Array.isArray(v.mg) ? v.mg : []).map(box).filter(Boolean).slice(0, 5000); if (mg.length) o.mg = mg;
  const af = v.af && typeof v.af === 'object' && box(v.af.g);
  if (af) o.af = { g: af, hide: pairs(v.af.hide, x => Array.isArray(x) ? x.filter(t => typeof t === 'string').slice(0, 20000) : null) };
  const ch = (Array.isArray(v.ch) ? v.ch : []).slice(0, 50).map(x => {
    const a = x && Array.isArray(x.at) && x.at.length === 4 && okid(x.at[0]) && okid(x.at[1]) ? x.at : null, c = a && normSheetChart({ ...x, at: 'A1', dx: a[2], dy: a[3] });
    if (!c) return null;
    const o2 = chartOut(c); delete o2.dx; delete o2.dy;
    return { ...o2, at: [a[0], a[1], c.at.dx, c.at.dy] };
  }).filter(Boolean);
  if (ch.length) o.ch = ch;
  const pi = (Array.isArray(v.pi) ? v.pi : []).slice(0, 100).map(x => {
    const a = x && Array.isArray(x.at) && x.at.length === 4 && okid(x.at[0]) && okid(x.at[1]) ? x.at : null, q = a && normPic({ ...x, at: 'A1', dx: a[2], dy: a[3] });
    if (!q) return null;
    const o2 = picOut(q); delete o2.dx; delete o2.dy;
    return { ...o2, at: [a[0], a[1], q.at.dx, q.at.dy] };
  }).filter(Boolean);
  if (pi.length) o.pi = pi;
  const tb = (Array.isArray(v.tb) ? v.tb : []).slice(0, 100).map(x => {   // checked over a stand-in range of its own width (its place comes by ids)
    const b = x && box(x.g), w = clamp(Array.isArray(x.cols) ? x.cols.length : 1, 1, 16384), t = b && normTable({ ...x, g: { r1: 0, c1: 0, r2: 3, c2: w - 1 } });
    if (!t) return null;
    const o2 = tableOut(t); delete o2.ref; return { ...o2, g: b };
  }).filter(Boolean);
  if (tb.length) o.tb = tb;
  const pv = (Array.isArray(v.pv) ? v.pv : []).slice(0, 50).map(x => { const a = x && Array.isArray(x.at) && x.at.length === 2 && okid(x.at[0]) && okid(x.at[1]) ? x.at : null, q = a && normPivot({ ...x, at: 'A1' }); if (!q) return null; const o2 = pivotOut(q); delete o2.at; return { ...o2, at: [a[0], a[1]] }; }).filter(Boolean);
  if (pv.length) o.pv = pv;
  for (const key of RULE_KEYS) {
    const rules = (Array.isArray(v[key]) ? v[key] : []).slice(0, key === 'dv' ? DV_MAX : 500).map(x => {
      const g = x && Array.isArray(x.g) ? x.g.map(box).filter(Boolean).slice(0, 50) : [], r = g.length && ruleNorm(key)({ ...x, g: null, ref: 'A1' });
      if (!r) return null;
      const o2 = cfOut(r);
      delete o2.ref;
      return { ...o2, g };
    }).filter(Boolean);
    if (rules.length) o[key] = rules;
  }
  return o;
}
/* into a sheet, by the ids it has now */
function gIn(s, g, taken) {
  const rp = posOf(s, 'ri'), cp = posOf(s, 'ci'), R_ = id => rp.get(id), C_ = id => cp.get(id);
  const name = cleanName(g.name) || s.name || sheetWord(1);
  s.name = taken ? freeName(name, taken) : name;
  if (taken) taken.add(s.name.toLowerCase());
  s.dir = g.dir === 'ltr' ? 'ltr' : 'rtl';
  s.fr = g.fr || 0; s.fc = g.fc || 0; s.gl = g.gl !== false; s.tab = g.tab || null;
  s.dw = g.dw || DEF_W; s.dh = g.dh || DEF_H; s.ds = g.ds || null;
  const map = (l, P) => { const m = new Map(); for (const [id, v] of l || []) { const i = P(id); if (i != null) m.set(i, v); } return m; };
  s.cw = map(g.cw, C_); s.rh = map(g.rh, R_); s.cs = map(g.cs, C_); s.rs = map(g.rs, R_);
  s.hc = new Set((g.hc || []).map(C_).filter(i => i != null)); s.hr = new Set((g.hr || []).map(R_).filter(i => i != null));
  const box = b => { const r1 = R_(b[0]), c1 = C_(b[1]), r2 = R_(b[2]), c2 = C_(b[3]); return r1 == null || c1 == null || r2 == null || c2 == null || r2 < r1 || c2 < c1 ? null : { r1, c1, r2, c2 }; };
  s.merges = [];
  for (const b of g.mg || []) { const m = box(b); if (m && (m.r1 !== m.r2 || m.c1 !== m.c2) && !s.merges.some(o => meets(o, m))) s.merges.push(m); }
  const af = g.af && box(g.af.g);
  if (af) { const hide = {}; for (const [id, v] of g.af.hide || []) { const c = C_(id); if (c != null && c >= af.c1 && c <= af.c2) hide[c] = v; } s.af = { ...af, hide }; }
  else s.af = null;
  s.charts = (g.ch || []).map(x => { const r = R_(x.at[0]), c = C_(x.at[1]); return r == null || c == null ? null : normSheetChart({ ...x, at: A1(r, c), dx: x.at[2], dy: x.at[3] }); }).filter(Boolean);
  s.pics = (g.pi || []).map(x => { const r = R_(x.at[0]), c = C_(x.at[1]); return r == null || c == null ? null : normPic({ ...x, at: A1(r, c), dx: x.at[2], dy: x.at[3] }); }).filter(Boolean);
  s.pivots = (g.pv || []).map(x => { const r = R_(x.at[0]), c = C_(x.at[1]); return r == null || c == null ? null : normPivot({ ...x, at: A1(r, c) }); }).filter(Boolean);
  s.tables = [];
  for (const x of g.tb || []) { const gg = box(x.g), t = gg && normTable({ ...x, g: gg }); if (t && !s.tables.some(o => meets(o.g, t.g))) s.tables.push(t); }
  for (const key of RULE_KEYS) s[key] = (g[key] || []).map(x => { const gg = x.g.map(box).filter(Boolean); return gg.length ? ruleNorm(key)({ ...x, g: gg }) : null; }).filter(Boolean);
}
/* an entry from someone else, checked the way a workbook from storage is (undefined: not taken) */
function roomNorm(k, v) {
  if (v == null) return null;
  if (k === 'm') return typeof v === 'object' ? { dir: v.dir === 'ltr' ? 'ltr' : 'rtl' } : undefined;
  if (k === 'o') return Array.isArray(v) ? v.filter(okId).slice(0, 250) : undefined;
  const c = k[0];
  if (c === 'g') return gNorm(v);
  if (c === 'r' || c === 'k') return unpackIds(v, 'x', c === 'r' ? RMAX : CMAX) ? v : undefined;
  if (c === 'c') { const x = normCell(v); return x ? recOut(x) : undefined; }
  if (c === 'n') { const x = normName(v, null); return x && k === 'n/' + nameId(x) ? nameOut(x) : undefined; }
  if (c === 'i') return okImg(v) && k === 'i/' + imgKey(v) ? v : undefined;   // an image: its key is made from its data
  return undefined;
}
/* the images the pictures of these sheets show, each once */
function imgEntries(sheets, each) {
  const seen = new Set();
  for (const sh of sheets) for (const x of sh.pics) { const d = WB.imgs.get(x.img); if (d && !seen.has(x.img)) { seen.add(x.img); each('i/' + x.img, () => d, b => b === d); } }
}
/* a defined name's entry is n/ and letters made from its scope and its name, so the same name is the same entry for everyone */
const nameId = x => ('n' + hash53(nameKey(x))).padEnd(6, '0');
function nameEntries(each) {
  for (const x of WB.names || NO_NAMES) { const v = nameOut(x); each('n/' + nameId(x), () => v, b => same(b, v)); }
}
/* --- this browser's side --- */
function roomStart() {
  RM.on = true;
  RM.cells.clear(); RM.props.clear(); RM.lists.clear(); RM.full.clear(); RM.book = RM.all = RM.names = false;
}
function roomStop(drop) {
  RM.on = false; RM.peers = [];
  RM.cells.clear(); RM.props.clear(); RM.lists.clear(); RM.full.clear(); RM.names = false;
  if (drop && WB) for (const s of WB.sheets) { delete s.ri; delete s.ci; }   // out of the room, the ids aren't needed
  if (WB && V.view) renderSoon();
}
function bookEntries(each) {
  const ids = WB.sheets.map(s => s.id), dir = WB.dir;
  each('m', () => ({ dir }), b => b.dir === dir);
  each('o', () => ids.slice(), b => same(b, ids));
}
function listEntries(s, each) {
  grow(s, 'ri', 0); grow(s, 'ci', 0);
  const r = packIds(s.ri, s.id + '/ri'), c = packIds(s.ci, s.id + '/ci');
  each('r/' + s.id, () => r, b => same(b, r));
  each('k/' + s.id, () => c, b => same(b, c));
}
function sheetEntries(s, each) {
  const cells = [];
  for (const [k, x] of s.cells) { const key = cellKey(s, kr(k), kc(k)); if (key) cells.push([key, recOut(x)]); }
  const g = gOut(s);
  for (const [key, v] of cells) each(key, () => v, b => same(b, v));
  each('g/' + s.id, () => g, b => same(b, g));
  listEntries(s, each);   // last: the cells and settings above may have made the lists longer
}
/* every entry, as it is now: each(key, make the value, is this the same value) */
function roomEntries(each) {
  bookEntries(each);
  nameEntries(each);
  for (const s of WB.sheets) sheetEntries(s, each);
  imgEntries(WB.sheets, each);
}
/* what changed since the last look, into look(); what is gone, into gone(key) */
function roomChanges(look, gone, base) {
  if (!WB) return;
  bookEntries(look);
  if (RM.all || RM.names) {
    const have = new Set();
    nameEntries((k, mk, eq) => { have.add(k); look(k, mk, eq); });
    for (const [k, b] of base) if (b != null && k[0] === 'n' && k[1] === '/' && !have.has(k)) gone(k);
    RM.names = false;
  }
  const byId = new Map(WB.sheets.map(s => [s.id, s]));
  if (RM.all || RM.book) {
    for (const [k, b] of base) if (b != null && k[1] === '/' && 'grkc'.includes(k[0]) && !byId.has(k.split('/')[1])) gone(k);   // sheets taken out
    for (const s of WB.sheets) if (RM.all || !base.has('g/' + s.id)) RM.full.add(s.id); else RM.props.add(s.id);
  }
  for (const id of RM.full) {
    const s = byId.get(id); if (!s) continue;
    const have = new Set(), pre = 'c/' + id + '/';
    sheetEntries(s, (k, mk, eq) => { have.add(k); look(k, mk, eq); });
    for (const [k, b] of base) if (b != null && k.startsWith(pre) && !have.has(k)) gone(k);
  }
  for (const x of RM.cells) {
    const i = x.indexOf('|'), s = byId.get(x.slice(0, i));
    if (!s || RM.full.has(s.id)) continue;
    const k = +x.slice(i + 1), key = cellKey(s, kr(k), kc(k)), cell = key && s.cells.get(k);
    if (!key) continue;
    if (cell) { const v = recOut(cell); look(key, () => v, b => same(b, v)); }
    else if (base.get(key) != null) gone(key);
  }
  for (const id of new Set([...RM.props, ...RM.lists])) {
    const s = byId.get(id); if (!s || RM.full.has(id)) continue;
    const g = gOut(s); look('g/' + id, () => g, b => same(b, g));
  }
  for (const id of RM.lists) {   // rows or columns taken out: their cells go with them
    const s = byId.get(id); if (!s || RM.full.has(id)) continue;
    const rs = posOf(s, 'ri'), cs = posOf(s, 'ci'), pre = 'c/' + id + '/';
    for (const [k, b] of base) if (b != null && k.startsWith(pre)) { const p = k.split('/'); if (!rs.has(p[2]) || !cs.has(p[3])) gone(k); }
  }
  for (const s of WB.sheets) if (RM.lists.has(s.id) || RM.full.has(s.id)) listEntries(s, look);
  imgEntries(WB.sheets.filter(s => RM.full.has(s.id) || RM.props.has(s.id)), look);   // a picture's image goes before the others need it
  RM.cells.clear(); RM.props.clear(); RM.lists.clear(); RM.full.clear(); RM.book = RM.all = false;
}
/* an entry's value here, the way this browser writes it (after something came in, so it doesn't go back out) */
function roomValue(k) {
  if (!WB) return null;
  if (k === 'm') return { dir: WB.dir };
  if (k === 'o') return WB.sheets.map(s => s.id);
  if (k[0] === 'i' && k[1] === '/') return WB.imgs.get(k.slice(2)) || null;
  const p = k.split('/'), s = WB.sheets.find(x => x.id === p[1]);
  if (p[0] === 'n') { const x = (WB.names || NO_NAMES).find(y => nameId(y) === p[1]); return x ? nameOut(x) : null; }
  if (!s) return null;
  if (p[0] === 'g') return gOut(s);
  if (p[0] === 'r') { grow(s, 'ri', 0); return packIds(s.ri, s.id + '/ri'); }
  if (p[0] === 'k') { grow(s, 'ci', 0); return packIds(s.ci, s.id + '/ci'); }
  if (p[0] === 'c') { const r = posOf(s, 'ri').get(p[2]), c = posOf(s, 'ci').get(p[3]), x = r != null && c != null ? s.cells.get(KEY(r, c)) : null; return x ? recOut(x) : null; }
  return null;
}
/* a sheet built again from the room's entries: its ids, its settings, its cells */
function buildSheet(s, st, taken) {
  const val = k => { const x = st.get(k); return x ? x[0] : null; };
  const ri = unpackIds(val('r/' + s.id), s.id + '/ri', RMAX), ci = unpackIds(val('k/' + s.id), s.id + '/ci', CMAX);
  if (ri) s.ri = ri;
  if (ci) s.ci = ci;
  const g = val('g/' + s.id);
  if (g) gIn(s, g, taken);
  const rp = posOf(s, 'ri'), cp = posOf(s, 'ci'), pre = 'c/' + s.id + '/', cells = new Map();
  for (const [k, x] of st) {
    if (x[0] == null || !k.startsWith(pre)) continue;
    const p = k.split('/'), r = rp.get(p[2]), c = cp.get(p[3]), cell = r != null && c != null && normCell(x[0]);
    if (cell) cells.set(KEY(r, c), cell);
  }
  s.cells = cells;
  s._fh = null;
}
/* the sheets in the order entry, then any missing from it (added at the same moment), oldest first */
function sheetIds(st) {
  const val = k => { const x = st.get(k); return x ? x[0] : null; };
  const order = (val('o') || []).filter(id => val('g/' + id));
  const rest = [...st].filter(([k, x]) => k[0] === 'g' && x[0] != null && !order.includes(k.slice(2))).sort((a, b) => a[1][1] - b[1][1]).map(([k]) => k.slice(2));
  return [...new Set([...order, ...rest])];
}
/* where the selection and the cell being written in are, by their ids, so they stay on the same cells */
function anchorNow() {
  if (!WS) return null;
  const id = (key, i) => WS[key] && i < WS[key].length ? WS[key][i] : null;
  return { s: WS, sel: { ...SEL }, r: id('ri', SEL.r), c: id('ci', SEL.c), er: id('ri', SEL.er), ec: id('ci', SEL.ec), ed: ED.on && ED.sid === WS.id ? [id('ri', ED.r), id('ci', ED.c)] : null };
}
function anchorBack(a) {
  if (!a || a.s !== WS) return;
  const rp = posOf(WS, 'ri'), cp = posOf(WS, 'ci'), at = (m, id, i) => id != null && m.has(id) ? m.get(id) : i;
  SEL = { r: at(rp, a.r, a.sel.r), c: at(cp, a.c, a.sel.c), er: at(rp, a.er, a.sel.er), ec: at(cp, a.ec, a.sel.ec) };
  if (a.ed && ED.on) {
    const r = a.ed[0] == null ? ED.r : rp.get(a.ed[0]), c = a.ed[1] == null ? ED.c : cp.get(a.ed[1]);
    if (r == null || c == null) { endEdit(false); toast(T('התא שכתבת בו נמחק'), { icon: 'delete' }); }
    else { ED.r = r; ED.c = c; }
  }
}
/* someone else changed sheet s: undo steps from before this person's last row or column change there no longer fit it
   (their cells moved under them), and redo is gone */
function dropSteps(s) {
  HIST.list.length = HIST.at;
  let i = -1;
  HIST.list.forEach((h, j) => { if (h.props.some(y => y.s === s && (y.name === 'ri' || y.name === 'ci'))) i = j; });
  if (i >= 0) { HIST.list.splice(0, i + 1); HIST.at = HIST.list.length; }
}
/* what came in (acc: [key, value, ...]), into the workbook; st: all of the room's entries. Gives back the keys whose
   value here is further along than what came (a longer list of rows), so they go out again */
function roomApply(acc, st) {
  const stale = new Set();
  if (!WB) return stale;
  const val = k => { const x = st.get(k); return x ? x[0] : null; };
  const byId = id => WB.sheets.find(x => x.id === id);
  let whole = false;
  const again = new Set(), lists = [], props = new Set(), put = new Set(), named = new Set();
  for (const [k] of acc) {
    if (k === 'o' || k === 'm') whole = true;
    else if (k[0] === 'r' || k[0] === 'k') lists.push(k);
    else if (k[0] === 'g') props.add(k.slice(2));
    else if (k[0] === 'c') put.add(k);
    else if (k[0] === 'n') named.add(k);
    else if (k[0] === 'i') { const v = val(k); if (okImg(v)) WB.imgs.set(k.slice(2), v); }   // an image: the pictures that show it draw it now
  }
  const keep = anchorNow();
  if (whole) {
    const m = val('m'), old = new Map(WB.sheets.map(s => [s.id, s])), next = [];
    if (m) WB.dir = m.dir;
    for (const id of sheetIds(st)) { let s = old.get(id); if (!s) { s = Object.assign(newSheet('', WB.dir), { id }); again.add(id); } next.push(s); }
    if (next.length) WB.sheets = next;
  }
  // a list that only goes further than this one adds rows at the end, and nothing moves. Anything else moved rows
  // (or columns), and the sheet is built again from the entries
  const grown = new Map();
  for (const k of lists) {
    const id = k.slice(2), s = byId(id);
    if (!s || again.has(id)) continue;
    const key = k[0] === 'r' ? 'ri' : 'ci', now = s[key] || [], got = unpackIds(val(k), id + '/' + key, key === 'ri' ? RMAX : CMAX);
    if (!got) continue;
    const n = Math.min(now.length, got.length);
    let i = 0;
    while (i < n && now[i] === got[i]) i++;
    if (i < n) { again.add(id); continue; }
    if (got.length > now.length) { s[key] = got; if (!grown.has(s)) grown.set(s, new Set()); for (const x of got.slice(now.length)) grown.get(s).add(x); }
    else if (got.length < now.length) stale.add(k);
  }
  if (again.size) {
    const taken = new Set(WB.sheets.filter(s => !again.has(s.id)).map(s => s.name.toLowerCase()));
    for (const s of WB.sheets) if (again.has(s.id)) buildSheet(s, st, taken);
  }
  for (const id of props) {
    const s = byId(id), g = val('g/' + id);
    if (!s || !g || again.has(id)) continue;
    gIn(s, g, new Set(WB.sheets.filter(x => x !== s).map(x => x.name.toLowerCase())));
    for (const h of HIST.list) h.props = h.props.filter(y => !(y.s === s && y.name !== 'ri' && y.name !== 'ci'));
    dropSteps(s);
  }
  // cells: the ones that came, and any that were waiting for their row or column to arrive
  for (const [s, ids] of grown) {
    const pre = 'c/' + s.id + '/';
    for (const [k, x] of st) if (x[0] != null && k.startsWith(pre)) { const p = k.split('/'); if (ids.has(p[2]) || ids.has(p[3])) put.add(k); }
  }
  const touched = new Set();
  for (const k of put) {
    const p = k.split('/');
    if (again.has(p[1])) continue;
    const s = byId(p[1]); if (!s) continue;
    const r = posOf(s, 'ri').get(p[2]), c = posOf(s, 'ci').get(p[3]); if (r == null || c == null) continue;
    const v = val(k), x = v && normCell(v), key = KEY(r, c);
    if (x) s.cells.set(key, x); else s.cells.delete(key);
    for (const h of HIST.list) h.cells = h.cells.filter(y => !(y.s === s && y.k === key));   // undo takes back only this person's own writing
    touched.add(s);
  }
  for (const s of touched) dropSteps(s);
  if (named.size || whole) {
    // each name that came takes the place of the one here, or goes. A name of a sheet that isn't here yet waits among
    // the entries, and comes in when its sheet does
    const cur = new Map((WB.names || NO_NAMES).map(x => ['n/' + nameId(x), x]));
    for (const k of named) { const v = val(k), x = v && normName(v, null); if (x) cur.set(k, x); else cur.delete(k); }
    if (whole) for (const [k, x] of st) if (k[0] === 'n' && k[1] === '/' && x[0] != null && x[0].s && !cur.has(k)) { const y = normName(x[0], null); if (y) cur.set(k, y); }
    const next = normNames([...cur.values()], WB.sheets);
    if (!sameNames(next, WB.names || NO_NAMES)) { WB.names = next; for (const h of HIST.list) h.names = null; }   // undo takes back only this person's own names
  }
  if (whole || again.size) { HIST.list = []; HIST.at = 0; }   // rows moved under every step kept for undo
  if (!WB.sheets.includes(WS)) showSheet(WB.sheets[0], true);
  anchorBack(keep);
  geoDirty(); recalc(); CHV++;
  for (const s of WB.sheets) filterRows(s);
  refresh();
  return stale;
}
/* the workbook of a room just joined, from its entries */
function roomBook(st) {
  const m = st.get('m'), dir = m && m[0] ? m[0].dir : UI_DIR, book = { v: 1, dir, active: 0, sheets: [] }, taken = new Set();
  for (const id of sheetIds(st)) { const s = Object.assign(newSheet('', dir), { id }); buildSheet(s, st, taken); book.sheets.push(s); }
  book.names = normNames([...st].filter(([k, x]) => k[0] === 'n' && k[1] === '/' && x[0] != null).map(([, x]) => x[0]), book.sheets);
  book.imgs = new Map([...st].filter(([k, x]) => k[0] === 'i' && k[1] === '/' && okImg(x[0])).map(([k, x]) => [k.slice(2), x[0]]));
  return book.sheets.length ? JSON.stringify(bookOut(book)) : null;
}
/* --- the others --- */
function roomPresence() {
  if (!WS) return null;
  const g = selG();
  return { s: WS.id, r: SEL.r, c: SEL.c, g: [g.r1, g.c1, g.r2, g.c2], ed: ED.on ? { s: ED.sid, r: ED.r, c: ED.c } : null };
}
function roomPeers(list) { RM.peers = list || []; if (WB && V.view) renderSoon(); }
function roomGo(pr) {
  const s = WB && pr && WB.sheets.find(x => x.id === pr.s); if (!s) return;
  if (s !== WS) showSheet(s, true);
  SEL = { r: pr.r, c: pr.c, er: pr.r, ec: pr.c };
  refresh(); scrollToSel(); focusGrid();
}
/* each one's selection in their color, and their name on the cell they are on */
function drawPeers(L, rr, cc) {
  if (rr[1] < rr[0] || cc[1] < cc[0]) return;
  const frR = L === V.top || L === V.corner, frC = L === V.side || L === V.corner;
  const lo = { r: frR ? 0 : WS.fr, c: frC ? 0 : WS.fc }, hi = { r: frR ? WS.fr - 1 : EXT.rows - 1, c: frC ? WS.fc - 1 : EXT.cols - 1 };
  for (const p of RM.peers) {
    const q = p.pr;
    if (!q || q.s !== WS.id || !q.g) continue;
    const y = { r1: Math.max(q.g[0], lo.r), c1: Math.max(q.g[1], lo.c), r2: Math.min(q.g[2], hi.r), c2: Math.min(q.g[3], hi.c) };
    if (y.r1 <= y.r2 && y.c1 <= y.c2) {
      const e = part(L, 'peer' + p.id, 'sh-peer');
      place(e, colX(y.c1) - 1, rowY(y.r1) - 1, colX(y.c2 + 1) - colX(y.c1) + 1, rowY(y.r2 + 1) - rowY(y.r1) + 1);
      e.style.setProperty('--pc', p.color);
    }
    if (q.r < lo.r || q.r > hi.r || q.c < lo.c || q.c > hi.c) continue;
    const t = part(L, 'ptag' + p.id, 'sh-ptag'), label = (q.ed ? '✎ ' : '') + p.name;
    if (t.textContent !== label) t.textContent = label;
    t.style.setProperty('--pc', p.color);
    t.dir = 'auto';
    place(t, colX(q.c), Math.max(0, rowY(q.r) - 16), 0, 16);
  }
}


/* =========================================================
   formatted tables, as Excel's (Insert → Table, Home → Format as Table): a range with a name, its columns named in its
   header row, a look from Excel's 60 table styles, banded rows, a total row and filter buttons. A sheet's tables are
   s.tables: { id, name, g (with the header and total rows), hr (the header row shows), tr (a total row), style, sr sc
   (banded rows and columns), fc lc (the first and last column stand out), fb (filter buttons), cols: [{ n: its name,
   fn: what the total row works out (sum, average, count...), lbl: the total row's words, cf: the formula that fills
   the column }] }. A name is the workbook's, like a defined name's
   ========================================================= */
/* Excel's built-in table styles, read from Excel itself (tstyle_dump.ps1 in the development): for each part of a table
   (w the whole table, h the header row, t the total row, f and l the first and last columns, r1 r2 the row stripes, c1
   c2 the column stripes, fh lh ft lt the corner cells) its fill, text color and bold, and its borders: bt bb bs be its
   outer sides (bs toward column A), bv bh the lines inside it; n a stripe's size */
const TSTYLES = {Light1:{w:{c:"#000000",bt:"1s#000000",bb:"1s#000000"},h:{c:"#000000",b:1,bb:"1s#000000"},t:{c:"#000000",b:1,bt:"1s#000000"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#d9d9d9"},c1:{bg:"#d9d9d9"}},Light2:{w:{c:"#305496",bt:"1s#4472c4",bb:"1s#4472c4"},h:{c:"#305496",b:1,bb:"1s#4472c4"},t:{c:"#305496",b:1,bt:"1s#4472c4"},f:{c:"#305496",b:1},l:{c:"#305496",b:1},r1:{bg:"#d9e1f2"},c1:{bg:"#d9e1f2"}},Light3:{w:{c:"#c65911",bt:"1s#ed7d31",bb:"1s#ed7d31"},h:{c:"#c65911",b:1,bb:"1s#ed7d31"},t:{c:"#c65911",b:1,bt:"1s#ed7d31"},f:{c:"#c65911",b:1},l:{c:"#c65911",b:1},r1:{bg:"#fce4d6"},c1:{bg:"#fce4d6"}},Light4:{w:{c:"#7b7b7b",bt:"1s#a5a5a5",bb:"1s#a5a5a5"},h:{c:"#7b7b7b",b:1,bb:"1s#a5a5a5"},t:{c:"#7b7b7b",b:1,bt:"1s#a5a5a5"},f:{c:"#7b7b7b",b:1},l:{c:"#7b7b7b",b:1},r1:{bg:"#ededed"},c1:{bg:"#ededed"}},Light5:{w:{c:"#bf8f00",bt:"1s#ffc000",bb:"1s#ffc000"},h:{c:"#bf8f00",b:1,bb:"1s#ffc000"},t:{c:"#bf8f00",b:1,bt:"1s#ffc000"},f:{c:"#bf8f00",b:1},l:{c:"#bf8f00",b:1},r1:{bg:"#fff2cc"},c1:{bg:"#fff2cc"}},Light6:{w:{c:"#2f75b5",bt:"1s#5b9bd5",bb:"1s#5b9bd5"},h:{c:"#2f75b5",b:1,bb:"1s#5b9bd5"},t:{c:"#2f75b5",b:1,bt:"1s#5b9bd5"},f:{c:"#2f75b5",b:1},l:{c:"#2f75b5",b:1},r1:{bg:"#ddebf7"},c1:{bg:"#ddebf7"}},Light7:{w:{c:"#548235",bt:"1s#70ad47",bb:"1s#70ad47"},h:{c:"#548235",b:1,bb:"1s#70ad47"},t:{c:"#548235",b:1,bt:"1s#70ad47"},f:{c:"#548235",b:1},l:{c:"#548235",b:1},r1:{bg:"#e2efda"},c1:{bg:"#e2efda"}},Light8:{w:{c:"#000000",bt:"1s#000000",bb:"1s#000000",bs:"1s#000000",be:"1s#000000"},h:{bg:"#000000",c:"#ffffff",b:1},t:{c:"#000000",b:1,bt:"1=#000000"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bt:"1s#000000"},r2:{bt:"1s#000000"},c1:{bs:"1s#000000"},c2:{bs:"1s#000000"}},Light9:{w:{c:"#000000",bt:"1s#4472c4",bb:"1s#4472c4",bs:"1s#4472c4",be:"1s#4472c4"},h:{bg:"#4472c4",c:"#ffffff",b:1},t:{c:"#000000",b:1,bt:"1=#4472c4"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bt:"1s#4472c4"},r2:{bt:"1s#4472c4"},c1:{bs:"1s#4472c4"},c2:{bs:"1s#4472c4"}},Light10:{w:{c:"#000000",bt:"1s#ed7d31",bb:"1s#ed7d31",bs:"1s#ed7d31",be:"1s#ed7d31"},h:{bg:"#ed7d31",c:"#ffffff",b:1},t:{c:"#000000",b:1,bt:"1=#ed7d31"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bt:"1s#ed7d31"},r2:{bt:"1s#ed7d31"},c1:{bs:"1s#ed7d31"},c2:{bs:"1s#ed7d31"}},Light11:{w:{c:"#000000",bt:"1s#a5a5a5",bb:"1s#a5a5a5",bs:"1s#a5a5a5",be:"1s#a5a5a5"},h:{bg:"#a5a5a5",c:"#ffffff",b:1},t:{c:"#000000",b:1,bt:"1=#a5a5a5"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bt:"1s#a5a5a5"},r2:{bt:"1s#a5a5a5"},c1:{bs:"1s#a5a5a5"},c2:{bs:"1s#a5a5a5"}},Light12:{w:{c:"#000000",bt:"1s#ffc000",bb:"1s#ffc000",bs:"1s#ffc000",be:"1s#ffc000"},h:{bg:"#ffc000",c:"#ffffff",b:1},t:{c:"#000000",b:1,bt:"1=#ffc000"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bt:"1s#ffc000"},r2:{bt:"1s#ffc000"},c1:{bs:"1s#ffc000"},c2:{bs:"1s#ffc000"}},Light13:{w:{c:"#000000",bt:"1s#5b9bd5",bb:"1s#5b9bd5",bs:"1s#5b9bd5",be:"1s#5b9bd5"},h:{bg:"#5b9bd5",c:"#ffffff",b:1},t:{c:"#000000",b:1,bt:"1=#5b9bd5"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bt:"1s#5b9bd5"},r2:{bt:"1s#5b9bd5"},c1:{bs:"1s#5b9bd5"},c2:{bs:"1s#5b9bd5"}},Light14:{w:{c:"#000000",bt:"1s#70ad47",bb:"1s#70ad47",bs:"1s#70ad47",be:"1s#70ad47"},h:{bg:"#70ad47",c:"#ffffff",b:1},t:{c:"#000000",b:1,bt:"1=#70ad47"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bt:"1s#70ad47"},r2:{bt:"1s#70ad47"},c1:{bs:"1s#70ad47"},c2:{bs:"1s#70ad47"}},Light15:{w:{c:"#000000",bt:"1s#000000",bb:"1s#000000",bs:"1s#000000",be:"1s#000000",bv:"1s#000000",bh:"1s#000000"},h:{c:"#000000",b:1,bb:"2s#000000"},t:{c:"#000000",b:1,bt:"1=#000000"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#d9d9d9"},c1:{bg:"#d9d9d9"}},Light16:{w:{c:"#000000",bt:"1s#4472c4",bb:"1s#4472c4",bs:"1s#4472c4",be:"1s#4472c4",bv:"1s#4472c4",bh:"1s#4472c4"},h:{c:"#000000",b:1,bb:"2s#4472c4"},t:{c:"#000000",b:1,bt:"1=#4472c4"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#d9e1f2"},c1:{bg:"#d9e1f2"}},Light17:{w:{c:"#000000",bt:"1s#ed7d31",bb:"1s#ed7d31",bs:"1s#ed7d31",be:"1s#ed7d31",bv:"1s#ed7d31",bh:"1s#ed7d31"},h:{c:"#000000",b:1,bb:"2s#ed7d31"},t:{c:"#000000",b:1,bt:"1=#ed7d31"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#fce4d6"},c1:{bg:"#fce4d6"}},Light18:{w:{c:"#000000",bt:"1s#a5a5a5",bb:"1s#a5a5a5",bs:"1s#a5a5a5",be:"1s#a5a5a5",bv:"1s#a5a5a5",bh:"1s#a5a5a5"},h:{c:"#000000",b:1,bb:"2s#a5a5a5"},t:{c:"#000000",b:1,bt:"1=#a5a5a5"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#ededed"},c1:{bg:"#ededed"}},Light19:{w:{c:"#000000",bt:"1s#ffc000",bb:"1s#ffc000",bs:"1s#ffc000",be:"1s#ffc000",bv:"1s#ffc000",bh:"1s#ffc000"},h:{c:"#000000",b:1,bb:"2s#ffc000"},t:{c:"#000000",b:1,bt:"1=#ffc000"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#fff2cc"},c1:{bg:"#fff2cc"}},Light20:{w:{c:"#000000",bt:"1s#5b9bd5",bb:"1s#5b9bd5",bs:"1s#5b9bd5",be:"1s#5b9bd5",bv:"1s#5b9bd5",bh:"1s#5b9bd5"},h:{c:"#000000",b:1,bb:"2s#5b9bd5"},t:{c:"#000000",b:1,bt:"1=#5b9bd5"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#ddebf7"},c1:{bg:"#ddebf7"}},Light21:{w:{c:"#000000",bt:"1s#70ad47",bb:"1s#70ad47",bs:"1s#70ad47",be:"1s#70ad47",bv:"1s#70ad47",bh:"1s#70ad47"},h:{c:"#000000",b:1,bb:"2s#70ad47"},t:{c:"#000000",b:1,bt:"1=#70ad47"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#e2efda"},c1:{bg:"#e2efda"}},Medium1:{w:{c:"#000000",bt:"1s#000000",bb:"1s#000000",bs:"1s#000000",be:"1s#000000",bh:"1s#000000"},h:{bg:"#000000",c:"#ffffff",b:1},t:{c:"#000000",b:1,bt:"1=#000000"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#d9d9d9"},c1:{bg:"#d9d9d9"}},Medium2:{w:{c:"#000000",bt:"1s#8ea9db",bb:"1s#8ea9db",bs:"1s#8ea9db",be:"1s#8ea9db",bh:"1s#8ea9db"},h:{bg:"#4472c4",c:"#ffffff",b:1},t:{c:"#000000",b:1,bt:"1=#4472c4"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#d9e1f2"},c1:{bg:"#d9e1f2"}},Medium3:{w:{c:"#000000",bt:"1s#f4b084",bb:"1s#f4b084",bs:"1s#f4b084",be:"1s#f4b084",bh:"1s#f4b084"},h:{bg:"#ed7d31",c:"#ffffff",b:1},t:{c:"#000000",b:1,bt:"1=#ed7d31"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#fce4d6"},c1:{bg:"#fce4d6"}},Medium4:{w:{c:"#000000",bt:"1s#c9c9c9",bb:"1s#c9c9c9",bs:"1s#c9c9c9",be:"1s#c9c9c9",bh:"1s#c9c9c9"},h:{bg:"#a5a5a5",c:"#ffffff",b:1},t:{c:"#000000",b:1,bt:"1=#a5a5a5"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#ededed"},c1:{bg:"#ededed"}},Medium5:{w:{c:"#000000",bt:"1s#ffd966",bb:"1s#ffd966",bs:"1s#ffd966",be:"1s#ffd966",bh:"1s#ffd966"},h:{bg:"#ffc000",c:"#ffffff",b:1},t:{c:"#000000",b:1,bt:"1=#ffc000"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#fff2cc"},c1:{bg:"#fff2cc"}},Medium6:{w:{c:"#000000",bt:"1s#9bc2e6",bb:"1s#9bc2e6",bs:"1s#9bc2e6",be:"1s#9bc2e6",bh:"1s#9bc2e6"},h:{bg:"#5b9bd5",c:"#ffffff",b:1},t:{c:"#000000",b:1,bt:"1=#5b9bd5"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#ddebf7"},c1:{bg:"#ddebf7"}},Medium7:{w:{c:"#000000",bt:"1s#a9d08e",bb:"1s#a9d08e",bs:"1s#a9d08e",be:"1s#a9d08e",bh:"1s#a9d08e"},h:{bg:"#70ad47",c:"#ffffff",b:1},t:{c:"#000000",b:1,bt:"1=#70ad47"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#e2efda"},c1:{bg:"#e2efda"}},Medium8:{w:{bg:"#d9d9d9",c:"#000000",bv:"1s#ffffff",bh:"1s#ffffff"},h:{bg:"#000000",c:"#ffffff",b:1,bb:"3s#ffffff"},t:{bg:"#000000",c:"#ffffff",b:1,bt:"3s#ffffff"},f:{bg:"#000000",c:"#ffffff",b:1},l:{bg:"#000000",c:"#ffffff",b:1},r1:{bg:"#a6a6a6"},c1:{bg:"#a6a6a6"}},Medium9:{w:{bg:"#d9e1f2",c:"#000000",bv:"1s#ffffff",bh:"1s#ffffff"},h:{bg:"#4472c4",c:"#ffffff",b:1,bb:"3s#ffffff"},t:{bg:"#4472c4",c:"#ffffff",b:1,bt:"3s#ffffff"},f:{bg:"#4472c4",c:"#ffffff",b:1},l:{bg:"#4472c4",c:"#ffffff",b:1},r1:{bg:"#b4c6e7"},c1:{bg:"#b4c6e7"}},Medium10:{w:{bg:"#fce4d6",c:"#000000",bv:"1s#ffffff",bh:"1s#ffffff"},h:{bg:"#ed7d31",c:"#ffffff",b:1,bb:"3s#ffffff"},t:{bg:"#ed7d31",c:"#ffffff",b:1,bt:"3s#ffffff"},f:{bg:"#ed7d31",c:"#ffffff",b:1},l:{bg:"#ed7d31",c:"#ffffff",b:1},r1:{bg:"#f8cbad"},c1:{bg:"#f8cbad"}},Medium11:{w:{bg:"#ededed",c:"#000000",bv:"1s#ffffff",bh:"1s#ffffff"},h:{bg:"#a5a5a5",c:"#ffffff",b:1,bb:"3s#ffffff"},t:{bg:"#a5a5a5",c:"#ffffff",b:1,bt:"3s#ffffff"},f:{bg:"#a5a5a5",c:"#ffffff",b:1},l:{bg:"#a5a5a5",c:"#ffffff",b:1},r1:{bg:"#dbdbdb"},c1:{bg:"#dbdbdb"}},Medium12:{w:{bg:"#fff2cc",c:"#000000",bv:"1s#ffffff",bh:"1s#ffffff"},h:{bg:"#ffc000",c:"#ffffff",b:1,bb:"3s#ffffff"},t:{bg:"#ffc000",c:"#ffffff",b:1,bt:"3s#ffffff"},f:{bg:"#ffc000",c:"#ffffff",b:1},l:{bg:"#ffc000",c:"#ffffff",b:1},r1:{bg:"#ffe699"},c1:{bg:"#ffe699"}},Medium13:{w:{bg:"#ddebf7",c:"#000000",bv:"1s#ffffff",bh:"1s#ffffff"},h:{bg:"#5b9bd5",c:"#ffffff",b:1,bb:"3s#ffffff"},t:{bg:"#5b9bd5",c:"#ffffff",b:1,bt:"3s#ffffff"},f:{bg:"#5b9bd5",c:"#ffffff",b:1},l:{bg:"#5b9bd5",c:"#ffffff",b:1},r1:{bg:"#bdd7ee"},c1:{bg:"#bdd7ee"}},Medium14:{w:{bg:"#e2efda",c:"#000000",bv:"1s#ffffff",bh:"1s#ffffff"},h:{bg:"#70ad47",c:"#ffffff",b:1,bb:"3s#ffffff"},t:{bg:"#70ad47",c:"#ffffff",b:1,bt:"3s#ffffff"},f:{bg:"#70ad47",c:"#ffffff",b:1},l:{bg:"#70ad47",c:"#ffffff",b:1},r1:{bg:"#c6e0b4"},c1:{bg:"#c6e0b4"}},Medium15:{w:{c:"#000000",bt:"2s#000000",bb:"2s#000000",bs:"1s#000000",be:"1s#000000",bv:"1s#000000",bh:"1s#000000"},h:{bg:"#000000",c:"#ffffff",b:1,bb:"2s#000000"},t:{bt:"1=#000000"},f:{bg:"#000000",c:"#ffffff",b:1},l:{bg:"#000000",c:"#ffffff",b:1},r1:{bg:"#d9d9d9"},c1:{bg:"#d9d9d9"}},Medium16:{w:{c:"#000000",bt:"2s#000000",bb:"2s#000000"},h:{bg:"#4472c4",c:"#ffffff",b:1,bb:"2s#000000"},t:{bt:"1=#000000"},f:{bg:"#4472c4",c:"#ffffff",b:1},l:{bg:"#4472c4",c:"#ffffff",b:1},r1:{bg:"#d9d9d9"},c1:{bg:"#d9d9d9"}},Medium17:{w:{c:"#000000",bt:"2s#000000",bb:"2s#000000"},h:{bg:"#ed7d31",c:"#ffffff",b:1,bb:"2s#000000"},t:{bt:"1=#000000"},f:{bg:"#ed7d31",c:"#ffffff",b:1},l:{bg:"#ed7d31",c:"#ffffff",b:1},r1:{bg:"#d9d9d9"},c1:{bg:"#d9d9d9"}},Medium18:{w:{c:"#000000",bt:"2s#000000",bb:"2s#000000"},h:{bg:"#a5a5a5",c:"#ffffff",b:1,bb:"2s#000000"},t:{bt:"1=#000000"},f:{bg:"#a5a5a5",c:"#ffffff",b:1},l:{bg:"#a5a5a5",c:"#ffffff",b:1},r1:{bg:"#d9d9d9"},c1:{bg:"#d9d9d9"}},Medium19:{w:{c:"#000000",bt:"2s#000000",bb:"2s#000000"},h:{bg:"#ffc000",c:"#ffffff",b:1,bb:"2s#000000"},t:{bt:"1=#000000"},f:{bg:"#ffc000",c:"#ffffff",b:1},l:{bg:"#ffc000",c:"#ffffff",b:1},r1:{bg:"#d9d9d9"},c1:{bg:"#d9d9d9"}},Medium20:{w:{c:"#000000",bt:"2s#000000",bb:"2s#000000"},h:{bg:"#5b9bd5",c:"#ffffff",b:1,bb:"2s#000000"},t:{bt:"1=#000000"},f:{bg:"#5b9bd5",c:"#ffffff",b:1},l:{bg:"#5b9bd5",c:"#ffffff",b:1},r1:{bg:"#d9d9d9"},c1:{bg:"#d9d9d9"}},Medium21:{w:{c:"#000000",bt:"2s#000000",bb:"2s#000000"},h:{bg:"#70ad47",c:"#ffffff",b:1,bb:"2s#000000"},t:{bt:"1=#000000"},f:{bg:"#70ad47",c:"#ffffff",b:1},l:{bg:"#70ad47",c:"#ffffff",b:1},r1:{bg:"#d9d9d9"},c1:{bg:"#d9d9d9"}},Medium22:{w:{bg:"#d9d9d9",c:"#000000",bt:"1s#000000",bb:"1s#000000",bs:"1s#000000",be:"1s#000000",bv:"1s#000000",bh:"1s#000000"},h:{c:"#000000",b:1},t:{c:"#000000",b:1,bt:"2s#000000"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#a6a6a6"},c1:{bg:"#a6a6a6"}},Medium23:{w:{bg:"#d9e1f2",c:"#000000",bt:"1s#8ea9db",bb:"1s#8ea9db",bs:"1s#8ea9db",be:"1s#8ea9db",bv:"1s#8ea9db",bh:"1s#8ea9db"},h:{c:"#000000",b:1},t:{c:"#000000",b:1,bt:"2s#4472c4"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#b4c6e7"},c1:{bg:"#b4c6e7"}},Medium24:{w:{bg:"#fce4d6",c:"#000000",bt:"1s#f4b084",bb:"1s#f4b084",bs:"1s#f4b084",be:"1s#f4b084",bv:"1s#f4b084",bh:"1s#f4b084"},h:{c:"#000000",b:1},t:{c:"#000000",b:1,bt:"2s#ed7d31"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#f8cbad"},c1:{bg:"#f8cbad"}},Medium25:{w:{bg:"#ededed",c:"#000000",bt:"1s#c9c9c9",bb:"1s#c9c9c9",bs:"1s#c9c9c9",be:"1s#c9c9c9",bv:"1s#c9c9c9",bh:"1s#c9c9c9"},h:{c:"#000000",b:1},t:{c:"#000000",b:1,bt:"2s#a5a5a5"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#dbdbdb"},c1:{bg:"#dbdbdb"}},Medium26:{w:{bg:"#fff2cc",c:"#000000",bt:"1s#ffd966",bb:"1s#ffd966",bs:"1s#ffd966",be:"1s#ffd966",bv:"1s#ffd966",bh:"1s#ffd966"},h:{c:"#000000",b:1},t:{c:"#000000",b:1,bt:"2s#ffc000"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#ffe699"},c1:{bg:"#ffe699"}},Medium27:{w:{bg:"#ddebf7",c:"#000000",bt:"1s#9bc2e6",bb:"1s#9bc2e6",bs:"1s#9bc2e6",be:"1s#9bc2e6",bv:"1s#9bc2e6",bh:"1s#9bc2e6"},h:{c:"#000000",b:1},t:{c:"#000000",b:1,bt:"2s#5b9bd5"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#bdd7ee"},c1:{bg:"#bdd7ee"}},Medium28:{w:{bg:"#e2efda",c:"#000000",bt:"1s#a9d08e",bb:"1s#a9d08e",bs:"1s#a9d08e",be:"1s#a9d08e",bv:"1s#a9d08e",bh:"1s#a9d08e"},h:{c:"#000000",b:1},t:{c:"#000000",b:1,bt:"2s#70ad47"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#c6e0b4"},c1:{bg:"#c6e0b4"}},Dark1:{w:{bg:"#737373",c:"#ffffff"},h:{bg:"#000000",c:"#ffffff",b:1,bb:"2s#ffffff"},t:{bg:"#262626",c:"#ffffff",b:1,bt:"2s#ffffff"},f:{bg:"#404040",c:"#ffffff",b:1,be:"2s#ffffff"},l:{bg:"#404040",c:"#ffffff",b:1,bs:"2s#ffffff"},r1:{bg:"#404040"},c1:{bg:"#404040"}},Dark2:{w:{bg:"#4472c4",c:"#ffffff"},h:{bg:"#000000",c:"#ffffff",b:1,bb:"2s#ffffff"},t:{bg:"#203764",c:"#ffffff",b:1,bt:"2s#ffffff"},f:{bg:"#305496",c:"#ffffff",b:1,be:"2s#ffffff"},l:{bg:"#305496",c:"#ffffff",b:1,bs:"2s#ffffff"},r1:{bg:"#305496"},c1:{bg:"#305496"}},Dark3:{w:{bg:"#ed7d31",c:"#ffffff"},h:{bg:"#000000",c:"#ffffff",b:1,bb:"2s#ffffff"},t:{bg:"#833c0c",c:"#ffffff",b:1,bt:"2s#ffffff"},f:{bg:"#c65911",c:"#ffffff",b:1,be:"2s#ffffff"},l:{bg:"#c65911",c:"#ffffff",b:1,bs:"2s#ffffff"},r1:{bg:"#c65911"},c1:{bg:"#c65911"}},Dark4:{w:{bg:"#a5a5a5",c:"#ffffff"},h:{bg:"#000000",c:"#ffffff",b:1,bb:"2s#ffffff"},t:{bg:"#525252",c:"#ffffff",b:1,bt:"2s#ffffff"},f:{bg:"#7b7b7b",c:"#ffffff",b:1,be:"2s#ffffff"},l:{bg:"#7b7b7b",c:"#ffffff",b:1,bs:"2s#ffffff"},r1:{bg:"#7b7b7b"},c1:{bg:"#7b7b7b"}},Dark5:{w:{bg:"#ffc000",c:"#ffffff"},h:{bg:"#000000",c:"#ffffff",b:1,bb:"2s#ffffff"},t:{bg:"#806000",c:"#ffffff",b:1,bt:"2s#ffffff"},f:{bg:"#bf8f00",c:"#ffffff",b:1,be:"2s#ffffff"},l:{bg:"#bf8f00",c:"#ffffff",b:1,bs:"2s#ffffff"},r1:{bg:"#bf8f00"},c1:{bg:"#bf8f00"}},Dark6:{w:{bg:"#5b9bd5",c:"#ffffff"},h:{bg:"#000000",c:"#ffffff",b:1,bb:"2s#ffffff"},t:{bg:"#1f4e78",c:"#ffffff",b:1,bt:"2s#ffffff"},f:{bg:"#2f75b5",c:"#ffffff",b:1,be:"2s#ffffff"},l:{bg:"#2f75b5",c:"#ffffff",b:1,bs:"2s#ffffff"},r1:{bg:"#2f75b5"},c1:{bg:"#2f75b5"}},Dark7:{w:{bg:"#70ad47",c:"#ffffff"},h:{bg:"#000000",c:"#ffffff",b:1,bb:"2s#ffffff"},t:{bg:"#375623",c:"#ffffff",b:1,bt:"2s#ffffff"},f:{bg:"#548235",c:"#ffffff",b:1,be:"2s#ffffff"},l:{bg:"#548235",c:"#ffffff",b:1,bs:"2s#ffffff"},r1:{bg:"#548235"},c1:{bg:"#548235"}},Dark8:{w:{bg:"#d9d9d9"},h:{bg:"#000000",c:"#ffffff"},t:{c:"#000000",b:1,bt:"1=#000000"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#a6a6a6"},c1:{bg:"#a6a6a6"}},Dark9:{w:{bg:"#d9e1f2"},h:{bg:"#ed7d31",c:"#ffffff"},t:{c:"#000000",b:1,bt:"1=#000000"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#b4c6e7"},c1:{bg:"#b4c6e7"}},Dark10:{w:{bg:"#ededed"},h:{bg:"#ffc000",c:"#ffffff"},t:{c:"#000000",b:1,bt:"1=#000000"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#dbdbdb"},c1:{bg:"#dbdbdb"}},Dark11:{w:{bg:"#ddebf7"},h:{bg:"#70ad47",c:"#ffffff"},t:{c:"#000000",b:1,bt:"1=#000000"},f:{c:"#000000",b:1},l:{c:"#000000",b:1},r1:{bg:"#bdd7ee"},c1:{bg:"#bdd7ee"}}};
const TS_DEF = 'TableStyleMedium2';
const tsOf = name => TSTYLES[String(name || '').replace(/^TableStyle/, '')] ? name : TS_DEF;
const TOT_FN = { sum: 109, average: 101, count: 103, countNums: 102, max: 104, min: 105, stdDev: 107, var: 110 };
function normTable(x) {
  if (!x || typeof x !== 'object') return null;
  const g = x.g && typeof x.g === 'object' ? { r1: x.g.r1, c1: x.g.c1, r2: x.g.r2, c2: x.g.c2 } : parseRange(String(x.ref || ''));
  if (!g || ![g.r1, g.c1, g.r2, g.c2].every(Number.isInteger) || g.r1 < 0 || g.c1 < 0 || g.r2 >= MAXR || g.c2 >= MAXC || g.r2 < g.r1 || g.c2 < g.c1) return null;
  const hr = x.hr === 0 || x.hr === false ? 0 : 1, tr = x.tr ? 1 : 0;
  if (g.r2 - g.r1 + 1 < hr + tr + 1) return null;   // a data row at least, as Excel keeps
  const name = typeof x.name === 'string' ? x.name.trim() : '';
  if (!name || name.length > 255 || nameProblem(name)) return null;
  const cols = [];
  for (let i = 0; i <= g.c2 - g.c1; i++) {
    const y = Array.isArray(x.cols) && x.cols[i] && typeof x.cols[i] === 'object' ? x.cols[i] : {}, c = { n: typeof y.n === 'string' ? y.n.replace(/[\r\n]+/g, ' ').trim().slice(0, 255) : '' };
    if (TOT_FN[y.fn] || y.fn === 'custom') c.fn = y.fn;
    if (typeof y.lbl === 'string' && y.lbl) c.lbl = y.lbl.slice(0, 255);
    if (typeof y.cf === 'string' && y.cf.trim()) c.cf = y.cf.trim().replace(/^=/, '').slice(0, 8000);
    cols.push(c);
  }
  return { id: typeof x.id === 'string' && /^[a-z0-9]{4,24}$/.test(x.id) ? x.id : sid(), name, g, hr, tr, style: tsOf(x.style), sr: x.sr !== false, sc: x.sc === true, fc: x.fc === true, lc: x.lc === true, fb: x.fb !== false, cols: uniqueCols(cols) };
}
function tableOut(t) {
  const o = { id: t.id, name: t.name, ref: rangeA1(t.g) };
  if (!t.hr) o.hr = 0;
  if (t.tr) o.tr = 1;
  if (t.style !== TS_DEF) o.style = t.style;
  if (!t.sr) o.sr = false;
  for (const k of ['sc', 'fc', 'lc']) if (t[k]) o[k] = true;
  if (!t.fb) o.fb = false;
  o.cols = t.cols.map(c => ({ ...c }));
  return o;
}
/* the header row is where the names are: a header cell with something in it names its column, and an empty one says
   its column's name (a table described without its columns' names, or one whose cells came apart from it) */
function headsOf(s, t) {
  if (!t.hr) return t;
  const cols = t.cols.map((c, i) => { const x = s.cells.get(KEY(t.g.r1, t.g.c1 + i)), v = x && x.v; return { ...c, n: v != null && v !== '' && !isErr(v) ? String(typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v).replace(/[\r\n]+/g, ' ').trim().slice(0, 255) : c.n }; });
  uniqueCols(cols);
  cols.forEach((c, i) => { const k = KEY(t.g.r1, t.g.c1 + i), x = s.cells.get(k); if (!x || x.v !== c.n || x.f != null) { const o = { ...(x || {}), v: c.n }; delete o.f; delete o.x; delete o.l; s.cells.set(k, o); } });
  return { ...t, cols };
}
/* a column without a name is עמודה and its place, and a name taken already gets a number after it, as in Excel */
function uniqueCols(cols) {
  const seen = new Set();
  cols.forEach((c, i) => {
    let n = c.n || T('עמודה{0}', i + 1);
    if (seen.has(n.toLowerCase())) { let k = 2; while (seen.has((n + k).toLowerCase())) k++; n += k; }
    seen.add(n.toLowerCase());
    c.n = n;
  });
  return cols;
}
const tableNames = () => { const t = new Set((WB.names || NO_NAMES).map(x => x.n.toLowerCase())); for (const sh of WB.sheets) for (const x of sh.tables) t.add(x.name.toLowerCase()); return t; };
function freeTableName(base, taken) {
  const b = String(base || '').replace(/\d+$/, '') || T('טבלה{0}', '');
  for (let k = 1; ; k++) { const n = b + k; if (!taken.has(n.toLowerCase())) return n; }
}
const tableAt = (s, r, c) => s.tables.find(t => inG(t.g, r, c)) || null;
const tableByName = n => { const low = String(n).toLowerCase(); for (const sh of WB.sheets) for (const t of sh.tables) if (t.name.toLowerCase() === low) return { s: sh, t }; return null; };
const dataRows = t => ({ r1: t.g.r1 + t.hr, r2: t.g.r2 - t.tr });
/* a cell's look from its table's style, under its own look (what the cell has itself wins, as in Excel). Worked out once
   for each change of the workbook */
function underTable(s, r, c, st) {
  if (!s.tables.length) return st;
  if (s._tlv !== CHV || s._tlr !== s.tables) { s._tlc = new Map(); s._tlv = CHV; s._tlr = s.tables; }
  const k = KEY(r, c);
  let tl = s._tlc.get(k);
  if (tl === undefined) { const t = tableAt(s, r, c); tl = t ? tableLook(t, r, c) : null; if (s._tlc.size > 50000) s._tlc.clear(); s._tlc.set(k, tl); }
  return tl ? (st ? { ...tl, ...st } : tl) : st;
}
/* the parts of the style over cell (r, c), in Excel's order: the whole table, the column stripes, the row stripes, the
   last and the first column, the header and total rows, then their corner cells. A part's border is on the outer side
   of the cells it covers, or between them inside it */
function tableLook(t, r, c) {
  const S = TSTYLES[t.style.replace(/^TableStyle/, '')] || TSTYLES.Medium2, g = t.g, d = dataRows(t), out = {};
  const put = (E, R) => {
    if (!E || !inG(R, r, c)) return;
    if (E.bg) out.bg = E.bg;
    if (E.c) out.c = E.c;
    if (E.b) out.b = true;
    const side = (k, edge, inner) => { const v = E[edge ? k : inner]; if (v) out[k] = v; };
    side('bt', r === R.r1, 'bh'); side('bb', r === R.r2, 'bh'); side('bs', c === R.c1, 'bv'); side('be', c === R.c2, 'bv');
  };
  const band = (i, a, b) => { const n = (a && a.n) || 1, m = (b && b.n) || 1, k = i % (n + m); return k < n ? [a, i - k, n] : [b, i - k + n, m]; };
  put(S.w, g);
  if (r >= d.r1 && r <= d.r2) {
    if (t.sc) { const [E, i0, w] = band(c - g.c1, S.c1, S.c2); put(E, { r1: d.r1, r2: d.r2, c1: g.c1 + i0, c2: Math.min(g.c2, g.c1 + i0 + w - 1) }); }
    if (t.sr) { const [E, i0, w] = band(r - d.r1, S.r1, S.r2); put(E, { r1: d.r1 + i0, r2: Math.min(d.r2, d.r1 + i0 + w - 1), c1: g.c1, c2: g.c2 }); }
  }
  if (t.lc) put(S.l, { ...g, c1: g.c2 });
  if (t.fc) put(S.f, { ...g, c2: g.c1 });
  if (t.hr) put(S.h, { ...g, r2: g.r1 });
  if (t.tr) put(S.t, { ...g, r1: g.r2 });
  const one = (rr, cc) => ({ r1: rr, r2: rr, c1: cc, c2: cc });
  if (t.hr && t.fc) put(S.fh, one(g.r1, g.c1));
  if (t.hr && t.lc) put(S.lh, one(g.r1, g.c2));
  if (t.tr && t.fc) put(S.ft, one(g.r2, g.c1));
  if (t.tr && t.lc) put(S.lt, one(g.r2, g.c2));
  return Object.keys(out).length ? out : null;
}
/* what a header cell says as a column's name: its text as it shows */
const headText = x => { if (!x) return ''; const v = view(x).t; return String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 255); };
/* header cells written in this step: their columns take the new names (an empty one gets עמודה and its place), and the
   cell says the name as text, as Excel does */
function headersWritten(tx) {
  for (const { s, k } of [...tx.cells.values()]) {
    if (!s.tables || !s.tables.length) continue;
    const r = kr(k), c = kc(k), t = s.tables.find(y => y.hr && r === y.g.r1 && c >= y.g.c1 && c <= y.g.c2);
    if (!t) continue;
    const i = c - t.g.c1, x = s.cells.get(k), want = headText(x);
    const others = t.cols.filter((y, j) => j !== i).map(y => y.n.toLowerCase());
    let n = want || T('עמודה{0}', i + 1);
    if (others.includes(n.toLowerCase())) { let m = 2; while (others.includes((n + m).toLowerCase())) m++; n += m; }
    if (n !== t.cols[i].n) { setProp(s, 'tables', s.tables.map(y => y === t ? { ...t, cols: t.cols.map((q, j) => j === i ? { ...q, n } : q) } : y)); renameColRefs(t, t.cols[i].n, n); }
    if (!x || x.f != null || x.v !== n) { const o = { ...(x || {}), v: n }; delete o.f; delete o.x; delete o.l; setCell(s, r, c, o); }
  }
}
/* rows or columns in or out: the table grows, shrinks or moves with them. A column put in gets a name (and its header
   cell says it); a column taken out takes its name; the header or total row taken out leaves the table without it */
function spliceTables(s, axis, at, n) {
  const R = axis === 'r', out = [];
  for (const t of s.tables) {
    const g = shiftRange(t.g, axis, at, n);
    if (!g) continue;
    const x = { ...t, g, cols: t.cols.map(c => ({ ...c })) };
    if (R && n < 0) {
      if (t.hr && t.g.r1 >= at && t.g.r1 < at - n) x.hr = 0;
      if (t.tr && t.g.r2 >= at && t.g.r2 < at - n) x.tr = 0;
    }
    if (!R) {
      if (n > 0 && at > t.g.c1 && at <= t.g.c2) x.cols.splice(at - t.g.c1, 0, ...Array.from({ length: n }, () => ({ n: '' })));
      if (n < 0) { const a = Math.max(at, t.g.c1), b = Math.min(at - n - 1, t.g.c2); if (b >= a) { trefsToCells(t, null, t.cols.slice(a - t.g.c1, b - t.g.c1 + 1).map(y => y.n.toLowerCase())); x.cols.splice(a - t.g.c1, b - a + 1); } }
      uniqueCols(x.cols);
    }
    const y = normTable(x);
    if (!y) continue;
    out.push(y);
    if (!R && n > 0 && y.hr) y.cols.forEach((c, i) => { const cc = y.g.c1 + i, cell = cellAt(s, y.g.r1, cc); if (!cell || cell.v !== c.n) setCell(s, y.g.r1, cc, { ...(cell || {}), v: c.n }); });
  }
  setProp(s, 'tables', out);
}
/* Excel's guess for a new table's header row: the first row is all text, and the next row has something that isn't */
function guessHeaders(s, g) {
  const txt = (r, c) => { const v = valAt(s, r, c); return typeof v === 'string' && v !== ''; };
  for (let c = g.c1; c <= g.c2; c++) if (!txt(g.r1, c)) return false;
  if (g.r2 === g.r1) return true;
  for (let c = g.c1; c <= g.c2; c++) if (!txt(g.r1 + 1, c)) return true;
  return false;
}
/* a new table over g: without a header row, a row is put in above it for one, as Excel does (Excel moves only the
   table's own columns down); the names come from the header cells */
function createTable(g, hdr, style) {
  const s = WS;
  if (g.r2 - g.r1 > 1e6 || g.c2 - g.c1 >= 16384) return false;
  if (s.tables.some(t => meets(t.g, g))) { toast(T('טבלה לא יכולה לחפוף לטבלה אחרת'), { icon: 'error' }); return false; }
  if (s.merges.some(m => meets(m, g))) { toast(T('אי אפשר ליצור טבלה באזור שיש בו תאים ממוזגים'), { icon: 'error' }); return false; }
  let t = null;
  edit(() => {
    if (!hdr) { spliceSheet('r', g.r1, 1); g = { ...g, r2: g.r2 + 1 }; }
    t = tableOn(s, g, { style, blank: !hdr }, tableNames());
    g = t.g;
  });
  if (t) { SEL = { r: g.r1, c: g.c1, er: g.r2, ec: g.c2 }; after(); }
  return !!t;
}
/* the table itself on sheet s over g, its first row the header row (blank: its names are עמודה and a number): the names,
   the header cells saying them, the options, and its filter when the sheet has none (or has one over these cells) */
function tableOn(s, g, o, taken) {
  const cols = uniqueCols(span(g.c1, g.c2).map(c => ({ n: o.blank ? '' : headText(cellAt(s, g.r1, c)) })));
  if (g.r2 === g.r1) g = { ...g, r2: g.r1 + 1 };   // a data row at least
  const name = typeof o.name === 'string' && o.name.trim() && !nameProblem(o.name.trim()) && !taken.has(o.name.trim().toLowerCase()) ? o.name.trim() : freeTableName(T('טבלה{0}', ''), taken);
  taken.add(name.toLowerCase());
  const t = { id: sid(), name, g, hr: 1, tr: 0, style: tsOf(o.style), sr: o.sr !== false, sc: !!o.sc, fc: !!o.fc, lc: !!o.lc, fb: o.fb !== false, cols };
  cols.forEach((c, i) => { const x = cellAt(s, g.r1, g.c1 + i); if (!x || x.v !== c.n || x.f != null) { const y = { ...(x || {}), v: c.n }; delete y.f; delete y.x; delete y.l; setCell(s, g.r1, g.c1 + i, y); } });
  setProp(s, 'tables', [...s.tables, t]);
  if (t.fb && (!s.af || meets(s.af, g))) setProp(s, 'af', { r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2, hide: {} });
  return t;
}
/* a total row for table t: the sheet's next row (put in first when it isn't free, on the sheet on screen), Excel's
   words in the first column and a total for the last. false when there is no room */
function totalRowOn(s, t) {
  const r = t.g.r2 + 1, free = r < MAXR && span(t.g.c1, t.g.c2).every(c => !hasVal(cellAt(s, r, c))) && !s.tables.some(o => o !== t && inG(o.g, r, t.g.c1));
  if (!free) { if (s !== WS) return null; spliceSheet('r', r, 1); }
  const next = { ...t, tr: 1, g: { ...t.g, r2: r }, cols: t.cols.map(c => ({ ...c })) };
  const last = next.cols.length - 1, num = typeof valAt(s, t.g.r2, t.g.c2) === 'number';
  if (!next.cols[0].fn) next.cols[0].lbl = next.cols[0].lbl || T('סה"כ');
  if (last > 0 && !next.cols[last].fn && !next.cols[last].lbl) next.cols[last].fn = num ? 'sum' : 'count';
  next.cols.forEach((c, i) => { const cc = t.g.c1 + i; setCell(s, r, cc, totalCell(next, c, cellAt(s, r, cc))); });
  return next;
}
/* Excel's Create Table: where the data is, and whether its first row is the header row */
function tableDialog(style) {
  if (!WS || (ED.on && !endEdit(true))) return;
  const cur = tableAt(WS, SEL.r, SEL.c);
  if (cur) { if (style) setTableOpt(cur, { style }); else toast(T('התא הזה כבר בתוך הטבלה {0}', cur.name), { icon: 'info' }); return; }
  let g = selG();
  if (wholeCols(g) || wholeRows(g)) g = usedPart(g);
  if (g.r1 === g.r2 && g.c1 === g.c2) g = region(WS, SEL.r, SEL.c);
  const ref = h('input', { class: 'field', dir: 'ltr', value: '=' + rangeA1(g), spellcheck: 'false', autocomplete: 'off', 'aria-label': T('איפה הנתונים של הטבלה?'), autofocus: true });
  const chk = h('input', { type: 'checkbox' }); chk.checked = guessHeaders(WS, g);
  const err = h('p', { class: 'sh-ch-err', role: 'alert', hidden: true });
  const apply = () => {
    const gg = parseRange(ref.value.trim().replace(/^=/, '').replace(/^.*!/, ''));
    if (!gg || wholeCols(gg) || wholeRows(gg)) { err.textContent = T('כותבים טווח של תאים, כמו A1:D20'); err.hidden = false; return false; }
    return createTable(gg, chk.checked, style);
  };
  const m = modal({ title: T('יצירת טבלה'), body: h('div', { class: 'sh-nmd' }, h('label', { class: 'fld' }, h('span', { text: T('איפה הנתונים של הטבלה?') }), ref), h('label', { class: 'check' }, chk, h('span', { text: T('לטבלה שלי יש כותרות') })), err),
    actions: [{ label: T('אישור'), kind: 'primary', run: apply }, { label: T('ביטול'), value: false }], onClose: () => { if (!MODALS.length) focusGrid(); } });
  ref.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); if (apply()) m.close(true); } });
}
/* the 60 styles, light, medium and dark, each as a small picture of a table; on a table's cell it changes that table */
function tableGallery(anchor, only) {
  if (!WS) return;
  const cur = tableAt(WS, SEL.r, SEL.c);
  const pic = name => {
    const t = { g: { r1: 0, c1: 0, r2: 4, c2: 3 }, hr: 1, tr: 0, style: name, sr: true, sc: false, fc: false, lc: false }, box = h('span', { class: 'sh-tsw' });
    for (let r = 0; r <= 4; r++) for (let c = 0; c <= 3; c++) {
      const l = tableLook(t, r, c) || {}, e = h('i');
      e.style.background = l.bg || '#fff';
      for (const [k, css] of [['bt', 'borderTop'], ['bb', 'borderBottom'], ['bs', UI_DIR === 'rtl' ? 'borderRight' : 'borderLeft'], ['be', UI_DIR === 'rtl' ? 'borderLeft' : 'borderRight']]) if (l[k]) e.style[css] = '1px solid ' + l[k].slice(2);
      if (r === 0 && l.c) e.style.boxShadow = 'inset 0 -2px 0 ' + l.c + '55';
      box.append(e);
    }
    return box;
  };
  const kinds = [['Light', 21, T('בהיר')], ['Medium', 28, T('בינוני')], ['Dark', 11, T('כהה')]];
  const body = h('div', { class: 'sh-tgal' }, ...kinds.map(([k, n, label]) => h('div', {}, h('div', { class: 'pop-t sub', text: label }),
    h('div', { class: 'sh-tgal-row' }, ...Array.from({ length: n }, (_, i) => { const name = 'TableStyle' + k + (i + 1); return h('button', { type: 'button', class: 'sh-tgal-b' + (cur && cur.style === name ? ' on' : ''), title: k === 'Light' ? T('בהיר {0}', i + 1) : k === 'Medium' ? T('בינוני {0}', i + 1) : T('כהה {0}', i + 1), onclick: () => { closePopover(); if (cur) setTableOpt(cur, { style: name }); else if (!only) tableDialog(name); } }, pic(name)); })))));
  openPop(anchor, h('div', {}, h('div', { class: 'pop-t', text: cur ? T('סגנון הטבלה {0}', cur.name) : T('עיצוב כטבלה') }), body));
}
/* one of a table's options (or its style, or its name), as one step */
function setTableOpt(t, patch) {
  const s = WB.sheets.find(sh => sh.tables.includes(t));
  if (!s) return;
  const next = { ...t, ...patch, cols: t.cols.map(c => ({ ...c })) };
  edit(() => {
    if ('tr' in patch && patch.tr !== t.tr) {
      // the total row (totalRowOn); taken away, its cells go (their look stays) and the table ends above it
      if (patch.tr) { const y = totalRowOn(s, t); if (y) Object.assign(next, { g: y.g, cols: y.cols }); }
      else {   // the total row goes, and its cells with it (their look stays)
        for (let c = t.g.c1; c <= t.g.c2; c++) { const x = cellAt(s, t.g.r2, c); if (x) setCell(s, t.g.r2, c, x.st ? { st: x.st } : null); }
        next.g = { ...t.g, r2: t.g.r2 - 1 };
      }
    }
    if ('hr' in patch && patch.hr !== t.hr) {
      // the header row: shown, it takes the row above the data (put in when that row isn't free); hidden, the names stay
      if (patch.hr) {
        const r = t.g.r1 - 1, free = r >= 0 && span(t.g.c1, t.g.c2).every(c => !hasVal(cellAt(s, r, c))) && !s.tables.some(o => o !== t && inG(o.g, r, t.g.c1));
        if (!free) { spliceSheet('r', t.g.r1, 1); next.g = { ...next.g, r1: t.g.r1, r2: next.g.r2 + 1 }; }
        else next.g = { ...next.g, r1: r };
        next.cols.forEach((c, i) => { const x = cellAt(s, next.g.r1, t.g.c1 + i); setCell(s, next.g.r1, t.g.c1 + i, { ...(x || {}), v: c.n }); });
      } else {
        for (let c = t.g.c1; c <= t.g.c2; c++) { const x = cellAt(s, t.g.r1, c); if (x) setCell(s, t.g.r1, c, x.st ? { st: x.st } : null); }
        next.g = { ...next.g, r1: t.g.r1 + 1 };
      }
    }
    if ('name' in patch) next.name = patch.name;
    const y = normTable(next);
    if (!y) return;
    setProp(s, 'tables', s.tables.map(o => o === t ? y : o));
    // the filter buttons follow the table: with its header row and its data, never its total row
    const f = y.hr && y.fb ? { r1: y.g.r1, c1: y.g.c1, r2: y.g.r2 - y.tr, c2: y.g.c2 } : null;
    if (s.af && meets(s.af, t.g)) setProp(s, 'af', f ? { ...f, hide: s.af.hide } : null);
    else if (!s.af && f && 'fb' in patch) setProp(s, 'af', { ...f, hide: {} });
  });
  refresh();
}
/* a cell of the total row: its words, or SUBTOTAL over the column (so the rows a filter hides are left out, as in Excel) */
function totalCell(t, c, x) {
  const st = x && x.st ? { st: x.st } : {};
  if (c.fn && TOT_FN[c.fn]) return { ...st, f: `SUBTOTAL(${TOT_FN[c.fn]},[${tableColRef(c.n)}])`, v: 0 };
  if (c.lbl) return { ...st, v: c.lbl };
  return x && x.f != null ? x : st.st ? st : null;
}
/* a column's name inside [ ], with ' before the marks that would end it, as Excel writes it */
const tableColRef = n => n.replace(/['#[\]@]/g, m => "'" + m);
/* the table back into plain cells (Excel's Convert to Range): its look stays where it is drawn now */
function tableToRange(t = tableAt(WS, SEL.r, SEL.c)) {
  if (!t) return;
  const s = WS;
  edit(() => {
    for (let r = t.g.r1; r <= t.g.r2; r++) for (let c = t.g.c1; c <= t.g.c2; c++) {
      const l = tableLook(t, r, c);
      if (!l) continue;
      const x = cellAt(s, r, c), st = normStyle({ ...l, ...((x && x.st) || {}) });
      if (st) setCell(s, r, c, { ...(x || {}), st });
    }
    trefsToCells(t);
    setProp(s, 'tables', s.tables.filter(o => o !== t));
    if (s.af && meets(s.af, t.g)) setProp(s, 'af', null);
  });
  toast(T('הטבלה {0} היא עכשיו תאים רגילים', t.name), { icon: 'table' });
}

/* a table's total row at (r, c): the table and the column */
function totAt(s, r, c) { const t = s.tables.find(y => y.tr && r === y.g.r2 && c >= y.g.c1 && c <= y.g.c2); return t ? { t, i: c - t.g.c1 } : null; }
const TOT_LIST = [[null, N_('ללא')], ['average', N_('ממוצע')], ['count', N_('ספירה')], ['countNums', N_('ספירת מספרים')], ['max', N_('מקסימום')], ['min', N_('מינימום')], ['sum', N_('סכום')], ['stdDev', N_('סטיית תקן')], ['var', N_('שונות')]];
function openTotalList(d) {
  const { t, i } = d.tot, m = d.m, cur = t.cols[i].fn || null;
  const sc = V.scroll.getBoundingClientRect(), vis = V.vis, x = colX(m.c) - (m.c >= WS.fc ? vis.sx : 0), y = rowY(m.r) - (m.r >= WS.fr ? vis.sy : 0), w = spanW(m.c, m.c2) + (d.out ? d.size : 0);
  Object.assign(V.anchor.style, { left: (WS.dir === 'rtl' ? sc.right - x - w : sc.left + x) + 'px', top: sc.top + y + 'px', width: w + 'px', height: spanH(m.r, m.r2) + 'px' });
  menuAt(V.anchor, T('בשורת הסיכום'), [...TOT_LIST.map(([fn, label]) => ({ ic: fn === cur ? 'check' : 'functions', label: T(label), run: () => setTotal(t, i, fn) })), '-',
    { ic: 'function', label: T('עוד פונקציות…'), run: () => { selectCell(m.r, m.c); startEdit('enter', '=SUBTOTAL(109,[' + tableColRef(t.cols[i].n) + '])'); edChanged(); } }]);
  Object.assign(V.anchor.style, { width: '1px', height: '1px' });
  return true;
}
/* what a column of the total row works out: SUBTOTAL over the column, or nothing (Excel's choices) */
function setTotal(t, i, fn) {
  const s = WB.sheets.find(sh => sh.tables.includes(t));
  if (!s) return;
  const cols = t.cols.map((c, j) => { if (j !== i) return { ...c }; const o = { n: c.n }; if (c.cf) o.cf = c.cf; if (fn) o.fn = fn; return o; });
  const nt = { ...t, cols }, r = t.g.r2, c = t.g.c1 + i, x = cellAt(s, r, c);
  edit(() => {
    setProp(s, 'tables', s.tables.map(y => y === t ? nt : y));
    setCell(s, r, c, fn ? totalCell(nt, cols[i], x) : x && x.st ? { st: x.st } : null);
  });
  focusGrid();
}
/* typed just below a table, or just after its last column: the table takes the new row or column in, as Excel does
   (not past a total row). A column filled by one formula gets it in its new row */
function tableGrow(s, r, c) {
  for (const t of s.tables) {
    const g = t.g;
    let ng = null, cols = t.cols;
    if (!t.tr && r === g.r2 + 1 && c >= g.c1 && c <= g.c2 && !s.tables.some(o => o !== t && inG(o.g, r, c))) ng = { ...g, r2: r };
    else if (c === g.c2 + 1 && r >= g.r1 && r <= g.r2 && !s.tables.some(o => o !== t && meets(o.g, { r1: g.r1, c1: c, r2: g.r2, c2: c }))) {
      ng = { ...g, c2: c };
      cols = uniqueCols([...t.cols.map(y => ({ ...y })), { n: t.hr && r === g.r1 ? headText(cellAt(s, r, c)) : '' }]);
    }
    if (!ng) continue;
    const nt = { ...t, g: ng, cols };
    setProp(s, 'tables', s.tables.map(y => y === t ? nt : y));
    if (s.af && meets(s.af, g)) setProp(s, 'af', { ...s.af, r1: ng.r1, c1: ng.c1, r2: ng.r2 - nt.tr, c2: ng.c2, hide: s.af.hide });
    if (ng.c2 > g.c2 && nt.hr) { const x = cellAt(s, g.r1, c), n = cols[cols.length - 1].n; if (!x || x.v !== n) setCell(s, g.r1, c, { ...(x || {}), v: n }); }
    if (ng.r2 > g.r2) {
      cols.forEach((y, j) => { if (!y.cf || j === c - g.c1) return; const cc = g.c1 + j, x = cellAt(s, r, cc); if (!x || !hasVal(x)) setCell(s, r, cc, { ...(x || {}), f: y.cf, v: 0 }); });
      // the new row takes its columns' ways from the row above, as Excel's table does: the look of each cell, and the
      // list or rule (data validation) and conditional formatting that reach down to it
      for (let cc = g.c1; cc <= g.c2; cc++) { const up = cellAt(s, r - 1, cc), x = cellAt(s, r, cc); if (up && up.st && !(x && x.st)) setCell(s, r, cc, { ...(x || {}), st: up.st }); }
      const down = rules => rules.map(q => { const gs = q.g.map(y => y.r2 === r - 1 && y.c1 >= g.c1 && y.c2 <= g.c2 ? { ...y, r2: r } : y); return gs.some((y, i) => y !== q.g[i]) ? { ...q, g: gs } : q; });
      for (const k of ['dv', 'cf']) { const l = down(s[k]); if (l.some((q, i) => q !== s[k][i])) setProp(s, k, l); }
    }
    return nt;
  }
  return null;
}
/* a formula typed into an empty column of a table fills the whole column, and the column keeps it for new rows (Excel's
   calculated column) */
function tableFill(s, r, c, text) {
  const t = tableAt(s, r, c), d = t && dataRows(t);
  if (!t || text[0] !== '=' || r < d.r1 || r > d.r2) return;
  const i = c - t.g.c1, x = cellAt(s, r, c);
  if (!x || x.f == null) return;
  for (let rr = d.r1; rr <= d.r2; rr++) if (rr !== r && hasVal(cellAt(s, rr, c))) return;   // a column with something in it stays as it is
  for (let rr = d.r1; rr <= d.r2; rr++) if (rr !== r) { const y = cellAt(s, rr, c); setCell(s, rr, c, { ...(y || {}), f: shiftFormula(x.f, rr - r, 0), v: 0, ...(x.st ? { st: x.st } : {}) }); }
  setProp(s, 'tables', s.tables.map(y => y === t ? { ...t, cols: t.cols.map((q, j) => j === i ? { ...q, cf: x.f } : q) } : y));
}

/* =========================================================
   pivot tables, as Excel's: a summary of a range (or a table) by its fields, in rows and columns, with sums, counts,
   averages and the like, and filters. A sheet's pivot tables are s.pivots: { id, name, src (the source, written like a
   chart's range or a table's name), at (where it starts on its sheet), rows, cols: field names (a field is in one of
   rows, columns and filters), vals: [{ f, fn: sum count average max min product countNums stdDev stdDevp var varp,
   n: its own caption }], filt: [{ f, v: the values it lets through }] }. Its cells are worked out after the formulas, each time, and show where it stands like an array's
   spill (s._sp, with their look); typing over them is refused, as in Excel, where they would need a refresh
   ========================================================= */
const PV_FN = { sum: N_('סכום של {0}'), count: N_('ספירה של {0}'), average: N_('ממוצע של {0}'), max: N_('מקסימום של {0}'), min: N_('מינימום של {0}'), product: N_('מכפלה של {0}'), countNums: N_('ספירה של {0}'),
  stdDev: N_('סטיית תקן של {0}'), stdDevp: N_('סטיית תקן באוכלוסייה של {0}'), var: N_('שונות של {0}'), varp: N_('שונות של {0}') };   // the captions Excel 2016 in Hebrew gives (measured), the same for count and countNums, and for var and varp
const PV_FN_WORD = { sum: N_('סכום'), count: N_('ספירה'), average: N_('ממוצע'), max: N_('מקסימום'), min: N_('מינימום'), product: N_('מכפלה'), countNums: N_('ספירת מספרים'), stdDev: N_('סטיית תקן'), stdDevp: N_('סטיית תקן באוכלוסייה'), var: N_('שונות'), varp: N_('שונות באוכלוסייה') };
function normPivot(x) {
  if (!x || typeof x !== 'object') return null;
  const at = typeof x.at === 'string' ? parseA1(x.at) : x.at && Number.isInteger(x.at.r) && Number.isInteger(x.at.c) ? { r: x.at.r, c: x.at.c } : null;
  const src = typeof x.src === 'string' ? x.src.trim().replace(/^=/, '').slice(0, 300) : '';
  if (!at || !src || at.r >= MAXR || at.c >= MAXC) return null;
  const names = l => (Array.isArray(l) ? l : []).filter(v => typeof v === 'string' && v.trim()).map(v => v.trim().slice(0, 255)).slice(0, 16);
  const vals = (Array.isArray(x.vals) ? x.vals : []).map(v => v && typeof v === 'object' && typeof v.f === 'string' && v.f.trim() ? { f: v.f.trim().slice(0, 255), fn: PV_FN[v.fn] ? v.fn : 'sum', ...(typeof v.n === 'string' && v.n.trim() ? { n: v.n.trim().slice(0, 255) } : {}) } : null).filter(Boolean).slice(0, 16);
  const seen = new Set(), one = n => !seen.has(n.toLowerCase()) && !!seen.add(n.toLowerCase());   // a field is in one of rows, columns and filters
  const rows = names(x.rows).filter(one), cols = names(x.cols).filter(one);
  const filt = (Array.isArray(x.filt) ? x.filt : []).map(v => v && typeof v === 'object' && typeof v.f === 'string' && v.f.trim() ? { f: v.f.trim().slice(0, 255), ...(Array.isArray(v.v) ? { v: v.v.map(String).slice(0, 10000) } : {}) } : null).filter(v => v && one(v.f)).slice(0, 16);
  const name = typeof x.name === 'string' && x.name.trim() ? x.name.trim().slice(0, 255) : 'PivotTable1';
  return { id: typeof x.id === 'string' && /^[a-z0-9]{4,24}$/.test(x.id) ? x.id : sid(), name, src, at: { r: at.r, c: at.c }, rows, cols, vals, filt };
}
function pivotOut(x) { return { id: x.id, name: x.name, src: x.src, at: A1(x.at.r, x.at.c), rows: x.rows.slice(), cols: x.cols.slice(), vals: x.vals.map(v => ({ ...v })), filt: x.filt.map(v => ({ ...v })) }; }
/* the source now: a table's name is its header row and data; otherwise a range (or a defined name) like a chart's */
function pivotSrc(s, x) {
  const tb = tableByName(x.src);
  if (tb) { const t = tb.t; return t.hr ? { s: tb.s, g: { r1: t.g.r1, c1: t.g.c1, r2: t.g.r2 - t.tr, c2: t.g.c2 } } : null; }
  const R = chartRef(s, x.src);
  return R && R.s ? { s: R.s, g: R.g } : null;
}
/* the source's fields (its first row) and records (the rest) */
function pivotData(s, x) {
  const R = pivotSrc(s, x);
  if (!R) return null;
  const { s: sh, g } = R, w = Math.min(g.c2 - g.c1 + 1, 500), u = usedEnd(sh), r2 = Math.min(g.r2, Math.max(g.r1, u.r - 1), g.r1 + 200000);
  const head = [];
  for (let j = 0; j < w; j++) { const v = valAt(sh, g.r1, g.c1 + j); head.push(v == null || v === '' ? '' : isErr(v) ? v.c : String(typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v)); }
  const recs = [];
  for (let r = g.r1 + 1; r <= r2; r++) { const row = []; for (let j = 0; j < w; j++) row.push(valAt(sh, r, g.c1 + j)); recs.push(row); }
  return { head, recs };
}
/* the order of items, as Excel sorts them (measured in Excel 2016, pivot_order.ps1): numbers, then names of days and
   months in their own order (Excel's custom lists: the eight of an Excel in Hebrew, short and long, in English and in
   Hebrew; text in any capitals), then other text (Excel's order), FALSE and TRUE, errors (#N/A first: by Excel's codes for
   them, from the top), and blanks last. Excel's order of names from different lists side by side follows no rule; here
   it is by their place in their lists */
const PV_LISTS = ['Sun|Mon|Tue|Wed|Thu|Fri|Sat', 'Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday', 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec',
  'January|February|March|April|May|June|July|August|September|October|November|December', 'יום א|יום ב|יום ג|יום ד|יום ה|יום ו|שבת',
  'יום ראשון|יום שני|יום שלישי|יום רביעי|יום חמישי|יום שישי|שבת', 'ינו|פבר|מרץ|אפר|מאי|יונ|יול|אוג|ספט|אוק|נוב|דצמ', 'ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר'];
let PV_POS = null;
const pvPos = v => {
  if (!PV_POS) { PV_POS = new Map(); for (const l of PV_LISTS) l.split('|').forEach((w, i) => { if (!PV_POS.has(w.toLowerCase())) PV_POS.set(w.toLowerCase(), i); }); }
  return PV_POS.get(v.toLowerCase());
};
const PV_ERR = { '#NULL!': 0, '#DIV/0!': 7, '#VALUE!': 15, '#REF!': 23, '#NAME?': 29, '#NUM!': 36, '#N/A': 42, '#SPILL!': 45, '#CALC!': 50 };
const pvRank = v => v == null || v === '' ? 5 : typeof v === 'number' ? 0 : typeof v === 'string' ? (pvPos(v) == null ? 2 : 1) : typeof v === 'boolean' ? 3 : 4;
const pvCmp = (a, b) => pvRank(a) - pvRank(b) || (typeof a === 'number' ? a - b : typeof a === 'string' ? (pvPos(a) ?? 0) - (pvPos(b) ?? 0) || textCmp(a, b) : typeof a === 'boolean' ? (a ? 1 : 0) - (b ? 1 : 0) : isErr(a) ? (PV_ERR[b.c] ?? -1) - (PV_ERR[a.c] ?? -1) : 0);
const pvKey = v => v == null || v === '' ? 'b' : isErr(v) ? 'e' + v.c : valKey(v);
/* an item as its label shows it: Excel writes TRUE, FALSE and errors there as text */
const pvShow = v => v == null || v === '' ? T('(ריק)') : isErr(v) ? v.c : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v;
/* what a value field gathers from its records: how many values, how many numbers, their sum, product, mean and spread
   (Welford's way, which keeps its digits), the largest and the smallest */
const pvAcc = () => ({ n: 0, k: 0, sum: 0, prod: 1, mu: 0, m2: 0, max: -Infinity, min: Infinity });
function pvAdd(A, y) {
  if (y == null || y === '') return;
  A.n++;
  if (typeof y === 'number') { A.k++; A.sum += y; A.prod *= y; const d = y - A.mu; A.mu += d / A.k; A.m2 += d * (y - A.mu); if (y > A.max) A.max = y; if (y < A.min) A.min = y; }
}
/* a value field's answer from what was gathered: Excel's rules (a count counts every value, a sum only numbers) */
function pvAnswer(fn, a) {
  if (!a) return null;
  switch (fn) {
    case 'count': return a.n;
    case 'countNums': return a.k;
    case 'sum': return a.k ? a.sum : 0;
    case 'product': return a.k ? a.prod : 0;
    case 'average': return a.k ? a.sum / a.k : E_DIV;
    case 'max': return a.k ? a.max : 0;
    case 'min': return a.k ? a.min : 0;
    case 'stdDev': case 'var': case 'stdDevp': case 'varp': {   // of a sample (n - 1) or of the whole population (n)
      const d = fn.endsWith('p') ? a.k : a.k - 1;
      if (d < 1) return E_DIV;
      return fn[0] === 'v' ? a.m2 / d : Math.sqrt(a.m2 / d);
    }
  }
  return null;
}
const PV_HEAD = { bg: '#d9e1f2', b: true }, PV_LINE = '1s#8ea9db', PV_SUB = '#d9d9d9';   // Excel's PivotStyleLight16 (read from Excel; PV_SUB: the subtotal columns of the outer column field)
/* the cells of a pivot table, Excel's compact form: the filters on top, then the header, the rows with their subtotals
   above their inner rows, and the grand totals. rows: each cell { v, st }, null for nothing there; and how it is laid
   out (rowList: the items of each row, cols: each column's items, value field and kind), for a file */
function pivotGrid(s, x) {
  const D = pivotData(s, x), out = [];
  if (!D) return { rows: [[{ v: T('טבלת הציר: המקור שלה לא נמצא'), st: { c: '#c00000' } }]] };
  const idx = n => D.head.findIndex(h1 => h1.toLowerCase() === n.toLowerCase());
  const rowF = x.rows.map(idx).filter(i => i >= 0), colF = x.cols.map(idx).filter(i => i >= 0), vals = x.vals.map(v => ({ ...v, i: idx(v.f) })).filter(v => v.i >= 0);
  const filt = x.filt.map(f => ({ ...f, i: idx(f.f) })).filter(f => f.i >= 0);
  // the filters, above the rest, and a row between
  for (const f of filt) {
    let word = T('(הכל)');
    if (f.v && f.v.length === 1) { const r = D.recs.find(rec => pvKey(rec[f.i]) === f.v[0]); word = r ? pvShow(r[f.i]) : T('(ריק)'); }
    else if (f.v) word = T('(פריטים מרובים)');
    out.push([{ v: D.head[f.i], st: { bg: PV_HEAD.bg, bb: PV_LINE } }, { v: word, st: { bg: PV_HEAD.bg, bb: PV_LINE } }]);
  }
  if (filt.length) out.push([]);
  if (!rowF.length && !colF.length && !vals.length) { out.push([{ v: x.name, st: { b: true } }], [{ v: T('כדי לבנות את טבלת הציר, בוחרים שדות ברשימת השדות'), st: { c: '#595959' } }]); return { rows: out }; }
  const recs = D.recs.filter(rec => filt.every(f => !f.v || f.v.includes(pvKey(rec[f.i]))));
  // what each record adds to: every row prefix with every column prefix (the empty prefix is the grand total)
  const acc = new Map(), tree = () => ({ kids: new Map() }), rT = tree(), cT = tree();
  const into = (n, vs) => { for (const v of vs) { const k = pvKey(v); if (!n.kids.has(k)) n.kids.set(k, { v, k, kids: new Map() }); n = n.kids.get(k); } };
  const pre = vs => vs.length + '|' + vs.map(pvKey).join('\u0002');
  for (const rec of recs) {
    const rv = rowF.map(i => rec[i]), cv = colF.map(i => rec[i]);
    into(rT, rv); into(cT, cv);
    for (let a = 0; a <= rv.length; a++) for (let b = 0; b <= cv.length; b++) {
      const key = pre(rv.slice(0, a)) + '\u0003' + pre(cv.slice(0, b));
      vals.forEach((v, j) => {
        let A = acc.get(key + '\u0001' + j);
        if (!A) acc.set(key + '\u0001' + j, A = pvAcc());
        pvAdd(A, rec[v.i]);
      });
    }
  }
  const sorted = n => [...n.kids.values()].sort((p, q) => pvCmp(p.v, q.v));
  const cap = v => v.n || T(PV_FN[v.fn], v.f);
  const cell = (rk, ck, j) => { const A = acc.get(rk + '\u0003' + ck + '\u0001' + j); return A ? pvAnswer(vals[j].fn, A) : null; };
  // the columns: each column item for each value field, the subtotals of an outer item after its inner ones, and the
  // grand totals
  const cols = [], ckey = path => path.length + '|' + path.map(k => k.k).join('\u0002');
  const walkC = (n, path) => {
    for (const k of sorted(n)) {
      const p2 = [...path, k];
      if (p2.length < colF.length) { walkC(k, p2); vals.forEach((v, j) => cols.push({ ck: ckey(p2), j, path: p2, sub: true })); }
      else vals.forEach((v, j) => cols.push({ ck: ckey(p2), j, path: p2 }));
    }
  };
  if (colF.length) { walkC(cT, []); vals.forEach((v, j) => cols.push({ ck: '0|', j, grand: true })); }
  else vals.forEach((v, j) => cols.push({ ck: '0|', j }));
  // the column of row labels; with values in columns and no rows, Excel leaves it out
  const lab = rowF.length > 0 || (colF.length > 0 && vals.length < 2), L = c => lab ? [c] : [], H = PV_HEAD, HL = { ...PV_HEAD, bb: PV_LINE }, rl = rowF.length ? T('תוויות שורה') : null;
  if (colF.length) {
    out.push([...L({ v: vals.length === 1 && rowF.length ? cap(vals[0]) : null, st: H }), { v: T('תוויות עמודה'), st: H }, ...cols.slice(1).map(() => ({ v: null, st: H }))]);
    for (let lv = 0; lv < colF.length; lv++) {
      const st = lv === colF.length - 1 && vals.length === 1 ? HL : H;
      out.push([...L({ v: st === HL ? rl : null, st }), ...cols.map((c, i) => {
        if (c.grand) return { v: lv === 0 ? (vals.length === 1 ? T('סכום כולל') : T('סך הכל {0}', cap(vals[c.j]))) : null, st };
        if (c.sub) return { v: c.path.length === lv + 1 ? (vals.length === 1 ? T('{0} סה"כ', pvShow(c.path[lv].v)) : pvShow(c.path[lv].v) + ' ' + cap(vals[c.j])) : null, st: c.path.length === 1 ? { ...st, bg: PV_SUB } : st };
        const prev = cols[i - 1], same = prev && !prev.grand && !prev.sub && prev.path.slice(0, lv + 1).every((k, q) => k.k === c.path[q].k);
        return { v: same ? null : pvShow(c.path[lv].v), st };
      })]);
    }
    if (vals.length > 1) out.push([...L({ v: rl, st: HL }), ...cols.map(c => ({ v: c.grand || c.sub ? null : cap(vals[c.j]), st: c.sub && c.path.length === 1 ? { ...HL, bg: PV_SUB } : HL }))]);
  } else out.push([...L({ v: rl, st: HL }), ...cols.map(c => ({ v: cap(vals[c.j]), st: HL }))]);
  // the rows: each item with its subtotals on its own row above its inner items (compact form), then the grand total
  const look = st => st.b ? { b: true, ...(st.bt ? { bt: st.bt } : {}), ...(st.bb ? { bb: st.bb } : {}), ...(st.bg ? { bg: st.bg } : {}) } : null;
  const line = (label, rk, st, ind, grand) => out.push([...L({ v: label, st: ind ? { ...st, ind } : st }), ...cols.map(c => ({ v: cell(rk, c.ck, c.j), st: !grand && c.sub && c.path.length === 1 ? { ...(look(st) || {}), bg: PV_SUB } : look(st) }))]);
  const walkR = (n, path) => {
    for (const k of sorted(n)) {
      const p2 = [...path, k], inner = p2.length < rowF.length;
      rowList.push(p2.map(q => q.k));
      line(pvShow(k.v), p2.length + '|' + p2.map(q => q.k).join('\u0002'), inner ? (p2.length === 1 ? { b: true, bb: PV_LINE } : { b: true }) : {}, p2.length - 1);
      if (inner) walkR(k, p2);
    }
  };
  const GT = { bg: PV_HEAD.bg, b: true, bt: PV_LINE };   // the grand total row
  const rowList = [];   // the items of each row below the header (null: the grand total), for a file
  if (rowF.length) { walkR(rT, []); rowList.push(null); line(T('סכום כולל'), '0|', GT, 0, true); }
  else if (vals.length) line(colF.length && vals.length === 1 ? cap(vals[0]) : null, '0|', colF.length && vals.length === 1 ? GT : {}, 0, colF.length && vals.length === 1);   // with no rows, Excel shows the one value's row as its grand total
  return { rows: out, rowList, cols };
}
/* GETPIVOTDATA, as Excel's: what a pivot table shows. data_field: one of its value fields, by its caption or by its
   field's name; pivot_table: any of its cells; then pairs of one of its row or column fields and an item of it. Fewer
   pairs give a subtotal, none the grand total. #REF! for what it doesn't show. Its source is worked out first */
function getPivotData(a) {
  PV_READ = true;
  const at = refOf(a[1]), df = argS(a[0]);
  if (isErr(df)) return df;
  if (!at || !at.rng) return E_REF;
  const s = at.s, hit = s._pva && [...s._pva].find(([, g]) => !g.bad && inG(g, at.g.r1, at.g.c1)), x = hit && s.pivots.find(p => p.id === hit[0]);
  const R = x && pivotSrc(s, x), D = R && pivotData(s, x);
  if (!D) return E_REF;
  pointsAt(R);
  const low = t => String(t).toLowerCase(), idx = n => D.head.findIndex(h1 => low(h1) === low(n));
  const name = low(str(df)), vals = x.vals.filter(v => idx(v.f) >= 0), v = vals.find(q => low(q.n || T(PV_FN[q.fn], q.f)) === name) || vals.find(q => low(q.f) === name);
  if (!v || a.length % 2) return E_REF;
  // an item is named by what its label shows, in any capitals (2.5, TRUE, #N/A, (blank)); a filter's field only by the
  // one item it shows
  const cap = y => low(y == null || y === '' ? T('(ריק)') : isErr(y) ? y.c : toStr(y));
  const filt = x.filt.map(f => ({ ...f, i: idx(f.f) })).filter(f => f.i >= 0 && f.v), recs = D.recs.filter(rec => filt.every(f => f.v.includes(pvKey(rec[f.i]))));
  const shown = [...x.rows, ...x.cols].map(low), want = [];
  for (let i = 2; i < a.length; i += 2) {
    const f = argS(a[i]), it = argS(a[i + 1]);
    if (isErr(f)) return f;
    if (isErr(it)) return it;
    const j = idx(str(f)), t = cap(it), page = j >= 0 && filt.find(q => q.i === j);
    if (j < 0 || !(shown.includes(low(D.head[j])) || (page && page.v.length === 1))) return E_REF;
    const rec = recs.find(r1 => cap(r1[j]) === t);
    if (!rec) return E_REF;   // an item it doesn't show
    want.push([j, pvKey(rec[j])]);
  }
  const vi = idx(v.f), A = pvAcc();
  let any = false;
  for (const rec of recs) if (want.every(([j, k]) => pvKey(rec[j]) === k)) { any = true; pvAdd(A, rec[vi]); }
  return any ? pvAnswer(v.fn, A) : 0;   // items it shows that never meet: an empty cell
}
/* the GETPIVOTDATA that names a pivot table's value at (r, c), the way Excel writes it when the value is pointed at
   while a formula is written (its "Generate GetPivotData", on unless turned off in the pivot table's tab): the value
   field (by its field's name, or by its caption when that is its own or the field is there twice), the table's first
   cell, then a filter's one item, and the items of the value's row and column. null for any other cell */
function pivotRefText(s, r, c) {
  const x = pivotAt(s, r, c), g = x && s._pva.get(x.id), D = g && !g.bad && pivotData(s, x);
  if (!D) return null;
  const low = t => t.toLowerCase(), idx = n => D.head.findIndex(h1 => low(h1) === low(n)), has = n => idx(n) >= 0;
  const rows = x.rows.filter(has), cols = x.cols.filter(has), vals = x.vals.filter(v => has(v.f)), filt = x.filt.filter(f => has(f.f));
  const G = pivotGrid(s, x), fr = filt.length ? filt.length + 1 : 0, hr = cols.length ? 1 + cols.length + (vals.length > 1 ? 1 : 0) : 1, lab = rows.length > 0 || (cols.length > 0 && vals.length < 2);
  const i = r - g.r1 - fr - hr, col = G.cols && G.cols[c - g.c1 - (lab ? 1 : 0)], row = rows.length ? G.rowList[i] : i === 0 ? null : undefined;
  if (i < 0 || !col || row === undefined || !vals[col.j]) return null;
  const v = vals[col.j], q = t => '"' + String(t).replace(/"/g, '""') + '"';
  const item = (f, key) => { const rec = D.recs.find(y => pvKey(y[idx(f)]) === key), y = rec ? rec[idx(f)] : null; return typeof y === 'number' ? String(y) : typeof y === 'boolean' ? (y ? 'TRUE' : 'FALSE') : q(pvShow(y)); };
  const pairs = [];
  for (const f of filt) if (f.v && f.v.length === 1) pairs.push(q(f.f), item(f.f, f.v[0]));
  (row || []).forEach((key, d) => pairs.push(q(rows[d]), item(rows[d], key)));
  if (col.path) col.path.forEach((n, d) => pairs.push(q(cols[d]), item(cols[d], n.k)));   // (a grand total has none)
  const name = v.n || (vals.filter(y => low(y.f) === low(v.f)).length > 1 ? T(PV_FN[v.fn], v.f) : v.f);
  const at = '$' + colName(g.c1) + '$' + (g.r1 + fr + 1), pre = ED.sid && ED.sid !== s.id ? sheetPrefix(s.name) : '';
  return `GETPIVOTDATA(${[q(name), pre + at, ...pairs].join(',')})`;
}
/* where a pivot table's cells are now, and whether (r, c) is one of them */
const pivotAt = (s, r, c) => { if (!s._pva) return null; for (const [id, g] of s._pva) if (inG(g, r, c)) return s.pivots.find(x => x.id === id) || null; return null; };
/* its cells into the sheet, like an array's spill; filled cells in the way leave only a word in its first cell */
function placePivot(s, x) {
  let G;
  try { G = pivotGrid(s, x); } catch (e) { console.warn(e); G = { rows: [[{ v: E_VAL }]] }; }
  const h0 = G.rows.length, w0 = Math.max(1, ...G.rows.map(r => r.length)), g = { r1: x.at.r, c1: x.at.c, r2: Math.min(MAXR - 1, x.at.r + Math.max(1, h0) - 1), c2: Math.min(MAXC - 1, x.at.c + w0 - 1) };
  let blocked = false;
  for (let r = g.r1; r <= g.r2 && !blocked; r++) for (let c = g.c1; c <= g.c2; c++) { const k = KEY(r, c); if (hasVal(s.cells.get(k)) || s._sp.has(k) || s.merges.some(m => inG(m, r, c))) { blocked = true; break; } }
  const key = 'pv:' + x.id;
  if (blocked) {
    const k = KEY(x.at.r, x.at.c);
    if (!hasVal(s.cells.get(k)) && !s._sp.has(k)) { const o = { v: T('טבלת הציר {0} צריכה מקום: יש תאים מלאים בדרך', x.name), a: key, st: { c: '#c00000' } }; s._sp.set(k, o); s._pvc.set(k, o); }
    s._pva.set(x.id, { r1: x.at.r, c1: x.at.c, r2: x.at.r, c2: x.at.c, bad: true });
    return;
  }
  G.rows.forEach((row, i) => row.forEach((cl, j) => { if (cl && (cl.v != null || cl.st)) { const o = { v: cl.v == null ? '' : cl.v, a: key, ...(cl.st ? { st: cl.st } : {}) }; s._sp.set(KEY(g.r1 + i, g.c1 + j), o); s._pvc.set(KEY(g.r1 + i, g.c1 + j), o); } }));
  s._pva.set(x.id, g);
}
/* Excel's Create PivotTable: the data (the table or the block of cells around the active one), and where it goes: a new
   sheet (at A3, as Excel puts it) or a cell of this workbook */
function pivotDialog() {
  if (!WS || (ED.on && !endEdit(true))) return;
  const t = tableAt(WS, SEL.r, SEL.c);
  let g = selG();
  if (wholeCols(g) || wholeRows(g)) g = usedPart(g);
  if (g.r1 === g.r2 && g.c1 === g.c2) g = region(WS, SEL.r, SEL.c);
  const src = h('input', { class: 'field', dir: 'ltr', value: t ? t.name : sheetPrefix(WS.name) + absA1(g), spellcheck: 'false', autocomplete: 'off', 'aria-label': T('הטבלה או הטווח'), autofocus: true });
  const where = h('select', { class: 'field', 'aria-label': T('איפה לשים את טבלת הציר') }, h('option', { value: 'new', text: T('גיליון חדש') }), h('option', { value: 'here', text: T('גיליון קיים') }));
  const at = h('input', { class: 'field', dir: 'ltr', value: sheetPrefix(WS.name) + A1(g.r1, g.c2 + 2), spellcheck: 'false', autocomplete: 'off', 'aria-label': T('מיקום') });
  const atRow = h('label', { class: 'fld', hidden: true }, h('span', { text: T('מיקום') }), at);
  where.addEventListener('change', () => { atRow.hidden = where.value !== 'here'; });
  const err = h('p', { class: 'sh-ch-err', role: 'alert', hidden: true });
  const fail = m => { err.textContent = m; err.hidden = false; return false; };
  const apply = () => {
    const x0 = { src: src.value.trim().replace(/^=/, ''), at: 'A1' };
    if (!x0.src) return fail(T('כותבים את הטווח של הנתונים, עם שורת הכותרות שלהם'));
    const D = pivotData(WS, x0);
    if (!D || !D.head.length) return fail(T('זה לא טווח של תאים או שם של טבלה'));
    if (D.head.some(h1 => !h1)) return fail(T('לכל עמודה של הנתונים צריכה להיות כותרת בשורה הראשונה'));
    let sh = WS, a = { r: 2, c: 0 };
    if (where.value === 'here') { const pl = placeOf(at.value.trim().replace(/^=/, '')); if (!pl.g || !pl.s) return fail(T('זו לא כתובת של תא. למשל: B7')); sh = pl.s; a = { r: pl.g.r1, c: pl.g.c1 }; }
    const taken = new Set(); for (const s2 of WB.sheets) for (const p2 of s2.pivots) taken.add(p2.name.toLowerCase());
    let k = 1; while (taken.has(('PivotTable' + k).toLowerCase())) k++;
    const x = normPivot({ name: 'PivotTable' + k, src: x0.src, at: A1(a.r, a.c) });
    edit(() => {
      if (where.value === 'new') { sh = newSheet(freeName(sheetWord(WB.sheets.length + 1), takenNames()), WS.dir); bookStep(() => { WB.sheets.splice(WB.sheets.indexOf(WS), 0, sh); }); }
      setProp(sh, 'pivots', [...sh.pivots, x]);
    });
    if (sh !== WS) showSheet(sh, true);
    SEL = { r: a.r, c: a.c, er: a.r, ec: a.c };
    PV.open = true;
    refresh(); after();
    return true;
  };
  const m = modal({ title: T('יצירת טבלת ציר'), body: h('div', { class: 'sh-nmd' }, h('label', { class: 'fld' }, h('span', { text: T('הטבלה או הטווח') }), src), h('label', { class: 'fld' }, h('span', { text: T('איפה לשים את טבלת הציר') }), where), atRow, err),
    actions: [{ label: T('אישור'), kind: 'primary', run: apply }, { label: T('ביטול'), value: false }], onClose: () => { if (!MODALS.length) focusGrid(); } });
  for (const i of [src, at]) i.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); if (apply()) m.close(true); } });
}
/* one change to a pivot table, as one step */
function setPivot(s, x, patch) { edit(() => setProp(s, 'pivots', s.pivots.map(y => y.id === x.id ? normPivot({ ...pivotOut(y), ...patch, at: A1(y.at.r, y.at.c) }) || y : y))); }
/* the field list (Excel's PivotTable Fields pane), beside the sheet while a pivot table's cell is chosen: the source's
   fields to check, and the four areas (filters, columns, rows, values), each field with its menu */
const PV = { open: true };
function pivotPaneToggle() { PV.open = !PV.open; pivotTab(); }
function pivotPane(x) {
  if (!V.pvPane) { V.pvPane = h('div', { class: 'sh-pvpane', role: 'complementary', 'aria-label': T('שדות טבלת ציר') }); V.view.querySelector('.sh-wrap').append(V.pvPane); }
  const pane = V.pvPane;
  if (!x || !PV.open) { pane.hidden = true; return; }
  pane.hidden = false;
  const D = pivotData(WS, x), head = D ? D.head.filter(Boolean) : [];
  const used = n => [...x.rows, ...x.cols, ...x.filt.map(f => f.f), ...x.vals.map(v => v.f)].some(y => y.toLowerCase() === n.toLowerCase());
  const numeric = n => { const i = D.head.indexOf(n), k = D.recs.slice(0, 200).filter(r => r[i] != null && r[i] !== ''); return k.length > 0 && k.filter(r => typeof r[i] === 'number').length * 2 > k.length; };
  const s = WS;
  const check = n => { const i = h('input', { type: 'checkbox' }); i.checked = used(n); i.addEventListener('change', () => {
    if (i.checked) { if (numeric(n)) setPivot(s, x, { vals: [...x.vals, { f: n, fn: 'sum' }] }); else setPivot(s, x, { rows: [...x.rows, n] }); }
    else setPivot(s, x, { rows: x.rows.filter(y => y !== n), cols: x.cols.filter(y => y !== n), filt: x.filt.filter(f => f.f !== n), vals: x.vals.filter(v => v.f !== n) });
  }); return h('label', { class: 'check sh-pvf' }, i, h('span', { dir: 'auto', text: n })); };
  const areas = [['filt', T('מסננים'), 'filter_alt'], ['cols', T('עמודות@pivot'), 'view_column'], ['rows', T('שורות@pivot'), 'table_rows'], ['vals', T('ערכים'), 'functions']];
  const nameOfItem = (key, it) => key === 'vals' ? it.n || T(PV_FN[it.fn], it.f) : key === 'filt' ? it.f : it;
  const move = (key, i, to) => {
    const it = x[key][i], f = key === 'vals' || key === 'filt' ? it.f : it, patch = {}, axis = to && to !== 'vals';
    for (const k2 of ['rows', 'cols', 'filt', 'vals']) patch[k2] = x[k2].filter((y, j) => !(k2 === key && j === i) && !(axis && k2 !== 'vals' && (k2 === 'filt' ? y.f : y).toLowerCase() === f.toLowerCase()));   // a field is in one of rows, columns and filters
    if (to === 'vals') patch.vals.push({ f, fn: key === 'vals' ? it.fn : 'sum' });
    else if (to === 'filt') patch.filt.push({ f });
    else if (to) patch[to].push(f);
    setPivot(s, x, patch);
  };
  const order = (key, i, d) => { const l = x[key].slice(), j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setPivot(s, x, { [key]: l }); };
  const chip = (key, it, i) => h('button', { type: 'button', class: 'sh-pvchip', dir: 'auto', onclick: e => menuAt(e.currentTarget, nameOfItem(key, it), [
    { ic: 'arrow_upward', label: T('הזזה למעלה'), off: i === 0, run: () => order(key, i, -1) },
    { ic: 'arrow_downward', label: T('הזזה למטה'), off: i === x[key].length - 1, run: () => order(key, i, 1) },
    '-',
    ...areas.filter(([k2]) => k2 !== key).map(([k2, label, ic]) => ({ ic, label: T('הזזה אל {0}', label), run: () => move(key, i, k2) })),
    ...(key === 'vals' ? ['-', ...Object.keys(PV_FN).map(fn => ({ ic: fn === it.fn ? 'check' : 'functions', label: T('סיכום לפי {0}', T(PV_FN_WORD[fn])), run: () => setPivot(s, x, { vals: x.vals.map((v, j) => j === i ? { f: v.f, fn } : v) }) }))] : []),
    ...(key === 'filt' ? ['-', { ic: 'checklist', label: T('בחירת פריטים…'), run: () => pivotFilterDialog(s, x, i) }] : []),
    '-',
    { ic: 'close', label: T('הסרת השדה'), run: () => move(key, i, null) },
  ]) }, h('span', { text: nameOfItem(key, it) }), icon('arrow_drop_down'));
  pane.textContent = '';
  pane.append(
    h('div', { class: 'sh-pvhead' }, h('b', { text: T('שדות טבלת ציר') }), h('button', { class: 'icon-btn', type: 'button', title: T('סגירה'), 'aria-label': T('סגירה'), onclick: () => pivotPaneToggle() }, icon('close'))),
    h('p', { class: 'muted small', text: T('מסמנים שדות, ואז מזיזים אותם בין האזורים מהתפריט שלהם') }),
    h('div', { class: 'sh-pvfields' }, ...(head.length ? head.map(check) : [h('p', { class: 'muted small', text: T('טבלת הציר: המקור שלה לא נמצא') })])),
    h('div', { class: 'sh-pvareas' }, ...areas.map(([key, label, ic]) => h('div', { class: 'sh-pvarea' }, h('div', { class: 'sh-pvat' }, icon(ic), h('span', { text: label })), ...x[key].map((it, i) => chip(key, it, i))))));
}
/* which items a filter field lets through */
function pivotFilterDialog(s, x, i) {
  const f = x.filt[i], D = pivotData(s, x);
  if (!D) return;
  const col = D.head.findIndex(h1 => h1.toLowerCase() === f.f.toLowerCase());
  const seen = new Map();
  for (const r of D.recs) { const k = pvKey(r[col]); if (!seen.has(k)) seen.set(k, r[col]); }
  const items = [...seen.entries()].sort((a, b) => pvCmp(a[1], b[1]));
  const boxes = items.map(([k, v]) => { const c = h('input', { type: 'checkbox' }); c.checked = !f.v || f.v.includes(k); return [k, h('label', { class: 'check' }, c, h('span', { dir: 'auto', text: String(pvShow(v)) })), c]; });
  modal({ title: T('סינון לפי {0}', f.f), body: h('div', { class: 'sh-pvflist' }, ...boxes.map(b => b[1])),
    actions: [{ label: T('אישור'), kind: 'primary', run: () => { const on = boxes.filter(b => b[2].checked).map(b => b[0]); if (!on.length) return false; setPivot(s, x, { filt: x.filt.map((y, j) => j === i ? (on.length === boxes.length ? { f: y.f } : { f: y.f, v: on }) : y) }); } }, { label: T('ביטול'), value: false }],
    onClose: () => { if (!MODALS.length) focusGrid(); } });
}
function pivotSourceDialog() {
  const x = pivotAt(WS, SEL.r, SEL.c);
  if (!x) return;
  const src = h('input', { class: 'field', dir: 'ltr', value: x.src, spellcheck: 'false', autocomplete: 'off', 'aria-label': T('הטבלה או הטווח'), autofocus: true });
  modal({ title: T('שינוי מקור הנתונים'), body: h('div', { class: 'sh-nmd' }, h('label', { class: 'fld' }, h('span', { text: T('הטבלה או הטווח') }), src)),
    actions: [{ label: T('אישור'), kind: 'primary', run: () => { const v = src.value.trim().replace(/^=/, ''); if (!pivotData(WS, { src: v })) { toast(T('זה לא טווח של תאים או שם של טבלה'), { icon: 'error' }); return false; } setPivot(WS, x, { src: v }); } }, { label: T('ביטול'), value: false }],
    onClose: () => { if (!MODALS.length) focusGrid(); } });
}
function pivotDelete() {
  const x = pivotAt(WS, SEL.r, SEL.c);
  if (!x) return;
  edit(() => setProp(WS, 'pivots', WS.pivots.filter(y => y.id !== x.id)));
  toast(T('טבלת הציר {0} נמחקה', x.name), { icon: 'delete' });
}
function pivotPanel() {
  const name = h('input', { class: 'field sh-tname', dir: 'auto', spellcheck: 'false', autocomplete: 'off', 'aria-label': T('שם טבלת הציר') });
  const p = h('div', { class: 'panel sheet-only', 'data-panel': 'spivot', hidden: true },
    group(T('טבלת ציר'), '', h('div', { class: 'sh-tprops' }, h('span', { class: 'muted small', text: T('שם טבלת הציר') }), name)),
    group(T('הצגה@pivot'), '', rbtn('shPvFields', 'view_sidebar', T('רשימת שדות'), { big: true, id: 'shPvFieldsBtn', title: T('השדות והאזורים של טבלת הציר') })),
    group(T('נתונים'), '', rbtn('shPvSource', 'database', T('שינוי מקור הנתונים'), { big: true })),
    group(T('נוסחאות'), '', rbtn('shPvGpd', 'functions', T('צור GetPivotData'), { big: true, id: 'shPvGpdBtn', title: T('לחיצה על ערך של טבלת ציר בזמן כתיבת נוסחה כותבת GETPIVOTDATA במקום כתובת התא') })),
    group(T('פעולות'), '', rbtn('shPvDelete', 'delete', T('מחיקה'), { big: true, title: T('מחיקת טבלת הציר') })));
  const rename = () => {
    const x = pivotAt(WS, SEL.r, SEL.c), n = name.value.trim().slice(0, 255);
    if (!x || !n || n === x.name) return;
    if (WS.pivots.some(y => y !== x && y.name.toLowerCase() === n.toLowerCase())) { toast(T('כבר יש בגיליון טבלת ציר בשם הזה'), { icon: 'error' }); name.value = x.name; return; }
    setPivot(WS, x, { name: n });
  };
  name.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); rename(); focusGrid(); } });
  name.addEventListener('blur', rename);
  V.pvName = name;
  return p;
}
function pivotTab() {
  if (!V.pvTab) return;
  const x = WS && pivotAt(WS, SEL.r, SEL.c), show = !!x;
  if (V.pvTab.hidden === show) { V.pvTab.hidden = !show; if (!show && S.tab === 'spivot') selectTab('shome'); }
  if (x && document.activeElement !== V.pvName) V.pvName.value = x.name;
  const b = document.getElementById('shPvFieldsBtn'); if (b) b.classList.toggle('on', PV.open);
  const b2 = document.getElementById('shPvGpdBtn'); if (b2) b2.classList.toggle('on', PREFS.shGpd !== false);
  pivotPane(x);
}
/* every formula's structured references to table t, changed by fn(the reference, the formula's cell): what fn gives
   back takes its place (text); null leaves it */
function mapTrefs(t, fn) {
  const low = t.name.toLowerCase();
  for (const sh of WB.sheets) for (const [k, x] of [...sh.cells]) {
    if (x.f == null || (!x.f.includes('[') && !x.f.toLowerCase().includes(low))) continue;
    const r = kr(k), c = kc(k), own = tableAt(sh, r, c), mine = own && own.id === t.id;
    let any = false;
    const f = tokenize(x.f).map(tok => {
      const ref = tok.t === 'tref' ? tok : tok.t === 'opt' ? { tbl: null, sp: {}, cols: [tok.n] } : tok.t === 'name' && tok.sheet == null && tok.n.toLowerCase() === low && !nameOf(tok, sh) ? { tbl: tok.n, sp: {}, cols: [], bare: true } : null;
      if (!ref || (ref.tbl ? ref.tbl.toLowerCase() !== low : !mine)) return tok.s;
      const y = fn(ref, sh, r, c, own);
      if (y == null) return tok.s;
      any = true;
      return y;
    }).join('');
    if (any) setCell(sh, r, c, { ...x, f });
  }
}
const renameTableRefs = (t, n) => mapTrefs(t, ref => ref.tbl ? (ref.bare ? n : trefText({ ...ref, tbl: n }, null, false)) : null);
function renameColRefs(t, from, to) {
  mapTrefs(t, (ref, sh, r, c, own) => {
    const i = ref.cols.findIndex(y => y.toLowerCase() === from.toLowerCase());
    if (i < 0) return null;
    const cols = ref.cols.slice(); cols[i] = to;
    return trefText({ ...ref, cols }, own && own.name, false);
  });
}
/* turned into plain cells (or a column taken out): its references become addresses, as Excel makes them (#REF! for a
   column that is gone) */
function trefsToCells(t, sheetOf, gone) {
  mapTrefs(t, (ref, sh, r, c) => {
    if (gone && ref.cols.some(y => gone.includes(y.toLowerCase()))) return '#REF!';
    if (gone) return null;
    const R = trefRange(ref, WB.sheets.indexOf(sh), r, c);
    if (isErr(R)) return R.c;
    const pre = R.s === sh ? '' : sheetPrefix(R.s.name), g = R.g;
    return pre + (ref.sp.row ? '$' + colName(g.c1) + (g.r1 + 1) + (g.c2 !== g.c1 ? ':$' + colName(g.c2) + (g.r1 + 1) : '') : absA1(g));
  });
}
/* the table's own tab: shown while a cell of a table is chosen, with its name, options and style */
function tablePanel() {
  const opt = (k, label) => h('label', { class: 'sh-rchk' }, h('input', { type: 'checkbox', 'data-topt': k }), h('span', { text: label }));
  const name = h('input', { class: 'field sh-tname', dir: 'auto', spellcheck: 'false', autocomplete: 'off', 'aria-label': T('שם הטבלה') });
  const p = h('div', { class: 'panel sheet-only', 'data-panel': 'stable', hidden: true },
    group(T('מאפיינים'), '', h('div', { class: 'sh-tprops' }, h('span', { class: 'muted small', text: T('שם הטבלה') }), name), rbtn('shTblConvert', 'grid_off', T('המרה לטווח'), { big: true, title: T('הטבלה חוזרת להיות תאים רגילים, עם המראה שלה') })),
    group(T('אפשרויות סגנון'), '', h('div', { class: 'sh-topts' }, opt('hr', T('שורת כותרות')), opt('tr', T('שורת סיכום')), opt('sr', T('שורות מפוספסות')), opt('fc', T('עמודה ראשונה')), opt('lc', T('עמודה אחרונה')), opt('sc', T('עמודות מפוספסות')), opt('fb', T('לחצן סינון')))),
    group(T('סגנונות טבלה'), '', rbtn('shTblStyle', 'table_view', T('סגנון'), { big: true, title: T('סגנון אחר לטבלה') })));
  p.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.topt, t = tableAt(WS, SEL.r, SEL.c), on = e.target.checked; if (k && t) setTableOpt(t, { [k]: k === 'hr' || k === 'tr' ? (on ? 1 : 0) : on }); });
  name.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); renameTable(name.value); } else if (e.key === 'Escape') { e.preventDefault(); tableTab(); focusGrid(); } });
  name.addEventListener('blur', () => { const t = WS && tableAt(WS, SEL.r, SEL.c); if (t && name.value.trim() !== t.name) renameTable(name.value); });
  V.tblPanel = p; V.tblName = name;
  return p;
}
function tableTab() {
  if (!V.tblTab) return;
  const t = WS && tableAt(WS, SEL.r, SEL.c), show = !!t;
  if (V.tblTab.hidden === show) { V.tblTab.hidden = !show; if (!show && S.tab === 'stable') selectTab('shome'); }
  if (!t) return;
  if (document.activeElement !== V.tblName) V.tblName.value = t.name;
  for (const i of V.tblPanel.querySelectorAll('[data-topt]')) i.checked = !!t[i.dataset.topt];
}
/* a table's new name: the rules of a defined name, and none of the workbook's names or tables has it */
function renameTable(n) {
  const t = tableAt(WS, SEL.r, SEL.c);
  n = String(n || '').trim();
  if (!t || n === t.name) return;
  const why = nameProblem(n) || (tableNames().has(n.toLowerCase()) && n.toLowerCase() !== t.name.toLowerCase() ? T('כבר יש שם כזה. אפשר לבחור שם אחר.') : null);
  if (why) { toast(why, { icon: 'error', ms: 6000 }); tableTab(); return; }
  edit(() => { setTableOpt(t, { name: n }); renameTableRefs(t, n); for (const sh of WB.sheets) if (sh.pivots.some(x => x.src.toLowerCase() === t.name.toLowerCase())) setProp(sh, 'pivots', sh.pivots.map(x => x.src.toLowerCase() === t.name.toLowerCase() ? { ...x, src: n } : x)); });
  focusGrid();
}
/* =========================================================
   conditional formatting, as in Excel: rules that color cells by their values (greater than, text that contains,
   dates, top and bottom, above average, duplicates, a formula of your own), data bars, color scales and icon sets.
   A sheet's rules are s.cf, the first the strongest. Each applies to a list of ranges (g); its formulas are written
   for the top corner of the first range, and move with each cell like a formula copied there
   ========================================================= */
const CF_HL = ['cell', 'text', 'date', 'blank', 'noblank', 'err', 'noerr', 'top', 'avg', 'dup', 'uniq', 'expr'];   // the kinds that color cells
const CF_KINDS = [...CF_HL, 'bar', 'scale', 'icons'];
const CF_OPS = ['gt', 'ge', 'lt', 'le', 'eq', 'ne', 'bw', 'nb'];
const CF_TEXT = ['has', 'not', 'begins', 'ends'];
const CF_DATES = ['yesterday', 'today', 'tomorrow', 'last7', 'lastweek', 'thisweek', 'nextweek', 'lastmonth', 'thismonth', 'nextmonth'];
const CF_VO = ['auto', 'min', 'max', 'num', 'pct', 'pctl', 'formula'];
/* icon sets: how many icons, from the lowest values' icon to the highest */
const ICON_SETS = { '3Arrows': 3, '3ArrowsGray': 3, '3Triangles': 3, '4Arrows': 4, '4ArrowsGray': 4, '5Arrows': 5, '5ArrowsGray': 5, '3TrafficLights1': 3, '3TrafficLights2': 3,
  '3Signs': 3, '4TrafficLights': 4, '4RedToBlack': 4, '3Symbols': 3, '3Symbols2': 3, '3Flags': 3, '3Stars': 3, '4Rating': 4, '5Rating': 5, '5Quarters': 5, '5Boxes': 5 };
/* Excel's ready looks for a rule: light red fill with dark red text, and the rest */
const CF_LOOKS = [['red', N_('מילוי אדום בהיר עם טקסט אדום כהה'), { bg: '#ffc7ce', c: '#9c0006' }], ['yellow', N_('מילוי צהוב עם טקסט צהוב כהה'), { bg: '#ffeb9c', c: '#9c5700' }],
  ['green', N_('מילוי ירוק עם טקסט ירוק כהה'), { bg: '#c6efce', c: '#006100' }], ['fill', N_('מילוי אדום בהיר'), { bg: '#ffc7ce' }], ['text', N_('טקסט אדום'), { c: '#9c0006' }]];
/* a rule's border on a side is always a thin line (solid, dashed or dotted): Excel refuses medium, thick and double there */
const cfLine = b => '1' + (b[1] === 'd' || b[1] === 'o' ? b[1] : 's') + b.slice(2).toLowerCase();
const cfStyle = x => { const st = {}; if (x && typeof x === 'object') { for (const k of ['b', 'i', 'u', 's']) if (x[k] === true) st[k] = true; for (const k of ['c', 'bg']) if (HEX.test(x[k])) st[k] = x[k].toLowerCase(); for (const k of BD_SIDES) if (BORDER.test(x[k])) st[k] = cfLine(x[k]); } return st; };
/* one end of a bar, a stop of a color scale or an icon's threshold: t the kind (auto: 0 or the lowest; min, max, num a
   number, pct a percent of the way from the lowest to the highest, pctl a percentile, formula), v its number or formula */
function normVo(x, t0, v0) {
  const o = x && typeof x === 'object' ? x : {}, t = CF_VO.includes(o.t) ? o.t : t0;
  const out = { t };
  if (t === 'num' || t === 'pct' || t === 'pctl') { const n = Number.isFinite(+o.v) ? +o.v : v0 ?? 0; out.v = t === 'num' ? n : clamp(n, 0, 100); }
  if (t === 'formula') { const f = typeof o.v === 'string' ? o.v.trim().replace(/^=/, '').slice(0, 2000) : ''; if (!f) return { t: t0, ...(v0 != null ? { v: v0 } : {}) }; out.v = f; }
  if (o.gt) out.gt = true;
  return out;
}
const iconSteps = n => Array.from({ length: n - 1 }, (_, i) => ({ t: 'pct', v: Math.round(100 * (i + 1) / n) }));
const cfFormula = v => typeof v === 'string' && v.trim() ? v.trim().replace(/^=/, '').slice(0, 2000) : null;
function normCf(x) {
  if (!x || typeof x !== 'object' || !CF_KINDS.includes(x.k)) return null;
  const g = (Array.isArray(x.g) ? x.g : String(x.ref || '').split(/[\s,]+/).map(parseRange)).filter(y => y && y.r1 >= 0 && y.c1 >= 0 && y.r2 < MAXR && y.c2 < MAXC).slice(0, 50);
  if (!g.length) return null;
  const r = { id: typeof x.id === 'string' && /^[a-z0-9]{4,24}$/.test(x.id) ? x.id : sid(), k: x.k, g };
  switch (x.k) {
    case 'cell': r.op = CF_OPS.includes(x.op) ? x.op : 'gt'; r.a = cfFormula(x.a) || '0'; if (r.op === 'bw' || r.op === 'nb') r.b = cfFormula(x.b) || '0'; break;
    case 'text': r.op = CF_TEXT.includes(x.op) ? x.op : 'has'; r.t = String(x.t ?? '').slice(0, 255); break;
    case 'date': r.p = CF_DATES.includes(x.p) ? x.p : 'today'; break;
    case 'top': r.n = clamp(Math.round(+x.n) || 10, 1, 1000); if (x.pct) r.pct = true; if (x.bot) r.bot = true; break;
    case 'avg': if (x.below) r.below = true; if (x.eq) r.eq = true; break;
    case 'expr': r.f = cfFormula(x.f); if (!r.f) return null; break;
    case 'bar': r.c = HEX.test(x.c) ? x.c.toLowerCase() : '#638ec6'; if (x.solid) r.solid = true; if (x.noaxis) r.noaxis = true; r.lo = normVo(x.lo, 'auto'); r.hi = normVo(x.hi, 'auto'); break;
    case 'scale': {
      const cs = (Array.isArray(x.cs) ? x.cs : []).slice(0, 3);
      if (cs.length < 2) return null;
      r.cs = cs.map((o, i) => ({ ...normVo(o, i === 0 ? 'min' : i === cs.length - 1 ? 'max' : 'pctl', i && i < cs.length - 1 ? 50 : null), c: HEX.test(o && o.c) ? o.c.toLowerCase() : '#ffffff' }));
      break;
    }
    case 'icons': {
      r.set = ICON_SETS[x.set] ? x.set : '3TrafficLights1';
      const n = ICON_SETS[r.set], th = Array.isArray(x.th) ? x.th : [], d = iconSteps(n);
      r.th = d.map((o, i) => normVo(th[i], 'pct', o.v));
      if (x.rev) r.rev = true;
      break;
    }
  }
  if ((x.k === 'bar' || x.k === 'icons') && x.only) r.only = true;
  if (CF_HL.includes(x.k)) r.st = cfStyle(x.st);
  if (x.stop) r.stop = true;
  return r;
}
/* a rule as it is kept: its ranges as Excel's list ("A1:A10 C1:C10") */
function cfOut(rule) {
  const o = { ...rule, ref: rule.g.map(rangeA1).join(' ') };
  delete o.g;
  for (const k of Object.keys(o)) if (k[0] === '_') delete o[k];
  return o;
}
/* each formula in a rule through fn: its values (cell), its formula (expr), and thresholds written as formulas */
function cfFormulas(rule, fn) {
  const r = { ...rule };
  for (const k of Object.keys(r)) if (k[0] === '_') delete r[k];
  const vo = o => o && o.t === 'formula' ? { ...o, v: fn(o.v) } : o;
  if (r.a != null) r.a = fn(r.a);
  if (r.b != null) r.b = fn(r.b);
  if (r.f != null) r.f = fn(r.f);
  if (r.lo) r.lo = vo(r.lo);
  if (r.hi) r.hi = vo(r.hi);
  if (r.cs) r.cs = r.cs.map(vo);
  if (r.th) r.th = r.th.map(vo);
  return r;
}
const cfAnchor = rule => ({ r: rule.g[0].r1, c: rule.g[0].c1 });
/* a rule's formula at cell (r, c): its parts without $ move by where the cell is from the rule's corner */
function cfEval(f, s, r, c, a) {
  const ast = astOf(f);
  if (!ast) return E_NAME;
  const keep = [CTX, AX, OFF];
  CTX = { si: WB.sheets.indexOf(s), r, c, dyn: false }; AX = false; OFF = { dr: r - a.r, dc: c - a.c };
  try { return scal(ev(ast)); } catch (e) { return e instanceof Err ? e : E_VAL; } finally { [CTX, AX, OFF] = keep; }
}
/* what a rule needs to know about all its cells (the numbers, the average, how often each value comes), once for each
   change of the workbook */
function cfStats(s, rule) {
  if (rule._v === CHV && rule._s === s) return rule._st;
  const nums = [], seen = rule.k === 'dup' || rule.k === 'uniq' ? new Map() : null;
  for (const g of rule.g) eachIn({ s, g }, v => {
    if (typeof v === 'number') nums.push(v);
    if (seen && v !== '' && !isErr(v)) { const key = valKey(v); seen.set(key, (seen.get(key) || 0) + 1); }
  });
  const up = nums.slice().sort((a, b) => a - b), st = { up, seen, min: up.length ? up[0] : 0, max: up.length ? up[up.length - 1] : 0, avg: up.length ? sumOf(up) / up.length : 0 };
  if (rule.k === 'top' && up.length) {
    const n = rule.pct ? Math.max(1, Math.floor(up.length * rule.n / 100)) : Math.min(rule.n, up.length);
    st.cut = rule.bot ? up[n - 1] : up[up.length - n];
  }
  rule._v = CHV; rule._s = s; rule._st = st;
  return st;
}
const valKey = v => typeof v === 'string' ? 's' + v.toLowerCase() : (typeof v)[0] + String(v);
/* a threshold's number */
function voNum(o, st, s, rule, lo) {
  switch (o.t) {
    case 'auto': return lo ? Math.min(0, st.min) : Math.max(0, st.max);
    case 'min': return st.min;
    case 'max': return st.max;
    case 'num': return o.v;
    case 'pct': return st.min + (st.max - st.min) * o.v / 100;
    case 'pctl': return st.up.length ? pctl(st.up, o.v / 100) : 0;
    case 'formula': { const a = cfAnchor(rule), v = toNum(cfEval(o.v, s, a.r, a.c, a)); return isErr(v) ? (lo ? st.min : st.max) : v; }
  }
  return 0;
}
function mixColor(a, b, t) {
  const p = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)), A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
/* whether cell (r, c) passes the rule, and what it gets: { st } (colors, bold...), { bg } (a color scale), { bar }, { icon } */
function cfHit(s, rule, r, c) {
  const v = valAt(s, r, c);
  switch (rule.k) {
    case 'cell': {
      if (isErr(v)) return null;
      const a = cfEval(rule.a, s, r, c, cfAnchor(rule));
      if (isErr(a)) return null;
      let ok;
      if (rule.op === 'bw' || rule.op === 'nb') {
        const b = cfEval(rule.b, s, r, c, cfAnchor(rule));
        if (isErr(b)) return null;
        const [lo, hi] = compare('<=', a, b) ? [a, b] : [b, a];
        ok = compare('>=', v, lo) && compare('<=', v, hi);
        if (rule.op === 'nb') ok = !ok;
      } else ok = compare({ gt: '>', ge: '>=', lt: '<', le: '<=', eq: '=', ne: '<>' }[rule.op], v, a);
      return ok ? rule : null;
    }
    case 'text': {
      if (isErr(v)) return null;
      const t = toStr(v).toLowerCase(), q = rule.t.toLowerCase();
      const ok = rule.op === 'begins' ? t.startsWith(q) : rule.op === 'ends' ? t.endsWith(q) : (q === '' || (rule._re || (rule._re = wildRe(rule.t, false))).test(toStr(v))) === (rule.op === 'has');
      return ok ? rule : null;
    }
    case 'date': {
      if (typeof v !== 'number') return null;
      const d = Math.floor(v), t = Math.floor(todaySerial()), wk = t - dowOf(t);
      const ym = x => { const o = fromSerial(x); return o.y * 12 + o.m; }, m = ym(d) - ym(t);
      const ok = { yesterday: d === t - 1, today: d === t, tomorrow: d === t + 1, last7: d >= t - 6 && d <= t, lastweek: d >= wk - 7 && d < wk, thisweek: d >= wk && d < wk + 7,
        nextweek: d >= wk + 7 && d < wk + 14, lastmonth: m === -1, thismonth: m === 0, nextmonth: m === 1 }[rule.p];
      return ok ? rule : null;
    }
    case 'blank': return v == null || (typeof v === 'string' && !v.trim()) ? rule : null;
    case 'noblank': return v == null || (typeof v === 'string' && !v.trim()) ? null : rule;
    case 'err': return isErr(v) ? rule : null;
    case 'noerr': return isErr(v) ? null : rule;
    case 'top': { if (typeof v !== 'number') return null; const st = cfStats(s, rule); return st.cut != null && (rule.bot ? v <= st.cut : v >= st.cut) ? rule : null; }
    case 'avg': {
      if (typeof v !== 'number') return null;
      const a = cfStats(s, rule).avg;
      return (rule.below ? v < a : v > a) || (rule.eq && v === a) ? rule : null;
    }
    case 'dup': case 'uniq': {
      if (v == null || v === '' || isErr(v)) return null;
      const n = cfStats(s, rule).seen.get(valKey(v)) || 0;
      return (rule.k === 'dup' ? n > 1 : n === 1) ? rule : null;
    }
    case 'expr': { const x = toBool(cfEval(rule.f, s, r, c, cfAnchor(rule))); return x === true ? rule : null; }
    case 'bar': {
      if (typeof v !== 'number') return null;
      const st = cfStats(s, rule), lo = voNum(rule.lo, st, s, rule, true), hi = voNum(rule.hi, st, s, rule, false);
      // without an axis (noaxis) every bar grows from the lowest end, in one color
      const p = x => hi > lo ? clamp((x - lo) / (hi - lo), 0, 1) : 0.5, axis = rule.noaxis ? 0 : lo < 0 && hi > 0 ? p(0) : hi <= 0 && lo < 0 ? 1 : 0;
      return { bar: { a: axis, b: p(v), neg: v < 0 && !rule.noaxis, c: rule.c, solid: !!rule.solid }, hide: !!rule.only };
    }
    case 'scale': {
      if (typeof v !== 'number') return null;
      const st = cfStats(s, rule), pts = rule.cs.map((o, i) => ({ x: voNum(o, st, s, rule, i === 0), c: o.c }));
      for (let i = 1; i < pts.length; i++) if (pts[i].x < pts[i - 1].x) pts[i].x = pts[i - 1].x;
      if (v <= pts[0].x) return { bg: pts[0].c };
      for (let i = 1; i < pts.length; i++) if (v <= pts[i].x) return { bg: mixColor(pts[i - 1].c, pts[i].c, pts[i].x > pts[i - 1].x ? (v - pts[i - 1].x) / (pts[i].x - pts[i - 1].x) : 1) };
      return { bg: pts[pts.length - 1].c };
    }
    case 'icons': {
      if (typeof v !== 'number') return null;
      const st = cfStats(s, rule), n = ICON_SETS[rule.set];
      let i = 0;
      rule.th.forEach((o, j) => { const x = voNum(o, st, s, rule, false); if (o.gt ? v > x : v >= x) i = j + 1; });
      return { icon: { set: rule.set, i: rule.rev ? n - 1 - i : i }, hide: !!rule.only };
    }
  }
  return null;
}
/* how the rules change cell (r, c): { st: colors and bold from the rules, bar, icon, hide } or null. Worked out once for
   each change of the workbook; a rule a dialog is showing (s._cfp) comes first */
function cfLook(s, r, c) {
  if (!s.cf.length && !s._cfp) return null;
  if (s._cfv !== CHV || s._cfr !== s.cf || s._cfq !== s._cfp) { s._cfc = new Map(); s._cfv = CHV; s._cfr = s.cf; s._cfq = s._cfp; }
  const k = KEY(r, c);
  if (s._cfc.has(k)) return s._cfc.get(k);
  let out = null;
  for (const rule of s._cfp ? [s._cfp, ...s.cf] : s.cf) {
    if (!rule.g.some(g => inG(g, r, c))) continue;
    let hit;
    try { hit = cfHit(s, rule, r, c); } catch (e) { console.warn(e); hit = null; }
    if (!hit) continue;
    out = out || {};
    const st = hit === rule ? rule.st : hit.bg ? { bg: hit.bg } : null;
    if (st) for (const p in st) if (!(out.st && p in out.st)) (out.st || (out.st = {}))[p] = st[p];
    if (hit.bar && !out.bar) out.bar = hit.bar;
    if (hit.icon && !out.icon) out.icon = hit.icon;
    if (hit.hide) out.hide = true;
    if (rule.stop) break;
  }
  if (s._cfc.size > 50000) s._cfc.clear();
  s._cfc.set(k, out);
  return out;
}
const cfAt = (s, r, c) => s.cf.length || s._cfp ? cfLook(s, r, c) : null;

/* --- the icons, drawn small (16 × 16), from the lowest values' icon to the highest --- */
const IC_C = { g: '#2f9e44', y: '#f2b705', r: '#d9372b', k: '#262626', a: '#8c8c8c', p: '#f0a0a0', b: '#2e6fc0' };
const icArrow = (deg, c) => `<path transform="rotate(${deg} 8 8)" d="M8 1.5 14 7.5H10.2V14.5H5.8V7.5H2Z" fill="${c}"/>`;
const icCircle = (c, rim) => `<circle cx="8" cy="8" r="6.3" fill="${c}"${rim ? ' stroke="#333" stroke-width="1.2"' : ''}/>`;
const icStar = f => `<defs><clipPath id="sh-h"><rect width="8" height="16"/></clipPath></defs><path d="M8 1.2 10.1 5.6 14.8 6.1 11.3 9.3 12.3 14 8 11.6 3.7 14 4.7 9.3 1.2 6.1 5.9 5.6Z" fill="${f === 2 ? '#f5b800' : '#fff'}" stroke="#d99a00" stroke-width="1"/>` +
  (f === 1 ? '<path clip-path="url(#sh-h)" d="M8 1.2 10.1 5.6 14.8 6.1 11.3 9.3 12.3 14 8 11.6 3.7 14 4.7 9.3 1.2 6.1 5.9 5.6Z" fill="#f5b800"/>' : '');
const icSym = (k, ring) => {
  const c = k === 'x' ? IC_C.r : k === '!' ? IC_C.y : IC_C.g, fg = ring ? '#fff' : c;
  const glyph = k === 'x' ? `<path d="M5.2 5.2 10.8 10.8M10.8 5.2 5.2 10.8" stroke="${fg}" stroke-width="2.2" stroke-linecap="round"/>`
    : k === '!' ? `<path d="M8 3.8V9" stroke="${fg}" stroke-width="2.2" stroke-linecap="round"/><circle cx="8" cy="12" r="1.3" fill="${fg}"/>`
    : `<path d="M4.4 8.4 7 11 11.8 5.4" fill="none" stroke="${fg}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return (ring ? icCircle(c) : '') + glyph;
};
const icBars = n => Array.from({ length: 4 }, (_, i) => `<rect x="${1.5 + i * 3.5}" y="${11 - i * 3}" width="2.6" height="${3.5 + i * 3}" fill="${i < n ? IC_C.b : '#d0d4da'}"/>`).join('');
const icQuarter = q => `<circle cx="8" cy="8" r="6.2" fill="#fff" stroke="#333" stroke-width="1.2"/>` + (q === 4 ? '<circle cx="8" cy="8" r="6.2" fill="#333"/>'
  : q ? `<path d="M8 8V1.8A6.2 6.2 0 ${q > 2 ? 1 : 0} 1 ${q === 1 ? '14.2 8' : q === 2 ? '8 14.2' : '1.8 8'}Z" fill="#333"/>` : '');
const icBoxes = n => [[2, 2], [8.5, 2], [2, 8.5], [8.5, 8.5]].map(([x, y], i) => `<rect x="${x}" y="${y}" width="5.5" height="5.5" rx="1" fill="${i < n ? IC_C.b : '#d0d4da'}"/>`).join('');
const ICONS = {
  '3Arrows': [icArrow(180, IC_C.r), icArrow(90, IC_C.y), icArrow(0, IC_C.g)],
  '3ArrowsGray': [icArrow(180, IC_C.a), icArrow(90, IC_C.a), icArrow(0, IC_C.a)],
  '4Arrows': [icArrow(180, IC_C.r), icArrow(135, IC_C.y), icArrow(45, IC_C.y), icArrow(0, IC_C.g)],
  '4ArrowsGray': [icArrow(180, IC_C.a), icArrow(135, IC_C.a), icArrow(45, IC_C.a), icArrow(0, IC_C.a)],
  '5Arrows': [icArrow(180, IC_C.r), icArrow(135, IC_C.y), icArrow(90, IC_C.y), icArrow(45, IC_C.y), icArrow(0, IC_C.g)],
  '5ArrowsGray': [icArrow(180, IC_C.a), icArrow(135, IC_C.a), icArrow(90, IC_C.a), icArrow(45, IC_C.a), icArrow(0, IC_C.a)],
  '3Triangles': [`<path d="M8 13 14 4H2Z" fill="${IC_C.r}"/>`, `<rect x="3" y="6.7" width="10" height="2.6" fill="${IC_C.y}"/>`, `<path d="M8 3 14 12H2Z" fill="${IC_C.g}"/>`],
  '3TrafficLights1': [icCircle(IC_C.r), icCircle(IC_C.y), icCircle(IC_C.g)],
  '3TrafficLights2': [icCircle(IC_C.r, 1), icCircle(IC_C.y, 1), icCircle(IC_C.g, 1)],
  '4TrafficLights': [icCircle(IC_C.k), icCircle(IC_C.r), icCircle(IC_C.y), icCircle(IC_C.g)],
  '4RedToBlack': [icCircle(IC_C.k), icCircle(IC_C.a), icCircle(IC_C.p), icCircle(IC_C.r)],
  '3Signs': [`<path d="M8 1.8 14.2 8 8 14.2 1.8 8Z" fill="${IC_C.r}"/>`, `<path d="M8 2 14.5 13.5H1.5Z" fill="${IC_C.y}"/>`, icCircle(IC_C.g)],
  '3Symbols': [icSym('x', 1), icSym('!', 1), icSym('v', 1)],
  '3Symbols2': [icSym('x'), icSym('!'), icSym('v')],
  '3Flags': [IC_C.r, IC_C.y, IC_C.g].map(c => `<rect x="3" y="1.5" width="1.5" height="13" fill="#555"/><path d="M4.5 2H13.5L11.3 5.2 13.5 8.4H4.5Z" fill="${c}"/>`),
  '3Stars': [icStar(0), icStar(1), icStar(2)],
  '4Rating': [icBars(1), icBars(2), icBars(3), icBars(4)],
  '5Rating': [icBars(0), icBars(1), icBars(2), icBars(3), icBars(4)],
  '5Quarters': [icQuarter(0), icQuarter(1), icQuarter(2), icQuarter(3), icQuarter(4)],
  '5Boxes': [icBoxes(0), icBoxes(1), icBoxes(2), icBoxes(3), icBoxes(4)],
};
const iconSvg = (set, i, size = 16) => `<svg viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true">${(ICONS[set] || ICONS['3TrafficLights1'])[i] || ''}</svg>`;

/* --- a sheet's rules when it changes around them: conditional formatting's (s.cf) and data validation's (s.dv), both
   kept as ranges with formulas written for the first range's corner --- */
const RULE_KEYS = ['cf', 'dv'];
const ruleNorm = key => key === 'dv' ? normDv : normCf;
/* a rule on other ranges: its formulas are written again for the corner the first range has now */
function onRanges(rule, g) {
  const a = cfAnchor(rule);
  return { ...cfFormulas(rule, f => shiftFormula(f, g[0].r1 - a.r, g[0].c1 - a.c)), g };
}
/* rows or columns in or out: each range moves and grows with its cells, and the formulas follow, written again for the
   corner the first range has after it */
function spliceRules(s, key, axis, at, n) {
  if (!s[key].length) return;
  const R = axis === 'r', next = [];
  for (const rule of s[key]) {
    const g = rule.g.map(x => shiftRange(x, axis, at, n)).filter(Boolean);
    if (!g.length) continue;
    // the old cell that becomes the new corner: the old corner, or the first cell after what was taken out
    const first = rule.g.find(x => shiftRange(x, axis, at, n)), p = { r: first.r1, c: first.c1 }, k = R ? 'r' : 'c';
    if (n < 0 && p[k] >= at && p[k] < at - n) p[k] = at - n;
    const a = cfAnchor(rule), dr = p.r - a.r, dc = p.c - a.c;
    next.push({ ...cfFormulas(rule, f => spliceFormula(shiftFormula(f, dr, dc), s.name, s.name, axis, at, n)), g });
  }
  setProp(s, key, next);
}
/* a range without the cells of another: up to four pieces, the top one first */
function minusG(a, b) {
  if (!meets(a, b)) return [a];
  const out = [], r1 = Math.max(a.r1, b.r1), r2 = Math.min(a.r2, b.r2);
  if (a.r1 < b.r1) out.push({ r1: a.r1, c1: a.c1, r2: b.r1 - 1, c2: a.c2 });
  if (a.c1 < b.c1) out.push({ r1, c1: a.c1, r2, c2: b.c1 - 1 });
  if (a.c2 > b.c2) out.push({ r1, c1: b.c2 + 1, r2, c2: a.c2 });
  if (a.r2 > b.r2) out.push({ r1: b.r2 + 1, c1: a.c1, r2: a.r2, c2: a.c2 });
  return out;
}
/* ranges that touch along a whole side become one (A2 and A3:A9 are A2:A9), the top one first */
function joinG(list) {
  let out = list.map(g => ({ ...g }));
  for (let n = -1; n !== out.length;) {
    n = out.length;
    for (const [k1, k2, a1, a2] of [['c1', 'c2', 'r1', 'r2'], ['r1', 'r2', 'c1', 'c2']]) {
      out.sort((x, y) => x[k1] - y[k1] || x[k2] - y[k2] || x[a1] - y[a1]);
      const next = [];
      for (const g of out) { const p = next[next.length - 1]; if (p && p[k1] === g[k1] && p[k2] === g[k2] && g[a1] <= p[a2] + 1) p[a2] = Math.max(p[a2], g[a2]); else next.push(g); }
      out = next;
    }
  }
  return out.sort((x, y) => x.r1 - y.r1 || x.c1 - y.c1);
}
/* a list of rules without the cells in g; the same list when none of them is there */
function cutList(list, g) {
  if (!list.some(rule => rule.g.some(x => meets(x, g)))) return list;
  const next = [];
  for (const rule of list) {
    if (!rule.g.some(x => meets(x, g))) { next.push(rule); continue; }
    const parts = rule.g.flatMap(x => minusG(x, g)).slice(0, 50);
    if (parts.length) next.push(onRanges(rule, parts));
  }
  return next;
}
/* a sheet's rules without the cells in g (clearing them, or pasting over them) */
function cutRules(s, key, g) {
  const next = cutList(s[key], g);
  if (next !== s[key]) setProp(s, key, next);
}
/* each formula in one sheet's rules through fn (rows moved, sheets renamed or deleted elsewhere) */
function eachRuleOf(sh, key, fn) {
  if (!sh[key].length) return;
  let any = false;
  const next = sh[key].map(rule => ({ ...cfFormulas(rule, f => { const t = fn(f); if (t !== f) any = true; return t; }), g: rule.g }));
  if (any) setProp(sh, key, next);
}
/* the rules of copied cells g, cut to them, with their ranges from g's corner (rel) */
function packRules(s, key, g) {
  const out = [];
  for (const rule of s[key]) {
    const parts = rule.g.filter(x => meets(x, g)).map(x => ({ r1: Math.max(x.r1, g.r1), c1: Math.max(x.c1, g.c1), r2: Math.min(x.r2, g.r2), c2: Math.min(x.c2, g.c2) }));
    if (parts.length) out.push({ ...cfOut(onRanges(rule, parts)), rel: parts.map(p => [p.r1 - g.r1, p.c1 - g.c1, p.r2 - g.r1, p.c2 - g.c1]) });
  }
  return out;
}
/* and pasted at (r0, c0), where the copy's corner was (sr, sc) */
function unpackRules(key, list, r0, c0, sr, sc) {
  const out = [], norm = ruleNorm(key);
  for (const x of Array.isArray(list) ? list : []) {
    if (!Array.isArray(x.rel)) continue;
    const g = x.rel.map(([a, b, c, d]) => ({ r1: r0 + a, c1: c0 + b, r2: Math.min(MAXR - 1, r0 + c), c2: Math.min(MAXC - 1, c0 + d) })).filter(y => y.r1 < MAXR && y.c1 < MAXC);
    const rule = norm({ ...x, id: null, g });
    if (rule) out.push(cfFormulas(rule, f => shiftFormula(f, r0 - sr, c0 - sc)));
  }
  return out;
}
/* the fill handle (and Ctrl+D, Ctrl+R) over the cells of `to` beyond g: each takes the rules of the cell it is filled
   from, as in Excel. Conditional formatting is added to what the cells have; data validation takes its place */
function fillRules(s, key, g, to) {
  const vert = to.r1 < g.r1 || to.r2 > g.r2, a1 = vert ? 'r1' : 'c1', a2 = vert ? 'r2' : 'c2';
  const T = to[a2] > g[a2] ? { ...to, [a1]: g[a2] + 1 } : { ...to, [a2]: g[a1] - 1 }, per = g[a2] - g[a1] + 1, add = new Map();
  if (T[a1] > T[a2]) return;
  for (const rule of s[key]) {
    const rects = [];
    for (const x of rule.g) {
      if (!meets(x, g)) continue;
      const I = { r1: Math.max(x.r1, g.r1), c1: Math.max(x.c1, g.c1), r2: Math.min(x.r2, g.r2), c2: Math.min(x.c2, g.c2) };
      if (I[a1] === g[a1] && I[a2] === g[a2]) { rects.push({ ...I, [a1]: T[a1], [a2]: T[a2] }); continue; }
      // a part of g: the same part of every copy of g that the fill lays down
      for (let k = Math.floor((T[a1] - I[a2]) / per); k <= Math.ceil((T[a2] - I[a1]) / per) && rects.length < 200; k++) {
        const lo = Math.max(I[a1] + k * per, T[a1]), hi = Math.min(I[a2] + k * per, T[a2]);
        if (k && lo <= hi) rects.push({ ...I, [a1]: lo, [a2]: hi });
      }
    }
    if (rects.length) add.set(rule.id, rects);
  }
  if (key === 'dv') cutRules(s, key, T);
  if (add.size) setProp(s, key, s[key].map(rule => add.has(rule.id) ? onRanges(rule, joinG([...rule.g, ...add.get(rule.id)]).slice(0, 50)) : rule));
}

/* --- conditional formatting in Excel files. ExcelJS reads and writes only part of it, so the rules are written into
   the sheet's own part here (their looks as dxf in styles.xml, and Excel 2010's extra part for data bars and the star,
   triangle and box icons), and read from there --- */
const X14 = 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main', XM = 'http://schemas.microsoft.com/office/excel/2006/main';
const XL_OPS = { gt: 'greaterThan', ge: 'greaterThanOrEqual', lt: 'lessThan', le: 'lessThanOrEqual', eq: 'equal', ne: 'notEqual', bw: 'between', nb: 'notBetween' };
/* a file keeps a rule's formulas for the corner of the box around all its ranges (a cell that needn't be in any of
   them); here they are kept for the first range's corner. out: a rule as a file wants it; else a rule read from one */
function fileRule(rule, out) {
  const a = cfAnchor(rule), dr = Math.min(...rule.g.map(g => g.r1)) - a.r, dc = Math.min(...rule.g.map(g => g.c1)) - a.c;
  return dr || dc ? cfFormulas(rule, f => wrapShift(f, out ? dr : -dr, out ? dc : -dc)) : rule;
}
function wrapShift(f, dr, dc) {
  return !dr && !dc ? f : mapRefs(f, t => refText(t, { r1: wrapAt(t.r1, dr, t.a[0], MAXR), c1: wrapAt(t.c1, dc, t.a[1], MAXC), r2: wrapAt(t.r2, dr, t.a[2], MAXR), c2: wrapAt(t.c2, dc, t.a[3], MAXC) }));
}
/* the parts of a sheet that come after its conditional formatting and data validation, in the order a file keeps them */
const XL_AFTER_DV = ['<hyperlinks', '<printOptions', '<pageMargins', '<pageSetup', '<headerFooter', '<rowBreaks', '<colBreaks', '<customProperties', '<cellWatches', '<ignoredErrors',
  '<smartTags', '<drawing', '<legacyDrawing', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>'];
const XL_TEXT = { has: ['containsText', 'containsText'], not: ['notContainsText', 'notContains'], begins: ['beginsWith', 'beginsWith'], ends: ['endsWith', 'endsWith'] };
const XL_DATES = { yesterday: 'yesterday', today: 'today', tomorrow: 'tomorrow', last7: 'last7Days', lastweek: 'lastWeek', thisweek: 'thisWeek', nextweek: 'nextWeek', lastmonth: 'lastMonth', thismonth: 'thisMonth', nextmonth: 'nextMonth' };
const XL_VO = { min: 'min', max: 'max', num: 'num', pct: 'percent', pctl: 'percentile', formula: 'formula' };
const X14_ICONS = new Set(['3Stars', '3Triangles', '5Boxes']);
const argb = c => 'FF' + c.slice(1).toUpperCase();
const guid = () => '{' + [8, 4, 4, 4, 12].map((n, i) => Array.from({ length: n }, (_, j) => i === 2 && !j ? '4' : i === 3 && !j ? '8' : '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('')).join('-') + '}';
function dxfXml(st) {
  let font = '';
  if (st.b) font += '<b/>';
  if (st.i) font += '<i/>';
  if (st.s) font += '<strike/>';
  if (st.u) font += '<u/>';
  if (st.c) font += `<color rgb="${argb(st.c)}"/>`;
  const line = (n, b) => b ? `<${n} style="${b[1] === 'd' ? 'dashed' : b[1] === 'o' ? 'dotted' : 'thin'}"><color rgb="${argb(b.slice(2))}"/></${n}>` : '';
  const bd = line('left', st.bs) + line('right', st.be) + line('top', st.bt) + line('bottom', st.bb);
  return '<dxf>' + (font ? `<font>${font}</font>` : '') + (st.bg ? `<fill><patternFill><bgColor rgb="${argb(st.bg)}"/></patternFill></fill>` : '') + (bd ? `<border>${bd}</border>` : '') + '</dxf>';
}
const voVal = o => o.t === 'formula' ? xlFormula(o.v) : String(o.v);
const voMain = (o, bar) => o.t === 'auto' ? `<cfvo type="${bar === 'lo' ? 'min' : 'max'}"/>` : `<cfvo type="${XL_VO[o.t]}"${o.t === 'min' || o.t === 'max' ? '' : ` val="${esc(voVal(o))}"`}${o.gt ? ' gte="0"' : ''}/>`;
const voX14 = (o, bar) => o.t === 'auto' ? `<x14:cfvo type="${bar === 'lo' ? 'autoMin' : 'autoMax'}"/>` : o.t === 'min' || o.t === 'max' ? `<x14:cfvo type="${o.t}"/>` : `<x14:cfvo type="${XL_VO[o.t]}"${o.gt ? ' gte="0"' : ''}><xm:f>${esc(voVal(o))}</xm:f></x14:cfvo>`;
/* one rule as Excel writes it: the part in the sheet (main) and the part in its extLst (ext) */
function cfRuleXml(rule, prio, tl, dxfOf) {
  const at = `priority="${prio}"${rule.stop ? ' stopIfTrue="1"' : ''}`, dx = () => ` dxfId="${dxfOf(rule.st || {})}"`, fx = f => `<formula>${esc(xlFormula(f))}</formula>`;
  const q = t => '"' + t.replace(/"/g, '""') + '"';
  switch (rule.k) {
    case 'cell': return { main: `<cfRule type="cellIs"${dx()} ${at} operator="${XL_OPS[rule.op]}">${fx(rule.a)}${rule.b != null ? fx(rule.b) : ''}</cfRule>` };
    case 'text': {
      const [type, op] = XL_TEXT[rule.op], t = rule.t;
      const f = rule.op === 'has' ? `NOT(ISERROR(SEARCH(${q(t)},${tl})))` : rule.op === 'not' ? `ISERROR(SEARCH(${q(t)},${tl}))` : rule.op === 'begins' ? `LEFT(${tl},LEN(${q(t)}))=${q(t)}` : `RIGHT(${tl},LEN(${q(t)}))=${q(t)}`;
      return { main: `<cfRule type="${type}"${dx()} ${at} operator="${op}" text="${esc(t)}">${fx(f)}</cfRule>` };
    }
    case 'date': {
      const F = { today: `FLOOR(${tl},1)=TODAY()`, yesterday: `FLOOR(${tl},1)=TODAY()-1`, tomorrow: `FLOOR(${tl},1)=TODAY()+1`, last7: `AND(TODAY()-FLOOR(${tl},1)<=6,FLOOR(${tl},1)<=TODAY())`,
        thisweek: `AND(TODAY()-ROUNDDOWN(${tl},0)<=WEEKDAY(TODAY())-1,ROUNDDOWN(${tl},0)-TODAY()<=7-WEEKDAY(TODAY()))`, lastweek: `AND(TODAY()-ROUNDDOWN(${tl},0)>=(WEEKDAY(TODAY())),TODAY()-ROUNDDOWN(${tl},0)<(WEEKDAY(TODAY())+7))`,
        nextweek: `AND(ROUNDDOWN(${tl},0)-TODAY()>(7-WEEKDAY(TODAY())),ROUNDDOWN(${tl},0)-TODAY()<(15-WEEKDAY(TODAY())))`, thismonth: `AND(MONTH(${tl})=MONTH(TODAY()),YEAR(${tl})=YEAR(TODAY()))`,
        lastmonth: `AND(MONTH(${tl})=MONTH(EDATE(TODAY(),0-1)),YEAR(${tl})=YEAR(EDATE(TODAY(),0-1)))`, nextmonth: `AND(MONTH(${tl})=MONTH(EDATE(TODAY(),0+1)),YEAR(${tl})=YEAR(EDATE(TODAY(),0+1)))` }[rule.p];
      return { main: `<cfRule type="timePeriod"${dx()} ${at} timePeriod="${XL_DATES[rule.p]}">${fx(F)}</cfRule>` };
    }
    case 'blank': return { main: `<cfRule type="containsBlanks"${dx()} ${at}>${fx(`LEN(TRIM(${tl}))=0`)}</cfRule>` };
    case 'noblank': return { main: `<cfRule type="notContainsBlanks"${dx()} ${at}>${fx(`LEN(TRIM(${tl}))>0`)}</cfRule>` };
    case 'err': return { main: `<cfRule type="containsErrors"${dx()} ${at}>${fx(`ISERROR(${tl})`)}</cfRule>` };
    case 'noerr': return { main: `<cfRule type="notContainsErrors"${dx()} ${at}>${fx(`NOT(ISERROR(${tl}))`)}</cfRule>` };
    case 'top': return { main: `<cfRule type="top10"${dx()} ${at}${rule.pct ? ' percent="1"' : ''}${rule.bot ? ' bottom="1"' : ''} rank="${rule.n}"/>` };
    case 'avg': return { main: `<cfRule type="aboveAverage"${dx()} ${at}${rule.below ? ' aboveAverage="0"' : ''}${rule.eq ? ' equalAverage="1"' : ''}/>` };
    case 'dup': return { main: `<cfRule type="duplicateValues"${dx()} ${at}/>` };
    case 'uniq': return { main: `<cfRule type="uniqueValues"${dx()} ${at}/>` };
    case 'expr': return { main: `<cfRule type="expression"${dx()} ${at}>${fx(rule.f)}</cfRule>` };
    case 'bar': {
      const id = guid(), c = argb(rule.c);
      return { main: `<cfRule type="dataBar" ${at}><dataBar${rule.only ? ' showValue="0"' : ''}>${voMain(rule.lo, 'lo')}${voMain(rule.hi, 'hi')}<color rgb="${c}"/></dataBar><extLst><ext uri="{B025F937-C7B1-47D3-B67F-A62EFF666E3E}" xmlns:x14="${X14}"><x14:id>${id}</x14:id></ext></extLst></cfRule>`,
        ext: `<x14:cfRule type="dataBar" id="${id}"><x14:dataBar minLength="0" maxLength="100"${rule.solid ? ' gradient="0"' : ' border="1"'} negativeBarColorSameAsPositive="${rule.noaxis ? 1 : 0}"${rule.solid ? '' : ' negativeBarBorderColorSameAsPositive="0"'} axisPosition="${rule.noaxis ? 'none' : 'automatic'}">${voX14(rule.lo, 'lo')}${voX14(rule.hi, 'hi')}${rule.solid ? '' : `<x14:borderColor rgb="${c}"/>`}<x14:negativeFillColor rgb="FFFF0000"/>${rule.solid ? '' : '<x14:negativeBorderColor rgb="FFFF0000"/>'}<x14:axisColor rgb="FF000000"/></x14:dataBar></x14:cfRule>` };
    }
    case 'scale': return { main: `<cfRule type="colorScale" ${at}><colorScale>${rule.cs.map(o => voMain(o)).join('')}${rule.cs.map(o => `<color rgb="${argb(o.c)}"/>`).join('')}</colorScale></cfRule>` };
    case 'icons': {
      const attrs = `iconSet="${rule.set}"${rule.rev ? ' reverse="1"' : ''}${rule.only ? ' showValue="0"' : ''}`, th = [{ t: 'pct', v: 0 }, ...rule.th];
      if (X14_ICONS.has(rule.set)) return { ext: `<x14:cfRule type="iconSet" ${at} id="${guid()}"><x14:iconSet ${attrs}>${th.map(o => voX14(o)).join('')}</x14:iconSet></x14:cfRule>` };
      return { main: `<cfRule type="iconSet" ${at}><iconSet ${attrs}>${th.map(o => voMain(o)).join('')}</iconSet></cfRule>` };
    }
  }
  return {};
}
async function addXlsxCf(buf) {
  const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf), dxfs = [];
  const dxfOf = st => { const x = dxfXml(st); let i = dxfs.indexOf(x); if (i < 0) { dxfs.push(x); i = dxfs.length - 1; } return i; };
  let prio = 0;
  for (let i = 0; i < WB.sheets.length; i++) {
    const s = WB.sheets[i], sp = `xl/worksheets/sheet${i + 1}.xml`, sf = zip.file(sp);
    if (!s.cf.length || !sf) continue;
    const main = [], ext = [];
    for (const rule of s.cf) {
      // tl: the cell the file's formulas are written for (see fileRule)
      const sq = sqrefOf(rule), tl = A1(Math.min(...rule.g.map(g => g.r1)), Math.min(...rule.g.map(g => g.c1))), x = cfRuleXml(fileRule(rule, true), ++prio, tl, dxfOf);
      if (x.main) main.push(`<conditionalFormatting sqref="${sq}">${x.main}</conditionalFormatting>`);
      if (x.ext) ext.push(`<x14:conditionalFormatting xmlns:xm="${XM}">${x.ext}<xm:sqref>${sq}</xm:sqref></x14:conditionalFormatting>`);
    }
    let sx = await sf.async('string');
    // Excel 2010's part goes into the sheet's own extLst (its last element) before the rules bring extLst of their own
    if (ext.length) {
      const block = `<ext uri="{78C0D931-6437-407d-A8EE-F0AAD7539E65}" xmlns:x14="${X14}"><x14:conditionalFormattings>${ext.join('')}</x14:conditionalFormattings></ext>`, own = sx.lastIndexOf('<extLst>');
      sx = own >= 0 ? sx.slice(0, own + 8) + block + sx.slice(own + 8) : sx.replace('</worksheet>', `<extLst>${block}</extLst></worksheet>`);
    }
    // the rules come after the merged cells and before dataValidations and all that follows it
    const pos = Math.min(...['<dataValidations', ...XL_AFTER_DV].map(t => sx.indexOf(t)).filter(p => p >= 0));
    sx = sx.slice(0, pos) + main.join('') + sx.slice(pos);
    zip.file(sp, sx);
  }
  if (dxfs.length) {
    let sty = await zip.file('xl/styles.xml').async('string');
    const block = `<dxfs count="${dxfs.length}">${dxfs.join('')}</dxfs>`;
    if (/<dxfs\b[^>]*\/>/.test(sty)) sty = sty.replace(/<dxfs\b[^>]*\/>/, block);
    else if (/<dxfs\b[\s\S]*?<\/dxfs>/.test(sty)) sty = sty.replace(/<dxfs\b[\s\S]*?<\/dxfs>/, block);
    else sty = sty.replace('</cellStyles>', '</cellStyles>' + block);
    zip.file('xl/styles.xml', sty);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/* the rules of an Excel file, sheet by sheet (by the sheet's name in the file), and how many were of kinds that aren't here */
async function readXlsxCf(buf, theme) {
  const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf), dp = new DOMParser(), out = new Map();
  let lost = 0;
  const xml = async p => { const f = zip.file(p); return f ? dp.parseFromString(await f.async('string'), 'application/xml') : null; };
  const wbx = await xml('xl/workbook.xml'), wr = await xml(relsOf('xl/workbook.xml')), sty = await xml('xl/styles.xml');
  if (!wbx || !wr) return { out, lost };
  const rels = new Map(xdesc(wr, 'Relationship').map(r => [xat(r, 'Id'), partPath('xl/workbook.xml', xat(r, 'Target') || '')]));
  const color = e => e ? xlColor({ argb: xat(e, 'rgb') || undefined, theme: e.hasAttribute('theme') ? +xat(e, 'theme') : undefined, tint: +xat(e, 'tint') || 0, indexed: e.hasAttribute('indexed') ? +xat(e, 'indexed') : undefined }, theme) : null;
  const dxfs = sty ? xkids(xdesc(sty, 'dxfs')[0], 'dxf').map(d => {
    const st = {}, f = xkid(d, 'font'), fill = xkid(d, 'fill', 'patternFill');
    if (f) {
      const on = n => { const e = xkid(f, n); return !!e && xat(e, 'val') !== '0' && xat(e, 'val') !== 'false'; };
      if (on('b')) st.b = true; if (on('i')) st.i = true; if (on('strike')) st.s = true;
      const u = xkid(f, 'u'); if (u && xat(u, 'val') !== 'none') st.u = true;
      const c = color(xkid(f, 'color')); if (c) st.c = c;
    }
    if (fill && xat(fill, 'patternType') !== 'none') { const c = color(xkid(fill, 'bgColor')) || color(xkid(fill, 'fgColor')); if (c) st.bg = c; }
    const bd = xkid(d, 'border');
    if (bd) for (const [n, k] of [['left', 'bs'], ['right', 'be'], ['top', 'bt'], ['bottom', 'bb']]) {
      const e = xkid(bd, n), style = e && xat(e, 'style');
      if (style && style !== 'none') st[k] = '1' + (/dash/i.test(style) ? 'd' : /dot|hair/i.test(style) ? 'o' : 's') + (color(xkid(e, 'color')) || '#000000');
    }
    return st;
  }) : [];
  const fromF = e => e ? fromXl(e.textContent.trim().replace(/^=/, '')) : null;
  const vo = (e, x14) => {
    const t = xat(e, 'type'), v = x14 ? (xkid(e, 'f') || {}).textContent : xat(e, 'val'), gt = xat(e, 'gte') === '0';
    const k = t === 'autoMin' || t === 'autoMax' ? 'auto' : Object.keys(XL_VO).find(x => XL_VO[x] === t) || 'min';
    const o = { t: k };
    if (k === 'formula') o.v = fromXl(String(v || '').replace(/^=/, ''));
    else if (k === 'num' || k === 'pct' || k === 'pctl') { const n = +v; if (Number.isFinite(n)) o.v = n; else { o.t = 'formula'; o.v = fromXl(String(v || '0')); } }
    if (gt) o.gt = true;
    return o;
  };
  for (const sh of xdesc(wbx, 'sheet')) {
    const rid = [...sh.attributes].find(a => a.localName === 'id' && /relationships/.test(a.namespaceURI || '')), path = rid && rels.get(rid.value), doc = path && await xml(path);
    if (!doc) continue;
    const list = [], ext = new Map();
    // Excel 2010's part: data bars' details by id, and rules that live only there
    for (const cf of xdesc(doc, 'conditionalFormatting').filter(e => e.namespaceURI === X14)) {
      const sq = (xkid(cf, 'sqref') || {}).textContent || '';
      for (const r of xkids(cf, 'cfRule')) {
        const id = xat(r, 'id');
        if (id) ext.set(id, r);
        if (xat(r, 'type') === 'iconSet' && ![...xdesc(doc, 'id')].some(e => e.textContent === id)) {
          const is = xkid(r, 'iconSet');
          if (!is || xat(is, 'custom') === '1') { lost++; continue; }
          const th = xkids(is, 'cfvo').map(e => vo(e, true));
          list.push({ p: +xat(r, 'priority') || 1e6, x: { k: 'icons', ref: sq, set: xat(is, 'iconSet') || '3TrafficLights1', th: th.slice(1), rev: xat(is, 'reverse') === '1', only: xat(is, 'showValue') === '0' } });
        }
      }
    }
    for (const cf of xdesc(doc, 'conditionalFormatting').filter(e => e.namespaceURI !== X14)) {
      const sq = xat(cf, 'sqref') || '';
      for (const r of xkids(cf, 'cfRule')) {
        const t = xat(r, 'type'), op = xat(r, 'operator'), fs = xkids(r, 'formula'), st = dxfs[+xat(r, 'dxfId')] || {};
        let x = null;
        if (t === 'cellIs') { const k = Object.keys(XL_OPS).find(o => XL_OPS[o] === op); if (k) x = { k: 'cell', op: k, a: fromF(fs[0]), b: fromF(fs[1]) }; }
        else if (XL_TEXT_T[t]) x = { k: 'text', op: XL_TEXT_T[t], t: xat(r, 'text') ?? textOfRule(fromF(fs[0])) };
        else if (t === 'timePeriod') { const p = Object.keys(XL_DATES).find(d => XL_DATES[d] === xat(r, 'timePeriod')); if (p) x = { k: 'date', p }; }
        else if (t === 'containsBlanks') x = { k: 'blank' };
        else if (t === 'notContainsBlanks') x = { k: 'noblank' };
        else if (t === 'containsErrors') x = { k: 'err' };
        else if (t === 'notContainsErrors') x = { k: 'noerr' };
        else if (t === 'top10') x = { k: 'top', n: xnum(r, 'rank', 10), pct: xat(r, 'percent') === '1', bot: xat(r, 'bottom') === '1' };
        else if (t === 'aboveAverage' && !r.hasAttribute('stdDev')) x = { k: 'avg', below: xat(r, 'aboveAverage') === '0', eq: xat(r, 'equalAverage') === '1' };
        else if (t === 'duplicateValues') x = { k: 'dup' };
        else if (t === 'uniqueValues') x = { k: 'uniq' };
        else if (t === 'expression') x = { k: 'expr', f: fromF(fs[0]) };
        else if (t === 'dataBar') {
          const db = xkid(r, 'dataBar'), vs = xkids(db, 'cfvo'), idEl = xdesc(r, 'id')[0], e14 = idEl && ext.get(idEl.textContent), d14 = e14 && xkid(e14, 'dataBar');
          const v14 = d14 ? xkids(d14, 'cfvo').map(e => vo(e, true)) : null;
          x = { k: 'bar', c: color(xkid(db, 'color')) || '#638ec6', lo: v14 ? v14[0] : vs[0] && vo(vs[0]), hi: v14 ? v14[1] : vs[1] && vo(vs[1]), solid: !!d14 && xat(d14, 'gradient') === '0', only: xat(db, 'showValue') === '0',
            noaxis: !d14 || xat(d14, 'axisPosition') === 'none' };
          if (!v14) { if (x.lo && x.lo.t === 'min') x.lo = { t: 'auto' }; if (x.hi && x.hi.t === 'max') x.hi = { t: 'auto' }; }
        }
        else if (t === 'colorScale') { const s2 = xkid(r, 'colorScale'), vs = xkids(s2, 'cfvo').map(e => vo(e)), cs = xkids(s2, 'color').map(color); x = { k: 'scale', cs: vs.map((o, i) => ({ ...o, c: cs[i] || '#ffffff' })) }; }
        else if (t === 'iconSet') { const is = xkid(r, 'iconSet'), th = xkids(is, 'cfvo').map(e => vo(e)); x = { k: 'icons', set: xat(is, 'iconSet') || '3TrafficLights1', th: th.slice(1), rev: xat(is, 'reverse') === '1', only: xat(is, 'showValue') === '0' }; }
        if (!x) { lost++; continue; }
        list.push({ p: +xat(r, 'priority') || 1e6, x: { ...x, ref: sq, st, stop: xat(r, 'stopIfTrue') === '1' } });
      }
    }
    list.sort((a, b) => a.p - b.p);
    out.set(xat(sh, 'name'), list.map(y => y.x));
  }
  return { out, lost };
}
const XL_TEXT_T = { containsText: 'has', notContainsText: 'not', beginsWith: 'begins', endsWith: 'ends' };
/* a text rule without its text written out: the text inside SEARCH("..." or LEN("..." */
const textOfRule = f => { const m = f && /"((?:[^"]|"")*)"/.exec(f); return m ? m[1].replace(/""/g, '"') : ''; };
/* the file's rules onto its sheets; the kinds that aren't here are counted for the report */
async function importCf(buf, nb, xlNames, rep, theme) {
  let got;
  try { got = await readXlsxCf(buf, theme); } catch (e) { console.warn(e); rep.set('cond', (rep.get('cond') || 0) + 1); return; }
  for (const [name, list] of got.out) {
    const s = nb.sheets[xlNames.indexOf(name)];
    if (!s) continue;
    for (const x of list) { const r = normCf(x); if (r && s.cf.length < 500) s.cf.push(fileRule(r, false)); else got.lost++; }
  }
  if (got.lost) rep.set('cond', (rep.get('cond') || 0) + got.lost);
}

/* --- conditional formatting on screen: the Home tab's menu (as Excel's), quick rules, the rule editor and the rules
   manager. A dialog shows its rule on the sheet while it is open (s._cfp) --- */
const CF_BARS = [['#638ec6', N_('כחול')], ['#63c384', N_('ירוק')], ['#ff555a', N_('אדום')], ['#ffb628', N_('כתום')], ['#008aef', N_('תכלת')], ['#d6007b', N_('סגול')]];
const CF_SCALES = [['#f8696b', '#ffeb84', '#63be7b'], ['#63be7b', '#ffeb84', '#f8696b'], ['#f8696b', '#fcfcff', '#63be7b'], ['#63be7b', '#fcfcff', '#f8696b'], ['#f8696b', '#fcfcff', '#5a8ac6'], ['#5a8ac6', '#fcfcff', '#f8696b'],
  ['#f8696b', '#fcfcff'], ['#fcfcff', '#f8696b'], ['#fcfcff', '#63be7b'], ['#63be7b', '#fcfcff'], ['#ffef9c', '#63be7b'], ['#63be7b', '#ffef9c']];   // each from the lowest values' color to the highest
const CF_ICON_GROUPS = [[N_('כיווניים'), ['3Arrows', '3ArrowsGray', '3Triangles', '4Arrows', '4ArrowsGray', '5Arrows', '5ArrowsGray']], [N_('צורות'), ['3TrafficLights1', '3TrafficLights2', '3Signs', '4TrafficLights', '4RedToBlack']],
  [N_('סימנים'), ['3Symbols', '3Symbols2', '3Flags']], [N_('דירוגים'), ['3Stars', '4Rating', '5Quarters', '5Rating', '5Boxes']]];
const CF_DATE_NAMES = { yesterday: N_('אתמול'), today: N_('היום'), tomorrow: N_('מחר'), last7: N_('בשבעת הימים האחרונים'), lastweek: N_('בשבוע שעבר'), thisweek: N_('השבוע'), nextweek: N_('בשבוע הבא'),
  lastmonth: N_('בחודש שעבר'), thismonth: N_('החודש'), nextmonth: N_('בחודש הבא') };
const CF_OP_NAMES = { gt: N_('גדול מ'), ge: N_('גדול או שווה ל'), lt: N_('קטן מ'), le: N_('קטן או שווה ל'), eq: N_('שווה ל'), ne: N_('שונה מ'), bw: N_('בין'), nb: N_('לא בין') };
const CF_TEXT_NAMES = { has: N_('מכיל'), not: N_('לא מכיל'), begins: N_('מתחיל ב'), ends: N_('מסתיים ב') };
const CF_VO_NAMES = { auto: N_('אוטומטי'), min: N_('הערך הכי נמוך'), max: N_('הערך הכי גבוה'), num: N_('מספר'), pct: N_('אחוז'), pctl: N_('אחוזון'), formula: N_('נוסחה') };
/* what was typed as a rule's value: a formula (=B2), a number (or a date, a percent...), or text, kept in quotes */
function cfValIn(t) {
  t = String(t ?? '').trim();
  if (!t) return null;
  if (t[0] === '=') { const f = closeBrackets(t.slice(1)); return astOf(f) ? tidyFormula(f) : null; }
  const p = parseInput(t);
  if (p && p.f == null && typeof p.v === 'number') return String(p.v);
  if (p && typeof p.v === 'boolean') return p.v ? 'TRUE' : 'FALSE';
  return '"' + t.replace(/"/g, '""') + '"';
}
/* and a rule's value shown in a dialog */
function cfValOut(f) {
  if (f == null) return '';
  const a = astOf(f);
  if (a && a.t === 'num') return genText(a.v, 15);
  if (a && a.t === 'neg' && a.neg && a.a.t === 'num') return '-' + genText(a.a.v, 15);
  if (a && a.t === 'str') return a.v;
  return '=' + f;
}
const CF_TEXT_DESC = { has: N_('טקסט שמכיל "{0}"'), not: N_('טקסט שלא מכיל "{0}"'), begins: N_('טקסט שמתחיל ב-"{0}"'), ends: N_('טקסט שמסתיים ב-"{0}"') };
const CF_TOP_DESC = { top: N_('{0} העליונים'), topPct: N_('{0}% העליונים'), bot: N_('{0} התחתונים'), botPct: N_('{0}% התחתונים') };
/* a rule in words, for the manager */
function cfDesc(r) {
  // values and formulas kept apart from the words around them, so > and - don't turn around in Hebrew
  const v = f => '\u2068' + cfValOut(f) + '\u2069';
  switch (r.k) {
    case 'cell': return r.op === 'bw' ? T('ערך התא בין {0} ל-{1}', v(r.a), v(r.b)) : r.op === 'nb' ? T('ערך התא לא בין {0} ל-{1}', v(r.a), v(r.b))
      : T('ערך התא {0}', '\u2066' + { gt: '>', ge: '>=', lt: '<', le: '<=', eq: '=', ne: '<>' }[r.op] + ' ' + cfValOut(r.a) + '\u2069');
    case 'text': return T(CF_TEXT_DESC[r.op], r.t);
    case 'date': return T('תאריך: {0}', T(CF_DATE_NAMES[r.p]));
    case 'blank': return T('תאים ריקים');
    case 'noblank': return T('תאים שאינם ריקים');
    case 'err': return T('שגיאות');
    case 'noerr': return T('בלי שגיאות');
    case 'top': return T(CF_TOP_DESC[(r.bot ? 'bot' : 'top') + (r.pct ? 'Pct' : '')], fmt(r.n));
    case 'avg': return T(r.below ? (r.eq ? 'שווה לממוצע או מתחתיו' : 'מתחת לממוצע') : (r.eq ? 'שווה לממוצע או מעליו' : 'מעל הממוצע'));
    case 'dup': return T('ערכים כפולים');
    case 'uniq': return T('ערכים ייחודיים');
    case 'expr': return T('נוסחה: {0}', '\u2066=' + r.f + '\u2069');
    case 'bar': return T('פס נתונים');
    case 'scale': return T('סולם צבעים');
    case 'icons': return T('ערכת סמלים');
  }
  return '';
}
/* a small picture of a rule's look: its colors on sample text, or its bar, scale or icons */
function cfSwatch(r) {
  const box = h('span', { class: 'sh-cfsw' });
  if (r.k === 'bar') { const b = h('span', { class: 'sh-cfsw-bar' }); b.style.background = r.solid ? r.c : `linear-gradient(to right, ${r.c}, ${mixColor(r.c, '#ffffff', 0.88)})`; if (!r.solid) b.style.borderColor = r.c; box.append(b); }
  else if (r.k === 'scale') box.style.background = `linear-gradient(to right, ${r.cs.map(o => o.c).join(', ')})`;
  else if (r.k === 'icons') { box.classList.add('ic'); box.innerHTML = [...Array(ICON_SETS[r.set]).keys()].reverse().map(i => iconSvg(r.set, i, 14)).join(''); }
  else {
    box.textContent = 'AaBb אבג';
    lookOn(box, r.st || {});
  }
  return box;
}
function cfPreview(rule) { if (!WS) return; WS._cfp = rule ? normCf(cfOut(rule)) || null : null; render(); }
/* a new rule on the chosen cells, on top of the others (Excel puts the newest first) */
function addCf(x) {
  const g = selG(), rule = normCf({ ...x, g: [g] });
  if (!rule) return;
  edit(() => setProp(WS, 'cf', [rule, ...WS.cf].slice(0, 500)));
}
const MORE = UI_DIR === 'rtl' ? '◂' : '▸';   // a menu item that opens another
function cfMenu(anchor) {
  if (ED.on && !endEdit(true)) return;
  menuAt(anchor, T('עיצוב מותנה'), [
    { ic: 'format_color_fill', label: T('כללים להדגשת תאים'), run: () => cfHlMenu(anchor), keep: true, key: MORE },
    { ic: 'arrow_upward', label: T('כללים לערכים עליונים ותחתונים'), run: () => cfTopMenu(anchor), keep: true, key: MORE },
    { ic: 'bar_chart', label: T('פסי נתונים'), run: () => cfBarGallery(anchor), keep: true, key: MORE },
    { ic: 'palette', label: T('סולמות צבעים'), run: () => cfScaleGallery(anchor), keep: true, key: MORE },
    { ic: 'star', label: T('ערכות סמלים'), run: () => cfIconGallery(anchor), keep: true, key: MORE },
    '-',
    { ic: 'add', label: T('כלל חדש…'), run: () => cfEditor(null), keep: true },
    { ic: 'ink_eraser', label: T('ניקוי הכללים מהתאים שנבחרו'), run: () => edit(() => cutRules(WS, 'cf', selG())), off: !WS.cf.some(r => r.g.some(x => meets(x, selG()))) },
    { ic: 'delete_sweep', label: T('ניקוי הכללים מכל הגיליון'), run: () => edit(() => setProp(WS, 'cf', [])), off: !WS.cf.length },
    { ic: 'edit', label: T('ניהול כללים…'), run: () => cfManager(), keep: true },
  ]);
}
function cfHlMenu(anchor) {
  const q = k => () => cfQuick(k);
  menuAt(anchor, T('כללים להדגשת תאים'), [
    { ic: 'arrow_upward', label: T('גדול מ…'), run: q('gt'), keep: true }, { ic: 'arrow_downward', label: T('קטן מ…'), run: q('lt'), keep: true },
    { ic: 'height', label: T('בין…'), run: q('bw'), keep: true }, { ic: 'swap_horiz', label: T('שווה ל…'), run: q('eq'), keep: true },
    { ic: 'text_fields', label: T('טקסט שמכיל…'), run: q('text'), keep: true }, { ic: 'calendar_today', label: T('תאריך שחל…'), run: q('date'), keep: true },
    { ic: 'content_copy', label: T('ערכים כפולים…'), run: q('dup'), keep: true },
    '-', { ic: 'add', label: T('עוד כללים…'), run: () => cfEditor({ k: 'cell' }), keep: true },
  ]);
}
function cfTopMenu(anchor) {
  const q = k => () => cfQuick(k);
  menuAt(anchor, T('כללים לערכים עליונים ותחתונים'), [
    { ic: 'arrow_upward', label: T('10 העליונים…'), run: q('top'), keep: true }, { ic: 'percent', label: T('10% העליונים…'), run: q('topPct'), keep: true },
    { ic: 'arrow_downward', label: T('10 התחתונים…'), run: q('bot'), keep: true }, { ic: 'percent', label: T('10% התחתונים…'), run: q('botPct'), keep: true },
    { ic: 'vertical_align_top', label: T('מעל הממוצע…'), run: q('above'), keep: true }, { ic: 'vertical_align_bottom', label: T('מתחת לממוצע…'), run: q('below'), keep: true },
    '-', { ic: 'add', label: T('עוד כללים…'), run: () => cfEditor({ k: 'top' }), keep: true },
  ]);
}
/* a gallery of ready looks: clicking one puts that rule on the chosen cells */
function cfGallery(anchor, title, groups, more) {
  const body = h('div', { class: 'sh-cfgal' }, h('div', { class: 'pop-t', text: title }));
  for (const [name, items] of groups) {
    if (name) body.append(h('div', { class: 'sh-cfgal-t', text: name }));
    body.append(h('div', { class: 'sh-cfgal-g' + (items.length && items[0][2].k === 'icons' ? ' wide' : '') }, items.map(([el, label, x]) => h('button', { type: 'button', class: 'sh-cfgal-b', title: label, 'aria-label': label, onclick: () => { closePopover(); addCf(x); focusGrid(); } }, el))));
  }
  body.append(h('button', { type: 'button', class: 'mi', onclick: () => { closePopover(); more(); } }, icon('add'), h('span', { text: T('עוד כללים…') })));
  openPop(anchor, body);
}
function barPic(c, solid) {
  const b = h('span', { class: 'sh-cfgal-pic bars' });
  for (const w of [90, 60, 35]) { const x = h('i'); x.style.width = w + '%'; x.style.background = solid ? c : `linear-gradient(to right, ${c}, ${mixColor(c, '#ffffff', 0.88)})`; if (!solid) x.style.borderColor = c; b.append(x); }
  return b;
}
function cfBarGallery(anchor) {
  const row = solid => CF_BARS.map(([c, n]) => [barPic(c, solid), T('פס נתונים: {0}', T(n)), { k: 'bar', c, solid, lo: { t: 'auto' }, hi: { t: 'auto' } }]);
  cfGallery(anchor, T('פסי נתונים'), [[T('מילוי מדורג'), row(false)], [T('מילוי אחיד'), row(true)]], () => cfEditor({ k: 'bar' }));
}
function cfScaleGallery(anchor) {
  const items = CF_SCALES.map(cs => {
    const pic = h('span', { class: 'sh-cfgal-pic scale' }, [...cs].reverse().map(c => { const x = h('i'); x.style.background = c; return x; }));
    const stops = cs.length === 3 ? [{ t: 'min', c: cs[0] }, { t: 'pctl', v: 50, c: cs[1] }, { t: 'max', c: cs[2] }] : [{ t: 'min', c: cs[0] }, { t: 'max', c: cs[1] }];
    return [pic, T('סולם צבעים'), { k: 'scale', cs: stops }];
  });
  cfGallery(anchor, T('סולמות צבעים'), [[null, items]], () => cfEditor({ k: 'scale', cs: [{ t: 'min', c: '#f8696b' }, { t: 'pctl', v: 50, c: '#ffeb84' }, { t: 'max', c: '#63be7b' }] }));
}
const iconsPic = set => { const p = h('span', { class: 'sh-cfgal-pic icons' }); p.innerHTML = [...Array(ICON_SETS[set]).keys()].reverse().map(i => iconSvg(set, i, 16)).join(''); return p; };
function cfIconGallery(anchor) {
  cfGallery(anchor, T('ערכות סמלים'), CF_ICON_GROUPS.map(([name, sets]) => [T(name), sets.map(set => [iconsPic(set), T('ערכת סמלים'), { k: 'icons', set }])]), () => cfEditor({ k: 'icons', set: '3Arrows' }));
}

/* --- a rule's look: fill, text color, bold, italic, underline, strikethrough, borders --- */
function lookOn(e, st) {
  const rtl = WS.dir === 'rtl', side = { bt: 'borderTop', bb: 'borderBottom', bs: rtl ? 'borderRight' : 'borderLeft', be: rtl ? 'borderLeft' : 'borderRight' };
  Object.assign(e.style, { background: st.bg || '', color: st.c || '', fontWeight: st.b ? '700' : '', fontStyle: st.i ? 'italic' : '', textDecoration: [st.u && 'underline', st.s && 'line-through'].filter(Boolean).join(' ') });
  for (const k of BD_SIDES) e.style[side[k]] = st[k] ? `2px ${BD_CSS[st[k][1]] || 'solid'} ${st[k].slice(2)}` : '';
}
/* the borders a rule draws on each cell it changes: the four sides or one of them, a thin line of a kind and a color */
function cfBorderMenu(anchor, st, done) {
  const rtl = WS.dir === 'rtl', p = Object.assign({ c: '#000000', k: '1s' }, PREFS.shCfBd || {}), spec = p.k + p.c;
  const set = sides => () => { for (const k of BD_SIDES) if (!sides || sides.includes(k)) { if (sides) st[k] = spec; else delete st[k]; } closePopover(); done(); };
  const kinds = [['1s', T('דק')], ['1d', T('מקווקו')], ['1o', T('מנוקד')]];
  const again = () => { closePopover(); cfBorderMenu(anchor, st, done); };
  const styleRow = h('div', { class: 'sh-bdrow' }, kinds.map(([k, name]) => h('button', { class: 'opt' + (p.k === k ? ' on' : ''), type: 'button', title: name, 'aria-label': name,
    onclick: () => { PREFS.shCfBd = { ...p, k }; savePrefs(); again(); } }, h('i', { style: { borderTopWidth: '1.5px', borderTopStyle: BD_CSS[k[1]] } }))));
  const colorRow = h('div', { class: 'sh-bdrow' }, deckSwatches(p.c, TEXT_COLORS.slice(0, 11), c => { PREFS.shCfBd = { ...p, c: c || '#000000' }; savePrefs(); again(); }, null));
  openPop(anchor, h('div', { class: 'menu' }, h('div', { class: 'pop-t', text: T('גבולות') }), menuItems([
    { ic: 'border_all', label: T('כל הגבולות'), run: set(BD_SIDES) }, { ic: 'border_bottom', label: T('גבול תחתון'), run: set(['bb']) }, { ic: 'border_top', label: T('גבול עליון'), run: set(['bt']) },
    { ic: 'border_right', label: T('גבול ימני'), run: set([rtl ? 'bs' : 'be']) }, { ic: 'border_left', label: T('גבול שמאלי'), run: set([rtl ? 'be' : 'bs']) }, { ic: 'border_clear', label: T('בלי גבולות'), run: set(null) },
  ]), h('div', { class: 'pop-t sub', text: T('סוג קו') }), styleRow, h('div', { class: 'pop-t sub', text: T('צבע קו') }), colorRow));
}
function cfLookPicker(st, onChange) {
  const box = h('div', { class: 'sh-cflook' }), prev = h('span', { class: 'sh-cfsw big' });
  const draw = () => {
    lookOn(prev, st);
    for (const [k, b] of btns) b.classList.toggle('on', !!st[k]);
    onChange(st);
  };
  prev.textContent = 'AaBbCc אבג 123';
  const btns = [['b', 'format_bold'], ['i', 'format_italic'], ['u', 'format_underlined'], ['s', 'strikethrough_s']].map(([k, ic]) => [k, h('button', { type: 'button', class: 'rb', 'aria-label': k, onclick: () => { st[k] = !st[k] || undefined; draw(); } }, icon(ic))]);
  const pick = (kind, anchor) => openPop(anchor, h('div', {}, h('div', { class: 'pop-t', text: kind === 'bg' ? T('מילוי') : T('צבע הטקסט') }),
    deckSwatches(st[kind] || null, kind === 'bg' ? FILL_COLORS : TEXT_COLORS, c => { st[kind] = c || undefined; draw(); }, kind === 'bg' ? T('בלי מילוי') : T('אוטומטי')), customColor(c => { st[kind] = c; draw(); })));
  box.append(prev, h('div', { class: 'sh-cflook-row' }, ...btns.map(x => x[1]),
    h('button', { type: 'button', class: 'rb', title: T('מילוי'), 'aria-label': T('מילוי'), onclick: e => pick('bg', e.currentTarget) }, icon('format_color_fill')),
    h('button', { type: 'button', class: 'rb', title: T('צבע הטקסט'), 'aria-label': T('צבע הטקסט'), onclick: e => pick('c', e.currentTarget) }, icon('format_color_text')),
    h('button', { type: 'button', class: 'rb', title: T('גבולות'), 'aria-label': T('גבולות'), onclick: e => cfBorderMenu(e.currentTarget, st, draw) }, icon('border_outer')),
    h('button', { type: 'button', class: 'btn small', onclick: () => { for (const k of Object.keys(st)) delete st[k]; draw(); } }, T('ניקוי'))));
  draw();
  return box;
}
/* the ready looks as a list, and "your own look" that opens the picker */
function cfLookSelect(st, onChange) {
  const sel = h('select', { class: 'field', 'aria-label': T('עם') }, CF_LOOKS.map(([k, n]) => h('option', { value: k, text: T(n) })), h('option', { value: 'own', text: T('עיצוב משלך…') }));
  const own = h('div', { hidden: true });
  const same = (a, b) => JSON.stringify(cfStyle(a)) === JSON.stringify(cfStyle(b));
  const found = CF_LOOKS.find(([, , x]) => same(x, st));
  sel.value = found ? found[0] : 'own';
  const mine = { ...st };
  const apply = () => {
    if (sel.value === 'own') { own.hidden = false; if (!own.firstChild) own.append(cfLookPicker(mine, x => onChange({ ...x }))); else onChange({ ...mine }); }
    else { own.hidden = true; onChange({ ...CF_LOOKS.find(([k]) => k === sel.value)[2] }); }
  };
  sel.addEventListener('change', apply);
  apply();
  return [sel, own];
}

/* --- quick rules, as Excel's "Greater Than..." and the rest: a value and a look, shown on the sheet while typing --- */
function cfQuick(kind) {
  const g = selG(), nums = [];
  eachIn({ s: WS, g: usedPart(g) }, v => { if (typeof v === 'number') nums.push(v); });
  const avg = nums.length ? sumOf(nums) / nums.length : null, lo = nums.length ? Math.min(...nums) : null, hi = nums.length ? Math.max(...nums) : null;
  const guess = v => v == null ? '' : genText(Math.round(v * 100) / 100, 15);
  const titles = { gt: T('גדול מ'), lt: T('קטן מ'), bw: T('בין'), eq: T('שווה ל'), text: T('טקסט שמכיל'), date: T('תאריך שחל'), dup: T('ערכים כפולים'), top: T('10 העליונים'), topPct: T('10% העליונים'),
    bot: T('10 התחתונים'), botPct: T('10% התחתונים'), above: T('מעל הממוצע'), below: T('מתחת לממוצע') };
  const words = { gt: T('עיצוב תאים שגדולים מ:'), lt: T('עיצוב תאים שקטנים מ:'), bw: T('עיצוב תאים שבין:'), eq: T('עיצוב תאים ששווים ל:'), text: T('עיצוב תאים שיש בהם את הטקסט:'), date: T('עיצוב תאים עם תאריך שחל:'),
    dup: T('עיצוב תאים שיש בהם:'), top: T('עיצוב התאים העליונים:'), topPct: T('עיצוב התאים העליונים (באחוזים):'), bot: T('עיצוב התאים התחתונים:'), botPct: T('עיצוב התאים התחתונים (באחוזים):'),
    above: T('עיצוב תאים שמעל הממוצע של התאים שנבחרו'), below: T('עיצוב תאים שמתחת לממוצע של התאים שנבחרו') };
  const inp = (v, label) => h('input', { class: 'field', value: v, dir: 'auto', spellcheck: 'false', 'aria-label': label || titles[kind], placeholder: T('ערך, או = וכתובת של תא') });
  let a, b, p, d, n;
  const parts = [];
  if (kind === 'gt' || kind === 'lt' || kind === 'eq') { a = inp(guess(avg)); parts.push(a); }
  if (kind === 'bw') { a = inp(guess(lo)); b = inp(guess(hi)); parts.push(a, h('span', { class: 'muted', text: T('ו-') }), b); }
  if (kind === 'text') { a = inp('', T('טקסט')); a.placeholder = ''; parts.push(a); }
  if (kind === 'date') { p = h('select', { class: 'field' }, CF_DATES.map(k => h('option', { value: k, text: T(CF_DATE_NAMES[k]) }))); parts.push(p); }
  if (kind === 'dup') { d = h('select', { class: 'field' }, h('option', { value: 'dup', text: T('ערכים כפולים') }), h('option', { value: 'uniq', text: T('ערכים ייחודיים') })); parts.push(d); }
  if (/^(top|bot)/.test(kind)) { n = h('input', { class: 'field sh-cfn', type: 'number', min: '1', max: kind.endsWith('Pct') ? '100' : '1000', value: '10' }); parts.push(n, kind.endsWith('Pct') ? h('span', { text: '%' }) : null); }
  let st = { ...CF_LOOKS[0][2] };
  const rule = () => {
    const x = { g: [g], st };
    switch (kind) {
      case 'gt': case 'lt': case 'eq': return { ...x, k: 'cell', op: kind, a: cfValIn(a.value) };
      case 'bw': return { ...x, k: 'cell', op: 'bw', a: cfValIn(a.value), b: cfValIn(b.value) };
      case 'text': return { ...x, k: 'text', op: 'has', t: a.value };
      case 'date': return { ...x, k: 'date', p: p.value };
      case 'dup': return { ...x, k: d.value };
      case 'above': return { ...x, k: 'avg' };
      case 'below': return { ...x, k: 'avg', below: true };
      default: return { ...x, k: 'top', n: +n.value || 10, pct: kind.endsWith('Pct'), bot: kind.startsWith('bot') };
    }
  };
  const ok = () => { const r = rule(); return (r.k !== 'cell' || (r.a != null && (r.op !== 'bw' || r.b != null))) && normCf(r); };
  const show = () => cfPreview(ok() || null);
  const [look, own] = cfLookSelect(st, x => { st = x; show(); });
  for (const x of [a, b, n]) if (x) x.addEventListener('input', debounce(show, 200));
  for (const x of [p, d]) if (x) x.addEventListener('change', show);
  const body = h('div', { class: 'sh-cfq' }, h('p', { text: words[kind] }), parts.length ? h('div', { class: 'sh-cfq-row' }, parts) : null, h('div', { class: 'sh-cfq-row' }, h('span', { text: T('עם') }), look), own);
  show();
  modal({ title: titles[kind], body, actions: [
    { label: T('אישור'), kind: 'primary', run: () => { const r = ok(); if (!r) { toast(T('צריך לכתוב ערך')); return false; } cfPreview(null); addCf(cfOut(r)); } },
    { label: T('ביטול'), value: false }], onClose: () => { cfPreview(null); focusGrid(); } });
}

/* --- the rule editor ("New Formatting Rule" in Excel): the kind of rule, what it checks, its look, and where it applies.
   done(rule) gets the finished rule; without done, the rule goes on top of the sheet's rules --- */
const CF_EDIT_KINDS = [[N_('עיצוב כל התאים לפי הערכים שלהם'), [['scale2', N_('סולם של שני צבעים')], ['scale3', N_('סולם של שלושה צבעים')], ['bar', N_('פס נתונים')], ['icons', N_('ערכת סמלים')]]],
  [N_('עיצוב רק של תאים שמכילים'), [['cell', N_('ערך מסוים')], ['text', N_('טקסט מסוים')], ['date', N_('תאריכים')], ['blank', N_('תאים ריקים')], ['noblank', N_('תאים שאינם ריקים')], ['err', N_('שגיאות')], ['noerr', N_('בלי שגיאות')]]],
  [N_('עוד כללים'), [['top', N_('ערכים עליונים או תחתונים')], ['avg', N_('מעל או מתחת לממוצע')], ['dup', N_('ערכים כפולים או ייחודיים')], ['expr', N_('נוסחה שקובעת אילו תאים לעצב')]]]];
function cfEditor(start, done) {
  const r0 = start && start.g ? cfOut(start) : { ...(start || { k: 'cell' }), ref: rangeA1(selG()) };
  const st = { ...(r0.st || CF_LOOKS[0][2]) };
  let kind = r0.k === 'scale' ? (r0.cs && r0.cs.length === 2 ? 'scale2' : 'scale3') : r0.k === 'uniq' ? 'dup' : r0.k;
  const kindSel = h('select', { class: 'field', 'aria-label': T('סוג הכלל') }, CF_EDIT_KINDS.map(([gname, list]) => h('optgroup', { label: T(gname) }, list.map(([k, n]) => h('option', { value: k, text: T(n) })))));
  kindSel.value = kind;
  const ref = h('input', { class: 'field', dir: 'ltr', value: r0.ref || '', spellcheck: 'false', 'aria-label': T('חל על') });
  const stop = h('input', { type: 'checkbox' }); stop.checked = !!r0.stop;
  const area = h('div', { class: 'sh-cfed-area' }), err = h('p', { class: 'sh-ch-err', role: 'alert', hidden: true });
  let read = () => null;   // what the fields say, as a rule without its ranges
  const fld = (label, ...kids) => h('label', { class: 'fld' }, h('span', { text: label }), ...kids);
  const inp = (v, label, ltr) => h('input', { class: 'field', value: v ?? '', dir: ltr ? 'ltr' : 'auto', spellcheck: 'false', 'aria-label': label });
  const sel = (map, v, label) => { const s = h('select', { class: 'field', 'aria-label': label }, Object.entries(map).map(([k, n]) => h('option', { value: k, text: T(n) }))); if (v != null) s.value = v; return s; };
  const check = (text, on) => { const i = h('input', { type: 'checkbox' }); i.checked = !!on; return [h('label', { class: 'check' }, i, h('span', { text })), i]; };
  /* a threshold: its kind, its number or formula, and for a scale its color */
  const voRow = (label, o, kinds, withColor) => {
    const t = sel(Object.fromEntries(kinds.map(k => [k, CF_VO_NAMES[k]])), o.t, label), v = inp(o.t === 'formula' ? '=' + o.v : o.v != null ? genText(o.v, 15) : '', label, true);
    const col = withColor ? h('input', { type: 'color', value: o.c || '#ffffff', 'aria-label': T('צבע') }) : null;
    const sync = () => { v.hidden = t.value === 'min' || t.value === 'max' || t.value === 'auto'; };
    t.addEventListener('change', sync); sync();
    const get = () => { const k = t.value, x = { t: k }; if (k === 'formula') x.v = String(v.value).replace(/^=/, ''); else if (k === 'num' || k === 'pct' || k === 'pctl') x.v = +String(v.value).replace(',', '.') || 0; if (col) x.c = col.value; return x; };
    return [h('div', { class: 'sh-cfed-vo' }, h('span', { class: 'sh-cfed-l', text: label }), t, v, col), get, [t, v, col].filter(Boolean)];
  };
  const lookBox = () => { const [s2, own] = cfLookSelect(st, x => { for (const k of Object.keys(st)) delete st[k]; Object.assign(st, x); live(); }); return fld(T('עיצוב'), s2, own); };
  const draw = () => {
    area.textContent = '';
    const k = kindSel.value, watch = [];
    if (k === 'cell') {
      const op = sel(CF_OP_NAMES, r0.op || 'gt', T('תנאי')), a = inp(cfValOut(r0.a), T('ערך')), b = inp(cfValOut(r0.b), T('ערך'));
      const sync = () => { b.hidden = !(op.value === 'bw' || op.value === 'nb'); };
      op.addEventListener('change', sync); sync();
      area.append(fld(T('ערך התא'), h('div', { class: 'sh-cfq-row' }, op, a, b)), lookBox());
      watch.push(op, a, b);
      read = () => ({ k: 'cell', op: op.value, a: cfValIn(a.value), b: cfValIn(b.value), st });
    } else if (k === 'text') {
      const op = sel(CF_TEXT_NAMES, r0.op || 'has', T('תנאי')), t = inp(r0.t, T('טקסט'));
      area.append(fld(T('טקסט'), h('div', { class: 'sh-cfq-row' }, op, t)), lookBox());
      watch.push(op, t);
      read = () => ({ k: 'text', op: op.value, t: t.value, st });
    } else if (k === 'date') {
      const p = sel(CF_DATE_NAMES, r0.p || 'today', T('תאריך'));
      area.append(fld(T('תאריך שחל'), p), lookBox());
      watch.push(p);
      read = () => ({ k: 'date', p: p.value, st });
    } else if (['blank', 'noblank', 'err', 'noerr'].includes(k)) {
      area.append(lookBox());
      read = () => ({ k, st });
    } else if (k === 'top') {
      const way = sel({ top: N_('עליונים'), bot: N_('תחתונים') }, r0.bot ? 'bot' : 'top', T('עליונים או תחתונים')), n = h('input', { class: 'field sh-cfn', type: 'number', min: '1', value: String(r0.n || 10) }), [pctL, pct] = check(T('באחוזים מהטווח'), r0.pct);
      area.append(fld(T('עיצוב הערכים'), h('div', { class: 'sh-cfq-row' }, way, n, pctL)), lookBox());
      watch.push(way, n, pct);
      read = () => ({ k: 'top', n: +n.value || 10, bot: way.value === 'bot', pct: pct.checked, st });
    } else if (k === 'avg') {
      const w = sel({ above: N_('מעל הממוצע'), below: N_('מתחת לממוצע'), eqa: N_('שווה לממוצע או מעליו'), eqb: N_('שווה לממוצע או מתחתיו') }, (r0.eq ? 'eq' : '') + (r0.below ? (r0.eq ? 'b' : 'below') : (r0.eq ? 'a' : 'above')), T('ממוצע'));
      area.append(fld(T('עיצוב ערכים'), w), lookBox());
      watch.push(w);
      read = () => ({ k: 'avg', below: w.value === 'below' || w.value === 'eqb', eq: w.value.startsWith('eq'), st });
    } else if (k === 'dup') {
      const w = sel({ dup: N_('כפולים'), uniq: N_('ייחודיים') }, r0.k === 'uniq' ? 'uniq' : 'dup', T('ערכים'));
      area.append(fld(T('עיצוב ערכים'), w), lookBox());
      watch.push(w);
      read = () => ({ k: w.value, st });
    } else if (k === 'expr') {
      const f = inp(r0.f ? '=' + r0.f : '=', T('נוסחה'), true);
      area.append(fld(T('עיצוב תאים שבהם הנוסחה הזאת נכונה (TRUE):'), f), h('p', { class: 'muted small', text: T('הנוסחה נכתבת בשביל התא הראשון בטווח, ונבדקת לכל תא כמו נוסחה שהועתקה אליו. למשל ‎=$C2>100 צובע כל שורה שהמספר בעמודה C שלה גדול מ-100.') }), lookBox());
      watch.push(f);
      read = () => { const t = String(f.value).trim().replace(/^=/, ''); return t && astOf(closeBrackets(t)) ? { k: 'expr', f: tidyFormula(closeBrackets(t)), st } : null; };
    } else if (k === 'scale2' || k === 'scale3') {
      const three = k === 'scale3', cs = r0.k === 'scale' && r0.cs && r0.cs.length === (three ? 3 : 2) ? r0.cs : three ? [{ t: 'min', c: '#f8696b' }, { t: 'pctl', v: 50, c: '#ffeb84' }, { t: 'max', c: '#63be7b' }] : [{ t: 'min', c: '#f8696b' }, { t: 'max', c: '#63be7b' }];
      const rows = cs.map((o, i) => voRow(i === 0 ? T('הכי נמוך') : i === cs.length - 1 ? T('הכי גבוה') : T('אמצע'), o, i === 0 ? ['min', 'num', 'pct', 'pctl', 'formula'] : i === cs.length - 1 ? ['max', 'num', 'pct', 'pctl', 'formula'] : ['num', 'pct', 'pctl', 'formula'], true));
      area.append(...rows.map(r => r[0]));
      rows.forEach(r => watch.push(...r[2]));
      read = () => ({ k: 'scale', cs: rows.map(r => r[1]()) });
    } else if (k === 'bar') {
      const b = r0.k === 'bar' ? r0 : { c: '#638ec6', lo: { t: 'auto' }, hi: { t: 'auto' } };
      const lo = voRow(T('הכי קצר'), b.lo || { t: 'auto' }, ['auto', 'min', 'num', 'pct', 'pctl', 'formula']), hi = voRow(T('הכי ארוך'), b.hi || { t: 'auto' }, ['auto', 'max', 'num', 'pct', 'pctl', 'formula']);
      const fill = sel({ grad: N_('מילוי מדורג'), solid: N_('מילוי אחיד') }, b.solid ? 'solid' : 'grad', T('מילוי')), col = h('input', { type: 'color', value: b.c || '#638ec6', 'aria-label': T('צבע') });
      const [onlyL, only] = check(T('רק הפס, בלי המספר'), b.only);
      area.append(lo[0], hi[0], fld(T('מראה הפס'), h('div', { class: 'sh-cfq-row' }, fill, col)), onlyL);
      watch.push(...lo[2], ...hi[2], fill, col, only);
      read = () => ({ k: 'bar', c: col.value, solid: fill.value === 'solid', lo: lo[1](), hi: hi[1](), only: only.checked, noaxis: b.noaxis });
    } else if (k === 'icons') {
      let set = r0.k === 'icons' && ICON_SETS[r0.set] ? r0.set : '3Arrows';
      const pics = h('div', { class: 'sh-cfed-sets', role: 'radiogroup' }), rows = h('div', { class: 'sh-cfed-th' });
      const [revL, rev] = check(T('סדר הפוך של הסמלים'), r0.rev), [onlyL, only] = check(T('רק הסמל, בלי המספר'), r0.only);
      let ths = [];
      const drawSets = () => {
        pics.textContent = '';
        for (const [, sets] of CF_ICON_GROUPS) for (const s2 of sets) pics.append(h('button', { type: 'button', class: 'sh-cfgal-b' + (s2 === set ? ' on' : ''), role: 'radio', 'aria-checked': String(s2 === set), 'aria-label': T('ערכת סמלים'), onclick: () => { set = s2; drawSets(); drawTh(); live(); } }, iconsPic(s2)));
      };
      const drawTh = () => {
        rows.textContent = '';
        const n = ICON_SETS[set], old = r0.k === 'icons' && r0.set === set && r0.th ? r0.th : iconSteps(n);
        // from the highest values' icon down, as Excel lists them: each icon from its threshold, the last for the rest
        ths = [];
        for (let i = n - 1; i >= 1; i--) {
          const o = old[i - 1] || iconSteps(n)[i - 1], ic = h('span', { class: 'sh-cfed-ic' }), gt = sel({ ge: '>=', gt: '>' }, o.gt ? 'gt' : 'ge', T('תנאי'));
          ic.innerHTML = iconSvg(set, rev.checked ? n - 1 - i : i, 16);
          const [row, get, els] = voRow('', o, ['num', 'pct', 'pctl', 'formula']);
          row.prepend(ic, gt);
          rows.append(row);
          ths[i - 1] = () => ({ ...get(), ...(gt.value === 'gt' ? { gt: true } : {}) });
          for (const x of [gt, ...els]) { x.addEventListener('change', live); x.addEventListener('input', debounce(live, 250)); }
        }
        const last = h('div', { class: 'sh-cfed-vo' }, h('span', { class: 'sh-cfed-ic' }), h('span', { class: 'muted small', text: T('ולשאר') }));
        last.firstChild.innerHTML = iconSvg(set, rev.checked ? n - 1 : 0, 16);
        rows.append(last);
      };
      rev.addEventListener('change', () => { drawTh(); live(); });
      drawSets(); drawTh();
      area.append(pics, rows, h('div', { class: 'sh-cfq-row' }, revL, onlyL));
      watch.push(only);
      read = () => ({ k: 'icons', set, th: ths.map(f => f()), rev: rev.checked, only: only.checked });
    }
    for (const x of watch) { x.addEventListener('change', live); x.addEventListener('input', debounce(live, 250)); }
    live();
  };
  const build = () => {
    err.hidden = true;
    const x = read();
    if (!x || (x.k === 'cell' && (x.a == null || ((x.op === 'bw' || x.op === 'nb') && x.b == null)))) return null;
    const g = ref.value.split(/[\s,;]+/).filter(Boolean).map(t => parseRange(t));
    if (!g.length || g.some(y => !y)) return false;
    return normCf({ ...x, g, stop: stop.checked, id: r0.id || null });
  };
  const live = () => { const r = build(); cfPreview(r || null); };
  kindSel.addEventListener('change', () => { r0.k = kindSel.value === 'scale2' || kindSel.value === 'scale3' ? 'scale' : kindSel.value; draw(); });
  ref.addEventListener('input', debounce(live, 250));
  stop.addEventListener('change', live);
  const body = h('div', { class: 'sh-cfed' }, fld(T('סוג הכלל'), kindSel), area, fld(T('חל על'), ref), h('label', { class: 'check' }, stop, h('span', { text: T('לעצור כאן אם הכלל מתקיים (הכללים שאחריו לא נבדקים)') })), err);
  draw();
  modal({ title: start && start.id ? T('עריכת כלל') : T('כלל חדש'), wide: true, body, actions: [
    { label: T('אישור'), kind: 'primary', run: () => {
      const r = build();
      if (r === false) { err.textContent = T('לא הבנתי איפה הכלל חל. כותבים טווח כמו A2:A20, וכמה טווחים עם רווח ביניהם.'); err.hidden = false; return false; }
      if (!r) { err.textContent = T('חסר משהו בכלל: ערך, טקסט או נוסחה.'); err.hidden = false; return false; }
      cfPreview(null);
      if (done) done(r); else edit(() => setProp(WS, 'cf', [r, ...WS.cf].slice(0, 500)));
    } },
    { label: T('ביטול'), value: false }], onClose: () => { cfPreview(null); if (!done) focusGrid(); } });
}

/* --- the rules manager: the rules of the chosen cells (or the whole sheet) in order, the first the strongest; each
   can be edited, deleted, moved up or down, given other ranges, or told to stop the ones after it. Nothing changes on
   the sheet until OK, and then it is one step undo takes back --- */
function cfManager() {
  let rules = WS.cf.map(r => ({ ...r })), pick = rules.length ? rules[0].id : null, scope = 'sel';
  const g0 = selG();
  const list = h('div', { class: 'sh-cfm-list', role: 'listbox' }), err = h('p', { class: 'sh-ch-err', role: 'alert', hidden: true });
  const scopeSel = h('select', { class: 'field', 'aria-label': T('הצגת כללים של') }, h('option', { value: 'sel', text: T('התאים שנבחרו') }), h('option', { value: 'all', text: T('כל הגיליון') }));
  scopeSel.value = scope;
  const shown = () => rules.filter(r => scope === 'all' || r.g.some(x => meets(x, g0)));
  const draw = () => {
    list.textContent = '';
    const view2 = shown();
    if (!view2.length) list.append(h('p', { class: 'muted small', style: { padding: '10px' }, text: T('אין כאן כללים של עיצוב מותנה.') }));
    for (const r of view2) {
      const ref = h('input', { class: 'field', dir: 'ltr', value: r.g.map(rangeA1).join(' '), spellcheck: 'false', 'aria-label': T('חל על') });
      ref.addEventListener('change', () => {
        const g = ref.value.split(/[\s,;]+/).filter(Boolean).map(t => parseRange(t));
        if (!g.length || g.some(y => !y)) { err.textContent = T('לא הבנתי איפה הכלל חל. כותבים טווח כמו A2:A20, וכמה טווחים עם רווח ביניהם.'); err.hidden = false; ref.value = r.g.map(rangeA1).join(' '); return; }
        err.hidden = true;
        const a = cfAnchor(r), i = rules.indexOf(r);
        rules[i] = { ...cfFormulas(r, f => shiftFormula(f, g[0].r1 - a.r, g[0].c1 - a.c)), g };
        draw();
      });
      const stop = h('input', { type: 'checkbox', 'aria-label': T('עצירה') });
      stop.checked = !!r.stop;
      stop.addEventListener('change', () => { r.stop = stop.checked || undefined; });
      list.append(h('div', { class: 'sh-cfm-row' + (r.id === pick ? ' on' : ''), role: 'option', 'aria-selected': String(r.id === pick), onclick: e => { if (e.target.closest('input')) return; pick = r.id; draw(); }, ondblclick: e => { if (!e.target.closest('input')) editPick(); } },
        cfSwatch(r), h('span', { class: 'sh-cfm-d', dir: 'auto', text: cfDesc(r) }), ref, h('label', { class: 'check', title: T('לעצור כאן אם הכלל מתקיים') }, stop, h('span', { text: T('עצירה') }))));
    }
    for (const b of [up, down, del, ed]) b.disabled = !view2.some(r => r.id === pick);
  };
  const at = () => rules.findIndex(r => r.id === pick);
  const move = d => { const v = shown(), i = v.findIndex(r => r.id === pick), j = i + d; if (i < 0 || j < 0 || j >= v.length) return; const a = rules.indexOf(v[i]), b = rules.indexOf(v[j]); [rules[a], rules[b]] = [rules[b], rules[a]]; draw(); };
  const editPick = () => { const i = at(); if (i < 0) return; cfEditor(rules[i], r => { rules[i] = r; pick = r.id; draw(); }); };
  const btn = (ic, label, run) => h('button', { type: 'button', class: 'btn small', onclick: run }, icon(ic), label);
  const add = btn('add', T('כלל חדש'), () => cfEditor({ k: 'cell', g: [g0] }, r => { rules.unshift(r); pick = r.id; draw(); }));
  const ed = btn('edit', T('עריכה'), editPick);
  const del = btn('delete', T('מחיקה'), () => { const i = at(); if (i < 0) return; rules.splice(i, 1); pick = (rules[i] || rules[i - 1] || {}).id || null; draw(); });
  const up = btn('arrow_upward', T('למעלה'), () => move(-1)), down = btn('arrow_downward', T('למטה'), () => move(1));
  scopeSel.addEventListener('change', () => { scope = scopeSel.value; draw(); });
  const body = h('div', { class: 'sh-cfm' }, h('div', { class: 'sh-cfm-bar' }, h('label', { class: 'fld inline' }, h('span', { text: T('הצגת כללים של:') }), scopeSel), add, ed, del, up, down),
    h('div', { class: 'sh-cfm-head' }, h('span', {}), h('span', { text: T('כלל (לפי הסדר)') }), h('span', { text: T('חל על') }), h('span', {})), list, err,
    h('p', { class: 'muted small', text: T('הכלל העליון חזק מהכללים שמתחתיו: כששניים צובעים אותו תא, הצבע שלו קובע.') }));
  draw();
  modal({ title: T('ניהול כללים של עיצוב מותנה'), wide: true, body, actions: [
    { label: T('אישור'), kind: 'primary', run: () => { const next = rules.map(r => normCf(cfOut(r))).filter(Boolean); if (JSON.stringify(next.map(cfOut)) !== JSON.stringify(WS.cf.map(cfOut))) edit(() => setProp(WS, 'cf', next)); } },
    { label: T('ביטול'), value: false }], onClose: () => focusGrid() });
}

/* =========================================================
   data validation, as Excel's (Data > Data Validation): what may be typed into cells, the list that drops down in a
   cell, the message a chosen cell shows, and the alert for a value that doesn't fit. A rule is { id, g: [ranges],
   t: any, whole, decimal, list, date, time, len (the length of the text) or custom; op (for numbers, dates, times and
   lengths); a and b: its formulas (a list written out is one text in quotes, "כן,לא,אולי"; a list from cells is a
   reference; custom is a formula that must come out TRUE); nb: an empty cell doesn't pass; nd: a list without its
   arrow; pt pm: the title and text of the message shown when a cell is chosen (np: kept, not shown); es: how strict
   the alert is (stop when missing; warn; info); et em: its title and text; ne: no alert, so anything goes in }.
   A cell is in one rule at most. The formulas are written for the first range's corner and move with each cell, like
   conditional formatting's. What passes is what Excel passes: measured there, value by value
   ========================================================= */
const DV_KINDS = ['any', 'whole', 'decimal', 'list', 'date', 'time', 'len', 'custom'];
const DV_NUM = ['whole', 'decimal', 'date', 'time', 'len'];   // the kinds that compare a number (len: the text's length)
const DV_MAX = 2000;
const quoted = t => '"' + t.replace(/"/g, '""') + '"';
const dvText = (v, max) => typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f]/g, '').slice(0, max) : '';
/* Excel takes a written-out list of up to 255 letters: a longer one keeps the items that fit */
function dvCap(f) {
  const a = astOf(f);
  if (!a || a.t !== 'str' || a.v.length <= 255) return f;
  const t = a.v.slice(0, 256), i = t.lastIndexOf(',');
  return quoted(i > 0 ? t.slice(0, i) : t.slice(0, 255));
}
function normDv(x) {
  if (!x || typeof x !== 'object' || !DV_KINDS.includes(x.t)) return null;
  const g = (Array.isArray(x.g) ? x.g : String(x.ref || '').split(/[\s,]+/).map(parseRange)).filter(y => y && y.r1 >= 0 && y.c1 >= 0 && y.r2 < MAXR && y.c2 < MAXC).slice(0, 50);
  if (!g.length) return null;
  const r = { id: typeof x.id === 'string' && /^[a-z0-9]{4,24}$/.test(x.id) ? x.id : sid(), t: x.t, g };
  if (DV_NUM.includes(x.t)) { r.op = CF_OPS.includes(x.op) ? x.op : 'bw'; r.a = cfFormula(x.a) || '0'; if (r.op === 'bw' || r.op === 'nb') r.b = cfFormula(x.b) || r.a; }
  else if (x.t !== 'any') { r.a = cfFormula(x.a); if (!r.a) return null; if (x.t === 'list') r.a = dvCap(r.a); }
  if (x.t !== 'any' && x.nb) r.nb = true;
  if (x.t === 'list' && x.nd) r.nd = true;
  const pt = dvText(x.pt, 32), pm = dvText(x.pm, 255), et = dvText(x.et, 32), em = dvText(x.em, 225);
  if (pt) r.pt = pt;
  if (pm) r.pm = pm;
  if ((pt || pm) && x.np) r.np = true;
  if (x.t !== 'any') { if (x.es === 'warn' || x.es === 'info') r.es = x.es; if (et) r.et = et; if (em) r.em = em; if (x.ne) r.ne = true; }
  return x.t === 'any' && !pt && !pm ? null : r;
}
/* the rule a cell is in */
function dvAt(s, r, c) {
  for (const rule of s.dv) for (const g of rule.g) if (inG(g, r, c)) return rule;
  return null;
}
/* what a list rule's formula gives for cell (r, c): the text of a list written out, the cells of a list kept in cells,
   or an error */
function dvSource(s, rule, r, c) {
  const ast = astOf(rule.a);
  if (!ast) return E_NAME;
  if (ast.t === 'str') return ast.v;
  const a = cfAnchor(rule), keep = [CTX, AX, OFF];
  CTX = { si: WB.sheets.indexOf(s), r, c, dyn: false }; AX = true; OFF = { dr: r - a.r, dc: c - a.c };
  try { return refOf(ast); } catch (e) { return e instanceof Err ? e : E_VAL; } finally { [CTX, AX, OFF] = keep; }
}
/* a list rule's items for cell (r, c), each with its value, the text the list shows for it, and its number format.
   lit: the list is written out in the rule. null: the source can't be worked out here (it uses a function or a name
   this app doesn't have), and then nothing is checked against it */
function dvList(s, rule, r, c) {
  const src = dvSource(s, rule, r, c), items = [];
  if (typeof src === 'string') return { lit: true, items: src.split(',').map(t => t.trim()).filter(Boolean).map(t => { const p = parseInput(t), ok = !!p && p.f == null && !isErr(p.v); return { t, v: ok ? p.v : t, nf: (ok && p.nf) || null }; }) };
  if (src == null || isErr(src)) return lacksFn(rule.a, s) ? null : { lit: false, items };
  if (src.rng && src.g.r1 !== src.g.r2 && src.g.c1 !== src.g.c2) return { lit: false, items };   // a list is one row or one column: a block of cells (through a name or INDIRECT) passes nothing in Excel
  const keep = SHOWF;
  SHOWF = false;   // the items as their cells show them, also while the sheet shows its formulas
  try {
    if (src.rng) {
      const { s: ss, g } = src, u = usedEnd(ss), r2 = Math.min(g.r2, Math.max(g.r1, u.r - 1)), c2 = Math.min(g.c2, Math.max(g.c1, u.c - 1));
      for (let rr = g.r1; rr <= r2 && items.length < 5000; rr++) for (let cc = g.c1; cc <= c2 && items.length < 5000; cc++) {
        const x = cellSp(ss, rr, cc);
        if (x && x.v != null && !isErr(x.v)) items.push({ v: x.v, t: view(x).t ?? '', nf: (x.st && x.st.nf) || null });
      }
    } else for (const v of src.arr ? src.d : [src]) if (v != null && !isErr(v) && items.length < 5000) items.push({ v, t: toStr(v), nf: null });
  } finally { SHOWF = keep; }
  return { lit: false, items };
}
/* the same, kept until the workbook changes: once for all of a rule's cells when its source is the same for all of them */
const DVC = { v: -1, m: new Map() };
function dvItems(s, rule, r, c) {
  if (DVC.v !== CHV) { DVC.v = CHV; DVC.m.clear(); }
  // one list for all the rule's cells when its source can't differ between them: fixed references, and names for fixed cells
  const names = WB.names || NO_NAMES;
  if (rule._fxn !== names || rule._fxs !== s) {
    rule._fxn = names; rule._fxs = s;
    rule._fx = tokenize(rule.a).every(t => t.t === 'ref' ? t.a.every(Boolean) : t.t === 'name' ? !!(nameOf(t, s) && (nameCells(nameOf(t, s)) || {}).fixed) : t.t !== 'fn');
  }
  const key = s.id + '|' + rule.id + (rule._fx ? '' : '|' + r + ',' + c);
  let L = DVC.m.get(key);
  if (L === undefined) { if (DVC.m.size > 5000) DVC.m.clear(); DVC.m.set(key, L = dvList(s, rule, r, c)); }
  return L;
}
/* whether a value is one of a list's items. A list written out in the rule goes by the text, big and small letters
   apart, spaces around the value aside, and numbers by what they are worth ("1.50" is 1.5). A list from cells goes by
   the value itself: text in letters of either size, a number only as a number. (One thing isn't Excel's: there an
   item written with a space after it, "a,b ,c", passes nothing, not even itself; here it is the item without the space) */
function dvInList(L, v) {
  if (isErr(v)) return false;
  if (!L.lit) { if (!L.keys) L.keys = new Set(L.items.map(it => valKey(it.v))); return L.keys.has(valKey(v)); }
  const t = toStr(v).trim(), n = typeof v === 'number' ? v : typeof v === 'string' ? numLike(v) : null;
  return L.items.some(it => n != null && typeof it.v === 'number' ? it.v === n : it.t === t);
}
/* the items a cell's list shows, when the cell has a list with its arrow */
function dvChoices(s, r, c) {
  const rule = s.dv.length ? dvAt(s, r, c) : null, L = rule && rule.t === 'list' && !rule.nd ? dvItems(s, rule, r, c) : null;
  return L ? L.items.filter(it => it.t !== '') : null;
}
/* whether a rule's formula, as it is for cell (r, c), points at an empty cell by itself (not as part of a range): by
   its address, or by a name for one cell. A name nobody defined counts too, and the cell OFFSET starts from doesn't
   (both measured in Excel) */
function dvBlankRef(f, s, r, c, a) {
  let hit = false;
  const empty = (n, dr, dc) => { const sh = n.sheet == null ? s : WB.sheets.find(x => x.name.toLowerCase() === n.sheet.toLowerCase()); return !!sh && valAt(sh, wrapAt(n.r1, dr, n.ab[0], MAXR), wrapAt(n.c1, dc, n.ab[1], MAXC)) == null; };
  walkRead(astOf(f), n => {
    if (hit) return;
    if (n.t === 'ref') hit = n.k === 'c' && !n.sp && empty(n, r - a.r, c - a.c);
    else if (n.t === 'name') { const nm = nameOf(n, s), x = nm ? astOf(nm.f) : null; hit = !nm || (!!x && x.t === 'ref' && x.k === 'c' && !x.sp && empty(x, r, c)); }
  });
  return hit;
}
/* whether what cell (r, c) holds passes its rule. As in Excel: only a number is a number (not text that reads as one,
   nor TRUE); dates and times are numbers; an empty cell passes unless the rule says otherwise; and while empty cells
   pass, a formula that points at an empty cell lets any value of the right kind through */
function dvOk(s, rule, r, c) {
  const v = valAt(s, r, c);
  if (rule.t === 'any' || (v == null && !rule.nb)) return true;
  const a = cfAnchor(rule);
  if (rule.t === 'list') {
    // a list that hangs on an empty cell (=INDIRECT(A2) while A2 is empty, or a name for an empty cell) takes anything,
    // as long as empty cells pass. Not so a list whose cells are written out and happen to be one empty cell (measured)
    const src = astOf(rule.a);
    if (!rule.nb && src && src.t !== 'str' && src.t !== 'ref' && dvBlankRef(rule.a, s, r, c, a)) return true;
    const L = dvItems(s, rule, r, c);
    return !L || (v != null && dvInList(L, v));
  }
  const val = f => cfEval(f, s, r, c, a), lost = (x, f) => x === E_NAME && lacksFn(f, s);   // a function that isn't here: nothing is checked
  let n = v;
  if (rule.t === 'len') { if (isErr(v)) return false; n = toStr(v).length; }
  else if (rule.t !== 'custom' && (typeof v !== 'number' || (rule.t === 'whole' && !Number.isInteger(v)))) return false;
  if (!rule.nb && [rule.a, rule.b].some(f => f != null && dvBlankRef(f, s, r, c, a))) return true;
  const x = val(rule.a);
  if (rule.t === 'custom') return lost(x, rule.a) || (typeof x === 'number' ? x !== 0 : typeof x === 'string' ? x.toLowerCase() === 'true' : x === true);
  const y = rule.b != null ? val(rule.b) : x;
  if (isErr(x) || isErr(y)) return lost(x, rule.a) || lost(y, rule.b);
  const inside = compare('>=', n, x) && compare('<=', n, y);
  switch (rule.op) {
    case 'bw': return inside;
    case 'nb': return !inside;
    case 'eq': return compare('=', n, x);
    case 'ne': return compare('<>', n, x);
    case 'gt': return compare('>', n, x);
    case 'lt': return compare('<', n, x);
    case 'ge': return compare('>=', n, x);
    default: return compare('<=', n, x);
  }
}

/* --- on the sheet: the arrow of a list beside the active cell, the list itself, the message of the chosen cell, and
   red rings around values that don't pass --- */
const dvCell = () => { const m = mergeAt(WS, SEL.r, SEL.c); return m ? { r: m.r1, c: m.c1, r2: m.r2, c2: m.c2 } : { r: SEL.r, c: SEL.c, r2: SEL.r, c2: SEL.c }; };
/* the arrow of the active cell's list: after the cell on its end side, or inside it where there is no room for that
   (the edge of the view, or the last frozen column) */
function dvArrow() {
  if (!V.vis) return null;
  const m = dvCell(), tot = WS.tables.length ? totAt(WS, m.r, m.c) : null, rule = !tot && WS.dv.length ? dvAt(WS, m.r, m.c) : null;
  if (tot) return { tot, ...arrowAt(m) };   // a table's total row
  if (!rule || rule.t !== 'list' || rule.nd) return null;
  return { rule, ...arrowAt(m) };
}
function arrowAt(m) {
  const size = Math.round(Math.min(spanH(m.r, m.r2), 20 * Z)), end = colX(m.c2 + 1);
  const out = m.c2 + 1 < EXT.cols && (m.c2 < WS.fc ? m.c2 + 1 < WS.fc : end - V.vis.sx + size <= V.vis.vw);
  return { m, size, out, x: out ? end : end - size - 1, y: rowY(m.r2 + 1) - size - 1 };
}
/* an item chosen from a list goes into the cell: its value as the list has it, with its number format when the cell has none */
function dvPut(r, c, it) {
  edit(() => {
    const x = cellAt(WS, r, c), st0 = x ? x.st : emptyLook(WS, r, c), st = it.nf && !(st0 && st0.nf) ? { ...(st0 || {}), nf: it.nf } : st0;
    setCell(WS, r, c, st ? { v: it.v, st } : { v: it.v });
  });
}
/* the list under its cell: a click takes an item, and so do the arrows with Enter; a letter goes to the next item that starts with it */
function openDvList() {
  const d = dvArrow();
  if (!d) return false;
  if (d.tot) return openTotalList(d);
  const { rule, m } = d, L = dvItems(WS, rule, m.r, m.c), cur = valAt(WS, m.r, m.c), items = L ? L.items.filter(it => it.t !== '').slice(0, 2000) : [];
  const box = h('div', { class: 'sh-dvl', role: 'listbox', tabindex: '-1', 'aria-label': T('רשימה נפתחת') });
  let at = L && cur != null ? items.findIndex(it => dvInList({ lit: L.lit, items: [it] }, cur)) : -1;
  const take = i => { closePopover(); dvPut(m.r, m.c, items[i]); focusGrid(); };
  const els = items.map((it, i) => h('div', { class: 'sh-dvi', role: 'option', dir: 'auto', text: it.t, onclick: () => take(i) }));
  const mark = () => els.forEach((e, i) => { e.classList.toggle('on', i === at); e.setAttribute('aria-selected', String(i === at)); if (i === at) e.scrollIntoView({ block: 'nearest' }); });
  if (!L) box.append(h('p', { class: 'muted small', text: T('אי אפשר להציג כאן את הרשימה הזאת: המקור שלה משתמש בפונקציה או בשם שעוד אין כאן.') }));
  else if (!items.length) box.append(h('p', { class: 'muted small', text: T('הרשימה ריקה') }));
  else box.append(...els);
  box.addEventListener('keydown', e => {
    const k = e.key, step = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }[k];
    if (step || k === 'Home' || k === 'End') { at = k === 'Home' ? 0 : k === 'End' ? items.length - 1 : clamp(at + step, 0, items.length - 1); mark(); }
    else if (k === 'Enter' || k === 'Tab') { if (at >= 0 && items[at]) take(at); else { closePopover(); focusGrid(); } }
    else if (k === 'Escape') { closePopover(); focusGrid(); }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const low = k.toLowerCase(), from = at + 1, i = [...items.slice(from), ...items.slice(0, from)].findIndex(it => it.t.toLowerCase().startsWith(low));
      if (i >= 0) { at = (i + from) % items.length; mark(); }
    } else return;
    e.preventDefault(); e.stopPropagation();
  });
  // under the cell, at least as wide as the cell with its arrow
  const sc = V.scroll.getBoundingClientRect(), vis = V.vis, x = colX(m.c) - (m.c >= WS.fc ? vis.sx : 0), y = rowY(m.r) - (m.r >= WS.fr ? vis.sy : 0), w = spanW(m.c, m.c2) + (d.out ? d.size : 0);
  Object.assign(V.anchor.style, { left: (WS.dir === 'rtl' ? sc.right - x - w : sc.left + x) + 'px', top: sc.top + y + 'px', width: w + 'px', height: spanH(m.r, m.r2) + 'px' });
  box.style.minWidth = Math.max(w - 12, 90) + 'px';
  openPop(V.anchor, box);
  Object.assign(V.anchor.style, { width: '1px', height: '1px' });
  mark();
  box.focus({ preventScroll: true });
  return true;
}
/* the message of the chosen cell's rule, in a small box under the cell */
function dvTip() {
  const m = WS.dv.length && V.vis ? dvCell() : null, rule = m && dvAt(WS, m.r, m.c), vis = V.vis;
  if (!rule || rule.np || !(rule.pt || rule.pm)) { if (V.tip) V.tip.hidden = true; return; }
  if (!V.tip) { V.tip = h('div', { class: 'sh-dvtip', role: 'note' }); V.over.append(V.tip); }
  const tip = V.tip, sig = (rule.pt || '') + '\n' + (rule.pm || '');
  if (tip._s !== sig) { tip._s = sig; tip.textContent = ''; tip.append(rule.pt ? h('b', { dir: 'auto', text: rule.pt }) : '', rule.pm ? h('span', { dir: 'auto', text: rule.pm }) : ''); }
  const x = colX(m.c) - (m.c >= WS.fc ? vis.sx : 0), y = rowY(m.r2 + 1) - (m.r2 >= WS.fr ? vis.sy : 0);
  tip.hidden = (m.r2 >= WS.fr && y < CHH + vis.FH) || (m.c >= WS.fc && x < RHW + vis.FW) || y > vis.vh - 20 || x > vis.vw - 20;
  tip.style.right = tip.style.left = '';
  tip.style[SIDE] = px(x + Math.min(20, spanW(m.c, m.c2) / 2));
  tip.style.top = px(y + 6 + (V.link && !V.link.hidden ? V.link.offsetHeight + 4 : 0));
}
/* red rings around the cells in view whose values don't pass their rules (Excel's Circle Invalid Data), worked out
   again after each change */
function drawRings(L, rr, cc) {
  const s = WS;
  if (!s._ringv || s._ringv.v !== CHV) s._ringv = { v: CHV, m: new Map() };
  const memo = s._ringv.m;
  for (let r = rr[0]; r <= rr[1]; r++) {
    if (!rowH(r)) continue;
    for (let c = cc[0]; c <= cc[1]; c++) {
      if (!colW(c)) continue;
      const m = s.merges.length ? mergeAt(s, r, c) : null, k = KEY(r, c);
      if (m && (m.r1 !== r || m.c1 !== c)) continue;
      let bad = memo.get(k);
      if (bad === undefined) { const rule = dvAt(s, r, c); memo.set(k, bad = !!rule && !dvOk(s, rule, r, c)); }
      if (bad) place(part(L, 'dvr' + r + ',' + c, 'sh-dvr'), colX(c) - 4, rowY(r) - 3, (m ? spanW(m.c1, m.c2) : colW(c)) + 7, (m ? spanH(m.r1, m.r2) : rowH(r)) + 5);
    }
  }
}
function dvRings() {
  if (!WS.dv.length) { toast(T('אין בגיליון הזה כללים של אימות נתונים')); return; }
  const u = usedRange(WS);
  let n = 0;
  if (u) for (const rule of WS.dv) for (const g of rule.g) for (let r = g.r1; r <= Math.min(g.r2, u.r2) && n < 1000; r++) for (let c = g.c1; c <= Math.min(g.c2, u.c2) && n < 1000; c++) {
    const m = WS.merges.length ? mergeAt(WS, r, c) : null;
    if (!(m && (m.r1 !== r || m.c1 !== c)) && !dvOk(WS, rule, r, c)) n++;
  }
  WS._rings = true;
  toast(n ? TN('{n} ערכים לא תקינים סומנו בעיגול אדום', n) : T('כל הערכים תקינים'), { icon: n ? 'error' : 'check_circle' });
  render();
}
/* the alert for a value its cell's rule doesn't take, in Excel's three styles: stop (try again, or give up), warning
   (keep it anyway?) and information (it goes in, unless cancelled). The value is out of the cell while it asks */
const DVA = { open: false };
function dvAlert(rule, move) {
  const style = rule.es || 'stop', ta = taOf();
  DVA.open = true;
  const body = h('div', { class: 'sh-dva' }, icon(style === 'stop' ? 'error' : style === 'warn' ? 'warning' : 'info', style),
    h('div', {}, h('p', { dir: 'auto', text: rule.em || T('הערך הזה לא מתאים למה שמותר בתא הזה.') }), style === 'warn' ? h('p', { text: T('להשאיר אותו בכל זאת?') }) : null));
  const actions = style === 'stop' ? [{ label: T('לנסות שוב'), kind: 'primary', value: 'retry' }, { label: T('ביטול'), value: 'drop' }]
    : style === 'warn' ? [{ label: T('כן'), value: 'keep' }, { label: T('לא'), kind: 'primary', value: 'retry' }, { label: T('ביטול'), value: 'drop' }]
    : [{ label: T('אישור'), kind: 'primary', value: 'keep' }, { label: T('ביטול'), value: 'drop' }];
  const m = modal({ title: rule.et || T('ערך לא תקין'), body, actions, onClose: v => {
    DVA.open = false;
    if (!ED.on) return;
    if (v === 'keep') endEdit(true, move, true);
    else if (v === 'retry') { ta.focus({ preventScroll: true }); ta.select(); }
    else endEdit(false);
  } });
  setTimeout(() => { const b = m.body.parentNode.querySelector('footer .btn.primary'); if (b) b.focus(); }, 40);
}

/* --- the Data tab's menu, and the Data Validation dialog: what may be typed (Settings), the message of a chosen cell
   (Input Message) and the alert for a value that doesn't fit (Error Alert). The dialog opens with the rule of the
   active cell, its formulas as they are for that cell, and OK puts the rule on all the chosen cells --- */
const DV_KIND_NAMES = { any: N_('כל ערך'), whole: N_('מספר שלם'), decimal: N_('מספר עשרוני'), list: N_('רשימה'), date: N_('תאריך'), time: N_('שעה'), len: N_('אורך הטקסט'), custom: N_('נוסחה משלך') };
const DV_OPS = ['bw', 'nb', 'eq', 'ne', 'gt', 'lt', 'ge', 'le'];   // in Excel's order
const DV_ES_NAMES = { stop: N_('עצירה: אי אפשר להכניס את הערך'), warn: N_('אזהרה: שואלים אם להשאיר אותו'), info: N_('מידע: מודיעים, והערך נכנס') };
const DV_VAL_NAMES = { date: [N_('תאריך התחלה'), N_('תאריך סיום'), N_('תאריך')], time: [N_('שעת התחלה'), N_('שעת סיום'), N_('שעה')], len: [N_('אורך מינימלי'), N_('אורך מקסימלי'), N_('אורך')], num: [N_('מינימום'), N_('מקסימום'), N_('ערך')] };
const DV_NEED = { whole: N_('צריך לכתוב מספר שלם, או = ונוסחה'), len: N_('צריך לכתוב מספר שלם, או = ונוסחה'), date: N_('צריך לכתוב תאריך, או = ונוסחה'), time: N_('צריך לכתוב שעה (למשל 8:30), או = ונוסחה'), decimal: N_('צריך לכתוב מספר, או = ונוסחה') };
function dvMenu(anchor) {
  if (ED.on && !endEdit(true)) return;
  const g = selG();
  menuAt(anchor, T('אימות נתונים'), [
    { ic: UI_DIR === 'rtl' ? 'checklist_rtl' : 'checklist', label: T('אימות נתונים…'), run: () => dvDialog(), keep: true },
    { ic: 'arrow_drop_down', label: T('רשימה נפתחת…'), run: () => dvDialog('list'), keep: true },
    '-',
    { ic: 'circle', label: T('סימון ערכים לא תקינים בעיגול'), run: dvRings },
    { ic: 'visibility_off', label: T('הסרת העיגולים'), run: () => { WS._rings = false; render(); }, off: !WS._rings },
    '-',
    { ic: 'ink_eraser', label: T('ניקוי האימות מהתאים שנבחרו'), run: () => edit(() => cutRules(WS, 'dv', g)), off: !WS.dv.some(r => r.g.some(x => meets(x, g))) },
  ]);
}
/* a rule's value when it is a plain number (as dates and times are too), else null */
function dvPlain(f) {
  const a = f == null ? null : astOf(f);
  return a && a.t === 'num' ? a.v : a && a.t === 'neg' && a.neg && a.a.t === 'num' ? -a.a.v : null;
}
/* what was typed as a rule's value: a formula (=B2), or a number, a date or a time, kept as its number */
function dvValIn(t) {
  t = String(t ?? '').trim();
  if (t[0] === '=') { const f = closeBrackets(t.slice(1)); return f && astOf(f) ? tidyFormula(f) : null; }
  const p = t ? parseInput(t) : null;
  return p && p.f == null && typeof p.v === 'number' ? String(p.v) : null;
}
/* and a rule's value shown in the dialog: a date as a date, a time as a time */
function dvValOut(f, t) {
  const n = dvPlain(f);
  if (n == null) return f == null ? '' : '=' + f;
  const nf = t === 'date' ? (n % 1 ? DATE_NF + ' hh:mm' : DATE_NF) : t === 'time' ? (Math.round(n * 86400) % 60 ? 'hh:mm:ss' : 'hh:mm') : null;
  return (nf && fmtNumber(n, nf).t) || genText(n, 15);
}
/* a list's source as typed: its values with commas between them, or = and the cells that hold them (one row or one
   column, in this sheet or another) */
function dvListIn(t, book, s) {
  t = String(t ?? '').trim();
  if (!t) return { err: T('צריך לכתוב את הערכים של הרשימה') };
  if (t[0] !== '=') {   // kept without spaces around the items: Excel never passes an item that ends with one
    const items = t.split(',').map(x => x.trim()).filter(Boolean).join(',');
    return !items ? { err: T('צריך לכתוב את הערכים של הרשימה') } : items.length > 255 ? { err: T('הרשימה ארוכה מדי (עד 255 תווים). אפשר לכתוב אותה בתאים, ולבחור אותם כמקור.') } : { a: quoted(items) };
  }
  const f = closeBrackets(t.slice(1)), ast = f && astOf(f), toks = ast ? tokenize(f).filter(k => k.t !== 'ws') : [];
  if (!ast) return { err: T('לא הבנתי את המקור של הרשימה. אחרי ה-= כותבים טווח של תאים.') };
  if (s && ast.t === 'name') {   // typed in the dialog: the name has to be there, and to be one row or one column
    const nm = nameOf(ast, s, book || WB), cells = nm ? nameCells(nm, book || WB) : null;
    if (!nm) return { err: T('אין כאן שם מוגדר כזה: {0}', ast.n) };
    if (cells && cells.g.r1 !== cells.g.r2 && cells.g.c1 !== cells.g.c2) return { err: T('המקור של רשימה הוא שורה אחת או עמודה אחת של תאים') };
  }
  if (ast.t !== 'ref') return { a: tidyFormula(f, book) };
  if (ast.g.r1 !== ast.g.r2 && ast.g.c1 !== ast.g.c2) return { err: T('המקור של רשימה הוא שורה אחת או עמודה אחת של תאים') };
  // a range typed without $ would slide along with each cell of the rule; a list's cells stay where they are
  return { a: tidyFormula(toks.length === 1 && !toks[0].a.some(Boolean) ? refText({ ...toks[0], a: [true, true, true, true] }, toks[0]) : f, book) };
}
const dvListOut = f => { const a = f == null ? null : astOf(f); return a && a.t === 'str' ? a.v.split(',').map(t => t.trim()).filter(Boolean).join(', ') : f == null ? '' : '=' + f; };
function dvDialog(kind0) {
  if (ED.on && !endEdit(true)) return;
  const g = selG(), ac = dvCell(), base = dvAt(WS, ac.r, ac.c) || WS.dv.find(rule => rule.g.some(x => meets(x, g))) || null;
  const b0 = base ? cfFormulas(base, f => shiftFormula(f, ac.r - base.g[0].r1, ac.c - base.g[0].c1)) : { t: 'any' };   // its formulas as they are for the active cell
  const fld = (label, ...kids) => h('label', { class: 'fld' }, h('span', { text: label }), ...kids);
  const inp = (v, label, o = {}) => h('input', { class: 'field', value: v ?? '', dir: o.ltr ? 'ltr' : 'auto', spellcheck: 'false', autocomplete: 'off', 'aria-label': label, maxlength: o.max, placeholder: o.ph, autofocus: o.focus });
  const text = (v, label, max) => h('textarea', { class: 'field', dir: 'auto', 'aria-label': label, maxlength: max }, v || '');
  const check = (label, on) => { const i = h('input', { type: 'checkbox' }); i.checked = !!on; return [h('label', { class: 'check' }, i, h('span', { text: label })), i]; };
  const pick = (pairs, v, label) => { const s = h('select', { class: 'field', 'aria-label': label }, pairs.map(([k, n]) => h('option', { value: k, text: T(n) }))); s.value = v; return s; };
  const eg = (words, code) => h('p', { class: 'muted small' }, words, ' ', h('code', { dir: 'auto', text: code }));
  // Settings
  const kind = pick(Object.entries(DV_KIND_NAMES), kind0 || b0.t, T('מה מותר בתא')), [blankL, blank] = check(T('תא ריק מותר'), !b0.nb);
  const [allL, all] = check(T('להחיל את השינויים על כל התאים שיש להם אותן הגדרות'), false);
  const area = h('div'), err = h('p', { class: 'sh-ch-err', role: 'alert', hidden: true });
  allL.hidden = !base || !base.g.some(x => minusG(x, g).length);
  let read = () => ({});   // what the fields say: the rule's own part, or { err }
  const draw = () => {
    const t = kind.value, mine = b0.t === t;
    area.textContent = ''; err.hidden = true; blankL.hidden = t === 'any';
    if (t === 'any') { area.append(h('p', { class: 'muted small', text: T('אפשר להקליד בתאים כל ערך.') })); read = () => ({}); }
    else if (t === 'list') {
      const src = inp(mine ? dvListOut(b0.a) : '', T('מקור הרשימה'), { ph: T('ערכים עם פסיקים ביניהם, או = וטווח של תאים'), focus: kind0 === 'list' }), [ddL, dd] = check(T('רשימה נפתחת בתוך התא'), !(mine && b0.nd));
      area.append(fld(T('מקור הרשימה'), src), eg(T('כותבים את הערכים עם פסיקים ביניהם, למשל:'), T('כן, לא, אולי')), eg(T('רשימה שכתובה בתאים: = והטווח שלהם, למשל:'), '=F2:F10'),
        eg(T('רשימה שתלויה בתא אחר: בתא כתוב שם מוגדר של טווח, והמקור הוא:'), '=INDIRECT(' + A1(ac.r, ac.c ? ac.c - 1 : 1) + ')'), ddL);
      read = () => { const x = dvListIn(src.value, WB, WS); return x.err ? x : { a: x.a, nd: !dd.checked }; };
    } else if (t === 'custom') {
      const here = A1(ac.r, ac.c), f = inp(mine ? '=' + b0.a : '=', T('נוסחה'), { ltr: true });
      area.append(fld(T('נוסחה'), f), eg(T('מה שמקלידים בתא מתקבל כשהנוסחה יוצאת נכונה (TRUE). כותבים אותה בשביל התא {0}, והיא נבדקת לכל תא כמו נוסחה שהועתקה אליו. למשל:', here), '=ISNUMBER(' + here + ')'));
      read = () => { const x = closeBrackets(String(f.value).trim().replace(/^=/, '')); return x && astOf(x) ? { a: tidyFormula(x) } : { err: T('לא הבנתי את הנוסחה. היא מתחילה ב-= , כמו נוסחה בתא.') }; };
    } else {
      const names = DV_VAL_NAMES[t] || DV_VAL_NAMES.num, op = pick(DV_OPS.map(k => [k, CF_OP_NAMES[k]]), mine ? b0.op : 'bw', T('תנאי'));
      const a = inp(mine ? dvValOut(b0.a, t) : '', T(names[0]), { ltr: true }), b = inp(mine ? dvValOut(b0.b, t) : '', T(names[1]), { ltr: true }), la = h('span'), fb = fld(T(names[1]), b);
      const two = () => op.value === 'bw' || op.value === 'nb', sync = () => { fb.hidden = !two(); la.textContent = T(names[two() ? 0 : 2]); };
      op.addEventListener('change', sync); sync();
      area.append(fld(T('תנאי@title'), op), h('label', { class: 'fld' }, la, a), fb, eg(T('אפשר לכתוב גם = וכתובת של תא או נוסחה, למשל:'), '=B1'));
      read = () => {
        const x = dvValIn(a.value), y = two() ? dvValIn(b.value) : null, nx = dvPlain(x), ny = dvPlain(y);
        if (x == null || (two() && y == null)) return { err: T(DV_NEED[t]) };
        if ((t === 'whole' || t === 'len') && [nx, ny].some(n => n != null && !Number.isInteger(n))) return { err: T(DV_NEED.whole) };
        if (nx != null && ny != null && nx > ny) return { err: T('הערך הראשון צריך להיות קטן מהשני, או שווה לו') };
        return { op: op.value, a: x, b: two() ? y : undefined };
      };
    }
  };
  kind.addEventListener('change', draw);
  draw();
  // Input Message, Error Alert
  const [seeL, see] = check(T('להציג את ההודעה כשבוחרים את התא'), !b0.np), pt = inp(b0.pt, T('כותרת'), { max: 32 }), pm = text(b0.pm, T('הודעה'), 255);
  const [warnL, warn] = check(T('להציג התראה כשמקלידים ערך לא תקין'), !b0.ne), es = pick(Object.entries(DV_ES_NAMES), b0.es || 'stop', T('סגנון')), et = inp(b0.et, T('כותרת'), { max: 32 }), em = text(b0.em, T('הודעה'), 225);
  const panes = { set: h('div', {}, fld(T('מה מותר בתא'), kind), area, blankL, allL, err), msg: h('div', { hidden: true }, seeL, fld(T('כותרת'), pt), fld(T('הודעה'), pm), h('p', { class: 'muted small', text: T('ההודעה מופיעה ליד התא כשבוחרים אותו, ומסבירה מה להקליד בו.') })),
    alert: h('div', { hidden: true }, warnL, fld(T('סגנון'), es), fld(T('כותרת'), et), fld(T('הודעה'), em), h('p', { class: 'muted small', text: T('בלי התראה אפשר להקליד בתא כל ערך. הסימון בעיגול עדיין מראה את הערכים הלא תקינים.') })) };
  const tabs = h('div', { class: 'seg', role: 'tablist' }, [['set', T('הגדרות')], ['msg', T('הודעת קלט')], ['alert', T('התראת שגיאה')]].map(([k, n]) => h('button', { type: 'button', role: 'tab', 'data-k': k, 'aria-selected': String(k === 'set'), onclick: () => show(k) }, n)));
  const show = k => { for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.k === k)); for (const [n, p] of Object.entries(panes)) p.hidden = n !== k; };
  const clear = () => { kind.value = 'any'; b0.t = 'any'; blank.checked = see.checked = warn.checked = true; pt.value = pm.value = et.value = em.value = ''; es.value = 'stop'; show('set'); draw(); return false; };
  const apply = () => {
    const x = read();
    if (x.err) { show('set'); err.textContent = x.err; err.hidden = false; return false; }
    // on the chosen cells; or, when asked, on every cell of the rule that was opened too
    const targets = all.checked && base ? joinG([...base.g.flatMap(y => minusG(y, g)), g]).slice(0, 50) : [g];
    const move = f => f == null ? f : shiftFormula(f, targets[0].r1 - ac.r, targets[0].c1 - ac.c);
    const rule = normDv({ ...x, t: kind.value, a: move(x.a), b: move(x.b), g: targets, id: all.checked && base ? base.id : null, nb: !blank.checked,
      pt: pt.value, pm: pm.value, np: !see.checked, es: es.value, et: et.value, em: em.value, ne: !warn.checked });
    let next = WS.dv;
    for (const y of targets) next = cutList(next, y);
    if (rule) next = [...next, rule].slice(-DV_MAX);
    const flat = l => JSON.stringify(l.map(r => ({ ...cfOut(r), id: 0 })));
    if (flat(next) !== flat(WS.dv)) edit(() => setProp(WS, 'dv', next));
  };
  modal({ title: T('אימות נתונים'), wide: true, body: h('div', { class: 'sh-dvd' }, tabs, panes.set, panes.msg, panes.alert), actions: [
    { label: T('ניקוי הכל'), run: clear }, { label: T('אישור'), kind: 'primary', run: apply }, { label: T('ביטול'), value: false }], onClose: () => focusGrid() });
}

/* --- data validation in Excel files. ExcelJS reads each rule cell by cell and changes its formulas, so the rules are
   written into each sheet's own part here, and read from it. A rule that points at another sheet goes into Excel
   2010's part of the sheet (extLst), where Excel itself keeps such rules --- */
const XL_DV = { whole: 'whole', decimal: 'decimal', list: 'list', date: 'date', time: 'time', len: 'textLength', custom: 'custom' };
const XL_ES = { warn: 'warning', info: 'information' };
const xlAttr = t => esc(t).replace(/\n/g, '&#10;');
const sqrefOf = rule => rule.g.map(g => A1(g.r1, g.c1) + (g.r1 === g.r2 && g.c1 === g.c2 ? '' : ':' + A1(g.r2, g.c2))).join(' ');
function dvXml(rule) {
  rule = fileRule(rule, true);
  const far = [rule.a, rule.b].some(f => f != null && tokenize(f).some(t => (t.t === 'ref' || t.t === 'name') && t.sheet != null)), ns = far ? 'x14:' : '', sq = sqrefOf(rule);
  let at = rule.t === 'any' ? '' : ` type="${XL_DV[rule.t]}"`;
  if (rule.es) at += ` errorStyle="${XL_ES[rule.es]}"`;
  if (rule.op && rule.op !== 'bw') at += ` operator="${XL_OPS[rule.op]}"`;
  if (!rule.nb) at += ' allowBlank="1"';
  if (rule.nd) at += ' showDropDown="1"';   // Excel's name for it says the opposite: 1 hides the arrow
  if (!rule.np) at += ' showInputMessage="1"';
  if (!rule.ne) at += ' showErrorMessage="1"';
  for (const [k, n] of [['et', 'errorTitle'], ['em', 'error'], ['pt', 'promptTitle'], ['pm', 'prompt']]) if (rule[k]) at += ` ${n}="${xlAttr(rule[k])}"`;
  const f = (n, v) => v == null ? '' : far ? `<x14:formula${n}><xm:f>${esc(xlFormula(v))}</xm:f></x14:formula${n}>` : `<formula${n}>${esc(xlFormula(v))}</formula${n}>`;
  return { far, xml: `<${ns}dataValidation${at}${far ? '' : ` sqref="${sq}"`}>${f(1, rule.a)}${f(2, rule.b)}${far ? `<xm:sqref>${sq}</xm:sqref>` : ''}</${ns}dataValidation>` };
}
async function addXlsxDv(buf) {
  const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf);
  for (let i = 0; i < WB.sheets.length; i++) {
    const s = WB.sheets[i], sp = `xl/worksheets/sheet${i + 1}.xml`, sf = zip.file(sp);
    if (!s.dv.length || !sf) continue;
    const parts = s.dv.map(dvXml), main = parts.filter(p => !p.far), ext = parts.filter(p => p.far);
    let sx = await sf.async('string');
    if (ext.length) {   // into the sheet's own extLst (its last element), or a new one
      const block = `<ext uri="{CCE6A557-97BC-4b89-ADB6-D9C93CAAB3DF}" xmlns:x14="${X14}"><x14:dataValidations count="${ext.length}" xmlns:xm="${XM}">${ext.map(p => p.xml).join('')}</x14:dataValidations></ext>`;
      const own = /<\/extLst>\s*<\/worksheet>\s*$/.test(sx) ? sx.lastIndexOf('<extLst>') : -1;
      sx = own >= 0 ? sx.slice(0, own + 8) + block + sx.slice(own + 8) : sx.replace(/<\/worksheet>\s*$/, `<extLst>${block}</extLst></worksheet>`);
    }
    if (main.length) {
      const pos = Math.min(...XL_AFTER_DV.map(t => sx.indexOf(t)).filter(p => p >= 0));
      sx = sx.slice(0, pos) + `<dataValidations count="${main.length}">${main.map(p => p.xml).join('')}</dataValidations>` + sx.slice(pos);
    }
    zip.file(sp, sx);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
/* the rules of an Excel file, sheet by sheet (by the sheet's name in the file); null for a rule of a kind that isn't
   here */
async function readXlsxDv(buf) {
  const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf), dp = new DOMParser(), out = new Map();
  const text = async p => { const f = zip.file(p); return f ? f.async('string') : null; };
  const wbt = await text('xl/workbook.xml'), wrt = await text(relsOf('xl/workbook.xml'));
  if (!wbt || !wrt) return out;
  const wbx = dp.parseFromString(wbt, 'application/xml'), rels = new Map(xdesc(dp.parseFromString(wrt, 'application/xml'), 'Relationship').map(r => [xat(r, 'Id'), partPath('xl/workbook.xml', xat(r, 'Target') || '')]));
  const on = (e, a) => { const v = xat(e, a); return v === '1' || v === 'true'; };
  for (const sh of xdesc(wbx, 'sheet')) {
    const rid = [...sh.attributes].find(a => a.localName === 'id' && /relationships/.test(a.namespaceURI || '')), path = rid && rels.get(rid.value), src = path && await text(path);
    if (!src || !src.includes('dataValidation')) continue;
    const list = [];
    for (const e of xdesc(dp.parseFromString(src, 'application/xml'), 'dataValidation')) {
      const x14 = e.namespaceURI === X14, type = xat(e, 'type') || 'none', t = type === 'none' ? 'any' : Object.keys(XL_DV).find(k => XL_DV[k] === type);
      const f = n => { const k = xkid(e, 'formula' + n), v = k && (x14 ? (xkid(k, 'f') || k).textContent : k.textContent).trim().replace(/^=/, ''); return v ? fromXl(v) : null; };
      list.push(t ? { t, op: Object.keys(XL_OPS).find(k => XL_OPS[k] === (xat(e, 'operator') || 'between')), a: f(1), b: f(2), ref: (x14 ? (xkid(e, 'sqref') || e).textContent : xat(e, 'sqref')) || '',
        nb: !on(e, 'allowBlank'), nd: on(e, 'showDropDown'), np: !on(e, 'showInputMessage'), ne: !on(e, 'showErrorMessage'), es: Object.keys(XL_ES).find(k => XL_ES[k] === xat(e, 'errorStyle')),
        pt: xat(e, 'promptTitle'), pm: xat(e, 'prompt'), et: xat(e, 'errorTitle'), em: xat(e, 'error') } : null);
    }
    out.set(xat(sh, 'name'), list);
  }
  return out;
}
/* the file's rules onto its sheets. The ones that couldn't come are counted for the report, and so are the ones whose
   formulas use what isn't here: they stay, and are written back to a file, but nothing is checked by them */
async function importDv(buf, nb, xlNames, rep) {
  let got;
  try { got = await readXlsxDv(buf); } catch (e) { console.warn(e); return; }
  const add = k => rep.set(k, (rep.get(k) || 0) + 1);
  for (const [name, list] of got) {
    const s = nb.sheets[xlNames.indexOf(name)];
    if (!s) continue;
    for (const x of list) {
      const raw = x ? x.ref.trim().split(/\s+/).map(parseRange).filter(Boolean) : [];
      if (x && x.t === 'any' && !x.pt && !x.pm) continue;
      // Excel lists a rule's cells one by one; here they are ranges, 50 to a rule. The file's formulas are for the
      // corner of the box around all of them (see fileRule), and each rule's are written again for its own corner
      const all = raw.length ? joinG(raw) : [], before = s.dv.length, br = Math.min(...raw.map(g => g.r1)), bc = Math.min(...raw.map(g => g.c1));
      for (let i = 0; i < all.length && s.dv.length < DV_MAX; i += 50) {
        const g = all.slice(i, i + 50), rule = normDv(cfFormulas({ ...x, g }, f => wrapShift(f, g[0].r1 - br, g[0].c1 - bc)));
        if (rule) s.dv.push(rule);
      }
      if (s.dv.length === before) add('valid');
      else if ([x.a, x.b].some(f => { const m = f != null ? missingIn(f, s, nb) : null; return !!m && !!m.fn; })) add('dvfn');
    }
  }
}

/* --- for Claude: a rule from its description { range, type (list, whole_number, decimal, date, time, text_length,
   custom, any; none takes rules away), values or source for a list, operator with value and value2, formula, and the
   messages }, and a rule read back in the same words --- */
const DV_API = { list: 'list', whole_number: 'whole', decimal: 'decimal', date: 'date', time: 'time', text_length: 'len', custom: 'custom', any: 'any' };
const DV_API_OPS = { between: 'bw', not_between: 'nb', equal: 'eq', not_equal: 'ne', greater_than: 'gt', less_than: 'lt', greater_or_equal: 'ge', less_or_equal: 'le' };
function dvFromSpec(c, g, book) {
  const t = DV_API[c.type] || (Array.isArray(c.values) || c.source ? 'list' : null), val = v => v == null ? null : typeof v === 'number' ? String(v) : dvValIn(String(v));
  if (!t) return null;
  const x = { g, t, nb: c.allow_blank === false, pt: c.input_title, pm: c.input_message, es: { warning: 'warn', information: 'info' }[c.error_style], et: c.error_title, em: c.error_message, ne: c.show_error === false };
  if (t === 'list') {
    const src = Array.isArray(c.values) && c.values.length ? { a: quoted(c.values.map(v => String(v).replace(/,/g, ' ').trim()).filter(Boolean).join(',')) } : c.source ? dvListIn('=' + String(c.source).replace(/^=/, ''), book) : {};
    if (!src.a) return null;
    Object.assign(x, { a: src.a, nd: c.dropdown === false });
  } else if (t === 'custom') {
    const f = closeBrackets(String(c.formula || c.value || '').trim().replace(/^=/, ''));
    if (!f || !astOf(f)) return null;
    x.a = tidyFormula(f, book);
  } else if (t !== 'any') {
    Object.assign(x, { a: val(c.value ?? c.min), b: val(c.value2 ?? c.max) });
    x.op = DV_API_OPS[c.operator] || (x.b != null ? 'bw' : 'eq');
    if (x.a == null || ((x.op === 'bw' || x.op === 'nb') && x.b == null)) return null;
  }
  return normDv(x);
}
function dvToSpec(rule) {
  const o = { range: rule.g.map(rangeA1).join(' '), type: Object.keys(DV_API).find(k => DV_API[k] === rule.t) }, lit = rule.t === 'list' ? astOf(rule.a) : null;
  const val = f => { const n = dvPlain(f); return n == null ? '=' + f : rule.t === 'date' ? fmtNumber(n, n % 1 ? 'yyyy-mm-dd hh:mm' : 'yyyy-mm-dd').t : rule.t === 'time' ? fmtNumber(n, 'hh:mm:ss').t : n; };
  if (lit && lit.t === 'str') o.values = lit.v.split(',').map(t => t.trim()).filter(Boolean);
  else if (rule.t === 'list') o.source = '=' + rule.a;
  else if (rule.t === 'custom') o.formula = '=' + rule.a;
  else if (rule.t !== 'any') { o.operator = Object.keys(DV_API_OPS).find(k => DV_API_OPS[k] === rule.op); o.value = val(rule.a); if (rule.b != null) o.value2 = val(rule.b); }
  if (rule.nd) o.dropdown = false;
  if (rule.nb) o.allow_blank = false;
  if (rule.pt) o.input_title = rule.pt;
  if (rule.pm) o.input_message = rule.pm;
  if (rule.es) o.error_style = rule.es === 'warn' ? 'warning' : 'information';
  if (rule.et) o.error_title = rule.et;
  if (rule.em) o.error_message = rule.em;
  if (rule.ne) o.show_error = false;
  return o;
}

window.INK_SHEET = {
  load, unload, replace, preview, chooser, readFile, repLines, fromSpec, forAI, writeCells,
  body: cur => WB && LOADED === cur ? JSON.stringify(bookOut(WB)) : null,
  count: () => WB ? WB.sheets.length : 0,
  key: onKey, esc: onEsc,
  xlsx: writeXlsx, csv: () => csvOut(WS), pdf: sheetPdf, print: sheetPrint,
  norm: body => JSON.stringify(bookOut(parseBook(body))),
  focus: () => focusGrid(),
  commit: () => { if (ED.on && LOADED === S.cur) endEdit(true); },
  refresh: () => { if (WB) refresh(); },
  ready: cur => !!WB && LOADED === cur,
  cellCount: () => WB ? WB.sheets.reduce((n, s) => n + s.cells.size, 0) : 0,
  room: { start: roomStart, stop: roomStop, entries: roomEntries, changes: roomChanges, value: roomValue, norm: roomNorm, apply: roomApply, book: roomBook, presence: roomPresence, peers: roomPeers, go: roomGo },
};

// ==SHEET-END==
})();
