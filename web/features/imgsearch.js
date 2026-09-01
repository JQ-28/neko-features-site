/* 以图搜源：上传图片搜索出处，多引擎结果合并展示 */
(() => {
  const ENGINE_NAMES = {
    saucenao: 'SauceNAO', tracemoe: 'TraceMoe', animetrace: 'AnimeTrace', baidu: '百度',
  };

  const loadImgEngines = async () => {
    try {
      const r = await (await fetch('/api/imgsearch/engines')).json();
      const dd = $('is-api');
      if (!dd) return;
      const list = [{ id: '', name: '自动切换' }, ...r.engines.map((e) => ({ id: e.id, name: ENGINE_NAMES[e.id] || e.id }))];
      dd.dataset.value = '';
      dd.querySelector('.dropdown-btn').innerHTML = '自动切换 ' + ARROW;
      dd.querySelector('.dropdown-menu').innerHTML = list.map((e) =>
        `<div class="dropdown-item${e.id === '' ? ' active' : ''}" data-val="${e.id}" onclick="pickEngine(this)">${esc(e.name)}</div>`
      ).join('');
    } catch (e) {}
  };

  /* 引擎下拉交互（渲染 HTML 的 onclick 里引用，挂 window） */
  window.toggleDropdown = (btn) => {
    const dd = btn.closest('.dropdown');
    const willOpen = !dd.classList.contains('open');
    document.querySelectorAll('.dropdown.open').forEach((d) => d.classList.remove('open'));
    dd.classList.toggle('open', willOpen);
  };
  window.pickEngine = (item) => {
    const dd = item.closest('.dropdown');
    dd.dataset.value = item.dataset.val || '';
    dd.querySelector('.dropdown-btn').innerHTML = item.textContent.trim() + ' ' + ARROW;
    dd.querySelectorAll('.dropdown-item').forEach((i) => i.classList.toggle('active', i === item));
    dd.classList.remove('open');
  };
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) document.querySelectorAll('.dropdown.open').forEach((d) => d.classList.remove('open'));
  });

  window.__features.imgsearch = {
    imgUpload: true,
    renderer: () =>
      `<div class="up-box"><button class="up-reset" type="button" onclick="resetImg(this)" title="重新上传" hidden>${RESET_ICON}</button><label class="upload"><input type="file" id="is-img" accept="image/*" onchange="showImg(this)" /><span class="up-icon">${UPLOAD_ICON}<span>选择图片</span></span></label></div>
              <div class="dropdown" id="is-api"><button class="dropdown-btn" type="button" onclick="toggleDropdown(this)">自动切换 ${ARROW}</button><div class="dropdown-menu"></div></div>
              <button class="act" onclick="__run('imgsearch')">搜源</button>`,
    open: loadImgEngines,
    run: () => guard('imgsearch', async () => {
      const f = $('is-img').files[0];
      if (!f) return addMsg('neko', pickArr(EMPTY_IMG_LINES));
      addMsg('user', `<img src="${firstPreview('is-img')}" alt="" />`);
      addMsg('neko', pickLine('imgsearch'));
      let r;
      try {
        const fd = new FormData(); fd.append('image', f);
        const engine = $('is-api').dataset.value;
        if (engine) fd.append('engine', engine);
        r = await (await fetch('/api/imgsearch', { method: 'POST', body: fd })).json();
      } catch (e) {
        return addMsg('neko', '呜…搜索失败啦喵：' + esc(e.message || String(e)));
      }
      if (r.error) return addMsg('neko', '呜…搜索失败啦喵：' + esc(r.error));
      if (r.results && r.results.length) {
        const head = (r.byEngine || []).length > 1
          ? `<div class="sengine">命中引擎：${r.byEngine.map((b) => `${esc(ENGINE_NAMES[b.engine] || b.engine)} × ${b.count}`).join('、')}</div>`
          : (r.byEngine?.[0] ? `<div class="sengine">引擎：${esc(ENGINE_NAMES[r.byEngine[0].engine] || r.byEngine[0].engine)}</div>` : '');
        addMsg('neko', head + r.results.map((x) => {
          const thumb = x.thumbnail ? `<img class="sthumb" src="${esc(x.thumbnail)}" alt="" />` : '';
          const title = x.title ? `<div class="stitle">${esc(x.title)}</div>` : '';
          const extra = x.extra ? `<div class="sextra">${esc(x.extra)}</div>` : '';
          const engineTag = x.engine ? `<span class="sengine-tag">${esc(ENGINE_NAMES[x.engine] || x.engine)}</span>` : '';
          const meta = `<div class="smeta">${engineTag}${x.similarity ? '相似度 ' + esc(x.similarity) + '%' : ''}${x.source ? ' · ' + esc(x.source) : ''}</div>`;
          const link = x.url ? `<a class="slink" href="${esc(x.url)}" target="_blank">${esc(x.url)}</a>` : '';
          return `<div class="sresult">${thumb}<div class="sinfo">${title}${extra}${meta}${link}${x.url ? copyBtn(x.url) : ''}</div></div>`;
        }).join(''));
      } else {
        const errs = r.errors ? `<br>${Object.entries(r.errors).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}` : '';
        const noHitLines = [
          '呜…嗅了一圈没找到出处呀喵。要不要换个引擎试试？',
          '爪子都翻酸了喵，没有匹配的结果…换个引擎碰碰运气？',
          '这条线索太难了喵…尾巴垂下来了。要不要再搜一次呀？',
        ];
        addMsg('neko', noHitLines[Math.floor(Math.random() * noHitLines.length)] + errs);
      }
    }),
  };
})();
