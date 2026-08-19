/**
 * Web Audio beeps — the engine's shared audio feedback.
 *
 * One lazily-created AudioContext per page. The context is only constructed on
 * the first play attempt, which must follow a user gesture or the browser will
 * refuse to start it — callers should trigger the first beep from an input
 * handler, exactly as the legacy tools did.
 */

export interface Beeper {
  /** Play a short beep, if sound is enabled and Web Audio is available. */
  play(frequency: number): void;
  /** Create the AudioContext eagerly (call from a user gesture). */
  unlock(): void;
}

export interface BeeperOptions {
  /** Seconds. Matches the legacy tools' 0.08s blip. */
  duration?: number;
  type?: OscillatorType;
  /** Peak gain. Legacy CPS used 0.25, the reaction test 0.3. */
  gain?: number;
  /** Read the live sound preference — kept as a callback so a settings toggle needs no re-wiring. */
  enabled: () => boolean;
}

export function createBeeper(options: BeeperOptions): Beeper {
  const duration = options.duration ?? 0.08;
  const type = options.type ?? 'sine';
  const peak = options.gain ?? 0.25;
  let ctx: AudioContext | null = null;

  const ensureContext = () => {
    if (ctx) return;
    try {
      ctx = new AudioContext();
    } catch {
      // Web Audio unsupported; sound simply stays off.
    }
  };

  return {
    unlock: ensureContext,

    play(frequency) {
      if (!options.enabled()) return;
      ensureContext();
      if (!ctx) return;

      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(peak, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
      } catch {
        // Ignore audio failures — sound is feedback, never load-bearing.
      }
    },
  };
}
