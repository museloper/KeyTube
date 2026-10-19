"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Player } from "@/components/Player";
import { UrlInput } from "@/components/UrlInput";
import { usePlayer } from "@/hooks/usePlayer";
import { captureTabAudio, CaptureError, type CaptureTarget } from "@/lib/engine/capture";
import { binForFrequency, rmsDb, SILENCE_DB } from "@/lib/engine/meter";
import { createPitchShifter, type PitchShifter } from "@/lib/engine/pitchShifter";
import { formatSemitones } from "@/lib/engine/theory";
import { STRETCH_MODULE_URL } from "@/lib/paths";

/**
 * Feasibility check for approach A (see docs/PLAN.md). Nothing here can be
 * verified from tests: it needs a person, Chrome, and their ears.
 */

const PROBE_HZ = 880;
/** A tone this much louder than the room in the captured signal means our own output was recaptured. */
const RECAPTURE_MARGIN_DB = 20;

interface Session {
  context: AudioContext;
  stream: MediaStream;
  audioTrack: MediaStreamTrack;
  inputAnalyser: AnalyserNode;
  outputAnalyser: AnalyserNode;
  outputGain: GainNode;
  shifter: PitchShifter;
}

interface ProbeResult {
  baselineDb: number;
  toneDb: number;
  recaptured: boolean;
}

type Answer = "yes" | "no" | null;

const QUESTIONS = [
  { id: "originalMuted", text: "캡처를 시작하자 YouTube 원래 소리가 꺼졌나요?" },
  { id: "beepHeard", text: "피드백 테스트 중 '삐—' 소리(1초)가 들렸나요?" },
  { id: "shiftedHeard", text: "'처리된 소리 출력'을 켰을 때 음악이 들리나요?" },
  { id: "pitchChanged", text: "+/− 버튼을 누르면 키가 바뀌어 들리나요?" },
  { id: "noEcho", text: "울림·메아리·하울링 없이 깨끗하게 들리나요?" },
] as const;

type QuestionId = (typeof QUESTIONS)[number]["id"];

/** A worklet that never reports ready would otherwise leave the page waiting forever. */
const STAGE_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${ms / 1000}초 동안 응답 없음`)), ms)),
  ]);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Peak level at one frequency over a window, read from an analyser. */
async function measureToneDb(analyser: AnalyserNode, frequency: number, ms: number): Promise<number> {
  const bins = new Float32Array(analyser.frequencyBinCount);
  const bin = binForFrequency(frequency, analyser.context.sampleRate, analyser.fftSize);
  let peak = SILENCE_DB;
  const until = performance.now() + ms;
  while (performance.now() < until) {
    analyser.getFloatFrequencyData(bins);
    const value = bins[bin] ?? SILENCE_DB;
    if (Number.isFinite(value)) peak = Math.max(peak, value);
    await sleep(30);
  }
  return peak;
}

function useLevel(analyser: AnalyserNode | null): number {
  const [level, setLevel] = useState(SILENCE_DB);
  useEffect(() => {
    if (!analyser) return;
    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      setLevel(rmsDb(samples));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [analyser]);
  return analyser ? level : SILENCE_DB;
}

function Meter({ label, db }: { label: string; db: number }) {
  // -60 dBFS..0 dBFS mapped onto the bar.
  const fill = Math.max(0, Math.min(1, (db + 60) / 60));
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-neutral-400">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
        <div className="h-full bg-violet-500 transition-[width] duration-75" style={{ width: `${fill * 100}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-xs text-neutral-400">
        {db <= SILENCE_DB ? "—" : `${db.toFixed(0)} dB`}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-neutral-900 p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">{title}</h2>
      {children}
    </section>
  );
}

const buttonClass =
  "rounded-lg bg-neutral-800 px-4 py-2.5 text-sm text-neutral-100 transition hover:bg-neutral-700 disabled:opacity-40";

export default function CaptureDebugPage() {
  const { containerRef, player, error: playerError, load } = usePlayer();
  const [hasVideo, setHasVideo] = useState(false);
  const [target, setTarget] = useState<CaptureTarget>("self");
  const [dropVideoTrack, setDropVideoTrack] = useState(true);

  const sessionRef = useRef<Session | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [trackEnded, setTrackEnded] = useState(false);
  const [semitones, setSemitones] = useState(0);
  const [outputOn, setOutputOn] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [answers, setAnswers] = useState<Record<QuestionId, Answer>>(
    () => Object.fromEntries(QUESTIONS.map((q) => [q.id, null])) as Record<QuestionId, Answer>,
  );
  const [peakInputDb, setPeakInputDb] = useState(SILENCE_DB);
  const [copied, setCopied] = useState(false);
  const [stage, setStage] = useState<string | null>(null);

  const inputDb = useLevel(session?.inputAnalyser ?? null);
  const outputDb = useLevel(session?.outputAnalyser ?? null);

  useEffect(() => {
    // Track the loudest input seen, to tell "captured silence" from "captured music".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPeakInputDb((peak) => Math.max(peak, inputDb));
  }, [inputDb]);

  const stop = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    current.stream.getTracks().forEach((track) => track.stop());
    current.shifter.dispose();
    void current.context.close();
    sessionRef.current = null;
    setSession(null);
    setOutputOn(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    stop();
    setCaptureError(null);
    setProbe(null);
    setTrackEnded(false);
    setPeakInputDb(SILENCE_DB);
    setSettings(null);
    setLatency(null);

    // Created inside the click so autoplay policy lets it run.
    const context = new AudioContext({ latencyHint: "interactive" });
    let stream: MediaStream | null = null;
    let currentStage = "캡처 요청";
    const enter = (name: string) => {
      currentStage = name;
      setStage(name);
    };
    try {
      enter("캡처 요청");
      const captured = await captureTabAudio(target);
      stream = captured.stream;
      setSettings(captured.settings);
      if (dropVideoTrack) stream.getVideoTracks().forEach((track) => track.stop());
      captured.audioTrack.addEventListener("ended", () => setTrackEnded(true));

      enter("오디오 그래프 구성");
      const source = context.createMediaStreamSource(stream);
      const inputAnalyser = new AnalyserNode(context, { fftSize: 2048 });
      source.connect(inputAnalyser);

      enter("피치 시프터 로딩");
      const shifter = await withTimeout(createPitchShifter(context, STRETCH_MODULE_URL), STAGE_TIMEOUT_MS);
      const outputAnalyser = new AnalyserNode(context, { fftSize: 2048 });
      // Starts muted: in "self" mode our output may be recaptured and howl.
      const outputGain = new GainNode(context, { gain: 0 });
      source.connect(shifter.input);
      shifter.output.connect(outputAnalyser);
      shifter.output.connect(outputGain).connect(context.destination);

      const next = { context, stream, audioTrack: captured.audioTrack, inputAnalyser, outputAnalyser, outputGain, shifter };
      sessionRef.current = next;
      setSession(next);
      setSemitones(0);

      enter("지연 측정");
      setLatency(await withTimeout(shifter.latency(), STAGE_TIMEOUT_MS));
      enter("완료");
    } catch (error) {
      console.error(`[keytube] ${currentStage} 실패`, error);
      // Without this a failure after capture leaves the tab silenced with nothing playing.
      if (!sessionRef.current) {
        stream?.getTracks().forEach((track) => track.stop());
        void context.close();
      }
      const message = error instanceof CaptureError ? error.message : String(error);
      setCaptureError(`${currentStage} 단계에서 실패: ${message}`);
    }
  }, [stop, target, dropVideoTrack]);

  const toggleOutput = () => {
    if (!session) return;
    const next = !outputOn;
    session.outputGain.gain.setTargetAtTime(next ? 1 : 0, session.context.currentTime, 0.02);
    setOutputOn(next);
  };

  const shift = (delta: number) => {
    if (!session) return;
    const next = Math.max(-12, Math.min(12, semitones + delta));
    session.shifter.setSemitones(next);
    setSemitones(next);
  };

  /**
   * Plays a tone straight to the speakers with the music paused, and checks
   * whether it shows up in the captured signal. If it does, our own output is
   * being captured too — the shifted audio would loop back into the shifter.
   */
  const runProbe = async () => {
    if (!session) return;
    setProbing(true);
    setProbe(null);
    const wasOutputOn = outputOn;
    session.outputGain.gain.setValueAtTime(0, session.context.currentTime);
    if (target === "self") player?.pauseVideo();
    await sleep(800);

    const baselineDb = await measureToneDb(session.inputAnalyser, PROBE_HZ, 400);
    const osc = new OscillatorNode(session.context, { frequency: PROBE_HZ });
    const gain = new GainNode(session.context, { gain: 0.15 });
    osc.connect(gain).connect(session.context.destination);
    osc.start();
    await sleep(300);
    const toneDb = await measureToneDb(session.inputAnalyser, PROBE_HZ, 700);
    osc.stop();
    osc.disconnect();

    if (wasOutputOn) session.outputGain.gain.setValueAtTime(1, session.context.currentTime);
    setProbe({ baselineDb, toneDb, recaptured: toneDb - baselineDb > RECAPTURE_MARGIN_DB });
    setProbing(false);
  };

  const report = () => {
    const lines = [
      `KeyTube 캡처 검증 결과`,
      `브라우저: ${navigator.userAgent}`,
      `캡처 대상: ${target === "self" ? "이 탭" : "다른 탭"} / 비디오 트랙 ${dropVideoTrack ? "중지함" : "유지"}`,
      `진행 단계: ${stage ?? "시작 안 함"}`,
      `오류: ${captureError ?? "없음"}`,
      `트랙 설정: ${JSON.stringify(settings)}`,
      `오디오 트랙 종료됨: ${trackEnded ? "예" : "아니오"}`,
      `최대 입력 레벨: ${peakInputDb.toFixed(1)} dB`,
      `피치 시프터 지연: ${latency === null ? "?" : `${(latency * 1000).toFixed(0)} ms`}`,
      `피드백 테스트: ${
        probe
          ? `기준 ${probe.baselineDb.toFixed(1)} dB → 삐 ${probe.toneDb.toFixed(1)} dB (${probe.recaptured ? "재캡처됨" : "재캡처 안 됨"})`
          : "실행 안 함"
      }`,
      ...QUESTIONS.map((q) => `${q.text} → ${answers[q.id] === "yes" ? "예" : answers[q.id] === "no" ? "아니오" : "미응답"}`),
    ];
    void navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight">KeyTube · 캡처 검증</h1>
        <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300">
          메인으로
        </Link>
      </header>

      <p className="text-sm leading-relaxed text-neutral-400">
        데스크톱 Chrome에서 진행하세요. 위에서부터 순서대로 하고, 마지막에 결과를 복사해 전달해 주세요. 두 방식(이 탭 /
        다른 탭)을 각각 한 번씩 해보면 가장 좋아요.
      </p>

      <Section title="1. 캡처 방식">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["self", "이 탭 (동작 안 함 — 기록용)"],
              ["other", "다른 탭 (플레이어를 새 탭에)"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={Boolean(session)}
              onClick={() => setTarget(value)}
              className={`rounded-lg px-4 py-2.5 text-sm transition disabled:opacity-40 ${
                target === value ? "bg-violet-500 font-semibold text-neutral-950" : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={dropVideoTrack}
            disabled={Boolean(session)}
            onChange={(e) => setDropVideoTrack(e.target.checked)}
          />
          캡처 직후 화면(비디오) 트랙은 중지 — 오디오가 계속 들어오는지 확인용
        </label>
      </Section>

      <Section title={target === "self" ? "2. 영상 불러오기 · 재생" : "2. 플레이어 탭 열기 · 재생"}>
        {target === "other" && (
          <p className="text-sm text-neutral-300">
            <Link href="/debug/player" target="_blank" className="text-violet-400 underline">
              플레이어 탭 열기
            </Link>{" "}
            → 거기서 영상을 재생한 뒤 이 탭으로 돌아오세요. 공유 창에서는 그 플레이어 탭을 고르세요.
          </p>
        )}
        {/* Hidden rather than unmounted: the API swaps our div for its iframe, which React can't remove cleanly. */}
        <div className={`flex flex-col gap-3 ${target === "self" ? "" : "hidden"}`}>
          <UrlInput
            onSubmit={(parsed) => {
              if (!parsed.videoId) return;
              setHasVideo(true);
              load(parsed.videoId, parsed.startSeconds ?? 0);
            }}
          />
          <Player containerRef={containerRef} error={playerError} hasVideo={hasVideo} />
        </div>
      </Section>

      <Section title="3. 캡처">
        <p className="text-xs leading-relaxed text-neutral-500">
          공유 창에서 <b>Chrome 탭</b>을 고르고 <b>탭 오디오도 공유</b>가 켜져 있는지 확인하세요.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={start} className="rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-violet-400">
            {session ? "다시 캡처" : "캡처 시작"}
          </button>
          <button type="button" onClick={stop} disabled={!session} className={buttonClass}>
            중지
          </button>
        </div>
        {stage && <p className="text-xs text-neutral-500">진행 단계: {stage}</p>}
        {captureError && <p className="text-sm text-red-400">{captureError}</p>}
        {session && (
          <>
            <Meter label="캡처 입력" db={inputDb} />
            <Meter label="처리 출력" db={outputDb} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-neutral-400">
              <dt>최대 입력</dt>
              <dd className="font-mono">{peakInputDb <= SILENCE_DB ? "아직 무음" : `${peakInputDb.toFixed(1)} dB`}</dd>
              <dt>시프터 지연</dt>
              <dd className="font-mono">{latency === null ? "…" : `${(latency * 1000).toFixed(0)} ms`}</dd>
              <dt>트랙 상태</dt>
              <dd className={trackEnded ? "text-red-400" : ""}>{trackEnded ? "종료됨 (캡처 끊김)" : "수신 중"}</dd>
              <dt>적용된 설정</dt>
              <dd className="break-all font-mono">{JSON.stringify(settings)}</dd>
            </dl>
          </>
        )}
      </Section>

      <Section title="4. 피드백 테스트 (출력 켜기 전에 먼저)">
        <p className="text-xs leading-relaxed text-neutral-500">
          음악을 멈추고 1초간 &lsquo;삐—&rsquo; 소리를 낸 뒤, 그 소리가 캡처 입력에 다시 잡히는지 봅니다. 잡히면 우리가
          낸 소리가 다시 캡처돼 하울링이 생기는 구조라는 뜻이에요.
        </p>
        <button type="button" onClick={runProbe} disabled={!session || probing} className={`${buttonClass} self-start`}>
          {probing ? "측정 중…" : "피드백 테스트"}
        </button>
        {probe && (
          <p className={`text-sm ${probe.recaptured ? "text-amber-400" : "text-emerald-400"}`}>
            기준 {probe.baselineDb.toFixed(1)} dB → 삐 {probe.toneDb.toFixed(1)} dB ·{" "}
            {probe.recaptured ? "우리 출력이 다시 캡처됨 — 출력을 켜면 하울링 위험" : "재캡처 안 됨"}
          </p>
        )}
      </Section>

      <Section title="5. 키 바꿔 듣기">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleOutput}
            disabled={!session}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${
              outputOn ? "bg-violet-500 text-neutral-950" : "bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
            }`}
          >
            {outputOn ? "처리된 소리 출력 끄기" : "처리된 소리 출력 켜기"}
          </button>
          <button type="button" onClick={() => shift(-1)} disabled={!session} className={buttonClass}>
            −1
          </button>
          <span className="w-14 text-center font-mono text-lg">{formatSemitones(semitones)}</span>
          <button type="button" onClick={() => shift(1)} disabled={!session} className={buttonClass}>
            +1
          </button>
        </div>
      </Section>

      <Section title="6. 직접 확인한 결과">
        <ul className="flex flex-col gap-2">
          {QUESTIONS.map((q) => (
            <li key={q.id} className="flex items-center justify-between gap-3 text-sm text-neutral-300">
              <span>{q.text}</span>
              <span className="flex shrink-0 gap-1">
                {(["yes", "no"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: value }))}
                    className={`rounded-md px-3 py-1 text-xs transition ${
                      answers[q.id] === value ? "bg-violet-500 text-neutral-950" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    {value === "yes" ? "예" : "아니오"}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={report} className="self-start rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-violet-400">
          {copied ? "복사됨" : "결과 복사"}
        </button>
      </Section>
    </main>
  );
}
