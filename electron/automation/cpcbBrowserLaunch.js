/** Shared Chromium flags for CPCB portal (upload API / HTTP2 stability + full window). */
export const CPCB_CHROMIUM_ARGS = [
  '--start-maximized',
  '--window-position=0,0',
  '--disable-http2',
];

export const CPCB_PERSISTENT_LAUNCH_OPTS = {
  headless: false,
  acceptDownloads: true,
  viewport: null,
  args: CPCB_CHROMIUM_ARGS,
};

/** Maximize the Playwright browser window (viewport: null alone is not always enough on Windows). */
export async function maximizeCpcbBrowserWindow(page) {
  if (!page || page.isClosed?.()) return;

  try {
    const session = await page.context().newCDPSession(page);
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'maximized' },
    });
    await session.detach().catch(() => {});
    return;
  } catch {
    // CDP not available — fall through
  }

  try {
    await page.evaluate(() => {
      window.moveTo(0, 0);
      window.resizeTo(window.screen.availWidth, window.screen.availHeight);
    });
  } catch {
    // ignore
  }
}

export async function prepareCpcbBrowserPage(page) {
  if (!page || page.isClosed?.()) return;
  await maximizeCpcbBrowserWindow(page);
  await page.bringToFront().catch(() => {});
}
