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

const PORT = 47821;
const VERSION = '1.0.0';
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const log = (...a) => process.stderr.write('[floating-ink] ' + a.join(' ') + '\n');   // stdout is only for MCP

const NOT_CONNECTED = 'Floating Ink is not connected. Ask the user to open Floating Ink (https://floatingrotations.com/ink/) ' +
  'and turn on "Connect AI" (the robot button at the top of the app), then try again.';

const INSTRUCTIONS = 'Floating Ink is a word processor open in the user\'s browser. These tools work inside it live: ' +
  'the user sees every change as it happens, and can undo it with Ctrl+Z. Write document content in Markdown ' +
  '(# headings, **bold**, *italic*, lists, "- [ ]" checklists, | tables |, > quotes, [links](https://...)). ' +
  'Keep the language of the document unless the user asks otherwise; many documents are in Hebrew. ' +
  'The chat panel inside Floating Ink is shared: send_message leaves a note there, and read_messages shows ' +
  'what the user or another connected assistant wrote.';

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
];

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
      const result = await sendToApp(r.tool, r.args, r.client);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, result }));
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
function postToHub(tool, args, client) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ tool, args, client });
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/call', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => { data += c; });
      res.on('end', () => { try { const r = JSON.parse(data); r.ok ? resolve(r.result) : reject(new Error(r.error)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end(body);
  });
}
async function callApp(tool, args, client) {
  if (isHub) return sendToApp(tool, args, client);
  try { return await postToHub(tool, args, client); }
  catch (e) {
    if (e.code !== 'ECONNREFUSED' || !(await becomeHub())) throw e;
    return sendToApp(tool, args, client);
  }
}

/* ---------- MCP over stdio ---------- */
let clientName = 'Claude';
const friendly = n => ({ 'claude-ai': 'Claude', 'claude-code': 'Claude Code' })[n] || (n ? String(n).replace(/[-_]/g, ' ').replace(/^\w/, c => c.toUpperCase()) : 'AI');
const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

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
  if (id === undefined || id === null) return;          // notifications (initialized, cancelled...)
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: TOOLS });
  if (method === 'tools/call') {
    const name = params && params.name;
    if (!TOOLS.some(t => t.name === name)) return fail(id, -32602, 'Unknown tool: ' + name);
    try {
      const result = await callApp(name, (params && params.arguments) || {}, clientName);
      return reply(id, { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] });
    } catch (e) {
      return reply(id, { content: [{ type: 'text', text: e.message }], isError: true });
    }
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
