import { useEffect, useRef, useState, useCallback } from 'react';
import type { MinigameComponentProps } from './types';

const W = 300;
const H = 440;
const MR = 22; // marble radius
const SWING_Y = 72; // marble center y while swinging
const PLATFORM_Y = 360; // top surface of the platform
const SWING_AMP = 110; // half-width of pendulum swing (px)
const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c'];

export function MarbleStack({ onScoreUpdate, config }: MinigameComponentProps) {
  const seed = (config?.seed as number) ?? 42;

  // Refs — mutated by animation loops without triggering renders
  const angleRef = useRef((seed % 628) / 100); // random phase 0–6.28 rad
  const speedRef = useRef(1.6 + (seed % 20) * 0.06); // ~1.6–2.8 rad/s
  const droppingRef = useRef(false);
  const scoreRef = useRef(0);
  const stackCountRef = useRef(0);
  const colorIdxRef = useRef(seed % COLORS.length);
  const lastTRef = useRef(0);
  const rafRef = useRef(0);

  // Render state
  const [swingX, setSwingX] = useState(W / 2);
  const [activeColor, setActiveColor] = useState(COLORS[seed % COLORS.length]);
  const [stacked, setStacked] = useState<Array<{ id: number; x: number; y: number; color: string }>>([]);
  const [dropMarble, setDropMarble] = useState<{ x: number; y: number; color: string } | null>(null);
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState<{ pts: number; x: number } | null>(null);

  // Pendulum loop — runs until component unmounts
  useEffect(() => {
    const tick = (now: number) => {
      const dt = lastTRef.current ? Math.min((now - lastTRef.current) / 1000, 0.05) : 0;
      lastTRef.current = now;
      if (!droppingRef.current) {
        angleRef.current += speedRef.current * dt;
        setSwingX(W / 2 + Math.sin(angleRef.current) * SWING_AMP);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleTap = useCallback(() => {
    if (droppingRef.current) return;
    droppingRef.current = true;

    const releaseX = W / 2 + Math.sin(angleRef.current) * SWING_AMP;
    const color = COLORS[colorIdxRef.current % COLORS.length];
    // Target: top of the current stack
    const targetY = PLATFORM_Y - MR - stackCountRef.current * (MR * 2 + 3);

    // Animate drop with ease-in (gravity feel)
    let startT: number | null = null;
    const animDrop = (now: number) => {
      if (!startT) startT = now;
      const t = Math.min((now - startT) / 360, 1);
      const y = SWING_Y + (targetY - SWING_Y) * (t * t);
      setDropMarble({ x: releaseX, y, color });

      if (t < 1) {
        requestAnimationFrame(animDrop);
        return;
      }

      // Landed — score based on horizontal offset from centre
      const offset = Math.abs(releaseX - W / 2);
      const pts =
        offset < W * 0.06 ? 15 :
        offset < W * 0.16 ? 10 :
        offset < W * 0.30 ? 5 : 2;

      scoreRef.current += pts;
      setScore(scoreRef.current);
      onScoreUpdate(scoreRef.current);

      stackCountRef.current += 1;
      colorIdxRef.current = (colorIdxRef.current + 1) % COLORS.length;
      speedRef.current = Math.min(4.5, speedRef.current + 0.12);

      setStacked((prev) => [
        ...prev,
        { id: stackCountRef.current, x: releaseX, y: targetY, color },
      ]);
      setDropMarble(null);
      setActiveColor(COLORS[colorIdxRef.current]);
      setFlash({ pts, x: releaseX });
      setTimeout(() => setFlash(null), 650);

      // Restart pendulum from opposite edge so it visibly sweeps back
      angleRef.current = stackCountRef.current % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
      droppingRef.current = false;
    };
    requestAnimationFrame(animDrop);
  }, [onScoreUpdate]);

  return (
    <div style={styles.container} onPointerDown={handleTap}>
      <span style={styles.scoreDisplay}>{score}</span>

      {/* Platform */}
      <div style={styles.platform} />

      {/* Stacked marbles */}
      {stacked.map((m) => (
        <div
          key={m.id}
          style={{
            ...styles.marble,
            left: m.x - MR,
            top: m.y - MR,
            background: m.color,
            opacity: 0.85,
          }}
        />
      ))}

      {/* Swinging marble */}
      {!dropMarble && (
        <div
          style={{
            ...styles.marble,
            left: swingX - MR,
            top: SWING_Y - MR,
            background: activeColor,
            boxShadow: `0 0 14px ${activeColor}99`,
          }}
        />
      )}

      {/* Dropping marble */}
      {dropMarble && (
        <div
          style={{
            ...styles.marble,
            left: dropMarble.x - MR,
            top: dropMarble.y - MR,
            background: dropMarble.color,
            boxShadow: `0 0 14px ${dropMarble.color}99`,
          }}
        />
      )}

      {/* Score flash */}
      {flash && (
        <div
          style={{
            ...styles.flash,
            left: flash.x - 30,
            color: flash.pts >= 15 ? '#f39c12' : flash.pts >= 10 ? '#2ecc71' : '#a8b2d1',
          }}
        >
          +{flash.pts}
        </div>
      )}

      <span style={styles.hint}>TAP TO DROP</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: W,
    height: H,
    position: 'relative',
    touchAction: 'none',
    userSelect: 'none',
    overflow: 'hidden',
    background: 'rgba(17, 34, 64, 0.6)',
    borderRadius: '14px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  scoreDisplay: {
    position: 'absolute',
    top: 10,
    right: 14,
    color: '#f39c12',
    fontSize: '24px',
    fontWeight: 800,
    zIndex: 2,
    pointerEvents: 'none',
  },
  marble: {
    position: 'absolute',
    width: MR * 2,
    height: MR * 2,
    borderRadius: '50%',
  },
  platform: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    top: PLATFORM_Y + MR,
    height: 6,
    background: '#233554',
    borderRadius: 3,
  },
  flash: {
    position: 'absolute',
    top: PLATFORM_Y - 85,
    width: 60,
    textAlign: 'center',
    fontSize: '20px',
    fontWeight: 800,
    pointerEvents: 'none',
  },
  hint: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#5a6a8a',
    fontSize: '11px',
    letterSpacing: '1px',
    pointerEvents: 'none',
  },
};
