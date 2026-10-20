"""Encrypt stocks.csv into stocks.enc so only people with the desk password can read the prices.

Run:  DESK_PASSWORD=... python seal.py stocks.csv stocks.enc

Format (JSON): gzip(csv) sealed with AES-256-GCM. The key comes from the password via PBKDF2-SHA256.
The salt is fixed so a browser that chose "keep me signed in" can reuse its key after each daily refresh;
the IV is new on every run. index.html does the matching decryption with the Web Crypto API."""
import base64
import gzip
import json
import os
import sys

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

SALT = base64.b64decode("6V8Y1jfuMCCOp0XzE9w+Ag==")
ITERATIONS = 600_000


def main():
    src, dst = sys.argv[1], sys.argv[2]
    password = os.environ.get("DESK_PASSWORD", "")
    if len(password) < 12:
        raise SystemExit("Set DESK_PASSWORD to at least 12 characters. Nothing was written.")
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=SALT, iterations=ITERATIONS).derive(password.encode())
    iv = os.urandom(12)
    with open(src, "rb") as f:
        sealed = AESGCM(key).encrypt(iv, gzip.compress(f.read(), 9), None)
    b64 = lambda b: base64.b64encode(b).decode()
    with open(dst, "w") as f:
        json.dump({"v": 1, "iter": ITERATIONS, "salt": b64(SALT), "iv": b64(iv), "ct": b64(sealed)}, f)
    print("wrote", dst)


if __name__ == "__main__":
    main()
