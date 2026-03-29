import { useEffect, useState } from 'react';
import type { GameState } from '../types/game';
import { Fireworks } from './Fireworks';
import { SFX } from '../utils/sound';

interface Props {
  gameState: GameState;
}

const RANK_COLORS  = ['#f39c12', '#c0c0c8', '#cd7f32'] as const;
// Podium block heights for [2nd, 1st, 3rd] layout columns
const PODIUM_H     = [138, 196, 96] as const;

export function GameOverScreen({ gameState }: Props) {
  // 0 = nothing shown  1 = 3rd  2 = 2nd  3 = 1st + fireworks
  const [revealStep,  setRevealStep]  = useState(0);
  const [showButton,  setShowButton]  = useState(false);

  const players = Object.values(gameState.players)
    .filter((p) => p.role === 'player')
    .sort((a, b) => b.marbles !== a.marbles ? b.marbles - a.marbles : b.points - a.points);

  const total = players.length;

  useEffect(() => {
    const ts: ReturnType<typeof setTimeout>[] = [];

    if (total >= 3) {
      // Dramatic 3-step reveal: 3rd → 2nd → 1st
      ts.push(setTimeout(() => { setRevealStep(1); SFX.tileLand();    },  900));
      ts.push(setTimeout(() => { setRevealStep(2); SFX.marbleGain();  }, 2900));
      ts.push(setTimeout(() => { setRevealStep(3); SFX.battleWin();   }, 4900));
      ts.push(setTimeout(() => setShowButton(true),                      6400));
    } else if (total === 2) {
      ts.push(setTimeout(() => { setRevealStep(2); SFX.marbleGain();  },  900));
      ts.push(setTimeout(() => { setRevealStep(3); SFX.battleWin();   }, 2900));
      ts.push(setTimeout(() => setShowButton(true),                      4400));
    } else {
      ts.push(setTimeout(() => { setRevealStep(3); SFX.battleWin();   },  900));
      ts.push(setTimeout(() => setShowButton(true),                      2400));
    }

    return () => ts.forEach(clearTimeout);
  }, [total]);

  const p1 = players[0] ?? null;
  const p2 = players[1] ?? null;
  const p3 = players[2] ?? null;

  // Olympic layout: left = 2nd, centre = 1st, right = 3rd
  type Col = { player: typeof players[0]; rank: 1|2|3; revealAt: number; layoutIdx: 0|1|2 };
  const columns: Col[] = ([
    p2 ? { player: p2, rank: 2, revealAt: 2, layoutIdx: 0 } : null,
    p1 ? { player: p1, rank: 1, revealAt: 3, layoutIdx: 1 } : null,
    p3 ? { player: p3, rank: 3, revealAt: 1, layoutIdx: 2 } : null,
  ] as (Col | null)[]).filter(Boolean) as Col[];

  const rest = players.slice(3);

  return (
    <div style={styles.container}>
      {/* Fireworks canvas is first child — subsequent content paints on top */}
      {revealStep >= 3 && <Fireworks intensity="intense" />}

      {/* All visible content */}
      <div style={styles.inner}>

        <h1 style={{
          ...styles.title,
          background: revealStep >= 3
            ? 'linear-gradient(90deg, #f39c12, #e74c3c, #f39c12)'
            : 'linear-gradient(90deg, #8892b0, #ccd6f6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          transition: 'background 0.6s',
        }}>
          {revealStep >= 3 ? '🏆 WINNER!' : 'GAME OVER'}
        </h1>

        {/* ── Olympic podium ── */}
        <div style={styles.podiumWrap}>
          {columns.map(({ player, rank, revealAt, layoutIdx }) => {
            const visible  = revealStep >= revealAt;
            const color    = RANK_COLORS[rank - 1];
            const blockH   = PODIUM_H[layoutIdx];
            const isFirst  = rank === 1;

            return (
              <div
                key={player.id}
                style={{
                  ...styles.podiumCol,
                  flex: isFirst ? 1.35 : 1,
                  zIndex: isFirst ? 2 : 1,
                  opacity: visible ? 1 : 0,
                  transform: visible
                    ? 'translateY(0) scale(1)'
                    : isFirst
                      ? 'translateY(-24px) scale(0.55)'
                      : 'translateY(64px) scale(0.88)',
                  transition: visible
                    ? `opacity 0.5s ease-out, transform 0.6s cubic-bezier(0.34,1.56,0.64,1)`
                    : 'none',
                }}
              >
                {/* Player info above the podium block */}
                <div style={styles.playerInfo}>
                  {isFirst && <div style={styles.crown}>👑</div>}
                  <div style={{ fontSize: isFirst ? 54 : 40, lineHeight: 1.1 }}>
                    {player.token?.emoji ?? '?'}
                  </div>
                  <div style={{ ...styles.playerName, color, fontSize: isFirst ? 18 : 14 }}>
                    {player.name}
                  </div>
                  <div style={styles.marbleCount}>
                    🔮 {player.marbles}
                  </div>
                  <div style={{ ...styles.pts, color: isFirst ? color : '#8892b0' }}>
                    {player.points} pts
                  </div>
                </div>

                {/* Podium block */}
                <div style={{
                  ...styles.podiumBlock,
                  height:      blockH,
                  borderColor: color,
                  background:  `linear-gradient(180deg, ${color}38 0%, ${color}0d 100%)`,
                  boxShadow:   isFirst ? `0 0 60px ${color}50, inset 0 2px 0 ${color}55` : undefined,
                }}>
                  <span style={{ ...styles.rankNum, color }}>{rank}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 4th place and beyond — shown after full reveal */}
        {rest.length > 0 && revealStep >= 3 && (
          <div style={styles.restList}>
            {rest.map((pl, i) => (
              <div key={pl.id} style={styles.restRow}>
                <span style={styles.restRank}>#{i + 4}</span>
                <span style={styles.restEmoji}>{pl.token?.emoji ?? '?'}</span>
                <span style={styles.restName}>{pl.name}</span>
                <span style={styles.restScore}>🔮 {pl.marbles} · {pl.points} pts</span>
              </div>
            ))}
          </div>
        )}

        {showButton && (
          <button style={styles.playAgain} onClick={() => window.location.reload()}>
            Play Again
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'linear-gradient(160deg, #07111e 0%, #0d1b2e 60%, #0a0f1a 100%)',
    overflow: 'hidden',
  },
  inner: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
    padding: '24px 16px 20px',
    overflowY: 'auto',
  },
  title: {
    fontSize: '34px',
    fontWeight: 900,
    margin: '0 0 24px 0',
    letterSpacing: '1px',
    textAlign: 'center',
  },

  /* Podium */
  podiumWrap: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: '6px',
    width: '100%',
    maxWidth: '400px',
    marginBottom: '20px',
  },
  podiumCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  playerInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
    marginBottom: '8px',
  },
  crown: {
    fontSize: '26px',
    lineHeight: 1,
  },
  playerName: {
    fontWeight: 800,
    lineHeight: 1.2,
    textAlign: 'center',
    wordBreak: 'break-word',
    maxWidth: '100px',
  },
  marbleCount: {
    color: '#f39c12',
    fontSize: '15px',
    fontWeight: 800,
  },
  pts: {
    fontSize: '12px',
    fontWeight: 600,
  },
  podiumBlock: {
    width: '100%',
    borderRadius: '8px 8px 0 0',
    border: '2px solid',
    borderBottom: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: {
    fontSize: '36px',
    fontWeight: 900,
    opacity: 0.55,
  },

  /* 4th place + */
  restList: {
    width: '100%',
    maxWidth: '380px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '20px',
  },
  restRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '10px',
    padding: '10px 14px',
  },
  restRank:  { color: '#5a6a8a', fontSize: '13px', fontWeight: 600, minWidth: '26px' },
  restEmoji: { fontSize: '20px' },
  restName:  { color: '#ccd6f6', fontSize: '14px', flex: 1 },
  restScore: { color: '#8892b0', fontSize: '13px', fontWeight: 600 },

  /* Play again */
  playAgain: {
    marginTop: 'auto',
    padding: '16px 48px',
    fontSize: '18px',
    fontWeight: 800,
    border: 'none',
    borderRadius: '14px',
    background: 'linear-gradient(135deg, #f39c12, #e74c3c)',
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 4px 24px rgba(243,156,18,0.35)',
    letterSpacing: '0.5px',
  },
};
