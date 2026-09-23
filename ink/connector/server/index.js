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
const VERSION = '1.3.0';
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const log = (...a) => process.stderr.write('[floating-ink] ' + a.join(' ') + '\n');   // stdout is only for MCP

const NOT_CONNECTED = 'Floating Ink is not connected. Ask the user to open Floating Ink (https://floatingrotations.com/ink/) ' +
  'and turn on "Connect AI" (the robot button at the top of the app), then try again.';

const INSTRUCTIONS = 'Floating Ink is a word processor open in the user\'s browser. These tools work inside it live: ' +
  'the user sees every change as it happens, and can undo it with Ctrl+Z. Write document content in Markdown ' +
  '(# headings, **bold**, *italic*, lists, "- [ ]" checklists, | tables |, > quotes, [links](https://...)). ' +
  'Keep the language of the document unless the user asks otherwise; many documents are in Hebrew. ' +
  'The chat panel inside Floating Ink is shared: send_message leaves a note there, and read_messages shows ' +
  'what the user or another connected assistant wrote. The user often keeps writing to you from that panel instead of ' +
  'switching back to this window, so when they may still be talking to you there, call wait_for_message: it comes back ' +
  'the moment they send something. When the user asks you to connect to Floating Ink, or to stay with them there, keep a ' +
  'loop going: wait_for_message, answer what they wrote with send_message (and do in the documents whatever they asked for), ' +
  'then wait_for_message again, until they say to stop. One wait lasts ten minutes and costs nothing while it waits, so stay ' +
  'in the wait instead of ending your turn.';

const DOC_ID = { type: 'string', description: 'Document id from list_documents. Leave out to use the document open on screen.' };
const TOOLS = [
  { name: 'list_documents', description: 'List the documents in Floating Ink: id, title, word count, last change, and which one is open on screen.',
    inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'read_document', description: 'Read a document as Markdown. Without an id, reads the document open on screen, and also returns the text the user has selected in it.',
    inputSchema: { type: 'object', properties: { id: DOC_ID } }, annotations: { readOnlyHint: true } },
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
const PROC = crypto.randomUUID();     // this copy of the program: each one is given every message once
let msgSeq = 0;
const msgs = [];                      // { seq, text, t } - what the user wrote, newest last
const cursors = new Map();            // proc -> the last seq that copy was given
const waiters = new Set();            // { proc, resolve, timer }
const CANCELLED = Symbol('cancelled');
const tellApp = () => { if (app) app.write('event: waiting\ndata: ' + JSON.stringify({ n: waiters.size }) + '\n\n'); };

function cursorFor(proc) {
  if (!cursors.has(proc)) {                              // the first time: also what was written in the last two minutes
    const seen = msgs.filter(m => Date.now() - m.t > 120000);
    cursors.set(proc, seen.length ? seen[seen.length - 1].seq : 0);
  }
  return cursors.get(proc);
}
function freshFor(proc) {
  const fresh = msgs.filter(m => m.seq > cursorFor(proc));
  if (fresh.length) cursors.set(proc, fresh[fresh.length - 1].seq);
  return fresh.map(m => ({ from: 'the user', text: m.text, time: new Date(m.t).toISOString() }));
}
function endWait(w, result) {
  if (!waiters.delete(w)) return;
  clearTimeout(w.timer);
  tellApp();
  w.resolve(result);
}
function newMessage(text) {
  msgs.push({ seq: ++msgSeq, text, t: Date.now() });
  if (msgs.length > 200) msgs.shift();
  for (const w of [...waiters]) { const fresh = freshFor(w.proc); if (fresh.length) endWait(w, fresh); }
}
function hubWait(args, proc, hooks) {
  const secs = Math.min(Math.max(Number(args && args.seconds) || 600, 5), 1800);   // long on purpose: waiting should cost almost nothing
  const already = freshFor(proc);                        // a message that arrived while it was busy working
  if (already.length) return Promise.resolve(already);
  return new Promise(resolve => {
    const w = { proc, resolve };
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
    if (app) app.end();                     // the newest window takes over
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
      const out = await hubCall(r.tool, r.args, r.client, hooks, r.proc || 'unknown');
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
    const body = JSON.stringify({ tool, args, client, proc: PROC });
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
async function hubCall(tool, args, client, hooks, proc = PROC) {
  if (tool === 'wait_for_message') {
    const result = await hubWait(args, proc, hooks);
    return result === CANCELLED ? CANCELLED : { result, pending: [] };
  }
  return { result: await sendToApp(tool, args, client), pending: freshFor(proc) };
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
