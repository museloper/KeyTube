"use client";

import { useState } from "react";
import { formatSemitones, keyLabel, parseKey, relativeKey, transposeKey, type Key } from "@/lib/engine/theory";

export const MAX_SHIFT = 12;

interface KeyPanelProps {
  originalKey: Key | null;
  onOriginalKeyChange: (key: Key | null) => void;
  semitones: number;
  onSemitonesChange: (semitones: number) => void;
  disabled?: boolean;
}

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

export function KeyPanel({ originalKey, onOriginalKeyChange, semitones, onSemitonesChange, disabled }: KeyPanelProps) {
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const shifted = originalKey ? transposeKey(originalKey, semitones) : null;

  const step = (delta: number) =>
    onSemitonesChange(Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, semitones + delta)));

  const submitKey = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) {
      onOriginalKeyChange(null);
      setInvalid(false);
      return;
    }
    const parsed = parseKey(draft);
    setInvalid(!parsed);
    if (parsed) onOriginalKeyChange(parsed);
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-neutral-900 p-4">
      <div className="flex items-center gap-2">
        <KeyName value={originalKey} caption="원키" />
        <span className="text-neutral-600">→</span>
        <KeyName value={shifted} caption={`현재 (${formatSemitones(semitones)})`} />
      </div>

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
