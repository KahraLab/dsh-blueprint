/**
 * 有容量上限、可选过期时间的键值缓存。
 *
 * 项目里原来有四处一模一样的写法：`Map` 存 `{ at, value }`，读的时候算一下
 * 寿命，写满了就把最早放进去的那个删掉。四处各写一遍，改一处忘三处。这里
 * 收成一个东西，调用方只说「能放几条、能活多久」。
 *
 * 满了淘汰的是最久没被写过的那个；读不算「用过」，因为调用方读到的都是缓存
 * 的整份结果，让它续命没有意义。
 */
export interface Cache<K, V> {
  /** 命中且没过期才有值。 */
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  delete(key: K): void;
  clear(): void;
  readonly size: number;
}

export interface CacheOptions {
  /** 最多存几项，超过就淘汰最早写入的。 */
  capacity: number;
  /** 多久算过期；不填就是不过期。 */
  ttlMs?: number;
}

interface Slot<V> {
  readonly at: number;
  readonly value: V;
}

export function createCache<K, V>(options: CacheOptions): Cache<K, V> {
  const slots = new Map<K, Slot<V>>();
  const expires = options.ttlMs !== undefined;

  /** 惰性删除：只有被读到的时候才发现过期。 */
  function live(key: K): Slot<V> | undefined {
    const slot = slots.get(key);
    if (slot === undefined) return undefined;
    if (expires && Date.now() - slot.at >= options.ttlMs!) {
      slots.delete(key);
      return undefined;
    }
    return slot;
  }

  return {
    get: (key) => live(key)?.value,

    set: (key, value) => {
      // 先删再插，让它排到队尾：重新写入的项最不容易被淘汰。
      slots.delete(key);
      slots.set(key, { at: Date.now(), value });
      while (slots.size > options.capacity) {
        const oldest = slots.keys().next().value;
        if (oldest === undefined) break;
        slots.delete(oldest);
      }
    },

    delete: (key) => {
      slots.delete(key);
    },

    clear: () => {
      slots.clear();
    },

    get size() {
      return slots.size;
    },
  };
}
