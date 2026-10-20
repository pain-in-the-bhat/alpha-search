# alpha-search

Alpha Search is a momentum scanner, backtest lab and position planner for about 90 NSE stocks. It is an analysis tool, not investment advice.

## How it works

- `fetch_data.py` downloads daily prices from Yahoo Finance and writes `stocks.csv`.
- `seal.py` encrypts that file into `stocks.enc` (gzip, then AES-256-GCM with a key derived from the desk password by PBKDF2-SHA256, 600,000 rounds).
- `index.html` asks for the password and decrypts the prices in the browser. The password is never sent anywhere.
- `.github/workflows/update.yml` does all of this every weekday at 5:15 pm IST and deploys to GitHub Pages. Only `index.html` and `stocks.enc` are published. The raw CSV never is.

## Setup

1. Settings → Secrets and variables → Actions → New repository secret: `DESK_PASSWORD`, at least 12 characters. A long passphrase is best, because anyone can download `stocks.enc` and try passwords offline.
2. Settings → Pages → Source: **GitHub Actions**.
3. Actions → "Update prices and deploy" → Run workflow.

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
