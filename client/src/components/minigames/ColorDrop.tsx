import { useEffect, useRef, useState, useCallback } from 'react';
import type { MinigameComponentProps } from './types';
import { SFX } from '../../utils/sound';

const W = 300;
const H = 420;
const MR = 26; // marble radius
const BUCKET_H = 100; // height of bucket area at bottom
const FALL_BOTTOM = H - BUCKET_H - MR; // y at which marble is "in the catch zone"
const SEQUENCE_LEN = 80;

const BUCKET_COLORS = ['#e74c3c', '#3498db', '#f39c12'];
const BUCKET_LABELS = ['RED', 'BLUE', 'GOLD'];

/** Simple LCG so all players get the same marble sequence from the same seed. */
function makeSequence(seed: number): number[] {
  let s = seed >>> 0;
  return Array.from({ length: SEQUENCE_LEN }, () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % 3;
  });
}

/** Generate random X positions for each marble (seeded so all players match). */
function makeXPositions(seed: number): number[] {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return Array.from({ length: SEQUENCE_LEN }, () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    // Keep marble fully within bounds
    return MR + (s / 0x100000000) * (W - MR * 2);
  });
}

/** ms for a marble to fall — decreases (gets faster) with each marble. */
function fallDuration(marbleIdx: number): number {
  return Math.max(280, 1200 - marbleIdx * 60);
}

export function ColorDrop({ onScoreUpdate, config }: MinigameComponentProps) {
  const seed = (config?.seed as number) ?? 55555;
  const sequence = useRef(makeSequence(seed));
  const xPositions = useRef(makeXPositions(seed));

  // Refs — animation loop state that must not stale-close over renders
  const scoreRef = useRef(0);
  const marbleIdxRef = useRef(0);
  const answeredRef = useRef(false);
  const progressRef = useRef(0);
  const activeRef = useRef(true); // marble currently falling; false = in pause
  const pauseEndRef = useRef(0); // performance.now() timestamp when pause ends
  const lastTRef = useRef(0);
  const rafRef = useRef(0);

  // Render state
  const [score, setScore] = useState(0);
  const [marbleY, setMarbleY] = useState(-MR);
  const [marbleX, setMarbleX] = useState(xPositions.current[0]);
  const [marbleVisible, setMarbleVisible] = useState(true);
  const [currentColorIdx, setCurrentColorIdx] = useState(sequence.current[0]);
  const [flash, setFlash] = useState<{ correct: boolean } | null>(null);

  const startNextMarble = useCallback(() => {
    marbleIdxRef.current += 1;
    answeredRef.current = false;
    progressRef.current = 0;
    activeRef.current = true;
    const nextIdx = marbleIdxRef.current % SEQUENCE_LEN;
    setMarbleY(-MR);
    setMarbleX(xPositions.current[nextIdx]);
    setMarbleVisible(true);
    setFlash(null);
    setCurrentColorIdx(sequence.current[nextIdx]);
  }, []); // stable — reads only refs

  // Animation loop
  useEffect(() => {
    const tick = (now: number) => {
      const dt = lastTRef.current ? Math.min((now - lastTRef.current) / 1000, 0.05) : 0;
      lastTRef.current = now;

      if (!activeRef.current) {
        // Waiting between marbles
        if (now >= pauseEndRef.current) {
          startNextMarble();
        }
      } else if (!answeredRef.current) {
        const dur = fallDuration(marbleIdxRef.current) / 1000;
        progressRef.current += dt / dur;

        if (progressRef.current >= 1) {
          // Marble fell off without being caught
          setMarbleVisible(false);
          setFlash({ correct: false });
          answeredRef.current = true;
          activeRef.current = false;
          pauseEndRef.current = now + 420;
        } else {
          // Marble centre travels from -MR to H (just off bottom)
          setMarbleY(-MR + progressRef.current * (H + MR));
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [startNextMarble]);

  const handleBucket = useCallback(
    (bucketIdx: number) => {
      if (answeredRef.current || !activeRef.current) return;
      answeredRef.current = true;
      activeRef.current = false;

      const correct = bucketIdx === sequence.current[marbleIdxRef.current % SEQUENCE_LEN];
      if (correct) {
        SFX.minigameCorrectSort();
        scoreRef.current += 10;
        setScore(scoreRef.current);
        onScoreUpdate(scoreRef.current);
      } else {
        SFX.error();
      }

      setMarbleVisible(false);
      setFlash({ correct });
      pauseEndRef.current = performance.now() + 340;
    },
    [onScoreUpdate],
  );

  const currentX = marbleX - MR;
  const marbleColor = BUCKET_COLORS[currentColorIdx];

  return (
    <div style={{ ...styles.container, width: W, height: H }}>
      <span style={styles.scoreDisplay}>{score}</span>

      {/* Catch-zone guide line */}
      <div style={styles.catchLine} />

      {/* Falling marble */}
      {marbleVisible && (
        <div
          style={{
            ...styles.marble,
            background: marbleColor,
            boxShadow: `0 0 18px ${marbleColor}aa`,
            left: currentX,
            top: marbleY - MR,
          }}
        />
      )}

      {/* Result flash */}
      {flash && (
        <div style={{ ...styles.flash, color: flash.correct ? '#2ecc71' : '#e74c3c' }}>
          {flash.correct ? '✓ +10' : 'MISS!'}
        </div>
      )}

      {/* Buckets */}
      <div style={styles.buckets}>
        {BUCKET_COLORS.map((color, i) => (
          <button
            key={i}
            style={{ ...styles.bucket, background: `${color}1a`, borderColor: color }}
            onPointerDown={(e) => {
              e.preventDefault();
              handleBucket(i);
            }}
          >
            <span style={{ ...styles.bucketDot, background: color }} />
            <span style={styles.bucketLabel}>{BUCKET_LABELS[i]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    touchAction: 'none',
    userSelect: 'none',
    overflow: 'hidden',
    background: 'rgba(17, 34, 64, 0.6)',
    borderRadius: '14px',
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
  catchLine: {
    position: 'absolute',
    left: '5%',
    right: '5%',
    top: FALL_BOTTOM,
    height: 2,
    background: 'rgba(255,255,255,0.07)',
    borderRadius: 1,
  },
  flash: {
    position: 'absolute',
    top: '38%',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: '30px',
    fontWeight: 800,
    pointerEvents: 'none',
  },
  buckets: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    gap: '8px',
    padding: '10px',
  },
  bucket: {
    flex: 1,
    padding: '12px 0',
    borderRadius: '10px',
    border: '2px solid',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '5px',
  },
  bucketDot: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    flexShrink: 0,
  },
  bucketLabel: {
    color: '#ccd6f6',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
};
