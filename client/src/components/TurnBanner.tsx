import { useEffect, useState, useRef } from 'react';

interface Props {
  playerName: string | null;
  playerEmoji: string | null;
  /** Unique key that changes each turn (e.g. turnPlayerId or turnNumber) */
  triggerKey: string | number;
}

const SLIDE_IN_MS = 400;
const HOLD_MS = 1600;
const SLIDE_OUT_MS = 400;
const TOTAL_MS = SLIDE_IN_MS + HOLD_MS + SLIDE_OUT_MS;

/**
 * Purely visual banner that slides across the screen announcing whose turn it is.
 * Does not block pointer events or other UI.
 */
export function TurnBanner({ playerName, playerEmoji, triggerKey }: Props) {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');
  const [displayName, setDisplayName] = useState(playerName);
  const [displayEmoji, setDisplayEmoji] = useState(playerEmoji);
  const firstRender = useRef(true);

  useEffect(() => {
    // Skip the very first render so the banner doesn't show on page load
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!playerName) return;

    setDisplayName(playerName);
    setDisplayEmoji(playerEmoji);
    setPhase('in');
    setVisible(true);

    const holdTimer = setTimeout(() => setPhase('hold'), SLIDE_IN_MS);
    const outTimer = setTimeout(() => setPhase('out'), SLIDE_IN_MS + HOLD_MS);
    const hideTimer = setTimeout(() => setVisible(false), TOTAL_MS);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(outTimer);
      clearTimeout(hideTimer);
    };
  }, [triggerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || !displayName) return null;

  const translateX =
    phase === 'in' ? '100vw'   // start off-screen right
      : phase === 'hold' ? '0' // centered
        : '-100vw';             // exit off-screen left

  return (
    <div style={styles.wrapper}>
      <div
        style={{
          ...styles.banner,
          transform: `translateX(${translateX})`,
          transition:
            phase === 'in'
              ? `transform ${SLIDE_IN_MS}ms cubic-bezier(0.22,1,0.36,1)`
              : phase === 'out'
                ? `transform ${SLIDE_OUT_MS}ms cubic-bezier(0.55,0,1,0.45)`
                : 'none',
        }}
      >
        <span style={styles.emoji}>{displayEmoji || '?'}</span>
        <span style={styles.name}>{displayName}'s Turn</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'absolute',
    top: '33%',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 50,
  },
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 32px',
    background: 'rgba(17, 34, 64, 0.88)',
    borderRadius: '12px',
    border: '2px solid rgba(100, 255, 218, 0.3)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)',
  },
  emoji: {
    fontSize: '28px',
  },
  name: {
    color: '#ccd6f6',
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textShadow: '0 1px 4px rgba(0,0,0,0.4)',
    whiteSpace: 'nowrap' as const,
  },
};
