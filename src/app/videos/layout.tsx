import { DashboardNav } from "@/components/dashboard-nav";

export default function VideosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      <DashboardNav />
      <main className="flex-1 ml-60">{children}</main>
    </div>
  );
}
