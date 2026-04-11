#!/bin/bash
echo "Supabase 프로젝트 ID를 입력하세요 (기본값: nmtttlsdxmzzavdpyqkj):"
read PROJECT_ID
PROJECT_ID=${PROJECT_ID:-nmtttlsdxmzzavdpyqkj}

echo "APPLE_ISSUER_ID를 입력하세요:"
read APPLE_ISSUER_ID

echo "APPLE_KEY_ID를 입력하세요:"
read APPLE_KEY_ID

echo "APPLE_BUNDLE_ID를 입력하세요 (예: com.kilssengkyu.brainrush):"
read APPLE_BUNDLE_ID

echo "다운로드 받은 .p8 파일의 절대 경로를 입력하세요 (예: /Users/.../Downloads/AuthKey_XXXX.p8):"
read P8_FILE_PATH

APPLE_PRIVATE_KEY=$(cat "$P8_FILE_PATH")

npx supabase secrets set --project-ref "$PROJECT_ID" APPLE_ISSUER_ID="$APPLE_ISSUER_ID" APPLE_KEY_ID="$APPLE_KEY_ID" APPLE_BUNDLE_ID="$APPLE_BUNDLE_ID" APPLE_PRIVATE_KEY="$APPLE_PRIVATE_KEY"
echo "Supabase Secrets 설정이 완료되었습니다!"
