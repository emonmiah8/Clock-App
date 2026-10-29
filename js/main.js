/* ==========================================================================
   CLOCK APP - main.js
   1 Config & state        7 Home widgets            13 Timer & presets
   2 Helpers & icons       8 Sheet system, settings  14 Upcoming (dynamic)
   3 Injected styles       9 Edit / Add widget       15 Press feedback, nav
   4 Storage              10 Tabs                    16 Connection, permissions, SW
   5 Tones & ringing      11 Alarms                  17 Init
   6 Digits & time HTML   12 Stopwatch
   ========================================================================== */

/* ==========================================================================
   1. CONFIG & STATE
   ========================================================================== */
const KEY = 'clockWidgets';
const AKEY = 'clockAlarms';
const TKEY = 'clockTimer';
const GKEY = 'clockGlobal';
const PKEY = 'clockPresets';
const PLKEY = 'clockPlace';
const PLASKED = 'clockPlaceAsked';
const NOTIF_ASKED = 'clockNotifAsked';
const CUSTOM_KEY = 'customUpcomingEvents';
const HKEY = 'clockHol_';
const IPKEY = 'clockIpCc';
const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const HOL_URL = 'https://date.nager.at/api/v3/PublicHolidays/';
const PACK_URL = 'days/';                      // fallback: days/BD.json, days/IN.json ...
const PLACE_FRESH_MS = 20 * 60 * 1000;
const HOL_TTL = 7 * 24 * 3600 * 1000;          // holidays refresh by themselves every 7 days
const RETRY_TTL = 24 * 3600 * 1000;            // no data found: ask again after 1 day

const RETRO = ['#4aa3d8', '#ef5b55', '#f4f1ea'];
const COLORS = ['#ffffff', '#4fc3f7', '#81c784', '#ffb74d', '#f06292'];
const TYPE_NAMES = {
  digital: 'Digital clock',
  analog: 'Analog clock',
  date: 'Date',
  home: 'My location clock',
  world: 'World clock (search)',
  classic: 'Classic clock'
};
const BGS_DARK = [['#000000', 'Black'], ['#0e1014', 'Charcoal'], ['#0b1426', 'Navy'], ['#1a1410', 'Brown'], ['#0f1a14', 'Forest']];
const BGS_LIGHT = [['#ffffff', 'White'], ['#f2f2f7', 'Gray'], ['#fbf5ea', 'Cream'], ['#eaf2ff', 'Sky'], ['#eaf6ee', 'Mint']];
const TABS = ['home', 'alarm', 'stopwatch', 'timer'];
const ITEM_H = 60;

let widgets = loadWidgets();
let alarms = loadAlarms();
let presets = loadPresets();
let globalSet = loadGlobal();
let digitMode = globalSet.font === 'retro' ? 'retro' : 'sf';
let alarmEditMode = false;
let myPlace = loadMyPlace();
let lastDeviceZone = deviceZone();
let geoAbort = null;
let geoStatus = 'idle';
let geoBusy = null;
let searchSeq = 0;
let zoneIndex = null;
const searchCache = {};
const searchKeys = [];
let swReg = null;
let toastTimer = null;
let closeTimer = null;

let sw = { running: false, start: 0, elapsed: 0, laps: [] };
let lastSwMain = '';
let lastSwCs = '';

let tm = { total: 300000, remaining: 300000, running: false, endAt: 0 };
try {
  const t = JSON.parse(localStorage.getItem(TKEY));
  if (t && typeof t.total === 'number') tm = Object.assign(tm, t);
} catch (e) {}
let lastTm = '';
let lastRun = false;
let wheelTimer = null;
const selIdx = { pH: -1, pM: -1, pS: -1 };

let actx = null;
let ringTimer = null;
let ringSnoozeFn = null;
let ringOn = false;
let snoozeAt = 0;
let wakeLock = null;
let penOut = false;
let plusOut = false;

let lastFt = -1, lastFb = -1, lastSh = -1;
let cachedFt = 34;
let lastMeasure = 0;
let fadeQueued = false;

const sheet = document.getElementById('sheet');
const overlay = document.getElementById('overlay');

/* ==========================================================================
   2. HELPERS & ICONS
   ========================================================================== */
function pad(n) { return String(n).padStart(2, '0'); }
function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function haptic(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

// click point for the pop-in origin
function pt(e) {
  if (!e || e.clientX == null || (e.clientX === 0 && e.clientY === 0)) return null;
  return { x: e.clientX, y: e.clientY };
}

// iOS (SF Symbols) style icons: change them here only
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.6v12.8l10.6-6.4z" fill="currentColor" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.6" y="4.4" width="4.6" height="15.2" rx="1.6"/><rect x="13.8" y="4.4" width="4.6" height="15.2" rx="1.6"/></svg>',
  lap: '<svg viewBox="0 0 24 24"><path d="M6 21V3.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M6.6 4.8h11.2l-2.8 4.2 2.8 4.2H6.6z" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12a7 7 0 1 0 2.05-4.95"/><path d="M11 7.05H7.05V3.1"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};

function setIcon(id, svg, label) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = svg;
  if (label) el.setAttribute('aria-label', label);
}

/* ==========================================================================
   3. INJECTED STYLES
   ========================================================================== */
function buildListMask() {
  const STEPS = 8;
  const top = [];
  const bot = [];
  for (let q = 0; q <= STEPS; q++) {
    const f = q / STEPS;
    const a = 3 * f * f - 2 * f * f * f;
    top.push('rgba(0,0,0,' + a.toFixed(3) + ') calc(var(--ft,34px) + ' + (f * 98).toFixed(1) + 'px - var(--sh,0px))');
    bot.push('rgba(0,0,0,' + (1 - a).toFixed(3) + ') calc(100% - var(--fb,92px) - ' + ((1 - f) * 98).toFixed(1) + 'px)');
  }
  return 'linear-gradient(to bottom,transparent 0,' + top.join(',') + ',' + bot.join(',') + ')';
}

function injectStyles() {
  if (navigator.onLine !== false && !document.querySelector('link[data-clock-font]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.setAttribute('data-clock-font', '1');
    l.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&display=swap';
    document.head.appendChild(l);
  }

  const MASK = buildListMask();
  const css = `
@font-face{font-family:"ClockNum";src:url("digits.ttf") format("truetype");font-weight:100 900;font-style:normal;font-display:swap;unicode-range:U+0030-0039}
:root{--sf:"ClockNum","Poppins",system-ui,-apple-system,"Roboto",sans-serif;--outer:0 12px 26px rgba(0,0,0,.38),0 2px 6px rgba(0,0,0,.3)}
body.light{--outer:0 10px 22px rgba(0,0,0,.20),0 2px 5px rgba(0,0,0,.14)}
html,body,button,input,select,textarea,svg text,.time .txt,.hcard,.preset,.btn{font-family:var(--sf)!important}
*{font-weight:700!important}
.atitle,.title,.hname{font-weight:800!important;letter-spacing:-0.03em}
body{letter-spacing:-0.01em}
body .time .txt{font-size:min(calc(var(--size)*1),20vw);letter-spacing:0;line-height:1}
#stage{padding:64px 12px 12px!important;margin:0 auto!important}

body::before{content:"";position:fixed;inset:-10%;z-index:-1;pointer-events:none;background:radial-gradient(40% 28% at 12% 8%,rgba(255,106,92,.20),transparent 70%),radial-gradient(46% 34% at 92% 38%,rgba(74,140,247,.20),transparent 70%),radial-gradient(42% 30% at 28% 96%,rgba(48,209,88,.14),transparent 70%)}
body.light::before{opacity:.7}

#holidays{position:relative!important;flex:1 1 auto!important;display:flex!important;flex-direction:column;min-height:300px;padding:0!important;animation:none!important}
.hhead{position:absolute!important;left:0;right:0;top:0;z-index:3;display:flex!important;justify-content:space-between;align-items:center;padding:12px 22px 10px!important;white-space:nowrap;pointer-events:none;font-size:13px;letter-spacing:.08em}
.hhead::before{display:none!important}
.hsub{font-size:11px;letter-spacing:0;white-space:nowrap}
#hList{flex:1 1 0!important;flex-direction:column!important;gap:10px!important;min-height:220px;max-height:none!important;overflow-y:auto!important;overflow-x:hidden!important;padding:calc(var(--ft,34px) + 16px) 16px calc(var(--fb,92px) + 134px)!important;scroll-snap-type:none!important;overscroll-behavior-x:contain;overscroll-behavior-y:none!important;touch-action:pan-y;-webkit-mask-image:${MASK}!important;mask-image:${MASK}!important}
.hcard{width:auto!important;flex:none!important;display:flex!important;align-items:center;gap:14px;padding:12px 16px!important;border-radius:22px!important;background:linear-gradient(150deg,rgba(255,255,255,.12),rgba(255,255,255,.05))!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 24px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.2);transition:scale .12s ease!important}
.hcard:active{scale:.97}
body.light .hcard{background:linear-gradient(150deg,rgba(255,255,255,.88),rgba(255,255,255,.64))!important;border-color:rgba(255,255,255,.8);box-shadow:0 8px 24px rgba(0,0,0,.08),inset 0 1px 0 rgba(255,255,255,.9)}
.hd{display:flex;flex-direction:column;align-items:center;min-width:44px}
.hd .hmon{font-size:12px;letter-spacing:.06em}
.hd .hday{font-size:30px;line-height:1.05}
.hmid{flex:1;min-width:0}
.hmid .hname{margin-top:0;font-size:16px}
.hright{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.hright .hleft{margin-top:0}
.hwd{margin-left:0}
.t-h .hmon{color:#ff6a5c}
.t-i .hmon{color:#4a8cf7}
.t-r .hmon{color:#30d158}

.pb{position:absolute;left:0;right:0;z-index:2;pointer-events:none}
.pbl{position:absolute;left:0;right:0;top:0;bottom:0}
#pbTop{top:0;height:calc(var(--ft,34px) + 98px)}
#pbBot{bottom:calc(var(--fb,92px) - 14px);height:112px}

/* ---- every sheet opens as the same pop-in card ---- */
#overlay.open{background:rgba(0,0,0,.28)!important;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
body.light #overlay.open{background:rgba(255,255,255,.25)!important}
#sheet{background:rgba(30,32,38,.62)!important;-webkit-backdrop-filter:blur(26px) saturate(1.6);backdrop-filter:blur(26px) saturate(1.6);border:1px solid rgba(255,255,255,.16);box-shadow:0 20px 50px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.2)}
body.light #sheet{background:rgba(255,255,255,.72)!important;border-color:rgba(255,255,255,.85);box-shadow:0 20px 50px rgba(0,0,0,.15),inset 0 1px 0 rgba(255,255,255,.9)}
@keyframes popIn{from{opacity:0;transform:scale(.86) translateY(-8px)}to{opacity:1;transform:none}}
@keyframes popOut{from{opacity:1;transform:none}to{opacity:0;transform:scale(.88) translateY(-6px)}}
#sheet:not(.open){pointer-events:none}
#sheet.open{left:auto!important;right:12px!important;bottom:auto!important;top:calc(64px + env(safe-area-inset-top,0px))!important;width:min(90vw,340px)!important;max-height:calc(100vh - 150px);max-height:calc(100dvh - 150px);overflow-y:auto;border-radius:24px!important;animation:popIn .28s cubic-bezier(.22,.8,.25,1) both}
#sheet.open.closing{animation:popOut .16s ease both;pointer-events:none}
#sheet select{max-width:100%}

#cog{width:46px;height:46px;padding:0!important;opacity:1!important;display:flex!important;align-items:center;justify-content:center;font-size:0}
.dots{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;pointer-events:none;transition:transform .38s cubic-bezier(.3,1.5,.5,1)}
.dots i{display:block;width:4px;height:4px;border-radius:50%;background:currentColor;transition:transform .16s cubic-bezier(.3,1.8,.5,1),opacity .2s ease}
#cog.press .dots i{transform:scale(.68)}
#cog.out .dots{transform:rotate(90deg)}

.plusi{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;pointer-events:none;transition:transform .38s cubic-bezier(.3,1.5,.5,1)}
#add.out .plusi{transform:rotate(135deg)}

#toast{position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom,0px));transform:translate(-50%,12px);z-index:70;display:flex;align-items:center;gap:12px;max-width:min(92vw,420px);padding:11px 16px;border-radius:999px;background:rgba(30,32,38,.72);color:#fff;-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6);border:1px solid rgba(255,255,255,.16);box-shadow:0 10px 30px rgba(0,0,0,.4);font-size:14px;line-height:1.3;opacity:0;pointer-events:none;transition:opacity .25s ease,transform .25s ease}
#toast.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}
#toast .tact{background:none;border:0;color:#ff9f0a;padding:0;font-size:14px;white-space:nowrap}
body.light #toast{background:rgba(255,255,255,.85);color:#1c1c1e;border-color:rgba(255,255,255,.9);box-shadow:0 10px 30px rgba(0,0,0,.15)}
.pstate{opacity:.85;margin-right:auto}
.phint{font-size:12px;opacity:.7;line-height:1.35;margin:-2px 0 8px}

.wdate{margin-top:6px;opacity:.8}
.woff{margin-top:2px!important;opacity:.6}
.clsvg{width:calc(var(--size)*3.5);height:calc(var(--size)*3.5);filter:drop-shadow(0 8px 18px rgba(0,0,0,.35))}

/* ---- tone picker ---- */
.tonebox{max-height:50vh;overflow-y:auto;margin:0 -4px 10px;padding:0 4px}
.tgrp{font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.6;margin:12px 4px 6px}
.trow{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:11px 14px;margin-bottom:6px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:inherit;font-size:15px;text-align:left}
body.light .trow{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.08)}
.trow .chk{opacity:0;color:#ff9f0a;font-size:16px}
.trow.sel{border-color:#ff9f0a}
.trow.sel .chk{opacity:1}

#swHand line{stroke:#ff9f0a!important}
#swHand circle:first-of-type{fill:#ff9f0a!important}
.dialtime .cs,.dialtime .time.cs,#swCs{color:#ff9f0a!important}
.dialwrap{isolation:isolate}
#dg stop{stop-opacity:.82}
#bz stop{stop-opacity:.92}
.dialwrap::before{content:"";position:absolute;inset:.8%;border-radius:50%;z-index:-1;background:rgba(255,255,255,.05);-webkit-backdrop-filter:blur(22px) saturate(1.9) brightness(.6);backdrop-filter:blur(22px) saturate(1.9) brightness(.6);box-shadow:0 26px 50px rgba(0,0,0,.45),0 8px 18px rgba(0,0,0,.35)}
.dialwrap::after{content:"";position:absolute;inset:.8%;border-radius:50%;z-index:3;pointer-events:none;background:radial-gradient(50% 32% at 28% 9%,rgba(255,255,255,.24),rgba(255,255,255,0) 72%),radial-gradient(55% 36% at 72% 96%,rgba(255,255,255,.10),rgba(255,255,255,0) 72%),linear-gradient(155deg,rgba(255,255,255,.10),rgba(255,255,255,0) 38%);box-shadow:inset 0 2px 2px rgba(255,255,255,.55),inset 0 -3px 6px rgba(255,255,255,.12),inset 0 0 0 1.5px rgba(255,255,255,.14),inset 10px 14px 34px rgba(255,255,255,.06),inset -14px -20px 44px rgba(0,0,0,.40)}

.round,.fab{position:relative;isolation:isolate;display:flex;align-items:center;justify-content:center;transition:transform .22s cubic-bezier(.3,1.6,.5,1),box-shadow .2s ease!important}
.round{-webkit-backdrop-filter:blur(16px) saturate(1.9);backdrop-filter:blur(16px) saturate(1.9)}
.round::before,.fab::before{content:"";position:absolute;left:15%;right:15%;top:5%;height:42%;border-radius:50%;background:linear-gradient(rgba(255,255,255,.5),rgba(255,255,255,0));pointer-events:none}
.round:active,.fab:active{transform:scale(.92)!important}
.round svg,.fab svg{position:relative;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.45))}
.round:not(.main){background:linear-gradient(150deg,rgba(255,255,255,.24),rgba(255,255,255,.05) 55%,rgba(255,255,255,.13))!important;-webkit-backdrop-filter:blur(20px) saturate(2);backdrop-filter:blur(20px) saturate(2);border:1px solid rgba(255,255,255,.38)!important;box-shadow:inset 0 1.5px 1px rgba(255,255,255,.8),inset 0 -2px 3px rgba(255,255,255,.18),inset 0 0 18px rgba(255,255,255,.12),inset -5px -7px 12px rgba(255,255,255,.06),var(--outer)!important}
body.light .round:not(.main){background:linear-gradient(150deg,rgba(255,255,255,.75),rgba(255,255,255,.28) 55%,rgba(255,255,255,.55))!important;border-color:rgba(255,255,255,.95)!important;color:#1c1c1e;box-shadow:inset 0 1.5px 1px rgba(255,255,255,.95),inset 0 -2px 3px rgba(0,0,0,.06),inset 0 0 16px rgba(255,255,255,.5),var(--outer)!important}
body.light .round:not(.main) svg{filter:drop-shadow(0 1px 1px rgba(255,255,255,.7))}
.round.main,.fab{background:linear-gradient(150deg,rgba(255,200,120,.96),rgba(255,150,30,.82) 55%,rgba(236,112,0,.74))!important;border:1px solid rgba(255,236,205,.65)!important;color:#fff;box-shadow:inset 0 2px 1.5px rgba(255,255,255,.9),inset 0 -3px 5px rgba(255,255,255,.22),inset 0 0 22px rgba(255,255,255,.2),inset -8px -10px 20px rgba(170,70,0,.38),0 14px 34px rgba(255,140,20,.45),0 0 30px rgba(255,159,10,.35)!important}
.round.main::before,.fab::before{top:4%;height:44%;background:linear-gradient(rgba(255,255,255,.62),rgba(255,255,255,0))}
.phead button{color:#ff9f0a!important}

@keyframes waveOrange{0%{opacity:.9;transform:scale(1);box-shadow:0 0 0 0 rgba(255,159,10,.7),0 0 26px 8px rgba(255,170,40,.75)}100%{opacity:0;transform:scale(2.2);box-shadow:0 0 0 0 rgba(255,159,10,0),0 0 46px 20px rgba(255,170,40,0)}}
@keyframes waveWhite{0%{opacity:.9;transform:scale(1);box-shadow:0 0 0 0 rgba(255,255,255,.55),0 0 22px 6px rgba(255,255,255,.55)}100%{opacity:0;transform:scale(1.9);box-shadow:0 0 0 0 rgba(255,255,255,0),0 0 40px 16px rgba(255,255,255,0)}}
@keyframes waveGray{0%{opacity:.9;transform:scale(1);box-shadow:0 0 0 0 rgba(90,100,130,.35),0 0 22px 6px rgba(90,100,130,.35)}100%{opacity:0;transform:scale(1.9);box-shadow:0 0 0 0 rgba(90,100,130,0),0 0 40px 16px rgba(90,100,130,0)}}
.round::after,.fab::after{content:"";position:absolute;inset:0;border-radius:50%;pointer-events:none;opacity:0}
.round.main.lit::after,.fab.lit::after{animation:waveOrange .65s cubic-bezier(.2,.7,.3,1) both}
.round:not(.main).lit::after{animation:waveWhite .6s cubic-bezier(.2,.7,.3,1) both}
body.light .round:not(.main).lit::after{animation-name:waveGray}

#nav button{transition:background-color .14s ease,opacity .14s ease,transform .1s ease!important}
#nav button:active{transform:scale(.94)}
#nav button::after{display:none!important}
`;

  const st = document.createElement('style');
  st.id = 'clockCss';
  st.textContent = css;
  document.head.appendChild(st);
}

/* ==========================================================================
   4. STORAGE
   ========================================================================== */
function defaultWidgets() { return [newWidget('digital'), newWidget('date')]; }

function loadWidgets() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const a = JSON.parse(s);
      if (Array.isArray(a)) {
        a.forEach(function (w) {
          if (w.type === 'world' && w.auto) {
            w.type = 'home';
            delete w.zone; delete w.city; delete w.auto;
          }
        });
        return a;
      }
    }
  } catch (e) {}
  return defaultWidgets();
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
  let g = {
    bg: '#000000', bgLight: '#f2f2f7', theme: 'dark', awake: false, font: 'sf', country: 'auto',
    alarmTone: 'i1', timerTone: 'i2', customName: ''
  };
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

function loadMyPlace() {
  try {
    const p = JSON.parse(localStorage.getItem(PLKEY));
    if (p && typeof p.name === 'string') return p;
  } catch (e) {}
  return { name: '', tz: '', cc: '', ts: 0 };
}
function saveMyPlace() { try { localStorage.setItem(PLKEY, JSON.stringify(myPlace)); } catch (e) {} }

function saveTm() { try { localStorage.setItem(TKEY, JSON.stringify(tm)); } catch (e) {} }

/* ---- IndexedDB: keeps the custom tone file ---- */
function idb() {
  return new Promise(function (res, rej) {
    const r = indexedDB.open('clockTones', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('t'); };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}
function idbGet(k) {
  return idb().then(function (db) {
    return new Promise(function (res, rej) {
      const q = db.transaction('t').objectStore('t').get(k);
      q.onsuccess = function () { res(q.result || null); };
      q.onerror = function () { rej(q.error); };
    });
  });
}
function idbSet(k, v) {
  return idb().then(function (db) {
    return new Promise(function (res, rej) {
      const tx = db.transaction('t', 'readwrite');
      tx.objectStore('t').put(v, k);
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
    });
  });
}
function idbDel(k) {
  return idb().then(function (db) {
    return new Promise(function (res, rej) {
      const tx = db.transaction('t', 'readwrite');
      tx.objectStore('t').delete(k);
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
    });
  });
}

/* ==========================================================================
   5. TONES & RINGING
   --------------------------------------------------------------------------
   20 built-in tones (iPhone, Samsung and Pixel style, made by the browser,
   so they work offline) + one custom tone from your own audio file.
   n = notes [midi, start s, length s]   w = wave   ov = [overtone ratio, gain]
   ========================================================================== */
const TONE_GROUPS = ['iPhone style', 'Samsung style', 'Pixel style'];
const TONES = [
  { id: 'i1', g: 0, name: 'Marimba', w: 'sine', ov: [4, 0.3], len: 1.6, n: [[76, 0, .3], [79, .12, .3], [83, .24, .3], [79, .36, .3], [76, .48, .3], [79, .6, .3], [83, .72, .3], [88, .84, .5]] },
  { id: 'i2', g: 0, name: 'Radar', w: 'sine', env: 'soft', len: 1.5, n: [[84, 0, .22], [88, .26, .22], [84, .52, .22], [88, .78, .22], [91, 1.04, .3]] },
  { id: 'i3', g: 0, name: 'Chimes', w: 'sine', ov: [2.76, .4], len: 2.2, n: [[88, 0, .9], [84, .35, .9], [91, .7, 1.2]] },
  { id: 'i4', g: 0, name: 'Bells', w: 'sine', ov: [2.4, .35], len: 2.2, n: [[79, 0, 1], [79, .5, 1], [79, 1, 1.2]] },
  { id: 'i5', g: 0, name: 'Beacon', w: 'sine', env: 'soft', len: 2.2, n: [[72, 0, .6], [79, .5, .6], [84, 1, .8]] },
  { id: 'i6', g: 0, name: 'Ripples', w: 'sine', ov: [3, .25], len: 1.6, n: [[84, 0, .5], [88, .15, .5], [84, .3, .5], [91, .45, .5], [88, .6, .7]] },
  { id: 'i7', g: 0, name: 'Slow Rise', w: 'sine', env: 'soft', len: 2.6, n: [[67, 0, .5], [72, .5, .5], [76, 1, .5], [79, 1.5, .8]] },

  { id: 's1', g: 1, name: 'Over the Horizon', w: 'sine', ov: [2, .3], len: 2.8, n: [[72, 0, .35], [76, .3, .35], [79, .6, .35], [84, .9, .6], [79, 1.5, .35], [76, 1.8, .6]] },
  { id: 's2', g: 1, name: 'Morning Flower', w: 'sine', ov: [2, .25], len: 2.5, n: [[76, 0, .3], [79, .25, .3], [83, .5, .3], [84, .75, .6], [83, 1.3, .3], [79, 1.55, .6]] },
  { id: 's3', g: 1, name: 'Basic Bell', w: 'sine', ov: [2.76, .4], len: 1.8, n: [[88, 0, .6], [88, .45, .6], [88, .9, .6]] },
  { id: 's4', g: 1, name: 'Galaxy Bells', w: 'sine', ov: [2.4, .35], len: 2, n: [[84, 0, .8], [91, .2, .8], [88, .4, .8], [96, .6, 1]] },
  { id: 's5', g: 1, name: 'Sunny Day', w: 'triangle', len: 1.6, n: [[72, 0, .2], [76, .2, .2], [79, .4, .2], [84, .6, .2], [79, .8, .2], [84, 1, .4]] },
  { id: 's6', g: 1, name: 'Cosmic', w: 'sine', env: 'soft', ov: [1.5, .3], len: 2.4, n: [[67, 0, 1], [74, .4, 1], [79, .8, 1.2]] },
  { id: 's7', g: 1, name: 'Wake Up', w: 'square', g0: .12, len: 1.4, n: [[79, 0, .15], [79, .25, .15], [79, .5, .15], [84, .75, .3]] },

  { id: 'p1', g: 2, name: 'Argon', w: 'triangle', len: 1.3, n: [[74, 0, .2], [81, .15, .2], [86, .3, .4]] },
  { id: 'p2', g: 2, name: 'Neon', w: 'sine', len: 1, n: [[84, 0, .12], [84, .2, .12], [91, .4, .25]] },
  { id: 'p3', g: 2, name: 'Helium', w: 'sine', env: 'soft', len: 1.8, n: [[86, 0, .4], [91, .3, .4], [95, .6, .6]] },
  { id: 'p4', g: 2, name: 'Krypton', w: 'sine', ov: [3, .2], len: 1.6, n: [[69, 0, .3], [76, .2, .3], [81, .4, .3], [88, .6, .5]] },
  { id: 'p5', g: 2, name: 'Oxygen', w: 'sine', env: 'soft', len: 2.4, n: [[72, 0, .8], [79, .6, .8], [76, 1.2, 1]] },
  { id: 'p6', g: 2, name: 'Xenon', w: 'triangle', len: 1, n: [[88, 0, .1], [91, .12, .1], [88, .24, .1], [95, .36, .3]] }
];

let toneMaster = null;
let toneSrc = null;
let toneTimer = null;
let customBuf = null;

function toneById(id) {
  for (let i = 0; i < TONES.length; i++) if (TONES[i].id === id) return TONES[i];
  return TONES[0];
}

function toneName(id) {
  if (id === 'custom') return globalSet.customName || 'Custom tone';
  return toneById(id).name;
}

function unlockAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) {}
}

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

function stopTone() {
  clearInterval(toneTimer);
  toneTimer = null;
  if (toneSrc) { try { toneSrc.stop(); } catch (e) {} toneSrc = null; }
  if (toneMaster) { try { toneMaster.disconnect(); } catch (e) {} toneMaster = null; }
}

function voice(out, t0, midi, d, tone) {
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const peak = tone.g0 || 0.3;
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  if (tone.env === 'soft') {
    g.gain.linearRampToValueAtTime(peak, t0 + 0.04);
    g.gain.setValueAtTime(peak, t0 + Math.max(0.05, d * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.15);
  } else {
    g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.25);
  }
  g.connect(out);

  const o = actx.createOscillator();
  o.type = tone.w || 'sine';
  o.frequency.value = f;
  o.connect(g);
  o.start(t0);
  o.stop(t0 + d + 0.3);

  if (tone.ov) {
    const o2 = actx.createOscillator();
    const g2 = actx.createGain();
    o2.type = 'sine';
    o2.frequency.value = f * tone.ov[0];
    g2.gain.value = tone.ov[1];
    o2.connect(g2);
    g2.connect(g);
    o2.start(t0);
    o2.stop(t0 + d + 0.3);
  }
}

function getCustomBuffer() {
  if (customBuf) return Promise.resolve(customBuf);
  return idbGet('custom').then(function (data) {
    if (!data) return null;
    return actx.decodeAudioData(data.slice(0));
  }).then(function (b) {
    customBuf = b || null;
    return customBuf;
  }).catch(function () { return null; });
}

// returns false when nothing could be played
function playTone(id, loop) {
  stopTone();
  unlockAudio();
  if (!actx) return false;

  const master = actx.createGain();
  master.connect(actx.destination);
  toneMaster = master;

  if (id === 'custom') {
    getCustomBuffer().then(function (buf) {
      if (toneMaster !== master) return;
      if (!buf) { playTone('i1', loop); return; }
      const s = actx.createBufferSource();
      s.buffer = buf;
      s.loop = !!loop;
      s.connect(master);
      s.start();
      toneSrc = s;
    });
    return true;
  }

  const t = toneById(id);
  function cycle() {
    if (toneMaster !== master) return;
    const t0 = actx.currentTime + 0.02;
    t.n.forEach(function (x) { voice(master, t0 + x[1], x[0], x[2], t); });
  }
  cycle();
  if (loop) toneTimer = setInterval(cycle, (t.len + 0.4) * 1000);
  return true;
}

function stopPreview() { if (!ringOn) stopTone(); }

function startRing(title, snoozeFn, toneId) {
  stopRing();
  ringOn = true;
  document.getElementById('ringTitle').textContent = title;
  document.getElementById('ringSnooze').style.display = snoozeFn ? 'inline-block' : 'none';
  ringSnoozeFn = snoozeFn;
  document.getElementById('ring').classList.add('open');
  if (document.hidden) notify(title, 'Tap to open the clock', 'clock-ring');

  const ok = playTone(toneId || 'i1', true);
  haptic(300);
  ringTimer = setInterval(function () {
    if (!ok) beep();
    haptic(300);
  }, 900);
}

function stopRing() {
  ringOn = false;
  closeNotif('clock-ring');
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
  stopTone();
  document.getElementById('ring').classList.remove('open');
}

/* ---- tone picker sheet ---- */
function openToneSheet(kind) {
  const key = kind === 'alarm' ? 'alarmTone' : 'timerTone';

  let h = '<div class="title">' + (kind === 'alarm' ? 'Alarm tone' : 'Timer tone') + '</div><div class="tonebox">';
  TONE_GROUPS.forEach(function (gn, gi) {
    h += '<div class="tgrp">' + gn + '</div>';
    TONES.forEach(function (t) {
      if (t.g !== gi) return;
      h += '<button class="trow" data-id="' + t.id + '"><span>' + escapeAttr(t.name) + '</span><span class="chk">&#10003;</span></button>';
    });
  });
  h += '<div class="tgrp">Custom</div>' +
    '<button class="trow" data-id="custom"><span id="tnName"></span><span class="chk">&#10003;</span></button>' +
    '<div class="row"><button class="btn" id="tnPick">Choose audio file</button><button class="btn danger" id="tnDel">Remove</button></div>' +
    '<input type="file" id="tnFile" accept="audio/*" style="display:none">' +
    '</div>' +
    '<div class="row"><button class="btn" id="tnBack">Back</button><button class="btn" id="done">Done</button></div>';
  openSheet(h, 'settings');

  function draw() {
    const cur = globalSet[key];
    const has = !!globalSet.customName;
    document.getElementById('tnName').textContent = has ? globalSet.customName : 'No file chosen';
    document.getElementById('tnDel').style.display = has ? '' : 'none';
    sheet.querySelectorAll('.trow').forEach(function (r) {
      r.classList.toggle('sel', r.dataset.id === cur);
    });
  }
  draw();

  function choose(id) {
    globalSet[key] = id;
    saveGlobal();
    draw();
    if (!ringOn) playTone(id, false);
  }

  function pick() { unlockAudio(); document.getElementById('tnFile').click(); }

  sheet.querySelectorAll('.trow').forEach(function (r) {
    r.onclick = function () {
      if (r.dataset.id === 'custom' && !globalSet.customName) { pick(); return; }
      choose(r.dataset.id);
    };
  });

  document.getElementById('tnPick').onclick = pick;

  document.getElementById('tnFile').onchange = function (e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast('File is too big (max 8 MB)'); return; }
    unlockAudio();
    f.arrayBuffer().then(function (buf) {
      return actx.decodeAudioData(buf.slice(0)).then(function () { return idbSet('custom', buf); });
    }).then(function () {
      customBuf = null;
      globalSet.customName = f.name.length > 30 ? f.name.slice(0, 27) + '...' : f.name;
      choose('custom');
    }).catch(function () { toast('This file cannot be played'); });
  };

  document.getElementById('tnDel').onclick = function () {
    idbDel('custom').catch(function () {});
    customBuf = null;
    globalSet.customName = '';
    if (globalSet.alarmTone === 'custom') globalSet.alarmTone = 'i1';
    if (globalSet.timerTone === 'custom') globalSet.timerTone = 'i2';
    saveGlobal();
    stopPreview();
    draw();
  };

  document.getElementById('tnBack').onclick = openSettings;
  document.getElementById('done').onclick = closeSheet;
}

/* ==========================================================================
   6. DIGITS & TIME HTML
   ========================================================================== */
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
    '<path class="l1" d="' + p + '"/><path class="l2" d="' + p + '"/><path class="l3" d="' + p + '"/>' +
    '</g></svg>';
}

const COLON_SVG = '<svg class="dg" viewBox="0 0 24 100"><circle cx="12" cy="35" r="5" fill="currentColor"/><circle cx="12" cy="65" r="5" fill="currentColor"/></svg>';

function timeHtml(str, retro) {
  let n = 0;

  if (digitMode === 'sf') {
    let main = '', suf = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str.charAt(i);
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

  let html = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str.charAt(i);
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

function applyDigitMode() {
  document.body.classList.toggle('sf', digitMode === 'sf');
  renderAll();
  lastSwMain = ''; lastSwCs = ''; renderSw();
  lastTm = ''; renderTm();
  renderAlarms();
}

/* ==========================================================================
   7. HOME WIDGETS
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
  if (type === 'home') return Object.assign(base, { size: 12, hour12: false, retro: false });
  return Object.assign(base, { size: 12, hour12: false, retro: false, zone: '', city: '' });
}

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

function classicSvg() {
  let t = '';
  for (let i = 0; i < 60; i++) {
    const hr = i % 5 === 0;
    t += '<line x1="100" y1="12" x2="100" y2="' + (hr ? 27 : 19) + '" stroke="' +
      (hr ? '#4a4a4c' : '#c9c9cd') + '" stroke-width="' + (hr ? 3.2 : 1.6) +
      '" transform="rotate(' + (i * 6) + ' 100 100)"/>';
  }
  const nums = [['12', 100, 62], ['3', 145, 107], ['6', 100, 152], ['9', 55, 107]];
  let n = '';
  nums.forEach(function (q) {
    n += '<text x="' + q[1] + '" y="' + q[2] + '" text-anchor="middle" font-size="22" fill="#47474a">' + q[0] + '</text>';
  });
  return '<svg class="clsvg" viewBox="0 0 200 200">' +
    '<rect x="4" y="4" width="192" height="192" rx="46" fill="#fbfbfb"/>' + t + n +
    '<line class="ch" x1="100" y1="106" x2="100" y2="62" stroke="#111113" stroke-width="7.5" stroke-linecap="round"/>' +
    '<line class="cm" x1="100" y1="106" x2="100" y2="38" stroke="#111113" stroke-width="6" stroke-linecap="round"/>' +
    '<line class="cs2" x1="100" y1="118" x2="100" y2="34" stroke="#ff9f0a" stroke-width="2.4" stroke-linecap="round"/>' +
    '<circle cx="100" cy="100" r="6.5" fill="#111113"/><circle cx="100" cy="100" r="2.6" fill="#ff9f0a"/></svg>';
}

/* ---- time zone helpers ---- */
function isZoneWidget(w) { return w.type === 'world' || w.type === 'home'; }
function hasHome() { return widgets.some(function (w) { return w.type === 'home'; }); }

function deviceZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
}

function validZone(z) {
  try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch (e) { return false; }
}

function tzCity(z) { return String(z || '').split('/').pop().replace(/_/g, ' '); }

function zoneOf(w) {
  if (w.type === 'home') return deviceZone();
  return (w.zone && validZone(w.zone)) ? w.zone : deviceZone();
}

function myPlaceName() {
  const dz = deviceZone();
  return (myPlace.name && myPlace.tz === dz) ? myPlace.name : tzCity(dz);
}

function placeLabel(w) {
  if (w.type === 'home') return myPlaceName();
  return w.city || tzCity(w.zone);
}

function tzOffsetMin(zone, d) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'
  });
  const p = {};
  f.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - (d.getTime() - d.getMilliseconds())) / 60000);
}

function hm(mins) {
  const a = Math.abs(mins), h = Math.floor(a / 60), m = a % 60;
  return h + 'h' + (m ? ' ' + m + 'm' : '');
}

function offsetText(w, zone, now) {
  try {
    const off = tzOffsetMin(zone, now);
    const a = Math.abs(off);
    let t = 'GMT' + (off < 0 ? '-' : '+') + Math.floor(a / 60) + (a % 60 ? ':' + pad(a % 60) : '');
    if (w.type === 'world') {
      const diff = off - tzOffsetMin(deviceZone(), now);
      t += ' · ' + (diff === 0 ? 'same time as you' : hm(diff) + (diff > 0 ? ' ahead of you' : ' behind you'));
    }
    return t;
  } catch (e) { return ''; }
}

function updateLabels() {
  widgets.forEach(function (w) {
    if (!isZoneWidget(w)) return;
    const el = widgetEl(w.id);
    const l = el ? el.querySelector('.wlabel') : null;
    if (l) l.textContent = placeLabel(w);
  });
}

/* ---- location: where is the phone? ---- */
function setGeo(st) {
  geoStatus = st;
  const el = document.getElementById('wsstat');
  if (el && el.dataset.auto === '1') el.textContent = autoStatusText();
}

function geoNote() {
  switch (geoStatus) {
    case 'locating': return ' ...';
    case 'denied': return ' (location is blocked, using the phone clock)';
    case 'insecure': return ' (location needs HTTPS, using the phone clock)';
    case 'unsupported': return ' (location not supported, using the phone clock)';
    default: return '';
  }
}

function autoStatusText() {
  return '\uD83D\uDCCD My location: ' + myPlaceName() + ' \u00B7 ' + deviceZone() + geoNote();
}

function refreshMyPlace(force) {
  if (!navigator.geolocation) { setGeo('unsupported'); return Promise.resolve('unsupported'); }
  if (window.isSecureContext === false) { setGeo('insecure'); return Promise.resolve('insecure'); }
  if (geoBusy) return geoBusy;

  const tz = deviceZone();
  const fresh = myPlace.tz === tz && myPlace.name && Date.now() - myPlace.ts < PLACE_FRESH_MS;
  if (fresh && !force) return Promise.resolve('ok');

  function run() {
    setGeo('locating');
    geoBusy = new Promise(function (resolve) {
      navigator.geolocation.getCurrentPosition(function (pos) {
        reverseName(pos.coords.latitude, pos.coords.longitude).then(function (r) {
          if (r.name || r.cc) {
            myPlace = { name: r.name || myPlace.name, tz: deviceZone(), cc: r.cc || '', ts: Date.now() };
            saveMyPlace();
          }
          updateLabels();
          syncCountry();
          setGeo('ok');
          resolve('ok');
        });
      }, function (err) {
        const st = err && err.code === 1 ? 'denied' : (err && err.code === 3 ? 'timeout' : 'unavailable');
        setGeo(st);
        resolve(st);
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 });
    }).then(function (r) { geoBusy = null; return r; });
    return geoBusy;
  }

  if (force || !navigator.permissions || !navigator.permissions.query) return run();
  return navigator.permissions.query({ name: 'geolocation' }).then(function (st) {
    let asked = false;
    try { asked = !!localStorage.getItem(PLASKED); } catch (e) {}
    if (st.state === 'granted') return run();
    if (st.state === 'prompt' && !asked) {
      try { localStorage.setItem(PLASKED, '1'); } catch (e) {}
      return run();
    }
    setGeo(st.state === 'denied' ? 'denied' : 'idle');
    return geoStatus;
  }).catch(run);
}

function reverseName(lat, lon) {
  const none = { name: '', cc: '' };
  if (navigator.onLine === false) return Promise.resolve(none);
  return fetchJson(REVERSE_URL + '?latitude=' + lat + '&longitude=' + lon + '&localityLanguage=en', { timeout: 8000, retries: 1 })
    .then(function (d) {
      if (!d) return none;
      return {
        name: d.city || d.locality || d.principalSubdivision || d.countryName || '',
        cc: d.countryCode ? String(d.countryCode).toUpperCase() : ''
      };
    })
    .catch(function () { return none; });
}

function checkZoneChange() {
  const dz = deviceZone();
  if (dz === lastDeviceZone) return;
  lastDeviceZone = dz;
  updateLabels();
  syncCountry();
  if (hasHome()) {
    toast('Time zone changed: ' + tzCity(dz));
    refreshMyPlace(false);
  }
}

/* ---- search: any city or place in the world ---- */
function cacheSearch(key, list) {
  searchCache[key] = list;
  searchKeys.push(key);
  if (searchKeys.length > 40) delete searchCache[searchKeys.shift()];
}

function localZoneSearch(q) {
  if (!zoneIndex) {
    let all = [];
    try { all = Intl.supportedValuesOf('timeZone'); } catch (e) {}
    if (!all.length) {
      all = ['Asia/Dhaka', 'Asia/Kolkata', 'Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Tokyo', 'Asia/Singapore',
        'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];
    }
    zoneIndex = all.filter(validZone).map(function (z) {
      return { name: tzCity(z), timezone: z, admin1: z.split('/')[0], country: '' };
    });
  }
  const k = q.toLowerCase().trim();
  const kz = k.replace(/\s+/g, '_');
  return zoneIndex.filter(function (r) {
    return r.name.toLowerCase().indexOf(k) > -1 || r.timezone.toLowerCase().indexOf(kz) > -1;
  }).slice(0, 8);
}

function searchPlaces(q) {
  const key = q.toLowerCase();
  if (searchCache[key]) return Promise.resolve({ list: searchCache[key], local: false });

  if (geoAbort) geoAbort.abort();
  geoAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;

  return fetchJson(GEO_URL + '?name=' + encodeURIComponent(q) + '&count=8&language=en&format=json',
    { signal: geoAbort ? geoAbort.signal : null, timeout: 8000, retries: 1 })
    .then(function (d) {
      const list = ((d && d.results) || []).filter(function (r) { return r.timezone && validZone(r.timezone); });
      if (list.length) { cacheSearch(key, list); return { list: list, local: false }; }
      return { list: localZoneSearch(q), local: true };
    })
    .catch(function (err) {
      if (err && err.name === 'AbortError') throw err;
      const list = localZoneSearch(q);
      if (list.length) return { list: list, local: true };
      throw err;
    });
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
  let inner;
  if (w.type === 'digital') inner = '<div class="time"></div>';
  else if (isZoneWidget(w)) inner = '<div class="wlabel">' + escapeAttr(placeLabel(w)) +
    '</div><div class="time"></div><div class="wlabel wdate"></div><div class="wlabel wdate woff"></div>';
  else if (w.type === 'analog') inner = analogSvg();
  else if (w.type === 'classic') inner = classicSvg();
  else inner = '<div class="datetxt"><div class="wd"></div><div class="dm"></div></div>';
  el.innerHTML = inner;
  el.onclick = function (e) { openEdit(w.id, pt(e)); };
  if (w.type === 'home') refreshMyPlace(false);
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

function setClassic(el, now) {
  const s = now.getSeconds() + now.getMilliseconds() / 1000;
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  rotate(el, '.ch', h * 30);
  rotate(el, '.cm', m * 6);
  rotate(el, '.cs2', s * 6);
}

function updateWidget(w, el, now) {
  if (w.type === 'digital' || isZoneWidget(w)) {
    const zone = isZoneWidget(w) ? zoneOf(w) : null;
    const str = fmtTime(now, w, zone);
    const key = str + '|' + w.retro;
    const t = el.querySelector('.time');
    if (t.dataset.key !== key) {
      t.dataset.key = key;
      t.innerHTML = timeHtml(str, w.retro);
    }
    if (isZoneWidget(w)) {
      const d = el.querySelector('.wdate');
      if (d) d.textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', timeZone: zone });
      const o = el.querySelector('.woff');
      if (o) o.textContent = offsetText(w, zone, now);
    }
  } else if (w.type === 'analog') {
    const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds();
    rotate(el, '.hh', h * 30 + m * 0.5);
    rotate(el, '.mh', m * 6 + s * 0.1);
    rotate(el, '.sh', s * 6);
  } else if (w.type === 'classic') {
    setClassic(el, now);
  } else {
    el.querySelector('.wd').textContent = now.toLocaleDateString('en-GB', { weekday: 'long' });
    el.querySelector('.dm').textContent = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  }
}

function tick() {
  checkZoneChange();
  const now = new Date();
  widgets.forEach(function (w) {
    const el = widgetEl(w.id);
    if (el) updateWidget(w, el, now);
  });
}

function sweepLoop() {
  const list = document.querySelectorAll('[data-type="classic"]');
  if (list.length) {
    const now = new Date();
    for (let i = 0; i < list.length; i++) setClassic(list[i], now);
  }
  requestAnimationFrame(sweepLoop);
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
   8. SHEET SYSTEM (pop-in), THEME & SETTINGS
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

// every sheet is the same pop-in card. origin = click point {x,y}; default is the top-right corner
function openSheet(html, kind, origin) {
  clearTimeout(closeTimer);
  const wasOpen = sheet.classList.contains('open') && !sheet.classList.contains('closing');
  sheet.classList.remove('closing');
  sheet.dataset.kind = kind || '';
  sheet.innerHTML = html;
  sheet.scrollTop = 0;
  if (!wasOpen) {
    sheet.classList.remove('open');
    void sheet.offsetWidth;
  }
  sheet.classList.add('open');
  overlay.classList.add('open');

  if (!wasOpen) {
    if (origin) {
      const r = sheet.getBoundingClientRect();
      const ox = Math.max(0, Math.min(r.width, origin.x - r.left));
      const oy = Math.max(0, Math.min(r.height, origin.y - r.top));
      sheet.style.transformOrigin = ox + 'px ' + oy + 'px';
    } else {
      sheet.style.transformOrigin = '100% 0';
    }
  }
}

function closeSheet() {
  stopPreview();
  overlay.classList.remove('open');
  if (!sheet.classList.contains('open') || sheet.classList.contains('closing')) return;
  sheet.classList.add('closing');
  clearTimeout(closeTimer);
  closeTimer = setTimeout(function () { sheet.classList.remove('open', 'closing'); }, 170);
}

function openSettings() {
  const light = globalSet.theme === 'light';
  const list = light ? BGS_LIGHT : BGS_DARK;

  let h = '<div class="title">Settings</div>';
  h += '<div class="row"><button class="btn" id="themebtn"></button></div>';
  h += '<div class="row"><div class="label">Background</div>' +
    list.map(function (b) {
      return '<button class="swatch" data-bg="' + b[0] + '" title="' + b[1] +
        '" style="background:' + b[0] + ';border-color:#888"></button>';
    }).join('') + '</div>';
  h += '<div class="row"><button class="btn" id="fontbtn"></button></div>';
  h += '<div class="row"><button class="btn" id="awake"></button></div>';
  h += '<div class="row"><button class="btn" id="tnAlarm"></button></div>';
  h += '<div class="row"><button class="btn" id="tnTimer"></button></div>';
  h += '<div class="row"><button class="btn" id="upbtn">Upcoming dates: ' + escapeAttr(countryName(detectCountry()) || 'Auto') + '</button></div>';
  h += '<div class="row"><button class="btn" id="fs">Toggle fullscreen</button></div>';
  h += '<div class="row"><button class="btn" id="permbtn">Permissions &amp; connection</button></div>';
  h += '<div class="row"><button class="btn" id="done">Done</button></div>';
  openSheet(h, 'settings');

  function labels() {
    document.getElementById('themebtn').textContent = globalSet.theme === 'light' ? 'Theme: Light' : 'Theme: Dark';
    document.getElementById('awake').textContent = globalSet.awake ? 'Keep screen awake: ON' : 'Keep screen awake: OFF';
    document.getElementById('fontbtn').textContent = digitMode === 'sf' ? 'Numbers: Bold style' : 'Numbers: Retro lines';
    document.getElementById('tnAlarm').textContent = 'Alarm tone: ' + toneName(globalSet.alarmTone);
    document.getElementById('tnTimer').textContent = 'Timer tone: ' + toneName(globalSet.timerTone);
  }
  labels();

  document.getElementById('permbtn').onclick = openPermissions;
  document.getElementById('upbtn').onclick = openUpcomingSettings;
  document.getElementById('tnAlarm').onclick = function () { openToneSheet('alarm'); };
  document.getElementById('tnTimer').onclick = function () { openToneSheet('timer'); };

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
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  };

  document.getElementById('done').onclick = closeSheet;
}

/* ==========================================================================
   9. EDIT / ADD WIDGET SHEETS
   ========================================================================== */
function worldEditHtml(w) {
  let h = '<div class="row"><div class="label" id="wsstat"></div></div>';
  if (w.type === 'world') {
    h += '<div class="row"><input type="text" id="wsq" placeholder="Search city or place" maxlength="60" autocomplete="off"></div>' +
      '<div id="wsres"></div>';
  } else {
    h += '<div class="phint">Shows the place where this phone is. The time changes by itself when the time zone changes.</div>' +
      '<div class="row"><button class="btn" id="wsloc">&#128205; Refresh location</button></div>';
  }
  return h;
}

function initWorldEdit(w) {
  const stat = document.getElementById('wsstat');
  const home = w.type === 'home';
  let timer = null;

  function showStatus() {
    if (!stat) return;
    stat.dataset.auto = home ? '1' : '0';
    stat.textContent = home ? autoStatusText() : '\uD83C\uDF0D ' + placeLabel(w) + ' \u00B7 ' + zoneOf(w);
  }
  showStatus();

  if (home) {
    document.getElementById('wsloc').onclick = function () {
      refreshMyPlace(true).then(function (st) {
        showStatus();
        if (st === 'denied') toast('Location is blocked. Allow it in the site settings of your browser.', { ms: 5000 });
        else if (st === 'insecure') toast('Location needs HTTPS.', { ms: 4000 });
        else if (st === 'timeout' || st === 'unavailable') toast('Could not get your location. Using the phone clock.');
        else if (st === 'ok' && navigator.onLine === false) toast('Offline: the place name will update when internet is back.');
      });
    };
    return;
  }

  const q = document.getElementById('wsq');
  const res = document.getElementById('wsres');

  function msg(t, retry) {
    res.innerHTML = '<div class="label">' + t + '</div>';
    if (retry) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = 'Retry';
      b.onclick = function () { q.oninput(); };
      res.appendChild(b);
    }
  }

  q.oninput = function () {
    clearTimeout(timer);
    const v = q.value.trim();
    const my = ++searchSeq;
    if (v.length < 2) { if (geoAbort) geoAbort.abort(); res.innerHTML = ''; return; }
    msg('Searching...');
    timer = setTimeout(function () {
      searchPlaces(v).then(function (r) {
        if (my !== searchSeq) return;
        if (!r.list.length) { msg('No place found'); return; }
        res.innerHTML = '';
        if (r.local) {
          const n = document.createElement('div');
          n.className = 'label';
          n.textContent = 'No internet: showing the offline time zone list';
          res.appendChild(n);
        }
        r.list.forEach(function (p) {
          const sub = [p.admin1, p.country].filter(Boolean).join(', ');
          const b = document.createElement('button');
          b.className = 'btn block';
          b.textContent = p.name + (sub ? ' \u00B7 ' + sub : '');
          b.onclick = function () {
            w.zone = p.timezone;
            w.city = p.name;
            saveWidgets(); renderAll(); showStatus();
            res.innerHTML = '';
            q.value = '';
          };
          res.appendChild(b);
        });
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        if (my !== searchSeq) return;
        msg(netMessage(err), true);
      });
    }, 350);
  };
}

function openEdit(id, origin) {
  const w = widgets.find(function (x) { return x.id === id; });
  if (!w) return;

  let h = '<div class="title">' + TYPE_NAMES[w.type] + '</div>';
  h += '<div class="row"><div class="label">Color</div>' +
    COLORS.map(function (c) { return '<button class="swatch" data-c="' + c + '" style="background:' + c + '"></button>'; }).join('') + '</div>';
  h += '<div class="row"><div class="label">Size</div><input type="range" id="sz" min="6" max="26" step="1" value="' + w.size + '"></div>';

  if (isZoneWidget(w)) h += worldEditHtml(w);
  if (w.type === 'digital' || isZoneWidget(w)) {
    h += '<div class="row"><button class="btn" id="fmt"></button><button class="btn" id="rt"></button></div>';
  }
  h += '<div class="row"><button class="btn" id="up">&#8593; Move up</button><button class="btn" id="down">&#8595; Move down</button></div>';
  h += '<div class="row"><button class="btn danger" id="del">Delete</button><button class="btn" id="done">Done</button></div>';
  openSheet(h, 'edit', origin);

  function labels() {
    const f = document.getElementById('fmt');
    const r = document.getElementById('rt');
    if (f) f.textContent = w.hour12 ? '12-hour' : '24-hour';
    if (r) r.textContent = w.retro ? 'Retro colors: ON' : 'Retro colors: OFF';
  }
  labels();

  sheet.querySelectorAll('.swatch').forEach(function (b) {
    b.onclick = function () { w.color = b.dataset.c; saveWidgets(); applyStyle(w); };
  });

  document.getElementById('sz').oninput = function (e) {
    w.size = Number(e.target.value); saveWidgets(); applyStyle(w);
  };

  if (isZoneWidget(w)) initWorldEdit(w);

  const fmt = document.getElementById('fmt');
  if (fmt) fmt.onclick = function () { w.hour12 = !w.hour12; saveWidgets(); renderAll(); labels(); };

  const rt = document.getElementById('rt');
  if (rt) rt.onclick = function () { w.retro = !w.retro; saveWidgets(); renderAll(); labels(); };

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

function openAddWidget() {
  let h = '<div class="title">Add widget</div>';
  Object.keys(TYPE_NAMES).forEach(function (t) {
    h += '<button class="btn block" data-t="' + t + '">' + TYPE_NAMES[t] + '</button>';
  });
  h += '<div class="row"><button class="btn danger" id="reset">Reset all</button><button class="btn" id="done">Close</button></div>';
  openSheet(h, 'add');

  sheet.querySelectorAll('[data-t]').forEach(function (b) {
    b.onclick = function () {
      widgets.push(newWidget(b.dataset.t));
      saveWidgets(); closeSheet(); renderAll();
      window.scrollTo(0, document.body.scrollHeight);
    };
  });
  document.getElementById('reset').onclick = function () {
    if (confirm('Reset all widgets to default?')) {
      widgets = defaultWidgets();
      saveWidgets(); closeSheet(); renderAll();
    }
  };
  document.getElementById('done').onclick = closeSheet;
}

/* ==========================================================================
   10. TABS
   ========================================================================== */
function showTab(name) {
  TABS.forEach(function (t) {
    document.getElementById('v-' + t).classList.toggle('active', t === name);
    document.querySelector('#nav [data-tab="' + t + '"]').classList.toggle('active', t === name);
  });
  document.getElementById('add').style.display = name === 'home' ? 'block' : 'none';
  window.scrollTo(0, 0);
  closeSheet();
  if (name === 'timer') setTimeout(syncWheels, 50);
  if (name === 'home') {
    renderUpcoming();
    setTimeout(measureUpcoming, 60);
  }
}

/* ==========================================================================
   11. ALARMS
   ========================================================================== */
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
    const h = Number(p[0]), m = p[1];
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = (h % 12) === 0 ? 12 : (h % 12);

    const row = document.createElement('div');
    row.className = 'arow2' + (a.on ? '' : ' off') + (alarmEditMode ? ' editing' : '');
    row.innerHTML =
      '<button class="adel" aria-label="Delete">&minus;</button>' +
      '<div class="ainfo">' +
        '<div class="time atime" style="--size:13vw">' + timeHtml(h12 + ':' + m, false) + '<span class="ampm">' + ap + '</span></div>' +
        '<div class="alabel">' + escapeAttr(a.label || 'Alarm') + (a.daily ? ', Every day' : ', Once') + '</div>' +
      '</div>' +
      '<button class="tgl' + (a.on ? ' on' : '') + '" aria-label="On or off"><span></span></button>';

    row.querySelector('.tgl').onclick = function () { a.on = !a.on; saveAlarms(); renderAlarms(); };
    row.querySelector('.adel').onclick = function () {
      alarms = alarms.filter(function (x) { return x !== a; });
      saveAlarms(); renderAlarms();
    };
    row.querySelector('.ainfo').onclick = function (e) { openAlarmSheet(a, pt(e)); };
    box.appendChild(row);
  });
}

function openAlarmSheet(a, origin) {
  const isNew = !a;
  const draft = a
    ? { time: a.time, label: a.label || '', daily: a.daily }
    : { time: '07:00', label: '', daily: true };

  const h = '<div class="title">' + (isNew ? 'Add alarm' : 'Edit alarm') + '</div>' +
    '<div class="row"><input type="time" id="asTime" class="bigin" value="' + draft.time + '"></div>' +
    '<div class="row"><input type="text" id="asLabel" placeholder="Label (optional)" maxlength="30" value="' + escapeAttr(draft.label) + '"></div>' +
    '<div class="row"><button class="btn" id="asRepeat"></button></div>' +
    '<div class="row"><button class="btn" id="asSave">Save</button>' +
    (isNew ? '' : '<button class="btn danger" id="asDel">Delete</button>') +
    '<button class="btn" id="asCancel">Cancel</button></div>';
  openSheet(h, 'alarm', origin);

  const repBtn = document.getElementById('asRepeat');
  function lab() { repBtn.textContent = draft.daily ? 'Repeat: Every day' : 'Repeat: Once'; }
  lab();
  repBtn.onclick = function () { draft.daily = !draft.daily; lab(); };

  document.getElementById('asSave').onclick = function () {
    const t = document.getElementById('asTime').value;
    if (!t) return;
    const lbl = document.getElementById('asLabel').value.trim();
    const now = new Date();
    const tp = t.split(':');
    const lateBy = now.getHours() * 60 + now.getMinutes() - (Number(tp[0]) * 60 + Number(tp[1]));
    const guard = (lateBy >= 0 && lateBy <= 2) ? dayKey(now) + t : '';
    if (isNew) {
      alarms.push({ id: 'a' + Date.now(), time: t, on: true, daily: draft.daily, label: lbl, last: guard });
    } else {
      a.time = t; a.label = lbl; a.daily = draft.daily; a.on = true; a.last = guard;
    }
    alarms.sort(function (x, y) { return x.time < y.time ? -1 : 1; });
    saveAlarms(); renderAlarms(); closeSheet();
    maybeAskNotifications();
  };

  const del = document.getElementById('asDel');
  if (del) del.onclick = function () {
    alarms = alarms.filter(function (x) { return x !== a; });
    saveAlarms(); renderAlarms(); closeSheet();
  };
  document.getElementById('asCancel').onclick = closeSheet;
}

function checkAlarms() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dk = dayKey(now);
  alarms.forEach(function (a) {
    const p = a.time.split(':');
    const late = nowMin - (Number(p[0]) * 60 + Number(p[1]));
    if (a.on && late >= 0 && late <= 2 && a.last !== dk + a.time) {
      a.last = dk + a.time;
      if (!a.daily) a.on = false;
      saveAlarms(); renderAlarms();
      startRing('Alarm ' + a.time, snoozeFive, globalSet.alarmTone);
    }
  });
  if (snoozeAt && Date.now() >= snoozeAt) {
    snoozeAt = 0;
    startRing('Alarm (snoozed)', snoozeFive, globalSet.alarmTone);
  }
}

/* ==========================================================================
   12. STOPWATCH
   ========================================================================== */
function swMs() { return sw.elapsed + (sw.running ? Date.now() - sw.start : 0); }

function fmtMs(ms) {
  const t = Math.floor(ms / 10);
  const cs = t % 100;
  const s = Math.floor(t / 100) % 60;
  const m = Math.floor(t / 6000) % 60;
  const h = Math.floor(t / 360000);
  return { main: (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(s), cs: pad(cs) };
}

function buildDial() {
  const g = document.getElementById('dialTicks');
  const sg = document.getElementById('subTicks');
  if (!g || !sg) return;

  let s = '';
  for (let i = 0; i < 60; i++) {
    const big = i % 5 === 0;
    s += '<line x1="150" y1="14" x2="150" y2="' + (big ? 27 : 21) + '" stroke="' +
      (big ? '#d4d4d4' : '#6b6b6b') + '" stroke-width="' + (big ? 2.4 : 1.4) +
      '" transform="rotate(' + (i * 6) + ' 150 150)"/>';
  }
  for (let k = 1; k <= 12; k++) {
    const a = k * 30 * Math.PI / 180;
    s += '<text x="' + (150 + 108 * Math.sin(a)).toFixed(1) + '" y="' + (150 - 108 * Math.cos(a) + 5).toFixed(1) +
      '" text-anchor="middle" font-size="15" font-weight="700" fill="#ececec">' + (k * 5) + '</text>';
  }
  g.innerHTML = s;

  let t = '';
  for (let j = 0; j < 30; j++) {
    t += '<line x1="150" y1="172" x2="150" y2="' + (j % 5 === 0 ? 178 : 175) +
      '" stroke="#7a7a7a" stroke-width="1" transform="rotate(' + (j * 12) + ' 150 208)"/>';
  }
  const labels = ['30', '5', '10', '15', '20', '25'];
  for (let q = 0; q < 6; q++) {
    const b = q * 60 * Math.PI / 180;
    t += '<text x="' + (150 + 25 * Math.sin(b)).toFixed(1) + '" y="' + (208 - 25 * Math.cos(b) + 3).toFixed(1) +
      '" text-anchor="middle" font-size="9" font-weight="700" fill="#cfcfcf">' + labels[q] + '</text>';
  }
  sg.innerHTML = t;
}

function csHtml(cs) {
  if (digitMode === 'sf') return '<span class="txt">.' + cs + '</span>';
  return '<svg class="dg" viewBox="0 0 24 100"><circle cx="12" cy="90" r="5" fill="currentColor"/></svg>' +
    timeHtml(cs, false);
}

function setGoIcon(id, running) {
  const go = document.getElementById(id);
  if (!go) return;
  const k = running ? 'pause' : 'play';
  if (go.getAttribute('data-k') !== k) {
    go.setAttribute('data-k', k);
    go.innerHTML = running ? ICON.pause : ICON.play;
    go.setAttribute('aria-label', running ? 'Pause' : 'Start');
  }
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
    if (cs) cs.innerHTML = csHtml(f.cs);
  }

  setGoIcon('swGo', sw.running);

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

/* ==========================================================================
   13. TIMER & PRESETS
   ========================================================================== */
function tmLeft() { return tm.running ? Math.max(0, tm.endAt - Date.now()) : tm.remaining; }

function fmtTimer(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(sec);
}

function fmtHMS(s) {
  return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
}

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

  setGoIcon('tmGo', tm.running);

  if (tm.running && ms <= 0) {
    tm.running = false;
    tm.remaining = tm.total;
    saveTm(); renderTm();
    startRing('Timer finished', null, globalSet.timerTone);
  }
}

function timerGo() {
  unlockAudio();
  if (tm.running) {
    tm.remaining = tmLeft();
    tm.running = false;
  } else {
    if (tm.remaining === tm.total) {
      const ms = wheelMs();
      tm.total = ms;
      tm.remaining = ms;
    }
    if (tm.remaining <= 0) return;
    tm.endAt = Date.now() + tm.remaining;
    tm.running = true;
  }
  saveTm(); renderTm();
  if (tm.running) maybeAskNotifications();
}

function pickPreset(ms) {
  tm.running = false;
  tm.total = ms;
  tm.remaining = ms;
  saveTm(); renderTm(); syncWheels();
}

function renderPresets() {
  const box = document.getElementById('presetList');
  if (!box) return;
  box.innerHTML = '';
  presets.forEach(function (p) {
    const row = document.createElement('div');
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

function openPresetSheet(origin) {
  function opts(n) {
    let o = '';
    for (let i = 0; i < n; i++) o += '<option value="' + i + '">' + pad(i) + '</option>';
    return o;
  }
  const h = '<div class="title">Add timer</div>' +
    '<div class="row"><input type="text" id="ptName" placeholder="Name (for example Tea)" maxlength="24"></div>' +
    '<div class="row"><div class="label">Hours, minutes, seconds</div>' +
    '<select id="ptH">' + opts(24) + '</select> <select id="ptM">' + opts(60) + '</select> <select id="ptS">' + opts(60) + '</select></div>' +
    '<div class="row"><button class="btn" id="ptSave">Save</button><button class="btn" id="ptCancel">Cancel</button></div>';
  openSheet(h, 'preset', origin);
  document.getElementById('ptM').value = '5';

  document.getElementById('ptSave').onclick = function () {
    const s = Number(document.getElementById('ptH').value) * 3600 +
      Number(document.getElementById('ptM').value) * 60 +
      Number(document.getElementById('ptS').value);
    if (s <= 0) return;
    const name = document.getElementById('ptName').value.trim() || 'Timer';
    presets.push({ id: 'p' + Date.now(), name: name, s: s });
    savePresets(); renderPresets(); closeSheet();
  };
  document.getElementById('ptCancel').onclick = closeSheet;
}

/* ==========================================================================
   14. UPCOMING  (dynamic: all countries, updates itself over the internet)
   --------------------------------------------------------------------------
   Country : your choice in Settings, otherwise GPS -> internet (IP) -> time zone -> language
   Dates   : a) holidays of the country: Nager.Date, else your pack file days/XX.json
                (saved on the phone, refreshed every 7 days, works offline)
             b) Islamic calendar events worked out by the browser
             c) your own dates
   ========================================================================== */
const MUSLIM = new Set(('BD PK IN SA AE EG QA KW OM BH JO LB IQ IR AF UZ TJ KG AZ TR ID MY BN MV MA DZ TN LY YE SY PS SD SN NG LK').split(' '));
const MOON_LATE = new Set(['BD', 'IN', 'PK']);
const ARABIC = new Set(('SA AE EG QA KW OM BH JO LB IQ MA DZ TN LY YE SY PS SD').split(' '));
const HIJRI_SCAN_DAYS = 420;

// [Hijri month, Hijri day, English, Bangla, Arabic, type]
const HIJRI = [
  [1, 1, 'Islamic New Year', 'হিজরি নববর্ষ', 'رأس السنة الهجرية', 'r'],
  [1, 10, 'Ashura', 'আশুরা', 'عاشوراء', 'r'],
  [3, 12, 'Eid-e-Miladunnabi', 'ঈদে মিলাদুন্নবী', 'المولد النبوي', 'r'],
  [7, 27, 'Shab-e-Meraj', 'শবে মেরাজ', 'الإسراء والمعراج', 'r'],
  [8, 15, 'Shab-e-Barat', 'শবে বরাত', 'ليلة النصف من شعبان', 'r'],
  [9, 1, 'Ramadan begins', 'রমজান শুরু', 'بداية رمضان', 'r'],
  [9, 27, 'Shab-e-Qadr', 'শবে কদর', 'ليلة القدر', 'r'],
  [10, 1, 'Eid-ul-Fitr', 'ঈদুল ফিতর', 'عيد الفطر', 'h'],
  [12, 9, 'Day of Arafah', 'আরাফার দিন', 'يوم عرفة', 'r'],
  [12, 10, 'Eid-ul-Adha', 'ঈদুল আযহা', 'عيد الأضحى', 'h']
];
const ISL_RE = /eid|id al|id-|fitr|adha|ramadan|ramazan|arafah|arafat|ashura|mawlid|maulid|barat|qadr|mi.?raj|isra|islamic new|hijri|muharram|bayram|kurban|idul|lebaran|nuzul|raya/i;
const REL_RE = /christmas|easter|good friday|epiphany|ascension|pentecost|whit|corpus|assumption|all saints|all souls|immaculate|diwali|deepavali|holi\b|vesak|buddha|navratri|dussehra|durga|janmashtami|ramadan|eid|fitr|adha|ashura|mawlid|passover|hanukkah|yom kippur|rosh hashan|nyepi|waisak|thaipusam|boxing|palm sunday|maundy/i;

let hijriCache = { key: '', list: [] };
let lastCc = null;
let countryCache = null;
let zoneMap = null;
let ipPlace = loadIpPlace();
let ipBusy = false;
const holBusy = {};

/* ---- all countries: the list is made by the browser, no fixed table ---- */
function countryList() {
  if (countryCache) return countryCache;
  const skip = { ZZ: 1, XA: 1, XB: 1, QO: 1, EU: 1, UN: 1, EZ: 1 };
  const out = [];
  let dn = null;
  try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) {}
  if (dn) {
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const cc = String.fromCharCode(a, b);
        if (skip[cc]) continue;
        let n = '';
        try { n = dn.of(cc); } catch (e) {}
        if (n && n !== cc) out.push({ c: cc, n: n });
      }
    }
  }
  out.sort(function (x, y) { return x.n.localeCompare(y.n); });
  countryCache = out;
  return out;
}

function countryName(cc) {
  if (!cc) return '';
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || cc; } catch (e) { return cc; }
}

function flagOf(cc) {
  if (!cc || cc.length !== 2) return '';
  try { return String.fromCodePoint(127397 + cc.charCodeAt(0), 127397 + cc.charCodeAt(1)); } catch (e) { return ''; }
}

/* ---- which country? GPS -> internet (IP) -> time zone -> language ---- */
function loadIpPlace() {
  try {
    const p = JSON.parse(localStorage.getItem(IPKEY));
    if (p && typeof p.cc === 'string') return p;
  } catch (e) {}
  return { cc: '', tz: '', ts: 0 };
}

function zoneCountry(z) {
  if (!zoneMap) {
    zoneMap = {};
    countryList().forEach(function (x) {
      try {
        const l = new Intl.Locale('en-' + x.c);
        const zs = l.getTimeZones ? l.getTimeZones() : (l.timeZones || []);
        zs.forEach(function (t) { if (!zoneMap[t]) zoneMap[t] = x.c; });
      } catch (e) {}
    });
  }
  return zoneMap[z] || '';
}

function autoCountry() {
  const dz = deviceZone();
  if (myPlace.cc && myPlace.tz === dz) return myPlace.cc;
  if (ipPlace.cc && ipPlace.tz === dz) return ipPlace.cc;
  const zc = zoneCountry(dz);
  if (zc) return zc;
  const langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
  for (let i = 0; i < langs.length; i++) {
    const m = /[-_]([A-Za-z]{2})$/.exec(String(langs[i]));
    if (m) return m[1].toUpperCase();
  }
  try { return new Intl.Locale(langs[0] || 'en').maximize().region || ''; } catch (e) { return ''; }
}

function detectCountry() {
  const o = globalSet.country;
  if (o && o !== 'auto') return o;
  return autoCountry();
}

// country from the internet connection (works without the GPS permission)
function ensureIpCountry() {
  const dz = deviceZone();
  if (ipBusy || navigator.onLine === false) return;
  if (myPlace.cc && myPlace.tz === dz) return;
  if (ipPlace.cc && ipPlace.tz === dz && Date.now() - ipPlace.ts < HOL_TTL) return;
  ipBusy = true;
  fetchJson(REVERSE_URL + '?localityLanguage=en', { timeout: 8000, retries: 0 })
    .then(function (d) {
      const cc = d && d.countryCode ? String(d.countryCode).toUpperCase() : '';
      if (!cc) return;
      ipPlace = { cc: cc, tz: deviceZone(), ts: Date.now() };
      try { localStorage.setItem(IPKEY, JSON.stringify(ipPlace)); } catch (e) {}
    })
    .catch(function () {})
    .then(function () {
      ipBusy = false;
      if (detectCountry() !== lastCc) syncCountry();
    });
}

function syncCountry() {
  const cc = detectCountry();
  ensureIpCountry();
  if (cc === lastCc) return;
  lastCc = cc;
  hijriCache.key = '';
  loadHolidays(cc);
  renderUpcoming();
}

/* ---- holidays: Nager.Date -> your pack file (days/XX.json) -> saved on the phone ---- */
function readHol(cc, y) {
  try {
    const o = JSON.parse(localStorage.getItem(HKEY + cc + '_' + y));
    if (o && Array.isArray(o.list)) return o;
  } catch (e) {}
  return null;
}

function saveHol(cc, y, list) {
  try {
    localStorage.setItem(HKEY + cc + '_' + y, JSON.stringify({ ts: Date.now(), ttl: list.length ? HOL_TTL : RETRY_TTL, list: list }));
  } catch (e) {}
}

function holExpired(c) { return !c || Date.now() - c.ts > (c.ttl || HOL_TTL); }

function isTemp(e) { return !!e && (e.kind === 'offline' || e.kind === 'timeout' || (e.kind === 'http' && e.status >= 500)); }

// pack file: [{"m":3,"d":26,"n":"Independence Day","l":"...","t":"h"}]  (every year)
//            [{"date":"2027-03-30","n":"Eid-ul-Fitr","t":"h"}]          (one date)
function expandPack(data, yr) {
  const arr = Array.isArray(data) ? data : ((data && data.items) || []);
  const out = [];
  arr.forEach(function (x) {
    if (!x || !x.n) return;
    let d = '';
    if (x.date) {
      if (String(x.date).slice(0, 4) !== String(yr)) return;
      d = String(x.date);
    } else if (x.m && x.d) {
      d = yr + '-' + pad(x.m) + '-' + pad(x.d);
    } else return;
    out.push({ d: d, n: x.n, l: x.l || '', c: x.t || 'i', t: [] });
  });
  return out;
}

function fetchHol(cc, yr) {
  return fetchJson(HOL_URL + yr + '/' + cc, { timeout: 10000, retries: 1 })
    .then(function (d) {
      return Array.isArray(d) ? d.map(function (x) {
        return { d: x.date, n: x.name || '', l: x.localName || '', t: x.types || [] };
      }) : [];
    })
    .catch(function (e) {
      if (isTemp(e)) throw e;
      return [];
    })
    .then(function (list) {
      if (list.length) return list;
      return fetchJson(PACK_URL + cc + '.json', { timeout: 8000, retries: 0 })
        .then(function (d) { return expandPack(d, yr); })
        .catch(function (e) {
          if (isTemp(e)) throw e;
          return [];
        });
    });
}

function loadHolidays(cc, force) {
  if (!cc || navigator.onLine === false) return;
  const y = new Date().getFullYear();
  [y, y + 1].forEach(function (yr) {
    const c = readHol(cc, yr);
    if (!force && !holExpired(c)) return;
    const k = cc + yr;
    if (holBusy[k]) return;
    holBusy[k] = 1;
    fetchHol(cc, yr)
      .then(function (list) {
        if (!list.length && c && c.list.length) { saveHol(cc, yr, c.list); return; }   // keep the old copy
        saveHol(cc, yr, list);
      })
      .catch(function () {})                                                        // temporary problem: try again later
      .then(function () {
        delete holBusy[k];
        if (cc === detectCountry()) renderUpcoming();
      });
  });
}

/* ---- Islamic calendar events (worked out by the browser, moves every year) ---- */
function islamicFormatter() {
  const cals = ['islamic-umalqura', 'islamic-civil', 'islamic'];
  for (let i = 0; i < cals.length; i++) {
    try {
      const f = new Intl.DateTimeFormat('en', { calendar: cals[i], day: 'numeric', month: 'numeric' });
      if (String(f.resolvedOptions().calendar).indexOf('islamic') === 0) return f;
    } catch (e) {}
  }
  return null;
}

function hijriUpcoming(today, cc) {
  const key = dayKey(today) + cc;
  if (hijriCache.key === key) return hijriCache.list;

  const list = [];
  const fmt = MUSLIM.has(cc) ? islamicFormatter() : null;
  if (fmt) {
    const off = MOON_LATE.has(cc) ? 1 : 0;
    for (let i = -off; i <= HIJRI_SCAN_DAYS; i++) {
      const g = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      let mo = 0, da = 0;
      fmt.formatToParts(g).forEach(function (p) {
        if (p.type === 'month') mo = parseInt(p.value, 10);
        else if (p.type === 'day') da = parseInt(p.value, 10);
      });
      for (let k = 0; k < HIJRI.length; k++) {
        if (HIJRI[k][0] === mo && HIJRI[k][1] === da) {
          list.push({ dt: new Date(g.getFullYear(), g.getMonth(), g.getDate() + off), ev: HIJRI[k] });
        }
      }
    }
  }
  hijriCache = { key: key, list: list };
  return list;
}

/* ---- your own dates ---- */
function loadCustom() {
  try {
    const c = JSON.parse(localStorage.getItem(CUSTOM_KEY));
    if (Array.isArray(c)) return c;
  } catch (e) {}
  return [];
}
function saveCustom(list) { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch (e) {} }

/* ---- build the list ---- */
function getUpcoming(today) {
  const cc = detectCountry();
  const y = today.getFullYear();
  const out = [];
  const taken = {};

  function push(dt, n, b, t, approx) {
    const diff = Math.round((dt - today) / 86400000);
    if (diff < 0) return;
    out.push({ h: { n: n, b: b || '', t: t || 'i', approx: !!approx }, dt: dt, diff: diff });
  }
  function addFixed(dt, n, b, t) {
    const k = dayKey(dt);
    if (taken[k]) return;
    taken[k] = 1;
    push(dt, n, b, t, false);
  }

  // a) holidays of the country (internet copy saved on the phone)
  if (cc) {
    for (let yr = y; yr <= y + 1; yr++) {
      const c = readHol(cc, yr);
      if (!c) continue;
      c.list.forEach(function (x) {
        const p = String(x.d).split('-');
        if (p.length !== 3) return;
        let t = x.c;
        if (!t) {
          t = (x.t || []).indexOf('Public') > -1 ? 'h' : 'i';
          if (REL_RE.test(x.n)) t = 'r';
        }
        addFixed(new Date(+p[0], +p[1] - 1, +p[2]), x.n, (x.l && x.l !== x.n) ? x.l : '', t);
      });
    }
  }

  // b) Islamic calendar events (skipped when the holiday list already has the same one)
  hijriUpcoming(today, cc).forEach(function (x) {
    const dup = out.some(function (o) { return Math.abs(o.dt - x.dt) <= 2 * 86400000 && ISL_RE.test(o.h.n); });
    if (dup) return;
    const local = cc === 'BD' ? x.ev[3] : (ARABIC.has(cc) ? x.ev[4] : '');
    push(x.dt, x.ev[2], local, x.ev[5], true);
  });

  // c) your own dates
  loadCustom().forEach(function (c) {
    const p = String(c.d).split('-');
    if (p.length !== 3 || !c.n) return;
    if (c.r) {
      for (let yr = y; yr <= y + 1; yr++) push(new Date(yr, +p[1] - 1, +p[2]), c.n, c.b, c.t, false);
    } else {
      push(new Date(+p[0], +p[1] - 1, +p[2]), c.n, c.b, c.t, false);
    }
  });

  out.sort(function (a, b) { return a.dt - b.dt; });
  return out;
}

function renderUpcoming() {
  const box = document.getElementById('hList');
  if (!box) return;
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const LABEL = { h: 'Holiday', i: 'Important', r: 'Religious' };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cc = detectCountry();

  const sub = document.querySelector('.hsub');
  if (sub) sub.textContent = cc ? (flagOf(cc) + ' ' + countryName(cc)).trim() : '';

  const items = getUpcoming(today).slice(0, 7);

  if (!items.length) {
    box.innerHTML = '<div class="hcard"><div class="hmid"><div class="hname">No upcoming dates</div></div></div>';
    return;
  }

  box.innerHTML = items.map(function (it) {
    const t = LABEL[it.h.t] ? it.h.t : 'i';
    const left = it.diff === 0 ? 'Today' : (it.diff === 1 ? 'Tomorrow' : 'in ' + it.diff + ' days');
    const wd = it.dt.toLocaleDateString('en-GB', { weekday: 'short' });
    return '<div class="hcard t-' + t + '">' +
      '<div class="hd"><span class="hmon">' + MON[it.dt.getMonth()] + '</span>' +
      '<span class="hday">' + (it.h.approx ? '~' : '') + it.dt.getDate() + '</span></div>' +
      '<div class="hmid"><div class="hname">' + escapeAttr(it.h.n) + '</div><div class="hbn">' + escapeAttr(it.h.b) + '</div></div>' +
      '<div class="hright"><span class="hleft' + (it.diff <= 7 ? ' soon' : '') + '">' + left + '</span>' +
      '<span class="hwd">' + wd + ' · ' + LABEL[t] + '</span></div>' +
      '</div>';
  }).join('');

  queueFade();
}

function openUpcomingSettings() {
  const sel = globalSet.country || 'auto';
  const names = countryList();

  let h = '<div class="title">Upcoming dates</div>';
  h += '<div class="row"><div class="label">Country</div><select id="upCc">' +
    '<option value="auto">Auto (' + escapeAttr(countryName(autoCountry()) || 'unknown') + ')</option>' +
    names.map(function (x) {
      return '<option value="' + x.c + '"' + (sel === x.c ? ' selected' : '') + '>' + escapeAttr(flagOf(x.c) + ' ' + x.n) + '</option>';
    }).join('') + '</select></div>';
  h += '<div class="phint">Auto follows the phone. Holidays update themselves from the internet and are saved on the phone, so they also show offline. ' +
    'Moon-based days (Eid, Ramadan...) are worked out by the phone; the real date can differ by a day.</div>';
  h += '<div class="row"><div class="label">Add my own date</div></div>';
  h += '<div class="row"><input type="date" id="upDate"></div>';
  h += '<div class="row"><input type="text" id="upName" placeholder="Name" maxlength="40"></div>';
  h += '<div class="row"><select id="upType"><option value="i">Important</option><option value="h">Holiday</option><option value="r">Religious</option></select> ' +
    '<select id="upRep"><option value="1">Every year</option><option value="0">One time</option></select></div>';
  h += '<div class="row"><button class="btn" id="upAdd">Add</button></div>';
  h += '<div id="upList"></div>';
  h += '<div class="row"><button class="btn" id="upBack">Back</button><button class="btn" id="done">Done</button></div>';
  openSheet(h, 'settings');

  function drawCustom() {
    const list = loadCustom();
    const box = document.getElementById('upList');
    box.innerHTML = '';
    list.forEach(function (c, i) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = '<div class="label">' + escapeAttr(c.d + ' · ' + c.n + (c.r ? ' (yearly)' : '')) + '</div>' +
        '<button class="btn danger" data-i="' + i + '">Delete</button>';
      row.querySelector('button').onclick = function () {
        const l = loadCustom();
        l.splice(i, 1);
        saveCustom(l);
        drawCustom(); renderUpcoming();
      };
      box.appendChild(row);
    });
  }
  drawCustom();

  document.getElementById('upCc').onchange = function (e) {
    globalSet.country = e.target.value;
    saveGlobal();
    lastCc = null;
    syncCountry();
  };

  document.getElementById('upAdd').onclick = function () {
    const d = document.getElementById('upDate').value;
    const n = document.getElementById('upName').value.trim();
    if (!d || !n) { toast('Choose a date and write a name'); return; }
    const l = loadCustom();
    l.push({
      d: d, n: n, b: '',
      t: document.getElementById('upType').value,
      r: document.getElementById('upRep').value === '1' ? 1 : 0
    });
    saveCustom(l);
    document.getElementById('upName').value = '';
    drawCustom(); renderUpcoming();
  };

  document.getElementById('upBack').onclick = openSettings;
  document.getElementById('done').onclick = closeSheet;
}

/* ---- progressive blur and scroll fade ---- */
function blurLayer(blur, mask) {
  return '<div class="pbl" style="-webkit-backdrop-filter:blur(' + blur + 'px);backdrop-filter:blur(' + blur +
    'px);-webkit-mask-image:' + mask + ';mask-image:' + mask + '"></div>';
}

function buildBlurZones() {
  const hol = document.getElementById('holidays');
  if (!hol || document.getElementById('pbTop')) return;

  const N = 4;
  const BLUR = [0.8, 1.6];
  const L = 112;

  function stop(k, c) {
    return 'calc(var(--ft,34px) * ' + k + ' + ' + c.toFixed(2) + 'px - var(--sh,0px))';
  }

  let outT = '', outB = '';
  for (let i = 0; i < BLUR.length; i++) {
    const t = (N - i) / N;
    outT += blurLayer(BLUR[i], 'linear-gradient(to bottom,' +
      'transparent ' + stop(0, 0) + ',' +
      'rgba(0,0,0,.12) ' + stop(0.33, -4.62) + ',' +
      'rgba(0,0,0,.45) ' + stop(0.66, -9.24) + ',' +
      '#000 ' + stop(1, -14) + ',' +
      '#000 ' + stop(1, -14 + L * (t - 1 / N)) + ',' +
      'transparent ' + stop(1, -14 + L * t) + ')');

    const a = ((t - 1 / N) * 100).toFixed(2);
    const b = (t * 100).toFixed(2);
    outB += blurLayer(BLUR[i], 'linear-gradient(to top,#000 0%,#000 ' + a + '%,transparent ' + b + '%)');
  }

  const top = document.createElement('div');
  top.id = 'pbTop';
  top.className = 'pb';
  top.innerHTML = outT;
  const bot = document.createElement('div');
  bot.id = 'pbBot';
  bot.className = 'pb';
  bot.innerHTML = outB;
  hol.appendChild(top);
  hol.appendChild(bot);
}

function measureUpcoming() {
  const box = document.getElementById('hList');
  const hol = document.getElementById('holidays');
  if (!box || !hol || !box.offsetParent) return;

  const br = box.getBoundingClientRect();
  const head = document.querySelector('.hhead');
  const nav = document.getElementById('nav');

  const ft = Math.round(head ? Math.max(head.getBoundingClientRect().bottom - br.top - 4, 20) : 34);
  const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight;
  const fb = Math.round(Math.max(br.bottom - navTop + 8, 0));

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

function queueFade() {
  if (fadeQueued) return;
  fadeQueued = true;
  requestAnimationFrame(function () {
    fadeQueued = false;
    const now = Date.now();
    if (now - lastMeasure > 400) {
      lastMeasure = now;
      measureUpcoming();
    }
  });
}

function initUpcoming() {
  const home = document.getElementById('v-home');
  const hol = document.getElementById('holidays');
  if (home && hol) home.appendChild(hol);

  const hh = document.querySelector('.hhead span');
  if (hh) hh.textContent = 'Upcoming';

  buildBlurZones();

  const box = document.getElementById('hList');
  if (box) {
    let lastIdx = 0;
    box.addEventListener('scroll', function () {
      applyScrollShift();
      queueFade();
      const first = box.querySelector('.hcard');
      const rowH = first ? first.offsetHeight + 10 : 80;
      const idx = Math.round(box.scrollTop / rowH);
      if (idx !== lastIdx) { lastIdx = idx; haptic(7); }
    }, { passive: true });
    box.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.hcard')) haptic(10);
    });
  }

  window.addEventListener('scroll', queueFade, { passive: true });
  window.addEventListener('resize', queueFade);

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(measureUpcoming);
    ['holidays', 'nav'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) ro.observe(el);
    });
    const head = document.querySelector('.hhead');
    if (head) ro.observe(head);
  }
}

/* ==========================================================================
   15. PRESS FEEDBACK, BOTTOM BAR, SETTINGS BUTTON, PLUS BUTTON
   ========================================================================== */
function lightUp(el) {
  el.classList.remove('lit');
  void el.offsetWidth;
  el.classList.add('lit');
  clearTimeout(el._litT);
  el._litT = setTimeout(function () { el.classList.remove('lit'); }, 700);
}

function initPressFeedback() {
  document.addEventListener('pointerdown', function (e) {
    const t = (e.target && e.target.closest)
      ? e.target.closest('#swGo,#tmGo,.round,.fab,#nav button') : null;
    if (!t) return;
    haptic(t.id === 'swGo' || t.id === 'tmGo' ? 16 : 8);
    lightUp(t);
  }, true);
}

function initNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  let downAt = 0;

  nav.addEventListener('pointerdown', function (e) {
    const b = (e.target && e.target.closest) ? e.target.closest('[data-tab]') : null;
    if (!b) return;
    downAt = Date.now();
    showTab(b.dataset.tab);
  }, true);

  nav.addEventListener('click', function (e) {
    const b = (e.target && e.target.closest) ? e.target.closest('[data-tab]') : null;
    if (!b) return;
    if (Date.now() - downAt < 1500) {
      e.stopImmediatePropagation();
      e.preventDefault();
    } else {
      showTab(b.dataset.tab);
    }
  }, true);
}

function setPenOut(on) {
  if (on === penOut) return;
  penOut = on;
  const c = document.getElementById('cog');
  if (c) c.classList.toggle('out', on);
  haptic(on ? 8 : 10);
}

function setPlusOut(on) {
  if (on === plusOut) return;
  plusOut = on;
  const a = document.getElementById('add');
  if (a) a.classList.toggle('out', on);
  haptic(on ? 8 : 10);
}

function initSettingsButton() {
  const cog = document.getElementById('cog');
  if (!cog) return;
  cog.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
  cog.setAttribute('aria-label', 'Settings');

  cog.addEventListener('pointerdown', function () {
    cog.classList.add('press');
    haptic(10);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    cog.addEventListener(ev, function () { cog.classList.remove('press'); });
  });
  cog.onclick = function () { openSettings(); };
}

function initAddButton() {
  const add = document.getElementById('add');
  if (!add) return;
  if (!add.querySelector('.plusi')) {
    add.innerHTML = '<span class="plusi">' + (add.innerHTML.trim() || '+') + '</span>';
  }
  add.setAttribute('aria-label', 'Add widget');
}

function initPopoverWatch() {
  new MutationObserver(function () {
    const open = sheet.classList.contains('open') && !sheet.classList.contains('closing');
    const kind = sheet.dataset.kind || '';
    setPenOut(open && kind === 'settings');
    setPlusOut(open && kind === 'add');
  }).observe(sheet, { attributes: true, attributeFilter: ['class', 'data-kind'] });
}

function initIcons() {
  setIcon('swLap', ICON.lap, 'Lap');
  setIcon('swReset', ICON.reset, 'Reset');
  setIcon('tmReset', ICON.reset, 'Cancel');
  setIcon('aPlus', ICON.plus, 'Add alarm');
  setIcon('pAdd', ICON.plus, 'Add timer');
}

/* ==========================================================================
   16. CONNECTION, PERMISSIONS & SERVICE WORKER
   ========================================================================== */
function hideToast() {
  const el = document.getElementById('toast');
  if (el) el.classList.remove('show');
}

function toast(text, opt) {
  opt = opt || {};
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<span class="tmsg"></span><button class="tact" type="button"></button>';
    document.body.appendChild(el);
  }
  el.querySelector('.tmsg').textContent = text;
  const btn = el.querySelector('.tact');
  if (opt.action) {
    btn.textContent = opt.action.label;
    btn.style.display = '';
    btn.onclick = function () { hideToast(); opt.action.fn(); };
  } else {
    btn.style.display = 'none';
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  if (!opt.sticky) toastTimer = setTimeout(hideToast, opt.ms || 3500);
}

function netError(kind) { const e = new Error(kind); e.kind = kind; return e; }
function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function netMessage(err) {
  switch (err && err.kind) {
    case 'offline': return 'No internet connection';
    case 'timeout': return 'Connection is slow, try again';
    case 'http': return 'The service is busy, try again';
    default: return 'Could not connect, try again';
  }
}

function fetchJson(url, opt) {
  opt = opt || {};
  const timeoutMs = opt.timeout || 8000;
  const retries = opt.retries == null ? 1 : opt.retries;

  function attempt(n) {
    if (navigator.onLine === false) return Promise.reject(netError('offline'));
    const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    let timedOut = false;
    const timer = setTimeout(function () { timedOut = true; if (ctl) ctl.abort(); }, timeoutMs);
    if (opt.signal && ctl) opt.signal.addEventListener('abort', function () { ctl.abort(); });

    return fetch(url, ctl ? { signal: ctl.signal } : {})
      .then(function (r) {
        clearTimeout(timer);
        if (!r.ok) { const e = netError('http'); e.status = r.status; throw e; }
        return r.json();
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (opt.signal && opt.signal.aborted) throw err;
        const e = (err && err.kind) ? err : netError(timedOut ? 'timeout' : (navigator.onLine === false ? 'offline' : 'network'));
        const retryable = e.kind === 'timeout' || e.kind === 'network' || (e.kind === 'http' && e.status >= 500);
        if (retryable && n < retries) return delay(700 * (n + 1)).then(function () { return attempt(n + 1); });
        throw e;
      });
  }
  return attempt(0);
}

function onBackOnline() {
  if (hasHome()) refreshMyPlace(false);
  syncCountry();
  loadHolidays(detectCountry());
  const q = document.getElementById('wsq');
  if (q && q.value.trim().length >= 2 && q.oninput) q.oninput();
}

function initConnection() {
  window.addEventListener('offline', function () { toast('You are offline. Everything saved still works.', { ms: 4500 }); });
  window.addEventListener('online', function () { toast('Back online'); onBackOnline(); });
}

/* ---- notifications ---- */
function notifSupported() { return 'Notification' in window; }

function requestNotifications() {
  if (!notifSupported()) return Promise.resolve('unsupported');
  if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
  return new Promise(function (resolve) {
    try {
      const r = Notification.requestPermission(resolve);
      if (r && r.then) r.then(resolve);
    } catch (e) { resolve(Notification.permission); }
  });
}

function maybeAskNotifications() {
  if (!notifSupported() || Notification.permission !== 'default') return;
  let asked = false;
  try { asked = !!localStorage.getItem(NOTIF_ASKED); } catch (e) {}
  if (asked) return;
  try { localStorage.setItem(NOTIF_ASKED, '1'); } catch (e) {}
  requestNotifications();
}

function notify(title, body, tag) {
  if (!notifSupported() || Notification.permission !== 'granted') return;
  const opts = { body: body, tag: tag || 'clock', renotify: true, requireInteraction: true, vibrate: [300, 150, 300, 150, 300] };
  function plain() { try { new Notification(title, opts); } catch (e) {} }
  if (swReg && swReg.showNotification) swReg.showNotification(title, opts).catch(plain);
  else plain();
}

function closeNotif(tag) {
  try {
    if (swReg && swReg.getNotifications) {
      swReg.getNotifications({ tag: tag }).then(function (list) {
        list.forEach(function (n) { n.close(); });
      });
    }
  } catch (e) {}
}

function requestPersistentStorage() {
  if (!(navigator.storage && navigator.storage.persist && navigator.storage.persisted)) return Promise.resolve(false);
  return navigator.storage.persisted().then(function (p) { return p || navigator.storage.persist(); }).catch(function () { return false; });
}

/* ---- permission status sheet ---- */
function geoPermState() {
  if (!navigator.geolocation) return 'unsupported';
  if (window.isSecureContext === false) return 'insecure';
  if (!navigator.permissions || !navigator.permissions.query) return 'unknown';
  return navigator.permissions.query({ name: 'geolocation' }).then(function (st) { return st.state; }).catch(function () { return 'unknown'; });
}

function notifState() {
  if (!notifSupported()) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

function storageState() {
  if (!(navigator.storage && navigator.storage.persisted)) return 'unsupported';
  return navigator.storage.persisted().then(function (p) { return p ? 'granted' : 'prompt'; }).catch(function () { return 'unknown'; });
}

function permLabel(st) {
  return { granted: 'Allowed', denied: 'Blocked', prompt: 'Not allowed yet', unknown: 'Not allowed yet',
    unsupported: 'Not supported', insecure: 'Needs HTTPS' }[st] || st;
}

function openPermissions() {
  Promise.all([geoPermState(), notifState(), storageState()]).then(function (r) {
    const rows = [
      ['geo', 'Location', 'Shows the time and date of the place where you are, and picks the country for Upcoming dates.', r[0]],
      ['notif', 'Notifications', 'Alerts for alarms and timers while the app is in the background.', r[1]],
      ['store', 'Keep my data', 'Stops the browser from deleting your alarms and settings.', r[2]]
    ];

    let h = '<div class="title">Permissions &amp; connection</div>';
    h += '<div class="row"><div class="label">Internet</div><div class="pstate" id="pnet">' +
      (navigator.onLine === false ? 'Offline' : 'Online') + '</div><button class="btn" id="ptest">Test</button></div>';
    rows.forEach(function (x) {
      const st = x[3];
      h += '<div class="row"><div class="label">' + x[1] + '</div><div class="pstate">' + permLabel(st) + '</div>' +
        ((st === 'prompt' || st === 'unknown') ? '<button class="btn" data-p="' + x[0] + '">Allow</button>' : '') + '</div>';
      h += '<div class="phint">' + (st === 'denied'
        ? 'Blocked. Allow it in the site settings of your browser, then open this page again.' : x[2]) + '</div>';
    });
    h += '<div class="row"><div class="label">Keep screen awake</div><div class="pstate">' +
      (('wakeLock' in navigator) ? 'Supported' : 'Not supported') + '</div></div>';
    h += '<div class="row"><button class="btn" id="pback">Back</button><button class="btn" id="done">Done</button></div>';
    openSheet(h, 'settings');

    document.getElementById('ptest').onclick = function () {
      const el = document.getElementById('pnet');
      el.textContent = 'Checking...';
      fetchJson(GEO_URL + '?name=London&count=1&format=json', { retries: 0, timeout: 6000 })
        .then(function () { el.textContent = 'Online, connected'; })
        .catch(function (e) { el.textContent = e && e.kind === 'offline' ? 'Offline' : 'No connection to the internet'; });
    };

    sheet.querySelectorAll('[data-p]').forEach(function (b) {
      b.onclick = function () {
        const k = b.dataset.p;
        const job = k === 'geo' ? refreshMyPlace(true) : (k === 'notif' ? requestNotifications() : requestPersistentStorage());
        Promise.resolve(job).then(openPermissions);
      };
    });
    document.getElementById('pback').onclick = openSettings;
    document.getElementById('done').onclick = closeSheet;
  });
}

function watchPermissions() {
  if (!navigator.permissions || !navigator.permissions.query) return;
  navigator.permissions.query({ name: 'geolocation' }).then(function (st) {
    st.onchange = function () {
      if (st.state === 'granted') refreshMyPlace(true);
      else if (st.state === 'denied') setGeo('denied');
    };
  }).catch(function () {});
}

function initWorldHome() {
  window.addEventListener('focus', function () {
    checkZoneChange();
    if (hasHome()) refreshMyPlace(false);
  });
  setInterval(function () {
    if (hasHome() && !document.hidden) refreshMyPlace(false);
  }, 10 * 60 * 1000);
}

/* ---- service worker: offline support, notifications, silent update ---- */
// a new version takes over by itself, no "new version" message
function offerUpdate(worker) {
  worker.postMessage('SKIP_WAITING');
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    // reload only when nothing is running, so an alarm, timer or stopwatch is never interrupted
    if (!ringOn && !tm.running && !sw.running) location.reload();
  });

  navigator.serviceWorker.register('sw.js')
    .then(function (reg) {
      swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', function () {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw);
        });
      });
      setInterval(function () { reg.update().catch(function () {}); }, 60 * 60 * 1000);
      return navigator.serviceWorker.ready;
    })
    .then(function (reg) { if (reg) swReg = reg; })
    .catch(function () {});
}

/* ==========================================================================
   17. INIT
   ========================================================================== */
function bindEvents() {
  overlay.onclick = closeSheet;

  document.getElementById('ringStop').onclick = stopRing;
  document.getElementById('ringSnooze').onclick = function () {
    const f = ringSnoozeFn;
    stopRing();
    if (f) f();
  };

  document.getElementById('add').onclick = function () { openAddWidget(); };

  document.getElementById('aPlus').onclick = function (e) { openAlarmSheet(null, pt(e)); };
  document.getElementById('aEdit').onclick = function () {
    alarmEditMode = !alarmEditMode;
    this.textContent = alarmEditMode ? 'Done' : 'Edit';
    renderAlarms();
  };

  document.getElementById('swGo').onclick = function () {
    if (sw.running) { sw.elapsed += Date.now() - sw.start; sw.running = false; }
    else { sw.start = Date.now(); sw.running = true; }
    renderSw();
  };
  document.getElementById('swLap').onclick = function () {
    if (swMs() > 0) { sw.laps.push(swMs()); renderLaps(); }
  };
  document.getElementById('swReset').onclick = function () {
    sw = { running: false, start: 0, elapsed: 0, laps: [] };
    renderSw(); renderLaps();
  };

  document.getElementById('pAdd').onclick = function (e) { openPresetSheet(pt(e)); };
  document.getElementById('tmGo').onclick = timerGo;
  document.getElementById('tmReset').onclick = function () {
    tm.running = false;
    tm.remaining = tm.total;
    saveTm(); renderTm();
  };

  ['click', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, unlockAudio, { passive: true });
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (globalSet.awake) setAwake(true);
    checkAlarms();
    if (tm.running) renderTm();
    tick();
    loadHolidays(detectCountry());
    renderUpcoming();
    queueFade();
  });
  document.addEventListener('click', function () {
    if (globalSet.awake && !wakeLock) setAwake(true);
  });
}

function initApp() {
  injectStyles();
  applyTheme();
  bindEvents();
  initIcons();
  initPressFeedback();
  initNav();
  initSettingsButton();
  initAddButton();
  initPopoverWatch();
  initUpcoming();

  buildDial();
  buildWheels();
  renderLaps();
  renderPresets();
  applyDigitMode();
  syncWheels();
  syncCountry();
  renderUpcoming();
  if (globalSet.awake) setAwake(true);
  initConnection();
  initWorldHome();
  registerSW();
  requestPersistentStorage();
  watchPermissions();

  setInterval(tick, 1000);
  setInterval(checkAlarms, 1000);
  setInterval(function () { if (sw.running) renderSw(); }, 50);
  setInterval(function () { if (tm.running) renderTm(); }, 200);
  setInterval(renderUpcoming, 60000);
  setInterval(function () { loadHolidays(detectCountry()); }, 6 * 3600 * 1000);
  setInterval(queueFade, 500);
  requestAnimationFrame(sweepLoop);

  showTab('home');
  measureUpcoming();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
