/**
 * Preserve GM-written names when a rebuild replaces river/feature objects.
 * Greedy one-to-one matching: the strongest unused overlap wins.
 */

/**
 * @param {{ cellIds?: number[], name?: string, type?: string, cx?: number, cy?: number, originId?: number }[]} prev
 * @param {{ cellIds?: number[], name?: string, type?: string, cx?: number, cy?: number, originId?: number }[]} next
 * @param {"river"|"feature"} kind
 */
export function carryNames(prev, next, kind) {
  if (!prev?.length || !next?.length) return 0;
  /** @type {{ i: number, j: number, score: number }[]} */
  const scored = [];
  for (let i = 0; i < next.length; i++) {
    const item = next[i];
    if (item.name) continue;
    for (let j = 0; j < prev.length; j++) {
      const old = prev[j];
      if (!old.name) continue;
      if (kind === "feature" && old.type !== item.type) continue;
      let score = 0;
      if (kind === "river") {
        const set = new Set(item.cellIds || []);
        for (const id of old.cellIds || []) if (set.has(id)) score += 1;
      } else if (old.originId === item.originId) {
        score = 1e6;
      } else {
        const dx = (old.cx ?? 0) - (item.cx ?? 0);
        const dy = (old.cy ?? 0) - (item.cy ?? 0);
        const d = dx * dx + dy * dy;
        score = d < 90 * 90 ? 90 * 90 - d : 0;
      }
      if (score > 0) scored.push({ i, j, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const takenNext = new Set();
  const takenPrev = new Set();
  let n = 0;
  for (const { i, j, score } of scored) {
    if (takenNext.has(i) || takenPrev.has(j)) continue;
    if (kind === "feature" && score < 1) continue;
    next[i].name = prev[j].name;
    takenNext.add(i);
    takenPrev.add(j);
    n += 1;
  }
  return n;
}
