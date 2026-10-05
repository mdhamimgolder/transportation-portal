import { z } from "zod";

/** Spec password policy: min 8 chars, 1 uppercase letter, 1 number. */
export const newPasswordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter")
  .regex(/[0-9]/, "Password must include at least one number");

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z
  .object({
    newPassword: newPasswordField,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Missing reset token").max(256, "Invalid reset token"),
    newPassword: newPasswordField,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const selfChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: newPasswordField,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const routePlanIdSchema = z.string().trim().min(1).max(128);

export const analyzeRoutePlanOptionsSchema = z
  .object({ force: z.boolean().optional() })
  .strict()
  .optional();

const routeCoordinateSchema = z.tuple([
  z.number().finite().min(-90).max(90),
  z.number().finite().min(-180).max(180),
]);

const routeViaPointSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  })
  .strict();

export const manualRouteGeometrySchema = z
  .object({
    routePlanId: routePlanIdSchema,
    geometry: z.array(routeCoordinateSchema).min(2).max(10_000),
    viaPoints: z.array(routeViaPointSchema).max(100),
    totals: z
      .object({
        minutes: z.number().finite().min(0).max(24 * 60),
        km: z.number().finite().min(0).max(1_000),
      })
      .strict(),
  })
  .strict();

export const roadPathRequestSchema = z
  .object({
    points: z
      .array(
        z.tuple([
          z.number().finite().min(-90).max(90),
          z.number().finite().min(-180).max(180),
        ])
      )
      .min(2)
      .max(100),
    constrainBearings: z.boolean().optional(),
    overview: z.enum(["full", "simplified"]).optional(),
  })
  .strict();

const pickupPointTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use a valid 24-hour time (HH:mm).");

export const createPickupPointSchema = z
  .object({
    vehicleId: z.string().trim().min(1).max(128),
    addressId: z.string().trim().min(1).max(128),
    name: z.string().trim().min(1).max(200),
    sequence: z.number().int().min(1).max(1000),
    baseETA: pickupPointTimeSchema.optional(),
  })
  .strict();

export const updatePickupPointSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    name: z.string().trim().min(1).max(200).optional(),
    sequence: z.number().int().min(1).max(1000).optional(),
    baseETA: pickupPointTimeSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const bulkPickupPointCoordinatesSchema = z
  .array(
    z
      .object({
        pickupPoint: z.string().trim().min(1).max(200),
        coordinates: z.string().trim().min(1).max(80),
      })
      .strict()
  )
  .min(1)
  .max(500);

export const fixedArrivalServiceInputSchema = z
  .object({
    active: z.boolean().optional(),
    arrivalTime: z.string().trim().max(24).nullable().optional(),
  })
  .strict()
  .refine((input) => input.active !== undefined || input.arrivalTime !== undefined, {
    message: "Choose a service setting to update.",
  });
