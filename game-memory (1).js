// ============================================
//  משחק: MEMORY ADJUSTMENT
//  שלבים, טיימר, מוזיקה ואנימציות
// ============================================

function mountMemory(root){
  // ---------- הגדרות השלבים ----------
  // כל שלב: כמה זוגות, וכמה שניות. מתחיל קל ונעשה קשה בהדרגה — אבל תמיד אפשרי!
  const LEVELS = [
    { pairs:4,  seconds:45 },   // שלב 1 — 8 קלפים
    { pairs:6,  seconds:60 },   // שלב 2 — 12 קלפים
    { pairs:8,  seconds:75 },   // שלב 3 — 16 קלפים
    { pairs:10, seconds:95 },   // שלב 4 — 20 קלפים
    { pairs:12, seconds:115 },  // שלב 5 — 24 קלפים
    { pairs:14, seconds:140 },  // שלב 6 — 28 קלפים
    { pairs:16, seconds:170 },  // שלב 7 — 32 קלפים (הסופי!)
  ];

  const ICONS = ['🍎','🚀','🐸','🎸','⚽','🌈','👾','🍕','🦋','🐙','🍩','⭐','🎈','🐳','🔥','🎧',
                 '🌵','🦊','🍇','🎲','🐝','🌙','🍔','🎯'];

  let level = 0, deck = [], first = null, lock = false, matched = 0;
  let timeLeft = 0, timerId = null, running = true;
  let score = 0, moves = 0;

  // ---------- מוזיקה רגועה (נוצרת בקוד — בלי זכויות יוצרים) ----------
  let audioCtx = null, musicOn = true, musicTimer = null;
  const SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33];  // סולם פנטטוני נעים

  function initAudio(){
    if (audioCtx) return;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ musicOn=false; }
  }
  function note(freq, dur, vol, type){
    if (!audioCtx || !musicOn) return;
    try {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, audioCtx.currentTime);
      g.gain.linearRampToValueAtTime(vol||0.06, audioCtx.currentTime+0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+(dur||1.2));
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime+(dur||1.2)+0.1);
    } catch(e){}
  }
  function startMusic(){
    if (!audioCtx || musicTimer) return;
    const play = () => {
      if (!running || !musicOn) { musicTimer=null; return; }
      const f = SCALE[Math.floor(Math.random()*SCALE.length)];
      note(f, 1.8, 0.05, 'sine');
      if (Math.random()<0.4) note(f/2, 2.4, 0.03, 'triangle');   // בס רך
      musicTimer = setTimeout(play, 900 + Math.random()*700);
    };
    play();
  }
  function stopMusic(){ if(musicTimer){ clearTimeout(musicTimer); musicTimer=null; } }
  const sndFlip  = () => note(660, 0.12, 0.05, 'triangle');
  const sndMatch = () => { note(523,0.16,0.07,'sine'); setTimeout(()=>note(784,0.22,0.07,'sine'),90); };
  const sndWrong = () => note(180, 0.22, 0.05, 'sawtooth');
  const sndWin   = () => [523,659,784,1047].forEach((f,i)=>setTimeout(()=>note(f,0.3,0.08,'sine'), i*120));
  const sndLose  = () => [392,330,262].forEach((f,i)=>setTimeout(()=>note(f,0.4,0.07,'triangle'), i*180));

  // ---------- מבנה המסך ----------
  root.innerHTML =
    '<div class="memWrap">' +
      '<div class="memTop">' +
        '<img class="memLogo" src="data:image/png;base64,'+MEM_LOGO+'" alt="Memory Adjustment"/>' +
      '</div>' +
      '<div class="memBar">' +
        '<div class="memStat"><span class="memLbl">שלב</span><span id="memLevel">1</span><span class="memOf">/7</span></div>' +
        '<div class="memStat"><span class="memLbl">זמן</span><span id="memTime">0:45</span></div>' +
        '<div class="memStat"><span class="memLbl">ניקוד</span><span id="memScore">0</span></div>' +
        '<div class="memStat"><span class="memLbl">מהלכים</span><span id="memMoves">0</span></div>' +
        '<button id="memMusic" title="מוזיקה">🔊</button>' +
      '</div>' +
      '<div class="memTimeBarOuter"><div class="memTimeBar" id="memTimeBar"></div></div>' +
      '<div id="memBoard" class="memBoard"></div>' +
      '<div id="memOverlay" class="memOverlay hidden"><div class="memMsg"></div></div>' +
    '</div>';

  const board   = root.querySelector('#memBoard');
  const overlay = root.querySelector('#memOverlay');
  const elLevel = root.querySelector('#memLevel');
  const elTime  = root.querySelector('#memTime');
  const elScore = root.querySelector('#memScore');
  const elMoves = root.querySelector('#memMoves');
  const elBar   = root.querySelector('#memTimeBar');
  const btnMus  = root.querySelector('#memMusic');

  btnMus.onclick = () => {
    musicOn = !musicOn;
    btnMus.textContent = musicOn ? '🔊' : '🔇';
    if (musicOn) { initAudio(); startMusic(); } else stopMusic();
  };

  // ---------- בניית שלב ----------
  function buildLevel(){
    const cfg = LEVELS[level];
    matched = 0; first = null; lock = true;   // נעול בזמן ההצצה
    const pool = [...ICONS].sort(()=>Math.random()-0.5).slice(0, cfg.pairs);
    deck = [...pool, ...pool]
      .sort(()=>Math.random()-0.5)
      .map((e,i)=>({ e, i, up:false, done:false }));

    timeLeft = cfg.seconds;
    elLevel.textContent = level+1;
    updateHud();

    const cols = cfg.pairs<=4 ? 4 : cfg.pairs<=8 ? 4 : cfg.pairs<=10 ? 5 : cfg.pairs<=12 ? 6 : cfg.pairs<=14 ? 7 : 8;
    board.className = 'memBoard';
    board.style.gridTemplateColumns = 'repeat('+cols+', 1fr)';

    // הצצה קצרה בתחילת השלב (עוזר לשחקן!)
    deck.forEach(c=>c.up=true); render();
    setTimeout(()=>{
      if(!running) return;
      deck.forEach(c=>c.up=false); render();
      lock = false;
      startTimer();
    }, level<2 ? 1600 : 1100);
  }

  function render(){
    board.innerHTML='';
    deck.forEach(c=>{
      const el = document.createElement('button');
      el.className = 'memCard' + ((c.up||c.done)?' flipped':'') + (c.done?' done':'');
      el.innerHTML = '<span class="memFace memBack">?</span><span class="memFace memFront">'+c.e+'</span>';
      el.onclick = ()=>flip(c);
      board.appendChild(el);
    });
  }

  function flip(c){
    if(lock || c.up || c.done || !running) return;
    initAudio(); if(musicOn && !musicTimer) startMusic();
    sndFlip();
    c.up = true; render();
    if(!first){ first = c; return; }
    moves++; elMoves.textContent = moves;
    lock = true;
    if(first.e === c.e){
      setTimeout(()=>{
        if(!running) return;
        first.done = c.done = true; matched++;
        score += 10 + Math.max(0, Math.floor(timeLeft/5));
        first = null; lock = false;
        sndMatch(); updateHud(); render();
        if(matched === LEVELS[level].pairs) levelComplete();
      }, 260);
    } else {
      sndWrong();
      setTimeout(()=>{ if(!running) return; first.up = c.up = false; first = null; lock = false; render(); }, 650);
    }
  }

  // ---------- טיימר ----------
  function startTimer(){
    stopTimer();
    timerId = setInterval(()=>{
      if(!running) return;
      timeLeft--;
      updateHud();
      if(timeLeft<=10 && timeLeft>0) note(880, 0.08, 0.04, 'square');
      if(timeLeft<=0){ stopTimer(); gameOver(); }
    }, 1000);
  }
  function stopTimer(){ if(timerId){ clearInterval(timerId); timerId=null; } }

  function updateHud(){
    const m = Math.floor(Math.max(0,timeLeft)/60), s = Math.max(0,timeLeft)%60;
    elTime.textContent = m+':'+String(s).padStart(2,'0');
    elScore.textContent = score;
    const pct = Math.max(0, timeLeft/LEVELS[level].seconds*100);
    elBar.style.width = pct+'%';
    elBar.style.background = pct>50 ? '#4fd1c5' : pct>25 ? '#ffd166' : '#ff5a5a';
  }

  // ---------- סיום שלב / משחק ----------
  function levelComplete(){
    stopTimer(); sndWin();
    const bonus = timeLeft*2;
    score += bonus; updateHud();
    if(level === LEVELS.length-1){
      showOverlay('<h2>🏆 ניצחת!</h2><p>סיימת את כל 7 השלבים!</p><p class="big">ניקוד סופי: '+score+'</p><button class="memBtn" id="memAgain">שחק שוב</button>',
        ()=>{ level=0; score=0; moves=0; elMoves.textContent=0; buildLevel(); });
    } else {
      showOverlay('<h2>✨ שלב '+(level+1)+' הושלם!</h2><p>בונוס זמן: +'+bonus+'</p><p class="big">ניקוד: '+score+'</p><button class="memBtn" id="memAgain">לשלב הבא ←</button>',
        ()=>{ level++; buildLevel(); });
    }
  }
  function gameOver(){
    sndLose();
    showOverlay('<h2>⏰ נגמר הזמן!</h2><p>הגעת לשלב '+(level+1)+'</p><p class="big">ניקוד: '+score+'</p><button class="memBtn" id="memAgain">נסה שוב</button>',
      ()=>{ score=0; moves=0; elMoves.textContent=0; buildLevel(); });
  }
  function showOverlay(html, onBtn){
    overlay.querySelector('.memMsg').innerHTML = html;
    overlay.classList.remove('hidden');
    const b = overlay.querySelector('#memAgain');
    if(b) b.onclick = ()=>{ overlay.classList.add('hidden'); onBtn(); };
  }

  // ---------- התחלה ----------
  buildLevel();

  // ---------- ניקוי ----------
  return ()=>{
    running = false;
    stopTimer(); stopMusic();
    if(audioCtx){ try{ audioCtx.close(); }catch(e){} audioCtx=null; }
    root.innerHTML='';
  };
}
