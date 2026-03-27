#!/bin/bash
set -e

SERVER="tim-apps"
REMOTE_PATH="/root/pkg/tim-learning-sandbox"
APP_NAME="$1"

echo "🚀 Deploying to $SERVER..."

# Clean generated build artifacts and lockfile noise on server before pull.
# This preserves app data files while allowing the deployment checkout to fast-forward cleanly.
ssh $SERVER "cd $REMOTE_PATH && git restore package-lock.json apps/*/package-lock.json apps/*/dist 2>/dev/null || true && git clean -fd apps/*/dist 2>/dev/null || true"

# Pull latest code on server
ssh $SERVER "cd $REMOTE_PATH && git pull --ff-only"

# Sync root env before any remote build so Vite and Node can read Clerk/OpenAI keys
if [ -f ".env" ]; then
    echo "🔐 Syncing .env..."
    rsync -av --progress .env $SERVER:$REMOTE_PATH/.env
fi

# Install dependencies and build
if [ -n "$APP_NAME" ]; then
    echo "📦 Building app: $APP_NAME"
    ssh $SERVER "cd $REMOTE_PATH/apps/$APP_NAME && npm install && npm run build"
else
    echo "📦 Building all apps..."
    ssh $SERVER "cd $REMOTE_PATH && npm install"
    for app in apps/*/; do
        app_name=$(basename "$app")
        echo "  Building $app_name..."
        ssh $SERVER "cd $REMOTE_PATH/apps/$app_name && npm install && npm run build"
    done
fi

# Rsync secrets directory if it exists locally
if [ -d "secrets" ]; then
    echo "🔐 Syncing secrets..."
    rsync -av --progress secrets/ $SERVER:$REMOTE_PATH/secrets/
fi

# Restart the server (preserves data/ directories)
echo "🔄 Restarting server..."
ssh $SERVER "cd $REMOTE_PATH && pm2 restart tim-learning || pm2 start server/index.js --name tim-learning"

echo "✅ Deployment complete!"
echo "🌐 Visit: https://learning.galebach.com"
