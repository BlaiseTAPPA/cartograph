import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { themeBootScript } from "@/lib/theme";
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
  title: "Cartograph",
  description: "A dependency map of a public GitHub repository",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script sets data-theme before React hydrates.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        {/* Clerk's components read the same tokens, so the sign-in screen and
            the switcher follow the theme instead of carrying their own. */}
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: "var(--accent)",
              colorBackground: "var(--surface-raised)",
              colorForeground: "var(--fg)",
              colorMutedForeground: "var(--fg-muted)",
              colorNeutral: "var(--fg)",
              colorBorder: "var(--line)",
              colorInput: "var(--surface)",
              colorInputForeground: "var(--fg)",
              fontFamily: "var(--font-geist-sans)",
              fontSize: "13px",
              borderRadius: "4px",
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
