/* 发病语录：输入名字生成一段"发病"文案 */
(() => {
  window.__features.fabing = {
    renderer: () =>
      `<input type="text" id="fb-name" placeholder="输入对象名字，回车生成" onkeydown="if(event.key==='Enter')__run('fabing')" />
       <button class="act" onclick="__run('fabing')">生成</button>`,
    run: () => guard('fabing', async () => {
      const name = ($('fb-name').value || '你').trim() || '你';
      addMsg('user', esc(name));
      if (/^(neko|猫娘|nekodayo)$/i.test(name)) {
        $('fb-name').value = '';
        const line = pickArr(FABING_NEKO_LINES);
        addMsg('neko', esc(line) + copyBtn(line));
        markEgg('fabingNeko');
        return;
      }
      try {
        const r = await (await fetch('/api/fabing?name=' + encodeURIComponent(name))).json();
        if (r.error) return addMsg('neko', '呜…生成失败啦喵：' + esc(r.error));
        addMsg('neko', esc(r.text) + copyBtn(r.text));
      } catch (e) {
        addMsg('neko', '呜…生成失败啦喵：' + esc(e.message || String(e)));
      }
    }),
  };
})();
