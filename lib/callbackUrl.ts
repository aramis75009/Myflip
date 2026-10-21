const PAR_DEFAUT = "/dashboard";

/**
 * Where to send the user back after signing in: a relative path of the
 * SAME origin, else the dashboard. Blocks open redirects (`//other-site`,
 * `https://other-site`, `/\other-site`, `javascript:`…).
 *
 * `origine` is the app origin (`location.origin` on the client).
 */
export function callbackUrlSur(brut: string | null | undefined, origine: string): string {
  if (!brut) return PAR_DEFAUT;
  let url: URL;
  let base: URL;
  try {
    base = new URL(origine);
    url = new URL(brut, base);
  } catch {
    return PAR_DEFAUT;
  }
  if (url.origin !== base.origin) return PAR_DEFAUT;
  const chemin = `${url.pathname}${url.search}${url.hash}`;
  return chemin.startsWith("/") && !chemin.startsWith("//") ? chemin : PAR_DEFAUT;
}
