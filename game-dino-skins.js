// ============================================
//  Dino Runner: הדמויות שקונים בחנות
//  להוספת דמות: שורה אחת ב-DINO_SKIN_ROWS. ה-id לא משתנה לעולם, כי הוא נשמר אצל השחקן.
//  דמות היא רק מראה: הקפיצה ואזורי הפגיעה זהים לכולן.
// ============================================

function dkP(c,pts,fill,lw){
  c.beginPath(); c.moveTo(pts[0],pts[1]);
  for (let i=2;i<pts.length;i+=2) c.lineTo(pts[i],pts[i+1]);
  c.closePath();
  if (lw!==0) { c.lineWidth=lw||1.2; c.stroke(); }
  if (fill) { c.fillStyle=fill; c.fill(); }
}
function dkE(c,x,y,rx,ry,fill,lw,rot){
  c.beginPath(); c.ellipse(x,y,rx,ry,rot||0,0,7);
  if (lw!==0) { c.lineWidth=lw||1.2; c.stroke(); }
  if (fill) { c.fillStyle=fill; c.fill(); }
}
function dkS(c,pts,col,lw){
  c.beginPath(); c.moveTo(pts[0],pts[1]);
  for (let i=2;i<pts.length;i+=2) c.lineTo(pts[i],pts[i+1]);
  const keep=c.strokeStyle; c.strokeStyle=col; c.lineWidth=lw||1; c.stroke(); c.strokeStyle=keep;
}
function dkDome(c,x,y,rx,ry,fill){
  c.beginPath(); c.ellipse(x,y,rx,ry,0,Math.PI,0); c.closePath();
  c.lineWidth=1.2; c.stroke(); c.fillStyle=fill; c.fill();
}
function dkRing(c,x,y,rx,ry,col,lw){
  const keep=c.strokeStyle; c.strokeStyle=col; c.lineWidth=lw; c.beginPath(); c.ellipse(x,y,rx,ry,0,0,7); c.stroke(); c.strokeStyle=keep;
}
function dkScarf(c,col,t){
  const w=Math.sin(t*0.2)*2;
  dkP(c,[-3,-9.5,3,-9.5,3,9.5,-3,9.5],col);
  dkP(c,[-2,-9,2,-9,3,-20+w,-5,-21+w],col);
}

// אביזרים: הקואורדינטות הן של הראש, האף ב-x=33 וקצה הגולגולת ב-y=-13.
// hat מסתיר את לוחות הראש. ph: b מאחורי הראש, u מתחת לעין, j על הלסת, n על הצוואר. בלי ph: מעל הכול.
const DINO_GEAR = {
  crown:{hat:1,d(c){ dkP(c,[-4,-11.5,-6.5,-23,-1,-17.5,4,-26,9,-17.5,14.5,-23,12.5,-11],'#ffd21a'); dkE(c,4,-14.5,1.7,1.7,'#e0142a',.5); dkE(c,-1.5,-14,1.1,1.1,'#2f7fff',.4); dkE(c,9.5,-14,1.1,1.1,'#2fbf5a',.4); }},
  topHat:{hat:1,d(c){ dkE(c,4,-13,14,2.8,'#1d1d26'); dkP(c,[-4.5,-13.5,-4.5,-31,12.5,-31,12.5,-13.5],'#1d1d26'); dkP(c,[-4.5,-16.5,-4.5,-20.5,12.5,-20.5,12.5,-16.5],'#c0392b',.5); }},
  wizardHat:{hat:1,d(c){ dkP(c,[-11,-10.5,19,-12,11,-24,4,-31,-8,-40,-5,-28,-8,-20],'#3f2f9a'); dkE(c,4,-11,17,3,'#2f2380'); dkE(c,2,-19,1.3,1.3,'#ffd21a',0); dkE(c,7,-16,1,1,'#ffd21a',0); dkE(c,-2,-27,1,1,'#ffd21a',0); }},
  cowboyHat:{hat:1,d(c){ dkE(c,4,-12.5,20,3.4,'#8a5a2a',1.2,-.04); dkP(c,[-6,-13,-5,-24,-1,-26.5,4,-24,9,-26.5,13,-24,14,-13],'#8a5a2a'); dkP(c,[-5.6,-15,-5.4,-18,13.6,-18,13.8,-15],'#3a2410',.4); }},
  vikingHelm:{hat:1,d(c){ dkP(c,[-5,-11,-13,-17,-15,-29,-9,-23,-1,-15],'#f2e8cf'); dkDome(c,4,-10.5,12,9.5,'#9aa7b8'); dkP(c,[10,-16,19,-20,21,-32,14,-26,7,-19],'#f2e8cf'); dkP(c,[-8,-10.5,16,-10.5,16,-8,-8,-8],'#c9962f',.7); }},
  knightHelm:{hat:1,d(c){ dkP(c,[1,-17,-5,-26,-17,-25,-22,-13,-13,-19,-5,-16],'#c0392b'); dkP(c,[-10,-3,-9,-14,1,-18.5,12,-16.5,22,-12,28,-8.5,28,-1.5,15,.5,1,3,-8,5],'#aeb8c4'); dkS(c,[9,-8.5,25,-6.5],'#12161c',1.8); for (let x=19;x<27;x+=2.6) dkE(c,x,-2.6,.6,.6,'#12161c',0); }},
  pirateHat:{hat:1,d(c){ dkP(c,[-15,-11,-8,-20,4,-25,15,-20,23,-11,11,-14,-2,-14],'#1d1d26'); dkS(c,[-15,-11,-2,-14,11,-14,23,-11],'#d9b23a',1); dkE(c,4,-18.5,2.5,2.2,'#fff',0); dkE(c,3.2,-18.8,.5,.5,'#111',0); dkE(c,4.8,-18.8,.5,.5,'#111',0); }},
  kabuto:{hat:1,d(c){ dkP(c,[-10,-9,-15,-3,-7,-2],'#7a1010'); dkDome(c,4,-10,12.5,10,'#7a1010'); dkP(c,[9,-18,11,-31,15,-22,21,-31,19,-17],'#e8b923'); dkP(c,[-9,-10.5,17,-10.5,17,-8,-9,-8],'#2a0f0f',.5); }},
  ninjaBand:{hat:1,d(c,C,t){ const w=Math.sin(t*0.25)*2; dkP(c,[-7,-11.5,-15,-15+w,-23,-11+w,-16,-9.5+w,-7,-9],'#c0142a'); dkP(c,[-6,-12.5,16,-12,17,-9.6,-7,-9],'#c0142a',.7); }},
  chefHat:{hat:1,d(c){ const pf=[[-4,-22,5.5],[4,-25,6.5],[12,-22,5.5]]; pf.forEach(p=>dkE(c,p[0],p[1],p[2],p[2],null,1.2)); dkP(c,[-6,-12,14,-12,14,-18,-6,-18],'#fff'); pf.forEach(p=>dkE(c,p[0],p[1],p[2],p[2],'#fff',0)); }},
  santaHat:{hat:1,d(c){ dkP(c,[-9,-11,17,-12,8,-23,-2,-26,-13,-20,-16,-13],'#d9261c'); dkE(c,-16.5,-11.5,3.2,3.2,'#fff'); dkP(c,[-10,-9,18,-10,18,-13.5,-10,-13],'#fff'); }},
  partyHat:{hat:1,d(c){ dkP(c,[-3,-12.5,13,-12.5,5,-31],'#ff5fa2'); dkS(c,[0,-17,10,-17],'#ffd21a',1.4); dkS(c,[2,-23,8,-23],'#4dc9ff',1.4); dkE(c,5,-32,2.4,2.4,'#ffd21a'); }},
  halo:{d(c){ dkRing(c,6,-25,11,3.2,'#ffd21a',2.2); }},
  devilHorns:{hat:1,d(c){ dkP(c,[-2,-12,-6,-23,4,-14],'#2a0a0a'); dkP(c,[8,-14,12,-25,15,-11],'#2a0a0a'); }},
  catEars:{hat:1,d(c,C){ dkP(c,[-6,-10,-7,-22,3,-14],C.green); dkP(c,[-4.5,-11.5,-5.5,-18.5,.5,-13.5],'#ffb3c7',0); dkP(c,[6,-14,12,-24,15,-10],C.green); dkP(c,[8.5,-14,11.5,-20.5,13.5,-11.5],'#ffb3c7',0); }},
  bunnyEars:{hat:1,ph:'b',d(c,C,t){ const w=Math.sin(t*0.12)*.06; dkE(c,-4,-25,3.8,13,C.green,1.2,-.3+w); dkE(c,-4,-25,2,9,'#ffb3c7',0,-.3+w); dkE(c,4,-26,3.8,13,C.green,1.2,-.1+w); dkE(c,4,-26,2,9,'#ffb3c7',0,-.1+w); }},
  uniHorn:{hat:1,d(c){ dkP(c,[11,-12,22,-33,16,-10],'#ffd21a'); dkS(c,[13,-17,17.5,-16],'#d99a12',.9); dkS(c,[15,-22,19,-21],'#d99a12',.9); dkS(c,[17,-27,20.5,-26],'#d99a12',.9); }},
  mane:{ph:'b',d(c){ [['#ff5f7e',-1,-14,5,3.4,.3],['#ffb13d',-7,-10,5.5,3.6,.8],['#ffe14d',-11,-3,5.5,3.6,1.2],['#57d98a',-11,4,5.5,3.6,1.5],['#4dc9ff',-8,10,5,3.4,1.9]].forEach(m=>dkE(c,m[1],m[2],m[3],m[4],m[0],1.1,m[5])); }},
  mohawk:{hat:1,d(c,C){ dkP(c,[-9,-7,-13,-15,-7,-14,-8,-24,-2,-17,1,-28,6,-17,11,-24,13,-12.5],C.blue); }},
  bubble:{hat:1,d(c,C){ c.save(); c.globalAlpha=.24; dkE(c,12,-4,25,25,'#bfe9ff',0); c.restore(); dkRing(c,12,-4,25,25,'#e8eef5',1.9); c.beginPath(); c.arc(12,-4,20,3.5,4.4); const k=c.strokeStyle; c.strokeStyle='rgba(255,255,255,.85)'; c.lineWidth=1.6; c.stroke(); c.strokeStyle=k; }},
  sunglasses:{d(c){ dkS(c,[-6,-7,3,-8],'#111',1.2); dkP(c,[2.5,-10.5,15,-9,14.5,-3.6,7.5,-3,3,-5.5],'#0e0e12',.8); dkS(c,[5,-8.6,9,-8],'rgba(255,255,255,.7)',.9); }},
  eyePatch:{d(c){ dkS(c,[1,-12.5,15,-2],'#111',1); dkE(c,8,-7.2,5,4.6,'#0e0e12',.5); }},
  monocle:{d(c){ dkRing(c,7.5,-7.2,5.2,4.8,'#d9b23a',1.3); dkS(c,[11,-3.4,12,5],'#d9b23a',.7); }},
  mustache:{d(c){ dkE(c,23.5,-.4,5.2,1.7,'#2a1a10',.4,-.3); dkE(c,30,-.5,4,1.6,'#2a1a10',.4,.25); }},
  roundGlasses:{d(c){ dkRing(c,7.5,-7.2,5.4,5,'#222',1.2); dkS(c,[2,-8,-6,-7],'#222',1); dkS(c,[13,-8,17,-8.6],'#222',1); }},
  goggles:{d(c){ dkS(c,[-7,-10,2,-11],'#3a2410',1.8); dkE(c,7.5,-8,6,5.4,'#9ad8ff',0); dkRing(c,7.5,-8,6,5.4,'#b58a3a',1.7); dkS(c,[5,-10.5,8,-10],'rgba(255,255,255,.8)',.9); }},
  headphones:{hat:1,d(c){ const k=c.strokeStyle; c.strokeStyle='#15171c'; c.lineWidth=2.4; c.beginPath(); c.ellipse(0,-6,10,11,0,Math.PI*1.05,Math.PI*1.95); c.stroke(); c.strokeStyle=k; dkE(c,0,-3,4.6,6,'#22d3ee'); }},
  hardHat:{hat:1,d(c){ dkDome(c,4,-10.5,12.5,10,'#f6c21c'); dkP(c,[-9,-10.5,24,-10.5,26,-8,-9,-8],'#f6c21c'); dkS(c,[4,-20,4,-11],'#d99a12',1.4); }},
  fireHelmet:{hat:1,d(c){ dkP(c,[-20,-6,-8,-12,18,-12,19,-9.5,-8,-8],'#d9261c'); dkDome(c,4,-11,12,10,'#d9261c'); dkP(c,[9,-13,13,-24,19,-13],'#f6c21c'); }},
  policeCap:{hat:1,d(c){ dkP(c,[-9,-12,-7,-21,15,-22,19,-13],'#152e66'); dkP(c,[-6,-13,18,-13,18,-10,-6,-10],'#0c1c44',.6); dkP(c,[15,-10.5,27,-7.5,16,-8],'#0e0e12',.6); dkE(c,7,-16,2,2.4,'#ffd21a',.5); }},
  sailorCap:{hat:1,d(c){ dkP(c,[-9,-13,-7,-18.5,15,-18.5,17,-13],'#fff'); dkP(c,[-7,-13.5,16,-13.5,16,-10.5,-7,-10.5],'#1f55b3',.6); }},
  gradCap:{hat:1,d(c){ dkP(c,[-5,-12,14,-12,14,-16.5,-5,-16.5],'#2a2a33'); dkP(c,[-14,-17.5,5,-23,24,-17.5,5,-12.5],'#1d1d26'); dkS(c,[5,-17.5,18,-15,19,-8],'#ffd21a',1); dkE(c,19,-7,1.4,2.2,'#ffd21a',0); }},
  strawHat:{hat:1,d(c){ dkE(c,4,-12.5,19,3.2,'#e8c66a'); dkDome(c,4,-12.5,10.5,9,'#e8c66a'); dkP(c,[-6.4,-13,14.4,-13,14,-16,-6,-16],'#d9261c',.4); }},
  beret:{hat:1,d(c,C){ dkS(c,[3,-19.5,4,-22.5],C.line,1.4); dkE(c,3,-14.5,13,5,'#d9261c',1.2,-.15); }},
  beanie:{hat:1,d(c){ dkE(c,3,-22.5,3,3,'#e8e4d8'); dkDome(c,3,-10.5,11.5,11,'#c0392b'); dkP(c,[-9,-12,15,-12,15,-9,-9,-9],'#e8e4d8'); }},
  sweatband:{hat:1,d(c){ dkP(c,[-7,-12.5,17,-11.5,17.5,-8.6,-7.5,-9.5],'#fff'); dkS(c,[-7,-11,17,-10],'#d9261c',1); }},
  headMirror:{hat:1,d(c){ dkS(c,[-6,-9,18,-11],'#222',1.2); dkE(c,11,-13.5,4.4,4.4,'#d8e4f0',1); dkE(c,11,-13.5,1.2,1.2,'#222',0); }},
  wildHair:{hat:1,ph:'b',d(c){ dkP(c,[-8,-2,-16,-6,-11,-10,-18,-16,-9,-15,-11,-24,-3,-17,0,-26,4,-16,10,-24,11,-13],'#f2f4f7'); }},
  heroMask:{ph:'u',d(c,C){ dkP(c,[1,-11.5,16,-9,16,-3.5,7,-2.5,0,-6],C.blue,.7); }},
  clownWig:{hat:1,ph:'b',d(c){ [['#57d98a',-10,-1,5.5],['#ff4d4d',-8,-8,6.5],['#ffd21a',-3,-15,6.5],['#2fb0ff',5,-17,6.5]].forEach(p=>dkE(c,p[1],p[2],p[3],p[3],p[0])); }},
  clownNose:{d(c){ dkE(c,33.5,-6.5,3.8,3.8,'#e0142a'); dkE(c,32.5,-7.6,1,1,'rgba(255,255,255,.8)',0); }},
  carrot:{d(c){ dkP(c,[31,-8,46,-5,31,-3],'#f28a1c'); }},
  stem:{hat:1,d(c){ dkP(c,[2,-12,2,-19,7,-22,8,-12],'#5a8a2a'); }},
  whiskers:{d(c,C){ dkS(c,[26,-3,36,-6],C.line,.6); dkS(c,[26,-2,37,-2],C.line,.6); dkE(c,31,-7,1.6,1.2,'#ff8fa8',.4); }},
  babyBonnet:{hat:1,ph:'b',d(c){ dkP(c,[14,-13,6,-17,-5,-15,-11,-6,-9,4,-2,9,0,2,-4,-5,2,-11,10,-12],'#bfe3ff'); }},
  pacifier:{d(c){ dkE(c,33,3,3.4,3.4,'#7fd0ff'); dkE(c,33,3,1.4,1.4,'#fff',0); }},
  fangs:{d(c){ dkP(c,[12,2,14.2,9,16.4,1.4],'#fff',.7); dkP(c,[23,.4,25,7,27,0],'#fff',.7); }},
  whiteBeard:{ph:'j',d(c){ dkP(c,[-1,7,4,18,9,12,14,20,18,11,23,15,25,6],'#f2f4f7'); }},
  beard:{ph:'j',d(c){ dkP(c,[-1,7,4,17,9,12,14,19,18,11,23,14,25,6],'#7a4a20'); }},
  cowHorns:{hat:1,d(c){ dkP(c,[-5,-10,-11,-16,-13,-24,-7,-19,-1,-13],'#efe6cf'); dkP(c,[5,-13,6,-21,3,-27,9,-22,11,-12],'#efe6cf'); }},
  ossicones:{hat:1,d(c,C){ dkS(c,[-2,-12,-4,-21],C.blue,2.4); dkE(c,-4,-22,2,2,'#5a3514'); dkS(c,[5,-13,6,-22],C.blue,2.4); dkE(c,6,-23,2,2,'#5a3514'); }},
  feathers:{hat:1,ph:'b',d(c,C){ dkP(c,[-6,-8,-16,-12,-24,-20,-14,-18,-8,-14],C.blue); dkP(c,[-2,-12,-10,-20,-14,-28,-5,-21,2,-15],C.blue); }},
  frill:{hat:1,ph:'b',d(c,C){ dkP(c,[1,3,-12,1,-20,-8,-21,-18,-14,-26,-3,-27,7,-21,8,-12],C.blue); dkE(c,-11,-15,2,2,C.cream,0); dkE(c,-5,-21,2,2,C.cream,0); dkE(c,-14,-7,1.8,1.8,C.cream,0); }},
  triHorns:{d(c){ dkP(c,[-1,-11,7,-26,5,-10],'#e0d4b8'); dkP(c,[3,-12,13,-27,10,-10],'#f2e8cf'); dkP(c,[26,-8,33,-18,31,-7],'#f2e8cf'); }},
  dome:{hat:1,d(c,C){ dkDome(c,3,-9.5,12.5,11,C.far); [[-6,-11],[-2,-17],[4,-19.5],[10,-17.5],[14,-12]].forEach(p=>dkE(c,p[0],p[1],1.6,1.6,C.blue,.6)); }},
  paraCrest:{hat:1,ph:'b',d(c,C){ dkP(c,[12,-11,3,-16,-13,-24,-27,-30,-29,-25,-15,-16,-3,-8],C.blue); }},
  browHorns:{hat:1,d(c){ dkP(c,[0,-11,-3,-21,6,-13],'#f2e8cf'); dkP(c,[7,-13,8,-22,13,-11],'#f2e8cf'); }},
  diloCrest:{hat:1,ph:'b',d(c,C){ dkE(c,8,-13,10,7,C.blue); dkE(c,19,-10.5,9,5.5,C.blue); }},
  browKnob:{hat:1,d(c,C){ dkP(c,[2,-12,8,-18,13,-9],C.far); }},
  dragonHorns:{hat:1,d(c){ dkP(c,[-3,-11,-15,-20,-25,-20,-14,-14,-5,-7],'#2a1a10'); dkP(c,[3,-13,-5,-25,-13,-27,-6,-19,0,-11],'#2a1a10'); dkP(c,[26,-8,30,-13,31,-7],'#2a1a10'); }},
  nemes:{hat:1,ph:'b',d(c){ dkP(c,[12,-12,5,-17,-6,-15,-13,-7,-20,6,-12,10,-6,4,-2,-2],'#f5c518'); dkS(c,[0,-15,-10,-4],'#1f4fa8',1.6); dkS(c,[-5,-13,-15,1],'#1f4fa8',1.6); dkS(c,[-2,-6,-11,7],'#1f4fa8',1.6); }},
  cobra:{d(c){ dkE(c,13,-13,2,3,'#1f4fa8',.6); dkS(c,[-6,-11.5,16,-11],'#1f4fa8',1.2); }},
  gladHelm:{hat:1,d(c){ dkP(c,[-12,-17,-8,-26,6,-28,18,-20,8,-19,-4,-20],'#d9261c'); dkDome(c,4,-10.5,12,9.5,'#d9a94a'); dkP(c,[-8,-10.5,16,-10.5,16,-8,-8,-8],'#b3830a',.6); dkP(c,[-3,-9,3,-9,3,2,-2,2],'#d9a94a'); }},
  boneHair:{hat:1,d(c){ dkP(c,[-8,-8,-10,-16,-3,-14,0,-19,5,-14,10,-16,12,-11],'#3a2410'); dkS(c,[-5,-17,11,-20],'#f2e8cf',2.2); dkE(c,-5,-17,1.6,1.6,'#f2e8cf',.5); dkE(c,11,-20,1.6,1.6,'#f2e8cf',.5); }},
  antenna:{hat:1,d(c,C){ dkS(c,[0,-12,-4,-26],C.line,1.1); dkE(c,-4,-27,2.2,2.2,'#d9f25a'); dkS(c,[8,-13,10,-27],C.line,1.1); dkE(c,10,-28,2.2,2.2,'#d9f25a'); }},
  roboAntenna:{hat:1,d(c,C,t){ dkS(c,[3,-13,3,-25],C.line,1.6); dkE(c,3,-26.5,2.4,2.4,Math.sin(t*0.15)>0?'#ff3b30':'#7a1010'); }},
  headStitch:{d(c){ dkS(c,[-4,-11,10,-12],'#222',.8); for (let x=-2;x<10;x+=3.2) dkS(c,[x,-13.2,x+.6,-9.8],'#222',.8); }},
  leafCap:{hat:1,d(c){ dkP(c,[-8,-8,-10,-15,-4,-12,-1,-19,3,-13,8,-18,10,-12,14,-14,12,-9],'#2f9e44'); }},
  cherry:{hat:1,d(c){ dkE(c,3,-13,9,3.4,'#fff2dc'); dkE(c,3,-16,6,2.8,'#f98bb0'); dkS(c,[3,-22,7,-27],'#2f7a2f',.9); dkE(c,3,-20,2.8,2.8,'#d9142a'); }},
  scarfRed:{ph:'n',d(c,C,t){ dkScarf(c,'#d9261c',t); }},
  scarfBlue:{ph:'n',d(c,C,t){ dkScarf(c,'#1f55b3',t); }},
  bowtie:{ph:'n',d(c){ dkP(c,[-2,9,-7,5,-7,13],'#d9261c'); dkP(c,[-2,9,3,5,3,13],'#d9261c'); dkE(c,-2,9,1.6,1.6,'#a8140c',.4); }},
  stethoscope:{ph:'n',d(c){ dkS(c,[-6,-9,-9,2,-4,10],'#222',1.2); dkE(c,-4,11,2,2,'#c8d2de',.7); }},
  vampCollar:{ph:'n',d(c){ dkP(c,[3,-11,-6,-17,-5,-8],'#7a1020'); dkP(c,[3,10,-6,15,-5,7],'#7a1020'); }}
};

// שורה: id, שמות (he|en|ar|es|fr|pt|ru|de), מראה. המחיר עולה לפי הסדר.
// g צבע ראשי, b משני, c בטן. pat דוגמה, pl לוחות על הגב, tail קצה הזנב, wings כנפיים, cape גלימה,
// mat חומר מיוחד, fx שובל, eye סוג עין, i צבע עין, head/fat גודל ראש ועובי גוף, glow הילה, line צבע קו.
const DINO_SKIN_ROWS = [
  ['red','אדום|Red|أحمر|Rojo|Rouge|Vermelho|Красный|Rot',{g:'#e5432d',b:'#8f1711',c:'#ffe0b8'}],
  ['orange','כתום|Orange|برتقالي|Naranja|Orange|Laranja|Оранжевый|Orange',{g:'#f28a24',b:'#b3460c',c:'#fff0c2'}],
  ['yellow','צהוב|Yellow|أصفر|Amarillo|Jaune|Amarelo|Жёлтый|Gelb',{g:'#f5cf2e',b:'#d48a0c',c:'#fff7d6'}],
  ['pink','ורוד|Pink|وردي|Rosa|Rose|Rosa|Розовый|Rosa',{g:'#f582b4',b:'#c93d86',c:'#ffe6f1'}],
  ['purple','סגול|Purple|بنفسجي|Morado|Violet|Roxo|Фиолетовый|Lila',{g:'#9a5fe0',b:'#5a23a8',c:'#eadcff'}],
  ['teal','טורקיז|Turquoise|فيروزي|Turquesa|Turquoise|Turquesa|Бирюзовый|Türkis',{g:'#2cc7bd',b:'#0c7a8c',c:'#d9fff6'}],
  ['brown','חום|Brown|بني|Marrón|Marron|Marrom|Коричневый|Braun',{g:'#a8703c',b:'#5e3514',c:'#f0d6ac'}],
  ['white','לבן|White|أبيض|Blanco|Blanc|Branco|Белый|Weiß',{g:'#f2f4f7',b:'#b9c4d2',c:'#ffffff'}],
  ['black','שחור|Black|أسود|Negro|Noir|Preto|Чёрный|Schwarz',{g:'#3a3f4a',b:'#15171c',c:'#8a93a3',i:'#ffb100'}],

  ['tiger','נמר|Tiger|نمر|Tigre|Tigre|Tigre|Тигр|Tiger',{g:'#f28c1e',b:'#1c140c',c:'#fff1d6',pat:'stripes',pl:'none'}],
  ['zebra','זברה|Zebra|حمار وحشي|Cebra|Zèbre|Zebra|Зебра|Zebra',{g:'#f5f5f2',b:'#17171a',c:'#ffffff',pat:'rings',pl:'fur'}],
  ['cheetah','ברדלס|Cheetah|فهد|Guepardo|Guépard|Guepardo|Гепард|Gepard',{g:'#f2c14e',b:'#3a2410',c:'#fff4d6',pat:'spots',pl:'none'}],
  ['dalmatian','דלמטי|Dalmatian|دلماسي|Dálmata|Dalmatien|Dálmata|Далматинец|Dalmatiner',{g:'#f7f7f5',b:'#1b1b1f',c:'#ffffff',pat:'spots',pl:'none'}],
  ['cow','פרה|Cow|بقرة|Vaca|Vache|Vaca|Корова|Kuh',{g:'#f7f5ef',b:'#231f1c',c:'#f7c9c9',pat:'patches',pl:'none',gear:['cowHorns']}],
  ['camo','הסוואה|Camouflage|تمويه|Camuflaje|Camouflage|Camuflagem|Камуфляж|Tarnung',{g:'#6f8d45',b:'#39512a',c:'#c9c48f',pat:'patches',pl:'none'}],
  ['snake','נחש|Snake|ثعبان|Serpiente|Serpent|Cobra|Змея|Schlange',{g:'#5cb04a',b:'#2c6b2f',c:'#e6e08a',pat:'scales',pl:'none',i:'#e6b800'}],
  ['chess','שחמט|Chess|شطرنج|Ajedrez|Échecs|Xadrez|Шахматы|Schach',{g:'#f2f2f2',b:'#16161a',c:'#f2f2f2',pat:'check'}],
  ['dots','נקודות|Polka Dots|منقط|Lunares|À pois|Bolinhas|В горошек|Gepunktet',{g:'#ff7a7a',b:'#fff2f2',c:'#ffe6e6',pat:'spots',pl:'none'}],
  ['giraffe',"ג'ירפה|Giraffe|زرافة|Jirafa|Girafe|Girafa|Жираф|Giraffe",{g:'#f0c35a',b:'#9a5a1c',c:'#fff1c9',pat:'patches',pl:'fur',gear:['ossicones']}],

  ['watermelon','אבטיח|Watermelon|بطيخ|Sandía|Pastèque|Melancia|Арбуз|Wassermelone',{g:'#ee3f50',b:'#2f9e44',c:'#f4fff0',pat:'seeds',pl:'none'}],
  ['donut','סופגניה|Donut|دونات|Dona|Donut|Rosquinha|Пончик|Donut',{g:'#e9b777',b:'#f76fa8',c:'#f7dcb0',pat:'sprinkles',pl:'none'}],
  ['chocolate','שוקולד|Chocolate|شوكولاتة|Chocolate|Chocolat|Chocolate|Шоколад|Schokolade',{g:'#6b3f22',b:'#3e2212',c:'#a86f40',pat:'check',pl:'none'}],
  ['cheese','גבינה|Cheese|جبنة|Queso|Fromage|Queijo|Сыр|Käse',{g:'#f7cc3a',b:'#d99a12',c:'#fde07a',pat:'spots',pl:'none'}],
  ['avocado','אבוקדו|Avocado|أفوكادو|Aguacate|Avocat|Abacate|Авокадо|Avocado',{g:'#8fbf4d',b:'#4a6b2a',c:'#e8f0a0',pat:'solid',pl:'none'}],
  ['candy','סוכריה|Candy|حلوى|Caramelo|Bonbon|Doce|Конфета|Bonbon',{g:'#ff9ecb',b:'#ffffff',c:'#ffffff',pat:'rings',pl:'none',fx:'spark'}],
  ['strawberry','תות|Strawberry|فراولة|Fresa|Fraise|Morango|Клубника|Erdbeere',{g:'#e82c44',b:'#ffe27a',c:'#ff8a96',pat:'spots',pl:'leaf',gear:['leafCap']}],
  ['icecream','גלידה|Ice Cream|آيس كريم|Helado|Crème glacée|Sorvete|Мороженое|Eiscreme',{g:'#fff2dc',b:'#f98bb0',c:'#c98a4b',pat:'solid',pl:'none',gear:['cherry'],fx:'snow'}],

  ['raptor','רפטור|Raptor|رابتور|Raptor|Raptor|Raptor|Раптор|Raptor',{g:'#7b8a3a',b:'#3d4a1a',c:'#e8e0b0',pat:'stripes',pl:'fur',tail:'fan',fat:.82,i:'#e6b800',gear:['feathers']}],
  ['triceratops','טריצרטופס|Triceratops|ترايسيراتوبس|Triceratops|Tricératops|Tricerátops|Трицератопс|Triceratops',{g:'#b58a4a',b:'#7a5524',c:'#efd9a8',pat:'solid',pl:'none',fat:1.08,gear:['frill','triHorns']}],
  ['stego','סטגוזאורוס|Stegosaurus|ستيجوسورس|Estegosaurio|Stégosaure|Estegossauro|Стегозавр|Stegosaurus',{g:'#7fa84a',b:'#c8572a',c:'#e3e0a0',pat:'spots',pl:'big',tail:'thag'}],
  ['anky','אנקילוזאורוס|Ankylosaurus|أنكيلوسورس|Anquilosaurio|Ankylosaure|Anquilossauro|Анкилозавр|Ankylosaurus',{g:'#9a8a5c',b:'#5c5130',c:'#e0d4a8',pat:'scales',pl:'knobs',tail:'club',fat:1.15}],
  ['spino','ספינוזאורוס|Spinosaurus|سبينوسورس|Espinosaurio|Spinosaure|Espinossauro|Спинозавр|Spinosaurus',{g:'#4f8f86',b:'#d6613a',c:'#dfeee0',pat:'solid',pl:'sail'}],
  ['para','פאראזאורולופוס|Parasaurolophus|باراصورولوفوس|Parasaurolophus|Parasaurolophus|Parassaurolofo|Паразауролоф|Parasaurolophus',{g:'#5fa86a',b:'#e08a2c',c:'#eef0c0',pat:'stripes',pl:'none',gear:['paraCrest']}],
  ['pachy','פכיצפלוזאורוס|Pachycephalosaurus|باكيسيفالوسورس|Paquicefalosaurio|Pachycéphalosaure|Paquicefalossauro|Пахицефалозавр|Pachycephalosaurus',{g:'#8c6fb8',b:'#4e3a7a',c:'#e9def5',pat:'solid',pl:'knobs',gear:['dome']}],
  ['carno','קרנוטאורוס|Carnotaurus|كارنوتوروس|Carnotaurus|Carnotaure|Carnotauro|Карнотавр|Carnotaurus',{g:'#c0392b',b:'#5a130c',c:'#f2d0b0',pat:'scales',pl:'knobs',gear:['browHorns']}],
  ['dilo','דילופוזאורוס|Dilophosaurus|ديلوفوصور|Dilofosaurio|Dilophosaure|Dilofossauro|Дилофозавр|Dilophosaurus',{g:'#d4b92a',b:'#2f7a4a',c:'#f5eca0',pat:'stripes',pl:'spikes',fat:.9,gear:['diloCrest']}],
  ['allo','אלוזאורוס|Allosaurus|ألوصور|Alosaurio|Allosaure|Alossauro|Аллозавр|Allosaurus',{g:'#a0694a',b:'#5a2f1a',c:'#efd3b0',pat:'stripes',pl:'spikes',gear:['browKnob']}],

  ['chef','שף|Chef|طاهٍ|Chef|Chef|Chef|Шеф-повар|Koch',{g:'#7fcf58',b:'#2f8a2f',c:'#ffffff',gear:['chefHat','bowtie']}],
  ['doctor','רופא|Doctor|طبيب|Doctor|Docteur|Doutor|Доктор|Arzt',{g:'#4fc3c0',b:'#118a8a',c:'#eafffb',pat:'solid',pl:'none',gear:['headMirror','stethoscope']}],
  ['farmer','חקלאי|Farmer|مزارع|Granjero|Fermier|Fazendeiro|Фермер|Bauer',{g:'#8fbf4d',b:'#b3772a',c:'#f4eac2',pat:'solid',gear:['strawHat'],fx:'leaf'}],
  ['builder','בנאי|Builder|بنّاء|Constructor|Maçon|Construtor|Строитель|Bauarbeiter',{g:'#f2a93b',b:'#b36a0c',c:'#fff1c9',pat:'solid',gear:['hardHat']}],
  ['firefighter','כבאי|Firefighter|رجل إطفاء|Bombero|Pompier|Bombeiro|Пожарный|Feuerwehrmann',{g:'#d9432c',b:'#f6c21c',c:'#ffe6a8',pat:'rings',pl:'none',gear:['fireHelmet'],fx:'smoke'}],
  ['police','שוטר|Police|شرطي|Policía|Policier|Policial|Полицейский|Polizist',{g:'#2f5fb8',b:'#152e66',c:'#dfe9ff',pat:'solid',pl:'none',gear:['policeCap']}],
  ['sailor','מלח|Sailor|بحّار|Marinero|Marin|Marinheiro|Моряк|Matrose',{g:'#f4f6fa',b:'#1f55b3',c:'#dfe8fa',pat:'rings',pl:'none',gear:['sailorCap','scarfBlue']}],
  ['cowboy','קאובוי|Cowboy|راعي بقر|Vaquero|Cow-boy|Caubói|Ковбой|Cowboy',{g:'#b8804a',b:'#6e4520',c:'#f0dcb4',pat:'solid',pl:'none',gear:['cowboyHat','scarfRed']}],
  ['graduate','בוגר|Graduate|خرّيج|Graduado|Diplômé|Formando|Выпускник|Absolvent',{g:'#5a6bd0',b:'#2a337a',c:'#e1e5ff',pat:'solid',pl:'none',gear:['gradCap']}],
  ['scientist','מדען|Scientist|عالِم|Científico|Savant|Cientista|Учёный|Forscher',{g:'#a7e05a',b:'#55a02a',c:'#f4ffe0',pl:'none',gear:['wildHair','goggles'],fx:'bubble'}],
  ['soccer','כדורגלן|Soccer Player|لاعب كرة|Futbolista|Footballeur|Jogador|Футболист|Fußballer',{g:'#2db84b',b:'#ffffff',c:'#eafff0',pat:'rings',pl:'none',gear:['sweatband']}],
  ['painter','צייר|Painter|رسّام|Pintor|Peintre|Pintor|Художник|Maler',{g:'#f5f0e6',b:'#e0483d',c:'#fffaf0',pat:'paint',pl:'none',gear:['beret'],fx:'confetti'}],
  ['rocker','רוקר|Rock Star|نجم روك|Rockero|Rockeur|Roqueiro|Рокер|Rockstar',{g:'#34343c',b:'#d6214f',c:'#9a9aa8',pl:'spikes',gear:['mohawk','sunglasses'],fx:'note'}],
  ['dj',"די ג'יי|DJ|دي جي|DJ|DJ|DJ|Диджей|DJ",{g:'#6a3fd6',b:'#22d3ee',c:'#e6dcff',pat:'solid',pl:'none',gear:['headphones','sunglasses'],fx:'note'}],

  ['ninja',"נינג'ה|Ninja|نينجا|Ninja|Ninja|Ninja|Ниндзя|Ninja",{g:'#22242c',b:'#0f1014',c:'#3a3d48',pat:'solid',pl:'none',i:'#ffffff',gear:['ninjaBand'],fx:'smoke'}],
  ['pirate','פיראט|Pirate|قرصان|Pirata|Pirate|Pirata|Пират|Pirat',{g:'#5aa05a',b:'#234f2a',c:'#efe0b8',pat:'stripes',pl:'none',gear:['pirateHat','eyePatch']}],
  ['knight','אביר|Knight|فارس|Caballero|Chevalier|Cavaleiro|Рыцарь|Ritter',{g:'#aab4c0',b:'#66707d',c:'#d8dee6',pat:'rivets',pl:'none',mat:'metal',cape:'#c0392b',gear:['knightHelm']}],
  ['samurai','סמוראי|Samurai|ساموراي|Samurái|Samouraï|Samurai|Самурай|Samurai',{g:'#b3261e',b:'#2a0f0f',c:'#f2dcc0',pat:'scales',pl:'none',gear:['kabuto']}],
  ['viking','ויקינג|Viking|فايكنغ|Vikingo|Viking|Viking|Викинг|Wikinger',{g:'#a8763e',b:'#5c3a18',c:'#f0dcb4',pl:'fur',gear:['vikingHelm','beard']}],
  ['caveman','איש מערות|Caveman|رجل الكهف|Cavernícola|Homme des cavernes|Homem das cavernas|Пещерный человек|Höhlenmensch',{g:'#8a9a4a',b:'#7a5a2a',c:'#e8dfb0',pat:'spots',pl:'fur',gear:['boneHair']}],
  ['gladiator','גלדיאטור|Gladiator|مصارع|Gladiador|Gladiateur|Gladiador|Гладиатор|Gladiator',{g:'#c98a4a',b:'#7a2a1a',c:'#f5dfbf',pat:'solid',pl:'none',cape:'#b3261e',gear:['gladHelm']}],
  ['pharaoh','פרעה|Pharaoh|فرعون|Faraón|Pharaon|Faraó|Фараон|Pharao',{g:'#d9a94a',b:'#1f4fa8',c:'#fff0c9',pat:'rings',pl:'none',gear:['nemes','cobra']}],
  ['king','מלך|King|ملك|Rey|Roi|Rei|Король|König',{g:'#7a3fbf',b:'#3f1a7a',c:'#f0e2ff',pat:'solid',pl:'none',cape:'#c0392b',gear:['crown'],fx:'spark'}],

  ['clown','ליצן|Clown|مهرج|Payaso|Clown|Palhaço|Клоун|Clown',{g:'#fff2e0',b:'#ff4d4d',c:'#ffffff',pat:'spots',pl:'none',gear:['clownWig','clownNose'],fx:'confetti'}],
  ['party','מסיבה|Party|حفلة|Fiesta|Fête|Festa|Вечеринка|Party',{g:'#4dc9ff',b:'#ff5fa2',c:'#fff5d6',pat:'spots',pl:'none',gear:['partyHat'],fx:'confetti'}],
  ['santa','סנטה|Santa|سانتا|Santa|Père Noël|Papai Noel|Санта|Weihnachtsmann',{g:'#e03a3a',b:'#ffffff',c:'#ffffff',pat:'solid',pl:'none',gear:['santaHat','whiteBeard'],fx:'snow'}],
  ['snowman','איש שלג|Snowman|رجل ثلج|Muñeco de nieve|Bonhomme de neige|Boneco de neve|Снеговик|Schneemann',{g:'#f5f9ff',b:'#cfe0f5',c:'#ffffff',pat:'plain',pl:'none',eye:'coal',gear:['topHat','carrot','scarfRed'],fx:'snow'}],
  ['pumpkin','דלעת|Pumpkin|يقطين|Calabaza|Citrouille|Abóbora|Тыква|Kürbis',{g:'#f28a1c',b:'#b85a0c',c:'#ffc46b',pat:'rings',pl:'none',eye:'tri',gear:['stem']}],
  ['bunny','ארנב|Bunny|أرنب|Conejo|Lapin|Coelho|Кролик|Hase',{g:'#f2efe9',b:'#f5b7c8',c:'#ffffff',pat:'plain',pl:'none',eye:'big',gear:['bunnyEars'],fx:'heart'}],
  ['cat','חתול|Cat|قطة|Gato|Chat|Gato|Кот|Katze',{g:'#f2a65a',b:'#c96a1c',c:'#fff3e0',pat:'stripes',pl:'none',i:'#2fbf5a',gear:['catEars','whiskers']}],
  ['baby','תינוק|Baby|رضيع|Bebé|Bébé|Bebê|Малыш|Baby',{g:'#9be07a',b:'#5bbf4a',c:'#fffbe0',pat:'plain',pl:'none',eye:'big',head:1.12,fat:.92,gear:['babyBonnet','pacifier']}],
  ['grandpa','סבא|Grandpa|جد|Abuelo|Papi|Vovô|Дедушка|Opa',{g:'#9aa78f',b:'#66705c',c:'#efece0',pat:'plain',gear:['beanie','roundGlasses','mustache']}],
  ['hero','גיבור על|Superhero|بطل خارق|Superhéroe|Super-héros|Super-herói|Супергерой|Superheld',{g:'#2f6fe0',b:'#d9261c',c:'#ffe27a',pat:'solid',pl:'none',cape:'#d9261c',gear:['heroMask']}],
  ['cool','מגניב|Cool|رائع|Genial|Cool|Legal|Крутой|Cool',{g:'#2fd6a0',b:'#0f8f6a',c:'#e8fff5',gear:['sunglasses'],fx:'star'}],
  ['gentleman',"ג'נטלמן|Gentleman|نبيل|Caballero fino|Gentleman|Cavalheiro|Джентльмен|Gentleman",{g:'#3f4a5c',b:'#1b2230',c:'#f2f0e8',pat:'solid',pl:'none',gear:['topHat','monocle','mustache','bowtie']}],

  ['fire','אש|Fire|نار|Fuego|Feu|Fogo|Огонь|Feuer',{g:'#ff6a1a',b:'#ffd21a',c:'#ffe9a8',pl:'flame',tail:'flame',glow:'#ff7a1a',i:'#ffd21a',fx:'fire'}],
  ['ice','קרח|Ice|جليد|Hielo|Glace|Gelo|Лёд|Eis',{g:'#7fd4f5',b:'#2f8fd0',c:'#e0fbff',pat:'solid',pl:'crystal',glow:'#a8e4ff',fx:'snow'}],
  ['lava','לבה|Lava|حمم|Lava|Lave|Lava|Лава|Lava',{g:'#2c2018',b:'#ff6a1a',c:'#4a3020',pat:'cracks',pl:'knobs',tail:'flame',i:'#ffb100',fx:'ember'}],
  ['water','מים|Water|ماء|Agua|Eau|Água|Вода|Wasser',{g:'#2f8fe8',b:'#0f55b3',c:'#bfe9ff',pl:'fins',fx:'bubble'}],
  ['lightning','ברק|Lightning|برق|Rayo|Éclair|Raio|Молния|Blitz',{g:'#f7e04a',b:'#2a2a3a',c:'#fff9c2',pat:'bolts',pl:'spikes',i:'#2a6fff',fx:'bolt'}],
  ['stone','אבן|Stone|حجر|Piedra|Pierre|Pedra|Камень|Stein',{g:'#8c8f94',b:'#5a5d62',c:'#b8bbc0',pat:'cracks',pl:'knobs',tail:'club',fat:1.1}],
  ['forest','יער|Forest|غابة|Bosque|Forêt|Floresta|Лес|Wald',{g:'#3f9a4a',b:'#7a4a1c',c:'#d9e8a8',pat:'plain',pl:'leaf',fx:'leaf'}],
  ['crystal','קריסטל|Crystal|كريستال|Cristal|Cristal|Cristal|Кристалл|Kristall',{g:'#b58cff',b:'#6a3fd6',c:'#efe6ff',pat:'facets',pl:'crystal',mat:'shine',fx:'spark'}],
  ['shadow','צל|Shadow|ظل|Sombra|Ombre|Sombra|Тень|Schatten',{g:'#15131c',b:'#050508',c:'#2a2636',pat:'plain',pl:'spikes',eye:'glowRed',line:'#000000',fx:'smoke'}],
  ['cloud','ענן|Cloud|سحابة|Nube|Nuage|Nuvem|Облако|Wolke',{g:'#ffffff',b:'#dfe9f5',c:'#ffffff',pat:'plain',pl:'puff',line:'#7a8aa0',fx:'puff'}],

  ['wizard','קוסם|Wizard|ساحر|Mago|Sorcier|Mago|Волшебник|Zauberer',{g:'#4a3fb8',b:'#241a7a',c:'#d9d4ff',pat:'stars',pl:'none',cape:'#3f2f9a',gear:['wizardHat','whiteBeard'],fx:'spark'}],
  ['zombie','זומבי|Zombie|زومبي|Zombi|Zombie|Zumbi|Зомби|Zombie',{g:'#7aa05a',b:'#4a6a3a',c:'#b8b88a',pat:'stitches',pl:'none',eye:'dull',gear:['headStitch']}],
  ['skeleton','שלד|Skeleton|هيكل عظمي|Esqueleto|Squelette|Esqueleto|Скелет|Skelett',{g:'#efe9d8',b:'#1a1a20',c:'#efe9d8',pat:'ribs',pl:'spikes',eye:'hollow'}],
  ['vampire','ערפד|Vampire|مصاص دماء|Vampiro|Vampire|Vampiro|Вампир|Vampir',{g:'#3a2f4a',b:'#7a1020',c:'#d9cfe0',pat:'solid',pl:'none',i:'#e0142a',cape:'#7a1020',gear:['fangs','vampCollar']}],
  ['ghost','רוח רפאים|Ghost|شبح|Fantasma|Fantôme|Fantasma|Призрак|Geist',{g:'#e6f0ff',b:'#b0c8ee',c:'#ffffff',pat:'plain',pl:'none',mat:'ghost',eye:'hollow',fx:'puff'}],
  ['alien','חייזר|Alien|فضائي|Alien|Alien|Alienígena|Пришелец|Alien',{g:'#9ad45a',b:'#4f8a2a',c:'#e0f5b0',pat:'spots',pl:'none',eye:'alien',head:1.1,gear:['antenna']}],
  ['robot','רובוט|Robot|روبوت|Robot|Robot|Robô|Робот|Roboter',{g:'#9aa7b8',b:'#4f5b6b',c:'#c8d2de',pat:'rivets',mat:'metal',eye:'visor',gear:['roboAntenna']}],
  ['astronaut','אסטרונאוט|Astronaut|رائد فضاء|Astronauta|Astronaute|Astronauta|Космонавт|Astronaut',{g:'#f2f4f7',b:'#d9261c',c:'#d8dee6',pat:'solid',pl:'none',gear:['bubble'],fx:'star'}],

  ['dragon','דרקון|Dragon|تنين|Dragón|Dragon|Dragão|Дракон|Drache',{g:'#c0271c',b:'#5a0f0c',c:'#ffd27a',pat:'scales',pl:'spikes',tail:'arrow',wings:'bat',i:'#ffd21a',gear:['dragonHorns'],fx:'fire'}],
  ['unicorn','חד קרן|Unicorn|وحيد القرن|Unicornio|Licorne|Unicórnio|Единорог|Einhorn',{g:'#fff0fa',b:'#ff8ad0',c:'#ffffff',pat:'plain',pl:'none',tail:'fan',eye:'big',gear:['mane','uniHorn'],fx:'heart'}],
  ['phoenix','עוף החול|Phoenix|عنقاء|Fénix|Phénix|Fênix|Феникс|Phönix',{g:'#ff8a1a',b:'#d9261c',c:'#ffe27a',pat:'scales',pl:'flame',tail:'flame',wings:'fire',glow:'#ff9a2a',i:'#ffd21a',fx:'fire'}],
  ['angel','מלאך|Angel|ملاك|Ángel|Ange|Anjo|Ангел|Engel',{g:'#fffaf0',b:'#f5d76e',c:'#ffffff',pat:'plain',pl:'none',wings:'angel',glow:'#fff1b0',eye:'big',gear:['halo'],fx:'spark'}],
  ['demon','שדון|Demon|شيطان|Demonio|Démon|Demônio|Демон|Dämon',{g:'#7a0f1c',b:'#22050a',c:'#d9543c',pat:'scales',pl:'spikes',tail:'arrow',wings:'bat',eye:'glowRed',gear:['devilHorns'],fx:'ember'}],
  ['neon','ניאון|Neon|نيون|Neón|Néon|Neon|Неон|Neon',{g:'#07070f',b:'#22f5ff',c:'#0d0d1a',pat:'stripes',pl:'spikes',line:'#22f5ff',glow:'#22f5ff',i:'#ff2fd0',fx:'spark'}],
  ['galaxy','גלקסיה|Galaxy|مجرة|Galaxia|Galaxie|Galáxia|Галактика|Galaxie',{g:'#141038',b:'#6a2fd6',c:'#241a5a',pat:'galaxy',pl:'crystal',i:'#7ff5ff',fx:'star'}],
  ['gold','זהב|Gold|ذهب|Oro|Or|Ouro|Золото|Gold',{g:'#f5c518',b:'#b3830a',c:'#fff0a8',mat:'shine',gear:['crown'],fx:'spark'}],
  ['diamond','יהלום|Diamond|ألماس|Diamante|Diamant|Diamante|Алмаз|Diamant',{g:'#eefcff',b:'#9fe3ff',c:'#ffffff',pat:'facets',pl:'crystal',mat:'shine',glow:'#ffffff',fx:'spark'}],
  ['rainbow','קשת בענן|Rainbow|قوس قزح|Arcoíris|Arc-en-ciel|Arco-íris|Радуга|Regenbogen',{g:'#ff4d4d',b:'#ffffff',c:'#ffffff',pat:'plain',mat:'rainbow',tail:'fan',fx:'confetti'}]
];

function dinoTint(hex,k){
  const n=parseInt(hex.slice(1),16), f=v=>Math.round(k<0?v*(1+k):v+(255-v)*k);
  return 'rgb('+f(n>>16)+','+f((n>>8)&255)+','+f(n&255)+')';
}
function dinoMakeSkin(id,names,o,price){
  const g=o.g, S=Object.assign({ id, names:names.split('|'), price, pat:'zig', pl:'blocks', gear:[], head:1, fat:1 }, o);
  S.col={ line:o.line||'#0c1a0e', green:g, shade:dinoTint(g,-.2), far:dinoTint(g,-.32), blue:o.b, blueHi:dinoTint(o.b,.3), cream:o.c, tan:dinoTint(o.c,-.2), mouth:'#7d1518', tongue:'#d9302e', tooth:'#fffdf2', claw:'#f6f0df', iris:o.i||'#1c6fe0' };
  // סידור האביזרים לפי השכבה שלהם
  S.layers={ b:[], u:[], p:[], j:[], n:[] };
  S.hat=false;
  S.gear.forEach(name=>{ const G=DINO_GEAR[name]; if (G.hat) S.hat=true; S.layers[G.ph||'p'].push(G); });
  return S;
}
// הדינוזאור המקורי בחינם, ואחריו 100 דמויות במחיר שעולה בהדרגה
const DINO_SKINS = [dinoMakeSkin('classic','דינו|Dino|دينو|Dino|Dino|Dino|Дино|Dino',{ g:'#62c232', b:'#0c63d8', c:'#f4e4b4', shade:'#129a3e' },0)];
DINO_SKIN_ROWS.forEach((r,i)=>{
  const raw=20*Math.pow(1.05,i), price=raw<1000?Math.round(raw/5)*5:Math.round(raw/50)*50;
  DINO_SKINS.push(dinoMakeSkin(r[0],r[1],r[2],price));
});
DINO_SKINS[0].col.shade='#129a3e'; DINO_SKINS[0].col.far='#2c8f37';
const DINO_SKIN_BY = {};
DINO_SKINS.forEach(S=>{ DINO_SKIN_BY[S.id]=S; });

// ---------- שובל: חלקיקים קטנים שהדמות משאירה מאחור ----------
// rate: כל כמה צעדים נוצר חלקיק
const DINO_FX_RATE = { fire:2, ember:4, spark:6, star:9, heart:12, bubble:8, snow:7, leaf:10, note:14, smoke:5, confetti:4, bolt:14, puff:8 };
function dinoFxSpawn(kind,x,y,speed){
  const r=Math.random, p={ fx:kind, x:x-12-r()*18, y:y-8-r()*44, vx:-speed*0.45-r()*0.8, vy:-r()*0.6, g:0, life:34, max:34, r:2+r()*2, rot:r()*6, col:'' };
  if (kind==='fire') { p.y=y-20-r()*26; p.vy=-1-r()*0.8; p.life=p.max=20; p.r=3+r()*3.5; }
  if (kind==='ember') { p.vy=-0.9-r(); p.life=p.max=26; p.r=1+r()*1.4; p.col=r()<.5?'#ff6a1a':'#ffb100'; }
  if (kind==='snow') { p.vy=0.25+r()*0.4; p.r=1+r()*1.4; p.life=p.max=44; }
  if (kind==='bubble') { p.vy=-0.5-r()*0.5; p.life=p.max=38; }
  if (kind==='leaf') { p.vy=0.3+r()*0.4; p.life=p.max=44; p.col=r()<.5?'#3f9a4a':'#8fbf4d'; }
  if (kind==='confetti') { p.vy=-1+r()*0.6; p.g=0.06; p.col=['#ff5f7e','#ffd21a','#4dc9ff','#57d98a','#c78bff'][Math.floor(r()*5)]; }
  if (kind==='smoke') { p.vy=-0.35; p.r=3+r()*3; p.life=p.max=30; }
  if (kind==='puff') { p.vy=-0.2; p.r=3+r()*3.5; p.life=p.max=28; }
  if (kind==='note') { p.vy=-0.7; p.life=p.max=42; p.col=r()<.5?'#ffd21a':'#ff5fa2'; }
  if (kind==='bolt') { p.life=p.max=9; }
  return p;
}
function dinoFxDraw(c,p){
  const k=p.life/p.max;
  c.save(); c.globalAlpha=Math.min(1,k*1.6); c.translate(p.x,p.y);
  switch (p.fx) {
    case 'fire': c.fillStyle=k>.55?'#ffd21a':k>.28?'#ff8a1a':'#d9261c'; c.beginPath(); c.arc(0,0,p.r*(.4+k*.6),0,7); c.fill(); break;
    case 'ember': c.fillStyle=p.col; c.fillRect(-p.r/2,-p.r/2,p.r,p.r); break;
    case 'snow': c.fillStyle='#fff'; c.beginPath(); c.arc(0,0,p.r,0,7); c.fill(); break;
    case 'smoke': c.fillStyle='rgba(60,60,72,.55)'; c.beginPath(); c.arc(0,0,p.r+(1-k)*4,0,7); c.fill(); break;
    case 'puff': c.fillStyle='rgba(255,255,255,.75)'; c.beginPath(); c.arc(0,0,p.r+(1-k)*3,0,7); c.fill(); break;
    case 'bubble': c.strokeStyle='rgba(220,245,255,.95)'; c.lineWidth=1; c.beginPath(); c.arc(0,0,p.r,0,7); c.stroke(); c.fillStyle='#fff'; c.fillRect(-p.r*.4,-p.r*.5,1,1); break;
    case 'leaf': c.rotate(p.rot+p.life*0.15); c.fillStyle=p.col; c.beginPath(); c.ellipse(0,0,3.6,1.7,0,0,7); c.fill(); break;
    case 'confetti': c.rotate(p.rot+p.life*0.25); c.fillStyle=p.col; c.fillRect(-2,-1.1,4,2.2); break;
    case 'heart': c.fillStyle='#ff5f8f'; c.scale(p.r/3,p.r/3); c.beginPath(); c.moveTo(0,2.6); c.bezierCurveTo(-4,-.6,-2,-3.4,0,-1.4); c.bezierCurveTo(2,-3.4,4,-.6,0,2.6); c.fill(); break;
    case 'note': c.fillStyle=p.col; c.font='bold 13px Heebo, sans-serif'; c.textAlign='center'; c.fillText('♪',0,0); break;
    case 'bolt': c.strokeStyle='#fff27a'; c.lineWidth=1.6; c.beginPath(); c.moveTo(0,-7); c.lineTo(-3,-1); c.lineTo(2,0); c.lineTo(-1,7); c.stroke(); break;
    default: // spark, star
      c.rotate(p.rot); c.fillStyle=p.fx==='star'?'#fff7c2':'#fff'; const s=p.r*(p.fx==='star'?1.5:1)*(.5+k*.5);
      c.beginPath(); c.moveTo(0,-s); c.lineTo(s*.25,-s*.25); c.lineTo(s,0); c.lineTo(s*.25,s*.25); c.lineTo(0,s); c.lineTo(-s*.25,s*.25); c.lineTo(-s,0); c.lineTo(-s*.25,-s*.25); c.closePath(); c.fill();
  }
  c.restore();
}
