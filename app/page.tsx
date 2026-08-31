import { WelcomeHero } from "@/components/welcome-hero";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#f9f6f3,_#f4f6f0_35%,_#f8f5fa_100%)] px-4 py-8 md:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <WelcomeHero />
      </div>
    </main>
  );
}
