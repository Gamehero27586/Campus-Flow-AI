"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AI_FEEDBACK_MAX_LENGTH } from "@/config/limits";
import { rateBreakdownAction } from "@/app/(app)/tasks/ai-actions";

// The breakdowns the AI made for this task whose steps were saved, each with its own optional 1 to 5 stars and
// comment (rule AI-h). They stay on the task page, so a breakdown can be rated, or the rating changed, any time
// (not only right after saving). The server checks the rating again; a rating cannot be removed, only changed.

export type BreakdownHistoryItem = {
  id: string;
  /** "Fri 30 Oct, 12:48", in the user's time zone (formatted on the server). */
  savedAt: string;
  outcome: "accepted" | "edited";
  itemsSuggested: number | null;
  itemsKept: number | null;
  rating: number | null;
  feedback: string | null;
};

export function BreakdownHistory({ items }: { items: BreakdownHistoryItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3" aria-labelledby="ai-history-heading">
      <h2 id="ai-history-heading" className="text-lg font-semibold">
        AI breakdowns
      </h2>
      <p className="text-sm text-muted-foreground">
        Rate how useful each breakdown was. It is optional, and you can change a rating later.
      </p>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <RatingForm item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RatingForm({ item }: { item: BreakdownHistoryItem }) {
  const [rating, setRating] = useState(item.rating ?? 0);
  const [feedback, setFeedback] = useState(item.feedback ?? "");
  // What the server holds now, so "Save rating" is offered only when something changed.
  const [saved, setSaved] = useState({ rating: item.rating ?? 0, feedback: item.feedback ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const changed = rating !== saved.rating || feedback.trim() !== saved.feedback.trim();
  const hasSomething = rating !== 0 || feedback.trim() !== "";

  function send() {
    setError(null);
    const formData = new FormData();
    formData.set("suggestionId", item.id);
    formData.set("rating", rating === 0 ? "" : String(rating));
    formData.set("feedback", feedback);
    startTransition(async () => {
      const result = await rateBreakdownAction(null, formData);
      if (!result) return;
      if (!result.ok) {
        setError(result.fieldErrors?.rating?.[0] ?? result.fieldErrors?.feedback?.[0] ?? result.error.message);
        return;
      }
      if (result.message) toast.success(result.message);
      setSaved({ rating, feedback: feedback.trim() });
    });
  }

  const kept =
    item.itemsKept !== null && item.itemsSuggested !== null
      ? `${item.itemsKept} of ${item.itemsSuggested} suggested steps kept`
      : null;

  return (
    <fieldset className="space-y-3 rounded-lg border bg-card p-4">
      <legend className="px-1 text-sm font-medium">Breakdown saved {item.savedAt}</legend>
      <p className="text-sm text-muted-foreground">
        {item.outcome === "accepted" ? "Saved as suggested" : "Saved with your changes"}
        {kept ? `. ${kept}.` : "."}
        {saved.rating === 0 && saved.feedback.trim() === "" ? " Not rated yet." : ""}
      </p>
      <div role="radiogroup" aria-label="Rating from 1 to 5 stars" className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((value) => (
          <label key={value} className="cursor-pointer">
            <input
              type="radio"
              name={`rating-${item.id}`}
              value={value}
              checked={rating === value}
              onChange={() => setRating(value)}
              className="peer sr-only"
            />
            <span className="inline-flex h-9 items-center gap-1 rounded-lg border border-input px-3 text-sm peer-checked:border-brand peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
              <StarIcon className="size-4" aria-hidden="true" />
              <span className="sr-only">{value === 1 ? "1 star" : `${value} stars`}</span>
              <span aria-hidden="true">{value}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`feedback-${item.id}`}>Comment (optional)</Label>
        <Textarea
          id={`feedback-${item.id}`}
          value={feedback}
          maxLength={AI_FEEDBACK_MAX_LENGTH}
          rows={2}
          onChange={(event) => setFeedback(event.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <Button onClick={send} disabled={pending || !changed || !hasSomething}>
        {pending ? "Saving..." : saved.rating === 0 && saved.feedback.trim() === "" ? "Save rating" : "Update rating"}
      </Button>
    </fieldset>
  );
}
