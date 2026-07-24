import { test, expect, type Page } from "@playwright/test";
import { agentStreamBody } from "./helpers";

/** Wait for the mobile shell to be mounted and the dataset to have loaded. */
async function gotoMobile(page: Page) {
  await page.goto("/");
  await expect(page.locator(".m-root")).toBeVisible();
  await expect(page.locator(".m-tabs")).toBeVisible();
  // dataset loaded → clock line shows a "n / total" tracked count
  await expect(page.locator(".m-clockline")).toContainText("/");
}

const tab = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

/** Open the catalog and select the first satellite → returns to globe + InfoSheet. */
async function selectFirstSat(page: Page) {
  await tab(page, "CATALOG").click();
  await expect(page.locator(".m-panel")).toBeVisible();
  await page.locator(".m-list-row").first().click();
  await expect(page.locator(".m-sheet")).toBeVisible();
}

test.describe("mobile — core nav & selection", () => {
  test("renders the mobile shell, not the desktop layout", async ({ page }) => {
    await gotoMobile(page);
    await expect(page.getByText("SATCOM·OPS")).toBeVisible();
    await expect(page.locator(".ops-body")).toHaveCount(0); // desktop shell absent
    for (const t of ["GLOBE", "CATALOG", "PASSES", "AGENT"]) {
      await expect(tab(page, t)).toBeVisible();
    }
  });

  test("selecting from the catalog opens the InfoSheet and updates the HUD", async ({ page }) => {
    await gotoMobile(page);
    await expect(page.locator(".m-hud.tr")).toContainText("WIDE"); // nothing selected yet
    await selectFirstSat(page);
    await expect(page.locator(".m-hud.tr")).toContainText("SEL"); // HUD reflects selection
    await expect(page.locator(".m-sheet-title .name")).not.toBeEmpty();
  });

  test("tapping the globe above a panel dismisses it", async ({ page }) => {
    await gotoMobile(page);
    await tab(page, "CATALOG").click();
    await expect(page.locator(".m-panel")).toBeVisible();
    await page.locator(".m-dismiss").click();
    await expect(page.locator(".m-panel")).toHaveCount(0);
  });

  test("the panel × closes back to the globe", async ({ page }) => {
    await gotoMobile(page);
    await tab(page, "PASSES").click();
    await expect(page.locator(".m-panel")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.locator(".m-panel")).toHaveCount(0);
  });
});

test.describe("mobile — panels", () => {
  test("catalog filters update the count, badge and CLEAR control", async ({ page }) => {
    await gotoMobile(page);
    await tab(page, "CATALOG").click();
    const header = page.locator(".m-panel-h .right");
    const before = await header.textContent();
    await page.getByRole("button", { name: "LEO", exact: true }).click();
    await expect(page.locator(".m-tab-badge")).toHaveText("1");
    await expect(page.getByText(/CLEAR · 1/)).toBeVisible();
    await expect(header).not.toHaveText(before ?? "");
    await page.getByText(/CLEAR · 1/).click();
    await expect(page.locator(".m-tab-badge")).toHaveCount(0);
  });

  test("InfoSheet expands, lights up INFO, reveals the TLE and scrolls", async ({ page }) => {
    await gotoMobile(page);
    await selectFirstSat(page);
    await page.getByRole("button", { name: "INFO", exact: true }).click();
    await expect(page.getByRole("button", { name: "INFO", exact: true })).toHaveClass(/\bon\b/);
    await expect(page.getByText("Ground track")).toBeVisible();
    await page.getByRole("button", { name: "TLE", exact: true }).click();
    await expect(page.locator(".m-tle pre")).toContainText(/^\s*1 /);
    // the sheet body is actually scrollable (validates min-height:0)
    const scrollable = await page.locator(".m-sheet-scroll").evaluate(
      (el) => el.scrollHeight > el.clientHeight + 1,
    );
    expect(scrollable).toBe(true);
  });

  test("passes panel shows the observer editor", async ({ page }) => {
    await gotoMobile(page);
    await tab(page, "PASSES").click();
    await expect(page.getByText("Upcoming passes")).toBeVisible();
    // toggle the observer editor open
    await page.locator(".m-panel-h .m-clear").first().click();
    await expect(page.locator(".m-obs")).toBeVisible();
    await expect(page.locator(".m-obs-row input")).toHaveCount(3);
  });

  test("search filters and selecting a result opens it on the globe", async ({ page }) => {
    await gotoMobile(page);
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByPlaceholder(">> search id or name").fill("starlink");
    const firstResult = page.locator(".m-search-row").first();
    await expect(firstResult).toContainText(/STARLINK/i);
    await firstResult.click();
    await expect(page.locator(".m-search-ov")).toHaveCount(0);
    await expect(page.locator(".m-sheet-title .name")).toContainText(/STARLINK/i);
  });

  test("pinning a satellite surfaces it in the compare tray", async ({ page }) => {
    await gotoMobile(page);
    await selectFirstSat(page);
    await page.getByRole("button", { name: "PIN", exact: true }).click();
    await expect(page.getByRole("button", { name: "PINNED", exact: true })).toBeVisible();
    await page.locator(".m-sheet-x").click(); // close the sheet
    await expect(page.locator(".m-tray")).toBeVisible();
    await expect(page.locator(".m-tray-card")).toHaveCount(1);
  });
});

test.describe("mobile — timeline & sim", () => {
  test("the sim pill opens the timeline; speed enters sim mode; LIVE resets", async ({ page }) => {
    await gotoMobile(page);
    await page.locator(".m-simpill").click();
    await expect(page.locator(".m-timeline")).toBeVisible();
    await expect(page.locator(".m-timeline .m-panel-h")).toContainText("LIVE");
    await page.getByRole("button", { name: "64×", exact: true }).click();
    await expect(page.locator(".m-tl-speed button.on")).toHaveText("64×");
    await expect(page.locator(".m-timeline .m-panel-h")).not.toContainText("SIM LIVE");
    await page.getByRole("button", { name: "LIVE", exact: true }).click();
    await expect(page.locator(".m-timeline .m-panel-h")).toContainText("SIM LIVE");
  });
});

test.describe("mobile — agent", () => {
  test("QUERY opens the agent; a stubbed answer streams in and the thread scrolls", async ({ page }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: agentStreamBody() }),
    );
    await gotoMobile(page);
    await selectFirstSat(page);
    await page.getByRole("button", { name: /QUERY THIS SATELLITE/ }).click();
    await expect(page.locator(".m-panel-h")).toContainText("Agent ·");

    await page.getByPlaceholder(">> ask about this satellite").fill("what is this?");
    await page.getByRole("button", { name: "SEND", exact: true }).click();

    await expect(page.locator(".m-turn.user")).toContainText("what is this?");
    await expect(page.locator(".m-turn.assistant")).toContainText("low Earth orbit");
    const thread = page.locator(".m-thread");
    expect(await thread.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true);

    // Regression: scrolling up must stick. The panel re-renders ~4x/sec from the
    // clock tick, and previously yanked the thread back to the bottom each time.
    await thread.evaluate((el) => { el.scrollTop = 0; });
    await page.waitForTimeout(700); // past 2+ clock ticks
    expect(await thread.evaluate((el) => el.scrollTop)).toBeLessThan(20);
  });
});
