// screenshots of the screens added from preview/ui-notes.md (items 1-3, 6-12) at 390x844 and 1180x820 (x2) + overflow / tap audit
// usage: PORT=8795 node preview/tests/shots2.js [phone,desktop]
const {chromium, open, tick, overflow, smallTaps} = require('./lib.js');
const fs = require('fs');
const OUT = '/tmp/claude-0/-home-claude/d0ca3ca7-3301-587b-8d1a-16088114cd22/scratchpad/ui2';
fs.mkdirSync(OUT, {recursive:true});
const SIZES = [[390, 844, 'phone'], [1180, 820, 'desktop']];
const only = process.argv[2] ? process.argv[2].split(',') : null;
const clean = `document.querySelectorAll('.ov,.cheerpop,.hsay,.toast,#hhPdf').forEach(o => o.remove()); document.body.className = ''`;
const stub = `window.print = () => {}; window.streamClaude = async function*(){ yield '[MOOD:happy] Hello Layan! What did you do this weekend?'; }; window.speakOne = (t, s, d) => setTimeout(d, 5);`;
const SCREENS = [
  ['1-sheet-schedule', '#demo', `${clean}; WHO = 'parent'; P_TAB = 'students'; renderParent(); pOpenSheet('noura'); setTimeout(() => document.querySelector('#pSheet .pslots').scrollIntoView({block:'center'}), 50)`],
  ['1-book-extra', '#demo', `${clean}; pOpenSheet('noura'); pSlotPicker('noura', null)`],
  ['1-move-lesson', '#demo', `${clean}; pOpenSheet('noura'); pSlotPicker('noura', ledger('noura').next.key)`],
  ['1-all-lessons', '#demo', `${clean}; pOpenSheet('noura'); pAllSlots('noura')`],
  ['1-cancel', '#demo', `${clean}; pOpenSheet('noura'); pAllSlots('noura'); pCancelSlot('noura', ledger('noura').rows.filter(r => r.st === 'miss').pop().key)`],
  ['2-guardians-tab', '#demo', `${clean}; P_SHEET = null; P_TAB = 'guardians'; renderParent()`],
  ['2-guardian-page', '#demo', `${clean}; pOpenGuardian('g1')`],
  ['3-money', '#demo', `${clean}; P_GSHEET = null; P_TAB = 'plans'; renderParent(); pOpenMoney(null)`],
  ['3-money-month', '#demo', `${clean}; pOpenMoney('layan'); P_MM = monthKey(new Date()); pOpenMoney()`],
  ['12-signup-toast', '#demo', `${clean}; P_TAB = 'overview'; renderParent(); setTimeout(() => { __SU.push({id:'s9', status:'pending', at:new Date().toISOString(), data:{g_name:'سارة العنزي', phone:'0550001112', kids:[{ar:'ريم', boy:false, birth:'2016-02-02'}]}}); }, 10)`, 61500],
  ['6-7-guardian-report', '#demo', `${clean}; WHO = 'g:g1'; G_TAB = 'reports'; G_KID = 'sami'; renderGuardian('g1'); document.querySelector('.grow.t-lesson').click()`],
  ['6-past-month', '#demo', `${clean}; G_TAB = 'reports'; renderGuardian('g1'); const r = gRows('sami'), i = r.findIndex(x => x.type === 'month' && !x.m.cur); gOpenReport('sami', r, i)`],
  ['6-past-month-print', '#demo', `${clean}; const r = gRows('sami'), x = r.find(x => x.type === 'month' && !x.m.cur); monthlyReport('sami', x.m.mk)`],
  ['8-kid-home', '#demo-kid', `${stub} ${clean}; WHO = 'noura'; TAB = 'home'; HOME_SEG = 'missions'; DB.progress.noura.sibSeen = 1; go('noura')`],
  ['8-11-kid-profile', '#demo-kid', `${clean}; renderProfile('noura', false)`],
  ['9-missions-search', '#demo-kid', `${clean}; MQ = 'مطار'; go('noura'); setTimeout(() => document.getElementById('mcard').scrollIntoView(), 50)`],
  ['10-teen-home', '#demo-kid', `${clean}; MQ = ''; WHO = 'layan'; go('layan')`],
  ['10-teen-dialog', '#demo-kid', `${clean}; go('layan'); slotPicker('layan', null)`],
  ['10-teen-room', '#demo-kid', `${stub} ${clean}; go('layan'); enterLesson('layan', true)`, 3000],
  ['11-calm-by-choice-age10', '#demo-kid', `${clean}; L = null; DB.profiles.noura.look = 'calm'; WHO = 'noura'; go('noura')`],
];
(async () => { const b = await chromium.launch(); const report = [];
  for(const [w, h, tag] of SIZES){
    if(only && !only.includes(tag)) continue;
    let p = null, curHash = null;
    for(const [name, hash, js, wait] of SCREENS){
      if(hash !== curHash){ if(p) await p.close(); p = await open(b, w, h, hash, {cloud:true, dsf:2}); curHash = hash; await p.evaluate(stub); }
      try{ await p.evaluate(js); }catch(e){ report.push({tag, name, err:e.message.slice(0, 300)}); continue; }
      await tick(p, wait || 900); await p.evaluate(`document.querySelectorAll('.cheerpop,.hsay').forEach(o => o.remove())`);
      if(!/toast/.test(name)) await p.evaluate(`document.querySelectorAll('.toast').forEach(o => o.remove())`);
      await tick(p, 200);
      const of = await overflow(p), taps = await smallTaps(p);
      if(of.length || taps.length || p.errs.length) report.push({tag, name, of, taps, errs:p.errs.splice(0)});
      await p.screenshot({path:`${OUT}/${name}-${tag}.png`});
    }
    // the PDF page itself, as the browser prints it
    if(p) await p.close();
    p = await open(b, w, h, '#demo', {cloud:true, dsf:2}); await p.evaluate(stub);
    await p.evaluate(`WHO = 'g:g1'; G_TAB = 'reports'; renderGuardian('g1'); document.querySelector('.grow.t-lesson').click(); document.querySelector('#gRep [data-rpdf]').click()`); await tick(p, 300);
    await p.emulateMedia({media:'print'}); await p.screenshot({path:`${OUT}/7-pdf-print-${tag}.png`, fullPage:true});
    if(tag === 'desktop'){ await p.pdf({path:`${OUT}/7-report.pdf`, format:'A4', printBackground:true});
      await p.emulateMedia({media:'screen'}); await p.evaluate(`document.querySelectorAll('.ov,#hhPdf').forEach(o => o.remove()); monthlyReport('sami'); document.querySelector('#mpdf').click()`); await tick(p, 300);
      await p.emulateMedia({media:'print'}); await p.pdf({path:`${OUT}/7-month.pdf`, format:'A4', printBackground:true}); }
    await p.close();
  }
  console.log(JSON.stringify(report, null, 1)); await b.close(); })();
