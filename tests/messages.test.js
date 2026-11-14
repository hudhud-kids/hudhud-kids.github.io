// item 8: an ended login session and a missing internet connection get their own messages (and offline retries by itself)
const {openReal, check, sleep} = require('./h');
const SHOTS = process.env.SHOTS || '';
const base = () => { window.speakOne = (t, s, d) => setTimeout(d, 30); window.startListening = () => setState('listening'); };
(async () => {
  // ---- A: the relay answers 401 bad_session (real aiFetch/streamClaude, the server is faked at the network)
  {
    let hits = 0;
    const {b, p, errs} = await openReal({prep: (db) => { db.apiKey = ''; },
      init: () => { try{ localStorage.setItem('51telk:cloud', JSON.stringify({token:'11111111-1111-1111-1111-111111111111', role:'kid'})); }catch(e){} },
      route: r => { if(/functions\/v1\/ai\/claude/.test(r.request().url())){ hits++; return r.fulfill({status:401, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify({error:'bad_session'})}); } return r.abort(); }});
    await p.evaluate(base);
    const kid = await p.evaluate(async () => { CLOUD.token = '11111111-1111-1111-1111-111111111111'; if(!WHO) return null; await loadContent(DB.kids[WHO].level); startLesson(WHO, true); return WHO; });
    await p.waitForSelector('#relog', {timeout:8000}).catch(() => {});
    const a = await p.evaluate(() => ({sub:(document.querySelector('#sub') || {}).textContent || '', btn:!!document.getElementById('relog'), state:L && L.state, health:L && L.hc}));
    check('bad_session: «انتهت جلسة الدخول. سجّل الدخول من جديد» (not the key message)', kid && hits >= 1 && /انتهت جلسة الدخول\. سجّل الدخول من جديد/.test(a.sub) && !/مفتاح التشغيل/.test(a.sub) && a.btn, {a, hits});
    if(SHOTS) for(const [w, h] of [[390, 844], [844, 390], [820, 1180], [1180, 820], [1440, 900]]){ await p.setViewportSize({width:w, height:h}); await sleep(150); await p.screenshot({path:`${SHOTS}/session-${w}x${h}.png`}); }
    if(a.btn) await p.click('#relog'); await sleep(400);
    const a2 = await p.evaluate(() => ({L:!!L, who:WHO, login:!!document.getElementById('le') || /دخول/.test(document.querySelector('#app').textContent), room:!!document.querySelector('.room')}));
    check('the button signs out to the login screen', !a2.L && !a2.who && a2.login && !a2.room, a2);
    check('A: no page errors', !errs.length, errs);
    await b.close();
  }
  // ---- B: wrong key keeps its message; offline and failed requests show «لا يوجد إنترنت…» and retry by themselves
  {
    const {b, ctx, p, errs} = await openReal({prep: (db) => { db.apiKey = 'sk-test'; }});
    await p.evaluate(base);
    const r1 = await p.evaluate(async () => {
      window.__mode = 'ok'; window.__calls = 0;
      window.streamClaude = async function*(){ window.__calls++; const m = window.__mode; await new Promise(r => setTimeout(r, 30));
        if(m === 'key') throw {status:401, body:'{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'};
        if(m === 'type') throw new TypeError('Failed to fetch');
        yield 'Nice! And then?\n[MOOD:happy]'; };
      await loadContent(DB.kids[WHO].level); startLesson(WHO, true); await new Promise(r => setTimeout(r, 300));
      window.__mode = 'key'; studentSaid('Hello teacher.'); await new Promise(r => setTimeout(r, 300));
      const key = document.querySelector('#sub').textContent; window.__mode = 'ok';
      document.getElementById('retry').click(); await new Promise(r => setTimeout(r, 300));
      return {key, hist:L.history.length};
    });
    check('a wrong key still says «مفتاح التشغيل غير صحيح»', /مفتاح التشغيل غير صحيح/.test(r1.key), r1);
    // offline before the request
    await ctx.setOffline(true); await sleep(100);
    const r2 = await p.evaluate(async () => { const c0 = window.__calls, h0 = L.history.length; studentSaid('I like cats.'); await new Promise(r => setTimeout(r, 400));
      return {onLine:navigator.onLine, sub:document.querySelector('#sub').textContent, state:document.querySelector('#state').textContent, st:L.state, calls:window.__calls - c0, hist:L.history.length - h0, net:!!L.net}; });
    check('offline: «لا يوجد إنترنت…» at once, no endless thinking', r2.onLine === false && /لا يوجد إنترنت/.test(r2.sub) && /لا يوجد إنترنت/.test(r2.state) && r2.st === 'idle' && r2.calls === 0 && r2.net, r2);
    if(SHOTS) for(const [w, h] of [[390, 844], [844, 390], [820, 1180], [1180, 820], [1440, 900]]){ await p.setViewportSize({width:w, height:h}); await sleep(150); await p.screenshot({path:`${SHOTS}/offline-${w}x${h}.png`}); }
    await ctx.setOffline(false); await sleep(1500);
    const r3 = await p.evaluate(() => ({sub:document.querySelector('#sub').textContent, net:!!L.net, last:L.history[L.history.length - 2].content, n:L.history.filter(h => /I like cats/.test(h.content)).length, roles:L.history.map(h => h.role[0]).join('')}));
    check('back online: the turn is sent by itself, once', !r3.net && /Nice! And then\?/.test(r3.sub) && /Student: I like cats\./.test(r3.last) && r3.n === 1 && !/uu|aa/.test(r3.roles), r3);
    // the browser says online but requests fail (TypeError): same message, automatic retry
    const r4 = await p.evaluate(async () => { window.__mode = 'type'; const c0 = window.__calls; studentSaid('I like dogs.'); await new Promise(r => setTimeout(r, 1900));
      const shown = document.querySelector('#sub').textContent, calls1 = window.__calls - c0, hc = Object.assign({}, L.hc);
      window.__mode = 'ok'; for(let j = 0; j < 120 && L.net; j++) await new Promise(r => setTimeout(r, 100)); await new Promise(r => setTimeout(r, 300));
      return {shown, calls1, hc, net:!!L.net, sub:document.querySelector('#sub').textContent, n:L.history.filter(h => /I like dogs/.test(h.content)).length}; });
    check('request cannot leave the device: one quiet retry, then «لا يوجد إنترنت…»', /لا يوجد إنترنت/.test(r4.shown) && r4.calls1 === 2 && r4.hc.retries >= 1 && r4.hc.relayErr >= 1, r4);
    check('retries by itself and continues', !r4.net && /Nice! And then\?/.test(r4.sub) && r4.n === 1, r4);
    // while waiting, a new answer is not lost and a mic tap retries
    const r5 = await p.evaluate(async () => { window.__mode = 'type'; studentSaid('First part.'); await new Promise(r => setTimeout(r, 1900)); const waiting = !!L.net;
      window.__mode = 'ok'; onMicTap(); await new Promise(r => setTimeout(r, 400));
      return {waiting, net:!!L.net, last:L.history[L.history.length - 2].content}; });
    check('a mic tap while waiting tries again now', r5.waiting && !r5.net && /First part\./.test(r5.last), r5);
    check('B: no page errors', !errs.length, errs);
    await b.close();
  }
})();
