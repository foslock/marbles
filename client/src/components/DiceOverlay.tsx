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
  /** Individual dice values from server (e.g. [3, 5] for double/worst/advantage). */
  diceValues: number[] | null;
  /** Roll type from server. */
  diceType: 'normal' | 'double' | 'worst' | 'advantage';
  /** Modifier badges */
  hasDoubleDice: boolean;
  hasAdvantage: boolean;
  onRoll: () => void;
  /** Player picks a die during advantage roll. */
  onChooseAdvantage: (roll: number) => void;
  /** Fires once the die has been visibly landed for LAND_HOLD_MS. */
  onDiceSettled?: () => void;
}

// ── Physics constants ────────────────────────────────────────────────────────
const FRICTION = 0.97;
const ANGULAR_FRICTION = 0.96;
const BOUNCE = 0.4;
const GRAVITY = 0;
const DIE_SIZE = 72;
const DIE_GAP = 16; // space between two dice
const SETTLE_THRESHOLD = 0.5;
const LAND_HOLD_MS = 1000;
const FADE_DURATION = 500;
const FADE_IN_MS = 300;

// Dot positions for each face (relative to die size)
const FACE_DOTS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.5], [0.75, 0.5], [0.25, 0.75], [0.75, 0.75]],
};

type Phase = 'idle' | 'dragging' | 'rolling' | 'landed' | 'picking';

interface DieState {
  x: number; y: number;
  vx: number; vy: number;
  angle: number; angularV: number;
  face: number;
  faceTimer: number;
  settled: boolean;
  targetFace: number | null;
}

function makeDie(): DieState {
  return { x: 0, y: 0, vx: 0, vy: 0, angle: 0, angularV: 0, face: 1, faceTimer: 0, settled: false, targetFace: null };
}

export function DiceOverlay({
  isMyTurn, isSpectator, rolledValue, diceValues, diceType,
  hasDoubleDice, hasAdvantage,
  onRoll, onChooseAdvantage, onDiceSettled,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');

  // How many dice to show
  const diceCount = (diceValues && diceValues.length === 2) ? 2 : 1;
  const diceCountRef = useRef(diceCount);
  diceCountRef.current = diceCount;

  // Physics state for up to 2 dice
  const diceRef = useRef<DieState[]>([makeDie(), makeDie()]);

  // Drag gesture tracking
  const gestureRef = useRef<{
    pointerId: number;
    trail: { x: number; y: number; t: number }[];
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const rafRef = useRef(0);
  const landedAtRef = useRef(0);
  const rollingStartedAtRef = useRef(0);
  const settledFiredRef = useRef(false);
  const isMyTurnRef = useRef(isMyTurn);
  isMyTurnRef.current = isMyTurn;
  const isSpectatorRef = useRef(!!isSpectator);
  isSpectatorRef.current = !!isSpectator;
  const onDiceSettledRef = useRef(onDiceSettled);
  onDiceSettledRef.current = onDiceSettled;
  const diceTypeRef = useRef(diceType);
  diceTypeRef.current = diceType;
  const onChooseAdvantageRef = useRef(onChooseAdvantage);
  onChooseAdvantageRef.current = onChooseAdvantage;

  // Track which die was picked in advantage mode
  const [pickedDie, setPickedDie] = useState<number | null>(null);
  const pickedDieRef = useRef<number | null>(null);
  pickedDieRef.current = pickedDie;

  const isActivePlayer = () => isMyTurnRef.current && !isSpectatorRef.current;

  // Center dice based on count
  const centerDice = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const count = diceCountRef.current;
    if (count === 1) {
      diceRef.current[0].x = c.clientWidth / 2 - DIE_SIZE / 2;
      diceRef.current[0].y = c.clientHeight / 2 - DIE_SIZE / 2;
    } else {
      const totalW = DIE_SIZE * 2 + DIE_GAP;
      const startX = c.clientWidth / 2 - totalW / 2;
      diceRef.current[0].x = startX;
      diceRef.current[0].y = c.clientHeight / 2 - DIE_SIZE / 2;
      diceRef.current[1].x = startX + DIE_SIZE + DIE_GAP;
      diceRef.current[1].y = c.clientHeight / 2 - DIE_SIZE / 2;
    }
  }, []);

  const resetDice = useCallback(() => {
    centerDice();
    for (const d of diceRef.current) {
      d.vx = 0; d.vy = 0; d.angle = 0; d.angularV = 0;
      d.face = 1; d.settled = false; d.targetFace = null;
    }
    landedAtRef.current = 0;
    rollingStartedAtRef.current = 0;
    settledFiredRef.current = false;
    pickedDieRef.current = null;
    setPickedDie(null);
    phaseRef.current = 'idle';
    setPhase('idle');
  }, [centerDice]);

  useEffect(() => { centerDice(); }, [centerDice]);

  // When rolledValue/diceValues arrive from server, set target faces
  useEffect(() => {
    if (diceValues && diceValues.length > 0) {
      // Set target faces for each die
      diceRef.current[0].targetFace = diceValues[0];
      if (diceValues.length >= 2) {
        diceRef.current[1].targetFace = diceValues[1];
      }

      // Auto-roll for non-active player / spectator
      if (!isActivePlayer() && phaseRef.current === 'idle') {
        const count = diceValues.length >= 2 ? 2 : 1;
        centerDice();
        for (let i = 0; i < count; i++) {
          const d = diceRef.current[i];
          const angle = Math.random() * Math.PI * 2;
          const speed = 8 + Math.random() * 6;
          d.vx = Math.cos(angle) * speed;
          d.vy = Math.sin(angle) * speed;
          d.angularV = (Math.random() - 0.5) * 0.4;
          d.settled = false;
        }
        rollingStartedAtRef.current = performance.now();
        phaseRef.current = 'rolling';
        setPhase('rolling');
        SFX.diceRoll();
        Haptics.diceRoll();
      }
    } else if (rolledValue == null) {
      if (phaseRef.current === 'landed' || phaseRef.current === 'picking') {
        resetDice();
      }
    }
  }, [diceValues, rolledValue, centerDice, resetDice]); // eslint-disable-line react-hooks/exhaustive-deps

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

      const now = performance.now();
      const active = isActivePlayer();
      const count = diceCountRef.current;
      const currentPhase = phaseRef.current;

      // ── Physics step for each die ────────────────────────────────────────
      if (currentPhase === 'rolling') {
        let allSettled = true;
        for (let i = 0; i < count; i++) {
          const d = diceRef.current[i];
          if (d.settled) continue;

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

          // Cycle face
          const dieSpeed = Math.hypot(d.vx, d.vy);
          d.faceTimer++;
          const interval = Math.max(2, Math.round(12 - dieSpeed * 0.8));
          if (d.faceTimer % interval === 0) {
            d.face = Math.floor(Math.random() * 6) + 1;
          }

          // Check settled
          if (dieSpeed < SETTLE_THRESHOLD && Math.abs(d.angularV) < 0.02) {
            if (d.targetFace != null) {
              d.face = d.targetFace;
              d.vx = 0; d.vy = 0; d.angularV = 0;
              d.settled = true;
            } else {
              // Keep nudging if no target yet
              d.vx += (Math.random() - 0.5) * 2;
              d.vy += (Math.random() - 0.5) * 2;
            }
          }

          if (!d.settled) allSettled = false;
        }

        if (allSettled) {
          const dtype = diceTypeRef.current;
          if (dtype === 'advantage' && active) {
            // Advantage: go to picking phase — player taps a die
            phaseRef.current = 'picking';
            setPhase('picking');
            SFX.diceResult();
            Haptics.medium();
          } else {
            phaseRef.current = 'landed';
            setPhase('landed');
            landedAtRef.current = now;
            settledFiredRef.current = false;
            SFX.diceResult();
            Haptics.medium();
          }
        }
      }

      // While dragging, cycle face for visual feedback
      if (currentPhase === 'dragging') {
        const d = diceRef.current[0];
        d.faceTimer++;
        if (d.faceTimer % 6 === 0) {
          d.face = Math.floor(Math.random() * 6) + 1;
        }
        d.angle += 0.03;
        // Mirror for second die if present
        if (count === 2) {
          const d2 = diceRef.current[1];
          d2.faceTimer++;
          if (d2.faceTimer % 6 === 0) {
            d2.face = Math.floor(Math.random() * 6) + 1;
          }
          d2.angle += 0.03;
        }
      }

      // ── Fire settled callback ────────────────────────────────────────────
      if (currentPhase === 'landed' && landedAtRef.current > 0 && !settledFiredRef.current) {
        if (now - landedAtRef.current >= LAND_HOLD_MS + FADE_DURATION) {
          settledFiredRef.current = true;
          onDiceSettledRef.current?.();
        }
      }

      // ── Compute opacity ──────────────────────────────────────────────────
      let opacity = 0;

      if (active) {
        opacity = 1;
        if (currentPhase === 'landed' && landedAtRef.current > 0) {
          const elapsed = now - landedAtRef.current;
          if (elapsed > LAND_HOLD_MS) {
            opacity = Math.max(0, 1 - (elapsed - LAND_HOLD_MS) / FADE_DURATION);
          }
        }
      } else {
        if (currentPhase === 'idle') {
          opacity = 0;
        } else if (currentPhase === 'rolling') {
          const elapsed = rollingStartedAtRef.current > 0
            ? now - rollingStartedAtRef.current : FADE_IN_MS;
          opacity = Math.min(1, elapsed / FADE_IN_MS);
        } else if (currentPhase === 'landed' || currentPhase === 'picking') {
          opacity = 1;
          if (currentPhase === 'landed' && landedAtRef.current > 0) {
            const elapsed = now - landedAtRef.current;
            if (elapsed > LAND_HOLD_MS) {
              opacity = Math.max(0, 1 - (elapsed - LAND_HOLD_MS) / FADE_DURATION);
            }
          }
        }
      }

      if (opacity <= 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // ── Pulsing glow for idle active player ──────────────────────────────
      const showPrompt = currentPhase === 'idle' && active;
      let glowRadius = 0;
      if (showPrompt) {
        glowRadius = 8 + 10 * Math.abs(Math.sin(now / 750 * Math.PI));
      }

      // ── Draw each die ────────────────────────────────────────────────────
      ctx.globalAlpha = opacity;

      for (let i = 0; i < count; i++) {
        const d = diceRef.current[i];
        const cx = d.x + DIE_SIZE / 2;
        const cy = d.y + DIE_SIZE / 2;

        const isAnimating = currentPhase === 'rolling' || currentPhase === 'dragging';
        const isPicked = pickedDieRef.current === i;
        const isNotPicked = currentPhase === 'picking' && pickedDieRef.current != null && !isPicked;
        // Dim the unpicked die
        const dieAlpha = isNotPicked ? 0.3 : 1;

        ctx.save();
        ctx.globalAlpha = opacity * dieAlpha;
        ctx.translate(cx, cy);
        ctx.rotate(isAnimating && !d.settled ? d.angle : 0);

        const half = DIE_SIZE / 2;
        const cornerR = 10;

        // Pulsing glow for idle (only on first die)
        if (glowRadius > 0 && i === 0) {
          ctx.shadowColor = '#f39c12';
          ctx.shadowBlur = glowRadius;
          ctx.beginPath();
          ctx.roundRect(-half, -half, DIE_SIZE, DIE_SIZE, cornerR);
          ctx.fillStyle = 'rgba(243, 156, 18, 0.15)';
          ctx.fill();
          ctx.shadowColor = 'transparent';
        }

        // Picking glow on hovered die
        if (currentPhase === 'picking' && active && pickedDieRef.current == null) {
          ctx.shadowColor = '#f39c12';
          ctx.shadowBlur = 6 + 6 * Math.abs(Math.sin(now / 500 * Math.PI));
        } else {
          // Drop shadow
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = currentPhase === 'dragging' ? 24 : 16;
          ctx.shadowOffsetY = currentPhase === 'dragging' ? 8 : 4;
        }

        // Die body
        ctx.beginPath();
        ctx.roundRect(-half, -half, DIE_SIZE, DIE_SIZE, cornerR);
        if (currentPhase === 'landed' || currentPhase === 'picking') {
          ctx.fillStyle = isPicked ? '#0d4d1a' : '#1a5c2a';
        } else if (currentPhase === 'rolling') {
          ctx.fillStyle = '#7f1d1d';
        } else if (currentPhase === 'dragging') {
          ctx.fillStyle = '#4a2c0a';
        } else {
          ctx.fillStyle = '#f8f8f0';
        }
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Border
        let borderColor: string;
        if (isPicked) {
          borderColor = '#00ff88';
        } else if (currentPhase === 'landed' || currentPhase === 'picking') {
          borderColor = '#2ecc71';
        } else if (currentPhase === 'rolling') {
          borderColor = '#e74c3c';
        } else if (currentPhase === 'dragging') {
          borderColor = '#f39c12';
        } else {
          borderColor = '#d4a017';
        }
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isPicked ? 4 : 3;
        ctx.stroke();

        // Dots
        const dots = FACE_DOTS[d.face] || FACE_DOTS[1];
        const dotR = DIE_SIZE * 0.09;
        const dotColor = currentPhase === 'idle' ? '#1a1a2e' : '#fff';

        for (const [px, py] of dots) {
          ctx.beginPath();
          ctx.arc(-half + px * DIE_SIZE, -half + py * DIE_SIZE, dotR, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.fill();
        }

        // Rolled number below die when landed/picking
        if ((currentPhase === 'landed' || currentPhase === 'picking') && d.targetFace != null) {
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = isPicked ? '#00ff88' : '#2ecc71';
          ctx.fillText(String(d.targetFace), 0, half + 18);
        }

        ctx.restore();
      }

      // ── Label text ───────────────────────────────────────────────────────
      ctx.globalAlpha = opacity;
      const dtype = diceTypeRef.current;

      if (currentPhase === 'landed' && count === 2) {
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        const labelY = diceRef.current[0].y - 12;
        if (dtype === 'double') {
          const sum = (diceRef.current[0].targetFace || 0) + (diceRef.current[1].targetFace || 0);
          ctx.fillStyle = '#3498db';
          ctx.fillText(`Sum: ${sum}`, w / 2, labelY);
        } else if (dtype === 'advantage') {
          ctx.fillStyle = '#2ecc71';
          ctx.fillText('Pick one!', w / 2, labelY);
        }
      }

      if (currentPhase === 'picking') {
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        const hintAlpha = 0.6 + 0.4 * Math.abs(Math.sin(now / 750 * Math.PI));
        ctx.fillStyle = `rgba(243, 156, 18, ${hintAlpha})`;
        if (pickedDieRef.current == null) {
          ctx.fillText('Tap a die to pick it!', w / 2, diceRef.current[0].y + DIE_SIZE + 40);
        }
      }

      // ── Hint text (only for active player in idle) ───────────────────────
      if (showPrompt) {
        const hintAlpha = 0.6 + 0.4 * Math.abs(Math.sin(now / 750 * Math.PI));
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(243, 156, 18, ${hintAlpha})`;
        ctx.fillText('Roll Dice', w / 2, diceRef.current[0].y + DIE_SIZE + 26);
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
    if (!isMyTurn || isSpectator) return;

    // Handle advantage pick — tap a die during picking phase
    if (phaseRef.current === 'picking' && pickedDieRef.current == null) {
      const pos = getCanvasPos(e.clientX, e.clientY);
      const count = diceCountRef.current;
      for (let i = 0; i < count; i++) {
        const d = diceRef.current[i];
        if (pos.x >= d.x && pos.x <= d.x + DIE_SIZE && pos.y >= d.y && pos.y <= d.y + DIE_SIZE) {
          const chosenRoll = d.targetFace || 1;
          pickedDieRef.current = i;
          setPickedDie(i);
          SFX.diceResult();
          Haptics.medium();
          onChooseAdvantageRef.current(chosenRoll);
          // Transition to landed after a brief moment
          setTimeout(() => {
            phaseRef.current = 'landed';
            setPhase('landed');
            landedAtRef.current = performance.now();
            settledFiredRef.current = false;
          }, 300);
          return;
        }
      }
      return;
    }

    if (phaseRef.current !== 'idle') return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pos = getCanvasPos(e.clientX, e.clientY);
    const d = diceRef.current[0];
    gestureRef.current = {
      pointerId: e.pointerId,
      trail: [{ x: pos.x, y: pos.y, t: performance.now() }],
      offsetX: pos.x - (d.x + DIE_SIZE / 2),
      offsetY: pos.y - (d.y + DIE_SIZE / 2),
    };
    phaseRef.current = 'dragging';
    setPhase('dragging');
  }, [isMyTurn, isSpectator, getCanvasPos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId || phaseRef.current !== 'dragging') return;
    const pos = getCanvasPos(e.clientX, e.clientY);
    const now = performance.now();

    diceRef.current[0].x = pos.x - g.offsetX - DIE_SIZE / 2;
    diceRef.current[0].y = pos.y - g.offsetY - DIE_SIZE / 2;

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

    const pos = getCanvasPos(e.clientX, e.clientY);
    const now = performance.now();
    g.trail.push({ x: pos.x, y: pos.y, t: now });

    const oldest = g.trail[0];
    const dt = Math.max(1, (now - oldest.t)) / 1000;
    const dx = pos.x - oldest.x;
    const dy = pos.y - oldest.y;
    const flickSpeed = Math.hypot(dx, dy) / dt;

    const count = diceCountRef.current;
    for (let i = 0; i < count; i++) {
      const d = diceRef.current[i];
      d.settled = false;
      if (flickSpeed > 100) {
        const norm = Math.hypot(dx, dy) || 1;
        const s = Math.min(20, flickSpeed / 60);
        // Add slight offset for second die so they don't overlap
        const angleOffset = i === 0 ? 0 : (Math.random() - 0.5) * 0.5;
        d.vx = (dx / norm) * s + (i === 1 ? (Math.random() - 0.5) * 4 : 0);
        d.vy = (dy / norm) * s + (i === 1 ? (Math.random() - 0.5) * 4 : 0);
      } else {
        const angle = Math.random() * Math.PI * 2;
        const s = 10 + Math.random() * 5;
        d.vx = Math.cos(angle) * s;
        d.vy = Math.sin(angle) * s;
      }
      d.angularV = (Math.random() - 0.5) * 0.5;
    }

    rollingStartedAtRef.current = now;
    phaseRef.current = 'rolling';
    setPhase('rolling');
    SFX.diceRoll();
    Haptics.diceRoll();
    onRoll();
  }, [isMyTurn, onRoll, getCanvasPos]);

  const interactive = isMyTurn && !isSpectator && (phase === 'idle' || phase === 'dragging' || phase === 'picking');

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
      {/* Modifier badges — only while rolling/landed so non-active players see them */}
      {(phase === 'rolling' || phase === 'landed' || phase === 'picking' || (isMyTurn && !isSpectator)) && (
        <div style={styles.modifiers}>
          {hasDoubleDice && <span style={styles.modBadge}>🎲🎲 Double!</span>}
          {hasAdvantage && <span style={styles.modBadgeGreen}>🎯 Advantage!</span>}
        </div>
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
  modBadgeGreen: {
    background: 'rgba(46, 204, 113, 0.25)',
    color: '#2ecc71',
    padding: '4px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    backdropFilter: 'blur(4px)',
  },
};
