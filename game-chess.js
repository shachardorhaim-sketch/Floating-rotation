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
      <div id="ch-computer-panel" class="ch-setup-panel ch-hidden"><button class="ch-back" style="background:#e0975a;color:#1a1a1a;padding:9px 18px;border-radius:8px;font-weight:800;font-size:14px;">↩ לתפריט</button><h3>בחרו רמת קושי</h3><div class="ch-levels"><button data-level="easy">קל</button><button data-level="medium">בינוני</button><button data-level="hard">קשה</button></div></div>
      <div id="ch-learn-panel" class="ch-setup-panel ch-tutorial-panel ch-hidden"><div class="ch-lesson-count" id="ch-lesson-count"></div><h3 id="ch-lesson-title"></h3><p id="ch-lesson-text"></p><div id="ch-tutorial-board" class="ch-tutorial-board"></div><div class="ch-lesson-controls"><button id="ch-lesson-menu" class="ch-secondary" style="background:#e0975a;color:#1a1a1a;font-weight:800;">↩ לתפריט</button><button id="ch-lesson-prev" class="ch-secondary">הקודם</button><button id="ch-lesson-next" class="ch-primary">הבא</button></div></div>
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

  const LESSONS=[
   {he:['המלך ומטרת המשחק','המלך זז משבצת אחת בלבד לכל כיוון: קדימה, אחורה, לצדדים או באלכסון. כאשר מאיימים עליו הוא בשח. אם אין דרך בטוחה לברוח ואי אפשר לחסום או ללכוד את התוקף — זה מט.'],en:['The king and the goal','The king moves one square in any direction: forward, backward, sideways, or diagonally. If it is attacked with no safe escape, block, or capture — it is checkmate.'],pieces:[[7,4,'w','k'],[0,4,'b','k']],hints:[[6,3],[6,4],[6,5],[7,3],[7,5]],focus:[[7,4]]},
   {he:['איך החייל זז','החייל מתקדם משבצת אחת קדימה. במהלך הראשון שלו הוא יכול להתקדם שתי משבצות.'],en:['How the pawn moves','A pawn moves one square forward. On its first move it may move two.'],pieces:[[6,4,'w','p']],hints:[[5,4],[4,4]],focus:[[6,4]],target:[4,4]},
   {he:['איך החייל אוכל','החייל זז ישר קדימה, אבל אוכל משבצת אחת באלכסון קדימה. כאן אפשר לאכול את הפרש או את הרץ.'],en:['How the pawn captures','A pawn moves straight forward, but captures one square diagonally forward. Here it may capture either piece.'],pieces:[[4,4,'w','p'],[3,3,'b','n'],[3,5,'b','b']],hints:[[3,3],[3,5]],focus:[[4,4]]},
   {he:['הכתרת חייל','כשחייל מגיע לשורה האחרונה בצד של היריב הוא מוכתר. אפשר להחליף אותו במלכה, צריח, רץ או פרש — בדרך כלל בוחרים מלכה.'],en:['Pawn promotion','When a pawn reaches the last rank on the opponent\u2019s side, it is promoted. Choose a queen, rook, bishop, or knight — usually a queen.'],pieces:[[1,4,'w','p']],hints:[[0,4]],focus:[[1,4]],target:[0,4],promotion:'q'},
   {he:['הצריח','הצריח נע בקו ישר למעלה, למטה ולצדדים — והוא יכול לעצור בכל משבצת פנויה בדרך.'],en:['The rook','A rook travels in straight lines and may stop on any clear square along the way.'],pieces:[[4,3,'w','r']],hints:[[0,3],[1,3],[2,3],[3,3],[5,3],[6,3],[7,3],[4,0],[4,1],[4,2],[4,4],[4,5],[4,6],[4,7]],focus:[[4,3]]},
   {he:['הרץ','הרץ נע באלכסון לכל מרחק פנוי. הוא נשאר תמיד על אותו צבע של משבצות ויכול לאכול כלי יריב שנמצא בדרכו.'],en:['The bishop','A bishop moves diagonally for any clear distance. It always stays on the same square color and may capture an enemy in its path.'],pieces:[[5,2,'w','b'],[2,5,'b','r']],hints:[[4,1],[3,0],[4,3],[3,4],[2,5],[6,1],[7,0],[6,3],[7,4]],focus:[[5,2]]},
   {he:['המלכה','המלכה משלבת את תנועת הצריח והרץ: היא נעה בקו ישר או באלכסון עד שכלי חוסם את הדרך. היא יכולה לאכול את הכלי החוסם, אבל לעולם לא לדלג מעליו.'],en:['The queen','The queen combines rook and bishop movement, moving until a piece blocks the path. It may capture that piece, but can never jump over it.'],pieces:[[4,3,'w','q'],[1,3,'b','r'],[4,7,'b','b']],hints:[[1,3],[2,3],[3,3],[5,3],[6,3],[7,3],[4,0],[4,1],[4,2],[4,4],[4,5],[4,6],[4,7],[0,7],[1,6],[2,5],[3,4],[3,2],[2,1],[1,0],[5,2],[6,1],[7,0],[5,4],[6,5],[7,6]],focus:[[4,3]]},
   {he:['הפרש','הפרש נע בצורת ר׳: שתי משבצות בכיוון אחד ואז אחת הצידה. הוא יכול לקפוץ מעל כלים ולאכול כלי יריב שנמצא במשבצת הנחיתה.'],en:['The knight','A knight moves in an L shape: two squares one way and one sideways. It can jump over pieces and capture an enemy on its landing square.'],pieces:[[4,4,'w','n'],[2,5,'b','b'],[5,2,'b','r']],hints:[[2,3],[2,5],[3,2],[3,6],[5,2],[5,6],[6,3],[6,5]],focus:[[4,4]]},
   {he:['שח ומט','כשהמלך מותקף הוא בשח. אם אין מהלך חוקי שמציל אותו — זה מט והמשחק נגמר.'],en:['Checkmate','When a king is attacked it is in check. If no legal move saves it, the game ends.'],pieces:[[0,7,'b','k'],[1,6,'w','q'],[2,5,'w','k']],focus:[[0,7]]}
  ];
  const TASKS={he:[['לחץ על המלך הלבן המסומן.','בחר אחת מהנקודות והזז את המלך משבצת אחת לכל כיוון.'],['לחץ על החייל המסומן.','זה המהלך הראשון שלו: הזז אותו שתי משבצות ישר קדימה בעזרת הנקודות.'],['לחץ על החייל הלבן.','בחר בעזרת הנקודות ואכול את הפרש או את הרץ באלכסון קדימה.'],['לחץ על החייל שנמצא ליד סוף הלוח.','הזז אותו לשורה האחרונה ובחר כלי להכתרה.'],['לחץ על הצריח המסומן.','בחר נקודה והזז את הצריח בקו ישר.'],['לחץ על הרץ המסומן.','הזז את הרץ באלכסון. אפשר גם לאכול את הצריח השחור.'],['לחץ על המלכה המסומנת.','הזז אותה בקו ישר או באלכסון. אפשר לאכול את אחד הכלים השחורים.'],['לחץ על הפרש המסומן.','הזז אותו שתי משבצות למעלה ואחת ימינה.'],null],en:[['Click the highlighted white king.','Use the dots to move the king one square in any direction.'],['Click the highlighted pawn.','This is its first move: move it two squares straight forward using the dots.'],['Click the white pawn.','Use the dots to capture either piece diagonally.'],['Click the pawn near the end.','Move it to the last rank and choose a promotion piece.'],['Click the highlighted rook.','Choose a dot and move it in a straight line.'],['Click the highlighted bishop.','Move it diagonally. You may also capture the black rook.'],['Click the highlighted queen.','Move straight or diagonally. You may capture either black piece.'],['Click the highlighted knight.','Move it two squares up and one right.'],null]};
  const WORDS={he:{turn:'תור ה',white:'לבן',black:'שחור',move:'מהלך',check:' — שח',sure:'המשחק עדיין בעיצומו. לצאת לתפריט?',mateB:'השחור ניצח במט',mateW:'הלבן ניצח במט',stale:'תיקו — פט',insuf:'תיקו — אין מספיק כלים למט',saved:'משחק שמור',vs:'נגד המחשב',two:'שני שחקנים'},en:{turn:'Turn: ',white:'White',black:'Black',move:'Move',check:' — Check',sure:'The game is still in progress. Return to menu?',mateB:'Black wins by checkmate',mateW:'White wins by checkmate',stale:'Draw — stalemate',insuf:'Draw — insufficient material',saved:'Saved game',vs:'Computer',two:'Two players'}};
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
  function clone(x){ return JSON.parse(JSON.stringify(x)); }
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
    n.board[m.r][m.c]=p;n.board[from.r][from.c]=null;
    if(m.special==='ep'){const cr=m.r+(p.c==='w'?1:-1);n.captured.push(n.board[cr][m.c]);n.board[cr][m.c]=null;}
    if(m.special==='castleK'){n.board[m.r][5]=n.board[m.r][7];n.board[m.r][7]=null;}
    if(m.special==='castleQ'){n.board[m.r][3]=n.board[m.r][0];n.board[m.r][0]=null;}
    if(p.t==='p'&&(m.r===0||m.r===7))p.t=promo;
    if(p.t==='k'){n.castling[p.c+'k']=0;n.castling[p.c+'q']=0;}
    if(p.t==='r'){if(from.r===7&&from.c===0)n.castling.wq=0;if(from.r===7&&from.c===7)n.castling.wk=0;if(from.r===0&&from.c===0)n.castling.bq=0;if(from.r===0&&from.c===7)n.castling.bk=0;}
    if(target?.t==='r'){if(m.r===7&&m.c===0)n.castling.wq=0;if(m.r===7&&m.c===7)n.castling.wk=0;if(m.r===0&&m.c===0)n.castling.bq=0;if(m.r===0&&m.c===7)n.castling.bk=0;}
    n.ep=m.special==='double'?{r:(from.r+m.r)/2,c:m.c}:null;n.last={from,to:{r:m.r,c:m.c}};n.turn=p.c==='w'?'b':'w';if(n.turn==='w')n.full++;return n;
  }
  function validMoves(s,r,c){const p=s.board[r][c];if(!p)return[];return rawMoves(s,r,c).filter(m=>!isCheck(applyMove(s,{r,c},m),p.c));}
  function allMoves(s,color){const a=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(s.board[r][c]?.c===color)for(const m of validMoves(s,r,c))a.push(m);return a;}
  function insufficient(){const pieces=state.board.flat().filter(p=>p&&p.t!=='k');return pieces.length===0||(pieces.length===1&&['b','n'].includes(pieces[0].t));}
  function finishTurn(){
    const moves=allMoves(state,state.turn),check=isCheck(state,state.turn);
    if(!moves.length){state.over=true;state.result=check?(state.turn==='w'?tr('mateB'):tr('mateW')):tr('stale');}
    else if(insufficient()){state.over=true;state.result=tr('insuf');}
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
    $$('.ch-levels button').forEach((b,i)=>b.textContent=(en?['Easy','Medium','Hard']:['קל','בינוני','קשה'])[i]);
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

  // ---------- מחשב ----------
  function computerMove(){
    if(!alive||state.over||state.turn!=='b')return;
    thinking=true;render();
    const choices=[];
    for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(state.board[r][c]?.c==='b')for(const m of validMoves(state,r,c)){
      let score=state.board[m.r][m.c]?VALUES[state.board[m.r][m.c].t]*10:0;
      const next=applyMove(state,{r,c},m);
      if(isCheck(next,'w'))score+=3;
      if(level==='hard'){
        for(let rr=0;rr<8;rr++)for(let cc=0;cc<8;cc++)if(next.board[rr][cc]?.c==='w')for(const reply of validMoves(next,rr,cc))
          score-=next.board[reply.r][reply.c]?VALUES[next.board[reply.r][reply.c].t]*6:0;
      }
      choices.push({from:{r,c},m,score:score+Math.random()*(level==='easy'?30:level==='medium'?8:2)});
    }
    choices.sort((a,b)=>b.score-a.score);
    thinking=false;
    if(choices[0])commit(choices[0].from,choices[0].m);
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
      else if(msg.type==='restart'){ newGame(); }
    });
    conn.on('close', ()=>{ if(mode==='remote') rStatus('היריב התנתק. 😕'); });
  }
  function startRemoteGame(host){
    mode='remote'; myColor=host?'w':'b'; LS.del('saved'); newGame();
    $('#ch-mode-label').textContent = 'מרחוק · ' + (host?'אתה הלבן ⚪':'אתה השחור ⚫');
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
      conn.on('open', ()=>{ setupConn(conn); startRemoteGame(true); });
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
      let connected=false;
      conn.on('open', ()=>{ connected=true; setupConn(conn); startRemoteGame(false); });
      conn.on('error', ()=>rStatus('לא נמצא חדר עם הקוד הזה. 🤔'));
      setTimeout(()=>{ if(!connected&&mode!=='remote') rStatus('לא הצלחתי להתחבר. בדוק את הקוד ונסה שוב.'); },8000);
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
    const names=currentLang==='en'?{easy:'Easy',medium:'Medium',hard:'Hard'}:{easy:'קל',medium:'בינוני',hard:'קשה'};
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
  applyLanguage(LS.get('language')||'he');

  // ---------- ניקוי ----------
  return function cleanup(){
    alive=false;
    closeNet();
    saveGame();
    window.removeEventListener('beforeunload',onUnload);
    if(audioCtx){ try{ audioCtx.close(); }catch(e){} audioCtx=null; }
    shell.querySelectorAll('.ch-flying-piece,.ch-tutorial-flying').forEach(x=>x.remove());
    root.innerHTML='';
  };
}
