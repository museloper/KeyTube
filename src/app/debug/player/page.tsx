"use client";

import { useState } from "react";
import { Player } from "@/components/Player";
import { UrlInput } from "@/components/UrlInput";
import { usePlayer } from "@/hooks/usePlayer";

/** The player half of the "other tab" capture check: this tab is the one that gets shared. */
export default function DebugPlayerPage() {
  const { containerRef, error, load } = usePlayer();
  const [hasVideo, setHasVideo] = useState(false);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5">
      <h1 className="text-lg font-bold tracking-tight">KeyTube · 플레이어 탭</h1>
      <p className="text-sm text-neutral-400">
        여기서 영상을 재생한 뒤 검증 탭으로 돌아가 &lsquo;캡처 시작&rsquo;을 누르고, 공유 창에서 이 탭을 고르세요.
      </p>
      <UrlInput
        onSubmit={(parsed) => {
          if (!parsed.videoId) return;
          setHasVideo(true);
          load(parsed.videoId, parsed.startSeconds ?? 0);
        }}
      />
      <Player containerRef={containerRef} error={error} hasVideo={hasVideo} />
    </main>
  );
}
