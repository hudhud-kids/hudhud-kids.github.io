const {chromium} = require('playwright');
const PORT = process.env.PORT || 8781;
// whole lessons from the first turn to the report, in every format, at 4 levels (stubbed teacher)
(async () => { const b = await chromium.launch(); const errs = []; let bad = 0, n = 0;
  const p = await (await b.newContext({viewport:{width:820,height:1180}})).newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => sessionStorage.setItem('hh:splash','1'));
  await p.goto(`http://localhost:${PORT}/index.html#demo-kid`); await p.waitForTimeout(1500);
  for(const lv of [1, 8, 11, 20]) for(const pos of [0, 1, 2, 3, 5]){
    const r = await p.evaluate(async ([lv, pos]) => { try{
      if(window.L){ leaveRoomQuiet(); } document.querySelectorAll('.ov').forEach(o => o.remove());
      DB.progress[WHO].onboarded = true; DB.kids[WHO].level = lv; DB.progress[WHO].pos = pos; DB.progress[WHO].unitTest = null; await loadContent(lv);
      let n = 0; window.__sys = null;
      window.streamClaude = async function*(body){ n++; window.__sys = body.system[0].text; window.__last = body.messages[body.messages.length-1].content[0].text;
        yield (L && L.v2 && L.v2.doneAll) ? '[MOOD:happy] Bye, superstar!\n[END]' : '[MOOD:happy] Great job!\n[GOT]\n[STAR]\n[NEXT]'; };
      window.speakOne = (t, s, d) => setTimeout(d, 5);
      startLesson(WHO, true); const lsn = L, fmt = L.v2.fmt, steps = L.v2.steps.map(s => s.k).join(','), slides = new Set();
      for(let i = 0; i < 40 && L && !L.done; i++){ await new Promise(r => setTimeout(r, 120)); if(!L || L.done) break; const h = document.querySelector('#slide .sl-h b'); if(h) slides.add(h.textContent);
        if(L.state !== 'speaking' && L.state !== 'thinking') studentSaid('I think it is great because it is fun.'); }
      await new Promise(r => setTimeout(r, 1500));
      const ended = !!document.querySelector('#back');
      const fm = /TODAY'S FORMAT: (\w+)/.exec(__sys || '');
      return {fmt, steps, ended, turns:n, pts:lsn.v2.pts, stars:lsn.v2.stars, goals:(lsn.v2.goalsOk||[]).filter(Boolean).length, rulesFmt:fm ? fm[1] : 'classic', labels:[...slides].join('|')};
    }catch(e){ return {err:e.message + e.stack}; } }, [lv, pos]);
    n++; const ok = !r.err && r.ended && r.turns > 5 && r.fmt === String(r.rulesFmt).toLowerCase(); if(!ok) bad++;
    console.log(ok ? 'PASS' : 'FAIL', 'L' + lv, 'pos' + pos, JSON.stringify(r));
    await p.evaluate(() => { document.querySelectorAll('.ov').forEach(o => o.remove()); });
  }
  console.log(!errs.length ? 'PASS' : 'FAIL', 'no page errors', errs.slice(0, 5)); if(bad || errs.length) process.exitCode = 1; await b.close(); })();
