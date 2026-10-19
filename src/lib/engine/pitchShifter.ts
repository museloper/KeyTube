import type { StretchNode } from "signalsmith-stretch";

/**
 * Real-time pitch shift on any Web Audio source — captured tab (A), decoded
 * file (C) or, later, an extension's <video> element (B). Input adapters only
 * have to produce an AudioNode.
 */
export interface PitchShifter {
  /** Connect the source here. */
  input: AudioNode;
  /** Connect this to the destination (or an analyser). */
  output: AudioNode;
  setSemitones(semitones: number): void;
  /** Seconds of delay the shifter adds, so the UI can be honest about sync. */
  latency(): Promise<number>;
  dispose(): void;
}

export async function createPitchShifter(context: AudioContext): Promise<PitchShifter> {
  // Loaded on demand: the module embeds its WASM and touches AudioWorklet,
  // neither of which exists during the static export's prerender.
  const { default: SignalsmithStretch } = await import("signalsmith-stretch");
  const node: StretchNode = await SignalsmithStretch(context, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  await node.start();

  return {
    input: node,
    output: node,
    setSemitones(semitones) {
      void node.schedule({ semitones, output: context.currentTime });
    },
    latency: () => node.latency(),
    dispose() {
      void node.stop();
      node.disconnect();
    },
  };
}
