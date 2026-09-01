import type { App, Feature } from '../../types';

const API_BASE = 'https://60s.nekodayo.top';

export const health: Feature = {
  id: 'health',
  name: '健康分析',
  desc: '输入身高体重年龄，分析BMI/体脂/代谢',
  icon: 'pill',
  category: 'shiyong',
  group: '信息查询',
  basePath: '/api/health',
  register(app: App) {
    app.get('/api/health', async (c) => {
      const height = Number(c.req.query('height'));
      const weight = Number(c.req.query('weight'));
      const age = Number(c.req.query('age'));
      const gender = c.req.query('gender') === 'female' ? 'female' : 'male';
      if (!Number.isFinite(height) || !Number.isFinite(weight) || !Number.isFinite(age)) {
        return c.json({ error: '参数不完整' }, 400);
      }
      if (height <= 30 || height >= 290 || weight <= 15 || weight >= 420 || age <= 0 || age > 150) {
        return c.json({ error: '参数超出合理范围' }, 400);
      }
      try {
        const res = await fetch(
          `${API_BASE}/v2/health?height=${height}&weight=${weight}&age=${age}&gender=${gender}`,
          { headers: { 'User-Agent': 'neko-features' }, signal: AbortSignal.timeout(12_000) },
        );
        if (!res.ok) return c.json({ error: '健康分析接口请求失败' }, 502);
        const json = (await res.json()) as { code?: number; message?: string; data?: unknown };
        if (json.code !== 200) return c.json({ error: json.message || '分析失败' }, 502);
        return c.json(json.data);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    });
  },
};
