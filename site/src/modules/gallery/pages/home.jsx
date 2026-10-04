/* Home: the tagline under the bar's centred name, the lead post, then the rest. */
import { useState } from "react"

import { C, tags } from "@/modules/gallery/content"
import { href } from "@/lib/router"
import { Button } from "@/components/ui/button"
import { PostCard } from "@/modules/gallery/post-card"
import { Subscribe } from "@/components/subscribe"
import { useTitle } from "@/components/page-title"

/* Three years of pictures is far too much for one screen, so the front page
   opens on the most recent and grows a page at a time. The gallery still holds
   every picture at once for anyone who wants to browse the lot. */
const PAGE = 24

export function Home() {
  useTitle("")
  const [shown, setShown] = useState(PAGE)
  const [lead, ...rest] = C.posts
  const visible = rest.slice(0, shown)
  const allTags = tags()
  return (
    <>
      {/* The site's name is already centred in the bar, as on sheilazhang.org, so
          the front page does not say it a second time in larger type. It stays
          as the page's heading for anyone reading by structure rather than by
          eye; what shows is the tagline, centred under the name the way a Ghost
          home page carries its description. */}
      <section data-testid="hero" className="border-b">
        <div className="mx-auto max-w-3xl px-4 pb-12 pt-6 text-center sm:px-6 sm:pb-16 sm:pt-10">
          <h1 className="sr-only">{C.site.title}</h1>
          <p className="text-xl leading-snug text-muted-foreground text-balance sm:text-2xl">{C.site.description}</p>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {lead ? (
          <div className="flex flex-col gap-8">
            <PostCard post={lead} large />
            {visible.length > 0 && (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="post-grid">
                {visible.map((p) => <PostCard key={p.slug} post={p} />)}
              </div>
            )}
            {shown < rest.length && (
              <div className="flex justify-center">
                <Button variant="outline" data-testid="show-more" onClick={() => setShown((n) => n + PAGE)}>
                  Show more pictures
                  <span className="text-muted-foreground">{rest.length - shown} left</span>
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            No posts yet. Add a Markdown file to <code>content/posts</code> and rebuild.
          </p>
        )}
        <Subscribe className="mt-14" />
        {allTags.length > 0 && (
          <section className="mt-14" aria-labelledby="tags-heading">
            <h2 id="tags-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Topics</h2>
            <div className="mt-3 flex flex-wrap gap-2" data-testid="tag-cloud">
              {allTags.map(({ tag, count }) => (
                <a key={tag} href={href("/tag/" + tag)} className="rounded-full border bg-card px-3 py-1 text-sm hover:bg-accent hover:text-accent-foreground">
                  {tag} <span className="text-muted-foreground">{count}</span>
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
