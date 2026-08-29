/**
 * Place-name mill inspired by Martin O'Leary's naming-language notes:
 * a tiny phonology is rolled from the seed, then names are built from it
 * so a given world sounds internally consistent.
 * @param {() => number} rng
 */
export function createNameFactory(rng) {
  const onsetPool = ["b", "br", "c", "d", "dr", "f", "g", "gl", "h", "k", "kr", "l", "m", "n", "r", "s", "sh", "t", "th", "v", "w", "z"];
  const vowelPool = ["a", "ae", "e", "i", "ia", "o", "u", "au", "ei"];
  const codaPool = ["", "", "n", "r", "l", "s", "th", "m", "nd", "st", "rd"];

  const pick = (arr, n) => {
    const copy = arr.slice();
    const out = [];
    for (let i = 0; i < n && copy.length; i++) {
      const j = (rng() * copy.length) | 0;
      out.push(copy.splice(j, 1)[0]);
    }
    return out;
  };

  const onsets = pick(onsetPool, 8);
  const vowels = pick(vowelPool, 5);
  const codas = pick(codaPool, 6);

  const syllable = () => {
    const o = onsets[(rng() * onsets.length) | 0];
    const v = vowels[(rng() * vowels.length) | 0];
    const c = codas[(rng() * codas.length) | 0];
    return o + v + c;
  };

  const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const word = (minSyl = 2, maxSyl = 3) => {
    const n = minSyl + ((rng() * (maxSyl - minSyl + 1)) | 0);
    let w = "";
    for (let i = 0; i < n; i++) w += syllable();
    return title(w);
  };

  const used = new Set();
  const unique = (minSyl, maxSyl) => {
    for (let i = 0; i < 40; i++) {
      const w = word(minSyl, maxSyl);
      if (!used.has(w)) {
        used.add(w);
        return w;
      }
    }
    const w = word(minSyl, maxSyl) + (used.size + 1);
    used.add(w);
    return w;
  };

  return {
    settlement: () => unique(2, 3),
    realm: () => {
      const base = unique(2, 3);
      const suffixes = ["ia", "or", "en", "um", "land", "mark"];
      if (base.length < 8 && rng() < 0.45) {
        return base + suffixes[(rng() * suffixes.length) | 0];
      }
      return base;
    },
  };
}
