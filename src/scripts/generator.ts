import { domToCanvas } from "modern-screenshot";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

type Theme = "flower" | "plant";
type Stage = "adult" | "elder" | "teen" | "child" | "baby";
type Member = { name: string; sub: string; obj: string; stage: Stage };

const MAX_MEMBERS = 6;
const PREVIEW_URL = (id: string) => `/library/${id}.webp`;
const HQ_URL = (id: string) => `/library-hq/${id}.webp`;

// Height of each life stage relative to a grown-up.
const STAGES: { id: Stage; label: string; height: number }[] = [
  { id: "adult", label: "Grown-up", height: 1.0 },
  { id: "elder", label: "Elder", height: 0.92 },
  { id: "teen", label: "Teen", height: 0.82 },
  { id: "child", label: "Child", height: 0.68 },
  { id: "baby", label: "Baby", height: 0.5 },
];
const STAGE_HEIGHT = Object.fromEntries(STAGES.map((s) => [s.id, s.height])) as Record<Stage, number>;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_FLOWER: Record<string, string> = {
  January: "fl_carnation",
  February: "fl_iris",
  March: "fl_daffodil",
  April: "fl_daisy",
  May: "fl_lily",
  June: "fl_rose",
  July: "fl_larkspur",
  August: "fl_poppy",
  September: "fl_aster",
  October: "fl_marigold",
  November: "fl_chrysanthemum",
  December: "fl_narcissus",
};
const FLOWER_MONTH: Record<string, string> = Object.fromEntries(
  Object.entries(MONTH_FLOWER).map(([month, id]) => [id, month]),
);

const OBJECT_LABEL: Record<string, string> = {
  fl_aster: "Aster",
  fl_carnation: "Carnation",
  fl_chrysanthemum: "Chrysanthemum",
  fl_daffodil: "Daffodil",
  fl_daisy: "Daisy",
  fl_iris: "Iris",
  fl_larkspur: "Larkspur",
  fl_lily: "Lily of the valley",
  fl_marigold: "Marigold",
  fl_narcissus: "Narcissus",
  fl_poppy: "Poppy",
  fl_rose: "Rose",
  pl_aloe: "Aloe",
  pl_cactus: "Cactus",
  pl_echeveria: "Echeveria",
  pl_fern: "Fern",
  pl_fiddle: "Fiddle leaf",
  pl_monstera: "Monstera",
  pl_pilea: "Pilea",
  pl_pothos: "Pothos",
  pl_snake: "Snake plant",
  pl_sprout: "Sprout",
  x_paw: "🐾 Pet (paw)",
  x_butterfly: "🦋 Butterfly (in memory)",
  x_forgetmenot: "💙 Forget-me-not (in memory)",
  x_infinity: "∞ Infinity (in memory)",
};
const PLANTS = [
  "pl_monstera",
  "pl_snake",
  "pl_echeveria",
  "pl_pilea",
  "pl_fern",
  "pl_fiddle",
  "pl_pothos",
  "pl_aloe",
  "pl_cactus",
  "pl_sprout",
];
const EXTRAS = ["x_paw", "x_butterfly", "x_forgetmenot", "x_infinity"];

const THEME_TEXT: Record<Theme, { sub: string; tagline: string }> = {
  flower: { sub: "Birth Flowers", tagline: "— every bloom a birthday —" },
  plant: { sub: "Our Little Garden", tagline: "— together we grow —" },
};
const SAMPLE_NAMES = ["Ava", "Leo", "Mia", "Noah", "Zoe", "Liam", "Ella", "Kai", "Nora", "Finn"];
const SHUFFLE_PRESETS: Stage[][] = [
  ["adult", "adult", "child"],
  ["adult", "adult", "teen", "child"],
  ["adult", "adult", "child", "baby"],
  ["elder", "elder", "adult", "adult", "child"],
  ["adult", "adult", "teen", "child", "baby"],
];

/** Example label for a plant-theme member, based on life stage (first grown-up "Dad", second "Mum"). */
function sampleRole(stage: Stage, adultIndex: number, i: number) {
  if (stage === "adult") return adultIndex === 0 ? "Dad" : "Mum";
  return {
    elder: "Grandparent",
    teen: "Teen",
    child: `Age ${4 + i}`,
    baby: "Baby",
  }[stage];
}
/** True for labels the generator filled in itself (safe to replace when the theme changes). */
const isAutoLabel = (sub: string) =>
  !sub || MONTHS.includes(sub) || /^(Dad|Mum|Grandparent|Teen|Baby|Age \d+)$/.test(sub);

// Layout numbers that must match the .pwrap / .mount / .prow rules in Generator.astro.
const LAYOUT = {
  desktop: {
    objectHeight: 170,
    sidePadding: 44,
    gap: 12,
    nameSize: 15,
    labelSize: 8.5,
    nameFloor: 9,
    labelFloor: 7,
  },
  mobile: {
    objectHeight: 126,
    sidePadding: 20,
    gap: 4,
    nameSize: 11,
    labelSize: 7.5,
    nameFloor: 6.5,
    labelFloor: 5.5,
  },
};
const MOBILE_QUERY = "(max-width: 640px)";

// Export: fixed long edge in pixels, so a phone and a laptop produce the same resolution.
// Stays well under iOS Safari's canvas limit. DPI is only used to give the PDF a real page size.
const EXPORT_LONG_EDGE = 2800;
const EXPORT_DPI = 240;

// ---------------------------------------------------------------------------
// State + helpers
// ---------------------------------------------------------------------------

let theme: Theme = "flower";
let paper = "#f3efe6";
let shuffleIndex = 0;
let members: Member[] = [{ name: "", sub: "", obj: "fl_rose", stage: "adult" }];

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector(selector) as T;
const input = (selector: string) => $<HTMLInputElement>(selector);
const esc = (s: string) =>
  (s || "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const sampleName = (i: number) => SAMPLE_NAMES[i % SAMPLE_NAMES.length];

const membersEl = $("#members");
const mount = $("#mount");
const row = $("#pvRow");

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function option(id: string, label: string, selected: string) {
  return `<option value="${id}"${id === selected ? " selected" : ""}>${label}</option>`;
}

function objectOptions(selected: string) {
  const main =
    theme === "flower"
      ? `<optgroup label="Birth flower (month)">${MONTHS.map((m) =>
          option(MONTH_FLOWER[m], `${m} · ${OBJECT_LABEL[MONTH_FLOWER[m]]}`, selected),
        ).join("")}</optgroup>`
      : `<optgroup label="Plant">${PLANTS.map((id) => option(id, OBJECT_LABEL[id], selected)).join("")}</optgroup>`;
  const extras = `<optgroup label="Extras (pet · memory)">${EXTRAS.map((id) =>
    option(id, OBJECT_LABEL[id], selected),
  ).join("")}</optgroup>`;
  return main + extras;
}

function renderControls() {
  // innerHTML rebuild loses focus, so remember which field had it and restore it afterwards.
  const active = document.activeElement as HTMLElement | null;
  const activeRow = active?.closest<HTMLElement>(".mem")?.dataset.i;
  const activeClass = active?.classList[0];

  const subPlaceholder = theme === "flower" ? "Birth month / label" : "Role / age";
  membersEl.innerHTML = members
    .map((m, i) => {
      const n = i + 1;
      return `<div class="mem" data-i="${i}" role="group" aria-label="Person ${n}">
        <div class="rh">
          <input type="text" class="mName" value="${esc(m.name)}" placeholder="${sampleName(i)}" maxlength="16" aria-label="Person ${n} name">
          <button type="button" class="rm" aria-label="Remove person ${n}"${members.length <= 1 ? " disabled" : ""}>×</button>
        </div>
        <div class="rr">
          <input type="text" class="mSub" value="${esc(m.sub)}" placeholder="${subPlaceholder}" maxlength="20" aria-label="Person ${n} label">
          <select class="mStage" aria-label="Person ${n} life stage">${STAGES.map((s) => option(s.id, s.label, m.stage)).join("")}</select>
        </div>
        <div class="rr one">
          <select class="mObj" aria-label="Person ${n} ${theme === "flower" ? "birth flower" : "plant"}">${objectOptions(m.obj)}</select>
        </div>
      </div>`;
    })
    .join("");
  $<HTMLButtonElement>("#addBtn").disabled = members.length >= MAX_MEMBERS;

  if (activeRow !== undefined && activeClass) {
    const restore =
      membersEl.querySelector<HTMLElement>(`.mem[data-i="${activeRow}"] .${activeClass}`) ??
      membersEl.querySelector<HTMLElement>(".mem:last-child .mName");
    restore?.focus();
  }
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/**
 * Draws the print. With `forExport`, placeholder names/labels are kept in the layout
 * (so spacing doesn't shift) but made invisible, so they never end up in a download.
 */
function renderPreview(forExport = false) {
  mount.style.background = paper;
  $("#pvTitle").textContent = input("#fTitle").value || " ";
  const sub = input("#fSub").value || THEME_TEXT[theme].sub;
  const est = input("#fEst").value.trim();
  $("#pvEst").textContent = est ? `${sub} · Est. ${est}` : sub;
  $("#pvTl").textContent = THEME_TEXT[theme].tagline;

  const L = window.matchMedia(MOBILE_QUERY).matches ? LAYOUT.mobile : LAYOUT.desktop;
  const n = Math.max(1, members.length);
  const columnWidth = Math.max(24, (mount.offsetWidth - L.sidePadding - (n - 1) * L.gap) / n) * 0.94;

  const hint = (text: string) =>
    forExport
      ? `<span style="visibility:hidden">${esc(text)}</span>`
      : `<span class="ph">${esc(text)}</span>`;

  row.innerHTML = members
    .map((m, i) => {
      const height = Math.round(L.objectHeight * STAGE_HEIGHT[m.stage]);
      // In flower mode the chosen flower implies a birth month; print it once the person has a name.
      const impliedMonth = theme === "flower" ? FLOWER_MONTH[m.obj] || "" : "";
      const name = m.name ? esc(m.name) : hint(sampleName(i));
      const label = m.sub
        ? esc(m.sub)
        : impliedMonth
          ? m.name && forExport
            ? esc(impliedMonth)
            : hint(impliedMonth)
          : forExport
            ? hint(" ")
            : "";
      const nameIsHint = !m.name;
      const labelIsHint = !m.sub && !(impliedMonth && m.name);
      // An invisible hint that overflows would still show a visible "…" — clip it instead.
      const clip = (isHint: boolean) => (forExport && isHint ? ";text-overflow:clip" : "");
      return `<div class="pfig">
        <div class="pwrap"><img src="${PREVIEW_URL(m.obj)}" data-id="${m.obj}" alt="" style="height:${height}px;width:auto"></div>
        <div class="pnm" style="font-size:${L.nameSize}px${clip(nameIsHint)}">${name}</div>
        <div class="prl" style="font-size:${L.labelSize}px${clip(labelIsHint)}">${label}</div>
      </div>`;
    })
    .join("");

  fitText(".pnm", L.nameSize, L.nameFloor);
  fitText(".prl", L.labelSize, L.labelFloor);
  return scaleToColumns(columnWidth);
}

/**
 * Shrinks a whole group of labels together until none of them overflows (or the floor is hit,
 * after which CSS ellipsis takes over). One shared size keeps a row from looking mismatched.
 */
function fitText(selector: string, start: number, floor: number) {
  const boxes = Array.from(row.querySelectorAll<HTMLElement>(selector));
  let size = start;
  const overflows = () => boxes.some((b) => b.scrollWidth > b.clientWidth);
  while (size > floor && overflows()) {
    size -= 0.5;
    boxes.forEach((b) => (b.style.fontSize = `${size}px`));
  }
  // Still too long at the minimum size: shorten with "…" in the text itself rather than relying on
  // CSS text-overflow, which not every browser keeps when the node is rendered to a canvas.
  for (const box of boxes) {
    const target = box.querySelector("span") ?? box;
    const full = target.textContent ?? "";
    let n = full.length;
    while (box.scrollWidth > box.clientWidth && n > 1)
      target.textContent = full.slice(0, --n).trimEnd() + "…";
  }
}

/**
 * Each object is drawn at its life-stage height with its natural width. If any is wider than its
 * column, the whole family is scaled down by the same factor, so a teen never ends up taller than
 * an adult just because the adult's plant happens to be wide.
 */
function scaleToColumns(columnWidth: number): Promise<void> {
  const imgs = Array.from(row.querySelectorAll<HTMLImageElement>("img"));
  return Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
          }),
    ),
  ).then(() => {
    const sizes = imgs.map((img) => img.getBoundingClientRect());
    const scale = Math.min(1, ...sizes.map((r) => (r.width > columnWidth ? columnWidth / r.width : 1)));
    if (scale === 1) return;
    imgs.forEach((img, i) => {
      img.style.width = `${Math.round(sizes[i].width * scale)}px`;
      img.style.height = `${Math.round(sizes[i].height * scale)}px`;
    });
  });
}

function render() {
  renderControls();
  renderPreview();
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

membersEl.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const rowEl = el.closest<HTMLElement>(".mem");
  if (!rowEl) return;
  const m = members[Number(rowEl.dataset.i)];

  if (el.classList.contains("mName")) m.name = el.value;
  else if (el.classList.contains("mSub")) m.sub = el.value;
  else if (el.classList.contains("mStage")) m.stage = el.value as Stage;
  else if (el.classList.contains("mObj")) {
    m.obj = el.value;
    // Picking a birth flower fills in its month, unless the user typed their own label.
    const month = FLOWER_MONTH[el.value];
    if (theme === "flower" && month && (!m.sub || MONTHS.includes(m.sub))) m.sub = month;
    render();
    return;
  }
  renderPreview();
});

membersEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest(".rm");
  if (!btn || members.length <= 1) return;
  members.splice(Number(btn.closest<HTMLElement>(".mem")!.dataset.i), 1);
  render();
});

$("#addBtn").addEventListener("click", () => {
  if (members.length >= MAX_MEMBERS) return;
  const obj =
    theme === "flower"
      ? MONTH_FLOWER[MONTHS[(members.length + 6) % 12]]
      : PLANTS[members.length % PLANTS.length];
  members.push({ name: "", sub: "", obj, stage: "child" });
  render();
  membersEl.querySelector<HTMLInputElement>(".mem:last-child .mName")?.focus();
});

["#fTitle", "#fSub", "#fEst"].forEach((s) => $(s).addEventListener("input", () => renderPreview()));

$("#paperBtns").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".swatch");
  if (!btn) return;
  paper = btn.dataset.p!;
  document.querySelectorAll<HTMLButtonElement>(".swatch").forEach((x) => {
    x.classList.toggle("on", x === btn);
    x.setAttribute("aria-pressed", String(x === btn));
  });
  renderPreview();
});

function setTheme(next: Theme) {
  theme = next;
  for (const [id, t] of [
    ["#tFlower", "flower"],
    ["#tPlant", "plant"],
  ] as const) {
    $(id).classList.toggle("on", t === next);
    $(id).setAttribute("aria-pressed", String(t === next));
  }
  // Swap objects for the new theme; keep any label the user typed themselves.
  let adults = 0;
  members = members.map((m, i) => {
    const keep = !isAutoLabel(m.sub);
    if (next === "flower") {
      const month = MONTHS.includes(m.sub) ? m.sub : MONTHS[i % 12];
      const obj = EXTRAS.includes(m.obj) ? m.obj : MONTH_FLOWER[month];
      return { ...m, obj, sub: keep ? m.sub : month };
    }
    const role = sampleRole(m.stage, m.stage === "adult" ? adults++ : 0, i);
    const obj = EXTRAS.includes(m.obj) ? m.obj : PLANTS[i % PLANTS.length];
    return { ...m, obj, sub: keep ? m.sub : role };
  });
  input("#fSub").placeholder = THEME_TEXT[next].sub;
  render();
}
$("#tPlant").addEventListener("click", () => setTheme("plant"));
$("#tFlower").addEventListener("click", () => setTheme("flower"));

$("#shuffleBtn").addEventListener("click", () => {
  const stages = SHUFFLE_PRESETS[shuffleIndex++ % SHUFFLE_PRESETS.length];
  let adults = 0;
  members = stages.map((stage, i) => {
    const name = SAMPLE_NAMES[(i * 3 + stages.length) % SAMPLE_NAMES.length];
    if (theme === "flower") {
      const month = MONTHS[(i * 5 + 3) % 12];
      return { name, sub: month, obj: MONTH_FLOWER[month], stage };
    }
    const sub = sampleRole(stage, stage === "adult" ? adults++ : 0, i);
    return { name, sub, obj: PLANTS[i % PLANTS.length], stage };
  });
  render();
});

let resizeTimer = 0;
let exporting = false;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  if (exporting) return; // a re-render mid-export would put placeholders back into the file
  resizeTimer = window.setTimeout(() => renderPreview(), 150);
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function fileName(): string {
  const slug = input("#fTitle")
    .value.trim()
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // "Şahin" → "Sahin", "Müller" → "Muller"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "planted-family";
}

async function toDataURL(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Swaps every preview image for its high-resolution version, inlined as a data URL.
 * Inlining also avoids WebKit dropping images that haven't been painted yet.
 * If a high-res file is missing, the preview image stays in place.
 */
async function useHighResImages() {
  const imgs = Array.from(row.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(
    imgs.map(async (img) => {
      let src: string;
      try {
        src = await toDataURL(HQ_URL(img.dataset.id!));
      } catch {
        src = await toDataURL(img.src).catch(() => img.src);
      }
      await new Promise<void>((res) => {
        img.onload = img.onerror = () => res();
        img.src = src;
      });
    }),
  );
}

const status = (msg: string) => ($("#exportStatus").textContent = msg);
const READY_MESSAGE = "Free to download, no sign-up.";

async function exportPrint(format: "png" | "pdf") {
  if (exporting) return;
  exporting = true;
  clearTimeout(resizeTimer);
  const buttons = [$<HTMLButtonElement>("#downloadBtn"), $<HTMLButtonElement>("#downloadPdfBtn")];
  buttons.forEach((b) => (b.disabled = true));
  status("Preparing your print…");
  try {
    await document.fonts.ready;
    await renderPreview(true);
    await useHighResImages();
    const scale = Math.min(
      8,
      Math.max(2, EXPORT_LONG_EDGE / Math.max(mount.offsetWidth, mount.offsetHeight)),
    );

    // Draw onto a canvas pre-filled with the paper colour: WebKit can leave the outermost
    // pixels transparent, which would turn into a thin black frame in the JPEG inside the PDF.
    const shot = await domToCanvas(mount, { scale, backgroundColor: paper });
    const canvas = document.createElement("canvas");
    canvas.width = shot.width;
    canvas.height = shot.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(shot, 0, 0);

    if (format === "png") {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${fileName()}.png`;
      a.click();
    } else {
      const { jsPDF } = await import("jspdf");
      const jpeg = canvas.toDataURL("image/jpeg", 0.92);
      const w = (canvas.width / EXPORT_DPI) * 25.4;
      const h = (canvas.height / EXPORT_DPI) * 25.4;
      const pdf = new jsPDF({
        orientation: h > w ? "portrait" : "landscape",
        unit: "mm",
        format: [w, h],
      });
      pdf.addImage(jpeg, "JPEG", 0, 0, w, h);
      pdf.save(`${fileName()}.pdf`);
    }
    status(READY_MESSAGE);
  } catch (err) {
    status("Something went wrong — please try again.");
    console.error("Export failed", err);
  } finally {
    renderPreview();
    buttons.forEach((b) => (b.disabled = false));
    exporting = false;
  }
}

$("#downloadBtn").addEventListener("click", () => exportPrint("png"));
$("#downloadPdfBtn").addEventListener("click", () => exportPrint("pdf"));

// ---------------------------------------------------------------------------

input("#fSub").placeholder = THEME_TEXT.flower.sub;
render();
