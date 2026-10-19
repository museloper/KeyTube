"use client";

import type { UseEngineResult } from "@/hooks/useEngine";

const smallButton =
  "shrink-0 rounded-lg bg-neutral-800 px-3 py-2 text-xs text-neutral-200 transition hover:bg-neutral-700";

/** Connection state of the engine tab, which is what actually changes the sound. */
export function EngineBar({ engine }: { engine: UseEngineResult }) {
  const { status, latencyMs, error, supported, open, close } = engine;

  if (!supported) {
    return (
      <p className="rounded-xl bg-neutral-900 px-4 py-3 text-sm text-neutral-400">
        키 조절은 데스크톱 Chrome·Edge에서만 돼요. 이 브라우저에서는 키 계산만 볼 수 있어요.
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-neutral-900 px-4 py-3">
      {status === "running" ? (
        <>
          <p className="flex items-center gap-2 text-sm text-violet-300">
            <span className="h-2 w-2 shrink-0 rounded-full bg-violet-400" />
            키 조절 연결됨
            {latencyMs !== null && (
              <span className="text-xs text-neutral-500">· 소리가 영상보다 약 {latencyMs} ms 늦어요</span>
            )}
          </p>
          <button type="button" onClick={close} className={smallButton}>
            끄기
          </button>
        </>
      ) : status === "waiting" ? (
        <>
          <p className="text-sm leading-relaxed text-neutral-300">
            엔진 탭에서 <b>메인 탭 연결</b>을 누르고, 공유 창에서 <b>&lsquo;KeyTube ← 이 탭을 선택&rsquo;</b>을 고르세요.
          </p>
          <span className="flex shrink-0 gap-1.5">
            <button type="button" onClick={open} className={smallButton}>
              엔진 탭 보기
            </button>
            <button type="button" onClick={close} className={smallButton}>
              취소
            </button>
          </span>
        </>
      ) : (
        <>
          <p className={`text-sm ${status === "error" ? "text-red-400" : "text-neutral-400"}`}>
            {status === "error" ? error : "키 조절 꺼짐 — 지금은 원래 키로 들려요."}
          </p>
          <button
            type="button"
            onClick={open}
            className="shrink-0 rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-violet-400"
          >
            {status === "error" ? "다시 시도" : "키 조절 켜기"}
          </button>
        </>
      )}
    </div>
  );
}
