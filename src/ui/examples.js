/**
 * Curated atlas seeds so a first visit can open a finished-looking map.
 * Queries are the same shape as share.js — no extra keys.
 */

/** @typedef {{ id: string, title: string, blurb: string, query: string }} ExampleWorld */

/** @type {ExampleWorld[]} */
export const EXAMPLE_WORLDS = [
  {
    id: "archipelago",
    title: "群岛",
    blurb: "碎裂岛链，适合航海与岛国战役。",
    query: "?seed=verify14&landform=archipelago&style=religions",
  },
  {
    id: "pangea",
    title: "盘古",
    blurb: "一整块超大陆，内陆国度彼此接壤。",
    query: "?seed=pangea01&landform=pangea&style=physical",
  },
  {
    id: "peninsula",
    title: "半岛",
    blurb: "陆地探入大海，海岸线长、腹地窄。",
    query: "?seed=horn01&landform=peninsula&style=political",
  },
  {
    id: "inland-sea",
    title: "内海",
    blurb: "陆地环抱一片内海，像地中海战役底图。",
    query: "?seed=mare01&landform=inland-sea&style=cultural",
  },
  {
    id: "continents",
    title: "诸大陆",
    blurb: "纯板块轮廓，没有额外陆形步骤。",
    query: "?seed=terra&landform=continents&style=atlas",
  },
];
