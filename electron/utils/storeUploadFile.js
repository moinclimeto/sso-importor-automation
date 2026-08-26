import fs from "fs";
import path from "path";
import { app } from "electron";
import sharp from "sharp";
import {
  CPCB_MAX_UPLOAD_BYTES,
  ensurePdfUnderMaxSize,
} from "./pdfCompressor.js";
import { sanitizeCpcbPortalFileName } from "../../shared/cpcbPortalFileName.js";

function sanitizeFileName(name = "upload") {
  return sanitizeCpcbPortalFileName(String(name || "upload"), "upload").replace(/\.[^.]+$/, "");
}

async function compressImageUnderMaxSize(sourcePath, outPath, maxBytes) {
  const targetPath = outPath.replace(/\.(png|webp|jpeg)$/i, ".jpg");
  let quality = 85;
  let width = 1920;

  while (quality >= 35) {
    await sharp(sourcePath)
      .resize(width, width, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toFile(targetPath);

    const size = fs.statSync(targetPath).size;
    if (size <= maxBytes) {
      return {
        success: true,
        filePath: targetPath,
        sizeBytes: size,
        compressed: true,
      };
    }

    quality -= 10;
    if (quality <= 55) width = 1280;
    if (quality <= 45) width = 960;
  }

  const finalSize = fs.statSync(targetPath).size;
  return {
    success: true,
    filePath: targetPath,
    sizeBytes: finalSize,
    compressed: true,
    warning:
      finalSize > maxBytes
        ? "Image is still above 1 MB after compression."
        : undefined,
  };
}

export async function storeProcessedUpload({
  sourcePath,
  fileName,
  destSubdir = "processed_uploads",
  maxBytes = CPCB_MAX_UPLOAD_BYTES,
}) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return { success: false, message: "Source file not found." };
  }

  const destDir = path.join(app.getPath("userData"), destSubdir);
  fs.mkdirSync(destDir, { recursive: true });

  const sourceExt =
    path.extname(fileName || sourcePath).toLowerCase() ||
    path.extname(sourcePath).toLowerCase();
  const baseName = sanitizeFileName(
    path.basename(fileName || sourcePath, sourceExt),
  );
  let outExt = sourceExt || ".pdf";
  if ([".png", ".webp", ".jpeg"].includes(outExt)) outExt = ".jpg";
  const outPath = path.join(destDir, `${baseName}${outExt}`);

  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

  if (outExt === ".pdf") {
    const result = await ensurePdfUnderMaxSize(sourcePath, outPath, maxBytes);
    if (!result.success) {
      return { success: false, message: "Could not process PDF." };
    }
    return {
      success: true,
      filePath: result.filePath,
      sizeBytes: result.sizeBytes,
      compressed: result.compressed,
      warning: result.warning,
    };
  }

  if ([".jpg", ".jpeg", ".png", ".webp"].includes(sourceExt)) {
    const result = await compressImageUnderMaxSize(
      sourcePath,
      outPath,
      maxBytes,
    );
    return { success: true, ...result };
  }

  fs.copyFileSync(sourcePath, outPath);
  const sizeBytes = fs.statSync(outPath).size;
  return { success: true, filePath: outPath, sizeBytes, compressed: false };
}
