import { pitchClass, type Key } from "./theory";

/**
 * Key estimation from audio spectra: fold the spectrum into a 12-bin chroma
 * (energy per pitch class), accumulate it over the song, and correlate it
 * with key profiles for all 24 keys. Pure functions — the caller supplies
 * spectra (e.g. AnalyserNode.getFloatFrequencyData).
 */

/**
 * Temperley's (2007) Kostka–Payne profiles, tonic first. Krumhansl–Kessler
 * (1982) kept mistaking songs for their dominant key (G major → D major);
 * see docs/decisions.md.
 */
const MAJOR_PROFILE = [0.748, 0.06, 0.488, 0.082, 0.67, 0.46, 0.096, 0.715, 0.104, 0.366, 0.057, 0.4];
const MINOR_PROFILE = [0.712, 0.084, 0.474, 0.618, 0.049, 0.46, 0.105, 0.747, 0.404, 0.067, 0.133, 0.33];

export interface KeyCandidate {
  key: Key;
  /** Pearson correlation with the key's profile, -1…1. */
  score: number;
}

export type Confidence = "low" | "medium" | "high";

export interface KeyEstimate {
  /** Best first; a handful, so the UI can offer the usual confusions (relative / dominant key). */
  candidates: KeyCandidate[];
  confidence: Confidence;
  /** Seconds of non-silent audio the estimate is based on. */
  seconds: number;
}

function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += a[i]!;
    meanB += b[i]!;
  }
  meanA /= n;
  meanB /= n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - meanA;
    const db = b[i]! - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  return varA > 0 && varB > 0 ? cov / Math.sqrt(varA * varB) : 0;
}

/** All 24 keys, best match first. */
export function rankKeys(chroma: ArrayLike<number>): KeyCandidate[] {
  const candidates: KeyCandidate[] = [];
  for (const mode of ["major", "minor"] as const) {
    const profile = mode === "major" ? MAJOR_PROFILE : MINOR_PROFILE;
    for (let tonic = 0; tonic < 12; tonic++) {
      // Rotate the chroma so index 0 is this tonic, then compare with the tonic-first profile.
      const rotated = Array.from({ length: 12 }, (_, i) => chroma[pitchClass(tonic + i)]!);
      candidates.push({ key: { tonic, mode }, score: pearson(rotated, profile) });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

export interface SpectrumOptions {
  sampleRate: number;
  fftSize: number;
  /** Below this, bins are too wide to tell neighbouring semitones apart. */
  minHz?: number;
  /** Above this, it's mostly overtones and percussion. */
  maxHz?: number;
}

/**
 * Folds one dB spectrum into a chroma vector, normalised to sum 1 so every
 * frame gets an equal vote. Only local peaks count: the smear around each
 * partial and broadband noise would otherwise flatten the profile. Returns
 * null for a frame with nothing in range (silence).
 */
export function chromaFromSpectrum(db: ArrayLike<number>, options: SpectrumOptions): Float64Array | null {
  const { sampleRate, fftSize, minHz = 65, maxHz = 2000 } = options;
  const binHz = sampleRate / fftSize;
  const first = Math.max(1, Math.ceil(minHz / binHz));
  const last = Math.min(db.length - 2, Math.floor(maxHz / binHz));
  const chroma = new Float64Array(12);
  let total = 0;

  for (let k = first; k <= last; k++) {
    const value = db[k]!;
    if (!Number.isFinite(value) || value < db[k - 1]! || value < db[k + 1]!) continue;
    const magnitude = 10 ** (value / 20);
    const midi = 69 + 12 * Math.log2((k * binHz) / 440);
    chroma[pitchClass(midi)] += magnitude;
    total += magnitude;
  }

  if (total <= 0) return null;
  for (let i = 0; i < 12; i++) chroma[i] /= total;
  return chroma;
}

/** Chroma of one frame, or null if it's silence (loudest bin below `silenceDb`) or has nothing in range. */
export function frameChroma(db: ArrayLike<number>, options: SpectrumOptions, silenceDb = -70): Float64Array | null {
  let loudest = -Infinity;
  for (let i = 0; i < db.length; i++) if (db[i]! > loudest) loudest = db[i]!;
  return loudest < silenceDb ? null : chromaFromSpectrum(db, options);
}

/** How sure the estimate is, from how far the winner pulls ahead and how much was heard. */
export function confidenceOf(candidates: KeyCandidate[], seconds: number): Confidence {
  const best = candidates[0]?.score ?? 0;
  const margin = best - (candidates[1]?.score ?? 0);
  if (seconds < 8 || best < 0.5) return "low";
  if (margin > 0.08 && best > 0.75 && seconds >= 20) return "high";
  return margin > 0.04 ? "medium" : "low";
}

/** Accumulates spectra frame by frame over a song. */
export class KeyEstimator {
  private readonly sum = new Float64Array(12);
  private frames = 0;

  constructor(
    private readonly options: SpectrumOptions,
    /** Seconds each added frame stands for — the caller's sampling interval. */
    private readonly frameSeconds: number,
    /** Frames whose loudest in-range bin is below this are skipped as silence. */
    private readonly silenceDb = -70,
  ) {}

  add(db: ArrayLike<number>): void {
    const chroma = frameChroma(db, this.options, this.silenceDb);
    if (!chroma) return;
    for (let i = 0; i < 12; i++) this.sum[i] += chroma[i]!;
    this.frames++;
  }

  reset(): void {
    this.sum.fill(0);
    this.frames = 0;
  }

  estimate(topN = 4): KeyEstimate | null {
    if (this.frames === 0) return null;
    const seconds = this.frames * this.frameSeconds;
    const ranked = rankKeys(this.sum);
    return { candidates: ranked.slice(0, topN), confidence: confidenceOf(ranked, seconds), seconds };
  }
}
