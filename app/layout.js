import './globals.css'
import SiteFooter from '@/components/SiteFooter'

export const metadata = {
  title: 'BrainScribe',
  description: 'The Socratic Writing Coach for Middle & High Schoolers',
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
        <div className="flex-1 flex flex-col">
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  )
}
