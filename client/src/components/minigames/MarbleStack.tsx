import { useEffect, useRef, useState, useCallback } from 'react';
import type { MinigameComponentProps } from './types';

const W = 300;
const H = 480;
const MR = 22;           // marble radius
const SWING_Y = 72;      // marble centre y while swinging
const PLATFORM_Y = 390;  // top surface of the platform (moved down to give more room)
const SWING_AMP = 110;   // half-width of pendulum swing (px)
const MARBLE_STEP = MR * 2 + 3;  // vertical spacing between stacked marbles (47px)

// 25% overlap rule: new marble centre must be within 1.5*MR = 33px of the
// marble below (= at least 25% of diameter overlapping).
const OVERLAP_THRESHOLD = MR * 1.5;

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c'];

// How many marbles must be stacked before the view starts rising.
const SCROLL_START = 3;

export function MarbleStack({ onScoreUpdate, config }: MinigameComponentProps) {
  const seed = (config?.seed as number) ?? 42;

  const angleRef = useRef((seed % 628) / 100);
  const speedRef = useRef(1.6 + (seed % 20) * 0.06);
  const droppingRef = useRef(false);
  const scoreRef = useRef(0);
  const stackCountRef = useRef(0);
  const colorIdxRef = useRef(seed % COLORS.length);
  const lastTRef = useRef(0);
  const rafRef = useRef(0);

  const [swingX, setSwingX] = useState(W / 2);
  const [activeColor, setActiveColor] = useState(COLORS[seed % COLORS.length]);
  const [stacked, setStacked] = useState<Array<{ id: number; x: number; y: number; color: string }>>([]);
  const stackRef = useRef<Array<{ id: number; x: number; y: number; color: string }>>([]); // mirror for use in callbacks
  const [dropMarble, setDropMarble] = useState<{ x: number; y: number; color: string } | null>(null);
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState<{ pts: number; x: number; miss: boolean } | null>(null);
  const [viewOffset, setViewOffset] = useState(0); // px to shift view upward

  // Pendulum loop
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
    const targetY = PLATFORM_Y - MR - stackCountRef.current * MARBLE_STEP;

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

      // 25% overlap check: compare against the marble below (or platform centre)
      const stack = stackRef.current;
      const below = stack.length > 0 ? stack[stack.length - 1] : null;
      const refX = below ? below.x : W / 2; // platform centre if first marble
      const offset = Math.abs(releaseX - refX);
      const validLanding = stack.length === 0 || offset < OVERLAP_THRESHOLD;

      if (validLanding) {
        // Score based on how centred the marble is over the one below
        const pts =
          offset < W * 0.06 ? 15 :
          offset < W * 0.16 ? 10 :
          offset < W * 0.30 ? 5 : 2;

        scoreRef.current += pts;
        setScore(scoreRef.current);
        onScoreUpdate(scoreRef.current);
        stackCountRef.current += 1;

        const newMarble = { id: stackCountRef.current, x: releaseX, y: targetY, color };
        stackRef.current = [...stack, newMarble];
        setStacked(stackRef.current);
        setFlash({ pts, x: releaseX, miss: false });

        // Raise view once stack is tall enough
        const newOffset = Math.max(0, (stackCountRef.current - SCROLL_START) * MARBLE_STEP);
        setViewOffset(newOffset);

        speedRef.current = Math.min(4.5, speedRef.current + 0.12);
      } else {
        // Miss — marble doesn't join the stack
        setFlash({ pts: 0, x: releaseX, miss: true });
      }

      setDropMarble(null);
      colorIdxRef.current = (colorIdxRef.current + 1) % COLORS.length;
      setActiveColor(COLORS[colorIdxRef.current]);
      setTimeout(() => setFlash(null), 700);

      angleRef.current = stackCountRef.current % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
      droppingRef.current = false;
    };
    requestAnimationFrame(animDrop);
  }, [onScoreUpdate]);

  return (
    <div
      style={{ width: W, height: H, overflow: 'hidden', position: 'relative',
               touchAction: 'none', userSelect: 'none', cursor: 'pointer',
               background: 'rgba(17, 34, 64, 0.6)', borderRadius: '14px', flexShrink: 0 }}
      onPointerDown={handleTap}
    >
      {/* Score */}
      <span style={styles.scoreDisplay}>{score}</span>

      {/* Scrolling game content — shifts upward as stack grows */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translateY(-${viewOffset}px)`,
        transition: 'transform 0.4s ease-out',
      }}>
        {/* Platform */}
        <div style={{
          position: 'absolute',
          left: '8%', right: '8%',
          top: PLATFORM_Y + MR,
          height: 6,
          background: '#233554',
          borderRadius: 3,
        }} />

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
          <div style={{
            ...styles.marble,
            left: swingX - MR,
            top: SWING_Y - MR,
            background: activeColor,
            boxShadow: `0 0 14px ${activeColor}99`,
          }} />
        )}

        {/* Dropping marble */}
        {dropMarble && (
          <div style={{
            ...styles.marble,
            left: dropMarble.x - MR,
            top: dropMarble.y - MR,
            background: dropMarble.color,
            boxShadow: `0 0 14px ${dropMarble.color}99`,
          }} />
        )}

        {/* Score / miss flash */}
        {flash && (
          <div style={{
            ...styles.flash,
            left: flash.x - 30,
            top: PLATFORM_Y - 100,
            color: flash.miss ? '#e74c3c' : flash.pts >= 15 ? '#f39c12' : flash.pts >= 10 ? '#2ecc71' : '#a8b2d1',
          }}>
            {flash.miss ? 'miss' : `+${flash.pts}`}
          </div>
        )}
      </div>

      <span style={styles.hint}>TAP TO DROP</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  scoreDisplay: {
    position: 'absolute', top: 10, right: 14,
    color: '#f39c12', fontSize: '24px', fontWeight: 800,
    zIndex: 2, pointerEvents: 'none',
  },
  marble: {
    position: 'absolute',
    width: MR * 2, height: MR * 2,
    borderRadius: '50%',
  },
  flash: {
    position: 'absolute',
    width: 60, textAlign: 'center',
    fontSize: '20px', fontWeight: 800,
    pointerEvents: 'none',
  },
  hint: {
    position: 'absolute', bottom: 10, left: 0, right: 0,
    textAlign: 'center', color: '#5a6a8a',
    fontSize: '11px', letterSpacing: '1px',
    pointerEvents: 'none', zIndex: 2,
  },
};
