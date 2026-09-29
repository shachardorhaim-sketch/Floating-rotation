// Floating Ink — service worker: lets the installed app open without internet.
// The app's own files are fetched fresh when online (so updates arrive) and fall back
// to the saved copy offline. Fonts and the Word/PDF/Excel libraries are kept after first use. sheet.js (the
// spreadsheets) is saved at install, so a spreadsheet opens offline even if none was opened before.
const SHELL = 'ink-shell-v5';
const LIBS = 'ink-libs-v1';
const LANGS = ['en', 'ar', 'zh', 'es', 'fr', 'pt', 'ru', 'de'];
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './floating-ink.webp', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon-32.png', './icons/mark-64.png', './pptx-shapes.json', './sheet.js', ...LANGS.map(l => `./lang/${l}.js`)];
const LIB_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('ink-') && k !== SHELL && k !== LIBS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
          return res;
        })
        // the exact address first: with ignoreSearch alone, an older copy saved under another query string could answer
        .catch(() => caches.match(req).then(hit => hit || caches.match(req, { ignoreSearch: true })).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
        .then(res => res || Response.error())
    );
    return;
  }

  if (LIB_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(LIBS).then(async c => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      })
    );
  }
});
