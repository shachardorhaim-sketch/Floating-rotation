// ===== Memory Adjustment =====
// 7 שלבים: 8 -> 32 קלפים | טיימר | מוזיקה רגועה מקוד | אימוג'ים רנדומליים

(function () {
  // ---------- הגדרות שלבים ----------
  // cards = כמות קלפים, time = שניות
  const LEVELS = [
    { cards: 8,  time: 45,  cols: 4 },
    { cards: 12, time: 60,  cols: 4 },
    { cards: 16, time: 75,  cols: 4 },
    { cards: 20, time: 95,  cols: 5 },
    { cards: 24, time: 115, cols: 6 },
    { cards: 28, time: 140, cols: 7 },
    { cards: 32, time: 165, cols: 8 },
  ];

  // ---------- מאגר אימוג'ים ----------
  const EMOJI_POOL = [
    '🧠','⭐','🚀','🎯','🔥','💎','🌈','⚡',
    '🎨','🎵','🍕','🦊','🐙','🦖','👾','🎮',
    '🌸','🍉','🐳','🦄','🎪','🏆','🔮','🪐',
    '🐝','🍄','🎸','🧩','🌊','🦋','🍩','🐼',
  ];

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- מוזיקה רגועה (Web Audio API - בלי זכויות יוצרים) ----------
  function createMusic() {
    let ctx = null, master = null, timer = null, on = false;

    // אקורדים רגועים בלה מינור / דו מז'ור
    const CHORDS = [
      [220.00, 261.63, 329.63], // Am
      [174.61, 220.00, 261.63], // F
      [196.00, 246.94, 293.66], // G
      [261.63, 329.63, 392.00], // C
    ];
    let idx = 0;

    function playChord() {
      if (!ctx || !on) return;
      const now = ctx.currentTime;
      const chord = CHORDS[idx % CHORDS.length];
      idx++;

      chord.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.055, now + 1.2);
        gain.gain.linearRampToValueAtTime(0.045, now + 2.6);
        gain.gain.linearRampToValueAtTime(0, now + 4.0);

        osc.connect(gain);
        gain.connect(master);
        osc.start(now + i * 0.06);
        osc.stop(now + 4.2);
      });

      // נגיעת מלודיה עדינה
      const mel = ctx.createOscillator();
      const mg = ctx.createGain();
      mel.type = 'triangle';
      mel.frequency.value = chord[2] * 2;
      mg.gain.setValueAtTime(0, now + 0.5);
      mg.gain.linearRampToValueAtTime(0.03, now + 1.0);
      mg.gain.linearRampToValueAtTime(0, now + 2.4);
      mel.connect(mg);
      mg.connect(master);
      mel.start(now + 0.5);
      mel.stop(now + 2.5);
    }

    return {
      start() {
        if (on) return;
        try {
          ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
          if (ctx.state === 'suspended') ctx.resume();
          if (!master) {
            master = ctx.createGain();
            master.gain.value = 0.5;
            master.connect(ctx.destination);
          }
          on = true;
          playChord();
          timer = setInterval(playChord, 3800);
        } catch (e) { on = false; }
      },
      stop() {
        on = false;
        if (timer) { clearInterval(timer); timer = null; }
      },
      isOn() { return on; },
      // צליל התאמה מוצלחת
      ding(good) {
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(good ? 660 : 200, now);
        if (good) osc.frequency.linearRampToValueAtTime(990, now + 0.14);
        g.gain.setValueAtTime(0.09, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    };
  }

  // ---------- המשחק ----------
  window.mountMemory = function (root) {
    const music = createMusic();

    let level = 0;
    let deck = [];
    let flipped = [];      // אינדקסים של קלפים פתוחים כרגע
    let matched = new Set();
    let lock = false;
    let timeLeft = 0;
    let tick = null;
    let moves = 0;
    let started = false;

    const MDICT = {"he": {"lLevel": "שלב", "lPairs": "זוגות", "lTime": "זמן", "lMoves": "מהלכים", "musicTitle": "מוזיקה", "introText": "${MT('introText')}", "startBtn": "▶ התחל", "winTitle": "🏆 ניצחת!", "winText": "סיימת את כל 7 השלבים!<br>כל הכבוד.", "playAgain": "↻ שחק שוב", "stageDoneTitle": "✅ שלב {n} הושלם!", "stageDoneText": "נשארו לך <b>{b}</b> שניות.<br>מהלכים: <b>{m}</b>", "nextStage": "▶ שלב הבא", "timeUpTitle": "⏰ נגמר הזמן", "timeUpText": "מצאת {f} מתוך {p} זוגות.", "retry": "↻ נסה שוב"}, "en": {"lLevel": "Level", "lPairs": "Pairs", "lTime": "Time", "lMoves": "Moves", "musicTitle": "Music", "introText": "Find all the pairs before time runs out.<br>7 levels — each with more cards and more time.", "startBtn": "▶ Start", "winTitle": "🏆 You won!", "winText": "You finished all 7 levels!<br>Well done.", "playAgain": "↻ Play again", "stageDoneTitle": "✅ Level {n} complete!", "stageDoneText": "You have <b>{b}</b> seconds left.<br>Moves: <b>{m}</b>", "nextStage": "▶ Next level", "timeUpTitle": "⏰ Time's up", "timeUpText": "You found {f} of {p} pairs.", "retry": "↻ Try again"}, "ar": {"lLevel": "المستوى", "lPairs": "أزواج", "lTime": "الوقت", "lMoves": "الحركات", "musicTitle": "موسيقى", "introText": "جد كل الأزواج قبل انتهاء الوقت.<br>7 مستويات — كل مستوى بطاقات أكثر ووقت أكثر.", "startBtn": "▶ ابدأ", "winTitle": "🏆 فزت!", "winText": "أنهيت كل المستويات السبعة!<br>أحسنت.", "playAgain": "↻ العب مجدداً", "stageDoneTitle": "✅ المستوى {n} اكتمل!", "stageDoneText": "بقي لديك <b>{b}</b> ثانية.<br>الحركات: <b>{m}</b>", "nextStage": "▶ المستوى التالي", "timeUpTitle": "⏰ انتهى الوقت", "timeUpText": "وجدت {f} من {p} أزواج.", "retry": "↻ حاول مجدداً"}, "zh": {"lLevel": "关卡", "lPairs": "配对", "lTime": "时间", "lMoves": "步数", "musicTitle": "音乐", "introText": "在时间结束前找出所有配对。<br>7 个关卡——每关卡片更多、时间更多。", "startBtn": "▶ 开始", "winTitle": "🏆 你赢了!", "winText": "你完成了全部 7 关!<br>做得好。", "playAgain": "↻ 再玩一次", "stageDoneTitle": "✅ 第 {n} 关完成!", "stageDoneText": "你还剩 <b>{b}</b> 秒。<br>步数: <b>{m}</b>", "nextStage": "▶ 下一关", "timeUpTitle": "⏰ 时间到", "timeUpText": "你找到了 {p} 对中的 {f} 对。", "retry": "↻ 再试一次"}, "es": {"lLevel": "Nivel", "lPairs": "Parejas", "lTime": "Tiempo", "lMoves": "Movimientos", "musicTitle": "Música", "introText": "Encuentra todas las parejas antes de que se acabe el tiempo.<br>7 niveles: cada uno con más cartas y más tiempo.", "startBtn": "▶ Empezar", "winTitle": "🏆 ¡Ganaste!", "winText": "¡Completaste los 7 niveles!<br>¡Bien hecho!", "playAgain": "↻ Jugar otra vez", "stageDoneTitle": "✅ ¡Nivel {n} completado!", "stageDoneText": "Te quedan <b>{b}</b> segundos.<br>Movimientos: <b>{m}</b>", "nextStage": "▶ Siguiente nivel", "timeUpTitle": "⏰ Se acabó el tiempo", "timeUpText": "Encontraste {f} de {p} parejas.", "retry": "↻ Intentar de nuevo"}, "fr": {"lLevel": "Niveau", "lPairs": "Paires", "lTime": "Temps", "lMoves": "Coups", "musicTitle": "Musique", "introText": "Trouve toutes les paires avant la fin du temps.<br>7 niveaux — chacun avec plus de cartes et plus de temps.", "startBtn": "▶ Démarrer", "winTitle": "🏆 Gagné !", "winText": "Tu as fini les 7 niveaux !<br>Bravo.", "playAgain": "↻ Rejouer", "stageDoneTitle": "✅ Niveau {n} terminé !", "stageDoneText": "Il te reste <b>{b}</b> secondes.<br>Coups : <b>{m}</b>", "nextStage": "▶ Niveau suivant", "timeUpTitle": "⏰ Temps écoulé", "timeUpText": "Tu as trouvé {f} paires sur {p}.", "retry": "↻ Reintentar"}, "pt": {"lLevel": "Nível", "lPairs": "Pares", "lTime": "Tempo", "lMoves": "Jogadas", "musicTitle": "Música", "introText": "Encontre todos os pares antes do tempo acabar.<br>7 níveis — cada um com mais cartas e mais tempo.", "startBtn": "▶ Começar", "winTitle": "🏆 Você venceu!", "winText": "Você concluiu os 7 níveis!<br>Muito bem.", "playAgain": "↻ Jogar de novo", "stageDoneTitle": "✅ Nível {n} concluído!", "stageDoneText": "Você tem <b>{b}</b> segundos restantes.<br>Jogadas: <b>{m}</b>", "nextStage": "▶ Próximo nível", "timeUpTitle": "⏰ Tempo esgotado", "timeUpText": "Você encontrou {f} de {p} pares.", "retry": "↻ Tentar de novo"}, "ru": {"lLevel": "Уровень", "lPairs": "Пары", "lTime": "Время", "lMoves": "Ходы", "musicTitle": "Музыка", "introText": "Найди все пары, пока не вышло время.<br>7 уровней — на каждом больше карт и больше времени.", "startBtn": "▶ Начать", "winTitle": "🏆 Ты выиграл!", "winText": "Ты прошёл все 7 уровней!<br>Молодец.", "playAgain": "↻ Играть снова", "stageDoneTitle": "✅ Уровень {n} пройден!", "stageDoneText": "У тебя осталось <b>{b}</b> секунд.<br>Ходы: <b>{m}</b>", "nextStage": "▶ Следующий уровень", "timeUpTitle": "⏰ Время вышло", "timeUpText": "Ты нашёл {f} из {p} пар.", "retry": "↻ Ещё раз"}, "de": {"lLevel": "Level", "lPairs": "Paare", "lTime": "Zeit", "lMoves": "Züge", "musicTitle": "Musik", "introText": "Finde alle Paare, bevor die Zeit abläuft.<br>7 Level — jedes mit mehr Karten und mehr Zeit.", "startBtn": "▶ Start", "winTitle": "🏆 Gewonnen!", "winText": "Du hast alle 7 Level geschafft!<br>Gut gemacht.", "playAgain": "↻ Nochmal", "stageDoneTitle": "✅ Level {n} geschafft!", "stageDoneText": "Dir bleiben <b>{b}</b> Sekunden.<br>Züge: <b>{m}</b>", "nextStage": "▶ Nächstes Level", "timeUpTitle": "⏰ Zeit abgelaufen", "timeUpText": "Du hast {f} von {p} Paaren gefunden.", "retry": "↻ Nochmal versuchen"}};
    let MLNG='he'; try{ var _p=localStorage.getItem('flrot:lang'); if(_p) MLNG=_p; }catch(e){}
    if(!MDICT[MLNG]) MLNG='he';
    const MRTL=(MLNG==='he'||MLNG==='ar');
    const MT=k=>(MDICT[MLNG]&&MDICT[MLNG][k])||MDICT['he'][k]||k;
    root.innerHTML = `
      <div class="mem-wrap" style="direction:${MRTL?'rtl':'ltr'};">
        <div class="mem-bg"></div>
        <div class="mem-inner">

          <div class="mem-top">
            <img class="mem-logo" src="memory-logo.png" alt="Memory Adjustment">
          </div>

          <div class="mem-hud">
            <div class="mem-stat"><span class="mem-stat-l">${MT('lLevel')}</span><span id="mem-level">1 / 7</span></div>
            <div class="mem-stat"><span class="mem-stat-l">${MT('lPairs')}</span><span id="mem-pairs">0 / 4</span></div>
            <div class="mem-stat mem-time"><span class="mem-stat-l">${MT('lTime')}</span><span id="mem-time">0:45</span></div>
            <div class="mem-stat"><span class="mem-stat-l">${MT('lMoves')}</span><span id="mem-moves">0</span></div>
            <button id="mem-music" class="mem-btn-icon" title="${MT('musicTitle')}">🔇</button>
          </div>

          <div class="mem-barwrap"><div id="mem-bar" class="mem-bar"></div></div>

          <div id="mem-board" class="mem-board"></div>

          <div id="mem-overlay" class="mem-overlay">
            <div class="mem-card-panel">
              <h2 id="mem-ov-title">Memory Adjustment</h2>
              <p id="mem-ov-text">מצא את כל הזוגות לפני שהזמן נגמר.<br>7 שלבים — כל שלב יותר קלפים ויותר זמן.</p>
              <button id="mem-ov-btn" class="mem-btn">${MT('startBtn')}</button>
            </div>
          </div>

        </div>
      </div>
    `;

    // ---- אלמנטים ----
    const board    = root.querySelector('#mem-board');
    const overlay  = root.querySelector('#mem-overlay');
    const ovTitle  = root.querySelector('#mem-ov-title');
    const ovText   = root.querySelector('#mem-ov-text');
    const ovBtn    = root.querySelector('#mem-ov-btn');
    const elLevel  = root.querySelector('#mem-level');
    const elPairs  = root.querySelector('#mem-pairs');
    const elTime   = root.querySelector('#mem-time');
    const elMoves  = root.querySelector('#mem-moves');
    const elBar    = root.querySelector('#mem-bar');
    const btnMusic = root.querySelector('#mem-music');

    // ---- מוזיקה ----
    btnMusic.onclick = () => {
      if (music.isOn()) { music.stop(); btnMusic.textContent = '🔇'; btnMusic.classList.remove('on'); }
      else { music.start(); btnMusic.textContent = '🎵'; btnMusic.classList.add('on'); }
    };

    function fmt(s) {
      const m = Math.floor(s / 60);
      const ss = String(Math.floor(s % 60)).padStart(2, '0');
      return `${m}:${ss}`;
    }

    // ---- בניית שלב ----
    function buildLevel() {
      const cfg = LEVELS[level];
      const pairs = cfg.cards / 2;

      // בחירת אימוג'ים רנדומליים מהמאגר + ערבוב
      const picked = shuffle(EMOJI_POOL).slice(0, pairs);
      deck = shuffle([...picked, ...picked]);

      flipped = [];
      matched = new Set();
      lock = false;
      moves = 0;
      timeLeft = cfg.time;

      elLevel.textContent = `${level + 1} / ${LEVELS.length}`;
      elPairs.textContent = `0 / ${pairs}`;
      elMoves.textContent = '0';
      elTime.textContent = fmt(timeLeft);
      elBar.style.width = '100%';
      elBar.classList.remove('low');

      board.style.gridTemplateColumns = `repeat(${cfg.cols}, 1fr)`;
      board.className = 'mem-board size-' + cfg.cards;
      board.innerHTML = '';

      deck.forEach((emoji, i) => {
        const card = document.createElement('button');
        card.className = 'mem-card';
        card.dataset.i = i;
        card.innerHTML = `
          <div class="mem-card-in">
            <div class="mem-face mem-back">?</div>
            <div class="mem-face mem-front">${emoji}</div>
          </div>
        `;
        card.onclick = () => onFlip(i, card);
        board.appendChild(card);
      });
    }

    // ---- לחיצה על קלף ----
    function onFlip(i, card) {
      if (lock || !started) return;
      if (matched.has(i)) return;
      if (flipped.includes(i)) return;
      if (flipped.length >= 2) return;

      card.classList.add('flip');
      flipped.push(i);

      if (flipped.length === 2) {
        moves++;
        elMoves.textContent = moves;
        lock = true;

        const [a, b] = flipped;
        const cardA = board.querySelector(`[data-i="${a}"]`);
        const cardB = board.querySelector(`[data-i="${b}"]`);

        if (deck[a] === deck[b]) {
          // התאמה!
          music.ding(true);
          setTimeout(() => {
            matched.add(a); matched.add(b);
            cardA.classList.add('done');
            cardB.classList.add('done');
            flipped = [];
            lock = false;

            const pairs = LEVELS[level].cards / 2;
            elPairs.textContent = `${matched.size / 2} / ${pairs}`;

            if (matched.size === deck.length) winLevel();
          }, 380);
        } else {
          // לא מתאים
          music.ding(false);
          setTimeout(() => {
            cardA.classList.remove('flip');
            cardB.classList.remove('flip');
            flipped = [];
            lock = false;
          }, 750);
        }
      }
    }

    // ---- טיימר ----
    function startTimer() {
      stopTimer();
      tick = setInterval(() => {
        timeLeft--;
        elTime.textContent = fmt(Math.max(0, timeLeft));
        const pct = (timeLeft / LEVELS[level].time) * 100;
        elBar.style.width = Math.max(0, pct) + '%';
        if (pct <= 25) elBar.classList.add('low'); else elBar.classList.remove('low');
        if (timeLeft <= 0) loseLevel();
      }, 1000);
    }
    function stopTimer() { if (tick) { clearInterval(tick); tick = null; } }

    // ---- ניצחון בשלב ----
    function winLevel() {
      stopTimer();
      started = false;
      const bonus = timeLeft;

      if (level === LEVELS.length - 1) {
        showOverlay(MT('winTitle'), MT('winText'), MT('playAgain'), () => {
          level = 0; startLevel();
        });
      } else {
        showOverlay(MT('stageDoneTitle').replace('{n}',level+1), MT('stageDoneText').replace('{b}',bonus).replace('{m}',moves), MT('nextStage'), () => {
          level++; startLevel();
        });
      }
    }

    // ---- הפסד ----
    function loseLevel() {
      stopTimer();
      started = false;
      lock = true;
      const pairs = LEVELS[level].cards / 2;
      showOverlay(MT('timeUpTitle'), MT('timeUpText').replace('{f}',matched.size/2).replace('{p}',pairs), MT('retry'), () => {
        startLevel();
      });
    }

    // ---- אוברליי ----
    function showOverlay(title, text, btn, fn) {
      ovTitle.innerHTML = title;
      ovText.innerHTML = text;
      ovBtn.textContent = btn;
      ovBtn.onclick = () => { overlay.classList.remove('show'); fn(); };
      overlay.classList.add('show');
    }

    // ---- התחלת שלב ----
    function startLevel() {
      buildLevel();
      // הצצה קצרה בכל הקלפים לפני שמתחילים
      const cards = board.querySelectorAll('.mem-card');
      cards.forEach(c => c.classList.add('flip'));
      lock = true;
      started = false;

      const peek = Math.min(1400 + LEVELS[level].cards * 30, 2600);
      setTimeout(() => {
        cards.forEach(c => c.classList.remove('flip'));
        setTimeout(() => {
          lock = false;
          started = true;
          startTimer();
        }, 420);
      }, peek);
    }

    // ---- כפתור התחלה ראשוני ----
    overlay.classList.add('show');
    ovBtn.onclick = () => {
      overlay.classList.remove('show');
      music.start();
      btnMusic.textContent = '🎵';
      btnMusic.classList.add('on');
      level = 0;
      startLevel();
    };

    // ---- cleanup ----
    return function cleanup() {
      stopTimer();
      music.stop();
      root.innerHTML = '';
    };
  };
})();
