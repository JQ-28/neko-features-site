/* 漫画翻译：上传图片，百度翻译识别并翻译图内文字 */
(() => {
  let mangaResults = [];

  /* 百度只认 jpg/png，webp/gif 等会报 69006；统一用 canvas 重编码为 jpeg，透明底填白 */
  const toBaiduImage = async (file) => {
    if (file.type === 'image/jpeg' || file.type === 'image/png') return file;
    const bmp = await createImageBitmap(file);
    const MAX = 2000;
    const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  };

  /* 结果里的按钮经 sessionStorage 恢复后仍要可用，必须挂 window */
  window.downloadMangaZip = async () => {
    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      mangaResults.forEach((x) => zip.file(x.name, x.b64, { base64: true }));
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      a.download = `漫画翻译_${localDay()}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.zip`;
      a.click();
    } catch (e) {
      addMsg('neko', '呜…打包下载失败啦喵：' + esc(e.message || String(e)));
    }
  };

  window.__features.manga = {
    imgUpload: true,
    renderer: () =>
      `<div class="up-box"><button class="up-reset" type="button" onclick="resetImg(this)" title="重新上传" hidden>${RESET_ICON}</button><label class="upload"><input type="file" id="mg-img" accept="image/*" multiple onchange="showImg(this)" /><span class="up-icon">${UPLOAD_ICON}<span>选择图片</span></span></label></div>
      <button class="act" onclick="__run('manga')">翻译</button>`,
    run: () => guard('manga', async () => {
      const input = $('mg-img');
      const files = [...input.files];
      if (!files.length) return addMsg('neko', pickArr(EMPTY_IMG_LINES));
      const previews = JSON.parse(input.dataset.previews || '[]');
      addMsg('user', previews.map((u) => `<img src="${u}" alt="" />`).join(''));
      addMsg('neko', pickLine('manga'));
      try {
        const results = await Promise.all(files.map(async (f) => {
          const img = await toBaiduImage(f);
          const fd = new FormData(); fd.append('image', img);
          try {
            return await (await fetch('/api/manga', { method: 'POST', body: fd })).json();
          } catch (e) {
            return { error: e.message || String(e) };
          }
        }));
        mangaResults = [];
        const html = results.map((r, i) => {
          if (r.renderedImage) {
            mangaResults.push({ name: `翻译${i + 1}.png`, b64: r.renderedImage });
            return `<img src="data:image/png;base64,${r.renderedImage}" alt="" />`;
          }
          const detail = r.error || Object.values(r.detail || {}).join('；');
          return `<p class="empty">这张图翻译失败了喵${detail ? `（${esc(detail)}）` : ''}，换个 jpg/png 格式试试？</p>`;
        }).join('');
        const dl = mangaResults.length > 1
          ? `<a class="dl-btn" href="javascript:;" onclick="downloadMangaZip()">${DL_ICON}全部下载</a>`
          : (mangaResults.length === 1 ? `<a class="dl-btn" href="data:image/png;base64,${mangaResults[0].b64}" download="${mangaResults[0].name}">${DL_ICON}下载</a>` : '');
        addMsg('neko', html + dl);
      } catch (e) {
        addMsg('neko', '呜…翻译失败啦喵：' + esc(e.message || String(e)));
      }
    }),
  };
})();
