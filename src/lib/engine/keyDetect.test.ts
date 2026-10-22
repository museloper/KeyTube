import { describe, expect, it } from "vitest";
import { chromaFromSpectrum, confidenceOf, KeyEstimator, rankKeys } from "./keyDetect";
import { keyLabel, transposeKey } from "./theory";

const SAMPLE_RATE = 44100;
const FFT_SIZE = 16384;
const OPTIONS = { sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE };
const FLOOR_DB = -120;

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/**
 * A dB spectrum like AnalyserNode's, with a peak per partial: each note gets
 * its fundamental plus a few weaker harmonics, as real instruments do.
 */
function spectrum(midiNotes: number[]): Float32Array {
  const db = new Float32Array(FFT_SIZE / 2).fill(FLOOR_DB);
  const binHz = SAMPLE_RATE / FFT_SIZE;
  for (const midi of midiNotes) {
    for (let harmonic = 1; harmonic <= 4; harmonic++) {
      const bin = Math.round((midiToHz(midi) * harmonic) / binHz);
      if (bin + 1 >= db.length) continue;
      const level = -20 - 8 * (harmonic - 1);
      db[bin] = Math.max(db[bin]!, level);
      db[bin - 1] = Math.max(db[bin - 1]!, level - 12);
      db[bin + 1] = Math.max(db[bin + 1]!, level - 12);
    }
  }
  return db;
}

/** Triads as MIDI notes, root position around C3–C5 with a bass note. */
function triad(rootMidi: number, minor = false): number[] {
  return [rootMidi - 12, rootMidi, rootMidi + (minor ? 3 : 4), rootMidi + 7];
}

function feed(estimator: KeyEstimator, chords: number[][], framesEach = 20) {
  for (const chord of chords) for (let i = 0; i < framesEach; i++) estimator.add(spectrum(chord));
}

const name = (candidate: { key: Parameters<typeof keyLabel>[0] } | undefined) =>
  candidate ? keyLabel(candidate.key).name : null;

describe("rankKeys", () => {
  it("picks the key whose own profile it is fed", () => {
    // The C major profile itself, rotated to E: should rank E major first with r = 1.
    const cMajor = [0.748, 0.06, 0.488, 0.082, 0.67, 0.46, 0.096, 0.715, 0.104, 0.366, 0.057, 0.4];
    const eMajor = Array.from({ length: 12 }, (_, i) => cMajor[(i - 4 + 12) % 12]!);
    const [best] = rankKeys(eMajor);
    expect(name(best)).toBe("E major");
    expect(best!.score).toBeCloseTo(1, 5);
  });

  it("ranks all 24 keys", () => {
    expect(rankKeys(new Array(12).fill(1).map((_, i) => i))).toHaveLength(24);
  });
});

describe("chromaFromSpectrum", () => {
  it("puts a single A at pitch class 9", () => {
    const chroma = chromaFromSpectrum(spectrum([69]), OPTIONS)!;
    const loudest = chroma.indexOf(Math.max(...chroma));
    expect(loudest).toBe(9);
  });

  it("normalises each frame to sum 1", () => {
    const chroma = chromaFromSpectrum(spectrum([60, 64, 67]), OPTIONS)!;
    expect(chroma.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("returns null when nothing is in range", () => {
    expect(chromaFromSpectrum(new Float32Array(FFT_SIZE / 2).fill(-Infinity), OPTIONS)).toBeNull();
  });
});

describe("KeyEstimator", () => {
  const D = 62;

  it("finds D major from a I–IV–V–I progression", () => {
    const estimator = new KeyEstimator(OPTIONS, 0.1);
    feed(estimator, [triad(D), triad(D + 5), triad(D + 7), triad(D)]);
    expect(name(estimator.estimate()!.candidates[0])).toBe("D major");
  });

  it("finds A minor from i–iv–V–i (the raised 7th in V tips it from C major)", () => {
    const A = 57;
    const estimator = new KeyEstimator(OPTIONS, 0.1);
    feed(estimator, [triad(A, true), triad(A + 5, true), triad(A + 7), triad(A, true)]);
    expect(name(estimator.estimate()!.candidates[0])).toBe("A minor");
  });

  it("follows the music when everything is transposed", () => {
    const C = 60;
    const progression = (root: number) => [triad(root), triad(root + 5), triad(root + 7), triad(root)];
    const base = new KeyEstimator(OPTIONS, 0.1);
    feed(base, progression(C));
    const baseKey = base.estimate()!.candidates[0]!.key;

    for (const shift of [-5, -2, 1, 3, 6]) {
      const shifted = new KeyEstimator(OPTIONS, 0.1);
      feed(shifted, progression(C + shift));
      expect(shifted.estimate()!.candidates[0]!.key).toEqual(transposeKey(baseKey, shift));
    }
  });

  it("ignores silent frames", () => {
    const estimator = new KeyEstimator(OPTIONS, 0.1);
    for (let i = 0; i < 50; i++) estimator.add(new Float32Array(FFT_SIZE / 2).fill(-110));
    expect(estimator.estimate()).toBeNull();
    feed(estimator, [triad(D)], 10);
    expect(estimator.estimate()!.seconds).toBeCloseTo(1, 6);
  });

  it("starts over on reset", () => {
    const estimator = new KeyEstimator(OPTIONS, 0.1);
    feed(estimator, [triad(D)]);
    estimator.reset();
    expect(estimator.estimate()).toBeNull();
  });
});

describe("confidenceOf", () => {
  const candidates = (best: number, second: number) => [
    { key: { tonic: 0, mode: "major" as const }, score: best },
    { key: { tonic: 9, mode: "minor" as const }, score: second },
  ];

  it("stays low until enough has been heard", () => {
    expect(confidenceOf(candidates(0.95, 0.5), 3)).toBe("low");
  });

  it("is high for a clear winner after a while", () => {
    expect(confidenceOf(candidates(0.9, 0.7), 30)).toBe("high");
  });

  it("is low when two keys are neck and neck", () => {
    expect(confidenceOf(candidates(0.8, 0.79), 30)).toBe("low");
  });
});
