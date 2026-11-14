// step 3: streaming recognition, end-of-turn, low confidence, fallbacks (scripted mic + scripted SDK)
const {open, sleep} = require('./h');
const fs = require('fs');
const MOCK = fs.readFileSync(__dirname + '/mock.js', 'utf8');
const scen = {
  A_done: {speech:[[200, 1400]], sdk:[[600, 'partial', 'I like'], [1200, 'partial', 'I like football'], [1900, 'final', 'I like football.', .92]]},
  B_because: {speech:[[200, 1200], [3200, 4200]], sdk:[[1000, 'partial', 'I like football because'], [1700, 'final', 'I like football because.', .9], [4000, 'partial', 'it is fun'], [4700, 'final', 'It is fun.', .88]]},
  C_hanging: {speech:[[200, 1200]], sdk:[[1000, 'partial', 'my favorite food is'], [1700, 'final', 'My favorite food is.', .9]]},
  D_low: {speech:[[200, 1000]], sdk:[[800, 'partial', 'i lick'], [1500, 'final', 'I lick fart ball.', .3]]},
  D_retry: {speech:[[200, 1100]], sdk:[[900, 'partial', 'I like football'], [1600, 'final', 'I like football.', .9]]},
  E_empty: {speech:[[200, 700]], sdk:[], onClose:[['nomatch']]},
  F_cancel: {speech:[[200, 1200]], sdk:[[600, 'partial', 'hello'], [700, 'cancel']], rest:{text:'Hello teacher, I am fine.', conf:.8}},
  J_manual: {speech:[[200, 9000]], sdk:[[800, 'partial', 'I am talking about'], [1400, 'partial', 'I am talking about my day']], onClose:[['final', 'I am talking about my day.', .85]], tapAt:1600},
  K_partialOnly: {speech:[[200, 1100]], sdk:[[700, 'partial', 'yes I do']], onClose:[['final', 'Yes, I do.', .9]], closeDelay:200},
};
(async () => {
  const {b, p, errs, logs} = await open();
  await p.evaluate(MOCK);
  const out = await p.evaluate(async scen => {
    __install(); window.SpeechSDK = __mkSDK();
    window.streamSttOn = () => !STREAM_DOWN; window.azAuth = async () => ({region:'westeurope', h:{Authorization:'Bearer TKN'}});
    let restQ = []; window.azRecognize = async () => { const r = restQ.shift(); if(!r) return {text:'', conf:null}; if(r.fail){ const e = new TypeError('Failed to fetch'); throw e; } return r; };
    window.speakOne = (t, s, d) => setTimeout(d, 40);
    let n = 0; window.streamClaude = async function*(){ n++; await new Promise(r => setTimeout(r, 60)); yield 'Okay! Tell me more?\n[MOOD:happy]'; };
    startLesson(WHO, true);
    const res = {};
    for(const [name, sc] of Object.entries(scen)){
      if(name === 'D_retry') continue;
      __log.length = 0; restQ = sc.rest ? [sc.rest] : [];
      const list = [Object.assign({name}, sc)]; if(name === 'D_low') list.push(Object.assign({name:'D_retry'}, scen.D_retry)); if(name === 'E_empty') list.push({name:'E_after', speech:[[100, 900]], sdk:[[700, 'partial', 'ok'], [1300, 'final', 'Okay.', .9]]});
      // wait until the teacher is listening, then hand the scripted turn to the next capture
      for(let i = 0; i < 100 && !(L.state === 'listening' && L.rec); i++) await new Promise(r => setTimeout(r, 50));
      // the capture already running belongs to a silent scenario: restart listening with ours
      __scens.push(...list); stopListening(); startListening(false);
      if(sc.tapAt){ setTimeout(() => onMicTap(), sc.tapAt + 30); }
      for(let i = 0; i < 200 && !__log.some(x => x[1] === 'said' || (name === 'E_empty' && x[1] === 'note')); i++) await new Promise(r => setTimeout(r, 50));
      await new Promise(r => setTimeout(r, 300));
      const said = __log.find(x => x[1] === 'said'), notes = __log.filter(x => x[1] === 'note').map(x => x[2]);
      const sc2 = said ? (said[3] === 'D_retry' ? scen.D_retry : said[3] === 'E_after' ? {speech:[[100, 900]]} : sc) : sc, lastSpeechEnd = sc2.speech[sc2.speech.length - 1][1];
      res[name] = {said: said && said[2], afterSpeechEndMs: said ? said[0] - said[4] - Math.min(lastSpeechEnd, sc.tapAt || 1e9) : null, notes, state:L.state, recs:__recs.length,
        phrases:(__recOf(name) || {phrases:[]}).phrases.length, bytes:__recOf(name) ? __recOf(name).push.bytes : 0, tok:__recOf(name) ? __recOf(name).cfg.tok : null};
      if(name === 'E_empty'){ for(let i = 0; i < 100 && !__log.some(x => x[1] === 'said'); i++) await new Promise(r => setTimeout(r, 50)); res[name].thenSaid = (__log.find(x => x[1] === 'said') || [])[2]; await new Promise(r => setTimeout(r, 300)); }
    }
    return res;
  }, scen);
  for(const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
  const chk = [
    ['A sent ~0.8s after speech', out.A_done.said === 'I like football.' && out.A_done.afterSpeechEndMs < 1200 && out.A_done.afterSpeechEndMs >= 700],
    ['B waits through "because" pause and joins', out.B_because.said === 'I like football because it is fun.'],
    ['C hanging word waits ~4.3s', out.C_hanging.said === 'My favorite food is.' && out.C_hanging.afterSpeechEndMs > 4000 && out.C_hanging.afterSpeechEndMs < 5000],
    ['D low confidence -> note then retry', out.D_low.notes[0] === 'ما سمعتك زين، قلها مرة ثانية 🙂' && out.D_low.said === 'I like football.'],
    ['E empty -> note, then next turn works', out.E_empty.notes[0] === 'ما سمعتك زين، قلها مرة ثانية 🙂' && out.E_empty.thenSaid === 'Okay.'],
    ['F cancel -> REST fallback', out.F_cancel.said === 'Hello teacher, I am fine.'],
    ['J manual tap submits at once', out.J_manual.said === 'I am talking about my day.' && out.J_manual.afterSpeechEndMs < 900],
    ['K waits for final of pending partial', out.K_partialOnly.said === 'Yes, I do.' && out.K_partialOnly.afterSpeechEndMs < 1400],
    ['phrases + token + pcm', out.A_done.phrases > 20 && out.A_done.tok === 'TKN' && out.A_done.bytes > 30000],
  ];
  chk.forEach(([n, ok]) => console.log(ok ? 'PASS' : 'FAIL', n));
  console.log('errors', errs, logs.filter(l => /error/i.test(l)).slice(0, 5));
  await b.close();
})();
