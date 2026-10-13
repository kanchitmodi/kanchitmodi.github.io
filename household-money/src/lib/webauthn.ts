import { env } from "./env";

export const RP_NAME = "Household Money";

export function rp(): { rpID: string; origin: string } {
  const url = new URL(env().APP_URL);
  return { rpID: url.hostname, origin: url.origin };
}
