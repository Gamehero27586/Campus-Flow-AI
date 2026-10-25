"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FieldError } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { signUpErrorMessage } from "@/lib/auth-messages";
import { type SignUpInput, signUpSchema } from "@/lib/schemas/auth";

export function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema) });

  async function onSubmit(values: SignUpInput) {
    const { error } = await authClient.signUp.email(values);
    if (error) {
      toast.error(signUpErrorMessage(error));
      return;
    }
    // The account exists but nobody is signed in yet: go to the sign-in page.
    // The toast belongs to the root layout, so it stays visible after the page changes.
    // Better Auth answers "success" even when the email already has an account, so nobody can
    // discover which emails are registered. The wording has to be true in both cases.
    toast.success(
      "Sign-up complete. Sign in with your email and password. If this email already had an account, use its existing password.",
      { duration: 8000 },
    );
    router.push("/sign-in");
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" {...register("name")} />
          <FieldError messages={errors.name ? [errors.name.message ?? ""] : undefined} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          <FieldError messages={errors.email ? [errors.email.message ?? ""] : undefined} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register("password")}
          />
          <FieldError messages={errors.password ? [errors.password.message ?? ""] : undefined} />
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating account..." : "Create account"}
        </Button>
      </form>
      {googleEnabled ? <GoogleButton /> : null}
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-brand underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
