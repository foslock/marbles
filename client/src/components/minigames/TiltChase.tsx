import { useState, useEffect, useRef, useCallback } from 'react';
import type { MinigameComponentProps } from './types';

/**
 * TiltChase: Guide your dot to follow a moving target using device accelerometer.
 * Falls back to touch/pointer control if accelerometer is unavailable.
 *
 * iOS 13+ requires the DeviceMotion permission to be requested inside a user
 * gesture handler (a tap), not inside useEffect. We show a prompt button first
 * so the permission dialog can fire from the tap event.
 */
export function TiltChase({ onScoreUpdate, config }: MinigameComponentProps) {
  const [playerPos, setPlayerPos] = useState({ x: 150, y: 200 });
  const [targetPos, setTargetPos] = useState({ x: 150, y: 200 });
  // 'unknown' until we know; 'requesting' while iOS dialog is pending
  const [accelState, setAccelState] = useState<'unknown' | 'requesting' | 'granted' | 'denied'>('unknown');
  const scoreRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const accelRef = useRef({ x: 0, y: 0 });
  const playerPosRef = useRef({ x: 150, y: 200 });

  // Detect if permission API exists (iOS 13+)
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

  // On non-iOS (Android etc.) just start listening immediately
  useEffect(() => {
    if (needsPermission) return; // wait for button tap
    const handler = startListening();
    // Give it 800ms to see if we actually get accelerometer data
    const timer = setTimeout(() => {
      setAccelState((prev) => prev === 'unknown' ? 'denied' : prev);
    }, 800);
    return () => {
      window.removeEventListener('devicemotion', handler);
      clearTimeout(timer);
    };
  }, [needsPermission, startListening]);

  // iOS permission request — must fire from a tap handler
  const requestIOSPermission = useCallback(() => {
    setAccelState('requesting');
    (DeviceMotionEvent as any).requestPermission()
      .then((state: string) => {
        if (state === 'granted') {
          startListening();
          setAccelState('granted');
        } else {
          setAccelState('denied');
        }
      })
      .catch(() => setAccelState('denied'));
  }, [startListening]);

  // Move target around periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setTargetPos({
        x: 40 + Math.random() * 220,
        y: 60 + Math.random() * 300,
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  // Game tick: update player position from accelerometer
  useEffect(() => {
    if (accelState !== 'granted') return;
    const interval = setInterval(() => {
      setPlayerPos((prev) => {
        const nx = Math.max(10, Math.min(290, prev.x + accelRef.current.x));
        const ny = Math.max(10, Math.min(390, prev.y + accelRef.current.y));
        const next = { x: nx, y: ny };
        playerPosRef.current = next;
        return next;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [accelState]);

  // Scoring: check distance each tick
  useEffect(() => {
    const interval = setInterval(() => {
      const dist = Math.hypot(playerPos.x - targetPos.x, playerPos.y - targetPos.y);
      if (dist < 50) {
        scoreRef.current += dist < 20 ? 3 : 1;
        onScoreUpdate(scoreRef.current);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [playerPos, targetPos, onScoreUpdate]);

  // Touch/pointer fallback for non-accelerometer mode
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (accelState === 'granted') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = {
      x: Math.max(10, Math.min(290, e.clientX - rect.left)),
      y: Math.max(10, Math.min(390, e.clientY - rect.top)),
    };
    playerPosRef.current = next;
    setPlayerPos(next);
  }, [accelState]);

  const dist = Math.hypot(playerPos.x - targetPos.x, playerPos.y - targetPos.y);
  const closeColor = dist < 20 ? '#2ecc71' : dist < 50 ? '#f39c12' : '#e74c3c';

  // iOS: show permission prompt before starting
  if (needsPermission && accelState !== 'granted' && accelState !== 'denied') {
    return (
      <div style={styles.permContainer}>
        <p style={styles.permTitle}>Tilt Chase</p>
        <p style={styles.permBody}>This game uses your device's motion sensor to move your dot.</p>
        <button
          style={styles.permBtn}
          onPointerDown={accelState !== 'requesting' ? requestIOSPermission : undefined}
        >
          {accelState === 'requesting' ? 'Requesting…' : 'Enable Tilt Controls'}
        </button>
        <p style={styles.permSkip}>
          (If denied, touch controls will be used instead)
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onPointerMove={handlePointerMove}
    >
      {/* Target */}
      <div style={{
        ...styles.target,
        left: targetPos.x - 20,
        top: targetPos.y - 20,
        transition: 'left 0.8s ease, top 0.8s ease',
      }} />

      {/* Player */}
      <div style={{
        ...styles.player,
        left: playerPos.x - 12,
        top: playerPos.y - 12,
        borderColor: closeColor,
        boxShadow: `0 0 ${dist < 50 ? 15 : 0}px ${closeColor}`,
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
  target: {
    position: 'absolute', width: '40px', height: '40px', borderRadius: '50%',
    background: 'rgba(231, 76, 60, 0.3)', border: '3px dashed #e74c3c',
  },
  player: {
    position: 'absolute', width: '24px', height: '24px', borderRadius: '50%',
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
  permTitle: {
    color: '#ccd6f6', fontSize: '26px', fontWeight: 800, margin: 0,
  },
  permBody: {
    color: '#8892b0', fontSize: '15px', textAlign: 'center', margin: 0, maxWidth: '280px',
  },
  permBtn: {
    background: '#3498db', color: '#fff', border: 'none', borderRadius: '12px',
    padding: '16px 32px', fontSize: '18px', fontWeight: 700, cursor: 'pointer',
    touchAction: 'none',
  },
  permSkip: {
    color: '#5a6a8a', fontSize: '12px', textAlign: 'center', margin: 0,
  },
};
