import type { World } from '../sim/types.ts';

export interface Hud {
  /** splitX = screen x of the net (move | flick boundary), jumpY = bottom of the jump band (CSS px). */
  update(world: World, splitX: number, jumpY: number): void;
}

export function createHud(root: HTMLElement): Hud {
  root.innerHTML = `
    <div class="zones" data-zones>
      <div class="zone-jump" data-zone-jump></div>
      <div class="zone-split" data-zone-split></div>
      <div class="zone-label" data-label-jump>タップでジャンプ</div>
      <div class="zone-label" data-label-move>タッチで移動</div>
      <div class="zone-label" data-label-flick>フリックで打つ</div>
    </div>
    <div class="score"><span class="me">あなた <b data-s0>0</b></span><span class="sep">-</span><span class="cpu"><b data-s1>0</b> 相手</span></div>
    <div class="message" data-msg></div>
  `;
  const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
  const s0 = q('[data-s0]');
  const s1 = q('[data-s1]');
  const msg = q('[data-msg]');
  const zones = q('[data-zones]');
  const zoneJump = q('[data-zone-jump]');
  const zoneSplit = q('[data-zone-split]');
  const labelJump = q('[data-label-jump]');
  const labelMove = q('[data-label-move]');
  const labelFlick = q('[data-label-flick]');
  let last = '';
  let lastLayout = '';

  return {
    update(world, splitX, jumpY) {
      s0.textContent = String(world.score[0]);
      s1.textContent = String(world.score[1]);

      // Zone guide: shown until the first point is played.
      const showZones = world.score[0] + world.score[1] === 0 && world.phase !== 'pointEnd';
      zones.classList.toggle('hidden', !showZones);
      const layout = `${Math.round(splitX)},${Math.round(jumpY)}`;
      if (showZones && layout !== lastLayout) {
        lastLayout = layout;
        zoneJump.style.height = `${jumpY}px`;
        zoneSplit.style.left = `${splitX}px`;
        zoneSplit.style.top = `${jumpY}px`;
        labelJump.style.left = '50%';
        labelJump.style.top = `${jumpY - 14}px`;
        labelMove.style.left = `${splitX / 2}px`;
        labelMove.style.top = `${jumpY + 24}px`;
        labelFlick.style.left = `${(splitX + window.innerWidth) / 2}px`;
        labelFlick.style.top = `${jumpY + 24}px`;
      }

      let text = '';
      if (world.phase === 'serveWait' && world.server === 0 && !world.config.autoplay) {
        text = '右側を前にフリックでサーブ！';
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
