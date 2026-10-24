import { signOutAction } from "@/components/layout/sign-out-action";
import { Button } from "@/components/ui/button";

export function SignOutButton({ variant = "outline" }: { variant?: "outline" | "ghost" }) {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant={variant}>
        Sign out
      </Button>
    </form>
  );
}
