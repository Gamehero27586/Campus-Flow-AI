import type { ReactNode } from "react";
import { BrandPanel } from "@/components/brand/brand-panel";
import { Emblem } from "@/components/brand/emblem";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const ADMIN_VISIBILITY_NOTICE =
  "Administrators can view class records (assignments, submissions and grades). Your personal tasks and Growth Tracker are private to you.";

/** A centred card with a small logo. Used by the welcome and pending pages. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Emblem size={28} />
            <p className="text-sm font-medium text-brand">Campus Flow AI</p>
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </main>
  );
}

/**
 * Sign-in and sign-up: the logo on the left, the form on the right. On a phone the logo panel is
 * hidden and a small logo sits above the form.
 */
export function AuthSplit({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen flex-1 lg:grid-cols-2">
      <BrandPanel />
      <main className="flex flex-col items-center justify-center gap-6 p-6">
        <div className="flex items-center gap-2 lg:hidden">
          <Emblem size={40} />
          <p className="text-lg font-semibold text-brand">Campus Flow AI</p>
        </div>
        <div className="w-full max-w-sm space-y-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{title}</h1>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export function FormMessage({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success";
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "text-sm font-medium text-destructive"
          : "text-sm font-medium text-success"
      }
    >
      {children}
    </p>
  );
}

export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}
