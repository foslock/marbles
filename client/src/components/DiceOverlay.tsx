import { useState, useRef, useEffect, useCallback } from 'react';
import { SFX } from '../utils/sound';
import { Haptics } from '../utils/haptics';

interface Props {
  /** When true the die is interactive (flick to roll). */
  isMyTurn: boolean;
  /** True when the viewer is a spectator (sees rolls, never sees prompt). */
  isSpectator?: boolean;
  /** After server responds, the final face to land on. null = not rolled yet. */
  rolledValue: number | null;
  /** Modifier badges */
  hasDoubleDice: boolean;
  hasWorstDice: boolean;
  hasRerolls: boolean;
  onRoll: (useReroll?: boolean) => void;
  /** Fires once the die has been visibly landed for LAND_HOLD_MS. */
  onDiceSettled?: () => void;
}

// ── Physics constants ────────────────────────────────────────────────────────
const FRICTION = 0.985;
const ANGULAR_FRICTION = 0.98;
const BOUNCE = 0.55;
const GRAVITY = 0;
const DIE_SIZE = 72;
const SETTLE_THRESHOLD = 0.4;
const LAND_HOLD_MS = 1000;   // minimum time the die stays visible after landing
const FADE_DURATION = 500;   // ms for the fade-out after hold

// Dot positions for each face (relative to die size)
const FACE_DOTS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.5], [0.75, 0.5], [0.25, 0.75], [0.75, 0.75]],
};

type Phase = 'idle' | 'dragging' | 'rolling' | 'landed';

export function DiceOverlay({
  isMyTurn, isSpectator, rolledValue, hasDoubleDice, hasWorstDice, hasRerolls,
  onRoll, onDiceSettled,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');

  // Physics state
  const dieRef = useRef({
    x: 0, y: 0,
    vx: 0, vy: 0,
    angle: 0, angularV: 0,
    face: 1,
    faceTimer: 0,
  });

  // Drag gesture tracking — stores recent positions for velocity calculation
  const gestureRef = useRef<{
    pointerId: number;
    // Ring buffer of recent positions (last ~5 frames) for velocity
    trail: { x: number; y: number; t: number }[];
    offsetX: number; // offset from die center at grab time
    offsetY: number;
  } | null>(null);

  const rafRef = useRef(0);
  const targetFaceRef = useRef<number | null>(null);
  const settleCounterRef = useRef(0);
  const landedAtRef = useRef(0);
  const settledFiredRef = useRef(false);
  const isMyTurnRef = useRef(isMyTurn);
  isMyTurnRef.current = isMyTurn;
  const isSpectatorRef = useRef(!!isSpectator);
  isSpectatorRef.current = !!isSpectator;
  const onDiceSettledRef = useRef(onDiceSettled);
  onDiceSettledRef.current = onDiceSettled;

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
    landedAtRef.current = 0;
    settledFiredRef.current = false;
    phaseRef.current = 'idle';
    setPhase('idle');
  }, [centerDie]);

  // Initialize
  useEffect(() => {
    centerDie();
  }, [centerDie]);

  // When rolledValue arrives from server, set target face
  useEffect(() => {
    if (rolledValue != null && rolledValue >= 1) {
      targetFaceRef.current = rolledValue;

      // Auto-roll for non-active player: kick the die into motion
      if (!isMyTurnRef.current && phaseRef.current === 'idle') {
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
    } else {
      targetFaceRef.current = null;
      if (phaseRef.current === 'landed') {
        resetDie();
      }
    }
  }, [rolledValue, centerDie, resetDie]);

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
      const now = performance.now();

      // ── Physics step (only when rolling freely, not dragging) ────────────
      if (phaseRef.current === 'rolling') {
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

        // Cycle face randomly while moving
        d.faceTimer++;
        if (d.faceTimer % 4 === 0) {
          d.face = Math.floor(Math.random() * 6) + 1;
        }

        // Check if settled
        const speed = Math.hypot(d.vx, d.vy);
        if (speed < SETTLE_THRESHOLD && Math.abs(d.angularV) < 0.02) {
          if (targetFaceRef.current != null) {
            d.face = targetFaceRef.current;
            d.vx = 0; d.vy = 0; d.angularV = 0;
            phaseRef.current = 'landed';
            setPhase('landed');
            landedAtRef.current = now;
            settledFiredRef.current = false;
            SFX.diceResult();
            Haptics.medium();
          } else {
            // Waiting for server — keep rolling gently
            settleCounterRef.current++;
            if (settleCounterRef.current > 60) {
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

      // While dragging, cycle the face for visual feedback
      if (phaseRef.current === 'dragging') {
        d.faceTimer++;
        if (d.faceTimer % 6 === 0) {
          d.face = Math.floor(Math.random() * 6) + 1;
        }
        d.angle += 0.03; // slow spin while held
      }

      // ── Fire settled callback after hold period ──────────────────────────
      if (phaseRef.current === 'landed' && landedAtRef.current > 0 && !settledFiredRef.current) {
        if (now - landedAtRef.current >= LAND_HOLD_MS) {
          settledFiredRef.current = true;
          onDiceSettledRef.current?.();
        }
      }

      // ── Compute opacity ──────────────────────────────────────────────────
      let opacity = 1;
      if (phaseRef.current === 'landed' && landedAtRef.current > 0) {
        const elapsed = now - landedAtRef.current;
        if (elapsed > LAND_HOLD_MS) {
          opacity = Math.max(0, 1 - (elapsed - LAND_HOLD_MS) / FADE_DURATION);
        }
      }
      // Semi-transparent when idle and not my turn
      if (phaseRef.current === 'idle' && !isMyTurnRef.current) {
        opacity = 0.35;
      }

      if (opacity <= 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // ── Pulsing glow for idle active player ──────────────────────────────
      const showPrompt = phaseRef.current === 'idle' && isMyTurnRef.current && !isSpectatorRef.current;
      let glowRadius = 0;
      if (showPrompt) {
        glowRadius = 8 + 10 * Math.abs(Math.sin(now / 750 * Math.PI));
      }

      // ── Draw die ─────────────────────────────────────────────────────────
      ctx.globalAlpha = opacity;
      const cx = d.x + DIE_SIZE / 2;
      const cy = d.y + DIE_SIZE / 2;

      ctx.save();
      ctx.translate(cx, cy);
      const isAnimating = phaseRef.current === 'rolling' || phaseRef.current === 'dragging';
      ctx.rotate(isAnimating ? d.angle : 0);

      const half = DIE_SIZE / 2;
      const cornerR = 10;

      // Pulsing glow behind the die
      if (glowRadius > 0) {
        ctx.shadowColor = '#f39c12';
        ctx.shadowBlur = glowRadius;
        ctx.beginPath();
        ctx.roundRect(-half, -half, DIE_SIZE, DIE_SIZE, cornerR);
        ctx.fillStyle = 'rgba(243, 156, 18, 0.15)';
        ctx.fill();
        ctx.shadowColor = 'transparent';
      }

      // Drop shadow
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = phaseRef.current === 'dragging' ? 24 : 16;
      ctx.shadowOffsetY = phaseRef.current === 'dragging' ? 8 : 4;

      // Die body
      ctx.beginPath();
      ctx.roundRect(-half, -half, DIE_SIZE, DIE_SIZE, cornerR);
      if (phaseRef.current === 'landed') {
        ctx.fillStyle = '#1a5c2a';
      } else if (phaseRef.current === 'rolling') {
        ctx.fillStyle = '#7f1d1d';
      } else if (phaseRef.current === 'dragging') {
        ctx.fillStyle = '#4a2c0a';
      } else {
        ctx.fillStyle = '#f8f8f0';
      }
      ctx.fill();

      ctx.shadowColor = 'transparent';

      // Border
      const borderColor = phaseRef.current === 'landed' ? '#2ecc71'
        : phaseRef.current === 'rolling' ? '#e74c3c'
        : phaseRef.current === 'dragging' ? '#f39c12'
        : '#d4a017';
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Dots
      const dots = FACE_DOTS[d.face] || FACE_DOTS[1];
      const dotR = DIE_SIZE * 0.09;
      const dotColor = phaseRef.current === 'idle' && isMyTurnRef.current ? '#1a1a2e'
        : phaseRef.current === 'idle' ? '#555'
        : '#fff';

      for (const [px, py] of dots) {
        ctx.beginPath();
        ctx.arc(-half + px * DIE_SIZE, -half + py * DIE_SIZE, dotR, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();
      }

      // Rolled number below die when landed
      if (phaseRef.current === 'landed' && targetFaceRef.current != null) {
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#2ecc71';
        ctx.fillText(String(targetFaceRef.current), 0, half + 18);
      }

      ctx.restore();

      // ── Hint text ────────────────────────────────────────────────────────
      if (showPrompt) {
        const hintAlpha = 0.6 + 0.4 * Math.abs(Math.sin(now / 750 * Math.PI));
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(243, 156, 18, ${hintAlpha})`;
        ctx.fillText('Roll Die', w / 2, d.y + DIE_SIZE + 26);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Gesture handlers (grab → drag → flick) ─────────────────────────────
  const getCanvasPos = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isMyTurn || phaseRef.current !== 'idle') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pos = getCanvasPos(e.clientX, e.clientY);
    const d = dieRef.current;
    gestureRef.current = {
      pointerId: e.pointerId,
      trail: [{ x: pos.x, y: pos.y, t: performance.now() }],
      offsetX: pos.x - (d.x + DIE_SIZE / 2),
      offsetY: pos.y - (d.y + DIE_SIZE / 2),
    };
    phaseRef.current = 'dragging';
    setPhase('dragging');
  }, [isMyTurn, getCanvasPos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId || phaseRef.current !== 'dragging') return;
    const pos = getCanvasPos(e.clientX, e.clientY);
    const now = performance.now();

    // Move die to follow finger (offset so it doesn't jump)
    dieRef.current.x = pos.x - g.offsetX - DIE_SIZE / 2;
    dieRef.current.y = pos.y - g.offsetY - DIE_SIZE / 2;

    // Keep a short trail for velocity calculation (last 5 points)
    g.trail.push({ x: pos.x, y: pos.y, t: now });
    if (g.trail.length > 5) g.trail.shift();
  }, [getCanvasPos]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gestureRef.current = null;

    if (phaseRef.current !== 'dragging' || !isMyTurn) {
      phaseRef.current = 'idle';
      setPhase('idle');
      return;
    }

    // Calculate flick velocity from recent trail
    const pos = getCanvasPos(e.clientX, e.clientY);
    const now = performance.now();
    g.trail.push({ x: pos.x, y: pos.y, t: now });

    const oldest = g.trail[0];
    const dt = Math.max(1, (now - oldest.t)) / 1000; // seconds
    const dx = pos.x - oldest.x;
    const dy = pos.y - oldest.y;
    const flickSpeed = Math.hypot(dx, dy) / dt;

    const d = dieRef.current;
    if (flickSpeed > 100) {
      // Real flick — use direction and speed
      const norm = Math.hypot(dx, dy) || 1;
      const s = Math.min(20, flickSpeed / 60);
      d.vx = (dx / norm) * s;
      d.vy = (dy / norm) * s;
    } else {
      // Weak flick / tap — give random push
      const angle = Math.random() * Math.PI * 2;
      const s = 10 + Math.random() * 5;
      d.vx = Math.cos(angle) * s;
      d.vy = Math.sin(angle) * s;
    }

    d.angularV = (Math.random() - 0.5) * 0.5;
    phaseRef.current = 'rolling';
    setPhase('rolling');
    SFX.diceRoll();
    Haptics.diceRoll();
    onRoll(false);
  }, [isMyTurn, onRoll, getCanvasPos]);

  // Only capture pointer events when interactive (idle or dragging + my turn)
  const interactive = isMyTurn && (phase === 'idle' || phase === 'dragging');

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
            const d = dieRef.current;
            const angle = Math.random() * Math.PI * 2;
            const s = 10 + Math.random() * 5;
            d.vx = Math.cos(angle) * s;
            d.vy = Math.sin(angle) * s;
            d.angularV = (Math.random() - 0.5) * 0.5;
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
