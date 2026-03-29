import { useState, useRef, useEffect, useCallback } from 'react';
import type { MinigameComponentProps } from './types';
import { SFX } from '../../utils/sound';

// ── Tuning ────────────────────────────────────────────────────────────────────
const HANDLE_TRAVEL = 80;   // px the handle moves top to bottom
const AIR_PER_PX    = 0.8;  // air added per px of downward handle movement
const LEAK_RATE     = 16;   // air units / second

// Balloon visual radius
const MIN_R =  10;  // deflated
const MAX_R = 100;  // visual radius at 100% — keeps growing beyond via sqrt

// ── Pump geometry (relative to pumpWrap, 180 px tall) ────────────────────────
const PUMP_HANDLE_REST_TOP = 4;
const PUMP_BODY_TOP        = 86;

export function PumpIt({ onScoreUpdate }: MinigameComponentProps) {
  const handleOffRef  = useRef(0);
  const [handleOffset, setHandleOffset] = useState(0);

  const airRef        = useRef(0);
  const [air, setAir] = useState(0);
  const scoreRef      = useRef(0);
  const [score, setScore] = useState(0);

  const lastYRef       = useRef<number | null>(null);
  const firedRef       = useRef(false);
  const canInflateRef  = useRef(true);
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
    lastYRef.current = e.clientY;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (lastYRef.current === null) return;

    const dy = e.clientY - lastYRef.current;
    lastYRef.current = e.clientY;

    const prevOff = handleOffRef.current;
    const newOff  = Math.max(0, Math.min(HANDLE_TRAVEL, prevOff + dy));
    const downPx  = newOff - prevOff;

    if (newOff < HANDLE_TRAVEL * 0.15) {
      canInflateRef.current = true;
    }

    if (downPx > 0 && canInflateRef.current) {
      airRef.current = airRef.current + downPx * AIR_PER_PX;
    }

    if (newOff >= HANDLE_TRAVEL * 0.85) {
      canInflateRef.current = false;
    }

    if (newOff >= HANDLE_TRAVEL * 0.75 && !firedRef.current) {
      firedRef.current = true;
      SFX.minigamePump();
    }
    if (newOff < HANDLE_TRAVEL * 0.25) {
      firedRef.current = false;
    }

    handleOffRef.current = newOff;
    setHandleOffset(newOff);
  }, []);

  const onPointerUp = useCallback(() => {
    handleOffRef.current = 0;
    setHandleOffset(0);
    canInflateRef.current = true;
    firedRef.current = false;
    lastYRef.current = null;
  }, []);

  // ── Derived visuals ─────────────────────────────────────────────────────────
  // Balloon grows continuously — sqrt scaling past 100% keeps it manageable
  const balloonR = air <= 100
    ? MIN_R + (MAX_R - MIN_R) * (air / 100)
    : MAX_R + Math.sqrt(air - 100) * 5;

  const hue = 356;
  const airFrac = Math.min(1, air / 100);
  const sat = 75 + airFrac * 15;
  const lit = 52 - airFrac * 10;

  // Knot is the fixed anchor point. Balloon body extends upward from it.
  // In SVG coords: knot at (125, KNOT_Y), balloon center at (125, KNOT_Y - balloonR)
  const KNOT_Y = 290;
  const balloonCY = KNOT_Y - balloonR;
  const knotR = Math.max(3, balloonR * 0.072);

  // Rod shortens as handle is pushed down
  const rodTop    = PUMP_HANDLE_REST_TOP + 12 + handleOffset;
  const rodHeight = Math.max(2, PUMP_BODY_TOP - rodTop);

  return (
    <div style={styles.container}>
      <span style={styles.scoreDisplay}>{score}</span>

      {/* ── Balloon area — fills space above pump, balloon grows upward ── */}
      <div style={styles.balloonArea}>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 250 300"
          preserveAspectRatio="xMidYMax meet"
          style={{ overflow: 'visible', display: 'block' }}
        >
          {/* Soft glow when above 70% */}
          {air > 70 && (
            <ellipse
              cx={125} cy={balloonCY}
              rx={balloonR * 1.5} ry={balloonR * 1.5}
              fill={`hsla(${hue}, 90%, 65%, ${Math.min(0.28, (air - 70) * 0.003)})`}
            />
          )}

          {/* Main balloon body */}
          <ellipse
            cx={125} cy={balloonCY}
            rx={Math.max(4, balloonR * 0.88)}
            ry={Math.max(4, balloonR)}
            fill={`hsl(${hue}, ${sat}%, ${lit}%)`}
          />

          {/* Sheen highlight */}
          {air > 4 && (
            <ellipse
              cx={125 - balloonR * 0.22}
              cy={balloonCY - balloonR * 0.3}
              rx={balloonR * 0.21}
              ry={balloonR * 0.27}
              fill="rgba(255,255,255,0.30)"
            />
          )}

          {/* Knot */}
          {air > 4 && (
            <circle
              cx={125}
              cy={KNOT_Y}
              r={knotR}
              fill={`hsl(${hue}, 72%, 30%)`}
            />
          )}

          {/* String from knot down to bottom of SVG */}
          <line
            x1={125} y1={KNOT_Y + knotR}
            x2={125} y2={300}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1.5}
          />
        </svg>

        {/* Air % label — positioned above pump */}
        <div style={styles.airLabel}>{Math.round(air)}%</div>
      </div>

      {/* ── Bottom half: full-width touch zone with pump at bottom ── */}
      <div
        style={styles.touchZone}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Push pump to bottom of touch zone */}
        <div style={{ flex: 1 }} />

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
            height: 76,
            borderRadius: '4px 4px 2px 2px',
            background: 'linear-gradient(90deg, #1a2a3a 0%, #223344 40%, #1a2a3a 100%)',
            border: '1.5px solid #2e4060',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}>
            <div style={{
              position: 'absolute',
              bottom: 0, left: 4, right: 4,
              height: `${Math.min(100, air)}%`,
              background: `hsl(${hue}, 80%, 52%)`,
              borderRadius: '2px 2px 0 0',
              opacity: 0.55,
              transition: 'height 0.06s linear',
            }} />
            <span style={{
              position: 'absolute',
              bottom: 4, left: 0, right: 0,
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
            top: 162,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 100,
            height: 16,
            borderRadius: '0 0 6px 6px',
            background: 'linear-gradient(180deg, #1a2a3a, #111e2e)',
            border: '1.5px solid #2e4060',
            borderTop: 'none',
            pointerEvents: 'none',
          }} />
        </div>

        <p style={styles.hint}>Drag up &amp; down to pump</p>
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
  balloonArea: {
    flex: '1 1 auto',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
    position: 'relative',
    minHeight: 80,
  },
  airLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    marginTop: 0,
    marginBottom: 2,
    textAlign: 'center',
  },
  touchZone: {
    width: '100%',
    flex: '0 0 50%',
    minHeight: 200,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    cursor: 'ns-resize',
    touchAction: 'none',
  },
  pumpWrap: {
    position: 'relative',
    width: 120,
    height: 180,
    flexShrink: 0,
    pointerEvents: 'none',
  },
  hint: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: '11px',
    letterSpacing: '0.4px',
    margin: '2px 0 8px 0',
    pointerEvents: 'none',
  },
};
