import { captureTabAudio, type CaptureTarget } from "./capture";
import { createPitchShifter } from "./pitchShifter";

/** Capture → pitch shift → speakers, as one unit that cleans up after itself. */
export interface CaptureSession {
  setSemitones(semitones: number): void;
  /** Delay the shifter adds, in milliseconds. */
  latencyMs: number;
  stop(): void;
}

export interface StartOptions {
  /**
   * Must be "other" for anything that plays sound: a tab capturing itself
   * also captures (and silences) its own output. See docs/decisions.md.
   */
  target: CaptureTarget;
  /** Where the untouched signalsmith-stretch module is served. */
  stretchModuleUrl: string;
  semitones?: number;
  /** The user stopped sharing, or the captured tab closed. */
  onEnded?: () => void;
}

/** Call from a click handler: the AudioContext is created before the first await so autoplay policy allows it. */
export async function startCaptureSession(options: StartOptions): Promise<CaptureSession> {
  const context = new AudioContext({ latencyHint: "interactive" });
  let stream: MediaStream | null = null;
  try {
    const captured = await captureTabAudio(options.target);
    stream = captured.stream;
    // Only the sound is needed; keeping the video track would cost a screen encode for nothing.
    stream.getVideoTracks().forEach((track) => track.stop());

    const shifter = await createPitchShifter(context, options.stretchModuleUrl);
    shifter.setSemitones(options.semitones ?? 0);
    context.createMediaStreamSource(stream).connect(shifter.input);
    shifter.output.connect(context.destination);
    const latencyMs = Math.round((await shifter.latency()) * 1000);

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      captured.stream.getTracks().forEach((track) => track.stop());
      shifter.dispose();
      void context.close();
    };
    captured.audioTrack.addEventListener("ended", () => {
      stop();
      options.onEnded?.();
    });

    return { setSemitones: shifter.setSemitones, latencyMs, stop };
  } catch (error) {
    // A failure after capture would otherwise leave the captured tab silenced.
    stream?.getTracks().forEach((track) => track.stop());
    void context.close();
    throw error;
  }
}
