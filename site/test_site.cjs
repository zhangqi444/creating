/* The reading site: serves dist/ under a GitHub Pages-style subpath (/creating/)
 * and walks the blog on a desktop and a phone: home, a post, a topic, About, the
 * gallery lightbox, the phone menu, the theme toggle, a 404, and the studio door
 * on a build with no Google client id.
 * Run:  npm run build && node test_site.cjs */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIST = path.join(__dirname, 'dist');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(DIST, 'content', 'bundle.json'), 'utf8'));
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

/* Served under a subpath on purpose: `base: './'` and hash routing are what let
   the same build work at a domain root and under /creating/ alike, and a broken
   absolute path only shows up when the site is not at the root. */
function serve(port) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (!p.startsWith('/creating')) { res.writeHead(404); return res.end(); }
    p = p.slice('/creating'.length) || '/'; if (p === '/') p = '/index.html';
    const f = path.join(DIST, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(port, () => r({ srv, base: `http://localhost:${port}/creating/` })));
}
const exe = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;

let failures = 0;
function check(name, ok, extra) { console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) failures++; }
/* `allow` is for a section that provokes a failure on purpose: the newsletter
   checks stub a 400 to see the refusal reach the reader, and the browser logs
   that as a console error. Everywhere else the filter stays strict, so a real
   error cannot hide behind a blanket exemption. */
const errorsOf = (pg, allow) => { const errs = []; pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/favicon|sw\.js|net::ERR_FAILED/.test(m.text()) && !(allow && allow.test(m.text()))) errs.push('CONSOLE ' + m.text()); }); return errs; };

/* Take a screenshot that actually shows the pictures.
 *
 * `fullPage: true` on its own does not. The pictures below the fold are lazy,
 * so they were never asked for, and the shot is mostly grey boxes — which made
 * the one artefact a person looks at to check their work the least trustworthy
 * thing this suite produced.
 *
 * Three things were in the way, and each needed its own answer:
 *
 *   - the pictures are never fetched        -> clear `loading="lazy"`
 *   - `complete` says they are there        -> wait on `naturalWidth` instead;
 *     when they are not                        a lazy picture that has not been
 *                                              asked for reports complete, so
 *                                              waiting on it returns at once
 *   - a picture outside the viewport has    -> make the viewport the whole page
 *     its decoded form thrown away, and        before shooting, and decode()
 *     repaints empty when the shot resizes     every picture while it is there
 *     the viewport around it
 *
 * Scrolling instead of resizing was the first attempt. It half worked, hid a
 * 20-second timeout behind every shot, and cost two and a half minutes a run.
 */
const shoot = async (pg, file) => {
  const vp = pg.viewportSize();
  await pg.evaluate(() => { for (const img of document.images) img.loading = 'eager'; });
  // 16000px is about as tall as Chromium will render in one go; the gallery is
  // taller than that, and its tail is the part that may still come out grey.
  const tall = Math.min(await pg.evaluate(() => document.body.scrollHeight), 16000);
  await pg.setViewportSize({ width: vp.width, height: tall });
  const done = await pg.waitForFunction(() => [...document.images].every((i) => i.naturalWidth > 0), null, { timeout: 20000 })
    .then(() => true, () => false);
  await pg.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  // A throwaway shot first. It forces a full paint of the resized page, which
  // is what makes Chromium decode the last stragglers; the second shot is the
  // one that has them all.
  await pg.screenshot({ fullPage: true });
  await pg.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  await pg.screenshot({ path: file, fullPage: true });
  await pg.setViewportSize(vp);
  if (!done) console.log('  note  ' + file + ': a picture never loaded, so the shot has a gap in it');
};

(async () => {
  const { srv, base } = await serve(8160);
  const origin = new URL(base).origin;
  const b = await chromium.launch({ executablePath: exe });
  const posts = BUNDLE.posts, lead = posts[0];
  const tagged = posts.find((p) => p.tags.length > 0);

  // the address: what the build writes for GitHub Pages and for Google
  console.log('\n== address ==');
  const site = BUNDLE.site, url = new URL(site.url);
  const out = (f) => fs.readFileSync(path.join(DIST, f), 'utf8');
  const has = (f) => fs.existsSync(path.join(DIST, f));
  // A CNAME is how Pages is told about a *custom* domain. The default github.io
  // address is not one, and writing it into CNAME takes the user site down with
  // this one, so the build must leave it out until the address is a real domain.
  check(url.hostname.endsWith('.github.io')
    ? 'no CNAME written for the default github.io address'
    : 'CNAME names the custom domain',
    url.hostname.endsWith('.github.io') ? !has('CNAME') : out('CNAME').trim() === url.hostname);
  check('robots.txt points at the sitemap', out('robots.txt').includes('Sitemap: ' + site.url + 'sitemap.xml'));
  check('sitemap.xml lists the site', out('sitemap.xml').includes('<loc>' + site.url + '</loc>'));
  const head = out('index.html');
  check('canonical link is the site url', head.includes(`<link rel="canonical" href="${site.url}">`));
  check('og:url is the site url', head.includes(`<meta property="og:url" content="${site.url}">`));
  const token = site.google && site.google.siteVerification;
  check('google-site-verification tag ' + (token ? 'carries the token' : 'is left out until a token is set'),
    token ? head.includes(`<meta name="google-site-verification" content="${token}">`) : !head.includes('google-site-verification'));

  /* ---- what the front page weighs ---- */
  console.log('\n== pictures ==');
  {
    /* These posts are photographs off a phone: 2000px wide, half a megabyte
       each. That is right on the post page and wrong on a card drawn at 400px,
       and the front page showing two dozen of them was 9 MB to draw. So
       make_thumbs.py writes smaller copies and the bundle records them. This is
       the check that they are actually being used: it reads the built files, so
       it fails whether the copies went missing or a screen stopped asking for
       them. */
    const weigh = (rel) => { try { return fs.statSync(path.join(DIST, rel)).size } catch { return 0 } };
    const front = BUNDLE.posts.slice(0, 25).filter((p) => p.image && !/^https?:/.test(p.image));
    const asServed = front.reduce((n, p) => n + (weigh(p.thumb) || weigh(p.image)), 0);
    const originals = front.reduce((n, p) => n + weigh(p.image), 0);
    const BUDGET = 4 * 1024 * 1024;
    check(`the front page's ${front.length} pictures weigh under 4 MB`, asServed > 0 && asServed < BUDGET,
      `${(asServed / 1048576).toFixed(2)} MB, from ${(originals / 1048576).toFixed(1)} MB of originals`);
    const missing = front.filter((p) => !p.thumb);
    check('every committed picture has a small copy', missing.length === 0,
      missing.length ? missing.map((p) => p.slug).join(', ') + ' — run site/make_thumbs.py' : `${front.length} of them`);
    // The post page shows one picture, so it can afford a bigger one — but not
    // the 7 MB PNG some of these are. Anything heavy must have a `large`.
    const heavy = BUNDLE.posts.filter((p) => p.image && !/^https?:/.test(p.image) && weigh(p.image) >= 800 * 1024);
    check(`the ${heavy.length} heaviest pictures have a post-page copy`, heavy.every((p) => p.large),
      heavy.filter((p) => !p.large).map((p) => p.slug).join(', ') || 'all of them');
  }

  for (const [label, viewport] of [['desktop', { width: 1280, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
    console.log('\n== ' + label + ' ==');
    const phone = label === 'phone';
    const ctx = await b.newContext({ viewport, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
    const pg = await ctx.newPage(); const errs = errorsOf(pg);
    /* Nothing is loaded from anywhere else: no webfont, no icon CDN, no
       analytics. A build that grew one would be a change to the site's terms,
       not a detail, so it fails here rather than in a privacy page nobody reads. */
    const offsite = [];
    pg.on('request', (r) => { const u = r.url(); if (/^https?:/.test(u) && !u.startsWith(origin)) offsite.push(u); });

    // home
    await pg.goto(base, { waitUntil: 'networkidle' });
    await pg.waitForSelector('[data-testid=hero]');
    check('the blog answers the site root', true);
    check('hero shows the site title and tagline', (await pg.textContent('[data-testid=hero]')).includes(BUNDLE.site.title) && (await pg.textContent('[data-testid=hero]')).includes(BUNDLE.site.description));
    check('document title is the site title', (await pg.title()) === BUNDLE.site.title);
    const PAGE = 24;
    const firstPage = Math.min(posts.length, PAGE + 1);   // the lead card plus one page of the rest
    let cards = await pg.$$('[data-testid=post-card]');
    check(`front page opens on ${firstPage} of ${posts.length} posts`, cards.length === firstPage, String(cards.length));
    check('newest post leads', (await cards[0].textContent()).includes(lead.title));
    /* Not "a thumb path appears in the markup" but "every card asked for one".
       A card that slipped back to the original would still look right, which is
       exactly why this is checked rather than looked at. */
    const cardSrcs = await pg.$$eval('[data-testid=post-card] img', (els) => els.map((e) => e.getAttribute('src')));
    const fullSized = cardSrcs.filter((u) => u && !u.includes('images/thumbs/') && !/^https?:/.test(u));
    check('every card asks for the small copy', cardSrcs.length > 0 && fullSized.length === 0,
      fullSized.slice(0, 3).join(' | ') || `${cardSrcs.length} cards`);
    if (posts.length > firstPage) {
      await pg.click('[data-testid=show-more]');
      cards = await pg.$$('[data-testid=post-card]');
      check('show more reveals another page', cards.length === Math.min(posts.length, firstPage + PAGE), String(cards.length));
    } else {
      check('no show-more button needed', (await pg.$('[data-testid=show-more]')) === null);
    }
    check('topics listed', (await pg.$$('[data-testid=tag-cloud] a')).length > 0);
    if (phone) {
      check('phone hides the inline nav', !(await pg.isVisible('[data-testid=nav]')));
      await pg.click('[data-testid=menu-toggle]');
      await pg.waitForSelector('[data-testid=nav-mobile]');
      const away = BUNDLE.site.nav.find((n) => n.to !== '/');   // any route that is not home
      await pg.click(`[data-testid=nav-mobile] a:has-text("${away.label}")`);
      await pg.waitForFunction((to) => location.hash === '#' + to, away.to);
      await pg.waitForSelector('[data-testid=nav-mobile]', { state: 'detached' });
      check('phone menu navigates and closes', true);
      await pg.goto(base, { waitUntil: 'networkidle' });
      await pg.waitForSelector('[data-testid=hero]');
    } else {
      check('desktop shows the inline nav', await pg.isVisible('[data-testid=nav]'));
    }
    await shoot(pg, `shot-${label}-home.png`);

    // a post, reached from its card
    await pg.click(`[data-testid=post-card] h2 a:has-text("${lead.title}")`);
    await pg.waitForSelector('[data-testid=post]');
    const hash = await pg.evaluate(() => location.hash);
    check('card opens the post route', hash === '#/post/' + lead.slug, hash);
    check('post title rendered', (await pg.textContent('[data-testid=post-title]')) === lead.title);
    if (lead.large) {
      const src = await pg.getAttribute('[data-testid=post-image]', 'src');
      check('the post page takes the lighter copy of a heavy picture', src === lead.large, src);
    }
    check('the post shows its picture', (await pg.$('[data-testid=post-image]')) !== null);
    const hasProse = (await pg.$('[data-testid=prose]')) !== null;
    check(lead.body.trim() ? 'body rendered' : 'no empty reading column on a picture post', hasProse === Boolean(lead.body.trim()));
    const saysMinutes = /min read/.test(await pg.textContent('[data-testid=post]'));
    check(lead.minutes > 0 ? 'byline shows a reading time' : 'no reading time claimed for a wordless post', saysMinutes === lead.minutes > 0);
    check('document title names the post', (await pg.title()).startsWith(lead.title));
    check('read more shows other posts', (await pg.$$('[data-testid=read-more] [data-testid=post-card]')).length === Math.min(3, posts.length - 1));
    check('older link present on the newest post', /Older/.test(await pg.textContent('[data-testid=post-nav]')));
    await shoot(pg, `shot-${label}-post.png`);

    // a wordless picture post claims nothing it has not got
    const wordless = posts.find((p) => !p.body.trim());
    if (wordless) {
      await pg.goto(base + '#/post/' + wordless.slug, { waitUntil: 'networkidle' });
      await pg.waitForSelector('[data-testid=post]');
      check('a picture post has no empty reading column', (await pg.$('[data-testid=prose]')) === null);
      check('and claims no reading time', !/min read/.test(await pg.textContent('[data-testid=post]')));
    } else {
      check('no wordless post in this content, that path not exercised', true);
    }

    // topic page, reached from a post that carries a tag
    if (tagged) {
      const tag = tagged.tags[0];
      await pg.goto(base + '#/post/' + tagged.slug, { waitUntil: 'networkidle' });
      await pg.waitForSelector('[data-testid=post]');
      await pg.click(`[data-testid=post] header a:has-text("${tag}")`);
      await pg.waitForSelector('[data-testid=tag-page]');
      const n = posts.filter((p) => p.tags.includes(tag)).length;
      check(`topic "${tag}" lists ${n} post(s)`, (await pg.$$('[data-testid=tag-page] [data-testid=post-card]')).length === n);
    } else {
      check('no tags in this content, topic page not exercised', true);
    }

    // the reader's own chrome must lead back into the reader, never out of it
    await pg.goto(base + '#/post/' + lead.slug, { waitUntil: 'networkidle' });
    await pg.waitForSelector('[data-testid=post]');
    await pg.click('[data-testid=brand]');
    await pg.waitForSelector('[data-testid=hero]');
    check('the brand carries a reader back to the blog', true);

    // about, from the header
    await pg.goto(base + '#/about', { waitUntil: 'networkidle' });
    await pg.waitForSelector('[data-testid=page]');
    check('about page renders', (await pg.textContent('[data-testid=page-title]')) === BUNDLE.pages.find((p) => p.slug === 'about').title);
    check('about nav link is current', (await pg.$$('[data-testid=nav-link][aria-current=page]:has-text("About"), [data-testid=nav-mobile] [aria-current=page]')).length >= (phone ? 0 : 1));

    // gallery + lightbox
    await pg.goto(base + '#/gallery', { waitUntil: 'networkidle' });
    await pg.waitForSelector('[data-testid=gallery]');
    check('gallery is not in the top bar', !BUNDLE.site.nav.some((n) => n.to === '/gallery'));
    check('gallery is still reachable from the footer', BUNDLE.site.footer.links.some((l) => l.to === '/gallery'));
    check(`gallery shows ${BUNDLE.gallery.length} pictures`, (await pg.$$('[data-testid=gallery-item]')).length === BUNDLE.gallery.length);
    await pg.click('[data-testid=gallery-item]');
    await pg.waitForSelector('[data-testid=lightbox]');
    check('lightbox opens with the caption', (await pg.textContent('[data-testid=lightbox]')).includes(BUNDLE.gallery[0].caption || BUNDLE.gallery[0].alt));
    check('lightbox links back to the post', (await pg.$('[data-testid=lightbox-post]')) !== null);
    await pg.keyboard.press('Escape');
    await pg.waitForSelector('[data-testid=lightbox]', { state: 'detached' });
    check('lightbox closes on Escape', true);
    await shoot(pg, `shot-${label}-gallery.png`);

    /* The studio on a build with no Google client id. It must still be
       reachable and must say why it cannot work, rather than offering a button
       that goes nowhere — this is the state every fresh clone is in. */
    await pg.goto(base + '#/studio', { waitUntil: 'networkidle' });
    await pg.waitForSelector('[data-testid=studio-disabled]');
    check('the studio says sign-in is not set up on a build with no client id', true);
    check('and offers no sign-in button', (await pg.$('[data-testid=signin-button]')) === null);
    await pg.click('[data-testid=studio-brand]');
    await pg.waitForSelector('[data-testid=hero]');
    check('the studio brand leads back into the blog', true);
    check('the reader offers no studio door while sign-in is off',
      (await pg.$('[data-testid=studio-link-header]')) === null);

    // 404
    await pg.goto(base + '#/post/no-such-post', { waitUntil: 'networkidle' });
    await pg.waitForSelector('[data-testid=not-found]');
    check('unknown post shows the 404 view', true);

    // theme: toggle, persist across a reload, restore
    await pg.goto(base, { waitUntil: 'networkidle' });
    await pg.waitForSelector('[data-testid=hero]');
    await pg.click('[data-testid=theme-toggle]');
    check('dark theme applied', await pg.evaluate(() => document.documentElement.classList.contains('dark')));
    await pg.reload({ waitUntil: 'networkidle' });
    await pg.waitForSelector('[data-testid=hero]');
    check('dark theme survives a reload', await pg.evaluate(() => document.documentElement.classList.contains('dark')));
    await shoot(pg, `shot-${label}-dark.png`);
    await pg.click('[data-testid=theme-toggle]');
    check('light theme restored', !(await pg.evaluate(() => document.documentElement.classList.contains('dark'))));

    check('nothing is loaded from another host', offsite.length === 0, [...new Set(offsite)].join(' | '));
    check('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  /* ---- the newsletter: off unless a deployment turns it on ---- */
  console.log('\n== newsletter ==');
  {
    const bundle = path.join(DIST, 'content', 'bundle.json');
    const original = fs.readFileSync(bundle, 'utf8');
    // Same-origin on purpose: a cross-origin stub would be testing the
    // browser's CORS rather than this site's form.
    const ENDPOINT = base + 'api/subscribe';
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
    // the 400 below is deliberate: it is how the refusal path is exercised
    const pg = await ctx.newPage(); const errs = errorsOf(pg, /status of 400/);
    try {
      /* Off first. A deployment with no endpoint — which is what a fork of this
         repository is — must render nothing at all rather than a form that
         posts strangers' addresses at somebody else's function. Written out
         rather than read from the committed bundle, so this stays a real check
         after this deployment set an endpoint of its own. */
      const off = JSON.parse(original);
      off.site.newsletter = { endpoint: '' };
      fs.writeFileSync(bundle, JSON.stringify(off));
      await pg.goto(base, { waitUntil: 'networkidle' });
      await pg.waitForSelector('[data-testid=hero]');
      check('no subscribe form while no endpoint is configured',
        (await pg.$('[data-testid=subscribe]')) === null);

      // then on, the way a deployment does it: one value in site.json
      const on = JSON.parse(original);
      on.site.newsletter = { endpoint: ENDPOINT };
      fs.writeFileSync(bundle, JSON.stringify(on));

      let reply = { status: 200, body: '{"ok":true}' };
      const posted = [];
      await ctx.route(ENDPOINT, (r) => {
        posted.push(JSON.parse(r.request().postData() || '{}'));
        return r.fulfill({ status: reply.status, contentType: 'application/json', body: reply.body });
      });

      await pg.goto(base, { waitUntil: 'networkidle' });
      await pg.waitForSelector('[data-testid=subscribe]');
      check('the form appears once an endpoint is set', true);
      check('the honeypot is hidden from people', !(await pg.isVisible('[data-testid=subscribe-trap]')));

      await pg.locator('[data-testid=subscribe]').first().screenshot({ path: 'shot-newsletter.png' });
      await pg.fill('[data-testid=subscribe-email]', 'reader@example.com');
      await pg.click('[data-testid=subscribe-submit]');
      await pg.waitForSelector('[data-testid=subscribe-done]');
      check('signing up posts the address to the endpoint',
        posted.length === 1 && posted[0].email === 'reader@example.com', JSON.stringify(posted[0]));
      check('and sends the honeypot empty, so the endpoint can tell a person from a bot',
        posted[0].company === '');
      check('the form is replaced by a thank you', (await pg.$('[data-testid=subscribe-email]')) === null);

      // a refusal is shown, not swallowed
      reply = { status: 400, body: '{"error":"That does not look like an email address."}' };
      await pg.goto(base + '#/post/' + lead.slug, { waitUntil: 'networkidle' });
      await pg.waitForSelector('[data-testid=subscribe]');
      check('a post carries the form too', true);
      await pg.fill('[data-testid=subscribe-email]', 'reader@example.com');
      await pg.click('[data-testid=subscribe-submit]');
      await pg.waitForSelector('[data-testid=subscribe-error]');
      check('the endpoint\'s refusal is shown to the reader',
        (await pg.textContent('[data-testid=subscribe-error]')).includes('does not look like'));

      /* Someone else's published blog, read through this deployment. Offering
         to sign a reader up to *our* newsletter from under their name would be
         a small lie, so the block is not there. */
      await pg.goto(base + '#/b/aaaaaaaaaaaaaaaaaaaa', { waitUntil: 'networkidle' });
      await pg.waitForSelector('[data-testid=hero]');
      check('no subscribe form on somebody else\'s blog',
        (await pg.$('[data-testid=subscribe]')) === null);

      check('no page errors', errs.length === 0, errs.join(' | '));
    } finally { fs.writeFileSync(bundle, original); }
    await ctx.close();
  }

  /* ---- the offline shell must not pin a visitor to old content ---- */
  console.log('\n== offline shell ==');
  {
    const ctx = await b.newContext();
    const pg = await ctx.newPage();
    const bundle = path.join(DIST, 'content', 'bundle.json');
    const original = fs.readFileSync(bundle, 'utf8');
    try {
      await pg.goto(base, { waitUntil: 'networkidle' });
      await pg.evaluate(() => navigator.serviceWorker.ready);
      await pg.reload({ waitUntil: 'networkidle' });
      check('the service worker is in charge of the page',
        await pg.evaluate(() => Boolean(navigator.serviceWorker.controller)));

      /* The worker must be registered under a URL that moves with it. With a
         fixed "sw.js" the browser may answer its own update check from the HTTP
         cache for up to a day, so a visitor holding a worker that has gone
         wrong never gets the one that fixes it. */
      const sw = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/register\("(sw\.js[^"]*)"\)/);
      check('the worker is registered under a versioned url', Boolean(sw && /\?v=[0-9a-f]{8}$/.test(sw[1])), sw ? sw[1] : 'no registration found');
      const digest = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(DIST, 'sw.js'))).digest('hex').slice(0, 8);
      check('and that version is the worker\'s own digest, so it moves when the worker does',
        Boolean(sw) && sw[1].endsWith('?v=' + digest), sw ? sw[1] + ' vs ' + digest : '');

      const schema = () => pg.evaluate(() => fetch('content/bundle.json').then((r) => r.json()).then((j) => j.schema));
      check('content is served through it', (await schema()) === 1);

      // content/bundle.json keeps its name from one build to the next, so a
      // cache-first worker would serve this first copy for ever
      fs.writeFileSync(bundle, JSON.stringify({ ...JSON.parse(original), schema: 99 }));
      check('a new post reaches a visitor who has been here before', (await schema()) === 99);

      await ctx.setOffline(true);
      check('and the last one seen is still there with no network', (await schema()) === 99);
      await ctx.setOffline(false);

      /* A picture asked for in the moment before its file finished deploying
         answers 404. Pictures are served cache-first and the cache is only
         dropped when its name changes, so a 404 kept here would be served for
         ever: the card stays grey on that visitor's screen and no later deploy
         can reach them. This is what that looks like from the page. */
      const late = path.join(DIST, 'images', 'late-arrival.txt');
      try {
        const status = () => pg.evaluate(() => fetch('images/late-arrival.txt').then((r) => r.status));
        check('a file that has not deployed yet answers 404', (await status()) === 404);
        fs.writeFileSync(late, 'here now');
        check('and is picked up once it arrives, not served from a cached 404', (await status()) === 200);
      } finally { if (fs.existsSync(late)) fs.unlinkSync(late); }
    } finally { fs.writeFileSync(bundle, original); }
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
