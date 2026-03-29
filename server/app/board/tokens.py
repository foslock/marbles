"""Character tokens for Losing Their Marbles.

16 absurdist, unrelated tokens randomly assigned to players.
Each has a name, description, color scheme, and Midjourney prompt for asset generation.
"""

import random

TOKENS = [
    {
        "id": "hurt_feelings",
        "name": "Hurt Feelings",
        "description": "A translucent, wobbly blob that looks perpetually offended",
        "color": "#9B59B6",
        "emoji": "😢",
        "midjourney_prompt": "A small translucent purple blob creature with big watery eyes and a quivering lower lip, looking dramatically offended, game token style, simple clean design on white background, 3D rendered, cute but melancholy --v 6 --style raw",
    },
    {
        "id": "morning_malaise",
        "name": "Morning Malaise",
        "description": "A tiny disheveled alarm clock wearing a bathrobe",
        "color": "#F39C12",
        "emoji": "😴",
        "midjourney_prompt": "A tiny anthropomorphic alarm clock wearing an oversized bathrobe, messy hair, holding a tiny coffee cup, game token style, simple clean design on white background, 3D rendered, sleepy and grumpy --v 6 --style raw",
    },
    {
        "id": "suspicious_sock",
        "name": "The Suspicious Sock",
        "description": "A single sock with shifty eyes, clearly up to something",
        "color": "#E74C3C",
        "emoji": "🧦",
        "midjourney_prompt": "A single mismatched sock with cartoon shifty eyes, looking suspicious and sneaky, game token style, simple clean design on white background, 3D rendered, comedic and mischievous --v 6 --style raw",
    },
    {
        "id": "existential_toast",
        "name": "Existential Toast",
        "description": "A piece of toast contemplating the void",
        "color": "#D4A574",
        "emoji": "🍞",
        "midjourney_prompt": "A piece of toast with a philosophical expression, staring into the distance contemplating existence, tiny reading glasses, game token style, simple clean design on white background, 3D rendered --v 6 --style raw",
    },
    {
        "id": "rogue_stapler",
        "name": "Rogue Stapler",
        "description": "A red stapler that has gone off the grid",
        "color": "#C0392B",
        "emoji": "📎",
        "midjourney_prompt": "A red office stapler wearing a tiny bandana and sunglasses, looking rebellious and determined, game token style, simple clean design on white background, 3D rendered, action hero pose --v 6 --style raw",
    },
    {
        "id": "ambient_dread",
        "name": "Ambient Dread",
        "description": "A small dark cloud with an unsettling smile",
        "color": "#2C3E50",
        "emoji": "🌧️",
        "midjourney_prompt": "A small dark thundercloud with an eerily calm smile, floating ominously, tiny lightning bolts, game token style, simple clean design on white background, 3D rendered, cute but unsettling --v 6 --style raw",
    },
    {
        "id": "overconfident_spoon",
        "name": "Overconfident Spoon",
        "description": "A spoon flexing muscles it definitely doesn't have",
        "color": "#BDC3C7",
        "emoji": "🥄",
        "midjourney_prompt": "A shiny spoon flexing tiny muscular arms, wearing a sweatband, looking extremely confident, game token style, simple clean design on white background, 3D rendered, funny and bold --v 6 --style raw",
    },
    {
        "id": "tax_anxiety",
        "name": "Tax Anxiety",
        "description": "A crumpled receipt vibrating with nervous energy",
        "color": "#95A5A6",
        "emoji": "🧾",
        "midjourney_prompt": "A crumpled paper receipt vibrating with anxiety, sweat drops flying off, worried expression, surrounded by tiny floating numbers, game token style, simple clean design on white background, 3D rendered --v 6 --style raw",
    },
    {
        "id": "feral_houseplant",
        "name": "Feral Houseplant",
        "description": "A potted plant that has clearly gone wild",
        "color": "#27AE60",
        "emoji": "🌿",
        "midjourney_prompt": "A small potted houseplant with wild untamed vines, feral glowing eyes peeking through leaves, cracked pot, game token style, simple clean design on white background, 3D rendered, wild and unhinged --v 6 --style raw",
    },
    {
        "id": "forgotten_password",
        "name": "Forgotten Password",
        "description": "A padlock with a giant question mark, looking confused",
        "color": "#3498DB",
        "emoji": "🔒",
        "midjourney_prompt": "A cute padlock with a giant question mark above it, looking confused and frustrated, tiny keyhole as mouth, game token style, simple clean design on white background, 3D rendered, bewildered expression --v 6 --style raw",
    },
    {
        "id": "sentient_lint",
        "name": "Sentient Lint",
        "description": "A ball of dryer lint that has achieved consciousness",
        "color": "#CACFD2",
        "emoji": "🫧",
        "midjourney_prompt": "A fluffy ball of dryer lint with tiny awakened eyes, floating slightly, looking amazed at its own existence, sparkles around it, game token style, simple clean design on white background, 3D rendered --v 6 --style raw",
    },
    {
        "id": "chaotic_doorknob",
        "name": "Chaotic Doorknob",
        "description": "A brass doorknob spinning wildly, completely unhinged",
        "color": "#D4AC0D",
        "emoji": "🚪",
        "midjourney_prompt": "A brass doorknob spinning wildly with motion lines, maniacal expression, chaotic energy, tiny sparks flying, game token style, simple clean design on white background, 3D rendered, unhinged and fun --v 6 --style raw",
    },
    {
        "id": "passive_aggressive_note",
        "name": "Passive-Aggressive Note",
        "description": "A sticky note with a smiley face that means business",
        "color": "#F1C40F",
        "emoji": "📝",
        "midjourney_prompt": "A yellow sticky note with a passive-aggressive smiley face, slightly crumpled edges, pen marks, game token style, simple clean design on white background, 3D rendered, cheerful but menacing --v 6 --style raw",
    },
    {
        "id": "unreliable_compass",
        "name": "Unreliable Compass",
        "description": "A compass whose needle spins randomly and confidently",
        "color": "#1ABC9C",
        "emoji": "🧭",
        "midjourney_prompt": "A small compass with a spinning needle pointing in multiple directions at once, looking confident despite being wrong, game token style, simple clean design on white background, 3D rendered --v 6 --style raw",
    },
    {
        "id": "vengeful_rubber_duck",
        "name": "Vengeful Rubber Duck",
        "description": "A rubber duck that has seen things and wants revenge",
        "color": "#F5B041",
        "emoji": "🦆",
        "midjourney_prompt": "A yellow rubber duck with a determined vengeful expression, tiny battle scars, dramatic lighting on one side, game token style, simple clean design on white background, 3D rendered, cute but intimidating --v 6 --style raw",
    },
    {
        "id": "misplaced_confidence",
        "name": "Misplaced Confidence",
        "description": "A tiny crown floating above nothing, radiating unearned swagger",
        "color": "#8E44AD",
        "emoji": "👑",
        "midjourney_prompt": "A tiny golden crown floating in mid-air above nothing, radiating golden confidence rays, sparkles, game token style, simple clean design on white background, 3D rendered, majestic yet absurd --v 6 --style raw",
    },
]


def assign_tokens(num_players: int) -> list[dict]:
    """Randomly select and assign tokens to players."""
    selected = random.sample(TOKENS, min(num_players, len(TOKENS)))
    return selected
