import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm leading-none text-white">
        ▶
      </span>
      <span className="text-xl font-semibold tracking-tight text-ink">
        Walkthru
      </span>
    </Link>
  );
}
