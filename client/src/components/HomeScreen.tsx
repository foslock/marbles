import { useState, useEffect, useRef } from 'react';
import { MINIGAME_REGISTRY } from './minigames';
import { TapFrenzy } from './minigames/TapFrenzy';
import { HowToPlayDialog } from './HowToPlayDialog';
import { SFX } from '../utils/sound';
import { Haptics } from '../utils/haptics';

// Inject keyframe animations once
const ANIM_STYLE_ID = 'ltm-home-anims';
if (typeof document !== 'undefined' && !document.getElementById(ANIM_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = ANIM_STYLE_ID;
  style.textContent = `
    @keyframes ltmGradientPan {
      0%   { background-position: 0% 50%; }
      100% { background-position: -200% 50%; }
    }
    @keyframes ltmFloat {
      0%, 100% { transform: translateY(0) scale(1); opacity: 0.15; }
      50% { transform: translateY(-30px) scale(1.1); opacity: 0.25; }
    }
    @keyframes ltmBtnGlow {
      0%   { box-shadow: 0 4px 15px rgba(231, 76, 60, 0.3); }
      50%  { box-shadow: 0 4px 25px rgba(231, 76, 60, 0.6); }
      100% { box-shadow: 0 4px 15px rgba(231, 76, 60, 0.3); }
    }
    @keyframes htpBounce {
      0%   { transform: scale(0) translateY(10px); opacity: 0; }
      60%  { transform: scale(1.15) translateY(-3px); opacity: 1; }
      100% { transform: scale(1) translateY(0); opacity: 1; }
    }
    @keyframes htpSlideRight {
      0%   { transform: translateX(0); }
      100% { transform: translateX(18px); }
    }
    @keyframes htpSlideLeft {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-18px); }
    }
    .ltm-btn-hover {
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    }
    .ltm-btn-hover:hover {
      transform: translateY(-2px) scale(1.03);
    }
    .ltm-btn-hover:active {
      transform: translateY(0) scale(0.98);
    }
    .ltm-primary-hover:hover {
      box-shadow: 0 6px 24px rgba(231, 76, 60, 0.5);
    }
    .ltm-secondary-hover:hover {
      border-color: #5dade2;
      color: #5dade2;
      box-shadow: 0 4px 20px rgba(52, 152, 219, 0.3);
    }
    .ltm-playtest-hover:hover {
      border-color: #a8b2d1;
      color: #a8b2d1;
      box-shadow: 0 4px 16px rgba(136, 146, 176, 0.2);
    }
    .ltm-htp-hover:hover {
      border-color: #f5b041;
      color: #f5b041;
      box-shadow: 0 4px 20px rgba(243, 156, 18, 0.3);
    }
  `;
  document.head.appendChild(style);
}

// Client-side minigame definitions matching server/app/game/minigames/base.py
const PLAYTEST_MINIGAMES = [
  { id: 'tap_frenzy', name: 'Tap Frenzy', instructions: 'Tap the screen as many times as possible in 5 seconds.', duration: 5000, type: 'tap_count' },
  { id: 'ball_tracker', name: 'Ball Tracker', instructions: 'A ball bounces around the screen. Hold your finger on it to score points.', duration: 7000, type: 'tracking' },
  { id: 'rhythm_tap', name: 'Rhythm Pulse', instructions: 'The screen pulses to a rhythm. Tap in sync with the beat as accurately as possible.', duration: 6000, type: 'rhythm' },
  { id: 'canvas_fill', name: 'Color Rush', instructions: 'Draw with your finger to fill as much of the canvas as possible.', duration: 5000, type: 'canvas_fill' },
  { id: 'tilt_chase', name: 'Tilt Chase', instructions: 'Tilt your device to guide your dot to follow the target dot.', duration: 7000, type: 'accelerometer' },
  { id: 'reaction_snap', name: 'Reaction Snap', instructions: 'Wait for the screen to turn green, then tap as fast as possible. Fastest reaction wins!', duration: 5000, type: 'reaction' },
  { id: 'size_judge', name: 'Size Matters', instructions: 'A circle appears — drag or pinch to match its size exactly. Closest match wins!', duration: 6000, type: 'size_match' },
  { id: 'memory_flash', name: 'Memory Flash', instructions: 'Colored tiles flash in a sequence. Repeat the sequence from memory. Longest correct streak wins!', duration: 24000, type: 'memory' },
  { id: 'swipe_dodge', name: 'Swipe Dodge', instructions: 'Swipe left/right to dodge falling obstacles. Dodge as many as possible!', duration: 20000, type: 'dodge' },
  { id: 'target_pop', name: 'Target Pop', instructions: 'Targets appear randomly on screen. Tap them before they disappear. Most pops wins!', duration: 5000, type: 'target_tap' },
  { id: 'tower_builder', name: 'Tower Builder', instructions: 'A block slides back and forth. Tap to drop it — overlap with the block below is kept. Stack as high as possible!', duration: 45000, type: 'tower_builder' },
  { id: 'color_drop', name: 'Color Drop', instructions: 'A marble falls from the top. Tap the matching coloured bucket before it hits the ground!', duration: 18000, type: 'color_drop' },
  { id: 'marble_runner', name: 'Marble Runner', instructions: 'Your marble rolls forward automatically. Swipe up to jump over ground spikes, swipe down to duck under ceiling bars!', duration: 30000, type: 'marble_runner' },
  { id: 'light_switch', name: 'Light Switch', instructions: 'Swipe up to turn the light ON, swipe down to turn it OFF. Flick as many times as possible!', duration: 7000, type: 'light_switch' },
  { id: 'pump_it', name: 'Pump It', instructions: 'Drag the pump handle DOWN then back UP to pump. Keep pumping to push past 100%!', duration: 12000, type: 'pump_it' },
];

function makePlaytestConfig(type: string): Record<string, unknown> {
  const rand = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
  switch (type) {
    case 'rhythm': return { bpm: rand(80, 160) };
    case 'tracking': return { seed: rand(0, 999999) };
    case 'target_tap': return { seed: rand(0, 999999) };
    case 'reaction': return { delays: Array.from({ length: 6 }, () => rand(800, 2500)) };
    case 'accelerometer': return { seed: rand(0, 999999) };
    case 'size_match': return { targetSizes: Array.from({ length: 5 }, () => rand(40, 200)) };
    case 'memory': return { sequence: Array.from({ length: 16 }, () => rand(0, 3)) };
    case 'dodge': return { seed: rand(0, 999999) };
    case 'tower_builder': return { seed: rand(0, 999999) };
    case 'color_drop': return { seed: rand(0, 999999) };
    case 'marble_runner': return { seed: rand(0, 999999) };
    default: return {};
  }
}

// Generate random floating marble positions for background
const BG_MARBLES = Array.from({ length: 12 }, (_, i) => ({
  left: `${5 + (i * 8) % 90}%`,
  top: `${10 + ((i * 17 + 3) % 80)}%`,
  size: 10 + (i % 4) * 6,
  delay: i * 1.2,
  duration: 4 + (i % 3) * 2,
  color: ['#f39c12', '#e74c3c', '#9b59b6', '#3498db', '#2ecc71', '#e67e22'][i % 6],
}));

interface Props {
  connected: boolean;
  onCreateSession: (name: string, targetMarbles: number) => void;
  onJoinSession: (passphrase: string, name: string, role: string) => void;
}

export function HomeScreen({ connected, onCreateSession, onJoinSession }: Props) {
  const [mode, setMode] = useState<'menu' | 'create' | 'join' | 'playtest' | 'playtest-playing' | 'playtest-done'>('menu');
  const [name, setName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [targetMarbles, setTargetMarbles] = useState(10);
  const [role, setRole] = useState<'player' | 'spectator'>('player');
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  // Playtest state
  const [selectedMinigame, setSelectedMinigame] = useState(PLAYTEST_MINIGAMES[0].type);
  const [playtestPhase, setPlaytestPhase] = useState<'countdown' | 'playing' | 'done'>('countdown');
  const [playtestCountdown, setPlaytestCountdown] = useState(3);
  const [playtestTimeLeft, setPlaytestTimeLeft] = useState(0);
  const [playtestDuration, setPlaytestDuration] = useState(0);
  const [playtestConfig, setPlaytestConfig] = useState<Record<string, unknown>>({});
  const playtestScoreRef = useRef(0);
  const [playtestFinalScore, setPlaytestFinalScore] = useState(0);

  const startPlaytest = () => {
    const mg = PLAYTEST_MINIGAMES.find((m) => m.type === selectedMinigame) || PLAYTEST_MINIGAMES[0];
    playtestScoreRef.current = 0;
    setPlaytestFinalScore(0);
    setPlaytestDuration(mg.duration);
    setPlaytestTimeLeft(mg.duration);
    setPlaytestConfig(makePlaytestConfig(mg.type));
    setPlaytestCountdown(3);
    setPlaytestPhase('countdown');
    setMode('playtest-playing');
  };

  // Playtest countdown
  useEffect(() => {
    if (mode !== 'playtest-playing' || playtestPhase !== 'countdown') return;
    if (playtestCountdown <= 0) {
      SFX.countdownGo();
      Haptics.heavy();
      setPlaytestPhase('playing');
      return;
    }
    SFX.countdownTick();
    Haptics.light();
    const timer = setTimeout(() => setPlaytestCountdown(playtestCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [mode, playtestPhase, playtestCountdown]);

  // Playtest game timer
  useEffect(() => {
    if (mode !== 'playtest-playing' || playtestPhase !== 'playing') return;
    if (playtestTimeLeft <= 0) {
      setPlaytestPhase('done');
      setPlaytestFinalScore(playtestScoreRef.current);
      SFX.minigameComplete();
      Haptics.medium();
      return;
    }
    const timer = setTimeout(() => setPlaytestTimeLeft(playtestTimeLeft - 100), 100);
    return () => clearTimeout(timer);
  }, [mode, playtestPhase, playtestTimeLeft]);

  const handlePlaytestScore = (score: number) => {
    if (score > playtestScoreRef.current) {
      playtestScoreRef.current = score;
    }
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreateSession(name.trim(), targetMarbles);
  };

  const handleJoin = () => {
    if (!name.trim() || !passphrase.trim()) return;
    onJoinSession(passphrase.trim().toLowerCase(), name.trim(), role);
  };

  return (
    <div style={styles.container}>
      {/* Floating background marbles */}
      <div style={styles.bgMarbles}>
        {BG_MARBLES.map((m, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: m.left,
              top: m.top,
              width: m.size,
              height: m.size,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${m.color}66, ${m.color}22)`,
              animation: `ltmFloat ${m.duration}s ease-in-out ${m.delay}s infinite`,
              pointerEvents: 'none',
            }}
          />
        ))}
      </div>

      <div style={styles.titleContainer}>
        <h1 style={styles.title}>Losing Their</h1>
        <h1 style={styles.titleMarbles}>Marbles</h1>
        <p style={styles.subtitle}>A party game for people who enjoy chaos</p>
      </div>

      {mode === 'menu' && (
        <div style={styles.buttonGroup}>
          <button
            className="ltm-btn-hover ltm-primary-hover"
            style={{
              ...styles.primaryButton,
              ...(!connected ? styles.disabledButton : {}),
              animation: connected ? 'ltmBtnGlow 3s ease-in-out infinite' : 'none',
            }}
            onClick={() => connected && setMode('create')}
            disabled={!connected}
          >
            {connected ? 'Host a Game' : 'Connecting\u2026'}
          </button>
          <button
            className="ltm-btn-hover ltm-secondary-hover"
            style={{ ...styles.secondaryButton, ...(!connected ? styles.disabledButton : {}) }}
            onClick={() => connected && setMode('join')}
            disabled={!connected}
          >
            Join a Game
          </button>
          <button
            className="ltm-btn-hover ltm-htp-hover"
            style={styles.howToPlayButton}
            onClick={() => setShowHowToPlay(true)}
          >
            How to Play
          </button>
          <button
            className="ltm-btn-hover ltm-playtest-hover"
            style={styles.playtestButton}
            onClick={() => setMode('playtest')}
          >
            Playtest Minigames
          </button>
        </div>
      )}

      {mode === 'create' && (
        <div style={styles.form}>
          <input
            style={styles.input}
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={12}
            autoFocus
          />
          <div style={styles.settingRow}>
            <label style={styles.label}>Target Marbles:</label>
            <div style={styles.stepper}>
              <button
                style={styles.stepperBtn}
                onClick={() => setTargetMarbles(Math.max(3, targetMarbles - 1))}
              >
                -
              </button>
              <span style={styles.stepperValue}>{targetMarbles}</span>
              <button
                style={styles.stepperBtn}
                onClick={() => setTargetMarbles(Math.min(25, targetMarbles + 1))}
              >
                +
              </button>
            </div>
          </div>
          <button className="ltm-btn-hover ltm-primary-hover" style={styles.primaryButton} onClick={handleCreate}>
            Create Game
          </button>
          <button style={styles.textButton} onClick={() => setMode('menu')}>
            Back
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div style={styles.form}>
          <input
            style={styles.input}
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={12}
            autoFocus
          />
          <input
            style={styles.input}
            placeholder="Passphrase (e.g. wobbly-penguin)"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          <div style={styles.roleToggle}>
            <button
              style={{
                ...styles.roleBtn,
                ...(role === 'player' ? styles.roleBtnActive : {}),
              }}
              onClick={() => setRole('player')}
            >
              Player
            </button>
            <button
              style={{
                ...styles.roleBtn,
                ...(role === 'spectator' ? styles.roleBtnActive : {}),
              }}
              onClick={() => setRole('spectator')}
            >
              Spectator
            </button>
          </div>
          <button className="ltm-btn-hover ltm-primary-hover" style={styles.primaryButton} onClick={handleJoin}>
            Join Game
          </button>
          <button style={styles.textButton} onClick={() => setMode('menu')}>
            Back
          </button>
        </div>
      )}

      {mode === 'playtest' && (
        <div style={styles.form}>
          <label style={styles.label}>Select a minigame:</label>
          <select
            style={styles.select}
            value={selectedMinigame}
            onChange={(e) => setSelectedMinigame(e.target.value)}
          >
            {PLAYTEST_MINIGAMES.map((mg) => (
              <option key={mg.type} value={mg.type}>{mg.name}</option>
            ))}
          </select>
          <p style={styles.playtestInstructions}>
            {PLAYTEST_MINIGAMES.find((m) => m.type === selectedMinigame)?.instructions}
          </p>
          <button className="ltm-btn-hover ltm-primary-hover" style={styles.primaryButton} onClick={startPlaytest}>
            Play
          </button>
          <button style={styles.textButton} onClick={() => setMode('menu')}>
            Back
          </button>
        </div>
      )}

      {mode === 'playtest-playing' && (() => {
        const mg = PLAYTEST_MINIGAMES.find((m) => m.type === selectedMinigame) || PLAYTEST_MINIGAMES[0];
        const GameComponent = MINIGAME_REGISTRY[mg.type] || TapFrenzy;
        const progressPercent = playtestPhase === 'playing' ? (playtestTimeLeft / playtestDuration) * 100 : 100;

        return (
          <div style={styles.playtestContainer}>
            {playtestPhase === 'countdown' && (
              <div style={styles.playtestCenter}>
                <h2 style={styles.playtestName}>{mg.name}</h2>
                <p style={styles.playtestInstr}>{mg.instructions}</p>
                <div style={styles.playtestCountdown}>
                  {playtestCountdown > 0 ? playtestCountdown : 'GO!'}
                </div>
              </div>
            )}

            {playtestPhase === 'playing' && (
              <div style={styles.playtestGameArea}>
                <div style={styles.playtestProgressBar}>
                  <div style={{ ...styles.playtestProgressFill, width: `${progressPercent}%` }} />
                </div>
                <GameComponent
                  onScoreUpdate={handlePlaytestScore}
                  timeLeft={playtestTimeLeft}
                  duration={playtestDuration}
                  config={playtestConfig}
                />
              </div>
            )}

            {playtestPhase === 'done' && (
              <div style={styles.playtestCenter}>
                <h2 style={styles.playtestDoneTitle}>Time's Up!</h2>
                <span style={styles.playtestScore}>{playtestFinalScore}</span>
                <button className="ltm-btn-hover ltm-primary-hover" style={{ ...styles.primaryButton, marginTop: '24px' }} onClick={() => setMode('playtest')}>
                  Back to Minigames
                </button>
                <button style={styles.textButton} onClick={() => setMode('menu')}>
                  Home
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {showHowToPlay && <HowToPlayDialog onClose={() => setShowHowToPlay(false)} />}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '20px',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    position: 'relative',
    overflow: 'hidden',
  },
  bgMarbles: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  titleContainer: {
    textAlign: 'center',
    marginBottom: '40px',
    position: 'relative',
    zIndex: 1,
  },
  title: {
    fontSize: '36px',
    fontWeight: 300,
    color: '#a8b2d1',
    margin: 0,
    letterSpacing: '2px',
  },
  titleMarbles: {
    fontSize: '52px',
    fontWeight: 800,
    background: 'linear-gradient(90deg, #f39c12, #e74c3c, #9b59b6, #3498db, #f39c12, #e74c3c)',
    backgroundSize: '200% 100%',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
    animation: 'ltmGradientPan 6s linear infinite',
  },
  subtitle: {
    color: '#8892b0',
    marginTop: '8px',
    fontSize: '14px',
    fontStyle: 'italic',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
    maxWidth: '300px',
    position: 'relative',
    zIndex: 1,
  },
  disabledButton: {
    opacity: 0.45,
    cursor: 'not-allowed',
    animation: 'none',
  },
  primaryButton: {
    padding: '16px 32px',
    fontSize: '18px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
    color: '#fff',
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '16px 32px',
    fontSize: '18px',
    fontWeight: 600,
    border: '2px solid #3498db',
    borderRadius: '12px',
    background: 'transparent',
    color: '#3498db',
    cursor: 'pointer',
  },
  howToPlayButton: {
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: 600,
    border: '2px solid #f39c12',
    borderRadius: '12px',
    background: 'transparent',
    color: '#f39c12',
    cursor: 'pointer',
  },
  textButton: {
    background: 'none',
    border: 'none',
    color: '#8892b0',
    fontSize: '14px',
    cursor: 'pointer',
    marginTop: '8px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
    maxWidth: '300px',
    position: 'relative',
    zIndex: 1,
  },
  input: {
    padding: '14px 16px',
    fontSize: '16px',
    border: '2px solid #233554',
    borderRadius: '10px',
    background: '#112240',
    color: '#ccd6f6',
    outline: 'none',
  },
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
  },
  label: {
    color: '#a8b2d1',
    fontSize: '14px',
  },
  stepper: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  stepperBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: '2px solid #3498db',
    background: 'transparent',
    color: '#3498db',
    fontSize: '18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    color: '#ccd6f6',
    fontSize: '20px',
    fontWeight: 600,
    minWidth: '30px',
    textAlign: 'center' as const,
  },
  roleToggle: {
    display: 'flex',
    gap: '8px',
  },
  roleBtn: {
    flex: 1,
    padding: '10px',
    border: '2px solid #233554',
    borderRadius: '8px',
    background: 'transparent',
    color: '#8892b0',
    fontSize: '14px',
    cursor: 'pointer',
  },
  roleBtnActive: {
    borderColor: '#3498db',
    color: '#3498db',
    background: 'rgba(52, 152, 219, 0.1)',
  },
  playtestButton: {
    padding: '12px 32px',
    fontSize: '14px',
    fontWeight: 600,
    border: '2px solid #8892b0',
    borderRadius: '12px',
    background: 'transparent',
    color: '#8892b0',
    cursor: 'pointer',
    marginTop: '8px',
  },
  select: {
    padding: '14px 16px',
    fontSize: '16px',
    border: '2px solid #233554',
    borderRadius: '10px',
    background: '#112240',
    color: '#ccd6f6',
    outline: 'none',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    cursor: 'pointer',
  },
  playtestInstructions: {
    color: '#a8b2d1',
    fontSize: '13px',
    lineHeight: 1.4,
    margin: '4px 0 8px 0',
    textAlign: 'center' as const,
  },
  playtestContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#0a192f',
  },
  playtestCenter: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  playtestName: {
    color: '#f39c12',
    fontSize: '32px',
    fontWeight: 800,
    margin: '0 0 8px 0',
  },
  playtestInstr: {
    color: '#a8b2d1',
    fontSize: '16px',
    textAlign: 'center' as const,
    margin: '0 0 32px 0',
    maxWidth: '280px',
  },
  playtestCountdown: {
    color: '#fff',
    fontSize: '72px',
    fontWeight: 800,
  },
  playtestGameArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none' as const,
    touchAction: 'none' as const,
  },
  playtestProgressBar: {
    width: '90%',
    height: '6px',
    borderRadius: '3px',
    background: '#233554',
    overflow: 'hidden' as const,
    margin: '12px 0',
  },
  playtestProgressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #e74c3c, #f39c12)',
    borderRadius: '3px',
    transition: 'width 0.1s linear',
  },
  playtestDoneTitle: {
    color: '#ccd6f6',
    fontSize: '28px',
    margin: '0 0 16px 0',
  },
  playtestScore: {
    color: '#f39c12',
    fontSize: '64px',
    fontWeight: 800,
  },
};
