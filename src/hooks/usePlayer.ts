"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadYouTubeApi } from "@/lib/youtube/loadApi";
import { PlayerError, PlayerState, type PlayerStateValue, type YTPlayer } from "@/lib/youtube/types";

export interface UsePlayerResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  player: YTPlayer | null;
  playerState: PlayerStateValue;
  error: string | null;
  load: (videoId: string, startSeconds?: number) => void;
}

function describeError(code: number): string {
  switch (code) {
    case PlayerError.EMBED_DISALLOWED:
    case PlayerError.EMBED_DISALLOWED_ALT:
      return "이 영상은 저작권자가 외부 재생을 막아두었습니다. YouTube에서만 볼 수 있어요.";
    case PlayerError.NOT_FOUND:
      return "영상을 찾을 수 없습니다. 삭제되었거나 비공개일 수 있어요.";
    case PlayerError.INVALID_PARAM:
      return "영상 ID가 올바르지 않습니다.";
    default:
      return "영상을 재생할 수 없습니다. 다른 영상으로 시도해 주세요.";
  }
}

export function usePlayer(): UsePlayerResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  /** A load requested before onReady fired. */
  const pendingLoadRef = useRef<{ videoId: string; startSeconds: number } | null>(null);

  const [player, setPlayer] = useState<YTPlayer | null>(null);
  const [playerState, setPlayerState] = useState<PlayerStateValue>(PlayerState.UNSTARTED);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current) return;
        playerRef.current = new YT.Player(containerRef.current, {
          playerVars: {
            // Without playsinline iOS force-fullscreens playback.
            playsinline: 1,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              setPlayer(e.target);
              const queued = pendingLoadRef.current;
              if (queued) {
                pendingLoadRef.current = null;
                e.target.loadVideoById(queued.videoId, queued.startSeconds);
              }
            },
            onStateChange: (e) => {
              if (!cancelled) setPlayerState(e.data as PlayerStateValue);
            },
            onError: (e) => {
              if (!cancelled) setError(describeError(e.data));
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setError("YouTube 플레이어를 불러오지 못했습니다. 네트워크를 확인해 주세요.");
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  const load = useCallback((videoId: string, startSeconds = 0) => {
    setError(null);
    if (player) player.loadVideoById(videoId, startSeconds);
    else pendingLoadRef.current = { videoId, startSeconds };
  }, [player]);

  return { containerRef, player, playerState, error, load };
}
