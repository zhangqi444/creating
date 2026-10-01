/* The one thing this site cannot do in a browser: hold a secret.
 *
 * A Resend API key can send mail as this domain. Put it in the page and anyone
 * reading the source can send mail as us, so the subscribe form posts here
 * instead — a Vercel function that holds the key, takes one address, and adds it
 * to a Resend segment. Nothing is stored here; the list lives with Resend, which
 * is also what sends to it.
 *
 * It calls Resend through their SDK rather than by hand. That is deliberate: an
 * earlier version of this file guessed the request shape from memory and got it
 * wrong three times over — the endpoint (`/audiences/{id}/contacts`, which the
 * SDK now marks deprecated), and then both guesses at the field name. The SDK
 * owns the wire format, so it cannot drift from under us again.
 *
 * Environment:
 *   RESEND_API_KEY      secret, set in the Vercel dashboard, never committed
 *   RESEND_SEGMENT_ID   the segment new addresses join
 *   SITE_ORIGIN         the one origin allowed to post here
 */
import { Resend } from "resend"

/* Deliberately loose. The only authority on whether an address exists is the
   confirmation mail sent to it; a cleverer regex here would reject real
   addresses and still let nonsense through. */
const EMAIL = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/

export default async function handler(req, res) {
  const allowed = process.env.SITE_ORIGIN || ""
  const origin = req.headers.origin || ""

  res.setHeader("Access-Control-Allow-Origin", allowed)
  res.setHeader("Vary", "Origin")
  res.setHeader("Cache-Control", "no-store")

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")
    res.setHeader("Access-Control-Max-Age", "86400")
    return res.status(204).end()
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." })
  // One origin may post here. This is not security — anything can forge an
  // Origin — but it stops this endpoint being borrowed by another page.
  if (allowed && origin && origin !== allowed) return res.status(403).json({ error: "Not allowed from there." })

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body
  if (!body) return res.status(400).json({ error: "That was not readable." })

  // The honeypot. A person never sees this field, so anything that filled it is
  // not a person — answered with a cheerful 200 so whatever it is does not learn
  // to stop, and nothing is sent on.
  if (typeof body.company === "string" && body.company.trim()) return res.status(200).json({ ok: true })

  const email = String(body.email || "").trim().toLowerCase()
  if (!email || email.length > 254 || !EMAIL.test(email)) {
    return res.status(400).json({ error: "That does not look like an email address." })
  }

  const key = process.env.RESEND_API_KEY
  const segment = process.env.RESEND_SEGMENT_ID
  if (!key || !segment) return res.status(503).json({ error: "The newsletter is not set up yet." })

  const { error } = await new Resend(key).contacts.create({
    email,
    segments: [{ id: segment }],
    unsubscribed: false,
  })

  if (error) {
    /* Resend's own words are for us, not for the visitor: they can name the
       segment and the account. Someone already on the list is a success as far
       as they are concerned, and must not be told they are already on it — that
       would turn this endpoint into a way to test whether a given address is
       subscribed. */
    if (/already|exists|duplicate/i.test(error.message || "")) return res.status(200).json({ ok: true })
    console.error("resend contacts.create failed", error.name, error.message)
    return res.status(502).json({ error: "That did not go through. Please try again." })
  }

  return res.status(200).json({ ok: true })
}

function safeParse(s) {
  try { return JSON.parse(s) } catch { return null }
}
