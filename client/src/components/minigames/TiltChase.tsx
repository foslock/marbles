import { useState, useEffect, useRef, useCallback } from 'react';
import type { MinigameComponentProps } from './types';
import { lobbyMotionGranted } from '../LobbyScreen';
import { SFX } from '../../utils/sound';

/**
 * TiltChase: Guide your dot to follow a moving target using device accelerometer.
 * Falls back to touch/pointer control if accelerometer is unavailable.
 *
 * iOS 13+ motion permission is requested in LobbyScreen so the player has
 * already handled it before the minigame starts. If the lobby flag is set we
 * skip the in-game prompt entirely.
 */
export function TiltChase({ onScoreUpdate, config }: MinigameComponentProps) {
  const [playerPos, setPlayerPos] = useState({ x: 150, y: 220 });
  const [targetPos, setTargetPos] = useState({ x: 150, y: 220 });
  const [accelState, setAccelState] = useState<'unknown' | 'requesting' | 'granted' | 'denied'>(
    lobbyMotionGranted ? 'granted' : 'unknown'
  );
  const scoreRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const accelRef = useRef({ x: 0, y: 0 });

  const needsPermission = typeof (DeviceMotionEvent as any).requestPermission === 'function';

  const startListening = useCallback(() => {
    const handler = (e: DeviceMotionEvent) => {
      const accel = e.accelerationIncludingGravity;
      if (accel && (accel.x !== null || accel.y !== null)) {
        setAccelState('granted');
        accelRef.current = {
          x: -(accel.x ?? 0) * 2.5,
          y: (accel.y ?? 0) * 2.5,
        };
      }
    };
    window.addEventListener('devicemotion', handler);
    return handler;
  }, []);

  // Non-iOS: start listening immediately
  useEffect(() => {
    if (needsPermission) return;
    const handler = startListening();
    const timer = setTimeout(() => {
      setAccelState((prev) => prev === 'unknown' ? 'denied' : prev);
    }, 800);
    return () => {
      window.removeEventListener('devicemotion', handler);
      clearTimeout(timer);
    };
  }, [needsPermission, startListening]);

  // iOS: if permission was already granted in lobby, start listening immediately
  useEffect(() => {
    if (!needsPermission || !lobbyMotionGranted) return;
    const handler = startListening();
    return () => window.removeEventListener('devicemotion', handler);
  }, [needsPermission, startListening]);

  // iOS fallback: in-game request (only if lobby prompt was missed)
  const requestIOSPermission = useCallback(() => {
    setAccelState('requesting');
    (DeviceMotionEvent as any).requestPermission()
      .then((state: string) => {
        if (state === 'granted') { startListening(); setAccelState('granted'); }
        else { setAccelState('denied'); }
      })
      .catch(() => setAccelState('denied'));
  }, [startListening]);

  // Target moves every 1.4s
  useEffect(() => {
    const interval = setInterval(() => {
      setTargetPos({
        x: 50 + Math.random() * 200,
        y: 80 + Math.random() * 280,
      });
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  // Game tick: update player position from accelerometer
  useEffect(() => {
    if (accelState !== 'granted') return;
    const interval = setInterval(() => {
      setPlayerPos((prev) => ({
        x: Math.max(10, Math.min(290, prev.x + accelRef.current.x)),
        y: Math.max(10, Math.min(430, prev.y + accelRef.current.y)),
      }));
    }, 30);
    return () => clearInterval(interval);
  }, [accelState]);

  // Scoring: proximity-based each 100ms
  useEffect(() => {
    const interval = setInterval(() => {
      const dist = Math.hypot(playerPos.x - targetPos.x, playerPos.y - targetPos.y);
      if (dist < 65) {
        scoreRef.current += dist < 25 ? 3 : 1;
        onScoreUpdate(scoreRef.current);
        SFX.minigameOnTarget();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [playerPos, targetPos, onScoreUpdate]);

  // Touch/pointer fallback
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (accelState === 'granted') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPlayerPos({
      x: Math.max(10, Math.min(290, e.clientX - rect.left)),
      y: Math.max(10, Math.min(430, e.clientY - rect.top)),
    });
  }, [accelState]);

  const dist = Math.hypot(playerPos.x - targetPos.x, playerPos.y - targetPos.y);
  const closeColor = dist < 25 ? '#2ecc71' : dist < 65 ? '#f39c12' : '#e74c3c';

  // Show in-game permission prompt only if lobby was skipped and we still need it
  if (needsPermission && !lobbyMotionGranted && accelState !== 'granted' && accelState !== 'denied') {
    return (
      <div style={styles.permContainer}>
        <p style={styles.permTitle}>Motion Access Needed</p>
        <p style={styles.permBody}>Tilt Chase uses your device's motion sensor.</p>
        <button
          style={styles.permBtn}
          onPointerDown={accelState !== 'requesting' ? requestIOSPermission : undefined}
        >
          {accelState === 'requesting' ? 'Requesting…' : 'Enable Tilt Controls'}
        </button>
        <p style={styles.permSkip}>(Denied → touch controls used instead)</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onPointerMove={handlePointerMove}
    >
      {/* Target — larger for easier following (70×70, radius 35) */}
      <div style={{
        ...styles.target,
        left: targetPos.x - 35,
        top: targetPos.y - 35,
        transition: 'left 0.9s ease, top 0.9s ease',
      }} />

      {/* Player dot */}
      <div style={{
        ...styles.player,
        left: playerPos.x - 14,
        top: playerPos.y - 14,
        borderColor: closeColor,
        boxShadow: `0 0 ${dist < 65 ? 18 : 0}px ${closeColor}`,
      }} />

      <span style={styles.scoreOverlay}>{scoreRef.current}</span>
      <span style={styles.hint}>
        {accelState === 'granted' ? 'Tilt your device to follow the target!' : 'Drag your finger to follow the target!'}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1, width: '100%', position: 'relative',
    touchAction: 'none', overflow: 'hidden',
  },
  // Larger target: 70×70 (was 40×40)
  target: {
    position: 'absolute', width: '70px', height: '70px', borderRadius: '50%',
    background: 'rgba(231, 76, 60, 0.2)', border: '3px dashed #e74c3c',
  },
  player: {
    position: 'absolute', width: '28px', height: '28px', borderRadius: '50%',
    background: '#3498db', border: '3px solid #2ecc71',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  scoreOverlay: {
    position: 'absolute', top: '8px', right: '12px',
    color: '#f39c12', fontSize: '24px', fontWeight: 800,
  },
  hint: {
    position: 'absolute', bottom: '12px', width: '100%',
    textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '12px',
  },
  permContainer: {
    flex: 1, width: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '16px',
    padding: '32px', boxSizing: 'border-box',
  },
  permTitle: { color: '#ccd6f6', fontSize: '24px', fontWeight: 800, margin: 0 },
  permBody: { color: '#8892b0', fontSize: '15px', textAlign: 'center', margin: 0, maxWidth: '280px' },
  permBtn: {
    background: '#3498db', color: '#fff', border: 'none', borderRadius: '12px',
    padding: '16px 32px', fontSize: '18px', fontWeight: 700, cursor: 'pointer', touchAction: 'none',
  },
  permSkip: { color: '#5a6a8a', fontSize: '12px', textAlign: 'center', margin: 0 },
};
