#!/bin/bash
set -e

APP_NAME="$1"

if [ -z "$APP_NAME" ]; then
    echo "Usage: ./scripts/new-app.sh <app-name>"
    exit 1
fi

APP_DIR="apps/$APP_NAME"

if [ -d "$APP_DIR" ]; then
    echo "❌ App '$APP_NAME' already exists!"
    exit 1
fi

echo "📦 Creating new app: $APP_NAME"

# Create Vite + React app
npm create vite@latest "$APP_DIR" -- --template react

# Add data directory
mkdir -p "$APP_DIR/data"
echo "{}" > "$APP_DIR/data/.gitkeep.json"

# Update vite.config.js for base path
cat > "$APP_DIR/vite.config.js" << EOF
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/$APP_NAME/',
})
EOF

# Add API helper
mkdir -p "$APP_DIR/src/lib"
cat > "$APP_DIR/src/lib/api.js" << 'EOF'
const BASE = import.meta.env.DEV ? 'http://localhost:3004' : '';
const APP_NAME = import.meta.env.BASE_URL.replace(/\//g, '');

export async function getData(file) {
  const res = await fetch(`${BASE}/${APP_NAME}/api/data/${file}`);
  return res.json();
}

export async function saveData(file, data) {
  const res = await fetch(`${BASE}/${APP_NAME}/api/data/${file}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}
EOF

echo "✅ App created at $APP_DIR"
echo ""
echo "Next steps:"
echo "  cd $APP_DIR"
echo "  npm install"
echo "  npm run dev"
