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
| `initial_quantity`         | real?   | Startmenge — Bezugsgröße für den Balken          |
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
- [x] **Einkaufsliste** — manuell plus Vorschläge, abhaken mit großem Ziel.
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

**Stand 2026-08-12:** M0–M7 stehen im Code, `check`/`lint`/`test`/`build`
laufen sauber (154 Tests). Offen ist überall nur noch das Gegenprüfen am
Handy — die Punkte stehen bei den jeweiligen Meilensteinen. Als Nächstes
sinnvoll: **M8 (Rezeptvorschlag)** oder **M9 (Betrieb im Container)**; M9 hat
den Aufräumjob für Bon-Bilder als offene Zutat (§4).

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
- [x] Nachgeschärft nach dem ersten echten Bon: Gebinde werden nach ihrem
      Inhalt gezählt (10 Eier statt 1 Karton), und der Ort einer Zeile kommt
      aus ihrer Kategorie statt pauschal aus dem Kühlschrank. Beides in §4b.

### M7 — Auswertung und Einkaufsliste

- [x] Einkaufsliste mit Abhaken. Die ganze Zeile ist das Ziel, nicht ein
      Kästchen daneben — im Laden tippt man einhändig und im Gehen.
      Abgehaktes wird **nicht gelöscht**, sondern rutscht in einen stillen
      Block darunter: das ist das Undo für den Fehlgriff im Regal, ohne
      Snackbar, ohne Timer, ohne Dialog. „Wegräumen" löscht den Block.
- [x] Vorschläge: mindestens zweimal gekauft **und** gerade kein offener
      Posten da, zuletzt Aufgebrauchtes vorn. Als Chips, ein Tap.
- [x] **Der Bon hakt ab, was im Wagen lag.** Beim Bestätigen eines Bons werden
      passende Listenposten erledigt — über die Produkt-ID und über den
      Freitext, den man aufgeschrieben hat, bevor es das Produkt gab
      („Zahnpasta"). Kostet null Taps und ist über den Erledigt-Block
      sichtbar und umkehrbar.
- [ ] ~~Kaufhäufigkeit als eigene Auswertung~~ — steckt in den Vorschlägen.
      Eine Seite mit Zahlen wäre eine Zahl, die niemand antippt.
- [ ] ~~Typische Verbrauchsdauer aus `purchased_at` → `consumed_at`~~ —
      **verworfen für den Vorschlag**: sie schlüge Dinge vor, die noch da
      sind, und ein Vorschlag, den man wegwischen muss, kostet mehr als einer,
      der fehlt. Die Daten liegen weiter vor, falls M8 sie braucht.
- [ ] **Am Handy gegenprüfen**: Trefferfläche der Zeilen im Gehen, ob der
      Erledigt-Block unten stört, ob das Eingabefeld unter der Bottom-Nav
      erreichbar bleibt, wenn die Tastatur offen ist

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
- [x] **Standardort je Kategorie.** Gelöst, aber kleiner als geplant: nicht als
      Spalte `default_location` mit Migration und dritter Spalte in den
      Einstellungen, sondern als Konstante `defaultLocationFor()` in
      `domain.ts`. Tiefkühl → Gefrier, Konserven/Trockenvorrat/Gewürze/
      Süßes/Getränke/Backwaren → Vorrat, alles andere → Kühlschrank wie bisher.
      Der Prüf-Screen setzt damit den Ort aus der Kategorie, die das Modell
      ohnehin schon wählt. Falsch liegt die Tabelle nur bei Randfällen
      (Kartoffeln, angebrochener Saft) — und die kosten denselben einen Tap,
      den man ohne Tabelle bei jeder Zeile hätte. Editierbar zu machen wäre
      Aufwand für eine Einstellung, die man einmal im Leben anfasst.
- [ ] **Große Produkt- und Alias-Datenbasis vorab einlesen — verworfen, bis
      etwas dafür spricht.** Der Gedanke: 100–300 gängige deutsche Artikel mit
      Kategorie, MHD und Bon-Bezeichnung mitliefern, statt sie aus echten Bons
      zu lernen. Durchgerechnet bleibt davon wenig übrig:
      _Kategorie beim ersten Bon_ — schon gelöst, das Modell wählt aus den
      Kategorien, die es in der Datenbank wirklich gibt (M5).
      _MHD-Defaults_ — die 15 Kategorien decken das ab; „Milch 7 statt
      Milchprodukte 10" ist ein Tag Unterschied und in den Einstellungen in
      einer Minute nachgezogen.
      _Tokens_ — spart nichts, siehe den Alias-Punkt weiter oben: das Foto muss
      so oder so ganz gelesen werden.
      _Vorgeratene Aliase sind sogar schädlich._ Ein Alias-Treffer wird
      geglaubt: er ersetzt den Namensvorschlag des Modells, setzt `productId`
      und gilt im Prüf-Screen als „bekannt". Ein geratener Eintrag würde also
      still und selbstbewusst falsch zuordnen — während gelernte Aliase per
      Konstruktion stimmen, weil sie aus einer bestätigten Zeile stammen.
      _Ein Katalog leerer Produkte_ verstopft außerdem die Suche im
      Hinzufügen-Screen und lässt „neu anlegen" nie erscheinen.
      Übrig blieb genau die eine Tabelle, die man vorab wissen kann und die
      nicht teuer falsch liegen kann: Kategorie → Standardort, siehe oben.
      Wieder aufmachen, wenn nach zehn echten Bons dieselben Bezeichnungen
      immer noch danebenliegen — dann aber gezielt für die Läden, in denen
      wirklich eingekauft wird.
- [x] **Einkaufsliste aus der Undo-Leiste — nach M7 verworfen.** Der Gedanke
      war: wer etwas aufbraucht, weiß in genau dem Moment, dass es fehlt, und
      die Undo-Leiste steht ohnehin schon da. Mit den Vorschlägen ist der
      Moment aber schon abgedeckt: was man mindestens zweimal gekauft hat und
      gerade aufgebraucht hat, steht beim nächsten Blick auf „Einkauf" als
      Chip da — ohne Knopf, ohne Tap. Übrig bliebe der Erstkauf, also der
      seltene Fall. Dem stünde gegenüber: ein zweiter Knopf direkt neben
      „Rückgängig", auf 360 px Breite, in einer Leiste, die nach sechs
      Sekunden weg ist. Ein Fehlgriff dort trifft die Undo-Aktion — das ist
      der teuerste Nachbar, den ein Knopf haben kann.
- [ ] **Kein Abzeichen an der Einkauf-Kachel.** Das Abzeichen an „Ablauf"
      beantwortet eine Frage, die man sonst nicht sieht („brennt was?"). Wie
      viele Posten auf der Einkaufsliste stehen, weiß man dagegen — man hat
      sie selbst draufgesetzt. Eine Zahl, die nichts auslöst, ist Zierde.
      Wieder aufmachen, falls sich zeigt, dass man die Liste im Laden
      schlicht vergisst.
- [ ] **Einkaufsliste ohne Sortierung nach Ladenweg.** Die Posten stehen in
      der Reihenfolge, in der man an sie gedacht hat. Nach Kategorie zu
      gruppieren („Obst zuerst, dann Kühlregal") wäre der nächste naheliegende
      Schritt — aber die Reihenfolge im Laden hängt am Laden, nicht an der
      Kategorie, und Freitextposten hätten gar keine. Erst bauen, wenn ein
      echter Einkauf zeigt, dass man zurückläuft.
- [ ] **Thinking beim Bon-Aufruf ist aus.** Spart Zeit und Geld, und an einem
      synthetischen Bon war die Trefferquote makellos. Ob das an echter,
      schiefer, geknickter Bonschrift hält, zeigt erst der Alltag — falls
      nicht, ist `thinking: adaptive` in `receipt.ts` der erste Hebel, vor
      jedem Prompt-Basteln.
- [x] **Gebinde wurden als eine Packung gezählt.** Der erste echte Bon las
      „BIO EIER 10ER" als 1 Pck. Formal richtig — `unit` ist die Zähleinheit —,
      im Kühlschrank falsch: man nimmt ein Ei heraus, nicht einen Karton, und
      „1 Pck" beantwortet die einzige Frage nicht, die man dort hat. Der
      Prompt zählt jetzt den Inhalt, wo der Inhalt einzeln verbraucht wird
      (Eier, Joghurtbecher, Brötchen, Flaschen); Gewicht einer einzelnen
      Packung („MEHL 1KG") bleibt 1 Pck. An einem synthetischen Bon mit echtem
      Modellaufruf gegengeprüft: 10 Eier, 4 Joghurt, 6 Brötchen, aber 1 Mehl
      und 412 g lose Tomaten.
- [x] **Balken auch für Zählbares.** Fünf von zehn Eiern sind eben halb. Dafür
      brauchte es eine Bezugsgröße: neue Spalte `stock_item.initial_quantity`,
      per Migration mit der aktuellen Menge nachgefüllt. Bewusst am Posten und
      nicht aus dem letzten Kauf desselben Produkts abgeleitet — der letzte
      Kauf kann eine andere Gebindegröße gewesen sein, dann zeigte der Balken
      Unsinn. Der Balken benutzt dieselben vier Stufen wie lose Ware: vor dem
      Kühlschrank ist es dieselbe Frage, also darf es nicht zwei Zeichen dafür
      geben. Er erscheint erst, wenn etwas entnommen wurde (ein immer voller
      Balken sagt nichts), fällt nie auf null Segmente, solange noch ein Stück
      da ist, und bleibt bei Einzelstücken weg. Entnehmen lässt die Startmenge
      stehen, Nachlegen darüber hinaus hebt sie an, und die Menge im Sheet
      setzt sie neu — dort korrigiert man den Kauf, nicht die Entnahme.
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
