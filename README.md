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

Kontext und Plan stehen, die Implementierung beginnt mit Meilenstein M1
(Toolchain und Gerüst). Details in [PLAN.md](PLAN.md).

## Entwicklung

```bash
npm run dev      # Dev-Server auf Port 5173
npm run check    # TypeScript und svelte-check
npm test         # Vitest
```

Betrieb später als Container auf Port 3001 (`docker compose up -d --build`).

## Daten

SQLite unter `data/kitchen.db`, Bon-Bilder unter `data/receipts/` — beides
Bind-Mount, nicht in Git. Secrets in `.env` (siehe `.env.example`).
