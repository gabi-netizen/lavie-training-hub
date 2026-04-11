import TopNav from "./TopNav";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "oklch(0.13 0.03 240)" }}>
      <TopNav />
      {/* Main content — add bottom padding on mobile for the tab bar */}
      <main className="flex-1 md:pb-0 pb-16">
        {children}
      </main>
    </div>
  );
}
