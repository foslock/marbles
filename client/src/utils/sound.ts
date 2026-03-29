/**
 * Synthesized sound effects using Web Audio API.
 * No external audio files needed — all sounds are generated procedurally.
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.3,
  rampDown = true,
) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  if (rampDown) {
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  }
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playNoise(duration: number, volume = 0.15) {
  const ctx = getCtx();
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

export const SFX = {
  /** Dice rolling — rattling clicks */
  diceRoll() {
    const ctx = getCtx();
    for (let i = 0; i < 6; i++) {
      const delay = i * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 200 + Math.random() * 400;
      gain.gain.value = 0.08;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.05);
    }
  },

  /** Dice result landing */
  diceResult() {
    playTone(600, 0.15, 'triangle', 0.25);
    setTimeout(() => playTone(900, 0.2, 'triangle', 0.2), 80);
  },

  /** Player lands on tile */
  tileLand() {
    playTone(440, 0.12, 'sine', 0.2);
    setTimeout(() => playTone(550, 0.1, 'sine', 0.15), 60);
  },

  /** Positive tile effect (green) */
  positiveEffect() {
    playTone(523, 0.15, 'sine', 0.25);
    setTimeout(() => playTone(659, 0.15, 'sine', 0.25), 100);
    setTimeout(() => playTone(784, 0.2, 'sine', 0.2), 200);
  },

  /** Negative tile effect (red) */
  negativeEffect() {
    playTone(400, 0.2, 'sawtooth', 0.15);
    setTimeout(() => playTone(300, 0.3, 'sawtooth', 0.12), 150);
  },

  /** Neutral tile / fortune cookie */
  neutralEffect() {
    playTone(500, 0.15, 'triangle', 0.2);
    setTimeout(() => playTone(550, 0.15, 'triangle', 0.15), 120);
  },

  /** Battle start */
  battleStart() {
    playTone(200, 0.1, 'sawtooth', 0.2);
    setTimeout(() => playTone(300, 0.1, 'sawtooth', 0.2), 100);
    setTimeout(() => playTone(400, 0.15, 'sawtooth', 0.25), 200);
  },

  /** Battle win */
  battleWin() {
    playTone(523, 0.1, 'square', 0.15);
    setTimeout(() => playTone(659, 0.1, 'square', 0.15), 80);
    setTimeout(() => playTone(784, 0.1, 'square', 0.15), 160);
    setTimeout(() => playTone(1047, 0.25, 'square', 0.2), 240);
  },

  /** Battle lose */
  battleLose() {
    playTone(400, 0.15, 'sawtooth', 0.15);
    setTimeout(() => playTone(350, 0.15, 'sawtooth', 0.12), 120);
    setTimeout(() => playTone(250, 0.3, 'sawtooth', 0.1), 240);
  },

  /** Countdown tick (3, 2, 1) */
  countdownTick() {
    playTone(800, 0.1, 'square', 0.15);
  },

  /** Countdown GO! */
  countdownGo() {
    playTone(1000, 0.08, 'square', 0.2);
    setTimeout(() => playTone(1200, 0.15, 'square', 0.25), 60);
  },

  /** Minigame score point */
  minigamePoint() {
    playTone(700 + Math.random() * 200, 0.08, 'sine', 0.15);
  },

  /** Minigame complete */
  minigameComplete() {
    playTone(523, 0.1, 'triangle', 0.2);
    setTimeout(() => playTone(784, 0.1, 'triangle', 0.2), 100);
    setTimeout(() => playTone(1047, 0.2, 'triangle', 0.25), 200);
  },

  /** Your turn notification */
  yourTurn() {
    playTone(660, 0.12, 'sine', 0.25);
    setTimeout(() => playTone(880, 0.15, 'sine', 0.2), 120);
    setTimeout(() => playTone(660, 0.1, 'sine', 0.15), 260);
  },

  /** Game over fanfare */
  gameOver() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.25, 'triangle', 0.2), i * 150);
    });
    setTimeout(() => {
      playTone(1047, 0.5, 'sine', 0.3, true);
      playTone(784, 0.5, 'sine', 0.15, true);
    }, 600);
  },

  /** Button click */
  click() {
    playTone(1000, 0.04, 'square', 0.1);
  },

  /** Error buzz */
  error() {
    playNoise(0.15, 0.1);
    playTone(200, 0.15, 'sawtooth', 0.1);
  },

  /** Marble gained */
  marbleGain() {
    playTone(880, 0.1, 'sine', 0.25);
    setTimeout(() => playTone(1100, 0.15, 'sine', 0.2), 80);
    setTimeout(() => playTone(1320, 0.2, 'sine', 0.25), 160);
  },

  /** Marble lost */
  marbleLost() {
    playTone(600, 0.12, 'sine', 0.2);
    setTimeout(() => playTone(400, 0.15, 'sine', 0.2), 100);
    setTimeout(() => playTone(300, 0.25, 'sine', 0.15), 200);
  },
};
