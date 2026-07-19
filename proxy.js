import { updateSession } from '@/lib/supabase/middleware'

async function proxy(request) {
  return updateSession(request)
}

export { proxy }
export default proxy

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|m4a|wav|ogg)$).*)',
  ],
}
