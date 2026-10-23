// products.json を読み込んで、トップの製品一覧カードを描画する
(function () {
  const ICON = {
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3.5v17l14-8.5z"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>',
    web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>'
  };
  // links[].type に使える値
  const LINK = {
    appstore:   { label: "App Store",   icon: ICON.phone },
    googleplay: { label: "Google Play", icon: ICON.play },
    windows:    { label: "Windows",     icon: ICON.down },
    mac:        { label: "macOS",       icon: ICON.down },
    web:        { label: "Webで開く",   icon: ICON.web }
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const isExternal = url => /^https?:\/\//.test(url) && !url.includes("www.piyamaru.app");
  const target = url => isExternal(url) ? ' target="_blank" rel="noopener"' : "";

  const LABELS = {};
  const catLabel = p => (p.categories || []).map(id => LABELS[id] || id).join("・");

  // アイコン画像がない製品用の仮アイコン
  const genIcon = '<svg viewBox="0 0 70 70" fill="none" aria-hidden="true"><circle cx="35" cy="35" r="24" stroke="var(--brand-ink)" stroke-width="3"/><ellipse cx="35" cy="35" rx="24" ry="9" stroke="var(--brand-ink)" stroke-width="2.5"/><ellipse cx="35" cy="35" rx="9" ry="24" stroke="var(--brand-ink)" stroke-width="2.5" opacity=".5"/><circle cx="35" cy="35" r="4" fill="var(--brand)"/></svg>';

  function card(p) {
    const icon = p.icon ? `<img src="${esc(p.icon)}" alt="" loading="lazy">` : genIcon;
    const links = (p.links || []).filter(l => LINK[l.type]).map(l =>
      `<a href="${esc(l.url)}"${target(l.url)}>${LINK[l.type].icon}${LINK[l.type].label}</a>`).join("");
    return `<article class="card">
      <div class="head">
        <a class="app-icon" href="${esc(p.lp)}"${target(p.lp)} tabindex="-1" aria-hidden="true">${icon}</a>
        <div class="title">
          <h2><a href="${esc(p.lp)}"${target(p.lp)}>${esc(p.name)}</a></h2>
          <div class="meta"><span class="cat">${esc(catLabel(p))}</span>${p.status ? `<span class="status">${esc(p.status)}</span>` : ""}</div>
        </div>
      </div>
      <p class="desc">${esc(p.desc || "")}</p>
      <div class="get">${links}</div>
      <a class="more" href="${esc(p.lp)}"${target(p.lp)}>詳しく見る →</a>
    </article>`;
  }

  const list = document.getElementById("list");
  const tabs = document.getElementById("tabs");

  fetch("/products.json", { cache: "no-cache" })
    .then(r => r.json())
    .then(data => {
      // "hidden": true の製品は一覧に出さない（開発中など）
      const items = data.products.filter(p => !p.hidden);
      data.categories.forEach(c => { LABELS[c.id] = c.label; });

      // 製品が1つもないカテゴリはタブを出さない
      const cats = data.categories
        .map(c => ({ ...c, n: items.filter(p => (p.categories || []).includes(c.id)).length }))
        .filter(c => c.n > 0);

      function show(id) {
        const shown = id === "all" ? items : items.filter(p => (p.categories || []).includes(id));
        list.innerHTML = shown.map(card).join("");
        tabs.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.id === id));
      }

      tabs.innerHTML = [{ id: "all", label: "すべて", n: items.length }, ...cats]
        .map(c => `<button type="button" data-id="${esc(c.id)}" aria-pressed="false">${esc(c.label)}<span class="count">${c.n}</span></button>`)
        .join("");
      tabs.addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b) return;
        history.replaceState(null, "", b.dataset.id === "all" ? location.pathname : "#" + b.dataset.id);
        show(b.dataset.id);
      });

      // https://www.piyamaru.app/#xr のようにURLでカテゴリを指定して開ける
      const fromHash = location.hash.slice(1);
      show(cats.some(c => c.id === fromHash) ? fromHash : "all");
    })
    .catch(() => {
      list.innerHTML = '<p>製品一覧を読み込めませんでした。ページを再読み込みしてください。</p>';
    });
})();
