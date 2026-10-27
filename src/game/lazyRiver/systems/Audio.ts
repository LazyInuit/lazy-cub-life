type Tone = OscillatorType;

export class AudioBus {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  unlock(): void {
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) this.ctx = new Ctx();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  tap(): void {
    this.tone(520, 0.045, 'square', 0.035);
  }

  collect(): void {
    this.tone(680, 0.11, 'triangle', 0.11, 320);
  }

  near(): void {
    this.tone(540, 0.08, 'sine', 0.05, 90);
  }

  /** Forward pad: a quick rising swoosh. */
  boost(): void {
    this.tone(320, 0.32, 'triangle', 0.09, 620);
    this.tone(480, 0.22, 'sine', 0.05, 520);
  }

  /** Backward pad: a sliding drop. */
  washBack(): void {
    this.tone(520, 0.34, 'triangle', 0.09, -380);
    this.tone(260, 0.3, 'sine', 0.05, -150);
  }

  /** Rapids: a rushing churn with a wobbling low note. */
  rapids(): void {
    if (this.ctx) {
      this.ensureNoise();
      if (this.noise) {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1400, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.26);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.22, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        src.start();
        src.stop(ctx.currentTime + 0.3);
      }
    }
    this.tone(210, 0.3, 'triangle', 0.06, -70);
    this.tone(260, 0.22, 'sine', 0.04, 60);
  }

  /** Whirlpool: a note that swirls down and back up. */
  whirl(): void {
    this.tone(620, 0.32, 'sine', 0.07, -380);
    this.tone(240, 0.5, 'triangle', 0.05, 260);
  }

  crash(): void {
    if (!this.ctx) return;
    this.ensureNoise();
    if (!this.noise) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.22);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + 0.3);
    this.tone(140, 0.18, 'sawtooth', 0.05, -80);
  }

  private tone(freq: number, dur: number, type: Tone, volume: number, slide = 0): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide !== 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(48, freq + slide), t + dur);
    }
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private ensureNoise(): void {
    if (!this.ctx || this.noise) return;
    const length = Math.floor(this.ctx.sampleRate * 0.28);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      const fade = 1 - i / length;
      data[i] = (Math.random() * 2 - 1) * fade;
    }
    this.noise = buffer;
  }
}

export const audio = new AudioBus();

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
