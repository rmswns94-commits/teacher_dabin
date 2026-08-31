/*
 * 다빈이의 강사일기 — 보수적인 Service Worker
 *
 * 보안 정책 (절대 변경 금지):
 *  - HTML, Supabase 응답, 서버 액션 응답, 개인 데이터는 어떤 것도 캐시하지 않는다.
 *  - 캐시 대상은 오직: 해시된 정적 번들(/_next/static/), 앱 아이콘(/icons/), 오프라인 안내 페이지.
 *  - 페이지 이동(navigate)은 항상 네트워크로 가고, 실패했을 때만 일반 오프라인 안내를 보여준다.
 */

const CACHE_VERSION = "dabin-static-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    // Supabase 등 외부 요청은 절대 건드리지 않는다.
    return;
  }

  // 페이지 이동: 네트워크 우선, 오프라인일 때만 일반 안내 페이지.
  // 응답을 캐시에 저장하지 않는다 (로그인 사용자 HTML이 기기에 남으면 안 됨).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(
          (cached) =>
            cached ??
            new Response("인터넷 연결을 확인해주세요.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            }),
        ),
      ),
    );
    return;
  }

  // 콘텐츠 해시가 붙은 정적 번들과 아이콘만 cache-first.
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");

  if (!isStaticAsset) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
