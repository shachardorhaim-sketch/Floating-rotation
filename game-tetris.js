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
    const TDICT = {"he": {"score": "ניקוד", "lines": "שורות", "level": "רמה", "high": "שיא", "ready": "מוכן?", "press": "לחץ להתחיל", "start": "התחל משחק", "how": "📖 איך משחקים?", "tutTitle": "איך משחקים טטריס? 🎮", "tutClose": "הבנתי, בוא נשחק! ▶", "gameover": "המשחק נגמר", "final": "ניקוד סופי: ", "again": "שחק שוב", "paused": "מושהה", "pausedSub": "לחץ P או ⏸ כדי להמשיך", "next": "הבא בתור", "pauseBtn": "⏸ השהה / המשך", "secGoal": "<b style=\"color:#22d3ee;\">🎯 המטרה</b><br>קוביות בצורות שונות נופלות מלמעלה. סדר אותן כדי למלא <b>שורה שלמה</b> (כל 10 המשבצות) — והשורה נעלמת ומקבלים ניקוד! אם הערימה מגיעה לראש הלוח, המשחק נגמר.", "secCtrl": "<b style=\"color:#a855f7;\">🕹️ שליטה (מקלדת)</b><br><span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> להזיז &nbsp; <span class=\"tetris-kbd\">↑</span> לסובב<br><span class=\"tetris-kbd\">↓</span> נפילה איטית &nbsp; <span class=\"tetris-kbd\">רווח</span> להפיל מיד<br><span class=\"tetris-kbd\">P</span> השהיה", "secPhone": "<b style=\"color:#22c55e;\">📱 בטלפון</b><br>יש כפתורים מתחת ללוח. אפשר גם <b>להחזיק</b> ◀ ▶ ▼ כדי לזוז מהר.", "secLevels": "<b style=\"color:#fb923c;\">🚀 איך עוברים רמות?</b><br>כל פעם שאתה מנקה <b>10 שורות</b> אתה עולה רמה!<br>שורות 0–9 = רמה 1 &nbsp; שורות 10–19 = רמה 2 &nbsp; וכן הלאה...<br>בכל רמה הקוביות נופלות <b>יותר מהר</b> — וזה נהיה יותר מאתגר. יש עד <b>200 רמות</b>! 🔥", "secTips": "<b style=\"color:#facc15;\">💡 טיפים</b><br>• הצל השקוף מראה איפה הקובייה תנחת.<br>• כל 10 שורות עולים <b>שלב</b> — והקוביות נופלות מהר יותר!<br>• למלא <b>4 שורות בבת אחת</b> עם החלק הארוך = \"טֶטְרִיס\" 🏆 = הכי הרבה ניקוד!", "help": "<span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> תזוזה<br><span class=\"tetris-kbd\">↑</span> סיבוב<br><span class=\"tetris-kbd\">↓</span> נפילה איטית<br><span class=\"tetris-kbd\">רווח</span> הפלה<br><span class=\"tetris-kbd\">P</span> השהה"}, "en": {"score": "Score", "lines": "Lines", "level": "Level", "high": "Best", "ready": "Ready?", "press": "Press to start", "start": "Start game", "how": "📖 How to play?", "tutTitle": "How to play Tetris? 🎮", "tutClose": "Got it, let's play! ▶", "gameover": "Game Over", "final": "Final score: ", "again": "Play again", "paused": "Paused", "pausedSub": "Press P or ⏸ to resume", "next": "Next", "pauseBtn": "⏸ Pause / Resume", "secGoal": "<b style=\"color:#22d3ee;\">🎯 The goal</b><br>Blocks of different shapes fall from above. Arrange them to fill a <b>full row</b> (all 10 cells) — the row clears and you score! If the stack reaches the top, the game ends.", "secCtrl": "<b style=\"color:#a855f7;\">🕹️ Controls (keyboard)</b><br><span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> Move &nbsp; <span class=\"tetris-kbd\">↑</span> Rotate<br><span class=\"tetris-kbd\">↓</span> Soft drop &nbsp; <span class=\"tetris-kbd\">Space</span> Hard drop<br><span class=\"tetris-kbd\">P</span> Pause", "secPhone": "<b style=\"color:#22c55e;\">📱 On phone</b><br>There are buttons below the board. You can also <b>hold</b> ◀ ▶ ▼ to move fast.", "secLevels": "<b style=\"color:#fb923c;\">🚀 How do levels work?</b><br>Every time you clear <b>10 rows</b> you go up a level!<br>Rows 0–9 = level 1 &nbsp; rows 10–19 = level 2 &nbsp; and so on...<br>Each level the blocks fall <b>faster</b> — and it gets harder. There are up to <b>200 levels</b>! 🔥", "secTips": "<b style=\"color:#facc15;\">💡 Tips</b><br>• The transparent shadow shows where the block will land.<br>• Every 10 rows you go up a <b>level</b> — and blocks fall faster!<br>• Filling <b>4 rows at once</b> with the long piece = a \"Tetris\" 🏆 = the most points!", "help": "<span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> Move<br><span class=\"tetris-kbd\">↑</span> Rotate<br><span class=\"tetris-kbd\">↓</span> Soft drop<br><span class=\"tetris-kbd\">Space</span> Hard drop<br><span class=\"tetris-kbd\">P</span> Pause"}, "ar": {"score": "النقاط", "lines": "صفوف", "level": "المستوى", "high": "الأعلى", "ready": "جاهز؟", "press": "اضغط للبدء", "start": "ابدأ اللعبة", "how": "📖 كيف ألعب؟", "tutTitle": "كيف تلعب تتريس؟ 🎮", "tutClose": "فهمت، لنلعب! ▶", "gameover": "انتهت اللعبة", "final": "النتيجة النهائية: ", "again": "العب مجدداً", "paused": "متوقف", "pausedSub": "اضغط P أو ⏸ للمتابعة", "next": "التالي", "pauseBtn": "⏸ إيقاف / متابعة", "secGoal": "<b style=\"color:#22d3ee;\">🎯 الهدف</b><br>قطع بأشكال مختلفة تسقط من الأعلى. رتّبها لملء <b>صف كامل</b> (كل الخانات العشر) — يختفي الصف وتحصل على نقاط! إذا وصلت الكومة إلى الأعلى، تنتهي اللعبة.", "secCtrl": "<b style=\"color:#a855f7;\">🕹️ التحكم (لوحة المفاتيح)</b><br><span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> تحريك &nbsp; <span class=\"tetris-kbd\">↑</span> تدوير<br><span class=\"tetris-kbd\">↓</span> إسقاط بطيء &nbsp; <span class=\"tetris-kbd\">مسافة</span> إسقاط فوري<br><span class=\"tetris-kbd\">P</span> إيقاف", "secPhone": "<b style=\"color:#22c55e;\">📱 على الهاتف</b><br>توجد أزرار أسفل اللوح. يمكنك أيضاً <b>الضغط المطوّل</b> على ◀ ▶ ▼ للتحرك بسرعة.", "secLevels": "<b style=\"color:#fb923c;\">🚀 كيف تتقدّم المستويات؟</b><br>في كل مرة تمسح فيها <b>10 صفوف</b> ترتفع مستوى!<br>الصفوف 0–9 = المستوى 1 &nbsp; الصفوف 10–19 = المستوى 2 &nbsp; وهكذا...<br>في كل مستوى تسقط القطع <b>أسرع</b> — ويصبح أصعب. حتى <b>200 مستوى</b>! 🔥", "secTips": "<b style=\"color:#facc15;\">💡 نصائح</b><br>• الظل الشفاف يوضّح أين ستهبط القطعة.<br>• كل 10 صفوف ترتفع <b>مستوى</b> — وتسقط القطع أسرع!<br>• ملء <b>4 صفوف دفعة واحدة</b> بالقطعة الطويلة = \"تتريس\" 🏆 = أكبر عدد نقاط!", "help": "<span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> تحريك<br><span class=\"tetris-kbd\">↑</span> تدوير<br><span class=\"tetris-kbd\">↓</span> إسقاط بطيء<br><span class=\"tetris-kbd\">مسافة</span> إسقاط<br><span class=\"tetris-kbd\">P</span> إيقاف"}, "zh": {"score": "分数", "lines": "行数", "level": "等级", "high": "最高", "ready": "准备好了吗?", "press": "按下开始", "start": "开始游戏", "how": "📖 怎么玩?", "tutTitle": "怎么玩俄罗斯方块? 🎮", "tutClose": "明白了,开始吧! ▶", "gameover": "游戏结束", "final": "最终得分: ", "again": "再玩一次", "paused": "已暂停", "pausedSub": "按 P 或 ⏸ 继续", "next": "下一个", "pauseBtn": "⏸ 暂停 / 继续", "secGoal": "<b style=\"color:#22d3ee;\">🎯 目标</b><br>不同形状的方块从上方落下。把它们排满<b>一整行</b>(全部 10 格)——该行消除并得分!如果堆到顶部,游戏结束。", "secCtrl": "<b style=\"color:#a855f7;\">🕹️ 控制(键盘)</b><br><span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> 移动 &nbsp; <span class=\"tetris-kbd\">↑</span> 旋转<br><span class=\"tetris-kbd\">↓</span> 慢速下落 &nbsp; <span class=\"tetris-kbd\">空格</span> 直接落下<br><span class=\"tetris-kbd\">P</span> 暂停", "secPhone": "<b style=\"color:#22c55e;\">📱 手机上</b><br>棋盘下方有按钮。你也可以<b>长按</b> ◀ ▶ ▼ 来快速移动。", "secLevels": "<b style=\"color:#fb923c;\">🚀 如何升级?</b><br>每消除 <b>10 行</b> 就升一级!<br>0–9 行 = 1 级 &nbsp; 10–19 行 = 2 级 &nbsp; 以此类推……<br>每升一级方块下落<b>更快</b>——也更难。最多有 <b>200 级</b>! 🔥", "secTips": "<b style=\"color:#facc15;\">💡 提示</b><br>• 半透明的影子显示方块会落在哪里。<br>• 每 10 行升一<b>级</b>——方块下落更快!<br>• 用长条一次消除 <b>4 行</b> = “Tetris” 🏆 = 分数最高!", "help": "<span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> 移动<br><span class=\"tetris-kbd\">↑</span> 旋转<br><span class=\"tetris-kbd\">↓</span> 慢速下落<br><span class=\"tetris-kbd\">空格</span> 落下<br><span class=\"tetris-kbd\">P</span> 暂停"}, "es": {"score": "Puntos", "lines": "Líneas", "level": "Nivel", "high": "Récord", "ready": "¿Listo?", "press": "Pulsa para empezar", "start": "Empezar", "how": "📖 ¿Cómo se juega?", "tutTitle": "¿Cómo se juega al Tetris? 🎮", "tutClose": "¡Entendido, a jugar! ▶", "gameover": "Fin del juego", "final": "Puntuación final: ", "again": "Jugar otra vez", "paused": "En pausa", "pausedSub": "Pulsa P o ⏸ para seguir", "next": "Siguiente", "pauseBtn": "⏸ Pausa / Seguir", "secGoal": "<b style=\"color:#22d3ee;\">🎯 El objetivo</b><br>Caen bloques de distintas formas desde arriba. Ordénalos para llenar una <b>fila completa</b> (las 10 casillas): ¡la fila desaparece y sumas puntos! Si la pila llega arriba, el juego termina.", "secCtrl": "<b style=\"color:#a855f7;\">🕹️ Controles (teclado)</b><br><span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> Mover &nbsp; <span class=\"tetris-kbd\">↑</span> Girar<br><span class=\"tetris-kbd\">↓</span> Caída lenta &nbsp; <span class=\"tetris-kbd\">Espacio</span> Caída rápida<br><span class=\"tetris-kbd\">P</span> Pausa", "secPhone": "<b style=\"color:#22c55e;\">📱 En el móvil</b><br>Hay botones debajo del tablero. También puedes <b>mantener pulsado</b> ◀ ▶ ▼ para moverte rápido.", "secLevels": "<b style=\"color:#fb923c;\">🚀 ¿Cómo se sube de nivel?</b><br>¡Cada vez que eliminas <b>10 filas</b> subes de nivel!<br>Filas 0–9 = nivel 1 &nbsp; filas 10–19 = nivel 2 &nbsp; y así...<br>En cada nivel los bloques caen <b>más rápido</b> y es más difícil. ¡Hay hasta <b>200 niveles</b>! 🔥", "secTips": "<b style=\"color:#facc15;\">💡 Consejos</b><br>• La sombra transparente muestra dónde caerá el bloque.<br>• Cada 10 filas subes de <b>nivel</b>: ¡los bloques caen más rápido!<br>• Llenar <b>4 filas de una vez</b> con la pieza larga = un \"Tetris\" 🏆 = ¡la mayor puntuación!", "help": "<span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> Mover<br><span class=\"tetris-kbd\">↑</span> Girar<br><span class=\"tetris-kbd\">↓</span> Caída lenta<br><span class=\"tetris-kbd\">Espacio</span> Caída rápida<br><span class=\"tetris-kbd\">P</span> Pausa"}, "fr": {"score": "Score", "lines": "Lignes", "level": "Niveau", "high": "Record", "ready": "Prêt ?", "press": "Appuie pour commencer", "start": "Démarrer", "how": "📖 Comment jouer ?", "tutTitle": "Comment jouer au Tetris ? 🎮", "tutClose": "Compris, on joue ! ▶", "gameover": "Partie terminée", "final": "Score final : ", "again": "Rejouer", "paused": "En pause", "pausedSub": "Appuie sur P ou ⏸ pour reprendre", "next": "Suivant", "pauseBtn": "⏸ Pause / Reprendre", "secGoal": "<b style=\"color:#22d3ee;\">🎯 L'objectif</b><br>Des blocs de formes différentes tombent d'en haut. Range-les pour remplir une <b>ligne entière</b> (les 10 cases) — la ligne disparaît et tu marques ! Si la pile atteint le sommet, la partie se termine.", "secCtrl": "<b style=\"color:#a855f7;\">🕹️ Commandes (clavier)</b><br><span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> Déplacer &nbsp; <span class=\"tetris-kbd\">↑</span> Tourner<br><span class=\"tetris-kbd\">↓</span> Descente lente &nbsp; <span class=\"tetris-kbd\">Espace</span> Chute directe<br><span class=\"tetris-kbd\">P</span> Pause", "secPhone": "<b style=\"color:#22c55e;\">📱 Sur téléphone</b><br>Il y a des boutons sous le plateau. Tu peux aussi <b>maintenir</b> ◀ ▶ ▼ pour aller vite.", "secLevels": "<b style=\"color:#fb923c;\">🚀 Comment monter de niveau ?</b><br>Chaque fois que tu effaces <b>10 lignes</b>, tu montes de niveau !<br>Lignes 0–9 = niveau 1 &nbsp; lignes 10–19 = niveau 2 &nbsp; et ainsi de suite...<br>À chaque niveau les blocs tombent <b>plus vite</b> — et c'est plus dur. Jusqu'à <b>200 niveaux</b> ! 🔥", "secTips": "<b style=\"color:#facc15;\">💡 Astuces</b><br>• L'ombre transparente montre où la pièce va atterrir.<br>• Toutes les 10 lignes, tu montes d'un <b>niveau</b> — les pièces tombent plus vite !<br>• Remplir <b>4 lignes d'un coup</b> avec la barre = un \"Tetris\" 🏆 = le plus de points !", "help": "<span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> Déplacer<br><span class=\"tetris-kbd\">↑</span> Tourner<br><span class=\"tetris-kbd\">↓</span> Descente lente<br><span class=\"tetris-kbd\">Espace</span> Chute<br><span class=\"tetris-kbd\">P</span> Pause"}, "pt": {"score": "Pontos", "lines": "Linhas", "level": "Nível", "high": "Recorde", "ready": "Pronto?", "press": "Toque para começar", "start": "Começar", "how": "📖 Como jogar?", "tutTitle": "Como jogar Tetris? 🎮", "tutClose": "Entendi, vamos jogar! ▶", "gameover": "Fim de jogo", "final": "Pontuação final: ", "again": "Jogar de novo", "paused": "Pausado", "pausedSub": "Pressione P ou ⏸ para continuar", "next": "Próximo", "pauseBtn": "⏸ Pausar / Continuar", "secGoal": "<b style=\"color:#22d3ee;\">🎯 O objetivo</b><br>Blocos de formas diferentes caem de cima. Organize-os para preencher uma <b>linha inteira</b> (as 10 casas) — a linha some e você pontua! Se a pilha chegar ao topo, o jogo acaba.", "secCtrl": "<b style=\"color:#a855f7;\">🕹️ Controles (teclado)</b><br><span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> Mover &nbsp; <span class=\"tetris-kbd\">↑</span> Girar<br><span class=\"tetris-kbd\">↓</span> Queda lenta &nbsp; <span class=\"tetris-kbd\">Espaço</span> Queda rápida<br><span class=\"tetris-kbd\">P</span> Pausa", "secPhone": "<b style=\"color:#22c55e;\">📱 No celular</b><br>Há botões abaixo do tabuleiro. Você também pode <b>segurar</b> ◀ ▶ ▼ para mover rápido.", "secLevels": "<b style=\"color:#fb923c;\">🚀 Como subir de nível?</b><br>Cada vez que você limpa <b>10 linhas</b> sobe de nível!<br>Linhas 0–9 = nível 1 &nbsp; linhas 10–19 = nível 2 &nbsp; e assim por diante...<br>A cada nível os blocos caem <b>mais rápido</b> — e fica mais difícil. Há até <b>200 níveis</b>! 🔥", "secTips": "<b style=\"color:#facc15;\">💡 Dicas</b><br>• A sombra transparente mostra onde a peça vai cair.<br>• A cada 10 linhas você sobe de <b>nível</b> — e as peças caem mais rápido!<br>• Preencher <b>4 linhas de uma vez</b> com a peça longa = um \"Tetris\" 🏆 = a maior pontuação!", "help": "<span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> Mover<br><span class=\"tetris-kbd\">↑</span> Girar<br><span class=\"tetris-kbd\">↓</span> Queda lenta<br><span class=\"tetris-kbd\">Espaço</span> Queda<br><span class=\"tetris-kbd\">P</span> Pausa"}, "ru": {"score": "Очки", "lines": "Ряды", "level": "Уровень", "high": "Рекорд", "ready": "Готов?", "press": "Нажми, чтобы начать", "start": "Начать игру", "how": "📖 Как играть?", "tutTitle": "Как играть в Тетрис? 🎮", "tutClose": "Понятно, играем! ▶", "gameover": "Игра окончена", "final": "Итоговый счёт: ", "again": "Играть снова", "paused": "Пауза", "pausedSub": "Нажми P или ⏸, чтобы продолжить", "next": "Далее", "pauseBtn": "⏸ Пауза / Продолжить", "secGoal": "<b style=\"color:#22d3ee;\">🎯 Цель</b><br>Блоки разных форм падают сверху. Складывай их, чтобы заполнить <b>целый ряд</b> (все 10 клеток) — ряд исчезает, и ты получаешь очки! Если стопка достигнет верха, игра окончена.", "secCtrl": "<b style=\"color:#a855f7;\">🕹️ Управление (клавиатура)</b><br><span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> Двигать &nbsp; <span class=\"tetris-kbd\">↑</span> Вращать<br><span class=\"tetris-kbd\">↓</span> Медленно вниз &nbsp; <span class=\"tetris-kbd\">Пробел</span> Сбросить<br><span class=\"tetris-kbd\">P</span> Пауза", "secPhone": "<b style=\"color:#22c55e;\">📱 На телефоне</b><br>Под доской есть кнопки. Можно также <b>удерживать</b> ◀ ▶ ▼ для быстрого движения.", "secLevels": "<b style=\"color:#fb923c;\">🚀 Как повышать уровень?</b><br>Каждый раз, убирая <b>10 рядов</b>, ты повышаешь уровень!<br>Ряды 0–9 = уровень 1 &nbsp; ряды 10–19 = уровень 2 &nbsp; и так далее...<br>С каждым уровнем блоки падают <b>быстрее</b> — и становится сложнее. Всего до <b>200 уровней</b>! 🔥", "secTips": "<b style=\"color:#facc15;\">💡 Советы</b><br>• Прозрачная тень показывает, куда упадёт фигура.<br>• Каждые 10 рядов — новый <b>уровень</b>, и фигуры падают быстрее!<br>• Убрать <b>4 ряда сразу</b> длинной фигурой = «Тетрис» 🏆 = больше всего очков!", "help": "<span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> Двигать<br><span class=\"tetris-kbd\">↑</span> Вращать<br><span class=\"tetris-kbd\">↓</span> Медленно вниз<br><span class=\"tetris-kbd\">Пробел</span> Сброс<br><span class=\"tetris-kbd\">P</span> Пауза"}, "de": {"score": "Punkte", "lines": "Reihen", "level": "Level", "high": "Rekord", "ready": "Bereit?", "press": "Zum Start drücken", "start": "Spiel starten", "how": "📖 Wie spielt man?", "tutTitle": "Wie spielt man Tetris? 🎮", "tutClose": "Verstanden, los geht's! ▶", "gameover": "Spiel vorbei", "final": "Endstand: ", "again": "Nochmal spielen", "paused": "Pausiert", "pausedSub": "P oder ⏸ zum Fortsetzen", "next": "Nächstes", "pauseBtn": "⏸ Pause / Weiter", "secGoal": "<b style=\"color:#22d3ee;\">🎯 Das Ziel</b><br>Blöcke in verschiedenen Formen fallen von oben. Ordne sie, um eine <b>ganze Reihe</b> (alle 10 Felder) zu füllen — die Reihe verschwindet und du bekommst Punkte! Erreicht der Stapel den oberen Rand, ist das Spiel vorbei.", "secCtrl": "<b style=\"color:#a855f7;\">🕹️ Steuerung (Tastatur)</b><br><span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> Bewegen &nbsp; <span class=\"tetris-kbd\">↑</span> Drehen<br><span class=\"tetris-kbd\">↓</span> Langsam fallen &nbsp; <span class=\"tetris-kbd\">Leert.</span> Sofort fallen<br><span class=\"tetris-kbd\">P</span> Pause", "secPhone": "<b style=\"color:#22c55e;\">📱 Auf dem Handy</b><br>Unter dem Feld gibt es Tasten. Du kannst auch ◀ ▶ ▼ <b>gedrückt halten</b>, um schnell zu ziehen.", "secLevels": "<b style=\"color:#fb923c;\">🚀 Wie steigt man auf?</b><br>Jedes Mal, wenn du <b>10 Reihen</b> löschst, steigst du ein Level auf!<br>Reihen 0–9 = Level 1 &nbsp; Reihen 10–19 = Level 2 &nbsp; und so weiter...<br>Mit jedem Level fallen die Blöcke <b>schneller</b> — und es wird schwerer. Bis zu <b>200 Level</b>! 🔥", "secTips": "<b style=\"color:#facc15;\">💡 Tipps</b><br>• Der durchsichtige Schatten zeigt, wo der Block landet.<br>• Alle 10 Reihen steigst du ein <b>Level</b> auf — die Blöcke fallen schneller!<br>• <b>4 Reihen auf einmal</b> mit dem langen Stück füllen = ein \"Tetris\" 🏆 = die meisten Punkte!", "help": "<span class=\"tetris-kbd\">←</span> <span class=\"tetris-kbd\">→</span> Bewegen<br><span class=\"tetris-kbd\">↑</span> Drehen<br><span class=\"tetris-kbd\">↓</span> Langsam<br><span class=\"tetris-kbd\">Leert.</span> Fallen<br><span class=\"tetris-kbd\">P</span> Pause"}};
    let TLNG='he'; try{ var _pl=localStorage.getItem('flrot:lang'); if(_pl) TLNG=_pl; }catch(e){}
    if(!TDICT[TLNG]) TLNG='he';
    const TRTL = (TLNG==='he'||TLNG==='ar');
    const TT = k => (TDICT[TLNG] && TDICT[TLNG][k]) || TDICT['he'][k] || k;
    root.innerHTML = `
      <div class="tetris-wrap" style="direction:${TRTL?'rtl':'ltr'};">
        <div class="tetris-title">3D TETRIS</div>
        <div class="tetris-sub">by Shachar · Floating rotation</div>

        <div class="tetris-main">
          <div class="tetris-stats">
            <div class="tetris-card"><div class="tetris-label">${TT('score')}</div><div class="tetris-value" id="tetris-score">0</div></div>
            <div class="tetris-card"><div class="tetris-label">${TT('lines')}</div><div class="tetris-value" id="tetris-lines">0</div></div>
            <div class="tetris-card"><div class="tetris-label">${TT('level')}</div><div class="tetris-value" id="tetris-level">1</div></div>
            <div class="tetris-card"><div class="tetris-label">${TT('high')}</div><div class="tetris-value" id="tetris-high">0</div></div>
          </div>

          <div class="tetris-board-wrap" id="tetris-container" tabindex="0">
            <canvas id="tetris-game" width="320" height="640"></canvas>
            <div class="tetris-overlay" id="tetris-start">
              <div class="tetris-ov-title">${TT('ready')}</div>
              <div class="tetris-ov-sub">${TT('press')}</div>
              <button class="tetris-btn" id="tetris-start-btn">${TT('start')}</button>
              <button id="tetris-how-btn" style="margin-top:10px;background:transparent;border:1px solid rgba(255,255,255,0.28);color:#fff;padding:10px 24px;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;">${TT('how')}</button>
            </div>
            <div class="tetris-overlay" id="tetris-tutorial" style="display:none;justify-content:flex-start;align-items:stretch;overflow-y:auto;padding:0;background:#0b0b12;">
              <div style="padding:22px 20px;direction:${TRTL?'rtl':'ltr'};text-align:${TRTL?'right':'left'};">
                <div style="font-size:23px;font-weight:800;text-align:center;margin-bottom:14px;background:linear-gradient(90deg,#22d3ee,#a855f7,#ec4899);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">${TT('tutTitle')}</div>
                <div style="color:#fff;font-size:14.5px;line-height:1.75;">
                  ${TT('secGoal')}
                  <br><br>
                  ${TT('secCtrl')}
                  <br><br>
                  ${TT('secPhone')}
                  <br><br>
                  ${TT('secLevels')}
                  <br><br>
                  ${TT('secTips')}
                </div>
                <button class="tetris-btn" id="tetris-tut-close" style="margin-top:18px;width:100%;">${TT('tutClose')}</button>
              </div>
            </div>
            <div class="tetris-overlay" id="tetris-gameover" style="display:none;">
              <div class="tetris-ov-title">${TT('gameover')}</div>
              <div class="tetris-ov-sub" id="tetris-final">${TT('final')}0</div>
              <button class="tetris-btn" id="tetris-again-btn">${TT('again')}</button>
            </div>
            <div class="tetris-overlay" id="tetris-pause" style="display:none;">
              <div class="tetris-ov-title">${TT('paused')}</div>
              <div class="tetris-ov-sub">${TT('pausedSub')}</div>
            </div>
          </div>

          <div class="tetris-side">
            <div class="tetris-next">
              <div class="tetris-label">${TT('next')}</div>
              <canvas id="tetris-nextc" width="120" height="120"></canvas>
            </div>
            <div class="tetris-help">
              ${TT('help')}
            </div>
          </div>
        </div>

        <div class="tetris-touch">
          <button class="tetris-tbtn" id="tetris-t-left">◀</button>
          <button class="tetris-tbtn" id="tetris-t-rotate">🔄</button>
          <button class="tetris-tbtn" id="tetris-t-down">▼</button>
          <button class="tetris-tbtn" id="tetris-t-drop">⤓</button>
          <button class="tetris-tbtn" id="tetris-t-right">▶</button>
          <button class="tetris-tbtn wide" id="tetris-t-pause">${TT('pauseBtn')}</button>
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
        elFinal.textContent = TT('final') + score;
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
    // מדריך "איך משחקים"
    root.querySelector('#tetris-how-btn').onclick = () => { root.querySelector('#tetris-tutorial').style.display = 'flex'; };
    root.querySelector('#tetris-tut-close').onclick = () => { root.querySelector('#tetris-tutorial').style.display = 'none'; };
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
