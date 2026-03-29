# Losing Their Marbles — Game Rules & Mechanics

## Objective

Collect marbles. The first player to reach the target marble count (default **10**) wins.

Marbles are earned by landing on positive tiles, winning battles, placing well in minigames, and automatically converting accumulated points (every **100 points = 1 marble**).

---

## Setup

### Creating a Session

1. One player creates a game and sets the target marble count (default 10).
2. The server generates a unique **two-word passphrase** (e.g. `wobbly-penguin`).
3. Other players join by entering that passphrase.
4. **2–10 players** can participate. Up to **10 spectators** may also join at any time (including mid-game).

### Lobby & Token Assignment

In the lobby, players see who has joined. When the host clicks **Start Game**:

- Turn order is randomised.
- Each player is randomly assigned one of the **16 character tokens** (see below).
- The board is generated from a fixed seed.
- Players are placed on random safe starting tiles.

---

## The Board

The board is a **graph of 45 tiles** arranged in a loop:

- **~35 tiles** form the main circular path.
- **2 fork routes** (4–7 tiles each) branch off and rejoin the main path.
- At a fork tile, the moving player chooses which route to take.
- Movement is possible both **forward and backward** along the path.

Tiles are colour-coded by effect category:

| Colour | Category |
|--------|----------|
| Green | Positive effect |
| Red | Negative effect |
| Grey | Neutral |

Tile effects are hidden until first landed on. **After a tile is triggered, its effect swaps with a random unrevealed tile of the same colour**, keeping the board unpredictable throughout the game.

---

## Turn Structure

Turns proceed in the randomised order set at game start.

### 1. Roll the Dice

The active player rolls. The default is **1d6**, but active modifiers can change this:

| Modifier | Effect |
|----------|--------|
| `double_dice` | Roll 2d6, move the **sum** (consumed on use) |
| `worst_dice` | Roll 2d6, move the **minimum** (consumed on use) |

The player may spend a saved **Re-roll** to discard the result and roll again.

### 2. Choose a Destination

The server calculates all tiles reachable in exactly that many steps (forward or backward, including fork branches) and highlights them on the board. The active player picks their destination.

### 3. Tile Effect

On arrival, the tile's effect fires immediately. See **Tile Effects** below.

Some effects (steal/give) require the active player to choose a target opponent before resolving.

If the player has an active **Protection** modifier and the tile is a negative (red) effect, the effect is blocked and one protection charge is consumed instead.

After the effect resolves, the tile's effect swaps with a random unrevealed tile of the same colour category.

### 4. Battle Check

If any other player(s) occupy the same tile after movement:

- **Exactly 2 players on the tile AND 3+ players in the game** → [Dice Battle](#dice-battle)
- **3+ players on the tile OR only 2 players in the game** → [Minigame](#minigames)

### 5. End of Turn

After any battle or minigame, the turn advances to the next player. If a player has reached the target marble count, the game ends immediately.

---

## Tile Effects

### Positive (Green)

| Effect | Description |
|--------|-------------|
| `gain_10_points` | Gain 10 points |
| `gain_25_points` | Gain 25 points |
| `gain_50_points` | Gain 50 points |
| `gain_marble` | Gain 1 marble directly |
| `steal_marble` | Choose an opponent with marbles and steal 1 |
| `steal_points` | Choose an opponent; steal a random amount (10, 25, or 50 points) |
| `reroll` | Gain 1 saved re-roll |
| `double_dice_next` | Your next roll uses 2 dice (take the sum) |
| `protection` | Block the next negative tile effect you would receive |
| `short_stop` | Next turn, choose any tile up to your roll distance (not just exactly that distance) |

### Negative (Red)

| Effect | Description |
|--------|-------------|
| `lose_10_points` | Lose 10 points |
| `lose_25_points` | Lose 25 points |
| `lose_50_points` | Lose 50 points |
| `lose_marble` | Lose 1 marble (if you have any) |
| `give_marble` | Choose an opponent to receive 1 of your marbles |
| `give_points` | Choose an opponent to receive a random amount (10, 25, or 50) of your points |
| `worst_dice_next` | Your next roll uses 2 dice (take the minimum) |
| `dizzy` | Next turn, you move the full roll distance but in a random direction (no choice) |

### Neutral (Grey)

| Effect | Description |
|--------|-------------|
| `fortune_cookie` | Display a random absurdist fortune and trigger a harmless visual effect |

### Points & Marble Conversion

Points accumulate toward marbles. The conversion is automatic:

> **100 points = 1 marble** (points remainder carries over)

For example: a player at 75 points who gains 50 points will end up with 1 marble and 25 points.

---

## Battles

### Dice Battle (1v1)

Used when exactly 2 players share a tile and the game has 3 or more total players.

1. Both players simultaneously roll 1d6.
2. Ties are rerolled until a winner is determined.
3. The winner steals points from the loser. The prize amount is a random die roll from: **10, 15, 20, 25, 30, or 50 points**. The actual amount stolen is capped at what the loser currently has.

### Minigame Battle

Used when 3 or more players share a tile, or when the game has only 2 total players.

See [Minigames](#minigames) below.

---

## Minigames

Minigames are short competitive challenges triggered by battles. All scoring happens **100% client-side** — the server only sends a shared config (seeds, timing parameters) so every player faces identical conditions. Final scores are submitted to the server when the timer expires.

### Prize Distribution

After every minigame, the top finishers receive prizes:

- There is a **10% chance** that the prizes are marbles (1 marble each for 1st, 2nd, and 3rd).
- Otherwise (**90% chance**) prizes are points:

| Placement | Points |
|-----------|--------|
| 1st | 50 |
| 2nd | 25 |
| 3rd | 10 |
| 4th+ | 0 |

### The 10 Minigames

| Name | Duration | How to Score |
|------|----------|--------------|
| **Tap Frenzy** | 5 s | Tap the screen as fast as possible. Score = total tap count. |
| **Ball Tracker** | 7 s | Keep your finger on a bouncing ball. Score = total time on-ball in milliseconds. |
| **Rhythm Pulse** | 6 s | The screen pulses to a set BPM. Tap in time. Score = tap accuracy. |
| **Color Rush** | 5 s | Draw freely to fill the canvas with colour. Score = percentage of canvas covered. |
| **Tilt Chase** | 7 s | Tilt your device to guide a dot to a moving target. Score = accuracy (distance from target). |
| **Reaction Snap** | 5 s | Wait for the screen to turn green, then tap as fast as possible. Score = reaction time (lower is better). |
| **Size Matters** | 6 s | Pinch or spread to resize a circle to match a target size. Score = closeness to the target. |
| **Memory Flash** | 8 s | Watch a sequence of coloured tiles flash, then repeat it from memory. Score = longest correct streak. |
| **Swipe Dodge** | 6 s | Swipe left or right to dodge falling obstacles. Score = survival time in milliseconds. |
| **Target Pop** | 5 s | Tap randomly-appearing targets before they disappear. Score = number of targets popped. |

---

## Player Modifiers

Modifiers are one-time consumable buffs or debuffs that sit on your character until triggered.

| Modifier | Source | Effect |
|----------|--------|--------|
| **Re-roll** | `reroll` tile | Re-roll the dice once on any future turn |
| **Protection** | `protection` tile | Block the next negative tile effect you would receive |
| **Double Dice** | `double_dice_next` tile | Your next roll uses 2d6 — move the sum |
| **Worst Dice** | `worst_dice_next` tile | Your next roll uses 2d6 — move the minimum |
| **Short Stop** | `short_stop` tile | Next turn, stop on any tile up to your roll distance |
| **Dizzy** | `dizzy` tile | Next turn, move full distance in a random direction (no choice) |

All modifiers are consumed when used or triggered.

---

## Character Tokens

Each player is assigned one of 16 absurdist tokens at game start.

| Token | Emoji | Colour |
|-------|-------|--------|
| Hurt Feelings | 😢 | Purple |
| Morning Malaise | 😴 | Orange |
| The Suspicious Sock | 🧦 | Red |
| Existential Toast | 🍞 | Tan |
| Rogue Stapler | 📎 | Dark Red |
| Ambient Dread | 🌧️ | Dark Grey |
| Overconfident Spoon | 🥄 | Silver |
| Tax Anxiety | 🧾 | Grey |
| Feral Houseplant | 🌿 | Green |
| Forgotten Password | 🔒 | Blue |
| Sentient Lint | 🫧 | Light Grey |
| Chaotic Doorknob | 🚪 | Gold |
| Passive-Aggressive Note | 📝 | Yellow |
| Unreliable Compass | 🧭 | Cyan |
| Vengeful Rubber Duck | 🦆 | Orange |
| Misplaced Confidence | 👑 | Purple |

---

## Winning

The game ends the moment a player's marble count reaches or exceeds the target (default **10**). That player is declared the winner. All remaining players are ranked by marble count, with points used as a tiebreaker.

---

## Spectators

Anyone can join a session as a spectator before or during the game. Spectators receive the full game state in real time but cannot interact with gameplay. The `SpectatorView` component provides a TV/desktop-optimised layout suitable for streaming or display on a shared screen.
