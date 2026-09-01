import type { App, Feature } from '../../types';

export const sayoroll: Feature = {
  id: 'roll',
  name: '随机 Roll',
  desc: '随机数字、二选一、多选一、判断句、概率',
  icon: 'dice',
  category: 'yule',
  group: '互动娱乐',
  basePath: '/api/roll',
  register(_app: App) {},
};
