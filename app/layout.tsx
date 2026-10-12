import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ModeProvider } from "@/components/berry/mode-context";
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
    >
      <body className="flex min-h-full flex-col">
        <ModeProvider>
        <TooltipProvider>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
            Skip to content
          </a>
          {children}
        </TooltipProvider>
        </ModeProvider>
      </body>
    </html>
  );
}
