/* Postline PWA service worker — cache leve de assets estáticos + navegação offline. */
const VERSION = "postline-v2";
const STATIC_CACHE = `${VERSION}-static`;
const PRECACHE = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/badge-96.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/postline-logo.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ----------------------------- Web Push ---------------------------------- */

self.addEventListener("push", (event) => {
  // Um push sem payload ainda precisa virar notificação: no iOS, receber um
  // push e não chamar showNotification faz o Safari revogar a permissão.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Postline";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      // Ícone colorido, mostrado ao lado do texto (Android/desktop).
      icon: "/icons/icon-192.png",
      // Badge é a marca na barra de status e o sistema o trata como máscara de
      // alfa — só a silhueta sobrevive. Precisa ser o PNG transparente; usar o
      // icon-192, que é opaco inteiro, produziria um quadrado sólido.
      badge: "/icons/badge-96.png",
      // Agrupa por destino: dois avisos do mesmo post substituem um ao outro em
      // vez de empilhar. `renotify` garante alerta mesmo na substituição.
      tag: data.url || "postline",
      renotify: true,
      lang: "pt-BR",
      dir: "ltr",
      timestamp: Date.now(),
      data: { url: data.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Reaproveita uma janela aberta do app — abrir outra deixaria o usuário
      // com duas instâncias do PWA.
      for (const client of list) {
        if (client.url.startsWith(self.location.origin)) {
          return client.focus().then((c) => (c && c.navigate ? c.navigate(target) : c));
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Nunca cachear API/auth — sempre rede.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Navegações: network-first com fallback ao cache (offline).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/dashboard")))
    );
    return;
  }

  // Assets estáticos: stale-while-revalidate.
  if (["style", "script", "image", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy)).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
