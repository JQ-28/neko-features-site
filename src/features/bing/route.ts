import type { App, Feature } from '../../types';

const API_BASE = 'https://60s.nekodayo.top';
const BING_IMG_HOST = /^(?:[\w-]+\.)*bing\.com$/;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

export const bing: Feature = {
  id: 'bing',
  name: '必应壁纸',
  desc: '获取今日必应每日壁纸',
  icon: 'image',
  category: 'shiyong',
  group: '图片工具',
  basePath: '/api/bing',
  register(app: App) {
    app.get('/api/bing', async (c) => {
      try {
        const res = await fetch(`${API_BASE}/v2/bing?encoding=json`, { headers: { 'User-Agent': 'neko-features' }, signal: AbortSignal.timeout(12_000) });
        if (!res.ok) return c.json({ error: '壁纸接口请求失败' }, 502);
        const json = (await res.json()) as { code?: number; message?: string; data?: Record<string, unknown> };
        if (json.code !== 200 || !json.data) return c.json({ error: json.message || '壁纸获取失败' }, 502);
        const proxy = (u: unknown) => `/api/bing/img?url=${encodeURIComponent(String(u))}`;
        return c.json({ ...json.data, cover: proxy(json.data.cover), cover_4k: proxy(json.data.cover_4k ?? json.data.cover) });
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    });

    app.get('/api/bing/img', async (c) => {
      const url = c.req.query('url');
      if (!url) return c.json({ error: '缺少 url' }, 400);
      let host: string;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return c.json({ error: 'url 无效' }, 400);
        host = parsed.hostname;
      } catch {
        return c.json({ error: 'url 无效' }, 400);
      }
      if (!BING_IMG_HOST.test(host)) return c.json({ error: '域名不在允许列表' }, 403);
      let upstream: Response;
      try {
        upstream = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.bing.com' }, redirect: 'manual', signal: AbortSignal.timeout(12_000) });
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
      if (upstream.status >= 300 && upstream.status < 400) return c.json({ error: '上游重定向，已拦截' }, 403);
      const headers = new Headers();
      const ct = upstream.headers.get('content-type');
      if (ct) headers.set('content-type', ct);
      headers.set('Cache-Control', 'public, max-age=86400');
      return new Response(upstream.body, { status: upstream.status, headers });
    });
  },
};
