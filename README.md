# Kitchen Manager

Küchen- und Kühlschrankverwaltung für den Eigengebrauch. Ein Nutzer, läuft auf
dem Raspberry Pi, erreichbar über Tailscale, bedient vom Handy vor dem
Kühlschrank.

Inventar mit Menge und Ort · Kassenbon per KI in Einzelposten zerlegen ·
MHD-Schätzung nach Kategorie · Einkaufsvorschläge aus dem Kaufverhalten ·
Rezeptvorschlag aus dem Bestand.

**Stack:** SvelteKit 2 mit Svelte 5 (Runes), TypeScript, SQLite über Drizzle,
Tailwind. Weicht bewusst vom Python-Standard-Stack in `~/projects/README.md` ab.

## Dokumentation

- [CLAUDE.md](CLAUDE.md) — Stack, Konventionen, Befehle, Grenzen des Projekts
- [PLAN.md](PLAN.md) — Datenmodell, Screens, Meilensteine, offene Entscheidungen

## Stand

M0–M9 stehen im Code. Details in [PLAN.md](PLAN.md).

## Entwicklung

```bash
npm run dev      # Dev-Server auf Port 5173
npm run check    # TypeScript und svelte-check
npm test         # Vitest
```

## Betrieb

Läuft als eigener Container auf Port 3001, `data/` als Bind-Mount daneben —
anders als die Dienste unter `~/docker/`, bleibt dieses Repo unter
`~/projects/kitchen-manager` (siehe `CLAUDE.md`).

```bash
docker compose up -d --build   # bauen und starten
docker compose ps              # Status
docker compose logs -f         # Logs
docker compose down            # stoppen
```

**Migrationen laufen nicht im Container.** `drizzle-kit` ist eine
Dev-Abhängigkeit und steckt bewusst nicht im Laufzeit-Image (siehe
`Dockerfile`). Vor jedem Update mit neuem Schema, mit dem Host-Node:

```bash
npm run db:migrate
docker compose up -d --build
```

**Autostart:** `docker` ist als systemd-Dienst aktiviert
(`systemctl is-enabled docker` → `enabled`), `compose.yml` setzt
`restart: unless-stopped` — ein Neustart des Pi bringt den Container von
selbst wieder hoch, ohne eigene systemd-Unit.

**Backup.** Einfachste sichere Variante bei laufendem WAL-Modus: Container
kurz anhalten, `data/` komplett kopieren, wieder starten — für einen
Ein-Nutzer-Haushalt ist die Sekunde Ausfall kein Problem:

```bash
docker compose stop
cp -r data "data-backup-$(date +%F)"
docker compose start
```

## Daten

SQLite unter `data/kitchen.db`, Bon-Bilder unter `data/receipts/` — beides
Bind-Mount, nicht in Git. Secrets in `.env` (siehe `.env.example`).
