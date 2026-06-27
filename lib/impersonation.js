import { cookies } from 'next/headers'

// Returns { userId, role, name } if admin is impersonating, null otherwise.
// Always pass the actual admin profile so we only honour the cookie for real admins.
export async function getImpersonation(adminProfile) {
  if (adminProfile?.role !== 'admin') return null

  const cookieStore = await cookies()
  const raw = cookieStore.get('bs_impersonate')?.value
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    // A malformed-but-valid-JSON cookie (no userId) would otherwise read as a
    // truthy impersonation that falls back to the admin's own id with an
    // "Unknown" banner. Treat it as no impersonation.
    if (!parsed?.userId) return null
    return parsed
  } catch {
    return null
  }
}
