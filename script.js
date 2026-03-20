const progressBar = document.getElementById("progressBar");
const fileInput = document.getElementById("fileInput");
const generateBtn = document.getElementById("generateBtn");
const editToggleBtn = document.getElementById("editToggleBtn");
const saveDraftBtn = document.getElementById("saveDraftBtn");
const clearDraftBtn = document.getElementById("clearDraftBtn");
const exportHtmlBtn = document.getElementById("exportHtmlBtn");
const uploadStatus = document.getElementById("uploadStatus");
const articleTitle = document.getElementById("articleTitle");
const articleMeta = document.getElementById("articleMeta");
const articleBody = document.getElementById("articleBody");

let revealObserver;
let isEditMode = false;
let saveTimer;
const DRAFT_KEY = "simple_blog_local_draft_v1";

function setReadingProgress() {
  const scrollTop = window.scrollY;
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? (scrollTop / scrollable) * 100 : 0;

  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }
}

function ensureRevealObserver() {
  if (revealObserver) {
    return revealObserver;
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  return revealObserver;
}

function registerRevealTargets() {
  const observer = ensureRevealObserver();
  const revealEls = document.querySelectorAll(".reveal-up:not(.is-visible)");
  revealEls.forEach((el, idx) => {
    el.style.transitionDelay = `${Math.min(idx * 35, 240)}ms`;
    observer.observe(el);
  });
}

function setEditMode(enabled) {
  isEditMode = enabled;
  [articleTitle, articleMeta, articleBody].forEach((el) => {
    if (!el) {
      return;
    }

    el.contentEditable = enabled ? "true" : "false";
    el.classList.toggle("editable", enabled);
  });

  if (editToggleBtn) {
    editToggleBtn.textContent = enabled ? "Disable Edit Mode" : "Enable Edit Mode";
  }
}

function serializeDraft() {
  return {
    title: articleTitle?.innerHTML || "",
    meta: articleMeta?.innerHTML || "",
    body: articleBody?.innerHTML || "",
    updatedAt: new Date().toISOString(),
  };
}

function saveDraft(showMessage = true) {
  const payload = serializeDraft();
  localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  if (showMessage) {
    uploadStatus.textContent = "Draft saved locally in this browser.";
  }
}

function loadDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) {
    return;
  }

  try {
    const draft = JSON.parse(raw);
    if (draft.title) {
      articleTitle.innerHTML = draft.title;
    }
    if (draft.meta) {
      articleMeta.innerHTML = draft.meta;
    }
    if (draft.body) {
      articleBody.innerHTML = draft.body;
    }

    registerRevealTargets();
    uploadStatus.textContent = "Loaded your local draft.";
  } catch {
    uploadStatus.textContent = "Could not load saved draft.";
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  uploadStatus.textContent = "Local draft removed from this browser.";
}

function handleLiveEdit() {
  if (!isEditMode) {
    return;
  }

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft(false), 450);
}

function downloadTextFile(fileName, textContent) {
  const blob = new Blob([textContent], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportCurrentHtml() {
  try {
    const cloneRoot = document.documentElement.cloneNode(true);

    const uploadPanel = cloneRoot.querySelector(".upload-panel");
    if (uploadPanel) {
      uploadPanel.remove();
    }

    cloneRoot.querySelectorAll(".editable").forEach((el) => el.classList.remove("editable"));
    cloneRoot.querySelectorAll("[contenteditable]").forEach((el) => {
      el.removeAttribute("contenteditable");
    });

    const oldScript = cloneRoot.querySelector('script[src="script.js"]');
    if (oldScript) {
      oldScript.remove();
    }

    const bodyEl = cloneRoot.querySelector("body");
    if (!bodyEl) {
      throw new Error("Could not build export file.");
    }

    const exportScript = document.createElement("script");
    exportScript.setAttribute("src", "script.js");
    bodyEl.appendChild(exportScript);

    const finalHtml = `<!doctype html>\n${cloneRoot.outerHTML}`;
    downloadTextFile("index.html", finalHtml);
    uploadStatus.textContent = "Exported ready-to-upload index.html.";
  } catch (error) {
    uploadStatus.textContent = error.message || "Export failed. Please try again.";
  }
}

function estimateReadMinutes(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function splitParagraphs(text) {
  return text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((part) => part.replace(/\n/g, " ").trim())
    .filter(Boolean);
}

function buildArticleFromText(rawText, fileName) {
  const cleaned = rawText.replace(/\u0000/g, "").trim();
  if (!cleaned) {
    throw new Error("The uploaded file appears to be empty.");
  }

  const parts = splitParagraphs(cleaned);
  const firstLine = cleaned.split(/\n/).map((line) => line.trim()).find(Boolean);
  const fallbackTitle = fileName.replace(/\.[^.]+$/, "") || "Uploaded Article";
  const title = firstLine && firstLine.length <= 100 ? firstLine : fallbackTitle;
  const readMinutes = estimateReadMinutes(cleaned);
  const today = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  articleTitle.textContent = title;
  articleMeta.textContent = `From ${fileName} - ${today} - ${readMinutes} min read`;

  articleBody.innerHTML = "";

  const bodyParts = parts.slice(firstLine === title ? 1 : 0);
  bodyParts.slice(0, 30).forEach((paragraph, idx) => {
    if (idx > 0 && idx % 5 === 0 && paragraph.length < 80) {
      const heading = document.createElement("h2");
      heading.className = "reveal-up";
      heading.textContent = paragraph;
      articleBody.appendChild(heading);
      return;
    }

    const p = document.createElement("p");
    p.className = "reveal-up";
    p.textContent = paragraph;
    articleBody.appendChild(p);
  });

  registerRevealTargets();
  setReadingProgress();
}

async function parsePdf(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF parser failed to load. Please refresh and try again.");
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js";

  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";

  for (let page = 1; page <= pdf.numPages; page += 1) {
    const pageData = await pdf.getPage(page);
    const content = await pageData.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    text += `${pageText}\n\n`;
  }

  return text;
}

async function parseDocx(file) {
  if (!window.mammoth) {
    throw new Error("DOCX parser failed to load. Please refresh and try again.");
  }

  const buffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

async function parseTxt(file) {
  return file.text();
}

async function handleGenerateArticle() {
  const file = fileInput?.files?.[0];
  if (!file) {
    uploadStatus.textContent = "Please choose a PDF, DOCX, or TXT file first.";
    return;
  }

  const lowerName = file.name.toLowerCase();
  uploadStatus.textContent = "Reading file and generating article...";

  try {
    let text = "";

    if (lowerName.endsWith(".pdf")) {
      text = await parsePdf(file);
    } else if (lowerName.endsWith(".docx")) {
      text = await parseDocx(file);
    } else if (lowerName.endsWith(".txt")) {
      text = await parseTxt(file);
    } else if (lowerName.endsWith(".doc")) {
      throw new Error("Legacy .doc is not supported in-browser. Please save as .docx.");
    } else {
      throw new Error("Unsupported file type. Use PDF, DOCX, or TXT.");
    }

    buildArticleFromText(text, file.name);
    saveDraft(false);
    uploadStatus.textContent = `Done. Generated page from ${file.name}.`;
  } catch (error) {
    uploadStatus.textContent = error.message || "Failed to generate page from this file.";
  }
}

window.addEventListener("scroll", setReadingProgress, { passive: true });
window.addEventListener("load", () => {
  document.body.classList.add("motion-ready");
  setReadingProgress();
  setEditMode(false);
  registerRevealTargets();
  loadDraft();
});

generateBtn?.addEventListener("click", handleGenerateArticle);
editToggleBtn?.addEventListener("click", () => {
  setEditMode(!isEditMode);
  uploadStatus.textContent = isEditMode
    ? "Edit mode enabled. You can click and edit text directly."
    : "Edit mode disabled.";
});
saveDraftBtn?.addEventListener("click", () => saveDraft(true));
clearDraftBtn?.addEventListener("click", clearDraft);
exportHtmlBtn?.addEventListener("click", exportCurrentHtml);
articleTitle?.addEventListener("input", handleLiveEdit);
articleMeta?.addEventListener("input", handleLiveEdit);
articleBody?.addEventListener("input", handleLiveEdit);
