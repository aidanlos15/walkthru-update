import Link from "next/link";
import { Logo } from "./ui/Logo";

interface PageShellProps {
  children: React.ReactNode;
  /** Optional eyebrow + heading block. */
  eyebrow?: string;
  heading?: string;
  sub?: string;
  back?: { href: string; label: string };
}

/** Consistent centered column + header used by every non-landing screen. */
export function PageShell({
  children,
  eyebrow,
  heading,
  sub,
  back,
}: PageShellProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <Logo />
        {back && (
          <Link
            href={back.href}
            className="text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            {back.label}
          </Link>
        )}
      </header>

      <div className="flex-1 py-8">
        {(eyebrow || heading || sub) && (
          <div className="mb-8">
            {eyebrow && (
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-accent">
                {eyebrow}
              </p>
            )}
            {heading && (
              <h1 className="text-4xl font-semibold leading-tight text-ink">
                {heading}
              </h1>
            )}
            {sub && (
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                {sub}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </main>
  );
}
