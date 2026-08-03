/**
 * Single source of truth for the mahjong table's one-shot animation timing —
 * Tile.tsx's own entry, the four FlipGhost flights, and the claim badge
 * fade all pull from here instead of hardcoding their own duration, so a
 * future global tempo change doesn't mean hunting through every file.
 */
export const TILE_MOTION_EASE = "easeOut";

/** Tile.tsx's plain grow/fade-in — also reused by TileClaimSlot's badge fade. */
export const TILE_ENTRY_DURATION = 0.3;

/** HandReflowShell's post-discard gap closure. */
export const HAND_REFLOW_DURATION = 0.3;

/** DiscardFlipGhost / ClaimFlipGhost — both travel a short, similar distance. */
export const DISCARD_FLIGHT_DURATION = 0.3;
export const CLAIM_FLIGHT_DURATION = 0.3;

/**
 * DrawFlipGhost — deliberately slower than the other two: it flies from the
 * table's center rather than a specific nearby tile, so it covers more
 * visual distance and reads better with a little more time.
 */
export const DRAW_FLIGHT_DURATION = 0.35;

/**
 * OpponentDiscardFlipGhost — flies from a concealed visual slot (or the
 * hand zone when no slot was captured) and crossfades from back to face.
 * It remains slightly slower than ordinary discard flight for readability.
 */
export const OPPONENT_DISCARD_FLIGHT_DURATION = 0.65;
export const OPPONENT_DISCARD_HOLD_DURATION = 0;
