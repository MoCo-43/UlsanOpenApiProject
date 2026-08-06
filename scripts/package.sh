#!/usr/bin/env bash
# 4개 단계 ZIP을 한 번에 생성한다.
#   bash scripts/package.sh 정경준
set -euo pipefail

NAME="${1:-지원자명}"
OUT="dist-submit"

rm -rf "$OUT"
mkdir -p "$OUT"

for STAGE in 1 2 3 4; do
  FILE="$OUT/${NAME}_한일환경테크_2차과제_${STAGE}단계.zip"
  zip -r -q "$FILE" . \
    -x "node_modules/*" \
       "client/dist/*" \
       ".git/*" \
       "$OUT/*" \
       ".env" \
       "*.DS_Store"
  echo "생성: $FILE"
done

echo
echo "확인 사항"
echo "  - .env가 포함되지 않았는지: unzip -l 로 확인"
echo "  - docs/screenshots/ 에 캡처 3장 이상"
echo "  - 시연 영상 파일 또는 README에 영상 URL"
unzip -l "$OUT/${NAME}_한일환경테크_2차과제_1단계.zip" | grep -c "" | xargs echo "  - 1단계 ZIP 항목 수:"
if unzip -l "$OUT/${NAME}_한일환경테크_2차과제_1단계.zip" | grep -q "\.env$"; then
  echo "  경고: .env가 포함되었습니다. 즉시 제거하세요."
else
  echo "  확인: .env 미포함"
fi
