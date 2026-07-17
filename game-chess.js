// ============================================
//  משחק: CHESS — שחמט
//  נגד המחשב (3 רמות) או שני שחקנים
// ============================================

function mountChess(root){
  const isMobile = window.innerWidth < 700;
  const CW = isMobile ? 420 : 760, CH = isMobile ? 560 : 620;
  root.innerHTML='<canvas width="'+CW+'" height="'+CH+'" style="display:block;width:100%;max-width:'+CW+'px;height:auto;margin:auto;border-radius:18px;touch-action:none;background:#171917"></canvas>';
  const cv=root.querySelector('canvas'),ctx=cv.getContext('2d');
  let running=true,raf=0,last=performance.now(),screen='menu',mode='ai',level=1,turn='w',selected=null,legal=[],over='',thinking=0;
  const G={w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}},V={p:1,n:3,b:3,r:5,q:9,k:0};
  const SQ = isMobile ? 50 : 66;
  const BOARD = SQ*8;
  const OX = Math.round((CW-BOARD)/2);
  const OY = isMobile ? 110 : 65;
  let board=[];

  function reset(){
    const back=['r','n','b','q','k','b','n','r'];
    board=Array.from({length:8},()=>Array(8).fill(null));
    for(let c=0;c<8;c++){
      board[0][c]={c:'b',t:back[c]};
      board[1][c]={c:'b',t:'p'};
      board[6][c]={c:'w',t:'p'};
      board[7][c]={c:'w',t:back[c]};
    }
    turn='w';selected=null;legal=[];over='';thinking=0;
  }

  function inside(r,c){return r>=0&&r<8&&c>=0&&c<8;}
  function clone(b){return b.map(row=>row.map(p=>p?{c:p.c,t:p.t}:null));}

  function raw(b,r,c,attack){
    const p=b[r][c];
    if(!p)return[];
    const out=[],add=(rr,cc)=>{if(inside(rr,cc)&&(!b[rr][cc]||b[rr][cc].c!==p.c))out.push([rr,cc]);};
    if(p.t==='p'){
      const d=p.c==='w'?-1:1,start=p.c==='w'?6:1;
      if(!attack&&!b[r+d]?.[c]){add(r+d,c);if(r===start&&!b[r+2*d][c])add(r+2*d,c);}
      for(const dc of[-1,1]){
        if(attack&&inside(r+d,c+dc))out.push([r+d,c+dc]);
        else if(b[r+d]?.[c+dc]&&b[r+d][c+dc].c!==p.c)add(r+d,c+dc);
      }
    }
    else if(p.t==='n')for(const[dR,dC]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dR,c+dC);
    else if(p.t==='k')for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc)add(r+dr,c+dc);
    else{
      const dirs=p.t==='r'?[[1,0],[-1,0],[0,1],[0,-1]]:p.t==='b'?[[1,1],[1,-1],[-1,1],[-1,-1]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for(const[dr,dc]of dirs){
        let rr=r+dr,cc=c+dc;
        while(inside(rr,cc)){
          if(!b[rr][cc])out.push([rr,cc]);
          else{if(b[rr][cc].c!==p.c)out.push([rr,cc]);break;}
          rr+=dr;cc+=dc;
        }
      }
    }
    return out;
  }

  function attacked(b,r,c,by){
    for(let rr=0;rr<8;rr++)for(let cc=0;cc<8;cc++)
      if(b[rr][cc]?.c===by&&raw(b,rr,cc,true).some(m=>m[0]===r&&m[1]===c))return true;
    return false;
  }

  function check(b,color){
    for(let r=0;r<8;r++)for(let c=0;c<8;c++)
      if(b[r][c]?.c===color&&b[r][c].t==='k')return attacked(b,r,c,color==='w'?'b':'w');
    return false;
  }

  function simulate(b,fr,fc,tr,tc){
    const n=clone(b),p=n[fr][fc];
    n[tr][tc]=p;n[fr][fc]=null;
    if(p.t==='p'&&(tr===0||tr===7))p.t='q';
    return n;
  }

  function moves(b,r,c){
    const p=b[r][c];
    return p?raw(b,r,c,false).filter(m=>!check(simulate(b,r,c,m[0],m[1]),p.c)):[];
  }

  function all(color,b=board){
    const out=[];
    for(let r=0;r<8;r++)for(let c=0;c<8;c++)
      if(b[r][c]?.c===color)for(const m of moves(b,r,c))out.push({fr:r,fc:c,tr:m[0],tc:m[1]});
    return out;
  }

  function finish(){
    const a=all(turn);
    if(!a.length)over=check(board,turn)?(turn==='w'?'BLACK WINS':'WHITE WINS'):'DRAW';
  }

  function move(m){
    board=simulate(board,m.fr,m.fc,m.tr,m.tc);
    turn=turn==='w'?'b':'w';
    selected=null;legal=[];
    finish();
    if(!over&&mode==='ai'&&turn==='b'){thinking=.38;}
  }

  function aiMove(){
    const a=all('b');
    if(!a.length)return;
    for(const m of a){
      const target=board[m.tr][m.tc];
      m.score=(target?V[target.t]*12:0)+Math.random()*(level===0?35:level===1?8:2);
      if(level===2){
        const n=simulate(board,m.fr,m.fc,m.tr,m.tc);
        if(check(n,'w'))m.score+=5;
        for(const reply of all('w',n)){
          const t=n[reply.tr][reply.tc];
          if(t)m.score-=V[t.t]*4;
        }
      }
    }
    a.sort((x,y)=>y.score-x.score);
    move(a[0]);
  }

  function click(x,y){
    if(screen==='menu'){
      if(y>260&&y<315){mode='ai';screen='level';}
      else if(y>330&&y<385){mode='local';screen='game';reset();}
      return;
    }
    if(screen==='level'){
      if(y>CH*0.39&&y<CH*0.39+60){level=0;screen='game';reset();}
      else if(y>CH*0.51&&y<CH*0.51+60){level=1;screen='game';reset();}
      else if(y>CH*0.63&&y<CH*0.63+60){level=2;screen='game';reset();}
      return;
    }
    if(screen!=='game')return;
    if(over){if(y>CH*0.55){screen='menu';reset();}return;}
    if(x>CW-110&&y<55){screen='menu';reset();return;}
    if(thinking||(mode==='ai'&&turn==='b'))return;
    const size=SQ,ox=OX,oy=OY,c=Math.floor((x-ox)/size),r=Math.floor((y-oy)/size);
    if(!inside(r,c))return;
    const p=board[r][c];
    if(selected){
      const m=legal.find(q=>q[0]===r&&q[1]===c);
      if(m){move({fr:selected[0],fc:selected[1],tr:r,tc:c});return;}
    }
    if(p?.c===turn){selected=[r,c];legal=moves(board,r,c);}
    else{selected=null;legal=[];}
  }

  function button(x,y,w,h,text,accent){
    ctx.fillStyle=accent?'#f3a84b':'#292d29';
    ctx.beginPath();ctx.roundRect(x,y,w,h,12);ctx.fill();
    ctx.strokeStyle=accent?'#ffd18c':'#4b504a';ctx.stroke();
    ctx.fillStyle=accent?'#20130d':'#f4f0e8';
    ctx.font='700 19px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(text,x+w/2,y+h/2);
  }

  function drawMenu(){
    ctx.fillStyle='#171917';ctx.fillRect(0,0,CW,CH);
    ctx.textAlign='center';
    ctx.fillStyle='#f3a84b';ctx.font='70px serif';ctx.fillText('♞',CW/2,CH*0.19);
    ctx.fillStyle='#f4f0e8';ctx.font='800 42px system-ui';ctx.fillText('CHESS',CW/2,CH*0.29);
    ctx.fillStyle='#9da199';ctx.font='17px system-ui';ctx.fillText('Choose how to play',CW/2,CH*0.35);
    button(CW/2-150,CH*0.42,300,55,'PLAY COMPUTER',true);
    button(CW/2-150,CH*0.53,300,55,'TWO PLAYERS',false);
  }

  function drawLevel(){
    ctx.fillStyle='#171917';ctx.fillRect(0,0,CW,CH);
    ctx.textAlign='center';
    ctx.fillStyle='#f4f0e8';ctx.font='800 36px system-ui';ctx.fillText('CHOOSE DIFFICULTY',CW/2,CH*0.28);
    button(CW/2-135,CH*0.39,270,60,'EASY',false);
    button(CW/2-135,CH*0.51,270,60,'MEDIUM',true);
    button(CW/2-135,CH*0.63,270,60,'HARD',false);
  }

  function drawGame(){
    ctx.fillStyle='#171917';ctx.fillRect(0,0,CW,CH);
    ctx.textBaseline='middle';ctx.textAlign='left';
    ctx.fillStyle='#f4f0e8';ctx.font='700 19px system-ui';
    ctx.font=(isMobile?'700 15px ':'700 19px ')+'system-ui';ctx.fillText(turn==='w'?'WHITE TO MOVE':'BLACK TO MOVE',isMobile?14:25,30);
    ctx.textAlign='right';ctx.fillStyle='#f3a84b';ctx.fillText('MENU',CW-25,30);
    const size=SQ,ox=OX,oy=OY;
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){
      const x=ox+c*size,y=oy+r*size,dark=(r+c)%2;
      ctx.fillStyle=dark?'#9b6037':'#efd7aa';
      ctx.fillRect(x,y,size,size);
      if(selected?.[0]===r&&selected[1]===c){
        ctx.strokeStyle='#f3a84b';ctx.lineWidth=5;
        ctx.strokeRect(x+3,y+3,size-6,size-6);
      }
      if(legal.some(m=>m[0]===r&&m[1]===c)){
        ctx.fillStyle='#f3a84b';
        ctx.beginPath();ctx.arc(x+size/2,y+size/2,board[r][c]?size*0.39:size*0.12,0,Math.PI*2);
        board[r][c]?ctx.stroke():ctx.fill();
      }
      const p=board[r][c];
      if(p){
        ctx.textAlign='center';
        ctx.font=Math.round(SQ*0.79)+'px "Arial Unicode MS","Segoe UI Symbol"';
        ctx.fillStyle=p.c==='w'?'#fff8e8':'#15120f';
        ctx.strokeStyle=p.c==='w'?'#5c412d':'#a9937e';
        ctx.lineWidth=1.3;
        ctx.strokeText(G[p.c][p.t],x+size/2,y+size/2+2);
        ctx.fillText(G[p.c][p.t],x+size/2,y+size/2+2);
      }
    }
    if(thinking){
      ctx.textAlign='center';ctx.fillStyle='#f3a84b';ctx.font='700 16px system-ui';
      ctx.fillText('COMPUTER IS THINKING…',CW/2,CH-14);
    }
    if(over){
      ctx.fillStyle='#111d';ctx.fillRect(OX,CH*0.40,BOARD,110);
      ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='800 34px system-ui';
      ctx.fillText(over,CW/2,CH*0.46);
      ctx.fillStyle='#f3a84b';ctx.font='700 16px system-ui';
      ctx.fillText('CLICK BELOW TO RETURN TO MENU',CW/2,CH*0.53);
    }
  }

  function loop(now){
    if(!running)return;
    const dt=Math.min(.05,(now-last)/1000);
    last=now;
    if(thinking){thinking-=dt;if(thinking<=0){thinking=0;aiMove();}}
    if(screen==='menu')drawMenu();
    else if(screen==='level')drawLevel();
    else drawGame();
    raf=requestAnimationFrame(loop);
  }

  function point(e){
    const r=cv.getBoundingClientRect();
    return{x:(e.clientX-r.left)*CW/r.width,y:(e.clientY-r.top)*CH/r.height};
  }
  function onPointer(e){const p=point(e);click(p.x,p.y);}

  cv.addEventListener('pointerdown',onPointer);
  reset();
  raf=requestAnimationFrame(loop);

  return()=>{
    running=false;
    cancelAnimationFrame(raf);
    cv.removeEventListener('pointerdown',onPointer);
  };
}
