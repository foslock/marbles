import { useEffect, useState } from 'react';
import type { TileEffect } from '../types/game';
import { SFX } from '../utils/sound';
import { Haptics } from '../utils/haptics';

interface Props {
  effect: TileEffect;
  onClose: () => void;
}

const EFFECT_ICONS: Record<string, string> = {
  gain_marble: '🔮',
  gain_points: '✨',
  gain_reroll: '🔄',
  gain_protection: '🛡️',
  gain_double_dice: '🎲',
  lose_marble: '💔',
  lose_points: '📉',
  steal_points: '🏴‍☠️',
  swap_marbles: '🔀',
  give_worst_dice: '⬇️',
  fortune_cookie: '🥠',
  blank: '⚪',
};

export function TileEffectOverlay({ effect, onClose }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (effect.color === 'green') {
      SFX.positiveEffect();
      Haptics.success();
    } else if (effect.color === 'red') {
      SFX.negativeEffect();
      Haptics.error();
    } else {
      SFX.neutralEffect();
      Haptics.light();
    }
    // Trigger entrance animation
    requestAnimationFrame(() => setVisible(true));
  }, [effect.color]);

  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const borderColor =
    effect.color === 'green'
      ? '#27ae60'
      : effect.color === 'red'
      ? '#e74c3c'
      : '#8892b0';

  const glowColor =
    effect.color === 'green'
      ? 'rgba(39, 174, 96, 0.4)'
      : effect.color === 'red'
      ? 'rgba(231, 76, 60, 0.4)'
      : 'rgba(136, 146, 176, 0.3)';

  const icon = EFFECT_ICONS[effect.type] || '⭐';

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        className="animate-bounce-in"
        style={{
          ...styles.card,
          borderColor,
          boxShadow: `0 0 40px ${glowColor}, 0 0 80px ${glowColor}`,
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.5)',
          transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
        }}
      >
        <div style={styles.iconContainer}>
          <span style={styles.icon}>{icon}</span>
        </div>
        {effect.blocked && (
          <div className="animate-shake" style={styles.blocked}>BLOCKED!</div>
        )}
        <p style={styles.message}>{effect.message}</p>
        {effect.autoMarbles ? (
          <p className="animate-pulse" style={styles.bonus}>
            +{effect.autoMarbles} marble(s) from points!
          </p>
        ) : null}
        <span style={styles.tap}>Tap to dismiss</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '20px',
  },
  card: {
    background: '#112240',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '300px',
    width: '100%',
    textAlign: 'center',
    border: '3px solid',
  },
  iconContainer: {
    marginBottom: '12px',
  },
  icon: {
    fontSize: '48px',
    display: 'inline-block',
    animation: 'bounceIn 0.5s ease-out',
  },
  blocked: {
    color: '#3498db',
    fontSize: '24px',
    fontWeight: 800,
    marginBottom: '8px',
    letterSpacing: '2px',
  },
  message: {
    color: '#ccd6f6',
    fontSize: '18px',
    fontWeight: 500,
    lineHeight: 1.4,
    margin: '0 0 8px 0',
  },
  bonus: {
    color: '#f39c12',
    fontSize: '14px',
    fontWeight: 600,
    margin: 0,
  },
  tap: {
    color: '#5a6a8a',
    fontSize: '11px',
    marginTop: '12px',
    display: 'block',
  },
};
