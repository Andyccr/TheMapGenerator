/**
 * MapGenerator — the only module that orchestrates procedural algorithms.
 * It writes WorldData and never reads the DOM or canvas.
 *
 * Pipeline (O'Leary + Patel + Turner, then Azgaar-style society):
 *   mesh → plates → elevation → ocean/lakes → depression fill →
 *   rivers → climate / rain shadow → biomes → cultures →
 *   settlements / realms → routes → markers
 */

import { createWorldShell, bumpSurface } from "../data/worldData.js";
import { makeRng } from "./rng.js";
import { createMesh } from "./mesh.js";
import { assignPlates, assignElevation } from "./tectonics.js";
import { gradeCoastsAndShelf, erodeFluvial, slumpSlopes } from "./relief.js";
import {
  classifyOceanAndCoast,
  fillDepressions,
  markLakesFromFill,
  assignDownslope,
  accumulateFlux,
  extractRivers,
  markMountains,
} from "./hydrology.js";
import { assignClimate, assignBiomes, spreadMoisture } from "./climate.js";
import { placeCivilizations, assignRegions } from "./civilization.js";
import { placeCultures } from "./cultures.js";
import { placeRoutes } from "./routes.js";
import { pruneRoutes } from "../data/routes.js";
import { placeMarkers } from "./markers.js";
import { placeProvinces, clearForeignProvinces } from "./provinces.js";
import { placeReligions } from "./religions.js";
import { placeFeatures } from "./features.js";
import { applyLandform, applyStepsOnly } from "./landforms.js";
import { parseRecipe } from "../data/landforms.js";
import { pruneDiplomacy } from "../data/diplomacy.js";
import { placeDiplomacy } from "./diplomacy.js";
import { createNameFactory, phonologyById } from "./names.js";
import { carryNames } from "../data/carry.js";

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
      parseRecipe(world.meta.landformSteps),
    );
    slumpSlopes(world.cells);

    onProgress?.("hydrology");
    this.#hydrology(world);
    onProgress?.("climate");
    this.#temperatures(world);
    this.#layRivers(world);
    this.#biomes(world);
    onProgress?.("society");
    this.#buildSociety(world, world.meta.societySeed || world.meta.seed, onProgress);
    world.generatedAt = new Date().toISOString();
    bumpSurface(world);
    return world;
  }

  /**
   * After an editor changes heights, rebuild water and climate.
   * Mesh, plates, towns, hand-drawn routes/markers, culture/faith paint,
   * and diplomacy stances stay. Realms re-flood from remaining capitals.
   * A province id stays only while its cell is still inside that province's realm.
   * @param {WorldData} world
   * @param {(stage: string) => void} [onProgress]
   * @returns {WorldData}
   */
  recomputeFromElevation(world, onProgress) {
    const prevRivers = (world.rivers || []).map((r) => ({ cellIds: r.cellIds.slice(), name: r.name }));
    const prevFeatures = (world.features || []).map((f) => ({
      name: f.name,
      type: f.type,
      cx: f.cx,
      cy: f.cy,
      originId: f.originId,
    }));
    onProgress?.("hydrology");
    this.#hydrology(world);
    onProgress?.("climate");
    this.#temperatures(world);
    this.#layRivers(world);
    this.#biomes(world);
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
    clearForeignProvinces(world.cells, world.provinces || []);
    for (const s of world.settlements) {
      s.regionId = world.cells[s.cellId].regionId;
      s.cultureId = world.cells[s.cellId].cultureId ?? s.cultureId;
    }
    carryNames(prevRivers, world.rivers, "river");
    this.#nameMissingRivers(world);
    pruneRoutes(world);
    world.markers = (world.markers || []).filter((m) => {
      const c = world.cells[m.cellId];
      return c && !c.ocean;
    });
    onProgress?.("society");
    this.#placeFeatures(world);
    carryNames(prevFeatures, world.features || [], "feature");
    world.diplomacy = pruneDiplomacy(world.diplomacy || [], world.regions);
    bumpSurface(world);
    return world;
  }

  /**
   * Wind / biome restamp without touching height, towns, or roads.
   * @param {WorldData} world
   */
  recomputeClimate(world) {
    this.#temperatures(world);
    this.#biomes(world);
    bumpSurface(world);
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
    bumpSurface(world);
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
  rebuildRoutesAndMarkers(world) {
    this.#routesAndMarkers(world, makeRng(`${world.meta.societySeed || world.meta.seed}:poi:${Date.now()}`));
    return world;
  }

  /**
   * Overlay landform recipe steps on the current heightmap. Caller must recompute hydrology.
   * @param {WorldData} world
   * @param {object[]} steps
   */
  applyLandformSteps(world, steps) {
    applyStepsOnly(
      world.cells,
      makeRng(`${world.meta.seed}:recipe-apply`),
      world.meta.width,
      world.meta.height,
      steps,
    );
    world.meta.landformSteps = steps;
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
  #hydrology(world) {
    const { cells } = world;
    classifyOceanAndCoast(cells);
    gradeCoastsAndShelf(cells, world.meta.cellSize);
    fillDepressions(cells);
    erodeFluvial(cells);
    classifyOceanAndCoast(cells);
    fillDepressions(cells);
    markLakesFromFill(cells);
    assignDownslope(cells);
    markMountains(cells);
  }

  /**
   * Rivers after climate so wet belts carry more water than horse-latitude deserts.
   * Wind-only restamps skip this and leave the existing network in place.
   * @param {WorldData} world
   */
  #layRivers(world) {
    const { cells } = world;
    accumulateFlux(cells, true);
    world.rivers = extractRivers(cells, 16);
  }

  /** @param {WorldData} world */
  #temperatures(world) {
    assignClimate(world.cells, world.meta.height, world.meta.wind, world.meta.width);
  }

  /** Moisture and biomes, after `riverId` is current. */
  #biomes(world) {
    spreadMoisture(world.cells);
    assignBiomes(world.cells);
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
    world.diplomacy = placeDiplomacy(regions, world.cells, rng);
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

  /** @param {WorldData} world */
  #nameMissingRivers(world) {
    const rng = makeRng(`${world.meta.societySeed || world.meta.seed}:rivers-gap`);
    const mills = this.#mills(world, rng);
    for (const river of world.rivers) {
      if (river.name) continue;
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
