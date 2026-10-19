import { KeyEstimator, type KeyEstimate } from "./keyDetect";

/** Long enough to separate semitones down to ~C2 (2.7 Hz bins at 44.1 kHz). */
export const KEY_FFT_SIZE = 16384;
const SAMPLE_MS = 100;
const REPORT_MS = 1000;

export interface KeyTracker {
  /** Forget everything heard so far — call when a different song starts. */
  reset(): void;
  stop(): void;
}

/**
 * Samples an analyser on the *unshifted* signal and reports a running key
 * estimate for the whole song so far. Feeding it the shifted output would
 * make the "original key" move with every +/− press.
 */
export function trackKey(analyser: AnalyserNode, onEstimate: (estimate: KeyEstimate | null) => void): KeyTracker {
  const estimator = new KeyEstimator(
    { sampleRate: analyser.context.sampleRate, fftSize: analyser.fftSize },
    SAMPLE_MS / 1000,
  );
  const spectrum = new Float32Array(analyser.frequencyBinCount);

  // An audible tab is exempt from Chrome's background timer throttling, and
  // the engine tab is audible whenever there is anything to analyse.
  const sampler = setInterval(() => {
    analyser.getFloatFrequencyData(spectrum);
    estimator.add(spectrum);
  }, SAMPLE_MS);
  const reporter = setInterval(() => onEstimate(estimator.estimate()), REPORT_MS);

  return {
    reset() {
      estimator.reset();
      onEstimate(null);
    },
    stop() {
      clearInterval(sampler);
      clearInterval(reporter);
    },
  };
}
