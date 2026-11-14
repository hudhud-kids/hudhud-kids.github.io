// item 2: the recogniser and its connection are prepared while the teacher speaks; token refresh; cleanup
const {open, check} = require('./h');
const fs = require('fs');
const MOCK = fs.readFileSync(__dirname + '/mock.js', 'utf8');
async function run(warm){
  const {b, p, errs} = await open();
  await p.evaluate(MOCK);
  const r = await p.evaluate(async warm => {
    __install(); window.SpeechSDK = __mkSDK(); window.__connectMs = 600;
    let tokN = 0; window.streamSttOn = () => !STREAM_DOWN; window.azAuth = async () => ({region:'westeurope', h:{Authorization:'Bearer TKN' + (tokN++)}});
    if(!warm) window.sttWarm = () => {};
    DB.earlyMic = false; // this test measures the connection only
    window.azRecognize = async () => ({text:'REST', conf:.9});
    window.speakOne = (t, s, d) => { setTimeout(d, 900); };
    window.streamClaude = async function*(){ await new Promise(r => setTimeout(r, 60)); yield 'Okay! Do you like it?\n[MOOD:happy]'; };
    startLesson(WHO, true);
    const waits = [], lags = [];
    for(let i = 0; i < 4; i++){
      for(let j = 0; j < 200 && !(L.state === 'listening' && L.rec); j++) await new Promise(r => setTimeout(r, 25));
      __log.length = 0; const name = 'yes' + i; __scens.push({name, speech:[[200, 500]], sdk:[[450, 'partial', 'Yes'], [650, 'final', 'Yes.', .95]]}); stopListening(); startListening(false);
      for(let j = 0; j < 300 && !__log.some(x => x[1] === 'said'); j++) await new Promise(r => setTimeout(r, 25));
      const said = __log.find(x => x[1] === 'said'); waits.push(said ? said[0] - said[4] - 500 : null); lags.push((__recOf(name) || {}).lag);
    }
    const out = {waits, lags, recs:__recs.length, opens:__opens.length};
    if(warm){
      for(let j = 0; j < 100 && !STT_WARM; j++) await new Promise(r => setTimeout(r, 25));
      const w = STT_WARM; out.hasWarm = !!w; out.opened = !!(w && w.rec.openedAt);
      // token older than 7 minutes: refreshed on the recogniser
      if(w){ const before = w.rec.authorizationToken; w.tokAt = Date.now() - 7.5 * 60e3; sttWarm(); await new Promise(r => setTimeout(r, 80)); out.tokSet = w.rec.authorizationToken; out.tokBefore = before; out.tokFresh = Date.now() - w.tokAt < 5000;
        // too old to trust: not handed out
        w.tokAt = Date.now() - 9.8 * 60e3; const got = sttTake('en-US'); out.staleTaken = !!got; out.staleClosed = w.rec.closed; }
      sttWarm(); for(let j = 0; j < 100 && !STT_WARM; j++) await new Promise(r => setTimeout(r, 25)); const w2 = STT_WARM;
      leaveRoomQuiet(); out.cooled = STT_WARM === null && !!w2 && w2.rec.closed;
    }
    return out;
  }, warm);
  await b.close();
  return {r, errs};
}
(async () => {
  const cold = await run(false), hot = await run(true);
  const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  console.log('cold', JSON.stringify(cold.r)); console.log('warm', JSON.stringify(hot.r));
  console.log(`"Yes." sent after speech end: cold ${avg(cold.r.waits)} ms, warm ${avg(hot.r.waits)} ms (mock handshake 600 ms)`);
  check('cold: every turn waits for the handshake', cold.r.lags.every(l => l >= 500), cold.r.lags);
  check('warm: turns find an open connection', hot.r.lags.slice(1).every(l => l === 0), hot.r.lags);
  check('warm is faster by about the handshake', avg(cold.r.waits) - avg(hot.r.waits) > 300, [cold.r.waits, hot.r.waits]);
  check('connection opened ahead of time', hot.r.opens >= 4 && hot.r.hasWarm && hot.r.opened, hot.r);
  check('token refreshed on the recogniser before it expires', /^TKN\d+$/.test(hot.r.tokSet || '') && hot.r.tokSet !== hot.r.tokBefore && hot.r.tokFresh, hot.r);
  check('an expired warm recogniser is not used', hot.r.staleTaken === false && hot.r.staleClosed === true, hot.r);
  check('warm recogniser closed when the room is left', hot.r.cooled === true, hot.r);
  check('no page errors', !cold.errs.length && !hot.errs.length, [cold.errs, hot.errs]);
})();
