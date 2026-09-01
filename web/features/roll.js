/* 随机 Roll：数字 / 二选一 / 多选一 / 判断句 / 概率 */
(() => {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)] ?? arr[0];

  const resolve = (raw) => {
    const s = raw.trim();
    if (!s) return `Roll 到 ${1 + Math.floor(Math.random() * 100)}（1-100）`;

    const prob = s.match(/^(.*?)概率$/);
    if (prob) {
      const subj = prob[1].replace(/的$/, '') || '这件事';
      return `${subj}的概率为：${(Math.random() * 100).toFixed(2)}%`;
    }

    if (/^\d+$/.test(s)) {
      const n = Math.min(parseInt(s, 10), 100000);
      return `Roll 到 ${1 + Math.floor(Math.random() * n)}（1-${n}）`;
    }

    const judge = s.match(/^(.+?)([\u4e00-\u9fa5])(不|没)\2(.+)$/);
    if (judge) {
      const subj = judge[1] === '我' ? '你' : judge[1];
      const ans = Math.random() < 0.5 ? judge[2] : judge[3] + judge[2];
      return `neko觉得${subj}${ans}${judge[4]}喵`;
    }

    if (s.includes('还是')) {
      const [a, b] = s.split('还是', 2).map((x) => x.trim()).filter(Boolean);
      if (a && b) return `当然是${pick([a, b])}咯`;
    }

    const words = s.split(/[\s,，、]+/).map((x) => x.trim()).filter(Boolean);
    if (words.length >= 2) return `neko帮你选：${pick(words)}喵`;

    return `neko帮你选了「${s}」喵`;
  };

  window.__features.roll = {
    renderer: () =>
      `<input type="text" id="roll-input" placeholder="留空 Roll 1-100；支持 A还是B / 多词 / 我能不能中奖 / xxx概率" onkeydown="if(event.key==='Enter')__run('roll')" />
       <button class="act" onclick="__run('roll')">Roll</button>`,
    run: () => guard('roll', () => {
      const input = $('roll-input');
      const raw = input.value || '';
      input.value = '';
      const result = resolve(raw);
      addMsg('user', esc(raw || 'roll'));
      addMsg('neko', esc(result) + copyBtn(result));
    }),
  };
})();
