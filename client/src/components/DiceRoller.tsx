import { useState } from 'react';
import { SFX } from '../utils/sound';
import { Haptics } from '../utils/haptics';

interface Props {
  onRoll: (useReroll?: boolean) => void;
  hasRerolls: boolean;
  hasDoubleDice: boolean;
  hasWorstDice: boolean;
}

export function DiceRoller({ onRoll, hasRerolls, hasDoubleDice, hasWorstDice }: Props) {
  const [rolling, setRolling] = useState(false);
  const [displayFace, setDisplayFace] = useState(1);

  const handleRoll = (useReroll = false) => {
    setRolling(true);
    SFX.diceRoll();
    Haptics.diceRoll();
    // Quick animation
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
        }}
        onClick={() => handleRoll(false)}
        disabled={rolling}
      >
        <span style={styles.diceFace}>{diceFaces[displayFace - 1]}</span>
        <span style={styles.rollText}>
          {rolling ? 'Rolling...' : 'Roll!'}
        </span>
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
    width: '80px',
    height: '80px',
    borderRadius: '16px',
    border: '3px solid #f39c12',
    background: 'linear-gradient(135deg, #112240, #1a3a5c)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'transform 0.1s',
  },
  diceButtonRolling: {
    animation: 'shake 0.1s infinite',
    borderColor: '#e74c3c',
  },
  diceFace: {
    fontSize: '36px',
  },
  rollText: {
    fontSize: '12px',
    color: '#f39c12',
    fontWeight: 600,
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
