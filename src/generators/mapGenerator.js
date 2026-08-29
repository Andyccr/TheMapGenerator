/**
 * MapGenerator — the only module that orchestrates procedural algorithms.
 * It writes WorldData and never reads the DOM or canvas.
 *
 * Pipeline (O'Leary + Patel + Turner):
 *   mesh → plates → elevation → ocean/lakes → depression fill →
 *   rivers → climate / rain shadow → biomes → settlements / realms
 */

import { createWorldShell } from "../data/worldData.js";
import { makeRng } from "./rng.js";
import { createMesh } from "./mesh.js";
import { assignPlates, assignElevation } from "./tectonics.js";
import {
  classifyOceanAndCoast,
  fillDepressions,
  markLakesFromFill,
  assignDownslope,
  accumulateFlux,
  extractRivers,
  markMountains,
} from "./hydrology.js";
import { assignClimate, assignBiomes } from "./climate.js";
import { placeCivilizations, assignRegions } from "./civilization.js";
import { createNameFactory } from "./names.js";

/** @typedef {import("../types.js").WorldData} WorldData */
/** @typedef {import("../types.js").GenerateConfig} GenerateConfig */

export class MapGenerator {
  /**
   * @param {GenerateConfig} config
   * @returns {WorldData}
   */
  generate(config) {
    const world = createWorldShell(config);
    const rng = makeRng(world.meta.seed);
    const { cells } = createMesh({
      width: world.meta.width,
      height: world.meta.height,
      cellSize: world.meta.cellSize,
      rng,
      lloydIterations: 3,
    });
    world.cells = cells;
    world.plates = assignPlates(cells, world.meta.plateCount, rng, world.meta.width, world.meta.height);
    assignElevation(cells, world.plates, rng, world.meta.width, world.meta.height, world.meta.seaLevel);

    this.#hydrologyAndClimate(world);

    const names = createNameFactory(rng);
    const { settlements, regions } = placeCivilizations(cells, rng, names);
    world.settlements = settlements;
    world.regions = regions;
    world.generatedAt = new Date().toISOString();
    return world;
  }

  /**
   * After an editor changes heights, rebuild water, climate, biomes, and realms.
   * Mesh, plates, and settlement *identities* are preserved when still on land.
   * @param {WorldData} world
   * @returns {WorldData}
   */
  recomputeFromElevation(world) {
    this.#hydrologyAndClimate(world);
    const landIds = new Set(world.cells.filter((c) => !c.ocean && !c.lake && !c.mountain).map((c) => c.id));
    world.settlements = world.settlements.filter((s) => landIds.has(s.cellId) || this.#isLand(world, s.cellId));
    for (const s of world.settlements) {
      const c = world.cells[s.cellId];
      if (c.ocean) {
        const nb = c.neighbors.find((id) => !world.cells[id].ocean);
        if (nb !== undefined) s.cellId = nb;
      }
    }
    world.settlements = world.settlements.filter((s) => !world.cells[s.cellId].ocean);
    assignRegions(world.cells, world.settlements, world.regions);
    for (const s of world.settlements) {
      s.regionId = world.cells[s.cellId].regionId;
    }
    return world;
  }

  /**
   * Carve a monotonic downhill channel along a cell path, then recompute.
   * @param {WorldData} world
   * @param {number[]} cellIds
   */
  carveRiver(world, cellIds) {
    const unique = [];
    const seen = new Set();
    for (const id of cellIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      unique.push(id);
    }
    if (unique.length < 2) return world;
    const start = world.cells[unique[0]];
    const end = world.cells[unique[unique.length - 1]];
    const h0 = start.height;
    const h1 = Math.min(end.height, h0 - 0.02 * unique.length);
    for (let i = 0; i < unique.length; i++) {
      const t = i / (unique.length - 1);
      const cell = world.cells[unique[i]];
      const target = h0 * (1 - t) + h1 * t;
      cell.height = Math.min(cell.height, target);
      if (cell.ocean) break;
    }
    return this.recomputeFromElevation(world);
  }

  /**
   * @param {WorldData} world
   * @param {number} cellId
   */
  #isLand(world, cellId) {
    const c = world.cells[cellId];
    return c && !c.ocean;
  }

  /** @param {WorldData} world */
  #hydrologyAndClimate(world) {
    const { cells } = world;
    classifyOceanAndCoast(cells);
    fillDepressions(cells);
    markLakesFromFill(cells);
    assignDownslope(cells);
    accumulateFlux(cells);
    markMountains(cells);
    world.rivers = extractRivers(cells, 12);
    assignClimate(cells, world.meta.height, world.meta.wind);
    assignBiomes(cells);
  }
}
