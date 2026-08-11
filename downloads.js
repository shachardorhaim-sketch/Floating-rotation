// ============================================================
//  Floating rotation — אזור ההורדות
//  כרטיסי תוכנה להורדה + חלון הוראות התקנה (9 שפות)
// ============================================================
(function(){

  // ---------- הקטלוג ----------
  const DOWNLOADS = [
    {
      id: 'mangatrans',
      file: 'downloads/MangaTrans.zip',
      size: '10 MB',
      imgFile: 'mangatrans-logo.png',
      badge: 'ext',
      bg: 'linear-gradient(135deg,#4b1b3a,#0d1b2a)',
      install: ['i1','i2','i3','i4','i5'],
      usage:   ['u1','u2','u3','u4']
    }
  ];

  // ---------- תרגומים ----------
  const T = {
    he: {
      sec:'להורדה', ext:'תוסף לכרום', get:'⬇ הורדה', how:'איך מתקינים?', close:'סגור',
      installH:'התקנה', usageH:'שימוש', noteH:'שים לב',
      mangatrans_t:'MangaTrans — תרגום מנגה',
      mangatrans_d:'תוסף לכרום שקורא טקסט מבועות דיבור בעזרת OCR ומתרגם אותו לעברית.',
      i1:'לפרוס את קובץ ה-ZIP לתיקייה קבועה במחשב (למשל Documents\\MangaTrans). חשוב שהתיקייה לא תימחק — כרום טוען את התוסף ממנה בכל פעם.',
      i2:'לפתוח בכרום את הכתובת chrome://extensions',
      i3:'להדליק למעלה מימין את מצב מפתח / Developer mode.',
      i4:'ללחוץ על טען פריט לא ארוז / Load unpacked ולבחור את התיקייה שפרסת (זו שיש בה את manifest.json).',
      i5:'מומלץ לנעוץ את התוסף לסרגל הכלים — אייקון הפאזל ואז הסיכה.',
      u1:'לפתוח עמוד עם מנגה או קומיקס.',
      u2:'ללחוץ על אייקון התוסף ואז "סמן אזור לתרגום", או קיצור המקלדת Alt + M.',
      u3:'לגרור עם העכבר מלבן סביב בועת הדיבור.',
      u4:'אחרי כמה שניות מופיע כרטיס עם התרגום. Esc מבטל את הסימון.',
      note:'ה-OCR רץ מקומית במחשב, אבל הטקסט שסומן נשלח לשירות תרגום באינטרנט. זיהוי של טקסט כתוב ביד כמעט תמיד לא יעבוד.'
    },
    en: {
      sec:'Downloads', ext:'Chrome extension', get:'⬇ Download', how:'How to install?', close:'Close',
      installH:'Installation', usageH:'Usage', noteH:'Note',
      mangatrans_t:'MangaTrans — Manga Translator',
      mangatrans_d:'A Chrome extension that reads text from speech bubbles with OCR and translates it.',
      i1:'Unzip the file into a permanent folder (e.g. Documents\\MangaTrans). Do not delete it — Chrome loads the extension from there every time.',
      i2:'Open chrome://extensions in Chrome.',
      i3:'Turn on Developer mode (top right).',
      i4:'Click Load unpacked and pick the folder you extracted (the one containing manifest.json).',
      i5:'Pin the extension to the toolbar — puzzle icon, then the pin.',
      u1:'Open a page with manga or comics.',
      u2:'Click the extension icon and choose "select area", or press Alt + M.',
      u3:'Drag a rectangle around the speech bubble.',
      u4:'After a few seconds a card with the translation appears. Esc cancels the selection.',
      note:'OCR runs locally on your machine, but the selected text is sent to an online translation service. Hand-drawn text almost never works.'
    },
    ar: {
      sec:'للتحميل', ext:'إضافة كروم', get:'⬇ تحميل', how:'كيف أثبّتها؟', close:'إغلاق',
      installH:'التثبيت', usageH:'الاستخدام', noteH:'ملاحظة',
      mangatrans_t:'MangaTrans — مترجم المانغا',
      mangatrans_d:'إضافة كروم تقرأ النص من فقاعات الحوار عبر OCR وتترجمه.',
      i1:'فك ضغط الملف في مجلد دائم (مثل Documents\\MangaTrans). لا تحذفه — كروم يحمّل الإضافة منه في كل مرة.',
      i2:'افتح chrome://extensions في كروم.',
      i3:'فعّل وضع المطوّر / Developer mode من أعلى اليمين.',
      i4:'اضغط تحميل عنصر غير مضغوط / Load unpacked واختر المجلد الذي فككته (الذي يحتوي manifest.json).',
      i5:'يُفضّل تثبيت الإضافة في شريط الأدوات — أيقونة اللغز ثم الدبوس.',
      u1:'افتح صفحة فيها مانغا أو كوميكس.',
      u2:'اضغط أيقونة الإضافة ثم "حدّد منطقة"، أو اختصار Alt + M.',
      u3:'اسحب مستطيلاً حول فقاعة الحوار.',
      u4:'بعد ثوانٍ تظهر بطاقة الترجمة. Esc يلغي التحديد.',
      note:'الـ OCR يعمل محلياً على جهازك، لكن النص المحدّد يُرسل إلى خدمة ترجمة عبر الإنترنت. النص المكتوب بخط اليد لا ينجح غالباً.'
    },
    zh: {
      sec:'下载', ext:'Chrome 扩展', get:'⬇ 下载', how:'如何安装?', close:'关闭',
      installH:'安装', usageH:'使用方法', noteH:'注意',
      mangatrans_t:'MangaTrans — 漫画翻译',
      mangatrans_d:'一个 Chrome 扩展,用 OCR 读取对话气泡中的文字并翻译。',
      i1:'将 ZIP 解压到一个固定文件夹(例如 Documents\\MangaTrans)。请勿删除——Chrome 每次都从那里加载扩展。',
      i2:'在 Chrome 中打开 chrome://extensions',
      i3:'打开右上角的开发者模式 / Developer mode。',
      i4:'点击「加载已解压的扩展程序 / Load unpacked」,选择你解压的文件夹(包含 manifest.json 的那个)。',
      i5:'建议把扩展固定到工具栏——拼图图标,然后点图钉。',
      u1:'打开一个有漫画的页面。',
      u2:'点击扩展图标并选择「选择区域」,或按 Alt + M。',
      u3:'用鼠标拖出一个框住对话气泡的矩形。',
      u4:'几秒后会出现翻译卡片。按 Esc 取消选择。',
      note:'OCR 在你的电脑本地运行,但选中的文字会发送到在线翻译服务。手写文字几乎无法识别。'
    },
    es: {
      sec:'Descargas', ext:'Extensión de Chrome', get:'⬇ Descargar', how:'¿Cómo se instala?', close:'Cerrar',
      installH:'Instalación', usageH:'Uso', noteH:'Nota',
      mangatrans_t:'MangaTrans — Traductor de manga',
      mangatrans_d:'Una extensión de Chrome que lee el texto de los bocadillos con OCR y lo traduce.',
      i1:'Descomprime el archivo en una carpeta permanente (por ejemplo Documents\\MangaTrans). No la borres: Chrome carga la extensión desde ahí cada vez.',
      i2:'Abre chrome://extensions en Chrome.',
      i3:'Activa el Modo de desarrollador / Developer mode (arriba a la derecha).',
      i4:'Pulsa Cargar descomprimida / Load unpacked y elige la carpeta que extrajiste (la que tiene manifest.json).',
      i5:'Fija la extensión a la barra de herramientas: icono del puzle y luego la chincheta.',
      u1:'Abre una página con manga o cómics.',
      u2:'Pulsa el icono de la extensión y elige "seleccionar área", o usa Alt + M.',
      u3:'Arrastra un rectángulo alrededor del bocadillo.',
      u4:'Tras unos segundos aparece una tarjeta con la traducción. Esc cancela la selección.',
      note:'El OCR se ejecuta localmente, pero el texto seleccionado se envía a un servicio de traducción en línea. El texto escrito a mano casi nunca funciona.'
    },
    fr: {
      sec:'Téléchargements', ext:'Extension Chrome', get:'⬇ Télécharger', how:'Comment l\'installer ?', close:'Fermer',
      installH:'Installation', usageH:'Utilisation', noteH:'À noter',
      mangatrans_t:'MangaTrans — Traducteur de manga',
      mangatrans_d:'Une extension Chrome qui lit le texte des bulles par OCR et le traduit.',
      i1:'Décompresse le fichier dans un dossier permanent (par ex. Documents\\MangaTrans). Ne le supprime pas — Chrome y charge l\'extension à chaque fois.',
      i2:'Ouvre chrome://extensions dans Chrome.',
      i3:'Active le Mode développeur / Developer mode (en haut à droite).',
      i4:'Clique sur Charger l\'extension non empaquetée / Load unpacked et choisis le dossier extrait (celui qui contient manifest.json).',
      i5:'Épingle l\'extension à la barre d\'outils — icône puzzle, puis l\'épingle.',
      u1:'Ouvre une page avec du manga ou de la BD.',
      u2:'Clique sur l\'icône de l\'extension puis « sélectionner une zone », ou fais Alt + M.',
      u3:'Trace un rectangle autour de la bulle.',
      u4:'Après quelques secondes, une carte avec la traduction apparaît. Esc annule la sélection.',
      note:'L\'OCR tourne en local, mais le texte sélectionné est envoyé à un service de traduction en ligne. Le texte manuscrit ne fonctionne presque jamais.'
    },
    pt: {
      sec:'Downloads', ext:'Extensão do Chrome', get:'⬇ Baixar', how:'Como instalar?', close:'Fechar',
      installH:'Instalação', usageH:'Uso', noteH:'Atenção',
      mangatrans_t:'MangaTrans — Tradutor de mangá',
      mangatrans_d:'Uma extensão do Chrome que lê o texto dos balões com OCR e o traduz.',
      i1:'Extraia o arquivo para uma pasta permanente (por exemplo Documents\\MangaTrans). Não apague — o Chrome carrega a extensão de lá sempre.',
      i2:'Abra chrome://extensions no Chrome.',
      i3:'Ative o Modo de desenvolvedor / Developer mode (canto superior direito).',
      i4:'Clique em Carregar sem compactação / Load unpacked e escolha a pasta extraída (a que tem manifest.json).',
      i5:'Fixe a extensão na barra de ferramentas — ícone de quebra-cabeça e depois o alfinete.',
      u1:'Abra uma página com mangá ou quadrinhos.',
      u2:'Clique no ícone da extensão e escolha "selecionar área", ou use Alt + M.',
      u3:'Arraste um retângulo em volta do balão de fala.',
      u4:'Depois de alguns segundos aparece um cartão com a tradução. Esc cancela a seleção.',
      note:'O OCR roda localmente, mas o texto selecionado é enviado a um serviço de tradução online. Texto escrito à mão quase nunca funciona.'
    },
    ru: {
      sec:'Загрузки', ext:'Расширение Chrome', get:'⬇ Скачать', how:'Как установить?', close:'Закрыть',
      installH:'Установка', usageH:'Использование', noteH:'Важно',
      mangatrans_t:'MangaTrans — переводчик манги',
      mangatrans_d:'Расширение для Chrome: читает текст из облачков с помощью OCR и переводит его.',
      i1:'Распакуйте архив в постоянную папку (например Documents\\MangaTrans). Не удаляйте её — Chrome каждый раз загружает расширение оттуда.',
      i2:'Откройте chrome://extensions в Chrome.',
      i3:'Включите режим разработчика / Developer mode (справа вверху).',
      i4:'Нажмите «Загрузить распакованное расширение» / Load unpacked и выберите распакованную папку (ту, где лежит manifest.json).',
      i5:'Закрепите расширение на панели — значок пазла, затем булавка.',
      u1:'Откройте страницу с мангой или комиксом.',
      u2:'Нажмите значок расширения и выберите «выделить область», либо Alt + M.',
      u3:'Растяните мышью прямоугольник вокруг облачка с текстом.',
      u4:'Через несколько секунд появится карточка с переводом. Esc отменяет выделение.',
      note:'OCR работает локально на вашем компьютере, но выделенный текст отправляется в онлайн-сервис перевода. Рукописный текст почти никогда не распознаётся.'
    },
    de: {
      sec:'Downloads', ext:'Chrome-Erweiterung', get:'⬇ Herunterladen', how:'Wie installiere ich das?', close:'Schließen',
      installH:'Installation', usageH:'Verwendung', noteH:'Hinweis',
      mangatrans_t:'MangaTrans — Manga-Übersetzer',
      mangatrans_d:'Eine Chrome-Erweiterung, die Text aus Sprechblasen per OCR liest und übersetzt.',
      i1:'Entpacke die Datei in einen festen Ordner (z. B. Documents\\MangaTrans). Nicht löschen — Chrome lädt die Erweiterung jedes Mal von dort.',
      i2:'Öffne chrome://extensions in Chrome.',
      i3:'Schalte oben rechts den Entwicklermodus / Developer mode ein.',
      i4:'Klicke auf Entpackte Erweiterung laden / Load unpacked und wähle den entpackten Ordner (den mit manifest.json).',
      i5:'Hefte die Erweiterung an die Symbolleiste — Puzzle-Symbol, dann die Stecknadel.',
      u1:'Öffne eine Seite mit Manga oder Comics.',
      u2:'Klicke auf das Symbol der Erweiterung und wähle „Bereich markieren", oder drücke Alt + M.',
      u3:'Ziehe mit der Maus ein Rechteck um die Sprechblase.',
      u4:'Nach ein paar Sekunden erscheint eine Karte mit der Übersetzung. Esc bricht die Auswahl ab.',
      note:'Die OCR läuft lokal auf deinem Rechner, aber der markierte Text wird an einen Online-Übersetzungsdienst geschickt. Handgeschriebener Text funktioniert fast nie.'
    }
  };

  let lang = 'he';
  const t = k => (T[lang] && T[lang][k]) || T.he[k] || k;

  // ---------- בניית הכרטיסים ----------
  const grid = document.getElementById('dlGrid');
  if (!grid) return;

  DOWNLOADS.forEach(d => {
    const card = document.createElement('div');
    card.className = 'gcard dcard';
    card.dataset.did = d.id;
    card.innerHTML =
      '<div class="gthumb" style="background:'+d.bg+'">' +
        '<img src="'+d.imgFile+'" alt="" style="max-height:96px;max-width:90%">' +
        '<span class="gbadge dl-badge"></span>' +
      '</div>' +
      '<div class="gbody">' +
        '<h3></h3><p></p>' +
        '<div class="dl-actions">' +
          '<a class="gplay dl-get" href="'+d.file+'" download></a>' +
          '<button class="dl-how"></button>' +
        '</div>' +
      '</div>';
    card.querySelector('.dl-how').onclick = () => openGuide(d);
    grid.appendChild(card);
  });

  // ---------- חלון ההוראות ----------
  const ov = document.createElement('div');
  ov.id = 'dl-overlay';
  ov.innerHTML =
    '<div class="dl-card">' +
      '<div class="dl-head"><h2></h2><button class="dl-x">×</button></div>' +
      '<div class="dl-sec"><h3 class="dl-ih"></h3><ol class="dl-steps dl-install"></ol></div>' +
      '<div class="dl-sec"><h3 class="dl-uh"></h3><ol class="dl-steps dl-usage"></ol></div>' +
      '<div class="dl-note"><strong class="dl-nh"></strong><span class="dl-nt"></span></div>' +
      '<button class="dl-done"></button>' +
    '</div>';
  document.body.appendChild(ov);

  const closeGuide = () => ov.classList.remove('open');
  ov.querySelector('.dl-x').onclick = closeGuide;
  ov.querySelector('.dl-done').onclick = closeGuide;
  ov.onclick = e => { if (e.target === ov) closeGuide(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGuide(); });

  function openGuide(d) {
    ov.querySelector('.dl-head h2').textContent = t(d.id + '_t');
    ov.querySelector('.dl-ih').textContent = t('installH');
    ov.querySelector('.dl-uh').textContent = t('usageH');
    ov.querySelector('.dl-nh').textContent = t('noteH') + ' — ';
    ov.querySelector('.dl-nt').textContent = t('note');
    ov.querySelector('.dl-done').textContent = t('close');
    const fill = (sel, keys) => {
      const ol = ov.querySelector(sel); ol.innerHTML = '';
      keys.forEach(k => { const li = document.createElement('li'); li.textContent = t(k); ol.appendChild(li); });
    };
    fill('.dl-install', d.install);
    fill('.dl-usage', d.usage);
    ov.classList.add('open');
  }

  // ---------- החלפת שפה ----------
  function applyLang(lg) {
    lang = T[lg] ? lg : 'he';
    const st = document.getElementById('dlSectionTitle');
    if (st) st.textContent = t('sec');
    DOWNLOADS.forEach(d => {
      const card = grid.querySelector('[data-did="'+d.id+'"]');
      if (!card) return;
      card.querySelector('h3').textContent = t(d.id + '_t');
      card.querySelector('.gbody p').textContent = t(d.id + '_d');
      card.querySelector('.dl-badge').textContent = t(d.badge);
      card.querySelector('.dl-get').textContent = t('get') + ' (' + d.size + ')';
      card.querySelector('.dl-how').textContent = t('how');
    });
    if (ov.classList.contains('open')) openGuide(DOWNLOADS[0]);
  }

  document.addEventListener('flrot:lang', e => applyLang(e.detail));
  let saved = null;
  try { saved = localStorage.getItem('flrot:lang'); } catch (err) {}
  applyLang(saved || 'he');

})();
