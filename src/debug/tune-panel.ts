// Live tuning panel (?tune=1): sliders for every value in params.ts.
// Values persist in this browser (localStorage). "コピー" copies the changed values as JSON
// so they can be pasted to the developer and baked into DEFAULT_PARAMS.
import { DEFAULT_PARAMS, P, PARAM_RANGES, resetParams, setParams, type ParamKey } from '../sim/params.ts';

const STORAGE_KEY = 'beachvolley.params';

const GROUPS: { title: string; keys: ParamKey[] }[] = [
  { title: '移動', keys: ['PLAYER_SPEED', 'PLAYER_ACCEL'] },
  { title: 'ジャンプ', keys: ['JUMP_VELOCITY', 'PLAYER_GRAVITY', 'JUMP_HANG_FRAMES'] },
  { title: 'ボール（滞空時間・秒）', keys: ['BALL_GRAVITY', 'T_PASS', 'T_SET', 'T_LOB', 'T_DRIVE', 'T_SPIKE', 'T_SERVE'] },
  { title: '打球の強さ', keys: ['MAX_ATTACK_VX', 'HARD_BALL_SPEED'] },
  { title: 'タッチ判定', keys: ['FLICK_MIN_PX', 'FLICK_MAX_MS', 'JUMP_ZONE_RATIO'] },
];

const LABELS: Record<ParamKey, string> = {
  PLAYER_SPEED: '走る速さ m/s',
  PLAYER_ACCEL: '加速 m/s²',
  JUMP_VELOCITY: 'ジャンプ初速 m/s',
  PLAYER_GRAVITY: 'ジャンプ重力',
  JUMP_HANG_FRAMES: '最高点で止まる(フレーム)',
  BALL_GRAVITY: 'ボール重力',
  T_PASS: 'レシーブ',
  T_SET: 'トス',
  T_LOB: '山なり返球',
  T_DRIVE: '強打(地上)',
  T_SPIKE: 'スパイク',
  T_SERVE: 'サーブ',
  MAX_ATTACK_VX: '打球の最大横速度 m/s',
  HARD_BALL_SPEED: 'これ以上の速さは拾いにくい m/s',
  FLICK_MIN_PX: 'フリック最小距離 px',
  FLICK_MAX_MS: 'フリック最大時間 ms',
  JUMP_ZONE_RATIO: 'ジャンプ領域（画面上部の割合）',
};

function load(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) setParams(JSON.parse(raw));
  } catch {
    /* storage unavailable: use defaults */
  }
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(changedValues()));
  } catch {
    /* ignore */
  }
}

function changedValues(): Partial<Record<ParamKey, number>> {
  const out: Partial<Record<ParamKey, number>> = {};
  for (const k of Object.keys(P) as ParamKey[]) if (P[k] !== DEFAULT_PARAMS[k]) out[k] = P[k];
  return out;
}

export function installTunePanel(host: { setPaused(paused: boolean): void; isPaused(): boolean }): void {
  load();
  const toggle = document.createElement('button');
  toggle.id = 'tune-toggle';
  toggle.textContent = '⚙';
  const panel = document.createElement('div');
  panel.id = 'tune-panel';
  panel.hidden = true;
  document.body.append(toggle, panel);

  const stop = (e: Event) => e.stopPropagation();
  for (const el of [toggle, panel]) {
    el.addEventListener('pointerdown', stop);
    el.addEventListener('touchstart', stop, { passive: true });
  }
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });

  const inputs = new Map<ParamKey, { range: HTMLInputElement; out: HTMLElement }>();
  const refresh = () => {
    for (const [k, { range, out }] of inputs) {
      range.value = String(P[k]);
      out.textContent = String(P[k]);
      out.classList.toggle('changed', P[k] !== DEFAULT_PARAMS[k]);
    }
  };

  const head = document.createElement('div');
  head.className = 'tune-head';
  const pauseBtn = document.createElement('button');
  const syncPause = () => {
    pauseBtn.textContent = host.isPaused() ? '▶ 再開' : '⏸ 一時停止';
  };
  pauseBtn.addEventListener('click', () => {
    host.setPaused(!host.isPaused());
    syncPause();
  });
  syncPause();
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'コピー';
  const status = document.createElement('div');
  status.className = 'tune-status';
  copyBtn.addEventListener('click', async () => {
    const text = JSON.stringify(changedValues());
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = `コピーしました: ${text}`;
    } catch {
      status.textContent = text; // select & copy manually
    }
  });
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '初期値に戻す';
  resetBtn.addEventListener('click', () => {
    resetParams();
    save();
    refresh();
    status.textContent = '';
  });
  head.append(pauseBtn, copyBtn, resetBtn);
  panel.append(head, status);

  for (const g of GROUPS) {
    const h = document.createElement('div');
    h.className = 'tune-group';
    h.textContent = g.title;
    panel.append(h);
    for (const k of g.keys) {
      const [min, max, stepSize] = PARAM_RANGES[k];
      const row = document.createElement('label');
      row.className = 'tune-row';
      const name = document.createElement('span');
      name.textContent = LABELS[k];
      const out = document.createElement('b');
      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(min);
      range.max = String(max);
      range.step = String(stepSize);
      range.addEventListener('input', () => {
        setParams({ [k]: Number(range.value) });
        out.textContent = range.value;
        out.classList.toggle('changed', P[k] !== DEFAULT_PARAMS[k]);
        save();
      });
      row.append(name, out, range);
      panel.append(row);
      inputs.set(k, { range, out });
    }
  }
  refresh();
}
