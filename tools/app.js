// --- 画面切り替え（ルーター処理） ---
function switchPage(pageId) {
  document
    .querySelectorAll(".page")
    .forEach((page) => page.classList.remove("active"));
  document
    .querySelectorAll("nav button")
    .forEach((btn) => btn.classList.remove("active"));

  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add("active");

  const targetNav = document.getElementById(`nav-${pageId}`);
  if (targetNav) targetNav.classList.add("active");

  window.scrollTo(0, 0);
}

// --- ツール1: VR Image Shifter 処理ロジック ---
const upload = document.getElementById("upload");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const shifterPage = document.getElementById("page-shifter");
const slider = document.getElementById("shiftSlider");
const shiftValueDisplay = document.getElementById("shiftValue");
const canvasOverlay = document.getElementById("canvas-overlay");
const canvasContainer = document.getElementById("canvas-container");
const formatSelect = document.getElementById("formatSelect");
const outputFileNameInput = document.getElementById("outputFileName");
const downloadBtn = document.getElementById("downloadBtn");
const redetectBtn = document.getElementById("redetectBtn");
const formStatus = document.getElementById("formStatus");
const uploadDropZone = document.getElementById("uploadDropZone");
const faceBlurEnabledInput = document.getElementById("faceBlurEnabled");
const faceBlurStatus = document.getElementById("faceBlurStatus");
const blurStrengthSlider = document.getElementById("blurStrengthSlider");
const blurStrengthValue = document.getElementById("blurStrengthValue");
const diffPreviewEnabledInput = document.getElementById("diffPreviewEnabled");
const diffSplitSlider = document.getElementById("diffSplitSlider");
const diffSplitValue = document.getElementById("diffSplitValue");
const compareSplitControl = document.getElementById("compareSplitControl");
const faceGuideEnabledInput = document.getElementById("faceGuideEnabled");
const manualBlurEnabledInput = document.getElementById("manualBlurEnabled");
const eraseBlurEnabledInput = document.getElementById("eraseBlurEnabled");
const clearManualBlurBtn = document.getElementById("clearManualBlurBtn");
const fullImageViewEnabledInput = document.getElementById(
  "fullImageViewEnabled",
);

// Exif入力フォーム要素
const exifMakeInput = document.getElementById("exifMake");
const exifModelInput = document.getElementById("exifModel");
const exifLensModelInput = document.getElementById("exifLensModel");
const exifDateInput = document.getElementById("exifDate");
const exifISOInput = document.getElementById("exifISO");
const exifFNumberInput = document.getElementById("exifFNumber");
const exifExposureTimeInput = document.getElementById("exifExposureTime");
const exifFocalLengthInput = document.getElementById("exifFocalLength");
const exifArtistInput = document.getElementById("exifArtist");
const exifSoftwareInput = document.getElementById("exifSoftware");
const exifCopyrightInput = document.getElementById("exifCopyright");
const exifDescriptionInput = document.getElementById("exifDescription");

// XMP (GPano) 入力フォーム要素
const xmpUsePanoramaViewerSelect = document.getElementById(
  "xmpUsePanoramaViewer",
);
const xmpProjectionTypeInput = document.getElementById("xmpProjectionType");
const xmpFullPanoWidthInput = document.getElementById("xmpFullPanoWidth");
const xmpFullPanoHeightInput = document.getElementById("xmpFullPanoHeight");
const xmpCroppedWidthInput = document.getElementById("xmpCroppedWidth");
const xmpCroppedHeightInput = document.getElementById("xmpCroppedHeight");
const xmpPoseHeadingInput = document.getElementById("xmpPoseHeading");
const xmpInitialViewHeadingInput = document.getElementById(
  "xmpInitialViewHeading",
);

let img = new Image();
let isDragging = false;
let startX;
let baseShift = 0;

let originalMimeType = "image/png";
let originalExtension = "png";
let originalBaseName = "vr_shifted_image";
let currentExifObj = null;
let detectedFaces = [];
let faceDetectRequestId = 0;
let manualBlurRects = [];
let isManualRectDrawing = false;
let manualDragStart = null;
let manualPreviewRect = null;
let blurStrength = blurStrengthSlider
  ? parseInt(blurStrengthSlider.value, 10)
  : 16;
let isEraseRectDrawing = false;
let eraseDragStart = null;
let erasePreviewRect = null;
let canvasZoom = 1;
let isShiftPressed = false;
let diffSplitPercent = diffSplitSlider
  ? parseInt(diffSplitSlider.value, 10)
  : 50;
let isDiffDividerDragging = false;

const CANVAS_ZOOM_MIN = 0.25;
const CANVAS_ZOOM_MAX = 6;
const CANVAS_ZOOM_STEP = 1.12;
const DIFF_DIVIDER_HIT_WIDTH = 16;

const faceDetector =
  typeof FaceDetector !== "undefined"
    ? new FaceDetector({ fastMode: true, maxDetectedFaces: 32 })
    : null;
let fallbackFaceModel = null;
let fallbackFaceModelPromise = null;

function updateFaceBlurStatus(message, isError = false) {
  if (!faceBlurStatus) return;
  faceBlurStatus.textContent = message;
  faceBlurStatus.style.color = isError ? "#b91c1c" : "";
}

function setFormStatus(message, type = "info") {
  if (!formStatus) return;
  formStatus.textContent = message;
  formStatus.classList.remove("error", "success");
  if (type === "error") {
    formStatus.classList.add("error");
  } else if (type === "success") {
    formStatus.classList.add("success");
  }
}

function sanitizeFileBaseName(name) {
  const fallback = "vr_shifted_image";
  const safe = String(name || "")
    .trim()
    .replace(/[\u0000-\u001f<>:"/\\|?*\x7F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return safe || fallback;
}

function isPositiveIntegerString(value) {
  return /^\d+$/.test(value) && parseInt(value, 10) > 0;
}

function isExifDateTimeString(value) {
  return /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(value);
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hasAnyMetadataInput() {
  const fields = [
    exifMakeInput,
    exifModelInput,
    exifLensModelInput,
    exifDateInput,
    exifISOInput,
    exifFNumberInput,
    exifExposureTimeInput,
    exifFocalLengthInput,
    exifArtistInput,
    exifSoftwareInput,
    exifCopyrightInput,
    exifDescriptionInput,
    xmpUsePanoramaViewerSelect,
    xmpProjectionTypeInput,
    xmpFullPanoWidthInput,
    xmpFullPanoHeightInput,
    xmpCroppedWidthInput,
    xmpCroppedHeightInput,
    xmpPoseHeadingInput,
    xmpInitialViewHeadingInput,
  ];

  return fields.some(
    (field) => field && String(field.value || "").trim() !== "",
  );
}

function isImageLikeFile(file) {
  if (!file) return false;

  if (file.type && file.type.startsWith("image/")) {
    return true;
  }

  const fileName = String(file.name || "").toLowerCase();
  return /\.(jpg|jpeg|png|webp|gif|bmp|tif|tiff|heic|heif)$/i.test(fileName);
}

function validateBeforeSave(exportMimeType) {
  const errors = [];

  const exifDate = exifDateInput.value.trim();
  if (exifDate && !isExifDateTimeString(exifDate)) {
    errors.push("・撮影日時は YYYY:MM:DD HH:MM:SS 形式で入力してください。");
  }

  const exifIso = exifISOInput.value.trim();
  if (exifIso && !isPositiveIntegerString(exifIso)) {
    errors.push("・ISO感度は 1 以上の整数で入力してください。");
  }

  if (
    exifFNumberInput.value.trim() &&
    !toRational(exifFNumberInput.value.trim())
  ) {
    errors.push("・F値は数値または分数（例: 2.8 / 28/10）で入力してください。");
  }
  if (
    exifExposureTimeInput.value.trim() &&
    !toRational(exifExposureTimeInput.value.trim())
  ) {
    errors.push("・SSは数値または分数（例: 1/250）で入力してください。");
  }
  if (
    exifFocalLengthInput.value.trim() &&
    !toRational(exifFocalLengthInput.value.trim())
  ) {
    errors.push("・焦点距離は数値または分数で入力してください。");
  }

  const xmpIntegerFields = [
    { label: "全体幅", value: xmpFullPanoWidthInput.value.trim() },
    { label: "全体高さ", value: xmpFullPanoHeightInput.value.trim() },
    { label: "画像幅", value: xmpCroppedWidthInput.value.trim() },
    { label: "画像高さ", value: xmpCroppedHeightInput.value.trim() },
  ];
  for (const field of xmpIntegerFields) {
    if (field.value && !isPositiveIntegerString(field.value)) {
      errors.push(`・${field.label}は 1 以上の整数で入力してください。`);
    }
  }

  const headingFields = [
    { label: "方位角", value: xmpPoseHeadingInput.value.trim() },
    { label: "初期視点方位", value: xmpInitialViewHeadingInput.value.trim() },
  ];
  for (const field of headingFields) {
    if (field.value && Number.isNaN(Number(field.value))) {
      errors.push(`・${field.label}は数値で入力してください。`);
    }
  }

  return errors;
}

function hasBlazeFaceRuntime() {
  return typeof window !== "undefined" && !!window.tf && !!window.blazeface;
}

async function ensureFallbackFaceModel() {
  if (fallbackFaceModel) return fallbackFaceModel;
  if (!hasBlazeFaceRuntime()) return null;

  if (!fallbackFaceModelPromise) {
    fallbackFaceModelPromise = (async () => {
      await window.tf.ready();
      const model = await window.blazeface.load();
      fallbackFaceModel = model;
      return model;
    })().catch((error) => {
      fallbackFaceModelPromise = null;
      throw error;
    });
  }

  return fallbackFaceModelPromise;
}

function clearFaceDetectionState() {
  faceDetectRequestId += 1;
  detectedFaces = [];
}

function clearManualBlurState() {
  manualBlurRects = [];
  isManualRectDrawing = false;
  manualDragStart = null;
  manualPreviewRect = null;
}

function isManualBlurModeOn() {
  return !!(manualBlurEnabledInput && manualBlurEnabledInput.checked);
}

function isEraseBlurModeOn() {
  return !!(eraseBlurEnabledInput && eraseBlurEnabledInput.checked);
}

function getPointerClientXY(event) {
  if (event.touches && event.touches[0]) {
    return {
      clientX: event.touches[0].clientX,
      clientY: event.touches[0].clientY,
    };
  }
  if (event.changedTouches && event.changedTouches[0]) {
    return {
      clientX: event.changedTouches[0].clientX,
      clientY: event.changedTouches[0].clientY,
    };
  }
  return { clientX: event.clientX, clientY: event.clientY };
}

function getCanvasPointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const { clientX, clientY } = getPointerClientXY(event);
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const x = Math.max(0, Math.min(canvas.width, (clientX - rect.left) * scaleX));
  const y = Math.max(0, Math.min(canvas.height, (clientY - rect.top) * scaleY));
  return { x, y };
}

function displayRectToImageRect(displayRect, shift, canvasWidth) {
  const xInImage =
    (((displayRect.x + shift) % canvasWidth) + canvasWidth) % canvasWidth;
  return {
    x: xInImage,
    y: displayRect.y,
    width: displayRect.width,
    height: displayRect.height,
  };
}

function buildRectFromPoints(startPoint, endPoint) {
  const x = Math.min(startPoint.x, endPoint.x);
  const y = Math.min(startPoint.y, endPoint.y);
  const width = Math.abs(endPoint.x - startPoint.x);
  const height = Math.abs(endPoint.y - startPoint.y);
  return { x, y, width, height };
}

function applyCanvasViewMode() {
  if (!canvasContainer) return;

  const useFullImageView = !!(
    fullImageViewEnabledInput && fullImageViewEnabledInput.checked
  );
  const useZoomScrollableView = canvasZoom > 1.001;

  if (useFullImageView || useZoomScrollableView) {
    canvasContainer.classList.add("full-image-view");
  } else {
    canvasContainer.classList.remove("full-image-view");
  }
}

function isDiffPreviewEnabled() {
  return !!(diffPreviewEnabledInput && diffPreviewEnabledInput.checked);
}

function updateDiffSplitDisplay() {
  if (diffSplitValue) {
    diffSplitValue.textContent = `${diffSplitPercent}%`;
  }
  if (
    diffSplitSlider &&
    String(diffSplitSlider.value) !== String(diffSplitPercent)
  ) {
    diffSplitSlider.value = String(diffSplitPercent);
  }
}

function setDiffSplitPercent(nextPercent) {
  diffSplitPercent = Math.round(clamp(Number(nextPercent) || 0, 0, 100));
  updateDiffSplitDisplay();
}

function updateDiffSplitControlVisibility() {
  if (!compareSplitControl) return;

  const shouldShow = isDiffPreviewEnabled() && !!(img.src && img.width > 0);
  compareSplitControl.classList.toggle("visible", shouldShow);
}

function isPointerOnDiffDivider(event) {
  if (!isDiffPreviewEnabled()) return false;
  if (!img.src || img.width === 0 || canvas.width <= 0) return false;

  const point = getCanvasPointFromEvent(event);
  const dividerX = (canvas.width * diffSplitPercent) / 100;
  return Math.abs(point.x - dividerX) <= DIFF_DIVIDER_HIT_WIDTH;
}

function updateDiffDividerByEvent(event) {
  const point = getCanvasPointFromEvent(event);
  setDiffSplitPercent((point.x / canvas.width) * 100);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getCanvasFitWidth() {
  if (!canvas || !canvasContainer) return canvas ? canvas.width : 0;
  const containerWidth = Math.max(1, canvasContainer.clientWidth);
  return Math.min(canvas.width, containerWidth);
}

function applyCanvasZoom() {
  if (!canvas) return;

  if (img.src && img.width > 0) {
    const useOriginalScale =
      fullImageViewEnabledInput &&
      fullImageViewEnabledInput.checked &&
      Math.abs(canvasZoom - 1) < 0.001;

    const baseWidth = useOriginalScale ? canvas.width : getCanvasFitWidth();
    const zoomedWidth = Math.max(1, Math.round(baseWidth * canvasZoom));
    canvas.style.width = `${zoomedWidth}px`;
    canvas.style.height = "auto";
  } else {
    canvas.style.width = "";
    canvas.style.height = "";
  }

  applyCanvasViewMode();
}

function resetCanvasZoom() {
  canvasZoom = 1;
  applyCanvasZoom();
}

function handleCanvasWheelZoom(event) {
  if (!canvasContainer) return;

  const wheelTarget = event.target;
  const isOnCanvasArea =
    wheelTarget instanceof Node && canvasContainer.contains(wheelTarget);
  if (!isOnCanvasArea) return;

  if (!(event.shiftKey || isShiftPressed)) return;
  if (!img.src || img.width === 0) return;

  event.preventDefault();

  const prevZoom = canvasZoom;
  const axisDelta =
    Math.abs(event.deltaY) >= Math.abs(event.deltaX) && event.deltaY !== 0
      ? event.deltaY
      : event.deltaX;
  if (axisDelta === 0) return;

  const normalizedDelta = axisDelta / 100;
  const scaleFactor = Math.pow(CANVAS_ZOOM_STEP, -normalizedDelta);
  canvasZoom = clamp(
    canvasZoom * scaleFactor,
    CANVAS_ZOOM_MIN,
    CANVAS_ZOOM_MAX,
  );

  if (Math.abs(prevZoom - canvasZoom) < 0.0001) return;

  const targetRect = canvas.getBoundingClientRect();
  const pointerX = event.clientX - targetRect.left;
  const pointerY = event.clientY - targetRect.top;

  const scrollBaseX = canvasContainer
    ? canvasContainer.scrollLeft + pointerX
    : 0;
  const scrollBaseY = canvasContainer
    ? canvasContainer.scrollTop + pointerY
    : 0;

  applyCanvasZoom();

  if (canvasContainer) {
    const ratio = canvasZoom / prevZoom;
    canvasContainer.scrollLeft = scrollBaseX * ratio - pointerX;
    canvasContainer.scrollTop = scrollBaseY * ratio - pointerY;
  }
}

function sanitizeFaceBox(box) {
  if (!box) return null;
  const width = Number(box.width);
  const height = Number(box.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;

  const x = Math.max(0, Number(box.x) || 0);
  const y = Math.max(0, Number(box.y) || 0);
  return { x, y, width, height };
}

function boxArea(box) {
  return box.width * box.height;
}

function calcIoU(boxA, boxB) {
  const x1 = Math.max(boxA.x, boxB.x);
  const y1 = Math.max(boxA.y, boxB.y);
  const x2 = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
  const y2 = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

  const interWidth = x2 - x1;
  const interHeight = y2 - y1;
  if (interWidth <= 0 || interHeight <= 0) return 0;

  const intersection = interWidth * interHeight;
  const union = boxArea(boxA) + boxArea(boxB) - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

function isRectOverlapping(rectA, rectB) {
  const ax2 = rectA.x + rectA.width;
  const ay2 = rectA.y + rectA.height;
  const bx2 = rectB.x + rectB.width;
  const by2 = rectB.y + rectB.height;

  return rectA.x < bx2 && ax2 > rectB.x && rectA.y < by2 && ay2 > rectB.y;
}

function dedupeFaceBoxes(boxes, iouThreshold = 0.35) {
  const sorted = [...boxes].sort((a, b) => boxArea(b) - boxArea(a));
  const accepted = [];

  for (const candidate of sorted) {
    const hasDuplicate = accepted.some(
      (picked) => calcIoU(candidate, picked) >= iouThreshold,
    );
    if (!hasDuplicate) {
      accepted.push(candidate);
    }
  }

  return accepted;
}

function createTempCanvas(width, height) {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = Math.max(1, Math.floor(width));
  tempCanvas.height = Math.max(1, Math.floor(height));
  return tempCanvas;
}

async function detectFacesFromSource(source, mapBox) {
  if (faceDetector) {
    const faces = await faceDetector.detect(source);
    return faces
      .map((face) => (face && face.boundingBox ? face.boundingBox : null))
      .map((box) => (box ? mapBox(box) : null))
      .map(sanitizeFaceBox)
      .filter(Boolean);
  }

  const fallbackModel = await ensureFallbackFaceModel();
  if (!fallbackModel) {
    return [];
  }

  const predictions = await fallbackModel.estimateFaces(source, false);
  return predictions
    .map((prediction) => {
      if (!prediction || !prediction.topLeft || !prediction.bottomRight) {
        return null;
      }

      const [left, top] = prediction.topLeft;
      const [right, bottom] = prediction.bottomRight;
      return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
    })
    .map((box) => (box ? mapBox(box) : null))
    .map(sanitizeFaceBox)
    .filter(Boolean);
}

async function detectFacesInImage() {
  if (!img.src || img.width === 0) return;

  if (!faceDetector && !hasBlazeFaceRuntime()) {
    updateFaceBlurStatus(
      "このブラウザは顔の自動検出に未対応です（手動ぼかしモードをご利用ください）。",
      true,
    );
    draw();
    return;
  }

  const requestId = ++faceDetectRequestId;
  const detectorLabel = faceDetector ? "標準" : "互換";
  updateFaceBlurStatus(`顔を自動検出しています（${detectorLabel}モード）...`);

  try {
    const allBoxes = [];

    const baseFaces = await detectFacesFromSource(img, (box) => box);
    allBoxes.push(...baseFaces);

    const longestSide = Math.max(img.width, img.height);
    const fullScale = Math.min(2, 4096 / longestSide);
    if (fullScale > 1.05) {
      const scaledCanvas = createTempCanvas(
        img.width * fullScale,
        img.height * fullScale,
      );
      const scaledCtx = scaledCanvas.getContext("2d", { alpha: false });
      scaledCtx.drawImage(img, 0, 0, scaledCanvas.width, scaledCanvas.height);

      const scaledFaces = await detectFacesFromSource(scaledCanvas, (box) => ({
        x: box.x / fullScale,
        y: box.y / fullScale,
        width: box.width / fullScale,
        height: box.height / fullScale,
      }));
      allBoxes.push(...scaledFaces);
    }

    const tileBaseWidth = 1800;
    const tileOverlap = 300;
    const tileStep = Math.max(1, tileBaseWidth - tileOverlap);
    const tileScale = 1.6;

    for (let tileX = 0; tileX < img.width; tileX += tileStep) {
      if (requestId !== faceDetectRequestId) return;

      const srcWidth = Math.min(tileBaseWidth, img.width - tileX);
      const srcHeight = img.height;

      const tileCanvas = createTempCanvas(
        srcWidth * tileScale,
        srcHeight * tileScale,
      );
      const tileCtx = tileCanvas.getContext("2d", { alpha: false });
      tileCtx.drawImage(
        img,
        tileX,
        0,
        srcWidth,
        srcHeight,
        0,
        0,
        tileCanvas.width,
        tileCanvas.height,
      );

      const tileFaces = await detectFacesFromSource(tileCanvas, (box) => ({
        x: tileX + box.x / tileScale,
        y: box.y / tileScale,
        width: box.width / tileScale,
        height: box.height / tileScale,
      }));
      allBoxes.push(...tileFaces);
    }

    if (requestId !== faceDetectRequestId) return;

    detectedFaces = dedupeFaceBoxes(
      allBoxes.filter((box) => box.width >= 8 && box.height >= 8),
    );

    if (detectedFaces.length > 0) {
      updateFaceBlurStatus(
        `顔を${detectedFaces.length}件検出しました。ぼかしを適用中です。`,
      );
    } else {
      updateFaceBlurStatus(
        "顔は検出されませんでした。全画像表示をONにして赤枠を確認し、別カットでもお試しください。",
      );
    }
  } catch (error) {
    if (requestId !== faceDetectRequestId) return;
    detectedFaces = [];
    updateFaceBlurStatus(
      "顔検出に失敗しました。別画像で再度お試しください。",
      true,
    );
    console.warn("顔検出エラー:", error);
  }

  draw();
}

function splitWrappedRect(x, y, width, height, canvasWidth, canvasHeight) {
  const clippedY = Math.max(0, y);
  const clippedHeight = Math.min(height, canvasHeight - clippedY);
  if (clippedHeight <= 0 || width <= 0) return [];

  const normalizedX = ((x % canvasWidth) + canvasWidth) % canvasWidth;
  if (normalizedX + width <= canvasWidth) {
    return [{ x: normalizedX, y: clippedY, width, height: clippedHeight }];
  }

  const firstWidth = canvasWidth - normalizedX;
  const secondWidth = width - firstWidth;
  return [
    { x: normalizedX, y: clippedY, width: firstWidth, height: clippedHeight },
    { x: 0, y: clippedY, width: secondWidth, height: clippedHeight },
  ];
}

function drawBlurRect(rect) {
  const blurPadding = Math.max(6, Math.ceil(blurStrength * 0.8));
  const sx = Math.max(0, Math.floor(rect.x - blurPadding));
  const sy = Math.max(0, Math.floor(rect.y - blurPadding));
  const ex = Math.min(
    canvas.width,
    Math.ceil(rect.x + rect.width + blurPadding),
  );
  const ey = Math.min(
    canvas.height,
    Math.ceil(rect.y + rect.height + blurPadding),
  );
  const width = ex - sx;
  const height = ey - sy;

  if (width <= 0 || height <= 0) return;

  ctx.save();
  ctx.filter = `blur(${blurStrength}px)`;
  ctx.drawImage(canvas, sx, sy, width, height, sx, sy, width, height);
  ctx.restore();
}

function drawGuideLabel(rect, text, backgroundColor) {
  if (!text) return;

  const labelPaddingX = 8;
  const labelHeight = 18;

  ctx.save();
  ctx.font =
    "bold 11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  const textWidth = Math.ceil(ctx.measureText(text).width);
  const labelWidth = textWidth + labelPaddingX * 2;
  const labelX = Math.max(0, Math.floor(rect.x));
  const labelY = Math.max(0, Math.floor(rect.y) - (labelHeight + 2));

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, labelX + labelPaddingX, labelY + labelHeight / 2);
  ctx.restore();
}

function drawGuideRect(rect, options = {}) {
  const {
    strokeColor,
    fillColor,
    lineWidth = 2,
    dashed = false,
    labelText = "",
    labelColor = strokeColor,
  } = options;

  ctx.save();
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  if (dashed) {
    ctx.setLineDash([10, 6]);
  }
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(
    Math.floor(rect.x) + 0.5,
    Math.floor(rect.y) + 0.5,
    Math.max(1, Math.floor(rect.width) - 1),
    Math.max(1, Math.floor(rect.height) - 1),
  );
  ctx.restore();

  drawGuideLabel(rect, labelText, labelColor);
}

function drawFaceGuideRect(rect) {
  drawGuideRect(rect, {
    strokeColor: "rgba(220, 38, 38, 0.98)",
    fillColor: "rgba(239, 68, 68, 0.18)",
    lineWidth: 2.5,
    labelText: "自動ぼかし",
    labelColor: "rgba(185, 28, 28, 0.95)",
  });
}

function drawManualGuideRect(rect, isPreview = false) {
  drawGuideRect(rect, {
    strokeColor: isPreview
      ? "rgba(234, 88, 12, 0.98)"
      : "rgba(194, 65, 12, 0.98)",
    fillColor: isPreview
      ? "rgba(251, 146, 60, 0.14)"
      : "rgba(249, 115, 22, 0.18)",
    lineWidth: isPreview ? 2.5 : 2,
    dashed: isPreview,
    labelText: isPreview ? "手動範囲(追加中)" : "手動ぼかし",
    labelColor: "rgba(194, 65, 12, 0.95)",
  });
}

function drawEraseGuideRect(rect) {
  drawGuideRect(rect, {
    strokeColor: "rgba(37, 99, 235, 0.98)",
    fillColor: "rgba(59, 130, 246, 0.14)",
    lineWidth: 2.5,
    dashed: true,
    labelText: "解除範囲",
    labelColor: "rgba(29, 78, 216, 0.95)",
  });
}

function drawFaceBlurOverlays(
  shift,
  canvasWidth,
  canvasHeight,
  showGuides = true,
) {
  if (!faceBlurEnabledInput || !faceBlurEnabledInput.checked) return;
  if (!detectedFaces.length) return;

  const drawGuides =
    showGuides && faceGuideEnabledInput && faceGuideEnabledInput.checked;

  for (const face of detectedFaces) {
    const shiftedX = face.x - shift;
    const rects = splitWrappedRect(
      shiftedX,
      face.y,
      face.width,
      face.height,
      canvasWidth,
      canvasHeight,
    );
    for (const rect of rects) {
      drawBlurRect(rect);
      if (drawGuides) {
        drawFaceGuideRect(rect);
      }
    }
  }
}

function drawManualBlurOverlays(
  shift,
  canvasWidth,
  canvasHeight,
  showGuides = true,
) {
  if (!manualBlurRects.length) return;

  const drawGuides =
    showGuides && faceGuideEnabledInput && faceGuideEnabledInput.checked;

  for (const manualRect of manualBlurRects) {
    const shiftedX = manualRect.x - shift;
    const rects = splitWrappedRect(
      shiftedX,
      manualRect.y,
      manualRect.width,
      manualRect.height,
      canvasWidth,
      canvasHeight,
    );

    for (const rect of rects) {
      drawBlurRect(rect);
      if (drawGuides) {
        drawManualGuideRect(rect, false);
      }
    }
  }

  if (drawGuides && manualPreviewRect && isManualRectDrawing) {
    drawManualGuideRect(manualPreviewRect, true);
  }
}

function removeBlurRectsInArea(displayRect) {
  if (!displayRect || displayRect.width <= 0 || displayRect.height <= 0) {
    return { removedAuto: 0, removedManual: 0 };
  }

  const shift = parseInt(slider.value);
  const imageRect = displayRectToImageRect(displayRect, shift, canvas.width);

  const beforeAutoCount = detectedFaces.length;
  detectedFaces = detectedFaces.filter(
    (faceRect) => !isRectOverlapping(faceRect, imageRect),
  );

  const beforeManualCount = manualBlurRects.length;
  manualBlurRects = manualBlurRects.filter(
    (manualRect) => !isRectOverlapping(manualRect, imageRect),
  );

  return {
    removedAuto: beforeAutoCount - detectedFaces.length,
    removedManual: beforeManualCount - manualBlurRects.length,
  };
}

// 分数データ [分子, 分母] を数値や文字列に変換するヘルパー関数
function parseRational(rational) {
  if (!rational) return "";
  if (Array.isArray(rational) && rational.length === 2) {
    if (rational[1] === 0) return "";
    if (rational[0] === 1) return `1/${rational[1]}`;
    return (rational[0] / rational[1]).toString();
  }
  return rational.toString();
}

// 入力文字列を Exif用 [分子, 分母] に変換するヘルパー関数
function toRational(str) {
  if (!str) return null;
  str = str.toString().trim();

  if (str.includes("/")) {
    const parts = str.split("/");
    const num = parseInt(parts[0], 10);
    const den = parseInt(parts[1], 10);
    return !isNaN(num) && !isNaN(den) && den !== 0 ? [num, den] : null;
  }

  const val = parseFloat(str);
  if (isNaN(val)) return null;

  if (Number.isInteger(val)) {
    return [val, 1];
  } else {
    return [Math.round(val * 100), 100];
  }
}

// 🔍 JPEGデータURLからXMP(GPano)テキストを抽出し解析する関数
function extractGPanoXmp(dataUrl) {
  try {
    const binaryStr = atob(dataUrl.split(",")[1]);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

    if (
      !text.includes("http://ns.google.com/photos/1.0/panorama/") &&
      !text.includes("GPano:")
    ) {
      return null; // GPanoメタデータが存在しない
    }

    const getTagValue = (tagName) => {
      const reg1 = new RegExp(
        `<GPano:${tagName}>([^<]+)<\/GPano:${tagName}>`,
        "i",
      );
      const reg2 = new RegExp(`GPano:${tagName}="([^"]+)"`, "i");
      const match1 = text.match(reg1);
      if (match1) return match1[1];
      const match2 = text.match(reg2);
      if (match2) return match2[1];
      return null;
    };

    return {
      usePanoramaViewer: getTagValue("UsePanoramaViewer"),
      projectionType: getTagValue("ProjectionType"),
      fullPanoWidth: getTagValue("FullPanoWidthPixels"),
      fullPanoHeight: getTagValue("FullPanoHeightPixels"),
      croppedWidth: getTagValue("CroppedAreaImageWidthPixels"),
      croppedHeight: getTagValue("CroppedAreaImageHeightPixels"),
      poseHeading: getTagValue("PoseHeadingDegrees"),
      initialViewHeading: getTagValue("InitialViewHeadingDegrees"),
    };
  } catch (e) {
    console.warn("XMP解析エラー:", e);
    return null;
  }
}

// フォームのリセット処理
function clearXmpForm() {
  xmpUsePanoramaViewerSelect.value = "";
  xmpProjectionTypeInput.value = "";
  xmpFullPanoWidthInput.value = "";
  xmpFullPanoHeightInput.value = "";
  xmpCroppedWidthInput.value = "";
  xmpCroppedHeightInput.value = "";
  xmpPoseHeadingInput.value = "";
  xmpInitialViewHeadingInput.value = "";
}

function processImageFile(file) {
  if (!file) return;

  if (!isImageLikeFile(file)) {
    setFormStatus("画像ファイルを選択してください。", "error");
    return;
  }

  clearFaceDetectionState();
  clearManualBlurState();
  resetCanvasZoom();
  if (downloadBtn) downloadBtn.disabled = true;
  if (redetectBtn) redetectBtn.disabled = true;
  updateFaceBlurStatus("画像を読み込み中です...");
  setFormStatus("画像を読み込み中です...", "info");

  originalMimeType = file.type || "image/png";
  const nameParts = file.name.split(".");
  if (nameParts.length > 1) {
    originalExtension = nameParts.pop().toLowerCase();
    originalBaseName = sanitizeFileBaseName(nameParts.join("."));
  } else {
    originalExtension = originalMimeType.split("/")[1] || "png";
    originalBaseName = sanitizeFileBaseName(file.name);
  }

  if (outputFileNameInput) {
    outputFileNameInput.value = sanitizeFileBaseName(
      `${originalBaseName}_edited`,
    );
  }

  // --- ExifおよびXMP情報の解析処理 ---
  const exifReader = new FileReader();
  exifReader.onload = function (evt) {
    const dataUrl = evt.target.result;

    // 1. Exif解析
    try {
      currentExifObj = piexif.load(dataUrl);

      exifMakeInput.value = currentExifObj["0th"][piexif.ImageIFD.Make] || "";
      exifModelInput.value = currentExifObj["0th"][piexif.ImageIFD.Model] || "";
      exifArtistInput.value =
        currentExifObj["0th"][piexif.ImageIFD.Artist] || "";
      exifSoftwareInput.value =
        currentExifObj["0th"][piexif.ImageIFD.Software] || "Turumaru";
      exifCopyrightInput.value =
        currentExifObj["0th"][piexif.ImageIFD.Copyright] || "";
      exifDescriptionInput.value =
        currentExifObj["0th"][piexif.ImageIFD.ImageDescription] || "";

      exifDateInput.value =
        currentExifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] ||
        currentExifObj["0th"][piexif.ImageIFD.DateTime] ||
        "";
      exifLensModelInput.value =
        currentExifObj["Exif"][piexif.ExifIFD.LensModel] || "";

      const iso = currentExifObj["Exif"][piexif.ExifIFD.ISOSpeedRatings];
      exifISOInput.value = Array.isArray(iso) ? iso[0] : iso || "";

      exifFNumberInput.value = parseRational(
        currentExifObj["Exif"][piexif.ExifIFD.FNumber],
      );
      exifExposureTimeInput.value = parseRational(
        currentExifObj["Exif"][piexif.ExifIFD.ExposureTime],
      );
      exifFocalLengthInput.value = parseRational(
        currentExifObj["Exif"][piexif.ExifIFD.FocalLength],
      );
    } catch (err) {
      currentExifObj = { "0th": {}, Exif: {}, GPS: {} };
      exifMakeInput.value = "";
      exifModelInput.value = "";
      exifLensModelInput.value = "";
      exifDateInput.value = "";
      exifISOInput.value = "";
      exifFNumberInput.value = "";
      exifExposureTimeInput.value = "";
      exifFocalLengthInput.value = "";
      exifArtistInput.value = "";
      exifSoftwareInput.value = "Turumaru";
      exifCopyrightInput.value = "";
      exifDescriptionInput.value = "";
    }

    // 2. XMP(GPano) 解析とフォームへの反映
    const gPano = extractGPanoXmp(dataUrl);
    if (gPano) {
      xmpUsePanoramaViewerSelect.value = gPano.usePanoramaViewer || "True";
      xmpProjectionTypeInput.value = gPano.projectionType || "equirectangular";
      xmpFullPanoWidthInput.value = gPano.fullPanoWidth || "";
      xmpFullPanoHeightInput.value = gPano.fullPanoHeight || "";
      xmpCroppedWidthInput.value = gPano.croppedWidth || "";
      xmpCroppedHeightInput.value = gPano.croppedHeight || "";
      xmpPoseHeadingInput.value = gPano.poseHeading || "";
      xmpInitialViewHeadingInput.value = gPano.initialViewHeading || "";
    } else {
      clearXmpForm();
    }
  };
  exifReader.readAsDataURL(file);

  // --- Canvas画像描画処理 ---
  const reader = new FileReader();
  reader.onload = (event) => {
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      slider.max = img.width - 1;
      slider.value = 0;
      if (downloadBtn) downloadBtn.disabled = false;
      if (redetectBtn) redetectBtn.disabled = false;
      setFormStatus("画像を読み込みました。編集後に保存できます。", "success");
      draw();
      detectFacesInImage();
    };
    img.onerror = () => {
      setFormStatus(
        "画像の読み込みに失敗しました。破損ファイルまたは未対応形式の可能性があります。",
        "error",
      );
      if (downloadBtn) downloadBtn.disabled = true;
      if (redetectBtn) redetectBtn.disabled = true;
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

window.processImageFile = processImageFile;

function getFirstDroppedImageFile(event) {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return null;

  const files = [];

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (let index = 0; index < dataTransfer.items.length; index += 1) {
      const item = dataTransfer.items[index];
      if (!item || item.kind !== "file") continue;
      const file = item.getAsFile ? item.getAsFile() : null;
      if (file) files.push(file);
    }
  }

  if (
    files.length === 0 &&
    dataTransfer.files &&
    dataTransfer.files.length > 0
  ) {
    for (let index = 0; index < dataTransfer.files.length; index += 1) {
      const file = dataTransfer.files[index];
      if (file) files.push(file);
    }
  }

  for (let index = 0; index < files.length; index += 1) {
    if (isImageLikeFile(files[index])) {
      return files[index];
    }
  }

  return files[0] || null;
}

function handleDroppedImage(event) {
  const file = getFirstDroppedImageFile(event);
  if (!file) {
    setFormStatus(
      "ドロップデータに画像ファイルが見つかりませんでした。Finderから画像ファイル本体をドロップしてください。",
      "error",
    );
    return;
  }

  setFormStatus(
    `ドロップ画像を読み込みます: ${file.name || "(名称不明)"}`,
    "info",
  );

  processImageFile(file);
}

// 画像読み込み
upload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  processImageFile(file);
});

if (uploadDropZone) {
  const preventDefaults = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    uploadDropZone.addEventListener(eventName, preventDefaults);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    uploadDropZone.addEventListener(eventName, () => {
      uploadDropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    uploadDropZone.addEventListener(eventName, () => {
      uploadDropZone.classList.remove("drag-over");
    });
  });

  uploadDropZone.addEventListener("drop", (event) => {
    handleDroppedImage(event);
  });
}

if (shifterPage) {
  const isShifterActive = () => shifterPage.classList.contains("active");

  const suppressBrowserDropBehavior = (event) => {
    if (!isShifterActive()) return;

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  window.addEventListener("dragenter", suppressBrowserDropBehavior);
  window.addEventListener("dragover", suppressBrowserDropBehavior);
  window.addEventListener("drop", suppressBrowserDropBehavior);

  window.addEventListener("drop", (event) => {
    if (!isShifterActive()) return;
    event.preventDefault();
    handleDroppedImage(event);
  });

  shifterPage.addEventListener("drop", (event) => {
    if (!isShifterActive()) return;

    event.preventDefault();
    event.stopPropagation();
    handleDroppedImage(event);
  });
}

// 描画ロジック
function draw(showGuides = true, showDiff = true) {
  if (!img.src || img.width === 0) return;

  const shift = parseInt(slider.value);
  const w = canvas.width;
  const h = canvas.height;

  ctx.drawImage(img, shift, 0, w - shift, h, 0, 0, w - shift, h);
  ctx.drawImage(img, 0, 0, shift, h, w - shift, 0, shift, h);
  drawFaceBlurOverlays(shift, w, h, showGuides);
  drawManualBlurOverlays(shift, w, h, showGuides);

  if (showDiff && isDiffPreviewEnabled()) {
    const dividerX = clamp(Math.round((w * diffSplitPercent) / 100), 0, w);

    if (dividerX < w) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(dividerX, 0, w - dividerX, h);
      ctx.clip();
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(dividerX + 0.5, 0);
    ctx.lineTo(dividerX + 0.5, h);
    ctx.stroke();

    ctx.strokeStyle = "rgba(15, 23, 42, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dividerX - 0.5, 0);
    ctx.lineTo(dividerX - 0.5, h);
    ctx.stroke();

    const handleY = Math.round(h / 2);
    const handleWidth = 18;
    const handleHeight = 34;
    const handleX = dividerX - Math.round(handleWidth / 2);
    ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
    ctx.fillRect(
      handleX,
      handleY - Math.round(handleHeight / 2),
      handleWidth,
      handleHeight,
    );
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillRect(dividerX - 1, handleY - 9, 2, 18);

    const markerBaseY = h - 2;
    const markerHalfWidth = 12;
    const markerHeight = 16;
    ctx.beginPath();
    ctx.moveTo(dividerX, markerBaseY - markerHeight);
    ctx.lineTo(dividerX - markerHalfWidth, markerBaseY);
    ctx.lineTo(dividerX + markerHalfWidth, markerBaseY);
    ctx.closePath();
    ctx.fillStyle = "rgba(244, 63, 94, 0.98)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.98)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(dividerX, markerBaseY - markerHeight + 4);
    ctx.lineTo(dividerX - (markerHalfWidth - 4), markerBaseY - 2);
    ctx.lineTo(dividerX + (markerHalfWidth - 4), markerBaseY - 2);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fill();

    ctx.font =
      "bold 12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textBaseline = "top";

    const leftLabel = "左: 編集後";
    const rightLabel = "右: 編集前";

    ctx.fillStyle = "rgba(15, 23, 42, 0.66)";
    ctx.fillRect(8, 8, 78, 22);
    ctx.fillRect(Math.max(8, w - 86), 8, 78, 22);

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillText(leftLabel, 14, 13);
    ctx.fillText(rightLabel, Math.max(14, w - 80), 13);
    ctx.restore();
  }

  if (showGuides && isEraseRectDrawing && erasePreviewRect) {
    drawEraseGuideRect(erasePreviewRect);
  }

  shiftValueDisplay.innerText = shift;
  updateDiffSplitControlVisibility();
}

// ドラッグ操作
function startDrag(e) {
  if (!img.src) return;

  if (
    !isManualBlurModeOn() &&
    !isEraseBlurModeOn() &&
    isPointerOnDiffDivider(e)
  ) {
    e.preventDefault();
    isDiffDividerDragging = true;
    updateDiffDividerByEvent(e);
    draw();
    return;
  }

  if (isEraseBlurModeOn()) {
    e.preventDefault();
    isEraseRectDrawing = true;
    eraseDragStart = getCanvasPointFromEvent(e);
    erasePreviewRect = { ...eraseDragStart, width: 0, height: 0 };
    draw();
    return;
  }

  if (isManualBlurModeOn()) {
    e.preventDefault();
    isManualRectDrawing = true;
    manualDragStart = getCanvasPointFromEvent(e);
    manualPreviewRect = { ...manualDragStart, width: 0, height: 0 };
    draw();
    return;
  }

  isDragging = true;
  startX = e.pageX || e.touches[0].pageX;
  baseShift = parseInt(slider.value);
}

function moveDrag(e) {
  if (isDiffDividerDragging) {
    e.preventDefault();
    updateDiffDividerByEvent(e);
    draw();
    return;
  }

  if (isEraseRectDrawing) {
    e.preventDefault();
    const currentPoint = getCanvasPointFromEvent(e);
    erasePreviewRect = buildRectFromPoints(eraseDragStart, currentPoint);
    draw();
    return;
  }

  if (isManualRectDrawing) {
    e.preventDefault();
    const currentPoint = getCanvasPointFromEvent(e);
    manualPreviewRect = buildRectFromPoints(manualDragStart, currentPoint);
    draw();
    return;
  }

  if (!isDragging) return;
  e.preventDefault();
  const x = e.pageX || e.touches[0].pageX;
  const diff = x - startX;

  let newShift = (baseShift - diff) % canvas.width;
  if (newShift < 0) newShift += canvas.width;

  slider.value = newShift;
  draw();
}

function stopDrag() {
  if (isDiffDividerDragging) {
    isDiffDividerDragging = false;
    return;
  }

  if (isEraseRectDrawing) {
    const completedRect = erasePreviewRect;
    isEraseRectDrawing = false;
    eraseDragStart = null;
    erasePreviewRect = null;

    if (
      completedRect &&
      completedRect.width >= 8 &&
      completedRect.height >= 8
    ) {
      const result = removeBlurRectsInArea(completedRect);
      if (result.removedAuto > 0 || result.removedManual > 0) {
        updateFaceBlurStatus(
          `ぼかし解除: 自動${result.removedAuto}件 / 手動${result.removedManual}件`,
        );
      } else {
        updateFaceBlurStatus("指定範囲に解除対象はありませんでした。");
      }
    }

    draw();
    return;
  }

  if (isManualRectDrawing) {
    const completedRect = manualPreviewRect;
    isManualRectDrawing = false;
    manualDragStart = null;
    manualPreviewRect = null;

    if (
      completedRect &&
      completedRect.width >= 10 &&
      completedRect.height >= 10
    ) {
      const shift = parseInt(slider.value);
      manualBlurRects.push(
        displayRectToImageRect(completedRect, shift, canvas.width),
      );
    }

    draw();
    return;
  }

  isDragging = false;
}

slider.addEventListener("input", draw);
canvas.addEventListener("mousedown", startDrag);
window.addEventListener("mousemove", moveDrag);
window.addEventListener("mouseup", stopDrag);
canvas.addEventListener("touchstart", startDrag, { passive: false });
window.addEventListener("touchmove", moveDrag, { passive: false });
window.addEventListener("touchend", stopDrag);
window.addEventListener("wheel", handleCanvasWheelZoom, { passive: false });

window.addEventListener("keydown", (event) => {
  if (event.key === "Shift") {
    isShiftPressed = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "Shift") {
    isShiftPressed = false;
  }
});

window.addEventListener("blur", () => {
  isShiftPressed = false;
});

if (fullImageViewEnabledInput) {
  fullImageViewEnabledInput.addEventListener("change", applyCanvasViewMode);
  applyCanvasViewMode();
}

if (faceGuideEnabledInput) {
  faceGuideEnabledInput.addEventListener("change", draw);
}

if (diffPreviewEnabledInput) {
  diffPreviewEnabledInput.addEventListener("change", () => {
    isDiffDividerDragging = false;
    updateDiffSplitControlVisibility();
    draw();
  });
}

if (diffSplitSlider) {
  diffSplitSlider.addEventListener("input", () => {
    setDiffSplitPercent(diffSplitSlider.value);
    draw();
  });
}

updateDiffSplitDisplay();
updateDiffSplitControlVisibility();

if (blurStrengthSlider) {
  blurStrengthSlider.addEventListener("input", () => {
    blurStrength = parseInt(blurStrengthSlider.value, 10);
    if (blurStrengthValue) {
      blurStrengthValue.textContent = String(blurStrength);
    }
    draw();
  });
  if (blurStrengthValue) {
    blurStrengthValue.textContent = String(blurStrength);
  }
}

if (manualBlurEnabledInput) {
  manualBlurEnabledInput.addEventListener("change", () => {
    if (manualBlurEnabledInput.checked && eraseBlurEnabledInput) {
      eraseBlurEnabledInput.checked = false;
    }
    isDragging = false;
    isManualRectDrawing = false;
    isEraseRectDrawing = false;
    manualDragStart = null;
    manualPreviewRect = null;
    eraseDragStart = null;
    erasePreviewRect = null;
    draw();
  });
}

if (eraseBlurEnabledInput) {
  eraseBlurEnabledInput.addEventListener("change", () => {
    if (eraseBlurEnabledInput.checked && manualBlurEnabledInput) {
      manualBlurEnabledInput.checked = false;
    }
    isDragging = false;
    isManualRectDrawing = false;
    isEraseRectDrawing = false;
    manualDragStart = null;
    manualPreviewRect = null;
    eraseDragStart = null;
    erasePreviewRect = null;
    draw();
  });
}

if (clearManualBlurBtn) {
  clearManualBlurBtn.addEventListener("click", () => {
    manualBlurRects = [];
    manualPreviewRect = null;
    isManualRectDrawing = false;
    isEraseRectDrawing = false;
    eraseDragStart = null;
    erasePreviewRect = null;
    draw();
  });
}

if (faceBlurEnabledInput) {
  faceBlurEnabledInput.addEventListener("change", () => {
    if (!img.src) return;

    if (faceBlurEnabledInput.checked) {
      if (!detectedFaces.length) {
        detectFacesInImage();
      } else {
        updateFaceBlurStatus(
          `顔を${detectedFaces.length}件検出済みです。ぼかしを適用中です。`,
        );
      }
    } else {
      updateFaceBlurStatus("顔ぼかしを無効化しました。");
    }

    draw();
  });
}

if (redetectBtn) {
  redetectBtn.addEventListener("click", () => {
    if (!img.src) {
      setFormStatus("先に画像を読み込んでください。", "error");
      return;
    }
    detectFacesInImage();
  });
}

window.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey)) return;
  if (event.key.toLowerCase() !== "s") return;
  if (!document.getElementById("page-shifter").classList.contains("active"))
    return;

  event.preventDefault();
  downloadImage();
});

// キーボード操作
window.addEventListener("keydown", (e) => {
  if (!document.getElementById("page-shifter").classList.contains("active"))
    return;
  if (!img.src || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;

  const activeTag = document.activeElement
    ? document.activeElement.tagName.toLowerCase()
    : "";
  if (
    ["input", "select", "textarea"].includes(activeTag) &&
    document.activeElement.type !== "range"
  ) {
    return;
  }

  e.preventDefault();

  let currentVal = parseInt(slider.value);
  const step = e.shiftKey ? 10 : 1;

  if (e.key === "ArrowLeft") {
    currentVal -= step;
  } else if (e.key === "ArrowRight") {
    currentVal += step;
  }

  let nextVal = currentVal % canvas.width;
  if (nextVal < 0) nextVal += canvas.width;

  slider.value = nextVal;
  draw();
});

// JPEG画像データURLにXMP(GPano)メタデータを直接インサートする関数
function insertXmpToJpeg(jpegDataUrl, xmpXmlText) {
  const parts = jpegDataUrl.split(",");
  const mime = parts[0];
  const binaryStr = atob(parts[1]);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return jpegDataUrl;
  }

  const xmpHeader = "http://ns.adobe.com/xap/1.0/\0";
  const xmpPayload = xmpHeader + xmpXmlText;

  const encoder = new TextEncoder();
  const xmpBytes = encoder.encode(xmpPayload);

  const segmentLength = 2 + xmpBytes.length;
  const app1Segment = new Uint8Array(2 + segmentLength);
  app1Segment[0] = 0xff;
  app1Segment[1] = 0xe1;
  app1Segment[2] = (segmentLength >> 8) & 0xff;
  app1Segment[3] = segmentLength & 0xff;
  app1Segment.set(xmpBytes, 4);

  const newBytes = new Uint8Array(bytes.length + app1Segment.length);
  newBytes.set(bytes.subarray(0, 2), 0);
  newBytes.set(app1Segment, 2);
  newBytes.set(bytes.subarray(2), 2 + app1Segment.length);

  let resultBinary = "";
  const chunkSize = 8192;
  for (let i = 0; i < newBytes.length; i += chunkSize) {
    resultBinary += String.fromCharCode.apply(
      null,
      newBytes.subarray(i, i + chunkSize),
    );
  }

  return `${mime},${btoa(resultBinary)}`;
}

// 画像保存（Exif & XMP 埋め込み対応）
function downloadImage() {
  if (!img.src) {
    setFormStatus("まずは画像を読み込んでください。", "error");
    return;
  }

  let exportMimeType = originalMimeType;
  let exportExtension = originalExtension;

  const selectedFormat = formatSelect.value;
  if (selectedFormat !== "auto") {
    exportMimeType = selectedFormat;
    switch (selectedFormat) {
      case "image/jpeg":
        exportExtension = "jpg";
        break;
      case "image/png":
        exportExtension = "png";
        break;
      case "image/webp":
        exportExtension = "webp";
        break;
    }
  }

  const metadataWillBeOmitted =
    exportMimeType !== "image/jpeg" && hasAnyMetadataInput();

  const validationErrors = validateBeforeSave(exportMimeType);
  if (validationErrors.length > 0) {
    setFormStatus(
      `入力内容を確認してください:\n${validationErrors.join("\n")}`,
      "error",
    );
    return;
  }

  const quality = 1.0;
  draw(false, false);
  let dataUrl = canvas.toDataURL(exportMimeType, quality);
  draw();

  // JPEG形式で出力する場合、ExifおよびXMP(GPano)情報を埋め込む
  if (exportMimeType === "image/jpeg") {
    // 1. Exif埋め込み
    try {
      let exifObj = currentExifObj || { "0th": {}, Exif: {}, GPS: {} };

      if (exifMakeInput.value)
        exifObj["0th"][piexif.ImageIFD.Make] = String(exifMakeInput.value);
      if (exifModelInput.value)
        exifObj["0th"][piexif.ImageIFD.Model] = String(exifModelInput.value);
      if (exifArtistInput.value)
        exifObj["0th"][piexif.ImageIFD.Artist] = String(exifArtistInput.value);
      if (exifSoftwareInput.value)
        exifObj["0th"][piexif.ImageIFD.Software] = String(
          exifSoftwareInput.value,
        );
      if (exifCopyrightInput.value)
        exifObj["0th"][piexif.ImageIFD.Copyright] = String(
          exifCopyrightInput.value,
        );
      if (exifDescriptionInput.value)
        exifObj["0th"][piexif.ImageIFD.ImageDescription] = String(
          exifDescriptionInput.value,
        );

      if (exifLensModelInput.value)
        exifObj["Exif"][piexif.ExifIFD.LensModel] = String(
          exifLensModelInput.value,
        );
      if (exifDateInput.value) {
        exifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] = String(
          exifDateInput.value,
        );
        exifObj["0th"][piexif.ImageIFD.DateTime] = String(exifDateInput.value);
      }

      if (exifISOInput.value) {
        const isoVal = parseInt(exifISOInput.value, 10);
        if (!isNaN(isoVal))
          exifObj["Exif"][piexif.ExifIFD.ISOSpeedRatings] = isoVal;
      }

      const fnum = toRational(exifFNumberInput.value);
      if (fnum) exifObj["Exif"][piexif.ExifIFD.FNumber] = fnum;

      const ss = toRational(exifExposureTimeInput.value);
      if (ss) exifObj["Exif"][piexif.ExifIFD.ExposureTime] = ss;

      const focal = toRational(exifFocalLengthInput.value);
      if (focal) exifObj["Exif"][piexif.ExifIFD.FocalLength] = focal;

      const exifBytes = piexif.dump(exifObj);
      dataUrl = piexif.insert(exifBytes, dataUrl);
    } catch (err) {
      console.warn("Exif埋め込み処理失敗。Exifなしで進めます:", err);
    }

    // 2. XMP(GPano) 埋め込み (フォームに値が何かしら入力されている場合のみ埋め込む)
    const useViewer = xmpUsePanoramaViewerSelect.value;
    const projection = xmpProjectionTypeInput.value;

    if (
      useViewer ||
      projection ||
      xmpFullPanoWidthInput.value ||
      xmpPoseHeadingInput.value ||
      xmpInitialViewHeadingInput.value
    ) {
      try {
        const fullWidth = xmpFullPanoWidthInput.value || canvas.width;
        const fullHeight = xmpFullPanoHeightInput.value || canvas.height;
        const croppedWidth = xmpCroppedWidthInput.value || canvas.width;
        const croppedHeight = xmpCroppedHeightInput.value || canvas.height;
        const poseHeading = xmpPoseHeadingInput.value.trim();
        const initialHeading = xmpInitialViewHeadingInput.value.trim();
        const optionalHeadingTags = `${poseHeading ? `<GPano:PoseHeadingDegrees>${escapeXml(poseHeading)}</GPano:PoseHeadingDegrees>` : ""}${initialHeading ? `<GPano:InitialViewHeadingDegrees>${escapeXml(initialHeading)}</GPano:InitialViewHeadingDegrees>` : ""}`;

        const xmpXml = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:GPano="http://ns.google.com/photos/1.0/panorama/">
      <GPano:UsePanoramaViewer>${useViewer || "True"}</GPano:UsePanoramaViewer>
      <GPano:ProjectionType>${projection || "equirectangular"}</GPano:ProjectionType>
      <GPano:FullPanoWidthPixels>${fullWidth}</GPano:FullPanoWidthPixels>
      <GPano:FullPanoHeightPixels>${fullHeight}</GPano:FullPanoHeightPixels>
      <GPano:CroppedAreaImageWidthPixels>${croppedWidth}</GPano:CroppedAreaImageWidthPixels>
      <GPano:CroppedAreaImageHeightPixels>${croppedHeight}</GPano:CroppedAreaImageHeightPixels>
      <GPano:CroppedAreaLeftPixels>0</GPano:CroppedAreaLeftPixels>
      <GPano:CroppedAreaTopPixels>0</GPano:CroppedAreaTopPixels>
      ${optionalHeadingTags}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;

        dataUrl = insertXmpToJpeg(dataUrl, xmpXml);
      } catch (err) {
        console.warn("XMPメタデータ埋め込み失敗:", err);
      }
    }
  }

  const fileBaseName = sanitizeFileBaseName(
    outputFileNameInput
      ? outputFileNameInput.value
      : `${originalBaseName}_edited`,
  );
  const link = document.createElement("a");
  link.download = `${fileBaseName}.${exportExtension}`;
  link.href = dataUrl;
  link.click();

  if (metadataWillBeOmitted) {
    setFormStatus(
      `保存しました: ${fileBaseName}.${exportExtension}\n注記: PNG/WebPではExif/XMPメタデータが保持されないため、画像のみ保存しました。`,
      "success",
    );
  } else {
    setFormStatus(
      `保存しました: ${fileBaseName}.${exportExtension}`,
      "success",
    );
  }
}

// 中心線の表示/非表示切り替え
function toggleGrid() {
  if (canvasOverlay.style.display === "block") {
    canvasOverlay.style.display = "none";
  } else {
    canvasOverlay.style.display = "block";
  }
}
