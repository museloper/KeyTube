import { describe, expect, it } from "vitest";
import { binForFrequency, rmsDb, SILENCE_DB } from "./meter";

describe("rmsDb", () => {
  it("reads silence as the floor", () => {
    expect(rmsDb(new Float32Array(128))).toBe(SILENCE_DB);
    expect(rmsDb(new Float32Array(0))).toBe(SILENCE_DB);
  });

  it("reads a full-scale square wave as 0 dBFS", () => {
    const square = Float32Array.from({ length: 128 }, (_, i) => (i % 2 ? 1 : -1));
    expect(rmsDb(square)).toBeCloseTo(0, 5);
  });

  it("reads a half-amplitude square wave as about -6 dBFS", () => {
    const square = Float32Array.from({ length: 128 }, (_, i) => (i % 2 ? 0.5 : -0.5));
    expect(rmsDb(square)).toBeCloseTo(-6.02, 1);
  });
});

describe("binForFrequency", () => {
  it("maps a frequency to the nearest bin", () => {
    // 48 kHz / 2048 = 23.4 Hz per bin; 880 Hz sits at bin 37.5 → 38.
    expect(binForFrequency(880, 48000, 2048)).toBe(38);
  });

  it("clamps to the available bins", () => {
    expect(binForFrequency(-10, 48000, 2048)).toBe(0);
    expect(binForFrequency(30000, 48000, 2048)).toBe(1023);
  });
});
