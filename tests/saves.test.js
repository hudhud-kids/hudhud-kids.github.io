// item 4: during a lesson saves are debounced (never while listening), cloud pulls are paused, everything is flushed at the end
const {openReal, check} = require('./h');
(async () => {
  const {b, p, errs} = await openReal();
  const r = await p.evaluate(async () => {
    const out = {};
    const saves = []; const _save = window.save; window.save = () => { saves.push([Date.now(), L ? L.state : 'none']); _save(); };
    let feeds = 0; const _lf = window.liveFeed; window.liveFeed = (a, b2, c) => { feeds++; _lf(a, b2, c); };
    window.speakOne = (t, s, d) => setTimeout(d, 60); window.startListening = () => setState('listening');
    window.streamClaude = async function*(){ await new Promise(r => setTimeout(r, 30)); yield 'Nice! And then?\n[MOOD:happy]'; };
    // pull timers: capture the interval callbacks cloudStart registers
    const ivs = []; const _si = window.setInterval; window.setInterval = (fn, ms) => { ivs.push({fn, ms}); return _si(() => {}, 1e9); };
    let pulls = 0; window.cloudPull = async () => { pulls++; return false; };
    CLOUD.token = '00000000-0000-0000-0000-000000000000'; cloudStart(); window.setInterval = _si;
    out.timers = ivs.map(x => x.ms);
    for(const t of ivs) await t.fn(); out.pullsIdle = pulls;            // not in a lesson: the 25 s timer pulls
    CLOUD.token = null;
    startLesson(WHO, true); await new Promise(r => setTimeout(r, 300));
    CLOUD.token = '00000000-0000-0000-0000-000000000000'; pulls = 0;
    for(const t of ivs) await t.fn(); out.pullsInLesson = pulls;        // in a lesson: no timer pulls
    CLOUD.token = null;
    const s0 = saves.length, f0 = feeds;
    for(let i = 0; i < 12; i++){ studentSaid('I like it number ' + i + '.'); for(let j = 0; j < 100 && L.state !== 'listening'; j++) await new Promise(r => setTimeout(r, 10)); await new Promise(r => setTimeout(r, 120)); }
    out.feeds = feeds - f0; out.savesDuring = saves.length - s0; out.savedWhileListening = saves.slice(s0).filter(x => x[1] === 'listening').length;
    out.dirty = LSAVE_DIRTY;
    // page hidden / closed: flushed
    const n1 = saves.length; window.dispatchEvent(new Event('pagehide')); out.flushOnPagehide = saves.length - n1; out.dirtyAfter = LSAVE_DIRTY;
    studentSaid('One more.'); await new Promise(r => setTimeout(r, 300));
    // leaving: flushed, feed closed, one catch-up pull
    CLOUD.token = '00000000-0000-0000-0000-000000000000'; pulls = 0; const n2 = saves.length, k = L.kid;
    leaveRoomQuiet(); out.flushOnLeave = saves.length - n2;
    out.feedDone = JSON.parse(localStorage.getItem(STORE_KEY)).livefeed[k].done === true;
    await new Promise(r => setTimeout(r, 1900)); out.pullAfter = pulls; CLOUD.token = null;
    return out;
  });
  console.log(JSON.stringify(r));
  check('both pull timers exist (25 s and fast)', r.timers.includes(25000) && r.timers.includes(6000), r);
  check('timer pulls when no lesson is running', r.pullsIdle >= 1, r);
  check('no timer pulls during a lesson', r.pullsInLesson === 0, r);
  check('24 feed lines -> at most 2 saves (was 24)', r.feeds === 24 && r.savesDuring <= 2, r);
  check('never saved while listening', r.savedWhileListening === 0, r);
  check('pending changes flushed on pagehide', r.dirty === true && r.flushOnPagehide === 1 && r.dirtyAfter === false, r);
  check('flushed when the room is left, feed marked done', r.flushOnLeave >= 1 && r.feedDone, r);
  check('one catch-up pull after the lesson', r.pullAfter === 1, r);
  check('no page errors', !errs.length, errs);
  await b.close();
})();
