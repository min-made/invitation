#!/usr/bin/env python3
"""
템플릿 + config.yaml → 배포용 파일 생성

  uv run --no-project --with pyyaml tools/build.py
  uv run --no-project --with pyyaml tools/build.py --config /path/to/config.yaml
  uv run --no-project --with pyyaml tools/build.py --check      # 검사만, 파일 안 씀

입력                              출력
  index.template.html        →    index.html
  assets/wedding.ics.template →   assets/wedding.ics
  config.yaml

왜 빌드인가
  GitHub Pages 는 정적 호스팅이라 요청 시점에 YAML 을 읽을 수 없습니다.
  브라우저가 JS 로 YAML 을 가져오게 하면 (a) 콘텐츠가 정적 HTML 에 없어
  검색 노출이 깨지고 (b) YAML 이 어차피 공개 경로에 놓여 숨기는 효과도
  없습니다. 그래서 빌드 시점에 치환합니다.

⚠ 이 스크립트는 값을 절대 출력하지 않습니다.
  누락·오류를 보고할 때도 키 이름만 씁니다. 로그와 CI 출력에
  실명·계좌·연락처가 남지 않게 하기 위한 것입니다.

⚠ 생성물(index.html)은 커밋하지 않습니다.
  실제 값은 저장소에 들어가지 않고 배포된 사이트에만 존재합니다.
  CI 는 Actions Secret(WEDDING_CONFIG)에서 config 를 받아 빌드합니다.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

JOBS = [
    ("index.template.html", "index.html"),
    ("assets/wedding.ics.template", "assets/wedding.ics"),
]

TOKEN = re.compile(r"\{\{\s*([a-zA-Z][\w.]*)\s*\}\}")

# tel: / sms: 링크에 들어가는 값은 숫자만 남깁니다.
# config 에는 010-1234-5678 처럼 읽기 편하게 적어도 됩니다.
TEL_CONTEXT = re.compile(r'(tel|sms):\{\{\s*([a-zA-Z][\w.]*)\s*\}\}')


def flatten(d: dict, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in (d or {}).items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(flatten(v, key + "."))
        else:
            out[key] = "" if v is None else str(v).strip()
    return out


def load_config(path: Path) -> dict[str, str]:
    try:
        import yaml
    except ImportError:
        sys.exit("PyYAML 이 필요합니다:\n"
                 "  uv run --no-project --with pyyaml tools/build.py")
    if not path.exists():
        sys.exit(f"{path.name} 이 없습니다.\n"
                 f"  cp config.example.yaml config.yaml  후 값을 채우세요.")
    return flatten(yaml.safe_load(path.read_text(encoding="utf-8")) or {})


def main() -> None:
    ap = argparse.ArgumentParser(description="템플릿에 config 값을 채워 배포 파일 생성")
    ap.add_argument("--config", default="config.yaml", help="설정 파일 경로")
    ap.add_argument("--check", action="store_true", help="검사만 하고 파일을 쓰지 않음")
    args = ap.parse_args()

    cfg = load_config(Path(args.config) if Path(args.config).is_absolute()
                      else ROOT / args.config)

    # ── 템플릿이 요구하는 토큰 수집 ──
    needed: dict[str, int] = {}
    sources: dict[str, str] = {}
    for src, _ in JOBS:
        p = ROOT / src
        if not p.exists():
            sys.exit(f"템플릿이 없습니다: {src}")
        text = p.read_text(encoding="utf-8")
        sources[src] = text
        for k in TOKEN.findall(text):
            needed[k] = needed.get(k, 0) + 1

    # ── 검증: 누락 / 미사용 (값은 출력하지 않음) ──
    missing = sorted(k for k in needed if not cfg.get(k))
    unused = sorted(k for k in cfg if k not in needed and cfg.get(k))

    print(f"\n  템플릿 토큰 {len(needed)}종 · 설정 키 {len(cfg)}개")

    if unused:
        print(f"\n  참고 — 템플릿에서 쓰이지 않는 설정 키 {len(unused)}개")
        for k in unused:
            print(f"    {k}")

    if missing:
        print(f"\n  \033[31m✗ 값이 비어 있는 키 {len(missing)}개\033[0m")
        for k in missing:
            print(f"    {k}")
        print("\n  이대로 배포하면 {{키}} 가 그대로 하객에게 보입니다.")
        print("  config 를 채우거나, 쓰지 않을 항목은 템플릿에서 블록을 삭제하세요.\n")
        sys.exit(1)

    if args.check:
        print("\n  \033[32m✓ 모든 토큰에 값이 있습니다.\033[0m (--check: 파일은 쓰지 않음)\n")
        return

    # ── 치환 ──
    for src, dst in JOBS:
        text = sources[src]

        # 1) tel:/sms: 안의 토큰은 숫자만 남겨 넣습니다
        def tel_sub(m: re.Match) -> str:
            digits = re.sub(r"\D", "", cfg.get(m.group(2), ""))
            return f"{m.group(1)}:{digits}"

        text = TEL_CONTEXT.sub(tel_sub, text)

        # 2) 나머지 토큰은 그대로
        text = TOKEN.sub(lambda m: cfg.get(m.group(1), ""), text)

        left = TOKEN.findall(text)
        if left:
            sys.exit(f"  ✗ {dst} 에 치환되지 않은 토큰: {sorted(set(left))}")

        out = ROOT / dst
        out.write_text(text, encoding="utf-8")
        print(f"    생성  {dst}  ({len(text):,}자)")

    print(f"\n  \033[32m✓ 빌드 완료.\033[0m 생성물은 커밋하지 마세요 (.gitignore 처리됨).")
    print("  본문 글자가 바뀌었으므로 폰트 서브셋도 다시 만들어야 합니다:")
    print("    uv run --no-project --with fonttools --with brotli tools/fetch_fonts.py\n")


if __name__ == "__main__":
    main()
