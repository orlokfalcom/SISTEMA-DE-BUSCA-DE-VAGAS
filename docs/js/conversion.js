/**
 * VagaPulse AI — Motor de Eficiência & Conversão Vaga -> Entrevista
 * Gera adaptação de currículo sob medida (sem inventar experiência),
 * busca de recrutadores/gestores, roteiro de entrevista STAR e funil de conversão.
 */

export function tailorResumeForJob(resumeText, job, candidateSkills = [], candidateSeniority = "Pleno") {
  const matched = (job.matched_skills || []).slice(0, 6);
  const related = (job.related_matches || []).map((r) => r.skill).slice(0, 3);
  const prioritizedSkills = [...new Set([...matched, ...related, ...candidateSkills])].slice(0, 12);
  const lang = job.jobLanguage || "pt";

  let tailoredSummary;
  if (lang === "en") {
    tailoredSummary = `${candidateSeniority} professional targeting ${job.title} at ${job.company}. Hands-on experience with ${matched.join(", ") || prioritizedSkills.slice(0, 4).join(", ")}, focused on measurable delivery, reliability, and team impact.`;
  } else if (lang === "es") {
    tailoredSummary = `Profesional ${candidateSeniority} enfocado en ${job.title} en ${job.company}. Experiencia práctica con ${matched.join(", ") || prioritizedSkills.slice(0, 4).join(", ")}, orientado a resultados medibles y escalabilidad.`;
  } else if (lang === "fr") {
    tailoredSummary = `Profil ${candidateSeniority} ciblant le poste ${job.title} chez ${job.company}. Expérience pratique avec ${matched.join(", ") || prioritizedSkills.slice(0, 4).join(", ")}, orienté impact produit et qualité technique.`;
  } else {
    tailoredSummary = `Profissional ${candidateSeniority} com foco na posição de ${job.title} (${job.company}). Experiência prática em ${matched.join(", ") || prioritizedSkills.slice(0, 4).join(", ")}, com atuação orientada a métricas, qualidade de entrega e impacto no negócio.`;
  }

  const bulletTemplates = matched.slice(0, 3).map((skill) =>
    lang === "en"
      ? `• Applied ${skill} in production environments to improve system reliability, performance, and delivery speed.`
      : `• Aplicou ${skill} em ambiente produtivo para elevar performance, confiabilidade e velocidade de entrega.`
  );
  if (!bulletTemplates.length) {
    bulletTemplates.push(
      lang === "en"
        ? "• Delivered end-to-end initiatives aligned with business KPIs and cross-functional team goals."
        : "• Entregou iniciativas de ponta a ponta alinhadas a metas de negócio e indicadores de qualidade."
    );
  }

  return {
    prioritizedSkills,
    tailoredSummary,
    suggestedBullets: bulletTemplates,
    missingToHighlight: (job.missing_skills || []).slice(0, 4),
    tailoredBlockText: `RESUMO DIRECIONADO (${job.title} - ${job.company})\n${tailoredSummary}\n\nCOMPETÊNCIAS PRIORITÁRIAS\n${prioritizedSkills.join(" · ")}\n\nDESTAQUES SUGERIDOS (BASEADOS EM SUAS SKILLS)\n${bulletTemplates.join("\n")}`,
  };
}

const SECTION_HEADER_RE = /^(RESUMO(?:\s+PROFISSIONAL|\s+DIRECIONADO)?|OBJETIVO|SUMMARY|PROFESSIONAL\s+SUMMARY|EXPERI[ÊE]NCIA(?:\s+PROFISSIONAL)?|EXPERIENCE|COMPET[ÊE]NCIAS(?:\s+PRIORIT[ÁA]RIAS)?|HABILIDADES|SKILLS|FORMA[ÇC][ÃA]O(?:\s+ACAD[ÊE]MICA)?|EDUCATION|IDIOMAS|LANGUAGES|CERTIFICA[ÇC][ÕO]ES|DESTAQUES\s+(?:SUGERIDOS|RELEVANTES))(?:\s*\(.*\))?\s*:?\s*$/i;

export function autoEditResumeForJob(resumeText, job, candidateSkills = [], candidateSeniority = "Pleno") {
  const tailored = tailorResumeForJob(resumeText, job, candidateSkills, candidateSeniority);
  const raw = String(resumeText || "").trim();
  const lang = job.jobLanguage || "pt";

  const summaryHeader = lang === "en" ? "PROFESSIONAL SUMMARY" : "RESUMO PROFISSIONAL";
  const skillsHeader = lang === "en" ? "CORE COMPETENCIES" : "COMPETÊNCIAS PRIORITÁRIAS";
  const highlightsHeader = lang === "en" ? "TARGETED HIGHLIGHTS FOR THIS ROLE" : "DESTAQUES RELEVANTES PARA A VAGA";

  if (!raw) {
    const editedResumeText = [
      `CANDIDATO (${candidateSeniority})`,
      "",
      summaryHeader,
      tailored.tailoredSummary,
      "",
      skillsHeader,
      tailored.prioritizedSkills.join(" · "),
      "",
      highlightsHeader,
      ...tailored.suggestedBullets,
    ].join("\n");
    return { ...tailored, editedResumeText };
  }

  // Remove blocos anteriores gerados por ajuste automático para evitar duplicação
  const cleanedRaw = raw
    .replace(/RESUMO DIRECIONADO[\s\S]*?(?=\n(?:EXPERI[ÊE]NCIA|FORMA[ÇC][ÃA]O|IDIOMAS|---|\n[A-ZÁÉÍÓÚÂÊÔÃÕÇ ]{5,}\n)|$)/gi, "")
    .replace(/DESTAQUES (?:SUGERIDOS|RELEVANTES)[^\n]*\n(?:•[^\n]*\n?)*/gi, "")
    .replace(/^\s*---\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = cleanedRaw.split(/\r?\n/);
  const headerLines = [];
  const restSections = [];
  let inHeader = true;
  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (SECTION_HEADER_RE.test(trimmed)) {
      inHeader = false;
      currentSection = { title: trimmed, lines: [] };
      restSections.push(currentSection);
      continue;
    }
    if (inHeader) {
      headerLines.push(line);
    } else if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  const out = [];
  if (headerLines.some((l) => l.trim())) {
    out.push(headerLines.join("\n").trim(), "");
  }

  // Substitui/insere Resumo Profissional direcionado à vaga
  out.push(summaryHeader, tailored.tailoredSummary, "");

  // Atualiza/insere Competências Prioritárias
  out.push(skillsHeader, tailored.prioritizedSkills.join(" · "), "");

  // Preserva Experiência (com destaques relevantes no topo), Formação, Idiomas etc.
  let insertedHighlights = false;
  for (const sec of restSections) {
    if (/^(RESUMO|OBJETIVO|SUMMARY|PROFESSIONAL\s+SUMMARY|COMPET[ÊE]NCIAS|HABILIDADES|SKILLS|DESTAQUES)/i.test(sec.title)) {
      continue;
    }
    out.push(sec.title);
    if (!insertedHighlights && /^(EXPERI[ÊE]NCIA|EXPERIENCE)/i.test(sec.title)) {
      out.push(...tailored.suggestedBullets);
      insertedHighlights = true;
    }
    const body = sec.lines.join("\n").trim();
    if (body) out.push(body);
    out.push("");
  }

  if (!insertedHighlights) {
    out.push(highlightsHeader, ...tailored.suggestedBullets, "");
  }

  return {
    ...tailored,
    editedResumeText: out.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  };
}

export function buildRecruiterOutreach(job, candidateSeniority = "Pleno") {
  const company = String(job.company || "").trim();
  const title = String(job.title || "").trim();
  const skills = (job.matched_skills || []).slice(0, 3).join(", ") || "tecnologia";
  const lang = job.jobLanguage || "pt";

  const searchQuery = encodeURIComponent(`"${company}" (Recruiter OR "Talent Acquisition" OR "Tech Recruiter" OR "Hiring Manager")`);
  const linkedinPeopleUrl = `https://www.linkedin.com/search/results/people/?keywords=${searchQuery}`;

  let connectionNote;
  if (lang === "en") {
    connectionNote = `Hi! I just applied for ${title} at ${company}. With ${candidateSeniority} experience in ${skills}, I'd love to connect and share how I can help the team.`;
  } else if (lang === "es") {
    connectionNote = `¡Hola! Me postulé para ${title} en ${company}. Con experiencia ${candidateSeniority} en ${skills}, me encantaría conectar y conversar sobre el puesto.`;
  } else if (lang === "fr") {
    connectionNote = `Bonjour ! Je viens de postuler pour ${title} chez ${company}. Avec mon expérience ${candidateSeniority} en ${skills}, je serais ravi d'échanger.`;
  } else {
    connectionNote = `Olá! Acabei de me candidatar para ${title} na ${company}. Tenho experiência (${candidateSeniority}) com ${skills} e adoraria conectar para conversar sobre a vaga.`;
  }

  return {
    linkedinPeopleUrl,
    connectionNote: connectionNote.slice(0, 295),
  };
}

export function generateInterviewPrep(job) {
  const matched = (job.matched_skills || []).slice(0, 3);
  const missing = (job.missing_skills || []).slice(0, 2);
  const lang = job.jobLanguage || "pt";
  const questions = [];

  for (const sk of matched) {
    questions.push({
      type: "Técnica",
      question:
        lang === "en"
          ? `Describe a challenging production problem you solved using ${sk} and how you measured the impact.`
          : `Conte um desafio real em produção que você resolveu usando ${sk} e qual métrica melhorou após sua entrega.`,
    });
  }
  for (const gap of missing) {
    questions.push({
      type: "Gap / Adaptação",
      question:
        lang === "en"
          ? `This role lists ${gap}. How do your related skills help you ramp up quickly on ${gap}?`
          : `A vaga pede ${gap}. Como sua base atual facilita sua rápida adaptação em ${gap}?`,
    });
  }
  questions.push({
    type: "Comportamental (STAR)",
    question:
      lang === "en"
        ? `Tell me about a time you handled tight deadlines or conflicting priorities on a ${job.title} project (Situation, Task, Action, Result).`
        : `Relate uma situação com prazo curto ou mudança de prioridade relevante para ${job.title} usando o método STAR (Situação, Tarefa, Ação, Resultado).`,
  });

  return questions.slice(0, 5);
}

export function computeConversionFunnel(tracker = {}, trackerDates = {}, nowMs = Date.now()) {
  let saved = 0;
  let applied = 0;
  let interview = 0;
  let offer = 0;
  const followUpDueIds = [];

  for (const [jobId, status] of Object.entries(tracker || {})) {
    if (status === "Salva") saved++;
    else if (status === "Candidatada") {
      applied++;
      const ts = Number(trackerDates[jobId] || 0);
      if (ts > 0 && (nowMs - ts) / 86400000 >= 5) {
        followUpDueIds.push(jobId);
      }
    } else if (status === "Entrevista") interview++;
    else if (status === "Proposta") offer++;
  }

  const totalAppliedOrBeyond = applied + interview + offer;
  const interviewsOrOffers = interview + offer;
  const conversionRate = totalAppliedOrBeyond > 0 ? Math.round((interviewsOrOffers / totalAppliedOrBeyond) * 100) : 0;

  return {
    saved,
    applied,
    interview,
    offer,
    conversionRate,
    followUpDueCount: followUpDueIds.length,
    followUpDueIds,
  };
}
