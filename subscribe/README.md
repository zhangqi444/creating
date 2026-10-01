# The subscribe endpoint

One Vercel function, because the site cannot keep a secret. A Resend API key can
send mail as `sheilazhang.org`; the site is a static bundle, so anything it
carries is readable by anyone who views source. The key lives here instead.

Nothing is stored in this function. It takes one address, adds it to a Resend
segment, and forgets it. The list lives with Resend, which is also what sends to
it.

## Deploying

This folder is its own Vercel project — **set the project's Root Directory to
`subscribe`**. Pointing Vercel at the repository root instead would make it try
to build the whole blog and give you a second, competing copy of the site.

Environment variables, in the Vercel dashboard:

| Name | Value | Secret |
|---|---|---|
| `RESEND_API_KEY` | a Resend key with contacts access | **yes** |
| `RESEND_SEGMENT_ID` | the segment new addresses join | no |
| `SITE_ORIGIN` | `https://creating.sheilazhang.org` | no |

Deploy, then put the function's address — something like
`https://creating-subscribe.vercel.app/api/subscribe` — in `newsletter.endpoint`
in `content/site.json`, re-run `python3 site/make_bundle.py`, and commit. The
form on the site stays hidden until that value is set, so a fork of this
repository offers no newsletter rather than posting strangers' addresses at
somebody else's function.

## Why the SDK and not a plain fetch

An earlier version of this called Resend's REST API by hand and got the request
wrong three times: the endpoint (`/audiences/{id}/contacts`, which the SDK marks
deprecated in favour of segments), and then both guesses at the field name. The
real shape is `POST /contacts` with `segments: [{ id }]`. The SDK knows that, so
it does the talking.

Worth knowing for the next time: `api.resend.com` answers `401 Missing API Key`
for **every** path when unauthenticated, including paths that do not exist. A
401 is not evidence that an endpoint is real.

## Why not `creating.sheilazhang.org/api/subscribe`

The endpoint is cross-origin, on `*.vercel.app`, which is why the function
answers `OPTIONS` and sets `access-control-allow-origin` to `SITE_ORIGIN`.
Serving it under the site's own domain would mean putting that domain behind a
proxy, and its DNS records have to stay unproxied for GitHub Pages to hold its
certificate.

## What it does and does not do

- Accepts `POST` with `{"email": "...", "company": ""}` and nothing else.
- `company` is a honeypot. The form hides it; a person never fills it. Anything
  that does gets a cheerful `200` and is dropped, so it does not learn to stop.
- An address already on the list answers `200`, the same as a new one. Saying
  "you are already subscribed" would turn this into a way to test whether a
  given address reads this blog.
- Resend's own error text is logged, never returned: it can name the segment and
  the account.
