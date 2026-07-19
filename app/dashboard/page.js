import { redirect } from 'next/navigation'

// Legacy route: the student home was renamed /dashboard → /folder. This stub keeps
// old bookmarks and any external links working by forwarding to the new path (which
// then role-routes as before). Safe to remove once no /dashboard links remain in the
// wild. Auth is still enforced by the proxy (/dashboard is not a public path).
export default function DashboardRedirect() {
  redirect('/folder')
}
