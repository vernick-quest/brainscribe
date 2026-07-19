import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function LoginLayout({ children }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const dest = profile?.role === 'admin' ? '/admin'
      : profile?.role === 'teacher' ? '/teacher'
      : profile?.role === 'parent' ? '/parent'
      : '/folder'

    redirect(dest)
  }

  return <>{children}</>
}
