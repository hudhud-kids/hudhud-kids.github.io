// item 5: a lesson interrupted by a reload is offered again and continues with the same history, step and slot;
// attendance is recorded once; the snapshot is cleared when the lesson finishes or is left on purpose
const {openReal, check} = require('./h');
const STUBS = () => {
  window.__msgs = [];
  window.speakOne = (t, s, d) => setTimeout(d, 30); window.startListening = () => setState('listening');
  window.streamClaude = async function*(body){ window.__msgs.push(body.messages[body.messages.length - 1].content[0].text); window.__sys = body.system[0].text; await new Promise(r => setTimeout(r, 30)); yield 'Great! Tell me more?\n[GOT]\n[STAR]\n[NEXT]\n[MOOD:happy]'; };
  window.callClaude = async () => JSON.stringify({score:80, stars:2, newWords:[], mistakes:[], parentNote:'x', kidNote:'y', quiz:[]});
};
const turns = async n => { for(let i = 0; i < n; i++){ studentSaid('I think it is fun number ' + i + '.'); for(let j = 0; j < 200 && L.state !== 'listening'; j++) await new Promise(r => setTimeout(r, 10)); } };
(async () => {
  // a lesson slot that is open right now
  const {b, p, errs, reload, kid} = await openReal({prep: (db, kid) => { db.sched[kid].extra = (db.sched[kid].extra || []).concat(keyOf(new Date())); db.balance[kid] = 100000; db.attendance = db.attendance.filter(a => a.kid !== kid || a.slot !== keyOf(new Date())); }});
  await p.evaluate(STUBS);
  const before = await p.evaluate(async turnsSrc => {
    const turns = new Function('return ' + turnsSrc)();
    await loadContent(DB.kids[WHO].level);
    startLesson(WHO, false); if(!L) return {noLesson:true, led:JSON.stringify(ledger(WHO).open)};
    await new Promise(r => setTimeout(r, 300)); await turns(3);
    return {hist:L.history.length, step:L.v2 ? L.v2.i : null, stars:L.v2 ? L.v2.stars : null, fmt:L.v2 ? L.v2.fmt : null, slot:L.slot, startedAt:L.startedAt.getTime(), sw:L.sw, rules:L.rules.length, turnsHc:L.hc.turns,
      snap:!!localStorage.getItem('hh:lesson'), att:DB.attendance.filter(a => a.kid === WHO).length, early:DB.progress[WHO].early};
  }, turns.toString());
  console.log('before', JSON.stringify(before));
  check('lesson running, snapshot written after each teacher turn', !before.noLesson && before.snap && before.hist === 8, before);

  // ---- reload mid-lesson
  await reload(); await p.waitForSelector('#resumeAsk', {timeout:8000}).catch(() => {});
  const ask = await p.evaluate(() => { const o = document.getElementById('resumeAsk'); return o ? {txt:o.textContent, y:o.querySelector('#rsY').textContent, n:o.querySelector('#rsN').textContent} : null; });
  check('«تكمل حصتك؟» is offered with كمّل / ابدأ من جديد', !!ask && /تكمل حصتك؟/.test(ask.txt) && ask.y === 'كمّل' && ask.n === 'ابدأ من جديد', ask);
  await p.evaluate(STUBS);
  await p.click('#rsY'); await p.waitForTimeout(700);
  const after = await p.evaluate(() => L ? {hist:L.history.length, step:L.v2 ? L.v2.i : null, stars:L.v2 ? L.v2.stars : null, fmt:L.v2 ? L.v2.fmt : null, slot:L.slot, startedAt:L.startedAt.getTime(), sw:L.sw, rules:L.rules.length,
    msg:__msgs[0], sysSame:__sys === L.rules, room:!!document.querySelector('.room'), slide:!!(document.querySelector('#slide') && document.querySelector('#slide').textContent.trim()), resumes:L.hc.resumes, turnsHc:L.hc.turns,
    att:DB.attendance.filter(a => a.kid === WHO).length, early:DB.progress[WHO].early, roles:L.history.map(h => h.role[0]).join('')} : null);
  console.log('after', JSON.stringify(after));
  check('back in the room with the same history (+ the welcome-back turn)', !!after && after.room && after.hist === before.hist + 2 && !/uu|aa/.test(after.roles), after);
  check('teacher is told the child reconnected', !!after && /the child reconnected: welcome back in one short sentence and continue the current step/.test(after.msg), after && after.msg);
  // the welcome-back reply of the stub contains [NEXT], so the step moved on by exactly one
  check('same slot, start time, format, words, rules; step continues', !!after && after.slot === before.slot && after.startedAt === before.startedAt && after.fmt === before.fmt && after.sw === before.sw && after.rules === before.rules && after.sysSame && after.step === before.step + 1 && after.slide, after);
  check('health counters carried over, resume counted', !!after && after.resumes === 1 && after.turnsHc === before.turnsHc, after);
  check('nothing recorded twice so far (attendance, early bonus)', !!after && after.att === before.att && after.early === before.early, after);

  // ---- finish: attendance once, snapshot gone, no offer after another reload
  const fin = await p.evaluate(async () => { const k = WHO, slot = L.slot; await finishLesson(); await new Promise(r => setTimeout(r, 200));
    return {att:DB.attendance.filter(a => a.kid === k && a.slot === slot).length, reports:DB.reports.filter(x => x.kid === k && x.slot === slot).length, snap:!!localStorage.getItem('hh:lesson'), health:!!(DB.reports.find(x => x.kid === k && x.slot === slot) || {}).health, dbHealth:(DB.health || []).length}; });
  check('finished: one attendance, one report with health, snapshot removed', fin.att === 1 && fin.reports === 1 && !fin.snap && fin.health && fin.dbHealth === 1, fin);
  await reload(); await p.waitForTimeout(2600);
  check('no offer after the lesson was finished', !(await p.$('#resumeAsk')));

  // ---- trial lesson: "start again", leaving on purpose, and an old snapshot
  await p.evaluate(STUBS);
  await p.evaluate(async turnsSrc => { const turns = new Function('return ' + turnsSrc)(); document.querySelectorAll('.ov').forEach(o => o.remove()); startLesson(WHO, true); await new Promise(r => setTimeout(r, 200)); await turns(2); }, turns.toString());
  await reload(); await p.waitForSelector('#resumeAsk', {timeout:8000}).catch(() => {});
  await p.evaluate(STUBS);
  const hasAsk2 = !!(await p.$('#resumeAsk')); if(hasAsk2) await p.click('#rsN'); await p.waitForTimeout(700);
  const fresh = await p.evaluate(() => L ? {hist:L.history.length, first:__msgs[0], trial:L.trial} : null);
  check('«ابدأ من جديد» starts a fresh lesson', hasAsk2 && !!fresh && fresh.hist <= 2 && /just joined/.test(fresh.first) && fresh.trial === true, fresh);
  const left = await p.evaluate(async turnsSrc => { const turns = new Function('return ' + turnsSrc)(); await turns(1); const had = !!localStorage.getItem('hh:lesson'); leaveRoom(); return {had, snap:!!localStorage.getItem('hh:lesson')}; }, turns.toString());
  check('leaving on purpose clears the snapshot', left.had && !left.snap, left);
  await p.evaluate(STUBS);
  await p.evaluate(async turnsSrc => { const turns = new Function('return ' + turnsSrc)(); startLesson(WHO, true); await new Promise(r => setTimeout(r, 200)); await turns(1);
    const s = JSON.parse(localStorage.getItem('hh:lesson')); s.at = Date.now() - 41 * 60e3; window.lessonSnap = () => {}; localStorage.setItem('hh:lesson', JSON.stringify(s)); }, turns.toString());
  await reload(); await p.waitForTimeout(2600);
  const old = await p.evaluate(() => ({ask:!!document.getElementById('resumeAsk'), snap:!!localStorage.getItem('hh:lesson')}));
  check('a snapshot older than 40 minutes is dropped silently', !old.ask && !old.snap, old);
  check('no page errors', !errs.length, errs);
  await b.close();
})();
