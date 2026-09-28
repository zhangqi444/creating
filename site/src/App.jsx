/* Creating: a blog whose data belongs to whoever wrote it, and a reader that
 * shows a published one to a stranger with no sign-in at all.
 *
 * Two chromes, deliberately. The reader is the blog, and it carries no sign of
 * the studio: someone following a link to a picture has no business meeting a
 * sign-in screen. The studio is where an author keeps their posts, and it is the
 * only place the account appears.
 *
 *   #/                   this deployment's blog: the committed posts, or the
 *                        published Drive blog named by `blogId` in site.json
 *   #/post/<slug>        one post
 *   #/tag/<tag>          a topic
 *   #/gallery            every picture at once
 *   #/<slug>             a standing page, e.g. #/about
 *   #/studio             the author's own screens, behind Google sign-in
 *   #/b/<driveFileId>/…  someone else's published blog, in the reader
 *
 * The studio is a dynamic import, so a reader never downloads the editor. */
import { lazy, Suspense } from "react"

import { blogId, useRoute } from "@/lib/router"
import { StudioShell } from "@/components/studio-shell"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Home } from "@/modules/gallery/pages/home"
import { Post } from "@/modules/gallery/pages/post"
import { Tag } from "@/modules/gallery/pages/tag"
import { Page } from "@/modules/gallery/pages/page"
import { Gallery } from "@/modules/gallery/pages/gallery"
import { NotFound } from "@/modules/gallery/pages/not-found"

const Studio = lazy(() => import("@/modules/gallery/pages/studio.jsx").then((m) => ({ default: m.Studio })))

/** The blog: what a reader sees, with no sign of the studio around it. */
function Reader({ route }) {
  const [head, arg] = route
  let view = <NotFound />
  if (!head) view = <Home />
  else if (head === "post" && arg) view = <Post slug={arg} />
  else if (head === "tag" && arg) view = <Tag tag={arg} />
  else if (head === "gallery") view = <Gallery />
  else if (route.length === 1) view = <Page slug={head} />
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader route={route} />
      <main className="flex-1">{view}</main>
      <SiteFooter />
    </div>
  )
}

export default function App() {
  const route = useRoute()

  // The studio is this deployment's own screen. `#/b/<id>/studio` is not it:
  // the router strips that prefix, so a stranger reading someone's published
  // blog arrives here with route ["studio"] too, and must stay in the reader.
  if (route[0] === "studio" && route.length === 1 && !blogId()) {
    return (
      <StudioShell>
        <Suspense fallback={<p className="mx-auto max-w-2xl text-sm text-muted-foreground">Opening the studio…</p>}>
          <Studio />
        </Suspense>
      </StudioShell>
    )
  }
  return <Reader route={route} />
}
