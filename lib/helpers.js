import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const assets = { canvas: ['canvas.js'], controls: ['controls.js', 'controls.css'], theme: ['theme.css'] };
export async function helperFiles(selected = []) {
  if (!Array.isArray(selected) || selected.length > 3 || selected.some(s => !Object.hasOwn(assets, s))) throw new Error('Unknown optional plotting helper.');
  const names = [...new Set(selected.flatMap(s => assets[s]))];
  return Promise.all(names.map(async name => ({ path: `vizualearner/v3/${name}`, content: await fs.readFile(fileURLToPath(new URL(`../helpers/v3/${name}`, import.meta.url)), 'utf8') })));
}
export async function includeHelpers(result, baseline = [], complete = false) {
  const helpers = await helperFiles(result.helpers || []);
  const files = [...result.files];
  // Complete-code fallbacks must not accidentally drop already-vendored modules.
  if (complete) for (const file of baseline) {
    if (/^[^/]+\/v\d+\/(canvas\.js|controls\.js|controls\.css|theme\.css)$/.test(file.path) && !files.some(f => f.path === file.path)) files.push(file);
  }
  for (const helper of helpers) {
    const existing = files.find(f => f.path === helper.path);
    if (existing && existing.content !== helper.content) throw new Error('Optional helper paths are versioned and cannot be overwritten. Use a different path for custom code.');
    if (!existing) files.push(helper);
  }
  return { ...result, files };
}
export const helperDocs = `Optional vizualearner helpers v3 (use only if useful; no framework or topic is required).
Request helpers:["canvas"] and/or helpers:["controls"] in your response. The server vendors their source into the saved project; do not return these files yourself.
Canvas palette: import palette for background, surface, foreground, muted, accent, secondary, grid and axis colors. The same object is available as plot.palette. Use these colors for custom Canvas, SVG, WebGL and chart-library styles.
Canvas module: import {createPlot, clamp, formatNumber, palette} from './vizualearner/v3/canvas.js'.
createPlot(canvas,{bounds:[xmin,xmax,ymin,ymax],padding:32,equalScale:true,draw(plot){...}}) automatically handles device pixel ratio and responsive resizing. Give the canvas/container an explicit CSS height. It returns {ctx,width,height,bounds,toScreen(x,y),toWorld(px,py),clear(),grid({step:1,axes:true}),line(points,{color,width,dash}),circle(x,y,radiusInWorldUnits,{fill,stroke,width}),arrow(x,y,dx,dy,{color,width}),label(text,x,y,{color,size}),redraw(),setBounds(bounds),onPointer((point,event)=>{...}),destroy()}. toScreen and toWorld return [x,y] arrays with matching .x and .y properties (both forms work). Points are world coordinates; arrow dx/dy are world units; y increases upwards. clear/grid are not called automatically. draw is called on creation/resizing and redraw(). Drawing is clipped to the canvas, not the world bounds. onPointer runs for pointerdown and dragging and provides {x,y}; keyboard handling is up to your visualization. Numerical algorithms, domains and valid parameter ranges are your responsibility.
Controls module: import {slider,animation} from './vizualearner/v3/controls.js'; optionally link './vizualearner/v3/controls.css'.
slider(container,{label,min,max,step,value,onChange(value)}) adds an accessible linked range and number input. Returns {element,range,input,get value(),set(value,{notify:false}),destroy()}. Invalid/nonfinite input is ignored; values clamp to min/max.
animation({duration:1000,onFrame(progress),onFinish()}) returns {play(),pause(),reset(),get playing(),get progress(),destroy()}. Progress is 0..1 and pause/resume retains position. Respect reduced motion in your UI when deciding whether to animate.
Helpers are small browser-native modules; do not fetch them with XHR. They can be used with any other browser libraries, or ignored completely.
Theme helper: request helpers:["theme"] and link './vizualearner/v3/theme.css'. Optional CSS classes ml-theme (body), ml-page, ml-header, ml-eyebrow, ml-grid (plot plus sidebar, stacks on mobile), ml-row (responsive equal cards), ml-card, ml-canvas (420px responsive canvas), ml-controls, ml-actions, ml-value, ml-muted, ml-badge plus good/bad, and primary on buttons. These are style utilities, not a required layout or mathematical template. Compose or override them freely.
`;

export const helperQuickStart = `Avoid regenerating plotting/style boilerplate. These prewritten helpers are already available and cost no output tokens for their source. They are optional; pick the best technology for the mathematics.
For a Canvas visualization, prefer importing the existing grid/axes/arrows/resize code rather than reimplementing it:
  import {createPlot, palette} from './vizualearner/v3/canvas.js';
  const view=createPlot(canvas,{bounds:[-5,5,-5,5],draw(p){p.clear('#f9fbfd');p.grid({step:1,labels:true});p.line(points,{color:'#00678b'});p.arrow(x,y,dx,dy,{color:'#178577'});}});
draw receives p as an argument (do not reference view before assignment). p.ctx gives full Canvas access. p.toScreen(x,y) and p.toWorld(px,py) return arrays with .x/.y aliases; p.circle(x,y,worldRadius,{fill,stroke}), p.label(text,x,y), p.setBounds(bounds), p.redraw() and p.onPointer(({x,y},event)=>...) are provided. Set an explicit CSS canvas height. Equal axis scaling is default; pass equalScale:false for independent scaling.
For controls: import {slider,animation} from './vizualearner/v3/controls.js'; slider(container,{label:'Parameter',min:0,max:5,step:.1,value:1,onChange(v){...}}) provides linked numeric/range inputs. animation({duration:1000,onFrame(t){...},onFinish(){...}}) provides play/pause/reset, with t in [0,1].
Use helpers:["canvas","controls","theme"] to vendor those assets, and link './vizualearner/v3/controls.css' and './vizualearner/v3/theme.css'. The optional theme supplies readable typography, responsive ml-grid/ml-row layouts, ml-card, ml-header, ml-page, ml-canvas, ml-value, ml-badge, ml-actions and primary buttons under body.ml-theme. Use these instead of lengthy custom CSS when suitable, or override/ignore them. Full API is in helper-docs.md. Return only YOUR mathematical/interaction code, not helper sources. Do not reduce mathematical content or omit controls to shorten output.`;
