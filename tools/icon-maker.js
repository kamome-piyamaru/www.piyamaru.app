// --- ツール2: デスクトップアプリアイコン作成ツール ---
// アップロードされた1枚の画像から、macOS用(.icns) / Windows用(.ico) / Linux用(.png)
// のデスクトップアプリアイコンを、すべてブラウザ上（ローカル処理）で生成します。

(function () {
  const iconUploadInput = document.getElementById("iconUpload");
  const iconUploadDropZone = document.getElementById("iconUploadDropZone");
  const iconPreviewWrap = document.getElementById("iconPreviewWrap");
  const iconPreviewCanvas = document.getElementById("iconPreviewCanvas");
  const iconFormStatus = document.getElementById("iconFormStatus");
  const downloadIcnsBtn = document.getElementById("downloadIcnsBtn");
  const downloadIcoBtn = document.getElementById("downloadIcoBtn");
  const downloadPngBtn = document.getElementById("downloadPngBtn");

  if (!iconUploadInput || !iconPreviewCanvas) return;

  let sourceImage = null;

  function setIconStatus(message, isError = false) {
    if (!iconFormStatus) return;
    iconFormStatus.textContent = message;
    iconFormStatus.style.color = isError ? "#dc2626" : "";
  }

  function isImageLikeFile(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith("image/")) return true;
    const fileName = String(file.name || "").toLowerCase();
    return /\.(jpg|jpeg|png|webp|gif|bmp|tif|tiff|heic|heif)$/i.test(
      fileName,
    );
  }

  // 画像を正方形キャンバスへ「contain」で描画（アスペクト比を保持し、余白は透過）
  function renderSquare(image, size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, size, size);

    const scale = Math.min(
      size / image.naturalWidth,
      size / image.naturalHeight,
    );
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const offsetX = (size - drawWidth) / 2;
    const offsetY = (size - drawHeight) / 2;

    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    return canvas;
  }

  function canvasToPngArrayBuffer(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("PNGデータの生成に失敗しました。"));
          return;
        }
        blob.arrayBuffer().then(resolve, reject);
      }, "image/png");
    });
  }

  async function renderSquarePng(image, size) {
    const canvas = renderSquare(image, size);
    return canvasToPngArrayBuffer(canvas);
  }

  function downloadArrayBuffer(buffer, filename, mimeType) {
    const blob = new Blob([buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // --- ICNS (macOS) 生成 ---
  // icp4/icp5/icp6/ic07/ic08/ic09/ic10 は PNG データをそのまま格納可能な形式
  const ICNS_ENTRIES = [
    { type: "icp4", size: 16 },
    { type: "icp5", size: 32 },
    { type: "icp6", size: 64 },
    { type: "ic07", size: 128 },
    { type: "ic08", size: 256 },
    { type: "ic09", size: 512 },
    { type: "ic10", size: 1024 },
  ];

  async function buildIcns(image) {
    const chunks = [];
    for (const entry of ICNS_ENTRIES) {
      const pngBuffer = await renderSquarePng(image, entry.size);
      chunks.push({ type: entry.type, data: new Uint8Array(pngBuffer) });
    }

    let totalLength = 8; // "icns" + total length (uint32)
    for (const chunk of chunks) {
      totalLength += 8 + chunk.data.length; // OSType(4) + length(4) + data
    }

    const output = new Uint8Array(totalLength);
    const view = new DataView(output.buffer);
    let offset = 0;

    writeAscii(output, offset, "icns");
    offset += 4;
    view.setUint32(offset, totalLength, false);
    offset += 4;

    for (const chunk of chunks) {
      writeAscii(output, offset, chunk.type);
      offset += 4;
      view.setUint32(offset, 8 + chunk.data.length, false);
      offset += 4;
      output.set(chunk.data, offset);
      offset += chunk.data.length;
    }

    return output.buffer;
  }

  // --- ICO (Windows) 生成 ---
  // Vista以降はICOエントリ内に生PNGデータを格納できる（32bit BMPへの変換は不要）
  const ICO_SIZES = [16, 32, 48, 64, 128, 256];

  async function buildIco(image) {
    const images = [];
    for (const size of ICO_SIZES) {
      const pngBuffer = await renderSquarePng(image, size);
      images.push({ size, data: new Uint8Array(pngBuffer) });
    }

    const headerSize = 6;
    const entrySize = 16;
    const dirSize = headerSize + entrySize * images.length;
    let totalDataSize = 0;
    for (const img of images) totalDataSize += img.data.length;

    const output = new Uint8Array(dirSize + totalDataSize);
    const view = new DataView(output.buffer);

    // ICONDIR
    view.setUint16(0, 0, true); // reserved
    view.setUint16(2, 1, true); // type: 1 = icon
    view.setUint16(4, images.length, true); // image count

    let dataOffset = dirSize;
    let entryOffset = headerSize;

    for (const img of images) {
      const sizeByte = img.size >= 256 ? 0 : img.size; // 256は0として表現する規約
      view.setUint8(entryOffset + 0, sizeByte); // width
      view.setUint8(entryOffset + 1, sizeByte); // height
      view.setUint8(entryOffset + 2, 0); // color count
      view.setUint8(entryOffset + 3, 0); // reserved
      view.setUint16(entryOffset + 4, 1, true); // color planes
      view.setUint16(entryOffset + 6, 32, true); // bits per pixel
      view.setUint32(entryOffset + 8, img.data.length, true); // data size
      view.setUint32(entryOffset + 12, dataOffset, true); // data offset

      output.set(img.data, dataOffset);
      dataOffset += img.data.length;
      entryOffset += entrySize;
    }

    return output.buffer;
  }

  function writeAscii(target, offset, text) {
    for (let index = 0; index < text.length; index += 1) {
      target[offset + index] = text.charCodeAt(index);
    }
  }

  function loadImageFromFile(file) {
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

  function updatePreview(image) {
    const previewSize = 256;
    const rendered = renderSquare(image, previewSize);
    iconPreviewCanvas.width = previewSize;
    iconPreviewCanvas.height = previewSize;
    const ctx = iconPreviewCanvas.getContext("2d");
    ctx.clearRect(0, 0, previewSize, previewSize);
    ctx.drawImage(rendered, 0, 0);
    iconPreviewWrap.style.display = "flex";
  }

  async function processIconFile(file) {
    if (!isImageLikeFile(file)) {
      setIconStatus("画像ファイルを選択してください。", true);
      return;
    }

    try {
      setIconStatus("画像を読み込んでいます...");
      const image = await loadImageFromFile(file);
      sourceImage = image;
      updatePreview(image);
      setIconStatus(
        "準備完了: 各ボタンから icon.icns / icon.ico / icon.png を保存できます。",
      );
    } catch (error) {
      console.error(error);
      setIconStatus(
        error && error.message
          ? error.message
          : "画像の読み込みに失敗しました。",
        true,
      );
    }
  }

  iconUploadInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) processIconFile(file);
  });

  if (iconUploadDropZone) {
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      iconUploadDropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });

    iconUploadDropZone.addEventListener("dragover", () => {
      iconUploadDropZone.classList.add("drag-over");
    });
    ["dragleave", "drop"].forEach((eventName) => {
      iconUploadDropZone.addEventListener(eventName, () => {
        iconUploadDropZone.classList.remove("drag-over");
      });
    });

    iconUploadDropZone.addEventListener("drop", (event) => {
      const dataTransfer = event.dataTransfer;
      const file =
        dataTransfer &&
        dataTransfer.files &&
        dataTransfer.files.length > 0 &&
        dataTransfer.files[0];
      if (file) processIconFile(file);
    });
  }

  if (downloadIcnsBtn) {
    downloadIcnsBtn.addEventListener("click", async () => {
      if (!sourceImage) {
        setIconStatus("先に画像をアップロードしてください。", true);
        return;
      }
      try {
        setIconStatus("icon.icns を生成しています...");
        const buffer = await buildIcns(sourceImage);
        downloadArrayBuffer(buffer, "icon.icns", "application/octet-stream");
        setIconStatus("icon.icns を保存しました。");
      } catch (error) {
        console.error(error);
        setIconStatus("icon.icns の生成に失敗しました。", true);
      }
    });
  }

  if (downloadIcoBtn) {
    downloadIcoBtn.addEventListener("click", async () => {
      if (!sourceImage) {
        setIconStatus("先に画像をアップロードしてください。", true);
        return;
      }
      try {
        setIconStatus("icon.ico を生成しています...");
        const buffer = await buildIco(sourceImage);
        downloadArrayBuffer(buffer, "icon.ico", "image/x-icon");
        setIconStatus("icon.ico を保存しました。");
      } catch (error) {
        console.error(error);
        setIconStatus("icon.ico の生成に失敗しました。", true);
      }
    });
  }

  if (downloadPngBtn) {
    downloadPngBtn.addEventListener("click", async () => {
      if (!sourceImage) {
        setIconStatus("先に画像をアップロードしてください。", true);
        return;
      }
      try {
        setIconStatus("icon.png を生成しています...");
        const buffer = await renderSquarePng(sourceImage, 512); // Linux用: 256px以上を確保
        downloadArrayBuffer(buffer, "icon.png", "image/png");
        setIconStatus("icon.png を保存しました。");
      } catch (error) {
        console.error(error);
        setIconStatus("icon.png の生成に失敗しました。", true);
      }
    });
  }
})();
