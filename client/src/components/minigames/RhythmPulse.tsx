import { useState, useEffect, useRef } from 'react';
import type { MinigameComponentProps } from './types';

/** Synthesize a short metronome click using Web Audio. */
function playClick(beat: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    // Accent the downbeat with a higher, brighter tone
    osc.type = beat ? 'triangle' : 'sine';
    osc.frequency.value = beat ? 1200 : 880;
    gain.gain.value = beat ? 0.35 : 0.22;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.06);
  } catch {
    // Web Audio not available — silent fallback
  }
}

export function RhythmPulse({ onScoreUpdate, config }: MinigameComponentProps) {
  const [flash, setFlash] = useState(false);
  // Use server-sent BPM so all players get the same rhythm
  const [bpm] = useState(() => (config?.bpm as number) || 80 + Math.floor(Math.random() * 80));
  const scoreRef = useRef(0);
  const lastFlash = useRef(Date.now());
  const beatCountRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      beatCountRef.current += 1;
      // Accent every 4th beat (downbeat)
      const isDownbeat = beatCountRef.current % 4 === 1;
      playClick(isDownbeat);
      setFlash(true);
      lastFlash.current = Date.now();
      setTimeout(() => setFlash(false), 150);
    }, (60 / bpm) * 1000);
    return () => clearInterval(interval);
  }, [bpm]);

  const handleTap = () => {
    const delta = Math.abs(Date.now() - lastFlash.current);
    const beatInterval = (60 / bpm) * 1000;
    const accuracy = Math.max(0, 100 - (delta / beatInterval) * 200);
    scoreRef.current += Math.round(accuracy);
    onScoreUpdate(scoreRef.current);
  };

  return (
    <div
      style={{
        ...styles.container,
        background: flash
          ? 'radial-gradient(circle, #e74c3c, #c0392b)'
          : 'radial-gradient(circle, #1a3a5c, #112240)',
      }}
      onPointerDown={handleTap}
    >
      <p style={styles.bpm}>{bpm} BPM</p>
      <p style={styles.hint}>Tap on the beat!</p>
      <span style={styles.scoreOverlay}>{scoreRef.current}</span>
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
    justifyContent: 'center',
    position: 'relative',
    transition: 'background 0.15s',
    touchAction: 'none',
  },
  bpm: { color: '#fff', fontSize: '36px', fontWeight: 800, margin: 0 },
  hint: { color: '#a8b2d1', fontSize: '16px', marginTop: '8px' },
  scoreOverlay: {
    position: 'absolute',
    top: '12px',
    right: '16px',
    color: '#f39c12',
    fontSize: '24px',
    fontWeight: 800,
  },
};
