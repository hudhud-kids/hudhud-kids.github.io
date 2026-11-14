// Page-side fakes: a scripted microphone (captureAudio) and a scripted Azure Speech SDK. Evaluate this file in the page,
// then call __install() and set window.SpeechSDK = __mkSDK().
//
// A scenario (push to window.__scens; one is taken per capture) is
//   {name, speech:[[fromMs, toMs], ...],            when the mic "hears" voice, relative to the start of the capture
//    sdk:[[atMs, 'partial'|'final'|'nomatch'|'cancel', text, conf], ...],   what the recogniser answers, same clock
//    onClose:[[kind, text, conf]], closeDelay, noStop, startErr, stopAt}
// window.__connectMs = how long a NEW connection takes; a recogniser whose connection was opened in advance
// (Connection.openConnection) answers without that delay.
window.__mkSDK = () => {
  const S = {ResultReason:{RecognizedSpeech:3, NoMatch:0}, CancellationReason:{Error:1, EndOfStream:0}, PropertyId:{SpeechServiceResponse_JsonResult:'json', Speech_SegmentationSilenceTimeoutMs:'seg'}, OutputFormat:{Detailed:1}, ProfanityOption:{Masked:0}};
  const cfg = o => Object.assign(o, {props:{}, setProperty(k, v){ this.props[k] = v; }, setProfanity(){}});
  S.SpeechConfig = {fromAuthorizationToken:(t, r) => cfg({tok:t, region:r}), fromSubscription:(k, r) => cfg({key:k, region:r})};
  S.AudioStreamFormat = {getWaveFormatPCM:(a, b, c) => ({a, b, c})};
  S.AudioInputStream = {createPushStream:f => ({f, bytes:0, closed:false, write(b){ this.bytes += b.byteLength; }, close(){ if(this.closed) return; this.closed = true; this.onclose && this.onclose(); }})};
  S.AudioConfig = {fromStreamInput:p => ({push:p})};
  S.PhraseListGrammar = {fromRecognizer:r => ({addPhrase(x){ r.phrases.push(x); }})};
  S.Connection = {fromRecognizer:r => ({openConnection(ok){ r.openedAt = Date.now(); (window.__opens = window.__opens || []).push(r.openedAt); setTimeout(() => { this.connected && this.connected(); ok && ok(); }, window.__connectMs || 0); }, closeConnection(){}})};
  S.SpeechRecognizer = class {
    constructor(c, ac){ this.cfg = c; this.push = ac.push; this.phrases = []; this.tm = []; this.closed = false; this.started = false; this.madeAt = Date.now(); (window.__recs = window.__recs || []).push(this); }
    startContinuousRecognitionAsync(ok, err){ const sc = this.sc = window.__cur || {}, t0 = sc.t0 || Date.now(); this.started = true; this.startedAt = Date.now(); this.scen = sc.name;
      if(sc.startErr){ setTimeout(() => err && err('boom'), 50); return; }
      // a connection that is not open yet delays every answer
      const cm = window.__connectMs || 0, lag = this.openedAt ? Math.max(0, cm - (Date.now() - this.openedAt)) : cm; this.lag = lag;
      // answers to audio from before this recogniser started never come (a recogniser replaced mid-capture starts clean)
      (sc.sdk || []).forEach(([t, kind, text, conf]) => { if(t < Date.now() - t0 - 80) return; this.tm.push(setTimeout(() => this.ev(kind, text, conf), Math.max(0, t - (Date.now() - t0)) + lag)); });
      const onClose = () => this.tm.push(setTimeout(() => { (sc.onClose || []).forEach(([kind, text, conf]) => this.ev(kind, text, conf)); if(!sc.noStop) this.ev('stopped'); }, (sc.closeDelay == null ? 150 : sc.closeDelay) + lag));
      if(this.push.closed) onClose(); else this.push.onclose = onClose;
      ok && ok(); }
    ev(kind, text, conf){ if(this.closed) return;
      if(kind === 'partial') this.recognizing && this.recognizing(this, {result:{text}});
      else if(kind === 'final') this.recognized && this.recognized(this, {result:{reason:3, text, properties:{getProperty:() => JSON.stringify({NBest:[{Confidence:conf == null ? .9 : conf}]})}}});
      else if(kind === 'nomatch') this.recognized && this.recognized(this, {result:{reason:0, text:''}});
      else if(kind === 'cancel') this.canceled && this.canceled(this, {reason:1, errorCode:'ConnectionFailure', errorDetails:'socket closed'});
      else if(kind === 'stopped') this.sessionStopped && this.sessionStopped(this, {}); }
    stopContinuousRecognitionAsync(ok){ this.tm.forEach(clearTimeout); ok && ok(); }
    close(){ this.closed = true; this.tm.forEach(clearTimeout); }
  };
  return S;
};
// the recogniser that served a scenario (recognisers are now also built ahead of time, so "the last one" is not it)
window.__recOf = name => (window.__recs || []).filter(r => r.scen === name).pop() || null;
window.__install = () => {
  window.__scens = []; window.__log = []; window.__recs = []; window.__opens = [];
  const T = () => Date.now();
  window.captureAudio = o => new Promise(res => {
    const sc = window.__scens.shift() || {speech:[]}; sc.t0 = T(); window.__cur = sc; window.__log.push([T(), 'capture', sc.name || '']);
    let heard = false, quiet = 0, done = false, frames = 0, waited = 0; const dt = 4096 / 48000;
    const finish = manual => { if(done) return; done = true; clearInterval(iv); const h = heard || (manual && sc.speech.length > 0);
      window.__log.push([T(), 'capEnd', sc.name || '', manual ? 'manual' : 'auto']); res({heard:h, wav:h ? new Blob(['fake']) : null, frames, quiet:heard ? quiet : 0}); };
    if(o && o.ctl){ o.ctl.stop = () => finish(true); if(o.ctl.pending) setTimeout(() => finish(true), 0);
      o.ctl.rearm = () => { if(done) return; heard = false; quiet = 0; waited = 0; window.__log.push([T(), 'rearm', sc.name || '']); }; }
    const iv = setInterval(() => { const t = T() - sc.t0; frames++;
      const speaking = sc.speech.some(([a, b]) => t >= a && t < b);
      if(!heard){ if(speaking){ heard = true; window.__log.push([T(), 'heard', sc.name || '']); o.onSpeech && o.onSpeech(); } else { if(!(o.ctl && o.ctl.hold)) waited += dt; if(o.waitMs && waited * 1000 > o.waitMs) finish(false); return; } }
      o.onFrame && o.onFrame(new Float32Array(4096).map(() => Math.random() * .1 - .05), 48000);
      if(speaking) quiet = 0; else quiet += dt;
      if(o.shouldEnd ? o.shouldEnd(quiet) : quiet > o.silence) finish(false);
      if(sc.stopAt && t > sc.stopAt) finish(true);
    }, 4096 / 48);
  });
  const _said = window.studentSaid; window.studentSaid = t => { window.__log.push([T(), 'said', t, (window.__cur || {}).name, (window.__cur || {}).t0]); _said(t); };
  const _note = window.youNote; window.youNote = (m, typ) => { window.__log.push([T(), 'note', m, !!typ]); _note(m, typ); };
};
