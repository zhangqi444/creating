/* The multi-tenant half: an author's blog in their own Google Drive, and a
 * stranger reading what they published.
 *
 * Google is stubbed, as in zhangqi444/the-little-me and zhangqi444/volunteer
 * before it: the sandbox cannot reach accounts.google.com and an OAuth popup
 * cannot be automated anyway. The fake Drive is deliberately strict about the two
 * things that matter here — a file is private until a permission is created on
 * it, and a read without a token only succeeds on a file that has been shared —
 * so the privacy checks cannot pass by accident.
 *
 * Run:  npm run build && node test_drive.cjs */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIST = path.join(__dirname, 'dist');
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function serve(port) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(DIST, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(port, () => r({ srv, base: `http://localhost:${port}/` })));
}
const exe = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;

let failures = 0;
function check(name, ok, extra) { console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) failures++; }

/* The build embeds these; the stub only has to agree with them. */
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const API_KEY = 'test-api-key';

/* The committed google.json is empty, so a clone of this repo builds with no
 * studio at all. The config is injected here instead, before any page script
 * runs, which is exactly when session.js reads it. */
const FAKE_GIS = `
  window.__ENABLE_DRIVE__ = true;
  window.__OAUTH_CLIENT_ID__ = ${JSON.stringify(CLIENT_ID)};
  window.__GOOGLE_API_KEY__ = ${JSON.stringify(API_KEY)};
  window.__gisCalls = JSON.parse(sessionStorage.getItem('gisCalls') || '[]');
  window.google = { accounts: { oauth2: {
    initTokenClient: (cfg) => ({ requestAccessToken: (o) => {
      window.__gisCalls.push(o.prompt); sessionStorage.setItem('gisCalls', JSON.stringify(window.__gisCalls));
      setTimeout(() => cfg.callback({ access_token: 'tok-' + Date.now(), expires_in: 3599,
        scope: 'https://www.googleapis.com/auth/drive.file openid email profile' }), 20);
    } }),
    hasGrantedAllScopes: (resp, scope) => resp.scope.includes(scope),
    revoke: (t, cb) => { window.__revoked = t; cb && cb(); }
  } } };`;

/* One in-memory Drive shared by every page in a run, so what the author
 * publishes is what the visitor's browser later asks for. */
function makeDrive() {
  return { files: new Map(), seq: 0, calls: [] };   // id -> { name, body, appProperties, shared }
}

async function fakeGoogle(ctx, drive) {
  await ctx.route(/accounts\.google\.com|fonts\.g|lh3\.googleusercontent\.com/, (r) => {
    if (/lh3\./.test(r.request().url())) {
      return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#8fb4f0"/></svg>' });
    }
    return r.abort();
  });
  await ctx.route(/googleapis\.com/, async (r) => {
    const req = r.request(), url = req.url(), m = req.method();
    drive.calls.push(m + ' ' + url.replace(/\?.*/, ''));
    const json = (o, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    const authed = (req.headers()['authorization'] || '').startsWith('Bearer tok-');
    const key = new URL(url).searchParams.get('key');

    // an anonymous media read: only allowed with the API key, and only on a shared file
    const media = /\/drive\/v3\/files\/([^/?]+)\?.*alt=media/.exec(url);
    if (media && m === 'GET' && !authed) {
      const f = drive.files.get(media[1]);
      if (key !== API_KEY) return json({ error: { message: 'API key not valid' } }, 400);
      if (!f) return json({ error: { message: 'File not found' } }, 404);
      if (!f.shared) return json({ error: { message: 'File not found' } }, 404);
      return r.fulfill({ status: 200, contentType: 'application/json', body: f.body });
    }
    if (!authed) return json({ error: { message: 'unauthorized' } }, 401);

    if (/userinfo/.test(url)) return json({ name: 'Test Author', email: 'author@example.com', picture: '' });

    // a query: the app folder, a module's subfolder, or a module's data file
    if (/\/drive\/v3\/files\?/.test(url) && !/\/upload\//.test(url) && m === 'GET') {
      const q = new URL(url).searchParams.get('q') || '';
      const want = (key) => (q.match(new RegExp(`key='${key}' and value='([^']+)'`)) || [])[1];
      const kind = want('kind'), module = want('module'), folderQ = q.includes('mimeType=');
      const files = [...drive.files.entries()]
        .filter(([, f]) => {
          const a = f.appProperties || {};
          if (a.app !== 'creating') return false;
          if (folderQ !== (a.kind === 'root' || a.kind === 'module')) return false;
          if (kind && a.kind !== kind) return false;
          if (module && a.module !== module) return false;
          if (!kind && !folderQ && a.kind) return false;   // data files carry no kind
          return true;
        })
        .map(([id, f]) => ({ id, name: f.name, modifiedTime: f.modifiedTime, webViewLink: 'https://drive.google.com/file/d/' + id + '/view', shared: f.shared }));
      return json({ files });
    }
    // creating a folder: plain JSON on the files endpoint, not the upload one
    if (/\/drive\/v3\/files\?/.test(url) && !/\/upload\//.test(url) && m === 'POST') {
      const meta = JSON.parse(req.postData() || '{}');
      const id = 'folder' + (++drive.seq) + '0000000';
      drive.files.set(id, { name: meta.name, appProperties: meta.appProperties || {}, parents: meta.parents || [], body: '', shared: false, modifiedTime: new Date().toISOString() });
      return json({ id });
    }
    if (media && m === 'GET') {
      const f = drive.files.get(media[1]);
      return f ? r.fulfill({ status: 200, contentType: 'application/json', body: f.body }) : json({ error: { message: 'not found' } }, 404);
    }
    if (/\/upload\/drive\/v3\/files\?/.test(url) && m === 'POST') {
      const raw = req.postData() || '';
      const metaMatch = /\r\n\r\n(\{[\s\S]*?\})\r\n--/.exec(raw);
      const meta = metaMatch ? JSON.parse(metaMatch[1]) : {};
      const parts = raw.split(/--cr_[a-z0-9]+/);
      const body = parts[2] ? parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '') : '';
      const id = 'file' + (++drive.seq) + '0000000000';
      drive.files.set(id, { name: meta.name, appProperties: meta.appProperties || {}, body, shared: false, modifiedTime: new Date().toISOString() });
      return json({ id, webViewLink: 'https://drive.google.com/file/d/' + id + '/view', modifiedTime: new Date().toISOString() });
    }
    const patch = /\/upload\/drive\/v3\/files\/([^/?]+)/.exec(url);
    if (patch && m === 'PATCH') {
      // an expired token, once, on demand: the app is expected to get another
      // and try again rather than lose the write
      if (drive.expireNextWrite) { drive.expireNextWrite = false; return json({ error: { message: 'Invalid Credentials' } }, 401); }
      const f = drive.files.get(patch[1]);
      if (f) { f.body = req.postData(); f.modifiedTime = new Date().toISOString(); }
      return json({ id: patch[1], webViewLink: 'https://drive.google.com/file/d/' + patch[1] + '/view', modifiedTime: new Date().toISOString() });
    }
    const perm = /\/drive\/v3\/files\/([^/?]+)\/permissions/.exec(url);
    if (perm && m === 'POST') {
      const f = drive.files.get(perm[1]);
      const p = JSON.parse(req.postData() || '{}');
      if (f && p.role === 'reader' && p.type === 'anyone') f.shared = true;
      return json({ id: 'perm1' });
    }
    if (perm && m === 'GET') {
      const f = drive.files.get(perm[1]);
      const owner = { id: 'owner-1', type: 'user', role: 'owner' };
      return json({ permissions: f && f.shared ? [owner, { id: 'anyone', type: 'anyone', role: 'reader' }] : [owner] });
    }
    if (perm && m === 'DELETE') {
      const f = drive.files.get(perm[1]);
      // only the anyone permission can be withdrawn; the owner's stays
      if (!/\/permissions\/anyone$/.test(url.replace(/\?.*/, ''))) return json({ error: { message: 'not found' } }, 404);
      if (f) f.shared = false;
      return r.fulfill({ status: 204, body: '' });
    }
    const del = /\/drive\/v3\/files\/([^/?]+)$/.exec(url.replace(/\?.*/, ''));
    if (del && m === 'DELETE') { drive.files.delete(del[1]); return r.fulfill({ status: 204, body: '' }); }
    return json({ error: { message: 'unhandled ' + m + ' ' + url } }, 404);
  });
  await ctx.addInitScript(FAKE_GIS);
}

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const saved = (pg) => pg.waitForFunction(() => {
  const el = document.querySelector('[data-testid=session-status]');
  return el && el.textContent.includes('Saved');
});

(async () => {
  const { srv, base } = await serve(8170);
  const b = await chromium.launch({ executablePath: exe });
  const drive = makeDrive();

  console.log('\n== the author ==');
  const authorCtx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await fakeGoogle(authorCtx, drive);
  const pg = await authorCtx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  // the 401 is deliberate: one write below is refused so the retry can be seen.
  // A 401 the app failed to recover from would fail the checks around it anyway.
  pg.on('console', (m) => { if (m.type() === 'error' && !/favicon|sw\.js|ERR_FAILED|ERR_TUNNEL|status of 401/.test(m.text())) errs.push('CONSOLE ' + m.text()); });

  // the blog is readable with no account at all; only the studio has a gate
  await pg.goto(base, { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=hero]');
  check('the blog is the front door, with no sign-in in front of it', true);
  check('no Google prompt on load', (await pg.evaluate(() => window.__gisCalls.length)) === 0);
  check('the reader offers a door to the studio once sign-in is configured',
    (await pg.$('[data-testid=studio-link-header]')) !== null);

  await pg.click('[data-testid=studio-link-header]');
  await pg.waitForSelector('[data-testid=studio-signin]');
  check('the studio asks for sign-in before anything else', true);
  check('still no Google prompt until the button is pressed',
    (await pg.evaluate(() => window.__gisCalls.length)) === 0);

  await pg.click('[data-testid=signin-button]:not([disabled])');
  await pg.waitForSelector('[data-testid=studio]');
  check('signed in, and the studio opens', true);
  check('a blog starts private', /are <?strong>?private|are private/i.test((await pg.textContent('[data-testid=studio-publish]')).replace(/\s+/g, ' ')));
  check('publishing is refused while there is nothing to publish',
    await pg.isDisabled('[data-testid=studio-publish-button]'));

  // write a post and give it a picture
  await pg.click('[data-testid=studio-add]');
  await pg.waitForSelector('[data-testid=studio-post]');
  // typed rather than filled: the field is redrawn from the store on every
  // keystroke, so a store that trims as it goes would swallow the spaces
  await pg.locator('[data-testid=studio-title]').pressSequentially('My blue cat');
  check('a title can be typed with spaces in it',
    (await pg.inputValue('[data-testid=studio-title]')) === 'My blue cat',
    await pg.inputValue('[data-testid=studio-title]'));
  await pg.setInputFiles('[data-testid=studio-file]', { name: 'cat.png', mimeType: 'image/png', buffer: PNG });
  await pg.waitForFunction(() => !document.querySelector('[data-testid=studio]').textContent.includes('Uploading'));
  check('the picture was uploaded to Drive as its own file',
    [...drive.files.values()].some((f) => f.appProperties && f.appProperties.kind === 'image'));
  const pictures = () => [...drive.files.values()].filter((f) => f.appProperties && f.appProperties.kind === 'image');
  check('the picture is NOT shared while the blog is private',
    pictures().every((f) => !f.shared));

  // a picture with no description says so, and saying so opens the field
  check('a picture with no description is flagged', Boolean(await pg.$('[data-testid=studio-needs-alt]')));
  await pg.click('[data-testid=studio-needs-alt]');
  await pg.waitForSelector('[data-testid=studio-details]');
  await pg.fill('[data-testid=studio-alt]', 'A blue cat asleep on a windowsill');
  await pg.fill('[data-testid=studio-caption]', 'She sleeps there every afternoon');
  await pg.fill('[data-testid=studio-tags]', 'cats, paint');
  await pg.click('[data-testid=studio-title]');   // blur, which is when topics are taken
  check('the flag goes once there is a description', (await pg.$('[data-testid=studio-needs-alt]')) === null);

  // the data file is saved but still private
  await saved(pg);
  const dataFile = () => [...drive.files.entries()].find(([, f]) => f.appProperties && f.appProperties.module === 'gallery' && !f.appProperties.kind);
  check('the blog file exists in Drive', Boolean(dataFile()));
  check('the blog file is NOT shared until Publish is pressed', dataFile()[1].shared === false);
  const savedPost = () => JSON.parse(dataFile()[1].body).posts[0];
  check('the post is in the saved file', savedPost().title === 'My blue cat');
  check('with its description, caption and topics',
    savedPost().imageAlt === 'A blue cat asleep on a windowsill'
    && savedPost().caption === 'She sleeps there every afternoon'
    && savedPost().tags.join(',') === 'cats,paint',
    JSON.stringify({ alt: savedPost().imageAlt, caption: savedPost().caption, tags: savedPost().tags }));

  /* ---- the author's own reader is their preview, before anyone else can see it ---- */
  await pg.click('[data-testid=studio-view-blog]');
  await pg.waitForSelector('[data-testid=hero]');
  check('the signed-in author sees their own posts in the reader, not the committed ones',
    (await pg.textContent('[data-testid=post-card]')).includes('My blue cat'));
  await pg.click('[data-testid=studio-link-header]');
  await pg.waitForSelector('[data-testid=studio]');

  // a stranger cannot read it yet
  const strangerCtx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await fakeGoogle(strangerCtx, drive);
  const blogId = dataFile()[0];
  let sp = await strangerCtx.newPage();
  await sp.goto(base + '#/b/' + blogId, { waitUntil: 'networkidle' });
  await sp.waitForSelector('[data-testid=hero]');
  check('an unpublished blog is not readable by a stranger',
    !(await sp.textContent('body')).includes('My blue cat'));
  await sp.close();

  // publish, then a stranger can
  await pg.click('[data-testid=studio-publish-button]');
  await pg.waitForSelector('[data-testid=studio-link]');
  check('publishing shared the blog file', dataFile()[1].shared === true);
  check('and the pictures with it, so the post is not full of holes',
    pictures().length > 0 && pictures().every((f) => f.shared));
  // a picture added to a blog that is already published has to be shared as it
  // arrives, or the post it lands in shows a hole
  await pg.setInputFiles('[data-testid=studio-file]', { name: 'cat2.png', mimeType: 'image/png', buffer: PNG });
  await pg.waitForFunction(() => !document.querySelector('[data-testid=studio]').textContent.includes('Uploading'));
  check('a picture added afterwards is shared as it arrives',
    pictures().length === 1 && pictures().every((f) => f.shared), String(pictures().length));

  const link = await pg.inputValue('[data-testid=studio-link]');
  check('the link carries the blog id', link.includes('#/b/' + blogId), link);

  console.log('\n== a stranger ==');
  sp = await strangerCtx.newPage();
  const strangerErrs = [];
  sp.on('pageerror', (e) => strangerErrs.push('PAGEERR ' + e.message));
  await sp.goto(base + '#/b/' + blogId, { waitUntil: 'networkidle' });
  await sp.waitForSelector('[data-testid=post-card]');
  check('the published post is readable with no sign-in',
    (await sp.textContent('[data-testid=post-card]')).includes('My blue cat'));
  check('the stranger was never asked to sign in',
    (await sp.evaluate(() => (window.__gisCalls || []).length)) === 0);
  await sp.click('[data-testid=post-card] h2 a');
  await sp.waitForSelector('[data-testid=post]');
  check('the post page opens for the stranger', (await sp.textContent('[data-testid=post-title]')) === 'My blue cat');
  check('the picture carries the description the author wrote',
    (await sp.getAttribute('[data-testid=post-image]', 'alt')) === 'A blue cat asleep on a windowsill',
    await sp.getAttribute('[data-testid=post-image]', 'alt'));
  check('links keep the blog id', (await sp.evaluate(() => location.hash)).startsWith('#/b/' + blogId));
  check('the picture is a public Drive URL', /lh3\.googleusercontent\.com\/d\//.test(await sp.getAttribute('[data-testid=post-image]', 'src')));
  // the studio is this deployment's screen, never something a published link reaches
  await sp.goto(base + '#/b/' + blogId + '/studio', { waitUntil: 'networkidle' });
  await sp.waitForSelector('[data-testid=not-found]');
  check('a published blog has no studio behind it', (await sp.$('[data-testid=studio]')) === null);
  check('no page errors for the stranger', strangerErrs.length === 0, strangerErrs.join(' | '));

  console.log('\n== back to the author ==');
  // the session survives a reload without another Google prompt
  await pg.reload({ waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=studio]');
  check('reload keeps the session, no consent prompt',
    (await pg.evaluate(() => window.__gisCalls.filter((p) => p === 'consent').length)) === 1);
  // the title lives in an <input>, whose value textContent never reports
  check('the post survived the reload', (await pg.inputValue('[data-testid=studio-title]')) === 'My blue cat');

  /* ---- and can be taken back off the internet ---- */
  await pg.click('[data-testid=studio-unpublish]');
  await pg.waitForSelector('[data-testid=studio-publish-button]');
  check('unpublishing withdrew the blog file', dataFile()[1].shared === false);
  check('and every picture it pointed at', pictures().every((f) => !f.shared));
  sp = await strangerCtx.newPage();
  await sp.goto(base + '#/b/' + blogId, { waitUntil: 'networkidle' });
  await sp.waitForSelector('[data-testid=hero]');
  check('the stranger can no longer read it',
    !(await sp.textContent('body')).includes('My blue cat'));
  await sp.close();

  /* ---- a second device: the two copies merge, and a deletion sticks ---- */
  console.log('\n== a second device ==');
  const deviceCtx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await fakeGoogle(deviceCtx, drive);
  const dp = await deviceCtx.newPage();
  const deviceErrs = [];
  dp.on('pageerror', (e) => deviceErrs.push('PAGEERR ' + e.message));

  await dp.goto(base + '#/studio', { waitUntil: 'networkidle' });
  await dp.click('[data-testid=signin-button]:not([disabled])');
  await dp.waitForSelector('[data-testid=studio-post]');
  check('a second device signs in and finds the first one\'s work',
    (await dp.inputValue('[data-testid=studio-title]')) === 'My blue cat',
    await dp.inputValue('[data-testid=studio-title]'));

  // deleting a post takes its picture with it, wherever it is deleted from
  const imageIds = () => [...drive.files.entries()].filter(([, f]) => f.appProperties && f.appProperties.kind === 'image').map(([id]) => id);
  const before = imageIds();
  await dp.click('[data-testid=studio-delete]');
  await dp.waitForSelector('[data-testid=studio-post]', { state: 'detached' });
  await saved(dp);
  check('deleting there removed the post', (await dp.$$('[data-testid=studio-post]')).length === 0);
  check('its picture was deleted from Drive too', before.length === 1 && imageIds().length === 0,
    `${before.length} -> ${imageIds().length}`);

  // the first device still has the post in localStorage; it pulls when it next
  // loads, and a merge that only took the newer of two records would hand the
  // post straight back
  await pg.goto(base + '#/studio', { waitUntil: 'networkidle' });
  await pg.reload({ waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=studio]');
  await pg.waitForSelector('[data-testid=studio-post]', { state: 'detached' });
  check('and the first device does not put it back', true);

  // now the other direction, through an expired token
  drive.expireNextWrite = true;
  const callsBefore = await pg.evaluate(() => window.__gisCalls.length);
  await pg.click('[data-testid=studio-add]');
  await pg.waitForSelector('[data-testid=studio-post]');
  await pg.locator('[data-testid=studio-title]').pressSequentially('Three shapes');
  await saved(pg);
  check('a write refused for an expired token is retried, not lost',
    (await pg.evaluate(() => window.__gisCalls.length)) === callsBefore + 1,
    `${callsBefore} -> ${await pg.evaluate(() => window.__gisCalls.length)}`);
  check('and the post reached Drive', JSON.parse(dataFile()[1].body).posts.some((p) => p.title === 'Three shapes'));

  await dp.reload({ waitUntil: 'networkidle' });
  await dp.waitForSelector('[data-testid=studio-post]');
  check('the second device sees it after a reload',
    (await dp.inputValue('[data-testid=studio-title]')) === 'Three shapes', await dp.inputValue('[data-testid=studio-title]'));
  check('no page errors on the second device', deviceErrs.length === 0, deviceErrs.join(' | '));
  await deviceCtx.close();

  /* ---- how it all sits in the person's own Drive ---- */
  console.log('\n== the shape in Drive ==');
  const modulesWithData = [...new Set([...drive.files.values()]
    .filter((f) => (f.appProperties || {}).module && !(f.appProperties || {}).kind)
    .map((f) => f.appProperties.module))].sort();
  const moduleFolders = [...drive.files.values()].filter((f) => (f.appProperties || {}).kind === 'module');
  const folderModules = moduleFolders.map((f) => f.appProperties.module).sort();
  check('each module that saved data has one folder of its own',
    folderModules.join(',') === modulesWithData.join(',') && moduleFolders.length === new Set(folderModules).size,
    folderModules.join(','));
  check('and they all sit under one app folder',
    [...drive.files.values()].filter((f) => (f.appProperties || {}).kind === 'root').length === 1);

  // signing out clears the device but not the file in Drive
  await pg.click('[data-testid=studio-signout]');
  await pg.waitForSelector('[data-testid=studio-signin]');
  check('signing out returns to the gate', true);
  check('the blog file is still in Drive after signing out', Boolean(dataFile()));

  check('no page errors for the author', errs.length === 0, errs.join(' | '));

  await authorCtx.close(); await strangerCtx.close();
  await b.close(); srv.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall Drive checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
