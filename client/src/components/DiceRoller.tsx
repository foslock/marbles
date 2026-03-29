import { useState, useEffect } from 'react';
import { SFX } from '../utils/sound';
import { Haptics } from '../utils/haptics';

interface Props {
  onRoll: (useReroll?: boolean) => void;
  hasRerolls: boolean;
  hasDoubleDice: boolean;
  hasWorstDice: boolean;
  rolledValue?: number | null;
}

export function DiceRoller({ onRoll, hasRerolls, hasDoubleDice, hasWorstDice, rolledValue }: Props) {
  const [rolling, setRolling] = useState(false);
  const [displayFace, setDisplayFace] = useState(1);
  const [settled, setSettled] = useState(false);

  // When the actual server roll arrives, snap the die face to the real result
  useEffect(() => {
    if (rolledValue != null && rolledValue >= 1 && rolledValue <= 6) {
      setDisplayFace(rolledValue);
      setSettled(true);
    } else {
      setSettled(false);
    }
  }, [rolledValue]);

  const handleRoll = (useReroll = false) => {
    setRolling(true);
    setSettled(false);
    SFX.diceRoll();
    Haptics.diceRoll();
    let count = 0;
    const interval = setInterval(() => {
      setDisplayFace(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count > 8) {
        clearInterval(interval);
        setRolling(false);
        SFX.diceResult();
        Haptics.medium();
        onRoll(useReroll);
      }
    }, 80);
  };

  const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  return (
    <div style={styles.container}>
      <div style={styles.modifiers}>
        {hasDoubleDice && <span style={styles.modBadge}>🎲🎲 Double!</span>}
        {hasWorstDice && <span style={styles.modBadgeRed}>🎲↓ Worst!</span>}
      </div>

      <button
        style={{
          ...styles.diceButton,
          ...(rolling ? styles.diceButtonRolling : {}),
          ...(settled ? styles.diceButtonSettled : {}),
        }}
        onClick={() => handleRoll(false)}
        disabled={rolling || settled}
      >
        <span style={styles.diceFace}>{diceFaces[displayFace - 1]}</span>
        {settled ? (
          <span style={styles.rolledNumber}>{rolledValue}</span>
        ) : (
          <span style={styles.rollText}>
            {rolling ? 'Rolling...' : 'Roll!'}
          </span>
        )}
      </button>

      {hasRerolls && (
        <button style={styles.rerollBtn} onClick={() => handleRoll(true)}>
          Use Re-roll
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0 8px 0',
  },
  modifiers: {
    display: 'flex',
    gap: '8px',
  },
  modBadge: {
    background: 'rgba(52, 152, 219, 0.2)',
    color: '#3498db',
    padding: '2px 8px',
    borderRadius: '8px',
    fontSize: '12px',
  },
  modBadgeRed: {
    background: 'rgba(231, 76, 60, 0.2)',
    color: '#e74c3c',
    padding: '2px 8px',
    borderRadius: '8px',
    fontSize: '12px',
  },
  diceButton: {
    width: '100px',
    height: '100px',
    borderRadius: '20px',
    border: '3px solid #f39c12',
    background: 'linear-gradient(135deg, #2a4a7f, #3a6aaa)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'transform 0.1s',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.4)',
  },
  diceButtonRolling: {
    animation: 'shake 0.1s infinite',
    borderColor: '#e74c3c',
  },
  diceButtonSettled: {
    borderColor: '#2ecc71',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 0 16px rgba(46, 204, 113, 0.6)',
  },
  diceFace: {
    fontSize: '56px',
    lineHeight: 1,
    filter: 'drop-shadow(0 0 8px rgba(255, 230, 150, 0.9))',
  },
  rollText: {
    fontSize: '12px',
    color: '#f39c12',
    fontWeight: 600,
  },
  rolledNumber: {
    fontSize: '18px',
    fontWeight: 800,
    color: '#2ecc71',
  },
  rerollBtn: {
    padding: '6px 16px',
    borderRadius: '8px',
    border: '1px solid #9b59b6',
    background: 'transparent',
    color: '#9b59b6',
    fontSize: '12px',
    cursor: 'pointer',
  },
};
