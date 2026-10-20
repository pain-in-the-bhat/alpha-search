# alpha-search

Alpha Search is a momentum terminal (scanner, charts, backtest lab and position planner) for about 90 NSE stocks. It is an analysis tool, not investment advice.

## How it works

- `fetch_data.py` downloads daily prices from Yahoo Finance and writes `stocks.csv`.
- `seal.py` encrypts that file into `stocks.enc` (gzip, then AES-256-GCM with a key derived from the desk password by PBKDF2-SHA256, 600,000 rounds).
- `index.html` asks for the password and decrypts the prices in the browser. The password is never sent anywhere.
- `engine.js` holds the indicator and signal maths. The page and the daily brief both use it, so they always agree.
- `brief.js` compares today's signals with the previous trading day and writes the daily email. `send_mail.py` sends it.
- `.github/workflows/update.yml` does all of this every weekday at 5:15 pm IST, deploys to GitHub Pages, then emails the brief. Only `index.html`, `engine.js` and `stocks.enc` are published. The raw CSV never is.

## Setup

1. Settings → Secrets and variables → Actions → New repository secret: `DESK_PASSWORD`, at least 12 characters. A long passphrase is best, because anyone can download `stocks.enc` and try passwords offline.
2. Settings → Pages → Source: **GitHub Actions**.
3. Actions → "Update prices and deploy" → Run workflow.

## Daily brief by email

Each weekday after the update, the workflow emails a brief: breadth and regime, new breakouts, new 52-week highs, stocks entering or leaving the momentum leaders, your watchlist, the day's biggest moves and sector rotation.

Add these repository secrets (Settings → Secrets and variables → Actions). Addresses go in secrets, not in code, because this repo is public.

| Secret | Value |
|---|---|
| `MAIL_TO` | Where the brief goes. Several addresses can be comma separated. |
| `SMTP_USER` | The sending account, for example a Gmail address. |
| `SMTP_PASS` | For Gmail, an app password: Google Account → Security → 2-Step Verification → App passwords. |
| `SMTP_HOST`, `SMTP_PORT` | Optional. Default `smtp.gmail.com` and `587`. |
| `WATCHLIST` | Optional. Comma separated symbols, for example `TCS,DIXON,HAL`. |

Without the mail secrets the workflow still updates the site and skips the email. "Run workflow" sends the brief on demand.

Yesterday's signals are kept in the Actions cache between runs, so the brief can say what is new. The cache also logs every new signal with its price, ready for tracking how signals perform. If the cache is ever cleared, the next brief simply lists today's signals without the comparison.

## Safety checks

- The download fails if fewer than 90% of symbols come back, so a partial file is never published.
- The brief fails the workflow if the newest close is more than 4 days old, and GitHub emails you about the failed run.
- The site shows a warning when its prices are more than 4 days old.

To change the password, update the secret and run the workflow. Browsers that stayed signed in will be asked for the new one.

## What the lock does and does not protect

- It protects the price data. Without the password, `stocks.enc` cannot be read.
- It does not hide the code. This repo is public, so the page, the scripts and the stock list can be read by anyone.
- It is one shared password, not per-person accounts. To cut someone off, change the password.

## Run locally

    pip install -r requirements.txt
    python fetch_data.py
    python -m http.server      # open http://localhost:8000

With only `stocks.csv` present, the page skips the lock and loads it directly.

## Keyboard

- `⌘K` / `Ctrl K` or `/`: search tickers and views. `↵` opens the chart, `⇧↵` opens the planner.
- `1` to `6`: Scanner, Chart, Planner, Backtest lab, Playbook, Data.
