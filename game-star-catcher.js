// ============================================
//  משחק: STAR CATCHER
//  הקובץ של רובין — כאן הוא עובד!
// ============================================

function mountCatch(root){
  root.innerHTML = '<canvas width="640" height="440" style="width:100%;max-width:900px;aspect-ratio:640/440;display:block;margin:auto;border-radius:18px;touch-action:none;background:#090b2c"></canvas>';
  const cv = root.querySelector('canvas');
  const ctx = cv.getContext('2d');

  let running = true;
  let raf = 0;
  let last = performance.now();
  let state = 'guide';
  let previousState = 'start';
  let score = 0;
  let totalScore = 0;
  let level = 1;
  let lives = 3;
  let highScore = 0;
  let spawnClock = 0;
  let rainbowCount = 0;
  let nextRainbow = rainbowInterval();
  let muted = false;
  let audio = null;
  let musicGain = null;
  let musicBass = null;
  let musicTimer = 0;
  let musicStep = 0;
  let objects = [];
  let particles = [];
  let popups = [];
  let buttons = [];
  const keys = { left:false, right:false };
  const basket = { x:320, y:382, w:96, h:30, speed:410 };
  const bgStars = Array.from({length:75},()=>({
    x:Math.random()*640,
    y:Math.random()*440,
    r:Math.random()*1.4+.3,
    a:Math.random()*.65+.2,
    s:Math.random()*9+3
  }));

  function rainbowInterval(){
    return 10 + Math.floor(Math.random()*6);
  }

  function audioReady(){
    if(!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if(audio.state === 'suspended') audio.resume();
  }

  function tone(freq,duration,type){
    if(muted || !running) return;
    audioReady();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(.075,now);
    gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now+duration);
  }

  function startMusic(){
    if(muted || musicTimer || !running) return;
    audioReady();
    musicGain = audio.createGain();
    musicGain.gain.value = .022;
    musicGain.connect(audio.destination);
    musicBass = audio.createOscillator();
    const bassGain = audio.createGain();
    musicBass.type = 'sine';
    musicBass.frequency.value = 55;
    bassGain.gain.value = .28;
    musicBass.connect(bassGain).connect(musicGain);
    musicBass.start();
    const notes = [220,277.18,329.63,415.3,329.63,277.18,246.94,329.63];
    const note = ()=>{
      if(muted || !running || state !== 'playing') return;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const now = audio.currentTime;
      osc.type = 'sine';
      osc.frequency.value = notes[musicStep++%notes.length];
      gain.gain.setValueAtTime(.001,now);
      gain.gain.exponentialRampToValueAtTime(.26,now+.3);
      gain.gain.exponentialRampToValueAtTime(.001,now+2.2);
      osc.connect(gain).connect(musicGain);
      osc.start(now);
      osc.stop(now+2.3);
    };
    note();
    musicTimer = window.setInterval(note,1150);
  }

  function stopMusic(){
    window.clearInterval(musicTimer);
    musicTimer = 0;
    if(musicBass){ try{ musicBass.stop(); }catch(e){} musicBass = null; }
    if(musicGain){ try{ musicGain.disconnect(); }catch(e){} musicGain = null; }
  }

  function resetGame(){
    score = 0;
    totalScore = 0;
    level = 1;
    lives = 3;
    objects = [];
    particles = [];
    popups = [];
    spawnClock = 0;
    rainbowCount = 0;
    nextRainbow = rainbowInterval();
    basket.x = 320;
    state = 'playing';
    last = performance.now();
    startMusic();
  }

  function spawn(){
    rainbowCount++;
    const meteorChance = Math.min(.13+(level-1)*.018,.42);
    const roll = Math.random();
    let type = 'star';
    if(rainbowCount >= nextRainbow){
      type = 'rainbow';
      rainbowCount = 0;
      nextRainbow = rainbowInterval();
    }else if(roll < meteorChance){
      type = 'meteor';
    }else if(roll < meteorChance+.13){
      type = 'gold';
    }
    const size = type === 'meteor' ? 15+Math.random()*5 : type === 'rainbow' ? 15 : type === 'gold' ? 14 : 12;
    objects.push({
      type:type,
      x:size+Math.random()*(640-size*2),
      y:-25,
      size:size,
      speed:105+Math.random()*45+(level-1)*8,
      rot:Math.random()*Math.PI,
      spin:(Math.random()-.5)*3
    });
  }

  function burst(x,y,color){
    for(let i=0;i<12;i++) particles.push({
      x:x,y:y,
      vx:(Math.random()-.5)*150,
      vy:(Math.random()-.5)*150,
      life:1,
      size:Math.random()*2.8+1,
      color:color
    });
  }

  function addPoints(x,y,value,color){
    score += value;
    totalScore += value;
    popups.push({x:x,y:y,value:value,color:color,life:1});
    const target = level*10;
    if(score >= target){
      if(level === 30){
        highScore = Math.max(highScore,totalScore);
        state = 'victory';
        stopMusic();
        tone(1040,.5);
      }else{
        level++;
        score = 0;
        state = 'levelComplete';
        tone(920,.22);
      }
    }
  }

  function update(dt){
    if(state !== 'playing') return;
    if(keys.left) basket.x -= basket.speed*dt;
    if(keys.right) basket.x += basket.speed*dt;
    basket.x = Math.max(basket.w/2+4,Math.min(640-basket.w/2-4,basket.x));
    spawnClock -= dt;
    if(spawnClock <= 0){
      spawn();
      spawnClock = Math.max(.25,.68-(level-1)*.012)*(.82+Math.random()*.4);
    }
    for(let i=objects.length-1;i>=0;i--){
      const o = objects[i];
      o.y += o.speed*dt;
      o.rot += o.spin*dt;
      const caught = o.y+o.size>basket.y && o.y-o.size<basket.y+basket.h && Math.abs(o.x-basket.x)<basket.w/2+o.size*.45;
      if(caught){
        objects.splice(i,1);
        if(o.type === 'meteor'){
          lives--;
          burst(o.x,o.y,'#ff577b');
          tone(110,.25,'sawtooth');
          if(lives <= 0){
            highScore = Math.max(highScore,totalScore);
            state = 'gameOver';
            stopMusic();
          }
        }else{
          const value = o.type === 'rainbow' ? 5 : o.type === 'gold' ? 3 : 1;
          const color = o.type === 'rainbow' ? '#f58cff' : o.type === 'gold' ? '#ffd956' : '#a6efff';
          burst(o.x,o.y,color);
          addPoints(o.x,o.y,value,color);
          tone(o.type === 'rainbow' ? 980 : o.type === 'gold' ? 760 : 620,.14);
        }
      }else if(o.y-o.size>440){
        objects.splice(i,1);
        if(o.type !== 'meteor'){
          score = Math.max(0,score-1);
          totalScore = Math.max(0,totalScore-1);
          tone(150,.18,'triangle');
        }
      }
    }
    for(let i=particles.length-1;i>=0;i--){
      const p = particles[i];
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      p.vy += 100*dt;
      p.life -= dt*1.8;
      if(p.life<=0) particles.splice(i,1);
    }
    for(let i=popups.length-1;i>=0;i--){
      popups[i].y -= 38*dt;
      popups[i].life -= dt*1.3;
      if(popups[i].life<=0) popups.splice(i,1);
    }
  }

  function roundRect(x,y,w,h,r,fill,stroke){
    ctx.beginPath();
    ctx.roundRect(x,y,w,h,r);
    if(fill){ ctx.fillStyle=fill; ctx.fill(); }
    if(stroke){ ctx.strokeStyle=stroke; ctx.stroke(); }
  }

  function text(value,x,y,size,color,align,weight){
    ctx.font = (weight || '700')+' '+size+'px Arial';
    ctx.fillStyle = color || '#fff';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value,x,y);
  }

  function starPath(x,y,r,rotation){
    ctx.beginPath();
    for(let i=0;i<10;i++){
      const a=(rotation||0)-Math.PI/2+i*Math.PI/5;
      const rr=i%2?r*.43:r;
      const px=x+Math.cos(a)*rr;
      const py=y+Math.sin(a)*rr;
      if(i) ctx.lineTo(px,py); else ctx.moveTo(px,py);
    }
    ctx.closePath();
  }

  function background(time){
    const g=ctx.createLinearGradient(0,0,0,440);
    g.addColorStop(0,'#10103d');
    g.addColorStop(1,'#102b43');
    ctx.fillStyle=g;
    ctx.fillRect(0,0,640,440);
    for(const s of bgStars){
      const y=(s.y+time*s.s*.001)%440;
      ctx.globalAlpha=s.a*(.8+Math.sin(time*.002+s.x)*.2);
      ctx.fillStyle='#dfe8ff';
      ctx.beginPath();
      ctx.arc(s.x,y,s.r,0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  function drawObject(o){
    ctx.save();
    ctx.translate(o.x,o.y);
    ctx.rotate(o.rot);
    if(o.type==='meteor'){
      ctx.shadowColor='#ff5e76';
      ctx.shadowBlur=12;
      ctx.fillStyle='#b64d64';
      ctx.beginPath();
      for(let i=0;i<9;i++){
        const a=i/9*Math.PI*2;
        const r=o.size*(.8+Math.sin(i*9.2)*.12);
        if(i) ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r); else ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle='#6f334d';
      ctx.beginPath();
      ctx.arc(-4,-3,3,0,Math.PI*2);
      ctx.arc(5,4,2.5,0,Math.PI*2);
      ctx.fill();
    }else{
      const color=o.type==='gold'?'#ffd956':o.type==='rainbow'?'hsl('+((o.rot*100)%360)+' 95% 68%)':'#a6efff';
      ctx.shadowColor=color;
      ctx.shadowBlur=18;
      ctx.fillStyle=color;
      starPath(0,0,o.size,0);
      ctx.fill();
      if(o.type==='rainbow'){
        ctx.strokeStyle='hsl('+((o.rot*100+150)%360)+' 100% 75%)';
        ctx.lineWidth=3;
        starPath(0,0,o.size*.72,o.rot);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawBasket(){
    ctx.save();
    ctx.translate(basket.x,basket.y);
    ctx.shadowColor='#7464ff';
    ctx.shadowBlur=18;
    const g=ctx.createLinearGradient(-48,0,48,0);
    g.addColorStop(0,'#574be1');
    g.addColorStop(.5,'#9b79ff');
    g.addColorStop(1,'#574be1');
    roundRect(-basket.w/2,3,basket.w,basket.h-3,[7,7,20,20],g);
    roundRect(-basket.w/2-4,0,basket.w+8,9,5,'#b9a6ff');
    ctx.restore();
  }

  function drawHud(){
    roundRect(10,9,620,48,13,'#0a0b2ccc','#ffffff20');
    text('תופס הכוכבים',620,25,14,'#fff','right','900');
    text('נקודות',532,20,9,'#8f91b1');
    text(String(score),532,39,18,'#fff');
    text('נשארו',450,20,9,'#8f91b1');
    text(String(Math.max(0,level*10-score)),450,39,18,'#fff');
    text('שלב',370,20,9,'#8f91b1');
    text(String(level),370,39,18,'#fff');
    text('שיא',292,20,9,'#8f91b1');
    text(String(highScore),292,39,18,'#fff');
    text('♥ '.repeat(lives)+'♡ '.repeat(3-lives),205,34,16,'#ff577b');
    button('♪',18,17,36,32,'sound');
  }

  function button(label,x,y,w,h,id,secondary){
    roundRect(x,y,w,h,10,secondary?'#ffffff0b':'#7255e8',secondary?'#ffffff22':null);
    text(label,x+w/2,y+h/2+1,secondary?12:14,secondary?'#b9bad6':'#fff','center','800');
    buttons.push({x:x,y:y,w:w,h:h,id:id});
  }

  function panel(){
    ctx.fillStyle='#080927e8';
    ctx.fillRect(0,0,640,440);
    roundRect(55,35,530,370,22,'#11123fee','#8e7cff44');
  }

  function drawScreen(){
    buttons=[];
    if(state==='playing') return;
    panel();
    if(state==='start'){
      text('המשימה שלך',320,80,12,'#a99fff');
      text('תופס הכוכבים',320,145,44,'#ffd85e','center','900');
      text('תפסו כוכבים והיזהרו ממטאורים',320,195,15,'#bbbcd4');
      button('מתחילים לשחק',220,230,200,45,'start');
      button('איך משחקים?',240,285,160,34,'guide',true);
      button('מפת השלבים',240,328,160,34,'map',true);
    }else if(state==='guide'){
      text('מדריך המשחק',320,62,30,'#ffd85e','center','900');
      const items=[
        ['★ כוכב רגיל','נקודה אחת','#a6efff'],
        ['★ כוכב זהב','3 נקודות','#ffd956'],
        ['★ כוכב צבעוני','5 נקודות','#f58cff'],
        ['● מטאור','מוריד חיים','#ff577b'],
        ['↔ שליטה','חצים, עכבר או אצבע','#a99fff'],
        ['−1 פספוס','מוריד נקודה בלבד','#bfc0d8']
      ];
      items.forEach((it,i)=>{
        const col=i%2,row=Math.floor(i/2),x=105+col*225,y=105+row*62;
        roundRect(x,y,205,49,10,'#ffffff09','#ffffff15');
        text(it[0],x+190,y+17,13,it[2],'right','800');
        text(it[1],x+190,y+34,10,'#9294af','right');
      });
      text('למעלה: ניקוד, שלב וחיים  •  למטה: סל התפיסה',320,310,11,'#999bb9');
      text('שלב 1 דורש 10 נקודות, שלב 2 דורש 20, ועד שלב 30',320,334,11,'#999bb9');
      button('הבנתי, מתחילים!',220,355,200,38,'start');
    }else if(state==='levelComplete'){
      text('★',320,105,60,'#ffd85e');
      text('שלב '+(level-1)+' הושלם!',320,180,35,'#ffd85e','center','900');
      text('היעד הבא: '+(level*10)+' נקודות',320,225,15,'#bbbcd4');
      button('לשלב הבא',220,260,200,44,'continue');
      button('מפת השלבים',240,315,160,34,'mapLevel',true);
    }else if(state==='map'){
      text('מפת 30 השלבים',320,62,29,'#ffd85e','center','900');
      for(let i=1;i<=30;i++){
        const col=(i-1)%10,row=Math.floor((i-1)/10),x=72+col*50,y=105+row*68;
        const done=i<level,current=i===level;
        roundRect(x,y,42,48,9,done?'#eeb13d':current?'#7255e8':'#ffffff09',current?'#a99fff':'#ffffff14');
        text(done?'✓':String(i),x+21,y+17,15,done?'#19152e':'#fff');
        text(String(i*10),x+21,y+35,8,done?'#533a15':'#9092b1');
      }
      button('חזרה',240,335,160,38,'back');
    }else if(state==='gameOver'){
      text('המסע הסתיים',320,100,15,'#a99fff');
      text('כל הכבוד!',320,170,43,'#ffd85e','center','900');
      text('אספת '+totalScore+' נקודות',320,225,18,'#bbbcd4');
      button('משחק חדש',220,270,200,44,'restart');
    }else if(state==='victory'){
      text('★',320,92,65,'#ffd85e');
      text('כבשת את החלל!',320,165,39,'#ffd85e','center','900');
      text('השלמת את כל 30 השלבים',320,215,18,'#bbbcd4');
      text('סך הכול: '+totalScore+' נקודות',320,245,15,'#bbbcd4');
      button('משחק חדש',220,290,200,44,'restart');
    }
  }

  function draw(time){
    background(time);
    objects.forEach(drawObject);
    particles.forEach(p=>{
      ctx.globalAlpha=Math.max(0,p.life);
      ctx.fillStyle=p.color;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.size,0,Math.PI*2);
      ctx.fill();
    });
    popups.forEach(p=>{
      ctx.globalAlpha=Math.max(0,p.life);
      text('+'+p.value,p.x,p.y,20,p.color,'center','900');
    });
    ctx.globalAlpha=1;
    drawBasket();
    drawHud();
    drawScreen();
  }

  function loop(now){
    if(!running) return;
    const dt=Math.min((now-last)/1000,.033);
    last=now;
    update(dt);
    draw(now);
    raf=requestAnimationFrame(loop);
  }

  function canvasPoint(event){
    const rect=cv.getBoundingClientRect();
    return {
      x:(event.clientX-rect.left)*640/rect.width,
      y:(event.clientY-rect.top)*440/rect.height
    };
  }

  function onPointerMove(event){
    if(state!=='playing') return;
    const p=canvasPoint(event);
    basket.x=Math.max(basket.w/2,Math.min(640-basket.w/2,p.x));
  }

  function onPointerDown(event){
    const p=canvasPoint(event);
    if(state==='playing'){
      onPointerMove(event);
      return;
    }
    const hit=buttons.find(b=>p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h);
    if(!hit) return;
    if(hit.id==='start'||hit.id==='restart') resetGame();
    else if(hit.id==='guide') state='guide';
    else if(hit.id==='map'||hit.id==='mapLevel'){
      previousState=hit.id==='mapLevel'?'levelComplete':'start';
      state='map';
    }else if(hit.id==='back') state=previousState;
    else if(hit.id==='continue'){
      state='playing';
      last=performance.now();
    }else if(hit.id==='sound'){
      muted=!muted;
      if(muted) stopMusic(); else if(state==='playing') startMusic();
    }
  }

  function onKeyDown(event){
    if(event.key==='ArrowLeft') keys.left=true;
    if(event.key==='ArrowRight') keys.right=true;
  }

  function onKeyUp(event){
    if(event.key==='ArrowLeft') keys.left=false;
    if(event.key==='ArrowRight') keys.right=false;
  }

  cv.addEventListener('pointermove',onPointerMove);
  cv.addEventListener('pointerdown',onPointerDown);
  window.addEventListener('keydown',onKeyDown);
  window.addEventListener('keyup',onKeyUp);

  draw(last);
  raf=requestAnimationFrame(loop);

  return ()=>{
    running=false;
    cancelAnimationFrame(raf);
    stopMusic();
    cv.removeEventListener('pointermove',onPointerMove);
    cv.removeEventListener('pointerdown',onPointerDown);
    window.removeEventListener('keydown',onKeyDown);
    window.removeEventListener('keyup',onKeyUp);
    if(audio){
      try{ audio.close(); }catch(e){}
      audio=null;
    }
    objects=[];
    particles=[];
    popups=[];
    root.innerHTML='';
  };
}
