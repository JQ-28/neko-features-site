import type { App, Feature } from '../../types';

const API_BASE = 'https://60s.nekodayo.top';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const MOYU_SOURCES = ['https://api.vvhan.com/api/moyu', 'https://www.yviii.com/moyu/moyu2.php'];

type Json = Record<string, unknown>;

interface DailyItem {
  index: number;
  title: string;
  desc?: string;
  hot?: string;
  url?: string;
  time?: string;
}

interface DailyResult {
  title: string;
  date?: string;
  tip?: string;
  image?: string;
  items: DailyItem[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const asList = (v: unknown): Json[] =>
  Array.isArray(v) ? v.filter((x): x is Json => typeof x === 'object' && x !== null) : [];

const fmtHot = (n: unknown): string => {
  const num = Number(n);
  if (!Number.isFinite(num) || num === 0) return str(n);
  if (num >= 1e8) return `${(num / 1e8).toFixed(1).replace(/\.0$/, '')}亿`;
  if (num >= 1e4) return `${(num / 1e4).toFixed(1).replace(/\.0$/, '')}万`;
  return String(num);
};

const fetchJson = async (url: string): Promise<Json> => {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`上游请求失败(${res.status})`);
  return (await res.json()) as Json;
};

const guardList = (items: DailyItem[], fallback: string): DailyItem[] => {
  if (!items.length) throw new Error(fallback);
  return items;
};

const load60s = async (): Promise<DailyResult> => {
  const json = await fetchJson(`${API_BASE}/v2/60s`);
  const d = (json.data ?? {}) as Json;
  const news = Array.isArray(d.news) ? (d.news as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  return {
    title: '60秒看世界',
    date: str(d.date),
    tip: str(d.tip),
    items: guardList(news.map((t, i) => ({ index: i + 1, title: t })), '未获取到60秒数据'),
  };
};

const loadZhihuDay = async (): Promise<DailyResult> => {
  const json = await fetchJson('https://api.vvhan.com/api/hotlist/zhihuDay');
  const items = asList(json.data).map((it, i) => ({ index: i + 1, title: str(it.title), url: str(it.url) }));
  return { title: '知乎日报', items: guardList(items, '未获取到知乎日报数据') };
};

const loadZhihu = async (): Promise<DailyResult> => {
  const json = await fetchJson(`${API_BASE}/v2/zhihu`);
  const items = asList(json.data).map((it, i) => ({ index: i + 1, title: str(it.title), hot: str(it.hot_value_desc), url: str(it.link) }));
  return { title: '知乎热榜', items: guardList(items, '未获取到知乎热榜数据') };
};

const loadWeibo = async (): Promise<DailyResult> => {
  const json = await fetchJson(`${API_BASE}/v2/weibo`);
  const items = asList(json.data).map((it, i) => ({ index: i + 1, title: str(it.title), hot: fmtHot(it.hot_value), url: str(it.link) }));
  return { title: '微博热搜', items: guardList(items, '未获取到微博热搜数据') };
};

const loadIthome = async (): Promise<DailyResult> => {
  const json = await fetchJson(`${API_BASE}/v2/it-news`);
  const items = asList(json.data).map((it, i) => ({ index: i + 1, title: str(it.title), desc: str(it.description).slice(0, 140), url: str(it.link), time: str(it.created) }));
  return { title: 'IT之家', items: guardList(items, '未获取到IT之家数据') };
};

const loadHistory = async (): Promise<DailyResult> => {
  const json = await fetchJson(`${API_BASE}/v2/today_in_history`);
  const d = (json.data ?? {}) as Json;
  const items = asList(d.items).map((it, i) => {
    const year = str(it.year);
    const title = str(it.title);
    return { index: i + 1, title: year ? `${year}年 ${title}` : title, desc: str(it.description), url: str(it.link) };
  });
  return { title: '历史上的今天', date: str(d.date), items: guardList(items, '未获取到历史上的今天数据') };
};

const loadAi = async (): Promise<DailyResult> => {
  const json = await fetchJson(`${API_BASE}/v2/ai-news`);
  const d = (json.data ?? {}) as Json;
  const items = asList(d.news).map((it, i) => ({ index: i + 1, title: str(it.title), desc: str(it.detail), url: str(it.link) }));
  return { title: 'AI快报', date: str(d.date), items: guardList(items, '今日暂无 AI 资讯') };
};

const loadDouyin = async (): Promise<DailyResult> => {
  const json = await fetchJson(`${API_BASE}/v2/douyin`);
  const items = asList(json.data).map((it, i) => ({ index: i + 1, title: str(it.title), hot: fmtHot(it.hot_value), url: str(it.link) }));
  return { title: '抖音热搜', items: guardList(items, '未获取到抖音热搜数据') };
};

const loadTieba = async (): Promise<DailyResult> => {
  const json = await fetchJson(`${API_BASE}/v2/baidu/tieba`);
  const items = asList(json.data).map((it) => ({ index: Number(it.rank) || 0, title: str(it.title), desc: str(it.desc), hot: str(it.score_desc), url: str(it.url) }));
  return { title: '贴吧话题榜', items: guardList(items, '未获取到贴吧话题榜数据') };
};

const loadMoyu = async (): Promise<DailyResult> => ({ title: '摸鱼日历', image: '/api/daily/moyu-img', items: [] });

const LOADERS: Record<string, () => Promise<DailyResult>> = {
  '60s': load60s,
  zhihuDay: loadZhihuDay,
  zhihu: loadZhihu,
  weibo: loadWeibo,
  ithome: loadIthome,
  history: loadHistory,
  ai: loadAi,
  douyin: loadDouyin,
  tieba: loadTieba,
  moyu: loadMoyu,
};

export const daily: Feature = {
  id: 'daily',
  name: '多源日报',
  desc: '60秒/热榜/历史/资讯等10种日报聚合',
  icon: 'news',
  category: 'shiyong',
  group: '信息查询',
  basePath: '/api/daily',
  register(app: App) {
    app.get('/api/daily', async (c) => {
      const type = c.req.query('type') ?? '';
      const loader = Object.hasOwn(LOADERS, type) ? LOADERS[type] : undefined;
      if (!loader) return c.json({ error: '未知日报类型' }, 400);
      const cacheKey = `daily:${type}`;
      let cached: string | null = null;
      try { cached = await c.env.KV.get(cacheKey); } catch { cached = null; }
      if (cached) {
        try { return c.json(JSON.parse(cached) as DailyResult); } catch { /* 缓存损坏则回源 */ }
      }
      try {
        const result = await loader();
        await c.env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 1800 }).catch(() => undefined);
        return c.json(result);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    });

    app.get('/api/daily/moyu-img', async (c) => {
      let lastErr = '';
      for (const url of MOYU_SOURCES) {
        try {
          const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12_000) });
          if (!res.ok) { lastErr = String(res.status); continue; }
          const headers = new Headers();
          const ct = res.headers.get('content-type');
          if (ct) headers.set('content-type', ct);
          headers.set('Cache-Control', 'public, max-age=3600');
          return new Response(res.body, { status: res.status, headers });
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
        }
      }
      return c.json({ error: '摸鱼日历获取失败', detail: lastErr }, 502);
    });
  },
};
