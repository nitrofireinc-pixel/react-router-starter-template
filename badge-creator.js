/* global document, Image, Blob, URL */
/**
 * East Forsyth Blue Regiment badge renderer.
 * 125% of CR80 portrait @ 300 DPI, with enlarged type for print readability.
 */
(function badgeCreatorModule(global) {
  const DPI = 300;
  const INCH = DPI;
  const MM = DPI / 25.4;
  const BADGE_SCALE = 1.25;
  // Type grows a bit more than the card so titles/names stay readable in print.
  const TYPE_SCALE = BADGE_SCALE * 1.2;
  // Blank outer margin so edge-cropping printers do not clip badge artwork.
  const SAFE_MARGIN_IN = 0.25;

  function scalePx(value) {
    return Math.round(value * BADGE_SCALE);
  }

  function typePx(value) {
    return Math.round(value * TYPE_SCALE);
  }

  const contentWidthIn = 2.125 * BADGE_SCALE;
  const contentHeightIn = 3.375 * BADGE_SCALE;
  const contentWidth = Math.round(contentWidthIn * INCH);
  const contentHeight = Math.round(contentHeightIn * INCH);
  const safeMargin = Math.round(SAFE_MARGIN_IN * INCH);

  const BADGE = {
    scale: BADGE_SCALE,
    typeScale: TYPE_SCALE,
    safeMarginIn: SAFE_MARGIN_IN,
    safeMargin,
    contentWidthIn,
    contentHeightIn,
    contentWidth,
    contentHeight,
    // Full printable canvas includes the safe margin on every side.
    widthIn: contentWidthIn + (SAFE_MARGIN_IN * 2),
    heightIn: contentHeightIn + (SAFE_MARGIN_IN * 2),
    width: contentWidth + (safeMargin * 2),
    height: contentHeight + (safeMargin * 2),
    cornerRadius: Math.round(3 * MM * BADGE_SCALE),
    slot: {
      width: Math.round(14 * MM * BADGE_SCALE),
      height: Math.round(3 * MM * BADGE_SCALE),
      top: scalePx(12),
    },
    committeeBorder: Math.round(2.5 * MM * BADGE_SCALE),
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

  const LINE = scalePx(18);

  const TYPE = {
    titleTop: typePx(28),
    titleBottom: typePx(22),
    official: typePx(13),
    // Identity block below the portrait — kept larger for print readability.
    label: typePx(15),
    role: typePx(38),
    name: typePx(32),
    years: typePx(24),
    org: typePx(20),
    footer: typePx(16),
  };

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

  function clampNumber(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  }

  function normalizePhotoCrop(crop = {}) {
    return {
      zoom: clampNumber(crop.zoom ?? crop.photo_zoom, 1, 4, 1),
      offsetX: clampNumber(crop.offsetX ?? crop.photo_offset_x, -2, 2, 0),
      offsetY: clampNumber(crop.offsetY ?? crop.photo_offset_y, -2, 2, 0),
    };
  }

  function profilePhotoDrawMetrics(img, size, crop = {}) {
    const normalized = normalizePhotoCrop(crop);
    const cover = Math.max(size / img.width, size / img.height);
    const scale = cover * normalized.zoom;
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const maxOffsetX = Math.max(0, (drawW - size) / 2);
    const maxOffsetY = Math.max(0, (drawH - size) / 2);
    const offsetPxX = clampNumber(normalized.offsetX * (size / 2), -maxOffsetX, maxOffsetX, 0);
    const offsetPxY = clampNumber(normalized.offsetY * (size / 2), -maxOffsetY, maxOffsetY, 0);
    return {
      ...normalized,
      cover,
      scale,
      drawW,
      drawH,
      offsetPxX,
      offsetPxY,
      maxOffsetX,
      maxOffsetY,
      // Re-normalize offsets after clamping so saved values stay in range.
      offsetX: size ? (offsetPxX / (size / 2)) : 0,
      offsetY: size ? (offsetPxY / (size / 2)) : 0,
    };
  }

  function drawProfilePhoto(ctx, img, cx, cy, size, crop = {}) {
    const metrics = profilePhotoDrawMetrics(img, size, crop);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      img,
      cx - metrics.drawW / 2 + metrics.offsetPxX,
      cy - metrics.drawH / 2 + metrics.offsetPxY,
      metrics.drawW,
      metrics.drawH,
    );
    ctx.restore();
    return metrics;
  }

  function getProfileLayout(role = 'Committee Member') {
    const isCommitteeMember = role === 'Committee Member';
    const margin = BADGE.safeMargin;
    const inset = isCommitteeMember ? BADGE.committeeBorder : 0;
    const contentX = margin;
    const contentY = margin;
    const cardX = contentX + inset;
    const cardY = contentY + inset;
    const cardW = BADGE.contentWidth - inset * 2;
    const cardH = BADGE.contentHeight - inset * 2;
    const headerH = Math.round(cardH * 0.34) - LINE * 2;
    const profileSize = Math.round(cardW * 0.42);
    const profileCx = cardX + cardW / 2;
    const profileCy = cardY + headerH + scalePx(50) + profileSize / 2;
    return {
      isCommitteeMember,
      margin,
      contentX,
      contentY,
      inset,
      cardX,
      cardY,
      cardW,
      cardH,
      headerH,
      profileSize,
      profileCx,
      profileCy,
      profileRadius: profileSize / 2,
    };
  }

  function drawSlotHole(ctx, cardX = 0, cardY = 0, cardW = BADGE.contentWidth) {
    const { width, height, top } = BADGE.slot;
    const x = cardX + (cardW - width) / 2;
    const y = cardY + top;
    ctx.save();
    roundedRectPath(ctx, x, y, width, height, height / 2);
    ctx.fillStyle = COLORS.paper;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = scalePx(2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,33,66,0.18)';
    ctx.lineWidth = Math.max(1, scalePx(1));
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

  function typeFont(weight, sizePx) {
    return `${weight} ${sizePx}px Liberation Sans, DejaVu Sans, Noto Sans, sans-serif`;
  }

  function measureTitleWidth(ctx) {
    ctx.font = typeFont('bold', TYPE.titleTop);
    const top = ctx.measureText('EAST FORSYTH').width;
    ctx.font = typeFont('bold', TYPE.titleBottom);
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
    const photoCrop = normalizePhotoCrop(options.photoCrop || options);
    const layout = getProfileLayout(role);
    const { isCommitteeMember, margin, contentX, contentY, cardX, cardY, cardW, cardH } = layout;

    const [schoolLogo, regimentMark, photo] = await Promise.all([
      options.schoolLogo ? Promise.resolve(options.schoolLogo) : loadImage('/assets/efhs-logo.png'),
      options.regimentMark ? Promise.resolve(options.regimentMark) : loadImage('/assets/efhs-blue-regiment-mark.png'),
      options.photo instanceof Image ? Promise.resolve(options.photo) : loadImage(options.photoUrl || options.photo_url || ''),
    ]);

    ctx.clearRect(0, 0, width, height);

    // Full-canvas white safe margin (prevents edge-cropping printers from clipping artwork).
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 0, width, height);

    // Committee Member outer red border (inside the safe margin).
    if (isCommitteeMember) {
      ctx.fillStyle = COLORS.red;
      roundedRectPath(
        ctx,
        contentX,
        contentY,
        BADGE.contentWidth,
        BADGE.contentHeight,
        BADGE.cornerRadius + scalePx(4),
      );
      ctx.fill();
    }

    // Card base
    ctx.fillStyle = COLORS.paper;
    roundedRectPath(ctx, cardX, cardY, cardW, cardH, BADGE.cornerRadius);
    ctx.fill();

    // Header band
    const { headerH, profileSize, profileCx, profileCy } = layout;
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

    const centerX = profileCx;
    const slotBottom = cardY + BADGE.slot.top + BADGE.slot.height;
    const stripeY = cardY + headerH;
    // Vertically center logos + title between the lanyard slot and the red/gold stripe.
    const headerCenterY = (slotBottom + stripeY) / 2;

    // Slot, logos, and title in navy header
    drawSlotHole(ctx, cardX, cardY, cardW);

    const schoolSize = fitImage(schoolLogo, scalePx(132), scalePx(96));
    const markSize = fitImage(regimentMark, scalePx(108), scalePx(108));
    const titleGap = scalePx(4);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleTopWidth = measureTitleWidth(ctx);

    // Title stack offsets relative to titleCenterY (used to keep the block centered as a group).
    const titleStackTop = -TYPE.titleTop;
    const titleStackBottom = scalePx(42);
    const titleCenterY = headerCenterY - ((titleStackTop + titleStackBottom) / 2);

    const schoolX = centerX - titleTopWidth / 2 - titleGap - schoolSize.width;
    const schoolY = headerCenterY - schoolSize.height / 2;
    const markX = centerX + titleTopWidth / 2 + titleGap;
    const markY = headerCenterY - markSize.height / 2;

    ctx.drawImage(schoolLogo, schoolX, schoolY, schoolSize.width, schoolSize.height);
    ctx.drawImage(regimentMark, markX, markY, markSize.width, markSize.height);

    ctx.font = typeFont('bold', TYPE.titleTop);
    ctx.fillStyle = COLORS.gold;
    ctx.fillText('EAST FORSYTH', centerX, titleCenterY + titleStackTop);
    ctx.font = typeFont('bold', TYPE.titleBottom);
    ctx.fillStyle = COLORS.paper;
    ctx.fillText('BLUE REGIMENT', centerX, titleCenterY + scalePx(2));
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(centerX - scalePx(64), titleCenterY + scalePx(22), scalePx(128), scalePx(4));
    ctx.font = typeFont('bold', TYPE.official);
    ctx.fillStyle = COLORS.silver;
    ctx.fillText('OFFICIAL BADGE', centerX, titleCenterY + titleStackBottom);

    // Accent stripes
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(cardX, stripeY, cardW, scalePx(6));
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(cardX, stripeY + scalePx(6), cardW, scalePx(4));

    // Body wash
    ctx.fillStyle = COLORS.soft;
    ctx.fillRect(cardX, stripeY + scalePx(10), cardW, cardH - headerH - scalePx(10));

    // Profile
    ctx.save();
    ctx.beginPath();
    ctx.arc(profileCx, profileCy, profileSize / 2 + scalePx(10), 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.navy;
    ctx.lineWidth = scalePx(6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(profileCx, profileCy, profileSize / 2 + scalePx(4), 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = scalePx(3);
    ctx.stroke();
    ctx.restore();

    let appliedCrop = photoCrop;
    if (photo) {
      appliedCrop = drawProfilePhoto(ctx, photo, profileCx, profileCy, profileSize, photoCrop);
    } else {
      drawProfilePlaceholder(ctx, profileCx, profileCy, profileSize);
    }

    // Identity block
    let textY = profileCy + profileSize / 2 + scalePx(34);
    const textMax = cardW - scalePx(40);
    const labelGap = Math.round(TYPE.label * 1.45);

    ctx.textAlign = 'center';
    ctx.font = typeFont('bold', TYPE.label);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('ROLE', centerX, textY);
    textY += labelGap;

    ctx.font = typeFont('bold', TYPE.role);
    ctx.fillStyle = COLORS.navy;
    const roleLines = wrapText(ctx, role, textMax);
    const roleLineGap = Math.round(TYPE.role * 1.12);
    roleLines.forEach((line) => {
      ctx.fillText(line, centerX, textY);
      textY += roleLineGap;
    });
    textY += scalePx(2);
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(centerX - scalePx(56), textY, scalePx(112), scalePx(5));
    textY += labelGap;

    ctx.font = typeFont('bold', TYPE.label);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('NAME', centerX, textY);
    textY += labelGap;
    ctx.font = typeFont('bold', TYPE.name);
    ctx.fillStyle = COLORS.ink;
    const nameLineGap = Math.round(TYPE.name * 1.14);
    wrapText(ctx, name, textMax).forEach((line) => {
      ctx.fillText(line, centerX, textY);
      textY += nameLineGap;
    });
    textY += scalePx(8);

    ctx.font = typeFont('bold', TYPE.label);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('ACTIVE YEARS', centerX, textY);
    textY += Math.round(TYPE.label * 1.35);
    ctx.font = typeFont('bold', TYPE.years);
    ctx.fillStyle = COLORS.navy;
    ctx.fillText(schoolYear, centerX, textY);
    textY += Math.round(TYPE.years * 1.25);

    ctx.font = typeFont('bold', TYPE.label);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('ORGANIZATION', centerX, textY);
    textY += Math.round(TYPE.label * 1.3);
    ctx.font = typeFont('bold', TYPE.org);
    ctx.fillStyle = COLORS.muted;
    wrapText(ctx, 'East Forsyth Band Boosters', textMax).forEach((line) => {
      ctx.fillText(line, centerX, textY);
      textY += Math.round(TYPE.org * 1.12);
    });

    // Footer bar
    const footerH = scalePx(62);
    const footerY = cardY + cardH - footerH;
    ctx.save();
    roundedRectPath(ctx, cardX, footerY, cardW, footerH + BADGE.cornerRadius, BADGE.cornerRadius);
    ctx.clip();
    ctx.fillStyle = COLORS.navy;
    ctx.fillRect(cardX, footerY, cardW, footerH);
    ctx.restore();
    ctx.font = typeFont('bold', TYPE.footer);
    ctx.fillStyle = COLORS.silver;
    ctx.fillText('East Forsyth Blue Regiment', centerX, footerY + footerH / 2);

    return {
      canvas,
      layout: {
        ...layout,
        photoCrop: appliedCrop,
        hasPhoto: Boolean(photo),
      },
    };
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
    const widthIn = BADGE.widthIn;
    const heightIn = BADGE.heightIn;
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    html, body { margin: 0; padding: 0; background: #fff; }
    @page { size: ${widthIn}in ${heightIn}in; margin: 0; }
    img {
      display: block;
      width: ${widthIn}in;
      height: ${heightIn}in;
      max-width: 100%;
    }
    @media print {
      html, body { margin: 0; padding: 0; }
      img { width: ${widthIn}in; height: ${heightIn}in; }
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
    TYPE,
    BADGE_ROLES,
    schoolYearOptions,
    loadImage,
    preloadBrandAssets,
    normalizePhotoCrop,
    profilePhotoDrawMetrics,
    getProfileLayout,
    renderBadge,
    exportBadgePng,
    downloadBlob,
    printBadge,
  };
}(typeof window !== 'undefined' ? window : globalThis));
