// Look-development values for the 3D view (sky grade, light balance, haze).
// Separate from sim/params.ts: these only change the picture. Override per page load with
// ?look=KEY:VALUE,KEY:VALUE (tools/ref-compare.mjs --look passes it through). Read LOOK.X at use time.

export const DEFAULT_LOOK = {
  EXPOSURE: 0.9, // renderer tone mapping exposure
  // Sky background (HDRI shown behind everything; lighting still uses the ungraded HDRI)
  SKY_EXPOSURE: 1.0,
  SKY_SAT: 1.0, // saturation multiplier
  SKY_ZENITH: 0.0, // 0..1: darken toward the top of the sky (deeper blue overhead)
  // Lights
  SUN_INTENSITY: 2.4,
  ENV_INTENSITY: 1.0, // image-based light from the HDRI
  HEMI_INTENSITY: 0.35,
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
