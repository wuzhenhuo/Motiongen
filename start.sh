#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=================================================="
echo "  WuZhen Studio — Dev Server"
echo "  3D Model Generation + HY-Motion"
echo "=================================================="
echo ""

# Check .env
if [ ! -f "$ROOT/server/.env" ]; then
  echo "⚠️  server/.env not found. Copying from .env.example..."
  cp "$ROOT/server/.env.example" "$ROOT/server/.env"
  echo "   Edit server/.env to add your TRIPO_API_KEY and HF_TOKEN."
  echo ""
fi

# Start Node.js server in background
echo "▶  Starting API server (port 3001)..."
cd "$ROOT/server" && node index.js &
SERVER_PID=$!

# Wait for server to be ready
sleep 1

# Start React client (foreground)
echo "▶  Starting React client (port 5173)..."
echo ""
cd "$ROOT/client" && npm run dev

# On exit, kill the server
kill $SERVER_PID 2>/dev/null
