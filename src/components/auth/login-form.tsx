"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormAlert } from "@/components/auth/form-alert";
import { TextField } from "@/components/auth/text-field";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/api/auth-client";
import { applyApiError } from "@/lib/forms/apply-api-error";

/**
 * US-02 — sign-in form.
 *
 * The password is checked for presence only, never for strength. The server is
 * the authority on whether a credential is valid, and re-stating the policy on a
 * public page both leaks it and drifts the day the backend changes it
 * (docs/specs/16-auth-pages.md).
 */
const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Informe seu e-mail.")
    .pipe(z.email("Informe um e-mail válido.")),
  password: z.string().min(1, "Informe sua senha."),
});

type LoginValues = z.infer<typeof loginSchema>;

const FIELDS = ["email", "password"] as const;

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [alert, setAlert] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setAlert(null);

    const result = await signIn(values);
    if (result.ok) {
      router.replace(next);
      // The destination renders on the server. Without this the Router Cache can
      // serve a copy rendered while we were still signed out.
      router.refresh();
      return;
    }

    setAlert(
      applyApiError(result.error, {
        fields: FIELDS,
        setFieldError: (field, message) =>
          setError(field as keyof LoginValues, { message }, { shouldFocus: true }),
      }),
    );
  }

  return (
    // `noValidate`: zod owns validation. The browser's native bubbles cannot be
    // translated or styled, and differ between browsers.
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormAlert>{alert}</FormAlert>

      <TextField
        label="E-mail"
        type="email"
        autoComplete="email"
        autoFocus
        error={errors.email?.message}
        {...register("email")}
      />

      <TextField
        label="Senha"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
