// ============================================================
//  משחק: CHESS PRESTIGE
//  נבנה על ידי רובין שמואלי · הותאם לפלטפורמה
//  נגד המחשב (3 רמות) · שני שחקנים · 9 שיעורים · 16 עיצובים
// ============================================================

function mountChess(root) {

  // ---------- HTML ----------
  root.innerHTML = `
<div class="chessRoot">
  <section id="ch-lobby" class="ch-lobby">
    <div class="ch-lobby-shell">
      <div class="ch-lobby-brand"><span class="ch-brand-mark">♞</span> CHESS</div>
      <button class="ch-settings-open ch-lobby-settings" aria-label="הגדרות">⚙ <span>הגדרות</span></button>
      <div class="ch-lobby-copy"><p class="ch-eyebrow">ברוכים הבאים</p><h2>איך משחקים<br><em>היום?</em></h2><p>בחרו יריב, הכינו את הכלים — וצאו לדרך.</p></div>
      <div class="ch-mode-cards">
        <button class="ch-mode-card ch-continue-card ch-hidden" id="ch-continue-game"><span class="ch-mode-icon">↻</span><span><strong>המשך משחק</strong><small id="ch-continue-label">חזרה למשחק השמור</small></span><b>←</b></button>
        <button class="ch-mode-card" id="ch-computer-mode"><span class="ch-mode-icon">♟</span><span><strong>נגד המחשב</strong><small>בחרו רמה ושחקו מיד</small></span><b>←</b></button>
        <button class="ch-mode-card" id="ch-local-mode"><span class="ch-mode-icon">♙</span><span><strong>שני שחקנים</strong><small>שחקו יחד על אותו מסך</small></span><b>←</b></button>
        <button class="ch-mode-card ch-learn-card" id="ch-learn-mode"><span class="ch-mode-icon">?</span><span><strong>איך משחקים שחמט</strong><small>למדו בעזרת לוח הדגמה</small></span><b>←</b></button>
      </div>
      <div id="ch-computer-panel" class="ch-setup-panel ch-hidden"><button class="ch-back" style="background:#e0975a;color:#1a1a1a;padding:9px 18px;border-radius:8px;font-weight:800;font-size:14px;">↩ לתפריט</button><h3>בחרו רמת קושי</h3><div class="ch-levels" style="grid-template-columns:repeat(2,1fr);"><button data-level="easy">קל</button><button data-level="medium">בינוני</button><button data-level="hard">קשה</button><button data-level="master">בלתי אפשרי</button></div></div>
      <div id="ch-learn-panel" class="ch-setup-panel ch-tutorial-panel ch-hidden"><div class="ch-lesson-chapter" id="ch-lesson-chapter"></div><div class="ch-lesson-count" id="ch-lesson-count"></div><div class="ch-lesson-progress"><span id="ch-lesson-bar"></span></div><h3 id="ch-lesson-title"></h3><p id="ch-lesson-text"></p><div id="ch-tutorial-board" class="ch-tutorial-board"></div><div class="ch-lesson-controls"><button id="ch-lesson-menu" class="ch-secondary" style="background:#e0975a;color:#1a1a1a;font-weight:800;">↩ לתפריט</button><button id="ch-lesson-prev" class="ch-secondary">הקודם</button><button id="ch-lesson-next" class="ch-primary">הבא</button></div></div>
      <div id="ch-two-panel" class="ch-setup-panel ch-hidden"><button class="ch-back" style="background:#e0975a;color:#1a1a1a;padding:9px 18px;border-radius:8px;font-weight:800;font-size:14px;">↩ לתפריט</button><h3>שני שחקנים</h3><div style="display:grid;grid-template-columns:1fr;gap:10px;"><button id="ch-two-local" class="ch-net-btn" style="background:#30342f;color:#fff;padding:18px 10px;border:1px solid transparent;border-radius:6px;font-size:16px;cursor:pointer;">👥 על מכשיר אחד</button><button id="ch-two-remote" class="ch-net-btn" style="background:#30342f;color:#fff;padding:18px 10px;border:1px solid transparent;border-radius:6px;font-size:16px;cursor:pointer;">🌐 מרחוק (עם קוד)</button></div></div>
      <div id="ch-remote-panel" class="ch-setup-panel ch-hidden"><button class="ch-back" style="background:#e0975a;color:#1a1a1a;padding:9px 18px;border-radius:8px;font-weight:800;font-size:14px;">↩ לתפריט</button><h3>משחק מרחוק</h3><div style="display:grid;grid-template-columns:1fr;gap:10px;"><button id="ch-create-room" class="ch-net-btn" style="background:#30342f;color:#fff;padding:18px 10px;border:1px solid transparent;border-radius:6px;font-size:16px;cursor:pointer;">➕ צור חדר חדש</button><div style="display:flex;gap:8px;"><input id="ch-join-code" placeholder="הקלד קוד" maxlength="8" style="flex:1;padding:14px;background:#30342f;border:1px solid #444;color:#fff;border-radius:6px;text-transform:uppercase;font-size:18px;text-align:center;letter-spacing:3px;"><button id="ch-join-room" class="ch-net-btn" style="white-space:nowrap;background:#30342f;color:#fff;padding:14px;border:1px solid transparent;border-radius:6px;font-size:16px;cursor:pointer;">הצטרף ←</button></div></div><div id="ch-remote-code" style="margin-top:14px;font-size:30px;font-weight:800;letter-spacing:6px;color:#fff;text-align:center;"></div><div id="ch-remote-status" style="margin-top:10px;color:#e0975a;font-size:15px;min-height:22px;text-align:center;line-height:1.5;"></div></div>
    </div>
  </section>

  <main class="ch-app ch-hidden">
    <section class="ch-hero">
      <div class="ch-brand"><span class="ch-brand-mark">♞</span><span>CHESS</span></div>
      <div class="ch-hero-copy">
        <p id="ch-mode-label" class="ch-eyebrow">משחק מקומי · שני שחקנים</p>
        <h1>המהלך<br><em>שלך.</em></h1>
        <p class="ch-intro">שחמט נקי, רגוע ובלי הסחות דעת.<br>פשוט לבחור כלי ולהתחיל לחשוב.</p>
      </div>
      <div class="ch-controls">
        <button class="ch-secondary ch-settings-open" aria-label="הגדרות">⚙</button>
        <button id="ch-new-game" class="ch-primary">לתפריט <span>↗</span></button>
        <button id="ch-undo" class="ch-secondary">↶&nbsp;&nbsp;בטל</button>
      </div>
    </section>

    <section class="ch-game-area">
      <div class="ch-player ch-player-black">
        <div class="ch-avatar">♟</div>
        <div><strong>שחור</strong><span id="ch-black-captures" class="ch-captures"></span></div>
        <span id="ch-black-turn" class="ch-turn-dot"></span>
      </div>
      <div class="ch-board-wrap">
        <div id="ch-board" class="ch-board" role="grid" aria-label="לוח שחמט"></div>
      </div>
      <div class="ch-player ch-player-white">
        <div class="ch-avatar ch-light">♙</div>
        <div><strong>לבן</strong><span id="ch-white-captures" class="ch-captures"></span></div>
        <span id="ch-white-turn" class="ch-turn-dot ch-on"></span>
      </div>
      <div class="ch-status-row">
        <span id="ch-status">תור הלבן</span>
        <span id="ch-move-count">מהלך 1</span>
      </div>
    </section>
  </main>

  <div id="ch-promotion" class="ch-modal ch-hidden" role="dialog" aria-modal="true">
    <div class="ch-modal-card"><p>בחר כלי להכתרה</p><div id="ch-promotion-options"></div></div>
  </div>

  <div id="ch-settings" class="ch-modal ch-hidden" role="dialog" aria-modal="true">
    <div class="ch-modal-card ch-settings-card">
      <button id="ch-close-settings" class="ch-modal-close" aria-label="סגור">×</button>
      <p class="ch-eyebrow">התאמה אישית</p><h3 id="ch-settings-title">הגדרות עיצוב</h3>
      <label>סגנון הכלים</label>
      <div class="ch-style-options" id="ch-piece-styles"><button data-style="carved"><span>♞ ♙</span><strong>מגולף</strong></button><button data-style="pixel"><span class="ch-pixel-preview">♞ ♙</span><strong>8־ביט</strong></button><button data-style="neon"><span class="ch-neon-preview">♞ ♙</span><strong>ניאון</strong></button><button data-style="gold"><span>♞ ♙</span><strong>מלכותי</strong></button><button data-style="ice"><span>♞ ♙</span><strong>קרח</strong></button><button data-style="candy"><span>♞ ♙</span><strong>סוכריות</strong></button><button data-style="paper"><span>♞ ♙</span><strong>נייר</strong></button><button data-style="shadow"><span>♞ ♙</span><strong>צללים</strong></button></div>
      <label>סגנון הלוח</label>
      <div class="ch-style-options" id="ch-board-styles"><button data-style="wood"><i class="ch-swatch ch-w-wood"></i><strong>עץ טבעי</strong></button><button data-style="green"><i class="ch-swatch ch-w-green"></i><strong>מועדון</strong></button><button data-style="slate"><i class="ch-swatch ch-w-slate"></i><strong>לילה</strong></button><button data-style="marble"><i class="ch-swatch ch-w-marble"></i><strong>שיש</strong></button><button data-style="ocean"><i class="ch-swatch ch-w-ocean"></i><strong>אוקיינוס</strong></button><button data-style="candy"><i class="ch-swatch ch-w-candy"></i><strong>ממתקים</strong></button><button data-style="desert"><i class="ch-swatch ch-w-desert"></i><strong>מדבר</strong></button><button data-style="mono"><i class="ch-swatch ch-w-mono"></i><strong>מונוכרום</strong></button></div>
      <label id="ch-language-label">שפה</label>
      <div class="ch-language-options" id="ch-language-options"><button data-lang="he">עברית</button><button data-lang="en">English</button></div>
    </div>
  </div>
</div>`;

  const $ = s => root.querySelector(s);
  const $$ = s => root.querySelectorAll(s);
  const shell = root.querySelector('.chessRoot');

  // עיצוב: היפוך הלוח לשחקן השחור (במשחק מרחוק) — הכלים שלו למטה, כמו ב-Chess.com
  if(!document.getElementById('ch-flip-style')){
    const st=document.createElement('style'); st.id='ch-flip-style';
    st.textContent='#ch-board{transition:transform 0.35s ease;}#ch-board.ch-flip{transform:rotate(180deg);}#ch-board.ch-flip .ch-piece,#ch-board.ch-flip .ch-coord{transform:rotate(180deg);}.ch-lesson-chapter{color:#e0975a;font-weight:800;font-size:13px;letter-spacing:0.4px;margin-bottom:3px;}.ch-lesson-progress{height:7px;background:rgba(255,255,255,0.12);border-radius:6px;overflow:hidden;margin:8px 0 6px;}#ch-lesson-bar{display:block;height:100%;width:0;background:linear-gradient(90deg,#e0975a,#f5c26b);border-radius:6px;transition:width 0.35s ease;}';
    document.head.appendChild(st);
  }

  // ---------- נתונים ----------
  const GLYPHS={w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}};
  const VALUES={p:1,n:3,b:3,r:5,q:9,k:0};
  let state, selected=null, legal=[], history=[], pendingPromotion=null;
  let mode='local', level='easy', thinking=false;
  let myColor='w';                 // הצבע שלי במשחק מרחוק
  let net={peer:null,conn:null};   // חיבור PeerJS למשחק מרחוק
  let currentLang='he';
  let lessonIndex=0;
  let tutorialSelected=false, tutorialPieces=null, tutorialDone=false, tutorialFeedback='';
  let audioCtx=null;
  let alive=true;

  const CHAPTERS=[{he:'הכלים',en:'The Pieces',icon:'♟'},{he:'חוקי המשחק',en:'The Rules',icon:'📜'},{he:'הפתיחה',en:'The Opening',icon:'🚀'},{he:'טקטיקות',en:'Tactics',icon:'⚡'},{he:'מטים',en:'Checkmates',icon:'👑'},{he:'סיומים',en:'Endgames',icon:'🏁'},{he:'טיפים וסיכום',en:'Tips & Finish',icon:'🎓'}];
  const LESSONS=[
   {ch:0,he:['המלך — הכלי הכי חשוב','המלך זז משבצת אחת בלבד לכל כיוון: קדימה, אחורה, לצדדים ובאלכסון. אסור לאבד אותו לעולם — כל המשחק סובב סביב ההגנה עליו. כשמאיימים עליו הוא ב"שח", ואם אין דרך להציל אותו — זה "מט" והמשחק נגמר.'],en:['The king — the most important piece','The king moves one square in any direction. You can never lose it — the whole game is about protecting it. When it is attacked it is in check, and if it cannot be saved it is checkmate.'],pieces:[[7,4,'w','k'],[0,4,'b','k']],hints:[[6,3],[6,4],[6,5],[7,3],[7,5]],focus:[[7,4]]},
   {ch:0,he:['החייל — קטן אבל חשוב','החייל מתקדם משבצת אחת קדימה בלבד, ולעולם לא אחורה. אבל במהלך הראשון שלו הוא יכול לזנק שתי משבצות! החיילים הם הבסיס של כל אסטרטגיה.'],en:['The pawn — small but important','A pawn moves one square forward, never backward. But on its very first move it may leap two squares! Pawns are the base of every strategy.'],pieces:[[6,4,'w','p']],hints:[[5,4],[4,4]],focus:[[6,4]],target:[4,4]},
   {ch:0,he:['איך החייל אוכל','החייל זז ישר קדימה, אבל אוכל אחרת — משבצת אחת באלכסון קדימה. הוא לא יכול לאכול את הכלי שנמצא ישר מולו. כאן אפשר לאכול את הפרש או את הרץ.'],en:['How the pawn captures','A pawn moves straight forward but captures differently — one square diagonally forward. It cannot capture a piece directly in front of it. Here you can take the knight or the bishop.'],pieces:[[4,4,'w','p'],[3,3,'b','n'],[3,5,'b','b']],hints:[[3,3],[3,5]],focus:[[4,4]]},
   {ch:0,he:['הצריח','הצריח נע בקווים ישרים — למעלה, למטה ולצדדים — לכל מרחק פנוי. הוא כלי חזק, שווה בערך 5 חיילים. הוא הכי חזק כשהקווים פתוחים.'],en:['The rook','A rook moves in straight lines — up, down, and sideways — for any clear distance. It is a strong piece, worth about 5 pawns, and loves open lines.'],pieces:[[4,3,'w','r']],hints:[[0,3],[1,3],[2,3],[3,3],[5,3],[6,3],[7,3],[4,0],[4,1],[4,2],[4,4],[4,5],[4,6],[4,7]],focus:[[4,3]]},
   {ch:0,he:['הרץ','הרץ נע רק באלכסונים, לכל מרחק פנוי. שים לב: כל רץ נשאר תמיד על אותו צבע משבצות! לכל שחקן יש רץ "לבן" ורץ "שחור". שווה בערך 3 חיילים.'],en:['The bishop','A bishop moves only along diagonals, any clear distance. Notice: each bishop always stays on one color of squares! Each player has a light-squared and a dark-squared bishop. Worth about 3 pawns.'],pieces:[[5,2,'w','b'],[2,5,'b','r']],hints:[[4,3],[3,4],[2,5],[4,1],[3,0],[6,3],[7,4],[6,1],[7,0]],focus:[[5,2]]},
   {ch:0,he:['הפרש (הסוס)','הפרש נע בצורת האות ר: שתי משבצות בכיוון אחד ואז אחת הצידה. הוא הכלי היחיד שיכול לקפוץ מעל כלים אחרים! הוא מעולה בהתקפות מפתיעות. שווה בערך 3 חיילים.'],en:['The knight','A knight moves in an L shape: two squares one way, then one to the side. It is the only piece that can jump over others! Great for surprise attacks. Worth about 3 pawns.'],pieces:[[4,4,'w','n'],[2,5,'b','b'],[5,2,'b','r']],hints:[[2,3],[2,5],[3,2],[3,6],[5,2],[5,6],[6,3],[6,5]],focus:[[4,4]]},
   {ch:0,he:['המלכה — הכלי החזק ביותר','המלכה משלבת את כוח הצריח והרץ: היא נעה בקו ישר או באלכסון, לכל מרחק, עד שכלי חוסם אותה. היא שווה בערך 9 חיילים — שמור עליה!'],en:['The queen — the most powerful piece','The queen combines the rook and bishop: it moves in straight lines or diagonals, any distance, until a piece blocks it. Worth about 9 pawns — protect it!'],pieces:[[4,3,'w','q'],[1,3,'b','r'],[4,7,'b','b']],hints:[[1,3],[2,3],[3,3],[5,3],[6,3],[7,3],[4,0],[4,1],[4,2],[4,4],[4,5],[4,6],[4,7],[0,7],[1,6],[2,5],[3,4],[3,2],[2,1],[1,0],[5,2],[6,1],[7,0],[5,4],[6,5],[7,6]],focus:[[4,3]]},
   {ch:1,he:['כמה שווה כל כלי','לפני שמחליפים כלים, חשוב לדעת את השווי: חייל = 1, פרש = 3, רץ = 3, צריח = 5, מלכה = 9. המלך שווה אינסוף — אם מאבדים אותו, מפסידים. הכלל: אל תיתן כלי גדול תמורת כלי קטן.'],en:['How much each piece is worth','Before trading pieces, know their value: pawn = 1, knight = 3, bishop = 3, rook = 5, queen = 9. The king is priceless. The rule: never give a big piece for a small one.'],pieces:[[4,1,'w','p'],[4,2,'w','n'],[4,3,'w','b'],[4,4,'w','r'],[4,5,'w','q'],[4,6,'w','k']]},
   {ch:1,he:['מה זה שח?','כשכלי של היריב מאיים לאכול את המלך שלך בתור הבא — אתה ב"שח". חובה לצאת מהשח מיד! כאן המלכה השחורה מאיימת על המלך הלבן לאורך הטור.'],en:['What is check?','When an enemy piece threatens to capture your king next turn, you are in check. You must get out of check immediately! Here the black queen attacks the white king down the file.'],pieces:[[7,4,'w','k'],[4,4,'b','q']]},
   {ch:1,he:['לצאת משח (1) — להזיז את המלך','יש שלוש דרכים לצאת משח. הראשונה: להזיז את המלך למשבצת בטוחה. כאן הצריח מאיים על המלך לאורך הטור — הזז את המלך הצידה, מחוץ לקו האש.'],en:['Escaping check (1) — move the king','There are three ways out of check. First: move the king to a safe square. Here the rook attacks the king down the file — step the king aside, out of the line of fire.'],pieces:[[7,4,'w','k'],[0,4,'b','r']],hints:[[7,3],[7,5],[6,3],[6,5]],focus:[[7,4]]},
   {ch:1,he:['לצאת משח (2) — לחסום','הדרך השנייה: לחסום את ההתקפה עם כלי אחר. המלך בשח מהצריח לאורך הטור — הזז את הרץ שלך כדי לעמוד ביניהם ולחסום את האיום.'],en:['Escaping check (2) — block','The second way: block the attack with another piece. The king is in check from the rook along the file — move your bishop in between to block the threat.'],pieces:[[5,3,'w','b'],[7,1,'w','k'],[0,1,'b','r']],hints:[[3,1]],focus:[[5,3]],target:[3,1]},
   {ch:1,he:['לצאת משח (3) — לאכול את התוקף','הדרך השלישית: פשוט לאכול את הכלי שנותן את השח! הפרש השחור מאיים על המלך — אכול אותו עם החייל שלך באלכסון.'],en:['Escaping check (3) — capture the attacker','The third way: simply capture the piece giving check! The black knight attacks the king — take it with your pawn, diagonally.'],pieces:[[6,4,'w','p'],[7,4,'w','k'],[5,3,'b','n']],hints:[[5,3]],focus:[[6,4]],target:[5,3]},
   {ch:1,he:['הצרחה — מבצרים את המלך','הצרחה היא המהלך המיוחד היחיד שמזיז שני כלים יחד. המלך זז שתי משבצות לכיוון הצריח, והצריח קופץ לצידו השני — המלך מסתתר בפינה בטוחה. מותר רק אם המלך והצריח לא זזו, אין כלים ביניהם, והמלך לא בשח. תמיד כדאי!'],en:['Castling — fortify the king','Castling is the only special move that shifts two pieces at once. The king moves two squares toward a rook, and the rook jumps to its other side — the king hides safely in the corner. Allowed only if neither piece has moved, the path is clear, and the king is not in check. Almost always a good idea!'],pieces:[[7,4,'w','k'],[7,7,'w','r'],[7,0,'w','r']]},
   {ch:1,he:['הכתרת חייל','כשחייל מגיע לשורה האחרונה בצד של היריב — הוא מוכתר ומתחלף בכלי חזק! בדרך כלל בוחרים מלכה (הכלי החזק ביותר), אבל אפשר גם צריח, רץ או פרש.'],en:['Pawn promotion','When a pawn reaches the last rank on the far side, it promotes into a stronger piece! Usually you pick a queen (the strongest), but you may also choose a rook, bishop, or knight.'],pieces:[[1,4,'w','p']],hints:[[0,4]],focus:[[1,4]],target:[0,4],promotion:'q'},
   {ch:1,he:['הכאה דרך הילוכו (אן פסאן)','חוק מיוחד ונדיר: אם חייל של היריב זינק שתי משבצות ונעצר ממש ליד החייל שלך, אתה יכול לאכול אותו באלכסון כאילו הוא זז רק משבצת אחת — אבל רק מיד בתור הבא!'],en:['En passant (in passing)','A special, rare rule: if an enemy pawn leaps two squares and lands right beside your pawn, you may capture it diagonally as if it had moved only one square — but only immediately, on your very next turn!'],pieces:[[3,4,'w','p'],[3,3,'b','p']]},
   {ch:1,he:['תיקו — כשאף אחד לא מנצח','לא כל משחק נגמר במט. אם לשחקן שתורו אין אף מהלך חוקי אבל הוא לא בשח — זה "פט", והמשחק נגמר בתיקו. יש גם תיקו כשנשארים בלי מספיק כלים למט, או כשאותה עמדה חוזרת שלוש פעמים. זהירות — לפעמים מפספסים ניצחון בגלל פט!'],en:['Draws — when nobody wins','Not every game ends in mate. If the player to move has no legal move but is not in check — that is stalemate, and the game is a draw. Draws also happen with too little material, or when the same position repeats three times. Careful — a careless stalemate can throw away a win!'],pieces:[[0,0,'b','k'],[1,2,'w','q'],[3,2,'w','k']]},
   {ch:2,he:['עיקרון 1: שלוט במרכז','ארבע המשבצות במרכז הלוח הן הכי חשובות — כלי במרכז שולט ביותר משבצות ומגיע לכל מקום מהר. התחל תמיד בדחיפת חייל מרכזי שתי משבצות.'],en:['Principle 1: control the center','The four central squares are the most important — a piece in the center controls more squares and reaches everywhere fast. Always start by pushing a central pawn two squares.'],pieces:[[6,4,'w','p']],hints:[[4,4]],focus:[[6,4]],target:[4,4]},
   {ch:2,he:['עיקרון 2: פתח את הפרשים','"פיתוח" זה להוציא כלים מהשורה האחורית אל המשחק. פרשים אוהבים את המרכז — פתח את הפרש למשבצת שממנה הוא שולט בהרבה שטח. הפרשים בדרך כלל יוצאים ראשונים.'],en:['Principle 2: develop your knights','Development means bringing pieces off the back rank into the game. Knights love the center — bring your knight to a square that controls lots of ground. Knights usually come out first.'],pieces:[[7,6,'w','n']],hints:[[5,5],[5,7]],focus:[[7,6]],target:[5,5]},
   {ch:2,he:['עיקרון 3: פתח את הרצים','אחרי הפרשים, פתח את הרצים אל אלכסונים פעילים. רץ טוב יכול לכוון רחוק אל המלך של היריב. הוצא אותו למקום שממנו הוא "רואה" הרבה.'],en:['Principle 3: develop your bishops','After the knights, develop your bishops onto active diagonals. A well-placed bishop can aim far, even at the enemy king. Put it where it sees the most.'],pieces:[[7,5,'w','b']],hints:[[6,4],[5,3],[4,2],[6,6],[5,7]],focus:[[7,5]],target:[4,2]},
   {ch:2,he:['עיקרון 4: הצרח מוקדם','ברגע שפיתחת פרש ורץ — הצרח! זה מסתיר את המלך בפינה בטוחה ומחבר את הצריחים. אל תשאיר את המלך תקוע במרכז, שם הוא מטרה קלה. הנה מלך שהצריח — בטוח מאחורי החיילים.'],en:['Principle 4: castle early','As soon as you have developed a knight and a bishop — castle! It tucks the king safely in the corner and connects the rooks. Do not leave the king stuck in the center, an easy target. Here is a castled king, safe behind its pawns.'],pieces:[[7,6,'w','k'],[7,5,'w','r'],[6,5,'w','p'],[6,6,'w','p'],[6,7,'w','p']]},
   {ch:2,he:['עיקרון 5: אל תזיז כלי פעמיים','בפתיחה כל מהלך יקר. אל תזיז את אותו כלי שוב ושוב בזמן שכלים אחרים שלך עדיין ישנים בבית. פתח כלי חדש בכל מהלך — שכל הצבא שלך יהיה בקרב.'],en:['Principle 5: do not move a piece twice','In the opening every move is precious. Do not shuffle the same piece back and forth while your other pieces sleep at home. Develop a new piece each move — get your whole army into the fight.'],pieces:[[4,4,'w','n'],[7,5,'w','b'],[7,3,'w','q']]},
   {ch:2,he:['עיקרון 6: אל תמהר עם המלכה','מפתה להוציא את המלכה החזקה מוקדם, אבל היריב פשוט יתקוף אותה עם פרשים ורצים קטנים, ואתה תבזבז מהלכים על בריחה בזמן שהוא מפתח. פתח קודם כלים קטנים, ואת המלכה מאוחר יותר.'],en:['Principle 6: do not rush your queen','It is tempting to bring the mighty queen out early, but the opponent just attacks it with little knights and bishops, and you waste moves fleeing while they develop. Bring the small pieces out first, the queen later.'],pieces:[[4,3,'w','q'],[2,4,'b','n'],[0,4,'b','k']]},
   {ch:2,he:['פתיחה אמיתית: האיטלקית','הנה פתיחה מצוינת למתחילים, "הפתיחה האיטלקית": חייל למרכז, פרש שמגן ותוקף, ורץ שמכוון אל המשבצת החלשה ליד המלך של היריב. היא מיישמת את כל העקרונות: מרכז, פיתוח, ומוכנות להצרחה.'],en:['A real opening: the Italian','Here is an excellent beginner opening, the Italian Game: a pawn to the center, a knight that defends and attacks, and a bishop aiming at the weak square near the enemy king. It follows every principle: center, development, and getting ready to castle.'],pieces:[[4,4,'w','p'],[3,4,'b','p'],[5,5,'w','n'],[2,2,'b','n'],[4,2,'w','b']]},
   {ch:3,he:['אל תשאיר כלים חשופים','כלי "תלוי" הוא כלי שאפשר לאכול בחינם, בלי שהיריב יפסיד משהו בתמורה. לפני כל מהלך שאל: אם אשים אותו כאן, מישהו יכול לאכול אותו? ואם כן — האם הוא מוגן? כאן הרץ מותקף על ידי החייל, אבל חייל לבן מגן עליו, אז הוא בטוח.'],en:['Do not leave pieces hanging','A hanging piece is one that can be taken for free, with nothing given back. Before every move ask: if I put it here, can it be captured? And if so — is it defended? Here the bishop is attacked by a pawn, but a white pawn defends it, so it is safe.'],pieces:[[4,4,'w','b'],[3,5,'b','p'],[5,3,'w','p']]},
   {ch:3,he:['לספור תוקפים ומגנים','לפני שאתה אוכל כלי מוגן — ספור! כמה כלים שלך תוקפים אותו, וכמה כלים של היריב מגנים עליו? כאן החייל השחור מותקף פעמיים ומוגן פעמיים — אם תיכנס, ההחלפה שווה. תמיד תספור לפני שאתה אוכל.'],en:['Count attackers and defenders','Before you capture a defended piece — count! How many of your pieces attack it, and how many enemy pieces defend it? Here the black pawn is attacked twice and defended twice — the trade is even. Always count before you take.'],pieces:[[3,3,'b','p'],[4,2,'w','p'],[4,4,'w','p'],[2,2,'b','p'],[2,4,'b','p']]},
   {ch:3,he:['טקטיקה: המזלג','מזלג הוא מהלך אחד שתוקף שני כלים (או יותר) בבת אחת. הפרש הוא אלוף המזלגים כי הוא קופץ ותוקף כלים רחוקים זה מזה. כאן הפרש יכול לקפוץ למשבצת שתוקפת גם את המלך וגם את המלכה — היריב יציל את המלך, ואתה תזכה במלכה!'],en:['Tactic: the fork','A fork is one move that attacks two pieces (or more) at once. The knight is the king of forks because it jumps and hits pieces far apart. Here the knight can leap to a square attacking both the king and the queen — the opponent saves the king, and you win the queen!'],pieces:[[5,4,'w','n'],[1,4,'b','k'],[1,2,'b','q']],hints:[[3,3]],focus:[[5,4]],target:[3,3]},
   {ch:3,he:['גם חיילים עושים מזלג','לא רק הפרש! גם חייל קטן יכול לעשות מזלג. דחוף את החייל קדימה אל המשבצת שממנה הוא מאיים על שני כלים באלכסון — היריב יכול להציל רק אחד מהם.'],en:['Even pawns can fork','Not just the knight! Even a humble pawn can fork. Push the pawn forward to a square from which it threatens two pieces diagonally — the opponent can save only one of them.'],pieces:[[4,4,'w','p'],[2,3,'b','n'],[2,5,'b','b']],hints:[[3,4]],focus:[[4,4]],target:[3,4]},
   {ch:3,he:['טקטיקה: הסיכה','סיכה "מקרקעת" כלי של היריב, כי מאחוריו עומד כלי חשוב יותר. אם הכלי הקדמי יזוז — הכלי היקר מאחוריו ייחשף. כאן הרץ הלבן מסמן את הפרש השחור אל המלך: הפרש לא יכול לזוז בכלל!'],en:['Tactic: the pin','A pin freezes an enemy piece because a more valuable piece stands behind it. If the front piece moves, the precious one behind is exposed. Here the white bishop pins the black knight to the king: the knight cannot move at all!'],pieces:[[4,2,'w','b'],[2,4,'b','n'],[0,6,'b','k']]},
   {ch:3,he:['נצל את הסיכה','כלי מסוכר הוא כלי חלש — הוא לא יכול לברוח! כאן הפרש השחור מסוכר אל המלך, אז הוא תקוע. אכול אותו בחינם עם הרץ שלך.'],en:['Use the pin','A pinned piece is a weak piece — it cannot run away! Here the black knight is pinned to its king, so it is stuck. Capture it for free with your bishop.'],pieces:[[4,2,'w','b'],[2,4,'b','n'],[0,6,'b','k']],hints:[[3,3],[2,4]],focus:[[4,2]],target:[2,4]},
   {ch:3,he:['טקטיקה: השיפוד','שיפוד הוא כמו סיכה הפוכה: הכלי החשוב עומד מקדימה, נאלץ לזוז מהאיום, וחושף כלי חלש יותר מאחוריו. הזז את הצריח כדי לתת שח למלך — הוא יזוז, ואז הצריח יאכל את המלכה שמאחוריו!'],en:['Tactic: the skewer','A skewer is like a reverse pin: the valuable piece stands in front, is forced to move away from the threat, and exposes a lesser piece behind it. Move the rook to check the king — it will step aside, and then your rook grabs the queen behind it!'],pieces:[[7,0,'w','r'],[4,3,'b','k'],[4,6,'b','q']],hints:[[4,0]],focus:[[7,0]],target:[4,0]},
   {ch:3,he:['טקטיקה: התקפה מגולה','לפעמים כלי שלך חוסם כלי אחר. כשאתה מזיז את הכלי הקדמי — הכלי שמאחוריו "מתגלה" ותוקף! כאן, כשהפרש יזוז, הרץ שמאחוריו יאיים על המלכה השחורה. וגם הפרש עצמו יכול לתקוף משהו — התקפה כפולה!'],en:['Tactic: the discovered attack','Sometimes your own piece blocks another. When you move the front piece, the one behind it is uncovered and attacks! Here, when the knight moves, the bishop behind it will hit the black queen. And the knight itself can attack too — a double blow!'],pieces:[[4,4,'w','n'],[5,5,'w','b'],[1,1,'b','q']]},
   {ch:3,he:['טקטיקה: שח מגולה','התקפה מגולה שחושפת שח על המלך היא נשק חזק במיוחד! היריב חייב לטפל בשח, אז הכלי שזז יכול לאכול מה שהוא רוצה בחופשיות. כאן, כשהפרש יזוז, הצריח נותן שח — והפרש חופשי לתקוף.'],en:['Tactic: the discovered check','A discovered attack that reveals a check on the king is an especially powerful weapon! The opponent must deal with the check, so the piece that moved can grab whatever it likes freely. Here, when the knight moves, the rook gives check — and the knight is free to strike.'],pieces:[[4,4,'w','n'],[5,4,'w','r'],[1,4,'b','k']]},
   {ch:3,he:['טקטיקה: התקפה כפולה','התקפה כפולה זה כשמהלך אחד מאיים על שני דברים. המלכה מצוינת בזה כי היא נעה בכל הכיוונים. מצא את המשבצת שממנה המלכה נותנת שח למלך וגם תוקפת את הצריח — היריב יציל את המלך, ואתה תיקח את הצריח!'],en:['Tactic: the double attack','A double attack is one move that threatens two things. The queen is superb at this because it moves in every direction. Find the square where the queen checks the king and also attacks the rook — the opponent saves the king, and you take the rook!'],pieces:[[7,0,'w','q'],[0,0,'b','k'],[3,7,'b','r']],hints:[[3,0]],focus:[[7,0]],target:[3,0]},
   {ch:3,he:['טקטיקה: הסרת המגן','אם כלי חשוב של היריב מוגן על ידי כלי אחד בלבד — תקוף או אכול את המגן! ברגע שהמגן נעלם, הכלי החשוב נשאר חשוף. כאן הרץ הלבן יכול לאכול את הפרש שמגן על הצריח, ואז הצריח שלנו.'],en:['Tactic: remove the defender','If an important enemy piece is protected by only one defender — attack or capture that defender! Once the guard is gone, the valuable piece is left hanging. Here the white bishop can take the knight defending the rook, and then the rook falls.'],pieces:[[2,2,'b','r'],[4,3,'b','n'],[6,5,'w','b']]},
   {ch:4,he:['מט בשורה האחורית','מלך שהצריח והסתתר מאחורי החיילים שלו יכול להיתקע. צריח או מלכה שמגיעים לשורה האחורית נותנים מט — כי החיילים חוסמים את המלך והוא לא יכול לברוח. הזז את הצריח לשורה האחרונה!'],en:['Back-rank mate','A king that castled and hid behind its pawns can get trapped. A rook or queen reaching the back rank delivers mate — the pawns block the king and it cannot escape. Move the rook to the last rank!'],pieces:[[4,0,'w','r'],[0,6,'b','k'],[1,5,'b','p'],[1,6,'b','p'],[1,7,'b','p']],hints:[[0,0]],focus:[[4,0]],target:[0,0]},
   {ch:4,he:['מט הסולם — שני צריחים','שני צריחים נותנים מט יפהפה שנקרא "מט הסולם": צריח אחד חוסם שורה שלמה כדי שהמלך לא יברח, והצריח השני נותן שח בשורה שבה המלך עומד. הזז את הצריח התחתון לשורה של המלך — מט!'],en:['The ladder mate — two rooks','Two rooks deliver a beautiful mate called the ladder: one rook cuts off a whole rank so the king cannot escape, and the second rook checks on the rank the king stands on. Move the lower rook to the king rank — mate!'],pieces:[[4,0,'w','r'],[1,7,'w','r'],[0,4,'b','k']],hints:[[0,0]],focus:[[4,0]],target:[0,0]},
   {ch:4,he:['מט עם מלכה ומלך','כדי לתת מט צריך בדרך כלל שני כלים ששיתפו פעולה. כאן המלכה נותנת שח למלך בפינה, והמלך הלבן מגן על המלכה — אז המלך השחור לא יכול לאכול אותה, ואין לו לאן לברוח. זה אחד המטים הכי חשובים ללמוד!'],en:['Checkmate with king and queen','Checkmate usually needs two pieces working together. Here the queen checks the king in the corner, and the white king defends the queen — so the black king cannot capture it and has nowhere to run. This is one of the most important mates to learn!'],pieces:[[0,7,'b','k'],[1,6,'w','q'],[2,5,'w','k']]},
   {ch:4,he:['מט חנוק','המט הכי מגניב! המלך של היריב חנוק לגמרי בין הכלים של עצמו, והפרש קופץ ונותן שח — אין דרך לחסום פרש, ואין לאן לזוז. כאן הצריח והחיילים השחורים חונקים את המלך, והפרש הלבן משלים מט.'],en:['Smothered mate','The coolest mate of all! The enemy king is completely smothered by its own pieces, and the knight jumps in with check — a knight check cannot be blocked, and there is nowhere to move. Here the black rook and pawns smother the king, and the white knight delivers mate.'],pieces:[[0,6,'b','k'],[0,5,'b','r'],[1,5,'b','p'],[1,6,'b','p'],[1,7,'b','p'],[2,7,'w','n']]},
   {ch:4,he:['מט השחמטאי (ב-4 מהלכים)','זו מלכודת מפורסמת! המלכה והרץ מכוונים יחד אל המשבצת החלשה ליד המלך של היריב (ליד החייל שלפני הרץ). אם היריב לא נזהר — מלכה אחת נכנסת ונותנת מט מהיר. תכיר את זה, כדי שלא יעשו לך את זה!'],en:['Scholar’s mate (in 4 moves)','A famous trap! The queen and bishop aim together at the weak square next to the enemy king. If the opponent is careless — the queen swoops in for a quick mate. Learn it, so nobody does it to you!'],pieces:[[1,5,'w','q'],[4,2,'w','b'],[0,4,'b','k'],[0,3,'b','q'],[0,5,'b','b'],[1,3,'b','p'],[1,4,'b','p']]},
   {ch:4,he:['איך מתגוננים ממט השחמטאי','אל תיבהל! אם ראית את המלכה והרץ מכוונים אל המשבצת החלשה, פשוט הגן עליה: פתח את הפרש כדי שיגן, או הזז חייל כדי לחסום. אחרי שהתגוננת — המלכה של היריב יצאה מוקדם מדי, ואתה תרוויח זמן לתקוף אותה.'],en:['How to defend against Scholar’s mate','Do not panic! If you see the queen and bishop aiming at the weak square, just defend it: develop a knight to guard it, or move a pawn to block. Once you defend — the opponent’s queen came out too early, and you gain time to attack it.'],pieces:[[1,5,'b','p'],[2,5,'b','n'],[4,7,'w','q']]},
   {ch:5,he:['בסיום — המלך הופך ללוחם','במהלך המשחק שומרים על המלך מוסתר, אבל בסוף המשחק, כשנשארו מעט כלים ואין סכנת מט — המלך הוא כלי חזק! הבא אותו למרכז, שיעזור לחיילים שלך להתקדם ולהכתיר.'],en:['In the endgame — the king becomes a fighter','During the game you keep the king hidden, but in the endgame, when few pieces remain and there is no mating danger — the king is a strong piece! Bring it to the center to help your pawns advance and promote.'],pieces:[[4,4,'w','k'],[4,5,'w','p'],[2,4,'b','k']]},
   {ch:5,he:['האופוזיציה','טריק מלכים חשוב: כששני המלכים עומדים זה מול זה עם משבצת אחת ביניהם — למי שלא צריך לזוז יש יתרון, כי המלך השני נאלץ לפנות דרך. זה נקרא "אופוזיציה", והוא המפתח לנצח בסיומי מלך וחייל.'],en:['The opposition','An important king trick: when two kings face each other with one square between them — whoever does NOT have to move has the advantage, because the other king must give way. This is called the opposition, and it is the key to winning king-and-pawn endgames.'],pieces:[[4,4,'w','k'],[2,4,'b','k']]},
   {ch:5,he:['סיום: להכתיר את החייל','בסוף המשחק, כשנשארים מעט כלים, החיילים נהיים ענקיים כי קל להכתיר אותם. השתמש במלך שלך כדי ללוות את החייל, ודחוף אותו לשורה האחרונה — מלכה חדשה תסיים את המשחק!'],en:['Endgame: promote the pawn','In the endgame, when few pieces remain, pawns become giants because they are easy to promote. Use your king to escort the pawn, and push it to the last rank — a new queen will finish the game!'],pieces:[[1,3,'w','p'],[7,0,'w','k'],[0,7,'b','k']],hints:[[0,3]],focus:[[1,3]],target:[0,3],promotion:'q'},
   {ch:5,he:['חייל חופשי','"חייל חופשי" הוא חייל שאין מולו אף חייל של היריב שיכול לעצור אותו — לא באותו טור ולא בטורים השכנים. חייל כזה שווה זהב: דחוף אותו בכל הכוח לעבר ההכתרה!'],en:['The passed pawn','A passed pawn is a pawn with no enemy pawns able to stop it — not on its file, nor on the neighboring files. Such a pawn is worth gold: push it with all your might toward promotion!'],pieces:[[3,0,'w','p'],[3,7,'b','k'],[6,4,'w','k']]},
   {ch:6,he:['6 הטיפים לרמה 1000','1) שלוט במרכז ופתח את כל הכלים. 2) הצרח מוקדם. 3) לפני כל מהלך בדוק: כלום לא תלוי? 4) חפש מזלגים, סיכות ושיפודים בכל תור. 5) ספור כלים לפני שאתה אוכל. 6) בסיום — הפעל את המלך ודחוף חיילים. תרגל, ותשתפר מהר!'],en:['6 tips to reach 1000','1) Control the center and develop every piece. 2) Castle early. 3) Before every move, check: is anything hanging? 4) Look for forks, pins, and skewers each turn. 5) Count pieces before you capture. 6) In the endgame, activate the king and push pawns. Practice, and you will improve fast!'],pieces:[[4,3,'w','q'],[7,4,'w','k'],[4,4,'w','r']]},
   {ch:6,he:['כל הכבוד — סיימת את המדריך!','עכשיו אתה מכיר את כל הכלים, החוקים, עקרונות הפתיחה, הטקטיקות, המטים והסיומים — הבסיס המלא של שחקן ברמה 1000! הצעד הבא: שחק נגד המחשב ברמה "קל", נצח, ותעלה רמה. ככל שתתרגל יותר — כך תשתפר. בהצלחה, אלוף! 🏆'],en:['Well done — you finished the guide!','You now know all the pieces, the rules, opening principles, tactics, checkmates, and endgames — the full foundation of a 1000-level player! Next step: play the computer on Easy, win, and move up a level. The more you practice, the better you get. Good luck, champion! 🏆'],pieces:[[0,4,'b','k'],[0,0,'w','r'],[1,3,'w','p'],[1,4,'w','p'],[1,5,'w','p']]}
  ];
  const TASKS={he:[['לחץ על המלך הלבן המסומן.','בחר אחת מהנקודות והזז את המלך משבצת אחת לכל כיוון.'],['לחץ על החייל המסומן.','זה המהלך הראשון שלו — הזז אותו שתי משבצות ישר קדימה.'],['לחץ על החייל הלבן.','אכול את הפרש או את הרץ באלכסון קדימה.'],['לחץ על הצריח המסומן.','הזז אותו בקו ישר לאחת הנקודות.'],['לחץ על הרץ המסומן.','הזז אותו באלכסון. אפשר גם לאכול את הצריח השחור.'],['לחץ על הפרש המסומן.','הזז אותו בצורת ר אל אחת הנקודות.'],['לחץ על המלכה המסומנת.','הזז אותה בקו ישר או באלכסון. אפשר לאכול כלי שחור.'],null,null,['המלך בשח! לחץ עליו.','הזז את המלך למשבצת בטוחה מחוץ לקו הצריח.'],['המלך בשח מהצריח! לחץ על הרץ שלך.','הזז את הרץ כדי לעמוד בין הצריח למלך ולחסום.'],['המלך בשח מהפרש! לחץ על החייל שלך.','אכול את הפרש שנותן את השח.'],null,['לחץ על החייל שליד סוף הלוח.','הזז אותו לשורה האחרונה ובחר כלי להכתרה.'],null,null,['לחץ על חייל המרכז.','דחוף אותו שתי משבצות למרכז הלוח.'],['לחץ על הפרש (הסוס) המסומן.','פתח אותו אל המרכז.'],['לחץ על הרץ המסומן.','פתח אותו אל אלכסון פעיל במרכז.'],null,null,null,null,null,null,['לחץ על הפרש הלבן.','קפוץ למשבצת שתוקפת גם את המלך וגם את המלכה — מזלג!'],['לחץ על החייל הלבן.','דחוף אותו קדימה כדי לאיים על שני הכלים — מזלג חיילים!'],null,['לחץ על הרץ הלבן.','אכול את הפרש המסוכר — הוא לא יכול לברוח!'],['לחץ על הצריח הלבן.','תן שח למלך — הוא יזוז, ותאכל את המלכה מאחוריו!'],null,null,['לחץ על המלכה הלבנה.','מצא את המשבצת שנותנת שח למלך וגם תוקפת את הצריח.'],null,['לחץ על הצריח הלבן.','הזז אותו לשורה האחורית — המלך תקוע. מט!'],['לחץ על הצריח התחתון.','הזז אותו לשורה של המלך — מט הסולם!'],null,null,null,null,null,null,['לחץ על החייל.','דחוף אותו לשורה האחרונה והכתר מלכה!'],null,null,null],en:[['Click the highlighted white king.','Pick a dot and move the king one square in any direction.'],['Click the highlighted pawn.','This is its first move — push it two squares straight forward.'],['Click the white pawn.','Capture the knight or the bishop diagonally.'],['Click the highlighted rook.','Move it in a straight line to one of the dots.'],['Click the highlighted bishop.','Move it diagonally. You may also take the black rook.'],['Click the highlighted knight.','Move it in an L to one of the dots.'],['Click the highlighted queen.','Move straight or diagonally. You may take a black piece.'],null,null,['The king is in check! Click it.','Move the king to a safe square off the rook line.'],['Check from the rook! Click your bishop.','Move the bishop between the rook and the king to block.'],['Check from the knight! Click your pawn.','Capture the knight that gives check.'],null,['Click the pawn near the end.','Move it to the last rank and choose a promotion piece.'],null,null,['Click the central pawn.','Push it two squares to the center.'],['Click the highlighted knight.','Develop it toward the center.'],['Click the highlighted bishop.','Develop it onto an active central diagonal.'],null,null,null,null,null,null,['Click the white knight.','Jump to the square attacking both the king and the queen — a fork!'],['Click the white pawn.','Push it forward to threaten both pieces — a pawn fork!'],null,['Click the white bishop.','Capture the pinned knight — it cannot run away!'],['Click the white rook.','Check the king — it moves, and you take the queen behind it!'],null,null,['Click the white queen.','Find the square that checks the king and also attacks the rook.'],null,['Click the white rook.','Move it to the back rank — the king is trapped. Mate!'],['Click the lower rook.','Move it to the king rank — the ladder mate!'],null,null,null,null,null,null,['Click the pawn.','Push it to the last rank and promote to a queen!'],null,null,null]};
  const WORDS={he:{turn:'תור ה',white:'לבן',black:'שחור',move:'מהלך',check:' — שח',sure:'המשחק עדיין בעיצומו. לצאת לתפריט?',mateB:'השחור ניצח במט',mateW:'הלבן ניצח במט',stale:'תיקו — פט',insuf:'תיקו — אין מספיק כלים למט',fifty:'תיקו — חוק 50 המהלכים',three:'תיקו — שלוש חזרות',saved:'משחק שמור',vs:'נגד המחשב',two:'שני שחקנים'},en:{turn:'Turn: ',white:'White',black:'Black',move:'Move',check:' — Check',sure:'The game is still in progress. Return to menu?',mateB:'Black wins by checkmate',mateW:'White wins by checkmate',stale:'Draw — stalemate',insuf:'Draw — insufficient material',fifty:'Draw — fifty-move rule',three:'Draw — threefold repetition',saved:'Saved game',vs:'Computer',two:'Two players'}};
  const tr=k=>WORDS[currentLang][k];

  // ---------- אחסון ----------
  const LS = {
    get(k){ try { return localStorage.getItem('chess:'+k); } catch(e){ return null; } },
    set(k,v){ try { localStorage.setItem('chess:'+k, v); } catch(e){} },
    del(k){ try { localStorage.removeItem('chess:'+k); } catch(e){} }
  };

  // ---------- לוח ----------
  function initialBoard(){
    const b=Array.from({length:8},()=>Array(8).fill(null)), back=['r','n','b','q','k','b','n','r'];
    for(let c=0;c<8;c++){ b[0][c]={c:'b',t:back[c]}; b[1][c]={c:'b',t:'p'}; b[6][c]={c:'w',t:'p'}; b[7][c]={c:'w',t:back[c]}; }
    return b;
  }
  function newGame(){ state={board:initialBoard(),turn:'w',castling:{wk:1,wq:1,bk:1,bq:1},ep:null,half:0,full:1,last:null,captured:[],over:false}; history=[]; selected=null; legal=[]; render(); }
  function clone(x){ // שכפול עמוק מהיר (חשוב למהירות ה-AI)
    if(x===null||typeof x!=='object') return x;
    if(Array.isArray(x)){ const a=new Array(x.length); for(let i=0;i<x.length;i++)a[i]=clone(x[i]); return a; }
    const o={}; for(const k in x) o[k]=clone(x[k]); return o;
  }
  function inBounds(r,c){ return r>=0&&r<8&&c>=0&&c<8; }

  function rawMoves(s,r,c,attacks=false){
    const p=s.board[r][c]; if(!p)return [];
    const out=[], add=(rr,cc,special)=>{ if(inBounds(rr,cc)&&(!s.board[rr][cc]||s.board[rr][cc].c!==p.c))out.push({r:rr,c:cc,special}); };
    if(p.t==='p'){
      const d=p.c==='w'?-1:1,start=p.c==='w'?6:1;
      if(!attacks&&!s.board[r+d]?.[c]){add(r+d,c);if(r===start&&!s.board[r+2*d][c])add(r+2*d,c,'double');}
      for(const dc of[-1,1]){const rr=r+d,cc=c+dc;if(attacks&&inBounds(rr,cc))out.push({r:rr,c:cc});else if(inBounds(rr,cc)&&(s.board[rr][cc]?.c!==p.c&&s.board[rr][cc]||s.ep?.r===rr&&s.ep?.c===cc))add(rr,cc,s.ep?.r===rr&&s.ep?.c===cc?'ep':undefined);}
    } else if(p.t==='n') for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc);
    else if(p.t==='k'){
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc)add(r+dr,c+dc);
      if(!attacks&&!isCheck(s,p.c)){
        const row=p.c==='w'?7:0, enemy=p.c==='w'?'b':'w';
        if(r===row&&c===4&&s.castling[p.c+'k']&&!s.board[row][5]&&!s.board[row][6]&&!attacked(s,row,5,enemy)&&!attacked(s,row,6,enemy))out.push({r:row,c:6,special:'castleK'});
        if(r===row&&c===4&&s.castling[p.c+'q']&&!s.board[row][1]&&!s.board[row][2]&&!s.board[row][3]&&!attacked(s,row,3,enemy)&&!attacked(s,row,2,enemy))out.push({r:row,c:2,special:'castleQ'});
      }
    } else {
      const dirs=p.t==='b'?[[1,1],[1,-1],[-1,1],[-1,-1]]:p.t==='r'?[[1,0],[-1,0],[0,1],[0,-1]]:[[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
      for(const [dr,dc] of dirs){let rr=r+dr,cc=c+dc;while(inBounds(rr,cc)){if(!s.board[rr][cc])out.push({r:rr,c:cc});else{if(s.board[rr][cc].c!==p.c)out.push({r:rr,c:cc});break;}rr+=dr;cc+=dc;}}
    }
    return out;
  }
  function attacked(s,r,c,by){for(let rr=0;rr<8;rr++)for(let cc=0;cc<8;cc++){const p=s.board[rr][cc];if(p?.c===by&&rawMoves(s,rr,cc,true).some(m=>m.r===r&&m.c===c))return true;}return false;}
  function isCheck(s,color){for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(s.board[r][c]?.c===color&&s.board[r][c].t==='k')return attacked(s,r,c,color==='w'?'b':'w');return false;}

  function applyMove(s,from,m,promo='q'){
    const n=clone(s),p=n.board[from.r][from.c],target=n.board[m.r][m.c]; if(target)n.captured.push(target);
    const wasPawn=p.t==='p', wasCapture=!!target||m.special==='ep'; // לחוק 50 המהלכים
    n.board[m.r][m.c]=p;n.board[from.r][from.c]=null;
    if(m.special==='ep'){const cr=m.r+(p.c==='w'?1:-1);n.captured.push(n.board[cr][m.c]);n.board[cr][m.c]=null;}
    if(m.special==='castleK'){n.board[m.r][5]=n.board[m.r][7];n.board[m.r][7]=null;}
    if(m.special==='castleQ'){n.board[m.r][3]=n.board[m.r][0];n.board[m.r][0]=null;}
    if(p.t==='p'&&(m.r===0||m.r===7))p.t=promo;
    if(p.t==='k'){n.castling[p.c+'k']=0;n.castling[p.c+'q']=0;}
    if(p.t==='r'){if(from.r===7&&from.c===0)n.castling.wq=0;if(from.r===7&&from.c===7)n.castling.wk=0;if(from.r===0&&from.c===0)n.castling.bq=0;if(from.r===0&&from.c===7)n.castling.bk=0;}
    if(target?.t==='r'){if(m.r===7&&m.c===0)n.castling.wq=0;if(m.r===7&&m.c===7)n.castling.wk=0;if(m.r===0&&m.c===0)n.castling.bq=0;if(m.r===0&&m.c===7)n.castling.bk=0;}
    n.ep=m.special==='double'?{r:(from.r+m.r)/2,c:m.c}:null;n.last={from,to:{r:m.r,c:m.c}};n.turn=p.c==='w'?'b':'w';if(n.turn==='w')n.full++;
    n.half=(wasPawn||wasCapture)?0:(s.half||0)+1; // מונה חצאי-מהלכים לחוק 50 המהלכים
    return n;
  }
  function validMoves(s,r,c){const p=s.board[r][c];if(!p)return[];return rawMoves(s,r,c).filter(m=>!isCheck(applyMove(s,{r,c},m),p.c));}
  function allMoves(s,color){const a=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(s.board[r][c]?.c===color)for(const m of validMoves(s,r,c))a.push(m);return a;}
  function insufficient(){const pieces=state.board.flat().filter(p=>p&&p.t!=='k');return pieces.length===0||(pieces.length===1&&['b','n'].includes(pieces[0].t));}
  // מפתח עמדה לבדיקת שלוש חזרות (מיקום כלים + תור + זכויות הצרחה + en passant)
  function posKey(s){ return JSON.stringify(s.board)+'|'+s.turn+'|'+s.castling.wk+s.castling.wq+s.castling.bk+s.castling.bq+'|'+(s.ep?s.ep.r+','+s.ep.c:'-'); }
  function threefold(){ const k=posKey(state); let c=1; for(const h of history) if(posKey(h)===k) c++; return c>=3; }
  function finishTurn(){
    const moves=allMoves(state,state.turn),check=isCheck(state,state.turn);
    if(!moves.length){state.over=true;state.result=check?(state.turn==='w'?tr('mateB'):tr('mateW')):tr('stale');}
    else if(insufficient()){state.over=true;state.result=tr('insuf');}
    else if((state.half||0)>=100){state.over=true;state.result=tr('fifty');}   // חוק 50 המהלכים
    else if(threefold()){state.over=true;state.result=tr('three');}            // שלוש חזרות
  }

  // ---------- שמירה ----------
  function saveGame(){
    if(!state||!history.length||mode==='remote')return; // משחק מרחוק לא נשמר (אין חיבור אחרי רענון)
    LS.set('saved', JSON.stringify({state,history,mode,level,label:$('#ch-mode-label').textContent}));
    updateContinue();
  }
  function updateContinue(){
    const raw=LS.get('saved');
    $('#ch-continue-game').classList.toggle('ch-hidden',!raw);
    if(raw)try{ $('#ch-continue-label').textContent=JSON.parse(raw).label||tr('saved'); }catch(e){}
  }
  function resumeGame(){
    try{
      const x=JSON.parse(LS.get('saved'));
      state=x.state;history=x.history||[];mode=x.mode||'local';level=x.level||'easy';
      selected=null;legal=[];
      $('#ch-mode-label').textContent=x.label||tr('saved');
      $('#ch-lobby').classList.add('ch-hidden');
      shell.querySelector('.ch-app').classList.remove('ch-hidden');
      render();
      if(mode==='computer'&&state.turn==='b')setTimeout(()=>{ if(alive) computerMove(); },380);
    }catch(e){ LS.del('saved'); updateContinue(); }
  }

  // ---------- עיצוב ----------
  function applyAppearance(piece='carved',board='wood'){
    [...shell.classList].filter(x=>x.startsWith('ch-pieces-')||x.startsWith('ch-board-')).forEach(x=>shell.classList.remove(x));
    shell.classList.add('ch-pieces-'+piece,'ch-board-'+board);
    LS.set('appearance', JSON.stringify({piece,board}));
    $$('#ch-piece-styles button').forEach(b=>b.classList.toggle('ch-active',b.dataset.style===piece));
    $$('#ch-board-styles button').forEach(b=>b.classList.toggle('ch-active',b.dataset.style===board));
  }
  function loadAppearance(){ try{ const x=JSON.parse(LS.get('appearance'))||{}; applyAppearance(x.piece||'carved',x.board||'wood'); }catch(e){ applyAppearance(); } }

  function applyLanguage(lang){
    currentLang=lang; LS.set('language',lang);
    shell.dir = lang==='he'?'rtl':'ltr';
    const en=lang==='en', set=(s,v,html=false)=>{const e=$(s);if(e)e[html?'innerHTML':'textContent']=v;};
    set('.ch-lobby-copy .ch-eyebrow',en?'WELCOME':'ברוכים הבאים');
    set('.ch-lobby-copy h2',en?'How will you<br><em>play today?</em>':'איך משחקים<br><em>היום?</em>',true);
    set('.ch-lobby-copy>p:last-child',en?'Choose an opponent, set the pieces — and begin.':'בחרו יריב, הכינו את הכלים — וצאו לדרך.');
    set('#ch-computer-mode strong',en?'Play the computer':'נגד המחשב');
    set('#ch-computer-mode small',en?'Choose a level and play now':'בחרו רמה ושחקו מיד');
    set('#ch-local-mode strong',en?'Two players':'שני שחקנים');
    set('#ch-local-mode small',en?'Play together on one screen':'שחקו יחד על אותו מסך');
    set('#ch-continue-game strong',en?'Continue game':'המשך משחק');
    set('.ch-lobby-settings span',en?'Settings':'הגדרות');
    set('#ch-learn-mode strong',en?'How to play chess':'איך משחקים שחמט');
    set('#ch-learn-mode small',en?'Learn with a demonstration board':'למדו בעזרת לוח הדגמה');
    set('#ch-lesson-prev',en?'Previous':'הקודם');
    set('#ch-computer-panel h3',en?'Choose difficulty':'בחרו רמת קושי');
    set('#ch-new-game',en?'Menu <span>↗</span>':'לתפריט <span>↗</span>',true);
    set('#ch-undo',en?'↶&nbsp;&nbsp;Undo':'↶&nbsp;&nbsp;בטל',true);
    set('.ch-player-white strong',tr('white'));
    set('.ch-player-black strong',tr('black'));
    set('.ch-hero-copy h1',en?'Your<br><em>move.</em>':'המהלך<br><em>שלך.</em>',true);
    set('.ch-settings-card>.ch-eyebrow',en?'PERSONALIZE':'התאמה אישית');
    set('#ch-settings-title',en?'Design settings':'הגדרות עיצוב');
    const labels=$$('.ch-settings-card>label');
    if(labels[0])labels[0].textContent=en?'Piece style':'סגנון הכלים';
    if(labels[1])labels[1].textContent=en?'Board style':'סגנון הלוח';
    set('#ch-language-label',en?'Language':'שפה');
    const names=en?['Carved','8-bit','Neon','Royal','Ice','Candy','Paper','Shadows','Natural wood','Club','Night','Marble','Ocean','Candy','Desert','Monochrome']:['מגולף','8־ביט','ניאון','מלכותי','קרח','סוכריות','נייר','צללים','עץ טבעי','מועדון','לילה','שיש','אוקיינוס','ממתקים','מדבר','מונוכרום'];
    $$('.ch-style-options strong').forEach((x,i)=>x.textContent=names[i]);
    $$('.ch-levels button').forEach((b,i)=>b.textContent=(en?['Easy','Medium','Hard','Impossible']:['קל','בינוני','קשה','בלתי אפשרי'])[i]);
    $$('#ch-language-options button').forEach(b=>b.classList.toggle('ch-active',b.dataset.lang===lang));
    renderLesson(); if(state)render(); updateContinue();
  }

  // ---------- צליל ----------
  function playMoveSound(capture=false){
    try{
      if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==='suspended') audioCtx.resume();
      const now=audioCtx.currentTime,gain=audioCtx.createGain(),osc=audioCtx.createOscillator();
      osc.type='sine';
      osc.frequency.setValueAtTime(capture?150:210,now);
      osc.frequency.exponentialRampToValueAtTime(85,now+.09);
      gain.gain.setValueAtTime(.12,now);
      gain.gain.exponentialRampToValueAtTime(.001,now+.11);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);osc.stop(now+.12);
    }catch(e){}
  }

  // ---------- מהלכים ----------
  function clickSquare(r,c){
    if(!alive||state.over||thinking||(mode==='computer'&&state.turn==='b')||(mode==='remote'&&state.turn!==myColor))return;
    const p=state.board[r][c];
    if(selected){
      const move=legal.find(m=>m.r===r&&m.c===c);
      if(move){
        const moving=state.board[selected.r][selected.c];
        if(moving.t==='p'&&(r===0||r===7)){pendingPromotion={from:selected,move,color:moving.c};showPromotion(moving.c);return;}
        commit(selected,move);return;
      }
    }
    if(p?.c===state.turn){selected={r,c};legal=validMoves(state,r,c);}else{selected=null;legal=[];}
    render();
  }

  function commit(from,move,promo,isRemote){
    const squares=$('#ch-board').children,fromEl=squares[from.r*8+from.c],toEl=squares[move.r*8+move.c];
    const piece=state.board[from.r][from.c],capture=!!state.board[move.r][move.c]||move.special==='ep';
    const finish=()=>{
      if(!alive)return;
      history.push(clone(state));
      state=applyMove(state,from,move,promo);
      selected=null;legal=[];thinking=false;
      // משחק מרחוק: אם זה המהלך שלי (לא התקבל מהיריב) — שלח אותו ליריב
      if(mode==='remote'&&!isRemote&&net.conn&&net.conn.open){ try{ net.conn.send({type:'move',from,move,promo}); }catch(e){} }
      finishTurn();render();saveGame();playMoveSound(capture);
      if(mode==='computer'&&!state.over&&state.turn==='b')setTimeout(()=>{ if(alive) computerMove(); },380);
    };
    if(!fromEl||!toEl||!piece){finish();return;}
    thinking=true;
    const a=fromEl.getBoundingClientRect(),b=toEl.getBoundingClientRect(),fly=document.createElement('span');
    fly.className='ch-piece ch-flying-piece '+(piece.c==='b'?'ch-black':'');
    fly.textContent=GLYPHS[piece.c][piece.t];
    fly.style.cssText='left:'+a.left+'px;top:'+a.top+'px;width:'+a.width+'px;height:'+a.height+'px;';
    fromEl.querySelector('.ch-piece')?.classList.add('ch-piece-hidden');
    shell.appendChild(fly);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ fly.style.transform='translate('+(b.left-a.left)+'px,'+(b.top-a.top)+'px)'; }));
    setTimeout(()=>{fly.remove();finish();},260);
  }

  function showPromotion(color){
    const box=$('#ch-promotion-options');box.innerHTML='';
    for(const t of['q','r','b','n']){
      const b=document.createElement('button');
      b.textContent=GLYPHS[color][t];
      b.onclick=()=>{ $('#ch-promotion').classList.add('ch-hidden'); commit(pendingPromotion.from,pendingPromotion.move,t); pendingPromotion=null; };
      box.appendChild(b);
    }
    $('#ch-promotion').classList.remove('ch-hidden');
  }

  // ---------- רינדור ----------
  function render(){
    if(!state)return;
    const board=$('#ch-board');board.innerHTML='';
    const checked=isCheck(state,state.turn);
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){
      const sq=document.createElement('button'),p=state.board[r][c],isLegal=legal.some(m=>m.r===r&&m.c===c);
      sq.className='ch-square '+((r+c)%2?'ch-dark':'');
      if(selected?.r===r&&selected?.c===c)sq.classList.add('ch-selected');
      if(state.last&&(state.last.from.r===r&&state.last.from.c===c||state.last.to.r===r&&state.last.to.c===c))sq.classList.add('ch-last');
      if(isLegal){sq.classList.add('ch-legal');if(p)sq.classList.add('ch-capture');}
      if(checked&&p?.c===state.turn&&p.t==='k')sq.classList.add('ch-check');
      sq.onclick=()=>clickSquare(r,c);
      sq.setAttribute('aria-label',String.fromCharCode(97+c)+(8-r)+(p?' '+p.t:''));
      if(p)sq.innerHTML='<span class="ch-piece '+(p.c==='b'?'ch-black':'')+'">'+GLYPHS[p.c][p.t]+'</span>';
      if(c===0)sq.innerHTML+='<span class="ch-coord ch-rank">'+(8-r)+'</span>';
      if(r===7)sq.innerHTML+='<span class="ch-coord ch-file">'+String.fromCharCode(97+c)+'</span>';
      board.appendChild(sq);
    }
    // מצב "על מכשיר אחד": הלוח מתהפך לפי התור, שכל שחקן רואה את הכלים שלו למטה
    if(mode==='local') $('#ch-board').classList.toggle('ch-flip', state.turn==='b'&&!state.over);
    const check=checked?tr('check'):'';
    $('#ch-status').textContent=state.over?state.result:(tr('turn')+(state.turn==='w'?tr('white'):tr('black'))+check);
    $('#ch-move-count').textContent=tr('move')+' '+state.full;
    $('#ch-white-turn').classList.toggle('ch-on',state.turn==='w'&&!state.over);
    $('#ch-black-turn').classList.toggle('ch-on',state.turn==='b'&&!state.over);
    $('#ch-undo').disabled=!history.length;
    const caps=color=>state.captured.filter(p=>p.c===color).sort((a,b)=>VALUES[b.t]-VALUES[a.t]).map(p=>GLYPHS[p.c][p.t]).join('');
    $('#ch-white-captures').textContent=caps('b');
    $('#ch-black-captures').textContent=caps('w');
  }

  // ============================================================
  //  מנוע AI: negamax + alpha-beta + טבלאות מיקום + quiescence
  // ============================================================
  const PVAL={p:100,n:320,b:330,r:500,q:900,k:20000};
  const MATE=1000000;
  // טבלאות מיקום (מנקודת מבט הלבן; r=0 שורה 8, r=7 שורה 1)
  const PST={
    p:[[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
    n:[[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
    b:[[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
    r:[[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
    q:[[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
    k:[[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]]
  };
  function evalBoard(s){ // + = טוב ללבן
    let sc=0;
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=s.board[r][c]; if(!p)continue;
      const v=PVAL[p.t]+(p.c==='w'?PST[p.t][r][c]:PST[p.t][7-r][c]);
      sc += p.c==='w' ? v : -v;
    }
    return sc;
  }
  function evalSide(s){ return (s.turn==='w'?1:-1)*evalBoard(s); } // מנקודת מבט מי שבתור
  function isCap(s,mv){ return !!s.board[mv.m.r][mv.m.c] || mv.m.special==='ep'; }
  function orderedMoves(s,color){
    const list=[];
    for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(s.board[r][c]?.c===color){
      const mover=s.board[r][c];
      for(const m of validMoves(s,r,c)){
        const victim=s.board[m.r][m.c];
        let sc=victim?10*PVAL[victim.t]-PVAL[mover.t]:(m.special==='ep'?900:0);
        list.push({from:{r,c},m,sc});
      }
    }
    list.sort((a,b)=>b.sc-a.sc);
    return list;
  }
  function quiesce(s,alpha,beta){
    let stand=evalSide(s);
    if(stand>=beta)return beta;
    if(stand>alpha)alpha=stand;
    const moves=orderedMoves(s,s.turn);
    for(const mv of moves){
      if(!isCap(s,mv))continue;
      const sc=-quiesce(applyMove(s,mv.from,mv.m,'q'),-beta,-alpha);
      if(sc>=beta)return beta;
      if(sc>alpha)alpha=sc;
    }
    return alpha;
  }
  let searchDeadline=0;
  function negamax(s,depth,alpha,beta,ply){
    if(performance.now()>searchDeadline)return alpha; // נגמר הזמן — עצירה מיידית
    if(depth<=0)return quiesce(s,alpha,beta);
    const moves=orderedMoves(s,s.turn);
    if(!moves.length)return isCheck(s,s.turn)?-(MATE-ply):0;
    for(const mv of moves){
      const sc=-negamax(applyMove(s,mv.from,mv.m,'q'),depth-1,-beta,-alpha,ply+1);
      if(sc>=beta)return beta;
      if(sc>alpha)alpha=sc;
    }
    return alpha;
  }
  function searchBest(s,cfg){
    const moves=orderedMoves(s,s.turn);
    if(!moves.length)return null;
    if(cfg.random&&Math.random()<cfg.random)return moves[Math.floor(Math.random()*moves.length)];
    let best=moves[0];
    searchDeadline=performance.now()+cfg.time;
    for(let d=1;d<=cfg.depth;d++){
      let alpha=-Infinity, localBest=null, aborted=false;
      for(const mv of moves){
        if(performance.now()>searchDeadline){aborted=true;break;}
        const sc=-negamax(applyMove(s,mv.from,mv.m,'q'),d-1,-Infinity,-alpha,1);
        if(localBest===null||sc>alpha){alpha=sc;localBest=mv;}
      }
      if(!aborted&&localBest)best=localBest; // מקבלים רק עומק שהושלם במלואו
      if(aborted)break;
    }
    return best;
  }
  // הגדרות הרמות (עומק חיפוש, תקציב זמן במ"ש, אחוז מהלכים אקראיים)
  const AI={
    easy:   {depth:1, time:100,  random:0.82},  // ~0-100: מתחיל, כמעט אקראי
    medium: {depth:2, time:450,  random:0.35},  // ~100-1000: שחקן מזדמן
    hard:   {depth:4, time:1500, random:0},     // ~1000-2000: שחקן טוב
    master: {depth:4, time:1800, random:0}      // גיבוי אם Stockfish לא נטען
  };
  // ---------- Stockfish (מנוע אלוף עולם, לרמת "בלתי אפשרי") ----------
  let sf=null, sfReady=false, sfReq=0, sfPending=false;
  function toFEN(s){
    let fen='';
    for(let r=0;r<8;r++){ let e=0;
      for(let c=0;c<8;c++){ const p=s.board[r][c];
        if(!p){e++;continue;}
        if(e){fen+=e;e=0;}
        const ch={p:'p',n:'n',b:'b',r:'r',q:'q',k:'k'}[p.t];
        fen+= p.c==='w'?ch.toUpperCase():ch;
      }
      if(e)fen+=e; if(r<7)fen+='/';
    }
    let cast=''; if(s.castling.wk)cast+='K'; if(s.castling.wq)cast+='Q'; if(s.castling.bk)cast+='k'; if(s.castling.bq)cast+='q';
    const ep=s.ep?String.fromCharCode(97+s.ep.c)+(8-s.ep.r):'-';
    return fen+' '+s.turn+' '+(cast||'-')+' '+ep+' '+(s.half||0)+' '+(s.full||1);
  }
  function initSF(){
    if(sf||typeof Worker==='undefined')return;
    try{
      const blob=new Blob(["importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');"],{type:'text/javascript'});
      sf=new Worker(URL.createObjectURL(blob));
      sf.onmessage=e=>{ const l=typeof e.data==='string'?e.data:((e.data&&e.data.data)||''); onSF(l); };
      sf.onerror=()=>{ sf=null; sfReady=false; };
      sf.postMessage('uci');
    }catch(err){ sf=null; sfReady=false; }
  }
  function onSF(line){
    if(!line)return;
    if(line.indexOf('uciok')>=0){ sf.postMessage('setoption name Skill Level value 20'); sf.postMessage('isready'); }
    else if(line.indexOf('readyok')>=0){ sfReady=true; }
    else if(line.indexOf('bestmove')>=0){ sfPending=false; applySFMove(line.split(' ')[1]); }
  }
  function customMasterMove(){ const best=searchBest(state,AI.master); thinking=false; if(best)commit(best.from,best.m); }
  function applySFMove(uci){
    if(!alive||state.over||state.turn!=='b'||level!=='master'){thinking=false;return;}
    if(!uci||uci==='(none)'){ customMasterMove(); return; }
    const from={c:uci.charCodeAt(0)-97, r:8-parseInt(uci[1])};
    const to={c:uci.charCodeAt(2)-97, r:8-parseInt(uci[3])};
    const promo=uci[4]||'q';
    const m=validMoves(state,from.r,from.c).find(x=>x.r===to.r&&x.c===to.c);
    thinking=false;
    if(m)commit(from,m,promo); else customMasterMove(); // אם משהו לא תואם — נופל למנוע המקומי
  }
  function sfGo(){
    sfPending=true;
    $('#ch-mode-label').textContent=(currentLang==='en'?'Computer · Impossible · Stockfish 🏆':'נגד המחשב · בלתי אפשרי · Stockfish 🏆');
    sf.postMessage('position fen '+toFEN(state));
    sf.postMessage('go movetime 1200');
    const myReq=++sfReq;
    setTimeout(()=>{ if(sfPending&&myReq===sfReq&&alive&&!state.over&&state.turn==='b'&&level==='master'){ sfPending=false; customMasterMove(); } },6000); // ביטחון: אם אין תשובה
  }
  function computerMove(){
    if(!alive||state.over||state.turn!=='b')return;
    thinking=true;render();
    setTimeout(()=>{
      if(!alive||state.over||state.turn!=='b'){thinking=false;return;}
      if(level==='master'&&sfReady&&sf){ sfGo(); return; } // Stockfish
      const best=searchBest(state,AI[level]||AI.medium); // מנוע מקומי
      thinking=false;
      if(best)commit(best.from,best.m);
    },40);
  }

  // ---------- שיעורים ----------
  function tutorialLegalMoves(piece,pieces){
    const [r,c,,t]=piece,out=[],occupied=(rr,cc)=>pieces.find(p=>p[0]===rr&&p[1]===cc),
      add=(rr,cc)=>{if(inBounds(rr,cc)&&(!occupied(rr,cc)||occupied(rr,cc)[2]!==piece[2]))out.push([rr,cc]);};
    if(t==='p'){const d=piece[2]==='w'?-1:1;if(!occupied(r+d,c))add(r+d,c);for(const dc of[-1,1])if(occupied(r+d,c+dc)?.[2]!==piece[2]&&occupied(r+d,c+dc))add(r+d,c+dc);}
    else if(t==='n'){for(const [dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc);}
    else if(t==='k'){for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc)add(r+dr,c+dc);}
    else{const dirs=t==='r'?[[1,0],[-1,0],[0,1],[0,-1]]:t==='b'?[[1,1],[1,-1],[-1,1],[-1,-1]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for(const[dr,dc]of dirs){let rr=r+dr,cc=c+dc;while(inBounds(rr,cc)){add(rr,cc);if(occupied(rr,cc))break;rr+=dr;cc+=dc;}}}
    return out;
  }

  function renderLesson(){
    const board=$('#ch-tutorial-board');if(!board)return;
    const x=LESSONS[lessonIndex],copy=x[currentLang]||x.he,pieces=tutorialPieces||x.pieces,task=TASKS[currentLang][lessonIndex],mover=pieces[0];
    const hints=tutorialDone?tutorialLegalMoves(mover,pieces):(x.hints||[]);
    const focus=tutorialDone?[[mover[0],mover[1]]]:(x.focus||[]);
    let instruction=task?(tutorialDone?(currentLang==='en'?'✓ Great move! Keep practicing or press Next.':'✓ מהלך מצוין! אפשר להמשיך לתרגל או ללחוץ על הבא.'):task[tutorialSelected?1:0]):'';
    if(tutorialFeedback)instruction=tutorialFeedback;
    $('#ch-lesson-title').textContent=copy[0];
    $('#ch-lesson-text').textContent=copy[1]+(instruction?' '+instruction:'');
    $('#ch-lesson-count').textContent=(currentLang==='en'?'LESSON':'שיעור')+' '+(lessonIndex+1)+' / '+LESSONS.length;
    { const chp=CHAPTERS[x.ch]||CHAPTERS[0], cel=$('#ch-lesson-chapter'), bar=$('#ch-lesson-bar'); if(cel)cel.textContent=chp.icon+' '+(chp[currentLang]||chp.he); if(bar)bar.style.width=Math.round((lessonIndex+1)/LESSONS.length*100)+'%'; }
    board.innerHTML='';
    board.classList.toggle('ch-mate-demo',lessonIndex===LESSONS.length-1);
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){
      const s=document.createElement('button'),p=pieces.find(q=>q[0]===r&&q[1]===c);
      s.className='ch-tutorial-square '+((r+c)%2?'ch-dark':'');
      if(tutorialSelected&&hints.some(q=>q[0]===r&&q[1]===c))s.classList.add('ch-hint');
      if(focus.some(q=>q[0]===r&&q[1]===c))s.classList.add('ch-focus');
      if(p)s.innerHTML='<span class="ch-tutorial-piece '+(p[2]==='b'?'ch-black':'')+'">'+GLYPHS[p[2]][p[3]]+'</span>';
      s.onclick=()=>tutorialClick(r,c);
      board.appendChild(s);
    }
    $('#ch-lesson-prev').disabled=lessonIndex===0;
    $('#ch-lesson-next').textContent=lessonIndex===LESSONS.length-1?(currentLang==='en'?'Finish':'סיום'):(currentLang==='en'?'Next':'הבא');
  }

  function animateTutorialMove(from,to,piece,done){
    const squares=$('#ch-tutorial-board').children,aEl=squares[from[0]*8+from[1]],bEl=squares[to[0]*8+to[1]];
    if(!aEl||!bEl){done();return;}
    const a=aEl.getBoundingClientRect(),b=bEl.getBoundingClientRect(),fly=document.createElement('span');
    fly.className='ch-tutorial-piece ch-tutorial-flying '+(piece[2]==='b'?'ch-black':'');
    fly.textContent=GLYPHS[piece[2]][piece[3]];
    fly.style.cssText='left:'+a.left+'px;top:'+a.top+'px;width:'+a.width+'px;height:'+a.height+'px;';
    const orig=aEl.querySelector('.ch-tutorial-piece'); if(orig)orig.style.opacity='0';
    shell.appendChild(fly);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ fly.style.transform='translate('+(b.left-a.left)+'px,'+(b.top-a.top)+'px)'; }));
    setTimeout(()=>{fly.remove();done();},280);
  }

  function chooseTutorialPromotion(pieces,moving){
    const box=$('#ch-promotion-options');box.innerHTML='';
    $('#ch-promotion .ch-modal-card p').textContent=currentLang==='en'?'Choose a promotion piece':'בחר כלי להכתרת החייל';
    for(const t of['q','r','b','n']){
      const b=document.createElement('button');
      b.textContent=GLYPHS[moving[2]][t];
      b.onclick=()=>{moving[3]=t;tutorialPieces=pieces;tutorialDone=true;tutorialFeedback='';$('#ch-promotion').classList.add('ch-hidden');playMoveSound(false);renderLesson();};
      box.appendChild(b);
    }
    $('#ch-promotion').classList.remove('ch-hidden');
  }

  function tutorialClick(r,c){
    const x=LESSONS[lessonIndex],pieces=JSON.parse(JSON.stringify(tutorialPieces||x.pieces));
    if(!x.hints?.length)return;
    const mover=pieces[0],focus=tutorialDone?[[mover[0],mover[1]]]:(x.focus||[]),hints=tutorialDone?tutorialLegalMoves(mover,pieces):(x.hints||[]);
    if(!tutorialSelected){
      if(focus.some(q=>q[0]===r&&q[1]===c)){tutorialSelected=true;tutorialFeedback='';renderLesson();}
      return;
    }
    if(hints.some(q=>q[0]===r&&q[1]===c)){
      if(!tutorialDone&&x.target&&(r!==x.target[0]||c!==x.target[1])){
        tutorialFeedback=currentLang==='en'?'Almost — follow the instruction above.':'כמעט — בצע את ההוראה שמעל הלוח.';
        renderLesson();return;
      }
      tutorialSelected=false;
      const from=[mover[0],mover[1]],wasCapture=pieces.some((p,j)=>j>0&&p[0]===r&&p[1]===c);
      animateTutorialMove(from,[r,c],mover,()=>{
        mover[0]=r;mover[1]=c;
        const finalPieces=pieces.filter((p,j)=>j===0||p[0]!==r||p[1]!==c);
        if(x.promotion&&mover[3]==='p'&&(r===0||r===7)){chooseTutorialPromotion(finalPieces,mover);return;}
        tutorialPieces=finalPieces;tutorialDone=true;tutorialFeedback='';playMoveSound(wasCapture);renderLesson();
      });
    }
  }

  // ---------- ניווט ----------
  function startGame(kind,label){
    LS.del('saved');mode=kind;newGame();
    $('#ch-board').classList.remove('ch-flip'); // משחק רגיל — לוח לא הפוך
    $('#ch-mode-label').textContent=label;
    $('#ch-lobby').classList.add('ch-hidden');
    shell.querySelector('.ch-app').classList.remove('ch-hidden');
    updateContinue();
  }
  function showPanel(id){
    shell.querySelector('.ch-mode-cards').classList.add('ch-hidden');
    $$('.ch-setup-panel').forEach(x=>x.classList.add('ch-hidden'));
    $(id).classList.remove('ch-hidden');
  }
  function resetTutorial(){ tutorialSelected=false;tutorialPieces=null;tutorialDone=false;tutorialFeedback=''; }

  // ---------- משחק מרחוק (PeerJS) ----------
  function rStatus(t){ const el=$('#ch-remote-status'); if(el) el.innerHTML=t; }
  function genCode(){ const A='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++) s+=A[Math.floor(Math.random()*A.length)]; return s; }
  function closeNet(){
    try{ if(net.conn){ net.conn.close(); } }catch(e){}
    try{ if(net.peer){ net.peer.destroy(); } }catch(e){}
    net.conn=null; net.peer=null;
  }
  function setupConn(conn){
    conn.on('data', msg=>{
      if(!alive||!msg) return;
      if(msg.type==='move'){ commit(msg.from,msg.move,msg.promo,true); }
      else if(msg.type==='ready'){
        // אני המארח: היריב מוכן — מגריל צבעים אקראית
        const hostColor = Math.random()<0.5 ? 'w' : 'b';
        try{ conn.send({type:'start', yourColor:(hostColor==='w'?'b':'w')}); }catch(e){}
        startRemoteGame(hostColor);
      }
      else if(msg.type==='start'){
        // אני המצטרף: קיבלתי את הצבע שהוגרל לי
        startRemoteGame(msg.yourColor);
      }
      else if(msg.type==='restart'){ newGame(); }
    });
    conn.on('close', ()=>{ if(mode==='remote') rStatus('היריב התנתק. 😕'); });
  }
  function startRemoteGame(color){
    mode='remote'; myColor=color; LS.del('saved'); newGame();
    $('#ch-board').classList.toggle('ch-flip', color==='b'); // השחור רואה את הלוח הפוך
    $('#ch-mode-label').textContent = 'מרחוק · ' + (color==='w'?'אתה הלבן ⚪':'אתה השחור ⚫');
    $('#ch-lobby').classList.add('ch-hidden');
    shell.querySelector('.ch-app').classList.remove('ch-hidden');
    updateContinue();
  }
  function createRoom(){
    if(typeof Peer==='undefined'){ rStatus('טוען... נסה לרענן את הדף (Ctrl+Shift+R).'); return; }
    closeNet();
    const code=genCode();
    $('#ch-remote-code').textContent=code;
    rStatus('מכין חדר...');
    net.peer=new Peer('flrot-'+code);
    net.peer.on('open', ()=>{ rStatus('שלח את הקוד לחבר 👆<br>מחכה שיצטרף...'); });
    net.peer.on('connection', conn=>{
      net.conn=conn;
      conn.on('open', ()=>{ setupConn(conn); rStatus('יריב מתחבר...'); }); // מחכה ל-ready מהמצטרף
    });
    net.peer.on('error', e=>{
      if(e&&e.type==='unavailable-id'){ createRoom(); } // קוד תפוס — צור חדש
      else rStatus('שגיאה בחיבור. נסה שוב.');
    });
  }
  function joinRoom(){
    if(typeof Peer==='undefined'){ rStatus('טוען... נסה לרענן את הדף (Ctrl+Shift+R).'); return; }
    const code=($('#ch-join-code').value||'').trim().toUpperCase();
    if(code.length<3){ rStatus('הקלד קוד תקין.'); return; }
    closeNet();
    $('#ch-remote-code').textContent='';
    rStatus('מתחבר...');
    net.peer=new Peer();
    net.peer.on('open', ()=>{
      const conn=net.peer.connect('flrot-'+code);
      net.conn=conn;
      conn.on('open', ()=>{ setupConn(conn); try{ conn.send({type:'ready'}); }catch(e){} rStatus('מתחבר, מחכה להתחלה...'); });
      conn.on('error', ()=>rStatus('לא נמצא חדר עם הקוד הזה. 🤔'));
      setTimeout(()=>{ if(mode!=='remote') rStatus('לא הצלחתי להתחבר. בדוק את הקוד ונסה שוב.'); },9000);
    });
    net.peer.on('error', e=>{ rStatus('לא נמצא חדר עם הקוד הזה. 🤔'); });
  }

  // ---------- חיבור אירועים ----------
  $('#ch-computer-mode').onclick=()=>showPanel('#ch-computer-panel');
  $('#ch-local-mode').onclick=()=>showPanel('#ch-two-panel');
  $('#ch-two-local').onclick=()=>startGame('local',tr('two'));
  $('#ch-two-remote').onclick=()=>{ $('#ch-remote-code').textContent=''; $('#ch-remote-status').textContent=''; showPanel('#ch-remote-panel'); };
  $('#ch-create-room').onclick=createRoom;
  $('#ch-join-room').onclick=joinRoom;
  $('#ch-join-code').onkeydown=e=>{ if(e.key==='Enter') joinRoom(); };
  $$('.ch-back').forEach(b=>b.onclick=()=>{
    closeNet();
    $$('.ch-setup-panel').forEach(x=>x.classList.add('ch-hidden'));
    shell.querySelector('.ch-mode-cards').classList.remove('ch-hidden');
  });
  $('#ch-learn-mode').onclick=()=>{lessonIndex=0;resetTutorial();showPanel('#ch-learn-panel');renderLesson();};
  $('#ch-lesson-menu').onclick=()=>{$$('.ch-setup-panel').forEach(x=>x.classList.add('ch-hidden'));shell.querySelector('.ch-mode-cards').classList.remove('ch-hidden');};
  $('#ch-lesson-prev').onclick=()=>{if(lessonIndex>0){lessonIndex--;resetTutorial();renderLesson();}};
  $('#ch-lesson-next').onclick=()=>{
    if(lessonIndex<LESSONS.length-1){lessonIndex++;resetTutorial();renderLesson();}
    else{$$('.ch-setup-panel').forEach(x=>x.classList.add('ch-hidden'));shell.querySelector('.ch-mode-cards').classList.remove('ch-hidden');}
  };
  $('#ch-continue-game').onclick=resumeGame;
  $$('.ch-settings-open').forEach(b=>b.onclick=()=>$('#ch-settings').classList.remove('ch-hidden'));
  $('#ch-close-settings').onclick=()=>$('#ch-settings').classList.add('ch-hidden');
  $('#ch-settings').onclick=e=>{if(e.target.id==='ch-settings')$('#ch-settings').classList.add('ch-hidden');};
  $$('#ch-piece-styles button').forEach(b=>b.onclick=()=>{const x=JSON.parse(LS.get('appearance')||'{}');applyAppearance(b.dataset.style,x.board||'wood');});
  $$('#ch-board-styles button').forEach(b=>b.onclick=()=>{const x=JSON.parse(LS.get('appearance')||'{}');applyAppearance(x.piece||'carved',b.dataset.style);});
  $$('#ch-language-options button').forEach(b=>b.onclick=()=>applyLanguage(b.dataset.lang));
  $$('.ch-levels button').forEach(b=>b.onclick=()=>{
    level=b.dataset.level;
    const names=currentLang==='en'?{easy:'Easy',medium:'Medium',hard:'Hard',master:'Impossible'}:{easy:'קל',medium:'בינוני',hard:'קשה',master:'בלתי אפשרי'};
    startGame('computer',tr('vs')+' · '+names[level]);
  });
  $('#ch-new-game').onclick=()=>{
    if(mode!=='remote'&&history.length&&!confirm(tr('sure')))return;
    closeNet();
    mode='local';
    shell.querySelector('.ch-app').classList.add('ch-hidden');
    $('#ch-lobby').classList.remove('ch-hidden');
    shell.querySelector('.ch-mode-cards').classList.remove('ch-hidden');
    $$('.ch-setup-panel').forEach(x=>x.classList.add('ch-hidden'));
    updateContinue();
  };
  $('#ch-undo').onclick=()=>{if(mode==='remote')return;if(history.length){state=history.pop();selected=null;legal=[];render();saveGame();}};

  const onUnload=()=>saveGame();
  window.addEventListener('beforeunload',onUnload);

  // ---------- הפעלה ----------
  newGame();
  updateContinue();
  loadAppearance();
  // עוקב אחרי שפת האתר: עברית → עברית, כל שפה אחרת → אנגלית (השחמט תומך בעברית ואנגלית)
  applyLanguage((function(){ try{ var p=localStorage.getItem('flrot:lang'); if(p) return p==='he'?'he':'en'; }catch(e){} return LS.get('language')||'he'; })());
  initSF(); // טעינת Stockfish ברקע (לרמת "בלתי אפשרי")

  // ---------- ניקוי ----------
  return function cleanup(){
    alive=false;
    try{ if(sf){ sf.terminate(); sf=null; } }catch(e){}
    closeNet();
    saveGame();
    window.removeEventListener('beforeunload',onUnload);
    if(audioCtx){ try{ audioCtx.close(); }catch(e){} audioCtx=null; }
    shell.querySelectorAll('.ch-flying-piece,.ch-tutorial-flying').forEach(x=>x.remove());
    root.innerHTML='';
  };
}
