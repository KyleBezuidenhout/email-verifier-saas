/**
 * Frontend access-control helpers.
 *
 * Kept in one place so page route guards and the sidebar filter cannot drift
 * out of sync (e.g. a user who can see a sidebar link but gets bounced on
 * click, or vice versa).
 */

/**
 * Non-admin accounts that are explicitly allowed to use the Enrich and Verify
 * pages. Keep this list short and obvious — anything more general belongs
 * behind a real role/permission flag on the user.
 */
const ENRICH_VERIFY_ALLOWLIST: ReadonlySet<string> = new Set([
  "sander@zeetmedia.com",
]);

/** Minimal user shape needed for permission checks. */
type PermissionUser =
  | {
      is_admin?: boolean;
      email?: string;
    }
  | null
  | undefined;

/**
 * Returns true if the user can access the Enrich (/find-valid-emails) and
 * Verify (/verify-emails) pages. Admins always pass; specific non-admin
 * accounts can be allowlisted above.
 */
export function canAccessEnrichVerify(user: PermissionUser): boolean {
  if (!user) return false;
  if (user.is_admin) return true;
  if (!user.email) return false;
  return ENRICH_VERIFY_ALLOWLIST.has(user.email.toLowerCase());
}
