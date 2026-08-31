export default function GroupDetailLoading() {
  return (
    <div className="flex min-h-screen bg-[#f7f3ee] text-[#241d1d]">
      <aside className="hidden h-screen w-full max-w-[260px] border-r border-[#efe4dc] bg-[#fffaf7]/90 md:block" />
      <main className="h-screen flex-1 overflow-y-auto px-5 py-6 md:px-8">
        <div className="mb-6 space-y-2">
          <div className="h-7 w-48 animate-pulse rounded-xl bg-[#efe6df]" />
          <div className="h-4 w-64 animate-pulse rounded-lg bg-[#f3ece6]" />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-3xl bg-[#f3ece6]" />
          ))}
        </div>

        <div className="mt-4 h-20 animate-pulse rounded-3xl bg-[#f1ecf7]" />

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="h-64 animate-pulse rounded-3xl bg-[#f3ece6]" />
          <div className="h-64 animate-pulse rounded-3xl bg-[#f3ece6]" />
        </div>
      </main>
    </div>
  );
}
