// ============================================
//  משחק: DINO RUNNER
//  דינוזאור שמצויר בקוד · מטבעות ושיא מטבעות · טבלת שיאים
// ============================================

const DDICT = {"he":{"hint":"רווח / ↑ = קפיצה (החזק = גבוה יותר) • ↓ = התכופפות<br>ציפור גבוהה: רוץ מתחת · אמצע: קפוץ או התכופף · נמוכה: קפוץ מעל<br>אסוף מטבעות ושבור את שיא המטבעות שלך","jump":"⬆ קפיצה","duck":"⬇ התכופפות","board":"טבלת שיאים","empty":"עדיין אין שיאים — שחק כדי להתחיל!","colScore":"ניקוד","startPrompt":"רווח / ↑ להתחלה","dead":"נפסלת!","scorePrefix":"ניקוד ","bestPrefix":"השיא שלך: ","againPrompt":"רווח לשחק שוב","coinBest":"שיא מטבעות","coinsPrefix":"מטבעות: ","newCoinBest":"שיא מטבעות חדש!","sound":"צליל"},"en":{"hint":"Space / ↑ = jump (hold = higher) • ↓ = duck<br>High bird: run under · Middle: jump or duck · Low: jump over<br>Collect coins and beat your coin record","jump":"⬆ Jump","duck":"⬇ Duck","board":"Leaderboard","empty":"No scores yet — play to get started!","colScore":"Score","startPrompt":"Space / ↑ to start","dead":"Game Over!","scorePrefix":"Score ","bestPrefix":"Your best: ","againPrompt":"Space to play again","coinBest":"Coin record","coinsPrefix":"Coins: ","newCoinBest":"New coin record!","sound":"Sound"},"ar":{"hint":"مسافة / ↑ = قفز (اضغط مطولاً = أعلى) • ↓ = انحناء<br>طائر عالٍ: اركض تحته · متوسط: اقفز أو انحنِ · منخفض: اقفز فوقه<br>اجمع العملات واكسر رقمك القياسي","jump":"⬆ قفز","duck":"⬇ انحناء","board":"لوحة المتصدرين","empty":"لا توجد نتائج بعد — العب للبدء!","colScore":"النقاط","startPrompt":"مسافة / ↑ للبدء","dead":"خسرت!","scorePrefix":"النقاط ","bestPrefix":"أفضل نتيجة: ","againPrompt":"مسافة للعب مجدداً","coinBest":"رقم العملات القياسي","coinsPrefix":"العملات: ","newCoinBest":"رقم قياسي جديد للعملات!","sound":"الصوت"},"es":{"hint":"Espacio / ↑ = saltar (mantén = más alto) • ↓ = agacharse<br>Pájaro alto: corre por debajo · Medio: salta o agáchate · Bajo: salta por encima<br>Junta monedas y supera tu récord de monedas","jump":"⬆ Saltar","duck":"⬇ Agacharse","board":"Clasificación","empty":"Aún no hay puntuaciones: ¡juega para empezar!","colScore":"Puntos","startPrompt":"Espacio / ↑ para empezar","dead":"¡Perdiste!","scorePrefix":"Puntos ","bestPrefix":"Tu récord: ","againPrompt":"Espacio para jugar otra vez","coinBest":"Récord de monedas","coinsPrefix":"Monedas: ","newCoinBest":"¡Nuevo récord de monedas!","sound":"Sonido"},"fr":{"hint":"Espace / ↑ = sauter (maintenir = plus haut) • ↓ = se baisser<br>Oiseau haut : passe dessous · Milieu : saute ou baisse-toi · Bas : saute par-dessus<br>Récolte des pièces et bats ton record de pièces","jump":"⬆ Sauter","duck":"⬇ Se baisser","board":"Classement","empty":"Pas encore de scores — joue pour commencer !","colScore":"Score","startPrompt":"Espace / ↑ pour commencer","dead":"Perdu !","scorePrefix":"Score ","bestPrefix":"Ton record : ","againPrompt":"Espace pour rejouer","coinBest":"Record de pièces","coinsPrefix":"Pièces : ","newCoinBest":"Nouveau record de pièces !","sound":"Son"},"pt":{"hint":"Espaço / ↑ = pular (segure = mais alto) • ↓ = agachar<br>Pássaro alto: corra por baixo · Meio: pule ou agache · Baixo: pule por cima<br>Junte moedas e bata seu recorde de moedas","jump":"⬆ Pular","duck":"⬇ Agachar","board":"Ranking","empty":"Ainda sem pontuações — jogue para começar!","colScore":"Pontos","startPrompt":"Espaço / ↑ para começar","dead":"Você perdeu!","scorePrefix":"Pontos ","bestPrefix":"Seu recorde: ","againPrompt":"Espaço para jogar de novo","coinBest":"Recorde de moedas","coinsPrefix":"Moedas: ","newCoinBest":"Novo recorde de moedas!","sound":"Som"},"ru":{"hint":"Пробел / ↑ = прыжок (удерживай = выше) • ↓ = пригнуться<br>Высокая птица: беги под ней · Средняя: прыгай или пригнись · Низкая: перепрыгни<br>Собирай монеты и побей свой рекорд монет","jump":"⬆ Прыжок","duck":"⬇ Пригнуться","board":"Таблица рекордов","empty":"Пока нет рекордов — сыграй, чтобы начать!","colScore":"Очки","startPrompt":"Пробел / ↑ для старта","dead":"Проигрыш!","scorePrefix":"Очки ","bestPrefix":"Твой рекорд: ","againPrompt":"Пробел, чтобы сыграть снова","coinBest":"Рекорд монет","coinsPrefix":"Монеты: ","newCoinBest":"Новый рекорд монет!","sound":"Звук"},"de":{"hint":"Leertaste / ↑ = springen (halten = höher) • ↓ = ducken<br>Hoher Vogel: drunter durch · Mitte: springen oder ducken · Tief: drüber springen<br>Sammle Münzen und knack deinen Münzrekord","jump":"⬆ Springen","duck":"⬇ Ducken","board":"Bestenliste","empty":"Noch keine Punkte — spiel, um zu starten!","colScore":"Punkte","startPrompt":"Leertaste / ↑ zum Start","dead":"Vorbei!","scorePrefix":"Punkte ","bestPrefix":"Dein Rekord: ","againPrompt":"Leertaste für nochmal","coinBest":"Münzrekord","coinsPrefix":"Münzen: ","newCoinBest":"Neuer Münzrekord!","sound":"Ton"}};
function dinoMakeT(){ let l='he'; try{ var _p=localStorage.getItem('flrot:lang'); if(_p) l=_p; }catch(e){} if(!DDICT[l]) l='he'; return { DT:k=>(DDICT[l]&&DDICT[l][k])||DDICT['he'][k]||k, DRTL:(l==='he'||l==='ar') }; }
function DINO_HTML(DT,DRTL){ return `
<div class="dinoWrap" style="direction:${DRTL?'rtl':'ltr'};">
  <div class="dinoTop"><span class="dinoTitle">DINO RUNNER</span><span id="dinoCoinBest" style="display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:#ffd166;"></span><button id="dinoSound" type="button" tabindex="-1" title="${DT('sound')} (M)" aria-label="${DT('sound')}" style="width:30px;height:30px;padding:0;border:1px solid #2a3b4f;border-radius:50%;background:#141d28;font-size:15px;line-height:1;cursor:pointer;"></button></div>
  <div class="dinoStage">
    <canvas id="dc" width="820" height="300"></canvas>
  </div>
  <div class="dinoHint">${DT('hint')}</div>
  <div class="dinoTouch">
    <button id="dinoJumpBtn" style="flex:1;padding:16px 0;font-size:17px;font-weight:700;color:#fff;border:none;border-radius:14px;background:linear-gradient(90deg,#2f8f52,#57c97e);box-shadow:0 4px 16px rgba(47,143,82,.4);cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;">${DT('jump')}</button>
    <button id="dinoDuckBtn" style="flex:1;padding:16px 0;font-size:17px;font-weight:700;color:#fff;border:none;border-radius:14px;background:linear-gradient(90deg,#3a6ea5,#5a9bd4);box-shadow:0 4px 16px rgba(58,110,165,.4);cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;">${DT('duck')}</button>
  </div>
  <div id="board"><h3>&#127942; ${DT('board')}</h3><div id="boardRows"></div></div>
</div>
`; }

// ---------- הדינוזאור: עצמות שמצוירות בקוד, בלי תמונות ----------
// התנוחה מחושבת בכל ציור, אז כף הרגל דורכת על הקרקע בקצב של העולם והקפיצה עוברת בין תנוחות.
// הראשית היא הקרקע שמתחת לאגן: x קדימה, y למטה. בריצה הוא בגובה של כ-66 פיקסלים.
const DINO_COL = { line:'#0c1a0e', green:'#62c232', shade:'#129a3e', far:'#2c8f37', blue:'#0c63d8', blueHi:'#3f8ff0', cream:'#f4e4b4', tan:'#cfae62', mouth:'#7d1518', tongue:'#d9302e', tooth:'#fffdf2', claw:'#f6f0df', iris:'#1c6fe0' };

// body/neck/head: זוויות במעלות (חיובי = האף למעלה). tail: חיובי = הזנב יורד. hip: גובה האגן.
const DINO_POSES = {
  run:  { body:20, neck:56, head:-2,  jaw:9,  tail:0,   curl:7,  armU:58, armF:12,  hip:33, nl:1 },
  duck: { body:3,  neck:20, head:-4,  jaw:12, tail:-3,  curl:4,  armU:72, armF:18,  hip:19, nl:0.45 },
  idle: { body:32, neck:62, head:-6,  jaw:5,  tail:4,   curl:9,  armU:62, armF:14,  hip:36, nl:1 },
  rise: { body:36, neck:66, head:10,  jaw:16, tail:14,  curl:5,  armU:44, armF:-8,  hip:33, nl:1 },
  apex: { body:25, neck:58, head:2,   jaw:24, tail:0,   curl:8,  armU:52, armF:0,   hip:33, nl:1 },
  fall: { body:8,  neck:44, head:-12, jaw:20, tail:-13, curl:8,  armU:78, armF:10,  hip:33, nl:1 },
  dead: { body:28, neck:70, head:20,  jaw:32, tail:10,  curl:5,  armU:40, armF:-6,  hip:30, nl:1 }
};
// כפות הרגליים באוויר, ביחס לאגן: [x, y, זווית הכף, נטיית האצבעות]. lead היא הרגל שמובילה את הקפיצה.
const DINO_AIR_FEET = {
  rise: { lead:[15,20,72,38], trail:[-15,33,125,42] },
  apex: { lead:[14,22,70,25], trail:[-2,24,98,48] },
  fall: { lead:[13,33,60,0],  trail:[-6,30,72,14] }
};

function dinoMix(a,b,t){ const o={}; for (const k in a) o[k]=a[k]+(b[k]-a[k])*t; return o; }
function dinoL(a,b,t){ return a+(b-a)*t; }

// מיקום כף הרגל ביחס לאגן. i: 0 הקרובה, 1 הרחוקה.
function dinoFoot(i,a,hipY){
  const beta = Math.min(0.44, 44/a.stride), R = a.stride*beta/2*(1-a.duck*0.25);
  const lift = (13+a.speedK*6)*(1-a.duck*0.35);
  const p = (a.phi+i*0.5)%1;
  let x,y,g,d;
  if (p < beta) { const s=p/beta; x=R-2*R*s; y=0; g=58+64*s; d=0; }
  else {
    const s=(p-beta)/(1-beta), e=s*s*(3-2*s);
    x=-R+2*R*e;
    y=-lift*Math.sin(Math.PI*s)*(1+0.35*Math.cos(Math.PI*s));
    g=s<0.5 ? 122+56*s : 178-120*s;
    d=62*Math.sin(Math.PI*Math.min(1,s*1.15));
  }
  // בהתכופפות הכף שוכבת, אחרת הברך הצפופה בולטת מעל הגב
  x-=a.duck*5; g=dinoL(g,g*0.4+6,a.duck);
  // עמידה: שתי הרגליים נטועות
  x=dinoL(x+2, i?9:-5, a.idle); y=dinoL(y, 0, a.idle); g=dinoL(g,70,a.idle); d=dinoL(d,0,a.idle);
  let rx=x, ry=y-3-hipY;
  if (a.air > 0) {
    const role = i===a.lead ? 'lead' : 'trail', nv=Math.max(-1,Math.min(1,a.nv));
    const A=DINO_AIR_FEET.apex[role], B=nv<0?DINO_AIR_FEET.rise[role]:DINO_AIR_FEET.fall[role], k=Math.abs(nv);
    rx=dinoL(rx, dinoL(A[0],B[0],k), a.air);
    ry=dinoL(ry, dinoL(A[1],B[1],k), a.air);
    g=dinoL(g, dinoL(A[2],B[2],k), a.air);
    d=dinoL(d, dinoL(A[3],B[3],k), a.air);
  }
  return { x:rx, y:ry, g, d };
}

function dinoLeg(hx,hy,f,hipY){
  const TH=16, SH=14.5, MT=10.5, rad=Math.PI/180;
  let ax=f.x-MT*Math.cos(f.g*rad), ay=hipY+f.y-MT*Math.sin(f.g*rad);
  const bx0=f.x-ax, by0=hipY+f.y-ay;
  let dx=ax-hx, dy=ay-hy, dist=Math.hypot(dx,dy);
  const reach=TH+SH-0.05;
  if (dist>reach) { ax=hx+dx/dist*reach; ay=hy+dy/dist*reach; dx=ax-hx; dy=ay-hy; dist=reach; }
  if (dist<1) dist=1;
  const ca=(TH*TH+dist*dist-SH*SH)/(2*TH*dist), sa=Math.sqrt(Math.max(0,1-ca*ca));
  const ux=dx/dist, uy=dy/dist;
  return { hx,hy, kx:hx+TH*(ux*ca+uy*sa), ky:hy+TH*(uy*ca-ux*sa), ax,ay, bx:ax+bx0, by:ay+by0, d:f.d };
}

function dinoCaps(c,pts,w){
  for (let i=0;i<pts.length-1;i++) {
    const p=pts[i], q=pts[i+1], ang=Math.atan2(q[1]-p[1],q[0]-p[0]), nx=-Math.sin(ang), ny=Math.cos(ang);
    c.beginPath();
    c.moveTo(p[0]+nx*p[2],p[1]+ny*p[2]);
    c.lineTo(q[0]+nx*q[2],q[1]+ny*q[2]);
    c.arc(q[0],q[1],q[2],ang+Math.PI/2,ang-Math.PI/2,true);
    c.lineTo(p[0]-nx*p[2],p[1]-ny*p[2]);
    c.arc(p[0],p[1],p[2],ang-Math.PI/2,ang+Math.PI/2,true);
    c.closePath();
    if (w) c.stroke(); else c.fill();
  }
}

function dinoDrawLeg(c,L,col,stripes){
  const C=DINO_COL, rad=Math.PI/180, d=L.d*rad;
  const tx=L.bx+7*Math.cos(d), ty=L.by+7*Math.sin(d);
  const pts=[[L.hx,L.hy,8.2],[L.kx,L.ky,4.8],[L.ax,L.ay,2.9],[L.bx,L.by,2.5],[tx,ty,2]];
  c.lineJoin='round'; c.strokeStyle=C.line; c.lineWidth=2.6; dinoCaps(c,pts,true);
  // טפרים
  c.lineWidth=0.7; c.fillStyle=C.claw;
  for (let n=0;n<3;n++) {
    const f=2.8+n*2.5, x=L.bx+f*Math.cos(d), y=L.by+f*Math.sin(d), a=d+0.5;
    c.beginPath();
    c.moveTo(x-1.7*Math.cos(d),y-1.7*Math.sin(d)+0.6);
    c.lineTo(x+1.7*Math.cos(d),y+1.7*Math.sin(d)+0.6);
    c.lineTo(x+4.4*Math.cos(a),y+0.6+4.4*Math.sin(a));
    c.closePath(); c.stroke(); c.fill();
  }
  c.fillStyle=col; dinoCaps(c,pts,false);
  if (stripes) {
    const ang=Math.atan2(L.ky-L.hy,L.kx-L.hx);
    c.save(); c.translate(L.hx,L.hy); c.rotate(ang);
    c.strokeStyle=C.blue; c.lineWidth=1.5; c.lineCap='round';
    for (let n=0;n<3;n++) { const u=3+n*3.6, r=6.2-n*0.8; c.beginPath(); c.moveTo(u+1.2,-r); c.quadraticCurveTo(u-1.4,0,u+1.2,r); c.stroke(); }
    c.restore();
  }
}

function dinoDrawArm(c,sx,sy,U,F,col){
  const rad=Math.PI/180, ex=sx+5.2*Math.sin(U*rad), ey=sy+5.2*Math.cos(U*rad), wx=ex+5*Math.cos(F*rad), wy=ey+5*Math.sin(F*rad);
  const pts=[[sx,sy,2.6],[ex,ey,2],[wx,wy,1.7]];
  c.strokeStyle=DINO_COL.line; c.lineWidth=2.4; dinoCaps(c,pts,true);
  c.lineWidth=1; c.lineCap='round';
  for (let n=-1;n<=1;n+=2) { const a=(F+40+n*18)*rad; c.beginPath(); c.moveTo(wx,wy); c.lineTo(wx+3*Math.cos(a),wy+3*Math.sin(a)); c.stroke(); }
  c.fillStyle=col; dinoCaps(c,pts,false);
}

function dinoDrawHead(c,jawDeg,blink,dead){
  const C=DINO_COL, rad=Math.PI/180;
  c.save(); c.scale(0.96,0.96); c.lineJoin='round'; c.lineCap='round';
  const skull=()=>{
    c.beginPath(); c.moveTo(-7,-6);
    c.bezierCurveTo(-4,-12,3,-14.5,9,-13.5);
    c.bezierCurveTo(14,-12.5,17,-9.5,21,-9);
    c.bezierCurveTo(26,-9.5,31,-9.5,33,-6.5);
    c.bezierCurveTo(34.5,-4,33.5,-1,30.5,-0.5);
    c.lineTo(9,2);
    c.bezierCurveTo(4,3.5,0,6,-2,8);
    c.bezierCurveTo(-6,6,-8,0,-7,-6);
    c.closePath();
  };
  // כתר על הראש
  c.strokeStyle=C.line; c.lineWidth=1.5; c.fillStyle=C.blue;
  [[-5,-9.5,3.4],[1.5,-13,3.8],[8,-13.2,3.4]].forEach(p=>{
    c.beginPath(); c.moveTo(p[0]-p[2],p[1]+1.5); c.lineTo(p[0]-p[2]*0.45,p[1]-p[2]*1.25); c.lineTo(p[0]+p[2]*0.9,p[1]-p[2]*0.75); c.lineTo(p[0]+p[2],p[1]+1.5); c.closePath(); c.stroke(); c.fill();
  });
  // פנים הפה
  const jx=2, jy=3, ja=jawDeg*rad, tipx=jx+26*Math.cos(ja)-0.5*Math.sin(ja), tipy=jy+26*Math.sin(ja)+0.5*Math.cos(ja);
  c.fillStyle=C.mouth; c.beginPath(); c.moveTo(jx,jy); c.lineTo(tipx,tipy); c.lineTo(30,-0.5); c.lineTo(9,2); c.closePath(); c.fill();
  // הלסת התחתונה
  c.save(); c.translate(jx,jy); c.rotate(ja);
  c.fillStyle=C.tongue; c.beginPath(); c.ellipse(13,-0.4,9,2.1,0,0,7); c.fill();
  c.fillStyle=C.tooth; c.strokeStyle=C.line; c.lineWidth=0.5;
  [9,14,19,23.5].forEach(x=>{ c.beginPath(); c.moveTo(x-1.4,1); c.lineTo(x,-2.8); c.lineTo(x+1.4,1); c.closePath(); c.stroke(); c.fill(); });
  c.beginPath(); c.moveTo(-3,0); c.lineTo(6,1); c.lineTo(26,0.5);
  c.bezierCurveTo(28.5,1,28.5,4,26,5.5);
  c.bezierCurveTo(18,8.5,8,9.5,1,8.5);
  c.bezierCurveTo(-3,7.5,-5,3,-3,0);
  c.closePath();
  c.strokeStyle=C.line; c.lineWidth=1.5; c.fillStyle=C.cream; c.stroke(); c.fill();
  c.restore();
  // שיניים עליונות
  c.fillStyle=C.tooth; c.strokeStyle=C.line; c.lineWidth=0.5;
  [[11.5,1.7],[16,1.2],[20.5,0.7],[25,0.2],[28.6,-0.2]].forEach(p=>{ c.beginPath(); c.moveTo(p[0]-1.5,p[1]-1); c.lineTo(p[0],p[1]+3.3); c.lineTo(p[0]+1.5,p[1]-1); c.closePath(); c.stroke(); c.fill(); });
  // הגולגולת
  skull(); c.strokeStyle=C.line; c.lineWidth=2.2; c.stroke(); c.fillStyle=C.green; c.fill();
  c.save(); skull(); c.clip();
  c.fillStyle=C.blue; c.beginPath(); c.moveTo(-10,-18); c.lineTo(16,-18); c.lineTo(13,-11.2); c.lineTo(5,-10.6); c.lineTo(-1,-7); c.lineTo(-9,-1); c.closePath(); c.fill();
  c.fillStyle=C.shade; c.beginPath(); c.moveTo(-8,8); c.lineTo(8,1.6); c.lineTo(31,-2.6); c.lineTo(31,1); c.lineTo(8,4); c.closePath(); c.fill();
  c.restore();
  skull(); c.strokeStyle=C.line; c.lineWidth=1.1; c.stroke();
  // העין
  if (dead) {
    c.strokeStyle=C.line; c.lineWidth=1.7;
    c.beginPath(); c.moveTo(4.5,-9.8); c.lineTo(10.5,-4.8); c.moveTo(10.5,-9.8); c.lineTo(4.5,-4.8); c.stroke();
  } else {
    c.fillStyle='#fff'; c.strokeStyle=C.line; c.lineWidth=1; c.beginPath(); c.ellipse(7.5,-7.2,4.3,3.9,0,0,7); c.stroke(); c.fill();
    c.fillStyle=C.iris; c.beginPath(); c.arc(8.6,-7,2.7,0,7); c.fill();
    c.fillStyle='#071022'; c.beginPath(); c.arc(9.1,-7,1.45,0,7); c.fill();
    c.fillStyle='#fff'; c.beginPath(); c.arc(8.2,-8,0.75,0,7); c.fill();
    if (blink) { c.fillStyle=C.green; c.beginPath(); c.ellipse(7.5,-7.2,4.5,4.1,0,0,7); c.fill(); c.strokeStyle=C.line; c.beginPath(); c.moveTo(3.3,-7); c.lineTo(11.8,-7); c.stroke(); }
    c.strokeStyle=C.line; c.lineWidth=1.9; c.beginPath(); c.moveTo(2.2,-11.6); c.lineTo(12.6,-8.2); c.stroke();
  }
  c.fillStyle=C.line; c.beginPath(); c.arc(29.2,-6,1,0,7); c.fill();
  c.restore();
}

// a: { phi, stride, speedK, air, nv, lead, duck, land, idle, dead, t }
function dinoDraw(c,x,y,a){
  const C=DINO_COL, rad=Math.PI/180, TAU=Math.PI*2, P=DINO_POSES;
  let q=dinoMix(dinoMix(P.run,P.duck,a.duck),P.idle,a.idle);
  if (a.air>0) {
    const nv=Math.max(-1,Math.min(1,a.nv));
    q=dinoMix(q, nv<0?dinoMix(P.apex,P.rise,-nv):dinoMix(P.apex,P.fall,nv), a.air);
  }
  if (a.dead>0) q=dinoMix(q,P.dead,a.dead);

  const moving=(1-a.idle)*(1-a.air)*(1-a.dead), beta=Math.min(0.44,44/a.stride), s2=Math.sin(TAU*2*a.phi);
  // מלמעלה למטה פעמיים במחזור, והגוף נמוך הכי הרבה כשכף רגל מתחת לאגן
  const bob=moving*(2+a.speedK*1.5)*Math.cos(TAU*2*(a.phi-beta/2));
  const breathe=a.idle*Math.sin(a.t*0.07)*0.8;
  const hipY=-q.hip+bob+breathe+a.land*7;
  const body=q.body+moving*1.6*s2, neck=q.neck-moving*2*s2, head=q.head+moving*2.4*s2;
  const jaw=q.jaw+moving*3*Math.sin(TAU*a.phi*2+1)+a.idle*Math.sin(a.t*0.05)*1.5;

  // הזנב נבנה מהאגן אחורה
  const tailL=[10,10,9.5,9,8.5], pts=[[0,hipY]];
  let px=0, py=hipY;
  for (let i=0;i<5;i++) {
    const wave=moving*(2.5+i*2.4)*Math.sin(TAU*(a.phi*2-i*0.13))+a.idle*(i*1.3)*Math.sin(a.t*0.05-i*0.5)+a.air*(i*0.8)*Math.sin(a.t*0.2-i*0.5);
    const th=(180+q.body*0.7+q.tail-i*q.curl+wave)*rad;
    px+=tailL[i]*Math.cos(th); py-=tailL[i]*Math.sin(th);
    pts.unshift([px,py]);
  }
  const fwd=(len,deg)=>{ const l=pts[pts.length-1]; pts.push([l[0]+len*Math.cos(deg*rad),l[1]-len*Math.sin(deg*rad)]); };
  fwd(12,body); fwd(12,body+4); fwd(8*q.nl,(body+neck)/2); fwd(8*q.nl,neck);
  const radii=[0.7,2.4,4.2,6.2,8.6,11.6,12.6,11,8.4,7.4];

  // דגימה חלקה של הצינור זנב-גוף-צוואר
  const crom=(a0,a1,a2,a3,t)=>{ const t2=t*t,t3=t2*t; return 0.5*(2*a1+(a2-a0)*t+(2*a0-5*a1+4*a2-a3)*t2+(3*a1-a0-3*a2+a3)*t3); };
  const SX=[],SY=[],SR=[], N=pts.length;
  for (let i=0;i<N-1;i++) {
    const i0=Math.max(0,i-1), i3=Math.min(N-1,i+2);
    for (let k=0;k<4;k++) {
      const t=k/4;
      SX.push(crom(pts[i0][0],pts[i][0],pts[i+1][0],pts[i3][0],t));
      SY.push(crom(pts[i0][1],pts[i][1],pts[i+1][1],pts[i3][1],t));
      SR.push(radii[i]+(radii[i+1]-radii[i])*t);
    }
  }
  SX.push(pts[N-1][0]); SY.push(pts[N-1][1]); SR.push(radii[N-1]);
  const M=SX.length, NX=new Array(M), NY=new Array(M);
  for (let k=0;k<M;k++) {
    const a0=Math.max(0,k-1), a1=Math.min(M-1,k+1), tx=SX[a1]-SX[a0], ty=SY[a1]-SY[a0], l=Math.hypot(tx,ty)||1;
    NX[k]=ty/l; NY[k]=-tx/l;
  }
  const edge=(k,o)=>[SX[k]+NX[k]*SR[k]*o, SY[k]+NY[k]*SR[k]*o];
  const band=(from,to,outer,inner)=>{
    c.beginPath();
    for (let k=from;k<=to;k++) { const e=edge(k,outer(k)); if (k===from) c.moveTo(e[0],e[1]); else c.lineTo(e[0],e[1]); }
    for (let k=to;k>=from;k--) { const e=edge(k,inner(k)); c.lineTo(e[0],e[1]); }
    c.closePath();
  };
  const tube=()=>band(0,M-1,()=>1,()=>-1);

  // הרגליים והזרועות
  const hipNx=-1, hipNy=hipY+3, hipFx=4, hipFy=hipY+1.5;
  const legN=dinoLeg(hipNx,hipNy,dinoFoot(0,a,hipY),hipY);
  const legF=dinoLeg(hipFx,hipFy,dinoFoot(1,a,hipY),hipY);
  const chest=pts[7], cN=Math.atan2(pts[8][1]-pts[6][1],pts[8][0]-pts[6][0]);
  const sox=-Math.sin(cN)*-3, soy=Math.cos(cN)*3;
  const armSwing=moving*20*Math.sin(TAU*a.phi);

  c.save();
  c.translate(x,y);
  const stretch=a.air*Math.abs(a.nv)*0.05, squash=a.land*0.12;
  c.scale(1-stretch*0.6+squash*0.8, 1+stretch-squash);
  c.lineCap='round'; c.lineJoin='round';

  dinoDrawArm(c,chest[0]+sox+3,chest[1]+soy,q.armU-armSwing,q.armF,C.far);
  dinoDrawLeg(c,legF,C.far,false);

  // לוחות על הגב
  c.strokeStyle=C.line; c.lineWidth=1.25; c.fillStyle=C.blue;
  let run=0, nextPlate=7;
  for (let k=1;k<M-1;k++) {
    run+=Math.hypot(SX[k]-SX[k-1],SY[k]-SY[k-1]);
    if (run<nextPlate) continue;
    nextPlate=run+6.2;
    const tx=-NY[k], ty=NX[k], r=SR[k], h=1.9+r*0.33, b=1.9+r*0.14, e=edge(k,0.94);
    c.beginPath();
    c.moveTo(e[0]-tx*b,e[1]-ty*b);
    c.lineTo(e[0]-tx*b*0.65+NX[k]*h,e[1]-ty*b*0.65+NY[k]*h);
    c.lineTo(e[0]+tx*b*0.55+NX[k]*h*0.72,e[1]+ty*b*0.55+NY[k]*h*0.72);
    c.lineTo(e[0]+tx*b,e[1]+ty*b);
    c.closePath(); c.stroke(); c.fill();
  }

  // הגוף
  tube(); c.strokeStyle=C.line; c.lineWidth=2.5; c.stroke(); c.fillStyle=C.green; c.fill();
  c.save(); tube(); c.clip();
  c.fillStyle=C.shade; band(Math.floor(M*0.1),M-1,()=>-0.22,()=>-1.1); c.fill();
  // בטן בהירה: צרה בזנב, רחבה בחזה ובצוואר
  const creamIn=k=>{ const u=k/(M-1); return u<0.62?-0.62:u>0.76?-0.08:dinoL(-0.62,-0.08,(u-0.62)/0.14); };
  c.fillStyle=C.cream; band(Math.floor(M*0.26),M-1,creamIn,()=>-1.1); c.fill();
  c.strokeStyle=C.tan; c.lineWidth=0.8;
  for (let k=Math.floor(M*0.56);k<M;k+=2) { const a0=edge(k,creamIn(k)*(k>M*0.76?1.8:1.05)), a1=edge(k,-1); c.beginPath(); c.moveTo(a0[0],a0[1]); c.lineTo(a1[0],a1[1]); c.stroke(); }
  // פס כחול על הגב שיורד בפסים לתוך הירוק
  c.fillStyle=C.blue; band(1,M-1,()=>1.1,k=>k%4===0?0.12:(k%4===2?0.5:0.68)); c.fill();
  c.restore();
  tube(); c.strokeStyle=C.line; c.lineWidth=1.1; c.stroke();

  // הראש
  const top=pts[N-1];
  c.save(); c.translate(top[0]+1,top[1]-1); c.rotate(-head*rad);
  dinoDrawHead(c,jaw,a.idle>0.5 && a.t%190<7,a.dead>0.5);
  c.restore();

  dinoDrawLeg(c,legN,C.green,true);
  dinoDrawArm(c,chest[0]+sox,chest[1]+soy+1,q.armU+armSwing,q.armF,C.green);
  c.restore();
}

// ---------- צלילים: נוצרים בקוד, בלי קבצים ----------
function dinoTone(ac,out,t,type,f0,f1,dur,vol){
  const o=ac.createOscillator(), g=ac.createGain();
  o.type=type;
  o.frequency.setValueAtTime(f0,t);
  if (f1!==f0) o.frequency.exponentialRampToValueAtTime(f1,t+dur);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(vol,t+0.006);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t+dur+0.01);
}
function dinoNoise(ac,out,t,kind,freq,dur,vol){
  const buf=ac.createBuffer(1,Math.ceil(ac.sampleRate*dur),ac.sampleRate), d=buf.getChannelData(0);
  for (let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
  const src=ac.createBufferSource(), f=ac.createBiquadFilter(), g=ac.createGain();
  src.buffer=buf; f.type=kind; f.frequency.value=freq;
  g.gain.setValueAtTime(vol,t);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  src.connect(f).connect(g).connect(out);
  src.start(t);
}
// כל צליל מקבל הקשר קול, יציאה וזמן התחלה, אז אפשר גם לרנדר אותו לבדיקה בלי רמקול.
const DINO_SFX = {
  start(ac,out,t){ [392,523,659].forEach((f,i)=>dinoTone(ac,out,t+i*0.07,'triangle',f,f,0.11,0.2)); },
  jump(ac,out,t){ dinoTone(ac,out,t,'triangle',290,760,0.2,0.3); dinoNoise(ac,out,t,'highpass',1800,0.07,0.04); },
  land(ac,out,t,power){ dinoTone(ac,out,t,'sine',150,55,0.11,0.42*power); dinoNoise(ac,out,t,'lowpass',500,0.08,0.16*power); },
  duck(ac,out,t){ dinoTone(ac,out,t,'sine',420,160,0.1,0.16); dinoNoise(ac,out,t,'bandpass',900,0.08,0.05); },
  coin(ac,out,t,note){ const f=880*Math.pow(2,note/12); dinoTone(ac,out,t,'square',f,f,0.08,0.11); dinoTone(ac,out,t+0.06,'square',f*1.335,f*1.335,0.24,0.11); },
  record(ac,out,t){ [659,784,988,1319].forEach((f,i)=>dinoTone(ac,out,t+i*0.085,'square',f,f,i===3?0.36:0.14,0.11)); },
  hit(ac,out,t){ dinoTone(ac,out,t,'sawtooth',230,48,0.3,0.24); dinoNoise(ac,out,t,'lowpass',900,0.16,0.3); [330,262].forEach((f,i)=>dinoTone(ac,out,t+0.26+i*0.15,'triangle',f,f*0.98,0.17,0.17)); }
};

function mountDino(root) {
  const {DT,DRTL}=dinoMakeT();
  root.innerHTML = DINO_HTML(DT,DRTL);
  const scope = root;

  // תיקון פריסה: למנוע שהקנבס (והדינו והקרקע) ייחתך בחלונות נמוכים.
  // הבעיה: .dinoWrap מכריח גובה קבוע ודוחס את המשחק. פותרים ע"י גלילה במקום דחיסה.
  const wrapEl = scope.querySelector('.dinoWrap');
  if (wrapEl) { wrapEl.style.justifyContent = 'flex-start'; wrapEl.style.overflowY = 'auto'; wrapEl.style.paddingTop = '6px'; }
  const stageEl = scope.querySelector('.dinoStage');
  if (stageEl) stageEl.style.flexShrink = '0';

  const cv = scope.querySelector('#dc'), ctx = cv.getContext('2d');
  // המשחק מחושב ב-820x300 ומצויר בכפול, כדי שהדינוזאור יישאר חד
  const W = 820, H = 300, GROUND = H - 40, RES = 2;
  cv.width = W*RES; cv.height = H*RES;
  ctx.direction = DRTL ? 'rtl' : 'ltr';

  // ---------- טבלת שיאים — 10 התוצאות הכי טובות ----------
  let topScores = [];
  try {
    const raw = localStorage.getItem('dino:top');
    if (raw) topScores = JSON.parse(raw) || [];
  } catch(e){ topScores = []; }
  if (!Array.isArray(topScores)) topScores = [];

  let myBest = topScores.length ? topScores[0] : 0;
  let lastScore = -1;

  function saveScore(sc){
    if (sc <= 0) return;
    topScores.push(sc);
    topScores.sort((a,b) => b-a);
    topScores = topScores.slice(0, 10);
    myBest = topScores[0];
    try { localStorage.setItem('dino:top', JSON.stringify(topScores)); } catch(e){}
    renderBoard();
  }

  function renderBoard(){
    const rows = scope.querySelector('#boardRows');
    if (!rows) return;
    if (topScores.length === 0) {
      rows.innerHTML = '<div id="empty">'+DT('empty')+'</div>';
      return;
    }
    let html = '<div class="brow head"><span class="rank">#</span><span class="sc">'+DT('colScore')+'</span></div>';
    topScores.forEach((s, i) => {
      const medal = i===0 ? '🥇' : i===1 ? '🥈' : i===2 ? '🥉' : (i+1);
      const isNew = s === lastScore ? ' me' : '';
      html += '<div class="brow'+isNew+'"><span class="rank">'+medal+'</span><span class="sc">'+s+'</span></div>';
    });
    rows.innerHTML = html;
  }

  // ---------- שיא המטבעות האישי ----------
  let coinBest = 0;
  try { coinBest = parseInt(localStorage.getItem('dino:coinBest'), 10) || 0; } catch(e){}
  let coinCount = 0, coinRecord = false, coinPulse = 0;

  function renderCoinBest(){
    const el = scope.querySelector('#dinoCoinBest');
    if (el) el.innerHTML = '<span style="width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3b0,#ffc61a 55%,#f5a800);border:1.5px solid #8a5a00;box-sizing:border-box;"></span>'+DT('coinBest')+': '+coinBest;
  }

  // ---------- צליל ----------
  let soundOn = true, audio = null;
  try { soundOn = localStorage.getItem('dino:sound') !== '0'; } catch(e){}
  function sfx(name, v){
    if (!soundOn || !running) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      // הקול עוד לא התעורר: צליל שיחכה יישמע באיחור יחד עם כל השאר, אז מדלגים עליו
      if (audio.currentTime === 0 && name !== 'start') return;
      DINO_SFX[name](audio, audio.destination, audio.currentTime+0.002, v);
    } catch(e){}
  }
  const soundBtn = scope.querySelector('#dinoSound');
  function renderSound(){ if (soundBtn) soundBtn.textContent = soundOn ? '🔊' : '🔇'; }
  function toggleSound(){
    soundOn = !soundOn;
    try { localStorage.setItem('dino:sound', soundOn ? '1' : '0'); } catch(e){}
    renderSound();
    sfx('coin', 0);   // צליל קטן, כדי לשמוע שהקול חזר
  }
  if (soundBtn) {
    soundBtn.addEventListener('mousedown', e => e.preventDefault());   // בלי מיקוד: רווח שייך למשחק ולא לכפתור
    soundBtn.addEventListener('click', toggleSound);
  }

  // מטבעות ברצף עולים בגובה הצליל
  const COIN_NOTES = [0,2,4,7,9,12,14,16];
  let coinStreak = 0, lastCoinStep = -99;

  function gotCoin(c){
    coinCount++; coinPulse = 1;
    coinStreak = frame-lastCoinStep < 45 ? Math.min(coinStreak+1, COIN_NOTES.length-1) : 0;
    lastCoinStep = frame;
    sfx('coin', COIN_NOTES[coinStreak]);
    burst(c.x-scroll, c.y, '255,209,102', 7);
    floats.push({ x:c.x-scroll, y:c.y-10, life:32 });
    if (coinCount > coinBest) {
      // צליל שיא רק כששוברים שיא אמיתי, לא במטבעות הראשונים אי פעם
      if (!coinRecord && coinBest >= 5) sfx('record');
      coinBest = coinCount; coinRecord = true;
      try { localStorage.setItem('dino:coinBest', String(coinBest)); } catch(e){}
      renderCoinBest();
    }
  }

  // ---------- הקפיצה ----------
  // מהירות בפיקסלים לצעד, 60 צעדים בשנייה. החזקה מגביהה, עזיבה קוטעת את העלייה והנפילה מהירה מהעלייה.
  const JUMP_V = 9.6, G_HOLD = 0.46, G_CUT = 1.0, G_FALL = 0.62, G_DIVE = 1.3, JUMP_BUFFER = 8;
  // המסלול של קפיצה מלאה: גובה בכל צעד. לפיו מסדרים מטבעות ואת המרחק בין מכשולים.
  const JUMP_PATH = [];
  for (let v=-JUMP_V, h=0; ;) { v += v<0 ? G_HOLD : G_FALL; h -= v; if (h <= 0) break; JUMP_PATH.push(h); }
  const AIR_STEPS = JUMP_PATH.length;

  let state = 'menu', score = 0, speed = 5, frame = 0, shake = 0, raf;
  let running = true, jumpHeld = false, jumpBuffer = 0, deadWait = 0;
  let scroll = 0, prevScroll = 0, nextAt = 0, coinEnd = 0, ft = 0;

  const anim = { phi:0, stride:78, speedK:0, air:0, nv:0, lead:0, duck:0, land:0, idle:1, dead:0, t:0 };

  const dino = {
    x: 104, y: GROUND, py: GROUND, vy: 0, ground: true, duck: false,
    reset(){ this.y = this.py = GROUND; this.vy = 0; this.ground = true; this.duck = false; },
    // במקום מלבן אחד: גוף, ראש ורגליים, ובמקצת סלחנות
    boxes(){
      const x = this.x+scroll, y = this.y;
      if (this.duck && this.ground) return [{ x:x-18, y:y-28, w:70, h:27 }];
      return [{ x:x-14, y:y-50, w:40, h:36 }, { x:x+22, y:y-66, w:32, h:20 }, { x:x-8, y:y-14, w:20, h:13 }];
    }
  };

  let obstacles = [], particles = [], clouds = [], stars = [], coins = [], floats = [];
  for (let i = 0; i < 6; i++) clouds.push({ x: Math.random()*W, y: 30+Math.random()*90, s: .3+Math.random()*.5, w: 40+Math.random()*40 });
  for (let i = 0; i < 45; i++) stars.push({ x: Math.random()*W, y: Math.random()*(GROUND-40), r: Math.random()*1.5 });

  // ציפור גבוהה עוברת מעל הראש, אמצעית מעל דינוזאור מתכופף, נמוכה רק בקפיצה
  const BIRD_HIGH = GROUND-96, BIRD_MID = GROUND-62, BIRD_LOW = GROUND-30;

  function spawnObstacle(){
    const x = nextAt;
    let o;
    if (Math.random() < 0.32 && score > 300) {
      const lvl = ['high','mid','low'][Math.floor(Math.random()*3)];
      const y = lvl==='high' ? BIRD_HIGH : lvl==='mid' ? BIRD_MID : BIRD_LOW;
      o = { type:'bird', level:lvl, x, y, w:46, h:24 };
    } else {
      const big = Math.random() < 0.5;
      let n;
      if (big) n = [1,2,2,3,3][Math.floor(Math.random()*5)];
      else n = 1 + Math.floor(Math.random()*3);
      // שלישיית קקטוסים גדולה ארוכה מדי לקפיצה בהתחלה, כשהעולם עוד איטי
      if (big && n===3 && speed < 6) n = 2;
      const unit = big?22:15, baseH = big?54:32;
      o = { type:'cactus', big, x, y: GROUND, w: unit*n, h: baseH, n, unit };
    }
    obstacles.push(o);
    // מספיק מקום לנחות ולהגיב: קפיצה מלאה, זמן תגובה, ותוספת אקראית
    nextAt = x + o.w + speed*(AIR_STEPS+16) + 60 + Math.random()*speed*44;
    addCoins(o);
  }

  // ---------- מטבעות ----------
  function coinRow(x0, n, gap, y){
    for (let i=0;i<n;i++) coins.push({ x:x0+i*gap, y, ph:i*0.5 });
    coinEnd = x0+(n-1)*gap;
  }
  function coinArc(cx){
    const span = speed*AIR_STEPS, x0 = cx-span/2;
    if (x0 < coinEnd+24) return;
    const n = Math.max(4, Math.min(6, Math.round(span/40)));
    for (let i=0;i<n;i++) {
      const f = (i+0.5)/n*AIR_STEPS;
      coins.push({ x:x0+f*speed, y:GROUND-JUMP_PATH[Math.floor(f)]-30, ph:i*0.5 });
    }
    coinEnd = x0+span;
  }
  function addCoins(o){
    const r = Math.random(), cx = o.x+o.w/2;
    if (o.type === 'bird') {
      if (o.level === 'high') coinRow(cx-40, 4, 27, GROUND-26);         // רצים מתחתיה
      else if (o.level === 'mid' && r < 0.5) coinRow(cx-27, 3, 27, GROUND-14); // מתכופפים מתחתיה
      else coinArc(cx);
      return;
    }
    if (r < 0.3) { coinArc(cx); return; }
    // בפער שאחרי המכשול: אחרי הנחיתה ולפני המכשול הבא
    const from = Math.max(o.x+o.w+speed*(AIR_STEPS*0.6), coinEnd+30), room = nextAt-from-speed*(AIR_STEPS*0.75);
    const n = Math.floor(room/30);
    if (r < 0.5 && n >= 3) coinRow(from, Math.min(n,5), 30, GROUND-26);        // על הקרקע
    else if (r < 0.65 && n >= 3) coinRow(from, 3, 30, GROUND-86);               // באוויר, רק בקפיצה
  }
  function coinTouches(c, b){
    const nx = Math.max(b.x, Math.min(c.x, b.x+b.w)), ny = Math.max(b.y, Math.min(c.y, b.y+b.h));
    return Math.hypot(c.x-nx, c.y-ny) < 10;
  }

  function burst(x,y,color,n){
    n = n || 10;
    for (let i=0;i<n;i++) particles.push({ x, y, vx:(Math.random()-.5)*5, vy:(Math.random()-.5)*5-1, life:24, color });
  }
  // אבק מהרגליים: נשאר מאחור ודועך
  function puff(x, n, power){
    for (let i=0;i<n;i++) particles.push({ x:x+(Math.random()-.5)*14, y:GROUND-1-Math.random()*3, vx:-speed*0.45-Math.random()*power, vy:-Math.random()*power*0.7, life:18+Math.random()*10, r:1.5+Math.random()*2.6, dust:true, color:'224,201,166' });
  }

  function dayFactor(){ const p = (score%1000)/1000; return (Math.cos(p*2*Math.PI)+1)/2; }
  function mix(a,b,t){ return a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(','); }
  function roundRect(x,y,w,h,r){
    ctx.beginPath(); ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function hit(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }

  function drawBackground(){
    const t = dayFactor();
    const top = mix([13,22,42],[93,173,226],t), bot = mix([27,58,75],[224,201,166],t*0.6);
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'rgb('+top+')'); g.addColorStop(1,'rgb('+bot+')');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
    if (t < 0.45) {
      ctx.fillStyle = 'rgba(255,255,255,'+((0.45-t)*1.8)+')';
      stars.forEach(s => { ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,7); ctx.fill(); });
    }
    ctx.fillStyle = t>0.45 ? '#ffd166' : '#dfe7ef';
    ctx.beginPath(); ctx.arc(W-100, 62+(1-t)*26, 26, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,'+(0.15+t*0.25)+')';
    clouds.forEach(c => {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.w, c.w*0.4, 0, 0, 7);
      ctx.ellipse(c.x+c.w*0.6, c.y-6, c.w*0.5, c.w*0.35, 0, 0, 7);
      ctx.fill();
    });
  }

  function drawGround(scrollR){
    ctx.fillStyle = '#3a3226'; ctx.fillRect(0, GROUND, W, H-GROUND);
    ctx.strokeStyle = '#e0c9a6'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0,GROUND+1); ctx.lineTo(W,GROUND+1); ctx.stroke();
    ctx.fillStyle = 'rgba(224,201,166,.5)';
    for (let x = -(scrollR%60); x < W; x += 60) {
      ctx.fillRect(x, GROUND+10, 8, 3);
      ctx.fillRect(x+30, GROUND+20, 5, 2);
    }
  }

  function drawDino(yR, alpha){
    // הצל קטן ודוהה ככל שהוא גבוה יותר
    const k = Math.max(0.3, 1-(GROUND-yR)/150), low = anim.duck;
    ctx.fillStyle = 'rgba(0,0,0,'+(0.26*k)+')';
    ctx.beginPath(); ctx.ellipse(dino.x+6+low*12, GROUND+3, (40+low*12)*k, 4.5*k, 0, 0, 7); ctx.fill();
    const a = Object.assign({}, anim, { phi: anim.phi+(state==='play'&&dino.ground?speed/anim.stride*alpha:0) });
    dinoDraw(ctx, dino.x, yR, a);
  }

  function drawCoin(x, y, spin, r){
    ctx.save(); ctx.translate(x,y); ctx.scale(Math.max(0.18,Math.abs(spin)),1);
    ctx.fillStyle = '#f5a800'; ctx.strokeStyle = '#7d5200'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0,0,r,0,7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(0,0,r*0.68,0,7); ctx.fill();
    ctx.strokeStyle = '#e09a00'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(0,0,r*0.68,0,7); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.ellipse(-r*0.32,-r*0.36,r*0.16,r*0.24,0.5,0,7); ctx.fill();
    ctx.restore();
  }

  function drawObstacle(o){ if (o.type==='cactus') drawCactus(o); else drawBird(o); }

  function drawCactus(o){
    for (let i=0;i<o.n;i++) {
      const bx = o.x+i*o.unit, wdt = o.big?14:11, topY = o.y-o.h;
      const g = ctx.createLinearGradient(bx,0,bx+wdt,0);
      g.addColorStop(0,'#2f5d34'); g.addColorStop(0.4,'#4a8f52');
      g.addColorStop(0.7,'#5fa869'); g.addColorStop(1,'#3a6e40');
      ctx.fillStyle = g; roundRect(bx, topY, wdt, o.h, 6); ctx.fill();
      ctx.strokeStyle = g; ctx.lineWidth = o.big?10:8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx-1, topY+o.h*0.55);
      ctx.quadraticCurveTo(bx-9, topY+o.h*0.5, bx-9, topY+o.h*0.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx+wdt+1, topY+o.h*0.62);
      ctx.quadraticCurveTo(bx+wdt+9, topY+o.h*0.57, bx+wdt+9, topY+o.h*0.36); ctx.stroke();
      ctx.strokeStyle = 'rgba(20,50,25,.4)'; ctx.lineWidth = 1;
      for (let r=3; r<wdt; r+=4) { ctx.beginPath(); ctx.moveTo(bx+r, topY+4); ctx.lineTo(bx+r, o.y-3); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(230,230,200,.6)';
      for (let sy=topY+8; sy<o.y-4; sy+=9) {
        ctx.beginPath(); ctx.moveTo(bx+1, sy); ctx.lineTo(bx-2, sy-2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx+wdt-1, sy+3); ctx.lineTo(bx+wdt+2, sy+1); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(180,230,170,.3)'; roundRect(bx+2, topY+3, 3, o.h-8, 2); ctx.fill();
    }
  }

  function drawBird(o){
    const cx = o.x+o.w/2, cy = o.y+o.h/2, t = ft*0.3, flap = Math.sin(t);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.beginPath(); ctx.ellipse(cx, GROUND+3, 16, 4, 0, 0, 7); ctx.fill();

    ctx.strokeStyle = 'rgba(217,133,107,.35)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i=0;i<3;i++) {
      const ly = cy-6+i*6;
      ctx.beginPath(); ctx.moveTo(cx+22+i*4, ly); ctx.lineTo(cx+38+i*6, ly); ctx.stroke();
    }

    ctx.translate(cx,cy); ctx.scale(-1,1); ctx.translate(-cx,-cy);
    ctx.translate(cx,cy); ctx.rotate(-0.12); ctx.translate(-cx,-cy);

    const bg = ctx.createLinearGradient(cx-14, cy-8, cx+14, cy+8);
    bg.addColorStop(0,'#6b3a28'); bg.addColorStop(1,'#c56b52');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(cx, cy, 16, 9, 0, 0, 7); ctx.fill();

    function wing(x,y,f,len){
      const tip = -20+f*34;
      ctx.beginPath(); ctx.moveTo(x,y);
      ctx.quadraticCurveTo(x-len*0.4, y+tip, x-len, y+tip*0.6);
      ctx.quadraticCurveTo(x-len*0.5, y+4, x, y+3); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#6b3a28'; wing(cx-2, cy, flap*0.7, 26);

    ctx.fillStyle = '#b25f48'; ctx.beginPath(); ctx.arc(cx+14, cy-2, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffb100'; ctx.beginPath();
    ctx.moveTo(cx+20, cy-4); ctx.lineTo(cx+32, cy); ctx.lineTo(cx+20, cy+2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(cx+16, cy-3, 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#0d1620'; ctx.beginPath(); ctx.arc(cx+16.5, cy-3, 1.2, 0, 7); ctx.fill();
    ctx.strokeStyle = '#0d1620'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(cx+12, cy-8); ctx.lineTo(cx+19, cy-6); ctx.stroke();

    ctx.fillStyle = '#e89478'; wing(cx, cy-1, flap, 32);

    ctx.fillStyle = '#a55940'; ctx.beginPath();
    ctx.moveTo(cx-14, cy); ctx.lineTo(cx-26, cy-6); ctx.lineTo(cx-26, cy+6); ctx.closePath(); ctx.fill();

    ctx.restore();
  }

  function drawHUD(){
    ctx.font = 'bold 13px Heebo, sans-serif';
    const bestText = DT('coinBest')+': '+coinBest;
    ctx.fillStyle = 'rgba(8,12,18,.42)';
    roundRect(10, 8, Math.max(92, ctx.measureText(bestText).width+20), 56, 10); ctx.fill();
    roundRect(W-116, 8, 106, 56, 10); ctx.fill();
    ctx.fillStyle = '#e8eef5'; ctx.font = 'bold 20px Heebo, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(String(score).padStart(5,'0'), W-20, 32);
    ctx.font = 'bold 14px Heebo, sans-serif'; ctx.fillStyle = '#e8eef5';
    ctx.fillText('HI '+String(myBest).padStart(5,'0'), W-20, 52);
    // מטבעות: כמה בריצה הזאת, ומה השיא
    drawCoin(30, 26, 1, 10+coinPulse*3);
    ctx.textAlign = 'left';
    ctx.font = 'bold 22px Heebo, sans-serif'; ctx.fillStyle = coinRecord ? '#ffd166' : '#e8eef5';
    ctx.fillText(String(coinCount), 48, 34);
    ctx.font = 'bold 13px Heebo, sans-serif'; ctx.fillStyle = '#e8eef5';
    ctx.fillText(bestText, 20, 56);
  }

  function centerText(lines){
    ctx.fillStyle = 'rgba(8,12,18,.7)'; ctx.fillRect(0,0,W,H);
    ctx.textAlign = 'center';
    lines.forEach((l,i) => {
      ctx.fillStyle = l.c || '#e8eef5';
      ctx.font = l.f || 'bold 20px Heebo, sans-serif';
      ctx.fillText(l.t, W/2, H/2-(lines.length-1)*16+i*32);
    });
    ctx.textAlign = 'left';
  }

  // צעד אחד של העולם, 60 בשנייה בכל מסך: במסך מהיר המשחק לא רץ מהר יותר
  function step(){
    frame++;
    prevScroll = scroll; dino.py = dino.y;
    anim.t++;
    if (shake > 0) shake -= 0.6;
    if (coinPulse > 0) coinPulse = Math.max(0, coinPulse-0.08);

    if (state === 'play') {
      clouds.forEach(c => {
        c.x -= c.s*(speed/6);
        if (c.x < -c.w) { c.x = W+c.w; c.y = 30+Math.random()*90; }
      });

      if (jumpBuffer > 0) jumpBuffer--;
      if (dino.ground && jumpBuffer > 0) {
        jumpBuffer = 0; dino.ground = false; dino.duck = false; dino.vy = -JUMP_V;
        anim.lead = ((anim.phi%1) >= Math.min(0.44,44/anim.stride)) ? 0 : 1;
        puff(dino.x-4, 5, 1.6);
        sfx('jump');
      }
      if (!dino.ground) {
        const g = dino.duck ? G_DIVE : dino.vy < 0 ? (jumpHeld ? G_HOLD : G_CUT) : G_FALL;
        dino.vy += g; dino.y += dino.vy;
        if (dino.y >= GROUND) {
          // נחיתה: הרגל המובילה דורכת, הברכיים בולעות את המכה, אבק
          anim.land = Math.min(1, dino.vy/9); anim.phi = anim.lead ? 0.5 : 0;
          dino.y = GROUND; dino.vy = 0; dino.ground = true;
          puff(dino.x+6, 9, 2.2);
          sfx('land', anim.land);
        }
      }

      scroll += speed;
      if (frame % 6 === 0) score++;
      if (speed < 13) speed += 0.0014;
      if (scroll+W+60 >= nextAt) spawnObstacle();

      const boxes = dino.boxes();
      for (let i = obstacles.length-1; i >= 0; i--) {
        const o = obstacles[i];
        const ob = o.type==='cactus' ? { x:o.x, y:o.y-o.h, w:o.w, h:o.h } : o;
        if (boxes.some(b => hit(b, ob))) { die(); break; }
        if (o.x+o.w < scroll-40) obstacles.splice(i,1);
      }
      if (state === 'play') for (let i = coins.length-1; i >= 0; i--) {
        const c = coins[i];
        if (boxes.some(b => coinTouches(c, b))) { coins.splice(i,1); gotCoin(c); }
        else if (c.x < scroll-20) coins.splice(i,1);
      }

      // מחזור הריצה לפי המרחק, כדי שהרגל על הקרקע תזוז בדיוק בקצב של העולם
      anim.stride = 78+(speed-5)*8;
      anim.speedK = (speed-5)/8;
      if (dino.ground) {
        const beta = Math.min(0.44,44/anim.stride), was = anim.phi;
        anim.phi += speed/anim.stride;
        for (const off of [0,0.5]) if ((was+off)%1 < beta && (anim.phi+off)%1 >= beta && !dino.duck) puff(dino.x-16, 1, 0.8);
      }
    } else if (state === 'dead') {
      if (deadWait > 0) deadWait--;
      if (!dino.ground) {
        dino.vy += G_FALL; dino.y += dino.vy;
        if (dino.y >= GROUND) { dino.y = GROUND; dino.vy = 0; dino.ground = true; puff(dino.x, 7, 1.4); }
      }
    }

    // מעברים רכים בין תנוחות
    anim.air += ((dino.ground?0:1)-anim.air)*0.34;
    anim.duck += ((dino.duck&&dino.ground?1:0)-anim.duck)*0.3;
    anim.idle += ((state==='menu'?1:0)-anim.idle)*0.2;
    anim.dead += ((state==='dead'?1:0)-anim.dead)*0.35;
    anim.land *= 0.85;
    anim.nv += (dino.vy/JUMP_V-anim.nv)*0.5;

    for (let i = particles.length-1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.dust ? 0.02 : 0.2; p.life--;
      if (p.life <= 0) particles.splice(i,1);
    }
    for (let i = floats.length-1; i >= 0; i--) { floats[i].y -= 0.9; if (--floats[i].life <= 0) floats.splice(i,1); }
  }

  function render(alpha){
    const scrollR = prevScroll+(scroll-prevScroll)*alpha, yR = dino.py+(dino.y-dino.py)*alpha;
    ft = frame+alpha;
    ctx.setTransform(RES,0,0,RES,0,0);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random()-.5)*shake, (Math.random()-.5)*shake);

    drawBackground(); drawGround(scrollR);

    ctx.save(); ctx.translate(-scrollR,0);
    obstacles.forEach(drawObstacle);
    coins.forEach(c => drawCoin(c.x, c.y+Math.sin(ft*0.08+c.ph)*1.6, Math.cos(ft*0.11+c.ph), 8.5));
    ctx.restore();

    drawDino(yR, alpha);

    particles.forEach(p => {
      if (p.dust) {
        ctx.fillStyle = 'rgba('+p.color+','+(p.life/28*0.55)+')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r+(28-p.life)*0.12, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba('+p.color+','+(p.life/24)+')';
        ctx.fillRect(p.x, p.y, 3, 3);
      }
    });
    ctx.font = 'bold 14px Heebo, sans-serif'; ctx.textAlign = 'center'; ctx.direction = 'ltr';
    floats.forEach(f => { ctx.fillStyle = 'rgba(255,216,77,'+Math.min(1,f.life/14)+')'; ctx.fillText('+1', f.x, f.y); });
    ctx.textAlign = 'left'; ctx.direction = DRTL ? 'rtl' : 'ltr';

    drawHUD();

    if (state === 'menu') centerText([
      { t:'DINO RUNNER', c:'#ffd166', f:'bold 30px Heebo, sans-serif' },
      { t:DT('startPrompt'), f:'bold 15px Heebo, sans-serif', c:'#8ba0b5' }
    ]);
    if (state === 'dead') {
      const lines = [
        { t:DT('dead'), c:'#d9856b', f:'bold 30px Heebo, sans-serif' },
        { t:DT('scorePrefix')+score, f:'bold 16px Heebo, sans-serif' },
        { t:DT('bestPrefix')+myBest, c:'#ffd166', f:'bold 15px Heebo, sans-serif' },
        { t:DT('coinsPrefix')+coinCount+'  ·  '+DT('coinBest')+': '+coinBest, f:'bold 15px Heebo, sans-serif' }
      ];
      if (coinRecord) lines.push({ t:DT('newCoinBest'), c:'#ffd166', f:'bold 17px Heebo, sans-serif' });
      lines.push({ t:DT('againPrompt'), c:'#8ba0b5', f:'bold 14px Heebo, sans-serif' });
      centerText(lines);
    }

    ctx.restore();
  }

  let lastT = 0, acc = 0;
  const STEP_MS = 1000/60;
  function loop(now){
    if (!running) return;
    raf = requestAnimationFrame(loop);
    // אחרי חזרה מחלון אחר לא מריצים בבת אחת את כל מה שפוספס
    acc += Math.min(100, now-(lastT||now));
    lastT = now;
    while (acc >= STEP_MS) { step(); acc -= STEP_MS; }
    render(acc/STEP_MS);
  }

  function startGame(){
    state = 'play'; score = 0; speed = 5;
    scroll = prevScroll = 0; nextAt = W+200; coinEnd = 0;
    obstacles = []; particles = []; coins = []; floats = [];
    coinCount = 0; coinRecord = false; jumpBuffer = 0;
    anim.phi = 0; anim.land = 0;
    dino.reset();
    sfx('start');
  }

  function die(){
    state = 'dead'; shake = 12; deadWait = 30;
    sfx('hit');
    const b = dino.boxes()[0];
    burst(b.x-scroll+b.w/2, b.y+b.h/2, '217,133,107', 20);
    lastScore = score;
    saveScore(score);
  }

  function pressJump(){
    jumpHeld = true;
    if (state === 'play') jumpBuffer = JUMP_BUFFER;
    else if (deadWait <= 0) startGame();   // בלי ההמתנה לחיצה מהירה מדלגת על מסך התוצאה
  }
  function releaseJump(){ jumpHeld = false; }

  function duckDown(){
    if (!dino.duck && state === 'play') sfx('duck');
    dino.duck = true;
  }

  const isJumpKey = e => e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
  const kd = e => {
    if (isJumpKey(e)) {
      e.preventDefault();
      if (!e.repeat) pressJump();   // החזקה מגביהה את אותה קפיצה ולא מתחילה עוד אחת
    }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); if (!e.repeat) duckDown(); }
    if (e.code === 'KeyM' && !e.repeat) toggleSound();
  };
  const ku = e => {
    if (isJumpKey(e)) releaseJump();
    if (e.code === 'ArrowDown' || e.code === 'KeyS') dino.duck = false;
  };
  const blur = () => { dino.duck = false; releaseJump(); };

  document.addEventListener('keydown', kd);
  document.addEventListener('keyup', ku);
  window.addEventListener('blur', blur);
  window.addEventListener('pointerup', releaseJump);
  window.addEventListener('pointercancel', releaseJump);
  cv.addEventListener('pointerdown', pressJump);

  // ---- כפתורי מגע (טלפון/טאבלט) ----
  const jumpBtn = scope.querySelector('#dinoJumpBtn');
  const duckBtn = scope.querySelector('#dinoDuckBtn');
  if (jumpBtn) jumpBtn.addEventListener('pointerdown', e => { e.preventDefault(); pressJump(); });
  if (duckBtn) {
    const dOn = e => { e.preventDefault(); duckDown(); };
    const dOff = e => { e.preventDefault(); dino.duck = false; };
    duckBtn.addEventListener('pointerdown', dOn);
    duckBtn.addEventListener('pointerup', dOff);
    duckBtn.addEventListener('pointerleave', dOff);
    duckBtn.addEventListener('pointercancel', dOff);
  }

  renderBoard();
  renderSound();
  renderCoinBest();
  raf = requestAnimationFrame(loop);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    if (audio) audio.close().catch(() => {});
    document.removeEventListener('keydown', kd);
    document.removeEventListener('keyup', ku);
    window.removeEventListener('blur', blur);
    window.removeEventListener('pointerup', releaseJump);
    window.removeEventListener('pointercancel', releaseJump);
  };
}
