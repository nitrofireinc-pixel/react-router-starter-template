/* global document, Image, Blob, URL */
/**
 * East Forsyth Blue Regiment badge renderer (CR80 portrait @ 300 DPI).
 * Shared by the CMS Badge Creator live preview and PNG export.
 */
(function badgeCreatorModule(global) {
  const DPI = 300;
  const INCH = DPI;
  const MM = DPI / 25.4;

  const BADGE = {
    width: Math.round(2.125 * INCH), // 638
    height: Math.round(3.375 * INCH), // 1011
    cornerRadius: Math.round(3 * MM), // ~35
    slot: {
      width: Math.round(14 * MM), // horizontal slot ~165px
      height: Math.round(3 * MM), // ~35px
      top: 12, // near top edge inside card
    },
    committeeBorder: Math.round(2.5 * MM), // ~30
    dpi: DPI,
  };

  const COLORS = {
    navy: '#002142',
    navy2: '#014990',
    red: '#E71321',
    gold: '#FDD703',
    silver: '#C0BFC4',
    paper: '#ffffff',
    ink: '#111827',
    muted: '#5b6472',
    soft: '#f5f7fb',
    profileGrey: '#9CA3AF',
    profileGreyDark: '#6B7280',
  };

  const LINE = 18;

  const BADGE_ROLES = [
    'Director',
    'Assistant Director',
    'President',
    'Vice-President',
    'Secretary',
    'Treasurer',
    'Committee Member',
  ];

  const imageCache = new Map();

  function schoolYearOptions(count = 10, now = new Date()) {
    const startYear = now.getFullYear();
    return Array.from({ length: count }, (_, index) => {
      const year = startYear + index;
      return `${year}-${year + 1}`;
    });
  }

  function loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (imageCache.has(src)) return imageCache.get(src);
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not load image: ${src}`));
      img.src = src;
    });
    imageCache.set(src, promise);
    return promise;
  }

  function preloadBrandAssets() {
    return Promise.all([
      loadImage('/assets/efhs-logo.png'),
      loadImage('/assets/efhs-blue-regiment-mark.png'),
    ]);
  }

  function roundedRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawProfilePlaceholder(ctx, cx, cy, size) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.profileGrey;
    ctx.fill();

    const headR = size * 0.18;
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.12, headR, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.profileGreyDark;
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.22, size * 0.28, size * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawProfilePhoto(ctx, img, cx, cy, size) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.clip();
    const scale = Math.max(size / img.width, size / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
    ctx.restore();
  }

  function drawSlotHole(ctx, cardX = 0, cardY = 0, cardW = BADGE.width) {
    const { width, height, top } = BADGE.slot;
    const x = cardX + (cardW - width) / 2;
    const y = cardY + top;
    ctx.save();
    roundedRectPath(ctx, x, y, width, height, height / 2);
    ctx.fillStyle = COLORS.paper;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,33,66,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function fitImage(img, maxW, maxH) {
    // Prefer intrinsic content bounds when available via natural size.
    const scale = Math.min(maxW / img.width, maxH / img.height);
    return {
      width: img.width * scale,
      height: img.height * scale,
    };
  }

  function measureTitleWidth(ctx) {
    ctx.font = 'bold 28px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif';
    const top = ctx.measureText('EAST FORSYTH').width;
    ctx.font = 'bold 22px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif';
    const bottom = ctx.measureText('BLUE REGIMENT').width;
    return Math.max(top, bottom);
  }

  function wrapText(ctx, text, maxWidth) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let line = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const test = `${line} ${words[i]}`;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
    return lines;
  }

  async function renderBadge(canvas, options = {}) {
    const ctx = canvas.getContext('2d');
    const width = BADGE.width;
    const height = BADGE.height;
    canvas.width = width;
    canvas.height = height;

    const name = String(options.name || 'Member Name').trim() || 'Member Name';
    const role = BADGE_ROLES.includes(options.role) ? options.role : 'Committee Member';
    const schoolYear = String(options.schoolYear || schoolYearOptions()[0]).trim();
    const isCommitteeMember = role === 'Committee Member';

    const [schoolLogo, regimentMark, photo] = await Promise.all([
      options.schoolLogo ? Promise.resolve(options.schoolLogo) : loadImage('/assets/efhs-logo.png'),
      options.regimentMark ? Promise.resolve(options.regimentMark) : loadImage('/assets/efhs-blue-regiment-mark.png'),
      options.photo instanceof Image ? Promise.resolve(options.photo) : loadImage(options.photoUrl || options.photo_url || ''),
    ]);

    ctx.clearRect(0, 0, width, height);

    // Committee Member outer red border
    if (isCommitteeMember) {
      ctx.fillStyle = COLORS.red;
      roundedRectPath(ctx, 0, 0, width, height, BADGE.cornerRadius + 4);
      ctx.fill();
    }

    const inset = isCommitteeMember ? BADGE.committeeBorder : 0;
    const cardX = inset;
    const cardY = inset;
    const cardW = width - inset * 2;
    const cardH = height - inset * 2;

    // Card base
    ctx.fillStyle = COLORS.paper;
    roundedRectPath(ctx, cardX, cardY, cardW, cardH, BADGE.cornerRadius);
    ctx.fill();

    // Header band
    const headerH = Math.round(cardH * 0.34) - LINE * 2;
    ctx.save();
    roundedRectPath(ctx, cardX, cardY, cardW, headerH + BADGE.cornerRadius, BADGE.cornerRadius);
    ctx.clip();
    ctx.fillStyle = COLORS.navy;
    ctx.fillRect(cardX, cardY, cardW, headerH);
    ctx.fillStyle = COLORS.navy2;
    ctx.beginPath();
    ctx.moveTo(cardX, cardY);
    ctx.lineTo(cardX + cardW * 0.35, cardY);
    ctx.lineTo(cardX, cardY + headerH * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const centerX = cardX + cardW / 2;
    const brandContentTop = cardY + BADGE.slot.top + BADGE.slot.height + 8;
    const titleCenterY = brandContentTop + 44 + LINE;

    // Slot, logos closer to title, and larger centered title in navy header
    drawSlotHole(ctx, cardX, cardY, cardW);

    const schoolSize = fitImage(schoolLogo, 132, 96);
    const markSize = fitImage(regimentMark, 108, 108);
    const titleGap = 4;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleTopWidth = measureTitleWidth(ctx);

    const schoolX = centerX - titleTopWidth / 2 - titleGap - schoolSize.width;
    const schoolY = titleCenterY - schoolSize.height / 2;
    const markX = centerX + titleTopWidth / 2 + titleGap;
    const markY = titleCenterY - markSize.height / 2;

    ctx.drawImage(schoolLogo, schoolX, schoolY, schoolSize.width, schoolSize.height);
    ctx.drawImage(regimentMark, markX, markY, markSize.width, markSize.height);

    ctx.font = 'bold 28px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif';
    ctx.fillStyle = COLORS.gold;
    ctx.fillText('EAST FORSYTH', centerX, titleCenterY - 28);
    ctx.font = 'bold 22px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif';
    ctx.fillStyle = COLORS.paper;
    ctx.fillText('BLUE REGIMENT', centerX, titleCenterY + 2);
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(centerX - 56, titleCenterY + 20, 112, 3);
    ctx.font = 'bold 13px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif';
    ctx.fillStyle = COLORS.silver;
    ctx.fillText('OFFICIAL BADGE', centerX, titleCenterY + 38);

    // Accent stripes
    const stripeY = cardY + headerH;
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(cardX, stripeY, cardW, 6);
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(cardX, stripeY + 6, cardW, 4);

    // Body wash
    ctx.fillStyle = COLORS.soft;
    ctx.fillRect(cardX, stripeY + 10, cardW, cardH - headerH - 10);

    // Profile
    const profileSize = Math.round(cardW * 0.42);
    const profileCx = centerX;
    const profileCy = cardY + headerH + 50 + profileSize / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(profileCx, profileCy, profileSize / 2 + 10, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.navy;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(profileCx, profileCy, profileSize / 2 + 4, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    if (photo) {
      drawProfilePhoto(ctx, photo, profileCx, profileCy, profileSize);
    } else {
      drawProfilePlaceholder(ctx, profileCx, profileCy, profileSize);
    }

    // Identity block
    let textY = profileCy + profileSize / 2 + 42;
    const textMax = cardW - 56;

    ctx.textAlign = 'center';
    ctx.font = 'bold 11px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('ROLE', centerX, textY);
    textY += 24;

    ctx.font = 'bold 30px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif';
    ctx.fillStyle = COLORS.navy;
    const roleLines = wrapText(ctx, role, textMax);
    roleLines.forEach((line) => {
      ctx.fillText(line, centerX, textY);
      textY += 34;
    });
    textY += 4;
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(centerX - 42, textY, 84, 3);
    textY += 24;

    ctx.font = 'bold 11px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('NAME', centerX, textY);
    textY += 24;
    ctx.font = 'bold 24px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif';
    ctx.fillStyle = COLORS.ink;
    wrapText(ctx, name, textMax).forEach((line) => {
      ctx.fillText(line, centerX, textY);
      textY += 28;
    });
    textY += 8;

    ctx.font = 'bold 11px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('ACTIVE YEARS', centerX, textY);
    textY += 22;
    ctx.font = '18px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif';
    ctx.fillStyle = COLORS.navy;
    ctx.fillText(schoolYear, centerX, textY);
    textY += 30;

    ctx.font = 'bold 11px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('ORGANIZATION', centerX, textY);
    textY += 20;
    ctx.font = '15px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('East Forsyth Band Boosters', centerX, textY);

    // Footer bar
    const footerH = 56;
    const footerY = cardY + cardH - footerH;
    ctx.save();
    roundedRectPath(ctx, cardX, footerY, cardW, footerH + BADGE.cornerRadius, BADGE.cornerRadius);
    ctx.clip();
    ctx.fillStyle = COLORS.navy;
    ctx.fillRect(cardX, footerY, cardW, footerH);
    ctx.restore();
    ctx.font = '12px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif';
    ctx.fillStyle = COLORS.silver;
    ctx.fillText('East Forsyth Blue Regiment', centerX, footerY + footerH / 2);

    return canvas;
  }

  function exportBadgePng(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printBadge(canvas, title = 'Badge') {
    if (!canvas) return Promise.reject(new Error('Badge preview is not ready.'));
    const dataUrl = canvas.toDataURL('image/png');
    const safeTitle = String(title || 'Badge').replace(/[<>&"]/g, '');
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    html, body { margin: 0; padding: 0; background: #fff; }
    @page { size: 2.125in 3.375in; margin: 0; }
    img {
      display: block;
      width: 2.125in;
      height: 3.375in;
      max-width: 100%;
    }
    @media print {
      html, body { margin: 0; padding: 0; }
      img { width: 2.125in; height: 3.375in; }
    }
  </style>
</head>
<body><img src="${dataUrl}" alt="${safeTitle}"></body>
</html>`;

    return new Promise((resolve, reject) => {
      let frame = document.getElementById('badge-creator-print-frame');
      if (!frame) {
        frame = document.createElement('iframe');
        frame.id = 'badge-creator-print-frame';
        frame.title = 'Badge print';
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
        document.body.appendChild(frame);
      }
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (error) reject(error);
        else resolve();
      };
      const timeoutId = window.setTimeout(() => {
        finish(new Error('Timed out waiting for the print dialog.'));
      }, 12000);
      frame.onload = () => {
        try {
          const win = frame.contentWindow;
          if (!win) throw new Error('Print frame unavailable');
          win.focus();
          win.print();
          finish();
        } catch (error) {
          finish(error);
        }
      };
      frame.srcdoc = html;
    });
  }

  global.BadgeCreator = {
    BADGE,
    COLORS,
    BADGE_ROLES,
    schoolYearOptions,
    loadImage,
    preloadBrandAssets,
    renderBadge,
    exportBadgePng,
    downloadBlob,
    printBadge,
  };
}(typeof window !== 'undefined' ? window : globalThis));
