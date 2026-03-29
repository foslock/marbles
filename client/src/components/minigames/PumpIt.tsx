import { useState, useRef, useEffect, useCallback } from 'react';
import type { MinigameComponentProps } from './types';
import { SFX } from '../../utils/sound';

// ── Tuning ────────────────────────────────────────────────────────────────────
const HANDLE_TRAVEL = 80;   // px the handle moves top to bottom
const AIR_PER_PX    = 0.8;  // air added per px of downward handle movement
const LEAK_RATE     = 11;   // air units / second (stops pumping → deflates in ~18 s from max)
const MAX_AIR       = 200;  // balloon can inflate past "100%"

// Balloon radius in the SVG viewBox (250 × 250 canvas)
const MIN_R =  13;  // deflated
const MAX_R = 108;  // fully inflated

// ── Pump geometry (relative to the pumpSection div, 215 px tall) ──────────────
// handleBar: top = 8 + handleOffset (travels from 8 → 88)
// rod:       top = 22 + handleOffset, height = 82 − handleOffset (shortens to 2 px)
// pumpBody:  top = 104, height = 90
// base:      top = 194, height = 18
const PUMP_HANDLE_REST_TOP = 8;  // px from top of pumpSection
const PUMP_BODY_TOP        = 104;

export function PumpIt({ onScoreUpdate }: MinigameComponentProps) {
  // Handle position: 0 = fully raised, HANDLE_TRAVEL = fully depressed
  const handleOffRef  = useRef(0);
  const [handleOffset, setHandleOffset] = useState(0);

  const airRef        = useRef(0);
  const [air, setAir] = useState(0);
  const scoreRef      = useRef(0);
  const [score, setScore] = useState(0);

  const dragRef        = useRef<{ startY: number; startOffset: number } | null>(null);
  const firedRef       = useRef(false); // sound fired this downstroke?
  const canInflateRef  = useRef(true);  // true once handle returns to top; false after reaching bottom
  const rafRef    = useRef(0);
  const lastTRef  = useRef(0);

  // ── RAF loop: continuous air leak ──────────────────────────────────────────
  useEffect(() => {
    const tick = (now: number) => {
      const dt = lastTRef.current ? Math.min((now - lastTRef.current) / 1000, 0.05) : 0;
      lastTRef.current = now;

      airRef.current = Math.max(0, airRef.current - LEAK_RATE * dt);
      setAir(airRef.current);

      const s = Math.floor(airRef.current);
      if (s !== scoreRef.current) {
        scoreRef.current = s;
        setScore(s);
        onScoreUpdate(s);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [onScoreUpdate]);

  // ── Pointer handlers ────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startOffset: handleOffRef.current };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;

    const dy      = e.clientY - dragRef.current.startY;
    const newOff  = Math.max(0, Math.min(HANDLE_TRAVEL, dragRef.current.startOffset + dy));
    const downPx  = newOff - handleOffRef.current;

    // Handle returned to top → allow next inflation
    if (newOff < HANDLE_TRAVEL * 0.15) {
      canInflateRef.current = true;
    }

    // Add air only on downstroke when canInflate is true
    if (downPx > 0 && canInflateRef.current) {
      airRef.current = Math.min(MAX_AIR, airRef.current + downPx * AIR_PER_PX);
    }

    // At bottom of stroke: lock out inflation until handle returns to top
    if (newOff >= HANDLE_TRAVEL * 0.85) {
      canInflateRef.current = false;
    }

    // Fire pump sound once per downstroke (at ≥ 75 % travel)
    if (newOff >= HANDLE_TRAVEL * 0.75 && !firedRef.current) {
      firedRef.current = true;
      SFX.minigamePump();
    }
    // Allow sound to re-fire after handle returns past 25 %
    if (newOff < HANDLE_TRAVEL * 0.25) {
      firedRef.current = false;
    }

    handleOffRef.current = newOff;
    setHandleOffset(newOff);
  }, []);

  const onPointerUp = useCallback(() => {
    // Don't auto-reset handle — let it stay where released
    dragRef.current = null;
  }, []);

  // ── Derived visuals ─────────────────────────────────────────────────────────
  // Visual caps at 100 air (full balloon), but score continues to 200
  const airFrac   = Math.min(1, air / 100);
  const balloonR  = MIN_R + (MAX_R - MIN_R) * airFrac;

  // Balloon colour: deep red, brightens slightly when fuller
  const hue = 356;
  const sat = 75 + airFrac * 15;
  const lit = 52 - airFrac * 10;

  // Rod shortens as handle is pushed down
  const rodTop    = PUMP_HANDLE_REST_TOP + 14 + handleOffset;          // 22 + offset
  const rodHeight = Math.max(2, PUMP_BODY_TOP - rodTop);               // 82 − offset → 2

  return (
    <div style={styles.container}>
      {/* Score */}
      <span style={styles.scoreDisplay}>{score}</span>

      {/* ── Balloon ── */}
      <div style={styles.balloonSection}>
        <svg width={250} height={260} viewBox="0 0 250 260" style={{ overflow: 'visible' }}>
          {/* Soft glow when above 70 % */}
          {airFrac > 0.7 && (
            <ellipse
              cx={125} cy={118}
              rx={balloonR * 1.5} ry={balloonR * 1.5}
              fill={`hsla(${hue}, 90%, 65%, ${(airFrac - 0.7) * 0.28})`}
            />
          )}

          {/* Main balloon body */}
          <ellipse
            cx={125} cy={118}
            rx={Math.max(4, balloonR * 0.88)}
            ry={Math.max(4, balloonR)}
            fill={`hsl(${hue}, ${sat}%, ${lit}%)`}
          />

          {/* Sheen highlight */}
          {airFrac > 0.04 && (
            <ellipse
              cx={125 - balloonR * 0.22}
              cy={118 - balloonR * 0.3}
              rx={balloonR * 0.21}
              ry={balloonR * 0.27}
              fill="rgba(255,255,255,0.30)"
            />
          )}

          {/* Knot */}
          {airFrac > 0.04 && (
            <circle
              cx={125}
              cy={118 + balloonR * 0.96}
              r={Math.max(3, balloonR * 0.072)}
              fill={`hsl(${hue}, 72%, 30%)`}
            />
          )}

          {/* String from knot to bottom of SVG */}
          <line
            x1={125} y1={118 + balloonR * 0.96 + Math.max(3, balloonR * 0.072)}
            x2={125} y2={260}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1.5}
          />
        </svg>

        {/* Air % label */}
        <div style={styles.airLabel}>{Math.round(air)}%</div>
      </div>

      {/* ── Pump section ── */}
      <div
        style={styles.pumpSection}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Visual pump — centred, no pointer interaction of its own */}
        <div style={styles.pumpWrap}>

          {/* T-handle */}
          <div style={{
            position: 'absolute',
            top: PUMP_HANDLE_REST_TOP + handleOffset,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 86,
            height: 14,
            borderRadius: 4,
            background: handleOffset > HANDLE_TRAVEL * 0.6
              ? 'linear-gradient(180deg, #c0392b, #922b21)'
              : 'linear-gradient(180deg, #ccd6f6, #8892b0)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
            transition: 'background 0.1s',
            pointerEvents: 'none',
          }}>
            {/* Grip ridges */}
            {[20, 36, 52, 68].map((x) => (
              <div key={x} style={{
                position: 'absolute',
                top: 3, bottom: 3,
                left: x, width: 2,
                borderRadius: 1,
                background: 'rgba(0,0,0,0.18)',
              }} />
            ))}
          </div>

          {/* Rod */}
          <div style={{
            position: 'absolute',
            top: rodTop,
            left: '50%',
            marginLeft: -4,
            width: 8,
            height: rodHeight,
            background: 'linear-gradient(90deg, #8892b0, #ccd6f6 50%, #8892b0)',
            borderRadius: 2,
            pointerEvents: 'none',
          }} />

          {/* Pump body cylinder */}
          <div style={{
            position: 'absolute',
            top: PUMP_BODY_TOP,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 54,
            height: 90,
            borderRadius: '4px 4px 2px 2px',
            background: 'linear-gradient(90deg, #1a2a3a 0%, #223344 40%, #1a2a3a 100%)',
            border: '1.5px solid #2e4060',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}>
            {/* Pressure fill indicator */}
            <div style={{
              position: 'absolute',
              bottom: 0, left: 4, right: 4,
              height: `${air}%`,
              background: `hsl(${hue}, 80%, 52%)`,
              borderRadius: '2px 2px 0 0',
              opacity: 0.55,
              transition: 'height 0.06s linear',
            }} />
            {/* Label */}
            <span style={{
              position: 'absolute',
              bottom: 6, left: 0, right: 0,
              textAlign: 'center',
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '1.5px',
              color: 'rgba(255,255,255,0.45)',
              pointerEvents: 'none',
            }}>PUMP</span>
          </div>

          {/* Base */}
          <div style={{
            position: 'absolute',
            top: 194,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 100,
            height: 18,
            borderRadius: '0 0 6px 6px',
            background: 'linear-gradient(180deg, #1a2a3a, #111e2e)',
            border: '1.5px solid #2e4060',
            borderTop: 'none',
            pointerEvents: 'none',
          }} />
        </div>

        <p style={styles.hint}>Drag DOWN then back UP to pump</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'linear-gradient(180deg, #060f1e 0%, #0a192f 100%)',
    position: 'relative',
    touchAction: 'none',
    userSelect: 'none',
    overflow: 'hidden',
  },
  scoreDisplay: {
    position: 'absolute',
    top: 10, right: 16,
    color: '#f39c12',
    fontSize: '24px',
    fontWeight: 800,
    zIndex: 5,
  },
  balloonSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 0,
    minHeight: 0,
  },
  airLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    marginTop: 2,
    marginBottom: 4,
  },
  pumpSection: {
    width: '100%',
    height: 215,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    cursor: 'ns-resize',
    touchAction: 'none',
  },
  pumpWrap: {
    position: 'relative',
    width: 120,
    height: 215,
    flexShrink: 0,
  },
  hint: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: '11px',
    letterSpacing: '0.4px',
    margin: 0,
    pointerEvents: 'none',
  },
};
