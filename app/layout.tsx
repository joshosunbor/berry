import type { Metadata } from "next";
import { THEME_SCRIPT } from "@/components/site/theme-toggle";
import { GeistMono, GeistSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Berry",
  description:
    "One applicant. Three lenders. Three different answers. Berry shows how credit unions, banks and fintechs read the same cash flow differently, and explains every decision.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-CA"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
            Skip to content
          </a>
          {children}
      </body>
    </html>
  );
}
