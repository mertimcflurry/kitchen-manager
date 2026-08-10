# CLAUDE.md — Kitchen Manager

Dauerhafte Kontextdatei. Wird zu Beginn jeder Sitzung gelesen. Kompakt halten,
bei Stack- oder Konventionsänderungen mit aktualisieren.

## Projektziel

Küchen- und Kühlschrankverwaltung als Web-App. **Ein einziger Nutzer**, läuft
auf einem Raspberry Pi im Heimnetz, erreichbar über Tailscale, **bedient
hauptsächlich vom Handy im Stehen vor dem Kühlschrank**.

Kernfunktionen: Inventar mit Menge und Ort · Kassenbon fotografieren und per KI
in Einzelposten zerlegen (mit Prüfschritt vor dem Speichern) · MHD über
Kategorie-Defaults geschätzt, pro Artikel überschreibbar · Auswertung zu
Kaufhäufigkeit und Einkaufsliste · KI-Rezeptvorschlag aus dem Bestand.

**Oberste Priorität ist UI/UX.** Das Pflegen des Inventars muss so schnell
gehen, dass es tatsächlich passiert. Jeder überflüssige Tap ist ein Fehler.
Mobile-first, große Touch-Ziele, Mengenänderung ohne Tastatur, „aufgebraucht"
in einer Geste, kein Formular-Ping-Pong. Wenn eine Interaktion umständlich
wirkt: ansprechen, nicht kommentarlos umsetzen.

## Hardware & Betrieb

| | |
|---|---|
| Host | Raspberry Pi 5, 8 GB RAM, aarch64, Debian 13 (trixie) |
| Pfad | `~/projects/kitchen-manager` |
| Dev-Server | Vite auf Port **5173** (Host-Node) |
| Betrieb | Docker-Container auf Port **3001** |
| Tailscale | Pi = `raspbert-1` / 100.117.150.4 |
| Belegte Ports | 22 ssh · 3001 diese App · 8010 Paperless · 9000/9443 Portainer |

Port 3001 ist in `~/projects/README.md` für dieses Projekt reserviert. Nicht
ändern, ohne die Tabelle dort mitzupflegen.

## Stack

- **SvelteKit 2** mit **Svelte 5 (Runes)**, TypeScript
- **SQLite** über **Drizzle ORM**, DB unter `data/kitchen.db` (Bind-Mount, nicht in Git)
- **Tailwind** fürs Styling
- **Node 22 LTS** über NodeSource — Debians `apt`-Node 20 ist zu alt
- **Anthropic SDK** (`@anthropic-ai/sdk`), ausschließlich serverseitig
- Später als PWA installierbar (braucht HTTPS über `tailscale serve`)

Exakte Versionen stehen nach dem Setup in `package.json` — dort nachsehen, hier
nicht duplizieren.

## Verzeichnisstruktur

```
src/
├── lib/
│   ├── server/         # NUR serverseitig: db/, ai/, Secrets
│   │   ├── db/         # Drizzle-Schema, Migrationen, Queries
│   │   └── ai/         # Anthropic-Aufrufe, Prompts, Schemas
│   ├── components/     # wiederverwendbare Svelte-Komponenten
│   └── types.ts        # geteilte Typen
├── routes/             # SvelteKit-Routing, +page.svelte / +page.server.ts
└── app.css             # Tailwind-Einstieg
data/                   # SQLite-DB, Bon-Bilder — nicht in Git
drizzle/                # generierte Migrationen — in Git
static/                 # PWA-Manifest, Icons
```

Alles unter `src/lib/server/` wird von SvelteKit garantiert nie ins Frontend
gebündelt. API-Key und DB-Zugriff gehören ausnahmslos dorthin.

## Konventionen

**Svelte 5 Runes, kein Legacy.** `$state`, `$derived`, `$effect`, `$props`.
Kein `export let`, keine Stores für lokalen State. Stores nur, wenn echter
globaler Cross-Route-State entsteht — vorher fragen.

**Sprache.** UI-Texte deutsch. Bezeichner, Dateinamen, Kommentare und
Commit-Messages englisch.

**Datenbankzugriff** nur in `+page.server.ts` / `+server.ts` über Drizzle,
niemals im Client. Mutationen als SvelteKit **Form Actions**, damit es ohne
JS-Roundtrip schnell bleibt.

**Kein Auth.** Die App hängt hinter Tailscale. Keine Login-Maske, keine
Sessions, keine Nutzer-Tabelle.

**Migrationen** immer über Drizzle generieren, nie das Schema von Hand am
laufenden System ändern.

## Befehle

```bash
npm run dev            # Dev-Server auf 5173, HMR
npm run build          # Produktions-Build
npm run preview        # Build lokal testen
npm run check          # svelte-check + TypeScript
npm run lint           # ESLint + Prettier
npm test               # Vitest

npm run db:generate    # Migration aus Schema-Änderung erzeugen
npm run db:migrate     # Migrationen anwenden
npm run db:studio      # Drizzle Studio, DB im Browser ansehen

docker compose up -d --build   # Betrieb auf 3001
docker compose logs -f
docker compose down
```

## KI-Integration

- Aufrufe **ausschließlich** in `src/lib/server/ai/`. Der Key darf nie ins
  Frontend, nicht in `PUBLIC_*`-Variablen und nicht in Logs.
- Key aus `.env`: `ANTHROPIC_API_KEY`. Modell aus `ANTHROPIC_MODEL`,
  Default `claude-opus-5`.
- **Bon-Parsing:** Vision-Aufruf mit Structured Outputs
  (`output_config.format`), damit die Antwort schema-konformes JSON ist statt
  Text zum Parsen. Ergebnis geht **immer** in einen Prüf-Screen, nie direkt
  ins Inventar.
- **Alias-Tabelle vor dem Modell fragen.** Bekannte Bon-Bezeichnungen
  (`BIO-TOFU NAT 400G` → Tofu natur) werden lokal aufgelöst. Nur unbekannte
  Zeilen kosten Tokens.
- Bei Arbeit an KI-Code die `claude-api`-Skill laden, statt Modell-IDs,
  Preise oder SDK-Signaturen aus dem Gedächtnis zu schreiben.

## Was NICHT gemacht werden soll

- **Keine Authentifizierung**, keine Nutzerverwaltung, keine Mandantenfähigkeit.
- **Kein `export let`**, keine Svelte-4-Patterns, keine Stores für lokalen State.
- **Keine Client-seitigen KI-Aufrufe**, kein API-Key im Browser.
- **Kein Barcode-Scanner** — bewusst gestrichen, das Bon-Foto deckt den
  Masseneintrag ab.
- **Keine Nährwerte, keine Kalorien, keine Rezeptdatenbank** — Rezepte kommen
  vom Modell aus dem Bestand, wir pflegen keine eigene Sammlung.
- **Keine Multi-Haushalt-Features**, kein Teilen, keine Freigaben.
- **Kein Postgres, kein separater DB-Container.** SQLite reicht für einen Nutzer.
- **Keine Modals für Standardaktionen.** Menge ändern und „aufgebraucht" müssen
  direkt in der Liste funktionieren.
- **Kein Push nach `origin`**, solange nicht ausdrücklich freigegeben.
