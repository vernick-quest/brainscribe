import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function signout(request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url))
}

export const GET = signout
export const POST = signout
