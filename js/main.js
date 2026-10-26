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
// ======================= Tabs (bottom bar) =======================
const TABS = ['home', 'alarm', 'stopwatch', 'timer'];

function showTab(name) {
  TABS.forEach(function (t) {
    document.getElementById('v-' + t).classList.toggle('active', t === name);
    document.querySelector('#nav [data-tab="' + t + '"]').classList.toggle('active', t === name);
  });
  document.getElementById('add').style.display = name === 'home' ? 'block' : 'none';
  window.scrollTo(0, 0);
  closeSheet();
}

document.querySelectorAll('#nav [data-tab]').forEach(function (b) {
  b.onclick = function () { showTab(b.dataset.tab); };
});

function pad(n) { return String(n).padStart(2, '0'); }
function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

// ======================= Sound and ringing =======================
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

// ======================= Alarm =======================
const AKEY = 'clockAlarms';
let alarms = [];
try {
  const a = JSON.parse(localStorage.getItem(AKEY));
  if (Array.isArray(a)) alarms = a;
} catch (e) {}

function saveAlarms() {
  try { localStorage.setItem(AKEY, JSON.stringify(alarms)); } catch (e) {}
}

let snoozeAt = 0;
function snoozeFive() { snoozeAt = Date.now() + 5 * 60 * 1000; }

function renderAlarms() {
  const box = document.getElementById('alarmList');
  if (!alarms.length) {
    box.innerHTML = '<div class="empty">No alarms yet</div>';
    return;
  }
  box.innerHTML = '';
  alarms.forEach(function (a) {
    const row = document.createElement('div');
    row.className = 'arow' + (a.on ? '' : ' off');
    row.innerHTML =
      '<div class="time atime" style="--size:11vw">' + timeHtml(a.time, false) + '</div>' +
      '<div class="ameta">' + (a.daily ? 'Every day' : 'Once') + '</div>' +
      '<button class="btn" data-act="tog">' + (a.on ? 'On' : 'Off') + '</button>' +
      '<button class="btn danger" data-act="del">Delete</button>';
    row.querySelector('[data-act="tog"]').onclick = function () {
      a.on = !a.on; saveAlarms(); renderAlarms();
    };
    row.querySelector('[data-act="del"]').onclick = function () {
      alarms = alarms.filter(function (x) { return x !== a; });
      saveAlarms(); renderAlarms();
    };
    box.appendChild(row);
  });
}

document.getElementById('aAdd').onclick = function () {
  const t = document.getElementById('aTime').value;
  if (!t) return;
  const now = new Date();
  const a = {
    id: 'a' + Date.now(),
    time: t,
    on: true,
    daily: document.getElementById('aDaily').checked,
    last: ''
  };
  // do not ring immediately if set to the current minute
  if (t === pad(now.getHours()) + ':' + pad(now.getMinutes())) a.last = dayKey(now) + t;
  alarms.push(a);
  alarms.sort(function (x, y) { return x.time < y.time ? -1 : 1; });
  saveAlarms(); renderAlarms();
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

// ======================= Stopwatch =======================
let sw = { running: false, start: 0, elapsed: 0, laps: [] };

function swMs() { return sw.elapsed + (sw.running ? Date.now() - sw.start : 0); }

function fmtMs(ms) {
  const t = Math.floor(ms / 10);
  const cs = t % 100;
  const s = Math.floor(t / 100) % 60;
  const m = Math.floor(t / 6000) % 60;
  const h = Math.floor(t / 360000);
  return { main: (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(s), cs: pad(cs) };
}

let lastSwMain = '';
function renderSw() {
  const f = fmtMs(swMs());
  if (f.main !== lastSwMain) {
    lastSwMain = f.main;
    document.getElementById('swMain').innerHTML = timeHtml(f.main, false);
  }
  document.getElementById('swCs').textContent = '.' + f.cs;
  document.getElementById('swGo').textContent = sw.running ? 'Pause' : 'Start';
}

function renderLaps() {
  const box = document.getElementById('laps');
  box.innerHTML = '';
  for (let i = sw.laps.length - 1; i >= 0; i--) {
    const total = fmtMs(sw.laps[i]);
    const prev = i > 0 ? sw.laps[i - 1] : 0;
    const split = fmtMs(sw.laps[i] - prev);
    const row = document.createElement('div');
    row.className = 'lap';
    row.textContent = 'Lap ' + (i + 1) + '   +' + split.main + '.' + split.cs +
      '   ' + total.main + '.' + total.cs;
    box.appendChild(row);
  }
}

document.getElementById('swGo').onclick = function () {
  if (sw.running) {
    sw.elapsed += Date.now() - sw.start;
    sw.running = false;
  } else {
    sw.start = Date.now();
    sw.running = true;
  }
  renderSw();
};
document.getElementById('swLap').onclick = function () {
  if (swMs() > 0) { sw.laps.push(swMs()); renderLaps(); }
};
document.getElementById('swReset').onclick = function () {
  sw = { running: false, start: 0, elapsed: 0, laps: [] };
  renderSw(); renderLaps();
};

// ======================= Timer =======================
const TKEY = 'clockTimer';
let tm = { total: 300000, remaining: 300000, running: false, endAt: 0 };
try {
  const t = JSON.parse(localStorage.getItem(TKEY));
  if (t && typeof t.total === 'number') tm = Object.assign(tm, t);
} catch (e) {}

function saveTm() {
  try { localStorage.setItem(TKEY, JSON.stringify(tm)); } catch (e) {}
}

function tmLeft() {
  return tm.running ? Math.max(0, tm.endAt - Date.now()) : tm.remaining;
}

function fmtTimer(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(sec);
}

let lastTm = '';
function renderTm() {
  const ms = tmLeft();
  const str = fmtTimer(ms);
  if (str !== lastTm) {
    lastTm = str;
    document.getElementById('tmTime').innerHTML = timeHtml(str, false);
  }
  document.getElementById('tmGo').textContent = tm.running ? 'Pause' : 'Start';
  if (tm.running && ms <= 0) {
    tm.running = false;
    tm.remaining = tm.total;
    saveTm();
    renderTm();
    startRing('Timer finished', null);
  }
}

function setTimer(ms) {
  if (ms <= 0) return;
  tm.total = ms;
  tm.remaining = ms;
  tm.running = false;
  saveTm(); renderTm();
}

document.querySelectorAll('#tmChips [data-min]').forEach(function (b) {
  b.onclick = function () { setTimer(Number(b.dataset.min) * 60000); };
});
document.getElementById('tmSet').onclick = function () {
  const v = Number(document.getElementById('tmMin').value);
  if (v > 0) setTimer(Math.min(v, 999) * 60000);
};
document.getElementById('tmGo').onclick = function () {
  if (tm.running) {
    tm.remaining = tmLeft();
    tm.running = false;
  } else {
    if (tm.remaining <= 0) tm.remaining = tm.total;
    tm.endAt = Date.now() + tm.remaining;
    tm.running = true;
  }
  saveTm(); renderTm();
};
document.getElementById('tmReset').onclick = function () {
  tm.running = false;
  tm.remaining = tm.total;
  saveTm(); renderTm();
};

// ======================= Start tabs =======================
renderAlarms();
renderSw();
renderLaps();
renderTm();
setInterval(checkAlarms, 1000);
setInterval(function () { if (sw.running) renderSw(); }, 50);
setInterval(function () { if (tm.running) renderTm(); }, 200);
showTab('home');
// ======================= Alarm screen (iOS style) and dial stopwatch =======================
var alarmEditMode = false;

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function renderAlarms() {
  var box = document.getElementById('alarmList');
  if (!box) return;
  if (!alarms.length) {
    box.innerHTML = '<div class="empty">No alarms yet. Tap + to add one.</div>';
    return;
  }
  box.innerHTML = '';
  alarms.forEach(function (a) {
    var p = a.time.split(':');
    var h = Number(p[0]);
    var m = p[1];
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;

    var row = document.createElement('div');
    row.className = 'arow2' + (a.on ? '' : ' off') + (alarmEditMode ? ' editing' : '');
    row.innerHTML =
      '<button class="adel" aria-label="Delete">&minus;</button>' +
      '<div class="ainfo">' +
        '<div class="time atime" style="--size:13vw">' + timeHtml(h12 + ':' + m, false) +
        '<span class="ampm">' + ap + '</span></div>' +
        '<div class="alabel">' + escapeAttr(a.label || 'Alarm') + (a.daily ? ', Every day' : ', Once') + '</div>' +
      '</div>' +
      '<button class="tgl' + (a.on ? ' on' : '') + '" aria-label="On or off"><span></span></button>';

    row.querySelector('.tgl').onclick = function () {
      a.on = !a.on; saveAlarms(); renderAlarms();
    };
    row.querySelector('.adel').onclick = function () {
      alarms = alarms.filter(function (x) { return x !== a; });
      saveAlarms(); renderAlarms();
    };
    row.querySelector('.ainfo').onclick = function () { openAlarmSheet(a); };
    box.appendChild(row);
  });
}

function openAlarmSheet(a) {
  var isNew = !a;
  var draft = a
    ? { time: a.time, label: a.label || '', daily: a.daily }
    : { time: '07:00', label: '', daily: true };

  var h = '<div class="title">' + (isNew ? 'Add alarm' : 'Edit alarm') + '</div>' +
    '<div class="row"><input type="time" id="asTime" class="bigin" value="' + draft.time + '"></div>' +
    '<div class="row"><input type="text" id="asLabel" placeholder="Label (optional)" maxlength="30" value="' + escapeAttr(draft.label) + '"></div>' +
    '<div class="row"><button class="btn" id="asRepeat"></button></div>' +
    '<div class="row"><button class="btn" id="asSave">Save</button>' +
    (isNew ? '' : '<button class="btn danger" id="asDel">Delete</button>') +
    '<button class="btn" id="asCancel">Cancel</button></div>';
  openSheet(h);

  function lab() {
    document.getElementById('asRepeat').textContent =
      draft.daily ? 'Repeat: Every day' : 'Repeat: Once';
  }
  lab();

  document.getElementById('asRepeat').onclick = function () {
    draft.daily = !draft.daily; lab();
  };

  document.getElementById('asSave').onclick = function () {
    var t = document.getElementById('asTime').value;
    if (!t) return;
    var lbl = document.getElementById('asLabel').value.trim();
    var now = new Date();
    var guard = (t === pad(now.getHours()) + ':' + pad(now.getMinutes())) ? dayKey(now) + t : '';
    if (isNew) {
      alarms.push({ id: 'a' + Date.now(), time: t, on: true, daily: draft.daily, label: lbl, last: guard });
    } else {
      a.time = t; a.label = lbl; a.daily = draft.daily; a.on = true; a.last = guard;
    }
    alarms.sort(function (x, y) { return x.time < y.time ? -1 : 1; });
    saveAlarms(); renderAlarms(); closeSheet();
  };

  var del = document.getElementById('asDel');
  if (del) del.onclick = function () {
    alarms = alarms.filter(function (x) { return x !== a; });
    saveAlarms(); renderAlarms(); closeSheet();
  };

  document.getElementById('asCancel').onclick = closeSheet;
}

// ---- Stopwatch dial ----
function iconPlay() {
  return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
}
function iconPause() {
  return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
}

function buildDial() {
  var g = document.getElementById('dialTicks');
  var sg = document.getElementById('subTicks');
  if (!g || !sg) return;

  var s = '';
  for (var i = 0; i < 60; i++) {
    var big = i % 5 === 0;
    s += '<line x1="150" y1="14" x2="150" y2="' + (big ? 27 : 21) + '" stroke="' +
      (big ? '#d4d4d4' : '#6b6b6b') + '" stroke-width="' + (big ? 2.4 : 1.4) +
      '" transform="rotate(' + (i * 6) + ' 150 150)"/>';
  }
  for (var k = 1; k <= 12; k++) {
    var a = k * 30 * Math.PI / 180;
    var x = 150 + 108 * Math.sin(a);
    var y = 150 - 108 * Math.cos(a);
    s += '<text x="' + x.toFixed(1) + '" y="' + (y + 5).toFixed(1) +
      '" text-anchor="middle" font-size="15" font-weight="700" fill="#ececec">' + (k * 5) + '</text>';
  }
  g.innerHTML = s;

  var t = '';
  for (var j = 0; j < 30; j++) {
    t += '<line x1="150" y1="172" x2="150" y2="' + (j % 5 === 0 ? 178 : 175) +
      '" stroke="#7a7a7a" stroke-width="1" transform="rotate(' + (j * 12) + ' 150 208)"/>';
  }
  var labels = ['30', '5', '10', '15', '20', '25'];
  for (var q = 0; q < 6; q++) {
    var b = q * 60 * Math.PI / 180;
    var lx = 150 + 25 * Math.sin(b);
    var ly = 208 - 25 * Math.cos(b);
    t += '<text x="' + lx.toFixed(1) + '" y="' + (ly + 3).toFixed(1) +
      '" text-anchor="middle" font-size="9" font-weight="700" fill="#cfcfcf">' + labels[q] + '</text>';
  }
  sg.innerHTML = t;
}

function renderSw() {
  var ms = swMs();
  var f = fmtMs(ms);
  if (f.main !== lastSwMain) {
    lastSwMain = f.main;
    var main = document.getElementById('swMain');
    if (main) main.innerHTML = timeHtml(f.main, false);
  }
  var cs = document.getElementById('swCs');
  if (cs) cs.textContent = '.' + f.cs;

  var go = document.getElementById('swGo');
  if (go) {
    var k = sw.running ? 'pause' : 'play';
    if (go.getAttribute('data-k') !== k) {
      go.setAttribute('data-k', k);
      go.innerHTML = sw.running ? iconPause() : iconPlay();
    }
  }

  var h1 = document.getElementById('swHand');
  if (h1) h1.setAttribute('transform', 'rotate(' + ((ms % 60000) / 60000 * 360).toFixed(2) + ' 150 150)');
  var h2 = document.getElementById('swHand2');
  if (h2) h2.setAttribute('transform', 'rotate(' + (((ms / 60000) % 30) / 30 * 360).toFixed(2) + ' 150 208)');
}

document.getElementById('aPlus').onclick = function () { openAlarmSheet(null); };
document.getElementById('aEdit').onclick = function () {
  alarmEditMode = !alarmEditMode;
  this.textContent = alarmEditMode ? 'Done' : 'Edit';
  renderAlarms();
};

buildDial();
renderAlarms();
renderSw();
