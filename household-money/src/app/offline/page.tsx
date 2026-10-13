export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="pt-safe px-safe mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center text-center">
      <h1 className="text-2xl font-bold">You&apos;re offline</h1>
      <p className="mt-2 text-text-2">
        This page hasn&apos;t been cached yet. Pages you&apos;ve opened before are available offline
        with your last-synced data.
      </p>
      {/* Full reload on purpose: re-tries the network instead of client-side routing. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="btn btn-primary mt-6">
        Try again
      </a>
    </main>
  );
}
