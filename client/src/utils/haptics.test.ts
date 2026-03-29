import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Haptics } from './haptics';

describe('Haptics', () => {
  let vibrateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vibrateSpy = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateSpy,
      writable: true,
      configurable: true,
    });
  });

  it('light() calls vibrate with 10', () => {
    Haptics.light();
    expect(vibrateSpy).toHaveBeenCalledWith(10);
  });

  it('medium() calls vibrate with 25', () => {
    Haptics.medium();
    expect(vibrateSpy).toHaveBeenCalledWith(25);
  });

  it('heavy() calls vibrate with 50', () => {
    Haptics.heavy();
    expect(vibrateSpy).toHaveBeenCalledWith(50);
  });

  it('doublePulse() calls vibrate with pattern', () => {
    Haptics.doublePulse();
    expect(vibrateSpy).toHaveBeenCalledWith([30, 50, 30]);
  });

  it('success() calls vibrate with pattern', () => {
    Haptics.success();
    expect(vibrateSpy).toHaveBeenCalledWith([15, 40, 15, 40, 30]);
  });

  it('error() calls vibrate with pattern', () => {
    Haptics.error();
    expect(vibrateSpy).toHaveBeenCalledWith([50, 30, 80]);
  });

  it('diceRoll() calls vibrate with pattern', () => {
    Haptics.diceRoll();
    expect(vibrateSpy).toHaveBeenCalledWith([10, 20, 10, 20, 10, 20, 10, 20, 10]);
  });

  it('does not throw if vibrate is not supported', () => {
    Object.defineProperty(navigator, 'vibrate', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(() => Haptics.light()).not.toThrow();
    expect(() => Haptics.heavy()).not.toThrow();
  });
});
