/* Floating Ink: spreadsheets, like Excel. This file loads only when a spreadsheet is opened or made
   (loadSheetKit in index.html), so documents and presentations never wait for it.
   A spreadsheet is a document in the same list, store, versions, trash and backup, whose meta.kind is
   'sheet' and whose body is JSON (README "גיליונות"):
   { v: 1, dir, active, sheets: [{ id, name, dir, cells: { A1: { v | e, f, x, st } }, cw, rh, hc, hr, cs, rs, ds,
     fr, fc, merges, af, gl, tab, dw, dh, ac, zoom }] }
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
for (const c of ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A']) ERR[c] = new Err(c);
const isErr = v => v instanceof Err;
const E_DIV = ERR['#DIV/0!'], E_VAL = ERR['#VALUE!'], E_REF = ERR['#REF!'], E_NAME = ERR['#NAME?'], E_NUM = ERR['#NUM!'];

/* =========================================================
   the workbook. Cells are a Map by KEY(r, c), each { v, f?, x?, st? }: v the value (for a formula, its last
   result), f the formula without its "=", x a formula this app can't compute (it keeps the value the file had),
   st the look. A cell object is never changed in place once it is in a sheet (only a formula's result is
   written onto it), so undo can keep the old ones
   ========================================================= */
let WB = null;          // the open workbook
let WS = null;          // its sheet on screen
let LOADED = null;      // the S.cur that WB belongs to
const DEF_FONT = 'Arial', DEF_FS = 10, DEF_W = 100, DEF_H = 21;
const sid = () => { let s = ''; while (s.length < 8) s += Math.random().toString(36).slice(2); return s.slice(0, 8); };
function newSheet(name, dir) {
  return { id: sid(), name, dir, cells: new Map(), cw: new Map(), rh: new Map(), hc: new Set(), hr: new Set(), cs: new Map(), rs: new Map(), ds: null,
    fr: 0, fc: 0, merges: [], af: null, gl: true, tab: null, dw: DEF_W, dh: DEF_H, ac: { r: 0, c: 0 }, zoom: 100 };
}
const sheetWord = n => T('גיליון{0}', n);
/* Excel's rules for a sheet's name: up to 31 letters, none of : \ / ? * [ ], no ' at either end */
const cleanName = n => String(n ?? '').replace(/[\x00-\x1f:\\/?*[\]]/g, '').replace(/^'+|'+$/g, '').trim().slice(0, 31);
function freeName(n, taken) {
  if (!taken.has(n.toLowerCase())) return n;
  for (let i = 2; ; i++) { const t = n.slice(0, 26) + ' (' + i + ')'; if (!taken.has(t.toLowerCase())) return t; }
}
const HEX = /^#[0-9a-f]{6}$/i, BORDER = /^[123][sdo=]#[0-9a-f]{6}$/i;
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
function normCell(x) {
  if (!x || typeof x !== 'object') return null;
  const c = {};
  if (typeof x.f === 'string' && x.f.trim()) c.f = x.f.slice(0, 8000);
  if (typeof x.e === 'string' && ERR[x.e]) c.v = ERR[x.e];
  else if (typeof x.v === 'number' && Number.isFinite(x.v)) c.v = x.v;
  else if (typeof x.v === 'string') c.v = x.v.slice(0, 32767);
  else if (typeof x.v === 'boolean') c.v = x.v;
  if (c.f && x.x === true) c.x = true;
  const st = normStyle(x.st); if (st) c.st = st;
  return c.f || c.v !== undefined || c.st ? c : null;
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
  return book;
}
function parseBook(body) { let j = null; try { j = JSON.parse(body); } catch {} return normBook(j); }
function cellOut(c) {
  const j = {};
  if (c.f) j.f = c.f;
  if (isErr(c.v)) j.e = c.v.c; else if (c.v !== undefined && c.v !== null) j.v = c.v;
  if (c.x) j.x = true;
  if (c.st) j.st = c.st;
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
  if (s.ri && s.ri.length) o.ri = packIds(s.ri, s.id + '/ri');
  if (s.ci && s.ci.length) o.ci = packIds(s.ci, s.id + '/ci');
  return o;
}
const bookOut = b => ({ v: 1, dir: b.dir, active: b.sheets.includes(WS) ? b.sheets.indexOf(WS) : clamp(b.active | 0, 0, b.sheets.length - 1), sheets: b.sheets.map(sheetOut) });

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
  err: /#(?:NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A)/iy,
  sheet: /(?:'((?:[^']|'')+)'|([\p{L}_][\p{L}\p{N}_.]*))!/uy,
  cell: /(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d{0,6})(?::(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d{0,6}))?(?![\p{L}\p{N}_(.!:$])/uy,
  cols: /(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![\p{L}\p{N}_(.!$])/uy,
  rows: /(\$?)([1-9]\d{0,6}):(\$?)([1-9]\d{0,6})(?![\p{L}\p{N}_(.!$])/uy,
  num: /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y,
  fn: /(?:_xlfn\.|_xlws\.)?[A-Za-z_][A-Za-z0-9_.]*(?=\s*\()/y,
  name: /[\p{L}_\\][\p{L}\p{N}_.?\\]*/uy,
  op: /<>|<=|>=|[-+*/^&=<>%]/y,
};
const execAt = (re, s, i) => { re.lastIndex = i; return re.exec(s); };
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
function tokenize(src) {
  const toks = [];
  let i = 0, bad = false;
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
    if (r) { toks.push({ t: 'ref', s: src.slice(i, r.end), sheet, q, p: i, ...r }); i = r.end; continue; }
    if (sheet != null && (m = execAt(RX.err, src, j)) && m[0].toUpperCase() === '#REF!') { toks.push({ t: 'err', s: src.slice(i, j + 5), v: '#REF!', p: i }); i = j + 5; continue; }
    if ((m = execAt(RX.num, src, i))) { toks.push({ t: 'num', s: m[0], v: +m[0], p: i }); i += m[0].length; continue; }
    if ((m = execAt(RX.fn, src, i))) { toks.push({ t: 'fn', s: m[0], n: m[0].replace(/^_xl(fn|ws)\./i, '').toUpperCase(), p: i }); i += m[0].length; continue; }
    if ((m = execAt(RX.name, src, i))) { const u = m[0].toUpperCase(); toks.push(u === 'TRUE' || u === 'FALSE' ? { t: 'bool', s: m[0], v: u === 'TRUE', p: i } : { t: 'name', s: m[0], p: i }); i += m[0].length; continue; }
    if ((m = execAt(RX.op, src, i))) { toks.push({ t: 'op', s: m[0], p: i }); i += m[0].length; continue; }
    if ('(),;'.includes(ch)) { toks.push({ t: ch === ';' ? ',' : ch, s: ch, p: i }); i++; continue; }
    toks.push({ t: 'bad', s: ch, p: i }); bad = true; i++;
  }
  toks.bad = bad;
  return toks;
}
/* Excel's order: - (negation) % ^ * / + - & comparisons. ^ goes left to right, and -2^2 is 4 */
const BIN = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
function parseFormula(src) {
  const all = tokenize(src);
  if (all.bad) throw new Error('bad');
  const toks = all.filter(t => t.t !== 'ws');
  let i = 0;
  const peek = () => toks[i], take = () => toks[i++];
  const expect = t => { const x = take(); if (!x || x.t !== t) throw new Error(t); };
  function prim() {
    const t = take();
    if (!t) throw new Error('end');
    switch (t.t) {
      case 'num': return { t: 'num', v: t.v };
      case 'str': return { t: 'str', v: t.v };
      case 'bool': return { t: 'bool', v: t.v };
      case 'err': return { t: 'err', v: ERR[t.v] || E_REF };
      case 'ref': return { t: 'ref', sheet: t.sheet, k: t.k, g: G4(t.r1, t.c1, t.r2, t.c2) };
      case 'name': return { t: 'name', n: t.s };
      case 'fn': {
        expect('(');
        const args = [];
        if (peek() && peek().t === ')') { take(); return { t: 'fn', n: t.n, args }; }
        for (;;) {
          const p = peek();
          args.push(p && (p.t === ',' || p.t === ')') ? { t: 'miss' } : expr(0));
          const x = take();
          if (!x) throw new Error('end');
          if (x.t === ')') break;
          if (x.t !== ',') throw new Error(',');
        }
        return { t: 'fn', n: t.n, args };
      }
      case '(': { const e = expr(0); expect(')'); return e; }
      case 'op': if (t.s === '-' || t.s === '+') return { t: 'neg', neg: t.s === '-', a: expr(6) }; break;
    }
    throw new Error('token');
  }
  function expr(min) {
    let left = prim();
    for (;;) {
      const t = peek();
      if (!t || t.t !== 'op') break;
      if (t.s === '%') { take(); left = { t: 'pct', a: left }; continue; }
      const p = BIN[t.s];
      if (p == null || p < min) break;
      take();
      left = { t: 'bin', op: t.s, a: left, b: expr(p + 1) };
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
  else if (n.a) { walk(n.a, fn); if (n.b) walk(n.b, fn); }
}

/* --- values: Excel's rules for turning one kind into another --- */
let CTX = { si: 0, r: 0, c: 0 };   // the cell whose formula is being worked out
const COLL = new Intl.Collator(LOCALE, { sensitivity: 'accent', numeric: false });
const sheetNamed = name => { if (name == null) return WB.sheets[CTX.si]; const n = name.toLowerCase(); return WB.sheets.find(s => s.name.toLowerCase() === n) || null; };
function valAt(s, r, c) { const cell = s.cells.get(KEY(r, c)); return cell && cell.v !== undefined ? cell.v : null; }
function toNum(v) {
  if (typeof v === 'number') return v;
  if (v == null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isErr(v)) return v;
  const p = String(v).trim() ? parseInput(String(v).trim()) : null;
  return p && !p.f && typeof p.v === 'number' ? p.v : E_VAL;
}
function toStr(v) { return typeof v === 'string' ? v : v == null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : isErr(v) ? v.c : genText(v, 15); }
function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v == null) return false;
  if (isErr(v)) return v;
  const u = String(v).trim().toUpperCase();
  return u === 'TRUE' ? true : u === 'FALSE' ? false : E_VAL;
}
/* one value where a range stands alone: the cell of the range in the formula's own row (or column) */
function scal(v) {
  if (!v || !v.rng) return v;
  const { s, g } = v;
  if (g.r1 === g.r2 && g.c1 === g.c2) return valAt(s, g.r1, g.c1);
  if (g.c1 === g.c2 && CTX.r >= g.r1 && CTX.r <= g.r2) return valAt(s, CTX.r, g.c1);
  if (g.r1 === g.r2 && CTX.c >= g.c1 && CTX.c <= g.c2) return valAt(s, g.r1, CTX.c);
  return E_VAL;
}
function compare(op, a, b) {
  if (a == null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b == null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const rank = v => typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2, ra = rank(a), rb = rank(b);
  let c;
  if (ra !== rb) c = ra < rb ? -1 : 1;
  else if (ra === 1) c = a.toLowerCase() === b.toLowerCase() ? 0 : COLL.compare(a, b) < 0 ? -1 : 1;
  else c = a < b ? -1 : a > b ? 1 : 0;
  return op === '=' ? c === 0 : op === '<>' ? c !== 0 : op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
}
function binop(op, a, b) {
  if (isErr(a)) return a;
  if (isErr(b)) return b;
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
function ev(n) {
  switch (n.t) {
    case 'num': case 'str': case 'bool': case 'err': return n.v;
    case 'miss': return null;
    case 'name': return E_NAME;
    case 'ref': { const s = sheetNamed(n.sheet); if (!s) return E_REF; return n.k === 'c' ? valAt(s, n.g.r1, n.g.c1) : { rng: true, s, g: n.g }; }
    case 'fn': { const f = FUNCS[n.n]; if (!f) return E_NAME; const [lo, hi] = f.n; return n.args.length < lo || n.args.length > hi ? E_VAL : f.f(n.args); }
    case 'neg': { const v = toNum(scal(ev(n.a))); return isErr(v) ? v : n.neg ? -v : v; }
    case 'pct': { const v = toNum(scal(ev(n.a))); return isErr(v) ? v : v / 100; }
    case 'bin': return binop(n.op, scal(ev(n.a)), scal(ev(n.b)));
  }
  return E_VAL;
}
/* each value in a range: fn(value, r, c) for every cell that holds one; a value fn returns stops it */
function eachIn(rv, fn) {
  const { s, g } = rv, area = (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1);
  if (area > s.cells.size * 2) {
    for (const [k, cell] of s.cells) { if (cell.v == null) continue; const r = kr(k), c = kc(k); if (inG(g, r, c)) { const x = fn(cell.v, r, c); if (x !== undefined) return x; } }
  } else {
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const cell = s.cells.get(KEY(r, c)); if (cell && cell.v != null) { const x = fn(cell.v, r, c); if (x !== undefined) return x; } }
  }
}
/* the numbers SUM and its family work on. From a reference only its numbers count (text and TRUE/FALSE there are
   skipped); typed in directly, TRUE/FALSE and text that reads as a number count too. An error stops them, but COUNT
   just leaves it out */
function numsOf(args, count) {
  const out = [];
  for (const a of args) {
    if (a.t === 'miss') { out.push(0); continue; }
    let v;
    if (a.t === 'ref') { const s = sheetNamed(a.sheet); v = s ? { rng: true, s, g: a.g } : E_REF; }
    else v = ev(a);
    if (v && v.rng) { const e = eachIn(v, x => { if (typeof x === 'number') out.push(x); else if (isErr(x) && !count) return x; }); if (e) return e; continue; }
    if (isErr(v)) { if (count) continue; return v; }
    if (typeof v === 'number') out.push(v);
    else if (typeof v === 'boolean') out.push(v ? 1 : 0);
    else if (v == null) out.push(0);
    else { const n = toNum(v); if (isErr(n)) { if (count) continue; return n; } out.push(n); }
  }
  return out;
}
const sumOf = n => { let s = 0; for (const x of n) s += x; return s; };
/* the functions: n is how many arguments each takes */
const FUNCS = {
  SUM: { n: [1, 255], f: a => { const n = numsOf(a); return isErr(n) ? n : sumOf(n); } },
  AVERAGE: { n: [1, 255], f: a => { const n = numsOf(a); return isErr(n) ? n : n.length ? sumOf(n) / n.length : E_DIV; } },
  MIN: { n: [1, 255], f: a => { const n = numsOf(a); if (isErr(n)) return n; let m = Infinity; for (const x of n) if (x < m) m = x; return n.length ? m : 0; } },
  MAX: { n: [1, 255], f: a => { const n = numsOf(a); if (isErr(n)) return n; let m = -Infinity; for (const x of n) if (x > m) m = x; return n.length ? m : 0; } },
  COUNT: { n: [1, 255], f: a => numsOf(a, true).length },
  IF: { n: [2, 3], f: a => {
    const c = toBool(scal(ev(a[0])));
    if (isErr(c)) return c;
    const pick = c ? a[1] : a[2];
    if (!pick) return false;
    return pick.t === 'miss' ? 0 : ev(pick);
  } },
};
/* the words the formula helper shows: what each function does, and its arguments */
const FN_INFO = {
  SUM: [N_('מחבר את כל המספרים'), N_('מספר1, [מספר2], ...'), 'SUM(B2:B10)'],
  AVERAGE: [N_('הממוצע של המספרים'), N_('מספר1, [מספר2], ...'), 'AVERAGE(B2:B10)'],
  MIN: [N_('המספר הקטן ביותר'), N_('מספר1, [מספר2], ...'), 'MIN(B2:B10)'],
  MAX: [N_('המספר הגדול ביותר'), N_('מספר1, [מספר2], ...'), 'MAX(B2:B10)'],
  COUNT: [N_('כמה תאים יש בהם מספר'), N_('ערך1, [ערך2], ...'), 'COUNT(B2:B10)'],
  IF: [N_('בודק תנאי: ערך אחד אם הוא נכון, ואחר אם לא'), N_('תנאי, אם נכון, [אם לא נכון]'), 'IF(B2>=55,"✓","✗")'],
};
/* a formula that can't be worked out here: which function (or name) it uses that this app doesn't have */
function unknownIn(f) {
  const a = astOf(f);
  if (!a) return '?';
  let bad = null;
  walk(a, n => { if (!bad && n.t === 'fn' && !FUNCS[n.n]) bad = n.n; else if (!bad && n.t === 'name') bad = n.n; });
  return bad;
}

/* --- recalculating: every formula, in an order where each comes after the formulas it reads. Formulas that read
   each other in a loop show 0, as in Excel, and the status line names the first of them --- */
let CIRC = null;
function rowsIn(rows, lo, hi, fn) {
  let a = 0, b = rows.length;
  while (a < b) { const m = (a + b) >> 1; if (rows[m] < lo) a = m + 1; else b = m; }
  for (let i = a; i < rows.length && rows[i] <= hi; i++) fn(rows[i]);
}
function recalc() {
  if (!WB) return;
  const sheets = WB.sheets, nodes = [], at = new Map(), cols = sheets.map(() => new Map());
  sheets.forEach((s, si) => {
    for (const [k, c] of s.cells) {
      if (!c.f) continue;
      at.set(si * 4e10 + k, nodes.length);
      nodes.push({ si, k, c });
      const col = kc(k); let l = cols[si].get(col); if (!l) cols[si].set(col, l = []); l.push(kr(k));
    }
  });
  for (const m of cols) for (const l of m.values()) l.sort((a, b) => a - b);
  const byName = new Map(sheets.map((s, i) => [s.name.toLowerCase(), i]));
  const indeg = new Int32Array(nodes.length), out = new Array(nodes.length);
  nodes.forEach((n, i) => {
    const ast = !n.c.x && astOf(n.c.f);
    if (!ast) return;
    const seen = new Set();
    walk(ast, x => {
      if (x.t !== 'ref') return;
      const si = x.sheet == null ? n.si : byName.get(x.sheet.toLowerCase());
      if (si == null) return;
      const g = x.g, fc = cols[si];
      const dep = (r, c) => { const j = at.get(si * 4e10 + KEY(r, c)); if (j != null && !seen.has(j)) { seen.add(j); (out[j] || (out[j] = [])).push(i); indeg[i]++; } };
      if (g.c2 - g.c1 + 1 > fc.size) { for (const [c, rows] of fc) if (c >= g.c1 && c <= g.c2) rowsIn(rows, g.r1, g.r2, r => dep(r, c)); }
      else for (let c = g.c1; c <= g.c2; c++) { const rows = fc.get(c); if (rows) rowsIn(rows, g.r1, g.r2, r => dep(r, c)); }
    });
  });
  const run = (list, deg) => {
    const q = list.filter(i => !deg[i]);
    for (let h = 0; h < q.length; h++) { const i = q[h]; evalCell(nodes[i]); for (const j of out[i] || []) if (--deg[j] === 0) q.push(j); }
    return q.length;
  };
  const done = run(nodes.map((_, i) => i), indeg);
  CIRC = null;
  if (done === nodes.length) return;
  // the formulas left read each other in a loop, or read one that does: the loops show 0, and what reads them is worked out after
  const left = []; for (let i = 0; i < nodes.length; i++) if (indeg[i] > 0) left.push(i);
  const loop = loopsIn(left, out);
  for (const i of loop) { nodes[i].c.v = 0; if (!CIRC) CIRC = nodes[i]; }
  const rest = left.filter(i => !loop.has(i)), inRest = new Set(rest), deg = new Int32Array(nodes.length);
  for (const i of rest) for (const j of out[i] || []) if (inRest.has(j)) deg[j]++;
  run(rest, deg);
}
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
  CTX = { si: n.si, r: kr(n.k), c: kc(n.k) };
  let v;
  try { v = scal(ev(ast)); } catch { v = E_VAL; }
  if (v == null) v = 0;
  else if (v && v.rng) v = E_VAL;
  else if (typeof v === 'number' && !Number.isFinite(v)) v = E_NUM;
  c.v = v;
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
  if (t.k === 'c') return p + cell(g.r1, g.c1, a[0], a[1]);
  if (t.k === 'a') return p + cell(g.r1, g.c1, a[0], a[1]) + ':' + cell(g.r2, g.c2, a[2], a[3]);
  if (t.k === 'C') return p + (a[1] ? '$' : '') + colName(g.c1) + ':' + (a[3] ? '$' : '') + colName(g.c2);
  return p + (a[0] ? '$' : '') + (g.r1 + 1) + ':' + (a[2] ? '$' : '') + (g.r2 + 1);
}
function mapRefs(f, fn) {
  const toks = tokenize(f);
  let changed = false;
  const out = toks.map(t => { if (t.t !== 'ref') return t.s; const n = fn(t); if (n == null || n === t.s) return t.s; changed = true; return n; });
  return changed ? out.join('') : f;
}
/* the way Excel keeps a typed formula: names and references in capitals, a sheet's name the way it is written */
function tidyFormula(f, book = WB) {
  return tokenize(f).map(t => {
    if (t.t === 'fn') return t.s.replace(/^(_xl(?:fn|ws)\.)?(.*)$/i, (m, p, n) => (p ? p.toLowerCase() : '') + n.toUpperCase());
    if (t.t === 'ref') { const s = t.sheet == null || !book ? null : book.sheets.find(x => x.name.toLowerCase() === t.sheet.toLowerCase()); return refText(t, t, s ? s.name : t.sheet); }
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
const renameInFormula = (f, oldName, newName) => mapRefs(f, t => t.sheet != null && t.sheet.toLowerCase() === oldName.toLowerCase() ? refText(t, t, newName) : null);
const dropSheetInFormula = (f, name) => mapRefs(f, t => t.sheet != null && t.sheet.toLowerCase() === name.toLowerCase() ? '#REF!' : null);

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
  return { r, c };
}
function usedRange(s) {
  let r2 = -1, c2 = -1;
  for (const [k, x] of s.cells) { if (!hasVal(x) && !x.st) continue; const r = kr(k), c = kc(k); if (r > r2) r2 = r; if (c > c2) c2 = c; }
  for (const m of s.merges) { r2 = Math.max(r2, m.r2); c2 = Math.max(c2, m.c2); }
  return r2 < 0 ? null : { r1: 0, c1: 0, r2, c2 };
}
/* the block of filled cells around a cell, the way Excel finds a table (for sorting, filtering and AutoSum) */
function region(s, r, c) {
  const g = { r1: r, c1: c, r2: r, c2: c }, full = (rr, cc) => hasVal(cellAt(s, rr, cc));
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
  const tx = TX = { cells: new Map(), props: new Map(), book: null, sel0: selSnap() };
  try { fn(); } finally { TX = null; }
  const cells = [], props = [];
  for (const x of tx.cells.values()) { const after = x.s.cells.get(x.k) || null; if (after !== x.before) cells.push({ ...x, after }); }
  for (const x of tx.props.values()) { const after = x.s[x.name]; if (after !== x.before) props.push({ ...x, after }); }
  let book = null;
  if (tx.book) { const a = { sheets: [...WB.sheets], dir: WB.dir }, b = tx.book; if (a.dir !== b.dir || a.sheets.length !== b.sheets.length || a.sheets.some((s, i) => s !== b.sheets[i])) book = { before: b, after: a }; }
  if (!cells.length && !props.length && !book) { refresh(); return false; }
  HIST.list.length = HIST.at;
  HIST.list.push({ cells, props, book, sel0: tx.sel0, sel1: selSnap() });
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
  for (const s of WB.sheets) filterRows(s);
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
  if (SHOWF && x.f) return { t: '=' + x.f, k: 's' };
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
function shown(s, r, c) { const x = cellAt(s, r, c); return x ? view(x).t : ''; }
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
  for (const [L, rr, cc] of layers) drawSel(L, rr, cc, g);
  if (RM.peers.length) for (const [L, rr, cc] of layers) drawPeers(L, rr, cc);
  for (const L of [V.body, V.top, V.side, V.corner]) sweep(L);
  placeEditor();
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
  const s = WS, looks = s.ds || s.cs.size || s.rs.size, done = new Set();
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
        drawCell(L, 'm' + m.r1 + ',' + m.c1, a, a ? a.st : emptyLook(s, m.r1, m.c1), colX(m.c1), rowY(m.r1), spanW(m.c1, m.c2), spanH(m.r1, m.r2), null, true);
        continue;
      }
      const x = cellAt(s, r, c), st = x ? x.st : looks ? emptyLook(s, r, c) : null;
      if (!x && !(st && st.bg)) continue;
      drawCell(L, 'c' + r + ',' + c, x, st, colX(c), rowY(r), w, hh, { r, c });
    }
  }
}
function drawCell(L, key, x, st, X, Y, w, hgt, spill, merged) {
  const e = part(L, key, 'sh-c');
  const vw = x ? view(x) : { t: '', k: '' }, size = fontPx(st), font = fontOf(st, size);
  let text = vw.t, ew = w, ex = X;
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
          if (n < 0 || n >= EXT.cols || Math.abs(n - spill.c) > 30 || hasVal(cellAt(WS, spill.r, n)) || (WS.merges.length && mergeAt(WS, spill.r, n))) break;
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
  const bg = (st && st.bg) || '', color = vw.col || (st && st.c) || '', va = (st && st.va) || 'b', wrap = !!(st && st.wr);
  place(e, ex, Y, ew, hgt);
  const sig = [text, al, va, bg, color, font, st && st.u ? 1 : 0, st && st.s ? 1 : 0, wrap ? 1 : 0, vw.k, merged ? 1 : 0, ew !== w ? 1 : 0].join('|');
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
  if (text) {
    const sp = document.createElement('span');
    sp.textContent = text;
    sp.dir = vw.k === 's' ? 'auto' : 'ltr';
    e.append(sp);
  }
}
/* borders sit on the line between two cells, so two neighbors' borders meet as one */
const BD_CSS = { s: 'solid', d: 'dashed', o: 'dotted', '=': 'double' };
function drawBorders(L, rr, cc) {
  const s = WS, looks = s.ds || s.cs.size || s.rs.size;
  for (let r = rr[0]; r <= rr[1]; r++) {
    if (!rowH(r)) continue;
    for (let c = cc[0]; c <= cc[1]; c++) {
      if (!colW(c)) continue;
      const x = cellAt(s, r, c), st = x ? x.st : looks ? emptyLook(s, r, c) : null;
      if (!st || !(st.bt || st.bb || st.bs || st.be)) continue;
      for (const k of ['bt', 'bb', 'bs', 'be']) {
        const b = st[k];
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
  if (ED.on && ED.refs) ED.refs.forEach((x, i) => { if (x.sid !== WS.id) return; const b = box('ref' + i, x.g, 'sh-ref', true); if (b) b.e.style.setProperty('--rc', REF_COLORS[x.n % REF_COLORS.length]); });
}
const REF_COLORS = ['#2f6fdf', '#d9383a', '#7a3fc9', '#1d8249', '#c2388a', '#d9701a', '#0e8a8c', '#8a5a1e'];

/* =========================================================
   choosing cells, and writing in them. One textarea (V.ed) always has the keyboard: invisible on the active cell until
   a key is typed, then it is the cell's editor. The formula bar (V.bar) is a second view of the same text
   ========================================================= */
/* mode 'enter' (started by typing: arrows finish the entry, or point at cells in a formula) or 'edit' (F2, a double
   click, the formula bar: arrows move in the text). point: the reference being pointed at, as text positions */
const ED = { on: false, mode: 'enter', r: 0, c: 0, sid: '', from: 'cell', orig: '', refs: null, point: null, all: false };
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
  const p = RM.on && RM.peers.find(x => x.pr && x.pr.ed && x.pr.ed.s === WS.id && x.pr.ed.r === r && x.pr.ed.c === c);
  if (p) { V.ed.value = ''; toast(T('התא הזה בעריכה אצל {0}', p.name), { icon: 'edit' }); return; }
  Object.assign(ED, { on: true, mode, r, c, sid: WS.id, from, point: null, refs: null, all: false });
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
function endEdit(commit, move) {
  if (!ED.on) return true;
  let text = taOf().value;
  if (commit && text !== ED.orig) {
    if (text[0] === '=' && text.length > 1) {
      text = '=' + closeBrackets(text.slice(1));
      const why = formulaProblem(text.slice(1));
      if (why) { toast(why, { icon: 'error', ms: 6000 }); taOf().focus(); return false; }
    }
    const s = WB.sheets.find(x => x.id === ED.sid) || WS, g = ED.all ? selG() : null, r = ED.r, c = ED.c;
    ED.on = false;
    edit(() => writeInput(s, r, c, text, g));
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
/* what was typed into a cell; with Ctrl+Enter into every chosen cell, where a formula moves with each one */
function writeInput(s, r, c, text, g) {
  const cur = cellAt(s, r, c), look = cur ? cur.st : emptyLook(s, r, c), p = parseInput(text, look && look.nf);
  const put = (rr, cc, pp) => {
    const x = cellAt(s, rr, cc), st0 = x ? x.st : emptyLook(s, rr, cc);
    if (!pp) { setCell(s, rr, cc, st0 ? { st: st0 } : null); return; }
    const cell = {};
    if (pp.f != null) { cell.f = tidyFormula(pp.f); cell.v = 0; } else cell.v = pp.v;
    const st = pp.nf ? { ...(st0 || {}), nf: pp.nf } : st0;
    if (st) cell.st = st;
    setCell(s, rr, cc, cell);
  };
  if (!g || (g.r1 === g.r2 && g.c1 === g.c2) || sameG(g, mergeAt(s, r, c))) { put(r, c, p); return; }
  const u = usedEnd(s), r2 = Math.min(g.r2, Math.max(u.r, r) + 1000), c2 = Math.min(g.c2, Math.max(u.c, c) + 100);
  for (let rr = g.r1; rr <= r2; rr++) for (let cc = g.c1; cc <= c2; cc++) {
    const m = mergeAt(s, rr, cc);
    if (m && (m.r1 !== rr || m.c1 !== cc)) continue;
    put(rr, cc, p && p.f != null ? { f: shiftFormula(tidyFormula(p.f), rr - r, cc - c) } : p);
  }
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
  for (const k of tokenize(t.slice(1))) {
    if (k.t !== 'ref') continue;
    const s = k.sheet == null ? WB.sheets.find(x => x.id === ED.sid) : WB.sheets.find(x => x.name.toLowerCase() === k.sheet.toLowerCase());
    if (!s) continue;
    const g = G4(k.r1, k.c1, k.r2, k.c2), key = s.id + rangeA1(g);
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
function putRef(g) {
  const ta = taOf(), t = rangeA1(g), p = ED.point && ED.point.e === ta.selectionStart ? ED.point : { s: ta.selectionStart, e: ta.selectionStart };
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
  putRef(G4(a.r, a.c, b.r, b.c));
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
    const f = WS.af;
    if (f && r === f.r1 && c >= f.c1 && c <= f.c2) {
      const size = Math.min(rowH(f.r1) - 3, 17 * Z), bx = colX(c + 1) - size - 3, by = rowY(f.r1 + 1) - size - 3;
      if (x >= bx - 1 && x <= bx + size + 2 && y >= by - 1) return { kind: 'filt', c };
    }
  }
  return { kind: 'cell', r, c, m: mergeAt(WS, r, c) };
}
let DRAG = null;
function onDown(e) {
  if (!WS || (e.button !== 0 && e.button !== 2)) return;
  TOUCHY = e.pointerType === 'touch';
  const hh = hit(e);
  if (!hh) return;
  closePopover();
  if (e.button === 2) {   // a right click in the selection keeps it; outside it, it chooses that cell first
    if (hh.kind === 'cell' && !inG(selG(), hh.r, hh.c)) { if (ED.on && !endEdit(true)) return; selectCell(hh.m ? hh.m.r1 : hh.r, hh.m ? hh.m.c1 : hh.c); }
    return;
  }
  if (TOUCHY && hh.kind === 'cell' && !ED.on) { DRAG = { kind: 'tap', x: e.clientX, y: e.clientY, hh }; return; }
  e.preventDefault();
  if (ED.on) {
    if (hh.kind === 'cell' && pointable()) {
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
    const hh = hit(e), cur = hh ? { colb: 'col-resize', rowb: 'row-resize', fill: 'crosshair', filt: 'pointer' }[hh.kind] || '' : '';
    if (V.scroll.style.cursor !== cur) V.scroll.style.cursor = cur;
    return;
  }
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
  if (d.kind === 'fill') { if (d.to) fillRange(d.g, d.to); else { SEL = { r: SEL.r, c: SEL.c, er: d.g.r1 === SEL.r ? d.g.r2 : d.g.r1, ec: d.g.c1 === SEL.c ? d.g.c2 : d.g.c1 }; after(); } return; }
  if (d.kind === 'point') { taOf().focus({ preventScroll: true }); return; }
  focusGrid();
}
function onDbl(e) {
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
  if (k === 'F2') { e.preventDefault(); startEdit('edit'); return true; }
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
      Space: () => { const g = selG(); selectCols(g.c1, g.c2); },
    }[c] || (c === 'KeyL' && e.shiftKey ? toggleFilter : null);
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
  if (CLIP && CLIP.ants) { CLIP.ants = false; render(); return true; }
  return false;
}

/* --- the formula helper: the functions whose names start with what is typed, and the arguments of the function the
   caret is in, with the current one in bold --- */
const AC = { on: false, list: [], i: 0, from: 0, box: null, hint: null };
function acUpdate() {
  const ta = taOf(), v = ta.value, pos = ta.selectionStart;
  AC.on = false; AC.list = []; AC.hint = null;
  if (ED.on && v[0] === '=' && pos === ta.selectionEnd) {
    const before = v.slice(0, pos), m = /(?:^=|[=(,;+\-*/^&<>\s])([A-Za-z][A-Za-z0-9.]*)$/.exec(before);
    if (m && !/^[A-Za-z]{1,3}\d+$/.test(m[1])) {
      AC.list = Object.keys(FUNCS).filter(n => n.startsWith(m[1].toUpperCase()) && n !== m[1].toUpperCase());
      AC.from = pos - m[1].length; AC.i = 0; AC.on = AC.list.length > 0;
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
  if (AC.on) AC.list.forEach((n, i) => box.append(h('div', { class: 'sh-aci' + (i === AC.i ? ' on' : ''), role: 'option', onpointerdown: ev => { ev.preventDefault(); AC.i = i; acTake(); } }, h('b', { text: n, dir: 'ltr' }), h('span', { text: T(FN_INFO[n][0]) }))));
  else {
    const [what, args] = FN_INFO[AC.hint.fn], parts = T(args).split(/,\s*/), on = Math.min(AC.hint.arg, parts.length - 1);
    box.append(h('div', { class: 'sh-hint' }, h('b', { text: AC.hint.fn + '(', dir: 'ltr' }), ...parts.flatMap((p, i) => [i ? ', ' : '', h('span', { class: i === on ? 'on' : null, dir: 'auto', text: p })]), ')'), h('div', { class: 'sh-hint-t', text: T(what) }));
  }
  box.hidden = false;
  const r = taOf().getBoundingClientRect(), o = V.over.getBoundingClientRect();
  box.style.top = px(Math.min(r.bottom - o.top + 2, Math.max(0, o.height - box.offsetHeight - 4)));
  box.style.right = box.style.left = '';
  if (WS.dir === 'rtl') box.style.right = px(clamp(o.right - r.right, 0, Math.max(0, o.width - box.offsetWidth))); else box.style.left = px(clamp(r.left - o.left, 0, Math.max(0, o.width - box.offsetWidth)));
}
function acHide() { AC.on = false; AC.list = []; AC.hint = null; if (AC.box) AC.box.hidden = true; }
function acTake() {
  const ta = taOf(), n = AC.list[AC.i];
  if (!n) return;
  ta.setRangeText(n + '(', AC.from, ta.selectionStart, 'end');
  ED.point = null;
  edChanged();
}
function acKey(e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); AC.i = (AC.i + (e.key === 'ArrowDown' ? 1 : -1) + AC.list.length) % AC.list.length; acShow(); return true; }
  if (e.key === 'Tab' || (e.key === 'Enter' && !e.altKey && !e.ctrlKey)) { e.preventDefault(); acTake(); return true; }
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
const withLook = (x, st) => { const n = { ...x }; if (st) n.st = st; else delete n.st; return hasVal(n) || n.st ? n : null; };
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
      if (what === 'v') setCell(WS, r, c, x.st ? { st: x.st } : null);
      else if (what === 'f') setCell(WS, r, c, withLook(x, null));
      else setCell(WS, r, c, null);
    }
    if (what !== 'v') {
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
  else if (ra === 1) c = SORT_COLL.compare(a, b);
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
  edit(() => { setProp(s, 'name', n); eachFormula(f => renameInFormula(f, old, n)); });
}
async function deleteSheet(s = WS) {
  if (WB.sheets.length < 2) { toast(T('בחוברת צריך להישאר לפחות גיליון אחד')); return; }
  if (s.cells.size && !(await confirmBox(T('מחיקת גיליון'), T('הגיליון "{0}" יימחק עם כל מה שבו. אפשר לבטל עם Ctrl+Z.', s.name), T('מחיקה'), true))) return;
  const i = WB.sheets.indexOf(s), next = WB.sheets[i + 1] || WB.sheets[i - 1];
  edit(() => {
    bookStep(() => { WB.sheets.splice(i, 1); });
    eachFormula(f => dropSheetInFormula(f, s.name));
    if (s === WS) showSheet(next, true);
  });
  WB.active = WB.sheets.indexOf(WS);
  refresh(); focusGrid();
}
function dupSheet(s = WS) {
  const c = { ...s, id: sid(), name: freeName(s.name.slice(0, 26) + ' (2)', takenNames()), cells: new Map(s.cells), cw: new Map(s.cw), rh: new Map(s.rh), hc: new Set(s.hc), hr: new Set(s.hr), cs: new Map(s.cs), rs: new Map(s.rs), merges: s.merges.map(m => ({ ...m })), af: s.af ? { ...s.af, hide: { ...s.af.hide } } : null, ac: { ...s.ac }, _sc: null, _fh: null, ri: undefined, ci: undefined, _ri: null, _ci: null };
  edit(() => { bookStep(() => { WB.sheets.splice(WB.sheets.indexOf(s) + 1, 0, c); }); showSheet(c, true); });
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
      const x = cellAt(s, r, c);
      if (x) cells.push([r - g.r1, c - g.c1, cellOut(x)]);
      const t = x ? view(x).t : '';
      line.push(/[\t\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t);
    }
    lines.push(line.join('\t'));
  }
  const merges = s.merges.filter(m => m.r1 >= g.r1 && m.r2 <= g.r2 && m.c1 >= g.c1 && m.c2 <= g.c2).map(m => [m.r1 - g.r1, m.c1 - g.c1, m.r2 - g.r1, m.c2 - g.c1]);
  return { text: lines.join('\r\n') + '\r\n', html: '<meta charset="utf-8">' + tableEl(s, g, { clip: true }).outerHTML,
    json: { app: 'floating-ink', v: 1, stamp: uid(), sheet: s.name, r: g.r1, c: g.c1, h: g.r2 - g.r1 + 1, w: g.c2 - g.c1 + 1, cells, merges } };
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
  pasteCells({ h: p.h, w: p.w, merges: p.merges || [] }, cells, what, (q, r, c) => q.x.f != null ? { f: shiftFormula(q.x.f, r - (p.r + q.r), c - (p.c + q.c)) } : null);
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
  const look = (r, c) => { const x = s.cells.get(KEY(r, c)); return x ? x.st : emptyLook(s, r, c); };
  const tb = h('tbody');
  for (const r of rows) {
    const tr = h('tr', { style: { height: (s.rh.get(r) ?? s.dh) + 'px' } });
    for (const c of cols) {
      const k = KEY(r, c);
      if (covered.has(k)) continue;
      const x = s.cells.get(k), st = x ? x.st : emptyLook(s, r, c), vw = x ? view(x) : { t: '', k: '' }, m = anchors.get(k);
      const td = h('td');
      if (m) { const cs = span(m.c1, m.c2).filter(i => colSet.has(i)).length, rs = span(m.r1, m.r2).filter(i => rowSet.has(i)).length; if (cs > 1) td.colSpan = cs; if (rs > 1) td.rowSpan = rs; }
      const al = alignOf(st, vw, s.dir), css = [`text-align:${al === 'l' ? 'left' : al === 'c' ? 'center' : 'right'}`, `vertical-align:${{ t: 'top', m: 'middle', b: 'bottom' }[(st && st.va) || 'b']}`, 'padding:1px 3px', 'overflow:hidden',
        st && st.wr ? 'white-space:pre-wrap;word-break:break-word' : 'white-space:pre'];
      if (st && st.b) css.push('font-weight:700');
      if (st && st.i) css.push('font-style:italic');
      const deco = [st && st.u && 'underline', st && st.s && 'line-through'].filter(Boolean).join(' ');
      if (deco) css.push('text-decoration:' + deco);
      if (vw.col || (st && st.c)) css.push('color:' + (vw.col || st.c));
      if (st && st.bg) css.push('background:' + st.bg);
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
      if (vw.t) { if (o.clip) td.textContent = vw.t; else td.append(h('span', { dir: vw.k === 's' ? 'auto' : 'ltr', text: vw.k === 'n' ? fitNumber(x, vw, (m ? span(m.c1, m.c2).reduce((a, i) => a + (s.cw.get(i) ?? s.dw), 0) : s.cw.get(c) ?? s.dw) - 6, fontOf(st, (st && st.fs || DEF_FS) * 4 / 3)) : vw.t })); }
      if (o.clip && x && typeof x.v === 'number') td.setAttribute('x:num', String(x.v));
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
.sh-name{flex:none;width:92px;height:28px;border:1px solid var(--line);border-radius:6px;background:var(--surface-2);padding:0 8px;font:500 12.5px var(--ui);text-align:center;direction:ltr;color:var(--text)}
.sh-name:focus{outline:none;border-color:var(--accent);background:var(--surface)}
.sh-fxb{flex:none;height:28px;min-width:32px;border:0;border-radius:6px;background:none;color:var(--text-2);font:italic 700 14px Georgia,"Times New Roman",serif}
.sh-fxb:hover{background:var(--surface-3);color:var(--accent)}
.sh-bar{flex:1;min-width:0;height:28px;max-height:140px;border:1px solid var(--line);border-radius:6px;background:var(--surface-2);padding:4px 8px;font:13px/1.45 var(--ui);resize:none;color:var(--text);overflow:hidden;white-space:pre-wrap}
.sh-bar:focus{outline:none;border-color:var(--accent);background:var(--surface);overflow:auto}
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
.sh-c.wr>span{flex:0 1 auto;min-width:0;width:100%;overflow-wrap:anywhere}
.sh-bd{z-index:3}
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
.sh-fh{z-index:6;background:#2743d8;border:1px solid #fff}
.sh-clip{z-index:6;background:linear-gradient(90deg,#2743d8 50%,transparent 0) repeat-x 0 0/8px 2px,linear-gradient(90deg,#2743d8 50%,transparent 0) repeat-x 0 100%/8px 2px,linear-gradient(0deg,#2743d8 50%,transparent 0) repeat-y 0 0/2px 8px,linear-gradient(0deg,#2743d8 50%,transparent 0) repeat-y 100% 0/2px 8px;animation:shants .5s linear infinite}
@keyframes shants{to{background-position:8px 0,-8px 100%,0 -8px,100% 8px}}
.sh-ref{z-index:5;border:2px solid var(--rc);background:color-mix(in srgb,var(--rc) 9%,transparent)}
.sh-peer{z-index:4;border:2px solid var(--pc);pointer-events:none}
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
.panel.fit1 .sh-edit>.gb,.panel.fit2 .sh-cells>.gb{display:grid;grid-template-rows:repeat(2,30px);grid-auto-flow:column;align-content:center;gap:4px 3px}
.panel.fit1 .sh-edit .rb.big,.panel.fit2 .sh-cells .rb.big{flex-direction:row;height:30px;min-width:30px;padding:0 5px}
.panel.fit1 .sh-edit .rb.big>span:not(.ms),.panel.fit2 .sh-cells .rb.big>span:not(.ms){display:none}
.panel.fit1 .sh-edit .rb.big .ms,.panel.fit2 .sh-cells .rb.big .ms{font-size:20px}
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
/* a window too narrow for the home tab shrinks it as Excel does: first the editing buttons, then the cells buttons, become small icons */
function fitRibbon() {
  const p = V.home, r = p && p.parentNode;
  if (!r || p.hidden) return;
  p.classList.remove('fit1', 'fit2');
  for (const c of ['fit1', 'fit2']) { if (r.scrollWidth <= r.clientWidth) break; p.classList.add(c); }
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
    tag(group(T('תאים'), '', rbtn('shInsMenu', 'add_row_above', T('הוספה'), { big: true, title: T('הוספת שורות או עמודות') }), rbtn('shDelMenu', 'delete', T('מחיקה'), { big: true, title: T('מחיקת שורות או עמודות') }), rbtn('shCellMenu', 'width', T('גודל'), { big: true, title: T('רוחב עמודות, גובה שורות, הסתרה') })), 'sh-cells'),
    tag(group(T('עריכה'), '', split('shSum', 'shSumMenu', 'functions', T('סכום אוטומטי (Alt+=)'), { menuTitle: T('פונקציות נוספות'), big: false }),
      rbtn('shSortMenu', 'sort', T('מיון וסינון'), { big: true }), rbtn('shClearMenu', 'ink_eraser', T('ניקוי'), { big: true }), rbtn('shFind', 'search', T('חיפוש'), { big: true, title: T('חיפוש והחלפה (Ctrl+F)') })), 'sh-edit'));
  const formulas = h('div', { class: 'panel sheet-only', 'data-panel': 'sformula', hidden: true },
    group(T('פונקציות'), '', ...[['SUM', 'functions', T('סכום')], ['AVERAGE', 'calculate', T('ממוצע')], ['COUNT', 'tag', T('ספירה')], ['MIN', 'arrow_downward', T('הכי קטן')], ['MAX', 'arrow_upward', T('הכי גדול')], ['IF', 'call_split', T('תנאי (IF)')]]
      .map(([fn, ic, l]) => rbtn(fn === 'IF' ? 'shFn' : 'shAuto', ic, l, { big: true, arg: fn, title: fn + ': ' + T(FN_INFO[fn][0]) }))),
    group(T('נוסחאות'), '', rbtn('shShowF', 'function', T('הצגת נוסחאות'), { big: true, title: T('הצגת הנוסחאות עצמן בתאים (Ctrl+`)') }), rbtn('shFxHelp', 'school', T('איך כותבים נוסחה'), { big: true })));
  const data = h('div', { class: 'panel sheet-only', 'data-panel': 'sdata', hidden: true },
    group(T('מיון'), '', rbtn('shSort', 'arrow_upward', T('מהקטן לגדול'), { big: true, arg: 'a', title: T('מיון מהקטן לגדול (א עד ת)') }), rbtn('shSort', 'arrow_downward', T('מהגדול לקטן'), { big: true, arg: 'd', title: T('מיון מהגדול לקטן (ת עד א)') }), rbtn('shSortDlg', 'sort', T('מיון מותאם'), { big: true })),
    group(T('סינון'), '', rbtn('shFilter', 'filter_alt', T('סינון'), { big: true, id: 'shFilterBtn', title: T('כפתורי סינון בשורת הכותרות (Ctrl+Shift+L)') }), rbtn('shFilterClear', 'filter_alt_off', T('ניקוי הסינון'), { big: true })));
  const viewP = h('div', { class: 'panel sheet-only', 'data-panel': 'sview', hidden: true },
    group(T('חלון'), '', rbtn('shFreezeMenu', 'ac_unit', T('הקפאה'), { big: true, title: T('השורות והעמודות הראשונות נשארות במקום בגלילה') })),
    group(T('תצוגה@view'), '', rbtn('shGrid', 'grid_on', T('קווי רשת'), { big: true, id: 'shGridBtn' }), rbtn('shDir', 'format_textdirection_r_to_l', T('גיליון מימין לשמאל'), { big: true, id: 'shDirBtn' })),
    group(T('זום'), '', rbtn('shZoom', 'remove', T('הקטנה'), { arg: '-1' }), h('button', { class: 'rb txt', type: 'button', 'data-cmd': 'shZoom', 'data-arg': '0', id: 'shZoomPct', title: T('חזרה ל-100%') }, '100%'), rbtn('shZoom', 'add', T('הגדלה'), { arg: '1' })));
  return [home, formulas, data, viewP];
}
const SHEET_TAB_LIST = () => [['shome', T('בית')], ['sformula', T('נוסחאות')], ['sdata', T('נתונים')], ['sview', T('תצוגה@view')]];
function mount() {
  if (V.view) return;
  document.head.append(h('style', { id: 'sheetcss' }, CSS));
  const tabs = $('#tabs');
  for (const [k, label] of SHEET_TAB_LIST()) tabs.append(h('button', { class: 'tab sheet-only', role: 'tab', 'data-tab': k, 'aria-selected': 'false' }, label));
  const ribbon = $('#ribbon');
  for (const p of ribbonPanels()) ribbon.append(p);
  if (window.ResizeObserver) new ResizeObserver(fitRibbon).observe(V.home);   // it changes size when shown, and with the window
  // only the waiting line goes: the app's banner may already live here
  const view = $('#sheetView');
  view.querySelectorAll('.sh-wait').forEach(n => n.remove());
  V.view = view;
  V.name = h('input', { class: 'sh-name', type: 'text', 'aria-label': T('שם התא'), title: T('התא הפעיל. אפשר להקליד כאן כתובת (כמו B7) וללחוץ Enter'), spellcheck: 'false', autocomplete: 'off' });
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
  view.append(h('div', { class: 'sh-fbar' }, V.name, V.fx, V.bar), h('div', { class: 'sh-wrap' }, V.scroll, V.over), h('div', { class: 'sh-bottom' }, V.add, V.tabs));
  document.body.append(V.anchor, V.print = h('div', { id: 'sheetPrint', 'aria-hidden': 'true' }));
  // the sheet
  const sc = V.scroll;
  sc.addEventListener('pointerdown', onDown);
  sc.addEventListener('pointermove', onMove);
  sc.addEventListener('pointerup', onUp);
  sc.addEventListener('pointercancel', () => { cancelAnimationFrame(SCROLLER); if (DRAG && DRAG.line) DRAG.line.remove(); DRAG = null; });
  sc.addEventListener('dblclick', onDbl);
  sc.addEventListener('contextmenu', e => { if (!WS) return; e.preventDefault(); const hh = hit(e); if (hh && hh.kind === 'filt') return; openCellMenu(e.clientX, e.clientY); });
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
  // the name box: an address (B7, A1:C9, or a sheet's name with one) takes you there
  V.name.addEventListener('focus', () => V.name.select());
  V.name.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); selInfo(); focusGrid(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    let t = V.name.value.trim(), s = WS;
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(t);
    if (m) { const n = (m[1] ?? m[2]).replace(/''/g, "'").toLowerCase(); s = WB.sheets.find(x => x.name.toLowerCase() === n); t = m[3]; }
    const g = s && parseRange(t);
    if (!g) { toast(T('זו לא כתובת של תא. למשל: B7 או A1:C9')); return; }
    if (s !== WS) showSheet(s);
    selectRange(g);
    scrollToCell(g.r1, g.c1);
    focusGrid();
  });
  V.fx.addEventListener('click', e => openFnMenu(e.currentTarget));
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
    { ic: 'arrow_upward', label: T('מיון מהקטן לגדול'), run: () => quickSort(false) },
    { ic: 'arrow_downward', label: T('מיון מהגדול לקטן'), run: () => quickSort(true) },
    { ic: 'filter_alt', label: WS.af ? T('הסרת הסינון') : T('סינון'), run: toggleFilter },
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
function sumMenu(anchor) { menuAt(anchor, null, Object.keys(FUNCS).filter(f => f !== 'IF').map(fn => ({ ic: 'functions', label: fn, sample: T(FN_INFO[fn][0]), run: () => autoSum(fn), keep: true }))); }
function openFnMenu(anchor) {
  if (ED.on && taOf().value[0] !== '=') { endEdit(true); }
  menuAt(anchor, T('הוספת פונקציה'), Object.keys(FUNCS).map(fn => ({ ic: 'function', label: fn, sample: T(FN_INFO[fn][0]), run: () => insertFn(fn), keep: true })));
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
    h('h4', { text: T('פונקציות') }), ...Object.keys(FUNCS).map(fn => ex('=' + FN_INFO[fn][2], T(FN_INFO[fn][0]))),
    h('h4', { text: T('טיפים') }),
    h('p', { text: T('כשמשנים מספר, כל הנוסחאות שמשתמשות בו מתעדכנות לבד. גוררים את הריבוע הקטן בפינת התא כדי להעתיק נוסחה לתאים שליד, והכתובות בה זזות איתה. $ לפני אות או מספר (כמו $B$2) משאיר אותם קבועים; F4 מוסיף אותו.') }),
    h('p', { text: T('שגיאות כמו באקסל: #DIV/0! חילוק באפס, #VALUE! חשבון עם טקסט, #REF! תא שנמחק, #NAME? פונקציה שלא קיימת כאן.') })),
    actions: [{ label: T('הבנתי'), kind: 'primary' }], onClose: () => focusGrid() });
}
/* the commands the ribbon's buttons call (data-cmd), added to the app's own list */
const COMMANDS = {
  shUndo: () => undo(), shRedo: () => redo(),
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
  shSum: () => autoSum('SUM'), shSumMenu: (a, b) => sumMenu(b), shAuto: a => autoSum(a), shFn: a => insertFn(a),
  shSortMenu: (a, b) => sortMenu(b), shClearMenu: (a, b) => clearMenu(b), shFind: () => openFind(false),
  shSort: a => quickSort(a === 'd'), shSortDlg: () => sortDialog(), shFilter: () => toggleFilter(), shFilterClear: () => clearFilter(),
  shShowF: () => toggleFormulas(), shFxHelp: () => formulaHelp(),
  shFreezeMenu: (a, b) => freezeMenu(b), shGrid: () => edit(() => setProp(WS, 'gl', !WS.gl)), shDir: () => edit(() => setProp(WS, 'dir', WS.dir === 'rtl' ? 'ltr' : 'rtl')),
  shZoom: a => setZoom(+a === 0 ? 100 : WS.zoom + (+a > 0 ? 10 : -10)),
};

/* --- after every move: the name box, the formula bar, the ribbon, and the status line --- */
function selInfo() {
  if (!V.view || !WS) return;
  if (!ED.on && document.activeElement !== V.name) V.name.value = A1(SEL.r, SEL.c);
  const m = mergeAt(WS, SEL.r, SEL.c), x = cellAt(WS, m ? m.r1 : SEL.r, m ? m.c1 : SEL.c);
  if (!ED.on) { const t = editText(x); if (V.bar.value !== t) V.bar.value = t; }
  updateRibbon(x);
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
    else if (x && x.f != null) { const u = unknownIn(x.f); if (u && u !== '?') t = x.x ? T('הפונקציה {0} עוד לא קיימת כאן. מוצג הערך שנשמר בקובץ.', u) : T('הפונקציה {0} עוד לא קיימת כאן', u); }
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
const xlResult = v => v instanceof Date ? jsDateSerial(v) : v && typeof v === 'object' && v.error ? ERR[v.error] || E_NA : typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' ? v : 0;
/* an Excel workbook as a workbook here, with a count of what couldn't come across */
async function readXlsx(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xD0 && u8[1] === 0xCF) throw new Error('locked');
  if (u8[0] !== 0x50 || u8[1] !== 0x4B) throw new Error('notxlsx');
  const names = new TextDecoder('latin1').decode(u8), count = re => (names.match(re) || []).length;
  const rep = new Map([['chart', count(/xl\/charts\/chart\d+\.xml/g) / 2 | 0], ['pivot', count(/xl\/pivotTables\/pivotTable\d+\.xml/g) / 2 | 0]]);
  const add = (k, n = 1) => rep.set(k, (rep.get(k) || 0) + n);
  const ExcelJS = await excelLib(), wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const theme = themeOf(wb), VT = ExcelJS.ValueType, taken = new Set(), book = { v: 1, dir: UI_DIR, active: 0, sheets: [] };
  let anyRtl = null;
  wb.eachSheet(ws => {
    if (ws.state === 'veryHidden') return;
    if (ws.state === 'hidden') add('hidden');
    const view = (ws.views && ws.views[0]) || {};
    const s = newSheet(freeName(cleanName(ws.name) || sheetWord(book.sheets.length + 1), taken), view.rightToLeft ? 'rtl' : 'ltr');
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
          case VT.Hyperlink: x.v = typeof v.text === 'string' ? v.text : v.text && v.text.richText ? v.text.richText.map(t => t.text).join('') : String(v.hyperlink || ''); add('link'); break;
          case VT.Error: x.v = ERR[v.error] || E_NA; break;
          case VT.Formula: {
            let f = v.formula;
            if (v.sharedFormula) { const m = ws.getCell(v.sharedFormula), mf = m.value && m.value.formula; if (mf) f = shiftFormula(mf, rn - +m.row, cn - +m.col); }
            if (f == null) f = cell.formula;
            x.v = xlResult(v.result);
            if (f) { x.f = String(f).replace(/^=/, ''); if (v.shareType === 'array' || unknownIn(x.f)) { x.x = true; add('fn'); } }
            break;
          }
          default: break;
        }
        if (cell.note) add('note');
        const st = xlLook(cell, theme);
        if (st) x.st = st;
        if (x.v !== undefined || x.f || x.st) { const n = normCell(x.v instanceof Err ? { ...x, v: undefined, e: x.v.c } : x); if (n) s.cells.set(KEY(r, c), n); }
      });
    });
    for (const m of Object.values(ws._merges || {})) {
      const mm = m && m.model;
      if (!mm) continue;
      const g = G4(mm.top - 1, mm.left - 1, mm.bottom - 1, mm.right - 1);
      if ((g.r1 !== g.r2 || g.c1 !== g.c2) && !s.merges.some(o => meets(o, g))) s.merges.push(g);
    }
    const af = ws.autoFilter;
    if (af) { const g = typeof af === 'string' ? parseRange(af) : af.from && af.to ? G4(af.from.row - 1, af.from.column - 1, af.to.row - 1, af.to.column - 1) : null; if (g && !wholeCols(g) && !wholeRows(g)) s.af = { ...g, hide: {} }; }
    if (ws.getImages && ws.getImages().length) add('img', ws.getImages().length);
    const cf = ws.conditionalFormattings || (ws.model && ws.model.conditionalFormattings);
    if (cf && cf.length) add('cond');
    const dv = ws.dataValidations && ws.dataValidations.model;
    if (dv && Object.keys(dv).length) add('valid');
    if (ws.tables && Object.keys(ws.tables).length) add('table');
    book.sheets.push(sheetOut(s));
  });
  if (!book.sheets.length) throw new Error('empty');
  const act = wb.views && wb.views[0] && wb.views[0].activeTab;
  book.active = clamp(act | 0, 0, book.sheets.length - 1);
  book.dir = anyRtl ? 'rtl' : anyRtl === false ? 'ltr' : UI_DIR;
  return { book: bookOut(normBook(book)), rep };
}
/* newer Excel functions need _xlfn. before their names inside the file, or Excel reads them as unknown */
const NEW_FNS = new Set(['CONCAT', 'TEXTJOIN', 'IFS', 'SWITCH', 'MAXIFS', 'MINIFS', 'XLOOKUP', 'XMATCH', 'FILTER', 'SORT', 'SORTBY', 'UNIQUE', 'SEQUENCE', 'RANDARRAY', 'LET', 'LAMBDA', 'IFNA', 'DAYS', 'ISOWEEKNUM', 'STDEV.S', 'STDEV.P', 'VAR.S', 'VAR.P', 'CEILING.MATH', 'FLOOR.MATH', 'AGGREGATE', 'FORMULATEXT', 'TEXTBEFORE', 'TEXTAFTER', 'TEXTSPLIT', 'VSTACK', 'HSTACK', 'TAKE', 'DROP', 'CHOOSECOLS', 'CHOOSEROWS', 'TOCOL', 'TOROW', 'WRAPROWS', 'WRAPCOLS', 'EXPAND']);
const xlFormula = f => tokenize(f).map(t => t.t === 'fn' && !/^_xl/i.test(t.s) && NEW_FNS.has(t.n) ? '_xlfn.' + t.s : t.t === ',' ? ',' : t.s).join('');
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
  for (const s of WB.sheets) {
    const view = { rightToLeft: s.dir === 'rtl', showGridLines: s.gl, activeCell: A1(s.ac.r, s.ac.c), zoomScale: s.zoom };
    if (s.fr || s.fc) Object.assign(view, { state: 'frozen', xSplit: s.fc, ySplit: s.fr, topLeftCell: A1(s.fr, s.fc) });
    const ws = wb.addWorksheet(s.name, { views: [view], properties: { defaultRowHeight: +(s.dh * 0.75).toFixed(2), ...(s.tab ? { tabColor: { argb: 'FF' + s.tab.slice(1).toUpperCase() } } : {}) } });
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
      if (x.f != null) cell.value = { formula: xlFormula(x.f), result: isErr(x.v) ? { error: x.v.c } : x.v ?? 0 };
      else if (isErr(x.v)) cell.value = { error: x.v.c };
      else if (x.v != null && x.v !== '') cell.value = x.v;
      cell.style = xlStyleOut(x.st);
    }
    for (const m of s.merges) ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1);
    if (s.af) ws.autoFilter = { from: { row: s.af.r1 + 1, column: s.af.c1 + 1 }, to: { row: filterEnd(s.af, s) + 1, column: s.af.c2 + 1 } };
  }
  return new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_MIME });
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
      const x = cellAt(s, r, c), k = x && typeof x.v === 'number' ? nfKind(x.st && x.st.nf) : null;
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
  chart: N_('{n} גרפים לא נפתחו (גרפים מתוך גיליון יגיעו בהמשך)'), pivot: N_('{n} טבלאות ציר נפתחו כתאים רגילים'), img: N_('{n} תמונות לא נפתחו'),
  fn: N_('{n} נוסחאות משתמשות בפונקציות שעוד אין כאן. הן מראות את הערך שנשמר בקובץ'), note: N_('{n} הערות על תאים לא נפתחו'), link: N_('{n} קישורים נפתחו כטקסט רגיל'),
  cond: N_('{n} גיליונות עם עיצוב מותנה נפתחו בלי העיצוב הזה'), valid: N_('{n} גיליונות עם רשימות נפתחות נפתחו בלי הרשימות'), table: N_('{n} גיליונות עם טבלאות מעוצבות נפתחו כתאים רגילים'),
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
  V.print.append(h('div', { class: 'sh-print-sheet', dir: WS.dir }, t));
  document.documentElement.classList.add('sheet-print');
  return () => { document.documentElement.classList.remove('sheet-print'); V.print.textContent = ''; rule.textContent = before; };
}

/* =========================================================
   ready-made spreadsheets, and spreadsheets described by Claude through the connector
   ========================================================= */
const NF_NAMES = () => ({ general: null, number: NUM_NF, integer: '#,##0', currency: curNf(CUR), currency_ils: curNf('₪'), currency_usd: curNf('$'), currency_eur: curNf('€'), percent: PCT_NF, percent2: '0.00%', date: DATE_NF, long_date: LDATE_NF, time: TIME_NF, text: '@' });
/* one sheet's part of a description: rows from a start cell, single cells, formats, column widths, freezing */
function applySpec(book, s, spec) {
  const put = (r, c, v) => {
    if (r >= MAXR || c >= MAXC) return 0;
    const cur = cellAt(s, r, c), st0 = cur ? cur.st : emptyLook(s, r, c);
    if (v == null || v === '') { setCell(s, r, c, st0 ? { st: st0 } : null); return 1; }
    const p = typeof v === 'number' ? (Number.isFinite(v) ? { v } : null) : typeof v === 'boolean' ? { v } : parseInput(String(v), st0 && st0.nf);
    if (!p) return 0;
    const x = p.f != null ? { f: tidyFormula(closeBrackets(p.f), book), v: 0 } : { v: p.v };
    const st = p.nf ? { ...(st0 || {}), nf: p.nf } : st0;
    if (st) x.st = st;
    setCell(s, r, c, x);
    return 1;
  };
  let n = 0;
  if (spec.clear) { const g = parseRange(spec.clear); if (g) for (const [k] of [...s.cells]) if (inG(g, kr(k), kc(k))) { setCell(s, kr(k), kc(k), null); n++; } }
  const at = parseA1(spec.start || 'A1') || { r: 0, c: 0 };
  if (Array.isArray(spec.rows)) spec.rows.slice(0, 5000).forEach((row, i) => { if (Array.isArray(row)) row.slice(0, 500).forEach((v, j) => { if (v !== undefined) n += put(at.r + i, at.c + j, v); }); });
  if (spec.cells && typeof spec.cells === 'object') for (const [a, v] of Object.entries(spec.cells)) { const p = parseA1(a); if (p) n += put(p.r, p.c, v); }
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
  if (spec.freeze_rows != null) setProp(s, 'fr', clamp(Math.round(+spec.freeze_rows) || 0, 0, 200));
  if (spec.freeze_columns != null) setProp(s, 'fc', clamp(Math.round(+spec.freeze_columns) || 0, 0, 60));
  if (spec.direction === 'rtl' || spec.direction === 'ltr') setProp(s, 'dir', spec.direction);
  return n;
}
/* a whole workbook from a description: { sheets: [{ name, rows, cells, formats, column_widths, freeze_rows, direction }] } */
function fromSpec(spec) {
  const list = (Array.isArray(spec && spec.sheets) ? spec.sheets : []).filter(x => x && typeof x === 'object').slice(0, 50);
  const words = JSON.stringify(list).slice(0, 20000);
  const dir = (spec && (spec.direction === 'rtl' || spec.direction === 'ltr')) ? spec.direction : RTL_CH.test(words) ? 'rtl' : /[A-Za-z]/.test(words) ? 'ltr' : UI_DIR;
  const book = { v: 1, dir, active: 0, sheets: [] }, taken = new Set();
  for (const sp of list.length ? list : [{}]) {
    const s = newSheet(freeName(cleanName(sp.name) || sheetWord(book.sheets.length + 1), taken), sp.direction === 'ltr' || sp.direction === 'rtl' ? sp.direction : dir);
    taken.add(s.name.toLowerCase());
    book.sheets.push(s);
  }
  list.forEach((sp, i) => applySpec(book, book.sheets[i], sp));
  const keep = WB;
  WB = book;
  try { recalc(); } finally { WB = keep; }
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
  if (!g) return { ...out, range: null, rows: [], note: 'This sheet is empty.' };
  g = { r1: g.r1, c1: g.c1, r2: Math.min(g.r2, used ? used.r2 : g.r2, g.r1 + 399), c2: Math.min(g.c2, used ? used.c2 : g.c2, g.c1 + 59) };
  const rows = [], formulas = {};
  for (let r = g.r1; r <= g.r2; r++) {
    const row = [];
    for (let c = g.c1; c <= g.c2; c++) { const x = cellAt(s, r, c); row.push(x ? view(x).t : ''); if (x && x.f != null) formulas[A1(r, c)] = '=' + x.f; }
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every(t => t === '')) rows.pop();
  const res = { ...out, range: rangeA1(g), rows, ...(Object.keys(formulas).length ? { formulas } : {}), note: 'rows[0] is row ' + (g.r1 + 1) + ' and each row starts at column ' + colName(g.c1) + '. Each value is what the cell shows (with its number format); formulas lists the cells that hold one.' };
  if (s === WS) res.selected = rangeA1(usedPart(selG()));
  if (used && (used.r2 > g.r2 || used.c2 > g.c2) && !args.range) res.truncated = 'Only part of the sheet was returned. Read the rest with the range argument.';
  return res;
}
/* for Claude: cells written (and formatted), as one step the user can undo */
function writeCells(args = {}) {
  let s = WS, made = false;
  if (args.sheet != null && String(args.sheet).trim()) {
    const n = cleanName(args.sheet);
    s = WB.sheets.find(x => x.name.toLowerCase() === n.toLowerCase());
    if (!s) { s = newSheet(freeName(n || sheetWord(WB.sheets.length + 1), takenNames()), WB.dir); made = true; }
  }
  let n = 0;
  edit(() => {
    if (made) bookStep(() => WB.sheets.push(s));
    if (s !== WS) showSheet(s, true);
    n = applySpec(WB, s, args);
  });
  WB.active = WB.sheets.indexOf(WS);
  refresh();
  const u = usedRange(s);
  return { sheet: s.name, cells_written: n, used_range: u ? rangeA1(u) : null, ...(made ? { new_sheet: true } : {}) };
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
  edit(() => { bookStep(() => { WB.sheets = nb.sheets; WB.dir = nb.dir; }); showSheet(WB.sheets[nb.active] || WB.sheets[0], true); });
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
   shared rooms (the rooms themselves are in index.html): the workbook as entries, each with its own stamp.
   m its direction, o the order of the sheets, g/<sheet> a sheet's settings, r/<sheet> and k/<sheet> the ids of its
   rows and columns, c/<sheet>/<row>/<column> a cell. A row and a column are known by an id that moves with it, so
   what someone writes stays in its row while someone else adds or takes out rows above it. The ids follow from
   each other (nextId), so rows nobody moved have the same ids in every browser without being sent: a list travels
   as the ids that don't follow, with counts for the runs that do
   ========================================================= */
const RM = { on: false, cells: new Set(), props: new Set(), lists: new Set(), full: new Set(), book: false, all: false, peers: [] };
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
  return undefined;
}
/* --- this browser's side --- */
function roomStart() {
  RM.on = true;
  RM.cells.clear(); RM.props.clear(); RM.lists.clear(); RM.full.clear(); RM.book = RM.all = false;
}
function roomStop(drop) {
  RM.on = false; RM.peers = [];
  RM.cells.clear(); RM.props.clear(); RM.lists.clear(); RM.full.clear();
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
  for (const s of WB.sheets) sheetEntries(s, each);
}
/* what changed since the last look, into look(); what is gone, into gone(key) */
function roomChanges(look, gone, base) {
  if (!WB) return;
  bookEntries(look);
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
  RM.cells.clear(); RM.props.clear(); RM.lists.clear(); RM.full.clear(); RM.book = RM.all = false;
}
/* an entry's value here, the way this browser writes it (after something came in, so it doesn't go back out) */
function roomValue(k) {
  if (!WB) return null;
  if (k === 'm') return { dir: WB.dir };
  if (k === 'o') return WB.sheets.map(s => s.id);
  const p = k.split('/'), s = WB.sheets.find(x => x.id === p[1]);
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
  const again = new Set(), lists = [], props = new Set(), put = new Set();
  for (const [k] of acc) {
    if (k === 'o' || k === 'm') whole = true;
    else if (k[0] === 'r' || k[0] === 'k') lists.push(k);
    else if (k[0] === 'g') props.add(k.slice(2));
    else if (k[0] === 'c') put.add(k);
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
  if (whole || again.size) { HIST.list = []; HIST.at = 0; }   // rows moved under every step kept for undo
  if (!WB.sheets.includes(WS)) showSheet(WB.sheets[0], true);
  anchorBack(keep);
  geoDirty(); recalc();
  for (const s of WB.sheets) filterRows(s);
  refresh();
  return stale;
}
/* the workbook of a room just joined, from its entries */
function roomBook(st) {
  const m = st.get('m'), dir = m && m[0] ? m[0].dir : UI_DIR, book = { v: 1, dir, active: 0, sheets: [] }, taken = new Set();
  for (const id of sheetIds(st)) { const s = Object.assign(newSheet('', dir), { id }); buildSheet(s, st, taken); book.sheets.push(s); }
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
    if (!q || q.s !== WS.id) continue;
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
