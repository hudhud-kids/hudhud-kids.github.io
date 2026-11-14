// full loop: 14 turns, speaking -> listening -> thinking -> speaking, with Azure voice (stubbed), ack, streaming STT (mock SDK)
const {open} = require('./h');
const fs = require('fs');
const MOCK = fs.readFileSync(__dirname + '/mock.js', 'utf8');
(async () => {
  for(const [w, h, tag] of [[1180, 820, 'ipad-land'], [390, 844, 'phone']]){
    const {b, p, errs, logs} = await open({w, h, init: () => {
      window.__wl = []; Object.defineProperty(navigator, 'wakeLock', {value:{request: async t => { const s = {released:false, release: async () => { s.released = true; window.__wl.push('release'); }}; window.__wl.push('request'); window.__lock = s; return s; }}, configurable:true}); }});
    await p.evaluate(MOCK);
    const r = await p.evaluate(async () => {
      __install(); window.SpeechSDK = __mkSDK();
      DB.azure = {key:'k', region:'r'}; window.streamSttOn = () => true; window.azAuth = async () => ({region:'r', h:{Authorization:'Bearer T'}});
      // 0.4 s of silence as a real WAV so <audio> really plays
      const sr = 8000, n = sr * .4, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), ws = (o, s) => { for(let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * 2, true);
      const WAVURL = URL.createObjectURL(new Blob([buf], {type:'audio/wav'}));
      const played = []; const _play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function(){ played.push([Date.now(), this.__t || '?']); return _play.call(this); };
      window.azFetchNet = async text => { await new Promise(r => setTimeout(r, 300)); const u = URL.createObjectURL(new Blob([buf], {type:'audio/wav'})); return u; };
      let turn = 0; window.streamClaude = async function*(body, signal){ turn++; await new Promise((r, j) => { const t = setTimeout(r, 900); signal && signal.addEventListener('abort', () => { clearTimeout(t); const e = new Error('a'); e.name = 'AbortError'; j(e); }); });
        yield 'Great! '; await new Promise(r => setTimeout(r, 100)); yield `Question ${turn}, what do you think?\n[MOOD:${turn % 2 ? 'happy' : 'proud'}]`; };
      const states = []; const _ss = window.setState; window.setState = s => { if(!states.length || states[states.length - 1][1] !== s) states.push([Date.now(), s]); _ss(s); };
      let restQ = []; window.azRecognize = async () => { const x = restQ.shift(); if(!x || x.fail) throw new TypeError('Failed to fetch'); return x; };
      const say = (i, extra) => Object.assign({name:'t' + i, speech:[[150, 1000]], sdk:[[500, 'partial', 'my answer'], [900, 'partial', 'my answer number ' + i], [1500, 'final', 'My answer number ' + i + '.', .9]]}, extra || {});
      for(let i = 0; i < 16; i++) __scens.push(i === 5 ? say(i, {sdk:[[900, 'final', 'Mah nuh.', .2]]}) : i === 9 ? say(i, {sdk:[[400, 'cancel']]}) : say(i));
      restQ = [{text:'Answer after a dropped stream.', conf:.9}];
      startLesson(WHO, true);
      const T0 = Date.now();
      // one interrupt while the teacher speaks
      let interrupted = false;
      while(Date.now() - T0 < 60000 && __log.filter(x => x[1] === 'said').length < 13){
        await new Promise(r => setTimeout(r, 100));
        if(!interrupted && __log.filter(x => x[1] === 'said').length === 3 && L.state === 'thinking'){ interrupted = true; __scens.unshift(say(99)); interrupt(true); }
      }
      // wake lock dropped by the system (app hidden) -> re-requested when visible
      __lock.released = true; document.dispatchEvent(new Event('visibilitychange')); await new Promise(r => setTimeout(r, 100));
      const said = __log.filter(x => x[1] === 'said').map(x => x[2]);
      // longest time spent in one state (stuck detector)
      let maxStay = 0, maxState = ''; for(let i = 1; i < states.length; i++){ const d = states[i][0] - states[i - 1][0]; if(d > maxStay){ maxStay = d; maxState = states[i - 1][1]; } }
      const seq = states.map(x => x[1][0]).join('');
      return {said, notes:__log.filter(x => x[1] === 'note').map(x => x[2]), seq, maxStay, maxState, lat:L.lat, hist:L.history.map(h => h.role[0]).join(''), wake:__wl, played:played.length, mood:L.mood, state:L.state};
    });
    console.log(tag, JSON.stringify(Object.assign({}, r, {lat:undefined})));
    const avg = k => Math.round(r.lat.filter(x => x[k] != null).reduce((a, x) => a + x[k], 0) / r.lat.filter(x => x[k] != null).length);
    console.log(tag, 'avg latency', {stt:avg('stt'), llm:avg('llm'), tts:avg('tts'), total:avg('total'), n:r.lat.length});
    const alternates = !/uu|aa/.test(r.hist);
    const chk = [
      ['13 child turns sent', r.said.length >= 13],
      ['never stuck (max state stay < 9 s)', r.maxStay < 9000],
      ['cycle l->t->s seen repeatedly', (r.seq.match(/lts/g) || []).length >= 10],
      ['low-confidence turn asked again', r.notes.includes('ما سمعتك زين، قلها مرة ثانية 🙂')],
      ['dropped stream rescued by REST', r.said.includes('Answer after a dropped stream.')],
      ['history alternates', alternates],
      ['wake lock re-requested after system release', r.wake.filter(x => x === 'request').length >= 2],
      ['acks + replies played via audio', r.played >= 20],
    ];
    chk.forEach(([n, ok]) => console.log(tag, ok ? 'PASS' : 'FAIL', n));
    console.log(tag, 'errors', errs, logs.filter(l => /^error/.test(l)).slice(0, 4));
    await b.close();
  }
})();
