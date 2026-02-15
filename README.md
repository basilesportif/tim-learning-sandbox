# Tim Learning Sandbox

Simple educational websites for kids - each app teaches something new.

## Apps

- **clocks** - Learn to read analog clocks with interactive quizzes
- **count-grouping** - Bundle soccer balls and basketballs into groups of 5 (bags) and 10 (carts) - learn counting by 5s and 10s
- **quickmath** - Rapid-fire addition and subtraction with timed multiple-choice practice
- **soccer-spacing** - Practice soccer field spacing and positioning

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

## Development

```bash
# Install dependencies for an app
cd apps/<app-name>
npm install
npm run dev
```

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
