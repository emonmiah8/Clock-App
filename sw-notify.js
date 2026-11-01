/* sw-notify.js
   sw.js এর একদম প্রথম লাইনে এটি যোগ করুন:   importScripts('sw-notify.js');
   Notification এর Snooze / Stop / Restart বাটন চাপলে অ্যাপে খবর পাঠায়
   (অ্যাপ বন্ধ থাকলে অ্যাপ খুলে সেই কাজ করে)। */
self.addEventListener('notificationclick', function (e) {
  var d = e.notification.data || {};
  var action = e.action || '';
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    var msg = { type: 'ring-action', action: action, kind: d.kind || 'alarm', id: d.id || '' };
    if (list.length) {
      list[0].postMessage(msg);
      return list[0].focus();
    }
    return self.clients.openWindow('./?ring=' + (action || 'open') + '&kind=' + encodeURIComponent(msg.kind) + '&id=' + encodeURIComponent(msg.id));
  }));
});
