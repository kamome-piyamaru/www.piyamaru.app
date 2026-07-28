/**
 * firemaru ダウンロードウィジェット
 * ============================================================
 * 使い方:
 *   既存の <a> タグに data-fm-key 属性を付けるだけ。
 *   スクリプトが href と download 属性をセットします。
 *
 *   <a class="dl-btn" data-fm-key="mac"    href="#">...</a>
 *   <a class="dl-btn" data-fm-key="win-x64" href="#">...</a>
 *
 *   data-fm-key の値:
 *     "mac"     … macOS（Apple Silicon / Intel を自動判別）
 *     "mac-arm64" … Apple Silicon 固定
 *     "mac-x64"   … Intel Mac 固定
 *     "win-x64"   … Windows 固定
 *
 *   アクセス中の OS に合致するボタンに .dl-btn--recommended が付く。
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

  var BASE = "https://pub-a9cdd797bae04c95a7f6b89b013b8351.r2.dev";

  var URLS = {
    "mac-arm64": BASE + "/firemaru-" + VERSION + "-mac-arm64.dmg",
    "mac-x64":   BASE + "/firemaru-" + VERSION + "-mac-x64.dmg",
    "win-x64":   BASE + "/firemaru-" + VERSION + "-win-x64.exe",
  };

  /* macOS のアーキテクチャを WebGL レンダラ文字列で判定（Safari 用） */
  function detectMacArchByWebGL() {
    try {
      var gl = document.createElement("canvas").getContext("webgl");
      var ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
      var r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "";
      if (/Apple\s+M\d|Apple GPU/i.test(r)) return "mac-arm64";
      if (/Intel|AMD|Radeon/i.test(r))       return "mac-x64";
    } catch (e) {}
    return "mac-arm64"; /* 判定不能時は Apple Silicon をデフォルト */
  }

  /* href・download 属性・推奨クラスをセット */
  function applyLinks(resolvedMacKey) {
    var ua = navigator.userAgent || "";
    var isMac = /Mac/i.test(ua);
    var isWin = /Win/i.test(ua);

    document.querySelectorAll("[data-fm-key]").forEach(function (el) {
      var key = el.getAttribute("data-fm-key");

      /* "mac" は検出結果に置き換え */
      var resolvedKey = (key === "mac") ? resolvedMacKey : key;

      var url = URLS[resolvedKey];
      if (!url) return;

      el.href = url;
      el.setAttribute("download", "");

      /* アクセス中 OS に対応するボタンに推奨クラスを付与 */
      var isRecommended =
        (isMac && (resolvedKey === "mac-arm64" || resolvedKey === "mac-x64") && key !== "win-x64") ||
        (isWin && resolvedKey === "win-x64");
      if (isRecommended) el.classList.add("dl-btn--recommended");
    });
  }

  function start() {
    var ua = navigator.userAgent || "";

    if (/Mac/i.test(ua)) {
      /* まず WebGL で同期的に仮セット（クリックタイミング問題を回避） */
      applyLinks(detectMacArchByWebGL());

      /* Chrome/Edge: userAgentData で確実判定し上書き（非同期） */
      if (navigator.userAgentData && typeof navigator.userAgentData.getHighEntropyValues === "function") {
        navigator.userAgentData.getHighEntropyValues(["architecture"])
          .then(function (d) {
            var k = d.architecture === "arm" ? "mac-arm64"
                  : d.architecture === "x86" ? "mac-x64"
                  : detectMacArchByWebGL();
            applyLinks(k);
          })
          .catch(function () { /* WebGL判定のまま */ });
        return;
      }
      /* Safari: WebGL で判定 */
      applyLinks(detectMacArchByWebGL());
      return;
    }

    applyLinks("mac-arm64"); /* Mac 以外でも Mac ボタンには arm64 URL を入れておく */
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
