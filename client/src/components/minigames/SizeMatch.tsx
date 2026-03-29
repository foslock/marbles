import { useState, useEffect, useRef, useCallback } from 'react';
import type { MinigameComponentProps } from './types';

const ROUND_DURATION = 2500; // ms per round — timer anchored to roundIndex, not playerSize

interface OvalTarget {
  rx: number; // half-width
  ry: number; // half-height
}

function makeTargets(seed?: number): OvalTarget[] {
  // Generate 5 rounds of oval targets. rx and ry differ to make non-circular ovals.
  const rng = (() => {
    let s = seed ?? Math.floor(Math.random() * 99999);
    return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
  })();
  return Array.from({ length: 5 }, () => ({
    rx: 30 + Math.floor(rng() * 90),  // 30–120
    ry: 30 + Math.floor(rng() * 90),  // 30–120 (different from rx → oval)
  }));
}

export function SizeMatch({ onScoreUpdate, config }: MinigameComponentProps) {
  const targets = useRef<OvalTarget[]>(
    (config?.targetOvals as OvalTarget[]) ?? makeTargets(config?.seed as number | undefined)
  );
  const [roundIndex, setRoundIndex] = useState(0);
  // playerSize is a scale multiplier: 1.0 means oval exactly matches the target
  const [playerScale, setPlayerScale] = useState(0.5);
  const playerScaleRef = useRef(0.5);
  const scoreRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const target = targets.current[roundIndex];

  // Round timer — anchored to roundIndex only, reads size via ref so resizing
  // doesn't reset the clock.
  useEffect(() => {
    if (!target) return;
    const timer = setTimeout(() => {
      // Score: how close is the player's scale to 1.0 (perfect match)?
      // diff in px: compare actual player radii vs target radii
      const ps = playerScaleRef.current;
      const diffRx = Math.abs(target.rx * ps - target.rx);
      const diffRy = Math.abs(target.ry * ps - target.ry);
      const avgDiff = (diffRx + diffRy) / 2;
      const accuracy = Math.max(0, Math.round(100 - avgDiff));
      scoreRef.current += accuracy;
      onScoreUpdate(scoreRef.current);
      // Reset for next round
      playerScaleRef.current = 0.5;
      setPlayerScale(0.5);
      setRoundIndex((r) => r + 1);
    }, ROUND_DURATION);
    return () => clearTimeout(timer);
  }, [roundIndex, target, onScoreUpdate]);

  // Pinch/spread gesture via pointer distance tracking
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialPinchDist = useRef<number | null>(null);
  const initialScale = useRef(0.5);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      initialPinchDist.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      initialScale.current = playerScaleRef.current;
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && initialPinchDist.current !== null) {
      const pts = Array.from(pointers.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const ratio = dist / initialPinchDist.current;
      const next = Math.max(0.15, Math.min(2.5, initialScale.current * ratio));
      playerScaleRef.current = next;
      setPlayerScale(next);
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) initialPinchDist.current = null;
  }, []);

  // Single-finger tap: tap top half → grow, bottom half → shrink
  const handleTap = useCallback((e: React.PointerEvent) => {
    if (pointers.current.size > 1) return; // ignore during pinch
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const delta = y < rect.height / 2 ? 0.08 : -0.08;
    const next = Math.max(0.15, Math.min(2.5, playerScaleRef.current + delta));
    playerScaleRef.current = next;
    setPlayerScale(next);
  }, []);

  if (!target) {
    return (
      <div style={styles.container}>
        <span style={styles.doneText}>All rounds complete!</span>
        <span style={styles.finalScore}>{scoreRef.current}</span>
      </div>
    );
  }

  const playerRx = target.rx * playerScale;
  const playerRy = target.ry * playerScale;
  const diffRx = Math.abs(playerRx - target.rx);
  const diffRy = Math.abs(playerRy - target.ry);
  const isClose = diffRx < 8 && diffRy < 8;

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onPointerDown={(e) => { handlePointerDown(e); handleTap(e); }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div style={styles.info}>
        <span style={styles.round}>Round {roundIndex + 1}/{targets.current.length}</span>
        <span style={styles.score}>{scoreRef.current}</span>
      </div>

      {/* Overlay both ovals in an SVG so they share a coordinate space */}
      <svg
        style={styles.svg}
        viewBox="0 0 300 340"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Target oval (ghost outline) */}
        <ellipse
          cx={150}
          cy={170}
          rx={target.rx}
          ry={target.ry}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={3}
          strokeDasharray="8 5"
        />

        {/* Player oval */}
        <ellipse
          cx={150}
          cy={170}
          rx={Math.max(2, playerRx)}
          ry={Math.max(2, playerRy)}
          fill={isClose ? 'rgba(46,204,113,0.18)' : 'rgba(52,152,219,0.15)'}
          stroke={isClose ? '#2ecc71' : '#3498db'}
          strokeWidth={4}
          style={{ transition: 'rx 0.05s, ry 0.05s, stroke 0.2s' } as React.CSSProperties}
        />
      </svg>

      <span style={styles.hint}>Pinch to resize · tap top=grow bottom=shrink</span>
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
    display: 'flex', justifyContent: 'space-between',
  },
  round: { color: '#a8b2d1', fontSize: '14px' },
  score: { color: '#f39c12', fontSize: '20px', fontWeight: 800 },
  svg: {
    width: '300px',
    height: '340px',
    overflow: 'visible',
  },
  hint: {
    position: 'absolute', bottom: '12px',
    color: 'rgba(255,255,255,0.4)', fontSize: '12px', textAlign: 'center',
  },
  doneText: { color: '#ccd6f6', fontSize: '20px', marginBottom: '8px' },
  finalScore: { color: '#f39c12', fontSize: '48px', fontWeight: 800 },
};
