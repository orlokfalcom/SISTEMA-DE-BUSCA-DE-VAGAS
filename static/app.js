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
  const deepSearchCheck = document.getElementById("deepSearchCheck");
  const deepSearchBtn = document.getElementById("deepSearchBtn");
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
  const clearFiltersBtn = document.getElementById("clearFiltersBtn");
  const resultsSummary = document.getElementById("resultsSummary");
  const sourcesStrip = document.getElementById("sourcesStrip");
  const jobsGrid = document.getElementById("jobsGrid");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const toastEl = document.getElementById("toast");
  let toastTimer = null;

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

  // Improve ATS Editor Modal
  const openImproveBtn = document.getElementById("openImproveBtn");
  const openImproveTopBtn = document.getElementById("openImproveTopBtn");
  const improveModal = document.getElementById("improveModal");
  const closeImproveBtn = document.getElementById("closeImproveBtn");
  const improveBody = document.getElementById("improveBody");
  const atsResumeEditor = document.getElementById("atsResumeEditor");
  const editorLiveScore = document.getElementById("editorLiveScore");
  const editorWordCount = document.getElementById("editorWordCount");
  const editorSyncStatus = document.getElementById("editorSyncStatus");
  const editorAutoFixBtn = document.getElementById("editorAutoFixBtn");
  const editorLoadTemplateBtn = document.getElementById("editorLoadTemplateBtn");
  const editorCopyBtn = document.getElementById("editorCopyBtn");
  const editorPrintPdfBtn = document.getElementById("editorPrintPdfBtn");
  const editorDownloadTxtBtn = document.getElementById("editorDownloadTxtBtn");
  const applyEditedResumeBtn = document.getElementById("applyEditedResumeBtn");
  let latestAtsPlan = null;
  let editorDebounce = null;

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

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.add("hidden");
    }, 2800);
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
    formData.append("deep_search", deepSearchCheck && deepSearchCheck.checked ? "true" : "false");

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
            deep_search: Boolean(deepSearchCheck && deepSearchCheck.checked),
            country: (state.profile && state.profile.country) || "Brasil",
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
    const liveTotal =
      (state.sources.company_sites_br || 0) +
      (state.sources.company_sites_global || 0) +
      (state.sources.remotive || 0) +
      (state.sources.arbeitnow || 0) +
      (state.sources.jobicy || 0) +
      (state.sources.remoteok || 0) +
      (state.sources.himalayas || 0) +
      (state.sources.weworkremotely || 0) +
      (state.sources.github_br || 0);
    const trackedCount = Object.keys(state.tracker).length;
    const modeLabel = state.sources.deep_search ? "Busca Profunda" : "APIs Ao Vivo";

    resultsSummary.innerHTML = `
      <span>Exibindo <strong>${visibleJobs.length}</strong> vaga(s) · Rastreadas: <strong>${trackedCount}</strong></span>
      <span>Base Brasil: ${state.sources.local_br || 0} · ${modeLabel}: ${liveTotal}</span>
    `;

    if (sourcesStrip) {
      const sourceLabels = [
        ["Empresas BR (Carreiras)", state.sources.company_sites_br],
        ["Empresas Globais (Carreiras)", state.sources.company_sites_global],
        ["Base Brasil", state.sources.local_br],
        ["GitHub BR", state.sources.github_br],
        ["Remotive", state.sources.remotive],
        ["Jobicy", state.sources.jobicy],
        ["Arbeitnow", state.sources.arbeitnow],
        ["RemoteOK", state.sources.remoteok],
        ["Himalayas", state.sources.himalayas],
        ["We Work Remotely", state.sources.weworkremotely],
      ].filter(([, count]) => Number(count || 0) > 0);
      sourcesStrip.innerHTML = sourceLabels
        .map(([label, count]) => `<span class="source-chip">${escapeHtml(label)}: <strong>${count}</strong></span>`)
        .join("");
    }

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
              ${job.geo_label ? `<span>${escapeHtml(job.geo_label)}</span>` : ""}
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
      const compareMatchedHtml = (c.matched_skills || [])
        .map((s) => `<span class="pill matched">✓ ${escapeHtml(s)}</span>`)
        .join("");
      const compareRelatedHtml = (c.related_skills || [])
        .map((s) => `<span class="pill related">≈ ${escapeHtml(s)}</span>`)
        .join("");
      const compareMissingHtml = (c.missing_skills || []).length
        ? c.missing_skills.map((s) => `<span class="pill missing">${escapeHtml(s)}</span>`).join("")
        : '<span class="pill matched">Nenhuma lacuna detectada!</span>';
      const compareTipsHtml = (c.optimization_tips || [])
        .map((t) => `<li><span>💡</span><span>${escapeHtml(t)}</span></li>`)
        .join("");

      compareResult.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${escapeHtml(c.title)}</strong>
          <span class="score-badge ${scoreClass(c.match_score)}">${c.match_score}% MATCH</span>
        </div>
        <div class="breakdown-grid">${renderBreakdownHtml(c.score_breakdown)}</div>
        <div>
          <span class="meta-label">Skills Compatíveis &amp; Relacionadas</span>
          <div class="pill-list">
            ${compareMatchedHtml}
            ${compareRelatedHtml}
          </div>
        </div>
        <div>
          <span class="meta-label">Skills Faltantes</span>
          <div class="pill-list">
            ${compareMissingHtml}
          </div>
        </div>
        <div>
          <span class="meta-label">Dicas de Otimização ATS</span>
          <ul class="ats-checks" style="margin-top:6px;">
            ${compareTipsHtml}
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

  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pdfInput.click();
    }
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
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      queryInput.value = "";
      modalityFilter.value = "";
      jobSeniorityFilter.value = "";
      sourceFilter.value = "all";
      minScoreFilter.value = "0";
      sortFilter.value = "match";
      trackerFilter.value = "";
      triggerResearch(true);
      showToast("Filtros limpos");
    });
  }
  exportCsvBtn.addEventListener("click", () => {
    exportJobsCsv();
    showToast("Exportação CSV iniciada");
  });
  if (deepSearchBtn) {
    deepSearchBtn.addEventListener("click", () => {
      if (includeLiveCheck) includeLiveCheck.checked = true;
      if (deepSearchCheck) deepSearchCheck.checked = true;
      if (sourceFilter.value === "local") sourceFilter.value = "all";
      showToast("Executando Busca Profunda na internet...");
      triggerResearch(true);
    });
  }

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

  function updateEditorStats(text) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
    if (editorWordCount) editorWordCount.textContent = `${words} palavra(s) · ${String(text || "").length} caracteres`;
  }

  async function refreshImprovePlan(text, reparse = true) {
    if (!state.profile) return;
    if (editorSyncStatus) editorSyncStatus.textContent = "Recalculando diagnóstico ATS...";
    try {
      const resp = await fetch("/api/improve-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: text,
          reparse,
          pages: state.profile.pages,
          word_count: state.profile.word_count,
          skills: state.skills,
          suggested_roles: state.profile.suggested_roles || [],
          seniority: state.seniority,
          email: state.profile.email,
          phone: state.profile.phone,
          linkedin: state.profile.linkedin,
          github: state.profile.github,
          skill_gaps: state.skillGaps || [],
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro ao gerar plano ATS.");
      latestAtsPlan = data.improvement_plan;
      renderImprovementPlan(latestAtsPlan);
      if (editorSyncStatus) editorSyncStatus.textContent = "Diagnóstico ATS atualizado em tempo real";
    } catch (err) {
      improveBody.innerHTML = `<span style="color:#fca5a5;">${escapeHtml(err.message)}</span>`;
      if (editorSyncStatus) editorSyncStatus.textContent = "Erro ao atualizar diagnóstico";
    }
  }

  async function openImproveModal() {
    if (!state.profile || !state.resumeTextSnippet) return;
    improveModal.classList.remove("hidden");
    if (atsResumeEditor) {
      atsResumeEditor.value = state.resumeTextSnippet;
      updateEditorStats(atsResumeEditor.value);
    }
    improveBody.innerHTML = `<span>Analisando seu currículo para montar o checklist de melhorias ATS...</span>`;
    await refreshImprovePlan(state.resumeTextSnippet, false);
  }

  function applyQuickAutoFixes() {
    if (!atsResumeEditor) return;
    let txt = atsResumeEditor.value;
    // 1. Remove colchete solto antes de telefone e formata (DD) 9XXXX-XXXX
    txt = txt.replace(/\[(\d{2})(\d{5})(\d{4})\b/g, "($1) $2-$3");
    txt = txt.replace(/\b(\d{2})(\d{5})(\d{4})\b/g, "($1) $2-$3");
    // 2. Corrige marcadores duplicados (• • ou * * ou - -)
    txt = txt.replace(/([•\*\-])\s*[•\*\-]\s+/g, "$1 ");
    // 3. Limpa espaços extras
    txt = txt.replace(/[ \t]{2,}/g, " ");
    atsResumeEditor.value = txt;
    updateEditorStats(txt);
    refreshImprovePlan(txt, true);
  }

  function printResumeAsPdf() {
    if (!atsResumeEditor) return;
    const content = escapeHtml(atsResumeEditor.value).replaceAll("\n", "<br/>");
    const win = window.open("", "_blank", "width=850,height=950");
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Currículo Otimizado ATS</title>` +
      `<style>body{font-family:Arial,Helvetica,sans-serif;max-width:780px;margin:32px auto;padding:0 24px;line-height:1.5;color:#111827;font-size:13px;}@media print{body{margin:0;}}</style>` +
      `</head><body><div>${content}</div><script>window.onload=function(){window.print();};</script></body></html>`
    );
    win.document.close();
  }

  function renderImprovementPlan(plan) {
    if (editorLiveScore) {
      editorLiveScore.textContent = `ATS: ${plan.current_score}/100 (${plan.current_level}) ➜ Meta: ${plan.projected_score}/100`;
      editorLiveScore.className = "editor-score-pill " + (plan.current_score >= 85 ? "score-high" : plan.current_score >= 65 ? "score-mid" : "score-low");
    }

    const prioClass = (p) => (p === "Alta" ? "prio-high" : p === "Média" ? "prio-mid" : "prio-low");
    const modsHtml = (plan.modifications || [])
      .map((m, idx) => {
        const foundHtml = (m.found_items || []).length
          ? `<div class="pill-list" style="margin:6px 0;">${m.found_items
              .map(
                (it) =>
                  `<button type="button" class="pill missing jump-item" data-jump-text="${escapeHtml(it)}" title="Clique para localizar este trecho no editor">🔍 ${escapeHtml(it)}</button>`
              )
              .join("")}</div>`
          : "";
        return `
        <div class="mod-card">
          <div class="mod-card-header">
            <strong>${idx + 1}. ${escapeHtml(m.category)}</strong>
            <span class="prio-badge ${prioClass(m.priority)}">Prioridade ${escapeHtml(m.priority)} · +${m.impact_points} pts</span>
          </div>
          <p class="mod-issue">${escapeHtml(m.issue)}</p>
          ${foundHtml}
          <p class="mod-action"><strong>O que fazer:</strong> ${escapeHtml(m.action)}</p>
          <div class="before-after-grid">
            <div class="ba-box ba-before"><span class="meta-label">❌ Antes</span><p>${escapeHtml(m.before_example)}</p></div>
            <div class="ba-box ba-after"><span class="meta-label">✅ Depois (ATS)</span><p>${escapeHtml(m.after_example)}</p></div>
          </div>
        </div>`;
      })
      .join("");

    improveBody.innerHTML = `
      <div class="improve-summary">
        <div>
          <span class="meta-label">Score ATS Atual</span>
          <div class="improve-score-val">${plan.current_score}/100 <small>(${escapeHtml(plan.current_level)})</small></div>
        </div>
        <div class="improve-arrow">➜</div>
        <div>
          <span class="meta-label">Projetado</span>
          <div class="improve-score-val projected">${plan.projected_score}/100</div>
        </div>
        <div>
          <span class="meta-label">Melhorias</span>
          <div class="improve-score-val">${plan.total_modifications}</div>
        </div>
      </div>

      <h4>Melhorias Necessárias para Atender ATS</h4>
      <div class="mod-list">${modsHtml}</div>
    `;
  }

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

  // Improve ATS Editor modal events
  if (openImproveBtn) openImproveBtn.addEventListener("click", openImproveModal);
  if (openImproveTopBtn) openImproveTopBtn.addEventListener("click", openImproveModal);
  if (closeImproveBtn) closeImproveBtn.addEventListener("click", () => improveModal.classList.add("hidden"));
  if (improveModal) {
    improveModal.addEventListener("click", (e) => {
      if (e.target === improveModal) improveModal.classList.add("hidden");
    });
  }
  if (atsResumeEditor) {
    atsResumeEditor.addEventListener("input", () => {
      const txt = atsResumeEditor.value;
      updateEditorStats(txt);
      clearTimeout(editorDebounce);
      editorDebounce = setTimeout(() => {
        if (txt.trim().length >= 30) refreshImprovePlan(txt, true);
      }, 450);
    });
  }
  if (editorAutoFixBtn) {
    editorAutoFixBtn.addEventListener("click", () => {
      applyQuickAutoFixes();
      showToast("Correções automáticas aplicadas!");
    });
  }
  if (improveBody) {
    improveBody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-jump-text]");
      if (!btn || !atsResumeEditor) return;
      const needle = btn.getAttribute("data-jump-text") || "";
      const haystack = atsResumeEditor.value;
      const pos = haystack.toLowerCase().indexOf(needle.toLowerCase());
      if (pos >= 0) {
        atsResumeEditor.focus();
        atsResumeEditor.setSelectionRange(pos, pos + needle.length);
        showToast("Trecho selecionado no editor");
      } else {
        showToast("Trecho já corrigido ou não encontrado literalmente");
      }
    });
  }
  if (editorLoadTemplateBtn) {
    editorLoadTemplateBtn.addEventListener("click", () => {
      if (!latestAtsPlan || !latestAtsPlan.ats_template || !atsResumeEditor) return;
      atsResumeEditor.value = latestAtsPlan.ats_template;
      updateEditorStats(atsResumeEditor.value);
      refreshImprovePlan(atsResumeEditor.value, true);
    });
  }
  if (editorCopyBtn) {
    editorCopyBtn.addEventListener("click", async () => {
      if (!atsResumeEditor) return;
      try {
        await navigator.clipboard.writeText(atsResumeEditor.value);
        editorCopyBtn.textContent = "✓ Copiado!";
        setTimeout(() => {
          editorCopyBtn.textContent = "📋 Copiar";
        }, 1800);
      } catch {
        editorCopyBtn.textContent = "Ctrl+C no texto";
      }
    });
  }
  if (editorPrintPdfBtn) editorPrintPdfBtn.addEventListener("click", printResumeAsPdf);
  if (editorDownloadTxtBtn) {
    editorDownloadTxtBtn.addEventListener("click", () => {
      if (!atsResumeEditor) return;
      const blob = new Blob([atsResumeEditor.value], { type: "text/plain;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "curriculo_otimizado_ats.txt";
      a.click();
      URL.revokeObjectURL(url);
    });
  }
  if (applyEditedResumeBtn) {
    applyEditedResumeBtn.addEventListener("click", () => {
      if (!atsResumeEditor || !state.profile) return;
      const editedText = atsResumeEditor.value.trim();
      if (!editedText) return;
      state.resumeTextSnippet = editedText;
      if (latestAtsPlan) {
        if (Array.isArray(latestAtsPlan.detected_skills) && latestAtsPlan.detected_skills.length) {
          state.skills = [...latestAtsPlan.detected_skills];
          renderSkills();
        }
        state.profile.ats_audit.score = latestAtsPlan.current_score;
        state.profile.ats_audit.level = latestAtsPlan.current_level;
        atsScore.textContent = `${latestAtsPlan.current_score}`;
        atsLevel.textContent = latestAtsPlan.current_level;
        atsBarFill.style.width = `${latestAtsPlan.current_score}%`;
      }
      improveModal.classList.add("hidden");
      triggerResearch(true);
      showToast("Currículo editado aplicado à busca de vagas!");
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!jobModal.classList.contains("hidden")) closeModal();
      if (!compareModal.classList.contains("hidden")) compareModal.classList.add("hidden");
      if (improveModal && !improveModal.classList.contains("hidden")) improveModal.classList.add("hidden");
    }
  });
})();
