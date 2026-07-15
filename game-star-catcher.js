// ============================================
//  משחק: STAR CATCHER
//  הקובץ של רובין — כאן הוא עובד!
// ============================================

<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#08092d">
  <title>תופס הכוכבים</title>

  <style>
    :root {
      font-family: Arial, sans-serif;
      color: white;
      background: #070825;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      min-height: 100%;
      overflow: hidden;
    }

    body {
      min-height: 100vh;
      background:
        radial-gradient(circle at 15% 20%, #553dbe44, transparent 30%),
        radial-gradient(circle at 85% 75%, #15739c33, transparent 30%),
        #070825;
    }

    button {
      font-family: inherit;
      cursor: pointer;
    }

    .app {
      width: min(1180px, 96vw);
      margin: auto;
    }

    header {
      height: 88px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 900;
    }

    .logo-icon {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      font-size: 26px;
      background: linear-gradient(145deg, #6f62ff, #b046e9);
      box-shadow: 0 8px 25px #6d48dc66;
    }

    .stats {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .stat {
      min-width: 82px;
      padding: 7px 12px;
      text-align: center;
      border: 1px solid #ffffff18;
      border-radius: 13px;
      background: #ffffff09;
    }

    .stat span {
      display: block;
      color: #9294b5;
      font-size: 10px;
      font-weight: 700;
    }

    .stat strong {
      font-size: 19px;
    }

    #lives {
      color: #ff577b;
      white-space: nowrap;
      letter-spacing: 1px;
    }

    .sound {
      width: 42px;
      height: 42px;
      border: 1px solid #ffffff20;
      border-radius: 50%;
      background: #ffffff0b;
      color: white;
      font-size: 18px;
    }

    .game-box {
      position: relative;
      height: calc(100vh - 145px);
      min-height: 460px;
      max-height: 720px;
      overflow: hidden;
      border: 1px solid #8e86ff55;
      border-radius: 27px;
      background: #10123d;
      box-shadow: 0 24px 70px #00071f99;
    }

    canvas {
      width: 100%;
      height: 100%;
      display: block;
      touch-action: none;
    }

    .overlay {
      position: absolute;
      inset: 0;
      z-index: 5;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
      overflow-y: auto;
      background:
        radial-gradient(circle at 50% 43%, #31236cbb, #090a2bee 65%);
      transition: opacity .25s, visibility .25s;
    }

    .hidden {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

    .tag {
      padding: 5px 15px;
      border: 1px solid #8d79ff66;
      border-radius: 100px;
      color: #aaa2ff;
      font-size: 11px;
      font-weight: 900;
    }

    h1,
    h2 {
      margin: 14px 0;
      line-height: .95;
      color: #ffd85e;
      font-size: clamp(42px, 7vw, 72px);
      text-shadow: 0 0 28px #ffb92755;
    }

    p {
      color: #b6b7d2;
      line-height: 1.6;
    }

    .primary {
      min-width: 220px;
      padding: 14px 24px;
      border: 0;
      border-radius: 13px;
      color: white;
      background: linear-gradient(100deg, #6d5af2, #8b46d9);
      box-shadow: 0 10px 30px #6541db55;
      font-size: 15px;
      font-weight: 900;
    }

    .secondary {
      margin-top: 8px;
      padding: 7px 16px;
      border: 0;
      color: #b0b1d2;
      background: transparent;
      text-decoration: underline;
    }

    .close {
      position: absolute;
      top: 18px;
      left: 18px;
      width: 42px;
      height: 42px;
      border: 1px solid #ffffff22;
      border-radius: 50%;
      color: white;
      background: #ffffff0c;
      font-size: 26px;
    }

    .guide-layout,
    .instructions {
      width: min(560px, 100%);
      display: grid;
      gap: 8px;
    }

    .guide-layout {
      grid-template-columns: repeat(3, 1fr);
      margin-bottom: 10px;
    }

    .guide-layout div,
    .instruction {
      padding: 11px;
      border: 1px solid #ffffff15;
      border-radius: 12px;
      background: #ffffff08;
    }

    .guide-layout b,
    .guide-layout small {
      display: block;
    }

    .guide-layout b {
      color: #aaa2ff;
    }

    .guide-layout small {
      color: #898baa;
      margin-top: 4px;
    }

    .instructions {
      grid-template-columns: 1fr 1fr;
      text-align: right;
    }

    .instruction {
      display: flex;
      align-items: center;
      gap: 11px;
    }

    .instruction i {
      width: 38px;
      height: 38px;
      flex: 0 0 38px;
      display: grid;
      place-items: center;
      border-radius: 10px;
      background: #ffffff0d;
      font-style: normal;
      font-size: 20px;
    }

    .instruction span,
    .instruction small {
      display: block;
    }

    .instruction small {
      color: #9294af;
      margin-top: 3px;
    }

    .blue {
      color: #a6efff;
    }

    .gold {
      color: #ffd956;
    }

    .red {
      color: #ff577b;
    }

    .rainbow {
      color: white;
      background:
        linear-gradient(135deg, #ff5b75, #ffd85e, #52e6c8, #806cff, #ef6adf)
        !important;
    }

    .stage-grid {
      width: min(600px, 100%);
      max-height: 360px;
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
      padding: 5px;
      overflow-y: auto;
      direction: ltr;
    }

    .stage {
      aspect-ratio: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: 1px solid #ffffff15;
      border-radius: 13px;
      color: #77799b;
      background: #ffffff08;
    }

    .stage strong {
      font-size: 20px;
    }

    .stage small {
      font-size: 8px;
    }

    .stage.done {
      color: #19152e;
      background: linear-gradient(145deg, #ffe47a, #eeb13d);
    }

    .stage.current {
      color: white;
      border-color: #8e7cff;
      background: linear-gradient(145deg, #7764f6, #874ad2);
      transform: scale(1.05);
    }

    .medal {
      width: 78px;
      height: 78px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: white;
      font-size: 38px;
      background: linear-gradient(145deg, #ffdc5d, #d68b1f);
      box-shadow: 0 0 45px #ffd85e66;
    }

    footer {
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
      color: #737593;
      font-size: 10px;
    }

    .version {
      position: fixed;
      bottom: 5px;
      left: 8px;
      color: #595b7b;
      font-size: 9px;
    }

    @media (max-width: 700px) {
      .app {
        width: 100%;
      }

      header {
        height: 75px;
        padding: 0 8px;
      }

      .logo strong {
        display: none;
      }

      .logo-icon {
        width: 36px;
        height: 36px;
      }

      .stat {
        min-width: 48px;
        padding: 8px 6px;
      }

      .stat span {
        display: none;
      }

      .stat:nth-child(2),
      .stat:nth-child(4) {
        display: none;
      }

      .stat:last-child {
        min-width: 76px;
      }

      #lives {
        font-size: 14px;
      }

      .game-box {
        height: calc(100vh - 115px);
        border-radius: 20px 20px 0 0;
      }

      footer {
        height: 40px;
        gap: 9px;
        font-size: 8px;
      }

      .guide-layout,
      .instructions {
        grid-template-columns: 1fr;
      }

      .guide-layout div,
      .instruction {
        padding: 7px 10px;
      }

      .stage-grid {
        grid-template-columns: repeat(5, 1fr);
      }
    }
  </style>
</head>

<body>
  <main class="app">
    <header>
      <div class="logo">
        <span class="logo-icon">✦</span>
        <strong>תופס הכוכבים</strong>
      </div>

      <div class="stats">
        <div class="stat">
          <span>נקודות בשלב</span>
          <strong id="score">0</strong>
        </div>

        <div class="stat">
          <span>נשארו</span>
          <strong id="remaining">10</strong>
        </div>

        <div class="stat">
          <span>שלב</span>
          <strong id="level">1</strong>
        </div>

        <div class="stat">
          <span>שיא</span>
          <strong id="highScore">0</strong>
        </div>

        <div class="stat">
          <span>חיים</span>
          <strong id="lives">♥ ♥ ♥</strong>
        </div>
      </div>

      <button id="soundButton" class="sound">♪</button>
    </header>

    <section class="game-box">
      <canvas id="game"></canvas>

      <div id="startScreen" class="overlay">
        <div class="tag">המשימה שלך</div>
        <h1>תופס הכוכבים</h1>
        <p>תפסו כוכבים, צברו נקודות והיזהרו ממטאורים.</p>

        <button id="startButton" class="primary">מתחילים לשחק ←</button>
        <button id="newGameButton" class="secondary hidden">
          התחלת משחק חדש
        </button>
        <button id="guideButton" class="secondary">איך משחקים?</button>
        <button id="mapButton" class="secondary">מפת השלבים</button>
      </div>

      <div id="guideScreen" class="overlay hidden">
        <button id="closeGuide" class="close">×</button>
        <div class="tag">לפני שיוצאים לחלל</div>
        <h2>מדריך המשחק</h2>

        <div class="guide-layout">
          <div>
            <b>למעלה</b>
            <small>ניקוד, שלב, שיא וחיים</small>
          </div>
          <div>
            <b>במרכז</b>
            <small>כאן נופלים הכוכבים והמטאורים</small>
          </div>
          <div>
            <b>למטה</b>
            <small>הסל שאותו מזיזים</small>
          </div>
        </div>

        <div class="instructions">
          <div class="instruction">
            <i class="blue">★</i>
            <span><b>כוכב רגיל</b><small>מעניק נקודה אחת</small></span>
          </div>

          <div class="instruction">
            <i class="gold">★</i>
            <span><b>כוכב זהב</b><small>מעניק 3 נקודות</small></span>
          </div>

          <div class="instruction">
            <i class="rainbow">★</i>
            <span><b>כוכב צבעוני</b><small>מעניק 5 נקודות</small></span>
          </div>

          <div class="instruction">
            <i class="red">●</i>
            <span><b>מטאור</b><small>פגיעה בסל מורידה חיים</small></span>
          </div>

          <div class="instruction">
            <i>↔</i>
            <span><b>שליטה</b><small>חצים, עכבר או אצבע</small></span>
          </div>

          <div class="instruction">
            <i>−1</i>
            <span><b>פספוס</b><small>פספוס כוכב מוריד נקודה בלבד</small></span>
          </div>
        </div>

        <p>שלב 1 דורש 10 נקודות, שלב 2 דורש 20 וכך עד שלב 30.</p>
        <button id="playFromGuide" class="primary">הבנתי, בואו נשחק!</button>
      </div>

      <div id="levelScreen" class="overlay hidden">
        <div class="tag">המשימה הושלמה</div>
        <div class="medal">★</div>
        <h2>שלב <span id="completedLevel">1</span> הושלם!</h2>
        <p>אספת את כל <strong id="completedTarget">10</strong> הנקודות.</p>
        <button id="nextLevelButton" class="primary">לשלב הבא ←</button>
        <button id="levelMapButton" class="secondary">הצגת מפת השלבים</button>
      </div>

      <div id="mapScreen" class="overlay hidden">
        <button id="closeMap" class="close">×</button>
        <div class="tag">המסע שלך בחלל</div>
        <h2>מפת השלבים</h2>
        <div id="stageGrid" class="stage-grid"></div>
        <p>כל שלב דורש 10 נקודות יותר מהשלב הקודם.</p>
        <button id="backButton" class="primary">חזרה</button>
      </div>

      <div id="gameOverScreen" class="overlay hidden">
        <div class="tag">המסע הסתיים</div>
        <h2>כל הכבוד!</h2>
        <p>אספת בסך הכול <strong id="finalScore">0</strong> נקודות.</p>
        <button id="restartButton" class="primary">משחק חדש ↻</button>
      </div>

      <div id="victoryScreen" class="overlay hidden">
        <div class="medal">★</div>
        <h2>כבשת את החלל!</h2>
        <p>
          השלמת את כל 30 השלבים עם
          <strong id="victoryScore">0</strong>
          נקודות.
        </p>
        <button id="victoryRestart" class="primary">משחק חדש ↻</button>
      </div>
    </section>

    <footer>
      <span class="blue">★ רגיל: 1</span>
      <span class="gold">★ זהב: 3</span>
      <span>★ צבעוני: 5</span>
      <span class="red">● מטאור</span>
      <span class="version">גרסה 1.9.1</span>
    </footer>
  </main>

  <script>
    const canvas = document.querySelector("#game");
    const ctx = canvas.getContext("2d");

    const scoreEl = document.querySelector("#score");
    const remainingEl = document.querySelector("#remaining");
    const levelEl = document.querySelector("#level");
    const highScoreEl = document.querySelector("#highScore");
    const livesEl = document.querySelector("#lives");

    const startScreen = document.querySelector("#startScreen");
    const guideScreen = document.querySelector("#guideScreen");
    const levelScreen = document.querySelector("#levelScreen");
    const mapScreen = document.querySelector("#mapScreen");
    const gameOverScreen = document.querySelector("#gameOverScreen");
    const victoryScreen = document.querySelector("#victoryScreen");

    const startButton = document.querySelector("#startButton");
    const newGameButton = document.querySelector("#newGameButton");
    const soundButton = document.querySelector("#soundButton");
    const stageGrid = document.querySelector("#stageGrid");

    const SAVE_KEY = "starCatcherSavedGame";
    const BACKUP_KEY = "starCatcherSavedGameBackup";
    const PROGRESS_KEY = "starCatcherPermanentProgress";
    const HIGH_SCORE_KEY = "starCatcherHighScore";
    const GUIDE_KEY = "starCatcherGuideSeen";

    let width = 0;
    let height = 0;
    let dpr = 1;

    let running = false;
    let paused = false;
    let muted = false;

    let score = 0;
    let totalScore = 0;
    let level = 1;
    let lives = 3;

    let lastTime = 0;
    let spawnTimer = 0;
    let rainbowCounter = 0;
    let nextRainbow = randomRainbowInterval();

    let objects = [];
    let particles = [];
    let scoreTexts = [];

    let mapSource = "start";

    let highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
    let maxUnlocked = loadPermanentProgress();
    let savedGame = loadSavedGame();

    let audioContext;
    let musicGain;
    let musicTimer;
    let musicStep = 0;

    const keys = {
      left: false,
      right: false
    };

    const basket = {
      x: 0,
      y: 0,
      width: 112,
      height: 44,
      speed: 560
    };

    const backgroundStars = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random(),
      radius: Math.random() * 1.5 + 0.25,
      alpha: Math.random() * 0.65 + 0.2,
      speed: Math.random() * 0.12 + 0.03
    }));

    function randomRainbowInterval() {
      return 10 + Math.floor(Math.random() * 6);
    }

    function loadPermanentProgress() {
      const saved = Number(localStorage.getItem(PROGRESS_KEY)) || 1;
      return Math.max(1, Math.min(30, saved));
    }

    function savePermanentProgress() {
      maxUnlocked = Math.max(maxUnlocked, level);
      localStorage.setItem(PROGRESS_KEY, String(maxUnlocked));
    }

    function loadSavedGame() {
      try {
        const possibleSaves = [
          localStorage.getItem(SAVE_KEY),
          localStorage.getItem(BACKUP_KEY)
        ]
          .filter(Boolean)
          .map(value => JSON.parse(value))
          .filter(state =>
            state &&
            state.level >= 1 &&
            state.level <= 30 &&
            state.lives > 0
          );

        possibleSaves.sort(
          (a, b) => (b.savedAt || 0) - (a.savedAt || 0)
        );

        return possibleSaves[0] || null;
      } catch {
        return null;
      }
    }

    function saveGame() {
      if (!running) return;

      const state = {
        score,
        totalScore,
        level,
        lives,
        savedAt: Date.now()
      };

      const json = JSON.stringify(state);

      localStorage.setItem(SAVE_KEY, json);
      localStorage.setItem(BACKUP_KEY, json);

      savedGame = state;
      savePermanentProgress();
    }

    function clearActiveSave() {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(BACKUP_KEY);
      savedGame = null;
    }

    function prepareSavedGame() {
      if (!savedGame) return;

      score = savedGame.score || 0;
      totalScore = savedGame.totalScore || 0;
      level = savedGame.level || 1;
      lives = savedGame.lives || 3;

      savePermanentProgress();
      updateHud();

      startButton.textContent = `ממשיכים משלב ${level} ←`;
      newGameButton.classList.remove("hidden");
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();

      width = rect.width;
      height = rect.height;
      dpr = Math.min(devicePixelRatio || 1, 2);

      canvas.width = width * dpr;
      canvas.height = height * dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      basket.y = height - 65;
      basket.x = Math.min(
        basket.x || width / 2,
        width - basket.width / 2
      );
    }

    function updateHud() {
      scoreEl.textContent = score;
      remainingEl.textContent = Math.max(0, level * 10 - score);
      levelEl.textContent = level;
      highScoreEl.textContent = highScore;

      livesEl.textContent = Array.from(
        { length: 3 },
        (_, index) => index < lives ? "♥" : "♡"
      ).join(" ");
    }

    function initializeAudio() {
      if (!audioContext) {
        audioContext = new (
          window.AudioContext ||
          window.webkitAudioContext
        )();
      }

      if (audioContext.state === "suspended") {
        audioContext.resume();
      }
    }

    function playTone(frequency, duration, type = "sine") {
      if (muted) return;

      initializeAudio();

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;

      oscillator.type = type;
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    }

    function startMusic() {
      if (muted || musicTimer) return;

      initializeAudio();

      musicGain = audioContext.createGain();
      musicGain.gain.value = 0.025;
      musicGain.connect(audioContext.destination);

      const bass = audioContext.createOscillator();
      const bassGain = audioContext.createGain();

      bass.type = "sine";
      bass.frequency.value = 55;
      bassGain.gain.value = 0.3;

      bass.connect(bassGain).connect(musicGain);
      bass.start();

      musicGain.bass = bass;

      const notes = [
        220,
        277.18,
        329.63,
        415.3,
        329.63,
        277.18,
        246.94,
        329.63
      ];

      function playMusicNote() {
        if (!running || muted) return;

        const now = audioContext.currentTime;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = notes[musicStep++ % notes.length];

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.28, now + 0.35);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.4);

        oscillator.connect(gain).connect(musicGain);
        oscillator.start(now);
        oscillator.stop(now + 2.5);
      }

      playMusicNote();
      musicTimer = setInterval(playMusicNote, 1150);
    }

    function stopMusic() {
      clearInterval(musicTimer);
      musicTimer = null;

      if (!musicGain || !audioContext) return;

      const oldGain = musicGain;
      const now = audioContext.currentTime;

      oldGain.gain.setValueAtTime(
        Math.max(oldGain.gain.value, 0.001),
        now
      );

      oldGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      if (oldGain.bass) {
        oldGain.bass.stop(now + 0.3);
      }

      setTimeout(() => oldGain.disconnect(), 350);
      musicGain = null;
    }

    function startGame(resume) {
      if (resume && savedGame) {
        score = savedGame.score || 0;
        totalScore = savedGame.totalScore || 0;
        level = savedGame.level || 1;
        lives = savedGame.lives || 3;
      } else {
        score = 0;
        totalScore = 0;
        level = 1;
        lives = 3;
        clearActiveSave();
      }

      objects = [];
      particles = [];
      scoreTexts = [];

      rainbowCounter = 0;
      nextRainbow = randomRainbowInterval();
      spawnTimer = 0;

      basket.x = width / 2;

      running = true;
      paused = false;
      lastTime = performance.now();

      hideAllScreens();
      updateHud();
      saveGame();
      startMusic();

      requestAnimationFrame(gameLoop);
    }

    function hideAllScreens() {
      [
        startScreen,
        guideScreen,
        levelScreen,
        mapScreen,
        gameOverScreen,
        victoryScreen
      ].forEach(screen => screen.classList.add("hidden"));
    }

    function finishLevel() {
      const target = level * 10;

      if (score < target) return;

      if (level === 30) {
        finishGame();
        return;
      }

      const completed = level;

      level++;
      score = 0;
      paused = true;

      savePermanentProgress();
      updateHud();
      saveGame();

      document.querySelector("#completedLevel").textContent = completed;
      document.querySelector("#completedTarget").textContent = target;

      levelScreen.classList.remove("hidden");

      playTone(920, 0.22);
      setTimeout(() => playTone(1160, 0.25), 100);
    }

    function endGame() {
      running = false;
      paused = false;

      stopMusic();

      if (totalScore > highScore) {
        highScore = totalScore;
        localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
      }

      document.querySelector("#finalScore").textContent = totalScore;

      clearActiveSave();
      updateHud();
      gameOverScreen.classList.remove("hidden");
    }

    function finishGame() {
      running = false;
      paused = false;

      savePermanentProgress();
      stopMusic();

      if (totalScore > highScore) {
        highScore = totalScore;
        localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
      }

      document.querySelector("#victoryScore").textContent = totalScore;

      clearActiveSave();
      updateHud();
      victoryScreen.classList.remove("hidden");

      playTone(1040, 0.5);
      setTimeout(() => playTone(1320, 0.6), 180);
    }

    function renderStages() {
      stageGrid.innerHTML = "";

      for (let stageNumber = 1; stageNumber <= 30; stageNumber++) {
        const element = document.createElement("div");
        const completed = stageNumber < maxUnlocked;

        element.className = "stage";

        if (completed) {
          element.classList.add("done");
        } else if (stageNumber === level) {
          element.classList.add("current");
        }

        element.innerHTML = `
          <strong>${completed ? "✓" : stageNumber}</strong>
          <small>${stageNumber * 10} נק׳</small>
        `;

        stageGrid.appendChild(element);
      }
    }

    function openMap(source) {
      mapSource = source;
      renderStages();

      if (source === "level") {
        levelScreen.classList.add("hidden");
      }

      mapScreen.classList.remove("hidden");
    }

    function closeMap() {
      mapScreen.classList.add("hidden");

      if (mapSource === "level") {
        levelScreen.classList.remove("hidden");
      }
    }

    function spawnObject() {
      rainbowCounter++;

      const meteorChance = Math.min(
        0.13 + (level - 1) * 0.025,
        0.42
      );

      let type;
      const roll = Math.random();

      if (rainbowCounter >= nextRainbow) {
        type = "rainbow";
        rainbowCounter = 0;
        nextRainbow = randomRainbowInterval();
      } else if (roll < meteorChance) {
        type = "meteor";
      } else if (roll < meteorChance + 0.12) {
        type = "gold";
      } else {
        type = "star";
      }

      let size = 14;

      if (type === "gold") size = 17;
      if (type === "rainbow") size = 18;
      if (type === "meteor") size = 20 + Math.random() * 7;

      objects.push({
        type,
        size,
        x: size + Math.random() * (width - size * 2),
        y: -35,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 3,
        speed:
          145 +
          Math.random() * 75 +
          (level - 1) * 22
      });
    }

    function createBurst(x, y, color) {
      for (let index = 0; index < 13; index++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 180,
          vy: (Math.random() - 0.5) * 180,
          life: 1,
          size: Math.random() * 3 + 1,
          color
        });
      }
    }

    function showPoints(x, y, points, color) {
      scoreTexts.push({
        x,
        y,
        points,
        color,
        life: 1
      });
    }

    function createStarPath(x, y, radius, rotation = 0) {
      ctx.beginPath();

      for (let index = 0; index < 10; index++) {
        const angle =
          rotation -
          Math.PI / 2 +
          index * Math.PI / 5;

        const currentRadius =
          index % 2 === 0 ? radius : radius * 0.43;

        const px = x + Math.cos(angle) * currentRadius;
        const py = y + Math.sin(angle) * currentRadius;

        if (index === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }

      ctx.closePath();
    }

    function drawBackground(time) {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);

      gradient.addColorStop(0, "#11113f");
      gradient.addColorStop(0.65, "#101941");
      gradient.addColorStop(1, "#102b43");

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      for (const star of backgroundStars) {
        const y =
          (star.y * height + time * star.speed) % height;

        ctx.globalAlpha =
          star.alpha *
          (0.75 + Math.sin(time * 0.002 + star.x * 20) * 0.25);

        ctx.fillStyle = "#dfe8ff";
        ctx.beginPath();
        ctx.arc(
          star.x * width,
          y,
          star.radius,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    }

    function drawFallingObject(object) {
      ctx.save();
      ctx.translate(object.x, object.y);
      ctx.rotate(object.rotation);

      if (object.type === "meteor") {
        ctx.shadowColor = "#ff5e76";
        ctx.shadowBlur = 13;
        ctx.fillStyle = "#b64d64";

        ctx.beginPath();

        for (let index = 0; index < 9; index++) {
          const angle = index / 9 * Math.PI * 2;
          const radius =
            object.size *
            (0.77 + Math.sin(index * 9.2) * 0.12);

          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;

          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#6f334d";
        ctx.beginPath();
        ctx.arc(-5, -3, 4, 0, Math.PI * 2);
        ctx.arc(6, 5, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        let color = "#a6efff";

        if (object.type === "gold") {
          color = "#ffd956";
        }

        if (object.type === "rainbow") {
          color =
            `hsl(${object.rotation * 90 % 360} 95% 68%)`;
        }

        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.fillStyle = color;

        createStarPath(0, 0, object.size);
        ctx.fill();

        if (object.type === "rainbow") {
          ctx.strokeStyle =
            `hsl(${(object.rotation * 90 + 150) % 360} 100% 75%)`;

          ctx.lineWidth = 4;
          createStarPath(0, 0, object.size * 0.78);
          ctx.stroke();
        }

        ctx.globalAlpha = 0.65;
        ctx.fillStyle = "white";
        createStarPath(-2, -2, object.size * 0.48);
        ctx.fill();
      }

      ctx.restore();
    }

    function drawBasket() {
      ctx.save();
      ctx.translate(basket.x, basket.y);

      ctx.shadowColor = "#6659ff";
      ctx.shadowBlur = 22;

      const gradient = ctx.createLinearGradient(-55, 0, 55, 0);

      gradient.addColorStop(0, "#574be1");
      gradient.addColorStop(0.5, "#9b79ff");
      gradient.addColorStop(1, "#574be1");

      ctx.fillStyle = gradient;
      ctx.beginPath();

      ctx.roundRect(
        -basket.width / 2,
        5,
        basket.width,
        basket.height - 8,
        [8, 8, 25, 25]
      );

      ctx.fill();

      ctx.fillStyle = "#b9a6ff";
      ctx.beginPath();

      ctx.roundRect(
        -basket.width / 2 - 5,
        0,
        basket.width + 10,
        12,
        6
      );

      ctx.fill();
      ctx.restore();
    }

    function updateGame(deltaTime) {
      if (keys.left) {
        basket.x -= basket.speed * deltaTime;
      }

      if (keys.right) {
        basket.x += basket.speed * deltaTime;
      }

      basket.x = Math.max(
        basket.width / 2,
        Math.min(width - basket.width / 2, basket.x)
      );

      spawnTimer -= deltaTime;

      if (spawnTimer <= 0) {
        spawnObject();

        spawnTimer =
          Math.max(0.27, 0.72 - (level - 1) * 0.045) *
          (0.82 + Math.random() * 0.4);
      }

      for (let index = objects.length - 1; index >= 0; index--) {
        const object = objects[index];

        object.y += object.speed * deltaTime;
        object.rotation += object.spin * deltaTime;

        const caught =
          object.y + object.size > basket.y &&
          object.y - object.size < basket.y + basket.height &&
          Math.abs(object.x - basket.x) <
            basket.width / 2 + object.size * 0.45;

        if (caught) {
          objects.splice(index, 1);

          if (object.type === "meteor") {
            lives--;

            createBurst(object.x, object.y, "#ff577b");
            playTone(110, 0.28, "sawtooth");
          } else {
            let points = 1;
            let color = "#a6efff";

            if (object.type === "gold") {
              points = 3;
              color = "#ffd956";
            }

            if (object.type === "rainbow") {
              points = 5;
              color = "#f58cff";
            }

            score += points;
            totalScore += points;

            showPoints(
              object.x,
              object.y,
              points,
              color
            );

            createBurst(
              object.x,
              object.y,
              color
            );

            playTone(
              object.type === "rainbow"
                ? 980
                : object.type === "gold"
                  ? 760
                  : 620,
              0.14
            );

            finishLevel();
          }

          updateHud();
          saveGame();

          if (lives <= 0) {
            endGame();
          }
        } else if (object.y - object.size > height) {
          objects.splice(index, 1);

          if (object.type !== "meteor") {
            score = Math.max(0, score - 1);
            totalScore = Math.max(0, totalScore - 1);

            updateHud();
            saveGame();
            playTone(150, 0.2, "triangle");
          }
        }
      }

      for (let index = particles.length - 1; index >= 0; index--) {
        const particle = particles[index];

        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;
        particle.vy += 120 * deltaTime;
        particle.life -= deltaTime * 1.8;

        if (particle.life <= 0) {
          particles.splice(index, 1);
        }
      }

      for (let index = scoreTexts.length - 1; index >= 0; index--) {
        const text = scoreTexts[index];

        text.y -= 45 * deltaTime;
        text.life -= deltaTime * 1.25;

        if (text.life <= 0) {
          scoreTexts.splice(index, 1);
        }
      }
    }

    function drawGame(time) {
      drawBackground(time);

      objects.forEach(drawFallingObject);

      particles.forEach(particle => {
        ctx.globalAlpha = Math.max(0, particle.life);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(
          particle.x,
          particle.y,
          particle.size,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });

      scoreTexts.forEach(text => {
        ctx.globalAlpha = Math.max(0, text.life);
        ctx.fillStyle = text.color;
        ctx.font = "bold 22px Arial";
        ctx.textAlign = "center";
        ctx.fillText(
          `+${text.points}`,
          text.x,
          text.y
        );
      });

      ctx.globalAlpha = 1;
      drawBasket();
    }

    function gameLoop(time) {
      const deltaTime = Math.min(
        (time - lastTime) / 1000,
        0.033
      );

      lastTime = time;

      if (running && !paused) {
        updateGame(deltaTime);
      }

      drawGame(time);

      if (running) {
        requestAnimationFrame(gameLoop);
      }
    }

    function moveBasket(event) {
      const rect = canvas.getBoundingClientRect();

      basket.x = event.clientX - rect.left;

      basket.x = Math.max(
        basket.width / 2,
        Math.min(width - basket.width / 2, basket.x)
      );
    }

    addEventListener("resize", resize);

    addEventListener("keydown", event => {
      if (event.key === "ArrowLeft") {
        keys.left = true;
      }

      if (event.key === "ArrowRight") {
        keys.right = true;
      }
    });

    addEventListener("keyup", event => {
      if (event.key === "ArrowLeft") {
        keys.left = false;
      }

      if (event.key === "ArrowRight") {
        keys.right = false;
      }
    });

    canvas.addEventListener("pointermove", moveBasket);

    canvas.addEventListener("pointerdown", event => {
      canvas.setPointerCapture(event.pointerId);
      moveBasket(event);
    });

    startButton.addEventListener("click", () => {
      startGame(Boolean(savedGame));
    });

    newGameButton.addEventListener("click", () => {
      startGame(false);
    });

    document.querySelector("#guideButton").addEventListener("click", () => {
      guideScreen.classList.remove("hidden");
    });

    document.querySelector("#closeGuide").addEventListener("click", () => {
      localStorage.setItem(GUIDE_KEY, "yes");
      guideScreen.classList.add("hidden");
    });

    document.querySelector("#playFromGuide").addEventListener("click", () => {
      localStorage.setItem(GUIDE_KEY, "yes");
      startGame(Boolean(savedGame));
    });

    document.querySelector("#mapButton").addEventListener("click", () => {
      openMap("start");
    });

    document.querySelector("#levelMapButton").addEventListener("click", () => {
      openMap("level");
    });

    document.querySelector("#closeMap").addEventListener("click", closeMap);
    document.querySelector("#backButton").addEventListener("click", closeMap);

    document.querySelector("#nextLevelButton").addEventListener("click", () => {
      levelScreen.classList.add("hidden");
      paused = false;
      lastTime = performance.now();
      saveGame();
    });

    document.querySelector("#restartButton").addEventListener("click", () => {
      startGame(false);
    });

    document.querySelector("#victoryRestart").addEventListener("click", () => {
      startGame(false);
    });

    soundButton.addEventListener("click", () => {
      muted = !muted;
      soundButton.textContent = muted ? "×" : "♪";

      if (muted) {
        stopMusic();
      } else if (running) {
        startMusic();
      }
    });

    addEventListener("pagehide", saveGame);
    addEventListener("beforeunload", saveGame);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        saveGame();
      }
    });

    setInterval(saveGame, 2000);

    highScoreEl.textContent = highScore;

    resize();
    prepareSavedGame();
    updateHud();
    drawGame(performance.now());

    if (!localStorage.getItem(GUIDE_KEY)) {
      guideScreen.classList.remove("hidden");
    }
  </script>
</body>
</html>
