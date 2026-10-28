// ============================================================
//  Floating rotation — הקטגוריות של האתר
//  תפריט בפס לכל אורך הצד הימני (בכל השפות), עם כפתור ☰ קטן שמסתיר אותו,
//  ודף לכל קטגוריה. כשלא נכנסים לקטגוריה — דף הבית
//  (שם יופיעו בעתיד דברים בתשלום; עד שנוסיף אותם הוא ריק).
//
//  להוספת קטגוריה חדשה:
//    1. שורה חדשה ב-CATS (מזהה, אייקון, צבע, ה-id של הרשת)
//    2. <section class="cat-sec" id="cat-<מזהה>" hidden> ב-index.html, עם רשת בפנים
//    3. שם ותיאור בכל 9 השפות ב-HT
//  הכתובת זוכרת את הקטגוריה (#games), אז כפתור "אחורה" של הדפדפן עובד.
//  נטען אחרון — כדי שכל הכרטיסים כבר יהיו בדף כשסופרים אותם.
// ============================================================
(function () {
  const CATS = [
    // subs: לשוניות בתוך הקטגוריה. משחק בלי dim הוא '2d' (platform.js)
    { id: 'games', icon: '🎮', color: '#4fd1c5', grid: 'grid', subs: ['2d', '3d'] },
    { id: 'apps',  icon: '🧰', color: '#ffd166', grid: 'dlGrid' },
  ];

  const HT = {
    he: { side: 'קטגוריות', home: 'דף הבית', toggle: 'הצגה או הסתרה של הקטגוריות', close: 'סגירה', more: 'עוד משחקים', full: 'מסך מלא', sub_2d: 'משחקי 2D', sub_3d: 'משחקי 3D',
          games: 'משחקים חינמיים', games_d: 'משחקים קטנים שבנינו, שחר ורובין. משחקים ישר בדפדפן, בלי הורדה.',
          apps: 'התקנות חינמיות', apps_d: 'דברים שימושיים שבנינו: מסמכים ומצגות, ותרגום של כל אתר.' },
    en: { side: 'Categories', home: 'Home', toggle: 'Show or hide categories', close: 'Close', more: 'More games', full: 'Full screen', sub_2d: '2D games', sub_3d: '3D games',
          games: 'Free games', games_d: 'Small games built by Shachar and Robin. Play right in your browser, nothing to download.',
          apps: 'Free installs', apps_d: 'Useful things we built: documents and presentations, and translation for any website.' },
    ar: { side: 'الفئات', home: 'الرئيسية', toggle: 'إظهار الفئات أو إخفاؤها', close: 'إغلاق', more: 'ألعاب أخرى', full: 'ملء الشاشة', sub_2d: 'ألعاب 2D', sub_3d: 'ألعاب 3D',
          games: 'ألعاب مجانية', games_d: 'ألعاب صغيرة بناها شاحار وروبين. العب مباشرة في المتصفح، بلا تحميل.',
          apps: 'تثبيتات مجانية', apps_d: 'أشياء مفيدة بنيناها: مستندات وعروض تقديمية، وترجمة لأي موقع.' },
    es: { side: 'Categorías', home: 'Inicio', toggle: 'Mostrar u ocultar categorías', close: 'Cerrar', more: 'Más juegos', full: 'Pantalla completa', sub_2d: 'Juegos 2D', sub_3d: 'Juegos 3D',
          games: 'Juegos gratis', games_d: 'Juegos pequeños creados por Shachar y Robin. Se juegan en el navegador, sin descargar nada.',
          apps: 'Instalaciones gratis', apps_d: 'Cosas útiles que creamos: documentos y presentaciones, y traducción de cualquier sitio web.' },
    fr: { side: 'Catégories', home: 'Accueil', toggle: 'Afficher ou masquer les catégories', close: 'Fermer', more: 'Plus de jeux', full: 'Plein écran', sub_2d: 'Jeux 2D', sub_3d: 'Jeux 3D',
          games: 'Jeux gratuits', games_d: 'Des petits jeux créés par Shachar et Robin. On y joue dans le navigateur, sans rien télécharger.',
          apps: 'Installations gratuites', apps_d: "Des outils utiles qu'on a créés : documents et présentations, et la traduction de n'importe quel site." },
    pt: { side: 'Categorias', home: 'Início', toggle: 'Mostrar ou ocultar categorias', close: 'Fechar', more: 'Mais jogos', full: 'Tela cheia', sub_2d: 'Jogos 2D', sub_3d: 'Jogos 3D',
          games: 'Jogos grátis', games_d: 'Joguinhos criados por Shachar e Robin. Jogue direto no navegador, sem baixar nada.',
          apps: 'Instalações grátis', apps_d: 'Coisas úteis que criamos: documentos e apresentações, e tradução de qualquer site.' },
    ru: { side: 'Категории', home: 'Главная', toggle: 'Показать или скрыть категории', close: 'Закрыть', more: 'Ещё игры', full: 'Во весь экран', sub_2d: '2D-игры', sub_3d: '3D-игры',
          games: 'Бесплатные игры', games_d: 'Небольшие игры, которые сделали Шахар и Робин. Играй прямо в браузере, ничего не скачивая.',
          apps: 'Бесплатные установки', apps_d: 'Полезные вещи, которые мы сделали: документы и презентации, а ещё перевод любого сайта.' },
    de: { side: 'Kategorien', home: 'Startseite', toggle: 'Kategorien ein- oder ausblenden', close: 'Schließen', more: 'Mehr Spiele', full: 'Vollbild', sub_2d: '2D-Spiele', sub_3d: '3D-Spiele',
          games: 'Kostenlose Spiele', games_d: 'Kleine Spiele von Shachar und Robin. Direkt im Browser spielen, ohne Download.',
          apps: 'Kostenlose Installationen', apps_d: 'Nützliche Dinge, die wir gebaut haben: Dokumente und Präsentationen und Übersetzung für jede Website.' },
  };

  const $ = id => document.getElementById(id);
  const side = $('side'), nav = $('sideNav'), toggle = $('sideToggle'), shade = $('sideShade');
  const title = $('sideTitle'), closeBtn = $('sideClose'), home = $('view-home'), logo = $('homeLink');
  if (!side || !nav || !toggle || !home) return;

  const MOBILE = window.matchMedia('(max-width: 760px)');
  const SIDE_KEY = 'flrot:side';
  let lang = 'he';
  const tx = k => (HT[lang] && HT[lang][k]) || HT.he[k] || k;
  const count = c => { const g = $(c.grid); return g ? g.children.length : 0; };
  const sec = c => $('cat-' + c.id);
  const subOf = (c, card) => card.dataset.dim || c.subs[0];
  const subCount = (c, sub) => { const g = $(c.grid); return g ? [...g.children].filter(k => subOf(c, k) === sub).length : 0; };

  // ---------- בניית התפריט (פעם אחת): דף הבית, קו, ואז הקטגוריות ----------
  function item(c) {
    const b = document.createElement('button');
    b.className = 'side-item'; b.dataset.go = c.id;
    if (c.color) b.style.setProperty('--c', c.color);
    b.innerHTML = '<span class="si-icon">' + c.icon + '</span><span class="si-name"></span>' +
      (c.grid ? '<span class="si-count">' + count(c) + '</span>' : '');
    b.onclick = () => go(c.id);
    nav.appendChild(b);
  }
  item({ id: '', icon: '🏠' });
  const sep = document.createElement('div');
  sep.className = 'side-sep';
  nav.appendChild(sep);
  CATS.forEach(item);

  CATS.forEach(c => {
    const s = sec(c);
    if (!s) return;
    s.style.setProperty('--c', c.color);
    s.querySelector('.cat-head').innerHTML =
      '<span class="ch-icon">' + c.icon + '</span>' +
      '<div class="ch-text"><h2></h2><p></p></div>' +
      '<span class="ch-count">' + count(c) + '</span>';

    // לשוניות (למשל משחקי 2D / משחקי 3D) — כל לשונית מציגה רק את הכרטיסים שלה
    if (c.subs) {
      const bar = document.createElement('div');
      bar.className = 'cat-subs';
      bar.setAttribute('role', 'tablist');
      c.subs.forEach(sub => {
        const b = document.createElement('button');
        b.className = 'sub-tab'; b.dataset.sub = sub;
        b.setAttribute('role', 'tab');
        b.innerHTML = '<span class="st-name"></span><span class="st-count">' + subCount(c, sub) + '</span>';
        b.onclick = () => setSub(c, sub);
        bar.appendChild(b);
      });
      s.querySelector('.cat-head').after(bar);
      setSub(c, c.subs[0]);
    }
  });

  function setSub(c, sub) {
    const s = sec(c), g = $(c.grid);
    if (!s || !g) return;
    [...g.children].forEach(k => { k.hidden = subOf(c, k) !== sub; });
    s.querySelectorAll('.sub-tab').forEach(b => {
      const on = b.dataset.sub === sub;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  // ---------- הסתרה והצגה של התפריט ----------
  function savedOpen() {
    try { return localStorage.getItem(SIDE_KEY) !== '0'; } catch (e) { return true; }
  }
  function setSide(open, remember) {
    document.body.classList.toggle('side-hidden', !open);
    toggle.setAttribute('aria-expanded', String(open));
    if (remember && !MOBILE.matches) { try { localStorage.setItem(SIDE_KEY, open ? '1' : '0'); } catch (e) {} }
  }
  toggle.onclick = () => setSide(document.body.classList.contains('side-hidden'), true);
  if (closeBtn) closeBtn.onclick = () => setSide(false, false);
  if (shade) shade.onclick = () => setSide(false, false);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && MOBILE.matches && !document.body.classList.contains('side-hidden')) setSide(false, false);
  });
  // בטלפון התפריט תמיד מתחיל סגור; במחשב — כמו שהשארת אותו
  MOBILE.addEventListener('change', () => setSide(!MOBILE.matches && savedOpen(), false));
  setSide(!MOBILE.matches && savedOpen(), false);

  // ---------- איזה דף מוצג: דף הבית, קטגוריה, או משחק (#play/<id>) ----------
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('play/')) {
      const g = GAMES.find(x => x.id === h.slice(5) && !x.url);
      if (g) return { cat: 'games', play: g.id };
    }
    return { cat: CATS.some(c => c.id === h) ? h : '', play: null };
  }
  function render() {
    const r = route();
    if (openId && openId !== r.play) stopGame();
    home.hidden = !!r.play || r.cat !== '';
    CATS.forEach(c => { const s = sec(c); if (s) s.hidden = !!r.play || c.id !== r.cat; });
    gameView.hidden = !r.play;
    nav.querySelectorAll('.side-item').forEach(b => b.classList.toggle('on', b.dataset.go === r.cat));
    if (r.play && openId !== r.play) startGame(r.play);
  }
  function go(id) {
    if (id !== location.hash.slice(1)) history.pushState(null, '', id ? '#' + id : location.pathname + location.search);
    render();
    window.scrollTo(0, 0);
    if (MOBILE.matches) setSide(false, false);
  }
  window.addEventListener('popstate', render);
  window.addEventListener('hashchange', render);
  if (logo) logo.addEventListener('click', e => { e.preventDefault(); go(''); });

  // ---------- מסך המשחק ----------
  const gameView = $('gameHost'), mount = $('gameMount'), player = $('player');
  const fullBtn = $('fullBtn'), backBtn = $('backBtn'), grid = $('grid');
  const BASE_TITLE = document.title;
  let openId = null, fitObs = null, kidObs = null;
  const cardOf = id => grid.querySelector('[data-gid="' + id + '"]');

  // נקרא מכרטיס משחק (platform.js) ומ"עוד משחקים"
  window.flrotPlay = function (id) {
    const g = GAMES.find(x => x.id === id);
    if (!g) return;
    if (g.url) { openExternal(g); return; }
    const h = '#play/' + id;
    if (route().play) history.replaceState(history.state, '', h);   // ממשחק למשחק: בלי עוד צעד ב"אחורה"
    else history.pushState({ fromSite: true }, '', h);
    render();
    window.scrollTo(0, 0);
    if (MOBILE.matches) setSide(false, false);
  };
  function leaveGame() {
    if (history.state && history.state.fromSite) history.back();   // חוזרים בדיוק לאן שהיינו
    else { history.replaceState(null, '', '#games'); render(); }
  }
  function startGame(id) {
    openGame(GAMES.find(x => x.id === id));   // platform.js מרכיב את המשחק בתוך gameMount
    openId = id;
    fillBar();
    fillMore();
    watchFit();
  }
  function stopGame() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (fitObs) { fitObs.disconnect(); fitObs = null; }
    if (kidObs) { kidObs.disconnect(); kidObs = null; }
    closeGame();                               // platform.js מפרק את המשחק
    mount.style.backgroundColor = '';
    openId = null;
    document.title = BASE_TITLE;
  }
  function fillBar() {
    const card = cardOf(openId);
    const name = card ? card.querySelector('h3').textContent : '';
    $('gameTitle').textContent = name;
    $('gameType').textContent = card ? card.querySelector('.gbadge').textContent : '';
    const th = $('gameThumb');
    th.innerHTML = '';
    if (card) th.appendChild(card.querySelector('.gthumb').cloneNode(true));
    document.title = name ? name + ' · ' + BASE_TITLE : BASE_TITLE;
  }
  function fillMore() {
    const row = $('moreRow');
    row.innerHTML = '';
    [...grid.children].forEach(card => {
      const gid = card.dataset.gid;
      if (!gid || gid === openId) return;
      const b = document.createElement('button');
      b.className = 'more-card';
      b.appendChild(card.querySelector('.gthumb').cloneNode(true));
      const n = document.createElement('span');
      n.className = 'more-name';
      n.textContent = card.querySelector('h3').textContent;
      b.appendChild(n);
      b.onclick = e => { e.currentTarget.blur(); window.flrotPlay(gid); };
      row.appendChild(b);
    });
  }

  // משחק שגדול מהמסגרת מוקטן כדי שייכנס כולו, בלי פס גלילה. משחק ב-iframe מסתדר לבד.
  function fit() {
    const kid = mount.firstElementChild;
    if (!kid || kid.tagName === 'IFRAME') return;
    const cs = getComputedStyle(mount);
    const w = mount.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = mount.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    mount.style.setProperty('--frame-h', Math.round(h) + 'px');   // משחק שרוצה להתאים את עצמו לגובה (טטריס)
    // הצדדים של המסגרת בצבע של המשחק עצמו (שחמט, כוכבים), כדי שלא יראו פס כחול
    const bg = getComputedStyle(kid).backgroundColor;
    mount.style.backgroundColor = (bg === 'transparent' || /,\s*0\)$/.test(bg)) ? '' : bg;
    const k = Math.min(1, w / kid.offsetWidth, h / kid.offsetHeight);
    kid.style.scale = k < 0.995 ? k.toFixed(3) : '';
  }
  function watchFit() {
    fitObs = new ResizeObserver(fit);
    fitObs.observe(mount);
    if (mount.firstElementChild) fitObs.observe(mount.firstElementChild);
    kidObs = new MutationObserver(() => { if (mount.firstElementChild) fitObs.observe(mount.firstElementChild); fit(); });
    kidObs.observe(mount, { childList: true });
    fit();
  }

  if (fullBtn) fullBtn.onclick = e => {
    e.currentTarget.blur();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (player.requestFullscreen) player.requestFullscreen().catch(() => {});
  };
  if (backBtn) backBtn.onclick = e => { e.currentTarget.blur(); leaveGame(); };

  // בזמן משחק: חיצים ורווח שייכים למשחק — הם לא גוללים את הדף
  const GAME_KEYS = [' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'];
  document.addEventListener('keydown', e => {
    if (!openId || !GAME_KEYS.includes(e.key)) return;
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName) || t.isContentEditable)) return;
    e.preventDefault();
  }, true);

  // ---------- טקסטים (בכל החלפת שפה) ----------
  function apply(lg) {
    lang = HT[lg] ? lg : 'he';
    if (title) title.textContent = tx('side');
    nav.setAttribute('aria-label', tx('side'));
    nav.querySelectorAll('.side-item').forEach(b => {
      b.querySelector('.si-name').textContent = tx(b.dataset.go || 'home');
    });
    toggle.title = tx('toggle');
    toggle.setAttribute('aria-label', tx('toggle'));
    if (closeBtn) { closeBtn.title = tx('close'); closeBtn.setAttribute('aria-label', tx('close')); }
    CATS.forEach(c => {
      const s = sec(c);
      if (!s) return;
      s.querySelector('.cat-head h2').textContent = tx(c.id);
      s.querySelector('.cat-head p').textContent = tx(c.id + '_d');
      s.querySelectorAll('.sub-tab').forEach(b => { b.querySelector('.st-name').textContent = tx('sub_' + b.dataset.sub); });
    });
    $('moreTitle').textContent = tx('more');
    if (fullBtn) { fullBtn.title = tx('full'); fullBtn.setAttribute('aria-label', tx('full')); }
    if (backBtn) { backBtn.title = tx('close'); backBtn.setAttribute('aria-label', tx('close')); }
    if (openId) { fillBar(); fillMore(); }
  }

  document.addEventListener('flrot:lang', e => apply(e.detail));
  let saved = null;
  try { saved = localStorage.getItem('flrot:lang'); } catch (e) {}
  apply(saved || 'he');
  render();
})();
