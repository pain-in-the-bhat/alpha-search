"""Download daily prices for Indian stocks and write stocks.csv for Alpha Search.

Setup:   pip install yfinance pandas
Run:     python fetch_data.py
         python fetch_data.py --symbols TCS,INFY,DIXON --years 3
         python fetch_data.py --suffix .BO          (BSE instead of NSE)

Each stock gets a cap class: Large, Mid or Small. SEBI and AMFI define these by rank
(top 100 = large, 101 to 250 = mid, the rest = small) and revise the list every six months.
This script approximates that from live market cap using two cut-offs in INR crore
(--large-cr and --mid-cr). If market cap cannot be fetched, the fallback class below is used.
Edit UNIVERSE to add your own symbols."""
import argparse
import pandas as pd
import yfinance as yf

# symbol: (company, sector, fallback cap class)
UNIVERSE = {
    "RELIANCE": ("Reliance Industries", "Energy", "Large"),
    "TCS": ("Tata Consultancy Services", "IT", "Large"),
    "HDFCBANK": ("HDFC Bank", "Banks", "Large"),
    "ICICIBANK": ("ICICI Bank", "Banks", "Large"),
    "INFY": ("Infosys", "IT", "Large"),
    "BHARTIARTL": ("Bharti Airtel", "Telecom", "Large"),
    "SBIN": ("State Bank of India", "Banks", "Large"),
    "LT": ("Larsen & Toubro", "Industrials", "Large"),
    "ITC": ("ITC", "Consumer", "Large"),
    "HINDUNILVR": ("Hindustan Unilever", "Consumer", "Large"),
    "KOTAKBANK": ("Kotak Mahindra Bank", "Banks", "Large"),
    "AXISBANK": ("Axis Bank", "Banks", "Large"),
    "BAJFINANCE": ("Bajaj Finance", "Financials", "Large"),
    "MARUTI": ("Maruti Suzuki", "Auto", "Large"),
    "SUNPHARMA": ("Sun Pharma", "Pharma", "Large"),
    "NTPC": ("NTPC", "Power", "Large"),
    "POWERGRID": ("Power Grid", "Power", "Large"),
    "ONGC": ("ONGC", "Energy", "Large"),
    "TITAN": ("Titan Company", "Consumer", "Large"),
    "ULTRACEMCO": ("UltraTech Cement", "Materials", "Large"),
    "ASIANPAINT": ("Asian Paints", "Consumer", "Large"),
    "M&M": ("Mahindra & Mahindra", "Auto", "Large"),
    "HCLTECH": ("HCL Technologies", "IT", "Large"),
    "COALINDIA": ("Coal India", "Energy", "Large"),
    "TATASTEEL": ("Tata Steel", "Materials", "Large"),
    "BEL": ("Bharat Electronics", "Industrials", "Large"),
    "HAL": ("Hindustan Aeronautics", "Industrials", "Large"),
    "ADANIPORTS": ("Adani Ports", "Industrials", "Large"),
    "JSWSTEEL": ("JSW Steel", "Materials", "Large"),
    "TRENT": ("Trent", "Consumer", "Large"),
    "PERSISTENT": ("Persistent Systems", "IT", "Mid"),
    "COFORGE": ("Coforge", "IT", "Mid"),
    "MPHASIS": ("Mphasis", "IT", "Mid"),
    "KPITTECH": ("KPIT Technologies", "IT", "Mid"),
    "DIXON": ("Dixon Technologies", "Industrials", "Mid"),
    "POLYCAB": ("Polycab India", "Industrials", "Mid"),
    "CUMMINSIND": ("Cummins India", "Industrials", "Mid"),
    "BHARATFORG": ("Bharat Forge", "Auto", "Mid"),
    "ASHOKLEY": ("Ashok Leyland", "Auto", "Mid"),
    "UNOMINDA": ("UNO Minda", "Auto", "Mid"),
    "MAXHEALTH": ("Max Healthcare", "Healthcare", "Mid"),
    "LUPIN": ("Lupin", "Pharma", "Mid"),
    "AUROPHARMA": ("Aurobindo Pharma", "Pharma", "Mid"),
    "ALKEM": ("Alkem Laboratories", "Pharma", "Mid"),
    "INDHOTEL": ("Indian Hotels", "Consumer", "Mid"),
    "JUBLFOOD": ("Jubilant FoodWorks", "Consumer", "Mid"),
    "FEDERALBNK": ("Federal Bank", "Banks", "Mid"),
    "AUBANK": ("AU Small Finance Bank", "Banks", "Mid"),
    "IDFCFIRSTB": ("IDFC First Bank", "Banks", "Mid"),
    "MUTHOOTFIN": ("Muthoot Finance", "Financials", "Mid"),
    "ABCAPITAL": ("Aditya Birla Capital", "Financials", "Mid"),
    "BSE": ("BSE Ltd", "Financials", "Mid"),
    "OBEROIRLTY": ("Oberoi Realty", "Realty", "Mid"),
    "PHOENIXLTD": ("Phoenix Mills", "Realty", "Mid"),
    "GODREJPROP": ("Godrej Properties", "Realty", "Mid"),
    "PRESTIGE": ("Prestige Estates", "Realty", "Mid"),
    "SUPREMEIND": ("Supreme Industries", "Materials", "Mid"),
    "ASTRAL": ("Astral", "Materials", "Mid"),
    "VOLTAS": ("Voltas", "Consumer", "Mid"),
    "MAZDOCK": ("Mazagon Dock", "Industrials", "Mid"),
    "NCC": ("NCC Ltd", "Industrials", "Small"),
    "RITES": ("RITES", "Industrials", "Small"),
    "IRCON": ("IRCON International", "Industrials", "Small"),
    "TEJASNET": ("Tejas Networks", "Telecom", "Small"),
    "HBLENGINE": ("HBL Engineering", "Industrials", "Small"),
    "TRIDENT": ("Trident", "Consumer", "Small"),
    "GRSE": ("Garden Reach Shipbuilders", "Industrials", "Small"),
    "RAILTEL": ("RailTel Corporation", "Telecom", "Small"),
    "CAMPUS": ("Campus Activewear", "Consumer", "Small"),
    "SAREGAMA": ("Saregama India", "Consumer", "Small"),
    "TITAGARH": ("Titagarh Rail Systems", "Industrials", "Small"),
    "JYOTHYLAB": ("Jyothy Labs", "Consumer", "Small"),
    "WELSPUNLIV": ("Welspun Living", "Consumer", "Small"),
    "KFINTECH": ("KFin Technologies", "Financials", "Small"),
    "ANGELONE": ("Angel One", "Financials", "Small"),
    "JKTYRE": ("JK Tyre & Industries", "Auto", "Small"),
    "GRAPHITE": ("Graphite India", "Materials", "Small"),
    "KIRLOSBROS": ("Kirloskar Brothers", "Industrials", "Small"),
    "ZENSARTECH": ("Zensar Technologies", "IT", "Small"),
    "CYIENT": ("Cyient", "IT", "Small"),
    "NAVA": ("Nava Ltd", "Power", "Small"),
    "IFCI": ("IFCI", "Financials", "Small"),
    "PCBL": ("PCBL", "Materials", "Small"),
    "ELECON": ("Elecon Engineering", "Industrials", "Small"),
    "GPPL": ("Gujarat Pipavav Port", "Industrials", "Small"),
    "SHAKTIPUMP": ("Shakti Pumps", "Industrials", "Small"),
    "KNRCON": ("KNR Constructions", "Industrials", "Small"),
    "PRAJIND": ("Praj Industries", "Industrials", "Small"),
}


def classify(mcap_cr, fallback, large_cr, mid_cr):
    if mcap_cr is None:
        return fallback
    if mcap_cr >= large_cr:
        return "Large"
    if mcap_cr >= mid_cr:
        return "Mid"
    return "Small"


def market_cap_cr(ticker):
    try:
        info = yf.Ticker(ticker).fast_info
        value = getattr(info, "market_cap", None)
        return round(float(value) / 1e7, 0) if value else None
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", help="comma separated, overrides the default list")
    ap.add_argument("--suffix", default=".NS", help=".NS for NSE, .BO for BSE")
    ap.add_argument("--years", type=float, default=2.0)
    ap.add_argument("--large-cr", type=float, default=100000, help="market cap in INR crore for Large")
    ap.add_argument("--mid-cr", type=float, default=30000, help="market cap in INR crore for Mid")
    ap.add_argument("--out", default="stocks.csv")
    a = ap.parse_args()

    syms = [x.strip().upper() for x in a.symbols.split(",")] if a.symbols else list(UNIVERSE)
    tickers = [x + a.suffix for x in syms]
    raw = yf.download(tickers, period=str(int(a.years * 365)) + "d", interval="1d",
                      auto_adjust=True, group_by="ticker", progress=False, threads=True)

    frames = []
    for sym, tkr in zip(syms, tickers):
        try:
            d = raw[tkr].dropna(subset=["Close"]).reset_index()
        except KeyError:
            print("no data for", tkr)
            continue
        if d.empty:
            print("empty data for", tkr)
            continue
        name, sector, fallback = UNIVERSE.get(sym, (sym, "", "Mid"))
        mcap = market_cap_cr(tkr)
        frames.append(pd.DataFrame({
            "symbol": sym, "name": name, "sector": sector,
            "cap": classify(mcap, fallback, a.large_cr, a.mid_cr),
            "mcap": mcap if mcap is not None else "",
            "date": pd.to_datetime(d["Date"]).dt.strftime("%Y-%m-%d"),
            "open": d["Open"].round(2), "high": d["High"].round(2),
            "low": d["Low"].round(2), "close": d["Close"].round(2),
            "volume": d["Volume"].fillna(0).astype("int64"),
        }))
        print("ok", sym)

    if not frames:
        raise SystemExit("No data downloaded. Check your internet connection and the symbols.")
    pd.concat(frames).to_csv(a.out, index=False)
    print("wrote", a.out, "with", len(frames), "symbols")


if __name__ == "__main__":
    main()
