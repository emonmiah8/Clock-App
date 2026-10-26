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
// ======================= Round 4: SF numbers, light theme, holidays, timer, clock icon =======================

// ---------- Number style (retro lines or SF look) ----------
var digitMode = 'retro';   // set properly at the end of this block

function timeHtml(str, retro) {
  var i, ch, n = 0;

  if (digitMode === 'sf') {
    var main = '';
    var suf = '';
    for (i = 0; i < str.length; i++) {
      ch = str.charAt(i);
      if (ch === ':') {
        main += '<span class="colon">:</span>';
      } else if (ch >= '0' && ch <= '9') {
        main += retro
          ? '<span style="color:' + RETRO[n % 3] + '">' + ch + '</span>'
          : ch;
        n++;
      } else if (ch !== ' ') {
        suf += ch;
      }
    }
    return '<span class="txt">' + main + '</span>' +
      (suf ? '<span class="ampm">' + suf + '</span>' : '');
  }

  var html = '';
  for (i = 0; i < str.length; i++) {
    ch = str.charAt(i);
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

var lastSwCs = '';

function applyDigitMode() {
  document.body.classList.toggle('sf', digitMode === 'sf');
  renderAll();
  lastSwMain = ''; lastSwCs = ''; renderSw();
  lastTm = ''; renderTm();
  renderAlarms();
}

// ---------- Theme (dark / light) ----------
var BGS_LIGHT = [
  ['#ffffff', 'White'],
  ['#f2f2f7', 'Gray'],
  ['#fbf5ea', 'Cream'],
  ['#eaf2ff', 'Sky'],
  ['#eaf6ee', 'Mint']
];

function applyTheme() {
  var light = globalSet.theme === 'light';
  var bg = light ? (globalSet.bgLight || '#f2f2f7') : (globalSet.bg || '#000000');
  document.documentElement.style.setProperty('--bg', bg);
  document.body.classList.toggle('light', light);
  RETRO[2] = light ? '#2b2b2e' : '#f4f1ea';
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', bg);
}

// white widgets turn dark automatically on the light theme
function applyStyle(w) {
  var el = widgetEl(w.id);
  if (!el) return;
  var light = document.body.classList.contains('light');
  var c = (light && w.color === '#ffffff') ? '#111111' : w.color;
  el.style.setProperty('--color', c);
  el.style.setProperty('--size', w.size + 'vw');
}

// ---------- Settings ----------
function openSettings() {
  var light = globalSet.theme === 'light';
  var list = light ? BGS_LIGHT : BGS;

  var h = '<div class="title">Settings</div>';
  h += '<div class="row"><button class="btn" id="themebtn"></button></div>';
  h += '<div class="row"><div class="label">Background</div>' +
    list.map(function (b) {
      return '<button class="swatch" data-bg="' + b[0] + '" title="' + b[1] +
        '" style="background:' + b[0] + ';border-color:#888"></button>';
    }).join('') + '</div>';
  h += '<div class="row"><button class="btn" id="fontbtn"></button></div>';
  h += '<div class="row"><button class="btn" id="awake"></button></div>';
  h += '<div class="row"><button class="btn" id="fs">Toggle fullscreen</button></div>';
  h += '<div class="row"><button class="btn" id="done">Done</button></div>';
  openSheet(h);

  function labels() {
    document.getElementById('themebtn').textContent =
      globalSet.theme === 'light' ? 'Theme: Light' : 'Theme: Dark';
    document.getElementById('awake').textContent =
      globalSet.awake ? 'Keep screen awake: ON' : 'Keep screen awake: OFF';
    document.getElementById('fontbtn').textContent =
      digitMode === 'sf' ? 'Numbers: SF style' : 'Numbers: Retro lines';
  }
  labels();

  document.getElementById('themebtn').onclick = function () {
    globalSet.theme = globalSet.theme === 'light' ? 'dark' : 'light';
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
    saveGlobal(); applyDigitMode(); labels();
  };

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

// ---------- Settings icon: a live clock inside a toothed ring ----------
function buildCog() {
  var s = document.getElementById('cogSvg');
  if (!s) return;
  var t = '';
  for (var i = 0; i < 12; i++) {
    var big = i % 3 === 0;
    t += '<line x1="20" y1="' + (big ? 0.8 : 2.2) + '" x2="20" y2="' + (big ? 5.6 : 4.6) +
      '" stroke-width="' + (big ? 2.6 : 1.8) + '" transform="rotate(' + (i * 30) + ' 20 20)"/>';
  }
  s.innerHTML =
    '<g stroke="currentColor" stroke-linecap="round">' + t + '</g>' +
    '<circle cx="20" cy="20" r="13.5" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<line id="cogH" x1="20" y1="20" x2="20" y2="13" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
    '<line id="cogM" x1="20" y1="20" x2="20" y2="10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
    '<line id="cogS" x1="20" y1="22.5" x2="20" y2="9.5" stroke="#ff5252" stroke-width="0.9" stroke-linecap="round"/>' +
    '<circle cx="20" cy="20" r="1.3" fill="currentColor"/>';
}

function rot(id, deg) {
  var e = document.getElementById(id);
  if (e) e.setAttribute('transform', 'rotate(' + deg.toFixed(1) + ' 20 20)');
}

function updateCog() {
  var n = new Date();
  var s = n.getSeconds();
  var m = n.getMinutes();
  var h = n.getHours() % 12;
  rot('cogH', h * 30 + m * 0.5);
  rot('cogM', m * 6 + s * 0.1);
  rot('cogS', s * 6);
}

// ---------- Stopwatch: milliseconds same size as minutes and seconds ----------
function csHtml(cs) {
  if (digitMode === 'sf') return '<span class="txt">.' + cs + '</span>';
  return '<svg class="dg" viewBox="0 0 24 100"><circle cx="12" cy="90" r="5" fill="currentColor"/></svg>' +
    timeHtml(cs, false);
}

function renderSw() {
  var ms = swMs();
  var f = fmtMs(ms);
  if (f.main !== lastSwMain) {
    lastSwMain = f.main;
    var main = document.getElementById('swMain');
    if (main) main.innerHTML = timeHtml(f.main, false);
  }
  if (f.cs !== lastSwCs) {
    lastSwCs = f.cs;
    var cs = document.getElementById('swCs');
    if (cs) cs.innerHTML = csHtml(f.cs);
  }

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

// ---------- Timer: wheel picker + frequently used timers ----------
var ITEM_H = 60;
var wheelTimer = null;
var selIdx = { pH: -1, pM: -1, pS: -1 };
var lastRun = false;
var PKEY = 'clockPresets';
var presets = [];

function wheelIndex(id) {
  var el = document.getElementById(id);
  return el ? Math.round(el.scrollTop / ITEM_H) : 0;
}

function wheelMs() {
  return (wheelIndex('pH') * 3600 + wheelIndex('pM') * 60 + wheelIndex('pS')) * 1000;
}

function markSelected() {
  ['pH', 'pM', 'pS'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el || !el.children.length) return;
    var idx = Math.max(0, Math.min(el.children.length - 1, Math.round(el.scrollTop / ITEM_H)));
    if (idx !== selIdx[id]) {
      if (el.children[selIdx[id]]) el.children[selIdx[id]].classList.remove('sel');
      el.children[idx].classList.add('sel');
      selIdx[id] = idx;
    }
  });
}

function readWheels() {
  if (tm.running || tm.remaining !== tm.total) return;
  var ms = wheelMs();
  tm.total = ms;
  tm.remaining = ms;
  saveTm();
}

function onWheelScroll() {
  markSelected();
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(readWheels, 120);
}

function buildWheels() {
  [['pH', 24], ['pM', 60], ['pS', 60]].forEach(function (c) {
    var el = document.getElementById(c[0]);
    if (!el) return;
    var html = '';
    for (var i = 0; i < c[1]; i++) html += '<div class="pi">' + pad(i) + '</div>';
    el.innerHTML = html;
    el.addEventListener('scroll', onWheelScroll, { passive: true });
  });
}

function setWheel(id, i) {
  var el = document.getElementById(id);
  if (el) el.scrollTop = i * ITEM_H;
}

function syncWheels() {
  var total = Math.round(tm.total / 1000);
  setWheel('pH', Math.floor(total / 3600) % 24);
  setWheel('pM', Math.floor((total % 3600) / 60));
  setWheel('pS', total % 60);
  markSelected();
}

function renderTm() {
  var ms = tmLeft();
  var inRun = tm.running || tm.remaining !== tm.total;

  var pk = document.getElementById('tmPicker');
  var rn = document.getElementById('tmRun');
  var rs = document.getElementById('tmReset');
  if (pk) pk.style.display = inRun ? 'none' : 'flex';
  if (rn) rn.style.display = inRun ? 'flex' : 'none';
  if (rs) rs.style.display = inRun ? 'flex' : 'none';
  if (lastRun && !inRun) setTimeout(syncWheels, 30);
  lastRun = inRun;

  if (inRun) {
    var str = fmtTimer(ms);
    if (str !== lastTm) {
      lastTm = str;
      var t = document.getElementById('tmTime');
      if (t) t.innerHTML = timeHtml(str, false);
    }
  }

  var go = document.getElementById('tmGo');
  if (go) {
    var k = tm.running ? 'pause' : 'play';
    if (go.getAttribute('data-k') !== k) {
      go.setAttribute('data-k', k);
      go.innerHTML = tm.running ? iconPause() : iconPlay();
    }
  }

  if (tm.running && ms <= 0) {
    tm.running = false;
    tm.remaining = tm.total;
    saveTm();
    renderTm();
    startRing('Timer finished', null);
  }
}

function fmtHMS(s) {
  return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
}

function loadPresets() {
  try {
    var p = JSON.parse(localStorage.getItem(PKEY));
    if (Array.isArray(p)) return p;
  } catch (e) {}
  return [
    { id: 'p1', name: 'Brush teeth', s: 120 },
    { id: 'p2', name: 'Face mask', s: 900 },
    { id: 'p3', name: 'Boil eggs', s: 600 },
    { id: 'p4', name: 'Nap', s: 1800 }
  ];
}

function savePresets() {
  try { localStorage.setItem(PKEY, JSON.stringify(presets)); } catch (e) {}
}

function pickPreset(ms) {
  tm.running = false;
  tm.total = ms;
  tm.remaining = ms;
  saveTm(); renderTm(); syncWheels();
}

function renderPresets() {
  var box = document.getElementById('presetList');
  if (!box) return;
  box.innerHTML = '';
  presets.forEach(function (p) {
    var row = document.createElement('div');
    row.className = 'preset';
    row.innerHTML =
      '<span class="pn">' + escapeAttr(p.name) + '</span>' +
      '<span class="pd">' + fmtHMS(p.s) + '</span>' +
      '<button class="px" aria-label="Delete">&times;</button>';
    row.onclick = function () { pickPreset(p.s * 1000); };
    row.querySelector('.px').onclick = function (e) {
      e.stopPropagation();
      presets = presets.filter(function (x) { return x !== p; });
      savePresets(); renderPresets();
    };
    box.appendChild(row);
  });
}

function openPresetSheet() {
  function opts(n) {
    var o = '';
    for (var i = 0; i < n; i++) o += '<option value="' + i + '">' + pad(i) + '</option>';
    return o;
  }
  var h = '<div class="title">Add timer</div>' +
    '<div class="row"><input type="text" id="ptName" placeholder="Name (for example Tea)" maxlength="24"></div>' +
    '<div class="row"><div class="label">Hours, minutes, seconds</div>' +
    '<select id="ptH">' + opts(24) + '</select> ' +
    '<select id="ptM">' + opts(60) + '</select> ' +
    '<select id="ptS">' + opts(60) + '</select></div>' +
    '<div class="row"><button class="btn" id="ptSave">Save</button>' +
    '<button class="btn" id="ptCancel">Cancel</button></div>';
  openSheet(h);
  document.getElementById('ptM').value = '5';

  document.getElementById('ptSave').onclick = function () {
    var s = Number(document.getElementById('ptH').value) * 3600 +
      Number(document.getElementById('ptM').value) * 60 +
      Number(document.getElementById('ptS').value);
    if (s <= 0) return;
    var name = document.getElementById('ptName').value.trim() || 'Timer';
    presets.push({ id: 'p' + Date.now(), name: name, s: s });
    savePresets(); renderPresets(); closeSheet();
  };
  document.getElementById('ptCancel').onclick = closeSheet;
}

function timerGo() {
  unlockAudio();
  if (tm.running) {
    tm.remaining = tmLeft();
    tm.running = false;
  } else {
    if (tm.remaining === tm.total) {
      var ms = wheelMs();
      tm.total = ms;
      tm.remaining = ms;
    }
    if (tm.remaining <= 0) return;
    tm.endAt = Date.now() + tm.remaining;
    tm.running = true;
  }
  saveTm(); renderTm();
}

// ---------- Tabs: refresh the timer wheels and holidays when shown ----------
function showTab(name) {
  TABS.forEach(function (t) {
    document.getElementById('v-' + t).classList.toggle('active', t === name);
    document.querySelector('#nav [data-tab="' + t + '"]').classList.toggle('active', t === name);
  });
  document.getElementById('add').style.display = name === 'home' ? 'block' : 'none';
  window.scrollTo(0, 0);
  closeSheet();
  if (name === 'timer') setTimeout(syncWheels, 50);
  if (name === 'home') renderHolidays();
}

// ---------- Holidays and important dates ----------
// Dates marked approx are moon-dependent; update this list when the government publishes the new gazette.
var HOLIDAYS = [
  { d: '2026-12-16', n: 'Victory Day', b: 'বিজয় দিবস' },
  { d: '2026-12-25', n: 'Christmas Day', b: 'বড়দিন' },
  { d: '2027-01-25', n: 'Shab-e-Barat', b: 'শবে বরাত', approx: true },
  { d: '2027-02-21', n: 'Shaheed Day', b: 'শহীদ ও মাতৃভাষা দিবস' },
  { d: '2027-03-10', n: 'Eid-ul-Fitr', b: 'ঈদুল ফিতর', approx: true },
  { d: '2027-03-26', n: 'Independence Day', b: 'স্বাধীনতা দিবস' },
  { d: '2027-04-14', n: 'Pohela Boishakh', b: 'পহেলা বৈশাখ' },
  { d: '2027-05-01', n: 'May Day', b: 'মে দিবস' },
  { d: '2027-05-17', n: 'Eid-ul-Adha', b: 'ঈদুল আযহা', approx: true },
  { d: '2027-08-05', n: 'July Uprising Day', b: 'জুলাই গণ-অভ্যুত্থান দিবস' },
  { d: '2027-12-16', n: 'Victory Day', b: 'বিজয় দিবস' },
  { d: '2027-12-25', n: 'Christmas Day', b: 'বড়দিন' }
];

function renderHolidays() {
  var box = document.getElementById('hList');
  if (!box || !HOLIDAYS) return;
  var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var items = [];

  HOLIDAYS.forEach(function (h) {
    var p = h.d.split('-');
    var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    var diff = Math.round((dt - today) / 86400000);
    if (diff >= 0) items.push({ h: h, dt: dt, diff: diff });
  });
  items.sort(function (a, b) { return a.dt - b.dt; });
  items = items.slice(0, 7);

  if (!items.length) {
    box.innerHTML = '<div class="hcard"><div class="hname">No upcoming dates</div>' +
      '<div class="hbn">Update the holiday list in js/main.js</div></div>';
    return;
  }

  box.innerHTML = items.map(function (it) {
    var left = it.diff === 0 ? 'Today' : (it.diff === 1 ? 'Tomorrow' : 'in ' + it.diff + ' days');
    var wd = it.dt.toLocaleDateString('en-GB', { weekday: 'short' });
    return '<div class="hcard">' +
      '<div class="hdate"><span class="hmon">' + MON[it.dt.getMonth()] + '</span>' +
      '<span class="hday">' + (it.h.approx ? '~' : '') + it.dt.getDate() + '</span>' +
      '<span class="hwd">' + wd + '</span></div>' +
      '<div class="hname">' + it.h.n + '</div>' +
      '<div class="hbn">' + it.h.b + '</div>' +
      '<div class="hleft' + (it.diff <= 7 ? ' soon' : '') + '">' + left + '</div>' +
      '</div>';
  }).join('');
}

// ---------- Start round 4 ----------
presets = loadPresets();
digitMode = globalSet.font === 'retro' ? 'retro' : 'sf';
applyTheme();

document.getElementById('cog').onclick = openSettings;
document.getElementById('pAdd').onclick = openPresetSheet;
document.getElementById('tmGo').onclick = timerGo;

buildWheels();
buildCog();
updateCog();
applyDigitMode();
renderPresets();
renderHolidays();
syncWheels();

setInterval(updateCog, 1000);
setInterval(renderHolidays, 60000);
// ======================= Round 6: fonts, pen button, glass, haptics, live classic clock =======================

// ---------- 1. Fonts and styles (injected, so no CSS file needs to be edited) ----------
(function () {
  if (!document.querySelector('link[data-r6]')) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.setAttribute('data-r6', '1');
    l.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&display=swap';
    document.head.appendChild(l);
  }

  var css = [
    '@font-face{font-family:"ClockNum";src:url("digits.ttf") format("truetype");font-weight:100 900;font-style:normal;font-display:swap;unicode-range:U+0030-0039}',
    ':root{--sf:"ClockNum","Poppins",system-ui,-apple-system,"Roboto",sans-serif}',
    'html,body,button,input,select,textarea,svg text,.time .txt,.hcard,.preset,.btn{font-family:var(--sf)!important}',
    '*{font-weight:700!important}',
    '.atitle,.title,.hname{font-weight:800!important;letter-spacing:-0.03em}',
    'body{letter-spacing:-0.01em}',
    'body .time .txt{font-size:min(calc(var(--size)*1),20vw);letter-spacing:0;line-height:1}',
    'body .time .n{width:auto!important;margin:0}',

    /* soft colour behind everything so the glass has something to blur */
    'body::before{content:"";position:fixed;inset:-10%;z-index:-1;pointer-events:none;background:' +
      'radial-gradient(40% 28% at 12% 8%,rgba(255,106,92,.20),transparent 70%),' +
      'radial-gradient(46% 34% at 92% 38%,rgba(74,140,247,.20),transparent 70%),' +
      'radial-gradient(42% 30% at 28% 96%,rgba(48,209,88,.14),transparent 70%)}',
    'body.light::before{opacity:.7}',

    /* holidays: vertical glass list */
    '#holidays{padding:4px 0 112px!important;animation:none!important}',
    '.hhead{padding:0 22px 8px!important}',
    '#hList{flex-direction:column!important;gap:10px!important;max-height:226px;overflow-y:auto!important;overflow-x:hidden!important;padding:0 16px 10px!important;scroll-snap-type:y proximity!important;overscroll-behavior:contain}',
    '.hcard{width:auto!important;flex:none!important;display:flex!important;align-items:center;gap:14px;padding:12px 16px!important;border-radius:22px!important;scroll-snap-align:start;' +
      'background:rgba(255,255,255,.07)!important;-webkit-backdrop-filter:blur(18px) saturate(1.6);backdrop-filter:blur(18px) saturate(1.6);' +
      'border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 24px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.2);transition:transform .12s ease}',
    '.hcard:active{transform:scale(.97)}',
    'body.light .hcard{background:rgba(255,255,255,.6)!important;border-color:rgba(255,255,255,.8);box-shadow:0 8px 24px rgba(0,0,0,.08),inset 0 1px 0 rgba(255,255,255,.9)}',
    '.hd{display:flex;flex-direction:column;align-items:center;min-width:44px}',
    '.hd .hmon{font-size:12px;letter-spacing:.06em}',
    '.hd .hday{font-size:30px;line-height:1.05}',
    '.hmid{flex:1;min-width:0}',
    '.hmid .hname{margin-top:0;font-size:16px}',
    '.hright{display:flex;flex-direction:column;align-items:flex-end;gap:6px}',
    '.hright .hleft{margin-top:0}',
    '.hwd{margin-left:0}',
    '#stage{padding:64px 12px 12px!important}',

    /* settings: blurred background and a glass panel under the pen icon */
    '#overlay.open{background:rgba(0,0,0,.28)!important;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}',
    'body.light #overlay.open{background:rgba(255,255,255,.25)!important}',
    '#sheet{background:rgba(30,32,38,.62)!important;-webkit-backdrop-filter:blur(26px) saturate(1.6);backdrop-filter:blur(26px) saturate(1.6);' +
      'border:1px solid rgba(255,255,255,.16);box-shadow:0 20px 50px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.2)}',
    'body.light #sheet{background:rgba(255,255,255,.72)!important;border-color:rgba(255,255,255,.85);box-shadow:0 20px 50px rgba(0,0,0,.15),inset 0 1px 0 rgba(255,255,255,.9)}',
    '@keyframes popIn{from{opacity:0;transform:scale(.86) translateY(-8px)}to{opacity:1;transform:none}}',
    '#sheet.open.pop{left:auto!important;right:12px!important;bottom:auto!important;top:calc(64px + env(safe-area-inset-top,0px))!important;width:min(90vw,340px);max-height:calc(100vh - 150px);border-radius:24px!important;transform-origin:top right;animation:popIn .28s cubic-bezier(.22,.8,.25,1) both}',

    /* the pen button (works like a click pen) */
    '#cog{width:46px;height:46px;padding:4px!important;opacity:1!important;font-size:0}',
    '.pen{position:relative;display:block;width:38px;height:38px}',
    '.pen img{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;user-select:none;-webkit-user-drag:none;transition:transform .14s cubic-bezier(.3,1.8,.5,1)}',
    '#cog.out .pt{transform:translate(-1.4px,1.4px)}',
    '#cog.out .pc{transform:translate(-.7px,.7px)}',
    '#cog.press .pr{transform:scale(.94)}',
    '#cog.press .pc{transform:translate(-1.8px,1.8px)}',
    '#cog.press .pb{transform:translate(-.5px,.5px)}',
    '#cog.press .pt{transform:translate(-1px,1px)}',
    'body.light .pen img{filter:invert(1)}',

    /* classic clock widget */
    '.clsvg{width:calc(var(--size)*3.5);height:calc(var(--size)*3.5);filter:drop-shadow(0 8px 18px rgba(0,0,0,.35))}'
  ].join('\n');

  var st = document.createElement('style');
  st.id = 'r6css';
  st.textContent = css;
  document.head.appendChild(st);
})();

// ---------- 2. Haptic feedback (Android phones) ----------
function haptic(p) {
  try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {}
}

// ---------- 3. Settings: blurred background and a glass popover ----------
function openSheet(html) {
  sheet.classList.remove('pop');
  sheet.innerHTML = html;
  sheet.classList.add('open');
  overlay.classList.add('open');
}

function relabelFont() {
  var fb = document.getElementById('fontbtn');
  if (fb) fb.textContent = digitMode === 'sf' ? 'Numbers: Bold style' : 'Numbers: Retro lines';
}

var prevOpenSettings = openSettings;
openSettings = function () {
  prevOpenSettings();
  sheet.classList.add('pop');
  var fb = document.getElementById('fontbtn');
  if (fb) {
    relabelFont();
    fb.addEventListener('click', function () { setTimeout(relabelFont, 0); });
  }
};

// ---------- 4. The pen button ----------
var penOut = false;

function setPenOut(on) {
  if (on === penOut) return;
  penOut = on;
  var c = document.getElementById('cog');
  if (c) c.classList.toggle('out', on);
  haptic(on ? 8 : 10);
}

function buildPen() {
  var cog = document.getElementById('cog');
  if (!cog) return;
  cog.innerHTML =
    '<span class="pen">' +
    '<img class="pr" src="pen-ring.png" alt="">' +
    '<img class="pb" src="pen-body.png" alt="">' +
    '<img class="pc" src="pen-cap.png" alt="">' +
    '<img class="pt" src="pen-tip.png" alt="">' +
    '</span>';
  cog.setAttribute('aria-label', 'Settings');

  cog.addEventListener('pointerdown', function () {
    cog.classList.add('press');
    haptic(10);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    cog.addEventListener(ev, function () { cog.classList.remove('press'); });
  });
  cog.onclick = function () { openSettings(); };

  new MutationObserver(function () {
    setPenOut(sheet.classList.contains('open') && sheet.classList.contains('pop'));
  }).observe(sheet, { attributes: true, attributeFilter: ['class'] });
}

// ---------- 5. Holidays: vertical glass list with haptic ticks ----------
function renderHolidays() {
  var box = document.getElementById('hList');
  if (!box || !HOLIDAYS) return;
  var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var items = [];

  HOLIDAYS.forEach(function (h) {
    var p = h.d.split('-');
    var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    var diff = Math.round((dt - today) / 86400000);
    if (diff >= 0) items.push({ h: h, dt: dt, diff: diff });
  });
  items.sort(function (a, b) { return a.dt - b.dt; });
  items = items.slice(0, 7);

  if (!items.length) {
    box.innerHTML = '<div class="hcard"><div class="hmid"><div class="hname">No upcoming dates</div>' +
      '<div class="hbn">Update the holiday list in js/main.js</div></div></div>';
    return;
  }

  box.innerHTML = items.map(function (it) {
    var left = it.diff === 0 ? 'Today' : (it.diff === 1 ? 'Tomorrow' : 'in ' + it.diff + ' days');
    var wd = it.dt.toLocaleDateString('en-GB', { weekday: 'short' });
    return '<div class="hcard">' +
      '<div class="hd"><span class="hmon">' + MON[it.dt.getMonth()] + '</span>' +
      '<span class="hday">' + (it.h.approx ? '~' : '') + it.dt.getDate() + '</span></div>' +
      '<div class="hmid"><div class="hname">' + it.h.n + '</div>' +
      '<div class="hbn">' + it.h.b + '</div></div>' +
      '<div class="hright"><span class="hleft' + (it.diff <= 7 ? ' soon' : '') + '">' + left + '</span>' +
      '<span class="hwd">' + wd + '</span></div>' +
      '</div>';
  }).join('');
}

function initHolidayList() {
  var home = document.getElementById('v-home');
  var hol = document.getElementById('holidays');
  if (home && hol) home.appendChild(hol);      // clock first, list below it

  var box = document.getElementById('hList');
  if (!box) return;

  var lastIdx = 0;
  box.addEventListener('scroll', function () {
    var first = box.querySelector('.hcard');
    var rowH = first ? first.offsetHeight + 10 : 80;
    var idx = Math.round(box.scrollTop / rowH);
    if (idx !== lastIdx) {
      lastIdx = idx;
      haptic(7);
    }
  }, { passive: true });

  box.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.hcard')) haptic(10);
  });
}

// ---------- 6. Classic clock widget (same face as the app icon, hands always moving) ----------
TYPE_NAMES.classic = 'Classic clock';

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

function classicSvg() {
  var t = '';
  for (var i = 0; i < 60; i++) {
    var hr = i % 5 === 0;
    t += '<line x1="100" y1="12" x2="100" y2="' + (hr ? 27 : 19) + '" stroke="' +
      (hr ? '#4a4a4c' : '#c9c9cd') + '" stroke-width="' + (hr ? 3.2 : 1.6) +
      '" transform="rotate(' + (i * 6) + ' 100 100)"/>';
  }
  var nums = [['12', 100, 62], ['3', 145, 107], ['6', 100, 152], ['9', 55, 107]];
  var n = '';
  nums.forEach(function (q) {
    n += '<text x="' + q[1] + '" y="' + q[2] + '" text-anchor="middle" font-size="22" fill="#47474a">' + q[0] + '</text>';
  });
  return '<svg class="clsvg" viewBox="0 0 200 200">' +
    '<rect x="4" y="4" width="192" height="192" rx="46" fill="#fbfbfb"/>' +
    t + n +
    '<line class="ch" x1="100" y1="106" x2="100" y2="62" stroke="#111113" stroke-width="7.5" stroke-linecap="round"/>' +
    '<line class="cm" x1="100" y1="106" x2="100" y2="38" stroke="#111113" stroke-width="6" stroke-linecap="round"/>' +
    '<line class="cs2" x1="100" y1="118" x2="100" y2="34" stroke="#ff9f0a" stroke-width="2.4" stroke-linecap="round"/>' +
    '<circle cx="100" cy="100" r="6.5" fill="#111113"/>' +
    '<circle cx="100" cy="100" r="2.6" fill="#ff9f0a"/></svg>';
}

function setClassic(el, now) {
  var s = now.getSeconds() + now.getMilliseconds() / 1000;
  var m = now.getMinutes() + s / 60;
  var h = (now.getHours() % 12) + m / 60;
  rotate(el, '.ch', h * 30);
  rotate(el, '.cm', m * 6);
  rotate(el, '.cs2', s * 6);
}

function buildWidget(w) {
  const el = document.createElement('div');
  el.className = 'widget';
  el.dataset.id = w.id;
  el.dataset.type = w.type;
  let inner = '';
  if (w.type === 'digital') {
    inner = '<div class="time"></div>';
  } else if (w.type === 'world') {
    inner = '<div class="wlabel">' + zoneName(w.zone) + '</div><div class="time"></div>';
  } else if (w.type === 'analog') {
    inner = analogSvg();
  } else if (w.type === 'classic') {
    inner = classicSvg();
  } else {
    inner = '<div class="datetxt"><div class="wd"></div><div class="dm"></div></div>';
  }
  el.innerHTML = inner;
  el.onclick = function () { openEdit(w.id); };
  return el;
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
  } else if (w.type === 'classic') {
    setClassic(el, now);
  } else {
    el.querySelector('.wd').textContent =
      now.toLocaleDateString('en-GB', { weekday: 'long' });
    el.querySelector('.dm').textContent =
      now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  }
}

// smooth sweeping hands, about 60 times a second
function sweepLoop() {
  var list = document.querySelectorAll('[data-type="classic"]');
  if (list.length) {
    var now = new Date();
    for (var i = 0; i < list.length; i++) setClassic(list[i], now);
  }
  requestAnimationFrame(sweepLoop);
}

// ---------- Start round 6 ----------
buildPen();
initHolidayList();
renderHolidays();
applyDigitMode();
requestAnimationFrame(sweepLoop);
