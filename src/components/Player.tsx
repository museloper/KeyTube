"use client";

import type { RefObject } from "react";

interface PlayerProps {
  containerRef: RefObject<HTMLDivElement | null>;
  error: string | null;
  hasVideo: boolean;
}

export function Player({ containerRef, error, hasVideo }: PlayerProps) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black shadow-lg">
      <div className="aspect-video w-full [&>iframe]:h-full [&>iframe]:w-full">
        <div ref={containerRef} />
      </div>

      {!hasVideo && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-neutral-400">
          YouTube 링크를 붙여넣으면 여기에 영상이 나타납니다.
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-6">
          <p className="max-w-sm text-center text-sm leading-relaxed text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
}
