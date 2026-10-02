/* Which copy of a picture a screen should ask for.
 *
 * A picture here exists at up to three sizes: the original the author uploaded,
 * and the smaller copies beside it — `thumb` for anywhere it is drawn small,
 * `large` for the post page. site/make_thumbs.py makes them for committed
 * pictures and the bundle records where they are; a picture in someone's Drive
 * gets the same two sizes from Google by asking for a width.
 *
 * Every size is optional and the original is always there, so both of these
 * fall back to it. That is what lets the tool stay optional: a clone that never
 * ran make_thumbs.py serves the same site, only heavier.
 *
 * It takes a post, a page or a gallery item — `image` on the first two, `src` on
 * the last — so no screen has to know which it is holding. */

const original = (pic) => (pic && (pic.image || pic.src)) || ""

/** Cards and gallery tiles: a few hundred pixels wide, so never the original. */
export function small(pic) {
  return (pic && pic.thumb) || original(pic)
}

/** The post page and the lightbox, where the picture is the point. */
export function full(pic) {
  return (pic && pic.large) || original(pic)
}
