import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/tmp/kb-manual-test-artifacts';

async function runManualTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('1. Navigating to KainBain Orchestrator...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('h1');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_orchestrator_cockpit.png'), fullPage: true });

  console.log('2. Opening Prompt Review Modal...');
  const goalInput = page.locator('input[placeholder*="goal" i]');
  await goalInput.fill('Implement JWT Authentication with Refresh Tokens');
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForSelector('#prompt-review-title');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_prompt_review_modal.png'), fullPage: true });

  console.log('3. Sending Task to Agent & Observing Live Stream...');
  await page.getByRole('button', { name: 'Send to Agent' }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_agent_streaming_canvas.png'), fullPage: true });

  console.log('4. Navigating to Tasks Kanban View...');
  await page.getByRole('button', { name: /Tasks/i }).click();
  await page.waitForSelector('text=Task Management');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_kanban_board.png'), fullPage: true });

  console.log('5. Navigating to Project Settings...');
  await page.getByRole('button', { name: /Settings/i }).click();
  await page.waitForSelector('text=Project Configuration');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_project_settings.png'), fullPage: true });

  console.log('6. Opening UI Preferences & Customization Modal...');
  await page.getByRole('button', { name: /Customize/i }).click();
  await page.waitForSelector('text=Preferences');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_ui_preferences_modal.png'), fullPage: true });

  console.log('7. Opening Keyboard Shortcuts Modal...');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Keyboard Shortcuts/i }).click();
  await page.waitForSelector('#keyboard-shortcuts-title');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_keyboard_shortcuts.png'), fullPage: true });

  await browser.close();
  console.log('All manual test steps completed successfully!');
}

runManualTest().catch((err) => {
  console.error('Manual test failed:', err);
  process.exit(1);
});
