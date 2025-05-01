#! /bin/sh

set -e

git pull origin main

chown 1000:1000 -R storage

# if the link is non-existent or broken, use the prod override
[ ! -e docker-compose.override.yml ] && \
    ln -fs $(realpath docker/docker-compose.prod.yml) docker-compose.override.yml

docker compose build --pull
docker compose down --remove-orphans
docker compose up -d
