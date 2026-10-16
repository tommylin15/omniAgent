/** Distinguish Google interactive OAuth users from IAM-issued service accounts.
 * Both token families may have accounts.google.com issuer, Google signature,
 * caller-chosen audience and email_verified=true. This runs *after* Google
 * signature/audience/expiry verification, and is never a replacement for it.
 */
export type GoogleBrowserClaims = {
  iss?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  azp?: unknown;
};

export function verifyGoogleBrowserUserClaims(claims: GoogleBrowserClaims): void {
  if (!["https://accounts.google.com", "accounts.google.com"].includes(
        String(claims.iss ?? "")) ||
      typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255 ||
      claims.email_verified !== true ||
      typeof claims.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ||
      /\.gserviceaccount\.com$/i.test(claims.email)) {
    throw new Error("unauthorized");
  }
  // IAM generateIdToken returns azp as a numeric service-account unique ID;
  // Google OAuth client IDs (when azp exists) end in apps.googleusercontent.com.
  // Reject service principals even if email was omitted or malformed.
  if (claims.azp !== undefined &&
      (typeof claims.azp !== "string" ||
       !/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(claims.azp))) {
    throw new Error("unauthorized");
  }
}
