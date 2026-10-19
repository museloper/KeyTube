"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isCaptureSupported } from "@/lib/engine/capture";
import type { KeyEstimate } from "@/lib/engine/keyDetect";
import { openControllerLink, type Link, type ToEngine } from "@/lib/engine/link";
import { ENGINE_PAGE_URL } from "@/lib/paths";

export type EngineStatus = "off" | "waiting" | "running" | "error";

export interface UseEngineResult {
  status: EngineStatus;
  latencyMs: number | null;
  error: string | null;
  /** The engine's running guess at the original key; null until it has heard something. */
  keyEstimate: KeyEstimate | null;
  /** A different song started: make the engine forget what it has heard. */
  resetKey: () => void;
  /** False on mobile and non-Chromium browsers: tab audio capture isn't available. */
  supported: boolean;
  open: () => void;
  close: () => void;
}

/** Shown in Chrome's share picker while the engine waits, so the right tab is easy to spot. */
const PICK_ME_TITLE = "KeyTube ← 이 탭을 선택";
const POPUP_NAME = "keytube-engine";

/**
 * Drives the engine popup from the main tab. `semitones` is the source of
 * truth here; the engine is told whenever it changes or (re)connects.
 */
export function useEngine(semitones: number): UseEngineResult {
  const linkRef = useRef<Link<ToEngine> | null>(null);
  const popupRef = useRef<Window | null>(null);
  const semitonesRef = useRef(semitones);

  const [status, setStatus] = useState<EngineStatus>("off");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyEstimate, setKeyEstimate] = useState<KeyEstimate | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    // Read after mount: the page is statically exported, so the server render can't know.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(isCaptureSupported());

    let wasRunning = false;
    const link = openControllerLink((message) => {
      if (message.type === "key") {
        setKeyEstimate(message.estimate);
        return;
      }
      if (message.type === "bye") {
        wasRunning = false;
        setStatus("off");
        setLatencyMs(null);
        setKeyEstimate(null);
        return;
      }
      setStatus(message.state);
      setLatencyMs(message.latencyMs);
      setError(message.error);
      if (message.state === "running" && !wasRunning) {
        link.post({ type: "setSemitones", semitones: semitonesRef.current });
      }
      wasRunning = message.state === "running";
    });
    linkRef.current = link;
    // Finds an engine that outlived a reload of this tab.
    link.post({ type: "hello" });
    return () => {
      link.close();
      linkRef.current = null;
    };
  }, []);

  useEffect(() => {
    semitonesRef.current = semitones;
    linkRef.current?.post({ type: "setSemitones", semitones });
  }, [semitones]);

  // A popup closed before it could say "bye" (crash, or killed mid-load).
  useEffect(() => {
    if (status === "off") return;
    const timer = setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null;
        setStatus("off");
        setLatencyMs(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status !== "waiting") return;
    const previous = document.title;
    document.title = PICK_ME_TITLE;
    return () => {
      document.title = previous;
    };
  }, [status]);

  const open = useCallback(() => {
    // A normal tab, not a sized popup window: Chrome's share picker opened
    // from a popup window lists no tabs at all. The name reuses an existing
    // engine tab instead of stacking new ones.
    const popup = window.open(ENGINE_PAGE_URL, POPUP_NAME);
    if (!popup) {
      setStatus("error");
      setError("팝업이 차단됐어요. 주소창의 팝업 차단 아이콘에서 허용해 주세요.");
      return;
    }
    popupRef.current = popup;
    popup.focus();
    setError(null);
    setStatus("waiting");
  }, []);

  const resetKey = useCallback(() => {
    setKeyEstimate(null);
    linkRef.current?.post({ type: "resetKey" });
  }, []);

  const close = useCallback(() => {
    linkRef.current?.post({ type: "shutdown" });
    popupRef.current?.close();
    popupRef.current = null;
    setStatus("off");
    setLatencyMs(null);
    setKeyEstimate(null);
  }, []);

  return { status, latencyMs, error, keyEstimate, resetKey, supported, open, close };
}
