// Asset manifest: which downloaded assets exist (see tools/fetch-assets.mjs).
// Paths are relative to the page, so the game works under a GitHub Pages sub-path.

export interface SkyAsset {
  background: string; // 2k equirect HDR shown behind everything
  env: string; // 1k equirect HDR used for image-based lighting
}

export interface SandAsset {
  color: string;
  normal: string;
  roughness?: string;
  ao?: string; // ambient occlusion: darkens the cavities
  height?: string; // displacement (height) map: parallax and self-shadowing of the relief
  tileMeters: number; // texture repeats every N meters
}

export interface FoamAsset {
  color: string;
  opacity: string; // the foam pattern (lace) as a mask
  normal?: string;
  roughness?: string;
}

export interface Manifest {
  sky: SkyAsset | null;
  sand: SandAsset | null;
  wetSand: SandAsset | null;
  foam: FoamAsset | null;
}

export async function loadManifest(): Promise<Manifest> {
  try {
    const r = await fetch('assets/manifest.json');
    if (!r.ok) throw new Error(String(r.status));
    const m = (await r.json()) as Partial<Manifest>;
    return { sky: m.sky ?? null, sand: m.sand ?? null, wetSand: m.wetSand ?? null, foam: m.foam ?? null };
  } catch {
    return { sky: null, sand: null, wetSand: null, foam: null };
  }
}
