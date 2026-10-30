/**
 * The characters of a text layer, edited as plain text.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

interface TextContentSectionProps {
  text: string;
  onChange(text: string): void;
}

export function TextContentSection({ text, onChange }: TextContentSectionProps): ReactElement {
  const { t } = useTranslation();
  return (
    <section className="bp-inspector-section">
      <h5>{t('inspector.content')}</h5>
      <textarea className="bp-field-textarea" value={text} onChange={(event) => onChange(event.target.value)} />
    </section>
  );
}
