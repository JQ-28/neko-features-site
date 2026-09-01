import type { Hono } from 'hono';

export interface Env {
  KV: KVNamespace;
  R2: R2Bucket;
  ASSETS: Fetcher;
  YOUDAO_APP_KEY?: string;
  YOUDAO_APP_SECRET?: string;
  BAIDU_APP_ID?: string;
  BAIDU_APP_KEY?: string;
  HUOSHAN_ACCESS_KEY?: string;
  HUOSHAN_SECRET_KEY?: string;
  REMOVE_BG_KEY?: string;
  SAUCENAO_KEY?: string;
  EXHENTAI_COOKIE?: string;
  BILI_COOKIE?: string;
}

export type App = Hono<{ Bindings: Env }>;

export type CategoryId = 'shiyong' | 'yule';

export interface Category {
  id: CategoryId;
  name: string;
  icon: string;
  groups: string[];
}

export const CATEGORIES: Category[] = [
  { id: 'shiyong', name: '实用系列', icon: 'tool', groups: ['图片工具', '媒体解析', '信息查询', '学习工具'] },
  { id: 'yule', name: '娱乐系列', icon: 'confetti', groups: ['文字生成', '图片功能', '互动娱乐'] },
];

export interface Feature {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: CategoryId;
  group: string;
  basePath: string;
  register(app: App): void;
}