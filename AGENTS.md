# AGENTS.md — Creating

Read this before changing anything. It is the contract for agents and for humans,
and it is deliberately the same shape as `zhangqi444/the-little-me/AGENTS.md`,
`zhangqi444/volunteer/AGENTS.md` and `zhangqi444/isee/AGENTS.md`: these sites
share one stack, one look, one docs layout and one way of testing.

## What this is

**Creating** is a picture blog anyone can keep, whose data belongs to whoever
wrote it. Signing in with Google gives an author a blog stored in **their own
Google Drive**; publishing shares that one file so strangers can read it with no
sign-in of their own. It is multi-tenant by isolation, exactly like
`zhangqi444/volunteer` and `zhangqi444/isee`: every author is their own tenant
and there is no shared backend, no server and no database.

The feature came across from the Gallery module of
[`zhangqi444/the-little-me`](https://github.com/zhangqi444/the-little-me), which
still runs it as one module of a three-module hub app. This repository is that
blog on its own: the same reader, the same studio, the same Drive contract, with
the hub's other modules and its `#/me` shell left behind. Neither repository
reads the other's data — `drive.file` grants an app access only to files it
created, and the two use different OAuth clients — and changing one does not
change the other.

### Two chromes

| Address | Chrome | What it shows |
|---|---|---|
| `#/`, `#/post/…`, `#/tag/…`, `#/gallery`, `#/<slug>` | `components/site-header.jsx` | the blog: this deployment's own |
| `#/b/<driveFileId>/…` | the same reader | that published blog, read with the API key |
| `#/studio` | `components/studio-shell.jsx` | the author's own screens, behind Google sign-in |

The reader carries no sign of the studio and no account, because someone
following a link to a picture has no business meeting a sign-in screen. The
studio is a dynamic import, so a reader never downloads the editor.

### Where a page's posts come from

| Address | Source |
|---|---|
| `#/b/<driveFileId>/…` | that published blog, read from its owner's Drive with no sign-in |
| any route, `blogId` set in `content/site.json` | the blog that names, likewise unauthenticated |
| any route, no `blogId` | `site/public/content/bundle.json`, the committed content |
| any route, while signed in | the author's own store, so editing is its own preview |

`modules/gallery/content.js` resolves this and normalises all three into one read
model, so no page knows where its posts came from.

**It is a picture blog.** A post is a picture, a title and a date; a caption, a
topic or a line or two of body are optional and most posts have none. The UI is
built around that: no excerpt where there is no text, no reading time under fifty
words, and an untitled post shows its date as its heading.

Lives at <https://creating.sheilazhang.org/> (a custom domain on GitHub Pages; also reachable at
<https://zhangqi444.github.io/creating/>). Every path in the build is relative
and routing is by hash, so both addresses serve the same build.

## Repository layout

```
content/
  site.json                name, tagline, url, google, author, nav, footer, blogId
  posts/YYYY-MM-DD-slug.md one post per file: front matter, then Markdown
  pages/<slug>.md          standing pages (about, privacy, terms); reachable at #/<slug>
  gallery.json             optional: a hand-written gallery list, overriding the derived one
site/
  google.json              the Google client id and browser API key for local dev (public values; empty in the repo — the deployed site takes them from the OAUTH_CLIENT_ID and GOOGLE_API_KEY repository variables instead)
  make_bundle.py           content/** → site/public/content/bundle.json (the committed content)
  index.html               Vite entry
  vite.config.js           base './', the manifest, the service worker and the address
  src/main.jsx             boot: theme, stores, fetch the bundle, render
  src/App.jsx              the two chromes and the hash router
  src/lib/google.js        Google sign-in and Drive: a folder per module, publishing and picture upload
  src/lib/session.js       the one sign-in; modules register with it and are pulled together
  src/lib/module-store.js  the store contract a module instantiates: localStorage first, its own Drive file on a 1.2 s debounce, tombstones
  src/modules/gallery/     the blog: model, store, content resolution, post card, pages
  src/lib/markdown.js      marked with heading ids, figures, scrolling tables, external links
  src/lib/router.js        hash routing, with the `#/b/<blogId>` prefix stripped and put back
  src/lib/theme.js         saved choice > host data-theme > OS; the .dark class
  src/lib/format.js        fmtDate, readTime, initials, and the untitled-post rule
  src/components/ui/       shadcn/ui components, written into the repo (button, dialog)
  src/components/          site-header, site-footer, studio-shell, markdown, page-title
  public/                  favicon, manifest, service worker, images/, content/bundle.json
  test_site.cjs            the reading site's Playwright suite — see Testing
  test_drive.cjs           the studio's Playwright suite, with Google stubbed — see Testing
.github/workflows/pages.yml  build + deploy to GitHub Pages
docs/                      architecture.md (structure and why), design.md (look, feel, and why)
```

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite 8**, `base: './'` | static output, works under a subpath |
| UI | **React 19** + **Tailwind v4** + **shadcn/ui** | components live in `src/components/ui/`, owned by the repo |
| Markdown | **marked** in the browser | the bundle carries raw Markdown; no Python packages needed in CI |
| Icons | **lucide-react** | |
| Font | the device's own UI stack | no webfont request |
| Router | hash routing in `src/lib/router.js` | GitHub Pages has no server-side rewrites |
| Content | `content/**` → `bundle.json`, fetched once at boot | one JSON, cached network-first by the worker |
| Hosting | GitHub Pages via Actions | |

**One backend, and only one.** No server for the site, no database, no comments
service, no analytics. The only account system is Google's, and the only storage
for a blog is the author's own Drive: `drive.file` scope, so the app can never
see a file it did not create.

The single exception is `worker/`, the subscribe endpoint, added deliberately
and written down here rather than slipped in. It exists because a Resend API key
can send mail as this domain and a static page cannot keep one: anything the
site carries is readable by anyone who views source. The Worker holds the key,
accepts one address, hands it to a Resend audience and forgets it. It stores
nothing, reads nothing, and cannot see the blog. Anything beyond that — a second
route, a counter, a record of who visited — is a new backend and needs the same
argument made again in this file.

`test_site.cjs` still holds the line that the pages themselves load nothing from
another host; the subscribe POST is a form submission, not a page asset.

**Nothing is public until the author publishes.** A new blog's file is private,
and so is every picture uploaded into it. `Store.publish()` grants `{role:
reader, type: anyone}` on the blog's file and on each picture it points at, so a
published post is not full of holes; a picture added while published is shared as
it arrives. `Store.unpublish()` takes all of that back — putting a picture on the
internet must be a deliberate act, and so must be undoable. `test_drive.cjs`
holds both lines: a stranger cannot read an unpublished blog, cannot load a
picture in one, and cannot read it again once it is withdrawn.

## Content

- **Posts** are `content/posts/YYYY-MM-DD-slug.md`. Front matter (a small YAML
  subset: `key: value`, `key: [a, b]`, `key: true`) needs `title`; `date` defaults
  to the file name's. Optional: `tags`, `image`, `imageAlt`, `caption`, `excerpt`,
  `featured`, `updated`, `draft`, `slug`. The excerpt falls back to the first
  paragraph, cut at 160 characters. Reading time is words ÷ 200, at least 1, and
  is omitted below fifty words.
- **Pages** are `content/pages/<slug>.md` with `title` and optional `updated`,
  `image`, `imageAlt`. The router sends any single-segment route that is not
  `gallery` or `studio` to the page with that slug, so `#/about` is
  `pages/about.md`.
- **Gallery** is every post's picture, newest first, derived by the bundle
  script. A `content/gallery.json` overrides that with a hand-written list;
  without one there is no second list of pictures to drift from the posts.
- **Pictures** are either a file in `site/public/images/`, referenced as
  `images/<file>`, or an absolute URL. `make_bundle.py` checks that a
  repo-relative picture exists but leaves an absolute URL alone. Relative paths
  work under the hash router because the document URL never changes.
- `make_bundle.py` must be re-run and `site/public/content/bundle.json`
  committed whenever `content/**` changes — CI fails the build if the committed
  bundle has drifted.
- **The address** is `url` in `site.json`. The build turns it into the canonical
  link and the `og:` tags in the head, and writes `robots.txt` and `sitemap.xml`
  into `dist/`. It writes `CNAME` only for a custom domain: the default
  `*.github.io` address is not one, and a CNAME naming it would take the user
  site down with this one. `google.siteVerification` is the token from Google
  Search Console; while it is empty no verification tag is written.

### The content, and whose it is

The 135 posts here are a nine-year-old's, carried across from
`zhangqi444/the-little-me` with her pictures, which came to that repository from
an earlier Ghost blog. They run from November 2023 to August 2026. All but
fourteen are a title, a date and one picture with no body at all; nineteen were
never named and show their date as their heading; two carry a topic. The About
page is hers. Privacy and Terms are this repository's own, because they describe
this site rather than the one the posts came from.

Three rules follow from that, and they are not negotiable:

- **Her writing is sacred.** Never rewrite, shorten or "improve" the text of a
  post. Fix a typo only when asked.
- **Her name appears nowhere.** Not in the site, the docs or a commit message.
  The owner asked for that directly, and it holds here as it does there.
- **Never invent a fact about her.** The About page is the one place with prose
  about her, and it is not to be extended with made-up biography.

The pictures are in `site/public/images/`, 135 files and about 77 MB, downloaded
from the old blog's CDN by `site/fetch_images.py`. They are not served from
anywhere else and must not go back to being: the reading suite fails if the page
fetches anything from another host, which is the check that keeps this true.

If posts are ever replaced wholesale, keep at least one with a body, one without
and one carrying a topic, or the reading suite stops exercising those paths.

## Commands

```bash
cd site
npm ci
npm run dev        # local dev server
npm run build      # → site/dist   (the Pages build)
npm test           # both Playwright suites, against the built dist/
python3 site/make_bundle.py    # rebuild bundle.json after editing content/**
```

The generated bundle is committed, and CI fails the build if it has drifted from
its source.

## Testing

Two suites. `site/test_site.cjs` covers the reading site, run against the built
`dist/` served under `/creating/` on a desktop and a touch-emulated phone: the
hero and the cards, the phone menu, a post reached from its card (title, body,
read more, older/newer), a wordless picture post claiming neither, a topic page,
About, the gallery and its lightbox, the studio door on a build with no client
id, the 404 view, the theme toggle surviving a reload, and that nothing is
fetched from another host. It also writes `shot-*.png` for a look.

`site/test_drive.cjs` covers the studio with Google stubbed: sign-in, a post with
a picture, the author's own reader as a live preview, and the second device — the
two copies merge, a deletion on one is not resurrected by the other, and a write
refused for an expired token is retried rather than lost. The privacy half: the
blog file staying private until Publish, a stranger failing to read it before and
succeeding after, the picture arriving as a public Drive URL, a reload with no
second consent prompt, a published link having no studio behind it, and deleting
a post taking its picture with it. Its fake Drive refuses an anonymous read of an
unshared file, so those checks cannot pass by accident.

Rules: every feature gets checks; a UI change that breaks a selector means fixing
the test's *assumption*, not deleting the check. Selectors are `data-testid`.
Both suites must pass before a commit.

## UI conventions

- shadcn/ui components only; if one is missing, add it to `src/components/ui/`
  rather than hand-rolling a div. Blog-specific pieces (the post card, the two
  chromes) live in `src/components/` and `src/modules/gallery/`.
- A hero with the name and tagline, the newest post leading, a three-column card
  grid, a 720px reading column, topics as small uppercase links in the accent
  colour, a byline of avatar · name · date · read time (dropped entirely when the
  blog names no author).
- Dark mode is a first-class theme, not an inversion. Tokens in `src/index.css`
  are the "Calm Scholar" neutrals shared with the sibling repositories, with the
  blue accent this blog inherited.
- Colour has one meaning: *primary* (blue) is links, topics and the one action
  on a screen. Nothing else is coloured.
- Every route is reachable from the header or the footer; the header folds to a
  menu on phones, so nothing may live only in the inline nav.
- Dates render through `fmtDate` ("Sep 6, 2026"). Sentence case everywhere.

## Content rules

- **An author's writing is theirs.** Never rewrite, shorten or "improve" the text
  of a post. Fix a typo only when asked. For the posts committed here, see *The
  content, and whose it is* above — those rules are stricter and they win.
- Short, concrete, no hype, no exclamation marks — in the posts and in everything
  the repository writes around them: a label, an empty state, a hint in a form.
- Every picture has an `alt` text. The studio nags for one, and so should a
  review.

## Hard rules

1. **No backend but `worker/`, no accounts but Google's, no comments, no
   third-party analytics or fonts.** The site is the repository and the one
   endpoint described under *Tech stack*, and nothing else. A key that can send
   mail as this domain never enters `site/`, `content/`, or a commit.
2. **Nothing is public until Publish, and Publish is undoable.** Any change that
   shares a file earlier, or leaves one shared after Unpublish, is a bug of the
   most serious kind. The checks in `test_drive.cjs` that say so are not
   negotiable.
3. Pushes to `main` deploy immediately; a red build is fixed before anything
   else.
