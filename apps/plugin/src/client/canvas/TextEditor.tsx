/**
 * Inline text entry: the DOM owns the characters while editing.
 *
 * React never writes the editor's children, so typing cannot be reset by a
 * re-render that arrives mid-keystroke.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import type { Layer } from '../../model/document';

interface TextEditorProps {
  layer: Layer;
  onTextInput(text: string): void;
  onFinishEditing(): void;
}

export function TextEditor({ layer, onTextInput, onFinishEditing }: TextEditorProps): ReactElement {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    // Seed the editor with the layer's text; React owns no children here, so the
    // DOM text survives re-renders while typing.
    node.textContent = layer.text;
    // Wait for the native double-click word selection to finish, then take over
    // and select the whole run: entering edit always starts with everything selected.
    const timer = setTimeout(() => {
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }, 0);
    return () => clearTimeout(timer);
    // Only a different layer reseeds the editor: the document follows every
    // keystroke, and re-running this would steal the caret back to "select all".
  }, [layer.id]);

  return (
    <div
      ref={editorRef}
      className="bp-text-editor"
      contentEditable
      onPointerDown={(event) => event.stopPropagation()}
      suppressContentEditableWarning
      spellCheck={false}
      onInput={(event) => onTextInput((event.currentTarget as HTMLDivElement).textContent ?? '')}
      onBlur={() => onFinishEditing()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onFinishEditing();
        }
      }}
    />
  );
}
