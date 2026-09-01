import type { App, Feature } from '../../types';
import { ENGINES, type SearchEngine, type SearchResult } from './engines';

export const imageSearch: Feature = {
  id: 'imgsearch',
  name: '以图搜源',
  desc: '上传图片，多引擎搜索出处',
  icon: 'photo-search',
  category: 'shiyong',
  group: '图片工具',
  basePath: '/api/imgsearch',
  register(app: App) {
    app.get('/api/imgsearch/engines', (c) =>
      c.json({ engines: ENGINES.filter((e) => e.available(c.env)).map((e) => ({ id: e.id })) })
    );

    app.post('/api/imgsearch', async (c) => {
      const form = await c.req.formData();
      const file = form.get('image') as File | string | null;
      const engineId = form.get('engine');
      if (!file || typeof file === 'string') return c.json({ error: '缺少 image' }, 400);

      const engines = typeof engineId === 'string' && engineId
        ? ENGINES.filter((e) => e.id === engineId && e.available(c.env))
        : ENGINES.filter((e) => e.available(c.env));

      const errors: Record<string, string> = {};
      const searchWithTimeout = async (engine: SearchEngine): Promise<SearchResult[]> => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        try {
          return await Promise.race([
            engine.search(file, c.env),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('请求超时')), 30_000);
            }),
          ]);
        } finally {
          if (timer !== null) clearTimeout(timer);
        }
      };

      const settled = await Promise.allSettled(engines.map((e) => searchWithTimeout(e)));
      const byEngine: Array<{ engine: string; results: SearchResult[] }> = [];
      for (const [i, s] of settled.entries()) {
        if (s.status === 'fulfilled' && s.value.length > 0) {
          byEngine.push({ engine: engines[i]!.id, results: s.value });
        } else if (s.status === 'rejected') {
          errors[engines[i]!.id] = s.reason instanceof Error ? s.reason.message : String(s.reason);
        }
      }
      if (byEngine.length) {
        return c.json({
          engine: null,
          results: byEngine.flatMap(({ engine, results }) => results.map((r) => ({ ...r, engine }))),
          byEngine: byEngine.map(({ engine, results }) => ({ engine, count: results.length })),
        });
      }
      for (const [i, s] of settled.entries()) {
        if (s.status === 'fulfilled') errors[engines[i]!.id] = '无结果';
      }
      return c.json({ engine: null, results: [], errors });
    });
  },
};
