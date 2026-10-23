// Headless runner: plays the game without graphics and prints text output.
//
//   node tools/sim-cli.ts --autoplay --seed 1                 # one bot-vs-bot match, summary
//   node tools/sim-cli.ts --autoplay --matches 20             # 20 matches (seeds 1..20), stats
//   node tools/sim-cli.ts --autoplay --events --frames 900    # JSONL event log
//   node tools/sim-cli.ts --autoplay --trace 6 --frames 300   # positions every 6 frames
//   node tools/sim-cli.ts --autoplay --ascii 120,180,240      # court drawings at given frames
//   node tools/sim-cli.ts --ascii-on hit --frames 900         # court drawing at each hit event
//   node tools/sim-cli.ts --virtual-human --matches 10        # human player driven by touch-like commands
//   node tools/sim-cli.ts --script replay.json --events       # replay recorded human input
import { readFileSync } from 'node:fs';
import { renderAscii } from '../src/sim/ascii.ts';
import type { Command, GameEvent, World } from '../src/sim/types.ts';
import { createVirtualHuman, virtualHumanCommands } from '../src/sim/virtual-human.ts';
import { createWorld, defaultConfig, step } from '../src/sim/world.ts';

interface Args {
  seed: number;
  matches: number;
  frames: number;
  points?: number;
  autoplay: boolean;
  virtualHuman: boolean;
  script?: string;
  events: boolean;
  trace: number;
  ascii: Set<number>;
  asciiOn: Set<string>;
  quiet: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    seed: 1,
    matches: 1,
    frames: 60 * 60 * 30,
    autoplay: false,
    virtualHuman: false,
    events: false,
    trace: 0,
    ascii: new Set(),
    asciiOn: new Set(),
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--seed') a.seed = Number(v());
    else if (k === '--matches') a.matches = Number(v());
    else if (k === '--frames') a.frames = Number(v());
    else if (k === '--points') a.points = Number(v());
    else if (k === '--autoplay') a.autoplay = true;
    else if (k === '--virtual-human') a.virtualHuman = true;
    else if (k === '--script') a.script = v();
    else if (k === '--events') a.events = true;
    else if (k === '--trace') a.trace = Number(v());
    else if (k === '--ascii') for (const f of v().split(',')) a.ascii.add(Number(f));
    else if (k === '--ascii-on') for (const t of v().split(',')) a.asciiOn.add(t);
    else if (k === '--quiet') a.quiet = true;
    else if (k === '--help' || k === '-h') {
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 11).join('\n'));
      process.exit(0);
    } else {
      console.error(`unknown arg: ${k}`);
      process.exit(2);
    }
  }
  return a;
}

interface ScriptFile {
  seed?: number;
  autoplay?: boolean;
  points?: number;
  commands: ({ f: number } & Command)[];
}

interface MatchStats {
  seed: number;
  frames: number;
  score: [number, number];
  winner: number | null;
  rallies: number;
  hitsPerRally: number[];
  shots: Record<string, number>;
  pointReasons: Record<string, number>;
  violations: string[];
  whiffs: number;
  netTouches: number;
}

function fmtTrace(w: World): string {
  const b = w.ball;
  const ps = w.players
    .map((p) => `${p.name}:${p.x.toFixed(2)},${p.y.toFixed(2)}${p.swingFrames > 0 ? '*' : ''}`)
    .join(' ');
  return `f=${w.frame} ${w.phase} ball:${b.x.toFixed(2)},${b.y.toFixed(2)} v:${b.vx.toFixed(2)},${b.vy.toFixed(2)} ${ps} recv=${w.plan?.receiver ?? '-'} land=${w.plan?.landX.toFixed(2) ?? '-'}`;
}

function runMatch(args: Args, seed: number, script?: ScriptFile): MatchStats {
  const world = createWorld(
    defaultConfig({
      seed,
      autoplay: script?.autoplay ?? args.autoplay,
      pointsToWin: script?.points ?? args.points ?? 15,
    }),
  );
  const byFrame = new Map<number, Command[]>();
  for (const c of script?.commands ?? []) {
    const { f, ...cmd } = c;
    const list = byFrame.get(f) ?? [];
    list.push(cmd as Command);
    byFrame.set(f, list);
  }

  const stats: MatchStats = {
    seed,
    frames: 0,
    score: [0, 0],
    winner: null,
    rallies: 0,
    hitsPerRally: [],
    shots: {},
    pointReasons: {},
    violations: [],
    whiffs: 0,
    netTouches: 0,
  };
  const vh = args.virtualHuman ? createVirtualHuman() : null;
  let hitsThisRally = 0;
  let seen = 0;

  for (let i = 0; i < args.frames && world.phase !== 'matchEnd'; i++) {
    const cmds = byFrame.get(world.frame) ?? [];
    if (vh) cmds.push(...virtualHumanCommands(world, vh));
    step(world, cmds);
    const newEvents: GameEvent[] = world.events.slice(seen);
    seen = world.events.length;
    for (const e of newEvents) {
      if (args.events) console.log(JSON.stringify(e));
      if (args.asciiOn.has(e.type)) console.log(`--- ${e.type} ---\n${renderAscii(world)}\n`);
      if (e.type === 'hit') {
        hitsThisRally++;
        stats.shots[e.kind] = (stats.shots[e.kind] ?? 0) + 1;
      } else if (e.type === 'point') {
        stats.rallies++;
        stats.hitsPerRally.push(hitsThisRally);
        hitsThisRally = 0;
        const key = e.reason.replace(/team \d/, 'team N');
        stats.pointReasons[key] = (stats.pointReasons[key] ?? 0) + 1;
      } else if (e.type === 'violation') {
        stats.violations.push(`f=${e.f} ${e.message}`);
      } else if (e.type === 'whiff') stats.whiffs++;
      else if (e.type === 'miss') stats.shots.miss = (stats.shots.miss ?? 0) + 1;
      else if (e.type === 'net') stats.netTouches++;
    }
    const f = world.frame - 1;
    if (args.trace > 0 && f % args.trace === 0) console.log(fmtTrace(world));
    if (args.ascii.has(f)) console.log(`${renderAscii(world)}\n`);
  }
  stats.frames = world.frame;
  stats.score = [world.score[0], world.score[1]];
  stats.winner = world.winner;
  return stats;
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

const args = parseArgs(process.argv.slice(2));
const script: ScriptFile | undefined = args.script ? JSON.parse(readFileSync(args.script, 'utf8')) : undefined;
const all: MatchStats[] = [];
for (let m = 0; m < args.matches; m++) {
  const seed = (script?.seed ?? args.seed) + m;
  all.push(runMatch(args, seed, script));
}

if (!args.quiet) {
  for (const s of all) {
    console.error(
      `seed=${s.seed} frames=${s.frames} (${(s.frames / 60).toFixed(0)}s) score=${s.score[0]}-${s.score[1]} ` +
        `winner=${s.winner ?? '-'} rallies=${s.rallies} avgHits=${avg(s.hitsPerRally).toFixed(2)} ` +
        `maxHits=${Math.max(0, ...s.hitsPerRally)} net=${s.netTouches} whiffs=${s.whiffs} violations=${s.violations.length}`,
    );
  }
  const shots: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  for (const s of all) {
    for (const [k, v] of Object.entries(s.shots)) shots[k] = (shots[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.pointReasons)) reasons[k] = (reasons[k] ?? 0) + v;
  }
  const allHits = all.flatMap((s) => s.hitsPerRally);
  const hist: Record<string, number> = {};
  for (const h of allHits) hist[h >= 10 ? '10+' : String(h)] = (hist[h >= 10 ? '10+' : String(h)] ?? 0) + 1;
  console.error(`--- total: matches=${all.length} rallies=${allHits.length} avgHitsPerRally=${avg(allHits).toFixed(2)}`);
  console.error(`hits per rally histogram: ${JSON.stringify(hist)}`);
  console.error(`shots: ${JSON.stringify(shots)}`);
  console.error(`point reasons: ${JSON.stringify(reasons)}`);
  const v = all.flatMap((s) => s.violations.map((x) => `seed=${s.seed} ${x}`));
  console.error(`violations: ${v.length}${v.length ? '\n  ' + v.slice(0, 20).join('\n  ') : ''}`);
}
process.exitCode = all.some((s) => s.violations.length > 0) ? 1 : 0;
