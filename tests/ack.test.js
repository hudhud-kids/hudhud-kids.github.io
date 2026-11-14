// step 1: acknowledgement plays at once, varies, never repeats, and never overlaps the reply
const {open, sleep} = require('./h');
(async () => {
  for(const mode of ['ws', 'az']){
    const {b, p, errs} = await open();
    const r = await p.evaluate(async mode => {
      const ev = []; const T0 = Date.now(); const t = () => Date.now() - T0;
      const _speak = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = u => { ev.push([t(), 'ws', u.text]); setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => u.onend && u.onend(), 150); }, 10); };
      const SIL = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      if(mode === 'az'){ DB.azure = {key:'k', region:'r'}; window.azFetchNet = async (text) => { await new Promise(r => setTimeout(r, 30)); return SIL + '#' + encodeURIComponent(text); }; }
      const _play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function(){ if(!/AAAAAA=$/.test(this.src)) ev.push([t(), 'az', decodeURIComponent(this.src.split('#')[1] || '')]); return _play.call(this); };
      let n = 0; window.streamClaude = async function*(){ n++; await new Promise(r => setTimeout(r, 700)); yield 'Great answer! '; yield 'What else do you like?\n[MOOD:happy]'; };
      window.startListening = () => setState('listening');
      startLesson(WHO, true);
      await new Promise(r => setTimeout(r, 1500));
      const acks = [];
      for(let i = 0; i < 8; i++){ ev.push([t(), 'kid', 'turn' + i]); studentSaid('I like football.'); const st = L.state; await new Promise(r => setTimeout(r, 1300)); acks.push(st); }
      return {ev, acks};
    }, mode);
    // check: after each kid turn, first event is an ack (from ACKS), then the reply; no two equal acks in a row
    const ACKS = ['Mm-hm!', 'Okay!', 'Oh, nice!', 'Hmm…', 'Hmm', 'Aha!', 'I see!', 'Ooh!', 'Right!'];
    let ok = true, last = '', seq = [];
    for(let i = 0; i < r.ev.length; i++){ const e = r.ev[i]; if(e[1] !== 'kid') continue;
      const nx = r.ev[i + 1], nx2 = r.ev[i + 2]; const a = nx && ACKS.includes(nx[2]) ? nx[2] : null; seq.push(a);
      if(!a){ ok = false; console.log('no ack after', e, nx); continue; }
      if(nx[0] - e[0] > 100){ ok = false; console.log('ack late', nx[0] - e[0]); }
      if(a === last){ ok = false; console.log('repeat', a); } last = a;
      if(!nx2 || nx2[2] !== 'Great answer!'){ ok = false; console.log('reply missing', nx2); } }
    console.log(mode, ok ? 'PASS' : 'FAIL', seq.join(' | '), 'states:', r.acks.join(','), errs);
    await b.close();
  }
})();
