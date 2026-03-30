import { useState } from 'react';

const PAGES = [
  {
    title: 'The Goal',
    body: 'Be the first player to collect the target number of marbles! The host sets the goal (default 10). Earn marbles from special tiles, minigame prizes, or by converting points.',
    graphic: 'goal',
  },
  {
    title: 'Your Turn',
    body: '1. Roll the dice by flicking it across the screen.\n2. Choose which highlighted tile to move to.\n3. Your tile\'s hidden effect is revealed and applied!',
    graphic: 'turn',
  },
  {
    title: 'Tile Colors',
    body: 'Tiles are hidden until landed on. The color hints at what\'s inside:\n\nGreen = positive (gain points, marbles, modifiers)\nRed = negative (lose points, marbles, dizzy)\nNeutral = fortune cookie (a funny message)',
    graphic: 'tiles',
  },
  {
    title: 'Points & Marbles',
    body: 'Every 100 points you earn automatically converts into 1 marble. The remainder stays as points. For example: 150 pts becomes 1 marble + 50 pts.',
    graphic: 'conversion',
  },
  {
    title: 'Minigames',
    body: 'Land on a tile with another player and a minigame triggers! Everyone plays — top 3 earn prize points (or rarely, marbles). If 3+ players share a tile, prizes are doubled!',
    graphic: 'minigame',
  },
  {
    title: 'Power-ups',
    body: 'Green tiles can grant special modifiers:\n\nAdvantage — Roll 2 dice, pick the best\nDouble Dice — Roll 2 dice, move their sum\nProtection — Block the next red tile\nShort Stop — Stop anywhere along your path',
    graphic: 'powerups',
  },
  {
    title: 'Forks & Strategy',
    body: 'The board has branching paths! At fork tiles, choose the main loop or an alternate route. Different paths have different risks and rewards. Choose wisely!',
    graphic: 'forks',
  },
];

interface Props {
  onClose: () => void;
}

export function HowToPlayDialog({ onClose }: Props) {
  const [page, setPage] = useState(0);
  const current = PAGES[page];

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        {/* Page indicator */}
        <div style={styles.dots}>
          {PAGES.map((_, i) => (
            <button
              key={i}
              style={{
                ...styles.dot,
                ...(i === page ? styles.dotActive : {}),
              }}
              onClick={() => setPage(i)}
            />
          ))}
        </div>

        {/* Graphic */}
        <div style={styles.graphicArea}>
          <PageGraphic type={current.graphic} />
        </div>

        {/* Content */}
        <h2 style={styles.title}>{current.title}</h2>
        <p style={styles.body}>{current.body}</p>

        {/* Navigation */}
        <div style={styles.nav}>
          {page > 0 ? (
            <button style={styles.navBtn} onClick={() => setPage(page - 1)}>
              Back
            </button>
          ) : (
            <div />
          )}
          {page < PAGES.length - 1 ? (
            <button style={styles.navBtnPrimary} onClick={() => setPage(page + 1)}>
              Next
            </button>
          ) : (
            <button style={styles.navBtnPrimary} onClick={onClose}>
              Got it!
            </button>
          )}
        </div>

        <button style={styles.closeBtn} onClick={onClose}>
          &times;
        </button>
      </div>
    </div>
  );
}

/* ── Inline graphics for each page ─────────────────────────────────────────── */

function PageGraphic({ type }: { type: string }) {
  switch (type) {
    case 'goal':
      return (
        <div style={styles.graphicRow}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ ...styles.marble, animationDelay: `${i * 0.15}s` }}>
              <div style={styles.marbleInner} />
            </div>
          ))}
        </div>
      );

    case 'turn':
      return (
        <div style={styles.graphicRow}>
          <div style={styles.stepBox}>
            <span style={styles.stepIcon}>🎲</span>
            <span style={styles.stepLabel}>Roll</span>
          </div>
          <span style={styles.stepArrow}>&#8594;</span>
          <div style={styles.stepBox}>
            <span style={styles.stepIcon}>👆</span>
            <span style={styles.stepLabel}>Move</span>
          </div>
          <span style={styles.stepArrow}>&#8594;</span>
          <div style={styles.stepBox}>
            <span style={styles.stepIcon}>✨</span>
            <span style={styles.stepLabel}>Effect</span>
          </div>
        </div>
      );

    case 'tiles':
      return (
        <div style={styles.graphicRow}>
          <div style={styles.tileDemo}>
            <div style={{ ...styles.tileSwatch, background: '#27ae60' }}>?</div>
            <span style={styles.tileLabel}>Good</span>
          </div>
          <div style={styles.tileDemo}>
            <div style={{ ...styles.tileSwatch, background: '#e74c3c' }}>?</div>
            <span style={styles.tileLabel}>Bad</span>
          </div>
          <div style={styles.tileDemo}>
            <div style={{ ...styles.tileSwatch, background: '#546e7a' }}>?</div>
            <span style={styles.tileLabel}>Neutral</span>
          </div>
        </div>
      );

    case 'conversion':
      return (
        <div style={styles.graphicRow}>
          <div style={styles.conversionBox}>
            <span style={styles.conversionNum}>100</span>
            <span style={styles.conversionUnit}>pts</span>
          </div>
          <span style={styles.stepArrow}>&#61;</span>
          <div style={{ ...styles.marble, animation: 'none' }}>
            <div style={styles.marbleInner} />
          </div>
          <span style={styles.conversionLabel}>1 marble</span>
        </div>
      );

    case 'minigame':
      return (
        <div style={styles.graphicRow}>
          <div style={styles.minigameScene}>
            <div style={styles.mgToken1}>🔵</div>
            <div style={styles.mgToken2}>🔴</div>
            <div style={styles.mgTile}>
              <div style={{ ...styles.tileSwatch, background: '#546e7a', fontSize: '14px' }}>⚔</div>
            </div>
            <div style={styles.mgLabel}>Battle!</div>
          </div>
        </div>
      );

    case 'powerups':
      return (
        <div style={styles.powerupGrid}>
          <div style={styles.powerupItem}>
            <span style={styles.powerupIcon}>🎯</span>
            <span style={styles.powerupName}>Advantage</span>
          </div>
          <div style={styles.powerupItem}>
            <span style={styles.powerupIcon}>🎲🎲</span>
            <span style={styles.powerupName}>Double</span>
          </div>
          <div style={styles.powerupItem}>
            <span style={styles.powerupIcon}>🛡</span>
            <span style={styles.powerupName}>Protection</span>
          </div>
          <div style={styles.powerupItem}>
            <span style={styles.powerupIcon}>🛑</span>
            <span style={styles.powerupName}>Short Stop</span>
          </div>
        </div>
      );

    case 'forks':
      return (
        <svg viewBox="0 0 200 80" style={styles.forkSvg}>
          {/* Main path */}
          <line x1="20" y1="40" x2="70" y2="40" stroke="#546e7a" strokeWidth="3" />
          <line x1="130" y1="40" x2="180" y2="40" stroke="#546e7a" strokeWidth="3" />
          {/* Fork */}
          <line x1="70" y1="40" x2="100" y2="20" stroke="#27ae60" strokeWidth="3" />
          <line x1="100" y1="20" x2="130" y2="40" stroke="#27ae60" strokeWidth="3" />
          <line x1="70" y1="40" x2="100" y2="60" stroke="#e74c3c" strokeWidth="3" />
          <line x1="100" y1="60" x2="130" y2="40" stroke="#e74c3c" strokeWidth="3" />
          {/* Nodes */}
          <circle cx="20" cy="40" r="6" fill="#1a2e4a" stroke="#546e7a" strokeWidth="2" />
          <circle cx="70" cy="40" r="7" fill="#1a2e4a" stroke="#f39c12" strokeWidth="2" />
          <circle cx="100" cy="20" r="6" fill="#1a2e4a" stroke="#27ae60" strokeWidth="2" />
          <circle cx="100" cy="60" r="6" fill="#1a2e4a" stroke="#e74c3c" strokeWidth="2" />
          <circle cx="130" cy="40" r="7" fill="#1a2e4a" stroke="#f39c12" strokeWidth="2" />
          <circle cx="180" cy="40" r="6" fill="#1a2e4a" stroke="#546e7a" strokeWidth="2" />
          {/* Labels */}
          <text x="100" y="14" textAnchor="middle" fill="#27ae60" fontSize="9" fontWeight="600">safe path</text>
          <text x="100" y="76" textAnchor="middle" fill="#e74c3c" fontSize="9" fontWeight="600">risky path</text>
          <text x="70" y="55" textAnchor="middle" fill="#f39c12" fontSize="8">fork</text>
        </svg>
      );

    default:
      return null;
  }
}

/* ── Styles ────────────────────────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    padding: '16px',
    backdropFilter: 'blur(4px)',
  },
  dialog: {
    position: 'relative',
    background: '#112240',
    borderRadius: '20px',
    padding: '24px 20px 20px',
    maxWidth: '360px',
    width: '100%',
    maxHeight: '85vh',
    overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    border: '1px solid #233554',
  },
  closeBtn: {
    position: 'absolute',
    top: '8px',
    right: '12px',
    background: 'none',
    border: 'none',
    color: '#8892b0',
    fontSize: '24px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '4px',
  },
  dots: {
    display: 'flex',
    justifyContent: 'center',
    gap: '6px',
    marginBottom: '16px',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    border: 'none',
    background: '#233554',
    cursor: 'pointer',
    padding: 0,
    transition: 'background 0.2s, transform 0.2s',
  },
  dotActive: {
    background: '#f39c12',
    transform: 'scale(1.3)',
  },
  graphicArea: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '80px',
    marginBottom: '16px',
  },
  title: {
    color: '#ccd6f6',
    fontSize: '22px',
    fontWeight: 700,
    textAlign: 'center',
    margin: '0 0 10px',
  },
  body: {
    color: '#a8b2d1',
    fontSize: '14px',
    lineHeight: 1.6,
    textAlign: 'center',
    margin: '0 0 20px',
    whiteSpace: 'pre-line',
  },
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navBtn: {
    padding: '10px 20px',
    borderRadius: '10px',
    border: '1px solid #233554',
    background: 'transparent',
    color: '#8892b0',
    fontSize: '14px',
    cursor: 'pointer',
  },
  navBtnPrimary: {
    padding: '10px 24px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },

  /* ── Graphic elements ── */
  graphicRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  marble: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 35%, #f5d76e, #f39c12, #d35400)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(243,156,18,0.4), inset 0 -2px 4px rgba(0,0,0,0.2)',
    animation: 'htpBounce 0.6s ease-out both',
  },
  marbleInner: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: 'radial-gradient(circle at 40% 40%, rgba(255,255,255,0.6), transparent)',
  },
  stepBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    background: '#1a2e4a',
    borderRadius: '12px',
    padding: '10px 14px',
    border: '1px solid #233554',
  },
  stepIcon: {
    fontSize: '24px',
  },
  stepLabel: {
    fontSize: '11px',
    color: '#a8b2d1',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  stepArrow: {
    color: '#f39c12',
    fontSize: '20px',
    fontWeight: 700,
  },
  tileDemo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  },
  tileSwatch: {
    width: '42px',
    height: '42px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '20px',
    fontWeight: 700,
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  tileLabel: {
    fontSize: '11px',
    color: '#a8b2d1',
    fontWeight: 600,
  },
  conversionBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: '#1a2e4a',
    borderRadius: '10px',
    padding: '8px 14px',
    border: '1px solid #233554',
  },
  conversionNum: {
    color: '#ccd6f6',
    fontSize: '22px',
    fontWeight: 800,
  },
  conversionUnit: {
    color: '#8892b0',
    fontSize: '10px',
    textTransform: 'uppercase' as const,
  },
  conversionLabel: {
    color: '#f39c12',
    fontSize: '13px',
    fontWeight: 600,
  },
  minigameScene: {
    position: 'relative',
    width: '120px',
    height: '80px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mgToken1: {
    position: 'absolute',
    fontSize: '22px',
    left: '20px',
    top: '10px',
    animation: 'htpSlideRight 1s ease-in-out infinite alternate',
  },
  mgToken2: {
    position: 'absolute',
    fontSize: '22px',
    right: '20px',
    top: '10px',
    animation: 'htpSlideLeft 1s ease-in-out infinite alternate',
  },
  mgTile: {
    zIndex: 1,
  },
  mgLabel: {
    position: 'absolute',
    bottom: '0',
    color: '#f39c12',
    fontSize: '14px',
    fontWeight: 700,
  },
  powerupGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  powerupItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: '#1a2e4a',
    borderRadius: '10px',
    padding: '8px 12px',
    border: '1px solid #233554',
  },
  powerupIcon: {
    fontSize: '18px',
  },
  powerupName: {
    fontSize: '12px',
    color: '#a8b2d1',
    fontWeight: 600,
  },
  forkSvg: {
    width: '100%',
    maxWidth: '220px',
  },
};
