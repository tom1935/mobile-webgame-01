export function createOverlay(root) {
    root.hidden = false;
    return (w, fps) => {
        const f = (n) => n.toFixed(2).padStart(6);
        const lines = [
            `f=${w.frame} ${w.phase} fps=${fps.toFixed(0)} score=${w.score[0]}-${w.score[1]} touches=${w.touchTeam ?? '-'}:${w.touches}`,
            `ball x${f(w.ball.x)} y${f(w.ball.y)} vx${f(w.ball.vx)} vy${f(w.ball.vy)} land=${w.plan ? w.plan.landX.toFixed(1) : '-'} recv=${w.plan?.receiver ?? '-'}`,
            ...w.players.map((p) => `${p.name} x${f(p.x)} y${f(p.y)} tgt=${p.targetX === null ? '  -  ' : f(p.targetX)}${p.swingFrames > 0 ? ' swing:' + p.swing?.kind : ''}`),
            ...w.events.slice(-3).map((e) => JSON.stringify(e).slice(0, 70)),
        ];
        root.textContent = lines.join('\n');
    };
}
