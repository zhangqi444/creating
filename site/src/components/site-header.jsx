/* Top bar, laid out as sheilazhang.org lays out its own: the nav on the left,
   the site's name centred in bold, the actions on the right. On phones the name
   moves to the left and the nav folds into a disclosure under the bar, which is
   also what the hub does. */
import { useEffect, useState } from "react"
import { MenuIcon, MoonIcon, PenLineIcon, SunIcon, XIcon } from "lucide-react"

import { C } from "@/modules/gallery/content"
import { DRIVE_ENABLED } from "@/lib/session"
import { blogId } from "@/lib/router"
import { go, href } from "@/lib/router"
import { isDark, onTheme, toggleTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function useDark() {
  const [dark, set] = useState(isDark)
  useEffect(() => onTheme(set), [])
  return dark
}

/* The form is on the front page and under every post. Scroll to it where it is;
   from anywhere else go to the front page first and scroll once it has drawn. */
function toSubscribe() {
  const reach = () => {
    const el = document.querySelector("[data-testid=subscribe]")
    if (!el) return false
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.querySelector("input[type=email]")?.focus({ preventScroll: true })
    return true
  }
  if (reach()) return
  go("/")
  let tries = 0
  const wait = setInterval(() => { if (reach() || ++tries > 40) clearInterval(wait) }, 50)
}

export function SiteHeader({ route }) {
  const [open, setOpen] = useState(false)
  const dark = useDark()
  const current = "/" + route.join("/")
  useEffect(() => { setOpen(false) }, [current])
  const newsletter = Boolean(C.site.newsletter && C.site.newsletter.endpoint) && !blogId()

  const links = C.site.nav.map((n) => {
    const to = n.to
    const active = to === "/" ? route.length === 0 : current === to || current.startsWith(to + "/")
    return (
      <a key={n.to} href={href(to)} data-testid="nav-link" aria-current={active ? "page" : undefined}
        className={cn("rounded-full px-3 py-1.5 text-[15px] font-semibold transition-colors hover:text-link",
          active ? "text-foreground" : "text-foreground")}>
        {n.label}
      </a>
    )
  })

  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="grid h-16 grid-cols-[1fr_auto] items-center gap-2 px-4 sm:h-24 sm:grid-cols-[1fr_auto_1fr] sm:px-9">
        <nav className="-ml-3 hidden items-center gap-1 sm:flex" data-testid="nav">{links}</nav>
        <a href={href("/")} data-testid="brand" className="text-xl font-bold tracking-tight sm:justify-self-center sm:text-[26px]">
          {C.site.title}
        </a>
        <div className="flex items-center justify-end gap-1">
          {DRIVE_ENABLED && (
            <Button variant="ghost" size="icon" asChild
              aria-label="Open the studio" data-testid="studio-link-header">
              <a href={href("/studio")}><PenLineIcon /></a>
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} data-testid="theme-toggle" onClick={toggleTheme}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </Button>
          {/* The hub's pink pill. It takes a reader to the form rather than being
              a second form, and it is not offered where there is no newsletter
              or on somebody else's published blog — the same rules the form
              itself follows. Hidden on phones, as the hub hides its own. */}
          {newsletter && (
            <Button className="ml-2 hidden h-10 px-5 text-[15px] font-semibold sm:inline-flex" data-testid="subscribe-header"
              onClick={toSubscribe}>
              Subscribe
            </Button>
          )}
          <Button variant="ghost" size="icon" className="sm:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} data-testid="menu-toggle" onClick={() => setOpen((o) => !o)}>
            {open ? <XIcon /> : <MenuIcon />}
          </Button>
        </div>
      </div>
      {open && (
        <nav className="border-t sm:hidden" data-testid="nav-mobile">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-2">{links}</div>
        </nav>
      )}
    </header>
  )
}
