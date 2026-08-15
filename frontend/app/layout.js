import "./globals.css";
import Sidebar from "../components/shared/Sidebar";

export const metadata = {
  title: "TrustPay Agent",
  description: "An autonomous financial agent with bounded authority",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-display">
        <Sidebar />
        <div className="ml-64 min-h-screen">{children}</div>
      </body>
    </html>
  );
}
