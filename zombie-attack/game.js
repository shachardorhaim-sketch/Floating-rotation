(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const TAU = Math.PI * 2;
  const DPR = Math.min(devicePixelRatio || 1, 2);
  const SAVE_KEY = 'ashline-save';
  const PROFILE_KEY = 'ashline-profile';

  const MAP_THEMES = [
    {ground:'#22251f',grid:'#30342b',fog:'#7e4b2a',decor:'#494539'},
    {ground:'#18211d',grid:'#233229',fog:'#557333',decor:'#405548'},
    {ground:'#202326',grid:'#30363a',fog:'#596168',decor:'#4b5257'},
    {ground:'#182328',grid:'#26363b',fog:'#396678',decor:'#3b535b'},
    {ground:'#271b1a',grid:'#392624',fog:'#a33726',decor:'#503834'}
  ];
  const MAP_BOSSES = [
    ['הטוחן','THE GRINDER'],['אם הנבגים','MOTHER SPORE'],['יחידה אפס','UNIT ZERO'],['הטובע','THE DROWNER'],['מלך המתים','KING OF THE DEAD'],
    ['השוחט','THE BUTCHER'],['הכוורת','THE HIVE'],['הנפח','THE FORGEMASTER'],['הצורח','THE SCREAMER'],['המזהם','THE CORRUPTOR'],
    ['השומר','THE WARDEN'],['שובר העצמות','BONEBREAKER'],['התאום','THE TWIN'],['הרעב','THE HUNGER'],['הנופל','THE FALLEN'],
    ['המכונה','THE MACHINE'],['המלכה','THE QUEEN'],['בעל הקרניים','THE HORNED ONE'],['תהום אפס','VOID ZERO'],['האחרון','THE LAST ONE']
  ];
  const REGIONS = Array.from({length:20},(_,index)=>({
    ...MAP_THEMES[index%MAP_THEMES.length],waves:3,
    name:`מפה ${index+1}`,nameEn:`MAP ${index+1}`,boss:MAP_BOSSES[index][0],bossEn:MAP_BOSSES[index][1]
  }));

  const ENEMY = {
    walker: { hp:43.01, speed:62.92, r:15, damage:10, color:'#657258', reward:8, label:'נגוע' },
    batter: { hp:43.01, speed:62.92, r:16, damage:11.2, color:'#596354', reward:11, label:'חובט' },
    runner: { hp:29.095, speed:114.4, r:12, damage:8, color:'#9b713c', reward:12, label:'רץ' },
    spitter: { hp:53.13, speed:46.2, r:16, damage:15, color:'#799b3b', reward:18, label:'יורק' },
    tank: { hp:158.125, speed:33, r:23, damage:22, color:'#6d5148', reward:28, label:'מוחץ' },
    bomber: { hp:40.48, speed:79.2, r:15, damage:30, color:'#bd6438', reward:20, label:'נפוח' }
  };

  const WEAPONS = [
    {id:'bat',name:'מחבט',en:'BASEBALL BAT',rarity:'common',weight:0,damage:20,damageText:'20',fireRate:1.35,reload:0,move:1,mag:1,pellets:1,spread:0,speed:0,range:72,arc:1.35,melee:true,icon:'▰'},
    {id:'bow',name:'קשת',en:'SURVIVOR BOW',rarity:'common',weight:20,damage:25,damageText:'25',fireRate:.5,reload:0,move:1,mag:1,pellets:1,spread:.018,speed:540,range:900,infiniteAmmo:true,arrow:true,icon:'➶'},
    {id:'pistol',name:'אקדח שירות',en:'SERVICE PISTOL',rarity:'common',weight:32,damage:16.25,damageText:'16.25',fireRate:4.2,reload:1.1,move:1,mag:12,pellets:1,spread:.035,speed:850,range:520,icon:'⌖',crop:[22,86]},
    {id:'revolver',name:'רבולבר',en:'REVOLVER',rarity:'common',weight:29,damage:45.5,damageText:'45.5',fireRate:1.8,reload:1.7,move:.92,mag:6,pellets:1,spread:.025,speed:900,range:900,icon:'✦',crop:[276,86]},
    {id:'sword',name:'חרב',en:'SURVIVOR SWORD',rarity:'uncommon',weight:12,damage:45.5,damageText:'45.5',fireRate:1.55,reload:0,move:.98,mag:1,pellets:1,spread:0,speed:0,range:92,arc:1.45,melee:true,icon:'⚔',image:'assets/blue-glow-sword.png'},
    {id:'smg',name:'SMG',en:'SMG',rarity:'uncommon',weight:22,damage:9.1,damageText:'9.1',fireRate:11,reload:1.4,move:.96,mag:32,pellets:1,spread:.075,speed:820,range:620,icon:'≋',crop:[531,86]},
    {id:'assault',name:'רובה סער',en:'ASSAULT RIFLE',rarity:'uncommon',weight:10,damage:20.8,damageText:'20.8',fireRate:6.5,reload:1.8,move:.88,mag:24,pellets:1,spread:.045,speed:900,range:980,icon:'➳',crop:[785,86]},
    {id:'burst',name:'רובה צרורות',en:'BURST RIFLE',rarity:'rare',weight:5,damage:18.2,damageText:'18.2×3',fireRate:2.2,reload:1.9,move:.88,mag:18,pellets:3,spread:.025,speed:920,range:1000,icon:'⋮',crop:[1042,86]},
    {id:'shotgun',name:'שוטגאן',en:'SHOTGUN',rarity:'uncommon',weight:12,damage:11.7,damageText:'11.7×5',fireRate:1.2,reload:2.2,move:.82,mag:6,pellets:5,spread:.16,speed:760,range:430,icon:'≋',crop:[22,299]},
    {id:'sniper',name:'סנייפר',en:'SNIPER',rarity:'rare',weight:4,damage:91,damageText:'91',fireRate:.75,reload:2.6,move:.76,mag:5,pellets:1,spread:.006,speed:1250,range:0,fullMap:true,icon:'⊕',crop:[276,299]},
    {id:'lmg',name:'מקלע LMG',en:'LMG',rarity:'rare',weight:3,damage:15.6,damageText:'15.6',fireRate:8,reload:3.4,move:.70,mag:60,pellets:1,spread:.065,speed:850,range:900,icon:'▤',crop:[531,299]},
    {id:'crossbow',name:'קשת מוצלבת',en:'CROSSBOW',rarity:'uncommon',weight:8,damage:74.75,damageText:'74.75',fireRate:.8,reload:1.5,move:.90,mag:1,pellets:1,spread:.008,speed:700,range:1100,pierce:1,icon:'➴',crop:[785,299]},
    {id:'flamethrower',name:'להביור',en:'FLAMETHROWER',rarity:'rare',weight:2,damage:6.5,damageText:'6.5/פעימה',fireRate:14,reload:4,move:.68,mag:80,pellets:1,spread:.16,speed:390,range:240,flame:true,icon:'♨',crop:[1042,299]},
    {id:'tesla',name:'רובה טסלה',en:'TESLA GUN',rarity:'epic',weight:1.2,damage:29.25,damageText:'29.25 + שרשרת',fireRate:2.5,reload:2.4,move:.84,mag:12,pellets:1,spread:.025,speed:920,range:720,chain:2,icon:'ϟ',crop:[22,519]},
    {id:'acid',name:'משגר חומצה',en:'ACID LAUNCHER',rarity:'epic',weight:1,damage:35.75,damageText:'35.75 + רעל',fireRate:1.2,reload:2.8,move:.78,mag:8,pellets:1,spread:.04,speed:600,range:620,poison:3,icon:'☣',crop:[276,519]},
    {id:'grenade',name:'מטול רימונים',en:'GRENADE LAUNCHER',rarity:'epic',weight:.8,damage:78,damageText:'78 אזורי',fireRate:.65,reload:3,move:.72,mag:4,pellets:1,spread:.035,speed:520,range:680,splash:110,icon:'✹',crop:[531,519]},
    {id:'railgun',name:'Railgun',en:'RAILGUN',rarity:'legendary',weight:1,damage:123.5,damageText:'123.5 חודר',fireRate:.45,reload:3.5,move:.65,mag:3,pellets:1,spread:0,speed:1500,range:0,fullMap:true,pierce:8,icon:'═',crop:[785,519]},
    {id:'bone',name:'תותח עצמות',en:'BONE CANNON',rarity:'legendary',weight:1,damage:55.25,damageText:'55.25 אזורי',fireRate:1.1,reload:2.7,move:.74,mag:6,pellets:1,spread:.045,speed:650,range:720,splash:85,icon:'☠',crop:[1042,519]}
  ];
  const WEAPON_BY_ID=Object.fromEntries(WEAPONS.map(w=>[w.id,w]));
  const RARITY_LABEL={common:'נפוץ',uncommon:'לא נפוץ',rare:'נדיר',epic:'אפי',legendary:'אגדי'};
  const RARITY_LABEL_EN={common:'COMMON',uncommon:'UNCOMMON',rare:'RARE',epic:'EPIC',legendary:'LEGENDARY'};

  const UPGRADES = [
    { id:'damage', icon:'✦', title:'קליעים מחושלים', titleEn:'FORGED ROUNDS', text:'+10% נזק לכל קליע', textEn:'+10% damage per bullet', base:60, max:3 },
    { id:'fireRate', icon:'⌁', title:'מנגנון מואץ', titleEn:'ACCELERATED ACTION', text:'+18% קצב אש', textEn:'+18% fire rate', base:70, max:3 },
    { id:'mag', icon:'▥', title:'מחסנית מורחבת', titleEn:'EXTENDED MAG', text:'+4 כדורים במחסנית', textEn:'+4 rounds per magazine', base:55, max:3 },
    { id:'health', icon:'✚', title:'שריון שדה', titleEn:'FIELD ARMOR', text:'+20 חיים ומילוי מלא', textEn:'+20 max health and full heal', base:75, max:3 },
    { id:'speed', icon:'»', title:'מגפיים טקטיים', titleEn:'TACTICAL BOOTS', text:'+10% מהירות תנועה', textEn:'+10% movement speed', base:65, max:3 },
    { id:'armor', icon:'⬡', title:'לוחות מיגון', titleEn:'ARMOR PLATES', text:'+25 נקודות מיגון', textEn:'+25 shield capacity', base:80, max:3 },
    { id:'shotgun', icon:'≋', title:'פיצול קליע', titleEn:'SPLIT SHOT', text:'+2 קליעים, פחות נזק לכל אחד', textEn:'+2 projectiles with lower damage each', base:130, max:3 },
    { id:'reload', icon:'↻', title:'טען מהיר', titleEn:'FAST RELOAD', text:'טעינה מהירה ב־20%', textEn:'Reload 20% faster', base:90, max:3 },
    { id:'poison', icon:'☣', title:'תחמושת רעילה', titleEn:'TOXIC AMMO', text:'הרעל ממשיך לפגוע באויב לאחר הירי', textEn:'Poison keeps damaging enemies', base:110, max:3 },
    { id:'frost', icon:'❄', title:'קליעי קיפאון', titleEn:'FROST ROUNDS', text:'פגיעות מאטות אויבים לזמן קצר', textEn:'Hits briefly slow enemies', base:105, max:3 },
    { id:'explosive', icon:'✹', title:'אבק שריפה', titleEn:'VOLATILE POWDER', text:'סיכוי שקליע יתפוצץ ויפגע באזור', textEn:'Chance for bullets to explode', base:125, max:3 },
    { id:'recovery', icon:'♡', title:'אדרנלין קרבי', titleEn:'COMBAT ADRENALINE', text:'כל דרגה: +1 חיים בכל חיסול', textEn:'Each level: +1 health per kill', base:100, max:3 },
    { id:'knives', icon:'✣', title:'טבעת סכינים', titleEn:'BLADE RING', text:'סכינים מסתובבות גורמות 15 נזק במגע', textEn:'Orbiting knives deal 15 contact damage', base:120, max:3 }
  ];
  const RANGED_ONLY_UPGRADES=new Set(['mag','shotgun','reload','poison','frost','explosive']);

  const UI_TEXT={
    he:{pageTitle:'מתקפת הזומבים — משחק הישרדות',fullscreen:'מסך מלא',exitFullscreen:'יציאה ממסך מלא',pause:'עצור',eyebrow:'העולם נפל. אתה עדיין עומד.',titleFirst:'מתקפת',titleSecond:'הזומבים',tagline:'פרוץ דרך 20 מפות, חסל את המוטציות ושדרג את הנשק לפני שהם ימצאו אותך.',start:'התחל מסע',continue:'המשך משלב שמור',deleteUser:'מחק משתמש',move:'תנועה',mouse:'עכבר',aimFire:'כיוון ותקיפה',reload:'טעינה',reloading:'טוען...',keysWheel:'1–9 / גלגלת',switchWeapon:'החלפת נשק',mutantThreat:'איום מוטנטי',pausedLabel:'המשחק נעצר',pausedTitle:'הקרב מחכה לך',pausedText:'ההתקדמות נשמרת רק כשיוצאים. מוות לא משנה את השמירה האחרונה שלך.',resume:'המשך במשחק',saveExit:'שמור וצא לתפריט',settingsLabel:'מערכת',settings:'הגדרות',playerName:'שם השחקן',saveName:'שמור שם',controlMode:'מצב שליטה',computer:'מחשב',phone:'טלפון',language:'שפה',closeSettings:'סגור הגדרות',workbench:'שולחן עבודה',chooseUpgrade:'בחר שדרוג',upgradeHelp:'כל בחירה משנה את סגנון הלחימה. בחר בחוכמה לפני הגל הבא.',skipUpgrade:'המשך ללא שדרוג',bossLoot:'שלל מהבוס',chooseWeapon:'בחר נשק חדש',weaponHelp:'מוצגים רק נשקים שעדיין לא אספת. ככל שיש לך יותר נשקים, הסיכוי לנדירים עולה.',beforeBattle:'לפני שיוצאים לקרב',howPlaying:'איך אתה משחק?',deviceHelp:'נציג רק את אמצעי השליטה שמתאימים למכשיר שלך.',viaComputer:'דרך המחשב',desktopControls:'מקלדת, עכבר וכוונת',wasdMouse:'WASD + עכבר',viaPhone:'דרך הטלפון',mobileControls:'ג׳ויסטיק וכפתורי מגע',screenControls:'שליטה על המסך',back:'חזרה',welcomeAshline:'ברוך הבא למתקפת הזומבים',whatName:'איך קוראים לך?',profileHelp:'השם והתקדמות המשחק יישמרו באופן פרטי בדפדפן הזה.',nameRequired:'צריך להקליד שם כדי להמשיך',createUser:'צור משתמש',lineBroken:'הקו נפרץ',fellBattle:'נפלת בקרב',tryAgain:'נסה שוב',backMenu:'חזרה לתפריט',lightReturned:'האור חזר',survived:'שרדת את מתקפת הזומבים',newJourney:'מסע חדש',fire:'תקיפה',weaponEquipped:'נשק הוחלף',sector:'מפה',mutationWarning:'אזהרה // מוטציה',incomingWave:'גל נכנס',wave:'גל',bossFight:'קרב בוס',loaded:'נטען!',poison:'רעל',burning:'בוער',ignited:'נדלקת!',health:'+15 חיים',shield:'+20 מגן',needShield:'צריך שדרוג מגן',oneFree:'בחירה אחת · חינם',currentLevel:'רמה נוכחית',freeUpgrade:'חינם · שדרוג לרמה',currentChance:'סיכוי נוכחי',damage:'נזק',fireRateStat:'קצב אש',reloadStat:'טעינה',range:'טווח',fullMap:'כל המפה',movement:'תנועה',perSecond:'/ש׳',seconds:'שנ׳',newWeapon:'נשק חדש נאסף',kills:'חיסולים',reachedSector:'הגעת למפה',weaponsCollected:'נשקים נאספו',hello:'שלום',profileSaved:'ההתקדמות שלך נשמרת בדפדפן הזה.',currentUser:'הנוכחי',deleteConfirm:'למחוק את המשתמש {name} ואת כל ההתקדמות שלו?',nameSaved:'השם נשמר',settingsTitle:'הגדרות',saveFailed:'השמירה נכשלה'},
    en:{pageTitle:'ZOMBIE ATTACK — Survival Game',fullscreen:'Fullscreen',exitFullscreen:'Exit Fullscreen',pause:'Pause',eyebrow:'The world fell. You are still standing.',titleFirst:'ZOMBIE',titleSecond:'ATTACK',tagline:'Fight through 20 maps, destroy mutations, and upgrade your arsenal before they find you.',start:'START JOURNEY',continue:'CONTINUE SAVED RUN',deleteUser:'Delete User',move:'Move',mouse:'Mouse',aimFire:'Aim & Attack',reload:'Reload',reloading:'RELOADING...',keysWheel:'1–9 / Wheel',switchWeapon:'Switch Weapon',mutantThreat:'MUTANT THREAT',pausedLabel:'GAME PAUSED',pausedTitle:'The fight can wait',pausedText:'Progress is saved only when you exit. Dying does not change your last save.',resume:'RESUME GAME',saveExit:'SAVE & EXIT TO MENU',settingsLabel:'SYSTEM',settings:'SETTINGS',playerName:'Player Name',saveName:'Save Name',controlMode:'Control Mode',computer:'Computer',phone:'Phone',language:'Language',closeSettings:'CLOSE SETTINGS',workbench:'WORKBENCH',chooseUpgrade:'CHOOSE AN UPGRADE',upgradeHelp:'Every choice changes your combat style. Choose wisely before the next wave.',skipUpgrade:'CONTINUE WITHOUT UPGRADE',bossLoot:'BOSS LOOT',chooseWeapon:'CHOOSE A NEW WEAPON',weaponHelp:'Only unowned weapons appear. Rare loot becomes more likely as your arsenal grows.',beforeBattle:'BEFORE DEPLOYMENT',howPlaying:'How are you playing?',deviceHelp:'Only controls suited to your device will be shown.',viaComputer:'On Computer',desktopControls:'Keyboard, mouse, and crosshair',wasdMouse:'WASD + Mouse',viaPhone:'On Phone',mobileControls:'Joystick and touch buttons',screenControls:'On-screen controls',back:'BACK',welcomeAshline:'WELCOME TO ZOMBIE ATTACK',whatName:'What is your name?',profileHelp:'Your name and progress are stored privately in this browser.',nameRequired:'Enter a name to continue',createUser:'CREATE USER',lineBroken:'THE LINE BROKE',fellBattle:'You fell in battle',tryAgain:'TRY AGAIN',backMenu:'BACK TO MENU',lightReturned:'THE LIGHT RETURNED',survived:'You survived Zombie Attack',newJourney:'NEW JOURNEY',fire:'ATTACK',weaponEquipped:'WEAPON EQUIPPED',sector:'MAP',mutationWarning:'WARNING // MUTATION',incomingWave:'INCOMING WAVE',wave:'WAVE',bossFight:'BOSS FIGHT',loaded:'LOADED!',poison:'POISON',burning:'BURNING',ignited:'IGNITED!',health:'+15 HEALTH',shield:'+20 SHIELD',needShield:'SHIELD UPGRADE REQUIRED',oneFree:'ONE CHOICE · FREE',currentLevel:'CURRENT LEVEL',freeUpgrade:'FREE · UPGRADE TO LEVEL',currentChance:'CURRENT CHANCE',damage:'DAMAGE',fireRateStat:'FIRE RATE',reloadStat:'RELOAD',range:'RANGE',fullMap:'FULL MAP',movement:'MOVEMENT',perSecond:'/s',seconds:'sec',newWeapon:'NEW WEAPON ACQUIRED',kills:'KILLS',reachedSector:'REACHED MAP',weaponsCollected:'WEAPONS COLLECTED',hello:'Hello',profileSaved:'your progress is stored in this browser.',currentUser:'current user',deleteConfirm:'Delete {name} and all saved progress?',nameSaved:'Name saved',settingsTitle:'Settings',saveFailed:'Save failed'}
  };

  Object.assign(UI_TEXT.he,{starterLabel:'ציוד התחלתי',starterTitle:'עם מה יוצאים לדרך?',starterHelp:'בחר נשק אחד להתחלת המסע. בהמשך תוכל לאסוף נשקים נוספים.',starterPistol:'אקדח שירות',starterPistolHelp:'מאוזן, מהיר ומתאים לטווח בינוני',starterBat:'מחבט',starterBatHelp:'חזק מקרוב, ללא תחמושת',starterBow:'קשת',starterBowHelp:'חלשה אך שקטה — חץ כל 2 שניות',starterPistolStats:'16.25 · 4.2 / ש׳',starterBatStats:'20 · 1.35 / ש׳',starterBowStats:'25 · 2 שנ׳ לירייה'});
  Object.assign(UI_TEXT.en,{starterLabel:'STARTING GEAR',starterTitle:'WHAT WILL YOU CARRY?',starterHelp:'Choose one weapon for the start of this run. You can collect more later.',starterPistol:'SERVICE PISTOL',starterPistolHelp:'Balanced, fast, and suited to medium range',starterBat:'BASEBALL BAT',starterBatHelp:'Strong up close, no ammunition needed',starterBow:'SURVIVOR BOW',starterBowHelp:'Weak but quiet — one arrow every 2 seconds',starterPistolStats:'16.25 · 4.2 /s',starterBatStats:'20 · 1.35 /s',starterBowStats:'25 · 2 sec per shot'});

  let W=0,H=0,last=0,state='menu',region=0,wave=0,kills=0,scrap=0,shake=0,slowMo=1,pickupProgress=0;
  let enemies=[],bullets=[],particles=[],pickups=[],enemyShots=[],decor=[],floaters=[];
  let spawnQueue=[],spawnTimer=0,waveCooldown=0,boss=null, announcementTimer=0;
  let mouse={x:0,y:0,down:false},keys={},audio=null,audioMaster=null,shotNoiseBuffer=null;
  let mobileMove={x:0,y:0}, mobileFiring=false, pendingContinue=false, deviceMode=null;
  let profile=null,language='he',settingsPreviousState='menu',sideNotificationTimer=0;

  const player = {
    x:0,y:0,r:14,hp:100,maxHp:100,armor:0,maxArmor:0,speed:147,
    angle:0,ammo:1,mag:1,reloading:0,reloadTime:0,fireCooldown:0,fireRate:1.35,damage:20,
    pierce:0,pellets:1,poison:0,frost:0,explosive:0,healOnKill:0,knives:0,burnTime:0,burnTick:0,invuln:0,flash:0,meleeSwing:0,
    currentWeapon:'bat',ownedWeapons:['bat'],weaponAmmo:{bat:1},upgrades:{}
  };

  function t(key){return (UI_TEXT[language]||UI_TEXT.he)[key]||UI_TEXT.he[key]||key;}
  function regionName(r){return language==='en'?r.nameEn:r.name;}
  function bossName(r){return language==='en'?r.bossEn:r.boss;}
  function weaponName(w){return language==='en'?w.en:w.name;}
  function rarityName(rarity){return (language==='en'?RARITY_LABEL_EN:RARITY_LABEL)[rarity];}
  function weaponDamageText(w){
    if(language!=='en')return w.damageText;
    return {flamethrower:'6.5/tick',tesla:'29.25 + chain',acid:'35.75 + poison',grenade:'78 area',railgun:'123.5 pierce',bone:'55.25 area'}[w.id]||w.damageText;
  }

  function persistProfile(){
    if(!profile)return;
    try {localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));} catch(err){console.warn('Could not save player profile:',err);}
  }

  function applyLanguage(nextLanguage=language){
    language=nextLanguage==='en'?'en':'he';
    document.documentElement.lang=language;document.documentElement.dir=language==='en'?'ltr':'rtl';
    document.body.classList.toggle('lang-en',language==='en');
    document.querySelectorAll('[data-i18n]').forEach(el=>{const value=t(el.dataset.i18n);if(value)el.textContent=value;});
    document.title=t('pageTitle');
    $('player-name-input').placeholder=language==='en'?'Enter a name...':'הקלד שם...';
    $('settings-btn').title=t('settings');$('settings-btn').setAttribute('aria-label',t('settings'));
    $('pause-btn').title=language==='en'?'Pause game (Esc)':'עצירת המשחק (Esc)';
    if(profile?.name)showProfile();
    updateHud();renderWeaponBar();syncFullscreenButton();refreshSettingsSelection();
  }

  function applyDeviceMode(mode,persist=false){
    deviceMode=mode==='mobile'?'mobile':'desktop';
    document.body.classList.remove('mode-desktop','mode-mobile');
    document.body.classList.add(`mode-${deviceMode}`);
    if(persist&&profile){profile.deviceMode=deviceMode;persistProfile();}
    refreshSettingsSelection();
  }

  function refreshSettingsSelection(){
    if(!$('settings-desktop'))return;
    $('settings-desktop').classList.toggle('active',deviceMode==='desktop');
    $('settings-mobile').classList.toggle('active',deviceMode==='mobile');
    $('language-he').classList.toggle('active',language==='he');
    $('language-en').classList.toggle('active',language==='en');
  }

  function openSettings(){
    if(!profile||!['menu','playing','paused'].includes(state))return;
    settingsPreviousState=state;state='settings';mouse.down=false;mobileFiring=false;
    $('settings-name-input').value=profile.name;$('settings-name-status').textContent='';
    $('settings-screen').classList.remove('hidden');$('settings-btn').classList.add('hidden');
    if(settingsPreviousState==='playing')$('pause-btn').classList.add('hidden');
    refreshSettingsSelection();
  }

  function closeSettings(){
    if(state!=='settings')return;
    $('settings-screen').classList.add('hidden');$('settings-btn').classList.remove('hidden');
    state=settingsPreviousState;
    if(state==='playing'){$('pause-btn').classList.remove('hidden');last=performance.now();}
  }

  function saveSettingsName(){
    const name=$('settings-name-input').value.trim().replace(/\s+/g,' ').slice(0,18);
    if(!name){$('settings-name-status').textContent=t('nameRequired');return;}
    profile.name=name;persistProfile();showProfile();$('settings-name-status').textContent=t('nameSaved');
  }

  function changeLanguage(nextLanguage){
    language=nextLanguage==='en'?'en':'he';
    if(profile){profile.language=language;persistProfile();}
    applyLanguage(language);
  }

  function resize(){
    W=innerWidth; H=innerHeight;
    canvas.width=W*DPR; canvas.height=H*DPR;
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
    if(!player.x){player.x=W/2;player.y=H/2;}
    createDecor();
  }
  addEventListener('resize',resize); resize();

  function createDecor(){
    const rng=()=>Math.random(); decor=[];
    for(let i=0;i<32;i++) decor.push({x:rng()*W,y:rng()*H,r:12+rng()*46,t:i%4,a:rng()*TAU});
  }

  function refreshWeaponStats(preserveAmmo=true){
    const w=WEAPON_BY_ID[player.currentWeapon]||WEAPON_BY_ID.bat,u=player.upgrades||{};
    const previous=preserveAmmo?player.ammo:null;
    player.damage=w.damage*Math.pow(1.10,u.damage||0);
    player.fireRate=w.fireRate*Math.pow(1.18,u.fireRate||0);
    player.mag=w.mag+4*(u.mag||0);
    player.reloadTime=w.reload*Math.pow(.8,u.reload||0);
    player.pierce=w.pierce||0;
    player.pellets=w.pellets+2*(u.shotgun||0);
    const stored=player.weaponAmmo?.[w.id];
    player.ammo=Math.min(player.mag,stored??previous??player.mag);
  }

  function equipWeapon(id,announceEquip=true){
    if(!player.ownedWeapons.includes(id)||!WEAPON_BY_ID[id])return;
    if(player.currentWeapon)player.weaponAmmo[player.currentWeapon]=player.ammo;
    player.currentWeapon=id;player.reloading=0;$('reload-indicator').classList.add('hidden');
    refreshWeaponStats(false);
    if(player.weaponAmmo[id]!==undefined)player.ammo=Math.min(player.mag,player.weaponAmmo[id]);
    else player.ammo=player.mag;
    player.weaponAmmo[id]=player.ammo;
    renderWeaponBar();updateHud();
    if(announceEquip)sideNotify(t('weaponEquipped'),weaponName(WEAPON_BY_ID[id]));
    tone(360,.06,'square',.035);
  }

  function cycleWeapon(direction){
    if(state!=='playing'||player.ownedWeapons.length<2)return;
    const index=player.ownedWeapons.indexOf(player.currentWeapon);
    const next=(index+direction+player.ownedWeapons.length)%player.ownedWeapons.length;
    equipWeapon(player.ownedWeapons[next]);
  }

  function renderWeaponBar(){
    const bar=$('mobile-weapon-bar'),inventory=$('weapon-inventory-list');bar.innerHTML='';inventory.innerHTML='';
    $('weapon-inventory-title').textContent=language==='en'?'ARSENAL':'ארסנל';
    player.ownedWeapons.forEach((id,index)=>{
      const w=WEAPON_BY_ID[id],button=document.createElement('button');
      button.className=`mobile-weapon ${id===player.currentWeapon?'active':''}`;
      button.innerHTML=`<strong>${w.icon} ${weaponName(w)}</strong><span>${index+1} · ${rarityName(w.rarity)}</span>`;
      button.onclick=()=>equipWeapon(id);bar.appendChild(button);
      const inventoryButton=document.createElement('button'),shortcut=index<9?String(index+1):index===9?'0':String(index+1);
      inventoryButton.className=`inventory-weapon ${id===player.currentWeapon?'active':''}`;
      inventoryButton.title=language==='en'?`Weapon ${index+1}: ${weaponName(w)}`:`נשק ${index+1}: ${weaponName(w)}`;
      inventoryButton.innerHTML=`<span>${shortcut}</span><b>${w.icon} ${weaponName(w)}</b>`;
      inventoryButton.onclick=()=>equipWeapon(id);inventory.appendChild(inventoryButton);
    });
  }

  function reset(full=true,resumeWave=1,starterId='bat'){
    const starter=WEAPON_BY_ID[starterId]&&['bat','pistol','bow'].includes(starterId)?starterId:'bat';
    if(full){ region=0; scrap=0; kills=0; pickupProgress=0; Object.assign(player,{maxHp:100,hp:100,maxArmor:0,armor:0,speed:147,mag:1,ammo:1,reloadTime:0,fireRate:1.35,damage:20,pierce:0,pellets:1,poison:0,frost:0,explosive:0,healOnKill:0,knives:0,burnTime:0,burnTick:0,meleeSwing:0,currentWeapon:starter,ownedWeapons:[starter],weaponAmmo:{[starter]:WEAPON_BY_ID[starter].mag},upgrades:{}}); }
    enemies=[];bullets=[];particles=[];pickups=[];enemyShots=[];floaters=[];boss=null;$('boss-hud').classList.add('hidden');
    refreshWeaponStats(false);
    player.x=W/2;player.y=H/2;player.hp=player.maxHp;player.armor=player.maxArmor;player.ammo=player.mag;player.weaponAmmo[player.currentWeapon]=player.ammo;player.reloading=0;$('reload-indicator').classList.add('hidden');player.burnTime=0;player.burnTick=0;
    wave=Math.max(0,resumeWave-1); buildWave(); updateHud(); createDecor();
  }

  function askDevice(fromSave=false){
    pendingContinue=fromSave;
    if(profile?.deviceMode){chooseDevice(profile.deviceMode);return;}
    $('device-screen').classList.remove('hidden');
  }

  function chooseDevice(mode){
    applyDeviceMode(mode,true);
    mouse.x=W*.65; mouse.y=H*.5;
    $('crosshair').style.transform=`translate(${mouse.x}px,${mouse.y}px)`;
    $('device-screen').classList.add('hidden');
    if(pendingContinue)startGame(true);else openStarterChoice();
  }

  function openStarterChoice(){
    state='starter';mouse.down=false;mobileFiring=false;$('starter-screen').classList.remove('hidden');
  }

  function chooseStarter(starterId){
    $('starter-screen').classList.add('hidden');startGame(false,starterId);
  }

  function startGame(fromSave=false,starterId='bat'){
    initAudio();
    document.body.classList.add('game-running');
    $('start-screen').classList.remove('active');
    $('hud').classList.remove('hidden');$('weapon-hud').classList.remove('hidden');$('weapon-inventory').classList.remove('hidden');
    $('pause-btn').classList.remove('hidden');
    $('mobile-controls').classList.add('playing'); $('mobile-controls').classList.remove('hidden');
    if(fromSave){ loadSave(); } else reset(true,1,starterId);
    $('mobile-weapon-bar').classList.add('playing');$('mobile-weapon-bar').classList.remove('hidden');renderWeaponBar();
    state='playing';last=performance.now();
    announce(t('sector'),String(region+1).padStart(2,'0'));
  }

  function buildWave(){
    wave++;
    const r=REGIONS[region], isBoss=wave>r.waves;
    player.hp=player.maxHp;player.armor=player.maxArmor;player.burnTime=0;player.burnTick=0;
    if(isBoss&&region===0){
      const received=!player.ownedWeapons.includes('pistol');
      if(received){player.ownedWeapons.push('pistol');player.weaponAmmo.pistol=WEAPON_BY_ID.pistol.mag+4*(player.upgrades.mag||0);}
      equipWeapon('pistol',false);
      if(received)sideNotify(language==='en'?'FIRST FIREARM ACQUIRED':'הנשק הראשון התקבל',weaponName(WEAPON_BY_ID.pistol));
    }
    spawnQueue=[];
    if(isBoss){ spawnQueue.push({type:'boss'}); }
    else {
      const count=14+region*5+wave*5;
      for(let i=0;i<count;i++){
        let type='walker', roll=Math.random();
        if(region+wave>2 && roll<.20) type='runner';
        if(region>0 && roll>.80) type='spitter';
        if(region>1 && roll>.90) type='tank';
        if(region>1 && roll>.72 && roll<.82) type='bomber';
        spawnQueue.push({type});
      }
      const regularCount=spawnQueue.filter(entry=>entry.type==='walker').length;
      for(let i=0;i<Math.floor(regularCount/4);i++)spawnQueue.push({type:'batter'});
      shuffle(spawnQueue);
    }
    spawnTimer=1.6; waveCooldown=0;
    updateHud();
    setTimeout(()=>announce(isBoss?t('mutationWarning'):t('incomingWave'),isBoss?bossName(r):`${t('wave')} ${wave}`),350);
  }

  function spawnEnemy(type){
    const side=Math.floor(Math.random()*4), margin=55;
    let x,y;
    if(side===0){x=Math.random()*W;y=-margin} else if(side===1){x=W+margin;y=Math.random()*H}
    else if(side===2){x=Math.random()*W;y=H+margin}else{x=-margin;y=Math.random()*H}
    if(type==='boss'){
      const scale=1+region*.22, bossHp=(650+region*450)*scale*2.2;
      boss={x,y,r:44+Math.min(region,10)*4,hp:bossHp,maxHp:bossHp,speed:(34+region*3)*1.32,damage:(24+region*4)*1.4,color:['#744f3c','#678336','#59646b','#3a7080','#9a3328'][region%5],attack:.72,spawn:10,specialAttack:5,phase:0,name:REGIONS[region].boss,hit:0,poisonTime:0,frostTime:0};
      enemies.push(boss); $('boss-hud').classList.remove('hidden'); $('boss-name').textContent=bossName(REGIONS[region]);
      summonBossOpening(boss);
      tone(70,.25,'sawtooth',.12);
      return;
    }
    const base=ENEMY[type], waveStrength=1+(region*4+wave-1)*.05;
    enemies.push({x,y,type,r:base.r,hp:base.hp*waveStrength,maxHp:base.hp*waveStrength,speed:base.speed*(1+region*.04),damage:base.damage*waveStrength,color:base.color,reward:Math.round(base.reward*(1+region*.12)),attack:Math.random(),special:1+Math.random()*2,hit:0,dead:false,poisonTime:0,frostTime:0});
  }

  function update(dt){
    if(state!=='playing') return;
    dt=Math.min(dt,.033)*slowMo;
    player.fireCooldown=Math.max(player.fireCooldown-dt,-dt);player.invuln-=dt;player.flash-=dt;player.meleeSwing=Math.max(0,player.meleeSwing-dt);
    if(shake>0) shake=Math.max(0,shake-dt*22);
    if(announcementTimer>0) announcementTimer-=dt;
    if(mobileFiring) aimMobileAtNearest();
    movePlayer(dt);
    updateSpawns(dt);
    updateBullets(dt);updateKnives(dt);updateEnemies(dt);updateEnemyShots(dt);updatePlayerBurn(dt);updateParticles(dt);updatePickups(dt);
    if(player.reloading>0){
      player.reloading-=dt;
      if(player.reloading<=0){
        player.ammo=player.mag;player.weaponAmmo[player.currentWeapon]=player.ammo;$('reload-indicator').classList.add('hidden');
        floaters.push({x:player.x,y:player.y-34,text:t('loaded'),life:.65,color:'#ffb15c',big:true});
        for(let i=0;i<9;i++)particle(player.x,player.y,'#ff9a45',2,75,i/9*TAU);
        tone(520,.06,'square',.035);
      }
    }
    if((mouse.down||mobileFiring) && player.reloading<=0) fire();
    const activeWeapon=WEAPON_BY_ID[player.currentWeapon]||WEAPON_BY_ID.bat;
    if(!activeWeapon.melee&&!activeWeapon.infiniteAmmo&&player.ammo<=0&&player.reloading<=0)reload();
    updateHud();
  }

  function movePlayer(dt){
    let dx=(keys.KeyD?1:0)-(keys.KeyA?1:0)+mobileMove.x;
    let dy=(keys.KeyS?1:0)-(keys.KeyW?1:0)+mobileMove.y;
    const len=Math.hypot(dx,dy)||1; if(Math.abs(dx)+Math.abs(dy)>1){dx/=len;dy/=len;}
    const weaponMove=(WEAPON_BY_ID[player.currentWeapon]||WEAPON_BY_ID.bat).move;
    player.x+=dx*player.speed*weaponMove*dt; player.y+=dy*player.speed*weaponMove*dt;
    player.x=Math.max(player.r,Math.min(W-player.r,player.x)); player.y=Math.max(70+player.r,Math.min(H-player.r,player.y));
    const aim=getAimTarget();
    const aimX=aim ? aim.x : mouse.x, aimY=aim ? aim.y : mouse.y;
    player.angle=Math.atan2(aimY-player.y,aimX-player.x);
    $('crosshair').classList.toggle('locked',!!aim);
  }

  function getAimTarget(){
    if(deviceMode==='mobile') return null;
    let target=null,best=64;
    for(const e of enemies){
      const d=Math.hypot(e.x-mouse.x,e.y-mouse.y);
      if(d<best+e.r*.35){best=d;target=e;}
    }
    return target;
  }

  function aimMobileAtNearest(){
    let nearest=null,best=Infinity;
    for(const e of enemies){const d=Math.hypot(e.x-player.x,e.y-player.y);if(d<best){best=d;nearest=e;}}
    if(nearest){mouse.x=nearest.x;mouse.y=nearest.y;}
  }

  function fire(){
    if(player.fireCooldown>0||player.reloading>0)return;
    const w=WEAPON_BY_ID[player.currentWeapon]||WEAPON_BY_ID.bat;
    if(w.melee){meleeAttack(w);return;}
    if(!w.infiniteAmmo&&player.ammo<=0)return;
    const shotRange=w.fullMap?Math.hypot(W,H)+120:w.range;
    player.fireCooldown+=1/player.fireRate;
    if(!w.infiniteAmmo){player.ammo--;player.weaponAmmo[player.currentWeapon]=player.ammo;}
    player.flash=.06;
    for(let i=0;i<player.pellets;i++){
      const spread=player.pellets>1?(i-(player.pellets-1)/2)*w.spread+(Math.random()-.5)*w.spread*.35:(Math.random()-.5)*w.spread;
      const a=player.angle+spread,color=w.flame?'#ff7b2d':w.id==='tesla'?'#63d8ff':w.id==='acid'?'#9bd342':'#f5ddae';
      bullets.push({x:player.x+Math.cos(a)*22,y:player.y+Math.sin(a)*22,vx:Math.cos(a)*w.speed,vy:Math.sin(a)*w.speed,r:w.arrow?3:w.flame?7:5,life:shotRange/w.speed,damage:player.damage,left:player.pierce,hits:[],poison:Math.max(player.poison,w.poison||0),frost:player.frost,explosive:player.explosive,splash:w.splash||0,chain:w.chain||0,color,flame:!!w.flame,arrow:!!w.arrow});
    }
    const recoil=Math.min(5,1.2+w.damage/55);player.x-=Math.cos(player.angle)*recoil;player.y-=Math.sin(player.angle)*recoil;shake=Math.max(shake,w.splash?5:2.1);
    for(let i=0;i<4;i++)particle(player.x+Math.cos(player.angle)*24,player.y+Math.sin(player.angle)*24,'#ffbd62',2,130,player.angle);
    playGunshot(w);
  }

  function meleeAttack(w){
    player.fireCooldown+=1/player.fireRate;player.meleeSwing=.22;player.flash=.05;
    const hitRange=w.range||72,halfArc=(w.arc||1.3)/2;
    for(const e of [...enemies]){
      if(e.dead)continue;
      const dx=e.x-player.x,dy=e.y-player.y,dist=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
      const difference=Math.atan2(Math.sin(angle-player.angle),Math.cos(angle-player.angle));
      if(dist>hitRange+e.r||Math.abs(difference)>halfArc)continue;
      e.hp-=player.damage;e.hit=.12;
      if(w.id==='sword'&&player.poison){e.poisonTime=2.8;e.poisonDps=Math.max(e.poisonDps||0,player.damage*(.1+player.poison*.05));e.dotTick=0;}
      if(w.id==='sword'&&player.frost){e.frostTime=1.8;e.frostSlow=Math.min(.55,player.frost*.14);}
      const push=e===boss?5:13;e.x+=Math.cos(angle)*push;e.y+=Math.sin(angle)*push;
      floaters.push({x:e.x,y:e.y-e.r,text:Math.round(player.damage),life:.55,color:w.id==='sword'?'#e8f3f5':'#f1d0a0',big:false});
      for(let i=0;i<7;i++)particle(e.x,e.y,w.id==='sword'?'#dce9ed':'#b88b58',2,105,angle);
      if(e.hp<=0)killEnemy(e);
    }
    shake=Math.max(shake,w.id==='sword'?4:3);
    tone(w.id==='sword'?420:115,.09,w.id==='sword'?'triangle':'square',.04);
  }

  function reload(){
    const w=WEAPON_BY_ID[player.currentWeapon]||WEAPON_BY_ID.bat;
    if(w.melee||w.infiniteAmmo)return;
    if(player.reloading<=0&&player.ammo<player.mag){player.reloading=player.reloadTime;$('reload-indicator').classList.remove('hidden');tone(280,.05,'square',.025);}
  }

  function updateSpawns(dt){
    if(spawnQueue.length){ spawnTimer-=dt; if(spawnTimer<=0){spawnEnemy(spawnQueue.shift().type);spawnTimer=boss ? 1.2 : Math.max(.18,.62-region*.05-wave*.03);} return; }
    if(enemies.length===0){
      waveCooldown+=dt;
      if(waveCooldown>1.6){
        if(wave>REGIONS[region].waves){ completeRegion(); }
        else openShop();
        waveCooldown=-999;
      }
    }
  }

  function updateBullets(dt){
    for(let i=bullets.length-1;i>=0;i--){
      const b=bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      let remove=b.life<=0||b.x<-20||b.x>W+20||b.y<-20||b.y>H+20;
      for(const e of [...enemies]){
        if(remove)break;
        if(e.dead||b.hits.includes(e))continue;
        if(Math.hypot(b.x-e.x,b.y-e.y)<b.r+e.r+3){
          b.hits.push(e);e.hp-=b.damage;e.hit=.09;floaters.push({x:e.x,y:e.y-e.r,text:Math.round(b.damage),life:.55,color:'#f1e6cf',big:false});
          if(b.poison){e.poisonTime=2.8;e.poisonDps=Math.max(e.poisonDps||0,player.damage*(.1+b.poison*.05));e.dotTick=0;}
          if(b.frost){e.frostTime=1.8;e.frostSlow=Math.min(.55,b.frost*.14);}
          if(b.flame){e.burnTime=5;e.burnDps=5;e.burnTick=0;}
          if(b.explosive&&Math.random()<b.explosive*.1)splashDamage(e.x,e.y,58+b.explosive*8,b.damage*.38,e);
          if(b.splash)splashDamage(e.x,e.y,b.splash,b.damage*.72,e);
          if(b.chain)chainDamage(e,b.chain,b.damage*.68);
          for(let k=0;k<5;k++)particle(b.x,b.y,e.color,2,120);
          if(e.hp<=0) killEnemy(e);
          if(b.left>0)b.left--;else remove=true;
        }
      }
      if(remove)bullets.splice(i,1);
    }
  }

  function updateEnemies(dt){
    for(let i=enemies.length-1;i>=0;i--){
      const e=enemies[i]; if(e.dead)continue; e.hit-=dt;e.attack-=dt;e.special-=dt;
      if(updateStatusEffects(e,dt))continue;
      const a=Math.atan2(player.y-e.y,player.x-e.x), dist=Math.hypot(player.x-e.x,player.y-e.y);
      if(e===boss){ updateBoss(e,a,dist,dt); continue; }
      const statusSpeed=e.frostTime>0?1-(e.frostSlow||0):1;
      if(e.type==='spitter'){
        if(dist<460&&e.attack<=0){enemyShots.push({x:e.x,y:e.y,vx:Math.cos(a)*290.95,vy:Math.sin(a)*290.95,r:7,life:2.3,damage:15,color:'#a8cf4b',burning:e.burnTime>0});e.attack=1.8/1.18;playEnemyShot();}
        if(dist<315){e.x-=Math.cos(a)*e.speed*statusSpeed*dt;e.y-=Math.sin(a)*e.speed*statusSpeed*dt;}
        else if(dist>405){e.x+=Math.cos(a)*e.speed*.7*statusSpeed*dt;e.y+=Math.sin(a)*e.speed*.7*statusSpeed*dt;}
        else {const strafe=a+Math.PI/2;e.x+=Math.cos(strafe)*e.speed*.28*statusSpeed*dt;e.y+=Math.sin(strafe)*e.speed*.28*statusSpeed*dt;}
      } else {
        const crowd=separate(e); e.x+=(Math.cos(a)+crowd.x)*e.speed*statusSpeed*dt;e.y+=(Math.sin(a)+crowd.y)*e.speed*statusSpeed*dt;
      }
      if(dist<e.r+player.r+3&&e.attack<=0){
        e.attack=e.type==='runner'?.72:1.05; hitPlayer(e.damage,a);
        if(e.burnTime>0)ignitePlayer();
        if(e.type==='bomber'){explode(e.x,e.y,95,e.damage);killEnemy(e,false);}
      }
    }
  }

  function updateBoss(e,a,dist,dt){
    e.phase=1-e.hp/e.maxHp;
    const statusSpeed=e.frostTime>0?1-(e.frostSlow||0):1;
    if(dist>e.r+player.r+5){e.x+=Math.cos(a)*e.speed*statusSpeed*(1+e.phase*.7)*dt;e.y+=Math.sin(a)*e.speed*statusSpeed*(1+e.phase*.7)*dt;}
    if(dist<e.r+player.r+7&&e.attack<=0){hitPlayer(e.damage,a);if(e.burnTime>0)ignitePlayer();e.attack=.75-e.phase*.22;shake=12;}
    e.spawn-=dt;
    if(e.spawn<=0){
      const summonTypes=['walker','batter','runner','spitter','tank','bomber'],offset=Math.random()*TAU;
      summonTypes.forEach((type,index)=>summonBossMinion(e,type,offset+index/summonTypes.length*TAU,92+(index%2)*24));
      e.spawn=10;tone(62,.2,'sawtooth',.045);
    }
    e.specialAttack-=dt;
    if(e.specialAttack<=0){
      const shots=Math.ceil((8+region)*1.1),offset=performance.now()*.001,shotSpeed=(225+region*8)*1.1;
      for(let n=0;n<shots;n++){
        const angle=offset+n/shots*TAU;
        enemyShots.push({x:e.x+Math.cos(angle)*e.r,y:e.y+Math.sin(angle)*e.r,vx:Math.cos(angle)*shotSpeed,vy:Math.sin(angle)*shotSpeed,r:8,life:3,damage:11+region*2,color:'#ef663d',burning:e.burnTime>0});
      }
      e.specialAttack=Math.max(4.2,6.8-e.phase*1.8)/1.1;shake=9;tone(58,.28,'sawtooth',.075);
    }
  }

  function summonBossOpening(e){
    const types=[...Array(5).fill('spitter'),...Array(5).fill('runner'),...Array(5).fill('walker')];
    shuffle(types).forEach((type,i)=>summonBossMinion(e,type,i/types.length*TAU,85+(i%3)*24));
  }

  function summonBossMinion(e,type,angle,distance){
    const base=ENEMY[type],waveStrength=1+(region*4+wave-1)*.05,summonHp=base.hp*waveStrength;
    enemies.push({x:e.x+Math.cos(angle)*distance,y:e.y+Math.sin(angle)*distance,type,r:base.r,hp:summonHp,maxHp:summonHp,speed:base.speed*(1+region*.04),damage:base.damage*waveStrength,color:base.color,reward:base.reward,attack:1,special:1,hit:0,dead:false,poisonTime:0,frostTime:0});
  }

  function updateStatusEffects(e,dt){
    if(e.poisonTime>0){
      e.poisonTime-=dt;e.dotTick=(e.dotTick||0)-dt;e.hp-=(e.poisonDps||0)*dt;
      if(e.dotTick<=0){e.dotTick=.45;floaters.push({x:e.x,y:e.y-e.r,text:t('poison'),life:.5,color:'#a7d957',big:false});particle(e.x,e.y,'#90c74c',3,45);}
      if(e.hp<=0){killEnemy(e);return true;}
    }
    if(e.burnTime>0){
      e.burnTime-=dt;e.burnTick=(e.burnTick||0)-dt;e.hp-=(e.burnDps||5)*dt;
      if(e.burnTick<=0){e.burnTick=.42;floaters.push({x:e.x,y:e.y-e.r,text:t('burning'),life:.45,color:'#ff7937',big:false});particle(e.x+(Math.random()-.5)*e.r,e.y,'#ff6a27',3,55,-Math.PI/2);}
      if(e.hp<=0){killEnemy(e);return true;}
    }
    if(e.frostTime>0)e.frostTime-=dt;
    return false;
  }

  function knifePositions(){
    if(!player.knives)return [];
    const count=player.knives+1,spin=performance.now()*.0035;
    return Array.from({length:count},(_,i)=>{
      const angle=spin+i/count*TAU;
      return {x:player.x+Math.cos(angle)*52,y:player.y+Math.sin(angle)*52,angle};
    });
  }

  function updateKnives(dt){
    if(!player.knives)return;
    const positions=knifePositions();
    for(const e of [...enemies]){
      e.knifeCooldown=Math.max(0,(e.knifeCooldown||0)-dt);
      if(e.dead||e.knifeCooldown>0)continue;
      for(const knife of positions){
        if(Math.hypot(e.x-knife.x,e.y-knife.y)<e.r+10){
          e.hp-=15;e.hit=.1;e.knifeCooldown=.38;
          floaters.push({x:e.x,y:e.y-e.r,text:'15',life:.5,color:'#dfe7dc',big:false});
          for(let i=0;i<4;i++)particle(knife.x,knife.y,'#dfe7dc',2,90,knife.angle);
          if(e.hp<=0)killEnemy(e);
          break;
        }
      }
    }
  }

  function splashDamage(x,y,r,damage,source){
    for(const e of [...enemies]){
      if(e===source||e.dead||Math.hypot(e.x-x,e.y-y)>r)continue;
      e.hp-=damage;e.hit=.1;
      if(e.hp<=0)killEnemy(e);
    }
    for(let i=0;i<12;i++)particle(x,y,i%2?'#ff9b3d':'#d9522d',3,170);
    shake=Math.max(shake,5);tone(75,.12,'sawtooth',.045);
  }

  function chainDamage(source,count,damage){
    let current=source,remaining=[...enemies].filter(e=>e!==source&&!e.dead);
    for(let i=0;i<count;i++){
      remaining.sort((a,b)=>Math.hypot(a.x-current.x,a.y-current.y)-Math.hypot(b.x-current.x,b.y-current.y));
      const next=remaining.shift();if(!next||Math.hypot(next.x-current.x,next.y-current.y)>150)break;
      next.hp-=damage;next.hit=.12;
      floaters.push({x:next.x,y:next.y-next.r,text:Math.round(damage),life:.5,color:'#72ddff',big:false});
      for(let n=0;n<7;n++){const t=n/6;particle(current.x+(next.x-current.x)*t,current.y+(next.y-current.y)*t,'#6edcff',2,20);}
      if(next.hp<=0)killEnemy(next);current=next;damage*=.72;
    }
  }

  function separate(e){
    let x=0,y=0;for(const o of enemies){if(o===e)continue;const dx=e.x-o.x,dy=e.y-o.y,d=Math.hypot(dx,dy);if(d<e.r+o.r+8&&d>0){x+=dx/d*.35;y+=dy/d*.35;}}return{x,y};
  }

  function updateEnemyShots(dt){
    for(let i=enemyShots.length-1;i>=0;i--){const s=enemyShots[i];s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;if(Math.hypot(s.x-player.x,s.y-player.y)<s.r+player.r){hitPlayer(s.damage,Math.atan2(s.vy,s.vx));if(s.burning)ignitePlayer();enemyShots.splice(i,1);continue;}if(s.life<=0)enemyShots.splice(i,1);}
  }

  function ignitePlayer(){
    player.burnTime=5;player.burnTick=1;floaters.push({x:player.x,y:player.y-45,text:t('ignited'),life:.8,color:'#ff6a2e',big:true});
  }

  function updatePlayerBurn(dt){
    if(player.burnTime<=0)return;
    player.burnTime-=dt;player.burnTick-=dt;
    if(Math.random()<.32)particle(player.x+(Math.random()-.5)*18,player.y+8,'#ff6b26',3,65,-Math.PI/2);
    if(player.burnTick<=0){
      player.burnTick+=1;player.hp-=5;floaters.push({x:player.x,y:player.y-45,text:language==='en'?'-5 FIRE':'-5 אש',life:.65,color:'#ff6a2e',big:true});tone(105,.09,'sawtooth',.025);
      if(player.hp<=0)gameOver();
    }
  }

  function hitPlayer(amount,a){
    if(player.invuln>0)return;player.invuln=.35;let left=amount;
    if(player.armor>0){const used=Math.min(player.armor,left);player.armor-=used;left-=used;}
    player.hp-=left;player.x+=Math.cos(a)*-12;player.y+=Math.sin(a)*-12;shake=9;
    for(let i=0;i<10;i++)particle(player.x,player.y,'#d44a39',3,160);tone(85,.18,'sawtooth',.06);
    if(player.hp<=0)gameOver();
  }

  function killEnemy(e,reward=true){
    if(e.dead)return;e.dead=true;const idx=enemies.indexOf(e);if(idx>=0)enemies.splice(idx,1);kills++;shake=Math.max(shake,e===boss?16:3);
    if(reward){
      scrap+=e.reward||Math.round(100+region*35);
      if(e!==boss){
        pickupProgress++;
        if(pickupProgress>=7){pickupProgress=0;pickups.push({x:e.x,y:e.y,type:Math.random()<.5?'med':'armor',life:10,r:9});}
      }
    }
    if(player.healOnKill)player.hp=Math.min(player.maxHp,player.hp+player.healOnKill);
    const n=e===boss?46:12;for(let i=0;i<n;i++)particle(e.x,e.y,e.color||'#8a3e2e',2+Math.random()*4,80+Math.random()*180);
    if(e===boss){boss=null;$('boss-hud').classList.add('hidden');slowMo=.35;setTimeout(()=>slowMo=1,650);tone(48,.5,'sawtooth',.1);}
  }

  function explode(x,y,r,damage){
    shake=14;for(let i=0;i<30;i++)particle(x,y,i%2?'#e85c2e':'#ffb23d',3+Math.random()*4,240);
    if(Math.hypot(x-player.x,y-player.y)<r)hitPlayer(damage,Math.atan2(player.y-y,player.x-x));
    playExplosionSound();
  }

  function updatePickups(dt){
    for(let i=pickups.length-1;i>=0;i--){
      const p=pickups[i];p.life-=dt;p.y+=Math.sin(p.life*4)*.15;
      if(Math.hypot(p.x-player.x,p.y-player.y)<p.r+player.r+7){
        if(p.type==='med'){
          player.hp=Math.min(player.maxHp,player.hp+15);floaters.push({x:p.x,y:p.y,text:t('health'),life:.8,color:'#79c76b',big:true});tone(720,.1,'sine',.04);
        } else if(player.maxArmor>0){
          player.armor=Math.min(player.maxArmor,player.armor+20);floaters.push({x:p.x,y:p.y,text:t('shield'),life:.8,color:'#65c7e8',big:true});tone(610,.12,'square',.035);
        } else {
          floaters.push({x:p.x,y:p.y,text:t('needShield'),life:1.1,color:'#9ba5a6',big:false});tone(120,.08,'square',.02);
        }
        pickups.splice(i,1);
      } else if(p.life<=0)pickups.splice(i,1);
    }
  }

  function particle(x,y,color,r=2,speed=100,angle=Math.random()*TAU){particles.push({x,y,vx:Math.cos(angle+(Math.random()-.5))*speed*(.25+Math.random()),vy:Math.sin(angle+(Math.random()-.5))*speed*(.25+Math.random()),r,color,life:.25+Math.random()*.35,max:.6});}
  function updateParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.94;p.vy*=.94;p.life-=dt;if(p.life<=0)particles.splice(i,1);}for(let i=floaters.length-1;i>=0;i--){floaters[i].y-=28*dt;floaters[i].life-=dt;if(floaters[i].life<=0)floaters.splice(i,1);}}

  function openShop(){
    state='shop';mouse.down=false;mobileFiring=false;$('upgrade-screen').classList.remove('hidden');$('shop-scrap').textContent=t('oneFree');
    const current=WEAPON_BY_ID[player.currentWeapon]||WEAPON_BY_ID.bat;
    const compatible=u=>!current.melee||!RANGED_ONLY_UPGRADES.has(u.id)||(current.id==='sword'&&(u.id==='poison'||u.id==='frost'));
    const options=shuffle(UPGRADES.filter(u=>(player.upgrades[u.id]||0)<u.max&&compatible(u))).slice(0,3);
    const grid=$('upgrade-grid');grid.innerHTML='';
    if(!options.length){$('upgrade-screen').classList.add('hidden');state='playing';buildWave();return;}
    options.forEach(u=>{
      const lvl=player.upgrades[u.id]||0;
      let upgradeTitle=language==='en'?u.titleEn:u.title,upgradeText=language==='en'?u.textEn:u.text;
      if(current.melee&&u.id==='damage'){upgradeTitle=language==='en'?'TEMPERED WEAPON':'נשק מחוזק';upgradeText=language==='en'?'+10% melee damage':'+10% נזק לנשק תגרה';}
      if(current.melee&&u.id==='fireRate'){upgradeTitle=language==='en'?'QUICK GRIP':'אחיזה מהירה';upgradeText=language==='en'?'+18% melee attack speed':'+18% מהירות תקיפה בתגרה';}
      if(current.id==='sword'&&u.id==='poison'){upgradeTitle=language==='en'?'POISONED BLADE':'להב מורעל';upgradeText=language==='en'?'Sword hits poison enemies over time':'פגיעות חרב מרעילות אויבים לאורך זמן';}
      if(current.id==='sword'&&u.id==='frost'){upgradeTitle=language==='en'?'FROZEN BLADE':'להב קפוא';upgradeText=language==='en'?'Sword hits briefly slow enemies':'פגיעות חרב מאטות אויבים לזמן קצר';}
      const b=document.createElement('button');b.className='upgrade';b.innerHTML=`<span class="level-tag">${t('currentLevel')} ${lvl} / ${u.max}</span><span class="icon">${u.icon}</span><h3>${upgradeTitle}</h3><p>${upgradeText}</p><b>${t('freeUpgrade')} ${lvl+1}</b>`;
      b.onclick=()=>{applyUpgrade(u.id);$('upgrade-screen').classList.add('hidden');state='playing';buildWave();};grid.appendChild(b);
    });
  }

  function adjustedWeaponWeight(w){
    const lowOwned=player.ownedWeapons.filter(id=>id!=='bat'&&['common','uncommon'].includes(WEAPON_BY_ID[id]?.rarity)).length;
    const luck={common:1,uncommon:1+lowOwned*.04,rare:1+lowOwned*.2,epic:1+lowOwned*.4,legendary:1+lowOwned*.7};
    return w.weight*luck[w.rarity];
  }

  function weaponChoices(count=3){
    const pool=WEAPONS.filter(w=>w.id!=='bat'&&!player.ownedWeapons.includes(w.id)),chosen=[];
    while(chosen.length<count&&pool.length){
      const total=pool.reduce((sum,w)=>sum+adjustedWeaponWeight(w),0);let roll=Math.random()*total,index=0;
      for(;index<pool.length-1;index++){roll-=adjustedWeaponWeight(pool[index]);if(roll<=0)break;}
      chosen.push(pool.splice(index,1)[0]);
    }
    return chosen;
  }

  function weaponChance(w){
    const pool=WEAPONS.filter(x=>x.id!=='bat'&&!player.ownedWeapons.includes(x.id));
    const total=pool.reduce((sum,x)=>sum+adjustedWeaponWeight(x),0);
    return total?adjustedWeaponWeight(w)/total*100:0;
  }

  function statBar(label,value,text){return `<div class="weapon-stat"><span>${label}</span><div class="weapon-stat-track"><i style="--value:${Math.max(5,Math.min(100,value))}%"></i></div><b>${text}</b></div>`;}
  function weaponRewardArt(w){
    if(w.image)return `<div class="weapon-art melee-reward-art"><img src="${w.image}" alt="${weaponName(w)}"></div>`;
    if(w.crop)return `<div class="weapon-art"><i style="background-size:1304px 734px;background-position:-${w.crop[0]}px -${w.crop[1]}px"></i></div>`;
    return `<div class="weapon-art melee-reward-art"><b>${w.icon}</b></div>`;
  }

  function openWeaponReward(finalBoss=false){
    state='weaponReward';mouse.down=false;mobileFiring=false;
    const options=weaponChoices(3),screen=$('weapon-reward-screen'),grid=$('weapon-choice-grid');
    $('arsenal-count').textContent=`${player.ownedWeapons.length} / ${WEAPONS.length}`;grid.innerHTML='';screen.classList.remove('hidden');
    if(!options.length){screen.classList.add('hidden');finishBossReward(finalBoss);return;}
    options.forEach(w=>{
      const totalDamage=w.damage*Math.max(1,w.pellets),reloadScore=(4.2-w.reload)/3.1*100;
      const card=document.createElement('button');card.className=`weapon-choice rarity-${w.rarity}`;
      card.innerHTML=`<span class="rarity">${rarityName(w.rarity)}</span><span class="chance">${t('currentChance')} ${weaponChance(w).toFixed(1)}%</span>${weaponRewardArt(w)}<h3>${w.icon} ${weaponName(w)}</h3><span class="weapon-sub">${language==='en'?w.name:w.en}</span><div class="weapon-stats">${statBar(t('damage'),totalDamage/123.5*100,weaponDamageText(w))}${statBar(t('fireRateStat'),w.fireRate/11*100,w.fireRate+t('perSecond'))}${statBar(t('reloadStat'),w.melee?100:reloadScore,w.melee?'—':w.reload+' '+t('seconds'))}${statBar(t('range'),w.fullMap?100:w.range/1100*100,w.fullMap?t('fullMap'):w.range)}${statBar(t('movement'),w.move*100,Math.round(w.move*100)+'%')}</div>`;
      card.onclick=()=>{
        player.ownedWeapons.push(w.id);player.weaponAmmo[w.id]=w.mag+4*(player.upgrades.mag||0);screen.classList.add('hidden');
        equipWeapon(w.id,false);tone(520,.14,'square',.05);setTimeout(()=>tone(780,.22,'square',.04),100);finishBossReward(finalBoss);
      };
      grid.appendChild(card);
    });
  }

  function applyUpgrade(id){
    player.upgrades[id]=(player.upgrades[id]||0)+1;
    if(id==='damage')player.damage*=1.10;
    if(id==='fireRate')player.fireRate*=1.18;
    if(id==='mag'){player.mag+=4;player.ammo=player.mag;}
    if(id==='health'){player.maxHp+=20;player.hp=player.maxHp;}
    if(id==='speed')player.speed*=1.10;
    if(id==='armor'){player.maxArmor+=25;player.armor=player.maxArmor;}
    if(id==='shotgun')player.pellets+=2;
    if(id==='reload')player.reloadTime*=.8;
    if(id==='poison')player.poison++;
    if(id==='frost')player.frost++;
    if(id==='explosive')player.explosive++;
    if(id==='recovery')player.healOnKill+=1;
    if(id==='knives')player.knives++;
    if(['damage','fireRate','mag','shotgun','reload'].includes(id))refreshWeaponStats(true);
    if(id==='mag'){player.ammo=player.mag;player.weaponAmmo[player.currentWeapon]=player.ammo;}
    tone(440,.12,'square',.05);setTimeout(()=>tone(660,.16,'square',.04),80);
  }

  function completeRegion(){
    scrap+=120+region*50;
    openWeaponReward(region>=REGIONS.length-1);
  }

  function finishBossReward(finalBoss){
    if(finalBoss){victory();return;}
    region++;wave=0;player.hp=player.maxHp;player.armor=player.maxArmor;player.x=W/2;player.y=H/2;createDecor();
    state='transition';announce(t('newWeapon'),regionName(REGIONS[region]));
    setTimeout(()=>{state='playing';buildWave();},1800);
  }

  function gameOver(){state='dead';mouse.down=false;$('game-over').classList.remove('hidden');$('death-stats').textContent=`${profile?.name ? profile.name+' · ' : ''}${t('kills')}: ${kills} · ${t('reachedSector')} ${region+1}`;$('mobile-controls').classList.remove('playing');$('mobile-weapon-bar').classList.remove('playing');$('weapon-inventory').classList.add('hidden');$('pause-btn').classList.add('hidden');}
  function victory(){state='victory';$('victory-screen').classList.remove('hidden');$('victory-stats').textContent=`${profile?.name ? profile.name+' · ' : ''}${kills} ${t('kills')} · ${player.ownedWeapons.length} ${t('weaponsCollected')}.`;$('mobile-controls').classList.remove('playing');$('mobile-weapon-bar').classList.remove('playing');$('weapon-inventory').classList.add('hidden');$('pause-btn').classList.add('hidden');try {localStorage.removeItem(SAVE_KEY);} catch {}$('continue-btn').classList.add('hidden');}

  function saveGame(){
    try {
      localStorage.setItem(SAVE_KEY,JSON.stringify({
        saveVersion:1,balanceVersion:4,playerName:profile?.name||'',savedAt:Date.now(),region,wave,scrap,kills,pickupProgress,
        p:{hp:player.hp,maxHp:player.maxHp,armor:player.armor,maxArmor:player.maxArmor,speed:player.speed,poison:player.poison,frost:player.frost,explosive:player.explosive,healOnKill:player.healOnKill,knives:player.knives,currentWeapon:player.currentWeapon,ownedWeapons:player.ownedWeapons,weaponAmmo:player.weaponAmmo,upgrades:player.upgrades}
      }));
      $('continue-btn').classList.remove('hidden');
    } catch(err) {
      console.warn('Could not save game progress:',err);
    }
  }

  function loadSave(){
    try {
      const s=JSON.parse(localStorage.getItem(SAVE_KEY));
      if(!s||!s.p)throw new Error('Missing save');
      region=Math.max(0,Math.min(REGIONS.length-1,s.region||0));scrap=s.scrap||0;kills=s.kills||0;pickupProgress=s.pickupProgress||0;
      if(!s.balanceVersion)s.p.speed=(s.p.speed||210)*.7;
      if((s.balanceVersion||0)<3)s.p.healOnKill=(s.p.upgrades?.recovery||0);
      if(!s.p.ownedWeapons){s.p.ownedWeapons=['bat'];s.p.currentWeapon='bat';s.p.weaponAmmo={bat:1};}
      const savedHp=s.p.hp,savedArmor=s.p.armor,savedWeaponAmmo={...(s.p.weaponAmmo||{})};
      Object.assign(player,s.p);
      reset(false,Math.max(1,s.wave||1));
      player.weaponAmmo=savedWeaponAmmo;
      if(Number.isFinite(savedWeaponAmmo[player.currentWeapon]))player.ammo=Math.max(0,Math.min(player.mag,savedWeaponAmmo[player.currentWeapon]));
      if(Number.isFinite(savedHp))player.hp=Math.max(1,Math.min(player.maxHp,savedHp));
      if(Number.isFinite(savedArmor))player.armor=Math.max(0,Math.min(player.maxArmor,savedArmor));
      updateHud();
    } catch(err) {
      console.warn('Could not load game progress:',err);reset(true);
    }
  }

  function pauseGame(){
    if(state!=='playing')return;
    state='paused';mouse.down=false;mobileFiring=false;
    $('pause-screen').classList.remove('hidden');$('pause-btn').classList.add('hidden');
  }

  function resumeGame(){
    if(state!=='paused')return;
    $('pause-screen').classList.add('hidden');$('pause-btn').classList.remove('hidden');
    state='playing';last=performance.now();
  }

  function saveAndExit(){
    if(state!=='paused')return;
    saveGame();state='menu';location.reload();
  }

  function saveOnBrowserExit(){
    if(['playing','paused','shop','weaponReward','transition'].includes(state)||(state==='settings'&&settingsPreviousState!=='menu'))saveGame();
  }

  function showProfile(){
    $('player-welcome').textContent=`${t('hello')} ${profile.name}, ${t('profileSaved')}`;
    $('player-welcome').classList.remove('hidden');
    $('delete-profile-btn').classList.remove('hidden');
    $('settings-btn').classList.remove('hidden');
  }

  function initProfile(){
    try {profile=JSON.parse(localStorage.getItem(PROFILE_KEY));} catch {profile=null;}
    if(profile?.name){language=profile.language||'he';if(profile.deviceMode)applyDeviceMode(profile.deviceMode);applyLanguage(language);showProfile();return;}
    applyLanguage('he');
    $('profile-screen').classList.remove('hidden');
    setTimeout(()=>$('player-name-input').focus(),60);
  }

  function createProfile(){
    const name=$('player-name-input').value.trim().replace(/\s+/g,' ').slice(0,18);
    if(!name){$('profile-error').classList.remove('hidden');return;}
    profile={name,createdAt:Date.now(),language,deviceMode:null};persistProfile();
    $('profile-screen').classList.add('hidden');applyLanguage(language);showProfile();
  }

  function deleteProfile(){
    const name=profile?.name||t('currentUser');
    if(!confirm(t('deleteConfirm').replace('{name}',name)))return;
    try {localStorage.removeItem(PROFILE_KEY);localStorage.removeItem(SAVE_KEY);} catch {}
    location.reload();
  }

  function updateHud(){
    const weapon=WEAPON_BY_ID[player.currentWeapon]||WEAPON_BY_ID.bat;
    $('ammo-text').textContent=weapon.melee||weapon.infiniteAmmo?'∞':player.ammo;$('ammo-text').parentElement.querySelector('span').classList.toggle('hidden',!!(weapon.melee||weapon.infiniteAmmo));$('weapon-level').textContent=`${rarityName(weapon.rarity)} · ${Math.round(weapon.move*100)}% ${t('movement')}`;$('weapon-name').textContent=weaponName(weapon);$('gun-icon').textContent=weapon.icon;
    const r=REGIONS[region];$('region-name').textContent=`${t('sector')} ${String(region+1).padStart(2,'0')}`;$('wave-name').textContent=wave>r.waves?t('bossFight'):`${t('wave')} ${wave}`;
    if(boss)$('boss-name').textContent=bossName(r);
    $('wave-pips').innerHTML=Array.from({length:r.waves+1},(_,i)=>`<i class="${i<wave?'done':''}"></i>`).join('');
    if(boss)$('boss-bar').style.width=`${Math.max(0,boss.hp/boss.maxHp*100)}%`;
  }

  function draw(){
    ctx.save();const sx=shake?(Math.random()-.5)*shake:0,sy=shake?(Math.random()-.5)*shake:0;ctx.translate(sx,sy);
    drawWorld();drawPickups();drawEnemyShots();drawEnemies();drawKnives();drawPlayer();drawBullets();drawParticles();ctx.restore();
    if(state==='playing')drawVignette();
  }

  function drawWorld(){
    const r=REGIONS[region]||REGIONS[0];ctx.fillStyle=r.ground;ctx.fillRect(-20,-20,W+40,H+40);
    ctx.strokeStyle=r.grid;ctx.lineWidth=1;const size=80;
    for(let x=(player.x*.04)%size-size;x<W+size;x+=size){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=(player.y*.04)%size-size;y<H+size;y+=size){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    for(const d of decor){ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.a);ctx.fillStyle=r.decor+'aa';if(d.t===0){ctx.fillRect(-d.r,-4,d.r*2,8);ctx.fillRect(-5,-d.r*.5,10,d.r);}else if(d.t===1){ctx.beginPath();ctx.arc(0,0,d.r*.45,0,TAU);ctx.strokeStyle=r.decor;ctx.lineWidth=5;ctx.stroke();}else if(d.t===2){ctx.fillRect(-d.r*.6,-d.r*.35,d.r*1.2,d.r*.7);ctx.fillStyle='#151815';ctx.fillRect(-d.r*.42,-d.r*.2,d.r*.84,d.r*.12);}else{ctx.beginPath();for(let i=0;i<7;i++){const a=i/7*TAU,rr=i%2?d.r*.45:d.r;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr)}ctx.fill();}ctx.restore();}
    const grad=ctx.createRadialGradient(W/2,H/2,100,W/2,H/2,Math.max(W,H)*.75);grad.addColorStop(0,'transparent');grad.addColorStop(1,r.fog+'45');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
  }

  function drawPlayer(){
    const activeWeapon=WEAPON_BY_ID[player.currentWeapon]||WEAPON_BY_ID.bat;
    ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);
    if(player.invuln>0&&Math.floor(player.invuln*20)%2)ctx.globalAlpha=.35;
    ctx.fillStyle='#111';ctx.beginPath();ctx.ellipse(-3,5,15,12,0,0,TAU);ctx.fill();
    ctx.fillStyle='#c6b59a';ctx.beginPath();ctx.arc(4,-1,7,0,TAU);ctx.fill();
    ctx.fillStyle='#485143';ctx.fillRect(-11,-9,18,18);ctx.fillStyle='#20251f';ctx.fillRect(-14,-7,6,16);
    if(activeWeapon.melee){
      const swing=player.meleeSwing>0?Math.sin((1-player.meleeSwing/.22)*Math.PI)*1.25:0;
      ctx.save();ctx.rotate(-.62+swing);ctx.lineCap='round';
      if(activeWeapon.id==='sword'){
        ctx.strokeStyle='#73634d';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(3,0);ctx.lineTo(14,0);ctx.stroke();
        ctx.strokeStyle='#51c9ff';ctx.shadowColor='#1aaeff';ctx.shadowBlur=13;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(47,0);ctx.stroke();
        ctx.strokeStyle='#d7f7ff';ctx.shadowBlur=5;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(14,-1);ctx.lineTo(48,-1);ctx.stroke();ctx.shadowBlur=0;
        ctx.fillStyle='#72d9ff';ctx.beginPath();ctx.moveTo(47,-4);ctx.lineTo(57,0);ctx.lineTo(47,4);ctx.fill();
      } else {
        ctx.strokeStyle='#725138';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(4,0);ctx.lineTo(43,0);ctx.stroke();
        ctx.strokeStyle='#a87b51';ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(31,0);ctx.lineTo(51,0);ctx.stroke();
      }
      ctx.restore();
    } else if(activeWeapon.arrow){
      ctx.strokeStyle='#9a734b';ctx.lineWidth=3;ctx.beginPath();ctx.arc(15,0,20,-1.15,1.15);ctx.stroke();
      ctx.strokeStyle='#d8d0b7';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(23,-18);ctx.lineTo(8,0);ctx.lineTo(23,18);ctx.stroke();
      ctx.strokeStyle='#c7a878';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(34,0);ctx.stroke();
      if(player.flash>0){ctx.fillStyle='#e5d5b7';ctx.beginPath();ctx.moveTo(34,-3);ctx.lineTo(41,0);ctx.lineTo(34,3);ctx.fill();}
    } else {
      ctx.fillStyle=player.flash>0?'#ffe39b':'#a8aaa0';ctx.fillRect(2,-3,28,6);ctx.fillStyle='#3b3b37';ctx.fillRect(12,3,8,7);
      if(player.flash>0){ctx.fillStyle='#ffc25b';ctx.beginPath();ctx.moveTo(30,0);ctx.lineTo(42,-7);ctx.lineTo(39,0);ctx.lineTo(42,7);ctx.closePath();ctx.fill();}
    }
    ctx.restore();
    if(player.burnTime>0){ctx.strokeStyle='#ff6a2e';ctx.lineWidth=2;ctx.shadowColor='#ff6a2e';ctx.shadowBlur=10;ctx.beginPath();ctx.arc(player.x,player.y,20+Math.sin(performance.now()*.012)*2,0,TAU);ctx.stroke();ctx.shadowBlur=0;}
    drawPlayerVitals();
    if(!activeWeapon.melee&&!activeWeapon.infiniteAmmo){
      const ammoRatio=player.mag?Math.max(0,Math.min(1,player.ammo/player.mag)):0,ammoRadius=30;
      ctx.lineWidth=3;ctx.strokeStyle='#0b0d0bc9';ctx.beginPath();ctx.arc(player.x,player.y,ammoRadius,0,TAU);ctx.stroke();
      ctx.strokeStyle=ammoRatio>.5?'#e5a849':ammoRatio>.2?'#ee742d':'#e43f37';ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=5;
      ctx.beginPath();ctx.arc(player.x,player.y,ammoRadius,-Math.PI/2,-Math.PI/2+TAU*ammoRatio);ctx.stroke();ctx.shadowBlur=0;
    }
    if(!activeWeapon.melee&&player.reloading>0){
      const progress=Math.max(0,Math.min(1,1-player.reloading/player.reloadTime)),radius=37,start=-Math.PI/2;
      ctx.lineWidth=4;ctx.strokeStyle='#ffffff24';ctx.beginPath();ctx.arc(player.x,player.y,radius,0,TAU);ctx.stroke();
      ctx.strokeStyle='#ff8b3d';ctx.shadowColor='#ff6a2a';ctx.shadowBlur=9;ctx.beginPath();ctx.arc(player.x,player.y,radius,start,start+TAU*progress);ctx.stroke();ctx.shadowBlur=0;
      const spin=performance.now()*.012,dx=Math.cos(spin)*radius,dy=Math.sin(spin)*radius;
      ctx.fillStyle='#fff3d6';ctx.beginPath();ctx.arc(player.x+dx,player.y+dy,3.5,0,TAU);ctx.fill();
      ctx.fillStyle='#f2e9d7';ctx.font='900 9px Heebo';ctx.textAlign='center';ctx.fillText(`${Math.round(progress*100)}%`,player.x,player.y+43);
    }
  }

  function drawPlayerVitals(){
    const width=62,left=player.x-width/2,healthY=player.y-52,armorY=healthY+9;
    ctx.fillStyle='#101210df';ctx.fillRect(left-2,healthY-2,width+4,9);
    ctx.fillStyle='#4b1d1c';ctx.fillRect(left,healthY,width,5);
    ctx.fillStyle='#df4938';ctx.fillRect(left,healthY,width*Math.max(0,player.hp/player.maxHp),5);
    ctx.strokeStyle='#ffffff36';ctx.lineWidth=1;ctx.strokeRect(left-.5,healthY-.5,width+1,6);
    ctx.fillStyle='#17272c';ctx.fillRect(left,armorY,width,4);
    if(player.maxArmor>0){ctx.fillStyle='#52b8df';ctx.shadowColor='#46b9e7';ctx.shadowBlur=4;ctx.fillRect(left,armorY,width*Math.max(0,player.armor/player.maxArmor),4);ctx.shadowBlur=0;}
    ctx.fillStyle='#f0ece1';ctx.font='800 9px Heebo';ctx.textAlign='center';ctx.fillText(`${Math.max(0,Math.ceil(player.hp))}`,player.x,healthY-4);
  }

  function drawKnives(){
    for(const knife of knifePositions()){
      ctx.save();ctx.translate(knife.x,knife.y);ctx.rotate(knife.angle+Math.PI/2);
      ctx.fillStyle='#e8e7df';ctx.shadowColor='#bcd2d6';ctx.shadowBlur=6;
      ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(5,5);ctx.lineTo(0,10);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle='#645b4e';ctx.fillRect(-2,8,4,7);ctx.restore();
    }
  }

  function drawEnemies(){
    for(const e of enemies){ctx.save();ctx.translate(e.x,e.y);const a=Math.atan2(player.y-e.y,player.x-e.x);ctx.rotate(a);ctx.globalAlpha=e.hit>0?.55:1;
      ctx.fillStyle='#0005';ctx.beginPath();ctx.ellipse(-2,e.r*.6,e.r*1.05,e.r*.55,0,0,TAU);ctx.fill();
      if(e===boss){ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(0,0,e.r,0,TAU);ctx.fill();ctx.fillStyle='#30201c';for(let i=0;i<9;i++){const aa=i/9*TAU;ctx.save();ctx.rotate(aa);ctx.beginPath();ctx.moveTo(e.r-5,-5);ctx.lineTo(e.r+15,0);ctx.lineTo(e.r-5,5);ctx.fill();ctx.restore();}ctx.fillStyle='#ed6c3c';ctx.beginPath();ctx.arc(e.r*.35,-e.r*.22,5,0,TAU);ctx.fill();}
      else {ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(0,0,e.r,0,TAU);ctx.fill();ctx.fillStyle='#2a2e27';ctx.fillRect(-e.r*.5,-e.r*.3,e.r*1.25,e.r*.75);ctx.fillStyle=e.type==='spitter'?'#d1ef57':'#ed764b';ctx.beginPath();ctx.arc(e.r*.45,-e.r*.3,2.5,0,TAU);ctx.fill();if(e.type==='tank'){ctx.strokeStyle='#332824';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-4,-e.r);ctx.lineTo(6,e.r);ctx.stroke();}if(e.type==='bomber'){ctx.strokeStyle='#ff883a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,e.r+3,0,TAU);ctx.stroke();}if(e.type==='batter'){ctx.save();ctx.rotate(-.55);ctx.fillStyle='#7f5b38';ctx.fillRect(4,-4,28,7);ctx.fillStyle='#b8a17e';ctx.fillRect(26,-5,9,9);ctx.restore();}}
      ctx.restore();
      if(e.poisonTime>0){ctx.strokeStyle='#9ccc4c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,e.r+5,0,TAU);ctx.stroke();}
      if(e.frostTime>0){ctx.strokeStyle='#77d5eb';ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,e.r+8,0,TAU);ctx.stroke();}
      if(e.burnTime>0){ctx.strokeStyle='#ff682d';ctx.shadowColor='#ff682d';ctx.shadowBlur=8;ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,e.r+6,0,TAU);ctx.stroke();ctx.shadowBlur=0;}
      if(e===boss){
        const width=Math.max(112,e.r*2.55),height=9,left=e.x-width/2,top=e.y-e.r-27,ratio=Math.max(0,Math.min(1,e.hp/e.maxHp));
        ctx.fillStyle='#080908e8';ctx.fillRect(left-3,top-3,width+6,height+6);
        ctx.fillStyle='#381414';ctx.fillRect(left,top,width,height);
        const gradient=ctx.createLinearGradient(left,top,left+width,top);gradient.addColorStop(0,'#8b151d');gradient.addColorStop(1,'#f05a37');
        ctx.fillStyle=gradient;ctx.shadowColor='#e44331';ctx.shadowBlur=7;ctx.fillRect(left,top,width*ratio,height);ctx.shadowBlur=0;
        ctx.strokeStyle='#f0d7c055';ctx.lineWidth=1;ctx.strokeRect(left-.5,top-.5,width+1,height+1);
        ctx.fillStyle='#f4e9da';ctx.font='900 10px Heebo';ctx.textAlign='center';ctx.fillText(`${bossName(REGIONS[region])} · ${Math.ceil(e.hp)} / ${Math.ceil(e.maxHp)}`,e.x,top-6);
      }
      if(e!==boss&&e.hp<e.maxHp){ctx.fillStyle='#1c1716';ctx.fillRect(e.x-e.r,e.y-e.r-9,e.r*2,3);ctx.fillStyle='#d15a39';ctx.fillRect(e.x-e.r,e.y-e.r-9,e.r*2*(e.hp/e.maxHp),3);}
    }
  }

  function drawBullets(){
    for(const b of bullets){
      if(b.arrow){
        const angle=Math.atan2(b.vy,b.vx);ctx.save();ctx.translate(b.x,b.y);ctx.rotate(angle);ctx.shadowColor='#e5c58f';ctx.shadowBlur=4;
        ctx.strokeStyle='#b58a55';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-15,0);ctx.lineTo(11,0);ctx.stroke();
        ctx.fillStyle='#ddd8c7';ctx.beginPath();ctx.moveTo(11,-4);ctx.lineTo(18,0);ctx.lineTo(11,4);ctx.closePath();ctx.fill();
        ctx.fillStyle='#7f4d3a';ctx.beginPath();ctx.moveTo(-14,0);ctx.lineTo(-9,-5);ctx.lineTo(-7,0);ctx.lineTo(-9,5);ctx.closePath();ctx.fill();ctx.restore();continue;
      }
      ctx.strokeStyle=b.color||'#f5ddae';ctx.lineWidth=b.flame?7:2;ctx.globalAlpha=b.flame?.65:1;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-b.vx*(b.flame?.028:.018),b.y-b.vy*(b.flame?.028:.018));ctx.stroke();ctx.globalAlpha=1;
    }
  }
  function drawEnemyShots(){for(const s of enemyShots){ctx.fillStyle=s.color;ctx.shadowColor=s.color;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,TAU);ctx.fill();ctx.shadowBlur=0;}}
  function drawPickups(){for(const p of pickups){if(p.type==='med'){ctx.fillStyle='#65ad5b';ctx.fillRect(p.x-8,p.y-8,16,16);ctx.fillStyle='#d9f1d4';ctx.fillRect(p.x-2,p.y-6,4,12);ctx.fillRect(p.x-6,p.y-2,12,4);}else{ctx.fillStyle=player.maxArmor>0?'#4cb9df':'#566165';ctx.shadowColor='#45bee8';ctx.shadowBlur=player.maxArmor>0?9:0;ctx.beginPath();for(let i=0;i<6;i++){const a=-Math.PI/2+i/6*TAU;ctx.lineTo(p.x+Math.cos(a)*10,p.y+Math.sin(a)*10);}ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#d8f4ff';ctx.beginPath();ctx.moveTo(p.x,p.y-6);ctx.lineTo(p.x+5,p.y-3);ctx.lineTo(p.x+4,p.y+4);ctx.lineTo(p.x,p.y+7);ctx.lineTo(p.x-4,p.y+4);ctx.lineTo(p.x-5,p.y-3);ctx.closePath();ctx.fill();}}}
  function drawParticles(){for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill();}ctx.globalAlpha=1;for(const f of floaters){ctx.globalAlpha=f.life/.8;ctx.fillStyle=f.color;ctx.font=`${f.big?'900 19px':'700 13px'} Heebo`;ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y);}ctx.globalAlpha=1;}
  function drawVignette(){const g=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.3,W/2,H/2,Math.max(W,H)*.72);g.addColorStop(0,'transparent');g.addColorStop(1,player.hp<30?'#6e0a0a88':'#00000088');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);}

  function announce(small,big){const a=$('announcement');a.querySelector('small').textContent=small;a.querySelector('strong').textContent=big;a.classList.remove('hidden');a.style.animation='none';void a.offsetWidth;a.style.animation='announce 2.4s both';announcementTimer=2.4;setTimeout(()=>a.classList.add('hidden'),2400);}
  function sideNotify(small,big){const notice=$('side-notification');notice.querySelector('small').textContent=small;notice.querySelector('strong').textContent=big;notice.classList.remove('hidden');notice.style.animation='none';void notice.offsetWidth;notice.style.animation='sideNotice .18s ease-out both';clearTimeout(sideNotificationTimer);sideNotificationTimer=setTimeout(()=>notice.classList.add('hidden'),1500);}
  function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

  function initAudio(){
    if(audio){if(audio.state==='suspended')audio.resume();return;}
    audio=new (window.AudioContext||window.webkitAudioContext)();
    audioMaster=audio.createDynamicsCompressor();audioMaster.threshold.value=-16;audioMaster.knee.value=18;audioMaster.ratio.value=8;audioMaster.attack.value=.003;audioMaster.release.value=.2;audioMaster.connect(audio.destination);
    shotNoiseBuffer=audio.createBuffer(1,Math.floor(audio.sampleRate*.5),audio.sampleRate);
    const data=shotNoiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length*.35);
  }

  function noiseLayer(when,duration,volume,frequency,type='bandpass'){
    if(!audio||!shotNoiseBuffer)return;
    const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source.buffer=shotNoiseBuffer;filter.type=type;filter.frequency.setValueAtTime(frequency,when);filter.Q.value=type==='bandpass'?.75:.5;
    gain.gain.setValueAtTime(Math.max(.0001,volume),when);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
    source.connect(filter);filter.connect(gain);gain.connect(audioMaster||audio.destination);source.start(when,Math.random()*.08,duration);source.stop(when+duration+.01);
  }

  function impactLayer(when,startFrequency,endFrequency,duration,volume,type='sine'){
    if(!audio)return;
    const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type=type;oscillator.frequency.setValueAtTime(startFrequency,when);oscillator.frequency.exponentialRampToValueAtTime(Math.max(28,endFrequency),when+duration);
    gain.gain.setValueAtTime(volume,when);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);oscillator.connect(gain);gain.connect(audioMaster||audio.destination);oscillator.start(when);oscillator.stop(when+duration+.01);
  }

  function playGunshot(w){
    if(!audio)initAudio();if(!audio)return;const now=audio.currentTime;
    if(w.arrow){noiseLayer(now,.045,.018,1850,'bandpass');impactLayer(now,185,92,.09,.024,'triangle');return;}
    if(w.flame){noiseLayer(now,.065,.055,620,'lowpass');impactLayer(now,105,55,.055,.025,'sawtooth');return;}
    if(w.id==='tesla'){noiseLayer(now,.09,.08,3400,'bandpass');impactLayer(now,760,115,.11,.07,'sawtooth');impactLayer(now+.018,1280,260,.07,.035,'square');return;}
    const heavy=['shotgun','sniper','grenade','railgun','bone'].includes(w.id),automatic=['smg','assault','burst','lmg'].includes(w.id),power=heavy?.22:automatic?.105:.15;
    const crack=heavy?.19:automatic?.075:.115,cutoff=heavy?1450:automatic?2600:2050,thump=heavy?118:automatic?155:138;
    noiseLayer(now,crack,power,cutoff,'bandpass');noiseLayer(now+.012,heavy?.26:.13,power*.32,heavy?520:760,'lowpass');
    impactLayer(now,thump,38,heavy?.17:.095,heavy?.14:.075,heavy?'square':'triangle');
    impactLayer(now+.006,heavy?1850:2450,heavy?310:520,.035,heavy?.025:.016,'square');
    if(w.id==='revolver'||w.id==='sniper')noiseLayer(now+.035,.18,.038,900,'bandpass');
  }

  function playEnemyShot(){if(!audio)return;const now=audio.currentTime;noiseLayer(now,.085,.045,720,'lowpass');impactLayer(now,170,62,.09,.035,'triangle');}
  function playExplosionSound(){if(!audio)return;const now=audio.currentTime;noiseLayer(now,.42,.25,360,'lowpass');noiseLayer(now,.18,.13,1050,'bandpass');impactLayer(now,92,28,.34,.18,'sine');}
  function tone(freq,duration,type='sine',volume=.03){if(!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.65),audio.currentTime+duration);g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audioMaster||audio.destination);o.start();o.stop(audio.currentTime+duration);}

  async function toggleFullscreen(){
    try {
      if(!document.fullscreenElement){
        const target=$('game-shell');
        if(target.requestFullscreen) await target.requestFullscreen();
        else if(target.webkitRequestFullscreen) target.webkitRequestFullscreen();
      } else {
        if(document.exitFullscreen) await document.exitFullscreen();
        else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    } catch(err) {
      console.warn('Fullscreen is unavailable:',err);
    }
  }

  function syncFullscreenButton(){
    const active=!!(document.fullscreenElement||document.webkitFullscreenElement);
    document.body.classList.toggle('is-fullscreen',active);
    $('fullscreen-btn').querySelector('b').textContent=active?t('exitFullscreen'):t('fullscreen');
    $('fullscreen-btn').querySelector('.fullscreen-icon').textContent=active?'×':'⛶';
    $('fullscreen-btn').setAttribute('aria-label',active?t('exitFullscreen'):t('fullscreen'));
    $('fullscreen-btn').title=`${active?t('exitFullscreen'):t('fullscreen')} (F)`;
    setTimeout(resize,80);
  }

  addEventListener('keydown',e=>{
    if(e.code==='Escape'){
      e.preventDefault();
      if(state==='playing')pauseGame();else if(state==='paused')resumeGame();else if(state==='settings')closeSettings();
      return;
    }
    if(e.target instanceof HTMLInputElement)return;
    keys[e.code]=true;if(e.code==='KeyR')reload();if(e.code==='KeyF'){e.preventDefault();toggleFullscreen();}
    const match=e.code.match(/^Digit([0-9])$/);
    if(match&&state==='playing'){const number=Number(match[1]),index=number===0?9:number-1,id=player.ownedWeapons[index];if(id)equipWeapon(id);}
  });
  addEventListener('keyup',e=>keys[e.code]=false);addEventListener('blur',()=>keys={});
  canvas.addEventListener('mousemove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;$('crosshair').style.transform=`translate(${mouse.x}px,${mouse.y}px)`;});
  canvas.addEventListener('mousedown',()=>mouse.down=true);addEventListener('mouseup',()=>mouse.down=false);
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{if(state==='playing'){e.preventDefault();cycleWeapon(e.deltaY>0?1:-1);}},{passive:false});
  $('start-btn').onclick=()=>askDevice(false);$('continue-btn').onclick=()=>askDevice(true);
  $('desktop-choice').onclick=()=>chooseDevice('desktop');
  $('mobile-choice').onclick=()=>chooseDevice('mobile');
  $('device-back').onclick=()=>$('device-screen').classList.add('hidden');
  document.querySelectorAll('.starter-choice').forEach(button=>button.onclick=()=>chooseStarter(button.dataset.starter));
  $('skip-upgrade').onclick=()=>{$('upgrade-screen').classList.add('hidden');state='playing';buildWave();};
  $('restart-btn').onclick=()=>{$('game-over').classList.add('hidden');openStarterChoice();};
  $('menu-btn').onclick=()=>location.reload();$('victory-restart').onclick=()=>{$('victory-screen').classList.add('hidden');openStarterChoice();};
  $('pause-btn').onclick=pauseGame;
  $('resume-btn').onclick=resumeGame;
  $('save-exit-btn').onclick=saveAndExit;
  $('settings-btn').onclick=openSettings;
  $('close-settings-btn').onclick=closeSettings;
  $('save-name-btn').onclick=saveSettingsName;
  $('settings-name-input').addEventListener('keydown',e=>{if(e.key==='Enter')saveSettingsName();});
  $('settings-desktop').onclick=()=>applyDeviceMode('desktop',true);
  $('settings-mobile').onclick=()=>applyDeviceMode('mobile',true);
  $('language-he').onclick=()=>changeLanguage('he');
  $('language-en').onclick=()=>changeLanguage('en');
  $('create-profile-btn').onclick=createProfile;
  $('player-name-input').addEventListener('input',()=>$('profile-error').classList.add('hidden'));
  $('player-name-input').addEventListener('keydown',e=>{if(e.key==='Enter')createProfile();});
  $('delete-profile-btn').onclick=deleteProfile;
  try {if(localStorage.getItem(SAVE_KEY))$('continue-btn').classList.remove('hidden');} catch {}
  initProfile();

  const joy=$('joystick'),knob=joy.querySelector('i');let joyId=null,fireId=null;
  joy.addEventListener('pointerdown',e=>{joyId=e.pointerId;joy.setPointerCapture(joyId);});
  joy.addEventListener('pointermove',e=>{if(e.pointerId!==joyId)return;const r=joy.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),m=Math.min(38,Math.hypot(dx,dy)),a=Math.atan2(dy,dx);mobileMove={x:Math.cos(a)*m/38,y:Math.sin(a)*m/38};knob.style.transform=`translate(${mobileMove.x*32}px,${mobileMove.y*32}px)`;});
  const endJoy=e=>{if(e.pointerId===joyId){joyId=null;mobileMove={x:0,y:0};knob.style.transform='';}};joy.addEventListener('pointerup',endJoy);joy.addEventListener('pointercancel',endJoy);
  $('mobile-fire').addEventListener('pointerdown',e=>{e.preventDefault();fireId=e.pointerId;mobileFiring=true;const nearest=enemies.reduce((best,z)=>!best||Math.hypot(z.x-player.x,z.y-player.y)<Math.hypot(best.x-player.x,best.y-player.y)?z:best,null);if(nearest){mouse.x=nearest.x;mouse.y=nearest.y;}});
  const endFire=e=>{if(e.pointerId===fireId){fireId=null;mobileFiring=false;}};addEventListener('pointerup',endFire);addEventListener('pointercancel',endFire);
  $('fullscreen-btn').onclick=toggleFullscreen;
  document.addEventListener('fullscreenchange',syncFullscreenButton);
  document.addEventListener('webkitfullscreenchange',syncFullscreenButton);
  addEventListener('pagehide',saveOnBrowserExit);

  function loop(t){const dt=(t-last)/1000||0;last=t;update(dt);draw();requestAnimationFrame(loop);}requestAnimationFrame(loop);
})();
