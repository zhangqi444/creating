#!/usr/bin/env python3
"""The email for a new picture, built from the bundle rather than written twice.

A blog whose readers have no way to hear about a new post relies on them
remembering to come back, which mostly means nobody does. The subscribe form
collects the addresses; this makes the thing that goes to them.

    python3 site/make_broadcast.py                  # the newest post
    python3 site/make_broadcast.py --since 2026-09-01   # everything since a date
    python3 site/make_broadcast.py --count 3        # the newest three

It writes subject, HTML and plain text into site/broadcast/ and prints the
subject. Nothing is sent and nothing is scheduled: the output becomes a draft in
Resend, which a person looks at and presses send on. Putting something in front
of people is only a decision if it can still be stopped, and a script that mails
strangers the moment a commit lands is not that.

Three things the content rules make non-negotiable, and they are the reason this
is a script rather than a prompt each time:

  - The post's own title and caption go in verbatim. Nothing here rewrites them,
    summarises them, or writes a line of copy about them.
  - No author name appears, so the mail is from the blog, not from a person.
  - Pictures are absolute URLs on this site's own domain. Mail clients will not
    load a relative path, and the small copy is the right size for a 600px
    column anyway.

The HTML is tables and inline styles on purpose. It looks twenty years old
because mail clients are: a <div> layout with a stylesheet collapses in Outlook,
which is still where a good share of people will open it.
"""
import argparse, html, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "site" / "public" / "content" / "bundle.json"
OUT = ROOT / "site" / "broadcast"

# The site's own tokens, which are sheilazhang.org's, so the mail matches both.
# BLUE is the button fill (the hub's exact pink); LINK is the readable text pink.
INK, MUTED, BLUE, LINK, LINE, PAPER = "#15171a", "#6b6b6b", "#ff1a75", "#d6005b", "#e6e6e6", "#ffffff"
FONT = "Helvetica, Arial, sans-serif"


def esc(s):
    return html.escape(str(s or ""), quote=True)


def picture(post, base):
    """The small copy, as an absolute URL. Falls back to the original."""
    src = post.get("thumb") or post.get("image") or ""
    if not src:
        return ""
    return src if src.startswith(("http://", "https://")) else base.rstrip("/") + "/" + src.lstrip("/")


def block(post, base):
    url = f"{base.rstrip('/')}/#/post/{post['slug']}"
    img = picture(post, base)
    title = esc(post["title"])
    bits = [f'''
      <tr><td style="padding-top:28px;padding-bottom:0;">''']
    if img:
        bits.append(f'''
        <a href="{esc(url)}" style="text-decoration:none;"><img src="{esc(img)}" alt="{esc(post.get('imageAlt') or post['title'])}"
          width="600" height="450" border="0"
          style="display:block;width:100%;max-width:600px;height:auto;border-radius:12px;" /></a>''')
    bits.append(f'''
        <p style="margin-top:14px;margin-bottom:0;font-family:{FONT};font-size:18px;line-height:1.4;color:{INK};font-weight:bold;">
          <a href="{esc(url)}" style="color:{INK};text-decoration:none;">{title}</a>
        </p>''')
    if post.get("caption"):
        bits.append(f'''
        <p style="margin-top:6px;margin-bottom:0;font-family:{FONT};font-size:15px;line-height:1.5;color:{MUTED};">{esc(post["caption"])}</p>''')
    bits.append("""
      </td></tr>""")
    return "".join(bits)


def build(site, posts, base):
    rows = "".join(block(p, base) for p in posts)
    title = esc(site["title"])
    return f'''<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background-color:{PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{PAPER}"
  style="background-color:{PAPER};">
  <tr><td align="center" style="padding-top:28px;padding-bottom:28px;padding-left:16px;padding-right:16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
      style="width:100%;max-width:600px;">
      <tr><td style="padding-bottom:4px;font-family:{FONT};font-size:14px;line-height:1.4;color:{MUTED};">
        <a href="{esc(base)}" style="color:{LINK};text-decoration:none;font-weight:bold;">{title}</a>
      </td></tr>
      <tr><td style="padding-top:0;padding-bottom:0;font-family:{FONT};font-size:16px;line-height:1.5;color:{INK};">
        {"Something new." if len(posts) == 1 else f"{len(posts)} new pictures."}
      </td></tr>
      {rows}
      <tr><td style="padding-top:34px;padding-bottom:0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td bgcolor="{BLUE}" style="background-color:{BLUE};border-radius:999px;">
            <a href="{esc(base)}" style="display:inline-block;padding-top:11px;padding-bottom:11px;padding-left:22px;padding-right:22px;font-family:{FONT};font-size:15px;line-height:1.2;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:999px;">See them all</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding-top:34px;border-top:1px solid {LINE};">
        <p style="margin:0;font-family:{FONT};font-size:13px;line-height:1.5;color:{MUTED};">
          You are getting this because you asked for a note when there is something new.
          <a href="{{{{{{RESEND_UNSUBSCRIBE_URL}}}}}}" style="color:{MUTED};text-decoration:underline;">Stop these</a> whenever you like.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
'''


def plain(site, posts, base):
    lines = [site["title"], "", "Something new." if len(posts) == 1 else f"{len(posts)} new pictures.", ""]
    for p in posts:
        lines.append(p["title"])
        if p.get("caption"):
            lines.append(p["caption"])
        lines.append(f"{base.rstrip('/')}/#/post/{p['slug']}")
        lines.append("")
    lines += [f"See them all: {base}", "",
              "You are getting this because you asked for a note when there is something new.",
              "Stop these whenever you like: {{{RESEND_UNSUBSCRIBE_URL}}}"]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--since", help="every post dated after this (YYYY-MM-DD)")
    ap.add_argument("--count", type=int, default=1, help="how many of the newest to include (default 1)")
    args = ap.parse_args()

    bundle = json.loads(BUNDLE.read_text(encoding="utf-8"))
    site, base = bundle["site"], bundle["site"]["url"]
    posts = bundle["posts"]              # already newest first
    chosen = [p for p in posts if p["date"] > args.since] if args.since else posts[: max(1, args.count)]
    if not chosen:
        sys.exit(f"no posts newer than {args.since}; nothing to send")

    # One picture is "something new"; a stack of them is not, so the subject
    # says which. The post's own title carries the rest — nothing is invented.
    subject = chosen[0]["title"] if len(chosen) == 1 else f"{len(chosen)} new pictures"

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "subject.txt").write_text(subject + "\n", encoding="utf-8")
    (OUT / "broadcast.html").write_text(build(site, chosen, base), encoding="utf-8")
    (OUT / "broadcast.txt").write_text(plain(site, chosen, base), encoding="utf-8")

    print(f"subject: {subject}")
    print(f"posts:   {', '.join(p['slug'] for p in chosen)}")
    print(f"written: {OUT.relative_to(ROOT)}/ (subject.txt, broadcast.html, broadcast.txt)")
    print("next:    review it, then it becomes a draft in Resend — nothing is sent by this script")
    return 0


if __name__ == "__main__":
    sys.exit(main())
