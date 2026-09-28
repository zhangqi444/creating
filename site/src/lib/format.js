const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "Sep 6, 2026" from an ISO date; the string is left alone if it is not one. */
export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "")
  if (!m) return iso || ""
  return `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`
}
export const readTime = (minutes) => `${minutes} min read`

/** A post need not be named: the studio lets a picture stand on its own, and an
 *  imported post may carry a placeholder such as "(Untitled)". Either way a card
 *  reading nothing, or the same word as every other card, tells a reader less
 *  than the date does, so those show their date as their heading. */
const UNTITLED = /^\(?\s*untitled\s*\)?$/i
export const isUntitled = (post) => {
  const t = (post.title || "").trim()
  return t === "" || UNTITLED.test(t)
}
export const titleOf = (post) => (isUntitled(post) ? fmtDate(post.date) : post.title)
export const initials = (name) => (name || "").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
