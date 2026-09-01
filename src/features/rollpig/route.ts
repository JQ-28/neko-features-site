import type { App, Feature } from '../../types';

const PIG_JSON_URL = 'https://pig.felislab.cc/resources/rollpig/pig.json';
const PIG_IMG_BASE = 'https://pig.felislab.cc/resources/rollpig/images/';
const IMG_HOST = /^(?:[\w-]+\.)*pig\.felislab\.cc$/;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

interface Pig {
  id: string;
  name: string;
  description: string;
  analysis: string;
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

const getPigs = async (kv: KVNamespace): Promise<Pig[]> => {
  const cached = await kv.get('rollpig:pigs');
  if (cached) return JSON.parse(cached) as Pig[];
  const res = await fetch(PIG_JSON_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`小猪资源获取失败(${res.status})`);
  const pigs = (await res.json()) as Pig[];
  if (!pigs.length) throw new Error('猪圈空荡荡');
  await kv.put('rollpig:pigs', JSON.stringify(pigs), { expirationTtl: 86400 });
  return pigs;
};

const imgProxy = (id: string) => `/api/rollpig/img?url=${encodeURIComponent(`${PIG_IMG_BASE}${id}.png`)}`;

export const rollpig: Feature = {
  id: 'rollpig',
  name: '今日小猪',
  desc: '抽取今日猪格 / 随机猪图 / 找猪',
  icon: 'pig',
  category: 'yule',
  group: '互动娱乐',
  basePath: '/api/rollpig',
  register(app: App) {
    app.get('/api/rollpig', async (c) => {
      const action = c.req.query('action') ?? 'today';
      try {
        const pigs = await getPigs(c.env.KV);
        if (action === 'today') {
          const pig = pick(pigs);
          return c.json({ ...pig, image: imgProxy(pig.id) });
        }
        if (action === 'random') {
          const pig = pick(pigs);
          return c.json({ title: pig.name, image: imgProxy(pig.id) });
        }
        if (action === 'find') {
          const kw = (c.req.query('keyword') ?? '').toLowerCase().trim();
          if (!kw) return c.json({ error: '请输入找猪关键词' }, 400);
          const found = pigs
            .filter((p) => p.name.toLowerCase().includes(kw) || p.description.toLowerCase().includes(kw) || p.id.toLowerCase().includes(kw))
            .slice(0, 20);
          if (!found.length) return c.json({ error: '你要找的猪仔离家出走了~' });
          return c.json({ items: found.map((p) => ({ ...p, image: imgProxy(p.id) })) });
        }
        return c.json({ error: '未知操作' }, 400);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    });

    app.get('/api/rollpig/img', async (c) => {
      const url = c.req.query('url');
      if (!url) return c.json({ error: '缺少 url' }, 400);
      let host: string;
      try {
        host = new URL(url).hostname;
      } catch {
        return c.json({ error: 'url 无效' }, 400);
      }
      if (!IMG_HOST.test(host)) return c.json({ error: '域名不在允许列表' }, 403);
      const upstream = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://pig.felislab.cc/' } });
      const headers = new Headers();
      const ct = upstream.headers.get('content-type');
      if (ct) headers.set('content-type', ct);
      headers.set('Cache-Control', 'public, max-age=86400');
      return new Response(upstream.body, { status: upstream.status, headers });
    });
  },
};
