import { cookies } from 'next/headers'

// Returns { userId, role, name } if admin is impersonating, null otherwise.
// Always pass the actual admin profile so we only honour the cookie for real admins.
export async function getImpersonation(adminProfile) {
  if (adminProfile?.role !== 'admin') return null

  const cookieStore = await cookies()
  const raw = cookieStore.get('bs_impersonate')?.value
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
