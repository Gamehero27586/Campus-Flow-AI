import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { cookies } from "next/headers";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { parseTheme, THEME_COOKIE, THEME_INIT_SCRIPT } from "@/lib/theme";
import { cn } from "@/lib/utils";
import "./globals.css";

// Poppins has no variable font, so the weights the UI uses are listed.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Campus Flow AI",
  description: "Tasks, classes and a Growth Tracker for students and faculty.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    // suppressHydrationWarning: for "system" the inline script may add the `dark` class before
    // React hydrates, so the class can differ from what the server rendered. That is intended.
    <html
      lang="en"
      className={cn(poppins.variable, "h-full antialiased", theme === "dark" && "dark")}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <ThemeProvider initialTheme={theme}>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
