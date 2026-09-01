/* 疯狂星期四：随机一条 KFC 疯四文案 */
(() => {
  let kfcCount = 0;
  const isThursday = () => new Date().getDay() === 4;

  window.__features.kfc = {
    renderer: () =>
      `<button class="act${isThursday() ? ' kfc-day' : ''}" style="margin-left: auto" onclick="__run('kfc')">${isThursday() ? '🍗 V我50' : '来一条'}</button>`,
    reset: () => { kfcCount = 0; },
    run: () => guard('kfc', async () => {
      const again = ['再来一条！', '还要还要！', '不够劲，再来！', '再来亿条！', '这条不够味，换一条！', '继续继续！', '还没看够，再来！', 'V我50，再整一条！', '扶我起来，我还能看！', '别停，再来一条！'];
      addMsg('user', kfcCount++ ? again[Math.floor(Math.random() * again.length)] : '来一条');
      try {
        const r = await (await fetch('/api/kfc')).json();
        if (r.error) return addMsg('neko', '呜…文案卡住了喵：' + esc(r.error));
        const thursdayLines = [
          '🍗 今天真的是疯狂星期四喵！<br><br>',
          '🍗 尾巴都竖起来了，今天是正日子喵！<br><br>',
          '🍗 V我50的时候到了喵！<br><br>',
        ];
        addMsg('neko', (r.isThursday ? thursdayLines[Math.floor(Math.random() * thursdayLines.length)] : '') + esc(r.text) + copyBtn(r.text));
        if (r.isThursday) markEgg('thursday');
      } catch (e) {
        addMsg('neko', '呜…文案卡住了喵：' + esc(e.message || String(e)));
      }
    }),
  };
})();
