/**
 * Place-name mill inspired by Martin O'Leary's naming-language notes.
 * Each culture rolls (or inherits) a phonology so names stay internally consistent.
 * @param {() => number} rng
 * @param {Phonology} [phonology]
 */

/**
 * @typedef {Object} Phonology
 * @property {string} id
 * @property {string[]} onsets
 * @property {string[]} vowels
 * @property {string[]} codas
 * @property {string[]} realmSuffixes
 * @property {string[]} [hydronyms]
 * @property {string[]} [lakeNames]
 */

/** @type {Phonology[]} */
export const PHONOLOGIES = [
  {
    id: "soft",
    onsets: ["l", "m", "n", "r", "v", "w", "y", "h", "th"],
    vowels: ["a", "e", "i", "ia", "ae", "ei"],
    codas: ["", "", "n", "l", "r", "s"],
    realmSuffixes: ["ia", "en", "elle", "vale"],
    hydronyms: ["河", "溪"],
    lakeNames: ["湖", "泽"],
  },
  {
    id: "harsh",
    onsets: ["k", "kr", "g", "gr", "d", "dr", "t", "sk", "z", "br"],
    vowels: ["a", "o", "u", "au", "o"],
    codas: ["k", "r", "g", "nd", "rk", "", "th"],
    realmSuffixes: ["or", "um", "ak", "gard"],
    hydronyms: ["江", "河"],
    lakeNames: ["湖", "泊"],
  },
  {
    id: "sibilant",
    onsets: ["s", "sh", "z", "zh", "ts", "ch", "j", "l"],
    vowels: ["a", "e", "i", "o", "ia"],
    codas: ["s", "sh", "n", "", "th", "st"],
    realmSuffixes: ["esh", "an", "ia"],
    hydronyms: ["江", "河"],
    lakeNames: ["湖", "泽"],
  },
  {
    id: "nordic",
    onsets: ["th", "st", "sk", "h", "bj", "kn", "v", "g", "f"],
    vowels: ["a", "o", "u", "ei", "au", "y"],
    codas: ["r", "n", "g", "rd", "nd", "", "l"],
    realmSuffixes: ["mark", "heim", "land", "fjord"],
    hydronyms: ["River", "Beck"],
    lakeNames: ["Lake", "Vatn"],
  },
  {
    id: "liquid",
    onsets: ["br", "cl", "fl", "gl", "pl", "sl", "tr", "l", "n"],
    vowels: ["a", "e", "o", "ia", "au"],
    codas: ["", "n", "l", "th", "m", "rd"],
    realmSuffixes: ["ia", "or", "wyn", "mere"],
    hydronyms: ["River", "Brook"],
    lakeNames: ["Mere", "Lake"],
  },
  {
    id: "island",
    onsets: ["k", "n", "p", "h", "w", "l", "t", "m"],
    vowels: ["a", "o", "u", "ai", "e"],
    codas: ["", "n", "i", "a", "l"],
    realmSuffixes: ["oa", "ua", "atoll", "isle"],
    hydronyms: ["河", "川"],
    lakeNames: ["湖", "潭"],
  },
];

/** @param {() => number} rng */
export function pickPhonology(rng) {
  return PHONOLOGIES[(rng() * PHONOLOGIES.length) | 0];
}

/** @param {string} id */
export function phonologyById(id) {
  return PHONOLOGIES.find((p) => p.id === id) || PHONOLOGIES[0];
}

/**
 * @param {() => number} rng
 * @param {Phonology} [phonology]
 */
export function createNameFactory(rng, phonology) {
  const pack = phonology || pickPhonology(rng);
  const onsets = pack.onsets;
  const vowels = pack.vowels;
  const codas = pack.codas;

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

  const hydronym = (tails, fallback) => {
    const stem = unique(1, 2);
    const list = tails && tails.length ? tails : fallback;
    const tail = list[(rng() * list.length) | 0];
    return /^[A-Za-z]/.test(tail) ? `${stem} ${tail}` : stem + tail;
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
    phonology: pack,
    settlement: () => unique(2, 3),
    realm: () => {
      const base = unique(2, 3);
      const suffixes = pack.realmSuffixes;
      if (base.length < 10 && rng() < 0.5) {
        return base + suffixes[(rng() * suffixes.length) | 0];
      }
      return base;
    },
    culture: () => unique(2, 3),
    river: () => hydronym(pack.hydronyms, ["河"]),
    lake: () => hydronym(pack.lakeNames, ["湖"]),
    marker: () => unique(2, 2),
    feature: () => unique(2, 3),
    religion: () => {
      const base = unique(2, 3);
      const tails = ["教", "宗", "会", "道"];
      return base + tails[(rng() * tails.length) | 0];
    },
    religionFolk: (cultureName) => `${cultureName || unique(2, 2)}祖灵`,
  };
}
