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
  var ENDPOINTS = {
    guestbook: ''    // 예: 'https://script.google.com/macros/s/xxxx/exec'
  };

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
      kakao: 'https://map.kakao.com/?q=' + q,
      // 앱 미설치 시 동작하지 않습니다. 정확한 좌표 기반 링크로 교체 권장.
      tmap:  'https://apis.openapi.sk.com/tmap/app/routes?appKey=&name=' + q
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


  /* ── BGM ────────────────────────────────────────── */
  (function bgm() {
    var btn = $('#bgm'), audio = $('#bgmAudio');
    if (!btn || !audio) return;

    btn.addEventListener('click', function () {
      if (audio.paused) {
        audio.play().then(function () {
          btn.setAttribute('aria-pressed', 'true');
          btn.setAttribute('aria-label', '배경음악 정지');
        }).catch(function () {
          toast('assets/audio/bgm.mp3 를 넣어주세요');
        });
      } else {
        audio.pause();
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', '배경음악 재생');
      }
    });
  })();


  /* ── [11] 공유 ──────────────────────────────────── */
  (function share() {
    var linkBtn = $('#shareLink'), kakaoBtn = $('#shareKakao');

    if (linkBtn) {
      linkBtn.addEventListener('click', function () {
        copy(location.href, '청첩장 링크를 복사했습니다');
      });
    }

    if (!kakaoBtn) return;
    kakaoBtn.addEventListener('click', function () {
      if (KAKAO_JS_KEY && window.Kakao) {
        if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY);
        window.Kakao.Share.sendScrap({ requestUrl: location.href });
        return;
      }
      // SDK 미설정 — Web Share API 로 대체
      if (navigator.share) {
        navigator.share({ title: document.title, url: location.href }).catch(function () {});
      } else {
        copy(location.href, '카카오 키 미설정 — 링크를 복사했습니다');
      }
    });
  })();


  /* ── [9][10] 폼 전송 ────────────────────────────── */
  function submitTo(url, data) {
    if (!url) return Promise.reject(new Error('no-endpoint'));
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    if (!ENDPOINTS.guestbook) {
      render(JSON.parse(localStorage.getItem('guestbook') || '[]'));
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;

      var data = formData(form);
      submitTo(ENDPOINTS.guestbook, data)
        .then(function () {
          form.reset();
          msg.textContent = '축하 메시지가 등록되었습니다.';
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
            msg.textContent = '등록에 실패했습니다.';
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
