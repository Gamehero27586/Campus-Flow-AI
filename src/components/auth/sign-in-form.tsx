"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FieldError } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { signInErrorMessage } from "@/lib/auth-messages";
import { type SignInInput, signInSchema } from "@/lib/schemas/auth";

export function SignInForm({
  googleEnabled,
  googleError,
}: {
  googleEnabled: boolean;
  /** Set when Google sent the browser back with an error. */
  googleError: string | null;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });

  useEffect(() => {
    // A fixed id stops the toast appearing twice when React runs effects twice in development.
    if (googleError) toast.error(googleError, { id: "google-error" });
  }, [googleError]);

  async function onSubmit(values: SignInInput) {
    const { error } = await authClient.signIn.email(values);
    if (error) {
      toast.error(signInErrorMessage(error));
      return;
    }
    toast.success("Signed in.");
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
            autoComplete="current-password"
            {...register("password")}
          />
          <FieldError messages={errors.password ? [errors.password.message ?? ""] : undefined} />
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>
      {googleEnabled ? <GoogleButton /> : null}
      <p className="text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/sign-up" className="font-medium text-primary underline underline-offset-4">
          Create an account
        </Link>
      </p>
      <p className="text-sm text-muted-foreground">
        Forgot your password? Ask an administrator for a reset link.
      </p>
    </div>
  );
}
