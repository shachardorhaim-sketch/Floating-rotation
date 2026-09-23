#!/usr/bin/env node
/* "Claude answers me inside Floating Ink" - the helper the user asked for and starts by hand.

   The user (the owner of this computer and of the Claude account) wanted to write in Floating Ink's
   chat panel and get Claude's answer there, without switching to a Claude window. Claude cannot wake
   itself up, so this helper does the waking: it holds one wait_for_message call on the connector and,
   when the user writes something, runs the claude CLI once with that message. That run answers through
   send_message, which is what the user sees, and then the helper goes back to listening.

   Deliberately small and bounded, because it spends the user's Claude tokens:
     - it is started by hand and stops when its window is closed (it is not a service and nothing
       starts it automatically);
     - one answer at a time, never in parallel;
     - only the nine Floating Ink tools are allowed - no shell, no files, no network;
     - it stops by itself after MAX_ANSWERS answers or IDLE_STOP minutes with nobody writing;
     - every message and every answer is printed in the window, so the user can watch what it costs.

   Run:  node ink/connector/watch.js      Stop: close the window (or Ctrl+C).                      */
'use strict';
const { spawn } = require('child_process');
const path = require('path');

const SERVER = path.join(__dirname, 'server', 'index.js');
/* the claude command itself, the .exe and not the .cmd: node refuses to start a .cmd without a shell */
const CLAUDE = process.env.CLAUDE_CLI || path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
const TOOLS = ['list_documents', 'read_document', 'create_document', 'write_in_document', 'replace_text',
  'replace_document', 'rename_document', 'send_message', 'read_messages'].map(t => 'mcp__floating-ink__' + t).join(',');
const WAIT = 50;                 // one listening round, in seconds
const MAX_ANSWERS = 20;          // then it stops and says so, so a runaway cannot burn the account
const IDLE_STOP = 60;            // minutes of silence after which it stops on its own
const log = (...a) => console.log(new Date().toLocaleTimeString('he-IL'), ...a);

const ASK = msg => `אתה קלוד, ואתה עובד בתוך Floating Ink - מעבד התמלילים של שחר. שחר בן 12, מדברים איתו בעברית פשוטה.
שחר כתב לך עכשיו בחלונית הצ'אט שבתוך Floating Ink:

"${msg}"

ענה לו דרך הכלי send_message - זה מה שהוא רואה על המסך. הוא לא רואה שום דבר אחר שתכתוב.
אם הוא ביקש משהו במסמכים, תעשה את זה עם הכלים (read_document, write_in_document וכו') ואז תכתוב לו בחלונית מה עשית.
אל תקרא ל-wait_for_message. תענה קצר, בעברית, ובלי להסביר איך זה עובד מבפנים.`;

let answers = 0, idle = 0, busy = false, buf = '', id = 1;
const mcp = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });   // this copy also serves as the connector if none is running
const send = o => mcp.stdin.write(JSON.stringify(o) + '\n');
const listen = () => send({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name: 'wait_for_message', arguments: { seconds: WAIT } } });
const stop = why => { log(why); mcp.kill(); process.exit(0); };

mcp.stdout.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.id === 1) { log('מחובר. אפשר לכתוב בחלונית של Floating Ink.'); listen(); continue; }
    if (m.id > 1 && m.result) heard((((m.result || {}).content || [])[0] || {}).text || '');
  }
});
function heard(text) {
  let msgs = [];
  try { const j = JSON.parse(text); if (Array.isArray(j)) msgs = j; } catch {}
  if (!msgs.length) {                                        // a quiet round
    idle += WAIT / 60;
    return idle >= IDLE_STOP ? stop('אף אחד לא כתב כבר שעה, אז עצרתי. אפשר להפעיל שוב מתי שתרצה.') : listen();
  }
  idle = 0;
  const one = msgs.map(m => m.text).join('\n');
  log('שחר כתב:', one.slice(0, 100));
  answer(one);
}
function answer(msg) {
  if (busy) return listen();
  busy = true;
  /* the question goes in through stdin, so Hebrew never has to survive the command line */
  const run = spawn(CLAUDE, ['-p', '--allowedTools', TOOLS, '--max-turns', '12', '--output-format', 'text'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let out = '', err = '';
  run.stdout.on('data', d => { out += d; });
  run.stderr.on('data', d => { err += d; });
  run.on('error', e => { err += e.message; });
  run.on('close', code => {
    busy = false;
    answers++;
    log(code === 0 ? 'קלוד ענה בחלונית  (' + answers + '/' + MAX_ANSWERS + ')' : 'קלוד לא הצליח לענות: ' + (err || out).slice(0, 250));
    if (answers >= MAX_ANSWERS) return stop('הגעתי ל-' + MAX_ANSWERS + ' תשובות ועצרתי, כדי לא לבזבז טוקנים. אפשר להפעיל שוב.');
    listen();
  });
  run.stdin.end(ASK(msg), 'utf8');
}
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-ai' }, capabilities: {} } });
process.on('SIGINT', () => stop('להתראות.'));
