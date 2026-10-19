/** Level helpers shared by the meters and the feedback probe. */

/** Floor used for silence, so meters and comparisons never see -Infinity. */
export const SILENCE_DB = -100;

/** RMS of a time-domain block in dBFS (0 = full scale). */
export function rmsDb(samples: Float32Array): number {
  if (samples.length === 0) return SILENCE_DB;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(rms)) : SILENCE_DB;
}

/** Index of the FFT bin closest to a frequency. */
export function binForFrequency(frequency: number, sampleRate: number, fftSize: number): number {
  const binCount = fftSize / 2;
  return Math.min(binCount - 1, Math.max(0, Math.round((frequency * fftSize) / sampleRate)));
}
