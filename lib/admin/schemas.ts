import { z } from "zod";

export const LimitsBody = z.object({
  freeVoicesOnly: z.boolean(),
  monthlyAudioMinutes: z.number().int().min(0).max(100000).nullable(),
  maxBooks: z.number().int().min(0).max(1000).nullable(),
  note: z.string().max(200).optional(),
});
export const CreateGuestBody = LimitsBody.extend({ email: z.email(), password: z.string().min(8).max(72) });
