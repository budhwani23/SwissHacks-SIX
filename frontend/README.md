# Wealth Twin OS frontend

One React frontend for the SwissHacks FastAPI backend, covering the complete RM journey.

## Structure

```text
src/
  components/       Shared UI primitives
  pages/            Overview, Clients, Portfolio, Signals, Client DNA, Trust Navigator
  services/         Existing backend API client
  utils/            Frontend relationship-score calculation
  App.jsx            Shared application shell and navigation
```

## Start

Start the existing backend:

```powershell
cd ..\SwissHacks-SIX\backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Start the frontend in another terminal:

```powershell
cd swisshacks-trust-frontend
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000`. Vite proxies `/api` to the unchanged backend on port 8000.

## Existing API coverage

The frontend uses the client, DNA, portfolio, alert, analysis, messaging, news, recommendation, replacement and SQL-agent routes. Trust Navigator calculates its explainable baseline in `src/utils/relationshipScore.js`; it does not require a relationship-health backend endpoint.

## User journey

1. Dashboard client book and global Run Analysis
2. Tabbed client profile: DNA, Portfolio, CRM Notes, Alerts, Messages
3. Global/per-client alert inbox with replacement, escalation and status actions
4. Tone-controlled draft generation, preview and approval
5. Live/mock news refresh
6. Filterable CIO universe
7. Safe natural-language database search
