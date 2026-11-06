/* ==========================================================================
   CLOCK APP - main.js (clean rewrite)
   1 Config & state         7 Digits & time HTML        13 Stopwatch (lap table)
   2 Helpers & icons        8 Home widgets              14 Timer, presets, typed time
   3 Injected styles        9 Widget designs + tab      15 Upcoming (dynamic data)
   4 Storage                10 Settings & snooze        16 Bottom bar & button effects
   5 Sheet system & UI      11 Edit / Add widget        17 Connection, notifications, SW
   6 Tones & ringing        12 Tabs, alarms, quick      18 Init
   ========================================================================== */

/* ==========================================================================
   1. CONFIG & STATE
   ========================================================================== */
const KEY = 'clockWidgets';
const AKEY = 'clockAlarms';
const QKEY = 'clockQuick';
const TKEY = 'clockTimer';
const GKEY = 'clockGlobal';
const PKEY = 'clockPresets';
const SKEY = 'clockSnooze';
const PLKEY = 'clockPlace';
const PLASKED = 'clockPlaceAsked';
const NOTIF_ASKED = 'clockNotifAsked';
const CUSTOM_KEY = 'customUpcomingEvents';
const HKEY = 'clockHol2_';
const WKEY = 'clockWd_';
const IPKEY = 'clockIpCc';
const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const HOL_URL = 'https://date.nager.at/api/v3/PublicHolidays/';
const WD_URL = 'https://query.wikidata.org/sparql';
const PLACE_FRESH_MS = 20 * 60 * 1000;
const HOL_TTL = 7 * 24 * 3600 * 1000;
const WD_TTL = 30 * 24 * 3600 * 1000;
const PRE_MS = 15 * 60 * 1000;   // "notify before ringing"

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
const TABS = ['home', 'alarm', 'stopwatch', 'timer', 'widgets'];
const ITEM_H = 60;   // timer wheel row height
const AW_H = 46;     // alarm wheel row height
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const RING_MIN = [1, 2, 3, 5, 10, 15, 30];
// haptic groups: ui = touches and wheels, alarm / timer = vibration while ringing
const HAP = { ui: 'hapUi', alarm: 'hapAlarm', timer: 'hapTimer' };

let widgets = loadWidgets();
let alarms = loadAlarms();
let quick = loadQuick();
let presets = loadPresets();
let globalSet = loadGlobal();
let digitMode = globalSet.font === 'retro' ? 'retro' : 'sf';
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
let schedTimer = null;
let installEvt = null;

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

// ringing: ringCtx = what is ringing, ringAction = the second button (Snooze / Restart)
// snz = a snooze waiting to ring again: { at, ctx }
let ringTimer = null;
let ringStopTimer = null;
let rampTimer = null;
let ringOn = false;
let ringCtx = null;
let ringAction = null;
let snz = readJson(SKEY);
let wakeLock = null;
const preSent = {};
const popOut = { cog: false, add: false };

// Capacitor (Android app): native notifications. null in a normal browser.
const CAP = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.Plugins ? Capacitor.Plugins : null;
const LN = CAP ? (CAP.LocalNotifications || null) : null;
const CW = window.Capacitor && Capacitor.registerPlugin && Capacitor.isNativePlatform && Capacitor.isNativePlatform() ? Capacitor.registerPlugin('ClockWidget') : null;   // native home-screen widget plugin

const sheet = document.getElementById('sheet');
const overlay = document.getElementById('overlay');

/* ==========================================================================
   2. HELPERS & ICONS
   ========================================================================== */
function $(id) { return document.getElementById(id); }
function pad(n) { return String(n).padStart(2, '0'); }
function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// vibration, gated by the three haptic switches in Settings (kind: 'ui' | 'alarm' | 'timer')
function haptic(p, kind) {
  try {
    if (globalSet && globalSet[HAP[kind || 'ui']] === false) return;
    if (navigator.vibrate) navigator.vibrate(p);
  } catch (e) {}
}
function clampN(v, a, b) { v = Math.round(Number(v)); return isNaN(v) ? a : Math.max(a, Math.min(b, v)); }
// nearest ancestor of the event target that matches a selector (or null)
function hit(e, sel) { return e && e.target && e.target.closest ? e.target.closest(sel) : null; }
// Bangla digits are accepted in typed fields
function bnDigits(s) { return String(s).replace(/[\u09E6-\u09EF]/g, function (d) { return '\u09E6\u09E7\u09E8\u09E9\u09EA\u09EB\u09EC\u09ED\u09EE\u09EF'.indexOf(d); }); }
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
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  widgets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></svg>'
};

// replaces the icon but keeps the light-effect layers (.fx) alive while they animate
function swapIcon(el, svg) {
  Array.from(el.childNodes).forEach(function (n) {
    if (n.nodeType === 3 || (n.nodeType === 1 && !n.classList.contains('fx'))) n.remove();
  });
  el.insertAdjacentHTML('afterbegin', svg);
}

function setIcon(id, svg, label) {
  const el = $(id);
  if (!el) return;
  swapIcon(el, svg);
  if (label) el.setAttribute('aria-label', label);
}

/* ==========================================================================
   3. INJECTED STYLES
   One design system: calm neutral surfaces, one orange accent.
   ========================================================================== */
// type of an upcoming day: name, colour. "Holidays" filter = every public holiday (any type)
const UP_TYPES = {
  h: ['Holiday', '#ff6a5c'],
  n: ['National', '#4a8cf7'],
  c: ['Cultural', '#bf5af2'],
  r: ['Religious', '#30d158']
};
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Permanent+Marker&family=Playfair+Display:wght@800;900&display=swap';

function injectStyles() {
  if (navigator.onLine !== false && !document.querySelector('link[data-clock-font]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.setAttribute('data-clock-font', '1');
    l.href = FONT_URL;
    document.head.appendChild(l);
  }

  const typeCss = Object.keys(UP_TYPES).map(function (k) {
    return '.t-' + k + '{--tc:' + UP_TYPES[k][1] + '}';
  }).join('');

  const css = `
@font-face{font-family:"ClockNum";src:url("digits.ttf") format("truetype");font-weight:100 900;font-style:normal;font-display:swap;unicode-range:U+0030-0039}
:root{--sf:"ClockNum","Poppins",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--accent:#ff9f0a;--danger:#ff453a;--ok:#30d158;--info:#0a84ff;--ink:255,255,255;--surf:rgba(255,255,255,.06);--surf2:rgba(255,255,255,.11);--line:rgba(255,255,255,.10);--pop:rgba(28,30,36,.80)}
body.light{--ink:0,0,0;--surf:rgba(0,0,0,.04);--surf2:rgba(0,0,0,.07);--line:rgba(0,0,0,.09);--pop:rgba(255,255,255,.84)}
html,body,button,input,select,textarea,svg text,.time .txt,.hcard,.preset,.btn{font-family:var(--sf)!important}
*{font-weight:800!important}
body{letter-spacing:-.01em;-webkit-font-smoothing:antialiased}
.atitle,.title,.hname{letter-spacing:-.03em}
body .time .txt{font-size:min(calc(var(--size)*1),20vw);letter-spacing:0;line-height:1}
#stage{padding:64px 12px 12px!important;margin:0 auto!important}

/* ---- bottom tab bar: floating glass pill ---- */
#nav{position:fixed!important;left:12px!important;right:12px!important;bottom:calc(10px + env(safe-area-inset-bottom,0px))!important;width:auto!important;max-width:520px;margin:0 auto!important;transform:none!important;display:flex!important;align-items:stretch;gap:2px;padding:5px!important;border-radius:26px!important;background:var(--pop)!important;-webkit-backdrop-filter:blur(24px) saturate(1.6);backdrop-filter:blur(24px) saturate(1.6);border:1px solid var(--line)!important;box-shadow:0 12px 34px rgba(0,0,0,.34)!important}
#nav button{flex:1;min-width:0;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 2px!important;border:0!important;border-radius:20px!important;background:transparent!important;color:inherit!important;opacity:.55;-webkit-tap-highlight-color:transparent;transition:background-color .22s ease,opacity .22s ease,color .22s ease,transform .1s ease!important}
#nav button svg{width:22px;height:22px;flex:none}
#nav button span,#nav button label{font-size:11px;line-height:1.1;letter-spacing:0}
#nav button.active{opacity:1;color:var(--accent)!important;background:rgba(255,159,10,.16)!important}
#nav button:active{transform:scale(.94)}
#nav button::after{display:none!important}

/* ---- Upcoming ---- */
#holidays{position:relative!important;flex:1 1 auto!important;display:flex!important;flex-direction:column;min-height:320px;padding:0!important;animation:none!important}
.hhead{position:static!important;display:flex!important;justify-content:space-between;align-items:baseline;gap:10px;padding:14px 20px 8px!important;white-space:nowrap;pointer-events:auto;font-size:20px;letter-spacing:-.02em}
.hhead::before{display:none!important}
.hsub{font-size:13px;letter-spacing:0;opacity:.65;overflow:hidden;text-overflow:ellipsis}
.hfilter{flex:none;display:flex;gap:8px;padding:2px 16px 12px;overflow-x:auto;scrollbar-width:none}
.hfilter::-webkit-scrollbar,#hList::-webkit-scrollbar,#sheet.open::-webkit-scrollbar,#sheet .tonebox::-webkit-scrollbar,#sheet .awc::-webkit-scrollbar{display:none}
.hchip{flex:none;padding:7px 15px;border-radius:999px;font-size:13px;color:inherit;background:var(--surf);border:1px solid var(--line);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .18s ease,color .18s ease,border-color .18s ease,transform .12s ease}
.hchip:active{transform:scale(.95)}
.hchip.on{background:var(--accent);border-color:var(--accent);color:#1a1100}
#hList{flex:1 1 0!important;display:flex!important;flex-direction:column!important;gap:9px!important;min-height:220px;max-height:none!important;overflow-y:auto!important;overflow-x:hidden!important;padding:6px 16px calc(var(--ov,0px) + 28px)!important;scroll-snap-type:none!important;overscroll-behavior:contain;touch-action:pan-y;scrollbar-width:none}
@keyframes swL{from{opacity:0;transform:translateX(34px)}to{opacity:1;transform:none}}
@keyframes swR{from{opacity:0;transform:translateX(-34px)}to{opacity:1;transform:none}}
#hList.swL{animation:swL .26s cubic-bezier(.22,.8,.25,1) both}
#hList.swR{animation:swR .26s cubic-bezier(.22,.8,.25,1) both}
.hgrp{flex:none;padding:14px 4px 2px;font-size:13px;opacity:.55}
.hgrp:first-child{padding-top:2px}
.hcard{width:auto!important;flex:none!important;display:flex!important;align-items:center;gap:12px;padding:10px 14px 10px 10px!important;border-radius:18px!important;background:var(--surf)!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;border:1px solid var(--line);box-shadow:none!important;transition:transform .14s ease,border-color .2s ease}
.hcard:active{transform:scale(.985)}
.hcard.today{border-color:rgba(var(--ink),.34);background:var(--surf2)!important}
${typeCss}
.hd{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;width:54px;height:58px;border-radius:15px;background:var(--surf2)!important;border:1px solid var(--line)!important}
.hd .hmon{font-size:10.5px;letter-spacing:.08em;opacity:.55;color:inherit!important}
.hd .hday{font-size:26px;line-height:1.05}
.hmid{flex:1 1 0;min-width:0}
.hmid .hname{margin:0;font-size:15px;line-height:1.3;white-space:normal;overflow:visible;overflow-wrap:anywhere}
.hbn{margin-top:2px;font-size:12px;line-height:1.3;opacity:.55;white-space:normal;overflow-wrap:anywhere}
.hbn:empty{display:none}
.hright{flex:none;max-width:104px;display:flex;flex-direction:column;align-items:flex-end;gap:3px;text-align:right}
.hright .hleft{margin:0;padding:0!important;border:0!important;background:none!important;font-size:13px;white-space:nowrap;color:inherit!important;opacity:.55}
.hright .hleft.soon{opacity:1}
.hwd{margin:0;display:flex;align-items:center;justify-content:flex-end;gap:5px;font-size:11.5px;line-height:1.25;opacity:.7}
.hwd::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--tc,#8e8e93)}
.hempty{padding:36px 24px;text-align:center;font-size:14px;line-height:1.5;opacity:.55}
.hmore{flex:none;align-self:center;margin-top:6px;padding:10px 22px;border-radius:999px;font-size:14px;color:inherit;background:var(--surf2);border:1px solid var(--line);cursor:pointer;-webkit-tap-highlight-color:transparent}
.hmore:active{transform:scale(.96)}

/* ---- Alarms: quick alarm cards ---- */
#alarmList:empty{display:none}
#quickBox{padding:6px 0 150px}
.qhead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:14px 20px 12px;font-size:20px;letter-spacing:-.02em}
.qcust{padding:4px 0;border:0;background:none;color:var(--accent);font-size:14px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.qlist{display:flex;flex-direction:column;gap:9px;padding:0 16px}
.qcard{cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.qcard:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.hd.qd{width:72px}
.qd .hday{font-size:20px;letter-spacing:-.02em;white-space:nowrap}

/* ---- on/off switches (alarm list + settings rows) ---- */
.tgl,#sheet .sx{position:relative;flex:none;width:52px;height:32px;border-radius:16px;background:var(--surf2);transition:background .22s ease}
.tgl{padding:0!important;border:0!important;border-radius:16px!important;background:var(--surf2)!important;cursor:pointer;-webkit-tap-highlight-color:transparent}
.tgl span{position:absolute!important;top:2px!important;left:2px!important;width:28px!important;height:28px!important;border-radius:50%!important;background:#fff!important;box-shadow:0 2px 5px rgba(0,0,0,.32)!important;transform:none;transition:transform .24s cubic-bezier(.3,1.4,.5,1)}
.tgl.on{background:var(--accent)!important}
.tgl.on span{transform:translateX(20px)!important}
#sheet .sx::after{content:"";position:absolute;top:2px;left:2px;width:28px;height:28px;border-radius:50%;background:#fff;box-shadow:0 2px 5px rgba(0,0,0,.32);transition:transform .24s cubic-bezier(.3,1.4,.5,1)}
#sheet .sx.on{background:var(--accent)}
#sheet .sx.on::after{transform:translateX(20px)}

/* ---- Alarms: wheel time picker ---- */
#sheet .aw{position:relative;display:flex;align-items:stretch;justify-content:center;gap:2px;height:${AW_H * 5}px;padding:0 8px;border-radius:16px;overflow:hidden;background:var(--surf);border:1px solid var(--line)}
#sheet .awband{position:absolute;left:8px;right:8px;top:${AW_H * 2}px;height:${AW_H}px;border-radius:12px;background:var(--surf2);pointer-events:none}
#sheet .awc{position:relative;z-index:1;flex:1;min-width:0;height:100%;box-sizing:border-box;padding:${AW_H * 2}px 0;overflow-y:auto;overscroll-behavior:contain;scroll-snap-type:y mandatory;scroll-padding-top:${AW_H * 2}px;scrollbar-width:none;touch-action:pan-y;-webkit-mask-image:linear-gradient(transparent,#000 32%,#000 68%,transparent);mask-image:linear-gradient(transparent,#000 32%,#000 68%,transparent)}
#sheet .awi{height:${AW_H}px;display:flex;align-items:center;justify-content:center;font-size:27px;letter-spacing:-.02em;scroll-snap-align:start;opacity:.32;cursor:pointer;transition:opacity .12s ease}
#sheet .awi.sel{opacity:1}
#sheet .awc#awP .awi{font-size:21px}
#sheet .awsep{position:relative;z-index:1;flex:none;align-self:center;font-size:27px;line-height:1;padding-bottom:3px;opacity:.7}
#sheet .days{display:flex;gap:5px;padding:10px}
#sheet .dchip{flex:1;min-width:0;padding:10px 0;border-radius:11px;font-size:12px;text-align:center;background:var(--surf2);opacity:.7;transition:background .18s ease,opacity .18s ease,transform .12s ease}
#sheet .dchip:active{transform:scale(.94)}
#sheet .dchip.on{background:var(--accent);color:#fff;opacity:1}

/* ---- sheets: one pop-in card ---- */
#overlay.open{background:rgba(0,0,0,.28)!important;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
body.light #overlay.open{background:rgba(255,255,255,.25)!important}
#sheet{background:var(--pop)!important;-webkit-backdrop-filter:blur(28px) saturate(1.5);backdrop-filter:blur(28px) saturate(1.5);border:1px solid var(--line);box-shadow:0 24px 60px rgba(0,0,0,.45);color-scheme:dark}
body.light #sheet{color-scheme:light;box-shadow:0 24px 60px rgba(0,0,0,.16)}
@keyframes popIn{from{opacity:0;transform:scale(.88) translateY(-8px)}to{opacity:1;transform:none}}
@keyframes popOut{from{opacity:1;transform:none}to{opacity:0;transform:scale(.9) translateY(-6px)}}
#sheet:not(.open){pointer-events:none}
#sheet.open{left:auto!important;right:12px!important;bottom:auto!important;top:calc(64px + env(safe-area-inset-top,0px))!important;width:min(92vw,360px)!important;max-height:calc(100vh - 150px);max-height:calc(100dvh - 150px);overflow-y:auto;border-radius:26px!important;padding:18px 16px 16px!important;animation:popIn .26s cubic-bezier(.22,.8,.25,1) both;scrollbar-width:none}
#sheet.open.closing{animation:popOut .16s ease both;pointer-events:none}

#sheet button{background:none;border:0;color:inherit;font:inherit;padding:0;margin:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
#sheet button:focus-visible,.hchip:focus-visible,.hmore:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#sheet .shead{display:flex;align-items:center;gap:10px;min-height:34px;margin:0 0 14px}
#sheet .stitle{flex:1;font-size:22px;letter-spacing:-.03em}
#sheet .back{width:34px;height:34px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0 0 3px!important;font-size:24px;line-height:1;background:var(--surf2)}
#sheet .sl{font-size:13px;opacity:.55;margin:18px 8px 7px}
#sheet .shead+.sl{margin-top:2px}
#sheet .grp{margin-top:14px;border-radius:16px;overflow:hidden;background:var(--surf);border:1px solid var(--line)}
#sheet .sl+.grp,#sheet .shead+.grp,#sheet .pcard+.grp{margin-top:0}
#sheet .li{display:flex;align-items:center;gap:12px;width:100%;min-height:50px;padding:10px 14px;box-sizing:border-box;text-align:left;font-size:15px}
#sheet .li+.li,#sheet .li+.days{border-top:1px solid var(--line)}
#sheet button.li{transition:background .12s ease}
#sheet button.li:active{background:var(--surf2)}
#sheet .k{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#sheet .kk{flex:1;min-width:0}
#sheet .kk .k{white-space:normal}
#sheet .d{font-size:12px;line-height:1.35;margin-top:2px;opacity:.6;white-space:normal}
#sheet .v{display:flex;align-items:center;gap:6px;min-width:0;max-width:52%;font-size:14px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#sheet .nav::after{content:"\\203A";flex:none;font-size:22px;line-height:1;opacity:.4;margin-left:-4px}
#sheet .sn{margin:8px 8px 0;font-size:12px;line-height:1.4;opacity:.6}
#sheet .sn.mid{text-align:center;margin:14px 0 4px}
#sheet .chk{flex:none;opacity:0;color:var(--accent);font-size:17px}
#sheet .li.sel .chk{opacity:1}
#sheet .dot{display:inline-block;flex:none;width:8px;height:8px;border-radius:50%;background:#8e8e93}
#sheet .dot.ok{background:var(--ok)}
#sheet .dot.bad{background:var(--danger)}

#sheet input[type=text],#sheet input[type=date],#sheet input[type=number],#sheet select{box-sizing:border-box;min-width:0;padding:0;border:0;outline:0;background:transparent;color:inherit;font-size:15px;-webkit-appearance:none;appearance:none}
#sheet input[type=number]{-moz-appearance:textfield}
#sheet input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
#sheet .inp{flex:1;text-align:right}
#sheet select.r{flex:1;max-width:64%;margin-left:auto;text-align:right;text-align-last:right;opacity:.85}
#sheet select option{color:#111;background:#fff}
#sheet input::placeholder{color:inherit;opacity:.4}

/* ---- segmented toggle: a sliding pill follows the chosen option ---- */
.seg{position:relative;display:flex;gap:2px;padding:3px;border-radius:12px;background:var(--surf2);min-width:150px;--n:2;--i:0}
.seg::before{content:"";position:absolute;top:3px;bottom:3px;left:3px;width:calc((100% - 6px - (var(--n) - 1) * 2px) / var(--n));border-radius:9px;background:rgba(255,255,255,.2);box-shadow:0 1px 4px rgba(0,0,0,.28);transform:translateX(calc(var(--i) * (100% + 2px)));transition:transform .3s cubic-bezier(.3,1.25,.5,1)}
body.light .seg::before{background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.18)}
.seg button{position:relative;z-index:1;flex:1;padding:7px 10px;border:0;border-radius:9px;font-size:13px;font-family:inherit;color:inherit;background:none;opacity:.6;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:opacity .2s ease}
.seg button.on{opacity:1}

#sheet .sws{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:9px}
#sheet .sw{width:27px;height:27px;border-radius:50%;border:2px solid var(--line);transition:transform .15s ease}
#sheet .sw:active{transform:scale(.88)}
#sheet .sw.on{outline:2px solid var(--accent);outline-offset:2px}

#sheet input[type=range]{-webkit-appearance:none;appearance:none;flex:1;height:4px;margin:0;border-radius:2px;background:var(--surf2);outline:0}
#sheet input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.4)}
#sheet input[type=range]::-moz-range-thumb{width:24px;height:24px;border:0;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.4)}

#sheet .pcard{padding:14px 16px;border-radius:16px;background:var(--surf2);border:1px solid var(--line)}
#sheet .pcn{font-size:21px;letter-spacing:-.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#sheet .pcs{margin-top:3px;font-size:12.5px;opacity:.7}

#sheet .acts{display:flex;gap:10px;margin-top:16px}
#sheet .acts+.acts{margin-top:10px}
#sheet .bt{flex:1;padding:13px 10px;border-radius:13px;font-size:15px;text-align:center;background:var(--surf2);transition:transform .12s ease,background .2s ease}
#sheet .bt:active{transform:scale(.97)}
#sheet .bt.pri{color:#fff;background:var(--accent);box-shadow:0 6px 18px rgba(255,140,20,.32)}
#sheet .bt.dng{color:var(--danger)}
#sheet .mini{flex:none;padding:6px 13px;border-radius:999px;font-size:13px;white-space:nowrap;color:var(--accent);background:rgba(255,159,10,.16)}
#sheet .mini.dng{color:var(--danger);background:rgba(255,69,58,.14)}

#sheet .trip{display:flex;gap:8px;padding:12px}
#sheet .trip>div{flex:1;text-align:center}
#sheet .trip select{width:100%;padding:8px 0;border-radius:10px;font-size:24px;text-align:center;text-align-last:center;background:var(--surf2)}
#sheet .trip i{display:block;margin-top:5px;font-style:normal;font-size:12px;opacity:.55}
#sheet .tonebox{max-height:52vh;overflow-y:auto;margin:0 -6px;padding:0 6px;scrollbar-width:none}

/* ---- timer: typed time ---- */
.tmtype{display:flex;gap:8px;justify-content:center;align-items:center;margin:14px auto 0;width:min(88vw,380px)}
.tmtype input{flex:1;min-width:0;padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:var(--surf);color:inherit;font-size:15px;outline:0;text-align:center}
.tmtype input::placeholder{color:inherit;opacity:.4}
.tmtype button{padding:12px 18px;border:0;border-radius:14px;background:var(--surf2);color:inherit;font-size:15px;cursor:pointer}

/* ---- top-right and add buttons ---- */
#cog{width:46px;height:46px;padding:0!important;opacity:1!important;display:flex!important;align-items:center;justify-content:center;font-size:0}
.dots{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;pointer-events:none;transition:transform .38s cubic-bezier(.3,1.5,.5,1)}
.dots i{display:block;width:4px;height:4px;border-radius:50%;background:currentColor;transition:transform .16s cubic-bezier(.3,1.8,.5,1)}
#cog.press .dots i{transform:scale(.68)}
#cog.out .dots{transform:rotate(90deg)}
.plusi{display:flex;align-items:center;justify-content:center;width:100%;height:100%;pointer-events:none;transition:transform .38s cubic-bezier(.3,1.5,.5,1)}
#add.out .plusi{transform:rotate(135deg)}

/* ---- toast ---- */
#toast{position:fixed;left:50%;bottom:calc(92px + env(safe-area-inset-bottom,0px));transform:translate(-50%,12px);z-index:70;display:flex;align-items:center;gap:12px;max-width:min(92vw,420px);padding:11px 16px;border-radius:999px;background:var(--pop);color:inherit;-webkit-backdrop-filter:blur(20px) saturate(1.5);backdrop-filter:blur(20px) saturate(1.5);border:1px solid var(--line);box-shadow:0 10px 30px rgba(0,0,0,.3);font-size:14px;line-height:1.3;opacity:0;pointer-events:none;transition:opacity .25s ease,transform .25s ease}
#toast.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}
#toast .tact{background:none;border:0;color:var(--accent);padding:0;font-size:14px;white-space:nowrap}

/* ---- widgets & stopwatch dial ---- */
.wdate{margin-top:6px;opacity:.8}
.woff{margin-top:2px!important;opacity:.6}
.clsvg{width:calc(var(--size)*3.5);height:calc(var(--size)*3.5);filter:drop-shadow(0 6px 14px rgba(0,0,0,.3))}
#swHand line{stroke:var(--accent)!important}
#swHand circle:first-of-type{fill:var(--accent)!important}
.dialtime .cs,.dialtime .time.cs,#swCs{color:var(--accent)!important}
.dialwrap{isolation:isolate}
.dialwrap::before{content:"";position:absolute;inset:.8%;border-radius:50%;z-index:-1;background:rgba(255,255,255,.05);-webkit-backdrop-filter:blur(20px) saturate(1.6) brightness(.6);backdrop-filter:blur(20px) saturate(1.6) brightness(.6);box-shadow:0 20px 40px rgba(0,0,0,.4)}

/* ---- stopwatch: lap table ----
   Lap = left edge, Lap time = exact centre, Total = right edge.
   Three-column grid: 1fr | auto | 1fr keeps the middle column in the exact
   centre; centerLaps() in JS only nudges the box if its parent is off-centre. */
#laps{display:block!important;position:relative!important;box-sizing:border-box!important;float:none!important;left:auto!important;right:auto!important;align-self:center!important;justify-self:center!important;width:min(92vw,520px)!important;min-width:0!important;max-width:none!important;margin:18px auto 0!important;padding:0 0 160px!important;max-height:none!important;overflow:visible!important}
.lhead,.lrow{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;column-gap:8px;box-sizing:border-box;width:100%;margin:0;padding-left:6px;padding-right:6px;white-space:nowrap;font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
.lhead>span,.lrow>span{min-width:0}
.lhead>span:nth-child(1),.lrow>span:nth-child(1){text-align:left}
.lhead>span:nth-child(2),.lrow>span:nth-child(2){text-align:center}
.lhead>span:nth-child(3),.lrow>span:nth-child(3){text-align:right}
.lhead{padding-top:12px;padding-bottom:14px;font-size:14px;letter-spacing:.02em;opacity:.55;border-bottom:1px solid var(--line)}
.lrow{padding-top:17px;padding-bottom:17px;font-size:clamp(15px,4.5vw,19px);letter-spacing:-.01em}
.lrow+.lrow{border-top:1px solid var(--line)}
.lrow.fast>span:nth-child(-n+2){color:#ff6b61}
.lrow.slow>span:nth-child(-n+2){color:#5b8ff0}

#ringStop.holding{transform:scale(.94);opacity:.8}

/* ---- Widgets tab: every design is a pure function of the time ---- */
.wgpage{padding:72px 14px 150px}
.wgh{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 6px 16px;font-size:22px;letter-spacing:-.03em}
.wgg{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.wgt{position:relative;container-type:size;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;border-radius:26px;background:#1c1d24;color:#fff;overflow:hidden;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .14s ease}
.wgt:active{transform:scale(.97)}
.wgt.w2{grid-column:span 2;aspect-ratio:2/1}
.wgt svg{display:block;overflow:visible}
.wcol{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%}
.wrow{display:flex;align-items:center;justify-content:center}
.wcg{display:grid;grid-template-columns:repeat(7,1fr);font-size:5.6cqmin;text-align:center;row-gap:1.4cqmin}
.wcg i{font-style:normal;opacity:.55;padding-bottom:1cqmin}
.wcg span{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center}
.widget .wgt{width:min(86vw,340px)}
.widget .wgt.w2{width:min(94vw,520px)}
#sheet .wgt{width:100%;cursor:default}
#wgFull{position:fixed;inset:0;z-index:90;display:none;align-items:center;justify-content:center;background:#000}
#wgFull.open{display:flex}
#wgFull .wgt{width:min(96vw,96vh);cursor:default}
#wgFull .wgt.w2{width:96vw}

/* ---- round buttons: every button has a colour (--gc) that drives its glow ---- */
.round,.fab{position:relative;display:flex;align-items:center;justify-content:center;overflow:visible!important;--gc:255,159,10;transition:transform .18s cubic-bezier(.3,1.6,.5,1),box-shadow .3s ease!important}
.round:active,.fab:active{transform:scale(.92)!important}
.round:not(.main){background:var(--surf2)!important;border:1px solid var(--line)!important;box-shadow:none!important;-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
body.light .round:not(.main){color:#1c1c1e}
.round.main,.fab{background:var(--accent)!important;border:0!important;color:#fff;box-shadow:0 8px 22px rgba(255,140,20,.38)!important}

/* start = green, pause = orange (while running), lap = blue, reset = red */
#swGo,#tmGo{--gc:48,209,88;background:rgba(var(--gc),.16)!important;border:1px solid rgba(var(--gc),.50)!important;color:rgb(var(--gc))!important;box-shadow:0 0 16px rgba(var(--gc),.18),inset 0 0 14px rgba(var(--gc),.10)!important}
#swGo.live,#tmGo.live{--gc:255,159,10;animation:breathe 2.6s ease-in-out infinite}
#swLap{--gc:10,132,255}
#swReset,#tmReset{--gc:255,69,58}
#swLap,#swReset,#tmReset{border-color:rgba(var(--gc),.38)!important;color:rgb(var(--gc))!important;background:rgba(var(--gc),.10)!important}
#aPlus,#pAdd{--gc:255,159,10}

@keyframes breathe{
  0%,100%{box-shadow:0 0 12px rgba(var(--gc),.22),inset 0 0 12px rgba(var(--gc),.10)}
  50%{box-shadow:0 0 0 5px rgba(var(--gc),.07),0 0 30px rgba(var(--gc),.50),inset 0 0 16px rgba(var(--gc),.18)}
}
/* press effect: a glowing ring leaves the button and a soft flash fills it */
.fx{position:absolute;inset:0;border-radius:inherit;pointer-events:none}
.fx.burst{border:2px solid rgba(var(--gc),.95);box-shadow:0 0 22px 4px rgba(var(--gc),.65),inset 0 0 14px rgba(var(--gc),.45);animation:burst .7s cubic-bezier(.15,.7,.3,1) forwards}
.fx.flash{background:radial-gradient(circle,rgba(var(--gc),.60) 0,rgba(var(--gc),0) 72%);animation:flash .55s ease-out forwards}
@keyframes burst{from{opacity:.95;transform:scale(1)}to{opacity:0;transform:scale(1.75)}}
@keyframes flash{from{opacity:1;transform:scale(.7)}to{opacity:0;transform:scale(1.25)}}
@media (prefers-reduced-motion:reduce){#sheet.open,#sheet.open.closing,#hList.swL,#hList.swR{animation:none}#swGo.live,#tmGo.live{animation:none}.fx{display:none}.seg::before,.tgl span{transition:none}}

.phead button{color:var(--accent)!important}
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

// alarm: { id, time 'HH:MM', on, days [0-6, Sun-Sat] (empty = once), label, last, sn, sc }
// sn = snooze minutes (0 = no snooze), sc = max snoozes (0 = unlimited).
// A missing sn / sc means "use the default from Settings".
function loadAlarms() {
  const a = readJson(AKEY);
  if (!Array.isArray(a)) return [];
  a.forEach(function (x) {
    if (!Array.isArray(x.days)) x.days = x.daily === false ? [] : ALL_DAYS.slice();
    delete x.daily;
  });
  return a;
}
function saveAlarms() { writeJson(AKEY, alarms); schedSoon(); }
// save + redraw everything that shows alarms
function refreshAlarms() { saveAlarms(); renderAlarms(); renderQuick(); }

function defaultQuick() {
  return [
    { id: 'q1', name: 'Wake up', time: '06:00', days: ALL_DAYS.slice() },
    { id: 'q2', name: 'Work', time: '08:00', days: [0, 1, 2, 3, 4] }
  ];
}
function loadQuick() {
  const q = readJson(QKEY);
  return Array.isArray(q) ? q : defaultQuick();
}
function saveQuick() { writeJson(QKEY, quick); }

function loadGlobal() {
  const g = {
    bg: '#000000', bgLight: '#f2f2f7', theme: 'dark', awake: false, font: 'sf', country: 'auto',
    alarmTone: 't31', timerTone: 't43', swTone: 'off', customName: '', upFilter: 'all', alarmFmt: '12',
    snoozeMin: 5, snoozeMax: 3, wgFmt: '24',
    ringMin: 5, stopWith: 'button', preNotify: true, gradual: true,
    hapUi: true, hapAlarm: true, hapTimer: true
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

function saveTm() { writeJson(TKEY, tm); schedSoon(); }

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
   Every sheet is the same pop-in card. Helpers: head() sec() seg() swatches() pick()
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

// wires the back arrow (if any) and the Done / Close button of a sheet
function finishSheet(backId, backFn) {
  if (backId && $(backId)) $(backId).onclick = backFn;
  if ($('done')) $('done').onclick = closeSheet;
}

// segmented toggle: --n = number of options, --i = chosen index (drives the sliding pill)
function seg(id, opts, cur) {
  let idx = 0;
  opts.forEach(function (o, i) { if (String(o[0]) === String(cur)) idx = i; });
  return '<div class="seg" id="' + id + '" style="--n:' + opts.length + ';--i:' + idx + '">' + opts.map(function (o, i) {
    return '<button data-v="' + o[0] + '"' + (i === idx ? ' class="on"' : '') + '>' + o[1] + '</button>';
  }).join('') + '</div>';
}

function swatches(id, list, cur) {
  return '<div class="sws" id="' + id + '">' + list.map(function (b) {
    const on = String(b[0]).toLowerCase() === String(cur).toLowerCase();
    return '<button class="sw' + (on ? ' on' : '') + '" data-v="' + b[0] + '" title="' + b[1] +
      '" aria-label="' + b[1] + '" style="background:' + b[0] + '"></button>';
  }).join('') + '</div>';
}

// on/off row; desc (optional) is the small grey text under the label
function toggleRow(id, label, on, desc) {
  return '<button class="li" id="' + id + '"><div class="kk"><div class="k">' + label + '</div>' +
    (desc ? '<div class="d">' + desc + '</div>' : '') + '</div><span class="sx' + (on ? ' on' : '') + '"></span></button>';
}

function navRow(attrs, label, value) {
  return '<button class="li nav" ' + attrs + '><span class="k">' + label + '</span>' +
    (value ? '<span class="v">' + value + '</span>' : '') + '</button>';
}

// a row of preset chips (same look as the weekday chips)
function chipRow(id, list, cur) {
  return '<div class="days" id="' + id + '">' + list.map(function (c) {
    return '<button class="dchip' + (String(c[0]) === String(cur) ? ' on' : '') + '" data-v="' + c[0] + '">' + c[1] + '</button>';
  }).join('') + '</div>';
}

// segmented toggle or swatch row: marks the tapped button, moves the pill and reports its value
function pick(id, fn) {
  const box = $(id);
  if (!box) return;
  box.onclick = function (e) {
    const b = hit(e, '[data-v]');
    if (!b) return;
    const all = Array.prototype.slice.call(box.querySelectorAll('[data-v]'));
    all.forEach(function (x) { x.classList.toggle('on', x === b); });
    if (box.classList.contains('seg')) box.style.setProperty('--i', all.indexOf(b));
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

/* ---- snooze fields (used by Settings and by the alarm editor) ---- */
const SN_MIN = [[0, 'Off'], [1, '1'], [5, '5'], [10, '10'], [15, '15'], [30, '30']];
const SN_CNT = [[1, '1'], [2, '2'], [3, '3'], [5, '5'], [0, '&infin;']];

function snoozeHtml(sn, sc) {
  return sec('Snooze',
    '<div class="li"><span class="k">Length (minutes)</span><input type="number" id="snMin" class="inp" min="0" max="120" inputmode="numeric" value="' + sn + '"></div>' +
    chipRow('snMinC', SN_MIN, sn) +
    '<div class="li"><span class="k">Max snoozes</span><input type="number" id="snCnt" class="inp" min="0" max="99" inputmode="numeric" value="' + sc + '"></div>' +
    chipRow('snCntC', SN_CNT, sc),
    'Type any number. 0 minutes = no snooze. 0 snoozes = unlimited.');
}

function readSnooze() {
  return { sn: clampN($('snMin').value, 0, 120), sc: clampN($('snCnt').value, 0, 99) };
}

function bindSnooze(fn) {
  [['snMin', 'snMinC'], ['snCnt', 'snCntC']].forEach(function (p) {
    function mark() {
      const v = String(clampN($(p[0]).value, 0, 999));
      $(p[1]).querySelectorAll('[data-v]').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
    }
    $(p[1]).onclick = function (e) {
      const b = hit(e, '[data-v]');
      if (!b) return;
      $(p[0]).value = b.dataset.v;
      mark();
      haptic(6);
      if (fn) fn(readSnooze());
    };
    $(p[0]).oninput = function () { mark(); if (fn) fn(readSnooze()); };
  });
}

/* ==========================================================================
   6. TONES & RINGING
   --------------------------------------------------------------------------
   50 built-in tones are drawn by the browser into a small WAV file and played
   with a normal <audio> element. That lets a ringing alarm take the audio
   focus, show on the lock screen (Media Session) and keep going with the
   screen off. One custom tone from your own file.
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

const SILENCE = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAA=';
const toneUrls = {};
let toneEl = null;
let toneSeq = 0;

function toneById(id) {
  for (let i = 0; i < TONES.length; i++) if (TONES[i].id === id) return TONES[i];
  return TONES[0];
}

function toneName(id) {
  if (id === 'off') return 'Off';
  if (id === 'custom') return globalSet.customName || 'Custom tone';
  return toneById(id).name;
}

// the first tap on the page "unlocks" audio so later alarms are allowed to play
function unlockAudio() {
  try { const a = new Audio(SILENCE); a.volume = 0.01; a.play().catch(function () {}); } catch (e) {}
}

// one note, drawn into any (offline) audio context
function voice(ctx, out, t0, midi, d, tone) {
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const peak = tone.g0 || 0.3;
  const g = ctx.createGain();
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

  const o = ctx.createOscillator();
  o.type = tone.w || 'sine';
  o.frequency.value = f;
  o.connect(g);
  o.start(t0);
  o.stop(t0 + d + 0.3);

  if (tone.ov) {
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = 'sine';
    o2.frequency.value = f * tone.ov[0];
    g2.gain.value = tone.ov[1];
    o2.connect(g2);
    g2.connect(g);
    o2.start(t0);
    o2.stop(t0 + d + 0.3);
  }
}

function wavUrl(buf) {
  const d = buf.getChannelData(0);
  const n = d.length;
  const v = new DataView(new ArrayBuffer(44 + n * 2));
  function w(o, s) { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, d[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return URL.createObjectURL(new Blob([v], { type: 'audio/wav' }));
}

// one cycle of a tone (with a short pause at the end so a loop sounds natural)
function toneUrl(id) {
  if (toneUrls[id]) return Promise.resolve(toneUrls[id]);
  if (id === 'custom') {
    return idbGet('custom').then(function (data) {
      return data ? (toneUrls.custom = URL.createObjectURL(new Blob([data]))) : null;
    });
  }
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Off) return Promise.resolve(null);
  const t = toneById(id);
  let end = 0;
  t.n.forEach(function (x) { end = Math.max(end, x[1] + x[2]); });
  const rate = 32000;
  const ctx = new Off(1, Math.ceil((end + 1.1) * rate), rate);
  t.n.forEach(function (x) { voice(ctx, ctx.destination, 0.02 + x[1], x[0], x[2], t); });
  return ctx.startRendering().then(function (buf) { return (toneUrls[id] = wavUrl(buf)); });
}

function stopTone() {
  toneSeq++;
  if (toneEl) { try { toneEl.pause(); } catch (e) {} toneEl = null; }
}

// resolves true when the sound really started; quiet = start at low volume (gradual alarm)
function playTone(id, loop, quiet) {
  stopTone();
  const my = toneSeq;
  return toneUrl(id).then(function (url) {
    if (my !== toneSeq) return false;
    if (!url) return id === 'custom' ? playTone(TONES[0].id, loop, quiet) : false;
    const a = new Audio(url);
    a.loop = !!loop;
    if (quiet) a.volume = 0.1;
    toneEl = a;
    return a.play().then(function () { return true; });
  }).catch(function () { return false; });
}

function stopPreview() { if (!ringOn) stopTone(); }

// gradual alarm volume: 10% -> 100% over 30 seconds
function rampVolume() {
  clearInterval(rampTimer);
  const t0 = Date.now();
  rampTimer = setInterval(function () {
    if (!toneEl || !ringOn) { clearInterval(rampTimer); return; }
    const f = Math.min(1, (Date.now() - t0) / 30000);
    try { toneEl.volume = 0.1 + 0.9 * f; } catch (e) {}
    if (f >= 1) clearInterval(rampTimer);
  }, 500);
}

/* ---- ringing: alarm, snooze, timer ----
   ctx = { kind 'alarm'|'timer', id, title, tone, sn, sc, used }              */
function alarmCtx(a, used) {
  return {
    kind: 'alarm', id: a.id, used: used || 0,
    title: (a.label || 'Alarm') + ' ' + fmtClock(a.time, alarmFmt()),
    tone: globalSet.alarmTone,
    sn: a.sn == null ? globalSet.snoozeMin : a.sn,
    sc: a.sc == null ? globalSet.snoozeMax : a.sc
  };
}

function ringActionFor(c) {
  if (c.kind === 'timer') return { label: 'Restart', fn: restartTimer };
  if (c.sn > 0 && (!c.sc || c.used < c.sc)) {
    return { label: 'Snooze ' + c.sn + ' min' + (c.sc ? ' \u00b7 ' + (c.sc - c.used) + ' left' : ''), fn: snoozeNow };
  }
  return null;
}

function holdStop(c) { return !!c && c.kind === 'alarm' && globalSet.stopWith === 'hold'; }

function setSnooze(s) {
  snz = s;
  writeJson(SKEY, s);
  schedSoon();
}

function snoozeNow() {
  const c = ringCtx;
  if (!c) return;
  const next = Object.assign({}, c, { used: c.used + 1 });
  stopRing();
  setSnooze({ at: Date.now() + c.sn * 60000, ctx: next });
  toast('Snoozed for ' + c.sn + ' min');
}

function restartTimer() {
  stopRing();
  tm.remaining = tm.total;
  tm.endAt = Date.now() + tm.total;
  tm.running = tm.total > 0;
  saveTm(); renderTm();
}

// lock-screen media controls while ringing
function setMedia(on, title) {
  if (!('mediaSession' in navigator)) return;
  try {
    const ms = navigator.mediaSession;
    if (on) {
      ms.metadata = new MediaMetadata({ title: title, artist: 'Clock' });
      ms.setActionHandler('pause', function () { stopRing(); });
      ms.setActionHandler('stop', function () { stopRing(); });
      ms.setActionHandler('nexttrack', ringAction ? function () { ringAction.fn(); } : null);
    } else {
      ms.metadata = null;
      ['pause', 'stop', 'nexttrack'].forEach(function (a) { ms.setActionHandler(a, null); });
    }
  } catch (e) {}
}

function startRing(c) {
  stopRing();
  ringCtx = c;
  ringOn = true;
  ringAction = ringActionFor(c);
  const title = c.used ? c.title + ' \u00b7 snoozed' : c.title;

  $('ringTitle').textContent = title;
  $('ringStop').textContent = holdStop(c) ? 'Hold to stop' : 'Stop';
  const b = $('ringSnooze');
  b.style.display = ringAction ? 'inline-block' : 'none';
  if (ringAction) b.textContent = ringAction.label;
  $('ring').classList.add('open');

  const acts = [{ action: 'stop', title: 'Stop' }];
  if (ringAction) acts.unshift({ action: c.kind === 'timer' ? 'again' : 'snooze', title: c.kind === 'timer' ? 'Restart' : 'Snooze' });
  if (document.hidden || !document.hasFocus()) {
    notify(title, 'Tap to open the clock', 'clock-ring', { silent: true, actions: acts, data: { kind: c.kind, id: c.id || '' } });
  }

  const gradual = c.kind === 'alarm' && !!globalSet.gradual;
  playTone(c.tone || TONES[0].id, true, gradual).then(function (ok) {
    if (ok && gradual && ringOn) rampVolume();
  });
  haptic(300, c.kind);
  ringTimer = setInterval(function () { haptic(300, c.kind); }, 900);
  // ring duration: an alarm stops by itself after the chosen time
  if (c.kind === 'alarm' && globalSet.ringMin > 0) {
    ringStopTimer = setTimeout(function () {
      if (ringOn) { stopRing(); toast('Alarm stopped automatically'); }
    }, globalSet.ringMin * 60000);
  }
  setAwake(true);
  setMedia(true, title);
  if (LN && !document.hidden) setTimeout(function () { LN.removeAllDeliveredNotifications().catch(function () {}); }, 1500);
}

function stopRing() {
  ringOn = false;
  ringCtx = null;
  ringAction = null;
  closeNotifs();
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
  clearTimeout(ringStopTimer);
  clearInterval(rampTimer);
  stopTone();
  setMedia(false);
  $('ring').classList.remove('open');
  if (!globalSet.awake) setAwake(false);
}

function alarmOff(id) {
  const a = alarms.find(function (x) { return x.id === id; });
  if (!a) return;
  a.on = false;
  refreshAlarms();
  toast('Alarm turned off');
}

// buttons on the notification (lock screen / notification centre) come here
function handleRingAction(action, kind, id) {
  if (kind === 'pre') {                      // the "rings in 15 minutes" notification
    if (action === 'alarmoff') alarmOff(id);
    return;
  }
  if (ringOn && ringCtx) {
    if (action === 'stop') stopRing();
    else if (action && ringAction) ringAction.fn();
    return;
  }
  const a = kind === 'alarm' ? alarms.find(function (x) { return x.id === id; }) : null;
  // the alarm already rang (from the notification): do not ring it again when the app opens
  function done() {
    a.last = dayKey(new Date()) + a.time;
    if (!a.days.length) a.on = false;
    refreshAlarms();
  }
  if (action === 'stop') {
    if (a) { done(); if (snz && snz.ctx.id === id) setSnooze(null); }
    else if (kind === 'timer') { tm.running = false; tm.remaining = tm.total; saveTm(); renderTm(); }
  } else if (action === 'snooze' && a) {
    const c = alarmCtx(a, 1);
    done();
    if (c.sn > 0) setSnooze({ at: Date.now() + c.sn * 60000, ctx: c });
  } else if (action === 'again' && kind === 'timer' && tm.total > 0) {
    restartTimer();
  }
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
      return row(t.id, esc(t.name));
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
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    f.arrayBuffer().then(function (buf) {
      return new Off(1, 1, 44100).decodeAudioData(buf.slice(0)).then(function () { return idbSet('custom', buf); });
    }).then(function () {
      delete toneUrls.custom;
      globalSet.customName = f.name.length > 30 ? f.name.slice(0, 27) + '...' : f.name;
      choose('custom');
    }).catch(function () { toast('This file cannot be played'); });
  };

  $('tnDel').onclick = function () {
    idbDel('custom').catch(function () {});
    delete toneUrls.custom;
    globalSet.customName = '';
    if (globalSet.alarmTone === 'custom') globalSet.alarmTone = 't31';
    if (globalSet.timerTone === 'custom') globalSet.timerTone = 't43';
    if (globalSet.swTone === 'custom') globalSet.swTone = 'off';
    saveGlobal();
    stopPreview();
    draw();
  };

  finishSheet('tnBack', openSettings);
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
  if (isDesign(type)) return base;
  return Object.assign(base, { size: 12, hour12: false, retro: false, zone: '', city: '' });
}

function isDesign(type) { return String(type).indexOf('wg:') === 0; }

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
      t += ' \u00b7 ' + (diff === 0 ? 'same time as you' : hm(diff) + (diff > 0 ? ' ahead of you' : ' behind you'));
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
  if (isDesign(w.type)) inner = wgtHtml(w.type.slice(3));
  else if (w.type === 'digital') inner = '<div class="time"></div>';
  else if (isZoneWidget(w)) inner = '<div class="wlabel">' + esc(placeLabel(w)) +
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
  if (isDesign(w.type)) return;   // designs are painted by paintAll()
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
  paintAll(now);
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
   9. WIDGET DESIGNS + WIDGETS TAB
   --------------------------------------------------------------------------
   Every design is a function of the time that returns HTML. The tile is a CSS
   container, so sizes are written in cqmin (1 = 1% of the tile's short side)
   and every design scales with the tile. One painter updates all copies once
   per second.
   ========================================================================== */
// the designs (WG, WGM) live in js/designs.js

function wgtHtml(id) {
  const d = WGM[id];
  return '<div class="wgt' + (d && d.w2 ? ' w2' : '') + '" data-wg="' + id + '"></div>';
}

// repaints every visible design tile only when its HTML really changed
function paintAll(now) {
  now = now || new Date();
  document.querySelectorAll('.wgt[data-wg]').forEach(function (el) {
    const d = WGM[el.dataset.wg];
    if (!d || !el.offsetParent) return;
    const s = d.h(now);
    if (el._s !== s) { el._s = s; el.innerHTML = s; }
  });
}

function initWidgetsTab() {
  const t = $('v-timer');
  if (!t || $('v-widgets')) return;

  const v = document.createElement('div');
  v.id = 'v-widgets';
  v.className = t.className.replace(/\bactive\b/g, '').trim();
  t.parentNode.appendChild(v);

  // bottom-bar button: a copy of the Timer button with its own icon and label
  const tb = document.querySelector('#nav [data-tab="timer"]');
  if (tb) {
    const b = tb.cloneNode(true);
    b.removeAttribute('id');
    b.classList.remove('active');
    b.dataset.tab = 'widgets';
    b.setAttribute('aria-label', 'Widgets');
    const s = b.querySelector('svg');
    if (s) s.outerHTML = ICON.widgets; else b.innerHTML = ICON.widgets;
    b.querySelectorAll('*').forEach(function (el) {
      if (!el.children.length && el.textContent.trim()) el.textContent = 'Widgets';
    });
    tb.parentNode.appendChild(b);
  }

  v.innerHTML = '<div class="wgpage"><div class="wgh"><span>Widgets</span>' +
    seg('wgFmt', [['24', '24h'], ['12', '12h']], globalSet.wgFmt) + '</div>' +
    '<div class="wgg">' + WG.map(function (d) { return wgtHtml(d.id); }).join('') + '</div></div>';

  pick('wgFmt', function (x) { globalSet.wgFmt = x; saveGlobal(); paintAll(); syncWidgetData(); });
  v.addEventListener('click', function (e) {
    const el = hit(e, '.wgt[data-wg]');
    if (el) openWidgetSheet(el.dataset.wg, pt(e));
  });
}

function openWidgetSheet(id, origin) {
  const d = WGM[id];
  if (!d) return;
  const h = head(d.n) + '<div>' + wgtHtml(id) + '</div>' +
    '<div class="acts"><button class="bt pri" id="wgAdd">Add to Home tab</button></div>' +
    (CW
      ? sec('', toggleRow('wgTr', 'Transparent background', false, 'No card behind the widget, so your wallpaper shows through.')) +
        '<div class="acts"><button class="bt pri" id="wgPhone">Add to phone home screen</button></div>'
      : '<div class="acts"><button class="bt" id="wgPhone">Phone home screen</button></div>') +
    '<div class="acts"><button class="bt" id="wgFs">Full screen</button><button class="bt" id="done">Close</button></div>';
  openSheet(h, 'widget', origin);
  paintAll();

  let tr = false;
  $('wgAdd').onclick = function () {
    widgets.push(newWidget('wg:' + id));
    saveWidgets(); renderAll(); closeSheet();
    toast(d.n + ' added to Home');
  };
  $('wgFs').onclick = function () { closeSheet(); openFull(id); };
  if (CW) {
    bindToggle('wgTr', false, function (on) {
      tr = on;
      const t = sheet.querySelector('.wgt');
      if (t) t.style.background = on ? 'transparent' : '';
    });
    $('wgPhone').onclick = function () { pinWidget(id, tr); };
  } else {
    $('wgPhone').onclick = function () { openPhoneSheet(id); };
  }
  finishSheet();
}

function openFull(id) {
  let f = $('wgFull');
  if (!f) {
    f = document.createElement('div');
    f.id = 'wgFull';
    f.onclick = function () {
      f.classList.remove('open');
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    };
    document.body.appendChild(f);
  }
  f.innerHTML = wgtHtml(id);
  f.classList.add('open');
  paintAll();
  if (f.requestFullscreen) f.requestFullscreen().catch(function () {});
}

/* ---- real launcher widgets (Android APK only) ---- */
const WIDGET_HELP = 'Long-press the home screen, tap Widgets, choose Clock (within 10 min). It uses the design you picked.';
let lastWgSync = '';

// sends the 24h/12h choice and the next dates to the native widgets (only when they changed)
function syncWidgetData() {
  if (!CW) return;
  const n = new Date();
  const ev = getUpcoming(new Date(n.getFullYear(), n.getMonth(), n.getDate())).slice(0, 40)
    .map(function (x) { return { d: dayKey(x.dt), n: x.n }; });
  const data = { fmt: globalSet.wgFmt, events: JSON.stringify(ev) };
  const sig = JSON.stringify(data);
  if (sig === lastWgSync) return;
  lastWgSync = sig;
  CW.sync(data).catch(function () {});
}

function pinWidget(id, transparent) {
  syncWidgetData();
  CW.pin({ type: id, transparent: !!transparent, wide: !!WGM[id].w2, fmt: globalSet.wgFmt }).then(function (r) {
    toast(r && r.requested ? 'Confirm on the screen to place the widget' : WIDGET_HELP, { ms: 6000 });
  }).catch(function () { toast(WIDGET_HELP, { ms: 6000 }); });
}

function openPhoneSheet(id) {
  const standalone = window.matchMedia && matchMedia('(display-mode: standalone)').matches;
  const h = head('Phone home screen', 'phBack') +
    '<div class="sn mid" style="line-height:1.55;text-align:left">A web app cannot put a live widget on the launcher by itself. ' +
    'Install the Android APK to get real home screen widgets. Meanwhile, install this page to the home screen and use ' +
    '<b>Full screen</b> on any design to turn the phone into a desk clock.</div>' +
    (installEvt && !standalone ? '<div class="acts"><button class="bt pri" id="phInstall">Install app</button></div>' : '') +
    '<div class="acts"><button class="bt" id="done">Close</button></div>';
  openSheet(h, 'widget');

  const i = $('phInstall');
  if (i) i.onclick = function () {
    installEvt.prompt();
    installEvt.userChoice.then(function () { installEvt = null; closeSheet(); });
  };
  finishSheet('phBack', function () { openWidgetSheet(id); });
}

/* ==========================================================================
   10. SETTINGS
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

function snoozeSummary() {
  return globalSet.snoozeMin > 0
    ? globalSet.snoozeMin + ' min \u00b7 ' + (globalSet.snoozeMax ? globalSet.snoozeMax + '\u00d7' : '\u221e')
    : 'Off';
}

function stopWithLabel() { return globalSet.stopWith === 'hold' ? 'Hold button' : 'Button'; }

function openSettings() {
  const light = globalSet.theme === 'light';
  const list = light ? BGS_LIGHT : BGS_DARK;
  const curBg = light ? globalSet.bgLight : globalSet.bg;

  let h = head('Settings');
  h += sec('Appearance',
    '<div class="li"><span class="k">Theme</span>' + seg('themeSeg', [['dark', 'Dark'], ['light', 'Light']], globalSet.theme) + '</div>' +
    '<div class="li"><span class="k">Background</span>' + swatches('bgSw', list, curBg) + '</div>' +
    '<div class="li"><span class="k">Numbers</span>' + seg('fontSeg', [['sf', 'Bold'], ['retro', 'Retro']], digitMode) + '</div>');

  h += sec('Alarms',
    '<div class="li"><span class="k">Ring duration</span><select class="r" id="ringDur">' +
    RING_MIN.map(function (m) {
      return '<option value="' + m + '"' + (m === globalSet.ringMin ? ' selected' : '') + '>' + m + (m === 1 ? ' minute' : ' minutes') + '</option>';
    }).join('') + '</select></div>' +
    navRow('id="stbtn"', 'Stop alarm with', stopWithLabel()) +
    navRow('data-tone="alarm"', 'Default alarm sound', esc(toneName(globalSet.alarmTone))) +
    navRow('id="snbtn"', 'Snooze', snoozeSummary()) +
    '<div class="li"><span class="k">Alarm time</span>' + alarmFmtSeg('alFmt') + '</div>' +
    toggleRow('preN', 'Notify before ringing', globalSet.preNotify,
      'Get a notification 15 minutes before an alarm goes off so you have a chance to turn it off before it rings.') +
    toggleRow('grad', 'Gradual alarm volume', globalSet.gradual,
      'The alarm rings at a lower volume and slowly increases until it reaches full volume.'));

  h += sec('Other sounds', ['timer', 'sw'].map(function (k) {
    return navRow('data-tone="' + k + '"', TONE_KINDS[k].label, esc(toneName(globalSet[TONE_KINDS[k].key])));
  }).join(''));

  h += sec('Haptics',
    toggleRow('hapUi', 'Touch & UI', globalSet.hapUi !== false, 'Vibrate on taps, wheels and buttons.') +
    toggleRow('hapAlarm', 'Alarm', globalSet.hapAlarm !== false, 'Vibrate while an alarm is ringing.') +
    toggleRow('hapTimer', 'Timer', globalSet.hapTimer !== false, 'Vibrate when a timer finishes.'));

  h += sec('General',
    toggleRow('awake', 'Keep screen awake', globalSet.awake) +
    navRow('id="upbtn"', 'Upcoming dates', esc(countryName(detectCountry()) || 'Auto')) +
    (CW ? navRow('id="whbtn"', 'Home screen widgets', '') : '') +
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

  pick('alFmt', setAlarmFmt);

  $('ringDur').onchange = function (e) {
    globalSet.ringMin = clampN(e.target.value, 1, 60);
    saveGlobal();
  };
  $('stbtn').onclick = openStopSettings;

  bindToggle('preN', globalSet.preNotify, function (on) {
    globalSet.preNotify = on;
    saveGlobal();
    if (on) maybeAskNotifications();
    schedSoon();
  });
  bindToggle('grad', globalSet.gradual, function (on) { globalSet.gradual = on; saveGlobal(); });

  [['hapUi', 'ui'], ['hapAlarm', 'alarm'], ['hapTimer', 'timer']].forEach(function (p) {
    bindToggle(p[0], globalSet[p[0]] !== false, function (on) {
      globalSet[p[0]] = on;
      saveGlobal();
      if (on) haptic(40, p[1]);   // a short buzz to show it works
    });
  });

  bindToggle('awake', globalSet.awake, function (on) {
    globalSet.awake = on;
    saveGlobal(); setAwake(on);
  });

  sheet.querySelectorAll('[data-tone]').forEach(function (b) {
    b.onclick = function () { openToneSheet(b.dataset.tone); };
  });
  $('snbtn').onclick = openSnoozeSettings;
  $('upbtn').onclick = openUpcomingSettings;
  $('permbtn').onclick = openPermissions;
  if ($('whbtn')) $('whbtn').onclick = function () { showTab('widgets'); };
  $('fs').onclick = function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  };
  finishSheet();
}

function openStopSettings() {
  const opts = [
    ['button', 'Button', 'Tap Stop on the ringing screen.'],
    ['hold', 'Hold button', 'Hold Stop for 1.5 seconds, so it cannot be stopped by accident.']
  ];
  const h = head('Stop alarm with', 'spBack') + sec('', opts.map(function (o) {
    return '<button class="li' + (globalSet.stopWith === o[0] ? ' sel' : '') + '" data-v="' + o[0] + '"><div class="kk"><div class="k">' + o[1] +
      '</div><div class="d">' + o[2] + '</div></div><span class="chk">&#10003;</span></button>';
  }).join('')) + '<div class="acts"><button class="bt pri" id="done">Done</button></div>';
  openSheet(h, 'settings');

  sheet.querySelectorAll('.li[data-v]').forEach(function (b) {
    b.onclick = function () {
      globalSet.stopWith = b.dataset.v;
      saveGlobal();
      sheet.querySelectorAll('.li[data-v]').forEach(function (x) { x.classList.toggle('sel', x === b); });
      haptic(8);
    };
  });
  finishSheet('spBack', openSettings);
}

function openSnoozeSettings() {
  const h = head('Snooze', 'snBack') + snoozeHtml(globalSet.snoozeMin, globalSet.snoozeMax) +
    '<div class="sn mid">These are the defaults for new alarms. Every alarm can have its own values.</div>' +
    '<div class="acts"><button class="bt pri" id="done">Done</button></div>';
  openSheet(h, 'settings');
  bindSnooze(function (v) {
    globalSet.snoozeMin = v.sn;
    globalSet.snoozeMax = v.sc;
    saveGlobal();
  });
  finishSheet('snBack', openSettings);
}

/* ==========================================================================
   11. EDIT / ADD WIDGET SHEETS
   ========================================================================== */
// big card: place name, time zone, GMT offset
function fillPlace(w) {
  const n = $('wsName');
  const s = $('wsSub');
  if (!n || !s) return;
  const zone = zoneOf(w);
  n.textContent = placeLabel(w) || 'Choose a place';
  s.textContent = [zone, offsetText(w, zone, new Date()), w.type === 'home' ? GEO_NOTES[geoStatus] : '']
    .filter(Boolean).join(' \u00b7 ');
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
          b.innerHTML = '<span class="k">' + esc(p.name) + '</span>' + (sub ? '<span class="v">' + esc(sub) + '</span>' : '');
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
  const design = isDesign(w.type) ? WGM[w.type.slice(3)] : null;
  const zone = isZoneWidget(w);

  let h = head(design ? design.n : TYPES[w.type].n);
  if (zone) h += placeHtml(w);

  if (!design) {
    h += sec('Appearance',
      '<div class="li"><span class="k">Color</span>' + swatches('clr', COLORS.map(function (c) { return [c, c]; }), w.color) + '</div>' +
      '<div class="li"><span class="k">Size</span><input type="range" id="sz" min="6" max="26" step="1" value="' + w.size + '"></div>');
  }

  if (w.type === 'digital' || zone) {
    h += sec('Time',
      '<div class="li"><span class="k">Format</span>' + seg('fmtSeg', [['24', '24-hour'], ['12', '12-hour']], w.hour12 ? '12' : '24') + '</div>' +
      toggleRow('rt', 'Retro colors', w.retro));
  }

  h += '<div class="acts"><button class="bt" id="up">&#8593; Move up</button><button class="bt" id="down">&#8595; Move down</button></div>';
  h += '<div class="acts"><button class="bt dng" id="del">Delete</button><button class="bt pri" id="done">Done</button></div>';
  openSheet(h, 'edit', origin);
  editW = w;

  if (!design) {
    pick('clr', function (v) { w.color = v; saveWidgets(); applyStyle(w); });
    $('sz').oninput = function (e) { w.size = Number(e.target.value); saveWidgets(); applyStyle(w); };
  }

  if (zone) initWorldEdit(w);

  if ($('fmtSeg')) pick('fmtSeg', function (v) { w.hour12 = v === '12'; saveWidgets(); renderAll(); });
  if ($('rt')) bindToggle('rt', !!w.retro, function (on) { w.retro = on; saveWidgets(); renderAll(); });

  function move(step) {
    const i = widgets.indexOf(w);
    const j = i + step;
    if (j < 0 || j >= widgets.length) return;
    widgets.splice(i, 1);
    widgets.splice(j, 0, w);
    saveWidgets(); renderAll();
  }
  $('up').onclick = function () { move(-1); };
  $('down').onclick = function () { move(1); };
  $('del').onclick = function () {
    widgets = widgets.filter(function (x) { return x !== w; });
    saveWidgets(); closeSheet(); renderAll();
  };
  finishSheet();
}

function openAddWidget() {
  let h = head('Add widget');
  h += sec('', Object.keys(TYPES).map(function (t) {
    return '<button class="li nav" data-t="' + t + '"><div class="kk"><div class="k">' + TYPES[t].n +
      '</div><div class="d">' + TYPES[t].d + '</div></div></button>';
  }).join('') +
    '<button class="li nav" id="moreWg"><div class="kk"><div class="k">More designs</div><div class="d">' + WG.length + ' styles in the Widgets tab</div></div></button>');
  h += '<div class="acts"><button class="bt dng" id="reset">Reset all</button><button class="bt pri" id="done">Close</button></div>';
  openSheet(h, 'add');

  sheet.querySelectorAll('[data-t]').forEach(function (b) {
    b.onclick = function () {
      widgets.push(newWidget(b.dataset.t));
      saveWidgets(); closeSheet(); renderAll();
      window.scrollTo(0, document.body.scrollHeight);
    };
  });
  $('moreWg').onclick = function () { showTab('widgets'); };
  $('reset').onclick = function () {
    if (confirm('Reset all widgets to default?')) {
      widgets = defaultWidgets();
      saveWidgets(); closeSheet(); renderAll();
    }
  };
  finishSheet();
}

/* ==========================================================================
   12. TABS, ALARMS & QUICK ALARMS
   --------------------------------------------------------------------------
   The time is picked with scroll wheels (12 or 24 hour) or typed (7:30 pm,
   19:45, 730). Every alarm has its own snooze length and snooze limit.
   Quick alarms are saved shortcuts: one tap adds them to the alarm list.
   ========================================================================== */
function showTab(name) {
  TABS.forEach(function (t) {
    const v = $('v-' + t);
    const b = document.querySelector('#nav [data-tab="' + t + '"]');
    if (v) v.classList.toggle('active', t === name);
    if (b) b.classList.toggle('active', t === name);
  });
  $('add').style.display = name === 'home' ? 'block' : 'none';
  window.scrollTo(0, 0);
  closeSheet();
  if (name === 'timer') setTimeout(syncWheels, 50);
  if (name === 'stopwatch') setTimeout(centerLaps, 0);
  if (name === 'home') {
    renderUpcoming();
    setTimeout(measureUpcoming, 60);
  }
  tick();
}

function alarmFmt() { return globalSet.alarmFmt === '24' ? '24' : '12'; }

function alarmFmtSeg(id) {
  return seg(id, [['12', '12-hour'], ['24', '24-hour']], alarmFmt());
}

// one place to change the format: the alarm list and quick cards redraw
function setAlarmFmt(v) {
  globalSet.alarmFmt = v === '24' ? '24' : '12';
  saveGlobal();
  renderAlarms();
  renderQuick();
}

function parseTime(t) {
  const p = String(t).split(':');
  return { h: Number(p[0]) || 0, m: Number(p[1]) || 0 };
}

function fmtClock(t, fmt) {
  const x = parseTime(t);
  if (fmt === '24') return pad(x.h) + ':' + pad(x.m);
  return ((x.h % 12) || 12) + ':' + pad(x.m) + ' ' + (x.h >= 12 ? 'PM' : 'AM');
}

// typed alarm time: "7:30 pm", "19:45", "730", "7 am", Bangla digits too
function parseTyped(s) {
  s = bnDigits(s).trim().toLowerCase().replace(/\./g, '');
  const m = /^(\d{1,2})(?:[:\s]?(\d{2}))?\s*(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  if (mi > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].charAt(0) === 'p' ? 12 : 0);
  } else if (h > 23) return null;
  return { h: h, m: mi };
}

function daysKey(days) { return days.slice().sort(function (a, b) { return a - b; }).join(','); }

function repeatText(days) {
  const d = days.slice().sort(function (a, b) { return a - b; });
  const k = d.join(',');
  if (!d.length) return 'Once';
  if (d.length === 7) return 'Every day';
  if (k === '1,2,3,4,5') return 'Weekdays';
  if (k === '0,6') return 'Weekends';
  const run = d.length >= 3 && d.every(function (x, i) { return i === 0 || x === d[i - 1] + 1; });
  if (run) return DAYS[d[0]] + ' \u2013 ' + DAYS[d[d.length - 1]];
  return d.map(function (x) { return DAYS[x]; }).join(', ');
}

// if the chosen time is only seconds/minutes in the past, do not ring right away
function lateGuard(t) {
  const now = new Date();
  const x = parseTime(t);
  const late = now.getHours() * 60 + now.getMinutes() - (x.h * 60 + x.m);
  return (late >= 0 && late <= 2) ? dayKey(now) + t : '';
}

function sortAlarms() {
  alarms.sort(function (x, y) { return x.time < y.time ? -1 : 1; });
}

function renderAlarms() {
  const box = $('alarmList');
  if (!box) return;
  box.innerHTML = '';
  const fmt = alarmFmt();

  alarms.forEach(function (a) {
    const x = parseTime(a.time);
    const timeStr = fmt === '24'
      ? timeHtml(pad(x.h) + ':' + pad(x.m), false)
      : timeHtml(((x.h % 12) || 12) + ':' + pad(x.m), false) + '<span class="ampm">' + (x.h >= 12 ? 'PM' : 'AM') + '</span>';

    const row = document.createElement('div');
    row.className = 'arow2' + (a.on ? '' : ' off');
    row.innerHTML =
      '<div class="ainfo">' +
        '<div class="time atime" style="--size:13vw">' + timeStr + '</div>' +
        '<div class="alabel">' + esc(a.label || 'Alarm') + ', ' + repeatText(a.days) + '</div>' +
      '</div>' +
      '<button class="tgl' + (a.on ? ' on' : '') + '" aria-label="On or off"><span></span></button>';

    row.querySelector('.tgl').onclick = function () {
      a.on = !a.on;
      if (a.on) { a.last = lateGuard(a.time); arm(a); }
      refreshAlarms();
    };
    row.querySelector('.ainfo').onclick = function (e) { openAlarmSheet(a, pt(e)); };
    box.appendChild(row);
  });
}

/* ---- wheel time picker ---- */
// index of the row that sits in the middle of a scroll wheel
function wpos(el, rowH) {
  return Math.max(0, Math.min(el.children.length - 1, Math.round(el.scrollTop / rowH)));
}

function wheelCol(id, items, idx) {
  return '<div class="awc" id="' + id + '">' + items.map(function (t, i) {
    return '<div class="awi' + (i === idx ? ' sel' : '') + '" data-i="' + i + '">' + t + '</div>';
  }).join('') + '</div>';
}

function wheelsHtml(fmt, h, m) {
  const hours = [];
  const mins = [];
  let i;
  if (fmt === '24') for (i = 0; i < 24; i++) hours.push(pad(i));
  else for (i = 1; i <= 12; i++) hours.push(String(i));
  for (i = 0; i < 60; i++) mins.push(pad(i));

  const hi = fmt === '24' ? h : ((h % 12) || 12) - 1;
  return '<div class="aw"><div class="awband"></div>' +
    wheelCol('awH', hours, hi) + '<div class="awsep">:</div>' + wheelCol('awM', mins, m) +
    (fmt === '24' ? '' : wheelCol('awP', ['AM', 'PM'], h >= 12 ? 1 : 0)) +
    '</div>';
}

function initWheels() {
  sheet.querySelectorAll('.awc').forEach(function (el) {
    const cur = el.querySelector('.sel');
    let last = cur ? Number(cur.dataset.i) : 0;
    el.scrollTop = last * AW_H;

    el.addEventListener('scroll', function () {
      const i = wpos(el, AW_H);
      if (i === last) return;
      last = i;
      Array.prototype.forEach.call(el.children, function (c, n) { c.classList.toggle('sel', n === i); });
      haptic(6);
    }, { passive: true });

    el.onclick = function (e) {
      const it = hit(e, '.awi');
      if (it) el.scrollTo({ top: Number(it.dataset.i) * AW_H, behavior: 'smooth' });
    };
  });
}

function readWheelTime(fmt) {
  const hi = wpos($('awH'), AW_H);
  const m = wpos($('awM'), AW_H);
  if (fmt === '24') return { h: hi, m: m };
  return { h: ((hi + 1) % 12) + (wpos($('awP'), AW_H) === 1 ? 12 : 0), m: m };
}

/* ---- one editor for alarms and quick alarms ----
   cfg: title, time, label, days, sn, sc, ph (label placeholder), isNew, origin,
        onSave({time,label,days,sn,sc}), onDelete(), onCancel()                */
function openAlarmEditor(cfg) {
  let fmt = alarmFmt();
  const days = cfg.days.slice();
  const t = parseTime(cfg.time);

  const h = head(cfg.title) +
    '<div id="awBox">' + wheelsHtml(fmt, t.h, t.m) + '</div>' +
    sec('Details',
      '<div class="li"><span class="k">Label</span><input type="text" id="asLabel" class="inp" placeholder="' + cfg.ph +
      '" maxlength="30" value="' + esc(cfg.label) + '"></div>' +
      '<div class="li"><span class="k">Type time</span><input type="text" id="asType" class="inp" placeholder="7:30 pm or 19:45" maxlength="10" autocomplete="off"></div>' +
      '<div class="li"><span class="k">Time format</span>' + alarmFmtSeg('asFmt') + '</div>') +
    sec('Repeat', '<div class="days" id="asDays">' + DAYS.map(function (n, i) {
      return '<button class="dchip' + (days.indexOf(i) > -1 ? ' on' : '') + '" data-d="' + i + '">' + n + '</button>';
    }).join('') + '</div>') +
    '<div class="sn mid" id="asRep"></div>' +
    snoozeHtml(cfg.sn, cfg.sc) +
    '<div class="acts"><button class="bt" id="asCancel">Cancel</button>' +
    (cfg.isNew ? '' : '<button class="bt dng" id="asDel">Delete</button>') +
    '<button class="bt pri" id="asSave">Save</button></div>';
  openSheet(h, 'alarm', cfg.origin);
  initWheels();
  bindSnooze();

  function drawRep() { $('asRep').textContent = repeatText(days); }
  drawRep();

  $('asDays').onclick = function (e) {
    const b = hit(e, '[data-d]');
    if (!b) return;
    const d = Number(b.dataset.d);
    const i = days.indexOf(d);
    if (i > -1) days.splice(i, 1); else days.push(d);
    b.classList.toggle('on', i < 0);
    drawRep();
    haptic(6);
  };

  // a typed time moves the wheels
  function applyTyped() {
    const v = $('asType').value.trim();
    if (!v) return true;
    const p = parseTyped(v);
    if (!p) { toast('Try 7:30 pm or 19:45'); return false; }
    $('awBox').innerHTML = wheelsHtml(fmt, p.h, p.m);
    initWheels();
    $('asType').value = '';
    haptic(8);
    return true;
  }
  $('asType').onchange = applyTyped;
  $('asType').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); applyTyped(); $('asType').blur(); } };

  // changing the format keeps the time the wheels currently show
  pick('asFmt', function (v) {
    const cur = readWheelTime(fmt);
    fmt = v;
    $('awBox').innerHTML = wheelsHtml(fmt, cur.h, cur.m);
    initWheels();
    setAlarmFmt(v);
  });

  $('asSave').onclick = function () {
    if (!applyTyped()) return;
    const x = readWheelTime(fmt);
    const s = readSnooze();
    cfg.onSave({ time: pad(x.h) + ':' + pad(x.m), label: $('asLabel').value.trim(), days: days.slice(), sn: s.sn, sc: s.sc });
  };
  const del = $('asDel');
  if (del) del.onclick = cfg.onDelete;
  $('asCancel').onclick = cfg.onCancel || closeSheet;
}

function openAlarmSheet(a, origin) {
  const isNew = !a;
  openAlarmEditor({
    title: isNew ? 'New alarm' : 'Edit alarm',
    time: a ? a.time : '07:00',
    label: a ? (a.label || '') : '',
    days: a ? a.days : ALL_DAYS,
    sn: a && a.sn != null ? a.sn : globalSet.snoozeMin,
    sc: a && a.sc != null ? a.sc : globalSet.snoozeMax,
    ph: 'Alarm',
    isNew: isNew,
    origin: origin,
    onSave: function (d) {
      if (isNew) {
        const na = { id: 'a' + Date.now(), time: d.time, on: true, days: d.days, label: d.label, sn: d.sn, sc: d.sc, last: lateGuard(d.time) };
        arm(na);
        alarms.push(na);
      } else {
        a.time = d.time; a.label = d.label; a.days = d.days; a.sn = d.sn; a.sc = d.sc; a.on = true; a.last = lateGuard(d.time); arm(a);
      }
      sortAlarms(); refreshAlarms(); closeSheet();
      maybeAskNotifications();
    },
    onDelete: function () {
      alarms = alarms.filter(function (x) { return x !== a; });
      refreshAlarms(); closeSheet();
    }
  });
}

/* ---- quick alarms ---- */
function quickAlarm(q) {
  return alarms.find(function (a) { return a.time === q.time && daysKey(a.days) === daysKey(q.days); }) || null;
}

function renderQuick() {
  const box = $('quickBox');
  if (!box) return;
  const fmt = alarmFmt();

  let html = '<div class="qhead"><span>Quick alarms</span><button class="qcust" id="qCust">Customize</button></div><div class="qlist">';
  if (!quick.length) html += '<div class="hempty">No quick alarms yet. Tap Customize to add one.</div>';

  quick.forEach(function (q) {
    const x = parseTime(q.time);
    const have = quickAlarm(q);
    const top = fmt === '24' ? '24H' : (x.h >= 12 ? 'PM' : 'AM');
    const big = fmt === '24' ? pad(x.h) + ':' + pad(x.m) : ((x.h % 12) || 12) + ':' + pad(x.m);
    const state = have ? (have.on ? ['ok', 'Added'] : ['soon', 'Turn on']) : ['soon', '+ Add'];

    html += '<div class="hcard qcard" role="button" tabindex="0" data-q="' + esc(q.id) + '">' +
      '<div class="hd qd"><span class="hmon">' + top + '</span><span class="hday">' + big + '</span></div>' +
      '<div class="hmid"><div class="hname">' + esc(q.name) + '</div><div class="hbn">' + repeatText(q.days) + '</div></div>' +
      '<div class="hright"><span class="hleft ' + state[0] + '">' + state[1] + '</span></div></div>';
  });
  box.innerHTML = html + '</div>';
}

function addQuick(q) {
  const fmt = alarmFmt();
  const have = quickAlarm(q);
  if (have) {
    if (have.on) { toast('Already in your alarms'); return; }
    have.on = true;
    have.last = lateGuard(have.time);
    arm(have);
    refreshAlarms();
    toast('Alarm on \u00b7 ' + fmtClock(q.time, fmt));
    return;
  }
  const a = { id: 'a' + Date.now(), time: q.time, on: true, days: q.days.slice(), label: q.name, last: lateGuard(q.time) };
  if (q.sn != null) a.sn = q.sn;
  if (q.sc != null) a.sc = q.sc;
  arm(a);
  alarms.push(a);
  sortAlarms(); refreshAlarms();
  haptic(12);
  toast('Alarm added \u00b7 ' + fmtClock(q.time, fmt), {
    action: {
      label: 'Undo',
      fn: function () {
        alarms = alarms.filter(function (x) { return x !== a; });
        refreshAlarms();
      }
    }
  });
  maybeAskNotifications();
}

function openQuickSheet() {
  const fmt = alarmFmt();
  let h = head('Quick alarms');
  h += quick.length
    ? sec('', quick.map(function (q) {
      return '<button class="li nav" data-q="' + esc(q.id) + '"><div class="kk"><div class="k">' + esc(q.name) +
        '</div><div class="d">' + fmtClock(q.time, fmt) + ' \u00b7 ' + repeatText(q.days) + '</div></div></button>';
    }).join(''))
    : '<div class="sn mid">No quick alarms yet</div>';
  h += '<div class="acts"><button class="bt" id="qNew">New quick alarm</button></div>' +
    '<div class="acts"><button class="bt dng" id="qReset">Reset</button><button class="bt pri" id="done">Done</button></div>';
  openSheet(h, 'alarm');

  sheet.querySelectorAll('[data-q]').forEach(function (b) {
    b.onclick = function () {
      editQuick(quick.find(function (x) { return x.id === b.dataset.q; }));
    };
  });
  $('qNew').onclick = function () { editQuick(null); };
  $('qReset').onclick = function () {
    if (!confirm('Reset quick alarms to default?')) return;
    quick = defaultQuick();
    saveQuick(); renderQuick(); openQuickSheet();
  };
  finishSheet();
}

function editQuick(q) {
  const isNew = !q;
  openAlarmEditor({
    title: isNew ? 'New quick alarm' : 'Edit quick alarm',
    time: q ? q.time : '07:00',
    label: q ? q.name : '',
    days: q ? q.days : ALL_DAYS,
    sn: q && q.sn != null ? q.sn : globalSet.snoozeMin,
    sc: q && q.sc != null ? q.sc : globalSet.snoozeMax,
    ph: 'Name',
    isNew: isNew,
    onSave: function (d) {
      const name = d.label || 'Alarm';
      if (isNew) quick.push({ id: 'q' + Date.now(), name: name, time: d.time, days: d.days, sn: d.sn, sc: d.sc });
      else { q.name = name; q.time = d.time; q.days = d.days; q.sn = d.sn; q.sc = d.sc; }
      saveQuick(); renderQuick(); openQuickSheet();
    },
    onDelete: function () {
      quick = quick.filter(function (x) { return x !== q; });
      saveQuick(); renderQuick(); openQuickSheet();
    },
    onCancel: openQuickSheet
  });
}

// Builds the Alarm tab. Pieces that older versions drew by hand (Edit button,
// "Quick alarms" block, the "ring only while open" note) are removed here.
function initAlarmPage() {
  const view = $('v-alarm');
  const list = $('alarmList');
  if (!view || !list) return;

  const edit = $('aEdit');
  if (edit) edit.remove();

  const plus = $('aPlus');
  function keep(el) { return el.contains(list) || (plus && el.contains(plus)); }

  const OLD = /^\s*(Quick alarms|Customize)\s*$|ring only while this app is open|No alarms yet/i;
  Array.prototype.slice.call(view.querySelectorAll('*')).forEach(function (el) {
    if (!el.isConnected || el.children.length || list.contains(el) || !OLD.test(el.textContent)) return;
    let top = el;
    while (top.parentElement && top.parentElement !== view && !keep(top.parentElement)) top = top.parentElement;
    if (/Quick alarms/i.test(el.textContent)) {
      let n = top.nextElementSibling;
      while (n) {
        const nx = n.nextElementSibling;
        if (!keep(n)) n.remove();
        n = nx;
      }
    }
    top.remove();
  });

  let box = $('quickBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'quickBox';
    list.insertAdjacentElement('afterend', box);
  }

  function onPress(e) {
    if (hit(e, '#qCust')) { openQuickSheet(); return; }
    const c = hit(e, '[data-q]');
    if (!c) return;
    const q = quick.find(function (x) { return x.id === c.dataset.q; });
    if (q) addQuick(q);
  }
  box.addEventListener('click', onPress);
  box.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && hit(e, '[data-q]')) { e.preventDefault(); onPress(e); }
  });

  renderQuick();
}

// "Notify before ringing": 15 minutes before an alarm, once per ring time
function checkPre() {
  if (!globalSet.preNotify) return;
  const now = Date.now();
  alarms.forEach(function (a) {
    if (!a.on) return;
    const t = nextAlarmTime(a);
    const left = t - now;
    if (!t || left <= 0 || left > PRE_MS || preSent[a.id] === t) return;
    preSent[a.id] = t;
    const title = (a.label || 'Alarm') + ' ' + fmtClock(a.time, alarmFmt());
    const min = Math.ceil(left / 60000);
    toast(title + ' rings in ' + min + ' min', {
      ms: 9000,
      action: { label: 'Turn off', fn: function () { alarmOff(a.id); } }
    });
    if (document.hidden) {
      notify('Alarm in ' + min + ' min', title, 'pre-' + a.id, {
        requireInteraction: false, actions: [{ action: 'alarmoff', title: 'Turn off' }], data: { kind: 'pre', id: a.id }
      });
    }
  });
}

function checkAlarms() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dk = dayKey(now);
  const dow = now.getDay();
  alarms.forEach(function (a) {
    if (a.on && !a.days.length && a.at && Date.now() > a.at + 180000) {
      a.on = false;
      refreshAlarms();
      return;
    }
    const x = parseTime(a.time);
    const late = nowMin - (x.h * 60 + x.m);
    const today = !a.days.length || a.days.indexOf(dow) > -1;
    if (a.on && today && late >= 0 && late <= 2 && a.last !== dk + a.time) {
      a.last = dk + a.time;
      if (!a.days.length) a.on = false;
      refreshAlarms();
      startRing(alarmCtx(a, 0));
    }
  });
  if (snz && Date.now() >= snz.at) {
    const c = snz.ctx;
    setSnooze(null);
    startRing(c);
  }
  checkPre();
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

// play / pause icon + the "live" state that makes a running button breathe
function setGoIcon(id, running) {
  const go = $(id);
  if (!go) return;
  const k = running ? 'pause' : 'play';
  go.classList.toggle('live', running);
  if (go.dataset.k !== k) {
    go.dataset.k = k;
    swapIcon(go, ICON[k]);
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

// keeps the lap table exactly in the middle of the screen, whatever its parent does
function centerLaps() {
  const box = $('laps');
  if (!box) return;
  box.style.transform = '';
  const r = box.getBoundingClientRect();
  if (!r.width) return;   // stopwatch tab is hidden
  const dx = document.documentElement.clientWidth / 2 - (r.left + r.width / 2);
  if (Math.abs(dx) > 1) box.style.transform = 'translateX(' + dx.toFixed(1) + 'px)';
}

// Lap table: Lap (left) | Lap time (centre) | Total (right). Newest lap on top.
// Shortest lap = red, longest lap = blue (needs 2+ laps).
function renderLaps() {
  const box = $('laps');
  if (!box) return;
  const n = sw.laps.length;
  if (!n) { box.innerHTML = ''; return; }

  const split = sw.laps.map(function (t, i) { return t - (i ? sw.laps[i - 1] : 0); });
  let lo = 0, hi = 0;
  split.forEach(function (v, i) {
    if (v < split[lo]) lo = i;
    if (v > split[hi]) hi = i;
  });

  let html = '<div class="lhead"><span>Lap</span><span>Lap time</span><span>Total</span></div>';
  for (let i = n - 1; i >= 0; i--) {
    const cls = n > 1 ? (i === lo ? ' fast' : (i === hi ? ' slow' : '')) : '';
    const s = fmtMs(split[i]);
    const t = fmtMs(sw.laps[i]);
    html += '<div class="lrow' + cls + '"><span>' + pad(i + 1) + '</span><span>+' + s.main + '.' + s.cs +
      '</span><span>' + t.main + '.' + t.cs + '</span></div>';
  }
  box.innerHTML = html;
  centerLaps();
}

/* ==========================================================================
   14. TIMER, PRESETS & TYPED TIME
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

// typed timer: "1h 30m", "90s", "5:30" (min:sec), "1:30:00", "10" (minutes)
function parseDur(s) {
  s = bnDigits(s).toLowerCase().trim();
  let m = /^(\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(s);
  let sec = null;
  if (m) sec = +m[1] * 3600 + +m[2] * 60 + +m[3];
  else if ((m = /^(\d{1,3}):(\d{1,2})$/.exec(s))) sec = +m[1] * 60 + +m[2];
  else if (/^\d+$/.test(s)) sec = +s * 60;
  else {
    let t = 0;
    s.replace(/(\d+(?:\.\d+)?)\s*(h|m|s)[a-z]*/g, function (x, n, u) {
      t += n * { h: 3600, m: 60, s: 1 }[u];
      sec = t;
      return '';
    });
    if (sec != null) sec = Math.round(sec);
  }
  return sec == null ? null : Math.min(sec, 86399);
}

function initTimerTyping() {
  const pk = $('tmPicker');
  if (!pk || $('tmTypeIn')) return;
  const d = document.createElement('div');
  d.id = 'tmType';
  d.className = 'tmtype';
  d.innerHTML = '<input type="text" id="tmTypeIn" placeholder="Type: 1h 30m \u00b7 90s \u00b7 5:30" maxlength="14" autocomplete="off">' +
    '<button type="button" id="tmTypeGo">Set</button>';
  pk.insertAdjacentElement('afterend', d);

  function go() {
    const v = $('tmTypeIn').value.trim();
    if (!v) return;
    const s = parseDur(v);
    if (!s) { toast('Try 1h 30m, 90s or 5:30'); return; }
    pickPreset(s * 1000);
    $('tmTypeIn').value = '';
    $('tmTypeIn').blur();
    toast('Timer set \u00b7 ' + fmtHMS(s));
  }
  $('tmTypeGo').onclick = go;
  $('tmTypeIn').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } };
}

function wheelMs() {
  return (wpos($('pH'), ITEM_H) * 3600 + wpos($('pM'), ITEM_H) * 60 + wpos($('pS'), ITEM_H)) * 1000;
}

function markSelected() {
  ['pH', 'pM', 'pS'].forEach(function (id) {
    const el = $(id);
    if (!el || !el.children.length) return;
    const idx = wpos(el, ITEM_H);
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

function syncWheels() {
  const total = Math.round(tm.total / 1000);
  [['pH', Math.floor(total / 3600) % 24], ['pM', Math.floor((total % 3600) / 60)], ['pS', total % 60]].forEach(function (p) {
    const el = $(p[0]);
    if (el) el.scrollTop = p[1] * ITEM_H;
  });
  markSelected();
}

function renderTm() {
  const ms = tmLeft();
  const inRun = tm.running || tm.remaining !== tm.total;
  const pk = $('tmPicker');
  const rn = $('tmRun');
  const rs = $('tmReset');
  const ty = $('tmType');
  if (pk) pk.style.display = inRun ? 'none' : 'flex';
  if (ty) ty.style.display = inRun ? 'none' : 'flex';
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
    startRing({ kind: 'timer', id: '', title: 'Timer finished', tone: globalSet.timerTone, sn: 0, sc: 0, used: 0 });
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
      '<span class="pn">' + esc(p.name) + '</span>' +
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
    sec('', '<div class="li"><span class="k">Name</span><input type="text" id="ptName" class="inp" placeholder="For example Tea" maxlength="24"></div>' +
      '<div class="li"><span class="k">Type time</span><input type="text" id="ptType" class="inp" placeholder="1h 30m or 5:30" maxlength="14" autocomplete="off"></div>') +
    sec('Duration', '<div class="trip">' + col('ptH', 24, 'hours', 0) + col('ptM', 60, 'minutes', 5) + col('ptS', 60, 'seconds', 0) + '</div>') +
    '<div class="acts"><button class="bt" id="ptCancel">Cancel</button><button class="bt pri" id="ptSave">Save</button></div>';
  openSheet(h, 'preset', origin);

  // a typed duration moves the three pickers
  $('ptType').onchange = function () {
    const s = parseDur($('ptType').value);
    if (!s) { toast('Try 1h 30m, 90s or 5:30'); return; }
    $('ptH').value = Math.floor(s / 3600);
    $('ptM').value = Math.floor((s % 3600) / 60);
    $('ptS').value = s % 60;
  };

  $('ptSave').onclick = function () {
    if ($('ptType').value.trim()) $('ptType').onchange();
    const s = Number($('ptH').value) * 3600 + Number($('ptM').value) * 60 + Number($('ptS').value);
    if (s <= 0) return;
    const name = $('ptName').value.trim() || 'Timer';
    presets.push({ id: 'p' + Date.now(), name: name, s: s });
    savePresets(); renderPresets(); closeSheet();
  };
  $('ptCancel').onclick = closeSheet;
}

/* ==========================================================================
   15. UPCOMING  (fully dynamic: nothing is typed by hand)
   --------------------------------------------------------------------------
   Country : Settings choice, otherwise GPS -> internet (IP) -> time zone -> language
   Sources for the next 12 months, merged into one list:
     1. date-holidays library (about 200 countries), cached for offline use
     2. Nager.Date API, only when the library has nothing for the country
     3. Wikidata (SPARQL): recurring national / historic / cultural days. Saved 30 days.
     4. Your own dates
   Duplicates (same / similar name within 3 days) are merged.
   Each day gets one type: Religious, National & historic, Cultural or Holiday.
   Swipe left / right on the list to move between the filters.
   ========================================================================== */
const LIB_URLS = ['holidays.min.js', 'https://cdn.jsdelivr.net/npm/date-holidays@3/dist/umd.min.js', 'https://unpkg.com/date-holidays@3/dist/umd.min.js'];
const LIB_CACHE = 'clock-holidays-lib';
const REL_RE = /christmas|\beaster|good friday|epiphany|ascension|pentecost|\bwhit(sun|\s|$)|corpus christi|assumption|all saints|all souls|immaculate|diwali|deepavali|\bholi\b|vesak|buddha|navratri|dussehra|durga|janmashtami|ramadan|\beid|fitr|adha|ashura|mawlid|passover|hanukkah|yom kippur|rosh hashan|nyepi|waisak|thaipusam|palm sunday|maundy|ramazan|bayram|kurban|\braya\b|nuzul|arafah|shab-e|miladun|isra|qadr|purim|sukkot|shavuot|ash wednesday|nanak|baisakhi|vaisakhi|mahavir|onam|pongal|ganesh|rath yatra|shivaratri|ram navami|poya|puja|purnima|ashtami|muharram|hijri|laylat|lailat/i;
const HIST_RE = /independence|victory|liberation|martyr|shaheed|remembrance|memorial|massacre|genocide|revolution|republic|constitution|national|armed forces|army|veteran|heroes|unification|founding|freedom|resistance|uprising|sovereignty|\bflag\b|\bwar\b|battle|mourning|mother language|language day|language movement|anniversary/i;
const UP_FILTERS = [['all', 'All'], ['h', 'Holidays'], ['n', 'National & historic'], ['c', 'Cultural'], ['r', 'Religious']];
const UP_PAGE = 40;
const UP_DAYS = 366;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

let lastCc = null;
let countryCache = null;
let zoneMap = null;
let ipPlace = loadIpPlace();
let ipBusy = false;
let libBusy = null;
let holLoading = false;
let lastUpSig = '';
let lastOv = -1;
let upLimit = UP_PAGE;
const holMemo = {};
const extraBusy = {};
const wdBusy = {};

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
  upLimit = UP_PAGE;
  loadHolidays(cc);
  renderUpcoming();
}

/* ---- source 1: holiday library (network first, browser cache as offline copy) ---- */
function loadScript(url) {
  return new Promise(function (res, rej) {
    const s = document.createElement('script');
    s.src = url;
    s.onload = res;
    s.onerror = function () { s.remove(); rej(new Error('script')); };
    document.head.appendChild(s);
  });
}

function saveLibCopy(url) {
  if (!window.caches || navigator.onLine === false) return;
  caches.open(LIB_CACHE).then(function (c) {
    return c.match(url).then(function (found) {
      if (found) return;
      return fetch(url).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
        if (t.indexOf('getHolidays') > -1) return c.put(url, new Response(t));
      });
    });
  }).catch(function () {});
}

function loadCachedLib(url) {
  if (!window.caches) return Promise.reject(new Error('no cache'));
  return caches.match(url, { cacheName: LIB_CACHE }).then(function (r) {
    if (!r) throw new Error('miss');
    return r.text();
  }).then(function (t) {
    const u = URL.createObjectURL(new Blob([t], { type: 'text/javascript' }));
    return loadScript(u).then(function () { URL.revokeObjectURL(u); }, function (e) { URL.revokeObjectURL(u); throw e; });
  });
}

function holCls() {
  const H = window.Holidays;
  return typeof H === 'function' ? H : (H && typeof H.default === 'function' ? H.default : null);
}

function loadLib() {
  if (holCls()) return Promise.resolve(true);
  if (libBusy) return libBusy;
  function check() { if (!holCls()) throw new Error('library missing'); }
  libBusy = LIB_URLS.reduce(function (p, u) {
    return p.catch(function () {
      return loadScript(u).then(check).then(function () { saveLibCopy(u); }).catch(function () {
        return loadCachedLib(u).then(check);
      });
    });
  }, Promise.reject(new Error('start')))
    .then(function () { return true; })
    .catch(function () { return false; })
    .then(function (ok) { libBusy = null; return ok; });
  return libBusy;
}

// null = library not loaded yet, [] = no data for this country
// item: { d 'YYYY-MM-DD', n English name, l local name, p public holiday? }
function libList(cc, yr) {
  const k = cc + yr;
  if (holMemo[k]) return holMemo[k];
  const H = holCls();
  if (!H) return null;
  const out = [];
  try {
    const en = new H(cc);
    en.setLanguages('en');
    const names = {};
    en.getHolidays(yr).forEach(function (x) { names[x.date.slice(0, 10) + x.rule] = x.name; });

    new H(cc).getHolidays(yr).forEach(function (x) {
      const d = x.date.slice(0, 10);
      const n = names[d + x.rule] || x.name;
      out.push({ d: d, n: n, l: x.name !== n ? x.name : '', p: x.type === 'public' });
    });
  } catch (e) {}
  holMemo[k] = out;
  return out;
}

/* ---- source 2: backup API, saved for a week ---- */
function readExtra(cc, yr) {
  const o = readJson(HKEY + cc + '_' + yr);
  return o && Array.isArray(o.list) ? o : null;
}

function fetchExtra(cc, yr) {
  const k = cc + yr;
  const c = readExtra(cc, yr);
  if (extraBusy[k] || (c && Date.now() - c.ts < HOL_TTL)) return Promise.resolve();
  extraBusy[k] = 1;

  function save(list) { writeJson(HKEY + cc + '_' + yr, { ts: Date.now(), list: list }); }

  return fetchJson(HOL_URL + yr + '/' + cc, { timeout: 10000, retries: 1 })
    .then(function (d) {
      save(Array.isArray(d) ? d.map(function (x) {
        return {
          d: x.date, n: x.name || '',
          l: x.localName && x.localName !== x.name ? x.localName : '',
          p: (x.types || []).indexOf('Public') > -1
        };
      }) : []);
    })
    .catch(function (e) {
      // a country the service does not cover is remembered; network errors are retried later
      if (e && e.kind === 'http' && e.status < 500) save([]);
    })
    .then(function () { delete extraBusy[k]; });
}

function holItems(cc, yr) {
  const l = libList(cc, yr);
  if (l && l.length) return l;
  const c = readExtra(cc, yr);
  return c ? c.list : [];
}

/* ---- source 3: Wikidata, every recurring day of the country (fixed day of the year) ---- */
// "March 26" / "26 March" -> { m: 2, d: 26 }; moon-calendar values (1 Shawwal ...) give null
function parseMD(s) {
  const t = String(s).toLowerCase();
  let m = /([a-z]{3,})\.?\s+(\d{1,2})\b/.exec(t);
  let mon, day;
  if (m) { mon = m[1]; day = +m[2]; }
  else if ((m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})/.exec(t))) { day = +m[1]; mon = m[2]; }
  else return null;
  const i = MONTHS.indexOf(mon.slice(0, 3));
  return (i < 0 || day < 1 || day > 31) ? null : { m: i, d: day };
}

function wdQuery(cc) {
  return 'SELECT ?itemLabel ?dayLabel (EXISTS{?item wdt:P31 wd:Q1197685} AS ?pub) WHERE {' +
    ' ?c wdt:P297 "' + cc + '". ?item wdt:P17 ?c; wdt:P837 ?day.' +
    ' SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 600';
}

function readWd(cc) {
  const o = readJson(WKEY + cc);
  return o && Array.isArray(o.list) ? o : null;
}

function fetchWd(cc) {
  const c = readWd(cc);
  if (wdBusy[cc] || (c && Date.now() - c.ts < WD_TTL)) return Promise.resolve();
  wdBusy[cc] = 1;
  const url = WD_URL + '?format=json&origin=*&query=' + encodeURIComponent(wdQuery(cc));

  return fetchJson(url, { timeout: 25000, retries: 1 })
    .then(function (d) {
      const seen = {};
      const list = [];
      ((d && d.results && d.results.bindings) || []).forEach(function (b) {
        const n = b.itemLabel && b.itemLabel.value;
        const md = b.dayLabel && parseMD(b.dayLabel.value);
        if (!n || !md || /^Q\d+$/.test(n)) return;
        const k = md.m + '-' + md.d + n;
        if (seen[k]) return;
        seen[k] = 1;
        list.push({ m: md.m, d: md.d, n: n, p: !!(b.pub && b.pub.value === 'true') });
      });
      writeJson(WKEY + cc, { ts: Date.now(), list: list });
    })
    .catch(function () {})   // offline or busy: the next load tries again
    .then(function () { delete wdBusy[cc]; });
}

function loadHolidays(cc) {
  if (!cc) return;
  const y = new Date().getFullYear();
  holLoading = true;
  loadLib().then(function () {
    const jobs = [];
    [y, y + 1].forEach(function (yr) {
      const l = libList(cc, yr);
      if (!(l && l.length) && navigator.onLine !== false) jobs.push(fetchExtra(cc, yr));
    });
    if (navigator.onLine !== false && /^[A-Z]{2}$/.test(cc)) jobs.push(fetchWd(cc));
    return Promise.all(jobs);
  }).then(function () {
    holLoading = false;
    if (cc === detectCountry()) renderUpcoming();
    syncWidgetData();
  });
}

/* ---- source 4: your own dates ---- */
function loadCustom() {
  const c = readJson(CUSTOM_KEY);
  return Array.isArray(c) ? c : [];
}
function saveCustom(list) { writeJson(CUSTOM_KEY, list); }

/* ---- merge everything: today until one year ahead ---- */
function norm(s) { return String(s).toLowerCase().replace(/\bthe\b|\bday\b/g, '').replace(/[^a-z0-9]/g, ''); }

function sameName(a, b) {
  const x = norm(a), y = norm(b);
  return x === y || (x.length > 3 && y.length > 3 && (x.indexOf(y) > -1 || y.indexOf(x) > -1));
}

// one type per day: religious, national & historic, public holiday, otherwise cultural
function dayType(name, pub) {
  if (REL_RE.test(name)) return 'r';
  if (HIST_RE.test(name)) return 'n';
  return pub ? 'h' : 'c';
}

function getUpcoming(today) {
  const cc = detectCountry();
  const y = today.getFullYear();
  const out = [];

  // forced = type chosen by the user for own dates
  function push(dt, n, local, pub, forced) {
    const diff = Math.round((dt - today) / 864e5);
    if (diff < 0 || diff > UP_DAYS || !n) return;
    const dup = out.find(function (e) { return Math.abs(e.dt - dt) <= 3.5 * 864e5 && sameName(e.n, n); });
    if (dup) {
      if (pub) dup.pub = true;
      if (!dup.b && local) dup.b = local;
      return;
    }
    out.push({ dt: dt, n: n, b: local || '', t: forced || dayType(n, pub), pub: !!pub, diff: diff });
  }

  if (cc) {
    for (let yr = y; yr <= y + 1; yr++) {
      // 1 + 2: library, or the backup API when the library has nothing
      holItems(cc, yr).forEach(function (x) {
        const p = String(x.d).split('-');
        if (p.length === 3) push(new Date(+p[0], +p[1] - 1, +p[2]), x.n, x.l, x.p);
      });
    }
    // 3: Wikidata (fixed-date national, historic and cultural days)
    const wdata = readWd(cc);
    if (wdata) {
      for (let yr = y; yr <= y + 1; yr++) {
        wdata.list.forEach(function (x) { push(new Date(yr, x.m, x.d), x.n, '', x.p); });
      }
    }
  }

  // 4: your own dates
  loadCustom().forEach(function (c) {
    const p = String(c.d).split('-');
    if (p.length !== 3 || !c.n) return;
    const t = UP_TYPES[c.t] ? c.t : 'c';
    const pub = t === 'h';
    if (c.r) {
      for (let yr = y; yr <= y + 1; yr++) push(new Date(yr, +p[1] - 1, +p[2]), c.n, c.b, pub, t);
    } else {
      push(new Date(+p[0], +p[1] - 1, +p[2]), c.n, c.b, pub, t);
    }
  });

  out.sort(function (a, b) {
    return (a.dt - b.dt) || ((b.pub ? 1 : 0) - (a.pub ? 1 : 0)) || a.n.localeCompare(b.n);
  });
  return out;
}

/* ---- screen ---- */
function curFilter() {
  const f = globalSet.upFilter;
  return UP_FILTERS.some(function (x) { return x[0] === f; }) ? f : 'all';
}

function drawChips() {
  const box = $('hFilter');
  if (!box) return;
  const cur = curFilter();
  box.innerHTML = UP_FILTERS.map(function (f) {
    return '<button class="hchip' + (f[0] === cur ? ' on' : '') + '" data-f="' + f[0] + '">' + f[1] + '</button>';
  }).join('');
}

// changes the filter; dir > 0 slides the list in from the right, dir < 0 from the left
function setFilter(v, dir) {
  globalSet.upFilter = v;
  saveGlobal();
  upLimit = UP_PAGE;
  drawChips();
  renderUpcoming();
  const box = $('hList');
  if (box) {
    box.scrollTop = 0;
    box.classList.remove('swL', 'swR');
    void box.offsetWidth;
    if (dir) box.classList.add(dir > 0 ? 'swL' : 'swR');
  }
  const bar = $('hFilter');
  const on = bar ? bar.querySelector('.on') : null;
  if (on) bar.scrollTo({ left: on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
  haptic(8);
}

function stepFilter(dir) {
  const cur = curFilter();
  const i = UP_FILTERS.findIndex(function (f) { return f[0] === cur; });
  const j = i + dir;
  if (j < 0 || j >= UP_FILTERS.length) return;
  setFilter(UP_FILTERS[j][0], dir);
}

function renderUpcoming() {
  const box = $('hList');
  if (!box) return;
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cc = detectCountry();
  const f = curFilter();

  const sub = document.querySelector('.hsub');
  if (sub) sub.textContent = cc ? (flagOf(cc) + ' ' + countryName(cc)).trim() : '';

  const all = getUpcoming(today).filter(function (it) {
    return f === 'all' || (f === 'h' ? it.pub : it.t === f);
  });
  const list = all.slice(0, upLimit);

  // draw again only when something really changed (keeps the scroll position)
  const sig = [dayKey(today), cc, f, holLoading, upLimit, all.length,
    list.map(function (it) { return dayKey(it.dt) + it.n + it.t; }).join('|')].join('#');
  if (sig === lastUpSig) return;
  lastUpSig = sig;

  if (!list.length) {
    box.innerHTML = '<div class="hempty">' + (holLoading ? 'Loading dates...' : 'Nothing here for the next 12 months. Swipe to another filter, or add your own date in Settings.') + '</div>';
    return;
  }

  let html = '';
  let month = '';
  list.forEach(function (it) {
    const mk = it.dt.getFullYear() + '-' + it.dt.getMonth();
    if (mk !== month) {
      month = mk;
      html += '<div class="hgrp">' + it.dt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) + '</div>';
    }
    const left = it.diff === 0 ? 'Today' : (it.diff === 1 ? 'Tomorrow' : 'In ' + it.diff + ' days');
    const wdn = it.dt.toLocaleDateString('en-GB', { weekday: 'short' });
    html += '<div class="hcard t-' + it.t + (it.diff === 0 ? ' today' : '') + '">' +
      '<div class="hd"><span class="hmon">' + MON[it.dt.getMonth()] + '</span>' +
      '<span class="hday">' + it.dt.getDate() + '</span></div>' +
      '<div class="hmid"><div class="hname">' + esc(it.n) + '</div><div class="hbn">' + esc(it.b) + '</div></div>' +
      '<div class="hright"><span class="hleft' + (it.diff <= 7 ? ' soon' : '') + '">' + left + '</span>' +
      '<span class="hwd">' + wdn + ', ' + (it.pub ? 'Holiday' : UP_TYPES[it.t][0]) + '</span></div>' +
      '</div>';
  });
  if (all.length > list.length) {
    html += '<button class="hmore" data-more="1">Show more (' + (all.length - list.length) + ' left)</button>';
  }
  box.innerHTML = html;
}

function openUpcomingSettings() {
  const sel = globalSet.country || 'auto';
  const opt = function (v, t, s) { return '<option value="' + v + '"' + (s ? ' selected' : '') + '>' + t + '</option>'; };
  const typeOpts = [['c', 'Cultural'], ['n', 'National & historic'], ['h', 'Holiday'], ['r', 'Religious']];

  let h = head('Upcoming dates', 'upBack');
  h += sec('Country',
    '<div class="li"><span class="k" style="flex:none">Country</span><select class="r" id="upCc">' +
    opt('auto', 'Auto (' + esc(countryName(autoCountry()) || 'unknown') + ')', sel === 'auto') +
    countryList().map(function (x) { return opt(x.c, esc(flagOf(x.c) + ' ' + x.n), sel === x.c); }).join('') +
    '</select></div>',
    'Public holidays, national, historic and cultural days follow this country. They come from online holiday databases and are saved for offline use. ' +
    'Moon-based days (Eid, Ramadan...) are calculated, so the real date can differ by a day.');
  h += sec('Add your own date',
    '<div class="li"><span class="k">Date</span><input type="date" class="inp" id="upDate"></div>' +
    '<div class="li"><span class="k">Name</span><input type="text" class="inp" id="upName" placeholder="Birthday" maxlength="40"></div>' +
    '<div class="li"><span class="k">Type</span><select class="r" id="upType">' +
    typeOpts.map(function (o) { return opt(o[0], o[1], o[0] === 'c'); }).join('') + '</select></div>' +
    '<div class="li"><span class="k">Repeat</span>' + seg('upRep', [['1', 'Every year'], ['0', 'Once']], '1') + '</div>');
  h += '<div class="acts"><button class="bt pri" id="upAdd">Add date</button></div>';
  h += '<div id="upList"></div>';
  h += '<div class="acts"><button class="bt" id="done">Done</button></div>';
  openSheet(h, 'settings');

  let rep = '1';
  pick('upRep', function (v) { rep = v; });

  function drawCustom() {
    const list = loadCustom();
    const box = $('upList');
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = sec('Your dates', list.map(function (c, i) {
      return '<div class="li"><div class="kk"><div class="k">' + esc(c.n) + '</div><div class="d">' +
        esc(c.d + (c.r ? ' \u00b7 every year' : '')) + '</div></div>' +
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
    l.push({ d: d, n: n, b: '', t: $('upType').value, r: rep === '1' ? 1 : 0 });
    saveCustom(l);
    $('upName').value = '';
    drawCustom(); renderUpcoming();
  };

  finishSheet('upBack', openSettings);
}

// the list leaves room for the floating bottom bar, so the last card is never hidden
function measureUpcoming() {
  const box = $('hList');
  const hol = $('holidays');
  const nav = $('nav');
  if (!box || !hol || !box.offsetParent) return;
  const ov = nav ? Math.max(0, Math.round(window.innerHeight - nav.getBoundingClientRect().top)) : 0;
  if (ov !== lastOv) { lastOv = ov; hol.style.setProperty('--ov', ov + 'px'); }
}

function initUpcoming() {
  const home = $('v-home');
  const hol = $('holidays');
  if (home && hol) home.appendChild(hol);

  const hh = document.querySelector('.hhead span');
  if (hh) hh.textContent = 'Upcoming';

  const box = $('hList');
  if (!box) return;

  if (!$('hFilter')) {
    const bar = document.createElement('div');
    bar.id = 'hFilter';
    bar.className = 'hfilter';
    bar.onclick = function (e) {
      const b = hit(e, '[data-f]');
      if (!b || b.dataset.f === curFilter()) return;
      const order = UP_FILTERS.map(function (x) { return x[0]; });
      setFilter(b.dataset.f, order.indexOf(b.dataset.f) > order.indexOf(curFilter()) ? 1 : -1);
    };
    box.parentNode.insertBefore(bar, box);
  }
  drawChips();

  box.addEventListener('click', function (e) {
    if (hit(e, '[data-more]')) {
      upLimit += UP_PAGE;
      renderUpcoming();
    }
  });

  let lastIdx = 0;
  box.addEventListener('scroll', function () {
    const first = box.querySelector('.hcard');
    const rowH = first ? first.offsetHeight + 9 : 70;
    const idx = Math.round(box.scrollTop / rowH);
    if (idx !== lastIdx) { lastIdx = idx; haptic(7); }
  }, { passive: true });

  // swipe left / right on the section = next / previous filter
  let sx = 0, sy = 0, st = 0;
  hol.addEventListener('touchstart', function (e) {
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now();
  }, { passive: true });
  hol.addEventListener('touchend', function (e) {
    if (hit(e, '#hFilter')) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - st > 700) return;
    stepFilter(dx < 0 ? 1 : -1);
  }, { passive: true });

  window.addEventListener('resize', function () { measureUpcoming(); centerLaps(); });
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(measureUpcoming);
    [hol, $('nav')].forEach(function (el) { if (el) ro.observe(el); });
  }
}

/* ==========================================================================
   16. BOTTOM BAR, BUTTON EFFECTS, SETTINGS BUTTON, PLUS BUTTON
   ========================================================================== */
// buttons that send out a light when pressed (the colour comes from --gc in the CSS)
const FX_BUTTONS = '#swGo,#tmGo,#swLap,#swReset,#tmReset,#aPlus,#pAdd,#add';

function burst(btn) {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  ['flash', 'burst'].forEach(function (c) {
    const s = document.createElement('span');
    s.className = 'fx ' + c;
    s.setAttribute('aria-hidden', 'true');
    s.addEventListener('animationend', function () { s.remove(); });
    btn.appendChild(s);
  });
}

function initPressFeedback() {
  document.addEventListener('pointerdown', function (e) {
    const t = hit(e, '#swGo,#tmGo,.round,.fab,#nav button');
    if (t) haptic(t.id === 'swGo' || t.id === 'tmGo' ? 16 : 8);
    const f = hit(e, FX_BUTTONS);
    if (f) burst(f);
  }, true);

  // keyboard presses (no pointer) get the same light
  document.addEventListener('click', function (e) {
    if (e.detail !== 0) return;
    const f = hit(e, FX_BUTTONS);
    if (f) burst(f);
  }, true);
}

function initNav() {
  const nav = $('nav');
  if (!nav) return;
  let downAt = 0;

  nav.addEventListener('pointerdown', function (e) {
    const b = hit(e, '[data-tab]');
    if (!b) return;
    downAt = Date.now();
    showTab(b.dataset.tab);
  }, true);

  nav.addEventListener('click', function (e) {
    const b = hit(e, '[data-tab]');
    if (!b) return;
    if (Date.now() - downAt < 1500) {
      e.stopImmediatePropagation();
      e.preventDefault();
    } else {
      showTab(b.dataset.tab);
    }
  }, true);
}

// rotates the settings dots / the + button while its popover is open
function setOut(id, on) {
  if (popOut[id] === on) return;
  popOut[id] = on;
  const el = $(id);
  if (el) el.classList.toggle('out', on);
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
    setOut('cog', open && kind === 'settings');
    setOut('add', open && kind === 'add');
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
   17. CONNECTION, NOTIFICATIONS, PERMISSIONS & SERVICE WORKER
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
  window.addEventListener('offline', function () {
    toast('You are offline. Everything saved still works.', { ms: 4500 });
    renderUpcoming();
  });
  window.addEventListener('online', function () { toast('Back online'); onBackOnline(); });
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; });
}

/* ---- notifications ----
   While the app is open an alarm / timer rings with sound and also posts a
   notification with Snooze / Stop buttons (lock screen and notification
   centre). The buttons are handled by the service worker and arrive here as a
   message. Where the browser supports scheduled notifications
   (TimestampTrigger) the next alarm is also scheduled, so it can show even if
   the page was closed. */
function notifSupported() { return 'Notification' in window; }

function requestNotifications() {
  if (LN) return LN.requestPermissions().then(function (r) { exactCheck(); return r.display; }).catch(function () { return 'denied'; });
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
  if (LN) {
    LN.checkPermissions().then(function (r) {
      if (r.display === 'granted') exactCheck();
      else if (r.display !== 'denied') requestNotifications();
    }).catch(function () {});
    return;
  }
  if (!notifSupported() || Notification.permission !== 'default') return;
  let asked = false;
  try { asked = !!localStorage.getItem(NOTIF_ASKED); } catch (e) {}
  if (asked) return;
  try { localStorage.setItem(NOTIF_ASKED, '1'); } catch (e) {}
  requestNotifications();
}

function notify(title, body, tag, extra) {
  if (LN) return;
  if (!notifSupported() || Notification.permission !== 'granted') return;
  const opts = Object.assign({ body: body, tag: tag || 'clock', renotify: true, requireInteraction: true, vibrate: [300, 150, 300, 150, 300] }, extra || {});
  function plain() { try { delete opts.actions; new Notification(title, opts); } catch (e) {} }
  if (swReg && swReg.showNotification) swReg.showNotification(title, opts).catch(plain);
  else plain();
}

function closeNotifs() {
  if (LN) { LN.removeAllDeliveredNotifications().catch(function () {}); return; }
  try {
    if (swReg && swReg.getNotifications) {
      swReg.getNotifications().then(function (list) {
        list.forEach(function (n) { if (n.tag === 'clock-ring' || n.tag.indexOf('sch-') === 0) n.close(); });
      });
    }
  } catch (e) {}
}

function nextAlarmTime(a) {
  if (!a.days.length && a.at) return a.at > Date.now() ? a.at : 0;
  const x = parseTime(a.time);
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, x.h, x.m, 0, 0);
    if (d <= now) continue;
    if (!a.days.length || a.days.indexOf(d.getDay()) > -1) return d.getTime();
  }
  return 0;
}

function schedSoon() {
  clearTimeout(schedTimer);
  schedTimer = setTimeout(syncSchedule, 500);
}

function syncSchedule() {
  if (LN) { nativeSync(); return; }
  if (!swReg || !window.TimestampTrigger || !notifSupported() || Notification.permission !== 'granted') return;
  const A = [{ action: 'snooze', title: 'Snooze' }, { action: 'stop', title: 'Stop' }];
  const T = [{ action: 'again', title: 'Restart' }, { action: 'stop', title: 'Stop' }];

  function add(tag, ts, title, kind, id, acts) {
    if (!ts || ts <= Date.now()) return;
    swReg.showNotification(title, {
      tag: tag, showTrigger: new TimestampTrigger(ts), requireInteraction: true,
      vibrate: [300, 150, 300, 150, 300], actions: acts, data: { kind: kind, id: id }
    }).catch(function () {});
  }

  swReg.getNotifications({ includeTriggered: true }).then(function (list) {
    list.forEach(function (n) { if (n.tag.indexOf('sch-') === 0) n.close(); });
    alarms.forEach(function (a) {
      if (a.on) add('sch-a' + a.id, nextAlarmTime(a), (a.label || 'Alarm') + ' ' + fmtClock(a.time, alarmFmt()), 'alarm', a.id, A);
    });
    if (tm.running) add('sch-timer', tm.endAt, 'Timer finished', 'timer', '', T);
    if (snz) add('sch-snz', snz.at, snz.ctx.title, 'alarm', snz.ctx.id || '', A);
  }).catch(function () {});
}

/* ---- Android app (Capacitor Local Notifications) ----
   Every alarm is handed to Android's alarm manager, so it shows on the lock
   screen with Snooze / Stop buttons even when the app is closed. Repeating
   alarms use a weekly schedule per selected day. "Notify before ringing" adds
   one extra notification 15 minutes before the next ring of each alarm. */
function hashId(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9000000;
  return (h + 100) * 10;
}

function nativeSync() {
  LN.getPending().then(function (r) {
    const ids = (r.notifications || []).map(function (n) { return { id: n.id }; });
    return ids.length ? LN.cancel({ notifications: ids }) : null;
  }).then(function () {
    const list = [];
    function item(id, title, body, kind, rid, schedule) {
      schedule.allowWhileIdle = true;
      return {
        id: id, title: title, body: body, schedule: schedule, channelId: 'alarm',
        actionTypeId: kind === 'timer' ? 'TIMER' : (kind === 'pre' ? 'PRE' : 'ALARM'),
        extra: { kind: kind, id: rid }, autoCancel: true
      };
    }
    alarms.forEach(function (a) {
      if (!a.on) return;
      const x = parseTime(a.time);
      const title = a.label || 'Alarm';
      const body = fmtClock(a.time, alarmFmt());
      const base = hashId(a.id);
      const next = nextAlarmTime(a);
      if (!a.days.length) {
        if (next) list.push(item(base + 7, title, body, 'alarm', a.id, { at: new Date(next) }));
      } else {
        a.days.forEach(function (d) {
          list.push(item(base + d, title, body, 'alarm', a.id, { on: { weekday: d + 1, hour: x.h, minute: x.m } }));
        });
      }
      if (globalSet.preNotify && next && next - PRE_MS > Date.now()) {
        list.push(item(base + 8, 'Alarm in 15 min', title + ' ' + body, 'pre', a.id, { at: new Date(next - PRE_MS) }));
      }
    });
    if (tm.running && tm.endAt > Date.now()) list.push(item(1, 'Timer finished', 'Tap to open', 'timer', '', { at: new Date(tm.endAt) }));
    if (snz && snz.at > Date.now()) list.push(item(2, snz.ctx.title, 'Snoozed alarm', 'alarm', snz.ctx.id || '', { at: new Date(snz.at) }));
    return list.length ? LN.schedule({ notifications: list }) : null;
  }).catch(function () {});
}

// Android 12+: alarms are only exact when "Alarms & reminders" is allowed
function exactCheck() {
  if (!LN || !LN.checkExactNotificationSetting) return;
  LN.checkExactNotificationSetting().then(function (r) {
    if (r && r.exact_alarm === 'denied') {
      toast('Allow "Alarms & reminders" so alarms ring on time', {
        ms: 7000,
        action: { label: 'Open', fn: function () { LN.changeExactNotificationSetting().catch(function () {}); } }
      });
    }
  }).catch(function () {});
}

function initNative() {
  if (!LN) return;
  LN.createChannel({ id: 'alarm', name: 'Alarms and timers', description: 'Alarm and timer alerts', importance: 5, visibility: 1, vibration: true, lights: true }).catch(function () {});
  LN.registerActionTypes({ types: [
    { id: 'ALARM', actions: [{ id: 'snooze', title: 'Snooze' }, { id: 'stop', title: 'Stop', destructive: true }] },
    { id: 'TIMER', actions: [{ id: 'again', title: 'Restart' }, { id: 'stop', title: 'Stop', destructive: true }] },
    { id: 'PRE', actions: [{ id: 'alarmoff', title: 'Turn off', destructive: true }] }
  ] }).catch(function () {});
  LN.addListener('localNotificationActionPerformed', function (ev) {
    const x = (ev.notification && ev.notification.extra) || {};
    const act = ev.actionId === 'tap' ? '' : ev.actionId;
    handleRingAction(act, x.kind || 'alarm', x.id || '');
    if (!act && x.kind !== 'pre') checkAlarms();   // tapping the notification opens the app and lets it ring
  });
  nativeSync();
}

// a once-alarm remembers its exact time (at); repeating alarms do not need it
function arm(a) {
  delete a.at;
  if (!a.days.length) a.at = nextAlarmTime(a);
}

// the app was opened by a notification button while it was closed (?ring=snooze&kind=alarm&id=...)
function readRingParam() {
  const p = new URLSearchParams(location.search);
  const r = p.get('ring');
  if (!r) return;
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
  handleRingAction(r === 'open' ? '' : r, p.get('kind') || 'alarm', p.get('id') || '');
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
  if (LN) return LN.checkPermissions().then(function (r) { return r.display === 'granted' ? 'granted' : (r.display === 'denied' ? 'denied' : 'prompt'); }).catch(function () { return 'unknown'; });
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
      ['notif', 'Notifications', 'Alarm and timer alerts with Snooze / Stop buttons on the lock screen and notification centre.', r[1]],
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
      (('wakeLock' in navigator) ? 'Supported' : 'Not supported') + '</span></div>' +
      '<div class="li"><span class="k">Scheduled alerts (app closed)</span><span class="v">' +
      (window.TimestampTrigger || LN ? 'Supported' : 'Not supported') + '</span></div>');
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
    finishSheet('pback', openSettings);
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

/* ---- service worker: offline support, notification buttons, silent update ---- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  // a new version takes over by itself; reload only when nothing is running
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!ringOn && !tm.running && !sw.running) location.reload();
  });

  // Snooze / Stop / Restart pressed on a notification
  navigator.serviceWorker.addEventListener('message', function (e) {
    const d = e.data || {};
    if (d.type === 'ring-action') handleRingAction(d.action, d.kind, d.id);
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
    .then(function (reg) { if (reg) { swReg = reg; schedSoon(); } })
    .catch(function () {});
}

/* ==========================================================================
   18. INIT
   ========================================================================== */
function bindEvents() {
  overlay.onclick = closeSheet;

  // Stop: one tap, or (Settings > Stop alarm with > Hold button) hold for 1.5 seconds
  const rs = $('ringStop');
  let holdT = null;
  rs.onclick = function () { if (!holdStop(ringCtx)) stopRing(); };
  rs.addEventListener('pointerdown', function () {
    if (!holdStop(ringCtx)) return;
    clearTimeout(holdT);
    rs.classList.add('holding');
    holdT = setTimeout(function () { rs.classList.remove('holding'); stopRing(); }, 1500);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    rs.addEventListener(ev, function () { clearTimeout(holdT); rs.classList.remove('holding'); });
  });
  $('ringSnooze').onclick = function () { if (ringAction) ringAction.fn(); };

  $('add').onclick = openAddWidget;
  $('aPlus').onclick = function (e) { openAlarmSheet(null, pt(e)); };

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
    document.addEventListener(ev, unlockAudio, { passive: true, once: true });
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (globalSet.awake) setAwake(true);
    checkAlarms();
    if (tm.running) renderTm();
    tick();
    loadHolidays(detectCountry());
    renderUpcoming();
    schedSoon();
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
  initWidgetsTab();
  initNav();
  initSettingsButton();
  initAddButton();
  initPopoverWatch();
  initUpcoming();
  initAlarmPage();
  initTimerTyping();

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
  initNative();
  syncWidgetData();
  requestPersistentStorage();
  watchPermissions();

  setInterval(tick, 1000);
  setInterval(checkAlarms, 1000);
  setInterval(function () { if (sw.running) renderSw(); }, 50);
  setInterval(function () { if (tm.running) renderTm(); }, 200);
  setInterval(function () { renderUpcoming(); syncWidgetData(); }, 60000);
  setInterval(function () { loadHolidays(detectCountry()); }, 6 * 3600 * 1000);
  requestAnimationFrame(sweepLoop);

  showTab('home');
  measureUpcoming();
  readRingParam();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
