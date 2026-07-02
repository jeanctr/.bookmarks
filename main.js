// ============================================================
// UTILS - Helper functions
// ============================================================

// Query DOM elements
const $ = (selector) => document.querySelector(selector);

// Escape HTML to prevent XSS attacks
const escapeHtml = (text) => {
  if (typeof text !== "string") return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// Only allow safe HTTP/HTTPS protocols
const isValidUrl = (str) => {
  try {
    return ["http:", "https:"].includes(new URL(str).protocol);
  } catch {
    return false;
  }
};

// Wrap search terms in <mark> tags
const highlightText = (text, terms) => {
  if (!terms.length) return text;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return text.replace(
    new RegExp(`(${escaped.join("|")})`, "gi"),
    "<mark>$1</mark>",
  );
};

// Delay function execution to save resources
const debounce = (fn, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
};

// ============================================================
// STORAGE - LocalStorage wrapper
// ============================================================

const storageGet = (key, def = null) => {
  try {
    return localStorage.getItem(key) ?? def;
  } catch {
    return def;
  }
};

const storageSet = (key, val) => {
  try {
    localStorage.setItem(key, val);
  } catch {}
};

const storageGetJSON = (key, def = []) => {
  try {
    return JSON.parse(storageGet(key) || JSON.stringify(def));
  } catch {
    return def;
  }
};

const storageSetJSON = (key, val) => {
  storageSet(key, JSON.stringify(val));
};

// Storage keys
const KEYS = {
  theme: "bookmarks_theme",
  view: "bookmarks_view",
  favorites: "bookmarks_favorites",
  lastSearch: "bookmarks_lastSearch",
};

// ============================================================
// PARSER - Parse bookmarks and queries
// ============================================================

// Parse bookmarks.txt format
export const parseBookmarks = (text) => {
  if (typeof text !== "string") return [];
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== "---")
    .filter((l) => l.includes(" - "))
    .map(parseLine)
    .filter(Boolean);
};

// Parse single line: "- url - title - #tag1,#tag2"
const parseLine = (line) => {
  const parts = line.split(" - ").map((p) => p.trim());

  if (parts.length < 2) return null;

  const url = parts[0];
  const title = parts[1];
  const tagsString = parts[2] || "";

  if (!isValidUrl(url)) return null;

  const tags = tagsString
    ? tagsString
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean)
    : [];

  return { url, title, tags };
};

// Split query into include/exclude tokens
const parseQuery = (query) => {
  const include = [];
  const exclude = [];
  query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .forEach((token) => {
      token.startsWith("-") && token.length > 1
        ? exclude.push(token.slice(1))
        : include.push(token);
    });
  return { include, exclude };
};

// Check if bookmark matches query
const matchesQuery = (bookmark, parsed) => {
  const text = [bookmark.title, bookmark.url, ...bookmark.tags]
    .join(" ")
    .toLowerCase();
  return (
    parsed.include.every((t) => text.includes(t)) &&
    parsed.exclude.every((t) => !text.includes(t))
  );
};

// Get visible bookmarks after applying all filters
const getVisibleBookmarks = (
  bookmarks,
  query,
  activeTag,
  showOnlyFavorites,
  favorites,
) => {
  const parsed = parseQuery(query);
  return bookmarks.filter((bm) => {
    const matchQuery = matchesQuery(bm, parsed);
    const matchTag = !activeTag || bm.tags.includes(activeTag);
    const matchFav = !showOnlyFavorites || favorites.has(bm.url);
    return matchQuery && matchTag && matchFav;
  });
};

// Count bookmarks per tag
const getTagCounts = (bookmarks) => {
  return bookmarks.reduce((acc, bm) => {
    bm.tags.forEach((tag) => (acc[tag] = (acc[tag] || 0) + 1));
    return acc;
  }, {});
};

// ============================================================
// RENDERER - Update the DOM
// ============================================================

// Render bookmark list
const renderBookmarks = (
  dom,
  state,
  query,
  activeTag,
  showOnlyFavorites,
  favorites,
) => {
  const visible = getVisibleBookmarks(
    state.bookmarks,
    query,
    activeTag,
    showOnlyFavorites,
    favorites,
  );
  const parsed = parseQuery(query);

  const html = visible
    .map((bm) => renderBookmarkItem(bm, parsed.include, favorites))
    .join("");

  dom.container.innerHTML = html || '<p class="status-message">No matches.</p>';
  updateResultsInfo(
    dom,
    state,
    visible.length,
    query,
    activeTag,
    showOnlyFavorites,
  );
};

// Render single bookmark card
const renderBookmarkItem = (bookmark, highlightTerms, favorites) => {
  const title = highlightText(escapeHtml(bookmark.title), highlightTerms);
  const isFav = favorites.has(bookmark.url);

  return `
    <div class="link-item" data-url="${escapeHtml(bookmark.url)}">
      <div class="link-header">
        <a href="${escapeHtml(bookmark.url)}" target="_blank" rel="noopener noreferrer" class="link-title">
          ${title}
        </a>
        <div class="link-actions">
          <button type="button" class="action-btn ${isFav ? "fav-active" : ""}" data-action="fav" title="Toggle favorite (f)">
            ${isFav ? "★" : "☆"}
          </button>
          <button type="button" class="action-btn" data-action="copy" title="Copy URL (y)">⧉</button>
        </div>
      </div>
      ${renderTags(bookmark.tags)}
    </div>
  `;
};

// Render tags for bookmark
const renderTags = (tags) => {
  if (!tags.length) return "";
  const tagsHtml = tags
    .map(
      (tag) => `
      <span class="tag" role="button" tabindex="0" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</span>
    `,
    )
    .join("");
  return `<div class="tags">${tagsHtml}</div>`;
};

// Render all tags in sidebar with counts
const renderGlobalTags = (dom, state) => {
  const tagCounts = getTagCounts(state.bookmarks);
  const sortedTags = Object.keys(tagCounts).sort();

  dom.tagsCount.textContent = sortedTags.length;
  dom.globalTagsList.innerHTML = sortedTags
    .map(
      (tag) => `
      <span class="tag ${state.activeTag === tag ? "active" : ""}" role="button" tabindex="0"
            data-tag="${escapeHtml(tag)}" aria-pressed="${state.activeTag === tag}">
        #${escapeHtml(tag)}<span class="tag-count">${tagCounts[tag]}</span>
      </span>
    `,
    )
    .join("");
};

// Update favorite count display
const updateFavoritesUI = (dom, favCount) => {
  dom.favCount.textContent = favCount;
  dom.favoritesSection.style.display = favCount > 0 ? "block" : "none";
};

// Show filtered/total count
const updateResultsInfo = (
  dom,
  state,
  visibleCount,
  query,
  activeTag,
  showOnlyFavorites,
) => {
  const isFiltered = query || activeTag || showOnlyFavorites;
  dom.resultsInfo.textContent = isFiltered
    ? `${visibleCount} of ${state.bookmarks.length} matches`
    : `${state.bookmarks.length} total links`;
};

// Re-render all UI sections
const renderAll = (dom, state, query, favorites) => {
  renderGlobalTags(dom, state);
  renderBookmarks(
    dom,
    state,
    query,
    state.activeTag,
    state.showOnlyFavorites,
    favorites,
  );
};

// ============================================================
// ACTIONS - Core logic and state changes
// ============================================================

// Toggle favorite status
const toggleFavorite = (url, state, dom, favorites) => {
  favorites.has(url) ? favorites.delete(url) : favorites.add(url);
  storageSetJSON(KEYS.favorites, [...favorites]);
  updateFavoritesUI(dom, favorites.size);
  renderBookmarks(
    dom,
    state,
    dom.searchInput.value.trim(),
    state.activeTag,
    state.showOnlyFavorites,
    favorites,
  );
};

// Copy URL to clipboard
const copyToClipboard = async (text, dom) => {
  try {
    await navigator.clipboard.writeText(text);
    showToast(dom, "Copied: " + text);
  } catch {
    showToast(dom, "Copy failed");
  }
};

// Toggle theme
const toggleTheme = (dom) => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  storageSet(KEYS.theme, next);
  dom.btnTheme.classList.toggle("active", next === "light");
  dom.btnTheme.setAttribute("aria-pressed", next === "light");
};

// Toggle view mode
const toggleView = (state, dom) => {
  state.isGridView = !state.isGridView;
  dom.container.classList.toggle("view-grid", state.isGridView);
  storageSet(KEYS.view, state.isGridView ? "grid" : "list");
  dom.btnView.textContent = state.isGridView ? "▦ Grid" : "▤ List";
  dom.btnView.classList.toggle("active", state.isGridView);
  dom.btnView.setAttribute("aria-pressed", state.isGridView);
};

// Set active tag filter
const setActiveTag = (tag, state, dom, favorites) => {
  state.activeTag = state.activeTag === tag ? null : tag;
  renderAll(dom, state, dom.searchInput.value.trim(), favorites);
};

// Toggle favorites-only filter
const toggleFavoritesFilter = (state, dom, favorites) => {
  state.showOnlyFavorites = !state.showOnlyFavorites;
  const tag = dom.favoritesFilter?.querySelector(".tag");
  if (tag) {
    tag.classList.toggle("active", state.showOnlyFavorites);
    tag.setAttribute("aria-pressed", state.showOnlyFavorites);
  }
  renderBookmarks(
    dom,
    state,
    dom.searchInput.value.trim(),
    state.activeTag,
    state.showOnlyFavorites,
    favorites,
  );
};

// Clear all filters
const clearFilters = (state, dom, favorites) => {
  state.activeTag = null;
  state.showOnlyFavorites = false;
  renderAll(dom, state, dom.searchInput.value.trim(), favorites);
};

// Show toast notification
const showToast = (dom, msg) => {
  dom.toast.textContent = msg;
  dom.toast.classList.add("show");
  setTimeout(() => dom.toast.classList.remove("show"), 1800);
};

// Focus navigation
const focusItem = (index, dom, state) => {
  const items = [...dom.container.querySelectorAll(".link-item")];
  if (!items.length) return;
  items.forEach((el) => el.classList.remove("focused"));
  state.focusedIndex = Math.max(0, Math.min(index, items.length - 1));
  items[state.focusedIndex].classList.add("focused");
  items[state.focusedIndex].scrollIntoView({
    block: "nearest",
    behavior: "smooth",
  });
};

// Get focused item URL
const getFocusedUrl = (dom, state) => {
  const items = [...dom.container.querySelectorAll(".link-item")];
  return state.focusedIndex >= 0 && state.focusedIndex < items.length
    ? items[state.focusedIndex].dataset.url
    : null;
};

// Toggle help modal
const toggleHelpModal = (dom) => {
  dom.helpModal.classList.toggle("active");
  dom.helpModal.setAttribute(
    "aria-hidden",
    !dom.helpModal.classList.contains("active"),
  );
};

// Close help modal
const closeHelpModal = (dom) => {
  dom.helpModal.classList.remove("active");
  dom.helpModal.setAttribute("aria-hidden", "true");
};

// ============================================================
// EVENTS - Event delegation and listeners
// ============================================================

// Attach all event listeners
const attachEventListeners = (dom, state, favorites) => {
  // Search input with debounce
  dom.searchInput.addEventListener(
    "input",
    debounce(() => {
      storageSet(KEYS.lastSearch, dom.searchInput.value);
      renderAll(dom, state, dom.searchInput.value.trim(), favorites);
    }, 150),
  );

  // Event delegation for bookmark items
  dom.container.addEventListener("click", (e) => {
    const tag = e.target.closest(".tag[data-tag]");
    if (tag) {
      e.preventDefault();
      setActiveTag(tag.dataset.tag, state, dom, favorites);
      return;
    }

    const btn = e.target.closest(".action-btn");
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const url = btn.closest(".link-item").dataset.url;
      btn.dataset.action === "fav"
        ? toggleFavorite(url, state, dom, favorites)
        : copyToClipboard(url, dom);
    }
  });

  // Keyboard for bookmark tags
  dom.container.addEventListener("keydown", (e) => {
    if (
      (e.key === "Enter" || e.key === " ") &&
      e.target.closest(".tag[data-tag]")
    ) {
      e.preventDefault();
      setActiveTag(e.target.closest(".tag").dataset.tag, state, dom, favorites);
    }
  });

  // Event delegation for global tags
  dom.globalTagsList.addEventListener("click", (e) => {
    const tag = e.target.closest(".tag[data-tag]");
    if (tag) setActiveTag(tag.dataset.tag, state, dom, favorites);
  });

  dom.globalTagsList.addEventListener("keydown", (e) => {
    if (
      (e.key === "Enter" || e.key === " ") &&
      e.target.closest(".tag[data-tag]")
    ) {
      e.preventDefault();
      setActiveTag(e.target.closest(".tag").dataset.tag, state, dom, favorites);
    }
  });

  // Favorites filter
  if (dom.favoritesFilter) {
    dom.favoritesFilter.addEventListener("click", (e) => {
      if (e.target.closest(".tag[data-filter]"))
        toggleFavoritesFilter(state, dom, favorites);
    });
    dom.favoritesFilter.addEventListener("keydown", (e) => {
      if (
        (e.key === "Enter" || e.key === " ") &&
        e.target.closest(".tag[data-filter]")
      ) {
        e.preventDefault();
        toggleFavoritesFilter(state, dom, favorites);
      }
    });
  }

  // Top bar buttons
  dom.btnTheme.addEventListener("click", () => toggleTheme(dom));
  dom.btnView.addEventListener("click", () => toggleView(state, dom));
  dom.btnHelp.addEventListener("click", () => toggleHelpModal(dom));
  $("#help-close")?.addEventListener("click", () => closeHelpModal(dom));
  dom.helpModal.addEventListener("click", (e) => {
    if (e.target === dom.helpModal) closeHelpModal(dom);
  });

  // Global keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // Modal has priority
    if (dom.helpModal.classList.contains("active")) {
      if (e.key === "Escape") closeHelpModal(dom);
      return;
    }

    const inSearch = document.activeElement === dom.searchInput;

    // Search focus
    if (e.key === "/" && !inSearch) {
      e.preventDefault();
      dom.searchInput.focus();
      return;
    }

    // Escape clears search or filters
    if (e.key === "Escape") {
      if (inSearch && dom.searchInput.value) {
        dom.searchInput.value = "";
        storageSet(KEYS.lastSearch, "");
        renderAll(dom, state, "", favorites);
      } else if (inSearch) {
        dom.searchInput.blur();
      } else {
        clearFilters(state, dom, favorites);
      }
      return;
    }

    if (inSearch) return;

    // Map keys to action names (no switch, no function objects)
    const KEY_MAP = {
      j: "moveNext",
      k: "movePrev",
      g: "moveToTop",
      G: "moveToBottom",
      Enter: "openFocusedLink",
      f: "toggleFocusedFavorite",
      y: "copyFocusedUrl",
      v: "toggleViewAction",
      t: "toggleThemeAction",
      "?": "toggleHelpModalAction",
    };

    const ACTIONS = {
      moveNext: () => focusItem(state.focusedIndex + 1, dom, state),
      movePrev: () => focusItem(state.focusedIndex - 1, dom, state),
      moveToTop: () => {
        focusItem(0, dom, state);
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
      moveToBottom: () => {
        const items = [...dom.container.querySelectorAll(".link-item")];
        focusItem(items.length - 1, dom, state);
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: "smooth",
        });
      },
      openFocusedLink: () => {
        const url = getFocusedUrl(dom, state);
        if (url) window.open(url, "_blank");
      },
      toggleFocusedFavorite: () => {
        const url = getFocusedUrl(dom, state);
        if (url) toggleFavorite(url, state, dom, favorites);
      },
      copyFocusedUrl: () => {
        const url = getFocusedUrl(dom, state);
        if (url) copyToClipboard(url, dom);
      },
      toggleViewAction: () => toggleView(state, dom),
      toggleThemeAction: () => toggleTheme(dom),
      toggleHelpModalAction: () => toggleHelpModal(dom),
    };

    const actionName = KEY_MAP[e.key];
    if (actionName && ACTIONS[actionName]) ACTIONS[actionName]();
  });
};

// ============================================================
// INIT - Bootstrap the app
// ============================================================

const init = async () => {
  try {
    const state = {
      bookmarks: [],
      favorites: new Set(),
      activeTag: null,
      showOnlyFavorites: false,
      focusedIndex: -1,
      isGridView: false,
    };

    // Cache DOM elements
    const dom = {
      container: $("#links-list"),
      searchInput: $("#search"),
      resultsInfo: $("#results-info"),
      sidebar: $("#sidebar"),
      globalTagsList: $("#global-tags-list"),
      favoritesSection: $("#favorites-section"),
      favoritesFilter: $("#favorites-filter"),
      favCount: $("#fav-count"),
      tagsCount: $("#tags-count"),
      toast: $("#toast"),
      helpModal: $("#help-modal"),
      btnTheme: $("#btn-theme"),
      btnView: $("#btn-view"),
      btnHelp: $("#btn-help"),
    };

    // Load persisted state
    const favorites = new Set(storageGetJSON(KEYS.favorites, []));
    state.favorites = favorites;

    // Apply saved theme
    const savedTheme = storageGet(KEYS.theme, getDefaultTheme());
    document.documentElement.setAttribute("data-theme", savedTheme);
    storageSet(KEYS.theme, savedTheme);
    dom.btnTheme.classList.toggle("active", savedTheme === "light");
    dom.btnTheme.setAttribute("aria-pressed", savedTheme === "light");

    // Apply saved view
    const savedView = storageGet(KEYS.view, "list");
    const isGrid = savedView === "grid";
    dom.container.classList.toggle("view-grid", isGrid);
    dom.btnView.textContent = isGrid ? "▦ Grid" : "▤ List";
    dom.btnView.classList.toggle("active", isGrid);
    dom.btnView.setAttribute("aria-pressed", isGrid);
    state.isGridView = isGrid;

    // Load bookmarks from bookmarks.txt
    const res = await fetch("bookmarks.txt");
    if (!res.ok) throw new Error("bookmarks.txt not found");

    state.bookmarks = parseBookmarks(await res.text());

    if (!state.bookmarks.length) {
      dom.container.innerHTML =
        '<p class="status-message error">No bookmarks found.</p>';
      return;
    }

    // Initial render
    renderAll(dom, state, "", favorites);
    updateFavoritesUI(dom, favorites.size);
    dom.sidebar.classList.remove("hidden");
    dom.sidebar.setAttribute("aria-hidden", "false");

    // Restore last search
    const lastSearch = storageGet(KEYS.lastSearch, "");
    if (lastSearch) {
      dom.searchInput.value = lastSearch;
      renderAll(dom, state, lastSearch, favorites);
    }

    // Attach events
    attachEventListeners(dom, state, favorites);
  } catch (error) {
    const errorContainer = $("#links-list");
    if (errorContainer) {
      errorContainer.innerHTML =
        '<p class="status-message error">Error loading bookmarks.txt.</p>';
    }
    console.error("Initialization error:", error);
  }
};

// Get system theme preference
const getDefaultTheme = () => {
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
};

// Start app
document.addEventListener("DOMContentLoaded", init);
