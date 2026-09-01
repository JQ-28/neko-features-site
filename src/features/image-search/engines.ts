import type { Env } from '../../types';

export interface SearchResult {
  similarity: string;
  thumbnail: string;
  title?: string;
  url?: string;
  source?: string;
  extra?: string;
}

export interface SearchEngine {
  id: string;
  available(env: Env): boolean;
  search(file: File, env: Env): Promise<SearchResult[]>;
}

const stripTags = (html: string): string => html.replace(/<[^>]+>/g, '').trim();

const saucenao: SearchEngine = {
  id: 'saucenao',
  available: () => true,
  async search(file, env) {
    const form = new FormData();
    if (env.SAUCENAO_KEY) {
      form.append('api_key', env.SAUCENAO_KEY);
      form.append('output_type', '2');
    }
    form.append('numres', '5');
    form.append('db', '999');
    form.append('file', file);
    const res = await fetch('https://saucenao.com/search.php', {
      method: 'POST',
      body: form,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (!res.ok) throw new Error('SauceNAO 失败');

    if (env.SAUCENAO_KEY) {
      const data = (await res.json()) as {
        results?: Array<{ header: Record<string, unknown>; data: Record<string, unknown> }>;
      };
      return (data.results ?? []).map((r) => ({
        similarity: String(r.header.similarity ?? ''),
        thumbnail: String(r.header.thumbnail ?? ''),
        title: r.data.title as string | undefined,
        url: (r.data.ext_urls as string[] | undefined)?.[0],
        source: r.data.source as string | undefined,
      }));
    }

    const html = await res.text();
    const blocks = html.match(/<div class="result(?:\s[^"]*)?">[\s\S]*?(?=<div class="result[\s"]|$)/g) ?? [];
    const results: SearchResult[] = [];
    for (const block of blocks) {
      if (block.includes('result-hidden-notification')) continue;
      const similarity = block.match(/resultsimilarityinfo">([\d.]+)%/)?.[1] ?? '';
      const thumbnail =
        block.match(/<img[^>]*?data-src2="([^"]+)"/)?.[1] ??
        block.match(/<img[^>]*?data-src="([^"]+)"/)?.[1] ??
        block.match(/<div class="resultimage"[^>]*>\s*<a[^>]*>\s*<img[^>]*?src="([^"]+)"/)?.[1] ??
        '';
      const title = block.match(/resulttitle">([\s\S]*?)<\/div>/)?.[1];
      const link = block.match(/resultcontentcolumn[\s\S]*?<a[^>]*?href="([^"]+)"/)?.[1];
      if (!title && !link) continue;
      results.push({
        similarity,
        thumbnail,
        title: title ? stripTags(title) : undefined,
        url: link,
        source: 'SauceNAO',
      });
    }
    return results;
  },
};

const traceMoe: SearchEngine = {
  id: 'tracemoe',
  available: () => true,
  async search(file) {
    const form = new FormData();
    form.append('image', file);
    const res = await fetch('https://api.trace.moe/search?anilistInfo=1', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) throw new Error('TraceMoe 失败');
    const data = (await res.json()) as {
      result?: Array<{
        similarity: number;
        image: string;
        filename: string;
        episode?: number;
        anilist?: { id?: number; title?: { native?: string; romaji?: string; english?: string } };
      }>;
    };
    return (data.result ?? []).map((r) => ({
      similarity: (r.similarity * 100).toFixed(2),
      thumbnail: r.image,
      title: r.anilist?.title?.native ?? r.anilist?.title?.romaji ?? r.anilist?.title?.english ?? r.filename,
      url: r.anilist?.id ? `https://anilist.co/anime/${r.anilist.id}` : undefined,
      source: 'TraceMoe',
      extra: r.episode ? `第 ${r.episode} 集` : undefined,
    }));
  },
};

const animeTrace: SearchEngine = {
  id: 'animetrace',
  available: () => true,
  async search(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('https://api.animetrace.com/v1/search?model=anime&is_multi=0', {
      method: 'POST',
      body: form,
    });
    const data = (await res.json()) as {
      code?: number;
      zh_message?: string;
      data?: Array<{ character?: Array<{ character?: string; work?: string }> }>;
    };
    if (data.code !== 0) throw new Error(data.zh_message ?? 'AnimeTrace 失败');
    return (data.data ?? []).map((r) => ({
      similarity: '',
      thumbnail: '',
      title: r.character?.[0]?.character ?? '',
      url: undefined,
      source: 'AnimeTrace',
      extra: r.character?.[0]?.work,
    }));
  },
};

const baidu: SearchEngine = {
  id: 'baidu',
  available: () => true,
  async search(file) {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36';
    const upForm = new FormData();
    upForm.append('image', file);
    upForm.append('from', 'pc');
    upForm.append('tn', 'pc');
    const up = await fetch(`https://graph.baidu.com/upload?uptime=${Date.now()}`, {
      method: 'POST',
      body: upForm,
      headers: {
        'User-Agent': UA,
        'acs-token': 'a',
        'Referer': 'https://graph.baidu.com/pcpage/index?tpl_from=pc',
      },
    });
    const upData = (await up.json()) as { status?: number; msg?: string; data?: { url?: string } };
    if (upData.status !== 0 || !upData.data?.url) throw new Error(`百度识图失败：${upData.msg ?? '未知错误'}`);
    const html = await (
      await fetch(upData.data.url, { headers: { 'User-Agent': UA } })
    ).text();
    const match = html.match(/window\.cardData\s*=\s*(\[[\s\S]*?\]);/);
    if (!match) return [];
    const cards = JSON.parse(match[1]!) as Array<{
      cardName?: string;
      tplData?: { list?: Array<{ title?: string | string[]; image_src?: string; url?: string; website?: string }> };
    }>;
    for (const card of cards) {
      if (card.cardName !== 'same' || !card.tplData?.list) continue;
      return card.tplData.list.map((item) => ({
        similarity: '',
        thumbnail: item.image_src ?? '',
        title: Array.isArray(item.title) ? item.title.join('') : (item.title ?? ''),
        url: item.url ?? '',
        source: 'Baidu',
        extra: item.website,
      }));
    }
    return [];
  },
};

export const ENGINES: SearchEngine[] = [
  saucenao,
  traceMoe,
  animeTrace,
  baidu,
];
