# PLAN.md — Kitchen Manager

Arbeitsstand und Fahrplan. Haken setzen, wenn etwas fertig **und** am Handy
ausprobiert ist. Angelegt 2026-08-10.

---

## 1. Datenmodell

Getrennt in **Produkt** (Stammdaten, für Statistik und Einkaufsliste) und
**Bestandsposten** (die konkrete Packung im Kühlschrank). Zwei Packungen Tofu
vom selben Produkt haben so eigene MHDs, und „was kaufe ich häufig" bleibt
trotzdem sauber auswertbar.

Seit M11 zusätzlich nach **Nutzer** getrennt, ohne Login — siehe dort.
`stock_item`, `shopping_list_item` und `receipt` tragen ein `user_id`;
`category`, `product` und `product_alias` bleiben geteiltes Referenzwissen.

### `user`

| Feld         | Typ    | Zweck                                                  |
| ------------ | ------ | ------------------------------------------------------ |
| `id`         | int PK |                                                        |
| `name`       | text   | frei gewählt beim Anlegen, keine Eindeutigkeitspflicht |
| `created_at` | int    | auch die Sortierung in der Auswahl                     |

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
| `user_id`                  | int FK  | wessen Bestand — seit M11                        |
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
| `user_id`      | int FK | wer den Bon eingescannt hat — seit M11               |
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

`id` · `user_id` (seit M11) · `product_id?` · `free_text` · `quantity` ·
`unit` · `is_done` · `source` (`manual` \| `suggested`) · `created_at`

---

## 2. Screens

- [x] **Bestand** (Start) — Standardsortierung nach Ablauf, nicht alphabetisch.
      Orte als segmentierte Tabs oben, nicht als Dropdown.
- [x] **Schnellaktionen in der Liste** — kein Detail-Screen für den Normalfall.
      Große `−` / `+` direkt an der Zeile, Wischen nach rechts = aufgebraucht.
- [x] **Artikel-Detail** als Bottom-Sheet — Ort, MHD, Einheit, Füllstand.
      Füllstand als vier Knöpfe mit Balkenvorschau, nie als Regler.
- [x] **Schnell hinzufügen** — Chips der häufigsten Produkte zum Ein-Tap-Nachlegen,
      darunter erst die Suche. Das Meiste ist Nachkauf von immer demselben.
- [x] **Bon aufnehmen** — großer Knopf geht direkt in die Kamera
      (`capture="environment"`), darunter klein „aus der Galerie" ohne
      `capture`, was iOS die Auswahl zeigen lässt. Mehrere Aufnahmen pro Bon.
- [x] **Bon prüfen** — Zeilen als Karten, Unsicheres hervorgehoben,
      „Alle übernehmen" als Primäraktion, Korrigieren als Ausnahme.
- [x] **Bald schlecht** — nach Dringlichkeit, mit „aufgebraucht"-Geste.
- [x] **Einkaufsliste** — manuell plus Vorschläge, abhaken mit großem Ziel.
- [x] **Was koche ich?** — ein Button, Vorschlag aus dem Bestand,
      Ablaufendes bevorzugt.
- [x] **Einstellungen** — Kategorien und ihre MHD-Defaults, direkt editierbar.
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

**Stand 2026-08-13:** M0–M10 stehen im Code, `check`/`lint`/`test`/`build`
laufen sauber (232 Tests), der Container läuft probeweise auf dem Pi, erreichbar
per HTTPS über `tailscale serve`. Bewusst ohne Service Worker/Offline-Ansicht,
siehe M10. Offen ist überall nur noch das Gegenprüfen am Handy — die Punkte
stehen bei den jeweiligen Meilensteinen.

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
- [x] **Kamera-Fotos scheiterten mit „Keine Verbindung zum Server" —
      gefunden 2026-08-13 beim Gegenprüfen am Handy.** Kein Bug im Bon-Code:
      `adapter-node` begrenzt Anfragen standardmäßig auf 512 K, mehrere
      komprimierte Aufnahmen (bis 2576 px Kante) reißen das zusammen locker,
      eine einzelne schon vorkomprimierte Datei aus einer Fremd-App (Lidl)
      blieb meist knapp drunter — daher die Diskrepanz. Der Dev-Server kennt
      dieses Limit nicht, nur `adapter-node`, deshalb fiel es erst nach M9
      auf. Der Server bricht die Verbindung beim Überschreiten ab, was im
      Browser wie ein Netzfehler aussieht statt wie ein sauberer Fehler —
      `catch { error = 'Keine Verbindung zum Server.' }` in `+page.svelte`
      trifft also zufällig den richtigen Text für den falschen Grund. Fix:
      `BODY_SIZE_LIMIT=20M` in `compose.yml`, mit `curl` gegen 2–3 MB
      gegengeprüft (volle HTTP-Antwort statt Verbindungsabbruch).
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

### M8 — Rezeptvorschlag ✅

`/kochen` war eine Platzhalterseite, die Nav-Kachel stand seit M1. Der Plan
unten war entschieden, nicht offen, und wurde von einer Umsetzungsrunde
(backend-data, dann ui-ux) so gebaut — die Abwägungen mussten nicht
wiederholt werden.

- [x] Ein Knopf, ein Vorschlag, Ablaufendes bevorzugt
- [x] Portionen 1 / 2 / 4 vorwählbar
- [x] Fehlende Zutaten sichtbar, mit einem Tap auf die Einkaufsliste
- [x] „Gekocht" bucht ab, was sich abbuchen lässt — inklusive Sonderfälle, die
      erst der reviewer fand: angebrochene lose Ware wird gegen die
      **Restmenge** abgebucht (nicht die Kaufmenge) und landet bei Rest 0 in
      `consumedAt`; Packungen bleiben serverseitig hart stehen, egal was das
      Modell an Menge vorschlägt; doppelt referenzierte Bestandsposten beim
      Abbuchen und beim Undo korrekt zusammengefasst
- [x] **Portionswechsel rechnet hoch, statt den Vorschlag zu verwerfen.** Beim
      Testen fiel auf: ein Tap auf einen anderen Portionen-Reiter hat das
      gerade geholte Rezept gelöscht, weil `recipe.portions` nicht mehr zur
      URL passte. Jetzt rechnet `scaleRecipe` (`$lib/recipe-scale.ts`) Mengen
      und `amountBase` mit dem Verhältnis hoch, kein neuer KI-Aufruf — „für 2"
      ist für 1 mal 2, kein anderes Gericht. Packungen bleiben bei
      `amountBase: 0` stehen, `amountText` wird nur skaliert, wenn eine Zahl
      am Anfang steht („250 g" → „500 g"; „etwas Salz" bleibt, wie es ist).
- [x] **Tendenz und Wunsch fließen jetzt in den Prompt.** Zwei Chips
      (herzhaft/süß) plus ein Freitextfeld („Lasagne", „keine Nudeln") über
      dem Portionen-Reiter, beides optional. Kein gespeicherter Zustand,
      keine Tabelle — nur zwei zusätzliche Zeilen im Prompt
      (`Tendenz:`/`Wunsch:`), genau wie der abgelehnte Titel beim „anderer
      Vorschlag". Ändert nichts an der Entscheidung gegen ein Diätprofil
      unten, siehe Nachtrag dort.
- [ ] **Am Handy gegenprüfen**: Wartezeit erträglich? Ist der Vorschlag am
      Dienstagabend wirklich kochbar oder klingt er nur gut?

**Dateien.** `src/lib/server/ai/recipe.ts` (der Aufruf, mit `$env`) und
`recipe-parse.ts` (Schema, Prompt, Prüfung der Antwort) — dieselbe Teilung wie
beim Bon und aus demselben Grund: `$env` löst in Tests nicht auf, und der
prüfbare Teil ist genau der, in dem Fehler wehtun. Die Fehlerübersetzung
`toUserError` aus `receipt.ts` zieht vorher nach `ai/errors.ts` um; sie bildet
SDK-Fehler auf deutsche Sätze ab und gilt für beide Aufrufe unverändert — eine
zweite Kopie liefe auseinander.

**Modell und Aufruf.** `claude-opus-5`, eigene Konstante, überschreibbar über
ein neues `ANTHROPIC_RECIPE_MODEL`. `ANTHROPIC_MODEL` bleibt Sonnet 5 für den
Bon; `.env.example` behauptet derzeit, die eine Variable gelte für beides, das
ist mitzuziehen (ebenso die Zeile in `CLAUDE.md`). Anders als beim Bon wird
Thinking **nicht** abgeschaltet: „was geht aus diesen 23 Sachen, bevorzugt mit
dem, was Freitag abläuft" ist ein Randbedingungsproblem, kein Abtippen. Auf
Opus 5 denkt das Modell ohnehin standardmäßig — `thinking` bleibt also einfach
weg —, dafür teilen sich Denken und Text dasselbe `max_tokens`: mit 4000 statt
knapp bemessen, sonst bricht das Rezept mitten im dritten Schritt ab.
`output_config.effort: 'medium'` als Startpunkt, `low` ist einen Versuch wert.
`stop_reason === 'refusal'` wird geprüft wie beim Bon. Kein Prompt-Caching: der
Bestand ändert sich bei jeder Mengenänderung, und der Prompt liegt unter der
Mindestgröße. Kosten grob 1–2 ct pro Vorschlag, bei ein paar Aufrufen die Woche.

**Structured Outputs**, wie beim Bon — Freitext zu zerlegen wäre die eine
Fehlerquelle, die man geschenkt bekommt:

```
title · minutes · portions
ingredients[]: name · amount_text („250 g") · source · stock_item_id · amount_base
steps[]: kurze Sätze
```

`source` ist `stock` | `staple` | `missing`. Drei Zustände statt eines
`have`-Flags, weil Salz und Öl weder aus dem Bestand kommen noch fehlen — ohne
die mittlere Stufe landet „Salz" auf der Einkaufsliste und macht die einzige
Liste unbrauchbar, die kurz bleiben muss. `stock_item_id` zeigt auf die Zeile,
aus der die Zutat kommt (0 sonst); `amount_base` ist die Menge in der Einheit
dieses Postens und dient nur dem Abbuchen, angezeigt wird `amount_text`.

**Prompt.** System: genau ein Gericht, deutsch, alltagstauglich; der Bestand
hat Vorrang; höchstens zwei fehlende Zutaten und die müssen in jedem Supermarkt
stehen; kurze Schritte, im Stehen lesbar; keine Nährwerte (§5). Nutzerteil: der
Bestand als Zeilen, nicht als JSON — `#42 Hackfleisch · 400 g · Kühlschrank ·
läuft morgen ab`, `#17 Milch · 1 Pck · Kühlschrank · 8 Tage · ungeöffnet` —
dazu die Portionenzahl und, beim Nachschlag, der abgelehnte Titel als „nicht
schon wieder". Die Tage bis zum MHD stehen ausgeschrieben da, damit
„Ablaufendes bevorzugen" eine Zahl im Prompt ist und keine Bitte.

**Mengen — die Packungsgröße bleibt weg.** Vom Bon kommt „1 Pck Milch", ein
Rezept will „200 ml". Der Reflex wäre ein Feld „Inhalt je Packung" am Produkt.
Durchgerechnet trägt es nicht: Lose Ware (g/ml) liegt schon exakt vor, und was
einzeln verbraucht wird, zählt seit M6 in Stück (10 Eier, 4 Joghurt) — beides
sind bereits Rezepteinheiten. Übrig bleibt genau der Fall Mehl/Reis/Öl/Milch,
und dort ist die Zahl für die Entscheidung irrelevant: eine ungeöffnete Packung
reicht für ein bis zwei Portionen immer. Für die Anzeige braucht man sie auch
nicht — das Rezept schreibt „250 g Mehl", weil das die übliche Sprache ist und
eine Waage danebensteht, nicht „ca. ⅓ Packung". Und das Wissen, dass eine
Packung Milch etwa ein Liter ist, hat das Modell ohnehin; der Produktname trägt
es. Wir bräuchten die Zahl nur in einer `WHERE`-Klausel, und die gibt es nicht.
Dagegen stünde: eine Tastaturabfrage bei jedem neuen Produkt (genau das
Formular-Ping-Pong aus `CLAUDE.md`) oder eine Modellschätzung beim Bon-Import
samt Spalte, Migration, NULL-Fallback und Korrekturweg im Detail-Sheet — für
Daten, die dasselbe Modell beim Rezept ohne Speicher raten kann. **Entschieden:
kein Feld.** Der Prompt sagt stattdessen, dass „1 Pck" eine ungeöffnete Packung
unbekannten Inhalts ist und normale Packungsgrößen anzunehmen sind.

**Abbuchen.** Ein Knopf unter dem Rezept, „Gekocht", ein Tap, danach die
gewohnte Undo-Leiste — kein Abhaken je Zutat. Wer den Topf abstellt, tippt sich
nicht durch fünf Zeilen, und wenn es nicht in einem Tap geht, passiert es gar
nicht und der Bestand driftet. Abgezogen wird nach der Einheit des Postens, nicht
nach der Rezepteinheit: g/ml um `amount_base`, Stück ganzzahlig, beides gegen
den Restbestand geclamped. **Packungen bleiben stehen.** Ehrlich wäre dort
„Öffnen", aber das legt eine neue Zeile an, und ein Sammel-Undo, das Zeilen
wieder einsammelt, ist mehr Maschinerie als der Fall wert — das Öffnen sitzt
weiterhin einen Tap entfernt im Detail-Sheet. Der Undo-Schnappschuss ist damit
eine Liste `{id, quantity}` und eine Restore-Schleife.

**Portionen.** Segmentierte Schalter **1 / 2 / 4** über dem großen Knopf, in
derselben Sprache wie die Ort-Tabs und die vier Füllstufen — ein Tap, kein
Regler, keine Tastatur. Ein-Personen-Haushalt heißt Vorauswahl 1; „mal für
zwei" ist damit ein Tap, Besuch einer. Drei fehlt bewusst: man nimmt vier und
hat Reste. Die Wahl steht in der URL (`?portionen=2`), wie der Ort im Bestand —
kein Store, überlebt Neuladen, der Zurück-Knopf tut das Erwartete. ui-ux darf
auf 1 / 2 kürzen, wenn die dritte Kachel die Trefferflächen zu schmal macht.

**Warten.** Opus mit Thinking braucht 10–20 Sekunden; ein Spinner sieht darin
aus wie ein Hänger. Kein Streaming — dafür bräuchte es einen eigenen Endpunkt
statt einer Form-Action, viel Aufwand für einen seltenen Screen. Stattdessen
trägt die Wartezeit Inhalt: die zwei, drei dringendsten Posten stehen darunter,
die kennt die Seite ohne Modell.

**Angrenzendes — notiert, nicht entschieden.**

- **„Anderer Vorschlag"** als zweiter Knopf: derselbe Aufruf, der abgelehnte
  Titel wandert als „nicht schon wieder" in den Prompt. Ein Tap, eine Zeile
  Prompt — und damit der Ersatz für einen Einstellungs-Screen für Vorlieben.
- **Fehlendes auf die Einkaufsliste**: die `missing`-Zutaten als Chips, ein Tap
  legt sie an. M7 kann Freitextposten, es braucht nichts Neues.
- [x] **Einstieg vom Ablauf-Screen — umgesetzt 2026-08-13.** Dort sieht man
      „drei Sachen laufen morgen ab" — das ist der Moment, in dem die Frage
      entsteht. Ein Knopf auf `/ablauf` (nur wenn dort etwas steht) springt zu
      `/kochen?los=1`; ein `$effect` dort löst den ersten Vorschlag beim Laden
      selbst aus, kein zweiter Tap. Kein extra Kontext nötig — der Prompt
      bevorzugt Ablaufendes ohnehin über den ganzen Bestand, unabhängig davon,
      von wo man kam. `autoTriggered` verhindert eine Wiederholung, falls die
      Anfrage fehlschlägt.
- **Mehrere Vorschläge nebeneinander — eher nicht.** Drei Karten heißen
  scrollen und vergleichen; wer fragt „was koche ich", will keine Auswahl,
  sondern eine Antwort. „Anderer Vorschlag" kann dasselbe mit einer
  Entscheidung weniger.
- **Keine Rezept-Historie**, keine Sammlung — steht so in `CLAUDE.md` und §5,
  hier nur bestätigt. Nachtrag: beim Planen als „wäre cool" genannt — das
  steht in echter Spannung zu `CLAUDE.md`s „keine Rezeptdatenbank, wir pflegen
  keine eigene Sammlung". Falls das später ernsthaft gewünscht wird, ändert
  sich zuerst `CLAUDE.md`, nicht heimlich der Code.

### M9 — Betrieb ✅

- [x] **Dockerfile für Node 22, Build auf aarch64.** Multi-Stage: Builder mit
      `python3`/`make`/`g++` fürs native Nachkompilieren von `better-sqlite3`,
      `npm prune --omit=dev` danach statt einem zweiten Install im
      Laufzeit-Image. `DATABASE_URL` als harmloser Platzhalterwert nur für den
      Build — SvelteKits Analyse-Schritt lädt `db/index.ts` einmal an, das
      wirft sonst sofort (kein Geheimnis, echte Werte kommen erst zur Laufzeit
      über `env_file`). Läuft als `node`, der uid/gid-1000-Nutzer aus dem
      offiziellen Image, passend zum Bind-Mount, der dem Pi-Nutzer gehört.
      Auf dem Pi selbst gebaut und probeweise laufen lassen — 406 MB, `/` und
      `/kochen` antworten mit 200.
- [x] **`compose.yml` auf Port 3001, `data/` als Bind-Mount, non-root.**
      `restart: unless-stopped`, `env_file: .env` für den API-Key.
- [x] **Autostart.** Kein eigener systemd-Dienst nötig: `docker` ist auf dem Pi
      schon als Systemdienst aktiviert (`systemctl is-enabled docker` →
      `enabled`), `restart: unless-stopped` im Compose-File erledigt den Rest.
- [x] **Backup-Notiz** in `README.md` — Container kurz anhalten, `data/`
      kopieren, wieder starten. Für einen Ein-Nutzer-Haushalt ist die Sekunde
      Ausfall kein Problem, ein Online-Backup bei laufendem WAL-Modus also
      nicht nötig.
- [x] **Aufräumjob für Bon-Bilder (§4).** `cleanupOldReceiptImages`
      (`$lib/server/receipt-cleanup.ts`) löscht Dateien über 90 Tage plus die
      zugehörige `receipt_image`-Zeile — der Bon selbst (Posten, Rohantwort)
      bleibt für Auswertung und Fehlersuche stehen, nur die Fotos sind der
      teure Teil auf der SD-Karte. Kein externer Cronjob: `src/hooks.server.ts`
      startet ihn einmal beim Hochfahren und danach alle 24 Stunden über ein
      `.unref()`tes `setInterval` — der Container läuft ohnehin dauerhaft.
      `building` aus `$app/environment` verhindert, dass der erste Lauf schon
      während des Docker-Builds gegen die leere Platzhalter-DB feuert.

### M10 — PWA ✅

- [x] **Manifest, Icons, „Zum Homescreen" — ohne Service Worker.** Entschieden:
      die App läuft dauerhaft im Heimnetz über Tailscale, „offline vorm leeren
      Kühlschrank" ist ein Randfall, kein Alltag — der Aufwand für einen
      Service Worker lohnt sich dafür nicht. `static/manifest.json`
      (`display: standalone`), dazu `apple-mobile-web-app-capable` und
      `apple-touch-icon` in `app.html`, weil iOS das Manifest fürs Vollbild
      ignoriert und eigene Meta-Tags will. Die vier Icon-Dateien erzeugt
      `scripts/generate-icons.mjs` (reines `zlib`, kein ImageMagick/sharp auf
      dem Pi) — ein einfacher Kühlschrank-Umriss, `any` in 192/512 und ein
      eigenes `maskable` mit mehr Rand, damit Android/Chrome beim
      Kreis-/Squircle-Zuschnitt nichts abschneidet.
- [x] **`tailscale serve` für HTTPS.** Zwei Freischaltungen nötig, beide
      einmalig und nur interaktiv möglich, nicht aus dieser Sitzung heraus:
      „Serve" selbst über die Tailscale-Admin-Konsole im Browser, und
      `sudo tailscale set --operator=mertimcflurry`, weil `tailscale serve`
      sonst root braucht und hier kein TTY für die sudo-Passwortabfrage zur
      Verfügung stand. Läuft jetzt unter `https://raspbert-1.tailfa6004.ts.net`
      (tailnet-only, proxied auf `127.0.0.1:3001`), `curl` bestätigt 200.
      Überlebt einen Pi-Neustart von selbst — die Serve-Config liegt bei
      `tailscaled`, nicht am `tailscale`-Prozess.
- [ ] **Offline-Ansicht des Bestands — zurückgestellt.** Siehe oben: ohne
      Service Worker kein Sinn, und ohne Service Worker bleibt es dabei.
      Wieder aufmachen, falls sich zeigt, dass ein Tailscale-Aussetzer im
      Alltag wirklich stört.

### M11 — Mehrere Nutzer ✅

Entschieden 2026-08-17, siehe die Begründung unter „Kein Auth, trotzdem
mehrere Nutzer" in `CLAUDE.md`. Kein Login: ein Cookie pro Gerät merkt sich
die Wahl, jeder mit Zugriff auf die Seite darf sich als jeder Nutzer ausgeben
oder einen neuen anlegen.

- [x] `user`-Tabelle (`id`, `name`, `created_at`), Migration erzeugen —
      `0008_graceful_leader.sql` (Tabelle + nullbare Spalten),
      `0009_backfill_default_user.sql` (Default-Nutzer „Ich", Backfill,
      Muster wie `0004`/`0007`), `0010_colossal_hercules.sql` (NOT NULL).
      Gegen die echte Dev-DB migriert, 94 Bestandsposten/9 Bons erhalten.
- [x] `user_id` auf `stock_item`, `shopping_list_item`, `receipt` —
      `category`, `product`, `product_alias` bleiben geteilt.
- [x] `hooks.server.ts`: Cookie lesen, `locals.userId` setzen; ohne gültiges
      Cookie Redirect auf `/nutzer` (außer man ist schon dort), Zielpfad als
      `next`-Parameter mit
- [x] Alle Queries und Form Actions zu Bestand, Einkaufsliste und Bon auf
      `locals.userId` gescoped — inklusive `frequentProducts`/`lastPurchase`,
      die bewusst pro Nutzer laufen, nicht nur global geteilte Daten.
- [x] **Screen `/nutzer`**: große Kacheln im Daumenbereich, Bottom-Nav dort
      ausgeblendet (`+layout.svelte`), „Neuer Nutzer" klappt ein Textfeld mit
      Autofokus statt eines Formulars unter der letzten Kachel.
- [x] Wechseln jederzeit möglich — Zeile „Angemeldet als …" oben in
      „Einstellungen", verlinkt auf `/nutzer?next=/einstellungen`.
- [x] Rezeptvorschlag (M8) — `recipeStock(db, locals.userId)` in
      `src/routes/kochen/+page.server.ts` bestätigt nutzerscoped.
- [x] **Am Handy gegenprüfen**: Auswahl-Screen bei erstem Aufruf ohne Cookie,
      Wechseln zwischen zwei angelegten Nutzern, dass keine Bestände sich
      vermischen. Dabei aufgefallen und behoben: `cookies.set` setzt
      `secure: true`, sobald der Host nicht `localhost` ist — über den
      Tailscale-Hostnamen (HTTP, kein TLS) verwarf der Browser das Cookie
      still, `/nutzer` lief in einer Schleife. Fix und Fallstrick in
      `CLAUDE.md` festgehalten.
- [x] Avatar-Kreis oben rechts in `PageHeader` — gespiegelt vom Bon-Kreis
      unten, auf jeder Seite sichtbar, damit „wer bin ich gerade" nicht erst
      in den Einstellungen nachgesehen werden muss. Zeile in Einstellungen
      bleibt als zweiter Weg.
- Platzhalter-Nutzer „Ich" aus dem M11-Backfill in der Dev-DB aufgelöst: Bestand
  (94 Posten, 9 Bons) auf einen echten Nutzer umgezogen, Testnutzer gelöscht.

---

## 4. Offene Entscheidungen

Angenommene Defaults, bis widersprochen wird:

- [x] **Anthropic-Key** — liegt in `.env`, im Repo steht nur `.env.example`.
      Modell über `ANTHROPIC_MODEL`, Default `claude-sonnet-5`: Haiku 4.5
      verarbeitet Bilder nur bis 1568 px und ist für Bonschrift damit nicht
      billiger, sondern untauglich. Ein synthetischer Bon kostete im Test
      ~1,5 ct und brauchte 7 Sekunden.
- [x] **`tailscale serve`** — eingerichtet mit M10, siehe dort. Der
      ursprüngliche Grund (Service Worker braucht HTTPS) ist inzwischen
      hinfällig — der Service Worker selbst ist ja bewusst weggelassen —,
      HTTPS läuft trotzdem, fürs saubere Homescreen-Icon.
- [x] **Bon-Bilder** — 90 Tage aufbewahren, dann automatisch löschen. Liegen
      seit M5 unter `data/receipts/`, also im Bind-Mount neben der Datenbank;
      der Aufräumjob läuft jetzt über `hooks.server.ts`, siehe M9.
- [ ] **Orte** — feste Liste Kühlschrank/Gefrier/Vorrat, keine freien Orte.
- [x] **`~/projects/README.md`** — der Stack-Abweichungs-Vermerk stand dort
      schon (Abschnitt „Abweichungen"), unklar seit wann. Am 2026-08-13 dafür
      den Zugriff-Abschnitt nachgezogen: `tailscale serve` ist für
      `kitchen-manager` jetzt eingerichtet und hat den Standard-HTTPS-Port
      (443) belegt — ein künftiges Projekt mit eigenem HTTPS-/PWA-Bedarf
      braucht einen eigenen `--https=<port>`.
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
- [x] **Packungsgröße fehlt — entschieden beim Planen von M8: kein Feld.** Die
      Sorge war, dass „drei Liter" und „drei Becher" für ein Rezept dasselbe
      aussehen. Sie tun es nicht: lose Ware liegt in g/ml vor, einzeln
      Verbrauchtes zählt seit M6 in Stück, und der Rest (Mehl, Reis, Öl, Milch)
      reicht bei einer ungeöffneten Packung für ein bis zwei Portionen so oder
      so — die Zahl entscheidet nichts. Der Produktname trägt die Größenordnung,
      und das Modell kennt sie. Volle Begründung samt Gegenrechnung bei M8.
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
- [x] **Manuell angelegte Produkte landeten immer in „Sonstiges".** Anders als
      beim Bon-Import (M5) liefert „Schnell hinzufügen" kein Modell, das die
      Kategorie mitgibt — `findOrCreateProduct` fiel ohne `categoryName` direkt
      auf „Sonstiges" zurück. „Pfirsich" eintippen ergab 30 Tage MHD statt der
      7 von Obst & Gemüse. Zwei bewusst kleine Bausteine, kein Widerspruch zum
      oben verworfenen großen Produktkatalog: `guessCategoryName`
      (`category-guess.ts`) ist eine reine Stichwortliste je Kategorie
      (~10–50 Wörter, keine MHDs, keine Aliase, keine Pflege durch Bon-Daten)
      als Fallback nur dort, wo `findOrCreateProduct` sonst blind raten würde —
      und weil eine Heuristik nie vollständig sein wird, ist die Kategorie
      jetzt im Artikel-Detail-Sheet direkt änderbar (Select, wirkt aufs ganze
      Produkt, nicht nur den einen Posten). Ein Fehltreffer ist damit ein Tap
      entfernt korrigierbar statt für immer falsch.
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
- [ ] **Keine Vorlieben, keine Ausschlüsse für den Rezeptvorschlag.** Es gibt
      keine Tabelle dafür und beim Planen von M8 kam auch keine dazu. Ein
      Ein-Personen-Haushalt, der jeden Vorschlag ohnehin sieht, bevor er kocht,
      braucht kein Diätprofil — „gefällt mir nicht" beantwortet ein Tap auf
      „anderer Vorschlag", und das ist ein Screen weniger als eine Liste von
      Abneigungen, die gepflegt werden will. Wieder aufmachen, falls dieselbe
      ungeliebte Zutat dreimal hintereinander vorgeschlagen wird. Nachtrag:
      bei Zutaten aus dem eigenen Bestand ohnehin wenig Hebel — die stehen ja
      schon im Kühlschrank. Interessanter wäre es erst bei M7, für Vorschläge
      zu Dingen, die noch nicht da sind (Einkaufsliste) — dort aber noch nicht
      geplant, nur als möglicher späterer Anknüpfungspunkt vermerkt.
      Nachtrag 2026-08-12: Nutzer wollte beim Testen doch eine Tendenz vor der
      Anfrage setzen können, nicht erst danach über „anderer Vorschlag"
      korrigieren. Umgesetzt als zwei Chips (herzhaft/süß) plus Freitext,
      **nicht** gespeichert — jeder Aufruf startet wieder leer. Das ist kein
      Diätprofil und keine Ausschlussliste, sondern derselbe Mechanismus wie
      der abgelehnte Titel, nur proaktiv statt reaktiv. Die Begründung oben
      bleibt richtig: es gibt weiterhin keine Tabelle und nichts, das gepflegt
      werden muss.
      Nachtrag 2026-08-13: zweite, unabhängige Chip-Reihe „Vegetarisch"/„Vegan"
      dazu, ebenfalls ungespeichert. Anders als Tendenz/Wunsch geht die Diät im
      Systemprompt als harte Vorgabe ein, nicht als „bevorzugt erfüllen" — sonst
      schlüge das Modell im Zweifel doch Fleisch vor. Single-select, weil
      „vegan" „vegetarisch" schon einschließt.
- [x] **Das Rezept überlebt jetzt einen Seitenwechsel — 2026-08-13, genau die
      damals skizzierte kleinste Reparatur.** Ein gemerktes Rezept in
      `localStorage` (`kochen:recipe`), keine Tabelle, keine Sammlung (§5
      bleibt unberührt — es ist Zwischenspeicher, kein Verlauf, wird bei
      jedem neuen Vorschlag überschrieben). Mitgespeichert: `recipe`,
      `cooked`, `nothingToBook` — genug, damit der „Gekocht"-Knopf nach der
      Rückkehr nicht erneut abbucht. Bewusst **nicht** mitgespeichert: die
      Undo-Snapshots (ein kurzes Zeitfenster nach der Aktion, keine
      Dauereinrichtung) und Tendenz/Diät/Wunsch (die sollen laut Entscheidung
      oben weiterhin bei jedem Aufruf leer starten). Ein einziger `$effect`
      schreibt bei jeder Änderung von `recipe`/`cooked`/`nothingToBook`
      zurück — kein Aufruf an mehreren Stellen, der auseinanderlaufen könnte.
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
- **Rollen, Admin-Rechte, Zugriffskontrolle zwischen Nutzern** — mehrere
  Nutzer gibt es seit M11, aber ohne Login und ohne Hierarchie unter ihnen.
- **Teilen zwischen Haushalten**, Mandantenfähigkeit über das eigene Tailnet
  hinaus.
- **Automatische Nachbestellung** bei Händlern.
- **Native App** — PWA reicht.
