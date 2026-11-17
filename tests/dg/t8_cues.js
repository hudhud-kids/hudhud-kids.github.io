// How often do ordinary teacher sentences trip v2Follow (the slide jumps without [NEXT])?
const {start, check, info, sleep} = require('./lib');
(async () => { const t = await start(); const {p} = t; await p.evaluate(() => { __cfg.autoReply = false; });
  const S = [
   ['exp', 'Great! Here is a fun fact: hoopoes love the desert. Now say: I am convinced that it is true.'],
   ['exp', 'That was the last question for this word. Now the next one: say I am sure that it is good.'],
   ['exp', 'Last question in this round: which one means I am completely sure?'],
   ['exp', 'You are doing great. Final question for this game: can you use the word in a sentence?'],
   ['exp', 'Let us play a game. I am Sam and you are Reem. Hello Reem!'],
   ['exp', 'Nice sentence! In my culture we say that too. Now you try.'],
   ['warm', 'Tell me about your weekend. What did you do?'],
   ['warm', 'It is your turn to speak! What is your favourite food?'],
   ['dlg', 'I am Omar and you are Faisal. Hi Faisal, what do you think about school radio?'],
   ['so', 'Last question: why do you think so? Use because.'],
   ['so', 'Here is a fun fact about your idea: many students agree.'],
   ['so', 'Now, speak out: tell me one reason.'],
   ['dlg', 'Great role play! Now two quick questions.'] ];
  const res = []; for(const [k, text] of S){ const r = await p.evaluate(([k, text]) => { const v = L.v2; v.doneAll = false; v.i = v.steps.findIndex(s => s.k === k); const from = v.steps[v.i].k + (v.steps[v.i].part || v.steps[v.i].i || ''); v2Follow(text); const to = v.steps[v.i]; return {from, to:to.k + (to.part || to.i || ''), jumped:v.i - v.steps.findIndex(s => s.k === k)}; }, [k, text]); res.push({text:text.slice(0, 70), ...r}); }
  res.forEach(r => console.log(r.jumped ? 'JUMP' : 'ok  ', r.from, '->', r.to, '|', r.text));
  const wrong = res.filter(r => r.jumped);
  check('ordinary sentences do not move the slide', wrong.length === 0, wrong.length + ' of ' + res.length + ' jump');
  // safety net with state listening
  await p.evaluate(() => { const v = L.v2; v.i = 2; v.at = Date.now() - 20 * 60e3; v.idleAt = Date.now() - 60e3; L.state = 'listening'; L.listenStart = Date.now() - 40e3; L.talking = false; if(L.dg) L.dg.nudges = 3; });
  await sleep(4000); const s = await p.evaluate(() => L.v2.i);
  check('tickRoom safety net advances a step that is 20 min over time while the room waits for the child', s !== 2, {step:s, why:'busy includes state "listening", which is the normal waiting state in voice mode'});
  await t.close(); })();
