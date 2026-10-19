import { describe, expect, it } from "vitest";
import { formatSemitones, keyLabel, parseKey, pitchClass, relativeKey, transposeKey, type Key } from "./theory";

const C_MAJOR: Key = { tonic: 0, mode: "major" };
const A_MINOR: Key = { tonic: 9, mode: "minor" };

describe("pitchClass", () => {
  it.each([
    [0, 0],
    [12, 0],
    [-1, 11],
    [-13, 11],
    [25, 1],
  ])("wraps %i to %i", (input, expected) => {
    expect(pitchClass(input)).toBe(expected);
  });
});

describe("transposeKey", () => {
  it("moves the tonic and keeps the mode", () => {
    expect(transposeKey(A_MINOR, 2)).toEqual({ tonic: 11, mode: "minor" });
  });

  it("wraps around the octave in both directions", () => {
    expect(transposeKey({ tonic: 11, mode: "major" }, 1)).toEqual(C_MAJOR);
    expect(transposeKey(C_MAJOR, -1)).toEqual({ tonic: 11, mode: "major" });
  });

  it("returns to the original key after a full octave", () => {
    expect(transposeKey(A_MINOR, 12)).toEqual(A_MINOR);
    expect(transposeKey(A_MINOR, -12)).toEqual(A_MINOR);
  });
});

describe("relativeKey", () => {
  it("pairs C major with A minor both ways", () => {
    expect(relativeKey(C_MAJOR)).toEqual(A_MINOR);
    expect(relativeKey(A_MINOR)).toEqual(C_MAJOR);
  });

  it("pairs E♭ major with C minor", () => {
    expect(relativeKey({ tonic: 3, mode: "major" })).toEqual({ tonic: 0, mode: "minor" });
  });
});

describe("keyLabel", () => {
  it.each([
    [1, "major", "D♭ major", "내림라장조"],
    [6, "major", "F♯ major", "올림바장조"],
    [10, "major", "B♭ major", "내림나장조"],
    [0, "major", "C major", "다장조"],
    [1, "minor", "C♯ minor", "올림다단조"],
    [3, "minor", "E♭ minor", "내림마단조"],
    [8, "minor", "G♯ minor", "올림사단조"],
    [9, "minor", "A minor", "가단조"],
  ] as const)("spells tonic %i %s as %s / %s", (tonic, mode, name, korean) => {
    const label = keyLabel({ tonic, mode });
    expect(label.name).toBe(name);
    expect(label.korean).toBe(korean);
  });

  it("spells the same pitch differently for major and minor", () => {
    // Pitch class 8: A♭ major (4 flats) but G♯ minor (5 sharps, vs A♭ minor's 7 flats).
    expect(keyLabel({ tonic: 8, mode: "major" }).tonic).toBe("A♭");
    expect(keyLabel({ tonic: 8, mode: "minor" }).tonic).toBe("G♯");
  });
});

describe("formatSemitones", () => {
  it.each([
    [0, "원키"],
    [2, "+2"],
    [-3, "−3"],
  ])("formats %i as %s", (input, expected) => {
    expect(formatSemitones(input)).toBe(expected);
  });
});

describe("parseKey", () => {
  it.each([
    ["C", { tonic: 0, mode: "major" }],
    ["Am", { tonic: 9, mode: "minor" }],
    ["Bb", { tonic: 10, mode: "major" }],
    ["B♭m", { tonic: 10, mode: "minor" }],
    ["f#", { tonic: 6, mode: "major" }],
    ["C# minor", { tonic: 1, mode: "minor" }],
    ["Eb major", { tonic: 3, mode: "major" }],
    ["Cb", { tonic: 11, mode: "major" }],
  ])("reads %s", (input, expected) => {
    expect(parseKey(input)).toEqual(expected);
  });

  it.each(["", "H", "C##", "Cm7", "do"])("rejects %s", (input) => {
    expect(parseKey(input)).toBeNull();
  });
});
