/* ==========================================================================
   1. GLOBAL CONFIG & STORAGE
   ========================================================================== */
const KEY = 'clockWidgets';
const AKEY = 'clockAlarms';
const TKEY = 'clockTimer';
const GKEY = 'clockGlobal';
const PKEY = 'clockPresets';

const RETRO = ['#4aa3d8', '#ef5b55', '#f4f1ea'];
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
  classic: 'Classic clock',
  date: 'Date',
  world: 'World clock'
};

const BGS_DARK = [
  ['#000000', 'Black'],
  ['#0e1014', 'Charcoal'],
  ['#0b1426', 'Navy'],
  ['#1a1410', 'Brown'],
  ['#0f1a14', 'Forest']
];

const BGS_LIGHT = [
  ['#ffffff', 'White'],
  ['#f2f2f7', 'Gray'],
  ['#fbf5ea', 'Cream'],
  ['#eaf2ff', 'Sky'],
  ['#eaf6ee', 'Mint']
];

let widgets = loadWidgets();
let alarms = loadAlarms();
let presets = loadPresets();
let globalSet = loadGlobal();
let digitMode = globalSet.font === 'retro' ? 'retro' : 'sf';
let alarmEditMode = false;

/* ==========================================================================
   2. HELPER UTILITIES & HAPTICS
   ========================================================================== */
function pad(n) { return String(n).padStart(2, '0'); }
function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function haptic(p) {
  try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {}
}

/* ==========================================================================
   3. AUDIO & RINGS
   ========================================================================== */
let actx = null;
function unlockAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) {}
}
['click', 'touchstart'].forEach(function (ev) {
  document.addEventListener(ev, unlockAudio, { passive: true });
});

function beep() {
  if (!actx) return;
  try {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.25;
    o.connect(g);
    g.connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + 0.25);
  } catch (e) {}
}

let ringTimer = null;
let ringSnoozeFn = null;

function startRing(title, snoozeFn) {
  stopRing();
  document.getElementById('ringTitle').textContent = title;
  document.getElementById('ringSnooze').style.display = snoozeFn ? 'inline-block' : 'none';
  ringSnoozeFn = snoozeFn;
  document.getElementById('ring').classList.add('open');
  const go = function () {
    beep();
    if (navigator.vibrate) navigator.vibrate(300);
  };
  go();
  ringTimer = setInterval(go, 800);
}

function stopRing() {
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
  document.getElementById('ring').classList.remove('open');
}

document.getElementById('ringStop').onclick = stopRing;
document.getElementById('ringSnooze').onclick = function () {
  const f = ringSnoozeFn;
  stopRing();
  if (f) f();
};

/* ==========================================================================
   4. STORAGE LOAD/SAVE
   ========================================================================== */
function loadWidgets() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const a = JSON.parse(s);
      if (Array.isArray(a)) return a;
    }
  } catch (e) {}
  return [newWidget('digital'), newWidget('date')];
}
function saveWidgets() { try { localStorage.setItem(KEY, JSON.stringify(widgets)); } catch (e) {} }

function loadAlarms() {
  try {
    const a = JSON.parse(localStorage.getItem(AKEY));
    if (Array.isArray(a)) return a;
  } catch (e) {}
  return [];
}
function saveAlarms() { try { localStorage.setItem(AKEY, JSON.stringify(alarms)); } catch (e) {} }

function loadGlobal() {
  let g = { bg: '#000000', bgLight: '#f2f2f7', theme: 'dark', awake: false, font: 'sf' };
  try {
    const s = localStorage.getItem(GKEY);
    if (s) g = Object.assign(g, JSON.parse(s));
  } catch (e) {}
  return g;
}
function saveGlobal() { try { localStorage.setItem(GKEY, JSON.stringify(globalSet)); } catch (e) {} }

function loadPresets() {
  try {
    const p = JSON.parse(localStorage.getItem(PKEY));
    if (Array.isArray(p)) return p;
  } catch (e) {}
  return [
    { id: 'p1', name: 'Brush teeth', s: 120 },
    { id: 'p2', name: 'Face mask', s: 900 },
    { id: 'p3', name: 'Boil eggs', s: 600 },
    { id: 'p4', name: 'Nap', s: 1800 }
  ];
}
function savePresets() { try { localStorage.setItem(PKEY, JSON.stringify(presets)); } catch (e) {} }

/* ==========================================================================
   5. HOME WIDGETS & RENDER
   ========================================================================== */
function newWidget(type) {
  const base = {
    id: 'w' + Date.now() + Math.floor(Math.random() * 1000),
    type: type,
    color: '#ffffff',
    size: 18
  };
  if (type === 'digital') return Object.assign(base, { hour12: false, retro: false });
  if (type === 'analog') return Object.assign(base, { size: 12 });
  if (type === 'classic') return Object.assign(base, { size: 14 });
  if (type === 'date') return Object.assign(base, { size: 14 });
  return Object.assign(base, { size: 12, hour12: false, retro: false, zone: 'Europe/London' });
}

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
  const flip = d === '9';
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

const COLON_SVG = '<svg class="dg" viewBox="0 0 24 100"><circle cx="12" cy="35" r="5" fill="currentColor"/><circle cx="12" cy="65" r="5" fill="currentColor"/></svg>';

function timeHtml(str, retro) {
  let html = '';
  let n = 0;
  if (digitMode === 'sf') {
    let main = '', suf = '';
    for (let i = 0; i < str.length; i++) {
      let ch = str.charAt(i);
      if (ch === ':') {
        main += '<span class="colon">:</span>';
      } else if (ch >= '0' && ch <= '9') {
        main += retro ? '<span style="color:' + RETRO[n % 3] + '">' + ch + '</span>' : ch;
        n++;
      } else if (ch !== ' ') {
        suf += ch;
      }
    }
    return '<span class="txt">' + main + '</span>' + (suf ? '<span class="ampm">' + suf + '</span>' : '');
  }

  for (let i = 0; i < str.length; i++) {
    let ch = str.charAt(i);
    if (ch === ':') html += COLON_SVG;
    else if (ch === ' ') html += '<span class="gap"></span>';
    else if (ch >= '0' && ch <= '9') {
      html += digitSvg(ch, retro ? RETRO[n % 3] : null);
      n++;
    } else {
      html += '<span class="ampm">' + ch + '</span>';
    }
  }
  return html;
}

function analogSvg() {
  let ticks = '';
  for (let i = 0; i < 12; i++) {
    ticks += '<line x1="100" y1="10" x2="100" y2="' + (i % 3 === 0 ? 24 : 18) + '" stroke-width="' + (i % 3 === 0 ? 3 : 1.5) + '" transform="rotate(' + (i * 30) + ' 100 100)"/>';
  }
  return '<svg class="analog" viewBox="0 0 200 200">' +
    '<circle cx="100" cy="100" r="95" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5"/>' +
    '<g stroke="currentColor">' + ticks + '</g>' +
    '<line class="hh" x1="100" y1="100" x2="100" y2="55" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>' +
    '<line class="mh" x1="100" y1="100" x2="100" y2="30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
    '<line class="sh" x1="100" y1="110" x2="100" y2="22" stroke="#ff5252" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="100" cy="100" r="4" fill="currentColor"/></svg>';
}

function classicSvg() {
  let t = '';
  for (let i = 0; i < 60; i++) {
    let hr = i % 5 === 0;
    t += '<line x1="100" y1="12" x2="100" y2="' + (hr ? 27 : 19) + '" stroke="' + (hr ? '#4a4a4c' : '#c9c9cd') + '" stroke-width="' + (hr ? 3.2 : 1.6) + '" transform="rotate(' + (i * 6) + ' 100 100)"/>';
  }
  return '<svg class="clsvg" viewBox="0 0 200 200">' +
    '<rect x="4" y="4" width="192" height="192" rx="46" fill="#fbfbfb"/>' + t +
    '<line class="ch" x1="100" y1="106" x2="100" y2="62" stroke="#111113" stroke-width="7.5" stroke-linecap="round"/>' +
    '<line class="cm" x1="100" y1="106" x2="100" y2="38" stroke="#111113" stroke-width="6" stroke-linecap="round"/>' +
    '<line class="cs2" x1="100" y1="118" x2="100" y2="34" stroke="#ff9f0a" stroke-width="2.4" stroke-linecap="round"/>' +
    '<circle cx="100" cy="100" r="6.5" fill="#111113"/><circle cx="100" cy="100" r="2.6" fill="#ff9f0a"/></svg>';
}

function zoneName(zone) {
  const z = ZONES.find(function (x) { return x[1] === zone; });
  return z ? z[0] : zone;
}

function widgetEl(id) { return document.querySelector('[data-id="' + id + '"]'); }

function applyStyle(w) {
  const el = widgetEl(w.id);
  if (!el) return;
  const light = document.body.classList.contains('light');
  const c = (light && w.color === '#ffffff') ? '#111111' : w.color;
  el.style.setProperty('--color', c);
  el.style.setProperty('--size', w.size + 'vw');
}

function buildWidget(w) {
  const el = document.createElement('div');
  el.className = 'widget';
  el.dataset.id = w.id;
  el.dataset.type = w.type;
  let inner = '';
  if (w.type === 'digital') inner = '<div class="time"></div>';
  else if (w.type === 'world') inner = '<div class="wlabel">' + zoneName(w.zone) + '</div><div class="time"></div>';
  else if (w.type === 'analog') inner = analogSvg();
  else if (w.type === 'classic') inner = classicSvg();
  else inner = '<div class="datetxt"><div class="wd"></div><div class="dm"></div></div>';

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
  const target = el.querySelector(cls);
  if (target) target.setAttribute('transform', 'rotate(' + deg + ' 100 100)');
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
    const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds();
    rotate(el, '.hh', h * 30 + m * 0.5);
    rotate(el, '.mh', m * 6 + s * 0.1);
    rotate(el, '.sh', s * 6);
  } else if (w.type === 'classic') {
    const s = now.getSeconds() + now.getMilliseconds() / 1000;
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;
    rotate(el, '.ch', h * 30);
    rotate(el, '.cm', m * 6);
    rotate(el, '.cs2', s * 6);
  } else {
    el.querySelector('.wd').textContent = now.toLocaleDateString('en-GB', { weekday: 'long' });
    el.querySelector('.dm').textContent = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
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

/* ==========================================================================
   6. THEME, WAKELOCK & SETTINGS SHEET
   ========================================================================== */
function applyTheme() {
  const light = globalSet.theme === 'light';
  const bg = light ? (globalSet.bgLight || '#f2f2f7') : (globalSet.bg || '#000000');
  document.documentElement.style.setProperty('--bg', bg);
  document.body.classList.toggle('light', light);
  RETRO[2] = light ? '#2b2b2e' : '#f4f1ea';
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', bg);
}

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

const sheet = document.getElementById('sheet');
const overlay = document.getElementById('overlay');

function openSheet(html) {
  sheet.classList.remove('pop');
  sheet.innerHTML = html;
  sheet.classList.add('open', 'pop');
  overlay.classList.add('open');
}

function closeSheet() {
  sheet.classList.remove('open', 'pop');
  overlay.classList.remove('open');
}
overlay.onclick = closeSheet;

function openSettings() {
  const light = globalSet.theme === 'light';
  const list = light ? BGS_LIGHT : BGS_DARK;

  let h = '<div class="title">Settings</div>';
  h += '<div class="row"><button class="btn" id="themebtn">' + (light ? 'Theme: Light' : 'Theme: Dark') + '</button></div>';
  h += '<div class="row"><div class="label">Background</div>' +
    list.map(function (b) {
      return '<button class="swatch" data-bg="' + b[0] + '" title="' + b[1] + '" style="background:' + b[0] + ';border-color:#888"></button>';
    }).join('') + '</div>';
  h += '<div class="row"><button class="btn" id="fontbtn">' + (digitMode === 'sf' ? 'Numbers: Bold style' : 'Numbers: Retro lines') + '</button></div>';
  h += '<div class="row"><button class="btn" id="awake">' + (globalSet.awake ? 'Keep screen awake: ON' : 'Keep screen awake: OFF') + '</button></div>';
  h += '<div class="row"><button class="btn" id="fs">Toggle fullscreen</button></div>';
  h += '<div class="row"><button class="btn" id="done">Done</button></div>';
  
  openSheet(h);

  document.getElementById('themebtn').onclick = function () {
    globalSet.theme = light ? 'dark' : 'light';
    saveGlobal(); applyTheme(); renderAll();
    openSettings();
  };

  sheet.querySelectorAll('[data-bg]').forEach(function (b) {
    b.onclick = function () {
      if (globalSet.theme === 'light') globalSet.bgLight = b.dataset.bg;
      else globalSet.bg = b.dataset.bg;
      saveGlobal(); applyTheme();
    };
  });

  document.getElementById('fontbtn').onclick = function () {
    digitMode = digitMode === 'sf' ? 'retro' : 'sf';
    globalSet.font = digitMode;
    saveGlobal();
    document.body.classList.toggle('sf', digitMode === 'sf');
    renderAll();
    document.getElementById('fontbtn').textContent = digitMode === 'sf' ? 'Numbers: Bold style' : 'Numbers: Retro lines';
  };

  document.getElementById('awake').onclick = function () {
    globalSet.awake = !globalSet.awake;
    saveGlobal(); setAwake(globalSet.awake);
    document.getElementById('awake').textContent = globalSet.awake ? 'Keep screen awake: ON' : 'Keep screen awake: OFF';
  };

  document.getElementById('fs').onclick = function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  };

  document.getElementById('done').onclick = closeSheet;
}

document.getElementById('cog').onclick = openSettings;

/* ==========================================================================
   7. EDIT WIDGET SHEET
   ========================================================================== */
function openEdit(id) {
  const w = widgets.find(function (x) { return x.id === id; });
  if (!w) return;

  let h = '<div class="title">' + TYPE_NAMES[w.type] + '</div>';
  h += '<div class="row"><div class="label">Color</div>' +
    COLORS.map(function (c) { return '<button class="swatch" data-c="' + c + '" style="background:' + c + '"></button>'; }).join('') + '</div>';
  h += '<div class="row"><div class="label">Size</div><input type="range" id="sz" min="6" max="26" step="1" value="' + w.size + '"></div>';

  if (w.type === 'world') {
    h += '<div class="row"><div class="label">City</div><select id="zone">' +
      ZONES.map(function (z) { return '<option value="' + z[1] + '"' + (z[1] === w.zone ? ' selected' : '') + '>' + z[0] + '</option>'; }).join('') + '</select></div>';
  }
  if (w.type === 'digital' || w.type === 'world') {
    h += '<div class="row"><button class="btn" id="fmt">' + (w.hour12 ? '12-hour' : '24-hour') + '</button>' +
      '<button class="btn" id="rt">' + (w.retro ? 'Retro colors: ON' : 'Retro colors: OFF') + '</button></div>';
  }

  h += '<div class="row"><button class="btn" id="up">&#8593; Move up</button><button class="btn" id="down">&#8595; Move down</button></div>';
  h += '<div class="row"><button class="btn danger" id="del">Delete</button><button class="btn" id="done">Done</button></div>';

  openSheet(h);

  sheet.querySelectorAll('.swatch').forEach(function (b) {
    b.onclick = function () { w.color = b.dataset.c; saveWidgets(); applyStyle(w); };
  });

  document.getElementById('sz').oninput = function (e) {
    w.size = Number(e.target.value); saveWidgets(); applyStyle(w);
  };

  const zoneSel = document.getElementById('zone');
  if (zoneSel) {
    zoneSel.onchange = function () { w.zone = zoneSel.value; saveWidgets(); renderAll(); };
  }

  const fmt = document.getElementById('fmt');
  if (fmt) fmt.onclick = function () { w.hour12 = !w.hour12; saveWidgets(); renderAll(); fmt.textContent = w.hour12 ? '12-hour' : '24-hour'; };

  const rt = document.getElementById('rt');
  if (rt) rt.onclick = function () { w.retro = !w.retro; saveWidgets(); renderAll(); rt.textContent = w.retro ? 'Retro colors: ON' : 'Retro colors: OFF'; };

  document.getElementById('up').onclick = function () {
    const i = widgets.indexOf(w);
    if (i > 0) { widgets.splice(i, 1); widgets.splice(i - 1, 0, w); saveWidgets(); renderAll(); }
  };
  document.getElementById('down').onclick = function () {
    const i = widgets.indexOf(w);
    if (i < widgets.length - 1) { widgets.splice(i, 1); widgets.splice(i + 1, 0, w); saveWidgets(); renderAll(); }
  };
  document.getElementById('del').onclick = function () {
    widgets = widgets.filter(function (x) { return x !== w; });
    saveWidgets(); closeSheet(); renderAll();
  };
  document.getElementById('done').onclick = closeSheet;
}

document.getElementById('add').onclick = function () {
  let h = '<div class="title">Add widget</div>';
  Object.keys(TYPE_NAMES).forEach(function (t) {
    h += '<button class="btn block" data-t="' + t + '">' + TYPE_NAMES[t] + '</button>';
  });
  h += '<div class="row"><button class="btn danger" id="reset">Reset all</button><button class="btn" id="done">Close</button></div>';
  openSheet(h);

  sheet.querySelectorAll('[data-t]').forEach(function (b) {
    b.onclick = function () {
      widgets.push(newWidget(b.dataset.t));
      saveWidgets(); closeSheet(); renderAll();
      window.scrollTo(0, document.body.scrollHeight);
    };
  });
  document.getElementById('reset').onclick = function () {
    if (confirm('Reset all widgets to default?')) {
      widgets = [newWidget('digital'), newWidget('date')];
      saveWidgets(); closeSheet(); renderAll();
    }
  };
  document.getElementById('done').onclick = closeSheet;
};

/* ==========================================================================
   8. TABS CONTROLLER
   ========================================================================== */
const TABS = ['home', 'alarm', 'stopwatch', 'timer'];
function showTab(name) {
  TABS.forEach(function (t) {
    document.getElementById('v-' + t).classList.toggle('active', t === name);
    document.querySelector('#nav [data-tab="' + t + '"]').classList.toggle('active', t === name);
  });
  document.getElementById('add').style.display = name === 'home' ? 'block' : 'none';
  window.scrollTo(0, 0);
  closeSheet();
  if (name === 'timer') setTimeout(syncWheels, 50);
  if (name === 'home') renderUpcoming();
}

/* ==========================================================================
   9. ALARMS
   ========================================================================== */
let snoozeAt = 0;
function snoozeFive() { snoozeAt = Date.now() + 5 * 60 * 1000; }

function renderAlarms() {
  const box = document.getElementById('alarmList');
  if (!box) return;
  if (!alarms.length) {
    box.innerHTML = '<div class="empty">No alarms yet. Tap + to add one.</div>';
    return;
  }
  box.innerHTML = '';
  alarms.forEach(function (a) {
    const p = a.time.split(':');
    const h = Number(p[0]), m = p[1], ap = h >= 12 ? 'PM' : 'AM', h12 = (h % 12) === 0 ? 12 : (h % 12);

    const row = document.createElement('div');
    row.className = 'arow2' + (a.on ? '' : ' off') + (alarmEditMode ? ' editing' : '');
    row.innerHTML =
      '<button class="adel" aria-label="Delete">&minus;</button>' +
      '<div class="ainfo">' +
        '<div class="time atime" style="--size:13vw">' + timeHtml(h12 + ':' + m, false) + '<span class="ampm">' + ap + '</span></div>' +
        '<div class="alabel">' + escapeAttr(a.label || 'Alarm') + (a.daily ? ', Every day' : ', Once') + '</div>' +
      '</div>' +
      '<button class="tgl' + (a.on ? ' on' : '') + '" aria-label="On/Off"><span></span></button>';

    row.querySelector('.tgl').onclick = function () { a.on = !a.on; saveAlarms(); renderAlarms(); };
    row.querySelector('.adel').onclick = function () { alarms = alarms.filter(function (x) { return x !== a; }); saveAlarms(); renderAlarms(); };
    row.querySelector('.ainfo').onclick = function () { openAlarmSheet(a); };
    box.appendChild(row);
  });
}

function openAlarmSheet(a) {
  const isNew = !a;
  const draft = a ? { time: a.time, label: a.label || '', daily: a.daily } : { time: '07:00', label: '', daily: true };

  let h = '<div class="title">' + (isNew ? 'Add alarm' : 'Edit alarm') + '</div>' +
    '<div class="row"><input type="time" id="asTime" class="bigin" value="' + draft.time + '"></div>' +
    '<div class="row"><input type="text" id="asLabel" placeholder="Label" maxlength="30" value="' + escapeAttr(draft.label) + '"></div>' +
    '<div class="row"><button class="btn" id="asRepeat"></button></div>' +
    '<div class="row"><button class="btn" id="asSave">Save</button>' +
    (isNew ? '' : '<button class="btn danger" id="asDel">Delete</button>') +
    '<button class="btn" id="asCancel">Cancel</button></div>';
  openSheet(h);

  const repBtn = document.getElementById('asRepeat');
  function lab() { repBtn.textContent = draft.daily ? 'Repeat: Every day' : 'Repeat: Once'; }
  lab();
  repBtn.onclick = function () { draft.daily = !draft.daily; lab(); };

  document.getElementById('asSave').onclick = function () {
    const t = document.getElementById('asTime').value;
    if (!t) return;
    const lbl = document.getElementById('asLabel').value.trim();
    const now = new Date();
    const guard = (t === pad(now.getHours()) + ':' + pad(now.getMinutes())) ? dayKey(now) + t : '';
    if (isNew) {
      alarms.push({ id: 'a' + Date.now(), time: t, on: true, daily: draft.daily, label: lbl, last: guard });
    } else {
      a.time = t; a.label = lbl; a.daily = draft.daily; a.on = true; a.last = guard;
    }
    alarms.sort(function (x, y) { return x.time < y.time ? -1 : 1; });
    saveAlarms(); renderAlarms(); closeSheet();
  };

  const del = document.getElementById('asDel');
  if (del) del.onclick = function () { alarms = alarms.filter(function (x) { return x !== a; }); saveAlarms(); renderAlarms(); closeSheet(); };
  document.getElementById('asCancel').onclick = closeSheet;
}

document.getElementById('aPlus').onclick = function () { openAlarmSheet(null); };
document.getElementById('aEdit').onclick = function () {
  alarmEditMode = !alarmEditMode;
  this.textContent = alarmEditMode ? 'Done' : 'Edit';
  renderAlarms();
};

function checkAlarms() {
  const now = new Date();
  const hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
  const dk = dayKey(now);
  alarms.forEach(function (a) {
    if (a.on && a.time === hm && a.last !== dk + hm) {
      a.last = dk + hm;
      if (!a.daily) a.on = false;
      saveAlarms(); renderAlarms();
      startRing('Alarm ' + a.time, snoozeFive);
    }
  });
  if (snoozeAt && Date.now() >= snoozeAt) {
    snoozeAt = 0;
    startRing('Alarm (snoozed)', snoozeFive);
  }
}

/* ==========================================================================
   10. STOPWATCH
   ========================================================================== */
let sw = { running: false, start: 0, elapsed: 0, laps: [] };
let lastSwMain = '';
let lastSwCs = '';

function swMs() { return sw.elapsed + (sw.running ? Date.now() - sw.start : 0); }

function fmtMs(ms) {
  const t = Math.floor(ms / 10);
  const cs = t % 100;
  const s = Math.floor(t / 100) % 60;
  const m = Math.floor(t / 6000) % 60;
  const h = Math.floor(t / 360000);
  return { main: (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(s), cs: pad(cs) };
}

function iconPlay() { return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; }
function iconPause() { return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'; }

function buildDial() {
  const g = document.getElementById('dialTicks');
  const sg = document.getElementById('subTicks');
  if (!g || !sg) return;

  let s = '';
  for (let i = 0; i < 60; i++) {
    let big = i % 5 === 0;
    s += '<line x1="150" y1="14" x2="150" y2="' + (big ? 27 : 21) + '" stroke="' + (big ? '#d4d4d4' : '#6b6b6b') + '" stroke-width="' + (big ? 2.4 : 1.4) + '" transform="rotate(' + (i * 6) + ' 150 150)"/>';
  }
  for (let k = 1; k <= 12; k++) {
    let a = k * 30 * Math.PI / 180;
    s += '<text x="' + (150 + 108 * Math.sin(a)).toFixed(1) + '" y="' + (150 - 108 * Math.cos(a) + 5).toFixed(1) + '" text-anchor="middle" font-size="15" font-weight="700" fill="#ececec">' + (k * 5) + '</text>';
  }
  g.innerHTML = s;

  let t = '';
  for (let j = 0; j < 30; j++) {
    t += '<line x1="150" y1="172" x2="150" y2="' + (j % 5 === 0 ? 178 : 175) + '" stroke="#7a7a7a" stroke-width="1" transform="rotate(' + (j * 12) + ' 150 208)"/>';
  }
  sg.innerHTML = t;
}

function renderSw() {
  const ms = swMs();
  const f = fmtMs(ms);
  if (f.main !== lastSwMain) {
    lastSwMain = f.main;
    const main = document.getElementById('swMain');
    if (main) main.innerHTML = timeHtml(f.main, false);
  }
  if (f.cs !== lastSwCs) {
    lastSwCs = f.cs;
    const cs = document.getElementById('swCs');
    if (cs) cs.textContent = '.' + f.cs;
  }

  const go = document.getElementById('swGo');
  if (go) {
    let k = sw.running ? 'pause' : 'play';
    if (go.getAttribute('data-k') !== k) {
      go.setAttribute('data-k', k);
      go.innerHTML = sw.running ? iconPause() : iconPlay();
    }
  }

  const h1 = document.getElementById('swHand');
  if (h1) h1.setAttribute('transform', 'rotate(' + ((ms % 60000) / 60000 * 360).toFixed(2) + ' 150 150)');
  const h2 = document.getElementById('swHand2');
  if (h2) h2.setAttribute('transform', 'rotate(' + (((ms / 60000) % 30) / 30 * 360).toFixed(2) + ' 150 208)');
}

function renderLaps() {
  const box = document.getElementById('laps');
  if (!box) return;
  box.innerHTML = '';
  for (let i = sw.laps.length - 1; i >= 0; i--) {
    const total = fmtMs(sw.laps[i]);
    const prev = i > 0 ? sw.laps[i - 1] : 0;
    const split = fmtMs(sw.laps[i] - prev);
    const row = document.createElement('div');
    row.className = 'lap';
    row.textContent = 'Lap ' + (i + 1) + '   +' + split.main + '.' + split.cs + '   ' + total.main + '.' + total.cs;
    box.appendChild(row);
  }
}

document.getElementById('swGo').onclick = function () {
  if (sw.running) { sw.elapsed += Date.now() - sw.start; sw.running = false; }
  else { sw.start = Date.now(); sw.running = true; }
  renderSw();
};
document.getElementById('swLap').onclick = function () { if (swMs() > 0) { sw.laps.push(swMs()); renderLaps(); } };
document.getElementById('swReset').onclick = function () { sw = { running: false, start: 0, elapsed: 0, laps: [] }; renderSw(); renderLaps(); };

/* ==========================================================================
   11. TIMER & PRESETS
   ========================================================================== */
const TKEY_VAL = 'clockTimer';
let tm = { total: 300000, remaining: 300000, running: false, endAt: 0 };
try {
  const t = JSON.parse(localStorage.getItem(TKEY_VAL));
  if (t && typeof t.total === 'number') tm = Object.assign(tm, t);
} catch (e) {}

function saveTm() { try { localStorage.setItem(TKEY_VAL, JSON.stringify(tm)); } catch (e) {} }
function tmLeft() { return tm.running ? Math.max(0, tm.endAt - Date.now()) : tm.remaining; }
function fmtTimer(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(sec);
}

let lastTm = '';
let wheelTimer = null;
const ITEM_H = 60;
let selIdx = { pH: -1, pM: -1, pS: -1 };
let lastRun = false;

function wheelIndex(id) {
  const el = document.getElementById(id);
  return el ? Math.round(el.scrollTop / ITEM_H) : 0;
}
function wheelMs() {
  return (wheelIndex('pH') * 3600 + wheelIndex('pM') * 60 + wheelIndex('pS')) * 1000;
}
function markSelected() {
  ['pH', 'pM', 'pS'].forEach(function (id) {
    const el = document.getElementById(id);
    if (!el || !el.children.length) return;
    const idx = Math.max(0, Math.min(el.children.length - 1, Math.round(el.scrollTop / ITEM_H)));
    if (idx !== selIdx[id]) {
      if (el.children[selIdx[id]]) el.children[selIdx[id]].classList.remove('sel');
      el.children[idx].classList.add('sel');
      selIdx[id] = idx;
    }
  });
}
function readWheels() {
  if (tm.running || tm.remaining !== tm.total) return;
  const ms = wheelMs();
  tm.total = ms; tm.remaining = ms;
  saveTm();
}
function onWheelScroll() {
  markSelected();
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(readWheels, 120);
}
function buildWheels() {
  [['pH', 24], ['pM', 60], ['pS', 60]].forEach(function (c) {
    const el = document.getElementById(c[0]);
    if (!el) return;
    let html = '';
    for (let i = 0; i < c[1]; i++) html += '<div class="pi">' + pad(i) + '</div>';
    el.innerHTML = html;
    el.addEventListener('scroll', onWheelScroll, { passive: true });
  });
}
function setWheel(id, i) {
  const el = document.getElementById(id);
  if (el) el.scrollTop = i * ITEM_H;
}
function syncWheels() {
  const total = Math.round(tm.total / 1000);
  setWheel('pH', Math.floor(total / 3600) % 24);
  setWheel('pM', Math.floor((total % 3600) / 60));
  setWheel('pS', total % 60);
  markSelected();
}

function renderTm() {
  const ms = tmLeft();
  const inRun = tm.running || tm.remaining !== tm.total;
  const pk = document.getElementById('tmPicker');
  const rn = document.getElementById('tmRun');
  const rs = document.getElementById('tmReset');
  if (pk) pk.style.display = inRun ? 'none' : 'flex';
  if (rn) rn.style.display = inRun ? 'flex' : 'none';
  if (rs) rs.style.display = inRun ? 'flex' : 'none';
  if (lastRun && !inRun) setTimeout(syncWheels, 30);
  lastRun = inRun;

  if (inRun) {
    const str = fmtTimer(ms);
    if (str !== lastTm) {
      lastTm = str;
      const t = document.getElementById('tmTime');
      if (t) t.innerHTML = timeHtml(str, false);
    }
  }

  const go = document.getElementById('tmGo');
  if (go) {
    let k = tm.running ? 'pause' : 'play';
    if (go.getAttribute('data-k') !== k) {
      go.setAttribute('data-k', k);
      go.innerHTML = tm.running ? iconPause() : iconPlay();
    }
  }

  if (tm.running && ms <= 0) {
    tm.running = false;
    tm.remaining = tm.total;
    saveTm(); renderTm();
    startRing('Timer finished', null);
  }
}

function renderPresets() {
  const box = document.getElementById('presetList');
  if (!box) return;
  box.innerHTML = '';
  presets.forEach(function (p) {
    const row = document.createElement('div');
    row.className = 'preset';
    row.innerHTML = '<span class="pn">' + escapeAttr(p.name) + '</span><span class="pd">' + pad(Math.floor(p.s / 3600)) + ':' + pad(Math.floor((p.s % 3600) / 60)) + ':' + pad(p.s % 60) + '</span><button class="px">&times;</button>';
    row.onclick = function () {
      tm.running = false; tm.total = p.s * 1000; tm.remaining = p.s * 1000; saveTm(); renderTm(); syncWheels();
    };
    row.querySelector('.px').onclick = function (e) {
      e.stopPropagation();
      presets = presets.filter(function (x) { return x !== p; });
      savePresets(); renderPresets();
    };
    box.appendChild(row);
  });
}

function openPresetSheet() {
  function opts(n) { let o = ''; for (let i = 0; i < n; i++) o += '<option value="' + i + '">' + pad(i) + '</option>'; return o; }
  let h = '<div class="title">Add timer</div>' +
    '<div class="row"><input type="text" id="ptName" placeholder="Name" maxlength="24"></div>' +
    '<div class="row"><div class="label">Hours, minutes, seconds</div><select id="ptH">' + opts(24) + '</select> <select id="ptM">' + opts(60) + '</select> <select id="ptS">' + opts(60) + '</select></div>' +
    '<div class="row"><button class="btn" id="ptSave">Save</button><button class="btn" id="ptCancel">Cancel</button></div>';
  openSheet(h);
  document.getElementById('ptM').value = '5';
  document.getElementById('ptSave').onclick = function () {
    const s = Number(document.getElementById('ptH').value) * 3600 + Number(document.getElementById('ptM').value) * 60 + Number(document.getElementById('ptS').value);
    if (s <= 0) return;
    const name = document.getElementById('ptName').value.trim() || 'Timer';
    presets.push({ id: 'p' + Date.now(), name: name, s: s });
    savePresets(); renderPresets(); closeSheet();
  };
  document.getElementById('ptCancel').onclick = closeSheet;
}

document.getElementById('pAdd').onclick = openPresetSheet;
document.getElementById('tmGo').onclick = function () {
  unlockAudio();
  if (tm.running) { tm.remaining = tmLeft(); tm.running = false; }
  else {
    if (tm.remaining === tm.total) {
      const ms = wheelMs();
      tm.total = ms; tm.remaining = ms;
    }
    if (tm.remaining <= 0) return;
    tm.endAt = Date.now() + tm.remaining;
    tm.running = true;
  }
  saveTm(); renderTm();
};
document.getElementById('tmReset').onclick = function () { tm.running = false; tm.remaining = tm.total; saveTm(); renderTm(); };

/* ==========================================================================
   12. SELF-UPDATING DYNAMIC UPCOMING LIST GENERATOR
   ========================================================================== */
function generateDynamicUpcomingList() {
  const currentYear = new Date().getFullYear();
  let events = [];

  // ১. ফিক্সড বা নির্ধারিত সরকারি ও জাতীয় দিবসসমূহ (চলতি ও আগামী বছর স্বয়ংক্রিয়ভাবে তৈরি হবে)
  for (let y = currentYear; y <= currentYear + 1; y++) {
    events.push(
      { d: y + '-01-01', n: 'New Year’s Day', b: 'ইংরেজি নববর্ষ', t: 'i' },
      { d: '2026-02-13', n: 'Pohela Falgun', b: 'পহেলা ফাল্গুন', t: 'i' },
      { d: y + '-02-21', n: 'Shaheed Day', b: 'শহীদ ও মাতৃভাষা দিবস', t: 'h' },
      { d: y + '-03-08', n: 'Women’s Day', b: 'আন্তর্জাতিক নারী দিবস', t: 'i' },
      { d: y + '-03-25', n: 'Genocide Remembrance Day', b: 'গণহত্যা দিবস', t: 'i' },
      { d: '2026-03-26', n: 'Independence Day', b: 'স্বাধীনতা দিবস', t: 'h' },
      { d: '2026-04-14', n: 'Pohela Boishakh', b: 'পহেলা বৈশাখ', t: 'h' },
      { d: y + '-05-01', n: 'May Day', b: 'মে দিবস', t: 'h' },
      { d: '2026-08-05', n: 'July Uprising Day', b: 'জুলাই গণ-অভ্যুত্থান দিবস', t: 'h' },
      { d: y + '-12-10', n: 'Human Rights Day', b: 'মানবাধিকার দিবস', t: 'i' },
      { d: '2026-12-14', n: 'Martyred Intellectuals Day', b: 'শহীদ বুদ্ধিজীবী দিবস', t: 'i' },
      { d: '2026-12-16', n: 'Victory Day', b: 'বিজয় দিবস', t: 'h' },
      { d: y + '-12-25', n: 'Christmas Day', b: 'বড়দিন', t: 'h' }
    );
  }

  // ২. ইউজার লোকাল স্টোরেজ থেকে কাস্টম কোনো ইভেন্ট অ্যাড করে থাকলে সেগুলোও যুক্ত করা
  try {
    const customEvents = JSON.parse(localStorage.getItem('customUpcomingEvents')) || [];
    events = events.concat(customEvents);
  } catch (e) {}

  return events;
}

let lastFt = -1, lastFb = -1, lastSh = -1, cachedFt = 34, lastMeasure = 0, fadeQueued = false;

function renderUpcoming() {
  const box = document.getElementById('hList');
  if (!box) return;
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const LABEL = { h: 'Holiday', i: 'Important', r: 'Religious' };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let items = [];

  const dynamicEvents = generateDynamicUpcomingList();

  dynamicEvents.forEach(function (ev) {
    const p = ev.d.split('-');
    const dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    const diff = Math.round((dt - today) / 86400000);
    if (diff >= 0) items.push({ h: ev, dt: dt, diff: diff });
  });

  // তারিখ অনুযায়ী ক্রমানুসারে সাজানো এবং পরবর্তী ৭টি ইভেন্ট ফিল্টার করা
  items.sort(function (a, b) { return a.dt - b.dt; });
  items = items.slice(0, 7);

  if (!items.length) {
    box.innerHTML = '<div class="hcard"><div class="hmid"><div class="hname">No upcoming dates</div></div></div>';
    return;
  }

  box.innerHTML = items.map(function (it) {
    const t = it.h.t || 'i';
    const left = it.diff === 0 ? 'Today' : (it.diff === 1 ? 'Tomorrow' : 'in ' + it.diff + ' days');
    const wd = it.dt.toLocaleDateString('en-GB', { weekday: 'short' });
    return '<div class="hcard t-' + t + '">' +
      '<div class="hd"><span class="hmon">' + MON[it.dt.getMonth()] + '</span>' +
      '<span class="hday">' + (it.h.approx ? '~' : '') + it.dt.getDate() + '</span></div>' +
      '<div class="hmid"><div class="hname">' + it.h.n + '</div><div class="hbn">' + it.h.b + '</div></div>' +
      '<div class="hright"><span class="hleft' + (it.diff <= 7 ? ' soon' : '') + '">' + left + '</span>' +
      '<span class="hwd">' + wd + ' · ' + LABEL[t] + '</span></div>' +
      '</div>';
  }).join('');
}

function measureHolidays() {
  const box = document.getElementById('hList');
  const hol = document.getElementById('holidays');
  if (!box || !hol || !box.offsetParent) return;

  const br = box.getBoundingClientRect();
  const head = document.querySelector('.hhead');
  const nav = document.getElementById('nav');

  const ft = head ? Math.max(head.getBoundingClientRect().bottom - br.top - 4, 20) : 34;
  const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight;
  const fb = Math.max(br.bottom - navTop + 8, 0);

  if (ft !== lastFt) { lastFt = ft; hol.style.setProperty('--ft', ft + 'px'); }
  if (fb !== lastFb) { lastFb = fb; hol.style.setProperty('--fb', fb + 'px'); }
  cachedFt = ft;
  applyScrollShift();
}

function applyScrollShift() {
  const box = document.getElementById('hList');
  const hol = document.getElementById('holidays');
  if (!box || !hol) return;
  const s = clamp01(box.scrollTop / 40);
  const sh = Math.round((1 - s) * (cachedFt + 98));
  if (sh !== lastSh) { lastSh = sh; hol.style.setProperty('--sh', sh + 'px'); }
}

/* ==========================================================================
   13. INITIALIZATION & INTERVALS
   ========================================================================== */
function initApp() {
  applyTheme();
  document.body.classList.toggle('sf', digitMode === 'sf');
  
  // Settings cog icon (three dots)
  const cog = document.getElementById('cog');
  if (cog) {
    cog.innerHTML = '<span class="dots"><i>icon</i><i>icon</i><i>icon</i></span>'.replace(/icon/g, '');
    cog.setAttribute('aria-label', 'Settings');
  }

  // Navigation tabs
  document.querySelectorAll('#nav [data-tab]').forEach(function (b) {
    b.onclick = function () { showTab(b.dataset.tab); };
  });

  // Global touch/haptic feedback
  document.addEventListener('pointerdown', function (e) {
    const t = e.target.closest ? e.target.closest('#swGo,#tmGo,.round,.fab,#nav button') : null;
    if (!t) return;
    haptic(t.id === 'swGo' || t.id === 'tmGo' ? 16 : 8);
    t.classList.remove('lit');
    void t.offsetWidth;
    t.classList.add('lit');
    setTimeout(function () { t.classList.remove('lit'); }, 700);
  }, true);

  // Instant tab switcher to eliminate delay
  const nav = document.getElementById('nav');
  if (nav) {
    let downAt = 0;
    nav.addEventListener('pointerdown', function (e) {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      downAt = Date.now();
      showTab(b.dataset.tab);
    }, true);
    nav.addEventListener('click', function (e) {
      const b = e.target.closest('[data-tab]');
      if (b && Date.now() - downAt < 1500) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);
  }

  // Setup home & upcoming list
  const home = document.getElementById('v-home');
  const hol = document.getElementById('holidays');
  if (home && hol) home.appendChild(hol);

  const box = document.getElementById('hList');
  if (box) {
    box.addEventListener('scroll', applyScrollShift, { passive: true });
  }

  // Start modules
  buildDial();
  buildWheels();
  renderAlarms();
  renderSw();
  renderLaps();
  renderTm();
  renderPresets();
  renderUpcoming();
  renderAll();
  syncWheels();

  // Unified Intervals for Performance Optimization
  setInterval(tick, 1000);
  setInterval(checkAlarms, 1000);
  setInterval(renderUpcoming, 60000);

  // High-performance loops using requestAnimationFrame
  function sweepLoop() {
    const list = document.querySelectorAll('[data-type="classic"]');
    if (list.length) {
      const now = new Date();
      for (let i = 0; i < list.length; i++) {
        const s = now.getSeconds() + now.getMilliseconds() / 1000;
        const m = now.getMinutes() + s / 60;
        const h = (now.getHours() % 12) + m / 60;
        rotate(list[i], '.ch', h * 30);
        rotate(list[i], '.cm', m * 6);
        rotate(list[i], '.cs2', s * 6);
      }
    }
    requestAnimationFrame(sweepLoop);
  }
  requestAnimationFrame(sweepLoop);

  function stopwatchLoop() {
    if (sw.running) renderSw();
    requestAnimationFrame(stopwatchLoop);
  }
  requestAnimationFrame(stopwatchLoop);

  function timerLoop() {
    if (tm.running) renderTm();
    requestAnimationFrame(timerLoop);
  }
  requestAnimationFrame(timerLoop);

  showTab('home');
  measureHolidays();
}

// Run app once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
