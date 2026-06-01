#!/usr/bin/env bash
# vLLM Launcher - Start script
# Starts backend (FastAPI/uvicorn) and optionally frontend (Vite dev server).
# If frontend/dist/index.html exists, the backend serves the built frontend
# in production mode. Otherwise, both Vite dev server and backend start.
#
# Environment variables:
#   PORT            - Backend port (default: 8001)
#   VLLM_PYTHON     - Path to Python interpreter to use
#   VLLM_NO_BROWSER - Set to any value to skip opening the browser

set -euo pipefail

# ── Script & project paths ───────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# ── Configuration ────────────────────────────────────────────────────────────

BACKEND_PORT="${PORT:-8001}"
FRONTEND_PORT=5173
DEV_MODE=false
PIDS=()

# ── Auto-detect Python ───────────────────────────────────────────────────────

if [[ -n "${VLLM_PYTHON:-}" ]]; then
    PYTHON="$VLLM_PYTHON"
elif command -v python3 &>/dev/null; then
    PYTHON="$(command -v python3)"
elif command -v python &>/dev/null; then
    PYTHON="$(command -v python)"
else
    echo "[ERROR] No Python interpreter found. Set VLLM_PYTHON or install python3." >&2
    exit 1
fi

echo "[INFO] Using Python: $PYTHON"

# ── Cleanup trap ─────────────────────────────────────────────────────────────
# Kill all tracked child processes on exit (covers SIGINT, SIGTERM, EXIT).

cleanup() {
    echo ""
    echo "[INFO] Shutting down..."
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
        fi
    done
    echo "[INFO] Done."
}

trap cleanup EXIT INT TERM

# ── Open browser ─────────────────────────────────────────────────────────────
# Detects OS and picks the right command. Skips if VLLM_NO_BROWSER is set.

open_browser() {
    local url="$1"

    if [[ -n "${VLLM_NO_BROWSER:-}" ]]; then
        return 0
    fi

    # WSL check (must come before generic Linux detection)
    if grep -qi microsoft /proc/version 2>/dev/null; then
        if command -v wslview &>/dev/null; then
            wslview "$url" &>/dev/null &
            return 0
        fi
        echo "[INFO] In WSL but wslview not found; skipping browser open."
        return 0
    fi

    case "$(uname -s)" in
        Linux)
            if command -v xdg-open &>/dev/null; then
                xdg-open "$url" &>/dev/null &
            else
                echo "[INFO] xdg-open not found; skipping browser open."
            fi
            ;;
        Darwin)
            open "$url"
            ;;
        *)
            echo "[INFO] Unsupported OS for browser open; skipping."
            ;;
    esac
}

# ── Determine mode (production vs dev) ───────────────────────────────────────

if [[ -f "$FRONTEND_DIR/dist/index.html" ]]; then
    echo "[INFO] Frontend build found -- running in production mode."
    echo "[INFO] Backend serves built frontend on port $BACKEND_PORT."
else
    DEV_MODE=true
    echo "[INFO] No frontend build detected -- running in dev mode."
    echo "[INFO] Frontend (Vite) will run on port $FRONTEND_PORT."
    echo "[INFO] Backend (uvicorn) will run on port $BACKEND_PORT."
fi

# ── Clean stale bytecode ─────────────────────────────────────────────────────

find "$BACKEND_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

# ── Start backend ────────────────────────────────────────────────────────────

cd "$BACKEND_DIR"

BACKEND_CMD=(
    "$PYTHON" -m uvicorn main:app
    --host 0.0.0.0
    --port "$BACKEND_PORT"
)

if [[ "$DEV_MODE" == true ]]; then
    BACKEND_CMD+=(
        --reload
        --reload-exclude "__pycache__"
        --reload-exclude "*.pyc"
    )
fi

"${BACKEND_CMD[@]}" &
PIDS+=($!)

echo "[INFO] Backend started (PID ${PIDS[-1]})."

# ── Start frontend (dev mode only) ───────────────────────────────────────────

if [[ "$DEV_MODE" == true ]]; then
    cd "$FRONTEND_DIR"
    npx vite --host 0.0.0.0 --port "$FRONTEND_PORT" &
    PIDS+=($!)
    echo "[INFO] Frontend started (PID ${PIDS[-1]})."
fi

# ── Open browser ─────────────────────────────────────────────────────────────

if [[ "$DEV_MODE" == true ]]; then
    BROWSER_URL="http://localhost:$FRONTEND_PORT"
else
    BROWSER_URL="http://localhost:$BACKEND_PORT"
fi

# Give the server(s) a moment to bind their ports.
(sleep 2 && open_browser "$BROWSER_URL") &

echo "[INFO] Opening $BROWSER_URL ..."
echo "[INFO] Press Ctrl+C to stop."

# ── Wait for child processes ─────────────────────────────────────────────────
# If any child exits, the script exits, triggering the cleanup trap.

wait
