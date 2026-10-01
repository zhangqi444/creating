# The subscribe endpoint

> **Do not deploy this yet.** It is written against Resend's `audiences`
> endpoint, and this account has no audiences — its model is **contacts and
> segments**. The call in `src/index.js` has to be changed to the contacts
> endpoint, passing the segment id, before any of the below is worth doing. See
> the note at the top of that file.

One Cloudflare Worker, because the site cannot keep a secret. A Resend API key
can send mail as `sheilazhang.org`; the site is a static bundle, so anything it
carries is readable by anyone who views source. The key lives here instead.

Nothing is stored in this Worker. It takes one address, hands it to a Resend
audience, and forgets it. The list lives with Resend, which is also what sends
to it.

## Deploying

```bash
cd worker
npm install -g wrangler        # once
wrangler login                 # once
wrangler secret put RESEND_API_KEY      # paste the key; never commit it
wrangler secret put RESEND_AUDIENCE_ID  # the audience's id from the Resend dashboard
wrangler deploy
```

`wrangler deploy` prints the address, something like
`https://creating-subscribe.<account>.workers.dev`. Put that in
`newsletter.endpoint` in `content/site.json`, re-run `python3 site/make_bundle.py`,
and commit. The form on the site stays hidden until that value is set, so a fork
of this repository offers no newsletter rather than posting strangers' addresses
at somebody else's Worker.

## Why not `creating.sheilazhang.org/api/subscribe`

A Worker route only fires on a **proxied** (orange) Cloudflare DNS record. This
domain's records have to stay **grey**, or GitHub Pages cannot verify the domain
and issue its certificate. So the endpoint is the `workers.dev` address and the
call is cross-origin — which is why the Worker answers `OPTIONS` and sets
`access-control-allow-origin` to `SITE_ORIGIN`.

## What it does and does not do

- Accepts `POST` with `{"email": "...", "company": ""}` and nothing else.
- `company` is a honeypot. The form hides it; a person never fills it. Anything
  that does gets a cheerful `200` and is dropped, so it does not learn to stop.
- An address already on the list answers `200`, the same as a new one. Saying
  "you are already subscribed" would turn this into a way to test whether a
  given address reads this blog.
- Resend's own error text is logged, never returned: it can name the audience
  and the account.
- There is no rate limiting in the code. Add it as a Cloudflare rate-limiting
  rule on the Worker route if it is ever needed — a rule is a setting, where a
  counter in code would be state this Worker deliberately does not have.
