import { useState, useEffect, useCallback, useRef } from 'react';
import type { MinigameInfo } from '../types/game';

interface Props {
  minigameInfo: MinigameInfo;
  playerId: string | null;
  onSubmitScore: (minigameId: string, score: number) => void;
}

export function MinigameScreen({ minigameInfo, playerId, onSubmitScore }: Props) {
  const { minigame } = minigameInfo;
  const [phase, setPhase] = useState<'countdown' | 'playing' | 'done'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(minigame.duration);
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
      onSubmitScore(minigame.id, score);
    }
  }, [phase, score, minigame.id, onSubmitScore]);

  const handleTap = useCallback(() => {
    if (phase !== 'playing') return;
    setScore((s) => s + 1);
  }, [phase]);

  // Render based on minigame type
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
        <div style={styles.gameArea} onPointerDown={handleTap}>
          {/* Progress bar */}
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progressPercent}%`,
              }}
            />
          </div>

          {/* Tap-based minigames */}
          {(minigame.type === 'tap_count' || minigame.type === 'reaction' || minigame.type === 'target_tap') && (
            <div style={styles.tapArea}>
              <span style={styles.scoreDisplay}>{score}</span>
              <span style={styles.tapHint}>TAP!</span>
            </div>
          )}

          {/* Canvas fill minigame */}
          {minigame.type === 'canvas_fill' && (
            <CanvasFillGame
              onScoreUpdate={setScore}
              timeLeft={timeLeft}
              duration={minigame.duration}
            />
          )}

          {/* Ball tracking */}
          {minigame.type === 'tracking' && (
            <BallTrackingGame
              onScoreUpdate={setScore}
              timeLeft={timeLeft}
              duration={minigame.duration}
            />
          )}

          {/* Rhythm tap */}
          {minigame.type === 'rhythm' && (
            <RhythmGame
              onScoreUpdate={setScore}
              timeLeft={timeLeft}
              duration={minigame.duration}
            />
          )}

          {/* Default: tap game for unsupported types */}
          {!['tap_count', 'reaction', 'target_tap', 'canvas_fill', 'tracking', 'rhythm'].includes(minigame.type) && (
            <div style={styles.tapArea}>
              <span style={styles.scoreDisplay}>{score}</span>
              <span style={styles.tapHint}>TAP!</span>
            </div>
          )}
        </div>
      )}

      {phase === 'done' && (
        <div style={styles.doneContainer}>
          <h2 style={styles.doneTitle}>Time's Up!</h2>
          <span style={styles.finalScore}>{score}</span>
          <p style={styles.waiting}>Waiting for other players...</p>
        </div>
      )}
    </div>
  );
}

// Canvas fill sub-game
function CanvasFillGame({
  onScoreUpdate,
}: {
  onScoreUpdate: (score: number) => void;
  timeLeft: number;
  duration: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filledPixels = useRef(0);

  const handleDraw = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${(filledPixels.current * 3) % 360}, 80%, 60%)`;
      ctx.fill();

      filledPixels.current += 1;
      onScoreUpdate(filledPixels.current);
    },
    [onScoreUpdate]
  );

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={400}
      style={styles.miniCanvas}
      onPointerMove={handleDraw}
    />
  );
}

// Ball tracking sub-game
function BallTrackingGame({
  onScoreUpdate,
}: {
  onScoreUpdate: (score: number) => void;
  timeLeft: number;
  duration: number;
}) {
  const [ballPos, setBallPos] = useState({ x: 150, y: 200 });
  const [fingerDown, setFingerDown] = useState(false);
  const [fingerPos, setFingerPos] = useState({ x: 0, y: 0 });
  const scoreRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setBallPos({
        x: 50 + Math.random() * 200,
        y: 50 + Math.random() * 300,
      });
    }, 800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (fingerDown) {
      const dist = Math.hypot(fingerPos.x - ballPos.x, fingerPos.y - ballPos.y);
      if (dist < 40) {
        scoreRef.current += 1;
        onScoreUpdate(scoreRef.current);
      }
    }
  }, [fingerDown, fingerPos, ballPos, onScoreUpdate]);

  const handlePointer = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setFingerPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={containerRef}
      style={styles.trackingArea}
      onPointerDown={(e) => { setFingerDown(true); handlePointer(e); }}
      onPointerMove={handlePointer}
      onPointerUp={() => setFingerDown(false)}
    >
      <div
        style={{
          ...styles.ball,
          left: ballPos.x - 25,
          top: ballPos.y - 25,
        }}
      />
      <span style={styles.scoreOverlay}>{scoreRef.current}</span>
    </div>
  );
}

// Rhythm tap sub-game
function RhythmGame({
  onScoreUpdate,
}: {
  onScoreUpdate: (score: number) => void;
  timeLeft: number;
  duration: number;
}) {
  const [flash, setFlash] = useState(false);
  const [bpm] = useState(() => 80 + Math.floor(Math.random() * 80));
  const scoreRef = useRef(0);
  const lastFlash = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setFlash(true);
      lastFlash.current = Date.now();
      setTimeout(() => setFlash(false), 150);
    }, (60 / bpm) * 1000);
    return () => clearInterval(interval);
  }, [bpm]);

  const handleTap = () => {
    const delta = Math.abs(Date.now() - lastFlash.current);
    const beatInterval = (60 / bpm) * 1000;
    const accuracy = Math.max(0, 100 - (delta / beatInterval) * 200);
    scoreRef.current += Math.round(accuracy);
    onScoreUpdate(scoreRef.current);
  };

  return (
    <div
      style={{
        ...styles.rhythmArea,
        background: flash
          ? 'radial-gradient(circle, #e74c3c, #c0392b)'
          : 'radial-gradient(circle, #1a3a5c, #112240)',
      }}
      onPointerDown={handleTap}
    >
      <p style={styles.rhythmText}>{bpm} BPM</p>
      <p style={styles.rhythmHint}>Tap on the beat!</p>
      <span style={styles.scoreOverlay}>{scoreRef.current}</span>
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
  tapArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  scoreDisplay: {
    color: '#f39c12',
    fontSize: '80px',
    fontWeight: 800,
  },
  tapHint: {
    color: '#8892b0',
    fontSize: '18px',
    marginTop: '8px',
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
  miniCanvas: {
    borderRadius: '12px',
    background: '#112240',
    touchAction: 'none',
    maxWidth: '100%',
  },
  trackingArea: {
    flex: 1,
    width: '100%',
    position: 'relative',
    touchAction: 'none',
  },
  ball: {
    position: 'absolute',
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, #e74c3c, #c0392b)',
    transition: 'left 0.3s, top 0.3s',
  },
  scoreOverlay: {
    position: 'absolute',
    top: '12px',
    right: '16px',
    color: '#f39c12',
    fontSize: '24px',
    fontWeight: 800,
  },
  rhythmArea: {
    flex: 1,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    transition: 'background 0.15s',
    touchAction: 'none',
  },
  rhythmText: {
    color: '#fff',
    fontSize: '36px',
    fontWeight: 800,
    margin: 0,
  },
  rhythmHint: {
    color: '#a8b2d1',
    fontSize: '16px',
    marginTop: '8px',
  },
};
