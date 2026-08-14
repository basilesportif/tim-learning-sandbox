# Shape Rotation

A small learning tool for practising rotation **direction**.

A triangle with a clearly marked "up" side is turned by a fixed 30° step with
two big buttons:

- **↺ Counterclockwise** — decreases the angle
- **↻ Clockwise** — increases the angle (CSS/SVG positive rotation is clockwise)

## Modes

A tab strip at the top switches between two ways of using those buttons. Each
mode keeps its own state, so flipping tabs never throws away what you built.

- **Free Rotate** — one triangle on a guide dial. Every tap turns *that* shape
  by 30° and the current angle is read out below it. "Start over" springs it
  back upright the short way.
- **Pattern Builder** — nothing turns; every tap *adds* a triangle to a strip,
  each one 30° further round than the one before it, so the whole sequence of
  turns stays on screen at once. A "Start" card holds the upright triangle at
  0°, each snapshot is captioned with its direction arrow and angle, and the
  strip holds at most 10 triangles (after which the turn buttons go quiet until
  "Start over" empties it).

Every turn is animated with a ~300ms CSS transition so the *direction of travel*
is visible, which is the whole point of the app. The rotation angle is kept as a
cumulative, unbounded number in state (never wrapped with a modulo) so the
browser always animates the turn the way the child actually asked for. Only the
number shown on screen is normalized to 0–359°.

"Start over" returns the shape to its upright starting position.

No backend or persistence — everything lives in component state.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # emits dist/, served by the sandbox server at /shape-rotation/
npm run lint
```
