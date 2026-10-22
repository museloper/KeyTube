@AGENTS.md

# KeyTube — 프로젝트 규칙

YouTube 링크(또는 내 음원 파일)의 키를 반음 단위로 올리고 내리며, 원키를 판별하고 바뀐 키를 보여주는 연습 앱. 자매 프로젝트 LoopTube(`../looptube`)의 스택·UI 관례를 그대로 따른다. 설계 배경과 로드맵은 **`docs/PLAN.md`**, 결정 경위는 `docs/decisions.md`에 있다 — 새 세션은 작업 전에 PLAN.md부터 읽을 것.

## 폴더 지도

| 경로 | 역할 |
|---|---|
| `src/lib/engine/` | **프레임워크 무관 오디오 엔진** — 키 이론(`theory.ts`), 탭 캡처(`capture.ts`), 피치 시프트(`pitchShifter.ts`), 캡처→시프트→출력 묶음(`session.ts`), 메인↔엔진 탭 메시지(`link.ts`), 키 판별(`keyDetect.ts` 크로마·상관 + `keySections.ts` 구간·전조 + `keyTracker.ts` 분석기 샘플링), 레벨 계산(`meter.ts`) |
| `src/lib/youtube/` | IFrame API 로더·타입·URL 파서·oEmbed (LoopTube에서 복사) |
| `src/hooks/usePlayer.ts` / `useEngine.ts` | YouTube 플레이어 생성·로드 / 엔진 탭 열기·상태·반음 전달 |
| `src/components/` | 화면 부품 (`KeyPanel`, `EngineBar`, `UrlInput`, `Player`) |
| `src/app/page.tsx` | 메인 화면: 플레이어 + 키 컨트롤 (소리는 내지 않음) |
| `src/app/engine/` | **엔진 탭**: 메인 탭을 캡처해 키를 바꿔 출력 |
| `src/app/debug/` | 탭 캡처 검증 페이지 (`/debug`, `/debug/player`) |
| `src/lib/paths.ts` | basePath를 붙인 런타임 URL (vendor 모듈, 엔진 페이지) |

## 두 탭 구조 (메인 탭 + 엔진 탭)

자기 탭 캡처가 불가능해서(아래 "플랫폼 제약") 소리 처리를 별도 탭으로 분리했다. 메인 탭은 LoopTube처럼 플레이어와 컨트롤을 한 화면에 두고, **엔진 탭(`/engine`)이 메인 탭을 캡처해 시프트된 소리를 낸다.** 메인 탭 원음은 `suppressLocalAudioPlayback`으로 꺼진다. 공유가 시작되면 Chrome이 캡처된 탭(메인)으로 자동 전환해 준다.

- **엔진은 반드시 일반 새 탭으로 연다(`window.open(url, name)`, 크기 지정 없음).** 크기를 지정한 팝업 창에서 `getDisplayMedia`를 부르면 **Chrome 공유 창의 탭 목록이 통째로 비어서** 메인 탭을 고를 수 없다 (옵션과 무관, 실측). 사용자 보고로 발견됨.

- 통신은 `BroadcastChannel("keytube-engine")` (`link.ts`). **반음 값의 원본은 메인 탭**이고, 엔진이 연결되거나 다시 발견될 때마다 메인이 현재 값을 보낸다. 메인 탭을 새로고침해도 캡처는 이어지고, `hello`로 엔진을 다시 찾는다.
- 엔진 대기 중에는 메인 탭 제목을 `KeyTube ← 이 탭을 선택`으로 바꿔 공유 창에서 고르기 쉽게 한다. 엔진 탭은 자기 제목(`KeyTube 엔진`)을 갖고 `selfBrowserSurface: "exclude"`로 목록에서 빠진다.
- 엔진 탭을 닫으면 캡처가 끝나고 Chrome이 원음 차단을 풀어 **자연스럽게 원래 소리로 돌아간다** — 별도 복구 코드 불필요.

## 절대 바꾸면 안 되는 전제

- **`src/lib/engine/`에서는 React·Next.js·`@/hooks`·`@/components`를 import하지 않는다.** 나중에 크롬 확장(B)을 붙일 때 이 폴더를 `packages/engine`으로 그대로 옮겨 공유하기 위한 경계다. 입력 소스(탭 캡처 A / 파일 C / 확장의 `<video>` B)는 모두 "AudioNode를 만들어 엔진에 연결"하는 어댑터로만 다룬다.
- **YouTube 스트림을 직접 추출하거나 다운로드하지 않는다(yt-dlp 등 서버 추출 포함).** 공식 플레이어를 숨기거나 가리지 않는다. 키 조절에 오디오 접근이 필요하다는 이유로 이 요청이 오면 먼저 알릴 것 — 그래서 A(탭 오디오 캡처)를 택했다.
- **Data API v3는 쓰지 않는다.** 제목/썸네일은 oEmbed로 충분하다.
- **웹(Next.js) 정적 export 단일 코드베이스.** 서버 기능(API 라우트, Server Actions)을 넣으면 GitHub Pages 배포가 깨진다 — 필요해지면 먼저 알릴 것.

## 키 판별

- 엔진 탭이 캡처한 소리를 **피치 시프트 전에** 분석한다(`session.ts`의 `inputAnalyser`). 시프트 후 소리를 분석하면 ± 누를 때마다 "원키"가 따라 움직인다.
- 100 ms마다 스펙트럼(fftSize 16384)을 12음 크로마로 접어 **들은 음악 8초 단위 창**으로 모으고(무음 프레임은 세지 않아 일시정지가 구간을 쪼개지 않음), `keySections`가 창마다 **Temperley(Kostka–Payne)** 24개 조 프로파일과 상관을 낸 뒤 Viterbi로 구간을 나눈다(20초 미만은 앞 구간에 합침). **원키 = 처음 들은 구간의 키**, 이후 구간은 "전조 감지"로 표시하고 마지막 구간을 '현재 키'로 쓴다. 새 키가 10초 이상 이어지면 확정(20초) 전에 "전조 가능성"으로 먼저 보여 준다(`SongKey.pending` — 확정 구간·원키 계산에는 안 섞임). 전체를 평균하면 전조(G→A) 사이의 키(D)로 기운다. Krumhansl–Kessler는 딸림조 혼동이 잦아 교체(`docs/decisions.md`). 1초마다 메인 탭에 보낸다.
- **한계**: 곡 위치가 아니라 들은 순서 기준이다. 중간부터 들으면 원키가 그 부분 키가 되고, 앞뒤로 건너뛰면 전조처럼 보일 수 있다 — 직접 지정으로 보정.
- 상수(창 8초, 전조 벌점 0.6, 최소 구간 20초)와 프로파일 선택의 근거는 키를 아는 실제 팝 9곡 비교다(`docs/decisions.md`). 그 크로마 데이터는 곡 음원에서 뽑은 값이라 **이 저장소에 없다** — 바꿀 때는 합성 테스트로 회귀를 잡고 실제 곡은 사람이 들어보며 확인할 것.
- **아직 사람이 확인 안 한 것**: 실제 YouTube 탭 캡처 상태에서 "전조 가능성"(10초)·"전조 감지"(20초) 표시가 제때 뜨는지, 브리지에서 "가능성"이 너무 자주 깜빡이지 않는지. 새 영상을 불러오면 `resetKey`로 누적을 비운다.
- **관계조(C major ↔ A minor)·딸림조 혼동은 이 방식의 본질적 한계**라 UI가 "다른 후보" 칩과 직접 지정(`manualKey`가 자동 판별보다 우선)을 제공한다. 정확도를 더 올리고 싶으면 essentia.js를 검토 — 판별 로직은 `keyDetect.test.ts`의 합성 화음 테스트로 회귀를 잡는다.
- 엔진 탭은 소리를 내는 탭이라 Chrome 백그라운드 타이머 제한에서 제외된다 — 그래서 `setInterval` 샘플링이 백그라운드에서도 돈다.

## 플랫폼 제약 (버그 아님)

- **YouTube IFrame API에는 피치 조절이 없다.** 배속(`setPlaybackRate`)뿐이다. iframe은 cross-origin이라 Web Audio로 소리를 직접 가져올 수도 없다. 그래서 키 조절·판별은 `getDisplayMedia` 탭 오디오 캡처(A)로만 가능하다.
- **A는 데스크톱 Chrome/Edge 전용.** iOS·Android 브라우저는 탭 오디오 캡처를 지원하지 않는다 — 모바일은 파일 업로드(C)로 대응한다.
- **자기 탭 캡처는 쓸 수 없다 (실측 확인).** 우리 AudioContext 출력도 같은 탭 소리라서 원음 차단에 같이 걸려 안 들리고, 동시에 재캡처돼 하울링 루프가 된다. `restrictOwnAudio`는 시스템 오디오 캡처에만 적용되어 탭 캡처에는 효과가 없다. **캡처하는 탭과 소리를 내는 탭은 반드시 달라야 한다.** 다른 탭 캡처는 동작 확인됨. (수치: `docs/decisions.md`)
- **피치 시프트는 지연이 생긴다.** 영상과 소리가 약간 어긋난다 — `/debug`에 실측 지연이 표시된다.

## 라이브러리 선택

- 피치 시프트: **`signalsmith-stretch`** (MIT, WASM+AudioWorklet, 라이브 입력 지원, 지연 120 ms). 타입이 없어 `src/lib/engine/signalsmith-stretch.d.ts`로 선언했다.
  - `schedule()`에 `output`을 넘기지 말 것: README와 달리 worklet은 시점 비교에 `outputTime`(없으면 자기 시계)을 쓰고 `output`은 그대로 저장만 해서 두 값이 어긋난다.
  - **절대 `import "signalsmith-stretch"`로 번들에 넣지 말 것.** 자기 소스를 문자열로 worklet에 넘기는데 Turbopack의 치환 코드가 worklet 안에서 ReferenceError를 내고, 오류 없이 영원히 멈춘다. `scripts/copy-vendor.mjs`가 `predev`/`prebuild`에서 `public/vendor/`로 복사하고(gitignore됨), `createPitchShifter(context, STRETCH_MODULE_URL)`(`src/lib/paths.ts`)이 `webpackIgnore` 동적 import로 불러온다. 패키지를 올리면 이 복사본도 자동으로 따라간다. (경위: `docs/decisions.md`)
- **GPL 라이브러리(Rubber Band 등)는 쓰지 않는다.**

## 테스트가 못 검증하는 것

`npx vitest run`은 순수 로직만 검증한다: `theory`, `meter`, `parseUrl`, 키 판별(`keyDetect` 합성 화음, `keySections` 합성 크로마 창, `keyTracker`는 가짜 AnalyserNode + vitest 가짜 타이머로 전조 구간·일시정지·리셋). 캡처·피치 시프트는 **로컬 Chrome(`/Applications/Google Chrome.app`)을 playwright-core로 headed 구동**하면 수치로 검증할 수 있다 — `--auto-accept-this-tab-capture`(이 탭) / `--auto-select-tab-capture-source-by-title=<제목>`(다른 탭)으로 공유 창을 자동 승인하고, `<audio>` 톤을 대조군으로 넣어 `/debug`의 레벨·피드백 테스트를 읽는다. 엔진 탭의 실제 출력은 `AudioNode.prototype.connect`를 init script로 감싸 destination 앞에 분석기를 꽂아 주파수를 잰다. **자동 선택 플래그는 한글/특수문자 제목을 못 맞추므로** 테스트에서는 메인 탭 제목을 ASCII로 덮어쓸 것. **자동 선택 플래그는 공유 창 UI 자체를 건너뛰므로 공유 창에 무엇이 보이는지는 검증하지 못한다** — 플래그 없이 띄우고 macOS `screencapture -x`로 화면을 찍어 확인할 것 (빈 탭 목록 버그를 이렇게 놓쳤다).
- 반음 변경은 0.3초 안팎에 반영된다. FFT로 잴 때는 분석 창 길이(fftSize/sampleRate)만큼 이전 소리가 섞이니, 한 번 읽고 판정하지 말고 목표 주파수에 도달할 때까지 폴링할 것. **headless는 탭 오디오를 전혀 캡처하지 않아(무음) 판정이 무효다.** 실제 음질과 영상-소리 싱크 체감은 여전히 사람이 들어봐야 한다.

## 진행 단계

- [x] 0. 스캐폴딩, 키 이론 모듈, `/debug` 캡처 검증 페이지
- [x] 1. `/debug` 검증 — 이 탭 캡처 불가, 다른 탭 캡처 동작 확인
- [x] 1.5. 메인 탭 + 엔진 탭 구조로 확정·구현 (자동 e2e로 ±반음 출력 주파수 확인)
- [x] 2. 키 판별 (크로마 + Krumhansl 프로파일) — 합성 음악 e2e로 E♭ major / F♯ minor 확인, 실제 곡 정확도는 미검증
- [ ] 3. 파일 업로드(C)로 엔진 완성
- [ ] 4. 메인 화면 다듬기 (단축키, 영상별 마지막 키 기억)
- [ ] 5. (나중) 모노레포 전환 + 크롬 확장(B)

## 운영 메모

- 원격 저장소: `origin` → https://github.com/museloper/KeyTube.git (`main` 추적).
- **배포는 GitHub Pages.** `main`에 push하면 `.github/workflows/deploy.yml`이 typecheck→lint→test→build→배포를 자동 수행한다. 배포 주소: https://museloper.github.io/KeyTube/ (Pages Source: GitHub Actions — `gh api`로 설정 완료). `basePath`는 `PAGES_BASE_PATH` 환경변수로만 받는다 — 하드코딩 금지. 런타임에 URL로 여는 것(vendor 모듈, `/engine`)은 `src/lib/paths.ts`가 `NEXT_PUBLIC_BASE_PATH`로 직접 붙인다.
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
