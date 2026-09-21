# Tim Learning Sandbox

Simple educational websites for kids - each app teaches something new.

## Apps

- **clocks** - Learn to read analog clocks with interactive quizzes
- **count-grouping** - Bundle soccer balls and basketballs into groups of 5 (bags) and 10 (carts) - learn counting by 5s and 10s
- **quickmath** - Rapid-fire addition and subtraction with timed multiple-choice practice
- **shape-rotation** - Turn a triangle in 30 degree steps to learn clockwise vs counterclockwise
- **soccer-spacing** - Practice soccer field spacing and positioning
- **team** - Soccer teammate name flashcards for Manhattan SC Independiente U9 - photo on the front, first and last name on the reveal
- **vocab** - Clerk-authenticated vocabulary prep with book-backed decks, pasted word decks, child practice, and light spaced repetition

## Structure

```
apps/
  <app-name>/          # Each app is a Vite + React app
    src/
    data/              # Local JSON files for persistence
    package.json
scripts/
  deploy.sh            # Deploy to tim-apps server
```

`apps/vocab` also stores raw imported book text and generated word images under its `data/` directory.

## Development

```bash
# Install dependencies for an app
cd apps/<app-name>
npm install
npm run dev
```

## Vocab App Environment

`apps/vocab` depends on Clerk in the frontend and Clerk/OpenAI in the shared Express server.

Server environment:
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `VOCAB_ADMIN_EMAILS`
- `VOCAB_CHILD_EMAILS`
- `OPENAI_API_KEY`

Large vocab book imports and pasted-word deck builds are queued and processed in the background so heavy jobs do not hit CDN/proxy request timeouts.
Vocab books become assignable book-backed decks, admins can create and extend custom decks from pasted word lists, and pasted deck rows can optionally include manual definitions plus wrong answer choices. Child sessions pull from easier or harder parts of each deck as performance changes.
Word mastery is tracked per user per word across all decks.

Artifact extraction for vocab books:

```bash
npm run vocab:extract-artifacts -- --book-id=<book-id>
```

This scans stored OCR page images under `apps/vocab/data/books/<book-id>/pages/`, crops illustration artifacts into `artifacts/`, and records them back on the book.

To rebuild the ranked word pool for existing vocab books from stored source text:

```bash
npm run vocab:reprocess-pools -- --book-id=<book-id>
```

Frontend environment for the Vite app:
- `VITE_CLERK_PUBLISHABLE_KEY`

`apps/vocab` also accepts a single root `CLERK_PUBLISHABLE_KEY`; its Vite config injects that into the frontend if the `VITE_` variant is not set.

## Deployment

Apps are deployed to `tim-apps` server and served via Caddy at `learning.galebach.com/<app-name>`.

```bash
# Deploy all apps
./scripts/deploy.sh

# Deploy specific app
./scripts/deploy.sh <app-name>
```

### Server Details
- **Host**: tim-apps (SSH config)
- **Port**: 3004
- **URL**: https://learning.galebach.com/<app-name>
- **Data**: Local JSON files in each app's `data/` directory

## Temporarily Disabling an App

`server/index.js` has a `DISABLED_APPS` flag near the top (just below `VOCAB_APP_NAME`).
Any app listed there is hidden from the root listing and gets **no** routes registered
(static, SPA fallback, or `/<app>/api/data/*`), so every `/<app>...` URL returns 404.
All of the app's code, assets, and `data/` stay on disk untouched.

Currently disabled: `team`.

Re-enable it:

1. Remove `'team'` from `DISABLED_APPS_DEFAULT` in `server/index.js`, commit, and push.
2. On the server: `cd /root/pkg/tim-learning-sandbox && git pull --ff-only && pm2 restart tim-learning`

No rebuild is required - the prebuilt `apps/team/dist` never leaves the server.

The `DISABLED_APPS` env var *extends* (does not replace) the hardcoded list, so an app
can also be pulled offline without a code change:
`DISABLED_APPS=quickmath,clocks pm2 restart tim-learning --update-env`.

### The `/team` Password Gate

`/team` shows real kids' names and faces, and those come out of static files
(`apps/team/dist/assets/*.js` and `apps/team/dist/photos/*.jpg`), so the gate is
enforced **server-side in front of every `/team` route** - the static middleware, the
photos, the SPA fallback, and the API alike. The login page is rendered by
`server/index.js`, so unlocking never needs an `apps/team` rebuild.

- Set `TEAM_APP_PASSWORD` in the server's `.env` (see `.env.example`).
- **If `TEAM_APP_PASSWORD` is unset the app stays locked for everyone** - there is no
  fallback password, and the server logs a warning at startup.
- A correct password sets the `team_unlock` cookie (HttpOnly, `SameSite=Lax`,
  `Path=/team`, 7-day TTL; `Secure` when `NODE_ENV=production`). Sessions live in
  memory, so a `pm2 restart` logs everyone out.
- 5 wrong attempts per IP trigger a 10-minute block (HTTP 429 with `retry_after_sec`).
- `POST /team/api/auth/logout` clears the cookie; `GET /team/api/auth/status` reports
  `{ "unlocked": bool }`.

The gate only matters once `team` is removed from `DISABLED_APPS_DEFAULT`. While the
app is disabled the gate routes are never registered at all and every `/team...` URL
is a plain 404.

## Adding a New App

1. Create new app in `apps/<app-name>/`
2. Use the Vite + React template
3. Store any persistent data in `data/*.json`
4. Deploy with `./scripts/deploy.sh <app-name>`

## License

MIT License - see [LICENSE](LICENSE) for details.
