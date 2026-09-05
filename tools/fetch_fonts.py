#!/usr/bin/env python3
"""
웹폰트 셀프 호스팅 — CDN 의존을 없애기 위해 폰트를 내려받아 로컬에 둡니다.

  uv run --no-project tools/fetch_fonts.py

하는 일
  1. Google Fonts CSS 를 woff2 로 받아(모던 브라우저 UA), @font-face 안의
     fonts.gstatic.com URL 을 모두 추출해 assets/font/ 에 저장합니다.
  2. Pretendard 는 jsDelivr 에서 variable woff2 를 직접 받습니다.
  3. src 를 로컬 상대경로로 바꾼 assets/css/fonts.css 를 생성합니다.

왜 필요한가
  계좌번호가 표시되는 페이지가 제3자 CDN 에 의존하면, CDN 이 손상됐을 때
  화면 내용이 조작될 수 있습니다. 셀프 호스팅으로 외부 의존을 0 으로 만들고
  그 상태에서 CSP(default-src 'self')를 걸 수 있습니다.
  부수 효과로 Google Fonts 가 방문자 IP 를 수집하지 않습니다.

라이선스
  Pretendard: SIL Open Font License 1.1
  Gowun Batang / Cormorant Garamond: SIL Open Font License 1.1
  세 폰트 모두 셀프 호스팅이 허용됩니다.
"""

from __future__ import annotations

import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "assets" / "font"
CSS_OUT = ROOT / "assets" / "css" / "fonts.css"

# woff2 를 받으려면 모던 브라우저 UA 가 필요합니다(구형 UA 면 ttf 를 줍니다).
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# 실제로 사용하는 굵기만 받습니다(파일 수·용량 절약).
#   Gowun Batang       400  — 제목·인사말
#   Cormorant Garamond 300/400 — 영문 라벨
GOOGLE_CSS = (
    "https://fonts.googleapis.com/css2"
    "?family=Gowun+Batang"
    "&family=Cormorant+Garamond:wght@300;400"
    "&display=swap"
)

# Pretendard 는 서브셋 배포본이 없어 variable 전체가 약 2MB 입니다.
# Google Fonts 처럼 unicode-range 로 쪼개져 있지도 않아 전량을 받게 되므로,
# 내려받은 뒤 pyftsubset 으로 직접 줄입니다.
PRETENDARD_WOFF2 = ("https://cdn.jsdelivr.net/npm/pretendard@1.3.9"
                    "/dist/web/variable/woff2/PretendardVariable.woff2")

# ── Pretendard 서브셋 전략 ────────────────────────────────────
# 한글 음절 전체(11,172자)를 담으면 서브셋을 해도 1.7MB 입니다.
# 음절 자체가 용량의 본체라 범위를 줄이지 않으면 효과가 없습니다.
#
# unicode-range 로 코드포인트를 균등 분할하는 방법은 통하지 않습니다.
# 한글은 초성·중성·종성 순으로 배열돼 있어 평범한 문장도 전 범위에
# 흩어지고, 결국 모든 조각을 받게 됩니다(실측 절약률 0%).
# Google 의 한글 서브셋이 작동하는 건 빈도순으로 묶기 때문입니다.
#
# 그래서 **index.html 에 실제로 쓰인 글자만** 담습니다. 한 장짜리
# 정적 페이지라 본문이 고정돼 있어 이 방식이 가장 효율적입니다.
#
# ⚠ 본문 텍스트를 수정하면 이 스크립트를 다시 실행해야 합니다.
#   빠뜨리면 새 글자가 시스템 폰트로 렌더링됩니다 — 페이지가 깨지는
#   것은 아니고 그 글자만 서체가 달라 보입니다(graceful fallback).

# 본문에 없어도 항상 포함할 범위 (숫자·기호·문장부호 등)
ALWAYS_RANGES = [
    (0x0020, 0x007E),   # 기본 라틴 + 숫자 + 기호
    (0x00A0, 0x00FF),   # 라틴 보충
    (0x2018, 0x201F),   # ' ' " "
    (0x2013, 0x2014),   # – —
    (0x2026, 0x2026),   # …
    (0x20A9, 0x20A9),   # ₩
    (0x2660, 0x2667),   # ♠ ♥ 등
    (0x3000, 0x303F),   # CJK 문장부호
]

HTML_FOR_GLYPHS = ROOT / "index.html"


def used_codepoints() -> set[int]:
    """index.html 에서 화면에 렌더링되는 문자만 추출한다."""
    if not HTML_FOR_GLYPHS.exists():
        return set()
    html = HTML_FOR_GLYPHS.read_text(encoding="utf-8")
    html = re.sub(r"<!--.*?-->", " ", html, flags=re.S)      # 주석 제거
    html = re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S | re.I)
    # 속성값 중 화면에 보이는 것(content=, placeholder=, alt=, aria-label=)은 유지
    visible_attrs = " ".join(
        m.group(2) for m in re.finditer(
            r'\b(content|placeholder|alt|aria-label|title)="([^"]*)"', html)
    )
    body = re.sub(r"<[^>]+>", " ", html)                     # 태그 제거
    return {ord(c) for c in (body + visible_attrs) if not c.isspace()}


def fmt_unicodes(codepoints: set[int], ranges: list[tuple[int, int]]) -> str:
    parts = [f"U+{a:04X}" if a == b else f"U+{a:04X}-{b:04X}" for a, b in ranges]
    parts += [f"U+{c:04X}" for c in sorted(codepoints)]
    return ",".join(parts)


PRETENDARD_FACE = """\
/* Pretendard Variable (사용 글자만 서브셋) — SIL OFL 1.1
   본문을 수정하면 tools/fetch_fonts.py 를 다시 실행하세요. */
@font-face {
  font-family: 'Pretendard Variable';
  font-style: normal;
  font-weight: 45 920;
  font-display: swap;
  src: url('../font/pretendard-subset.woff2') format('woff2-variations');
}
"""


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()
    except urllib.error.URLError as e:
        sys.exit(f"  다운로드 실패: {url}\n  {e}")


def main() -> None:
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\n  폰트 저장 위치: {FONT_DIR.relative_to(ROOT)}\n")

    # ── 1. Google Fonts ────────────────────────────────────────
    css = get(GOOGLE_CSS).decode("utf-8")
    urls = sorted(set(re.findall(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", css)))
    if not urls:
        sys.exit("  Google Fonts CSS 에서 폰트 URL 을 찾지 못했습니다.")

    print(f"  Google Fonts — 서브셋 {len(urls)}개")
    total = 0
    for i, u in enumerate(urls, 1):
        name = u.rsplit("/", 1)[-1]
        dst = FONT_DIR / name
        if not dst.exists():
            dst.write_bytes(get(u))
        total += dst.stat().st_size
        css = css.replace(u, f"../font/{name}")
        if i % 20 == 0 or i == len(urls):
            print(f"    {i}/{len(urls)}")
    print(f"    합계 {total / 1024:,.0f} KB\n")

    # ── 2. Pretendard — 내려받아 unicode-range 로 분할 ─────────
    try:
        from fontTools.subset import main as pyftsubset
    except ImportError:
        sys.exit("\n  fontTools 가 필요합니다. 다음으로 실행하세요:\n"
                 "    uv run --no-project --with fonttools --with brotli "
                 "tools/fetch_fonts.py\n")

    # 이전 실행이 남긴 파일 정리
    for stale in FONT_DIR.glob("pretendard-*.woff2"):
        stale.unlink()
    for stale in FONT_DIR.glob("PretendardVariable*.woff2"):
        stale.unlink()

    full = FONT_DIR / "PretendardVariable.full.woff2"
    if not full.exists():
        full.write_bytes(get(PRETENDARD_WOFF2))
    print(f"  Pretendard 원본 — {full.stat().st_size / 1024:,.0f} KB")

    cps = used_codepoints()
    hangul = sum(1 for c in cps if 0xAC00 <= c <= 0xD7A3)
    print(f"  index.html 사용 글자 {len(cps)}자 (한글 음절 {hangul}자)")

    out = FONT_DIR / "pretendard-subset.woff2"
    pyftsubset([
        str(full),
        f"--output-file={out}",
        "--flavor=woff2",
        f"--unicodes={fmt_unicodes(cps, ALWAYS_RANGES)}",
        "--layout-features=*",
        "--no-hinting",
    ])
    orig_kb = full.stat().st_size / 1024
    sub_kb = out.stat().st_size / 1024
    full.unlink()   # 원본은 남기지 않습니다(저장소 용량)
    print(f"  Pretendard 서브셋 — {sub_kb:,.0f} KB "
          f"({(1 - sub_kb / orig_kb) * 100:.1f}% 감소)\n")

    pretendard_css = PRETENDARD_FACE

    # ── 3. fonts.css 생성 ──────────────────────────────────────
    header = (
        "/* ════════════════════════════════════════════════════════════\n"
        "   SELF-HOSTED WEBFONTS — tools/fetch_fonts.py 가 생성합니다.\n"
        "   직접 수정하지 마세요. 폰트를 바꾸려면 스크립트를 고쳐 다시 실행하세요.\n"
        "   외부 CDN 을 쓰지 않으므로 CSP default-src 'self' 를 유지할 수 있습니다.\n"
        "   ════════════════════════════════════════════════════════════ */\n\n"
    )
    CSS_OUT.write_text(header + pretendard_css + "\n" + css, encoding="utf-8")

    grand = sum(p.stat().st_size for p in FONT_DIR.iterdir())
    print(f"  생성 {CSS_OUT.relative_to(ROOT)}")
    print(f"  폰트 총 용량 {grand / 1024 / 1024:,.2f} MB (파일 {len(list(FONT_DIR.iterdir()))}개)")
    print("\n  ※ Google 폰트는 빈도순 unicode-range 로 나뉘어 있어 파일 수가 많지만,")
    print("    브라우저는 쓰인 글자가 든 조각만 내려받습니다(실측 전송 약 300KB).")
    print("  ※ Pretendard 는 index.html 의 사용 글자만 담았습니다.")
    print("    본문을 수정하면 이 스크립트를 다시 실행하세요.\n")


if __name__ == "__main__":
    main()
