# CLAUDE.md

**Read [AGENTS.md](AGENTS.md) first** — project context, stack, the content
rules, testing and the hard rules live there. This file is only the working
agreement for Claude Code sessions. It mirrors `zhangqi444/the-little-me/CLAUDE.md`,
`zhangqi444/volunteer/CLAUDE.md` and `zhangqi444/isee/CLAUDE.md`; when they drift,
this project follows isee.

## Before you change anything

- Work in `site/`. Content edits go in `content/**`, then re-run
  `python3 site/make_bundle.py` and commit the regenerated bundle.
- Keep this site consistent with its siblings: same tokens (with this site's blue
  accent), component library, test layout and docs. A convention added to one
  belongs in the others.
- The gallery feature here came from `zhangqi444/the-little-me`, which still runs
  its own copy as one module of a hub app. **This repository never edits that
  one**, and a fix worth having in both is made in both deliberately, not by
  copying a whole file over.

## Before you commit

```bash
cd site && npm run build && npm test
python3 site/make_bundle.py
git diff --exit-code -- site/public/content/
```

If a check fails because the UI legitimately changed, fix the test's assumption —
never delete the check. The two checks in `test_drive.cjs` that say a blog is
private until Publish and readable by nobody after Unpublish are not assumptions;
if one of those fails, the code is wrong.

## Committing and pushing

- Push after every green commit — the Pages build follows automatically.
- Commit messages: what changed and *why it was wrong before*, in prose. No
  bullet-point changelogs of file names.
- Trailers:

```
Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: <session url>
```

## Things to know before they bite

- Pages must have **Source: GitHub Actions**. With "Deploy from a branch" GitHub
  runs Jekyll over the repo root and serves the README instead of the site. The
  workflow cannot turn Pages on by itself: until the owner enables it once in
  Settings → Pages, `configure-pages` fails with "Resource not accessible by
  integration" even though the bundle check and the build before it pass.
- `url` in `content/site.json` is `https://creating.sheilazhang.org/` — a real custom
  domain, so the build writes `dist/CNAME` from it and that is what tells Pages
  the address. A `*.github.io` address is deliberately not given a CNAME: naming
  it there makes Pages serve this project from the user site and takes both
  down. The DNS record, Enforce HTTPS and Search Console are the owner's, and
  the README lists them in order.
- If the live site ever shows the README instead of the blog, Pages has been put
  back on **Deploy from a branch**: in that mode GitHub runs Jekyll over the
  repository root and serves `README.md`. The fix is Settings → Pages → Source →
  **GitHub Actions**, nothing in the code.
- Pictures must be in `site/public/images/`; `make_bundle.py` refuses a post
  whose `image` is not there.
- The deployed site usually cannot be opened from the remote sandbox — GitHub's
  and Cloudflare's hosts answer 403 at the proxy's CONNECT — so a change is
  verified by the suites and the workflow's conclusion, never by loading the live
  page.
- The posts in `content/` are a child's, carried over with her pictures (see
  AGENTS.md). Her writing is never edited and her name appears nowhere. The
  pictures live in `site/public/images/`; nothing is fetched from another host,
  and the reading suite fails if that ever changes.

## Verification habit

Screenshot the page you changed — desktop, phone width, and dark mode — and look
at it before saying it is done. The suite writes `shot-*.png` into `site/`.
