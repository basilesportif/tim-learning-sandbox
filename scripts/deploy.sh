#!/bin/bash
set -e

SERVER="tim-apps"
REMOTE_PATH="/root/pkg/tim-learning-sandbox"
APP_NAME="$1"

echo "🚀 Deploying to $SERVER..."

# Clean generated build artifacts and lockfile noise on server before pull.
# This preserves app data files while allowing the deployment checkout to fast-forward cleanly.
ssh $SERVER "cd $REMOTE_PATH && bash -lc '
  shopt -s nullglob
  lockfiles=(package-lock.json apps/*/package-lock.json)
  dist_dirs=(apps/*/dist)
  tracked_dist_files=()

  for dir in \"\${dist_dirs[@]}\"; do
    [ -d \"\$dir\" ] || continue
    while IFS= read -r tracked_file; do
      tracked_dist_files+=(\"\$tracked_file\")
    done < <(git ls-files \"\$dir\")
  done

  restore_paths=(\"\${lockfiles[@]}\" \"\${tracked_dist_files[@]}\")
  [ \${#restore_paths[@]} -gt 0 ] && git restore -- \"\${restore_paths[@]}\" 2>/dev/null || true
  [ \${#dist_dirs[@]} -gt 0 ] && git clean -fd -- \"\${dist_dirs[@]}\" 2>/dev/null || true
'"

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
    ssh $SERVER "cd $REMOTE_PATH && npm ci && cd apps/$APP_NAME && npm ci && npm run build"
else
    echo "📦 Building all apps..."
    ssh $SERVER "cd $REMOTE_PATH && npm ci"
    for app in apps/*/; do
        app_name=$(basename "$app")
        echo "  Building $app_name..."
        ssh $SERVER "cd $REMOTE_PATH/apps/$app_name && npm ci && npm run build"
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
