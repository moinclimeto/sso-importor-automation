import { getLocalFilePath, persistLocalUpload } from './partCLetterValues.js';

export async function storeCompressedUpload(file, options = {}) {
  let sourcePath = getLocalFilePath(file) || file?.path || '';
  if (!sourcePath) {
    sourcePath = await persistLocalUpload(file);
  }

  if (!sourcePath && file instanceof File) {
    const blobUrl = URL.createObjectURL(file);
    return { success: true, filePath: blobUrl, compressed: false, fileName: options.fileName || file.name };
  }
  if (!sourcePath) {
    return { success: false, message: 'Could not read the file path. Please upload from the desktop app.' };
  }

  if (!window.pwp?.files?.storeUpload) {
    return { success: true, filePath: sourcePath, compressed: false };
  }

  const stored = await window.pwp.files.storeUpload({
    sourcePath,
    fileName: options.fileName || file?.name,
    destSubdir: options.destSubdir || 'processed_uploads',
  });
  if (stored?.success && stored.filePath) return stored;
  return { success: true, filePath: sourcePath, compressed: false, warning: stored?.message };
}

export async function storeCompressedUploadPath(sourcePath, options = {}) {
  if (!sourcePath) {
    return { success: false, message: 'Could not read the file path.' };
  }

  if (!window.pwp?.files?.storeUpload) {
    return { success: true, filePath: sourcePath, compressed: false };
  }

  return window.pwp.files.storeUpload({
    sourcePath,
    fileName: options.fileName || sourcePath.split(/[/\\]/).pop(),
    destSubdir: options.destSubdir || 'processed_uploads',
  });
}
