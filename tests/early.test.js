// item 3: the mic opens while the teacher's last sentence plays; her own voice is ignored; kill switch restores the old behaviour
// item 10: the lessonUtterance contract
const {open, check} = require('./h');
const fs = require('fs');
const MOCK = fs.readFileSync(__dirname + '/mock.js', 'utf8');
(async () => {
  const {b, p, errs} = await open();
  await p.evaluate(MOCK);
  const r = await p.evaluate(async () => {
    __install(); window.SpeechSDK = __mkSDK(); DB.earlyMic = true; // early mic is opt-in
    window.streamSttOn = () => !STREAM_DOWN; window.azAuth = async () => ({region:'r', h:{Authorization:'Bearer T'}});
    window.azRecognize = async () => ({text:'', conf:null});
    const ends = []; window.speakOne = (t, s, d) => { setTimeout(() => { ends.push(Date.now()); d(); }, 1500); };
    let reply = 'What is your favourite colour?\n[MOOD:happy]';
    window.streamClaude = async function*(){ await new Promise(r => setTimeout(r, 40)); yield reply; };
    const utt = []; window.lessonUtterance = u => utt.push({text:u.text, wav:!!u.wav, conf:u.conf, delayMs:u.delayMs, durMs:u.durMs});
    const states = []; const _ss = window.setState; window.setState = s => { states.push([Date.now(), s]); _ss(s); };
    const out = {};
    const turn = async (name, sc, first) => {
      if(!first) for(let j = 0; j < 400 && !(L.state === 'listening' && L.rec); j++) await new Promise(r => setTimeout(r, 25));
      __log.length = 0; ends.length = 0; states.length = 0; __scens.length = 0; __scens.push(Object.assign({name}, sc));
      if(first) startLesson(WHO, true); else { stopListening(); studentSaid('next'); }
      for(let j = 0; j < 400 && !__log.some(x => x[1] === 'said' && x[2] !== 'next'); j++) await new Promise(r => setTimeout(r, 25));
      const cap = __log.find(x => x[1] === 'capture' && x[2] === name), said = __log.find(x => x[1] === 'said' && x[2] !== 'next'), tEnd = ends[ends.length - 1];
      const lis = states.find(x => x[1] === 'listening');
      return {said:said && said[2], capBeforeEnd:cap ? tEnd - cap[0] : null, saidAfterEnd:said ? said[0] - tEnd : null, notes:__log.filter(x => x[1] === 'note').map(x => x[2]), rearm:__log.some(x => x[1] === 'rearm'),
        listeningAfterEnd:lis ? lis[0] - tEnd : null, recs:__recs.filter(x => x.scen === name).length};
    };
    // A: the child answers while the teacher is still finishing her question
    out.A = await turn('A', {speech:[[700, 1250]], sdk:[[1000, 'partial', 'It is blue'], [1400, 'final', 'It is blue.', .93]]}, true);
    out.uttA = utt[utt.length - 1];
    // B: the mic hears the teacher through the speaker (her own words), then the child answers after she ends
    reply = 'Okay! Tell me more about your cat?\n[MOOD:happy]';
    out.B = await turn('B', {speech:[[150, 1350], [2600, 3300]], sdk:[[600, 'partial', 'okay tell me'], [1300, 'final', 'Okay, tell me more about your cat.', .9], [3000, 'partial', 'she is white'], [3500, 'final', 'She is white.', .9]]});
    out.uttB = utt[utt.length - 1];
    // C: echo only, the child says nothing for a while: no "I didn't hear you" note, still listening
    for(let j = 0; j < 400 && !(L.state === 'listening' && L.rec); j++) await new Promise(r => setTimeout(r, 25));
    __log.length = 0; __scens.length = 0; __scens.push({name:'C', speech:[[150, 1300]], sdk:[[700, 'final', 'Tell me more about your cat.', .9]]}); stopListening(); studentSaid('next');
    await new Promise(r => setTimeout(r, 1500 + 3200));
    out.C = {notes:__log.filter(x => x[1] === 'note').length, said:__log.filter(x => x[1] === 'said' && x[2] !== 'next').length, state:L.state, rec:!!L.rec, talking:L.talking};
    // D, E: kill switches
    stopListening(); setState('listening'); L.rec = {abort(){}, teacherOn:false}; DB.earlyMic = false;
    out.D = await turn('D', {speech:[[300, 900]], sdk:[[600, 'partial', 'Yes I do'], [1000, 'final', 'Yes, I do.', .9]]});
    DB.earlyMic = true; try{ localStorage.setItem('hh:earlyMic', '0'); }catch(e){}
    out.E = await turn('E', {speech:[[300, 900]], sdk:[[600, 'partial', 'Yes I do'], [1000, 'final', 'Yes, I do.', .9]]});
    try{ localStorage.removeItem('hh:earlyMic'); }catch(e){}
    out.echo = [echoLike('what is your favorite color', 'What is your favourite colour?'), echoLike("what's your favorite collar", "What's your favourite colour?"), echoLike('it is blue', 'What is your favourite colour?'), echoLike('I like apples', 'Say: I like apples.')];
    return out;
  });
  console.log(JSON.stringify(r));
  check('A: recorder opened while the teacher was speaking', r.A.capBeforeEnd > 1000, r.A);
  check('A: the early answer is kept, sent right after she ends', r.A.said === 'It is blue.' && r.A.saidAfterEnd >= 0 && r.A.saidAfterEnd < 1300, r.A);
  check('A: one recogniser, no restart', r.A.recs === 1 && !r.A.rearm, r.A);
  check('A: "listening" state only after the teacher ended', r.A.listeningAfterEnd >= 0, r.A);
  check('B: her own words are ignored and the capture starts clean', r.B.said === 'She is white.' && r.B.rearm && !r.B.notes.length, r.B);
  check('C: echo alone does not end the turn or show a note', r.C.notes === 0 && r.C.said === 0 && r.C.state === 'listening' && r.C.rec && !r.C.talking, r.C);
  check('D: DB.earlyMic=false -> recorder opens after the teacher', r.D.capBeforeEnd <= 0 && r.D.said === 'Yes, I do.', r.D);
  check('E: device switch hh:earlyMic=0 -> same', r.E.capBeforeEnd <= 0 && r.E.said === 'Yes, I do.', r.E);
  check('echo rule: 60% of the words', r.echo[0] && r.echo[1] && !r.echo[2] && r.echo[3], r.echo);
  check('lessonUtterance contract: text, wav, conf, timings', !!(r.uttA && r.uttA.text === 'It is blue.' && r.uttA.wav && r.uttA.delayMs === 0 && r.uttA.durMs > 0 && r.uttB && r.uttB.delayMs > 800 && r.uttB.delayMs < 2000), [r.uttA, r.uttB]);
  check('no page errors', !errs.length, errs);
  await b.close();
})();
