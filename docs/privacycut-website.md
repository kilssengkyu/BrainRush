# 개인정보 컷 안내 웹사이트

공개 사이트: https://brain-rush-two.vercel.app

BrainRush와 같은 도메인에서 제공하는 별도 정적 페이지입니다. 로그인과 게임의 인증·분석 초기화를 거치지 않습니다. 외부 폰트, 분석, 광고 스크립트, 폼 전송, 쿠키·로컬 스토리지를 추가하지 않았습니다.

| 스토어 입력 용도                                      | 같은 사이트 내 경로                                     |
| ----------------------------------------------------- | ------------------------------------------------------- |
| 소개 / Google Play 개발자 웹사이트 / Apple 마케팅 URL | `https://brain-rush-two.vercel.app/privacycut/`         |
| Apple 지원 URL / 문의                                 | `https://brain-rush-two.vercel.app/privacycut/support/` |
| Apple·Google 개인정보처리방침 URL                     | `https://brain-rush-two.vercel.app/privacycut/privacy/` |
| 공용 광고 판매자 파일                                 | `https://brain-rush-two.vercel.app/app-ads.txt`         |

소스는 `public/privacycut/`입니다. Vite 빌드가 `dist/privacycut/`로 그대로 복사하며, Vercel의 구체적인 rewrite를 기존 게임 SPA fallback보다 앞에 둡니다. 세 페이지는 끝 슬래시 유무와 관계없이 접근할 수 있습니다. `src/pages/Support.tsx`에 각 페이지를 연결했습니다. 개인정보 컷의 정책은 BrainRush 정책과 별개입니다.

## 광고 파일

2026-09-20 공개 주소에서 동일한 텍스트 응답을 확인했습니다. 기존 `public/app-ads.txt`의 아래 게시자 ID가 개인정보 컷과 일치하므로 수정하거나 중복 추가하지 않습니다.

```text
google.com, pub-4893861547827379, DIRECT, f08c47fec0942fa0
```

앱별 AdMob App ID나 광고 단위 ID를 이 파일에 쓰지 않습니다. 스토어에 기존 사이트와 같은 도메인의 개발자 웹사이트(Apple은 마케팅 URL)를 등록해야 크롤러가 루트 파일을 찾습니다. 근거: https://support.google.com/admob/answer/9363762?hl=ko

## 배포와 출시 확인

- Git에 페이지 소스를 반영한 것과 운영 배포·AdMob 승인 완료는 별개입니다. 운영 배포 후 아래 항목을 확인합니다.
- 기존 사이트의 운영자 SK.GIL과 문의처 brainrush.help@gmail.com을 사용합니다. 게시 전에 실제 응대·문의 기록 삭제 절차와 일치하는지 확인합니다.
- 현재 소개는 ‘출시 준비 중’이며 가짜 스토어 링크를 넣지 않았습니다. 출시 후 실제 스토어 링크로 갱신합니다.
- 운영 배포 후 세 페이지의 직접 접속·새로고침, 로그인 없는 정책 접근, 루트 app-ads.txt의 텍스트 응답을 확인합니다.
- Google Play 데이터 보안·App Store 개인정보 신고, 실제 광고 동의 메시지와 SDK/출시 지역 설정은 별도 확인합니다. 이 페이지 추가만으로 신고·동의 설정이 완료되지는 않습니다.
- 법적 국외 이전 고지 등 출시 지역별 추가 항목은 실제 광고·메일·호스팅 계약과 처리 내용을 기준으로 확정해야 합니다. 데이터가 전혀 외부로 전송되지 않는다는 홍보 문구를 사용하지 않습니다.
- 앱 내부에서 이 방침을 여는 링크는 운영 도메인이 확정되고 실제 배포를 확인한 뒤 연결합니다.

## 내용 확인 근거

PrivacyCut의 `docs/privacy-policy-draft.md`, `docs/ads-and-usage.md`, `src/features/pro/ProDialog.tsx`와 현재 동작을 기준으로 작성했습니다.

- https://developers.google.com/admob/ios/privacy/data-disclosure
- https://developers.google.com/admob/android/privacy/play-data-disclosure
- https://policies.google.com/privacy?hl=ko
- https://vercel.com/legal/privacy-policy
