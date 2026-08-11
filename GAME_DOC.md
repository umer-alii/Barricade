# Barricade — Complete Game & Codebase Documentation

> Purpose: give an LLM (or new developer) full context on what this project is, how the code
> is organized, the exact game semantics, and the current state of every subsystem.

---

## 1. What this is

**Barricade** is a web implementation of the board game **Quoridor**: a 9×9 grid where two
players race their pawn to the opposite side while placing walls ("barricades") to slow the
opponent down. Vanilla JavaScript (ES modules), no framework, no build step. Serverless API
routes (Vercel-style) power online multiplayer.

### Rules implemented
- 9×9 board. Player 1 (**Red**) starts at `e1` (col 4, row 0) and must reach **row 9** (index 8).
  Player 2 (**Blue**) starts at `e9` (col 4, row 8) and must reach **row 1** (index 0).
- Each player has **10 walls**. A wall spans **2 cells** and sits in the gap between cells.
- Pawns move 1 step orthogonally. If the opponent's pawn is adjacent, you may **jump straight
  over** it; if the straight landing square is walled off or off-board, **diagonal jumps**
  (landing beside the opponent) become legal instead (`src/players/JumpRules.js`).
- Walls may not overlap or cross, and may never fully block either player's path to their
  goal (validated with BFS — `src/walls/WallValidator.js`).
- First pawn to reach its goal row wins. Games can also end by **resignation** or **timeout**
  (online, when a time control is set).

---

## 2. Running the project

```bash
npm install
npm run dev     # node scripts/dev-server.js → http://localhost:3000
```

- `npm run dev` serves static files AND mounts the `api/` routes locally.
- `npm run dev` uses `vercel dev` instead (emulates Vercel platform).
- No build/transpile step: the browser loads `src/main.js` as an ES module from `index.html`.

Test scripts (plain Node, run from project root):

| Script | Purpose |
|---|---|
| `node scratch/verify.js` | Core mechanics suite: notation, BFS, jumps, wall validation, bot sanity, tactical safety nets |
| `node scratch/test_puzzles.js` | Validates 60 days of generated daily puzzles have verified-unique solutions |
| `node scratch/bot_matchup.js <diffA> <diffB> <games>` | Bot self-play matchups (e.g. `hard medium 2`) |

---

## 3. Coordinate system & notation (critical)

Defined in `src/utils/Coordinates.js` and `src/utils/Constants.js`.

- Internal coordinates are 0-indexed: `col` 0–8 (columns **a–i**), `row` 0–8 (rows **1–9**,
  bottom to top from Red's perspective).
- **Cell notation**: 2 chars — `e4` = col 4, row 3.
- **Wall notation**: 3 chars — orientation + cell, e.g. `hh8` = horizontal wall at col 7, row 7;
  `vg5` = vertical wall at col 6, row 4. Wall coords range 0–7 on both axes.
- **Wall semantics** (must match `src/pathfinding/BFS.js` `getValidNeighborsFast`):
  - Horizontal wall at `(col,row)` lies **between rows `row` and `row+1`**, spanning
    **columns `col` and `col+1`**. It blocks vertical movement for those two columns.
  - Vertical wall at `(col,row)` lies **between columns `col` and `col+1`**, spanning
    **rows `row` and `row+1`**. It blocks horizontal movement for those two rows.
- Wall overlap rules: two H-walls conflict if same `row` and `|colA − colB| < 2`; two V-walls
  conflict if same `col` and `|rowA − rowB| < 2`; an H and V wall **cross** if identical `(col,row)`.
- History is a flat array of notation strings; even indices are Player 0's moves, odd are Player 1's.

---

## 4. File map

```
index.html                 Single page: lobby screen + game screen + all modals
styles/style.css           All styling (~3000 lines), responsive breakpoints, animations
src/main.js                Entry point — instantiates Game

src/game/
  Game.js                  ★ Central controller (~2300 lines). Lobby, modes, turns, UI sync,
                           online sync, puzzles, persistence, bot triggering. Almost every
                           feature routes through this class.
  GameState.js             State model: players, walls, history, winner, mode, clock fields,
                           endReason/resignedBy. serialize()/deserialize()/applyServerState().
  TurnManager.js           commitAction(state, notation): appends history, checks winner,
                           switches player, returns winner|null.

src/board/
  Renderer.js              Builds the DOM grid (18×18 CSS grid tracks: cells + gaps),
                           renders pawns/walls/highlights, last-move markers, disabled state.
  Board.js, Cell.js        Thin board model helpers.

src/players/
  Player.js                Pawn model: col,row,walls; moveTo(); useWall().
  Movement.js              getLegalMoves(player, opponent, hWalls, vWalls) incl. jumps.
  JumpRules.js             Straight jump; diagonals when straight is blocked/off-board.
  Bot.js                   ★ AI engine (see §6).

src/pathfinding/BFS.js     hasPath, getShortestPath, getShortestDistanceFast(pos, goalRow,
                           hSet, vSet) — wall Sets keyed "col,row".

src/walls/
  WallValidator.js         validateWall(col,row,o,players,hW,vW) → {isValid,message}.
                           Checks bounds, overlap, cross, and path existence for both players.
  Wall.js, WallManager.js  Wall model helpers.

src/input/
  MouseController.js       Hover previews + click-to-place walls, click-to-move pawn.
                           Pawn move on a highlighted cell takes priority over wall placement.
  DragController.js        HTML5 drag & drop of wall templates from sidebar.
  WallSnap.js              Shared snapping: snap targets live in the GAPS between cells;
                           suggestions never appear while the cursor is inside a cell box.
                           Sticky hysteresis to prevent flicker. MAX_SNAP_DISTANCE=42.

src/ui/
  Sidebar.js               Player cards (turn highlight, wall counts, clocks), buttons.
  MoveHistory.js           Turn-paired history rows; auto-scroll; latest-move highlight.
  DragPreview.js           Ghost wall preview element (valid=green / invalid=red styling).
  Toast.js                 Transient notifications.

src/puzzle/
  PuzzleGenerator.js       ★ Daily tactical puzzle generation (see §7).
  PuzzleEngine.js          applyNotationMove(), replayHistory() helpers.
  PuzzleProgress.js        localStorage progress per date/puzzle (attempts/solved/gaveUp).

src/network/RoomClient.js  Online client: create/join/poll/action/reconnect. Polls every
                           800ms. Session persisted in sessionStorage (code/token/index).

src/utils/
  Constants.js             BOARD_SIZE=9, INITIAL_WALL_COUNT=10, STARTING_POSITIONS,
                           GOAL_ROWS {0:8, 1:0}, PLAYER_COLORS, WALL_ORIENTATIONS, toasts.
  Coordinates.js           Notation converters (see §3).
  timeControl.js           Client copy of clock helpers (formatClock, getDisplayClocks…).
  Helpers.js               Misc.

api/                       Serverless endpoints (also served by scripts/dev-server.js)
  rooms/create.js          POST create room {playerName,timeControl,mode,isPrivate}
  rooms/join.js            POST join by code → starts game, creates initial gameState
  rooms/poll.js            GET state (heartbeat, disconnect detection, timeout check)
  rooms/action.js          POST {token, action:{type:'move'|'wall'|'resign'|'rematch',…}}
  rooms/list.js            GET open rooms for the lobby table
  rooms/info.js            GET room metadata (join confirmation)
  rooms/delete.js          POST cancel/leave room
  lib/gameActions.js       Server-side action validation/application (reuses src/ modules)
  lib/roomUtils.js         Room/token/gameState factories
  lib/roomStore.js         Upstash Redis in prod; in-memory + .dev-room-store.json locally
  lib/timeControl.js       Server clock logic (see §8)

scripts/dev-server.js      Local static + API server on :3000
scratch/                   Test & verification scripts (not shipped)
```

---

## 5. Game modes & flow

`Game.js` drives everything. `gameState.gameMode` ∈ `'local' | 'ai' | 'online' | 'puzzle'`.

- **Lobby screen** (`#lobby-screen`): quick-play buttons, vs-Computer modal (difficulty +
  side), create/join room cards, open-rooms table (polled every 3s), daily puzzle card,
  stats, **live leaderboard** (Supabase `profiles` by Elo, paginated, realtime), nickname
  (guest) or account profile (signed in), friends card, chat drawer.
- **Local**: two humans alternate on one device.
- **vs Computer (`ai`)**: human side = `humanPlayerIndex`; bot difficulty ∈
  `easy | medium | hard | expert` (UI value; code also accepts legacy `professional` ≡ expert).
  Bot turns run via `triggerBotMove()` → random 650–1100 ms "thinking" pause (with an
  animated *thinking…* indicator on the bot's card) → synchronous `getBestMove()`.
  **Undo** (AI mode only) reverts exactly 1 ply.
- **Online**: see §8.
- **Puzzle**: see §7.

Turn pipeline (local/ai): `moveActivePlayer()` / `placeWall()` → validate → mutate state →
`TurnManager.commitAction()` → `updateUI()` → `saveStateToStorage()` → if winner,
`_scheduleWinner()` (700 ms delay so the final move animation is visible; resign/timeout
modals show immediately).

`updateUI()` responsibilities: pawns, walls, legal-move highlights (only on the local
player's turn), **last-move indicator** (amber ring on last pawn destination OR glow on the
newest wall, parsed from the last history entry), player-card labels ("You" / "Bot · Hard" /
"Opponent"), wall counts, clocks, history render, undo visibility, bot triggering.

---

## 6. Bot AI (`src/players/Bot.js`)

Entry: `getBestMove(gameState)` — reads `gameState.botDifficulty`.

| Difficulty | Strategy |
|---|---|
| `easy` | Deliberately weak: 15% random anything, 30% random wall, else wanders toward goal |
| `medium` | Greedy 1-ply: maximizes `oppDist − selfDist` over all pawn moves + all walls |
| `hard` | Iterative-deepening negamax, **depth ≤ 8, ~1.5 s** budget |
| `expert` | Same engine, **depth ≤ 14, ~2.8 s**, richer eval, **exclusive exact endgame solver** |

Shared engine features (hard/expert):
- **Tactical safety net** before search: always take an immediate win; if the opponent
  threatens to win next turn, restrict root moves to verified-safe replies.
- **Root wall candidates**: walls ranked by `gain (opp path increase) − 1.2 × cost (own path
  increase)`, filter `gain ≥ 1 && score > 0`, top 16. The **in-tree wall pool is the union
  of both players' best walls** so opponent blocking walls are modeled.
- **Search**: negamax + alpha-beta + PVS, transposition table (exact/lower/upper flags),
  killer moves (frequency-weighted), global history heuristic, move ordering, one-ply
  extension after high-diversion walls, near-leaf wall pruning.
- **Root**: alpha-beta window narrowing; results of *partial* (timed-out) iterations are
  discarded; root moves re-sorted by previous iteration's scores; root move list is
  **shuffled first** (stable sort ⇒ genuinely tied moves vary game-to-game → opening variety).
- **Anti-oscillation**: penalty for returning to recently visited cells.
- **Eval**: `10·(oppDist−selfDist) + 1·(selfWalls−oppWalls) + 0.1·mobility + w4·diversion +
  disjoint-route term (expert) + small center bonuses`.
- **Exact endgame solver** (expert only): when both players have 0 walls, a perfect negamax
  race solver takes over.

Verified via self-play (`scratch/bot_matchup.js`): hard 2–0 medium; expert 2–0 medium;
expert vs hard is first-player-wins at equal strength ceilings, with expert converting faster
and owning the endgame.

---

## 7. Daily puzzle system

**`src/puzzle/PuzzleGenerator.js`** — 3 puzzles per day, seeded by date string (same for all
players). Every puzzle is a constructed tactical **scenario with a programmatically verified
UNIQUE solution** (no random-move positions):

| # | type | Badge | Scenario | Verifier |
|---|---|---|---|---|
| 0 | `win` | Win in 1 | Exactly one move reaches row 8 (straight or diagonal **jump** finish) | enumerate legal moves, exactly 1 lands on goal |
| 1 | `block` | Only Defense | Blue wins next move; exactly one reply (a wall) prevents it | enumerate ALL pawn moves + ALL 128 wall placements; exactly 1 is safe |
| 2 | `race` | Win the Race | No walls in hand; exactly one move (jump shortcut) wins the pure race | BFS distances, `redDistAfter < blueDist`, exactly 1 winner |

Positions get "dressing walls" (validated, path-preserving) for a midgame look; verification
runs **after** dressing; generation retries (≤80 seeds) then falls back to hand-authored
puzzles. Puzzle object: `{id, puzzleDate, puzzleIndex, sideToMove:0, type, title, prompt,
setup:{players[2]{col,row,walls}, horizontalWalls, verticalWalls}, bestMove}`.

Flow in `Game.js`: `launchDailyPuzzles()` → `puzzleSession {puzzles, currentIndex, solved,
gaveUp, locked, showingSolution}` → `loadPuzzleAtIndex()` builds the board from `setup`.
`handlePuzzleMove(notation)` compares against `bestMove` exactly (fair because uniqueness is
verified). Wrong → feedback + retry; correct → move applied, locked, progress recorded.
"Show Solution" applies the solution on the board (marked by last-move highlight) and records
`gaveUp`. Progress lives in localStorage via `PuzzleProgress.js`.

Puzzle sidebar panel (`#puzzle-sidebar-panel`): gradient accent strip, colored type badge
(`data-type` = win/block/race), progress dots (solved/failed/current), scenario prompt,
attempts, actions. Solution is never shown before give-up.

**Refresh behavior**: puzzle sessions persist to localStorage and restore fully on refresh
(`_restorePuzzleFromSaved`). Puzzles regenerate deterministically from the saved date.

---

## 8. Online multiplayer

**Protocol**: REST + polling (no websockets).
- `RoomClient` polls `GET /api/rooms/poll?code&token` every **800 ms**; server bumps
  heartbeat (`lastSeen`), flags opponent disconnect after 30 s silence, and applies
  clock-timeout wins.
- Actions: `POST /api/rooms/action` `{token, action}`; server validates with
  `server/gameActions.js` (same logic modules as the client — moves, jumps, walls, path
  checks) and increments `version`. Client applies authoritative `gameState` via
  `GameState.applyServerState()`.
- Rooms live in Upstash Redis (prod) or in-memory + `.dev-room-store.json` (dev).
- Session (`code/token/playerIndex`) is stored in **sessionStorage**; on refresh
  `tryReconnectOnline()` re-enters the room server-side. Online games are **never** restored
  from localStorage (stale-state bugs); if not connected, Resign/Leave falls back to lobby.
- **Rematch**: both players must request; server resets `gameState`.
- **Game end**: server sets `gameState.endReason` (`'resign' | 'timeout' | null`) and
  `resignedBy`, so the client win modal shows the right message ("You resigned", "Opponent
  resigned", "Time out", or plain goal win).

**Time control** (`server/timeControl.js`, mirrored client-side in `src/utils/timeControl.js`):
- Strings like `"15+10 (Rapid)"` (base minutes + increment seconds) or `"Unlimited"`.
- Clock state on gameState: `{timeControl, timeControlLabel, isUnlimited, incrementMs,
  clocks:[ms,ms], lastMoveAt}`. `applyMoveClock` deducts elapsed, adds increment;
  `checkTimeout` (run during poll) awards the win to the other player at 0.
- Client ticks the display every 200 ms (`startClockTick`).

---

## 9. Persistence & storage keys

| Key | Store | Contents |
|---|---|---|
| `barricade_game_state_v1` | localStorage | Serialized gameState for **local/ai/puzzle** matches (+ `puzzleSession` meta). Online is intentionally excluded. |
| `barricade_theme_v1` | localStorage | `'light' | 'dark'` |
| `barricade_room_code/_player_token/_player_index` | sessionStorage | Online reconnect session |
| Puzzle progress (see PuzzleProgress.js) | localStorage | attempts/solved/gaveUp per date+id |
| Stats & nickname | localStorage | win/loss record, player name — **guest view only when signed in**; a Supabase `profiles` row is the source of truth for accounts (local stats migrate into it once at first profile creation; `barricade_stats_migrated_v1` marks it done) |

Refresh matrix: local/ai → restored from localStorage; puzzle → fully restored (board +
session + locked/solved state); online → reconnect via session token only; finished games are
cleared on win-modal display.

---

## 10. Rendering & input details

- The board is one CSS grid with **18×18 tracks** (alternating `--cell-size` and `--gap-size`
  clamps + label track). Cells sit on odd tracks; walls/gaps on even tracks. Grid rows are
  reversed (row index 8 renders at top for Red-at-bottom orientation); the whole grid gets
  `.flipped` (180° rotation) when the human plays as Player 2 in ai/online/puzzle modes.
- Walls render as absolutely-gridded divs spanning 3 tracks (2 cells + gap), colored by
  `placedBy` (`wall-p0` red / `wall-p1` blue).
- Wall placement UX: hover (MouseController) or drag (DragController) → `WallSnap.resolve()`
  → ghost preview (green valid / red invalid) → click/drop places. Snap targets are the gap
  intersections; **no suggestions while the cursor is inside a cell box**.
- Animations: pawn `tokenMove` 0.55s, wall `wallPlace` 0.45s, win/confirm modals `modalPop`,
  lobby/game entrance fades, thinking-dots pulse. `body.in-game` locks page scroll.
- Responsive: breakpoints restack sidebar/board below ~1100px; cell/gap sizes are `clamp()`ed.

---

## 11. Current state / recent session changes (August 2026)

1. **Bot overhaul** (this is the current engine, described in §6) — root alpha-beta,
   ordering fix, timeout-safe iterations, opponent-wall modeling, expert-only endgame solver,
   opening variety. Difficulty ladder verified by self-play.
2. **Puzzle system rewritten** — previously random-move positions with "bot's choice" as the
   answer; now constructed scenarios with verified unique solutions (§7) + premium panel UI.
3. **Pacing polish** — bot think delay + indicator, delayed win modal, slower animations,
   last-move indicators, mode-aware player card names, history highlight fix.
4. **Online correctness** — `endReason/resignedBy` on the server so resign vs timeout modals
   are accurate; online state excluded from localStorage restore; resign/leave when
   disconnected returns to lobby instead of erroring ("Not connected to a room" fix).
5. **Wall snap** — suggestions restricted to outside cell boxes; original generous snap
   distance kept in the gaps.
6. **Accounts / social / ranking (Supabase)** — persistent accounts (email + Google/Discord
   OAuth), unique `username` + short `player_id`, friends (add by player ID, realtime),
   1:1 + in-room chat (realtime, 500-char cap, pluggable profanity filter), real ranked mode
   (both players signed in; server-side atomic Elo settlement K=32 via
   `settle_ranked_match()` triggered from `action.js`/`poll.js`; `matches` +
   `rating_history` tables), live paginated leaderboard with derived tiers. The static
   leaderboard demo data was removed and `ranked` is no longer a label-only mode. Redis room
   store unchanged — rooms just carry verified `userId`s. All features degrade gracefully
   when `src/config/supabaseConfig.js` is empty. See `docs/ACCOUNTS_SETUP.md` +
   `supabase/schema.sql`.
7. Known minor items: touch devices can't drag walls (HTML5 DnD limitation); `Bot.js`
   accepts the legacy `professional` difficulty string as an alias for `expert`.

---

## 12. Conventions for making changes

- Plain ES modules, no TypeScript, no bundler — keep imports relative with `.js` extensions.
- Client and server share logic: any rules change must stay consistent between `src/` and
  `server/gameActions.js`.
- After changes run: `node scratch/verify.js` (mechanics) and `node scratch/test_puzzles.js`
  (puzzles). For bot changes, `node scratch/bot_matchup.js hard medium 2` is a fast ladder check.
- The state that is saved/restored must round-trip through `GameState.serialize()` /
  `deserialize()` — add new fields in both plus `applyServerState()` when server-synced.
