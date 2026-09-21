// Service worker de Shakespeare Academy : permet d'installer l'application et de l'ouvrir sans Internet.
//
// - Fichiers statiques (`/_next/static`, icônes) : servis depuis le cache d'abord (leurs noms changent
//   à chaque version, jamais de contenu périmé).
// - Pages (HTML) et données de navigation de Next.js (RSC) : le réseau d'abord, la dernière copie
//   si le réseau échoue ou met trop longtemps à répondre (réseau lent = cas courant).
// - Les appels à l'API (autre adresse) ne passent JAMAIS par ici : leur copie est gérée par
//   l'application (lib/api.ts), par utilisateur, et effacée à la déconnexion.

const STATIC_CACHE = "sa-static-v1";
const PAGES_CACHE = "sa-pages-v1";
const OFFLINE_URL = "/offline.html";
const SLOW_NETWORK_MS = 3500;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== PAGES_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function pageKey(rawUrl, isRsc) {
  const url = new URL(rawUrl);
  url.searchParams.delete("_rsc");
  url.hash = "";
  if (isRsc) url.searchParams.set("__sa_rsc", "1");
  return new Request(url.toString());
}

function isRscRequest(request, url) {
  return request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function offlineFallback(request) {
  if (request.mode === "navigate") {
    const cache = await caches.open(PAGES_CACHE);
    const page = await cache.match(OFFLINE_URL);
    if (page) return page;
  }
  return Response.error();
}

async function networkFirst(request, isRsc) {
  const cache = await caches.open(PAGES_CACHE);
  const key = pageKey(request.url, isRsc);
  const cached = await cache.match(key, { ignoreVary: true });

  const network = fetch(request)
    .then((response) => {
      // Une réponse issue d'une redirection ne peut pas servir une navigation : on ne la copie pas.
      if (response.ok && !response.redirected) cache.put(key, response.clone());
      return response;
    })
    .catch(() => null);

  if (!cached) {
    const response = await network;
    return response || offlineFallback(request);
  }
  const winner = await Promise.race([network, sleep(SLOW_NETWORK_MS).then(() => null)]);
  return winner || cached;
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/api/")) return;

  const rsc = isRscRequest(request, url);
  if (request.mode === "navigate" || rsc) {
    event.respondWith(networkFirst(request, rsc));
  }
});

// Alertes push du portail parents (Lot 12). Le contenu est générique par construction (prénom de l'enfant
// et renvoi vers l'application) : jamais de motif, de note ni de montant sur un écran verrouillé.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Shakespeare Academy";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/parents/notifications";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      tag: data.tag || undefined,
      // Une alerte de même étiquette en remplace une autre : on refait vibrer plutôt que d'échouer en silence.
      renotify: Boolean(data.tag),
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/parents/notifications", self.location.origin).toString();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// Copie anticipée de pages (appelée par l'application après la connexion) : sans elle, une page
// jamais ouverte n'existerait pas hors ligne.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "precache" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES_CACHE);
      for (const path of data.urls) {
        try {
          const absolute = new URL(path, self.location.origin).toString();
          const html = await fetch(absolute, { headers: { Accept: "text/html" }, credentials: "same-origin", redirect: "manual" });
          if (html.ok) await cache.put(pageKey(absolute, false), html);
          const rsc = await fetch(absolute, { headers: { RSC: "1" }, credentials: "same-origin", redirect: "manual" });
          if (rsc.ok) await cache.put(pageKey(absolute, true), rsc);
        } catch {
          // page indisponible pour l'instant : la prochaine préparation réessaiera
        }
      }
    })(),
  );
});
