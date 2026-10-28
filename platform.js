// ============================================
//  פלטפורמה — חנות וניווט
// ============================================

// ============================================================
//  Floating rotation — פלטפורמת משחקים
// ============================================================

// ---------- הרכבת משחק ופירוק שלו ----------
// מסך המשחק עצמו (המסגרת, הפס, "עוד משחקים", הכתובת #play/...) נמצא ב-hub.js.
const gameMount = document.getElementById('gameMount');
let activeCleanup = null;

function openGame(g) {
  closeGame();
  activeCleanup = g.mount(gameMount) || null;
}
function closeGame() {
  if (activeCleanup) activeCleanup();
  activeCleanup = null;
  gameMount.innerHTML = '';
}

// משחק שחי בריפו נפרד ומוטמע בתוך הפלטפורמה.
// אותו מקור (github.io), ולכן אפשר גם למקד את המקלדת אליו.
function mountIframe(url) {
  return function (host) {
    const f = document.createElement('iframe');
    f.src = url;
    f.title = 'game';
    f.allow = 'autoplay; fullscreen; gamepad';
    f.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#0d1620';
    // ה-flex המרכז של המארח מקטין את המסגרת לגובה 0
    host.style.padding = '0';
    host.style.display = 'block';
    host.appendChild(f);
    // בלי מיקוד המקלדת בתוך המסגרת, רווח ומקשי הקושי לא מגיעים למשחק
    const focus = () => { try { f.contentWindow.focus(); } catch (e) {} };
    f.addEventListener('load', focus);
    host.addEventListener('mousedown', focus);
    setTimeout(focus, 250);
    return function cleanup() {
      host.removeEventListener('mousedown', focus);
      host.style.padding = '';
      host.style.display = '';
      f.remove();
    };
  };
}

// ---------- קטלוג המשחקים בפלטפורמה ----------
// type — סוג המשחק שכתוב על הכרטיס: ARCADE, CASUAL, PUZZLE, STRATEGY, SPORT, SURVIVAL, FUNNY.
// added:'שנה-חודש-יום' — היום שבו המשחק נוסף. שבועיים מהיום הזה כתוב על הכרטיס "חדש!",
//   ואחר כך סוג המשחק. זה מתחלף לבד, לא צריך לגעת בשום דבר.
// plainBg:true — ללוגו יש רקע משלו (לא שקוף). אז אין מאחוריו תמונה מטושטשת, והכרטיס מקבל את
//   צבע ה-bg בלבד. bg צריך להיות בדיוק הצבע של רקע הלוגו, כדי שלא יראו את הריבוע שלו.
// dim:'3d' — משחק בתלת-ממד (מופיע בלשונית 3D של "משחקים חינמיים"). בלי dim המשחק הוא 2D.
const GAMES = [
  { id:'zombies', title:'מתקפת הזומבים', desc:'שרוד 20 מפות, חסל זומבים ובוסים ושדרג את הנשקים שלך.', imgFile:'zombie-card.webp', imgFill:true, icon:'🧟', type:'SURVIVAL', added:'2026-09-12', bg:'#151b15', mount:mountIframe('zombie-attack/') },
  { id:'dino', title:'Dino Runner', desc:'רוץ, קפוץ, אסוף מטבעות וקנה דמויות בחנות.', imgFile:'dino-logo.png', icon:'🦖', type:'ARCADE', added:'2026-07-15', bg:'linear-gradient(135deg,#1b3a4b,#0d1b2a)', mount:mountDino },
  { id:'catch', title:'Star Catcher', desc:'תפוס כוכבים נופלים עם הסלסלה.', imgFile:'star-logo.png', icon:'⭐', type:'CASUAL', added:'2026-07-15', bg:'#161736', mount:mountCatch },
  { id:'memory', title:'Memory Adjustment', desc:'מצא את כל הזוגות — 7 שלבים נגד השעון.', imgFile:'memory-logo.png', icon:'🧠', type:'PUZZLE', added:'2026-07-15', bg:'linear-gradient(135deg,#1b4b3a,#0d1b2a)', mount:mountMemory },
  { id:'button', title:'אל תלחץ על הכפתור', desc:'משחק כפתור כאוטי ומצחיק.', img:BUTTON_LOGO, icon:'🔴', type:'FUNNY', added:'2026-07-15', bg:'linear-gradient(135deg,#4b1b2a,#0d1b2a)', url:'https://unique-flan-89080c.netlify.app/' },
  { id:'chess', title:'Chess Prestige', desc:'שחמט נגד המחשב או מול חבר.', imgFile:'chess-logo.png', icon:'♞', type:'STRATEGY', added:'2026-07-16', bg:'#0a0a0a', mount:mountChess },
  { id:'tetris', title:'Tetris', desc:'טטריס — סובב, הפל ונקה שורות!', imgFile:'tetris-logo.png', icon:'🟪', type:'PUZZLE', added:'2026-07-18', bg:'linear-gradient(135deg,#2a1b4b,#0d1b2a)', mount:mountTetris },
  { id:'pong', dim:'3d', plainBg:true, title:'פינג פונג', desc:'מול המחשב, מול חבר על אותו מחשב, או אונליין עם קוד חדר.', imgFile:'pong-logo.jpg', icon:'🏓', type:'SPORT', added:'2026-08-29', bg:'#00000f', mount:mountIframe('https://shachardorhaim-sketch.github.io/ping-pong-3d/') },
];

const grid = document.getElementById('grid');
GAMES.forEach(g => {
  const card = document.createElement('div');
  card.className = 'gcard';
  card.dataset.gid = g.id;
  card.dataset.dim = g.dim || '2d';
  card.tabIndex = 0;
  // תמיכה ב-3 סוגי תמונה: קובץ (imgFile), base64 (img), או אימוג'י (icon)
  // imgFill:true — תמונת סצנה שממלאת את כל המשבצת (cover).
  // ברירת מחדל — לוגו שלם וממורכז, ומאחוריו אותה תמונה מטושטשת כרקע.
  const src = g.imgFile || (g.img ? 'data:image/png;base64,' + g.img : '');
  const thumbContent = src
    ? (g.imgFill || g.plainBg ? '' : '<div class="gthumb-bd" style="background-image:url(' + src + ')"></div>') +
      '<img class="gimg' + (g.imgFill ? ' fill' : '') + '" src="' + src + '" alt="">'
    : '<span class="gicon">'+g.icon+'</span>';
  card.innerHTML =
    '<div class="gthumb" style="background:'+g.bg+'">'+thumbContent+'<span class="gbadge"></span></div>' +
    '<div class="gbody"><h3>'+g.title+'</h3><p>'+g.desc+'</p>' +
    '<button class="gplay'+(g.soon?' soon':'')+'">'+(g.soon?'בקרוב':'▶ שחק')+'</button></div>';
  if (!g.soon) {
    const open = () => { if (g.url) openExternal(g); else window.flrotPlay(g.id); };
    card.querySelector('.gplay').onclick = open;
    card.onclick = e => { if (e.target.tagName!=='BUTTON') open(); };
    card.onkeydown = e => { if (e.key==='Enter') open(); };
  }
  grid.appendChild(card);
});

// פתיחת משחק חיצוני (של רובין) — נפתח ישר בלשונית חדשה
function openExternal(g) {
  window.open(g.url, '_blank');
}

// ============================================================
//  משחק 1 — DINO RUNNER (עם חנות דמויות + שיאים)
// ============================================================


// ============================================================
//  הגדרות: שפה (9 שפות), צבע רקע (130+ צבעים), אימייל
// ============================================================
(function(){
  const TR = {"he":{"builtBy":"נבנה על ידי שחר דור-חיים ורובין שמואלי","play":"▶ שחק","soon":"בקרוב","settings":"הגדרות","language":"שפה","email":"אימייל","emailPh":"הכנס אימייל...","save":"שמור","saved":"נשמר! ✓","bg":"רקע","close":"סגור","arcade":"ארקייד","casual":"קליל","puzzle":"חידה","strategy":"אסטרטגיה","newb":"חדש!","soonb":"בקרוב","dino":"רוץ, קפוץ, אסוף מטבעות וקנה דמויות בחנות.","catch":"תפוס כוכבים נופלים עם הסלסלה.","memory":"מצא את כל הזוגות — 7 שלבים נגד השעון.","button":"משחק כפתור כאוטי ומצחיק.","chess":"שחמט נגד המחשב או מול חבר.","tetris":"טטריס — סובב, הפל ונקה שורות!","fight":"המשחק הגדול מ־Godot — בקרוב!","button_t":"אל תלחץ על הכפתור","fight_t":"משחק לחימה","t_dino":"ריצת דינוזאור","t_catch":"תופס הכוכבים","t_memory":"משחק הזיכרון","t_chess":"שחמט","t_tetris":"טטריס","t_pong":"פינג פונג","pong":"מול המחשב, מול חבר על אותו מחשב, או אונליין עם קוד חדר.","sport":"ספורט","t_zombies":"מתקפת הזומבים","zombies":"שרוד 20 מפות, חסל זומבים ובוסים ושדרג את הנשקים שלך.","survival":"הישרדות","funny":"מצחיק","th_light":"בהיר","th_dark":"כהה"},"en":{"builtBy":"Built by Shachar Dor-Haim & Robin Shmueli","play":"▶ Play","soon":"Soon","settings":"Settings","language":"Language","email":"Email","emailPh":"Enter email...","save":"Save","saved":"Saved! ✓","bg":"Background","close":"Close","arcade":"ARCADE","casual":"CASUAL","puzzle":"PUZZLE","strategy":"STRATEGY","newb":"NEW!","soonb":"SOON","dino":"Run, jump, collect coins and buy characters in the shop.","catch":"Catch falling stars with the basket.","memory":"Find all the pairs — 7 levels against the clock.","button":"A chaotic, funny button game.","chess":"Chess against the computer or a friend.","tetris":"Tetris — rotate, drop and clear lines!","fight":"The big game from Godot — coming soon!","button_t":"Don't Press the Button","fight_t":"Fighting Game","t_dino":"Dino Runner","t_catch":"Star Catcher","t_memory":"Memory Adjustment","t_chess":"Chess Prestige","t_tetris":"Tetris","t_pong":"Ping Pong","pong":"Against the computer, against a friend on one keyboard, or online with a room code.","sport":"SPORT","t_zombies":"Zombie Attack","zombies":"Survive 20 maps, take down zombies and bosses, and upgrade your weapons.","survival":"SURVIVAL","funny":"FUNNY","th_light":"Light","th_dark":"Dark"},"ar":{"builtBy":"بُني بواسطة شاحار دور-حاييم وروبين شموئيلي","play":"▶ العب","soon":"قريباً","settings":"الإعدادات","language":"اللغة","email":"البريد الإلكتروني","emailPh":"أدخل البريد الإلكتروني...","save":"حفظ","saved":"تم الحفظ! ✓","bg":"الخلفية","close":"إغلاق","arcade":"أركيد","casual":"عادي","puzzle":"ألغاز","strategy":"استراتيجية","newb":"جديد!","soonb":"قريباً","dino":"اركض واقفز واجمع العملات واشترِ الشخصيات في المتجر.","catch":"التقط النجوم المتساقطة بالسلة.","memory":"جد كل الأزواج — 7 مراحل ضد الساعة.","button":"لعبة زر فوضوية ومضحكة.","chess":"شطرنج ضد الكمبيوتر أو ضد صديق.","tetris":"تتريس — دوّر وأسقط وامسح الصفوف!","fight":"اللعبة الكبيرة من Godot — قريباً!","button_t":"لا تضغط على الزر","fight_t":"لعبة قتال","t_dino":"عداء الديناصور","t_catch":"صائد النجوم","t_memory":"لعبة الذاكرة","t_chess":"شطرنج","t_tetris":"تتريس","t_pong":"بينغ بونغ","pong":"ضد الكمبيوتر، أو ضد صديق على نفس الجهاز، أو أونلاين برمز غرفة.","sport":"رياضة","t_zombies":"هجوم الزومبي","zombies":"انجُ في 20 خريطة، واقضِ على الزومبي والزعماء، وطوّر أسلحتك.","survival":"بقاء","funny":"مضحك","th_light":"فاتح","th_dark":"داكن"},"es":{"builtBy":"Creado por Shachar Dor-Haim y Robin Shmueli","play":"▶ Jugar","soon":"Pronto","settings":"Ajustes","language":"Idioma","email":"Correo","emailPh":"Introduce el correo...","save":"Guardar","saved":"¡Guardado! ✓","bg":"Fondo","close":"Cerrar","arcade":"ARCADE","casual":"CASUAL","puzzle":"PUZLE","strategy":"ESTRATEGIA","newb":"¡NUEVO!","soonb":"PRONTO","dino":"Corre, salta, junta monedas y compra personajes en la tienda.","catch":"Atrapa estrellas que caen con la cesta.","memory":"Encuentra todas las parejas: 7 niveles contra el reloj.","button":"Un juego de botón caótico y divertido.","chess":"Ajedrez contra la computadora o un amigo.","tetris":"Tetris: ¡gira, suelta y elimina líneas!","fight":"El gran juego de Godot: ¡muy pronto!","button_t":"No Pulses el Botón","fight_t":"Juego de Lucha","t_dino":"Dino Corredor","t_catch":"Cazaestrellas","t_memory":"Juego de Memoria","t_chess":"Ajedrez","t_tetris":"Tetris","t_pong":"Ping Pong","pong":"Contra la computadora, contra un amigo en el mismo teclado, o en línea con un código de sala.","sport":"DEPORTE","t_zombies":"Ataque Zombi","zombies":"Sobrevive a 20 mapas, acaba con zombis y jefes, y mejora tus armas.","survival":"SUPERVIVENCIA","funny":"HUMOR","th_light":"Claro","th_dark":"Oscuro"},"fr":{"builtBy":"Créé par Shachar Dor-Haim et Robin Shmueli","play":"▶ Jouer","soon":"Bientôt","settings":"Paramètres","language":"Langue","email":"E-mail","emailPh":"Saisir l'e-mail...","save":"Enregistrer","saved":"Enregistré ! ✓","bg":"Arrière-plan","close":"Fermer","arcade":"ARCADE","casual":"DÉTENTE","puzzle":"PUZZLE","strategy":"STRATÉGIE","newb":"NOUVEAU !","soonb":"BIENTÔT","dino":"Cours, saute, récolte des pièces et achète des personnages.","catch":"Attrape les étoiles qui tombent avec le panier.","memory":"Trouve toutes les paires — 7 niveaux contre la montre.","button":"Un jeu de bouton chaotique et drôle.","chess":"Échecs contre l'ordinateur ou un ami.","tetris":"Tetris — tourne, lâche et efface des lignes !","fight":"Le grand jeu de Godot — bientôt disponible !","button_t":"N'appuie pas sur le Bouton","fight_t":"Jeu de Combat","t_dino":"Dino Runner","t_catch":"Attrape-Étoiles","t_memory":"Jeu de Mémoire","t_chess":"Échecs","t_tetris":"Tetris","t_pong":"Ping Pong","pong":"Contre l’ordinateur, contre un ami sur le même clavier, ou en ligne avec un code de salon.","sport":"SPORT","t_zombies":"L'attaque des zombies","zombies":"Survis à 20 cartes, élimine zombies et boss, et améliore tes armes.","survival":"SURVIE","funny":"HUMOUR","th_light":"Clair","th_dark":"Sombre"},"pt":{"builtBy":"Criado por Shachar Dor-Haim e Robin Shmueli","play":"▶ Jogar","soon":"Em breve","settings":"Configurações","language":"Idioma","email":"E-mail","emailPh":"Digite o e-mail...","save":"Salvar","saved":"Salvo! ✓","bg":"Fundo","close":"Fechar","arcade":"ARCADE","casual":"CASUAL","puzzle":"PUZZLE","strategy":"ESTRATÉGIA","newb":"NOVO!","soonb":"EM BREVE","dino":"Corra, pule, junte moedas e compre personagens na loja.","catch":"Pegue estrelas caindo com a cesta.","memory":"Encontre todos os pares — 7 níveis contra o relógio.","button":"Um jogo de botão caótico e engraçado.","chess":"Xadrez contra o computador ou um amigo.","tetris":"Tetris — gire, solte e limpe linhas!","fight":"O grande jogo do Godot — em breve!","button_t":"Não Aperte o Botão","fight_t":"Jogo de Luta","t_dino":"Dino Corredor","t_catch":"Caça-Estrelas","t_memory":"Jogo da Memória","t_chess":"Xadrez","t_tetris":"Tetris","t_pong":"Ping Pong","pong":"Contra o computador, contra um amigo no mesmo teclado, ou online com um código de sala.","sport":"ESPORTE","t_zombies":"Ataque Zumbi","zombies":"Sobreviva a 20 mapas, elimine zumbis e chefões e melhore suas armas.","survival":"SOBREVIVÊNCIA","funny":"HUMOR","th_light":"Claro","th_dark":"Escuro"},"ru":{"builtBy":"Создано Шахаром Дор-Хаимом и Робином Шмуэли","play":"▶ Играть","soon":"Скоро","settings":"Настройки","language":"Язык","email":"Эл. почта","emailPh":"Введите эл. почту...","save":"Сохранить","saved":"Сохранено! ✓","bg":"Фон","close":"Закрыть","arcade":"АРКАДА","casual":"КЭЖУАЛ","puzzle":"ГОЛОВОЛОМКА","strategy":"СТРАТЕГИЯ","newb":"НОВОЕ!","soonb":"СКОРО","dino":"Беги, прыгай, собирай монеты и покупай персонажей в магазине.","catch":"Лови падающие звёзды корзиной.","memory":"Найди все пары — 7 уровней на время.","button":"Хаотичная и смешная игра с кнопкой.","chess":"Шахматы против компьютера или друга.","tetris":"Тетрис — вращай, бросай и убирай линии!","fight":"Большая игра на Godot — скоро!","button_t":"Не нажимай на кнопку","fight_t":"Файтинг","t_dino":"Динобег","t_catch":"Ловец звёзд","t_memory":"Игра на память","t_chess":"Шахматы","t_tetris":"Тетрис","t_pong":"Пинг-понг","pong":"Против компьютера, против друга на одной клавиатуре или онлайн по коду комнаты.","sport":"СПОРТ","t_zombies":"Нашествие зомби","zombies":"Выживи на 20 картах, уничтожай зомби и боссов и улучшай оружие.","survival":"ВЫЖИВАНИЕ","funny":"ЮМОР","th_light":"Светлый","th_dark":"Тёмный"},"de":{"builtBy":"Erstellt von Shachar Dor-Haim & Robin Shmueli","play":"▶ Spielen","soon":"Bald","settings":"Einstellungen","language":"Sprache","email":"E-Mail","emailPh":"E-Mail eingeben...","save":"Speichern","saved":"Gespeichert! ✓","bg":"Hintergrund","close":"Schließen","arcade":"ARCADE","casual":"CASUAL","puzzle":"PUZZLE","strategy":"STRATEGIE","newb":"NEU!","soonb":"BALD","dino":"Lauf, spring, sammle Münzen und kaufe Figuren im Shop.","catch":"Fang fallende Sterne mit dem Korb.","memory":"Finde alle Paare — 7 Level gegen die Uhr.","button":"Ein chaotisches, lustiges Knopf-Spiel.","chess":"Schach gegen den Computer oder einen Freund.","tetris":"Tetris — drehen, fallen lassen und Reihen löschen!","fight":"Das große Godot-Spiel — bald verfügbar!","button_t":"Drück nicht den Knopf","fight_t":"Kampfspiel","t_dino":"Dino-Läufer","t_catch":"Sternenfänger","t_memory":"Gedächtnisspiel","t_chess":"Schach","t_tetris":"Tetris","t_pong":"Ping Pong","pong":"Gegen den Computer, gegen einen Freund an einer Tastatur, oder online mit einem Raumcode.","sport":"SPORT","t_zombies":"Zombie-Angriff","zombies":"Überlebe 20 Karten, besiege Zombies und Bosse und verbessere deine Waffen.","survival":"ÜBERLEBEN","funny":"LUSTIG","th_light":"Hell","th_dark":"Dunkel"}};
  const NATIVE = {"he": "עברית", "en": "English", "ar": "العربية", "es": "Español", "fr": "Français", "pt": "Português", "ru": "Русский", "de": "Deutsch"};
  const LANGS = ["he", "en", "ar", "es", "fr", "pt", "ru", "de"];
  const RTL = ['he','ar'];
  // סוג המשחק על הכרטיס (type) → מפתח תרגום. בשבועיים הראשונים אחרי added כתוב "חדש!" במקום.
  const TYPE = {'ARCADE':'arcade','CASUAL':'casual','PUZZLE':'puzzle','STRATEGY':'strategy','SPORT':'sport','SURVIVAL':'survival','FUNNY':'funny','SOON':'soonb'};
  const NEW_DAYS = 14;
  function isNew(g){
    if(!g.added) return false;
    const d = new Date(g.added + 'T00:00:00');
    if(isNaN(d)) return false;
    const days = (Date.now() - d.getTime()) / 86400000;
    return days >= 0 && days < NEW_DAYS;
  }
  function badgeText(g){
    if(isNew(g)) return t('newb');
    return TYPE[g.type] ? t(TYPE[g.type]) : (g.type || '');
  }
  const GTITLE = {zombies:'t_zombies', dino:'t_dino', catch:'t_catch', memory:'t_memory', chess:'t_chess', tetris:'t_tetris', button:'button_t', soon:'fight_t', pong:'t_pong'};
  const GDESC = {zombies:'zombies', dino:'dino', catch:'catch', memory:'memory', button:'button', chess:'chess', tetris:'tetris', soon:'fight', pong:'pong'};
  const LSK = 'flrot:';
  const save = (k,v)=>{ try{ localStorage.setItem(LSK+k,v); }catch(e){} };
  const load = (k)=>{ try{ return localStorage.getItem(LSK+k); }catch(e){ return null; } };
  let curLang = load('lang'); if(!LANGS.includes(curLang)) curLang = 'he';
  const t = k => (TR[curLang] && TR[curLang][k]) || TR.he[k] || k;

  // ---------- CSS ----------
  const st = document.createElement('style');
  st.textContent =
    '#set-gear{margin-inline-start:auto;background:rgba(255,255,255,0.12);color:#fff;border:none;width:42px;height:42px;border-radius:50%;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;}'+
    '#set-gear:hover{background:rgba(255,255,255,0.25);}'+
    '#set-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:100;align-items:flex-start;justify-content:center;padding:24px;overflow-y:auto;}'+
    '#set-overlay.open{display:flex;}'+
    '.set-card{background:#141d28;border:1px solid #2a3b4f;border-radius:16px;max-width:640px;width:100%;padding:22px;color:#e8eef5;box-shadow:0 20px 60px rgba(0,0,0,0.5);}'+
    '.set-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:12px;}'+
    '.set-head h2{font-size:22px;margin:0;}'+
    '#set-close{background:#d9856b;color:#0d1620;border:none;width:34px;height:34px;border-radius:8px;font-size:18px;font-weight:800;cursor:pointer;flex-shrink:0;}'+
    '.set-sec{margin-bottom:20px;}'+
    '.set-sec h3{font-size:15px;margin:0 0 10px;color:#4fd1c5;}'+
    '.set-langs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}'+
    '.set-lang-btn,.set-theme-btn{background:#172230;border:1px solid #2a3b4f;color:#e8eef5;padding:11px 8px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;transition:.12s;}'+
    '.set-lang-btn:hover,.set-theme-btn:hover{border-color:#4fd1c5;}'+
    '.set-lang-btn.active,.set-theme-btn.active{background:#4fd1c5;color:#0d1620;border-color:#4fd1c5;}'+
    '.set-email-row{display:flex;gap:8px;flex-wrap:wrap;}'+
    '#set-email{flex:1;min-width:160px;background:#172230;border:1px solid #2a3b4f;color:#e8eef5;padding:11px;border-radius:8px;font-family:inherit;font-size:15px;}'+
    '#set-email-save{background:#ffd166;color:#0d1620;border:none;padding:11px 18px;border-radius:8px;font-weight:800;cursor:pointer;font-family:inherit;}'+
    '#set-email-status{color:#4fd1c5;font-size:13px;margin-top:6px;min-height:16px;}'+
    '.set-themes{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;}';
  document.head.appendChild(st);

  // ---------- gear button ----------
  const gear = document.createElement('button');
  gear.id = 'set-gear'; gear.textContent = '⚙'; gear.setAttribute('aria-label','Settings');
  const head = document.querySelector('.site-head');
  if(head) head.appendChild(gear);

  // ---------- overlay ----------
  const ov = document.createElement('div');
  ov.id = 'set-overlay';
  ov.innerHTML =
    '<div class="set-card">'+
      '<div class="set-head"><h2 id="set-title"></h2><button id="set-close">×</button></div>'+
      '<div class="set-sec"><h3 id="set-lang-h"></h3><div class="set-langs" id="set-langs"></div></div>'+
      '<div class="set-sec"><h3 id="set-email-h"></h3><div class="set-email-row"><input id="set-email" type="email"><button id="set-email-save"></button></div><div id="set-email-status"></div></div>'+
      '<div class="set-sec"><h3 id="set-bg-h"></h3><div class="set-themes" id="set-themes"></div></div>'+
    '</div>';
  document.body.appendChild(ov);

  // ---------- language buttons ----------
  const langsBox = ov.querySelector('#set-langs');
  LANGS.forEach(lg=>{
    const b = document.createElement('button');
    b.className = 'set-lang-btn'; b.dataset.lang = lg; b.textContent = NATIVE[lg];
    b.onclick = ()=> applyLanguage(lg);
    langsBox.appendChild(b);
  });

  // ---------- רקע: רק בהיר (לבן) או כהה (שחור) ----------
  const THEMES = [{ id:'light', icon:'☀️' }, { id:'dark', icon:'🌙' }];
  const themesBox = ov.querySelector('#set-themes');
  THEMES.forEach(th=>{
    const b = document.createElement('button');
    b.className = 'set-theme-btn'; b.dataset.theme = th.id;
    b.innerHTML = '<span>'+th.icon+'</span> <span class="set-theme-name"></span>';
    b.onclick = ()=> setTheme(th.id);
    themesBox.appendChild(b);
  });
  function setTheme(id){
    const dark = id === 'dark';
    document.body.classList.toggle('theme-dark', dark);
    save('theme', dark ? 'dark' : 'light');
    ov.querySelectorAll('.set-theme-btn').forEach(b=> b.classList.toggle('active', b.dataset.theme === (dark ? 'dark' : 'light')));
  }
  // עד 2026-10-28 אפשר היה לבחור כל צבע (נשמר ב-flrot:bg). מי שבחר אז צבע כהה עובר לכהה, כל השאר לבהיר.
  function isDarkColor(col){
    const probe = document.createElement('i');
    probe.style.color = col;
    document.body.appendChild(probe);
    const m = getComputedStyle(probe).color.match(/[\d.]+/g);
    probe.remove();
    if(!m || m.length < 3) return false;
    const L = (0.2126*m[0] + 0.7152*m[1] + 0.0722*m[2]) / 255;
    return L < 0.5;
  }

  // ---------- email ----------
  const emailInput = ov.querySelector('#set-email');
  const emailStatus = ov.querySelector('#set-email-status');
  emailInput.value = load('email') || '';
  ov.querySelector('#set-email-save').onclick = ()=>{
    save('email', emailInput.value.trim());
    emailStatus.textContent = t('saved');
    setTimeout(()=>{ emailStatus.textContent=''; }, 2500);
  };

  // ---------- open/close ----------
  gear.onclick = ()=> ov.classList.add('open');
  ov.querySelector('#set-close').onclick = ()=> ov.classList.remove('open');
  ov.onclick = e=>{ if(e.target===ov) ov.classList.remove('open'); };

  // ---------- apply language across the whole site ----------
  function updateSettingsLabels(){
    const setId = (id,val)=>{ const e=ov.querySelector(id); if(e) e.textContent=val; };
    setId('#set-title', t('settings'));
    setId('#set-lang-h', t('language'));
    setId('#set-email-h', t('email'));
    setId('#set-bg-h', t('bg'));
    setId('#set-email-save', t('save'));
    ov.querySelectorAll('.set-theme-name').forEach(n=>{ n.textContent = t('th_' + n.parentNode.dataset.theme); });
    emailInput.placeholder = t('emailPh');
  }

  function applyLanguage(lang){
    if(!LANGS.includes(lang)) lang='he';
    curLang = lang; save('lang', lang);
    const rtl = RTL.includes(lang);
    document.documentElement.setAttribute('dir', rtl?'rtl':'ltr');
    document.documentElement.lang = lang;
    document.body.style.direction = rtl?'rtl':'ltr';
    const set = (sel,val)=>{ const e=document.querySelector(sel); if(e) e.textContent=val; };
    set('.site-foot', t('builtBy')+' · Floating rotation 2026');
    document.querySelectorAll('.gcard').forEach(card=>{
      const gid = card.dataset.gid; if(!gid) return;
      const g = GAMES.find(x=>x.id===gid); if(!g) return;
      const h=card.querySelector('h3'), p=card.querySelector('.gbody p'), pl=card.querySelector('.gplay'), bd=card.querySelector('.gbadge');
      if(h) h.textContent = GTITLE[gid] ? t(GTITLE[gid]) : g.title;
      if(p) p.textContent = GDESC[gid] ? t(GDESC[gid]) : g.desc;
      if(pl) pl.textContent = g.soon ? t('soon') : t('play');
      if(bd) bd.textContent = badgeText(g);
    });
    updateSettingsLabels();
    ov.querySelectorAll('.set-lang-btn').forEach(b=> b.classList.toggle('active', b.dataset.lang===lang));
    // מודיעים לשאר האתר (אזור ההורדות) שהשפה השתנתה
    document.dispatchEvent(new CustomEvent('flrot:lang', { detail: lang }));
  }

  // ---------- init: restore saved prefs ----------
  let theme = load('theme');
  if(theme !== 'light' && theme !== 'dark'){
    const old = load('bg');
    theme = old && isDarkColor(old) ? 'dark' : 'light';
  }
  try{ localStorage.removeItem(LSK+'bg'); }catch(e){}
  setTheme(theme);
  applyLanguage(curLang);
})();
