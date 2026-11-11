import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono, Newsreader } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const ui = Hanken_Grotesk({ variable: "--font-ui", subsets: ["latin"] });
const serif = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Pageturn", template: "%s · Pageturn" },
  description: "Your PDFs, read aloud.",
  applicationName: "Pageturn",
  appleWebApp: { capable: true, title: "Pageturn", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b1411" },
    { media: "(prefers-color-scheme: light)", color: "#eef1ea" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${ui.variable} ${serif.variable} ${mono.variable} h-full antialiased`}>
      <head>
        {/* Marks the phone platform before first paint, so iPhone and Android each get their native look. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var u=navigator.userAgent,d=document.documentElement;var ios=/iPhone|iPad|iPod/.test(u)||(/Macintosh/.test(u)&&navigator.maxTouchPoints>1);var p=ios?"ios":/Android/.test(u)?"android":"desktop";try{var o=localStorage.getItem("ab-platform");if(o==="ios"||o==="android"||o==="desktop")p=o;}catch(e){}d.dataset.platform=p;if(window.matchMedia("(display-mode: standalone)").matches||navigator.standalone)d.dataset.standalone="1";})();`,
          }}
        />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
