/**
 * Synthesized sound effects using Web Audio API.
 * No external audio files needed — all sounds are generated procedurally.
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  // Resume if suspended (browser autoplay policy or tab losing focus)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Re-activate AudioContext when the tab regains visibility.
// Browsers may suspend (or even close) the context when the page is hidden.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && audioCtx) {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      } else if (audioCtx.state === 'closed') {
        // Context was destroyed — create a fresh one
        audioCtx = null;
      }
    }
  });
  // Also try to resume on any user interaction (belt-and-suspenders)
  const resumeOnInteraction = () => {
    if (audioCtx?.state === 'suspended') audioCtx.resume();
  };
  document.addEventListener('pointerdown', resumeOnInteraction, { passive: true });
  document.addEventListener('keydown', resumeOnInteraction, { passive: true });
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

  /** Subtle step as token passes through a tile during movement. */
  tileStep() {
    playTone(350 + Math.random() * 80, 0.06, 'sine', 0.08);
  },

  /** Rising whoosh as token lifts off the starting tile. */
  tileRise() {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 300;
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.25);
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    // Airy noise layer
    playNoise(0.15, 0.06);
  },

  /** Falling whoosh as token descends onto the destination tile. */
  tileFall() {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 700;
    osc.frequency.exponentialRampToValueAtTime(250, ctx.currentTime + 0.2);
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
    playNoise(0.1, 0.05);
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

  /** Steal effect — sneaky descending swipe + chime */
  stealEffect() {
    playNoise(0.06, 0.1);
    playTone(900, 0.08, 'sawtooth', 0.18);
    setTimeout(() => playTone(700, 0.08, 'sawtooth', 0.15), 60);
    setTimeout(() => playTone(500, 0.1, 'sawtooth', 0.12), 120);
    setTimeout(() => playTone(1100, 0.15, 'sine', 0.2), 220);
  },

  // ── Minigame-specific sounds ──────────────────────────────────────────────

  /** Quick tap click; slight random pitch so rapid taps feel distinct. */
  minigameTap() {
    playTone(700 + Math.random() * 300, 0.05, 'square', 0.13);
  },

  /** Satisfying bubble-pop for TargetPop. */
  minigamePop() {
    playNoise(0.04, 0.08);
    playTone(1100, 0.04, 'sine', 0.18);
    setTimeout(() => playTone(1400, 0.06, 'sine', 0.12), 18);
  },

  /** Block landing thud for TowerBuilder.
   *  quality 0=edge, 1=ok, 2=good, 3=perfect */
  minigameLand(quality: 0 | 1 | 2 | 3) {
    const freq = [130, 160, 200, 260][quality];
    const vol  = [0.18, 0.22, 0.28, 0.35][quality];
    playTone(freq, 0.14, 'triangle', vol);
    if (quality >= 2) {
      // Sweet overtone on good/perfect placements
      setTimeout(() => playTone(freq * 2, 0.1, 'sine', vol * 0.55), 55);
    }
  },

  /** Descending crash for TowerBuilder miss / game over. */
  minigameFall() {
    playNoise(0.08, 0.12);
    playTone(300, 0.1, 'sawtooth', 0.22);
    setTimeout(() => playTone(200, 0.14, 'sawtooth', 0.18), 90);
    setTimeout(() => playTone(120, 0.3,  'sawtooth', 0.14), 200);
  },

  /** Swoosh for SwipeDodge lane change. */
  minigameDodge() {
    const ctx = getCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 900;
    osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.08);
    gain.gain.value = 0.12;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  },

  /** Crunch/impact for SwipeDodge hit. */
  minigameHit() {
    playNoise(0.1, 0.18);
    playTone(160, 0.12, 'sawtooth', 0.2);
  },

  /** Distinct Simon-style tone per tile index for MemoryFlash.
   *  Uses a pentatonic set so any sequence sounds musical. */
  minigameTileFlash(colorIdx: number) {
    // B3, E4, A4, D5
    const freqs = [247, 330, 440, 587];
    playTone(freqs[colorIdx % 4] ?? 440, 0.32, 'sine', 0.3, true);
  },

  /** "GO!" alert tone for ReactionSnap turning green. */
  minigameReactionGo() {
    playTone(880,  0.06, 'square', 0.16);
    setTimeout(() => playTone(1100, 0.1, 'square', 0.2), 45);
  },

  /** Reaction result — pitch encodes speed: fast = high, slow = low. */
  minigameReactionTap(ms: number) {
    const freq = Math.max(300, Math.min(1500, 1500 - ms));
    playTone(freq, 0.15, 'triangle', 0.25);
  },

  /** Soft tick while on-target (BallTracker, TiltChase). */
  minigameOnTarget() {
    playTone(660, 0.06, 'sine', 0.1);
  },

  /** SizeMatch oval matched within threshold. */
  minigameMatchSuccess() {
    playTone(880,  0.07, 'sine', 0.22);
    setTimeout(() => playTone(1100, 0.07, 'sine', 0.18), 60);
    setTimeout(() => playTone(1320, 0.14, 'sine', 0.22), 120);
  },

  /** Soft brush noise for CanvasFill (call throttled externally). */
  minigameBrush() {
    playNoise(0.05, 0.04);
  },

  /** ColorSort correct sort chime. */
  minigameCorrectSort() {
    playTone(660, 0.08, 'triangle', 0.2);
    setTimeout(() => playTone(880, 0.1, 'triangle', 0.18), 60);
  },

  /** Light switch flicked ON — sharp click + warm rising tone. */
  minigameSwitchOn() {
    playNoise(0.018, 0.28);
    playTone(520, 0.1, 'triangle', 0.22);
    setTimeout(() => playTone(660, 0.14, 'sine', 0.18), 45);
  },

  /** Light switch flicked OFF — click + descending tone. */
  minigameSwitchOff() {
    playNoise(0.018, 0.22);
    playTone(400, 0.1, 'triangle', 0.2);
    setTimeout(() => playTone(300, 0.14, 'sine', 0.14), 45);
  },

  /** Floor pump compression — low piston thump + bandpass air rush. */
  minigamePump() {
    playTone(115, 0.1, 'triangle', 0.28);
    const ctx = getCtx();
    const dur = 0.16;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      d[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI) * 0.65;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 1.6;
    const g = ctx.createGain();
    g.gain.value = 0.26;
    src.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
    src.start();
  },
};
