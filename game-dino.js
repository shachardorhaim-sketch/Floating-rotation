// ============================================
//  משחק: DINO RUNNER
//  דינוזאור שמצויר בקוד · מטבעות ושיא מטבעות · טבלת שיאים
// ============================================

const DDICT = {"he":{"hint":"רווח / ↑ = קפיצה (החזק = גבוה יותר) • ↓ = התכופפות<br>ציפור גבוהה: רוץ מתחת · אמצע: קפוץ או התכופף · נמוכה: קפוץ מעל<br>אסוף מטבעות, שבור את השיא וקנה דמויות בחנות","jump":"⬆ קפיצה","duck":"⬇ התכופפות","board":"טבלת שיאים","empty":"עדיין אין שיאים — שחק כדי להתחיל!","colScore":"ניקוד","startPrompt":"רווח / ↑ להתחלה","dead":"נפסלת!","scorePrefix":"ניקוד ","bestPrefix":"השיא שלך: ","againPrompt":"רווח לשחק שוב","coinBest":"שיא מטבעות","coinsPrefix":"מטבעות: ","newCoinBest":"שיא מטבעות חדש!","sound":"צליל","wallet":"בארנק","shop":"חנות","shopTitle":"חנות הדמויות","shopUse":"בחר","shopOn":"✓ נבחר","shopBuy":"קנה","shopNeed":"חסר"},"en":{"hint":"Space / ↑ = jump (hold = higher) • ↓ = duck<br>High bird: run under · Middle: jump or duck · Low: jump over<br>Collect coins, beat your record and buy characters in the shop","jump":"⬆ Jump","duck":"⬇ Duck","board":"Leaderboard","empty":"No scores yet — play to get started!","colScore":"Score","startPrompt":"Space / ↑ to start","dead":"Game Over!","scorePrefix":"Score ","bestPrefix":"Your best: ","againPrompt":"Space to play again","coinBest":"Coin record","coinsPrefix":"Coins: ","newCoinBest":"New coin record!","sound":"Sound","wallet":"Wallet","shop":"Shop","shopTitle":"Character Shop","shopUse":"Use","shopOn":"✓ Selected","shopBuy":"Buy","shopNeed":"Need"},"ar":{"hint":"مسافة / ↑ = قفز (اضغط مطولاً = أعلى) • ↓ = انحناء<br>طائر عالٍ: اركض تحته · متوسط: اقفز أو انحنِ · منخفض: اقفز فوقه<br>اجمع العملات واكسر رقمك واشترِ شخصيات من المتجر","jump":"⬆ قفز","duck":"⬇ انحناء","board":"لوحة المتصدرين","empty":"لا توجد نتائج بعد — العب للبدء!","colScore":"النقاط","startPrompt":"مسافة / ↑ للبدء","dead":"خسرت!","scorePrefix":"النقاط ","bestPrefix":"أفضل نتيجة: ","againPrompt":"مسافة للعب مجدداً","coinBest":"رقم العملات القياسي","coinsPrefix":"العملات: ","newCoinBest":"رقم قياسي جديد للعملات!","sound":"الصوت","wallet":"المحفظة","shop":"المتجر","shopTitle":"متجر الشخصيات","shopUse":"اختر","shopOn":"✓ مختار","shopBuy":"اشترِ","shopNeed":"ينقص"},"es":{"hint":"Espacio / ↑ = saltar (mantén = más alto) • ↓ = agacharse<br>Pájaro alto: corre por debajo · Medio: salta o agáchate · Bajo: salta por encima<br>Junta monedas, supera tu récord y compra personajes en la tienda","jump":"⬆ Saltar","duck":"⬇ Agacharse","board":"Clasificación","empty":"Aún no hay puntuaciones: ¡juega para empezar!","colScore":"Puntos","startPrompt":"Espacio / ↑ para empezar","dead":"¡Perdiste!","scorePrefix":"Puntos ","bestPrefix":"Tu récord: ","againPrompt":"Espacio para jugar otra vez","coinBest":"Récord de monedas","coinsPrefix":"Monedas: ","newCoinBest":"¡Nuevo récord de monedas!","sound":"Sonido","wallet":"Monedero","shop":"Tienda","shopTitle":"Tienda de personajes","shopUse":"Usar","shopOn":"✓ Elegido","shopBuy":"Comprar","shopNeed":"Faltan"},"fr":{"hint":"Espace / ↑ = sauter (maintenir = plus haut) • ↓ = se baisser<br>Oiseau haut : passe dessous · Milieu : saute ou baisse-toi · Bas : saute par-dessus<br>Récolte des pièces, bats ton record et achète des personnages","jump":"⬆ Sauter","duck":"⬇ Se baisser","board":"Classement","empty":"Pas encore de scores — joue pour commencer !","colScore":"Score","startPrompt":"Espace / ↑ pour commencer","dead":"Perdu !","scorePrefix":"Score ","bestPrefix":"Ton record : ","againPrompt":"Espace pour rejouer","coinBest":"Record de pièces","coinsPrefix":"Pièces : ","newCoinBest":"Nouveau record de pièces !","sound":"Son","wallet":"Porte-monnaie","shop":"Boutique","shopTitle":"Boutique de personnages","shopUse":"Choisir","shopOn":"✓ Choisi","shopBuy":"Acheter","shopNeed":"Il manque"},"pt":{"hint":"Espaço / ↑ = pular (segure = mais alto) • ↓ = agachar<br>Pássaro alto: corra por baixo · Meio: pule ou agache · Baixo: pule por cima<br>Junte moedas, bata seu recorde e compre personagens na loja","jump":"⬆ Pular","duck":"⬇ Agachar","board":"Ranking","empty":"Ainda sem pontuações — jogue para começar!","colScore":"Pontos","startPrompt":"Espaço / ↑ para começar","dead":"Você perdeu!","scorePrefix":"Pontos ","bestPrefix":"Seu recorde: ","againPrompt":"Espaço para jogar de novo","coinBest":"Recorde de moedas","coinsPrefix":"Moedas: ","newCoinBest":"Novo recorde de moedas!","sound":"Som","wallet":"Carteira","shop":"Loja","shopTitle":"Loja de personagens","shopUse":"Usar","shopOn":"✓ Escolhido","shopBuy":"Comprar","shopNeed":"Faltam"},"ru":{"hint":"Пробел / ↑ = прыжок (удерживай = выше) • ↓ = пригнуться<br>Высокая птица: беги под ней · Средняя: прыгай или пригнись · Низкая: перепрыгни<br>Собирай монеты, побей рекорд и покупай персонажей в магазине","jump":"⬆ Прыжок","duck":"⬇ Пригнуться","board":"Таблица рекордов","empty":"Пока нет рекордов — сыграй, чтобы начать!","colScore":"Очки","startPrompt":"Пробел / ↑ для старта","dead":"Проигрыш!","scorePrefix":"Очки ","bestPrefix":"Твой рекорд: ","againPrompt":"Пробел, чтобы сыграть снова","coinBest":"Рекорд монет","coinsPrefix":"Монеты: ","newCoinBest":"Новый рекорд монет!","sound":"Звук","wallet":"Кошелёк","shop":"Магазин","shopTitle":"Магазин персонажей","shopUse":"Выбрать","shopOn":"✓ Выбран","shopBuy":"Купить","shopNeed":"Не хватает"},"de":{"hint":"Leertaste / ↑ = springen (halten = höher) • ↓ = ducken<br>Hoher Vogel: drunter durch · Mitte: springen oder ducken · Tief: drüber springen<br>Sammle Münzen, knack deinen Rekord und kaufe Figuren im Shop","jump":"⬆ Springen","duck":"⬇ Ducken","board":"Bestenliste","empty":"Noch keine Punkte — spiel, um zu starten!","colScore":"Punkte","startPrompt":"Leertaste / ↑ zum Start","dead":"Vorbei!","scorePrefix":"Punkte ","bestPrefix":"Dein Rekord: ","againPrompt":"Leertaste für nochmal","coinBest":"Münzrekord","coinsPrefix":"Münzen: ","newCoinBest":"Neuer Münzrekord!","sound":"Ton","wallet":"Geldbeutel","shop":"Shop","shopTitle":"Figuren-Shop","shopUse":"Wählen","shopOn":"✓ Gewählt","shopBuy":"Kaufen","shopNeed":"Es fehlen"}};
function dinoMakeT(){ let l='he'; try{ var _p=localStorage.getItem('flrot:lang'); if(_p) l=_p; }catch(e){} if(!DDICT[l]) l='he'; return { LI:['he','en','ar','es','fr','pt','ru','de'].indexOf(l), DT:k=>(DDICT[l]&&DDICT[l][k])||DDICT['he'][k]||k, DRTL:(l==='he'||l==='ar') }; }
function DINO_HTML(DT,DRTL){ return `
<div class="dinoWrap" style="direction:${DRTL?'rtl':'ltr'};">
  <div class="dinoTop" style="flex-wrap:wrap;justify-content:center;"><span class="dinoTitle">DINO RUNNER</span><span id="dinoCoinBest" style="display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:#ffd166;"></span><span id="dinoWallet" style="display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:#e8eef5;"></span><button id="dinoShopBtn" type="button" tabindex="-1" class="dinoShopBtn">🛒 ${DT('shop')}</button><button id="dinoSound" type="button" tabindex="-1" title="${DT('sound')} (M)" aria-label="${DT('sound')}" style="width:30px;height:30px;padding:0;border:1px solid #2a3b4f;border-radius:50%;background:#141d28;font-size:15px;line-height:1;cursor:pointer;"></button></div>
  <div class="dinoStage">
    <canvas id="dc" width="820" height="300"></canvas>
  </div>
  <div class="dinoTouch">
    <button id="dinoJumpBtn" style="flex:1;padding:16px 0;font-size:17px;font-weight:700;color:#fff;border:none;border-radius:14px;background:linear-gradient(90deg,#2f8f52,#57c97e);box-shadow:0 4px 16px rgba(47,143,82,.4);cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;">${DT('jump')}</button>
    <button id="dinoDuckBtn" style="flex:1;padding:16px 0;font-size:17px;font-weight:700;color:#fff;border:none;border-radius:14px;background:linear-gradient(90deg,#3a6ea5,#5a9bd4);box-shadow:0 4px 16px rgba(58,110,165,.4);cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;">${DT('duck')}</button>
  </div>
  <div class="dinoLower">
    <div class="dinoHint"><div>${DT('hint')}</div></div>
    <div id="board"><h3>&#127942; ${DT('board')}</h3><div id="boardRows"></div></div>
  </div>
</div>
`; }

// ---------- הדינוזאור: עצמות שמצוירות בקוד, בלי תמונות ----------
// התנוחה מחושבת בכל ציור, אז כף הרגל דורכת על הקרקע בקצב של העולם והקפיצה עוברת בין תנוחות.
// הראשית היא הקרקע שמתחת לאגן: x קדימה, y למטה. בריצה הוא בגובה של כ-66 פיקסלים.
// המראה מגיע מהדמות (DINO_SKINS בקובץ game-dino-skins.js), והשלד אותו שלד לכולן.

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
// בהתכופפות: צעד קצר יותר (ובאותו קצב קרקע, אז גם מהיר יותר), ורגל קצרה יותר
const DINO_DUCK_STEP = 0.4, DINO_DUCK_LEG = 0.27;

function dinoFoot(i,a,hipY){
  const beta = Math.min(0.44, 44/a.stride), R = a.stride*beta/2*(1-a.duck*DINO_DUCK_STEP);
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
  let rx=x, ry=y-(3-a.duck*0.7)-hipY;
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

function dinoLeg(hx,hy,f,hipY,k){
  const TH=16*k, SH=14.5*k, MT=10.5*k, rad=Math.PI/180;
  let ax=f.x-MT*Math.cos(f.g*rad), ay=hipY+f.y-MT*Math.sin(f.g*rad);
  const bx0=f.x-ax, by0=hipY+f.y-ay;
  let dx=ax-hx, dy=ay-hy, dist=Math.hypot(dx,dy);
  const reach=TH+SH-0.05;
  if (dist>reach) { ax=hx+dx/dist*reach; ay=hy+dy/dist*reach; dx=ax-hx; dy=ay-hy; dist=reach; }
  // קרוב מדי לאגן הרגל מתקפלת לגוש, אז הקרסול נדחק החוצה
  const least=(TH+SH)*0.42;
  if (dist<least) { const ux0=dist>0.01?dx/dist:0, uy0=dist>0.01?dy/dist:1; ax=hx+ux0*least; ay=hy+uy0*least; dx=ax-hx; dy=ay-hy; dist=least; }
  const ca=(TH*TH+dist*dist-SH*SH)/(2*TH*dist), sa=Math.sqrt(Math.max(0,1-ca*ca));
  const ux=dx/dist, uy=dy/dist;
  return { hx,hy, kx:hx+TH*(ux*ca+uy*sa), ky:hy+TH*(uy*ca-ux*sa), ax,ay, bx:ax+bx0, by:ay+by0, d:f.d, k };
}

// גובה האגן: עולה ויורד פעמיים במחזור, נמוך הכי הרבה כשכף רגל מתחת לאגן
function dinoHip(a,poseHip){
  const moving=(1-a.idle)*(1-a.air)*(1-a.dead), beta=Math.min(0.44,44/a.stride);
  const bob=moving*(2+a.speedK*1.5)*(1-a.duck*0.6)*Math.cos(Math.PI*4*(a.phi-beta/2));
  return -poseHip+bob+a.idle*Math.sin(a.t*0.07)*0.8+a.land*5;
}
// שתי הרגליים: בהתכופפות ובנחיתה הן קצרות יותר, ומחוברות גבוה יותר, כדי שהברך תישאר מעל הקרקע
function dinoLegs(a,hipY){
  const k=1-a.duck*DINO_DUCK_LEG-a.land*0.14, up=1-a.duck*0.6;
  return [ dinoLeg(-1,hipY+3*up,dinoFoot(0,a,hipY),hipY,k), dinoLeg(4,hipY+1.5*up,dinoFoot(1,a,hipY),hipY,k) ];
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

function dinoDrawLeg(c,L,col,C,legPat){
  const rad=Math.PI/180, d=L.d*rad, k=L.k;
  const tx=L.bx+7*k*Math.cos(d), ty=L.by+7*k*Math.sin(d);
  const pts=[[L.hx,L.hy,8.2*k],[L.kx,L.ky,4.8*k],[L.ax,L.ay,2.9*k],[L.bx,L.by,2.5*k],[tx,ty,2*k]];
  c.lineJoin='round'; c.strokeStyle=C.line; c.lineWidth=2.6; dinoCaps(c,pts,true);
  // טפרים
  c.lineWidth=0.7; c.fillStyle=C.claw;
  for (let n=0;n<3;n++) {
    const f=(2.8+n*2.5)*k, x=L.bx+f*Math.cos(d), y=L.by+f*Math.sin(d), a=d+0.5;
    c.beginPath();
    c.moveTo(x-1.7*k*Math.cos(d),y-1.7*k*Math.sin(d)+0.6*k);
    c.lineTo(x+1.7*k*Math.cos(d),y+1.7*k*Math.sin(d)+0.6*k);
    c.lineTo(x+4.4*k*Math.cos(a),y+0.6*k+4.4*k*Math.sin(a));
    c.closePath(); c.stroke(); c.fill();
  }
  c.fillStyle=col; dinoCaps(c,pts,false);
  if (!legPat) return;
  const ang=Math.atan2(L.ky-L.hy,L.kx-L.hx);
  c.save(); c.translate(L.hx,L.hy); c.rotate(ang);
  c.strokeStyle=C.blue; c.fillStyle=C.blue; c.lineWidth=1.5; c.lineCap='round';
  if (legPat==='dots') { c.beginPath(); c.arc(3*k,-2.5*k,1.6*k,0,7); c.arc(8*k,2*k,1.5*k,0,7); c.fill(); }
  else for (let n=0;n<3;n++) { const u=(3+n*3.6)*k, r=(6.2-n*0.8)*k; c.beginPath(); c.moveTo(u+1.2*k,-r); c.quadraticCurveTo(u-1.4*k,0,u+1.2*k,r); c.stroke(); }
  c.restore();
}

function dinoDrawArm(c,sx,sy,U,F,col,C){
  const rad=Math.PI/180, ex=sx+5.2*Math.sin(U*rad), ey=sy+5.2*Math.cos(U*rad), wx=ex+5*Math.cos(F*rad), wy=ey+5*Math.sin(F*rad);
  const pts=[[sx,sy,2.6],[ex,ey,2],[wx,wy,1.7]];
  c.strokeStyle=C.line; c.lineWidth=2.4; dinoCaps(c,pts,true);
  c.lineWidth=1; c.lineCap='round';
  for (let n=-1;n<=1;n+=2) { const a=(F+40+n*18)*rad; c.beginPath(); c.moveTo(wx,wy); c.lineTo(wx+3*Math.cos(a),wy+3*Math.sin(a)); c.stroke(); }
  c.fillStyle=col; dinoCaps(c,pts,false);
}

function dinoDrawEye(c,S,C,blink,t){
  const eye=S.eye||'normal';
  c.strokeStyle=C.line;
  if (eye==='hollow') { c.fillStyle='#0a0a10'; c.lineWidth=.8; c.beginPath(); c.ellipse(7.5,-7.2,4.4,4.2,0,0,7); c.fill(); return; }
  if (eye==='glowRed') { c.fillStyle='#ff2020'; c.beginPath(); c.moveTo(2.5,-10); c.lineTo(13,-7); c.lineTo(9,-4.6); c.lineTo(3,-7); c.closePath(); c.fill(); return; }
  if (eye==='visor') { c.fillStyle='#0a0f18'; c.beginPath(); c.moveTo(1,-10); c.lineTo(17,-9); c.lineTo(17,-4); c.lineTo(1,-4.6); c.closePath(); c.fill(); c.fillStyle=Math.sin(t*0.1)>-0.8?'#ff3b30':'#7a1010'; c.fillRect(3,-8,12,2); return; }
  if (eye==='tri') { c.fillStyle='#120a04'; c.beginPath(); c.moveTo(7.5,-11.5); c.lineTo(13,-3.5); c.lineTo(2,-3.5); c.closePath(); c.fill(); c.fillStyle='#ffd21a'; c.beginPath(); c.moveTo(7.5,-8); c.lineTo(10,-4.6); c.lineTo(5,-4.6); c.closePath(); c.fill(); return; }
  if (eye==='coal') { c.fillStyle='#14141a'; c.beginPath(); c.arc(8,-7.5,2.6,0,7); c.fill(); c.fillStyle='#fff'; c.beginPath(); c.arc(7.2,-8.3,.7,0,7); c.fill(); return; }
  if (eye==='alien') { c.fillStyle='#0a0a10'; c.beginPath(); c.ellipse(9,-7.2,7,4.4,0.45,0,7); c.fill(); c.fillStyle='rgba(255,255,255,.75)'; c.beginPath(); c.ellipse(6.6,-8.6,1.5,.9,.45,0,7); c.fill(); return; }
  if (eye==='big') {
    c.fillStyle='#fff'; c.lineWidth=1; c.beginPath(); c.ellipse(8,-7,5.4,5.2,0,0,7); c.stroke(); c.fill();
    c.fillStyle=C.iris; c.beginPath(); c.arc(9,-6.6,3.7,0,7); c.fill();
    c.fillStyle='#071022'; c.beginPath(); c.arc(9.4,-6.6,2.2,0,7); c.fill();
    c.fillStyle='#fff'; c.beginPath(); c.arc(8,-8.2,1.1,0,7); c.fill(); c.beginPath(); c.arc(10.6,-5.2,.6,0,7); c.fill();
    if (blink) { c.fillStyle=C.green; c.beginPath(); c.ellipse(8,-7,5.6,5.4,0,0,7); c.fill(); c.beginPath(); c.moveTo(3,-7); c.lineTo(13,-7); c.stroke(); }
    return;
  }
  c.fillStyle='#fff'; c.lineWidth=1; c.beginPath(); c.ellipse(7.5,-7.2,4.3,3.9,0,0,7); c.stroke(); c.fill();
  if (eye==='dull') { c.fillStyle='#3a3a30'; c.beginPath(); c.arc(8.4,-6.4,1.1,0,7); c.fill(); }
  else {
    c.fillStyle=C.iris; c.beginPath(); c.arc(8.6,-7,2.7,0,7); c.fill();
    c.fillStyle='#071022'; c.beginPath(); c.arc(9.1,-7,1.45,0,7); c.fill();
    c.fillStyle='#fff'; c.beginPath(); c.arc(8.2,-8,0.75,0,7); c.fill();
  }
  if (blink) { c.fillStyle=C.green; c.beginPath(); c.ellipse(7.5,-7.2,4.5,4.1,0,0,7); c.fill(); c.beginPath(); c.moveTo(3.3,-7); c.lineTo(11.8,-7); c.stroke(); }
  c.lineWidth=1.9; c.beginPath(); c.moveTo(2.2,-11.6); c.lineTo(12.6,-8.2); c.stroke();
}

function dinoDrawHead(c,jawDeg,blink,dead,S,C,t){
  const rad=Math.PI/180, L=S.layers, k=0.96*S.head;
  const layer=(list)=>{ c.strokeStyle=C.line; c.lineJoin='round'; c.lineCap='round'; for (let i=0;i<list.length;i++) list[i].d(c,C,t); };
  c.save(); c.scale(k,k); c.lineJoin='round'; c.lineCap='round';
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
  layer(L.b);
  // לוחות על הראש, כשאין כובע
  if (!S.hat && S.pl!=='none') {
    c.strokeStyle=C.line; c.lineWidth=1.5; c.fillStyle=C.blue;
    [[-5,-9.5,3.4],[1.5,-13,3.8],[8,-13.2,3.4]].forEach(p=>{
      c.beginPath(); c.moveTo(p[0]-p[2],p[1]+1.5); c.lineTo(p[0]-p[2]*0.45,p[1]-p[2]*1.25); c.lineTo(p[0]+p[2]*0.9,p[1]-p[2]*0.75); c.lineTo(p[0]+p[2],p[1]+1.5); c.closePath(); c.stroke(); c.fill();
    });
  }
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
  layer(L.j);
  c.restore();
  // שיניים עליונות
  c.fillStyle=C.tooth; c.strokeStyle=C.line; c.lineWidth=0.5;
  [[11.5,1.7],[16,1.2],[20.5,0.7],[25,0.2],[28.6,-0.2]].forEach(p=>{ c.beginPath(); c.moveTo(p[0]-1.5,p[1]-1); c.lineTo(p[0],p[1]+3.3); c.lineTo(p[0]+1.5,p[1]-1); c.closePath(); c.stroke(); c.fill(); });
  // הגולגולת
  skull(); c.strokeStyle=C.line; c.lineWidth=2.2; c.stroke(); c.fillStyle=C.green; c.fill();
  c.save(); skull(); c.clip();
  if (S.pat==='stripes'||S.pat==='rings') { c.strokeStyle=C.blue; c.lineWidth=1.8; [[0,-14,2,-8],[6,-15,7,-10],[19,-11,20,-7.5],[25,-11,25.5,-7.5]].forEach(b=>{ c.beginPath(); c.moveTo(b[0],b[1]); c.lineTo(b[2],b[3]); c.stroke(); }); }
  else if (S.pat==='spots'||S.pat==='patches') { c.fillStyle=C.blue; const r=S.pat==='patches'?1.9:1; [[0,-9,1.7],[17,-8.5,1.5],[24,-8.4,1.1]].forEach(b=>{ c.beginPath(); c.arc(b[0],b[1],b[2]*r,0,7); c.fill(); }); }
  else if (S.pat!=='plain'&&S.pat!=='ribs'&&S.pat!=='paint'&&S.pat!=='stitches'&&S.pat!=='galaxy') { c.fillStyle=C.blue; c.beginPath(); c.moveTo(-10,-18); c.lineTo(16,-18); c.lineTo(13,-11.2); c.lineTo(5,-10.6); c.lineTo(-1,-7); c.lineTo(-9,-1); c.closePath(); c.fill(); }
  c.fillStyle=C.shade; c.beginPath(); c.moveTo(-8,8); c.lineTo(8,1.6); c.lineTo(31,-2.6); c.lineTo(31,1); c.lineTo(8,4); c.closePath(); c.fill();
  c.restore();
  skull(); c.strokeStyle=C.line; c.lineWidth=1.1; c.stroke();
  layer(L.u);
  if (dead) {
    c.strokeStyle=C.line; c.lineWidth=1.7;
    c.beginPath(); c.moveTo(4.5,-9.8); c.lineTo(10.5,-4.8); c.moveTo(10.5,-9.8); c.lineTo(4.5,-4.8); c.stroke();
  } else dinoDrawEye(c,S,C,blink,t);
  c.fillStyle=C.line; c.beginPath(); c.arc(29.2,-6,1,0,7); c.fill();
  layer(L.p);
  c.restore();
}

// הדוגמה על הגוף. g: { M, SR, edge, band }. מצויר בתוך גבולות הגוף.
function dinoPattern(c,S,C,g,t){
  const M=g.M, SR=g.SR, edge=g.edge, band=g.band, dot=(k,o,r,col)=>{ const e=edge(k,o); c.fillStyle=col||C.blue; c.beginPath(); c.arc(e[0],e[1],r,0,7); c.fill(); };
  c.fillStyle=C.blue;
  switch (S.pat) {
    case 'plain': break;
    case 'solid': band(1,M-1,()=>1.1,()=>0.48); c.fill(); break;
    case 'stripes': band(1,M-1,()=>1.1,()=>0.72); c.fill(); for (let k=3;k<M-1;k+=5) { band(k,k+1,()=>1.1,()=>-0.5); c.fill(); } break;
    case 'rings': for (let k=2;k<M-2;k+=6) { band(k,k+2,()=>1.1,()=>-1.1); c.fill(); } break;
    case 'spots': for (let k=2;k<M;k+=3) dot(k,((k*37)%7)/7*1.2-0.3,SR[k]*0.2+0.7); break;
    case 'patches': for (let k=3;k<M;k+=6) { const e=edge(k,k%2?0.3:-0.15), r=SR[k]*0.62+1; c.beginPath(); c.ellipse(e[0],e[1],r*1.25,r*.8,k,0,7); c.fill(); } break;
    case 'scales': c.strokeStyle=C.blue; c.lineWidth=0.8; for (let k=1;k<M;k+=2) for (const o of [0.72,0.25,-0.22]) { const e=edge(k,o+(k%4?0:0.2)); c.beginPath(); c.arc(e[0],e[1],Math.max(.8,SR[k]*.17),0.4,2.8); c.stroke(); } band(1,M-1,()=>1.1,()=>0.8); c.fill(); break;
    case 'check': for (let k=1;k<M-2;k+=3) { const n=Math.floor(k/3)%2; if (n) { band(k,k+3,()=>1.1,()=>0.37); c.fill(); band(k,k+3,()=>-0.37,()=>-1.1); c.fill(); } else { band(k,k+3,()=>0.37,()=>-0.37); c.fill(); } } break;
    case 'seeds': for (let k=3;k<M-1;k+=3) dot(k,((k*29)%5)/5*.9-.3,.95,'#17171a'); band(1,M-1,()=>1.1,()=>0.74); c.fill(); c.fillStyle='#bfe8a8'; band(1,M-1,()=>0.74,()=>0.62); c.fill(); break;
    case 'sprinkles': { band(1,M-1,()=>1.1,k=>k%3?0.1:-0.12); c.fill(); const cols=['#fff','#ffd21a','#4dc9ff','#57d98a']; c.lineWidth=1.1; c.lineCap='round'; for (let k=2;k<M;k+=2) { const e=edge(k,((k*17)%5)/5*.7+.25); c.strokeStyle=cols[k%4]; c.beginPath(); c.moveTo(e[0]-1,e[1]-.6); c.lineTo(e[0]+1,e[1]+.6); c.stroke(); } break; }
    case 'cracks': c.strokeStyle=S.id==='lava'?'rgb(255,'+Math.round(120+70*Math.sin(t*0.12))+',30)':C.blue; c.lineWidth=1.2; c.lineJoin='round'; for (const o of [0.55,-0.1]) { c.beginPath(); for (let k=2;k<M;k+=2) { const e=edge(k,o+((k%6)-3)*0.09); if (k===2) c.moveTo(e[0],e[1]); else c.lineTo(e[0],e[1]); } c.stroke(); } break;
    case 'bolts': band(1,M-1,()=>1.1,k=>k%6===0?-0.5:(k%6===3?0.55:0.3)); c.fill(); break;
    case 'facets': for (let k=1;k<M-3;k+=3) { c.fillStyle=k%2?'rgba(255,255,255,.34)':C.blue; const a=edge(k,1),b=edge(k+3,0.1),d=edge(k+3,1); c.beginPath(); c.moveTo(a[0],a[1]); c.lineTo(b[0],b[1]); c.lineTo(d[0],d[1]); c.closePath(); c.fill(); } break;
    case 'rivets': band(1,M-1,()=>1.1,()=>0.72); c.fill(); c.strokeStyle=C.blue; c.lineWidth=.7; for (let k=4;k<M;k+=6) { const a=edge(k,.72),b=edge(k,-.4); c.beginPath(); c.moveTo(a[0],a[1]); c.lineTo(b[0],b[1]); c.stroke(); } for (let k=3;k<M;k+=3) dot(k,.5,.6); break;
    case 'ribs': { const from=Math.floor(M*.42), to=Math.floor(M*.82); c.fillStyle=C.blue; band(from,to,()=>.62,()=>-.72); c.fill(); c.strokeStyle=C.green; c.lineWidth=1.5; for (let k=from+1;k<to;k+=2) { const a=edge(k,.62),b=edge(k,-.72); c.beginPath(); c.moveTo(a[0],a[1]); c.lineTo(b[0],b[1]); c.stroke(); } c.lineWidth=.9; c.strokeStyle=C.blue; for (let k=2;k<from;k+=2) { const a=edge(k,.7),b=edge(k,-.7); c.beginPath(); c.moveTo(a[0],a[1]); c.lineTo(b[0],b[1]); c.stroke(); } break; }
    case 'stitches': for (let k=4;k<M;k+=9) { const e=edge(k,.4); c.fillStyle=C.blue; c.beginPath(); c.ellipse(e[0],e[1],SR[k]*.45,SR[k]*.3,k,0,7); c.fill(); } c.strokeStyle='#22221a'; c.lineWidth=.8; { const from=Math.floor(M*.45), to=Math.floor(M*.8); c.beginPath(); for (let k=from;k<=to;k++) { const e=edge(k,-.1); if (k===from) c.moveTo(e[0],e[1]); else c.lineTo(e[0],e[1]); } c.stroke(); for (let k=from;k<=to;k+=2) { const a=edge(k,.12),b=edge(k,-.32); c.beginPath(); c.moveTo(a[0],a[1]); c.lineTo(b[0],b[1]); c.stroke(); } } break;
    case 'paint': { const cols=['#e0483d','#2f7fff','#ffd21a','#2fbf5a','#c78bff']; for (let k=2;k<M;k+=4) dot(k,((k*23)%7)/7*1.3-.4,SR[k]*.28+.8,cols[k%5]); break; }
    case 'stars': band(1,M-1,()=>1.1,()=>0.6); c.fill(); for (let k=3;k<M;k+=3) dot(k,((k*31)%7)/7*.9-.3,.7,'#ffe27a'); break;
    case 'galaxy': { const mid=edge(Math.floor(M*.62),0), gr=c.createRadialGradient(mid[0],mid[1],2,mid[0],mid[1],34); gr.addColorStop(0,'rgba(199,92,255,.85)'); gr.addColorStop(.55,'rgba(70,60,220,.5)'); gr.addColorStop(1,'rgba(20,16,56,0)'); c.fillStyle=gr; c.fillRect(-80,-120,180,160); for (let k=1;k<M;k+=2) { const o=((k*41)%9)/9*1.7-.85, tw=.45+.55*Math.abs(Math.sin(t*0.06+k)); dot(k,o,.45+tw*.55,'rgba(255,255,255,'+tw+')'); } break; }
    default: band(1,M-1,()=>1.1,k=>k%4===0?0.12:(k%4===2?0.5:0.68)); c.fill(); // zig: פס על הגב שיורד בפסים לתוך הירוק
  }
}

// הלוחות שעל הגב
function dinoPlates(c,S,C,g,t){
  const M=g.M, SX=g.SX, SY=g.SY, NX=g.NX, NY=g.NY, SR=g.SR, edge=g.edge, pl=S.pl;
  if (pl==='none') return;
  c.strokeStyle=C.line; c.lineWidth=1.25; c.fillStyle=C.blue; c.lineJoin='round';
  if (pl==='sail') {
    const from=Math.floor(M*.3), to=Math.floor(M*.88), H=k=>Math.sin(Math.PI*(k-from)/(to-from))*16;
    c.beginPath();
    for (let k=from;k<=to;k++) { const e=edge(k,.9), h=H(k)*(1+.08*Math.sin(k*1.7)); if (k===from) c.moveTo(e[0]+NX[k]*h,e[1]+NY[k]*h); else c.lineTo(e[0]+NX[k]*h,e[1]+NY[k]*h); }
    for (let k=to;k>=from;k--) { const e=edge(k,.9); c.lineTo(e[0],e[1]); }
    c.closePath(); c.stroke(); c.fill();
    c.strokeStyle='rgba(0,0,0,.35)'; c.lineWidth=.8;
    for (let k=from+2;k<to;k+=2) { const e=edge(k,.9), h=H(k); c.beginPath(); c.moveTo(e[0],e[1]); c.lineTo(e[0]+NX[k]*h,e[1]+NY[k]*h); c.stroke(); }
    return;
  }
  const gap={ blocks:6.2, spikes:6, big:10.5, knobs:6.2, fur:3.2, fins:9, leaf:7, crystal:7, flame:6.5, puff:7 }[pl];
  let run=0, next=7, n=0;
  for (let k=1;k<M-1;k++) {
    run+=Math.hypot(SX[k]-SX[k-1],SY[k]-SY[k-1]);
    if (run<next) continue;
    next=run+gap; n++;
    const tx=-NY[k], ty=NX[k], r=SR[k], h=1.9+r*0.33, b=1.9+r*0.14, e=edge(k,0.94), nx=NX[k], ny=NY[k];
    const P=(a,u)=>[e[0]+tx*a+nx*u, e[1]+ty*a+ny*u];
    const poly=(list,fill)=>{ c.beginPath(); list.forEach((p,i)=>{ if (i) c.lineTo(p[0],p[1]); else c.moveTo(p[0],p[1]); }); c.closePath(); c.stroke(); if (fill) c.fillStyle=fill; c.fill(); };
    switch (pl) {
      case 'spikes': poly([P(-b,0),P(-b*1.2,h*1.9),P(b,0)]); break;
      case 'big': poly([P(-b*1.5,0),P(-b*1.3,h*1.4),P(-b*.1,h*2.6),P(b*1.1,h*1.4),P(b*1.4,0)]); break;
      case 'knobs': c.beginPath(); c.arc(e[0],e[1],1.6+r*.2,0,7); c.stroke(); c.fill(); break;
      case 'fur': poly([P(-1.5,0),P(-2.6,h*1.05),P(1.5,0)]); break;
      case 'fins': poly([P(-b*1.5,0),P(-b*1.7,h*1.3),P(-b*.2,h*1.7),P(b*1.3,0)]); break;
      case 'leaf': c.save(); c.translate(e[0]+nx*h*.6,e[1]+ny*h*.6); c.rotate(Math.atan2(ny,nx)); c.fillStyle=n%2?'#57b860':'#2f8a3a'; c.beginPath(); c.ellipse(1,0,h*.95,b*.72,0,0,7); c.stroke(); c.fill(); c.restore(); break;
      case 'crystal': poly([P(-b,0),P(-b*.5,h*2),P(b*.3,h*2.5),P(b,0)]); c.save(); c.globalAlpha=.55; c.fillStyle='#fff'; c.beginPath(); { const a=P(-b*.5,h*2),d=P(b*.3,h*2.5),f=P(-b*.1,h*.4); c.moveTo(a[0],a[1]); c.lineTo(d[0],d[1]); c.lineTo(f[0],f[1]); } c.closePath(); c.fill(); c.restore(); break;
      case 'flame': { const f=h*(1.5+.7*Math.sin(t*0.4+k*1.3)); poly([P(-b,0),P(-b*.6,f*.7),P(-b*.1,f*1.25),P(b*.5,f*.6),P(b,0)],C.blue); c.save(); c.lineWidth=0; c.fillStyle=C.green; c.beginPath(); { const a=P(-b*.4,0),d=P(0,f*.62),q=P(b*.4,0); c.moveTo(a[0],a[1]); c.lineTo(d[0],d[1]); c.lineTo(q[0],q[1]); } c.closePath(); c.fill(); c.restore(); c.fillStyle=C.blue; break; }
      case 'puff': c.beginPath(); c.arc(e[0],e[1],2.4+r*.28,0,7); c.stroke(); c.fillStyle=C.green; c.fill(); break;
      default: poly([P(-b,0),P(-b*.65,h),P(b*.55,h*.72),P(b,0)]); // blocks
    }
  }
}

// קצה הזנב. tip הקצה, ang הכיוון אליו הזנב פונה.
function dinoTailEnd(c,S,C,g,t){
  if (!S.tail) return;
  const p=g.pts[0], q=g.pts[1], ang=Math.atan2(p[1]-q[1],p[0]-q[0]);
  c.save(); c.translate(p[0],p[1]); c.rotate(ang); c.strokeStyle=C.line; c.lineJoin='round';
  switch (S.tail) {
    case 'club': dkP(c,[-1,-6,4,-8,4,8,-1,6],C.far); dkE(c,3,0,6.5,5.5,C.blue,1.3); dkP(c,[4,-5,6,-10,8,-4],C.claw,.8); dkP(c,[4,5,6,10,8,4],C.claw,.8); break;
    case 'thag': for (const u of [-3,-11]) { dkP(c,[u-2,-1,u-1,-11,u+2,-1],C.claw,1); dkP(c,[u-2,1,u-1,11,u+2,1],C.claw,1); } break;
    case 'flame': { const f=1+.22*Math.sin(t*0.5); dkP(c,[-2,-4,6*f,-6,15*f,0,6*f,6,-2,4],'#ff6a1a',1); dkP(c,[0,-2,5*f,-2.6,10*f,0,5*f,2.6,0,2],'#ffd21a',0); break; }
    case 'arrow': dkP(c,[-1,-1,1,-6,11,0,1,6,-1,1],C.blue,1.2); break;
    case 'fan': { const cols=S.mat==='rainbow'?['#ff5f7e','#ffb13d','#ffe14d','#57d98a','#4dc9ff']:[C.blue,C.green,C.blue,C.green,C.blue]; [-.8,-.4,0,.4,.8].forEach((a,i)=>dkE(c,7*Math.cos(a),7*Math.sin(a),7.5,2.5,cols[i],1,a)); break; }
  }
  c.restore();
}

function dinoWing(c,x,y,S,C,flap,far){
  c.save(); c.translate(x,y); c.rotate((-8+flap)*Math.PI/180); c.strokeStyle=C.line; c.lineJoin='round';
  const kind=S.wings, k=far?.92:1; c.scale(k,k);
  if (kind==='angel') {
    c.scale(1.3,1.3);
    const rows=[[-26,-24,12,4.5,-.9],[-16,-15,10,4,-.7],[-7,-8,8,3.5,-.5],[-33,-13,10,4,-.5],[-22,-6,9,3.5,-.3]];
    rows.forEach(r=>dkE(c,r[0],r[1],r[2],r[3],far?'#d9dfe8':'#ffffff',1,r[4]));
  } else {
    const col=kind==='fire'?(far?'#d9261c':'#ff6a1a'):(far?dinoTint(S.b,-.25):S.b);
    dkP(c,[0,2,-12,-20,-42,-30,-34,-14,-28,-10,-21,-8,-14,-3,-7,4],col,1.3);
    if (kind==='fire') dkP(c,[-5,-1,-13,-13,-30,-22,-22,-11,-14,-6],'#ffd21a',0);
    dkS(c,[-12,-20,-28,-10],C.line,.8); dkS(c,[-12,-20,-14,-3],C.line,.8);
  }
  c.restore();
}

function dinoCape(c,S,C,g,a,moving){
  const chest=g.pts[7], cx=chest[0]-2, cy=chest[1]-9, w=(i)=>Math.sin(a.t*0.22+i*0.9)*(1.2+i*.9)*(.35+moving);
  const lift=a.air*-8*Math.max(0,a.nv), L=[], R=[];
  for (let i=0;i<=5;i++) { const x=cx-i*9, y=cy+i*(2.2+moving*.6)+w(i)+lift*i/5; L.push(x,y); R.unshift(x-1,y+6+i*2.6+w(i)); }
  c.strokeStyle=C.line; dkP(c,L.concat(R),S.cape,1.3);
  dkE(c,cx,cy+1.5,3,2.4,'#ffd21a',.8);
}

// צבעים שמשתנים בזמן: קשת, ברק של מתכת
function dinoMat(c,S,a){
  const C=S.col, t=a.t;
  if (S.mat==='rainbow') {
    const out=Object.assign({},C), mk=(l)=>{ const gr=c.createLinearGradient(-40,0,60,0); for (let i=0;i<=6;i++) gr.addColorStop(i/6,'hsl('+((i*60+t*3)%360)+',92%,'+l+'%)'); return gr; };
    out.green=mk(62); out.far=mk(44); out.shade=mk(50); out.blue=mk(78);
    return out;
  }
  if (S.mat==='shine') {
    const out=Object.assign({},C), s=Math.max(.1,Math.min(.9,((t*0.012)%1.5)-.25)), gr=c.createLinearGradient(-55,-60,65,5);
    gr.addColorStop(0,C.green); gr.addColorStop(Math.max(0,s-.14),C.green); gr.addColorStop(s,'#ffffff'); gr.addColorStop(Math.min(1,s+.14),C.green); gr.addColorStop(1,C.green);
    out.green=gr; return out;
  }
  if (S.mat==='metal') {
    const out=Object.assign({},C), gr=c.createLinearGradient(0,-62,0,0);
    gr.addColorStop(0,dinoTint(S.g,.45)); gr.addColorStop(.55,S.g); gr.addColorStop(1,dinoTint(S.g,-.3));
    out.green=gr; return out;
  }
  return C;
}

// a: { phi, stride, speedK, air, nv, lead, duck, land, idle, dead, t }
function dinoDraw(c,x,y,a,S){
  S=S||DINO_SKINS[0];
  const C=dinoMat(c,S,a), rad=Math.PI/180, TAU=Math.PI*2, P=DINO_POSES;
  let q=dinoMix(dinoMix(P.run,P.duck,a.duck),P.idle,a.idle);
  if (a.air>0) {
    const nv=Math.max(-1,Math.min(1,a.nv));
    q=dinoMix(q, nv<0?dinoMix(P.apex,P.rise,-nv):dinoMix(P.apex,P.fall,nv), a.air);
  }
  if (a.dead>0) q=dinoMix(q,P.dead,a.dead);

  const moving=(1-a.idle)*(1-a.air)*(1-a.dead), s2=Math.sin(TAU*2*a.phi);
  const hipY=dinoHip(a,q.hip);
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
  const fat=S.fat, radii=[0.7,2.4,4.2,6.2,8.6*fat,11.6*fat,12.6*fat,11*fat,8.4*(1+(fat-1)*.5),7.4];

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
  const G={ M,SX,SY,SR,NX,NY,edge,band,pts };

  // הרגליים והזרועות
  const legs=dinoLegs(a,hipY), legN=legs[0], legF=legs[1];
  const chest=pts[7], cN=Math.atan2(pts[8][1]-pts[6][1],pts[8][0]-pts[6][0]);
  const sox=-Math.sin(cN)*-3, soy=Math.cos(cN)*3;
  const armSwing=moving*20*Math.sin(TAU*a.phi);
  const legPat=(S.pat==='zig'||S.pat==='stripes'||S.pat==='bolts')?'bars':(S.pat==='spots'||S.pat==='patches'||S.pat==='stars')?'dots':null;
  // כנפיים: מכות בריצה, פתוחות בירידה
  const flap=S.wings?(moving*16*Math.sin(TAU*a.phi*2)+a.air*(a.nv<0?-24:16)+a.idle*5*Math.sin(a.t*0.06)):0;

  c.save();
  c.translate(x,y);
  const stretch=a.air*Math.abs(a.nv)*0.05, squash=a.land*0.12;
  c.scale(1-stretch*0.6+squash*0.8, 1+stretch-squash);
  c.lineCap='round'; c.lineJoin='round';
  if (S.mat==='ghost') c.globalAlpha=0.68;
  if (S.glow) { c.shadowColor=S.glow; c.shadowBlur=7; }

  const wingAt=pts[6];
  if (S.wings) dinoWing(c,wingAt[0]+3,wingAt[1]-7,S,C,flap-6,true);
  dinoDrawArm(c,chest[0]+sox+3,chest[1]+soy,q.armU-armSwing,q.armF,C.far,C);
  dinoDrawLeg(c,legF,C.far,C,null);
  if (S.cape) dinoCape(c,S,C,G,a,moving);

  dinoPlates(c,S,C,G,a.t);
  dinoTailEnd(c,S,C,G,a.t);

  // הגוף
  tube(); c.strokeStyle=C.line; c.lineWidth=2.5; c.stroke(); c.fillStyle=C.green; c.fill();
  const hadGlow=c.shadowBlur; c.shadowBlur=0;
  c.save(); tube(); c.clip();
  c.fillStyle=C.shade; band(Math.floor(M*0.1),M-1,()=>-0.22,()=>-1.1); c.fill();
  // בטן בהירה: צרה בזנב, רחבה בחזה ובצוואר
  const creamIn=k=>{ const u=k/(M-1); return u<0.62?-0.62:u>0.76?-0.08:dinoL(-0.62,-0.08,(u-0.62)/0.14); };
  c.fillStyle=C.cream; band(Math.floor(M*0.26),M-1,creamIn,()=>-1.1); c.fill();
  c.strokeStyle=C.tan; c.lineWidth=0.8;
  for (let k=Math.floor(M*0.56);k<M;k+=2) { const a0=edge(k,creamIn(k)*(k>M*0.76?1.8:1.05)), a1=edge(k,-1); c.beginPath(); c.moveTo(a0[0],a0[1]); c.lineTo(a1[0],a1[1]); c.stroke(); }
  dinoPattern(c,S,C,G,a.t);
  c.restore();
  tube(); c.strokeStyle=C.line; c.lineWidth=1.1; c.stroke();

  // אביזרי צוואר
  if (S.layers.n.length) {
    const nm=pts[N-2], nAng=Math.atan2(pts[N-1][1]-pts[N-3][1],pts[N-1][0]-pts[N-3][0]);
    c.save(); c.translate(nm[0],nm[1]); c.rotate(nAng); c.strokeStyle=C.line; c.lineJoin='round';
    S.layers.n.forEach(g=>g.d(c,C,a.t));
    c.restore();
  }

  // הראש
  const top=pts[N-1];
  c.save(); c.translate(top[0]+1,top[1]-1); c.rotate(-head*rad);
  dinoDrawHead(c,jaw,a.idle>0.5 && a.t%190<7,a.dead>0.5,S,C,a.t);
  c.restore();

  dinoDrawLeg(c,legN,C.green,C,legPat);
  dinoDrawArm(c,chest[0]+sox,chest[1]+soy+1,q.armU+armSwing,q.armF,C.green,C);
  if (S.wings) dinoWing(c,wingAt[0]-2,wingAt[1]-5,S,C,flap,false);
  c.shadowBlur=hadGlow;
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
  const {DT,DRTL,LI}=dinoMakeT();
  root.innerHTML = DINO_HTML(DT,DRTL);
  const scope = root;

  const wrapEl = scope.querySelector('.dinoWrap'), stageEl = scope.querySelector('.dinoStage');

  const cv = scope.querySelector('#dc'), ctx = cv.getContext('2d');
  // העולם תמיד 820x300, אז המשחק זהה בכל גודל מסך. רק הציור גדל (fitStage).
  const W = 820, H = 300, GROUND = H - 40;
  let RES = 2;
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
    if (el) el.innerHTML = DT('coinBest')+': '+coinBest;
  }

  // ---------- ארנק ודמויות ----------
  // הארנק מצטבר מריצה לריצה ומשלם על דמויות. שיא המטבעות הוא ריצה אחת, וקנייה לא מורידה אותו.
  let wallet = coinBest, owned = ['classic'], skin = DINO_SKINS[0];
  try {
    const w = localStorage.getItem('dino:wallet');
    if (w !== null) wallet = parseInt(w, 10) || 0;
    const o = JSON.parse(localStorage.getItem('dino:owned') || '[]');
    if (Array.isArray(o)) owned = owned.concat(o.filter(id => DINO_SKIN_BY[id] && id !== 'classic'));
    const sk = DINO_SKIN_BY[localStorage.getItem('dino:skin')];
    if (sk && owned.includes(sk.id)) skin = sk;
  } catch(e){}
  function saveWallet(){ try { localStorage.setItem('dino:wallet', String(wallet)); } catch(e){} }
  function saveCloset(){ try { localStorage.setItem('dino:owned', JSON.stringify(owned)); localStorage.setItem('dino:skin', skin.id); } catch(e){} }
  function renderWallet(){
    const el = scope.querySelector('#dinoWallet');
    if (el) el.innerHTML = '<span class="dsDot"></span>'+DT('wallet')+': '+wallet;
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
    wallet++; saveWallet(); renderWallet();
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
    const a = Object.assign({}, anim, { phi: anim.phi+(state==='play'&&dino.ground?speed/(anim.stride*(1-anim.duck*DINO_DUCK_STEP))*alpha:0) });
    dinoDraw(ctx, dino.x, yR, a, skin);
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

  // ---------- חנות ----------
  const shopBtn = scope.querySelector('#dinoShopBtn');
  let shopEl = null, shopOpen = false, pick = skin, prevFx = [];
  const prevAnim = { phi:0, stride:78, speedK:0, air:0, nv:0, lead:0, duck:0, land:0, idle:0, dead:0, t:0 };
  const skinName = S => S.names[LI] || S.names[0];

  function buildShop(){
    shopEl = document.createElement('div');
    shopEl.className = 'dsShop';
    shopEl.innerHTML = '<div class="dsHead"><h3>'+DT('shopTitle')+'</h3><span class="dsCount"></span><span class="dsWallet"></span><button type="button" class="dsClose">✕</button></div>'
      +'<div class="dsPrev"><canvas width="600" height="240"></canvas><div class="dsInfo"><div class="dsName"></div><button type="button" class="dsAct"></button></div></div>'
      +'<div class="dsGrid"></div>';
    wrapEl.appendChild(shopEl);
    const grid = shopEl.querySelector('.dsGrid');
    DINO_SKINS.forEach(S => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'dsCard'; b.dataset.id = S.id;
      b.innerHTML = '<canvas width="200" height="168"></canvas><span class="dsCardName"></span><span class="dsPrice"></span>';
      b.querySelector('.dsCardName').textContent = skinName(S);
      const c = b.querySelector('canvas').getContext('2d');
      c.setTransform(1.44,0,0,1.44,92,158);   // הדמות הגבוהה ביותר נכנסת למשבצת
      dinoDraw(c, 0, 0, { phi:0, stride:78, speedK:0, air:0, nv:0, lead:0, duck:0, land:0, idle:1, dead:0, t:60 }, S);
      grid.appendChild(b);
    });
    grid.addEventListener('click', e => {
      const b = e.target.closest('.dsCard');
      if (b) { pick = DINO_SKIN_BY[b.dataset.id]; prevFx = []; refreshShop(); }
    });
    shopEl.querySelector('.dsClose').addEventListener('click', closeShop);
    shopEl.querySelector('.dsAct').addEventListener('click', shopAction);
  }

  function shopAction(){
    if (!owned.includes(pick.id)) {
      if (wallet < pick.price) return;
      wallet -= pick.price;
      owned.push(pick.id);
      saveWallet(); renderWallet();
      sfx('record');
    } else sfx('coin', 0);
    skin = pick;
    saveCloset();
    refreshShop();
  }

  function refreshShop(){
    shopEl.querySelector('.dsCount').textContent = (owned.length-1)+' / '+(DINO_SKINS.length-1);
    shopEl.querySelector('.dsWallet').innerHTML = '<span class="dsDot"></span>'+wallet;
    shopEl.querySelector('.dsName').textContent = skinName(pick);
    const act = shopEl.querySelector('.dsAct'), mine = owned.includes(pick.id);
    act.disabled = pick === skin || (!mine && wallet < pick.price);
    act.innerHTML = pick === skin ? DT('shopOn') : mine ? DT('shopUse')
      : wallet >= pick.price ? DT('shopBuy')+' <span class="dsDot"></span> '+pick.price
      : DT('shopNeed')+' <span class="dsDot"></span> '+(pick.price-wallet);
    shopEl.querySelectorAll('.dsCard').forEach(b => {
      const S = DINO_SKIN_BY[b.dataset.id], have = owned.includes(S.id), p = b.querySelector('.dsPrice');
      b.classList.toggle('sel', S === pick);
      b.classList.toggle('on', S === skin);
      p.className = 'dsPrice'+(have ? ' have' : wallet < S.price ? ' no' : '');
      p.innerHTML = have ? '✓' : '<span class="dsDot"></span>'+S.price;
    });
  }

  function openShop(){
    if (state === 'play') return;
    if (!shopEl) buildShop();
    shopOpen = true; pick = skin; prevFx = [];
    shopEl.style.display = '';
    refreshShop();
    const grid = shopEl.querySelector('.dsGrid'), on = grid.querySelector('.dsCard.on');
    if (on) grid.scrollTop = on.offsetTop-grid.offsetTop-8;
  }
  function closeShop(){
    shopOpen = false;
    if (shopEl) shopEl.style.display = 'none';
  }
  function syncShopBtn(){ if (shopBtn) shopBtn.style.visibility = state === 'play' ? 'hidden' : 'visible'; }
  if (shopBtn) {
    shopBtn.addEventListener('mousedown', e => e.preventDefault());   // בלי מיקוד: רווח שייך למשחק ולא לכפתור
    shopBtn.addEventListener('click', openShop);
  }

  // הדמות שנבחרה רצה בחלון התצוגה של החנות
  function stepShopPreview(){
    prevAnim.t++; prevAnim.phi += 5/78;
    if (pick.fx && prevAnim.t % DINO_FX_RATE[pick.fx] === 0) prevFx.push(dinoFxSpawn(pick.fx, 140, 106, 2));
    for (let i = prevFx.length-1; i >= 0; i--) {
      const p = prevFx[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--;
      if (p.life <= 0) prevFx.splice(i,1);
    }
  }
  function drawShopPreview(){
    const c = shopEl.querySelector('.dsPrev canvas').getContext('2d');
    c.setTransform(2,0,0,2,0,0);
    c.fillStyle = '#7fb2d6'; c.fillRect(0,0,300,120);
    c.fillStyle = '#3a3226'; c.fillRect(0,106,300,14);
    c.fillStyle = '#e0c9a6'; c.fillRect(0,105,300,2);
    dinoDraw(c, 140, 106, prevAnim, pick);
    prevFx.forEach(p => dinoFxDraw(c, p));
  }

  // צעד אחד של העולם, 60 בשנייה בכל מסך: במסך מהיר המשחק לא רץ מהר יותר
  function step(){
    frame++;
    prevScroll = scroll; dino.py = dino.y;
    anim.t++;
    if (shopOpen) stepShopPreview();
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

      if (skin.fx && frame % DINO_FX_RATE[skin.fx] === 0) particles.push(dinoFxSpawn(skin.fx, dino.x, dino.y, speed));
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
        anim.phi += speed/(anim.stride*(1-anim.duck*DINO_DUCK_STEP));
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
      p.x += p.vx; p.y += p.vy; p.vy += p.fx ? p.g : p.dust ? 0.02 : 0.2; p.life--;
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
      if (p.fx) dinoFxDraw(ctx, p);
      else if (p.dust) {
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
        { t:DT('coinsPrefix')+coinCount+'  ·  '+DT('coinBest')+': '+coinBest+'  ·  '+DT('wallet')+': '+wallet, f:'bold 15px Heebo, sans-serif' }
      ];
      if (coinRecord) lines.push({ t:DT('newCoinBest'), c:'#ffd166', f:'bold 17px Heebo, sans-serif' });
      lines.push({ t:DT('againPrompt'), c:'#8ba0b5', f:'bold 14px Heebo, sans-serif' });
      centerText(lines);
    }

    ctx.restore();
    if (shopOpen) drawShopPreview();
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
    syncShopBtn();
    sfx('start');
  }

  function die(){
    state = 'dead'; shake = 12; deadWait = 30;
    syncShopBtn();
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
    if (shopOpen) { if (e.code === 'Escape') closeShop(); return; }
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

  // הבמה תופסת את כל המקום ושומרת על היחס, ומשאירה מקום להסבר ולטבלת השיאים
  const LOWER_MIN = 104;
  function fitStage(){
    const cs = getComputedStyle(wrapEl), gap = parseFloat(cs.rowGap) || 0, touch = scope.querySelector('.dinoTouch').offsetHeight;
    const aw = wrapEl.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
    const ah = wrapEl.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom)-scope.querySelector('.dinoTop').offsetHeight-touch-LOWER_MIN-gap*(touch?3:2);
    wrapEl.classList.toggle('dinoNarrow', aw < 640);
    const k = Math.max(0.2, Math.min(aw/W, ah/H)), cw = Math.floor(W*k);
    stageEl.style.width = cw+'px';
    stageEl.style.height = Math.floor(H*k)+'px';
    // רזולוציה לפי הגודל האמיתי על המסך, כדי שהציור יישאר חד גם במסך מלא
    const res = Math.max(2, Math.min(3, Math.ceil(cw*(window.devicePixelRatio||1)/W)));
    if (res !== RES) {
      RES = res; cv.width = W*RES; cv.height = H*RES;
      ctx.direction = DRTL ? 'rtl' : 'ltr';
      render(acc/STEP_MS);
    }
  }
  const stageObs = new ResizeObserver(fitStage);
  stageObs.observe(wrapEl);
  fitStage();

  renderBoard();
  renderSound();
  renderWallet();
  renderCoinBest();
  raf = requestAnimationFrame(loop);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    stageObs.disconnect();
    if (audio) audio.close().catch(() => {});
    document.removeEventListener('keydown', kd);
    document.removeEventListener('keyup', ku);
    window.removeEventListener('blur', blur);
    window.removeEventListener('pointerup', releaseJump);
    window.removeEventListener('pointercancel', releaseJump);
  };
}
