"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormAlert } from "@/components/form/form-alert";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { signUp } from "@/lib/api/auth-client";
import { loginHref } from "@/lib/auth/next-path";
import { navigateTo } from "@/lib/navigation";
import { applyApiError } from "@/lib/forms/apply-api-error";

/** One message for all three password constraints: the user needs the rule, not a diagnosis. */
const PASSWORD_RULE = "A senha precisa de 8 a 72 caracteres e ao menos um número.";

/**
 * US-01 — sign-up form.
 *
 * The rules mirror `RegisterRequest` in the OpenAPI spec (name/e-mail ≤ 255,
 * password 8–72 with at least one digit). Here the client *is* an authority:
 * these constraints decide what gets created.
 */
const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Informe seu nome.")
      .max(255, "O nome deve ter no máximo 255 caracteres."),
    email: z
      .string()
      .trim()
      .min(1, "Informe seu e-mail.")
      .max(255, "O e-mail deve ter no máximo 255 caracteres.")
      .pipe(z.email("Informe um e-mail válido.")),
    password: z.string().min(8, PASSWORD_RULE).max(72, PASSWORD_RULE).regex(/\d/, PASSWORD_RULE),
    confirmPassword: z.string().min(1, "Confirme sua senha."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

type RegisterValues = z.infer<typeof registerSchema>;

/** `confirmPassword` is ours, not the contract's — it never gets sent. */
const FIELDS = ["name", "email", "password"] as const;

export function RegisterForm({ next }: { next: string }) {
  const [alert, setAlert] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  async function onSubmit({ name, email, password }: RegisterValues) {
    setAlert(null);

    // The identity service issues no token on registration, so the new account
    // goes through the normal login next — and types the password once more,
    // on the identity service's page (docs/specs/21, decision 3). A full
    // navigation, not `router.push`: the login ends on another origin.
    const result = await signUp({ name, email, password });
    if (result.ok) {
      navigateTo(loginHref(next));
      return;
    }

    setAlert(
      applyApiError(result.error, {
        fields: FIELDS,
        setFieldError: (field, message) =>
          setError(field as keyof RegisterValues, { message }, { shouldFocus: true }),
      }),
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormAlert>{alert}</FormAlert>

      <TextField
        label="Nome"
        autoComplete="name"
        autoFocus
        error={errors.name?.message}
        {...register("name")}
      />

      <TextField
        label="E-mail"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />

      <TextField
        label="Senha"
        type="password"
        autoComplete="new-password"
        hint={PASSWORD_RULE}
        error={errors.password?.message}
        {...register("password")}
      />

      {/* Not in the contract: there is no password-reset endpoint, so a typo at
          sign-up would lock the account out for good. */}
      <TextField
        label="Confirmar senha"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Criando conta…" : "Criar conta"}
      </Button>
    </form>
  );
}
