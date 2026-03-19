import path from 'path';
import fs from 'fs';
import puppeteer, { Browser } from 'puppeteer';
import prisma from '../lib/prisma';

const SCREENSHOTS_DIR = path.resolve(__dirname, '../../uploads/email-screenshots');
const VIEWPORT_WIDTH = 800;
const MAX_HEIGHT = 4000;

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    browserPromise.then((b) => {
      b.on('disconnected', () => {
        browserPromise = null;
      });
    });
  }
  return browserPromise;
}

export async function screenshotEmail(emailId: number): Promise<string | null> {
  try {
    const email = await prisma.emails.findUnique({
      where: { id: emailId },
      select: { body_html: true, body_text: true, screenshot_url: true },
    });
    if (!email) return null;

    if (email.screenshot_url) return email.screenshot_url;

    const htmlContent = email.body_html || email.body_text;
    if (!htmlContent || htmlContent.trim().length < 10) return null;

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 16px;
            background: #fff;
            color: #333;
            font-size: 14px;
            line-height: 1.5;
            max-width: ${VIEWPORT_WIDTH}px;
          }
          img { max-width: 100%; height: auto; }
          table { max-width: 100%; }
          pre { white-space: pre-wrap; word-break: break-word; }
        </style>
      </head>
      <body>
        ${email.body_html ? htmlContent : `<pre>${htmlContent}</pre>`}
      </body>
      </html>
    `;

    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      await page.setViewport({ width: VIEWPORT_WIDTH, height: 600 });
      await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 15000 });

      await new Promise((r) => setTimeout(r, 500));

      const bodyHeight = await page.evaluate('document.body.scrollHeight') as number;
      const height = Math.min(bodyHeight, MAX_HEIGHT);

      const filename = `email_${emailId}_${Date.now()}.png`;
      const filepath = path.join(SCREENSHOTS_DIR, filename);

      await page.screenshot({
        path: filepath,
        clip: { x: 0, y: 0, width: VIEWPORT_WIDTH, height },
        type: 'png',
      });

      const screenshotUrl = `/api/uploads/email-screenshots/${filename}`;
      await prisma.emails.update({
        where: { id: emailId },
        data: { screenshot_url: screenshotUrl },
      });

      console.log(`[EmailScreenshot] Saved screenshot for email #${emailId}`);
      return screenshotUrl;
    } finally {
      await page.close();
    }
  } catch (err: any) {
    console.error(`[EmailScreenshot] Error for email #${emailId}:`, err?.message || err);
    return null;
  }
}

export async function screenshotEmailsByIds(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;

  let done = 0;
  for (const id of ids) {
    const result = await screenshotEmail(id);
    if (result) done++;
  }

  if (done > 0) {
    console.log(`[EmailScreenshot] Screenshotted ${done}/${ids.length} emails`);
  }
  return done;
}

process.on('beforeExit', async () => {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch { /* ignore */ }
  }
});
