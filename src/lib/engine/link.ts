/**
 * Messages between the main tab (player + controls) and the engine popup
 * (capture + shift + output). They have to be separate tabs: see
 * docs/decisions.md. BroadcastChannel reaches every same-origin tab, so a
 * reloaded main tab finds a still-running engine again.
 */

export type EngineState =
  /** Popup open, waiting for the user to pick the main tab. */
  | "waiting"
  | "running"
  | "error";

export type ToEngine =
  /** Asks the engine to report its status. */
  | { type: "hello" }
  | { type: "setSemitones"; semitones: number }
  | { type: "shutdown" };

export type FromEngine =
  | { type: "status"; state: EngineState; latencyMs: number | null; error: string | null }
  /** Sent when the popup is closing. */
  | { type: "bye" };

const CHANNEL_NAME = "keytube-engine";

export interface Link<Send> {
  post(message: Send): void;
  close(): void;
}

function open<Send, Receive>(onMessage: (message: Receive) => void): Link<Send> {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<Receive>) => onMessage(event.data);
  return {
    post: (message) => channel.postMessage(message),
    close: () => channel.close(),
  };
}

export const openControllerLink = (onMessage: (message: FromEngine) => void) =>
  open<ToEngine, FromEngine>(onMessage);

export const openEngineLink = (onMessage: (message: ToEngine) => void) =>
  open<FromEngine, ToEngine>(onMessage);
