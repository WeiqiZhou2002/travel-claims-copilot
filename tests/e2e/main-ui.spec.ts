import { expect, test, type Page } from "./offline-test";

async function submit(page: Page, message: string): Promise<void> {
  await page.getByLabel("Your answer").fill(message);
  await page.getByRole("button", { name: /Start intake|Continue/ }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("starts with an empty answer and the established guided-intake UI", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: "Build the case file before making the ask." })
  ).toBeVisible();
  await expect(page.getByLabel("Your answer")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Start intake" })).toBeDisabled();
});

test("completes a Marriott hotel-walk analysis", async ({ page }) => {
  await submit(
    page,
    "I have a confirmed Marriott reservation booked directly, but the hotel had no room when I arrived."
  );

  await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();
  await expect(page.getByText("Hotel walk", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ultimate Reservation Guarantee" })).toBeVisible();
});

test("handles an unavailable airline reason without repeating the question", async ({ page }) => {
  await submit(
    page,
    "My Air France flight from Paris to New York was cancelled. I was rerouted and reached my final destination four hours late."
  );
  await expect(page.getByText("What reason did the airline give?", { exact: true })).toBeVisible();

  await submit(page, "I don't know the reason.");

  await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();
  await expect(page.getByText(/EU261/).first()).toBeVisible();
  await expect(page.getByText("What reason did the airline give?", { exact: true })).toHaveCount(1);
});

test("keeps a Chicago to China United cancellation outside EU261", async ({ page }) => {
  await submit(
    page,
    "My United flight from Chicago to Beijing was cancelled. I am at the airport and no reason was given."
  );

  await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();
  await expect(page.getByText("EU261", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/US DOT REFUND/).first()).toBeVisible();
});

test("completes a US involuntary denied-boarding analysis", async ({ page }) => {
  await submit(
    page,
    "My American Airlines flight from JFK to LAX was oversold and I was involuntarily denied boarding."
  );
  await expect(
    page.getByText(
      "Is the trip completed, are you at the airport or already traveling, or have you not departed yet?",
      { exact: true }
    )
  ).toBeVisible();

  await submit(page, "I am at the airport.");

  await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();
  await expect(
    page.getByText("Denied boarding or voluntary bump", { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByText(/US DOT DENIED BOARDING/).first()).toBeVisible();
});
