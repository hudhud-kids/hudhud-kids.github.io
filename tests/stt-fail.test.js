// step 5: STT failure is shown, listening restarts, after 2 failures the typing option appears; recovery resets the count
const {open} = require('./h');
const fs = require('fs');
const MOCK = fs.readFileSync(__dirname + '/mock.js', 'utf8');
(async () => {
  const {b, p, errs} = await open();
  await p.evaluate(MOCK);
  const r = await p.evaluate(async () => {
    __install(); window.SpeechSDK = __mkSDK();
    window.streamSttOn = () => true; window.azAuth = async () => ({region:'r', h:{'Ocp-Apim-Subscription-Key':'K'}});
    let restQ = []; window.azRecognize = async () => { const x = restQ.shift(); if(!x || x.fail){ throw new TypeError('Failed to fetch'); } return x; };
    window.speakOne = (t, s, d) => setTimeout(d, 30);
    window.streamClaude = async function*(){ await new Promise(r => setTimeout(r, 50)); yield 'Okay! And?\n[MOOD:happy]'; };
    const fail = n => ({name:n, speech:[[150, 900]], sdk:[[300, 'cancel']]});
    startLesson(WHO, true);
    for(let i = 0; i < 100 && !(L.state === 'listening' && L.rec); i++) await new Promise(r => setTimeout(r, 50));
    __log.length = 0; restQ = [{fail:true}, {fail:true}, {text:'Now it works.', conf:.9}];
    __scens.push(fail('f1'), fail('f2'), {name:'ok', speech:[[150, 900]], sdk:[[300, 'cancel']]});
    stopListening(); startListening(false);
    for(let i = 0; i < 200 && !__log.some(x => x[1] === 'said'); i++) await new Promise(r => setTimeout(r, 50));
    const typeBtn = !!document.getElementById('youType');
    return {log:__log.filter(x => x[1] !== 'capture' && x[1] !== 'capEnd'), typeBtnAfter:typeBtn, fails:L.sttFails, stateDuring:L.state, recKeys:__recs[0] && __recs[0].cfg.key};
  });
  console.log(JSON.stringify(r));
  const notes = r.log.filter(x => x[1] === 'note');
  const chk = [
    ['first failure shown, no typing yet', notes[0] && notes[0][2] === 'ما وصلني صوتك، جرّب مرة ثانية' && notes[0][3] === false],
    ['second failure offers typing', notes[1] && notes[1][3] === true],
    ['then recovers and sends', r.log.some(x => x[1] === 'said' && x[2] === 'Now it works.') && r.fails === 0],
    ['local mode uses subscription key', r.recKeys === 'K'],
  ];
  chk.forEach(([n, ok]) => console.log(ok ? 'PASS' : 'FAIL', n));
  // UI check: the typing button opens the box
  const opened = await p.evaluate(async () => { youNote('ما وصلني صوتك، جرّب مرة ثانية', true); document.getElementById('youType').click(); return !document.getElementById('typer').hidden; });
  console.log(opened ? 'PASS' : 'FAIL', 'typing button opens the type box');
    console.log('errors', errs);
  await b.close();
})();
