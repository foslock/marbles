import { useState, useEffect, useRef } from 'react';
import { MINIGAME_REGISTRY } from './minigames';
import { TapFrenzy } from './minigames/TapFrenzy';
import { SFX } from '../utils/sound';
import { Haptics } from '../utils/haptics';

// Client-side minigame definitions matching server/app/game/minigames/base.py
const PLAYTEST_MINIGAMES = [
  { id: 'tap_frenzy', name: 'Tap Frenzy', instructions: 'Tap the screen as many times as possible in 5 seconds.', duration: 5000, type: 'tap_count' },
  { id: 'ball_tracker', name: 'Ball Tracker', instructions: 'A ball bounces around the screen. Hold your finger on it to score points.', duration: 7000, type: 'tracking' },
  { id: 'rhythm_tap', name: 'Rhythm Pulse', instructions: 'The screen pulses to a rhythm. Tap in sync with the beat as accurately as possible.', duration: 6000, type: 'rhythm' },
  { id: 'canvas_fill', name: 'Color Rush', instructions: 'Draw with your finger to fill as much of the canvas as possible.', duration: 5000, type: 'canvas_fill' },
  { id: 'tilt_chase', name: 'Tilt Chase', instructions: 'Tilt your device to guide your dot to follow the target dot.', duration: 7000, type: 'accelerometer' },
  { id: 'reaction_snap', name: 'Reaction Snap', instructions: 'Wait for the screen to turn green, then tap as fast as possible. Fastest reaction wins!', duration: 5000, type: 'reaction' },
  { id: 'size_judge', name: 'Size Matters', instructions: 'A circle appears — pinch/spread to match its size exactly. Closest match wins!', duration: 6000, type: 'size_match' },
  { id: 'memory_flash', name: 'Memory Flash', instructions: 'Colored tiles flash in a sequence. Repeat the sequence from memory. Longest correct streak wins!', duration: 8000, type: 'memory' },
  { id: 'swipe_dodge', name: 'Swipe Dodge', instructions: 'Swipe left/right to dodge falling obstacles. Survive the longest to win!', duration: 6000, type: 'dodge' },
  { id: 'target_pop', name: 'Target Pop', instructions: 'Targets appear randomly on screen. Tap them before they disappear. Most pops wins!', duration: 5000, type: 'target_tap' },
  { id: 'marble_stack', name: 'Marble Stack', instructions: 'A marble swings back and forth. Tap when it\'s centred to drop it on the stack. Closer to centre = more points!', duration: 20000, type: 'marble_stack' },
  { id: 'color_sort', name: 'Color Sort', instructions: 'A marble falls from the top. Tap the matching coloured bucket before it hits the ground!', duration: 18000, type: 'color_sort' },
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
    case 'memory': return { sequence: Array.from({ length: 12 }, () => rand(0, 3)) };
    case 'dodge': return { seed: rand(0, 999999) };
    case 'marble_stack': return { seed: rand(0, 999999) };
    case 'color_sort': return { seed: rand(0, 999999) };
    default: return {};
  }
}

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
    playtestScoreRef.current = score;
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
      <div style={styles.titleContainer}>
        <h1 style={styles.title}>Losing Their</h1>
        <h1 style={styles.titleMarbles}>Marbles</h1>
        <p style={styles.subtitle}>A party game for people who enjoy chaos</p>
      </div>

      {mode === 'menu' && (
        <div style={styles.buttonGroup}>
          <button
            style={{ ...styles.primaryButton, ...(!connected ? styles.disabledButton : {}) }}
            onClick={() => connected && setMode('create')}
            disabled={!connected}
          >
            {connected ? 'Host a Game' : 'Connecting…'}
          </button>
          <button
            style={{ ...styles.secondaryButton, ...(!connected ? styles.disabledButton : {}) }}
            onClick={() => connected && setMode('join')}
            disabled={!connected}
          >
            Join a Game
          </button>
          <button
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
            maxLength={20}
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
          <button style={styles.primaryButton} onClick={handleCreate}>
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
            maxLength={20}
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
          <button style={styles.primaryButton} onClick={handleJoin}>
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
          <button style={styles.primaryButton} onClick={startPlaytest}>
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
                <button style={{ ...styles.primaryButton, marginTop: '24px' }} onClick={() => setMode('playtest')}>
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
  },
  titleContainer: {
    textAlign: 'center',
    marginBottom: '40px',
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
    background: 'linear-gradient(90deg, #f39c12, #e74c3c, #9b59b6, #3498db)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
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
  },
  disabledButton: {
    opacity: 0.45,
    cursor: 'not-allowed',
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
    transition: 'transform 0.1s',
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
