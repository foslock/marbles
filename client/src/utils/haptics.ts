/**
 * Haptic feedback via the Vibration API (mobile only).
 * Silently no-ops on devices that don't support it.
 */

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

export const Haptics = {
  /** Light tap — button press, tile land */
  light() {
    vibrate(10);
  },

  /** Medium tap — dice result, choice made */
  medium() {
    vibrate(25);
  },

  /** Heavy — battle, negative effect */
  heavy() {
    vibrate(50);
  },

  /** Double pulse — your turn */
  doublePulse() {
    vibrate([30, 50, 30]);
  },

  /** Success — marble gained, battle won */
  success() {
    vibrate([15, 40, 15, 40, 30]);
  },

  /** Error — marble lost, negative effect */
  error() {
    vibrate([50, 30, 80]);
  },

  /** Dice rolling — rapid pulses */
  diceRoll() {
    vibrate([10, 20, 10, 20, 10, 20, 10, 20, 10]);
  },
};
