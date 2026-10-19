"use client";

import { useState } from "react";
import { parseYouTubeUrl, type ParsedVideo } from "@/lib/youtube/parseUrl";

interface UrlInputProps {
  onSubmit: (parsed: ParsedVideo) => void;
}

export function UrlInput({ onSubmit }: UrlInputProps) {
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseYouTubeUrl(value);
    if (!parsed) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSubmit(parsed);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setInvalid(false);
          }}
          inputMode="url"
          placeholder="YouTube 영상 링크 붙여넣기"
          aria-invalid={invalid}
          className="min-w-0 flex-1 rounded-lg bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none ring-1 ring-neutral-700 placeholder:text-neutral-500 focus:ring-violet-500 aria-[invalid=true]:ring-red-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-violet-400"
        >
          불러오기
        </button>
      </div>
      {invalid && <p className="text-xs text-red-400">YouTube 링크를 인식하지 못했습니다.</p>}
    </form>
  );
}
