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
      "Design preview · native Linux build required for system actions",
    ),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "My files" })).toBeVisible();
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await expect(page.locator(".file-entries")).toHaveClass(/grid/);
  await page.getByRole("listitem").filter({ hasText: "Documents" }).dblclick();
  await expect(page.getByRole("heading", { name: /^Documents/ })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator('.file-tabs .current')).toContainText('Home');
  await expect(page.getByRole("heading", { name: "My files" })).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "artifacts/desktop-preview.png",
    fullPage: true,
  });
});
test("island expands, controls show unsupported state, apps open Settings", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Expand Dynamic Island" }).click();
  await page.getByRole("button", { name: "controls", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Volume", exact: true }),
  ).toBeDisabled();
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
test("preview mutations fail visibly, no fake file creation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByRole("textbox", { name: "Folder or file name" }).fill("Test");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "requires the native Lumius session",
  );
  await expect(
    page.getByRole("listitem").filter({ hasText: "Test" }),
  ).toHaveCount(0);
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
