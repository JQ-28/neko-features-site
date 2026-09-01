/* 链接解析：粘贴分享链接，解析出视频/图片/封面，支持预览和下载 */
(() => {
  let lastParseName = '';

  const PLATFORMS = ['B站', '抖音', '小红书', '快手', '微博', 'AcFun', 'X (Twitter)', 'LOFTER', '酷安', '米游社', '汽水音乐', '网易云音乐', '酷狗音乐', '豆瓣', '堆糖', '网易BUFF', '5EPlay', '豆包', '完美世界竞技', 'Linux Do', '壁吧专楼吧'];

  /* 以下函数出现在聊天 HTML 的 onclick 里（含 sessionStorage 恢复的历史），必须挂 window */
  window.togglePlatforms = () => {
    const existed = document.querySelector('.plat-msg');
    if (existed) { existed.remove(); return; }
    addMsg('neko', `支持的平台有：<div class="plat-tags">${PLATFORMS.map((p) => `<span class="plat-tag">${esc(p)}</span>`).join('')}</div>`);
    $('m-chat').lastChild.classList.add('plat-msg');
  };

  window.downloadCover = async (btn) => {
    const url = btn.dataset.cover;
    btn.onclick = null;
    try {
      const res = await fetch('/api/parse/proxy?url=' + encodeURIComponent(url), { referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error(res.status);
      const objectUrl = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = objectUrl;
      const ext = (url.match(/\.(jpe?g|png|webp|gif)/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
      a.download = `封面_${sanitizeName(lastParseName)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      addMsg('neko', '呜…封面下载失败啦喵：' + (e.message || String(e)));
      btn.onclick = () => window.downloadCover(btn);
    }
  };

  window.downloadMedia = async (btn) => {
    const url = btn.dataset.media;
    btn.onclick = null;
    btn.classList.add('busy');
    try {
      const res = await fetch('/api/parse/proxy?url=' + encodeURIComponent(url) + '&dl=1');
      if (!res.ok) throw new Error(res.status);
      const disp = res.headers.get('content-disposition') ?? '';
      const ext = disp.match(/\.(\w+)"/)?.[1] || 'mp4';
      saveBlob(await res.blob(), `${btn.dataset.name}.${ext}`);
      flashDone(btn);
    } catch (e) {
      addMsg('neko', '呜…下载失败啦喵：' + esc(e.message || String(e)));
      btn.onclick = () => window.downloadMedia(btn);
    } finally {
      btn.classList.remove('busy');
    }
  };

  window.downloadImagesZip = async (btn) => {
    const urls = JSON.parse(btn.dataset.images || '[]');
    btn.onclick = null;
    btn.classList.add('busy');
    try {
      const files = await Promise.all(urls.map(async (u, i) => {
        const res = await fetch('/api/parse/proxy?url=' + encodeURIComponent(u));
        if (!res.ok) throw new Error(`第 ${i + 1} 张获取失败(${res.status})`);
        return { name: `${String(i + 1).padStart(3, '0')}.${(res.headers.get('content-type') ?? 'image/jpeg').split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'}`, blob: await res.blob() };
      }));
      if (files.length === 1) {
        saveBlob(files[0].blob, `${btn.dataset.name}.${files[0].name.split('.')[1]}`);
        flashDone(btn);
        return;
      }
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      files.forEach((f) => zip.file(f.name, f.blob));
      saveBlob(await zip.generateAsync({ type: 'blob' }), `${btn.dataset.name}.zip`);
      flashDone(btn);
    } catch (e) {
      addMsg('neko', '呜…打包下载失败啦喵：' + esc(e.message || String(e)));
      btn.onclick = () => window.downloadImagesZip(btn);
    } finally {
      btn.classList.remove('busy');
    }
  };

  /* B站风控拉黑服务器 IP 时，用户从浏览器复制 SESSDATA 提交解锁（凭证存站点 KV） */
  window.biliCookieLogin = () => {
    addMsg('neko', `${esc(BILI_QR_TEXTS.cookieHint)}<div class="pdl-row"><input id="bili-sess-input" placeholder="粘贴 SESSDATA…" style="flex:1;min-width:0;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:inherit;font-size:13px" /><a class="dl-btn" href="javascript:;" onclick="biliCookieSubmit(this)">提交解锁</a></div>`);
  };

  window.biliCookieSubmit = async (btn) => {
    const input = document.getElementById('bili-sess-input');
    const sessdata = input?.value.trim();
    if (!sessdata) return;
    btn.onclick = null;
    btn.classList.add('busy');
    try {
      const r = await (await fetch('/api/parse/bili/cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessdata }),
      })).json();
      if (r.ok) return addMsg('neko', r.valid ? BILI_QR_TEXTS.success : BILI_QR_TEXTS.saved);
      addMsg('neko', BILI_QR_TEXTS.genFail + esc(r.error || '未知错误'));
      btn.onclick = () => window.biliCookieSubmit(btn);
    } catch (e) {
      addMsg('neko', BILI_QR_TEXTS.pollFail + esc(e.message || String(e)));
      btn.onclick = () => window.biliCookieSubmit(btn);
    } finally {
      btn.classList.remove('busy');
    }
  };

  window.__features.parser = {
    platforms: true,
    renderer: () =>
      `<textarea id="ps-text" placeholder="粘贴分享链接，Enter 解析，Shift+Enter 换行" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();__run('parser')}"></textarea>
       <button class="act" onclick="__run('parser')">解析</button>`,
    run: () => guard('parser', async () => {
      const text = $('ps-text').value.trim();
      if (!text) return addMsg('neko', pickArr(EMPTY_TEXT_LINES));
      addMsg('user', esc(text));
      $('ps-text').value = '';
      if (!/https?:\/\//i.test(text) && tryEasterEgg(text)) return;
      addMsg('neko', pickLine('parser'));
      let r;
      try {
        r = await (await fetch('/api/parse', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })).json();
      } catch (e) {
        return addMsg('neko', '呜…解析失败啦喵：' + esc(e.message || String(e)));
      }
      if (r.error) {
        if (/412|风控/.test(r.error)) {
          addMsg('neko', esc(BILI_QR_TEXTS.blocked));
          return window.biliCookieLogin();
        }
        return addMsg('neko', '这条链接拆不开呀喵…' + esc(r.error));
      }
      lastParseName = `${r.platformName || r.platform || ''}-${r.title || ''}`;
      const fileBase = sanitizeName(lastParseName);
      const fmtDur = (s) => s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
      let h = `<div class="presult">`;
      if (r.cover) h += `<img class="pcover" src="${esc(r.cover)}" alt="" referrerpolicy="no-referrer" />`;
      h += `<div class="pinfo">`;
      if (r.platformName) h += `<div class="pplat">${esc(r.platformName)}</div>`;
      if (r.title) h += `<div class="ptitle">${esc(r.title)}</div>`;
      const meta = [r.author ? '@' + esc(r.author) : '', fmtDur(r.duration)].filter(Boolean).join(' · ');
      if (meta) h += `<div class="pmeta">${meta}</div>`;
      if (r.desc) h += `<div class="pdesc">${esc(r.desc)}</div>`;
      h += `</div></div>`;
      if (r.videos?.length && !r.images?.length) h += copyBtn(r.videos[0]);
      if (r.videos?.length) {
        const proxy = (u) => '/api/parse/proxy?url=' + encodeURIComponent(u);
        const isMusic = ['qishui', 'netease', 'kugou'].includes(r.platform);
        const btnLabel = isMusic ? '下载音乐' : '下载视频';
        h += r.videos.map((v) =>
          (isMusic
            ? `<audio controls preload="metadata" src="${esc(proxy(v))}"></audio>`
            : `<video controls playsinline preload="metadata" poster="${r.cover ? esc(proxy(r.cover)) : ''}" src="${esc(proxy(v))}"></video>`) +
          `<div class="pdl-row"><a class="dl-btn" href="javascript:;" data-media="${esc(v)}" data-name="${isMusic ? '音乐' : '视频'}_${fileBase}" onclick="downloadMedia(this)">${DL_ICON}${btnLabel}</a>` +
          (r.cover ? `<a class="dl-btn" href="javascript:;" data-cover="${esc(r.cover)}" onclick="downloadCover(this)">${DL_ICON}下载封面</a>` : '') +
          `</div>`
        ).join('');
      }
      if (r.images?.length) {
        const multi = r.images.length > 1;
        h += `<div class="pimgs">` + r.images.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="" loading="lazy" /></a>`).join('') + `</div>`;
        h += (multi
          ? `<a class="dl-btn" href="javascript:;" data-images='${esc(JSON.stringify(r.images))}' data-name="图集_${fileBase}" onclick="downloadImagesZip(this)">${DL_ICON}打包下载 ${r.images.length} 张</a>`
          : `<a class="dl-btn" href="javascript:;" data-images='${esc(JSON.stringify(r.images))}' data-name="图片_${fileBase}" onclick="downloadImagesZip(this)">${DL_ICON}下载图片</a>`);
      }
      if (!r.videos?.length && !r.images?.length) h += `<div class="pdesc">呜…这个链接里没有拿到媒体内容呀喵</div>`;
      const okLines = [
        '拆好啦喵！东西都在下面～',
        '解析完成喵！直接点按钮保存哦✨',
        '拿到啦拿到啦喵！看看下面吧~',
        '包裹拆开了喵！想下载哪个随便挑呀♪',
      ];
      addMsg('neko', (r.videos?.length || r.images?.length ? okLines[Math.floor(Math.random() * okLines.length)] + '<br>' : '') + h);
    }),
  };
})();
