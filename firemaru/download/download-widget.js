/**
 * firemaru ダウンロードウィジェット
 * ============================================================
 * 使い方:
 *   1. ページ内に <div id="fm-download"></div> を置く
 *   2. このファイル（またはインライン）で VERSION を更新する
 *   3. あとはスクリプトが自動でリンクを生成する
 *
 * リリース時に変更が必要なのは VERSION の1行だけ。
 * ============================================================
 */
(function () {
  /* =====================================================
     ▼ リリース時にここだけ変更する
  ===================================================== */
  var VERSION = "1.0.0";
  /* ===================================================== */

  var BASE_URL = "https://firemaru.com/download";

  var FILES = [
    {
      key:      "mac-arm64",
      url:      BASE_URL + "/firemaru-" + VERSION + "-mac-arm64.dmg",
      os:       "mac",
      icon:     "\uD83C\uDF4E", /* 🍎 */
      label:    "macOS (Apple Silicon)",
      sublabel: "M1 / M2 / M3 / M4",
      ext:      ".dmg",
    },
    {
      key:      "mac-x64",
      url:      BASE_URL + "/firemaru-" + VERSION + "-mac-x64.dmg",
      os:       "mac",
      icon:     "\uD83C\uDF4E", /* 🍎 */
      label:    "macOS (Intel)",
      sublabel: "Intel Core i5 / i7 / i9",
      ext:      ".dmg",
    },
    {
      key:      "win-x64",
      url:      BASE_URL + "/firemaru-" + VERSION + "-win-x64.exe",
      os:       "win",
      icon:     "\uD83E\uDEDF", /* 🪟 */
      label:    "Windows",
      sublabel: "Windows 10 / 11 (64-bit)",
      ext:      ".exe",
    },
  ];

  /* ----------------------------------------------------------------
     OS・CPU アーキテクチャ自動検出
     戻り値: "mac-arm64" | "mac-x64" | "win" | null
     ---------------------------------------------------------------- */

  /** WebGL レンダラ文字列から Mac の CPU を判定（Safari 対応） */
  function detectMacArchByWebGL() {
    try {
      var canvas = document.createElement("canvas");
      var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) return null;
      var ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (!ext) return null;
      var renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "";
      /* Apple M シリーズ GPU は "Apple M1" "Apple M2" "Apple GPU" 等を含む */
      if (/Apple\s+M\d|Apple GPU/i.test(renderer)) return "mac-arm64";
      /* Intel / AMD は Intel Mac */
      if (/Intel|AMD|Radeon/i.test(renderer)) return "mac-x64";
    } catch (e) { /* ignore */ }
    return null;
  }

  /**
   * 検出結果を非同期で取得し、render() を呼ぶ。
   * Chrome/Edge: userAgentData.getHighEntropyValues でアーキ取得 → 即時確定
   * Safari: WebGL レンダラ文字列で判定 → 同期的に確定
   * その他: null（どちらの Mac も推奨バッジなし）
   */
  function detectKeyAndRender() {
    var ua = navigator.userAgent || "";
    var isMac = /Mac/i.test(ua);
    var isWin = /Win/i.test(ua);

    if (isWin) { render("win"); return; }

    if (isMac) {
      /* ① Chrome / Edge: userAgentData (非同期) */
      if (navigator.userAgentData && typeof navigator.userAgentData.getHighEntropyValues === "function") {
        navigator.userAgentData.getHighEntropyValues(["architecture"])
          .then(function (data) {
            if (data.architecture === "arm")  { render("mac-arm64"); return; }
            if (data.architecture === "x86")  { render("mac-x64");   return; }
            render(detectMacArchByWebGL() || null);
          })
          .catch(function () {
            render(detectMacArchByWebGL() || null);
          });
        return; /* render は Promise 解決後に呼ばれる */
      }

      /* ② Safari など: WebGL で判定（同期） */
      render(detectMacArchByWebGL() || null);
      return;
    }

    render(null); /* Mac でも Win でもない場合 */
  }

  /* ウィジェット生成
     recommendedKey: "mac-arm64" | "mac-x64" | "win" | null */
  function render(recommendedKey) {
    var root = document.getElementById("fm-download");
    if (!root) { console.warn("[firemaru-widget] #fm-download が見つかりません"); return; }

    var rows = FILES.map(function (f) {
      var recommended = f.key === recommendedKey;
      var border = recommended ? "#3b82f6" : "#d1d5db";
      var bg     = recommended ? "#eff6ff"  : "#ffffff";
      var badge  = recommended
        ? '<span style="margin-left:8px;font-size:11px;font-weight:700;'
          + 'color:#fff;background:#3b82f6;padding:1px 8px;border-radius:10px;vertical-align:middle">'
          + "おすすめ</span>"
        : "";

      return (
        '<a href="' + f.url + '" download'
        + ' style="display:block;text-decoration:none;color:inherit;border-radius:12px;'
        + 'border:2px solid ' + border + ';background:' + bg + ';margin-bottom:10px;"'
        + ' onmouseover="this.style.boxShadow=\'0 4px 18px rgba(59,130,246,0.18)\'"'
        + ' onmouseout="this.style.boxShadow=\'none\'">'
        + '<div style="display:flex;align-items:center;gap:14px;padding:14px 18px;">'
        + '<span style="font-size:28px;flex-shrink:0;line-height:1">' + f.icon + "</span>"
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-weight:700;font-size:15px;color:#0f172a">' + f.label + badge + "</div>"
        + '<div style="font-size:12px;color:#64748b;margin-top:3px">' + f.sublabel
        + " &nbsp;·&nbsp; " + f.ext + "</div>"
        + "</div>"
        + '<div style="flex-shrink:0;font-size:13px;font-weight:600;color:#3b82f6">'
        + "\u2B07 ダウンロード</div>"
        + "</div></a>"
      );
    }).join("");

    root.innerHTML =
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;'
      + 'max-width:520px;margin:0 auto">'
      + '<p style="margin:0 0 14px;font-size:13px;color:#64748b">バージョン v' + VERSION + '</p>'
      + rows
      + '<p style="margin:12px 0 0;font-size:11px;color:#94a3b8;text-align:center">'
      + '<a href="https://firemaru.com" style="color:#94a3b8;text-decoration:none">'
      + "firemaru.com</a></p>"
      + "</div>";
  }

  /* DOM準備完了後に検出・描画 */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", detectKeyAndRender);
  } else {
    detectKeyAndRender();
  }
})();
