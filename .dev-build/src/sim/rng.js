// Seeded PRNG (mulberry32). The sim must only use this, never Math.random().
export function createRng(seed) {
    return { state: seed >>> 0 };
}
/** Uniform float in [0, 1). */
export function next(rng) {
    rng.state = (rng.state + 0x6d2b79f5) >>> 0;
    let t = rng.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function range(rng, min, max) {
    return min + (max - min) * next(rng);
}
/** Approximate normal distribution (sum of 3 uniforms), mean 0, given sigma. */
export function gauss(rng, sigma) {
    return (next(rng) + next(rng) + next(rng) - 1.5) * 2 * sigma;
}
