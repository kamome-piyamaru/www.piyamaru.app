/**
 * firemaru ダウンロードウィジェット
 * ============================================================
 * 使い方:
 *   ① ダウンロードリンクに data-fm-key 属性を付ける
 *      data-fm-key="mac-arm64" … Apple Silicon 用 .dmg
 *      data-fm-key="mac-x64"   … Intel Mac 用 .dmg
 *      data-fm-key="win-x64"   … Windows 用 .exe
 *   ② </body> 直前に <script src="download-widget.js"> を追加
 *
 * バージョンアップ時は VERSION の1行だけ変更する。
 * ============================================================
 */
(function () {

  /* ▼ リリース時にここだけ変更する */
  var VERSION = "1.0.0";
  /* ================================ */

  var BASE = "https://pub-a9cdd797bae04c95a7f6b89b013b8351.r2.dev";

  var URLS = {
    "mac-arm64": BASE + "/firemaru-" + VERSION + "-mac-arm64.dmg",
    "mac-x64":   BASE + "/firemaru-" + VERSION + "-mac-x64.dmg",
    "win-x64":   BASE + "/firemaru-" + VERSION + "-win-x64.exe",
  };

  function apply() {
    document.querySelectorAll("[data-fm-key]").forEach(function (el) {
      var url = URLS[el.getAttribute("data-fm-key")];
      if (url) el.href = url;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }

})();
