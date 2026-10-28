// Generates permanent learning content for 51telk with the Claude API.
// Run by the "Generate content" GitHub Action. Needs secret ANTHROPIC_API_KEY.
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.ANTHROPIC_API_KEY;
if(!KEY){ console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }
const MODEL = process.env.MODEL || 'claude-opus-5-5';
const STORIES_PER_LEVEL = Number(process.env.STORIES || 15);
const DIR = path.dirname(new URL(import.meta.url).pathname);
const range = (process.env.LEVELS || '1-20').split(',').flatMap(r => { const [a,b] = r.split('-').map(Number); return Array.from({length:(b||a)-a+1}, (_,i) => a+i); });

const CEFR = {1:'Pre-A1',2:'A1',3:'A1',4:'A1+',5:'A2',6:'A2',7:'A2+',8:'B1',9:'B1+',10:'B1+',11:'B2',12:'B2',13:'B2+',14:'B2+',15:'C1',16:'C1',17:'C1+',18:'C1+',19:'C2',20:'C2'};
const AGE = l => l <= 4 ? '7-9' : l <= 7 ? '9-11' : l <= 10 ? '11-13' : l <= 14 ? '13-15' : '15-17';
const TOPICS = ['adventure','animals','space','football','mystery','friendship','science','desert','funny','ocean','inventions','travel','sports day','robots','history','nature','cooking','music','detective','superheroes'];

// the hand-written curriculum for levels 5-9 lives in index.html
const html = fs.readFileSync(path.join(DIR, '..', 'index.html'), 'utf8');
const BUILTIN = Function(html.match(/const CURR_BUILTIN = (\{[\s\S]*?\n\});/)[1].replace(/^/, 'return ') )();

async function claude(prompt, max_tokens){
  for(let attempt = 1; attempt <= 6; attempt++){
    try{
      const r = await fetch('https://api.anthropic.com/v1/messages', {method:'POST', headers:{'content-type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01'},
        body:JSON.stringify({model:MODEL, max_tokens, messages:[{role:'user', content:prompt}]})});
      if(r.status === 429 || r.status >= 500){ const w = 5000*attempt; console.log(`  retry ${r.status} in ${w/1000}s`); await new Promise(s => setTimeout(s, w)); continue; }
      if(!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0,300)}`);
      const j = await r.json(); return j.content.filter(c => c.type === 'text').map(c => c.text).join('');
    }catch(e){ if(attempt === 6) throw e; await new Promise(s => setTimeout(s, 4000*attempt)); }
  }
}
const parseJSON = (t, open = '{') => { const close = open === '{' ? '}' : ']'; return JSON.parse(t.slice(t.indexOf(open), t.lastIndexOf(close)+1)); };

function load(l){ const f = path.join(DIR, `L${l}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f,'utf8')) : {level:l, cefr:CEFR[l], units:null, stories:[], quizzes:{}}; }
function store(d){ fs.writeFileSync(path.join(DIR, `L${d.level}.json`), JSON.stringify(d)); }

async function units(d){
  if(d.units) return;
  if(BUILTIN[d.level]){ d.units = BUILTIN[d.level]; store(d); return; }
  const t = await claude(`Design an English speaking curriculum for 51Talk-style one-to-one online classes for Saudi learners aged ${AGE(d.level)}.
Level ${d.level} of 20 (CEFR ${CEFR[d.level]}). Age-appropriate and never childish for this level. Focus on conversation and sentence building, not word lists.
Return ONLY JSON: an array of 4 units. Each unit: {"t":"English unit title","ar":"Arabic unit title","e":"one emoji","lessons":[6 lessons, each an array of 3 strings: ["lesson title","conversation goal / scenario","target sentence patterns with ..."]]}`, 6000);
  const u = parseJSON(t, '['); if(!Array.isArray(u) || u.length < 3) throw new Error('bad units'); d.units = u; store(d);
}
async function story(d, i){
  const topic = TOPICS[i % TOPICS.length];
  const t = await claude(`Write an original illustrated graded reader in English for Saudi learners aged ${AGE(d.level)} at CEFR ${CEFR[d.level]} (level ${d.level} of 20). Topic: ${topic}.
Exciting, age-appropriate, never babyish, with natural dialogue; vocabulary and grammar exactly at this level. Culturally appropriate for Saudi families.
${d.level <= 4 ? '6 pages, 1-3 short sentences per page.' : d.level <= 7 ? '7 pages, 2-4 sentences per page.' : d.level <= 12 ? '8 pages, 3-5 sentences per page.' : '9 pages, 4-6 sentences per page.'}
Return ONLY JSON: {"title":"...","emoji":"one emoji","pages":[{"emoji":"2-3 emojis that illustrate the page","text":"..."}],"glossary":{"word":"Arabic meaning"},"questions":[{"q":"...","options":["...","...","..."],"answer":0}]}
glossary: 12-18 useful or harder words (lowercase, as in the text). questions: 5, mixing detail, vocabulary and inference.`, 4500);
  const s = parseJSON(t); if(!s.pages || !s.pages.length) throw new Error('bad story');
  s.id = `L${d.level}s${i+1}`; s.topic = topic; d.stories[i] = s; store(d);
}
async function quizzes(d, ui){
  const u = d.units[ui];
  const t = await claude(`Write practice quizzes for an English speaking course, level ${d.level} of 20 (CEFR ${CEFR[d.level]}), learners aged ${AGE(d.level)}.
Unit: "${u.t}". Lessons:
${u.lessons.map((l,i) => `${i}: "${l[0]}" - goal: ${l[1]} - patterns: ${l[2]}`).join('\n')}
For EACH lesson write 5 questions focused on sentence building:
2 of {"type":"order","words":["words","of","a","correct","sentence","in","order"],"answer":"the full sentence","ar":"short Arabic instruction"} (5-10 words, using the lesson patterns),
2 of {"type":"mc","q":"fill the gap or choose the best reply","options":["...","...","..."],"answer":index},
1 of {"type":"mc","q":"Which sentence is correct?","options":["...","...","..."],"answer":index}.
Return ONLY JSON: an array with ${u.lessons.length} arrays of 5 questions, in lesson order.`, 7000);
  const q = parseJSON(t, '['); q.forEach((arr, li) => { d.quizzes[`${ui}-${li}`] = arr; }); store(d);
}

const tasks = [];
for(const l of range){
  const d = load(l);
  tasks.push(async () => { await units(d);
    for(let ui = 0; ui < d.units.length; ui++) if(!d.quizzes[`${ui}-0`]) tasks.push(() => quizzes(d, ui).then(() => console.log(`L${l} quizzes unit ${ui+1}`)));
    for(let i = 0; i < STORIES_PER_LEVEL; i++) if(!d.stories[i]) tasks.push(() => story(d, i).then(() => console.log(`L${l} story ${i+1}`)));
    console.log(`L${l} units ready`); });
}
let failed = 0, active = 0;
async function worker(){ while(true){ if(tasks.length){ const t = tasks.shift(); active++; try{ await t(); }catch(e){ failed++; console.error('task failed:', e.message); } active--; } else if(active === 0) break; else await new Promise(r => setTimeout(r, 1000)); } }
await Promise.all(Array.from({length:Number(process.env.CONCURRENCY || 5)}, worker));
// index of what exists, for the app
const index = {}; for(const l of range){ const d = load(l); index[l] = {units:!!d.units, stories:d.stories.filter(Boolean).length, quizzes:Object.keys(d.quizzes).length}; }
fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(index, null, 1));
console.log('done, failed tasks:', failed);
