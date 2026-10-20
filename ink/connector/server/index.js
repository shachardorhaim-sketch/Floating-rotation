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
const VERSION = '1.18.0';
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
  'It also makes spreadsheets, like Excel: create_spreadsheet builds one with values, formulas, formatting, conditional formatting, drop-down lists (data validation), defined names and charts (a budget, a table of grades, a list with totals, a chart of them), ' +
  'read_spreadsheet reads one, and write_cells changes cells in one. Formulas are written the way Excel writes them in English, with commas: =SUM(B2:B9). ' +
  'It also makes drawings, like a paint program: create_drawing starts one (or an animation, with several frames), draw paints on it while the user watches ' +
  '(exact shapes in SVG, hand-drawn lines with its brushes, the paint bucket, text), edit_drawing changes its layers, frames and background and applies filters, ' +
  'and read_document shows a drawing as a picture. Look at a drawing before adding to it, and at the picture each drawing call returns, to fix what looks wrong. ' +
  'It also makes comics and manga: create_comic turns a story into pages and panels, with the words of each panel in speech, thought, shout, whisper ' +
  'and narration bubbles, sound words, effects, and a note in each panel of what should be drawn there. The user draws the panels themselves. ' +
  'A comic keeps its characters: list them once (with what they look like), name who is in each panel and who says each bubble, and the user draws each character once for every place it appears. ' +
  'A comic can also be a webtoon (one long strip read by scrolling on a phone), and can move while it is read (motion on the bubbles and characters, a camera in the panels, page turns). ' +
  'edit_comic changes the pages, the panels, the words, the characters and the motion, and read_document reads a comic panel by panel with a picture of a page. ' +
  'The chat panel inside Floating Ink is shared: send_message leaves a note there, and read_messages shows ' +
  'what the user or another connected assistant wrote. The user often keeps writing to you from that panel instead of ' +
  'switching back to this window, so when they may still be talking to you there, call wait_for_message: it comes back ' +
  'the moment they send something. When the user asks you to connect to Floating Ink, or to stay with them there, keep a ' +
  'loop going: wait_for_message, answer what they wrote with send_message (and do in the documents whatever they asked for), ' +
  'then wait_for_message again, until they say to stop. One wait lasts ten minutes and costs nothing while it waits, so stay ' +
  'in the wait instead of ending your turn. ' +
  // the better way where it exists: the session sleeps, and the user's message wakes it
  'If you can run a shell command in the background and get called back when it ends (Claude Code can, with run_in_background), ' +
  'stay connected that way instead, as the chat of one document: find the document the user means (list_documents shows which one is open), then run ' +
  ' node "' + __filename + '" --wait --doc <its id>  in the background and end your turn. It waits as long as it takes, costs nothing while it waits, ' +
  'and ends the moment the user writes in the panel while that document is open, which calls you back. Its output is what they wrote: ' +
  'answer it with send_message (and do what they asked in that document), then start the same command in the background again before you finish, so you keep listening. ' +
  'Tell the user once that from now on they can simply write to you in Floating Ink while that document is open.';

const DOC_ID = { type: 'string', description: 'Document id from list_documents. Leave out to use the document open on screen.' };
const THEME = { type: 'string', enum: ['ink', 'night', 'sand', 'forest', 'sunset', 'chalk', 'plain', 'notebook', 'science', 'business', 'gaming', 'history',
  'space', 'nature', 'books', 'party', 'sports', 'music', 'minimal', 'travel', 'food', 'math', 'tech', 'creator', 'art'],
  description: 'Design theme; pick one that fits the topic. ink (blue on white, the default), night (dark blue), sand (warm orange), forest (green), ' +
    'sunset (pink and purple), chalk (a green chalkboard), plain (black on white), notebook (a lined school notebook), science (a dark lab, hexagons), ' +
    'business (navy and gold), gaming (neon on dark purple), history (old parchment), space (stars and planets), nature (green leaves), ' +
    'books (a library in burgundy), party (pink confetti), sports (black and orange), music (purple, sound waves), minimal (quiet, black on light gray), ' +
    'travel (sky and sea), food (a warm kitchen), math (graph paper), tech (dark blue circuits), creator (red on black, like a video channel), art (bright paint blobs).' };
const COMIC_LAYOUT = { type: 'string', enum: ['g1', 'g2', 'g2v', 'g4', 'g6', 'g8', 'g9', 'c3', 'c4', 'r3', 'r4', 'r121', 'r212', 'r122', 'r221', 'r232', 'r1222', 'm212', 'm2d', 'm3d', 'mside', 'mact', 'mz', 'mbig', 'w1', 'w2', 'w3', 'wt2', 'w12', 'w21', 'wl2', 'wz'],
  description: 'How the page is cut, by the number of panels. 1: g1 (one big panel). 2: g2 (one above the other), g2v (side by side), m2d (cut on a diagonal). 3: r3 (three rows), c3 (three side by side, for strips). ' +
    '4: g4 (2 x 2), r121 (one wide, two, one wide), r4 (four rows), m3d (the same, leaning, manga style), mside (a tall panel beside three), c4 (four side by side). ' +
    '5: r212 (two, one wide, two), r122 (a big one on top, then two and two), r221, m212 (r212 leaning), mbig (two, a big one, two). ' +
    '6: g6 (three rows of two), mact (one wide, two on a diagonal, three). 7: r232, r1222, mz (four leaning rows). 8: g8. 9: g9. ' +
    'Without a layout, the page gets a plain one for its number of panels; choose leaning (m...) ones for action and excitement. ' +
    'A webtoon\'s parts also have their own: w1 (one panel), w2 and w3 (two or three, one under another), wt2 (a tall one and a short one), w12 (one wide, two side by side), w21, wl2 (two, cut on a slant), wz (three, leaning).' };
const COMIC_KIND = { type: 'string', enum: ['speech', 'thought', 'shout', 'whisper', 'narration'], description: 'speech (an oval with a tail toward the speaker), thought (a cloud), shout (spikes), whisper (a dashed line), narration (a box for the narrator, with no tail).' };
const COMIC_EFFECT = { type: 'string', enum: ['speed', 'focus', 'tone'], description: 'speed (speed lines, for fast movement), focus (manga focus lines toward the middle: surprise, tension, something important), tone (manga screentone dots, for shade and mood).' };
const COMIC_MOTION = { type: 'string', enum: ['none', 'fade', 'pop', 'slide', 'zoom', 'shake', 'type'], description: 'How it comes in when its panel is read: fade, pop (springs in), slide (flies in from a side, see "from"), zoom (comes from close and big), shake, type (a bubble\'s words write themselves letter by letter), or none.' };
const COMIC_CAMERA = { type: 'string', enum: ['none', 'in', 'out', 'pan', 'shake'], description: 'The camera inside a panel while it is read: in (moves slowly closer), out (moves away), pan (moves along it, see "toward"), shake (the panel shakes, as in an explosion), or none.' };
const COMIC_TRANSITION = { type: 'string', enum: ['push', 'fade', 'turn', 'zoom', 'none'], description: 'How a page gives way to the next while reading: push (the next one slides in), fade, turn (like a book\'s page), zoom, none.' };
const COMIC_PAGES = { type: 'array', description: 'The pages, in order. A page has 1 to 9 panels; a comic page usually has 4 to 6.', items: { type: 'object', properties: {
  layout: COMIC_LAYOUT,
  panels: { type: 'array', description: 'The panels in reading order (for a comic read from right to left, the first one is at the top right).', items: { type: 'object', properties: {
    note: { type: 'string', description: 'What should be drawn in the panel: the place, who is there and what they do, the angle. It shows in the empty panel for the one drawing, and is never printed.' },
    characters: { type: 'array', items: { type: 'string' }, description: 'The names of the characters standing in the panel (from "characters"; a new name becomes a new character). Each appears there as the user draws it once.' },
    bubbles: { type: 'array', description: 'What is said or thought in the panel, in the order it is read. A panel holds about one to three bubbles.', items: { type: 'object', properties: { kind: COMIC_KIND, text: { type: 'string' }, character: { type: 'string', description: 'Who says or thinks it: its tail then points at that character in the panel.' } }, required: ['text'] } },
    sounds: { type: 'array', items: { type: 'string' }, description: 'Big sound words drawn in the panel, like "BOOM!".' },
    effect: COMIC_EFFECT } } },
  height: { type: 'number', description: 'Only for a webtoon: this part\'s height in pixels (640 to 4096; 2560 when left out), taller for a long scene such as a fall.' } }, required: ['panels'] } };
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
    'As in Excel 365, a formula whose answer is several values spills them into the cells below and beside it: =SORT(A2:B20,2,-1), =FILTER(A2:C20,C2:C20>50), =UNIQUE(A2:A20), =SEQUENCE(10); leave those cells empty, and refer to the whole spill as A2#. INDIRECT and OFFSET work, and so do defined names (see names): =SUM(Prices). So do LET and LAMBDA (with MAP, REDUCE, SCAN, BYROW, BYCOL and MAKEARRAY), Excel\'s financial functions (PMT, FV, NPV, IRR, XIRR, RATE and the rest), HYPERLINK, and a table\'s columns by name (see tables): =SUM(Sales[Price]). Write plain numbers (1200), and set their look with formats. ' +
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
    border: { type: 'string', enum: ['all', 'top', 'bottom'], description: 'A thin line around each cell the rule changes (all), or above or below it, as Excel\'s rules allow.' },
    border_style: { type: 'string', enum: ['solid', 'dashed', 'dotted'] }, border_color: { type: 'string', description: '#rrggbb (black by default).' },
    stop_if_true: { type: 'boolean' } }, required: ['range', 'type'] } },
  validations: { type: 'array', description: 'Data validation, as in Excel: a drop-down list in cells, or a limit on what a person may type into them (it follows the cells when they move, and is saved in Excel files). ' +
      'A rule takes the place of any rule its cells had. It checks only what a person types: values you write are not stopped, and write_cells tells you which of them a rule does not allow. A rule over a table\'s column reaches the rows a person adds to the table.', items: { type: 'object', properties: {
    range: { type: 'string', description: 'The cells, like B2:B50 (several ranges with spaces between them; B:B is a whole column).' },
    type: { type: 'string', enum: ['list', 'whole_number', 'decimal', 'date', 'time', 'text_length', 'custom', 'any', 'none'], description: 'list: a drop-down list. whole_number, decimal, date, time and text_length compare with operator and value. custom: a formula that must be true. any: no limit, only the input message. none: takes the rules of these cells away.' },
    values: { type: 'array', items: {}, description: 'For list: the items written out, like ["Yes", "No", "Maybe"] (no commas inside an item, up to 255 characters in all; for a longer list write the items in cells and give source).' },
    source: { type: 'string', description: 'For list, instead of values: the cells that hold the items, one row or one column, like "H2:H20" or "Lists!A1:A30", or a defined name for them ("Fruits"). The list follows those cells as they change. ' +
      'For a list that depends on another cell, "=INDIRECT(A2)": A2 holds the name of a defined name (or an address as text), and each cell of the rule looks at the cell beside it, like a copied formula.' },
    dropdown: { type: 'boolean', description: 'For list: false hides the arrow in the cell (true by default).' },
    operator: { type: 'string', enum: ['between', 'not_between', 'equal', 'not_equal', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal'] },
    value: { description: 'A number, a date as "2026-01-31", a time as "8:30", or a formula like "=$E$1". With between and not_between it is the smaller end.' }, value2: { description: 'The larger end, for between and not_between.' },
    formula: { type: 'string', description: 'For custom: what is typed is accepted when this is true. Written for the first cell of the range and moved for each cell like a copied formula: "=ISNUMBER(B2)", "=COUNTIF($B$2:$B$50,B2)=1" (no duplicates).' },
    allow_blank: { type: 'boolean', description: 'false makes an empty cell not valid (true by default).' },
    input_title: { type: 'string', description: 'Up to 32 characters.' }, input_message: { type: 'string', description: 'A note shown beside the cell while it is selected, saying what to type (up to 255 characters).' },
    error_style: { type: 'string', enum: ['stop', 'warning', 'information'], description: 'What happens when a person types a value that is not valid. stop (the default): the value is refused. warning: they are asked whether to keep it. information: they are told, and the value goes in.' },
    error_title: { type: 'string', description: 'Up to 32 characters.' }, error_message: { type: 'string', description: 'The alert\'s text (up to 225 characters); a short default is used without it.' },
    show_error: { type: 'boolean', description: 'false: no alert at all, anything can be typed (true by default).' } }, required: ['range', 'type'] } },
  notes: { type: 'object', additionalProperties: { type: 'string' }, description: 'Notes on cells, as Excel\'s notes (a red corner, shown when the pointer is over the cell): {"B2": "Checked with the bank"}. An empty text takes a note away.' },
  links: { type: 'object', additionalProperties: { type: 'string' }, description: 'Links on cells: {"A2": "https://example.com"}, an email as "mailto:name@example.com", or a place in this workbook as "#Sheet2!A1". The cell keeps its value (write the text to show in it); an empty text takes the link away. A formula can also make one: =HYPERLINK("https://example.com","Site").' },
  tables: { type: 'array', description: 'Formatted tables, as Excel\'s Format as Table: bands of color, a filter button on each heading, and a name. Write the cells first (rows), with the headings in the range\'s first row. ' +
      'Formulas may use the table\'s columns by name: =SUM(Sales[Price]), =Sales[@Price]*Sales[@Qty] (the same row), or [@Price] inside the table; a formula written into an empty column fills the whole column. A row typed right below a table joins it.', items: { type: 'object', properties: {
    range: { type: 'string', description: 'The table with its heading row, like A1:D20.' },
    name: { type: 'string', description: 'Letters, digits and _, starting with a letter (Hebrew too), and not like a cell address; like Sales. Leave out for Table1, Table2...' },
    style: { type: 'string', description: 'One of Excel\'s 60 table styles: Light1 to Light21, Medium1 to Medium28, Dark1 to Dark11 (Medium2, blue, by default).' },
    total_row: { type: 'boolean', description: 'A total row under the table (true adds it; the last column is summed).' },
    banded_rows: { type: 'boolean', description: 'true by default.' }, banded_columns: { type: 'boolean' }, first_column: { type: 'boolean', description: 'The first column in bold.' }, last_column: { type: 'boolean' },
    filter_button: { type: 'boolean', description: 'true by default.' } }, required: ['range'] } },
  pivots: { type: 'array', description: 'Pivot tables, as Excel\'s PivotTable: a summary of a table or a range by its fields (the headings of its first row), in Excel\'s compact layout with subtotals and grand totals. As in Excel it keeps a copy of the data as it was when it was made, and shows that until it is refreshed: after changing its data, refresh it (write_cells with refresh_pivots). ' +
      'Write the data first (on this sheet or another), then the pivot table where there is room for it. Formulas can read its cells, and GETPIVOTDATA reads one value by its items: =GETPIVOTDATA("Sales",$H$3,"Region","North").', items: { type: 'object', properties: {
    source: { type: 'string', description: 'The data with its heading row: a range like A1:E200 (on this sheet) or Data!A1:E200, or a table\'s name like Sales.' },
    at: { type: 'string', description: 'The cell where the pivot table starts, like H3 (the default is beside the used part of the sheet). Leave room below it and beside it.' },
    name: { type: 'string', description: 'Leave out for PivotTable1, PivotTable2...' },
    rows: { type: 'array', items: { type: 'string' }, description: 'Fields whose items become rows, the outer one first, like ["Region", "Product"].' },
    columns: { type: 'array', items: { type: 'string' }, description: 'Fields whose items become columns.' },
    values: { type: 'array', description: 'The fields to summarize, each a field\'s name or {field, summarize, name}.', items: { anyOf: [{ type: 'string' }, { type: 'object', properties: {
      field: { type: 'string' }, summarize: { type: 'string', enum: ['sum', 'count', 'average', 'max', 'min', 'product', 'count_numbers', 'stddev', 'stddevp', 'var', 'varp'], description: 'sum by default; count counts every value, count_numbers only numbers.' },
      name: { type: 'string', description: 'The caption over its column (the default is like Excel\'s: Sum of Sales, in the user\'s language).' } }, required: ['field'] }] } },
    filters: { type: 'array', description: 'Fields that filter the whole pivot table, shown above it: a field\'s name, or {field, values} with the items it lets through.', items: { anyOf: [{ type: 'string' }, { type: 'object', properties: {
      field: { type: 'string' }, values: { type: 'array', items: {} } }, required: ['field'] }] } } }, required: ['source'] } },
};
const NAMES = { type: 'array', description: 'Defined names, as in Excel: a name for a range of cells, a number or a formula, to write in formulas (=SUM(Prices)), as a list\'s source and in conditional formatting. ' +
    'They follow their cells when rows, columns or sheets change, and are saved in Excel files. A name that is already there takes the new meaning. ' +
    'For a drop-down list that depends on another one: name each list\'s cells after an item of the first list, and give the second list the source =INDIRECT(A2).',
  items: { type: 'object', properties: {
    name: { type: 'string', description: 'Letters, digits, _ and . after a first letter or _ (Hebrew letters too). No spaces, and nothing that reads as a cell address (B2, R1C1) or as TRUE or FALSE.' },
    refers_to: { type: 'string', description: 'A range with its sheet, like "=Lists!$A$2:$A$9" (one range written without $ is taken as fixed), a number like "=0.17", or a formula like "=OFFSET(Lists!$A$2,0,0,COUNTA(Lists!$A:$A)-1,1)".' },
    sheet: { type: 'string', description: 'Leave out for a name of the whole workbook (the usual). A sheet\'s name makes it that sheet\'s own name, known only there.' },
    comment: { type: 'string' },
    delete: { type: 'boolean', description: 'write_cells only: true takes the name away.' } }, required: ['name'] } };
const LOOK = { type: 'boolean', description: 'false: no picture of the drawing comes back (one does by default).' };
const DRAW_ITEMS = { type: 'array', description: 'What to draw, in order (up to 400 items); the user watches it appear. Coordinates are the drawing\'s pixels, (0, 0) at the top left. ' +
    'svg: shapes, paths, gradients and text as one <svg> element (scripts and pictures from elsewhere are taken out). Its coordinates are the drawing\'s pixels unless it has a viewBox; x, y, width and height place it (by default it covers the whole drawing). Its top-level elements appear one after another. Best for anything exact: backgrounds, outlines, filled shapes, scenery. ' +
    'stroke: a line drawn by hand with one of the app\'s brushes, curving smoothly through the points as a real stroke does. The same point twice in a row makes a sharp corner; a third number in a point (0 to 1) is pen pressure, thinner where it is low. ' +
    'fill: the paint bucket at x, y: fills the area of alike color around that point, up to the lines of every visible layer (all_layers false: of this layer only). ' +
    'text: text in one of the app\'s fonts (Hebrew too), centered on x, y (with align left or right, x is that edge); several lines with \\n.',
  items: { type: 'object', properties: {
    type: { type: 'string', enum: ['svg', 'stroke', 'fill', 'text'] },
    svg: { type: 'string', description: 'svg: the whole <svg ...>...</svg>.' },
    x: { type: 'number' }, y: { type: 'number' },
    width: { type: 'number', description: 'svg: where it goes.' }, height: { type: 'number' },
    points: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'stroke: [[x, y], [x, y], ...], or [x, y, pressure].' },
    brush: { type: 'string', enum: ['pen', 'pencil', 'marker', 'brush', 'spray', 'eraser'], description: 'stroke: pen (the default: even and clean), pencil (thin, with the grain of paper), marker (wide and see-through), brush (soft paint), spray (a cloud of dots), eraser (rubs out what is on the layer).' },
    color: { type: 'string', description: '#rrggbb (black by default).' },
    size: { type: 'number', description: 'stroke: its width in pixels (each brush has its own default); text: the height of the letters in pixels (48 by default).' },
    opacity: { type: 'number', description: '0 (nothing) to 1 (solid).' },
    tolerance: { type: 'number', description: 'fill: how alike a color must be to be filled, 0 to 100 (30 by default).' },
    all_layers: { type: 'boolean', description: 'fill: false goes by the colors of this layer alone.' },
    text: { type: 'string' },
    font: { type: 'string', description: 'text: Rubik (the default in Hebrew and English), Assistant, Heebo, Noto Sans Hebrew, IBM Plex Sans Hebrew, Varela Round, Alef, Fredoka, Frank Ruhl Libre, David Libre, Noto Serif Hebrew, Miriam Libre, Bellefair, Suez One, Secular One, Karantina, Amatic SC, Solitreo, Arial, Times New Roman or Courier New.' },
    bold: { type: 'boolean', description: 'text: true by default.' },
    align: { type: 'string', enum: ['left', 'center', 'right'] } }, required: ['type'] } };
const FILTERS = 'hsl (hue -180..180, sat -100..100, light -100..100, col: true colors everything in one hue), bc (br brightness -100..100, ct contrast -100..100), ' +
  'curves (cv: {"a": [[in, out], ...], "r": ..., "g": ..., "b": ...}, points 0..255, for all colors or one), temp (wa warmth -100..100), gmap (gr: three colors from the dark to the light, amt 0..100), ' +
  'gray, sepia and invert (amt 0..100), post (lv shades of each color 2..16), thr (t 1..99, clr: white becomes see-through), blur (r 0..200 px), motion (len 0..400 px, ang -180..180), ' +
  'zoom (s 0..100, c: its center [x, y]), sharp (amt 0..300, r 1..20), glow (t from what brightness 0..100, r 1..150, amt 0..300), noise (amt 0..100, gs grain 1..20, col), pix (cell 2..120 px), ' +
  'half (halftone dots: cell 3..60, mono), glitch (amt 0..100, seed), chroma (amt 0..100, c [x, y]), vig (vignette: amt 0..100, size 0..100, col color, c [x, y]), edges (line art: amt 0..100, soft 0..10, white), ' +
  'emboss (amt 0..300, ht 1..10, ang -180..180, col), outline (w 1..64 px, col color), shadow (dist 0..200, ang -180..180, soft 0..100, see transparency 0..100, col color)';
const TOOLS = [
  { name: 'list_documents', description: 'List the documents, presentations, spreadsheets, drawings and comics in Floating Ink: id, title, kind, word count, last change, and which one is open on screen.',
    inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'read_document', description: 'Read a document as Markdown, a presentation slide by slide, a spreadsheet\'s cells, a drawing (its layers and frames, and a picture of it), or a comic (its pages, each panel in reading order with its note and its words, and a picture of a page). Without an id, reads the one open on screen; for a document, also returns the text the user has selected in it.',
    inputSchema: { type: 'object', properties: { id: DOC_ID, frame: { type: 'number', description: 'For a drawing that is an animation: the frame to see, 1 for the first (the one on screen by default).' },
      page: { type: 'number', description: 'For a comic: the page to see as a picture, 1 for the first (the one on screen by default).' } } }, annotations: { readOnlyHint: true } },
  { name: 'create_drawing', description: 'Create a new drawing, like a paint program, and open it on the user\'s screen. For an animation give it frames, then draw on each one (draw with frame). ' +
      'items draws on it straight away (the same items as draw). Returns its id, its layers, and a picture of it.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' },
      size: { type: 'string', enum: ['wide', 'a4_portrait', 'a4_landscape', 'square', 'animation'], description: 'wide 1920 x 1080 (the default), a4_portrait 1240 x 1754, a4_landscape 1754 x 1240, square 1500 x 1500, animation 1280 x 720 (the default for an animation).' },
      width: { type: 'number', description: 'Instead of size: 16 to 4096 pixels.' }, height: { type: 'number' },
      background: { type: 'string', description: '#rrggbb (white by default), or "transparent".' },
      frames: { type: 'number', description: 'For an animation: how many empty frames, 1 to 300.' },
      fps: { type: 'number', description: 'For an animation: frames per second, 1 to 30 (12 by default).' },
      items: DRAW_ITEMS, look: LOOK }, required: ['title'] } },
  { name: 'draw', description: 'Draw on a drawing while the user watches: exact shapes in SVG, lines with the app\'s brushes, the paint bucket, and text. What one call draws is one step the user can undo with Ctrl+Z. ' +
      'Read a drawing first (read_document) to see what is there; draw on a layer of your own (layer) unless asked to change the user\'s own lines; and look at the picture that comes back to check the result.',
    inputSchema: { type: 'object', properties: { id: DOC_ID,
      layer: { type: 'string', description: 'The layer to draw on, by its name; a new layer with this name is added on top when there is none. Leave out for the layer selected on screen.' },
      frame: { type: 'number', description: 'For an animation: the frame to draw on, 1 for the first (the one on screen by default). One more than the number of frames adds a new frame at the end.' },
      clear: { type: 'boolean', description: 'true empties the layer (in this frame) before drawing.' },
      items: DRAW_ITEMS, look: LOOK }, required: ['items'] } },
  { name: 'edit_drawing', description: 'Change a drawing: its layers, its frames (an animation is a drawing with several frames, shown one after another), its background, and filters, as in the app\'s Filters tab. ' +
      'The actions run in order, as one step the user can undo with Ctrl+Z; if one of them fails, nothing changes. Layers are called by their names (read_document lists them), and frames are numbered from 1. Returns the layers and frames, and a picture of the drawing.',
    inputSchema: { type: 'object', properties: { id: DOC_ID, look: LOOK, actions: { type: 'array', items: { type: 'object', properties: {
      action: { type: 'string', enum: ['add_layer', 'delete_layer', 'rename_layer', 'duplicate_layer', 'layer', 'move_layer', 'select_layer', 'clear_layer', 'add_frame', 'delete_frame', 'move_frame', 'frame_duration', 'go_to_frame', 'animation', 'background', 'filter'],
        description: 'add_layer (name, above: on top by default), delete_layer, rename_layer (name), duplicate_layer (name), layer (visible, opacity 0 to 1, pinned: shown on every frame of an animation, like a background, blend: how it mixes with the layers under it), ' +
          'move_layer (to: top, bottom, up or down), select_layer, clear_layer (frame), add_frame (after: the last by default; count; copy: copies of that frame instead of empty ones), delete_frame (frame), move_frame (frame, to), ' +
          'frame_duration (frame, beats: how many beats it stays, 1 by default), go_to_frame (frame: shows it on screen), animation (fps 1 to 30, loop: loop, ping (back and forth) or once), background (color #rrggbb or "transparent"), ' +
          'filter (filter, settings, all_frames: on every frame of the layer).' },
      layer: { type: 'string', description: 'The layer\'s name; leave out for the layer selected on screen.' },
      name: { type: 'string' }, above: { type: 'string', description: 'add_layer: the layer to put it above.' },
      visible: { type: 'boolean' }, opacity: { type: 'number' }, pinned: { type: 'boolean' },
      blend: { type: 'string', enum: ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'add'],
        description: 'layer: the blend mode, as in drawing programs. multiply darkens only (colors under black lines, a shadow), screen lightens only (light, glow), overlay adds contrast.' },
      to: { description: 'move_layer: top, bottom, up or down. move_frame: the frame\'s new number.' },
      frame: { type: 'number' }, after: { type: 'number' }, count: { type: 'number' }, copy: { type: 'boolean' }, beats: { type: 'number' },
      fps: { type: 'number' }, loop: { type: 'string', enum: ['loop', 'ping', 'once'] }, color: { type: 'string' },
      filter: { type: 'string', enum: ['hsl', 'bc', 'curves', 'temp', 'gmap', 'gray', 'sepia', 'invert', 'post', 'thr', 'blur', 'motion', 'zoom', 'sharp', 'glow', 'noise', 'pix', 'half', 'glitch', 'chroma', 'vig', 'edges', 'emboss', 'outline', 'shadow'],
        description: 'The filters and their settings: ' + FILTERS + '.' },
      settings: { type: 'object', description: 'Only the settings that change, like {"r": 12}; the rest start where the filter starts.' },
      all_frames: { type: 'boolean' } }, required: ['action'] } } }, required: ['actions'] } },
  { name: 'create_comic', description: 'Create a new comic (or manga, or webtoon) from a story and open it on the user\'s screen: pages, each cut into panels, ' +
      'with the words of each panel in bubbles and a note in each panel of what to draw there. The user draws the pictures themselves, so write the notes for them: ' +
      'who is in the panel, where, doing what, and from how close. List the characters once in "characters", name the ones in each panel and who says each bubble: ' +
      'the user then draws each character once, and it appears in every panel it is in. Keep each bubble short (a comic bubble holds about one or two sentences), and keep the words ' +
      'in the story\'s language (Hebrew stories become comics read from right to left). Returns the comic as read_document reads it, and a picture of its first page.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, pages: COMIC_PAGES,
      characters: { type: 'array', description: 'The story\'s characters, each once.', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string', description: 'What it looks like, for the one drawing it: age, hair, clothes, what makes it easy to recognize.' } }, required: ['name'] } },
      direction: { type: 'string', enum: ['rtl', 'ltr'], description: 'The way it is read: rtl (manga, and comics in Hebrew or Arabic) or ltr (comics in English and most languages). By default, from the language of the words.' },
      size: { type: 'string', enum: ['comic', 'manga', 'a4', 'square', 'strip', 'webtoon'], description: 'comic (a comic book page, the default), manga (a manga book page), a4, square (for sharing), strip (one short row of panels, like a newspaper strip; give its pages 3 or 4 panels with the layout c3 or c4), webtoon (one long strip read by scrolling down on a phone: its pages are parts one under another, usually 1 to 3 wide panels each, with the w... layouts).' },
      motion: { type: 'boolean', description: 'true gives everything motion while it is read: bubbles pop in, narration fades in, sound words shake, characters slide in.' },
      transition: COMIC_TRANSITION },
      required: ['pages'] } },
  { name: 'edit_comic', description: 'Change a comic: add, delete or move pages, cut a page into panels another way, write the note of what to draw in a panel, ' +
      'add bubbles, sound words and effects to a panel, change or delete them, or change the way it is read; add, change and place characters and say who says a bubble; ' +
      'give things motion, a panel a camera, and the pages a way to turn. read_document shows the pages, the panels (numbered ' +
      'in reading order) and the ids of the bubbles. The actions run in order, all or none, as one step the user can undo with Ctrl+Z.',
    inputSchema: { type: 'object', properties: { id: DOC_ID, actions: { type: 'array', items: { type: 'object', properties: {
      action: { type: 'string', enum: ['add_pages', 'delete_page', 'move_page', 'set_layout', 'set_height', 'set_note', 'add_bubble', 'add_sound', 'add_effect', 'set_text', 'delete_item', 'set_direction',
        'add_character', 'change_character', 'delete_character', 'place_character', 'set_speaker', 'set_motion', 'set_camera', 'set_transition', 'auto_motion'] },
      page: { type: 'number', description: 'The page, 1 for the first (every action but add_pages, set_direction, add_character, change_character, delete_character, set_transition and auto_motion).' },
      panel: { type: 'number', description: 'set_note, add_bubble, add_sound, add_effect, place_character, set_camera: the panel, numbered in reading order on its page.' },
      character: { type: 'string', description: 'A character\'s name: the one to change or delete, place in a panel, or who says a bubble (add_bubble, set_speaker; empty for nobody).' },
      name: { type: 'string', description: 'add_character, change_character: its name.' }, description: { type: 'string', description: 'add_character, change_character: what it looks like.' },
      look: { type: 'number', description: 'place_character: which of its looks (1 for the first).' },
      height: { type: 'number', description: 'set_height: a webtoon part\'s height in pixels, 640 to 4096.' },
      motion: COMIC_MOTION, from: { type: 'string', enum: ['r', 'l', 't', 'b'], description: 'set_motion with slide: the side it flies in from.' },
      delay: { type: 'number', description: 'set_motion: seconds it waits before coming in.' }, duration: { type: 'number', description: 'set_motion: seconds it takes.' },
      camera: COMIC_CAMERA, toward: { type: 'string', enum: ['r', 'l', 't', 'b'], description: 'set_camera with pan: the way the camera moves.' },
      strength: { type: 'number', description: 'set_camera: how much it moves, 0.05 to 0.5.' },
      transition: COMIC_TRANSITION, clear: { type: 'boolean', description: 'auto_motion: true takes all the motion away instead.' },
      pages: COMIC_PAGES, at: { type: 'number', description: 'add_pages: the number the first new page gets (default: after the last).' },
      to: { type: 'number', description: 'move_page: the number it moves to.' },
      layout: COMIC_LAYOUT, note: { type: 'string', description: 'set_note: what should be drawn in the panel.' },
      kind: COMIC_KIND, text: { type: 'string', description: 'add_bubble, add_sound, set_text: the words.' },
      effect: COMIC_EFFECT, item: { type: 'string', description: 'set_text, delete_item, set_speaker, set_motion: the id of a bubble, a sound word, an effect or a character in a panel, from read_document.' },
      direction: { type: 'string', enum: ['rtl', 'ltr'] } }, required: ['action'] } }, look_page: { type: 'number', description: 'The page whose picture comes back (default: the one on screen).' } },
      required: ['actions'] } },
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
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, direction: SHEET.direction, sheets: { type: 'array', items: { type: 'object', properties: SHEET } }, names: NAMES }, required: ['title', 'sheets'] } },
  { name: 'read_spreadsheet', description: 'Read a spreadsheet: the names of its sheets, its defined names, and for one sheet (the one on screen, or `sheet`) what each cell shows (the cells of pivot tables too), the formulas, notes and links in it, and its tables, pivot tables, pictures, charts, conditional formatting and data validation (drop-down lists and limits on what may be typed). Without a range, reads the part that is used.',
    inputSchema: { type: 'object', properties: { id: DOC_ID, sheet: { type: 'string' }, range: { type: 'string', description: 'Like A1:F40.' } } }, annotations: { readOnlyHint: true } },
  { name: 'write_cells', description: 'Write values, formulas and formatting into a spreadsheet (it opens on screen, and the user can undo it with Ctrl+Z). The fields are the same as a sheet in create_spreadsheet. ' +
      '`sheet` picks a sheet by name (a new sheet is added if none has that name; leave out for the sheet on screen), `clear` empties a range first, and `names` defines, changes or deletes defined names.',
    inputSchema: { type: 'object', properties: { id: DOC_ID, sheet: { type: 'string' }, clear: { type: 'string', description: 'A range to empty before writing, like A1:H50.' }, ...Object.fromEntries(Object.entries(SHEET).filter(([k]) => k !== 'name')), names: NAMES,
      refresh_pivots: { type: 'boolean', description: 'true refreshes every pivot table of the spreadsheet after this call\'s writing (Excel\'s Refresh All): they take their data as it is now.' } } } },
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
      'It returns nothing if the whole wait went by in silence; call it again if the user is still expecting you there. ' +
      'Give `doc` (a document id from list_documents) to hear only what is written while that document is open: that is how a chat becomes the one chat of that document.',
    inputSchema: { type: 'object', properties: { seconds: { type: 'number', description: 'How long to keep listening, 5 to 1800 seconds. Default 600 (ten minutes), which is what you normally want.' },
      doc: { type: 'string', description: 'A document id: hear only what is written while it is open.' } } }, annotations: { readOnlyHint: true } },
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
const msgs = [];                      // { text, doc, t, taken } - what the user wrote, newest last, and in which document
const waiters = new Set();            // { resolve, timer, doc }, in the order they started waiting
const bound = new Map();              // document -> when a listener tied to it last waited
const CANCELLED = Symbol('cancelled');
const tellApp = () => { if (app) app.write('event: waiting\ndata: ' + JSON.stringify({ n: waiters.size, docs: [...waiters].map(w => w.doc).filter(Boolean) }) + '\n\n'); };

/* a message belongs to whoever picks it up first, so one message gets one answer even when
   two assistants are connected. A document can have its own chat: a listener tied to it (doc) takes
   only what was written while it was open, and for a few hours nobody else takes those */
const reserved = m => !!m.doc && Date.now() - (bound.get(m.doc) || 0) < 3 * 3600e3;
function takeMessages(doc) {
  const fresh = msgs.filter(m => !m.taken && (doc ? m.doc === doc : !reserved(m)));
  for (const m of fresh) m.taken = true;
  return fresh.map(m => ({ from: 'the user', text: m.text, time: new Date(m.t).toISOString(), ...(m.doc ? { document: m.doc } : {}) }));
}
function endWait(w, result) {
  if (!waiters.delete(w)) return;
  clearTimeout(w.timer);
  tellApp();
  w.resolve(result);
}
function newMessage(text, doc) {
  const m = { text, doc, t: Date.now(), taken: false };
  msgs.push(m);
  if (msgs.length > 200) msgs.shift();
  // that document's own chat if it is listening, else the listener without a document that has waited longest
  let w = [...waiters].find(x => x.doc && x.doc === doc);
  if (!w && !reserved(m)) w = [...waiters].find(x => !x.doc);
  if (w) endWait(w, takeMessages(w.doc));
}
function hubWait(args, hooks) {
  const secs = Math.min(Math.max(Number(args && args.seconds) || 600, 5), 1800);   // long on purpose: waiting should cost almost nothing
  const doc = args && typeof args.doc === 'string' ? args.doc.slice(0, 64) : '';
  if (doc) bound.set(doc, Date.now());
  const already = takeMessages(doc);                     // a message that arrived while it was busy working
  if (already.length) return Promise.resolve(already);
  return new Promise(resolve => {
    const w = { resolve, doc };
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
      if (text) newMessage(text, typeof m.doc === 'string' ? m.doc.slice(0, 64) : '');
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
      const out = await callApp(name, { ...((params && params.arguments) || {}), __img: 1 }, clientName, hooks);
      if (hooks.cancelled || out === CANCELLED) return;
      const { pending } = out;
      let { result } = out, images = [];
      if (result && typeof result === 'object' && Array.isArray(result.__images)) {
        images = result.__images.filter(i => i && typeof i.data === 'string' && /^image\/(png|jpeg|webp)$/.test(i.mimeType)).map(i => ({ type: 'image', data: i.data, mimeType: i.mimeType }));
        result = { ...result }; delete result.__images;
      }
      const nothing = name === 'wait_for_message' && Array.isArray(result) && !result.length;
      let text = nothing ? NO_MSG : typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      if (pending && pending.length) text += '\n\n' + NEW_MSG + pending.map(m => '\n- "' + m.text + '"').join('');
      return reply(id, { content: [{ type: 'text', text }, ...images] });
    } catch (e) {
      if (hooks.cancelled) return;
      return reply(id, { content: [{ type: 'text', text: e.message }], isError: true });
    } finally { clearInterval(tick); inflight.delete(id); }
  }
  return fail(id, -32601, 'Method not found: ' + method);
}

/* ---------- node index.js --wait: the user's message wakes a sleeping Claude ----------
   Claude Code calls a session back when a command it left running in the background ends. So a session that
   wants to hear from the user runs this in the background and goes idle: it waits for free until the user
   writes in Floating Ink's chat panel, prints what they wrote, and ends - and that wakes the session up */
const WAIT_DOC = process.argv.includes('--doc') ? String(process.argv[process.argv.indexOf('--doc') + 1] || '').slice(0, 64) : '';   // --doc <id>: the chat of that document
async function waitMode() {
  for (;;) {
    let out = null;
    try { out = await callApp('wait_for_message', { seconds: 1800, doc: WAIT_DOC }, 'Claude Code', {}); }
    catch { await new Promise(r => setTimeout(r, 3000)); continue; }   // the connector holding the page is changing hands
    const msgs = out && Array.isArray(out.result) ? out.result : [];
    if (!msgs.length) continue;                         // half an hour of quiet: keep waiting, nobody is woken for nothing
    process.stdout.write('The user wrote to you in the Floating Ink chat panel:\n' + msgs.map(m => '- ' + m.text).join('\n') +
      '\n\nAnswer there with send_message (and do what they asked), then run this same command again in the background to keep listening.\n',
      () => process.exit(0));
    return;
  }
}
if (process.argv.includes('--wait')) waitMode();
else {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', line => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return fail(null, -32700, 'Parse error'); }
    handle(msg).catch(e => log('error', e.message));
  });
  rl.on('close', () => process.exit(0));
  becomeHub();
}
