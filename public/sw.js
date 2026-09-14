const CACHE_NAME = "macro-rh-dp-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/logo.png", "/routes.json"];
const IS_LOCALHOST = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

function clearLegacyCaches() {
  return caches.keys().then((keys) =>
    Promise.all(keys.filter((key) => key.startsWith("checklist-aldo")).map((key) => caches.delete(key))),
  );
}

async function precacheAppShell(cache, urls) {
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`Falha ao precarregar ${url}: ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";
      const expectsHtml = url === "/" || url.endsWith(".html");
      if (!expectsHtml && contentType.includes("text/html")) {
        throw new Error(`Resposta HTML inesperada ao precarregar ${url}`);
      }

      await cache.put(url, response);
    }),
  );

  return results;
}

function isApiRequest(requestUrl) {
  return requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/");
}

self.addEventListener("install", (event) => {
  if (IS_LOCALHOST) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => precacheAppShell(cache, APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  if (IS_LOCALHOST) {
    event.waitUntil(
      clearLegacyCaches()
        .then(() => self.registration.unregister())
        .then(() => self.clients.claim()),
    );
    return;
  }

  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (IS_LOCALHOST) return;

  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (isApiRequest(requestUrl)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", cloned));
          return response;
        })
        .catch(() => caches.match("/") || caches.match(event.request)),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }

        const contentType = networkResponse.headers.get("content-type") || "";
        const expectsHtml = requestUrl.pathname === "/" || requestUrl.pathname.endsWith(".html");
        if (!expectsHtml && contentType.includes("text/html")) {
          return networkResponse;
        }

        const cloned = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        return networkResponse;
      });
    }),
  );
});
