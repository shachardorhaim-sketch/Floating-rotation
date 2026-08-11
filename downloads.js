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
    },
    {
      id: 'bm',
      kind: 'bookmarklet',
      imgFile: 'mangatrans-logo.png',
      badge: 'noinst',
      bg: 'linear-gradient(135deg,#1b4b3a,#0d1b2a)',
      install: ['b1','b2','b3'],
      usage:   ['bu1','bu2','bu3'],
      noteKey: 'bmnote'
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
      note:'זיהוי הטקסט מהתמונה (OCR) רץ מקומית במחשב, אבל הטקסט לתרגום — כולל הטקסט של כל עמוד שתתרגם — נשלח לשירות התרגום של גוגל. לא כדאי להשתמש בזה על עמודים עם מידע רגיש.',
      noinst:'בלי התקנה',
      drag:'⇱ גרור לשורת הסימניות',
      bm_t:'מתרגם האתרים — בלי התקנה',
      bm_d:'אותו תרגום עמודים ל-9 שפות, בלי תוסף ובלי מצב מפתח. גוררים קישור אחד לשורת הסימניות וזהו.',
      b1:'להציג את שורת הסימניות בכרום: Ctrl + Shift + B (במק: Cmd + Shift + B).',
      b2:'לגרור את הכפתור "⇱ גרור לשורת הסימניות" אל שורת הסימניות. זה הכל — אין התקנה.',
      b3:'אם אי אפשר לגרור: קליק ימני על שורת הסימניות ← הוסף דף, ולהדביק את הכתובת של הקישור.',
      bu1:'להיכנס לכל אתר שרוצים ולחוץ על הסימנייה.',
      bu2:'בפינה נפתח לוח קטן: לבחור שפה ולחוץ "תרגם את העמוד".',
      bu3:'תוך כדי יש ⏹ עצור, ובסיום ↩ החזר מקור שמחזיר את העמוד כפי שהיה.',
      bmnote:'עובד ברוב האתרים. באתרים בודדים עם מדיניות אבטחה נוקשה (למשל GitHub) הדפדפן עלול לחסום סימניות שמריצות קוד — שם צריך את התוסף. גם כאן הטקסט לתרגום נשלח לשירות של גוגל.',
      howDemo:'▶ איך זה עובד?',
      d_replay:'▶ הצג שוב',
      d_bm:'תרגם',
      d_langname:'עברית',
      d_go:'תרגם',
      d_stop:'⏹ עצור',
      d_restore:'↩ החזר',
      whatIs:'<b>סימנייה</b> היא קיצור דרך בדפדפן — בדרך כלל לוחצים עליה והיא פותחת אתר. הסימנייה הזאת שונה: במקום לפתוח אתר, היא <b>מתרגמת את האתר שאתה נמצא בו ברגע זה</b>. גוררים אותה פעם אחת לשורת הסימניות, ומאותו רגע היא שם לתמיד — בכל אתר, בלחיצה אחת. אין מה להתקין ואין מה להפעיל.',
      d_step1:'פעם אחת בלבד: גוררים את הכפתור לשורת הסימניות',
      d_step2:'אחר כך נכנסים לכל אתר באינטרנט',
      d_step3:'לוחצים על הסימנייה שהוספת',
      d_step4:'בוחרים שפה — והעמוד מתורגם',
      s1_en:'Breaking news today',
      s2_en:'Read the full story',
      s3_en:'Sports and weather',
      s4_en:'Subscribe for updates',
      s1_tr:'חדשות מתפרצות היום',
      s2_tr:'לקריאת הכתבה המלאה',
      s3_tr:'ספורט ומזג אוויר',
      s4_tr:'הרשמה לעדכונים'
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
      note:'OCR runs locally on your machine, but the text to translate — including the full text of every page you translate — is sent to Google\'s translation service. Avoid using it on pages with sensitive information.',
      noinst:'No install',
      drag:'⇱ Drag to bookmarks bar',
      bm_t:'Web translator — no install',
      bm_d:'The same page translation into 9 languages, with no extension and no Developer mode. Drag one link to your bookmarks bar and you are done.',
      b1:'Show the bookmarks bar in Chrome: Ctrl + Shift + B (Mac: Cmd + Shift + B).',
      b2:'Drag the "⇱ Drag to bookmarks bar" button onto the bookmarks bar. That is it — nothing gets installed.',
      b3:'If dragging is not possible: right-click the bookmarks bar, choose Add page, and paste the link address.',
      bu1:'Go to any site and click the bookmark.',
      bu2:'A small panel opens in the corner: pick a language and press "Translate page".',
      bu3:'While it runs there is a ⏹ Stop, and when it finishes ↩ Restore original puts the page back.',
      bmnote:'Works on most sites. A few sites with a strict security policy (GitHub, for example) may block bookmarks that run code — use the extension there. The text to translate is still sent to Google\'s service.',
      howDemo:'▶ How does it work?',
      d_replay:'▶ Play again',
      d_bm:'Translate',
      d_langname:'English',
      d_go:'Translate',
      d_stop:'⏹ Stop',
      d_restore:'↩ Restore',
      whatIs:'A <b>bookmark</b> is a shortcut in your browser — normally you click it and it opens a website. This one is different: instead of opening a site, it <b>translates the site you are already on</b>. You drag it to your bookmarks bar once, and from then on it stays there — any site, one click. Nothing to install, nothing to switch on.',
      d_step1:'Just once: drag the button to your bookmarks bar',
      d_step2:'Then go to any website you like',
      d_step3:'Click the bookmark you added',
      d_step4:'Pick a language — and the page is translated',
      s1_en:'Últimas noticias de hoy',
      s2_en:'Leer la noticia completa',
      s3_en:'Deportes y clima',
      s4_en:'Suscríbete a las novedades',
      s1_tr:'Breaking news today',
      s2_tr:'Read the full story',
      s3_tr:'Sports and weather',
      s4_tr:'Subscribe for updates'
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
      note:'الـ OCR يعمل محلياً على جهازك، لكن النص المراد ترجمته — بما في ذلك نص كل صفحة تترجمها — يُرسل إلى خدمة الترجمة من جوجل. تجنّب استخدامها على صفحات تحتوي معلومات حسّاسة.',
      noinst:'بدون تثبيت',
      drag:'⇱ اسحب إلى شريط المفضلة',
      bm_t:'مترجم المواقع — بدون تثبيت',
      bm_d:'نفس ترجمة الصفحات إلى 9 لغات، بدون إضافة وبدون وضع المطوّر. اسحب رابطاً واحداً إلى شريط المفضلة وانتهى الأمر.',
      b1:'أظهر شريط المفضلة في كروم: Ctrl + Shift + B (على ماك: Cmd + Shift + B).',
      b2:'اسحب زر "⇱ اسحب إلى شريط المفضلة" إلى الشريط. هذا كل شيء — لا يوجد تثبيت.',
      b3:'إذا تعذّر السحب: انقر بزر الفأرة الأيمن على الشريط ← إضافة صفحة، والصق عنوان الرابط.',
      bu1:'ادخل إلى أي موقع واضغط على المفضلة.',
      bu2:'تُفتح لوحة صغيرة في الزاوية: اختر لغة واضغط "ترجم الصفحة".',
      bu3:'أثناء العمل يوجد ⏹ إيقاف، وعند الانتهاء ↩ استعادة الأصل يعيد الصفحة كما كانت.',
      bmnote:'يعمل في معظم المواقع. بعض المواقع ذات سياسة أمان صارمة (مثل GitHub) قد تمنع المفضلات التي تشغّل كوداً — استخدم الإضافة هناك. النص المراد ترجمته يُرسل أيضاً إلى خدمة جوجل.',
      howDemo:'▶ كيف يعمل؟',
      d_replay:'▶ إعادة العرض',
      d_bm:'ترجم',
      d_langname:'العربية',
      d_go:'ترجم',
      d_stop:'⏹ إيقاف',
      d_restore:'↩ استعادة',
      whatIs:'<b>المفضلة</b> هي اختصار في المتصفح — عادةً تضغط عليها فتفتح موقعاً. هذه مختلفة: بدل أن تفتح موقعاً، فهي <b>تترجم الموقع الذي أنت فيه الآن</b>. تسحبها مرة واحدة إلى شريط المفضلة، ومن ثم تبقى هناك — أي موقع، بضغطة واحدة. لا شيء لتثبيته ولا شيء لتشغيله.',
      d_step1:'مرة واحدة فقط: اسحب الزر إلى شريط المفضلة',
      d_step2:'بعدها ادخل إلى أي موقع تريد',
      d_step3:'اضغط على المفضلة التي أضفتها',
      d_step4:'اختر لغة — وتُترجم الصفحة',
      s1_en:'Breaking news today',
      s2_en:'Read the full story',
      s3_en:'Sports and weather',
      s4_en:'Subscribe for updates',
      s1_tr:'أخبار عاجلة اليوم',
      s2_tr:'اقرأ الخبر كاملاً',
      s3_tr:'الرياضة والطقس',
      s4_tr:'اشترك في التحديثات'
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
      note:'OCR 在你的电脑本地运行,但要翻译的文字——包括你翻译的每个页面的全部文字——都会发送到谷歌翻译服务。请勿在含敏感信息的页面上使用。',
      noinst:'免安装',
      drag:'⇱ 拖到书签栏',
      bm_t:'网页翻译 — 免安装',
      bm_d:'同样可将网页翻译成 9 种语言,无需扩展、无需开发者模式。把一个链接拖到书签栏即可。',
      b1:'在 Chrome 中显示书签栏:Ctrl + Shift + B(Mac:Cmd + Shift + B)。',
      b2:'把「⇱ 拖到书签栏」按钮拖到书签栏上。就这样——什么都不用安装。',
      b3:'如果无法拖动:右键点击书签栏 ←「添加网页」,然后粘贴该链接地址。',
      bu1:'打开任意网站,点击这个书签。',
      bu2:'角落会打开一个小面板:选择语言,点「翻译页面」。',
      bu3:'过程中有 ⏹ 停止,完成后 ↩ 恢复原文可将页面还原。',
      bmnote:'在大多数网站上都能用。少数安全策略严格的网站(例如 GitHub)可能会阻止运行代码的书签——那里请用扩展。要翻译的文字同样会发送到谷歌的服务。',
      howDemo:'▶ 它是怎么用的?',
      d_replay:'▶ 再看一次',
      d_bm:'翻译',
      d_langname:'中文',
      d_go:'翻译',
      d_stop:'⏹ 停止',
      d_restore:'↩ 恢复',
      whatIs:'<b>书签</b>是浏览器里的快捷方式——通常点一下就打开一个网站。这个不一样:它不打开网站,而是<b>翻译你当前正在看的网站</b>。把它拖到书签栏一次,它就一直在那里——任何网站,点一下即可。不用安装,也不用开启任何东西。',
      d_step1:'只需一次:把按钮拖到书签栏',
      d_step2:'然后打开你想看的任意网站',
      d_step3:'点击你刚添加的书签',
      d_step4:'选择语言——页面就翻译好了',
      s1_en:'Breaking news today',
      s2_en:'Read the full story',
      s3_en:'Sports and weather',
      s4_en:'Subscribe for updates',
      s1_tr:'今日突发新闻',
      s2_tr:'阅读完整报道',
      s3_tr:'体育与天气',
      s4_tr:'订阅最新消息'
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
      note:'El OCR se ejecuta localmente, pero el texto a traducir —incluido el texto completo de cada página que traduzcas— se envía al servicio de traducción de Google. Evita usarlo en páginas con información sensible.',
      noinst:'Sin instalar',
      drag:'⇱ Arrastra a marcadores',
      bm_t:'Traductor web — sin instalar',
      bm_d:'La misma traducción de páginas a 9 idiomas, sin extensión y sin Modo de desarrollador. Arrastra un enlace a la barra de marcadores y listo.',
      b1:'Muestra la barra de marcadores en Chrome: Ctrl + Shift + B (Mac: Cmd + Shift + B).',
      b2:'Arrastra el botón "⇱ Arrastra a marcadores" a la barra. Ya está: no se instala nada.',
      b3:'Si no puedes arrastrar: clic derecho en la barra ← Añadir página, y pega la dirección del enlace.',
      bu1:'Entra en cualquier sitio y pulsa el marcador.',
      bu2:'Se abre un panel en la esquina: elige idioma y pulsa "Traducir página".',
      bu3:'Durante el proceso hay ⏹ Detener, y al terminar ↩ Restaurar deja la página como estaba.',
      bmnote:'Funciona en la mayoría de sitios. Algunos con política de seguridad estricta (GitHub, por ejemplo) pueden bloquear marcadores que ejecutan código: ahí usa la extensión. El texto a traducir se envía igualmente al servicio de Google.',
      howDemo:'▶ ¿Cómo funciona?',
      d_replay:'▶ Ver de nuevo',
      d_bm:'Traducir',
      d_langname:'Español',
      d_go:'Traducir',
      d_stop:'⏹ Detener',
      d_restore:'↩ Restaurar',
      whatIs:'Un <b>marcador</b> es un acceso directo del navegador: normalmente lo pulsas y abre una web. Este es distinto: en vez de abrir una web, <b>traduce la web en la que ya estás</b>. Lo arrastras una vez a la barra de marcadores y se queda ahí para siempre: cualquier sitio, un clic. Nada que instalar, nada que activar.',
      d_step1:'Solo una vez: arrastra el botón a la barra de marcadores',
      d_step2:'Después entra en cualquier web',
      d_step3:'Pulsa el marcador que añadiste',
      d_step4:'Elige idioma y la página se traduce',
      s1_en:'Breaking news today',
      s2_en:'Read the full story',
      s3_en:'Sports and weather',
      s4_en:'Subscribe for updates',
      s1_tr:'Últimas noticias de hoy',
      s2_tr:'Leer la noticia completa',
      s3_tr:'Deportes y clima',
      s4_tr:'Suscríbete a las novedades'
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
      note:'L\'OCR tourne en local, mais le texte à traduire — y compris tout le texte de chaque page que tu traduis — est envoyé au service de traduction de Google. Évite de l\'utiliser sur des pages contenant des informations sensibles.',
      noinst:'Sans installation',
      drag:'⇱ Glisse vers les favoris',
      bm_t:'Traducteur web — sans installation',
      bm_d:'La même traduction de pages en 9 langues, sans extension et sans Mode développeur. Glisse un lien dans la barre de favoris, c\'est tout.',
      b1:'Affiche la barre de favoris dans Chrome : Ctrl + Maj + B (Mac : Cmd + Maj + B).',
      b2:'Glisse le bouton « ⇱ Glisse vers les favoris » sur la barre. C\'est fini — rien n\'est installé.',
      b3:'Si le glisser-déposer est impossible : clic droit sur la barre ← Ajouter une page, et colle l\'adresse du lien.',
      bu1:'Va sur n\'importe quel site et clique sur le favori.',
      bu2:'Un petit panneau s\'ouvre dans le coin : choisis une langue et clique « Traduire la page ».',
      bu3:'Pendant l\'opération il y a ⏹ Arrêter, et à la fin ↩ Restaurer remet la page comme avant.',
      bmnote:'Fonctionne sur la plupart des sites. Quelques sites à politique de sécurité stricte (GitHub par exemple) peuvent bloquer les favoris qui exécutent du code — utilise l\'extension là-bas. Le texte à traduire est aussi envoyé au service de Google.',
      howDemo:'▶ Comment ça marche ?',
      d_replay:'▶ Revoir',
      d_bm:'Traduire',
      d_langname:'Français',
      d_go:'Traduire',
      d_stop:'⏹ Arrêter',
      d_restore:'↩ Restaurer',
      whatIs:'Un <b>favori</b> est un raccourci du navigateur : normalement tu cliques dessus et il ouvre un site. Celui-ci est différent : au lieu d\'ouvrir un site, il <b>traduit le site où tu te trouves déjà</b>. Tu le glisses une fois dans la barre de favoris et il y reste — n\'importe quel site, un clic. Rien à installer, rien à activer.',
      d_step1:'Une seule fois : glisse le bouton dans la barre de favoris',
      d_step2:'Ensuite va sur le site de ton choix',
      d_step3:'Clique sur le favori que tu as ajouté',
      d_step4:'Choisis une langue — la page est traduite',
      s1_en:'Breaking news today',
      s2_en:'Read the full story',
      s3_en:'Sports and weather',
      s4_en:'Subscribe for updates',
      s1_tr:'Dernières nouvelles du jour',
      s2_tr:'Lire l\'article complet',
      s3_tr:'Sports et météo',
      s4_tr:'Abonne-toi aux mises à jour'
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
      note:'O OCR roda localmente, mas o texto a traduzir — incluindo todo o texto de cada página que você traduzir — é enviado ao serviço de tradução do Google. Evite usar em páginas com informações sensíveis.',
      noinst:'Sem instalar',
      drag:'⇱ Arraste para os favoritos',
      bm_t:'Tradutor web — sem instalar',
      bm_d:'A mesma tradução de páginas para 9 idiomas, sem extensão e sem Modo de desenvolvedor. Arraste um link para a barra de favoritos e pronto.',
      b1:'Mostre a barra de favoritos no Chrome: Ctrl + Shift + B (Mac: Cmd + Shift + B).',
      b2:'Arraste o botão "⇱ Arraste para os favoritos" até a barra. É só isso — nada é instalado.',
      b3:'Se não der para arrastar: clique com o botão direito na barra ← Adicionar página e cole o endereço do link.',
      bu1:'Entre em qualquer site e clique no favorito.',
      bu2:'Abre um painel no canto: escolha o idioma e clique em "Traduzir página".',
      bu3:'Durante o processo há ⏹ Parar e, ao terminar, ↩ Restaurar devolve a página como estava.',
      bmnote:'Funciona na maioria dos sites. Alguns com política de segurança rígida (GitHub, por exemplo) podem bloquear favoritos que executam código — ali use a extensão. O texto a traduzir também é enviado ao serviço do Google.',
      howDemo:'▶ Como funciona?',
      d_replay:'▶ Ver de novo',
      d_bm:'Traduzir',
      d_langname:'Português',
      d_go:'Traduzir',
      d_stop:'⏹ Parar',
      d_restore:'↩ Restaurar',
      whatIs:'Um <b>favorito</b> é um atalho do navegador: normalmente você clica e ele abre um site. Este é diferente: em vez de abrir um site, ele <b>traduz o site em que você já está</b>. Arraste uma vez para a barra de favoritos e ele fica lá para sempre — qualquer site, um clique. Nada para instalar, nada para ligar.',
      d_step1:'Só uma vez: arraste o botão para a barra de favoritos',
      d_step2:'Depois entre em qualquer site',
      d_step3:'Clique no favorito que você adicionou',
      d_step4:'Escolha o idioma — e a página é traduzida',
      s1_en:'Breaking news today',
      s2_en:'Read the full story',
      s3_en:'Sports and weather',
      s4_en:'Subscribe for updates',
      s1_tr:'Notícias de última hora',
      s2_tr:'Leia a matéria completa',
      s3_tr:'Esportes e clima',
      s4_tr:'Assine as novidades'
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
      note:'OCR работает локально на вашем компьютере, но текст для перевода — включая весь текст каждой переводимой страницы — отправляется в сервис перевода Google. Не используйте на страницах с конфиденциальными данными.',
      noinst:'Без установки',
      drag:'⇱ Перетащи на панель закладок',
      bm_t:'Переводчик сайтов — без установки',
      bm_d:'Тот же перевод страниц на 9 языков, без расширения и без режима разработчика. Перетащи одну ссылку на панель закладок — и всё.',
      b1:'Покажите панель закладок в Chrome: Ctrl + Shift + B (на Mac: Cmd + Shift + B).',
      b2:'Перетащите кнопку «⇱ Перетащи на панель закладок» на панель. Всё — ничего не устанавливается.',
      b3:'Если перетащить нельзя: правый клик по панели ← Добавить страницу и вставьте адрес ссылки.',
      bu1:'Зайдите на любой сайт и нажмите закладку.',
      bu2:'В углу откроется небольшая панель: выберите язык и нажмите «Перевести страницу».',
      bu3:'В процессе есть ⏹ Стоп, а по завершении ↩ Оригинал возвращает страницу в исходный вид.',
      bmnote:'Работает на большинстве сайтов. Некоторые сайты со строгой политикой безопасности (например GitHub) могут блокировать закладки с кодом — там используйте расширение. Текст для перевода так же отправляется в сервис Google.',
      howDemo:'▶ Как это работает?',
      d_replay:'▶ Показать снова',
      d_bm:'Перевести',
      d_langname:'Русский',
      d_go:'Перевести',
      d_stop:'⏹ Стоп',
      d_restore:'↩ Оригинал',
      whatIs:'<b>Закладка</b> — это ярлык в браузере: обычно вы нажимаете на неё, и она открывает сайт. Эта работает иначе: вместо того чтобы открыть сайт, она <b>переводит тот сайт, на котором вы уже находитесь</b>. Перетащите её один раз на панель закладок — и она останется там навсегда: любой сайт, одно нажатие. Ничего не нужно устанавливать и ничего включать.',
      d_step1:'Всего один раз: перетащите кнопку на панель закладок',
      d_step2:'Дальше заходите на любой сайт',
      d_step3:'Нажмите на добавленную закладку',
      d_step4:'Выберите язык — и страница переведена',
      s1_en:'Breaking news today',
      s2_en:'Read the full story',
      s3_en:'Sports and weather',
      s4_en:'Subscribe for updates',
      s1_tr:'Срочные новости сегодня',
      s2_tr:'Читать статью целиком',
      s3_tr:'Спорт и погода',
      s4_tr:'Подпишитесь на обновления'
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
      note:'Die OCR läuft lokal auf deinem Rechner, aber der zu übersetzende Text — einschließlich des gesamten Textes jeder Seite, die du übersetzt — wird an den Übersetzungsdienst von Google gesendet. Nutze es nicht auf Seiten mit sensiblen Informationen.',
      noinst:'Ohne Installation',
      drag:'⇱ In die Lesezeichenleiste ziehen',
      bm_t:'Web-Übersetzer — ohne Installation',
      bm_d:'Dieselbe Seitenübersetzung in 9 Sprachen, ohne Erweiterung und ohne Entwicklermodus. Einen Link in die Lesezeichenleiste ziehen, fertig.',
      b1:'Lesezeichenleiste in Chrome einblenden: Strg + Umschalt + B (Mac: Cmd + Umschalt + B).',
      b2:'Zieh den Knopf „⇱ In die Lesezeichenleiste ziehen" auf die Leiste. Das war\'s — es wird nichts installiert.',
      b3:'Wenn Ziehen nicht geht: Rechtsklick auf die Leiste ← Seite hinzufügen und die Adresse des Links einfügen.',
      bu1:'Geh auf eine beliebige Seite und klick das Lesezeichen an.',
      bu2:'In der Ecke öffnet sich ein kleines Feld: Sprache wählen und „Seite übersetzen" klicken.',
      bu3:'Währenddessen gibt es ⏹ Stopp, und am Ende setzt ↩ Original die Seite zurück.',
      bmnote:'Funktioniert auf den meisten Seiten. Einige Seiten mit strenger Sicherheitsrichtlinie (z. B. GitHub) können Lesezeichen blockieren, die Code ausführen — nutze dort die Erweiterung. Der zu übersetzende Text geht ebenfalls an den Dienst von Google.',
      howDemo:'▶ Wie funktioniert das?',
      d_replay:'▶ Nochmal ansehen',
      d_bm:'Übersetzen',
      d_langname:'Deutsch',
      d_go:'Übersetzen',
      d_stop:'⏹ Stopp',
      d_restore:'↩ Original',
      whatIs:'Ein <b>Lesezeichen</b> ist eine Verknüpfung im Browser — normalerweise klickst du darauf und es öffnet eine Website. Dieses hier ist anders: Statt eine Seite zu öffnen, <b>übersetzt es die Seite, auf der du gerade bist</b>. Einmal in die Lesezeichenleiste ziehen, und es bleibt dort — jede Seite, ein Klick. Nichts zu installieren, nichts einzuschalten.',
      d_step1:'Nur einmal: zieh den Knopf in die Lesezeichenleiste',
      d_step2:'Danach geh auf eine beliebige Website',
      d_step3:'Klick auf das hinzugefügte Lesezeichen',
      d_step4:'Sprache wählen — und die Seite ist übersetzt',
      s1_en:'Breaking news today',
      s2_en:'Read the full story',
      s3_en:'Sports and weather',
      s4_en:'Subscribe for updates',
      s1_tr:'Aktuelle Nachrichten heute',
      s2_tr:'Den ganzen Artikel lesen',
      s3_tr:'Sport und Wetter',
      s4_tr:'Updates abonnieren'
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
    // כרטיס bookmarklet מקבל קישור לגרירה במקום כפתור הורדה.
    // ה-href האמיתי מוזרק על ידי bookmarklet.js אחרי הטעינה.
    const action = d.kind === 'bookmarklet'
      ? '<a class="gplay dl-get bm-link" id="bmLink" href="#" draggable="true"' +
        ' title="' + (d.dragTip || '') + '"></a>'
      : '<a class="gplay dl-get" href="'+d.file+'" download></a>';
    card.innerHTML =
      '<div class="gthumb" style="background:'+d.bg+'">' +
        '<img src="'+d.imgFile+'" alt="" style="max-height:96px;max-width:90%">' +
        '<span class="gbadge dl-badge"></span>' +
      '</div>' +
      '<div class="gbody">' +
        '<h3></h3><p></p>' +
        '<div class="dl-actions">' + action +
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
      '<div class="dl-demo"></div>' +
      '<div class="dl-what"></div>' +
      '<div class="dl-sec"><h3 class="dl-ih"></h3><ol class="dl-steps dl-install"></ol></div>' +
      '<div class="dl-sec"><h3 class="dl-uh"></h3><ol class="dl-steps dl-usage"></ol></div>' +
      '<div class="dl-note"><strong class="dl-nh"></strong><span class="dl-nt"></span></div>' +
      '<button class="dl-done"></button>' +
    '</div>';
  document.body.appendChild(ov);

  // ---------- ההדגמה המונפשת ----------
  let demoToken = 0;   // עולה בכל פתיחה/סגירה, וכך הלולאה הישנה יודעת לעצור

  function stopDemo() { demoToken++; }

  function mountDemo(d) {
    const box = ov.querySelector('.dl-demo');
    const what = ov.querySelector('.dl-what');
    stopDemo();
    box.textContent = '';
    what.textContent = '';
    if (d.kind !== 'bookmarklet' || !window.FLROT_DEMO) {
      box.style.display = 'none';
      what.style.display = 'none';
      return;
    }
    box.style.display = '';
    what.style.display = '';
    what.innerHTML = t('whatIs');
    const ui = window.FLROT_DEMO.build(t, lang);
    box.appendChild(ui.wrap);
    const mine = demoToken;
    const alive = () => mine === demoToken && ov.classList.contains('open');
    ui.replay.onclick = () => { stopDemo(); mountDemo(d); };
    window.FLROT_DEMO.play(ui, t, lang, alive);
  }

  const closeGuide = () => {
    stopDemo();
    ov.querySelector('.dl-demo').textContent = '';   // לא משאירים הנפשה תלויה ב-DOM
    ov.classList.remove('open');
  };
  ov.querySelector('.dl-x').onclick = closeGuide;
  ov.querySelector('.dl-done').onclick = closeGuide;
  ov.onclick = e => { if (e.target === ov) closeGuide(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGuide(); });

  let openFor = null;   // הכרטיס שהחלון פתוח עבורו כרגע

  function openGuide(d) {
    openFor = d;
    ov.querySelector('.dl-head h2').textContent = t(d.id + '_t');
    ov.querySelector('.dl-ih').textContent = t('installH');
    ov.querySelector('.dl-uh').textContent = t('usageH');
    ov.querySelector('.dl-nh').textContent = t('noteH') + ' — ';
    ov.querySelector('.dl-nt').textContent = t(d.noteKey || 'note');
    ov.querySelector('.dl-done').textContent = t('close');
    const fill = (sel, keys) => {
      const ol = ov.querySelector(sel); ol.innerHTML = '';
      keys.forEach(k => { const li = document.createElement('li'); li.textContent = t(k); ol.appendChild(li); });
    };
    fill('.dl-install', d.install);
    fill('.dl-usage', d.usage);
    ov.classList.add('open');
    mountDemo(d);
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
      card.querySelector('.dl-get').textContent = d.kind === 'bookmarklet'
        ? t('drag')
        : t('get') + ' (' + d.size + ')';
      card.querySelector('.dl-how').textContent =
        d.kind === 'bookmarklet' ? t('howDemo') : t('how');
    });
    if (ov.classList.contains('open') && openFor) openGuide(openFor);
  }

  document.addEventListener('flrot:lang', e => applyLang(e.detail));
  let saved = null;
  try { saved = localStorage.getItem('flrot:lang'); } catch (err) {}
  applyLang(saved || 'he');

})();
