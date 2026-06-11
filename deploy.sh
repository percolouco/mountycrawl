#!/usr/bin/env bash
# Déploie MountyCrawl sur le NAS (à lancer sur le serveur, dans le clone Git).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

PROJECT_DIR="${NAS_PROJECT_DIR:-/home/perco/projects/mountycrawl}"
COMPOSE_DIR="${NAS_COMPOSE_DIR:-/opt/container/mountycrawl}"
REMOTE="${GIT_REMOTE:-origin}"
BRANCH="${GIT_BRANCH:-master}"

echo "▶ Pull du code dans $PROJECT_DIR …"
cd "$PROJECT_DIR"
if [[ "${DEPLOY_DISCARD_LOCAL:-false}" == "true" ]]; then
  git checkout -- .
fi
git pull "$REMOTE" "$BRANCH"

echo "▶ Build Docker dans $COMPOSE_DIR …"
cd "$COMPOSE_DIR"
docker compose build --no-cache
docker compose up -d

echo ""
echo "✅ Déploiement terminé."
if [[ -n "${SITE_URL:-}" ]]; then
  echo "   Site : $SITE_URL"
fi
echo "   Vérif : docker compose -f $COMPOSE_DIR/docker-compose.yml exec mountycrawl grep APP_VERSION /app/js/game.js"
