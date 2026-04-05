import { Providers } from "@/components/providers";
import { DashboardNav } from "@/components/dashboard-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <div className="min-h-screen flex">
        <DashboardNav />
        <main className="flex-1 ml-64 p-8">{children}</main>
      </div>
    </Providers>
  );
}
