// ============================================================
//  Floating rotation — מדריך מלא להתקנת המתרגם
//  המתרגם מדבר בגוף ראשון ומלווה שלב-שלב.
//  שליטה מלאה: הפעלה/עצירה, קדימה/אחורה, וקפיצה לכל שלב.
// ============================================================
(function () {

  var RTL = ['he', 'ar'];
  var LANGS = [['he','עברית'],['en','English'],['ar','العربية'],['zh','中文'],
               ['es','Español'],['fr','Français'],['pt','Português'],['ru','Русский'],['de','Deutsch']];

  // ---------- טקסטים ----------
  var T = {
    he: {
      title:'איך מחברים אותי', sub:'מדריך מלא — אני אלווה אותך שלב אחרי שלב',
      back:'← חזרה לאתר', play:'⏸ עצור', paused:'▶ המשך', prev:'⏮', next:'⏭',
      chapters:'השלבים', dragMe:'⇱ גרור אותי לשורת הסימניות', copyMe:'📋 העתק אותי',
      copied:'הועתק ✓', copyManual:'סמן הכל (Ctrl+A) והעתק (Ctrl+C)',
      doIt:'עשה את זה עכשיו — הכפתור אמיתי:', bmName:'תרגם',
      n1:'היי. אני המתרגם. אני יושב בשורת הסימניות של הדפדפן, ובלחיצה אחת מתרגם כל אתר שאתה נמצא בו. בוא נחבר אותי — זה לוקח פחות מדקה.',
      n2:'זו הבעיה הכי נפוצה: לרוב האנשים שורת הסימניות מוסתרת. רואה? מתחת לשורת הכתובת אין כלום. אין לי איפה לשבת.',
      n3:'לחץ Ctrl + Shift + B. במק: Cmd + Shift + B. זה מדליק את שורת הסימניות.',
      n4:'הנה, הרצועה נפתחה. עכשיו יש לי מקום. בלי השלב הזה כל השאר לא יעבוד.',
      n5:'עכשיו תפוס אותי עם העכבר וגרור אותי אל הרצועה. אל תשחרר באמצע הדרך.',
      n6:'נכנסתי. זהו — זה קורה פעם אחת בחיים. מעכשיו אני שם תמיד, בכל אתר.',
      n7:'לא הצלחת לגרור? יש דרך אחרת: העתק אותי, פתח Ctrl + Shift + O, לחץ על תפריט שלוש הנקודות ובחר "הוסף סימנייה חדשה", ואז הדבק אותי בשדה הכתובת.',
      n8:'עכשיו בוא ננסה. כנס לכל אתר שבא לך — חדשות, ויקיפדיה, חנות, מה שתרצה.',
      n9:'לחץ עליי בשורת הסימניות. אני נפתח בפינה של העמוד.',
      n10:'בחר את השפה שאתה רוצה, ולחץ "תרגם את העמוד". אני עובר על כל הטקסט ומחליף אותו.',
      n11:'תוך כדי יש לך ⏹ עצור אם נמאס לך באמצע. ובסוף — ↩ החזר מקור מחזיר את העמוד בדיוק כמו שהיה. זהו, סיימנו.'
    },
    en: {
      title:'How to connect me', sub:'Full guide — I will walk you through it step by step',
      back:'← Back to the site', play:'⏸ Pause', paused:'▶ Resume', prev:'⏮', next:'⏭',
      chapters:'Steps', dragMe:'⇱ Drag me to the bookmarks bar', copyMe:'📋 Copy me',
      copied:'Copied ✓', copyManual:'Select all (Ctrl+A) and copy (Ctrl+C)',
      doIt:'Do it right now — this button is real:', bmName:'Translate',
      n1:'Hi. I am the translator. I live in your browser bookmarks bar, and with one click I translate whatever site you are on. Let us connect me — it takes under a minute.',
      n2:'This is the most common problem: for most people the bookmarks bar is hidden. See? There is nothing under the address bar. I have nowhere to sit.',
      n3:'Press Ctrl + Shift + B. On Mac: Cmd + Shift + B. That turns the bookmarks bar on.',
      n4:'There it is. Now I have a place. Without this step nothing else will work.',
      n5:'Now grab me with the mouse and drag me onto that strip. Do not let go halfway.',
      n6:'I am in. That is it — this happens once, ever. From now on I am always there, on every site.',
      n7:'Could not drag? There is another way: copy me, press Ctrl + Shift + O, click the three-dot menu and choose "Add new bookmark", then paste me into the URL field.',
      n8:'Now let us try. Go to any site you like — news, Wikipedia, a shop, anything.',
      n9:'Click me in the bookmarks bar. I open in the corner of the page.',
      n10:'Pick the language you want and press "Translate page". I go over all the text and swap it.',
      n11:'While I work you have ⏹ Stop if you change your mind. And at the end, ↩ Restore original puts the page back exactly as it was. That is everything.'
    },
    ar: {
      title:'كيف توصلني', sub:'دليل كامل — سأرافقك خطوة بخطوة',
      back:'← العودة إلى الموقع', play:'⏸ إيقاف', paused:'▶ متابعة', prev:'⏮', next:'⏭',
      chapters:'الخطوات', dragMe:'⇱ اسحبني إلى شريط المفضلة', copyMe:'📋 انسخني',
      copied:'تم النسخ ✓', copyManual:'حدّد الكل (Ctrl+A) وانسخ (Ctrl+C)',
      doIt:'جرّب الآن — هذا الزر حقيقي:', bmName:'ترجم',
      n1:'مرحباً. أنا المترجم. أسكن في شريط المفضلة، وبضغطة واحدة أترجم أي موقع تتصفحه. لنوصلني — الأمر يستغرق أقل من دقيقة.',
      n2:'هذه أكثر مشكلة شيوعاً: عند معظم الناس شريط المفضلة مخفي. أترى؟ لا يوجد شيء تحت شريط العنوان. ليس لي مكان.',
      n3:'اضغط Ctrl + Shift + B. على ماك: Cmd + Shift + B. هذا يفعّل شريط المفضلة.',
      n4:'ها هو. الآن لديّ مكان. بدون هذه الخطوة لن ينجح أي شيء آخر.',
      n5:'الآن أمسكني بالفأرة واسحبني إلى ذلك الشريط. لا تفلتني في منتصف الطريق.',
      n6:'دخلت. هذا كل شيء — يحدث مرة واحدة فقط. من الآن أنا هناك دائماً، في كل موقع.',
      n7:'لم تنجح في السحب؟ هناك طريقة أخرى: انسخني، اضغط Ctrl + Shift + O، افتح قائمة النقاط الثلاث واختر "إضافة إشارة مرجعية"، ثم الصقني في حقل العنوان.',
      n8:'الآن لنجرّب. ادخل إلى أي موقع تريد — أخبار، ويكيبيديا، متجر، أي شيء.',
      n9:'اضغط عليّ في شريط المفضلة. سأفتح في زاوية الصفحة.',
      n10:'اختر اللغة التي تريدها واضغط "ترجم الصفحة". سأمرّ على كل النص وأستبدله.',
      n11:'أثناء العمل لديك ⏹ إيقاف إن غيّرت رأيك. وفي النهاية ↩ استعادة الأصل تعيد الصفحة كما كانت تماماً. هذا كل شيء.'
    },
    zh: {
      title:'怎么把我装上', sub:'完整教程——我会一步步带你做',
      back:'← 返回网站', play:'⏸ 暂停', paused:'▶ 继续', prev:'⏮', next:'⏭',
      chapters:'步骤', dragMe:'⇱ 把我拖到书签栏', copyMe:'📋 复制我',
      copied:'已复制 ✓', copyManual:'全选(Ctrl+A)并复制(Ctrl+C)',
      doIt:'现在就试——这个按钮是真的:', bmName:'翻译',
      n1:'你好,我是翻译器。我住在浏览器的书签栏里,点一下就能翻译你正在看的任何网站。我们来把我装上,不到一分钟。',
      n2:'这是最常见的问题:大多数人的书签栏是隐藏的。看到了吗?地址栏下面什么都没有。我没有地方待。',
      n3:'按 Ctrl + Shift + B。Mac 上是 Cmd + Shift + B。这会打开书签栏。',
      n4:'出来了。现在我有位置了。没有这一步,后面都不管用。',
      n5:'现在用鼠标抓住我,把我拖到那条栏上。中途不要松手。',
      n6:'进去了。就这样——一辈子只需做一次。从现在起我一直在那儿,任何网站都能用。',
      n7:'拖不动?还有别的办法:复制我,按 Ctrl + Shift + O,点三点菜单选「添加新书签」,然后把我粘贴到网址栏。',
      n8:'现在来试试。打开任何你喜欢的网站——新闻、维基百科、购物,都行。',
      n9:'在书签栏点我一下。我会在页面角落打开。',
      n10:'选择你想要的语言,点「翻译页面」。我会把所有文字都换掉。',
      n11:'翻译过程中你有 ⏹ 停止,随时可以中断。结束后 ↩ 恢复原文 会把页面完全还原。就这些。'
    },
    es: {
      title:'Cómo conectarme', sub:'Guía completa — te acompaño paso a paso',
      back:'← Volver al sitio', play:'⏸ Pausa', paused:'▶ Continuar', prev:'⏮', next:'⏭',
      chapters:'Pasos', dragMe:'⇱ Arrástrame a la barra de marcadores', copyMe:'📋 Cópiame',
      copied:'Copiado ✓', copyManual:'Selecciona todo (Ctrl+A) y copia (Ctrl+C)',
      doIt:'Hazlo ahora — este botón es real:', bmName:'Traducir',
      n1:'Hola. Soy el traductor. Vivo en la barra de marcadores y con un clic traduzco la web en la que estés. Vamos a conectarme: menos de un minuto.',
      n2:'Este es el problema más común: para casi todos la barra de marcadores está oculta. ¿Ves? No hay nada bajo la barra de direcciones. No tengo dónde ponerme.',
      n3:'Pulsa Ctrl + Shift + B. En Mac: Cmd + Shift + B. Eso activa la barra de marcadores.',
      n4:'Ahí está. Ya tengo sitio. Sin este paso nada más funcionará.',
      n5:'Ahora agárrame con el ratón y arrástrame hasta esa franja. No me sueltes a medio camino.',
      n6:'Ya estoy dentro. Eso es todo: se hace una sola vez. A partir de ahora estoy siempre ahí, en cualquier web.',
      n7:'¿No pudiste arrastrar? Hay otra forma: cópiame, pulsa Ctrl + Shift + O, abre el menú de tres puntos y elige "Añadir marcador", y pégame en el campo de URL.',
      n8:'Ahora probemos. Entra en cualquier web — noticias, Wikipedia, una tienda, lo que sea.',
      n9:'Púlsame en la barra de marcadores. Me abro en la esquina de la página.',
      n10:'Elige el idioma que quieras y pulsa "Traducir página". Recorro todo el texto y lo cambio.',
      n11:'Mientras trabajo tienes ⏹ Detener si cambias de idea. Y al final, ↩ Restaurar deja la página como estaba. Eso es todo.'
    },
    fr: {
      title:'Comment me brancher', sub:'Guide complet — je t\'accompagne étape par étape',
      back:'← Retour au site', play:'⏸ Pause', paused:'▶ Reprendre', prev:'⏮', next:'⏭',
      chapters:'Étapes', dragMe:'⇱ Glisse-moi dans la barre de favoris', copyMe:'📋 Copie-moi',
      copied:'Copié ✓', copyManual:'Tout sélectionner (Ctrl+A) et copier (Ctrl+C)',
      doIt:'Fais-le maintenant — ce bouton est réel :', bmName:'Traduire',
      n1:'Salut. Je suis le traducteur. J\'habite dans la barre de favoris et, en un clic, je traduis le site où tu es. Branchons-moi — moins d\'une minute.',
      n2:'C\'est le problème le plus courant : chez la plupart des gens la barre de favoris est masquée. Tu vois ? Rien sous la barre d\'adresse. Je n\'ai nulle part où me poser.',
      n3:'Appuie sur Ctrl + Maj + B. Sur Mac : Cmd + Maj + B. Cela affiche la barre de favoris.',
      n4:'La voilà. Maintenant j\'ai une place. Sans cette étape, rien d\'autre ne marchera.',
      n5:'Maintenant attrape-moi avec la souris et glisse-moi sur cette bande. Ne me lâche pas en route.',
      n6:'Je suis dedans. C\'est tout — ça ne se fait qu\'une fois. Désormais je suis toujours là, sur tous les sites.',
      n7:'Le glisser n\'a pas marché ? Autre méthode : copie-moi, fais Ctrl + Maj + O, ouvre le menu trois points, choisis « Ajouter un favori », puis colle-moi dans le champ URL.',
      n8:'Essayons. Va sur le site que tu veux — actualités, Wikipédia, une boutique, peu importe.',
      n9:'Clique sur moi dans la barre de favoris. Je m\'ouvre dans le coin de la page.',
      n10:'Choisis la langue voulue et clique « Traduire la page ». Je parcours tout le texte et je le remplace.',
      n11:'Pendant que je travaille tu as ⏹ Arrêter si tu changes d\'avis. Et à la fin, ↩ Restaurer remet la page comme avant. Voilà, c\'est tout.'
    },
    pt: {
      title:'Como me conectar', sub:'Guia completo — eu te acompanho passo a passo',
      back:'← Voltar ao site', play:'⏸ Pausar', paused:'▶ Continuar', prev:'⏮', next:'⏭',
      chapters:'Passos', dragMe:'⇱ Arraste-me para a barra de favoritos', copyMe:'📋 Copie-me',
      copied:'Copiado ✓', copyManual:'Selecione tudo (Ctrl+A) e copie (Ctrl+C)',
      doIt:'Faça agora — este botão é real:', bmName:'Traduzir',
      n1:'Oi. Eu sou o tradutor. Moro na barra de favoritos e, com um clique, traduzo qualquer site em que você esteja. Vamos me conectar — leva menos de um minuto.',
      n2:'Esse é o problema mais comum: para a maioria das pessoas a barra de favoritos está escondida. Viu? Não tem nada abaixo da barra de endereço. Não tenho onde ficar.',
      n3:'Aperte Ctrl + Shift + B. No Mac: Cmd + Shift + B. Isso liga a barra de favoritos.',
      n4:'Pronto. Agora tenho lugar. Sem este passo, nada mais vai funcionar.',
      n5:'Agora me segure com o mouse e me arraste até aquela faixa. Não me solte no meio do caminho.',
      n6:'Entrei. É isso — acontece uma vez só. De agora em diante estou sempre lá, em qualquer site.',
      n7:'Não conseguiu arrastar? Existe outro jeito: copie-me, aperte Ctrl + Shift + O, abra o menu de três pontos, escolha "Adicionar novo favorito" e me cole no campo de URL.',
      n8:'Agora vamos testar. Entre em qualquer site — notícias, Wikipédia, uma loja, o que quiser.',
      n9:'Clique em mim na barra de favoritos. Eu abro no canto da página.',
      n10:'Escolha o idioma que quiser e clique em "Traduzir página". Eu passo por todo o texto e troco.',
      n11:'Enquanto trabalho você tem ⏹ Parar se mudar de ideia. E no fim, ↩ Restaurar devolve a página exatamente como estava. É só isso.'
    },
    ru: {
      title:'Как меня подключить', sub:'Полное руководство — проведу вас шаг за шагом',
      back:'← Назад на сайт', play:'⏸ Пауза', paused:'▶ Продолжить', prev:'⏮', next:'⏭',
      chapters:'Шаги', dragMe:'⇱ Перетащи меня на панель закладок', copyMe:'📋 Скопируй меня',
      copied:'Скопировано ✓', copyManual:'Выделите всё (Ctrl+A) и скопируйте (Ctrl+C)',
      doIt:'Сделайте прямо сейчас — кнопка настоящая:', bmName:'Перевести',
      n1:'Привет. Я переводчик. Я живу на панели закладок и одним нажатием перевожу любой сайт, на котором вы находитесь. Давайте меня подключим — это меньше минуты.',
      n2:'Вот самая частая проблема: у большинства панель закладок скрыта. Видите? Под адресной строкой пусто. Мне негде разместиться.',
      n3:'Нажмите Ctrl + Shift + B. На Mac: Cmd + Shift + B. Это включает панель закладок.',
      n4:'Вот она. Теперь у меня есть место. Без этого шага всё остальное не сработает.',
      n5:'Теперь возьмите меня мышью и перетащите на эту полосу. Не отпускайте на полпути.',
      n6:'Я внутри. Всё — это делается один раз в жизни. Теперь я всегда там, на любом сайте.',
      n7:'Не получилось перетащить? Есть другой путь: скопируйте меня, нажмите Ctrl + Shift + O, откройте меню из трёх точек, выберите «Добавить закладку» и вставьте меня в поле адреса.',
      n8:'Теперь попробуем. Зайдите на любой сайт — новости, Википедия, магазин, что угодно.',
      n9:'Нажмите на меня на панели закладок. Я открываюсь в углу страницы.',
      n10:'Выберите нужный язык и нажмите «Перевести страницу». Я пройду по всему тексту и заменю его.',
      n11:'Пока я работаю, у вас есть ⏹ Стоп, если передумаете. А в конце ↩ Вернуть оригинал возвращает страницу ровно в исходный вид. Вот и всё.'
    },
    de: {
      title:'Wie du mich anschließt', sub:'Vollständige Anleitung — ich führe dich Schritt für Schritt',
      back:'← Zurück zur Seite', play:'⏸ Pause', paused:'▶ Weiter', prev:'⏮', next:'⏭',
      chapters:'Schritte', dragMe:'⇱ Zieh mich in die Lesezeichenleiste', copyMe:'📋 Kopier mich',
      copied:'Kopiert ✓', copyManual:'Alles markieren (Strg+A) und kopieren (Strg+C)',
      doIt:'Mach es gleich — dieser Knopf ist echt:', bmName:'Übersetzen',
      n1:'Hallo. Ich bin der Übersetzer. Ich wohne in deiner Lesezeichenleiste und übersetze mit einem Klick die Seite, auf der du gerade bist. Schließen wir mich an — keine Minute.',
      n2:'Das ist das häufigste Problem: Bei den meisten ist die Lesezeichenleiste ausgeblendet. Siehst du? Unter der Adressleiste ist nichts. Ich habe keinen Platz.',
      n3:'Drück Strg + Umschalt + B. Auf dem Mac: Cmd + Umschalt + B. Das blendet die Lesezeichenleiste ein.',
      n4:'Da ist sie. Jetzt habe ich einen Platz. Ohne diesen Schritt funktioniert nichts weiter.',
      n5:'Jetzt pack mich mit der Maus und zieh mich auf diesen Streifen. Lass mich nicht auf halbem Weg los.',
      n6:'Ich bin drin. Das war\'s — das passiert nur ein einziges Mal. Ab jetzt bin ich immer da, auf jeder Seite.',
      n7:'Ziehen hat nicht geklappt? Es geht auch anders: Kopier mich, drück Strg + Umschalt + O, öffne das Drei-Punkte-Menü, wähle „Neues Lesezeichen hinzufügen" und füg mich ins URL-Feld ein.',
      n8:'Jetzt probieren wir es. Geh auf irgendeine Seite — Nachrichten, Wikipedia, ein Shop, egal.',
      n9:'Klick mich in der Lesezeichenleiste an. Ich öffne mich in der Ecke der Seite.',
      n10:'Wähl die gewünschte Sprache und klick „Seite übersetzen". Ich gehe den ganzen Text durch und tausche ihn aus.',
      n11:'Während ich arbeite hast du ⏹ Stopp, falls du es dir anders überlegst. Und am Ende setzt ↩ Original die Seite exakt zurück. Das ist alles.'
    }
  };

  var lang = 'he';
  function t(k) { return (T[lang] && T[lang][k]) || T.he[k] || k; }

  // כל שלב: הטקסט, וכיצד נראית הבמה
  var STEPS = ['n1','n2','n3','n4','n5','n6','n7','n8','n9','n10','n11'];
  var HOLD  = [4200, 4200, 3800, 3200, 4200, 3600, 6000, 3600, 3400, 4200, 6000];

  var idx = 0, playing = true, timer = null, token = 0;

  var $ = function (s) { return document.querySelector(s); };

  // ---------- הבמה ----------
  function paintStage() {
    var win = $('#stage');
    var marks = $('#gMarks'), kbd = $('#gKbd'), chip = $('#gChip'),
        drag = $('#gDrag'), ghost = $('#gGhost'), cur = $('#gCursor'),
        url = $('#gUrl'), lines = $('#gLines'), panel = $('#gPanel'),
        mgr = $('#gMgr'), arrow = $('#gArrow');

    // ברירת מחדל לכל שלב
    marks.classList.add('off'); kbd.classList.remove('on'); chip.classList.remove('in','hit');
    drag.classList.remove('show','grabbed'); ghost.classList.remove('on');
    panel.classList.remove('in'); mgr.classList.remove('on'); arrow.classList.remove('on');
    url.textContent = 'floating-rotation';
    lines.innerHTML = '';
    cur.style.left = '50%'; cur.style.top = '94%';

    var n = idx;
    if (n >= 3) marks.classList.remove('off');          // מהשלב שבו הרצועה נפתחה
    if (n >= 5) chip.classList.add('in');

    if (n === 1) { arrow.classList.add('on'); }
    if (n === 2) { kbd.classList.add('on'); }
    if (n === 4) {
      drag.classList.add('show', 'grabbed');
      ghost.classList.add('on');
      ghost.style.left = '30%'; ghost.style.top = '26%';
      cur.style.left = '30%'; cur.style.top = '30%';
    }
    if (n === 6) { mgr.classList.add('on'); }
    if (n >= 7) {
      url.textContent = 'any-website.com';
      ['s1','s2','s3','s4'].forEach(function (k, i) {
        var d = document.createElement('div');
        d.className = 'g-line' + (i === 0 ? ' head' : '');
        d.textContent = SAMPLE[i];
        if (n >= 9) { d.textContent = SAMPLE_TR[i]; d.classList.add('done'); d.dir = RTL.indexOf(lang) >= 0 ? 'rtl' : 'ltr'; }
        lines.appendChild(d);
      });
    }
    if (n === 8) { chip.classList.add('hit'); cur.style.left = '22%'; cur.style.top = '25%'; }
    if (n >= 8) { panel.classList.add('in'); }
    if (n >= 9) {
      $('#gpBtn').textContent = n === 9 ? t('bmName') : '↩';
      $('#gpFill').style.width = '100%';
    } else {
      $('#gpFill').style.width = '0%';
    }
    if (n === 10) { $('#gpBtn').textContent = '⏹ / ↩'; }
  }

  var SAMPLE = ['Breaking news today', 'Read the full story', 'Sports and weather', 'Subscribe for updates'];
  var SAMPLE_TR = SAMPLE;

  function setSamples() {
    var m = {
      he:['חדשות מתפרצות היום','לקריאת הכתבה המלאה','ספורט ומזג אוויר','הרשמה לעדכונים'],
      en:['Breaking news today','Read the full story','Sports and weather','Subscribe for updates'],
      ar:['أخبار عاجلة اليوم','اقرأ الخبر كاملاً','الرياضة والطقس','اشترك في التحديثات'],
      zh:['今日突发新闻','阅读完整报道','体育与天气','订阅最新消息'],
      es:['Últimas noticias de hoy','Leer la noticia completa','Deportes y clima','Suscríbete a las novedades'],
      fr:['Dernières nouvelles du jour','Lire l\'article complet','Sports et météo','Abonne-toi aux mises à jour'],
      pt:['Notícias de última hora','Leia a matéria completa','Esportes e clima','Assine as novidades'],
      ru:['Срочные новости сегодня','Читать статью целиком','Спорт и погода','Подпишитесь на обновления'],
      de:['Aktuelle Nachrichten heute','Den ganzen Artikel lesen','Sport und Wetter','Updates abonnieren']
    };
    SAMPLE_TR = m[lang] || m.en;
    SAMPLE = lang === 'en'
      ? ['Últimas noticias de hoy','Leer la noticia completa','Deportes y clima','Suscríbete a las novedades']
      : ['Breaking news today','Read the full story','Sports and weather','Subscribe for updates'];
  }

  // ---------- ניווט ----------
  function goto(n, keepPlaying) {
    idx = Math.max(0, Math.min(STEPS.length - 1, n));
    token++;
    $('#narr').textContent = t(STEPS[idx]);
    $('#counter').textContent = (idx + 1) + ' / ' + STEPS.length;
    [].forEach.call($('#chapters').children, function (c, i) {
      c.classList.toggle('on', i === idx);
    });
    paintStage();
    if (playing && keepPlaying !== false) schedule();
  }

  function schedule() {
    clearTimeout(timer);
    var mine = token;
    timer = setTimeout(function () {
      if (mine !== token || !playing) return;
      goto(idx + 1 >= STEPS.length ? 0 : idx + 1);
    }, HOLD[idx] || 4000);
  }

  function setPlaying(p) {
    playing = p;
    $('#playBtn').textContent = playing ? t('play') : t('paused');
    if (playing) schedule(); else clearTimeout(timer);
  }

  // ---------- שפה ----------
  function applyLang(lg) {
    lang = T[lg] ? lg : 'he';
    setSamples();
    var rtl = RTL.indexOf(lang) >= 0;
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    $('#gTitle').textContent = t('title');
    $('#gSub').textContent = t('sub');
    $('#backLink').textContent = t('back');
    $('#prevBtn').textContent = t('prev');
    $('#nextBtn').textContent = t('next');
    $('#playBtn').textContent = playing ? t('play') : t('paused');
    $('#chaptersH').textContent = t('chapters');
    $('#doItH').textContent = t('doIt');
    $('#bmLink').textContent = t('dragMe');
    $('#copyBtn').textContent = t('copyMe');
    $('#gChip').textContent = t('bmName');
    $('#gGhost').textContent = t('bmName');
    $('#gDrag').textContent = t('dragMe');
    var ch = $('#chapters');
    ch.innerHTML = '';
    STEPS.forEach(function (k, i) {
      var b = document.createElement('button');
      // חיתוך לפי אורך, לא לפי סימני פיסוק — משפט פותח קצר נתן תווית ריקה מתוכן
      var txt = t(k).replace(/\s+/g, ' ').trim();
      b.textContent = (i + 1) + '. ' + (txt.length > 46 ? txt.slice(0, 46) + '…' : txt);
      b.onclick = function () { setPlaying(false); goto(i); };
      ch.appendChild(b);
    });
    goto(idx, false);
    if (playing) schedule();
    try { localStorage.setItem('flrot:lang', lang); } catch (e) {}
  }

  // ---------- אתחול ----------
  document.addEventListener('DOMContentLoaded', function () {
    var sel = $('#langSel');
    LANGS.forEach(function (l) {
      var o = document.createElement('option');
      o.value = l[0]; o.textContent = l[1];
      sel.appendChild(o);
    });
    var saved = null;
    try { saved = localStorage.getItem('flrot:lang'); } catch (e) {}
    sel.value = T[saved] ? saved : 'he';
    sel.onchange = function () { applyLang(sel.value); };

    $('#playBtn').onclick = function () { setPlaying(!playing); };
    $('#prevBtn').onclick = function () { setPlaying(false); goto(idx - 1); };
    $('#nextBtn').onclick = function () { setPlaying(false); goto(idx + 1); };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { setPlaying(false); goto(RTL.indexOf(lang) >= 0 ? idx - 1 : idx + 1); }
      if (e.key === 'ArrowLeft')  { setPlaying(false); goto(RTL.indexOf(lang) >= 0 ? idx + 1 : idx - 1); }
      if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
    });

    // כפתור ההעתקה — תמיד מציג גם את הקוד מסומן, כי ה-clipboard נכשל בשקט
    $('#copyBtn').onclick = async function () {
      var url = $('#bmLink').getAttribute('href') || '';
      var box = $('#codeBox');
      box.value = url;
      box.style.display = 'block';
      box.focus(); box.select(); box.setSelectionRange(0, url.length);
      var ok = false;
      try { await navigator.clipboard.writeText(url); ok = true; }
      catch (e) { try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } }
      $('#copyBtn').textContent = ok ? t('copied') : t('copyManual');
      $('#copyBtn').classList.toggle('ok', ok);
    };

    applyLang(sel.value);
  });
})();
