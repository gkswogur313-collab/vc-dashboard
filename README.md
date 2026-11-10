# VC·투자 통합 대시보드 (jh-vc-dashboard)

VC 업무(딜 검토·포트폴리오·출자사업), 개인 주식투자, 일정·업무를 한 화면에서 관리하는
**정적 웹 대시보드**입니다. 별도 서버·DB 없이 **GitHub만으로** 배포·저장됩니다.

- 배포 주소: 비공개(Cloudflare Pages) — 저장소에 적지 않습니다. 주소를 바꾸면 GitHub Secrets의 `SITE_URL`도 함께 바꿉니다.
- 기술 스택: Vite + React (순수 정적 빌드) · GitHub Pages · GitHub Actions 자동 배포
- 데이터: `public/data/*.json` (영속 데이터) + 사용자 GitHub 토큰으로 커밋 저장(선택)

## 화면 구성

| 섹션 | 내용 |
|---|---|
| 🏠 홈 | 요약 지표 타일, 오늘 일정, 검토 딜·뉴스 미리보기 |
| 💼 VC·투자 | 딜 파이프라인 · 포트폴리오 · 출자사업 · 연락처 |
| 📈 주식투자 | 보유 종목 · 딥다이브 · 스캐너(국내/미국) · IPO/Post-IPO · 메자닌 |
| 📅 캘린더 | 통합 일정 · 구글 캘린더 연동(예정) |
| 📰 뉴스·리서치 | VC 뉴스 · 크롤링 · KVCA 공지 · 투자 노트 |
| ✅ 업무·생산성 | 할 일 · 프로젝트 · 루틴 · 메모 |
| ⚙️ 설정 | GitHub 토큰 · 테마 · 백업 |

## 로컬 실행

```bash
npm install      # 최초 1회
npm run dev      # 개발 서버 (http://localhost:5173/jh-vc-dashboard/)
npm run build    # 프로덕션 빌드 → dist/
npm run preview  # 빌드 결과 미리보기
```

## 배포 방법 (GitHub Pages)

1. GitHub에서 **Public** 저장소 `jh-vc-dashboard` 생성 후 이 코드를 push.
2. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 설정.
3. `main` 브랜치에 push하면 `.github/workflows/deploy.yml` 이 자동으로 빌드·배포합니다.

> `vite.config.js` 의 `base` 는 `/jh-vc-dashboard/` 로 설정되어 있습니다.
> 저장소 이름을 바꾸면 이 값도 같이 바꿔야 합니다.

## 폴더 구조

```
jh-vc-dashboard/
├─ .github/workflows/deploy.yml   # Pages 자동 배포
├─ public/data/*.json             # 영속 데이터(예시 포함)
├─ src/
│  ├─ App.jsx                     # 라우팅(HashRouter)
│  ├─ nav.js                      # 섹션 정의
│  ├─ theme.js                    # 라이트/다크
│  ├─ useData.js                  # data/*.json 로더
│  ├─ components/Layout.jsx       # 사이드바 + 하단 탭바(반응형)
│  └─ pages/*.jsx                 # 섹션별 페이지
├─ vite.config.js
├─ .env.example                   # 환경변수 예시(.env 는 커밋 금지)
└─ .gitignore
```

## 보안

- **토큰·API 키는 절대 커밋하지 않습니다.** `.env` 와 `*.token` 은 `.gitignore` 로 제외됩니다.
- GitHub 저장용 토큰은 배포된 대시보드의 **설정** 화면에서 입력하며, 사용자 본인 브라우저(localStorage)에만 보관됩니다.

## 다음 단계 (로드맵)

- [ ] 딜 파이프라인: 구글 시트(데이터) + Drive 폴더(자료함, 읽기전용) 연동
- [ ] 출자사업: GitHub Actions 예약 크롤링 → `data/lp_notices.json` 자동 갱신
- [ ] 구글 캘린더 연동 방식 확정(API OAuth / iCal / 임베드)
- [ ] 주식 시세 소스 확정(수동 vs 공개 API)
- [ ] 각 섹션 모달 추가·수정, 우선순위 필터, 완료 처리
