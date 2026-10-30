/**
 * PrintLarge — 8.5" x 11" Poster & Tile Print Splitter
 * Works 100% client-side for GitHub Pages hosting.
 */

const state = {
  image: null,
  imageName: 'poster',
  aspectRatio: 4 / 3, // width / height (default 48x36 = 4:3)
  targetWidthIn: 48,
  targetHeightIn: 36,
  orientation: 'portrait', // 'portrait' (8.5x11) | 'landscape' (11x8.5)
  marginIn: 0.5,
  overlapIn: 0,
  showCropMarks: true,
  showPageLabels: true,
  includeGuidePage: true,
  previewNumbers: true,
  previewDimensions: true,
  previewWasteArea: true,
};

// DOM References
const dom = {
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('fileInput'),
  fileMeta: document.getElementById('fileMeta'),
  sampleBtn: document.getElementById('sampleBtn'),
  targetWidth: document.getElementById('targetWidth'),
  targetHeight: document.getElementById('targetHeight'),
  chips: document.querySelectorAll('.chip'),
  orientPortrait: document.getElementById('orientPortrait'),
  orientLandscape: document.getElementById('orientLandscape'),
  marginInput: document.getElementById('marginInput'),
  overlapInput: document.getElementById('overlapInput'),
  tileMathBox: document.getElementById('tileMathBox'),
  showCropMarks: document.getElementById('showCropMarks'),
  showPageLabels: document.getElementById('showPageLabels'),
  includeGuidePage: document.getElementById('includeGuidePage'),
  exportPdfBtn: document.getElementById('exportPdfBtn'),
  exportBtnText: document.getElementById('exportBtnText'),
  progressContainer: document.getElementById('progressContainer'),
  progressFill: document.getElementById('progressFill'),
  progressStatus: document.getElementById('progressStatus'),
  statFinalSize: document.getElementById('statFinalSize'),
  statGrid: document.getElementById('statGrid'),
  statTotalPages: document.getElementById('statTotalPages'),
  statDpi: document.getElementById('statDpi'),
  toggleTileNumbers: document.getElementById('toggleTileNumbers'),
  toggleDimensions: document.getElementById('toggleDimensions'),
  toggleWasteArea: document.getElementById('toggleWasteArea'),
  emptyState: document.getElementById('emptyState'),
  previewCanvas: document.getElementById('previewCanvas'),
  legendOverlap: document.getElementById('legendOverlap'),
};

/**
 * Compute paper & tile grid geometry in inches.
 */
function computeGridMetrics() {
  const pageWidthIn = state.orientation === 'portrait' ? 8.5 : 11.0;
  const pageHeightIn = state.orientation === 'portrait' ? 11.0 : 8.5;

  // Clamp margin and overlap so printable area stays positive
  const marginIn = Math.max(0, Math.min(2.5, state.marginIn));
  const printableW = Math.max(1, pageWidthIn - 2 * marginIn);
  const printableH = Math.max(1, pageHeightIn - 2 * marginIn);

  const overlapIn = Math.max(0, Math.min(printableW * 0.4, printableH * 0.4, state.overlapIn));

  // Step size contributed by each subsequent sheet after overlap
  const stepX = printableW - overlapIn;
  const stepY = printableH - overlapIn;

  const targetW = Math.max(1, state.targetWidthIn);
  const targetH = targetW / state.aspectRatio;

  const cols = targetW <= printableW
    ? 1
    : 1 + Math.ceil((targetW - printableW - 1e-6) / stepX);
  const rows = targetH <= printableH
    ? 1
    : 1 + Math.ceil((targetH - printableH - 1e-6) / stepY);

  // Total grid capacity if all sheets were used to their full printable border
  const totalGridW = cols === 1 ? printableW : printableW + (cols - 1) * stepX;
  const totalGridH = rows === 1 ? printableH : printableH + (rows - 1) * stepY;

  return {
    pageWidthIn,
    pageHeightIn,
    marginIn,
    overlapIn,
    printableW,
    printableH,
    stepX,
    stepY,
    targetW,
    targetH,
    cols,
    rows,
    totalPages: cols * rows,
    totalGridW,
    totalGridH,
  };
}

/**
 * Format inch measurement cleanly (e.g., 48 or 36.25)
 */
function fmtIn(val) {
  return Number(val.toFixed(2)).toString();
}

/**
 * Update sidebar text, stats bar, and redraw the canvas preview.
 */
function updateUI() {
  const m = computeGridMetrics();
  state.targetHeightIn = m.targetH;
  dom.targetHeight.value = m.targetH.toFixed(2);

  // Update preset chip highlight
  dom.chips.forEach((chip) => {
    const w = parseFloat(chip.dataset.width);
    chip.classList.toggle('active', Math.abs(w - state.targetWidthIn) < 0.01);
  });

  // Update orientation buttons
  dom.orientPortrait.classList.toggle('active', state.orientation === 'portrait');
  dom.orientLandscape.classList.toggle('active', state.orientation === 'landscape');

  // Update tile math summary
  if (m.overlapIn > 0) {
    dom.tileMathBox.innerHTML =
      `Each ${m.pageWidthIn}"×${m.pageHeightIn}" sheet prints up to <strong>${m.printableW.toFixed(2)}" × ${m.printableH.toFixed(2)}"</strong> ` +
      `(advances <strong>${m.stepX.toFixed(2)}" × ${m.stepY.toFixed(2)}"</strong> per tile with ${m.overlapIn.toFixed(2)}" overlap).`;
  } else {
    dom.tileMathBox.innerHTML =
      `Each ${m.pageWidthIn}"×${m.pageHeightIn}" sheet prints a <strong>${m.printableW.toFixed(2)}" × ${m.printableH.toFixed(2)}"</strong> net tile once ${m.marginIn}" margins are trimmed.`;
  }

  dom.legendOverlap.hidden = m.overlapIn <= 0;

  // Update Top Stats Bar
  dom.statFinalSize.textContent = `${fmtIn(m.targetW)}" × ${fmtIn(m.targetH)}"`;
  dom.statGrid.textContent = `${m.cols} col${m.cols > 1 ? 's' : ''} × ${m.rows} row${m.rows > 1 ? 's' : ''}`;
  dom.statTotalPages.textContent = `${m.totalPages} sheet${m.totalPages > 1 ? 's' : ''}`;

  if (state.image) {
    const dpi = Math.round(state.image.naturalWidth / m.targetW);
    dom.statDpi.textContent = `${dpi} DPI`;
    dom.exportPdfBtn.disabled = false;
  } else {
    dom.statDpi.textContent = '—';
    dom.exportPdfBtn.disabled = true;
  }

  renderPreview(m);
}

/**
 * Draw the uploaded image and overlaid cut lines / tile boundaries onto the preview canvas.
 */
function renderPreview(m) {
  if (!state.image) {
    dom.emptyState.hidden = false;
    dom.previewCanvas.hidden = true;
    return;
  }

  dom.emptyState.hidden = true;
  dom.previewCanvas.hidden = false;

  const canvas = dom.previewCanvas;
  const ctx = canvas.getContext('2d');

  // Determine extent in inches to visualize
  const extentW = state.previewWasteArea ? Math.max(m.targetW, m.totalGridW) : m.targetW;
  const extentH = state.previewWasteArea ? Math.max(m.targetH, m.totalGridH) : m.targetH;

  // Margin around the drawing for dimension callouts
  const rulerMarginTop = state.previewDimensions ? 44 : 18;
  const rulerMarginLeft = state.previewDimensions ? 54 : 18;
  const rulerMarginRight = 24;
  const rulerMarginBottom = 24;

  // Compute scale (pixels per inch on preview canvas)
  const maxStageW = 1050;
  const maxStageH = 720;
  const scale = Math.min(
    (maxStageW - rulerMarginLeft - rulerMarginRight) / extentW,
    (maxStageH - rulerMarginTop - rulerMarginBottom) / extentH
  );

  const imgPxW = m.targetW * scale;
  const imgPxH = m.targetH * scale;

  canvas.width = Math.ceil(extentW * scale + rulerMarginLeft + rulerMarginRight);
  canvas.height = Math.ceil(extentH * scale + rulerMarginTop + rulerMarginBottom);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const ox = rulerMarginLeft;
  const oy = rulerMarginTop;

  // 1. If showing full paper extent, draw the unprinted overhang area first
  if (state.previewWasteArea && (m.totalGridW > m.targetW || m.totalGridH > m.targetH)) {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(ox, oy, m.totalGridW * scale, m.totalGridH * scale);

    // Subtle diagonal hatch on overhang paper area
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.lineWidth = 1;
    const gw = m.totalGridW * scale;
    const gh = m.totalGridH * scale;
    ctx.beginPath();
    for (let d = -gh; d < gw; d += 12) {
      ctx.moveTo(ox + Math.max(0, d), oy + Math.max(0, -d));
      ctx.lineTo(ox + Math.min(gw, d + gh), oy + Math.min(gh, gh - d));
    }
    ctx.stroke();
    ctx.restore();
  }

  // 2. Draw the uploaded image scaled to targetW x targetH
  ctx.save();
  ctx.drawImage(state.image, ox, oy, imgPxW, imgPxH);
  ctx.restore();

  // 3. Draw each tile's boundaries, overlap zones, and page labels
  let pageNum = 1;
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      const tileStartXIn = c * m.stepX;
      const tileStartYIn = r * m.stepY;

      // Full printable sheet footprint
      const fullTileWIn = m.printableW;
      const fullTileHIn = m.printableH;

      // Clipped active image region on this sheet
      const activeWIn = Math.max(0, Math.min(fullTileWIn, m.targetW - tileStartXIn));
      const activeHIn = Math.max(0, Math.min(fullTileHIn, m.targetH - tileStartYIn));

      const tx = ox + tileStartXIn * scale;
      const ty = oy + tileStartYIn * scale;
      const activeW = activeWIn * scale;
      const activeH = activeHIn * scale;
      const fullW = fullTileWIn * scale;
      const fullH = fullTileHIn * scale;

      // Draw overlap strip if overlap > 0
      if (m.overlapIn > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(244, 63, 94, 0.28)';
        if (c < m.cols - 1 && activeWIn > m.stepX) {
          const ovW = (activeWIn - m.stepX) * scale;
          ctx.fillRect(tx + m.stepX * scale, ty, ovW, activeH);
        }
        if (r < m.rows - 1 && activeHIn > m.stepY) {
          const ovH = (activeHIn - m.stepY) * scale;
          ctx.fillRect(tx, ty + m.stepY * scale, activeW, ovH);
        }
        ctx.restore();
      }

      // Draw overhang outline (amber dashed) if showing full paper extent
      if (state.previewWasteArea && (fullTileWIn > activeWIn + 1e-4 || fullTileHIn > activeHIn + 1e-4)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(tx, ty, fullW, fullH);
        ctx.restore();
      }

      // Draw active image tile seam line (high-contrast dark shadow + bright cyan line)
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.lineWidth = 3.5;
      ctx.strokeRect(tx, ty, activeW, activeH);

      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.75;
      ctx.strokeRect(tx, ty, activeW, activeH);
      ctx.restore();

      // Draw Tile Badge & Individual Tile Dimensions
      if (state.previewNumbers && activeW > 26 && activeH > 20) {
        const cx = tx + activeW / 2;
        const cy = ty + activeH / 2;

        const labelMain = `P${pageNum} (R${r + 1}:C${c + 1})`;
        const labelSub = `${fmtIn(activeWIn)}" × ${fmtIn(activeHIn)}"`;

        ctx.save();
        ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        const showSub = state.previewDimensions && activeW > 72 && activeH > 44;
        const pillW = Math.min(activeW - 6, Math.max(76, ctx.measureText(labelMain).width + 16));
        const pillH = showSub ? 34 : 20;

        // Pill background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
        ctx.lineWidth = 1;
        roundRect(ctx, cx - pillW / 2, cy - pillH / 2, pillW, pillH, 5);
        ctx.fill();
        ctx.stroke();

        // Main label
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelMain, cx, showSub ? cy - 6 : cy);

        // Sub label (tile cut dimensions)
        if (showSub) {
          ctx.font = '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillStyle = '#38bdf8';
          ctx.fillText(labelSub, cx, cy + 8);
        }
        ctx.restore();
      }

      pageNum++;
    }
  }

  // 4. Draw overall outer border of assembled poster
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, imgPxW, imgPxH);
  ctx.restore();

  // 5. Draw Top & Left Dimension Callout Bars
  if (state.previewDimensions) {
    drawDimensionCallout(
      ctx,
      ox,
      oy - 20,
      ox + imgPxW,
      oy - 20,
      `${fmtIn(m.targetW)}" Total Width (${m.cols} ${m.orientation} cols)`,
      false
    );
    drawDimensionCallout(
      ctx,
      ox - 22,
      oy,
      ox - 22,
      oy + imgPxH,
      `${fmtIn(m.targetH)}" Total Height (${m.rows} rows)`,
      true
    );
  }
}

/**
 * Helper to draw a rounded rectangle path.
 */
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Draw technical dimension line with end ticks and centered label.
 */
function drawDimensionCallout(ctx, x1, y1, x2, y2, text, vertical) {
  ctx.save();
  ctx.strokeStyle = '#94a3b8';
  ctx.fillStyle = '#e2e8f0';
  ctx.lineWidth = 1.25;
  ctx.font = '600 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  // Main line
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // End ticks
  const tick = 5;
  ctx.beginPath();
  if (!vertical) {
    ctx.moveTo(x1, y1 - tick);
    ctx.lineTo(x1, y1 + tick);
    ctx.moveTo(x2, y2 - tick);
    ctx.lineTo(x2, y2 + tick);
  } else {
    ctx.moveTo(x1 - tick, y1);
    ctx.lineTo(x1 + tick, y1);
    ctx.moveTo(x2 - tick, y2);
    ctx.lineTo(x2 + tick, y2);
  }
  ctx.stroke();

  // Centered label with dark backing
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  ctx.translate(midX, midY);
  if (vertical) {
    ctx.rotate(-Math.PI / 2);
  }

  const padX = 8;
  const textW = ctx.measureText(text).width;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-textW / 2 - padX, -9, textW + padX * 2, 18);

  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/**
 * Load an image from a File object.
 */
function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('Please select a valid image file (JPG, PNG, WebP).');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.imageName = file.name.replace(/\.[^/.]+$/, '') || 'poster';
      state.aspectRatio = img.naturalWidth / img.naturalHeight;
      dom.fileMeta.textContent = `${file.name} (${img.naturalWidth} × ${img.naturalHeight} px)`;
      updateUI();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * Generate a built-in high-resolution 4:3 sample image so users can immediately test a 48" x 36" split.
 */
function loadSampleImage() {
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = 2400;
  sampleCanvas.height = 1800; // 4:3 aspect ratio -> 48" x 36"
  const ctx = sampleCanvas.getContext('2d');

  // Rich gradient background
  const grad = ctx.createLinearGradient(0, 0, sampleCanvas.width, sampleCanvas.height);
  grad.addColorStop(0, '#0f2027');
  grad.addColorStop(0.5, '#203a43');
  grad.addColorStop(1, '#2c5364');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, sampleCanvas.width, sampleCanvas.height);

  // Decorative reference circles & grid lines so seams are easy to inspect
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 4;
  for (let x = 200; x < sampleCanvas.width; x += 200) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, sampleCanvas.height);
    ctx.stroke();
  }
  for (let y = 200; y < sampleCanvas.height; y += 200) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(sampleCanvas.width, y);
    ctx.stroke();
  }

  // Concentric target rings
  const cx = sampleCanvas.width / 2;
  const cy = sampleCanvas.height / 2;
  const colors = ['#38bdf8', '#10b981', '#f59e0b', '#f43f5e'];
  [750, 560, 380, 200].forEach((r, idx) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = colors[idx];
    ctx.lineWidth = 12;
    ctx.stroke();
  });

  // Diagonal alignment lines from corner to corner
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(sampleCanvas.width, sampleCanvas.height);
  ctx.moveTo(sampleCanvas.width, 0);
  ctx.lineTo(0, sampleCanvas.height);
  ctx.stroke();

  // Center Title Banner
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(cx - 580, cy - 150, 1160, 300);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 6;
  ctx.strokeRect(cx - 580, cy - 150, 1160, 300);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 84px sans-serif';
  ctx.fillText('48" × 36" TEST POSTER', cx, cy - 40);
  ctx.fillStyle = '#38bdf8';
  ctx.font = '500 44px sans-serif';
  ctx.fillText('Trim white margins & tape seams along rings', cx, cy + 55);

  const img = new Image();
  img.onload = () => {
    state.image = img;
    state.imageName = 'sample-48x36-poster';
    state.aspectRatio = img.naturalWidth / img.naturalHeight;
    state.targetWidthIn = 48;
    dom.targetWidth.value = '48';
    dom.fileMeta.textContent = 'Sample 4:3 Test Image (2400 × 1800 px)';
    updateUI();
  };
  img.src = sampleCanvas.toDataURL('image/jpeg', 0.92);
}

/**
 * Generate the multi-page 8.5" x 11" PDF document using jsPDF.
 */
async function generatePDF() {
  if (!state.image || !window.jspdf) {
    alert('PDF library or image not ready yet.');
    return;
  }

  const m = computeGridMetrics();
  const { jsPDF } = window.jspdf;

  dom.exportPdfBtn.disabled = true;
  dom.progressContainer.hidden = false;
  dom.progressFill.style.width = '2%';
  dom.progressStatus.textContent = 'Initializing PDF document...';

  // Let browser paint progress bar
  await new Promise((r) => setTimeout(r, 30));

  const doc = new jsPDF({
    orientation: state.orientation,
    unit: 'in',
    format: [8.5, 11],
    compress: true,
  });

  let isFirstPdfPage = true;

  // Optional Page 1: Assembly Overview Map
  if (state.includeGuidePage) {
    drawAssemblyGuidePage(doc, m);
    isFirstPdfPage = false;
  }

  // Offscreen canvas for cropping each tile cleanly
  const tileCanvas = document.createElement('canvas');
  const tileCtx = tileCanvas.getContext('2d');

  // Pixels per inch in source image
  const srcPxPerInX = state.image.naturalWidth / m.targetW;
  const srcPxPerInY = state.image.naturalHeight / m.targetH;

  // Cap tile render resolution at 300 DPI so memory stays fast while maintaining sharp print quality
  const renderDpi = Math.min(300, Math.max(150, Math.round(srcPxPerInX)));

  let tileIndex = 0;
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      tileIndex++;
      const pct = Math.round((tileIndex / m.totalPages) * 100);
      dom.progressFill.style.width = `${pct}%`;
      dom.progressStatus.textContent = `Rendering Sheet ${tileIndex} of ${m.totalPages} (Row ${r + 1}, Col ${c + 1})...`;
      await new Promise((res) => setTimeout(res, 10));

      if (!isFirstPdfPage) {
        doc.addPage([8.5, 11], state.orientation);
      }
      isFirstPdfPage = false;

      const tileStartXIn = c * m.stepX;
      const tileStartYIn = r * m.stepY;

      const activeWIn = Math.max(0, Math.min(m.printableW, m.targetW - tileStartXIn));
      const activeHIn = Math.max(0, Math.min(m.printableH, m.targetH - tileStartYIn));

      if (activeWIn > 0 && activeHIn > 0) {
        // Crop region from source image in pixels
        const sx = tileStartXIn * srcPxPerInX;
        const sy = tileStartYIn * srcPxPerInY;
        const sw = activeWIn * srcPxPerInX;
        const sh = activeHIn * srcPxPerInY;

        tileCanvas.width = Math.max(1, Math.round(activeWIn * renderDpi));
        tileCanvas.height = Math.max(1, Math.round(activeHIn * renderDpi));

        tileCtx.fillStyle = '#ffffff';
        tileCtx.fillRect(0, 0, tileCanvas.width, tileCanvas.height);
        tileCtx.drawImage(
          state.image,
          sx,
          sy,
          sw,
          sh,
          0,
          0,
          tileCanvas.width,
          tileCanvas.height
        );

        const tileDataUrl = tileCanvas.toDataURL('image/jpeg', 0.92);
        doc.addImage(
          tileDataUrl,
          'JPEG',
          m.marginIn,
          m.marginIn,
          activeWIn,
          activeHIn
        );
      }

      // Draw crop / trim marks around the active image area
      if (state.showCropMarks) {
        drawPageCropMarks(doc, m, c, r, activeWIn, activeHIn);
      }

      // Draw small identification label inside the top/bottom white margin (gets cut off)
      if (state.showPageLabels && m.marginIn >= 0.18) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(110, 110, 110);

        const labelText =
          `Sheet ${tileIndex} of ${m.totalPages}  |  Row ${r + 1}, Col ${c + 1}  |  ` +
          `Cut size: ${fmtIn(activeWIn)}" x ${fmtIn(activeHIn)}"  |  ` +
          `Print at 100% / Actual Size and trim along cut lines`;

        const textY = Math.max(0.14, m.marginIn - 0.12);
        doc.text(labelText, m.marginIn, textY);
      }
    }
  }

  dom.progressStatus.textContent = 'Saving PDF file...';
  const fileName = `${state.imageName}-${fmtIn(m.targetW)}x${fmtIn(m.targetH)}in-${state.orientation}.pdf`;
  doc.save(fileName);

  setTimeout(() => {
    dom.progressContainer.hidden = true;
    dom.exportPdfBtn.disabled = false;
  }, 600);
}

/**
 * Draw Page 1 Assembly Guide Map onto the PDF so the user has a physical reference key.
 */
function drawAssemblyGuidePage(doc, m) {
  const pw = m.pageWidthIn;
  const ph = m.pageHeightIn;
  const pad = 0.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(20, 30, 50);
  doc.text('PrintLarge — Assembly & Trim Guide', pad, pad + 0.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(70, 80, 95);
  doc.text(
    `Final Assembled Size: ${fmtIn(m.targetW)}" W × ${fmtIn(m.targetH)}" H   |   ` +
      `Paper: 8.5" × 11" (${state.orientation.toUpperCase()})   |   ` +
      `Grid: ${m.cols} Cols × ${m.rows} Rows (${m.totalPages} Sheets)`,
    pad,
    pad + 0.45
  );

  const instructions = [
    `1. Print all following ${m.totalPages} pages at "Actual Size" or "100% Scale" (do NOT use "Fit to Page").`,
    `2. Trim off the ${fmtIn(m.marginIn)}" outer white margin along the solid corner/edge cut lines.`,
    m.overlapIn > 0
      ? `3. Align adjacent tiles using the ${fmtIn(m.overlapIn)}" overlap strip (dashed seam line) and tape on the back.`
      : `3. Butt the trimmed edges tightly together in Row/Column order below and tape on the back.`,
  ];

  doc.setFontSize(8.5);
  instructions.forEach((line, idx) => {
    doc.text(line, pad, pad + 0.72 + idx * 0.18);
  });

  // Render the preview canvas image centered in the remaining space
  const availW = pw - pad * 2;
  const availH = ph - (pad + 1.45) - pad;

  const canvasAspect = dom.previewCanvas.width / dom.previewCanvas.height;
  let drawW = availW;
  let drawH = drawW / canvasAspect;
  if (drawH > availH) {
    drawH = availH;
    drawW = drawH * canvasAspect;
  }

  const drawX = pad + (availW - drawW) / 2;
  const drawY = pad + 1.35 + (availH - drawH) / 2;

  const guideDataUrl = dom.previewCanvas.toDataURL('image/jpeg', 0.9);
  doc.addImage(guideDataUrl, 'JPEG', drawX, drawY, drawW, drawH);
}

/**
 * Draw hairline trim marks & light cut borders around the active tile on a PDF page.
 */
function drawPageCropMarks(doc, m, c, r, activeWIn, activeHIn) {
  const x0 = m.marginIn;
  const y0 = m.marginIn;
  const x1 = x0 + activeWIn;
  const y1 = y0 + activeHIn;

  // Light hairline border right on the cut boundary so trimming with scissors or rotary cutter is effortless
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.006);
  doc.setLineDashPattern([], 0);
  doc.rect(x0, y0, activeWIn, activeHIn);

  // Darker corner crop ticks extending into the white margin
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.01);
  const gap = 0.04;
  const tickLen = Math.max(0.08, Math.min(0.28, m.marginIn - 0.06));

  if (m.marginIn > 0.08) {
    // Top-left
    doc.line(x0 - gap - tickLen, y0, x0 - gap, y0);
    doc.line(x0, y0 - gap - tickLen, x0, y0 - gap);

    // Top-right
    doc.line(x1 + gap, y0, x1 + gap + tickLen, y0);
    doc.line(x1, y0 - gap - tickLen, x1, y0 - gap);

    // Bottom-left
    doc.line(x0 - gap - tickLen, y1, x0 - gap, y1);
    doc.line(x0, y1 + gap, x0, y1 + gap + tickLen);

    // Bottom-right
    doc.line(x1 + gap, y1, x1 + gap + tickLen, y1);
    doc.line(x1, y1 + gap, x1, y1 + gap + tickLen);
  }

  // If overlap is enabled, draw a subtle dashed guide where the next tile overlaps
  if (m.overlapIn > 0) {
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.006);
    doc.setLineDashPattern([0.08, 0.08], 0);

    if (c < m.cols - 1 && activeWIn > m.stepX) {
      const seamX = x0 + m.stepX;
      doc.line(seamX, y0 - tickLen, seamX, y0);
      doc.line(seamX, y1, seamX, y1 + tickLen);
    }
    if (r < m.rows - 1 && activeHIn > m.stepY) {
      const seamY = y0 + m.stepY;
      doc.line(x0 - tickLen, seamY, x0, seamY);
      doc.line(x1, seamY, x1 + tickLen, seamY);
    }
    doc.setLineDashPattern([], 0);
  }
}

/**
 * Attach UI Event Listeners
 */
function initEvents() {
  // File upload via click or drag-and-drop
  dom.dropZone.addEventListener('click', () => dom.fileInput.click());
  dom.dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dom.fileInput.click();
    }
  });

  dom.fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });

  dom.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.dropZone.classList.add('dragover');
  });

  dom.dropZone.addEventListener('dragleave', () => {
    dom.dropZone.classList.remove('dragover');
  });

  dom.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // Sample 48"x36" button
  dom.sampleBtn.addEventListener('click', loadSampleImage);

  // Target width input
  dom.targetWidth.addEventListener('input', () => {
    const val = parseFloat(dom.targetWidth.value);
    if (!isNaN(val) && val > 0) {
      state.targetWidthIn = val;
      updateUI();
    }
  });

  // Quick width preset chips
  dom.chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const w = parseFloat(chip.dataset.width);
      state.targetWidthIn = w;
      dom.targetWidth.value = String(w);
      updateUI();
    });
  });

  // Orientation toggle
  dom.orientPortrait.addEventListener('click', () => {
    state.orientation = 'portrait';
    updateUI();
  });

  dom.orientLandscape.addEventListener('click', () => {
    state.orientation = 'landscape';
    updateUI();
  });

  // Margin & Overlap inputs
  dom.marginInput.addEventListener('input', () => {
    const val = parseFloat(dom.marginInput.value);
    if (!isNaN(val) && val >= 0) {
      state.marginIn = val;
      updateUI();
    }
  });

  dom.overlapInput.addEventListener('input', () => {
    const val = parseFloat(dom.overlapInput.value);
    if (!isNaN(val) && val >= 0) {
      state.overlapIn = val;
      updateUI();
    }
  });

  // PDF options
  dom.showCropMarks.addEventListener('change', (e) => {
    state.showCropMarks = e.target.checked;
  });
  dom.showPageLabels.addEventListener('change', (e) => {
    state.showPageLabels = e.target.checked;
  });
  dom.includeGuidePage.addEventListener('change', (e) => {
    state.includeGuidePage = e.target.checked;
  });

  // Preview overlay toggles
  dom.toggleTileNumbers.addEventListener('change', (e) => {
    state.previewNumbers = e.target.checked;
    updateUI();
  });
  dom.toggleDimensions.addEventListener('change', (e) => {
    state.previewDimensions = e.target.checked;
    updateUI();
  });
  dom.toggleWasteArea.addEventListener('change', (e) => {
    state.previewWasteArea = e.target.checked;
    updateUI();
  });

  // Export PDF button
  dom.exportPdfBtn.addEventListener('click', generatePDF);

  // Initial UI render with default 48"x36" math
  updateUI();
}

initEvents();
