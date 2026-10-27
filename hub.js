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
    he: { side: 'קטגוריות', home: 'דף הבית', toggle: 'הצגה או הסתרה של הקטגוריות', close: 'סגירה', sub_2d: 'משחקי 2D', sub_3d: 'משחקי 3D',
          games: 'משחקים חינמיים', games_d: 'משחקים קטנים שבנינו, שחר ורובין. משחקים ישר בדפדפן, בלי הורדה.',
          apps: 'התקנות חינמיות', apps_d: 'דברים שימושיים שבנינו: מסמכים ומצגות, ותרגום של כל אתר.' },
    en: { side: 'Categories', home: 'Home', toggle: 'Show or hide categories', close: 'Close', sub_2d: '2D games', sub_3d: '3D games',
          games: 'Free games', games_d: 'Small games built by Shachar and Robin. Play right in your browser, nothing to download.',
          apps: 'Free installs', apps_d: 'Useful things we built: documents and presentations, and translation for any website.' },
    ar: { side: 'الفئات', home: 'الرئيسية', toggle: 'إظهار الفئات أو إخفاؤها', close: 'إغلاق', sub_2d: 'ألعاب 2D', sub_3d: 'ألعاب 3D',
          games: 'ألعاب مجانية', games_d: 'ألعاب صغيرة بناها شاحار وروبين. العب مباشرة في المتصفح، بلا تحميل.',
          apps: 'تثبيتات مجانية', apps_d: 'أشياء مفيدة بنيناها: مستندات وعروض تقديمية، وترجمة لأي موقع.' },
    zh: { side: '分类', home: '首页', toggle: '显示或隐藏分类', close: '关闭', sub_2d: '2D 游戏', sub_3d: '3D 游戏',
          games: '免费游戏', games_d: 'Shachar 和 Robin 制作的小游戏。直接在浏览器里玩，无需下载。',
          apps: '免费安装', apps_d: '我们做的实用工具：文档和演示文稿，以及任何网站的翻译。' },
    es: { side: 'Categorías', home: 'Inicio', toggle: 'Mostrar u ocultar categorías', close: 'Cerrar', sub_2d: 'Juegos 2D', sub_3d: 'Juegos 3D',
          games: 'Juegos gratis', games_d: 'Juegos pequeños creados por Shachar y Robin. Se juegan en el navegador, sin descargar nada.',
          apps: 'Instalaciones gratis', apps_d: 'Cosas útiles que creamos: documentos y presentaciones, y traducción de cualquier sitio web.' },
    fr: { side: 'Catégories', home: 'Accueil', toggle: 'Afficher ou masquer les catégories', close: 'Fermer', sub_2d: 'Jeux 2D', sub_3d: 'Jeux 3D',
          games: 'Jeux gratuits', games_d: 'Des petits jeux créés par Shachar et Robin. On y joue dans le navigateur, sans rien télécharger.',
          apps: 'Installations gratuites', apps_d: "Des outils utiles qu'on a créés : documents et présentations, et la traduction de n'importe quel site." },
    pt: { side: 'Categorias', home: 'Início', toggle: 'Mostrar ou ocultar categorias', close: 'Fechar', sub_2d: 'Jogos 2D', sub_3d: 'Jogos 3D',
          games: 'Jogos grátis', games_d: 'Joguinhos criados por Shachar e Robin. Jogue direto no navegador, sem baixar nada.',
          apps: 'Instalações grátis', apps_d: 'Coisas úteis que criamos: documentos e apresentações, e tradução de qualquer site.' },
    ru: { side: 'Категории', home: 'Главная', toggle: 'Показать или скрыть категории', close: 'Закрыть', sub_2d: '2D-игры', sub_3d: '3D-игры',
          games: 'Бесплатные игры', games_d: 'Небольшие игры, которые сделали Шахар и Робин. Играй прямо в браузере, ничего не скачивая.',
          apps: 'Бесплатные установки', apps_d: 'Полезные вещи, которые мы сделали: документы и презентации, а ещё перевод любого сайта.' },
    de: { side: 'Kategorien', home: 'Startseite', toggle: 'Kategorien ein- oder ausblenden', close: 'Schließen', sub_2d: '2D-Spiele', sub_3d: '3D-Spiele',
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

  // ---------- איזה דף מוצג: דף הבית או קטגוריה ----------
  function current() {
    const id = decodeURIComponent(location.hash.slice(1));
    return CATS.some(c => c.id === id) ? id : '';
  }
  function render() {
    const id = current();
    home.hidden = id !== '';
    CATS.forEach(c => { const s = sec(c); if (s) s.hidden = c.id !== id; });
    nav.querySelectorAll('.side-item').forEach(b => b.classList.toggle('on', b.dataset.go === id));
  }
  function go(id) {
    if (id !== current()) history.pushState(null, '', id ? '#' + id : location.pathname + location.search);
    render();
    window.scrollTo(0, 0);
    if (MOBILE.matches) setSide(false, false);
  }
  window.addEventListener('popstate', render);
  window.addEventListener('hashchange', render);
  if (logo) logo.addEventListener('click', e => { e.preventDefault(); go(''); });

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
  }

  document.addEventListener('flrot:lang', e => apply(e.detail));
  let saved = null;
  try { saved = localStorage.getItem('flrot:lang'); } catch (e) {}
  apply(saved || 'he');
  render();
})();
