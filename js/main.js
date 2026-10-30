/* ==========================================================================
   CLOCK APP - main.js
   1 Config & state        7 Digits & time HTML       13 Stopwatch
   2 Helpers & icons       8 Home widgets             14 Timer & presets
   3 Injected styles       9 Settings                 15 Upcoming
   4 Storage              10 Edit / Add widget        16 Press feedback, nav
   5 Sheet system & UI    11 Tabs                     17 Connection, permissions, SW
   6 Tones & ringing      12 Alarms                   18 Init
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
const HKEY = 'clockNager_';
const IPKEY = 'clockIpCc';
const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const HOL_URL = 'https://date.nager.at/api/v3/PublicHolidays/';
const PLACE_FRESH_MS = 20 * 60 * 1000;
const HOL_TTL = 7 * 24 * 3600 * 1000;

const RETRO = ['#4aa3d8', '#ef5b55', '#f4f1ea'];
const COLORS = ['#ffffff', '#4fc3f7', '#81c784', '#ffb74d', '#f06292'];
const TYPES = {
  digital: { n: 'Digital clock', d: 'Large time, 12 or 24 hour' },
  analog: { n: 'Analog clock', d: 'Simple hands and ticks' },
  date: { n: 'Date', d: 'Day, date and month' },
  home: { n: 'My location clock', d: 'Follows where this phone is' },
  world: { n: 'World clock', d: 'Search any city or place' },
  classic: { n: 'Classic clock', d: 'Smooth sweeping second hand' }
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
let editW = null;
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
function $(id) { return document.getElementById(id); }
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

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.6v12.8l10.6-6.4z" fill="currentColor" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.6" y="4.4" width="4.6" height="15.2" rx="1.6"/><rect x="13.8" y="4.4" width="4.6" height="15.2" rx="1.6"/></svg>',
  lap: '<svg viewBox="0 0 24 24"><path d="M6 21V3.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M6.6 4.8h11.2l-2.8 4.2 2.8 4.2H6.6z" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12a7 7 0 1 0 2.05-4.95"/><path d="M11 7.05H7.05V3.1"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};

function setIcon(id, svg, label) {
  const el = $(id);
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
#sheet.open{left:auto!important;right:12px!important;bottom:auto!important;top:calc(64px + env(safe-area-inset-top,0px))!important;width:min(92vw,360px)!important;max-height:calc(100vh - 150px);max-height:calc(100dvh - 150px);overflow-y:auto;border-radius:26px!important;padding:18px 16px 16px!important;animation:popIn .28s cubic-bezier(.22,.8,.25,1) both;scrollbar-width:none}
#sheet.open::-webkit-scrollbar{display:none}
#sheet.open.closing{animation:popOut .16s ease both;pointer-events:none}

/* ---- sheet building blocks ---- */
#sheet{color-scheme:dark}
body.light #sheet{color-scheme:light}
#sheet button{background:none;border:0;color:inherit;font:inherit;padding:0;margin:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
#sheet .shead{display:flex;align-items:center;gap:10px;min-height:34px;margin:0 0 14px}
#sheet .stitle{flex:1;font-size:22px;font-weight:800!important;letter-spacing:-.03em}
#sheet .back{width:34px;height:34px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0 0 3px!important;font-size:24px;line-height:1;background:rgba(255,255,255,.12)}
body.light #sheet .back{background:rgba(0,0,0,.07)}
#sheet .sl{font-size:11px;letter-spacing:.09em;text-transform:uppercase;opacity:.55;margin:18px 8px 7px}
#sheet .shead+.sl{margin-top:2px}
#sheet .grp{margin-top:14px;border-radius:16px;overflow:hidden;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08)}
body.light #sheet .grp{background:rgba(0,0,0,.045);border-color:rgba(0,0,0,.05)}
#sheet .sl+.grp,#sheet .shead+.grp,#sheet .pcard+.grp{margin-top:0}
#sheet .li{display:flex;align-items:center;gap:12px;width:100%;min-height:48px;padding:10px 14px;box-sizing:border-box;text-align:left;font-size:15px}
#sheet .li+.li{border-top:1px solid rgba(255,255,255,.08)}
body.light #sheet .li+.li{border-top-color:rgba(0,0,0,.07)}
#sheet button.li{transition:background .12s ease}
#sheet button.li:active{background:rgba(255,255,255,.09)}
body.light #sheet button.li:active{background:rgba(0,0,0,.06)}
#sheet .k{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#sheet .kk{flex:1;min-width:0}
#sheet .kk .k{white-space:normal}
#sheet .d{font-size:12px;line-height:1.35;margin-top:2px;opacity:.55;white-space:normal}
#sheet .v{display:flex;align-items:center;gap:6px;min-width:0;max-width:52%;font-size:14px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#sheet .nav::after{content:"\\203A";flex:none;font-size:22px;line-height:1;opacity:.4;margin-left:-4px}
#sheet .sn{margin:8px 8px 0;font-size:12px;line-height:1.4;opacity:.6}
#sheet .sn.mid{text-align:center;margin:14px 0 4px}
#sheet .chk{flex:none;opacity:0;color:#ff9f0a;font-size:17px}
#sheet .li.sel .chk{opacity:1}
#sheet .dot{display:inline-block;flex:none;width:8px;height:8px;border-radius:50%;background:#8e8e93}
#sheet .dot.ok{background:#30d158}
#sheet .dot.bad{background:#ff453a}

#sheet input[type=text],#sheet input[type=date],#sheet input[type=time],#sheet select{box-sizing:border-box;min-width:0;padding:0;border:0;outline:0;background:transparent;color:inherit;font-size:15px;-webkit-appearance:none;appearance:none}
#sheet .inp{flex:1;text-align:right}
#sheet select.r{flex:1;max-width:64%;margin-left:auto;text-align:right;text-align-last:right;opacity:.85}
#sheet select option{color:#111;background:#fff}
#sheet input::placeholder{color:inherit;opacity:.4}
#sheet .bigtime{width:100%;padding:6px 0;text-align:center;font-size:46px;letter-spacing:-.02em}
#sheet .li.cen{justify-content:center}

#sheet .seg{display:flex;gap:2px;padding:3px;border-radius:11px;background:rgba(255,255,255,.10);min-width:150px}
body.light #sheet .seg{background:rgba(0,0,0,.07)}
#sheet .seg button{flex:1;padding:7px 10px;border-radius:9px;font-size:13px;opacity:.7;white-space:nowrap;transition:background .2s ease,opacity .2s ease}
#sheet .seg button.on{opacity:1;background:rgba(255,255,255,.24);box-shadow:0 1px 3px rgba(0,0,0,.25)}
body.light #sheet .seg button.on{background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.15)}

#sheet .sx{position:relative;flex:none;width:50px;height:30px;border-radius:15px;background:rgba(255,255,255,.2);transition:background .2s ease}
body.light #sheet .sx{background:rgba(0,0,0,.18)}
#sheet .sx::after{content:"";position:absolute;top:2px;left:2px;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.3);transition:transform .22s cubic-bezier(.3,1.4,.5,1)}
#sheet .sx.on{background:#ff9f0a}
#sheet .sx.on::after{transform:translateX(20px)}

#sheet .sws{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:9px}
#sheet .sw{width:27px;height:27px;border-radius:50%;border:2px solid rgba(255,255,255,.28);transition:transform .15s ease}
body.light #sheet .sw{border-color:rgba(0,0,0,.18)}
#sheet .sw:active{transform:scale(.88)}
#sheet .sw.on{outline:2px solid #ff9f0a;outline-offset:2px}

#sheet input[type=range]{-webkit-appearance:none;appearance:none;flex:1;height:4px;margin:0;border-radius:2px;background:rgba(255,255,255,.25);outline:0}
body.light #sheet input[type=range]{background:rgba(0,0,0,.18)}
#sheet input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.4)}
#sheet input[type=range]::-moz-range-thumb{width:24px;height:24px;border:0;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.4)}

#sheet .pcard{padding:14px 16px;margin-top:0;border-radius:16px;background:linear-gradient(150deg,rgba(255,159,10,.24),rgba(255,159,10,.06));border:1px solid rgba(255,159,10,.30)}
#sheet .pcn{font-size:21px;font-weight:800!important;letter-spacing:-.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#sheet .pcs{margin-top:3px;font-size:12.5px;opacity:.7}

#sheet .acts{display:flex;gap:10px;margin-top:16px}
#sheet .acts+.acts{margin-top:10px}
#sheet .bt{flex:1;padding:13px 10px;border-radius:14px;font-size:15px;text-align:center;background:rgba(255,255,255,.12);transition:transform .12s ease,background .2s ease}
body.light #sheet .bt{background:rgba(0,0,0,.06)}
#sheet .bt:active{transform:scale(.96)}
#sheet .bt.pri,body.light #sheet .bt.pri{color:#fff;background:linear-gradient(150deg,#ffb54d,#ff8a00);box-shadow:0 6px 16px rgba(255,140,20,.35)}
#sheet .bt.dng{color:#ff453a}
#sheet .mini{flex:none;padding:6px 13px;border-radius:999px;font-size:13px;white-space:nowrap;color:#ff9f0a;background:rgba(255,159,10,.18)}
#sheet .mini.dng{color:#ff453a;background:rgba(255,69,58,.16)}

#sheet .trip{display:flex;gap:8px;padding:12px}
#sheet .trip>div{flex:1;text-align:center}
#sheet .trip select{width:100%;padding:8px 0;border-radius:10px;font-size:24px;text-align:center;text-align-last:center;background:rgba(255,255,255,.10)}
body.light #sheet .trip select{background:rgba(0,0,0,.06)}
#sheet .trip i{display:block;margin-top:5px;font-style:normal;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;opacity:.55}
#sheet .tonebox{max-height:52vh;overflow-y:auto;margin:0 -6px;padding:0 6px;scrollbar-width:none}
#sheet .tonebox::-webkit-scrollbar{display:none}

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

.wdate{margin-top:6px;opacity:.8}
.woff{margin-top:2px!important;opacity:.6}
.clsvg{width:calc(var(--size)*3.5);height:calc(var(--size)*3.5);filter:drop-shadow(0 8px 18px rgba(0,0,0,.35))}

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

/* ---- stopwatch & timer play button: light, transparent orange glass ---- */
#swGo,#tmGo{background:linear-gradient(150deg,rgba(255,205,140,.50),rgba(255,160,50,.30) 55%,rgba(255,140,20,.24))!important;border:1px solid rgba(255,230,200,.50)!important;color:#fff;box-shadow:inset 0 1.5px 1px rgba(255,255,255,.7),inset 0 -2px 4px rgba(255,255,255,.15),inset 0 0 18px rgba(255,255,255,.12),0 10px 26px rgba(255,140,20,.22),0 0 22px rgba(255,159,10,.18)!important}
#swGo::before,#tmGo::before{background:linear-gradient(rgba(255,255,255,.38),rgba(255,255,255,0))}
body.light #swGo,body.light #tmGo{color:#e68600}
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
function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
function writeJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

function defaultWidgets() { return [newWidget('digital'), newWidget('date')]; }

function loadWidgets() {
  const a = readJson(KEY);
  return Array.isArray(a) ? a : defaultWidgets();
}
function saveWidgets() { writeJson(KEY, widgets); }

function loadAlarms() {
  const a = readJson(AKEY);
  return Array.isArray(a) ? a : [];
}
function saveAlarms() { writeJson(AKEY, alarms); }

function loadGlobal() {
  const g = {
    bg: '#000000', bgLight: '#f2f2f7', theme: 'dark', awake: false, font: 'sf', country: 'auto',
    alarmTone: 't31', timerTone: 't43', swTone: 'off', customName: ''
  };
  const s = readJson(GKEY);
  return s && typeof s === 'object' ? Object.assign(g, s) : g;
}
function saveGlobal() { writeJson(GKEY, globalSet); }

function loadPresets() {
  const p = readJson(PKEY);
  if (Array.isArray(p)) return p;
  return [
    { id: 'p1', name: 'Brush teeth', s: 120 },
    { id: 'p2', name: 'Face mask', s: 900 },
    { id: 'p3', name: 'Boil eggs', s: 600 },
    { id: 'p4', name: 'Nap', s: 1800 }
  ];
}
function savePresets() { writeJson(PKEY, presets); }

function loadMyPlace() {
  const p = readJson(PLKEY);
  return p && typeof p.name === 'string' ? p : { name: '', tz: '', cc: '', ts: 0 };
}
function saveMyPlace() { writeJson(PLKEY, myPlace); }

function saveTm() { writeJson(TKEY, tm); }

/* ---- IndexedDB: keeps the custom tone file ---- */
function idbRun(mode, fn) {
  return new Promise(function (res, rej) {
    const r = indexedDB.open('clockTones', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('t'); };
    r.onerror = function () { rej(r.error); };
    r.onsuccess = function () {
      const tx = r.result.transaction('t', mode);
      const req = fn(tx.objectStore('t'));
      tx.oncomplete = function () { res(req ? req.result : undefined); };
      tx.onerror = function () { rej(tx.error); };
    };
  });
}
function idbGet(k) { return idbRun('readonly', function (s) { return s.get(k); }).then(function (v) { return v || null; }); }
function idbSet(k, v) { return idbRun('readwrite', function (s) { return s.put(v, k); }); }
function idbDel(k) { return idbRun('readwrite', function (s) { return s.delete(k); }); }

/* ==========================================================================
   5. SHEET SYSTEM & UI BLOCKS
   --------------------------------------------------------------------------
   Every sheet is the same pop-in card. Small helpers build the grouped,
   iOS-style layout: head() sec() seg() swatches() pick()
   ========================================================================== */
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
  editW = null;
  overlay.classList.remove('open');
  if (!sheet.classList.contains('open') || sheet.classList.contains('closing')) return;
  sheet.classList.add('closing');
  clearTimeout(closeTimer);
  closeTimer = setTimeout(function () { sheet.classList.remove('open', 'closing'); }, 170);
}

function head(title, backId) {
  return '<div class="shead">' +
    (backId ? '<button class="back" id="' + backId + '" aria-label="Back">&#8249;</button>' : '') +
    '<div class="stitle">' + title + '</div></div>';
}

function sec(label, inner, note) {
  return (label ? '<div class="sl">' + label + '</div>' : '') +
    '<div class="grp">' + inner + '</div>' +
    (note ? '<div class="sn">' + note + '</div>' : '');
}

function seg(id, opts, cur) {
  return '<div class="seg" id="' + id + '">' + opts.map(function (o) {
    return '<button data-v="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' class="on"' : '') + '>' + o[1] + '</button>';
  }).join('') + '</div>';
}

function swatches(id, list, cur) {
  return '<div class="sws" id="' + id + '">' + list.map(function (b) {
    const on = String(b[0]).toLowerCase() === String(cur).toLowerCase();
    return '<button class="sw' + (on ? ' on' : '') + '" data-v="' + b[0] + '" title="' + b[1] +
      '" aria-label="' + b[1] + '" style="background:' + b[0] + '"></button>';
  }).join('') + '</div>';
}

function toggleRow(id, label, on) {
  return '<button class="li" id="' + id + '"><span class="k">' + label + '</span><span class="sx' + (on ? ' on' : '') + '"></span></button>';
}

function navRow(attrs, label, value) {
  return '<button class="li nav" ' + attrs + '><span class="k">' + label + '</span>' +
    (value ? '<span class="v">' + value + '</span>' : '') + '</button>';
}

// segmented control or swatch row: marks the tapped button and reports its value
function pick(id, fn) {
  const box = $(id);
  if (!box) return;
  box.onclick = function (e) {
    const b = e.target.closest ? e.target.closest('[data-v]') : null;
    if (!b) return;
    box.querySelectorAll('[data-v]').forEach(function (x) { x.classList.toggle('on', x === b); });
    fn(b.dataset.v);
  };
}

function bindToggle(id, on, fn) {
  const row = $(id);
  if (!row) return;
  row.onclick = function () {
    on = !on;
    row.querySelector('.sx').classList.toggle('on', on);
    fn(on);
  };
}

/* ==========================================================================
   6. TONES & RINGING
   --------------------------------------------------------------------------
   50 built-in tones (made by the browser, so they work offline)
   + one custom tone from your own audio file.
   S(notes, step, length) builds a note list: [midi, start s, length s]
   w = wave   ov = [overtone ratio, gain]   env = 'soft'   g0 = loudness
   ========================================================================== */
function S(m, step, dur) {
  return m.map(function (x, i) { return [x, +(i * step).toFixed(2), dur]; });
}

const TONE_GROUPS = ['Classic bells', 'Soft & calm', 'Bright morning', 'Melody', 'Digital'];
const TONE_DEFS = [
  // ---- Classic bells (1-10)
  { name: 'Church Bell', ov: [2.4, .35], n: S([67, 67, 67], .9, 1.2) },
  { name: 'Temple Bell', ov: [2.76, .4], n: S([72, 79], .7, 1.2) },
  { name: 'Wind Chimes', ov: [2.76, .4], n: S([88, 84, 91, 86, 93], .28, .9) },
  { name: 'Crystal Bell', ov: [3, .25], n: S([91, 95, 98, 95], .2, .6) },
  { name: 'Grandfather Clock', ov: [2, .3], n: S([64, 60, 62, 55], .6, .8) },
  { name: 'Doorbell', ov: [2.4, .3], n: S([76, 72], .6, .9) },
  { name: 'Glass Bells', ov: [4, .2], n: S([84, 88, 91, 96], .18, .6) },
  { name: 'Carillon', ov: [2.76, .35], n: S([72, 76, 79, 84, 79, 76, 72], .22, .5) },
  { name: 'Tower Bell', ov: [2, .4], n: S([55, 55, 55, 55], .9, 1.2) },
  { name: 'Silver Bells', ov: [3, .3], n: S([88, 88, 91, 88, 95], .22, .5) },
  // ---- Soft & calm (11-20)
  { name: 'Morning Dew', env: 'soft', n: S([72, 76, 79, 84], .5, .6) },
  { name: 'Slow Rise', env: 'soft', n: S([67, 72, 76, 79], .5, .7) },
  { name: 'Calm Waves', env: 'soft', n: S([69, 72, 76, 72], .6, .7) },
  { name: 'Gentle Light', env: 'soft', ov: [2, .2], n: S([76, 79, 83], .5, .8) },
  { name: 'Lullaby', env: 'soft', n: S([72, 76, 72, 67, 72], .5, .6) },
  { name: 'Cloud Drift', env: 'soft', n: S([79, 76, 72], .6, .8) },
  { name: 'Still Water', env: 'soft', n: S([64, 71, 76], .7, .9) },
  { name: 'Moon Glow', env: 'soft', ov: [1.5, .3], n: S([67, 74, 79], .7, 1) },
  { name: 'Soft Piano', ov: [2, .2], n: S([72, 76, 79, 76], .4, .5) },
  { name: 'Dawn Breeze', env: 'soft', n: S([84, 81, 79, 76], .5, .6) },
  // ---- Bright morning (21-30)
  { name: 'Sunrise', w: 'triangle', n: S([72, 76, 79, 84], .2, .25) },
  { name: 'Good Morning', ov: [2, .3], n: S([76, 79, 83, 84], .25, .35) },
  { name: 'Sunny Day', w: 'triangle', n: S([72, 76, 79, 84, 79, 84], .2, .2) },
  { name: 'Fresh Start', ov: [3, .25], n: S([79, 83, 86, 91], .15, .3) },
  { name: 'Birdsong', n: S([91, 95, 93, 98, 95], .12, .12) },
  { name: 'Happy Ding', ov: [2.76, .3], n: S([88, 91, 95], .2, .4) },
  { name: 'Spring', w: 'triangle', n: S([74, 78, 81, 86], .18, .25) },
  { name: 'Daybreak', ov: [2, .3], n: S([67, 72, 76, 79, 84], .22, .35) },
  { name: 'Golden Hour', w: 'triangle', n: S([69, 73, 76, 81, 76], .25, .3) },
  { name: 'Cheerful', w: 'triangle', n: S([79, 84, 79, 84, 88], .15, .2) },
  // ---- Melody (31-40)
  { name: 'Marimba', ov: [4, .3], n: S([76, 79, 83, 79, 76, 79, 83, 88], .12, .3) },
  { name: 'Waltz', ov: [2, .2], n: S([72, 76, 79, 84], .45, .4) },
  { name: 'Music Box', ov: [3, .3], n: S([84, 88, 91, 88, 84, 79, 84], .2, .35) },
  { name: 'Harp', ov: [2, .25], n: S([60, 64, 67, 72, 76, 79, 84], .1, .5) },
  { name: 'Ode', ov: [2, .2], n: S([76, 76, 77, 79, 79, 77, 76, 74], .3, .25) },
  { name: 'Little Box', ov: [3, .25], n: S([79, 76, 72, 79, 76, 72], .3, .35) },
  { name: 'Rising Scale', w: 'triangle', n: S([60, 62, 64, 65, 67, 69, 71, 72], .12, .2) },
  { name: 'Echo', ov: [2, .3], n: S([84, 84, 79, 79, 84], .3, .3) },
  { name: 'Fanfare', w: 'triangle', n: S([72, 72, 72, 79], .2, .25) },
  { name: 'Canon', ov: [2, .2], n: S([74, 69, 71, 66, 67, 62, 67, 69], .3, .35) },
  // ---- Digital (41-50)
  { name: 'Beep', w: 'square', g0: .1, n: S([81, 81, 81], .25, .12) },
  { name: 'Pulse', w: 'square', g0: .1, n: S([76, 76], .2, .1) },
  { name: 'Radar', env: 'soft', n: S([84, 88, 84, 88, 91], .26, .22) },
  { name: 'Sonar', n: S([79, 79], 1, .4) },
  { name: 'Alert', w: 'square', g0: .1, n: S([84, 79, 84, 79], .2, .15) },
  { name: 'Sweep', w: 'triangle', n: S([72, 76, 79, 84, 88, 91], .1, .15) },
  { name: 'Ping', ov: [2, .3], n: S([91, 91], .35, .15) },
  { name: 'Chirp', w: 'triangle', n: S([88, 95, 88, 95], .12, .1) },
  { name: 'Laser', w: 'triangle', n: S([96, 91, 86, 81, 76], .08, .1) },
  { name: 'Tick Tock', w: 'square', g0: .08, n: S([84, 79, 84, 79], .4, .06) }
];
const TONES = TONE_DEFS.map(function (d, i) {
  return Object.assign({ id: 't' + (i + 1), g: Math.floor(i / 10) }, d);
});

const TONE_KINDS = {
  alarm: { key: 'alarmTone', label: 'Alarm', title: 'Alarm tone' },
  timer: { key: 'timerTone', label: 'Timer', title: 'Timer tone' },
  sw: { key: 'swTone', label: 'Stopwatch lap', title: 'Stopwatch tone' }
};

let toneMaster = null;
let toneSrc = null;
let toneTimer = null;
let customBuf = null;

function toneById(id) {
  for (let i = 0; i < TONES.length; i++) if (TONES[i].id === id) return TONES[i];
  return TONES[0];
}

function toneName(id) {
  if (id === 'off') return 'Off';
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
    return data ? actx.decodeAudioData(data.slice(0)) : null;
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
      if (!buf) { playTone(TONES[0].id, loop); return; }
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
  let end = 0;
  t.n.forEach(function (x) { end = Math.max(end, x[1] + x[2]); });

  function cycle() {
    if (toneMaster !== master) return;
    const t0 = actx.currentTime + 0.02;
    t.n.forEach(function (x) { voice(master, t0 + x[1], x[0], x[2], t); });
  }
  cycle();
  if (loop) toneTimer = setInterval(cycle, (end + 0.7) * 1000);
  return true;
}

function stopPreview() { if (!ringOn) stopTone(); }

function startRing(title, snoozeFn, toneId) {
  stopRing();
  ringOn = true;
  $('ringTitle').textContent = title;
  $('ringSnooze').style.display = snoozeFn ? 'inline-block' : 'none';
  ringSnoozeFn = snoozeFn;
  $('ring').classList.add('open');
  if (document.hidden) notify(title, 'Tap to open the clock', 'clock-ring');

  const ok = playTone(toneId || TONES[0].id, true);
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
  $('ring').classList.remove('open');
}

/* ---- tone picker sheet ---- */
function openToneSheet(kind) {
  const info = TONE_KINDS[kind];
  const key = info.key;
  const row = function (id, name) {
    return '<button class="li" data-id="' + id + '"><span class="k">' + name + '</span><span class="chk">&#10003;</span></button>';
  };

  let h = head(info.title, 'tnBack') + '<div class="tonebox">';
  if (kind === 'sw') h += sec('', row('off', 'Off'));
  TONE_GROUPS.forEach(function (gn, gi) {
    h += sec(gn, TONES.filter(function (t) { return t.g === gi; }).map(function (t) {
      return row(t.id, escapeAttr(t.name));
    }).join(''));
  });
  h += sec('Custom', row('custom', '<span id="tnName"></span>')) +
    '<div class="acts"><button class="bt" id="tnPick">Choose audio file</button><button class="bt dng" id="tnDel">Remove</button></div>' +
    '<input type="file" id="tnFile" accept="audio/*" style="display:none"></div>' +
    '<div class="acts"><button class="bt pri" id="done">Done</button></div>';
  openSheet(h, 'settings');

  function draw() {
    const cur = globalSet[key];
    const has = !!globalSet.customName;
    $('tnName').textContent = has ? globalSet.customName : 'No file chosen';
    $('tnDel').style.display = has ? '' : 'none';
    sheet.querySelectorAll('.li[data-id]').forEach(function (r) {
      r.classList.toggle('sel', r.dataset.id === cur);
    });
  }
  draw();

  function choose(id) {
    globalSet[key] = id;
    saveGlobal();
    draw();
    if (id === 'off') stopPreview();
    else if (!ringOn) playTone(id, false);
  }

  function chooseFile() { unlockAudio(); $('tnFile').click(); }

  sheet.querySelectorAll('.li[data-id]').forEach(function (r) {
    r.onclick = function () {
      if (r.dataset.id === 'custom' && !globalSet.customName) { chooseFile(); return; }
      choose(r.dataset.id);
    };
  });

  $('tnPick').onclick = chooseFile;

  $('tnFile').onchange = function (e) {
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

  $('tnDel').onclick = function () {
    idbDel('custom').catch(function () {});
    customBuf = null;
    globalSet.customName = '';
    if (globalSet.alarmTone === 'custom') globalSet.alarmTone = 't31';
    if (globalSet.timerTone === 'custom') globalSet.timerTone = 't43';
    if (globalSet.swTone === 'custom') globalSet.swTone = 'off';
    saveGlobal();
    stopPreview();
    draw();
  };

  $('tnBack').onclick = openSettings;
  $('done').onclick = closeSheet;
}

/* ==========================================================================
   7. DIGITS & TIME HTML
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
   8. HOME WIDGETS
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
const GEO_NOTES = {
  locating: 'locating...',
  denied: 'location is blocked',
  insecure: 'location needs HTTPS',
  unsupported: 'location not supported'
};

function setGeo(st) {
  geoStatus = st;
  if (editW && $('wsName')) fillPlace(editW);
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
  const stage = $('stage');
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
   9. SETTINGS
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

function openSettings() {
  const light = globalSet.theme === 'light';
  const list = light ? BGS_LIGHT : BGS_DARK;
  const curBg = light ? globalSet.bgLight : globalSet.bg;

  let h = head('Settings');
  h += sec('Appearance',
    '<div class="li"><span class="k">Theme</span>' + seg('themeSeg', [['dark', 'Dark'], ['light', 'Light']], globalSet.theme) + '</div>' +
    '<div class="li"><span class="k">Background</span>' + swatches('bgSw', list, curBg) + '</div>' +
    '<div class="li"><span class="k">Numbers</span>' + seg('fontSeg', [['sf', 'Bold'], ['retro', 'Retro']], digitMode) + '</div>');
  h += sec('Sounds', Object.keys(TONE_KINDS).map(function (k) {
    return navRow('data-tone="' + k + '"', TONE_KINDS[k].label, escapeAttr(toneName(globalSet[TONE_KINDS[k].key])));
  }).join(''));
  h += sec('General',
    toggleRow('awake', 'Keep screen awake', globalSet.awake) +
    navRow('id="upbtn"', 'Upcoming dates', escapeAttr(countryName(detectCountry()) || 'Auto')) +
    navRow('id="fs"', 'Fullscreen', '') +
    navRow('id="permbtn"', 'Permissions &amp; connection', ''));
  h += '<div class="acts"><button class="bt pri" id="done">Done</button></div>';
  openSheet(h, 'settings');

  pick('themeSeg', function (v) {
    globalSet.theme = v;
    saveGlobal(); applyTheme(); renderAll();
    openSettings();
  });

  pick('bgSw', function (v) {
    if (globalSet.theme === 'light') globalSet.bgLight = v;
    else globalSet.bg = v;
    saveGlobal(); applyTheme();
  });

  pick('fontSeg', function (v) {
    digitMode = v;
    globalSet.font = v;
    saveGlobal(); applyDigitMode();
  });

  bindToggle('awake', globalSet.awake, function (on) {
    globalSet.awake = on;
    saveGlobal(); setAwake(on);
  });

  sheet.querySelectorAll('[data-tone]').forEach(function (b) {
    b.onclick = function () { openToneSheet(b.dataset.tone); };
  });
  $('upbtn').onclick = openUpcomingSettings;
  $('permbtn').onclick = openPermissions;
  $('fs').onclick = function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  };
  $('done').onclick = closeSheet;
}

/* ==========================================================================
   10. EDIT / ADD WIDGET SHEETS
   ========================================================================== */
// big card: place name, time zone, GMT offset
function fillPlace(w) {
  const n = $('wsName');
  const s = $('wsSub');
  if (!n || !s) return;
  const zone = zoneOf(w);
  n.textContent = placeLabel(w) || 'Choose a place';
  s.textContent = [zone, offsetText(w, zone, new Date()), w.type === 'home' ? GEO_NOTES[geoStatus] : '']
    .filter(Boolean).join(' · ');
}

function placeHtml(w) {
  let h = '<div class="sl">Location</div><div class="pcard"><div class="pcn" id="wsName"></div><div class="pcs" id="wsSub"></div></div>';
  if (w.type === 'world') {
    h += sec('Search', '<div class="li"><span class="k" style="flex:none">&#128269;</span>' +
      '<input type="text" class="inp" id="wsq" style="text-align:left" placeholder="City or place" maxlength="60" autocomplete="off"></div>') +
      '<div id="wsres"></div>';
  } else {
    h += '<div class="sn">Shows where this phone is. The time follows the phone time zone by itself.</div>' +
      '<div class="acts"><button class="bt" id="wsloc">&#128205; Refresh location</button></div>';
  }
  return h;
}

function initWorldEdit(w) {
  fillPlace(w);

  if (w.type === 'home') {
    $('wsloc').onclick = function () {
      refreshMyPlace(true).then(function (st) {
        fillPlace(w);
        if (st === 'denied') toast('Location is blocked. Allow it in the site settings of your browser.', { ms: 5000 });
        else if (st === 'insecure') toast('Location needs HTTPS.', { ms: 4000 });
        else if (st === 'timeout' || st === 'unavailable') toast('Could not get your location. Using the phone clock.');
        else if (st === 'ok' && navigator.onLine === false) toast('Offline: the place name will update when internet is back.');
      });
    };
    return;
  }

  const q = $('wsq');
  const res = $('wsres');
  let timer = null;

  function msg(t, retry) {
    res.innerHTML = '<div class="sn mid">' + t + '</div>';
    if (retry) {
      const b = document.createElement('button');
      b.className = 'bt';
      b.textContent = 'Retry';
      b.onclick = function () { q.oninput(); };
      const box = document.createElement('div');
      box.className = 'acts';
      box.appendChild(b);
      res.appendChild(box);
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
        res.innerHTML = r.local ? '<div class="sn">No internet: showing the offline time zone list</div>' : '';
        const grp = document.createElement('div');
        grp.className = 'grp';
        r.list.forEach(function (p) {
          const sub = [p.admin1, p.country].filter(Boolean).join(', ');
          const b = document.createElement('button');
          b.className = 'li';
          b.innerHTML = '<span class="k">' + escapeAttr(p.name) + '</span>' + (sub ? '<span class="v">' + escapeAttr(sub) + '</span>' : '');
          b.onclick = function () {
            w.zone = p.timezone;
            w.city = p.name;
            saveWidgets(); renderAll(); fillPlace(w);
            res.innerHTML = '';
            q.value = '';
          };
          grp.appendChild(b);
        });
        res.appendChild(grp);
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
  editW = w;
  const zone = isZoneWidget(w);

  let h = head(TYPES[w.type].n);
  if (zone) h += placeHtml(w);

  h += sec('Appearance',
    '<div class="li"><span class="k">Color</span>' + swatches('clr', COLORS.map(function (c) { return [c, c]; }), w.color) + '</div>' +
    '<div class="li"><span class="k">Size</span><input type="range" id="sz" min="6" max="26" step="1" value="' + w.size + '"></div>');

  if (w.type === 'digital' || zone) {
    h += sec('Time',
      '<div class="li"><span class="k">Format</span>' + seg('fmtSeg', [['24', '24-hour'], ['12', '12-hour']], w.hour12 ? '12' : '24') + '</div>' +
      toggleRow('rt', 'Retro colors', w.retro));
  }

  h += '<div class="acts"><button class="bt" id="up">&#8593; Move up</button><button class="bt" id="down">&#8595; Move down</button></div>';
  h += '<div class="acts"><button class="bt dng" id="del">Delete</button><button class="bt pri" id="done">Done</button></div>';
  openSheet(h, 'edit', origin);
  editW = w;

  pick('clr', function (v) { w.color = v; saveWidgets(); applyStyle(w); });
  $('sz').oninput = function (e) { w.size = Number(e.target.value); saveWidgets(); applyStyle(w); };

  if (zone) initWorldEdit(w);

  if ($('fmtSeg')) pick('fmtSeg', function (v) { w.hour12 = v === '12'; saveWidgets(); renderAll(); });
  if ($('rt')) bindToggle('rt', !!w.retro, function (on) { w.retro = on; saveWidgets(); renderAll(); });

  $('up').onclick = function () {
    const i = widgets.indexOf(w);
    if (i > 0) { widgets.splice(i, 1); widgets.splice(i - 1, 0, w); saveWidgets(); renderAll(); }
  };
  $('down').onclick = function () {
    const i = widgets.indexOf(w);
    if (i < widgets.length - 1) { widgets.splice(i, 1); widgets.splice(i + 1, 0, w); saveWidgets(); renderAll(); }
  };
  $('del').onclick = function () {
    widgets = widgets.filter(function (x) { return x !== w; });
    saveWidgets(); closeSheet(); renderAll();
  };
  $('done').onclick = closeSheet;
}

function openAddWidget() {
  let h = head('Add widget');
  h += sec('', Object.keys(TYPES).map(function (t) {
    return '<button class="li nav" data-t="' + t + '"><div class="kk"><div class="k">' + TYPES[t].n +
      '</div><div class="d">' + TYPES[t].d + '</div></div></button>';
  }).join(''));
  h += '<div class="acts"><button class="bt dng" id="reset">Reset all</button><button class="bt pri" id="done">Close</button></div>';
  openSheet(h, 'add');

  sheet.querySelectorAll('[data-t]').forEach(function (b) {
    b.onclick = function () {
      widgets.push(newWidget(b.dataset.t));
      saveWidgets(); closeSheet(); renderAll();
      window.scrollTo(0, document.body.scrollHeight);
    };
  });
  $('reset').onclick = function () {
    if (confirm('Reset all widgets to default?')) {
      widgets = defaultWidgets();
      saveWidgets(); closeSheet(); renderAll();
    }
  };
  $('done').onclick = closeSheet;
}

/* ==========================================================================
   11. TABS
   ========================================================================== */
function showTab(name) {
  TABS.forEach(function (t) {
    $('v-' + t).classList.toggle('active', t === name);
    document.querySelector('#nav [data-tab="' + t + '"]').classList.toggle('active', t === name);
  });
  $('add').style.display = name === 'home' ? 'block' : 'none';
  window.scrollTo(0, 0);
  closeSheet();
  if (name === 'timer') setTimeout(syncWheels, 50);
  if (name === 'home') {
    renderUpcoming();
    setTimeout(measureUpcoming, 60);
  }
}

/* ==========================================================================
   12. ALARMS
   ========================================================================== */
function snoozeFive() { snoozeAt = Date.now() + 5 * 60 * 1000; }

function renderAlarms() {
  const box = $('alarmList');
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

  const h = head(isNew ? 'New alarm' : 'Edit alarm') +
    sec('', '<div class="li cen"><input type="time" id="asTime" class="bigtime" value="' + draft.time + '"></div>') +
    sec('Details',
      '<div class="li"><span class="k">Label</span><input type="text" id="asLabel" class="inp" placeholder="Alarm" maxlength="30" value="' + escapeAttr(draft.label) + '"></div>' +
      '<div class="li"><span class="k">Repeat</span>' + seg('asRep', [['1', 'Every day'], ['0', 'Once']], draft.daily ? '1' : '0') + '</div>') +
    '<div class="acts"><button class="bt" id="asCancel">Cancel</button>' +
    (isNew ? '' : '<button class="bt dng" id="asDel">Delete</button>') +
    '<button class="bt pri" id="asSave">Save</button></div>';
  openSheet(h, 'alarm', origin);

  pick('asRep', function (v) { draft.daily = v === '1'; });

  $('asSave').onclick = function () {
    const t = $('asTime').value;
    if (!t) return;
    const lbl = $('asLabel').value.trim();
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

  const del = $('asDel');
  if (del) del.onclick = function () {
    alarms = alarms.filter(function (x) { return x !== a; });
    saveAlarms(); renderAlarms(); closeSheet();
  };
  $('asCancel').onclick = closeSheet;
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
   13. STOPWATCH
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
  const g = $('dialTicks');
  const sg = $('subTicks');
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
  const go = $(id);
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
    const main = $('swMain');
    if (main) main.innerHTML = timeHtml(f.main, false);
  }
  if (f.cs !== lastSwCs) {
    lastSwCs = f.cs;
    const cs = $('swCs');
    if (cs) cs.innerHTML = csHtml(f.cs);
  }

  setGoIcon('swGo', sw.running);

  const h1 = $('swHand');
  if (h1) h1.setAttribute('transform', 'rotate(' + ((ms % 60000) / 60000 * 360).toFixed(2) + ' 150 150)');
  const h2 = $('swHand2');
  if (h2) h2.setAttribute('transform', 'rotate(' + (((ms / 60000) % 30) / 30 * 360).toFixed(2) + ' 150 208)');
}

function renderLaps() {
  const box = $('laps');
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
   14. TIMER & PRESETS
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
  const el = $(id);
  return el ? Math.round(el.scrollTop / ITEM_H) : 0;
}

function wheelMs() {
  return (wheelIndex('pH') * 3600 + wheelIndex('pM') * 60 + wheelIndex('pS')) * 1000;
}

function markSelected() {
  ['pH', 'pM', 'pS'].forEach(function (id) {
    const el = $(id);
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
    const el = $(c[0]);
    if (!el) return;
    let html = '';
    for (let i = 0; i < c[1]; i++) html += '<div class="pi">' + pad(i) + '</div>';
    el.innerHTML = html;
    el.addEventListener('scroll', onWheelScroll, { passive: true });
  });
}

function setWheel(id, i) {
  const el = $(id);
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
  const pk = $('tmPicker');
  const rn = $('tmRun');
  const rs = $('tmReset');
  if (pk) pk.style.display = inRun ? 'none' : 'flex';
  if (rn) rn.style.display = inRun ? 'flex' : 'none';
  if (rs) rs.style.display = inRun ? 'flex' : 'none';
  if (lastRun && !inRun) setTimeout(syncWheels, 30);
  lastRun = inRun;

  if (inRun) {
    const str = fmtTimer(ms);
    if (str !== lastTm) {
      lastTm = str;
      const t = $('tmTime');
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
  const box = $('presetList');
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
  function col(id, n, label, sel) {
    let o = '';
    for (let i = 0; i < n; i++) o += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + pad(i) + '</option>';
    return '<div><select id="' + id + '">' + o + '</select><i>' + label + '</i></div>';
  }
  const h = head('New timer') +
    sec('', '<div class="li"><span class="k">Name</span><input type="text" id="ptName" class="inp" placeholder="For example Tea" maxlength="24"></div>') +
    sec('Duration', '<div class="trip">' + col('ptH', 24, 'hours', 0) + col('ptM', 60, 'minutes', 5) + col('ptS', 60, 'seconds', 0) + '</div>') +
    '<div class="acts"><button class="bt" id="ptCancel">Cancel</button><button class="bt pri" id="ptSave">Save</button></div>';
  openSheet(h, 'preset', origin);

  $('ptSave').onclick = function () {
    const s = Number($('ptH').value) * 3600 + Number($('ptM').value) * 60 + Number($('ptS').value);
    if (s <= 0) return;
    const name = $('ptName').value.trim() || 'Timer';
    presets.push({ id: 'p' + Date.now(), name: name, s: s });
    savePresets(); renderPresets(); closeSheet();
  };
  $('ptCancel').onclick = closeSheet;
}

/* ==========================================================================
   15. UPCOMING  (every country, updates itself)
   --------------------------------------------------------------------------
   Country : Settings choice, otherwise GPS -> internet (IP) -> time zone -> language
   Dates   : a) date-holidays library (about 200 countries, saved by the browser
                after the first load, so it also works offline)
             b) Nager.Date as backup when the library has no data for a country
             c) world-wide important days   d) your own dates
   Optional: put holidays.min.js next to index.html (loaded first); the CDN is the backup.
   ========================================================================== */
const LIB_URLS = ['holidays.min.js', 'https://cdn.jsdelivr.net/npm/date-holidays@3/dist/umd.min.js'];
const REL_RE = /christmas|easter|good friday|epiphany|ascension|pentecost|whit|corpus|assumption|all saints|all souls|immaculate|diwali|deepavali|holi\b|vesak|buddha|navratri|dussehra|durga|janmashtami|ramadan|eid|fitr|adha|ashura|mawlid|passover|hanukkah|yom kippur|rosh hashan|nyepi|waisak|thaipusam|palm sunday|maundy|ramazan|bayram|kurban|raya|nuzul|arafah|shab-e|miladun/i;

// [month, day, name]: important days shown for every country
const WORLD_DAYS = [
  [2, 14, "Valentine's Day"], [2, 21, 'International Mother Language Day'], [3, 8, "International Women's Day"],
  [3, 22, 'World Water Day'], [4, 7, 'World Health Day'], [4, 22, 'Earth Day'], [6, 5, 'World Environment Day'],
  [9, 21, 'International Day of Peace'], [10, 24, 'United Nations Day'], [11, 20, "World Children's Day"],
  [12, 10, 'Human Rights Day']
];

let lastCc = null;
let countryCache = null;
let zoneMap = null;
let ipPlace = loadIpPlace();
let ipBusy = false;
let libBusy = null;
const holMemo = {};
const nagerBusy = {};

/* ---- all countries: the list is made by the browser ---- */
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
  const p = readJson(IPKEY);
  return p && typeof p.cc === 'string' ? p : { cc: '', tz: '', ts: 0 };
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
  return (o && o !== 'auto') ? o : autoCountry();
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
      writeJson(IPKEY, ipPlace);
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
  loadHolidays(cc);
  renderUpcoming();
}

/* ---- holidays: library first, Nager.Date as backup ---- */
function loadScript(url) {
  return new Promise(function (res, rej) {
    const s = document.createElement('script');
    s.src = url;
    s.onload = res;
    s.onerror = function () { s.remove(); rej(); };
    document.head.appendChild(s);
  });
}

function loadLib() {
  if (window.Holidays) return Promise.resolve(true);
  if (libBusy) return libBusy;
  libBusy = LIB_URLS.reduce(function (p, u) {
    return p.catch(function () { return loadScript(u); });
  }, Promise.reject())
    .then(function () { return !!window.Holidays; })
    .catch(function () { return false; })
    .then(function (ok) { libBusy = null; return ok; });
  return libBusy;
}

// null = library not loaded yet, [] = no data for this country
function libList(cc, yr) {
  const k = cc + yr;
  if (holMemo[k]) return holMemo[k];
  if (!window.Holidays) return null;
  const out = [];
  try {
    const en = new window.Holidays(cc);
    en.setLanguages('en');
    const names = {};
    en.getHolidays(yr).forEach(function (x) { names[x.date.slice(0, 10) + x.rule] = x.name; });

    new window.Holidays(cc).getHolidays(yr).forEach(function (x) {
      const t = x.type === 'public' ? 'h' : ((x.type === 'bank' || x.type === 'optional' || x.type === 'observance') ? 'i' : '');
      if (!t) return;
      const d = x.date.slice(0, 10);
      const n = names[d + x.rule] || x.name;
      out.push({ d: d, n: n, l: x.name !== n ? x.name : '', c: t });
    });
  } catch (e) {}
  holMemo[k] = out;
  return out;
}

function readNager(cc, yr) {
  const o = readJson(HKEY + cc + '_' + yr);
  return o && Array.isArray(o.list) ? o : null;
}

function fetchNager(cc, yr) {
  const k = cc + yr;
  const c = readNager(cc, yr);
  if (nagerBusy[k] || (c && Date.now() - c.ts < HOL_TTL)) return Promise.resolve();
  nagerBusy[k] = 1;
  return fetchJson(HOL_URL + yr + '/' + cc, { timeout: 10000, retries: 1 })
    .then(function (d) {
      writeJson(HKEY + cc + '_' + yr, {
        ts: Date.now(),
        list: Array.isArray(d) ? d.map(function (x) {
          return {
            d: x.date, n: x.name || '',
            l: x.localName && x.localName !== x.name ? x.localName : '',
            c: (x.types || []).indexOf('Public') > -1 ? 'h' : 'i'
          };
        }) : []
      });
    })
    .catch(function (e) {
      // the country is not covered: remember it for a week; other errors: try again later
      if (e && e.kind === 'http' && e.status < 500) writeJson(HKEY + cc + '_' + yr, { ts: Date.now(), list: [] });
    })
    .then(function () { delete nagerBusy[k]; });
}

function holItems(cc, yr) {
  const l = libList(cc, yr);
  if (l && l.length) return l;
  const c = readNager(cc, yr);
  return c ? c.list : [];
}

function loadHolidays(cc) {
  if (!cc) return;
  const y = new Date().getFullYear();
  loadLib().then(function () {
    const jobs = [];
    [y, y + 1].forEach(function (yr) {
      const l = libList(cc, yr);
      if (!(l && l.length) && navigator.onLine !== false) jobs.push(fetchNager(cc, yr));
    });
    return Promise.all(jobs);
  }).then(function () {
    if (cc === detectCountry()) renderUpcoming();
  });
}

/* ---- your own dates ---- */
function loadCustom() {
  const c = readJson(CUSTOM_KEY);
  return Array.isArray(c) ? c : [];
}
function saveCustom(list) { writeJson(CUSTOM_KEY, list); }

/* ---- build the list ---- */
function getUpcoming(today) {
  const cc = detectCountry();
  const y = today.getFullYear();
  const out = [];
  const seen = {};
  const days = {};

  function add(dt, n, b, t) {
    const diff = Math.round((dt - today) / 86400000);
    const k = dayKey(dt) + n.toLowerCase();
    if (diff < 0 || seen[k]) return;
    seen[k] = 1;
    days[dayKey(dt)] = 1;
    out.push({ h: { n: n, b: b || '', t: t || 'i' }, dt: dt, diff: diff });
  }

  if (cc) {
    for (let yr = y; yr <= y + 1; yr++) {
      holItems(cc, yr).forEach(function (x) {
        const p = String(x.d).split('-');
        if (p.length === 3) add(new Date(+p[0], +p[1] - 1, +p[2]), x.n, x.l, REL_RE.test(x.n) ? 'r' : x.c);
      });
    }
  }

  loadCustom().forEach(function (c) {
    const p = String(c.d).split('-');
    if (p.length !== 3 || !c.n) return;
    if (c.r) {
      for (let yr = y; yr <= y + 1; yr++) add(new Date(yr, +p[1] - 1, +p[2]), c.n, c.b, c.t);
    } else {
      add(new Date(+p[0], +p[1] - 1, +p[2]), c.n, c.b, c.t);
    }
  });

  // world-wide days: only on dates that have nothing else
  for (let yr = y; yr <= y + 1; yr++) {
    WORLD_DAYS.forEach(function (w) {
      const dt = new Date(yr, w[0] - 1, w[1]);
      if (!days[dayKey(dt)]) add(dt, w[2], '', 'i');
    });
  }

  out.sort(function (a, b) { return a.dt - b.dt; });
  return out;
}

function renderUpcoming() {
  const box = $('hList');
  if (!box) return;
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const LABEL = { h: 'Holiday', i: 'Important', r: 'Religious' };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cc = detectCountry();

  const sub = document.querySelector('.hsub');
  if (sub) sub.textContent = cc ? (flagOf(cc) + ' ' + countryName(cc)).trim() : '';

  box.innerHTML = getUpcoming(today).slice(0, 8).map(function (it) {
    const t = LABEL[it.h.t] ? it.h.t : 'i';
    const left = it.diff === 0 ? 'Today' : (it.diff === 1 ? 'Tomorrow' : 'in ' + it.diff + ' days');
    const wd = it.dt.toLocaleDateString('en-GB', { weekday: 'short' });
    return '<div class="hcard t-' + t + '">' +
      '<div class="hd"><span class="hmon">' + MON[it.dt.getMonth()] + '</span>' +
      '<span class="hday">' + it.dt.getDate() + '</span></div>' +
      '<div class="hmid"><div class="hname">' + escapeAttr(it.h.n) + '</div><div class="hbn">' + escapeAttr(it.h.b) + '</div></div>' +
      '<div class="hright"><span class="hleft' + (it.diff <= 7 ? ' soon' : '') + '">' + left + '</span>' +
      '<span class="hwd">' + wd + ' · ' + LABEL[t] + '</span></div>' +
      '</div>';
  }).join('');

  queueFade();
}

function openUpcomingSettings() {
  const sel = globalSet.country || 'auto';
  const opt = function (v, t, s) { return '<option value="' + v + '"' + (s ? ' selected' : '') + '>' + t + '</option>'; };

  let h = head('Upcoming dates', 'upBack');
  h += sec('Country',
    '<div class="li"><span class="k" style="flex:none">Country</span><select class="r" id="upCc">' +
    opt('auto', 'Auto (' + escapeAttr(countryName(autoCountry()) || 'unknown') + ')', sel === 'auto') +
    countryList().map(function (x) { return opt(x.c, escapeAttr(flagOf(x.c) + ' ' + x.n), sel === x.c); }).join('') +
    '</select></div>',
    'Auto follows the phone. Holidays and important days come from a worldwide library that updates itself. ' +
    'Moon-based days (Eid, Ramadan...) are calculated, so the real date can differ by a day.');
  h += sec('Add your own date',
    '<div class="li"><span class="k">Date</span><input type="date" class="inp" id="upDate"></div>' +
    '<div class="li"><span class="k">Name</span><input type="text" class="inp" id="upName" placeholder="Birthday" maxlength="40"></div>' +
    '<div class="li"><span class="k">Type</span>' + seg('upType', [['i', 'Important'], ['h', 'Holiday'], ['r', 'Religious']], 'i') + '</div>' +
    '<div class="li"><span class="k">Repeat</span>' + seg('upRep', [['1', 'Every year'], ['0', 'Once']], '1') + '</div>');
  h += '<div class="acts"><button class="bt pri" id="upAdd">Add date</button></div>';
  h += '<div id="upList"></div>';
  h += '<div class="acts"><button class="bt" id="done">Done</button></div>';
  openSheet(h, 'settings');

  let type = 'i';
  let rep = '1';
  pick('upType', function (v) { type = v; });
  pick('upRep', function (v) { rep = v; });

  function drawCustom() {
    const list = loadCustom();
    const box = $('upList');
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = sec('Your dates', list.map(function (c, i) {
      return '<div class="li"><div class="kk"><div class="k">' + escapeAttr(c.n) + '</div><div class="d">' +
        escapeAttr(c.d + (c.r ? ' · every year' : '')) + '</div></div>' +
        '<button class="mini dng" data-i="' + i + '">Delete</button></div>';
    }).join(''));
    box.querySelectorAll('[data-i]').forEach(function (b) {
      b.onclick = function () {
        const l = loadCustom();
        l.splice(Number(b.dataset.i), 1);
        saveCustom(l);
        drawCustom(); renderUpcoming();
      };
    });
  }
  drawCustom();

  $('upCc').onchange = function (e) {
    globalSet.country = e.target.value;
    saveGlobal();
    lastCc = null;
    syncCountry();
  };

  $('upAdd').onclick = function () {
    const d = $('upDate').value;
    const n = $('upName').value.trim();
    if (!d || !n) { toast('Choose a date and write a name'); return; }
    const l = loadCustom();
    l.push({ d: d, n: n, b: '', t: type, r: rep === '1' ? 1 : 0 });
    saveCustom(l);
    $('upName').value = '';
    drawCustom(); renderUpcoming();
  };

  $('upBack').onclick = openSettings;
  $('done').onclick = closeSheet;
}

/* ---- progressive blur and scroll fade ---- */
function blurLayer(blur, mask) {
  return '<div class="pbl" style="-webkit-backdrop-filter:blur(' + blur + 'px);backdrop-filter:blur(' + blur +
    'px);-webkit-mask-image:' + mask + ';mask-image:' + mask + '"></div>';
}

function buildBlurZones() {
  const hol = $('holidays');
  if (!hol || $('pbTop')) return;

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
  const box = $('hList');
  const hol = $('holidays');
  if (!box || !hol || !box.offsetParent) return;

  const br = box.getBoundingClientRect();
  const head = document.querySelector('.hhead');
  const nav = $('nav');

  const ft = Math.round(head ? Math.max(head.getBoundingClientRect().bottom - br.top - 4, 20) : 34);
  const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight;
  const fb = Math.round(Math.max(br.bottom - navTop + 8, 0));

  if (ft !== lastFt) { lastFt = ft; hol.style.setProperty('--ft', ft + 'px'); }
  if (fb !== lastFb) { lastFb = fb; hol.style.setProperty('--fb', fb + 'px'); }
  cachedFt = ft;
  applyScrollShift();
}

function applyScrollShift() {
  const box = $('hList');
  const hol = $('holidays');
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
  const home = $('v-home');
  const hol = $('holidays');
  if (home && hol) home.appendChild(hol);

  const hh = document.querySelector('.hhead span');
  if (hh) hh.textContent = 'Upcoming';

  buildBlurZones();

  const box = $('hList');
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
      const el = $(id);
      if (el) ro.observe(el);
    });
    const head = document.querySelector('.hhead');
    if (head) ro.observe(head);
  }
}

/* ==========================================================================
   16. PRESS FEEDBACK, BOTTOM BAR, SETTINGS BUTTON, PLUS BUTTON
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
  const nav = $('nav');
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
  const c = $('cog');
  if (c) c.classList.toggle('out', on);
  haptic(on ? 8 : 10);
}

function setPlusOut(on) {
  if (on === plusOut) return;
  plusOut = on;
  const a = $('add');
  if (a) a.classList.toggle('out', on);
  haptic(on ? 8 : 10);
}

function initSettingsButton() {
  const cog = $('cog');
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
  cog.onclick = openSettings;
}

function initAddButton() {
  const add = $('add');
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
   17. CONNECTION, PERMISSIONS & SERVICE WORKER
   ========================================================================== */
function hideToast() {
  const el = $('toast');
  if (el) el.classList.remove('show');
}

function toast(text, opt) {
  opt = opt || {};
  let el = $('toast');
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
  const q = $('wsq');
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

function stateHtml(cls, text) { return '<span class="dot ' + cls + '"></span>' + text; }

function openPermissions() {
  Promise.all([geoPermState(), notifState(), storageState()]).then(function (r) {
    const rows = [
      ['geo', 'Location', 'Shows the time of the place where you are and picks the country for Upcoming dates.', r[0]],
      ['notif', 'Notifications', 'Alerts for alarms and timers while the app is in the background.', r[1]],
      ['store', 'Keep my data', 'Stops the browser from deleting your alarms and settings.', r[2]]
    ];
    const online = navigator.onLine !== false;

    let h = head('Permissions', 'pback');
    h += sec('Connection',
      '<div class="li"><span class="k">Internet</span><span class="v" id="pnet">' +
      stateHtml(online ? 'ok' : 'bad', online ? 'Online' : 'Offline') + '</span>' +
      '<button class="mini" id="ptest">Test</button></div>');
    h += sec('App access', rows.map(function (x) {
      const st = x[3];
      const cls = st === 'granted' ? 'ok' : (st === 'denied' ? 'bad' : '');
      const note = st === 'denied' ? 'Blocked. Allow it in the site settings of your browser, then open this page again.' : x[2];
      return '<div class="li"><div class="kk"><div class="k">' + x[1] + '</div><div class="d">' + note + '</div></div>' +
        ((st === 'prompt' || st === 'unknown')
          ? '<button class="mini" data-p="' + x[0] + '">Allow</button>'
          : '<span class="v">' + stateHtml(cls, permLabel(st)) + '</span>') + '</div>';
    }).join('') +
      '<div class="li"><span class="k">Keep screen awake</span><span class="v">' +
      (('wakeLock' in navigator) ? 'Supported' : 'Not supported') + '</span></div>');
    h += '<div class="acts"><button class="bt pri" id="done">Done</button></div>';
    openSheet(h, 'settings');

    $('ptest').onclick = function () {
      const el = $('pnet');
      el.textContent = 'Checking...';
      fetchJson(GEO_URL + '?name=London&count=1&format=json', { retries: 0, timeout: 6000 })
        .then(function () { el.innerHTML = stateHtml('ok', 'Connected'); })
        .catch(function (e) {
          el.innerHTML = stateHtml('bad', e && e.kind === 'offline' ? 'Offline' : 'No connection');
        });
    };

    sheet.querySelectorAll('[data-p]').forEach(function (b) {
      b.onclick = function () {
        const k = b.dataset.p;
        const job = k === 'geo' ? refreshMyPlace(true) : (k === 'notif' ? requestNotifications() : requestPersistentStorage());
        Promise.resolve(job).then(openPermissions);
      };
    });
    $('pback').onclick = openSettings;
    $('done').onclick = closeSheet;
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
function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  // a new version takes over by itself; reload only when nothing is running
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!ringOn && !tm.running && !sw.running) location.reload();
  });

  navigator.serviceWorker.register('sw.js')
    .then(function (reg) {
      swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) reg.waiting.postMessage('SKIP_WAITING');
      reg.addEventListener('updatefound', function () {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) nw.postMessage('SKIP_WAITING');
        });
      });
      setInterval(function () { reg.update().catch(function () {}); }, 60 * 60 * 1000);
      return navigator.serviceWorker.ready;
    })
    .then(function (reg) { if (reg) swReg = reg; })
    .catch(function () {});
}

/* ==========================================================================
   18. INIT
   ========================================================================== */
function bindEvents() {
  overlay.onclick = closeSheet;

  $('ringStop').onclick = stopRing;
  $('ringSnooze').onclick = function () {
    const f = ringSnoozeFn;
    stopRing();
    if (f) f();
  };

  $('add').onclick = openAddWidget;

  $('aPlus').onclick = function (e) { openAlarmSheet(null, pt(e)); };
  $('aEdit').onclick = function () {
    alarmEditMode = !alarmEditMode;
    this.textContent = alarmEditMode ? 'Done' : 'Edit';
    renderAlarms();
  };

  $('swGo').onclick = function () {
    if (sw.running) { sw.elapsed += Date.now() - sw.start; sw.running = false; }
    else { sw.start = Date.now(); sw.running = true; }
    renderSw();
  };
  $('swLap').onclick = function () {
    if (swMs() <= 0) return;
    sw.laps.push(swMs());
    renderLaps();
    if (globalSet.swTone !== 'off' && !ringOn) playTone(globalSet.swTone, false);
  };
  $('swReset').onclick = function () {
    sw = { running: false, start: 0, elapsed: 0, laps: [] };
    renderSw(); renderLaps();
  };

  $('pAdd').onclick = function (e) { openPresetSheet(pt(e)); };
  $('tmGo').onclick = timerGo;
  $('tmReset').onclick = function () {
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
