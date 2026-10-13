import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { createPreview, ImportError } from "@/lib/import/service";
import { MAX_FILE_BYTES } from "@/lib/import/detect";

/** Upload a CSV/PDF -> parsed preview (nothing is saved to transactions yet; the file isn't stored). */
export const POST = apiHandler(async (req: Request) => {
  const { viewer } = await requireApiAuth();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "no_file", "Choose a CSV or PDF file.");
  if (file.size > MAX_FILE_BYTES) throw new ApiError(400, "too_large", "File is larger than 5 MB.");
  const accountId = form?.get("accountId");
  try {
    const preview = await createPreview(
      db,
      viewer,
      { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
      typeof accountId === "string" && accountId ? accountId : undefined,
    );
    return NextResponse.json(preview);
  } catch (e) {
    if (e instanceof ImportError)
      throw new ApiError(e.code === "forbidden" ? 403 : 400, e.code, e.message);
    throw e;
  }
});
