/**
 * Returns `next` if it is a path on this site, otherwise the fallback.
 * Stops the login page's ?next= parameter being used to send people to
 * another website after they sign in (an "open redirect").
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/receipts"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}