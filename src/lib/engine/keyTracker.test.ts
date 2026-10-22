import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SongKey } from "./keySections";
import { KEY_FFT_SIZE, trackKey } from "./keyTracker";
import { keyLabel } from "./theory";

const SAMPLE_RATE = 44100;

/** A dB spectrum with a peak per partial of each note, like AnalyserNode's. */
function spectrum(midiNotes: number[]): Float32Array {
  const db = new Float32Array(KEY_FFT_SIZE / 2).fill(-120);
  const binHz = SAMPLE_RATE / KEY_FFT_SIZE;
  for (const midi of midiNotes) {
    for (let harmonic = 1; harmonic <= 4; harmonic++) {
      const bin = Math.round((440 * 2 ** ((midi - 69) / 12) * harmonic) / binHz);
      if (bin + 1 >= db.length) continue;
      db[bin] = Math.max(db[bin]!, -20 - 8 * (harmonic - 1));
    }
  }
  return db;
}
const triad = (root: number) => [root - 12, root, root + 4, root + 7];
const progression = (root: number) => [triad(root), triad(root + 5), triad(root + 7), triad(root)];

/** Stands in for an AnalyserNode; `play` sets what it hears next (null = silence). */
function fakeAnalyser() {
  let current: Float32Array = new Float32Array(KEY_FFT_SIZE / 2).fill(-Infinity);
  const silence = current;
  const analyser = {
    context: { sampleRate: SAMPLE_RATE },
    fftSize: KEY_FFT_SIZE,
    frequencyBinCount: KEY_FFT_SIZE / 2,
    getFloatFrequencyData: (out: Float32Array) => out.set(current),
  } as unknown as AnalyserNode;
  return { analyser, play: (notes: number[] | null) => (current = notes ? spectrum(notes) : silence) };
}

/** Plays each chord of `chords` for `seconds`, cycling, at the tracker's 100 ms sampling. */
function playFor(fake: ReturnType<typeof fakeAnalyser>, chords: number[][], seconds: number) {
  for (let t = 0; t < seconds; t++) {
    fake.play(chords[t % chords.length]!);
    vi.advanceTimersByTime(1000);
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("trackKey", () => {
  it("reports a key change as a new section, keeping the original key", () => {
    const fake = fakeAnalyser();
    let last: SongKey | null = null;
    const tracker = trackKey(fake.analyser, (estimate) => (last = estimate));
    playFor(fake, progression(67), 60); // G major
    playFor(fake, progression(69), 40); // up a whole step
    tracker.stop();
    const result = last as SongKey | null;
    expect(keyLabel(result!.candidates[0]!.key).name).toBe("G major");
    expect(result!.sections.map((s) => keyLabel(s.key).name)).toEqual(["G major", "A major"]);
  });

  it("doesn't count a pause as time, so it can't split a section", () => {
    const fake = fakeAnalyser();
    let last: SongKey | null = null;
    const tracker = trackKey(fake.analyser, (estimate) => (last = estimate));
    playFor(fake, progression(62), 20);
    fake.play(null);
    vi.advanceTimersByTime(60_000);
    playFor(fake, progression(62), 20);
    tracker.stop();
    const result = last as SongKey | null;
    expect(result!.seconds).toBeCloseTo(40, 0);
    expect(result!.sections).toHaveLength(1);
  });

  it("starts over on reset", () => {
    const fake = fakeAnalyser();
    const seen: (SongKey | null)[] = [];
    const tracker = trackKey(fake.analyser, (estimate) => seen.push(estimate));
    playFor(fake, progression(60), 10);
    tracker.reset();
    expect(seen.at(-1)).toBeNull();
    fake.play(null);
    vi.advanceTimersByTime(2000);
    expect(seen.at(-1)).toBeNull();
    tracker.stop();
  });
});
