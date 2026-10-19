/**
 * Tab-audio capture (approach A). The IFrame player is cross-origin, so its
 * audio can't be tapped with Web Audio directly; instead the user shares a
 * browser tab with audio, and Chrome hands us what that tab plays.
 *
 * We never touch the YouTube stream itself — we only receive the audio the
 * official, visible player has already rendered. See CLAUDE.md.
 */

export type CaptureTarget =
  /** Offer this very tab first ("This tab"); the player lives on the same page. */
  | "self"
  /** Hide this tab from the picker; the player lives in another tab. */
  | "other";

export interface CaptureResult {
  stream: MediaStream;
  audioTrack: MediaStreamTrack;
  /** What the browser says it actually applied — constraints are only hints. */
  settings: MediaTrackSettings & Record<string, unknown>;
}

export class CaptureError extends Error {
  constructor(
    message: string,
    readonly reason: "unsupported" | "denied" | "no-audio",
  ) {
    super(message);
  }
}

export function isCaptureSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

export async function captureTabAudio(target: CaptureTarget): Promise<CaptureResult> {
  if (!isCaptureSupported()) {
    throw new CaptureError("이 브라우저는 탭 오디오 캡처를 지원하지 않아요.", "unsupported");
  }

  // Several of these options are Chrome-only and missing from lib.dom, hence the cast.
  const options = {
    // Chrome refuses audio-only capture, so a video track is requested and then dropped.
    video: { displaySurface: "browser" },
    audio: {
      // Stop the tab's own sound so the user hears only our shifted copy.
      suppressLocalAudioPlayback: true,
      // Voice-call processing would mangle music.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    preferCurrentTab: target === "self",
    selfBrowserSurface: target === "self" ? "include" : "exclude",
    surfaceSwitching: "exclude",
    systemAudio: "exclude",
    monitorTypeSurfaces: "exclude",
  } as DisplayMediaStreamOptions;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia(options);
  } catch (error) {
    throw new CaptureError(
      error instanceof Error && error.name === "NotAllowedError"
        ? "공유가 취소됐어요."
        : `캡처를 시작하지 못했어요: ${String(error)}`,
      "denied",
    );
  }

  const audioTrack = stream.getAudioTracks()[0];
  if (!audioTrack) {
    stream.getTracks().forEach((track) => track.stop());
    throw new CaptureError(
      "오디오가 공유되지 않았어요. 공유 창에서 'Chrome 탭'을 고르고 '탭 오디오도 공유'를 켜 주세요.",
      "no-audio",
    );
  }

  return {
    stream,
    audioTrack,
    settings: audioTrack.getSettings() as CaptureResult["settings"],
  };
}
