/**
 * 本机装了哪些字体，给检查器的字体选择器用。
 *
 * 浏览器列不出本机字体，这份名单只能由宿主扫描字体目录得到。面板取一次就够；
 * 刚装完新字体可以带 `?refresh=1` 让宿主重新扫描。
 */
import type { FetchRoute } from '../../../types/dsh';
import { listFontFamilies } from '../../../infrastructure/fonts/store';
import { guarded } from '../respond';

export const FONTS_ENDPOINT = '/api/blueprint/fonts';

export function createFontsRoute(): FetchRoute {
  return {
    path: FONTS_ENDPOINT,
    methods: ['GET'],
    requestBody: 'buffered',

    fetch: (request) => guarded(async () => {
      const refresh = new URL(request.url).searchParams.get('refresh') === '1';
      const { families, scannedAt } = await listFontFamilies(refresh);
      return Response.json({ ok: true, families, scannedAt });
    }),
  };
}
