(() => {
  const base = "https://download.piyamaru.app";
  const labels = {
    "macos-arm64": "ダウンロード (.dmg)",
    "windows-x64": "ダウンロード (.exe)",
  };

  // 公開を確認した対象だけを登録する。版が変わっても最新版 URL は固定。
  const publishedTargets = {
    "panomaru-xr": ["macos-arm64", "windows-x64"],
    "panomaru-doc": ["macos-arm64", "windows-x64"],
  };

  document.querySelectorAll("[data-download-product]").forEach((group) => {
    const product = group.dataset.downloadProduct;
    const available = publishedTargets[product] ?? [];
    group.querySelectorAll("[data-download-target]").forEach((badge) => {
      const target = badge.dataset.downloadTarget;
      if (!available.includes(target)) return;
      badge.href = `${base}/${product}/latest/${target}`;
      badge.removeAttribute("aria-disabled");
      badge.querySelector("small").textContent = labels[target];
    });
  });
})();
