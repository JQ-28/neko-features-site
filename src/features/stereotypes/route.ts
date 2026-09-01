import type { App, Feature } from '../../types';
import { STEREOTYPE_LINES } from './data';

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

export const stereotypes: Feature = {
  id: 'fabing',
  name: '发病语录',
  desc: '输入名字，生成随机发病小作文',
  icon: 'pill',
  category: 'yule',
  group: '文字生成',
  basePath: '/api/fabing',
  register(app: App) {
    app.get('/api/fabing', (c) => {
      const name = (c.req.query('name') || '你').slice(0, 20);
      const text = pick(STEREOTYPE_LINES).replaceAll('{target_name}', name);
      return c.json({ text });
    });
  },
};