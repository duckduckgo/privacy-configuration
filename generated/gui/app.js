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
const filtersFieldset = document.getElementById("filters");
const filterRollout = document.getElementById("filter-rollout");
const filterCohorts = document.getElementById("filter-cohorts");

const ALL_STATES = ["enabled", "disabled", "internal"];
const stateCheckboxes = filtersFieldset.querySelectorAll('input[type="checkbox"][value]');

function getSelectedStates() {
  return [...stateCheckboxes]
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

function setSelectedStates(states) {
  for (const cb of stateCheckboxes) {
    cb.checked = states.includes(cb.value);
  }
}

let allRows = [];
let sortKey = "feature";
let sortDir = "asc";

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const statesRaw = params.get("states");
  return {
    platform: params.get("platform") ?? "",
    search: params.get("search") ?? "",
    states: statesRaw ? statesRaw.split(",").filter((s) => ALL_STATES.includes(s)) : [...ALL_STATES],
    rollout: params.get("rollout") === "1",
    cohorts: params.get("cohorts") === "1",
  };
}

function writeHash() {
  const params = new URLSearchParams();
  if (platformSelect.value) params.set("platform", platformSelect.value);
  if (searchInput.value.trim()) params.set("search", searchInput.value.trim());
  const states = getSelectedStates();
  if (states.length !== ALL_STATES.length || !ALL_STATES.every((s) => states.includes(s))) {
    params.set("states", states.join(","));
  }
  if (filterRollout.checked) params.set("rollout", "1");
  if (filterCohorts.checked) params.set("cohorts", "1");
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
  for (const cb of stateCheckboxes) cb.addEventListener("change", onFilter);
  filterRollout.addEventListener("change", onFilter);
  filterCohorts.addEventListener("change", onFilter);
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => onSort(th.dataset.key));
  });

  const initial = readHash();
  setSelectedStates(initial.states);
  filterRollout.checked = initial.rollout;
  filterCohorts.checked = initial.cohorts;
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
  filtersFieldset.disabled = true;

  try {
    const config = await loadConfig(id);
    allRows = extractSubfeatures(config);
    allRows.sort(comparator());
    searchInput.disabled = false;
    filtersFieldset.disabled = false;
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
  const states = new Set(getSelectedStates());
  const needRollout = filterRollout.checked;
  const needCohorts = filterCohorts.checked;

  const filtered = allRows.filter((r) => {
    if (!states.has(r.state)) return false;
    if (needRollout && !r.rollout) return false;
    if (needCohorts && !r.cohorts) return false;
    if (query && !r.feature.toLowerCase().includes(query) && !r.subfeature.toLowerCase().includes(query)) return false;
    return true;
  });

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
  filtersFieldset.disabled = true;
}

init();
