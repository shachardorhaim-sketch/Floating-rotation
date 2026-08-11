// ============================================================
//  Floating rotation — מתרגם העמודים ללא התקנה (Bookmarklet)
//  זהו המקור הקריא. הקובץ bookmarklet.js בונה מזה את הקישור.
//  אין כאן שום API של תוסף — רק fetch רגיל, ולכן זה רץ בכל דפדפן
//  בלי התקנה ובלי מצב מפתח.
// ============================================================
(function () {
  var ID = '__flrotTranslate';
  if (window[ID]) { window[ID].show(); return; }

  var LANGS = [['he','עברית'],['en','English'],['ar','العربية'],['zh','中文'],
               ['es','Español'],['fr','Français'],['pt','Português'],['ru','Русский'],['de','Deutsch']];
  var RTL = ['he','ar'];
  var S = {
    he:{t:'מתרגם…',done:'העמוד תורגם',stop:'⏹ עצור',restore:'↩ החזר מקור',go:'תרגם את העמוד',
        of:'מתוך',none:'לא נמצא טקסט',err:'התרגום נכשל',lang:'לתרגם ל־'},
    en:{t:'Translating…',done:'Page translated',stop:'⏹ Stop',restore:'↩ Restore original',go:'Translate page',
        of:'of',none:'No text found',err:'Translation failed',lang:'Translate to'},
    ar:{t:'جارٍ الترجمة…',done:'تمت الترجمة',stop:'⏹ إيقاف',restore:'↩ استعادة الأصل',go:'ترجم الصفحة',
        of:'من',none:'لا يوجد نص',err:'فشلت الترجمة',lang:'الترجمة إلى'},
    zh:{t:'翻译中…',done:'页面已翻译',stop:'⏹ 停止',restore:'↩ 恢复原文',go:'翻译页面',
        of:'/',none:'未找到文本',err:'翻译失败',lang:'翻译成'},
    es:{t:'Traduciendo…',done:'Página traducida',stop:'⏹ Detener',restore:'↩ Restaurar',go:'Traducir página',
        of:'de',none:'Sin texto',err:'Fallo',lang:'Traducir a'},
    fr:{t:'Traduction…',done:'Page traduite',stop:'⏹ Arrêter',restore:'↩ Restaurer',go:'Traduire la page',
        of:'sur',none:'Aucun texte',err:'Échec',lang:'Traduire en'},
    pt:{t:'Traduzindo…',done:'Página traduzida',stop:'⏹ Parar',restore:'↩ Restaurar',go:'Traduzir página',
        of:'de',none:'Sem texto',err:'Falhou',lang:'Traduzir para'},
    ru:{t:'Перевод…',done:'Страница переведена',stop:'⏹ Стоп',restore:'↩ Оригинал',go:'Перевести страницу',
        of:'из',none:'Нет текста',err:'Ошибка',lang:'Перевести на'},
    de:{t:'Übersetze…',done:'Seite übersetzt',stop:'⏹ Stopp',restore:'↩ Original',go:'Seite übersetzen',
        of:'von',none:'Kein Text',err:'Fehlgeschlagen',lang:'Übersetzen nach'}
  };

  var target = 'he';
  var ui = 'he';
  var t = function (k) { return (S[ui] && S[ui][k]) || S.he[k] || k; };

  var SKIP = { SCRIPT:1, STYLE:1, NOSCRIPT:1, CODE:1, PRE:1, TEXTAREA:1, KBD:1, SAMP:1, VAR:1 };
  var originals = new Map();
  var running = false, aborted = false, done = 0, total = 0, statusText = '';
  var observer = null;

  function hasLetters(s) { return /[A-Za-zÀ-ÿͰ-ϿЀ-ӿ֐-׿؀-ۿ぀-ヿ一-鿿]/.test(s); }

  function skippable(n) {
    var p = n.parentElement;
    if (!p) return true;
    if (p.closest && p.closest('#' + ID + '-panel')) return true;
    while (p) {
      if (SKIP[p.tagName]) return true;
      if (p.isContentEditable) return true;
      if (p.getAttribute && p.getAttribute('translate') === 'no') return true;
      p = p.parentElement;
    }
    return false;
  }

  function collect(root) {
    var out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      if (originals.has(n)) continue;
      var v = n.nodeValue;
      if (!v || !v.trim() || !hasLetters(v)) continue;
      if (skippable(n)) continue;
      out.push(n);
    }
    return out;
  }

  var MAX_ENC = 6000;

  function gtx(text) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
      encodeURIComponent(target) + '&dt=t&q=' + encodeURIComponent(text);
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d[0]) return null;
      return d[0].map(function (s) { return (s && s[0]) || ''; }).join('');
    }).catch(function () { return null; });
  }

  // אותה שיטה כמו בתוסף: מחברים שורות עם \n ומפצלים בחזרה
  function translateLines(lines) {
    var joined = lines.join('\n');
    if (!joined.trim()) return Promise.resolve(lines);
    if (encodeURIComponent(joined).length > MAX_ENC && lines.length > 1) {
      var mid = Math.ceil(lines.length / 2);
      return translateLines(lines.slice(0, mid)).then(function (a) {
        return translateLines(lines.slice(mid)).then(function (b) { return a.concat(b); });
      });
    }
    return gtx(joined).then(function (whole) {
      if (whole == null) return null;
      var out = whole.split('\n');
      return out.length === lines.length
        ? out.map(function (s, i) { return s.trim() || lines[i]; })
        : null;
    });
  }

  function batches(nodes) {
    var b = [], cur = [], ch = 0;
    for (var i = 0; i < nodes.length; i++) {
      var len = nodes[i].nodeValue.trim().length;
      if (cur.length && (ch + len > 700 || cur.length >= 40)) { b.push(cur); cur = []; ch = 0; }
      cur.push(nodes[i]); ch += len;
    }
    if (cur.length) b.push(cur);
    return b;
  }

  function runNodes(nodes) {
    var groups = batches(nodes), i = 0;
    function step() {
      if (aborted || i >= groups.length) return Promise.resolve();
      var g = groups[i++];
      var lines = g.map(function (n) { return n.nodeValue.trim().replace(/\s+/g, ' '); });
      return translateLines(lines).then(function (out) {
        if (aborted) return;
        if (out && out.length === g.length) {
          g.forEach(function (n, k) {
            if (!out[k]) return;
            if (!originals.has(n)) originals.set(n, n.nodeValue);
            var lead = n.nodeValue.match(/^\s*/)[0], trail = n.nodeValue.match(/\s*$/)[0];
            n.nodeValue = lead + out[k] + trail;
          });
        }
        done += g.length;
        paint();
        return step();
      });
    }
    return step();
  }

  function run(fresh) {
    var nodes = fresh || collect(document.body);
    if (!nodes.length) { if (!fresh) { statusText = t('none'); paint(); } return Promise.resolve(); }
    total += nodes.length;
    running = true; aborted = false; paint();
    return runNodes(nodes).then(function () {
      running = false;
      if (!aborted) {
        statusText = t('done');
        if (RTL.indexOf(target) >= 0) document.documentElement.setAttribute('dir', 'rtl');
        watch();
      }
      paint();
    });
  }

  function watch() {
    if (observer) return;
    var pending = [], timer = null;
    observer = new MutationObserver(function (muts) {
      if (aborted) return;
      muts.forEach(function (m) {
        for (var i = 0; i < m.addedNodes.length; i++) pending.push(m.addedNodes[i]);
      });
      if (!pending.length || timer) return;
      timer = setTimeout(function () {
        var roots = pending; pending = []; timer = null;
        var fresh = [];
        roots.forEach(function (r) {
          if (!r.isConnected) return;
          if (r.nodeType === 3) {
            if (!originals.has(r) && r.nodeValue && r.nodeValue.trim() && hasLetters(r.nodeValue) && !skippable(r)) fresh.push(r);
          } else if (r.nodeType === 1) {
            fresh = fresh.concat(collect(r));
          }
        });
        if (fresh.length) run(fresh);
      }, 700);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stop() {
    aborted = true; running = false;
    if (observer) { observer.disconnect(); observer = null; }
    statusText = t('done');
    paint();
  }

  function restore() {
    aborted = true; running = false;
    if (observer) { observer.disconnect(); observer = null; }
    originals.forEach(function (v, n) { try { n.nodeValue = v; } catch (e) {} });
    originals.clear();
    document.documentElement.removeAttribute('dir');
    done = 0; total = 0; statusText = '';
    paint();
  }

  // ---------- לוח הבקרה ----------
  var host, sh;
  function build() {
    host = document.createElement('div');
    host.id = ID + '-panel';
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;bottom:18px;inset-inline-end:18px;';
    sh = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var opts = LANGS.map(function (l) { return '<option value="' + l[0] + '">' + l[1] + '</option>'; }).join('');
    sh.innerHTML =
      '<style>' +
      '.p{font:13px/1.45 system-ui,"Segoe UI",Arial,sans-serif;background:#141d28;color:#e8eef5;' +
      'border:1px solid #2a3b4f;border-radius:12px;padding:12px 14px;min-width:210px;' +
      'box-shadow:0 10px 34px rgba(0,0,0,.45);display:flex;flex-direction:column;gap:8px}' +
      '.r{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
      '.ttl{font-weight:700;color:#4fd1c5;font-size:12px}' +
      '.x{background:none;border:0;color:#8ba0b5;font-size:15px;cursor:pointer;line-height:1}' +
      '.lb{font-size:11px;color:#8ba0b5}' +
      'select{font:inherit;font-size:12px;background:#172230;color:#e8eef5;border:1px solid #2a3b4f;' +
      'border-radius:6px;padding:5px;width:100%}' +
      '.s{color:#c3d1de;font-size:12px}' +
      '.bar{height:4px;background:#22303f;border-radius:3px;overflow:hidden}' +
      '.fill{height:100%;background:#4fd1c5;width:0%;transition:width .25s}' +
      'button.act{font:inherit;font-weight:700;font-size:12px;border:0;border-radius:7px;padding:7px 10px;cursor:pointer;width:100%}' +
      '.go{background:#4fd1c5;color:#0d1620}.stop{background:#d9856b;color:#0d1620}.res{background:#2a3b4f;color:#e8eef5}' +
      '</style>' +
      '<div class="p"><div class="r"><span class="ttl">Floating rotation</span><button class="x">✕</button></div>' +
      '<div class="lb"></div><select>' + opts + '</select>' +
      '<div class="s"></div><div class="bar"><div class="fill"></div></div>' +
      '<button class="act"></button></div>';
    // מחוץ ל-body, כדי שהלוח לא ייכנס לחישובי ה-DOM של האתר עצמו
    document.documentElement.appendChild(host);
    sh.querySelector('.x').onclick = function () { host.style.display = 'none'; };
    sh.querySelector('select').onchange = function (e) {
      target = e.target.value; ui = S[target] ? target : 'en';
      if (originals.size) restore();
      paint();
    };
    sh.querySelector('.act').onclick = function () {
      if (running) stop();
      else if (originals.size) restore();
      else run();
    };
    sh.querySelector('select').value = target;
  }

  function paint() {
    if (!sh) return;
    sh.querySelector('.p').setAttribute('dir', RTL.indexOf(ui) >= 0 ? 'rtl' : 'ltr');
    sh.querySelector('.lb').textContent = t('lang');
    var s = sh.querySelector('.s'), btn = sh.querySelector('.act');
    if (running) {
      s.textContent = t('t') + '  ' + done + ' ' + t('of') + ' ' + total;
      btn.textContent = t('stop'); btn.className = 'act stop';
    } else if (originals.size) {
      s.textContent = statusText || t('done');
      btn.textContent = t('restore'); btn.className = 'act res';
    } else {
      s.textContent = statusText || '';
      btn.textContent = t('go'); btn.className = 'act go';
    }
    sh.querySelector('.fill').style.width = total ? Math.min(100, Math.round(done / total * 100)) + '%' : '0%';
  }

  build();
  paint();
  window[ID] = { show: function () { host.style.display = ''; } };
})();
