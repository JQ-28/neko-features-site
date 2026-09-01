import type { App, Feature } from '../../types';

export interface ParseResult {
  platform: string;
  platformName: string;
  title?: string;
  author?: string;
  cover?: string;
  desc?: string;
  duration?: number;
  videos?: string[];
  images?: string[];
}

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const extractUrl = (text: string): string | null => {
  const m = text.match(/https?:\/\/[^\s"']+/);
  return m ? m[0] : null;
};

const resolveRedirect = async (url: string, headers: Record<string, string> = {}): Promise<string> => {
  let current = url;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': UA, ...headers } });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).href;
      continue;
    }
    return current;
  }
  return current;
};

// ===== B站风控绕过（buvid 指纹激活，参考 nonebot-plugin-parser-lite / SocialSisterYi 文档） =====
// Cloudflare 数据中心 IP 直接调 B站 API 会 412。必须：spi 拿 buvid3/4 → 组装指纹 payload →
// murmur3 计算 buvid_fp → POST ExClimbWuzhi 激活，之后携带该组 Cookie 才能过风控。
// 数据中心 IP 仍被风控标记时，需用户扫码登录（/api/parse/bili/login/*），登录态凭证存 KV。
const BILI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15';
let biliCookieCache: { cookie: string; ts: number } | null = null;
const BILI_COOKIE_TTL = 6 * 3600_000;
const BILI_SESS_KV_KEY = 'bili:sess';
let kvRef: KVNamespace | null = null;
let biliSessCache: { sess: string; ts: number } | null = null;
const BILI_SESS_TTL = 5 * 60_000;

interface BiliSess {
  sessdata?: string;
  bili_jct?: string;
  dedeuserid?: string;
}

const getBiliSess = async (): Promise<BiliSess> => {
  if (biliSessCache && Date.now() - biliSessCache.ts < BILI_SESS_TTL) return JSON.parse(biliSessCache.sess) as BiliSess;
  if (!kvRef) return {};
  const raw = await kvRef.get(BILI_SESS_KV_KEY);
  const sess = raw ? (JSON.parse(raw) as BiliSess) : {};
  biliSessCache = { sess: JSON.stringify(sess), ts: Date.now() };
  return sess;
};

const parseSetCookies = (res: Response): Record<string, string> => {
  const jar: Record<string, string> = {};
  for (const line of (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return jar;
};

const MASK64 = 0xffffffffffffffffn;
const rotl64 = (x: bigint, r: bigint): bigint => ((x << r) | (x >> (64n - r))) & MASK64;

const fmix64 = (k: bigint): bigint => {
  let t = k & MASK64;
  t ^= t >> 33n;
  t = (t * 0xff51afd7ed558ccdn) & MASK64;
  t ^= t >> 33n;
  t = (t * 0xc4ceb9fe1a85ec53n) & MASK64;
  t ^= t >> 33n;
  return t;
};

const murmur3Hex = (str: string, seed = 31n): string => {
  const C1 = 0x87c37b91114253d5n;
  const C2 = 0x4cf5ad432745937fn;
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 255;
  let h1 = seed & MASK64;
  let h2 = seed & MASK64;
  const blocks = Math.floor(bytes.length / 16);
  for (let i = 0; i < blocks; i++) {
    const off = i * 16;
    let k1 = 0n;
    let k2 = 0n;
    for (let j = 7; j >= 0; j--) k1 = (k1 << 8n) | BigInt(bytes[off + j] ?? 0);
    for (let j = 15; j >= 8; j--) k2 = (k2 << 8n) | BigInt(bytes[off + j] ?? 0);
    k1 = (rotl64((k1 * C1) & MASK64, 31n) * C2) & MASK64;
    h1 ^= k1;
    h1 = rotl64(h1, 27n);
    h1 = (h1 + h2) & MASK64;
    h1 = (h1 * 5n + 0x52dce729n) & MASK64;
    k2 = (rotl64((k2 * C2) & MASK64, 33n) * C1) & MASK64;
    h2 ^= k2;
    h2 = rotl64(h2, 31n);
    h2 = (h2 + h1) & MASK64;
    h2 = (h2 * 5n + 0x38495ab5n) & MASK64;
  }
  const tail = bytes.subarray(blocks * 16);
  let k1 = 0n;
  let k2 = 0n;
  for (let i = 0; i < tail.length; i++) {
    const b = BigInt(tail[i] ?? 0);
    if (i < 8) k1 ^= b << BigInt(8 * i);
    else k2 ^= b << BigInt(8 * (i - 8));
  }
  if (tail.length > 8) h2 ^= (rotl64((k2 * C2) & MASK64, 33n) * C1) & MASK64;
  if (tail.length > 0) h1 ^= (rotl64((k1 * C1) & MASK64, 31n) * C2) & MASK64;
  h1 ^= BigInt(bytes.length);
  h2 ^= BigInt(bytes.length);
  h1 = (h1 + h2) & MASK64;
  h2 = (h2 + h1) & MASK64;
  h1 = fmix64(h1);
  h2 = fmix64(h2);
  h1 = (h1 + h2) & MASK64;
  h2 = (h2 + h1) & MASK64;
  return h1.toString(16).padStart(16, '0') + h2.toString(16).padStart(16, '0');
};

const genUuidInfoc = (): string => {
  const chars = '123456789ABCDEF10';
  const part = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part(8)}-${part(4)}-${part(4)}-${part(4)}-${part(12)}${String(Date.now() % 100000).padStart(5, '0')}infoc`;
};

const EXClimbWuzhiPayload = (uuid: string): Record<string, unknown> => ({
  '3064': 1,
  '5062': Date.now(),
  '03bf': 'https%3A%2F%2Fwww.bilibili.com%2F',
  '39c8': '333.788.fp.risk',
  '34f1': '',
  'd402': '',
  '654a': '',
  '6e7c': '839x959',
  '3c43': {
    '2673': 0,
    '5766': 24,
    '6527': 0,
    '7003': 1,
    '807e': 1,
    'b8ce': BILI_UA,
    '641c': 0,
    '07a4': 'en-US',
    '1c57': 'not available',
    '0bd0': 8,
    '748e': [900, 1440],
    'd61f': [875, 1440],
    'fc9d': -480,
    '6aa9': 'Asia/Shanghai',
    '75b8': 1,
    '3b21': 1,
    '8a1c': 0,
    'd52f': 'not available',
    'adca': 'MacIntel',
    '80c9': [
      ['PDF Viewer', 'Portable Document Format', [['application/pdf', 'pdf'], ['text/pdf', 'pdf']]],
      ['Chrome PDF Viewer', 'Portable Document Format', [['application/pdf', 'pdf'], ['text/pdf', 'pdf']]],
      ['Chromium PDF Viewer', 'Portable Document Format', [['application/pdf', 'pdf'], ['text/pdf', 'pdf']]],
      ['Microsoft Edge PDF Viewer', 'Portable Document Format', [['application/pdf', 'pdf'], ['text/pdf', 'pdf']]],
      ['WebKit built-in PDF', 'Portable Document Format', [['application/pdf', 'pdf'], ['text/pdf', 'pdf']]],
    ],
    '13ab': '0dAAAAAASUVORK5CYII=',
    'bfe9': 'QgAAEIQAACEIAABCCQN4FXANGq7S8KTZayAAAAAElFTkSuQmCC',
    'a3c1': [
      'extensions:ANGLE_instanced_arrays;EXT_blend_minmax;EXT_color_buffer_half_float;EXT_float_blend;EXT_frag_depth;EXT_shader_texture_lod;EXT_texture_compression_bptc;EXT_texture_compression_rgtc;EXT_texture_filter_anisotropic;EXT_sRGB;KHR_parallel_shader_compile;OES_element_index_uint;OES_fbo_render_mipmap;OES_standard_derivatives;OES_texture_float;OES_texture_float_linear;OES_texture_half_float;OES_texture_half_float_linear;OES_vertex_array_object;WEBGL_color_buffer_float;WEBGL_compressed_texture_astc;WEBGL_compressed_texture_etc;WEBGL_compressed_texture_etc1;WEBGL_compressed_texture_pvrtc;WEBKIT_WEBGL_compressed_texture_pvrtc;WEBGL_compressed_texture_s3tc;WEBGL_compressed_texture_s3tc_srgb;WEBGL_debug_renderer_info;WEBGL_debug_shaders;WEBGL_depth_texture;WEBGL_draw_buffers;WEBGL_lose_context;WEBGL_multi_draw',
      'webgl aliased line width range:[1, 1]',
      'webgl aliased point size range:[1, 511]',
      'webgl alpha bits:8',
      'webgl antialiasing:yes',
      'webgl blue bits:8',
      'webgl depth bits:24',
      'webgl green bits:8',
      'webgl max anisotropy:16',
      'webgl max combined texture image units:32',
      'webgl max cube map texture size:16384',
      'webgl max fragment uniform vectors:1024',
      'webgl max render buffer size:16384',
      'webgl max texture image units:16',
      'webgl max texture size:16384',
      'webgl max varying vectors:30',
      'webgl max vertex attribs:16',
      'webgl max vertex texture image units:16',
      'webgl max vertex uniform vectors:1024',
      'webgl max viewport dims:[16384, 16384]',
      'webgl red bits:8',
      'webgl renderer:WebKit WebGL',
      'webgl shading language version:WebGL GLSL ES 1.0 (1.0)',
      'webgl stencil bits:0',
      'webgl vendor:WebKit',
      'webgl version:WebGL 1.0',
      'webgl unmasked vendor:Apple Inc.',
      'webgl unmasked renderer:Apple GPU',
      'webgl vertex shader high float precision:23',
      'webgl vertex shader high float precision rangeMin:127',
      'webgl vertex shader high float precision rangeMax:127',
      'webgl vertex shader medium float precision:23',
      'webgl vertex shader medium float precision rangeMin:127',
      'webgl vertex shader medium float precision rangeMax:127',
      'webgl vertex shader low float precision:23',
      'webgl vertex shader low float precision rangeMin:127',
      'webgl vertex shader low float precision rangeMax:127',
      'webgl fragment shader high float precision:23',
      'webgl fragment shader high float precision rangeMin:127',
      'webgl fragment shader high float precision rangeMax:127',
      'webgl fragment shader medium float precision:23',
      'webgl fragment shader medium float precision rangeMin:127',
      'webgl fragment shader medium float precision rangeMax:127',
      'webgl fragment shader low float precision:23',
      'webgl fragment shader low float precision rangeMin:127',
      'webgl fragment shader low float precision rangeMax:127',
      'webgl vertex shader high int precision:0',
      'webgl vertex shader high int precision rangeMin:31',
      'webgl vertex shader high int precision rangeMax:30',
      'webgl vertex shader medium int precision:0',
      'webgl vertex shader medium int precision rangeMin:31',
      'webgl vertex shader medium int precision rangeMax:30',
      'webgl vertex shader low int precision:0',
      'webgl vertex shader low int precision rangeMin:31',
      'webgl vertex shader low int precision rangeMax:30',
      'webgl fragment shader high int precision:0',
      'webgl fragment shader high int precision rangeMin:31',
      'webgl fragment shader high int precision rangeMax:30',
      'webgl fragment shader medium int precision:0',
      'webgl fragment shader medium int precision rangeMin:31',
      'webgl fragment shader medium int precision rangeMax:30',
      'webgl fragment shader low int precision:0',
      'webgl fragment shader low int precision rangeMin:31',
      'webgl fragment shader low int precision rangeMax:30',
    ],
    '6bc5': 'Apple Inc.~Apple GPU',
    'ed31': 0,
    '72bd': 0,
    '097b': 0,
    '52cd': [0, 0, 0],
    'a658': [
      'Andale Mono', 'Arial', 'Arial Black', 'Arial Hebrew', 'Arial Narrow',
      'Arial Rounded MT Bold', 'Arial Unicode MS', 'Comic Sans MS', 'Courier',
      'Courier New', 'Geneva', 'Georgia', 'Helvetica', 'Helvetica Neue', 'Impact',
      'LUCIDA GRANDE', 'Microsoft Sans Serif', 'Monaco', 'Palatino', 'Tahoma',
      'Times', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Wingdings',
      'Wingdings 2', 'Wingdings 3',
    ],
    'd02f': '124.04345259929687',
  },
  '54ef':
    '{"in_new_ab":true,"ab_version":{"remove_back_version":"REMOVE","login_dialog_version":"V_PLAYER_PLAY_TOAST","open_recommend_blank":"SELF","storage_back_btn":"HIDE","call_pc_app":"FORBID","clean_version_old":"GO_NEW","optimize_fmp_version":"LOADED_METADATA","for_ai_home_version":"V_OTHER","bmg_fallback_version":"DEFAULT","ai_summary_version":"SHOW","weixin_popup_block":"ENABLE","rcmd_tab_version":"DISABLE","in_new_ab":true},"ab_split_num":{"remove_back_version":11,"login_dialog_version":43,"open_recommend_blank":90,"storage_back_btn":87,"call_pc_app":47,"clean_version_old":46,"optimize_fmp_version":28,"for_ai_home_version":38,"bmg_fallback_version":86,"ai_summary_version":466,"weixin_popup_block":45,"rcmd_tab_version":90,"in_new_ab":0},"pageVersion":"new_video","videoGoOldVersion":-1}',
  '8b94': 'https%3A%2F%2Fwww.bilibili.com%2F',
  'df35': uuid,
  '07a4': 'en-US',
  '5f45': null,
  'db46': 0,
});

const getBiliCookie = async (force = false): Promise<string> => {
  if (!force && biliCookieCache && Date.now() - biliCookieCache.ts < BILI_COOKIE_TTL) return biliCookieCache.cookie;
  const jar: Record<string, string> = {};
  try {
    const home = await fetch('https://www.bilibili.com/', {
      headers: { 'User-Agent': BILI_UA },
      redirect: 'manual',
    });
    Object.assign(jar, parseSetCookies(home));
  } catch {
    // 主页失败继续尝试 spi
  }
  const spiHeaders: Record<string, string> = { 'User-Agent': BILI_UA, Referer: 'https://www.bilibili.com/' };
  const jarCookie = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  if (jarCookie) spiHeaders.Cookie = jarCookie;
  let b3 = jar.buvid3;
  let b4 = '';
  try {
    const res = await fetch('https://api.bilibili.com/x/frontend/finger/spi', { headers: spiHeaders });
    const json = (await res.json()) as { data?: { b_3?: string; b_4?: string } };
    b3 = json.data?.b_3 ?? b3;
    b4 = json.data?.b_4 ?? '';
  } catch {
    // spi 失败走随机兜底
  }
  if (!b3) b3 = `XY${crypto.randomUUID().replaceAll('-', '').slice(0, 30)}infoc`;
  if (!b4) b4 = crypto.randomUUID().replaceAll('-', '');
  const uuid = genUuidInfoc();
  const body = JSON.stringify({ payload: JSON.stringify(EXClimbWuzhiPayload(uuid)) });
  const buvidFp = murmur3Hex(body);
  const parts = [`buvid3=${b3}`, `buvid4=${b4}`, `buvid_fp=${buvidFp}`, `_uuid=${uuid}`, `b_nut=${jar.b_nut ?? '100'}`];
  const sess = await getBiliSess();
  if (sess.sessdata) parts.push(`SESSDATA=${sess.sessdata}`);
  if (sess.bili_jct) parts.push(`bili_jct=${sess.bili_jct}`);
  if (sess.dedeuserid) parts.push(`DedeUserID=${sess.dedeuserid}`);
  const cookie = parts.join('; ');
  try {
    await fetch('https://api.bilibili.com/x/internal/gaia-gateway/ExClimbWuzhi', {
      method: 'POST',
      headers: {
        'User-Agent': BILI_UA,
        'Content-Type': 'application/json',
        Origin: 'https://www.bilibili.com',
        Referer: 'https://www.bilibili.com/',
        Cookie: cookie,
      },
      body,
    });
  } catch {
    // 激活失败仍返回 Cookie 尝试
  }
  biliCookieCache = { cookie, ts: Date.now() };
  return cookie;
};

const biliJson = async (res: Response): Promise<unknown> => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`B站接口返回异常（HTTP ${res.status}，疑似风控拦截）`);
  }
};

// B站 GET 请求：412 时强制刷新 Cookie（重新激活）重试一次
const biliGet = async (url: string): Promise<unknown> => {
  const doFetch = (cookie: string) =>
    fetch(url, { headers: { 'User-Agent': BILI_UA, Referer: 'https://www.bilibili.com/', Cookie: cookie } });
  let res = await doFetch(await getBiliCookie());
  if (res.status === 412) res = await doFetch(await getBiliCookie(true));
  return biliJson(res);
};

const parseBilibili = async (url: string): Promise<ParseResult> => {
  const bv = url.match(/BV[0-9A-Za-z]+/)?.[0];
  const avid = url.match(/av(\d+)/i)?.[1];
  if (!bv && !avid) throw new Error('未识别到 BV/av 号');
  const json = (await biliGet(`https://api.bilibili.com/x/web-interface/view?${bv ? `bvid=${bv}` : `aid=${avid}`}`)) as {
    code?: number;
    message?: string;
    data?: {
      title?: string;
      pic?: string;
      duration?: number;
      desc?: string;
      owner?: { name?: string };
      pages?: Array<{ cid?: number; part?: string }>;
      cid?: number;
      aid?: number;
      bvid?: string;
    };
  };
  if (json.code !== 0 || !json.data) throw new Error(json.message ?? 'B站解析失败');
  const d = json.data;
  const page = url.match(/[?&]p=(\d+)/)?.[1];
  const cid = page ? d.pages?.[Number(page) - 1]?.cid : (d.cid ?? d.pages?.[0]?.cid);
  if (!cid) throw new Error('未找到视频 cid');

  // HTML5 模式无需 Wbi 签名和登录即可获取 MP4 直链
  const playJson = (await biliGet(
    `https://api.bilibili.com/x/player/playurl?bvid=${d.bvid ?? bv}&cid=${cid}&qn=64&platform=html5&high_quality=1`
  )) as {
    data?: { durl?: Array<{ url?: string; size?: number }> };
  };
  const videos = (playJson.data?.durl ?? []).map((s) => s.url!).filter(Boolean);

  return {
    platform: 'bilibili',
    platformName: '哔哩哔哩',
    title: d.title,
    author: d.owner?.name,
    cover: d.pic,
    desc: d.desc?.replace(/<[^>]+>/g, '').slice(0, 200),
    duration: d.duration,
    videos,
  };
};

// ===== 抖音（对齐原仓库 nonebot-plugin-parser-lite 实现）=====

let douyinTtwidCache: { value: string; exp: number } | null = null;
const getDouyinTtwid = async (): Promise<string> => {
  if (douyinTtwidCache && douyinTtwidCache.exp > Date.now()) return douyinTtwidCache.value;
  const res = await fetch('https://ttwid.bytedance.com/ttwid/union/register/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': DESKTOP_UA },
    body: JSON.stringify({
      region: 'cn',
      aid: 1768,
      needFid: false,
      service: 'www.douyin.com',
      migrate_info: { ticket: '', source: 'node' },
      cbUrlProtocol: 'https',
      union: true,
    }),
  });
  const cookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const ttwid = cookies.find((c) => c.startsWith('ttwid='))?.match(/^ttwid=([^;]+)/)?.[1];
  if (!ttwid) throw new Error('获取抖音 ttwid 失败');
  douyinTtwidCache = { value: ttwid, exp: Date.now() + 24 * 3600 * 1000 };
  return ttwid;
};

interface DouyinAweme {
  desc?: string;
  author?: { nickname?: string };
  music?: { play_url?: { uri?: string }; extra?: string; is_original_sound?: boolean };
  video?: {
    duration?: number;
    cover?: { url_list?: string[] };
    cover_original_scale?: { url_list?: string[] };
    play_addr?: { uri?: string; url_list?: string[] };
  };
  images?: Array<{
    url_list?: string[];
    clip_type?: number | null;
    video?: { play_addr?: { uri?: string; url_list?: string[] }; cover?: { url_list?: string[] } };
  }>;
}

// 无水印直链：取 play_addr.uri 作 video_id，file_id 从 url_list 末位 query 解析（原仓库 Addr.url 逻辑）
const douyinPlayUrl = (uri: string, urlList?: string[]): string => {
  const fileId = urlList?.at(-1)?.match(/[?&]file_id=([^&]+)/)?.[1];
  return `https://aweme.snssdk.com/aweme/v1/play/?video_id=${uri}${fileId ? `&file_id=${fileId}` : ''}`;
};

// 主路径：detail API（原仓库方式，ttwid 即可，无签名）
const fetchDouyinDetail = async (awemeId: string): Promise<DouyinAweme> => {
  const ttwid = await getDouyinTtwid();
  const res = await fetch(
    `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}&aid=6383&device_platform=webapp&channel=channel_pc_web&request_source=0`,
    {
      headers: {
        'User-Agent': DESKTOP_UA,
        Referer: 'https://www.douyin.com/',
        Cookie: `ttwid=${ttwid}`,
      },
    }
  );
  const json = (await res.json()) as { aweme_detail?: DouyinAweme };
  if (!json.aweme_detail) throw new Error('detail API 无数据');
  return json.aweme_detail;
};

// 降级路径：分享页 SSR（需带 iesdouyin 的 ttwid cookie）
const fetchDouyinShare = async (awemeId: string): Promise<DouyinAweme> => {
  const cookieRes = await fetch('https://www.iesdouyin.com/share/note/1/', { headers: { 'User-Agent': UA } });
  const cookies = (cookieRes.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const ttwid = cookies.find((c) => c.startsWith('ttwid='))?.split(';')[0];
  const pageRes = await fetch(`https://www.iesdouyin.com/share/video/${awemeId}/`, {
    headers: { 'User-Agent': UA, ...(ttwid ? { Cookie: ttwid } : {}) },
  });
  const html = await pageRes.text();
  const match = html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (!match) throw new Error('抖音解析失败（页面数据获取失败）');
  const routerData = JSON.parse(match[1]!) as {
    loaderData?: Record<string, {
      videoInfoRes?: { item_list?: DouyinAweme[]; filter_list?: Array<{ filter_reason?: string }> };
    }>;
  };
  const pageData = Object.values(routerData.loaderData ?? {}).find((v) => v?.videoInfoRes);
  const detail = pageData?.videoInfoRes?.item_list?.[0];
  if (!detail) {
    const reason = pageData?.videoInfoRes?.filter_list?.[0]?.filter_reason;
    throw new Error(reason === 'status_self_see' ? '作品为私密内容' : '作品不存在或已删除');
  }
  return detail;
};

const parseDouyin = async (url: string): Promise<ParseResult> => {
  const awemeId = url.match(/douyin\.com\/(?:video|note)\/(\d+)/)?.[1]
    ?? url.match(/douyin\.com\/[a-z]+\/(\d+)/)?.[1]
    ?? url.match(/iesdouyin\.com\/share\/[a-z]+\/(\d+)/)?.[1];
  if (!awemeId) throw new Error('未识别到抖音作品 ID');

  let detail: DouyinAweme;
  try {
    detail = await fetchDouyinDetail(awemeId);
  } catch {
    detail = await fetchDouyinShare(awemeId);
  }

  const videos: string[] = [];
  const images: string[] = [];
  if (detail.images?.length) {
    // 图集：普通图取 url_list 末位；Live Photo 的视频走无水印直链
    for (const img of detail.images) {
      if (img.clip_type === 2 || img.clip_type == null) {
        images.push(img.url_list?.at(-1) ?? '');
      } else if (img.video?.play_addr?.uri) {
        videos.push(douyinPlayUrl(img.video.play_addr.uri, img.video.play_addr.url_list));
      }
    }
    // BGM
    const musicUri = detail.music?.play_url?.uri
      ?? (() => { try { return JSON.parse(detail.music?.extra ?? '{}')?.original_song_url; } catch { return undefined; } })();
    if (musicUri) videos.push(musicUri);
  } else if (detail.video?.play_addr?.uri) {
    videos.push(douyinPlayUrl(detail.video.play_addr.uri, detail.video.play_addr.url_list));
  }

  return {
    platform: 'douyin',
    platformName: '抖音',
    title: detail.desc?.split('\n')[0]?.slice(0, 100),
    author: detail.author?.nickname,
    cover: detail.video?.cover_original_scale?.url_list?.at(-1) ?? detail.video?.cover?.url_list?.at(-1),
    desc: detail.desc?.slice(0, 300),
    duration: detail.video?.duration ? Math.floor(detail.video.duration / 1000) : undefined,
    videos: videos.filter(Boolean),
    images: images.filter(Boolean),
  };
};

const parseRednote = async (url: string): Promise<ParseResult> => {
  const noteId = url.match(/(?:explore|search_result|discovery\/item)\/([0-9a-zA-Z]+)/)?.[1];
  if (!noteId) throw new Error('未识别到小红书笔记 ID');
  const xsecToken = url.match(/xsec_token=([^&]+)/)?.[1] ?? '';

  const res = await fetch(
    `https://www.xiaohongshu.com/discovery/item/${noteId}?xsec_token=${xsecToken}&xsec_source=pc_share`,
    {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.xiaohongshu.com/',
        'Origin': 'https://www.xiaohongshu.com',
        'X-Requested-With': 'XMLHttpRequest',
      },
    }
  );
  const html = await res.text();
  const stateMatch = html.match(/window\.__INITIAL_STATE__=([\s\S]*?)<\/script>/);
  if (!stateMatch) throw new Error('小红书链接失效或内容已删除');
  const state = JSON.parse(stateMatch[1]!.replace(/undefined/g, 'null')) as {
    noteData?: {
      data?: {
        noteData?: {
          title?: string;
          desc?: string;
          user?: { nickName?: string; avatar?: string };
          video?: { consumer?: { originVideoKey?: string }; capa?: { duration?: number } };
          cover?: { fileId?: string };
          imageList?: Array<{ fileId?: string; livePhoto?: boolean; stream?: { h264?: Array<{ masterUrl?: string }>; h265?: Array<{ masterUrl?: string }>; av1?: Array<{ masterUrl?: string }> } }>;
        };
      };
    };
  };
  const note = state.noteData?.data?.noteData;
  if (!note) throw new Error('小红书解析失败');

  const videos: string[] = [];
  if (note.video?.consumer?.originVideoKey) {
    videos.push(`https://sns-video-bd.xhscdn.com/${note.video.consumer.originVideoKey}`);
  }
  const images = (note.imageList ?? [])
    .filter((img) => !img.livePhoto)
    .map((img) => (img.fileId ? `https://ci.xiaohongshu.com/${img.fileId}?imageView2/2/w/1080/format/jpg` : ''))
    .filter(Boolean);
  const livePhotos = (note.imageList ?? [])
    .filter((img) => img.livePhoto)
    .map((img) => img.stream?.h264?.[0]?.masterUrl ?? img.stream?.h265?.[0]?.masterUrl ?? img.stream?.av1?.[0]?.masterUrl ?? '')
    .filter(Boolean);

  return {
    platform: 'rednote',
    platformName: '小红书',
    title: note.title,
    author: note.user?.nickName,
    cover: note.cover?.fileId ? `https://ci.xiaohongshu.com/${note.cover.fileId}?imageView2/2/w/1080/format/jpg` : note.user?.avatar,
    desc: note.desc?.slice(0, 300),
    duration: note.video?.capa?.duration,
    videos: [...videos, ...livePhotos],
    images,
  };
};

interface KsPhoto {
  photo?: {
    caption?: string;
    userName?: string;
    headUrl?: string;
    duration?: number;
    mainMvUrls?: Array<{ url?: string }>;
    coverUrls?: Array<{ url?: string }>;
    atlas?: { cdnList?: Array<{ cdn?: string }>; list?: string[] };
  };
}

const parseKuaishou = async (url: string): Promise<ParseResult> => {
  let real = url;
  if (/v\.kuaishou\.com|chenzhongtech\.com\/short|gifshow\.com\/short/.test(url)) {
    real = (await resolveRedirect(url)).replace('/fw/long-video/', '/fw/photo/');
  }
  const res = await fetch(real, { headers: { 'User-Agent': UA } });
  const html = await res.text();
  const stateMatch = html.match(/window\.INIT_STATE\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (!stateMatch) throw new Error('快手解析失败（未找到页面数据）');
  const state = JSON.parse(stateMatch[1]!.replace(/undefined/g, 'null')) as Record<string, KsPhoto | undefined>;

  let photo: KsPhoto['photo'] | undefined;
  for (const value of Object.values(state)) {
    if (value?.photo?.mainMvUrls?.length || value?.photo?.atlas) {
      photo = value.photo;
      break;
    }
  }
  if (!photo) throw new Error('快手解析失败（未找到作品数据）');

  const videos = (photo.mainMvUrls ?? []).map((v) => v.url!).filter(Boolean);
  const atlas = photo.atlas;
  const cdn = atlas?.cdnList?.[0]?.cdn;
  const images = cdn && atlas?.list
    ? atlas.list.map((p) => `https://${cdn}/${p}`)
    : [];

  return {
    platform: 'kuaishou',
    platformName: '快手',
    title: photo.caption?.split('\n')[0]?.slice(0, 100),
    author: photo.userName,
    cover: photo.coverUrls?.[0]?.url,
    desc: photo.caption?.slice(0, 300),
    duration: photo.duration ? Math.floor(photo.duration / 1000) : undefined,
    videos,
    images,
  };
};

const parseWeibo = async (url: string): Promise<ParseResult> => {
  // 访客 Cookie 流程
  const gvRes = await fetch('https://visitor.passport.weibo.cn/visitor/genvisitor2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: 'cb=visitor_gray_callback&tid=&new_tid=null',
  });
  const gvJson = (await gvRes.json()) as { data?: { sub?: string; subp?: string } };
  const sub = gvJson.data?.sub;
  const subp = gvJson.data?.subp;
  if (!sub || !subp) throw new Error('微博访客凭证获取失败');
  const cookie = `SUB=${sub}; SUBP=${subp}`;

  const homeRes = await fetch('https://www.weibo.com', {
    headers: { 'User-Agent': UA, Cookie: cookie, Referer: 'https://visitor.passport.weibo.cn/' },
  });
  const xsrf = (homeRes.headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie?.()
    ?.find((c) => c.startsWith('XSRF-TOKEN='))
    ?.match(/^XSRF-TOKEN=([^;]+)/)?.[1];
  const wbHeaders: Record<string, string> = {
    'User-Agent': UA,
    Cookie: cookie,
    Referer: 'https://weibo.com/',
  };
  if (xsrf) wbHeaders['X-Xsrf-Token'] = xsrf;

  // mid 数字转 base62
  const wid = url.match(/weibo\.(?:cn|com)\/(?:status|detail)\/([0-9a-zA-Z]+)/)?.[1]
    ?? url.match(/weibo\.(?:cn|com)\/\d+\/([0-9a-zA-Z]+)/)?.[1];
  if (!wid) throw new Error('未识别到微博 ID');
  const res = await fetch(`https://www.weibo.com/ajax/statuses/show?id=${wid}`, { headers: wbHeaders });
  const json = (await res.json()) as {
    text_raw?: string;
    user?: { screen_name?: string };
    isLongText?: boolean;
    pic_infos?: Record<string, { original?: { url?: string }; video?: string }>;
    page_info?: {
      page_title?: string;
      page_pic?: { url?: string };
      media_info?: { stream_url_hd?: string; stream_url?: string; duration?: number };
    };
  };
  if (!json.user && !json.text_raw) throw new Error('微博解析失败');

  let desc = json.text_raw ?? '';
  if (json.isLongText) {
    try {
      const ext = await (await fetch(`https://m.weibo.cn/statuses/extend?id=${wid}`, { headers: { 'User-Agent': UA } })).json();
      desc = ((ext as { data?: { longTextContent?: string } }).data?.longTextContent ?? desc).slice(0, 300);
    } catch { /* 长文获取失败用短文 */ }
  }

  const images = Object.values(json.pic_infos ?? {})
    .map((p) => p.original?.url ?? '')
    .filter(Boolean);
  const stream = json.page_info?.media_info?.stream_url_hd ?? json.page_info?.media_info?.stream_url;

  return {
    platform: 'weibo',
    platformName: '微博',
    title: json.page_info?.page_title ?? json.text_raw?.split('\n')[0]?.slice(0, 100),
    author: json.user?.screen_name,
    cover: json.page_info?.page_pic?.url,
    desc: desc.slice(0, 300),
    duration: json.page_info?.media_info?.duration,
    videos: stream ? [stream] : [],
    images,
  };
};

const parseAcFun = async (url: string): Promise<ParseResult> => {
  const acid = url.match(/ac=(\d+)/)?.[1] ?? url.match(/\/ac(\d+)/)?.[1];
  if (!acid) throw new Error('未识别到 AcFun 视频 ID');
  const res = await fetch(
    `https://www.acfun.cn/v/ac${acid}?quickViewId=videoInfo_new&ajaxpipe=1`,
    { headers: { 'User-Agent': UA, Referer: 'https://www.acfun.cn/' } }
  );
  const html = await res.text();
  const match = html.match(/window\.videoInfo\s*=([\s\S]*?)<\/script>/);
  if (!match) throw new Error('AcFun 解析失败');
  const raw = match[1]!
    .replace(/\\{1,4}"/g, '"')
    .replace(/"\{/g, '{')
    .replace(/\}"/g, '}')
    .replace(/\\n/g, '\n');
  const jsonStart = raw.indexOf('{');
  const info = JSON.parse(raw.slice(jsonStart, raw.lastIndexOf('}') + 1)) as {
    title?: string;
    coverUrl?: string;
    description?: string;
    user?: { name?: string };
    currentVideoInfo?: {
      durationMillis?: number;
      ksPlayJson?: { adaptationSet?: Array<{ representation?: Array<{ qualityType?: number; url?: string }> }> };
    };
  };

  const reps = info.currentVideoInfo?.ksPlayJson?.adaptationSet?.[0]?.representation ?? [];
  const best = [...reps].sort((a, b) => (b.qualityType ?? 0) - (a.qualityType ?? 0))[0];

  return {
    platform: 'acfun',
    platformName: 'AcFun',
    title: info.title,
    author: info.user?.name,
    cover: info.coverUrl,
    desc: info.description?.slice(0, 300),
    duration: info.currentVideoInfo?.durationMillis ? Math.floor(info.currentVideoInfo.durationMillis / 1000) : undefined,
    videos: best?.url ? [best.url] : [],
  };
};

const parseNetease = async (url: string): Promise<ParseResult> => {
  let real = url;
  if (/163cn\.tv/.test(url)) real = await resolveRedirect(url);
  const songId = real.match(/[?&]id=(\d+)/)?.[1] ?? real.match(/song\/(\d+)/)?.[1];
  if (!songId) throw new Error('未识别到网易云歌曲 ID');

  const api = 'https://nextmusic.toubiec.cn/api';
  const headers = { 'Content-Type': 'application/json', Referer: 'https://wyapi.toubiec.cn/' };
  const body = (extra: Record<string, unknown>) => JSON.stringify({
    id: songId,
    timestamp: Date.now(),
    ip: `1.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    ...extra,
  });

  const infoRes = await fetch(`${api}/getSongInfo`, { method: 'POST', headers, body: body({}) });
  const info = (await infoRes.json()) as {
    code?: number;
    data?: { name?: string; singer?: string; duration?: string; picimg?: string };
  };
  if (info.code !== 200 || !info.data) throw new Error('网易云解析失败');
  const song = info.data;

  let audio = '';
  for (const level of ['lossless', 'standard']) {
    try {
      const urlRes = await fetch(`${api}/getSongUrl`, { method: 'POST', headers, body: body({ level }) });
      const urlJson = (await urlRes.json()) as { code?: number; data?: { url?: string } };
      if (urlJson.code === 200 && urlJson.data?.url) {
        audio = urlJson.data.url;
        break;
      }
    } catch { /* 尝试下一档位 */ }
  }

  const parts = (song.duration ?? '').split(':');
  const duration = parts.length === 2 ? Number(parts[0]) * 60 + Number(parts[1]) : undefined;

  return {
    platform: 'netease',
    platformName: '网易云音乐',
    title: song.name,
    author: song.singer,
    cover: song.picimg,
    duration,
    videos: audio ? [audio] : [],
  };
};

interface XSyndicationTweet {
  __typename?: string;
  text?: string;
  user?: { name?: string; screen_name?: string };
  photos?: Array<{ url?: string }>;
  video?: {
    poster?: string;
    durationMs?: number;
    variants?: Array<{ type?: string; src?: string; bitrate?: number }>;
  };
}

const xToken = (id: string): string =>
  (Number(id) / 1e15 * Math.PI).toString(36).replace(/(0+|\.)/g, '');

const parseX = async (url: string): Promise<ParseResult> => {
  const tweetId = url.match(/(?:twitter|x)\.com\/[0-9a-zA-Z_]+\/status\/(\d+)/)?.[1];
  if (!tweetId) throw new Error('未识别到 X 推文 ID');

  const res = await fetch(
    `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=${encodeURIComponent(xToken(tweetId))}`,
    { headers: { 'User-Agent': UA } }
  );
  if (res.status === 404) throw new Error('推文不存在或已删除');
  const raw = await res.text();
  if (!raw) throw new Error('推文不存在或已删除');
  const tweet = JSON.parse(raw) as XSyndicationTweet;
  if (tweet.__typename === 'TweetTombstone') throw new Error('推文已删除或受限');

  const videos: string[] = [];
  let cover = tweet.video?.poster;
  let duration = tweet.video?.durationMs ? Math.round(tweet.video.durationMs / 1000) : undefined;

  if (tweet.video?.variants?.length) {
    const best = tweet.video.variants
      .filter((v) => v.type === 'video/mp4' && v.src)
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
    if (best?.src) videos.push(best.src);
  }

  return {
    platform: 'x',
    platformName: 'X (Twitter)',
    title: tweet.text?.split('\n')[0]?.slice(0, 100),
    author: tweet.user?.screen_name ? `${tweet.user.name} (@${tweet.user.screen_name})` : undefined,
    cover,
    desc: tweet.text?.slice(0, 300),
    duration,
    videos,
    images: (tweet.photos ?? []).map((p) => p.url ?? '').filter(Boolean),
  };
};

const parseLofter = async (url: string): Promise<ParseResult> => {
  let real = url;
  if (/s\.lofter\.com/.test(url)) real = await resolveRedirect(url);
  const m = real.match(/post\/([0-9a-zA-Z]+)_([0-9a-zA-Z]+)/);
  if (!m) throw new Error('未识别到 LOFTER 帖子 ID');
  const blogId = parseInt(m[1]!, 16);
  const postId = parseInt(m[2]!, 16);
  if (!blogId || !postId) throw new Error('LOFTER ID 解析失败');

  const form = new URLSearchParams({ postid: String(postId), targetblogid: String(blogId) });
  const res = await fetch('https://api.lofter.com/oldapi/post/detail.api?product=lofter-android-8.1.20', {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const json = (await res.json()) as {
    response?: {
      posts?: Array<{
        post?: {
          title?: string;
          content?: string;
          photoLinks?: string;
          blogInfo?: { blogNickName?: string; bigAvaImg?: string };
        };
      }>;
    };
  };
  const post = json.response?.posts?.[0]?.post;
  if (!post) throw new Error('LOFTER 解析失败');

  let images: string[] = [];
  if (post.photoLinks) {
    try {
      const links = JSON.parse(post.photoLinks) as Array<{ orign?: string }>;
      images = links.map((l) => l.orign ?? '').filter(Boolean);
    } catch { /* photoLinks 解析失败忽略 */ }
  }

  return {
    platform: 'lofter',
    platformName: 'LOFTER',
    title: post.title || post.content?.replace(/<[^>]+>/g, '').slice(0, 100),
    author: post.blogInfo?.blogNickName,
    cover: images[0] ?? post.blogInfo?.bigAvaImg,
    desc: post.content?.replace(/<[^>]+>/g, '').slice(0, 300),
    images,
  };
};

const parseCoolapk = async (url: string): Promise<ParseResult> => {
  const feedId = url.match(/feed\/(\d+)/)?.[1];
  if (!feedId) throw new Error('未识别到酷安动态 ID');
  const res = await fetch(`https://www.coolapk1s.com/feed/${feedId}`, { headers: { 'User-Agent': UA } });
  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('酷安解析失败');
  const json = JSON.parse(match[1]!) as {
    props?: {
      pageProps?: {
        feed?: {
          message?: string;
          username?: string;
          userAvatar?: string;
          picArr?: string[];
        };
      };
    };
  };
  const feed = json.props?.pageProps?.feed;
  if (!feed) throw new Error('酷安解析失败（未找到动态数据）');

  return {
    platform: 'coolapk',
    platformName: '酷安',
    title: feed.message?.replace(/<[^>]+>/g, '').split('\n')[0]?.slice(0, 100),
    author: feed.username,
    cover: feed.picArr?.[0] ?? feed.userAvatar,
    desc: feed.message?.replace(/<[^>]+>/g, '').slice(0, 300),
    images: feed.picArr ?? [],
  };
};

const parseMiyoushe = async (url: string): Promise<ParseResult> => {
  const postId = url.match(/article\/(\d+)/)?.[1];
  if (!postId) throw new Error('未识别到米游社帖子 ID');
  const res = await fetch(`https://bbs-api.miyoushe.com/post/wapi/getPostFull?post_id=${postId}`, {
    headers: { 'User-Agent': UA, Referer: 'https://www.miyoushe.com/' },
  });
  const json = (await res.json()) as {
    data?: {
      post?: {
        post?: {
          subject?: string;
          structured_content?: string;
          images?: string[];
          view_type?: number;
        };
        user?: { nickname?: string; avatar_url?: string };
      };
    };
  };
  const post = json.data?.post?.post;
  if (!post) throw new Error('米游社解析失败');

  const texts: string[] = [];
  const images: string[] = [];
  let videos: string[] = [];
  let duration: number | undefined;
  if (post.structured_content) {
    try {
      const ops = JSON.parse(post.structured_content) as Array<{
        insert?: string | { image?: string; vod?: { resolutions?: Array<{ url?: string; cover?: string; duration?: number }> } };
      }>;
      for (const op of ops) {
        if (typeof op.insert === 'string') texts.push(op.insert);
        else if (op.insert?.image) images.push(op.insert.image);
        else if (op.insert?.vod) {
          const v = op.insert.vod.resolutions?.[0];
          if (v?.url) videos.push(v.url);
          if (v?.duration) duration = Math.round(v.duration);
        }
      }
    } catch { /* structured_content 解析失败忽略 */ }
  }
  if (post.view_type === 2) images.push(...(post.images ?? []));

  return {
    platform: 'miyoushe',
    platformName: '米游社',
    title: post.subject || texts.join(' ').slice(0, 100),
    author: json.data?.post?.user?.nickname,
    cover: images[0] ?? json.data?.post?.user?.avatar_url,
    desc: texts.join('\n').slice(0, 300),
    duration,
    videos,
    images,
  };
};

const parseQishui = async (url: string): Promise<ParseResult> => {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const html = await res.text();
  const match = html.match(/_ROUTER_DATA\s*=\s*(\{[\s\S]*?\});/);
  if (!match) throw new Error('汽水音乐解析失败');
  const json = JSON.parse(match[1]!) as {
    loaderData?: {
      track_page?: {
        trackName?: string;
        artistName?: string;
        coverURL?: string;
        duration?: number;
        audioWithLyricsOption?: { url?: string };
      };
    };
  };
  const track = json.loaderData?.track_page;
  if (!track) throw new Error('汽水音乐解析失败（未找到歌曲数据）');

  return {
    platform: 'qishui',
    platformName: '汽水音乐',
    title: track.trackName,
    author: track.artistName,
    cover: track.coverURL,
    duration: track.duration ? Math.round(track.duration) : undefined,
    videos: track.audioWithLyricsOption?.url ? [track.audioWithLyricsOption.url] : [],
  };
};

const parseDouban = async (url: string): Promise<ParseResult> => {
  const topicId = url.match(/group\/topic\/(\d+)/)?.[1];
  if (!topicId) throw new Error('未识别到豆瓣帖子 ID');
  const res = await fetch(`https://m.douban.com/rexxar/api/v2/group/topic/${topicId}`, {
    headers: { 'User-Agent': UA, Referer: 'https://m.douban.com/' },
  });
  const json = (await res.json()) as {
    title?: string;
    content?: string;
    author?: { name?: string; avatar?: string };
    photos?: Array<{ image?: { large?: { url?: string } } }>;
  };
  if (!json.title && !json.content) throw new Error('豆瓣解析失败');

  return {
    platform: 'douban',
    platformName: '豆瓣',
    title: json.title,
    author: json.author?.name,
    cover: json.photos?.[0]?.image?.large?.url ?? json.author?.avatar,
    desc: json.content?.replace(/<[^>]+>/g, '').slice(0, 300),
    images: (json.photos ?? []).map((p) => p.image?.large?.url ?? '').filter(Boolean),
  };
};

const parseDuitang = async (url: string): Promise<ParseResult> => {
  const blogId = url.match(/blog\?id=(\d+)/)?.[1];
  const atlasId = url.match(/atlas\?id=(\d+)/)?.[1];
  if (!blogId && !atlasId) throw new Error('未识别到堆糖内容 ID');
  const api = blogId
    ? `https://www.duitang.com/napi/blog/with_instance_tag/detail/?blog_id=${blogId}`
    : `https://www.duitang.com/napi/vienna/atlas/detail/?atlas_id=${atlasId}`;
  const res = await fetch(api, { headers: { 'User-Agent': UA } });
  const json = (await res.json()) as {
    status?: number;
    data?: {
      photo?: { path?: string };
      msg?: string;
      sender?: { username?: string; avatar?: string };
      blogs?: Array<{ photo?: { path?: string }; msg?: string }>;
    };
  };
  if (json.status !== 1 || !json.data) throw new Error('堆糖解析失败');
  const d = json.data;
  return {
    platform: 'duitang',
    platformName: '堆糖',
    title: d.msg?.slice(0, 100),
    author: d.sender?.username,
    cover: d.photo?.path ?? d.blogs?.[0]?.photo?.path,
    desc: d.msg?.slice(0, 300),
    images: d.photo?.path ? [d.photo.path] : (d.blogs ?? []).map((b) => b.photo?.path ?? '').filter(Boolean),
  };
};

const parseBuff = async (url: string): Promise<ParseResult> => {
  const articleId = url.match(/article_id=(\d+)/)?.[1];
  const previewId = url.match(/preview_id=(\d+)/)?.[1];
  const postId = url.match(/social_topic_post_id=(\d+)/)?.[1];
  if (!articleId && !previewId && !postId) throw new Error('未识别到网易BUFF内容 ID');
  const api = articleId
    ? `https://buff.163.com/api/news/share/detail?article_id=${articleId}`
    : postId
      ? `https://buff.163.com/api/topic/posts/detail?social_topic_post_id=${postId}`
      : `https://buff.163.com/api/market/preview/share_detail?preview_id=${previewId}&game=csgo`;
  const res = await fetch(api, { headers: { 'User-Agent': UA } });
  const json = (await res.json()) as {
    code?: string;
    data?: {
      title?: string;
      content?: string;
      author?: string;
      icon_url?: string;
      video?: Array<{ video_url?: string; icon_url?: string }>;
      items?: Array<{ pictures?: Array<{ image_url?: string }> }>;
      preview?: { icon_url?: string };
    };
  };
  if (json.code !== 'OK' || !json.data) throw new Error('网易BUFF解析失败');
  const d = json.data;
  const contentImgs = [...(d.content ?? '').matchAll(/<img[^>]*?(?:data-original|src)="([^"]+)"/g)].map((m) => m[1]!);
  return {
    platform: 'buff',
    platformName: '网易BUFF',
    title: d.title,
    author: d.author,
    cover: d.video?.[0]?.icon_url ?? d.icon_url ?? d.items?.[0]?.pictures?.[0]?.image_url ?? d.preview?.icon_url,
    desc: d.content?.replace(/<[^>]+>/g, '').slice(0, 300),
    videos: (d.video ?? []).map((v) => v.video_url ?? '').filter(Boolean),
    images: d.items?.[0]?.pictures
      ? d.items[0]!.pictures!.map((p) => p.image_url ?? '').filter(Boolean)
      : contentImgs,
  };
};

const parse5eplay = async (url: string): Promise<ParseResult> => {
  const topicId = url.match(/forum\/(?:share\/)?(\d+)/)?.[1];
  if (!topicId) throw new Error('未识别到 5EPlay 帖子 ID');
  const res = await fetch(`https://app.5eplay.com/api/csgo/forum/topic/${topicId}`, { headers: { 'User-Agent': UA } });
  const json = (await res.json()) as {
    success?: boolean;
    data?: {
      intro_text?: string;
      title?: string;
      content?: { images?: string[]; video_data?: { video_url?: string; video_cover?: string } };
    };
  };
  if (!json.success || !json.data) throw new Error('5EPlay 解析失败');
  const d = json.data;
  return {
    platform: '5eplay',
    platformName: '5EPlay',
    title: d.title ?? d.intro_text?.split('<img')[0]?.slice(0, 100),
    cover: d.content?.video_data?.video_cover ?? d.content?.images?.[0],
    desc: d.intro_text?.replace(/<[^>]+>/g, '').slice(0, 300),
    videos: d.content?.video_data?.video_url ? [d.content.video_data.video_url] : [],
    images: d.content?.images ?? [],
  };
};

const parseDoubao = async (url: string): Promise<ParseResult> => {
  const shareId = url.match(/share_id=([0-9a-zA-Z]+)/)?.[1];
  const videoId = url.match(/video_id=([0-9a-zA-Z]+)/)?.[1];
  if (!shareId || !videoId) throw new Error('未识别到豆包分享参数');
  const res = await fetch('https://www.doubao.com/creativity/share/get_video_share_info', {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ share_id: shareId, vid: videoId }),
  });
  const json = (await res.json()) as {
    code?: number;
    data?: {
      prompt?: string;
      user_info?: { nickname?: string };
      play_info?: { main?: string; poster_url?: string; duration?: number };
    };
  };
  if (json.code !== 0 || !json.data) throw new Error('豆包解析失败');
  const d = json.data;
  return {
    platform: 'doubao',
    platformName: '豆包',
    title: d.prompt?.slice(0, 100),
    author: d.user_info?.nickname,
    cover: d.play_info?.poster_url,
    desc: d.prompt?.slice(0, 300),
    videos: d.play_info?.main ? [d.play_info.main] : [],
  };
};

const parseWmpvp = async (url: string): Promise<ParseResult> => {
  const postId = url.match(/community-(?:pc)?[Dd]etail\.html\?id=(\d+)/)?.[1];
  const newsId = url.match(/news\.html\?id=(\d+)/)?.[1];
  if (!postId && !newsId) throw new Error('未识别到完美世界帖子 ID');
  const api = postId
    ? `https://appengine.wmpvp.com/steamcn/community/post/getPostById?postId=${postId}`
    : `https://appactivity.wmpvp.com/steamcn/app/news/getAppNewsById?newsId=${newsId}`;
  const res = await fetch(api, { headers: { 'User-Agent': UA, Referer: 'https://news.wmpvp.com/' } });
  const json = (await res.json()) as {
    result?: {
      post?: { images?: Array<{ url?: string }>; videoInfo?: { playInfoList?: Array<{ playURL?: string }>; videoBase?: { coverURL?: string; title?: string } } };
      content?: string;
      title?: string;
    };
  };
  if (!json.result) throw new Error('完美世界解析失败');
  const post = json.result.post;
  const contentImgs = [...(json.result.content ?? '').matchAll(/<img[^>]*?src="([^"]+)"/g)].map((m) => m[1]!);
  return {
    platform: 'wmpvp',
    platformName: '完美世界竞技',
    title: post?.videoInfo?.videoBase?.title ?? json.result.title,
    cover: post?.videoInfo?.videoBase?.coverURL ?? post?.images?.[0]?.url,
    desc: json.result.content?.replace(/<[^>]+>/g, '').slice(0, 300),
    videos: post?.videoInfo?.playInfoList?.[0]?.playURL ? [post.videoInfo.playInfoList[0].playURL] : [],
    images: post?.images?.length ? post.images.map((i) => i.url ?? '').filter(Boolean) : contentImgs,
  };
};

const parseDiscourse = async (url: string, platform: string, platformName: string, base: string): Promise<ParseResult> => {
  const topicId = url.match(/topic\/(\d+)/)?.[1];
  if (!topicId) throw new Error(`未识别到${platformName}帖子 ID`);
  const res = await fetch(`${base}/t/topic/${topicId}.json`, { headers: { 'User-Agent': UA } });
  if (res.status !== 200) throw new Error(`${platformName}解析失败（可能被防护拦截）`);
  const json = (await res.json()) as {
    title?: string;
    post_stream?: { posts?: Array<{ cooked?: string; username?: string; avatar_template?: string }> };
  };
  const first = json.post_stream?.posts?.[0];
  if (!first) throw new Error(`${platformName}解析失败`);
  const images = [...(first.cooked ?? '').matchAll(/<img[^>]*?src="([^"]+)"/g)]
    .map((m) => new URL(m[1]!, base).href)
    .filter((u) => !u.includes('avatar'));
  return {
    platform,
    platformName,
    title: json.title,
    author: first.username,
    cover: images[0],
    desc: first.cooked?.replace(/<[^>]+>/g, '').slice(0, 300),
    images,
  };
};

const parseKugou = async (url: string): Promise<ParseResult> => {
  let real = url;
  if (/t1\.kugou\.com\/[A-Za-z0-9]+$/.test(url)) real = await resolveRedirect(url);
  const res = await fetch(real, { headers: { 'User-Agent': UA } });
  const html = await res.text();
  const match = html.match(/var dataFromSmarty\s*=\s*(\[.*?\]),/);
  if (!match) throw new Error('酷狗解析失败（未找到歌曲数据）');
  const shareData = JSON.parse(match[1]!) as Array<{ hash?: string; song_name?: string; author_name?: string }>;
  const song = shareData[0];
  if (!song?.hash) throw new Error('酷狗解析失败（未找到歌曲 hash）');

  const infoRes = await fetch(`https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${song.hash}`, {
    headers: { 'User-Agent': UA },
  });
  const info = (await infoRes.json()) as {
    errcode?: number;
    url?: string;
    songName?: string;
    singerName?: string;
    album_img?: string;
    timeLength?: number;
  };
  if (info.errcode !== 0) throw new Error('酷狗解析失败（获取播放信息失败）');

  return {
    platform: 'kugou',
    platformName: '酷狗音乐',
    title: song.song_name ?? info.songName,
    author: song.author_name ?? info.singerName,
    cover: info.album_img?.replace('{size}', '480'),
    duration: info.timeLength,
    videos: info.url ? [info.url] : [],
  };
};

const dispatch = async (rawUrl: string): Promise<ParseResult> => {
  let url = rawUrl;
  if (/v\.douyin\.com|iesdouyin\.com/.test(url)) {
    url = await resolveRedirect(url);
    if (/^https:\/\/www\.douyin\.com\/?$/.test(url)) throw new Error('抖音短链已失效');
  }
  else if (/xhslink\.(cn|com)/.test(url)) url = await resolveRedirect(url, { Referer: 'https://www.xiaohongshu.com/' });
  else if (/b23\.tv|bili2233\.cn/.test(url)) url = await resolveRedirect(url, { Referer: 'https://www.bilibili.com/' });

  if (/bilibili\.com|b23\.tv|bili2233\.cn/.test(url)) return parseBilibili(url);
  if (/douyin\.com/.test(url)) return parseDouyin(url);
  if (/xiaohongshu\.com|xhslink/.test(url)) return parseRednote(url);
  if (/kuaishou\.com|chenzhongtech\.com|gifshow\.com/.test(url)) return parseKuaishou(url);
  if (/weibo\.com|weibo\.cn/.test(url)) return parseWeibo(url);
  if (/acfun\.cn/.test(url)) return parseAcFun(url);
  if (/music\.163\.com|163cn\.tv/.test(url)) return parseNetease(url);
  if (/(?:twitter|x)\.com/.test(url)) return parseX(url);
  if (/lofter\.com/.test(url)) return parseLofter(url);
  if (/coolapk1?s\.com/.test(url)) return parseCoolapk(url);
  if (/miyoushe\.com/.test(url)) return parseMiyoushe(url);
  if (/qishui\.douyin\.com/.test(url)) return parseQishui(url);
  if (/douban\.com/.test(url)) return parseDouban(url);
  if (/duitang\.com/.test(url)) return parseDuitang(url);
  if (/buff\.163\.com/.test(url)) return parseBuff(url);
  if (/5eplay\.com/.test(url)) return parse5eplay(url);
  if (/doubao\.com/.test(url)) return parseDoubao(url);
  if (/wmpvp\.com/.test(url)) return parseWmpvp(url);
  if (/linux\.do/.test(url)) return parseDiscourse(url, 'linuxdo', 'Linux Do', 'https://linux.do');
  if (/zlb\.ink/.test(url)) return parseDiscourse(url, 'zlb', '壁吧专楼吧', 'https://bb.zlb.ink');
  if (/kugou\.com|t1\.kugou\.com/.test(url)) return parseKugou(url);
  throw new Error('暂不支持该平台（支持：B站/抖音/小红书/快手/微博/AcFun/网易云/X/LOFTER/酷安/米游社/汽水/豆瓣/堆糖/BUFF/5EPlay/豆包/完美世界/LinuxDo/壁吧/酷狗）');
};

// ===== 媒体代理：解决跨域 download 失效与 CDN Referer 防盗链 =====

const mediaReferer = (host: string): string | undefined => {
  if (/bilivideo\.com$|hdslb\.com$|akamaized\.net$|biliapi\.net$|szbdyd\.com$/.test(host)) return 'https://www.bilibili.com/';
  if (/snssdk\.com$|douyinvod\.com$|douyinpic\.com$|douyin\.com$|bytecdn\.cn$|bytedance\.com$|ipdlab\.com$|douyinstatic\.com$|oceanctrl\.com$|amemv\.com$/.test(host)) return 'https://www.douyin.com/';
  if (/xhscdn\.com$|xiaohongshu\.com$/.test(host)) return 'https://www.xiaohongshu.com/';
  if (/kuaishou\.com$|yxixy99\.com$|chenzhongtech\.com$|gifshow\.com$|yximgs\.com$/.test(host)) return 'https://www.kuaishou.com/';
  if (/weibo\.cn$|weibo\.com$|sinaimg\.cn$|miaopai\.com$/.test(host)) return 'https://weibo.com/';
  if (/wmpvp\.com$|pwesports\.cn$/.test(host)) return 'https://news.wmpvp.com/';
  if (/miyoushe\.com$|mihoyo\.com$|hoyolab\.com$/.test(host)) return 'https://www.miyoushe.com/';
  if (/music\.126\.net$|netease\.com$/.test(host)) return 'https://music.163.com/';
  return undefined;
};

const MEDIA_HOST_ALLOWLIST = /^(?:[\w-]+\.)*(?:bilivideo\.com|hdslb\.com|akamaized\.net|biliapi\.net|szbdyd\.com|snssdk\.com|douyinvod\.com|douyinpic\.com|douyin\.com|bytecdn\.cn|bytedance\.com|byteimg\.com|ipdlab\.com|douyinstatic\.com|oceanctrl\.com|amemv\.com|xhscdn\.com|xiaohongshu\.com|kuaishou\.com|yxixy99\.com|chenzhongtech\.com|gifshow\.com|yximgs\.com|weibo\.cn|weibo\.com|sinaimg\.cn|miaopai\.com|wmpvp\.com|pwesports\.cn|miyoushe\.com|mihoyo\.com|hoyolab\.com|music\.126\.net|netease\.com|acfun\.cn|trsnh\.com|ixigua\.com|tencentvideo\.com|qq\.com|twimg\.com|tencent\.com|ksapiserv\.com|kugou\.com|5eplay\.com)$/;

export const parser: Feature = {
  id: 'parser',
  name: '链接解析',
  desc: '解析B站/抖音/小红书/快手/微博/X等22个平台的分享链接',
  icon: 'link',
  category: 'shiyong',
  group: '媒体解析',
  basePath: '/api/parse',
  register(app: App) {
    // B站扫码登录：数据中心 IP 被风控拉黑时，用户扫码授权后凭证存 KV，解析请求携带登录态
    app.get('/api/parse/bili/login/start', async (c) => {
      try {
        const res = await fetch('https://passport.bilibili.com/x/passport-login/web/qrcode/generate', {
          method: 'POST',
          headers: { 'User-Agent': BILI_UA, Origin: 'https://www.bilibili.com', Referer: 'https://www.bilibili.com/' },
        });
        const json = (await res.json()) as { code?: number; data?: { url?: string; qrcode_key?: string } };
        if (json.code !== 0 || !json.data?.url || !json.data.qrcode_key) {
          return c.json({ error: `生成二维码失败（code=${json.code}）` }, 502);
        }
        return c.json({ url: json.data.url, qrcodeKey: json.data.qrcode_key });
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    });

    app.get('/api/parse/bili/login/poll', async (c) => {
      const key = c.req.query('key') ?? '';
      if (!key) return c.json({ error: '缺少 key' }, 400);
      try {
        const res = await fetch(`https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(key)}`, {
          headers: { 'User-Agent': BILI_UA, Origin: 'https://www.bilibili.com', Referer: 'https://www.bilibili.com/' },
          redirect: 'manual',
        });
        const cookieJar = parseSetCookies(res);
        const json = (await res.json()) as { code?: number; data?: { code?: number; message?: string; url?: string } };
        if (json.data?.code === 0 && cookieJar.SESSDATA) {
          const sess: BiliSess = {
            sessdata: cookieJar.SESSDATA,
            bili_jct: cookieJar.bili_jct,
            dedeuserid: cookieJar.DedeUserID,
          };
          await c.env.KV.put(BILI_SESS_KV_KEY, JSON.stringify(sess));
          biliSessCache = null;
          return c.json({ code: 0 });
        }
        return c.json({ code: json.data?.code ?? json.code ?? -1, message: json.data?.message ?? '' });
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    });

    app.post('/api/parse', async (c) => {
      kvRef = c.env.KV;
      let text = '';
      try {
        ({ text } = await c.req.json<{ text: string }>());
      } catch {
        return c.json({ error: '请求体格式错误' }, 400);
      }
      const url = extractUrl(text || '');
      if (!url) return c.json({ error: '未找到链接' }, 400);
      try {
        const cacheKey = `parse:${url}`;
        const cached = await c.env.KV.get(cacheKey);
        if (cached) return c.json(JSON.parse(cached));
        const result = await dispatch(url);
        const fixProtocol = (u: string) => (u.startsWith('//') ? `https:${u}` : u);
        const normalized: ParseResult = {
          ...result,
          cover: result.cover ? fixProtocol(result.cover) : undefined,
          images: result.images?.map(fixProtocol),
          videos: result.videos?.map(fixProtocol),
        };
        await c.env.KV.put(cacheKey, JSON.stringify(normalized), { expirationTtl: 3600 });
        return c.json(normalized);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    });

    // 媒体代理：预览（透传 Range 支持拖动进度条）与下载（dl=1 强制附件）
    app.get('/api/parse/proxy', async (c) => {
      const url = c.req.query('url');
      if (!url) return c.json({ error: '缺少 url' }, 400);
      const upgraded = url.replace(/^http:\/\//i, 'https://');
      let host: string;
      try {
        const parsed = new URL(upgraded);
        if (parsed.protocol !== 'https:') return c.json({ error: '仅支持 http(s)' }, 400);
        host = parsed.hostname;
      } catch {
        return c.json({ error: 'url 无效' }, 400);
      }
      if (!MEDIA_HOST_ALLOWLIST.test(host)) return c.json({ error: '该域名不在允许列表' }, 403);

      const range = c.req.header('range');
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 15_000);
      // 手动跟随重定向（抖音 aweme.snssdk.com/aweme/v1/play 302 到真实 CDN），
      // 每一跳都重新校验白名单并按该跳 host 计算 Referer
      let upstream: Response | null = null;
      let current = upgraded;
      for (let i = 0; i < 5; i++) {
        let hopHost: string;
        try {
          hopHost = new URL(current).hostname;
        } catch {
          clearTimeout(timer);
          return c.json({ error: 'url 无效' }, 400);
        }
        if (!MEDIA_HOST_ALLOWLIST.test(hopHost)) {
          clearTimeout(timer);
          return c.json({ error: '该域名不在允许列表' }, 403);
        }
        const referer = mediaReferer(hopHost);
        try {
          upstream = await fetch(current, {
            headers: {
              'User-Agent': DESKTOP_UA,
              ...(referer ? { Referer: referer } : {}),
              ...(range ? { Range: range } : {}),
            },
            redirect: 'manual',
            signal: abort.signal,
          });
        } catch (e) {
          clearTimeout(timer);
          return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
        }
        const location = upstream.headers.get('location');
        if (upstream.status >= 300 && upstream.status < 400 && location) {
          current = new URL(location, current).href;
          continue;
        }
        break;
      }
      clearTimeout(timer);
      if (!upstream || upstream.status >= 300) {
        return c.json({ error: '上游重定向次数过多' }, 403);
      }

      const headers = new Headers();
      for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
        const value = upstream.headers.get(key);
        if (value) headers.set(key, value);
      }
      if (c.req.query('dl') === '1') {
        const ext = (headers.get('content-type') ?? '').includes('audio') ? 'm4a'
          : (headers.get('content-type') ?? '').includes('jpeg') ? 'jpg'
          : (headers.get('content-type') ?? '').includes('png') ? 'png'
          : (url.match(/\.(mp4|mp3|m4a|flv|webm|mov|jpg|jpeg|png|webp|gif)/)?.[1] ?? 'mp4');
        headers.set('Content-Disposition', `attachment; filename="neko-media.${ext}"`);
      }
      headers.set('Cache-Control', 'public, max-age=3600');
      return new Response(upstream.body, { status: upstream.status, headers });
    });
  },
};
