import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PromptForge",
  description: "Doc-grounded prompt engineering for any AI model",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
          <div className="mx-auto flex h-12 max-w-[1400px] items-center gap-5 px-5">
            <Link href="/" className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
              <Image src="/icon.png" alt="" width={22} height={22} className="rounded-[5px]" />
              PromptForge
            </Link>
            <span className="h-4 w-px bg-line" />
            <Nav />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6">{children}</main>
      </body>
    </html>
  );
}
