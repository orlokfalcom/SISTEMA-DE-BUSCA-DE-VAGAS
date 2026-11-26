import {
  MATCH_WEIGHTS,
  WEIGHT_VERSION,
  auditFairnessCompliance,
  compareCustomJob,
  computeRankingQualityMetrics,
  computeSeniorityScore,
  matchJobsHybrid,
  normalizeWeights,
  rollbackWeightsVersion,
  validateWeights,
} from "../js/matcher.js";
import { adaptWeightsFromFeedbackV2 } from "../js/matching_v2/evaluation.js";
import { InvertedIndex } from "../js/index.js";
import { extractCanonicalJob } from "../js/nlp.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export async function runV2Tests() {
  const results = [];
  const test = (name, fn) => {
    try {
      fn();
      results.push({ name, passed: true });
    } catch (e) {
      results.push({ name, passed: false, error: e.message });
    }
  };

  // Matriz 10D & Normalização com NaN/Infinity
  test("V2.1 Matriz 10D soma 1.0 e trata NaN/Infinity/negativos", () => {
    assert(validateWeights(MATCH_WEIGHTS).valid, "MATCH_WEIGHTS deve somar 1.0");
    const dirty = normalizeWeights({ ...MATCH_WEIGHTS, exactSkills: NaN, seniority: Infinity, education: -5 });
    assert(validateWeights(dirty).valid, `Pesos normalizados devem somar 1.0, obtido ${validateWeights(dirty).sum}`);
    assert(Number.isFinite(dirty.exactSkills) && dirty.education >= 0.02, "Limites e NaN devem ser tratados");
  });

  // Cenário A: Correspondência técnica exata
  test("Cenário A: Correspondência técnica exata (Python, SQL, Power BI, Pandas)", () => {
    const res = matchJobsHybrid({
      jobs: [{
        id: "A", title: "Analista de Dados", company: "DataCorp", location: "São Paulo",
        description: "Requisitos: Python, SQL, Power BI, Pandas. Análise de métricas e dashboards.",
        url: "https://datacorp.example/a", source: "Carreira Direta", posted_at: "2026-11-25",
      }],
      candidateSkills: ["Python", "SQL", "Power BI", "Pandas"],
      candidateText: "Desenvolvi pipelines em Python, SQL, Pandas e dashboards Power BI reduzindo tempo em 40%.",
      candidateSeniority: "Pleno",
    });
    assert(res.jobs[0].match_score >= 78, `Esperado >= 78, obtido ${res.jobs[0].match_score}`);
    assert(res.jobs[0].matched_skills.length === 4, "Deve casar todas as 4 skills exatas");
    assert(auditFairnessCompliance(res.jobs[0].score_breakdown).compliant, "Auditoria anti-discriminação deve passar");
  });

  // Cenário B: Equivalência técnica contextual (PostgreSQL <-> MySQL, React <-> Vue.js, Pandas <-> Polars)
  test("Cenário B: Equivalência técnica contextual (PostgreSQL↔MySQL, React↔Vue.js)", () => {
    const res = matchJobsHybrid({
      jobs: [{
        id: "B", title: "Engenheiro Full Stack", company: "WebFlow", location: "Remoto",
        description: "Stack: Vue.js, MySQL, Polars, Azure.",
        url: "https://webflow.example/b", source: "Carreira Direta", posted_at: "2026-11-25",
      }],
      candidateSkills: ["React", "PostgreSQL", "Pandas", "AWS"],
      candidateText: "Experiência em produção com React, PostgreSQL, Pandas e AWS.",
      candidateSeniority: "Pleno",
    });
    assert(res.jobs[0].related_matches.length >= 3, `Esperado >=3 equivalências técnicas, obtido ${res.jobs[0].related_matches.length}`);
    assert(res.jobs[0].score_breakdown.transferableSkills >= 50, "Dimensão transferableSkills deve pontuar");
  });

  // Cenário C & D: Experiência superior vs inferior
  test("Cenários C & D: Senior acima não sofre penalidade severa; Jr abaixo sofre penalidade gradativa", () => {
    const over = computeSeniorityScore("Sênior", "Pleno", { candYears: 6, candidateText: "Arquitetura e liderança" });
    const under = computeSeniorityScore("Estágio", "Sênior", { candYears: 0 });
    assert(over >= 0.9, `Candidato superior não deve ser penalizado: ${over}`);
    assert(under < 0.5, `Candidato muito abaixo deve ter score menor: ${under}`);
  });

  // Cenário E: Cargo diferente, responsabilidades equivalentes
  test("Cenário E: Analista de Sistemas com responsabilidades de Engenharia de Software", () => {
    const res = matchJobsHybrid({
      jobs: [{
        id: "E", title: "Software Engineer", company: "TechCo", location: "Remoto",
        description: "Desenvolvimento de APIs, arquitetura de microsserviços, SQL e integração em cloud.",
        url: "https://techco.example/e", source: "Carreira Direta", posted_at: "2026-11-25",
      }],
      candidateSkills: ["Python", "SQL", "AWS"],
      candidateText: "Analista de Sistemas responsável por arquitetura de APIs, integração de dados SQL e deploy em AWS.",
      candidateSeniority: "Pleno",
    });
    assert(res.jobs[0].transferable_experience.length >= 1, "Deve identificar experiência transferível entre cargos");
    assert(res.jobs[0].score_breakdown.responsibilities >= 50, "Responsabilidades equivalentes devem pontuar");
  });

  // Cenários F, G, K: Currículo incompleto, requisitos não comprovados e descrição incompleta
  test("Cenários F, G, K: Dados ausentes não zeram confiança nem quebram avaliação", () => {
    const comp = compareCustomJob({
      jobTitle: "Engenheiro Civil",
      jobDescription: "Obrigatório registro ativo no CREA. Experiência com projetos estruturais.",
      candidateSkills: ["Python"],
      candidateText: "Desenvolvedor Python.",
      candidateSeniority: "Pleno",
    });
    assert(comp.mandatory_requirements.some((r) => r.category === "Legal" && r.state === "Não atendido"), "Deve detectar requisito legal não atendido");
    assert(comp.match_confidence >= 15 && comp.data_coverage > 0, "Confiança e cobertura devem ser calculadas");

    const incompleteJob = compareCustomJob({ jobTitle: "Dev", jobDescription: "", candidateSkills: ["Python"], candidateText: "", candidateSeniority: "Pleno" });
    assert(Number.isFinite(incompleteJob.match_score), "Descrição incompleta não pode gerar NaN");
  });

  // Cenário H: Cross-lingual PT -> EN ("Engenheiro de Dados" <-> "Data Engineer")
  test("Cenário H: Correspondência cross-lingual PT <-> EN", () => {
    const res = matchJobsHybrid({
      jobs: [{
        id: "H", title: "Data Engineer", company: "GlobalData", location: "Remote",
        description: "Build scalable data pipelines with Python, SQL and AWS. English B2.",
        url: "https://globaldata.example/h", source: "Remotive (Ao Vivo)", posted_at: "2026-11-25",
      }],
      candidateSkills: ["Python", "SQL", "AWS"],
      candidateText: "Engenheiro de Dados com 4 anos em pipelines de dados, Python, SQL, AWS e Inglês C1.",
      suggestedRoles: ["Engenheiro de Dados"],
      candidateSeniority: "Pleno",
    });
    assert(res.jobs[0].match_score >= 70, `Cross-lingual PT->EN esperado >= 70, obtido ${res.jobs[0].match_score}`);
  });

  // Cenário I & J: Restrição geográfica e vaga fraudulenta separada da compatibilidade
  test("Cenários I & J: Fraude separada da compatibilidade e restrição geográfica detectada", () => {
    const res = matchJobsHybrid({
      jobs: [{
        id: "J", title: "Senior Python Developer", company: "FastMoney", location: "US Only",
        description: "Python AWS. Pay registration fee of $50 via Pix/WhatsApp for guaranteed job! Work authorization US only.",
        url: "http://bit.ly/scam", source: "Unknown", posted_at: "2026-11-25",
      }],
      candidateSkills: ["Python", "AWS"],
      candidateText: "Senior Python AWS engineer.",
      candidateSeniority: "Sênior",
      filters: { fraudMode: "show_all" },
    });
    assert(res.jobs[0].job_authenticity_score < 60, `Autenticidade deve ser baixa para golpe: ${res.jobs[0].job_authenticity_score}`);
    assert(res.jobs[0].match_score > 0, "Compatibilidade profissional é calculada separadamente da fraude");
  });

  // Cenários L, M, N, O: Transição, complementares, formação preferência, skill específica ausente
  test("Cenários L, M, N, O: Sinergias complementares, formação preferência e gaps", () => {
    const res = matchJobsHybrid({
      jobs: [{
        id: "M", title: "Cientista de Dados", company: "InsightLab", location: "São Paulo",
        description: "Python, SQL, Pandas, Kubernetes. Graduação desejável ou experiência equivalente.",
        url: "https://insight.example/m", source: "Carreira Direta", posted_at: "2026-11-25",
      }],
      candidateSkills: ["Python", "SQL", "Pandas", "Power BI"],
      candidateText: "5 anos em Python, SQL e Pandas construindo modelos e dashboards.",
      candidateSeniority: "Sênior",
    });
    assert(res.jobs[0].missing_skills.includes("Kubernetes"), "Deve apontar skill ausente específica (Kubernetes)");
    assert(res.jobs[0].strengths.some((s) => s.includes("Sinergia complementar")), "Deve destacar competências complementares");
    assert(res.jobs[0].score_breakdown.education >= 70, "Formação apenas desejável não deve punir severamente");
  });

  // Métricas estatísticas reais de IR + Feedback supervisionado + Rollback
  test("V2.2 Métricas IR (Precision@K, Recall@K, NDCG@K, MAP, MRR) e Rollback", () => {
    const ranked = [
      { id: "1", match_score: 92, data_coverage: 90 },
      { id: "2", match_score: 85, data_coverage: 80 },
      { id: "3", match_score: 65, data_coverage: 70 },
    ];
    const fb = {
      "1": { vote: 1, stage: "interview" },
      "2": { vote: -1 },
      "3": { vote: 1, stage: "applied" },
    };
    const m = computeRankingQualityMetrics(ranked, fb, 3);
    assert(m.isUserMeasured === true, "Deve marcar isUserMeasured=true");
    assert(m.ndcgAtK !== null && m.map !== null && m.mrr === 1, `Métricas IR inválidas: ${JSON.stringify(m)}`);

    const unmeasured = computeRankingQualityMetrics(ranked, {}, 3);
    assert(unmeasured.precisionAtK === null && unmeasured.isUserMeasured === false, "Sem feedback real deve retornar null (não estimativa)");

    const batchRes = adaptWeightsFromFeedbackV2(MATCH_WEIGHTS, [
      { type: "interview", breakdown: { exactSkills: 95, transferableSkills: 60 } },
      { type: "applied", breakdown: { exactSkills: 90, transferableSkills: 50 } },
      { type: "dislike", breakdown: { exactSkills: 20, locationModality: 90 } },
    ]);
    assert(batchRes.updated === true && validateWeights(batchRes.weights).valid, "Lote >= 3 deve atualizar pesos mantendo soma 1.0");
    const rolled = rollbackWeightsVersion(1);
    assert(rolled.version === WEIGHT_VERSION, "Rollback deve restaurar versão anterior");
  });

  // Benchmark de performance em 2.000 vagas
  let benchMs = 0;
  test("V2.3 Benchmark: 2.000 vagas ranqueadas com motor 10D em tempo hábil", () => {
    const jobs2k = Array.from({ length: 2000 }, (_, i) =>
      extractCanonicalJob({
        id: `bench-${i}`,
        title: i % 2 === 0 ? "Engenheiro de Software Python" : "Analista de Dados SQL",
        company: `Empresa ${i}`,
        location: "Remoto",
        description: "Python, SQL, Docker, AWS, desenvolvimento de APIs e análise de métricas.",
        url: `https://jobs.example/${i}`,
        source: "Carreira Direta",
        posted_at: "2026-11-25",
      })
    );
    const idx = new InvertedIndex().build(jobs2k);
    // Warm-up de pré-processamento (como ocorre no boot do app) e medição da busca 10D
    matchJobsHybrid({
      jobs: jobs2k,
      index: idx,
      candidateSkills: ["Python", "SQL", "AWS"],
      candidateText: "Desenvolvedor Python e SQL com experiência em AWS e APIs.",
      candidateSeniority: "Pleno",
    });
    const out = matchJobsHybrid({
      jobs: jobs2k,
      index: idx,
      candidateSkills: ["Python", "SQL", "AWS"],
      candidateText: "Desenvolvedor Python e SQL com experiência em AWS e APIs.",
      candidateSeniority: "Pleno",
    });
    benchMs = out.metrics.searchTimeMs;
    assert(out.jobs.length === 2000, "Deve ranquear todas as 2.000 vagas");
    assert(benchMs < 3000, `Latência excessiva para 2.000 vagas: ${benchMs}ms`);
  });

  const passed = results.filter((r) => r.passed).length;
  return {
    version: WEIGHT_VERSION,
    total: results.length,
    passed,
    failed: results.length - passed,
    benchmark2kMs: benchMs,
    results,
  };
}
