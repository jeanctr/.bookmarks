const $ = (selector) => document.querySelector(selector);

const DOM = {
  container: $("#links-list"),
  searchInput: $("#search"),
  resultsInfo: $("#results-info"),
  sidebar: $("#sidebar"),
  globalTagsList: $("#global-tags-list"),
  favoritesSection: $("#favorites-section"),
  favCount: $("#fav-count"),
  tagsCount: $("#tags-count"),
  toast: $("#toast"),
  helpModal: $("#help-modal"),
  btnTheme: $("#btn-theme"),
  btnView: $("#btn-view"),
  btnHelp: $("#btn-help"),
};

const STORAGE_KEYS = {
  theme: "bookmarks_theme",
  view: "bookmarks_view",
  favorites: "bookmarks_favorites",
  lastSearch: "bookmarks_lastSearch",
};

const DEBOUNCE_DELAY = 150;
const TOAST_DURATION = 1800;

const Utils = {
  escapeHtml(text) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return String(text).replace(/[&<>"']/g, (c) => map[c]);
  },

  isValidUrl(str) {
    try {
      return Boolean(new URL(str));
    } catch {
      return false;
    }
  },

  highlightText(text, terms) {
    if (!terms.length) return text;
    const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "gi");
    return text.replace(regex, "<mark>$1</mark>");
  },

  debounce(fn, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), wait);
    };
  },
};

const App = (() => {
  let state = {
    bookmarks: [],
    favorites: new Set(),
    activeTag: null,
    showOnlyFavorites: false,
    focusedIndex: -1,
    isGridView: false,
  };

  const Storage = {
    load() {
      try {
        const favs = JSON.parse(
          localStorage.getItem(STORAGE_KEYS.favorites) || "[]",
        );
        state.favorites = new Set(favs);
      } catch {
        state.favorites = new Set();
      }
    },

    saveFavorites() {
      localStorage.setItem(
        STORAGE_KEYS.favorites,
        JSON.stringify([...state.favorites]),
      );
    },

    getTheme() {
      const saved = localStorage.getItem(STORAGE_KEYS.theme);
      if (saved) return saved;
      return window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    },

    setTheme(theme) {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    },

    getView() {
      return localStorage.getItem(STORAGE_KEYS.view) || "list";
    },

    setView(view) {
      localStorage.setItem(STORAGE_KEYS.view, view);
    },

    getLastSearch() {
      return localStorage.getItem(STORAGE_KEYS.lastSearch) || "";
    },

    setLastSearch(query) {
      localStorage.setItem(STORAGE_KEYS.lastSearch, query);
    },
  };

  const Parser = {
    parseBookmarks(text) {
      const lines = text.split("\n");
      state.bookmarks = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (i + 1 < lines.length && lines[i + 1].trim().startsWith("---")) {
          i++;
          continue;
        }

        if (line.startsWith("-") && line.includes("|")) {
          const parts = line
            .replace(/^-\s*/, "")
            .split("|")
            .map((p) => p.trim());
          if (parts.length < 2) continue;

          const [url, title, desc = "", tagsString = ""] = parts;
          const tags = tagsString
            ? tagsString
                .split(",")
                .map((t) => t.trim().replace(/^#/, ""))
                .filter(Boolean)
            : [];

          if (Utils.isValidUrl(url)) {
            state.bookmarks.push({ url, title, desc, tags });
          }
        }
      }
    },

    parseQuery(query) {
      const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
      const include = [];
      const exclude = [];

      for (const token of tokens) {
        if (token.startsWith("-") && token.length > 1) {
          exclude.push(token.slice(1));
        } else {
          include.push(token);
        }
      }

      return { include, exclude };
    },
  };

  const Filter = {
    matchesQuery(bookmark, parsed) {
      const haystack = [
        bookmark.title,
        bookmark.desc,
        bookmark.url,
        ...bookmark.tags,
      ]
        .join(" ")
        .toLowerCase();

      const okInclude = parsed.include.every((t) => haystack.includes(t));
      const okExclude = parsed.exclude.every((t) => !haystack.includes(t));

      return okInclude && okExclude;
    },

    getVisibleBookmarks() {
      const query = DOM.searchInput.value.trim();
      const parsed = Parser.parseQuery(query);

      return state.bookmarks.filter((bookmark) => {
        const matchQuery = Filter.matchesQuery(bookmark, parsed);
        const matchTag =
          !state.activeTag || bookmark.tags.includes(state.activeTag);
        const matchFav =
          !state.showOnlyFavorites || state.favorites.has(bookmark.url);

        return matchQuery && matchTag && matchFav;
      });
    },

    getTagCounts() {
      const counts = {};
      state.bookmarks.forEach((bookmark) => {
        bookmark.tags.forEach((tag) => {
          counts[tag] = (counts[tag] || 0) + 1;
        });
      });
      return counts;
    },
  };

  const Renderer = {
    renderBookmarks() {
      const visibleBookmarks = Filter.getVisibleBookmarks();
      const query = DOM.searchInput.value.trim();
      const parsed = Parser.parseQuery(query);

      const html = visibleBookmarks
        .map((bookmark, idx) => {
          const title = Utils.highlightText(
            Utils.escapeHtml(bookmark.title),
            parsed.include,
          );
          const desc = bookmark.desc
            ? Utils.highlightText(
                Utils.escapeHtml(bookmark.desc),
                parsed.include,
              )
            : "";
          const isFav = state.favorites.has(bookmark.url);

          return `
                            <div class="link-item" data-url="${Utils.escapeHtml(bookmark.url)}" data-idx="${idx}">
                                <div class="link-header">
                                    <a href="${Utils.escapeHtml(bookmark.url)}" target="_blank" rel="noopener noreferrer"
                                       class="link-title">${title}</a>
                                    <div class="link-actions">
                                        <button class="action-btn ${isFav ? "fav-active" : ""}"
                                                data-action="fav" title="Toggle favorite (f)">
                                            ${isFav ? "★" : "☆"}
                                        </button>
                                        <button class="action-btn" data-action="copy" title="Copy URL (y)">⧉</button>
                                    </div>
                                </div>
                                ${desc ? `<p class="link-desc">${desc}</p>` : ""}
                                ${
                                  bookmark.tags.length > 0
                                    ? `
                                    <div class="tags">
                                        ${bookmark.tags
                                          .map(
                                            (tag) => `
                                            <span class="tag" role="button" tabindex="0"
                                                  data-tag="${Utils.escapeHtml(tag)}">#${Utils.escapeHtml(tag)}</span>
                                        `,
                                          )
                                          .join("")}
                                    </div>
                                `
                                    : ""
                                }
                            </div>
                        `;
        })
        .join("");

      DOM.container.innerHTML =
        html || '<p class="status-message">No matches.</p>';

      const infoText =
        query || state.activeTag || state.showOnlyFavorites
          ? `${visibleBookmarks.length} of ${state.bookmarks.length} matches`
          : `${state.bookmarks.length} total links`;
      DOM.resultsInfo.textContent = infoText;

      EventHandlers.attachItemListeners();
      state.focusedIndex = -1;
    },

    renderTags() {
      const tagCounts = Filter.getTagCounts();
      const sortedTags = Object.keys(tagCounts).sort();

      DOM.tagsCount.textContent = sortedTags.length;
      DOM.globalTagsList.innerHTML = sortedTags
        .map(
          (tag) => `
                        <span class="tag ${state.activeTag === tag ? "active" : ""}"
                              role="button" tabindex="0" data-tag="${Utils.escapeHtml(tag)}">
                            #${Utils.escapeHtml(tag)}<span class="tag-count">${tagCounts[tag]}</span>
                        </span>
                    `,
        )
        .join("");
    },

    updateFavoritesUI() {
      DOM.favCount.textContent = state.favorites.size;
      DOM.favoritesSection.style.display =
        state.favorites.size > 0 ? "block" : "none";
    },

    render() {
      Renderer.renderTags();
      Renderer.renderBookmarks();
    },
  };

  const Actions = {
    toggleFavorite(url) {
      if (state.favorites.has(url)) {
        state.favorites.delete(url);
      } else {
        state.favorites.add(url);
      }
      Storage.saveFavorites();
      Renderer.updateFavoritesUI();
      Renderer.render();
    },

    async copyToClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        UI.showToast("Copied: " + text);
      } catch {
        UI.showToast("Copy failed");
      }
    },

    setTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      Storage.setTheme(theme);
      DOM.btnTheme.classList.toggle("active", theme === "light");
    },

    toggleTheme() {
      const current = document.documentElement.getAttribute("data-theme");
      Actions.setTheme(current === "light" ? "dark" : "light");
    },

    setView(view) {
      const isGrid = view === "grid";
      DOM.container.classList.toggle("view-grid", isGrid);
      Storage.setView(view);
      DOM.btnView.textContent = isGrid ? "▦ Grid" : "▤ List";
      DOM.btnView.classList.toggle("active", isGrid);
      state.isGridView = isGrid;
    },

    toggleView() {
      const current = state.isGridView ? "list" : "grid";
      Actions.setView(current);
    },

    setActiveTag(tag) {
      state.activeTag = state.activeTag === tag ? null : tag;
      Renderer.render();
    },

    toggleFavoritesFilter() {
      state.showOnlyFavorites = !state.showOnlyFavorites;
      const favFilter = document.querySelector('[data-filter="favorites"]');
      if (favFilter) {
        favFilter.classList.toggle("active", state.showOnlyFavorites);
      }
      Renderer.render();
    },

    clearFilters() {
      state.activeTag = null;
      state.showOnlyFavorites = false;
      Renderer.render();
    },

    focusItem(index) {
      const items = Navigation.getVisibleItems();
      if (!items.length) return;

      items.forEach((el) => el.classList.remove("focused"));
      state.focusedIndex = Math.max(0, Math.min(index, items.length - 1));
      items[state.focusedIndex].classList.add("focused");
      items[state.focusedIndex].scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    },

    openFocusedLink() {
      const url = Navigation.getFocusedUrl();
      if (url) {
        window.open(url, "_blank");
      }
    },
  };

  const Navigation = {
    getVisibleItems() {
      return [...document.querySelectorAll(".link-item:not(.hidden)")];
    },

    getFocusedUrl() {
      const items = Navigation.getVisibleItems();
      if (state.focusedIndex < 0 || state.focusedIndex >= items.length)
        return null;
      return items[state.focusedIndex].getAttribute("data-url");
    },

    moveNext() {
      Actions.focusItem(state.focusedIndex + 1);
    },

    movePrev() {
      Actions.focusItem(state.focusedIndex - 1);
    },

    moveToTop() {
      Actions.focusItem(0);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    moveToBottom() {
      const items = Navigation.getVisibleItems();
      Actions.focusItem(items.length - 1);
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    },
  };

  const UI = {
    showToast(msg) {
      DOM.toast.textContent = msg;
      DOM.toast.classList.add("show");
      setTimeout(() => DOM.toast.classList.remove("show"), TOAST_DURATION);
    },

    toggleHelpModal() {
      DOM.helpModal.classList.toggle("active");
    },

    closeHelpModal() {
      DOM.helpModal.classList.remove("active");
    },
  };

  const EventHandlers = {
    attachItemListeners() {
      document.querySelectorAll(".link-item .tag[data-tag]").forEach((el) => {
        const handler = (e) => {
          if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ")
            return;
          e.preventDefault();
          const tag = el.getAttribute("data-tag");
          Actions.setActiveTag(tag);
        };
        el.addEventListener("click", handler);
        el.addEventListener("keydown", handler);
      });

      document.querySelectorAll(".action-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const item = btn.closest(".link-item");
          const url = item.getAttribute("data-url");
          const action = btn.getAttribute("data-action");

          if (action === "fav") {
            Actions.toggleFavorite(url);
          } else if (action === "copy") {
            Actions.copyToClipboard(url);
          }
        });
      });

      document.querySelectorAll(".link-title").forEach((a) => {
        a.addEventListener("click", () => {
          // Track in recent
        });
      });
    },

    attachGlobalListeners() {
      DOM.searchInput.addEventListener(
        "input",
        Utils.debounce(() => {
          Storage.setLastSearch(DOM.searchInput.value);
          Renderer.render();
        }, DEBOUNCE_DELAY),
      );

      DOM.globalTagsList.addEventListener("click", (e) => {
        if (e.target.classList.contains("tag")) {
          const tag = e.target.getAttribute("data-tag");
          Actions.setActiveTag(tag);
        }
      });

      DOM.globalTagsList.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          if (e.target.classList.contains("tag")) {
            e.preventDefault();
            const tag = e.target.getAttribute("data-tag");
            Actions.setActiveTag(tag);
          }
        }
      });

      const favFilter = document.querySelector('[data-filter="favorites"]');
      if (favFilter) {
        favFilter.addEventListener("click", () =>
          Actions.toggleFavoritesFilter(),
        );
      }

      DOM.btnTheme.addEventListener("click", () => Actions.toggleTheme());
      DOM.btnView.addEventListener("click", () => Actions.toggleView());
      DOM.btnHelp.addEventListener("click", () => UI.toggleHelpModal());
      document
        .getElementById("help-close")
        .addEventListener("click", () => UI.closeHelpModal());

      DOM.helpModal.addEventListener("click", (e) => {
        if (e.target === DOM.helpModal) UI.closeHelpModal();
      });

      document.addEventListener("keydown", (e) => {
        if (DOM.helpModal.classList.contains("active")) {
          if (e.key === "Escape") UI.closeHelpModal();
          return;
        }

        const inSearch = document.activeElement === DOM.searchInput;

        if (e.key === "/" && !inSearch) {
          e.preventDefault();
          DOM.searchInput.focus();
          return;
        }

        if (e.key === "Escape") {
          if (inSearch && DOM.searchInput.value) {
            DOM.searchInput.value = "";
            Storage.setLastSearch("");
            Renderer.render();
          } else if (inSearch) {
            DOM.searchInput.blur();
          } else {
            Actions.clearFilters();
          }
          return;
        }

        if (inSearch) return;

        switch (e.key) {
          case "j":
            Navigation.moveNext();
            break;
          case "k":
            Navigation.movePrev();
            break;
          case "g":
            Navigation.moveToTop();
            break;
          case "G":
            Navigation.moveToBottom();
            break;
          case "Enter":
            Actions.openFocusedLink();
            break;
          case "f":
            {
              const url = Navigation.getFocusedUrl();
              if (url) Actions.toggleFavorite(url);
            }
            break;
          case "y":
            {
              const url = Navigation.getFocusedUrl();
              if (url) Actions.copyToClipboard(url);
            }
            break;
          case "v":
            Actions.toggleView();
            break;
          case "t":
            Actions.toggleTheme();
            break;
          case "?":
            UI.toggleHelpModal();
            break;
        }
      });
    },
  };

  const init = async () => {
    try {
      Storage.load();

      const theme = Storage.getTheme();
      Actions.setTheme(theme);

      const view = Storage.getView();
      Actions.setView(view);

      Renderer.updateFavoritesUI();

      const res = await fetch("../README");
      if (!res.ok) throw new Error("README not found");

      Parser.parseBookmarks(await res.text());

      if (!state.bookmarks.length) {
        DOM.container.innerHTML =
          '<p class="status-message error">No bookmarks found.</p>';
        return;
      }

      Renderer.render();
      DOM.sidebar.style.display = "block";

      const lastSearch = Storage.getLastSearch();
      if (lastSearch) {
        DOM.searchInput.value = lastSearch;
        Renderer.render();
      }

      EventHandlers.attachGlobalListeners();
    } catch (error) {
      DOM.container.innerHTML =
        '<p class="status-message error">Error loading README.</p>';
      console.error("Initialization error:", error);
    }
  };

  return { init };
})();

App.init();
