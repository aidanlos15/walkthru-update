import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { ChoiceCard } from "@/components/ChoiceCard";
import { UploadIcon, LinkIcon } from "@/components/icons";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <span className="text-sm text-muted">Cinematic AI property tours</span>
      </header>

      <section className="flex flex-1 flex-col justify-center py-12">
        <div className="max-w-2xl">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted shadow-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Photos in, film out
          </p>
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Turn any listing into a{" "}
            <span className="text-accent">cinematic</span> tour.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Drop in your room photos or paste an Airbnb link. Walkthru directs,
            animates, and edits a beautiful video tour of the property, in
            minutes.
          </p>
        </div>

        <div className="mt-12 flex flex-col gap-5 sm:flex-row">
          <ChoiceCard
            href="/upload"
            icon={<UploadIcon className="h-7 w-7" />}
            title="Upload your photos"
            description="Drag in your room photos and we build the tour."
          />
          <ChoiceCard
            href="/link"
            icon={<LinkIcon className="h-7 w-7" />}
            title="Paste an Airbnb link"
            description="Drop a listing URL and we do the rest."
          />
        </div>
      </section>

      <footer className="flex items-center gap-3 py-8 text-sm text-muted">
        <span>Built for the demo · runs locally</span>
        <span aria-hidden>·</span>
        <Link
          href="/test"
          className="font-medium text-muted transition-colors hover:text-accent"
        >
          Test: sort photos by room
        </Link>
      </footer>
    </main>
  );
}
