// QA harness: opens the demo kid and forces the Deepgram voice engine with a scriptable mock WebSocket (no network at all).
const {chromium} = require('playwright');
const PORT = process.env.PORT || 8851, BASE = `http://localhost:${PORT}/`;
exports.BASE = BASE;
exports.check = (name, ok, extra) => { console.log(ok ? 'PASS' : 'FAIL', name, ok || extra === undefined ? '' : JSON.stringify(extra)); if(!ok) process.exitCode = 1; };
exports.info = (name, v) => console.log('INFO', name, JSON.stringify(v));
exports.sleep = ms => new Promise(r => setTimeout(r, ms));
const MOCK = () => {
  sessionStorage.setItem('hh:splash', '1');
  window.__sent = []; window.__ws = null; window.__wsList = []; window.__cfg = Object.assign({autoReply:true, refuseInject:false}, window.__initCfg || {});
  window.WebSocket = class {
    constructor(u, pr){ this.url = u; this.readyState = 0; window.__ws = this; window.__wsList.push(this); if(!__cfg.noOpen) setTimeout(() => { if(this.readyState === 0){ this.readyState = 1; this.onopen && this.onopen(); } }, 30); }
    send(d){ if(typeof d !== 'string'){ this.bytes = (this.bytes || 0) + d.byteLength; return; } const m = JSON.parse(d); __sent.push(m); this.last = m;
      if(m.type === 'Settings'){ window.__settings = m; if(!__cfg.noSettings) setTimeout(() => this.emit({type:'SettingsApplied'}), 20); }
      if(m.type === 'InjectUserMessage'){ if(__cfg.refuseInject) setTimeout(() => this.emit({type:'InjectionRefused', message:'refused'}), 20); else if(__cfg.autoReply) this.reply('Okay, nice! What next?', '[GOT] [MOOD:happy]'); }
      if(m.type === 'InjectAgentMessage' && __cfg.refuseInject) setTimeout(() => this.emit({type:'InjectionRefused', message:'refused'}), 20); }
    emit(o){ this.onmessage && this.onmessage({data: typeof o === 'string' ? o : JSON.stringify(o)}); }
    audio(sec){ const a = new Int16Array(Math.floor(24000 * (sec || .3))); for(let i = 0; i < a.length; i++) a[i] = Math.sin(i / 10) * 3000; this.onmessage({data:a.buffer}); }
    reply(text, tags, o){ o = o || {}; setTimeout(() => { this.emit({type:'AgentThinking', content:''}); this.emit({type:'ConversationText', role:'assistant', content:text}); this.emit({type:'AgentStartedSpeaking'}); this.audio(o.sec || .3);
        if(tags) this.emit({type:'FunctionCallRequest', functions:[{id:'f' + Date.now(), name:'lesson_event', arguments:JSON.stringify({tags}), client_side:true}]});
        if(!o.noDone) this.emit({type:'AgentAudioDone'}); }, o.delay || 60); }
    user(text, reply, tags, o){ this.emit({type:'UserStartedSpeaking'}); this.emit({type:'ConversationText', role:'user', content:text}); if(reply !== null) this.reply(reply, tags, o); }
    close(){ this.readyState = 3; }
    drop(code){ this.readyState = 3; this.onclose && this.onclose({code:code || 1006, reason:'mock drop'}); } };
};
exports.start = async (o = {}) => {
  const b = await chromium.launch({args:['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']});
  const ctx = await b.newContext({viewport:{width:o.w || 1180, height:o.h || 820}, permissions:['microphone']}); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PE ' + e.message)); p.on('console', m => { if(m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.route(/supabase|anthropic|cdn\.jsdelivr|unpkg/, r => r.abort());
  await p.route('**/functions/v1/ai/dgtoken', r => o.tokenHang ? null : o.tokenStatus ? r.fulfill({status:o.tokenStatus, body:'{}'}) : r.fulfill({status:200, contentType:'application/json', body:JSON.stringify({token:'jwt'})}));
  if(o.cfg) await p.addInitScript(c => { window.__initCfg = c; }, o.cfg);
  await p.addInitScript(MOCK);
  await p.goto(BASE + 'index.html#demo-kid'); await p.waitForTimeout(1300);
  await p.evaluate(async lvl => { DB.progress[WHO].onboarded = true; document.querySelectorAll('.ov').forEach(x => x.remove()); DB.kids[WHO].level = lvl; await loadContent(lvl); window.dgOn = () => true; startLesson(WHO, true); }, o.level || 8);
  await p.waitForTimeout(o.settle || 1500);
  return {b, ctx, p, errs, close: () => b.close()};
};
