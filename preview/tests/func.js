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
  await p.locator('#xfer').click(); await tick(p, 800); ok(T + 'device setup link dialog', await vis('.ov #xlink')); await closeOv();
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
 }
 const bad = res.filter(r => r[0] === 'FAIL'); console.log(res.map(r => r.join(' | ')).join('\n')); console.log(`\n${res.length - bad.length} passed, ${bad.length} failed`); await b.close(); })().catch(e => { console.log(res.map(r => r.join(' | ')).join('\n')); console.error('CRASH', e.message.slice(0, 600)); process.exit(1); });
