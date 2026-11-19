import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Scheduler",
  description: "Timeline SCELE, nilai akademik, dan rencana belajar pribadi.",
};

const themeInitScript = `
try {
  var stored = localStorage.getItem('my-timeline-theme');
  var override = stored === 'light' || stored === 'dark' ? stored : null;
  var meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.content = override || 'light dark';
  var resolved = override || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
} catch (_) {
  var fallback = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = fallback;
  document.documentElement.classList.toggle('dark', fallback === 'dark');
}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
