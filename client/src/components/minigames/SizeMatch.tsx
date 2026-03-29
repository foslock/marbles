import { useState, useEffect, useRef, useCallback } from 'react';
import type { MinigameComponentProps } from './types';
import { SFX } from '../../utils/sound';

interface OvalTarget { rx: number; ry: number; }

// Match threshold: player's scale must be within ±5% of 1.0
const MATCH_THRESHOLD = 0.05;

function makeOval(rng: () => number): OvalTarget {
  return {
    rx: 35 + Math.floor(rng() * 85),   // 35–120
    ry: 35 + Math.floor(rng() * 85),   // different range each call → non-circular
  };
}

function makeRng(seed?: number) {
  let s = seed ?? Math.floor(Math.random() * 99999);
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function SizeMatch({ onScoreUpdate, config }: MinigameComponentProps) {
  const rng = useRef(makeRng(config?.seed as number | undefined));
  const [target, setTarget] = useState<OvalTarget>(() => makeOval(rng.current));
  const [playerScale, setPlayerScale] = useState(0.5);
  const playerScaleRef = useRef(0.5);
  const [matched, setMatched] = useState(false);     // brief "matched!" flash state
  const scoreRef = useRef(0);
  const [score, setScore] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag state — single-finger vertical drag changes scale; pinch also works
  const dragRef = useRef<{ y: number; scale: number; pointerId: number } | null>(null);
  const pinchRef = useRef<{ ids: [number, number]; dist: number; scale: number } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  const applyScale = useCallback((next: number) => {
    const clamped = Math.max(0.12, Math.min(2.8, next));
    playerScaleRef.current = clamped;
    setPlayerScale(clamped);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      // Start pinch
      const ids = Array.from(pointersRef.current.keys()) as [number, number];
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchRef.current = { ids, dist, scale: playerScaleRef.current };
      dragRef.current = null; // cancel any active drag
    } else {
      // Start single-finger drag
      dragRef.current = { y: e.clientY, scale: playerScaleRef.current, pointerId: e.pointerId };
      pinchRef.current = null;
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchRef.current && pointersRef.current.size >= 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      applyScale(pinchRef.current.scale * (dist / pinchRef.current.dist));
      return;
    }

    if (dragRef.current && dragRef.current.pointerId === e.pointerId) {
      const dy = dragRef.current.y - e.clientY; // drag up = positive = grow
      const rect = containerRef.current?.getBoundingClientRect();
      const height = rect?.height ?? 400;
      // Full screen height drag = 2.6x scale change
      const delta = (dy / height) * 2.6;
      applyScale(dragRef.current.scale + delta);
    }
  }, [applyScale]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
    if (pointersRef.current.size < 2) pinchRef.current = null;
  }, []);

  // Check for match each frame via an interval
  useEffect(() => {
    if (matched) return;
    const interval = setInterval(() => {
      const diff = Math.abs(playerScaleRef.current - 1.0);
      if (diff <= MATCH_THRESHOLD) {
        // Matched!
        SFX.minigameMatchSuccess();
        setMatched(true);
        scoreRef.current += 1;
        setScore(scoreRef.current);
        onScoreUpdate(scoreRef.current);
        // Brief success pause, then new oval
        setTimeout(() => {
          setTarget(makeOval(rng.current));
          playerScaleRef.current = 0.5;
          setPlayerScale(0.5);
          setMatched(false);
        }, 600);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [matched, onScoreUpdate]);

  const playerRx = target.rx * playerScale;
  const playerRy = target.ry * playerScale;
  const diff = Math.abs(playerScale - 1.0);
  const isClose = diff <= MATCH_THRESHOLD;
  const isWarm = diff <= 0.15;

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div style={styles.info}>
        <span style={styles.label}>Matched</span>
        <span style={styles.score}>{score}</span>
      </div>

      {matched && <div style={styles.matchFlash}>✓ MATCH!</div>}

      <svg style={styles.svg} viewBox="0 0 300 340">
        {/* Target oval (dashed ghost) */}
        <ellipse
          cx={150} cy={170}
          rx={target.rx} ry={target.ry}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={3}
          strokeDasharray="8 5"
        />
        {/* Player oval */}
        <ellipse
          cx={150} cy={170}
          rx={Math.max(2, playerRx)}
          ry={Math.max(2, playerRy)}
          fill={isClose ? 'rgba(46,204,113,0.2)' : isWarm ? 'rgba(243,156,18,0.1)' : 'rgba(52,152,219,0.12)'}
          stroke={isClose ? '#2ecc71' : isWarm ? '#f39c12' : '#3498db'}
          strokeWidth={4}
        />
      </svg>

      <span style={styles.hint}>Drag up/down to resize · Pinch also works</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1, width: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
    touchAction: 'none', userSelect: 'none',
  },
  info: {
    position: 'absolute', top: '8px', left: '12px', right: '12px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  label: { color: '#a8b2d1', fontSize: '14px' },
  score: { color: '#f39c12', fontSize: '28px', fontWeight: 800 },
  svg: { width: '300px', height: '340px', overflow: 'visible' },
  hint: {
    position: 'absolute', bottom: '12px',
    color: 'rgba(255,255,255,0.4)', fontSize: '12px', textAlign: 'center',
  },
  matchFlash: {
    position: 'absolute', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    color: '#2ecc71', fontSize: '32px', fontWeight: 900,
    textShadow: '0 0 20px #2ecc71',
    zIndex: 10, pointerEvents: 'none',
  },
};
