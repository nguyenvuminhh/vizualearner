export function slider(container, { label, min, max, step = 1, value = min, onChange } = {}) {
  if (![min, max, step, value].every(Number.isFinite) || min >= max || step <= 0) throw new Error('Slider needs finite bounds, a positive step, and a finite value.');
  const element = document.createElement('label'); element.className = 'vizualearner-slider';
  const text = document.createElement('span'); text.textContent = label;
  const range = document.createElement('input'), input = document.createElement('input');
  range.type = 'range'; input.type = 'number';
  for (const control of [range, input]) { control.min = min; control.max = max; control.step = step; control.setAttribute('aria-label', label); }
  element.append(text, input, range); container.append(element);
  let current = Math.max(min, Math.min(max, value));
  function set(next, { notify = false } = {}) {
    if (!Number.isFinite(next)) return;
    // Use the range's native step normalization for synchronized numerical values.
    range.value = Math.max(min, Math.min(max, next)); current = range.valueAsNumber; input.value = current;
    if (notify) onChange?.(current);
  }
  const change = event => set(event.target.valueAsNumber, { notify: true });
  const blur = () => set(current);
  range.addEventListener('input', change); input.addEventListener('input', change); input.addEventListener('blur', blur); set(value);
  return { element, range, input, get value() { return current; }, set, destroy() { range.removeEventListener('input', change); input.removeEventListener('input', change); input.removeEventListener('blur', blur); element.remove(); } };
}

export function animation({ duration = 1000, onFrame, onFinish } = {}) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Animation duration must be positive.');
  let progress = 0, playing = false, handle = null, start = 0, destroyed = false;
  function tick(time) {
    if (!playing || destroyed) return;
    progress = Math.min(1, (time - start) / duration); onFrame?.(progress);
    if (progress >= 1) { playing = false; handle = null; onFinish?.(); }
    else if (playing) handle = requestAnimationFrame(tick);
  }
  function pause() {
    if (playing) progress = Math.min(1, (performance.now() - start) / duration);
    playing = false; cancelAnimationFrame(handle); handle = null;
  }
  return {
    get playing() { return playing; }, get progress() { return progress; },
    play() { if (destroyed || playing) return; if (progress >= 1) progress = 0; start = performance.now() - progress * duration; playing = true; handle = requestAnimationFrame(tick); },
    pause,
    reset() { pause(); progress = 0; onFrame?.(0); },
    destroy() { pause(); destroyed = true; }
  };
}
