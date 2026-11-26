import {
  extractSkillsCanonical,
  resolveSkillAlias,
  findRelatedSkillsViaGraph,
  normalizeSeniority,
  parseExperienceYears,
  extractCanonicalProfile,
  extractCanonicalJob,
  detectLanguageCode
} from '../js/nlp.js';
import { InvertedIndex } from '../js/index.js';
import { deduplicateJobs } from '../js/dedup.js';
import {
  DEFAULT_WEIGHTS,
  matchJobsHybrid,
  adaptWeightsFromFeedback,
  computeRankingQualityMetrics,
  highlightMatchedTerms,
  buildBilingualPitch
} from '../js/matcher.js';
import { AutonomousSecurityAIGuard } from '../js/security_ai.js';
import { buildExternalLinks } from '../js/fetcher.js';
import { getTranslatedJobView, translateStructuredField } from '../js/translator.js';
import { SUPPORTED_LANGUAGES } from '../js/i18n.js';
import { evaluateJobAuthenticity } from '../js/fraud.js';
import {
  autoEditResumeForJob,
  buildRecruiterOutreach,
  computeConversionFunnel,
  generateInterviewPrep,
  tailorResumeForJob
} from '../js/conversion.js';
import { buildTextPdfBlob } from '../js/ats.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function makeJob(overrides = {}) {
  const base = {
    id: overrides.id || 'job-1',
    title: 'Senior Full Stack Engineer',
    company: 'TechNova',
    location: 'Remoto - Brasil',
    modality: 'Remoto',
    seniority: 'Sênior',
    salary: 'R$ 16.000',
    skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker'],
    description:
      'Buscamos Senior Full Stack Engineer para escalar nossa plataforma SaaS e reduzir latência de APIs em 40% usando JavaScript, TypeScript, React, Node.js, PostgreSQL e Docker.',
    url: 'https://example.com/jobs/1',
    source: 'LocalBR',
    posted_at: new Date().toISOString()
  };
  return extractCanonicalJob({ ...base, ...overrides });
}

export async function runAllTests() {
  const results = [];

  function test(name, fn) {
    try {
      fn();
      results.push({ name, passed: true });
    } catch (err) {
      results.push({ name, passed: false, error: err?.message || String(err) });
    }
  }

  // 1. Match perfeito (Alta >= 80)
  test('1. Match perfeito atinge faixa Alta (>= 80) e destaca termos', () => {
    const resumeText = `
      Senior Full Stack Engineer com 7 anos de experiência (01/2019 - Atual).
      Domínio em JavaScript, TypeScript, React, Node.js, PostgreSQL e Docker.
      Idiomas: Português nativo, Inglês avançado. Formação: Bacharelado em Ciência da Computação.
    `;
    const profile = extractCanonicalProfile(resumeText, 'cv.pdf', 1);
    const job = makeJob({ id: 'perfect-1' });
    const index = new InvertedIndex().build([job]);

    const res = matchJobsHybrid({
      jobs: [job],
      index,
      candidateSkills: profile.skills,
      candidateText: resumeText,
      candidateSeniority: profile.seniority,
      candidateSector: profile.sector,
      suggestedRoles: profile.suggestedRoles,
      userCountry: 'Brasil'
    });

    assert(res.jobs.length === 1, 'Deveria retornar 1 vaga');
    const matched = res.jobs[0];
    assert(matched.match_score >= 80, `Esperado match_score >= 80, obtido ${matched.match_score}`);
    assert(matched.score_band?.label === 'Alta', `Esperado faixa Alta, obtido ${matched.score_band?.label}`);
    assert(matched.matched_skills.includes('JavaScript'), 'Deveria incluir JavaScript');

    const highlighted = highlightMatchedTerms(job.description, matched.matched_skills);
    assert(highlighted.includes('<mark class="match-hl">'), 'Deveria destacar termos com <mark>');
  });

  // 2. Match por sinônimo/alias + grafo de competências
  test('2. Normalização léxica e aliases (JS, K8s, reactjs, py) + grafo de competências', () => {
    assert(resolveSkillAlias('JS') === 'JavaScript', 'JS deve mapear para JavaScript');
    assert(resolveSkillAlias('K8s') === 'Kubernetes', 'K8s deve mapear para Kubernetes');
    assert(resolveSkillAlias('reactjs') === 'React', 'reactjs deve mapear para React');
    assert(resolveSkillAlias('py') === 'Python', 'py deve mapear para Python');

    const extracted = extractSkillsCanonical('Experiência sólida com JS, reactjs, K8s e py.');
    assert(extracted.includes('JavaScript'), 'Faltou JavaScript');
    assert(extracted.includes('React'), 'Faltou React');
    assert(extracted.includes('Kubernetes'), 'Faltou Kubernetes');
    assert(extracted.includes('Python'), 'Faltou Python');

    const related = findRelatedSkillsViaGraph(['React', 'Docker'], ['Next.js', 'Kubernetes'], 2);
    assert(related.length >= 1, 'Grafo deveria encontrar skills relacionadas a React/Docker');
    assert(
      related.some((r) => r.skill === 'Next.js' || r.skill === 'Kubernetes'),
      'Deveria relacionar Next.js ou Kubernetes'
    );
  });

  // 3. Senioridade divergente (penalidade gradativa, sem eliminação binária)
  test('3. Senioridade divergente aplica penalidade gradativa sem eliminar vaga', () => {
    const yearsParsed = parseExperienceYears('01/1992 - Atual | 5-7 anos de experiência');
    assert(yearsParsed >= 30, `Esperado >= 30 anos para 01/1992 - Atual, obtido ${yearsParsed}`);

    const seniorNorm = normalizeSeniority('Desenvolvedor Sênior', 6);
    assert(seniorNorm === 'Sênior', `Deveria normalizar para Sênior, obtido ${seniorNorm}`);

    const juniorProfile = extractCanonicalProfile(
      'Desenvolvedor Júnior com 1 ano de experiência em JavaScript, React e Node.js.',
      'jr.pdf',
      1
    );
    const specJob = makeJob({
      id: 'spec-1',
      title: 'Principal / Especialista Frontend Engineer',
      seniority: 'Especialista',
      skills: ['JavaScript', 'React', 'Node.js']
    });
    const jrJob = makeJob({
      id: 'jr-1',
      title: 'Desenvolvedor Frontend Júnior',
      seniority: 'Júnior',
      skills: ['JavaScript', 'React', 'Node.js']
    });

    const jobs = [specJob, jrJob];
    const index = new InvertedIndex().build(jobs);
    const res = matchJobsHybrid({
      jobs,
      index,
      candidateSkills: juniorProfile.skills,
      candidateText: 'Desenvolvedor Júnior React Node.js',
      candidateSeniority: juniorProfile.seniority,
      candidateSector: juniorProfile.sector,
      suggestedRoles: juniorProfile.suggestedRoles,
      userCountry: 'Brasil'
    });

    assert(res.jobs.length === 2, 'Vaga com senioridade divergente não deve ser eliminada');
    const jrRes = res.jobs.find((j) => j.id === 'jr-1');
    const specRes = res.jobs.find((j) => j.id === 'spec-1');
    assert(jrRes.match_score > specRes.match_score, `Júnior (${jrRes.match_score}) deve pontuar acima de Especialista (${specRes.match_score})`);
    assert(
      specRes.score_breakdown.seniority < jrRes.score_breakdown.seniority,
      'Componente seniority deve penalizar divergência'
    );
  });

  // 4. Vaga em outro idioma + filtro de idioma + pitch bilíngue
  test('4. Vaga em inglês: detecção de idioma, filtro duro e pitch em EN', () => {
    const enJob = makeJob({
      id: 'en-1',
      title: 'Senior Backend Engineer',
      location: 'Remote - Global',
      description:
        'We are looking for a Senior Backend Engineer to improve checkout conversion by 25% and scale microservices with Python, Docker, and Kubernetes.',
      skills: ['Python', 'Docker', 'Kubernetes']
    });
    const ptJob = makeJob({
      id: 'pt-1',
      title: 'Engenheiro Backend Sênior',
      description:
        'Buscamos profissional para atuar com Python, Docker e Kubernetes no desenvolvimento de microsserviços escaláveis no Brasil.',
      skills: ['Python', 'Docker', 'Kubernetes']
    });

    assert(detectLanguageCode(enJob.description) === 'en', 'Vaga EN deve ser detectada como en');
    assert(detectLanguageCode(ptJob.description) === 'pt', 'Vaga PT deve ser detectada como pt');

    const index = new InvertedIndex().build([enJob, ptJob]);
    const filtered = matchJobsHybrid({
      jobs: [enJob, ptJob],
      index,
      candidateSkills: ['Python', 'Docker', 'Kubernetes'],
      candidateText: 'Python Docker Kubernetes Senior Engineer',
      candidateSeniority: 'Sênior',
      filters: { language: 'en' }
    });

    assert(filtered.jobs.length === 1 && filtered.jobs[0].id === 'en-1', 'Filtro language=en deve manter apenas vaga EN');

    const pitchEn = buildBilingualPitch(enJob, ['Python', 'Docker'], [], 'Sênior');
    assert(
      /hi|hello|interested|python/i.test(pitchEn) && !/olá/i.test(pitchEn),
      `Pitch para vaga EN deve estar em inglês. Recebido: ${pitchEn}`
    );
  });

  // 5. Performance: Índice Invertido sub-10ms em 2.000 vagas
  test('5. InvertedIndex busca sub-10ms em 2.000 vagas indexadas', () => {
    const manyJobs = [];
    for (let i = 0; i < 2000; i++) {
      manyJobs.push(
        extractCanonicalJob({
          id: `perf-${i}`,
          title: i % 5 === 0 ? 'Senior React TypeScript Engineer' : `Analista de Sistemas ${i}`,
          company: `Empresa ${i % 40}`,
          location: 'Remoto',
          skills: i % 5 === 0 ? ['React', 'TypeScript', 'Node.js'] : ['Java', 'SQL'],
          description:
            i % 5 === 0
              ? 'Desenvolvimento de aplicações web escaláveis com React, TypeScript e Node.js.'
              : 'Manutenção de sistemas legados corporativos com Java e SQL.'
        })
      );
    }

    const index = new InvertedIndex().build(manyJobs);
    // Warmup JIT antes de medir latência mediana em regime
    index.search('Java SQL', { returnScores: true });
    index.search('React TypeScript Node.js', { returnScores: true });

    const timings = [];
    let hits = [];
    for (let run = 0; run < 5; run++) {
      const t0 = performance.now();
      hits = index.search('React TypeScript Node.js', { returnScores: true });
      timings.push(performance.now() - t0);
    }
    timings.sort((a, b) => a - b);
    const elapsed = timings[2]; // mediana

    assert(Array.isArray(hits) && hits.length > 0, 'Busca deveria retornar documentos correspondentes');
    assert(elapsed < 10, `Mediana da busca demorou ${elapsed.toFixed(2)}ms (esperado < 10ms)`);
  });

  // 6. Deduplicação fuzzy (URL + Jaccard >= 0.85)
  test('6. Deduplicação por URL canônica e título+empresa fuzzy (Jaccard >= 0.85)', () => {
    const raw = [
      {
        id: 'a1',
        title: 'Senior Full Stack Developer',
        company: 'Acme Corp',
        url: 'https://acme.com/jobs/123?utm_source=linkedin'
      },
      {
        id: 'a2',
        title: 'Senior Full Stack Developer',
        company: 'Acme Corp',
        url: 'https://acme.com/jobs/123/'
      },
      {
        id: 'a3',
        title: 'Senior Full Stack Developer Remote',
        company: 'Acme Corp',
        url: 'https://mirror.jobs/acme-fs'
      },
      {
        id: 'b1',
        title: 'Data Engineer Python Spark',
        company: 'Beta Labs',
        url: 'https://betalabs.io/jobs/9'
      }
    ];

    const out = deduplicateJobs(raw, 0.85);
    assert(out.totalUnique === 2 || out.totalUnique === 3, `Esperado deduplicação de duplicatas, obtido ${out.totalUnique}`);
    assert(out.duplicatesRemoved >= 1, 'Deveria remover ao menos 1 duplicata');
    assert(out.jobs.some((j) => j.id === 'b1'), 'Vaga distinta b1 deve ser preservada');
  });

  // 7. Feedback loop, adaptação de pesos, Precision@10 e fallback BM25
  test('7. Feedback loop (👍/👎), adaptação de pesos e Precision@10', () => {
    const updated = adaptWeightsFromFeedback(
      DEFAULT_WEIGHTS,
      { exactSkills: 98, relatedSkills: 10, semantic: 45, seniority: 40, roleSector: 25 },
      1
    );
    const sum = Object.values(updated).reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1) < 0.01, `Soma dos pesos deve ser ~1.0, obtido ${sum}`);
    assert(
      updated.exactSkills > DEFAULT_WEIGHTS.exactSkills,
      `Peso exactSkills deveria aumentar após 👍 com sinal alto (antes=${DEFAULT_WEIGHTS.exactSkills}, depois=${updated.exactSkills})`
    );

    const ranked = [
      { id: 'j1' },
      { id: 'j2' },
      { id: 'j3' },
      { id: 'j4' }
    ];
    const feedbackMap = {
      j1: { vote: 1 },
      j2: { vote: 1 },
      j3: { vote: -1 }
    };
    const quality = computeRankingQualityMetrics(ranked, feedbackMap, 10);
    assert(quality.isUserMeasured === true, 'Deveria marcar métrica como medida pelo usuário');
    assert(quality.precisionAtK === 67, `Precision@10 esperada 67%, obtida ${quality.precisionAtK}%`);

    // Verifica fallback BM25 vs modo híbrido com embeddings
    const job = makeJob({ id: 'emb-1' });
    const idx = new InvertedIndex().build([job]);
    const fallbackRes = matchJobsHybrid({
      jobs: [job],
      index: idx,
      candidateSkills: ['JavaScript', 'React'],
      candidateText: 'Senior Full Stack Engineer'
    });
    assert(fallbackRes.jobs[0].semantic_mode === 'bm25_fallback', 'Sem embeddings deve usar bm25_fallback');

    const embRes = matchJobsHybrid({
      jobs: [job],
      index: idx,
      candidateSkills: ['JavaScript', 'React'],
      candidateText: 'Senior Full Stack Engineer',
      candidateEmbedding: [1, 0, 0, 0],
      jobEmbeddings: new Map([['emb-1', [0.9, 0.1, 0, 0]]])
    });
    assert(embRes.jobs[0].semantic_mode === 'minilm_bm25_hybrid', 'Com embeddings deve usar minilm_bm25_hybrid');
  });

  // 8. Motor autônomo de IA de segurança (invasões + documento de auditoria)
  test('8. IA autônoma detecta XSS/SQLi/acesso não autorizado e gera documento Markdown', () => {
    const guard = new AutonomousSecurityAIGuard();
    const xssCheck = guard.inspectValue('Busca', '<script>alert(1)</script> UNION SELECT * FROM users');
    assert(xssCheck.blocked === true && xssCheck.riskScore >= 80, 'Deveria bloquear ataque combinado XSS+SQLi');

    const fileCheck = guard.inspectUploadedFile('malicioso.pdf', 'MZ_NOT_A_PDF');
    assert(fileCheck.blocked === true, 'Deveria bloquear PDF sem magic bytes %PDF-');

    const doc = guard.generateMarkdownDocument();
    assert(doc.includes('Documento Autônomo de Auditoria de Segurança'), 'Documento Markdown deve ser gerado');
    assert(doc.includes('XSS / Script Injection'), 'Documento deve registrar tentativa XSS');
  });

  // 9. Precisão por skill crítica de título + anos de experiência + portais globais
  test('9. Precisão por skill crítica de título, anos de experiência e cobertura global de portais', () => {
    const pyJob = makeJob({
      id: 'crit-py',
      title: 'Senior Python Engineer',
      skills: ['Python', 'Docker', 'SQL'],
      description: 'Senior Python Engineer com 5+ anos em Python, Docker e SQL.'
    });
    const javaJob = makeJob({
      id: 'crit-java',
      title: 'Senior Java Engineer',
      skills: ['Java', 'Docker', 'SQL'],
      description: 'Senior Java Engineer com 5+ anos em Java, Docker e SQL.'
    });
    const idx = new InvertedIndex().build([pyJob, javaJob]);
    const res = matchJobsHybrid({
      jobs: [pyJob, javaJob],
      index: idx,
      candidateSkills: ['Python', 'Docker', 'SQL'],
      candidateText: 'Senior Python Engineer com 6 anos em Python, Docker e SQL',
      candidateSeniority: 'Sênior',
      candidateYears: 6
    });
    assert(res.jobs[0].id === 'crit-py', `Esperado crit-py no topo, obtido ${res.jobs[0].id}`);
    assert(res.jobs[0].match_score > res.jobs[1].match_score, 'Skill crítica no título deve diferenciar o score');

    const links = buildExternalLinks(['Python', 'Docker'], ['Backend Engineer'], 'Brasil');
    assert(links.length >= 25, `Esperado >= 25 sistemas globais, obtido ${links.length}`);
  });

  // 10. Suporte multilíngue: Inglês, Francês, Espanhol e Japonês
  test('10. Detecção de idioma, tokenização CJK e pitch multilíngue (EN, FR, ES, JA)', () => {
    assert(
      detectLanguageCode("Nous recherchons un développeur avec expérience en télétravail pour notre équipe.") === 'fr',
      'Deveria detectar Francês (fr)'
    );
    assert(
      detectLanguageCode("Buscamos un desarrollador con experiencia en trabajo remoto para nuestro equipo.") === 'es',
      'Deveria detectar Espanhol (es)'
    );
    assert(
      detectLanguageCode("東京のリモートワーク可能なシニアソフトウェアエンジニアを募集しています。PythonとReactの経験が必要です。") === 'ja',
      'Deveria detectar Japonês (ja)'
    );

    const jpJob = makeJob({
      id: 'jp-1',
      title: 'シニアバックエンドエンジニア',
      location: '東京 / リモート',
      description: '東京のリモートワーク可能なシニアソフトウェアエンジニアを募集しています。PythonとDockerの経験。',
      skills: ['Python', 'Docker']
    });
    assert(jpJob.jobLanguage === 'ja', `Vaga JP deveria ter jobLanguage=ja, obtido ${jpJob.jobLanguage}`);
    const jpIndex = new InvertedIndex().build([jpJob]);
    const jpHits = jpIndex.search('シニアエンジニア リモート');
    assert(jpHits.has('jp-1'), 'InvertedIndex deve encontrar vaga em Japonês');

    const pitchFr = buildBilingualPitch({ ...jpJob, jobLanguage: 'fr' }, ['Python'], [], 'Sênior');
    const pitchEs = buildBilingualPitch({ ...jpJob, jobLanguage: 'es' }, ['Python'], [], 'Sênior');
    const pitchJa = buildBilingualPitch(jpJob, ['Python'], [], 'Sênior');
    assert(/bonjour/i.test(pitchFr), 'Pitch FR deve estar em Francês');
    assert(/hola/i.test(pitchEs), 'Pitch ES deve estar em Espanhol');
    assert(/はじめまして/.test(pitchJa), 'Pitch JA deve estar em Japonês');

    // Tradução de campos estruturados de vagas importadas para os 5 idiomas
    assert(translateStructuredField('modality', 'Remoto', 'en') === 'Remote', 'Modalidade EN');
    assert(translateStructuredField('modality', 'Remoto', 'fr') === 'Télétravail', 'Modalidade FR');
    assert(translateStructuredField('seniority', 'Sênior', 'ja') === 'シニア', 'Senioridade JA');
    const viewJa = getTranslatedJobView({ ...jpJob, modality: 'Remoto', seniority: 'Sênior', salary: 'A combinar' }, 'ja');
    assert(viewJa.modality === 'リモート' && viewJa.salary === '応相談', 'getTranslatedJobView deve traduzir campos da vaga');
    assert(SUPPORTED_LANGUAGES.length >= 45, `Esperado >= 45 idiomas suportados, obtido ${SUPPORTED_LANGUAGES.length}`);
    assert(detectLanguageCode('Wir suchen einen Entwickler mit Erfahrung im Team und Remote') === 'de', 'Deveria detectar Alemão');
    assert(detectLanguageCode('Cerchiamo uno sviluppatore con esperienza in azienda') === 'it', 'Deveria detectar Italiano');
    assert(detectLanguageCode('서울 리모트 백엔드 엔지니어 채용') === 'ko', 'Deveria detectar Coreano');
  });

  // 11. Detector & filtro anti-vagas falsas / golpes
  test('11. Detector de vagas falsas identifica golpe e filtra automaticamente no matching', () => {
    const scamJob = makeJob({
      id: 'scam-1',
      title: 'GANHE R$ 500 POR DIA URGENTE!!!',
      company: 'Confidencial',
      description: 'Sem experiencia ganhe R$ 500 por dia para avaliar produtos. Chamar no Telegram t.me/fake e pagar taxa de inscricao via Pix.',
      url: 'https://bit.ly/fake-job'
    });
    const legitJob = makeJob({ id: 'legit-1' });

    const scamEval = evaluateJobAuthenticity(scamJob);
    assert(scamEval.isFake === true && scamEval.riskScore >= 60, `Esperado isFake=true, obtido ${scamEval.riskScore}`);

    const idx = new InvertedIndex().build([scamJob, legitJob]);
    const filtered = matchJobsHybrid({
      jobs: [scamJob, legitJob],
      index: idx,
      candidateSkills: ['JavaScript', 'React'],
      candidateText: 'Senior Full Stack Engineer',
      filters: { fraudMode: 'hide_scam' }
    });
    assert(filtered.jobs.length === 1 && filtered.jobs[0].id === 'legit-1', 'Filtro hide_scam deve remover vaga falsa');
    assert(filtered.metrics.filteredFakeCount === 1, 'Telemetria deve contabilizar 1 vaga falsa filtrada');
  });

  // 12. Kit de conversão vaga -> entrevista & filtro de frescor 48h
  test('12. Tailored ATS, busca de recrutador, prep de entrevista, funil e filtro 48h', () => {
    const freshDate = new Date().toISOString().slice(0, 10);
    const oldDate = new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10);
    const freshJob = makeJob({ id: 'fresh-1', posted_at: freshDate });
    const oldJob = makeJob({ id: 'old-1', posted_at: oldDate });

    const idx = new InvertedIndex().build([freshJob, oldJob]);
    const res48h = matchJobsHybrid({
      jobs: [freshJob, oldJob],
      index: idx,
      candidateSkills: ['JavaScript', 'React', 'Node.js'],
      candidateText: 'Senior Full Stack Engineer',
      filters: { recency: '48h' }
    });
    assert(res48h.jobs.length === 1 && res48h.jobs[0].id === 'fresh-1', 'Filtro 48h deve manter apenas vaga recém-publicada');

    const tailored = tailorResumeForJob('Curriculo...', res48h.jobs[0], ['JavaScript', 'React'], 'Sênior');
    assert(tailored.tailoredBlockText.includes('RESUMO DIRECIONADO'), 'Deve gerar bloco tailored');

    const autoEdited = autoEditResumeForJob(
      'MARIANA SILVA\n\nRESUMO PROFISSIONAL\nDev Full Stack\n\nEXPERIENCIA PROFISSIONAL\n- Criou APIs',
      res48h.jobs[0],
      ['JavaScript', 'React'],
      'Sênior'
    );
    assert(autoEdited.editedResumeText.includes('MARIANA SILVA'), 'Deve preservar cabeçalho do candidato');
    assert(autoEdited.editedResumeText.includes('EXPERIENCIA PROFISSIONAL'), 'Deve preservar experiência');
    const pdfBlob = buildTextPdfBlob(autoEdited.editedResumeText);
    assert(pdfBlob.type === 'application/pdf' && pdfBlob.size > 200, 'Deve gerar Blob PDF válido para download');

    const outreach = buildRecruiterOutreach(res48h.jobs[0], 'Sênior');
    assert(outreach.linkedinPeopleUrl.includes('linkedin.com/search/results/people'), 'Deve gerar link de recrutador');
    assert(outreach.connectionNote.length <= 300, 'Nota de conexão deve ter <= 300 caracteres');

    const prep = generateInterviewPrep(res48h.jobs[0]);
    assert(prep.length >= 3 && prep.length <= 5, 'Deve gerar entre 3 e 5 perguntas de entrevista');

    const now = Date.now();
    const funnel = computeConversionFunnel(
      { j1: 'Salva', j2: 'Candidatada', j3: 'Entrevista' },
      { j2: now - 6 * 86400000 },
      now
    );
    assert(funnel.conversionRate === 50, `Esperado conversão 50%, obtido ${funnel.conversionRate}%`);
    assert(funnel.followUpDueCount === 1, 'Deveria detectar 1 follow-up pendente (>= 5 dias)');
  });

  const passedCount = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    results
  };
}
