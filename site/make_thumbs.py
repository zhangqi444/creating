#!/usr/bin/env python3
"""Smaller copies of the pictures, for the places that show them small.

A post here is a picture, and the pictures are photographs straight off a
phone: 2000px wide, half a megabyte each. That is right for the post page,
where the picture is the point and fills most of the screen. It is wrong
everywhere else. The front page shows the newest two dozen as cards about
400px wide and was downloading 9 MB to draw them, and the gallery is worse —
every picture on the blog, as tiles.

So each picture gets derived copies next to it, and the bundle records them:

    images/thumbs/<name>.jpg   800px wide, for cards and gallery tiles
    images/large/<name>.jpg   1600px wide, for the post page

The originals stay exactly as they are. Nothing is replaced, nothing is
recompressed in place, and a derivative is only ever used where the picture is
drawn smaller than it. The `large` copy is made only for an original big enough
to be worth it — most of these are already a sensible size for a post page, and
a second nearly-identical file would cost the repository more than it saves the
reader.

    python3 site/make_thumbs.py              # make what is missing
    python3 site/make_thumbs.py --dry-run    # say what it would make, and the saving
    python3 site/make_thumbs.py --force      # make them all again

Safe to re-run: a copy that is already there and newer than its original is left
alone. Afterwards run make_bundle.py, which writes the paths into the bundle,
and commit both the pictures and the bundle. The reading suite's check that
cards point at thumbs is what keeps this from quietly rotting.
"""
import argparse, sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("this tool needs Pillow: pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "site" / "public" / "images"

CARD_WIDTH = 800        # a card is ~400px at most; twice that for dense screens
POST_WIDTH = 1600       # a post picture is at most ~1200px of screen
QUALITY = 82            # photographs; past here the file grows and nothing looks better
LARGE_FROM = 800 * 1024 # below this an original is already fine for a post page

SIZES = [("thumbs", CARD_WIDTH), ("large", POST_WIDTH)]
SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def wanted(original):
    """The derived copies this picture should have, as (dir, width).

    A thumbnail is worth making whenever the original is wider than a card. A
    `large` copy is about weight, not width: a 1436px PNG screenshot of 5.8 MB
    needs one as much as a 2048px photograph does, and capping the width alone
    would have skipped it. So size decides whether to make one and width only
    decides how wide it comes out.
    """
    with Image.open(original) as im:
        width = im.size[0]
    out = []
    if width > CARD_WIDTH:
        out.append(("thumbs", CARD_WIDTH))
    if original.stat().st_size >= LARGE_FROM:
        out.append(("large", min(width, POST_WIDTH)))
    return out


class Bigger(Exception):
    """A derived copy that came out no smaller than the original."""


def derive(original, target, dest):
    with Image.open(original) as im:
        im = im.convert("RGB")
        im.thumbnail((target, target * 100), Image.LANCZOS)
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    # Re-encoding can lose: a small, already-optimised JPEG comes back bigger.
    # Keeping that would mean serving a worse picture in more bytes, so the copy
    # goes and the original is used where it would have been.
    if dest.stat().st_size >= original.stat().st_size:
        size = dest.stat().st_size
        dest.unlink()
        raise Bigger(f"the copy came out larger ({size // 1024} kB vs {original.stat().st_size // 1024} kB)")
    return dest.stat().st_size


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="report, write nothing")
    ap.add_argument("--force", action="store_true", help="remake copies that already exist")
    args = ap.parse_args()

    originals = sorted(f for f in IMAGES.glob("*") if f.is_file() and f.suffix.lower() in SUFFIXES)
    if not originals:
        sys.exit(f"no pictures in {IMAGES.relative_to(ROOT)}")

    made, kept, bigger, failed, bytes_in, bytes_out = 0, 0, 0, [], 0, 0
    for original in originals:
        for name, target in wanted(original):
            dest = IMAGES / name / (original.stem + ".jpg")
            if dest.exists() and not args.force and dest.stat().st_mtime >= original.stat().st_mtime:
                kept += 1
                bytes_in += original.stat().st_size
                bytes_out += dest.stat().st_size
                continue
            if args.dry_run:
                made += 1
                print(f"  would make {name}/{dest.name}  <-  {original.name}")
                continue
            try:
                size = derive(original, target, dest)
            except Bigger as e:
                bigger += 1
                print(f"  skipped {name}/{dest.name}: {e}")
                continue
            except Exception as e:                    # noqa: BLE001 — report and carry on
                failed.append((original.name, e))
                print(f"  FAILED {original.name}: {e}")
                continue
            made += 1
            bytes_in += original.stat().st_size
            bytes_out += size
            print(f"  {name}/{dest.name}  {size // 1024} kB  (from {original.stat().st_size // 1024} kB)")

    print(f"\n{len(originals)} picture(s): {made} copy/copies made, {kept} already there"
          + (f", {bigger} skipped as no smaller" if bigger else ""))
    if bytes_in and not args.dry_run:
        print(f"what those copies replace: {bytes_in / 1048576:.1f} MB  ->  {bytes_out / 1048576:.1f} MB")
    if failed:
        print(f"{len(failed)} picture(s) could not be copied; they will keep using the original")
    print("next: python3 site/make_bundle.py && cd site && npm run build && npm test")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
