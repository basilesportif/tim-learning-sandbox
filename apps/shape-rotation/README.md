# Shape Rotation

A small learning tool for practising rotation **direction**.

A triangle with a clearly marked "up" side sits in the middle of the screen. Two
big buttons turn it by a fixed 30° step:

- **↺ Counterclockwise** — decreases the angle
- **↻ Clockwise** — increases the angle (CSS/SVG positive rotation is clockwise)

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
