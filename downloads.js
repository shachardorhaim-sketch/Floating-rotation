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
      mangatrans_t:'MangaTrans — תרגום עמודים ומנגה',
      mangatrans_d:'מתרגם כל עמוד באינטרנט ל-9 שפות בלחיצה, עם כפתור עצירה והחזרה למקור. וגם: תרגום בועות מנגה מתוך תמונה.',
      i1:'לפרוס את קובץ ה-ZIP לתיקייה קבועה במחשב (למשל Documents\\MangaTrans). חשוב שהתיקייה לא תימחק — כרום טוען את התוסף ממנה בכל פעם.',
      i2:'לפתוח בכרום את הכתובת chrome://extensions',
      i3:'להדליק למעלה מימין את מצב מפתח / Developer mode.',
      i4:'ללחוץ על טען פריט לא ארוז / Load unpacked ולבחור את התיקייה שפרסת (זו שיש בה את manifest.json).',
      i5:'מומלץ לנעוץ את התוסף לסרגל הכלים — אייקון הפאזל ואז הסיכה.',
      u1:'תרגום עמוד: ללחוץ על אייקון התוסף, לבחור שפה תחת "לתרגם ל־", וללחוץ "תרגם את העמוד" (או Alt + P).',
      u2:'בפינת העמוד מופיע לוח קטן עם ההתקדמות וכפתור ⏹ עצור שמפסיק באמצע.',
      u3:'בסיום הכפתור הופך ל־↩ החזר מקור, שמחזיר את העמוד בדיוק כפי שהיה. תוכן שנטען תוך כדי גלילה מתורגם גם הוא.',
      u4:'תרגום מנגה: "סמן אזור לתרגום" (או Alt + M), ואז לגרור מלבן סביב בועת הדיבור.',
      note:'זיהוי הטקסט מהתמונה (OCR) רץ מקומית במחשב, אבל הטקסט לתרגום — כולל הטקסט של כל עמוד שתתרגם — נשלח לשירות התרגום של גוגל. לא כדאי להשתמש בזה על עמודים עם מידע רגיש.'
    },
    en: {
      sec:'Downloads', ext:'Chrome extension', get:'⬇ Download', how:'How to install?', close:'Close',
      installH:'Installation', usageH:'Usage', noteH:'Note',
      mangatrans_t:'MangaTrans — Page & Manga Translator',
      mangatrans_d:'Translates any web page into 9 languages in one click, with a stop button and restore. Plus: manga bubble translation from images.',
      i1:'Unzip the file into a permanent folder (e.g. Documents\\MangaTrans). Do not delete it — Chrome loads the extension from there every time.',
      i2:'Open chrome://extensions in Chrome.',
      i3:'Turn on Developer mode (top right).',
      i4:'Click Load unpacked and pick the folder you extracted (the one containing manifest.json).',
      i5:'Pin the extension to the toolbar — puzzle icon, then the pin.',
      u1:'Translate a page: click the extension icon, pick a language under "Translate to", and press "Translate page" (or Alt + P).',
      u2:'A small panel appears in the corner with progress and a ⏹ Stop button that halts it mid-way.',
      u3:'When it finishes the button becomes ↩ Restore original, putting the page back exactly as it was. Content loaded while scrolling gets translated too.',
      u4:'Manga mode: "Select area to translate" (or Alt + M), then drag a rectangle around the speech bubble.',
      note:'OCR runs locally on your machine, but the text to translate — including the full text of every page you translate — is sent to Google\'s translation service. Avoid using it on pages with sensitive information.'
    },
    ar: {
      sec:'للتحميل', ext:'إضافة كروم', get:'⬇ تحميل', how:'كيف أثبّتها؟', close:'إغلاق',
      installH:'التثبيت', usageH:'الاستخدام', noteH:'ملاحظة',
      mangatrans_t:'MangaTrans — مترجم الصفحات والمانغا',
      mangatrans_d:'يترجم أي صفحة ويب إلى 9 لغات بنقرة واحدة، مع زر إيقاف واستعادة الأصل. وأيضاً: ترجمة فقاعات المانغا من الصور.',
      i1:'فك ضغط الملف في مجلد دائم (مثل Documents\\MangaTrans). لا تحذفه — كروم يحمّل الإضافة منه في كل مرة.',
      i2:'افتح chrome://extensions في كروم.',
      i3:'فعّل وضع المطوّر / Developer mode من أعلى اليمين.',
      i4:'اضغط تحميل عنصر غير مضغوط / Load unpacked واختر المجلد الذي فككته (الذي يحتوي manifest.json).',
      i5:'يُفضّل تثبيت الإضافة في شريط الأدوات — أيقونة اللغز ثم الدبوس.',
      u1:'ترجمة صفحة: اضغط أيقونة الإضافة، اختر لغة تحت "الترجمة إلى"، ثم اضغط "ترجم الصفحة" (أو Alt + P).',
      u2:'تظهر لوحة صغيرة في الزاوية بها التقدّم وزر ⏹ إيقاف يوقفها في المنتصف.',
      u3:'عند الانتهاء يتحوّل الزر إلى ↩ استعادة الأصل، فيعيد الصفحة كما كانت تماماً. المحتوى الذي يُحمّل أثناء التمرير يُترجم أيضاً.',
      u4:'وضع المانغا: "حدّد منطقة للترجمة" (أو Alt + M)، ثم اسحب مستطيلاً حول فقاعة الحوار.',
      note:'الـ OCR يعمل محلياً على جهازك، لكن النص المراد ترجمته — بما في ذلك نص كل صفحة تترجمها — يُرسل إلى خدمة الترجمة من جوجل. تجنّب استخدامها على صفحات تحتوي معلومات حسّاسة.'
    },
    zh: {
      sec:'下载', ext:'Chrome 扩展', get:'⬇ 下载', how:'如何安装?', close:'关闭',
      installH:'安装', usageH:'使用方法', noteH:'注意',
      mangatrans_t:'MangaTrans — 网页与漫画翻译',
      mangatrans_d:'一键将任意网页翻译成 9 种语言,带停止按钮和还原功能。另外还支持从图片翻译漫画对话气泡。',
      i1:'将 ZIP 解压到一个固定文件夹(例如 Documents\\MangaTrans)。请勿删除——Chrome 每次都从那里加载扩展。',
      i2:'在 Chrome 中打开 chrome://extensions',
      i3:'打开右上角的开发者模式 / Developer mode。',
      i4:'点击「加载已解压的扩展程序 / Load unpacked」,选择你解压的文件夹(包含 manifest.json 的那个)。',
      i5:'建议把扩展固定到工具栏——拼图图标,然后点图钉。',
      u1:'翻译网页:点击扩展图标,在「翻译成」下选择语言,然后点「翻译页面」(或按 Alt + P)。',
      u2:'页面角落会出现一个小面板,显示进度和一个 ⏹ 停止按钮,可以中途停止。',
      u3:'完成后按钮变为 ↩ 恢复原文,可将页面完全还原。滚动时新加载的内容也会被翻译。',
      u4:'漫画模式:点「选择要翻译的区域」(或 Alt + M),然后框住对话气泡。',
      note:'OCR 在你的电脑本地运行,但要翻译的文字——包括你翻译的每个页面的全部文字——都会发送到谷歌翻译服务。请勿在含敏感信息的页面上使用。'
    },
    es: {
      sec:'Descargas', ext:'Extensión de Chrome', get:'⬇ Descargar', how:'¿Cómo se instala?', close:'Cerrar',
      installH:'Instalación', usageH:'Uso', noteH:'Nota',
      mangatrans_t:'MangaTrans — Traductor de páginas y manga',
      mangatrans_d:'Traduce cualquier página web a 9 idiomas con un clic, con botón de parada y restauración. Además: traducción de bocadillos de manga desde imágenes.',
      i1:'Descomprime el archivo en una carpeta permanente (por ejemplo Documents\\MangaTrans). No la borres: Chrome carga la extensión desde ahí cada vez.',
      i2:'Abre chrome://extensions en Chrome.',
      i3:'Activa el Modo de desarrollador / Developer mode (arriba a la derecha).',
      i4:'Pulsa Cargar descomprimida / Load unpacked y elige la carpeta que extrajiste (la que tiene manifest.json).',
      i5:'Fija la extensión a la barra de herramientas: icono del puzle y luego la chincheta.',
      u1:'Traducir una página: pulsa el icono de la extensión, elige idioma en "Traducir a" y pulsa "Traducir página" (o Alt + P).',
      u2:'Aparece un panel en la esquina con el progreso y un botón ⏹ Detener que lo para a medias.',
      u3:'Al terminar el botón pasa a ↩ Restaurar original, dejando la página exactamente como estaba. El contenido que se carga al desplazarte también se traduce.',
      u4:'Modo manga: "Seleccionar área" (o Alt + M) y arrastra un rectángulo alrededor del bocadillo.',
      note:'El OCR se ejecuta localmente, pero el texto a traducir —incluido el texto completo de cada página que traduzcas— se envía al servicio de traducción de Google. Evita usarlo en páginas con información sensible.'
    },
    fr: {
      sec:'Téléchargements', ext:'Extension Chrome', get:'⬇ Télécharger', how:'Comment l\'installer ?', close:'Fermer',
      installH:'Installation', usageH:'Utilisation', noteH:'À noter',
      mangatrans_t:'MangaTrans — Traducteur de pages et manga',
      mangatrans_d:'Traduit n\'importe quelle page web en 9 langues en un clic, avec bouton d\'arrêt et restauration. Et aussi : traduction des bulles de manga depuis les images.',
      i1:'Décompresse le fichier dans un dossier permanent (par ex. Documents\\MangaTrans). Ne le supprime pas — Chrome y charge l\'extension à chaque fois.',
      i2:'Ouvre chrome://extensions dans Chrome.',
      i3:'Active le Mode développeur / Developer mode (en haut à droite).',
      i4:'Clique sur Charger l\'extension non empaquetée / Load unpacked et choisis le dossier extrait (celui qui contient manifest.json).',
      i5:'Épingle l\'extension à la barre d\'outils — icône puzzle, puis l\'épingle.',
      u1:'Traduire une page : clique sur l\'icône de l\'extension, choisis une langue sous « Traduire en », puis « Traduire la page » (ou Alt + P).',
      u2:'Un petit panneau apparaît dans le coin avec la progression et un bouton ⏹ Arrêter qui interrompt en cours.',
      u3:'À la fin, le bouton devient ↩ Restaurer l\'original et remet la page exactement comme avant. Le contenu chargé au défilement est traduit aussi.',
      u4:'Mode manga : « Sélectionner une zone » (ou Alt + M), puis trace un rectangle autour de la bulle.',
      note:'L\'OCR tourne en local, mais le texte à traduire — y compris tout le texte de chaque page que tu traduis — est envoyé au service de traduction de Google. Évite de l\'utiliser sur des pages contenant des informations sensibles.'
    },
    pt: {
      sec:'Downloads', ext:'Extensão do Chrome', get:'⬇ Baixar', how:'Como instalar?', close:'Fechar',
      installH:'Instalação', usageH:'Uso', noteH:'Atenção',
      mangatrans_t:'MangaTrans — Tradutor de páginas e mangá',
      mangatrans_d:'Traduz qualquer página da web para 9 idiomas com um clique, com botão de parar e restaurar. E ainda: tradução de balões de mangá a partir de imagens.',
      i1:'Extraia o arquivo para uma pasta permanente (por exemplo Documents\\MangaTrans). Não apague — o Chrome carrega a extensão de lá sempre.',
      i2:'Abra chrome://extensions no Chrome.',
      i3:'Ative o Modo de desenvolvedor / Developer mode (canto superior direito).',
      i4:'Clique em Carregar sem compactação / Load unpacked e escolha a pasta extraída (a que tem manifest.json).',
      i5:'Fixe a extensão na barra de ferramentas — ícone de quebra-cabeça e depois o alfinete.',
      u1:'Traduzir uma página: clique no ícone da extensão, escolha o idioma em "Traduzir para" e clique em "Traduzir página" (ou Alt + P).',
      u2:'Um painel aparece no canto com o progresso e um botão ⏹ Parar que interrompe no meio.',
      u3:'Ao terminar o botão vira ↩ Restaurar original, devolvendo a página exatamente como estava. Conteúdo carregado ao rolar também é traduzido.',
      u4:'Modo mangá: "Selecionar área" (ou Alt + M) e arraste um retângulo em volta do balão.',
      note:'O OCR roda localmente, mas o texto a traduzir — incluindo todo o texto de cada página que você traduzir — é enviado ao serviço de tradução do Google. Evite usar em páginas com informações sensíveis.'
    },
    ru: {
      sec:'Загрузки', ext:'Расширение Chrome', get:'⬇ Скачать', how:'Как установить?', close:'Закрыть',
      installH:'Установка', usageH:'Использование', noteH:'Важно',
      mangatrans_t:'MangaTrans — переводчик страниц и манги',
      mangatrans_d:'Переводит любую веб-страницу на 9 языков одним нажатием, с кнопкой остановки и возвратом оригинала. А также: перевод облачков манги с картинок.',
      i1:'Распакуйте архив в постоянную папку (например Documents\\MangaTrans). Не удаляйте её — Chrome каждый раз загружает расширение оттуда.',
      i2:'Откройте chrome://extensions в Chrome.',
      i3:'Включите режим разработчика / Developer mode (справа вверху).',
      i4:'Нажмите «Загрузить распакованное расширение» / Load unpacked и выберите распакованную папку (ту, где лежит manifest.json).',
      i5:'Закрепите расширение на панели — значок пазла, затем булавка.',
      u1:'Перевод страницы: нажмите значок расширения, выберите язык в «Перевести на» и нажмите «Перевести страницу» (или Alt + P).',
      u2:'В углу появится небольшая панель с прогрессом и кнопкой ⏹ Стоп, которая прерывает процесс.',
      u3:'По завершении кнопка станет ↩ Вернуть оригинал и вернёт страницу ровно в исходный вид. Контент, подгружаемый при прокрутке, тоже переводится.',
      u4:'Режим манги: «Выделить область» (или Alt + M), затем растяните прямоугольник вокруг облачка.',
      note:'OCR работает локально на вашем компьютере, но текст для перевода — включая весь текст каждой переводимой страницы — отправляется в сервис перевода Google. Не используйте на страницах с конфиденциальными данными.'
    },
    de: {
      sec:'Downloads', ext:'Chrome-Erweiterung', get:'⬇ Herunterladen', how:'Wie installiere ich das?', close:'Schließen',
      installH:'Installation', usageH:'Verwendung', noteH:'Hinweis',
      mangatrans_t:'MangaTrans — Seiten- und Manga-Übersetzer',
      mangatrans_d:'Übersetzt jede Webseite mit einem Klick in 9 Sprachen, mit Stopp-Knopf und Wiederherstellung. Außerdem: Übersetzung von Manga-Sprechblasen aus Bildern.',
      i1:'Entpacke die Datei in einen festen Ordner (z. B. Documents\\MangaTrans). Nicht löschen — Chrome lädt die Erweiterung jedes Mal von dort.',
      i2:'Öffne chrome://extensions in Chrome.',
      i3:'Schalte oben rechts den Entwicklermodus / Developer mode ein.',
      i4:'Klicke auf Entpackte Erweiterung laden / Load unpacked und wähle den entpackten Ordner (den mit manifest.json).',
      i5:'Hefte die Erweiterung an die Symbolleiste — Puzzle-Symbol, dann die Stecknadel.',
      u1:'Seite übersetzen: Klicke auf das Symbol der Erweiterung, wähle eine Sprache unter „Übersetzen nach" und klicke „Seite übersetzen" (oder Alt + P).',
      u2:'In der Ecke erscheint ein kleines Feld mit dem Fortschritt und einem ⏹ Stopp-Knopf, der mittendrin abbricht.',
      u3:'Am Ende wird der Knopf zu ↩ Original wiederherstellen und setzt die Seite exakt zurück. Beim Scrollen nachgeladene Inhalte werden ebenfalls übersetzt.',
      u4:'Manga-Modus: „Bereich auswählen" (oder Alt + M), dann ein Rechteck um die Sprechblase ziehen.',
      note:'Die OCR läuft lokal auf deinem Rechner, aber der zu übersetzende Text — einschließlich des gesamten Textes jeder Seite, die du übersetzt — wird an den Übersetzungsdienst von Google gesendet. Nutze es nicht auf Seiten mit sensiblen Informationen.'
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
