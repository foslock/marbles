import { useState, useEffect, useRef, useCallback } from 'react';
import type { MinigameComponentProps } from './types';
import { SFX } from '../../utils/sound';

// ── Constants ─────────────────────────────────────────────────────────────────
const W = 300;
const H = 400;
const GROUND_Y = 330;            // top of ground surface
const MARBLE_R = 18;             // normal marble radius
const DUCK_RY = 9;               // vertical radius while ducking (squished vertically)
const DUCK_RX = MARBLE_R;        // horizontal radius while ducking (same as normal)
const STAND_Y = GROUND_Y - MARBLE_R; // 312 — marble centre Y when standing

// Jump physics
const JUMP_VY = -400;            // initial upward velocity (px/s)
const GRAVITY = 860;             // px/s²

// Obstacle geometry
const SPIKE_H = 65;              // height of ground spike above ground
const SPIKE_W = 34;              // base width of spike
const BAR_BOTTOM = 300;          // ceiling bar tip Y (bar extends 0 → BAR_BOTTOM)
const BAR_W = 40;                // bar width

// Player screen X stays fixed; world scrolls around it
const PLAYER_X = 70;

// Speed ramp
const INITIAL_SPEED = 170;       // px/s at game start
const SPEED_RAMP = 22;           // extra px/s gained per second of play
const MAX_SPEED = 500;

// Level generation
const MIN_GAP = 210;
const MAX_GAP = 470;
const LEVEL_LENGTH = 90;

// ── Seeded RNG ────────────────────────────────────────────────────────────────
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ── Level generation ──────────────────────────────────────────────────────────
interface Obstacle {
  worldX: number;
  type: 'spike' | 'bar';
}

function buildLevel(seed: number): Obstacle[] {
  const rng = makeRng(seed);
  const obs: Obstacle[] = [];
  let x = 700; // first obstacle well ahead of start
  for (let i = 0; i < LEVEL_LENGTH; i++) {
    obs.push({ worldX: x, type: rng() < 0.5 ? 'spike' : 'bar' });
    x += MIN_GAP + rng() * (MAX_GAP - MIN_GAP);
  }
  return obs;
}

// ── Collision helpers ─────────────────────────────────────────────────────────
/** Returns true if the player overlaps an obstacle this frame. */
function checkCollision(
  pWorldX: number,
  pY: number,
  state: 'normal' | 'jumping' | 'ducking',
  obs: Obstacle,
): boolean {
  const pRX = state === 'ducking' ? DUCK_RX : MARBLE_R;
  const pRY = state === 'ducking' ? DUCK_RY : MARBLE_R;
  const dx = Math.abs(obs.worldX - pWorldX);

  if (obs.type === 'spike') {
    const halfBase = SPIKE_W / 2;
    if (dx >= pRX + halfBase - 2) return false;
    // Collides if player overlaps the spike vertically
    const spikeTipY = GROUND_Y - SPIKE_H;
    const playerBottom = pY + pRY;
    const playerTop = pY - pRY;
    return playerBottom > spikeTipY && playerTop < GROUND_Y;
  } else {
    // Ceiling bar occupies Y range [0, BAR_BOTTOM]
    const halfBar = BAR_W / 2;
    if (dx >= pRX + halfBar - 2) return false;
    const playerTop = pY - pRY;
    return playerTop < BAR_BOTTOM;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MarbleRunner({ onScoreUpdate, config }: MinigameComponentProps) {
  const seed = (config?.seed as number) ?? 42;
  const levelRef = useRef<Obstacle[]>(buildLevel(seed));

  // Physics refs (source of truth for the RAF loop)
  const worldOffRef = useRef(0);
  const marbleYRef  = useRef(STAND_Y);
  const jumpVyRef   = useRef(0);
  const stateRef    = useRef<'normal' | 'jumping' | 'ducking'>('normal');
  const duckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameOverRef = useRef(false);
  const scoreRef    = useRef(0);
  const bestScoreRef = useRef(0);
  const crashTimeRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const lastTRef    = useRef(0);
  const rafRef      = useRef(0);

  // Render state
  const [marbleY,    setMarbleY]    = useState(STAND_Y);
  const [marbleState, setMarbleState] = useState<'normal' | 'jumping' | 'ducking'>('normal');
  const [worldOff,   setWorldOff]   = useState(0);
  const [score,      setScore]      = useState(0);
  const [gameOver,   setGameOver]   = useState(false);
  const [canRetry,   setCanRetry]   = useState(false);
  const [bestScore,  setBestScore]  = useState(0);

  // Pointer tracking for gesture detection
  const ptrStartRef = useRef<{ x: number; y: number } | null>(null);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const doJump = useCallback(() => {
    if (stateRef.current !== 'normal') return;
    stateRef.current = 'jumping';
    jumpVyRef.current = JUMP_VY;
    setMarbleState('jumping');
    SFX.minigameDodge();
  }, []);

  const doDuck = useCallback((durationMs = 600) => {
    if (stateRef.current === 'jumping') return;
    if (duckTimerRef.current) clearTimeout(duckTimerRef.current);
    stateRef.current = 'ducking';
    setMarbleState('ducking');
    duckTimerRef.current = setTimeout(() => {
      if (stateRef.current === 'ducking') {
        stateRef.current = 'normal';
        setMarbleState('normal');
      }
    }, durationMs);
  }, []);

  // ── RAF loop ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = (now: number) => {
      if (gameOverRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const dt = lastTRef.current ? Math.min((now - lastTRef.current) / 1000, 0.05) : 0;
      lastTRef.current = now;

      // Scroll world
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const speed = Math.min(MAX_SPEED, INITIAL_SPEED + elapsed * SPEED_RAMP);
      worldOffRef.current += speed * dt;

      // Jump arc
      if (stateRef.current === 'jumping') {
        jumpVyRef.current += GRAVITY * dt;
        const newY = marbleYRef.current + jumpVyRef.current * dt;
        if (newY >= STAND_Y) {
          marbleYRef.current = STAND_Y;
          jumpVyRef.current = 0;
          stateRef.current = 'normal';
          setMarbleState('normal');
        } else {
          marbleYRef.current = newY;
        }
        setMarbleY(marbleYRef.current);
      }

      // Score = distance / 10
      const newScore = Math.floor(worldOffRef.current / 10);
      if (newScore !== scoreRef.current) {
        scoreRef.current = newScore;
        setScore(newScore);
        onScoreUpdate(newScore);
      }

      setWorldOff(worldOffRef.current);

      // Collision
      const playerWorldX = worldOffRef.current + PLAYER_X;
      for (const obs of levelRef.current) {
        // Only check nearby obstacles
        const screenX = obs.worldX - worldOffRef.current;
        if (screenX < -60 || screenX > W + 10) continue;

        if (checkCollision(playerWorldX, marbleYRef.current, stateRef.current, obs)) {
          SFX.minigameHit();
          if (scoreRef.current > bestScoreRef.current) {
            bestScoreRef.current = scoreRef.current;
            setBestScore(scoreRef.current);
          }
          gameOverRef.current = true;
          crashTimeRef.current = Date.now();
          setGameOver(true);
          setTimeout(() => setCanRetry(true), 1000);
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (duckTimerRef.current) clearTimeout(duckTimerRef.current);
    };
  }, [onScoreUpdate]);

  // ── Pointer handlers ─────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (gameOverRef.current) {
      // Restart if 1s has elapsed since crash
      if (Date.now() - crashTimeRef.current >= 1000) {
        // Reset physics refs
        worldOffRef.current = 0;
        marbleYRef.current = STAND_Y;
        jumpVyRef.current = 0;
        stateRef.current = 'normal';
        gameOverRef.current = false;
        scoreRef.current = 0;
        startTimeRef.current = Date.now();
        lastTRef.current = 0;
        if (duckTimerRef.current) { clearTimeout(duckTimerRef.current); duckTimerRef.current = null; }
        levelRef.current = buildLevel(seed);
        // Reset render state
        setWorldOff(0);
        setMarbleY(STAND_Y);
        setMarbleState('normal');
        setScore(0);
        setGameOver(false);
        setCanRetry(false);
      }
      return;
    }
    ptrStartRef.current = { x: e.clientX, y: e.clientY };
  }, [seed]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!ptrStartRef.current) return;
    const dy = e.clientY - ptrStartRef.current.y;
    ptrStartRef.current = null;
    if (dy > 28) {
      doDuck(650);
    } else {
      doJump();
    }
  }, [doJump, doDuck]);

  // ── Derived render values ─────────────────────────────────────────────────────
  const pRX = marbleState === 'ducking' ? DUCK_RX : MARBLE_R;
  const pRY = marbleState === 'ducking' ? DUCK_RY : MARBLE_R;

  const visibleObs = levelRef.current.filter((o) => {
    const sx = o.worldX - worldOff;
    return sx > -80 && sx < W + 20;
  });

  return (
    <div
      style={{ ...styles.container, width: W, height: H }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { ptrStartRef.current = null; }}
      onPointerCancel={() => { ptrStartRef.current = null; }}
    >
      {/* Score */}
      <span style={styles.scoreDisplay}>{score}</span>

      {/* Scrolling background dots for speed sense */}
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 3, height: 3,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            left: ((i * 43 + W - (worldOff * 0.3) % W) % W),
            top: 40 + i * 35,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Ground */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        top: GROUND_Y,
        height: H - GROUND_Y,
        background: '#0d2137',
        borderTop: '2px solid #2ecc71',
      }} />

      {/* Obstacles */}
      {visibleObs.map((obs, i) => {
        const sx = obs.worldX - worldOff;
        if (obs.type === 'spike') {
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: sx - SPIKE_W / 2,
                top: GROUND_Y - SPIKE_H,
                width: SPIKE_W,
                height: SPIKE_H,
                clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
                background: 'linear-gradient(180deg, #ff6b6b, #c0392b)',
                pointerEvents: 'none',
              }}
            />
          );
        } else {
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: sx - BAR_W / 2,
                top: 0,
                width: BAR_W,
                height: BAR_BOTTOM,
                background: 'linear-gradient(180deg, #8e44ad 0%, #9b59b6 70%, #ff6b6b 100%)',
                borderRadius: '0 0 8px 8px',
                pointerEvents: 'none',
              }}
            />
          );
        }
      })}

      {/* Player marble */}
      <div style={{
        position: 'absolute',
        left: PLAYER_X - pRX,
        top: marbleY - pRY,
        width: pRX * 2,
        height: pRY * 2,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 35%, #74b9e8, #2471a3)',
        boxShadow: '0 0 14px rgba(52,152,219,0.85)',
        transition: 'width 0.07s, height 0.07s, top 0.02s',
        pointerEvents: 'none',
      }} />

      {/* Game over overlay */}
      {gameOver && (
        <div style={styles.gameOverOverlay}>
          <span style={styles.gameOverTitle}>CRASHED!</span>
          <span style={styles.gameOverScore}>{score}</span>
          <span style={styles.gameOverSub}>Distance score</span>
          {bestScore > 0 && <span style={styles.gameOverBest}>Best: {bestScore}</span>}
          <span style={{ ...styles.gameOverSub, marginTop: 8, opacity: canRetry ? 1 : 0, transition: 'opacity 0.4s' }}>
            Tap to retry
          </span>
        </div>
      )}

      {!gameOver && (
        <div style={styles.hint}>
          <span>↑ Swipe up to JUMP (spike)</span>
          <span>↓ Swipe down to DUCK (bar)</span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    touchAction: 'none',
    userSelect: 'none',
    overflow: 'hidden',
    background: 'linear-gradient(180deg, #060f1e 0%, #0a192f 70%)',
    borderRadius: '14px',
    flexShrink: 0,
  },
  scoreDisplay: {
    position: 'absolute', top: 10, right: 14, zIndex: 10,
    color: '#f39c12', fontSize: '22px', fontWeight: 800,
    pointerEvents: 'none',
  },
  hint: {
    position: 'absolute', bottom: 10, left: 0, right: 0, zIndex: 5,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
    color: 'rgba(255,255,255,0.35)', fontSize: '11px', letterSpacing: '0.5px',
    pointerEvents: 'none',
  },
  gameOverOverlay: {
    position: 'absolute', inset: 0, zIndex: 20,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '6px',
    background: 'rgba(0,0,0,0.65)',
  },
  gameOverTitle: { color: '#e74c3c', fontSize: '30px', fontWeight: 900, letterSpacing: '2px' },
  gameOverScore: { color: '#f39c12', fontSize: '52px', fontWeight: 800, lineHeight: 1.1 },
  gameOverSub:   { color: '#8892b0', fontSize: '14px' },
  gameOverBest:  { color: '#2ecc71', fontSize: '13px', fontWeight: 700 },
};
