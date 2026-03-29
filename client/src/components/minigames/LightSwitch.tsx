import { useState, useRef, useCallback } from 'react';
import type { MinigameComponentProps } from './types';
import { SFX } from '../../utils/sound';

const SWIPE_THRESHOLD = 28;

export function LightSwitch({ onScoreUpdate }: MinigameComponentProps) {
  const [isOn, setIsOn] = useState(false);
  const [wrongFlash, setWrongFlash] = useState(false);
  const scoreRef = useRef(0);
  const [score, setScore] = useState(0);
  const ptrStartRef = useRef<{ y: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    ptrStartRef.current = { y: e.clientY };
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!ptrStartRef.current) return;
      const dy = e.clientY - ptrStartRef.current.y;
      ptrStartRef.current = null;

      const swipedUp = dy < -SWIPE_THRESHOLD;
      const swipedDown = dy > SWIPE_THRESHOLD;

      if (!swipedUp && !swipedDown) return; // too short — ignore

      const correct = (swipedUp && !isOn) || (swipedDown && isOn);

      if (correct) {
        const next = !isOn;
        setIsOn(next);
        scoreRef.current += 1;
        setScore(scoreRef.current);
        onScoreUpdate(scoreRef.current);
        if (next) SFX.minigameSwitchOn();
        else SFX.minigameSwitchOff();
      } else {
        // Wrong direction
        SFX.error();
        setWrongFlash(true);
        setTimeout(() => setWrongFlash(false), 250);
      }
    },
    [isOn, onScoreUpdate],
  );

  const end = useCallback(() => { ptrStartRef.current = null; }, []);

  const textColor = isOn ? 'rgba(60, 40, 0, 0.55)' : 'rgba(255,255,255,0.38)';

  return (
    <div
      style={{
        ...styles.room,
        background: isOn
          ? 'radial-gradient(ellipse 220px 180px at 50% 22%, #fff5b0 0%, #f0c430 35%, #b8882a 65%, #4a3010 100%)'
          : 'linear-gradient(180deg, #07111e 0%, #0d1b2e 100%)',
        outline: wrongFlash ? '3px solid #e74c3c' : '3px solid transparent',
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={end}
      onPointerCancel={end}
    >
      {/* Score */}
      <span style={{ ...styles.scoreDisplay, color: isOn ? '#7a5000' : '#f39c12' }}>
        {score}
      </span>

      {/* ── Ceiling lamp ── */}
      <div style={styles.lampWrap}>
        {/* Glow halo behind shade */}
        {isOn && <div style={styles.glowHalo} />}

        {/* Cord */}
        <div style={{ ...styles.cord, background: isOn ? '#8a6820' : '#2a2d3a' }} />

        {/* Shade — trapezoid via border trick */}
        <div style={{
          ...styles.shade,
          borderBottomColor: isOn ? '#c8920a' : '#2e3148',
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          filter: isOn ? 'drop-shadow(0 4px 12px rgba(255,200,0,0.5))' : 'none',
        }} />

        {/* Bulb */}
        <div style={{
          ...styles.bulb,
          background: isOn
            ? 'radial-gradient(circle at 40% 35%, #fffde0, #f5d020 50%, #e8a800)'
            : 'radial-gradient(circle at 40% 35%, #1e2235, #141828)',
          boxShadow: isOn
            ? '0 0 24px 10px rgba(255,220,60,0.7), 0 0 50px 24px rgba(255,165,0,0.35)'
            : '0 2px 6px rgba(0,0,0,0.5)',
        }} />
      </div>

      {/* ── Wall plate & switch ── */}
      <div style={styles.plate}>
        {/* Rocker toggle */}
        <div style={{
          ...styles.rocker,
          transform: isOn ? 'perspective(60px) rotateX(-18deg)' : 'perspective(60px) rotateX(18deg)',
          background: isOn
            ? 'linear-gradient(180deg, #f0f0f0 0%, #c8c8c8 100%)'
            : 'linear-gradient(180deg, #707070 0%, #4a4a4a 100%)',
          boxShadow: isOn
            ? '0 -4px 8px rgba(255,255,255,0.4) inset, 0 2px 4px rgba(0,0,0,0.3)'
            : '0 4px 8px rgba(0,0,0,0.5) inset, 0 -2px 4px rgba(0,0,0,0.2)',
        }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '1px',
            color: isOn ? '#444' : '#999',
            userSelect: 'none',
          }}>
            {isOn ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      {/* Hint */}
      <div style={{ ...styles.hint, color: textColor }}>
        {isOn ? '↓  Swipe down to turn  OFF' : '↑  Swipe up to turn  ON'}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  room: {
    flex: 1,
    width: '100%',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    touchAction: 'none',
    userSelect: 'none',
    transition: 'background 0.25s ease',
    outlineOffset: '-3px',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  scoreDisplay: {
    position: 'absolute',
    top: 12, right: 16,
    fontSize: '26px',
    fontWeight: 800,
    zIndex: 5,
    transition: 'color 0.25s',
  },
  lampWrap: {
    position: 'absolute',
    top: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  glowHalo: {
    position: 'absolute',
    top: 60,
    width: 180,
    height: 180,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,220,60,0.35) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  cord: {
    width: 4,
    height: 48,
    borderRadius: 2,
    transition: 'background 0.25s',
  },
  shade: {
    width: 0,
    height: 0,
    borderLeft: '52px solid transparent',
    borderRight: '52px solid transparent',
    borderBottom: '68px solid #2e3148',
    transition: 'border-bottom-color 0.25s',
  },
  bulb: {
    width: 40,
    height: 44,
    borderRadius: '50% 50% 40% 40%',
    marginTop: -6,
    transition: 'background 0.25s, box-shadow 0.25s',
  },
  plate: {
    position: 'absolute',
    top: '52%',
    width: 72,
    height: 114,
    background: 'linear-gradient(180deg, #d0d0d8 0%, #b0b0bc 100%)',
    borderRadius: 8,
    border: '2px solid #8888a0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
  },
  rocker: {
    width: 48,
    height: 78,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.12s ease, background 0.15s, box-shadow 0.15s',
    cursor: 'pointer',
  },
  hint: {
    position: 'absolute',
    bottom: 18,
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    transition: 'color 0.25s',
    pointerEvents: 'none',
  },
};
