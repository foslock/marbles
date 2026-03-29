"""Two-word passphrase generator for game sessions."""

import random

ADJECTIVES = [
    "wobbly", "sneaky", "cosmic", "dizzy", "fuzzy", "grumpy", "jazzy", "lumpy",
    "quirky", "sassy", "wacky", "zesty", "bouncy", "crispy", "funky", "gooey",
    "happy", "icy", "jolly", "kooky", "lazy", "moody", "nerdy", "odd",
    "peppy", "rowdy", "silly", "tangy", "ultra", "vivid", "wild", "zealous",
    "ancient", "brave", "chunky", "dusty", "eager", "frosty", "giant", "hasty",
    "itchy", "jumpy", "keen", "loud", "mighty", "nifty", "plucky", "rapid",
]

NOUNS = [
    "penguin", "waffle", "tornado", "pickle", "dragon", "noodle", "cactus", "badger",
    "volcano", "pretzel", "unicorn", "walrus", "yeti", "zombie", "acorn", "biscuit",
    "comet", "dingo", "falcon", "goblin", "hamster", "igloo", "jackal", "kraken",
    "llama", "muffin", "narwhal", "otter", "parrot", "quokka", "raccoon", "squid",
    "toucan", "urchin", "viking", "wombat", "sphinx", "mammoth", "gecko", "moose",
    "panda", "raven", "salmon", "turnip", "wizard", "bandit", "clam", "donkey",
]


def generate_passphrase() -> str:
    """Generate a unique two-word passphrase like 'wobbly-penguin'."""
    adj = random.choice(ADJECTIVES)
    noun = random.choice(NOUNS)
    return f"{adj}-{noun}"
