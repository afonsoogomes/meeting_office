let chimeCtx: AudioContext | null = null;

function context(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!chimeCtx) chimeCtx = new Ctor();
  return chimeCtx;
}

/** Soft two-note ping when someone starts sharing a screen. */
export function playShareChime(): void {
  const ac = context();
  if (!ac) return;
  void ac.resume().catch(() => undefined);
  const t0 = ac.currentTime + 0.02;
  ping(ac, t0, 523.25, 0.1);
  ping(ac, t0 + 0.11, 783.99, 0.18);
}

function ping(ac: AudioContext, at: number, freq: number, dur: number): void {
  const osc = ac.createOscillator();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  filter.type = 'lowpass';
  filter.frequency.value = 2200;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.06, at + 0.016);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.03);
}
