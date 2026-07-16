// ============================================
//  משחק: DINO RUNNER
//  רק דינוזאור · מימין לשמאל · טבלת שיאים
// ============================================

const DINO_HTML = `
<div class="dinoWrap">
  <div class="dinoTop"><span class="dinoTitle">DINO RUNNER</span></div>
  <div class="dinoStage">
    <canvas id="dc" width="820" height="300"></canvas>
  </div>
  <div class="dinoHint">רווח / ↑ = קפיצה • ↓ = התכופפות<br>ציפור גבוהה: רוץ מתחת · אמצע: קפוץ או התכופף · נמוכה: קפוץ מעל</div>
  <div id="board"><h3>&#127942; טבלת שיאים</h3><div id="boardRows"></div></div>
</div>
`;

function mountDino(root) {
  root.innerHTML = DINO_HTML;
  const scope = root;
  const cv = scope.querySelector('#dc'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, GROUND = H - 46;

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
      rows.innerHTML = '<div id="empty">עדיין אין שיאים — שחק כדי להתחיל!</div>';
      return;
    }
    let html = '<div class="brow head"><span class="rank">#</span><span class="sc">ניקוד</span></div>';
    topScores.forEach((s, i) => {
      const medal = i===0 ? '🥇' : i===1 ? '🥈' : i===2 ? '🥉' : (i+1);
      const isNew = s === lastScore ? ' me' : '';
      html += '<div class="brow'+isNew+'"><span class="rank">'+medal+'</span><span class="sc">'+s+'</span></div>';
    });
    rows.innerHTML = html;
  }

  // ---------- טעינת הדינוזאור ----------
  const dinoImg = new Image();
  dinoImg.src = 'data:image/png;base64,' + SPRITES['dino'];

  const runFrames = (typeof RUN_ANIMS !== 'undefined' && RUN_ANIMS['dino'])
    ? RUN_ANIMS['dino'].map(b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; return im; })
    : [];

  let state = 'menu', score = 0, speed = 4, frame = 0, shake = 0, raf;
  let running = true;

  const dino = {
    x: 80, y: GROUND, vy: 0, w: 62, h: 56, ground: true, duck: false,
    reset(){ this.y = GROUND; this.vy = 0; this.ground = true; this.duck = false; },
    jump(){ if (this.ground) { this.vy = -20.45 ; this.ground = false; } },
    box(){
      const h = this.duck && this.ground ? 30 : this.h;
      const w = this.duck && this.ground ? 70 : this.w;
      return { x: this.x + 6, y: this.y - h + 4, w: w - 14, h: h - 6 };
    }
  };

  let obstacles = [], particles = [], clouds = [], stars = [];
  for (let i = 0; i < 6; i++) clouds.push({ x: Math.random()*W, y: 30+Math.random()*90, s: .3+Math.random()*.5, w: 40+Math.random()*40 });
  for (let i = 0; i < 45; i++) stars.push({ x: Math.random()*W, y: Math.random()*(GROUND-40), r: Math.random()*1.5 });

  const BIRD_HIGH = GROUND-78, BIRD_MID = GROUND-44, BIRD_LOW = GROUND-16;

  function spawnObstacle(){
    const minGap = 240 + speed*16;
    if (obstacles.length > 0) {
      const last = obstacles[obstacles.length-1];
      if (W - (last.x + last.w) < minGap) return;
    }
    if (Math.random() < 0.32 && score > 300) {
      const lvl = ['high','mid','low'][Math.floor(Math.random()*3)];
      const y = lvl==='high' ? BIRD_HIGH : lvl==='mid' ? BIRD_MID : BIRD_LOW;
      obstacles.push({ type:'bird', level:lvl, x: W+40, y, w:46, h:24 });
    } else {
      const big = Math.random() < 0.5;
      let n;
      if (big) n = [1,2,2,3,3][Math.floor(Math.random()*5)];
      else n = 1 + Math.floor(Math.random()*3);
      const unit = big?22:15, baseH = big?54:32;
      obstacles.push({ type:'cactus', big, x: W+40, y: GROUND, w: unit*n, h: baseH, n, unit });
    }
  }

  function burst(x,y,color,n){
    n = n || 10;
    for (let i=0;i<n;i++) particles.push({ x, y, vx:(Math.random()-.5)*5, vy:(Math.random()-.5)*5-1, life:24, color });
  }

  function dayFactor(){ const p = (score%1000)/1000; return (Math.cos(p*2*Math.PI)+1)/2; }
  function mix(a,b,t){ return a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(','); }
  function roundRect(x,y,w,h,r){
    ctx.beginPath(); ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function hit(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }

  let groundOffset = 0;

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
      if (state==='play') c.x -= c.s*(speed/6);
      if (c.x < -c.w) { c.x = W+c.w; c.y = 30+Math.random()*90; }
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.w, c.w*0.4, 0, 0, 7);
      ctx.ellipse(c.x+c.w*0.6, c.y-6, c.w*0.5, c.w*0.35, 0, 0, 7);
      ctx.fill();
    });
  }

  function drawGround(){
    ctx.fillStyle = '#3a3226'; ctx.fillRect(0, GROUND+6, W, H-GROUND);
    ctx.strokeStyle = '#e0c9a6'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0,GROUND+6); ctx.lineTo(W,GROUND+6); ctx.stroke();
    if (state==='play') groundOffset = (groundOffset+speed) % 60;
    ctx.fillStyle = 'rgba(224,201,166,.5)';
    for (let x = -groundOffset; x < W; x += 60) {
      ctx.fillRect(x, GROUND+16, 8, 3);
      ctx.fillRect(x+30, GROUND+26, 5, 2);
    }
  }

  function drawDino(){
    const ducking = dino.duck && dino.ground;
    const dH = ducking ? dino.h*0.55 : dino.h;
    const dW = ducking ? dino.w*1.35 : dino.w;
    const isRunning = dino.ground && !ducking && state === 'play';

    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath(); ctx.ellipse(dino.x+dW/2, GROUND+8, dW/2, 5, 0, 0, 7); ctx.fill();

    if (isRunning && runFrames.length && runFrames[0].complete) {
      const fi = Math.floor(frame/4) % runFrames.length;
      const im = runFrames[fi];
      const asp = im.width/im.height, dw = dH*asp;
      ctx.drawImage(im, dino.x+(dino.w-dw)/2, dino.y-dH, dw, dH);
      return;
    }

    const idleBob = dino.ground && !ducking && state !== 'play' ? Math.sin(frame*0.4)*1.5 : 0;
    const dY = dino.y - dH + idleBob;
    const im = (runFrames.length && runFrames[0].complete) ? runFrames[0] : dinoImg;
    if (im && im.complete) {
      if (ducking) {
        ctx.drawImage(im, dino.x-(dW-dino.w)/2, dY, dW, dH);
      } else {
        const asp = im.width/im.height, dw = dH*asp;
        ctx.drawImage(im, dino.x+(dino.w-dw)/2, dY, dw, dH);
      }
    } else {
      ctx.fillStyle = '#4a8f52'; roundRect(dino.x, dY, dW, dH, 8); ctx.fill();
    }
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
    const cx = o.x+o.w/2, cy = o.y+6, t = frame*0.3, flap = Math.sin(t);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.beginPath(); ctx.ellipse(cx, GROUND+8, 16, 4, 0, 0, 7); ctx.fill();

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
    ctx.fillStyle = '#e8eef5'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'right';
    ctx.fillText(String(score).padStart(5,'0'), W-20, 32);
    ctx.font = 'bold 14px monospace'; ctx.fillStyle = '#e8eef5';
    ctx.fillText('HI '+String(myBest).padStart(5,'0'), W-20, 52);
    ctx.textAlign = 'left';
  }

  function centerText(lines){
    ctx.fillStyle = 'rgba(8,12,18,.7)'; ctx.fillRect(0,0,W,H);
    ctx.textAlign = 'center';
    lines.forEach((l,i) => {
      ctx.fillStyle = l.c || '#e8eef5';
      ctx.font = l.f || 'bold 20px monospace';
      ctx.fillText(l.t, W/2, H/2-(lines.length-1)*18+i*36);
    });
    ctx.textAlign = 'left';
  }

  function loop(){
    if (!running) return;
    raf = requestAnimationFrame(loop);
    frame++;
    ctx.save();
    if (shake > 0) { ctx.translate((Math.random()-.5)*shake, (Math.random()-.5)*shake); shake -= 0.6; }

    drawBackground(); drawGround();

    if (state === 'play') {
      dino.vy += 0.42;
      dino.y += dino.vy;
      if (dino.y >= GROUND) { dino.y = GROUND; dino.vy = 0; dino.ground = true; }

      if (frame % Math.floor(74+Math.random()*40) === 0) spawnObstacle();
      if (frame % 6 === 0) score++;
      if (speed < 13) speed += 0.0018;

      const db = dino.box();
      for (let i = obstacles.length-1; i >= 0; i--) {
        const o = obstacles[i];
        o.x -= speed;
        const ob = o.type==='cactus' ? { x:o.x, y:o.y-o.h, w:o.w, h:o.h } : o;
        if (hit(db, ob)) die();
        if (o.x + o.w < -30) obstacles.splice(i,1);
      }
    }

    obstacles.forEach(drawObstacle);
    drawDino();

    for (let i = particles.length-1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life--;
      ctx.fillStyle = 'rgba('+p.color+','+(p.life/24)+')';
      ctx.fillRect(p.x, p.y, 3, 3);
      if (p.life <= 0) particles.splice(i,1);
    }

    drawHUD();

    if (state === 'menu') centerText([
      { t:'DINO RUNNER', c:'#ffd166', f:'bold 30px monospace' },
      { t:'רווח / ↑ להתחלה', f:'bold 15px monospace', c:'#8ba0b5' }
    ]);
    if (state === 'dead') centerText([
      { t:'נפסלת!', c:'#d9856b', f:'bold 30px monospace' },
      { t:'ניקוד '+score, f:'bold 16px monospace' },
      { t:'השיא שלך: '+myBest, c:'#ffd166', f:'bold 15px monospace' },
      { t:'רווח לשחק שוב', c:'#8ba0b5', f:'bold 14px monospace' }
    ]);

    ctx.restore();
  }

  function startGame(){
    state = 'play'; score = 0; speed = 4;
    obstacles = []; particles = [];
    dino.reset();
  }

  function die(){
    state = 'dead'; shake = 12;
    const b = dino.box();
    burst(b.x+b.w/2, b.y+b.h/2, '217,133,107', 20);
    lastScore = score;
    saveScore(score);
  }

  const kd = e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (state === 'play') dino.jump(); else startGame();
    }
    if (e.code === 'ArrowDown') { e.preventDefault(); dino.duck = true; }
  };
  const ku = e => { if (e.code === 'ArrowDown') dino.duck = false; };
  const blur = () => { dino.duck = false; };

  document.addEventListener('keydown', kd);
  document.addEventListener('keyup', ku);
  window.addEventListener('blur', blur);
  cv.addEventListener('pointerdown', () => {
    if (state === 'play') dino.jump(); else startGame();
  });

  renderBoard();
  loop();

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', kd);
    document.removeEventListener('keyup', ku);
    window.removeEventListener('blur', blur);
  };
}
