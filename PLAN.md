# PLAN.md — Kitchen Manager

Arbeitsstand und Fahrplan. Haken setzen, wenn etwas fertig **und** am Handy
ausprobiert ist. Angelegt 2026-08-10.

---

## 1. Datenmodell

Getrennt in **Produkt** (Stammdaten, für Statistik und Einkaufsliste) und
**Bestandsposten** (die konkrete Packung im Kühlschrank). Zwei Packungen Tofu
vom selben Produkt haben so eigene MHDs, und „was kaufe ich häufig" bleibt
trotzdem sauber auswertbar.

### `category`

| Feld                      | Typ    | Zweck                                         |
| ------------------------- | ------ | --------------------------------------------- |
| `id`                      | int PK |                                               |
| `name`                    | text   | „Obst", „Milchprodukte", „Konserven"          |
| `default_shelf_life_days` | int    | MHD-Schätzung: Obst 7, Tofu 90, Konserven 365 |
| `emoji`                   | text   | visueller Anker in der Liste, spart Lesezeit  |
| `sort_order`              | int    |                                               |

### `product` — Stammdaten

| Feld              | Typ    | Zweck                                    |
| ----------------- | ------ | ---------------------------------------- |
| `id`              | int PK |                                          |
| `name`            | text   | „Tofu natur"                             |
| `category_id`     | int FK |                                          |
| `default_unit`    | text   | `piece` \| `g` \| `ml` \| `pack`         |
| `shelf_life_days` | int?   | überschreibt die Kategorie, wenn gesetzt |
| `created_at`      | int    |                                          |

### `stock_item` — was gerade da ist

| Feld                       | Typ     | Zweck                                            |
| -------------------------- | ------- | ------------------------------------------------ |
| `id`                       | int PK  |                                                  |
| `product_id`               | int FK  |                                                  |
| `quantity`                 | real    | Zahl, geändert über +/- — nie Tastatur           |
| `unit`                     | text    | vom Produkt vorbelegt                            |
| `location`                 | text    | `fridge` \| `freezer` \| `pantry` (feste Liste)  |
| `best_before`              | int?    | geschätzt oder überschrieben                     |
| `best_before_is_estimated` | bool    | Schätzung wird in der UI anders dargestellt      |
| `fill_level`               | int?    | Prozent bei Angebrochenem, NULL = ungeöffnet     |
| `purchased_at`             | int     |                                                  |
| `consumed_at`              | int?    | gesetzt = aufgebraucht; Basis für die Auswertung |
| `receipt_id`               | int? FK | Herkunft, falls über Bon eingetragen             |

`consumed_at` statt Löschen: daraus ergibt sich „was ist typischerweise bald
alle" ohne eine zweite Historientabelle.

`fill_level` ersetzt ein reines „angebrochen"-Flag. Ein Feld statt zwei, damit
es den widersprüchlichen Zustand „nicht angebrochen, aber ein Viertel übrig"
nicht geben kann. Eingegeben über **vier Knöpfe** (voll / ¾ / ½ / ¼), nicht über
einen Regler: einen Schieber im Stehen genau zu treffen ist die fummeligste
Geste am Handy, und „40 oder 55 Prozent?" kann ohnehin niemand beantworten.
Gespeichert wird trotzdem eine Zahl, damit feinere Eingabe später ohne Migration
möglich bleibt. **Bleibt optional** — bei Dosen und Packungen zählt weiter nur
die Stückzahl. Sobald ein Posten auf die unterste Stufe fällt, ist er Kandidat
für die Einkaufsliste; das ist der eigentliche Zweck, nicht die Anzeige.

### `receipt` + `receipt_line` — Bon-Import

| `receipt`      |        |                                                      |
| -------------- | ------ | ---------------------------------------------------- |
| `id`           | int PK |                                                      |
| `store`        | text?  | vom Modell erkannt                                   |
| `purchased_at` | int?   |                                                      |
| `status`       | text   | `pending` \| `confirmed` \| `discarded`              |
| `raw_response` | text   | Modellantwort roh, für Fehlersuche und Prompt-Tuning |

| `receipt_line`                |         |                                                           |
| ----------------------------- | ------- | --------------------------------------------------------- |
| `id`                          | int PK  |                                                           |
| `receipt_id`                  | int FK  |                                                           |
| `raw_text`                    | text    | „BIO-TOFU NAT 400G"                                       |
| `parsed_name`                 | text    | Modellvorschlag                                           |
| `quantity` / `unit` / `price` |         |                                                           |
| `confidence`                  | text    | `high` \| `low` — Unsicheres wird im Prüf-Screen markiert |
| `product_id`                  | int? FK | nach Zuordnung                                            |
| `status`                      | text    | `pending` \| `accepted` \| `rejected`                     |

### `receipt_image` — mehrere Fotos pro Bon

`id` · `receipt_id` FK · `path` · `sort_order` · `created_at`

Ein langer Kassenbon passt nicht in eine Aufnahme: zwingt man ihn ganz ins Bild,
wird die Schrift so klein, dass auch ein starkes Vision-Modell nur noch rät.
Drei Aufnahmen — oben, Mitte, unten — werden gemeinsam ausgewertet,
`sort_order` hält die Reihenfolge.

### `product_alias` — die Lerntabelle

| Feld                  | Typ         | Zweck            |
| --------------------- | ----------- | ---------------- |
| `id`                  | int PK      |                  |
| `raw_text_normalized` | text UNIQUE | „biotofunat400g" |
| `product_id`          | int FK      |                  |
| `store`               | text?       |                  |
| `hit_count`           | int         |                  |

Wird **vor** dem Modell befragt. Nach ein paar Einkäufen im selben Laden geht
nur noch der unbekannte Rest an die API — spart Tokens und Prüfaufwand.

### `shopping_list_item`

`id` · `product_id?` · `free_text` · `quantity` · `unit` · `is_done` ·
`source` (`manual` \| `suggested`) · `created_at`

---

## 2. Screens

- [ ] **Bestand** (Start) — Standardsortierung nach Ablauf, nicht alphabetisch.
      Orte als segmentierte Tabs oben, nicht als Dropdown.
- [ ] **Schnellaktionen in der Liste** — kein Detail-Screen für den Normalfall.
      Große `−` / `+` direkt an der Zeile, Wischen nach rechts = aufgebraucht.
- [ ] **Artikel-Detail** als Bottom-Sheet — Ort, MHD, Einheit, Füllstand.
      Füllstand als vier Knöpfe mit Balkenvorschau, nie als Regler.
- [ ] **Schnell hinzufügen** — Chips der häufigsten Produkte zum Ein-Tap-Nachlegen,
      darunter erst die Suche. Das Meiste ist Nachkauf von immer demselben.
- [ ] **Bon aufnehmen** — großer Knopf geht direkt in die Kamera
      (`capture="environment"`), darunter klein „aus der Galerie" ohne
      `capture`, was iOS die Auswahl zeigen lässt. Mehrere Aufnahmen pro Bon.
- [ ] **Bon prüfen** — Zeilen als Karten, Unsicheres hervorgehoben,
      „Alle übernehmen" als Primäraktion, Korrigieren als Ausnahme.
- [ ] **Bald schlecht** — nach Dringlichkeit, mit „aufgebraucht"-Geste.
- [ ] **Einkaufsliste** — manuell plus Vorschläge, abhaken mit großem Ziel.
- [ ] **Was koche ich?** — ein Button, Vorschlag aus dem Bestand,
      Ablaufendes bevorzugt.
- [ ] **Einstellungen** — Kategorien und ihre MHD-Defaults, direkt editierbar.
      Der einzige Screen, auf dem eine Tastatur richtig ist: man sitzt dabei,
      macht es selten, und „14" tippen schlägt vierzehnmal Plus drücken.

### UX-Grundsätze, die ich durchhalten will

- **Kein Bestätigungsdialog.** Destruktives passiert sofort, dafür gibt es
  danach ein Undo-Snackbar. Ein Dialog kostet bei jeder Aktion einen Tap, ein
  Undo nur im seltenen Fehlerfall.
- **Keine Tastatur für Mengen.** Ausschließlich +/-.
- **Ein Screen, eine Hauptaktion.** Die Primäraktion sitzt im Daumenbereich unten.
- **Optimistisch aktualisieren.** Die UI reagiert sofort, der Server zieht nach.

---

## 3. Meilensteine

### M0 — Kontext und Repo ✅

- [x] Umgebung erfasst, Konflikte geklärt
- [x] FastAPI-Skeleton entfernt, Container gestoppt, Port 3001 frei
- [x] `CLAUDE.md`, `PLAN.md`, `.gitignore`

### M1 — Toolchain und Gerüst

- [x] Node 22 LTS installiert — ins Home statt systemweit, siehe `CLAUDE.md`
- [x] SvelteKit + TypeScript + Tailwind aufgesetzt
- [x] ESLint, Prettier, Vitest — `check`, `lint`, `test`, `build` laufen sauber
- [x] `.env.example` mit `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
- [x] `npm run dev` läuft, alle fünf Routen liefern 200 über die Tailscale-IP
- [x] Mobile-Grundlayout: Bottom-Nav, Safe-Area, Touch-Ziele ≥ 44 px
- [x] **Am Handy gegengeprüft** — bestätigt

### M2 — Datenmodell

- [x] Drizzle-Schema nach Abschnitt 1 — 7 Tabellen, Indizes, Relationen
- [x] Migrationen erzeugen und anwenden (`drizzle/0000_*.sql`)
- [x] 15 Kategorien mit MHD-Defaults geseedet, idempotent
- [x] Testdaten mit Streuung über alle vier Ampelstufen
- [x] Tests: Idempotenz, Fremdschlüssel, Alias-Eindeutigkeit, Sortierung

### M3 — Inventar (das Herzstück)

- [x] Bestandsliste nach Ablauf, Ort-Tabs mit Anzahl, Ort in der URL
- [x] +/- ohne Tastatur, optimistisch; auf null heißt aufgebraucht
- [x] „Aufgebraucht" per Wischen nach rechts, Undo-Leiste statt Dialog
- [x] Schnell hinzufügen: Häufigkeits-Chips, Sofortsuche, Neuanlage
- [x] Artikel-Detail als Bottom-Sheet: Füllstand, Ort, MHD, Aufgebraucht
- [ ] **Am Handy vor dem Kühlschrank testen, bevor es weitergeht**

### M4 — MHD

- [ ] Automatische Schätzung aus Kategorie beim Anlegen
- [ ] Pro Artikel überschreibbar, Schätzung optisch unterscheidbar
- [ ] „Bald schlecht"-Ansicht mit Ampel
- [ ] Einstellungen: Kategorie-Haltbarkeiten editierbar (Tastatur erlaubt)

### M5 — Bon-Import

- [ ] Kamera direkt, Galerie als zweiter Weg, mehrere Fotos pro Bon
- [ ] Anthropic Vision mit Structured Outputs, serverseitig
- [ ] Prüf-Screen mit Korrigieren und Verwerfen
- [ ] Übernahme ins Inventar in einer Transaktion
- [ ] Fehlerfälle: unlesbar, Timeout, kein Guthaben

### M6 — Alias-Lernen

- [ ] Alias beim Bestätigen einer Zeile schreiben
- [ ] Alias vor dem Modellaufruf abfragen
- [ ] Anzeigen, wie viel ohne API erkannt wurde

### M7 — Auswertung und Einkaufsliste

- [ ] Kaufhäufigkeit je Produkt
- [ ] Typische Verbrauchsdauer aus `purchased_at` → `consumed_at`
- [ ] Vorschläge daraus ableiten
- [ ] Einkaufsliste mit Abhaken

### M8 — Rezeptvorschlag

- [ ] „Was koche ich?" mit Bestand als Kontext
- [ ] Ablaufendes bevorzugen
- [ ] Verbrauchte Zutaten direkt abbuchen können

### M9 — Betrieb

- [ ] Dockerfile für Node 22, Build auf aarch64
- [ ] `compose.yml` auf Port 3001, `data/` als Bind-Mount, non-root
- [ ] Autostart, Backup-Notiz in `~/docker/README.md`-Manier

### M10 — PWA

- [ ] `tailscale serve` für HTTPS einrichten (Voraussetzung für Service Worker)
- [ ] Manifest, Icons, „Zum Homescreen"
- [ ] Offline-Ansicht des Bestands

---

## 4. Offene Entscheidungen

Angenommene Defaults, bis widersprochen wird:

- [ ] **Anthropic-Key** — wird vom Nutzer selbst in `.env` abgelegt; ich schreibe
      nur `.env.example`. Modell konfigurierbar, Default `claude-opus-5`,
      Wechsel auf Haiku möglich, sobald an echten Bons gemessen.
- [ ] **`tailscale serve`** — erst zu M10, dann verbindlich, weil iOS ohne
      HTTPS keinen Service Worker registriert.
- [ ] **Bon-Bilder** — 90 Tage aufbewahren, dann automatisch löschen.
- [ ] **Orte** — feste Liste Kühlschrank/Gefrier/Vorrat, keine freien Orte.
- [ ] **`~/projects/README.md`** — Vermerk nachtragen, dass dieses Projekt vom
      dokumentierten Python-Standard-Stack abweicht (noch nicht gemacht,
      liegt außerhalb dieses Repos).
- [ ] **Preise vom Bon** — werden gespeichert, aber vorerst nicht ausgewertet.
      Preisverlauf je Produkt wäre reizvoll, ist aber Scope-Creep.

## 5. Bewusst weggelassen

Damit das Projekt nicht ausufert — jeder Punkt hier ist eine Entscheidung,
keine Lücke:

- **Barcode-Scanner** — löst nur den Einzelfall, das Bon-Foto deckt den
  Masseneintrag ab, kostet aber eine komplette Kamera-Pipeline.
- **Nährwerte und Kalorien** — braucht eine gepflegte Produktdatenbank.
- **Eigene Rezeptsammlung** — Rezepte kommen vom Modell, nicht aus einer
  Verwaltung, die selbst wieder gepflegt werden will.
- **Mehrere Nutzer, Teilen, Haushalte** — ein Nutzer, keine Auth.
- **Automatische Nachbestellung** bei Händlern.
- **Native App** — PWA reicht.
