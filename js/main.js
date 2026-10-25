const defaults = { color: '#ffffff', size: 18, hour12: false, mode: 'digital' };
let settings = { ...defaults };

// Load saved settings
try {
  const saved = localStorage.getItem('clockSettings');
  if (saved) settings = { ...defaults, ...JSON.parse(saved) };
} catch (e) {}

function save() {
  try { localStorage.setItem('clockSettings', JSON.stringify(settings)); } catch (e) {}
}

// Draw the 12 tick marks once
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
  document.getElementById('time').style.display = analog ? 'none' : 'block';
  document.getElementById('analog').style.display = analog ? 'block' : 'none';

  document.getElementById('mode').textContent =
    analog ? 'Analog (tap for Digital)' : 'Digital (tap for Analog)';
  document.getElementById('format').textContent =
    settings.hour12 ? '12-hour (tap for 24)' : '24-hour (tap for 12)';
  tick();
}

function rotate(id, deg) {
  document.getElementById(id).setAttribute('transform', 'rotate(' + deg + ' 100 100)');
}

function tick() {
  const now = new Date();

  document.getElementById('time').textContent =
    now.toLocaleTimeString('en-GB', { hour12: settings.hour12 }).toUpperCase();

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

apply();
setInterval(tick, 1000);
