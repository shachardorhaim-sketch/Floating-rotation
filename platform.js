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
  { id:'tetris', title:'3D Tetris', desc:'טטריס תלת-ממדי — סובב, הפל ונקה שורות!', imgFile:'tetris-logo.png', icon:'🟪', badge:'חדש!', bg:'linear-gradient(135deg,#2a1b4b,#0d1b2a)', mount:mountTetris },
  { id:'soon', title:'משחק לחימה', desc:'המשחק הגדול מ־Godot — בקרוב!', icon:'⚔️', badge:'SOON', bg:'linear-gradient(135deg,#4b2a1b,#0d1b2a)', soon:true },
];

const grid = document.getElementById('grid');
GAMES.forEach(g => {
  const card = document.createElement('div');
  card.className = 'gcard';
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
