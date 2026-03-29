import { useEffect, useState } from 'react';
import type { BattleResult } from '../types/game';

interface Props {
  result: BattleResult;
  onClose: () => void;
}

export function BattleOverlay({ result, onClose }: Props) {
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    // Delay showing the result for dramatic effect
    const timer = setTimeout(() => setShowResult(true), 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div className="animate-bounce-in" style={styles.card}>
        <h3 className="animate-shake" style={styles.title}>BATTLE!</h3>
        <div style={styles.versus}>
          <div style={styles.fighter}>
            <span className="animate-bounce-in" style={styles.dieResult}>{result.playerRoll}</span>
          </div>
          <span className="animate-pulse" style={styles.vs}>VS</span>
          <div style={styles.fighter}>
            <span className="animate-bounce-in" style={styles.dieResult}>{result.opponentRoll}</span>
          </div>
        </div>
        {showResult && (
          <div className="animate-slide-up">
            <p style={styles.winner}>{result.winnerName} wins!</p>
            <p style={styles.prize}>
              Stole {result.actualPrize} points (prize die: {result.prizeRoll})
            </p>
          </div>
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
    background: 'rgba(0,0,0,0.7)',
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
    maxWidth: '320px',
    width: '100%',
    textAlign: 'center',
    border: '3px solid #e74c3c',
    boxShadow: '0 0 40px rgba(231, 76, 60, 0.4), 0 0 80px rgba(231, 76, 60, 0.2)',
  },
  title: {
    color: '#e74c3c',
    fontSize: '28px',
    fontWeight: 800,
    margin: '0 0 16px 0',
    letterSpacing: '4px',
  },
  versus: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    marginBottom: '16px',
  },
  fighter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  dieResult: {
    fontSize: '48px',
    fontWeight: 800,
    color: '#f39c12',
  },
  vs: {
    color: '#e74c3c',
    fontSize: '20px',
    fontWeight: 700,
  },
  winner: {
    color: '#2ecc71',
    fontSize: '20px',
    fontWeight: 700,
    margin: '0 0 8px 0',
  },
  prize: {
    color: '#a8b2d1',
    fontSize: '14px',
    margin: 0,
  },
  tap: {
    color: '#5a6a8a',
    fontSize: '11px',
    marginTop: '12px',
    display: 'block',
  },
};
