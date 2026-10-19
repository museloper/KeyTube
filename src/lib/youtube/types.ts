/** Minimal typings for the YouTube IFrame Player API surface we actually use. */

export const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export type PlayerStateValue = (typeof PlayerState)[keyof typeof PlayerState];

/** onError codes. 101 and 150 both mean "the owner disallows embedding". */
export const PlayerError = {
  INVALID_PARAM: 2,
  HTML5_ERROR: 5,
  NOT_FOUND: 100,
  EMBED_DISALLOWED: 101,
  EMBED_DISALLOWED_ALT: 150,
} as const;

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): PlayerStateValue;
  setPlaybackRate(suggestedRate: number): void;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  loadVideoById(videoId: string, startSeconds?: number): void;
  cueVideoById(videoId: string, startSeconds?: number): void;
  // Note: there is no "...ById" variant of this one — that's cueVideoById's
  // naming, but the playlist function is just cuePlaylist (object form).
  cuePlaylist(options: { list: string; listType?: string; index?: number; startSeconds?: number }): void;
  /** Populated once a playlist is cued/loaded; undefined otherwise. */
  getPlaylist(): string[] | undefined;
  destroy(): void;
}

export interface YTPlayerEvent {
  target: YTPlayer;
  data: number;
}

export interface YTNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: YTPlayerEvent) => void;
        onStateChange?: (e: YTPlayerEvent) => void;
        onPlaybackRateChange?: (e: YTPlayerEvent) => void;
        onError?: (e: YTPlayerEvent) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: typeof PlayerState;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}
