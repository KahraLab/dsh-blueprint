/**
 * The plugin's stylesheet, mounted once per page.
 *
 * The canvas, the entry page and the right-sidebar tab title all dress with
 * these classes. The tab title outlives the panel it opens, so the stylesheet
 * cannot live inside a component: a hidden panel would take the tab title's
 * layout with it.
 */
import css from './styles.css';

/** Attach one stylesheet element; the disposer removes exactly that element. */
export function attachStyles(): () => void {
  const style = document.createElement('style');
  style.dataset.bp = 'styles';
  style.textContent = css;
  document.head.append(style);
  return () => {
    style.remove();
  };
}
