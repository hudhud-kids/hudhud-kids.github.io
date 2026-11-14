// Shared harness for the pipeline tests. The static server is started by run.sh (PORT env, default 8781).
const {chromium} = require('playwright');
const PORT = process.env.PORT || 8781;
const BASE = `http://localhost:${PORT}/`;
const BLOCK = /cdn\.jsdelivr\.net|unpkg\.com|stt\.speech|tts\.speech|supabase|anthropic/;
exports.PORT = PORT; exports.BASE = BASE;
exports.sleep = ms => new Promise(r => setTimeout(r, ms));
// every test reports through check(): a failed check makes the process exit non-zero
exports.check = (name, ok, extra) => { console.log(ok ? 'PASS' : 'FAIL', name, ok || extra === undefined ? '' : JSON.stringify(extra)); if(!ok) process.exitCode = 1; };

async function launch(opts = {}){
  const b = await chromium.launch({args:['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', ...(opts.wav ? ['--use-file-for-fake-audio-capture=' + opts.wav] : []), '--autoplay-policy=no-user-gesture-required']});
  const ctx = await b.newContext({viewport:{width:opts.w || 1180, height:opts.h || 820}, permissions:['microphone']});
  return {b, ctx};
}
async function page(ctx, opts = {}){
  const p = await ctx.newPage(); const errs = [], logs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => logs.push(m.type() + ': ' + m.text()));
  await p.route(BLOCK, r => opts.route ? opts.route(r) : r.abort());
  await p.addInitScript(() => sessionStorage.setItem('hh:splash', '1'));
  if(opts.init) await p.addInitScript(opts.init);
  return {p, errs, logs};
}
// demo child (nothing is saved; DEMO = true)
exports.open = async (opts = {}) => {
  const {b, ctx} = await launch(opts); const {p, errs, logs} = await page(ctx, opts);
  await p.goto(BASE + 'index.html#demo-kid'); await p.waitForTimeout(1200);
  await p.evaluate(async () => { DB.progress[WHO].onboarded = true; document.querySelectorAll('.ov').forEach(o => o.remove()); await loadContent(DB.kids[WHO].level); });
  return {b, ctx, p, errs, logs};
};
// a real (non-demo) child session: the demo data is written to localStorage, so saving, snapshots and reloads behave as in
// production. `prep(db, kid)` runs in the page on the demo data before it is stored (must be self-contained).
exports.openReal = async (opts = {}) => {
  const {b, ctx} = await launch(opts);
  const d = await page(ctx, {});
  await d.p.goto(BASE + 'index.html#demo-kid'); await d.p.waitForTimeout(900);
  const seed = await d.p.evaluate(prep => { DB.progress[WHO].onboarded = true; if(prep) (new Function('db', 'kid', prep))(DB, WHO); return {db:JSON.stringify(DB), who:WHO, key:STORE_KEY}; }, opts.prep ? `(${opts.prep.toString()})(db, kid)` : null);
  await d.p.evaluate(s => { localStorage.setItem(s.key, s.db); localStorage.setItem('51telk:who', s.who); }, seed);
  await d.p.close();
  const {p, errs, logs} = await page(ctx, opts);
  const load = async () => { await p.goto(BASE + 'index.html'); await p.waitForTimeout(opts.wait || 700); };
  await load();
  return {b, ctx, p, errs, logs, reload:load, kid:seed.who};
};
