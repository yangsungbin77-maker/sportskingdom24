# 스포츠킹덤24 구축 체크리스트

게임월드7과 동일한 틀로 구축. 진행하며 체크.

## 완료
- [x] gameworld7 템플릿 복제 + 게임 전용 파일 제거
- [x] 의존성 설치(npm install)
- [x] 리테마: 다크 + 에너제틱 오렌지(#ff7a1a), 제목/설명/도메인/배포명 변경
- [x] 헤더·푸터·히어로·소개·블로그 목록 스포츠 문구로 교체(⚽)
- [x] 자동화: 스포츠 주제 큐(15개)·스포츠 출처(sources.json)·PUBLISH.md 스포츠화·state 초기화
- [x] 환영 글 작성, npm run build 통과(루트 URL 구조 상속)

## 남음 (배포 단계 — 사용자 확인 필요)
- [ ] GitHub 저장소 생성·push (yangsungbin77-maker/sportskingdom24)
- [ ] Cloudflare Worker 연결 → 자동배포(`*.workers.dev` 확인)
- [ ] 커스텀 도메인 sportskingdom24.com 연결(네임서버/소유 확인 필요)
- [ ] Higgsfield 재연결 → 스포츠 배너 이미지 풀 생성(src/assets/pool)
- [ ] 예약 작업(이틀 1회 자동 발행) 등록
- [ ] (선택) 검색량 키워드 확보 시 topics.md 교체

## 참고
- CLAUDE.md / context-notes.md 는 아직 게임월드7 내용이 일부 남아 있음 — 정리 예정.
