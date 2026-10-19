# KeyTube 설계와 로드맵

## 목표

유튜브 링크를 붙여넣으면 영상은 공식 플레이어로 그대로 보면서, 소리의 키를 반음 단위(±12)로 바꿔 듣는다. 원곡의 키를 자동 판별하고, 키를 바꿨을 때 어떤 키가 되는지(예: `A minor → +2 → B minor`, 한국어 조 이름·관계조 포함) 보여준다.

## 왜 이 구조인가

YouTube IFrame API에는 피치 조절이 없고, iframe은 cross-origin이라 Web Audio로 소리에 접근할 수 없다. 스트림 추출(yt-dlp 등)은 약관 위반이라 배제했다. 남은 방법:

| | 방법 | 범위 |
|---|---|---|
| **A** | `getDisplayMedia`로 탭 오디오 캡처 → `suppressLocalAudioPlayback`으로 원음 차단 → Web Audio로 피치 시프트·분석 | 데스크톱 Chrome/Edge |
| **C** | 사용자의 음원 파일 업로드 → `decodeAudioData` → 같은 엔진 | 모든 기기 |
| **B** (나중) | 크롬 확장이 youtube.com의 `<video>`에 `createMediaElementSource` | 데스크톱 Chrome |

A와 C를 먼저 만들고, B는 엔진 공유로 나중에 붙인다.

```
[입력 어댑터]                         [src/lib/engine/]                [UI]
 A 탭 캡처 MediaStream ─┐
 C 파일 AudioBuffer ────┼─▶ AudioNode ─▶ pitchShifter ─▶ destination
 B <video> (나중) ──────┘             └▶ 키 판별(크로마) ─▶ KeyPanel
```

## 확장(B) 전환 계획

B를 시작할 때 npm workspaces 모노레포로 바꾼다: `packages/engine`(← `src/lib/engine`), `apps/web`, `apps/extension`. 엔진 폴더가 React에 의존하지 않는 한 옮기기만 하면 된다 — 이 경계를 지키는 게 지금 단계의 유일한 준비다.

## 단계

0. **스캐폴딩 + 검증 도구** (완료) — 키 이론, 캡처·피치 시프트 래퍼, `/debug`.
1. **A 성립 검증** — `/debug`에서 확인할 것:
   - 원음이 꺼지는가 (`suppressLocalAudioPlayback`)
   - 캡처 입력에 음악이 들어오는가 (비디오 트랙을 중지해도)
   - 우리 출력이 들리는가 / 다시 캡처되는가 (피드백 테스트)
   - 키 변경 음질과 지연
   - "이 탭"과 "다른 탭" 두 방식 비교 → 메인 화면 구조 확정
2. **키 판별** — 캡처/디코드한 오디오에서 크로마그램(12음 에너지)을 구하고 Krumhansl–Kessler 프로파일과 상관계수로 24개 조를 매칭. 상위 후보와 신뢰도를 보여주고, 사용자가 고칠 수 있게 직접 입력도 유지. 순수 함수로 만들어 합성 신호로 테스트.
3. **파일 업로드(C)** — 같은 엔진, 모바일 대응.
1.5 **메인 + 엔진 팝업** (완료) — 자기 탭 캡처가 불가능해서 소리 처리를 `/engine` 팝업으로 분리.
4. **메인 화면 다듬기** — 단축키(`-`/`=`로 키 이동), 영상별 마지막 키 기억(IndexedDB).
5. **크롬 확장(B)**.
