# Tim Learning Sandbox

Educational web apps for kids built with Vite + React.

## Development Workflow

After making any changes to an app:
1. **Commit**: `git add -A && git commit -m "description"`
2. **Push**: `git push`
3. **Deploy**: `./scripts/deploy.sh <app-name>` or just `./scripts/deploy.sh` for all apps

## Structure

- `apps/<app-name>/` - Each app is a standalone Vite + React app
- `server/index.js` - Express server that serves all apps
- `scripts/deploy.sh` - Deploys to tim-apps server
- `scripts/new-app.sh` - Scaffolds a new app

## Server

- **URL**: https://learning.galebach.com/<app-name>
- **Port**: 3004
- **Host**: tim-apps (SSH config)

## Data Persistence

Each app can use JSON file storage:
- `GET /<app>/api/data/<file>` - Read JSON
- `POST /<app>/api/data/<file>` - Write JSON
- Files stored in `apps/<app>/data/<file>.json`
