// Disclosure helpers for the M6A reference interface. Scenario actions,
// provider selection, and detailed tables live behind native <details>
// disclosures; tests open the real control first, never a hidden shortcut.
import type { Page } from "@playwright/test";

export async function openAncestorDetails(page: Page, testId: string): Promise<void> {
  const target = page.getByTestId(testId);
  for (const details of await target.locator("xpath=ancestor::details").all()) {
    if ((await details.getAttribute("open")) === null) {
      await details.locator("summary").first().click();
    }
  }
}

export async function clickOpen(page: Page, testId: string): Promise<void> {
  await openAncestorDetails(page, testId);
  await page.getByTestId(testId).click();
}

export async function openDetails(page: Page, detailsTestId: string): Promise<void> {
  const details = page.getByTestId(detailsTestId);
  if ((await details.getAttribute("open")) === null) {
    await details.locator("summary").first().click();
  }
}
