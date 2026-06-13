import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST-only: a GET logout is CSRF-able (a cross-site top-level navigation could
// log the user out). POST + SameSite=Lax cookies blocks that. The 303 makes the
// browser follow up with a GET to /login (307 would re-issue the POST).
export async function POST(request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), 303)
}
