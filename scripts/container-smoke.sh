#!/bin/sh
# Builds the image, makes a token in it, opens the portal in it and asks it for its health and its page.
# Usage: scripts/container-smoke.sh [image-name]   (needs docker and curl; the CI runs it, and so can you)
set -eu

IMAGE="${1:-portal:smoke}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
NAME="portal-smoke-$$"
PORT="${PORTAL_SMOKE_PORT:-3100}"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

docker build -t "$IMAGE" "$ROOT"

# the portal runs as `node` (not root) and writes only /data: a folder it may write to is all it asks of the host
mkdir "$WORK/data"
chmod 777 "$WORK/data"
cp "$ROOT/container/portal.container.example.json" "$WORK/portal.json"
MOUNTS="-v $WORK/data:/data -v $WORK/portal.json:/config/portal.json:ro"

# a token for each person of the example config: the portal does not start with one missing
for person in Zeus Hera; do
  # shellcheck disable=SC2086
  docker run --rm $MOUNTS "$IMAGE" node dist/tokens.js /config/portal.json new "$person" >/dev/null
done
# shellcheck disable=SC2086
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:3100" $MOUNTS "$IMAGE" >/dev/null

health=""
for _ in $(seq 1 30); do
  health="$(curl -fsS "http://127.0.0.1:$PORT/api/health" 2>/dev/null || true)"
  [ -n "$health" ] && break
  sleep 1
done
if [ -z "$health" ]; then
  echo "the portal in the container did not answer in 30 seconds:" >&2
  docker logs "$NAME" >&2
  exit 1
fi
echo "health: $health"

[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")" = "200" ] || { echo "the page did not answer 200" >&2; exit 1; }
[ "$(docker exec "$NAME" id -u)" != "0" ] || { echo "the portal runs as root" >&2; exit 1; }

# a tag names a version: the image must say the same one
if [ -n "${EXPECT_VERSION:-}" ]; then
  case "$health" in
    *"\"version\":\"$EXPECT_VERSION\""*) ;;
    *) echo "the image says another version than $EXPECT_VERSION" >&2; exit 1 ;;
  esac
fi
echo "ok"
