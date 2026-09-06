/* ════════════════════════════════════════════════════════════
   부가 기능 — 전부 여기서 켜고 끕니다.

   ┌──────────────────────────────────────────────────────┐
   │  ON/OFF 는 바로 아래 FEATURES 객체 한 곳에서만 합니다.  │
   │  true → 켬 / false → 끔. 끄면 DOM 도 만들지 않으므로   │
   │  흔적이 전혀 남지 않습니다.                            │
   └──────────────────────────────────────────────────────┘

   이 파일을 통째로 지우고 index.html 의 <script> 한 줄을 지우면
   청첩장은 baseline 상태로 완전히 돌아갑니다.
   main.js(기본 동작)는 이 파일에 의존하지 않습니다.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     ▼▼▼  기능 스위치 — 여기만 고치세요  ▼▼▼
     ══════════════════════════════════════════════════════════ */
  var FEATURES = {
    timeAware:    true,   // [1] 예식 전/임박/당일/이후 화면 자동 전환
    guestName:    true,   // [2] ?to=이름 으로 하객 이름 표시
    timeOfDay:    true,   // [4] 접속 시간대에 따라 색조 변화
    offline:      true,   // [5] 오프라인 캐시 (사진은 절대 제외)
    addCalendar:  true,   // [6] 하객 캘린더에 예식 일정 추가
    miniNav:      true,   // [7] 하단 고정 미니 내비
    paperTexture: true,   // [10] 한지 질감 배경
    bloom:        false,   // [12] D-day 에 따라 피어나는 꽃

    // 방명록 공개 범위
    //   true  → ③ 하객들이 쓴 축하를 전부 목록으로 보여줍니다
    //   false → ② 목록은 숨기고 참여 인원만 보여줍니다
    // ⚠ 이 스위치는 화면 표시만 바꿉니다. 실제 노출을 막으려면
    //   Apps Script 의 PUBLIC_LIST 도 false 로 바꿔야 합니다.
    //   (tools/apps_script_guestbook.gs 참고)
    guestbookList: true
  };
  /* ══════════════════════════════════════════════════════════
     ▲▲▲  여기까지  ▲▲▲
     ══════════════════════════════════════════════════════════ */

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var root = document.documentElement;

  /* 켜진 기능을 <html> 클래스로 노출 — CSS 가 이 클래스를 기준으로 동작 */
  Object.keys(FEATURES).forEach(function (k) {
    if (FEATURES[k]) root.classList.add('feat-' + k);
  });


  /* ── 예식 일시 (모든 시간 기반 기능의 단일 기준) ─────────
     #calendar 의 data-wedding 을 그대로 씁니다.
     날짜를 바꿀 때 이 파일은 고칠 필요가 없습니다. */
  var weddingAt = (function () {
    var el = $('#calendar');
    if (!el || !el.dataset.wedding) return null;
    var d = new Date(el.dataset.wedding.replace(' ', 'T'));
    return isNaN(d) ? null : d;
  })();

  function daysUntil() {
    if (!weddingAt) return null;
    var a = new Date(weddingAt); a.setHours(0, 0, 0, 0);
    var b = new Date();          b.setHours(0, 0, 0, 0);
    return Math.round((a - b) / 86400000);
  }


  /* ══════════════════════════════════════════════════════════
     [1] 시간 인식 — 같은 URL 이 언제 열리느냐에 따라 달라집니다.

       before  D-8 이상   지금 형태 그대로
       soon    D-7 ~ D-1  임박 안내 띠
       day     예식 당일   하객 모드 (길찾기 우선)
       after   예식 이후   감사 인사 · 계좌 숨김

     미리보기: 주소 끝에 ?preview=day 를 붙이면 그 상태를 볼 수 있습니다.
              (before / soon / day / after)
     ══════════════════════════════════════════════════════════ */
  var phase = 'before';

  (function timeAware() {
    if (!FEATURES.timeAware || !weddingAt) return;

    var forced = new URLSearchParams(location.search).get('preview');
    var valid = ['before', 'soon', 'day', 'after'];

    if (forced && valid.indexOf(forced) !== -1) {
      phase = forced;
    } else {
      var d = daysUntil();
      phase = d > 7 ? 'before' : d > 0 ? 'soon' : d === 0 ? 'day' : 'after';
    }
    root.classList.add('phase-' + phase);
    if (forced) root.classList.add('is-preview');

    var card = $('#card');
    if (!card || phase === 'before') return;

    var msg = {
      soon:  '이번 주 <b>' + daysUntil() + '일 뒤</b>입니다. 오시는 길을 미리 확인해 주세요.',
      day:   '<b>오늘</b>입니다. 아래에서 길찾기를 바로 여실 수 있습니다.',
      after: '함께해 주셔서 감사합니다.'
    }[phase];

    var bar = document.createElement('p');
    bar.className = 'phasebar phasebar--' + phase;
    bar.innerHTML = msg;                    // 고정 문자열만 사용 (외부 입력 없음)
    card.insertBefore(bar, card.firstChild);

    // 예식이 끝나면 계좌 안내를 감춥니다 (노출 기간 최소화)
    if (phase === 'after') {
      var gift = $('#gift');
      if (gift) gift.hidden = true;
    }
  })();


  /* ══════════════════════════════════════════════════════════
     [2] 하객 이름 — 주소 끝에 ?to=홍길동 을 붙여 보내면
         인사말 위에 "홍길동 님께" 한 줄이 붙습니다.
         파라미터가 없으면 아무것도 표시되지 않습니다.
     ══════════════════════════════════════════════════════════ */
  (function guestName() {
    if (!FEATURES.guestName) return;

    var raw = new URLSearchParams(location.search).get('to');
    if (!raw) return;

    // 이름으로 쓸 수 있는 글자만 남기고 길이를 제한합니다.
    // textContent 로만 넣으므로 스크립트 주입은 불가능합니다.
    var name = raw.replace(/[^가-힣A-Za-z0-9 ·.]/g, '').trim().slice(0, 20);
    if (!name) return;

    var target = $('#greeting .sect__title');
    if (!target) return;

    var p = document.createElement('p');
    p.className = 'salutation';
    p.textContent = name + ' 님께';        // ← innerHTML 금지
    target.parentNode.insertBefore(p, target.nextSibling);
  })();


  /* ══════════════════════════════════════════════════════════
     [4] 시간대별 색조 — 아침/낮/저녁/밤에 따라 색 토큰이 바뀝니다.
         실제 값은 assets/css/features.css 의 .tod-* 블록에 있습니다.
     ══════════════════════════════════════════════════════════ */
  (function timeOfDay() {
    if (!FEATURES.timeOfDay) return;
    var h = new Date().getHours();
    var tod = h < 6 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'day' : h < 21 ? 'evening' : 'night';
    root.classList.add('tod-' + tod);
  })();


  /* ══════════════════════════════════════════════════════════
     [5] 오프라인 캐시 — 예식장 지하처럼 통신이 약한 곳에서도
         청첩장이 열리도록 합니다.

         ⚠ 사진은 캐시하지 않습니다 (초상권 보호).
           제외 규칙은 sw.js 의 PHOTO 정규식에 있습니다.
           따라서 오프라인에서는 사진 자리가 비어 보입니다 — 의도된 동작입니다.

         개발 중에는 등록하지 않습니다. 라이브 리로드와 충돌하기 때문입니다.
     ══════════════════════════════════════════════════════════ */
  (function offline() {
    var isLocal = ['localhost', '127.0.0.1', '::1'].indexOf(location.hostname) !== -1;

    if (!FEATURES.offline || isLocal) {
      // 껐거나 개발 환경이면, 이전에 등록된 워커를 정리합니다.
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (rs) {
          rs.forEach(function (r) { r.unregister(); });
        }).catch(function () {});
      }
      return;
    }

    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  })();


  /* ══════════════════════════════════════════════════════════
     [6] 캘린더에 추가 — 하객 휴대폰 캘린더에 예식을 등록합니다.
         파일: assets/wedding.ics
         ⚠ 예식 날짜를 바꾸면 이 파일도 함께 고쳐야 합니다.
           불일치하면 아래에서 콘솔 경고를 남깁니다.
     ══════════════════════════════════════════════════════════ */
  (function addCalendar() {
    if (!FEATURES.addCalendar || !weddingAt) return;

    var host = $('#when .dday');
    if (!host) return;

    var a = document.createElement('a');
    a.className = 'btn btn--ghost calbtn';
    a.href = 'assets/wedding.ics';
    a.setAttribute('download', 'wedding.ics');
    a.textContent = '캘린더에 일정 추가';
    host.parentNode.insertBefore(a, host.nextSibling);

    // .ics 의 날짜가 data-wedding 과 맞는지 확인 (개발자용 경고)
    fetch('assets/wedding.ics').then(function (r) { return r.text(); }).then(function (t) {
      var m = t.match(/DTSTART[^:]*:(\d{8})T(\d{4})/);
      if (!m) return;
      var pad = function (n) { return String(n).padStart(2, '0'); };
      var utc = new Date(Date.UTC(
        +m[1].slice(0, 4), +m[1].slice(4, 6) - 1, +m[1].slice(6, 8),
        +m[2].slice(0, 2), +m[2].slice(2, 4)));
      if (Math.abs(utc - weddingAt) > 60000) {
        console.warn('[features] wedding.ics 의 일시가 data-wedding 과 다릅니다.',
                     'ics=', utc.toISOString(), 'html=', weddingAt.toISOString());
      }
      void pad;
    }).catch(function () {});
  })();


  /* ══════════════════════════════════════════════════════════
     [7] 하단 미니 내비 — 스크롤을 내리면 나타납니다.
         예식 당일에는 길찾기가 맨 앞으로 옵니다.
     ══════════════════════════════════════════════════════════ */
  (function miniNav() {
    if (!FEATURES.miniNav) return;

    var items = [
      { href: '#location',  label: '오시는 길' },
      { href: '#gift',      label: '마음 전하실 곳' },
      { href: '#family',    label: '연락하기' },
      { href: '#share',     label: '공유' }
    ];

    if (phase === 'day') items.unshift(items.splice(0, 1)[0]);   // 길찾기 우선
    if (phase === 'after') items = items.filter(function (i) { return i.href !== '#gift'; });

    var nav = document.createElement('nav');
    nav.className = 'mininav';
    nav.setAttribute('aria-label', '바로가기');
    items.forEach(function (i) {
      if (!$(i.href)) return;
      var a = document.createElement('a');
      a.href = i.href;
      a.textContent = i.label;
      nav.appendChild(a);
    });
    if (!nav.children.length) return;
    document.body.appendChild(nav);

    // 커버를 지나면 노출
    var cover = $('#cover');
    if (!cover || !('IntersectionObserver' in window)) { nav.classList.add('is-on'); return; }
    new IntersectionObserver(function (es) {
      nav.classList.toggle('is-on', !es[0].isIntersecting);
    }, { threshold: 0 }).observe(cover);
  })();


  /* ══════════════════════════════════════════════════════════
     [12] 피어나는 꽃 — 예식이 가까워질수록 커버의 꽃이 벌어집니다.
          D-100 에 봉오리, 당일에 만개.
          --bloom (0~1) 값만 넘기고 표현은 CSS 가 담당합니다.
     ══════════════════════════════════════════════════════════ */
  (function bloom() {
    if (!FEATURES.bloom || !weddingAt) return;
    var cover = $('#cover');
    if (!cover) return;

    var d = daysUntil();
    var t = d === null ? 1 : Math.max(0, Math.min(1, 1 - d / 100));
    root.style.setProperty('--bloom', t.toFixed(3));
    cover.classList.add('has-bloom');
  })();


  /* ══════════════════════════════════════════════════════════
     방명록 읽기 — 전체 목록(③) 또는 참여 인원(②)

     주소는 index.html 의 <section id="guestbook" data-endpoint="...">
     에서 읽습니다. 비어 있으면 아무것도 하지 않습니다
     (미리보기 모드는 main.js 가 담당).

     ⚠ guestbookList=false 로 두어도 서버가 목록을 계속 내려주면
       주소를 아는 사람은 여전히 전부 볼 수 있습니다.
       Apps Script 의 PUBLIC_LIST 도 함께 false 로 바꾸세요.
     ══════════════════════════════════════════════════════════ */
  (function guestbookRead() {
    var sect = $('#guestbook');
    var list = $('#gbList');
    if (!sect || !list) return;

    var url = sect.dataset.endpoint || '';
    if (!url) return;

    var wantList = !!FEATURES.guestbookList;
    var countEl = null;

    function fmt(iso) {
      var d = new Date(iso);
      if (isNaN(d)) return '';
      var p = function (n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
    }

    function showCount(n) {
      if (!countEl) {
        countEl = document.createElement('p');
        countEl.className = 'gbcount';
        list.parentNode.insertBefore(countEl, list);
      }
      countEl.textContent = n > 0
        ? n + '명이 축하를 남겨주셨습니다.'
        : '첫 번째 축하를 남겨주세요.';
    }

    // 서버 값을 DOM 에 넣을 때는 textContent 만 씁니다.
    // 하객이 입력한 내용이므로 innerHTML 로 넣으면 주입 위험이 있습니다.
    function showList(entries) {
      list.textContent = '';
      entries.forEach(function (e) {
        var li = document.createElement('li');
        li.className = 'gb__item';

        var meta = document.createElement('p');
        meta.className = 'gb__meta';
        var b = document.createElement('b');
        b.textContent = e.name || '';
        var time = document.createElement('time');
        time.textContent = fmt(e.submittedAt);
        meta.appendChild(b);
        meta.appendChild(time);

        var body = document.createElement('p');
        body.className = 'gb__body';
        body.textContent = e.message || '';

        li.appendChild(meta);
        li.appendChild(body);
        list.appendChild(li);
      });
    }

    function load() {
      var q = url + (url.indexOf('?') === -1 ? '?' : '&')
            + 'mode=' + (wantList ? 'list' : 'count');
      fetch(q, { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (wantList && Array.isArray(d.entries)) {
            showList(d.entries);
            showCount(typeof d.count === 'number' ? d.count : d.entries.length);
          } else if (typeof d.count === 'number') {
            list.hidden = true;
            showCount(d.count);
          }
        })
        .catch(function () { /* 조회 실패는 조용히 무시 — 작성은 계속 가능 */ });
    }

    load();
    document.addEventListener('guestbook:sent', function () {
      setTimeout(load, 1200);
    });
  })();

})();
