import './globals.css'
import { THEME_INIT_SCRIPT } from '@/lib/themePreference'
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
    // suppressHydrationWarning: the script below sets data-theme on <html> before
    // React hydrates, so the attribute React rendered and the one in the DOM differ
    // by design. Without this React treats it as a hydration error and re-renders
    // from the nearest boundary, which would undo the attribute and flash the wrong
    // theme. See node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
    //
    // NOTE: no default data-theme on <html>, unlike the Next example. 'System' is the
    // ABSENCE of the attribute — globals.css keys the automatic path off
    // `:root:not([data-theme="light"])` inside the prefers-color-scheme query, so
    // seeding data-theme="light" here would pin every reader to light and kill
    // OS-driven dark mode for everyone who never touches the toggle.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking, in <head>, so a reader who chose Dark on a light-OS machine
            never sees a flash of cream. It runs while the HTML is still parsing —
            before React exists and before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
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
