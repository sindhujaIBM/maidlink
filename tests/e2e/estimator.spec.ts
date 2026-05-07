/**
 * Playwright E2E tests — Estimator flow (/estimate)
 *
 * All backend API calls are intercepted via page.route() — no real AWS
 * services or Lambda functions needed; only the Vite frontend must be running.
 *
 * Run:      npx playwright test
 * UI mode:  npx playwright test --ui
 * Debug:    npx playwright test estimator --debug
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import { injectAuth } from './helpers/auth';

// ── Test image fixture ────────────────────────────────────────────────────────

// 1×1 white PNG — smallest valid image that createImageBitmap + canvas accept.
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function tinyImageFiles(count: number): { name: string; mimeType: string; buffer: Buffer }[] {
  const buf = Buffer.from(TINY_PNG_B64, 'base64');
  return Array.from({ length: count }, (_, i) => ({
    name:     `photo-${i + 1}.png`,
    mimeType: 'image/png',
    buffer:   buf,
  }));
}

// ── Mock API responses ────────────────────────────────────────────────────────

const MOCK_S3_URL = 'http://mock-s3.test/estimator-photos/e2e/test.jpg';

const MOCK_ANALYSIS = {
  overallCondition:    'average',
  matchesSelfReport:   true,
  conditionAssessment: 'The home is in average condition with normal wear throughout.',
  roomBreakdown: [
    { room: 'Bedroom 1', condition: 'average', estimatedMinutes: 30, notes: 'Normal.', priorityTasks: ['Dust surfaces'] },
  ],
  oneCleanerHours:    2.5,
  twoCleanerHours:    1.5,
  generatedChecklist: [
    { room: 'Bedroom 1', tasks: [{ task: 'Dust surfaces', priority: 'standard' }] },
  ],
};

/**
 * Intercepts all estimator-related API routes.
 *
 * `failFirstN` — number of initial presigned-URL requests to reject with 503.
 * The widget has one built-in auto-retry per photo, so to actually reach the
 * "failed" UI state you need failFirstN >= 2 (exhausts both attempts).
 * Set failFirstN >= 3 if you also want the user-triggered Retry to fail.
 */
async function mockApis(page: Page, { failFirstN = 0 } = {}): Promise<void> {
  let uploadCalls = 0;

  await page.route('**/api/users/users/me/estimator-photo-upload-url', async (route: Route) => {
    uploadCalls++;
    if (uploadCalls <= failFirstN) {
      await route.fulfill({ status: 503, body: 'Service Unavailable' });
      return;
    }
    await route.fulfill({
      status:      200,
      contentType: 'application/json',
      body:        JSON.stringify({ data: { uploadUrl: MOCK_S3_URL, s3Key: 'estimator-photos/e2e/test.jpg' } }),
    });
  });

  // S3 PUT — accept any request to the fake S3 URL
  await page.route('http://mock-s3.test/**', route => route.fulfill({ status: 200, body: '' }));

  // AI analysis endpoint
  await page.route('**/api/users/users/me/estimator/analyze', route =>
    route.fulfill({
      status:      200,
      contentType: 'application/json',
      body:        JSON.stringify({ data: { analysis: MOCK_ANALYSIS } }),
    }),
  );
}

// ── Page helpers ──────────────────────────────────────────────────────────────

async function gotoEstimator(page: Page): Promise<void> {
  await page.goto('/estimate');
  await expect(page.getByText('Tell us about your home')).toBeVisible();
}

/**
 * From step 0: reduce to 1 bedroom, 0 bathrooms, then continue to step 1
 * and toggle Kitchen + Living Room OFF so there is exactly 1 room (Bedroom 1).
 */
async function goToStep1WithOneRoom(page: Page): Promise<void> {
  // Bedrooms: 2 → 1 (one click on −)
  await page.getByTestId('stepper-bedrooms-dec').click();

  // Bathrooms: 1 → 0.5 → 0 (two clicks on −)
  await page.getByTestId('stepper-bathrooms-dec').click();
  await page.getByTestId('stepper-bathrooms-dec').click();

  await page.getByRole('button', { name: /Continue to room photos/i }).click();
  await expect(page.getByText('Rooms to capture', { exact: false })).toBeVisible();

  // Toggle off Kitchen and Living Room (both are on by default)
  const kitchenToggle = page.getByTestId('toggle-kitchen');
  if (await kitchenToggle.isVisible()) await kitchenToggle.click();

  const livingToggle = page.getByTestId('toggle-living');
  if (await livingToggle.isVisible()) await livingToggle.click();

  // With 1 bedroom buildRoomList uses the singular "Bedroom" (no number suffix)
  await expect(page.getByRole('button', { name: /^Bedroom/i })).toBeVisible();
}

/** Click the gallery Upload button and set files on the hidden file input. */
async function uploadPhotos(page: Page, count: number): Promise<void> {
  await page.getByTestId('gallery-upload-btn').click();
  await page.locator('input[type="file"]').setInputFiles(tinyImageFiles(count));
}

/** Wait until `count` thumbnails show the × remove button (i.e. uploaded successfully). */
async function waitForUploaded(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await expect(page.locator('button', { hasText: '×' }).nth(i)).toBeVisible({ timeout: 15_000 });
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('unauthenticated user', () => {
  test('shows a sign-in prompt when photos step is reached without a session', async ({ page }) => {
    await page.goto('/estimate');
    await expect(page.getByText('Tell us about your home')).toBeVisible();
    await page.getByRole('button', { name: /Continue to room photos/i }).click();

    // The widget renders a "Sign in with Google" button for unauthenticated users
    await expect(page.getByRole('button', { name: /Sign in with Google/i })).toBeVisible();
  });
});

test.describe('step 0 → step 1 navigation', () => {
  test('advances to the photos step when Continue is clicked', async ({ page }) => {
    await injectAuth(page);
    await mockApis(page);
    await gotoEstimator(page);

    await page.getByRole('button', { name: /Continue to room photos/i }).click();

    await expect(page.getByText('Rooms to capture', { exact: false })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeAttached();
  });

  test('bedroom stepper decrements the value', async ({ page }) => {
    await injectAuth(page);
    await gotoEstimator(page);

    // Default is 2 — one click should show 1
    await page.getByTestId('stepper-bedrooms-dec').click();
    const dec = page.getByTestId('stepper-bedrooms-dec');
    await expect(dec.locator('xpath=../span')).toHaveText('1');
  });
});

test.describe('photo upload', () => {
  test('uploaded photos appear as thumbnails and enable the Analyse button', async ({ page }) => {
    await injectAuth(page);
    await mockApis(page);
    await gotoEstimator(page);
    await goToStep1WithOneRoom(page);

    await uploadPhotos(page, 2);
    await waitForUploaded(page, 2);

    // With 1 room and 2 uploaded photos the Analyse button should be enabled
    await expect(page.getByRole('button', { name: /Analyse.*photo.*AI/i })).toBeEnabled({ timeout: 5_000 });
  });

  test('a failed upload shows the red Retry overlay on the thumbnail', async ({ page }) => {
    await injectAuth(page);
    // failFirstN: 2 exhausts both the original attempt and the widget's auto-retry
    await mockApis(page, { failFirstN: 2 });
    await gotoEstimator(page);
    await goToStep1WithOneRoom(page);

    await uploadPhotos(page, 1);

    // After both internal attempts fail, the red Retry overlay appears
    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible({ timeout: 20_000 });
  });

  test('clicking Retry on a failed thumbnail recovers the upload', async ({ page }) => {
    await injectAuth(page);
    // First 2 calls fail (original + auto-retry); 3rd call (user Retry) succeeds
    await mockApis(page, { failFirstN: 2 });
    await gotoEstimator(page);
    await goToStep1WithOneRoom(page);

    await uploadPhotos(page, 1);

    // Wait for failure state
    const retryBtn = page.getByRole('button', { name: /Retry/i });
    await expect(retryBtn).toBeVisible({ timeout: 20_000 });

    // Tap retry — the mock now returns 200 (first-fail flag already consumed)
    await retryBtn.click();

    // × remove button appears → upload succeeded
    await expect(page.locator('button', { hasText: '×' }).first()).toBeVisible({ timeout: 15_000 });
    await expect(retryBtn).not.toBeVisible();
  });

  test('Analyse button stays disabled while an upload is in flight', async ({ page }) => {
    await injectAuth(page);
    await gotoEstimator(page);
    await goToStep1WithOneRoom(page);

    // Block the presigned-URL endpoint indefinitely to simulate a slow upload
    let unblock: () => void;
    const blocked = new Promise<void>(r => { unblock = r; });

    await page.route('**/api/users/users/me/estimator-photo-upload-url', async route => {
      await blocked;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { uploadUrl: MOCK_S3_URL, s3Key: 'estimator-photos/e2e/test.jpg' } }),
      });
    });
    await page.route('http://mock-s3.test/**', r => r.fulfill({ status: 200, body: '' }));

    await uploadPhotos(page, 1);

    // While the upload is pending, the button should be disabled
    await expect(page.getByRole('button', { name: /Analyse|still need/i }).first()).toBeDisabled({ timeout: 3_000 });

    unblock!();
  });
});

test.describe('full happy path', () => {
  test('uploads photos, triggers analysis, and renders the AI result card', async ({ page }) => {
    await injectAuth(page);
    await mockApis(page);
    await gotoEstimator(page);
    await goToStep1WithOneRoom(page);

    await uploadPhotos(page, 2);
    await waitForUploaded(page, 2);

    // Click the primary Analyse button
    await page.getByRole('button', { name: /Analyse.*photo.*AI/i }).click();

    // A review panel may appear first — confirm by clicking the inner Analyse button
    const confirmBtn = page.getByRole('button', { name: /Analyse \d+ photos? with AI/i }).last();
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Result card: unique assessment text + hour estimate (condition pill matches multiple)
    await expect(page.getByText('The home is in average condition', { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('2.5', { exact: false }).first()).toBeVisible();
  });
});
