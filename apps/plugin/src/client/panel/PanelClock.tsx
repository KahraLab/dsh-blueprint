/**
 * The local time in the panel header.
 *
 * Its own component so the clock tick re-renders one span instead of the canvas.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

const TICK_MS = 30_000;

export function PanelClock(): ReactElement {
  const { i18n } = useTranslation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const formatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'zh' ? 'zh-CN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    [i18n.language],
  );

  return <span className="bp-clock">{formatter.format(now)}</span>;
}
