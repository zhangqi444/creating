/* The one thing this site cannot do in a browser: hold a secret.
 *
 * A Resend API key can send mail as this domain. Put it in the page and anyone
 * reading the source can send mail as us, so the subscribe form posts here
 * instead — a Cloudflare Worker that holds the key, takes one address, and hands
 * it to Resend's audience. Nothing is stored here; the list lives with Resend,
 * which is also what sends to it.
 *
 * Deliberately small. It accepts one shape of request, returns one shape of
 * answer, and the only thing it knows how to do is add a contact. A bug in it
 * cannot leak the blog, because it cannot read the blog.
 *
 * Secrets, set with `wrangler secret put` and never committed:
 *   RESEND_API_KEY       the key, which can send mail as the domain
 *   RESEND_AUDIENCE_ID   the audience the addresses go into
 * Plain vars, in wrangler.toml:
 *   SITE_ORIGIN          the one origin allowed to call this
 */

const RESEND = "https://api.resend.com"

/* NOT DEPLOYABLE AS IT STANDS. This posts to /audiences/{id}/contacts, which is
 * the older Resend shape. The account this site belongs to has no audiences at
 * all: its model is contacts and segments, and adding one takes an email plus a
 * list of segment ids. Both routes still answer, so the mistake would show up
 * as a failed signup rather than a 404, which is the worse way to find out.
 *
 * Before deploying, change the call below to the contacts endpoint and pass the
 * segment id, and rename RESEND_AUDIENCE_ID to match. The exact request body is
 * the one thing not confirmed here — resend.com/docs is unreachable from the
 * sandbox this was written in — so confirm it against the dashboard or a single
 * manual call first. */

/* Deliberately loose. The only authority on whether an address exists is the
   confirmation mail Resend sends to it; a cleverer regex here would reject real
   addresses and still let nonsense through. */
const EMAIL = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": origin,
      "cache-control": "no-store",
      vary: "Origin",
    },
  })

export default {
  async fetch(request, env) {
    const allowed = env.SITE_ORIGIN || ""
    const origin = request.headers.get("Origin") || ""
    const cors = origin && origin === allowed ? origin : allowed

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": cors,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "Content-Type",
          "access-control-max-age": "86400",
          vary: "Origin",
        },
      })
    }
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, cors)
    // One origin may post here. This is not security — anything can forge an
    // Origin — but it stops this endpoint being borrowed by another page.
    if (allowed && origin && origin !== allowed) return json({ error: "Not allowed from there." }, 403, cors)

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: "That was not readable." }, 400, cors)
    }

    // The honeypot. A person never sees this field, so anything that filled it
    // is not a person — answered with a cheerful 200 so whatever it is does not
    // learn to stop, and nothing is sent on.
    if (typeof body.company === "string" && body.company.trim()) return json({ ok: true }, 200, cors)

    const email = String(body.email || "").trim().toLowerCase()
    if (!email || email.length > 254 || !EMAIL.test(email)) {
      return json({ error: "That does not look like an email address." }, 400, cors)
    }

    if (!env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID) {
      return json({ error: "The newsletter is not set up yet." }, 503, cors)
    }

    let res
    try {
      res = await fetch(`${RESEND}/audiences/${encodeURIComponent(env.RESEND_AUDIENCE_ID)}/contacts`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, unsubscribed: false }),
      })
    } catch {
      return json({ error: "Could not reach the mail service. Please try again." }, 502, cors)
    }

    if (!res.ok) {
      // Resend's own words are for us, not for the visitor: they can name the
      // audience and the account. Someone already on the list is a success as
      // far as they are concerned, and must not be told they are already on it
      // — that would turn this endpoint into a way to test whether an address
      // is subscribed.
      let detail = ""
      try {
        const j = await res.json()
        detail = (j && (j.message || j.name)) || ""
      } catch { /* no detail to be had */ }
      if (res.status === 409 || /already/i.test(detail)) return json({ ok: true }, 200, cors)
      console.log("resend error", res.status, detail)
      return json({ error: "That did not go through. Please try again." }, 502, cors)
    }

    return json({ ok: true }, 200, cors)
  },
}
