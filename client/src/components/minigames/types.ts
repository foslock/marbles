/**
 * Shared interface for all minigame components.
 *
 * ARCHITECTURE: Minigames run 100% client-side. All interactions, timing,
 * hit detection, and scoring happen in the browser with zero server round-trips
 * during gameplay. The server only sends the game definition at start and
 * collects the final score when time expires.
 *
 * To add a new minigame:
 * 1. Create a new file in this directory (e.g., MyGame.tsx)
 * 2. Export a component matching MinigameComponentProps
 * 3. Register it in registry.ts with a unique type key
 * 4. Add the matching entry in server/app/game/minigames/base.py MINIGAMES list
 * 5. If your game needs shared params (so all players get identical conditions),
 *    add a config generator in base.py _make_config() and read it from `config` prop
 *
 * That's it — no other files need to change.
 */
export interface MinigameComponentProps {
  /** Called whenever the player's score changes. Final value at time-up is submitted. */
  onScoreUpdate: (score: number) => void;
  /** Milliseconds remaining. Counts down from duration. */
  timeLeft: number;
  /** Total duration in milliseconds. */
  duration: number;
  /** Optional server-sent config for parameterized minigames. */
  config?: Record<string, unknown>;
}
