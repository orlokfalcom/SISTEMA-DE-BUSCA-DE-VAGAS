/**
 * VagaPulse AI — Auditoria ATS, Editor de Currículo, Extração PDF (PDF.js) & Cursos Recomendados
 */

import { normalizeText } from "./nlp.js";

const ACTION_VERB_PATTERNS = [
  /\bdesenvolv\w*/, /\blider\w*/, /\bcri(?:ou|ei|ando|acao|ar)\b/, /\bimplement\w*/,
  /\botimiz\w*/, /\breduz\w*/, /\baument\w*/, /\bgerenci\w*/, /\barquitet\w*/,
  /\bautomatiz\w*/, /\bcoord\w*/, /\bconstru\w*/, /\bentreg\w*/, /\bprojet(?:ou|ei|ando|ar)\b/,
  /\bmigr\w*/, /\bconduz\w*/, /\bplanej\w*/,
  /\bbuilt\b/, /\bled\b/, /\bdeveloped\b/, /\bimplemented\b/, /\boptimized\b/,
  /\breduced\b/, /\bincreased\b/, /\bmanaged\b/,
];

export const COURSE_CATALOG = {
  AWS: { title: "AWS Cloud Practitioner Essentials & Security Fundamentals", provider: "AWS Skill Builder", cost: "Gratuito", url: "https://skillbuilder.aws/", why: "Cloud AWS lidera os requisitos nas vagas de Dados, Backend e Segurança." },
  Docker: { title: "Docker & Containers na Prática", provider: "Docker Docs", cost: "Gratuito", url: "https://docs.docker.com/get-started/", why: "Essencial para empacotar e implantar aplicações em produção." },
  Kubernetes: { title: "Introduction to Kubernetes (LFS158)", provider: "Linux Foundation", cost: "Gratuito", url: "https://training.linuxfoundation.org/training/introduction-to-kubernetes/", why: "Diferencial forte para vagas Sênior de Cloud e DevOps." },
  Linux: { title: "Linux Essentials & Administração de Sistemas", provider: "Cisco Networking Academy", cost: "Gratuito", url: "https://www.netacad.com/courses/os-it/ndg-linux-essentials", why: "Base indispensável para Cibersegurança, DevOps e nuvem." },
  "Segurança da Informação": { title: "Certified in Cybersecurity (CC) — Trilha Oficial", provider: "ISC2", cost: "Gratuito", url: "https://www.isc2.org/landing/1mcc", why: "Certificação internacional de alto peso em triagens ATS de segurança." },
  "Threat Hunting / YARA": { title: "SOC Level 1 & Cyber Defense (Threat Hunting / YARA)", provider: "TryHackMe", cost: "Freemium", url: "https://tryhackme.com/path/outline/soclevel1", why: "Laboratórios práticos de detecção de ameaças, SIEM e incidentes." },
  "LLM / IA Generativa": { title: "Generative AI with LLMs & Building RAG / AI Agents", provider: "DeepLearning.AI", cost: "Gratuito", url: "https://www.deeplearning.ai/short-courses/", why: "Cursos curtos com foco em produção de agentes e RAG." },
  "Machine Learning": { title: "Machine Learning & Python para Dados", provider: "Data Science Academy", cost: "Gratuito", url: "https://www.datascienceacademy.com.br/cursosgratuitos", why: "Fortalece modelagem preditiva e portfólio prático." },
  ETL: { title: "Fundamentos de Engenharia de Dados & Pipelines ETL/ELT", provider: "Data Science Academy", cost: "Gratuito", url: "https://www.datascienceacademy.com.br/cursosgratuitos", why: "Muito cobrado em vagas de Engenharia e Análise de Dados." },
  FastAPI: { title: "APIs Modernas em Python com FastAPI & Pytest", provider: "FastAPI Official", cost: "Gratuito", url: "https://fastapi.tiangolo.com/tutorial/", why: "Transforma scripts Python/IA em APIs rápidas prontas para produção." },
  "Power BI": { title: "Microsoft Power BI Para Business Intelligence e Data Science", provider: "Data Science Academy", cost: "Gratuito", url: "https://www.datascienceacademy.com.br/course/microsoft-power-bi-para-business-intelligence-e-data-science", why: "Um dos requisitos mais pedidos em vagas brasileiras de Dados e BI." },
  React: { title: "Front-End moderno com React & TypeScript", provider: "React Docs", cost: "Gratuito", url: "https://react.dev/learn", why: "Abre oportunidades Full Stack integrando frontends modernos a APIs." },
  TypeScript: { title: "TypeScript Handbook & Tipagem Avançada", provider: "TypeScript Official", cost: "Gratuito", url: "https://www.typescriptlang.org/docs/", why: "Padrão de mercado em times web Full Stack e Frontend." },
  JavaScript: { title: "JavaScript Algorithms and Data Structures", provider: "freeCodeCamp", cost: "Gratuito", url: "https://www.freecodecamp.org/learn/", why: "Base fundamental para desenvolvimento web e automação." },
  Terraform: { title: "Infrastructure as Code com Terraform", provider: "HashiCorp Developer", cost: "Gratuito", url: "https://developer.hashicorp.com/terraform/tutorials", why: "Principal ferramenta de Infraestrutura como Código em DevOps/Cloud." },
  "QA / Testes": { title: "Automação de Testes E2E e APIs (Playwright / Pytest)", provider: "Test Automation University", cost: "Gratuito", url: "https://testautomationu.applitools.com/", why: "Eleva a qualidade de entregas exigida em times ágeis." },
};

export function evaluateAtsReadiness({ rawText, pages = 1, wordCount = 0, skills = [], email = null, phone = null, linkedin = null, github = null }) {
  const norm = normalizeText(rawText);
  const wc = wordCount || String(rawText || "").split(/\s+/).filter(Boolean).length;
  const checks = [];
  let score = 0;

  if (pages >= 1 && pages <= 2 && wc >= 120 && wc <= 1400) {
    score += 20;
    checks.push({ status: "ok", label: "Extensão ideal para ATS", tip: `${pages} página(s) e ${wc} palavras — leitura rápida por recrutadores e ATS.` });
  } else {
    score += 10;
    checks.push({ status: "warn", label: "Extensão fora do padrão ideal", tip: "Mantenha o currículo entre 1 e 2 páginas (150–1200 palavras) para melhor triagem." });
  }

  let contactPts = 0;
  const missingContacts = [];
  if (email) contactPts += 10;
  else missingContacts.push("e-mail");
  if (phone || linkedin || github) contactPts += 10;
  else missingContacts.push("telefone ou LinkedIn/GitHub");
  score += contactPts;
  if (contactPts === 20) {
    checks.push({ status: "ok", label: "Contato e presença profissional", tip: "E-mail e canais profissionais detectados corretamente." });
  } else {
    checks.push({ status: "warn", label: "Informações de contato incompletas", tip: `Inclua ${missingContacts.join(" e ")} no cabeçalho.` });
  }

  const hasExp = ["experiencia", "experience", "historico profissional"].some((k) => norm.includes(k));
  const hasEdu = ["formacao", "educacao", "education", "academica"].some((k) => norm.includes(k));
  const hasSum = ["resumo", "objetivo", "sobre", "summary", "profile"].some((k) => norm.includes(k));
  const secCount = [hasExp, hasEdu, hasSum].filter(Boolean).length;
  if (secCount === 3) {
    score += 20;
    checks.push({ status: "ok", label: "Estrutura de seções padrão ATS", tip: "Resumo, Experiência e Formação claramente identificáveis." });
  } else {
    score += secCount * 6;
    const miss = [!hasSum ? "Resumo" : null, !hasExp ? "Experiência" : null, !hasEdu ? "Formação" : null].filter(Boolean);
    checks.push({ status: "warn", label: "Seções padrão ausentes", tip: `Use títulos claros para: ${miss.join(", ")}.` });
  }

  if (skills.length >= 6) {
    score += 20;
    checks.push({ status: "ok", label: "Boa densidade de palavras-chave", tip: `${skills.length} habilidades técnicas/profissionais reconhecidas.` });
  } else if (skills.length >= 3) {
    score += 12;
    checks.push({ status: "warn", label: "Poucas palavras-chave técnicas", tip: "Detalhe mais ferramentas, linguagens e metodologias usadas nos projetos." });
  } else {
    score += 5;
    checks.push({ status: "fail", label: "Baixa cobertura de palavras-chave", tip: "Adicione uma seção explícita de Habilidades com termos padrão do mercado." });
  }

  const hasMetrics = /(\d+\s*%|r\$\s*\d|\$\s*\d|\b\d+x\b|\b\d{2,}\s*(?:usuarios|clientes|projetos|mil|k|alunos|estudantes)\b)/.test(norm);
  const hasVerbs = ACTION_VERB_PATTERNS.filter((p) => p.test(norm)).length >= 2;
  if (hasMetrics && hasVerbs) {
    score += 20;
    checks.push({ status: "ok", label: "Impacto mensurável e verbos de ação", tip: "Ótimo uso de métricas e verbos de conquista nas experiências." });
  } else if (hasVerbs) {
    score += 12;
    checks.push({ status: "warn", label: "Faltam resultados quantificados", tip: "Adicione números e métricas (ex: 'reduziu latência em 35%', 'atendeu 50 mil usuários')." });
  } else {
    score += 6;
    checks.push({ status: "warn", label: "Experiências muito descritivas", tip: "Comece os tópicos com verbos de ação (Desenvolveu, Otimizou, Liderou) e métricas." });
  }

  const placeholders = norm.match(/\[(?:inserir|confirmar|ajustar|informar|digite|seu\s+|preencher)[^\]]*\]/g) || [];
  if (placeholders.length) {
    score = Math.max(score - 10, 0);
    checks.push({
      status: "warn",
      label: `${placeholders.length} campo(s) de modelo não preenchido(s)`,
      tip: "Remova ou preencha instruções entre colchetes como '[Inserir mês/ano...]' antes de enviar o currículo.",
    });
  }

  const level = score >= 85 ? "Excelente" : score >= 65 ? "Bom" : "Precisa de Ajustes";
  return { score: Math.min(score, 100), level, checks };
}

export function buildAtsImprovementPlan({
  rawText,
  pages = 1,
  wordCount = 0,
  skills = [],
  suggestedRoles = [],
  seniority = "Pleno",
  email = null,
  phone = null,
  linkedin = null,
  github = null,
  skillGaps = [],
}) {
  const wc = wordCount || String(rawText || "").split(/\s+/).filter(Boolean).length;
  const audit = evaluateAtsReadiness({ rawText, pages, wordCount: wc, skills, email, phone, linkedin, github });
  const norm = normalizeText(rawText);
  const modifications = [];

  const bracketPh = rawText.match(/\[(?:inserir|confirmar|ajustar|informar|digite|seu\s+|preencher)[^\]]*\]/gi) || [];
  const brokenPh = rawText.match(/\[\d{8,13}(?!\])/g) || [];
  const allPh = [...bracketPh, ...brokenPh];
  if (allPh.length) {
    modifications.push({
      priority: "Alta",
      category: "Campos de Modelo / Placeholders",
      issue: `Foram encontrados ${allPh.length} trecho(s) inacabado(s) ou com colchetes no PDF.`,
      found_items: allPh.slice(0, 8),
      action: "Substitua cada instrução entre colchetes por dados reais e remova colchetes soltos (ex.: '[31984359511' -> '(31) 98435-9511').",
      before_example: allPh[0],
      after_example: "(31) 98435-9511 | Fev/2021 – Atual | Remoto ou Híbrido",
      impact_points: 10,
    });
  }

  if (/(?:[•\*\-]\s*){2,}/.test(rawText)) {
    modifications.push({
      priority: "Média",
      category: "Formatação & Limpeza ATS",
      issue: "Foram detectados marcadores (bullets) duplicados (ex.: '• •'), que podem quebrar o parser de alguns sistemas ATS.",
      found_items: ["Marcador duplicado ('• •' ou '- -')"],
      action: "Padronize todos os tópicos com um único marcador simples ('• ' ou '- ') e evite tabelas ou colunas duplas.",
      before_example: "• • Análise, levantamento e modelagem de requisitos e sistemas.",
      after_example: "• Análise, levantamento e modelagem de requisitos e sistemas.",
      impact_points: 4,
    });
  }

  const missingContacts = [];
  if (!email) missingContacts.push("E-mail profissional");
  if (!phone) missingContacts.push("Telefone com DDD no formato (XX) 9XXXX-XXXX");
  if (!linkedin) missingContacts.push("URL do LinkedIn (linkedin.com/in/seu-perfil)");
  if (missingContacts.length) {
    modifications.push({
      priority: "Alta",
      category: "Cabeçalho & Contatos",
      issue: `Faltam informações importantes de contato: ${missingContacts.join(", ")}.`,
      found_items: missingContacts,
      action: "Coloque nome completo, cidade/estado, telefone com DDD, e-mail e LinkedIn em texto selecionável no topo da página 1.",
      before_example: "Cabeçalho incompleto",
      after_example: "Belo Horizonte - MG | (31) 98435-9511 | email@dominio.com | linkedin.com/in/seuperfil",
      impact_points: 10,
    });
  } else if (phone && /^\d{10,11}$/.test(phone)) {
    const fmt = phone.length === 11 ? `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}` : `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
    modifications.push({
      priority: "Recomendada",
      category: "Padronização de Telefone",
      issue: `O telefone '${phone}' está sem formatação padrão (DDD e hífen).`,
      found_items: [phone],
      action: `Formate o número como '${fmt}' para facilitar leitura humana e de parsers ATS.`,
      before_example: phone,
      after_example: fmt,
      impact_points: 2,
    });
  }

  const hasExp = ["experiencia", "experience", "historico profissional"].some((k) => norm.includes(k));
  const hasEdu = ["formacao", "educacao", "education", "academica"].some((k) => norm.includes(k));
  const hasSum = ["resumo", "objetivo", "sobre", "summary", "profile"].some((k) => norm.includes(k));
  const missingSec = [!hasSum ? "RESUMO PROFISSIONAL" : null, !hasExp ? "EXPERIÊNCIA PROFISSIONAL" : null, !hasEdu ? "FORMAÇÃO ACADÊMICA" : null].filter(Boolean);
  if (missingSec.length) {
    modifications.push({
      priority: "Alta",
      category: "Estrutura de Seções ATS",
      issue: `Seções padrão ausentes ou com títulos não reconhecidos: ${missingSec.join(", ")}.`,
      found_items: missingSec,
      action: "Use títulos padronizados em caixa alta (RESUMO PROFISSIONAL, EXPERIÊNCIA PROFISSIONAL, CONHECIMENTOS TÉCNICOS, FORMAÇÃO ACADÊMICA).",
      before_example: "Títulos criativos ou ausentes",
      after_example: missingSec.join(" · "),
      impact_points: 12,
    });
  }

  const hasMetrics = /(\d+\s*%|r\$\s*\d|\$\s*\d|\b\d+x\b|\b\d{2,}\s*(?:usuarios|clientes|projetos|mil|k|alunos|estudantes)\b)/.test(norm);
  const passivePhrases = rawText.match(/(?:atua[cç][aã]o\s+em|apoio\s+[aà]|planejamento\s+e\s+desenvolvimento|condu[cç][aã]o\s+de|cria[cç][aã]o\s+de)[^.\n]{0,70}/gi) || [];
  if (!hasMetrics) {
    modifications.push({
      priority: "Alta",
      category: "Resultados Mensuráveis & Verbos de Ação",
      issue: "O currículo não possui métricas quantificadas (%, volume de usuários/alunos, redução de tempo/riscos).",
      found_items: passivePhrases.length ? passivePhrases.slice(0, 3).map((s) => s.trim()) : ["Nenhuma métrica numérica detectada"],
      action: "Reescreva os tópicos de experiência no formato 'Verbo de Ação + Tecnologia/Método + Impacto Numérico'.",
      before_example: passivePhrases[0] ? passivePhrases[0].trim() : "Atuação em projetos de tecnologia e análise de dados.",
      after_example: "Desenvolveu e conduziu 12+ projetos práticos em Python e SQL para mais de 150 estudantes, elevando o aproveitamento técnico em 30%.",
      impact_points: 8,
    });
  }

  if (!(pages >= 1 && pages <= 2 && wc >= 120 && wc <= 1400)) {
    modifications.push({
      priority: "Média",
      category: "Extensão do Documento",
      issue: `Currículo com ${pages} página(s) e ${wc} palavras (ideal: 1–2 páginas e 150–1200 palavras).`,
      found_items: [`${pages} página(s)`, `${wc} palavras`],
      action: "Mantenha o currículo objetivo em 1 a 2 páginas, priorizando os resultados mais relevantes ao cargo-alvo.",
      before_example: `${pages} página(s) / ${wc} palavras`,
      after_example: "1 a 2 páginas / 350 a 900 palavras",
      impact_points: 10,
    });
  }

  const topGaps = (skillGaps || []).slice(0, 5).map((g) => g.skill).filter(Boolean);
  if (skills.length < 6 || topGaps.length) {
    const gapTxt = topGaps.length ? topGaps.join(", ") : "Docker, AWS, Linux, REST API";
    modifications.push({
      priority: skills.length < 6 ? "Alta" : "Média",
      category: "Palavras-Chave & Aderência às Vagas",
      issue: topGaps.length ? `As top vagas compatíveis com seu perfil pedem frequentemente: ${gapTxt}.` : `Apenas ${skills.length} habilidade(s) técnica(s) detectada(s).`,
      found_items: topGaps.length ? topGaps : [`${skills.length} skill(s) detectada(s)`],
      action: "Adicione uma seção explícita de HABILIDADES TÉCNICAS usando exatamente os termos padrão do mercado que você realmente domina.",
      before_example: "Tecnologias citadas apenas de forma genérica no texto corrido",
      after_example: `Habilidades Técnicas: ${[...skills.slice(0, 6), ...topGaps.slice(0, 3)].slice(0, 9).join(", ")}`,
      impact_points: skills.length < 6 ? 8 : 4,
    });
  }

  const targetRole = suggestedRoles[0] || "Especialista em Tecnologia";
  modifications.push({
    priority: "Recomendada",
    category: "Título Alinhado ao Cargo-Alvo",
    issue: "Sistemas ATS dão peso maior quando o título logo abaixo do seu nome coincide com o nome da vaga.",
    found_items: suggestedRoles.slice(0, 3),
    action: `Adapte a linha de título no topo do currículo para refletir a vaga desejada (ex.: '${targetRole} | ${seniority}').`,
    before_example: "Título genérico com muitas áreas amplas",
    after_example: `${targetRole} (${seniority}) | ${skills.slice(0, 4).join(" · ")}`,
    impact_points: 3,
  });

  const projectedScore = Math.min(100, audit.score + modifications.reduce((acc, m) => acc + m.impact_points, 0));
  const fmtPhone = phone && /^\d{11}$/.test(phone) ? `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}` : (phone || "(XX) 9XXXX-XXXX");
  const contactLine = [fmtPhone, email || "seu.email@dominio.com", linkedin || "linkedin.com/in/seu-perfil", github].filter(Boolean).join(" | ");
  const atsTemplate = [
    "[SEU NOME COMPLETO]",
    `${targetRole} (${seniority}) | ${skills.length ? skills.slice(0, 4).join(" · ") : "Sua Área Principal"}`,
    `Cidade - UF | ${contactLine}`,
    "",
    "RESUMO PROFISSIONAL",
    `Profissional nível ${seniority} com foco em ${targetRole}, atuando com ${skills.length ? skills.slice(0, 6).join(", ") : "tecnologias da área"}. Orientado(a) a resultados mensuráveis, qualidade de entrega e resolução de problemas complexos.`,
    "",
    "HABILIDADES TÉCNICAS",
    skills.length ? skills.join(", ") : "Liste aqui suas principais ferramentas, linguagens e metodologias.",
    "",
    "EXPERIÊNCIA PROFISSIONAL",
    "Cargo | Nome da Empresa | Mês/Ano – Atual",
    "• [Verbo de ação] + [o que construiu/implementou com suas skills] + [resultado numérico: %, tempo reduzido ou volume atendido].",
    "• [Verbo de ação] + [projeto ou processo liderado] + [impacto mensurável].",
    "",
    "FORMAÇÃO ACADÊMICA",
    "Nome do Curso – Instituição | Ano de conclusão (ou previsão)",
    "",
    "IDIOMAS",
    "Português (Nativo) | Inglês (Informe o nível real: Básico / Intermediário / Avançado)",
  ].join("\n");

  return {
    current_score: audit.score,
    current_level: audit.level,
    projected_score: projectedScore,
    total_modifications: modifications.length,
    modifications,
    ats_template: atsTemplate,
  };
}

export function recommendCourses(skillGaps = [], candidateSkills = [], suggestedRoles = [], limit = 5) {
  const recs = [];
  const seen = new Set();
  for (const gap of skillGaps || []) {
    const c = COURSE_CATALOG[gap.skill];
    if (c && !seen.has(c.title)) {
      seen.add(c.title);
      recs.push({ target_skill: gap.skill, demand_pct: gap.demand_pct || 0, ...c });
    }
    if (recs.length >= limit) return recs;
  }
  const roleTxt = normalizeText((suggestedRoles || []).join(" "));
  const fallbacks = [];
  if (roleTxt.includes("ciberseguran")) fallbacks.push("Threat Hunting / YARA", "Segurança da Informação", "Linux", "AWS", "Docker");
  if (roleTxt.includes("dados") || roleTxt.includes("ia")) fallbacks.push("AWS", "LLM / IA Generativa", "ETL", "Power BI", "FastAPI");
  if (!fallbacks.length) fallbacks.push("AWS", "Docker", "Linux", "FastAPI", "LLM / IA Generativa");
  const candSet = new Set((candidateSkills || []).map((s) => s.toLowerCase()));
  for (const sk of fallbacks) {
    const c = COURSE_CATALOG[sk];
    if (!c || seen.has(c.title)) continue;
    seen.add(c.title);
    recs.push({ target_skill: sk, demand_pct: 0, is_upskill: candSet.has(sk.toLowerCase()), ...c });
    if (recs.length >= limit) break;
  }
  return recs;
}

export async function extractTextFromPdfFile(file) {
  const buffer = await file.arrayBuffer();
  const header = new TextDecoder("ascii").decode(new Uint8Array(buffer.slice(0, 8)));
  if (!header.trimStart().startsWith("%PDF-")) {
    throw new Error("O arquivo enviado não é um PDF válido (assinatura %PDF ausente).");
  }
  if (typeof window === "undefined" || typeof window.pdfjsLib === "undefined") {
    throw new Error("Biblioteca PDF.js não carregou. Verifique sua conexão com a internet.");
  }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pagesText = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = content.items.map((item) => item.str || "").join(" ").trim();
    if (line) pagesText.push(line);
  }
  const rawText = pagesText.join("\n").trim();
  if (!rawText) {
    throw new Error("Não foi possível extrair texto deste PDF. Verifique se não é apenas uma imagem escaneada.");
  }
  return { rawText, pages: pdf.numPages };
}

export const SAMPLE_RESUME_LINES = [
  "MARIANA SILVA - DESENVOLVEDORA FULL STACK PLENO",
  "Email: mariana.silva@exemplo.com.br | Tel: (11) 98765-4321 | linkedin.com/in/marianasilva",
  "Sao Paulo - SP | Disponivel para Remoto e Hibrido",
  " ",
  "RESUMO PROFISSIONAL",
  "Desenvolvedora Full Stack com 4 anos de experiencia na criacao de",
  "aplicacoes web escalaveis com Python, FastAPI, Django, React e TypeScript.",
  "Forte atuacao com PostgreSQL, Docker, AWS, CI/CD e metodologias ageis (Scrum).",
  " ",
  "EXPERIENCIA PROFISSIONAL",
  "Desenvolvedora Full Stack Pleno - TechBrasil Solucoes (2022 - 2026)",
  "- Desenvolveu APIs REST em Python (FastAPI / Flask) e Node.js atendendo 80 mil usuarios.",
  "- Otimizou consultas em PostgreSQL e cache Redis, reduzindo latencia em 42%.",
  "- Implementou interfaces modernas em React, TypeScript, Next.js e Tailwind CSS.",
  "- Automatizou pipelines CI/CD com GitHub Actions, Docker e deploy na AWS.",
  "- Garantiu 90% de cobertura de testes automatizados com Pytest.",
  " ",
  "FORMACAO ACADEMICA",
  "Bacharelado em Ciencia da Computacao - Universidade Estadual (2018 - 2022)",
  " ",
  "IDIOMAS",
  "Portugues (Nativo) | Ingles (Avancado)",
];

export function buildSamplePdfBlob() {
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const cmds = ["BT", "/F1 10.5 Tf", "45 770 Td", "15 TL"];
  SAMPLE_RESUME_LINES.forEach((line, idx) => {
    cmds.push(idx === 0 ? `(${esc(line)}) Tj` : `T* (${esc(line)}) Tj`);
  });
  cmds.push("ET");
  const stream = cmds.join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return new Blob([pdf], { type: "application/pdf" });
}
