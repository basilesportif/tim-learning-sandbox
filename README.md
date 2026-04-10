# Tim Learning Sandbox

Simple educational websites for kids - each app teaches something new.

## Apps

- **clocks** - Learn to read analog clocks with interactive quizzes
- **count-grouping** - Bundle soccer balls and basketballs into groups of 5 (bags) and 10 (carts) - learn counting by 5s and 10s
- **quickmath** - Rapid-fire addition and subtraction with timed multiple-choice practice
- **soccer-spacing** - Practice soccer field spacing and positioning
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
Vocab books become assignable book-backed decks, admins can create custom decks from pasted word lists, and child sessions pull from easier or harder parts of each deck as performance changes.
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

## Adding a New App

1. Create new app in `apps/<app-name>/`
2. Use the Vite + React template
3. Store any persistent data in `data/*.json`
4. Deploy with `./scripts/deploy.sh <app-name>`

## License

MIT License - see [LICENSE](LICENSE) for details.
