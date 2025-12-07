import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Email Verifier SaaS',
  description: 'Professional email verification service',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}


