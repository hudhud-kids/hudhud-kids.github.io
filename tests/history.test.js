// item 1: the history window is stable between jumps, so the prompt cache keeps hitting on long lessons
const {open, check} = require('./h');
(async () => {
  const {b, p, errs} = await open();
  const r = await p.evaluate(async () => {
    const reqs = [];
    window.speakOne = (t, s, d) => setTimeout(d, 3); window.startListening = () => setState('listening');
    window.streamClaude = async function*(body){ reqs.push(JSON.parse(JSON.stringify({system:body.system, messages:body.messages}))); yield 'Nice! And then?\n[MOOD:happy]'; };
    startLesson(WHO, true); await new Promise(r => setTimeout(r, 150));
    for(let i = 0; i < 60; i++){ studentSaid('Answer number ' + i + '.'); for(let j = 0; j < 100 && L.state !== 'listening'; j++) await new Promise(r => setTimeout(r, 10)); }
    const txt = m => typeof m.content === 'string' ? m.content : m.content[0].text;
    let jumps = 0, maxLen = 0, prefixOK = true, firstUser = true, lastCached = true, sysCached = true, oneCache = true;
    for(let i = 0; i < reqs.length; i++){ const m = reqs[i].messages; maxLen = Math.max(maxLen, m.length);
      if(m[0].role !== 'user') firstUser = false;
      if(!(m[m.length - 1].content[0] && m[m.length - 1].content[0].cache_control)) lastCached = false;
      if(m.slice(0, -1).some(x => typeof x.content !== 'string')) oneCache = false;
      if(!reqs[i].system[0].cache_control) sysCached = false;
      if(i){ const prev = reqs[i - 1].messages;
        if(txt(prev[0]) !== txt(m[0])){ jumps++; continue; }
        for(let k = 0; k < prev.length; k++) if(txt(prev[k]) !== txt(m[k]) || prev[k].role !== m[k].role) prefixOK = false; } }
    // what the old code did: slice(-40) changes its first message on every turn once there are more than 40 messages
    let oldMisses = 0; for(let n = 3; n <= L.history.length; n += 2){ if(n > 40) oldMisses++; }
    return {n:reqs.length, jumps, maxLen, prefixOK, firstUser, lastCached, sysCached, oneCache, oldMisses, hist:L.history.length, from:L.histFrom};
  });
  console.log(JSON.stringify(r));
  check('61 requests sent', r.n === 61, r);
  check('window never exceeds 61 messages', r.maxLen <= 61, r);
  check('window starts on a user message', r.firstUser);
  check('between jumps the previous request is an exact prefix (cache hit)', r.prefixOK);
  check('only a few jumps in 60 turns (old code: a miss on every turn after 40 messages)', r.jumps >= 1 && r.jumps <= 4 && r.oldMisses > 30, r);
  check('cache_control on system and on the last message only', r.sysCached && r.lastCached && r.oneCache);
  check('no page errors', !errs.length, errs);
  await b.close();
})();
