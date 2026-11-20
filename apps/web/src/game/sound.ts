/**
 * 走子音效：不依赖音频文件，用 Web Audio 合成一声木质「啪」。
 * 浏览器要求先有用户手势，所以由 App 在首次 pointerdown 时调 primeAudio() 解锁。
 */
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 首次用户手势时调用，提前把 AudioContext 建好并恢复。 */
export function primeAudio(): void {
  getContext();
}

function clack(at: number, freq: number, gain: number, dur: number): void {
  const ac = getContext();
  if (!ac) return;
  const t0 = ac.currentTime + at;

  // 棋子本体：短促下滑的正弦音
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t0 + dur);
  const oscGain = ac.createGain();
  oscGain.gain.setValueAtTime(0.0001, t0);
  oscGain.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(oscGain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);

  // 敲击质感：一小段衰减的带通噪声
  const len = Math.floor(ac.sampleRate * 0.04);
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1700;
  band.Q.value = 1.1;
  const noiseGain = ac.createGain();
  noiseGain.gain.value = gain * 0.5;
  noise.connect(band).connect(noiseGain).connect(ac.destination);
  noise.start(t0);
}

/** 将军提示音：两声上行短铃。 */
function chime(): void {
  const ac = getContext();
  if (!ac) return;
  const start = ac.currentTime + 0.13;
  [988, 1319].forEach((freq, i) => {
    const t = start + i * 0.11;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  });
}

/** 落子音效：普通落子、吃子更沉，将军再叠一声铃声。 */
export function playMoveSound(opts: { capture?: boolean; check?: boolean } = {}): void {
  if (opts.capture) {
    clack(0, 190, 0.4, 0.19);
    clack(0.05, 150, 0.22, 0.16);
  } else {
    clack(0, 320, 0.32, 0.11);
  }
  if (opts.check) chime();
}
