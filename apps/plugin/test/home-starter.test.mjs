/**
 * The design entry's starter prompt.
 *
 * It fills an empty draft once, so entering the page always points the model at
 * the canvas. A draft the user already has is never overwritten, and clearing
 * the box later does not make the starter reappear under their cursor.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { bundle } from './helpers/bundle.mjs';

let store;
let cleanup;

before(async () => {
  const built = await bundle({ homeStore: 'src/client/home/homeStore.ts' });
  store = await built.load('homeStore');
  cleanup = built.cleanup;
});

after(async () => {
  await cleanup();
});

test('空草稿填上引导，已有草稿不覆盖，清空后也不反复塞回来', () => {
  const { useHomeUi } = store;
  useHomeUi.setState({ prompt: '', starterApplied: false });
  useHomeUi.getState().offerStarter('使用 dsh-blueprint-canvas：');
  assert.equal(useHomeUi.getState().prompt, '使用 dsh-blueprint-canvas：');
  assert.equal(useHomeUi.getState().starterApplied, true);

  useHomeUi.getState().setPrompt('我自己的想法');
  useHomeUi.getState().offerStarter('使用 dsh-blueprint-canvas：');
  assert.equal(useHomeUi.getState().prompt, '我自己的想法');

  useHomeUi.getState().setPrompt('');
  useHomeUi.getState().offerStarter('使用 dsh-blueprint-canvas：');
  assert.equal(useHomeUi.getState().prompt, '', '用户清空草稿后，引导不再突然出现');
});

test('已经打过草稿时，第一次进入也不覆盖', () => {
  const { useHomeUi } = store;
  useHomeUi.setState({ prompt: '做一个登录页', starterApplied: false });
  useHomeUi.getState().offerStarter('使用 dsh-blueprint-canvas：');
  assert.equal(useHomeUi.getState().prompt, '做一个登录页');
  assert.equal(useHomeUi.getState().starterApplied, true);
});
