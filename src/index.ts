import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { CATEGORIES, type Env } from './types';
import { FEATURES } from './features';

const app = new Hono<{ Bindings: Env }>();

const RATE_LIMIT = 60;
const RATE_WINDOW = 60_000;
const RATE_EXEMPT = /^\/api\/(features|parse\/proxy|kfc|fabing)$/;

app.use('/api/*', cors());
app.use('/api/*', async (c, next) => {
  if (RATE_EXEMPT.test(c.req.path)) return next();
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  const windowKey = Math.floor(Date.now() / RATE_WINDOW);
  const key = `rl:${ip}:${windowKey}`;
  const count = Number((await c.env.KV.get(key)) ?? 0);
  if (count >= RATE_LIMIT) {
    return c.json({ error: `请求太频繁，请一分钟后再试（限 ${RATE_LIMIT} 次/分钟）` }, 429);
  }
  await c.env.KV.put(key, String(count + 1), { expirationTtl: Math.ceil(RATE_WINDOW / 1000) });
  return next();
});

app.get('/api/features', (c) =>
  c.json({
    categories: CATEGORIES,
    features: FEATURES.map((f) => ({
      id: f.id,
      name: f.name,
      desc: f.desc,
      icon: f.icon,
      category: f.category,
      group: f.group,
      basePath: f.basePath,
    })),
  })
);

FEATURES.forEach((f) => f.register(app));

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'not found' }, 404);
  return c.env.ASSETS.fetch(c.req.raw).then((res) => {
    if (res.status === 404) return notFoundPage(c);
    if (res.status !== 200) return res;
    const headers = new Headers(res.headers);
    if (c.req.path.startsWith('/images/')) {
      headers.set('Cache-Control', 'public, max-age=2592000, immutable');
    } else if (c.req.path === '/' || c.req.path.endsWith('.html')) {
      headers.set('Cache-Control', 'no-cache');
    } else {
      headers.set('Cache-Control', 'public, max-age=86400');
    }
    return new Response(res.body, { status: res.status, headers });
  });
});

const notFoundPage = (c: Context) => {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>迷路了喵 - Neko 功能站</title>
<style>
  body {
    margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    background: #f4f8fd; color: #2c3e50;
  }
  .box { text-align: center; padding: 32px; }
  .box img { width: 96px; height: 96px; border-radius: 50%; margin-bottom: 20px; }
  h1 { font-size: 56px; margin: 0 0 8px; color: #096dd9; }
  p { margin: 0 0 24px; color: #7a8699; font-size: 15px; }
  a {
    display: inline-block; background: #096dd9; color: #fff; text-decoration: none;
    padding: 10px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #1a1c22; color: #e6e8ee; }
    h1 { color: #4da3ff; }
    p { color: #9aa3b2; }
  }
</style>
</head>
<body>
  <div class="box">
    <img src="/images/nekosleep.webp" alt="睡觉的 neko" />
    <h1>404</h1>
    <p>这里什么都没有喵…neko 都睡着了。迷路了吗？</p>
    <a href="/">带neko回家喵</a>
  </div>
</body>
</html>`;
  return c.html(html, 404);
};

export default app;