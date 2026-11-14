// step 2: speech starts with the first sentence whether the mood tag is last (new) or first (old); mood still applied; tags never spoken
const {open} = require('./h');
(async () => {
  const {b, p, errs} = await open();
  const r = await p.evaluate(async () => {
    const out = [];
    const said = []; window.speakOne = (t, s, d) => { said.push([Date.now(), t]); setTimeout(d, 30); };
    window.startListening = () => setState('listening');
    const replies = {
      last: ['Wow', '! ', 'You are ', 'so fast. ', 'What ', 'do you ', 'like?', '\n[STAR]', '\n[MOOD:', 'excited]'],
      first: ['[MOOD:', 'proud] ', 'Great', ' job! ', 'Tell me ', 'more?', '\n[NEXT]'],
      comma: ['Oh I really love that idea about football, ', 'because it is fun. ', 'Why?\n[MOOD:laughing]'],
      inline: ['Nice! How are you? [MOOD:surprised]'], greet: ['Hi there! [MOOD:happy]'],
    };
    let cur = 'greet'; window.streamClaude = async function*(){ for(const t of replies[cur]){ await new Promise(r => setTimeout(r, 150)); yield t; } };
    startLesson(WHO, true); await new Promise(r => setTimeout(r, 800)); delete replies.greet;
    for(const k of Object.keys(replies)){
      said.length = 0; cur = k; const t0 = Date.now(); studentSaid('hello'); await new Promise(r => setTimeout(r, 2500));
      out.push({k, firstSpeakMs: said.length ? said[0][0] - t0 : null, said: said.map(x => x[1]), mood: L.mood, sub: document.querySelector('#sub').textContent, hist: L.history[L.history.length - 1].content.slice(-20)});
    }
    return out;
  });
  for(const x of r) console.log(JSON.stringify(x));
  const ok = r[0].firstSpeakMs < 450 && r[0].mood === 'excited' && r[0].said.join(' ') === 'Wow! You are so fast. What do you like?'
    && r[1].mood === 'proud' && r[1].said.join(' ') === 'Great job! Tell me more?' && r[2].said[0].startsWith('Oh I really') && r[2].said.length === 3 && r[2].mood === 'laughing'
    && r[3].said.join(' ') === 'Nice! How are you?' && r[3].mood === 'surprised' && !/MOOD|STAR|NEXT/.test(r.map(x => x.sub).join(''));
  console.log(ok ? 'PASS' : 'FAIL', errs);
  await b.close();
})();
