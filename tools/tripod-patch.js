// --- ツール3: トライポッド（Nadirパッチ合成）ツール ---
// Equirectangular（360°）画像・動画の真下（Nadir = 画像最下部）に、
// 球面の歪みに合わせて補正したロゴ/パターン画像を合成します。
// すべてブラウザ上（ローカル処理）で完結します。

(function () {
  const baseUploadInput = document.getElementById("tripodBaseUpload");
  const baseDropZone = document.getElementById("tripodBaseDropZone");
  const patchUploadInput = document.getElementById("tripodPatchUpload");
  const patchDropZone = document.getElementById("tripodPatchDropZone");
  const canvas = document.getElementById("tripodCanvas");
  const videoEl = document.getElementById("tripodVideoEl");
  const statusEl = document.getElementById("tripodFormStatus");
  const downloadBtn = document.getElementById("tripodDownloadBtn");
  const playPreviewBtn = document.getElementById("tripodPlayPreviewBtn");
  const videoFormatGroup = document.getElementById("tripodVideoFormatGroup");
  const videoFormatSelect = document.getElementById("tripodVideoFormatSelect");

  const angleSlider = document.getElementById("tripodAngleSlider");
  const angleValue = document.getElementById("tripodAngleValue");
  const rotationSlider = document.getElementById("tripodRotationSlider");
  const rotationValue = document.getElementById("tripodRotationValue");
  const featherSlider = document.getElementById("tripodFeatherSlider");
  const featherValue = document.getElementById("tripodFeatherValue");
  const opacitySlider = document.getElementById("tripodOpacitySlider");
  const opacityValue = document.getElementById("tripodOpacityValue");

  const patchModeUploadBtn = document.getElementById("patchModeUploadBtn");
  const patchModeEditorBtn = document.getElementById("patchModeEditorBtn");
  const patchEditorPanel = document.getElementById("patchEditorPanel");
  const patchEditorCanvas = document.getElementById("patchEditorCanvas");
  const patchCircleColorInput = document.getElementById("patchCircleColor");
  const patchCircleTextInput = document.getElementById("patchCircleText");
  const patchTextColorInput = document.getElementById("patchTextColor");
  const patchFontFamilySelect = document.getElementById("patchFontFamily");
  const patchFontSizeSlider = document.getElementById("patchFontSize");
  const patchFontSizeValue = document.getElementById("patchFontSizeValue");

  if (!baseUploadInput || !canvas) return;

  const ctx = canvas.getContext("2d");

  let baseMediaType = null; // "image" | "video"
  let baseImage = null;
  let baseFileName = "output";
  let baseFileExt = ""; // 元動画の拡張子（"元の形式のまま"判定用）
  let baseVideoObjectUrl = null;
  let patchImage = null;
  let patchCanvasData = null; // { data: Uint8ClampedArray, width, height }
  let patchMode = "upload"; // "upload" | "editor"

  let lookupTable = null; // precomputed nadir warp table
  let lookupKey = ""; // cache key to avoid rebuilding needlessly
  let previewRafId = null;
  let isRendering = false;

  function setStatus(message, type = "info") {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove("error", "success");
    if (type === "error") statusEl.classList.add("error");
    if (type === "success") statusEl.classList.add("success");
  }

  function isImageLikeFile(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith("image/")) return true;
    return /\.(jpg|jpeg|png|webp|gif|bmp|tif|tiff|heic|heif)$/i.test(
      String(file.name || "").toLowerCase(),
    );
  }

  function isVideoLikeFile(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith("video/")) return true;
    return /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(
      String(file.name || "").toLowerCase(),
    );
  }

  function sanitizeBaseName(name) {
    const withoutExt = String(name || "output").replace(/\.[^./\\]+$/, "");
    const cleaned = withoutExt.replace(/[\\/:*?"<>|]+/g, "_").trim();
    return cleaned || "output";
  }

  // H.264等の多くのエンコーダは奇数の幅/高さを受け付けないため、偶数に丸める
  function toEvenDimension(value) {
    const rounded = Math.max(2, Math.round(value));
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }

  function updateSliderLabels() {
    angleValue.textContent = `${angleSlider.value}°`;
    rotationValue.textContent = `${rotationSlider.value}°`;
    featherValue.textContent = `${featherSlider.value}%`;
    opacityValue.textContent = `${opacitySlider.value}%`;
  }

  // --- Nadirパッチ用ワープテーブルの構築 ---
  // Equirectangular画像では、下端（Nadir）を中心に、行(y)が極角、列(x)が方位角に対応する。
  // これを利用し、パッチ画像を魚眼(fisheye)風に逆マッピングして合成位置を求める。
  function buildLookupTable(width, height, patchW, patchH, angleDeg, rotationDeg, featherPct) {
    const maxAngle = angleDeg;
    const featherFrac = Math.min(Math.max(featherPct / 100, 0), 0.95);
    const affectedRows = Math.min(
      height,
      Math.max(1, Math.ceil((maxAngle / 180) * height) + 1),
    );
    const yStart = height - affectedRows;
    const rotationRad = (rotationDeg * Math.PI) / 180;
    const patchCenterX = patchW / 2;
    const patchCenterY = patchH / 2;
    const patchRadiusX = patchW / 2;
    const patchRadiusY = patchH / 2;

    // 各行・各列ごとに { srcX, srcY, alpha } を保持
    const rows = [];
    for (let y = yStart; y < height; y += 1) {
      const dDeg = (180 * (height - (y + 0.5))) / height;
      if (dDeg > maxAngle) {
        rows.push(null);
        continue;
      }
      const rFrac = Math.min(dDeg / maxAngle, 1);
      let featherAlpha = 1;
      if (rFrac > 1 - featherFrac && featherFrac > 0) {
        featherAlpha = Math.max(0, (1 - rFrac) / featherFrac);
      }
      const rowSrcX = new Int32Array(width);
      const rowSrcY = new Int32Array(width);
      const rowAlpha = new Float32Array(width);

      for (let x = 0; x < width; x += 1) {
        const theta = (x / width) * Math.PI * 2 + rotationRad;
        const px = patchCenterX + rFrac * patchRadiusX * Math.cos(theta);
        const py = patchCenterY + rFrac * patchRadiusY * Math.sin(theta);
        const sx = Math.round(px);
        const sy = Math.round(py);
        if (sx < 0 || sx >= patchW || sy < 0 || sy >= patchH) {
          rowSrcX[x] = -1;
          rowSrcY[x] = -1;
          rowAlpha[x] = 0;
        } else {
          rowSrcX[x] = sx;
          rowSrcY[x] = sy;
          rowAlpha[x] = featherAlpha;
        }
      }
      rows.push({ y, srcX: rowSrcX, srcY: rowSrcY, alpha: rowAlpha });
    }

    return { yStart, rows, width, height };
  }

  function ensureLookupTable(width, height) {
    if (!patchCanvasData) return null;
    const angleDeg = Number(angleSlider.value);
    const rotationDeg = Number(rotationSlider.value);
    const featherPct = Number(featherSlider.value);
    const key = [
      width,
      height,
      patchCanvasData.width,
      patchCanvasData.height,
      angleDeg,
      rotationDeg,
      featherPct,
    ].join("_");

    if (lookupTable && lookupKey === key) return lookupTable;

    lookupTable = buildLookupTable(
      width,
      height,
      patchCanvasData.width,
      patchCanvasData.height,
      angleDeg,
      rotationDeg,
      featherPct,
    );
    lookupKey = key;
    return lookupTable;
  }

  // 現在のcanvas(ctx)に描かれているベースフレームへパッチを合成する
  function applyPatchToCanvas(targetCtx, width, height) {
    if (!patchCanvasData) return;
    const table = ensureLookupTable(width, height);
    if (!table) return;

    const opacity = Number(opacitySlider.value) / 100;
    if (opacity <= 0) return;

    const imageData = targetCtx.getImageData(
      0,
      table.yStart,
      width,
      height - table.yStart,
    );
    const data = imageData.data;
    const patchData = patchCanvasData.data;
    const patchW = patchCanvasData.width;

    for (const row of table.rows) {
      if (!row) continue;
      const localY = row.y - table.yStart;
      const rowOffset = localY * width * 4;
      for (let x = 0; x < width; x += 1) {
        const sx = row.srcX[x];
        if (sx < 0) continue;
        const sy = row.srcY[x];
        const alpha = row.alpha[x] * opacity;
        if (alpha <= 0) continue;

        const srcIdx = (sy * patchW + sx) * 4;
        const patchAlpha = (patchData[srcIdx + 3] / 255) * alpha;
        if (patchAlpha <= 0) continue;

        const dstIdx = rowOffset + x * 4;
        data[dstIdx] = data[dstIdx] * (1 - patchAlpha) + patchData[srcIdx] * patchAlpha;
        data[dstIdx + 1] =
          data[dstIdx + 1] * (1 - patchAlpha) + patchData[srcIdx + 1] * patchAlpha;
        data[dstIdx + 2] =
          data[dstIdx + 2] * (1 - patchAlpha) + patchData[srcIdx + 2] * patchAlpha;
      }
    }

    targetCtx.putImageData(imageData, 0, table.yStart);
  }

  function extractPatchImageData(source) {
    const size = 512; // 内部処理用に正規化（十分な解像度）
    const sourceWidth = source.naturalWidth || source.width;
    const sourceHeight = source.naturalHeight || source.height;

    const off = document.createElement("canvas");
    off.width = size;
    off.height = size;
    const offCtx = off.getContext("2d");
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = "high";

    const scale = Math.min(size / sourceWidth, size / sourceHeight);
    const drawW = sourceWidth * scale;
    const drawH = sourceHeight * scale;
    const offsetX = (size - drawW) / 2;
    const offsetY = (size - drawH) / 2;
    offCtx.clearRect(0, 0, size, size);
    offCtx.drawImage(source, offsetX, offsetY, drawW, drawH);

    const imgData = offCtx.getImageData(0, 0, size, size);
    return { data: imgData.data, width: size, height: size };
  }

  // --- 円+テキストの円弧配置エディタ ---
  // 円弧に沿って文字を1文字ずつ回転配置し、円形バッジ風のパッチを生成する
  function drawArcText(targetCtx, text, cx, cy, radius, fontCss, color) {
    if (!text) return;
    targetCtx.save();
    targetCtx.fillStyle = color;
    targetCtx.font = fontCss;
    targetCtx.textAlign = "center";
    targetCtx.textBaseline = "middle";

    const chars = Array.from(text);
    const widths = chars.map((ch) => targetCtx.measureText(ch).width);
    const totalWidth = widths.reduce((sum, w) => sum + w, 0);
    const anglePerPixel = 1 / radius; // radians per pixel of arc length

    // 上部(-90°)を中心にテキスト全体を配置する
    let currentAngle = -Math.PI / 2 - (totalWidth / 2) * anglePerPixel;

    for (let i = 0; i < chars.length; i += 1) {
      const charWidth = widths[i];
      const angle = currentAngle + (charWidth / 2) * anglePerPixel;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      targetCtx.save();
      targetCtx.translate(x, y);
      targetCtx.rotate(angle + Math.PI / 2);
      targetCtx.fillText(chars[i], 0, 0);
      targetCtx.restore();
      currentAngle += charWidth * anglePerPixel;
    }
    targetCtx.restore();
  }

  function renderCirclePatchCanvas(targetCanvas) {
    const size = targetCanvas.width;
    const center = size / 2;
    const radius = center;
    const drawCtx = targetCanvas.getContext("2d");

    drawCtx.clearRect(0, 0, size, size);

    const circleColor = patchCircleColorInput.value;
    drawCtx.beginPath();
    drawCtx.arc(center, center, radius, 0, Math.PI * 2);
    drawCtx.fillStyle = circleColor;
    drawCtx.fill();

    const text = patchCircleTextInput.value;
    const textColor = patchTextColorInput.value;
    const fontFamily = patchFontFamilySelect.value;
    const fontSizePx = Math.round(
      (Number(patchFontSizeSlider.value) / 512) * size,
    );
    const textRadius = radius * 0.72;
    drawArcText(
      drawCtx,
      text,
      center,
      center,
      textRadius,
      `bold ${fontSizePx}px ${fontFamily}`,
      textColor,
    );
  }

  function updatePatchFromEditor() {
    renderCirclePatchCanvas(patchEditorCanvas);
    patchCanvasData = extractPatchImageData(patchEditorCanvas);
    lookupTable = null;
    refreshPreview();
    updateDownloadButtonState();
    setStatus(
      baseMediaType
        ? "準備完了: ダウンロードボタンから合成結果を保存できます。"
        : "円+テキストのパッチを作成しました。次に対象の画像/動画を選択してください。",
    );
  }

  function renderImageComposite() {
    if (!baseImage) return;
    canvas.width = baseImage.naturalWidth;
    canvas.height = baseImage.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
    applyPatchToCanvas(ctx, canvas.width, canvas.height);
  }

  function renderVideoFrameToCanvas() {
    if (!videoEl || videoEl.readyState < 2) return;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    applyPatchToCanvas(ctx, canvas.width, canvas.height);
  }

  function startPreviewLoop() {
    stopPreviewLoop();
    const step = () => {
      if (videoEl.paused || videoEl.ended) {
        previewRafId = null;
        return;
      }
      renderVideoFrameToCanvas();
      previewRafId = requestAnimationFrame(step);
    };
    previewRafId = requestAnimationFrame(step);
  }

  function stopPreviewLoop() {
    if (previewRafId) {
      cancelAnimationFrame(previewRafId);
      previewRafId = null;
    }
  }

  function refreshPreview() {
    if (baseMediaType === "image") {
      renderImageComposite();
    } else if (baseMediaType === "video") {
      renderVideoFrameToCanvas();
    }
  }

  function hasBaseMedia() {
    return baseMediaType === "image" ? !!baseImage : baseMediaType === "video";
  }

  function updateDownloadButtonState() {
    const ready = hasBaseMedia() && !!patchCanvasData;
    downloadBtn.disabled = !ready;
    if (baseMediaType === "video") {
      downloadBtn.textContent = "合成した動画をダウンロード";
    } else {
      downloadBtn.textContent = "合成した画像をダウンロード";
    }
  }

  async function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
        img.src = event.target.result;
      };
      reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました。"));
      reader.readAsDataURL(file);
    });
  }

  async function processBaseFile(file) {
    if (isVideoLikeFile(file)) {
      baseMediaType = "video";
      baseImage = null;
      if (baseVideoObjectUrl) URL.revokeObjectURL(baseVideoObjectUrl);
      baseVideoObjectUrl = URL.createObjectURL(file);
      baseFileName = sanitizeBaseName(file.name);
      const extMatch = String(file.name || "").match(/\.([a-zA-Z0-9]+)$/);
      baseFileExt = extMatch ? extMatch[1].toLowerCase() : "";

      setStatus("動画を読み込んでいます...");
      await new Promise((resolve, reject) => {
        videoEl.onloadedmetadata = () => resolve();
        videoEl.onerror = () => reject(new Error("動画の読み込みに失敗しました。"));
        videoEl.src = baseVideoObjectUrl;
      });

      canvas.width = toEvenDimension(videoEl.videoWidth);
      canvas.height = toEvenDimension(videoEl.videoHeight);
      videoEl.currentTime = 0;
      await new Promise((resolve) => {
        videoEl.onseeked = () => resolve();
      });
      renderVideoFrameToCanvas();

      playPreviewBtn.style.display = "inline-flex";
      videoFormatGroup.style.display = "block";
      lookupTable = null;
      updateDownloadButtonState();
      setStatus(
        patchCanvasData
          ? "準備完了: ダウンロードボタンから合成動画を書き出せます。"
          : "動画を読み込みました。次にトライポッド用画像を選択してください。",
      );
    } else if (isImageLikeFile(file)) {
      baseMediaType = "image";
      baseFileName = sanitizeBaseName(file.name);
      setStatus("画像を読み込んでいます...");
      const img = await loadImageFromFile(file);
      baseImage = img;
      playPreviewBtn.style.display = "none";
      videoFormatGroup.style.display = "none";
      stopPreviewLoop();
      lookupTable = null;
      renderImageComposite();
      updateDownloadButtonState();
      setStatus(
        patchCanvasData
          ? "準備完了: ダウンロードボタンから合成画像を保存できます。"
          : "画像を読み込みました。次にトライポッド用画像を選択してください。",
      );
    } else {
      setStatus("画像または動画ファイルを選択してください。", "error");
    }
  }

  async function processPatchFile(file) {
    if (!isImageLikeFile(file)) {
      setStatus("トライポッド用画像は画像ファイルを選択してください。", "error");
      return;
    }
    try {
      setStatus("トライポッド用画像を読み込んでいます...");
      const img = await loadImageFromFile(file);
      patchImage = img;
      patchCanvasData = extractPatchImageData(img);
      lookupTable = null;
      refreshPreview();
      updateDownloadButtonState();
      setStatus(
        baseMediaType
          ? "準備完了: ダウンロードボタンから合成結果を保存できます。"
          : "トライポッド用画像を読み込みました。次に対象の画像/動画を選択してください。",
      );
    } catch (error) {
      console.error(error);
      setStatus("トライポッド用画像の読み込みに失敗しました。", "error");
    }
  }

  function setupDropZone(zone, handler) {
    if (!zone) return;
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      zone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    zone.addEventListener("dragover", () => zone.classList.add("drag-over"));
    ["dragleave", "drop"].forEach((eventName) => {
      zone.addEventListener(eventName, () => zone.classList.remove("drag-over"));
    });
    zone.addEventListener("drop", (event) => {
      const file =
        event.dataTransfer &&
        event.dataTransfer.files &&
        event.dataTransfer.files[0];
      if (file) handler(file);
    });
  }

  baseUploadInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) processBaseFile(file);
  });
  patchUploadInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) processPatchFile(file);
  });
  setupDropZone(baseDropZone, processBaseFile);
  setupDropZone(patchDropZone, processPatchFile);

  function setPatchMode(mode) {
    patchMode = mode;
    const isEditor = mode === "editor";
    patchDropZone.style.display = isEditor ? "none" : "";
    patchEditorPanel.style.display = isEditor ? "block" : "none";
    patchModeUploadBtn.classList.toggle("active", !isEditor);
    patchModeEditorBtn.classList.toggle("active", isEditor);

    if (isEditor) {
      updatePatchFromEditor();
    } else if (patchImage) {
      patchCanvasData = extractPatchImageData(patchImage);
      lookupTable = null;
      refreshPreview();
      updateDownloadButtonState();
    } else {
      patchCanvasData = null;
      lookupTable = null;
      updateDownloadButtonState();
    }
  }

  patchModeUploadBtn.addEventListener("click", () => setPatchMode("upload"));
  patchModeEditorBtn.addEventListener("click", () => setPatchMode("editor"));

  [
    patchCircleColorInput,
    patchCircleTextInput,
    patchTextColorInput,
    patchFontFamilySelect,
  ].forEach((input) => {
    input.addEventListener("input", () => {
      if (patchMode === "editor") updatePatchFromEditor();
    });
  });
  patchFontSizeSlider.addEventListener("input", () => {
    patchFontSizeValue.textContent = `${patchFontSizeSlider.value}px`;
    if (patchMode === "editor") updatePatchFromEditor();
  });

  [angleSlider, rotationSlider, featherSlider, opacitySlider].forEach((slider) => {
    slider.addEventListener("input", () => {
      updateSliderLabels();
      lookupTable = null;
      if (baseMediaType === "video" && !videoEl.paused) return; // 再生中はループ側で更新
      refreshPreview();
    });
  });

  playPreviewBtn.addEventListener("click", () => {
    if (videoEl.paused) {
      videoEl.play();
      playPreviewBtn.textContent = "プレビュー停止";
      startPreviewLoop();
    } else {
      videoEl.pause();
      playPreviewBtn.textContent = "プレビュー再生";
      stopPreviewLoop();
    }
  });
  videoEl.addEventListener("pause", () => {
    playPreviewBtn.textContent = "プレビュー再生";
  });

  function downloadBlobAs(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadImageResult() {
    renderImageComposite();
    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus("画像の生成に失敗しました。", "error");
        return;
      }
      downloadBlobAs(blob, `${baseFileName}_tripod.png`);
      setStatus("合成画像をダウンロードしました。", "success");
    }, "image/png");
  }

  // 出力形式の選択に応じたMediaRecorder用MIMEタイプ候補を決定する
  // 「元の形式のまま」の場合は、アップロードされた動画の拡張子に近い形式を優先する
  // 音声トラックの有無に応じて、オーディオコーデックを含む/含まない候補を出し分ける
  function getVideoFormatPlan(formatChoice, originalExt, hasAudio) {
    const webmVp9 = hasAudio
      ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp9", "video/webm"]
      : ["video/webm;codecs=vp9", "video/webm"];
    const webmVp8 = hasAudio
      ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp8", "video/webm"]
      : ["video/webm;codecs=vp8", "video/webm"];
    const mp4 = hasAudio
      ? [
          "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
          "video/mp4;codecs=avc1",
          "video/mp4",
        ]
      : ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4"];

    if (formatChoice === "webm-vp9") return { candidates: webmVp9, requestedExt: "webm" };
    if (formatChoice === "webm-vp8") return { candidates: webmVp8, requestedExt: "webm" };
    if (formatChoice === "mp4") return { candidates: mp4, requestedExt: "mp4" };

    // auto: 元のファイル形式に近いものを優先し、非対応ならWebMにフォールバック
    const isOriginalMp4Family = ["mp4", "mov", "m4v"].includes(originalExt);
    return {
      candidates: isOriginalMp4Family
        ? [...mp4, ...webmVp9, ...webmVp8]
        : [...webmVp9, ...webmVp8],
      requestedExt: isOriginalMp4Family ? "mp4" : "webm",
    };
  }

  // 解像度・フレームレートに応じた妥当なビットレートを算出する。
  // 低解像度に対して過大なビットレートを指定すると、エンコーダが実行時に
  // 「The given encoder configuration is not supported by the encoder.」を
  // 出すことがあるため、画素数に応じて上限を調整する。
  function computeReasonableBitrate(width, height, fps) {
    const pixelsPerSecond = width * height * fps;
    const bitrate = Math.round(pixelsPerSecond * 0.08); // 目安: 0.08bit/px
    return Math.min(Math.max(bitrate, 1_000_000), 20_000_000);
  }

  // 本番の録画を始める前に、ごく短時間（数フレーム）だけ試し録りして
  // エンコーダ設定が実際に動作するかを確認する。isTypeSupported()がtrueでも
  // 実行時に失敗するケースがあるため、ここで軽量に弾いておくことで、
  // 動画全体を毎回最初から再生し直す重いリトライを避けられる。
  async function probeRecorderOptions(recorderOptions, fps, audioTracks) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      try {
        const probeStream = canvas.captureStream(fps);
        (audioTracks || []).forEach((track) => probeStream.addTrack(track));
        const recorder = new MediaRecorder(probeStream, recorderOptions);
        recorder.onerror = () => finish(false);
        recorder.onstop = () => finish(true);
        recorder.start();
        setTimeout(() => {
          if (recorder.state !== "inactive") recorder.stop();
        }, 150);
        // 万一onstop/onerrorのどちらも発火しない場合に備えたタイムアウト
        setTimeout(() => finish(true), 800);
      } catch (error) {
        finish(false);
      }
    });
  }

  // 指定のmimeType・オプションで実際に録画を最後まで実行する。
  // エンコーダが実行時（start後）にエラーを出すケースがあるため、
  // 失敗した場合は例外を投げて呼び出し元で次の候補にフォールバックできるようにする。
  async function recordOnce(recorderOptions, audioTracks, fps, onProgress) {
    videoEl.currentTime = 0;
    await new Promise((resolve) => {
      videoEl.onseeked = () => resolve();
    });

    const stream = canvas.captureStream(fps);
    audioTracks.forEach((track) => stream.addTrack(track));

    const recorder = new MediaRecorder(stream, recorderOptions);

    const recordedChunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) recordedChunks.push(event.data);
    };

    const finished = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = (event) =>
        reject(event.error || new Error("録画に失敗しました。"));
    });

    recorder.start();

    const duration = videoEl.duration || 0;
    let renderLoopActive = true;
    const renderStep = () => {
      if (!renderLoopActive) return;
      renderVideoFrameToCanvas();
      if (duration > 0 && onProgress) {
        const pct = Math.min(99, Math.round((videoEl.currentTime / duration) * 100));
        onProgress(pct);
      }
      requestAnimationFrame(renderStep);
    };

    try {
      await videoEl.play();
      requestAnimationFrame(renderStep);
      await new Promise((resolve) => {
        videoEl.onended = resolve;
      });
    } finally {
      renderLoopActive = false;
    }

    if (recorder.state !== "inactive") recorder.stop();
    await finished;

    return new Blob(recordedChunks, {
      type: recorderOptions.mimeType.split(";")[0],
    });
  }

  async function downloadVideoResult() {
    if (isRendering) return;
    isRendering = true;
    downloadBtn.disabled = true;
    setStatus("動画を書き出しています... 0%");

    try {
      const wasPaused = videoEl.paused;
      stopPreviewLoop();
      videoEl.pause();

      let audioTracks = [];
      try {
        if (typeof videoEl.captureStream === "function") {
          const videoElStream = videoEl.captureStream();
          audioTracks = videoElStream.getAudioTracks();
        }
      } catch (e) {
        audioTracks = [];
      }

      const fps = 30;
      const formatChoice = videoFormatSelect ? videoFormatSelect.value : "auto";
      const { candidates, requestedExt } = getVideoFormatPlan(
        formatChoice,
        baseFileExt,
        audioTracks.length > 0,
      );

      let blob = null;
      let mimeType = null;
      let lastError = null;
      let chosenOptions = null;

      setStatus("録画設定を確認しています...");

      for (const candidate of candidates) {
        if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(candidate)) continue;

        const bitrate = computeReasonableBitrate(canvas.width, canvas.height, fps);
        const optionSets = [
          { mimeType: candidate, videoBitsPerSecond: bitrate },
          { mimeType: candidate },
        ];

        for (const options of optionSets) {
          const ok = await probeRecorderOptions(options, fps, audioTracks);
          if (ok) {
            chosenOptions = options;
            mimeType = candidate;
            break;
          }
          lastError = new Error(
            `${candidate} は録画エンコーダの設定を満たせませんでした。`,
          );
        }
        if (chosenOptions) break;
      }

      if (!chosenOptions) {
        throw (
          lastError ||
          new Error("このブラウザは動画の書き出しに対応していません。")
        );
      }

      setStatus("動画を書き出しています... 0%");
      try {
        blob = await recordOnce(chosenOptions, audioTracks, fps, (pct) => {
          setStatus(`動画を書き出しています... ${pct}%`);
        });
      } catch (error) {
        // 事前確認をパスしても本編で失敗する稀なケース。他の候補で1回だけ再試行する。
        console.warn(
          `本番録画に失敗（${mimeType}）。他の候補で再試行します。`,
          error,
        );
        blob = null;
        mimeType = null;
        for (const candidate of candidates) {
          if (chosenOptions.mimeType === candidate) continue;
          if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(candidate)) continue;
          const bitrate = computeReasonableBitrate(canvas.width, canvas.height, fps);
          const optionSets = [
            { mimeType: candidate, videoBitsPerSecond: bitrate },
            { mimeType: candidate },
          ];
          let succeeded = false;
          for (const options of optionSets) {
            try {
              blob = await recordOnce(options, audioTracks, fps, (pct) => {
                setStatus(`動画を書き出しています... ${pct}%`);
              });
              mimeType = candidate;
              succeeded = true;
              break;
            } catch (retryError) {
              lastError = retryError;
            }
          }
          if (succeeded) break;
        }
      }

      if (!blob) {
        throw (
          lastError ||
          new Error("このブラウザは動画の書き出しに対応していません。")
        );
      }

      const actualExt = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
      downloadBlobAs(blob, `${baseFileName}_tripod.${actualExt}`);

      if (requestedExt !== actualExt) {
        setStatus(
          `指定の形式はこのブラウザで非対応のため、.${actualExt}形式で書き出しました。`,
          "success",
        );
      } else {
        setStatus(`合成動画をダウンロードしました（.${actualExt}形式）。`, "success");
      }

      videoEl.currentTime = 0;
      if (wasPaused) videoEl.pause();
    } catch (error) {
      console.error(error);
      setStatus(
        error && error.message ? error.message : "動画の書き出しに失敗しました。",
        "error",
      );
    } finally {
      isRendering = false;
      downloadBtn.disabled = false;
    }
  }

  downloadBtn.addEventListener("click", () => {
    if (!baseMediaType || !patchCanvasData) {
      setStatus("対象の画像/動画とトライポッド用画像の両方をアップロードしてください。", "error");
      return;
    }
    if (baseMediaType === "image") {
      downloadImageResult();
    } else {
      downloadVideoResult();
    }
  });

  updateSliderLabels();
  updateDownloadButtonState();
  patchFontSizeValue.textContent = `${patchFontSizeSlider.value}px`;
  patchModeUploadBtn.classList.add("active");
})();
