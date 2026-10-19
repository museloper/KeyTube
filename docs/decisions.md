# 결정 경위

## 2026-10-19 — 키 조절 방식: 탭 오디오 캡처(A) + 파일 업로드(C), 확장(B)은 나중

- 서버 측 스트림 추출은 YouTube 약관과 LoopTube 이래의 원칙("스트림 추출 금지")에 어긋나 배제.
- B(확장)는 품질이 가장 좋지만 웹앱이 아니라서, 웹앱(A+C)을 먼저 만들고 엔진을 공유하는 방식으로 나중에 붙이기로 함. 별도 프로젝트로 복사하지 않는 이유: 엔진 버그를 두 번 고치게 된다.

## 2026-10-19 — 자기 탭 캡처의 위험 (미검증)

- 스펙상 `suppressLocalAudioPlayback`은 "탭 소리를 스피커로 보내지 않되 캡처는 계속"한다. 우리 피치 시프트 출력도 같은 탭에서 나오므로 같이 꺼지거나 재캡처될 수 있다.
- `restrictOwnAudio`(Chrome 141+)는 캡처한 문서 자신의 소리를 빼주지만 **시스템 오디오가 포함된 표면에만** 적용된다 — 탭 캡처에는 해당 없음.
- 대안: 플레이어를 다른 탭에 두고 그 탭을 캡처(`selfBrowserSurface: "exclude"`). `/debug`가 두 방식을 모두 시험한다.
- **실측 결과 (Chrome 155, macOS, Playwright로 화면 있는 Chrome 구동):**
  - **이 탭 캡처는 쓸 수 없다.** 같은 탭의 `<audio>` 대조군은 -11.7 dB로 잡히고, 우리 AudioContext가 낸 880 Hz 톤도 -100 → -30 dB로 **재캡처됐다.** 사용자 실기기 테스트에서는 그 톤이 **들리지 않았다**(원음 차단에 같이 걸림). 즉 출력이 안 들리고, 들리게 만들면 하울링 루프가 된다.
  - **다른 탭 캡처는 동작한다.** 입력 -25.7 dB, 처리 출력 -26 dB, 톤 재캡처 없음, `suppressLocalAudioPlayback: true` 적용 확인.
  - 피치 시프트 정확도: 440 Hz 기준 −2…+5 반음 모두 FFT 해상도(1.3 Hz) 이내. 지연 120 ms.
  - **headless Chrome은 탭 오디오를 전혀 캡처하지 않는다**(대조군까지 무음) — 자동 검증은 반드시 headed로 할 것.

## 2026-10-19 — 피치 시프트 라이브러리: signalsmith-stretch

- MIT, WASM+AudioWorklet 내장(별도 파일 호스팅 불필요 → 정적 export와 잘 맞음), 라이브 입력 모드 지원, `latency()` 제공.
- Rubber Band는 GPL이라 제외. SoundTouch 계열은 품질이 낮고 라이브 입력 지원이 약함.

## 2026-10-19 — signalsmith-stretch를 번들러에 통과시키지 않는다

- 증상: `/debug`에서 캡처 후 피치 시프터가 응답 없이 멈춤(오류도 없음). 번들 없이 원본 파일을 import하면 정상.
- 원인: 이 라이브러리는 자기 함수 소스를 문자열로 만들어 AudioWorklet 모듈로 등록한다. Turbopack이 `typeof process == "object"`를 `typeof __TURBOPACK__imported__module__…["default"] == "object"`로 바꿔 넣는데, worklet 안에는 그 변수가 없어 **ReferenceError**가 나고, 라이브러리가 이를 삼켜 'ready'를 영영 보내지 않는다.
- 해결: `scripts/copy-vendor.mjs`가 `predev`/`prebuild`에서 원본을 `public/vendor/`로 복사하고, `createPitchShifter(context, moduleUrl)`이 `import(/* webpackIgnore: true */ url)`로 런타임에 불러온다. URL을 인자로 받는 건 엔진이 Next.js의 basePath를 몰라도 되게 하고, 확장(B)이 자기 경로를 넘길 수 있게 하기 위함.

## 2026-10-19 — 화면 구조: 메인 탭 + 엔진 팝업 (→ 같은 날 엔진 탭으로 변경, 아래)

- 후보: (1) 메인 탭(플레이어+컨트롤) + 소리를 내는 작은 엔진 팝업, (2) 컨트롤 탭 + 플레이어 팝업. 사용자가 (1)을 선택 — LoopTube처럼 영상과 컨트롤이 한 화면에 있는 게 핵심 UX라서.
- 팝업은 최소화해도 되고, 닫으면 Chrome이 원음 차단을 풀어 원래 소리로 돌아가는 게 자연스러운 "끄기" 동작이 된다.
- 자동 e2e(headed Chrome): 440 Hz 대조 톤 → 엔진 출력 원키 440.1 / +2 495.3 / −1 415.9 Hz. 메인 새로고침 후 재연결, 팝업 닫으면 메인이 "꺼짐"으로 전환 확인.

## 2026-10-19 — 엔진을 팝업 창이 아니라 일반 탭으로

- 사용자 보고: 엔진 팝업에서 공유 창을 열면 'Chrome 탭' 목록이 비어 있어 고를 탭이 없었다.
- 재현(플래그 없이 headed Chrome + `screencapture`): 크기 지정 팝업 창에서 호출하면 최소 옵션(`{video:true, audio:true}`)으로도 탭 목록이 비고, 일반 탭에서 호출하면 다른 탭이 정상 표시된다. 옵션 문제가 아니라 Chrome의 팝업 창 처리 방식.
- 해결: `window.open(url, "keytube-engine")`(기능 문자열 없음)으로 새 탭에 연다. 공유 창에는 엔진 자신이 빠지고 `KeyTube ← 이 탭을 선택` 하나만 보이며, 공유가 시작되면 Chrome이 메인 탭으로 자동 전환한다.
- 놓친 이유: e2e가 `--auto-select-tab-capture-source-by-title`로 공유 창을 건너뛰었다. 공유 창 UI는 스크린샷으로 따로 확인해야 한다.
