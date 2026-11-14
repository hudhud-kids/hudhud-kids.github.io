// Accounts & passwords (schema_9): no plain password leaves the parent's device or stays in its storage, accounts go
// through tk_accounts_apply, resetPass overlay, offline login with the local verifier, old-server fallback, join consent,
// privacy page. Supabase is mocked inside the page.
const {chromium} = require('playwright');
const {BASE, check, sleep} = require('./h');
const SHOTS = process.env.SHOTS || '';
const SIZES = [[390, 844], [844, 390], [820, 1180], [1180, 820], [1440, 900]];
const BLOCK = /cdn\.jsdelivr\.net|unpkg\.com|stt\.speech|tts\.speech|supabase|anthropic/;

function mock(opts = {}){
  const calls = [];
  const handler = async route => {
    const req = route.request(), url = req.url(), m = url.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/);
    if(!m) return route.abort();
    const fn = m[1]; let args = {}; try{ args = JSON.parse(req.postData() || '{}'); }catch(e){}
    calls.push({fn, args});
    const json = (v, status = 200) => route.fulfill({status, contentType:'application/json', body:JSON.stringify(v)});
    if(opts[fn]) return opts[fn](args, json);
    if(fn === 'tk_pull') return json({rows:opts.rows || [], now:new Date().toISOString(), role:'parent', kid:null, cfg:{ai:true, az:false}, pv:2});
    if(fn === 'tk_push') return json({ok:(args.changes || []).map(c => ({path:c.path, ver:2})), conflicts:[], denied:[]});
    if(fn === 'tk_accounts_apply') return json({ok:true, results:(args.ops || []).map(o => ({kind:o.kind, id:o.id, st:o.op === 'del' ? 'ok' : o.p ? 'pass' : 'ok'}))});
    if(fn === 'tk_account_set_pass') return json({ok:true, user:'x'});
    if(fn === 'tk_accounts_set') return json({ok:true, skipped:[]});
    if(fn === 'tk_logout') return json(null);
    return json([]);
  };
  return {calls, handler};
}
async function newPage(b, w, h, m, init){
  const ctx = await b.newContext({viewport:{width:w, height:h}});
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(BLOCK, r => m ? m.handler(r) : r.abort());
  await p.addInitScript(() => sessionStorage.setItem('hh:splash', '1'));
  if(init) await p.addInitScript(init.fn, init.arg);
  return {ctx, p, errs};
}
const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

(async () => {
  const b = await chromium.launch();
  // ---------- family data built from the demo ----------
  const s0 = await newPage(b, 1180, 820);
  await s0.p.goto(BASE + 'index.html#demo'); await s0.p.waitForTimeout(900);
  const fam = await s0.p.evaluate(() => {
    const d = JSON.parse(JSON.stringify(DB)); delete d.apiKey;
    d.parent = {user:'boss', pass:'bosspass', name:'Mohammed'};
    d.kids.kid.user = 'kid1'; d.kids.kid.pass = '1111'; d.kids.kid.guardian = 'g1';
    d.guardians = {g1:{id:'g1', user:'mom', pass:'999999', name:'أم سامي', kids:['kid']}};
    const legacy = [{u:'boss', p:'bosspass', role:'parent'}, {u:'kid1', p:'1111', role:'kid', kid:'kid'}, {u:'mom', p:'999999', role:'guardian', kid:'g1'}];
    const clean = JSON.parse(JSON.stringify(d)); delete clean.parent.pass; delete clean.kids.kid.pass; delete clean.guardians.g1.pass;
    const rows = Object.entries(pathsOf(clean)).map(([path, value]) => ({path, value, ver:1}));
    return {db:d, sig:JSON.stringify(legacy), rows, key:STORE_KEY, ckey:CLOUD_KEY};
  });
  await s0.ctx.close();
  const seed = (who, cloud) => ({fn:a => { if(sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.setItem(a.key, JSON.stringify(a.db)); localStorage.setItem('51telk:who', a.who || ''); if(a.cloud) localStorage.setItem(a.ckey, JSON.stringify(a.cloud)); },
    arg:{key:fam.key, ckey:fam.ckey, db:fam.db, who, cloud}});

  // ---------- A. parent device, server with schema_9 ----------
  {
    const m = mock({rows:[]});
    const {ctx, p, errs} = await newPage(b, 1180, 820, m, seed('parent', {token:'T', role:'parent', family:'F', username:'boss', vers:{}, synced:{}, acctSig:fam.sig}));
    await p.goto(BASE + 'index.html'); await p.waitForTimeout(1500);
    await p.evaluate(async () => { await cloudPush(); await new Promise(r => setTimeout(r, 400)); await cloudPush(); });
    const pushes = m.calls.filter(c => c.fn === 'tk_push');
    check('A: pushed rows carry no password', pushes.length > 0 && !pushes.some(c => /"pass"/.test(JSON.stringify(c.args.changes))), pushes.length);
    const ap = m.calls.filter(c => c.fn === 'tk_accounts_apply' && (c.args.ops || []).length);
    const ops = ap.flatMap(c => c.args.ops);
    check('A: accounts sent with tk_accounts_apply, legacy passwords not resent', ops.length === 3 && ops.every(o => o.op === 'save' && !o.p), ops);
    check('A: tk_accounts_set not used', !m.calls.some(c => c.fn === 'tk_accounts_set'));
    const st = await p.evaluate(k => ({db:localStorage.getItem(k), lv:Object.keys(JSON.parse(localStorage.getItem('51telk:lv') || '{}')), acct:JSON.parse(localStorage.getItem('51telk:acct') || '{}')}), fam.key);
    check('A: no plain password left in local storage', !/"pass"/.test(st.db));
    check('A: offline verifiers made from the old copies', ['boss', 'kid1', 'mom'].every(u => st.lv.includes(u)), st.lv);
    // a new password typed in the form
    m.calls.length = 0;
    await p.evaluate(async () => { DB.kids.kid.pass = '4321'; save(); await cloudPush(); });
    const ops2 = m.calls.filter(c => c.fn === 'tk_accounts_apply').flatMap(c => c.args.ops || []);
    check('A: changed password goes only to tk_accounts_apply', ops2.length === 1 && ops2[0].p === '4321' && ops2[0].kind === 'kid' && !m.calls.some(c => c.fn === 'tk_push' && /4321/.test(JSON.stringify(c.args))), ops2);
    check('A: pending password cleared after the server took it', await p.evaluate(() => !Object.keys(ACCT.pend).length && !DB.kids.kid.pass));
    // deleting a guardian removes its account
    m.calls.length = 0;
    await p.evaluate(async () => { delete DB.guardians.g1; delete DB.kids.kid.guardian; save(); await cloudPush(); });
    const ops3 = m.calls.filter(c => c.fn === 'tk_accounts_apply').flatMap(c => c.args.ops || []);
    check('A: deleted guardian -> del op', ops3.some(o => o.op === 'del' && o.kind === 'guardian' && o.id === 'g1'), ops3);
    await p.evaluate(async () => { DB.guardians = {g1:{id:'g1', user:'mom', name:'أم سامي', kids:['kid']}}; DB.kids.kid.guardian = 'g1'; save(); await cloudPush(); });
    // credentials card: password hidden -> reset button
    await p.evaluate(() => { document.querySelectorAll('.ov').forEach(o => o.remove()); Object.keys(ACCT_KNOWN).forEach(k => delete ACCT_KNOWN[k]); showCreds('kid'); });
    check('A: showCreds hides unknown passwords and offers a reset', await p.evaluate(() => !!document.querySelector('[data-crp="kid:kid"]') && /مخفية/.test(document.querySelector('.ov').textContent)));
    // resetPass from the owner dashboard button
    await p.evaluate(() => { document.querySelectorAll('.ov').forEach(o => o.remove()); P_TAB = 'settings'; go('parent'); });
    await p.waitForTimeout(400);
    const btns = await p.evaluate(() => [...document.querySelectorAll('[data-rpass]')].map(x => x.dataset.rpass));
    check('A: dashboard shows reset buttons for the hidden passwords', btns.includes('kid:kid') && btns.includes('parent:parent'), btns);
    await p.evaluate(() => { const b = document.querySelector('[data-rpass="kid:kid"]'); b.scrollIntoView(); b.click(); });
    await p.waitForTimeout(300);
    check('A: resetPass overlay opens with a 4-digit suggestion', await p.evaluate(() => /^\d{4}$/.test(document.querySelector('#rp_p').value)));
    if(SHOTS) for(const [w, h] of SIZES){ await p.setViewportSize({width:w, height:h}); await p.waitForTimeout(150); await p.screenshot({path:`${SHOTS}/resetpass-${w}x${h}.png`}); check(`A: reset overlay fits ${w}x${h}`, await noOverflow(p) && await p.evaluate(() => { const r = document.querySelector('.ov .card').getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; })); }
    await p.setViewportSize({width:1180, height:820});
    await p.fill('#rp_p', '12'); await p.click('#rp_ok'); await p.waitForTimeout(100);
    check('A: short password refused', /4 أرقام/.test(await p.textContent('#rp_e')));
    m.calls.length = 0;
    await p.fill('#rp_p', '5678'); await p.click('#rp_ok'); await p.waitForTimeout(500);
    const sp = m.calls.find(c => c.fn === 'tk_account_set_pass');
    check('A: tk_account_set_pass called with kind/id/new_pass', sp && sp.args.kind === 'kid' && sp.args.id === 'kid' && sp.args.new_pass === '5678' && sp.args.t === 'T', sp && sp.args);
    check('A: success panel shows the new password once', await p.evaluate(() => /5678/.test(document.querySelector('.ov').textContent) && !!document.querySelector('#rp_c')));
    if(SHOTS){ await p.screenshot({path:`${SHOTS}/resetpass-done.png`}); }
    await p.click('#rp_d'); await p.waitForTimeout(200);
    // guardian and parent kinds
    m.calls.length = 0;
    await p.evaluate(() => { resetPass('parent', 'parent'); });
    await p.fill('#rp_p', 'newboss1'); await p.click('#rp_ok'); await p.waitForTimeout(400);
    const sp2 = m.calls.find(c => c.fn === 'tk_account_set_pass');
    check('A: parent reset sends kind parent, id null', sp2 && sp2.args.kind === 'parent' && sp2.args.id === null, sp2 && sp2.args);
    check('A: no page errors', !errs.length, errs);
    await ctx.close();
  }

  // ---------- B. server without schema_9: old flow kept ----------
  {
    const m = mock({tk_accounts_apply:(a, json) => json({code:'PGRST202', message:'Could not find the function public.tk_accounts_apply'}, 404)});
    const {ctx, p, errs} = await newPage(b, 1180, 820, m, seed('parent', {token:'T', role:'parent', family:'F', username:'boss', vers:{}, synced:{}, acctSig:null}));
    await p.goto(BASE + 'index.html'); await p.waitForTimeout(1200);
    await p.evaluate(async () => { await cloudPush(); await new Promise(r => setTimeout(r, 1500)); await cloudPush(); });
    const set = m.calls.find(c => c.fn === 'tk_accounts_set');
    check('B: old server -> tk_accounts_set with passwords (unchanged behaviour)', set && set.args.accts.some(a => a.u === 'kid1' && a.p === '1111'), set && set.args);
    check('B: passwords stay in the data until the server is updated', await p.evaluate(() => DB.kids.kid.pass === '1111'));
    check('B: no page errors', !errs.length, errs);
    await ctx.close();
  }

  // ---------- C. child device: online login makes a verifier, offline login uses it ----------
  {
    const kidDb = JSON.parse(JSON.stringify(fam.db)); delete kidDb.kids.kid.pass; delete kidDb.parent.pass; delete kidDb.guardians;
    let serverPass = '1111';
    const m = mock({rows:fam.rows,
      tk_login2:(a, json) => json(a.u === 'kid1' && a.p === serverPass ? {token:'K', role:'kid', kid:'kid', family:'F'} : null),
      tk_pull:(a, json) => json({rows:fam.rows.filter(r => !/^(guardians|parent)/.test(r.path)), now:new Date().toISOString(), role:'kid', kid:'kid', cfg:{ai:true, az:false}, pv:2})});
    const {ctx, p, errs} = await newPage(b, 390, 844, m, {fn:a => { if(sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem(a.key, JSON.stringify(a.db)); localStorage.setItem('51telk:who', ''); }, arg:{key:fam.key, db:kidDb}});
    await p.goto(BASE + 'index.html'); await p.waitForTimeout(1000);
    check('C: login screen links the privacy page', await p.evaluate(() => !!document.querySelector('#lf a[href="privacy/"]')));
    if(SHOTS) for(const [w, h] of SIZES){ await p.setViewportSize({width:w, height:h}); await p.waitForTimeout(150); await p.screenshot({path:`${SHOTS}/login-${w}x${h}.png`}); check(`C: login fits ${w}x${h}`, await noOverflow(p)); }
    await p.setViewportSize({width:390, height:844});
    const login = async (u, pw) => { await p.evaluate(() => { if(!document.querySelector('#lf')) { setWho(null); go('login'); } }); await p.waitForTimeout(150); await p.fill('#u', u); await p.fill('#p', pw); await p.evaluate(() => document.querySelector('#lf').requestSubmit()); await p.waitForTimeout(900); return p.evaluate(() => WHO); };
    check('C: online login', (await login('kid1', '1111')) === 'kid');
    const tl = m.calls.find(c => c.fn === 'tk_login2');
    check('C: login sends a device id', tl && /^[a-z0-9-]{8,64}$/.test(tl.args.d || ''), tl && tl.args);
    await p.waitForTimeout(500);
    check('C: verifier stored for this device', await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('51telk:lv') || '{}').kid1; return !!(v && v.h && v.s && v.w === 'kid' && !JSON.stringify(v).includes('1111')); }));
    await p.evaluate(() => { WHO = null; setWho(null); go('login'); });
    await ctx.setOffline(true);
    check('C: offline login with the right password', (await login('kid1', '1111')) === 'kid');
    await p.evaluate(() => { setWho(null); go('login'); });
    check('C: offline login with a wrong password refused', (await login('kid1', '0000')) == null && /غير صحيحة/.test(await p.textContent('#le')));
    await ctx.setOffline(false);
    serverPass = '2468';   // the admin reset it
    check('C: online, server says no -> refused even though the old verifier matches', (await login('kid1', '1111')) == null);
    check('C: stale verifier dropped', await p.evaluate(() => !JSON.parse(localStorage.getItem('51telk:lv') || '{}').kid1));
    check('C: no page errors', !errs.length, errs);
    await ctx.close();
  }

  // ---------- D. join form consent + privacy page ----------
  {
    const sub = [];
    const {ctx, p, errs} = await newPage(b, 390, 844, {handler:async r => { sub.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({status:200, contentType:'application/json', body:'{"ok":true}'}); }});
    await p.goto(BASE + 'join/index.html'); await p.waitForTimeout(500);
    await p.fill('#ar1', 'أحمد'); await p.check('input[name=g1][value="1"]', {force:true}); await p.fill('#b1', '2016-05-05');
    await p.fill('#g_name', 'محمد'); await p.selectOption('#rel', {index:1}); await p.fill('#phone', '0551234567'); await p.check('#ok');
    await p.click('#send'); await p.waitForTimeout(300);
    check('D: join refuses without the privacy consent', /سياسة الخصوصية/.test(await p.textContent('#err')) && !sub.length);
    check('D: consent links the privacy page', await p.evaluate(() => !!document.querySelector('label.consent a[href="../privacy/"]')));
    if(SHOTS) for(const [w, h] of SIZES){ await p.setViewportSize({width:w, height:h}); await p.evaluate(() => document.querySelector('#pv').scrollIntoView({block:'center'})); await p.waitForTimeout(150); await p.screenshot({path:`${SHOTS}/join-${w}x${h}.png`}); check(`D: join fits ${w}x${h}`, await noOverflow(p)); }
    await p.check('#pv'); await p.click('#send'); await p.waitForTimeout(600);
    check('D: consent stored with the sign-up', sub.length === 1 && sub[0].d.consent && sub[0].d.consent.voice === true && !!sub[0].d.consent.at, sub[0] && sub[0].d.consent);
    await p.goto(BASE + 'privacy/'); await p.waitForTimeout(400);
    check('D: privacy page has the draft marker', /DRAFT: needs legal review/.test(await (await p.request.get(BASE + 'privacy/index.html')).text()));
    if(SHOTS) for(const [w, h] of SIZES){ await p.setViewportSize({width:w, height:h}); await p.waitForTimeout(150); await p.screenshot({path:`${SHOTS}/privacy-${w}x${h}.png`, fullPage:false}); }
    for(const [w, h] of SIZES){ await p.setViewportSize({width:w, height:h}); check(`D: privacy fits ${w}x${h}`, await noOverflow(p)); }
    await p.goto(BASE + 'welcome/'); await p.waitForTimeout(300);
    check('D: welcome footer links the privacy page', await p.evaluate(() => !!document.querySelector('footer a[href="../privacy/"]')));
    check('D: no page errors', !errs.length, errs);
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.log('FAIL crash', e.message); process.exitCode = 1; });
