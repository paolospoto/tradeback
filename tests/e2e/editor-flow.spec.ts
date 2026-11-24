import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Request } from "@playwright/test";
import { loadSave } from "../../lib/save/gen4/sav4";

const FIXTURES = join(import.meta.dirname, "../fixtures");
const ALLOWED_HOSTS = ["127.0.0.1", "raw.githubusercontent.com", "fonts.gstatic.com", "fonts.googleapis.com"];

/** Records every request that leaves the page and could carry data. */
function watchNetwork(page: import("@playwright/test").Page) {
  const requests: Request[] = [];
  page.on("request", (r) => requests.push(r));
  return {
    offenders: () =>
      requests.filter((r) => {
        const url = new URL(r.url());
        if (url.protocol === "blob:" || url.protocol === "data:") return false;
        return (
          r.method() !== "GET" || !ALLOWED_HOSTS.includes(url.hostname) || (r.postData() ?? "").length > 0
        );
      }),
  };
}

test.describe("editor flow", () => {
  // The help wizard opens on the first visit only: mark it as seen.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("tradeback:help-seen", "1"));
  });

  test("evolves Pokémon end to end without sending the file anywhere", async ({ page }) => {
    const net = watchNetwork(page);
    await page.goto("/");

    await page.getByTestId("save-input").setInputFiles(join(FIXTURES, "platinum-demo.sav"));
    await expect(page.getByTestId("trainer-name")).toHaveText("PAOLO");
    await expect(page.getByTestId("evolvable-count")).toContainText("10");
    await expect(page.getByTestId("evolve-button")).toBeDisabled();

    // Party Haunter with a nickname: one tap selects it.
    const haunter = page.getByTestId("slot-party-0");
    await expect(haunter).toContainText("Fantasmino");
    await haunter.click();
    await expect(haunter).toHaveAttribute("aria-pressed", "true");

    // Machoke with an Everstone is shown but blocked.
    await expect(page.getByTestId("slot-party-4").getByTestId("block-reason")).toContainText("Everstone");

    // Clamperl holding the Deep Sea Scale (box 1, slot 2): item consumed, Gorebyss.
    const clamperl = page.getByTestId("slot-box-0-1");
    await expect(clamperl).toContainText("Gorebyss");
    await expect(clamperl).toContainText("Deep Sea Scale");
    await clamperl.click();

    // A second tap deselects.
    await page.getByTestId("slot-box-0-0").click();
    await page.getByTestId("slot-box-0-0").click();

    await expect(page.getByTestId("evolve-button")).toHaveText("Evolve 2");
    await page.getByTestId("evolve-button").click();

    await expect(page.getByTestId("evolution-animation")).toBeVisible();
    await page.getByTestId("animation-skip").click();

    await expect(page.getByTestId("download")).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-link").click(),
    ]);
    expect(download.suggestedFilename()).toBe("platinum-demo_evolved.sav");
    const bytes = new Uint8Array(readFileSync((await download.path())!));
    const save = loadSave(bytes);
    expect(save.party[0]!.info.species).toBe(94);
    expect(save.party[0]!.info.nickname).toBe("Fantasmino");
    expect(save.boxes[0]!.slots[1]!.info.species).toBe(368);
    expect(save.boxes[0]!.slots[1]!.info.heldItem).toBe(0);
    expect(save.boxes[0]!.slots[0]!.info.species).toBe(366);

    expect(net.offenders().map((r) => `${r.method()} ${r.url()}`)).toEqual([]);
  });

  for (const [file, name] of [
    ["diamond-pearl.sav", "Diamond/Pearl"],
    ["heartgold-soulsilver.sav", "HeartGold/SoulSilver"],
  ] as const) {
    test(`opens a ${name} save and shows the game name`, async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("save-input").setInputFiles(join(FIXTURES, file));
      await expect(page.getByTestId("game-name")).toContainText(name);
      await expect(page.getByTestId("evolvable-count")).toContainText("4");
    });
  }

  test("opens an Emerald save and a FireRed/LeafGreen save without the National Pokédex", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("save-input").setInputFiles(join(FIXTURES, "emerald.sav"));
    await expect(page.getByTestId("game-name")).toContainText("Emerald");
    await expect(page.getByTestId("evolvable-count")).toContainText("4");
    await page.goto("/");
    await page.getByTestId("save-input").setInputFiles(join(FIXTURES, "firered-leafgreen.sav"));
    await expect(page.getByTestId("game-name")).toContainText("FireRed");
    await expect(page.getByTestId("block-reason").first()).toContainText("National Pokédex");
  });

  for (const [file, name, count] of [
    ["red-blue.sav", "Red/Blue", "2"],
    ["crystal.sav", "Crystal", "3"],
  ] as const) {
    test(`opens a ${name} save`, async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("save-input").setInputFiles(join(FIXTURES, file));
      await expect(page.getByTestId("game-name")).toContainText(name);
      await expect(page.getByTestId("evolvable-count")).toContainText(count);
    });
  }

  test("Karrablast and Shelmet are selected together", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("save-input").setInputFiles(join(FIXTURES, "black-white.sav"));
    await expect(page.getByTestId("game-name")).toContainText("Black/White");
    await expect(page.getByTestId("evolvable-count")).toContainText("4");
    await page.getByTestId("slot-party-0").click();
    await expect(page.getByTestId("slot-box-0-0")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("evolve-button")).toHaveText("Evolve 2");
    await page.getByTestId("slot-box-0-0").click();
    await expect(page.getByTestId("slot-party-0")).toHaveAttribute("aria-pressed", "false");
  });

  test("rejects a corrupt save", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("save-input").setInputFiles(join(FIXTURES, "platinum-corrupt.sav"));
    await expect(page.getByTestId("load-error")).toBeVisible();
  });

  test("names no game before a save is loaded, and shows the recognised one after", async ({ page }) => {
    await page.goto("/");
    const before = await page.locator("body").innerText();
    expect(before).not.toMatch(/Platinum|Diamond|Emerald|FireRed|Black|Ruby|Crystal|HeartGold/);
    await page.getByTestId("save-input").setInputFiles(join(FIXTURES, "platinum-demo.sav"));
    await expect(page.getByTestId("game-name")).toHaveText(/Platinum/);
  });

  test("select all picks every evolvable Pokémon", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("save-input").setInputFiles(join(FIXTURES, "platinum-demo.sav"));
    await page.getByTestId("select-all").click();
    await expect(page.getByTestId("evolve-button")).toHaveText("Evolve 10");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("shows the empty state when nothing can evolve", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("save-input").setInputFiles(join(FIXTURES, "platinum-none.sav"));
    await expect(page.getByTestId("no-candidates")).toBeVisible();
  });
});

test.describe("help wizard", () => {
  test("opens on the first visit, can be skipped and reopened with ?", async ({ page }) => {
    await page.goto("/");
    const wizard = page.getByTestId("help-wizard");
    await expect(wizard).toBeVisible();
    await expect(wizard).toContainText("Haunter");
    await page.getByTestId("help-skip").click();
    await expect(wizard).toBeHidden();

    // Second visit: stays closed.
    await page.reload();
    await expect(page.getByTestId("save-input")).toBeAttached();
    await expect(wizard).toBeHidden();

    await page.getByTestId("help-button").click();
    for (let i = 0; i < 2; i++) await page.getByTestId("help-next").click();
    await expect(wizard).toContainText("Gengar");
    await page.getByTestId("help-next").click();
    await expect(wizard).toBeHidden();
  });
});
