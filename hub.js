// ============================================================
//  Floating rotation — הקטגוריות של האתר
//  ניווט למעלה, אריחי קטגוריות באזור הפתיחה, וכותרת לכל קטגוריה.
//
//  להוספת קטגוריה חדשה:
//    1. שורה חדשה ב-CATS (מזהה, אייקון, צבע, ה-id של הרשת, יחידת ספירה)
//    2. <section class="cat-sec" id="cat-<מזהה>"> ב-index.html, עם רשת בפנים
//    3. שם, תיאור וספירה בכל 9 השפות ב-HT
//  נטען אחרון — כדי שכל הכרטיסים כבר יהיו בדף כשסופרים אותם.
// ============================================================
(function () {
  const CATS = [
    { id: 'games', icon: '🎮', color: '#4fd1c5', grid: 'grid',   unit: 'games' },
    { id: 'apps',  icon: '🧰', color: '#ffd166', grid: 'dlGrid', unit: 'tools' },
  ];

  const HT = {
    he: { tag: 'הכל חינם · הכל נבנה כאן', title: 'כל מה שבנינו — במקום אחד',
          sub: 'משחקים, אפליקציות ועוד הרבה בדרך. בחר קטגוריה ותתחיל.', all: 'הכל',
          games: 'משחקים חינמיים', games_d: 'משחקים קטנים שבנינו, שחר ורובין. משחקים ישר בדפדפן, בלי הורדה.',
          apps: 'אפליקציות וכלים', apps_d: 'דברים שימושיים שבנינו: מסמכים ומצגות, ותרגום של כל אתר.',
          soon: 'עוד קטגוריות', soon_d: 'בקרוב',
          n_games: { one: 'משחק אחד', two: '2 משחקים', other: '{n} משחקים' },
          n_tools: { one: 'כלי אחד', two: '2 כלים', other: '{n} כלים' } },
    en: { tag: 'All free · All built here', title: 'Everything we built, in one place',
          sub: 'Games, apps and a lot more on the way. Pick a category to start.', all: 'All',
          games: 'Free games', games_d: 'Small games built by Shachar and Robin. Play right in your browser, nothing to download.',
          apps: 'Apps & tools', apps_d: 'Useful things we built: documents and presentations, and translation for any website.',
          soon: 'More categories', soon_d: 'Coming soon',
          n_games: { one: '1 game', other: '{n} games' },
          n_tools: { one: '1 tool', other: '{n} tools' } },
    ar: { tag: 'كل شيء مجاني · كل شيء صُنع هنا', title: 'كل ما بنيناه في مكان واحد',
          sub: 'ألعاب وتطبيقات والمزيد في الطريق. اختر فئة وابدأ.', all: 'الكل',
          games: 'ألعاب مجانية', games_d: 'ألعاب صغيرة بناها شاحار وروبين. العب مباشرة في المتصفح، بلا تحميل.',
          apps: 'تطبيقات وأدوات', apps_d: 'أشياء مفيدة بنيناها: مستندات وعروض تقديمية، وترجمة لأي موقع.',
          soon: 'فئات أخرى', soon_d: 'قريبًا',
          n_games: { one: 'لعبة واحدة', two: 'لعبتان', few: '{n} ألعاب', many: '{n} لعبة', other: '{n} لعبة' },
          n_tools: { one: 'أداة واحدة', two: 'أداتان', few: '{n} أدوات', many: '{n} أداة', other: '{n} أداة' } },
    zh: { tag: '全部免费 · 全部在这里打造', title: '我们做的一切，都在这里',
          sub: '游戏、应用，还有更多即将上线。选一个分类开始吧。', all: '全部',
          games: '免费游戏', games_d: 'Shachar 和 Robin 制作的小游戏。直接在浏览器里玩，无需下载。',
          apps: '应用和工具', apps_d: '我们做的实用工具：文档和演示文稿，以及任何网站的翻译。',
          soon: '更多分类', soon_d: '即将推出',
          n_games: { other: '{n} 款游戏' },
          n_tools: { other: '{n} 个工具' } },
    es: { tag: 'Todo gratis · Todo hecho aquí', title: 'Todo lo que creamos, en un solo lugar',
          sub: 'Juegos, apps y mucho más en camino. Elige una categoría para empezar.', all: 'Todo',
          games: 'Juegos gratis', games_d: 'Juegos pequeños creados por Shachar y Robin. Se juegan en el navegador, sin descargar nada.',
          apps: 'Apps y herramientas', apps_d: 'Cosas útiles que creamos: documentos y presentaciones, y traducción de cualquier sitio web.',
          soon: 'Más categorías', soon_d: 'Muy pronto',
          n_games: { one: '1 juego', other: '{n} juegos' },
          n_tools: { one: '1 herramienta', other: '{n} herramientas' } },
    fr: { tag: 'Tout est gratuit · Tout est fait ici', title: "Tout ce qu'on a créé, au même endroit",
          sub: 'Des jeux, des applis et bien plus en préparation. Choisis une catégorie pour commencer.', all: 'Tout',
          games: 'Jeux gratuits', games_d: 'Des petits jeux créés par Shachar et Robin. On y joue dans le navigateur, sans rien télécharger.',
          apps: 'Applis et outils', apps_d: "Des outils utiles qu'on a créés : documents et présentations, et la traduction de n'importe quel site.",
          soon: "D'autres catégories", soon_d: 'Bientôt',
          n_games: { one: '{n} jeu', other: '{n} jeux' },
          n_tools: { one: '{n} outil', other: '{n} outils' } },
    pt: { tag: 'Tudo grátis · Tudo feito aqui', title: 'Tudo o que criamos, em um só lugar',
          sub: 'Jogos, apps e muito mais a caminho. Escolha uma categoria para começar.', all: 'Tudo',
          games: 'Jogos grátis', games_d: 'Joguinhos criados por Shachar e Robin. Jogue direto no navegador, sem baixar nada.',
          apps: 'Apps e ferramentas', apps_d: 'Coisas úteis que criamos: documentos e apresentações, e tradução de qualquer site.',
          soon: 'Mais categorias', soon_d: 'Em breve',
          n_games: { one: '{n} jogo', other: '{n} jogos' },
          n_tools: { one: '{n} ferramenta', other: '{n} ferramentas' } },
    ru: { tag: 'Всё бесплатно · Всё сделано здесь', title: 'Всё, что мы создали, — в одном месте',
          sub: 'Игры, приложения и ещё много всего на подходе. Выбери категорию, чтобы начать.', all: 'Все',
          games: 'Бесплатные игры', games_d: 'Небольшие игры, которые сделали Шахар и Робин. Играй прямо в браузере, ничего не скачивая.',
          apps: 'Приложения и инструменты', apps_d: 'Полезные вещи, которые мы сделали: документы и презентации, а ещё перевод любого сайта.',
          soon: 'Новые категории', soon_d: 'Скоро',
          n_games: { one: '{n} игра', few: '{n} игры', many: '{n} игр', other: '{n} игры' },
          n_tools: { one: '{n} инструмент', few: '{n} инструмента', many: '{n} инструментов', other: '{n} инструмента' } },
    de: { tag: 'Alles kostenlos · Alles hier gebaut', title: 'Alles, was wir gebaut haben, an einem Ort',
          sub: 'Spiele, Apps und noch viel mehr in Arbeit. Wähle eine Kategorie, um loszulegen.', all: 'Alle',
          games: 'Kostenlose Spiele', games_d: 'Kleine Spiele von Shachar und Robin. Direkt im Browser spielen, ohne Download.',
          apps: 'Apps & Tools', apps_d: 'Nützliche Dinge, die wir gebaut haben: Dokumente und Präsentationen und Übersetzung für jede Website.',
          soon: 'Weitere Kategorien', soon_d: 'Bald',
          n_games: { one: '{n} Spiel', other: '{n} Spiele' },
          n_tools: { one: '{n} Tool', other: '{n} Tools' } },
  };

  let lang = 'he';
  const tx = k => (HT[lang] && HT[lang][k]) || HT.he[k] || k;
  const sec = c => document.getElementById('cat-' + c.id);
  const count = c => { const g = document.getElementById(c.grid); return g ? g.children.length : 0; };
  function plural(unit, n) {
    const forms = tx('n_' + unit);
    let form = 'other';
    try { form = new Intl.PluralRules(lang).select(n); } catch (e) {}
    return (forms[form] || forms.other).replace('{n}', n);
  }
  function go(id) {
    if (id === 'all') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const s = document.getElementById('cat-' + id);
    if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- בנייה (פעם אחת) ----------
  const nav = document.getElementById('catNav');
  const tiles = document.getElementById('catTiles');
  if (!nav || !tiles) return;

  [{ id: 'all', icon: '✦' }].concat(CATS).forEach(c => {
    const b = document.createElement('button');
    b.className = 'cat-pill'; b.dataset.go = c.id;
    if (c.color) b.style.setProperty('--c', c.color);
    b.innerHTML = '<span class="cp-icon">' + c.icon + '</span><span class="cp-name"></span>';
    b.onclick = () => go(c.id);
    nav.appendChild(b);
  });

  CATS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'cat-tile'; b.dataset.go = c.id;
    b.style.setProperty('--c', c.color);
    b.innerHTML = '<span class="ct-icon">' + c.icon + '</span>' +
      '<span class="ct-text"><span class="ct-name"></span><span class="ct-count"></span></span>' +
      '<span class="ct-arrow" aria-hidden="true">←</span>';
    b.onclick = () => go(c.id);
    tiles.appendChild(b);

    const s = sec(c);
    if (!s) return;
    s.style.setProperty('--c', c.color);
    s.querySelector('.cat-head').innerHTML =
      '<span class="ch-icon">' + c.icon + '</span>' +
      '<div class="ch-text"><h2></h2><p></p></div>' +
      '<span class="ch-count"></span>';
  });

  const soon = document.createElement('div');
  soon.className = 'cat-tile soon';
  soon.innerHTML = '<span class="ct-icon">＋</span>' +
    '<span class="ct-text"><span class="ct-name"></span><span class="ct-count"></span></span>';
  tiles.appendChild(soon);

  // ---------- טקסטים (בכל החלפת שפה) ----------
  function apply(lg) {
    lang = HT[lg] ? lg : 'he';
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('heroTag', tx('tag'));
    set('heroTitle', tx('title'));
    set('heroSub', tx('sub'));
    nav.querySelectorAll('.cat-pill').forEach(p => {
      p.querySelector('.cp-name').textContent = tx(p.dataset.go);
    });
    CATS.forEach(c => {
      const n = plural(c.unit, count(c));
      const t = tiles.querySelector('[data-go="' + c.id + '"]');
      t.querySelector('.ct-name').textContent = tx(c.id);
      t.querySelector('.ct-count').textContent = n;
      const s = sec(c);
      if (!s) return;
      s.querySelector('.cat-head h2').textContent = tx(c.id);
      s.querySelector('.cat-head p').textContent = tx(c.id + '_d');
      s.querySelector('.ch-count').textContent = n;
    });
    soon.querySelector('.ct-name').textContent = tx('soon');
    soon.querySelector('.ct-count').textContent = tx('soon_d');
  }

  // ---------- איזו קטגוריה מסומנת למעלה (לפי הגלילה) ----------
  let ticking = false;
  function syncActive() {
    ticking = false;
    let cur = 'all';
    CATS.forEach(c => {
      const s = sec(c);
      if (s && s.getBoundingClientRect().top < window.innerHeight * 0.4) cur = c.id;
    });
    nav.querySelectorAll('.cat-pill').forEach(p => p.classList.toggle('on', p.dataset.go === cur));
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(syncActive); }
  }, { passive: true });

  document.addEventListener('flrot:lang', e => apply(e.detail));
  let saved = null;
  try { saved = localStorage.getItem('flrot:lang'); } catch (e) {}
  apply(saved || 'he');
  syncActive();
})();
