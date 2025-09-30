var CACHE = 'lvp-cache-1';

self.addEventListener('install', event => {
    event.waitUntil(precache());
});

self.addEventListener('fetch', event => {
    event.respondWith(fromCache(event.request));
    event.waitUntil(update(event.request));
});

function precache() {
    return caches.open(CACHE).then(cache => {
        return cache.addAll([
            "./LocalVideoPlayer.html",
            "./lvp.css",
            "./lvp.js",
            "./indexeddb.js",
            "./sw.js",
            "./LVP.png",
            "./manifest.json",
            "./favicon.ico",
        ]);
    });
}

function fromCache(request) {
    return caches.open(CACHE).then(cache => {
        return cache.match(request).then(matching => {
            return matching || Promise.reject('no-match');
        });
    });
}

function update(request) {
    return caches.open(CACHE).then(cache => {
        return fetch(request).then(response => {
            return cache.put(request, response);
        });
    });
}
