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
  SAND_LIGHT: 0xfff8c4, // yellowish tops
  SAND_DARK: 0xd49f66, // orange hollows
  SAND_MACRO: 0.35, // strength of the large-scale copy that hides tiling
  SAND_TILE: 3, // texture scale multiplier (2 = features twice as big)
  SAND_NORMAL: 1.8, // normal map strength
  SAND_CAVITY: 0.8, // 0..1: AO cavities pull toward SAND_DARK
  SAND_CONTRAST: 2.5, // how far the detail spreads between SAND_DARK and SAND_LIGHT
  SAND_GAMMA: 0.6, // tone curve: < 1 = more of the sand toward SAND_LIGHT
  SAND_HEIGHT: 0, // relief depth (m) for parallax + self-shadow (0 = off); scales with SAND_TILE
  // Sea (sea.ts). Provisional colors: matched to the reference only after waves and foam exist.
  // Water color = seabed * T + deep * (1 - T), T = exp(-absorb * depth * (1 + viewPath / view angle))
  SEA_BED: 0xe8d2a6, // seabed (sand) seen through shallow water
  SEA_BED_GAIN: 1.0, // brightness of the seabed (lit sand is brighter than 1 before tone mapping)
  SEA_DEEP: 0x0a3c8c, // color of deep water (light scattered back by the water itself)
  SEA_ABSORB_R: 0.9, // absorption per meter, per channel (red goes first -> turquoise, then blue)
  SEA_ABSORB_G: 0.18,
  SEA_ABSORB_B: 0.05,
  SEA_VIEW_PATH: 0.1, // extra light path for slanted views (0 = straight down and up only)
  SEA_REFLECT: 0.3, // sky reflection strength (1 = physical Fresnel)
  SEA_NORMAL: 0.35, // small-wave normal strength
  SEA_WAVE_SCALE: 1.0, // size of the small waves (2 = twice as big)
  SEA_GLINT: 6.0, // sun glint brightness
  SEA_GLINT_POWER: 600, // sun glint sharpness
  SEA_GLINT_TILT: 4, // how much steeper the waves are for glints (the sun is high, flat water never reflects it)
  // Breaking waves (scripted loop, no physics)
  SEA_WAVE_PERIOD: 9, // seconds between waves
  SEA_WAVE_H: 0.5, // wave height (m) when it breaks
  SEA_BREAK_DIST: 8, // where it breaks: meters offshore of the still waterline
  SEA_CREST_COLOR: 0x40e0c0, // sunlight through the thin top of a wave
  SEA_CREST_GLOW: 0.6,
  SEA_FOAM_TILE: 4, // meters per repeat of the foam texture
  SEA_FREEZE: -1, // >= 0: stop the sea at this time (s), for comparisons
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
