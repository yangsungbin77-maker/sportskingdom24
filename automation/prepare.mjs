// 자동 발행 1단계: 다음 글의 '재료'(주제·이미지·내부링크·외부링크·날짜)를 결정해 assignment.json으로 출력한다.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const blogDir = join(root, 'src', 'content', 'blog');
const poolDir = join(root, 'src', 'assets', 'pool');

const fail = (msg) => {
  console.error('PREPARE_ERROR: ' + msg);
  process.exit(1);
};

// 1) 주제 큐에서 첫 번째 미발행 항목을 꺼낸다.
const topicsPath = join(__dirname, 'topics.md');
const topicsRaw = readFileSync(topicsPath, 'utf8');
const topicLine = topicsRaw.split(/\r?\n/).find((l) => /^- \[ \] /.test(l));
if (!topicLine) fail('발행할 주제가 없습니다. automation/topics.md에 "- [ ] 주제"를 추가하세요.');
const topic = topicLine.replace(/^- \[ \] /, '').trim();

// 2) 상태(사용한 이미지 기록)를 읽는다.
const statePath = join(__dirname, 'state.json');
const state = JSON.parse(readFileSync(statePath, 'utf8'));

// 3) 이미지 풀에서 아직 안 쓴 배너를 고른다(다 썼으면 가장 오래전 것부터 다시 순환).
const pool = readdirSync(poolDir).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)).sort();
if (pool.length === 0) fail('src/assets/pool 에 이미지가 없습니다.');

// 배너 키워드 맵(banner-map.json, 선택): 주제에 맞는 배너를 우선 지정 — 순환 오배정(예: 축구 글에 농구 배너) 방지(2026-07-25)
let __mappedBanner = null;
try {
  for (const m of JSON.parse(readFileSync(join(__dirname, 'banner-map.json'), 'utf8'))) {
    if (new RegExp(m.pattern).test(topic) && pool.includes(m.file)) { __mappedBanner = m.file; break; }
  }
} catch {}
let image = pool.find((f) => !state.usedImages.includes(f));
if (!image) image = pool[state.usedImages.length % pool.length];
if (__mappedBanner) image = __mappedBanner;

// 4) 내부링크용 기존 글을 고른다(주제 단어와 제목이 가장 많이 겹치는 글, 없으면 첫 글).
const words = topic.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w.length >= 2);
const posts = readdirSync(blogDir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const text = readFileSync(join(blogDir, f), 'utf8');
    const title = (text.match(/title:\s*'([^']+)'/) || [])[1] || f.replace(/\.md$/, '');
    return { slug: f.replace(/\.md$/, ''), title };
  });
if (posts.length === 0) fail('내부링크로 걸 기존 글이 없습니다.');
const scorePost = (p) => words.reduce((s, w) => s + (p.title.includes(w) ? 1 : 0), 0);
const internal = posts.slice().sort((a, b) => scorePost(b) - scorePost(a))[0];

// 기발행 중복 가드: 주제 단어가 기존 글 제목과 과반 겹치면 경고 — 자동발행분이 큐에 대기로 남는 함정(2026-07-25)
const __dup = posts
  .map((p) => ({ p, r: words.length ? words.filter((w) => p.title.includes(w)).length / words.length : 0 }))
  .sort((a, b) => b.r - a.r)[0];
if (__dup && words.length >= 3 && __dup.r >= 0.6) {
  console.warn(`⚠️ 기발행 의심(${Math.round(__dup.r * 100)}% 겹침): "${__dup.p.title}" (/${__dup.p.slug}/) — 중복이면 쓰지 말고 topics.md에서 [x] 처리 후 prepare를 다시 돌리세요.`);
}


// 5) 외부링크를 고른다(주제 단어와 태그가 가장 많이 겹치는 출처, 없으면 순환 선택).
const sources = JSON.parse(readFileSync(join(__dirname, 'sources.json'), 'utf8'));
const scoreSrc = (s) => words.reduce((acc, w) => {
  let best = 0;
  for (const t of s.tags) {
    if (t === w) best = Math.max(best, 3);               // 정확히 일치하는 태그(예: 주제 '야구' ↔ KBO 태그 '야구')는 강하게
    else if (t.includes(w) || w.includes(t)) best = Math.max(best, 1); // '규칙과'↔'규칙' 같은 부분일치는 약하게
  }
  return acc + best;
}, 0);
const ranked = sources.map((s) => ({ s, score: scoreSrc(s) })).sort((a, b) => b.score - a.score);
const external = ranked[0].score > 0 ? ranked[0].s : sources[state.usedImages.length % sources.length];

// 6) 발행 날짜(영문 'Jun 14 2026' 형식, 기존 글과 동일).
const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const d = new Date();
const pubDate = `${M[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')} ${d.getFullYear()}`;

const assignment = {
  topic,
  pubDate,
  heroImage: `../../assets/pool/${image}`,
  imageFile: image,
  internalLink: { url: `/${internal.slug}/`, title: internal.title },
  externalLink: { url: external.url, label: external.label },
};

writeFileSync(join(__dirname, 'assignment.json'), JSON.stringify(assignment, null, 2));

console.log('=== 다음 글 작성 지시 ===');
console.log(JSON.stringify(assignment, null, 2));
console.log('\n위 내용으로 src/content/blog/<영문-slug>.md 를 작성한 뒤, node automation/finalize.mjs <slug> 를 실행하세요.');
