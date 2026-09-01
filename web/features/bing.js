/* 必应壁纸：今日必应每日壁纸 + 标题描述 */
(() => {
  window.downloadBing = async (btn) => {
    const url = btn.dataset.url;
    btn.onclick = null;
    btn.classList.add('busy');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      saveBlob(await res.blob(), `必应壁纸_${localDay()}.jpg`);
      flashDone(btn);
    } catch (e) {
      addMsg('neko', '呜…下载失败啦喵：' + esc(e.message || String(e)));
      btn.onclick = () => window.downloadBing(btn);
    } finally {
      btn.classList.remove('busy');
    }
  };

  window.__features.bing = {
    renderer: () => `<button class="act" style="margin-left:auto" onclick="__run('bing')">来一张</button>`,
    run: () => guard('bing', async () => {
      addMsg('user', '来一张今日壁纸');
      addMsg('neko', pickLine('bing'));
      try {
        const d = await (await fetch('/api/bing')).json();
        if (d.error) return addMsg('neko', '呜…壁纸获取失败啦喵：' + esc(d.error));
        addMsg('neko', `<img src="${esc(d.cover)}" alt="${esc(d.title)}" />
          <div class="bing-title">${esc(d.title)}</div>
          <div class="bing-desc">${esc(d.description || d.headline || '')}</div>
          ${d.copyright ? `<div class="bing-copy">${esc(d.copyright)}</div>` : ''}
          ${d.update_date ? `<div class="bing-date">更新于 ${esc(d.update_date)}</div>` : ''}
          <a class="dl-btn" href="javascript:;" data-url="${esc(d.cover_4k)}" onclick="downloadBing(this)">${DL_ICON}下载 4K</a>`);
      } catch (e) {
        addMsg('neko', '呜…壁纸获取失败啦喵：' + esc(e.message || String(e)));
      }
    }),
  };
})();
