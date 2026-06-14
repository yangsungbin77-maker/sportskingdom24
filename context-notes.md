# 컨텍스트 노트 — 게임월드7

작업 중 내린 결정과 그 이유를 계속 덧붙인다.

## 2026-06-14 — 프로젝트 시작 배경과 핵심 결정

### 왜 새로 만드는가
- 기존 사이트(`gameworld7.com`, `sportskingdom24.com`)는 워드프레스 + Cloudways 서버로 운영.
- 결제 미납으로 **서버가 완전 삭제(terminate)** 됨. Cloudways 패널 목록에서도 사라짐.
- 백업은 워드프레스 플러그인으로 했으나 외부(구글 드라이브 등) 저장 여부 불확실. 서버 내부에만 있었다면 함께 소실.
- 어차피 "자동 포스팅 블로그"를 만들 계획이었고, 기존 콘텐츠는 SEO 가치가 적어 **새로 시작**하기로 결정.

### 왜 정적 사이트 + Git 인가
- 기존 사고의 본질은 "매달 서버 요금 → 한 번 밀리면 서버째 삭제 → 전부 소실".
- 정적 사이트(Astro) + Git + 무료 호스팅(Cloudflare Pages)으로 가면:
  - 죽을 서버 자체가 없음(다운 불가).
  - Git이 영구 백업 역할 → 같은 사고 원천 차단.
  - 글 작성 = Markdown 파일 추가 후 `git push` → 자동 배포. 자동 포스팅에 가장 적합.
- 사용자가 두 선택지(정적+Git / 워드프레스 재구축) 중 **정적+Git** 선택.

### 환경 관련 결정
- Node.js가 없어 winget으로 설치(v24.16.0).
- 작업 폴더가 한글+공백 경로(`C:\Users\use\클로드 코드`)라 `npm create astro`의 의존성 설치가 실패함.
  → 프로젝트를 **영문 경로 `C:\Users\use\gameworld7`** 에 생성하여 해결. Git 저장소 위치는 한글 폴더일 필요 없음.
- 라이브 미리보기(preview 서버)는 미리보기 도구가 작업 루트(한글 폴더) 밖 경로를 막아 사용 못 함. 대신 `npm run build` 통과로 검증하고, 실제 화면은 배포 후 `*.pages.dev` 주소로 확인하기로 함.

### 블로그 커스터마이징 내용
- `src/consts.ts`: 제목 "게임월드7", 설명 "게임 뉴스 · 공략 · 리뷰...".
- `astro.config.mjs`: `site`를 `https://gameworld7.com`으로.
- 홈(`index.astro`)을 최근 글 목록이 보이도록 재작성, `lang="ko"`.
- 헤더/푸터에서 Astro 기본 소셜 링크 제거, 메뉴 한글화(홈/전체 글/소개).
- 샘플 글 5개 삭제, 첫 글 `welcome.md` 작성.

### 배포 진행 (이어서)
- GitHub 저장소 `yangsungbin77-maker/gameworld7`(공개, main) 생성·push 완료.
- 다음은 Cloudflare Pages에서 이 저장소 연결 → 자동 배포(`*.pages.dev`).

### 도메인
- **등록업체: Namecheap** (gameworld7.com). sportskingdom24.com도 같은 곳일 가능성 높음(미확인).
- 연결 방식: apex 도메인(`gameworld7.com`)을 Pages에 붙이려면 Namecheap의 네임서버를 **Cloudflare 네임서버로 변경**하는 방식이 가장 깔끔(CNAME flattening으로 apex+www 모두 처리). Namecheap은 apex에 CNAME/ALIAS를 안 줘서 네임서버 이전이 사실상 정석.
- **주의:** 네임서버를 Cloudflare로 옮기면 그 도메인의 모든 DNS가 Cloudflare로 넘어감. 만약 이 도메인으로 받는 이메일(MX 레코드)이 있다면 Cloudflare에 다시 추가해야 함. 블로그 도메인이라 이메일은 없을 가능성 높음 — 연결 전 확인 필요.

### 배포 완료 (2026-06-14)
- Cloudflare가 Git 저장소를 Pages가 아닌 **Worker(정적 에셋)** 흐름으로 가져옴. deploy command `npx wrangler deploy`라서 저장소에 `wrangler.jsonc`(name=gameworld7, assets.directory=./dist) 추가하여 해결.
- 라이브 주소: **https://gameworld7.yangsungbin77.workers.dev** (정상 확인).
- Cloudflare ↔ GitHub 연결됨 → `main`에 push하면 자동 재빌드·재배포. "글 쓰면 자동 게시" 파이프라인 작동.
- workers.dev 빌드 Node는 20.x. 빌드/배포 정상.

### 도메인 연결 완료 (2026-06-14)
- Namecheap 네임서버를 Cloudflare(molly/sid.ns.cloudflare.com)로 변경 → Cloudflare에서 Active.
- DNS에서 죽은 A 레코드(gameworld7.com→139.180.136.41) 삭제. 이메일 MX(eforward1~5.registrar-servers.com) 5개와 SPF TXT는 유지(이 도메인은 Namecheap 이메일 포워딩 사용 중).
- gameworld7 Worker에 Custom Domain `gameworld7.com` 연결. (apex에 기존 A 레코드가 있으면 Worker 커스텀 도메인 추가가 막히므로 먼저 삭제해야 함 — 실제로 막혀서 삭제 후 성공.)
- 검증: Cloudflare NS(molly) 질의 시 gameworld7.com→172.64.32.205, HTTPS 200 OK, 게임월드7 페이지 정상 서빙. 공용 DNS 전파만 시차.
- www.gameworld7.com은 apex로 향하는 proxied CNAME이 남아있음 → apex가 Worker로 가므로 www도 따라감(필요시 별도 커스텀 도메인으로 추가 가능).
- Cloudflare 계정 ID: 7db4450a5ec6b8ebdcb7815f4dd5ef34.

### 디자인 (2026-06-14 재디자인)
- 기본 Astro 블로그 템플릿 → **다크 게이밍 테마 + 네온 그린**으로 전면 교체.
- 디자인 토큰은 `src/styles/global.css` `:root`에 정의(--bg #0b0e14, --accent #3ef58b 등). `.btn`/`.btn-ghost`/`.tag` 유틸 클래스 제공.
- 홈은 히어로+피처드+카드 그리드, 글 목록도 카드 그리드, 본문은 760px 다크 가독성 레이아웃. 헤더는 sticky+blur.
- 자매 사이트(sportskingdom24)도 이 테마를 재사용하되 포인트 컬러만 바꾸면 됨.

### ⏳ 다음 세션 TODO (이미지)
- 새 글 `src/content/blog/game-genre-guide.md`(게임 장르 가이드)를 이미지 없이 먼저 발행함.
- **할 일: Higgsfield MCP로 이 글 대표 이미지 생성 → 글에 추가.** 사용자가 "장르 가이드 글에 이미지 넣어줘" 라고 하면 진행.
- 방법: Higgsfield Generate Image로 다크+네온 그린 톤의 게임 장르 콜라주/추상 이미지 생성 → 파일을 `src/assets/`에 저장 → frontmatter에 `heroImage: '../../assets/파일명.jpg'` 추가 → build → push. (heroImage는 astro:assets image()라 로컬 src/assets 경로 필요. 본문 레이아웃/카드가 자동으로 표시함.)
- Higgsfield는 claude.ai 커넥터로 연결됨. 코딩 세션에 도구가 안 보이면 `mcp list`로 확인하고, 그래도 없으면 사용자에게 앱 재시작 안내.

### 자동 발행 인프라 (2026-06-14)
- **목표:** 이틀에 1회, 외부링크1·내부링크1·이미지1을 갖춘 글을 자동 발행.
- **구성:** `automation/` 폴더.
  - `topics.md` — 주제 큐(`- [ ]` 위에서부터 소비, 발행 시 `- [x]`). **떨어지면 사람이 채운다.**
  - `sources.json` — 외부링크 큐레이션 목록(LLM 링크 환각 방지용 신뢰 URL).
  - `prepare.mjs` — 1단계. 주제·이미지·내부/외부링크·날짜를 골라 `assignment.json`(gitignore됨) 출력.
  - `finalize.mjs <slug>` — 3단계. 링크·이미지 포함 검증 → `npm run build` → 주제 체크/상태 갱신 → commit & push.
  - `state.json` — 사용한 이미지·마지막 slug 기록.
  - `PUBLISH.md` — 루틴이 매번 따르는 작업 지시서(톤·형식·절차).
- **이미지:** 매번 생성하지 않고 `src/assets/pool/`의 미리 만든 배너에서 순환 사용(Higgsfield Recraft 4.1 2k로 6장 시드). 풀이 떨어지면 재사용되므로 주기적으로 top-up 권장. 새 배너는 [[gameworld-hero-images]] 방식으로 생성해 pool에 넣으면 됨.
- **스케줄러:** Claude 로컬 예약 작업 `gameworld7-auto-publish`(cron `0 9 */2 * *`, 한국시간 오전 9시 이틀 간격). 저장소 루트의 PC 자격증명·node·git을 그대로 사용. **앱이 열려 있어야 실행됨**(닫혀 있으면 다음 실행 시 보충). 작업 파일: `C:\Users\use\.claude\scheduled-tasks\gameworld7-auto-publish\SKILL.md`.
- **첫 발행(수동 검증):** `co-op-games-for-beginners.md` 정상 발행됨(파이프라인 end-to-end 확인 완료).
- **주의:** `prepare.mjs`의 slug는 사람/에이전트가 영문으로 짓는다(한글 주제 → 영문 kebab). finalize는 외부·내부링크·이미지가 본문에 실제로 있는지 검사 후에만 발행.

### 다음 세션이 알아야 할 것
- 핵심 과제(게임월드7 구축+배포+도메인+디자인) 완료. 글은 `src/content/blog/`에 .md 추가 후 push하면 자동 게시.
- Higgsfield MCP는 claude.ai 커넥터로 연결됨(이미지 생성). 코딩 세션에서 쓰려면 앱 재시작 후 반영.
- 두 번째 사이트 `sportskingdom24.com`은 이 사이트 동일 틀로 복제 예정(Namecheap일 가능성 높음).
