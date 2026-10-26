const defaults = { color: '#ffffff', size: 18, hour12: false, mode: 'digital', retro: false };
let settings = { ...defaults };

// Load saved settings
try {
  const saved = localStorage.getItem('clockSettings');
  if (saved) settings = { ...defaults, ...JSON.parse(saved) };
} catch (e) {}

function save() {
  try { localStorage.setItem('clockSettings', JSON.stringify(settings)); } catch (e) {}
}

// ---------- Retro line digits ----------
const RETRO = ['#4aa3d8', '#ef5b55', '#f4f1ea'];   // blue, red, white

const PATHS = {
  '0': 'M10 30 A20 20 0 0 1 50 30 V70 A20 20 0 0 1 10 70 Z',
  '1': 'M12 38 A28 28 0 0 1 40 10 V90',
  '2': 'M10 30 A20 20 0 0 1 50 30 C50 55 10 60 10 90 H52',
  '3': 'M10 30 A20 20 0 0 1 50 30 A20 20 0 0 1 30 50 A20 20 0 0 1 50 70 A20 20 0 0 1 30 90 A20 20 0 0 1 10 70',
  '4': 'M14 10 V62 H52 M40 10 V90',
  '5': 'M50 10 H12 V44 H28 A23 23 0 0 1 28 90 H10',
  '6': 'M50 30 A20 20 0 0 0 10 30 V70 A20 20 0 0 0 50 70 A20 20 0 0 0 10 70',
  '7': 'M8 10 H44 V90',
  '8': 'M10 30 A20 20 0 0 1 50 30 A20 20 0 0 1 10 30 Z M10 70 A20 20 0 0 1 50 70 A20 20 0 0 1 10 70 Z'
};

function digitSvg(d, col) {
  const flip = d === '9';              // 9 is the 6 turned upside down
  const p = flip ? PATHS['6'] : PATHS[d];
  const g = flip ? ' transform="rotate(180 30 50)"' : '';
  const style = col ? ' style="color:' + col + '"' : '';
  return '<svg class="dg" viewBox="0 0 60 100"' + style + '><g' + g + ' fill="none" stroke-linejoin="round">' +
    '<path class="l1" d="' + p + '"/>' +
    '<path class="l2" d="' + p + '"/>' +
    '<path class="l3" d="' + p + '"/>' +
    '</g></svg>';
}

const COLON_SVG =
  '<svg class="dg" viewBox="0 0 24 100">' +
  '<circle cx="12" cy="35" r="5" fill="currentColor"/>' +
  '<circle cx="12" cy="65" r="5" fill="currentColor"/></svg>';

let lastKey = '';
function renderTime(str) {
  const key = str + '|' + settings.retro;
  if (key === lastKey) return;
  lastKey = key;

  let html = '';
  let n = 0;                           // counts digits only
  for (const ch of str) {
    if (ch === ':') {
      html += COLON_SVG;
    } else if (ch === ' ') {
      html += '<span class="gap"></span>';
    } else if (ch >= '0' && ch <= '9') {
      const col = settings.retro ? RETRO[n % 3] : null;
      html += digitSvg(ch, col);
      n++;
    } else {
      html += '<span class="ampm">' + ch + '</span>';
    }
  }
  document.getElementById('time').innerHTML = html;
}

// ---------- Analog ticks ----------
(function drawTicks() {
  const g = document.getElementById('ticks');
  for (let i = 0; i < 12; i++) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', 100);
    line.setAttribute('y1', 10);
    line.setAttribute('x2', 100);
    line.setAttribute('y2', i % 3 === 0 ? 24 : 18);
    line.setAttribute('stroke-width', i % 3 === 0 ? 3 : 1.5);
    line.setAttribute('transform', 'rotate(' + (i * 30) + ' 100 100)');
    g.appendChild(line);
  }
})();

function apply() {
  const root = document.documentElement.style;
  root.setProperty('--color', settings.color);
  root.setProperty('--size', settings.size + 'vw');
  document.getElementById('size').value = settings.size;

  const analog = settings.mode === 'analog';
  document.getElementById('time').style.display = analog ? 'none' : 'flex';
  document.getElementById('analog').style.display = analog ? 'block' : 'none';

  document.getElementById('mode').textContent =
    analog ? 'Analog (tap for Digital)' : 'Digital (tap for Analog)';
  document.getElementById('format').textContent =
    settings.hour12 ? '12-hour (tap for 24)' : '24-hour (tap for 12)';
  document.getElementById('retro').textContent =
    settings.retro ? 'Retro colors: ON (tap to turn off)' : 'Retro colors: OFF (tap to turn on)';
  tick();
}

function rotate(id, deg) {
  document.getElementById(id).setAttribute('transform', 'rotate(' + deg + ' 100 100)');
}

function tick() {
  const now = new Date();

  renderTime(
    now.toLocaleTimeString('en-GB', { hour12: settings.hour12 }).toUpperCase()
  );

  document.getElementById('date').textContent =
    now.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long'
    });

  const h = now.getHours() % 12;
  const m = now.getMinutes();
  const s = now.getSeconds();
  rotate('hourHand', h * 30 + m * 0.5);
  rotate('minHand', m * 6 + s * 0.1);
  rotate('secHand', s * 6);
}

// Events
document.getElementById('gear').onclick = () =>
  document.getElementById('panel').classList.toggle('open');

document.querySelectorAll('.swatch').forEach(btn => {
  btn.onclick = () => { settings.color = btn.dataset.color; save(); apply(); };
});

document.getElementById('size').oninput = (e) => {
  settings.size = Number(e.target.value); save(); apply();
};

document.getElementById('format').onclick = () => {
  settings.hour12 = !settings.hour12; save(); apply();
};

document.getElementById('mode').onclick = () => {
  settings.mode = settings.mode === 'digital' ? 'analog' : 'digital';
  save(); apply();
};

document.getElementById('retro').onclick = () => {
  settings.retro = !settings.retro; save(); apply();
};

apply();
setInterval(tick, 1000);
