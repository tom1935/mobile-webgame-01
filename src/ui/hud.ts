import type { World } from '../sim/types.ts';

export interface Hud {
  update(world: World): void;
}

export function createHud(root: HTMLElement): Hud {
  root.innerHTML = `
    <div class="score"><span class="me">あなた <b data-s0>0</b></span><span class="sep">-</span><span class="cpu"><b data-s1>0</b> 相手</span></div>
    <div class="message" data-msg></div>
  `;
  const s0 = root.querySelector<HTMLElement>('[data-s0]')!;
  const s1 = root.querySelector<HTMLElement>('[data-s1]')!;
  const msg = root.querySelector<HTMLElement>('[data-msg]')!;
  let last = '';

  return {
    update(world) {
      s0.textContent = String(world.score[0]);
      s1.textContent = String(world.score[1]);
      let text = '';
      if (world.phase === 'serveWait' && world.server === 0 && !world.config.autoplay) {
        text = '前にフリックでサーブ！';
      } else if (world.phase === 'pointEnd') {
        const e = [...world.events].reverse().find((x) => x.type === 'point');
        if (e && e.type === 'point') text = e.team === 0 ? 'ポイント！' : '失点…';
      } else if (world.phase === 'matchEnd') {
        text = world.winner === 0 ? '勝利！ タップでもう一度' : '敗北… タップでもう一度';
      }
      if (text !== last) {
        msg.textContent = text;
        msg.classList.toggle('show', text !== '');
        last = text;
      }
    },
  };
}
