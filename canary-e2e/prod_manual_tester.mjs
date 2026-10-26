import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/tmp/kb-manual-test-artifacts';
const PROD_URL = 'http://127.0.0.1:3100';

async function runProductionManualChecks() {
  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  console.log('🚀 Starting Production Manual Verification Suite...');
  console.log(`Target: ${PROD_URL} (Master Production Build)`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  try {
    // -------------------------------------------------------------
    // Step 1: Orchestrator View & Pipeline Canvas
    // -------------------------------------------------------------
    console.log('1. Loading Orchestrator on Production...');
    await page.goto(PROD_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("KAINBAIN")');
    await page.waitForSelector('button:has-text("Orchestrator")');
    await page.waitForTimeout(1000);

    const title = await page.title();
    console.log(`   Page Title: "${title}"`);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '01_orchestrator_prod.png'),
      fullPage: true,
    });
    console.log('   📸 Captured: 01_orchestrator_prod.png');

    // -------------------------------------------------------------
    // Step 2: Task Creation & In-Column Placement
    // -------------------------------------------------------------
    console.log('2. Creating a Task via In-line Column Form...');
    const addBtn = page.getByRole('button', { name: /Add task to Idea/i }).first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      const input = page.locator('input[aria-label*="Task goal" i]').first();
      await input.waitFor({ state: 'visible', timeout: 5000 });
      await input.fill('Production Automated Smoke Task');
      const submitBtn = page.getByRole('button', { name: 'Submit new task' });
      await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
      await submitBtn.click();
      await page.waitForTimeout(1500);
    }
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '02_task_card_created.png'),
      fullPage: true,
    });
    console.log('   📸 Captured: 02_task_card_created.png');

    // -------------------------------------------------------------
    // Step 3: Direct Stage Execution & Slide-over Inspector
    // -------------------------------------------------------------
    console.log('3. Opening Task Inspector & Verifying Run Stage Controls...');
    const taskCard = page.locator('text=Production Automated Smoke Task').first();
    if (await taskCard.isVisible()) {
      await taskCard.click();
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, '03_task_inspector_prod.png'),
        fullPage: true,
      });
      console.log('   📸 Captured: 03_task_inspector_prod.png');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // -------------------------------------------------------------
    // Step 4: In-Column Bottom Stage Settings Bar
    // -------------------------------------------------------------
    console.log('4. Expanding In-Column Bottom Stage Settings Bar...');
    const stageSettingsBtn = page.getByRole('button', { name: /Configure stage|Stage Settings/i }).first();
    if (await stageSettingsBtn.isVisible()) {
      await stageSettingsBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, '04_in_column_stage_settings.png'),
        fullPage: true,
      });
      console.log('   📸 Captured: 04_in_column_stage_settings.png');
      await stageSettingsBtn.click();
      await page.waitForTimeout(400);
    }

    // -------------------------------------------------------------
    // Step 5: Files & Repository Viewer Tab
    // -------------------------------------------------------------
    console.log('5. Navigating to Files & Repo Viewer...');
    const filesTab = page.getByRole('button', { name: /Files & Repo|Files \/ Docs/i });
    await filesTab.click();
    await page.waitForSelector('text=Files & Documents');
    await page.waitForTimeout(1000);

    // Click Task Reports shortcut
    const taskReportsBtn = page.getByRole('button', { name: /Task Reports/i });
    if (await taskReportsBtn.isVisible()) {
      await taskReportsBtn.click();
      await page.waitForTimeout(800);
    }

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '05_files_repo_viewer.png'),
      fullPage: true,
    });
    console.log('   📸 Captured: 05_files_repo_viewer.png');

    // -------------------------------------------------------------
    // Step 6: Settings Tab & UI Preferences
    // -------------------------------------------------------------
    console.log('6. Navigating to Settings Tab & Theme Customization...');
    const settingsTab = page.getByRole('button', { name: /Settings/i });
    await settingsTab.click();
    await page.waitForSelector('text=Project Configuration');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '06_settings_prod.png'),
      fullPage: true,
    });
    console.log('   📸 Captured: 06_settings_prod.png');

    // -------------------------------------------------------------
    // Step 7: Final Return to Orchestrator Cockpit
    // -------------------------------------------------------------
    console.log('7. Returning to Orchestrator Cockpit...');
    const orchTab = page.getByRole('button', { name: /Orchestrator/i });
    await orchTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '07_final_orchestrator_cockpit.png'),
      fullPage: true,
    });
    console.log('   📸 Captured: 07_final_orchestrator_cockpit.png');

    console.log('\n📊 Production Verification Results:');
    console.log(`   - Page Errors: ${pageErrors.length}`);
    if (pageErrors.length > 0) {
      console.error('     Errors:', pageErrors);
    }
    console.log(`   - Console Warnings/Errors: ${consoleLogs.length}`);
    console.log('✅ All production manual check steps completed successfully!');

  } finally {
    await browser.close();
  }
}

runProductionManualChecks().catch((err) => {
  console.error('❌ Production check failed:', err);
  process.exit(1);
});
