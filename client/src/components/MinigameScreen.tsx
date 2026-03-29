import { useState, useEffect, useRef } from 'react';
import type { MinigameInfo } from '../types/game';
import { MINIGAME_REGISTRY } from './minigames';
import { TapFrenzy } from './minigames/TapFrenzy';

interface Props {
  minigameInfo: MinigameInfo;
  playerId: string | null;
  onSubmitScore: (minigameId: string, score: number) => void;
}

/**
 * MinigameScreen handles the lifecycle shared by ALL minigames:
 *   countdown -> playing (delegates to registered component) -> done -> submit
 *
 * Individual minigame logic lives in src/components/minigames/*.tsx
 * and is looked up from the registry by the server-provided `type` key.
 */
export function MinigameScreen({ minigameInfo, playerId, onSubmitScore }: Props) {
  const { minigame } = minigameInfo;
  const [phase, setPhase] = useState<'countdown' | 'playing' | 'done'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(minigame.duration);
  const scoreRef = useRef(0);
  const submitted = useRef(false);

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      setPhase('playing');
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, countdown]);

  // Game timer
  useEffect(() => {
    if (phase !== 'playing') return;
    if (timeLeft <= 0) {
      setPhase('done');
      return;
    }
    const timer = setTimeout(() => setTimeLeft(timeLeft - 100), 100);
    return () => clearTimeout(timer);
  }, [phase, timeLeft]);

  // Submit score when done
  useEffect(() => {
    if (phase === 'done' && !submitted.current) {
      submitted.current = true;
      onSubmitScore(minigame.id, scoreRef.current);
    }
  }, [phase, minigame.id, onSubmitScore]);

  const handleScoreUpdate = (score: number) => {
    scoreRef.current = score;
  };

  // Look up the game component from the registry, fall back to TapFrenzy
  const GameComponent = MINIGAME_REGISTRY[minigame.type] || TapFrenzy;

  const progressPercent = phase === 'playing'
    ? (timeLeft / minigame.duration) * 100
    : 100;

  return (
    <div style={styles.container}>
      {phase === 'countdown' && (
        <div style={styles.countdownContainer}>
          <h2 style={styles.minigameName}>{minigame.name}</h2>
          <p style={styles.instructions}>{minigame.instructions}</p>
          <div style={styles.countdownNumber}>
            {countdown > 0 ? countdown : 'GO!'}
          </div>
        </div>
      )}

      {phase === 'playing' && (
        <div style={styles.gameArea}>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progressPercent}%`,
              }}
            />
          </div>
          <GameComponent
            onScoreUpdate={handleScoreUpdate}
            timeLeft={timeLeft}
            duration={minigame.duration}
            config={minigame.config}
          />
        </div>
      )}

      {phase === 'done' && (
        <div style={styles.doneContainer}>
          <h2 style={styles.doneTitle}>Time's Up!</h2>
          <span style={styles.finalScore}>{scoreRef.current}</span>
          <p style={styles.waiting}>Waiting for other players...</p>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#0a192f',
  },
  countdownContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  minigameName: {
    color: '#f39c12',
    fontSize: '32px',
    fontWeight: 800,
    margin: '0 0 8px 0',
  },
  instructions: {
    color: '#a8b2d1',
    fontSize: '16px',
    textAlign: 'center',
    margin: '0 0 32px 0',
    maxWidth: '280px',
  },
  countdownNumber: {
    color: '#fff',
    fontSize: '72px',
    fontWeight: 800,
  },
  gameArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
    touchAction: 'none',
  },
  progressBar: {
    width: '90%',
    height: '6px',
    borderRadius: '3px',
    background: '#233554',
    overflow: 'hidden',
    margin: '12px 0',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #e74c3c, #f39c12)',
    borderRadius: '3px',
    transition: 'width 0.1s linear',
  },
  doneContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: {
    color: '#ccd6f6',
    fontSize: '28px',
    margin: '0 0 16px 0',
  },
  finalScore: {
    color: '#f39c12',
    fontSize: '64px',
    fontWeight: 800,
  },
  waiting: {
    color: '#8892b0',
    fontSize: '14px',
    marginTop: '16px',
  },
};
