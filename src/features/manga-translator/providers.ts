import type { Env } from '../../types';
import { md5Bytes, md5Str } from '../../lib/md5';

export interface TranslateInput {
  imageBytes: Uint8Array;
  from?: string;
  to?: string;
}

export interface TranslateOutput {
  provider: string;
  renderedImage?: string;
  regions?: Array<{ text: string; translation: string }>;
  raw?: unknown;
}

export interface Provider {
  id: string;
  available(env: Env): boolean;
  translate(input: TranslateInput, env: Env): Promise<TranslateOutput>;
}

const baiduLang = (l: string): string => {
  const m: Record<string, string> = {
    'zh-CHS': 'zh', 'zh-CN': 'zh', zh: 'zh', auto: 'auto',
    en: 'en', ja: 'jp', jp: 'jp', ko: 'kor', kor: 'kor',
  };
  return m[l] ?? 'zh';
};

const baidu: Provider = {
  id: 'baidu',
  available: (env) => Boolean(env.BAIDU_APP_ID && env.BAIDU_APP_KEY),
  async translate({ imageBytes, from = 'auto', to = 'zh' }, env) {
    const appid = env.BAIDU_APP_ID!;
    const secret = env.BAIDU_APP_KEY!;
    const salt = String(Date.now());
    const cuid = 'APICUID';
    const mac = 'mac';
    const imgMd5 = md5Bytes(imageBytes);
    const sign = md5Str(appid + imgMd5 + salt + cuid + mac + secret);

    const form = new FormData();
    const isPng = imageBytes[0] === 0x89 && imageBytes[1] === 0x50;
    form.append('image', new Blob([imageBytes], { type: isPng ? 'image/png' : 'image/jpeg' }), isPng ? 'image.png' : 'image.jpg');
    form.append('from', baiduLang(from));
    form.append('to', baiduLang(to));
    form.append('appid', appid);
    form.append('salt', salt);
    form.append('cuid', cuid);
    form.append('mac', mac);
    form.append('version', '3');
    form.append('paste', '1');
    form.append('sign', sign);

    const res = await fetch('https://fanyi-api.baidu.com/api/trans/sdk/picture', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json()) as {
      error_code?: string;
      error_msg?: string;
      data?: { pasteImg?: string; content?: Array<{ src?: string; dst?: string }> };
    };
    if (data.error_code && data.error_code !== '0') {
      const quotaCodes = ['54003', '58001', '58002', '58003', '54004', '54005'];
      if (quotaCodes.includes(data.error_code)) {
        throw new Error('百度翻译配额已用尽或被限流，请下月再试或检查账号');
      }
      throw new Error(`baidu ${data.error_code}: ${data.error_msg ?? ''}`);
    }
    const d = data.data ?? {};
    return {
      provider: 'baidu',
      renderedImage: d.pasteImg,
      regions: (d.content ?? []).map((x) => ({ text: x.src ?? '', translation: x.dst ?? '' })),
      raw: data,
    };
  },
};

export const PROVIDERS: Provider[] = [baidu];
