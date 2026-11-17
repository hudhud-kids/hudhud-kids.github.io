const {start, check, info, sleep} = require('./lib');
(async () => { const t = await start(); const {p} = t; await p.evaluate(() => { __cfg.autoReply = false; L.trial = false; L.slot = L.slot || 'demo-slot'; L.startedAt = new Date(Date.now() - 22.5 * 60e3); L.v2.i = L.v2.steps.length - 1; L.v2.doneAll = true; });
  await p.evaluate(() => __ws.user('I would be a teacher because I like kids.', 'Wonderful, Ahmed! You spoke so well today. Goodbye!', '[EXIT:yes] [END] [MOOD:proud]', {sec:.5})); await sleep(5000);
  const r = await p.evaluate(() => ({done:L ? L.done : 'noL', ov:document.querySelector('.ov') ? document.querySelector('.ov').innerText.slice(0, 120) : null, pend:!!(DB.progress[WHO] && DB.progress[WHO].pendingQuiz), stickers:(DB.progress[WHO].stickers || []).length, att:(DB.attendance || []).length, exit:L && L.v2.exit}));
  info('full end of lesson in dg mode (EXIT:yes + END at 22.5 min)', r); check('report overlay shown after [END]', !!r.ov);
  await p.screenshot({path:'/tmp/hudhud-dg-finish.png'});
  // quiz
  await p.evaluate(() => { const b = document.querySelector('#back'); b && b.click(); }); await sleep(800);
  const q = await p.evaluate(() => ({quiz:!!document.querySelector('.quiz'), txt:(document.querySelector('.quiz') || {}).innerText && document.querySelector('.quiz').innerText.slice(0, 80)}));
  info('quiz after report', q); console.log(t.errs); await t.close(); })();
