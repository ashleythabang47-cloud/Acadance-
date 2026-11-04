import { useEffect, useState } from "react";

/**
 * Returns true while the given audio stream is carrying speech-level sound.
 * Purely visual: it never touches the stream's tracks, and silently does
 * nothing if Web Audio is unavailable.
 */
export function useSpeaking(stream: MediaStream | null, threshold = 0.035): boolean {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let lastFlip = 0;
    let current = false;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const tick = (t: number) => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const next = rms > threshold;
        // Debounce so the ring doesn't flicker between syllables.
        if (next !== current && t - lastFlip > (next ? 60 : 350)) {
          current = next;
          lastFlip = t;
          setSpeaking(next);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch {
      /* Web Audio unavailable — indicator just stays off */
    }
    return () => {
      cancelAnimationFrame(raf);
      void ctx?.close().catch(() => {});
      setSpeaking(false);
    };
  }, [stream, threshold]);

  return speaking;
}
