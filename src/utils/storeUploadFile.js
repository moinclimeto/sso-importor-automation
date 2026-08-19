import { getLocalFilePath } from './partCLetterValues.js';

export async function storeCompressedUpload(file, options = {}) {
  const sourcePath = getLocalFilePath(file) || file?.path || '';
  if (!sourcePath) {
    return { success: false, message: 'Could not read the file path. Please upload from the desktop app.' };
  }

  if (!window.pwp?.files?.storeUpload) {
    return { success: true, filePath: sourcePath, compressed: false };
  }

  return window.pwp.files.storeUpload({
    sourcePath,
    fileName: options.fileName || file?.name,
    destSubdir: options.destSubdir || 'processed_uploads',
  });
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
