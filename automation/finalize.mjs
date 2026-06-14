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
