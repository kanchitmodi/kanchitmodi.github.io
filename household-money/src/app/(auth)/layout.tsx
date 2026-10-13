export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="pt-safe px-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center py-10">
      <div className="mb-8 text-center">
        <div
          aria-hidden="true"
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-accent-fg"
        >
          $
        </div>
        <p className="text-lg font-bold">Household Money</p>
      </div>
      {children}
    </main>
  );
}
