# Losing Their Marbles — Developer Guide

## Project Structure

```
server/                          # Python backend (FastAPI + Socket.IO)
  app/
    main.py                      # ASGI entry point
    config.py                    # Environment settings (LTM_ prefix)
    database.py                  # SQLAlchemy async engine
    socketio_handlers.py         # All Socket.IO event handlers
    models/                      # SQLAlchemy models (ltm_ prefixed tables)
    board/
      generator.py               # Board graph generation algorithm
      tokens.py                  # 16 character token definitions + Midjourney prompts
    game/
      state.py                   # In-memory session/player state manager
      passphrase.py              # Two-word passphrase generator
      effects.py                 # Tile effect processing
      battle.py                  # Dice battle system
      minigames/
        base.py                  # Minigame definitions, config gen, scoring framework
  requirements.txt
  run.py                         # Dev server runner

client/                          # React + TypeScript frontend (Vite)
  src/
    App.tsx                      # Root component, phase routing
    hooks/useSocket.ts           # Socket.IO connection + all event handlers
    types/game.ts                # Shared TypeScript types
    components/
      HomeScreen.tsx             # Create/join game
      LobbyScreen.tsx            # Pre-game lobby
      GameScreen.tsx             # Main game view (board + HUD + dice)
      GameBoard.tsx              # Canvas-based board renderer
      DiceRoller.tsx             # Dice roll UI with animations
      PlayerHUD.tsx              # Player stats bar
      Scoreboard.tsx             # Score rankings view
      MinigameScreen.tsx         # Minigame lifecycle shell (countdown/timer/submit)
      TileEffectOverlay.tsx
      BattleOverlay.tsx
      MinigameResultsOverlay.tsx
      GameOverScreen.tsx
      ErrorToast.tsx
      minigames/                 # Individual minigame components
        types.ts                 # MinigameComponentProps interface
        registry.ts              # Type key → component map
        TapFrenzy.tsx
        BallTracker.tsx
        RhythmPulse.tsx
        CanvasFill.tsx
        ReactionSnap.tsx
        TargetPop.tsx
```

## Adding a New Minigame

Each minigame is a self-contained component. To add one:

1. **Create** `client/src/components/minigames/MyGame.tsx`
   - Export a component implementing `MinigameComponentProps` (from `./types`)
   - All scoring, interactions, and timing must run 100% client-side — no server calls during gameplay
   - Use the `config` prop for server-sent shared parameters (seeds, BPM, etc.)

2. **Register** it in `client/src/components/minigames/registry.ts`
   - Import your component and add one line: `my_type: MyGame,`

3. **Add server entry** in `server/app/game/minigames/base.py`
   - Add a dict to the `MINIGAMES` list with `id`, `name`, `description`, `instructions`, `duration`, and `type` (must match the registry key)
   - If your game needs shared params, add a case in `_make_config()` to generate them

That's it — no other files need changes. The `MinigameScreen` shell handles countdown, timer, and score submission automatically.

## Adding a New Tile Effect

1. Add the effect name to the appropriate category in `server/app/board/generator.py` `TILE_EFFECTS` dict
2. Add a `case` handler in `server/app/game/effects.py` `process_tile_effect()`
3. If the effect requires player choice, set `requiresChoice: True` in the result and add a handler in `apply_choice_effect()`

## Adding a New Character Token

Add a dict to the `TOKENS` list in `server/app/board/tokens.py` with `id`, `name`, `description`, `color`, `emoji`, and `midjourney_prompt`.

## Key Architecture Decisions

- **In-memory game state**: Active sessions live in `SessionManager` (server/app/game/state.py), not the DB. DB models exist for persistence/recovery but aren't wired up yet.
- **Client-side minigames**: Zero server round-trips during gameplay. Server sends config at start, collects final score at end.
- **Board as a graph**: Tiles have neighbor lists (bidirectional). Forks have 3+ neighbors. Players can move forward or backward.
- **Tile effect swapping**: After a tile is landed on, its effect swaps with another unrevealed tile of the same color category, so the board stays unpredictable.

## Running Locally

```bash
# Backend
cd server
pip install -r requirements.txt
python run.py  # Runs on :8000

# Frontend
cd client
npm install
npm run dev    # Runs on :5173, proxies /socket.io to :8000
```

## Deployment

Uses `render.yaml` blueprint — Python web service + static React site + PostgreSQL.
