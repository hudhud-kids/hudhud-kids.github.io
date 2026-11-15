const {chromium} = require('/tmp/claude-0/-home-claude/d0ca3ca7-3301-587b-8d1a-16088114cd22/scratchpad/t/node_modules/playwright');
const seed = require('./seed.js');
const PORT = Number(process.env.PORT) || 8784, URL = `http://localhost:${PORT}/index.html`;
const SIGNUPS = [{id:'s1', status:'pending', at:'2026-11-14T09:20:00+03:00', kid:null, data:{g_name:'عبدالله الحربي', rel:'الأب', city:'بريدة', phone:'0561112233', days:[0,2,4], time:'17:30', device:'iPad', notes:'يفضّل معلمة للبنت.', kids:[{ar:'جود', en:'Jood', boy:false, birth:'2017-04-10', grade:'ثالث ابتدائي', eng:'مبتدئ'},{ar:'تركي', en:'Turki', boy:true, birth:'2014-09-01', grade:'سادس ابتدائي', eng:'متوسط'}]}},
  {id:'s2', status:'pending', at:'2026-11-13T21:05:00+03:00', kid:null, data:{g_name:'أم ريان', rel:'الأم', city:'الرياض', phone:'0544455667', days:[1,3], time:'16:00', kids:[{ar:'ريان', en:'Rayan', boy:true, birth:'2015-01-20', grade:'خامس', eng:'مبتدئ'}]}}];
// open a page with fixed clock (Sat 14 Nov 2026 17:10 Riyadh), demo mode, seeded data. opts.cloud => pretend cloud+signups are on
async function open(browser, w, h, hash, opts = {}){
  const ctx = await browser.newContext({viewport:{width:w, height:h}, deviceScaleFactor:opts.dsf || 1, timezoneId:'Asia/Riyadh', locale:'ar-SA', hasTouch:w < 900, isMobile:false});
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if(m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) p.errs.push('console: ' + m.text()); });
  await p.clock.install({time:new Date('2026-11-14T17:10:00+03:00')});
  if(opts.cloud) await p.route('**/index.html*', async r => { const res = await r.fetch(); let t = await res.text();
    t = t.replace('const suOn = () =>', 'const suOn = () => true ||').replace('async function rpc(', 'async function rpc(fn, a){ if(/signups_list/.test(fn)) return JSON.parse(JSON.stringify(window.__SU)); if(/signup_set/.test(fn)) return true; return rpc0.apply(null, arguments); }\nasync function rpc0(');
    await r.fulfill({response:res, body:t}); });
  await p.addInitScript(su => { sessionStorage.setItem('hh:splash', '1'); window.__SU = su; }, SIGNUPS);
  await p.goto(URL + (hash || '#demo')); await p.clock.runFor(1500);
  await p.evaluate(`(${seed.toString()})()`);
  return p;
}
const tick = (p, ms = 400) => p.clock.runFor(ms);
// anything wider than the viewport or scrolled-out horizontally?
const overflow = p => p.evaluate(() => { const vw = innerWidth, bad = [];
  if(document.documentElement.scrollWidth > vw + 1) bad.push('DOC ' + document.documentElement.scrollWidth);
  document.querySelectorAll('#app *, .ov *').forEach(el => { const r = el.getBoundingClientRect(); if(!r.width || !r.height) return;
    let a = el.parentElement, clipped = false; while(a){ const s = getComputedStyle(a); if(/auto|scroll|hidden/.test(s.overflowX)){ clipped = true; break; } a = a.parentElement; }
    if(!clipped && (r.right > vw + 1 || r.left < -1)) bad.push((el.className || el.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); });
  return bad.slice(0, 8); });
// tap targets under 44px (visible buttons/links/inputs)
const smallTaps = p => p.evaluate(() => [...document.querySelectorAll('#app button, #app a.btn, #app select, #app input:not([type=checkbox]):not([type=hidden]), .ov button, .ov a.btn')].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.height < 43.5 || r.width < 43.5); }).map(el => (el.id || el.className || el.tagName) + ':' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height) + ' ' + el.textContent.trim().slice(0, 14)).slice(0, 12));
module.exports = {chromium, open, tick, overflow, smallTaps, PORT, URL, SIGNUPS};
