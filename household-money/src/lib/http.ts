import type { z } from "zod";
import { ApiError } from "./auth-guard";

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json");
  }
  const r = schema.safeParse(json);
  if (!r.success)
    throw new ApiError(400, "invalid_input", r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
}
