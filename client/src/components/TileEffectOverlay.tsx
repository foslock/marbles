import { useEffect } from 'react';
import type { TileEffect } from '../types/game';

interface Props {
  effect: TileEffect;
  onClose: () => void;
}

export function TileEffectOverlay({ effect, onClose }: Props) {
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

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={{
          ...styles.card,
          borderColor,
        }}
      >
        {effect.blocked && (
          <div style={styles.blocked}>BLOCKED!</div>
        )}
        <p style={styles.message}>{effect.message}</p>
        {effect.autoMarbles && (
          <p style={styles.bonus}>+{effect.autoMarbles} marble(s) from points!</p>
        )}
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
  blocked: {
    color: '#3498db',
    fontSize: '24px',
    fontWeight: 800,
    marginBottom: '8px',
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
