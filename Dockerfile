# Baut nativ auf dem Pi selbst (aarch64) — kein Cross-Build, kein buildx nötig.
# Dieselbe Node-Version wie auf dem Host, siehe CLAUDE.md.
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3 kompiliert ohne passendes Prebuild nativ nach — die
# Werkzeuge dafür bleiben in diesem Stage, landen nicht im Laufzeit-Image.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# SvelteKits Analyse-Schritt lädt beim Build alle Server-Module einmal an,
# darunter `db/index.ts` — die wirft ohne `DATABASE_URL` sofort. Kein
# Geheimnis, nur der aus `.env.example` bekannte Pfad; `.env` selbst bleibt
# laut `.dockerignore` draußen und kommt erst zur Laufzeit über `env_file`.
ENV DATABASE_URL=data/kitchen.db
RUN npm run build

# vite, svelte-check, drizzle-kit & co. gehören nicht ins Laufzeit-Image —
# npm prune lässt das schon kompilierte better-sqlite3 unangetastet stehen,
# eine zweite native Kompilation im Runtime-Stage entfällt damit.
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

# Nicht als root laufen. Das offizielle Image bringt schon einen Nutzer
# „node" mit uid/gid 1000 mit — passend zum Bind-Mount unter data/, der auf
# dem Pi dem ersten angelegten Nutzer gehört, ebenfalls 1000.
COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 3001

# Migrationen laufen bewusst nicht hier, sondern vorher auf dem Host über
# `npm run db:migrate` gegen denselben Bind-Mount — drizzle-kit ist eine
# Dev-Abhängigkeit und gehört nicht ins Laufzeit-Image, siehe README unten.
CMD ["node", "build"]
