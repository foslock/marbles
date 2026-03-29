# Losing Their Marbles - Asset Generation Prompts

Use these prompts with Midjourney, DALL-E, or similar tools to generate game assets.

## General Export Notes

- Download at the **highest available resolution** from Midjourney (use the "Upscale" buttons before downloading).
- All assets with transparency (tokens, tiles, marble, dice faces) must be exported as **PNG**.
- Background/scene images can be exported as **JPEG** (quality 90+) for smaller file sizes.
- After downloading, resize to the exact pixel dimensions listed below before committing.
- Place files in `client/public/` as described — Vite serves this directory as-is, so paths like `/assets/tokens/hurt_feelings.png` will resolve at runtime.

---

## Character Tokens (16 total)

**Dimensions:** 256 × 256 px, PNG with transparent background
**Directory:** `client/public/assets/tokens/`
**Filename:** matches the token `id` field in `server/app/board/tokens.py`
**Midjourney tip:** Append `--ar 1:1` and after upscaling, remove the white background in any image editor (or add `--no background` if using a version that supports it).

| # | File name | Prompt |
|---|-----------|--------|
| 1 | `hurt_feelings.png` | A small translucent purple blob creature with big watery eyes and a quivering lower lip, looking dramatically offended, game token style, simple clean design on white background, 3D rendered, cute but melancholy --v 6 --style raw --ar 1:1 |
| 2 | `morning_malaise.png` | A tiny anthropomorphic alarm clock wearing an oversized bathrobe, messy hair, holding a tiny coffee cup, game token style, simple clean design on white background, 3D rendered, sleepy and grumpy --v 6 --style raw --ar 1:1 |
| 3 | `suspicious_sock.png` | A single mismatched sock with cartoon shifty eyes, looking suspicious and sneaky, game token style, simple clean design on white background, 3D rendered, comedic and mischievous --v 6 --style raw --ar 1:1 |
| 4 | `existential_toast.png` | A piece of toast with a philosophical expression, staring into the distance contemplating existence, tiny reading glasses, game token style, simple clean design on white background, 3D rendered --v 6 --style raw --ar 1:1 |
| 5 | `rogue_stapler.png` | A red office stapler wearing a tiny bandana and sunglasses, looking rebellious and determined, game token style, simple clean design on white background, 3D rendered, action hero pose --v 6 --style raw --ar 1:1 |
| 6 | `ambient_dread.png` | A small dark thundercloud with an eerily calm smile, floating ominously, tiny lightning bolts, game token style, simple clean design on white background, 3D rendered, cute but unsettling --v 6 --style raw --ar 1:1 |
| 7 | `overconfident_spoon.png` | A shiny spoon flexing tiny muscular arms, wearing a sweatband, looking extremely confident, game token style, simple clean design on white background, 3D rendered, funny and bold --v 6 --style raw --ar 1:1 |
| 8 | `tax_anxiety.png` | A crumpled paper receipt vibrating with anxiety, sweat drops flying off, worried expression, surrounded by tiny floating numbers, game token style, simple clean design on white background, 3D rendered --v 6 --style raw --ar 1:1 |
| 9 | `feral_houseplant.png` | A small potted houseplant with wild untamed vines, feral glowing eyes peeking through leaves, cracked pot, game token style, simple clean design on white background, 3D rendered, wild and unhinged --v 6 --style raw --ar 1:1 |
| 10 | `forgotten_password.png` | A cute padlock with a giant question mark above it, looking confused and frustrated, tiny keyhole as mouth, game token style, simple clean design on white background, 3D rendered, bewildered expression --v 6 --style raw --ar 1:1 |
| 11 | `sentient_lint.png` | A fluffy ball of dryer lint with tiny awakened eyes, floating slightly, looking amazed at its own existence, sparkles around it, game token style, simple clean design on white background, 3D rendered --v 6 --style raw --ar 1:1 |
| 12 | `chaotic_doorknob.png` | A brass doorknob spinning wildly with motion lines, maniacal expression, chaotic energy, tiny sparks flying, game token style, simple clean design on white background, 3D rendered, unhinged and fun --v 6 --style raw --ar 1:1 |
| 13 | `passive_aggressive_note.png` | A yellow sticky note with a passive-aggressive smiley face, slightly crumpled edges, pen marks, game token style, simple clean design on white background, 3D rendered, cheerful but menacing --v 6 --style raw --ar 1:1 |
| 14 | `unreliable_compass.png` | A small compass with a spinning needle pointing in multiple directions at once, looking confident despite being wrong, game token style, simple clean design on white background, 3D rendered --v 6 --style raw --ar 1:1 |
| 15 | `vengeful_rubber_duck.png` | A yellow rubber duck with a determined vengeful expression, tiny battle scars, dramatic lighting on one side, game token style, simple clean design on white background, 3D rendered, cute but intimidating --v 6 --style raw --ar 1:1 |
| 16 | `misplaced_confidence.png` | A tiny golden crown floating in mid-air above nothing, radiating golden confidence rays, sparkles, game token style, simple clean design on white background, 3D rendered, majestic yet absurd --v 6 --style raw --ar 1:1 |

---

## Board Assets

### Board Background
**Dimensions:** 1920 × 1080 px, JPEG
**File:** `client/public/assets/board/background.jpg`

> Top-down view of a whimsical fantasy board game surface, dark navy blue with subtle magical swirl patterns, worn parchment texture edges, faint star constellation patterns, dreamy and mysterious atmosphere --v 6 --ar 16:9

---

### Tile Inner Circles

These images are drawn inside the rounded-rectangle tiles on the canvas board. Each should be a circle design centered on a **transparent** square canvas so it can be drawn at any size.

**Dimensions:** 128 × 128 px, PNG with transparent background
**Directory:** `client/public/assets/board/`

| File | Prompt |
|------|--------|
| `tile_positive.png` | A glowing green circular emblem with a subtle four-leaf clover embossed pattern, magical sparkle, isometric 3D style, isolated on transparent background, clean design --v 6 --style raw --ar 1:1 |
| `tile_negative.png` | A glowing red circular emblem with a subtle cracked-glass pattern, ominous inner glow, isometric 3D style, isolated on transparent background, clean design --v 6 --style raw --ar 1:1 |
| `tile_neutral.png` | A subtle grey-blue circular emblem with a question mark pattern, mysterious fog effect, isometric 3D style, isolated on transparent background, clean design --v 6 --style raw --ar 1:1 |
| `tile_fork.png` | A golden circular emblem with two diverging arrow paths, magical glow, isometric 3D style, isolated on transparent background, clean design --v 6 --style raw --ar 1:1 |

---

### Marble (Currency)
**Dimensions:** 256 × 256 px, PNG with transparent background
**File:** `client/public/assets/ui/marble.png`

> A beautiful glass marble with swirling colors of gold, red, purple and blue inside, magical glow, floating, single object on transparent background, hyper-realistic 3D rendered --v 6 --style raw --ar 1:1

---

## UI Assets

### Dice Faces (6 images)
**Dimensions:** 256 × 256 px each, PNG with transparent background
**Directory:** `client/public/assets/ui/`
**Files:** `die_1.png` through `die_6.png`
**Note:** Generate all six faces in one Midjourney session using a consistent base prompt, or generate a single die reference image and ask for face variations. These replace the emoji die faces in `DiceRoller.tsx`.

> A stylized 3D six-sided die showing the [ONE / TWO / THREE / FOUR / FIVE / SIX] face, rounded edges, dark navy blue with golden pips, magical glow, floating slightly, transparent background, game asset style --v 6 --style raw --ar 1:1

*(Replace the bracketed face name for each of the six prompts.)*

---

### Home Screen Background
**Dimensions:** 1080 × 1920 px, JPEG
**File:** `client/public/assets/ui/home_background.jpg`

> Abstract dark gradient background with floating translucent marbles in various sizes, dreamy bokeh light effects, deep navy and purple colors, magical and mysterious atmosphere --v 6 --ar 9:16

---

### Victory Screen Background
**Dimensions:** 1080 × 1920 px, JPEG
**File:** `client/public/assets/ui/victory_background.jpg`

> Celebration scene with golden confetti, floating marbles, magical starburst, festive and triumphant atmosphere, dark background with warm golden lighting --v 6 --ar 9:16

---

### Minigame Countdown Background
**Dimensions:** 1080 × 1920 px, JPEG
**File:** `client/public/assets/ui/minigame_background.jpg`

> Abstract dark arena with spotlight center stage, dramatic lighting, ready for competition, neon accents, energetic atmosphere --v 6 --ar 9:16
