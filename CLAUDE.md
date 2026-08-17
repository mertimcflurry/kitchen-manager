# CLAUDE.md — Kitchen Manager

Dauerhafte Kontextdatei. Wird zu Beginn jeder Sitzung gelesen. Kompakt halten,
bei Stack- oder Konventionsänderungen mit aktualisieren.

## Projektziel

Küchen- und Kühlschrankverwaltung als Web-App. **Ein Haushalt, mehrere
mögliche Nutzer, kein Login** — man wählt sich beim ersten Öffnen aus einer
Liste oder legt sich neu an (siehe „Mehrere Nutzer" unten). Läuft auf einem
Raspberry Pi im Heimnetz, erreichbar über Tailscale, **bedient hauptsächlich
vom Handy im Stehen vor dem Kühlschrank**.

Kernfunktionen: Inventar mit Menge und Ort · Kassenbon fotografieren und per KI
in Einzelposten zerlegen (mit Prüfschritt vor dem Speichern) · MHD über
Kategorie-Defaults geschätzt, pro Artikel überschreibbar · Auswertung zu
Kaufhäufigkeit und Einkaufsliste · KI-Rezeptvorschlag aus dem Bestand.

**Oberste Priorität ist UI/UX.** Das Pflegen des Inventars muss so schnell
gehen, dass es tatsächlich passiert. Jeder überflüssige Tap ist ein Fehler.
Mobile-first, große Touch-Ziele, Mengenänderung ohne Tastatur, „aufgebraucht"
in einer Geste, kein Formular-Ping-Pong. Wenn eine Interaktion umständlich
wirkt: ansprechen, nicht kommentarlos umsetzen.

Die Tastatur-Regel gilt für den **Kühlschrank-Ablauf**, nicht für Konfiguration.
In den Einstellungen sitzt man, macht es selten, und „14" zu tippen schlägt
vierzehnmal auf ein Plus zu drücken. Dasselbe für Schieberegler: im Bestand
verboten (im Stehen nicht zu treffen, verlangt Scheingenauigkeit), sonst nach
Lage. Füllstände laufen deshalb über vier feste Stufen, nicht über einen Regler.

## Hardware & Betrieb

|               |                                                                |
| ------------- | -------------------------------------------------------------- |
| Host          | Raspberry Pi 5, 8 GB RAM, aarch64, Debian 13 (trixie)          |
| Pfad          | `~/projects/kitchen-manager`                                   |
| Dev-Server    | Vite auf Port **5173** (Host-Node)                             |
| Betrieb       | Docker-Container auf Port **3001**                             |
| Tailscale     | Pi = `raspbert-1` / 100.117.150.4                              |
| Belegte Ports | 22 ssh · 3001 diese App · 8010 Paperless · 9000/9443 Portainer |

Port 3001 ist in `~/projects/README.md` für dieses Projekt reserviert. Nicht
ändern, ohne die Tabelle dort mitzupflegen.

## Stack

- **SvelteKit 2** mit **Svelte 5 (Runes)**, TypeScript
- **SQLite** über **Drizzle ORM**, DB unter `data/kitchen.db` (Bind-Mount, nicht in Git)
- **Tailwind** fürs Styling
- **Node 22 LTS**, entpackt unter `~/.local/lib/nodejs/`, Symlinks in
  `~/.local/bin` (schon im PATH). Kein systemweites Node: auf diesem Pi gibt es
  kein passwortloses `sudo`, und Debians `apt`-Node 20 wäre ohnehin zu alt.
  Update per Tarball von nodejs.org ins selbe Verzeichnis.
- **Anthropic SDK** (`@anthropic-ai/sdk`), ausschließlich serverseitig
- Später als PWA installierbar (braucht HTTPS über `tailscale serve`)

Exakte Versionen stehen in `package.json` — dort nachsehen, hier nicht
duplizieren.

**Dev-Zugriff vom Handy:** `http://raspbert-1.tailfa6004.ts.net:5173` oder
`http://100.117.150.4:5173`. Der Vite-Server bindet an alle Interfaces und
erlaubt in `vite.config.ts` gezielt den MagicDNS-Namen — fremde Host-Header
laufen absichtlich in ein 403. Neuer Gerätename im Tailnet heißt: `allowedHosts`
mitpflegen, sonst kommt vom Handy nur „Blocked request".

## Verzeichnisstruktur

```
src/
├── lib/
│   ├── server/         # NUR serverseitig — nie aus Komponenten importieren
│   │   ├── db/
│   │   │   ├── client.ts   # Verbindung und Pragmas, ohne Kit-Importe
│   │   │   ├── schema.ts   # Drizzle-Tabellen und Relationen
│   │   │   ├── queries.ts  # alle Abfragen und Mutationen, testbar ohne Kit
│   │   │   └── seed.ts     # Kategorien und Testdaten
│   │   └── ai/         # Anthropic-Aufrufe, Prompts, Schemas
│   ├── components/     # wiederverwendbare Svelte-Komponenten
│   ├── domain.ts       # geteiltes Vokabular: Orte, Einheiten, Beschriftungen
│   └── date.ts         # MHD-Rechnerei, reine Funktionen mit Tests daneben
├── routes/
│   ├── +layout.svelte  # App-Shell: Rahmen, Bottom-Nav
│   ├── layout.css      # Tailwind-Einstieg und Safe-Area-Helfer
│   └── <route>/        # +page.svelte / +page.server.ts je Screen
data/                   # SQLite-DB, Bon-Bilder — nicht in Git
drizzle/                # generierte Migrationen — in Git
static/                 # PWA-Manifest, Icons
```

Es gibt keine `svelte.config.js`: die Kit-Konfiguration steckt im
`sveltekit()`-Plugin in `vite.config.ts`. Runes-Modus ist dort erzwungen.

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

**Bestandsposten sind Chargen, keine Summen.** `unit` ist die Zähleinheit
(vier Packungen), nicht die Inhaltsmenge (4000 ml). Angebrochenes wird
abgeteilt: „Öffnen" nimmt eine Einheit heraus und legt sie als eigenen Posten
an, mit eigenem, kürzerem MHD. Eine Zeile ist deshalb entweder komplett
verschlossen oder ein einzelnes geöffnetes Stück — nie beides gemischt.

**Mengen liegen in Basiseinheiten.** Gespeichert wird `g` und `ml`, eingegeben
und angezeigt darf `kg` und `l` werden (`toBaseUnit` / `formatQuantity` in
`domain.ts`). Sonst wäre „1 kg" nicht mit „500 g" vergleichbar und jede Abfrage
müsste umrechnen. Die Standardmenge beim Hinzufügen kommt aus dem **letzten
Kauf** desselben Produkts — die App lernt sie aus dem Verhalten, statt sie
irgendwo einstellen zu lassen.

**Keine „Sichern"-Knöpfe.** Formulare speichern bei `change` selbst. Ein
Sichern-Knopf kostet bei jeder Korrektur einen Tap und lässt einen im Zweifel,
ob die Änderung angekommen ist. `change` statt `input`: erst beim Verlassen des
Feldes, nicht bei jedem Zeichen.

**Kein Auth, trotzdem mehrere Nutzer.** Die App hängt hinter Tailscale — das
ist die einzige Grenze. Keine Login-Maske, keine Passwörter, keine Rollen oder
Admin-Rechte: wer Zugriff auf die Seite hat, kann sich als jeder bestehende
Nutzer ausgeben oder einen neuen anlegen, genau wie beim Ändern eines
Bestandspostens. Eine schlanke `user`-Tabelle (`id`, `name`, `created_at`)
dient nur der **Trennung der Bestände**, nicht der Zugriffskontrolle. Gemerkt
wird die Wahl über ein Cookie pro Gerät, nicht über eine Session mit
Ablaufzeit — einmal wählen, das Handy weiß es dann dauerhaft.

Pro Nutzer getrennt: `stock_item`, `shopping_list_item`, `receipt` (und die
davon abhängenden `receipt_line`/`receipt_image`) — das ist „der Vorrat" im
Sinne von CLAUDE.md. **Geteilt bleiben** `category`, `product` und
`product_alias`: das ist Referenzwissen (welche Kategorien, welche
MHD-Defaults, welcher Bon-Text meint welches Produkt), kein Bestand, und
mehrere Personen im selben Haushalt kaufen ohnehin dieselben Produkte. Der
Rezeptvorschlag (M8) braucht deshalb keine eigene Anpassung — er liest
`stock_item`, das ist über die Query-Schicht schon nutzerscoped.

Ohne gültiges Cookie leitet `hooks.server.ts` auf `/nutzer` um (Auswahl oder
Neuanlage), außer man ist schon dort. Kein Onboarding-Assistent, keine
Pflichtfelder außer dem Namen.

**Migrationen** immer über Drizzle generieren, nie das Schema von Hand am
laufenden System ändern.

**`npm run build` gehört zur Prüfung, nicht nur `check`.** Der Dev-Server lässt
Importe aus `$lib/server/` in Browser-Code durch, der Build bricht sie ab
(„Cannot import … as this could leak sensitive information"). Geteiltes
Vokabular — Orte, Einheiten, Füllstufen, Beschriftungen — liegt deshalb in
`src/lib/domain.ts`, nicht im Schema. `import type` ist unkritisch, Typen
verschwinden beim Kompilieren; Laufzeitwerte nicht.

**Datenbank-Fallstricke, die hier schon zugeschlagen haben:**

- Neue Spalten mit Standardwerten brauchen eine **Backfill-Migration**.
  `seedCategories()` ist absichtlich rein ergänzend und rührt bestehende Zeilen
  nicht an — sonst überschriebe es angepasste Werte. Damit bleibt eine neu
  hinzugefügte Spalte auf vorhandenen Zeilen aber NULL. Muster dafür:
  `drizzle/0004_backfill_opened_shelf_life.sql` (UPDATE … WHERE … IS NULL).

- `db.$count(table)` gibt im better-sqlite3-Treiber **keine Zahl** zurück,
  sondern einen Builder. Als Objekt ist der immer wahrheitswertig, `> 0`
  ist also still falsch. Stattdessen `db.select({ n: count() }).from(t).get()`.
- Skripte außerhalb von SvelteKit dürfen `src/lib/server/db/index.ts` nicht
  importieren (`$env` löst dort nicht auf). Sie nehmen `createDb()` aus
  `client.ts` und lesen `process.env` selbst — so gelten überall dieselben
  Pragmas.

## Befehle

```bash
npm run dev            # Dev-Server auf 5173, HMR
npm run build          # Produktions-Build (adapter-node)
npm run preview        # Build lokal testen
npm run check          # svelte-check + TypeScript
npm run lint           # Prettier --check und ESLint
npm run format         # Prettier schreibend
npm test               # Vitest einmalig
npm run test:unit      # Vitest im Watch-Modus

npm run db:generate    # Migration aus Schema-Änderung erzeugen
npm run db:migrate     # Migrationen anwenden
npm run db:seed        # Kategorien anlegen — idempotent, auch produktiv sicher
npm run db:seed:dev    # zusätzlich Testprodukte und Bestand
npm run db:studio      # Drizzle Studio, DB im Browser ansehen
npm run db:push        # Schema direkt pushen — nur zum Wegwerf-Experimentieren

docker compose up -d --build   # Betrieb auf 3001
docker compose logs -f
docker compose down
```

## KI-Integration

- Aufrufe **ausschließlich** in `src/lib/server/ai/`. Der Key darf nie ins
  Frontend, nicht in `PUBLIC_*`-Variablen und nicht in Logs.
- Key aus `.env`: `ANTHROPIC_API_KEY`. Modell für den Bon aus `ANTHROPIC_MODEL`,
  Default `claude-sonnet-5`. Modell für den Rezeptvorschlag separat aus
  `ANTHROPIC_RECIPE_MODEL`, Default `claude-opus-5` — ein Randbedingungsproblem
  (was geht aus dem Bestand, bevorzugt mit Ablaufendem), kein Abtippen.
- **Der Key gehört in `.env`, niemals in `.env.example`.** `.env` ist
  gitignoriert, `.env.example` ausdrücklich nicht — sie geht mit ins Repo.
  In `.env.example` steht nur ein leerer Platzhalter.
- **Warum Sonnet 5 und nicht Haiku:** Bonschrift ist klein. Sonnet 5 und
  Opus 5 verarbeiten Bilder bis 2576 px Kantenlänge, Haiku 4.5 nur bis
  1568 px. Bei der Auflösung entscheidet sich, ob eine Zeile lesbar ist —
  Haiku ist hier nicht „billiger", sondern womöglich untauglich. Sonnet 5
  bietet Opus' Auflösung zu 40 % des Preises, und Belegposten zu extrahieren
  ist keine Denkaufgabe. Für den Rezeptvorschlag (reiner Text, selten) darf
  es Opus sein.
- **Abrechnung:** Die API läuft über Prepaid-Guthaben von
  console.anthropic.com und ist **nicht** vom Claude-Abo gedeckt. Guthaben
  verfällt ein Jahr nach Kauf — bei diesem Verbrauch (~4 $/Jahr) also
  kleine Beträge aufladen, nicht auf Vorrat.
- **Bon-Parsing:** Vision-Aufruf mit Structured Outputs
  (`output_config.format`), damit die Antwort schema-konformes JSON ist statt
  Text zum Parsen. Ergebnis geht **immer** in einen Prüf-Screen, nie direkt
  ins Inventar.
- **Alias-Tabelle vor dem Modell fragen.** Bekannte Bon-Bezeichnungen
  (`BIO-TOFU NAT 400G` → Tofu natur) werden lokal aufgelöst. Nur unbekannte
  Zeilen kosten Tokens.
- Modell-IDs, Preise und SDK-Signaturen nie aus dem Gedächtnis schreiben.
  Dafür die `claude-api`-Skill laden — sie ist auf diesem Rechner derzeit
  **nicht installiert** (Stand 2026-08-11), also ersatzweise auf
  `docs.claude.com` nachschlagen.

## Subagenten

Liegen als Markdown mit YAML-Frontmatter in `.claude/agents/` und gehen mit ins
Repo. Sie werden automatisch anhand ihrer `description` ausgewählt; man kann sie
auch beim Namen nennen („nimm den ui-ux-Agenten dafür"). `/agents` zeigt sie an.

| Agent          | Wofür                                                                    | Modell |
| -------------- | ------------------------------------------------------------------------ | ------ |
| `projektchef`  | Priorität, eigene Feature-Ideen, setzt Kleines auch selbst um.           | Opus   |
| `ui-ux`        | Interaktionsentwurf und Umsetzung. Taps zählen, Alternativen abwägen.    | Opus   |
| `frontend`     | Screens und Komponenten in Runes, Ladezustände, optimistische Updates.   | Sonnet |
| `backend-data` | Schema, Migrationen, Queries, Endpoints, KI-Aufrufe samt Validierung.    | Sonnet |
| `reviewer`     | Nur lesend. Prüft nach jedem Meilenstein, sucht zuerst nach Key-Lecks.   | Opus   |
| `tester`       | Tests schreiben, ausführen, Fehlschläge beheben. Darf den Server prüfen. | Sonnet |

Die übliche Reihenfolge für einen neuen Screen: **ui-ux entwirft und baut**,
`frontend` übernimmt Feinschliff und Zustände, `backend-data` liefert Daten und
Actions, `tester` sichert ab, `reviewer` liest am Ende gegen. Bei kleinen
Änderungen entfällt die Kette — sie ist kein Pflichtweg. `projektchef` sitzt
davor: er entscheidet, was überhaupt drankommt, und darf kleine Sachen direkt
umsetzen, statt sie nur an die anderen weiterzureichen.

`reviewer` hat bewusst **keinen Schreibzugriff**: er meldet, er repariert nicht.
Wer prüft und gleichzeitig repariert, prüft seine eigene Reparatur nicht mehr.

## Was NICHT gemacht werden soll

- **Keine Authentifizierung**, keine Passwörter, keine Sessions mit Ablauf.
  Mehrere Nutzer ja (siehe „Kein Auth, trotzdem mehrere Nutzer" oben), aber
  ohne Rollen, ohne Admin, ohne Rechteprüfung — jeder darf alles, inklusive
  neue Nutzer anlegen.
- **Kein `export let`**, keine Svelte-4-Patterns, keine Stores für lokalen State.
- **Keine Client-seitigen KI-Aufrufe**, kein API-Key im Browser.
- **Kein Barcode-Scanner** — bewusst gestrichen, das Bon-Foto deckt den
  Masseneintrag ab.
- **Keine Nährwerte, keine Kalorien, keine Rezeptdatenbank** — Rezepte kommen
  vom Modell aus dem Bestand, wir pflegen keine eigene Sammlung.
- **Keine getrennten Haushalte auf derselben Instanz**, kein Teilen über das
  eigene Tailnet hinaus. „Mehrere Nutzer" meint Personen im selben Haushalt
  mit eigenem Bestand, keine Mandantenfähigkeit zwischen Haushalten.
- **Kein Postgres, kein separater DB-Container.** SQLite reicht für einen Haushalt.
- **Keine Modals für Standardaktionen.** Menge ändern und „aufgebraucht" müssen
  direkt in der Liste funktionieren.
- **Kein Push nach `origin`**, solange nicht ausdrücklich freigegeben.
