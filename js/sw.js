const CACHE_NAME = 'clock-app-v1';

// যেসব ফাইল অফলাইনে চালানোর জন্য ক্যাশ (Cache) করতে হবে
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './main.js',
  './manifest.json',
  './digits.ttf', // আপনার কাস্টম ফন্ট ফাইল
  'https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&display=swap'
];

// ১. ইনস্টল ইভেন্ট: সব প্রয়োজনীয় ফাইল ক্যাশে জমা করা
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching essential assets for offline use...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// ২. অ্যাক্টিভেট ইভেন্ট: পুরোনো ক্যাশ মুছে ফেলা
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ৩. ফেচ ইভেন্ট: ইন্টারনেট না থাকলে ক্যাশ থেকে ফাইল নিয়ে অ্যাপ চালানো
self.addEventListener('fetch', (event) => {
  //API কল (যেমন Open-Meteo বা BigDataCloud) ছাড়া বাকি সব লোকাল ফাইলের জন্য ক্যাশ ব্যবহার হবে
  if (event.request.url.includes('geocoding-api') || event.request.url.includes('bigdatacloud')) {
    return; // অনলাইন এপিআই রিকোয়েস্টে ক্যাশ এড়ানো
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse; // ক্যাশে ফাইল পাওয়া গেলে অফলাইনে সেটাই দেখাবে
      }
      return fetch(event.request).catch(() => {
        // অফলাইনে ব্যাকআপ পেজ বা রেসপন্স
      });
    })
  );
});

// ৪. স্কিপ ওয়েটিং মেসেজ হ্যান্ডলিং
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
