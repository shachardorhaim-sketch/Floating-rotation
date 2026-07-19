// ============================================
//  פלטפורמה — חנות וניווט
// ============================================

// ============================================================
//  Floating rotation — פלטפורמת משחקים
// ============================================================

// ---------- ניווט בין החנות למשחקים ----------
const store = document.getElementById('store');
const gameHost = document.getElementById('gameHost');
const gameMount = document.getElementById('gameMount');
const gameTitle = document.getElementById('gameTitle');
let activeCleanup = null;

function openGame(g) {
  store.style.display = 'none';
  gameHost.style.display = 'flex';
  gameTitle.textContent = g.title;
  gameMount.innerHTML = '';
  activeCleanup = g.mount(gameMount) || null;
}
function backToStore() {
  if (activeCleanup) activeCleanup();
  activeCleanup = null;
  gameMount.innerHTML = '';
  gameHost.style.display = 'none';
  store.style.display = 'block';
}
document.getElementById('backBtn').onclick = backToStore;

// ---------- קטלוג המשחקים בפלטפורמה ----------
const GAMES = [
  { id:'dino', title:'Dino Runner', desc:'רוץ, קפוץ, אסוף מטבעות וקנה דמויות בחנות.', imgFile:'dino-logo.png', icon:'🦖', badge:'ARCADE', bg:'linear-gradient(135deg,#1b3a4b,#0d1b2a)', mount:mountDino },
  { id:'catch', title:'Star Catcher', desc:'תפוס כוכבים נופלים עם הסלסלה.', imgFile:'star-logo.png', icon:'⭐', badge:'CASUAL', bg:'#161736', mount:mountCatch },
  { id:'memory', title:'Memory Adjustment', desc:'מצא את כל הזוגות — 7 שלבים נגד השעון.', imgFile:'memory-logo.png', icon:'🧠', badge:'PUZZLE', bg:'linear-gradient(135deg,#1b4b3a,#0d1b2a)', mount:mountMemory },
  { id:'button', title:'אל תלחץ על הכפתור', desc:'משחק כפתור כאוטי ומצחיק — נוצר על ידי רובין!', img:BUTTON_LOGO, icon:'🔴', badge:'רובין', bg:'linear-gradient(135deg,#4b1b2a,#0d1b2a)', url:'https://unique-flan-89080c.netlify.app/' },
  { id:'chess', title:'Chess Prestige', desc:'שחמט נגד המחשב או מול חבר.', imgFile:'chess-logo.png', icon:'♞', badge:'STRATEGY', bg:'#0a0a0a', mount:mountChess },
  { id:'tetris', title:'Tetris', desc:'טטריס תלת-ממדי — סובב, הפל ונקה שורות!', imgFile:'tetris-logo.png', icon:'🟪', badge:'חדש!', bg:'linear-gradient(135deg,#2a1b4b,#0d1b2a)', mount:mountTetris },
  { id:'soon', title:'משחק לחימה', desc:'המשחק הגדול מ־Godot — בקרוב!', icon:'⚔️', badge:'SOON', bg:'linear-gradient(135deg,#4b2a1b,#0d1b2a)', soon:true },
];

const grid = document.getElementById('grid');
GAMES.forEach(g => {
  const card = document.createElement('div');
  card.className = 'gcard';
  card.dataset.gid = g.id;
  card.tabIndex = 0;
  // תמיכה ב-3 סוגי תמונה: קובץ (imgFile), base64 (img), או אימוג'י (icon)
  const thumbContent = g.imgFile
    ? '<img src="'+g.imgFile+'" style="max-height:110px;max-width:90%"/>'
    : g.img
    ? '<img src="data:image/png;base64,'+g.img+'" style="max-height:110px;max-width:90%"/>'
    : '<span class="gicon">'+g.icon+'</span>';
  card.innerHTML =
    '<div class="gthumb" style="background:'+g.bg+'">'+thumbContent+'<span class="gbadge">'+g.badge+'</span></div>' +
    '<div class="gbody"><h3>'+g.title+'</h3><p>'+g.desc+'</p>' +
    '<button class="gplay'+(g.soon?' soon':'')+'">'+(g.soon?'בקרוב':'▶ שחק')+'</button></div>';
  if (!g.soon) {
    const open = () => { if (g.url) openExternal(g); else openGame(g); };
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
  const TR = {"he": {"tag": "פלטפורמת המשחקים שלי", "welcome": "ברוך הבא!", "subtitle": "אוסף המשחקים שלי — כולם נבנו כאן. בחר משחק ושחק!", "allGames": "כל המשחקים", "builtBy": "נבנה על ידי שחר דור-חיים ורובין שמואלי", "play": "▶ שחק", "soon": "בקרוב", "back": "← חזרה לחנות", "settings": "הגדרות", "language": "שפה", "email": "אימייל", "emailPh": "הכנס אימייל...", "save": "שמור", "saved": "נשמר! ✓", "bg": "צבע רקע", "reset": "איפוס", "close": "סגור", "arcade": "ארקייד", "casual": "קליל", "puzzle": "חידה", "strategy": "אסטרטגיה", "newb": "חדש!", "soonb": "בקרוב", "robin": "רובין", "dino": "רוץ, קפוץ, אסוף מטבעות וקנה דמויות בחנות.", "catch": "תפוס כוכבים נופלים עם הסלסלה.", "memory": "מצא את כל הזוגות — 7 שלבים נגד השעון.", "button": "משחק כפתור כאוטי ומצחיק — נוצר על ידי רובין!", "chess": "שחמט נגד המחשב או מול חבר.", "tetris": "טטריס תלת-ממדי — סובב, הפל ונקה שורות!", "fight": "המשחק הגדול מ־Godot — בקרוב!", "button_t": "אל תלחץ על הכפתור", "fight_t": "משחק לחימה", "t_dino": "ריצת דינוזאור", "t_catch": "תופס הכוכבים", "t_memory": "משחק הזיכרון", "t_chess": "שחמט", "t_tetris": "טטריס"}, "en": {"tag": "My games platform", "welcome": "Welcome!", "subtitle": "My games collection — all built right here. Pick a game and play!", "allGames": "All games", "builtBy": "Built by Shachar Dor-Haim & Robin Shmueli", "play": "▶ Play", "soon": "Soon", "back": "← Back to store", "settings": "Settings", "language": "Language", "email": "Email", "emailPh": "Enter email...", "save": "Save", "saved": "Saved! ✓", "bg": "Background color", "reset": "Reset", "close": "Close", "arcade": "ARCADE", "casual": "CASUAL", "puzzle": "PUZZLE", "strategy": "STRATEGY", "newb": "NEW!", "soonb": "SOON", "robin": "Robin", "dino": "Run, jump, collect coins and buy characters in the shop.", "catch": "Catch falling stars with the basket.", "memory": "Find all the pairs — 7 levels against the clock.", "button": "A chaotic, funny button game — made by Robin!", "chess": "Chess against the computer or a friend.", "tetris": "3D Tetris — rotate, drop and clear lines!", "fight": "The big game from Godot — coming soon!", "button_t": "Don't Press the Button", "fight_t": "Fighting Game", "t_dino": "Dino Runner", "t_catch": "Star Catcher", "t_memory": "Memory Adjustment", "t_chess": "Chess Prestige", "t_tetris": "Tetris"}, "ar": {"tag": "منصة ألعابي", "welcome": "أهلاً بك!", "subtitle": "مجموعة ألعابي — كلها بُنيت هنا. اختر لعبة والعب!", "allGames": "كل الألعاب", "builtBy": "بُني بواسطة شاحار دور-حاييم وروبين شموئيلي", "play": "▶ العب", "soon": "قريباً", "back": "← العودة إلى المتجر", "settings": "الإعدادات", "language": "اللغة", "email": "البريد الإلكتروني", "emailPh": "أدخل البريد الإلكتروني...", "save": "حفظ", "saved": "تم الحفظ! ✓", "bg": "لون الخلفية", "reset": "إعادة تعيين", "close": "إغلاق", "arcade": "أركيد", "casual": "عادي", "puzzle": "ألغاز", "strategy": "استراتيجية", "newb": "جديد!", "soonb": "قريباً", "robin": "روبين", "dino": "اركض واقفز واجمع العملات واشترِ الشخصيات في المتجر.", "catch": "التقط النجوم المتساقطة بالسلة.", "memory": "جد كل الأزواج — 7 مراحل ضد الساعة.", "button": "لعبة زر فوضوية ومضحكة — صنعها روبين!", "chess": "شطرنج ضد الكمبيوتر أو ضد صديق.", "tetris": "تتريس ثلاثي الأبعاد — دوّر وأسقط وامسح الصفوف!", "fight": "اللعبة الكبيرة من Godot — قريباً!", "button_t": "لا تضغط على الزر", "fight_t": "لعبة قتال", "t_dino": "عداء الديناصور", "t_catch": "صائد النجوم", "t_memory": "لعبة الذاكرة", "t_chess": "شطرنج", "t_tetris": "تتريس"}, "zh": {"tag": "我的游戏平台", "welcome": "欢迎!", "subtitle": "我的游戏合集——全部在这里制作。选一个游戏开始玩吧!", "allGames": "所有游戏", "builtBy": "由 Shachar Dor-Haim 和 Robin Shmueli 制作", "play": "▶ 开始", "soon": "即将推出", "back": "← 返回商店", "settings": "设置", "language": "语言", "email": "电子邮箱", "emailPh": "输入邮箱...", "save": "保存", "saved": "已保存! ✓", "bg": "背景颜色", "reset": "重置", "close": "关闭", "arcade": "街机", "casual": "休闲", "puzzle": "益智", "strategy": "策略", "newb": "新!", "soonb": "即将", "robin": "罗宾", "dino": "奔跑、跳跃、收集金币并在商店购买角色。", "catch": "用篮子接住落下的星星。", "memory": "找出所有配对——7 个关卡与时间赛跑。", "button": "一个混乱又搞笑的按钮游戏——由 Robin 制作!", "chess": "与电脑或朋友下国际象棋。", "tetris": "3D 俄罗斯方块——旋转、下落、消除行!", "fight": "来自 Godot 的大型游戏——即将推出!", "button_t": "别按那个按钮", "fight_t": "格斗游戏", "t_dino": "恐龙快跑", "t_catch": "接星星", "t_memory": "记忆游戏", "t_chess": "国际象棋", "t_tetris": "俄罗斯方块"}, "es": {"tag": "Mi plataforma de juegos", "welcome": "¡Bienvenido!", "subtitle": "Mi colección de juegos, todos creados aquí. ¡Elige un juego y juega!", "allGames": "Todos los juegos", "builtBy": "Creado por Shachar Dor-Haim y Robin Shmueli", "play": "▶ Jugar", "soon": "Pronto", "back": "← Volver a la tienda", "settings": "Ajustes", "language": "Idioma", "email": "Correo", "emailPh": "Introduce el correo...", "save": "Guardar", "saved": "¡Guardado! ✓", "bg": "Color de fondo", "reset": "Restablecer", "close": "Cerrar", "arcade": "ARCADE", "casual": "CASUAL", "puzzle": "PUZLE", "strategy": "ESTRATEGIA", "newb": "¡NUEVO!", "soonb": "PRONTO", "robin": "Robin", "dino": "Corre, salta, junta monedas y compra personajes en la tienda.", "catch": "Atrapa estrellas que caen con la cesta.", "memory": "Encuentra todas las parejas: 7 niveles contra el reloj.", "button": "Un juego de botón caótico y divertido, ¡creado por Robin!", "chess": "Ajedrez contra la computadora o un amigo.", "tetris": "Tetris 3D: ¡gira, suelta y elimina líneas!", "fight": "El gran juego de Godot: ¡muy pronto!", "button_t": "No Pulses el Botón", "fight_t": "Juego de Lucha", "t_dino": "Dino Corredor", "t_catch": "Cazaestrellas", "t_memory": "Juego de Memoria", "t_chess": "Ajedrez", "t_tetris": "Tetris"}, "fr": {"tag": "Ma plateforme de jeux", "welcome": "Bienvenue !", "subtitle": "Ma collection de jeux, tous créés ici. Choisis un jeu et joue !", "allGames": "Tous les jeux", "builtBy": "Créé par Shachar Dor-Haim et Robin Shmueli", "play": "▶ Jouer", "soon": "Bientôt", "back": "← Retour à la boutique", "settings": "Paramètres", "language": "Langue", "email": "E-mail", "emailPh": "Saisir l'e-mail...", "save": "Enregistrer", "saved": "Enregistré ! ✓", "bg": "Couleur de fond", "reset": "Réinitialiser", "close": "Fermer", "arcade": "ARCADE", "casual": "DÉTENTE", "puzzle": "PUZZLE", "strategy": "STRATÉGIE", "newb": "NOUVEAU !", "soonb": "BIENTÔT", "robin": "Robin", "dino": "Cours, saute, récolte des pièces et achète des personnages.", "catch": "Attrape les étoiles qui tombent avec le panier.", "memory": "Trouve toutes les paires — 7 niveaux contre la montre.", "button": "Un jeu de bouton chaotique et drôle — créé par Robin !", "chess": "Échecs contre l'ordinateur ou un ami.", "tetris": "Tetris 3D — tourne, lâche et efface des lignes !", "fight": "Le grand jeu de Godot — bientôt disponible !", "button_t": "N'appuie pas sur le Bouton", "fight_t": "Jeu de Combat", "t_dino": "Dino Runner", "t_catch": "Attrape-Étoiles", "t_memory": "Jeu de Mémoire", "t_chess": "Échecs", "t_tetris": "Tetris"}, "pt": {"tag": "Minha plataforma de jogos", "welcome": "Bem-vindo!", "subtitle": "Minha coleção de jogos, todos criados aqui. Escolha um jogo e jogue!", "allGames": "Todos os jogos", "builtBy": "Criado por Shachar Dor-Haim e Robin Shmueli", "play": "▶ Jogar", "soon": "Em breve", "back": "← Voltar à loja", "settings": "Configurações", "language": "Idioma", "email": "E-mail", "emailPh": "Digite o e-mail...", "save": "Salvar", "saved": "Salvo! ✓", "bg": "Cor de fundo", "reset": "Redefinir", "close": "Fechar", "arcade": "ARCADE", "casual": "CASUAL", "puzzle": "PUZZLE", "strategy": "ESTRATÉGIA", "newb": "NOVO!", "soonb": "EM BREVE", "robin": "Robin", "dino": "Corra, pule, junte moedas e compre personagens na loja.", "catch": "Pegue estrelas caindo com a cesta.", "memory": "Encontre todos os pares — 7 níveis contra o relógio.", "button": "Um jogo de botão caótico e engraçado — feito pelo Robin!", "chess": "Xadrez contra o computador ou um amigo.", "tetris": "Tetris 3D — gire, solte e limpe linhas!", "fight": "O grande jogo do Godot — em breve!", "button_t": "Não Aperte o Botão", "fight_t": "Jogo de Luta", "t_dino": "Dino Corredor", "t_catch": "Caça-Estrelas", "t_memory": "Jogo da Memória", "t_chess": "Xadrez", "t_tetris": "Tetris"}, "ru": {"tag": "Моя игровая платформа", "welcome": "Добро пожаловать!", "subtitle": "Моя коллекция игр — все созданы здесь. Выбери игру и играй!", "allGames": "Все игры", "builtBy": "Создано Шахаром Дор-Хаимом и Робином Шмуэли", "play": "▶ Играть", "soon": "Скоро", "back": "← Назад в магазин", "settings": "Настройки", "language": "Язык", "email": "Эл. почта", "emailPh": "Введите эл. почту...", "save": "Сохранить", "saved": "Сохранено! ✓", "bg": "Цвет фона", "reset": "Сброс", "close": "Закрыть", "arcade": "АРКАДА", "casual": "КЭЖУАЛ", "puzzle": "ГОЛОВОЛОМКА", "strategy": "СТРАТЕГИЯ", "newb": "НОВОЕ!", "soonb": "СКОРО", "robin": "Робин", "dino": "Беги, прыгай, собирай монеты и покупай персонажей в магазине.", "catch": "Лови падающие звёзды корзиной.", "memory": "Найди все пары — 7 уровней на время.", "button": "Хаотичная и смешная игра с кнопкой — создал Робин!", "chess": "Шахматы против компьютера или друга.", "tetris": "3D-тетрис — вращай, бросай и убирай линии!", "fight": "Большая игра на Godot — скоро!", "button_t": "Не нажимай на кнопку", "fight_t": "Файтинг", "t_dino": "Динобег", "t_catch": "Ловец звёзд", "t_memory": "Игра на память", "t_chess": "Шахматы", "t_tetris": "Тетрис"}, "de": {"tag": "Meine Spieleplattform", "welcome": "Willkommen!", "subtitle": "Meine Spielesammlung — alle hier gebaut. Wähle ein Spiel und spiele!", "allGames": "Alle Spiele", "builtBy": "Erstellt von Shachar Dor-Haim & Robin Shmueli", "play": "▶ Spielen", "soon": "Bald", "back": "← Zurück zum Shop", "settings": "Einstellungen", "language": "Sprache", "email": "E-Mail", "emailPh": "E-Mail eingeben...", "save": "Speichern", "saved": "Gespeichert! ✓", "bg": "Hintergrundfarbe", "reset": "Zurücksetzen", "close": "Schließen", "arcade": "ARCADE", "casual": "CASUAL", "puzzle": "PUZZLE", "strategy": "STRATEGIE", "newb": "NEU!", "soonb": "BALD", "robin": "Robin", "dino": "Lauf, spring, sammle Münzen und kaufe Figuren im Shop.", "catch": "Fang fallende Sterne mit dem Korb.", "memory": "Finde alle Paare — 7 Level gegen die Uhr.", "button": "Ein chaotisches, lustiges Knopf-Spiel — von Robin erstellt!", "chess": "Schach gegen den Computer oder einen Freund.", "tetris": "3D-Tetris — drehen, fallen lassen und Reihen löschen!", "fight": "Das große Godot-Spiel — bald verfügbar!", "button_t": "Drück nicht den Knopf", "fight_t": "Kampfspiel", "t_dino": "Dino-Läufer", "t_catch": "Sternenfänger", "t_memory": "Gedächtnisspiel", "t_chess": "Schach", "t_tetris": "Tetris"}};
  const NATIVE = {"he": "עברית", "en": "English", "ar": "العربية", "zh": "中文", "es": "Español", "fr": "Français", "pt": "Português", "ru": "Русский", "de": "Deutsch"};
  const LANGS = ["he", "en", "ar", "zh", "es", "fr", "pt", "ru", "de"];
  const RTL = ['he','ar'];
  const BADGE = {'ARCADE':'arcade','CASUAL':'casual','PUZZLE':'puzzle','STRATEGY':'strategy','חדש!':'newb','SOON':'soonb','רובין':'robin'};
  const GTITLE = {dino:'t_dino', catch:'t_catch', memory:'t_memory', chess:'t_chess', tetris:'t_tetris', button:'button_t', soon:'fight_t'};
  const GDESC = {dino:'dino', catch:'catch', memory:'memory', button:'button', chess:'chess', tetris:'tetris', soon:'fight'};
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
    '.set-lang-btn{background:#172230;border:1px solid #2a3b4f;color:#e8eef5;padding:11px 8px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;transition:.12s;}'+
    '.set-lang-btn:hover{border-color:#4fd1c5;}'+
    '.set-lang-btn.active{background:#4fd1c5;color:#0d1620;border-color:#4fd1c5;}'+
    '.set-email-row{display:flex;gap:8px;flex-wrap:wrap;}'+
    '#set-email{flex:1;min-width:160px;background:#172230;border:1px solid #2a3b4f;color:#e8eef5;padding:11px;border-radius:8px;font-family:inherit;font-size:15px;}'+
    '#set-email-save{background:#ffd166;color:#0d1620;border:none;padding:11px 18px;border-radius:8px;font-weight:800;cursor:pointer;font-family:inherit;}'+
    '#set-email-status{color:#4fd1c5;font-size:13px;margin-top:6px;min-height:16px;}'+
    '.set-colors{display:grid;grid-template-columns:repeat(auto-fill,minmax(30px,1fr));gap:6px;max-height:220px;overflow-y:auto;padding:6px;background:rgba(0,0,0,0.22);border-radius:8px;}'+
    '.set-sw{aspect-ratio:1;border:2px solid transparent;border-radius:6px;cursor:pointer;padding:0;}'+
    '.set-sw:hover{transform:scale(1.12);}'+
    '.set-sw.active{border-color:#fff;box-shadow:0 0 0 2px #4fd1c5;}'+
    '#set-reset{margin-top:10px;background:#2a3b4f;color:#e8eef5;border:none;padding:9px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:600;}';
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
      '<div class="set-sec"><h3 id="set-bg-h"></h3><div class="set-colors" id="set-colors"></div><button id="set-reset"></button></div>'+
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

  // ---------- color swatches (130+) ----------
  const colorsBox = ov.querySelector('#set-colors');
  const COLORS = [];
  for(let l=24; l<=82; l+=19){                 // 4 brightness rows
    for(let h=0; h<360; h+=12){                 // 30 hues per row = 120
      COLORS.push('hsl('+h+','+(l<45?48:64)+'%,'+l+'%)');
    }
  }
  for(let g=12; g<=246; g+=18) COLORS.push('rgb('+g+','+g+','+g+')');  // grayscale ~14
  COLORS.forEach(col=>{
    const sw = document.createElement('button');
    sw.className = 'set-sw'; sw.style.background = col; sw.dataset.col = col;
    sw.onclick = ()=> setBg(col);
    colorsBox.appendChild(sw);
  });

  function setBg(col){
    document.body.style.background = col;
    save('bg', col);
    ov.querySelectorAll('.set-sw').forEach(s=> s.classList.toggle('active', s.dataset.col===col));
  }
  function resetBg(){
    document.body.style.background = '';
    save('bg', '');
    ov.querySelectorAll('.set-sw').forEach(s=> s.classList.remove('active'));
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
  ov.querySelector('#set-reset').onclick = resetBg;

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
    setId('#set-reset', t('reset'));
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
    set('.hero .tag', t('tag'));
    set('.hero h1', t('welcome'));
    set('.hero p', t('subtitle'));
    set('.section-title', t('allGames'));
    set('.site-foot', t('builtBy')+' · Floating rotation 2026');
    const back = document.getElementById('backBtn'); if(back) back.textContent = t('back');
    document.querySelectorAll('.gcard').forEach(card=>{
      const gid = card.dataset.gid; if(!gid) return;
      const g = GAMES.find(x=>x.id===gid); if(!g) return;
      const h=card.querySelector('h3'), p=card.querySelector('.gbody p'), pl=card.querySelector('.gplay'), bd=card.querySelector('.gbadge');
      if(h) h.textContent = GTITLE[gid] ? t(GTITLE[gid]) : g.title;
      if(p) p.textContent = GDESC[gid] ? t(GDESC[gid]) : g.desc;
      if(pl) pl.textContent = g.soon ? t('soon') : t('play');
      if(bd) bd.textContent = BADGE[g.badge] ? t(BADGE[g.badge]) : g.badge;
    });
    updateSettingsLabels();
    ov.querySelectorAll('.set-lang-btn').forEach(b=> b.classList.toggle('active', b.dataset.lang===lang));
  }

  // ---------- init: restore saved prefs ----------
  const savedBg = load('bg');
  if(savedBg){ document.body.style.background = savedBg; ov.querySelectorAll('.set-sw').forEach(s=> s.classList.toggle('active', s.dataset.col===savedBg)); }
  applyLanguage(curLang);
})();
