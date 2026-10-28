// Generates permanent learning content for 51telk with the Claude API.
// Run by the "Generate content" GitHub Action. Needs secret ANTHROPIC_API_KEY.
// Levels follow CEFR, Pearson GSE (10-90) and Cambridge English exams.
import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';

const KEY = process.env.ANTHROPIC_API_KEY;
if(!KEY){ console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }
const MODEL = process.env.MODEL || 'claude-opus-5-5';
const PRICE_IN = 4, PRICE_OUT = 20;                 // USD per million tokens (Opus 5.5)
const BUDGET = Number(process.env.BUDGET || 65);    // stop starting new work above this
const STORIES_PER_LEVEL = Number(process.env.STORIES || 30);
const DIR = path.dirname(new URL(import.meta.url).pathname);
const range = (process.env.LEVELS || '1-20').split(',').flatMap(r => { const [a,b] = r.split('-').map(Number); return Array.from({length:(b||a)-a+1}, (_,i) => a+i); });

export const LEVELS = {
 1:{cefr:'Pre-A1', gse:'10-15', exam:'Cambridge Pre A1 Starters', age:'6-8'},   2:{cefr:'Pre-A1', gse:'16-21', exam:'Cambridge Pre A1 Starters', age:'7-9'},
 3:{cefr:'A1', gse:'22-25', exam:'Cambridge A1 Movers', age:'7-9'},             4:{cefr:'A1', gse:'26-29', exam:'Cambridge A1 Movers', age:'8-10'},
 5:{cefr:'A2', gse:'30-32', exam:'Cambridge A2 Flyers', age:'9-11'},            6:{cefr:'A2', gse:'33-35', exam:'Cambridge A2 Flyers / A2 Key', age:'9-12'},
 7:{cefr:'A2+', gse:'36-42', exam:'Cambridge A2 Key for Schools', age:'10-12'},  8:{cefr:'B1', gse:'43-46', exam:'Cambridge B1 Preliminary for Schools', age:'11-13'},
 9:{cefr:'B1', gse:'47-50', exam:'Cambridge B1 Preliminary for Schools', age:'11-14'}, 10:{cefr:'B1+', gse:'51-54', exam:'B1 Preliminary (high pass)', age:'12-14'},
 11:{cefr:'B1+', gse:'55-58', exam:'B1 Preliminary / IELTS 4.5-5', age:'12-15'}, 12:{cefr:'B2', gse:'59-62', exam:'Cambridge B2 First for Schools', age:'13-15'},
 13:{cefr:'B2', gse:'63-66', exam:'Cambridge B2 First / IELTS 5.5-6', age:'13-16'}, 14:{cefr:'B2+', gse:'67-71', exam:'B2 First (grade A)', age:'14-16'},
 15:{cefr:'B2+', gse:'72-75', exam:'B2 First (grade A) / IELTS 6.5', age:'14-17'}, 16:{cefr:'C1', gse:'76-80', exam:'Cambridge C1 Advanced', age:'15-17'},
 17:{cefr:'C1', gse:'81-84', exam:'Cambridge C1 Advanced / IELTS 7-7.5', age:'15-18'}, 18:{cefr:'C2', gse:'85-87', exam:'Cambridge C2 Proficiency - academic track', age:'16-18'},
 19:{cefr:'C2', gse:'88-89', exam:'Cambridge C2 Proficiency - debate & public speaking track', age:'16-18'}, 20:{cefr:'C2', gse:'90', exam:'C2 Proficiency / IELTS 8.5-9 - mastery track', age:'16-18'}};
const L = n => LEVELS[n];
const describe = n => `level ${n} of 20: CEFR ${L(n).cefr}, Pearson GSE ${L(n).gse}, aligned with ${L(n).exam}, learners aged ${L(n).age}`;
const TOPICS = ['adventure','animals','space','football','mystery','friendship','science','desert','funny','ocean','inventions','travel','sports','robots','history','nature','cooking','music','detective','superheroes','camping','school life','family','technology','heroes of history','weather','art','time travel','environment','kindness'];

const html = fs.readFileSync(path.join(DIR, '..', 'index.html'), 'utf8');
const BUILTIN = Function(html.match(/const CURR_BUILTIN = (\{[\s\S]*?\n\});/)[1].replace(/^/, 'return '))();

let spent = 0;
const over = () => spent >= BUDGET;
async function claude(prompt, max_tokens){
  for(let attempt = 1; attempt <= 6; attempt++){
    try{
      const r = await fetch('https://api.anthropic.com/v1/messages', {method:'POST', headers:{'content-type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01'},
        body:JSON.stringify({model:MODEL, max_tokens, messages:[{role:'user', content:prompt}]})});
      if(r.status === 429 || r.status >= 500){ const w = 6000*attempt; console.log(`  retry ${r.status} in ${w/1000}s`); await new Promise(s => setTimeout(s, w)); continue; }
      if(!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0,300)}`);
      const j = await r.json();
      spent += (j.usage.input_tokens * PRICE_IN + j.usage.output_tokens * PRICE_OUT) / 1e6;
      return j.content.filter(c => c.type === 'text').map(c => c.text).join('');
    }catch(e){ if(attempt === 6) throw e; await new Promise(s => setTimeout(s, 4000*attempt)); }
  }
}
const parseJSON = (t, open = '{') => { const close = open === '{' ? '}' : ']'; return JSON.parse(t.slice(t.indexOf(open), t.lastIndexOf(close)+1)); };

const cache = {};
function load(l){ if(cache[l]) return cache[l]; const f = path.join(DIR, `L${l}.json`); const d = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f,'utf8')) : {level:l};
  Object.assign(d, {cefr:L(l).cefr, gse:L(l).gse, exam:L(l).exam}); d.stories = d.stories || []; d.quizzes = d.quizzes || {}; d.kits = d.kits || {}; return cache[l] = d; }
function store(d){ fs.writeFileSync(path.join(DIR, `L${d.level}.json`), JSON.stringify(d)); }

async function units(d){
  if(d.units) return;
  if(BUILTIN[d.level]){ d.units = BUILTIN[d.level]; store(d); return; }
  const t = await claude(`Design a professional English speaking curriculum for 51Talk-style one-to-one online classes for Saudi learners, ${describe(d.level)}.
Follow CEFR / GSE can-do descriptors for this exact band; age-appropriate and never childish; focus on conversation and sentence building, not word lists. Higher levels may cover academic discussion, debate, presentations and exam-style speaking.
Return ONLY JSON: an array of 4 units. Each unit: {"t":"English unit title","ar":"Arabic unit title","e":"one emoji","cando":"one CEFR-style can-do statement in English","lessons":[6 lessons, each an array of 3 strings: ["lesson title","conversation goal / scenario","target sentence patterns with ..."]]}`, 6000);
  const u = parseJSON(t, '['); if(!Array.isArray(u) || u.length < 3) throw new Error('bad units'); d.units = u; store(d);
}
async function quizzes(d, ui){
  const u = d.units[ui];
  const t = await claude(`Write practice quizzes for an English speaking course, ${describe(d.level)}.
Unit: "${u.t}". Lessons:
${u.lessons.map((l,i) => `${i}: "${l[0]}" - goal: ${l[1]} - patterns: ${l[2]}`).join('\n')}
For EACH lesson write 5 questions focused on sentence building:
2 of {"type":"order","words":["words","of","a","correct","sentence","in","order"],"answer":"the full sentence","ar":"short Arabic instruction"} (length right for the level, using the lesson patterns),
2 of {"type":"mc","q":"fill the gap or choose the best reply","options":["...","...","..."],"answer":index},
1 of {"type":"mc","q":"Which sentence is correct?","options":["...","...","..."],"answer":index}.
Return ONLY JSON: an array with ${u.lessons.length} arrays of 5 questions, in lesson order.`, 7000);
  const q = parseJSON(t, '['); q.forEach((arr, li) => { d.quizzes[`${ui}-${li}`] = arr; }); store(d);
}
async function kits(d, ui){
  const u = d.units[ui];
  const t = await claude(`Create lesson preparation kits for an English speaking course, ${describe(d.level)}. Learners are Arabic speakers.
Unit: "${u.t}". Lessons:
${u.lessons.map((l,i) => `${i}: "${l[0]}" - goal: ${l[1]} - patterns: ${l[2]}`).join('\n')}
For EACH lesson return {"words":[6 items {"w":"word or phrase","ar":"Arabic meaning","ex":"natural example sentence at this level"}],"dialogue":[6-8 lines {"s":"A" or "B","t":"..."}] (a natural model conversation using the lesson patterns),"grammar":{"title":"short English title","ar":"2-4 sentence clear explanation in Arabic","examples":["3 English example sentences"]}}.
Return ONLY JSON: an array with ${u.lessons.length} kits, in lesson order.`, 9000);
  const k = parseJSON(t, '['); k.forEach((kit, li) => { d.kits[`${ui}-${li}`] = kit; }); store(d);
}
async function exam(d){
  if(d.exam && d.exam.length) return;
  const t = await claude(`Write an end-of-level English test for ${describe(d.level)}, covering this curriculum:
${d.units.map(u => `${u.t}: ` + u.lessons.map(l => l[2]).join(' | ')).join('\n')}
20 questions, progressively harder, testing grammar in context, vocabulary, choosing the best reply in a conversation, and sentence building.
Use these shapes: {"type":"mc","q":"...","options":["...","...","..."],"answer":index} and {"type":"order","words":[...in correct order...],"answer":"full sentence"} (at least 5 order questions).
Return ONLY JSON: an array of 20 questions.`, 8000);
  const e = parseJSON(t, '['); if(e.length < 10) throw new Error('bad exam'); d.exam = e; store(d);
}
async function story(d, i){
  const topic = TOPICS[(i + d.level*3) % TOPICS.length];
  const len = d.level <= 2 ? '6 pages, 1-2 very short sentences per page.' : d.level <= 4 ? '6 pages, 2-3 short sentences per page.' : d.level <= 7 ? '7 pages, 2-4 sentences per page.' : d.level <= 11 ? '8 pages, 3-5 sentences per page.' : d.level <= 15 ? '9 pages, 4-6 sentences per page.' : '10 pages, 5-7 rich sentences per page.';
  const t = await claude(`Write an original, beautifully crafted graded reader in English for ${describe(d.level)}. Topic: ${topic}. Story ${i+1} of a 30-story library for this level, so make it distinct and memorable.
Exciting, age-appropriate, never babyish, with natural dialogue and a satisfying ending. Vocabulary and grammar exactly at this CEFR/GSE band (higher levels: richer narrative, idioms, varied tenses). Culturally appropriate for Saudi families.
${len}
Return ONLY JSON: {"title":"...","emoji":"one emoji","pages":[{"emoji":"2-3 emojis that illustrate the page","text":"..."}],"glossary":{"word":"Arabic meaning"},"questions":[{"q":"...","options":["...","...","..."],"answer":0}]}
glossary: 12-20 useful or harder words (lowercase, as in the text). questions: 5, mixing detail, vocabulary and inference.`, 5000);
  const s = parseJSON(t); if(!s.pages || !s.pages.length) throw new Error('bad story');
  s.id = `L${d.level}s${i+1}`; s.topic = topic; d.stories[i] = s; store(d);
}
async function placement(){
  const f = path.join(DIR, 'placement.json'); if(fs.existsSync(f)) return;
  const t = await claude(`Write an adaptive English placement test for Saudi learners aged 7-17, covering 20 levels:
${Object.entries(LEVELS).map(([n,v]) => `${n}: CEFR ${v.cefr}, GSE ${v.gse}`).join('\n')}
40 multiple-choice questions, 2 per level, from easiest to hardest, testing grammar in context, vocabulary and choosing the best reply.
Return ONLY JSON: an array of 40 objects {"level":n,"q":"...","options":["...","...","..."],"answer":index}.`, 9000);
  const q = parseJSON(t, '['); if(q.length < 20) throw new Error('bad placement'); fs.writeFileSync(f, JSON.stringify(q));
}

// ---- queue: core content first, then stories round-robin across levels so every level fills evenly
const core = [], stories = [];
core.push(() => placement().then(() => console.log('placement ready')));
for(const l of range){
  const d = load(l);
  core.push(async () => { await units(d); console.log(`L${l} units ready`);
    for(let ui = 0; ui < d.units.length; ui++){
      if(!d.quizzes[`${ui}-0`]) core.push(() => quizzes(d, ui).then(() => console.log(`L${l} quizzes u${ui+1}`)));
      if(!d.kits[`${ui}-0`]) core.push(() => kits(d, ui).then(() => console.log(`L${l} kits u${ui+1}`)));
    }
    core.push(() => exam(d).then(() => console.log(`L${l} exam ready`))); });
}
for(let i = 0; i < STORIES_PER_LEVEL; i++) for(const l of range) stories.push({l, i});

let failed = 0, active = 0, lastPush = Date.now();
function checkpoint(){ if(Date.now() - lastPush < 15*60e3 || !process.env.GITHUB_ACTIONS) return; lastPush = Date.now();
  try{ execSync('git config user.name "51telk-bot" && git config user.email "bot@users.noreply.github.com" && git add content && (git diff --cached --quiet || (git commit -qm "Generated learning content (checkpoint)" && git pull -q --rebase && git push -q))', {stdio:'inherit', shell:'/bin/bash'}); console.log('checkpoint pushed'); }catch(e){ console.error('checkpoint failed', e.message); } }
async function worker(){
  while(true){
    if(over()){ if(active === 0) break; await new Promise(r => setTimeout(r, 1000)); if(!core.length && !stories.length) break; continue; }
    let job = null;
    if(core.length) job = core.shift();
    else if(active === 0 || stories.length){ const s = stories.shift(); if(s){ const d = load(s.l); if(d.units && !d.stories[s.i]) job = () => story(d, s.i).then(() => console.log(`L${s.l} story ${s.i+1} ($${spent.toFixed(2)})`)); else continue; } }
    if(!job){ if(active === 0 && !core.length && !stories.length) break; await new Promise(r => setTimeout(r, 1000)); continue; }
    active++; try{ await job(); }catch(e){ failed++; console.error('task failed:', e.message); } active--; checkpoint();
  }
}
await Promise.all(Array.from({length:Number(process.env.CONCURRENCY || 8)}, worker));
const index = {}; for(const l of range){ const d = load(l); index[l] = {units:!!d.units, stories:d.stories.filter(Boolean).length, quizzes:Object.keys(d.quizzes).length, kits:Object.keys(d.kits).length, exam:(d.exam||[]).length}; }
fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(index, null, 1));
console.log(`done. spent ~$${spent.toFixed(2)}, failed tasks: ${failed}`);
