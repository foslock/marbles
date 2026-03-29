# Losing Their Marbles

A real-time multiplayer browser board game. Players race around a tile-based board collecting marbles, triggering effects, battling each other, and competing in fast-paced minigames. First to collect the target number of marbles wins.

## Tech Stack

- **Backend**: Python (FastAPI + Socket.IO), PostgreSQL
- **Frontend**: React + TypeScript (Vite), Canvas-based board rendering
- **Deployment**: Render.com (web service + static site + managed Postgres)

## Repository Layout

```
marbles/
├── server/                          # Python backend
│   ├── run.py                       # Dev server entry point
│   ├── requirements.txt
│   └── app/
│       ├── main.py                  # ASGI app — mounts Socket.IO + FastAPI
│       ├── config.py                # Environment settings (LTM_ prefix)
│       ├── database.py              # SQLAlchemy async engine + session factory
│       ├── socketio_handlers.py     # All Socket.IO event handlers (game flow)
│       ├── models/
│       │   ├── base.py              # SQLAlchemy declarative base + timestamp mixin
│       │   ├── session.py           # LtmSession — persisted session metadata
│       │   ├── player.py            # LtmPlayer — persisted player stats
│       │   ├── tile.py              # LtmTile + LtmTileEdge — persisted board
│       │   └── game_event.py        # LtmGameEvent — audit log
│       ├── board/
│       │   ├── generator.py         # Board graph generation (45 tiles, 2 forks)
│       │   └── tokens.py            # 16 character token definitions
│       └── game/
│           ├── state.py             # SessionManager + in-memory GameSession
│           ├── effects.py           # Tile effect processing + swapping logic
│           ├── battle.py            # Dice battle system
│           ├── passphrase.py        # Two-word passphrase generator
│           ├── persistence.py       # DB save/load for session recovery
│           └── minigames/
│               └── base.py          # 10 minigame definitions + scoring framework
│
├── client/                          # React + TypeScript frontend
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx                  # Root component — routes between phases
│       ├── main.tsx                 # React entry point
│       ├── types/
│       │   └── game.ts              # Shared TypeScript types
│       ├── hooks/
│       │   └── useSocket.ts         # Socket.IO connection + all event handlers
│       ├── utils/
│       │   ├── sound.ts             # Sound effect helpers
│       │   └── haptics.ts           # Haptic feedback helpers
│       └── components/
│           ├── HomeScreen.tsx       # Create / join game
│           ├── LobbyScreen.tsx      # Pre-game lobby (token selection, ready up)
│           ├── GameScreen.tsx       # Main game view (board + HUD + dice)
│           ├── GameBoard.tsx        # Canvas-based board renderer
│           ├── DiceRoller.tsx       # Dice roll UI with animations
│           ├── PlayerHUD.tsx        # Player stats bar (marbles, points, modifiers)
│           ├── Scoreboard.tsx       # Score rankings view
│           ├── MinigameScreen.tsx   # Minigame shell (countdown / timer / submit)
│           ├── TileEffectOverlay.tsx
│           ├── BattleOverlay.tsx
│           ├── MinigameResultsOverlay.tsx
│           ├── GameOverScreen.tsx
│           ├── SpectatorView.tsx    # TV/desktop optimised spectator view
│           ├── ErrorToast.tsx
│           └── minigames/           # Individual minigame components
│               ├── types.ts         # MinigameComponentProps interface
│               ├── registry.ts      # Type key → component map
│               ├── TapFrenzy.tsx
│               ├── BallTracker.tsx
│               ├── RhythmPulse.tsx
│               ├── CanvasFill.tsx
│               ├── ReactionSnap.tsx
│               ├── TargetPop.tsx
│               ├── MemoryFlash.tsx
│               ├── SwipeDodge.tsx
│               ├── SizeMatch.tsx
│               └── TiltChase.tsx
│
├── render.yaml                      # Render.com deployment blueprint
├── CLAUDE.md                        # Developer guide (extending the game)
├── ASSET_PROMPTS.md                 # Midjourney prompts for character art
└── LICENSE
```

## Running Locally

```bash
# Backend (runs on :8000)
cd server
pip install -r requirements.txt
python run.py

# Frontend (runs on :5173, proxies /socket.io → :8000)
cd client
npm install
npm run dev
```

## Deployment

The `render.yaml` blueprint provisions everything on Render.com:

- **Backend**: Python web service — `uvicorn app.main:socket_app`
- **Frontend**: Static site — built with `npm run build`, served from `dist/`
- **Database**: PostgreSQL 16

## Developer Guide

See [CLAUDE.md](CLAUDE.md) for instructions on adding minigames, tile effects, and character tokens.

See [GAME.md](GAME.md) for the full rules and mechanics reference.
