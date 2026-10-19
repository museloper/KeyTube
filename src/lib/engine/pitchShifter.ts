import type { default as SignalsmithStretchFactory, StretchNode } from "signalsmith-stretch";

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

/**
 * @param moduleUrl Where the untouched `SignalsmithStretch.mjs` is served.
 *   It must not go through a bundler: the library stringifies its own code
 *   into an AudioWorklet, and bundler rewrites break it there (see
 *   docs/decisions.md). The host decides the URL — the web app serves it from
 *   public/, an extension would use its own packaged path.
 */
export async function createPitchShifter(context: AudioContext, moduleUrl: string): Promise<PitchShifter> {
  const { default: SignalsmithStretch } = (await import(/* webpackIgnore: true */ moduleUrl)) as {
    default: typeof SignalsmithStretchFactory;
  };
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
      // No `output` time: the worklet compares against its own clock but
      // stores whatever is passed, so leaving it out keeps the two consistent.
      void node.schedule({ semitones });
    },
    latency: () => node.latency(),
    dispose() {
      void node.stop();
      node.disconnect();
    },
  };
}
