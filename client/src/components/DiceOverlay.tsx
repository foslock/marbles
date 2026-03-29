import { useState, useRef, useEffect, useCallback } from 'react';
import { SFX } from '../utils/sound';
import { Haptics } from '../utils/haptics';

interface Props {
  /** When true the die is interactive (flick to roll). */
  isMyTurn: boolean;
  /** After server responds, the final face to land on. null = not rolled yet. */
  rolledValue: number | null;
  /** Modifier badges */
  hasDoubleDice: boolean;
  hasWorstDice: boolean;
  hasRerolls: boolean;
  onRoll: (useReroll?: boolean) => void;
}

// ── Physics constants ────────────────────────────────────────────────────────
const FRICTION = 0.985;
const ANGULAR_FRICTION = 0.98;
const BOUNCE = 0.55;
const GRAVITY = 0;
const DIE_SIZE = 72;
const SETTLE_THRESHOLD = 0.4;  // velocity below which we consider settled
const MIN_FLICK_SPEED = 4;

// Dot positions for each face (relative to die size)
const FACE_DOTS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.5], [0.75, 0.5], [0.25, 0.75], [0.75, 0.75]],
};

type Phase = 'idle' | 'rolling' | 'settling' | 'landed';

export function DiceOverlay({ isMyTurn, rolledValue, hasDoubleDice, hasWorstDice, hasRerolls, onRoll }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [displayFace, setDisplayFace] = useState(1);
  const phaseRef = useRef<Phase>('idle');
  const rolledRef = useRef(false);

  // Physics state
  const dieRef = useRef({
    x: 0, y: 0,
    vx: 0, vy: 0,
    angle: 0, angularV: 0,
    face: 1,
    faceTimer: 0,
  });

  // Flick gesture tracking
  const gestureRef = useRef<{
    pointerId: number;
    startX: number; startY: number;
    lastX: number; lastY: number;
    startTime: number; lastTime: number;
  } | null>(null);

  const rafRef = useRef(0);
  const targetFaceRef = useRef<number | null>(null);
  const settleCounterRef = useRef(0);

  // Center the die when container size is known
  const centerDie = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    dieRef.current.x = c.clientWidth / 2 - DIE_SIZE / 2;
    dieRef.current.y = c.clientHeight / 2 - DIE_SIZE / 2;
  }, []);

  // Reset to idle state
  const resetDie = useCallback(() => {
    centerDie();
    const d = dieRef.current;
    d.vx = 0; d.vy = 0; d.angle = 0; d.angularV = 0;
    d.face = 1;
    settleCounterRef.current = 0;
    targetFaceRef.current = null;
    rolledRef.current = false;
    phaseRef.current = 'idle';
    setPhase('idle');
    setDisplayFace(1);
  }, [centerDie]);

  // Initialize
  useEffect(() => {
    centerDie();
  }, [centerDie]);

  // When rolledValue arrives from server, set target face
  useEffect(() => {
    if (rolledValue != null && rolledValue >= 1) {
      targetFaceRef.current = rolledValue;
    } else {
      targetFaceRef.current = null;
      if (phaseRef.current === 'landed') {
        resetDie();
      }
    }
  }, [rolledValue, resetDie]);

  // Auto-roll for non-active player when their dice result arrives
  useEffect(() => {
    if (!isMyTurn && rolledValue != null && rolledValue >= 1 && phaseRef.current === 'idle') {
      // Auto animate: give the die a random velocity
      const d = dieRef.current;
      centerDie();
      const angle = Math.random() * Math.PI * 2;
      const speed = 8 + Math.random() * 6;
      d.vx = Math.cos(angle) * speed;
      d.vy = Math.sin(angle) * speed;
      d.angularV = (Math.random() - 0.5) * 0.4;
      phaseRef.current = 'rolling';
      setPhase('rolling');
      SFX.diceRoll();
      Haptics.diceRoll();
    }
  }, [isMyTurn, rolledValue, centerDie]);

  // ── Physics loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const c = containerRef.current;
      const canvas = canvasRef.current;
      if (!c || !canvas) { rafRef.current = requestAnimationFrame(tick); return; }

      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }

      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const d = dieRef.current;
      const isMoving = phaseRef.current === 'rolling' || phaseRef.current === 'settling';

      if (isMoving) {
        d.vy += GRAVITY;
        d.x += d.vx;
        d.y += d.vy;
        d.vx *= FRICTION;
        d.vy *= FRICTION;
        d.angle += d.angularV;
        d.angularV *= ANGULAR_FRICTION;

        // Bounce off walls
        if (d.x < 0) { d.x = 0; d.vx = -d.vx * BOUNCE; d.angularV += (Math.random() - 0.5) * 0.1; }
        if (d.x + DIE_SIZE > w) { d.x = w - DIE_SIZE; d.vx = -d.vx * BOUNCE; d.angularV += (Math.random() - 0.5) * 0.1; }
        if (d.y < 0) { d.y = 0; d.vy = -d.vy * BOUNCE; d.angularV += (Math.random() - 0.5) * 0.1; }
        if (d.y + DIE_SIZE > h) { d.y = h - DIE_SIZE; d.vy = -d.vy * BOUNCE; d.angularV += (Math.random() - 0.5) * 0.1; }

        // Cycle face randomly while moving fast
        d.faceTimer++;
        if (d.faceTimer % 4 === 0) {
          d.face = Math.floor(Math.random() * 6) + 1;
          setDisplayFace(d.face);
        }

        // Check if settled
        const speed = Math.hypot(d.vx, d.vy);
        if (speed < SETTLE_THRESHOLD && Math.abs(d.angularV) < 0.02) {
          if (targetFaceRef.current != null) {
            // Server result is in — snap to final face
            d.face = targetFaceRef.current;
            setDisplayFace(targetFaceRef.current);
            d.vx = 0; d.vy = 0; d.angularV = 0;
            phaseRef.current = 'landed';
            setPhase('landed');
            SFX.diceResult();
            Haptics.medium();
          } else {
            // Waiting for server — keep rolling gently
            settleCounterRef.current++;
            if (settleCounterRef.current > 60) {
              // Give it a little nudge so it doesn't look frozen
              d.vx += (Math.random() - 0.5) * 2;
              d.vy += (Math.random() - 0.5) * 2;
              d.angularV += (Math.random() - 0.5) * 0.1;
              settleCounterRef.current = 0;
            }
          }
        } else {
          settleCounterRef.current = 0;
        }
      }

      // ── Draw die ───────────────────────────────────────────────────────────
      const cx = d.x + DIE_SIZE / 2;
      const cy = d.y + DIE_SIZE / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(isMoving ? d.angle : 0);

      const half = DIE_SIZE / 2;
      const r = 10; // corner radius

      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;

      // Die body
      ctx.beginPath();
      ctx.roundRect(-half, -half, DIE_SIZE, DIE_SIZE, r);
      if (phaseRef.current === 'landed') {
        ctx.fillStyle = '#1a5c2a';
      } else if (isMoving) {
        ctx.fillStyle = '#7f1d1d';
      } else {
        ctx.fillStyle = '#f8f8f0';
      }
      ctx.fill();

      ctx.shadowColor = 'transparent';

      // Border
      ctx.strokeStyle = phaseRef.current === 'landed' ? '#2ecc71' : (isMoving ? '#e74c3c' : '#d4a017');
      ctx.lineWidth = 3;
      ctx.stroke();

      // Dots
      const face = d.face;
      const dots = FACE_DOTS[face] || FACE_DOTS[1];
      const dotR = DIE_SIZE * 0.09;
      const dotColor = phaseRef.current === 'landed' || isMoving ? '#fff' : '#1a1a2e';

      for (const [px, py] of dots) {
        ctx.beginPath();
        ctx.arc(-half + px * DIE_SIZE, -half + py * DIE_SIZE, dotR, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();
      }

      // Rolled number overlay when landed
      if (phaseRef.current === 'landed' && targetFaceRef.current != null) {
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#2ecc71';
        ctx.fillText(String(targetFaceRef.current), 0, half + 18);
      }

      ctx.restore();

      // Hint text
      if (phaseRef.current === 'idle' && isMyTurn) {
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(243, 156, 18, 0.8)';
        ctx.fillText('Flick to roll!', w / 2, d.y + DIE_SIZE + 24);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Gesture handlers ────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isMyTurn || phaseRef.current !== 'idle') return;
    const d = dieRef.current;
    // Check if touch is on the die
    if (
      e.clientX >= d.x && e.clientX <= d.x + DIE_SIZE &&
      e.clientY >= d.y && e.clientY <= d.y + DIE_SIZE
    ) {
      // On desktop the die position is relative to canvas, need to adjust
    }
    // Accept flick from anywhere
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      lastX: e.clientX, lastY: e.clientY,
      startTime: performance.now(), lastTime: performance.now(),
    };
  }, [isMyTurn]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!gestureRef.current || gestureRef.current.pointerId !== e.pointerId) return;
    gestureRef.current.lastX = e.clientX;
    gestureRef.current.lastY = e.clientY;
    gestureRef.current.lastTime = performance.now();
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!gestureRef.current || gestureRef.current.pointerId !== e.pointerId) return;
    const g = gestureRef.current;
    gestureRef.current = null;

    if (phaseRef.current !== 'idle' || !isMyTurn) return;

    const dt = Math.max(1, performance.now() - g.startTime) / 1000;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const speed = Math.hypot(dx, dy) / dt;

    if (speed < MIN_FLICK_SPEED * 50) {
      // Too slow — treat as tap → roll with default velocity
      const angle = Math.random() * Math.PI * 2;
      const s = 10 + Math.random() * 5;
      dieRef.current.vx = Math.cos(angle) * s;
      dieRef.current.vy = Math.sin(angle) * s;
    } else {
      // Use flick direction and speed
      const norm = Math.hypot(dx, dy) || 1;
      const s = Math.min(20, speed / 60);
      dieRef.current.vx = (dx / norm) * s;
      dieRef.current.vy = (dy / norm) * s;
    }

    dieRef.current.angularV = (Math.random() - 0.5) * 0.5;
    phaseRef.current = 'rolling';
    setPhase('rolling');
    rolledRef.current = true;
    SFX.diceRoll();
    Haptics.diceRoll();
    onRoll(false);
  }, [isMyTurn, onRoll]);

  // Only capture pointer events when interactive (idle + my turn)
  const interactive = isMyTurn && phase === 'idle';

  return (
    <div ref={containerRef} style={{ ...styles.container, pointerEvents: interactive ? 'auto' : 'none' }}>
      <canvas
        ref={canvasRef}
        style={styles.canvas}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      {/* Modifier badges */}
      <div style={styles.modifiers}>
        {hasDoubleDice && <span style={styles.modBadge}>🎲🎲 Double!</span>}
        {hasWorstDice && <span style={styles.modBadgeRed}>🎲↓ Worst!</span>}
      </div>
      {/* Re-roll button */}
      {isMyTurn && hasRerolls && phase === 'idle' && (
        <button
          style={{ ...styles.rerollBtn, pointerEvents: 'auto' }}
          onClick={() => {
            const angle = Math.random() * Math.PI * 2;
            const s = 10 + Math.random() * 5;
            dieRef.current.vx = Math.cos(angle) * s;
            dieRef.current.vy = Math.sin(angle) * s;
            dieRef.current.angularV = (Math.random() - 0.5) * 0.5;
            phaseRef.current = 'rolling';
            setPhase('rolling');
            SFX.diceRoll();
            Haptics.diceRoll();
            onRoll(true);
          }}
        >
          Use Re-roll
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    inset: 0,
    zIndex: 15,
    touchAction: 'none',
    pointerEvents: 'auto',
  },
  canvas: {
    width: '100%',
    height: '100%',
    display: 'block',
  },
  modifiers: {
    position: 'absolute',
    top: 8,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '8px',
    pointerEvents: 'none',
  },
  modBadge: {
    background: 'rgba(52, 152, 219, 0.25)',
    color: '#3498db',
    padding: '4px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    backdropFilter: 'blur(4px)',
  },
  modBadgeRed: {
    background: 'rgba(231, 76, 60, 0.25)',
    color: '#e74c3c',
    padding: '4px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    backdropFilter: 'blur(4px)',
  },
  rerollBtn: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 20px',
    borderRadius: '10px',
    border: '2px solid #9b59b6',
    background: 'rgba(17, 34, 64, 0.9)',
    color: '#9b59b6',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    backdropFilter: 'blur(4px)',
  },
};
