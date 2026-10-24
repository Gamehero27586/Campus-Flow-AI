import { Button } from "@/components/ui/button";

// Slice 0 placeholder: shows that the theme tokens work. Replaced by the real shell in Slice 1.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold text-primary">Campus Flow AI</h1>
      <p className="text-muted-foreground">Setup complete. This page only checks the theme.</p>
      <div className="rounded-lg border bg-card p-4 text-card-foreground">
        <p>A white card on the cream background, with a border.</p>
      </div>
      <div className="flex gap-3">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="destructive">Destructive</Button>
      </div>
      <p className="rounded-md bg-amber-soft p-3 text-sm">Reminder banner (amber-soft).</p>
    </main>
  );
}
