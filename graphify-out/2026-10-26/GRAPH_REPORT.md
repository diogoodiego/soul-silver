# Graph Report - packages  (2026-10-26)

## Corpus Check
- Large corpus: 589 files · ~270,789 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 4100 nodes · 11436 edges · 155 communities (144 shown, 11 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 278 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- AI Content & Test Worlds
- Assets Controller
- Game Session UI
- Input Glyphs & Focus
- Game Data Codec
- Progression & Rewards
- Level Collision & Buildings
- PNG Sprite Packing
- Sanity Report CLI
- Capture Pipeline
- Audio Probe & Tally
- App Shell
- Wild Content Loader
- ROM Filesystem Inputs
- NARC & FNT Builders
- Pokemon Cries Audio
- Game Server Setup
- Vitest Configs & Connection Tests
- Prediction & Tile Tests
- GX Display Lists
- Event Script Layout
- Battle Extraction
- Sprite Layout
- Game Connection Client
- Data Layout Schemas
- Extractor Electron Config
- Matrix & Grid Parsing
- Asset Checks
- Starter & Play Requests
- Stage Registry
- Audio Report CLI
- Instruments & Notes
- Game Text Banks
- AI Content Data
- Sprite Forms & Graphics
- Combat Flights
- Item & Learnset Tests
- Player Movement
- LAN Discovery
- Server Host
- Bag UI
- Battle Stat Keys
- Combat Engine
- NDS Filesystem
- Trainers & Catchers
- Dev Arena Entry
- Camera Bounds
- Combat Content Data
- Map Headers
- Online Panel UI
- AI Controller
- Settings Store
- Global Types
- Asset Loader
- Save Slots UI
- Bank Format
- Event Stage Tests
- Arena & Party Reorder
- Captures & Broadcast
- AI States & Protocol
- Session Controller
- Companion Content Loader
- Script Command Table
- SDAT Sound Format
- Combat Schemas
- Audio Decode Worker
- AI Senses & Tuning
- Limits & Migration
- ROM Reference Validation
- Audio Rendering Tests
- Companion Reactions
- Shared Package Config
- Text Catalog
- Save Store
- Audio Engine
- Game Renderer
- World Map
- Update Controller
- Cry Audio Schemas
- BLZ Decompression
- Companions & Targeting
- AI Move Scoring
- Game Data Schema Tests
- Extractor Host Entry
- Dialog Formatting
- Wild Encounter Spawns
- Event Schemas
- Client Package Config
- Audio Cues & Reactions
- Map Mesh Builder
- AI Controller Core
- Events Report
- Dialog Queue
- Personal Data Reader
- NITRO Format
- Manifest & Hex Utils
- Title Screen Extraction
- Status Effects
- Asset Protocol & Navigation Guard
- Move & Party Panels
- Combat Feedback FX
- Particles
- Evolution Data
- Audio Viewer Page
- Recorder & Replay
- Markup Text Format
- WebSocket Listener
- Client Audio & Settings UI
- Grass Clearing & Map Objects
- Encounter Data
- Charmap Text
- Game Data Parse
- Item Data
- Map Mesh Schemas
- Bot Steering & Aim
- AI Perception & Sight
- Collision Categories
- Server Host Handlers
- Battle Effects
- Event Command Tests
- Arena Setup UI
- Client Prediction
- Client Map Loading
- Extractor Package Config
- ROM Unpack Tests
- Animation Tracks
- Remote Connection
- Move Data
- Server Host Protocol
- Server Package Config
- Trail Following
- Client TS Config
- App TS Config
- Combat Coverage Scripts
- World Map Loading
- Server TS Config
- Hitbox Segments
- Extractor TS Config
- Cooldown Tuning
- Text IDs
- ADPCM Audio Tests
- Type Chart
- Shared TS Config
- Sound Sources
- WebSocket Client Listener
- Synthetic Test Fixtures
- Remote Client Options
- Blackout Money Loss
- Bank Find Tests
- Client App Shell
- Text Schema Tests
- CSS Types
- Electron Builder Config
- Maps Viewer Page
- Sprites Viewer Page

## God Nodes (most connected - your core abstractions)
1. `readU16()` - 79 edges
2. `ByteWriter` - 77 edges
3. `readU32()` - 55 edges
4. `createSession()` - 48 edges
5. `createCombat()` - 44 edges
6. `t()` - 42 edges
7. `createRegistry()` - 38 edges
8. `setup()` - 37 edges
9. `SoulSilverApi` - 36 edges
10. `createRng()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `collision()` --indirect_call--> `stages()`  [INFERRED]
  server/test/world-loader.test.ts → extractor/test/pipeline/interruption.test.ts
- `validateAndCopy()` --calls--> `validateRom()`  [EXTRACTED]
  app/src/extractor-host/entry.ts → extractor/src/rom/validate.ts
- `extract()` --calls--> `createRegistry()`  [EXTRACTED]
  app/src/extractor-host/entry.ts → extractor/src/pipeline/registry.ts
- `extract()` --calls--> `runPipeline()`  [EXTRACTED]
  app/src/extractor-host/entry.ts → extractor/src/pipeline/run.ts
- `createSaveStore()` --calls--> `randomSuffix()`  [EXTRACTED]
  app/src/main/save-store.ts → extractor/src/fs-atomic.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Dev-only data viewer pages** — packages_extractor_src_viewer_audio_html, packages_extractor_src_viewer_index_html, packages_extractor_src_viewer_sprites_html [INFERRED 0.75]

## Communities (155 total, 11 thin omitted)

### Community 0 - "AI Content & Test Worlds"
Cohesion: 0.07
Nodes (51): AiContent, buildAiData(), BUNDLED_AI_CONTENT, buildWildData(), createWorld(), minCast, game(), WORLD (+43 more)

### Community 1 - "Assets Controller"
Cohesion: 0.06
Nodes (40): AssetsCheckResult, AssetsController, AssetsControllerOptions, AssetsPaths, createAssetsController(), acceptsRom(), cancel(), extract() (+32 more)

### Community 2 - "Game Session UI"
Cohesion: 0.03
Nodes (64): activeMember, addresses, aiShapes, audioStats, bag, balls, bars, captureLine (+56 more)

### Community 3 - "Input Glyphs & Focus"
Cohesion: 0.05
Nodes (49): { action, pad = false }, label, PAD_NAMES, input, Direction, menuNavigation(), nextInDirection(), Rect (+41 more)

### Community 4 - "Game Data Codec"
Cohesion: 0.06
Nodes (29): GameDataCodec, sharedCodec, writeGameDataFile(), RenameOptions, renameWithRetry(), RETRYABLE, writeFileAtomic(), u16() (+21 more)

### Community 5 - "Progression & Rewards"
Cohesion: 0.06
Nodes (30): Answer, createProgression(), credit(), regrow(), resolve(), send(), diff(), Progression (+22 more)

### Community 6 - "Level Collision & Buildings"
Cohesion: 0.06
Nodes (45): buildCollision(), CollisionWarning, NEIGHBORS, Model, Building, fx32(), Piece, PieceFormatError (+37 more)

### Community 7 - "PNG Sprite Packing"
Cohesion: 0.06
Nodes (42): RgbaImage, Sheet, Packed, PackError, packFrames(), PackItem, Placement, buildReportFile() (+34 more)

### Community 8 - "Sanity Report CLI"
Cohesion: 0.07
Nodes (45): CliIo, buildSanityReport(), checkWarnings(), COUNT_LABELS, countAll(), EXPECTED_COUNTS, ExpectedCounts, formatSanityReport() (+37 more)

### Community 9 - "Capture Pipeline"
Cohesion: 0.06
Nodes (27): AiOptions, AiData, Attempt, CaptureOptions, Captures, State, VECTORS, Combat (+19 more)

### Community 10 - "Audio Probe & Tally"
Cohesion: 0.09
Nodes (44): census, sdat, tally, KIND, noteAt(), readSbnk(), BankInfo, nitroData() (+36 more)

### Community 11 - "App Shell"
Cohesion: 0.06
Nodes (33): appVersion, assets, attempt, failed, info, play, reconnect(), Screen (+25 more)

### Community 12 - "Wild Content Loader"
Cohesion: 0.06
Nodes (28): ExtractedForProgression, BUNDLED_WILD_CONTENT, ExtractedForWild, parse(), WildContent, WildData, EncounterRecord, EvolutionRecord (+20 more)

### Community 13 - "ROM Filesystem Inputs"
Cohesion: 0.10
Nodes (41): countNarcMembers(), FILESYSTEM_INPUT, readArm9(), readFileSystemFile(), readNarcMember(), readOverlay(), readItem(), readItemMap() (+33 more)

### Community 14 - "NARC & FNT Builders"
Cohesion: 0.13
Nodes (34): buildFnt(), BuiltFnt, Dir, buildNarc(), ByteWriter, cmd(), animationBlock(), fieldTextureTable() (+26 more)

### Community 15 - "Pokemon Cries Audio"
Cohesion: 0.08
Nodes (35): CRY_FORMS, cryBank(), renderCry(), CRY_SEQUENCE, CRY_SEQUENCES, MARKER_NAMES, SCRIPT_SOUND_ARGS, SHAYMIN (+27 more)

### Community 16 - "Game Server Setup"
Cohesion: 0.07
Nodes (27): CompanionData, createGameServer(), hostConnection(), init(), newSession(), DEV_BAG, DEV_PARTY, devStats (+19 more)

### Community 17 - "Vitest Configs & Connection Tests"
Cohesion: 0.10
Nodes (20): saveOf(), sessionOptions, setup(), createMemoryConnectionPair(), arena, enter(), save, setup() (+12 more)

### Community 18 - "Prediction & Tile Tests"
Cohesion: 0.07
Nodes (23): free, ledge, map, sessionOptions, tiles, wall, A_AT, ARENA_AREA (+15 more)

### Community 19 - "GX Display Lists"
Cohesion: 0.09
Nodes (40): apply(), assemble(), channel(), decodeDisplayList(), GxFormatError, GxTriangle, GxVertex, IDENTITY (+32 more)

### Community 20 - "Event Script Layout"
Cohesion: 0.08
Nodes (33): listNarcIndices(), EVENT_ARCHIVES, HEADBUTT_ARCHIVE, LEVEL_SCRIPT, LEVEL_SCRIPT_FIELD, NO_SCRIPT, SCRIPT_BANKS, TRAINER_CLASS_BANK (+25 more)

### Community 21 - "Battle Extraction"
Cohesion: 0.14
Nodes (36): BattleResult, extractBattle(), Failure, firstFrame(), GENDERS, MEMBER, Pixels, same() (+28 more)

### Community 22 - "Sprite Layout"
Cohesion: 0.09
Nodes (38): BATTLE_MEMBERS_PER_SPECIES, FIELD_EFFECT_ARCHIVE, FORMS_ARCHIVE, ICON_ARCHIVE, ICON_FIRST_MEMBER, ICON_FORMS, ITEM_ICON_ARCHIVE, MOVE_SCRIPT_ARCHIVE (+30 more)

### Community 23 - "Game Connection Client"
Cohesion: 0.07
Nodes (25): CompanionEvent, createGameConnection(), receive(), GameConnection, GameConnectionOptions, GameStatus, createInterpolator(), Interpolator (+17 more)

### Community 24 - "Data Layout Schemas"
Cohesion: 0.09
Nodes (26): DataLayout, FormLayout, SOULSILVER_US_LAYOUT, mapsStage, CheckArgs, Manifest, cheapReason(), outputsValid() (+18 more)

### Community 25 - "Extractor Electron Config"
Cohesion: 0.05
Nodes (40): author, description, devDependencies, electron, electron-builder, electron-updater, electron-vite, @soulsilver/extractor (+32 more)

### Community 26 - "Matrix & Grid Parsing"
Cohesion: 0.07
Nodes (24): CODE_INPUT, NARC_INPUT, MatrixFormatError, readMatrix(), chunk(), encodePng(), cached(), gcd() (+16 more)

### Community 27 - "Asset Checks"
Cohesion: 0.10
Nodes (32): randomSuffix(), AssetsCheck, checkAssets(), OutputMismatch, sizeOf(), verifyOutputs(), countFiles(), digestTree() (+24 more)

### Community 28 - "Starter & Play Requests"
Cohesion: 0.09
Nodes (26): makeStarter(), PlayRequest, buildCompanionData(), BUNDLED_COMPANION_CONTENT, buildItemsData(), ItemData, EAST, game() (+18 more)

### Community 29 - "Stage Registry"
Cohesion: 0.13
Nodes (28): createRegistry(), StageRegistryError, validate(), runPipeline(), rerun(), run(), check(), extract() (+20 more)

### Community 30 - "Audio Report CLI"
Cohesion: 0.09
Nodes (25): buildAudioReport(), collectNameRefs(), EXIT, main(), runFind(), tee(), buildEventsReport(), buildMapReport() (+17 more)

### Community 31 - "Instruments & Notes"
Cohesion: 0.10
Nodes (22): Instrument, NoteDefinition, noteForKey(), Track, Wave, Channel, Env, FRAME_RATE (+14 more)

### Community 32 - "Game Text Banks"
Cohesion: 0.07
Nodes (29): BANK, banks, bankTexts(), files, itemRecords(), moveTypes(), pokemonIcons(), records() (+21 more)

### Community 33 - "AI Content Data"
Cohesion: 0.07
Nodes (19): FILES, parse(), profileFor(), AI_FORMAT_VERSION, AiFileKind, aiSchemas, codec, parseAiFile (+11 more)

### Community 34 - "Sprite Forms & Graphics"
Cohesion: 0.10
Nodes (31): FORM_GRAPHICS, FORM_GROUPS, spritesStage, btx0(), ascii(), bgr555(), buildNcgr(), buildNclr() (+23 more)

### Community 35 - "Combat Flights"
Cohesion: 0.07
Nodes (18): Flight, Active, AIMED, Combatant, CombatantSpec, CombatInput, CombatMove, Owner (+10 more)

### Community 36 - "Item & Learnset Tests"
Cohesion: 0.11
Nodes (28): layout, inputsWithValidAbilities(), blank(), eggMoves(), evolutions(), growth(), item(), ItemInput (+20 more)

### Community 37 - "Player Movement"
Cohesion: 0.10
Nodes (32): afterMove(), arrive(), Blocker, blockers(), cellAt(), center(), counter(), destinationOf() (+24 more)

### Community 38 - "LAN Discovery"
Cohesion: 0.10
Nodes (18): broadcastAddresses(), createDiscovery(), DiscoveryOptions, HostAnnouncement, localAddresses(), SessionControllerDeps, stops, save (+10 more)

### Community 39 - "Server Host"
Cohesion: 0.08
Nodes (9): PendingListen, ServerHost, ServerProcess, FakeChild, setup(), HostToServerMessage, ServerInfo, ServerState (+1 more)

### Community 40 - "Bag UI"
Cohesion: 0.07
Nodes (19): {
    bag,
    items,
    party,
    itemName,
    speciesName,
    onUse,
    onBack,
  }, inPocket, onAction(), pocket, tab(), using, hpFraction, {
    self,
    bars,
    speciesName,
  } (+11 more)

### Community 41 - "Battle Stat Keys"
Cohesion: 0.11
Nodes (28): BATTLE_STAT_KEYS, id(), STAT_KEYS, StatKey, stats(), TEXT_CATALOGS, textRef(), codec (+20 more)

### Community 42 - "Combat Engine"
Cohesion: 0.14
Nodes (30): createCombat(), begin(), damageOf(), emit(), execute(), get(), hit(), move() (+22 more)

### Community 43 - "NDS Filesystem"
Cohesion: 0.13
Nodes (24): fatRange(), NdsFile, NdsFileSystem, NdsOverlay, readNdsFileSystem(), readOverlays(), checkHeaderCrcs(), LOGO_CRC (+16 more)

### Community 44 - "Trainers & Catchers"
Cohesion: 0.09
Nodes (12): Catcher, Trainer, Connection, HostedConnection, Learner, Replica, Player, Reserved (+4 more)

### Community 45 - "Dev Arena Entry"
Cohesion: 0.09
Nodes (15): combatOrNothing(), companionOrNothing(), devArena, itemsOrNothing(), lan, LAN_PORTS, log(), progressionOrNothing() (+7 more)

### Community 46 - "Camera Bounds"
Cohesion: 0.10
Nodes (21): Bounds, clampAxis(), clampCamera(), DS_VIEW, fillView(), OBLIQUE, obliqueProjection(), VIEW_H (+13 more)

### Community 47 - "Combat Content Data"
Cohesion: 0.08
Nodes (12): TypeChartResult, buildCombatData(), checkShape(), CombatContent, ExtractedForCombat, fail(), FILES, GENERIC (+4 more)

### Community 48 - "Map Headers"
Cohesion: 0.09
Nodes (24): ArchiveCounts, areaType(), HeaderFormatError, MAP_HEADER_COUNT, MAP_HEADER_OFFSET, MAP_HEADER_SIZE, readMapHeaders(), areas (+16 more)

### Community 49 - "Online Panel UI"
Cohesion: 0.08
Nodes (20): {
    mode,
    players,
    me,
    address,
    addresses,
    busy,
    error,
    onOpen,
    onJoin,
  }, sessions, typed, valid, address, { onJoin, onBack, error, busy }, sessions, valid (+12 more)

### Community 50 - "AI Controller"
Cohesion: 0.09
Nodes (10): Ai, createAi(), envFor(), moveView(), opponentView(), WALKABLE, enrage(), blocksSight() (+2 more)

### Community 51 - "Settings Store"
Cohesion: 0.10
Nodes (14): createSettings(), read(), set(), api, IpcChannel, LanResult, SERVER_UNAVAILABLE, SessionResult (+6 more)

### Community 52 - "Global Types"
Cohesion: 0.08
Nodes (4): ImportMeta, Window, SoulSilverApi, SaveResult

### Community 53 - "Asset Loader"
Cohesion: 0.10
Nodes (17): buffer(), buffers, decode(), index, log(), parsedCues, Pcm, pending (+9 more)

### Community 54 - "Save Slots UI"
Cohesion: 0.09
Nodes (19): tick, asking, confirmThen(), importInto(), latest, message, remove(), run() (+11 more)

### Community 55 - "Bank Format"
Cohesion: 0.16
Nodes (22): Bank, BankEntry, BankFormatError, decodeBank(), encodeBank(), pack9into15(), tableKey(), textKey() (+14 more)

### Community 56 - "Event Stage Tests"
Cohesion: 0.15
Nodes (24): fakeRom(), header(), name(), narc(), Options, stub, twelve(), read() (+16 more)

### Community 57 - "Arena & Party Reorder"
Cohesion: 0.18
Nodes (23): spawnArena(), ItemsData, reorderParty(), useItem(), createReplica(), createSession(), add(), admit() (+15 more)

### Community 58 - "Captures & Broadcast"
Cohesion: 0.15
Nodes (21): createCaptures(), addBall(), broadcast(), fly(), hit(), resolve(), sendBag(), sendDex() (+13 more)

### Community 59 - "AI States & Protocol"
Cohesion: 0.09
Nodes (21): AI_STATES, ArenaCombatant, battleStats, BUTTON, ClientMessage, CLOSE_REASONS, direction, entity (+13 more)

### Community 60 - "Session Controller"
Cohesion: 0.11
Nodes (19): close(), connect(), connectGame(), createSessionController(), announce(), end(), onMessage(), onSave() (+11 more)

### Community 61 - "Companion Content Loader"
Cohesion: 0.09
Nodes (10): CompanionContent, ExtractedForCompanion, parse(), BattleRules, CompanionFileKind, FollowRules, parseCompanionFile, largeSpeciesOf() (+2 more)

### Community 62 - "Script Command Table"
Cohesion: 0.11
Nodes (18): loadScriptTable(), readScriptTable(), ScriptTable, MOVEMENT_END, SCRIPT_TABLE_END, VAR_BASE, Decoded, decodeScriptFile() (+10 more)

### Community 63 - "SDAT Sound Format"
Cohesion: 0.17
Nodes (19): SdatFormatError, apply(), ArgOverride, BYTE_ARG, byteCommand(), commandCensus(), runCommand(), s16() (+11 more)

### Community 64 - "Combat Schemas"
Cohesion: 0.08
Nodes (21): ArchetypeRecord, BEHAVIOR_SHAPES, BEHAVIORS, chance, codec, COMBAT_FORMAT_VERSION, CombatFileKind, combatSchemas (+13 more)

### Community 65 - "Audio Decode Worker"
Cohesion: 0.11
Nodes (15): MAX_LOSS_SHARE, mb(), ReportInput, reportLines(), cryEvents, looped, Options, short() (+7 more)

### Community 66 - "AI Senses & Tuning"
Cohesion: 0.18
Nodes (21): Controller, ControllerOptions, Senses, AiTuning, SkillProfile, TemperamentRules, ScoreContext, AiEnv (+13 more)

### Community 67 - "Limits & Migration"
Cohesion: 0.10
Nodes (15): PLAYER_NAME_MAX, MigrateOptions, MigrateResult, SAVE_MIGRATIONS, SaveFailureCode, Step, SAVE_SCHEMA_VERSION, saveSchema (+7 more)

### Community 68 - "ROM Reference Validation"
Cohesion: 0.13
Nodes (20): HEADER_CHECK_SIZE, REFERENCE_ROM_SHA1, ARCHIVES, readHead(), REGIONS, reject(), sanitizeTitle(), sha1File() (+12 more)

### Community 69 - "Audio Rendering Tests"
Cohesion: 0.16
Nodes (17): SINE, source(), bank, seq, swar, fakeWorkspace(), buildSbnk(), buildSdat() (+9 more)

### Community 70 - "Companion Reactions"
Cohesion: 0.12
Nodes (19): interact(), pickReaction(), placeOf(), ReactionContext, timeOfDay(), codec, COMPANION_FORMAT_VERSION, companionSchemas (+11 more)

### Community 71 - "Shared Package Config"
Cohesion: 0.08
Nodes (24): dependencies, zod, exports, ./ai, ./audio, ./combat, ./companion, ./events (+16 more)

### Community 72 - "Text Catalog"
Cohesion: 0.16
Nodes (14): createTextCatalog(), resolveNameRef(), TextCatalog, TextLookup, textsOf(), UnknownTextError, validateTranslation(), variablesOf() (+6 more)

### Community 73 - "Save Store"
Cohesion: 0.14
Nodes (18): createSaveStore(), load(), summary(), write(), fail(), LoadResult, Read, readSave() (+10 more)

### Community 74 - "Audio Engine"
Cohesion: 0.11
Nodes (15): ctx, effectsBus, focused, listener, master, musicBus, Playing, voice() (+7 more)

### Community 75 - "Game Renderer"
Cohesion: 0.15
Nodes (23): createGameRenderer(), destroyVisual(), drawEffects(), drawEntity(), drawParticles(), drop(), enterArea(), frameFor() (+15 more)

### Community 76 - "World Map"
Cohesion: 0.13
Nodes (20): BLOCKED, insideMap(), neighborAt(), origin(), ownTile(), tileAt(), WorldNeighbor, WorldWarp (+12 more)

### Community 77 - "Update Controller"
Cohesion: 0.12
Nodes (9): createUpdateController(), setState(), TERMINAL, UpdateController, UpdateControllerOptions, Updater, FakeUpdater, setup() (+1 more)

### Community 78 - "Cry Audio Schemas"
Cohesion: 0.12
Nodes (20): cryOf(), read(), AudioFileKind, channels, codec, Cry, cryFile(), loop (+12 more)

### Community 79 - "BLZ Decompression"
Cohesion: 0.15
Nodes (13): BlzFormatError, decompressBlz(), decompressArm9(), decompressOverlay(), indexOfBytes(), MODULE_PARAMS_MAGIC, OverlayEntry, readOverlayTable() (+5 more)

### Community 80 - "Companions & Targeting"
Cohesion: 0.22
Nodes (17): canHarm(), createCompanions(), blackout(), endCombat(), follow(), keepHp(), place(), removeCompanion() (+9 more)

### Community 81 - "AI Move Scoring"
Cohesion: 0.23
Nodes (17): pickWeighted(), scoreMoves(), effectiveness(), EMBER, env(), FILES, foe(), profile() (+9 more)

### Community 82 - "Game Data Schema Tests"
Cohesion: 0.11
Nodes (19): parseGameDataFile, check(), expectPath(), file(), Json, move, species, TARGETS (+11 more)

### Community 83 - "Extractor Host Entry"
Cohesion: 0.18
Nodes (15): abort, extract(), finish(), send(), validateAndCopy(), createConsoleLogger(), createFileLogger(), createLogger() (+7 more)

### Community 84 - "Dialog Formatting"
Cohesion: 0.20
Nodes (17): dialogTest(), TranslationProblem, formatText(), keyOf(), screenText(), TextFormatError, TextValues, textVariables() (+9 more)

### Community 85 - "Wild Encounter Spawns"
Cohesion: 0.18
Nodes (17): createWilds(), areaOf(), remove(), trySpawn(), slots(), Rng, pickCell(), rollLevel() (+9 more)

### Community 86 - "Event Schemas"
Cohesion: 0.09
Nodes (21): argWhen, codec, command, coverage, encounter, EncountersFile, EventsFileKind, headbutt (+13 more)

### Community 87 - "Client Package Config"
Cohesion: 0.10
Nodes (20): dependencies, @soulsilver/shared, svelte, three, devDependencies, @soulsilver/server, svelte-check, @sveltejs/vite-plugin-svelte (+12 more)

### Community 88 - "Audio Cues & Reactions"
Cohesion: 0.13
Nodes (12): cues, archetypeOf, AudioReactionsOptions, createAudioReactions(), updateMusic(), effectNames(), SHAKE_MS, moveSound() (+4 more)

### Community 89 - "Map Mesh Builder"
Cohesion: 0.12
Nodes (11): buildMapMesh(), MapMesh, SceneInput, SceneTriangle, grass, image(), water, water2 (+3 more)

### Community 90 - "AI Controller Core"
Cohesion: 0.22
Nodes (18): AiStateName, createController(), dist(), Plan, stepController(), StepResult, ticks(), toward() (+10 more)

### Community 91 - "Events Report"
Cohesion: 0.14
Nodes (13): ascending(), buildEventsReportFile(), EventsReportResult, MAX_LOSS_SHARE, ReportInput, reportLines(), ScriptFileResult, build() (+5 more)

### Community 92 - "Dialog Queue"
Cohesion: 0.14
Nodes (12): createDialogQueue(), push(), DialogQueue, DialogView, Entry, choose(), onAction(), { queue } (+4 more)

### Community 93 - "Personal Data Reader"
Cohesion: 0.12
Nodes (10): gender(), readPersonal(), hex(), readNatures(), readTypeChart(), Tenths, EGG_GROUP_KEYS, GrowthRateRecord (+2 more)

### Community 94 - "NITRO Format"
Cohesion: 0.20
Nodes (14): DictionaryEntry, NitroFormatError, readNitroBlocks(), BITS, decodeTexture(), five(), readTextureSet(), TextureFormatError (+6 more)

### Community 95 - "Manifest & Hex Utils"
Cohesion: 0.23
Nodes (16): count(), date(), Fields, hex(), Invalid, join2(), MANIFEST_FILE, parseManifest() (+8 more)

### Community 96 - "Title Screen Extraction"
Cohesion: 0.15
Nodes (14): decompressLz10(), Lz10FormatError, five(), renderScreen(), extractTitle(), TITLE_ARCHIVE, TITLE_LAYERS, titleStage (+6 more)

### Community 97 - "Status Effects"
Cohesion: 0.16
Nodes (17): hurt(), inflict(), resolve(), StatusId, StatusRecord, canApply(), startStatus(), StatusState (+9 more)

### Community 98 - "Asset Protocol & Navigation Guard"
Cohesion: 0.21
Nodes (10): ASSETS_SCHEME, resolveAssetPath(), createMainWindow(), isAllowedNavigation(), permissionRequestHandler(), windowOpenHandler(), createWindowOptions(), root (+2 more)

### Community 99 - "Move & Party Panels"
Cohesion: 0.13
Nodes (11): longest, num(), ring(), {
    self,
    lead,
    moveName,
    moveType,
  }, SLOTS, {
    party,
    out,
    speciesName,
  }, SLOTS, hpColor() (+3 more)

### Community 100 - "Combat Feedback FX"
Cohesion: 0.15
Nodes (12): COLORS, FeedbackLine, feedbackLines(), FeedbackTexts, SPECIES_BANK, TEXT, base, BATTLE (+4 more)

### Community 101 - "Particles"
Cohesion: 0.17
Nodes (12): createParticles(), emit(), spawn(), effectsOf(), lerp(), Particle, ParticleFrame, Point3 (+4 more)

### Community 102 - "Evolution Data"
Cohesion: 0.16
Nodes (12): condition(), Evolution, ITEM, LEVEL, NONE, readEvolutions(), EVOLUTION_METHODS, EvolutionCondition (+4 more)

### Community 103 - "Audio Viewer Page"
Cohesion: 0.12
Nodes (16): Audio viewer page, decodeWav, draw waveform, entries, start playback, buildMap, buildOverlay collision overlay, frameView (+8 more)

### Community 104 - "Recorder & Replay"
Cohesion: 0.17
Nodes (11): createRecorder(), replay(), options(), record(), replayed(), WORLD, Recording, RecordingEvent (+3 more)

### Community 105 - "Markup Text Format"
Cohesion: 0.18
Nodes (13): canonicalInt(), ESCAPE_TEXT(), MarkupError, NAMED_COMMAND_IDS, readCommand(), serializeMarkup(), SIMPLE, BY_COMMAND (+5 more)

### Community 106 - "WebSocket Listener"
Cohesion: 0.18
Nodes (9): createWsListener(), accept(), rawText(), REMOTE_CONN_BASE, WsListenerOptions, host(), clients, setup() (+1 more)

### Community 107 - "Client Audio & Settings UI"
Cohesion: 0.16
Nodes (10): audio, playTitleMusic(), nudge(), { onControls, onBack }, VOLUMES, apply(), currentSettings(), loadSettings() (+2 more)

### Community 108 - "Grass Clearing & Map Objects"
Cohesion: 0.18
Nodes (14): CLEARING_RADIUS_PX, clearings(), fighting(), MAX_CLEARINGS, buildMapObject(), clearGrass(), grassClearings, grassTexture() (+6 more)

### Community 109 - "Encounter Data"
Cohesion: 0.17
Nodes (9): levelSlots(), readEncounter(), readHeadbutt(), slot(), splitSpecies(), SLOT_CHANCES, EncounterSlot, HeadbuttRecord (+1 more)

### Community 110 - "Charmap Text"
Cohesion: 0.21
Nodes (13): BY_CHAR, BY_CODE, CHARMAP, charToCode(), codeToChar(), hex4(), isVariableRange(), LAYOUT (+5 more)

### Community 111 - "Game Data Parse"
Cohesion: 0.16
Nodes (14): fileSchema(), createGameDataCodec(), parseGameDataFile(), parseGameDataJson(), serializeGameDataFile(), describe(), Described, GameDataError (+6 more)

### Community 112 - "Item Data"
Cohesion: 0.14
Nodes (13): byte, ItemRecord, itemsFile, PocketKey, hpRestore(), RESTORE_HP, REVIVE, ANTIDOTE (+5 more)

### Community 113 - "Map Mesh Schemas"
Cohesion: 0.16
Nodes (14): zod, s16(), s32(), u16(), GAME_DATA_FORMAT_VERSION, int(), meshFrame, pair (+6 more)

### Community 114 - "Bot Steering & Aim"
Cohesion: 0.22
Nodes (10): bot(), aimAt(), CONTACT, eightWay(), preferredRange(), steer(), threatened(), unit() (+2 more)

### Community 115 - "AI Perception & Sight"
Cohesion: 0.19
Nodes (9): rotate(), Memory, perceive(), remember(), inCone(), Point, SightBlocker, MAP_TILE_PX (+1 more)

### Community 116 - "Collision Categories"
Cohesion: 0.14
Nodes (10): BEHAVIORS, classifyPermission(), CollisionCategory, LedgeDirection, area, east, free, maps (+2 more)

### Community 117 - "Server Host Handlers"
Cohesion: 0.25
Nodes (7): createServerHost(), handleExit(), handleMessage(), settle(), settleListen(), PendingRequest, ServerHostOptions

### Community 118 - "Battle Effects"
Cohesion: 0.32
Nodes (11): extractBattleFx(), placement(), scriptEmitters(), STATUS_EFFECTS, BLOCKS, mirror(), readSpaEmitters(), readSpaTextures() (+3 more)

### Community 119 - "Event Command Tests"
Cohesion: 0.16
Nodes (6): encounter(), member(), parse(), ref, slot(), trainer()

### Community 120 - "Arena Setup UI"
Cohesion: 0.19
Nodes (10): a, b, bank(), combatant(), moveIds(), names, { onStart, onBack, busy }, Side (+2 more)

### Community 121 - "Client Prediction"
Cohesion: 0.23
Nodes (6): createPredictor(), Predictor, SNAP_PX, TICK_MS, me(), started()

### Community 122 - "Client Map Loading"
Cohesion: 0.28
Nodes (10): ClientWorld, createClientWorld(), load(), fetchJson(), fetchMap(), fetchWarps(), mapDir(), padded() (+2 more)

### Community 123 - "Extractor Package Config"
Cohesion: 0.15
Nodes (12): dependencies, @soulsilver/shared, devDependencies, three, exports, @soulsilver/shared, three, name (+4 more)

### Community 124 - "ROM Unpack Tests"
Cohesion: 0.17
Nodes (11): arm7, arm9, banner, files, m0, m1, out(), overlays7 (+3 more)

### Community 125 - "Animation Tracks"
Cohesion: 0.15
Nodes (5): number, pattern, rotationTrack, scroll, track

### Community 126 - "Remote Connection"
Cohesion: 0.23
Nodes (5): createRemoteClient(), playerName, RemoteClient, hello, parseAddress()

### Community 127 - "Move Data"
Cohesion: 0.20
Nodes (6): TARGETS, byte, MOVE_CATEGORY_KEYS, MOVE_TARGET_KEYS, movesFile, MoveTargetKey

### Community 128 - "Server Host Protocol"
Cohesion: 0.45
Nodes (9): Fields, isCount(), isHostToServerMessage(), isNonEmptyString(), isRecord(), isServerInfo(), isServerStatus(), isServerToHostMessage() (+1 more)

### Community 129 - "Server Package Config"
Cohesion: 0.20
Nodes (9): dependencies, @soulsilver/shared, exports, @soulsilver/shared, name, private, scripts, typecheck (+1 more)

### Community 130 - "Trail Following"
Cohesion: 0.38
Nodes (8): behind(), heading(), length(), poseAt(), pushPose(), STEP, at(), walk()

### Community 131 - "Client TS Config"
Cohesion: 0.22
Nodes (8): compilerOptions, allowImportingTsExtensions, lib, resolveJsonModule, types, extends, include, ../../tsconfig.base.json

### Community 132 - "App TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, allowImportingTsExtensions, resolveJsonModule, types, extends, include, ../../tsconfig.base.json

### Community 133 - "Combat Coverage Scripts"
Cohesion: 0.25
Nodes (4): BUNDLED_COMBAT_CONTENT, coverage, hasExtraction, STAGES

### Community 134 - "World Map Loading"
Cohesion: 0.46
Nodes (8): read(), loadWorld(), load(), warpCount(), warpsOf(), padded(), readMap(), parseEventsJson

### Community 135 - "Server TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, allowImportingTsExtensions, resolveJsonModule, types, extends, include, ../../tsconfig.base.json

### Community 136 - "Hitbox Segments"
Cohesion: 0.43
Nodes (5): overlaps(), segmentDistance(), segmentHits(), east, o

### Community 137 - "Extractor TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, allowImportingTsExtensions, types, extends, include, ../../tsconfig.base.json

### Community 138 - "Cooldown Tuning"
Cohesion: 0.38
Nodes (5): baseCooldownS(), speedScale(), CombatTuning, COOLDOWN, SPEED

### Community 139 - "Text IDs"
Cohesion: 0.43
Nodes (5): BANK_BY_NAME, ParsedTextId, parseTextId(), TEXT_BANK_NAMES, TEXT_REF_BANKS

### Community 140 - "ADPCM Audio Tests"
Cohesion: 0.62
Nodes (5): ascii(), chunk(), u16(), u32(), wav()

### Community 141 - "Type Chart"
Cohesion: 0.38
Nodes (5): GEN4_CHART, Name, rows, T, EXTRACTED

### Community 142 - "Shared TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, allowImportingTsExtensions, types, extends, include, ../../tsconfig.base.json

### Community 145 - "Synthetic Test Fixtures"
Cohesion: 0.40
Nodes (5): Synthetic game data fixtures, BLZ encoder for tests, Synthetic test fixtures convention, buildNarc, buildNdsRom

## Knowledge Gaps
- **36 isolated node(s):** `@soulsilver/extractor`, `@soulsilver/server`, `@soulsilver/shared`, `@sveltejs/vite-plugin-svelte`, `@types/ws` (+31 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1429 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `zod` connect `Map Mesh Schemas` to `Input Glyphs & Focus`, `PNG Sprite Packing`, `Wild Content Loader`, `AI Content Data`, `LAN Discovery`, `Battle Stat Keys`, `Asset Loader`, `AI States & Protocol`, `Combat Schemas`, `Limits & Migration`, `Companion Reactions`, `Shared Package Config`, `Cry Audio Schemas`, `Dialog Formatting`, `Event Schemas`, `Evolution Data`, `Recorder & Replay`, `Game Data Parse`, `Item Data`, `Animation Tracks`, `Move Data`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `@soulsilver/extractor`, `@soulsilver/server`, `@soulsilver/shared` to the rest of the system?**
  _36 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI Content & Test Worlds` be split into smaller, more focused modules?**
  _Cohesion score 0.06526315789473684 - nodes in this community are weakly interconnected._
- **Why does `SoulSilverApi` connect `Global Types` to `Assets Controller`, `Settings Store`, `Update Controller`, `Server Host`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Should `Assets Controller` be split into smaller, more focused modules?**
  _Cohesion score 0.055135135135135134 - nodes in this community are weakly interconnected._
- **Why does `createGameRenderer()` connect `Game Renderer` to `Game Session UI`, `Particles`, `PNG Sprite Packing`, `Grass Clearing & Map Objects`, `World Map`, `Camera Bounds`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Should `Game Session UI` be split into smaller, more focused modules?**
  _Cohesion score 0.030060882800608826 - nodes in this community are weakly interconnected._