/* ════════════════════════════════════════════════════════════
   INTERACTIONS ONLY
   본문 콘텐츠는 index.html 의 정적 마크업에 있습니다.
   (레퍼런스 분석 결론: SPA 렌더링은 검색 노출이 안 됨)
   이 파일은 동작만 담당하며, JS가 꺼져도 내용은 모두 읽힙니다.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────
     [CUSTOMIZE] 외부 연동 설정
     GitHub Pages 는 정적 호스팅이라 서버가 없습니다.
     방명록을 실제로 저장하려면 아래에 엔드포인트를 넣으세요.
     비워두면 localStorage 로 동작하는 "미리보기 모드"가 됩니다.

     ⚠ 보안 — 반드시 "쓰기 전용" 엔드포인트를 쓰세요.
       이 파일은 브라우저로 그대로 전송되므로 여기 적는 URL·키는
       전부 공개됩니다. 숨길 방법은 없습니다.
       읽기·삭제 권한이 있는 키를 넣으면 누구나 방명록 전체를
       조회하거나 지울 수 있습니다.

         권장   Google Apps Script — doPost 만 구현해 시트에 append.
                조회는 스프레드시트에서 직접 합니다.
         권장   Formspree / Getform — 제출 전용. 열람은 관리 콘솔에서.
         주의   Firebase 등 DB 를 직접 붙일 때는 보안 규칙을
                create 만 허용(read/update/delete 금지)으로 두세요.

       또한 CSP 를 걸어 두었으므로(index.html 참고) 외부 도메인으로
       fetch 하려면 connect-src 에 그 출처를 추가해야 합니다.
     ────────────────────────────────────────────────────────── */
  // 저장 주소는 index.html 의 <section id="guestbook" data-endpoint="...">
  // 에서 읽습니다. 설정을 HTML 한 곳에 모으기 위한 것이며(data-wedding 과 동일),
  // features.js 의 목록/인원 표시도 같은 값을 씁니다.

  /* [CUSTOMIZE] 카카오 JavaScript 키 — 넣으면 카카오톡 공유가 활성화됩니다.
     https://developers.kakao.com → 내 애플리케이션 → 앱 키
     넣은 뒤 index.html <head> 에 SDK 스크립트도 추가해야 합니다. */
  var KAKAO_JS_KEY = '';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };


  /* ── 토스트 ─────────────────────────────────────── */
  var toastEl = $('#toast');
  var toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2000);
  }


  /* ── [0] 인트로 ─────────────────────────────────── */
  (function intro() {
    var el = $('#intro');
    if (!el) return;

    // <body data-intro="off"> 로 끌 수 있습니다.
    if (document.body.dataset.intro === 'off') { el.remove(); return; }

    document.body.style.overflow = 'hidden';
    function done() {
      el.classList.add('is-done');
      document.body.style.overflow = '';
      setTimeout(function () { el.remove(); }, 1100);
    }
    setTimeout(done, 2600);            // 자동 해제
    el.addEventListener('click', done); // 탭하면 즉시 넘김
  })();


  /* ── 스크롤 등장 ────────────────────────────────── */
  (function reveal() {
    var els = $$('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  })();


  /* ── [5] 캘린더 + D-day ─────────────────────────── */
  (function calendar() {
    var box = $('#calendar');
    if (!box) return;

    var when = new Date(box.dataset.wedding.replace(' ', 'T'));
    if (isNaN(when)) { console.warn('data-wedding 형식 오류'); return; }

    var y = when.getFullYear(), m = when.getMonth(), target = when.getDate();
    var first = new Date(y, m, 1).getDay();
    var last  = new Date(y, m + 1, 0).getDate();

    var html = '<div class="calendar__grid">';
    ['일', '월', '화', '수', '목', '금', '토'].forEach(function (d, i) {
      html += '<div class="calendar__dow' + (i === 0 ? ' calendar__dow--sun' : '') + '">' + d + '</div>';
    });
    for (var i = 0; i < first; i++) html += '<div class="calendar__day"></div>';
    for (var d = 1; d <= last; d++) {
      var dow = (first + d - 1) % 7;
      var cls = 'calendar__day';
      if (dow === 0) cls += ' calendar__day--sun';
      if (d === target) cls += ' calendar__day--mark';
      html += '<div class="' + cls + '">' + d + '</div>';
    }
    box.innerHTML = html + '</div>';

    var dd = $('#dday');
    if (!dd) return;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var day0  = new Date(y, m, target);
    var diff  = Math.round((day0 - today) / 86400000);

    var names = $$('[data-ph="groom.name"]');
    var g = names[0] ? names[0].textContent.trim() : '신랑';
    var b = ($('[data-ph="bride.name"]') || {}).textContent;
    b = b ? b.trim() : '신부';

    dd.innerHTML = diff > 0
      ? g + ', ' + b + '의 결혼식이 <b>' + diff + '일</b> 남았습니다.'
      : diff === 0
        ? '<b>오늘</b>은 ' + g + ', ' + b + '의 결혼식입니다.'
        : g + ', ' + b + '이 함께한 지 <b>' + Math.abs(diff) + '일</b>이 되었습니다.';
  })();


  /* ── [7] 지도앱 딥링크 ──────────────────────────── */
  (function maps() {
    var nameEl = $('[data-ph="venue.name"]');
    var addrEl = $('[data-ph="venue.address"]');
    if (!nameEl) return;

    var name = nameEl.textContent.trim();
    var addr = addrEl ? addrEl.textContent.trim() : name;
    var q = encodeURIComponent(name);

    var urls = {
      naver: 'https://map.naver.com/p/search/' + q,
      kakao: 'https://map.kakao.com/?q=' + q
      // 티맵은 SK open API 의 appKey 가 필요합니다. 키 없이는 요청이 실패하므로
      // 버튼과 함께 제거했습니다. 예식장 좌표가 확정되면 아래처럼 되살리세요.
      //   tmap: 'https://apis.openapi.sk.com/tmap/app/routes'
      //         + '?appKey=<발급받은키>&name=' + q + '&lon=<경도>&lat=<위도>'
    };

    $$('[data-map]').forEach(function (a) {
      var u = urls[a.dataset.map];
      if (u) a.href = u;
    });

    // 주소 탭 → 복사
    if (addrEl) {
      addrEl.style.cursor = 'pointer';
      addrEl.title = '탭하면 주소가 복사됩니다';
      addrEl.addEventListener('click', function () { copy(addr, '주소를 복사했습니다'); });
    }
  })();


  /* ── 복사 ───────────────────────────────────────── */
  function copy(text, msg) {
    var ok = function () { toast(msg || '복사했습니다'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(ok, fallback);
    } else { fallback(); }

    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); ok(); }
      catch (e) { toast('복사에 실패했습니다'); }
      document.body.removeChild(ta);
    }
  }

  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      copy(btn.dataset.copy, '계좌번호를 복사했습니다');
    });
  });


  /* ── [6] 라이트박스 ─────────────────────────────── */
  (function lightbox() {
    var box = $('#lightbox');
    var cells = $$('#grid .grid__cell');
    if (!box || !cells.length) return;

    var img = $('.lightbox__img', box);
    var cnt = $('.lightbox__count', box);
    var idx = 0;

    function open(i) {
      idx = (i + cells.length) % cells.length;
      var src = $('img', cells[idx]);
      img.src = src.src;
      img.alt = src.alt;
      cnt.textContent = (idx + 1) + ' / ' + cells.length;
      box.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function close() {
      box.hidden = true;
      document.body.style.overflow = '';
    }

    cells.forEach(function (c, i) { c.addEventListener('click', function () { open(i); }); });
    $('.lightbox__close', box).addEventListener('click', close);

    /* ── 스와이프 (사진 21장이라 버튼만으로는 불편) ──────────
       판정 조건 세 가지를 모두 만족해야 넘깁니다.
         · 수평 이동 45px 이상        — 우연한 탭 제외
         · 수평이 수직의 1.5배 이상   — 세로 스크롤 제스처와 구분
         · 600ms 이내                 — 천천히 끄는 동작 제외
       스와이프로 인정된 경우 뒤따르는 click 을 한 번 무시합니다.
       그러지 않으면 배경에서 손을 뗄 때 닫기 핸들러가 같이 발동합니다. */
    var sx = 0, sy = 0, st = 0, swiped = false;

    box.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      st = e.timeStamp;
      swiped = false;
    }, { passive: true });

    box.addEventListener('touchend', function (e) {
      if (!st || e.changedTouches.length !== 1) return;
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      var dt = e.timeStamp - st;
      st = 0;
      if (Math.abs(dx) < 45) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dt > 600) return;
      swiped = true;
      open(dx < 0 ? idx + 1 : idx - 1);
    }, { passive: true });

    // 스와이프 직후의 click 무효화 (배경 탭 = 닫기 와 충돌 방지)
    box.addEventListener('click', function (e) {
      if (swiped) { swiped = false; e.stopPropagation(); }
    }, true);
    $('.lightbox__nav--prev', box).addEventListener('click', function () { open(idx - 1); });
    $('.lightbox__nav--next', box).addEventListener('click', function () { open(idx + 1); });
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') open(idx - 1);
      if (e.key === 'ArrowRight') open(idx + 1);
    });
  })();

  // BGM 은 사용하지 않기로 했습니다. index.html 의 주석 처리된
  // 버튼·오디오 요소를 되살릴 때 이 블록도 git 이력에서 복원하세요.


  /* ── [11] 공유 ──────────────────────────────────── */
  (function share() {
    var linkBtn = $('#shareLink'), kakaoBtn = $('#shareKakao');

    /* 공유용 기본 주소 — 쿼리스트링을 반드시 떼어냅니다.
       location.href 를 그대로 쓰면 ?to=홍길동 이 딸려 나가서,
       그 링크를 받은 다른 하객에게 "홍길동 님께" 가 보입니다.
       ?preview=day 같은 개발용 파라미터도 같은 이유로 제거합니다. */
    function shareUrl() {
      var path = location.pathname.replace(/index\.html$/, '');
      return location.origin + path;
    }

    if (linkBtn) {
      linkBtn.addEventListener('click', function () {
        copy(shareUrl(), '청첩장 링크를 복사했습니다');
      });
    }

    if (!kakaoBtn) return;
    kakaoBtn.addEventListener('click', function () {
      var url = shareUrl();
      if (KAKAO_JS_KEY && window.Kakao) {
        if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY);
        window.Kakao.Share.sendScrap({ requestUrl: url });
        return;
      }
      // SDK 미설정 — Web Share API 로 대체
      if (navigator.share) {
        navigator.share({ title: document.title, url: url }).catch(function () {});
      } else {
        copy(url, '카카오 키 미설정 — 링크를 복사했습니다');
      }
    });
  })();


  /* ── [9][10] 폼 전송 ────────────────────────────── */
  function submitTo(url, data) {
    if (!url) return Promise.reject(new Error('no-endpoint'));
    // Content-Type 을 text/plain 으로 보냅니다.
    // application/json 이면 브라우저가 preflight(OPTIONS)를 먼저 보내는데
    // Apps Script 웹앱은 OPTIONS 를 처리하지 못해 요청이 실패합니다.
    // text/plain 은 "단순 요청"이라 preflight 가 발생하지 않습니다.
    // (Formspree 등으로 바꾸면 application/json 이 필요할 수 있습니다)
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(data)
    }).then(function (r) {
      if (!r.ok) throw new Error('http-' + r.status);
      return r;
    });
  }

  function formData(form) {
    var out = {};
    new FormData(form).forEach(function (v, k) { out[k] = v; });
    out.submittedAt = new Date().toISOString();
    return out;
  }

  // 방명록
  (function guestbook() {
    var form = $('#gbForm'), msg = $('#gbMsg'), list = $('#gbList');
    var sect = $('#guestbook');
    var endpoint = (sect && sect.dataset.endpoint) || '';
    if (!form || !list) return;

    function render(entries) {
      if (!entries.length) return;
      list.innerHTML = entries.slice().reverse().map(function (e) {
        return '<li class="gb__item">' +
               '<p class="gb__meta"><b>' + esc(e.name) + '</b><time>' + fmt(e.submittedAt) + '</time></p>' +
               '<p class="gb__body">' + esc(e.message) + '</p></li>';
      }).join('');
    }
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function fmt(iso) {
      var d = new Date(iso);
      return isNaN(d) ? '' : d.getFullYear() + '.' +
        String(d.getMonth() + 1).padStart(2, '0') + '.' +
        String(d.getDate()).padStart(2, '0');
    }

    // 엔드포인트가 없으면 로컬에 쌓인 본인 메시지만 보여줍니다(미리보기).
    if (!endpoint) {
      render(JSON.parse(localStorage.getItem('guestbook') || '[]'));
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;

      var data = formData(form);
      submitTo(endpoint, data)
        .then(function () {
          form.reset();
          msg.textContent = '축하 메시지가 전달되었습니다.';
          // features.js 가 목록·인원을 다시 불러올 수 있게 알립니다.
          document.dispatchEvent(new CustomEvent('guestbook:sent'));
        })
        .catch(function (err) {
          if (err.message === 'no-endpoint') {
            var all = JSON.parse(localStorage.getItem('guestbook') || '[]');
            all.push(data);
            localStorage.setItem('guestbook', JSON.stringify(all));
            render(all);
            form.reset();
            msg.textContent = '미리보기 모드로 저장했습니다.';
          } else {
            msg.textContent = '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.';
          }
        });
    });

  })();


  /* ── 콘텐츠 억제책 (deterrent) ──────────────────────
     ⚠ "보호"가 아니라 "억제"입니다. 브라우저가 화면에 그리는 순간
       데이터는 이미 사용자 기기에 있습니다. 소스 보기·개발자도구·
       리더 모드·curl 로 전부 우회됩니다. 우발적 저장/복사만 줄입니다.
     되돌리려면 이 블록과 style.css 하단의 억제책 블록을 지우면 됩니다.
     ─────────────────────────────────────────────────── */
  (function deterrent() {
    var EDITABLE = /^(INPUT|TEXTAREA)$/;
    // Firefox 는 CSS -webkit-user-drag 를 따르지 않아 속성이 필요합니다.
    // 라이트박스 이미지는 src 만 바뀌므로 최초 1회 지정으로 충분합니다.
    $$('img').forEach(function (im) { im.draggable = false; });
    document.addEventListener('dragstart', function (e) {
      if (e.target && e.target.tagName === 'IMG') e.preventDefault();
    });
    // 입력란에서는 붙여넣기 메뉴가 필요하므로 예외로 둡니다.
    document.addEventListener('contextmenu', function (e) {
      if (e.target && EDITABLE.test(e.target.tagName)) return;
      e.preventDefault();
    });
  })();

})();
