/* Widget designs: shared by the app (main.js) and the phone home screen widgets (widget.html). */
const FONT57 = {
  '0': '01110 10001 10011 10101 11001 10001 01110', '1': '00100 01100 00100 00100 00100 00100 01110',
  '2': '01110 10001 00001 00010 00100 01000 11111', '3': '11110 00001 00001 01110 00001 00001 11110',
  '4': '00010 00110 01010 10010 11111 00010 00010', '5': '11111 10000 11110 00001 00001 10001 01110',
  '6': '00110 01000 10000 11110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000',
  '8': '01110 10001 10001 01110 10001 10001 01110', '9': '01110 10001 10001 01111 00001 00010 01100'
};
const BLOB = 'M32 6H68C80 6 84 16 86 26C87 32 94 36 94 50C94 64 87 68 86 74C84 84 80 94 68 94H32C20 94 16 84 14 74C13 68 6 64 6 50C6 36 13 32 14 26C16 16 20 6 32 6Z';
const SERIF = "font-family:'Playfair Display',Georgia,serif!important;";
const FLEXC = 'display:flex;align-items:center;justify-content:center;';
let agMemo = { k: '', list: [] };

function wh(n) { const h = n.getHours(); return pad(globalSet.wgFmt === '12' ? (h % 12) || 12 : h); }
function wd(n, o) { return n.toLocaleDateString('en-GB', o); }
function pol(a, r, cx, cy) {
  const t = a * Math.PI / 180;
  return [+((cx == null ? 100 : cx) + r * Math.sin(t)).toFixed(1), +((cy == null ? 100 : cy) - r * Math.cos(t)).toFixed(1)];
}
function ln(x1, y1, x2, y2, col, w) {
  return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"/>';
}
function hand(a, tail, len, w, col, cx, cy) {
  const p = pol(a, len, cx, cy), q = pol(a, -tail, cx, cy);
  return ln(q[0], q[1], p[0], p[1], col, w);
}
function ang(n) {
  const s = n.getSeconds(), m = n.getMinutes() + s / 60, h = (n.getHours() % 12) + m / 60;
  return { h: h * 30, m: m * 6, s: s * 6 };
}
function mix(a, b, t) {
  const p = function (s) { return [1, 3, 5].map(function (i) { return parseInt(s.substr(i, 2), 16); }); };
  const x = p(a), y = p(b);
  return 'rgb(' + x.map(function (v, i) { return Math.round(v + (y[i] - v) * t); }).join(',') + ')';
}

// 5x7 pixel text as squares or dots, with an optional colour gradient
function matrix(str, square, c1, c2) {
  const ch = str.split('');
  const W = ch.reduce(function (w, c) { return w + (c === ':' ? 2 : 6); }, -1);
  let x = 0, o = '';
  function cell(cx, r) {
    const f = c2 ? mix(c1, c2, (cx + 0.5) / W) : c1;
    o += square
      ? '<rect x="' + (cx + 0.07) + '" y="' + (r + 0.07) + '" width=".86" height=".86" rx=".14" fill="' + f + '"/>'
      : '<circle cx="' + (cx + 0.5) + '" cy="' + (r + 0.5) + '" r=".42" fill="' + f + '"/>';
  }
  ch.forEach(function (c) {
    if (c === ':') { cell(x, 2); cell(x, 4); x += 2; return; }
    FONT57[c].split(' ').forEach(function (row, r) {
      for (let i = 0; i < 5; i++) if (row.charAt(i) === '1') cell(x + i, r);
    });
    x += 6;
  });
  return '<svg viewBox="0 0 ' + W + ' 7" style="width:84%">' + o + '</svg>';
}

function ray(a, f1, f2, col, w) {
  const t = a * Math.PI / 180, dx = Math.sin(t), dy = -Math.cos(t);
  const T = Math.min(dx ? 88 / Math.abs(dx) : 1e9, dy ? 40 / Math.abs(dy) : 1e9);
  return ln((100 + dx * T * f1).toFixed(1), (50 + dy * T * f1).toFixed(1), (100 + dx * T * f2).toFixed(1), (50 + dy * T * f2).toFixed(1), col, w);
}

function blobSv(txt) {
  return '<svg viewBox="0 0 100 100" style="width:34cqmin;height:34cqmin"><path d="' + BLOB + '" fill="#c6f56b"/>' +
    '<text x="50" y="65" text-anchor="middle" font-size="44" fill="#111">' + txt + '</text></svg>';
}

function calHtml(n) {
  const y = n.getFullYear(), m = n.getMonth();
  const first = new Date(y, m, 1).getDay(), dim = new Date(y, m + 1, 0).getDate(), prev = new Date(y, m, 0).getDate();
  const rows = Math.ceil((first + dim) / 7) * 7;
  let cells = '';
  for (let i = 0; i < rows; i++) {
    const d = i - first + 1;
    if (d < 1) cells += '<span style="opacity:.35">' + (prev + d) + '</span>';
    else if (d > dim) cells += '<span style="opacity:.35">' + (d - dim) + '</span>';
    else cells += '<span' + (d === n.getDate() ? ' style="background:#ff3b30;border-radius:50%"' : '') + '>' + d + '</span>';
  }
  return '<div style="background:#000;border-radius:9cqmin;padding:5cqmin;width:82cqmin">' +
    '<div style="display:flex;justify-content:space-between;font-size:6.4cqmin;margin-bottom:2cqmin"><span style="color:#ff3b30">' +
    wd(n, { month: 'long' }).toUpperCase() + '</span><span>' + y + '</span></div>' +
    '<div class="wcg">' + 'SMTWTFS'.split('').map(function (x) { return '<i>' + x + '</i>'; }).join('') + cells + '</div></div>';
}

function agendaHtml(n) {
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const k = dayKey(today) + detectCountry();
  if (agMemo.k !== k) agMemo = { k: k, list: getUpcoming(today) };
  const l = agMemo.list;
  const e = l[0];
  const more = l.filter(function (x) { return x.diff <= 30; }).length - 1;
  let ev = '<div style="font-size:6.4cqmin;opacity:.6">No upcoming dates</div>';
  if (e) {
    ev = '<div style="border-left:1.2cqmin solid #9a7ad8;background:rgba(154,122,216,.2);border-radius:2.4cqmin;padding:2.4cqmin 3.4cqmin">' +
      '<div style="font-size:6.6cqmin;line-height:1.2">' + esc(e.n) + '</div><div style="font-size:5cqmin;opacity:.65;margin-top:.6cqmin">' +
      (e.diff === 0 ? 'Today' : e.diff === 1 ? 'Tomorrow' : 'In ' + e.diff + ' days') + '</div></div>' +
      (more > 0 ? '<div style="margin-top:2.6cqmin;font-size:5.4cqmin;color:#b79bea">' + more + ' more event' + (more > 1 ? 's' : '') + '</div>' : '');
  }
  return '<div style="background:#0c0d10;border-radius:10cqmin;padding:7cqmin 6cqmin;width:80cqmin">' +
    '<div style="font-size:6.2cqmin;letter-spacing:.06em;color:#c9bdf0">' + wd(n, { weekday: 'long' }).toUpperCase() + '</div>' +
    '<div style="font-size:15cqmin;line-height:1;margin:1cqmin 0 3.4cqmin">' + n.getDate() + '</div>' + ev + '</div>';
}

const WG = [
  { id: 'blob', n: 'Blob', h: function (n) {
    return '<div class="wcol"><div class="wrow" style="gap:4cqmin">' + blobSv(wh(n)) +
      '<div style="' + FLEXC + 'width:34cqmin;height:34cqmin;border:1.3cqmin solid #c6f56b;border-radius:9cqmin;font-size:15cqmin">' + pad(n.getMinutes()) + '</div></div>' +
      '<div style="margin-top:5cqmin;font-size:5.6cqmin;letter-spacing:.04em">' + wd(n, { weekday: 'long' }).toUpperCase() + ' \u2022 ' +
      wd(n, { day: '2-digit', month: 'short' }).toUpperCase() + '</div></div>';
  } },
  { id: 'quad', n: 'Quad', h: function (n) {
    const c = FLEXC + 'width:31cqmin;height:31cqmin;font-size:15cqmin;';
    return '<div style="display:grid;grid-template-columns:auto auto;gap:3cqmin">' +
      '<div style="' + c + 'background:#ececec;color:#333;border-radius:50%/58% 58% 42% 42%">' + wh(n) + '</div>' +
      '<div style="' + c + 'border:1.2cqmin solid #ddd;border-radius:9cqmin">' + pad(n.getMinutes()) + '</div>' +
      '<div style="' + c + 'background:#000;color:#aaa;border-radius:50%">' + pad(n.getSeconds()) + '</div>' +
      '<div style="' + c + 'background:#000;color:#bbb;font-size:11cqmin;border-radius:36% 64% 64% 36%/36% 36% 64% 64%">' +
      wd(n, { weekday: 'short' }).toUpperCase() + '</div></div>';
  } },
  { id: 'brush', n: 'Brush', w2: 1, h: function (n) {
    const A = 'position:absolute;line-height:1;white-space:nowrap;';
    return "<div style=\"position:relative;width:100%;height:100%;font-family:'Permanent Marker','Poppins',cursive!important\">" +
      '<div style="' + A + 'left:22%;top:5%;font-size:58cqmin;color:#d9f66f">' + wh(n) + '</div>' +
      '<div style="' + A + 'left:43%;top:27%;font-size:58cqmin;color:#d9f66f">' + pad(n.getMinutes()) + '</div>' +
      '<div style="' + A + 'left:60%;top:9%;font-size:15cqmin;color:#fbf3e6">' + wd(n, { month: 'long' }).toUpperCase() + '</div>' +
      '<div style="' + A + FLEXC + 'left:79%;top:30%;width:22cqmin;height:22cqmin;border-radius:50%;background:#fbf3e6;color:#111;font-size:13cqmin">' + n.getDate() + '</div>' +
      '<div style="' + A + 'left:7%;top:57%;font-size:7cqmin;color:#fbf3e6">TODAY IS</div>' +
      '<div style="' + A + 'left:6%;top:66%;font-size:12cqmin;color:#111;background:#fbf3e6;border-radius:9cqmin;padding:1.6cqmin 5cqmin;transform:rotate(-4deg)">' +
      wd(n, { weekday: 'long' }).toUpperCase() + '</div></div>';
  } },
  { id: 'outline', n: 'Outline', h: function (n) {
    const cols = ['#ffffff', '#c9d1d5'];
    let i = 0;
    return '<div style="font-size:27cqmin;letter-spacing:-.02em;-webkit-text-stroke:.9cqmin #6c7378;paint-order:stroke fill">' +
      (wh(n) + ':' + pad(n.getMinutes())).split('').map(function (c) {
        return '<span style="color:' + (c === ':' ? cols[1] : cols[i++ % 2]) + '">' + c + '</span>';
      }).join('') + '</div>';
  } },
  { id: 'serif', n: 'Serif split', h: function (n) {
    return '<div class="wcol" style="' + SERIF + '"><div class="wrow" style="gap:3cqmin;font-size:30cqmin;line-height:1;color:#eaf6ff">' +
      '<span>' + wh(n) + '</span><span style="width:.7cqmin;height:22cqmin;background:#778"></span><span>' + pad(n.getMinutes()) + '</span></div>' +
      '<div style="margin-top:4cqmin;font-size:6cqmin;font-family:var(--sf)!important">' + wd(n, { day: 'numeric', month: 'short' }) + ', ' + wd(n, { weekday: 'long' }) + '</div></div>';
  } },
  { id: 'dial1', n: 'Black dial', h: function (n) {
    const a = ang(n);
    let w = '';
    [1, 2, 4, 5, 7, 8, 10, 11].forEach(function (k) {
      w += '<polygon points="' + [pol(k * 30 - 5, 92), pol(k * 30 + 5, 92), pol(k * 30, 70)].map(function (p) { return p.join(','); }).join(' ') + '" fill="#eee"/>';
    });
    return '<svg viewBox="0 0 200 200" style="width:86cqmin"><circle cx="100" cy="100" r="98" fill="#000"/>' + w +
      '<g fill="#eee" font-size="40" text-anchor="middle"><text x="100" y="52">0</text><text x="156" y="114">3</text><text x="100" y="178">6</text><text x="44" y="114">9</text></g>' +
      hand(a.h, 8, 48, 11, '#dcdcdc') + hand(a.h, 8, 45, 5, '#000') + hand(a.m, 8, 76, 9, '#dcdcdc') + hand(a.m, 8, 73, 3.4, '#000') +
      hand(a.s, 16, 82, 1.6, '#aaa') + '<circle cx="100" cy="100" r="6" fill="#bbb"/></svg>';
  } },
  { id: 'dial2', n: 'White dial', h: function (n) {
    const a = ang(n);
    let r = '', t = '';
    for (let k = 0; k < 12; k++) { const p = pol(k * 30, 24), q = pol(k * 30, 98); r += ln(p[0], p[1], q[0], q[1], '#888', 0.8); }
    [[12, 0], [2, 60], [4, 120], [6, 180], [8, 240], [10, 300]].forEach(function (x) {
      const p = pol(x[1], 68);
      const rot = (x[1] === 0 || x[1] === 180) ? 0 : (x[1] > 90 && x[1] < 270 ? x[1] - 180 : x[1]);
      t += '<text x="' + p[0] + '" y="' + (p[1] + 11) + '" transform="rotate(' + rot + ' ' + p[0] + ' ' + p[1] + ')">' + x[0] + '</text>';
    });
    return '<svg viewBox="0 0 200 200" style="width:86cqmin"><circle cx="100" cy="100" r="98" fill="#e9e9ec"/>' + r +
      '<g fill="#161616" font-size="32" text-anchor="middle">' + t + '</g>' +
      hand(a.h, 8, 46, 6, '#1a1a1a') + hand(a.m, 8, 78, 4, '#1a1a1a') + hand(a.s, 18, 88, 1.4, '#1a1a1a') +
      '<circle cx="100" cy="100" r="4.5" fill="#1a1a1a"/></svg>';
  } },
  { id: 'stack', n: 'Stack', h: function (n) {
    const h = wh(n), m = pad(n.getMinutes()), d = [h[0], h[1], m[0], m[1]], c = ['#ffffff', '#e6c8ee', '#cbbcf2', '#ffffff'];
    const cell = function (i) { return '<span style="color:' + c[i] + '">' + d[i] + '</span>'; };
    return '<div style="font-size:47cqmin;line-height:.8;letter-spacing:-.04em;text-align:center;-webkit-text-stroke:.9cqmin #555;paint-order:stroke fill">' +
      '<div>' + cell(0) + cell(1) + '</div><div>' + cell(2) + cell(3) + '</div></div>';
  } },
  { id: 'dial3', n: 'Purple dial', h: function (n) {
    const a = ang(n);
    let t = '';
    for (let k = 0; k < 12; k++) {
      if (k % 3 === 0) continue;
      const p = pol(k * 30, 80), q = pol(k * 30, 96);
      t += ln(p[0], p[1], q[0], q[1], '#b6f46f', 5);
    }
    return '<svg viewBox="0 0 200 200" style="width:86cqmin"><circle cx="100" cy="100" r="98" fill="#3f2397"/>' + t +
      '<g fill="#b6f46f" font-size="40" text-anchor="middle"><text x="100" y="52">12</text><text x="44" y="114">9</text><text x="100" y="178">6</text></g>' +
      '<rect x="134" y="87" width="38" height="26" rx="4" fill="none" stroke="#fff" stroke-width="2"/>' +
      '<text x="153" y="107" font-size="20" fill="#fff" text-anchor="middle">' + n.getDate() + '</text>' +
      hand(a.h, 8, 56, 14, '#b6f46f') + hand(a.m, 10, 84, 3.4, '#fff') + hand(a.s, 16, 86, 1.2, '#8fb27c') +
      '<circle cx="100" cy="100" r="5" fill="#3f2397"/></svg>';
  } },
  { id: 'serifdate', n: 'Serif date', h: function (n) {
    return '<div class="wcol" style="' + SERIF + '"><div style="font-size:6.6cqmin;color:#cfd3f5;font-family:var(--sf)!important">' +
      wd(n, { weekday: 'long' }) + ', ' + wd(n, { day: '2-digit', month: 'long' }) + '</div>' +
      '<div style="font-size:31cqmin;line-height:1.1;color:#d4d8ff">' + wh(n) + ':' + pad(n.getMinutes()) + '</div></div>';
  } },
  { id: 'pixel', n: 'Pixel', h: function (n) {
    return '<div class="wcol"><div style="margin-bottom:4cqmin;font-size:4.6cqmin;letter-spacing:.2em;opacity:.85">' +
      wd(n, { day: '2-digit', month: 'short' }).toUpperCase() + ', ' + wd(n, { weekday: 'long' }).toUpperCase() + '</div>' +
      matrix(wh(n) + ':' + pad(n.getMinutes()), 1, '#f5b5e3', '#a9c9ff') + '</div>';
  } },
  { id: 'wide', n: 'Wide dial', w2: 1, h: function (n) {
    const a = ang(n);
    let r = '';
    for (let i = 0; i < 60; i++) if (i % 5) r += ray(i * 6, 0.9, 0.96, '#5a5a5a', 0.6);
    for (let k = 0; k < 12; k++) if (k % 3) r += ray(k * 30, 0.5, 0.94, '#fff', 1.5);
    return '<svg viewBox="0 0 200 100" style="width:94%"><rect x="2" y="2" width="196" height="96" rx="44" fill="#000"/>' + r +
      '<g fill="#e5483f" font-size="19" text-anchor="middle"><text x="100" y="33">12</text><text x="100" y="80">6</text><text x="30" y="57">9</text><text x="172" y="57">3</text></g>' +
      '<text x="126" y="55" font-size="9.5" fill="#fff"><tspan fill="#e5483f">' + wd(n, { weekday: 'short' }).toUpperCase() + '</tspan> ' + n.getDate() + '</text>' +
      hand(a.h, 0, 28, 5.5, '#fff', 100, 50) + hand(a.m, 0, 40, 5.5, '#fff', 100, 50) + hand(a.s, 10, 44, 1.5, '#e5483f', 100, 50) +
      '<circle cx="100" cy="50" r="3" fill="#000" stroke="#e5483f" stroke-width="1"/></svg>';
  } },
  { id: 'cal', n: 'Month calendar', h: calHtml },
  { id: 'agenda', n: 'Agenda', h: agendaHtml },
  { id: 'geo', n: 'Geometric', h: function (n) {
    const h = wh(n), m = pad(n.getMinutes()), d = [h[0], h[1], m[0], m[1]];
    const cell = function (c) {
      const k = (+c) % 4, cx = [12, 38, 12, 38][k], cy = [12, 12, 38, 38][k];
      return '<svg viewBox="0 0 50 50" style="width:100%"><rect x="2" y="2" width="46" height="46" rx="3" fill="none" stroke="#f0b8cc" stroke-width="1.6"/>' +
        '<path d="M25 2V48M2 25H48" stroke="#f0b8cc" stroke-width="1.1" fill="none"/>' +
        '<text x="25" y="37" text-anchor="middle" font-size="34" fill="none" stroke="#f0b8cc" stroke-width="1.5">' + c + '</text>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="#9ed49a"/></svg>';
    };
    return '<div style="display:grid;grid-template-columns:1fr 1fr;width:62cqmin;gap:1cqmin">' + d.map(cell).join('') + '</div>';
  } },
  { id: 'dot', n: 'Dot matrix', h: function (n) {
    return '<div class="wcol">' + matrix(wh(n) + ':' + pad(n.getMinutes()), 0, '#ffffff') +
      '<div style="margin-top:3cqmin;align-self:flex-start;margin-left:8%;font-size:5cqmin;letter-spacing:.14em;opacity:.7">' +
      wd(n, { weekday: 'short' }).toUpperCase() + ', ' + wd(n, { day: '2-digit', month: 'short' }).toUpperCase() + '</div></div>';
  } },
  { id: 'ios', n: 'Date card', h: function (n) {
    return '<div style="' + FLEXC + 'flex-direction:column;background:#fff;color:#000;width:74cqmin;height:74cqmin;border-radius:17cqmin">' +
      '<div style="font-size:11cqmin"><span style="color:#ff3b30">' + wd(n, { weekday: 'short' }) + '</span> <span style="color:#8e8e93">' + wd(n, { month: 'short' }) + '</span></div>' +
      '<div style="font-size:42cqmin;line-height:1">' + n.getDate() + '</div></div>';
  } },
  { id: 'ios2', n: 'Serif card', h: function (n) {
    return '<div style="position:relative;' + FLEXC + 'background:#fff;color:#000;width:74cqmin;height:74cqmin;border-radius:17cqmin;' + SERIF + '">' +
      '<span style="position:absolute;top:7cqmin;right:9cqmin;font-size:9cqmin;color:#ff3b30">' + wd(n, { weekday: 'short' }) + '</span>' +
      '<span style="font-size:52cqmin;line-height:1;margin-top:5cqmin">' + pad(n.getDate()) + '</span></div>';
  } }
];
const WGM = {};
WG.forEach(function (d) { WGM[d.id] = d; });
