/* The studio's chrome: the app's name, whether the work is saved, and the one
 * sign-in.
 *
 * A published blog is *not* shown in this shell — a stranger reading someone's
 * pictures should never meet an account. That lives in the reader chrome
 * instead (site-header.jsx). The brand here points back into the blog, because
 * the blog is what the studio is for. */
import { useEffect, useState } from "react"
import { EyeIcon, LogOutIcon, MoonIcon, SunIcon } from "lucide-react"

import { C } from "@/modules/gallery/content"
import { DRIVE_ENABLED, useSession } from "@/lib/session"
import { go, href } from "@/lib/router"
import { isDark, onTheme, toggleTheme } from "@/lib/theme"
import { Button } from "@/components/ui/button"

/* The save state is written out in words rather than shown as a dot, because
   someone should be able to see that their work is kept without being asked to
   trust an icon. */
const STATUS = {
  local: "Not connected",
  connecting: "Connecting…",
  syncing: "Saving…",
  live: "Saved to Drive",
  expired: "Reconnect",
  error: "Drive error",
  unavailable: "",
}

function useDark() {
  const [dark, set] = useState(isDark)
  useEffect(() => onTheme(set), [])
  return dark
}

export function StudioShell({ children }) {
  const session = useSession()
  const dark = useDark()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:px-6">
          <a href={href("/")} data-testid="studio-brand" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {C.site.title.trim()[0]}
            </span>
            <span className="hidden sm:inline">{C.site.title}</span>
          </a>
          <span className="ml-1 text-sm text-muted-foreground">Studio</span>
          <div className="ml-auto flex items-center gap-1">
            {DRIVE_ENABLED && session.signedIn() && (
              <span className="hidden text-xs text-muted-foreground sm:inline" data-testid="session-status">
                {STATUS[session.status] || ""}
              </span>
            )}
            <Button variant="ghost" size="icon" asChild aria-label="View the blog" data-testid="studio-view-blog">
              <a href={href("/")}><EyeIcon /></a>
            </Button>
            <Button variant="ghost" size="icon" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
              data-testid="theme-toggle" onClick={toggleTheme}>
              {dark ? <SunIcon /> : <MoonIcon />}
            </Button>
            {DRIVE_ENABLED && session.signedIn() && (
              <Button variant="ghost" size="icon" aria-label="Sign out" data-testid="studio-signout"
                onClick={() => { session.signOut(); go("/studio") }}>
                <LogOutIcon />
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 px-4 py-10 sm:px-6">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
          {C.site.title} · everything here is saved in your own Google Drive
        </div>
      </footer>
    </div>
  )
}
