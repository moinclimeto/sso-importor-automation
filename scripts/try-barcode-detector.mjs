import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { Jimp } from 'jimp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imgPath = path.join(__dirname, '../debug-qr-render.png');

const img = await Jimp.read(imgPath);
for (const scale of [4, 6, 8, 10, 12]) {
  const scaled = img.clone().scale(scale);
  const png = await scaled.getBuffer('image/png');
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

  const browser = await chromium.launch({
    args: ['--enable-blink-features=BarcodeDetector'],
  });
  const page = await browser.newPage();
  const values = await page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    if (!('BarcodeDetector' in window)) return { error: 'no BarcodeDetector' };
    const det = new BarcodeDetector({ formats: ['qr_code'] });
    const codes = await det.detect(canvas);
    return codes.map((c) => c.rawValue);
  }, dataUrl);
  await browser.close();
  console.log('scale', scale, values);
  if (values?.length) break;
}
