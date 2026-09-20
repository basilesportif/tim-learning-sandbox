# Team

A soccer-teammate name trainer for Manhattan SC Independiente, Male U9
(WYSL Fall 2026).

One teammate's photo fills the screen. Say the name out loud, tap **Show Name**
to check, tap **Next** for the next kid. All 12 teammates come up once before
anyone repeats, and the first card of a new round is never the player who just
ended the previous one.

Daniel is on the roster in `src/players.js` but marked `inDeck: false` - he
knows his own name. Flip that one flag to `true` to deal him in.

Both Ethans (Eisner and Waldman) are in the deck, which is why the answer shows
the last name underneath the first name.

No backend, no login, no persistence - everything lives in component state.

## Adding the photos

Player photos are **not** in the repo yet. Until a photo exists, each card
shows a generated letter tile (the player's first initial on a color derived
from their slug). Dropping the real photos in makes them appear automatically,
with zero code changes.

1. Name each photo after the player's slug, with a `.jpg` extension:

   ```
   raphael-cheney.jpg
   luca-del-rio.jpg
   ethan-eisner.jpg
   daniel-galebach.jpg    (optional - only used if Daniel is dealt in)
   dylan-hersch.jpg
   isa-jafri.jpg
   naadir-khan.jpg
   oliver-mank.jpg
   levi-resnick.jpg
   leo-rubinstein.jpg
   sam-saliterman.jpg
   jamie-sporn.jpg
   ethan-waldman.jpg
   ```

   The slugs are the `slug` fields in `src/players.js`. Roughly square crops
   look best, but any aspect ratio works: the tile is a 1:1 box with
   `object-fit: cover`.

2. Copy them into `apps/team/public/photos/` (next to the `.gitkeep`).

3. Rebuild and deploy:

   ```bash
   cd apps/team
   npm run build
   cd ../..
   git add apps/team/public/photos
   git commit -m "Add team photos"
   git push
   ./scripts/deploy.sh team
   ```

   `deploy.sh` needs the `tim-apps` ssh alias. Without it, the same steps by
   hand:

   ```bash
   ssh root@<server> "cd /root/pkg/tim-learning-sandbox && git pull --ff-only && npm ci && cd apps/team && npm ci && npm run build"
   ssh root@<server> "pm2 restart tim-learning"
   ```

Any player still missing a `<slug>.jpg` keeps their letter tile, so the photos
can be added a few at a time.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # emits dist/, served by the sandbox server at /team/
npm run lint
```
