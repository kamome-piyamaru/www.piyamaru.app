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

  const angleSlider = document.getElementById("tripodAngleSlider");
  const angleValue = document.getElementById("tripodAngleValue");
  const rotationSlider = document.getElementById("tripodRotationSlider");
  const rotationValue = document.getElementById("tripodRotationValue");
  const featherSlider = document.getElementById("tripodFeatherSlider");
  const featherValue = document.getElementById("tripodFeatherValue");
  const opacitySlider = document.getElementById("tripodOpacitySlider");
  const opacityValue = document.getElementById("tripodOpacityValue");

  if (!baseUploadInput || !canvas) return;

  const ctx = canvas.getContext("2d");

  let baseMediaType = null; // "image" | "video"
  let baseImage = null;
  let baseFileName = "output";
  let baseVideoObjectUrl = null;
  let patchImage = null;
  let patchCanvasData = null; // { data: Uint8ClampedArray, width, height }

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

  function extractPatchImageData(image) {
    const size = 512; // 内部処理用に正規化（十分な解像度）
    const off = document.createElement("canvas");
    off.width = size;
    off.height = size;
    const offCtx = off.getContext("2d");
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = "high";

    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;
    const offsetX = (size - drawW) / 2;
    const offsetY = (size - drawH) / 2;
    offCtx.clearRect(0, 0, size, size);
    offCtx.drawImage(image, offsetX, offsetY, drawW, drawH);

    const imgData = offCtx.getImageData(0, 0, size, size);
    return { data: imgData.data, width: size, height: size };
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
      downloadBtn.textContent = "合成した動画をダウンロード（.webm）";
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

      setStatus("動画を読み込んでいます...");
      await new Promise((resolve, reject) => {
        videoEl.onloadedmetadata = () => resolve();
        videoEl.onerror = () => reject(new Error("動画の読み込みに失敗しました。"));
        videoEl.src = baseVideoObjectUrl;
      });

      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      videoEl.currentTime = 0;
      await new Promise((resolve) => {
        videoEl.onseeked = () => resolve();
      });
      renderVideoFrameToCanvas();

      playPreviewBtn.style.display = "inline-flex";
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

  async function downloadVideoResult() {
    if (isRendering) return;
    isRendering = true;
    downloadBtn.disabled = true;
    setStatus("動画を書き出しています... 0%");

    try {
      const wasPaused = videoEl.paused;
      stopPreviewLoop();
      videoEl.pause();
      videoEl.currentTime = 0;
      await new Promise((resolve) => {
        videoEl.onseeked = () => resolve();
      });

      const fps = 30;
      const canvasStream = canvas.captureStream(fps);
      let audioTracks = [];
      try {
        if (typeof videoEl.captureStream === "function") {
          const videoElStream = videoEl.captureStream();
          audioTracks = videoElStream.getAudioTracks();
        }
      } catch (e) {
        audioTracks = [];
      }
      audioTracks.forEach((track) => canvasStream.addTrack(track));

      const mimeCandidates = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mimeType = mimeCandidates.find(
        (type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type),
      );
      if (!mimeType) {
        throw new Error("このブラウザは動画の書き出しに対応していません。");
      }

      const recordedChunks = [];
      const recorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: 12_000_000,
      });
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) recordedChunks.push(event.data);
      };

      const finished = new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = (event) => reject(event.error || new Error("録画に失敗しました。"));
      });

      recorder.start();

      const duration = videoEl.duration || 0;
      let renderLoopActive = true;
      const renderStep = () => {
        if (!renderLoopActive) return;
        renderVideoFrameToCanvas();
        if (duration > 0) {
          const pct = Math.min(
            99,
            Math.round((videoEl.currentTime / duration) * 100),
          );
          setStatus(`動画を書き出しています... ${pct}%`);
        }
        requestAnimationFrame(renderStep);
      };

      await videoEl.play();
      requestAnimationFrame(renderStep);

      await new Promise((resolve) => {
        videoEl.onended = resolve;
      });
      renderLoopActive = false;
      recorder.stop();
      await finished;

      const blob = new Blob(recordedChunks, { type: "video/webm" });
      downloadBlobAs(blob, `${baseFileName}_tripod.webm`);
      setStatus("合成動画をダウンロードしました（.webm形式）。", "success");

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
})();
