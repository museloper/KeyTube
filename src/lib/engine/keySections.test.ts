import { describe, expect, it } from "vitest";
import { keySections, songKeyFromWindows } from "./keySections";
import { keyLabel, type Key } from "./theory";

const MAJOR = [0.748, 0.06, 0.488, 0.082, 0.67, 0.46, 0.096, 0.715, 0.104, 0.366, 0.057, 0.4];
/** A window that sounds exactly like `tonic` major. */
const window = (tonic: number) => Array.from({ length: 12 }, (_, i) => MAJOR[(i - tonic + 12) % 12]!);
const names = (sections: { start: number; key: Key }[]) => sections.map((s) => `${s.start} ${keyLabel(s.key).name}`);

describe("keySections", () => {
  it("finds a key change instead of averaging across it", () => {
    const windows = [...Array(10).fill(window(0)), ...Array(5).fill(window(2))];
    expect(names(keySections(windows, 8, 120))).toEqual(["0 C major", "80 D major"]);
  });

  it("folds a short detour back into the key around it", () => {
    const windows = [...Array(6).fill(window(0)), window(7), window(7), ...Array(6).fill(window(0))];
    expect(names(keySections(windows, 8, 112))).toEqual(["0 C major"]);
  });

  it("ends the last section at the track's end, not the window's", () => {
    const [only] = keySections([window(5), window(5), window(5)], 8, 21);
    expect(only!.end).toBe(21);
  });
});

describe("songKeyFromWindows", () => {
  it("takes the original key from the opening, not from the whole song", () => {
    // G major then a long stretch of A major: averaged together they'd lean to D major.
    const windows = [...Array(8).fill(window(7)), ...Array(10).fill(window(9))];
    const result = songKeyFromWindows(windows, Array(18).fill(80), 8, 0.1, 144)!;
    expect(keyLabel(result.candidates[0]!.key).name).toBe("G major");
    expect(result.sections.map((s) => keyLabel(s.key).name)).toEqual(["G major", "A major"]);
    expect(result.seconds).toBeCloseTo(64, 6);
  });

  it("is null when nothing has been heard", () => {
    expect(songKeyFromWindows([new Float64Array(12)], [0], 8, 0.1, 0)).toBeNull();
  });
});
