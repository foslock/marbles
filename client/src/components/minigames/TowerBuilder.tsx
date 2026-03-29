import { useState, useEffect, useRef, useCallback } from 'react';
import type { MinigameComponentProps } from './types';
import { SFX } from '../../utils/sound';

/**
 * Tower Builder
 *
 * A rectangle slides back and forth. Tap to drop it.
 * Only the overlapping width with the tower top is kept — the excess is
 * trimmed and falls off. The next slider is shrunk to the surviving width.
 * Tap when there is zero overlap and the game ends.
 * Score = total area of placed rectangles (width × BLOCK_H).
 *
 * View scrolls to keep the tower top in the lower portion of the screen.
 * Slider speed increases with each successful drop.
 */

// ── Constants ────────────────────────────────────────────────────────────────
const W        = 300;
const SCREEN_H = 520;
const BLOCK_H  = 30;

// "World" Y of the ground platform (before any scroll offset is applied).
const GROUND_WORLD_Y = 448;

// Fixed screen Y of the slider's TOP edge (never moves vertically).
const SLIDER_SCREEN_Y = 52;

// Tower top should approach this screen Y once the tower is tall enough.
const TARGET_TOP_SCREEN_Y = Math.round(SCREEN_H * 0.35); // 182

// px/s
const INITIAL_SPEED = 90;
const SPEED_INC    = 14;
const MAX_SPEED    = 500;

const INITIAL_WIDTH = 220;

const COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#9b59b6',
  '#f39c12', '#1abc9c', '#e67e22', '#2980b9',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** How many px to shift the world div upward so the tower top sits near
 *  TARGET_TOP_SCREEN_Y. Returns 0 until the tower is tall enough. */
function computeViewOffset(towerLen: number): number {
  // Without offset, tower top (in world coords) = GROUND_WORLD_Y - towerLen * BLOCK_H.
  // We want that to appear at TARGET_TOP_SCREEN_Y on screen:
  //   worldY - offset = TARGET_TOP_SCREEN_Y  →  offset = worldY - TARGET_TOP_SCREEN_Y
  const towerTopWorldY = GROUND_WORLD_Y - towerLen * BLOCK_H;
  return Math.max(0, towerTopWorldY - TARGET_TOP_SCREEN_Y);
}

/** Screen Y of the TOP edge of a block landing on a towerLen-block tower,
 *  computed using the NEW offset that will apply after the block is placed. */
function landingScreenY(towerLen: number): number {
  const newLen   = towerLen + 1;
  const offset   = computeViewOffset(newLen);
  const worldY   = GROUND_WORLD_Y - newLen * BLOCK_H; // top of new block in world
  return worldY - offset;
  // Once scrolling is active this is always = TARGET_TOP_SCREEN_Y.
  // Before that it falls naturally from ~418 down to TARGET_TOP_SCREEN_Y.
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Block {
  id:     number;
  x:      number;   // left edge (world X, unaffected by vertical scroll)
  width:  number;
  color:  string;
}

interface DropAnim {
  x:      number;
  width:  number;
  color:  string;
  startY: number;   // screen Y of block TOP at drop moment
  endY:   number;   // screen Y of block TOP at rest
  t:      number;   // 0 → 1
  miss:   boolean;
}

interface PendingLand {
  newBlock:        Block | null; // null ⇒ miss → game over
  nextSliderX:     number;
  nextSliderWidth: number;
  nextColor:       string;
  pts:             number;
  flashX:          number;
}

// ── Component ────────────────────────────────────────────────────────────────
export function TowerBuilder({ onScoreUpdate, config }: MinigameComponentProps) {
  const seed = (config?.seed as number) ?? 42;

  // ── Slider (refs = source of truth; state = render copy) ──
  const sliderXRef     = useRef((W - INITIAL_WIDTH) / 2);
  const sliderWidthRef = useRef(INITIAL_WIDTH);
  const sliderDirRef   = useRef<1 | -1>(1);
  const speedRef       = useRef(INITIAL_SPEED + (seed % 10) * 3);
  const colorIdxRef    = useRef(seed % COLORS.length);

  const [sliderX,    setSliderX]    = useState(sliderXRef.current);
  const [sliderW,    setSliderW]    = useState(INITIAL_WIDTH);
  const [sliderCol,  setSliderCol]  = useState(COLORS[colorIdxRef.current]);

  // ── Tower ──
  const towerRef  = useRef<Block[]>([]);
  const [tower,   setTower]      = useState<Block[]>([]);
  const [viewOff, setViewOff]    = useState(0);

  // ── Drop animation ──
  const dropAnimRef    = useRef<DropAnim | null>(null);
  const [dropAnim,     setDropAnim]    = useState<DropAnim | null>(null);
  const pendingLandRef = useRef<PendingLand | null>(null);

  // ── Flags ──
  const droppingRef  = useRef(false);
  const gameOverRef  = useRef(false);
  const [gameOver,   setGameOver]  = useState(false);

  // ── Score ──
  const scoreRef = useRef(0);
  const [score,  setScore] = useState(0);

  // ── Flash ──
  const [flash, setFlash] = useState<{ pts: number; worldX: number; towerLen: number } | null>(null);

  const lastTRef = useRef(0);
  const rafRef   = useRef(0);

  // ── Main animation loop ────────────────────────────────────────────────────
  useEffect(() => {
    const tick = (now: number) => {
      const dt = lastTRef.current
        ? Math.min((now - lastTRef.current) / 1000, 0.05)
        : 0;
      lastTRef.current = now;

      // Advance slider
      if (!droppingRef.current && !gameOverRef.current) {
        const maxX = W - sliderWidthRef.current;
        let nx = sliderXRef.current + sliderDirRef.current * speedRef.current * dt;
        if (nx <= 0)    { nx = 0;    sliderDirRef.current =  1; }
        if (nx >= maxX) { nx = maxX; sliderDirRef.current = -1; }
        sliderXRef.current = nx;
        setSliderX(nx);
      }

      // Advance drop animation
      const anim = dropAnimRef.current;
      if (anim) {
        const newT    = Math.min(1, anim.t + dt * 4.2); // ≈ 238 ms fall
        const updated = { ...anim, t: newT };
        dropAnimRef.current = updated;
        setDropAnim(updated);

        if (newT >= 1) {
          dropAnimRef.current = null;
          setDropAnim(null);

          const pending = pendingLandRef.current;
          pendingLandRef.current = null;

          if (!pending || pending.newBlock === null) {
            gameOverRef.current = true;
            setGameOver(true);
          } else {
            const newTower = [...towerRef.current, pending.newBlock];
            towerRef.current = newTower;
            setTower(newTower);
            setViewOff(computeViewOffset(newTower.length));

            sliderXRef.current     = pending.nextSliderX;
            sliderWidthRef.current = pending.nextSliderWidth;
            setSliderX(pending.nextSliderX);
            setSliderW(pending.nextSliderWidth);
            setSliderCol(pending.nextColor);

            if (pending.pts > 0) {
              setFlash({ pts: pending.pts, worldX: pending.flashX, towerLen: newTower.length });
              setTimeout(() => setFlash(null), 700);
            }
          }

          droppingRef.current = false;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Tap handler ───────────────────────────────────────────────────────────
  const handleTap = useCallback(() => {
    if (droppingRef.current || gameOverRef.current) return;
    droppingRef.current = true;

    const x          = sliderXRef.current;
    const w          = sliderWidthRef.current;
    const colorIdx   = colorIdxRef.current;
    const color      = COLORS[colorIdx];
    const curTower   = towerRef.current;
    const n          = curTower.length;
    const startY     = SLIDER_SCREEN_Y;

    if (n === 0) {
      // First block — always succeeds, forms the base
      SFX.minigameLand(3);
      const pts = Math.round(w * BLOCK_H);
      scoreRef.current += pts;
      setScore(scoreRef.current);
      onScoreUpdate(scoreRef.current);

      const nextIdx = (colorIdx + 1) % COLORS.length;
      colorIdxRef.current = nextIdx;
      speedRef.current    = Math.min(MAX_SPEED, speedRef.current + SPEED_INC);

      pendingLandRef.current = {
        newBlock:        { id: n, x, width: w, color },
        nextSliderX:     x,
        nextSliderWidth: w,
        nextColor:       COLORS[nextIdx],
        pts,
        flashX:          x + w / 2,
      };

      const endY = landingScreenY(n);
      dropAnimRef.current = { x, width: w, color, startY, endY, t: 0, miss: false };
      setDropAnim(dropAnimRef.current);
      return;
    }

    // Check overlap with the current tower top
    const top      = curTower[n - 1];
    const overlapL = Math.max(x, top.x);
    const overlapR = Math.min(x + w, top.x + top.width);
    const overlapW = overlapR - overlapL;

    if (overlapW <= 0) {
      // Complete miss — animate off-screen then end game
      SFX.minigameFall();
      dropAnimRef.current = {
        x, width: w, color, startY,
        endY: SCREEN_H + 80,
        t: 0, miss: true,
      };
      setDropAnim(dropAnimRef.current);
      pendingLandRef.current = {
        newBlock: null,
        nextSliderX: x, nextSliderWidth: w, nextColor: color,
        pts: 0, flashX: x,
      };
      return;
    }

    // Successful drop — trim to overlap; quality based on fraction retained
    const overlapFrac = overlapW / w;
    const quality: 0 | 1 | 2 | 3 = overlapFrac >= 0.95 ? 3 : overlapFrac >= 0.75 ? 2 : overlapFrac >= 0.45 ? 1 : 0;
    SFX.minigameLand(quality);
    const pts    = Math.round(overlapW * BLOCK_H);
    scoreRef.current += pts;
    setScore(scoreRef.current);
    onScoreUpdate(scoreRef.current);

    const nextIdx = (colorIdx + 1) % COLORS.length;
    colorIdxRef.current = nextIdx;
    speedRef.current    = Math.min(MAX_SPEED, speedRef.current + SPEED_INC);

    pendingLandRef.current = {
      newBlock:        { id: n, x: overlapL, width: overlapW, color },
      nextSliderX:     overlapL,
      nextSliderWidth: overlapW,
      nextColor:       COLORS[nextIdx],
      pts,
      flashX:          overlapL + overlapW / 2,
    };

    const endY = landingScreenY(n);
    dropAnimRef.current = { x, width: w, color, startY, endY, t: 0, miss: false };
    setDropAnim(dropAnimRef.current);
  }, [onScoreUpdate]);

  // ── Derived render values ─────────────────────────────────────────────────
  const dropY = dropAnim
    ? dropAnim.startY + (dropAnim.endY - dropAnim.startY) * (dropAnim.t * dropAnim.t)
    : null;

  return (
    <div
      style={{
        width: W, height: SCREEN_H,
        position: 'relative', overflow: 'hidden',
        touchAction: 'none', userSelect: 'none',
        cursor: gameOver ? 'default' : 'pointer',
        background: 'linear-gradient(180deg, #060f1e 0%, #0a192f 60%, #0d2137 100%)',
        borderRadius: '14px', flexShrink: 0,
      }}
      onPointerDown={!gameOver ? handleTap : undefined}
    >
      {/* Score — always on top */}
      <span style={styles.scoreDisplay}>{score}</span>

      {/* ── Scrolling world (tower + ground + guide + score flash) ── */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translateY(-${viewOff}px)`,
        transition: 'transform 0.22s ease-out',
        willChange: 'transform',
      }}>
        {/* Ground */}
        <div style={{
          position: 'absolute',
          left: '4%', right: '4%',
          top: GROUND_WORLD_Y,
          height: 8,
          background: '#233554',
          borderRadius: 4,
        }} />

        {/* Tower blocks */}
        {tower.map((block, i) => (
          <div
            key={block.id}
            style={{
              position: 'absolute',
              left: block.x,
              top: GROUND_WORLD_Y - (i + 1) * BLOCK_H,
              width: block.width,
              height: BLOCK_H - 2,
              background: block.color,
              borderRadius: 3,
              boxShadow: `0 2px 6px ${block.color}44`,
            }}
          />
        ))}

        {/* Landing guide: a faint line at the current tower top
            (shows where the next block will land) */}
        {!gameOver && !dropAnim && tower.length > 0 && (
          <div style={{
            position: 'absolute',
            left: tower[tower.length - 1].x,
            width: tower[tower.length - 1].width,
            top: GROUND_WORLD_Y - tower.length * BLOCK_H - 1,
            height: 2,
            background: 'rgba(255,255,255,0.18)',
            borderRadius: 1,
            pointerEvents: 'none',
          }} />
        )}

        {/* Score flash — anchored to tower top in world space */}
        {flash && (
          <div style={{
            position: 'absolute',
            left: flash.worldX - 28,
            top: GROUND_WORLD_Y - flash.towerLen * BLOCK_H - 34,
            width: 56,
            textAlign: 'center',
            fontSize: '16px', fontWeight: 800, color: '#f39c12',
            pointerEvents: 'none',
          }}>
            +{flash.pts}
          </div>
        )}
      </div>

      {/* ── Sliding rectangle — fixed screen position, outside scroll div ── */}
      {!dropAnim && !gameOver && (
        <div style={{
          position: 'absolute',
          left: sliderX,
          top: SLIDER_SCREEN_Y,
          width: sliderW,
          height: BLOCK_H - 2,
          background: sliderCol,
          borderRadius: 3,
          boxShadow: `0 0 18px ${sliderCol}99, 0 0 4px ${sliderCol}`,
        }} />
      )}

      {/* ── Dropping animation (screen coords, outside scroll div) ── */}
      {dropAnim && dropY !== null && (
        <div style={{
          position: 'absolute',
          left: dropAnim.x,
          top: dropY,
          width: dropAnim.width,
          height: BLOCK_H - 2,
          background: dropAnim.color,
          borderRadius: 3,
          opacity: dropAnim.miss ? Math.max(0, 1 - dropAnim.t * 1.5) : 1,
          boxShadow: dropAnim.miss ? 'none' : `0 0 12px ${dropAnim.color}77`,
        }} />
      )}

      {/* ── Game over overlay ── */}
      {gameOver && (
        <div style={styles.gameOverOverlay}>
          <span style={styles.gameOverTitle}>GAME OVER</span>
          <span style={styles.gameOverScore}>{score}</span>
          <span style={styles.gameOverSub}>Total area stacked</span>
        </div>
      )}

      {!gameOver && <span style={styles.hint}>TAP TO DROP</span>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  scoreDisplay: {
    position: 'absolute', top: 10, right: 14, zIndex: 10,
    color: '#f39c12', fontSize: '22px', fontWeight: 800,
    pointerEvents: 'none',
  },
  gameOverOverlay: {
    position: 'absolute', inset: 0, zIndex: 20,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '6px',
    background: 'rgba(0,0,0,0.65)',
  },
  gameOverTitle: { color: '#e74c3c', fontSize: '30px', fontWeight: 900, letterSpacing: '2px' },
  gameOverScore: { color: '#f39c12', fontSize: '52px', fontWeight: 800, lineHeight: 1.1 },
  gameOverSub:   { color: '#8892b0', fontSize: '14px' },
  hint: {
    position: 'absolute', bottom: 10, left: 0, right: 0, zIndex: 10,
    textAlign: 'center', color: '#5a6a8a',
    fontSize: '11px', letterSpacing: '1px',
    pointerEvents: 'none',
  },
};
