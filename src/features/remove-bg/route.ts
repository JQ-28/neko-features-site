import type { App, Feature } from '../../types';

export const removeBg: Feature = {
  id: 'remove-bg',
  name: '智能抠图',
  desc: '上传图片，去除背景（remove.bg）',
  icon: 'cut',
  category: 'shiyong',
  group: '图片工具',
  basePath: '/api/remove-bg',
  register(app: App) {
    app.post('/api/remove-bg', async (c) => {
      const raw = c.env.REMOVE_BG_KEY;
      if (!raw) return c.json({ error: 'REMOVE_BG_KEY 未配置' }, 500);
      const keys = raw.split(',').map((k) => k.trim()).filter(Boolean);

      const form = await c.req.formData();
      const file = form.get('image');
      const imageUrl = form.get('image_url');
      if (!(file && typeof file !== 'string') && typeof imageUrl !== 'string') {
        return c.json({ error: '缺少 image 或 image_url' }, 400);
      }

      let lastErr = '';
      for (const key of keys) {
        const upstream = new FormData();
        upstream.append('size', 'auto');
        if (file && typeof file !== 'string') upstream.append('image_file', file);
        else upstream.append('image_url', imageUrl as string);

        const res = await fetch('https://api.remove.bg/v1.0/removebg', {
          method: 'POST',
          headers: { 'X-Api-Key': key },
          body: upstream,
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) {
          return new Response(res.body, {
            headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
          });
        }
        lastErr = await res.text();
      }
      return c.json({ error: 'remove.bg 全部密钥失败', detail: lastErr }, 502);
    });
  },
};