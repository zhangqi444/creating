import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.dirname(new URL(import.meta.url).pathname)

/* The service worker, with its cache name stamped in.
 *
 * Everything the worker precaches keeps its name from one build to the next —
 * unlike the app's files, which are content-hashed — so nothing about a new
 * favicon tells a browser already holding the old one to let go. The cache is
 * dropped only when its name changes, so the name is a digest of what is in it.
 * Change the icon and the name moves on its own; change nothing and it stays,
 * so a visitor is not made to re-install a worker for no reason. */
const PRECACHED = ['manifest.webmanifest', 'favicon.svg']

function swSource() {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8')
  const files = PRECACHED.map((f) => fs.readFileSync(path.join(ROOT, 'public', f)))
  const stamp = crypto.createHash('sha256').update(Buffer.concat(files)).digest('hex').slice(0, 8)
  return src.replace('__BUILD__', stamp)
}

/* A short digest of the worker as it will be deployed, so its registered URL
   changes exactly when its behaviour does and not on every unrelated build. */
function swVersion() {
  return crypto.createHash('sha256').update(swSource()).digest('hex').slice(0, 8)
}
const SITE = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'content', 'site.json'), 'utf8'))

/* The Google client id and browser API key. Both are public values meant to
 * ship in a page: the client id identifies the OAuth app, and the API key only
 * reads files their owners have already shared. Neither is a secret, and the
 * key should be restricted to this site by HTTP referrer in the Cloud console.
 * With neither set the site simply has no studio and reads the built-in content,
 * so it still builds and runs for anyone cloning it.
 *
 * The environment wins over the file, so a deployment can carry its own values
 * as repository variables and this fork's google.json can stay empty — one
 * setting in GitHub rather than a commit, and a clone of this repo gets its own
 * Google project rather than inheriting somebody else's by accident. */
const GOOGLE = (() => {
  const file = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'google.json'), 'utf8')) }
    catch { return {} }
  })()
  return {
    client_id: process.env.OAUTH_CLIENT_ID || file.client_id || '',
    api_key: process.env.GOOGLE_API_KEY || file.api_key || '',
  }
})()

/** Adds the PWA manifest and the offline service worker to the page. */
function appTarget() {
  return {
    name: 'app-target',
    // publicDir copies the worker verbatim, so the stamped one is written over
    // it once the build has finished putting everything in place.
    closeBundle() {
      fs.writeFileSync(path.join(ROOT, 'dist', 'sw.js'), swSource())
    },
    transformIndexHtml() {
      // Nothing is written when there is no client id, so the page simply has
      // no sign-in — and a test can supply its own config before the app loads
      // rather than fighting a script that has already set these to empty.
      const google = []
      if (GOOGLE.client_id) {
        google.push({
          tag: 'script',
          children:
            'window.__ENABLE_DRIVE__=true;' +
            'window.__OAUTH_CLIENT_ID__=' + JSON.stringify(GOOGLE.client_id) + ';' +
            'window.__GOOGLE_API_KEY__=' + JSON.stringify(GOOGLE.api_key || '') + ';',
          injectTo: 'head',
        })
        google.push({ tag: 'script', attrs: { src: 'https://accounts.google.com/gsi/client', async: true, defer: true }, injectTo: 'head' })
      }
      return [
        ...google,
        { tag: 'link', attrs: { rel: 'manifest', href: 'manifest.webmanifest' }, injectTo: 'head' },
        {
          /* The worker is registered under a URL that changes when the worker
             does. Registering a fixed "sw.js" looks right and is not: the
             browser may answer its own update check from its HTTP cache for up
             to a day, so a visitor whose worker has gone wrong keeps the broken
             one — and a fix to the worker cannot reach the people who need it
             most, which is precisely what happened once. A URL the browser has
             never seen has nothing to answer from. */
          tag: 'script',
          children: 'if("serviceWorker" in navigator)addEventListener("load",function(){navigator.serviceWorker.register("sw.js?v=' + swVersion() + '")});',
          injectTo: 'body',
        },
      ]
    },
  }
}

/** The site's public address, from content/site.json: the canonical link and
 * the social tags in the head, the Google Search Console verification tag when a
 * token is set, and robots.txt, sitemap.xml and — for a custom domain — CNAME in
 * the build. The build itself stays relative, so the same output works at a
 * domain root and under /creating/ alike. */
function siteAddress() {
  const url = SITE.url ? new URL(SITE.url) : null
  const verification = (SITE.google && SITE.google.siteVerification) || ''
  return {
    name: 'site-address',
    transformIndexHtml() {
      const tags = [
        { tag: 'meta', attrs: { property: 'og:type', content: 'website' }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:title', content: SITE.title }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:description', content: SITE.description }, injectTo: 'head' },
      ]
      if (url) {
        tags.push({ tag: 'link', attrs: { rel: 'canonical', href: url.href }, injectTo: 'head' })
        tags.push({ tag: 'meta', attrs: { property: 'og:url', content: url.href }, injectTo: 'head' })
      }
      if (verification) tags.push({ tag: 'meta', attrs: { name: 'google-site-verification', content: verification }, injectTo: 'head' })
      return tags
    },
    generateBundle() {
      if (!url) return
      const emit = (fileName, source) => this.emitFile({ type: 'asset', fileName, source })
      // CNAME is how GitHub Pages is told about a *custom* domain. The default
      // github.io address is not one: writing it there makes Pages try to serve
      // the user site from this project's build, which takes both down.
      if (!url.hostname.endsWith('.github.io')) emit('CNAME', url.hostname + '\n')
      emit('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${url.href}sitemap.xml\n`)
      emit(
        'sitemap.xml',
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          `  <url><loc>${url.href}</loc></url>\n</urlset>\n`,
      )
    },
  }
}

export default defineConfig({
  root: ROOT,
  base: './',
  resolve: { alias: { '@': path.join(ROOT, 'src') } },
  plugins: [react(), tailwindcss(), appTarget(), siteAddress()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, reportCompressedSize: true },
})
