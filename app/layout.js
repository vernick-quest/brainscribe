import './globals.css'
import SiteFooter from '@/components/SiteFooter'
import JsonLd from '@/components/JsonLd'
import { organizationSchema, softwareApplicationSchema } from '@/lib/schema'
import { CANONICAL_URL, CANONICAL_DESCRIPTION } from '@/lib/site'

// Site-wide default description = the canonical entity line (verbatim). Pages
// with their own topic-tuned description override it; this is the fallback and
// the entity signal.
const DESCRIPTION = CANONICAL_DESCRIPTION

export const metadata = {
  // Resolves relative metadata URLs (incl. the file-convention OG images) and
  // pins them to the canonical www host. Child pages can override openGraph /
  // twitter / canonical; the root opengraph-image.js supplies the default
  // share card for any page without its own.
  metadataBase: new URL(CANONICAL_URL),
  title: 'BrainScribe',
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'BrainScribe',
    title: 'BrainScribe',
    description: DESCRIPTION,
    url: CANONICAL_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BrainScribe',
    description: DESCRIPTION,
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased flex flex-col min-h-screen">
        {/* Site-wide entity schema — appears on every page for AI-assistant
            entity resolution. Page-level FAQPage schema is added per page. */}
        <JsonLd data={organizationSchema()} />
        <JsonLd data={softwareApplicationSchema()} />
        <div className="flex-1 flex flex-col">
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  )
}
