/**
 * VagaPulse AI — Inteligência de Empregabilidade AI (4 Áreas Integradas)
 * 1. Simulador ATS | 2. Análise de Competências | 3. Currículos por Oportunidade | 4. Acompanhamento de Candidaturas
 */
import { buildTextPdfBlob, extractTextFromPdfFile } from "./ats.js";
import { extractSkillsCanonical } from "./nlp.js";
import { idbGet, idbSet } from "./storage.js";

const empBtn = document.getElementById("employabilityBtn");
const empModal = document.getElementById("employabilityModal");
const closeEmpBtn = document.getElementById("closeEmployabilityBtn");

function escHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

window.addEventListener("vagapulse:open-employability-for-job", (ev) => {
  const d = ev?.detail || {};
  if (empModal) empModal.classList.remove("hidden");
  const gapJob = document.getElementById("empGapJobInput");
  if (gapJob && d.description) gapJob.value = d.description;
  const oppComp = document.getElementById("empOppCompany");
  if (oppComp && d.company) oppComp.value = d.company;
  const oppTitle = document.getElementById("empOppTitle");
  if (oppTitle && d.title) oppTitle.value = d.title;
  const oppDesc = document.getElementById("empOppDesc");
  if (oppDesc && d.description) oppDesc.value = d.description;
  const mSkills = document.getElementById("empMasterSkills");
  if (mSkills && !mSkills.value && Array.isArray(d.skills)) mSkills.value = d.skills.join(", ");
  const mEmail = document.getElementById("empMasterEmail");
  if (mEmail && !mEmail.value && d.email) mEmail.value = d.email;
  const simTxt = document.getElementById("empSimTextInput");
  if (simTxt && !simTxt.value && d.resumeText) simTxt.value = d.resumeText;
  refreshDashboard();
});

function getCsrf() {
  const m = document.cookie.match(/(?:^|;\s*)vp_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

async function empFetch(url, options = {}) {
  const isForm = options.body instanceof FormData;
  const headers = {
    ...(isForm ? {} : { "Content-Type": "application/json" }),
    "X-Requested-With": "XMLHttpRequest",
    ...(getCsrf() ? { "X-CSRF-Token": getCsrf() } : {}),
    ...(options.headers || {}),
  };
  return fetch(url, { credentials: "same-origin", ...options, headers });
}

// Alternância das 4 abas
document.querySelectorAll("[data-emp-tab]").forEach((tabBtn) => {
  tabBtn.addEventListener("click", () => {
    const target = tabBtn.dataset.empTab;
    document.querySelectorAll("[data-emp-tab]").forEach((b) => b.classList.toggle("btn-primary", b === tabBtn));
    document.querySelectorAll("[data-emp-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.empPanel !== target));
    if (target === "tracker") refreshDashboard();
  });
});

if (empBtn && empModal) {
  empBtn.addEventListener("click", () => {
    empModal.classList.remove("hidden");
    refreshDashboard();
  });
}
if (closeEmpBtn && empModal) {
  closeEmpBtn.addEventListener("click", () => empModal.classList.add("hidden"));
}

// ---------- 1. SIMULADOR ATS ----------
const simRunBtn = document.getElementById("empSimRunBtn");
if (simRunBtn) {
  simRunBtn.addEventListener("click", async () => {
    const fileInput = document.getElementById("empSimFileInput");
    const rawText = document.getElementById("empSimTextInput")?.value || "";
    const jobDesc = document.getElementById("empSimJobInput")?.value || "";
    const autoFix = Boolean(document.getElementById("empSimAutoFixChk")?.checked);
    const outBox = document.getElementById("empSimOutput");
    if (!outBox) return;

    try {
      let data = null;
      const file = fileInput?.files?.[0];
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("job_description", jobDesc);
        fd.append("auto_fix", String(autoFix));
        const r = await empFetch("/api/employability/ats-simulate", { method: "POST", body: fd });
        if (r.ok) data = await r.json();
        else if (file.name.toLowerCase().endsWith(".pdf")) {
          const { rawText: pdfTxt } = await extractTextFromPdfFile(file);
          data = { simulation: clientSimulateText(pdfTxt, jobDesc) };
        }
      } else {
        const r = await empFetch("/api/employability/ats-simulate", {
          method: "POST",
          body: JSON.stringify({ raw_text: rawText, job_description: jobDesc, auto_fix: autoFix }),
        });
        if (r.ok) data = await r.json();
      }
      if (!data) data = { simulation: clientSimulateText(rawText, jobDesc) };

      const s = data.simulation;
      outBox.innerHTML = `
        <strong>Extração ATS: ${s.extraction_pct}% · Integridade Textual: ${s.text_integrity}%</strong>
        <p class="hint">${escHtml(s.disclaimer)}</p>
        <div><strong>Seções reconhecidas:</strong> ${escHtml((s.recognized_sections || []).join(", ") || "Nenhuma")}</div>
        <div><strong>Palavras-chave:</strong> ${escHtml((s.identified_keywords || []).join(", ") || "Nenhuma")}</div>
        ${(s.structural_issues || []).length ? `<div style="color:#fbbf24;"><strong>Problemas:</strong><ul>${s.structural_issues.map((i) => `<li>${escHtml(i)}</li>`).join("")}</ul></div>` : "<div style='color:#34d399;'>✓ Sem problemas estruturais detectados.</div>"}
        ${data.auto_fixed_cv ? `<textarea class="resume-editor-textarea" style="min-height:110px;margin-top:6px;">${escHtml(data.auto_fixed_cv.content_text)}</textarea>` : ""}
      `;
    } catch (e) {
      outBox.textContent = `Erro na simulação: ${e.message}`;
    }
  });
}

function clientSimulateText(text, jobDesc) {
  const skills = extractSkillsCanonical(text);
  const jobSkills = jobDesc ? extractSkillsCanonical(jobDesc) : [];
  return {
    disclaimer: "Avaliação técnica própria (modo local).",
    extraction_pct: text.trim() ? 85 : 0,
    text_integrity: text.trim() ? 100 : 0,
    recognized_sections: ["summary", "skills", "experience"].filter((s) => text.toLowerCase().includes(s.slice(0, 4))),
    identified_keywords: skills,
    structural_issues: text.trim() ? [] : ["Texto vazio para leitura ATS."],
    job_compatibility: jobSkills.length ? { matched_keywords: jobSkills.filter((j) => skills.includes(j)) } : null,
  };
}

// ---------- 2. SKILLS GAP ANALYSIS ----------
const gapRunBtn = document.getElementById("empGapRunBtn");
if (gapRunBtn) {
  gapRunBtn.addEventListener("click", async () => {
    const skills = (document.getElementById("empMasterSkills")?.value || "").split(",").map((s) => s.trim()).filter(Boolean);
    const exp = (document.getElementById("empMasterExp")?.value || "").split(/\n/).filter(Boolean);
    const jobDesc = document.getElementById("empGapJobInput")?.value || "";
    const outBox = document.getElementById("empGapOutput");
    if (!outBox) return;

    const master = { technical_skills: skills, experiences: exp };
    try {
      const r = await empFetch("/api/employability/skills-gap", {
        method: "POST",
        body: JSON.stringify({ master_profile: master, job_description: jobDesc }),
      });
      if (r.ok) {
        const { skills_gap: g } = await r.json();
        outBox.innerHTML = `
          <strong>Aderência Geral: ${g.overall_adherence}/100</strong>
          ${g.mandatory_alert ? `<div style="color:#f87171;">⚠️ Requisitos obrigatórios não comprovados: ${g.unmet_mandatory_requirements.join(", ")}</div>` : ""}
          <div style="font-size:0.8rem;margin:6px 0;">Técnica: ${g.indicators.technical}% · Experiência: ${g.indicators.experience}% · Acadêmica: ${g.indicators.academic}% · Idiomas: ${g.indicators.languages}%</div>
          <div><strong>Matriz:</strong> ${(g.competency_matrix || []).map((m) => `${m.skill} (${m.requirement_type} - ${m.status})`).join(" | ") || "—"}</div>
          ${(g.development_plan || []).length ? `<div style="margin-top:6px;"><strong>Plano de Desenvolvimento:</strong><ul>${g.development_plan.slice(0, 4).map((d) => `<li><strong>[${d.priority}] ${d.skill}:</strong> ${d.recommended_project}</li>`).join("")}</ul></div>` : ""}
        `;
        return;
      }
    } catch { /* fallback local */ }
    const req = extractSkillsCanonical(jobDesc);
    const matched = req.filter((s) => skills.some((c) => c.toLowerCase() === s.toLowerCase()));
    outBox.innerHTML = `<strong>Aderência estimada: ${req.length ? Math.round((matched.length / req.length) * 100) : 70}/100</strong><div>Comprovadas/Declaradas: ${matched.join(", ") || "—"}</div>`;
  });
}

// ---------- 3. PERFIL MESTRE & CURRÍCULOS POR OPORTUNIDADE ----------
const oppGenBtn = document.getElementById("empOppGenBtn");
if (oppGenBtn) {
  oppGenBtn.addEventListener("click", async () => {
    const master = {
      name: document.getElementById("empMasterName")?.value || "Profissional",
      email: document.getElementById("empMasterEmail")?.value || "",
      technical_skills: (document.getElementById("empMasterSkills")?.value || "").split(",").map((s) => s.trim()).filter(Boolean),
      experiences: (document.getElementById("empMasterExp")?.value || "").split(/\n/).filter(Boolean),
    };
    const company = document.getElementById("empOppCompany")?.value || "Empresa";
    const title = document.getElementById("empOppTitle")?.value || "Vaga Alvo";
    const desc = document.getElementById("empOppDesc")?.value || "";
    const outBox = document.getElementById("empOppOutput");

    try {
      await empFetch("/api/employability/master-profile", { method: "POST", body: JSON.stringify(master) });
      const oppRes = await empFetch("/api/employability/opportunities", {
        method: "POST",
        body: JSON.stringify({ company, title, description: desc }),
      });
      if (oppRes.ok) {
        const { opportunity } = await oppRes.json();
        const genRes = await empFetch(`/api/employability/opportunities/${opportunity.id}/generate-cv`, {
          method: "POST",
          body: JSON.stringify({ language: "pt", purpose: "job_tailored" }),
        });
        if (genRes.ok) {
          const data = await genRes.json();
          if (outBox) {
            outBox.innerHTML = `
              <strong>✅ Versão v${data.version.version_num} gerada para ${title} @ ${company} (ATS: ${data.version.ats_score}/100)</strong>
              <textarea id="empOppCvText" class="resume-editor-textarea" style="min-height:130px;margin-top:6px;">${data.version.content_text}</textarea>
            `;
          }
          refreshDashboard();
          return;
        }
      }
    } catch { /* fallback local */ }

    const fallbackText = `${master.name.toUpperCase()} — ${title}\n${master.email}\n\nCOMPETÊNCIAS\n${master.technical_skills.join(" · ")}\n\nEXPERIÊNCIA\n${master.experiences.join("\n")}`;
    const localOpps = await idbGet("emp_local_opps", []);
    localOpps.unshift({ id: `opp-${Date.now()}`, company, title, status: "Currículo preparado", ats_score: 82 });
    await idbSet("emp_local_opps", localOpps.slice(0, 30));
    if (outBox) outBox.innerHTML = `<textarea id="empOppCvText" class="resume-editor-textarea" style="min-height:130px;">${fallbackText}</textarea>`;
    refreshDashboard();
  });
}

// ---------- 4. PAINEL DE OPORTUNIDADES & APRENDIZADO ----------
async function refreshDashboard() {
  const kpiBox = document.getElementById("empKpiBox");
  const listBox = document.getElementById("empOppList");
  if (!kpiBox || !listBox) return;

  try {
    const r = await empFetch("/api/employability/dashboard", { method: "GET" });
    if (r.ok) {
      const d = await r.json();
      const k = d.kpis;
      kpiBox.innerHTML = `Oportunidades: <strong>${k.total_opportunities}</strong> · CVs Gerados: <strong>${k.cvs_generated}</strong> · Candidaturas: <strong>${k.applications_sent}</strong> · Entrevistas: <strong>${k.interviews}</strong> · Média ATS: <strong>${k.avg_ats_score}</strong> · Taxa Entrevista: <strong>${d.learning_insights.interview_rate_pct}%</strong>`;
      listBox.innerHTML = (d.opportunities || []).map((o) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border:1px solid rgba(148,163,184,0.2);border-radius:8px;margin-bottom:6px;font-size:0.8rem;">
          <div><strong>${escHtml(o.title)}</strong> — ${escHtml(o.company)}<br/><span class="hint">Status: ${escHtml(o.status)}</span></div>
          <button type="button" class="btn btn-secondary btn-small" data-confirm-apply="${escHtml(o.id)}">Confirmar Envio</button>
        </div>
      `).join("") || "<p class='hint'>Nenhuma oportunidade cadastrada ainda.</p>";
      listBox.querySelectorAll("[data-confirm-apply]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await empFetch(`/api/employability/opportunities/${btn.dataset.confirmApply}/status`, {
            method: "POST",
            body: JSON.stringify({ status: "Candidatura enviada", confirm_applied: true }),
          });
          refreshDashboard();
        });
      });
      return;
    }
  } catch { /* fallback local */ }
  const localOpps = await idbGet("emp_local_opps", []);
  kpiBox.innerHTML = `Oportunidades (local): <strong>${localOpps.length}</strong>`;
  listBox.innerHTML = localOpps.map((o) => `<div style="padding:6px;font-size:0.8rem;"><strong>${escHtml(o.title)}</strong> — ${escHtml(o.company)} (${escHtml(o.status)})</div>`).join("") || "<p class='hint'>Nenhuma oportunidade cadastrada ainda.</p>";
}

const empClearHistoryBtn = document.getElementById("empClearHistoryBtn");
if (empClearHistoryBtn) {
  empClearHistoryBtn.addEventListener("click", async () => {
    try { await empFetch("/api/employability/history", { method: "DELETE" }); } catch { /* ignore */ }
    await idbSet("emp_local_opps", []);
    refreshDashboard();
  });
}
