# Design

The look and feel of Creating — the blog a stranger reads and the studio its
author uses — and the reasons behind it. Companion to
[architecture.md](architecture.md). The rules that must not drift are in
[AGENTS.md](../AGENTS.md) under *UI conventions*; this document explains them.

## Who it is for

Someone who makes pictures, and the people they send the link to. The reader has
to work for a visitor who arrived from a message and will never sign in to
anything; the studio has to work for one person adding a picture they made ten
minutes ago.

**The content decides the design.** A post is one picture, a title and a date;
everything else is optional and most posts have none. So a card is a picture with
its title under it and no excerpt, because there is usually nothing to excerpt; a
post page is the picture at up to 82% of the screen's height, uncropped, with its
caption when it has one; nothing claims a reading time unless there are at least
fifty words; a post with no body has no empty reading column under it; and the
front page opens on the newest two dozen with a button for more, because years of
pictures in one grid is a page nobody can use.

## Principles

1. **The pictures are the site.** Every screen exists to get someone to a post
   and then out of the way. No sidebars, no widgets, no counters.
2. **One colour, one meaning.** Blue is for links, topic labels and the single
   action on a screen. Everything else is neutral, in both themes.
3. **Pictures are first-class.** Cards lead with the picture; a post shows it
   large above the text; the gallery is a page of nothing else.
4. **Dark mode is a theme, not an inversion.** Every token has a dark value
   chosen for contrast.
5. **Nothing to load.** The device's own font, inline SVG icons, one JSON fetch,
   and not a single request to another host. The suite fails if that changes.
6. **A picture is sent at the size it is drawn.** These are photographs off a
   phone, 2000px wide; a card shows one at 400. So cards and gallery tiles ask
   for the 800px copy and the post page for the 1600px one, and the front page
   costs 2.6 MB instead of 9.3. The original is still there, untouched, for the
   one screen that shows the picture large.

## Theme

The tokens are the "Calm Scholar" neutrals shared with the sibling repositories,
with the blue accent this blog inherited from `the-little-me`. They are CSS
variables in `site/src/index.css`, mapped into Tailwind v4 with `@theme inline`.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `background` | `#f5f7fa` | `#0f1318` | page |
| `card` | `#ffffff` | `#171c23` | cards, the lightbox |
| `foreground` | `#171c24` | `#e7ebf1` | text |
| `muted-foreground` | `#5d6673` | `#9aa5b4` | excerpts, bylines, captions |
| `primary` | `#2b63c9` | `#8fb4f0` | links, topic labels, the avatar, the one button |
| the mark | `#2b63c9` → `#6b4fc4` | same | the site mark, in `site/public/favicon.svg` |
| `accent` | `#dde7f7` | `#1b2a42` | hover surfaces |
| `border` | `#d9dfe8` | `#2a323d` | hairlines |
| `hero-from` / `hero-to` | `#dbe8ff` → `#f5f7fa` | `#16233a` → `#0f1318` | the front page band |
| `radius` | `0.75rem` | | cards, pictures, controls |

Type is the device's own UI stack. Sizes: site name in the hero `text-6xl`
extrabold; post title `text-3xl` bold, tight tracking; the lead card's title
`text-lg`, a grid card's `text-sm`, both at reading weight so they sit under the
picture rather than shouting over it; body `1.125rem` at line-height 1.75 in a
48rem column (about 720px, roughly 70 characters); excerpts and bylines `text-sm`
muted; topic labels `text-xs` uppercase, letter-spaced, blue.

## Layout

- **Header**: sticky, translucent, 3.5rem. Brand (the site mark, then the name), the nav from `site.json`, a pencil to the studio
  when sign-in is configured, the theme toggle. Under 640px the nav folds into a
  menu button that opens a list below the bar and closes on navigation.
- **Front page**: a soft blue-to-background gradient band with the name and
  tagline; then the newest post as a wide card at 3:2 with the byline under it;
  then the rest at 4:3 in a grid of one, two or three columns; then the topics as
  pills with counts. The date appears once per card: beside the title, or in the
  byline on the lead card, never both.
- **Post**: the picture first and largest, then topic labels, title, excerpt as a
  standfirst, byline (avatar · name · date · read time, and nothing at all when
  the blog names no author), the body in a 48rem column, older/newer cards, then
  three more posts to read (same topics first).
- **Topic**: a small header with the count, then the grid.
- **About** (any standing page): title, optional wide picture, the body.
- **Gallery**: a masonry of tiles (two columns on phones, three above) with
  caption and date under each; a tile opens the picture large in a dialog with
  its caption and a link to its post; Escape or the close button dismisses it.
- **Footer**: name, year, the note from `site.json`, and its links. The gallery
  lives here rather than in the top bar: it is a way to browse, not a section.

## The studio

The studio shares every token, component and rule above; only the chrome differs.

- **Shell**: the same sticky bar, with the site's name on the left leading back
  into the blog, and at the right the save state in words ("Saving…", "Saved to
  Drive"), an eye that views the blog, the theme toggle and sign out. The save
  state is written out rather than shown as a dot, because someone should be able
  to see that their work is kept without being asked to trust an icon.
- **The gate**: one card explaining where the work will live — your Drive, only
  the files this site made, nothing public until you publish — and one button. A
  build with no Google client id says so instead, rather than offering a button
  that cannot work; that is the state every fresh clone is in.
- **Publishing**: a panel at the top that says plainly whether these pictures are
  private or published. Published shows the link and a way to copy it, and
  underneath, quietly, *Make them private again* — putting something on the
  internet is only a decision if it can be undone.
- **My pictures**: one row per picture — thumbnail, title, date, and the buttons,
  which wrap under the title rather than squeezing it on a phone. Everything else
  about a post (the description, a caption, topics, a note) is folded away behind
  a chevron, because almost every post is a picture with a title and nothing
  else. The one nag: a picture with no description says *Describe this picture*
  where its caption would go, and pressing that opens the field it is about.

## Cards

A card is the picture, with the topic labels, the title and the date under it. The
whole card is the link (the title's anchor stretches over it), the picture zooms
very slightly on hover, and the shadow lifts. The lead card on the front page
gets the wider 3:2 crop and the byline.

## Motion and states

- The lightbox fades and scales in 200 ms. Hover zooms are 300 ms. Everything
  honours `prefers-reduced-motion`.
- An empty front page or gallery says which file would fill it.
- An unknown route shows a 404 view with one button back to the front page.

## Writing

Sentence case everywhere. Dates render through `fmtDate` ("Sep 6, 2026"). Reading
time is "3 min read". Topics are lower-case words. A post that was never named
shows its date as its heading, in the cards and on its own page, rather than a
blank line or the same placeholder word on every card. Everything the repository
writes around an author's posts — a label, an empty state, a hint in a form — is
short, concrete, and has no hype and no exclamation marks in it.
