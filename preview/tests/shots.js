// screenshots of every preview screen at all sizes + overflow / tap-target audit
const {chromium, open, tick, overflow, smallTaps} = require('./lib.js');
const fs = require('fs');
const OUT = '/tmp/claude-0/-home-claude/d0ca3ca7-3301-587b-8d1a-16088114cd22/scratchpad/ui-preview', ALL = '/tmp/claude-0/-home-claude/d0ca3ca7-3301-587b-8d1a-16088114cd22/scratchpad/d/all';
fs.mkdirSync(OUT, {recursive:true}); fs.mkdirSync(ALL, {recursive:true});
const SIZES = [[390, 844, 'phone', true], [1180, 820, 'desktop', true], [844, 390, 'l844'], [820, 1180, 'p820'], [1440, 900, 'd1440']];
const only = process.argv[2] ? process.argv[2].split(',') : null;
const quiet = `(() => { document.querySelectorAll('.ov:not(.sheet),.cheerpop,.hsay,.toast').forEach(o => o.remove()); })()`;
const SCREENS = [
  ['owner-overview', '#demo', `P_SHEET = null; P_TAB = 'overview'; WHO = 'parent'; renderParent()`],
  ['owner-students', '#demo', `P_SHEET = null; P_TAB = 'students'; renderParent()`],
  ['owner-student-sheet', '#demo', `P_TAB = 'students'; renderParent(); pOpenSheet('sami')`],
  ['owner-guardians', '#demo', `P_SHEET = null; pOpenSheet(null); P_TAB = 'guardians'; renderParent()`],
  ['owner-signups', '#demo', `P_TAB = 'signups'; renderParent()`],
  ['owner-plans', '#demo', `P_TAB = 'plans'; renderParent()`],
  ['owner-settings', '#demo', `P_TAB = 'settings'; renderParent()`],
  ['guardian-home', '#demo', `WHO = 'g:g1'; G_TAB = 'home'; G_KID = 'sami'; renderGuardian('g1')`],
  ['guardian-reports-list', '#demo', `G_TAB = 'reports'; G_FILTER = 'all'; renderGuardian('g1')`],
  ['guardian-report-open', '#demo', `G_TAB = 'reports'; renderGuardian('g1'); document.querySelectorAll('.grow.t-lesson')[0].click()`],
  ['guardian-follow', '#demo', `document.querySelectorAll('.ov').forEach(o => o.remove()); G_TAB = 'follow'; renderGuardian('g1')`],
  ['kid-home', '#demo-kid', `WHO = 'noura'; TAB = 'home'; HOME_SEG = 'missions'; DB.progress.noura.sibSeen = 1; go('noura')`],
  ['kid-home-teen', '#demo-kid', `WHO = 'layan'; TAB = 'home'; HOME_SEG = 'missions'; go('layan')`],
];
(async () => { const b = await chromium.launch(); const report = [];
  for(const [w, h, tag, deliver] of SIZES){
    if(only && !only.includes(tag)) continue;
    let p = null, curHash = null;
    for(const [name, hash, js] of SCREENS){
      if(hash !== curHash){ if(p) await p.close(); p = await open(b, w, h, hash, {cloud:true, dsf:deliver ? 2 : 1}); curHash = hash; }
      await p.evaluate(js); await tick(p, 1600); if(!/sheet|open/.test(name)) await p.evaluate(quiet); else await p.evaluate(`document.querySelectorAll('.cheerpop,.hsay,.toast').forEach(o => o.remove())`);
      await tick(p, 200);
      const of = await overflow(p), taps = await smallTaps(p);
      if(of.length || taps.length || p.errs.length) report.push({tag, name, of, taps, errs:p.errs.splice(0)});
      const full = !/sheet|open/.test(name), dir = deliver ? OUT : ALL;
      await p.screenshot({path:`${dir}/${name}-${tag}.png`});
      if(full){ await p.evaluate(`document.querySelectorAll('.adm-nav,.kidw>.tabs').forEach(n => { if(getComputedStyle(n).position === 'fixed') n.style.position = 'static'; })`); await p.screenshot({path:`${dir}/${name}-${tag}-full.png`, fullPage:true}); await p.evaluate(`document.querySelectorAll('.adm-nav,.kidw>.tabs').forEach(n => n.style.position = '')`); }
    }
    if(p) await p.close();
  }
  console.log(JSON.stringify(report, null, 1)); await b.close(); })();
