/**
 * Binary min-heap used by priority-flood hydrology.
 * @template T
 */
export class MinHeap {
  constructor() {
    /** @type {{ item: T, key: number }[]} */
    this.a = [];
  }

  get size() {
    return this.a.length;
  }

  /**
   * @param {T} item
   * @param {number} key
   */
  push(item, key) {
    const a = this.a;
    a.push({ item, key });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].key <= a[i].key) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  /** @returns {{ item: T, key: number } | undefined} */
  pop() {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let s = i;
        if (l < a.length && a[l].key < a[s].key) s = l;
        if (r < a.length && a[r].key < a[s].key) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top;
  }
}
