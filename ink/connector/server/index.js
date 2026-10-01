#!/usr/bin/env node
/* Floating Ink connector: lets Claude (or any app that speaks MCP) work inside Floating Ink.

   Claude runs this program and talks to it over stdin/stdout (MCP, JSON-RPC one message per line).
   The Floating Ink page in the browser connects to it on http://127.0.0.1:47821, when the user turns
   on "Connect AI" there: it receives each tool call as a Server-Sent Event, runs it on the documents
   in the browser, and posts the result back. The documents never leave the user's computer.

   Several Claude windows can be connected at once. The first copy of this program to start owns the
   port (the hub); later copies hand their calls to the hub over HTTP. No dependencies. */
'use strict';
const http = require('http');
const readline = require('readline');
const crypto = require('crypto');

const PORT = Number(process.env.FLOATING_INK_PORT) || 47821;   // another port is only for testing
const VERSION = '1.10.0';
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const log = (...a) => process.stderr.write('[floating-ink] ' + a.join(' ') + '\n');   // stdout is only for MCP

const NOT_CONNECTED = 'Floating Ink is not connected. Ask the user to open Floating Ink (https://floatingrotations.com/ink/) ' +
  'and turn on "Connect AI" (the robot button at the top of the app), then try again.';

const INSTRUCTIONS = 'Floating Ink is a word processor open in the user\'s browser. These tools work inside it live: ' +
  'the user sees every change as it happens, and can undo it with Ctrl+Z. Write document content in Markdown ' +
  '(# headings, **bold**, *italic*, lists, "- [ ]" checklists, | tables |, > quotes, [links](https://...)). ' +
  'Keep the language of the document unless the user asks otherwise; many documents are in Hebrew. ' +
  'It also makes presentations (slides, like PowerPoint): create_presentation builds one while the user watches, for example ' +
  'from a script or a document they wrote (read_document it first), and edit_presentation changes one. Keep slides short: ' +
  'a title and three to six brief points; what the presenter should say goes in the slide\'s notes. read_document reads a presentation slide by slide. ' +
  'It also makes spreadsheets, like Excel: create_spreadsheet builds one with values, formulas, formatting, conditional formatting, drop-down lists (data validation) and charts (a budget, a table of grades, a list with totals, a chart of them), ' +
  'read_spreadsheet reads one, and write_cells changes cells in one. Formulas are written the way Excel writes them in English, with commas: =SUM(B2:B9). ' +
  'The chat panel inside Floating Ink is shared: send_message leaves a note there, and read_messages shows ' +
  'what the user or another connected assistant wrote. The user often keeps writing to you from that panel instead of ' +
  'switching back to this window, so when they may still be talking to you there, call wait_for_message: it comes back ' +
  'the moment they send something. When the user asks you to connect to Floating Ink, or to stay with them there, keep a ' +
  'loop going: wait_for_message, answer what they wrote with send_message (and do in the documents whatever they asked for), ' +
  'then wait_for_message again, until they say to stop. One wait lasts ten minutes and costs nothing while it waits, so stay ' +
  'in the wait instead of ending your turn.';

const DOC_ID = { type: 'string', description: 'Document id from list_documents. Leave out to use the document open on screen.' };
const THEME = { type: 'string', enum: ['ink', 'night', 'sand', 'forest', 'sunset', 'chalk', 'plain', 'notebook', 'science', 'business', 'gaming', 'history',
  'space', 'nature', 'books', 'party', 'sports', 'music', 'minimal', 'travel', 'food', 'math', 'tech', 'creator', 'art'],
  description: 'Design theme; pick one that fits the topic. ink (blue on white, the default), night (dark blue), sand (warm orange), forest (green), ' +
    'sunset (pink and purple), chalk (a green chalkboard), plain (black on white), notebook (a lined school notebook), science (a dark lab, hexagons), ' +
    'business (navy and gold), gaming (neon on dark purple), history (old parchment), space (stars and planets), nature (green leaves), ' +
    'books (a library in burgundy), party (pink confetti), sports (black and orange), music (purple, sound waves), minimal (quiet, black on light gray), ' +
    'travel (sky and sea), food (a warm kitchen), math (graph paper), tech (dark blue circuits), creator (red on black, like a video channel), art (bright paint blobs).' };
const SLIDE = {
  layout: { type: 'string', enum: ['title', 'content', 'two_columns', 'big_image', 'image_and_text', 'title_only', 'section', 'blank'],
    description: 'title: the opening slide (title and subtitle). content: a title and text. two_columns: a title and two columns. big_image: a title, a big picture the user adds, and a caption. ' +
      'image_and_text: a title and text on one side, and a picture the user adds filling the other half. title_only: just a title. section: a chapter title. blank: nothing.' },
  title: { type: 'string' },
  subtitle: { type: 'string', description: 'Under the title, on "title" and "section" slides.' },
  text: { type: 'string', description: 'Markdown for a "content" or "image_and_text" slide: a few short bullet points ("- ..."), a numbered list or short paragraphs; **bold** works.' },
  column1: { type: 'string', description: 'Markdown for the first column of a "two_columns" slide (the right one in Hebrew).' },
  column2: { type: 'string', description: 'Markdown for the second column.' },
  caption: { type: 'string', description: 'The line under the picture of a "big_image" slide.' },
  notes: { type: 'string', description: 'Speaker notes: what to say while this slide is shown. The presenter sees them in presenter view; the audience does not. An empty string removes them.' },
};
const TRANSITION = { type: 'string', enum: ['none', 'fade', 'push', 'wipe', 'cover', 'split', 'flip', 'cube', 'gallery', 'curtains'],
  description: 'One transition for every slide, as in PowerPoint; it also plays in the saved PowerPoint file. none removes them. Leave out to keep what is there.' };
const NUMBER_FORMATS = 'general, number (1,234.50), integer (1,235), currency (in the user\'s currency, ₪ in Hebrew), currency_ils, currency_usd, currency_eur, percent (12%), percent2 (12.34%), date, long_date, time, text, or an Excel format code such as #,##0.00 "₪"';
const SHEET = {
  name: { type: 'string', description: 'The sheet\'s name on its tab (up to 31 characters).' },
  start: { type: 'string', description: 'The cell where rows begins, like A1 (the default).' },
  rows: { type: 'array', items: { type: 'array', items: {} }, description: 'Rows of cells from start, the first row first, the first column first. Each value is a number, text, true/false, or null for an empty cell. ' +
    'Text that starts with = is a formula, in English with commas as in Excel: =SUM(B2:B9), =AVERAGE(B2:D2), =IF(E2>=55,"pass","fail"), =B2*C2, =\'Sheet 2\'!B7. ' +
    'About 150 Excel functions work: SUM, SUMIF(S), SUMPRODUCT, ROUND, AVERAGE, COUNTIF(S), MAXIFS, MEDIAN, RANK, IF, IFS, AND, OR, IFERROR, SWITCH, TEXT, LEFT, MID, TEXTJOIN, SUBSTITUTE, TODAY, DATE, EDATE, DATEDIF, NETWORKDAYS, XLOOKUP, VLOOKUP, INDEX, MATCH and more, with + - * / ^ %, & (joining text), comparisons, cells and ranges. ' +
    'As in Excel 365, a formula whose answer is several values spills them into the cells below and beside it: =SORT(A2:B20,2,-1), =FILTER(A2:C20,C2:C20>50), =UNIQUE(A2:A20), =SEQUENCE(10); leave those cells empty, and refer to the whole spill as A2#. INDIRECT, OFFSET, LET and financial functions are not there yet (they show #NAME?). Write plain numbers (1200), and set their look with formats. ' +
    'One call takes up to 5,000 rows of up to 500 cells; for more, call write_cells again with a later start.' },
  cells: { type: 'object', additionalProperties: {}, description: 'Single cells by address, like {"B2": 1200, "C2": "=B2*2"}; the same values as rows.' },
  formats: { type: 'array', description: 'Formatting for ranges, applied in order (up to 500, each range up to 100,000 cells).', items: { type: 'object', properties: {
    range: { type: 'string', description: 'Like A1:D1 or B2.' }, bold: { type: 'boolean' }, italic: { type: 'boolean' }, underline: { type: 'boolean' }, wrap: { type: 'boolean', description: 'Several lines in the cell.' },
    color: { type: 'string', description: 'Text color, #rrggbb.' }, fill: { type: 'string', description: 'Background color, #rrggbb.' }, font_size: { type: 'number' },
    align: { type: 'string', enum: ['left', 'center', 'right'] }, valign: { type: 'string', enum: ['top', 'middle', 'bottom'] },
    number_format: { type: 'string', description: 'How numbers show: ' + NUMBER_FORMATS + '.' },
    border: { type: 'string', enum: ['all', 'outside', 'thick_outside', 'bottom', 'top', 'none'] },
    merge: { type: 'boolean', description: 'One cell over the whole range, as for a title.' } }, required: ['range'] } },
  column_widths: { type: 'object', additionalProperties: { type: 'number' }, description: 'Widths in pixels by column letter, like {"A": 160, "B": 90}. The default is 100.' },
  freeze_rows: { type: 'number', description: 'How many rows at the top stay in view when scrolling (1 for a header row).' },
  freeze_columns: { type: 'number' },
  direction: { type: 'string', enum: ['rtl', 'ltr'], description: 'rtl puts column A on the right, as Hebrew Excel does. Leave out to follow the language of the text.' },
  charts: { type: 'array', description: 'Charts drawn from cells of this sheet, like Excel charts; they redraw by themselves when the cells change. Write the cells first (rows), then chart them.', items: { type: 'object', properties: {
    type: { type: 'string', enum: ['column', 'bar', 'line', 'pie', 'donut'], description: 'column: upright bars; bar: bars across; line; pie; donut (a pie with a hole). pie and donut show the first series only.' },
    range: { type: 'string', description: 'The cells to chart with their headers, like A1:C7. Words in the first row name the series and words in the first column are the categories, as in Excel.' },
    title: { type: 'string' },
    at: { type: 'string', description: 'The cell at the top corner of the chart, like F2. The default is beside the range.' },
    width: { type: 'number', description: 'In pixels; 480 by default.' },
    height: { type: 'number', description: 'In pixels; 288 by default.' },
    series_in: { type: 'string', enum: ['columns', 'rows'], description: 'Leave out to let the sheet decide, as Excel does.' },
    legend: { type: 'boolean', description: 'true by default.' },
    labels: { type: 'boolean', description: 'The numbers on the bars or slices.' } }, required: ['type', 'range'] } },
  conditional_formats: { type: 'array', description: 'Conditional formatting, as in Excel: cells colored by their values, data bars, color scales and icons. They follow the cells when they change. The first rule is the strongest.', items: { type: 'object', properties: {
    range: { type: 'string', description: 'The cells, like B2:B20 (several ranges with spaces between them).' },
    type: { type: 'string', enum: ['greater_than', 'greater_or_equal', 'less_than', 'less_or_equal', 'equal', 'not_equal', 'between', 'not_between', 'text_contains', 'text_not_contains', 'text_begins', 'text_ends', 'date', 'blanks', 'no_blanks', 'errors', 'no_errors', 'top', 'bottom', 'above_average', 'below_average', 'duplicates', 'unique', 'formula', 'data_bar', 'color_scale', 'icon_set'] },
    value: { description: 'For the comparisons: a number, text, or a formula like "=$E$1".' }, value2: { description: 'The other end, for between.' },
    text: { type: 'string', description: 'For the text types.' },
    period: { type: 'string', enum: ['yesterday', 'today', 'tomorrow', 'last_7_days', 'last_week', 'this_week', 'next_week', 'last_month', 'this_month', 'next_month'], description: 'For date.' },
    count: { type: 'number', description: 'For top and bottom: how many (10 by default).' }, percent: { type: 'boolean', description: 'For top and bottom: count is a percent.' },
    formula: { type: 'string', description: 'For formula: true colors the cell. Written for the first cell of the range, and moved for each cell like a copied formula: "=$C2>100" colors each row whose C is over 100.' },
    style: { type: 'string', enum: ['red', 'yellow', 'green', 'fill', 'text'], description: 'The look for the highlighting types: red is a light red fill with dark red text (the default), yellow and green the same in their colors, fill a light red fill only, text red text only.' },
    fill: { type: 'string', description: 'Instead of style: a fill #rrggbb.' }, text_color: { type: 'string', description: 'Instead of style: a text color #rrggbb.' }, bold: { type: 'boolean' }, italic: { type: 'boolean' },
    color: { type: 'string', description: 'For data_bar: #rrggbb (blue by default).' }, solid: { type: 'boolean', description: 'For data_bar: a solid bar instead of a gradient.' },
    colors: { type: 'array', items: { type: 'string' }, description: 'For color_scale: 2 or 3 colors #rrggbb, from the lowest values to the highest (red, yellow, green by default).' },
    icons: { type: 'string', enum: ['arrows', 'triangles', 'traffic_lights', 'signs', 'symbols', 'flags', 'stars', 'ratings', 'quarters'], description: 'For icon_set.' },
    reverse: { type: 'boolean', description: 'For icon_set: the icons the other way around.' }, hide_values: { type: 'boolean', description: 'For data_bar and icon_set: show only the bar or the icon.' },
    stop_if_true: { type: 'boolean' } }, required: ['range', 'type'] } },
  validations: { type: 'array', description: 'Data validation, as in Excel: a drop-down list in cells, or a limit on what a person may type into them (it follows the cells when they move, and is saved in Excel files). ' +
      'A rule takes the place of any rule its cells had. It checks only what a person types: values you write are not stopped, and write_cells tells you which of them a rule does not allow.', items: { type: 'object', properties: {
    range: { type: 'string', description: 'The cells, like B2:B50 (several ranges with spaces between them; B:B is a whole column).' },
    type: { type: 'string', enum: ['list', 'whole_number', 'decimal', 'date', 'time', 'text_length', 'custom', 'any', 'none'], description: 'list: a drop-down list. whole_number, decimal, date, time and text_length compare with operator and value. custom: a formula that must be true. any: no limit, only the input message. none: takes the rules of these cells away.' },
    values: { type: 'array', items: {}, description: 'For list: the items written out, like ["Yes", "No", "Maybe"] (no commas inside an item, up to 255 characters in all; for a longer list write the items in cells and give source).' },
    source: { type: 'string', description: 'For list, instead of values: the cells that hold the items, one row or one column, like "H2:H20" or "Lists!A1:A30". The list follows those cells as they change.' },
    dropdown: { type: 'boolean', description: 'For list: false hides the arrow in the cell (true by default).' },
    operator: { type: 'string', enum: ['between', 'not_between', 'equal', 'not_equal', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal'] },
    value: { description: 'A number, a date as "2026-01-31", a time as "8:30", or a formula like "=$E$1". With between and not_between it is the smaller end.' }, value2: { description: 'The larger end, for between and not_between.' },
    formula: { type: 'string', description: 'For custom: what is typed is accepted when this is true. Written for the first cell of the range and moved for each cell like a copied formula: "=ISNUMBER(B2)", "=COUNTIF($B$2:$B$50,B2)=1" (no duplicates).' },
    allow_blank: { type: 'boolean', description: 'false makes an empty cell not valid (true by default).' },
    input_title: { type: 'string', description: 'Up to 32 characters.' }, input_message: { type: 'string', description: 'A note shown beside the cell while it is selected, saying what to type (up to 255 characters).' },
    error_style: { type: 'string', enum: ['stop', 'warning', 'information'], description: 'What happens when a person types a value that is not valid. stop (the default): the value is refused. warning: they are asked whether to keep it. information: they are told, and the value goes in.' },
    error_title: { type: 'string', description: 'Up to 32 characters.' }, error_message: { type: 'string', description: 'The alert\'s text (up to 225 characters); a short default is used without it.' },
    show_error: { type: 'boolean', description: 'false: no alert at all, anything can be typed (true by default).' } }, required: ['range', 'type'] } },
};
const TOOLS = [
  { name: 'list_documents', description: 'List the documents, presentations and spreadsheets in Floating Ink: id, title, kind, word count, last change, and which one is open on screen.',
    inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'read_document', description: 'Read a document as Markdown, a presentation slide by slide, or a spreadsheet\'s cells. Without an id, reads the one open on screen; for a document, also returns the text the user has selected in it.',
    inputSchema: { type: 'object', properties: { id: DOC_ID } }, annotations: { readOnlyHint: true } },
  { name: 'create_presentation', description: 'Create a new presentation and open it on the user\'s screen, where they watch the slides come in one by one. ' +
      'Start with a "title" slide; keep each slide to a title and a few short points. The user adds the pictures themselves. Returns its id.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, theme: THEME, transition: TRANSITION, slides: { type: 'array', items: { type: 'object', properties: SLIDE } } }, required: ['title', 'slides'] } },
  { name: 'edit_presentation', description: 'Change a presentation: add, update, delete or move slides, or change its color theme. read_document shows its slides and their numbers. ' +
      'The changes run in order, and each slide number means the slide at that step. update replaces only the fields it gives (and a new layout keeps the slide\'s text). The user can undo with Ctrl+Z.',
    inputSchema: { type: 'object', properties: { id: DOC_ID, theme: THEME, transition: TRANSITION, changes: { type: 'array', items: { type: 'object', properties: {
      action: { type: 'string', enum: ['add', 'update', 'delete', 'move'] },
      slide: { type: 'number', description: 'update, delete, move: the slide\'s number (1 is the first).' },
      at: { type: 'number', description: 'add: the number the new slide gets (default: the end). move: the number it moves to.' },
      ...SLIDE }, required: ['action'] } } } } },
  { name: 'create_spreadsheet', description: 'Create a new spreadsheet (like Excel) and open it on the user\'s screen: one or more sheets of cells with values, formulas and formatting. ' +
      'Use it for tables, budgets, schedules, lists with totals and anything the user wants to calculate. Put a header row on top (bold, with a fill, frozen), give numbers a number_format, and total with formulas. Returns its id.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, direction: SHEET.direction, sheets: { type: 'array', items: { type: 'object', properties: SHEET } } }, required: ['title', 'sheets'] } },
  { name: 'read_spreadsheet', description: 'Read a spreadsheet: the names of its sheets, and for one sheet (the one on screen, or `sheet`) what each cell shows, the formulas in it, and its charts, conditional formatting and data validation (drop-down lists and limits on what may be typed). Without a range, reads the part that is used.',
    inputSchema: { type: 'object', properties: { id: DOC_ID, sheet: { type: 'string' }, range: { type: 'string', description: 'Like A1:F40.' } } }, annotations: { readOnlyHint: true } },
  { name: 'write_cells', description: 'Write values, formulas and formatting into a spreadsheet (it opens on screen, and the user can undo it with Ctrl+Z). The fields are the same as a sheet in create_spreadsheet. ' +
      '`sheet` picks a sheet by name (a new sheet is added if none has that name; leave out for the sheet on screen), and `clear` empties a range first.',
    inputSchema: { type: 'object', properties: { id: DOC_ID, sheet: { type: 'string' }, clear: { type: 'string', description: 'A range to empty before writing, like A1:H50.' }, ...Object.fromEntries(Object.entries(SHEET).filter(([k]) => k !== 'name')) } } },
  { name: 'create_document', description: 'Create a new document from Markdown and open it on the user\'s screen. Returns its id.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string', description: 'Markdown' } }, required: ['title', 'content'] } },
  { name: 'write_in_document', description: 'Add Markdown content to a document (it opens on screen). where: "end" (default), "start", "after_selection" or "replace_selection" (the text the user selected).',
    inputSchema: { type: 'object', properties: { id: DOC_ID, content: { type: 'string', description: 'Markdown' }, where: { type: 'string', enum: ['end', 'start', 'after_selection', 'replace_selection'] } }, required: ['content'] } },
  { name: 'replace_text', description: 'Replace every occurrence of a word or phrase in a document (whole words only). Returns how many were replaced.',
    inputSchema: { type: 'object', properties: { id: DOC_ID, find: { type: 'string' }, replace: { type: 'string' } }, required: ['find', 'replace'] } },
  { name: 'replace_document', description: 'Replace the whole content of a document with new Markdown. The previous content is kept in the document\'s saved versions, so the user can restore it.',
    inputSchema: { type: 'object', properties: { id: DOC_ID, content: { type: 'string', description: 'Markdown' } }, required: ['content'] } },
  { name: 'rename_document', description: 'Change a document\'s title.',
    inputSchema: { type: 'object', properties: { id: DOC_ID, title: { type: 'string' } }, required: ['title'] } },
  { name: 'send_message', description: 'Post a message in the chat panel inside Floating Ink, where the user and other connected assistants can read it.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'read_messages', description: 'Read the recent messages in the chat panel inside Floating Ink (from the user and from assistants).',
    inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'wait_for_message', description: 'Stay listening to the chat panel inside Floating Ink and return the user\'s message the moment they send it, ' +
      'instead of hearing about it only when they come back to this window. Call it whenever the user may keep talking to you from inside Floating Ink: ' +
      'right after you write something there, after send_message, or when they ask you to stay available. Waiting here is free - nothing is spent while it waits - ' +
      'so one long call is far cheaper than asking again and again, and you should leave `seconds` alone unless the user asked for something else. ' +
      'It returns nothing if the whole wait went by in silence; call it again if the user is still expecting you there.',
    inputSchema: { type: 'object', properties: { seconds: { type: 'number', description: 'How long to keep listening, 5 to 1800 seconds. Default 600 (ten minutes), which is what you normally want.' } } }, annotations: { readOnlyHint: true } },
];
const NEW_MSG = 'While you were working, the user wrote this to you in the Floating Ink chat panel. Answer it (send_message puts your answer in that panel), and call wait_for_message to stay with them:';
const NO_MSG = 'No message from the user in Floating Ink yet. If they are still working there and waiting for you, call wait_for_message again; otherwise finish your turn.';

/* ---------- the hub: owns the port, holds the browser's connection ---------- */
let isHub = false;
let app = null;                 // the SSE response of the connected Floating Ink page
const pending = new Map();      // call id -> { resolve, reject, timer }
const appOrigin = o => /^https:\/\/floatingrotations\.com$/.test(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
const okHost = h => /^(127\.0\.0\.1|localhost):\d+$/.test(h || '');   // refuses DNS-rebinding requests

function cors(req, res) {
  const o = req.headers.origin;
  if (o && appOrigin(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Vary', 'Origin');
  }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', c => { data += c; if (data.length > 20e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
async function waitForApp(ms) {
  for (let t = 0; !app && t < ms; t += 250) await new Promise(r => setTimeout(r, 250));
  return !!app;
}
async function sendToApp(tool, args, client) {
  if (!app && !(await waitForApp(6000))) throw new Error(NOT_CONNECTED);
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Floating Ink did not answer in time. Try again.')); }, 90000);
    pending.set(id, { resolve, reject, timer });
    app.write('event: call\ndata: ' + JSON.stringify({ id, tool, args, client }) + '\n\n');
  });
}
/* ---------- the user's messages, and the assistants listening for them ----------
   An assistant that calls wait_for_message stays here until the user writes in Floating Ink's chat panel,
   so it answers straight away instead of hearing about the message only later. */
const msgs = [];                      // { text, t, taken } - what the user wrote, newest last
const waiters = new Set();            // { resolve, timer }, in the order they started waiting
const CANCELLED = Symbol('cancelled');
const tellApp = () => { if (app) app.write('event: waiting\ndata: ' + JSON.stringify({ n: waiters.size }) + '\n\n'); };

/* a message belongs to whoever picks it up first, so one message gets one answer even when
   two assistants are connected */
function takeMessages() {
  const fresh = msgs.filter(m => !m.taken);
  for (const m of fresh) m.taken = true;
  return fresh.map(m => ({ from: 'the user', text: m.text, time: new Date(m.t).toISOString() }));
}
function endWait(w, result) {
  if (!waiters.delete(w)) return;
  clearTimeout(w.timer);
  tellApp();
  w.resolve(result);
}
function newMessage(text) {
  msgs.push({ text, t: Date.now(), taken: false });
  if (msgs.length > 200) msgs.shift();
  const first = waiters.values().next().value;           // the one that has been waiting longest
  if (first) endWait(first, takeMessages());
}
function hubWait(args, hooks) {
  const secs = Math.min(Math.max(Number(args && args.seconds) || 600, 5), 1800);   // long on purpose: waiting should cost almost nothing
  const already = takeMessages();                        // a message that arrived while it was busy working
  if (already.length) return Promise.resolve(already);
  return new Promise(resolve => {
    const w = { resolve };
    w.timer = setTimeout(() => endWait(w, []), secs * 1000);
    waiters.add(w);
    if (hooks) hooks.cancel = () => endWait(w, CANCELLED);
    tellApp();
  });
}

const server = http.createServer(async (req, res) => {
  if (!okHost(req.headers.host)) { res.writeHead(403).end(); return; }
  const origin = req.headers.origin;
  const path = (req.url || '').split('?')[0];
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(origin && appOrigin(origin) ? 204 : 403).end();
    return;
  }
  // the Floating Ink page
  if (path === '/events' && req.method === 'GET') {
    if (!origin || !appOrigin(origin)) { res.writeHead(403).end(); return; }
    if (app) { app.write('event: replaced\ndata: {}\n\n'); app.end(); }   // the newest window takes over, and the old one is told so it stops coming back
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('event: hello\ndata: ' + JSON.stringify({ version: VERSION }) + '\n\n');
    app = res;
    tellApp();                              // tells the page whether an assistant is listening right now
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => {
      clearInterval(ping);
      if (app === res) {
        app = null;
        for (const [id, p] of pending) { clearTimeout(p.timer); p.reject(new Error('Floating Ink was closed. ' + NOT_CONNECTED)); pending.delete(id); }
      }
    });
    log('Floating Ink connected');
    return;
  }
  if (path === '/msg' && req.method === 'POST') {
    if (!origin || !appOrigin(origin)) { res.writeHead(403).end(); return; }
    try {
      const m = await readBody(req);
      const text = String((m && m.text) || '').trim().slice(0, 4000);
      if (text) newMessage(text);
      res.writeHead(204).end();
    } catch { res.writeHead(400).end(); }
    return;
  }
  if (path === '/result' && req.method === 'POST') {
    if (!origin || !appOrigin(origin)) { res.writeHead(403).end(); return; }
    try {
      const r = await readBody(req), p = pending.get(r.id);
      if (p) { clearTimeout(p.timer); pending.delete(r.id); r.ok ? p.resolve(r.result) : p.reject(new Error(r.error || 'Failed')); }
      res.writeHead(204).end();
    } catch { res.writeHead(400).end(); }
    return;
  }
  // other copies of this program (no Origin header: web pages can't use this)
  if (path === '/call' && req.method === 'POST' && !origin) {
    try {
      const r = await readBody(req);
      const hooks = {};                     // the other copy hung up: stop waiting, and leave the message for it
      res.on('close', () => { if (!res.writableEnded && hooks.cancel) hooks.cancel(); });
      const out = await hubCall(r.tool, r.args, r.client, hooks);
      if (out === CANCELLED) return;
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, ...out }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }
  if (path === '/status' && req.method === 'GET' && !origin) {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ app: !!app, version: VERSION }));
    return;
  }
  res.writeHead(404).end();
});
function becomeHub() {
  return new Promise(resolve => {
    const onError = e => { server.removeListener('listening', onListening); resolve(false); if (e.code !== 'EADDRINUSE') log('port error', e.code); };
    const onListening = () => { server.removeListener('error', onError); isHub = true; log('hub on port', PORT); resolve(true); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(PORT, '127.0.0.1');
  });
}
/* a copy that isn't the hub passes the call on; if the hub is gone, it takes its place */
function postToHub(tool, args, client, hooks) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ tool, args, client });
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/call', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => { data += c; });
      res.on('end', () => { try { const r = JSON.parse(data); r.ok ? resolve({ result: r.result, pending: r.pending || [] }) : reject(new Error(r.error)); } catch (e) { reject(e); } });
    });
    if (hooks) hooks.cancel = () => req.destroy();
    req.on('error', reject);
    req.end(body);
  });
}
async function callApp(tool, args, client, hooks) {
  if (isHub) return hubCall(tool, args, client, hooks);
  try { return await postToHub(tool, args, client, hooks); }
  catch (e) {
    if (e.code !== 'ECONNREFUSED' || !(await becomeHub())) throw e;
    return hubCall(tool, args, client, hooks);
  }
}
/* in the hub: run the call, and hand back whatever the user wrote that this copy has not been given yet,
   so an assistant that is working here notices the message even when it is not listening for one */
async function hubCall(tool, args, client, hooks) {
  if (tool === 'wait_for_message') {
    const result = await hubWait(args, hooks);
    return result === CANCELLED ? CANCELLED : { result, pending: [] };
  }
  return { result: await sendToApp(tool, args, client), pending: takeMessages() };
}

/* ---------- MCP over stdio ---------- */
let clientName = 'Claude';
const inflight = new Map();     // request id -> the hooks of a call that can still be cancelled
const friendly = n => ({ 'claude-ai': 'Claude', 'claude-code': 'Claude Code' })[n] || (n ? String(n).replace(/[-_]/g, ' ').replace(/^\w/, c => c.toUpperCase()) : 'AI');
const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

/* a client that waits for a tool may give up on its own; a progress note tells it the wait is alive */
function keepAlive(name, params) {
  const token = params && params._meta && params._meta.progressToken;
  if (name !== 'wait_for_message' || token == null) return null;
  let n = 0;
  return setInterval(() => send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: ++n, message: 'Listening in Floating Ink...' } }), 10000);
}
async function handle(msg) {
  const { id, method, params } = msg || {};
  if (method === 'initialize') {
    clientName = friendly(params && params.clientInfo && params.clientInfo.name);
    const asked = params && params.protocolVersion;
    return reply(id, {
      protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
      capabilities: { tools: {} },
      serverInfo: { name: 'floating-ink', title: 'Floating Ink', version: VERSION },
      instructions: INSTRUCTIONS,
    });
  }
  if (method === 'notifications/cancelled') {           // gave up on the call: let go without eating the message
    const h = inflight.get(params && params.requestId);
    if (h) { h.cancelled = true; if (h.cancel) h.cancel(); }
    return;
  }
  if (id === undefined || id === null) return;          // notifications (initialized, progress...)
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: TOOLS });
  if (method === 'tools/call') {
    const name = params && params.name;
    if (!TOOLS.some(t => t.name === name)) return fail(id, -32602, 'Unknown tool: ' + name);
    const hooks = {};
    inflight.set(id, hooks);
    const tick = keepAlive(name, params);
    try {
      const out = await callApp(name, (params && params.arguments) || {}, clientName, hooks);
      if (hooks.cancelled || out === CANCELLED) return;
      const { result, pending } = out;
      const nothing = name === 'wait_for_message' && Array.isArray(result) && !result.length;
      let text = nothing ? NO_MSG : typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      if (pending && pending.length) text += '\n\n' + NEW_MSG + pending.map(m => '\n- "' + m.text + '"').join('');
      return reply(id, { content: [{ type: 'text', text }] });
    } catch (e) {
      if (hooks.cancelled) return;
      return reply(id, { content: [{ type: 'text', text: e.message }], isError: true });
    } finally { clearInterval(tick); inflight.delete(id); }
  }
  return fail(id, -32601, 'Method not found: ' + method);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return fail(null, -32700, 'Parse error'); }
  handle(msg).catch(e => log('error', e.message));
});
rl.on('close', () => process.exit(0));
becomeHub();
