import { promises as fs } from "fs";
import path from "path";

async function collectFiles(dirPath, rootPath = dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, rootPath));
      continue;
    }

    const relativePath = path.relative(rootPath, absolutePath).replace(/\\/g, "/");
    files.push(`/${relativePath}`);
  }

  return files;
}

function buildServiceWorkerSource(precacheUrls, cacheName) {
  return `const CACHE_NAME = ${JSON.stringify(cacheName)};
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};

async function precacheAppShell(cache, urls) {
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(\`Falha ao precarregar \${url}: \${response.status}\`);
      }

      const contentType = response.headers.get("content-type") || "";
      const expectsHtml = url === "/" || url.endsWith(".html");
      if (!expectsHtml && contentType.includes("text/html")) {
        throw new Error(\`Resposta HTML inesperada ao precarregar \${url}\`);
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
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => precacheAppShell(cache, PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
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
        .catch(() => caches.match("/") || caches.match("/index.html")),
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
`;
}

export default function GeneratePwaServiceWorkerPlugin() {
  return {
    name: "generate-pwa-service-worker",
    closeBundle: async () => {
      try {
        const distPath = path.resolve("dist");
        const assetsPath = path.join(distPath, "assets");
        const assetFiles = await fs.access(assetsPath).then(() => collectFiles(assetsPath, distPath)).catch(() => []);
        const staticFiles = ["/", "/index.html", "/manifest.json", "/logo.png", "/routes.json"];
        const precacheUrls = Array.from(new Set([...staticFiles, ...assetFiles]));
        const cacheName = `checklist-aldo-${Date.now()}`;
        const swSource = buildServiceWorkerSource(precacheUrls, cacheName);

        await fs.writeFile(path.join(distPath, "sw.js"), swSource, "utf8");
        console.log("sw.js gerado com precache automatico.");
      } catch (error) {
        console.error("Erro ao gerar sw.js da PWA:", error);
      }
    },
  };
}
