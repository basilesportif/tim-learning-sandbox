#!/bin/bash
set -e

SERVER="tim-apps"
REMOTE_PATH="/root/pkg/tim-learning-sandbox"
APP_NAME="$1"

echo "🚀 Deploying to $SERVER..."

# Pull latest code on server
ssh $SERVER "cd $REMOTE_PATH && git pull"

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

# Rsync secrets if they exist locally
if [ -d "secrets" ]; then
    echo "🔐 Syncing secrets..."
    rsync -av --progress secrets/ $SERVER:$REMOTE_PATH/secrets/
fi

# Restart the server (preserves data/ directories)
echo "🔄 Restarting server..."
ssh $SERVER "cd $REMOTE_PATH && pm2 restart tim-learning || pm2 start server/index.js --name tim-learning"

echo "✅ Deployment complete!"
echo "🌐 Visit: https://learning.galebach.com"
