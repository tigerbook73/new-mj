import { z } from "zod";

export const GameAdviceRequestSchema = z.object({}).strict();
export type GameAdviceRequest = z.infer<typeof GameAdviceRequestSchema>;

export const GameAdviceResponseSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    deadline: z.number().optional(),
    actions: z.array(z.unknown()),
    recommendedActionIndex: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.recommendedActionIndex !== undefined &&
      value.recommendedActionIndex >= value.actions.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recommendedActionIndex"],
        message: "recommendedActionIndex must reference actions",
      });
    }
  });
export type GameAdviceResponse = z.infer<typeof GameAdviceResponseSchema>;
