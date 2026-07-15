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
  { id:'dino', title:'Dino Runner', desc:'רוץ, קפוץ, אסוף מטבעות וקנה דמויות בחנות.', icon:'🦖', badge:'ARCADE', bg:'linear-gradient(135deg,#1b3a4b,#0d1b2a)', mount:mountDino },
  { id:'catch', title:'Star Catcher', desc:'תפוס כוכבים נופלים עם הסלסלה.', icon:'⭐', badge:'CASUAL', bg:'linear-gradient(135deg,#2a1b4b,#0d1b2a)', mount:mountCatch },
  { id:'memory', title:'Memory Adjustment', desc:'7 שלבים, טיימר ומוזיקה — עד 32 קלפים!', icon:'🧠', badge:'PUZZLE', bg:'linear-gradient(135deg,#1b4b3a,#0d1b2a)', mount:mountMemory },
  { id:'button', title:'אל תלחץ על הכפתור', desc:'משחק כפתור כאוטי ומצחיק — נוצר על ידי רובין!', img:BUTTON_LOGO, icon:'🔴', badge:'רובין', bg:'linear-gradient(135deg,#4b1b2a,#0d1b2a)', url:'https://unique-flan-89080c.netlify.app/' },
  { id:'soon', title:'משחק לחימה', desc:'המשחק הגדול מ־Godot — בקרוב!', icon:'⚔️', badge:'SOON', bg:'linear-gradient(135deg,#4b2a1b,#0d1b2a)', soon:true },
];

const grid = document.getElementById('grid');
GAMES.forEach(g => {
  const card = document.createElement('div');
  card.className = 'gcard';
  card.tabIndex = 0;
  const thumbContent = g.img
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

// פתיחת משחק חיצוני (של רובין) — מנסה iframe, עם כפתור גיבוי לחלון חדש
function openExternal(g) {
  store.style.display = 'none';
  gameHost.style.display = 'flex';
  gameTitle.textContent = g.title;
  gameMount.innerHTML =
    '<div style="width:100%;height:100%;display:flex;flex-direction:column;gap:8px;align-items:center">' +
    '<iframe src="'+g.url+'" style="width:100%;flex:1;border:2px solid #2a3b4f;border-radius:10px;background:#fff" allow="autoplay"></iframe>' +
    '<a href="'+g.url+'" target="_blank" style="color:#4fd1c5;font-size:14px;text-decoration:none">🔗 לא נטען? פתח את המשחק בחלון חדש</a>' +
    '</div>';
  activeCleanup = () => { gameMount.innerHTML=''; };
}

// ============================================================
//  משחק 1 — DINO RUNNER (עם חנות דמויות + שיאים)
// ============================================================
