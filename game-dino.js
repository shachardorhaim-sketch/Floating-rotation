// ============================================
//  משחק: DINO RUNNER
// ============================================

const DINO_HTML = "\n<div class=\"dinoWrap\">\n  <div class=\"dinoTop\"><span class=\"dinoTitle\">DINO RUNNER</span><button id=\"shopBtn\">&#128722; חנות</button></div>\n  <div class=\"dinoStage\">\n    <canvas id=\"dc\" width=\"820\" height=\"300\"></canvas>\n    <div id=\"nameScreen\">\n      <h2>מה השם שלך?</h2>\n      <input id=\"nameInput\" maxlength=\"12\" placeholder=\"לפחות 3 אותיות...\" />\n      <div id=\"nameErr\"></div>\n      <button class=\"dbtn\" id=\"saveNameBtn\">התחל לשחק</button>\n    </div>\n    <div id=\"shopScreen\">\n      <div class=\"shopHead\"><h2>&#128722; חנות דמויות</h2>\n        <div class=\"shopCoins\">&#128176; <span id=\"shopCoins\">0</span></div>\n        <button id=\"shopClose\">סגור ✕</button></div>\n      <div id=\"shopGrid\"></div>\n    </div>\n  </div>\n  <div class=\"dinoHint\">רווח / ↑ = קפיצה • ↓ = התכופפות<br>ציפור גבוהה: רוץ מתחת · אמצע: קפוץ או התכופף · נמוכה: קפוץ מעל</div>\n  <div id=\"board\"><h3>&#127942; טבלת שיאים</h3><div id=\"boardRows\"></div></div>\n</div>\n";

function mountDino(root) {
  root.innerHTML = DINO_HTML;
  const scope = root;
  const cv = scope.querySelector('#dc'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, GROUND = H - 46;

  const images = {};
  CHARS.forEach(c => { const im = new Image(); im.src = 'data:image/png;base64,'+SPRITES[c.key]; images[c.key]=im; });
  // טעינת אנימציות ריצה (לכל דמות שיש לה)
  const runAnims = {};
  Object.keys(RUN_ANIMS).forEach(key => {
    runAnims[key] = RUN_ANIMS[key].map(b64 => { const im = new Image(); im.src = 'data:image/png;base64,'+b64; return im; });
  });

  let playerName='', myBest=0, totalCoins=0, owned=['dino'], current='dino';
  let state='loading', score=0, coins=0, speed=4, frame=0, shake=0, raf;
  let running = true;

  const nameScreen = scope.querySelector('#nameScreen');
  const nameInput = scope.querySelector('#nameInput');
  const shopScreen = scope.querySelector('#shopScreen');

  async function initPlayer() {
    try { const s = await window.storage.get('playerName'); if (s&&s.value){ playerName=s.value; nameScreen.style.display='none'; state='menu'; await loadProfile(); } } catch(e){}
    loadBoard();
  }
  scope.querySelector('#saveNameBtn').onclick = async () => {
    const n = nameInput.value.trim(); const err = scope.querySelector('#nameErr');
    if (n.length<3){ err.textContent='השם חייב להיות לפחות 3 אותיות'; nameInput.focus(); return; }
    try { const ex = await window.storage.get('score:'+n,true); const mine = await window.storage.get('playerName'); const isMine = mine&&mine.value===n;
      if (ex&&ex.value&&!isMine){ err.textContent='השם "'+n+'" כבר תפוס — בחר שם אחר'; nameInput.focus(); return; } } catch(e){}
    err.textContent=''; playerName=n; try{ await window.storage.set('playerName',n); }catch(e){}
    nameScreen.style.display='none'; state='menu'; await loadProfile();
  };
  nameInput.addEventListener('keydown',e=>{ if(e.key==='Enter') scope.querySelector('#saveNameBtn').click(); });

  async function loadProfile() {
    try{ const c=await window.storage.get('coins:'+playerName); if(c&&c.value) totalCoins=parseInt(c.value)||0; }catch(e){}
    try{ const o=await window.storage.get('owned:'+playerName); if(o&&o.value) owned=JSON.parse(o.value); }catch(e){}
    try{ const cu=await window.storage.get('current:'+playerName); if(cu&&cu.value) current=cu.value; }catch(e){}
    if(!owned.includes('dino')) owned.push('dino');
  }
  async function saveProfile() {
    try{ await window.storage.set('coins:'+playerName,String(totalCoins)); }catch(e){}
    try{ await window.storage.set('owned:'+playerName,JSON.stringify(owned)); }catch(e){}
    try{ await window.storage.set('current:'+playerName,current); }catch(e){}
  }
  function openShop(){ renderShop(); shopScreen.style.display='flex'; }
  function closeShop(){ shopScreen.style.display='none'; }
  function renderShop(){
    scope.querySelector('#shopCoins').textContent = totalCoins;
    const g = scope.querySelector('#shopGrid'); g.innerHTML='';
    CHARS.forEach(c=>{
      const isOwned=owned.includes(c.key), isCur=current===c.key, isPrem=c.price>550;
      const card=document.createElement('div');
      card.className='shopCard'+(isCur?' current':'')+(isPrem&&!isCur?' premium':'');
      let btn;
      if(isCur) btn='<div class="tag sel">נבחר ✓</div>';
      else if(isOwned) btn='<button class="sbtn use">בחר</button>';
      else btn='<button class="sbtn buy">&#128176; '+c.price+'</button>';
      card.innerHTML='<div class="thumb"><img src="data:image/png;base64,'+SPRITES[c.key]+'"/></div><div class="cname">'+c.name+'</div>'+btn;
      const b=card.querySelector('button');
      if(b){ if(isOwned) b.onclick=async()=>{ current=c.key; await saveProfile(); renderShop(); };
        else b.onclick=async()=>{ if(totalCoins>=c.price){ totalCoins-=c.price; owned.push(c.key); current=c.key; await saveProfile(); renderShop(); } else { b.textContent='אין מספיק!'; b.classList.add('nope'); setTimeout(renderShop,900);} }; }
      g.appendChild(card);
    });
  }
  scope.querySelector('#shopClose').onclick=closeShop;
  scope.querySelector('#shopBtn').onclick=openShop;

  async function loadBoard(){ try{ const mb=await window.storage.get('myBest:'+playerName); if(mb&&mb.value) myBest=parseInt(mb.value)||0; }catch(e){} renderBoard(); }
  async function saveScore(sc,cg){
    if(sc>myBest){ myBest=sc; try{ await window.storage.set('myBest:'+playerName,String(sc)); }catch(e){} }
    totalCoins+=cg; await saveProfile();
    try{ const key='score:'+playerName; let prev=0; try{ const p=await window.storage.get(key,true); if(p&&p.value) prev=parseInt(p.value)||0; }catch(e){}
      if(sc>prev) await window.storage.set(key,String(sc),true); }catch(e){}
    renderBoard();
  }
  async function renderBoard(){
    const rows=scope.querySelector('#boardRows');
    try{ const list=await window.storage.list('score:',true);
      if(!list||!list.keys||list.keys.length===0){ rows.innerHTML='<div id="empty">עדיין אין שיאים — תהיה הראשון!</div>'; return; }
      const ent=[]; for(const k of list.keys){ try{ const v=await window.storage.get(k,true); ent.push({name:k.replace('score:',''),score:parseInt(v.value)||0}); }catch(e){} }
      ent.sort((a,b)=>b.score-a.score);
      let html='<div class="brow head"><span class="rank">#</span><span class="nm">שחקן</span><span class="sc">ניקוד</span></div>';
      ent.slice(0,10).forEach((e,i)=>{ const me=e.name===playerName?' me':''; const md=i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);
        html+='<div class="brow'+me+'"><span class="rank">'+md+'</span><span class="nm">'+e.name+'</span><span class="sc">'+e.score+'</span></div>'; });
      rows.innerHTML=html;
    }catch(e){ rows.innerHTML='<div id="empty">טוען...</div>'; }
  }

  const dino={ x:80,baseX:80,y:GROUND,vy:0,vx:0,w:62,h:56,ground:true,duck:false,
    reset(){ this.y=GROUND;this.vy=0;this.vx=0;this.x=this.baseX;this.ground=true;this.duck=false; },
    jump(){ if(this.ground){ this.vy=-13.2; this.vx=-3.2; this.ground=false; } },   // קופץ קדימה — שמאלה
    box(){ const h=this.duck&&this.ground?30:this.h,w=this.duck&&this.ground?70:this.w; return {x:this.x+6,y:this.y-h+4,w:w-14,h:h-6}; } };

  let obstacles=[],collectibles=[],particles=[],clouds=[],stars=[];
  for(let i=0;i<6;i++) clouds.push({x:Math.random()*W,y:30+Math.random()*90,s:.3+Math.random()*.5,w:40+Math.random()*40});
  for(let i=0;i<45;i++) stars.push({x:Math.random()*W,y:Math.random()*(GROUND-40),r:Math.random()*1.5});
  const BIRD_HIGH=GROUND-78,BIRD_MID=GROUND-44,BIRD_LOW=GROUND-16;

  function spawnObstacle(){
    const minGap=240+speed*16;
    if(obstacles.length>0){ const last=obstacles[obstacles.length-1]; if(W-(last.x+last.w)<minGap) return; }
    for(const c of collectibles) if(c.x>W-100) return;
    if(Math.random()<0.32&&score>300){ const lvl=['high','mid','low'][Math.floor(Math.random()*3)]; const y=lvl==='high'?BIRD_HIGH:lvl==='mid'?BIRD_MID:BIRD_LOW;
      obstacles.push({type:'bird',level:lvl,x:W+40,y,w:46,h:24}); }
    else { const big=Math.random()<0.5; let n; if(big) n=[1,2,3,3,4][Math.floor(Math.random()*5)]; else n=1+Math.floor(Math.random()*3);
      const unit=big?22:15,baseH=big?54:32; obstacles.push({type:'cactus',big,x:W+40,y:GROUND,w:unit*n,h:baseH,n,unit}); }
  }
  function spawnCoin(){
    const SAFE=90;
    function isClear(x,y){ for(const o of obstacles){ const ox=o.x,oy=o.type==='cactus'?o.y-o.h:o.y,ow=o.w,oh=o.type==='cactus'?o.h:o.h;
      if(x+11>ox-SAFE&&x-11<ox+ow+SAFE&&y+11>oy-SAFE&&y-11<oy+oh+SAFE) return false; } for(const c of collectibles) if(c.x>W-40&&Math.abs(c.x-x)<30) return false; return true; }
    const low=Math.random()<0.7; const y=low?GROUND-22-Math.random()*35:GROUND-58-Math.random()*45; const sx=W+40;
    if(!isClear(sx,y)) return;
    if(Math.random()<0.4){ if(isClear(sx+34,y)&&isClear(sx+68,y)) for(let i=0;i<3;i++) collectibles.push({x:sx+i*34,y,r:11,spin:i*0.5}); else collectibles.push({x:sx,y,r:11,spin:0}); }
    else collectibles.push({x:sx,y,r:11,spin:0});
  }
  function burst(x,y,color,n){ n=n||10; for(let i=0;i<n;i++) particles.push({x,y,vx:(Math.random()-.5)*5,vy:(Math.random()-.5)*5-1,life:24,color}); }
  function dayFactor(){ const p=(score%1000)/1000; return (Math.cos(p*2*Math.PI)+1)/2; }
  function mix(a,b,t){ return a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(','); }
  function roundRect(x,y,w,h,r){ ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath(); }
  function hit(a,b){ return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y; }

  let groundOffset=0;
  function drawBackground(){ const t=dayFactor(); const top=mix([13,22,42],[93,173,226],t),bot=mix([27,58,75],[224,201,166],t*0.6);
    const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'rgb('+top+')'); g.addColorStop(1,'rgb('+bot+')'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    if(t<0.45){ ctx.fillStyle='rgba(255,255,255,'+((0.45-t)*1.8)+')'; stars.forEach(s=>{ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,7);ctx.fill();}); }
    ctx.fillStyle=t>0.45?'#ffd166':'#dfe7ef'; ctx.beginPath();ctx.arc(W-100,62+(1-t)*26,26,0,7);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,'+(0.15+t*0.25)+')'; clouds.forEach(c=>{ if(state==='play')c.x-=c.s*(speed/6); if(c.x<-c.w){c.x=W+c.w;c.y=30+Math.random()*90;}
      ctx.beginPath();ctx.ellipse(c.x,c.y,c.w,c.w*0.4,0,0,7);ctx.ellipse(c.x+c.w*0.6,c.y-6,c.w*0.5,c.w*0.35,0,0,7);ctx.fill(); }); }
  function drawGround(){ ctx.fillStyle='#3a3226';ctx.fillRect(0,GROUND+6,W,H-GROUND); ctx.strokeStyle='#e0c9a6';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(0,GROUND+6);ctx.lineTo(W,GROUND+6);ctx.stroke(); if(state==='play')groundOffset=(groundOffset+speed)%60;
    ctx.fillStyle='rgba(224,201,166,.5)'; for(let x=-groundOffset;x<W;x+=60){ctx.fillRect(x,GROUND+16,8,3);ctx.fillRect(x+30,GROUND+26,5,2);} }
  function drawDino(){ ctx.fillStyle='rgba(0,0,0,.22)';
    const ducking = dino.duck&&dino.ground;
    const dH = ducking ? dino.h*0.55 : dino.h;
    const dW = ducking ? dino.w*1.35 : dino.w;

    const running = dino.ground && !ducking && state==='play';
    const anim = runAnims[current];   // האם לדמות הנוכחית יש אנימציית ריצה מסרטון?
    const hasAnim = anim && anim[0] && anim[0].complete;

    // אם לדמות יש אנימציית ריצה אמיתית (מסרטון) ורצים — משתמשים בה
    if (hasAnim && running) {
      ctx.beginPath();ctx.ellipse(dino.x+dW/2,GROUND+8,dW/2,5,0,0,7);ctx.fill();
      const fi = Math.floor(frame/4) % anim.length;
      const im = anim[fi];
      const asp = im.width/im.height, dw = dH*asp;
      ctx.drawImage(im, dino.x+(dino.w-dw)/2, dino.y-dH, dw, dH);
      return;
    }

    // --- אנימציית ריצה ע"י הזזת רגליים (לכל דמות בלי סרטון) ---
    const im0 = images[current];
    if (running && im0 && im0.complete && !hasAnim) {
      const asp = im0.width/im0.height, dw = dH*asp;
      const px = dino.x+(dino.w-dw)/2;       // מיקום ציור
      const legSplit = 0.62;                  // איפה חותכים גוף/רגליים (62% מלמעלה)
      const bodyH = dH*legSplit;
      const legH = dH*(1-legSplit);
      const cycle = frame*0.4;
      // קפיצה קלה של הגוף בקצב
      const bounce = Math.abs(Math.sin(cycle))*4;
      const bodyY = dino.y-dH+ (-bounce);
      // צל
      ctx.beginPath();ctx.ellipse(dino.x+dW/2,GROUND+8,(dW/2)*(1-bounce/22),5,0,0,7);ctx.fill();

      // --- רגל אחורית (מאחור, כהה קצת) ---
      const legShift = Math.sin(cycle)*7;     // רגל אחת קדימה, שנייה אחורה
      // ציור רגל שמאל (זזה בכיוון אחד)
      ctx.drawImage(im0, 0, im0.height*legSplit, im0.width, im0.height*(1-legSplit),
                    px - legShift*0.4, bodyY+bodyH, dw, legH);
      // ציור רגל ימין (זזה בכיוון ההפוך) — חצי מהרוחב לכל רגל
      ctx.save();
      ctx.beginPath(); ctx.rect(px+dw/2, bodyY+bodyH, dw/2, legH); ctx.clip();
      ctx.drawImage(im0, 0, im0.height*legSplit, im0.width, im0.height*(1-legSplit),
                    px + legShift*0.4, bodyY+bodyH, dw, legH);
      ctx.restore();
      // רגל שמאל (חצי שמאלי, זזה הפוך)
      ctx.save();
      ctx.beginPath(); ctx.rect(px, bodyY+bodyH, dw/2, legH); ctx.clip();
      ctx.drawImage(im0, 0, im0.height*legSplit, im0.width, im0.height*(1-legSplit),
                    px - legShift*0.4, bodyY+bodyH, dw, legH);
      ctx.restore();

      // --- גוף עליון (מעל הרגליים) ---
      const tilt = Math.sin(cycle)*0.05;
      ctx.save();
      const cx=px+dw/2, cy=bodyY+bodyH;
      ctx.translate(cx,cy); ctx.rotate(tilt); ctx.translate(-cx,-cy);
      ctx.drawImage(im0, 0, 0, im0.width, im0.height*legSplit, px, bodyY, dw, bodyH);
      ctx.restore();
      return;
    }

    // --- דמות שעומדת / באוויר / מתכופפת (בלי אנימציה) ---
    const idleBob = dino.ground&&!ducking&&state!=='play' ? Math.sin(frame*0.4)*1.5 : 0;
    ctx.beginPath();ctx.ellipse(dino.x+dW/2,GROUND+8,dW/2,5,0,0,7);ctx.fill();
    const dY=dino.y-dH+idleBob;
    const im = hasAnim ? anim[0] : images[current];
    if(im&&im.complete){
      if(ducking){
        ctx.drawImage(im, dino.x - (dW-dino.w)/2, dY, dW, dH);
      } else {
        const asp=im.width/im.height,dw=dH*asp; ctx.drawImage(im,dino.x+(dino.w-dw)/2,dY,dw,dH);
      }
    } else { ctx.fillStyle='#4a8f52';roundRect(dino.x,dY,dW,dH,8);ctx.fill(); } }
  function drawObstacle(o){ if(o.type==='cactus') drawCactus(o); else drawBird(o); }
  function drawCactus(o){ for(let i=0;i<o.n;i++){ const bx=o.x+i*o.unit,wdt=o.big?14:11,topY=o.y-o.h;
    const g=ctx.createLinearGradient(bx,0,bx+wdt,0); g.addColorStop(0,'#2f5d34');g.addColorStop(0.4,'#4a8f52');g.addColorStop(0.7,'#5fa869');g.addColorStop(1,'#3a6e40');
    ctx.fillStyle=g;roundRect(bx,topY,wdt,o.h,6);ctx.fill(); ctx.strokeStyle=g;ctx.lineWidth=o.big?10:8;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(bx-1,topY+o.h*0.55);ctx.quadraticCurveTo(bx-9,topY+o.h*0.5,bx-9,topY+o.h*0.28);ctx.stroke();
    ctx.beginPath();ctx.moveTo(bx+wdt+1,topY+o.h*0.62);ctx.quadraticCurveTo(bx+wdt+9,topY+o.h*0.57,bx+wdt+9,topY+o.h*0.36);ctx.stroke();
    ctx.strokeStyle='rgba(20,50,25,.4)';ctx.lineWidth=1; for(let r=3;r<wdt;r+=4){ctx.beginPath();ctx.moveTo(bx+r,topY+4);ctx.lineTo(bx+r,o.y-3);ctx.stroke();}
    ctx.strokeStyle='rgba(230,230,200,.6)'; for(let sy=topY+8;sy<o.y-4;sy+=9){ ctx.beginPath();ctx.moveTo(bx+1,sy);ctx.lineTo(bx-2,sy-2);ctx.stroke();ctx.beginPath();ctx.moveTo(bx+wdt-1,sy+3);ctx.lineTo(bx+wdt+2,sy+1);ctx.stroke();}
    ctx.fillStyle='rgba(180,230,170,.3)';roundRect(bx+2,topY+3,3,o.h-8,2);ctx.fill(); } }
  function drawBird(o){
    const cx=o.x+o.w/2, cy=o.y+6, t=frame*0.3, flap=Math.sin(t);
    ctx.save();
    // צל על הקרקע
    ctx.fillStyle='rgba(0,0,0,.12)';ctx.beginPath();ctx.ellipse(cx,GROUND+8,16,4,0,0,7);ctx.fill();

    // --- קווי מהירות מאחור (מראה שהיא טסה מהר לעברך) ---
    ctx.strokeStyle='rgba(217,133,107,.35)'; ctx.lineWidth=2; ctx.lineCap='round';
    for(let i=0;i<3;i++){
      const ly = cy-6+i*6;
      ctx.beginPath(); ctx.moveTo(cx+22+i*4, ly); ctx.lineTo(cx+38+i*6, ly); ctx.stroke();
    }

    // הציפור פונה שמאלה (לכיוון השחקן) — הופכים את הציור
    ctx.translate(cx,cy); ctx.scale(-1,1); ctx.translate(-cx,-cy);
    // נטייה קדימה — כאילו צוללת לעברך
    ctx.translate(cx,cy); ctx.rotate(-0.12); ctx.translate(-cx,-cy);

    // גוף
    const bg=ctx.createLinearGradient(cx-14,cy-8,cx+14,cy+8);
    bg.addColorStop(0,'#6b3a28'); bg.addColorStop(1,'#c56b52');
    ctx.fillStyle=bg; ctx.beginPath(); ctx.ellipse(cx,cy,16,9,0,0,7); ctx.fill();

    // כנף רחוקה (מאחור)
    function wing(x,y,f,len){const tip=-20+f*34;ctx.beginPath();ctx.moveTo(x,y);
      ctx.quadraticCurveTo(x-len*0.4,y+tip,x-len,y+tip*0.6);ctx.quadraticCurveTo(x-len*0.5,y+4,x,y+3);ctx.closePath();ctx.fill();}
    ctx.fillStyle='#6b3a28'; wing(cx-2,cy,flap*0.7,26);

    // ראש
    ctx.fillStyle='#b25f48'; ctx.beginPath(); ctx.arc(cx+14,cy-2,7.5,0,7); ctx.fill();
    // מקור חד וארוך (תוקפני)
    ctx.fillStyle='#ffb100'; ctx.beginPath();
    ctx.moveTo(cx+20,cy-4); ctx.lineTo(cx+32,cy); ctx.lineTo(cx+20,cy+2); ctx.closePath(); ctx.fill();
    // עין אדומה זועמת
    ctx.fillStyle='#ff3b30'; ctx.beginPath(); ctx.arc(cx+16,cy-3,2.4,0,7); ctx.fill();
    ctx.fillStyle='#0d1620'; ctx.beginPath(); ctx.arc(cx+16.5,cy-3,1.2,0,7); ctx.fill();
    // גבה זועמת
    ctx.strokeStyle='#0d1620'; ctx.lineWidth=1.8; ctx.beginPath();
    ctx.moveTo(cx+12,cy-8); ctx.lineTo(cx+19,cy-6); ctx.stroke();

    // כנף קרובה (בהירה, מעל הגוף)
    ctx.fillStyle='#e89478'; wing(cx,cy-1,flap,32);

    // זנב
    ctx.fillStyle='#a55940'; ctx.beginPath();
    ctx.moveTo(cx-14,cy); ctx.lineTo(cx-26,cy-6); ctx.lineTo(cx-26,cy+6); ctx.closePath(); ctx.fill();

    ctx.restore(); }
  function drawCoin(c){ c.spin+=0.15;const wob=Math.abs(Math.cos(c.spin))*c.r+2; ctx.fillStyle='#ffd166';ctx.beginPath();ctx.ellipse(c.x,c.y,wob,c.r,0,0,7);ctx.fill();
    ctx.strokeStyle='#e0a63a';ctx.lineWidth=2;ctx.stroke(); ctx.fillStyle='#e0a63a';ctx.font='bold 12px monospace';if(wob>6)ctx.fillText('$',c.x-3,c.y+4); }
  function drawHUD(){ ctx.fillStyle='#e8eef5';ctx.font='bold 20px monospace';ctx.textAlign='right';ctx.fillText(String(score).padStart(5,'0'),W-20,32);
    ctx.font='bold 14px monospace';ctx.fillStyle='#8ba0b5';ctx.fillText('HI '+String(myBest).padStart(5,'0'),W-20,52);
    ctx.textAlign='left';ctx.fillStyle='#ffd166';ctx.beginPath();ctx.arc(30,28,9,0,7);ctx.fill();
    ctx.fillStyle='#e0a63a';ctx.font='bold 11px monospace';ctx.fillText('$',27,32);
    ctx.fillStyle='#e8eef5';ctx.font='bold 18px monospace';ctx.fillText('× '+coins,46,33); }
  function centerText(lines){ ctx.fillStyle='rgba(8,12,18,.7)';ctx.fillRect(0,0,W,H);ctx.textAlign='center';
    lines.forEach((l,i)=>{ctx.fillStyle=l.c||'#e8eef5';ctx.font=l.f||'bold 20px monospace';ctx.fillText(l.t,W/2,H/2-(lines.length-1)*18+i*36);});ctx.textAlign='left'; }

  function loop(){
    if(!running) return;
    raf=requestAnimationFrame(loop); frame++;
    ctx.save();
    if(shake>0){ ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake); shake-=0.6; }
    drawBackground();drawGround();
    if(state==='play'){
      // כבידה + קפיצה קדימה
      dino.vy+=0.55; dino.y+=dino.vy;
      dino.x += dino.vx;                       // תנועה קדימה בקפיצה
      if(dino.x < 20) { dino.x = 20; dino.vx = 0; }   // לא יוצא מהמסך משמאל
      if(!dino.ground) dino.vx *= 0.97;        // מאט בהדרגה באוויר
      if(dino.y>=GROUND){
        dino.y=GROUND; dino.vy=0; dino.ground=true; dino.vx=0;
      }
      // חוזר בעדינות למקום ההתחלתי כשעל הקרקע
      if(dino.ground && dino.x<dino.baseX) dino.x = Math.min(dino.baseX, dino.x+2.2);
      if(frame%Math.floor(74+Math.random()*40)===0)spawnObstacle();
      if(frame%55===0)spawnCoin(); if(frame%6===0) score++; if(speed<13)speed+=0.0018;
      const db=dino.box();
      for(let i=obstacles.length-1;i>=0;i--){ const o=obstacles[i];o.x-=speed; const ob=o.type==='cactus'?{x:o.x,y:o.y-o.h,w:o.w,h:o.h}:o;
        if(hit(db,ob))die(); if(o.x+o.w<-30)obstacles.splice(i,1); }
      for(let i=collectibles.length-1;i>=0;i--){ const c=collectibles[i];c.x-=speed;const pad=6;
        if(hit(db,{x:c.x-c.r-pad,y:c.y-c.r-pad,w:(c.r+pad)*2,h:(c.r+pad)*2})){ coins++;burst(c.x,c.y,'255,209,102',8);collectibles.splice(i,1); } else if(c.x<-20)collectibles.splice(i,1); }
    }
    collectibles.forEach(drawCoin);obstacles.forEach(drawObstacle);drawDino();
    for(let i=particles.length-1;i>=0;i--){ const p=particles[i];p.x+=p.vx;p.y+=p.vy;p.vy+=0.2;p.life--;ctx.fillStyle='rgba('+p.color+','+(p.life/24)+')';ctx.fillRect(p.x,p.y,3,3);if(p.life<=0)particles.splice(i,1); }
    drawHUD();
    if(state==='menu')centerText([{t:'DINO RUNNER',c:'#ffd166',f:'bold 30px monospace'},{t:'שלום '+playerName+'!',f:'bold 16px monospace',c:'#4fd1c5'},{t:'רווח / ↑ להתחלה',f:'bold 15px monospace',c:'#8ba0b5'}]);
    if(state==='dead')centerText([{t:'נפסלת!',c:'#d9856b',f:'bold 30px monospace'},{t:'ניקוד '+score+'  ·  +'+coins+' מטבעות',f:'bold 16px monospace'},{t:'השיא שלך: '+myBest,c:'#ffd166',f:'bold 15px monospace'},{t:'רווח לשחק שוב',c:'#8ba0b5',f:'bold 14px monospace'}]);
    ctx.restore();
  }
  function startGame(){ if(shopScreen.style.display==='flex')return; state='play';score=0;coins=0;speed=4;obstacles=[];collectibles=[];particles=[];dino.reset(); }
  function die(){ state='dead';shake=12;const b=dino.box();burst(b.x+b.w/2,b.y+b.h/2,'217,133,107',20);saveScore(score,coins); }

  const kd = e=>{ if(state==='loading'||shopScreen.style.display==='flex')return;
    if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();if(state==='play')dino.jump();else startGame();}
    if(e.code==='ArrowDown'){e.preventDefault();dino.duck=true;} };
  const ku = e=>{ if(e.code==='ArrowDown')dino.duck=false; };
  document.addEventListener('keydown',kd); document.addEventListener('keyup',ku);
  cv.addEventListener('pointerdown',()=>{ if(shopScreen.style.display==='flex')return; if(state==='play')dino.jump();else if(state==='menu'||state==='dead')startGame(); });

  initPlayer(); loop();
  // cleanup function
  return ()=>{ running=false; cancelAnimationFrame(raf); document.removeEventListener('keydown',kd); document.removeEventListener('keyup',ku); };
}
