import { confidenceOf, rankKeys, type KeyEstimate } from "./keyDetect";
import type { Key } from "./theory";

/**
 * Splits a song into stretches of one key, so a final-chorus key change
 * (G major → A major) isn't averaged into the key between them (D major).
 * Pure: the caller supplies chroma summed over fixed-length windows — from a
 * decoded file, or live from an analyser as it plays.
 */

export interface KeySection {
  /** Seconds from the start of the track. */
  start: number;
  end: number;
  key: Key;
}

/** What one key change costs, in correlation units; keeps a passing chord from counting as a modulation. */
const CHANGE_PENALTY = 0.6;
/** Stretches shorter than this are folded into a neighbour: a bridge or a borrowed chord, not a new key. */
export const MIN_SECTION_SECONDS = 20;

const keyIndex = (key: Key) => key.tonic + (key.mode === "minor" ? 12 : 0);
const indexKey = (index: number): Key => ({ tonic: index % 12, mode: index < 12 ? "major" : "minor" });
const sameKey = (a: Key, b: Key) => a.tonic === b.tonic && a.mode === b.mode;

/** Correlation of one window with each of the 24 keys, by key index. */
function windowScores(chroma: ArrayLike<number>): number[] {
  const scores = new Array<number>(24).fill(0);
  for (const candidate of rankKeys(chroma)) scores[keyIndex(candidate.key)] = candidate.score;
  return scores;
}

/** Joins neighbours in the same key. */
export function coalesce(sections: KeySection[]): KeySection[] {
  const out: KeySection[] = [];
  for (const section of sections) {
    const last = out.at(-1);
    if (last && sameKey(last.key, section.key)) last.end = section.end;
    else out.push({ ...section });
  }
  return out;
}

/**
 * Most likely key per window (Viterbi: summed correlation minus a penalty per
 * change), then short detours folded into the stretch before them.
 */
export function keySections(windows: ArrayLike<number>[], windowSeconds: number, duration: number): KeySection[] {
  if (windows.length === 0) return [];
  const scores = windows.map(windowScores);

  let best = scores[0]!.slice();
  const from: number[][] = [];
  for (let w = 1; w < scores.length; w++) {
    const leader = best.indexOf(Math.max(...best));
    const next: number[] = [];
    const back: number[] = [];
    for (let k = 0; k < 24; k++) {
      const stay = best[k]!;
      const change = best[leader]! - CHANGE_PENALTY;
      next.push(Math.max(stay, change) + scores[w]![k]!);
      back.push(stay >= change ? k : leader);
    }
    best = next;
    from.push(back);
  }
  const path = [best.indexOf(Math.max(...best))];
  for (let w = from.length - 1; w >= 0; w--) path.unshift(from[w]![path[0]!]!);

  let sections = coalesce(
    path.map((k, w) => ({ start: w * windowSeconds, end: Math.min(duration, (w + 1) * windowSeconds), key: indexKey(k) })),
  );
  // Fold the shortest detour first, until every stretch is long enough (or only one is left).
  for (;;) {
    const short = sections
      .map((section, i) => ({ i, length: section.end - section.start }))
      .filter(({ length }) => length < MIN_SECTION_SECONDS)
      .sort((a, b) => a.length - b.length)[0];
    if (!short || sections.length === 1) break;
    const { i } = short;
    // Into the previous stretch (the key it detoured from); the opening one goes into the next.
    const target = i > 0 ? i - 1 : 1;
    sections[target] = {
      ...sections[target]!,
      start: Math.min(sections[target]!.start, sections[i]!.start),
      end: Math.max(sections[target]!.end, sections[i]!.end),
    };
    sections.splice(i, 1);
    sections = coalesce(sections);
  }
  return sections;
}

/**
 * The original key — the one the song starts in (live: the first one heard),
 * which `candidates[0]` and `sections[0]` agree on — plus every later key change.
 */
export interface SongKey extends KeyEstimate {
  sections: KeySection[];
}

/**
 * The key analysis once chroma is in windows: sections first, then the
 * original key from the opening section. Shared by the decoded-file and live
 * paths, and testable on chroma from real songs without shipping their audio.
 */
export function songKeyFromWindows(
  windows: ArrayLike<number>[],
  /** Non-silent frames per window. */
  heard: number[],
  windowSeconds: number,
  hopSeconds: number,
  duration: number,
): SongKey | null {
  if (heard.every((n) => n === 0)) return null;
  const sections = keySections(windows, windowSeconds, duration);
  // Candidates from the opening section alone, so the alternatives offered are
  // the usual confusions of the original key, not of the key change.
  const opening = new Float64Array(12);
  let openingFrames = 0;
  windows.forEach((window, w) => {
    if (w * windowSeconds >= sections[0]!.end) return;
    for (let i = 0; i < 12; i++) opening[i] += window[i]!;
    openingFrames += heard[w]!;
  });
  const ranked = rankKeys(opening);
  const seconds = openingFrames * hopSeconds;
  sections[0] = { ...sections[0]!, key: ranked[0]!.key };
  return {
    candidates: ranked.slice(0, 4),
    confidence: confidenceOf(ranked, seconds),
    seconds,
    // The opening's whole-section key can match the next stretch's; join them if so.
    sections: coalesce(sections),
  };
}
