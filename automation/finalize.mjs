// 자동 발행 3단계: 빌드 검증 → 주제 큐/상태 갱신 → 커밋·푸시. 인자로 방금 작성한 글의 slug를 받는다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const slug = process.argv[2];
if (!slug) {
  console.error('FINALIZE_ERROR: slug 인자가 필요합니다. 예) node automation/finalize.mjs co-op-games-for-beginners');
  process.exit(1);
}

const postPath = join(root, 'src', 'content', 'blog', `${slug}.md`);
if (!existsSync(postPath)) {
  console.error(`FINALIZE_ERROR: ${postPath} 가 없습니다. 글을 먼저 작성했는지 확인하세요.`);
  process.exit(1);
}

const assignment = JSON.parse(readFileSync(join(__dirname, 'assignment.json'), 'utf8'));
const post = readFileSync(postPath, 'utf8');

// 본문(frontmatter 제외) 분량·소제목 수 측정.
const body = post.replace(/^---[\s\S]*?\n---\s*/, '').trim();
const bodyLen = body.replace(/\s/g, '').length; // 공백 제외 글자 수
const h2Count = (body.match(/^##\s/gm) || []).length;
const MIN_BODY = 2200; // 공백 제외 최소 글자 수(전문가 분량 강제)
const MIN_H2 = 6;

// 발행 조건 검증: 외부링크 1·내부링크 1·이미지 1 + 최소 분량·소제목 수.
const checks = [
  [post.includes(assignment.externalLink.url), `외부링크(${assignment.externalLink.url})가 본문에 없습니다.`],
  [post.includes(assignment.internalLink.url), `내부링크(${assignment.internalLink.url})가 본문에 없습니다.`],
  [post.includes(assignment.imageFile), `대표 이미지(${assignment.imageFile})가 heroImage로 지정되지 않았습니다.`],
  [bodyLen >= MIN_BODY, `본문이 너무 짧습니다(공백 제외 ${bodyLen}자). 최소 ${MIN_BODY}자 이상으로 충실하게 쓰세요.`],
  [h2Count >= MIN_H2, `소제목(##)이 ${h2Count}개뿐입니다. 5~7개로 구성하세요.`],
];
const failed = checks.filter(([ok]) => !ok).map(([, msg]) => msg);
if (failed.length) {
  console.error('FINALIZE_ERROR: 발행 조건 미충족\n- ' + failed.join('\n- '));
  process.exit(1);
}

// ── 글쓰기 절차 증거 게이트 ──────────────────────────────────────────────
// SERP 해부·팩트체크·독립 심판을 "빼먹지 않고 매번" 강제한다. 증거는 사람 기억이
// 아니라 automation/research/<slug>.json 파일로 남기고, 미달이면 빌드 전에 차단한다.
const researchPath = join(__dirname, 'research', `${slug}.json`);
if (!existsSync(researchPath)) {
  console.error(`FINALIZE_ERROR: 증거 파일이 없습니다 → automation/research/${slug}.json
이 글의 SERP 해부·팩트체크·헤르메스 심판 증거를 아래 형식으로 남겨야 발행됩니다.
{
  "serp":     [ { "url": "경쟁글 URL", "opened": true, "note": "분석 메모" }, ... 상위 10개 시도 ],
  "factcheck":[ { "claim": "핵심 수치/사실", "sources": ["출처1","출처2"] }, ... 핵심마다 2곳+ ],
  "variables":{ "keyword": "...", "headline_finding": "...", ... 데이터 변수 주입 },
  "hermes_score": 91
}`);
  process.exit(1);
}

const RG = JSON.parse(readFileSync(researchPath, 'utf8'));
const SERP_MIN_OPENED = 8; // 직접 연 경쟁글 최소 수(상위 10개 시도, 서버차단 2개까지 허용)
const FACTCHECK_MIN = 3;   // 1차/신뢰 출처로 교차한 핵심 수치 최소 개수
const HERMES_PASS = 90;    // 독립 심판(헤르메스) 통과 점수

const serp = Array.isArray(RG.serp) ? RG.serp : [];
const openedCount = serp.filter((s) => s && s.opened === true).length;
const factcheck = Array.isArray(RG.factcheck) ? RG.factcheck : [];
const factOk = factcheck.length >= FACTCHECK_MIN
  && factcheck.every((f) => Array.isArray(f.sources) && f.sources.length >= 2);
const hermes = Number(RG.hermes_score);

const varCount = RG.variables ? Object.keys(RG.variables).length : 0;
const VAR_MIN = 3; // 리뷰·비교 글의 데이터 변수 주입 최소 개수
const isReview = ['review', 'comparison', '리뷰', '비교'].includes(String(RG.type || '').trim().toLowerCase());

const gate = [
  [openedCount >= SERP_MIN_OPENED, `SERP 경쟁글을 ${openedCount}개만 직접 열었습니다. 상위 10개를 시도해 최소 ${SERP_MIN_OPENED}개를 research.json의 serp[].opened=true로 기록하세요.`],
  [factOk, `팩트체크가 부족합니다. 핵심 수치/사실 ${FACTCHECK_MIN}건 이상을 각각 출처 2곳 이상으로 교차한 기록(factcheck[].sources)이 필요합니다.`],
  [Number.isFinite(hermes) && hermes >= HERMES_PASS, `헤르메스 심판 점수가 ${RG.hermes_score ?? '없음'}입니다. ${HERMES_PASS}점 이상이어야 발행됩니다.`],
];
// 리뷰·비교 글(type=review/comparison/리뷰/비교)은 데이터 변수 주입을 게이트로 강제. 그 외 유형은 권장(경고만).
if (isReview) gate.push([varCount >= VAR_MIN, `리뷰·비교 글(type=${RG.type})은 데이터 변수 주입(variables) ${VAR_MIN}개 이상이 필요합니다. 현재 ${varCount}개 — research.json의 variables를 채우세요.`]);

const gateFailed = gate.filter(([ok]) => !ok).map(([, m]) => m);
if (gateFailed.length) {
  console.error('FINALIZE_ERROR: 글쓰기 절차 증거 게이트 미충족\n- ' + gateFailed.join('\n- '));
  process.exit(1);
}
if (!isReview && varCount < VAR_MIN) console.warn(`⚠️ 데이터 변수 주입이 ${varCount}개뿐입니다(권장 5개). 리뷰·비교 글이면 research.json에 "type":"review"를 넣어 강제하세요.`);
console.log(`✔ 증거 게이트 통과 — SERP ${openedCount}개 열람 · 팩트체크 ${factcheck.length}건 · 헤르메스 ${hermes}점${isReview ? ` · 변수 ${varCount}개(리뷰형)` : ''}`);

const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

// 1) 빌드가 깨지면 발행 중단.
console.log('▶ 빌드 검증...');
run('npm run build');

// 2) 주제 큐에서 방금 쓴 주제를 발행 완료로 표시.
const topicsPath = join(__dirname, 'topics.md');
const topicLines = readFileSync(topicsPath, 'utf8').split(/\r?\n/);
// 키워드 substring 충돌을 피하려고 줄 전체가 정확히 일치하는 첫 항목만 체크 처리.
const idx = topicLines.findIndex((l) => l === `- [ ] ${assignment.topic}`);
if (idx !== -1) topicLines[idx] = `- [x] ${assignment.topic}`;
writeFileSync(topicsPath, topicLines.join('\n'));

// 3) 사용한 이미지 기록.
const statePath = join(__dirname, 'state.json');
const state = JSON.parse(readFileSync(statePath, 'utf8'));
if (!state.usedImages.includes(assignment.imageFile)) state.usedImages.push(assignment.imageFile);
state.lastSlug = slug;
writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');

// 4) 커밋·푸시 → Cloudflare 자동 배포.
console.log('▶ 커밋·푸시...');
run('git add -A');
run(`git commit -m "자동 발행: ${assignment.topic}"`);
run('git push');

console.log(`\n✅ 발행 완료: /${slug}/`);
