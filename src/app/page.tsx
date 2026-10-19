"use client";

import { useState } from "react";
import { EngineBar } from "@/components/EngineBar";
import { KeyPanel } from "@/components/KeyPanel";
import { Player } from "@/components/Player";
import { UrlInput } from "@/components/UrlInput";
import { useEngine } from "@/hooks/useEngine";
import { usePlayer } from "@/hooks/usePlayer";
import type { Key } from "@/lib/engine/theory";
import { fetchVideoMeta, type VideoMeta } from "@/lib/youtube/oembed";

export default function Home() {
  const { containerRef, error, load } = usePlayer();
  const [videoId, setVideoId] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  /** Overrides the engine's estimate when set. */
  const [manualKey, setManualKey] = useState<Key | null>(null);
  const [semitones, setSemitones] = useState(0);
  const engine = useEngine(semitones);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight">KeyTube</h1>
        <p className="text-xs text-neutral-500">유튜브 키 조절 · 키 판별</p>
      </header>

      <UrlInput
        onSubmit={(parsed) => {
          if (!parsed.videoId) return;
          setVideoId(parsed.videoId);
          setMeta(null);
          setManualKey(null);
          setSemitones(0);
          engine.resetKey();
          fetchVideoMeta(parsed.videoId).then(setMeta);
          load(parsed.videoId, parsed.startSeconds ?? 0);
        }}
      />

      <Player containerRef={containerRef} error={error} hasVideo={Boolean(videoId)} />

      {meta && (
        <p className="truncate text-sm text-neutral-300">
          {meta.title}
          {meta.author && <span className="text-neutral-500"> · {meta.author}</span>}
        </p>
      )}

      <EngineBar engine={engine} />

      <KeyPanel
        estimate={engine.keyEstimate}
        listening={engine.status === "running"}
        manualKey={manualKey}
        onManualKeyChange={setManualKey}
        semitones={semitones}
        onSemitonesChange={setSemitones}
      />
    </main>
  );
}
