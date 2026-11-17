// Voice engine (Deepgram) tests: a mocked Voice Agent socket drives the real page (start, tags, refusals, silence,
// reconnects, background mic, timing rules, taps) plus the relay's stream/tidy functions. Written by the independent QA pass.
const cp = require('child_process'), path = require('path'), D = path.join(__dirname, 'dg');
const files = ['t1_dg_basic.js', 't2_dg_failures.js', 't4_steps.js', 't6_startup.js', 't8_cues.js', 't12_taps.js', 't7_finish.js'];
let bad = 0;
for(const f of files){
  const r = cp.spawnSync(process.execPath, [path.join(D, f)], {env:process.env, encoding:'utf8', timeout:400000});
  const lines = (r.stdout + r.stderr).split('\n').filter(l => /^(PASS|FAIL|ERROR)/.test(l));
  lines.forEach(l => console.log(l.replace(/^(PASS|FAIL)/, `$1 [${f}]`)));
  if(r.status || lines.some(l => /^(FAIL|ERROR)/.test(l))) bad++;
}
try{ cp.execFileSync(path.join(D, 'gen_relay_fns.sh')); const out = cp.execFileSync(process.env.BUN || (require('fs').existsSync('/root/.bun/bin/bun') ? '/root/.bun/bin/bun' : 'bun'), ['run', path.join(D, 'relay.ts')], {encoding:'utf8'});
  out.split('\n').filter(l => /^(PASS|FAIL)/.test(l)).forEach(l => console.log(l.replace(/^(PASS|FAIL)/, '$1 [relay]')));
  if(/RELAY FAILS: [1-9]/.test(out) || /^FAIL/m.test(out)) bad++;
}catch(e){ console.log('FAIL [relay] ' + String(e.message).slice(0, 200)); bad++; }
process.exit(bad ? 1 : 0);
