import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "سامانه مدیریت تولید و خدمات پس از فروش تجهیزات پزشکی",
  description: "کنترل تولید، کیفیت، ردیابی کامل محصول و خدمات پس از فروش تجهیزات پزشکی",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        {/* فونت وزیرمتن به‌صورت لوکال از public/fonts بارگذاری می‌شود (globals.css) — بدون CDN و بدون نیاز به اینترنت */}
      </head>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
