// ============================================
//  משחק: STAR CATCHER
//  הקובץ של רובין — כאן הוא עובד!
// ============================================

function mountCatch(root){
  root.innerHTML='<canvas width="640" height="440" style="border:2px solid #2a3b4f;border-radius:8px;background:#0d1b2a;width:100%;max-width:900px;height:auto"></canvas>';
  const cv=root.querySelector('canvas'),ctx=cv.getContext('2d'),W=cv.width,H=cv.height;
  let px=W/2,stars=[],score=0,miss=0,f=0,raf,running=true; const L={l:false,r:false};
  const kd=e=>{ if(e.code==='ArrowLeft')L.l=true; if(e.code==='ArrowRight')L.r=true; };
  const ku=e=>{ if(e.code==='ArrowLeft')L.l=false; if(e.code==='ArrowRight')L.r=false; };
  document.addEventListener('keydown',kd);document.addEventListener('keyup',ku);
  cv.addEventListener('pointermove',e=>{ const r=cv.getBoundingClientRect(); px=(e.clientX-r.left)*(W/r.width); });
  function loop(){ if(!running)return; raf=requestAnimationFrame(loop); f++;
    if(L.l)px-=7; if(L.r)px+=7; px=Math.max(40,Math.min(W-40,px));
    ctx.clearRect(0,0,W,H); if(f%35===0)stars.push({x:30+Math.random()*(W-60),y:-20,s:2.5+Math.random()*2});
    ctx.font='26px serif';
    for(let i=stars.length-1;i>=0;i--){ const s=stars[i];s.y+=s.s;ctx.fillText('⭐',s.x-13,s.y);
      if(s.y>H-40&&Math.abs(s.x-px)<45){score++;stars.splice(i,1);} else if(s.y>H){miss++;stars.splice(i,1);} }
    ctx.fillStyle='#ffd166';ctx.fillRect(px-40,H-26,80,16);
    ctx.fillStyle='#e8eef5';ctx.font='bold 16px monospace';ctx.fillText('כוכבים: '+score,16,26);
    ctx.fillStyle='#d9856b';ctx.fillText('פספוסים: '+miss+'/10',16,48);
    if(miss>=10){ ctx.fillStyle='rgba(8,12,18,.85)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#ffd166';ctx.font='bold 24px monospace';ctx.textAlign='center';ctx.fillText('הסתיים! תפסת '+score+' כוכבים',W/2,H/2);ctx.textAlign='left';cancelAnimationFrame(raf); } }
  loop();
  return ()=>{ running=false;cancelAnimationFrame(raf);document.removeEventListener('keydown',kd);document.removeEventListener('keyup',ku); };
}
