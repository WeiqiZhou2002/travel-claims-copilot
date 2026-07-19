import { expect, type Page } from "@playwright/test";

const DEFAULT_CLAIM_MESSAGE =
  "My flight was cancelled, and I arrived the next day after paying for a hotel.";

export async function runReadyClaim(page: Page, message = DEFAULT_CLAIM_MESSAGE): Promise<void> {
  await page.getByTestId("claim-message").fill(message);
  await page.getByRole("button", { name: "Analyze claim" }).click();
  const result = page.getByTestId("analysis-result");
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute("aria-busy", "false");
}
