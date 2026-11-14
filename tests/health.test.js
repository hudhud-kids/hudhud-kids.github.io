// item 6: per-lesson health counters -> report.health, DB.health (last 30), healthSummary() and the Arabic card
const {open, check, sleep} = require('./h');
const SHOTS = process.env.SHOTS || '';
(async () => {
  const {b, p, errs} = await open();
  const r = await p.evaluate(async () => {
    window.speakOne = (t, s, d) => { setTimeout(() => audioStarted(), 5); setTimeout(d, 30); }; window.startListening = () => setState('listening');
    let fail = 0; window.streamClaude = async function*(){ await new Promise(r => setTimeout(r, 40)); if(fail-- > 0) throw {status:529, body:'busy'}; yield 'Nice! And then?\n[MOOD:happy]'; };
    window.callClaude = async () => JSON.stringify({score:80, stars:2, newWords:[], mistakes:[], parentNote:'x', kidNote:'y', quiz:[]});
    startLesson(WHO, true); await new Promise(r => setTimeout(r, 300));
    for(let i = 0; i < 4; i++){ L.tSpeechEnd = Date.now() - 700; studentSaid('Turn ' + i + '.'); for(let j = 0; j < 200 && L.state !== 'listening'; j++) await new Promise(r => setTimeout(r, 10)); }
    fail = 1; L.tSpeechEnd = Date.now() - 700; studentSaid('Retry turn.'); await new Promise(r => setTimeout(r, 1800));   // one quiet retry
    hcAdd('unclear'); hcAdd('unclear'); hcAdd('sttFails'); hcAdd('fbVoice'); hcAdd('fbRest');
    const hc = Object.assign({}, L.hc), k = WHO;
    await finishLesson(); await new Promise(r => setTimeout(r, 200)); document.querySelectorAll('.ov').forEach(o => o.remove()); leaveRoomQuiet();
    const row = DB.health[DB.health.length - 1];
    // the same lesson also saved on a report (real lessons): must not be counted twice; plus an old one outside the 7 days
    DB.reports.push({kid:k, slot:'x', at:row.at, title:'T', health:Object.assign({}, row)});
    DB.reports.push({kid:k, slot:'y', at:new Date(Date.now() - 9 * 864e5).toISOString(), health:{turns:50, lat:9000, unclear:9, relayErr:9}});
    DB.reports.push({kid:k, slot:'z', at:new Date(Date.now() - 2 * 864e5).toISOString(), title:'Older', health:{turns:10, lat:3000, unclear:1, sttFails:0, retries:0, relayErr:0, fbVoice:0, fbRest:0}});
    for(let i = 0; i < 40; i++) healthSave({kid:k, plan:{t:'x'}, trial:true, freeReview:true, hc:{}, lat:[]}, new Date(Date.now() - 20 * 864e5 - i * 1000).toISOString());
    const capped = DB.health.length; DB.health = DB.health.filter(x => x.at === row.at);
    const sum = healthSummary(), html = healthCardHTML();
    const empty = (() => { const keepH = DB.health, keepR = DB.reports; DB.health = []; DB.reports = []; const h = healthCardHTML(); DB.health = keepH; DB.reports = keepR; return h; })();
    return {hc, row, capped, sum:Object.assign({}, sum, {rows:undefined}), html, empty};
  });
  console.log(JSON.stringify({hc:r.hc, row:r.row, sum:r.sum}));
  check('counters during the lesson', r.hc.turns === 5 && r.hc.retries === 1 && r.hc.unclear === 2 && r.hc.sttFails === 1 && r.hc.fbVoice === 1 && r.hc.fbRest === 1, r.hc);
  check('DB.health row {kid, at, turns, lat, ...}', r.row && r.row.kid && r.row.at && r.row.turns === 5 && r.row.lat > 0 && r.row.unclear === 2 && r.row.retries === 1, r.row);
  check('DB.health keeps the last 30', r.capped === 30, r.capped);
  check('summary: 7 days, no double counting, turn-weighted reply time', r.sum.lessons === 2 && r.sum.turns === 15 && r.sum.unclear === 3 && r.sum.sttFails === 1 && r.sum.retries === 1 && r.sum.lat === Math.round((r.row.lat * 5 + 3000 * 10) / 15) && r.sum.last.at === r.row.at, r.sum);
  check('card: the four Arabic figures', ['متوسط زمن الرد', 'مرات «ما سمعتك»', 'أخطاء الاتصال', 'آخر حصة'].every(t => r.html.includes(t)) && /id="healthCard"/.test(r.html), r.html.slice(0, 300));
  check('card: empty state', /لا توجد حصص مسجّلة/.test(r.empty));
  // the card inside a dashboard-like page, at every size
  const sizes = [[390, 844], [844, 390], [820, 1180], [1180, 820], [1440, 900]]; let overflow = [];
  for(const [w, h] of sizes){ await p.setViewportSize({width:w, height:h});
    const o = await p.evaluate(html => { document.querySelector('#app').innerHTML = `<main style="max-width:1100px;margin:0 auto;padding:16px;display:grid;gap:14px">${html}</main>`; const c = document.getElementById('healthCard'), r = c.getBoundingClientRect();
      const bad = [...c.querySelectorAll('*')].filter(e => { const q = e.getBoundingClientRect(); return q.width && (q.left < r.left - 1 || q.right > r.right + 1); }).length;
      return {sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth, bad}; }, r.html);
    if(o.sw > o.cw + 1 || o.bad) overflow.push([w, h, o]); await sleep(100);
    if(SHOTS) await p.screenshot({path:`${SHOTS}/health-${w}x${h}.png`}); }
  check('card fits at 390, 844, 820, 1180 and 1440 wide', !overflow.length, overflow);
  check('no page errors', !errs.length, errs);
  await b.close();
})();
