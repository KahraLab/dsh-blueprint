/**
 * 什么时候记一步撤销。
 *
 * 拖一次画框、拉一次滑块，都会连着写十几次文档；用户心里那是「一步」。
 * 所以历史不是每改一次就记一条，而是等手停下来再记：最后一次改动之后
 * 静默一小会儿，前面那些合成一步。
 *
 * 这个文件只管「攒」和「交出去」。哪些字段进历史、能存几步、撤销时改什么，
 * 都是 zundo 和 store 的事。
 */
import { UNDO_HISTORY } from '../../shared/config';

export interface CommitDebouncer {
  /** 排一次提交；连排几次只会留下最后一次。 */
  schedule(commit: () => void): void;
  /** 立刻把排着的那次交出去。撤销、切换文档之前必须调它。 */
  flush(): void;
  /** 排着的那次不要了。 */
  discard(): void;
}

export function createCommitDebouncer(delayMs = UNDO_HISTORY.commitDebounceMs): CommitDebouncer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: (() => void) | null = null;

  const stop = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return {
    schedule: (commit) => {
      pending = commit;
      stop();
      timer = setTimeout(() => {
        timer = null;
        const run = pending;
        pending = null;
        run?.();
      }, delayMs);
    },

    flush: () => {
      stop();
      const run = pending;
      pending = null;
      run?.();
    },

    discard: () => {
      stop();
      pending = null;
    },
  };
}
