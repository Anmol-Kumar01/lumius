import { test, expect } from "@playwright/test";
test("file tabs retain independent locations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My files" })).toBeVisible();
  await page.getByRole("button", { name: "New tab", exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: "Documents" }).dblclick();
  await expect(page.getByRole("heading", { name: /^Documents/ })).toBeVisible();
  await page.locator(".file-tabs > button").nth(0).click();
  await expect(page.getByRole("heading", { name: "My files" })).toBeVisible();
  await page.locator(".file-tabs > button").nth(1).click();
  await expect(page.getByRole("heading", { name: /^Documents/ })).toBeVisible();
});
test("desktop preview is honest, Files navigation and layout work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText(
      "Demo mode · sample files only, nothing on this computer changes",
    ),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "My files" })).toBeVisible();
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await expect(page.locator(".file-entries")).toHaveClass(/grid/);
  await page.getByRole("listitem").filter({ hasText: "Documents" }).dblclick();
  await expect(page.getByRole("heading", { name: /^Documents/ })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator(".file-tabs .current")).toContainText("Home");
  await expect(page.getByRole("heading", { name: "My files" })).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "artifacts/desktop-preview.png",
    fullPage: true,
  });
});
test("island expands, controls work, apps open Settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Expand Dynamic Island" }).click();
  await page.getByRole("button", { name: "controls", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Volume", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "apps", exact: true }).click();
  await page
    .locator(".island")
    .getByRole("button", { name: "Open Settings" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Appearance", exact: true }),
  ).toBeVisible();
});
test("Settings persist, wallpaper and accessibility settings update", async ({
  page,
}) => {
  await page.goto("/?view=settings");
  await page.getByRole("button", { name: "Use ocean wallpaper" }).click();
  await page
    .getByRole("switch", { name: "Reduce motion", exact: true })
    .check();
  await page
    .getByRole("switch", { name: "Reduce transparency", exact: true })
    .check();
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Reduce motion", exact: true }),
  ).toBeChecked();
  await expect(page.locator(".lumius")).toHaveClass(/solid/);
  await expect(page.locator(".lumius")).toHaveClass(/theme-ocean/);
  await page.screenshot({
    path: "artifacts/settings-preview.png",
    fullPage: true,
  });
});
test("demo file operations work end to end", async ({ page }) => {
  await page.goto("/");
  const row = (name: string) =>
    page.getByRole("listitem").filter({ hasText: name });
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByRole("textbox", { name: "Folder or file name" }).fill("Test");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row("Test")).toHaveCount(1);
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByRole("textbox", { name: "Folder or file name" }).fill("Test");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("already exists");
  await row("Test").click();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByRole("textbox", { name: "Folder or file name" }).fill("Demo");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row("Demo")).toHaveCount(1);
  await row("Demo").click();
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .last()
    .click();
  await expect(row("Demo")).toHaveCount(0);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "Home", exact: true }).first().click();
  await expect(row("Demo")).toHaveCount(1);
  await row("Documents").dblclick();
  await row("Welcome to Lumius.txt").click();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(row("Welcome to Lumius 2.txt")).toHaveCount(1, {
    timeout: 6000,
  });
  await row("Welcome to Lumius.txt").dblclick();
  await expect(page.locator(".preview-dialog pre")).toContainText(
    "Welcome to Lumius.",
  );
});
test("music plays from Files and the island controls it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("listitem").filter({ hasText: "Music" }).dblclick();
  await page
    .getByRole("listitem")
    .filter({ hasText: "Lumius Aurora.wav" })
    .dblclick();
  await page.getByRole("button", { name: "Expand Dynamic Island" }).click();
  await expect(page.locator(".now-playing b")).toHaveText("Lumius Aurora");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});
test("compact desktop has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My files" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "artifacts/desktop-1024.png" });
});
test("Ask shows a web answer with clickable sources", async ({ page }) => {
  await page.route("**/exa/answer", (route) =>
    route.fulfill({
      json: {
        answer:
          "Debian is a free operating system [1].\n\nIt is **stable** [2].",
        citations: [
          { url: "https://www.debian.org/intro/about", title: "About Debian" },
          { url: "https://wiki.debian.org/", title: "Debian Wiki" },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Ask a question" })
    .fill("What is Debian?");
  await page.getByRole("button", { name: "Ask", exact: true }).last().click();
  await expect(page.locator(".ask-answer")).toContainText(
    "Debian is a free operating system",
  );
  await expect(page.locator(".ask-sources li")).toHaveCount(2);
  await expect(page.getByText("debian.org", { exact: true })).toBeVisible();
});
test("Ask explains a rejected key instead of failing silently", async ({
  page,
}) => {
  await page.route("**/exa/answer", (route) => route.fulfill({ status: 401 }));
  await page.goto("/");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page
    .getByRole("button", { name: /Explain how an operating system/ })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Exa rejected the API key",
  );
});
