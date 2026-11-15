// functional test: every owner action, guardian reports, kid home
const {chromium, open, tick, smallTaps} = require('./lib.js');
const res = []; const ok = (name, cond, extra) => { res.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : JSON.stringify(extra)]); };
(async () => { const b = await chromium.launch();
 for(const [w, h] of [[1180, 820], [390, 844]]){ const T = w + ': ';
  let p = await open(b, w, h, '#demo', {cloud:true});
  const ev = (js) => p.evaluate(js), cnt = sel => p.locator(sel).count(), vis = sel => p.locator(sel).first().isVisible().catch(() => false);
  const closeOv = () => ev(`document.querySelectorAll('.ov:not(#pSheet)').forEach(o => o.remove())`);
  await ev(`window.__calls = []; window.speakOne = (t, s, d) => setTimeout(d, 5); DB.azure = {key:'x', region:'eastus'}; window.narrateAZ = (t, o) => { __calls.push('narrateAZ'); return {stop(){ __calls.push('stop'); }}; };
    window.downloadICS = k => __calls.push('ics:' + k); window.micCheck = () => __calls.push('mic'); window.print = () => __calls.push('print'); window.resetPass = (kind, id) => __calls.push('reset:' + kind + ':' + id);
    WHO = 'parent'; P_TAB = 'overview'; renderParent()`); await tick(p, 800);
  // --- overview
  ok(T + 'no report cards in owner overview', await cnt('.rcard') === 0);
  ok(T + 'health card shown', await cnt('#healthCard') === 1);
  ok(T + 'today list has 3 lessons', await cnt('.pday li') === 3, await cnt('.pday li'));
  ok(T + 'sign-up count filled', (await p.locator('[data-sun]').first().textContent()) === '2');
  ok(T + 'sign-up badge on nav', await vis('[data-sunb]'));
  ok(T + 'six sections', await cnt('.adm-t') === 6);
  // top-up from the decision list
  const before = await ev(`DB.balance.yousef`);
  await p.locator('.todo [data-topup="yousef"]').click(); await p.locator('.ov [data-amt="1000"]').click(); await p.locator('#tok').click(); await tick(p);
  ok(T + 'top-up adds balance + log + clears renew request', await ev(`DB.balance.yousef === ${before} + 1000 && DB.topups.some(t => t.kid === 'yousef' && t.amount === 1000) && !DB.renewReq.yousef && !ledger('yousef').ended`));
  await p.locator('.todo [data-done="r1"]').click(); await tick(p);
  ok(T + 'reward delivered', await ev(`DB.redeems[0].status === 'done'`));
  await p.locator('.todo [data-up="sami"]').click(); await p.locator('.ov #yes').click(); await tick(p);
  ok(T + 'raise level', await ev(`DB.kids.sami.level === 6`));
  await p.locator('.todo [data-ptab="signups"]').click(); await tick(p, 800);
  // --- sign-ups
  ok(T + 'sign-ups tab lists 2 requests', await cnt('.suitem') === 2, await cnt('.suitem'));
  await p.locator('[data-suacc="s2"]').click(); await tick(p);
  ok(T + 'accept opens the student form prefilled', (await p.locator('.ov #f_ar').inputValue()) === 'ريان');
  await p.locator('.ov #f_bal').fill('800'); await p.locator('.ov #f_save').click(); await tick(p, 600);
  ok(T + 'accept creates the account and shows credentials', await ev(`!!DB.kids.rayan`) && await cnt('.credc') >= 1, await ev(`Object.keys(DB.kids)`));
  await p.locator('.ov #cx').click(); await tick(p);
  await p.locator('[data-surej="s1"]').click(); await p.locator('.ov #y').click(); await tick(p, 600);
  ok(T + 'reject request', await ev(`SIGNUPS.find(s => s.id === 's1').status === 'rejected'`));
  await p.locator('#suCopy').click(); await p.locator('#suRe').click(); await tick(p, 600); ok(T + 'copy link + refresh do not throw', p.errs.length === 0, p.errs);
  // --- students
  await p.locator('[data-ptab="students"]').first().click(); await tick(p);
  ok(T + 'students list rows', await cnt('.ptr') === 6, await cnt('.ptr'));
  await p.locator('#pq').fill('فهد'); await tick(p, 100);
  ok(T + 'search filters and keeps focus', await cnt('.ptr') === 1 && await ev(`document.activeElement.id === 'pq'`));
  await p.locator('#pq').fill('0551234567'); await tick(p, 100); ok(T + 'search by guardian phone', await cnt('.ptr') === 2, await cnt('.ptr'));
  await p.locator('#pq').fill('zzz'); await tick(p, 100); ok(T + 'empty state', await cnt('#pList .empty') === 1);
  await p.locator('#pq').fill(''); await p.locator('[data-pf="low"]').click(); await tick(p, 100); ok(T + 'low-balance filter', await cnt('.ptr') === 1, await cnt('.ptr'));
  await p.locator('[data-pf="noguard"]').click(); await tick(p, 100); ok(T + 'no-guardian filter', await cnt('.ptr') === 1, await cnt('.ptr'));
  await p.locator('[data-pf="all"]').click(); await tick(p, 100);
  await p.locator('#addKid').click(); await tick(p); ok(T + 'add student opens form', await vis('.ov #f_ar')); await closeOv();
  // --- student sheet
  await p.locator('.ptr[data-sheet="noura"]').click(); await tick(p);
  ok(T + 'sheet opens with 5 sections and no report', await cnt('#pSheet .shs') === 5 && await cnt('#pSheet .rcard') === 0 && await cnt('#pSheet .radar') === 0);
  ok(T + 'sheet shows password', (await p.locator('#pSheet .kv code').nth(1).textContent()).length >= 4);
  await p.locator('#pSheet [data-edit="noura"]').first().click(); await tick(p);
  await p.locator('.ov #f_ar').fill('نورة خالد'); await p.locator('.ov #f_save').click(); await tick(p);
  ok(T + 'edit saves and sheet refreshes in place', await ev(`DB.kids.noura.ar === 'نورة خالد'`) && (await p.locator('#pSheet h2').textContent()).includes('نورة خالد') && await cnt('.ov') === 1);
  await p.locator('#pSheet [data-creds="noura"]').click(); await tick(p); ok(T + 'credentials dialog', await cnt('.credc') === 2); await p.locator('.ov #cx').click(); await tick(p);
  ok(T + 'sheet still open after credentials', await cnt('#pSheet') === 1);
  await p.locator('#pSheet [data-up="noura"]').click(); await p.locator('.ov #yes').click(); await tick(p); ok(T + 'sheet: raise', await ev(`DB.kids.noura.level === 8`));
  await p.locator('#pSheet [data-down="noura"]').click(); await p.locator('.ov #yes').click(); await tick(p); ok(T + 'sheet: lower', await ev(`DB.kids.noura.level === 7`));
  await ev(`DB.progress.noura.unitTest = {level:7, ui:0, passed:false}; renderParent()`); await tick(p);
  await p.locator('#pSheet [data-uskip="noura"]').click(); await tick(p); ok(T + 'sheet: skip unit test', await ev(`DB.progress.noura.unitTest.passed === true`));
  await p.locator('#pSheet [data-replace="noura"]').click(); await tick(p); ok(T + 'sheet: re-placement on next login', await ev(`DB.kids.noura.needPlace === true`));
  await p.locator('#pSheet [data-replace="noura"]').click(); await tick(p); ok(T + 'sheet: cancel re-placement', await ev(`!DB.kids.noura.needPlace`));
  await p.locator('#pSheet [data-ics="noura"]').click(); ok(T + 'sheet: calendar file', await ev(`__calls.includes('ics:noura')`));
  await p.locator('#pSheet [data-topup="noura"]').click(); await p.locator('.ov #tamt').fill('400'); await p.locator('#tok').click(); await tick(p);
  ok(T + 'sheet: top-up', await ev(`DB.topups.some(t => t.kid === 'noura' && t.amount === 400)`) && (await p.locator('#pSheet .pup').last().textContent()).includes('400'));
  await p.locator('#pSheet [data-voice="teacher"]').selectOption({index:2}); await tick(p, 100); ok(T + 'sheet: voice saved', await ev(`!!(DB.voices.noura && DB.voices.noura.teacher)`));
  await p.locator('#pSheet [data-vprev="teacher"]').click(); await p.locator('#pSheet [data-vprev="teacher"]').click(); ok(T + 'sheet: voice preview start/stop', await ev(`__calls.includes('narrateAZ') && __calls.includes('stop')`));
  await ev(`window.placementTest = k => __calls.push('place:' + k); window.enterLesson = (k, t) => __calls.push('trial:' + k + ':' + t)`);
  await p.locator('#pSheet [data-place="noura"]').click(); await tick(p, 100); ok(T + 'sheet: placement now (sheet closes)', await ev(`__calls.includes('place:noura')`) && await cnt('#pSheet') === 0);
  await ev(`pOpenSheet('noura')`); await p.locator('#pSheet [data-trial="noura"]').click(); await tick(p, 100); ok(T + 'sheet: trial lesson (sheet closes)', await ev(`__calls.includes('trial:noura:true')`) && await cnt('#pSheet') === 0);
  await ev(`delete DB.kids.noura.pass; pOpenSheet('noura')`); await tick(p, 100);
  ok(T + 'hidden password shows dots + reset', (await p.locator('#pSheet .ppass0').textContent()).includes('••••'));
  await p.locator('#pSheet [data-rpass]').click(); ok(T + 'reset calls resetPass(kind,id)', await ev(`__calls.includes('reset:kid:noura')`));
  await ev(`DB.kids.noura.pass = '1234'`);
  await p.locator('#pSheet [data-edit="noura"]').first().click(); await tick(p); await p.locator('.ov #f_del').click(); await p.locator('.ov #yes').last().click(); await tick(p);
  ok(T + 'delete student closes the sheet', await ev(`!DB.kids.noura`) && await cnt('#pSheet') === 0 && await cnt('.ov') === 0);
  // --- guardians
  await p.locator('[data-ptab="guardians"]').first().click(); await tick(p);
  ok(T + 'guardians listed with children', await cnt('.pg') >= 2 && await cnt('.pg .pkid') >= 3, [await cnt('.pg'), await cnt('.pg .pkid')]);
  await p.locator('.pg [data-gcopy]').first().click(); await p.locator('.pg .pkid').first().click(); await tick(p); ok(T + 'guardian child chip opens sheet', await cnt('#pSheet') === 1); await ev(`pOpenSheet(null)`);
  await p.locator('.pg [data-edit]').first().click(); await tick(p); ok(T + 'guardian edit opens form', await vis('.ov #g_name')); await closeOv();
  // --- plans & rewards
  await p.locator('[data-ptab="plans"]').first().click(); await tick(p);
  await p.locator('#pl').fill('55'); await p.locator('#savePl').click(); await tick(p); ok(T + 'price for all', await ev(`DB.perLesson === 55 && priceNow('sami') === 55`));
  await p.locator('#addRw').click(); await p.locator('.ov #rn').fill('رحلة'); await p.locator('.ov #rs').click(); await tick(p); ok(T + 'add reward', await ev(`DB.rewards.some(r => r.name === 'رحلة')`));
  await p.locator('[data-editrw]').first().click(); await tick(p); ok(T + 'edit reward form', await vis('.ov #rn')); await closeOv();
  const nr = await ev(`DB.rewards.length`); await p.locator('[data-delrw]').first().click(); await tick(p); ok(T + 'delete reward', await ev(`DB.rewards.length === ${nr} - 1`));
  await p.locator('.acc [data-topup]').first().click(); await tick(p); ok(T + 'plans: top-up dialog', await vis('.ov #tamt')); await closeOv();
  // --- settings
  await p.locator('[data-ptab="settings"]').first().click(); await tick(p);
  ok(T + 'no report cards in settings', await cnt('.rcard') === 0);
  await p.locator('#ak').fill('sk-ant-test'); await p.locator('#saveKey').click(); await tick(p); ok(T + 'save key', await ev(`DB.apiKey === 'sk-ant-test'`)); await ev(`DB.apiKey = 'demo'`);
  await p.locator('#testKey').click(); await tick(p, 800); ok(T + 'test connection', (await p.locator('#keyMsg').textContent()).includes('جاهزة'), await p.locator('#keyMsg').textContent());
  await p.locator('#testVoice').click(); await p.locator('#rvt').click(); await p.locator('#micCheck').click(); ok(T + 'voice tests + mic check', await ev(`__calls.includes('mic')`));
  await p.locator('#azk').fill('k2'); await p.locator('#azs').click(); await tick(p); ok(T + 'azure save', await ev(`DB.azure.key === 'k2'`));
  await ev(`window.azTest = async () => { __calls.push('azt'); }`); await p.locator('#azt').click(); await tick(p, 200); ok(T + 'azure test', (await p.locator('#azm').textContent()).includes('يعمل'));
  await p.locator('#azx').click(); await tick(p); ok(T + 'azure off', await ev(`DB.azure === null`));
  await p.locator('#xfer').click(); await tick(p, 800); await p.waitForSelector('.ov #xlink', {timeout:8000}).catch(() => {}); ok(T + 'device setup link dialog', await vis('.ov #xlink')); await closeOv();
  ok(T + 'accounts table inside scroll box', await cnt('.tscroll .acc') === 1);
  await ev(`delete DB.parent.pass; renderParent()`); await tick(p); await p.locator('.acc [data-rpass^="parent"]').click(); ok(T + 'owner password reset contract', await ev(`__calls.includes('reset:parent:parent')`));
  await p.locator('[data-out]').first().evaluate(e => e.click()); await tick(p); ok(T + 'logout', await ev(`WHO === null`) );
  ok(T + 'no page errors (owner)', p.errs.length === 0, p.errs); await p.close();

  // ===== guardian
  p = await open(b, w, h, '#demo', {cloud:true}); const P = p;
  const ev2 = js => P.evaluate(js), cnt2 = sel => P.locator(sel).count();
  await ev2(`window.__calls = []; window.print = () => __calls.push('print'); WHO = 'g:g1'; G_TAB = 'home'; renderGuardian('g1')`); await tick(P);
  ok(T + 'guardian home: live card, trends, 3 latest reports as rows', await cnt2('.livec') === 1 && await cnt2('.gtrend') === 3 && await cnt2('.grow') === 3 && await cnt2('.rcard') === 0);
  await P.locator('.grow').first().click(); await tick(P); ok(T + 'row on home opens the full report', await cnt2('#gRep .rcard') === 1); await P.locator('#gRep [data-shx]').click();
  await P.locator('[data-gtab="reports"]').first().click(); await tick(P);
  const total = await cnt2('.grow'); ok(T + 'reports list: rows grouped by month, no stacked cards', total > 20 && await cnt2('.gmonth') >= 2 && await cnt2('.rcard') === 0, total);
  ok(T + 'newest first', await ev2(`(() => { const r = gRows('sami'); return r.every((x, i) => !i || r[i - 1].at >= x.at); })()`));
  ok(T + 'weekly + monthly + placement + exam + review rows exist', await ev2(`['week','month','place','exam','review','quiz','lesson'].every(t => gRows('sami').some(x => x.type === t))`));
  for(const [f, test] of [['lessons', `[...document.querySelectorAll('.grow')].every(e => e.classList.contains('t-lesson'))`], ['tests', `[...document.querySelectorAll('.grow')].every(e => /t-(quiz|exam|place|review)/.test(e.className))`], ['month', `document.querySelectorAll('.gmonth').length === 1`]]){
    await P.locator(`[data-gf="${f}"]`).click(); await tick(P, 100); ok(T + 'filter ' + f, await ev2(test) && await cnt2('.grow') > 0, await cnt2('.grow')); }
  await P.locator('[data-gf="all"]').click(); await tick(P, 100);
  await P.locator('.grow.t-lesson').first().click(); await tick(P, 100);
  ok(T + 'report opens in a sheet with the full card', await cnt2('#gRep .rcard') === 1);
  const t1 = await P.locator('#gRep .rc-t').textContent(); await P.locator('#gRep [data-rn="1"]').click(); await tick(P, 100);
  const pos1 = await P.locator('#gRep .rnav-t .small').textContent(); await P.locator('#gRep [data-rn="-1"]').click(); await tick(P, 100);
  ok(T + 'next / previous walk the list', (await P.locator('#gRep .rc-t').textContent()) === t1 && /من/.test(pos1), pos1);
  ok(T + 'share link carries a summary', decodeURIComponent(await P.locator('#gRep .rfoot a').getAttribute('href')).includes('النتيجة'));
  await P.locator('#gRep [data-rprint]').click(); await P.locator('#gRep [data-rcopy]').click(); ok(T + 'print + copy', await ev2(`__calls.includes('print')`));
  await P.keyboard.press('Escape'); await tick(P, 100); ok(T + 'Escape closes', await cnt2('#gRep') === 0);
  for(const t of ['week', 'month', 'place', 'exam', 'review', 'quiz']){ await P.locator('.grow.t-' + t).first().click(); await tick(P, 100);
    ok(T + 'detail ' + t, await cnt2('#gRep .gsum') >= 1 && (await P.locator('#gRep .gsum').first().textContent()).length > 20);
    if(t === 'month'){ await P.locator('#gRep [data-gmonth]').click(); await tick(P, 300); ok(T + 'monthly printable version opens', await cnt2('#certBox') === 1); await ev2(`document.querySelectorAll('.ov:not(#gRep)').forEach(o => o.remove())`); }
    await P.locator('#gRep [data-shx]').click(); }
  await P.locator('[data-gk="layan"]').click(); await tick(P); ok(T + 'switch child', (await P.locator('.card h2').first().textContent()).includes('ليان'));
  await P.locator('[data-gk="sami"]').click(); await P.locator('#gb').click(); await tick(P);
  ok(T + 'bell opens follow tab with notifications + month grid', await cnt2('#gnotes .gn') > 5 && await cnt2('.mgrid') === 1);
  await P.locator('#gread').click(); await tick(P); ok(T + 'mark all read', await cnt2('.gn.new') === 0);
  await P.locator('[data-gtab="home"]').first().click(); await tick(P);
  await P.locator('[data-ch]').first().click(); await tick(P); ok(T + 'send cheer', await ev2(`DB.cheers.sami.length === 2`));
  await P.locator('#cht').fill('بالتوفيق'); await P.locator('#chs').click(); await tick(P); ok(T + 'send typed cheer', await ev2(`DB.cheers.sami.length === 3`));
  await P.locator('#sgAdd').click(); await P.locator('.ov #sn').fill('أمل'); await P.locator('.ov #sok').click(); await tick(P); ok(T + 'add signer', await cnt2('[data-sg]') === 2);
  ok(T + 'guardian tap targets', (await smallTaps(P)).length === 0, await smallTaps(P));
  ok(T + 'no page errors (guardian)', P.errs.length === 0, P.errs); await P.close();

  // ===== kid
  p = await open(b, w, h, '#demo-kid', {cloud:true}); const K = p; const ev3 = js => K.evaluate(js), cnt3 = sel => K.locator(sel).count();
  await ev3(`window.__calls = []; WHO = 'sami'; TAB = 'home'; HOME_SEG = 'missions'; DB.kids.sami.level = 5; go('sami')`); await tick(K, 1500); await ev3(`document.querySelectorAll('.ov,.cheerpop,.hsay').forEach(o => o.remove())`);
  ok(T + 'kid: one primary action "ابدأ/كمّل حصتك"', await cnt3('#enter') === 1 && /حصتك/.test(await K.locator('#enter').textContent()));
  ok(T + 'kid: tasks, path, 5 tiles', await cnt3('.tasks>.card') >= 2 && await cnt3('.kpath') === 1 && await cnt3('.xtile') === 5, [await cnt3('.tasks>.card'), await cnt3('.kpath')]);
  ok(T + 'kid: not teen at 10', await cnt3('.kidw.teen') === 0);
  for(const [seg, sel] of [['games', '[data-game]'], ['train', '#pronGo'], ['me', '.bal'], ['missions', '#mcard']]){ await K.locator(`[data-seg="${seg}"]`).click(); await tick(K, 100); ok(T + 'kid tile ' + seg, await K.locator(sel).first().isVisible()); }
  const m0 = await cnt3('.mission'); await K.locator('[data-mstat="done"]').click(); await tick(K, 100); ok(T + 'missions status filter (none done -> empty state)', await cnt3('.mission') === 0 && await cnt3('#mcard .empty') === 1, m0);
  await K.locator('[data-mstat="new"]').click(); await tick(K, 100); ok(T + 'missions: new', await cnt3('.mission') > 0);
  await K.locator('[data-mcat]').nth(1).click(); await tick(K, 100); ok(T + 'missions: category + status together', await cnt3('.mission') > 0 && await cnt3('.mission') <= 12);
  await K.locator('#kmap summary').click(); await tick(K, 100); ok(T + 'level map opens', await K.locator('.lmap').isVisible());
  await K.locator('[data-seg="library"]').click(); await tick(K); ok(T + 'stories tile goes to the library', await ev3(`TAB === 'library'`));
  for(const t of ['plan', 'wins', 'room', 'shop', 'home']){ await K.locator(`[data-tab="${t}"]`).click(); await tick(K, 300); } ok(T + 'all six tabs render', K.errs.length === 0, K.errs);
  await ev3(`document.querySelectorAll('.ov,.cheerpop,.hsay').forEach(o => o.remove()); WHO = 'layan'; go('layan')`); await tick(K, 800); ok(T + 'kid: teen skin at 13', await cnt3('.kidw.teen') === 1 && await ev3(`getComputedStyle(document.querySelector('.herobird')).display === 'none'`));
  // lesson-resume dialog still appears over the kid home
  await ev3(`document.querySelectorAll('.ov,.cheerpop,.hsay').forEach(o => o.remove()); WHO = 'sami'; go('sami')`); await tick(K, 500);
  ok(T + 'resume check runs on the kid home without error', await ev3(`(() => { try{ resumeCheck(); return true; }catch(e){ return String(e); } })()`) === true);
  await ev3(`window.streamClaude = async function*(){ yield '[MOOD:happy] Hello! Tell me about it.'; }; document.querySelectorAll('.ov').forEach(o => o.remove()); renderKid('sami')`); await tick(K, 300);
  await K.locator('#enter').click(); await tick(K, 1500); ok(T + 'primary action enters the lesson room', await cnt3('.room') === 1, K.errs);
  ok(T + 'no page errors (kid)', K.errs.length === 0, K.errs); await K.close();

  // ===== preview/ui-notes.md items (1-3, 5-12)
  { const U = await open(b, w, h, '#demo', {cloud:true}); const e = js => U.evaluate(js), c = sel => U.locator(sel).count();
    await e(`window.__calls = []; window.print = () => __calls.push('print'); window.resetPass = (kind, id) => __calls.push('reset:' + kind + ':' + id); WHO = 'parent'; P_TAB = 'students'; renderParent(); pOpenSheet('noura')`); await tick(U);
    // 1. one lesson at a time from the student sheet
    ok(T + '#1 sheet lists next lessons with move/cancel + extra/all buttons', await c('#pSheet .pslots li') === 4 && await c('#pSheet [data-smove]') === 4 && await c('#pSheet [data-sbook]') === 1 && await c('#pSheet [data-sall]') === 1);
    const rem0 = await e(`ledger('noura').remaining`);
    await U.locator('#pSheet [data-sbook]').click(); await U.locator('.ov #ps_d').fill('2026-11-16'); await U.locator('.ov #ps_t').fill('10:00'); await U.locator('.ov #ps_ok').click(); await tick(U);
    ok(T + '#1 owner books an extra lesson', await e(`DB.sched.noura.extra.includes('2026-11-16T1000') && ledger('noura').upcoming.some(s => s.key === '2026-11-16T1000' && s.extra)`) && await c('#pSheet') === 1);
    await U.locator('#pSheet [data-sbook]').click(); await U.locator('.ov #ps_d').fill('2026-11-14'); await U.locator('.ov #ps_t').fill('17:15'); await U.locator('.ov #ps_ok').click(); await tick(U, 100);
    ok(T + '#1 no 15-minute lead for the owner (5 minutes from now is fine)', await e(`DB.sched.noura.extra.includes('2026-11-14T1715')`));
    await U.locator('#pSheet [data-sbook]').click(); await U.locator('.ov #ps_d').fill('2026-11-14'); await U.locator('.ov #ps_t').fill('09:00'); await U.locator('.ov #ps_ok').click(); await tick(U, 100);
    ok(T + '#1 a time in the past is refused', /الماضي/.test(await U.locator('.ov #ps_e').textContent())); await U.locator('.ov #ps_no').click();
    await U.locator('#pSheet [data-sbook]').click(); await U.locator('.ov #ps_d').fill('2026-11-17'); await U.locator('.ov #ps_t').fill('18:20'); await U.locator('.ov #ps_ok').click(); await tick(U, 100);
    ok(T + '#1 clash with the same student is refused', /قريبة/.test(await U.locator('.ov #ps_e').textContent())); await U.locator('.ov #ps_no').click();
    await e(`DB.sched.noura.extra = DB.sched.noura.extra.filter(x => x !== '2026-11-14T1715'); renderParent()`); await tick(U, 100);
    const k1 = await e(`ledger('noura').next.key`);
    await U.locator(`#pSheet [data-smove="${k1}"]`).click(); await U.locator('.ov #ps_t').fill('20:00'); await U.locator('.ov #ps_ok').click(); await tick(U);
    ok(T + '#1 move one lesson (old cancelled, new booked, same month count)', await e(`DB.sched.noura.cancel.includes('${k1}') && DB.sched.noura.extra.includes('2026-11-15T2000')`), k1);
    const r1 = await e(`ledger('noura').rows.length`), k2 = await e(`ledger('noura').upcoming.find(s => !s.extra).key`);
    await U.locator(`#pSheet [data-scancel="${k2}"]`).click(); await U.locator('.ov #pc_y').click(); await tick(U);
    ok(T + '#1 cancel an upcoming lesson: no charge, not counted', await e(`DB.sched.noura.cancel.includes('${k2}') && ledger('noura').rows.length === ${r1} && !ledger('noura').upcoming.some(s => s.key === '${k2}')`));
    await U.locator('#pSheet [data-sall]').click(); await tick(U);
    ok(T + '#1 all-lessons dialog: upcoming + recent absences', await c('#pSlots .pslots li') > 8 && await c('#pSlots [data-scancel]') > 8);
    const miss = await e(`ledger('noura').rows.filter(r => r.st === 'miss').pop().key`), remA = await e(`ledger('noura').remaining`);
    await U.locator(`#pSlots [data-scancel="${miss}"]`).click(); await U.locator('.ov #pc_y').click(); await tick(U);
    ok(T + '#1 cancel an excused absence refunds it and the dialog redraws', await e(`ledger('noura').remaining === ${remA} + priceAt('noura', fromKey('${miss}'))`) && await c(`#pSlots [data-scancel="${miss}"]`) === 0);
    const att = await e(`DB.attendance.filter(a => a.kid === 'noura').pop().slot`);
    await e(`pCancelSlot('noura', '${att}')`); await tick(U, 100);
    ok(T + '#1 an attended lesson cannot be cancelled', await e(`!DB.sched.noura.cancel.includes('${att}')`) && /حضرها/.test(await U.locator('.ov').last().textContent()));
    await e(`document.querySelectorAll('.ov').forEach(o => o.remove()); P_SHEET = null`);
    // 2. guardian page
    await e(`P_TAB = 'guardians'; renderParent()`); await tick(U);
    await U.locator('[data-gpage="g1"]').click(); await tick(U);
    ok(T + '#2 guardian page opens with fields, children and reset', await c('#pGSheet #gp_name') === 1 && await c('#pGSheet [data-gpk]') === 5 && await c('#pGSheet [data-rpass="guardian:g1"]') === 1);
    ok(T + '#2 the page never shows the stored password', !(await U.locator('#pGSheet').textContent()).includes('482913'));
    await U.locator('#pGSheet [data-rpass]').click(); ok(T + '#2 reset password goes through resetPass("guardian", id)', await e(`__calls.includes('reset:guardian:g1')`));
    await U.locator('#pGSheet #gp_phone').fill('12ab'); await U.locator('#pGSheet #gp_save').click(); await tick(U, 100);
    ok(T + '#2 bad phone refused', /الجوال/.test(await U.locator('#pGSheet #gp_e').textContent()));
    await U.locator('#pGSheet #gp_name').fill('محمد سعد العتيبي'); await U.locator('#pGSheet #gp_phone').fill('0559998887');
    await U.locator('#pGSheet [data-gpk="layan"]').uncheck(); await U.locator('#pGSheet [data-gpk="fahad"]').check(); await U.locator('#pGSheet #gp_save').click(); await tick(U);
    ok(T + '#2 save name, phone and children (moved from the other guardian)', await e(`(() => { const g = DB.guardians.g1; return g.name === 'محمد سعد العتيبي' && g.phone === '0559998887' && g.kids.join() === 'sami,fahad' && DB.kids.fahad.guardian === 'g1' && !DB.kids.layan.guardian && !DB.guardians.g2.kids.includes('fahad'); })()`), await e(`DB.guardians.g1.kids`));
    ok(T + '#2 page stays open and refreshed after save', (await U.locator('#pGSheet h2').textContent()).includes('سعد'));
    await U.locator('#pGSheet [data-gsx]').first().click(); await tick(U, 100); ok(T + '#2 close', await c('#pGSheet') === 0);
    // 3. money log
    await e(`P_TAB = 'plans'; renderParent()`); await tick(U); await U.locator('[data-money]').first().click(); await tick(U);
    const nAll = await e(`(DB.topups.filter(t => DB.kids[t.kid]).length + kidIds().reduce((a, k) => a + ledger(k).rows.length, 0))`);
    ok(T + '#3 money log lists every top-up and lesson charge', await c('#pMoney .mrows li') === nAll, [await c('#pMoney .mrows li'), nAll]);
    ok(T + '#3 monthly totals rows', await c('#pMoney .mtab tr[data-mm]') >= 2);
    await U.locator('#pm_s').selectOption('layan'); await tick(U, 100);
    ok(T + '#3 filter by student', await c('#pMoney .mrows li') === await e(`DB.topups.filter(t => t.kid === 'layan').length + ledger('layan').rows.length`));
    await U.locator('#pm_m').selectOption('2026-11'); await tick(U, 100);
    ok(T + '#3 filter by month', await e(`[...document.querySelectorAll('#pMoney .mrows li')].length`) === await e(`DB.topups.filter(t => t.kid === 'layan' && t.at.startsWith('2026-11')).length + ledger('layan').rows.filter(r => monthKey(r.t) === '2026-11').length`));
    const csv = await e(`pMoneyCSV()`);
    ok(T + '#3 CSV: UTF-8 BOM, Arabic header, CRLF, monthly totals', csv.charCodeAt(0) === 0xFEFF && csv.includes('التاريخ,الوقت,الطالب') && csv.includes('\r\n') && csv.includes('المجموع الشهري') && csv.includes('ليان'));
    const [dl] = await Promise.all([U.waitForEvent('download', {timeout:5000}).catch(() => null), U.locator('#pm_csv').click()]);
    let dlOk = false; if(dl){ const fp = await dl.path(); const buf = require('fs').readFileSync(fp); dlOk = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF && /\.csv$/.test(dl.suggestedFilename()); }
    ok(T + '#3 export downloads a .csv file with BOM', dlOk, dl && dl.suggestedFilename());
    await e(`document.querySelectorAll('.ov').forEach(o => o.remove()); P_TAB = 'students'; renderParent(); pOpenSheet('sami')`); await tick(U); await U.locator('#pSheet [data-money]').click(); await tick(U, 100);
    ok(T + '#3 money log from a student sheet is filtered to that student', await e(`P_MS === 'sami' && document.querySelector('#pm_s').value === 'sami'`));
    await e(`document.querySelectorAll('.ov').forEach(o => o.remove()); P_SHEET = null`);
    // 12. new sign-ups while the dashboard is open
    await e(`P_TAB = 'overview'; renderParent()`); await tick(U, 600);
    await e(`__SU.push({id:'s9', status:'pending', at:new Date().toISOString(), data:{g_name:'سارة العنزي', phone:'0550001112', kids:[{ar:'ريم', boy:false, birth:'2016-02-02'}]}})`);
    await e(`document.querySelectorAll('.toast').forEach(t => t.remove())`);
    let seen = ''; for(let i = 0; i < 64 && !seen.includes('سارة'); i++){ await U.clock.runFor(1000); seen = await e(`[...document.querySelectorAll('.toast')].map(t => t.textContent).join('|')`); }
    ok(T + '#12 a new sign-up shows a toast within a minute', seen.includes('سارة العنزي'), seen);
    ok(T + '#12 badge and count update', (await U.locator('[data-sunb]').first().textContent()) === '3' && await e(`document.querySelector('[data-sunb]').classList.contains('pulse')`) && (await U.locator('[data-sun]').first().textContent()) === '3');
    // 5. English strings for the new dashboard and report screens
    await e(`(async () => { const r = await fetch('content/i18n-en.json'); I18N = await r.json(); I18N_KEYS = Object.keys(I18N).sort((a, b) => b.length - a.length); })()`); await tick(U, 300);
    await e(`pOpenMoney(null); pOpenGuardian('g2'); trNode(document.body)`); await tick(U, 100);
    ok(T + '#5 English: money log and guardian page headings', (await U.locator('#pMoney h2').textContent()) === 'Money log' && (await U.locator('#pGSheet #gp_save').textContent()) === 'Save changes' && (await U.locator('#pm_csv').textContent()).includes('Export to Excel'));
    ok(T + '#5 i18n-en.json is valid and has the new keys', await e(`['السجل المالي','صفحة ولي الأمر','تنزيل PDF','مظهر هادئ','التقرير الشهري للطباعة مع ملاحظة المعلم','ابحث عن مهمة: مطار، قهوة…'].every(k => I18N[k])`));
    ok(T + '#1-3,5,12 no page errors', U.errs.length === 0, U.errs); await U.close(); }

  { const G = await open(b, w, h, '#demo', {cloud:true}); const e = js => G.evaluate(js), c = sel => G.locator(sel).count();
    await e(`window.__calls = []; window.print = () => __calls.push('print:' + document.body.className); WHO = 'g:g1'; G_TAB = 'reports'; G_KID = 'sami'; G_FILTER = 'all'; renderGuardian('g1')`); await tick(G);
    // 6. printable monthly report for past months
    const past = await e(`gRows('sami').filter(x => x.type === 'month' && !x.m.cur).map(x => x.m.mk)`);
    ok(T + '#6 past months are listed', past.length >= 1, past);
    await e(`document.querySelectorAll('.grow.t-month')[1].click()`); await tick(G, 100);
    ok(T + '#6 a past month offers the printable report', await c('#gRep [data-gmonth]') === 1 && (await G.locator('#gRep [data-gmonth]').getAttribute('data-gmonth')) === past[0]);
    await G.locator('#gRep [data-gmonth]').click(); await tick(G, 300);
    const name = await e(`fmtMonth(new Date(${Number(past[0].slice(0, 4))}, ${Number(past[0].slice(5)) - 1}, 1))`);
    const att = await e(`ledger('sami').rows.filter(r => monthKey(r.t) === '${past[0]}' && r.st === 'att').length`);
    ok(T + '#6 printable report is for that month, with its own numbers', (await G.locator('#certBox').textContent()).includes(name) && (await G.locator('#certBox .stat b').first().textContent()).trim() === String(att), [name, att]);
    await e(`DB.monthly.sami = {'${past[0]}':'ملاحظة شهر سابق محفوظة'}; document.querySelectorAll('.ov:not(#gRep)').forEach(o => o.remove())`); await G.locator('#gRep [data-gmonth]').click(); await tick(G, 300);
    ok(T + '#6 the teacher note is kept per month', (await G.locator('#mnote').textContent()).includes('ملاحظة شهر سابق'));
    // 7. PDF with the Hudhud identity
    await G.locator('.ov #mpdf').click(); await tick(G, 100);
    ok(T + '#7 monthly PDF uses the print page', await e(`__calls.includes('print:hhpdf') && !!document.querySelector('#hhPdf .pdf-cert')`));
    await e(`window.dispatchEvent(new Event('afterprint')); document.querySelectorAll('.ov').forEach(o => o.remove())`);
    await G.locator('.grow.t-lesson').first().click(); await tick(G, 100); await G.locator('#gRep [data-rpdf]').click(); await tick(G, 100);
    ok(T + '#7 report PDF: logo, title, report card, footer', await c('#hhPdf .pdf-h .logo') === 1 && await c('#hhPdf .rcard') === 1 && await c('#hhPdf .pdf-f') === 1 && await e(`document.title.startsWith('هدهد - ')`));
    await G.emulateMedia({media:'print'});
    ok(T + '#7 in print only the PDF page shows, in Dubai font and light colours', await e(`(() => { const p = document.getElementById('hhPdf'), s = getComputedStyle(p); return s.display === 'block' && getComputedStyle(document.getElementById('app')).display === 'none' && /Dubai/.test(s.fontFamily) && getComputedStyle(p.querySelector('.rcard')).backgroundColor === 'rgb(255, 255, 255)'; })()`));
    const pdf = await G.pdf({format:'A4', printBackground:true}).catch(() => null); ok(T + '#7 Chromium prints it to a PDF', !!pdf && pdf.length > 20000, pdf && pdf.length);
    await G.emulateMedia({media:'screen'}); await e(`window.dispatchEvent(new Event('afterprint'))`);
    ok(T + '#7 after printing the page returns to normal', await e(`!document.body.classList.contains('hhpdf') && !document.title.startsWith('هدهد - ') && getComputedStyle(document.getElementById('hhPdf')).display === 'none'`));
    await G.locator('#gRep [data-rprint]').click(); ok(T + '#7 plain print still prints the sheet (no PDF page)', await e(`__calls.slice(-1)[0] === 'print:gprint'`));
    ok(T + '#6-7 no page errors', G.errs.length === 0, G.errs); await G.close(); }

  { const Q = await open(b, w, h, '#demo-kid', {cloud:true}); const e = js => Q.evaluate(js), c = sel => Q.locator(sel).count();
    const quiet = `document.querySelectorAll('.ov,.cheerpop,.hsay').forEach(o => o.remove())`;
    await e(`WHO = 'sami'; TAB = 'home'; HOME_SEG = 'missions'; MQ = ''; MCAT = 'all'; MSTAT = 'all'; go('sami')`); await tick(Q, 1200); await e(quiet);
    // 8. lighter top bar on phones
    const vis = sel => e(`(() => { const x = document.querySelector('${sel}'); return !!x && getComputedStyle(x).display !== 'none'; })()`);
    if(w < 600) ok(T + '#8 phone top bar: name, points, avatar only', !(await vis('.kidw>.topbar .prefs')) && !(await vis('.kidw>.topbar #out')) && await vis('.kidw>.topbar #edit') && (await Q.locator('.kidw>.topbar .me').textContent()).includes('نقطة'));
    else ok(T + '#8 wide screens keep the full top bar', await vis('.kidw>.topbar .prefs') && await vis('.kidw>.topbar #out'));
    await Q.locator('.kidw>.topbar #edit').click(); await tick(Q);
    ok(T + '#8 profile page has language, dark mode and logout', await c('.pprefs [data-pref="lang"]') === 1 && await c('.pprefs [data-pref="theme"]') === 1 && await c('#pout') === 1);
    await Q.locator('.pprefs [data-pref="theme"]').click(); await tick(Q, 100);
    ok(T + '#8 dark-mode button works there and does not submit the form', await e(`PREF.theme !== 'auto' && !!document.getElementById('pf')`), await e(`PREF.theme`));
    // 11. look chosen per kid
    await Q.locator('[data-look="calm"]').click(); await Q.locator('#pf [type=submit]').click(); await tick(Q, 600); await e(quiet);
    ok(T + '#11 calm look chosen at 10 years old (saved per kid, profile kept)', await e(`DB.profiles.sami.look === 'calm' && DB.profiles.sami.nick === 'Sam'`) && await c('.kidw.teen') === 1 && await e(`document.body.classList.contains('kteen')`));
    await e(`DB.profiles.layan.look = 'color'; go('layan')`); await tick(Q, 600); await e(quiet);
    ok(T + '#11 colourful look chosen at 13', await c('.kidw.teen') === 0 && await e(`!document.body.classList.contains('kteen')`));
    await e(`DB.profiles.layan.look = 'auto'; go('layan')`); await tick(Q, 600); await e(quiet);
    ok(T + '#11 automatic follows age (13 -> calm)', await c('.kidw.teen') === 1);
    // 10. calm look in dialogs, lesson room and reader (CSS only)
    await e(`slotPicker('layan', null)`); await tick(Q, 100);
    ok(T + '#10 calm dialogs', await e(`getComputedStyle(document.querySelector('.ov>.card')).borderTopLeftRadius === '14px'`)); await e(quiet);
    await e(`window.streamClaude = async function*(){ yield '[MOOD:happy] Hello!'; }; window.speakOne = (t, s, d) => setTimeout(d, 5); enterLesson('layan', true)`); await tick(Q, 1500);
    ok(T + '#10 calm lesson room (flat background, teacher drawing untouched)', await c('.room') === 1 && await e(`getComputedStyle(document.querySelector('.room')).backgroundImage === 'none' && !!document.querySelector('#tbox svg')`));
    await e(`try{ L && (L.ended = true); }catch(x){} L = null; WHO = 'parent'; renderParent()`); await tick(Q, 300);
    ok(T + '#10 the owner page never keeps the calm look', await e(`!document.body.classList.contains('kteen')`));
    // 9. search missions by name
    await e(`WHO = 'noura'; MQ = ''; go('noura')`); await tick(Q, 600); await e(quiet);
    await Q.locator('#mq').fill('مطار'); await tick(Q, 100);
    ok(T + '#9 search "مطار" finds the airport mission and keeps focus', await c('#mcard .mission') >= 1 && await e(`[...document.querySelectorAll('#mcard .mission')].some(m => /Airport/.test(m.textContent)) && document.activeElement.id === 'mq'`), await c('#mcard .mission'));
    await Q.locator('#mq').fill('قهوة'); await tick(Q, 100);
    ok(T + '#9 search "قهوة" (Arabic letters folded)', await c('#mcard .mission') >= 2, await c('#mcard .mission'));
    await Q.locator('#mq').fill('coffee'); await tick(Q, 100); const nEn = await c('#mcard .mission'); await e(quiet);
    await Q.locator('[data-mcat="food"]').click(); await tick(Q, 100);
    ok(T + '#9 search works with the category filter', await c('#mcard .mission') >= 1 && await c('#mcard .mission') <= nEn && (await Q.locator('#mq').inputValue()) === 'coffee');
    await e(quiet); await Q.locator('[data-mstat="done"]').click(); await tick(Q, 100);
    ok(T + '#9 search + status with no match -> empty state', await c('#mcard .mission') === 0 && /ما لقينا/.test(await Q.locator('#mcard .empty').textContent()));
    await e(quiet); await Q.locator('[data-mstat="all"]').click(); await e(quiet); await Q.locator('[data-mcat="all"]').click(); await Q.locator('#mq').fill(''); await tick(Q, 100);
    ok(T + '#9 clearing the search restores the list', await c('#mcard .mission') >= 6);
    await e(`renderProfile('noura', false)`); await tick(Q, 100); await Q.locator('#pout').click(); await tick(Q, 300);
    ok(T + '#8 logout from the profile', await e(`WHO === null`));
    ok(T + '#8-11 no page errors', Q.errs.length === 0, Q.errs); await Q.close(); }
 }
 const bad = res.filter(r => r[0] === 'FAIL'); console.log(res.map(r => r.join(' | ')).join('\n')); console.log(`\n${res.length - bad.length} passed, ${bad.length} failed`); await b.close(); })().catch(e => { console.log(res.map(r => r.join(' | ')).join('\n')); console.error('CRASH', e.message.slice(0, 600)); process.exit(1); });
