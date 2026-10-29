/* ==========================================================================
   CLOCK APP - sw.js
   - অফলাইনে পুরো অ্যাপ চলে (App Shell precache)
   - পেজ: network-first (৩.৫ সেকেন্ড টাইমআউট), না পেলে cache
   - নিজের ফাইল: stale-while-revalidate (আগে cache, পেছনে আপডেট)
   - Google Fonts: আলাদা cache, অফলাইনে কাজ করে
   - API (holidays, geocoding...) ছোঁয়া হয় না: main.js নিজেই localStorage এ রাখে
   - নতুন ভার্সন এলে নিজে থেকে চালু হয় না; main.js এর "Reload" বাটনে চাপলে SKIP_WAITING আসে
   - অ্যালার্ম/টাইমারের notification এ চাপলে অ্যাপ খোলে
   ========================================================================== */

// ফাইল বদলালে শুধু এই নম্বরটা বাড়ান (v1 -> v2), তাহলে ইউজার "A new version is ready" দেখবে
const VERSION = 'v2';
const SHELL_CACHE = 'clock-shell-' + VERSION1;
const RUNTIME_CACHE = 'clock-runtime-v1';          // ফন্ট: ভার্সন বদলালেও থাকে
const KEEP = [SHELL_CACHE, RUNTIME_CACHE];

const NAV_TIMEOUT = 3500;                          // ইন্টারনেট ধীর হলে এর পরে cache থেকে খুলবে
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// আপনার প্রজেক্টের ফাইল অনুযায়ী মিলিয়ে নিন। কোনো ফাইল না থাকলে install ভাঙবে না, শুধু বাদ যাবে।
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './digits.ttf',
  './css/style.css',
  './js/main.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* ---------- install: সব ফাইল আগেই cache এ রাখা ---------- */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return Promise.all(SHELL_FILES.map(function (f) {
        // cache:'reload' = browser এর পুরনো HTTP cache না নিয়ে সরাসরি নতুন ফাইল
        return fetch(new Request(f, { cache: 'reload' }))
          .then(function (res) { if (res && res.ok) return cache.put(f, res); })
          .catch(function () {});
      }));
    })
  );
  // ইচ্ছা করেই skipWaiting() নেই: ইউজার "Reload" চাপলে তবেই নতুন ভার্সন চালু হবে
});

/* ---------- activate: পুরনো cache মুছে ফেলা ---------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf('clock-') === 0 && KEEP.indexOf(k) === -1) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* ---------- main.js থেকে বার্তা ---------- */
self.addEventListener('message', function (event) {
  const d = event.data;
  if (d === 'SKIP_WAITING' || (d && d.type === 'SKIP_WAITING')) self.skipWaiting();
});

/* ---------- fetch ---------- */
self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // নিজের সাইট
  if (url.origin === self.location.origin) {
    if (url.pathname.slice(-6) === 'sw.js') return;            // sw.js কখনো cache হবে না
    if (req.mode === 'navigate') {
      event.respondWith(navigate(req));
    } else {
      event.respondWith(staleWhileRevalidate(event, SHELL_CACHE, true));
    }
    return;
  }

  // Google Fonts
  if (FONT_HOSTS.indexOf(url.hostname) > -1) {
    event.respondWith(staleWhileRevalidate(event, RUNTIME_CACHE, false));
    return;
  }

  // বাকি সব (API ইত্যাদি) সরাসরি নেটওয়ার্কে যাবে, main.js নিজে timeout/retry সামলায়
});

/* ---------- পেজ খোলা: network-first, টাইমআউটে cache ---------- */
function navigate(req) {
  return new Promise(function (resolve) {
    let done = false;

    function fromCache() {
      return caches.match(req, { ignoreSearch: true })
        .then(function (r) { return r || caches.match('./index.html'); })
        .then(function (r) { return r || caches.match('./'); })
        .then(function (r) { return r || offlinePage(); });
    }
    function finish(res) { if (!done) { done = true; resolve(res); } }

    const timer = setTimeout(function () {
      fromCache().then(function (r) {
        // cache এ কিছু থাকলে তবেই টাইমআউটে সেটা দেখাই, নইলে নেটওয়ার্কের জন্য অপেক্ষা
        if (r && r.status !== 503) finish(r);
      });
    }, NAV_TIMEOUT);

    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then(function (c) { c.put('./index.html', copy); });
        finish(res);
      } else {
        fromCache().then(function (r) { finish(r.status === 503 ? res : r); });
      }
    }).catch(function () {
      clearTimeout(timer);
      fromCache().then(finish);
    });
  });
}

/* ---------- stale-while-revalidate ---------- */
function staleWhileRevalidate(event, cacheName, sameOrigin) {
  const req = event.request;
  return caches.open(cacheName).then(function (cache) {
    return cache.match(req, { ignoreSearch: sameOrigin }).then(function (cached) {
      const network = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(function () { return null; });

      if (cached) {
        event.waitUntil(network);                 // পেছনে নীরবে আপডেট
        return cached;
      }
      return network.then(function (res) {
        return res || new Response('', { status: 504, statusText: 'Offline' });
      });
    });
  });
}

function offlinePage() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Offline</title><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;' +
    'background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center">' +
    '<div><h2>Offline</h2><p>Open the app once with internet, then it works offline.</p></div></body>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/* ---------- notification এ চাপলে অ্যাপ খোলা ---------- */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (let i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow(self.registration.scope);
    })
  );
});
