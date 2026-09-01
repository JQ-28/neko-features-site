import type { App, Feature } from '../../types';
import { KFC_LINES } from './data';

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

export const crazyThursday: Feature = {
  id: 'kfc',
  name: '疯狂星期四',
  desc: '随机返回一条 KFC 疯狂星期四文案',
  icon: 'bucket',
  category: 'yule',
  group: '文字生成',
  basePath: '/api/kfc',
  register(app: App) {
    app.get('/api/kfc', (c) => {
      const isThursday = new Date(Date.now() + 8 * 3600_000).getUTCDay() === 4;
      return c.json({ text: pick(KFC_LINES), isThursday });
    });
  },
};