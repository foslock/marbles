/**
 * Minigame component registry.
 *
 * Maps server-side minigame `type` strings to their React components.
 * To add a new minigame, import the component and add one line here.
 */
import type { ComponentType } from 'react';
import type { MinigameComponentProps } from './types';

import { TapFrenzy } from './TapFrenzy';
import { BallTracker } from './BallTracker';
import { RhythmPulse } from './RhythmPulse';
import { CanvasFill } from './CanvasFill';
import { ReactionSnap } from './ReactionSnap';
import { TargetPop } from './TargetPop';

/**
 * Register minigames here. The key must match the `type` field
 * in the server's MINIGAMES list (server/app/game/minigames/base.py).
 */
export const MINIGAME_REGISTRY: Record<string, ComponentType<MinigameComponentProps>> = {
  tap_count: TapFrenzy,
  tracking: BallTracker,
  rhythm: RhythmPulse,
  canvas_fill: CanvasFill,
  reaction: ReactionSnap,
  target_tap: TargetPop,

  // Unimplemented types fall back to TapFrenzy (see MinigameScreen).
  // As you build new games, add them here:
  // accelerometer: TiltChase,
  // size_match: SizeJudge,
  // memory: MemoryFlash,
  // dodge: SwipeDodge,
};
