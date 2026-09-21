# Team

A soccer-teammate name trainer for Manhattan SC Independiente, Male U9
(WYSL Fall 2026).

One teammate's photo fills the screen and there is nothing else on it - no
title, no team name, no progress counter, no prompt. Just the face, the answer
area, and one big button. The whole card is sized to the viewport, so on a
tablet in landscape the button is always on screen and the page never scrolls.

## The two modes

A **Multiple Choice** switch floats in the top-right corner. It is deliberately
out of the layout (fixed position, over the background) so turning it on never
costs any vertical space. The choice is remembered in `localStorage`, so it
survives a reload.

**Flip cards (default, switch off).** Say the name out loud, tap **Show Name**
to check, tap **Next** for the next kid.

**Multiple choice (switch on).** Four names appear: the right one plus three
teammates picked at random from the rest of the deck, shuffled into random
positions and re-dealt for every card. A wrong tap just greys that button out
and leaves the others live - no score, no penalty, guess again. The right tap
turns green with a check mark, the rest fade, and the big button becomes
**Next**. **Show Name** still works as a "just tell me": it lights up the
correct button. In landscape the four buttons sit in a column beside the photo;
on a narrow portrait screen they stack underneath it.

Space or Enter fires the big button in either mode.

All 12 teammates come up once before anyone repeats, and the first card of a
new round is never the player who just ended the previous one.

Daniel is on the roster in `src/players.js` but marked `inDeck: false` - he
knows his own name. Flip that one flag to `true` to deal him in.

Both Ethans (Eisner and Waldman) are in the deck, which is why their cards -
and their choice buttons - show the last name too. On a flip card the answer is
a two-tier stack: a big first name with the last name smaller and quieter
underneath, and only for the players who need it. On a choice button it is one
line. `needsLastName()` and `displayName()` in `src/players.js` are the single
place that decides, so a choice button can never say something the answer
would not.

The app itself has no backend and no login screen of its own - the only thing
persisted is the mode switch. Access is gated by the sandbox server (see below).

## Password

`/team` shows real kids' names and photos, so the sandbox server locks the whole
route - static assets and photos included - behind a password. Set it on the server
before production use:

```bash
export TEAM_APP_PASSWORD="your-password"
```

With no `TEAM_APP_PASSWORD` set, the app stays locked for everyone; there is no
fallback password. Unlocking sets the `team_unlock` cookie (HttpOnly, `Path=/team`,
7-day TTL); 5 wrong attempts from one IP trigger a 10-minute block. The login page is
rendered by `server/index.js`, so changing the password never requires rebuilding
`dist/`.

## Adding the photos

Any player without a photo shows a generated letter tile (the player's first
initial on a color derived from their slug). Dropping the real photo in makes
it appear automatically, with zero code changes.

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
