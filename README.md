# Creating

A picture blog whose data belongs to whoever wrote it. Sign in with Google and
your posts and pictures live in **your own Google Drive**; press Publish and one
file is shared so anyone with the link can read it without signing in to
anything. Every author is their own tenant and there is no server, no database
and no shared store — the same contract as
[`volunteer`](https://github.com/zhangqi444/volunteer),
[`isee`](https://github.com/zhangqi444/isee) and
[`the-little-me`](https://github.com/zhangqi444/the-little-me).

The reading side is a blog: a front page with the site's name and tagline, the
newest post leading and the rest in a grid, a reading page per post, topics, an
**About** page, and a **Gallery** of every picture at once. Posts are Markdown
files in `content/posts`; nothing else is needed to publish one.

There is no backend and no CMS. The site builds with Vite and deploys to GitHub
Pages from `.github/workflows/pages.yml`, and lives at
<https://creating.sheilazhang.org/>.

## Where it came from

This is the Gallery module of
[`the-little-me`](https://github.com/zhangqi444/the-little-me) on its own. There
it is one of three modules — Learning, Service, Gallery — behind a single sign-in
in a hub app for one child; here it is the whole site, with the hub's other
modules and its `#/me` shell left behind and the blog itself moved to the front
door. The reader, the studio, the Drive layer and the publishing contract are the
same code, carried across rather than rewritten.

The two repositories are independent. `drive.file` grants an app access only to
the files it created, and the two use different OAuth clients in different Google
projects, so neither can read the other's data and changing one does not change
the other.

## What is in it today

135 posts by a nine-year-old, from November 2023 to August 2026 — mostly a
picture, a title and a date, with a line or two on the fourteen that have one.
They came from `zhangqi444/the-little-me`, and the pictures with them: every one
was downloaded out of the old blog's CDN into `site/public/images/`, so the site
depends on no host but its own. Her writing is not to be edited; see AGENTS.md.

## The two halves

| Address | What it is |
|---|---|
| `#/` | the blog: this deployment's own posts |
| `#/post/<slug>`, `#/tag/<tag>`, `#/gallery`, `#/<slug>` | a post, a topic, every picture, a standing page |
| `#/studio` | the author's own screens, behind Google sign-in |
| `#/b/<driveFileId>` | anyone's published blog, read with no sign-in at all |

A reader never meets an account, and never downloads the studio: it is a separate
chunk, loaded only when someone opens it.

## Writing a post

There are two ways, and they do not have to agree.

**In the repository**, for the blog this deployment serves:

1. Add `content/posts/YYYY-MM-DD-slug.md`:

   ```markdown
   ---
   title: Paper boats
   date: 2026-02-14
   tags: [making, water]
   image: images/paper-boats.svg
   imageAlt: Three white paper boats on blue water
   caption: Optional. Shown under the picture.
   excerpt: One sentence for the card. Optional; the first paragraph is used otherwise.
   ---

   The story, in Markdown. Optional too — most posts here are a picture, a title
   and a date.
   ```

   Optional keys: `featured: true`, `updated: YYYY-MM-DD`, `draft: true` (kept out
   of the site), `slug:` (defaults to the file name).
2. Put pictures in `site/public/images/` and refer to them as `images/name.ext`.
3. Run `python3 site/make_bundle.py` and commit the regenerated
   `site/public/content/bundle.json` together with the post.

Standing pages (About, Privacy, Terms, …) are `content/pages/<slug>.md` with
`title` and optional `updated`, `image`, `imageAlt`; they are reachable at
`#/<slug>`. The gallery is derived from the posts' pictures, newest first, unless
`content/gallery.json` spells out its own list (`src`, `alt`, `caption`, `date`).
The site's name, tagline, address, author and navigation are in
`content/site.json`.

**In the studio**, for a blog of your own: open `#/studio`, sign in, and add a
picture. Nothing goes near this repository — the post is a record in a JSON file
in your Drive and the picture is a file beside it — and nothing is readable by
anyone else until you press Publish.

## Setting up Google

The studio is off until the build has a Google client id; without one the site
just shows the content committed here and `#/studio` says so. Both values below
are public and belong in the page — the client id names the OAuth app, and the
browser API key only reads files their owners have already shared. Neither is a
secret, but restrict the key to this site by HTTP referrer.

All of this is in the Google Cloud console at <https://console.cloud.google.com>,
signed in as the Google account that should own the project. It is a fifteen
minute job, once.

1. **A project.** Create one, or pick an existing one. Then *APIs & Services* →
   *Library* → enable the **Google Drive API**. Nothing works until that is on.

2. **The consent screen.** *APIs & Services* → *OAuth consent screen*. User type
   **External**; fill in the app name (`Creating`), a support email and a
   developer email. On the *Scopes* step add
   `https://www.googleapis.com/auth/drive.file` — it is non-sensitive, so there
   is no verification review and no unverified-app warning.

   **Then publish it.** A consent screen left in *Testing* only lets the handful
   of accounts listed as test users sign in, and hands out tokens that expire in
   a week. *Audience* → **Publish app** → confirm. With only that one
   non-sensitive scope, publishing takes effect immediately and needs no review.

3. **The OAuth client.** *Credentials* → *Create credentials* → **OAuth client
   ID** → type *Web application*, name it `Creating (web)`. Under *Authorised
   JavaScript origins* add every address the site is served from — the origin
   only, no path:

       https://creating.sheilazhang.org
       https://zhangqi444.github.io   (the Pages address, if you use it too)
       http://localhost:5173          (only for `npm run dev`)

   Leave *Authorised redirect URIs* empty: sign-in here is a popup token
   request, not a redirect. Copy the client id (`….apps.googleusercontent.com`).

4. **The API key.** *Credentials* → *Create credentials* → **API key**. Open it
   and restrict it, or it is a key anyone can lift from the page and spend your
   quota with:

   - *Application restrictions* → **Websites**, with these referrers:

         https://creating.sheilazhang.org/*
         https://zhangqi444.github.io/*
         http://localhost:5173/*

   - *API restrictions* → **Restrict key** → *Google Drive API* only.

   Copy the key. This is what lets a stranger read a published blog with no
   sign-in of their own, so a deployment without it can still write blogs but
   cannot show anyone else's.

5. **Give them to the build.** Either place works, and the environment wins over
   the file:

   - **For the deployed site** — GitHub → *Settings* → *Secrets and variables* →
     *Actions* → *Variables* → **New repository variable**, twice:

         OAUTH_CLIENT_ID = ….apps.googleusercontent.com
         GOOGLE_API_KEY  = …

     Then trigger a build: push anything under `site/` or `content/`, or run
     *Deploy site* from the Actions tab. Variables are read at build time, so a
     change to them only takes effect on the next run.
   - **For local development** — `site/google.json`:

         { "client_id": "….apps.googleusercontent.com", "api_key": "…" }

     It is committed empty on purpose. Putting real values in it works for the
     deployed build too, but then every fork of this repository inherits this
     Google project and spends its quota, which is why the repository variables
     above are the better home for a deployment.

6. **Reload the site.** The header grows a pencil that opens the studio: sign in
   once, and your posts and pictures are kept in a `Creating` folder in that
   Google account's Drive.

If sign-in fails, the message says which of the four things is wrong:
*origin_mismatch* or *invalid_client* means the address you are on is not in the
client's authorised origins (the `github.io` origin has no `/creating` path in
it); *access_denied* means the Drive permission was refused on the consent
screen; *This app is blocked* or a test-user error means the consent screen is
still in *Testing*; and a blog that will not load for a stranger while your own
posts are fine means the API key is missing, unrestricted to the wrong referrer,
or not allowed to call the Drive API.

To make this deployment show a published Drive blog instead of the committed
posts, put that blog's file id in `blogId` in `content/site.json`. Any blog is
also readable at `#/b/<fileId>` without configuring anything.

## Build

    cd site
    npm ci
    npm run dev       # http://localhost:5173
    npm run build     # → site/dist
    npm test          # both Playwright suites, against dist/ (needs Chromium)
    python3 site/make_bundle.py   # after editing content/**; commit the bundle

## Publishing on GitHub Pages

`.github/workflows/pages.yml` runs on every push to `main` that touches `site/`,
`content/` or the workflow, rebuilds the bundle and fails if it differs from the
committed one, builds with `npm ci && npm run build` and publishes `site/dist`.

Pages must be set to **Source: GitHub Actions** (Settings → Pages → Build and
deployment). Nothing is published until that is done once by hand: the workflow
cannot enable Pages by itself, and `configure-pages` fails the deploy with
"Resource not accessible by integration". Every asset path is relative
(`base: './'`) and routing is by hash, so the same build works at a domain root
and under `/creating/` alike.

## The address

The site is at <https://creating.sheilazhang.org/>, a custom domain in front of GitHub Pages.

The address itself is `url` in `content/site.json`. The build writes it into the
head (canonical link, `og:` tags), into `dist/robots.txt` and `dist/sitemap.xml`,
and into `dist/CNAME`, which is how Pages is told the domain. That last file is
written only for a real domain: a `*.github.io` address is not one, and a CNAME
naming it would make Pages serve this project from the user site and take both
down.

Three things live outside the repository, and only the owner can do them:

1. **DNS** for `creating.sheilazhang.org`: a `CNAME` record pointing at
   `zhangqi444.github.io`, or, on an apex name, the four GitHub Pages `A`
   records (`185.199.108-111.153`) and the four matching `AAAA` records
   (`2606:50c0:800{0,1,2,3}::153`). On Cloudflare every one of them must be
   **grey (DNS only)**: orange proxies the name and GitHub then cannot verify
   the domain or issue a certificate.
2. **Enforce HTTPS** in Settings → Pages, once the certificate is issued, which
   can take about fifteen minutes after the domain first resolves.
3. **The Google client**, if the domain changes again: the new origin has to go
   in the OAuth client's authorised origins and the API key's referrer
   restrictions, or the studio stops signing in at the new address.

There is also a `CNAME` file at the repository root, left from setting the
domain while Pages was still deploying from a branch. With **Source: GitHub
Actions** nothing reads it — the one the build writes into `dist/` is what
counts — so it can be deleted whenever, and editing it will not change the
address.

For **Google Search Console**, a *Domain* property verified by a `TXT` record
needs nothing in the repository. The *URL prefix* + *HTML tag* route works too:
its token goes in `google.siteVerification` in `content/site.json` and the build
puts the meta tag in the head — but that is a different token, and a DNS value
cannot stand in for it. Submit `<url>sitemap.xml` under Sitemaps either way.

There is no Google Analytics here, and nothing at all is loaded from another
host; see the hard rules in `AGENTS.md`.
