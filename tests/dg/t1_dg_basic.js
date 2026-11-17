const {start, check, info, sleep} = require('./lib');
(async () => { const t = await start(); const {p} = t;
  const s = await p.evaluate(() => ({state:L.state, dg:!!L.dg, open:L.dg && L.dg.open, sent:__sent.map(x => x.type), model:__settings.agent.think.provider.model, ep:__settings.agent.think.endpoint.url, hdr:Object.keys(__settings.agent.think.endpoint.headers)}));
  info('after greet', s); check('dg engine started + greeting injected', s.dg && s.open && s.sent.includes('InjectUserMessage'));
  // history
  await p.evaluate(() => __ws.user('My name is Ahmed.', 'Nice to meet you, Ahmed! What do you do after school?', '[GOT] [NEXT] [STAR] [MOOD:happy]')); await sleep(900);
  info('after turn', await p.evaluate(() => ({step:L.v2.i, stars:L.v2.stars, hist:L.history.map(h => h.role + ':' + h.content.slice(0, 60)), snap:localStorage.getItem('hh:lesson') ? 'yes' : 'none'})));
  // demo mode never writes snapshots (DEMO guard), so check the call path: dgChildSaid and dgTags call lessonSnap
  check('lesson snapshot is taken in DG mode', await p.evaluate(() => /lessonSnap\(lesson\)/.test(dgChildSaid.toString()) && /lessonSnap\(lesson\)/.test(dgTags.toString())), 'dg engine does not snapshot');
  console.log(t.errs); await t.close(); })();
