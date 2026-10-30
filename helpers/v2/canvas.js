export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  return Math.abs(value) < 1e-4 || Math.abs(value) >= 1e6 ? value.toExponential(digits) : Number(value.toFixed(digits)).toString();
}

export function createPlot(canvas, options = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas context is required.');
  let bounds = [...(options.bounds || [-5, 5, -5, 5])], width = 1, height = 1, sx = 1, sy = 1, ox = 0, oy = 0;
  let destroyed = false, dragging = null;
  const listeners = new Set();
  const padding = options.padding ?? 32;
  const checkBounds = value => {
    if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite) || value[0] >= value[1] || value[2] >= value[3]) throw new Error('Plot bounds must be finite and increasing.');
  };
  checkBounds(bounds);
  // Support tuple destructuring/spread and named coordinates without ambiguity.
  const point = (x, y) => Object.assign([x, y], { x, y });
  const screen = (x, y) => point(ox + x * sx, oy - y * sy);
  function resize() {
    if (destroyed) return;
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sx = Math.max(1, width - 2 * padding) / (bounds[1] - bounds[0]);
    sy = Math.max(1, height - 2 * padding) / (bounds[3] - bounds[2]);
    if (options.equalScale !== false) sx = sy = Math.min(sx, sy);
    ox = width / 2 - (bounds[0] + bounds[1]) * sx / 2;
    oy = height / 2 + (bounds[2] + bounds[3]) * sy / 2;
    plot.redraw();
  }
  const plot = {
    ctx, get width() { return width; }, get height() { return height; }, get bounds() { return [...bounds]; },
    toScreen: screen,
    toWorld(x, y) { return point((x - ox) / sx, (oy - y) / sy); },
    clear(color) { ctx.clearRect(0, 0, width, height); if (color) { ctx.fillStyle = color; ctx.fillRect(0, 0, width, height); } },
    line(points, { color = '#8065a5', width: lineWidth = 1.5, dash = [] } = {}) {
      ctx.save(); ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.setLineDash(dash);
      let started = false;
      for (const point of points) {
        if (!point || !point.every(Number.isFinite)) { started = false; continue; }
        const p = screen(...point); started ? ctx.lineTo(...p) : ctx.moveTo(...p); started = true;
      }
      ctx.stroke(); ctx.restore();
    },
    circle(x, y, radius, { fill, stroke = '#8065a5', width: lineWidth = 1.5 } = {}) {
      if (![x, y, radius].every(Number.isFinite) || radius < 0) return;
      ctx.save(); ctx.beginPath(); ctx.ellipse(...screen(x, y), radius * sx, radius * sy, 0, 0, 2 * Math.PI);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); } ctx.restore();
    },
    label(text, x, y, { color = '#596154', size = 11 } = {}) {
      if (![x, y].every(Number.isFinite)) return;
      ctx.save(); ctx.fillStyle = color; ctx.font = `${size}px system-ui,sans-serif`; ctx.fillText(String(text), ...screen(x, y)); ctx.restore();
    },
    arrow(x, y, dx, dy, { color = '#128b7d', width: lineWidth = 2 } = {}) {
      if (![x, y, dx, dy].every(Number.isFinite)) return;
      const a = screen(x, y), b = screen(x + dx, y + dy), angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const head = Math.min(8, Math.hypot(b[0] - a[0], b[1] - a[1]) * .3);
      if (head < .1) return;
      plot.line([[x, y], [x + dx, y + dy]], { color, width: lineWidth });
      ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(...b);
      ctx.lineTo(b[0] - head * Math.cos(angle - .45), b[1] - head * Math.sin(angle - .45));
      ctx.lineTo(b[0] - head * Math.cos(angle + .45), b[1] - head * Math.sin(angle + .45)); ctx.closePath(); ctx.fill(); ctx.restore();
    },
    grid({ step = 1, axes = true, labels = false, color = '#e7e4eb' } = {}) {
      if (!Number.isFinite(step) || step <= 0) throw new Error('Grid step must be positive.');
      const [xmin, xmax, ymin, ymax] = bounds;
      if ((xmax - xmin + ymax - ymin) / step > 2000) throw new Error('Grid has too many lines; choose a larger step.');
      for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) plot.line([[x, ymin], [x, ymax]], { color, width: .7 });
      for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) plot.line([[xmin, y], [xmax, y]], { color, width: .7 });
      if (axes) {
        if (ymin <= 0 && ymax >= 0) plot.line([[xmin, 0], [xmax, 0]], { color: '#a7aaa0', width: 1 });
        if (xmin <= 0 && xmax >= 0) plot.line([[0, ymin], [0, ymax]], { color: '#a7aaa0', width: 1 });
      }
      if (labels) {
        ctx.save(); ctx.fillStyle = '#8b8894'; ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (ymin <= 0 && ymax >= 0) for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) { if (Math.abs(x) > step * 1e-8) { const p = screen(x, 0); ctx.fillText(formatNumber(x), p[0], p[1] + 13); } }
        ctx.textAlign = 'right';
        if (xmin <= 0 && xmax >= 0) for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) { if (Math.abs(y) > step * 1e-8) { const p = screen(0, y); ctx.fillText(formatNumber(y), p[0] - 7, p[1]); } }
        ctx.restore();
      }
    },
    redraw() { if (!destroyed) options.draw?.(plot); },
    setBounds(value) { checkBounds(value); bounds = [...value]; resize(); },
    onPointer(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    destroy() { destroyed = true; observer.disconnect(); listeners.clear(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up); }
  };
  function notify(event) { const r = canvas.getBoundingClientRect(), [x, y] = plot.toWorld(event.clientX - r.left, event.clientY - r.top); for (const listener of listeners) listener({ x, y }, event); }
  function down(event) { if (event.button !== 0) return; dragging = event.pointerId; canvas.setPointerCapture(event.pointerId); notify(event); }
  function move(event) { if (dragging === event.pointerId) notify(event); }
  function up(event) { if (dragging === event.pointerId) dragging = null; }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  return plot;
}
