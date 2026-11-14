// step 4: prompts; step 6 wake lock; step 7 interrupt keeps the turn; step 8 latency in report
const {open} = require('./h');
(async () => {
  const {b, p, errs, logs} = await open({init: () => {
    window.__wl = []; Object.defineProperty(navigator, 'wakeLock', {value:{request: async t => { const s = {type:t, released:false, release: async () => { s.released = true; window.__wl.push('release'); }}; window.__wl.push('request'); return s; }}, configurable:true}); }});
  const r = await p.evaluate(async () => {
    const out = {};
    window.speakOne = (t, s, d) => { setTimeout(() => { if(typeof audioStarted === 'function') audioStarted(); }, 20); setTimeout(d, 60); };
    window.startListening = () => setState('listening');
    let mode = 'normal', sentBodies = [];
    window.streamClaude = async function*(body, signal){ sentBodies.push(JSON.parse(JSON.stringify(body.messages)));
      if(mode === 'slow'){ yield 'Well, '; await new Promise((r, j) => { const t = setTimeout(r, 3000); signal.addEventListener('abort', () => { clearTimeout(t); const e = new Error('aborted'); e.name = 'AbortError'; j(e); }); }); }
      await new Promise(r => setTimeout(r, 80)); yield 'Nice! What next?\n[MOOD:happy]'; };
    // v2 lesson rules (if the level has a v2 script) and classic rules
    startLesson(WHO, true); await new Promise(r => setTimeout(r, 600));
    out.rulesV2 = L.v2 ? L.rules : null; out.rulesClassic = buildRules(WHO, L.plan);
    out.wake1 = __wl.slice();
    // step 7: interrupt while streaming keeps the child's message; next turn merges, roles alternate
    mode = 'slow'; studentSaid('I went to the park'); await new Promise(r => setTimeout(r, 250));
    interrupt(true); await new Promise(r => setTimeout(r, 100)); mode = 'normal';
    studentSaid('with my brother'); await new Promise(r => setTimeout(r, 800));
    const last = sentBodies[sentBodies.length - 1];
    out.roles = L.history.map(h => h.role).join(','); out.lastUser = last[last.length - 1].content[0].text;
    out.alternates = L.history.every((h, i) => !i || h.role !== L.history[i - 1].role);
    // visibility: re-request when visible
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 100));
    // step 8: a few timed turns, then the report
    for(let i = 0; i < 3; i++){ L.tSpeechEnd = Date.now() - 900; studentSaid('Turn ' + i); await new Promise(r => setTimeout(r, 500)); }
    out.lat = L.lat;
    let reportPrompt = ''; window.callClaude = async body => { reportPrompt = body.messages[0].content; return JSON.stringify({score:80, stars:2, newWords:[], mistakes:[], parentNote:'x', kidNote:'y', quiz:[]}); };
    await finishLesson(); await new Promise(r => setTimeout(r, 300));
    out.reportHasRule = /looks like a speech-recognition error/.test(reportPrompt);
    out.reportLat = latSummary({lat:L ? L.lat : []});
    out.wake2 = __wl.slice();
    document.querySelector('#back') && document.querySelector('#back').click();
    return out;
  });
  const old = /pronunciation problem/;
  const chk = [
    ['v2 rules: honesty rule, no old rule, mood last', !r.rulesV2 || (!old.test(r.rulesV2) && /assume the recogniser made the mistake/.test(r.rulesV2) && /ALWAYS finish with the mood tag/.test(r.rulesV2))],
    ['classic rules: honesty rule, no old rule, mood last', !old.test(r.rulesClassic) && /assume the recogniser made the mistake/.test(r.rulesClassic) && /Last line, always: \[MOOD/.test(r.rulesClassic)],
    ['report prompt rule', r.reportHasRule],
    ['wake lock requested at start', r.wake1[0] === 'request'],
    ['wake lock released at end', r.wake2.includes('release')],
    ['interrupt kept child turn + merged', /I went to the park[\s\S]*with my brother/.test(r.lastUser) && r.alternates],
    ['latency recorded', Array.isArray(r.lat) && r.lat.length >= 3 && r.reportLat && r.reportLat.n >= 3 && r.reportLat.stt >= 800],
  ];
  r.reportLat = JSON.parse((logs.find(l => /lesson latency avg ms/.test(l)) || 'x null').replace(/^.*avg ms /, ''));
  console.log(JSON.stringify({v2:!!r.rulesV2, roles:r.roles, lastUser:r.lastUser, lat:r.lat, reportLat:r.reportLat, wake1:r.wake1, wake2:r.wake2}));
  chk.forEach(([n, ok]) => console.log(ok ? 'PASS' : 'FAIL', n));
  console.log('errors', errs);
  await b.close();
})();
