// ============================================================
//  3D Tetris — מאת שחר · לפלטפורמת Floating rotation
//  קובץ עצמאי לגמרי: כל ה-CSS מוזרק מבפנים, אין צורך לגעת ב-style.css
// ============================================================

(function () {

  // ---------- CSS של המשחק (מוזרק פעם אחת) ----------
  const TETRIS_CSS = `
  .tetris-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 16px;
    color: #fff;
    font-family: 'Segoe UI', Tahoma, sans-serif;
  }
  .tetris-title {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 2px;
    margin-bottom: 2px;
    background: linear-gradient(90deg, #22d3ee, #a855f7, #ec4899);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .tetris-sub {
    color: rgba(255,255,255,0.5);
    font-size: 12px;
    margin-bottom: 16px;
  }
  .tetris-main {
    display: flex;
    gap: 18px;
    align-items: flex-start;
    justify-content: center;
    flex-wrap: wrap;
  }
  .tetris-stats, .tetris-side {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 120px;
  }
  .tetris-card {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 10px 14px;
  }
  .tetris-label {
    font-size: 10px;
    color: rgba(255,255,255,0.5);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 3px;
  }
  .tetris-value { font-size: 22px; font-weight: 600; }
  .tetris-board-wrap {
    position: relative;
    background: #0a0a0f;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 4px rgba(255,255,255,0.03);
    width: min(320px, 74vw);
    line-height: 0;
  }
  .tetris-board-wrap canvas { display: block; width: 100%; height: auto; }
  .tetris-overlay {
    position: absolute;
    inset: 0;
    background: rgba(10,10,15,0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    line-height: 1.4;
    text-align: center;
    padding: 12px;
  }
  .tetris-ov-title { font-size: 24px; font-weight: 600; margin-bottom: 6px; }
  .tetris-ov-sub { color: rgba(255,255,255,0.6); font-size: 14px; margin-bottom: 18px; }
  .tetris-btn {
    background: linear-gradient(90deg, #22d3ee, #a855f7);
    color: #fff; border: none;
    padding: 12px 30px; border-radius: 10px;
    cursor: pointer; font-size: 15px; font-weight: 600;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 4px 20px rgba(168,85,247,0.4);
  }
  .tetris-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 30px rgba(168,85,247,0.6); }
  .tetris-btn:active { transform: translateY(0); }
  .tetris-next, .tetris-help {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 10px;
  }
  .tetris-help { font-size: 12px; line-height: 1.9; color: rgba(255,255,255,0.7); }
  .tetris-kbd {
    background: rgba(255,255,255,0.1);
    padding: 2px 7px; border-radius: 4px;
    font-family: monospace; font-size: 11px; color: #fff;
    display: inline-block; min-width: 18px; text-align: center;
    border-bottom: 2px solid rgba(255,255,255,0.15);
  }
  .tetris-next canvas { display: block; width: 100%; height: auto; }

  /* ----- כפתורי מגע ----- */
  .tetris-touch {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    width: min(340px, 92vw);
    margin-top: 16px;
  }
  .tetris-tbtn {
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 12px;
    color: #fff;
    font-size: 22px;
    padding: 14px 0;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition: background 0.1s, transform 0.1s;
  }
  .tetris-tbtn:active { background: rgba(168,85,247,0.4); transform: scale(0.94); }
  .tetris-tbtn.wide { grid-column: span 5; font-size: 15px; font-weight: 600; padding: 12px 0; }
  `;

  function ensureCSS() {
    if (document.getElementById('tetris-styles')) return;
    const s = document.createElement('style');
    s.id = 'tetris-styles';
    s.textContent = TETRIS_CSS;
    document.head.appendChild(s);
  }

  // ---------- הצורות והצבעים ----------
  const PIECES = {
    I: { shape: [[1,1,1,1]], color: '#22d3ee' },
    O: { shape: [[1,1],[1,1]], color: '#facc15' },
    T: { shape: [[0,1,0],[1,1,1]], color: '#a855f7' },
    S: { shape: [[0,1,1],[1,1,0]], color: '#22c55e' },
    Z: { shape: [[1,1,0],[0,1,1]], color: '#ef4444' },
    L: { shape: [[0,0,1],[1,1,1]], color: '#f97316' },
    J: { shape: [[1,0,0],[1,1,1]], color: '#3b82f6' }
  };

  // ============================================================
  //  mountTetris — נקרא על ידי הפלטפורמה כשפותחים את המשחק
  // ============================================================
  window.mountTetris = function (root) {
    ensureCSS();

    const COLS = 10, ROWS = 20, BLOCK = 30, DEPTH = 6;
    const OFFSET_X = 10, OFFSET_Y = 10;

    // ---- מבנה המסך ----
    root.innerHTML = `
      <div class="tetris-wrap">
        <div class="tetris-title">3D TETRIS</div>
        <div class="tetris-sub">by Shachar · Floating rotation</div>

        <div class="tetris-main">
          <div class="tetris-stats">
            <div class="tetris-card"><div class="tetris-label">ניקוד</div><div class="tetris-value" id="tetris-score">0</div></div>
            <div class="tetris-card"><div class="tetris-label">שורות</div><div class="tetris-value" id="tetris-lines">0</div></div>
            <div class="tetris-card"><div class="tetris-label">רמה</div><div class="tetris-value" id="tetris-level">1</div></div>
            <div class="tetris-card"><div class="tetris-label">שיא</div><div class="tetris-value" id="tetris-high">0</div></div>
          </div>

          <div class="tetris-board-wrap" id="tetris-container" tabindex="0">
            <canvas id="tetris-game" width="320" height="640"></canvas>
            <div class="tetris-overlay" id="tetris-start">
              <div class="tetris-ov-title">מוכן?</div>
              <div class="tetris-ov-sub">לחץ להתחיל</div>
              <button class="tetris-btn" id="tetris-start-btn">התחל משחק</button>
            </div>
            <div class="tetris-overlay" id="tetris-gameover" style="display:none;">
              <div class="tetris-ov-title">Game Over</div>
              <div class="tetris-ov-sub" id="tetris-final">ניקוד סופי: 0</div>
              <button class="tetris-btn" id="tetris-again-btn">שחק שוב</button>
            </div>
            <div class="tetris-overlay" id="tetris-pause" style="display:none;">
              <div class="tetris-ov-title">מושהה</div>
              <div class="tetris-ov-sub">לחץ P או ⏸ כדי להמשיך</div>
            </div>
          </div>

          <div class="tetris-side">
            <div class="tetris-next">
              <div class="tetris-label">הבא בתור</div>
              <canvas id="tetris-nextc" width="120" height="120"></canvas>
            </div>
            <div class="tetris-help">
              <span class="tetris-kbd">←</span> <span class="tetris-kbd">→</span> תזוזה<br>
              <span class="tetris-kbd">↑</span> סיבוב<br>
              <span class="tetris-kbd">↓</span> נפילה איטית<br>
              <span class="tetris-kbd">רווח</span> הפלה<br>
              <span class="tetris-kbd">P</span> השהה
            </div>
          </div>
        </div>

        <!-- כפתורי מגע לטלפון/טאבלט -->
        <div class="tetris-touch">
          <button class="tetris-tbtn" id="tetris-t-left">◀</button>
          <button class="tetris-tbtn" id="tetris-t-rotate">🔄</button>
          <button class="tetris-tbtn" id="tetris-t-down">▼</button>
          <button class="tetris-tbtn" id="tetris-t-drop">⤓</button>
          <button class="tetris-tbtn" id="tetris-t-right">▶</button>
          <button class="tetris-tbtn wide" id="tetris-t-pause">⏸ השהה / המשך</button>
        </div>
      </div>
    `;

    // ---- אלמנטים ----
    const canvas    = root.querySelector('#tetris-game');
    const ctx       = canvas.getContext('2d');
    const nextCanvas= root.querySelector('#tetris-nextc');
    const nextCtx   = nextCanvas.getContext('2d');
    const container = root.querySelector('#tetris-container');
    const startOverlay = root.querySelector('#tetris-start');
    const gameOverEl   = root.querySelector('#tetris-gameover');
    const pauseOverlay = root.querySelector('#tetris-pause');
    const elScore = root.querySelector('#tetris-score');
    const elLines = root.querySelector('#tetris-lines');
    const elLevel = root.querySelector('#tetris-level');
    const elHigh  = root.querySelector('#tetris-high');
    const elFinal = root.querySelector('#tetris-final');

    // ---- מצב המשחק ----
    let board, currentPiece, currentColor, currentX, currentY, nextType;
    let dropTime, dropInterval, score, lines, level;
    let gameOver, started, paused;
    let rafId = null;           // כדי לעצור את הלולאה ב-cleanup
    let alive = true;           // דגל: המשחק עדיין מותקן?
    let lastTime = 0;
    let bag = [];               // שק 7 חלקים (אקראיות הוגנת)
    let lockTimer = 0;          // טיימר השהיית נעילה
    const LOCK_DELAY = 500;     // מ"ש עד שחלק ננעל אחרי שנוגע בקרקע
    const holdStops = [];       // עצירת טיימרים של כפתורי מגע

    let highScore = parseInt(localStorage.getItem('tetris3d_high') || '0');
    elHigh.textContent = highScore;

    // ---- אתחול ----
    function init() {
      board = Array(ROWS).fill().map(() => Array(COLS).fill(null));
      dropTime = 0; dropInterval = 800;
      score = 0; lines = 0; level = 1;
      gameOver = false; paused = false;
      bag = []; lockTimer = 0;   // אתחול שק החלקים והנעילה
      nextType = pickPiece();
      updateStats();
    }
    // בחירת חלק לפי "שק 7" — כל 7 החלקים בסדר אקראי לפני שחוזרים (הוגן)
    function pickPiece() {
      if (bag.length === 0) {
        bag = Object.keys(PIECES);
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      return bag.pop();
    }
    function spawn() {
      const type = nextType;
      nextType = pickPiece();
      currentPiece = PIECES[type].shape.map(r => r.slice());
      currentColor = PIECES[type].color;
      currentX = Math.floor(COLS / 2) - Math.floor(currentPiece[0].length / 2);
      currentY = 0;
      lockTimer = 0;   // חלק חדש — מאפסים את טיימר הנעילה
      drawNext();
      if (collides(0, 0, currentPiece)) {
        gameOver = true;
        if (score > highScore) {
          highScore = score;
          localStorage.setItem('tetris3d_high', highScore);
          elHigh.textContent = highScore;
        }
        elFinal.textContent = 'ניקוד סופי: ' + score;
        gameOverEl.style.display = 'flex';
      }
    }
    function collides(dx, dy, piece) {
      for (let y = 0; y < piece.length; y++) {
        for (let x = 0; x < piece[y].length; x++) {
          if (piece[y][x]) {
            const nx = currentX + x + dx;
            const ny = currentY + y + dy;
            if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
            if (ny >= 0 && board[ny][nx]) return true;
          }
        }
      }
      return false;
    }
    function merge() {
      for (let y = 0; y < currentPiece.length; y++) {
        for (let x = 0; x < currentPiece[y].length; x++) {
          if (currentPiece[y][x] && currentY + y >= 0) {
            board[currentY + y][currentX + x] = currentColor;
          }
        }
      }
    }
    function clearLines() {
      let cleared = 0;
      for (let y = ROWS - 1; y >= 0; y--) {
        if (board[y].every(c => c)) {
          board.splice(y, 1);
          board.unshift(Array(COLS).fill(null));
          cleared++;
          y++;
        }
      }
      if (cleared) {
        lines += cleared;
        score += [0, 100, 300, 500, 800][cleared] * level;
        level = Math.min(200, Math.floor(lines / 10) + 1);   // עד 200 שלבים (כל 10 שורות)
        dropInterval = levelSpeed(level);                    // כל שלב = מהיר יותר
        updateStats();
      }
    }
    // מהירות הנפילה לפי שלב — הדרגתית, מגיעה למהירה מאוד ברמות גבוהות (סגנון קלאסי)
    function levelSpeed(lv) {
      return Math.max(40, Math.round(800 * Math.pow(0.95, lv - 1)));
    }
    function updateStats() {
      elScore.textContent = score;
      elLines.textContent = lines;
      elLevel.textContent = level;
    }
    function rotate(piece) {
      const rows = piece.length, cols = piece[0].length;
      const rotated = Array(cols).fill().map(() => Array(rows).fill(0));
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++)
          rotated[x][rows - 1 - y] = piece[y][x];
      return rotated;
    }

    // ---- ציור בלוק תלת-ממדי ----
    function shadeColor(hex, percent) {
      const r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
      const f = percent / 100;
      if (f < 0) {
        const dr = Math.max(0, Math.round(r * (1 + f))) | 0;
        const dg = Math.max(0, Math.round(g * (1 + f))) | 0;
        const db = Math.max(0, Math.round(b * (1 + f))) | 0;
        return 'rgb(' + dr + ',' + dg + ',' + db + ')';
      }
      const nr = Math.min(255, Math.round(r + (255 - r) * f)) | 0;
      const ng = Math.min(255, Math.round(g + (255 - g) * f)) | 0;
      const nb = Math.min(255, Math.round(b + (255 - b) * f)) | 0;
      return 'rgb(' + nr + ',' + ng + ',' + nb + ')';
    }
    function drawBlock(ctxRef, px, py, color, size, depth) {
      ctxRef.fillStyle = color;
      ctxRef.fillRect(px, py, size, size);
      ctxRef.fillStyle = shadeColor(color, -40);
      ctxRef.beginPath();
      ctxRef.moveTo(px + size, py);
      ctxRef.lineTo(px + size + depth, py + depth);
      ctxRef.lineTo(px + size + depth, py + size + depth);
      ctxRef.lineTo(px + size, py + size);
      ctxRef.closePath(); ctxRef.fill();
      ctxRef.fillStyle = shadeColor(color, -55);
      ctxRef.beginPath();
      ctxRef.moveTo(px, py + size);
      ctxRef.lineTo(px + size, py + size);
      ctxRef.lineTo(px + size + depth, py + size + depth);
      ctxRef.lineTo(px + depth, py + size + depth);
      ctxRef.closePath(); ctxRef.fill();
      ctxRef.fillStyle = shadeColor(color, 45);
      ctxRef.fillRect(px + 2, py + 2, size - 4, 3);
      ctxRef.strokeStyle = 'rgba(0,0,0,0.35)';
      ctxRef.lineWidth = 1;
      ctxRef.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
    }
    function drawNext() {
      nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
      const piece = PIECES[nextType], shape = piece.shape;
      const size = 22, depth = 4;
      const w = shape[0].length * size, h = shape.length * size;
      const startX = (nextCanvas.width - w - depth) / 2;
      const startY = (nextCanvas.height - h - depth) / 2;
      for (let y = 0; y < shape.length; y++)
        for (let x = 0; x < shape[y].length; x++)
          if (shape[y][x]) drawBlock(nextCtx, startX + x * size, startY + y * size, piece.color, size, depth);
    }
    function draw() {
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(OFFSET_X + x * BLOCK, OFFSET_Y);
        ctx.lineTo(OFFSET_X + x * BLOCK, OFFSET_Y + ROWS * BLOCK);
        ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(OFFSET_X, OFFSET_Y + y * BLOCK);
        ctx.lineTo(OFFSET_X + COLS * BLOCK, OFFSET_Y + y * BLOCK);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.strokeRect(OFFSET_X, OFFSET_Y, COLS * BLOCK, ROWS * BLOCK);
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++)
          if (board[y][x]) drawBlock(ctx, OFFSET_X + x * BLOCK, OFFSET_Y + y * BLOCK, board[y][x], BLOCK, DEPTH);
      if (currentPiece && !gameOver && started) {
        // צל (ghost)
        let ghostDy = 0;
        while (!collides(0, ghostDy + 1, currentPiece)) ghostDy++;
        for (let y = 0; y < currentPiece.length; y++)
          for (let x = 0; x < currentPiece[y].length; x++)
            if (currentPiece[y][x] && currentY + y + ghostDy >= 0) {
              const px = OFFSET_X + (currentX + x) * BLOCK;
              const py = OFFSET_Y + (currentY + y + ghostDy) * BLOCK;
              ctx.strokeStyle = currentColor;
              ctx.globalAlpha = 0.3; ctx.lineWidth = 1.5;
              ctx.strokeRect(px + 2, py + 2, BLOCK - 4, BLOCK - 4);
              ctx.globalAlpha = 1;
            }
        // החלק הנופל
        for (let y = 0; y < currentPiece.length; y++)
          for (let x = 0; x < currentPiece[y].length; x++)
            if (currentPiece[y][x] && currentY + y >= 0)
              drawBlock(ctx, OFFSET_X + (currentX + x) * BLOCK, OFFSET_Y + (currentY + y) * BLOCK, currentColor, BLOCK, DEPTH);
      }
    }

    // ---- לולאת המשחק ----
    function loop(time) {
      if (!alive) return;               // המשחק נסגר — עצור לגמרי
      if (!started) { draw(); return; }
      if (gameOver) { draw(); return; }
      if (paused) { rafId = requestAnimationFrame(loop); return; }
      if (!lastTime) lastTime = time;
      const dt = time - lastTime;
      lastTime = time;
      dropTime += dt;
      if (dropTime > dropInterval) {
        dropTime = 0;
        if (!collides(0, 1, currentPiece)) currentY++;
      }
      // השהיית נעילה: חלק שנוגע בקרקע ננעל רק אחרי חלון קצר (מאפשר תיקון ברגע האחרון)
      if (collides(0, 1, currentPiece)) {
        lockTimer += dt;
        if (lockTimer >= LOCK_DELAY) { lockTimer = 0; merge(); clearLines(); spawn(); }
      } else {
        lockTimer = 0;
      }
      draw();
      rafId = requestAnimationFrame(loop);
    }

    // ---- פעולות (משותפות למקלדת ולכפתורי מגע) ----
    function moveLeft()  { if (canPlay() && !collides(-1, 0, currentPiece)) { currentX--; lockTimer = 0; draw(); } }
    function moveRight() { if (canPlay() && !collides( 1, 0, currentPiece)) { currentX++; lockTimer = 0; draw(); } }
    function softDrop()  { if (canPlay() && !collides(0, 1, currentPiece)) { currentY++; dropTime = 0; draw(); } }  // בלי ניקוד — רק מזיז למטה
    function rotatePiece() {
      if (!canPlay()) return;
      const rotated = rotate(currentPiece);
      const saved = currentPiece, savedX = currentX, savedY = currentY;
      currentPiece = rotated;
      // "בעיטת קיר" — אם הסיבוב מתנגש, מנסים להזיז את החלק קצת כדי שיצליח
      const kicks = [[0,0],[1,0],[-1,0],[2,0],[-2,0],[0,-1],[1,-1],[-1,-1]];
      let ok = false;
      for (const [kx, ky] of kicks) {
        if (!collides(kx, ky, rotated)) { currentX += kx; currentY += ky; ok = true; break; }
      }
      if (!ok) { currentPiece = saved; currentX = savedX; currentY = savedY; }
      else { lockTimer = 0; }
      draw();
    }
    function hardDrop() {
      if (!canPlay()) return;
      let d = 0;
      while (!collides(0, 1, currentPiece)) { currentY++; d++; }
      score += d * 2;
      updateStats();
      merge(); clearLines(); spawn();
      draw();
    }
    function togglePause() {
      if (!started || gameOver) return;
      paused = !paused;
      pauseOverlay.style.display = paused ? 'flex' : 'none';
      if (!paused) { lastTime = 0; rafId = requestAnimationFrame(loop); }
    }
    function canPlay() { return alive && started && !gameOver && !paused; }

    // ---- מקלדת ----
    function onKey(e) {
      if (!started) return;
      if (e.key === 'p' || e.key === 'P') { if (!e.repeat) togglePause(); e.preventDefault(); return; }
      if (gameOver || paused) return;
      let handled = true;
      if (e.key === 'ArrowLeft') moveLeft();
      else if (e.key === 'ArrowRight') moveRight();
      else if (e.key === 'ArrowDown') softDrop();
      else if (e.key === 'ArrowUp') { if (!e.repeat) rotatePiece(); }   // סיבוב פעם אחת ללחיצה
      else if (e.key === ' ') { if (!e.repeat) hardDrop(); }            // הפלה פעם אחת ללחיצה
      else handled = false;
      if (handled) e.preventDefault();
    }
    document.addEventListener('keydown', onKey);

    // ---- כפתורי מגע (עם תמיכה בהחזקה למהלכים חוזרים) ----
    function holdBtn(id, fn, repeat) {
      const b = root.querySelector(id);
      let delayT = null, repT = null;
      const stop = () => { clearTimeout(delayT); clearInterval(repT); delayT = repT = null; };
      holdStops.push(stop);
      const start = (e) => {
        e.preventDefault();
        fn(); container.focus();
        if (repeat) { delayT = setTimeout(() => { repT = setInterval(fn, 55); }, 170); }
      };
      b.addEventListener('pointerdown', start);
      b.addEventListener('pointerup', stop);
      b.addEventListener('pointerleave', stop);
      b.addEventListener('pointercancel', stop);
    }
    holdBtn('#tetris-t-left',   moveLeft,    true);   // החזקה = תזוזה חוזרת
    holdBtn('#tetris-t-right',  moveRight,   true);
    holdBtn('#tetris-t-down',   softDrop,    true);   // החזקה = נפילה מהירה
    holdBtn('#tetris-t-rotate', rotatePiece, false);  // לחיצה בודדת
    holdBtn('#tetris-t-drop',   hardDrop,    false);
    holdBtn('#tetris-t-pause',  togglePause, false);

    // ---- התחלה / שחק שוב ----
    function startGame() {
      if (started) return;
      started = true;
      startOverlay.style.display = 'none';
      init(); spawn();
      lastTime = 0;
      container.focus();
      rafId = requestAnimationFrame(loop);
    }
    function resetGame() {
      gameOverEl.style.display = 'none';
      init(); spawn();
      lastTime = 0;
      started = true;
      container.focus();
      rafId = requestAnimationFrame(loop);
    }
    root.querySelector('#tetris-start-btn').onclick = startGame;
    root.querySelector('#tetris-again-btn').onclick = resetGame;
    container.addEventListener('click', () => container.focus());

    // ציור ראשוני (מסך "מוכן?")
    started = false; gameOver = false;
    init();
    draw();

    // ============================================================
    //  cleanup — נקרא על ידי הפלטפורמה כשחוזרים לחנות
    //  חשוב מאוד: מנתק את המקלדת ועוצר את הלולאה!
    // ============================================================
    return function cleanup() {
      alive = false;
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', onKey);
      holdStops.forEach(s => s());   // עצירת טיימרים של כפתורי מגע
      root.innerHTML = '';
    };
  };
})();
