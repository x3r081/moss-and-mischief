/** Original, synthesized ambience. No recordings, downloads, or network calls. */
export class IslandAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private note = 0;
  private enabled = true;
  start() {
    if (!this.context) {
      try {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.enabled ? 0.22 : 0;
        this.master.connect(this.context.destination);
        this.timer = setInterval(() => this.ambient(), 900);
      } catch {
        return;
      }
    }
    if (this.context.state === 'suspended')
      void this.context.resume().catch(() => {});
  }
  setEnabled(v: boolean) {
    this.enabled = v;
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(
        v ? 0.22 : 0,
        this.context.currentTime,
        0.2,
      );
  }
  private tone(
    freq: number,
    time: number,
    length: number,
    volume: number,
    type: OscillatorType = 'sine',
  ) {
    const c = this.context,
      m = this.master;
    if (!c || !m || c.state !== 'running') return;
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(volume, time + 0.035);
    g.gain.exponentialRampToValueAtTime(0.001, time + length);
    o.connect(g);
    g.connect(m);
    o.start(time);
    o.stop(time + length + 0.05);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  private ambient() {
    if (!this.enabled || !this.context || document.hidden) return;
    const melody = [
      196, 0, 246.94, 293.66, 0, 329.63, 293.66, 0, 220, 0, 261.63, 329.63, 0,
      293.66, 246.94, 0,
    ];
    const t = this.context.currentTime,
      step = this.note++ % melody.length;
    if (melody[step]) {
      this.tone(melody[step], t, 2.4, 0.12);
      this.tone(melody[step] * 2, t + 0.03, 1.1, 0.045, 'triangle');
    }
    if (step % 4 === 0) this.tone(step < 8 ? 98 : 110, t, 4.8, 0.09);
    if (step === 6 || step === 14) {
      this.tone(1800, t + 0.3, 0.12, 0.018);
      this.tone(2400, t + 0.46, 0.16, 0.014);
    }
  }
  effect(kind: 'gather' | 'build' | 'farm' | 'honk' | 'win' | 'craft') {
    if (!this.enabled || !this.context) return;
    const t = this.context.currentTime;
    if (kind === 'honk') {
      this.tone(220, t, 0.18, 0.24, 'sawtooth');
      this.tone(196, t + 0.15, 0.23, 0.18, 'triangle');
    } else if (kind === 'win') {
      [261.63, 329.63, 392, 523.25].forEach((f, i) =>
        this.tone(f, t + i * 0.17, 2, 0.3),
      );
    } else if (kind === 'build') {
      [130.8, 196, 261.63].forEach((f, i) =>
        this.tone(f, t + i * 0.09, 0.3, 0.3, 'triangle'),
      );
    } else {
      this.tone(kind === 'farm' ? 660 : 420, t, 0.18, 0.2, 'triangle');
      this.tone(kind === 'farm' ? 880 : 560, t + 0.1, 0.28, 0.13);
    }
  }
  dispose() {
    if (this.timer) clearInterval(this.timer);
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
