#!/usr/bin/env bash
set -euo pipefail

echo "Installing the Ubuntu packages required by DevUtils..."
sudo apt-get update
sudo apt-get install -y git curl ca-certificates build-essential nginx certbot python3-certbot-nginx postgresql-client

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 20 ]]; then
  echo "Installing Node.js 20 from NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! id devutils >/dev/null 2>&1; then
  sudo useradd --system --create-home --home-dir /opt/devutils --shell /usr/sbin/nologin devutils
fi
sudo install -d -o devutils -g devutils /opt/devutils/app
sudo install -d -o root -g devutils -m 0750 /etc/devutils

echo "Base server setup complete. Continue with INSTALL.md at the clone/configuration step."