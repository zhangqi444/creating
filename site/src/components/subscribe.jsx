/* Subscribe by email.
 *
 * The form posts one address to an endpoint that is not this site: a tiny
 * function somewhere else holds the Resend key and does the talking, because a
 * key that can send mail as this domain cannot ship in a page anyone can read
 * the source of. `newsletter.endpoint` in content/site.json names it, and an
 * empty endpoint means the whole block renders nothing — a fork of this
 * repository offers no newsletter rather than posting strangers' addresses at
 * somebody else's function.
 *
 * It is not shown on `#/b/<id>`. That address is somebody else's published blog
 * being read through this deployment, and offering to sign a reader up to *our*
 * newsletter from under their name would be a small lie. */
import { useState } from "react"

import { C } from "@/modules/gallery/content"
import { blogId } from "@/lib/router"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const field =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"

export function Subscribe({ className }) {
  const endpoint = (C.site.newsletter && C.site.newsletter.endpoint) || ""
  const [email, setEmail] = useState("")
  const [trap, setTrap] = useState("")     // honeypot: a person never fills this
  const [state, setState] = useState("idle")   // idle | sending | done | error
  const [error, setError] = useState("")

  if (!endpoint || blogId()) return null

  async function submit(e) {
    e.preventDefault()
    if (state === "sending") return
    setState("sending")
    setError("")
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), company: trap }),
      })
      if (!res.ok) {
        let msg = "That did not go through. Please try again."
        try {
          const j = await res.json()
          if (j && j.error) msg = j.error
        } catch { /* keep the plain message */ }
        throw new Error(msg)
      }
      setState("done")
    } catch (err) {
      setError(err.message || "That did not go through. Please try again.")
      setState("error")
    }
  }

  return (
    <section className={cn("rounded-xl border bg-card p-6 sm:p-8", className)} data-testid="subscribe"
      aria-labelledby="subscribe-heading">
      <h2 id="subscribe-heading" className="text-lg font-semibold tracking-tight">New pictures by email</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A note when there is something new here. Nothing else, and you can stop whenever you like.
      </p>

      {state === "done" ? (
        <p className="mt-4 text-sm font-medium text-primary" data-testid="subscribe-done" role="status">
          Thank you. Check your email to confirm it is you.
        </p>
      ) : (
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
          <label className="sr-only" htmlFor="subscribe-email">Your email address</label>
          <input id="subscribe-email" data-testid="subscribe-email" className={cn(field, "sm:flex-1")}
            type="email" name="email" required autoComplete="email" placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)} disabled={state === "sending"} />
          {/* Left in the page for anything filling every field it finds, and
              hidden from people and screen readers alike. The endpoint drops a
              submission that carries it. */}
          <input className="hidden" tabIndex={-1} aria-hidden="true" autoComplete="off"
            type="text" name="company" data-testid="subscribe-trap"
            value={trap} onChange={(e) => setTrap(e.target.value)} />
          <Button type="submit" data-testid="subscribe-submit" disabled={state === "sending"}>
            {state === "sending" ? "Signing up…" : "Sign up"}
          </Button>
        </form>
      )}

      {state === "error" && (
        <p className="mt-3 text-sm text-destructive" data-testid="subscribe-error" role="alert">{error}</p>
      )}
    </section>
  )
}
