// Розстав 3D · iOS: тонкий шар між веб-версією та Safari / WKWebView. index.html про нього не знає.
(function () {
  "use strict";

  // Збереження файлів. В iOS посилання з download працює не скрізь, особливо у програмі на головному екрані,
  // тому спершу відкриваємо системне вікно «Поділитися» (там є «Зберегти у Файли»).
  const blobs = new Map();
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = o => { const u = create(o); if (o instanceof Blob) blobs.set(u, o); return u; };
  URL.revokeObjectURL = u => { blobs.delete(u); revoke(u); };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const b = this.download && blobs.get(this.href);
    // На комп'ютері з мишею лишається звичайне завантаження: вікно «Поділитися» там лише заважає.
    const touch = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    if (b && touch && navigator.canShare && navigator.share) {
      const f = new File([b], this.download, { type: b.type || "application/octet-stream" });
      let can = false; try { can = navigator.canShare({ files: [f] }); } catch (e) {}
      if (can) {
        const self = this;
        navigator.share({ files: [f] }).catch(e => { if (!e || e.name !== "AbortError") click.call(self); });
        return;
      }
    }
    click.call(this);
  };

  // Щипок по сторінці не повинен збільшувати весь інтерфейс: у 3D-сцені та на плані щипок масштабує вміст.
  document.addEventListener("gesturestart", e => e.preventDefault(), { passive: false });

  // Просимо систему не очищати збережені дані. Система може відмовити, тож файл проєкту все одно варто зберігати.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}

  // Офлайн-режим. Service worker доступний лише через HTTPS або localhost; в оболонці Xcode файли й так усередині програми.
  const secure = location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (secure && "serviceWorker" in navigator) addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(e => console.warn("sw", e)); });
})();
