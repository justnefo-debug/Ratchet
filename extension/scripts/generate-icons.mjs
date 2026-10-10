import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const svg = `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <path d="M64 8 L16 28 L16 60 C16 90 36 112 64 124 C92 112 112 90 112 60 L112 28 Z" fill="#0066cc"/>
  <path d="M64 16 L24 32 L24 60 C24 84 40 102 64 112 C88 102 104 84 104 60 L104 32 Z" fill="#ffffff"/>
  <path d="M64 24 L32 36 L32 60 C32 78 44 92 64 100 C84 92 96 78 96 60 L96 36 Z" fill="#0066cc"/>
  <rect x="52" y="44" width="24" height="24" fill="#ffffff" rx="4"/>
</svg>
`;

async function generate() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body style="margin: 0; padding: 0; background: transparent;">
        <div id="icon" style="width: 128px; height: 128px; display: inline-block;">
          ${svg}
        </div>
      </body>
    </html>
  `);

  const locator = page.locator('#icon');
  
  const publicDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Generate 128
  await locator.screenshot({ path: path.join(publicDir, 'icon128.png'), omitBackground: true });
  
  // Generate 48
  await page.evaluate(() => {
    document.getElementById('icon').style.width = '48px';
    document.getElementById('icon').style.height = '48px';
    document.querySelector('svg').setAttribute('width', '48');
    document.querySelector('svg').setAttribute('height', '48');
  });
  await locator.screenshot({ path: path.join(publicDir, 'icon48.png'), omitBackground: true });

  // Generate 16
  await page.evaluate(() => {
    document.getElementById('icon').style.width = '16px';
    document.getElementById('icon').style.height = '16px';
    document.querySelector('svg').setAttribute('width', '16');
    document.querySelector('svg').setAttribute('height', '16');
  });
  await locator.screenshot({ path: path.join(publicDir, 'icon16.png'), omitBackground: true });

  await browser.close();
  console.log('Icons generated successfully.');
}

generate().catch(console.error);
