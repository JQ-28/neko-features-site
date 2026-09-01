import type { App, Feature } from '../../types';
import { PROVIDERS } from './providers';

export const mangaTranslator: Feature = {
  id: 'manga',
  name: '漫画翻译',
  desc: '上传图片，翻译图内文字（百度）',
  icon: 'language',
  category: 'shiyong',
  group: '图片工具',
  basePath: '/api/manga',
  register(app: App) {
    app.post('/api/manga', async (c) => {
      const form = await c.req.formData();
      const file = form.get('image');
      const to = (form.get('to') as string) || 'zh-CHS';
      if (!file || typeof file === 'string') return c.json({ error: '缺少 image' }, 400);

      const buf = await (file as unknown as Blob).arrayBuffer();
      const imageBytes = new Uint8Array(buf);
      const available = PROVIDERS.filter((p) => p.available(c.env));
      if (available.length === 0) return c.json({ error: '无可用翻译后端，请配置密钥' }, 500);

      const errors: Record<string, string> = {};
      for (const p of available) {
        try {
          const out = await p.translate({ imageBytes, to }, c.env);
          return c.json(out);
        } catch (e) {
          errors[p.id] = e instanceof Error ? e.message : String(e);
        }
      }
      return c.json({ error: '全部后端失败', detail: errors }, 502);
    });
  },
};
