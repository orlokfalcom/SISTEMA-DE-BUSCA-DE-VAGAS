/**
 * VagaPulse AI — LinkedIn Connect & Smart CV Builder (UI Controller)
 * Opera com backend Flask OAuth 2.0 + PKCE quando disponível e fallback local seguro no navegador.
 */
import { buildTextPdfBlob, extractTextFromPdfFile, SAMPLE_RESUME_LINES } from "./ats.js";
import { extractCanonicalProfile } from "./nlp.js";
import { idbGet, idbSet } from "./storage.js";

const linkedinCvBtn = document.getElementById("linkedinCvBtn");
const linkedinCvModal = document.getElementById("linkedinCvModal");
const closeLinkedinCvBtn = document.getElementById("closeLinkedinCvBtn");
const liStatusBadge = document.getElementById("liStatusBadge");
const liLoadPdfBtn = document.getElementById("liLoadPdfBtn");
const liPdfFileInput = document.getElementById("liPdfFileInput");
const liEraseDataBtn = document.getElementById("liEraseDataBtn");
const liProfileForm = document.getElementById("liProfileForm");
const liTemplateSelect = document.getElementById("liTemplateSelect");
const liGenerateCvBtn = document.getElementById("liGenerateCvBtn");
const liExportPdfBtn = document.getElementById("liExportPdfBtn");
const liExportDocxBtn = document.getElementById("liExportDocxBtn");
const liCvPreview = document.getElementById("liCvPreview");
const liAnalysisBox = document.getElementById("liAnalysisBox");
const liVersionsList = document.getElementById("liVersionsList");
const liPrivacyBox = document.getElementById("liPrivacyBox");
const liConnectionMessage = document.getElementById("liConnectionMessage");
const toastEl = document.getElementById("toast");

function showModalMessage(msg, isWarning = false) {
  if (liConnectionMessage) {
    liConnectionMessage.textContent = msg;
    liConnectionMessage.classList.remove("hidden");
    liConnectionMessage.style.borderColor = isWarning ? "rgba(251,191,36,0.55)" : "rgba(56,189,248,0.45)";
  }
  if (liAnalysisBox) liAnalysisBox.textContent = msg;
  if (toastEl) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    setTimeout(() => toastEl.classList.add("hidden"), 3600);
  }
}

function getCsrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)vp_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

async function apiFetch(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken() } : {}),
    ...(options.headers || {}),
  };
  const resp = await fetch(url, { credentials: "same-origin", ...options, headers });
  return resp;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Construtor DOCX mínimo (OOXML ZIP sem compressão / Store) para fallback 100% offline no navegador
function buildClientDocxBlob(text) {
  const escXml = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paras = String(text || "").split(/\r?\n/).map((ln) => `<w:p><w:r><w:t xml:space="preserve">${escXml(ln)}</w:t></w:r></w:p>`).join("");
  const files = [
    { name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: "word/document.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}<w:sectPr/></w:body></w:document>` },
  ];
  const enc = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[i] = c;
  }
  const crc32 = (u8) => {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameB = enc.encode(f.name);
    const dataB = enc.encode(f.content);
    const crc = crc32(dataB);
    const lh = new DataView(new ArrayBuffer(30 + nameB.length));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, dataB.length, true); lh.setUint32(22, dataB.length, true); lh.setUint16(26, nameB.length, true);
    new Uint8Array(lh.buffer, 30).set(nameB);
    chunks.push(new Uint8Array(lh.buffer), dataB);

    const ch = new DataView(new ArrayBuffer(46 + nameB.length));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, dataB.length, true); ch.setUint32(24, dataB.length, true);
    ch.setUint16(28, nameB.length, true); ch.setUint32(42, offset, true);
    new Uint8Array(ch.buffer, 46).set(nameB);
    central.push(new Uint8Array(ch.buffer));
    offset += 30 + nameB.length + dataB.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(eocd.buffer)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function collectConsents() {
  const keys = ["A_connect_account", "B_import_profile", "C_job_matching", "D_cv_generation", "E_profile_storage", "F_anonymous_stats"];
  const out = {};
  for (const k of keys) {
    const el = document.getElementById(`consent_${k}`);
    out[k] = Boolean(el && el.checked);
  }
  return out;
}

function collectManualProfile() {
  return {
    name: document.getElementById("liNameInput")?.value?.trim() || "",
    headline: document.getElementById("liHeadlineInput")?.value?.trim() || "",
    email: document.getElementById("liEmailInput")?.value?.trim() || "",
    summary: document.getElementById("liSummaryInput")?.value?.trim() || "",
    technical_skills: (document.getElementById("liSkillsInput")?.value || "").split(",").map((s) => s.trim()).filter(Boolean),
    experiences: (document.getElementById("liExpInput")?.value || "").split(/\n/).filter(Boolean).map((line) => ({ role: line, company: "Histórico", responsibilities: line })),
    education: (document.getElementById("liEduInput")?.value || "").split(/\n/).filter(Boolean),
  };
}

function renderVersions(versions = []) {
  if (!liVersionsList) return;
  if (!versions.length) {
    liVersionsList.innerHTML = "<p class=\"hint\">Nenhuma versão salva ainda.</p>";
    return;
  }
  liVersionsList.innerHTML = versions.map((v) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border:1px solid rgba(148,163,184,0.2);border-radius:8px;margin-bottom:6px;font-size:0.8rem;">
      <div><strong>${v.title}</strong><br/><span class="hint">${v.version_type} · ${v.created_by} · ${String(v.created_at || "").slice(0, 19)}</span></div>
      <button type="button" class="btn btn-secondary btn-small" data-restore-id="${v.id}">Restaurar</button>
    </div>
  `).join("");
  liVersionsList.querySelectorAll("[data-restore-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const found = versions.find((x) => x.id === btn.dataset.restoreId);
      if (found && liCvPreview) liCvPreview.value = found.content_text;
      try {
        await apiFetch("/api/cv/versions", { method: "POST", body: JSON.stringify({ restore_version_id: btn.dataset.restoreId }) });
      } catch { /* offline fallback */ }
    });
  });
}

async function refreshStatus() {
  if (liStatusBadge && !liStatusBadge.dataset.loaded) {
    liStatusBadge.textContent = "📄 Pronto para carregar perfil em PDF";
  }
  const localVersions = await idbGet("cv_versions_local", []);
  renderVersions(localVersions);
}

if (linkedinCvBtn && linkedinCvModal) {
  linkedinCvBtn.addEventListener("click", () => {
    linkedinCvModal.classList.remove("hidden");
    refreshStatus();
  });
}
if (closeLinkedinCvBtn && linkedinCvModal) {
  closeLinkedinCvBtn.addEventListener("click", () => linkedinCvModal.classList.add("hidden"));
}

if (liLoadPdfBtn && liPdfFileInput) {
  liLoadPdfBtn.addEventListener("click", () => {
    liPdfFileInput.value = "";
    liPdfFileInput.click();
  });

  liPdfFileInput.addEventListener("change", async () => {
    const file = liPdfFileInput.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      showModalMessage("⚠️ Selecione um arquivo .pdf válido.", true);
      return;
    }

    const prevLabel = liLoadPdfBtn.textContent;
    liLoadPdfBtn.disabled = true;
    liLoadPdfBtn.textContent = "⏳ Lendo PDF...";

    try {
      const { text, pages } = await extractTextFromPdfFile(file);
      const profile = extractCanonicalProfile(text, file.name, pages);
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

      const nameEl = document.getElementById("liNameInput");
      const headlineEl = document.getElementById("liHeadlineInput");
      const emailEl = document.getElementById("liEmailInput");
      const skillsEl = document.getElementById("liSkillsInput");
      const summaryEl = document.getElementById("liSummaryInput");
      const expEl = document.getElementById("liExpInput");
      const eduEl = document.getElementById("liEduInput");

      if (nameEl && !nameEl.value) nameEl.value = lines[0]?.slice(0, 80) || "";
      if (headlineEl) headlineEl.value = (profile.suggested_roles || [])[0] || profile.seniority || "";
      if (emailEl && profile.email) emailEl.value = profile.email;
      if (skillsEl) skillsEl.value = (profile.skills || []).join(", ");
      if (summaryEl) summaryEl.value = lines.slice(1, 5).join(" ").slice(0, 500);
      if (expEl) {
        const expLines = lines.filter((l) => /^[-•*]|\b(20\d{2}|19\d{2})\b/.test(l)).slice(0, 12);
        expEl.value = expLines.join("\n");
      }
      if (eduEl && profile.education) eduEl.value = profile.education;
      if (liCvPreview) liCvPreview.value = text.trim();

      if (liStatusBadge) {
        liStatusBadge.dataset.loaded = "1";
        liStatusBadge.textContent = `🟢 Perfil carregado: ${file.name} (${pages} pág.)`;
      }

      const versions = await idbGet("cv_versions_local", []);
      versions.unshift({
        id: `pdf-${Date.now()}`,
        version_type: "pdf_imported",
        title: `Importado de PDF (${file.name})`,
        content_text: text.trim(),
        created_by: "pdf_upload",
        created_at: new Date().toISOString(),
      });
      await idbSet("cv_versions_local", versions.slice(0, 20));
      renderVersions(versions.slice(0, 20));

      try {
        await apiFetch("/api/cv/profile", {
          method: "POST",
          body: JSON.stringify({ manual_data: collectManualProfile(), resume_text: text }),
        });
      } catch { /* modo estático local */ }

      showModalMessage(`✅ Perfil carregado de "${file.name}" (${(profile.skills || []).length} competências detectadas).`);
    } catch (err) {
      showModalMessage(`⚠️ Não foi possível ler o PDF: ${err?.message || "arquivo inválido"}`, true);
    } finally {
      liLoadPdfBtn.disabled = false;
      liLoadPdfBtn.textContent = prevLabel;
    }
  });
}

if (liEraseDataBtn) {
  liEraseDataBtn.addEventListener("click", async () => {
    try { await apiFetch("/api/linkedin/privacy", { method: "DELETE" }); } catch { /* ignore */ }
    await idbSet("cv_versions_local", []);
    if (liCvPreview) liCvPreview.value = "";
    refreshStatus();
    if (liAnalysisBox) liAnalysisBox.textContent = "🗑️ Dados importados, tokens e versões excluídos (LGPD).";
  });
}

if (liGenerateCvBtn) {
  liGenerateCvBtn.addEventListener("click", async () => {
    const manual = collectManualProfile();
    const tpl = liTemplateSelect?.value || "complete";
    let contentText = "";
    try {
      const r = await apiFetch("/api/cv/generate", {
        method: "POST",
        body: JSON.stringify({ manual_data: manual, template: tpl }),
      });
      if (r.ok) {
        const data = await r.json();
        contentText = data.generated?.content_text || "";
      }
    } catch { /* fallback local */ }

    if (!contentText) {
      contentText = [
        `${(manual.name || "PROFISSIONAL").toUpperCase()} — ${manual.headline || tpl}`,
        manual.email || "",
        "",
        "RESUMO PROFISSIONAL",
        manual.summary || SAMPLE_RESUME_LINES.slice(5, 8).join(" "),
        "",
        "COMPETÊNCIAS",
        manual.technical_skills.join(" · "),
        "",
        "EXPERIÊNCIA PROFISSIONAL",
        ...manual.experiences.map((e) => `- ${e.role}`),
        "",
        "FORMAÇÃO ACADÊMICA",
        ...manual.education.map((e) => `- ${e}`),
      ].join("\n").trim();
    }
    if (liCvPreview) liCvPreview.value = contentText;
    const versions = await idbGet("cv_versions_local", []);
    versions.unshift({
      id: `cv-${Date.now()}`,
      version_type: tpl,
      title: `CV (${tpl})`,
      content_text: contentText,
      created_by: "user_with_ai",
      created_at: new Date().toISOString(),
    });
    await idbSet("cv_versions_local", versions.slice(0, 20));
    renderVersions(versions.slice(0, 20));
  });
}

if (liExportPdfBtn) {
  liExportPdfBtn.addEventListener("click", async () => {
    const text = liCvPreview?.value || "";
    if (!text.trim()) return;
    try {
      const r = await apiFetch("/api/cv/export", { method: "POST", body: JSON.stringify({ content_text: text, format: "pdf" }) });
      if (r.ok) { downloadBlob(await r.blob(), "curriculo_vagapulse_ats.pdf"); return; }
    } catch { /* fallback client */ }
    downloadBlob(buildTextPdfBlob(text), "curriculo_vagapulse_ats.pdf");
  });
}

if (liExportDocxBtn) {
  liExportDocxBtn.addEventListener("click", async () => {
    const text = liCvPreview?.value || "";
    if (!text.trim()) return;
    try {
      const r = await apiFetch("/api/cv/export", { method: "POST", body: JSON.stringify({ content_text: text, format: "docx" }) });
      if (r.ok) { downloadBlob(await r.blob(), "curriculo_vagapulse_ats.docx"); return; }
    } catch { /* fallback client */ }
    downloadBlob(buildClientDocxBlob(text), "curriculo_vagapulse_ats.docx");
  });
}
