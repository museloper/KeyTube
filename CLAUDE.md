@AGENTS.md

# KeyTube — 프로젝트 규칙

YouTube 링크(또는 내 음원 파일)의 키를 반음 단위로 올리고 내리며, 원키를 판별하고 바뀐 키를 보여주는 연습 앱. 자매 프로젝트 LoopTube(`../looptube`)의 스택·UI 관례를 그대로 따른다. 설계 배경과 로드맵은 **`docs/PLAN.md`**, 결정 경위는 `docs/decisions.md`에 있다 — 새 세션은 작업 전에 PLAN.md부터 읽을 것.

## 폴더 지도

| 경로 | 역할 |
|---|---|
| `src/lib/engine/` | **프레임워크 무관 오디오 엔진** — 키 이론(`theory.ts`), 탭 캡처(`capture.ts`), 피치 시프트(`pitchShifter.ts`), 레벨 계산(`meter.ts`) |
| `src/lib/youtube/` | IFrame API 로더·타입·URL 파서·oEmbed (LoopTube에서 복사) |
| `src/hooks/usePlayer.ts` | YouTube 플레이어 생성·로드 |
| `src/components/` | 화면 부품 (`KeyPanel`, `UrlInput`, `Player`) |
| `src/app/page.tsx` / `src/app/debug/` | 메인 화면 / 탭 캡처 성립 여부 검증 페이지 (`/debug`, `/debug/player`) |

## 절대 바꾸면 안 되는 전제

- **`src/lib/engine/`에서는 React·Next.js·`@/hooks`·`@/components`를 import하지 않는다.** 나중에 크롬 확장(B)을 붙일 때 이 폴더를 `packages/engine`으로 그대로 옮겨 공유하기 위한 경계다. 입력 소스(탭 캡처 A / 파일 C / 확장의 `<video>` B)는 모두 "AudioNode를 만들어 엔진에 연결"하는 어댑터로만 다룬다.
- **YouTube 스트림을 직접 추출하거나 다운로드하지 않는다(yt-dlp 등 서버 추출 포함).** 공식 플레이어를 숨기거나 가리지 않는다. 키 조절에 오디오 접근이 필요하다는 이유로 이 요청이 오면 먼저 알릴 것 — 그래서 A(탭 오디오 캡처)를 택했다.
- **Data API v3는 쓰지 않는다.** 제목/썸네일은 oEmbed로 충분하다.
- **웹(Next.js) 정적 export 단일 코드베이스.** 서버 기능(API 라우트, Server Actions)을 넣으면 GitHub Pages 배포가 깨진다 — 필요해지면 먼저 알릴 것.

## 플랫폼 제약 (버그 아님)

- **YouTube IFrame API에는 피치 조절이 없다.** 배속(`setPlaybackRate`)뿐이다. iframe은 cross-origin이라 Web Audio로 소리를 직접 가져올 수도 없다. 그래서 키 조절·판별은 `getDisplayMedia` 탭 오디오 캡처(A)로만 가능하다.
- **A는 데스크톱 Chrome/Edge 전용.** iOS·Android 브라우저는 탭 오디오 캡처를 지원하지 않는다 — 모바일은 파일 업로드(C)로 대응한다.
- **자기 탭을 캡처하면 우리 출력도 같은 탭 소리라서, 원음 차단(`suppressLocalAudioPlayback`) 시 같이 꺼지거나 다시 캡처될 가능성이 있다.** `restrictOwnAudio`는 시스템 오디오 캡처에만 적용되고 탭 캡처에는 효과가 없다. 이게 실제로 어떤지는 `/debug`의 피드백 테스트로 확인한다 — 결과에 따라 "플레이어를 별도 탭에 두는" 구조로 갈 수 있다. (결과는 `docs/decisions.md`에 기록할 것)
- **피치 시프트는 지연이 생긴다.** 영상과 소리가 약간 어긋난다 — `/debug`에 실측 지연이 표시된다.

## 라이브러리 선택

- 피치 시프트: **`signalsmith-stretch`** (MIT, WASM+AudioWorklet, 라이브 입력 지원). 타입이 없어 `src/lib/engine/signalsmith-stretch.d.ts`로 선언했다. 모듈이 WASM과 AudioWorklet을 건드리므로 반드시 **동적 import**(`pitchShifter.ts`) — 정적 import하면 정적 export의 prerender에서 깨질 수 있다.
- **GPL 라이브러리(Rubber Band 등)는 쓰지 않는다.**

## 테스트가 못 검증하는 것

`npx vitest run`은 순수 로직(`theory`, `meter`, `parseUrl`)만 검증한다. **탭 캡처, 원음 차단, 피치 시프트 음질·지연은 이 세션 환경에서 실기기 검증이 불가능하다** — 사람이 데스크톱 Chrome에서 `/debug`를 돌리고 "결과 복사"로 전달해야 한다.

## 진행 단계

- [x] 0. 스캐폴딩, 키 이론 모듈, `/debug` 캡처 검증 페이지
- [ ] 1. `/debug` 실기기 검증 → A 구조 확정 (이 탭 vs 별도 플레이어 탭)
- [ ] 2. 키 판별 (크로마 + Krumhansl 프로파일)
- [ ] 3. 파일 업로드(C)로 엔진 완성
- [ ] 4. 메인 화면에 A 연결
- [ ] 5. (나중) 모노레포 전환 + 크롬 확장(B)

## 운영 메모

- 원격 저장소: 아직 없음. 만들면 LoopTube처럼 GitHub Pages 배포(`.github/workflows/deploy.yml`, `basePath`는 `PAGES_BASE_PATH` 환경변수 — 하드코딩 금지).
- CI의 `npx next typegen` 단계를 지우지 말 것 (클린 체크아웃에서 `LayoutProps` 타입 에러). lockfile이 CI에서 `npm ci` EUSAGE를 내면 `rm -rf node_modules package-lock.json && npm install`로 재생성. (LoopTube에서 겪은 문제)
- 강조색은 LoopTube(emerald)와 구분해 **violet**을 쓴다.

## 협업 방식

- 요청 해석이 여러 갈래로 나뉘면 임의로 하나를 고르지 말고, 선택지 1~3개를 제시해 고르게 한다.
- 막히면 추측으로 밀어붙이지 말고 멈춘다. 무엇이 불명확한지 짚고, 코드를 고치기 전에 원인 진단부터 공유한다.
- "어떻게 ~해?" 형태의 질문에는 코드를 바로 고치지 말고, 설명만 할지 바로 적용할지 먼저 묻는다. "고쳐줘"처럼 실행을 명시한 요청은 바로 진행한다.

---

# 전역 개발 규칙 (~/.claude/CLAUDE.md 복사본)

## 커밋 컨벤션

**Conventional Commits**를 따른다.

- 형식: `<type>(<scope>): <subject>` — scope는 선택.
- type: `feat` · `fix` · `docs` · `test` · `refactor` · `chore` · `style` · `perf` 중 하나.
- subject는 소문자로 시작하는 명령형 한 줄, 끝에 마침표 없음.
- 본문(body)은 "무엇을"이 아니라 **"왜"**를 설명할 때만 추가한다.

## 커밋 전 검증

커밋 전에 `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`이 통과해야 한다.
