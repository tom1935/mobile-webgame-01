// Look-development values for the 3D view (sky grade, light balance, haze).
// Separate from sim/params.ts: these only change the picture. Override per page load with
// ?look=KEY:VALUE,KEY:VALUE (tools/ref-compare.mjs --look passes it through). Read LOOK.X at use time.

export const DEFAULT_LOOK = {
  EXPOSURE: 0.9, // renderer tone mapping exposure
  // Sky background (HDRI shown behind everything; lighting still uses the ungraded HDRI)
  SKY_EXPOSURE: 1.0,
  SKY_SAT: 1.0, // saturation multiplier
  SKY_ZENITH: 0.0, // 0..1: darken toward the top of the sky (deeper blue overhead)
  // Sand: gradient map from the texture's light/dark detail (sRGB hex colors)
  SAND_LIGHT: 0xfff0c4, // yellowish tops
  SAND_DARK: 0xd8a46c, // orange hollows
  SAND_MACRO: 0.35, // strength of the large-scale copy that hides tiling
  SAND_TILE: 3, // texture scale multiplier (2 = features twice as big)
  SAND_NORMAL: 1.8, // normal map strength
  SAND_CAVITY: 0.8, // 0..1: AO cavities pull toward SAND_DARK
  SAND_CONTRAST: 2.5, // how far the detail spreads between SAND_DARK and SAND_LIGHT
  SAND_HEIGHT: 0, // relief depth (m) for parallax + self-shadow (0 = off); scales with SAND_TILE
  // Lights (balanced so a sun shadow on the sand is ~0.78x the lit sand, as measured in the reference)
  SUN_INTENSITY: 3.6,
  ENV_INTENSITY: 1.6, // image-based light from the HDRI
  HEMI_INTENSITY: 0.5,
  // Haze on land and props (the sea and sky are not fogged): factor = max * (1 - exp(-(d - start) / length))
  FOG_START: 1e6, // meters from the camera where haze begins (1e6 = off)
  FOG_LENGTH: 150, // meters
  FOG_MAX: 0.7,
  FOG_COLOR: 0xa6cdf0,
};

export type Look = typeof DEFAULT_LOOK;
export const LOOK: Look = { ...DEFAULT_LOOK };

export function applyLookFromUrl(search: string): void {
  const raw = new URLSearchParams(search).get('look');
  if (!raw) return;
  for (const pair of raw.split(',')) {
    const [k, v] = pair.split(':');
    const n = Number(v);
    if (k in LOOK && Number.isFinite(n)) LOOK[k as keyof Look] = n;
  }
}
