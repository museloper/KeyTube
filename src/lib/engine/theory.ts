/**
 * Key names and transposition. Pure functions only — this folder is the
 * framework-agnostic engine (see CLAUDE.md), so no React or DOM here.
 */

export type Mode = "major" | "minor";

export interface Key {
  /** Pitch class of the tonic, 0 = C … 11 = B. */
  tonic: number;
  mode: Mode;
}

export interface KeyLabel {
  /** e.g. "B♭" — the tonic as it would be spelled in that key's signature. */
  tonic: string;
  /** e.g. "B♭ major", "F♯m" style is left to the UI. */
  name: string;
  /** e.g. "내림나장조". */
  korean: string;
}

/**
 * The spelling each key conventionally uses: the one with fewer accidentals
 * in its signature (D♭ major has 5 flats, C♯ major would have 7 sharps).
 * F♯/G♭ major and D♯/E♭ minor tie at six; we pick the spelling pop chord
 * charts use most.
 */
const MAJOR_TONICS = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const MINOR_TONICS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "G♯", "A", "B♭", "B"];

const KOREAN_LETTERS: Record<string, string> = {
  C: "다",
  D: "라",
  E: "마",
  F: "바",
  G: "사",
  A: "가",
  B: "나",
};

/** Wraps any integer into 0–11. */
export function pitchClass(n: number): number {
  return ((Math.round(n) % 12) + 12) % 12;
}

export function transposeKey(key: Key, semitones: number): Key {
  return { tonic: pitchClass(key.tonic + semitones), mode: key.mode };
}

/** The major/minor key that shares this key's signature (C major ↔ A minor). */
export function relativeKey(key: Key): Key {
  return key.mode === "major"
    ? { tonic: pitchClass(key.tonic + 9), mode: "minor" }
    : { tonic: pitchClass(key.tonic + 3), mode: "major" };
}

export function keyLabel(key: Key): KeyLabel {
  const tonic = (key.mode === "major" ? MAJOR_TONICS : MINOR_TONICS)[pitchClass(key.tonic)]!;
  const letter = KOREAN_LETTERS[tonic[0]!]!;
  const accidental = tonic.includes("♯") ? "올림" : tonic.includes("♭") ? "내림" : "";
  return {
    tonic,
    name: `${tonic} ${key.mode}`,
    korean: `${accidental}${letter}${key.mode === "major" ? "장조" : "단조"}`,
  };
}

/** "+2", "−3" (true minus sign), or "원키" for 0. */
export function formatSemitones(semitones: number): string {
  if (semitones === 0) return "원키";
  return semitones > 0 ? `+${semitones}` : `−${Math.abs(semitones)}`;
}

/**
 * Reads a key the user typed: "Bb", "B♭m", "f#", "C# minor", "Am".
 * Returns null when it can't tell.
 */
export function parseKey(input: string): Key | null {
  const match = input
    .trim()
    .match(/^([A-Ga-g])\s*([#♯b♭]?)\s*(m|min|minor|maj|major|M)?$/);
  if (!match) return null;
  const [, letter, accidental, quality] = match;
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter!.toUpperCase() as "C"];
  const shift = accidental === "#" || accidental === "♯" ? 1 : accidental === "b" || accidental === "♭" ? -1 : 0;
  const minor = quality === "m" || quality === "min" || quality === "minor";
  return { tonic: pitchClass(natural + shift), mode: minor ? "minor" : "major" };
}
