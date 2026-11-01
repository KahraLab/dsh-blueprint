/**
 * 检查器能选的字体家族。
 *
 * 名单由宿主扫描本机字体目录得到（浏览器列不出本机字体）。面板只取一次，
 * 结果在这个模块里缓存；取不到就退回一份常见字体，界面不至于空着。
 */
const FONTS_ENDPOINT = '/api/blueprint/fonts';

/** 接口不通时的兜底名单：只求能选上一个像样的字体。 */
const COMMON_FAMILIES: readonly string[] = [
  'system-ui',
  'Figtree',
  'Inter',
  'Helvetica Neue',
  'Arial',
  'PingFang SC',
  'Songti SC',
  'Georgia',
  'Menlo',
  'Courier New',
];

let pending: Promise<readonly string[]> | null = null;

async function readFamilies(): Promise<readonly string[]> {
  try {
    const response = await fetch(FONTS_ENDPOINT);
    if (!response.ok) return COMMON_FAMILIES;
    const body = (await response.json()) as { families?: unknown };
    const families = Array.isArray(body.families)
      ? body.families.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      : [];
    return families.length > 0 ? families : COMMON_FAMILIES;
  } catch {
    return COMMON_FAMILIES;
  }
}

/** 本机字体家族名；反复调用只发一次请求。 */
export function loadFontFamilies(): Promise<readonly string[]> {
  pending ??= readFamilies();
  return pending;
}
