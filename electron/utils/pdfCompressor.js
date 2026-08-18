import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the path to the Ghostscript executable.
 * Looks in electron/bin/gswin64c.exe for Windows.
 */
function getGhostscriptPath() {
  const isPackaged = app.isPackaged;
  
  let gsPath;
  if (isPackaged) {
    // When packaged, bin folder is usually copied to resources
    gsPath = path.join(process.resourcesPath, 'bin', 'gswin64c.exe');
  } else {
    // In dev mode, it's relative to this script
    gsPath = path.join(__dirname, 'bin', 'gswin64c.exe');
  }

  if (fs.existsSync(gsPath)) {
    return gsPath;
  }
  
  // Try system PATH as fallback
  return 'gswin64c';
}

/**
 * Compresses a PDF file using Ghostscript.
 * @param {string} inputPath - Absolute path to original PDF
 * @param {string} outputPath - Absolute path for compressed PDF
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function compressPdf(inputPath, outputPath) {
  return new Promise((resolve) => {
    try {
      const gsPath = getGhostscriptPath();
      
      // /ebook setting provides good compression while keeping text readable (~150 dpi)
      // /screen is smaller but can be too blurry for invoices (~72 dpi)
      const args = [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        '-dPDFSETTINGS=/ebook',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        `-sOutputFile="${outputPath}"`,
        `"${inputPath}"`
      ];
      
      // Enclose gsPath in quotes in case of spaces in directory names
      const command = `"${gsPath}" ${args.join(' ')}`;
      
      exec(command, (error) => {
        if (error) {
          console.error('[Ghostscript] Compression failed:', error.message);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } catch (err) {
      console.error('[Ghostscript] Execution error:', err);
      resolve(false);
    }
  });
}
