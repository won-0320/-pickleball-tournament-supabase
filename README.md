# 피클볼 대회 앱 (Supabase 버전)

[pickleball-tournament](https://github.com/won-0320/pickleball-tournament)와 화면·기능이 같고, 데이터 저장소만 Firebase Firestore 대신 Supabase(Postgres)를 씁니다.

## 처음 설정

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다. Region은 `Northeast Asia (Seoul)`을 권장합니다.
2. 대시보드 왼쪽 **SQL Editor**에서 `supabase/schema.sql` 내용을 전부 붙여넣고 **Run**을 누릅니다.
3. **Project Settings → API**에서 `Project URL`과 `service_role` 키를 복사합니다.
4. `.env.local.example`을 `.env.local`로 복사하고 값을 채웁니다.
5. 실행합니다.

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000)에 접속합니다. 관리자 화면은 `/admin/login`입니다.

## 배포 (Vercel)

Vercel에서 이 저장소로 새 프로젝트를 만들고, 환경변수 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `SESSION_SECRET`을 넣습니다.

## 구조

- `supabase/schema.sql`: 테이블 `tournaments`, `teams`, `matches`를 정의합니다. 대회를 삭제하면 팀과 경기도 함께 삭제됩니다(cascade).
- `lib/supabase/repo.ts`: 앱의 모든 DB 읽기·쓰기가 여기 모여 있습니다.
- `lib/supabase/mappers.ts`: 코드의 camelCase 필드와 DB의 snake_case 컬럼을 서로 변환합니다.
- RLS가 켜져 있고 정책은 없습니다. 서버만 service_role 키로 접근하고, 브라우저에서는 DB에 직접 접근할 수 없습니다.
