/**
 * Render subfeature rows into the given <tbody> element.
 */
export function renderRows(tbody, rows) {
  tbody.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td class="feature-name">${esc(row.feature)}</td>` +
      `<td class="subfeature-name">${esc(row.subfeature)}</td>` +
      `<td>${stateBadge(row.state)}</td>` +
      `<td>${rolloutCell(row.rollout)}</td>` +
      `<td>${cohortsCell(row.cohorts)}</td>`;
    fragment.appendChild(tr);
  }

  tbody.appendChild(fragment);
}

function esc(s) {
  const el = document.createElement("span");
  el.textContent = s;
  return el.innerHTML;
}

function stateBadge(state) {
  const cls = {
    enabled: "badge-enabled",
    disabled: "badge-disabled",
    internal: "badge-internal",
    preview: "badge-preview",
  }[state] ?? "badge-disabled";

  return `<span class="badge ${cls}">${esc(state)}</span>`;
}

function rolloutCell(rollout) {
  if (!rollout?.steps?.length) return '<span class="text-muted">—</span>';

  const maxPercent = rollout.steps[rollout.steps.length - 1].percent;
  const stepsLabel = rollout.steps.map((s) => `${s.percent}%`).join(" → ");

  return (
    `<div class="rollout-bar-wrap">` +
      `<div class="rollout-bar"><div class="rollout-bar-fill" style="width:${maxPercent}%"></div></div>` +
      `<span class="rollout-steps">${esc(stepsLabel)}</span>` +
    `</div>`
  );
}

function cohortsCell(cohorts) {
  if (!cohorts?.length) return '<span class="text-muted">—</span>';

  return (
    `<div class="cohort-list">` +
    cohorts
      .map(
        (c) =>
          `<span class="cohort-tag">${esc(c.name)} <span class="cohort-weight">w:${c.weight}</span></span>`
      )
      .join("") +
    `</div>`
  );
}
