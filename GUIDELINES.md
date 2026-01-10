# BrainRush 작업 지침 (Project Guidelines)

1. **언어 (Language)**:
   - 모든 대화와 계획은 **한국어**로 작성합니다.
   - implementation_plan.md 도 **한국어** 로 작성합니다.
   
2. **다국어 지원 (Internationalization)**:
   - UI에 표시되는 모든 텍스트는 하드코딩하지 않고 **i18n 키**를 사용해야 합니다.
   - 기본 언어는 **한국어(ko)**, 추가 언어는 **영어(en)**를 지원합니다.

3. **패키지 설치 (Package Installation)**:
   - 새로운 패키지 설치가 필요할 때는 반드시 사용자의 **확인**을 받습니다.

4. **주석 (Comments)**:
   - 모든 메서드, 함수, 변수 등에는 **항상 주석**을 작성합니다.
   - 주석은 코드의 의도와 동작을 명확히 설명해야 합니다.
   = 주석은 **한국어**로 작성합니다.

5. **코드 재사용 (Code Reuse)**:
   - 기존 소스 코드를 활용할 수 있는 경우(예: 공통 함수, 유틸리티), 이를 적극적으로 참고하고 재사용합니다.

6. **기술 스택 (Tech Stack)**:
   - Frontend: React (Vite), TypeScript
   - Styling: Tailwind CSS, Framer Motion
   - Backend: Supabase
   - Realtime: Supabase Realtime
   - Hosting: Vercel
