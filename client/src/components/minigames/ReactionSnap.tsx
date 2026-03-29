import { useState, useEffect, useRef } from 'react';
import type { MinigameComponentProps } from './types';
import { SFX } from '../../utils/sound';

export function ReactionSnap({ onScoreUpdate, config }: MinigameComponentProps) {
  const [state, setState] = useState<'waiting' | 'ready' | 'tapped'>('waiting');
  const readyTime = useRef(0);
  const totalScore = useRef(0);
  const roundCount = useRef(0);
  // Use server-sent delays so all players get identical timing
  const delays = useRef((config?.delays as number[]) || []);

  useEffect(() => {
    if (state !== 'waiting') return;
    const roundIdx = roundCount.current;
    const delay = delays.current[roundIdx] ?? (800 + Math.random() * 1700);
    const timer = setTimeout(() => {
      readyTime.current = Date.now();
      SFX.minigameReactionGo();
      setState('ready');
    }, delay);
    return () => clearTimeout(timer);
  }, [state]);

  const handleTap = () => {
    if (state === 'waiting') return; // Tapped too early — no penalty, just ignore
    if (state === 'ready') {
      const reactionMs = Date.now() - readyTime.current;
      // Score: faster = higher. 1000 - reactionMs, clamped to 0-1000
      const roundScore = Math.max(0, Math.round(1000 - reactionMs));
      SFX.minigameReactionTap(reactionMs);
      totalScore.current += roundScore;
      roundCount.current += 1;
      onScoreUpdate(totalScore.current);
      setState('tapped');
      // Start next round after brief pause
      setTimeout(() => setState('waiting'), 400);
    }
  };

  const bgColor = state === 'ready'
    ? '#27ae60'
    : state === 'tapped'
    ? '#2ecc71'
    : '#c0392b';

  return (
    <div style={{ ...styles.container, background: bgColor }} onPointerDown={handleTap}>
      <span style={styles.label}>
        {state === 'waiting' && 'Wait for green...'}
        {state === 'ready' && 'TAP NOW!'}
        {state === 'tapped' && 'Nice!'}
      </span>
      <span style={styles.score}>{totalScore.current}</span>
      <span style={styles.rounds}>Round {roundCount.current + 1}</span>
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
    transition: 'background 0.1s',
    touchAction: 'none',
    userSelect: 'none',
  },
  label: { color: '#fff', fontSize: '28px', fontWeight: 700 },
  score: { color: '#fff', fontSize: '48px', fontWeight: 800, marginTop: '12px' },
  rounds: { color: 'rgba(255,255,255,0.6)', fontSize: '14px', marginTop: '8px' },
};
