# Monitoring & Healthchecks

This project exposes basic monitoring and health endpoints and ships a Prometheus metric endpoint.

Endpoints
- `/api/health` — basic readiness/health check (HTTP 200 OK expected).
- `/api/metrics` — Prometheus metrics (if `prom-client` is enabled).

Prometheus
- Scrape `/api/metrics` from your Prometheus server.
- Export common JVM/node metrics via `prom-client` and add custom counters for important events (e.g., `socket_events_total`).

Grafana
- Create dashboards for request latency, error rates, active socket connections, and email delivery failures.

Alerting
- Alert on high error-rate, queue/backlog growth, or SMTP failures.

Local smoke check
- Use the `scripts/smoke_check.sh` script in the repository to validate endpoints after deployment.
