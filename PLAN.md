# count-grouping app plan (tablet game: Team Gear Bundles)

## 0) Goal + scope
Build a new app at `apps/count-grouping/` that matches the existing Vite + React structure of `apps/clocks` and `apps/soccer-spacing`. The app is a tablet-friendly drag-and-drop game where kids bundle soccer balls and basketballs into groups of 5 (mesh bags) and 10 (ball carts). Core learning outcomes: counting by 5s and 10s, grouping, and simple regrouping (two 5s -> one 10).

Scope must include:
- Free Play mode ("Pack the Gym")
- Coach Challenges mode with the 20 prompts listed below
- Level progression (1-5) with unlocks, container availability, and trading
- Main play screen UI: ball pile, bag/cart containers, bundle shelf, control bar, target panel
- Hint, Undo, Check
- Counting display that can be always-visible or hidden until Check (per level config)

Optional/Stretch (include in plan as optional toggles, but implement if time permits):
- Mini-game: "Fast Break Countdown" (gentle timer)
- Level 6 two-sport challenges (explicitly deferred in v1)
- Skip-count tapping audio using speechSynthesis (use visual only in v1)
- Rewards / locker room cosmetics (deferred in v1)


## 1) Repo idioms to follow (match clocks/soccer-spacing)
- Each app is a standalone Vite + React app under `apps/<app-name>/`.
- App structure:
  - `src/App.jsx` + `src/App.css`
  - `src/index.css` for global resets + theme variables
  - `src/components/*.{jsx,css}` one CSS file per component
  - `src/lib/*` for pure logic helpers
  - `public/` and `index.html` from Vite template
- No extra libraries; use React hooks + CSS only.
- Use functional components and hooks (`useState`, `useEffect`, `useMemo`, `useCallback`, `useReducer`, `useRef`).
- Prefer small, focused components and pure utility functions in `src/lib` like `apps/clocks/src/lib/timeUtils.js`.
- Use class-based CSS (not CSS modules) and `no-select` class for drag interactions.
- Keep design deliberate: define CSS variables in `:root` and use a themed background (gradient, patterns).
- Vite config must set `base: '/count-grouping/'` for deployment (like clocks/soccer-spacing).


## 2) New app scaffold (copy structure, then customize)
Create `apps/count-grouping/` by cloning `apps/clocks/` or `apps/soccer-spacing/` and removing unused components.

Files to include:
- `apps/count-grouping/package.json` (name = `count-grouping`, scripts same as other apps)
- `apps/count-grouping/vite.config.js` (base `/count-grouping/`)
- `apps/count-grouping/eslint.config.js` (copy from other apps)
- `apps/count-grouping/index.html` (title = `count-grouping`)
- `apps/count-grouping/public/` (keep `vite.svg` or replace)
- `apps/count-grouping/src/main.jsx` (same as other apps)
- `apps/count-grouping/src/index.css` (global resets + theme variables)
- `apps/count-grouping/src/App.jsx` + `App.css`
- `apps/count-grouping/src/components/*`
- `apps/count-grouping/src/lib/*`
- `apps/count-grouping/README.md` (brief description like "count-grouping: bundle by 5s and 10s")

Also update root `README.md` app list to add **count-grouping**.


## 3) File tree (detailed)

```
apps/count-grouping/
  README.md
  data/                         # optional for persistence (can be empty)
  public/
    vite.svg
  index.html
  package.json
  package-lock.json
  eslint.config.js
  vite.config.js
  src/
    main.jsx
    index.css
    App.jsx
    App.css
    assets/
      (optional: svg textures or patterns)
    components/
      ModeSelector.jsx
      ModeSelector.css
      TargetPanel.jsx
      TargetPanel.css
      PlayArea.jsx
      PlayArea.css
      Ball.jsx
      Ball.css
      Container.jsx
      Container.css
      ContainerSlots.jsx        # if split; otherwise slots in Container
      Shelf.jsx
      Shelf.css
      ControlBar.jsx
      ControlBar.css
      CountingDisplay.jsx
      CountingDisplay.css
      HintOverlay.jsx
      HintOverlay.css
      SuccessOverlay.jsx
      SuccessOverlay.css
      TimerBar.jsx              # optional (fast break mode)
      RewardPanel.jsx           # optional
    lib/
      levelData.js
      gameUtils.js
      layoutUtils.js            # slot positions, geometry
      audioUtils.js             # optional (speech / sfx)
      constants.js
```

Note: keep components granular but avoid excessive nesting. If `ContainerSlots` feels too much, fold into `Container.jsx`.


## 4) Data model + state management (code-level)
Use `useReducer` in `App.jsx` for predictable state + Undo snapshots.

### 4.1 State shape
```
state = {
  mode: 'free' | 'challenge' | 'timed',
  levelIndex: 0,        // 0-based for Level 1-5
  promptIndex: 0,       // index within level prompts
  levelConfig: { ... }, // derived from levelData[levelIndex]
  target: {
    text: string,
    total: number,
    sport: 'soccer' | 'basketball' | 'mixed',
    constraints: { minCarts?: number, maxBags?: number, exactCarts?: number, minBags?: number, maxContainers?: number, fewestContainers?: boolean }
  },
  balls: [
    {
      id: 'ball-1',
      type: 'soccer' | 'basketball',
      status: 'loose' | 'in-container' | 'bundled',
      containerType: 'bag' | 'cart' | null,
      x: number, y: number,  // percent within play area for loose balls
    },
  ],
  containers: {
    bag: {
      capacity: 5,
      slots: ['ball-2', 'ball-3'],
      accepts: 'soccer' | 'basketball' | null, // set on first ball for mixed mode
      isLocked: boolean, // hidden/disabled per level
      isComplete: boolean,
      animating: boolean,
    },
    cart: { capacity: 10, slots: [], accepts: null, isLocked: boolean, isComplete: boolean, animating: boolean },
  },
  shelf: {
    bags: number,
    carts: number,
    bundles: [ { id, type:'bag'|'cart', sport: 'soccer'|'basketball'|'mixed' } ], // used for icons + skip count
  },
  ui: {
    dragging: { ballId, offsetX, offsetY } | null,
    dragPos: { x, y } | null,          // viewport px for active drag
    showTotals: boolean,               // per level config or after Check
    lastCheck: 'correct' | 'incorrect' | null,
    hintActive: boolean,
    hintMessage: string | null,
    combinePrompt: boolean,            // show "Two fives -> one ten" prompt when 2 bags
    toast: string | null,
  },
  history: [ snapshot, ... ],
}
```

### 4.2 Snapshot for Undo
Store minimal snapshots before each mutating action (drop, combine, check reset):
```
snapshot = {
  balls: shallow copy of ball status + positions,
  containers: slots + accepts + isComplete,
  shelf: counts + bundles,
  ui: showTotals + lastCheck (optional)
}
```
Limit history to last ~30 actions to avoid memory bloat.

### 4.3 Reducer actions (explicit)
- `INIT_MODE(mode)`
- `INIT_LEVEL(levelIndex, promptIndex)`
- `RESET_PILE({ total, sport })`
- `DRAG_START({ ballId, offsetX, offsetY, startPos })`
- `DRAG_MOVE({ x, y })`
- `DRAG_END()`
- `DROP_IN_CONTAINER({ ballId, containerType })`
- `REJECT_DROP({ ballId })`
- `COMPLETE_CONTAINER({ containerType })`
- `ANIMATION_DONE({ containerType })`
- `COMBINE_BAGS()`
- `UNLOCK_CONTAINER({ containerType })` // for scripted prompt moments
- `UNDO()`
- `CHECK_ANSWER()`
- `SET_SHOW_TOTALS(boolean)`
- `SHOW_HINT(message)`
- `HIDE_HINT()`
- `NEXT_PROMPT()`

Reducer should never mutate objects in place (copy arrays/objects).


## 5) Level data (detailed JSON in `src/lib/levelData.js`)
Structure:
```
export const LEVELS = [
  {
    id: 1,
    name: 'Make 5s',
    containers: { bag: true, cart: false },
    tradingEnabled: false,
    showTotals: 'on-check', // use for all levels in v1
    allowMixed: false,
    prompts: [ ... ]
  },
  ...
]
```

Container availability is derived from `level.containers` by default, but a prompt can override it:
- If `initialContainersLockedUntil` is set, start that container locked even if the level enables it.
- If `unlockContainerAfterMs` is set, schedule an unlock via `UNLOCK_CONTAINER`.

Each prompt object:
```
{
  id: 'L1-1',
  text: 'Pack 10 soccer balls using bags of 5.',
  total: 10,
  sport: 'soccer',
  constraints: { onlyBag: true },
  hint: 'Each bag holds 5. Try two bags.' ,
  initialBundles: { bags: 0, carts: 0 },
  initialContainersLockedUntil?: 'bag'|'cart'|null, // optional
  unlockContainerAfterMs?: { container: 'bag'|'cart', ms: number }, // optional scripted unlock
}
```

### 5.1 Level 1: Bag of 5 only (Prompts 1-5)
- L1-1: Pack 10 soccer balls using bags of 5. (2 bags)
- L1-2: Pack 15 basketballs using bags of 5. (3 bags)
- L1-3: Pack 20 soccer balls using bags of 5. (4 bags)
- L1-4: Coach wants 25 basketballs. Use bags of 5. (5 bags)
- L1-5: Pack 30 soccer balls. Bags of 5 only. (6 bags)
Hint logic: show ghost outline of 5 slots filling.

### 5.2 Level 2: Cart of 10 only (Prompts 6-9)
- L2-6: Pack 20 soccer balls using carts of 10. (2 carts)
- L2-7: Pack 30 basketballs using carts of 10. (3 carts)
- L2-8: Pack 40 soccer balls using carts of 10. (4 carts)
- L2-9: Big practice: pack 60 basketballs using carts of 10. (6 carts)
Hint logic: "Each cart is 10. Count: 10, 20, 30..."

### 5.3 Level 3: Both containers, no trading (Prompts 10-14)
- L3-10: Pack 27 soccer balls. Use carts and bags. (2 carts + 1 bag + 2 singles)
- L3-11: Pack 34 basketballs. (3 carts + 4 singles; bag optional)
- L3-12: Pack 45 soccer balls. (4 carts + 1 bag)
- L3-13: Pack 58 basketballs. (5 carts + 1 bag + 3 singles)
- L3-14: Pack 63 soccer balls. (6 carts + 3 singles)
Soft scoring idea: fewer containers = "faster packing" (optional display).

### 5.4 Level 4: Trading unlocked (Prompts 15-18)
- L4-15: Pack 50 basketballs. Try using trading.
  - Scripted moment: start with only bags; unlock carts after ~3000ms.
  - In `levelData`, set `unlockContainerAfterMs: { container: 'cart', ms: 3000 }`.
- L4-16: You have 2 bags already. Combine them. How many is one cart? (teaches 5 + 5 = 10)
- L4-17: Pack 70 soccer balls. You may trade bags into carts. (7 carts)
- L4-18: Pack 96 basketballs. Trade to make counting easy. (9 carts + 1 bag + 1 single) OR (9 carts + 6 singles)
Hint logic: when two bags exist, pulse "Combine -> Cart (10)."

### 5.5 Level 5: Constraints / strategy (Prompts 19-20)
- L5-19: Pack 85 soccer balls using at least 8 carts. (8 carts + 1 bag)
- L5-20: Pack 92 basketballs using no more than 1 bag. (9 carts + 2 singles)

### 5.6 Optional Level 6 (two-sport, deferred in v1)
- L6-1: Pack 30 soccer and 20 basketballs.
- L6-2: Pack 25 soccer and 38 basketballs. Which needs more containers?
- L6-3: Total balls must be 60: choose any mix of soccer and basketball.

Implementation detail for Level 6:
- Add `sport: 'mixed'` and `totalsBySport: { soccer, basketball }` to prompt
- Containers accept only one sport once first ball is placed (store `accepts` per container)


## 6) Core UI layout (tablet first)
High-level layout (CSS Grid/Flex):
- Top row: Mode selector + Target panel (left) + Bundle shelf (right)
- Middle: Play area (ball pile + containers)
- Bottom: Control bar (Hint / Undo / Check) + optional Counting display

### 6.1 Layout details
- `App` root sets full-height container with gradient + subtle pattern.
- `PlayArea` is a large rounded rectangle "gym floor" with a textured background.
- `Ball pile` sits left/center; `Containers` sit right/center (stacked vertically) or right side.
- `Bundle shelf` floats top-right with bag/cart icons and counts.
- `Control bar` bottom center with large tap targets.
- Use `min-height: 100dvh` and `touch-action: none` on drag surfaces.


## 7) Component responsibilities (detailed)

### 7.1 `App.jsx`
- Owns `useReducer` state, derives `currentLevel`, `currentPrompt` from `levelData`.
- Handles mode switching, prompt progression, and triggers `INIT_LEVEL`.
- Passes down callbacks for drag/drop, hint, undo, check, combine.
- Computes derived counts with selectors from `lib/gameUtils.js`.

Props to children:
- `ModeSelector` gets `mode`, `onModeChange`.
- `TargetPanel` gets `promptText`, `constraints`, `progress` (current/total prompts).
- `PlayArea` gets `balls`, `containers`, drag handlers, and refs.
- `Shelf` gets `shelf` data and `onSkipCount` callback.
- `ControlBar` gets `onHint`, `onUndo`, `onCheck`, `disabled` states.
- `CountingDisplay` gets computed totals + `visible` flag.
- `HintOverlay` gets `hintMessage` + `visible`.
- `SuccessOverlay` gets `lastCheck` + `onNext`.

### 7.2 `PlayArea.jsx`
- Renders play area background.
- Renders `Ball` components for `balls` with `status === 'loose'` or `in-container` if you want to show placement.
- Renders `Container` components for bag + cart, with slots and capacity.
- Holds refs to `playArea`, `bag`, `cart` for hit-testing.

### 7.3 `Ball.jsx`
- Visual representation of a soccer or basketball.
- Handles pointer events: `onPointerDown`, `onPointerMove`, `onPointerUp`.
- If dragging, uses inline style `transform: translate(...)` and `position: absolute`.
- Applies CSS classes like `.ball.dragging` or `.ball.rejected`.

### 7.4 `Container.jsx`
- Renders bag or cart with a background and slot positions.
- Shows capacity (5/10) and current fill.
- Receives `slots` array and maps to `Ball` render positions.
- Adds "glow" when hint active or when dragging over.

### 7.5 `Shelf.jsx`
- Displays completed bundles as icons with counts.
- Each icon is tappable; triggers skip-count visual animation only (no audio in v1).
- When `combinePrompt` is true and `bags >= 2`, show "Combine" button.

### 7.6 `ControlBar.jsx`
- Three large buttons (Hint, Undo, Check).
- Disabled states based on mode or no history.

### 7.7 `CountingDisplay.jsx`
- Shows carts, bags, singles, total.
- When hidden (early levels), show placeholder "Tap Check to see totals."

### 7.8 `HintOverlay.jsx`
- Simple overlay with text and optional ghost slot highlight.
- Should not block drag (pointer-events: none), except a dismiss button if needed.

### 7.9 `SuccessOverlay.jsx`
- Appears after Check with success/try-again messaging.
- On success in challenge mode, show "Next" or "Continue".

### 7.10 Optional components
- `TimerBar` for timed mode: displays gentle countdown.
- `RewardPanel` for unlocked cosmetics.


## 8) Core logic (drag + container fill)

### 8.1 Slot positions (`layoutUtils.js`)
Define fixed arrays of slot positions (percent-based within container):
```
export const BAG_SLOTS = [
  { x: 30, y: 35 }, { x: 50, y: 30 }, { x: 70, y: 35 },
  { x: 40, y: 65 }, { x: 60, y: 65 },
];

export const CART_SLOTS = [
  // ten-frame style: 2 rows of 5
  { x: 15, y: 30 }, { x: 32, y: 30 }, { x: 49, y: 30 }, { x: 66, y: 30 }, { x: 83, y: 30 },
  { x: 15, y: 70 }, { x: 32, y: 70 }, { x: 49, y: 70 }, { x: 66, y: 70 }, { x: 83, y: 70 },
];
```

### 8.2 Drag lifecycle (pseudo)
- `onPointerDown(e, ballId)`
  - store pointer offset in state
  - set `ui.dragging` and `ui.dragPos`
  - add `pointercapture`
- `onPointerMove(e)`
  - if dragging, update `ui.dragPos` (use `requestAnimationFrame` to throttle)
- `onPointerUp(e)`
  - compute drop target by checking pointer location vs `bagRect` and `cartRect`
  - if drop in container AND capacity available AND accepts match:
    - dispatch `DROP_IN_CONTAINER`
    - if full, dispatch `COMPLETE_CONTAINER`
  - else dispatch `REJECT_DROP` (ball bounces back to pile)

### 8.3 Drop rules
- Container must not be locked.
- If container `accepts` is null, set to ball type on first drop.
- If container `accepts` is set and ball type mismatches, reject.
- If container is full, reject.
- On reject: animate a small "bounce out" and return to prior pile position.

### 8.4 Complete container
- When slots reach capacity:
  - mark container `isComplete` + `animating`
  - create a `bundle` object for shelf with `type` and `sport` (if single sport, use that; if mixed, use `'mixed'`)
  - remove/mark those balls as `bundled`
  - after animation (~400ms), increment `shelf` counts and reset container slots.

### 8.5 Combine bags (trading)
When `shelf.bags >= 2` and `tradingEnabled`:
- show a `Combine` button on shelf
- on click:
  - subtract 2 bags, add 1 cart
  - show quick animation of two bag icons merging into cart icon
  - optional future: play audio / voice "ten!" (deferred in v1)

### 8.6 Undo
- Before any state mutation, push snapshot into `history`.
- On `UNDO`, replace state pieces from last snapshot and pop it.

### 8.7 Check
- Compute totals and constraints:
  - `bundledTotal = shelf.carts*10 + shelf.bags*5`
  - `singles = totalBalls - bundledTotal`
  - `total = bundledTotal + singles` (should equal target total if pile size equals target)
- Success if:
  - total equals target total
  - constraints satisfied (`evaluateConstraints` in `gameUtils.js`)
- Update `ui.lastCheck` to show overlay. If success, show "Next" in challenge mode.


## 9) Utility functions (`src/lib/gameUtils.js`)
Implement helper functions (pure, unit-testable):
- `createBallPile({ total, sport, playAreaRect })` -> array of balls with random positions
- `getTotals(state)` -> { carts, bags, singles, total }
- `evaluateConstraints({ shelf, totals, constraints })` -> { ok: boolean, reason: string }
- `containerCanAcceptBall(container, ballType)` -> boolean
- `getBundleSport(container, balls)` -> 'soccer'|'basketball'|'mixed'
- `formatPrompt(prompt)` (optional, if prompts are data-driven)


## 10) Visual/interaction design (CSS)
- Use a sporty, warm palette (avoid purple). Example variables:
  - `--bg-sky`, `--bg-grass`, `--accent-orange`, `--accent-blue`
- Use a fun, non-default font (e.g., `Fredoka` or `Baloo 2`) via Google Fonts import in `index.css`.
- Large, rounded buttons with bold text for tablet taps.
- Balls styled with CSS gradients and simple SVG for seams.
- Mesh bag: rounded shape with diagonal mesh lines (CSS repeating-linear-gradient).
- Cart: metal rack with 10 slots (ten-frame grid) and subtle shadow.
- Background: gradient with faint pattern (e.g., subtle dotted texture via `radial-gradient`).
- Use subtle motion: fill pop, bundle fly-to-shelf animation, hint pulsing.


## 11) Mode behavior

### 11.1 Free Play
- No target; show random pile size (e.g., 30-80 balls) and allow mixing.
- `Check` just reveals totals (no correctness check).
- `Hint` shows quick tips like "Try a cart for 10."

### 11.2 Coach Challenges
- Uses level data; show prompt at top.
- Pile size equals target total (so total always matches if no balls lost).
- Success triggers `SuccessOverlay` with "Next challenge."
- After finishing all prompts in a level, unlock next level.

### 11.3 Fast Break Countdown (optional)
- Same as challenge but with gentle timer bar.
- No failure: when time ends, show "Nice try! Want to go again?"


## 12) Counting display behavior
- Show carts/bags/singles counts and total.
- Always hidden until Check is pressed for all levels (per v1 requirement).
- Display layout: icons + numbers in a horizontal bar.


## 13) Hint system
- `Hint` button triggers level-specific messages or ghost slot overlays.
- Examples:
  - L1: highlight bag and animate 5 empty slots filling.
  - L2: highlight cart with "Count by 10s" text.
  - L3+: show suggestion "Try a cart for 10 and a bag for 5."
  - L4: if `bags >= 2`, pulse "Combine" button.


## 14) Rewards (optional, deferred in v1)
- Defer all reward/locker room work until after core gameplay is stable.
- If added later, unlock a cosmetic per level and store in `localStorage`.


## 15) Accessibility + usability
- Large hit targets (>= 48px).
- Use `touch-action: none` on drag elements.
- Avoid tiny text; use 18-24px base on tablets.
- Provide clear visual feedback for drag and drop targets.


## 16) Implementation steps (ordered, code-level)
1) Scaffold app structure
   - Copy `apps/clocks` or `apps/soccer-spacing` to `apps/count-grouping`.
   - Update `package.json` name to `count-grouping`.
   - Update `vite.config.js` base to `/count-grouping/`.
   - Update `index.html` title.
   - Remove unused components and CSS.

2) Create level data + utils
   - Add `src/lib/levelData.js` with full level config and prompts.
   - Add `src/lib/constants.js` for capacities, container sizes, etc.
   - Add `src/lib/layoutUtils.js` for slot positions.
   - Add `src/lib/gameUtils.js` for totals + constraints.

3) Build core components
   - `ModeSelector`, `TargetPanel`, `ControlBar`, `CountingDisplay`.
   - `PlayArea`, `Ball`, `Container`, `Shelf`.
   - `HintOverlay` and `SuccessOverlay`.

4) Implement reducer + state wiring in `App.jsx`
   - Create reducer with actions listed above.
   - Wire mode switching and prompt progression.
   - Implement Undo stack.
   - If a prompt includes `unlockContainerAfterMs`, schedule a timeout on prompt load to dispatch `UNLOCK_CONTAINER`.
     - Store timer id in a ref and clear on prompt change/unmount to avoid stale unlocks.

5) Implement drag/drop + container logic
   - Use pointer events in `Ball` and `PlayArea`.
   - On drop, resolve container hit and capacity.
   - Trigger completion animation and shelf updates.

6) Implement trading / combine
   - In `Shelf`, show Combine button if allowed.
   - Update state to remove 2 bags, add 1 cart.

7) Implement Check + success overlay
   - `Check` computes totals and constraint validation.
   - Show overlay; on success, advance prompt.

8) Style pass
   - `index.css` global resets + font import.
   - `App.css` sets layout, background, and grid.
   - Component CSS: bag/cart styling, shelf, controls.
   - Add animations for completion + hints.

9) Optional features
   - Speech synthesis for skip counting (deferred in v1).
   - Fast Break timer mode.
   - Rewards panel.

10) Update README
   - Add app description in root `README.md` and `apps/count-grouping/README.md`.

11) Manual verification checklist
   - Drag a ball into bag/cart, fill to capacity, confirm bundle moves to shelf.
   - Overfill attempt bounces ball out.
   - Undo returns last state.
   - Check verifies correct totals for sample prompt.
   - Level progression works across all prompts.
   - UI scales on tablet width (768-1024px) and portrait/landscape.


## 17) Decisions locked for v1 (from user responses)
- Level 6 two-sport challenges are deferred (not in v1).
- Skip-count is visual only (no speech synthesis).
- Counting display is always hidden until Check is pressed.
- Free Play uses a random pile size range (e.g., 30-80 balls).
- Rewards/locker room are deferred.
- Level 4 prompt 15 uses a scripted moment: start with only bags, then unlock carts after a short delay.
