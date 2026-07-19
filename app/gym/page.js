import { redirect } from 'next/navigation'

// Legacy route: /gym was renamed to /skill-studio (to match the "Skill Studio"
// display name). This stub forwards old bookmarks/links. The internal /api/gym/*
// endpoints are unchanged. Auth is still enforced by the proxy.
export default function GymRedirect() {
  redirect('/skill-studio')
}
