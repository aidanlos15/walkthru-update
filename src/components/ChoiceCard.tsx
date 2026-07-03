import Link from "next/link";

interface ChoiceCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

/** One of the two large selectable boxes on the landing page. */
export function ChoiceCard({ href, icon, title, description }: ChoiceCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex flex-1 flex-col gap-5 rounded-2xl bg-surface p-8 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-lift focus-visible:outline-none focus-visible:shadow-ring"
    >
      <span className="grid h-14 w-14 place-items-center rounded-xl bg-tint text-accent transition-colors group-hover:bg-accent group-hover:text-white">
        {icon}
      </span>
      <div className="space-y-2">
        <h3 className="text-2xl font-semibold text-ink">{title}</h3>
        <p className="max-w-[34ch] text-[15px] leading-relaxed text-muted">
          {description}
        </p>
      </div>
      <span className="mt-auto text-sm font-medium text-accent">
        {title.startsWith("Upload") ? "Upload photos" : "Paste a link"}
      </span>
    </Link>
  );
}
