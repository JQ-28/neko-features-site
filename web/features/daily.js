/* 多源日报：60秒/知乎/微博/IT之家/历史/抖音/贴吧 聚合 */
(() => {
  const DAILY_TYPES = [
    { id: '60s', name: '60秒看世界' },
    { id: 'zhihu', name: '知乎热榜' },
    { id: 'weibo', name: '微博热搜' },
    { id: 'ithome', name: 'IT之家' },
    { id: 'history', name: '历史上的今天' },
    { id: 'douyin', name: '抖音热搜' },
    { id: 'tieba', name: '贴吧话题榜' },
  ];

  window.toggleDaily = (btn) => {
    const dd = btn.closest('.dropdown');
    const willOpen = !dd.classList.contains('open');
    document.querySelectorAll('.dropdown.open').forEach((d) => d.classList.remove('open'));
    dd.classList.toggle('open', willOpen);
  };
  window.pickDailyType = (item) => {
    const dd = item.closest('.dropdown');
    dd.dataset.value = item.dataset.val || '';
    dd.querySelector('.dropdown-btn').innerHTML = item.textContent.trim() + ' ' + ARROW;
    dd.querySelectorAll('.dropdown-item').forEach((i) => i.classList.toggle('active', i === item));
    dd.classList.remove('open');
  };
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) document.querySelectorAll('.dropdown.open').forEach((d) => d.classList.remove('open'));
  });

  const renderDaily = (r) => {
    const head = `<div class="daily-head"><span class="daily-title">${esc(r.title)}</span>${r.date ? `<span class="daily-date">${esc(r.date)}</span>` : ''}</div>`;
    const tip = r.tip ? `<div class="daily-tip">${esc(r.tip)}</div>` : '';
    const list = (r.items || []).map((it) => {
      const rank = it.index <= 3 ? ` top${it.index}` : '';
      const hot = it.hot ? `<span class="daily-hot">${esc(it.hot)}</span>` : '';
      const desc = it.desc ? `<div class="daily-desc">${esc(it.desc)}</div>` : '';
      const link = it.url ? `<a class="daily-link" href="${esc(it.url)}" target="_blank" rel="noopener">查看详情</a>` : '';
      return `<div class="daily-item"><span class="daily-rank${rank}">${esc(it.index)}</span><div class="daily-body"><div class="daily-item-title">${esc(it.title)}${hot}</div>${desc}${link}</div></div>`;
    }).join('');
    return `<div class="daily-card">${head}${tip}<div class="daily-list">${list}</div></div>`;
  };

  const seenDaily = (type) => {
    const day = localDay();
    let rec = null;
    try { rec = JSON.parse(localStorage.getItem('neko-daily-seen') || 'null'); } catch { rec = null; }
    if (!rec || rec.date !== day) rec = { date: day, types: [] };
    if (!rec.types.includes(type)) rec.types.push(type);
    try { localStorage.setItem('neko-daily-seen', JSON.stringify(rec)); } catch { /* 隐私模式等忽略 */ }
    if (DAILY_TYPES.every((t) => rec.types.includes(t.id))) markEgg('newsFan', pickArr(NEWS_FAN_LINES));
  };

  window.__features.daily = {
    renderer: () => {
      const options = DAILY_TYPES.map((t) => `<div class="dropdown-item${t.id === '60s' ? ' active' : ''}" data-val="${t.id}" onclick="pickDailyType(this)">${esc(t.name)}</div>`).join('');
      return `<div class="dropdown fill" id="daily-type"><button class="dropdown-btn" type="button" onclick="toggleDaily(this)">60秒看世界 ${ARROW}</button><div class="dropdown-menu">${options}</div></div>
              <button class="act" onclick="__run('daily')">获取</button>`;
    },
    run: () => guard('daily', async () => {
      const type = $('daily-type').dataset.value || '60s';
      const name = DAILY_TYPES.find((t) => t.id === type)?.name || type;
      addMsg('user', name);
      addMsg('neko', pickLine('daily'));
      try {
        const r = await (await fetch(`/api/daily?type=${encodeURIComponent(type)}`)).json();
        if (r.error) return addMsg('neko', '呜…日报获取失败啦喵：' + esc(r.error));
        addMsg('neko', renderDaily(r));
        seenDaily(type);
      } catch (e) {
        addMsg('neko', '呜…日报获取失败啦喵：' + esc(e.message || String(e)));
      }
    }),
  };
})();
