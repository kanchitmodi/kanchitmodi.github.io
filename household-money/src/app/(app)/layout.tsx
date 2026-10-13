import { requirePageAuth } from "@/lib/auth-guard";
import { currentScope } from "@/lib/scope-server";
import { scopeKey } from "@/lib/permissions";
import { ScopeSwitcher } from "@/components/scope-switcher";
import { BottomTabs, Sidebar } from "@/components/nav";
import { ThemeToggle } from "@/components/theme";
import { IdleLock } from "@/components/idle-lock";
import { InstallPrompt, OfflineBanner } from "@/components/pwa";
import { Avatar } from "@/components/avatar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { viewer, user } = await requirePageAuth();
  const { scope, members } = await currentScope(viewer);
  const options = [
    { key: "household", label: "Household" },
    ...members.map((m) => ({ key: m.id, label: m.name })),
  ];

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <header className="pt-safe sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
          <div className="px-safe mx-auto flex max-w-6xl items-center gap-2 py-2">
            <div className="flex-1 sm:max-w-md">
              <ScopeSwitcher options={options} current={scopeKey(scope)} />
            </div>
            <ThemeToggle />
            <span className="sr-only">Signed in as {user.name}</span>
            <Avatar name={user.name} color={user.avatarColor} size={32} />
          </div>
        </header>
        <main className="px-safe mx-auto max-w-6xl pt-4 pb-28 md:pb-10">
          <OfflineBanner />
          <InstallPrompt />
          {children}
        </main>
      </div>
      <BottomTabs />
      <IdleLock />
    </div>
  );
}
