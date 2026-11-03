#!/usr/bin/env node
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('codex-cli test'); process.exit(0); }
if (args.includes('login')) { console.log('Logged in (test fixture)'); process.exit(0); }
if (args.includes('app-server')) {
  let pending = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    pending += chunk; const lines = pending.split('\n'); pending = lines.pop();
    for (const line of lines) {
      const message = JSON.parse(line);
      if (message.id === 1) { console.log('null'); console.log('[]'); console.log('{bad json'); console.log(JSON.stringify({id:1,result:{}})); }
      if (message.id === 2) console.log(JSON.stringify({id:2,result:{rateLimits:{limitId:'codex',primary:{usedPercent:25,windowDurationMins:300,resetsAt:2000000000},secondary:{usedPercent:40,windowDurationMins:10080,resetsAt:2000100000}}}}));
    }
  });
  await new Promise(() => {});
}
let prompt = ''; for await (const chunk of process.stdin) prompt += chunk;
const auditDir = path.dirname(args[args.indexOf('-o') + 1]);
await fs.writeFile(path.join(auditDir, 'invocation.json'), JSON.stringify(args)); await fs.writeFile(path.join(auditDir, 'received-prompt.txt'), prompt);
await fs.writeFile(path.join(auditDir, 'workspace-files.json'), JSON.stringify(await fs.readdir('.')));
if (prompt.includes('PREPARATION ONLY:')) {
  console.log(JSON.stringify({ type: 'thread.started', thread_id: randomUUID() }));
  await fs.writeFile(args[args.indexOf('-o') + 1], '{"ready":true}');
  process.exit(0);
}
const resume = args.includes('resume');
const sessionId = resume ? args[args.indexOf('resume') + 1] : randomUUID();
if (args.includes('fork') && args[args.indexOf('fork') + 1] === '11111111-1111-1111-1111-111111111111') { console.error("unrecognized subcommand 'fork'"); process.exit(2); }
if ((resume && sessionId === '00000000-0000-0000-0000-000000000000') || (args.includes('fork') && args[args.indexOf('fork') + 1] === '00000000-0000-0000-0000-000000000000')) { console.error('session not found'); process.exit(1); }
console.log(JSON.stringify({ type: 'thread.started', thread_id: sessionId }));
console.log(JSON.stringify({ type: 'item.started', item: { type: 'agent_message' } }));
const instruction = prompt.split('Current user instruction:')[1] || '';
if (instruction.includes('FAIL_TEST')) { console.error('Synthetic generation failure'); process.exit(1); }
await new Promise(r => setTimeout(r, instruction.includes('SLOW_TEST') ? 8000 : 300));
const context = JSON.parse(await fs.readFile('context.json', 'utf8'));
const recovery = prompt.includes('FULL-FILE RECOVERY:');
const result = {
  title: resume ? 'Updated unit circle' : 'Unit circle', summary: resume ? 'Updated the existing unit-circle visualization.' : 'Created an interactive unit circle.',
  mode: context.baseRevision ? 'patch' : 'complete', baseRevision: context.baseRevision, helpers: [], deletedFiles: [], edits: [],
  files: [{ path: 'index.html', content: '<!doctype html><html><body><input aria-label="Angle" type="range" min="0" max="360"><p id="angle">0</p><script type="module" src="./main.js"></script></body></html>' }, { path: 'main.js', content: 'const slider=document.querySelector("input");slider.addEventListener("input",()=>document.querySelector("#angle").textContent=slider.value);' }]
};
if (result.mode === 'patch') {
  result.files = [];
  result.edits = [{ path: 'main.js', find: 'const slider=document.querySelector("input");', replace: 'const slider=document.querySelector("input");\n// Updated visualization controls.\n' }];
}
if (instruction.includes('BAD_PATCH_TEST') && !recovery) result.edits[0].find = 'THIS_MATCH_IS_NOT_IN_THE_SOURCE';
if (recovery) {
  result.mode = 'complete'; result.edits = [];
  result.files = await Promise.all(context.source.map(async f => ({ path: f.path, content: await fs.readFile('current-source/' + f.path, 'utf8') })));
}
if (instruction.includes('BAD_JS_TEST')) { result.mode = 'complete'; result.edits = []; result.files = [{ path: 'index.html', content: '<script>san ity;</script>' }]; }
if (instruction.includes('HELPER_TEST')) {
  result.mode = 'complete'; result.helpers = ['canvas', 'controls', 'theme']; result.edits = [];
  result.files = [{ path: 'index.html', content: `<!doctype html><html><head><link rel="stylesheet" href="./vizualearner/v3/controls.css"><link rel="stylesheet" href="./vizualearner/v3/theme.css"><style>body{background:#eef2f7}canvas{width:100%;height:320px;touch-action:none}</style></head><body class="ml-theme"><canvas id="plot"></canvas><div id="controls"></div><button id="play">Play</button><button id="reset">Reset</button><output id="value">1</output><script type="module">
import {createPlot} from './vizualearner/v3/canvas.js';import {slider,animation} from './vizualearner/v3/controls.js';
let radius=1;const canvas=document.querySelector('#plot');const value=document.querySelector('#value');const plot=createPlot(canvas,{bounds:[-3,3,-3,3],draw(p){p.clear('#faf9f6');p.grid({labels:true});p.circle(0,0,radius,{stroke:'#8065a5'});p.arrow(0,0,radius,0)}});
const control=slider(document.querySelector('#controls'),{label:'Radius',min:.1,max:3,step:.1,value:1,onChange(v){radius=v;value.textContent=v;plot.redraw()}});
plot.onPointer(point=>{value.textContent=point.x.toFixed(2)});const motion=animation({duration:300,onFrame(t){radius=1+t;value.textContent=radius;plot.redraw()},onFinish(){value.textContent='done'}});document.querySelector('#play').onclick=()=>motion.play();document.querySelector('#reset').onclick=()=>{motion.reset();control.set(1,{notify:true})};
</script></body></html>` }];
}
const raw = JSON.stringify(result);
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: raw } }));
await fs.writeFile(args[args.indexOf('-o') + 1], raw);
console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1000, cached_input_tokens: 500, output_tokens: Math.ceil(raw.length / 4), reasoning_output_tokens: 10 } }));
