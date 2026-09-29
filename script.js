const CONSTANTS = { pi: Math.PI, e: Math.E };

const FUNCTIONS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  ln: Math.log, log: Math.log10, exp: Math.exp,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
};

const OPS = {
  '+': { prec: 1, assoc: 'L' },
  '-': { prec: 1, assoc: 'L' },
  '*': { prec: 2, assoc: 'L' },
  '/': { prec: 2, assoc: 'L' },
  '%': { prec: 2, assoc: 'L' },
  'u-': { prec: 3, assoc: 'R' },
  'u+': { prec: 3, assoc: 'R' },
  '^': { prec: 4, assoc: 'R' },
};

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }

    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const num = src.slice(i, j);
      if ((num.match(/\./g) || []).length > 1) throw new Error('bad number');
      tokens.push({ type: 'num', value: parseFloat(num) });
      i = j;
      continue;
    }

    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9]/.test(src[j])) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j) });
      i = j;
      continue;
    }

    if ('+-*/^%(),'.includes(c)) {
      tokens.push({ type: c === '(' || c === ')' || c === ',' ? c : 'op', value: c });
      i++;
      continue;
    }

    throw new Error(`unexpected character "${c}"`);
  }
  return tokens;
}

function toRPN(tokens) {
  const output = [];
  const stack = [];
  let prev = null;

  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];

    const prevEndsValue = prev && (prev.type === 'num' || prev.type === 'ident' || prev.type === ')');
    const thisStartsValue = t.type === 'num' || t.type === 'ident' || t.type === '(';
    if (prevEndsValue && thisStartsValue) {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top === '(' || String(top).startsWith('fn:')) break;
        if (OPS[top].prec >= OPS['*'].prec) output.push(stack.pop());
        else break;
      }
      stack.push('*');
    }

    if (t.type === 'num') {
      output.push(t);
    } else if (t.type === 'ident') {
      const next = tokens[idx + 1];
      if (next && next.type === '(' && (FUNCTIONS[t.value] !== undefined)) {
        stack.push('fn:' + t.value);
        prev = { type: 'fnname' };
        continue;
      } else {
        output.push(t);
      }
    } else if (t.type === '(') {
      stack.push('(');
    } else if (t.type === ')') {
      while (stack.length && stack[stack.length - 1] !== '(') output.push(stack.pop());
      if (!stack.length) throw new Error('mismatched parentheses');
      stack.pop();
      if (stack.length && String(stack[stack.length - 1]).startsWith('fn:')) {
        output.push({ type: 'call', value: stack.pop().slice(3) });
      }
    } else if (t.type === ',') {
      while (stack.length && stack[stack.length - 1] !== '(') output.push(stack.pop());
    } else if (t.type === 'op') {
      let opName = t.value;
      const isUnary = (opName === '+' || opName === '-') &&
        (prev === null || prev.type === 'op' || prev === '(' || prev.type === ',');
      if (isUnary) opName = 'u' + opName;

      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top === '(' || String(top).startsWith('fn:')) break;
        const topDef = OPS[top];
        const curDef = OPS[opName];
        if (topDef.prec > curDef.prec || (topDef.prec === curDef.prec && curDef.assoc === 'L')) {
          output.push(stack.pop());
        } else break;
      }
      stack.push(opName);
    }

    prev = t.type === 'op' ? t : (t.type === '(' ? '(' : (t.type === ')' ? ')' : t));
  }

  while (stack.length) {
    const top = stack.pop();
    if (top === '(') throw new Error('mismatched parentheses');
    output.push(top);
  }
  return output;
}

function evalRPN(rpn, vars) {
  const stack = [];
  for (const t of rpn) {
    if (typeof t === 'string') {
      if (t.startsWith('u')) {
        if (stack.length < 1) throw new Error('malformed expression');
        const a = stack.pop();
        stack.push(t === 'u-' ? -a : a);
      } else {
        if (stack.length < 2) throw new Error('malformed expression');
        const b = stack.pop(), a = stack.pop();
        switch (t) {
          case '+': stack.push(a + b); break;
          case '-': stack.push(a - b); break;
          case '*': stack.push(a * b); break;
          case '/': stack.push(a / b); break;
          case '%': stack.push(a % b); break;
          case '^': stack.push(Math.pow(a, b)); break;
          default: throw new Error('unknown operator ' + t);
        }
      }
    } else if (t.type === 'num') {
      stack.push(t.value);
    } else if (t.type === 'ident') {
      if (t.value in vars) stack.push(vars[t.value]);
      else if (t.value in CONSTANTS) stack.push(CONSTANTS[t.value]);
      else throw new Error(`unknown identifier "${t.value}"`);
    } else if (t.type === 'call') {
      const a = stack.pop();
      const fn = FUNCTIONS[t.value];
      if (!fn) throw new Error(`unknown function "${t.value}"`);
      stack.push(fn(a));
    }
  }
  if (stack.length !== 1) throw new Error('malformed expression');
  return stack[0];
}

function compileExpression(src, varName) {
  varName = varName || 'x';
  if (!src || !src.trim()) throw new Error('empty expression');
  const rpn = toRPN(tokenize(src));
  evalRPN(rpn, { [varName]: 1 }); 
  return (v) => evalRPN(rpn, { [varName]: v });
}

function compileImplicit(src) {
  if (!src || !src.trim()) throw new Error('empty expression');
  const eqPos = src.indexOf('=');
  const leftStr = eqPos === -1 ? src : src.slice(0, eqPos);
  const rightStr = eqPos === -1 ? '0' : src.slice(eqPos + 1);

  const leftRPN = toRPN(tokenize(leftStr));
  const rightRPN = toRPN(tokenize(rightStr));

  evalRPN(leftRPN, { x: 1, y: 1 });
  evalRPN(rightRPN, { x: 1, y: 1 });

  return (x, y) => evalRPN(leftRPN, { x, y }) - evalRPN(rightRPN, { x, y });
}

const view = { scale: 60, panX: 0, panY: 0 };

function worldToScreen(x, y, cx, cy) {
  return { x: cx + view.panX + x * view.scale, y: cy + view.panY - y * view.scale };
}
function screenToWorld(sx, sy, cx, cy) {
  return { x: (sx - cx - view.panX) / view.scale, y: -(sy - cy - view.panY) / view.scale };
}

function niceStep(targetPx) {
  const targetUnits = targetPx / view.scale;
  const pow10 = Math.pow(10, Math.floor(Math.log10(targetUnits)));
  const candidates = [1, 2, 5, 10];
  let best = candidates[0] * pow10;
  for (const c of candidates) {
    const step = c * pow10;
    if (Math.abs(step - targetUnits) < Math.abs(best - targetUnits)) best = step;
  }
  return best;
}

function formatTick(v, step) {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + (step < 1 ? 0 : 0));
  let s = v.toFixed(Math.min(decimals + 2, 6));
  s = s.replace(/\.?0+$/, '');
  return s === '' || s === '-' ? '0' : s;
}

const PALETTE = ['#E8A33D', '#4FB8AF', '#D8637B', '#8C7AE6', '#9CCB6E', '#5EA8D8'];
let colorCursor = 0;
const nextColor = () => PALETTE[colorCursor++ % PALETTE.length];

let fnIdCounter = 0;
const functions = [];

function addFunction(expr, colorOverride, mode) {
  const entry = {
    id: ++fnIdCounter,
    expr,
    mode: mode === 'x' ? 'x' : mode === 'eq' ? 'eq' : 'y',
    color: colorOverride || nextColor(),
    visible: true,
    compiled: null,
    error: null,
  };
  recompile(entry);
  functions.push(entry);
  renderFnList();
  draw();
}

function recompile(entry) {
  try {
    if (entry.mode === 'eq') {
      entry.compiled = compileImplicit(entry.expr);
    } else {
      entry.compiled = compileExpression(entry.expr, entry.mode === 'x' ? 'y' : 'x');
    }
    entry.error = null;
  } catch (err) {
    entry.compiled = null;
    entry.error = err.message;
  }
}

function removeFunction(id) {
  const i = functions.findIndex(f => f.id === id);
  if (i !== -1) functions.splice(i, 1);
  renderFnList();
  draw();
}

const canvas = document.getElementById('graph');
const ctx = canvas.getContext('2d');
let cssWidth = 0, cssHeight = 0;

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cssWidth = rect.width;
  cssHeight = rect.height;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function drawGrid(cx, cy) {
  const step = niceStep(70);
  const majorEvery = 5;

  ctx.lineWidth = 1;
  ctx.font = '11px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'top';

  const worldLeft = screenToWorld(0, 0, cx, cy).x;
  const worldRight = screenToWorld(cssWidth, 0, cx, cy).x;
  const worldTop = screenToWorld(0, 0, cx, cy).y;
  const worldBottom = screenToWorld(0, cssHeight, cx, cy).y;

  const startI = Math.floor(worldLeft / step);
  const endI = Math.ceil(worldRight / step);
  for (let i = startI; i <= endI; i++) {
    const xVal = i * step;
    const { x: sx } = worldToScreen(xVal, 0, cx, cy);
    const isMajor = i % majorEvery === 0;
    ctx.strokeStyle = isMajor ? '#2e3941' : '#1c242b';
    ctx.beginPath(); ctx.moveTo(sx + 0.5, 0); ctx.lineTo(sx + 0.5, cssHeight); ctx.stroke();
    if (isMajor && Math.abs(xVal) > step / 100) {
      ctx.fillStyle = '#55636d';
      ctx.fillText(formatTick(xVal, step), sx + 4, cy + 4);
    }
  }

  const startJ = Math.floor(worldBottom / step);
  const endJ = Math.ceil(worldTop / step);
  for (let j = startJ; j <= endJ; j++) {
    const yVal = j * step;
    const { y: sy } = worldToScreen(0, yVal, cx, cy);
    const isMajor = j % majorEvery === 0;
    ctx.strokeStyle = isMajor ? '#2e3941' : '#1c242b';
    ctx.beginPath(); ctx.moveTo(0, sy + 0.5); ctx.lineTo(cssWidth, sy + 0.5); ctx.stroke();
    if (isMajor && Math.abs(yVal) > step / 100) {
      ctx.fillStyle = '#55636d';
      ctx.fillText(formatTick(yVal, step), cx + 4, sy + 4);
    }
  }

  ctx.strokeStyle = '#8b929a';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, cy + 0.5); ctx.lineTo(cssWidth, cy + 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 0.5, 0); ctx.lineTo(cx + 0.5, cssHeight); ctx.stroke();
}

function drawFunctionCurve(entry, cx, cy) {
  ctx.strokeStyle = entry.color;
  ctx.lineWidth = 2.25;
  ctx.lineJoin = 'round';
  ctx.beginPath();

  let penDown = false;
  let prevCoord = null;

  if (entry.mode === 'x') {
    const jumpThreshold = cssWidth * 4;
    for (let py = 0; py <= cssHeight; py++) {
      const worldY = screenToWorld(0, py, cx, cy).y;
      let xVal;
      try { xVal = entry.compiled(worldY); } catch { xVal = NaN; }
      if (!Number.isFinite(xVal)) { penDown = false; prevCoord = null; continue; }

      const sx = cx + view.panX + xVal * view.scale;
      if (prevCoord !== null && Math.abs(sx - prevCoord) > jumpThreshold) penDown = false;
      if (!penDown) { ctx.moveTo(sx, py); penDown = true; } else ctx.lineTo(sx, py);
      prevCoord = sx;
    }
  } else {
    const jumpThreshold = cssHeight * 4;
    for (let px = 0; px <= cssWidth; px++) {
      const worldX = screenToWorld(px, 0, cx, cy).x;
      let yVal;
      try { yVal = entry.compiled(worldX); } catch { yVal = NaN; }
      if (!Number.isFinite(yVal)) { penDown = false; prevCoord = null; continue; }

      const sy = cy - yVal * view.scale + view.panY;
      if (prevCoord !== null && Math.abs(sy - prevCoord) > jumpThreshold) penDown = false;
      if (!penDown) { ctx.moveTo(px, sy); penDown = true; } else ctx.lineTo(px, sy);
      prevCoord = sy;
    }
  }
  ctx.stroke();
}

function drawImplicitCurve(entry, cx, cy) {
  const step = 7;
  const cols = Math.ceil(cssWidth / step) + 1;
  const rows = Math.ceil(cssHeight / step) + 1;

  const vals = new Float64Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const w = screenToWorld(i * step, j * step, cx, cy);
      let v;
      try { v = entry.compiled(w.x, w.y); } catch { v = NaN; }
      vals[j * cols + i] = v;
    }
  }

  const lerp = (p1, v1, p2, v2) => {
    const t = v2 - v1 !== 0 ? (0 - v1) / (v2 - v1) : 0.5;
    return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
  };

  ctx.strokeStyle = entry.color;
  ctx.lineWidth = 2.25;
  ctx.lineJoin = 'round';
  ctx.beginPath();

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const x0 = i * step, x1 = (i + 1) * step, y0 = j * step, y1 = (j + 1) * step;
      const v00 = vals[j * cols + i],       v10 = vals[j * cols + i + 1];
      const v01 = vals[(j + 1) * cols + i], v11 = vals[(j + 1) * cols + i + 1];
      if (![v00, v10, v01, v11].every(Number.isFinite)) continue;

      const crossings = [];
      if ((v00 < 0) !== (v10 < 0)) crossings.push(lerp({ x: x0, y: y0 }, v00, { x: x1, y: y0 }, v10)); // top
      if ((v10 < 0) !== (v11 < 0)) crossings.push(lerp({ x: x1, y: y0 }, v10, { x: x1, y: y1 }, v11)); // right
      if ((v01 < 0) !== (v11 < 0)) crossings.push(lerp({ x: x0, y: y1 }, v01, { x: x1, y: y1 }, v11)); // bottom
      if ((v00 < 0) !== (v01 < 0)) crossings.push(lerp({ x: x0, y: y0 }, v00, { x: x0, y: y1 }, v01)); // left

      if (crossings.length === 2) {
        ctx.moveTo(crossings[0].x, crossings[0].y);
        ctx.lineTo(crossings[1].x, crossings[1].y);
      } else if (crossings.length === 4) {
        if (center < 0) {
          ctx.moveTo(crossings[0].x, crossings[0].y); ctx.lineTo(crossings[3].x, crossings[3].y);
          ctx.moveTo(crossings[1].x, crossings[1].y); ctx.lineTo(crossings[2].x, crossings[2].y);
        } else {
          ctx.moveTo(crossings[0].x, crossings[0].y); ctx.lineTo(crossings[1].x, crossings[1].y);
          ctx.moveTo(crossings[3].x, crossings[3].y); ctx.lineTo(crossings[2].x, crossings[2].y);
        }
      }
    }
  }
  ctx.stroke();
}

function drawCurve(entry, cx, cy) {
  if (!entry.visible || !entry.compiled) return;
  if (entry.mode === 'eq') drawImplicitCurve(entry, cx, cy);
  else drawFunctionCurve(entry, cx, cy);
}

function draw() {
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const cx = cssWidth / 2, cy = cssHeight / 2;
  drawGrid(cx, cy);
  for (const entry of functions) drawCurve(entry, cx, cy);
  updateInfoPanel();
}

function updateInfoPanel() {
  const cx = cssWidth / 2, cy = cssHeight / 2;
  const center = screenToWorld(cx, cy, cx, cy);
  document.getElementById('infoCenter').textContent =
    `${center.x.toFixed(2)}, ${center.y.toFixed(2)}`;
  document.getElementById('infoScale').textContent = `${view.scale.toFixed(0)} px/unit`;
}

const fnList = document.getElementById('fnList');
const rowTemplate = document.getElementById('fnRowTemplate');

function placeholderFor(mode) {
  if (mode === 'x') return 'e.g. y^2';
  if (mode === 'eq') return 'e.g. x^2/4 + y^2/9 = 1';
  return 'e.g. sin(x)';
}

function renderFnList() {
  fnList.innerHTML = '';
  for (const entry of functions) {
    const node = rowTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = entry.id;
    if (entry.error) node.classList.add('has-error');

    const swatch = node.querySelector('.swatchBtn');
    swatch.style.background = entry.visible ? entry.color : 'transparent';
    swatch.style.borderColor = entry.color;

    const modeBtn = node.querySelector('.modeToggleBtn');
    modeBtn.textContent = entry.mode === 'x' ? 'x=' : entry.mode === 'eq' ? 'eq' : 'y=';

    const input = node.querySelector('.exprInput');
    input.value = entry.expr;
    input.placeholder = placeholderFor(entry.mode);
    input.title = entry.error ? entry.error : '';

    swatch.addEventListener('click', () => {
      entry.visible = !entry.visible;
      swatch.style.background = entry.visible ? entry.color : 'transparent';
      draw();
    });

    modeBtn.addEventListener('click', () => {
      entry.mode = entry.mode === 'y' ? 'x' : entry.mode === 'x' ? 'eq' : 'y';
      modeBtn.textContent = entry.mode === 'x' ? 'x=' : entry.mode === 'eq' ? 'eq' : 'y=';
      input.placeholder = placeholderFor(entry.mode);
      recompile(entry);
      node.classList.toggle('has-error', !!entry.error);
      input.title = entry.error || '';
      draw();
    });

    input.addEventListener('input', () => {
      entry.expr = input.value;
      recompile(entry);
      node.classList.toggle('has-error', !!entry.error);
      input.title = entry.error || '';
      draw();
    });

    node.querySelector('.deleteBtn').addEventListener('click', () => removeFunction(entry.id));

    fnList.appendChild(node);
  }
}

const EXAMPLES = [
  { label: 'sin(x)', expr: 'sin(x)', mode: 'y' },
  { label: 'x^2', expr: 'x^2', mode: 'y' },
  { label: '1/x', expr: '1/x', mode: 'y' },
  { label: 'sqrt(x)', expr: 'sqrt(x)', mode: 'y' },
];
const examplesEl = document.getElementById('examples');
for (const ex of EXAMPLES) {
  const btn = document.createElement('button');
  btn.textContent = ex.label;
  btn.className = 'font-mono text-[11px] border border-line hover:border-fgdim text-fgdim hover:text-fg px-2 py-1 transition-colors';
  btn.addEventListener('click', () => addFunction(ex.expr, null, ex.mode));
  examplesEl.appendChild(btn);
}

const CONIC_EXAMPLES = [
  { label: 'circle', expr: 'x^2 + y^2 = 4', mode: 'eq' },
  { label: 'ellipse', expr: 'x^2/9 + y^2/4 = 1', mode: 'eq' },
  { label: 'parabola', expr: 'y = x^2/4', mode: 'eq' },
  { label: 'hyperbola', expr: 'x^2/4 - y^2/9 = 1', mode: 'eq' },
];
const conicExamplesEl = document.getElementById('conicExamples');
for (const ex of CONIC_EXAMPLES) {
  const btn = document.createElement('button');
  btn.textContent = ex.label;
  btn.className = 'font-mono text-[11px] border border-line hover:border-fgdim text-fgdim hover:text-fg px-2 py-1 transition-colors';
  btn.addEventListener('click', () => addFunction(ex.expr, null, ex.mode));
  conicExamplesEl.appendChild(btn);
}

document.getElementById('addFnBtn').addEventListener('click', () => addFunction('x'));

const wrap = document.getElementById('canvasWrap');
const readout = document.getElementById('readout');
let dragging = false;
let lastX = 0, lastY = 0;

function pointerDown(x, y) { dragging = true; lastX = x; lastY = y; }
function pointerMove(x, y, showReadout) {
  if (dragging) {
    view.panX += x - lastX;
    view.panY += y - lastY;
    lastX = x; lastY = y;
    draw();
  }
  if (showReadout) {
    const rect = wrap.getBoundingClientRect();
    const cx = cssWidth / 2, cy = cssHeight / 2;
    const world = screenToWorld(x, y, cx, cy);
    readout.textContent = `${world.x.toFixed(2)}, ${world.y.toFixed(2)}`;
    readout.style.left = Math.min(x + 12, rect.width - 110) + 'px';
    readout.style.top = Math.max(y - 24, 4) + 'px';
    readout.classList.remove('hidden');
  }
}
function pointerUp() { dragging = false; }

wrap.addEventListener('mousedown', (e) => pointerDown(e.offsetX, e.offsetY));
wrap.addEventListener('mousemove', (e) => pointerMove(e.offsetX, e.offsetY, true));
window.addEventListener('mouseup', pointerUp);
wrap.addEventListener('mouseleave', () => readout.classList.add('hidden'));

wrap.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = Math.pow(1.0015, -e.deltaY);
  zoomStep(factor);
}, { passive: false });

let pinchDist = null;
wrap.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    const r = wrap.getBoundingClientRect();
    pointerDown(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
  } else if (e.touches.length === 2) {
    dragging = false;
    pinchDist = touchDistance(e.touches);
  }
}, { passive: true });

wrap.addEventListener('touchmove', (e) => {
  const r = wrap.getBoundingClientRect();
  if (e.touches.length === 1) {
    pointerMove(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top, false);
  } else if (e.touches.length === 2) {
    const dist = touchDistance(e.touches);
    if (pinchDist) {
      zoomStep(dist / pinchDist); // always zoom from canvas center, not the pinch point
    }
    pinchDist = dist;
  }
}, { passive: true });

wrap.addEventListener('touchend', () => { dragging = false; pinchDist = null; });

function touchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

document.getElementById('zoomInBtn').addEventListener('click', () => zoomStep(1.3));
document.getElementById('zoomOutBtn').addEventListener('click', () => zoomStep(1 / 1.3));
document.getElementById('resetBtn').addEventListener('click', () => {
  view.scale = 60; view.panX = 0; view.panY = 0; draw();
});
function zoomStep(factor) {
  const cx = cssWidth / 2, cy = cssHeight / 2;
  const before = screenToWorld(cx, cy, cx, cy);
  view.scale = Math.min(4000, Math.max(4, view.scale * factor));
  const after = worldToScreen(before.x, before.y, cx, cy);
  view.panX += cx - after.x;
  view.panY += cy - after.y;
  draw();
}

window.addEventListener('resize', resizeCanvas);
new ResizeObserver(resizeCanvas).observe(canvas.parentElement);

resizeCanvas();