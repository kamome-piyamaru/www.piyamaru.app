// --- 画面切り替え（ルーター処理） ---
function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('active'));

    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.classList.add('active');

    const targetNav = document.getElementById(`nav-${pageId}`);
    if (targetNav) targetNav.classList.add('active');

    window.scrollTo(0, 0);
}

// --- ツール1: VR Image Shifter 処理ロジック ---
const upload = document.getElementById('upload');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const slider = document.getElementById('shiftSlider');
const shiftValueDisplay = document.getElementById('shiftValue');
const canvasOverlay = document.getElementById('canvas-overlay');
const formatSelect = document.getElementById('formatSelect');

// Exif入力フォーム要素
const exifMakeInput = document.getElementById('exifMake');
const exifModelInput = document.getElementById('exifModel');
const exifLensModelInput = document.getElementById('exifLensModel');
const exifDateInput = document.getElementById('exifDate');
const exifISOInput = document.getElementById('exifISO');
const exifFNumberInput = document.getElementById('exifFNumber');
const exifExposureTimeInput = document.getElementById('exifExposureTime');
const exifFocalLengthInput = document.getElementById('exifFocalLength');
const exifArtistInput = document.getElementById('exifArtist');
const exifSoftwareInput = document.getElementById('exifSoftware');

// XMP (GPano) 入力フォーム要素
const xmpUsePanoramaViewerSelect = document.getElementById('xmpUsePanoramaViewer');
const xmpProjectionTypeInput = document.getElementById('xmpProjectionType');
const xmpFullPanoWidthInput = document.getElementById('xmpFullPanoWidth');
const xmpFullPanoHeightInput = document.getElementById('xmpFullPanoHeight');
const xmpCroppedWidthInput = document.getElementById('xmpCroppedWidth');
const xmpCroppedHeightInput = document.getElementById('xmpCroppedHeight');

let img = new Image();
let isDragging = false;
let startX;
let baseShift = 0;

let originalMimeType = 'image/png';
let originalExtension = 'png';
let currentExifObj = null;

// 分数データ [分子, 分母] を数値や文字列に変換するヘルパー関数
function parseRational(rational) {
    if (!rational) return '';
    if (Array.isArray(rational) && rational.length === 2) {
        if (rational[1] === 0) return '';
        if (rational[0] === 1) return `1/${rational[1]}`;
        return (rational[0] / rational[1]).toString();
    }
    return rational.toString();
}

// 入力文字列を Exif用 [分子, 分母] に変換するヘルパー関数
function toRational(str) {
    if (!str) return null;
    str = str.toString().trim();

    if (str.includes('/')) {
        const parts = str.split('/');
        const num = parseInt(parts[0], 10);
        const den = parseInt(parts[1], 10);
        return (!isNaN(num) && !isNaN(den) && den !== 0) ? [num, den] : null;
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
        const binaryStr = atob(dataUrl.split(',')[1]);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

        if (!text.includes("http://ns.google.com/photos/1.0/panorama/") && !text.includes("GPano:")) {
            return null; // GPanoメタデータが存在しない
        }

        const getTagValue = (tagName) => {
            const reg1 = new RegExp(`<GPano:${tagName}>([^<]+)<\/GPano:${tagName}>`, 'i');
            const reg2 = new RegExp(`GPano:${tagName}="([^"]+)"`, 'i');
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
            croppedHeight: getTagValue("CroppedAreaImageHeightPixels")
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
}

// 画像読み込み
upload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    originalMimeType = file.type || 'image/png';
    const nameParts = file.name.split('.');
    if (nameParts.length > 1) {
        originalExtension = nameParts.pop().toLowerCase();
    } else {
        originalExtension = originalMimeType.split('/')[1] || 'png';
    }

    // --- ExifおよびXMP情報の解析処理 ---
    const exifReader = new FileReader();
    exifReader.onload = function(evt) {
        const dataUrl = evt.target.result;

        // 1. Exif解析
        try {
            currentExifObj = piexif.load(dataUrl);
            
            exifMakeInput.value = currentExifObj["0th"][piexif.ImageIFD.Make] || '';
            exifModelInput.value = currentExifObj["0th"][piexif.ImageIFD.Model] || '';
            exifArtistInput.value = currentExifObj["0th"][piexif.ImageIFD.Artist] || '';
            exifSoftwareInput.value = currentExifObj["0th"][piexif.ImageIFD.Software] || 'Turumaru';

            exifDateInput.value = currentExifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] || currentExifObj["0th"][piexif.ImageIFD.DateTime] || '';
            exifLensModelInput.value = currentExifObj["Exif"][piexif.ExifIFD.LensModel] || '';
            
            const iso = currentExifObj["Exif"][piexif.ExifIFD.ISOSpeedRatings];
            exifISOInput.value = Array.isArray(iso) ? iso[0] : (iso || '');

            exifFNumberInput.value = parseRational(currentExifObj["Exif"][piexif.ExifIFD.FNumber]);
            exifExposureTimeInput.value = parseRational(currentExifObj["Exif"][piexif.ExifIFD.ExposureTime]);
            exifFocalLengthInput.value = parseRational(currentExifObj["Exif"][piexif.ExifIFD.FocalLength]);

        } catch (err) {
            currentExifObj = { "0th": {}, "Exif": {}, "GPS": {} };
            exifMakeInput.value = '';
            exifModelInput.value = '';
            exifLensModelInput.value = '';
            exifDateInput.value = '';
            exifISOInput.value = '';
            exifFNumberInput.value = '';
            exifExposureTimeInput.value = '';
            exifFocalLengthInput.value = '';
            exifArtistInput.value = '';
            exifSoftwareInput.value = 'Turumaru';
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
            draw();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

// 描画ロジック
function draw() {
    if (!img.src || img.width === 0) return;

    const shift = parseInt(slider.value);
    const w = canvas.width;
    const h = canvas.height;

    ctx.drawImage(img, shift, 0, w - shift, h, 0, 0, w - shift, h);
    ctx.drawImage(img, 0, 0, shift, h, w - shift, 0, shift, h);
    
    shiftValueDisplay.innerText = shift;
}

// ドラッグ操作
function startDrag(e) {
    if (!img.src) return;
    isDragging = true;
    startX = e.pageX || e.touches[0].pageX;
    baseShift = parseInt(slider.value);
}

function moveDrag(e) {
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
    isDragging = false;
}

slider.addEventListener('input', draw);
canvas.addEventListener('mousedown', startDrag);
window.addEventListener('mousemove', moveDrag);
window.addEventListener('mouseup', stopDrag);
canvas.addEventListener('touchstart', startDrag, { passive: false });
window.addEventListener('touchmove', moveDrag, { passive: false });
window.addEventListener('touchend', stopDrag);

// キーボード操作
window.addEventListener('keydown', (e) => {
    if (!document.getElementById('page-shifter').classList.contains('active')) return;
    if (!img.src || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (['input', 'select', 'textarea'].includes(activeTag) && document.activeElement.type !== 'range') {
        return;
    }

    e.preventDefault();
    
    let currentVal = parseInt(slider.value);
    const step = e.shiftKey ? 10 : 1;

    if (e.key === 'ArrowLeft') {
        currentVal -= step;
    } else if (e.key === 'ArrowRight') {
        currentVal += step;
    }

    let nextVal = currentVal % canvas.width;
    if (nextVal < 0) nextVal += canvas.width;

    slider.value = nextVal;
    draw();
});

// JPEG画像データURLにXMP(GPano)メタデータを直接インサートする関数
function insertXmpToJpeg(jpegDataUrl, xmpXmlText) {
    const parts = jpegDataUrl.split(',');
    const mime = parts[0];
    const binaryStr = atob(parts[1]);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }

    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
        return jpegDataUrl;
    }

    const xmpHeader = "http://ns.adobe.com/xap/1.0/\0";
    const xmpPayload = xmpHeader + xmpXmlText;
    
    const encoder = new TextEncoder();
    const xmpBytes = encoder.encode(xmpPayload);

    const segmentLength = 2 + xmpBytes.length;
    const app1Segment = new Uint8Array(2 + segmentLength);
    app1Segment[0] = 0xFF;
    app1Segment[1] = 0xE1;
    app1Segment[2] = (segmentLength >> 8) & 0xFF;
    app1Segment[3] = segmentLength & 0xFF;
    app1Segment.set(xmpBytes, 4);

    const newBytes = new Uint8Array(bytes.length + app1Segment.length);
    newBytes.set(bytes.subarray(0, 2), 0);
    newBytes.set(app1Segment, 2);
    newBytes.set(bytes.subarray(2), 2 + app1Segment.length);

    let resultBinary = '';
    const chunkSize = 8192;
    for (let i = 0; i < newBytes.length; i += chunkSize) {
        resultBinary += String.fromCharCode.apply(null, newBytes.subarray(i, i + chunkSize));
    }

    return `${mime},${btoa(resultBinary)}`;
}

// 画像保存（Exif & XMP 埋め込み対応）
function downloadImage() {
    if (!img.src) {
        alert('まずは画像を読み込んでください。');
        return;
    }

    let exportMimeType = originalMimeType;
    let exportExtension = originalExtension;

    const selectedFormat = formatSelect.value;
    if (selectedFormat !== 'auto') {
        exportMimeType = selectedFormat;
        switch (selectedFormat) {
            case 'image/jpeg':
                exportExtension = 'jpg';
                break;
            case 'image/png':
                exportExtension = 'png';
                break;
            case 'image/webp':
                exportExtension = 'webp';
                break;
        }
    }

    const quality = 1.0; 
    let dataUrl = canvas.toDataURL(exportMimeType, quality);

    // JPEG形式で出力する場合、ExifおよびXMP(GPano)情報を埋め込む
    if (exportMimeType === 'image/jpeg') {
        // 1. Exif埋め込み
        try {
            let exifObj = currentExifObj || { "0th": {}, "Exif": {}, "GPS": {} };

            if (exifMakeInput.value) exifObj["0th"][piexif.ImageIFD.Make] = String(exifMakeInput.value);
            if (exifModelInput.value) exifObj["0th"][piexif.ImageIFD.Model] = String(exifModelInput.value);
            if (exifArtistInput.value) exifObj["0th"][piexif.ImageIFD.Artist] = String(exifArtistInput.value);
            if (exifSoftwareInput.value) exifObj["0th"][piexif.ImageIFD.Software] = String(exifSoftwareInput.value);

            if (exifLensModelInput.value) exifObj["Exif"][piexif.ExifIFD.LensModel] = String(exifLensModelInput.value);
            if (exifDateInput.value) {
                exifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] = String(exifDateInput.value);
                exifObj["0th"][piexif.ImageIFD.DateTime] = String(exifDateInput.value);
            }

            if (exifISOInput.value) {
                const isoVal = parseInt(exifISOInput.value, 10);
                if (!isNaN(isoVal)) exifObj["Exif"][piexif.ExifIFD.ISOSpeedRatings] = isoVal;
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

        if (useViewer || projection || xmpFullPanoWidthInput.value) {
            try {
                const fullWidth = xmpFullPanoWidthInput.value || canvas.width;
                const fullHeight = xmpFullPanoHeightInput.value || canvas.height;
                const croppedWidth = xmpCroppedWidthInput.value || canvas.width;
                const croppedHeight = xmpCroppedHeightInput.value || canvas.height;

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
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;

                dataUrl = insertXmpToJpeg(dataUrl, xmpXml);
            } catch (err) {
                console.warn("XMPメタデータ埋め込み失敗:", err);
            }
        }
    }

    const link = document.createElement('a');
    link.download = `vr_shifted_image.${exportExtension}`;
    link.href = dataUrl;
    link.click();
}

// 中心線の表示/非表示切り替え
function toggleGrid() {
    if (canvasOverlay.style.display === 'block') {
        canvasOverlay.style.display = 'none';
    } else {
        canvasOverlay.style.display = 'block';
    }
}