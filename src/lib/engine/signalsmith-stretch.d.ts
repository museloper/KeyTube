/** The package ships no types; this covers the surface the engine uses. */
declare module "signalsmith-stretch" {
  export interface StretchSchedule {
    output?: number;
    active?: boolean;
    rate?: number;
    semitones?: number;
    tonalityHz?: number;
    formantSemitones?: number;
    formantCompensation?: boolean;
    formantBaseHz?: number;
  }

  export interface StretchNode extends AudioWorkletNode {
    schedule(changes: StretchSchedule): Promise<void>;
    start(when?: number): Promise<void>;
    stop(when?: number): Promise<void>;
    /** Seconds of delay added when processing live input. */
    latency(): Promise<number>;
  }

  export default function SignalsmithStretch(
    context: BaseAudioContext,
    options?: AudioWorkletNodeOptions,
  ): Promise<StretchNode>;
}
