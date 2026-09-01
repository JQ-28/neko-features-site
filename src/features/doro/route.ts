import rawData from './data.json';
import type { App, Feature } from '../../types';

interface DoroEnding {
  id: number;
  name: string;
  en: string;
  pic: string;
}

const endings = (rawData as { endings: DoroEnding[] }).endings;
const PIC_BASE = 'https://raw.githubusercontent.com/SeeWhyRan/doroending_pic_assets/main/DoroEndingPic/';
const PIC_HOST = /^raw\.githubusercontent\.com$/;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

export const doro: Feature = {
  id: 'doro',
  name: '今日doro结局',
  desc: '抽取属于你今日的 doro 结局，47 种命运等你解锁',
  icon: 'dice',
  category: 'yule',
  group: '互动娱乐',
  basePath: '/api/doro',
  register(app: App) {
    app.get('/api/doro', async (c) => {
      const ending = endings[Math.floor(Math.random() * endings.length)]!;
      return c.json({ ...ending, image: `/api/doro/img?pic=${encodeURIComponent(ending.pic)}` });
    });

    app.get('/api/doro/img', async (c) => {
      const pic = c.req.query('pic');
      if (!pic || !/^[\w.-]+$/u.test(pic)) return c.json({ error: '图片名无效' }, 400);
      const url = `${PIC_BASE}${pic}`;
      if (new URL(url).hostname !== 'raw.githubusercontent.com') return c.json({ error: '域名不在允许列表' }, 403);
      const upstream = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
      const headers = new Headers();
      const ct = upstream.headers.get('content-type');
      if (ct) headers.set('content-type', ct);
      headers.set('Cache-Control', 'public, max-age=86400');
      return new Response(upstream.body, { status: upstream.status, headers });
    });
  },
};
