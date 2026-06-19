import { redirect } from 'next/navigation'

// /write was the old "write your own" entry point. The canonical new-assignment
// page is now /assignment/new (it carries the same age gate and works for every
// role). Keep this route alive as a permanent alias so old links don't break.
export default function WritePage() {
  redirect('/assignment/new')
}
