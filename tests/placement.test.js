// Placement test: routing accuracy (simulation), item banks, two-voice listening, probation. Run with tests/run.sh placement
// (or SIM_N=2000 node tests/placement.test.js for the full simulation: 2,000 synthetic children per true level).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = process.env.PORT || 8781, N = +(process.env.SIM_N || 200);
let failed = 0; const check = (name, ok, extra) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if(!ok) failed++; };

// 1) the pure routing block from index.html + the published banks
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const blk = html.slice(html.indexOf('/* PLACE-ROUTING-START'), html.indexOf('/* PLACE-ROUTING-END */'));
const R = new Function(blk + '; return {placeRouter, placePoolFrom, placeEst, placeCombine, placeSpeakLevel, placeCanDo};')();
const banks = Array.from({length:20}, (_, i) => JSON.parse(fs.readFileSync(path.join(ROOT, `content/P${i + 1}.json`), 'utf8')));
const pool = R.placePoolFrom(banks), cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/cando.json'), 'utf8'));
check('banks: 560+ items with d, cefr, skill, cando and a known cid', pool.length >= 560 && pool.every(x => isFinite(x.d) && x.ref.cefr && x.ref.skill && x.ref.cando && cat[x.cid]), `${pool.length} items`);
check('banks: 12 picture items in levels 1-3', pool.filter(x => x.kind === 'pic').length === 12 && pool.filter(x => x.kind === 'pic').every(x => x.lv <= 3));

// 2) simulation: logistic response model with guessing, item difficulties misrated (sd 0.7), 30% "I don't know" when unsure
const randn = () => { let u = 0, v = 0; while(!u) u = Math.random(); while(!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function child(theta, o){ o = o || {}; const t = new Map(pool.map(x => [x, {d:x.d + randn() * .7, a:1.1 * Math.exp(randn() * .25)}]));
  const r = R.placeRouter(pool, {preReader:!!o.pre}); let it, n = 0;
  while((it = r.next()) && n++ < 40){ let ok = false, idk = false;
    if(o.tapper) ok = Math.random() < 1 / it.nopt;
    else if(o.nonReader && it.kind !== 'pic'){ if(Math.random() < .5) idk = true; else ok = Math.random() < 1 / it.nopt; }
    else { const p = t.get(it); if(Math.random() < 1 / (1 + Math.exp(-p.a * (theta - p.d)))) ok = true; else if(Math.random() < .3) idk = true; else ok = Math.random() < 1 / it.nopt; }
    r.record(it, ok, idk, 1); }
  const maxOk = Math.max(0, ...r.log.filter(x => x.ok).map(x => x.d));
  return {level:Math.max(1, Math.min(20, Math.round(r.est()), Math.round(maxOk) + 1)), n, pic:r.state.picFinal}; }
let w1 = 0, mae = 0, items = 0;
for(let L = 1; L <= 20; L++) for(let i = 0; i < N; i++){ const c = child(L); const e = Math.abs(c.level - L); if(e <= 1) w1++; mae += e; items += c.n; }
check(`simulation: within ±1 level ≥ 70% (${N} children per level)`, w1 / (20 * N) >= .7, `${(w1 / (20 * N) * 100).toFixed(1)}%, mean abs error ${(mae / (20 * N)).toFixed(2)}, ${(items / (20 * N)).toFixed(1)} items`);
let low = 0; for(let i = 0; i < N * 5; i++) if(child(1, {tapper:true}).level <= 2) low++;
check('simulation: random tapper → level 1-2 in ≥ 90%', low / (N * 5) >= .9, `${(low / (N * 5) * 100).toFixed(1)}%`);
let pw = 0, pp = 0; for(const L of [1, 2, 3]) for(let i = 0; i < N; i++){ const c = child(L, {nonReader:true, pre:true}); if(Math.abs(c.level - L) <= 1) pw++; if(c.pic) pp++; }
check('simulation: pre-readers (age ≤ 7) finish on picture items and land within ±1', pp / (3 * N) >= .85 && pw / (3 * N) >= .8, `pictures ${(pp / (3 * N) * 100).toFixed(0)}%, ±1 ${(pw / (3 * N) * 100).toFixed(0)}%`);
check('combination rule: speaking lowers by up to 3, raises by up to 1, no speech = objective level',
  R.placeCombine(10, R.placeSpeakLevel({range:1, accuracy:1, fluency:1, interaction:1, pronunciation:1}), 3) === 7 && R.placeCombine(10, 17, 3) === 11 && R.placeCombine(10, 2, 0) === 10 && R.placeCombine(10, 2, 1) === 9);

// 3) browser: two voices, labels never spoken, probation up/down/stay/unit-test wait
(async () => {
  let chromium; try{ ({chromium} = require('playwright')); }catch(e){ console.log('SKIP browser part: playwright missing'); process.exit(failed ? 1 : 0); }
  const b = await chromium.launch(); const p = await (await b.newContext({viewport:{width:820, height:1180}})).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { sessionStorage.setItem('hh:splash', '1'); window.__utt = []; try{ speechSynthesis.speak = u => { window.__utt.push({text:u.text, pitch:u.pitch}); setTimeout(() => u.onend && u.onend(), 10); }; }catch(e){} });
  await p.goto(`http://localhost:${PORT}/index.html#demo-kid`); await p.waitForTimeout(1500);
  const out = await p.evaluate(async () => { const r = {};
    await speakDialog('Teacher: How many pencils, Omar? Omar: Six pencils! Teacher: Good.', .9); r.dev = window.__utt.slice();
    DB.azure = {key:'x', region:'y'}; const calls = []; window.azFetch = async (t, v) => { calls.push([v, t]); return 'blob:x'; }; window.azPlay = async () => true;
    await speakDialog('Girl: Shall we take the metro? Boy: Metro it is, then.', .9); r.az = calls.slice();
    const k = WHO; window.toast = () => {}; const rep = (score, exit) => ({score, v2:{exit, review:false}, talkPct:40, levelFit:'right'});
    const run = (lv, reps, ut) => { DB.kids[k].level = lv; DB.progress[k].unitTest = ut || null; probationStart(k, lv); return reps.map(x => probationCheck(k, x)).map(x => x && x.stage).concat(DB.kids[k].level); };
    r.up = run(5, [rep(90, 'yes'), rep(88, 'yes'), rep(95, 'yes')]); r.down = run(8, [rep(40, 'partly'), rep(70, 'no'), rep(80, 'yes')]); r.stay = run(6, [rep(90, 'yes'), rep(60, 'partly'), rep(88, 'yes')]);
    r.wait = run(9, [rep(30, 'no'), rep(40, 'no'), rep(90, 'yes')], {level:9, ui:0, passed:false});
    r.hist = (DB.placements[k] || []).filter(x => x.probation).length; return r; });
  check('listening: two speakers get two pitches on the device voice, labels never spoken', new Set(out.dev.map(u => u.pitch)).size === 2 && out.dev.every(u => !/^(Teacher|Omar):/.test(u.text)));
  check('listening: two different Azure voices for two speakers', new Set(out.az.map(c => c[0])).size === 2 && out.az.every(c => !/^(Girl|Boy):/.test(c[1])));
  check('probation: 3 strong lessons → one level up', out.up.join() === 'collect,collect,done,6');
  check('probation: 2 weak lessons → one level down', out.down.join() === 'collect,collect,done,7');
  check('probation: mixed lessons → level confirmed', out.stay.join() === 'collect,collect,done,6');
  check('probation: never moves while a unit test is open', out.wait.join() === 'collect,collect,pending,9');
  check('probation: every outcome noted in the placement history', out.hist === 3);
  check('no page errors', !errs.length, errs.slice(0, 2).join(' | '));
  await b.close(); process.exit(failed ? 1 : 0);
})();
