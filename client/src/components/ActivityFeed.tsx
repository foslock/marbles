import { useEffect, useRef, useState } from 'react';
import type { ActivityItem } from '../types/game';

interface Props {
  items: ActivityItem[];
  /** When true, tapping the feed opens a scrollable history of all events */
  expandable?: boolean;
}

/** How many items are visible in the collapsed feed */
const VISIBLE_COUNT = 5;
/**
 * Opacity for each slot, from oldest (index 0) to newest (index 4).
 * The 3 newest are fully visible; the 4th and 5th fade out progressively.
 */
const SLOT_OPACITIES = [0.12, 0.35, 1, 1, 1];

const COLOR_MAP: Record<ActivityItem['color'], string> = {
  green: '#2ecc71',
  red: '#e74c3c',
  gold: '#f39c12',
  neutral: '#8892b0',
};

export function ActivityFeed({ items, expandable = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the expanded scroll pinned to bottom when new items arrive
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items, expanded]);

  if (items.length === 0) return null;

  // ── Expanded overlay (spectator tapped to view history) ─────────────────
  if (expanded) {
    return (
      <div style={styles.expandedBackdrop} onClick={() => setExpanded(false)}>
        <div
          ref={scrollRef}
          style={styles.expandedScroll}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <div
              key={item.id}
              style={{ ...styles.item, color: COLOR_MAP[item.color], borderLeftColor: COLOR_MAP[item.color] }}
            >
              {item.message}
            </div>
          ))}
        </div>
        <div style={styles.expandedHint}>Tap outside to close</div>
      </div>
    );
  }

  // ── Collapsed feed — shows last VISIBLE_COUNT items with fade ───────────
  const recentItems = items.slice(-VISIBLE_COUNT);

  return (
    <div
      style={styles.feed}
      onClick={expandable ? () => setExpanded(true) : undefined}
    >
      {recentItems.map((item, i) => {
        // opacityIndex maps position in the visible slice to a slot opacity
        const opacityIndex = SLOT_OPACITIES.length - recentItems.length + i;
        const opacity = SLOT_OPACITIES[Math.max(0, opacityIndex)];
        const accentColor = COLOR_MAP[item.color];
        return (
          <div
            key={item.id}
            style={{
              ...styles.item,
              color: accentColor,
              borderLeftColor: accentColor,
              opacity,
              // Slightly scale down older (more faded) entries for extra depth
              transform: opacity < 1 ? `scale(${0.92 + opacity * 0.08})` : 'none',
              transformOrigin: 'left center',
            }}
          >
            {item.message}
          </div>
        );
      })}
      {expandable && (
        <div style={styles.tapHint}>Tap to see history</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  feed: {
    position: 'absolute',
    bottom: '16px',
    left: '16px',
    width: '220px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    pointerEvents: 'auto',
    zIndex: 15,
  },
  item: {
    fontSize: '12px',
    fontWeight: 500,
    lineHeight: 1.3,
    padding: '4px 8px',
    borderLeft: '2px solid',
    background: 'rgba(10, 25, 47, 0.75)',
    borderRadius: '0 6px 6px 0',
    backdropFilter: 'blur(4px)',
    transition: 'opacity 0.4s ease, transform 0.4s ease',
    wordBreak: 'break-word',
  },
  tapHint: {
    fontSize: '10px',
    color: 'rgba(136, 146, 176, 0.6)',
    paddingLeft: '10px',
    marginTop: '2px',
    letterSpacing: '0.5px',
  },
  // Expanded overlay
  expandedBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    padding: '16px',
    gap: '8px',
  },
  expandedScroll: {
    width: '280px',
    maxHeight: '60vh',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    background: 'rgba(10, 25, 47, 0.95)',
    borderRadius: '12px',
    padding: '12px',
    border: '1px solid #233554',
  },
  expandedHint: {
    fontSize: '11px',
    color: 'rgba(136, 146, 176, 0.7)',
    letterSpacing: '0.5px',
  },
};
