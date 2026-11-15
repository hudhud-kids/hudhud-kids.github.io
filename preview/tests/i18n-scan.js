// lists Arabic text still showing in English mode on the owner dashboard, the guardian report list and the new screens
// usage: PORT=8795 node preview/tests/i18n-scan.js   (prints one untranslated fragment per line; empty output = all translated)
const {chromium, open, tick} = require('./lib.js');
const NAMES = /سامي|ليان|فهد|نورة|يوسف|محمد|العتيبي|هيفاء|القحطاني|خالد|الدوسري|ريان|عبدالله|الحربي|أم ريان|جود|تركي|بريدة|الرياض|آيس كريم|بابا|ماما/g;
const SCREENS = [
  ['#demo', `WHO = 'parent'; P_TAB = 'overview'; renderParent()`],
  ['#demo', `P_TAB = 'students'; renderParent()`],
  ['#demo', `pOpenSheet('noura')`],
  ['#demo', `pAllSlots('noura')`],
  ['#demo', `document.querySelectorAll('.ov').forEach(o => o.remove()); pSlotPicker('noura', null)`],
  ['#demo', `document.querySelectorAll('.ov').forEach(o => o.remove()); pSlotPicker('noura', ledger('noura').next.key)`],
  ['#demo', `document.querySelectorAll('.ov').forEach(o => o.remove()); pCancelSlot('noura', ledger('noura').next.key)`],
  ['#demo', `document.querySelectorAll('.ov').forEach(o => o.remove()); P_SHEET = null; P_TAB = 'guardians'; renderParent()`],
  ['#demo', `pOpenGuardian('g1')`],
  ['#demo', `pOpenGuardian(null); P_TAB = 'signups'; renderParent()`],
  ['#demo', `P_TAB = 'plans'; renderParent()`],
  ['#demo', `pOpenMoney(null)`],
  ['#demo', `document.querySelectorAll('.ov').forEach(o => o.remove()); P_TAB = 'settings'; renderParent()`],
  ['#demo', `WHO = 'g:g1'; G_TAB = 'reports'; G_FILTER = 'all'; G_KID = 'sami'; renderGuardian('g1')`],
  ['#demo', `document.querySelector('.grow.t-month').click()`],
  ['#demo', `document.querySelectorAll('.ov').forEach(o => o.remove()); document.querySelector('.grow.t-week').click()`],
  ['#demo', `document.querySelectorAll('.ov').forEach(o => o.remove()); document.querySelector('.grow.t-lesson').click()`],
  ['#demo', `document.querySelectorAll('.ov').forEach(o => o.remove()); const r = gRows('sami').find(x => x.type === 'month' && !x.m.cur); monthlyReport('sami', r.m.mk)`],
  ['#demo-kid', `WHO = 'noura'; TAB = 'home'; go('noura')`],
  ['#demo-kid', `document.querySelectorAll('.ov,.cheerpop,.hsay').forEach(o => o.remove()); MQ = 'zzz'; renderKid('noura')`],
  ['#demo-kid', `renderProfile('noura', false)`],
];
(async () => { const b = await chromium.launch(); const found = new Map(); let p = null, cur = null;
  for(const [hash, js] of SCREENS){
    if(hash !== cur){ if(p) await p.close(); p = await open(b, 1180, 820, hash, {cloud:true}); cur = hash;
      await p.evaluate(async () => { const r = await fetch('content/i18n-en.json', {cache:'no-cache'}); I18N = await r.json(); I18N_KEYS = Object.keys(I18N).sort((a, b) => b.length - a.length); LOC = 'en-GB'; window.print = () => {}; }); }
    await p.evaluate(js); await tick(p, 500);
    const list = await p.evaluate(() => { trNode(document.body); const out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while((n = w.nextNode())){ if(/[؀-ۿ]/.test(n.nodeValue) && !(n.parentElement && (SKIP_TR(n.parentElement) || n.parentElement.closest('script,style,#hhPdf')))) out.push(n.nodeValue.trim()); }
      document.querySelectorAll('[placeholder],[aria-label],[title]').forEach(el => ['placeholder','aria-label','title'].forEach(a => { const v = el.getAttribute(a); if(v && /[؀-ۿ]/.test(v)) out.push(v); }));
      return out; });
    list.forEach(t => { const c = t.replace(NAMES, '').trim(); if(/[؀-ۿ]/.test(c)) found.set(t, js.slice(0, 40)); });
  }
  for(const [t, w] of found) console.log(JSON.stringify(t));
  await b.close(); })();
