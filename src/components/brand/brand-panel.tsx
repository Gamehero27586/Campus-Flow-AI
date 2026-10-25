import Image from "next/image";

// The left half of the sign-in and sign-up pages: the logo mark, the name and the tagline.
// The mark is a vector (traced from the owner's artwork), with a light and a dark version that swap
// with the theme. The name and tagline are real text in the app's font, so they stay sharp and match
// the rest of the app. The panel colour (--brand-panel) is the logo's own background colour.
export function BrandPanel() {
  return (
    <aside className="hidden flex-col items-center justify-center gap-6 bg-brand-panel p-10 lg:flex">
      <Image
        src="/brand/mark-light.svg"
        alt=""
        width={300}
        height={300}
        priority
        unoptimized
        className="size-72 dark:hidden xl:size-80"
      />
      <Image
        src="/brand/mark-dark.svg"
        alt=""
        width={300}
        height={300}
        priority
        unoptimized
        className="hidden size-72 dark:block xl:size-80"
      />
      <div className="space-y-3 text-center">
        <p className="text-5xl font-bold tracking-tight text-brand">
          Campus-Flow <span className="text-secondary">AI</span>
        </p>
        <p className="flex items-center justify-center gap-3 text-lg text-brand">
          <span aria-hidden className="h-0.5 w-10 rounded bg-accent" />
          <span>
            Plan <span className="text-secondary">•</span> Do{" "}
            <span className="text-secondary">•</span> Grow
          </span>
          <span aria-hidden className="h-0.5 w-10 rounded bg-accent" />
        </p>
      </div>
    </aside>
  );
}
