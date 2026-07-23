import { test, expect, type Page } from "@playwright/test";
import { agentStreamBody } from "./helpers";

// Desktop layout guards — chiefly the shared-hook refactors (useAgentConversation,
// useSimClock, pickPassPool) still work on the desktop shell.

async function gotoDesktop(page: Page) {
  await page.goto("/");
  await expect(page.locator(".ops-root")).toBeVisible();
  // dataset loaded → catalog populated
  await expect(page.locator(".ops-list-row").first()).toBeVisible();
}

test("renders the three-zone desktop shell (not the mobile layout)", async ({ page }) => {
  await gotoDesktop(page);
  await expect(page.locator(".ops-topbar")).toContainText("SATCOM·OPS");
  await expect(page.locator(".ops-left")).toBeVisible();
  await expect(page.locator(".ops-center")).toBeVisible();
  await expect(page.locator(".ops-right")).toBeVisible();
  await expect(page.locator(".ops-scrubber")).toBeVisible();
  await expect(page.locator(".m-tabs")).toHaveCount(0); // mobile shell absent
});

test("agent (shared useAgentConversation) streams an answer", async ({ page }) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: agentStreamBody() }),
  );
  await gotoDesktop(page);
  await page.locator(".ops-list-row").first().click();
  await page.getByRole("button", { name: "QUERY THIS SATELLITE" }).click();
  await expect(page.locator(".agent-suggest .ops-pill").first()).toBeVisible();
  await page.getByPlaceholder(">> ask about this satellite").fill("what is this?");
  await page.getByRole("button", { name: "SEND" }).click();
  await expect(page.locator(".agent-thread")).toContainText("low Earth orbit");
});

test("timeline (shared useSimClock) enters sim mode and resets to LIVE", async ({ page }) => {
  await gotoDesktop(page);
  const scrubber = page.locator(".ops-scrubber");
  await expect(scrubber.locator(".telem-v")).toHaveText("LIVE");
  await scrubber.getByRole("button", { name: "4×", exact: true }).click();
  await expect(scrubber.locator(".ops-speed button.on")).toHaveText("4×");
  await expect(scrubber.locator(".telem-v")).not.toHaveText("LIVE");
  await scrubber.getByRole("button", { name: "NOW", exact: true }).click();
  await expect(scrubber.locator(".telem-v")).toHaveText("LIVE");
});

test("passes panel (shared pickPassPool) renders without error", async ({ page }) => {
  await gotoDesktop(page);
  await expect(page.getByText("Upcoming passes")).toBeVisible();
  // fleet fallback via pickPassPool → either passes render or the empty message
  await expect(page.locator(".ops-passes")).toBeVisible();
});
