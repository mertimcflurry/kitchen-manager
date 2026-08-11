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

**Angebrochenes wird abgeteilt, nicht markiert.** Vier verschlossene Kartons
Hafermilch und einer davon offen sind zwei verschiedene Dinge, nicht eines mit
einem Prozentwert: der offene hält Tage, die anderen Monate. „Öffnen" nimmt
deshalb **eine** Einheit aus dem Posten heraus und legt sie als eigenen an. Das
Schema kann mehrere Posten je Produkt — genau dafür.

Daraus folgt `opened_shelf_life_days` an Kategorie und Produkt: eine offene
Dose hält drei Tage, keine 365. Öffnen verkürzt dabei nur, es verlängert nie.
Wo Öffnen nichts ändert (Tiefkühl, Trockenvorrat), steht NULL.

`unit` ist die **Zähleinheit**, nicht die Inhaltsmenge: vier Packungen, nicht
4000 ml. Die Packungsgröße verwaltet die App bewusst nicht — sie hilft beim
Blick in den Kühlschrank nicht und macht jede Eingabe länger.

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
- [x] **Bon aufnehmen** — großer Knopf geht direkt in die Kamera
      (`capture="environment"`), darunter klein „aus der Galerie" ohne
      `capture`, was iOS die Auswahl zeigen lässt. Mehrere Aufnahmen pro Bon.
- [x] **Bon prüfen** — Zeilen als Karten, Unsicheres hervorgehoben,
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
- [x] Artikel-Detail als Bottom-Sheet: Öffnen/Füllstand, Ort, MHD, Aufgebraucht
- [x] Öffnen teilt eine Einheit ab und verkürzt deren MHD
- [x] Menge und Einheit änderbar, Eingabe in kg und l möglich
- [x] Formulare sichern bei Änderung selbst, kein „Sichern"-Knopf
- [ ] **Am Handy vor dem Kühlschrank testen, bevor es weitergeht**

### M4 — MHD

- [x] Automatische Schätzung aus Kategorie beim Anlegen
- [x] Pro Artikel überschreibbar, Schätzung optisch unterscheidbar
- [x] „Bald schlecht"-Ansicht mit Ampel — ortsübergreifend, Horizont 7 Tage,
      drei Blöcke (abgelaufen / heute und morgen / diese Woche)
- [x] Einstellungen: Kategorie-Haltbarkeiten editierbar (Tastatur erlaubt),
      erreichbar über das Symbol oben rechts im Bestand
- [x] **Abzeichen an der „Ablauf"-Kachel der Bottom-Nav.** Zählt Abgelaufenes
      und heute/morgen Fälliges (`countUrgent()`, dieselbe Schwelle wie der
      rote/orange Punkt in der Liste), geladen in `+layout.server.ts` und
      damit auf jeder Seite sichtbar. Der Tap-Test: null zusätzliche Taps, man
      sieht beim Öffnen der App sofort, ob überhaupt etwas dringend ist, statt
      dafür extra auf „Ablauf" tippen zu müssen. `invalidateAll()` nach jeder
      Bestandsänderung (schon vorhanden, siehe `forms.ts`) hält die Zahl aktuell.
- [ ] **Am Handy gegenprüfen**: Blocküberschriften im Küchenlicht, Zahlenfelder
      in den Einstellungen, Undo-Leiste über dem Plus-Knopf, Lesbarkeit des
      roten Abzeichens auf der Nav-Leiste bei Sonnenlicht

### M5 — Bon-Import

- [x] Kamera direkt (`capture`), Galerie als zweiter Weg ohne `capture`,
      bis zu vier Aufnahmen pro Bon. Verkleinert wird im Browser auf die
      Kantenlänge, die das Modell ohnehin maximal verarbeitet (2576 px) —
      das Hochladen war sonst der langsamste Teil des ganzen Vorgangs.
- [x] Anthropic Vision mit Structured Outputs, ausschließlich in
      `src/lib/server/ai/`. Thinking abgeschaltet: Bonposten abzutippen ist
      keine Denkaufgabe, siehe aber §4b.
- [x] **Das Modell wählt auch die Kategorie** — aus den Namen, die es in der
      Datenbank wirklich gibt. Kostet keinen zusätzlichen Tap und keinen
      zweiten Aufruf, macht aber den Unterschied zwischen einer brauchbaren
      MHD-Schätzung und zwanzig Artikeln in „Sonstiges" mit dessen 30 Tagen.
- [x] Prüf-Screen mit Korrigieren und Verwerfen: Namen editierbar, Menge über
      +/-, Ort durch Antippen durchgeschaltet, Zeile verwerfen mit einem Tap
      und rückholbar. Geprüft wird im Browser, bestätigt wird der ganze Bon.
- [x] Übernahme ins Inventar in einer Transaktion, mit Herkunft am Posten
- [x] Fehlerfälle: unlesbar, Zeitüberschreitung, kein Guthaben, kein Schlüssel —
      jeder mit eigenem Satz, weil jeder eine andere Reaktion verlangt.
      Fehlgeschlagene Bons bleiben samt Rohantwort als `discarded` liegen.
- [ ] **Am Handy gegenprüfen**: echter Bon bei Küchenlicht, Kamera-Knopf auf
      iOS, Lesbarkeit der Karten, ob vier Aufnahmen für einen langen Bon reichen

### M6 — Alias-Lernen

- [x] Alias beim Bestätigen einer Zeile schreiben (`confirmReceipt`)
- [x] Alias abfragen, **bevor** die Zeilen gespeichert werden. Nicht vor dem
      Modellaufruf — das Foto muss so oder so gelesen werden, siehe §4b.
- [x] Sichtbar machen, was ohne Raten erkannt wurde: bekannte Zeilen tragen
      im Prüf-Screen „bekannt" und gelten als sicher. Eine Statistik darüber
      hinaus wäre eine Zahl, die niemand antippt.

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

- [x] **Anthropic-Key** — liegt in `.env`, im Repo steht nur `.env.example`.
      Modell über `ANTHROPIC_MODEL`, Default `claude-sonnet-5`: Haiku 4.5
      verarbeitet Bilder nur bis 1568 px und ist für Bonschrift damit nicht
      billiger, sondern untauglich. Ein synthetischer Bon kostete im Test
      ~1,5 ct und brauchte 7 Sekunden.
- [ ] **`tailscale serve`** — erst zu M10, dann verbindlich, weil iOS ohne
      HTTPS keinen Service Worker registriert.
- [ ] **Bon-Bilder** — 90 Tage aufbewahren, dann automatisch löschen. Liegen
      seit M5 unter `data/receipts/`, also im Bind-Mount neben der Datenbank;
      der Aufräumjob fehlt noch und gehört zu M9.
- [ ] **Orte** — feste Liste Kühlschrank/Gefrier/Vorrat, keine freien Orte.
- [ ] **`~/projects/README.md`** — Vermerk nachtragen, dass dieses Projekt vom
      dokumentierten Python-Standard-Stack abweicht (noch nicht gemacht,
      liegt außerhalb dieses Repos).
- [ ] **Preise vom Bon** — werden gespeichert, aber vorerst nicht ausgewertet.
      Preisverlauf je Produkt wäre reizvoll, ist aber Scope-Creep.

## 4b. Offene Fragen aus dem Gebrauch

Aufgefallen beim Benutzen, bewusst nicht sofort gelöst. Erst entscheiden, wenn
klar ist, ob es im Alltag stört.

- [x] **Undo-Leiste verdeckt den Plus-Knopf.** Gelöst über feste Spuren: der
      untere Streifen ist in `layout.css` als `--lane-fab` (5.25rem) und
      `--lane-snackbar` (9.25rem) festgeschrieben, die Leiste liegt damit
      immer über dem Knopf. Verworfen: Leiste schmaler und links ausrichten
      (auf 360 px bleibt für „Käse aufgebraucht" + „Rückgängig" kein Platz
      neben einem 3.5rem-Kreis), und den Knopf ausblenden (nimmt sechs Sekunden
      lang eine Aktion weg und lässt das Layout springen). Neue feste Ecken
      hängen sich an eine Spur, statt eine Zahl zu schätzen.
- [x] **Lose Ware: Menge und Füllstand widersprechen sich.** Gelöst über
      `remainingQuantity()` in `domain.ts`: die Liste zeigt bei angebrochener
      loser Ware (g/ml) die verrechnete Restmenge mit „≈" statt der gekauften
      — aus „200 g" neben „50 %" wird „≈100 g". `quantity` bleibt in der DB
      unverändert das Kaufgewicht, nur die Anzeige rechnet um; das Menge-Feld
      im Detail-Sheet zeigt weiterhin den Rohwert, weil man dort das Kaufgewicht
      korrigiert, nicht die Restmenge. Zählbares (Stück, Packung) bleibt
      unangetastet — „0,75 Stück" wäre keine ehrliche Angabe zu einem
      angebrochenen Joghurt.
- [ ] **Nachkauf erzeugt eine zweite Zeile.** Vier neue Hafermilch neben den
      alten sind zwei Posten mit verschiedenen Daten — richtig, aber die Liste
      wird länger. Alternative: eine gruppierte Zeile je Produkt mit
      aufklappbaren Chargen.
- [ ] **Packungsgröße fehlt.** Wir zählen vier Packungen, wissen aber nicht,
      dass jede ein Liter ist. Für M8 („was koche ich") ist der Unterschied
      zwischen drei Litern und drei Bechern relevant. Wäre ein Feld am Produkt —
      erst bauen, wenn der Rezeptvorschlag zeigt, dass es fehlt.
- [ ] **Standardmenge lernt aus dem letzten Kauf.** Kein eingestellter Wert,
      sondern der zuletzt verwendete. Offen: reicht das, oder braucht es doch
      eine feste Vorgabe je Produkt, die man einmal setzt?
- [x] **Die Alias-Tabelle spart Prüfaufwand, keine Tokens.** CLAUDE.md sagt
      „Alias-Tabelle vor dem Modell fragen — nur unbekannte Zeilen kosten
      Tokens". Beim Bild-Aufruf geht das nicht auf: Welche Zeilen auf dem Bon
      stehen, weiß man erst, nachdem das Foto gelesen wurde, und gelesen wird
      es ganz oder gar nicht. Der Alias greift deshalb direkt danach und
      ersetzt den Namensvorschlag des Modells durch das früher bestätigte
      Produkt. Der Gewinn ist echt, nur ein anderer: nicht weniger Tokens,
      sondern weniger Korrigieren im Prüf-Screen — und beim zweiten Einkauf
      ist „BIO-TOFU NAT 400G" wieder derselbe Artikel und nicht ein zweiter.
- [ ] **Standardort je Kategorie.** Der Prüf-Screen legt alles erst einmal in
      den Kühlschrank; Tiefkühlpizza und Nudeln muss man einzeln umtippen.
      Ein Feld `default_location` an der Kategorie (in den Einstellungen
      editierbar, wie die Haltbarkeiten) würde das für den Großteil eines
      Einkaufs erledigen — Tiefkühl → Gefrier, Konserven → Vorrat. Kostet eine
      Migration und eine Spalte in den Einstellungen. **Bewusst zurückgestellt,
      bis ein echter Bon zeigt, wie oft man wirklich umtippt** — bei einem
      Kühlschrank-lastigen Einkauf wären es zwei Taps und die Sache wäre es
      nicht wert.
- [ ] **Einkaufsliste aus der Undo-Leiste.** Wer etwas aufbraucht, weiß in
      genau diesem Moment, dass es fehlt — und genau dann steht die
      Undo-Leiste schon da. Ein zweiter Knopf „+ Einkaufsliste" daneben kostet
      keinen Screen, keine Einstellung und keinen Umweg, sondern einen Tap im
      richtigen Augenblick. Wartet auf M7, weil eine Liste, die man befüllen
      aber nirgends ansehen kann, schlimmer ist als keine.
- [ ] **Thinking beim Bon-Aufruf ist aus.** Spart Zeit und Geld, und an einem
      synthetischen Bon war die Trefferquote makellos. Ob das an echter,
      schiefer, geknickter Bonschrift hält, zeigt erst der Alltag — falls
      nicht, ist `thinking: adaptive` in `receipt.ts` der erste Hebel, vor
      jedem Prompt-Basteln.
- [ ] **Marker für geschätzte MHDs entfernt.** Das `?` stand in fast jeder
      Zeile und sagte damit nichts. Ob geschätzt oder abgetippt, steht jetzt nur
      im Detail-Sheet. Offen, ob das in der Liste doch fehlt — dann aber als
      klareres Zeichen, nicht als Fragezeichen.

## 4c. Aus dem Review offen (M4)

`reviewer` hat die M4-Umsetzung (Ablauf-Screen, Einstellungen, Undo/Plus-Fix)
gegengelesen, bevor sie committet wurde. Befunde 1–7 und 10 sind behoben
(backend-data und frontend parallel, `check`/`lint`/`test`/`build` grün,
100 Tests):

- [x] **Kein Fehler-Handling in `src/lib/forms.ts`.** `post()` fängt jetzt
      `fetch`/`deserialize`-Fehler ab und ruft in jedem Fehlerfall (Wurf,
      `error`, `failure`) `invalidateAll()` auf, damit die UI wieder den
      echten Serverstand zeigt statt einer stehengebliebenen optimistischen
      Änderung.
- [x] **Einstellungen: Rückfall auf den letzten gültigen Wert greift nicht.**
      Der `use:enhance`-Callback setzt die betroffenen `<input>`-Elemente bei
      Fehlschlag jetzt direkt per DOM auf den zuletzt bekannten gültigen Wert
      zurück, statt sich auf Svelte-Reaktivität zu verlassen (Falle: `set_value`
      cacht den zuletzt gesetzten Wert und überspringt sonst das Update).
- [x] **Einstellungen: leeres „hält Tage" meldet fälschlich „gespeichert".**
      Löst jetzt `fail(400, …)` aus statt `undefined` still zu lassen.
- [x] **Einstellungen: keine Ganzzahlprüfung.** `updateCategory` prüft jetzt
      `Number.isInteger` plus eine Obergrenze von 3650 Tagen für beide Felder;
      die harte Fehlermeldung sitzt in der Action-Schicht.
- [x] **`undo`-Action prüft `fillLevel` jetzt gegen `FILL_LEVELS`,** wie schon
      die Schwester-Action `fill`.
- [x] **Menge manuell auf „0" setzen setzt jetzt `consumedAt`,** analog zu
      `adjustQuantity` — keine Zombie-Zeile mehr.
- [x] **Undo-Timer startet bei zwei schnellen Aktionen neu.** Beide
      Snackbar-Nutzungen (`/` und `/ablauf`) stecken jetzt in
      `{#key undoState.id}`, ein neues Undo erzwingt einen echten Remount.
- [x] **FAB-Überlappung behoben.** `src/routes/+page.svelte` hat zusätzliches
      `pb-20` an der Bestandsliste, nur dort — `/ablauf` hat keinen FAB.
      **Am Handy gegenprüfen**, ob es reicht.

Zurückgestellt, niedrige Priorität: doppeltes `parseId`/`parseLocation`
zwischen `stock-actions.ts`, `einstellungen/+page.server.ts` und
`hinzufuegen/+page.server.ts`; generische Fehlermeldung in den Einstellungen
statt Server-Text; Datums-Label wie „heute" veraltet, wenn die Seite über
Mitternacht offen bleibt.

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
