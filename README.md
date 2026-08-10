# Kitchen Manager

Küchen-/Kühlschrank-Inventar für den Eigengebrauch. Aktuell nur ein
Skeleton mit `Item`(name, quantity, unit, category, expiry_date) und einer
einfachen JSON-API unter `/items` — Business-Logik und UI kommen über
VS Code SSH dazu.

## Entwicklung

```bash
cd ~/projects/kitchen-manager
docker compose up -d --build
docker compose logs -f
```

- API: `http://<Pi-IP>:3001` (z.B. `GET /health`, `GET /items`, `POST /items`)
- Docs (Swagger UI, automatisch von FastAPI): `http://<Pi-IP>:3001/docs`
- Über Tailscale von unterwegs: `http://<Tailscale-IP-des-Pi>:3001`

`app/` ist ins Container gemountet, `uvicorn --reload` läuft — Änderungen in
VS Code wirken sofort, kein Rebuild nötig (Rebuild nur bei geänderten
`requirements.txt`).

## Daten

SQLite-DB liegt unter `./data/kitchen.db` (Bind-Mount, nicht in Git).

## Stoppen / Neustart

```bash
docker compose down
docker compose restart
```

## Nächste Schritte (Ideen)

- Web-UI (z.B. Jinja2-Templates + HTMX, oder eigenes Frontend)
- Ablaufdatum-Warnungen / Sortierung nach `expiry_date`
- Barcode-Scan zum schnellen Hinzufügen
