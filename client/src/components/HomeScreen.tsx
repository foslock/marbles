import { useState } from 'react';

interface Props {
  connected: boolean;
  onCreateSession: (name: string, targetMarbles: number) => void;
  onJoinSession: (passphrase: string, name: string, role: string) => void;
}

export function HomeScreen({ connected, onCreateSession, onJoinSession }: Props) {
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [name, setName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [targetMarbles, setTargetMarbles] = useState(10);
  const [role, setRole] = useState<'player' | 'spectator'>('player');

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
};
