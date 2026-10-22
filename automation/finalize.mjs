// 자동 발행 3단계: 빌드 검증 → 주제 큐/상태 갱신 → 커밋·푸시. 인자로 방금 작성한 글의 slug를 받는다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

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

// description 길이 게이트(SERP 스니펫 최적 120~155자) — 심판 반복 지적을 코드로 강제(2026-07-25)
const __descRaw = (post.match(/\ndescription:\s*'((?:''|[^'])*)'/) || [])[1] || '';
const __desc = __descRaw.replace(/''/g, "'");
checks.push([__desc.length >= 120 && __desc.length <= 155, `description이 ${__desc.length}자입니다. 120~155자(키워드 포함)로 맞추세요.`]);
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
const HERMES_PASS = 88;    // 독립 심판(헤르메스) 통과 점수 (10/22 사용자 지시로 90→88)

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
// ── 키워드 3필터 게이트(2026-08-21): 경쟁·수요·의도 확인 증거를 코드로 강제 ──
// 배경: 8/21 진단 — 헤드 키워드(best chatgpt alternatives·마사지건 추천 등)가 필터 실행 기록 없이
// 발행돼 색인·노출 실패. 스킬의 3필터를 research.json 증거 없이는 통과 못 하게 막는다.
const kwf = RG.keyword_filter;
if (!kwf || typeof kwf !== 'object') {
  gate.push([false, `keyword_filter가 없습니다. 발행 전 키워드 3필터(경쟁·수요·의도)를 실제로 확인하고 research.json에 기록해야 발행됩니다.
"keyword_filter": {
  "keyword": "최종 루트 키워드",
  "competition": { "method": "allintitle/serp-scan", "evidence": "allintitle 결과 수, 1페이지 구성(개인 블로그·포럼 존재 여부)", "pass": true },
  "demand":      { "method": "autocomplete/gsc/trends", "evidence": "구글 자동완성 노출·GSC 쿼리 등 수요 근거", "pass": true },
  "intent":      { "method": "serp-scan", "evidence": "상위 결과가 블로그·정보글 위주라는 근거", "pass": true }
}
불합격 필터가 있으면 그 키워드를 버리고 더 롱테일한 키워드로 좁혀 다시 검증하세요(헤드 키워드 발행 금지).`]);
} else {
  for (const k of ['competition', 'demand', 'intent']) {
    const f = kwf[k];
    if (!f || f.pass !== true) {
      gate.push([false, `키워드 필터 "${k}"가 통과(pass:true)로 기록되지 않았습니다. 실제로 확인해 기록하고, 불합격이면 더 롱테일한 키워드로 바꿔 재검증하세요.`]);
    } else if (typeof f.evidence !== 'string' || f.evidence.trim().length < 15) {
      gate.push([false, `키워드 필터 "${k}"의 evidence가 부실합니다(구체 근거 15자 이상). "확인함" 같은 형식 기록은 통과할 수 없습니다.`]);
    }
  }
  if (typeof kwf.keyword !== 'string' || !kwf.keyword.trim()) {
    gate.push([false, 'keyword_filter.keyword(최종 루트 키워드)가 비어 있습니다. 실제 검증한 키워드를 기록하세요.']);
  }
}

// 리뷰·비교 글(type=review/comparison/리뷰/비교)은 데이터 변수 주입을 게이트로 강제. 그 외 유형은 권장(경고만).
if (isReview) gate.push([varCount >= VAR_MIN, `리뷰·비교 글(type=${RG.type})은 데이터 변수 주입(variables) ${VAR_MIN}개 이상이 필요합니다. 현재 ${varCount}개 — research.json의 variables를 채우세요.`]);

// ── 심판루프 안전장치(2026-08-17): 횟수 한도·무진전 중단을 코드로 강제(JUDGE.md 안전장치 4겹) ──
// score_history = 라운드별 심판 점수 기록(초판 포함, 최대 4개). 예: "score_history": [84, 88, 91]
const scoreHistory = Array.isArray(RG.score_history) ? RG.score_history.map(Number) : null;
if (!scoreHistory || scoreHistory.length === 0 || scoreHistory.some((n) => !Number.isFinite(n))) {
  gate.push([false, '심판 점수 이력이 없습니다. research.json에 라운드별 점수를 "score_history": [초판, 재채점, ...] 숫자 배열로 기록하세요(최대 4개).']);
} else {
  if (scoreHistory.length > 4) gate.push([false, `심판 호출이 ${scoreHistory.length}회 기록됐습니다. 한도는 4회(초판 1 + 재채점 3)입니다 — 횟수 한도 위반.`]);
  if (scoreHistory[scoreHistory.length - 1] !== hermes) gate.push([false, `score_history 마지막 값(${scoreHistory[scoreHistory.length - 1]})이 hermes_score(${RG.hermes_score})와 다릅니다. 실제 최종 점수만 기록하세요.`]);
  const stallIdx = scoreHistory.findIndex((s, i) => i > 0 && s - scoreHistory[i - 1] < 2);
  if (stallIdx !== -1 && stallIdx < scoreHistory.length - 1) gate.push([false, `무진전 중단 위반: 재채점이 +2점 미만 상승(${scoreHistory[stallIdx - 1]}→${scoreHistory[stallIdx]})이면 그 자리에서 루프를 멈추고 보고해야 하는데 계속 돌렸습니다.`]);
}
// ── 구성 회전·빈틈 3개·이미지 변주 게이트(2026-10-02, 도토리AI 영상분석에서 도입) ──
// 배경: AI 글은 뼈대·사진 수가 매번 같아서 티가 나고, 상위 글 요약 재조합이면 새 정보가 없다.
{
  const STRUCTURES = ['결론먼저', '궁금증추적', '문제해결', '비교선택', '장면출발', '오해바로잡기', '과정따라가기', '핵심발견확장', '질문연결', '관점제시'];
  const resDir = join(__dirname, 'research');
  const { readdirSync, statSync } = await import('node:fs');
  // 직전 글 2편(이 글 제외, research 파일 수정시각 최신순, 글 파일이 실제로 있는 것만)
  const prev = readdirSync(resDir)
    .filter((f) => f.endsWith('.json') && f !== `${slug}.json`)
    .map((f) => ({ f, t: statSync(join(resDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .map(({ f }) => f.replace(/\.json$/, ''))
    .filter((s) => existsSync(join(root, 'src', 'content', 'blog', `${s}.md`)))
    .slice(0, 2);
  const readJson = (s) => { try { return JSON.parse(readFileSync(join(resDir, `${s}.json`), 'utf8')); } catch { return {}; } };
  const imgCount = (md) => 1 + (md.replace(/^---[\s\S]*?\n---\s*/, '').match(/!\[[^\]]*\]\([^)]+\)/g) || []).length; // 히어로 1 + 본문

  // ① 글 구성 10종 중 1개를 기록, 직전 2편과 같은 구성 금지
  const st = String(RG.structure || '').replace(/\s/g, '');
  if (!STRUCTURES.includes(st)) {
    gate.push([false, `research.json에 "structure"(글 구성)가 없거나 틀렸습니다. 다음 10개 중 하나: ${STRUCTURES.join('·')}`]);
  } else {
    const used = prev.map((s) => String(readJson(s).structure || '').replace(/\s/g, '')).filter(Boolean);
    if (used.includes(st)) gate.push([false, `글 구성 "${st}"는 직전 글(${prev.join(', ')})에서 이미 썼습니다. 다른 구성으로 바꾸세요(뼈대 반복 = AI 티).`]);
  }

  // ② 상위 글이 빠뜨린 빈틈 3개 + 우리 글 어느 소제목에서 채웠는지
  const gaps = Array.isArray(RG.gaps) ? RG.gaps : [];
  const goodGaps = gaps.filter((g) => g && typeof g.gap === 'string' && g.gap.trim().length >= 15
    && typeof g.covered_in === 'string' && g.covered_in.trim() && post.includes(g.covered_in.trim()));
  if (goodGaps.length < 3) {
    gate.push([false, `빈틈 기록이 ${goodGaps.length}개뿐입니다. 상위 글들이 빠뜨린 것 3개 이상을 research.json에 기록하세요.
"gaps": [ { "gap": "상위 10개 중 아무도 안 다룬 구체 내용(15자+)", "covered_in": "그걸 채운 우리 글의 소제목 문구(본문에 그대로 있어야 함)" }, ... ]`]);
  }

  // ③ 이미지 2~4장, 직전 2편과 장수가 셋 다 같으면 차단
  const myImgs = imgCount(post);
  if (myImgs < 2 || myImgs > 4) gate.push([false, `이미지가 ${myImgs}장입니다(히어로 포함). 2~4장으로 맞추세요.`]);
  const prevImgs = prev.map((s) => imgCount(readFileSync(join(root, 'src', 'content', 'blog', `${s}.md`), 'utf8')));
  if (prevImgs.length === 2 && prevImgs.every((n) => n === myImgs)) {
    gate.push([false, `이미지 장수가 직전 2편과 똑같이 ${myImgs}장입니다. 장수를 바꾸세요(2~4장 사이, 비율도 16:9·4:3·1:1 섞기).`]);
  }
  if (!gate.some(([ok]) => !ok)) console.log(`✔ 구성 ${st} · 빈틈 ${goodGaps.length}개 · 이미지 ${myImgs}장(직전 ${prevImgs.join('/') || '-'})`);
}
// ── 구글 신뢰 게이트(2026-10-15): 구글 색인 연구 규칙집 G1·G3·G4·G6·G8·G9·G10을 코드로 강제 ──
// 배경: 블로그 색인률 17~69%·28일 노출 0~5. 구글은 "누구나 쓸 수 있는 글"을 색인하지 않는다.
// 규칙집: C:\Users\use\클로드 코드\블로그자동발행-full\구글-색인-규칙집-2026-10.md
{
  const { readdirSync: __rd, statSync: __st } = await import('node:fs');
  const { dirname: __dn } = await import('node:path');
  const blogDir = join(root, 'src', 'content', 'blog');
  const bodyOf = (md) => md.replace(/^---[\s\S]*?\n---\s*/, '');
  const fmVal = (md, key) => {
    const m = md.match(new RegExp(`\\n${key}:\\s*(.+)`));
    if (!m) return '';
    return m[1].trim().replace(/^(['"])([\s\S]*)\1$/, '$2').replace(/''/g, "'");
  };
  const others = __rd(blogDir)
    .filter((f) => /\.mdx?$/.test(f) && f.replace(/\.mdx?$/, '') !== slug)
    .map((f) => ({ s: f.replace(/\.mdx?$/, ''), md: readFileSync(join(blogDir, f), 'utf8') }));
  const myBody = bodyOf(post);

  // G1 우리만 가진 증거 1개 이상(직접 찍은 사진·캡처·직접 만든 표·계산·테스트·자체 데이터)
  const OWN_TYPES = ['photo', 'screenshot', 'table', 'calc', 'test', 'data'];
  const own = Array.isArray(RG.own_evidence) ? RG.own_evidence : [];
  const ownOk = [];
  for (const e of own) {
    if (!e || !OWN_TYPES.includes(e.type) || typeof e.desc !== 'string' || e.desc.trim().length < 15
      || typeof e.proof !== 'string' || !e.proof.trim()) {
      gate.push([false, `own_evidence 항목 형식이 틀렸습니다: ${JSON.stringify(e).slice(0, 80)} — type(${OWN_TYPES.join('/')})·desc(15자+)·proof가 모두 필요합니다.`]);
      continue;
    }
    const p = e.proof.trim();
    if (e.type === 'photo' || e.type === 'screenshot') {
      const file = p.startsWith('/') ? join(root, 'public', p) : join(__dn(postPath), p);
      const name = p.split('/').pop();
      const reused = others.filter((o) => o.md.includes(name)).map((o) => o.s);
      if (!post.includes(p)) gate.push([false, `own_evidence 이미지 "${p}"가 글에 들어 있지 않습니다. 본문이나 heroImage에 그 경로 그대로 넣으세요.`]);
      else if (!existsSync(file)) gate.push([false, `own_evidence 이미지 파일이 없습니다 → ${file}`]);
      else if (/banner|default|placeholder/i.test(name) || reused.length) gate.push([false, `own_evidence 이미지 "${name}"는 공용 배너거나 다른 글(${reused.slice(0, 3).join(', ')})도 쓰는 사진입니다. 이 글 전용으로 직접 찍거나 캡처한 사진이어야 합니다.`]);
      else ownOk.push(e);
    } else if (p.length < 10 || !myBody.includes(p)) {
      gate.push([false, `own_evidence(${e.type})의 proof 문구가 본문에 그대로 없습니다(10자+): "${p.slice(0, 40)}"`]);
    } else ownOk.push(e);
  }
  if (!ownOk.length) {
    gate.push([false, `우리만 가진 증거가 없습니다(G1 — 구글은 "누구나 쓸 수 있는 글"을 색인하지 않음). research.json에 1개 이상 기록하세요.
"own_evidence": [
  { "type": "photo|screenshot|table|calc|test|data", "desc": "무엇을 직접 했는지(15자+)", "proof": "이미지 경로(본문에 그대로) 또는 직접 만든 표·계산이 담긴 본문 문구(10자+)" }
]
공용 배너·AI 그림·남의 사진은 증거가 아닙니다.`]);
  }
  // G8 리뷰·비교 글은 직접 써 본 증거(캡처·테스트)가 꼭 있어야 한다
  if (isReview && !ownOk.some((e) => e.type === 'screenshot' || e.type === 'test')) {
    gate.push([false, `리뷰·비교 글(type=${RG.type})은 직접 써 본 증거가 필요합니다(G8). own_evidence에 type "screenshot"(직접 캡처) 또는 "test"(직접 잰 숫자)를 1개 이상 넣으세요.`]);
  }

  // G3 틀에 박힌 가짜 경험 문장 금지(실제로 한 일만 1인칭으로)
  const FAKE = [
    /한참\s*(을\s*)?(헤맸|헷갈렸)/,
    /(저도|제가)\s*처음\s*(찾아|검색|알아)[^.\n]{0,20}(헤맸|헷갈|몰랐)/,
    /솔직히\s*(말하면\s*)?저도\s*처음/,
    /\bI (was|got) (totally |so |pretty )?(confused|lost) when I first\b/i,
    /\bWhen I first (started )?(looking|researching|searching|digging)\b/i,
    /\bI spent (hours|days) (researching|digging|comparing|reading)\b/i,
  ];
  const fakeHits = FAKE.map((r) => (myBody.match(r) || [])[0]).filter(Boolean);
  if (fakeHits.length) gate.push([false, `틀에 박힌 가짜 경험 문장이 있습니다(G3): "${fakeHits.join('", "')}" — 지우고, 실제로 한 일(직접 계산·캡처·사진·표)만 1인칭으로 쓰세요.`]);

  // G4 첫 줄 틀 반복 금지: 직전 2편과 첫 줄 앞부분이 셋 다 같으면 차단
  const resDir = join(__dirname, 'research');
  const prev2 = (existsSync(resDir) ? __rd(resDir) : [])
    .filter((f) => f.endsWith('.json') && f !== `${slug}.json`)
    .map((f) => ({ s: f.replace(/\.json$/, ''), t: __st(join(resDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .map(({ s }) => others.find((o) => o.s === s))
    .filter(Boolean)
    .slice(0, 2);
  const openSig = (md) => {
    const line = bodyOf(md).split('\n').map((l) => l.trim())
      .find((l) => l && !l.startsWith('![') && !l.startsWith('import ') && !l.startsWith('<')) || '';
    return line.replace(/[*_>#`\s:：.!?。]/g, '').slice(0, 8);
  };
  const mySig = openSig(post);
  if (mySig && prev2.length === 2 && prev2.every((o) => openSig(o.md) === mySig)) {
    gate.push([false, `첫 줄이 직전 2편(${prev2.map((o) => o.s).join(', ')})과 똑같이 "${mySig}…"로 시작합니다(G4 — 같은 틀 반복 = AI 티). 시작 방식을 바꾸세요.`]);
  }

  // G9 대표 이미지는 이 글 전용(공용 배너·다른 글과 같은 이미지 금지)
  const heroName = fmVal(post, 'heroImage').split('/').pop();
  if (heroName) {
    const heroUsers = others.filter((o) => fmVal(o.md, 'heroImage').split('/').pop() === heroName).map((o) => o.s);
    if (heroUsers.length) gate.push([false, `대표 이미지 ${heroName}를 다른 글(${heroUsers.slice(0, 3).join(', ')})도 씁니다(G9). 이 글 전용 이미지로 바꾸세요.`]);
    else if (/^banner[-_]/i.test(heroName)) gate.push([false, `대표 이미지 ${heroName}가 공용 배너입니다(G9). 이 글 전용 이미지로 바꾸세요.`]);
  }

  // G10 같은 사이트에 비슷한 제목의 글이 있으면 새로 쓰지 말고 기존 글 보강(사유를 남기면 통과)
  const STOP = new Set(['the', 'and', 'for', 'with', 'how', 'what', 'best', 'vs', 'your', 'you', '2025', '2026', '정리', '총정리', '가이드', '방법', '추천', '완벽', '한눈에', '이유', '차이']);
  const toks = (t) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 2 && !STOP.has(w)));
  const myTitle = fmVal(post, 'title');
  const myToks = toks(myTitle);
  const twins = others.map((o) => {
    const ot = toks(fmVal(o.md, 'title'));
    const inter = [...myToks].filter((w) => ot.has(w)).length;
    return { s: o.s, r: myToks.size && ot.size ? inter / Math.min(myToks.size, ot.size) : 0 };
  }).filter((x) => x.r >= 0.6);
  const overlapReason = typeof RG.overlap_ok === 'string' && RG.overlap_ok.trim().length >= 20;
  if (twins.length && !overlapReason) {
    gate.push([false, `제목이 비슷한 기존 글이 있습니다(G10): ${twins.map((x) => `${x.s}(${Math.round(x.r * 100)}%)`).join(', ')}. 새로 쓰지 말고 그 글을 보강하세요. 정말 다른 글이면 research.json에 "overlap_ok": "무엇이 어떻게 다른지(20자+)"를 남기세요.`]);
  }

  // G6 제목에 실제 검색어(keyword_filter.keyword)가 들어 있어야 한다
  const kw = String((RG.keyword_filter && RG.keyword_filter.keyword) || '').toLowerCase().trim();
  if (kw && myTitle) {
    const tNorm = myTitle.toLowerCase().replace(/\s/g, '');
    const kwToks = kw.split(/\s+/).filter(Boolean);
    const hit = kwToks.filter((w) => tNorm.includes(w)).length;
    if (hit / kwToks.length < 0.7) gate.push([false, `제목에 실제 검색어 "${kw}"가 거의 없습니다(G6, ${hit}/${kwToks.length}단어). 사람들이 치는 말 그대로 제목 앞쪽에 넣으세요.`]);
  }

  if (!gate.some(([ok]) => !ok)) console.log(`✔ 구글 신뢰 게이트 — 자체 증거 ${ownOk.length}개(${ownOk.map((e) => e.type).join('/')}) · 틀 문장 0 · 대표 이미지 전용 · 겹치는 제목 ${twins.length ? '사유 기록' : '없음'}`);
}
const gateFailed = gate.filter(([ok]) => !ok).map(([, m]) => m);
if (gateFailed.length) {
  console.error('FINALIZE_ERROR: 글쓰기 절차 증거 게이트 미충족\n- ' + gateFailed.join('\n- '));
  process.exit(1);
}
if (!isReview && varCount < VAR_MIN) console.warn(`⚠️ 데이터 변수 주입이 ${varCount}개뿐입니다(권장 5개). 리뷰·비교 글이면 research.json에 "type":"review"를 넣어 강제하세요.`);
console.log(`✔ 증거 게이트 통과 — SERP ${openedCount}개 열람 · 팩트체크 ${factcheck.length}건 · 헤르메스 ${hermes}점${scoreHistory ? ` · 심판 ${scoreHistory.length}라운드` : ''}${isReview ? ` · 변수 ${varCount}개(리뷰형)` : ''}`);

const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

// 0) 가이드 허브(/guide/) 클러스터 등록. 하단 '전체 축구 글'은 자동이지만 상단 클러스터
//    지도는 수동이라, 등록을 빠뜨리면 새 글이 주제별 지도에서 영영 빠진다.
//    빌드 전에 넣어야 이번 빌드 결과물에 반영된다.
// 순서가 곧 우선순위다. 좁은 주제를 먼저 두어야 "K리그 중계"가 '리그 · 대회'로 새지 않는다.
const GUIDE_RULES = [
  ['감독 · 지도자', /감독|사령탑|지도자/],
  ['입문 · 규칙', /규칙|오프사이드|파울|카드|VAR|세트피스|추가시간/],
  ['관전 · 중계', /중계|직관|티켓|경기장|응원|시청|쿠팡|스포츠 ?패스|구독/],
  ['장비 · 풋살 · 용어', /축구화|유니폼|등번호|보호대|장비|풋살|용어/],
  ['포지션 · 전술', /전술|포메이션|포지션|압박|빌드업|프레싱/],
  ['선수', /선수|프로필|기록 비교|이적/],
  ['리그 · 대회', /리그|상금|월드컵|챔피언스|ACL|아시안|아시아|유로|트로피|우승|대회|컵|스쿼드|명단/],
];
const guidePath = join(root, 'src', 'pages', 'guide.astro');
let guideSrc = readFileSync(guidePath, 'utf8');

if (new RegExp(`link\\('${slug}'`).test(guideSrc)) {
  console.log(`▶ 가이드 등록 생략 — 이미 등록된 글입니다(${slug}).`);
} else {
  const hint = `${assignment.topic} ${slug}`;
  const cluster = (GUIDE_RULES.find(([, re]) => re.test(hint)) || [])[0] || '이슈 · 핫토픽';
  const label = String(assignment.topic).replace(/'/g, "\\'");

  const cStart = guideSrc.indexOf(`title: '${cluster}'`);
  if (cStart === -1) {
    console.error(`FINALIZE_ERROR: guide.astro에 '${cluster}' 클러스터가 없습니다. 클러스터를 먼저 만들거나 GUIDE_RULES를 고치세요.`);
    process.exit(1);
  }
  const itemsStart = guideSrc.indexOf('items: [', cStart);
  const insertAt = itemsStart + 'items: ['.length;
  guideSrc = guideSrc.slice(0, insertAt) + `\n\t\t\tlink('${slug}', '${label}'),` + guideSrc.slice(insertAt);
  writeFileSync(guidePath, guideSrc);
  console.log(`▶ 가이드 등록: ${cluster} ← ${slug}`);
}

// 1) 빌드가 깨지면 발행 중단.
console.log('▶ 빌드 검증...');
run('npm run build');

// ── 렌더 품질 게이트(빌드 후·커밋 전): 볼드버그·FAQ 스키마를 코드로 강제(2026-07-25) ──
{
  const __distHtmlPath = join(root, 'dist', slug, 'index.html');
  if (!existsSync(__distHtmlPath)) {
    console.error(`FINALIZE_ERROR: 빌드 결과물이 없습니다 → dist/${slug}/index.html`);
    process.exit(1);
  }
  const __distHtml = readFileSync(__distHtmlPath, 'utf8');
  const __distFails = [];
  if (__distHtml.includes('**')) __distFails.push('빌드 HTML에 리터럴 **가 노출됩니다(CJK 볼드버그). 볼드 안의 괄호·따옴표를 밖으로 빼세요(예: **이름**(영문) O / **이름(영문)** X).');
  if (!__distHtml.includes('"@type":"FAQPage"')) __distFails.push('FAQPage 스키마가 생성되지 않았습니다. 이 사이트의 FAQ 형식(1줄/2줄)을 기존 글과 대조하세요.');
  if (__distFails.length) {
    console.error('FINALIZE_ERROR: 렌더 품질 게이트 미충족(커밋 전 차단)\n- ' + __distFails.join('\n- '));
    process.exit(1);
  }
  console.log('✔ 렌더 게이트 통과 — 볼드버그 0 · FAQPage 스키마 OK');
}


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

// 5) 대시보드(블로그자동발행-full)의 발행 큐 자동 동기화.
//    queue.json에서 방금 쓴 글을 '완료'로 바꿔 localhost:8501에 즉시 반영.
//    실패해도 발행 자체엔 영향 없음(best-effort).
try {
  const dashDir = process.env.BLOG_DASHBOARD_DIR
    || 'C:\\Users\\use\\클로드 코드\\블로그자동발행-full';
  const syncScript = join(dashDir, 'sync_done.py');
  if (existsSync(syncScript)) {
    console.log('▶ 대시보드 발행 큐 동기화...');
    const site = basename(root); // 저장소 폴더명 = 큐의 사이트 라벨
    // 큐 키워드를 정확히 알면 QUEUE_KW로 넘기면 100% 매칭, 없으면 제목 토큰 매칭.
    const kwArg = process.env.QUEUE_KW ? ` --kw "${process.env.QUEUE_KW}"` : '';
    execSync(`py "${syncScript}" --site "${site}" --title "${assignment.topic}"${kwArg}`,
      { stdio: 'inherit' });
  }
} catch (e) {
  console.warn('⚠️ 대시보드 큐 동기화 실패(발행은 정상 완료됨):', e.message);
}

// IndexNow 즉시 색인 요청 (Bing·네이버·Yandex). 발행 직후 '극최신' 노출 극대화. 실패해도 발행엔 영향 없음.
try {
  const __cfg = readFileSync(join(root, 'astro.config.mjs'), 'utf8');
  const __siteUrl = ((__cfg.match(/site:\s*['"]([^'"]+)['"]/) || [])[1] || '').replace(/\/+$/, '');
  const __KEY = '08d35b8779806b9edf8ef0ed944d239e';
  if (__siteUrl) {
    const __url = `${__siteUrl}/${slug}/`;
    const __res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(__siteUrl).host, key: __KEY, keyLocation: `${__siteUrl}/${__KEY}.txt`, urlList: [__url] }),
    });
    console.log(`▶ IndexNow 색인 요청(Bing·네이버·Yandex): ${__url} → HTTP ${__res.status}`);
  } else {
    console.warn('⚠️ astro.config.mjs에서 site URL을 못 찾아 IndexNow 생략');
  }
} catch (e) {
  console.warn('⚠️ IndexNow 색인 요청 실패(발행은 정상 완료됨):', e.message);
}

console.log(`\n✅ 발행 완료: /${slug}/`);
