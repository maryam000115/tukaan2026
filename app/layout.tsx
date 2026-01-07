import "./globals.css";
import SWRegister from "./sw-register";

export const metadata = {
  title: "Tukaanle",
  description: "Tukaanle PWA",
  themeColor: "#16a34a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SWRegister />
        {children}
      </body>
    </html>
  );
}
