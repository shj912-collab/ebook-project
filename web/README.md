# 골프싱크 (Golf-Sync) — 웹

`PRD-GolfSync.md` (또는 `PRD.md`)의 요구사항을 구현한 MVP입니다. Next.js (App Router) + Supabase (PostgreSQL + RLS) 기반으로, 골프 레슨 프로와 회원이 한 화면에서 예약·일지·원포인트를 관리할 수 있습니다.

## 필수 사항

- **Node.js 20+** 와 **npm**
- Supabase 프로젝트 URL과 **anon (또는 publishable) 키**

## 설치 · 실행

```bash
cd web
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 을 엽니다.

## 환경 변수 (`web/.env.local`)

`.env.example` 참고:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` (선택, OAuth 콜백 베이스)

## 구현된 기능 (PRD 대응)

| PRD 항목 | 구현 위치 |
|----------|-----------|
| §3 역할 분리 (PRO/MEMBER) | `Onboarding.tsx`, `users.role` |
| §4.1 레슨 예약 시스템 | `pro/ProSchedulePanel.tsx`, `member/MemberBookingPanel.tsx`, RPC `book_schedule` |
| §4.2 레슨 일지 + 영상 아카이브 | `pro/ProLessonsPanel.tsx`, `member/MemberHistoryPanel.tsx` |
| §4.3 유료 원포인트 (P1, MVP는 결제 모의 처리) | `pro/ProRemotePanel.tsx`, `member/MemberRemotePanel.tsx` |
| §5 페이지 / 화면 구조 | `Dashboard.tsx` (역할별 탭) |
| §6 데이터 모델 | `supabase/migrations/2026050912*.sql` |
| §8 인증/RLS | Supabase Auth (이메일) + 정책 마이그레이션 |

## 향후 작업 (PRD §10 P1/P2)

- [ ] 카카오/구글 소셜 로그인 (`auth.signInWithOAuth`)
- [ ] Mux 업로드 URL 발급 → 영상 인코딩/스트리밍
- [ ] OpenAI Whisper 음성→텍스트 변환 라우트 핸들러
- [ ] 포트원(PortOne) 결제 세션 + 웹훅
- [ ] 카카오 알림톡 발송
- [ ] PRO별 매출/실력 통계 대시보드

## DB 스키마

`supabase/migrations/2026050912*.sql` 4개 파일이 현재 Supabase 프로젝트와 동일한 스키마를 정의합니다. 새 프로젝트에 적용하려면 Supabase SQL Editor 또는 CLI로 순서대로 실행하세요:

1. `20260509120000_golfsync_drop_legacy.sql` (기존 프로젝트 정리, 신규엔 무시 가능)
2. `20260509120100_golfsync_init_schema.sql`
3. `20260509120200_golfsync_auth_sync_and_helpers.sql`
4. `20260509120300_golfsync_rls_policies.sql`

## 보안 참고

- 모든 테이블 RLS 활성화 (PRD §8.2)
- `SECURITY DEFINER` RPC는 `authenticated`만 EXECUTE 가능
- 결제 raw 응답은 클라이언트 SELECT 비허용 (`payments` write는 service role 전용)
- MVP는 이메일 로그인 + 결제 모의 처리. 운영 전 OAuth + 포트원 실 연동 필수.
