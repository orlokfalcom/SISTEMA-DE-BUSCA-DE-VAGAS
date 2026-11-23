(() => {
  const state = {
    profile: null,
    resumeTextSnippet: "",
    skills: [],
    seniority: "Pleno",
    jobs: [],
    skillGaps: [],
    sources: {},
    externalLinks: [],
    tracker: JSON.parse(localStorage.getItem("vagamatch_tracker") || "{}"),
    activeJob: null,
  };

  // Elements
  const dropzone = document.getElementById("dropzone");
  const pdfInput = document.getElementById("pdfInput");
  const chooseFileBtn = document.getElementById("chooseFileBtn");
  const sampleBtn = document.getElementById("sampleBtn");
  const includeLiveCheck = document.getElementById("includeLiveCheck");
  const statusBanner = document.getElementById("statusBanner");
  const loader = document.getElementById("loader");
  const uploadSection = document.getElementById("uploadSection");
  const resultsSection = document.getElementById("resultsSection");
  const newUploadBtn = document.getElementById("newUploadBtn");

  const fileMeta = document.getElementById("fileMeta");
  const atsScore = document.getElementById("atsScore");
  const atsLevel = document.getElementById("atsLevel");
  const atsBarFill = document.getElementById("atsBarFill");
  const atsChecks = document.getElementById("atsChecks");
  const senioritySelect = document.getElementById("senioritySelect");
  const yearsValue = document.getElementById("yearsValue");
  const rolesList = document.getElementById("rolesList");
  const skillsList = document.getElementById("skillsList");
  const skillsCount = document.getElementById("skillsCount");
  const newSkillInput = document.getElementById("newSkillInput");
  const addSkillBtn = document.getElementById("addSkillBtn");
  const skillGapList = document.getElementById("skillGapList");
  const extraInfoList = document.getElementById("extraInfoList");
  const externalLinks = document.getElementById("externalLinks");

  const queryInput = document.getElementById("queryInput");
  const modalityFilter = document.getElementById("modalityFilter");
  const jobSeniorityFilter = document.getElementById("jobSeniorityFilter");
  const sourceFilter = document.getElementById("sourceFilter");
  const minScoreFilter = document.getElementById("minScoreFilter");
  const sortFilter = document.getElementById("sortFilter");
  const trackerFilter = document.getElementById("trackerFilter");
  const resultsSummary = document.getElementById("resultsSummary");
  const jobsGrid = document.getElementById("jobsGrid");
  const exportCsvBtn = document.getElementById("exportCsvBtn");

  // Job Modal
  const jobModal = document.getElementById("jobModal");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const modalSource = document.getElementById("modalSource");
  const modalTitle = document.getElementById("modalTitle");
  const modalCompany = document.getElementById("modalCompany");
  const modalMeta = document.getElementById("modalMeta");
  const modalReason = document.getElementById("modalReason");
  const modalBreakdown = document.getElementById("modalBreakdown");
  const modalDescription = document.getElementById("modalDescription");
  const modalMatchedSkills = document.getElementById("modalMatchedSkills");
  const modalMissingSkills = document.getElementById("modalMissingSkills");
  const modalPitch = document.getElementById("modalPitch");
  const copyPitchBtn = document.getElementById("copyPitchBtn");
  const modalStatusSelect = document.getElementById("modalStatusSelect");
  const modalApplyBtn = document.getElementById("modalApplyBtn");

  // Compare Modal
  const openCompareBtn = document.getElementById("openCompareBtn");
  const compareModal = document.getElementById("compareModal");
  const closeCompareBtn = document.getElementById("closeCompareBtn");
  const compareTitleInput = document.getElementById("compareTitleInput");
  const compareDescInput = document.getElementById("compareDescInput");
  const runCompareBtn = document.getElementById("runCompareBtn");
  const compareResult = document.getElementById("compareResult");

  function showError(msg) {
    statusBanner.textContent = msg;
    statusBanner.className = "status-banner error";
  }

  function clearError() {
    statusBanner.textContent = "";
    statusBanner.className = "status-banner hidden";
  }

  function setLoading(isLoading) {
    loader.classList.toggle("hidden", !isLoading);
  }

  function persistTracker() {
    localStorage.setItem("vagamatch_tracker", JSON.stringify(state.tracker));
  }

  function setJobStatus(jobId, status) {
    if (!status) {
      delete state.tracker[jobId];
    } else {
      state.tracker[jobId] = status;
    }
    persistTracker();
    renderJobs();
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function analyzeUpload({ file = null, useSample = false }) {
    clearError();
    setLoading(true);

    const formData = new FormData();
    if (useSample) {
      formData.append("use_sample", "true");
    } else if (file) {
      formData.append("file", file);
    }
    formData.append("include_live", includeLiveCheck.checked ? "true" : "false");

    try {
      const resp = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Erro ao analisar o currículo.");
      }

      state.profile = data.profile;
      state.resumeTextSnippet = data.resume_text_snippet || "";
      state.skills = [...(data.profile.skills || [])];
      state.seniority = data.profile.seniority || "Pleno";
      state.jobs = data.jobs || [];
      state.skillGaps = data.skill_gaps || [];
      state.sources = data.sources || {};
      state.externalLinks = data.external_links || [];

      renderProfile();
      renderSkillGaps();
      renderExternalLinks();
      renderJobs();

      uploadSection.classList.add("hidden");
      resultsSection.classList.remove("hidden");
    } catch (err) {
      showError(err.message || "Falha de comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  let searchDebounce = null;
  function triggerResearch(immediate = false) {
    clearTimeout(searchDebounce);
    const run = async () => {
      resultsSummary.innerHTML = `<span>Atualizando vagas e recalculando compatibilidade...</span>`;
      try {
        const forceLive = sourceFilter.value === "live" || includeLiveCheck.checked;
        const resp = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skills: state.skills,
            seniority: state.seniority,
            resume_text: state.resumeTextSnippet,
            source: sourceFilter.value,
            modality: modalityFilter.value,
            job_seniority: jobSeniorityFilter.value,
            query: queryInput.value.trim(),
            min_score: Number(minScoreFilter.value || 0),
            sort_by: sortFilter.value,
            include_live: forceLive,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) return;

        state.jobs = data.jobs || [];
        state.skillGaps = data.skill_gaps || [];
        state.sources = data.sources || {};
        state.externalLinks = data.external_links || [];
        if (state.profile && data.suggested_roles) {
          state.profile.suggested_roles = data.suggested_roles;
          renderRoles();
        }
        renderSkillGaps();
        renderExternalLinks();
        renderJobs();
      } catch (err) {
        console.error(err);
      }
    };

    if (immediate) {
      run();
    } else {
      searchDebounce = setTimeout(run, 260);
    }
  }

  function renderProfile() {
    const p = state.profile;
    if (!p) return;

    const contacts = [p.email, p.phone, p.linkedin, p.github].filter(Boolean);
    fileMeta.innerHTML = `
      <strong>${escapeHtml(p.filename)}</strong><br/>
      ${p.pages} página(s) · ${p.word_count} palavras
      ${contacts.length ? `<br/>${contacts.map(escapeHtml).join(" · ")}` : ""}
    `;

    // ATS Audit
    const ats = p.ats_audit || { score: 0, level: "—", checks: [] };
    atsScore.textContent = `${ats.score}`;
    atsLevel.textContent = ats.level;
    atsBarFill.style.width = `${ats.score}%`;
    atsChecks.innerHTML = (ats.checks || [])
      .map((c) => {
        const icon = c.status === "ok" ? "✅" : c.status === "warn" ? "⚠️" : "❌";
        return `<li><span>${icon}</span><div><strong>${escapeHtml(c.label)}</strong><span class="tip">${escapeHtml(c.tip)}</span></div></li>`;
      })
      .join("");

    senioritySelect.value = state.seniority;
    yearsValue.textContent = p.estimated_years ? `~${p.estimated_years} ano(s)` : "Não informado";

    renderRoles();
    renderSkills();

    const extras = [...(p.languages || []), ...(p.education || [])];
    extraInfoList.innerHTML = extras.length
      ? extras.map((item) => `<span class="pill missing">${escapeHtml(item)}</span>`).join("")
      : `<span class="pill missing">Não especificado no PDF</span>`;
  }

  function renderRoles() {
    const roles = (state.profile && state.profile.suggested_roles) || [];
    rolesList.innerHTML = roles
      .map((r) => `<span class="pill role">${escapeHtml(r)}</span>`)
      .join("");
  }

  function renderSkills() {
    skillsCount.textContent = String(state.skills.length);
    if (!state.skills.length) {
      skillsList.innerHTML = `<span class="pill missing">Nenhuma skill detectada — adicione abaixo</span>`;
      return;
    }
    skillsList.innerHTML = state.skills
      .map(
        (skill) => `
        <span class="pill">
          ${escapeHtml(skill)}
          <button type="button" class="pill-remove" data-remove-skill="${escapeHtml(skill)}" title="Remover">×</button>
        </span>`
      )
      .join("");
  }

  function renderSkillGaps() {
    if (!state.skillGaps.length) {
      skillGapList.innerHTML = `<span class="helper-text">Excelente! Você já cobre as principais skills das top vagas.</span>`;
      return;
    }
    skillGapList.innerHTML = state.skillGaps
      .map(
        (g) => `
        <button type="button" class="gap-item" data-add-gap="${escapeHtml(g.skill)}" title="Clique para adicionar ao seu perfil">
          <span>+ ${escapeHtml(g.skill)}</span>
          <span class="gap-pct">em ${g.demand_pct}% das top vagas</span>
        </button>`
      )
      .join("");
  }

  function renderExternalLinks() {
    externalLinks.innerHTML = state.externalLinks
      .map(
        (link) => `
        <a class="external-link-card" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
          <span>${escapeHtml(link.portal)}</span>
          <span>↗</span>
        </a>`
      )
      .join("");
  }

  function scoreClass(score) {
    if (score >= 70) return "score-high";
    if (score >= 45) return "score-mid";
    return "score-low";
  }

  function getFilteredJobs() {
    const tFilter = trackerFilter.value;
    if (!tFilter) return state.jobs;
    if (tFilter === "any_tracked") {
      return state.jobs.filter((j) => Boolean(state.tracker[j.id]));
    }
    return state.jobs.filter((j) => state.tracker[j.id] === tFilter);
  }

  function renderJobs() {
    const visibleJobs = getFilteredJobs();
    const liveTotal = (state.sources.remotive || 0) + (state.sources.arbeitnow || 0);
    const trackedCount = Object.keys(state.tracker).length;

    resultsSummary.innerHTML = `
      <span>Exibindo <strong>${visibleJobs.length}</strong> vaga(s) · Rastreadas: <strong>${trackedCount}</strong></span>
      <span>Base Brasil: ${state.sources.local_br || 0} · APIs Ao Vivo: ${liveTotal}</span>
    `;

    if (!visibleJobs.length) {
      jobsGrid.innerHTML = `
        <div class="empty-state">
          <p>Nenhuma vaga encontrada com os filtros atuais.</p>
          <p style="margin-top:6px;font-size:0.85rem;">Tente reduzir o match mínimo, limpar a busca ou adicionar mais habilidades no painel ao lado.</p>
        </div>`;
      return;
    }

    jobsGrid.innerHTML = visibleJobs
      .map((job) => {
        const currentStatus = state.tracker[job.id] || "";
        const matchedHtml = (job.matched_skills || [])
          .slice(0, 4)
          .map((s) => `<span class="pill matched">✓ ${escapeHtml(s)}</span>`)
          .join("");
        const relatedHtml = (job.related_skills || [])
          .slice(0, 2)
          .map((s) => `<span class="pill related">≈ ${escapeHtml(s)}</span>`)
          .join("");
        const missingHtml = (job.missing_skills || [])
          .slice(0, 3)
          .map((s) => `<span class="pill missing">${escapeHtml(s)}</span>`)
          .join("");

        return `
          <article class="job-card">
            <div class="job-card-top">
              <div>
                <span class="source-tag">${escapeHtml(job.source)}</span>
                <h3 class="job-title">${escapeHtml(job.title)}</h3>
                <div class="job-company">${escapeHtml(job.company)}</div>
              </div>
              <div class="score-badge ${scoreClass(job.match_score)}">
                ${job.match_score}%
                <small>MATCH</small>
              </div>
            </div>

            <div class="job-meta-tags">
              <span>📍 ${escapeHtml(job.location)}</span>
              <span>💼 ${escapeHtml(job.modality)}</span>
              <span>🎯 ${escapeHtml(job.seniority)}</span>
              ${job.salary ? `<span>💰 ${escapeHtml(job.salary)}</span>` : ""}
            </div>

            <p class="job-reason">${escapeHtml(job.match_reason)}</p>

            <div class="pill-list">
              ${matchedHtml}${relatedHtml}${missingHtml}
            </div>

            <div class="job-card-footer">
              <select class="select-input status-mini-select" data-status-id="${escapeHtml(job.id)}">
                <option value="" ${currentStatus === "" ? "selected" : ""}>Rastrear...</option>
                <option value="Salva" ${currentStatus === "Salva" ? "selected" : ""}>☆ Salva</option>
                <option value="Candidatada" ${currentStatus === "Candidatada" ? "selected" : ""}>📨 Candidatada</option>
                <option value="Entrevista" ${currentStatus === "Entrevista" ? "selected" : ""}>💬 Entrevista</option>
                <option value="Proposta" ${currentStatus === "Proposta" ? "selected" : ""}>🎉 Proposta</option>
              </select>
              <div style="display:flex;gap:8px;">
                <button type="button" class="btn btn-secondary btn-small" data-detail-id="${escapeHtml(job.id)}">
                  Ver Detalhes
                </button>
                <a class="btn btn-primary btn-small" href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">
                  Candidatar ↗
                </a>
              </div>
            </div>
          </article>`;
      })
      .join("");
  }

  function renderBreakdownHtml(bd) {
    if (!bd) return "";
    const items = [
      ["Habilidades", bd.skills],
      ["Semântica TF-IDF", bd.semantic],
      ["Senioridade", bd.seniority],
      ["Afinidade de Cargo", bd.role],
    ];
    return items
      .map(
        ([label, val]) => `
        <div class="breakdown-item">
          <div class="breakdown-top"><span>${label}</span><strong>${val}%</strong></div>
          <div class="ats-bar-track" style="margin-bottom:0">
            <div class="ats-bar-fill" style="width:${val}%"></div>
          </div>
        </div>`
      )
      .join("");
  }

  function openJobModal(jobId) {
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;
    state.activeJob = job;

    modalSource.textContent = `${job.source} · ${job.match_score}% Match`;
    modalTitle.textContent = job.title;
    modalCompany.textContent = job.company;
    modalMeta.innerHTML = `
      <span>📍 ${escapeHtml(job.location)}</span>
      <span>💼 ${escapeHtml(job.modality)}</span>
      <span>🎯 ${escapeHtml(job.seniority)}</span>
      <span>💰 ${escapeHtml(job.salary || "A combinar")}</span>
    `;
    modalReason.textContent = job.match_reason;
    modalBreakdown.innerHTML = renderBreakdownHtml(job.score_breakdown);
    modalDescription.textContent = job.description || "Descrição não informada.";

    const matchedHtml = (job.matched_skills || []).map((s) => `<span class="pill matched">✓ ${escapeHtml(s)}</span>`).join("");
    const relatedHtml = (job.related_skills || []).map((s) => `<span class="pill related">≈ ${escapeHtml(s)} (relacionada)</span>`).join("");
    modalMatchedSkills.innerHTML = matchedHtml + relatedHtml || `<span class="pill missing">Nenhuma skill direta em comum</span>`;

    modalMissingSkills.innerHTML = (job.missing_skills || []).length
      ? job.missing_skills.map((s) => `<span class="pill missing">${escapeHtml(s)}</span>`).join("")
      : `<span class="pill matched">Você cobre todas as skills listadas!</span>`;

    modalPitch.textContent = job.pitch_suggestion || "";
    copyPitchBtn.textContent = "Copiar Mensagem";
    modalStatusSelect.value = state.tracker[job.id] || "";
    modalApplyBtn.href = job.url || "#";
    jobModal.classList.remove("hidden");
  }

  function closeModal() {
    jobModal.classList.add("hidden");
    state.activeJob = null;
  }

  function exportJobsCsv() {
    const rows = getFilteredJobs();
    if (!rows.length) return;
    const headers = ["Titulo", "Empresa", "Match%", "Modalidade", "Senioridade", "Salario", "Status", "Fonte", "URL"];
    const csvLines = [headers.join(";")];
    for (const j of rows) {
      const vals = [
        j.title,
        j.company,
        j.match_score,
        j.modality,
        j.seniority,
        j.salary || "",
        state.tracker[j.id] || "",
        j.source,
        j.url,
      ].map((v) => `"${String(v).replaceAll('"', '""')}"`);
      csvLines.push(vals.join(";"));
    }
    const blob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vagamatch_vagas.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runCustomComparison() {
    const desc = compareDescInput.value.trim();
    if (desc.length < 20) {
      compareResult.classList.remove("hidden");
      compareResult.innerHTML = `<span style="color:#fca5a5;">Cole uma descrição de vaga com pelo menos 20 caracteres.</span>`;
      return;
    }
    compareResult.classList.remove("hidden");
    compareResult.innerHTML = `<span>Calculando compatibilidade ATS...</span>`;
    try {
      const resp = await fetch("/api/compare-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_title: compareTitleInput.value.trim() || "Vaga Personalizada",
          job_description: desc,
          skills: state.skills,
          seniority: state.seniority,
          resume_text: state.resumeTextSnippet,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro na comparação.");

      const c = data.comparison;
      compareResult.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${escapeHtml(c.title)}</strong>
          <span class="score-badge ${scoreClass(c.match_score)}">${c.match_score}% MATCH</span>
        </div>
        <div class="breakdown-grid">${renderBreakdownHtml(c.score_breakdown)}</div>
        <div>
          <span class="meta-label">Skills Compatíveis &amp; Relacionadas</span>
          <div class="pill-list">
            ${(c.matched_skills || []).map((s) => `<span class="pill matched">✓ ${escapeHtml(s)}</span>`).join("")}
            ${(c.related_skills || []).map((s) => `<span class="pill related">≈ ${escapeHtml(s)}</span>`).join("")}
          </div>
        </div>
        <div>
          <span class="meta-label">Skills Faltantes</span>
          <div class="pill-list">
            ${(c.missing_skills || []).length
              ? c.missing_skills.map((s) => `<span class="pill missing">${escapeHtml(s)}</span>`).join("")
              : `<span class="pill matched">Nenhuma lacuna detectada!</span>`}
          </div>
        </div>
        <div>
          <span class="meta-label">Dicas de Otimização ATS</span>
          <ul class="ats-checks" style="margin-top:6px;">
            ${(c.optimization_tips || []).map((t) => `<li><span>💡</span><span>${escapeHtml(t)}</span></li>`).join("")}
          </ul>
        </div>
      `;
    } catch (err) {
      compareResult.innerHTML = `<span style="color:#fca5a5;">${escapeHtml(err.message)}</span>`;
    }
  }

  // Upload events
  chooseFileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    pdfInput.click();
  });

  sampleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    analyzeUpload({ useSample: true });
  });

  dropzone.addEventListener("click", (e) => {
    if (e.target.closest("button") || e.target.closest("a") || e.target.closest("label")) return;
    pdfInput.click();
  });

  pdfInput.addEventListener("change", () => {
    const file = pdfInput.files && pdfInput.files[0];
    if (file) analyzeUpload({ file });
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) analyzeUpload({ file });
  });

  newUploadBtn.addEventListener("click", () => {
    resultsSection.classList.add("hidden");
    uploadSection.classList.remove("hidden");
    pdfInput.value = "";
    queryInput.value = "";
    modalityFilter.value = "";
    jobSeniorityFilter.value = "";
    sourceFilter.value = "all";
    minScoreFilter.value = "0";
    sortFilter.value = "match";
    trackerFilter.value = "";
    compareTitleInput.value = "";
    compareDescInput.value = "";
    compareResult.innerHTML = "";
    compareResult.classList.add("hidden");
    clearError();
  });

  // Profile editing events
  skillsList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-skill]");
    if (!btn) return;
    const skill = btn.getAttribute("data-remove-skill");
    state.skills = state.skills.filter((s) => s !== skill);
    renderSkills();
    triggerResearch(true);
  });

  skillGapList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add-gap]");
    if (!btn) return;
    const skill = btn.getAttribute("data-add-gap");
    if (!state.skills.some((s) => s.toLowerCase() === skill.toLowerCase())) {
      state.skills.push(skill);
      renderSkills();
      triggerResearch(true);
    }
  });

  function addSkillFromInput() {
    const value = newSkillInput.value.trim();
    if (!value) return;
    if (!state.skills.some((s) => s.toLowerCase() === value.toLowerCase())) {
      state.skills.push(value);
      renderSkills();
      triggerResearch(true);
    }
    newSkillInput.value = "";
  }

  addSkillBtn.addEventListener("click", addSkillFromInput);
  newSkillInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSkillFromInput();
    }
  });

  senioritySelect.addEventListener("change", () => {
    state.seniority = senioritySelect.value;
    triggerResearch(true);
  });

  // Filter events
  queryInput.addEventListener("input", () => triggerResearch(false));
  modalityFilter.addEventListener("change", () => triggerResearch(true));
  jobSeniorityFilter.addEventListener("change", () => triggerResearch(true));
  sourceFilter.addEventListener("change", () => triggerResearch(true));
  minScoreFilter.addEventListener("change", () => triggerResearch(true));
  sortFilter.addEventListener("change", () => triggerResearch(true));
  trackerFilter.addEventListener("change", renderJobs);
  exportCsvBtn.addEventListener("click", exportJobsCsv);

  // Job card actions
  jobsGrid.addEventListener("click", (e) => {
    const detailBtn = e.target.closest("[data-detail-id]");
    if (detailBtn) {
      openJobModal(detailBtn.getAttribute("data-detail-id"));
    }
  });

  jobsGrid.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-status-id]");
    if (sel) {
      setJobStatus(sel.getAttribute("data-status-id"), sel.value);
    }
  });

  // Job modal events
  closeModalBtn.addEventListener("click", closeModal);
  jobModal.addEventListener("click", (e) => {
    if (e.target === jobModal) closeModal();
  });
  modalStatusSelect.addEventListener("change", () => {
    if (state.activeJob) {
      setJobStatus(state.activeJob.id, modalStatusSelect.value);
    }
  });
  copyPitchBtn.addEventListener("click", async () => {
    if (!modalPitch.textContent) return;
    try {
      await navigator.clipboard.writeText(modalPitch.textContent);
      copyPitchBtn.textContent = "✓ Copiado!";
    } catch {
      copyPitchBtn.textContent = "Selecione e copie o texto";
    }
  });

  // Compare modal events
  openCompareBtn.addEventListener("click", () => {
    compareModal.classList.remove("hidden");
  });
  closeCompareBtn.addEventListener("click", () => {
    compareModal.classList.add("hidden");
  });
  compareModal.addEventListener("click", (e) => {
    if (e.target === compareModal) compareModal.classList.add("hidden");
  });
  runCompareBtn.addEventListener("click", runCustomComparison);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!jobModal.classList.contains("hidden")) closeModal();
      if (!compareModal.classList.contains("hidden")) compareModal.classList.add("hidden");
    }
  });
})();
