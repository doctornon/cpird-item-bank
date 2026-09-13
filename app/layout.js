import "./globals.css";

export const metadata = {
  title: "ระบบจัดทดสอบและวัดผล สพพ.",
  description: "ระบบจัดทดสอบและวัดผล สพพ. — คลังข้อสอบและจัดสอบ MCQ/MEQ ตาม NL blueprint",
  icons: { icon: "/cpird-logo.png", apple: "/cpird-logo.png" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@500;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
