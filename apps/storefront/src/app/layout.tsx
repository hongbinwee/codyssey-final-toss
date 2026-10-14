import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import "styles/globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

// Applies the stored theme before first paint so light/dark never flash.
// Only the user's choice ("light" | "dark" | "system") is persisted.
const themeInitScript =
  "(function () {" +
  "try {" +
  'var stored = localStorage.getItem("3days-theme");' +
  'var theme = stored === "light" || stored === "dark" ? stored : "system";' +
  'var dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);' +
  'if (dark) { document.documentElement.classList.add("dark") }' +
  " else { document.documentElement.classList.remove('dark') }" +
  "} catch (e) {}" +
  "})()"

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="preconnect"
          href="https://cdn.jsdelivr.net"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-ui-bg-subtle text-ui-fg-base antialiased">
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}
