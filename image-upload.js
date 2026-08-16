/**
 * Shared browser image upload helpers for 2 MB server-limited image endpoints.
 * Client target is 1.8 MB so the file sent to the server stays safely under 2 MB.
 * Staff Email attachments (4 MB) must NOT use this helper.
 */
(function initEfhsImageUpload(global) {
  const SERVER_MAX_BYTES = 1_900_000;
  const SERVER_MAX_LABEL = '2 MB';
  const CLIENT_TARGET_BYTES = 1_800_000;
  const CLIENT_TARGET_LABEL = '1.8 MB';

  function canvasToImageBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Could not compress the image.'));
          return;
        }
        resolve(blob);
      }, mimeType, quality);
    });
  }

  function fileExtensionForMime(mimeType) {
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    return '.jpg';
  }

  function fileFromBlob(blob, originalName, mimeType) {
    const ext = fileExtensionForMime(mimeType);
    const base = String(originalName || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}${ext}`, { type: mimeType, lastModified: Date.now() });
  }

  async function createOrientedBitmap(file) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      return createImageBitmap(file);
    }
  }

  /**
   * Compress/resize an image in the browser until it is <= maxBytes.
   * Files already at or under maxBytes are returned unchanged.
   */
  async function compressImageFileForUpload(file, {
    maxBytes = CLIENT_TARGET_BYTES,
    maxDimension = 2400,
    targetLabel = CLIENT_TARGET_LABEL,
  } = {}) {
    if (!(file instanceof File) || !file.size) return file;
    if (file.size <= maxBytes) return file;

    const type = String(file.type || '').toLowerCase();
    if (!type.startsWith('image/') || type === 'image/svg+xml') {
      throw new Error(`Image is larger than ${targetLabel}. Choose a smaller file.`);
    }

    let bitmap;
    try {
      bitmap = await createOrientedBitmap(file);
    } catch {
      throw new Error(`Could not read that image for resizing. Please upload a file under ${targetLabel}.`);
    }

    try {
      let width = bitmap.width || 1;
      let height = bitmap.height || 1;
      const fit = Math.min(maxDimension / width, maxDimension / height, 1);
      width = Math.max(1, Math.round(width * fit));
      height = Math.max(1, Math.round(height * fit));

      // Prefer keeping the original format when compression is required.
      const mimeCandidates = [];
      if (type === 'image/png') mimeCandidates.push('image/png', 'image/webp', 'image/jpeg');
      else if (type === 'image/webp') mimeCandidates.push('image/webp', 'image/jpeg', 'image/png');
      else if (type === 'image/gif') mimeCandidates.push('image/webp', 'image/jpeg', 'image/png');
      else mimeCandidates.push('image/jpeg', 'image/webp', 'image/png');

      let bestBlob = null;
      let bestMime = 'image/jpeg';
      for (const mimeType of mimeCandidates) {
        let scale = 1;
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const outW = Math.max(1, Math.round(width * scale));
          const outH = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext('2d');
          if (!ctx) break;
          if (mimeType === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, outW, outH);
          }
          ctx.drawImage(bitmap, 0, 0, outW, outH);
          const qualitySteps = mimeType === 'image/png' ? [undefined] : [0.92, 0.85, 0.78, 0.7, 0.62, 0.52, 0.42];
          for (const quality of qualitySteps) {
            const blob = await canvasToImageBlob(canvas, mimeType, quality);
            if (!bestBlob || blob.size < bestBlob.size) {
              bestBlob = blob;
              bestMime = mimeType;
            }
            if (blob.size <= maxBytes) {
              return fileFromBlob(blob, file.name, mimeType);
            }
          }
          scale *= 0.82;
          if (outW <= 640 && outH <= 640) break;
        }
      }

      if (bestBlob && bestBlob.size <= maxBytes) {
        return fileFromBlob(bestBlob, file.name, bestMime);
      }
      throw new Error(`Could not shrink that image under ${targetLabel} while keeping it usable. Try a smaller photo.`);
    } finally {
      bitmap.close?.();
    }
  }

  /**
   * Prepare an image for a 2 MB server endpoint:
   * skip work if already <= 1.8 MB, otherwise compress and verify size.
   */
  async function prepareImageFileForUpload(file, options = {}) {
    const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : CLIENT_TARGET_BYTES;
    const targetLabel = options.targetLabel || CLIENT_TARGET_LABEL;
    const prepared = await compressImageFileForUpload(file, {
      ...options,
      maxBytes,
      targetLabel,
    });
    if (!(prepared instanceof File) || !prepared.size) {
      throw new Error('Could not prepare that image for upload.');
    }
    if (prepared.size > maxBytes) {
      throw new Error(`Processed image is still larger than ${targetLabel}. Choose a smaller photo.`);
    }
    return prepared;
  }

  const api = {
    SERVER_MAX_BYTES,
    SERVER_MAX_LABEL,
    CLIENT_TARGET_BYTES,
    CLIENT_TARGET_LABEL,
    compressImageFileForUpload,
    prepareImageFileForUpload,
  };

  global.EfhsImageUpload = api;
  return api;
}(typeof window !== 'undefined' ? window : globalThis));
