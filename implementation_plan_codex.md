# BrainRush 구현 계획 (Codex)

## 0) 목표와 범위
- 미니게임 최소 30개 구현(현재 14개 확보, 추가 16~20개 필요)
- 미니게임 외 주요 기능: 친구추가/수락, 친구 채팅, 친선전, 연습모드
- 프론트: React+Vite, Tailwind, Framer Motion
- 백엔드: Supabase(Realtime 포함)
- UI 문구: i18n 키 사용(ko 기본, en 추가)

---

## 1) 현황 요약
- 게임 흐름
  - `useMatchmaking`로 매칭(`rank`/`normal`)
  - `useGameState`로 라운드/점수/타이머 동기화
  - `game_sessions` 테이블과 RPC로 라운드 전환, 점수 업데이트
- 미니게임 컴포넌트 14개 존재
  - `src/components/minigames/*`
- 라우팅/페이지
  - `Home`, `Game`, `Login`, `Profile`, `Settings` 존재
- i18n 구조
  - `src/locales/{ko,en,ja,zh}` 존재 (한국어/영어 기본 사용)

---

## 2) 핵심 시스템 설계
### 2-1) 미니게임 레지스트리
- 목표: 미니게임 추가/관리 일원화
- 구성 제안
  - `GameType` enum/union
  - 레지스트리 메타
    - id, type, titleKey, descriptionKey, category
    - difficulty(1~5), avgDuration, scorePolicy
    - inputType(클릭/키보드/드래그 등)
- 효과
  - 신규 미니게임 추가 시 레지스트리만 추가하면 전체 플로우 연동

### 2-2) 모드 구조
- 랭크: MMR 영향, 매칭 좁은 범위 확장
- 일반: MMR 영향 없음, 매칭 범위 넓게
- 친선전: 초대 기반 세션 생성, MMR 영향 없음
- 연습모드: 로컬/서버 선택 가능, 기록 반영 여부 옵션화

---

## 3) 소셜 기능 설계(친구/채팅/친선전)
### 3-1) DB 테이블 설계(초안)
- `friend_requests`
  - id, requester_id, receiver_id, status(pending/accepted/rejected), created_at
- `friends`
  - id, user_id, friend_id, created_at
- `chat_threads`
  - id, user1_id, user2_id, created_at
- `chat_messages`
  - id, thread_id, sender_id, message, created_at
- `match_invites`
  - id, host_id, guest_id, status, room_id, created_at

### 3-2) RLS 정책
- 본인 관련 행만 읽기/쓰기 가능
- 친구 관계 성립 시 채팅 스레드 생성 허용

### 3-3) UX 플로우
- 친구 목록/검색/요청/수락 UI
- 1:1 채팅 UI(읽음 여부는 2차 단계)
- 친선전 초대 및 로비 화면

---

## 4) 연습모드 설계
- 옵션 A: 서버 세션 없이 로컬 진행
  - 빠르고 간단, 기록 저장 어려움
- 옵션 B: 서버 세션 사용
  - 통계 저장 가능, 구현 비용 증가
- 우선안: 로컬(기능 빠르게 제공), 이후 서버 확장

---

## 5) 미니게임 확장 로드맵
### 5-1) 추가 목표(16~20개)
- 카테고리 분산
  - 반응속도: 예) 타이밍 클릭, 순발력 회피
  - 기억력: 예) 패턴 기억, 위치 기억
  - 계산/논리: 예) 빠른 연산, 수열 추론
  - 공간 인지: 예) 회전/대칭 판단
  - 언어/패턴: 예) 규칙 찾기

### 5-2) 구현 규칙
- 모든 게임은 시드 기반 결정적 문제 생성
- 점수 규칙 통일(예: 정답 +20, 오답 -20 등)
- i18n 키 사용

---

## 6) 단계별 구현 로드맵
### 1단계 (핵심 구조)
- 미니게임 레지스트리 도입
- 기존 14개 게임 레지스트리화
- 모드 분기(랭크/일반/친선/연습) 기본 구조 정의

### 2단계 (소셜 핵심)
- 친구 요청/수락 기능
- 친구 목록/검색 UI
- DB/RLS 적용

### 3단계 (채팅)
- 1:1 채팅 테이블/Realtime 연결
- 채팅 UI 구현

### 4단계 (친선전)
- 초대/수락 로직
- 로비 UI + 매칭 연결

### 5단계 (연습모드)
- 로컬 연습 모드
- 미니게임 선택 UI

### 6단계 (미니게임 30개 달성)
- 추가 16~20개 단계적 구현
- 밸런스 조정 및 플레이테스트

---

## 7) 검증/운영
- 기능 테스트: 매칭/소셜/채팅/친선전/연습모드
- 밸런스 지표
  - 정답률, 평균 점수, 이탈률
- 배포 체크리스트
  - i18n 누락, RLS 정책 확인, Realtime 구독 동작 확인
