import { frameChroma } from "./keyDetect";
import { songKeyFromWindows, type SongKey } from "./keySections";

/** Long enough to separate semitones down to ~C2 (2.7 Hz bins at 44.1 kHz). */
export const KEY_FFT_SIZE = 16384;
const SAMPLE_MS = 100;
const REPORT_MS = 1000;
/** Chroma is summed over this much *heard* music before sections are found. */
const WINDOW_SECONDS = 8;

export interface KeyTracker {
  /** Forget everything heard so far — call when a different song starts. */
  reset(): void;
  stop(): void;
}

/**
 * Samples an analyser on the *unshifted* signal and reports a running key
 * estimate for the song so far. Feeding it the shifted output would make the
 * "original key" move with every +/− press.
 *
 * Chroma is kept per window so a key change shows up as a new section rather
 * than dragging the original key toward the one between them. Windows count
 * only frames with music in them, so pausing doesn't split a section.
 */
export function trackKey(analyser: AnalyserNode, onEstimate: (estimate: SongKey | null) => void): KeyTracker {
  const options = { sampleRate: analyser.context.sampleRate, fftSize: analyser.fftSize };
  const framesPerWindow = Math.round((WINDOW_SECONDS * 1000) / SAMPLE_MS);
  const spectrum = new Float32Array(analyser.frequencyBinCount);
  let windows: Float64Array[] = [];
  let heard: number[] = [];
  let frames = 0;

  // An audible tab is exempt from Chrome's background timer throttling, and
  // the engine tab is audible whenever there is anything to analyse.
  const sampler = setInterval(() => {
    analyser.getFloatFrequencyData(spectrum);
    const chroma = frameChroma(spectrum, options);
    if (!chroma) return;
    const w = Math.floor(frames / framesPerWindow);
    windows[w] ??= new Float64Array(12);
    heard[w] = (heard[w] ?? 0) + 1;
    for (let i = 0; i < 12; i++) windows[w][i] += chroma[i]!;
    frames++;
  }, SAMPLE_MS);
  const reporter = setInterval(() => {
    const seconds = (frames * SAMPLE_MS) / 1000;
    onEstimate(frames ? songKeyFromWindows(windows, heard, WINDOW_SECONDS, SAMPLE_MS / 1000, seconds) : null);
  }, REPORT_MS);

  return {
    reset() {
      windows = [];
      heard = [];
      frames = 0;
      onEstimate(null);
    },
    stop() {
      clearInterval(sampler);
      clearInterval(reporter);
    },
  };
}
