/* 智能抠图：上传图片去除背景（remove.bg） */
(() => {
  window.__features['remove-bg'] = {
    imgUpload: true,
    renderer: () =>
      `<div class="up-box"><button class="up-reset" type="button" onclick="resetImg(this)" title="重新上传" hidden>${RESET_ICON}</button><label class="upload"><input type="file" id="rb-img" accept="image/*" onchange="showImg(this)" /><span class="up-icon">${UPLOAD_ICON}<span>选择图片</span></span></label></div>
                <button class="act" onclick="__run('remove-bg')">抠图</button>`,
    run: () => guard('remove-bg', async () => {
      const f = $('rb-img').files[0];
      if (!f) return addMsg('neko', pickArr(EMPTY_IMG_LINES));
      addMsg('user', `<img src="${firstPreview('rb-img')}" alt="" />`);
      addMsg('neko', pickLine('remove-bg'));
      try {
        const fd = new FormData(); fd.append('image', f);
        const res = await fetch('/api/remove-bg', { method: 'POST', body: fd });
        if (res.headers.get('content-type')?.includes('image')) {
          const url = URL.createObjectURL(await res.blob());
          const doneLines = ['背景抠掉啦喵！', '咔嚓！干干净净喵~✨', '剪好了喵，看看合不合心意呀！'];
          addMsg('neko', doneLines[Math.floor(Math.random() * doneLines.length)] + `<img src="${url}" alt="" /><a class="dl-btn" href="${url}" download="neko-抠图.png">${DL_ICON}下载</a>`);
        } else addMsg('neko', '呜…抠图失败啦喵：<br>' + esc(JSON.stringify(await res.json(), null, 2)));
      } catch (e) {
        addMsg('neko', '呜…抠图失败啦喵：' + esc(e.message || String(e)));
      }
    }),
  };
})();
