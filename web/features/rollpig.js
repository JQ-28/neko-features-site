/* 今日小猪：今日猪格 / 随机猪图 / 找猪 */
(() => {
  const PIG_KEY = 'neko-pig-today';
  const today = () => localDay();

  const extOf = (ct) => (ct.includes('webp') ? 'webp' : ct.includes('jpeg') ? 'jpg' : ct.includes('gif') ? 'gif' : 'png');

  const pigImg = (pig, withDl = true) =>
    `<img src="${esc(pig.image)}" alt="${esc(pig.name)}" onerror="this.remove()" />
     <div class="pig-name">${esc(pig.name)}</div>
     ${withDl ? `<a class="dl-btn" href="javascript:;" data-url="${esc(pig.image)}" data-name="${esc(pig.name)}" onclick="downloadPig(this)">${DL_ICON}下载</a>` : ''}
     ${pig.description ? `<div class="pig-desc">${esc(pig.description)}</div>` : ''}`;

  window.downloadPig = async (btn) => {
    const url = btn.dataset.url;
    const name = btn.dataset.name || '小猪';
    btn.onclick = null;
    btn.classList.add('busy');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      saveBlob(await res.blob(), `${name}.${extOf(res.headers.get('content-type') || '')}`);
      flashDone(btn);
    } catch (e) {
      addMsg('neko', '呜…下载失败啦喵：' + esc(e.message || String(e)));
      btn.onclick = () => window.downloadPig(btn);
    } finally {
      btn.classList.remove('busy');
    }
  };

  const fetchPig = async (action, keyword) => {
    const url = keyword ? `/api/rollpig?action=${action}&keyword=${encodeURIComponent(keyword)}` : `/api/rollpig?action=${action}`;
    return (await fetch(url)).json();
  };

  window.pigToday = () => guard('rollpig', async () => {
    try {
      const cached = JSON.parse(localStorage.getItem(PIG_KEY) || 'null');
      if (cached && cached.date === today() && cached.pig) {
        addMsg('user', '今日小猪');
        return addMsg('neko', pigImg(cached.pig, false));
      }
    } catch {}
    addMsg('user', '今日小猪');
    addMsg('neko', pickLine('rollpig'));
    try {
      const pig = await fetchPig('today');
      if (pig.error) return addMsg('neko', '呜…抽猪失败啦喵：' + esc(pig.error));
      try { localStorage.setItem(PIG_KEY, JSON.stringify({ date: today(), pig })); } catch {}
      addMsg('neko', pigImg(pig, false));
    } catch (e) {
      addMsg('neko', '呜…抽猪失败啦喵：' + esc(e.message || String(e)));
    }
  });

  window.pigRandom = () => guard('rollpig', async () => {
    addMsg('user', '随机小猪');
    addMsg('neko', pickLine('rollpig'));
    try {
      const r = await fetchPig('random');
      if (r.error) return addMsg('neko', '呜…抽猪失败啦喵：' + esc(r.error));
      addMsg('neko', pigImg({ name: r.title, description: '', image: r.image }));
    } catch (e) {
      addMsg('neko', '呜…抽猪失败啦喵：' + esc(e.message || String(e)));
    }
  });

  window.pigFind = () => guard('rollpig', async () => {
    const kw = $('pig-kw').value.trim();
    if (!kw) return addMsg('neko', '要输入关键词才能找猪哦喵～比如「野猪」「红烧」「苹果」…');
    $('pig-kw').value = '';
    addMsg('user', '找猪：' + kw);
    addMsg('neko', pickLine('rollpig'));
    try {
      const r = await fetchPig('find', kw);
      if (r.error) return addMsg('neko', '呜…找猪失败啦喵：' + esc(r.error));
      const imgs = r.items.map((p) => `<div class="pig-grid-item"><img src="${esc(p.image)}" alt="${esc(p.name)}" onerror="this.remove()" /><div class="pig-grid-name">${esc(p.name)}</div><a class="dl-btn pig-dl" href="javascript:;" data-url="${esc(p.image)}" data-name="${esc(p.name)}" onclick="downloadPig(this)">${DL_ICON}下载</a></div>`).join('');
      addMsg('neko', `<div class="pig-grid">${imgs}</div>`);
    } catch (e) {
      addMsg('neko', '呜…找猪失败啦喵：' + esc(e.message || String(e)));
    }
  });

  window.__features.rollpig = {
    renderer: () =>
      `<button class="act" onclick="pigToday()">今日小猪</button>
       <button class="act" onclick="pigRandom()">随机</button>
       <input type="text" id="pig-kw" placeholder="找猪：输入关键词" onkeydown="if(event.key==='Enter')pigFind()" />
       <button class="act" onclick="pigFind()">找猪</button>`,
  };
})();
