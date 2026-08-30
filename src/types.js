/**
 * Shared JSDoc contracts for the four-layer architecture.
 *
 * Data layer objects are plain JSON: no methods, no hidden class state.
 * Generators produce data. Editors mutate data. Renderers only read data.
 *
 * These typedefs are the TypeScript migration surface — convert this file
 * to `types.ts` and replace `@typedef` with real interfaces when ready.
 */

/**
 * @typedef {Object} Vec2
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} Plate
 * @property {number} id
 * @property {boolean} continental
 * @property {number} vx
 * @property {number} vy
 * @property {number} cx
 * @property {number} cy
 */

/**
 * @typedef {Object} Cell
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number[]} neighbors
 * @property {number[][]} polygon  list of [x,y]
 * @property {boolean} border
 * @property {number} plateId
 * @property {number} height
 * @property {number} filledHeight
 * @property {number} flux
 * @property {number} moisture
 * @property {number} temperature
 * @property {string} biome
 * @property {boolean} ocean
 * @property {boolean} lake
 * @property {boolean} coast
 * @property {boolean} mountain
 * @property {number} downslope  neighbor id or -1
 * @property {number} riverId    -1 if none
 * @property {number} regionId   -1 if none
 * @property {number} cultureId  -1 if none
 * @property {number} precipitation
 */

/**
 * @typedef {Object} River
 * @property {number} id
 * @property {number[]} cellIds
 * @property {number[][]} points
 * @property {number} width
 * @property {string} [name]
 */

/**
 * @typedef {Object} Settlement
 * @property {number} id
 * @property {number} cellId
 * @property {string} name
 * @property {"capital"|"city"|"town"|"village"} type
 * @property {number} regionId
 * @property {number} cultureId
 * @property {number} population
 * @property {string} [note]
 */

/**
 * @typedef {Object} Region
 * @property {number} id
 * @property {string} name
 * @property {string} color
 * @property {number} capitalId
 * @property {number} [cultureId]
 * @property {string} [note]
 */

/**
 * @typedef {Object} Culture
 * @property {number} id
 * @property {string} name
 * @property {string} color
 * @property {string} type
 * @property {number} originId
 * @property {string} phonologyId
 * @property {string} [note]
 */

/**
 * @typedef {Object} Route
 * @property {number} id
 * @property {"road"|"trail"|"sea"} kind
 * @property {number} fromId
 * @property {number} toId
 * @property {number[]} cellIds
 * @property {number[][]} points
 */

/**
 * @typedef {Object} Marker
 * @property {number} id
 * @property {number} cellId
 * @property {string} type
 * @property {string} name
 * @property {string} [note]
 */

/**
 * @typedef {Object} WorldView
 * @property {number} x
 * @property {number} y
 * @property {number} scale
 */

/**
 * @typedef {Object} WorldMeta
 * @property {string} seed
 * @property {number} width
 * @property {number} height
 * @property {number} cellSize
 * @property {number} plateCount
 * @property {number} seaLevel
 * @property {Vec2} wind
 * @property {string} style
 * @property {string} [societySeed]
 * @property {string} [mapName]
 */

/**
 * Pure serializable map state. This is the entire save file.
 *
 * @typedef {Object} WorldData
 * @property {1} version
 * @property {WorldMeta} meta
 * @property {Cell[]} cells
 * @property {Plate[]} plates
 * @property {River[]} rivers
 * @property {Settlement[]} settlements
 * @property {Region[]} regions
 * @property {Culture[]} [cultures]
 * @property {Route[]} [routes]
 * @property {Marker[]} [markers]
 * @property {WorldView} view
 * @property {string} generatedAt
 */

/**
 * @typedef {Object} GenerateConfig
 * @property {string} seed
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [cellSize]
 * @property {number} [plateCount]
 * @property {number} [seaLevel]
 * @property {Vec2} [wind]
 * @property {string} [societySeed]
 */

/**
 * @typedef {Object} PointerEventWorld
 * @property {number} worldX
 * @property {number} worldY
 * @property {number} [cellId]
 * @property {"down"|"move"|"up"|"hover"} phase
 * @property {boolean} shiftKey
 */

/**
 * Generator contract: algorithms in, plain WorldData out. Never touches the DOM.
 *
 * @typedef {Object} MapGenerator
 * @property {(config: GenerateConfig) => WorldData} generate
 * @property {(world: WorldData) => WorldData} recomputeFromElevation
 * @property {(world: WorldData, suffix?: string) => WorldData} regenerateSociety
 * @property {(world: WorldData) => WorldData} regenerateNames
 * @property {(world: WorldData) => WorldData} rebuildRoutesAndMarkers
 */

/**
 * Editor contract: controlled mutations of WorldData. Must not render.
 *
 * @typedef {Object} EditorTool
 * @property {string} id
 * @property {string} hint
 * @property {(world: WorldData, ev: PointerEventWorld, ctx: EditorContext) => void} apply
 */

/**
 * @typedef {Object} EditorContext
 * @property {number} brush
 * @property {() => void} requestRecompute
 * @property {(world: WorldData) => void} commit
 * @property {(html: string) => void} [promptRename]
 * @property {string} [markerType]
 * @property {(text: string, fallback?: string) => string | null} [promptText]
 */

/**
 * Renderer contract: visualize WorldData without modifying it.
 *
 * @typedef {Object} Renderer
 * @property {(world: WorldData, options?: RenderOptions) => void} draw
 * @property {(screenX: number, screenY: number) => Vec2} screenToWorld
 * @property {(worldX: number, worldY: number) => Vec2} worldToScreen
 * @property {(world: WorldData, worldX: number, worldY: number) => number} hitTest
 * @property {(world: WorldData, scale: number) => HTMLCanvasElement} renderExport
 * @property {(dx: number, dy: number) => void} pan
 * @property {(factor: number, cx: number, cy: number) => void} zoomAt
 */

/**
 * @typedef {Object} RenderOptions
 * @property {boolean} [labels]
 * @property {boolean} [borders]
 * @property {boolean} [grid]
 * @property {boolean} [rivers]
 * @property {boolean} [routes]
 * @property {boolean} [markers]
 * @property {boolean} [relief]
 * @property {number} [highlightCell]
 * @property {number[]} [draftPath]
 * @property {{ x0: number, y0: number, x1: number, y1: number } | null} [measure]
 * @property {"overview"|"regional"|"local"} [lod]
 */

export {};
