import sharp from 'sharp';
import jsQR from 'jsqr';
import { scanRGBABuffer, getDefaultScanner, ZBarConfigType, ZBarSymbolType } from '@undecaf/zbar-wasm';

const scanner = await getDefaultScanner();
scanner.setConfig(ZBarSymbolType.ZBAR_QRCODE, ZBarConfigType.ZBAR_CFG_ENABLE, 1);
scanner.setConfig(ZBarSymbolType.ZBAR_NONE, ZBarConfigType.ZBAR_CFG_TEST_INVERTED, 1);

async function tryBuffer(buf, label) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const z = await scanRGBABuffer(data, width, height, scanner);
  if (z.length) return console.log(label, 'zbar', z[0].decode().slice(0, 120));
  const j = jsQR(new Uint8ClampedArray(data), width, height, { inversionAttempts: 'attemptBoth' });
  if (j) return console.log(label, 'jsqr', j.data.slice(0, 120));
}   

const base = 'debug-qr.png';
for (const scale of [4, 6, 8, 10, 12, 16]) {
  const resized = await sharp(base).resize({ width: Math.round(306 * scale / 2) }).png().toBuffer();
  await tryBuffer(resized, `scale${scale}`);
  const grey = await sharp(resized).greyscale().normalize().sharpen().png().toBuffer();
  await tryBuffer(grey, `scale${scale}-sharp`);
  const thr = await sharp(resized).greyscale().threshold(140).png().toBuffer();
  await tryBuffer(thr, `scale${scale}-thr140`);
  for (const rot of [90, 180, 270]) {
    const r = await sharp(resized).rotate(rot).png().toBuffer();
    await tryBuffer(r, `scale${scale}-rot${rot}`);
  }
}
