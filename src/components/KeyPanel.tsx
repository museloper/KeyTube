"use client";

import { useState } from "react";
import type { Confidence } from "@/lib/engine/keyDetect";
import type { SongKey } from "@/lib/engine/keySections";
import { formatSemitones, keyLabel, parseKey, pitchClass, relativeKey, transposeKey, type Key } from "@/lib/engine/theory";

export const MAX_SHIFT = 12;

const CONFIDENCE_LABEL: Record<Confidence, string> = { low: "낮음", medium: "보통", high: "높음" };

interface KeyPanelProps {
  /** From the engine; null when nothing has been heard (or the engine is off). */
  estimate: SongKey | null;
  /** Whether there is an engine listening at all, to explain an empty estimate. */
  listening: boolean;
  /** Set by the user; overrides the estimate. */
  manualKey: Key | null;
  onManualKeyChange: (key: Key | null) => void;
  semitones: number;
  onSemitonesChange: (semitones: number) => void;
  disabled?: boolean;
}

const sameKey = (a: Key, b: Key) => a.tonic === b.tonic && a.mode === b.mode;

/** Interval from one tonic to another as the nearer way round: −5…+6. */
const interval = (from: Key, to: Key) => {
  const up = pitchClass(to.tonic - from.tonic);
  return up > 6 ? up - 12 : up;
};

function KeyName({ value, caption }: { value: Key | null; caption: string }) {
  const label = value ? keyLabel(value) : null;
  const relative = value ? keyLabel(relativeKey(value)) : null;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center">
      <span className="text-xs text-neutral-500">{caption}</span>
      <span className="text-2xl font-bold tracking-tight">{label?.name ?? "?"}</span>
      <span className="text-xs text-neutral-400">
        {label ? `${label.korean} · 관계조 ${relative!.name}` : "키 미확인"}
      </span>
    </div>
  );
}

const chipClass =
  "rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-200 transition hover:bg-neutral-700";

export function KeyPanel({
  estimate,
  listening,
  manualKey,
  onManualKeyChange,
  semitones,
  onSemitonesChange,
  disabled,
}: KeyPanelProps) {
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  const detected = estimate?.candidates[0]?.key ?? null;
  const originalKey = manualKey ?? detected;
  // Later sections are key changes heard since; a manually corrected original key moves them by the same amount.
  const changes = (estimate?.sections ?? []).slice(1).map((section) =>
    originalKey && detected ? transposeKey({ ...originalKey, mode: section.key.mode }, interval(detected, section.key)) : section.key,
  );
  // Live, the last section is what's playing now.
  const playingKey = changes.at(-1) ?? originalKey;
  const shifted = playingKey ? transposeKey(playingKey, semitones) : null;
  const alternatives = (estimate?.candidates ?? [])
    .map((candidate) => candidate.key)
    .filter((key) => !originalKey || !sameKey(key, originalKey))
    .slice(0, 3);

  const caption = manualKey
    ? "원키 · 직접 지정"
    : estimate
      ? `원키 · 자동 판별 (신뢰도 ${CONFIDENCE_LABEL[estimate.confidence]})`
      : "원키";

  const step = (delta: number) =>
    onSemitonesChange(Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, semitones + delta)));

  const submitKey = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseKey(draft);
    setInvalid(!parsed);
    if (parsed) {
      onManualKeyChange(parsed);
      setDraft("");
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-neutral-900 p-4">
      <div className="flex items-center gap-2">
        <KeyName value={originalKey} caption={caption} />
        <span className="text-neutral-600">→</span>
        <KeyName
          value={shifted}
          caption={`현재 (${formatSemitones(semitones)})${changes.length > 0 ? " · 전조 구간" : ""}`}
        />
      </div>

      {changes.length > 0 && originalKey && (
        <ul className="flex flex-col gap-1 rounded-lg bg-neutral-950 px-3 py-2 text-xs">
          {changes.map((key, i) => {
            const now = i === changes.length - 1;
            return (
              <li key={i} className={`flex justify-between gap-2 ${now ? "text-violet-300" : "text-neutral-400"}`}>
                <span>
                  전조 감지 · {keyLabel(key).name} ({formatSemitones(interval(originalKey, key))})
                </span>
                <span className="font-mono">
                  {semitones !== 0 && `→ ${keyLabel(transposeKey(key, semitones)).name}`}
                  {now && " ◀ 지금"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-center text-xs text-neutral-500">
        {manualKey
          ? null
          : estimate
            ? `처음 들은 ${Math.round(estimate.seconds)}초로 분석 · 처음부터 들을수록 정확해요`
            : listening
              ? "원키 분석 중 — 음악을 재생하세요"
              : "키 조절을 켜면 원키를 자동으로 찾아요"}
      </p>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={disabled || semitones <= -MAX_SHIFT}
          className="h-12 w-16 rounded-lg bg-neutral-800 text-lg font-semibold transition hover:bg-neutral-700 disabled:opacity-40"
          aria-label="반음 내리기"
        >
          −1
        </button>
        <button
          type="button"
          onClick={() => onSemitonesChange(0)}
          disabled={disabled || semitones === 0}
          className="h-12 rounded-lg bg-neutral-800 px-4 text-sm transition hover:bg-neutral-700 disabled:opacity-40"
        >
          원키로
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={disabled || semitones >= MAX_SHIFT}
          className="h-12 w-16 rounded-lg bg-neutral-800 text-lg font-semibold transition hover:bg-neutral-700 disabled:opacity-40"
          aria-label="반음 올리기"
        >
          +1
        </button>
      </div>

      {(alternatives.length > 0 || manualKey) && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {alternatives.length > 0 && <span className="text-xs text-neutral-500">다른 후보</span>}
          {alternatives.map((key) => (
            <button
              key={`${key.tonic}-${key.mode}`}
              type="button"
              onClick={() => onManualKeyChange(key)}
              className={chipClass}
            >
              {keyLabel(key).name}
            </button>
          ))}
          {manualKey && (
            <button type="button" onClick={() => onManualKeyChange(null)} className={chipClass}>
              자동 판별로 되돌리기
            </button>
          )}
        </div>
      )}

      <form onSubmit={submitKey} className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setInvalid(false);
            }}
            placeholder="원키 직접 입력 (예: Bb, F#m, C minor)"
            aria-invalid={invalid}
            className="min-w-0 flex-1 rounded-lg bg-neutral-950 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 placeholder:text-neutral-500 focus:ring-violet-500 aria-[invalid=true]:ring-red-500"
          />
          <button type="submit" className="rounded-lg bg-neutral-800 px-3 py-2 text-sm transition hover:bg-neutral-700">
            적용
          </button>
        </div>
        {invalid && <p className="text-xs text-red-400">키를 인식하지 못했습니다. 예: C, Am, Bb, F#m</p>}
      </form>
    </div>
  );
}
