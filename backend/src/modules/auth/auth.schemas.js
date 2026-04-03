import { z } from "zod";

const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[0-9]/, "Password must contain a number");

export const signupSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email("Valid email is required"),
    password: strongPassword,
    departmentCode: z.string().min(2, "Department code is required")
  }),
  params: z.object({}),
  query: z.object({})
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email("Valid email is required"),
    password: z.string().min(1, "Password is required")
  }),
  params: z.object({}),
  query: z.object({})
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email("Valid email is required")
  }),
  params: z.object({}),
  query: z.object({})
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Reset token is required"),
    password: strongPassword
  }),
  params: z.object({}),
  query: z.object({})
});