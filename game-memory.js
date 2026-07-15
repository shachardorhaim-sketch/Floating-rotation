// ============================================
//  משחק: MEMORY MATCH
// ============================================

function mountMemory(root){
  const emojis=['🍎','🚀','🐸','🎸','⚽','🌈','👾','🍕'];
  let deck=[...emojis,...emojis].sort(()=>Math.random()-0.5).map((e,i)=>({e,i,up:false,done:false}));
  let first=null,lock=false,matched=0;
  root.innerHTML='<div style="text-align:center"><div id="mi" style="color:#8ba0b5;margin-bottom:18px;font-size:18px">מצא את כל 8 הזוגות</div><div id="mb" style="display:grid;grid-template-columns:repeat(4,100px);gap:14px;justify-content:center"></div></div>';
  const board=root.querySelector('#mb'),info=root.querySelector('#mi');
  function render(){ board.innerHTML='';
    deck.forEach(c=>{ const el=document.createElement('button');
      el.style.cssText='width:100px;height:100px;font-size:42px;border-radius:12px;cursor:pointer;border:2px solid #2a3b4f;background:'+((c.up||c.done)?'#1e2c3d':'#172230')+';color:'+(c.done?'#4fd1c5':'#e8eef5');
      el.textContent=(c.up||c.done)?c.e:'❓'; el.onclick=()=>flip(c); board.appendChild(el); }); }
  function flip(c){ if(lock||c.up||c.done)return; c.up=true;render(); if(!first){first=c;return;} lock=true;
    if(first.e===c.e){ first.done=c.done=true;matched++;first=null;lock=false;render(); if(matched===8)info.textContent='🎉 ניצחת! מצאת את כל הזוגות'; }
    else setTimeout(()=>{first.up=c.up=false;first=null;lock=false;render();},700); }
  render();
  return ()=>{};
}
