// Realistic demo data for UI screenshots/tests. module.exports = function run INSIDE the page.
module.exports = function seed(){
  const now = new Date(), P = 40;
  DB.perLesson = P; DB.kids = {}; DB.balance = {}; DB.profiles = {}; DB.progress = {}; DB.live = {}; DB.sched = {}; DB.books = {}; DB.attendance = []; DB.reports = []; DB.certs = [];
  DB.guardians = {}; DB.placements = {}; DB.cheers = {}; DB.topups = []; DB.reviews = []; DB.livefeed = {}; DB.renewReq = {}; DB.prices = {}; DB.redeems = []; DB.voices = {}; DB.monthly = {};
  DB.parent = {user:'admin', pass:'hud2026'};
  const from = new Date(now.getTime() - 52 * 864e5); const fromS = `${from.getFullYear()}-${pad(from.getMonth()+1)}-${pad(from.getDate())}T00:00`;
  const K = [
    ['sami','سامي','Sam',5,'2016-03-12',true,[0,2,4,6],'17:00',1100,'Sam'],
    ['layan','ليان','Layan',9,'2013-02-20',false,[0,2,4,6],'19:30',2350,'Layan'],
    ['fahad','فهد','Fahad',2,'2019-06-02',true,[1,3,6],'15:00',480,'Fahad'],
    ['noura','نورة','Noura',7,'2014-12-01',false,[0,2,4],'18:00',1620,'Noura'],
    ['yousef','يوسف','Yousef',12,'2011-05-09',true,[1,3,5],'20:00',3120,'Yousef']];
  K.forEach(([id, ar, en, level, birth, boy, days, time, xp, nk]) => {
    DB.kids[id] = {id, ar, en, user:id, pass:String(1000 + ar.length * 731).slice(0, 4), level, birth, boy, cefr:LEVEL_CEFR[level]};
    DB.profiles[id] = {nick:nk}; DB.balance[id] = 99999; DB.sched[id] = {periods:[{from:fromS, days, time}], cancel:[], extra:[]};
    DB.progress[id] = {pos:7 + level % 5, xp, quizzes:[], badgesSeen:['first','l5','quiz1'], onboarded:true}; DB.books[id] = []; DB.live[id] = null;
  });
  normalize();
  const G = [['g1','محمد العتيبي','بابا','محمد','0551234567','abusami','482913',['sami','layan']],['g2','هيفاء القحطاني','ماما','هيفاء','0509876543','umfahad','739201',['fahad']],['g3','خالد الدوسري','بابا','خالد','0533344556','abunoura','615522',['noura']]];
  G.forEach(([id, name, rel, first, phone, user, pass, kids]) => { DB.guardians[id] = {id, name, rel, first, phone, user, pass, kids, created:from.toISOString()}; kids.forEach(k => DB.kids[k].guardian = id); });
  const TITLES = ['My Family','At School','Food I Like','My Day','Animals at the Zoo','In the Park','Weather Today','My Hobbies','At the Shop','Weekend Plans','My Best Friend','At the Doctor','Travel by Plane','My Room','Sports Day','A Birthday Party','Telling the Time','In the Kitchen','Jobs People Do','My City','Helping at Home','At the Restaurant'];
  const WORDS = [['brother','sister','cousin'],['pencil','ruler','classroom'],['delicious','hungry','breakfast'],['wake up','usually','after school'],['giraffe','feed','cage'],['swing','slide','bench'],['cloudy','windy','forecast'],['painting','collect','free time'],['price','cheap','receipt'],['picnic','visit','maybe']];
  const NOTES = ['شارك اليوم بحماس وجاوب بجمل كاملة في أغلب الأسئلة. استخدم التعبير الجديد I usually ... أكثر من مرة من نفسه.','بداية الحصة كان هادئ شوي، وبعد اللعبة صار يتكلم أكثر. يحتاج يطوّل إجاباته بدل كلمة واحدة.','حصة ممتازة. حكى عن يومه بثلاث جمل متتالية بدون مساعدة، ونطقه للكلمات الجديدة واضح.','فهم الدرس بسرعة، بس يتردد قبل ما يتكلم. شجّعوه في البيت يجاوب بصوت عالي.','تركيزه كان عالي اليوم وسأل المعلمة سؤالين من عنده، وهذا تقدم جميل.'];
  let rid = 0;
  K.forEach(([id, ar, en, level]) => {
    const past = slotsFor(id, now).filter(s => now - s.t > OPEN_AFTER * 60e3 || (id === 'fahad' && s.t < now));
    let n = 0; const base = {sami:74, layan:86, fahad:63, noura:79, yousef:82}[id];
    past.forEach((s, i) => { const miss = (i * 7 + id.length) % 9 === 3; if(miss) return; n++;
      const at = new Date(s.t.getTime() + 26 * 60e3).toISOString(), wob = ((i * 37 + id.length * 11) % 17) - 8, score = Math.max(48, Math.min(98, base + wob + Math.round(i / 3)));
      const title = TITLES[(i + level) % TITLES.length];
      DB.attendance.push({kid:id, slot:s.key, lessonNo:n, title, unit:'Daily Life', level, at, minutes:25});
      DB.reports.push({kid:id, slot:s.key, lessonNo:n, title, unit:'Daily Life', level, at, minutes:24 + i % 3, score, stars:score >= 85 ? 3 : score >= 65 ? 2 : 1,
        talkPct:Math.max(22, Math.min(58, 30 + Math.round(i * .8) + wob)), talkGoal:40, confidence:Math.max(40, Math.min(95, base - 6 + Math.round(i / 2) + (wob >> 1))), avgWords:3 + (i % 5) + (level > 6 ? 3 : 0),
        parentNote:NOTES[(i + id.length) % NOTES.length], talkNote:'نسبة كلامه قريبة من الهدف. الأسئلة المفتوحة تخليه يتكلم أكثر.', confidenceNote:'يجاوب بدون تردد في المواضيع اللي يحبها.', levelFit:['right','right','easy','hard'][i % 4], levelNote:'الدرس مناسب لمستواه الحالي.',
        strengths:['جمل كاملة', 'نطق واضح للكلمات الجديدة'], newWords:WORDS[i % WORDS.length], mistakes:[{wrong:'He go to school', right:'He goes to school'},{wrong:'I am agree', right:'I agree'}].slice(0, 1 + i % 2), homePractice:'اسألوه كل يوم سؤال واحد بالإنجليزي عن يومه: What did you do today?',
        v2:{exp:4 + i % 3, of:6, so:2 + i % 2, exit:['yes','partly','yes'][i % 3], stars:3 + i % 4}});
      if(i % 3 === 1) DB.progress[id].quizzes.push({slot:s.key, title, score:3 + (i % 3), total:5, stars:1 + (i % 3), at:new Date(s.t.getTime() + 32 * 60e3).toISOString()});
    });
    DB.progress[id].xpLog = Array.from({length:20}, (_, i) => [now.getTime() - i * 0.6 * 864e5, 40 + (i * 13) % 50]);
    DB.placements[id] = [{at:new Date(from.getTime() + 864e5).toISOString(), level, know:level, ai:level, items:'', skills:{grammar:62, vocabulary:70, listening:66, reading:58, speaking:60, pronunciation:64}, summary:`مستوى ${ar} مناسب للبداية من المستوى ${level}. مفرداته جيدة ويحتاج تدريب أكثر على تكوين الجمل.`}];
  });
  DB.progress.sami.exams = {5:{pct:84, items:88, speak:76, at:new Date(now.getTime() - 3 * 864e5).toISOString()}};
  DB.reviews.push({kid:'sami', at:new Date(now.getTime() - 9 * 864e5).toISOString(), before:58, after:83, items:['He goes to school'], minutes:12});
  DB.certs.push({kid:'sami', unit:'My World', level:5, date:new Date(now.getTime() - 16 * 864e5).toISOString()});
  // balances: computed from what was used so far
  const setLeft = (k, left) => { DB.balance[k] = 99999; DB.balance[k] = ledger(k).used + left * P; };
  setLeft('sami', 14); setLeft('layan', 22); setLeft('fahad', 2); setLeft('noura', 9); setLeft('yousef', 0); DB.renewReq.yousef = new Date(now.getTime() - 5 * 3600e3).toISOString();
  K.forEach(([id]) => DB.topups.push({kid:id, amount:2000, at:from.toISOString()})); DB.topups.push({kid:'layan', amount:1000, at:new Date(now.getTime() - 12 * 864e5).toISOString()});
  // sami is in class right now
  const op = ledger('sami').open; if(op){ DB.live.sami = {slot:op.key, startedAt:new Date(now.getTime() - 9 * 60e3).toISOString()};
    DB.livefeed.sami = {at:Date.now(), title:'Weekend Plans', talk:44, lines:[{w:'t', t:'What are you going to do this weekend, Sam?'},{w:'k', t:'I am going to visit my grandfather.'},{w:'t', t:'That sounds lovely! Where does he live?'},{w:'k', t:'He lives in Unaizah. We will have a picnic.'}]}; }
  DB.cheers.sami = [{id:'c1', at:new Date(now.getTime() - 26 * 3600e3).toISOString(), from:'بابا محمد', gid:'g1', text:'أحسنت يا بطل! 👏'}]; DB.progress.sami.cheersSeen = ['c1'];
  DB.redeems.push({id:'r1', kid:'layan', name:'آيس كريم', emoji:'🍦', cost:500, status:'pending', at:now.toISOString()});
  DB.azure = null; G_KID = null;
};
