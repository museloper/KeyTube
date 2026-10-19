"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureError } from "@/lib/engine/capture";
import { openEngineLink, type EngineState, type FromEngine, type Link } from "@/lib/engine/link";
import { startCaptureSession, type CaptureSession } from "@/lib/engine/session";
import { formatSemitones } from "@/lib/engine/theory";
import { STRETCH_MODULE_URL } from "@/lib/paths";

/**
 * The engine popup. It captures the main KeyTube tab and plays the shifted
 * copy from here — the main tab can't do it itself, because a tab that
 * captures itself also silences and re-captures its own output.
 */
export default function EnginePage() {
  const linkRef = useRef<Link<FromEngine> | null>(null);
  const sessionRef = useRef<CaptureSession | null>(null);
  /** The main tab's latest request, applied as soon as a session exists. */
  const semitonesRef = useRef(0);

  const [state, setState] = useState<EngineState>("waiting");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [semitones, setSemitones] = useState(0);
  const [starting, setStarting] = useState(false);

  // Mirror into a ref so the channel handler always reports the current status.
  const statusRef = useRef<FromEngine>({ type: "status", state, latencyMs, error });
  useEffect(() => {
    statusRef.current = { type: "status", state, latencyMs, error };
    linkRef.current?.post(statusRef.current);
  }, [state, latencyMs, error]);

  const stopSession = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, []);

  useEffect(() => {
    const link = openEngineLink((message) => {
      switch (message.type) {
        case "hello":
          link.post(statusRef.current);
          break;
        case "setSemitones":
          semitonesRef.current = message.semitones;
          setSemitones(message.semitones);
          sessionRef.current?.setSemitones(message.semitones);
          break;
        case "shutdown":
          window.close();
          break;
      }
    });
    linkRef.current = link;
    link.post(statusRef.current);

    // Closing the popup ends the capture, which lifts Chrome's suppression:
    // the main tab simply goes back to its original sound.
    const onPageHide = () => {
      stopSession();
      link.post({ type: "bye" });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      onPageHide();
      link.close();
      linkRef.current = null;
    };
  }, [stopSession]);

  const connect = async () => {
    stopSession();
    setStarting(true);
    setError(null);
    try {
      sessionRef.current = await startCaptureSession({
        target: "other",
        stretchModuleUrl: STRETCH_MODULE_URL,
        semitones: semitonesRef.current,
        onEnded: () => {
          sessionRef.current = null;
          setState("waiting");
          setLatencyMs(null);
        },
      });
      setLatencyMs(sessionRef.current.latencyMs);
      setState("running");
    } catch (caught) {
      setState("error");
      setError(caught instanceof CaptureError ? caught.message : `연결하지 못했어요: ${String(caught)}`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <main className="flex min-h-full flex-col gap-3 px-4 py-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-base font-bold tracking-tight">KeyTube 엔진</h1>
        <span className="font-mono text-sm text-neutral-400">{formatSemitones(semitones)}</span>
      </header>

      {state === "running" ? (
        <>
          <p className="flex items-center gap-2 text-sm text-violet-300">
            <span className="h-2 w-2 rounded-full bg-violet-400" /> 키 조절 중 · 지연 {latencyMs} ms
          </p>
          <p className="text-xs leading-relaxed text-neutral-500">
            이 창은 최소화해도 됩니다. 닫으면 원래 소리로 돌아가요.
          </p>
          <button
            type="button"
            onClick={connect}
            className="self-start rounded-lg bg-neutral-800 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-700"
          >
            다시 연결
          </button>
        </>
      ) : (
        <>
          <ol className="list-decimal space-y-1 pl-4 text-sm leading-relaxed text-neutral-300">
            <li>아래 버튼을 누르세요.</li>
            <li>
              공유 창에서 <b>Chrome 탭</b> → <b>&lsquo;KeyTube ← 이 탭을 선택&rsquo;</b>을 고르세요.
            </li>
            <li>
              <b>탭 오디오도 공유</b>가 켜져 있는지 확인하고 공유를 누르세요.
            </li>
          </ol>
          <button
            type="button"
            onClick={connect}
            disabled={starting}
            className="rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-violet-400 disabled:opacity-50"
          >
            {starting ? "연결 중…" : "메인 탭 연결"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </>
      )}
    </main>
  );
}
