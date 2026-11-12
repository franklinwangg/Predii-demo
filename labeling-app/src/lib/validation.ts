import { z } from "zod";

export const datasetInput = z.object({
  name: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(80).default("NHTSA"),
  vehicleMake: z.string().trim().min(1).max(80),
  vehicleModel: z.string().trim().min(1).max(80),
  vehicleYear: z.number().int().min(1949).max(new Date().getFullYear() + 2),
  labelSchemaId: z.string().min(1).optional(),
});

export const annotationInput = z.object({
  labelId: z.string().min(1),
  exactText: z.string().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
  createdBy: z.string().trim().min(1).max(120).default("local-labeler"),
  createdByType: z.enum(["HUMAN", "AI"]).default("HUMAN"),
  status: z.enum(["PROPOSED", "ACCEPTED", "REJECTED"]).default("ACCEPTED"),
});

export const annotationBatchInput = z.object({
  annotations: z.array(annotationInput).max(500),
});

export const annotationPatchInput = z.object({
  labelId: z.string().min(1).optional(),
  status: z.enum(["PROPOSED", "ACCEPTED", "REJECTED"]).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Provide a labelId or status to update.",
});
