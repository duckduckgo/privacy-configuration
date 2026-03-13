import { PLATFORMS, loadConfig, extractSubfeatures } from "./config-loader.js";
import { renderRows } from "./table-renderer.js";

const platformSelect = document.getElementById("platform-select");
const searchInput = document.getElementById("search-input");
const tableWrap = document.getElementById("table-wrap");
const tbody = document.getElementById("results-body");
const loadingEl = document.getElementById("loading");
const emptyEl = document.getElementById("empty");
const statsEl = document.getElementById("stats");
const statsText = document.getElementById("stats-text");

let allRows = [];
let sortKey = "feature";
let sortDir = "asc";

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  return {
    platform: params.get("platform") ?? "",
    search: params.get("search") ?? "",
  };
}

function writeHash() {
  const params = new URLSearchParams();
  if (platformSelect.value) params.set("platform", platformSelect.value);
  if (searchInput.value.trim()) params.set("search", searchInput.value.trim());
  const fragment = params.toString();
  history.replaceState(null, "", fragment ? `#${fragment}` : location.pathname);
}

async function init() {
  for (const p of PLATFORMS) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.label;
    platformSelect.appendChild(opt);
  }

  platformSelect.addEventListener("change", onPlatformChange);
  searchInput.addEventListener("input", onFilter);
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => onSort(th.dataset.key));
  });

  const initial = readHash();
  if (initial.platform && PLATFORMS.some((p) => p.id === initial.platform)) {
    platformSelect.value = initial.platform;
    await onPlatformChange(initial.search);
  }
}

async function onPlatformChange(initialSearch) {
  const id = platformSelect.value;
  if (!id) {
    reset();
    writeHash();
    return;
  }

  loadingEl.hidden = false;
  tableWrap.hidden = true;
  emptyEl.hidden = true;
  statsEl.hidden = true;
  if (typeof initialSearch !== "string") searchInput.value = "";
  searchInput.disabled = true;

  try {
    const config = await loadConfig(id);
    allRows = extractSubfeatures(config);
    allRows.sort(comparator());
    searchInput.disabled = false;
    if (typeof initialSearch === "string") searchInput.value = initialSearch;
    writeHash();
    applyFilter();
  } catch (err) {
    loadingEl.hidden = true;
    emptyEl.textContent = `Error loading config: ${err.message}`;
    emptyEl.hidden = false;
  }
}

function onFilter() {
  writeHash();
  applyFilter();
}

function applyFilter() {
  loadingEl.hidden = true;

  const query = searchInput.value.trim().toLowerCase();
  const filtered = query
    ? allRows.filter(
        (r) =>
          r.feature.toLowerCase().includes(query) ||
          r.subfeature.toLowerCase().includes(query)
      )
    : allRows;

  if (filtered.length === 0) {
    tableWrap.hidden = true;
    emptyEl.textContent = "No matching subfeatures found.";
    emptyEl.hidden = false;
    statsEl.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  renderRows(tbody, filtered);
  tableWrap.hidden = false;
  statsText.textContent = `${filtered.length} subfeature${filtered.length === 1 ? "" : "s"}` +
    (query ? ` matching "${searchInput.value.trim()}"` : "") +
    ` · ${allRows.length} total`;
  statsEl.hidden = false;
}

function onSort(key) {
  if (sortKey === key) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortKey = key;
    sortDir = "asc";
  }

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.key === sortKey) {
      th.classList.add(sortDir === "asc" ? "sort-asc" : "sort-desc");
    }
  });

  allRows.sort(comparator());
  applyFilter();
}

function comparator() {
  return (a, b) => {
    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    const cmp = String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  };
}

function reset() {
  allRows = [];
  tbody.innerHTML = "";
  tableWrap.hidden = true;
  emptyEl.hidden = true;
  loadingEl.hidden = true;
  statsEl.hidden = true;
  searchInput.value = "";
  searchInput.disabled = true;
}

init();
