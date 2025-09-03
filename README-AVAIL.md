# Avail Nomination Monitoring (Extension)

This folder `extensions/avail-nomination-monitor/` contains an **independent sidecar** service
(API + Worker) to demonstrate validator scoring + event-based updates (Slashed/Offline) for Avail.

## How to run

```bash
cp extensions/avail-nomination-monitor/.env.example extensions/avail-nomination-monitor/.env
docker compose -f docker-compose.avail.yml up -d --build
curl -s http://localhost:3000/health
curl -s "http://localhost:3000/validators?limit=5&sort=score.total:desc" | jq .
