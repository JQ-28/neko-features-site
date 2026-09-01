/* 今日doro结局：抽取今日命运 */
(() => {
  const DORO_KEY = 'neko-doro-today';
  const today = () => localDay();

  const extOf = (ct) => (ct.includes('jpeg') ? 'jpg' : ct.includes('gif') ? 'gif' : ct.includes('webp') ? 'webp' : 'png');

  const doroImg = (d, withDl = true) =>
    `<img src="${esc(d.image)}" alt="${esc(d.name)}" onerror="this.remove()" />
     <div class="pig-name">${esc(d.name)}</div>
     ${withDl ? `<a class="dl-btn" href="javascript:;" data-url="${esc(d.image)}" data-name="${esc(d.name)}" onclick="downloadDoro(this)">${DL_ICON}下载</a>` : ''}`;

  window.downloadDoro = async (btn) => {
    const url = btn.dataset.url;
    const name = btn.dataset.name || 'doro结局';
    btn.onclick = null;
    btn.classList.add('busy');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      saveBlob(await res.blob(), `${name}.${extOf(res.headers.get('content-type') || '')}`);
      flashDone(btn);
    } catch (e) {
      addMsg('neko', '呜…下载失败啦喵：' + esc(e.message || String(e)));
      btn.onclick = () => window.downloadDoro(btn);
    } finally {
      btn.classList.remove('busy');
    }
  };

  window.doroToday = () => guard('doro', async () => {
    addMsg('user', '今日doro结局');
    try {
      const cached = JSON.parse(localStorage.getItem(DORO_KEY) || 'null');
      if (cached && cached.date === today() && cached.doro) return addMsg('neko', doroImg(cached.doro, false));
    } catch {}
    addMsg('neko', pickLine('doro'));
    try {
      const d = await (await fetch('/api/doro')).json();
      if (d.error) return addMsg('neko', '呜…抽取失败啦喵：' + esc(d.error));
      try { localStorage.setItem(DORO_KEY, JSON.stringify({ date: today(), doro: d })); } catch {}
      addMsg('neko', doroImg(d));
    } catch (e) {
      addMsg('neko', '呜…抽取失败啦喵：' + esc(e.message || String(e)));
    }
  });

  window.__features.doro = {
    renderer: () => `<button class="act" onclick="doroToday()">今日doro结局</button>`,
  };
})();
