/**
 * The editor runtime as one module: the document store, its file sync, and the
 * editing keys.
 *
 * Views import the piece they need; this barrel is the seam the Node-side test
 * bundles, so the store and its sync share one instance.
 */
export { adoptExternalDocument, replaceDocument, redo, undo, useBlueprint } from './store';
export { loadDocument, startSession } from './sync';
export { installKeys, handleHistoryKey, handleDeleteKey, handleToolKey } from './keys';
