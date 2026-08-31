/**
 * MapGenerator — the only module that orchestrates procedural algorithms.
 * It writes WorldData and never reads the DOM or canvas.
 *
 * Pipeline (O'Leary + Patel + Turner, then Azgaar-style society):
 *   mesh → plates → elevation → ocean/lakes → depression fill →
 *   rivers → climate / rain shadow → biomes → cultures →
 *   settlements / realms → routes → markers
 */

import { createWorldShell } from "../data/worldData.js";
import { makeRng } from "./rng.js";
import { createMesh } from "./mesh.js";
import { assignPlates, assignElevation } from "./tectonics.js";
import { gradeCoastsAndShelf, erodeFluvial } from "./relief.js";
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
import { placeCivilizations, assignRegions, addSettlement, removeSettlement } from "./civilization.js";
import { placeCultures, assignCultures } from "./cultures.js";
import { placeRoutes } from "./routes.js";
import { placeMarkers } from "./markers.js";
import { placeProvinces, assignProvinces } from "./provinces.js";
import { placeReligions, assignReligions } from "./religions.js";
import { placeFeatures } from "./features.js";
import { applyLandform } from "./landforms.js";
import { createNameFactory, phonologyById } from "./names.js";

/** @typedef {import("../types.js").WorldData} WorldData */
/** @typedef {import("../types.js").GenerateConfig} GenerateConfig */

export class MapGenerator {
  /**
   * @param {GenerateConfig} config
   * @param {(stage: string) => void} [onProgress]
   * @returns {WorldData}
   */
  generate(config, onProgress) {
    const world = createWorldShell(config);
    const rng = makeRng(world.meta.seed);
    onProgress?.("mesh");
    const { cells } = createMesh({
      width: world.meta.width,
      height: world.meta.height,
      cellSize: world.meta.cellSize,
      rng,
    });
    world.cells = cells;
    onProgress?.("tectonics");
    world.plates = assignPlates(cells, world.meta.plateCount, rng, world.meta.width, world.meta.height);
    assignElevation(
      cells,
      world.plates,
      rng,
      world.meta.width,
      world.meta.height,
      world.meta.seaLevel,
      world.meta.cellSize,
    );
    applyLandform(
      cells,
      rng,
      world.meta.width,
      world.meta.height,
      world.meta.landform || "continents",
      world.meta.seaLevel,
    );

    onProgress?.("hydrology");
    this.#hydrologyAndClimate(world);
    onProgress?.("society");
    this.#buildSociety(world, world.meta.societySeed || world.meta.seed, onProgress);
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
    if (world.cultures?.length) assignCultures(world.cells, world.cultures);
    assignRegions(world.cells, world.settlements, world.regions);
    if (world.provinces?.length) assignProvinces(world.cells, world.settlements, world.provinces);
    if (world.religions?.length) assignReligions(world.cells, world.religions);
    for (const s of world.settlements) {
      s.regionId = world.cells[s.cellId].regionId;
      s.cultureId = world.cells[s.cellId].cultureId ?? s.cultureId;
    }
    this.#nameRivers(world, makeRng(`${world.meta.societySeed || world.meta.seed}:rivers`));
    this.#routesAndMarkers(world, makeRng(`${world.meta.societySeed || world.meta.seed}:poi`));
    this.#placeFeatures(world);
    return world;
  }

  /**
   * Keep terrain; re-roll cultures, towns, realms, routes, and markers.
   * @param {WorldData} world
   * @param {string} [societySeed]
   */
  regenerateSociety(world, societySeed) {
    world.meta.societySeed = societySeed || `${world.meta.seed}-${Math.random().toString(36).slice(2, 8)}`;
    this.#buildSociety(world, world.meta.societySeed);
    return world;
  }

  /**
   * Keep places; re-roll names from each culture's phonology.
   * @param {WorldData} world
   */
  regenerateNames(world) {
    const rng = makeRng(`${world.meta.societySeed || world.meta.seed}:rename:${Date.now()}`);
    const mills = this.#mills(world, rng);
    for (const cult of world.cultures || []) {
      cult.name = mills(cult.id).culture();
    }
    for (const s of world.settlements) {
      s.name = mills(s.cultureId).settlement();
    }
    for (const r of world.regions) {
      r.name = mills(r.cultureId ?? -1).realm();
    }
    for (const p of world.provinces || []) {
      const seat = world.settlements.find((s) => s.id === p.seatId);
      p.name = mills(seat?.cultureId ?? -1).settlement();
    }
    for (const rel of world.religions || []) {
      if (rel.type === "folk") {
        const cult = world.cultures?.[rel.cultureId];
        rel.name = mills(rel.cultureId).religionFolk(cult?.name || "");
      } else {
        rel.name = mills(rel.cultureId).religion();
      }
    }
    for (const feat of world.features || []) {
      const mill = mills(world.cells[feat.originId]?.cultureId ?? -1);
      if (feat.type === "lake") feat.name = `${mill.river()}湖`;
      else if (feat.type === "island") feat.name = `${mill.feature()}岛`;
      else if (feat.type === "sea") feat.name = mill.feature() + (feat.name.endsWith("洋") ? "洋" : "海");
      else feat.name = mill.realm();
    }
    this.#nameRivers(world, rng);
    for (const m of world.markers || []) {
      const label = m.name.includes("·") ? m.name.split("·")[1].trim() : "";
      m.name = label ? `${mills(world.cells[m.cellId]?.cultureId ?? -1).marker()} · ${label}` : mills(-1).marker();
    }
    this.#setMapName(world);
    return world;
  }

  /**
   * @param {WorldData} world
   */
  rebuildRoutes(world) {
    const rng = makeRng(`${world.meta.societySeed || world.meta.seed}:routes:${world.settlements.length}`);
    world.routes = placeRoutes(world.cells, world.settlements, rng);
    return world;
  }

  /**
   * @param {WorldData} world
   */
  rebuildRoutesAndMarkers(world) {
    this.#routesAndMarkers(world, makeRng(`${world.meta.societySeed || world.meta.seed}:poi:${Date.now()}`));
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
   * @param {string} name
   * @param {"city"|"town"|"village"} [type]
   */
  addBurg(world, cellId, name, type = "town") {
    const s = addSettlement(world, cellId, name, type);
    if (s) this.rebuildRoutes(world);
    return s;
  }

  /**
   * @param {WorldData} world
   * @param {number} settlementId
   */
  removeBurg(world, settlementId) {
    if (!removeSettlement(world, settlementId)) return false;
    this.rebuildRoutes(world);
    return true;
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
    gradeCoastsAndShelf(cells, world.meta.cellSize);
    fillDepressions(cells);
    erodeFluvial(cells);
    classifyOceanAndCoast(cells);
    fillDepressions(cells);
    markLakesFromFill(cells);
    assignDownslope(cells);
    accumulateFlux(cells);
    markMountains(cells);
    world.rivers = extractRivers(cells, 16);
    assignClimate(cells, world.meta.height, world.meta.wind, world.meta.width);
    assignBiomes(cells);
  }

  /**
   * @param {WorldData} world
   * @param {string} societySeed
   * @param {(stage: string) => void} [onProgress]
   */
  #buildSociety(world, societySeed, onProgress) {
    const rng = makeRng(societySeed);
    const extent = { width: world.meta.width, height: world.meta.height };
    world.cultures = placeCultures(world.cells, rng, extent);
    const mills = this.#mills(world, rng);
    for (const cult of world.cultures) {
      cult.name = mills(cult.id).culture();
    }
    const { settlements, regions } = placeCivilizations(world.cells, rng, mills, extent);
    world.settlements = settlements;
    world.regions = regions;
    world.provinces = placeProvinces(world.cells, settlements, regions, rng, mills);
    world.religions = placeReligions(world.cells, world.cultures, settlements, rng, mills);
    this.#nameRivers(world, rng);
    onProgress?.("routes");
    this.#routesAndMarkers(world, rng);
    this.#placeFeatures(world);
    this.#setMapName(world);
  }

  /**
   * @param {WorldData} world
   * @param {() => number} rng
   */
  #mills(world, rng) {
    /** @type {Map<number, ReturnType<typeof createNameFactory>>} */
    const cache = new Map();
    const fallback = createNameFactory(rng);
    return (cultureId) => {
      if (cultureId == null || cultureId < 0) return fallback;
      let mill = cache.get(cultureId);
      if (mill) return mill;
      const cult = world.cultures?.[cultureId];
      mill = createNameFactory(rng, cult ? phonologyById(cult.phonologyId) : undefined);
      cache.set(cultureId, mill);
      return mill;
    };
  }

  /**
   * @param {WorldData} world
   * @param {() => number} rng
   */
  #nameRivers(world, rng) {
    const mills = this.#mills(world, rng);
    const ranked = world.rivers.slice().sort((a, b) => b.width - a.width);
    for (const river of ranked) {
      const mid = river.cellIds[river.cellIds.length >> 1];
      const cid = world.cells[mid]?.cultureId ?? -1;
      river.name = mills(cid).river();
    }
  }

  /**
   * @param {WorldData} world
   * @param {() => number} rng
   */
  #routesAndMarkers(world, rng) {
    const mills = this.#mills(world, rng);
    world.routes = placeRoutes(world.cells, world.settlements, rng);
    world.markers = placeMarkers(world.cells, world.settlements, world.cultures || [], rng, mills, {
      width: world.meta.width,
      height: world.meta.height,
    });
  }

  /** @param {WorldData} world */
  #placeFeatures(world) {
    const rng = makeRng(`${world.meta.societySeed || world.meta.seed}:geo`);
    const mills = this.#mills(world, rng);
    world.features = placeFeatures(world.cells, mills, {
      width: world.meta.width,
      height: world.meta.height,
    });
  }

  /** @param {WorldData} world */
  #setMapName(world) {
    const continent = (world.features || [])
      .filter((f) => f.type === "continent")
      .sort((a, b) => b.size - a.size)[0];
    const primary = world.cultures?.[0];
    const realm = world.regions[0];
    world.meta.mapName = continent?.name || realm?.name || primary?.name || world.meta.seed;
  }
}
