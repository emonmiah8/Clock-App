// ======================= Storage =======================
const KEY = 'clockWidgets';

const RETRO = ['#4aa3d8', '#ef5b55', '#f4f1ea'];   // blue, red, white
const COLORS = ['#ffffff', '#4fc3f7', '#81c784', '#ffb74d', '#f06292'];
const ZONES = [
  ['Dhaka', 'Asia/Dhaka'],
  ['London', 'Europe/London'],
  ['New York', 'America/New_York'],
  ['Dubai', 'Asia/Dubai'],
  ['Riyadh', 'Asia/Riyadh'],
  ['Tokyo', 'Asia/Tokyo'],
  ['Sydney', 'Australia/Sydney']
];
const TYPE_NAMES = {
  digital: 'Digital clock',
  analog: 'Analog clock',
  date: 'Date',
  world: 'World clock'
};

function newWidget(type) {
  const base = {
    id: 'w' + Date.now() + Math.floor(Math.random() * 1000),
    type: type,
    color: '#ffffff',
    size: 18
  };
  if (type === 'digital') return Object.assign(base, { hour12: false, retro: false });
  if (type === 'analog') return Object.assign(base, { size: 12 });
  if (type === 'date') return Object.assign(base, { size: 14 });
  return Object.assign(base, { size: 12, hour12: false, retro: false, zone: 'Europe/London' });
}

function defaultWidgets() {
  return [newWidget('digital'), newWidget('date')];
}

function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const a = JSON.parse(s);
      if (Array.isArray(a)) return a;
    }
    // Bring over settings from the older single-clock version
    const old = localStorage.getItem('clockSettings');
    if (old) {
      const o = JSON.parse(old);
      const d = newWidget(o.mode === 'analog' ? 'analog' : 'digital');
      d.color = o.color || d.color;
      if (d.type === 'digital') {
        d.size = o.size || d.size;
        d.hour12 = !!o.hour12;
        d.retro = !!o.retro;
      }
      return [d, newWidget('date')];
    }
  } catch (e) {}
  return defaultWidgets();
}

let widgets = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(widgets)); } catch (e) {}
}

// ======================= Retro digits =======================
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
  return '<svg class="dg" viewBox="0 0 60 100"' + style + '><g' + g +
    ' fill="none" stroke-linejoin="round">' +
    '<path class="l1" d="' + p + '"/>' +
    '<path class="l2" d="' + p + '"/>' +
    '<path class="l3" d="' + p + '"/>' +
    '</g></svg>';
}

const COLON_SVG =
  '<svg class="dg" viewBox="0 0 24 100">' +
  '<circle cx="12" cy="35" r="5" fill="currentColor"/>' +
  '<circle cx="12" cy="65" r="5" fill="currentColor"/></svg>';

function timeHtml(str, retro) {
  let html = '';
  let n = 0;                           // counts digits only
  for (const ch of str) {
    if (ch === ':') {
      html += COLON_SVG;
    } else if (ch === ' ') {
      html += '<span class="gap"></span>';
    } else if (ch >= '0' && ch <= '9') {
      html += digitSvg(ch, retro ? RETRO[n % 3] : null);
      n++;
    } else {
      html += '<span class="ampm">' + ch + '</span>';
    }
  }
  return html;
}

// ======================= Analog face =======================
function analogSvg() {
  let ticks = '';
  for (let i = 0; i < 12; i++) {
    ticks += '<line x1="100" y1="10" x2="100" y2="' + (i % 3 === 0 ? 24 : 18) +
      '" stroke-width="' + (i % 3 === 0 ? 3 : 1.5) +
      '" transform="rotate(' + (i * 30) + ' 100 100)"/>';
  }
  return '<svg class="analog" viewBox="0 0 200 200">' +
    '<circle cx="100" cy="100" r="95" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5"/>' +
    '<g stroke="currentColor">' + ticks + '</g>' +
    '<line class="hh" x1="100" y1="100" x2="100" y2="55" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>' +
    '<line class="mh" x1="100" y1="100" x2="100" y2="30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
    '<line class="sh" x1="100" y1="110" x2="100" y2="22" stroke="#ff5252" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="100" cy="100" r="4" fill="currentColor"/></svg>';
}

// ======================= Widgets on screen =======================
function zoneName(zone) {
  const z = ZONES.find(function (x) { return x[1] === zone; });
  return z ? z[0] : zone;
}

function widgetEl(id) {
  return document.querySelector('[data-id="' + id + '"]');
}

function applyStyle(w) {
  const el = widgetEl(w.id);
  if (!el) return;
  el.style.setProperty('--color', w.color);
  el.style.setProperty('--size', w.size + 'vw');
}

function buildWidget(w) {
  const el = document.createElement('div');
  el.className = 'widget';
  el.dataset.id = w.id;
  let inner = '';
  if (w.type === 'digital') {
    inner = '<div class="time"></div>';
  } else if (w.type === 'world') {
    inner = '<div class="wlabel">' + zoneName(w.zone) + '</div><div class="time"></div>';
  } else if (w.type === 'analog') {
    inner = analogSvg();
  } else {
    inner = '<div class="datetxt"><div class="wd"></div><div class="dm"></div></div>';
  }
  el.innerHTML = inner;
  el.onclick = function () { openEdit(w.id); };
  return el;
}

function fmtTime(now, w, zone) {
  const opts = { hour12: !!w.hour12 };
  if (zone) opts.timeZone = zone;
  return now.toLocaleTimeString('en-GB', opts).toUpperCase();
}

function rotate(el, cls, deg) {
  el.querySelector(cls).setAttribute('transform', 'rotate(' + deg + ' 100 100)');
}

function updateWidget(w, el, now) {
  if (w.type === 'digital' || w.type === 'world') {
    const str = fmtTime(now, w, w.type === 'world' ? w.zone : null);
    const key = str + '|' + w.retro;
    const t = el.querySelector('.time');
    if (t.dataset.key !== key) {
      t.dataset.key = key;
      t.innerHTML = timeHtml(str, w.retro);
    }
  } else if (w.type === 'analog') {
    const h = now.getHours() % 12;
    const m = now.getMinutes();
    const s = now.getSeconds();
    rotate(el, '.hh', h * 30 + m * 0.5);
    rotate(el, '.mh', m * 6 + s * 0.1);
    rotate(el, '.sh', s * 6);
  } else {
    el.querySelector('.wd').textContent =
      now.toLocaleDateString('en-GB', { weekday: 'long' });
    el.querySelector('.dm').textContent =
      now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  }
}

function tick() {
  const now = new Date();
  widgets.forEach(function (w) {
    const el = widgetEl(w.id);
    if (el) updateWidget(w, el, now);
  });
}

function renderAll() {
  const stage = document.getElementById('stage');
  stage.innerHTML = '';
  if (!widgets.length) {
    stage.innerHTML = '<div class="empty">Tap + to add a widget</div>';
    return;
  }
  widgets.forEach(function (w) {
    stage.appendChild(buildWidget(w));
    applyStyle(w);
  });
  tick();
}

// ======================= Bottom sheet =======================
const sheet = document.getElementById('sheet');
const overlay = document.getElementById('overlay');

function openSheet(html) {
  sheet.innerHTML = html;
  sheet.classList.add('open');
  overlay.classList.add('open');
}

function closeSheet() {
  sheet.classList.remove('open');
  overlay.classList.remove('open');
}

overlay.onclick = closeSheet;

function openEdit(id) {
  const w = widgets.find(function (x) { return x.id === id; });
  if (!w) return;

  let h = '<div class="title">' + TYPE_NAMES[w.type] + '</div>';

  h += '<div class="row"><div class="label">Color</div>' +
    COLORS.map(function (c) {
      return '<button class="swatch" data-c="' + c + '" style="background:' + c + '"></button>';
    }).join('') + '</div>';

  h += '<div class="row"><div class="label">Size</div>' +
    '<input type="range" id="sz" min="6" max="26" step="1" value="' + w.size + '"></div>';

  if (w.type === 'world') {
    h += '<div class="row"><div class="label">City</div><select id="zone">' +
      ZONES.map(function (z) {
        return '<option value="' + z[1] + '"' + (z[1] === w.zone ? ' selected' : '') + '>' + z[0] + '</option>';
      }).join('') + '</select></div>';
  }

  if (w.type === 'digital' || w.type === 'world') {
    h += '<div class="row"><button class="btn" id="fmt"></button>' +
      '<button class="btn" id="rt"></button></div>';
  }

  h += '<div class="row"><button class="btn" id="up">&#8593; Move up</button>' +
    '<button class="btn" id="down">&#8595; Move down</button></div>';
  h += '<div class="row"><button class="btn danger" id="del">Delete</button>' +
    '<button class="btn" id="done">Done</button></div>';

  openSheet(h);

  function labels() {
    const f = document.getElementById('fmt');
    const r = document.getElementById('rt');
    if (f) f.textContent = w.hour12 ? '12-hour' : '24-hour';
    if (r) r.textContent = w.retro ? 'Retro colors: ON' : 'Retro colors: OFF';
  }
  labels();

  sheet.querySelectorAll('.swatch').forEach(function (b) {
    b.onclick = function () { w.color = b.dataset.c; save(); applyStyle(w); };
  });

  document.getElementById('sz').oninput = function (e) {
    w.size = Number(e.target.value); save(); applyStyle(w);
  };

  const zoneSel = document.getElementById('zone');
  if (zoneSel) {
    zoneSel.onchange = function () { w.zone = zoneSel.value; save(); renderAll(); };
  }

  const fmt = document.getElementById('fmt');
  if (fmt) fmt.onclick = function () { w.hour12 = !w.hour12; save(); renderAll(); labels(); };

  const rt = document.getElementById('rt');
  if (rt) rt.onclick = function () { w.retro = !w.retro; save(); renderAll(); labels(); };

  document.getElementById('up').onclick = function () {
    const i = widgets.indexOf(w);
    if (i > 0) {
      widgets.splice(i, 1);
      widgets.splice(i - 1, 0, w);
      save(); renderAll();
    }
  };
  document.getElementById('down').onclick = function () {
    const i = widgets.indexOf(w);
    if (i < widgets.length - 1) {
      widgets.splice(i, 1);
      widgets.splice(i + 1, 0, w);
      save(); renderAll();
    }
  };
  document.getElementById('del').onclick = function () {
    widgets = widgets.filter(function (x) { return x !== w; });
    save(); closeSheet(); renderAll();
  };
  document.getElementById('done').onclick = closeSheet;
}

document.getElementById('add').onclick = function () {
  let h = '<div class="title">Add widget</div>';
  Object.keys(TYPE_NAMES).forEach(function (t) {
    h += '<button class="btn block" data-t="' + t + '">' + TYPE_NAMES[t] + '</button>';
  });
  h += '<div class="row"><button class="btn danger" id="reset">Reset all</button>' +
    '<button class="btn" id="done">Close</button></div>';
  openSheet(h);

  sheet.querySelectorAll('[data-t]').forEach(function (b) {
    b.onclick = function () {
      widgets.push(newWidget(b.dataset.t));
      save(); closeSheet(); renderAll();
      window.scrollTo(0, document.body.scrollHeight);
    };
  });
  document.getElementById('reset').onclick = function () {
    if (confirm('Reset all widgets to default?')) {
      widgets = defaultWidgets();
      save(); closeSheet(); renderAll();
    }
  };
  document.getElementById('done').onclick = closeSheet;
};

// ======================= Start =======================
renderAll();
setInterval(tick, 1000);
// ======================= Global settings =======================
const GKEY = 'clockGlobal';
const BGS = [
  ['#000000', 'Black'],
  ['#0e1014', 'Charcoal'],
  ['#0b1426', 'Navy'],
  ['#1a1410', 'Brown'],
  ['#0f1a14', 'Forest']
];
let globalSet = { bg: '#000000', awake: false };

try {
  const g = localStorage.getItem(GKEY);
  if (g) globalSet = Object.assign(globalSet, JSON.parse(g));
} catch (e) {}

function saveGlobal() {
  try { localStorage.setItem(GKEY, JSON.stringify(globalSet)); } catch (e) {}
}

function applyTheme() {
  document.documentElement.style.setProperty('--bg', globalSet.bg);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', globalSet.bg);
}

// ---- Keep screen awake ----
let wakeLock = null;

async function setAwake(on) {
  try {
    if (on) {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', function () { wakeLock = null; });
      }
    } else if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) {}
}

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && globalSet.awake) setAwake(true);
});
document.addEventListener('click', function () {
  if (globalSet.awake && !wakeLock) setAwake(true);
});

// ---- Settings sheet ----
function openSettings() {
  let h = '<div class="title">Settings</div>';
  h += '<div class="row"><div class="label">Background</div>' +
    BGS.map(function (b) {
      return '<button class="swatch" data-bg="' + b[0] + '" title="' + b[1] +
        '" style="background:' + b[0] + ';border-color:#777"></button>';
    }).join('') + '</div>';
  h += '<div class="row"><button class="btn" id="awake"></button></div>';
  h += '<div class="row"><button class="btn" id="fs">Toggle fullscreen</button></div>';
  h += '<div class="row"><button class="btn" id="done">Done</button></div>';
  openSheet(h);

  function labels() {
    document.getElementById('awake').textContent =
      globalSet.awake ? 'Keep screen awake: ON' : 'Keep screen awake: OFF';
  }
  labels();

  sheet.querySelectorAll('[data-bg]').forEach(function (b) {
    b.onclick = function () {
      globalSet.bg = b.dataset.bg;
      saveGlobal(); applyTheme();
    };
  });

  document.getElementById('awake').onclick = function () {
    globalSet.awake = !globalSet.awake;
    saveGlobal(); setAwake(globalSet.awake); labels();
  };

  document.getElementById('fs').onclick = function () {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(function () {});
    }
  };

  document.getElementById('done').onclick = closeSheet;
}

document.getElementById('cog').onclick = openSettings;

applyTheme();
if (globalSet.awake) setAwake(true);
