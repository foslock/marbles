import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock AudioContext before importing SFX, since the module
// captures it lazily on first use. Using a class mock so `new AudioContext()` works.
function createMockAudioContext() {
  return {
    currentTime: 0,
    state: 'running' as string,
    sampleRate: 44100,
    destination: {},
    resume: vi.fn(),
    createOscillator: vi.fn(() => ({
      type: 'sine',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: { value: 0, exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => ({
      type: 'highpass',
      frequency: { value: 0 },
      connect: vi.fn(),
    })),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
    })),
    createBuffer: vi.fn(() => ({
      getChannelData: vi.fn(() => new Float32Array(100)),
    })),
  };
}

let mockCtx: ReturnType<typeof createMockAudioContext>;

// Stub AudioContext globally as a constructor class
beforeEach(() => {
  mockCtx = createMockAudioContext();
  vi.stubGlobal(
    'AudioContext',
    class {
      currentTime = mockCtx.currentTime;
      state = mockCtx.state;
      sampleRate = mockCtx.sampleRate;
      destination = mockCtx.destination;
      resume = mockCtx.resume;
      createOscillator = mockCtx.createOscillator;
      createGain = mockCtx.createGain;
      createBiquadFilter = mockCtx.createBiquadFilter;
      createBufferSource = mockCtx.createBufferSource;
      createBuffer = mockCtx.createBuffer;
    },
  );
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Dynamic import to get a fresh module per test file
// (the module caches audioCtx, so we re-import)
async function getSFX() {
  // Clear module cache to reset the audioCtx singleton
  vi.resetModules();
  const mod = await import('./sound');
  return mod.SFX;
}

describe('SFX', () => {
  it('diceRoll() creates oscillators', async () => {
    const SFX = await getSFX();
    SFX.diceRoll();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    expect(mockCtx.createGain).toHaveBeenCalled();
  });

  it('diceResult() does not throw', async () => {
    const SFX = await getSFX();
    expect(() => SFX.diceResult()).not.toThrow();
  });

  it('tileLand() does not throw', async () => {
    const SFX = await getSFX();
    expect(() => SFX.tileLand()).not.toThrow();
  });

  it('positiveEffect() does not throw', async () => {
    const SFX = await getSFX();
    expect(() => SFX.positiveEffect()).not.toThrow();
  });

  it('negativeEffect() does not throw', async () => {
    const SFX = await getSFX();
    expect(() => SFX.negativeEffect()).not.toThrow();
  });

  it('neutralEffect() does not throw', async () => {
    const SFX = await getSFX();
    expect(() => SFX.neutralEffect()).not.toThrow();
  });

  it('battleStart() does not throw', async () => {
    const SFX = await getSFX();
    expect(() => SFX.battleStart()).not.toThrow();
  });

  it('countdownTick() does not throw', async () => {
    const SFX = await getSFX();
    expect(() => SFX.countdownTick()).not.toThrow();
  });

  it('yourTurn() does not throw', async () => {
    const SFX = await getSFX();
    expect(() => SFX.yourTurn()).not.toThrow();
  });

  it('gameOver() does not throw', async () => {
    const SFX = await getSFX();
    expect(() => SFX.gameOver()).not.toThrow();
  });

  it('click() does not throw', async () => {
    const SFX = await getSFX();
    expect(() => SFX.click()).not.toThrow();
  });

  it('error() creates noise and tone', async () => {
    const SFX = await getSFX();
    expect(() => SFX.error()).not.toThrow();
    expect(mockCtx.createBufferSource).toHaveBeenCalled();
  });

  it('marbleGain() does not throw', async () => {
    const SFX = await getSFX();
    expect(() => SFX.marbleGain()).not.toThrow();
  });

  it('marbleLost() does not throw', async () => {
    const SFX = await getSFX();
    expect(() => SFX.marbleLost()).not.toThrow();
  });

  it('all SFX methods are functions', async () => {
    const SFX = await getSFX();
    const methods = [
      'diceRoll', 'diceResult', 'tileLand', 'positiveEffect', 'negativeEffect',
      'neutralEffect', 'battleStart', 'battleWin', 'battleLose', 'countdownTick',
      'countdownGo', 'minigamePoint', 'minigameComplete', 'yourTurn', 'gameOver',
      'click', 'error', 'marbleGain', 'marbleLost',
    ];
    for (const method of methods) {
      expect(typeof SFX[method as keyof typeof SFX]).toBe('function');
    }
  });
});
