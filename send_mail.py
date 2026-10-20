"""Send the daily brief written by brief.js.

Run:  python send_mail.py out/

Reads SMTP settings from the environment (GitHub secrets):
  SMTP_HOST  default smtp.gmail.com
  SMTP_PORT  default 587 (STARTTLS); 465 uses SSL
  SMTP_USER, SMTP_PASS  login (for Gmail, an app password)
  MAIL_TO    one or more addresses, comma separated
  MAIL_FROM  optional, defaults to SMTP_USER
If SMTP_USER, SMTP_PASS or MAIL_TO is missing, it prints a notice and exits without error."""
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage
from email.utils import formataddr, make_msgid


def main():
    out = sys.argv[1]
    env = os.environ.get
    user, password, to = env("SMTP_USER"), env("SMTP_PASS"), env("MAIL_TO")
    if not (user and password and to):
        print("::notice::Email not configured. Add SMTP_USER, SMTP_PASS and MAIL_TO secrets to receive the brief.")
        return
    host, port = env("SMTP_HOST") or "smtp.gmail.com", int(env("SMTP_PORT") or 587)
    read = lambda name: open(os.path.join(out, name), encoding="utf-8").read()

    msg = EmailMessage()
    msg["Subject"] = read("subject.txt").strip()
    msg["From"] = formataddr(("Alpha Search", env("MAIL_FROM") or user))
    msg["To"] = to
    msg["Message-ID"] = make_msgid(domain=(env("MAIL_FROM") or user).split("@")[-1])
    msg.set_content(read("brief.txt"))
    msg.add_alternative(read("brief.html"), subtype="html")

    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=30) as s:
            s.login(user, password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=30) as s:
            s.starttls(context=ctx)
            s.login(user, password)
            s.send_message(msg)
    print("sent:", msg["Subject"])


if __name__ == "__main__":
    main()
