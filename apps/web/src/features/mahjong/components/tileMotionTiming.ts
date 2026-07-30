/**
 * Single source of truth for the mahjong table's one-shot animation timing —
 * Tile.tsx's own entry, the four FlipGhost flights, and the claim badge
 * fade all pull from here instead of hardcoding their own duration, so a
 * future global tempo change doesn't mean hunting through every file.
 */
export const TILE_MOTION_EASE = "easeOut";

/** Tile.tsx's plain grow/fade-in — also reused by TileClaimSlot's badge fade. */
export const TILE_ENTRY_DURATION = 0.3;

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
 * OpponentDiscardFlipGhost — flies from an entire seat's hand zone rather
 * than a specific tile, and includes a back→face crossfade plus a rotation
 * tween; a little slower still than DrawFlipGhost so the flip has room to
 * read clearly mid-flight.
 */
export const OPPONENT_DISCARD_FLIGHT_DURATION = 0.4;
