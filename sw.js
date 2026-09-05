/* ════════════════════════════════════════════════════════════
   Service Worker — 오프라인 캐시

   목적
     예식장 지하 주차장·로비처럼 통신이 약한 곳에서도 청첩장이 열리도록
     HTML·CSS·JS·폰트를 단말에 보관합니다.

   ⚠ 사진은 캐시하지 않습니다 (초상권 보호)
     예외를 두려면 CACHE_ALLOW 를 보세요. 기본값은 비어 있습니다.
     · PRECACHE 목록에 사진이 없습니다.
     · PHOTO 정규식에 걸리는 요청은 캐시를 거치지 않고 네트워크로만 갑니다.
       (cache.put 을 호출하는 경로가 아예 없습니다)
     · 과거 버전이 남겼을 수 있는 사진 항목은 activate 단계에서 삭제합니다.
     따라서 오프라인에서는 사진 자리가 비어 보입니다 — 의도된 동작입니다.

   ⚠ 통제 범위의 한계
     여기서 막는 것은 "서비스 워커 캐시"입니다. 브라우저 자체의 HTTP 캐시는
     GitHub Pages 가 보내는 헤더(max-age=600)를 따르며 정적 호스팅에서는
     바꿀 수 없습니다. 즉 사진이 단말에 일시적으로 남는 것까지는 막지
     못합니다. 오프라인에서 영구히 열람 가능한 상태가 되는 것을 막는 것이
     이 파일의 역할입니다.

   기능 On/Off 는 assets/js/features.js 의 FEATURES.offline 에서 합니다.
   ════════════════════════════════════════════════════════════ */

// 배포 내용을 바꾸면 이 숫자를 올려야 하객 단말의 캐시가 갱신됩니다.
const CACHE = 'invi-v1';

// 사진 — 절대 캐시하지 않을 대상
const PHOTO = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?|heic)$/i;

// PHOTO 에 걸리지만 캐시를 허용할 예외 (파일명 기준).
//
// ⚠ 사람이 찍힌 사진은 절대 넣지 마세요. 초상권 보호가 PHOTO 규칙의 목적이고,
//   여기 넣는 순간 그 파일은 하객 단말에 영구히 남습니다.
//
// 약도(map.png)처럼 사람이 없고 오프라인에서 꼭 필요한 이미지만 대상입니다.
// 예식장 지하·로비에서 길찾기가 되게 하려면 아래를 이렇게 바꾸세요.
//     const CACHE_ALLOW = ['map.png'];
const CACHE_ALLOW = [];

// 첫 설치 때 미리 받아둘 것 (사진 없음)
const PRECACHE = [
  './',
  './index.html',
  './assets/css/tokens.css',
  './assets/css/style.css',
  './assets/css/features.css',
  './assets/css/fonts.css',
  './assets/js/main.js',
  './assets/js/features.js',
  './assets/img/favicon.svg',
  './assets/wedding.ics'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // 일부 파일이 없어도 설치가 실패하지 않도록 개별 처리
      .then((cache) => Promise.all(
        PRECACHE
          .filter((u) => !PHOTO.test(u))          // 방어: 사진이 섞여도 걸러냄
          .map((u) => cache.add(u).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1) 옛 버전 캐시 삭제
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));

      // 2) 현재 캐시에 사진이 들어 있으면 제거 (과거 버전 대비 방어)
      const cache = await caches.open(CACHE);
      const reqs = await cache.keys();
      await Promise.all(
        reqs.filter((r) => {
          const path = new URL(r.url).pathname;
          const name = path.split('/').pop();
          return PHOTO.test(path) && CACHE_ALLOW.indexOf(name) === -1;
        }).map((r) => cache.delete(r))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;      // 외부 요청은 관여하지 않음

  // ── 사진: 네트워크 전용. 캐시를 읽지도, 쓰지도 않습니다. ──
  //    CACHE_ALLOW 에 파일명이 있으면 예외로 캐시합니다.
  const file = url.pathname.split('/').pop();
  if (PHOTO.test(url.pathname) && CACHE_ALLOW.indexOf(file) === -1) {
    event.respondWith(fetch(req));
    return;
  }

  // ── 그 외: 캐시 우선, 없으면 네트워크 → 캐시에 보관 ──
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;

    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        const cache = await caches.open(CACHE);
        await cache.put(req, copy);
      }
      return res;
    } catch {
      // 오프라인이고 캐시에도 없을 때: 문서 요청이면 첫 화면으로
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw new Error('offline');
    }
  })());
});
