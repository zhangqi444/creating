# Architecture

How Creating is put together, and why. Read [AGENTS.md](../AGENTS.md) for the
rules; this document explains the structure those rules protect.
[design.md](design.md) covers the visual design.

## One sentence

A static React site with no backend: a blog anyone can read, and a studio where
its author keeps the posts in a folder of their own Google Drive and publishes
them by sharing one file.

## One blog, not many

This deployment is one author's blog. `blogId` in `content/site.json` names the
published Drive file the front door shows, and when it is empty — as it is here
— the front door shows the posts committed to the repository. That is the whole
of the tenancy model, and it is a decision rather than an omission.

The question it settles: the sibling sites `learning` and `giving` are
multi-tenant, because every reader of those is signed in, so the session says
whose data to show and two people at the same address each see their own. A blog
is read by people who are not signed in and never will be, so nothing in a
request says whose blog it is. Something in the *URL* has to, which leaves a
shared namespace — a registry mapping a handle to a Drive file — and a registry
is state no single author's Drive can hold. Giving this site a second author
therefore means giving it a database and an owner for it, and that was not
wanted.

So: a second author can still sign in at `#/studio`, keep their posts in their
own Drive and publish them, and `#/b/<driveFileId>` is a working, shareable
address for the result. What they do not get is the front door. If that is ever
to change, it is the registry above that has to be built, not something in this
code — and the three content sources in `content.js` are already the seam it
would attach to.

## Two chromes

`App.jsx` decides between them and nothing else in the app has to know.

| Address | Chrome | What it shows |
|---|---|---|
| `#/`, `#/post/<slug>`, `#/tag/<tag>`, `#/gallery`, `#/<slug>` | `components/site-header.jsx` | this deployment's blog: `blogId` in `site.json`, else the committed bundle |
| `#/b/<driveFileId>/…` | the same reader | that published blog, read with the API key and no sign-in |
| `#/studio` | `components/studio-shell.jsx` | the author's own screens, behind Google sign-in |

Someone following a link to a picture should never meet an account, so the reader
carries no sign of the studio and asks Google for nothing. The studio is a
`lazy()` import and therefore its own chunk: a reader does not download the
editor to look at a picture.

`#/b/<id>/studio` is deliberately *not* the studio. The router strips the blog
prefix, so a stranger reading someone's published blog arrives at route
`["studio"]` too; `App.jsx` checks that no blog id is in the address before it
opens the studio, and otherwise leaves them in the reader, where that route is a
404.

## The shape

```
  content/       site.json, posts/*.md, pages/*.md
     |  make_bundle.py
     v
  public/content/bundle.json
     |  the fallback, and this deployment's blog
     v
  +-------------------------------------------------------------------------+
  |  browser                                                                 |
  |                                                                          |
  |   lib/session.js  — the one sign-in; every module registers with it      |
  |        |                                                                 |
  |        v  adopt(email) / pull / flush                                    |
  |   lib/module-store.js  — the contract a module instantiates once         |
  |        |         gallery.json                                            |
  |        v                                                                 |
  |   localStorage, synchronously  --1.2 s debounce-->  the author's own     |
  |        ^                                             Drive, a folder     |
  |        |  signed in                                  per module          |
  |   modules/gallery/content.js  <-- picks one source, normalises all three |
  |        ^                                                                 |
  |        |  #/b/<id> or site.blogId: readPublic(id) + API key, no token    |
  |   lib/google.js  — GIS token, drive.file, publish(), uploadImage()       |
  +-------------------------------------------------------------------------+
```

Every author is a tenant of nothing: their data is one JSON file, plus one Drive
file per picture, in their own Drive, and the app can only ever see files it
created. Publishing is a Drive permission, not a copy: `{role: reader, type:
anyone}` on the blog's file and on each picture it points at. Reading a published
blog needs no token, only the browser API key, so a visitor never meets a consent
screen.

## Why there is still a "module"

The blog lives at `src/modules/gallery/` and keeps its data through
`lib/module-store.js` and `lib/session.js`, which are built for several modules
over one sign-in. There is one module today. The shape is kept because it came
across from `zhangqi444/the-little-me` working, because its cost is one folder in
Drive and one indirection in the code, and because retrofitting it later would
cost everybody's data: a second thing this site might keep — notes, a reading
list, anything — would otherwise have to be merged into the blog's own file or
migrated out of it.

A module is a folder under `src/modules/` and owes the rest of the app two
things: a store built by `createModuleStore`, and a component. Adding one touches
`main.jsx` (to register its store) and `App.jsx` (to route to it), and nothing
else; each `lazy()` import becomes its own chunk, so one module's code never
loads for another.

## Layers

| Layer | Where | Responsibility |
|---|---|---|
| Content | `content/**` → `site/public/content/bundle.json` | Posts, pages, the gallery and the site's facts. Built by `site/make_bundle.py`, which validates names, dates and pictures and derives excerpt and reading time. The bundle carries the raw Markdown so CI needs no Python packages. |
| Loader | `modules/gallery/content.js` | `loadContent()` picks the author's store, a published Drive file or the bundle and normalises all three into `C`, so no page knows where its posts came from. |
| Session | `lib/session.js` | One sign-in for the whole site. Modules register their store; `afterAuth` adopts them all, and signing out clears every one. |
| Store | `lib/module-store.js` | The contract a module instantiates: localStorage synchronously, its own Drive file on a 1.2 s debounce with a single 401 retry, per-record merge by `at`, tombstones in `deleted`, and a flush on `pagehide`. |
| Model | `modules/gallery/model.js` | What a valid blog dataset is, and how any JSON is coerced into one: slugs made unique, dates checked, posts sorted, tombstones honoured. `mergeData` is last-write-wins per record, with a tombstone newer than a record beating it on both sides. |
| Blog | `modules/gallery/store.js` | What a blog can do on top of what every module can: add, edit and delete a post, upload and attach a picture, publish and unpublish. |
| Pictures | `site/make_thumbs.py`, `lib/picture.js` | Every picture exists at up to three sizes: the original, an 800px `thumb` and, for anything over 800 kB, a 1600px `large`. The tool writes the copies beside the original and never touches it; the bundle records their paths; `small()` and `full()` choose one and fall back to the original when there is none. A Drive picture gets the same two sizes from a width parameter. |
| Markdown | `lib/markdown.js` | marked, GFM, with a renderer that gives headings ids, wraps images in figures, wraps tables so they scroll inside the column, and opens external links in a new tab. Trusted content, no sanitiser. |
| Router | `lib/router.js`, `App.jsx` | Hash routes, each optionally under `#/b/<driveFileId>` so a published blog's links keep their blog. Any other route is the 404 view. Navigation scrolls to the top. |
| Theme | `lib/theme.js` | Saved choice (`localStorage["creating.theme"]`) > host `data-theme` > OS; sets the `.dark` class and the `theme-color` meta. |
| Shell | `components/site-header.jsx`, `site-footer.jsx`, `studio-shell.jsx` | The reader's chrome (brand, the nav from `site.json` folded into a menu on phones, the theme toggle) and the studio's (the account and the save state in words). |
| Pages | `modules/gallery/pages/*.jsx` | One file per route — `home`, `post`, `tag`, `page`, `gallery`, `not-found`, `studio`. |
| UI kit | `components/ui/*` | shadcn/ui `button` and `dialog` copied into the repo. `modules/gallery/post-card.jsx` holds the card, the avatar and the byline. |

## Build and deploy

- Vite 8 with `base: './'` so the same build works at a domain root or under a
  subpath. `vite.config.js` adds the manifest link and registers the service
  worker, and (from `url` in `content/site.json`) writes the canonical link, the
  `og:` tags and the Search Console verification tag into the head and
  `robots.txt` and `sitemap.xml` into `dist/`. `CNAME` is written only for a
  custom domain: the default `*.github.io` address is not one, and a CNAME naming
  it would take the user site down with this one. The address is one of the
  site's facts, so it lives with the content rather than in the build config.
- `.github/workflows/pages.yml`: rebuild the bundle and fail on drift, `npm ci`,
  `npm run build`, `configure-pages` (with `enablement`), upload `site/dist`,
  `deploy-pages`. Pages **must** be on the GitHub Actions source; in branch mode
  Jekyll serves the README instead.
- `public/sw.js`: offline shell. Hashed assets are cached on first fetch;
  `index.html` and `bundle.json` are network-first so a new post shows up on the
  next visit rather than being pinned to whatever a visitor saw first.

## Testing

Two Playwright suites, both against the built `dist/`. `site/test_site.cjs` is
the reading site, served under `/creating/` on a desktop and a touch-emulated
phone; it reads the committed bundle so its expectations (how many cards, which
post leads, which topic has how many posts) follow the content rather than being
hard-coded, and it fails if the page fetches anything from another host.
`site/test_drive.cjs` is the studio, with Google stubbed by a fake Drive that
refuses an anonymous read of an unshared file — which is what makes the privacy
checks worth anything — and that can refuse one write with a 401 on demand, so
the token retry is exercised rather than assumed.

Selectors are `data-testid`; a UI change that breaks one means fixing the test's
assumption, never deleting the check.

## Relationship to the sibling repositories

This repo shares the stack, the theme tokens, the docs layout and the test layout
with `zhangqi444/the-little-me`, `zhangqi444/volunteer` and `zhangqi444/isee` on
purpose, and its Google and store layers follow volunteer's.

Against `the-little-me`, whose Gallery module this is, the deliberate differences
are: the blog is the front door rather than a module behind `#/me`; there is one
store rather than three, so the app shell is a studio chrome rather than a module
nav; `appHome` is gone, since there is no app to hand the root address to; a post
with no title at all is treated as untitled and shows its date, because here the
studio is the usual way a post is made and a blank title is a normal state rather
than a Ghost import artifact; and the build declines to write a `CNAME` for a
`*.github.io` address.

None of the other repositories is modified by this work, and none can be read
from here: `drive.file` grants an app access only to the files it created, and
each uses a different client id in a different Google Cloud project.

## Telling people about a new picture

The subscribe form collects addresses; `site/make_broadcast.py` makes the thing
that goes to them, from the same bundle the site renders, so the email and the
page cannot disagree about what was posted. It writes `site/broadcast/` and
sends nothing — the output becomes a **draft** in Resend that a person reads and
presses send on. That is deliberate: putting something in front of people is
only a decision if it can still be stopped, and a script that mails strangers
the moment a commit lands is not that. The generated files are ignored by git,
being derived from the bundle like `dist/`.

Three constraints come from the content rules rather than from email:

- the post's own title and caption go in verbatim — nothing is summarised or
  written *about* them;
- no author name appears anywhere, so the mail is from the blog, not a person,
  and it is sent from the `sheilazhang.org` domain for the same reason;
- pictures are absolute URLs on this site's own domain, using the 800px copy,
  which is the right size for a 600px column at two times density.

The HTML is tables and inline styles because mail clients are twenty years
behind browsers; a `div` layout with a stylesheet collapses in Outlook.
