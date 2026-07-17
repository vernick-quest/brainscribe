import { createServiceClient } from '@/lib/supabase/service'

// Find unclaimed, unexpired invites addressed to this email so a dashboard can
// surface a confirmation banner. This closes the "invitee already exists" gap:
// the handle_new_user trigger auto-claims a matching invite only at SIGNUP, and
// the /invite page only claims when the token link is clicked — so an EXISTING
// user who never received/opened the email link stayed unlinked forever. The
// email match here is the same capability check /invite enforces at claim time;
// Accept just routes the (already-signed-in) user through /invite?token=… which
// runs all the real claim guards. Read via the service client because `invites`
// isn't broadly SELECT-able by `authenticated`.
export async function getPendingInvitesForEmail(email) {
  if (!email) return []
  const service = createServiceClient()
  const { data } = await service
    .from('invites')
    .select('token, role, invited_by, expires_at, claimed_by, coparent')
    .eq('email', email.toLowerCase())
    .is('claimed_by', null)
    .gt('expires_at', new Date().toISOString())
  if (!data?.length) return []

  const inviterIds = [...new Set(data.map(i => i.invited_by).filter(Boolean))]
  const names = {}
  if (inviterIds.length) {
    const { data: profs } = await service
      .from('profiles').select('id, full_name').in('id', inviterIds)
    for (const p of profs ?? []) names[p.id] = p.full_name
  }

  return data.map(i => ({
    token: i.token,
    role: i.role,
    coparent: !!i.coparent,
    inviterName: names[i.invited_by] ?? 'Someone',
  }))
}
