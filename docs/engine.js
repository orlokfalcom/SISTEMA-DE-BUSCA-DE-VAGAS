/* VagaMatch PDF — Motor Client-Side para GitHub Pages (PDF.js + ATS + TF-IDF + Semântica) */
window.VagaMatchEngine = (() => {
  if (typeof pdfjsLib !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }

  const SKILL_CATALOG = {
    Python: [/\bpython\b/i],
    JavaScript: [/\bjavascript\b/i, /\bjs\b/i, /\becmascript\b/i],
    TypeScript: [/\btypescript\b/i, /\bts\b/i],
    Java: [/\bjava\b(?!script)/i],
    "C#": [/c#/i, /\bcsharp\b/i, /\.net\b/i, /\bdotnet\b/i],
    "C++": [/c\+\+/i, /\bcpp\b/i],
    Go: [/\bgolang\b/i, /\bgo\b(?=\s*[,/\-|]|\s+(?:developer|backend|dev))/i],
    Rust: [/\brust\b/i],
    PHP: [/\bphp\b/i],
    Ruby: [/\bruby\b/i],
    Kotlin: [/\bkotlin\b/i],
    Swift: [/\bswift\b/i],
    Dart: [/\bdart\b/i],
    SQL: [/\bsql\b/i, /\btsql\b/i, /\bpl\/sql\b/i],
    HTML: [/\bhtml5?\b/i],
    CSS: [/\bcss3?\b/i, /\bsass\b/i, /\bscss\b/i],
    React: [/\breact(?:\.?js)?\b/i],
    "Next.js": [/\bnext\.?js\b/i],
    "Vue.js": [/\bvue(?:\.?js)?\b/i],
    Angular: [/\bangular\b/i],
    "Tailwind CSS": [/\btailwind(?:\s*css)?\b/i],
    "React Native": [/\breact\s+native\b/i],
    Flutter: [/\bflutter\b/i],
    Android: [/\bandroid\b/i],
    iOS: [/\bios\b/i],
    "Node.js": [/\bnode(?:\.?js)?\b/i],
    Express: [/\bexpress(?:\.?js)?\b/i],
    NestJS: [/\bnest\.?js\b/i],
    Django: [/\bdjango\b/i],
    FastAPI: [/\bfastapi\b/i],
    Flask: [/\bflask\b/i],
    "Spring Boot": [/\bspring\s*boot\b/i, /\bspring\b/i],
    Laravel: [/\blaravel\b/i],
    "Ruby on Rails": [/\bruby\s+on\s+rails\b/i, /\brails\b/i],
    "REST API": [/\brest(?:ful)?\b/i, /\bapis?\s+rest\b/i],
    GraphQL: [/\bgraphql\b/i],
    Microsserviços: [/\bmicrosservi[cç]os\b/i, /\bmicroservices?\b/i],
    PostgreSQL: [/\bpostgres(?:ql)?\b/i],
    MySQL: [/\bmysql\b/i],
    SQLite: [/\bsqlite\b/i],
    MongoDB: [/\bmongo(?:db)?\b/i],
    NoSQL: [/\bnosql\b/i],
    Redis: [/\bredis\b/i],
    "SQL Server": [/\bsql\s*server\b/i],
    Oracle: [/\boracle\b/i],
    Elasticsearch: [/\belasticsearch\b/i],
    AWS: [/\baws\b/i, /\bamazon\s+web\s+services\b/i],
    Azure: [/\bazure\b/i],
    GCP: [/\bgcp\b/i, /\bgoogle\s+cloud\b/i],
    Docker: [/\bdocker\b/i],
    Kubernetes: [/\bkubernetes\b/i, /\bk8s\b/i],
    Terraform: [/\bterraform\b/i],
    DevOps: [/\bdevops\b/i],
    "CI/CD": [/\bci\s*\/\s*cd\b/i, /\bgithub\s+actions\b/i, /\bgitlab\s+ci\b/i, /\bjenkins\b/i, /\bintegra[cç][aã]o\s+cont[ií]nua\b/i],
    Linux: [/\blinux\b/i, /\bubuntu\b/i, /\bbash\b/i, /\bshell\s*script\b/i],
    Git: [/\bgit\b/i, /\bgithub\b/i, /\bgitlab\b/i],
    "Segurança da Informação": [/\bseguran[cç]a\s+da\s+informa[cç][aã]o\b/i, /\bcyber\s*security\b/i, /\bciberseguran[cç]a\b/i, /\binfosec\b/i],
    "Threat Hunting / YARA": [/\bthreat\s+hunting\b/i, /\byara\b/i, /\bsoc\b/i, /\bsiem\b/i],
    Pandas: [/\bpandas\b/i],
    NumPy: [/\bnumpy\b/i],
    Streamlit: [/\bstreamlit\b/i],
    "Machine Learning": [/\bmachine\s+learning\b/i, /\bscikit[- ]?learn\b/i, /\baprendizado\s+de\s+m[aá]quina\b/i],
    "Deep Learning": [/\bdeep\s+learning\b/i, /\bpytorch\b/i, /\btensorflow\b/i, /\bkeras\b/i],
    "LLM / IA Generativa": [/\bllms?\b/i, /\blangchain\b/i, /\bopenai\b/i, /\bia\s+generativa\b/i, /\bgenerative\s+ai\b/i, /\brag\b/i],
    "Apache Spark": [/\bspark\b/i, /\bpyspark\b/i],
    Airflow: [/\bairflow\b/i],
    "Power BI": [/\bpower\s*bi\b/i],
    Tableau: [/\btableau\b/i],
    Excel: [/\bexcel\b/i],
    ETL: [/\betl\b/i, /\belt\b/i, /\bdbt\b/i],
    "QA / Testes": [/\bqa\b/i, /\bquality\s+assurance\b/i, /\btestes?\s+automatizados?\b/i, /\bpytest\b/i, /\bjest\b/i],
    Cypress: [/\bcypress\b/i],
    Selenium: [/\bselenium\b/i],
    Playwright: [/\bplaywright\b/i],
    Figma: [/\bfigma\b/i],
    "UI/UX": [/\bui\s*\/\s*ux\b/i, /\bux\s*\/\s*ui\b/i, /\bux\s+design\b/i, /\bui\s+design\b/i, /\bdesign\s+system\b/i],
    "Product Management": [/\bproduct\s+manager\b/i, /\bproduct\s+owner\b/i, /\bgest[aã]o\s+de\s+produtos?\b/i, /\broadmap\b/i],
    "Scrum / Ágil": [/\bscrum\b/i, /\bkanban\b/i, /\bagile\b/i, /\bmetodologias?\s+[aá]geis\b/i],
    Jira: [/\bjira\b/i],
    "Marketing Digital": [/\bmarketing\s+digital\b/i, /\btr[aá]fego\s+pago\b/i, /\bgoogle\s+ads\b/i, /\bmeta\s+ads\b/i, /\bseo\b/i],
    CRM: [/\bcrm\b/i, /\bsalesforce\b/i, /\bhubspot\b/i, /\brd\s+station\b/i],
    "Vendas / Comercial": [/\bvendas\b/i, /\bcomercial\b/i, /\bb2b\b/i, /\bsdr\b/i, /\baccount\s+executive\b/i],
    "Finanças / Contabilidade": [/\bfinan[cç]as\b/i, /\bcontabilidade\b/i, /\bdre\b/i, /\bfluxo\s+de\s+caixa\b/i, /\bfp&a\b/i],
    SAP: [/\bsap\b/i, /\berp\b/i],
    "RH / Recrutamento": [/\brecursos\s+humanos\b/i, /\brecrutamento\b/i, /\bsele[cç][aã]o\b/i, /\bpeople\s+analytics\b/i],
  };

  const RELATED_SKILLS = {
    Python: ["Django", "FastAPI", "Flask", "Pandas", "NumPy"],
    Django: ["Python", "FastAPI", "Flask", "REST API"],
    FastAPI: ["Python", "Django", "Flask", "REST API"],
    Flask: ["Python", "FastAPI", "Django", "REST API"],
    React: ["Next.js", "TypeScript", "JavaScript", "Vue.js", "Angular"],
    "Next.js": ["React", "TypeScript", "JavaScript"],
    "Vue.js": ["React", "JavaScript", "TypeScript", "Angular"],
    Angular: ["TypeScript", "React", "Vue.js"],
    "Node.js": ["Express", "NestJS", "TypeScript", "JavaScript", "REST API"],
    Express: ["Node.js", "NestJS", "REST API"],
    NestJS: ["Node.js", "TypeScript", "Express", "REST API"],
    PostgreSQL: ["SQL", "MySQL", "SQLite", "SQL Server", "Oracle"],
    MySQL: ["SQL", "PostgreSQL", "SQLite", "SQL Server"],
    SQLite: ["SQL", "PostgreSQL", "MySQL"],
    "SQL Server": ["SQL", "PostgreSQL", "MySQL"],
    AWS: ["Azure", "GCP", "Docker", "Terraform", "DevOps"],
    Azure: ["AWS", "GCP", "Docker", "DevOps"],
    GCP: ["AWS", "Azure", "Docker", "DevOps"],
    Docker: ["Kubernetes", "CI/CD", "Linux", "DevOps"],
    Kubernetes: ["Docker", "AWS", "GCP", "Azure", "Terraform", "DevOps"],
    DevOps: ["Docker", "Kubernetes", "CI/CD", "Linux", "AWS"],
    "Segurança da Informação": ["Threat Hunting / YARA", "Linux", "Python", "DevOps"],
    "Threat Hunting / YARA": ["Segurança da Informação", "Python", "Rust", "Linux"],
    Streamlit: ["Python", "Pandas", "Power BI"],
    "Power BI": ["Tableau", "Excel", "SQL"],
    Tableau: ["Power BI", "SQL", "Excel"],
    Cypress: ["Playwright", "Selenium", "QA / Testes"],
    Playwright: ["Cypress", "Selenium", "QA / Testes"],
    Selenium: ["Cypress", "Playwright", "QA / Testes"],
    Flutter: ["Dart", "React Native", "Android", "iOS"],
    "React Native": ["React", "Flutter", "Android", "iOS"],
    "Machine Learning": ["Deep Learning", "Python", "Pandas", "NumPy", "LLM / IA Generativa"],
    "Deep Learning": ["Machine Learning", "Python", "LLM / IA Generativa"],
    "LLM / IA Generativa": ["Python", "Machine Learning", "FastAPI"],
  };

  const ROLE_PROFILES = {
    "Desenvolvedor Full Stack": ["React", "Node.js", "TypeScript", "JavaScript", "PostgreSQL", "Next.js", "HTML", "CSS", "REST API"],
    "Desenvolvedor Backend": ["Python", "Java", "C#", "Go", "Node.js", "Django", "FastAPI", "Flask", "Spring Boot", "PostgreSQL", "Docker", "Microsserviços", "REST API", "SQL"],
    "Desenvolvedor Frontend": ["React", "Vue.js", "Angular", "Next.js", "TypeScript", "JavaScript", "HTML", "CSS", "Tailwind CSS", "Figma"],
    "Engenheiro de Dados / Analytics": ["Python", "SQL", "Apache Spark", "Airflow", "ETL", "AWS", "GCP", "Azure", "PostgreSQL", "Pandas"],
    "Cientista de Dados / IA": ["Python", "Machine Learning", "Deep Learning", "Pandas", "NumPy", "LLM / IA Generativa", "SQL"],
    "Analista de Dados / BI": ["SQL", "Power BI", "Tableau", "Excel", "Python", "ETL"],
    "Engenheiro DevOps / Cloud": ["AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux", "DevOps"],
    "Engenheiro / Analista de Cibersegurança": ["Segurança da Informação", "Threat Hunting / YARA", "Python", "Rust", "Linux", "SQL", "DevOps"],
    "Desenvolvedor Mobile": ["React Native", "Flutter", "Kotlin", "Swift", "Android", "iOS", "Dart"],
    "Engenheiro de QA": ["QA / Testes", "Cypress", "Selenium", "Playwright", "CI/CD", "JavaScript", "Python"],
    "Product Designer (UI/UX)": ["Figma", "UI/UX", "HTML", "CSS", "Product Management"],
    "Product Manager / PO": ["Product Management", "Scrum / Ágil", "Jira", "SQL", "Power BI"],
    "Analista de Marketing Digital": ["Marketing Digital", "CRM", "Excel", "Power BI"],
    "Analista Financeiro / Administrativo": ["Finanças / Contabilidade", "Excel", "Power BI", "SAP"],
    "Executivo Comercial / Vendas": ["Vendas / Comercial", "CRM", "Excel"],
  };

  const ACTION_VERB_PATTERNS = [
    /\bdesenvolv\w*/, /\blider\w*/, /\bcri(?:ou|ei|ando|acao|ar)\b/, /\bimplement\w*/,
    /\botimiz\w*/, /\breduz\w*/, /\baument\w*/, /\bgerenci\w*/, /\barquitet\w*/,
    /\bautomatiz\w*/, /\bcoord\w*/, /\bconstru\w*/, /\bentreg\w*/, /\bprojet(?:ou|ei|ando|ar)\b/,
    /\bmigr\w*/, /\bconduz\w*/, /\bplanej\w*/,
    /\bbuilt\b/, /\bled\b/, /\bdeveloped\b/, /\bimplemented\b/, /\boptimized\b/,
    /\breduced\b/, /\bincreased\b/, /\bmanaged\b/,
  ];

  const STOPWORDS = new Set([
    "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "para", "por",
    "com", "sem", "que", "uma", "um", "uns", "umas", "como", "mais", "menos", "sobre",
    "entre", "ate", "apos", "ser", "ter", "fazer", "the", "and", "for", "with", "that",
    "this", "from", "are", "you", "your", "our", "will", "have", "has", "not", "all",
    "vaga", "empresa", "equipe", "time", "atuar", "experiencia", "conhecimento",
  ]);

  const SENIORITY_RANK = {
    "Estágio / Trainee": 1,
    "Júnior": 2,
    Pleno: 3,
    "Sênior": 4,
    "Sênior / Liderança": 5,
  };

  const SAMPLE_RESUME_LINES = [
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

  const cache = new Map();
  const CACHE_TTL_MS = 300000;

  function normalizeText(text) {
    return String(text || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function extractSkills(text) {
    const found = [];
    for (const [skill, patterns] of Object.entries(SKILL_CATALOG)) {
      if (patterns.some((re) => re.test(text))) {
        found.push(skill);
      }
    }
    return found;
  }

  function estimateExperienceYears(text) {
    const explicit = [
      ...text.matchAll(/(\d{1,2})\s*\+?\s*(?:anos?|years?)\s+(?:de\s+(?:experi[eê]ncia|atua[cç][aã]o|carreira|trajet[oó]ria|ti)|of\s+experience)/gi),
      ...text.matchAll(/(?:trajet[oó]ria|experi[eê]ncia|atua[cç][aã]o|carreira)[^.\n]{0,35}?\b(\d{1,2})\s*\+?\s*(?:anos?|years?)\b/gi),
    ]
      .map((m) => parseInt(m[1], 10))
      .filter((n) => n > 0 && n <= 40);
    if (explicit.length) return Math.max(...explicit);

    const currentYear = new Date().getFullYear();
    let expSection = text;
    const secMatch = text.match(
      /(?:experi[eê]ncia(?:\s+profissional)?|hist[oó]rico\s+profissional|work\s+experience)([\s\S]*?)(?:forma[cç][aã]o|educa[cç][aã]o|idiomas|certifica[cç][oõ]es|$)/i
    );
    if (secMatch && secMatch[1].trim().length > 30) {
      expSection = secMatch[1];
    }

    const ranges = [...expSection.matchAll(/\b(199\d|20[0-2]\d)\s*[-–—aà]+\s*(199\d|20[0-2]\d|atual|presente|present|current)\b/gi)];
    if (ranges.length) {
      const starts = [];
      const ends = [];
      for (const r of ranges) {
        const s = parseInt(r[1], 10);
        const e = /^\d+$/.test(r[2]) ? parseInt(r[2], 10) : currentYear;
        if (s >= 1990 && s <= currentYear && s <= e && e <= currentYear + 1) {
          starts.push(s);
          ends.push(Math.min(e, currentYear));
        }
      }
      if (starts.length && ends.length) {
        const span = Math.max(...ends) - Math.min(...starts);
        if (span > 0 && span <= 35) return span;
      }
    }
    return null;
  }

  function detectSeniority(text, years) {
    const lower = normalizeText(text);
    if (/\b(tech\s+lead|staff|principal|especialista|arquiteto|head\s+de|gerente|coordenador)\b/.test(lower)) {
      return "Sênior / Liderança";
    }
    if (/\b(senior|sr\.?)\b/.test(lower)) return "Sênior";
    if (years !== null && years >= 6) return "Sênior";
    if (/\b(pleno|mid[- ]?level)\b/.test(lower)) return "Pleno";
    if (years !== null && years >= 3) return "Pleno";
    if (/\b(estagiario|estagio|intern|trainee)\b/.test(lower)) return "Estágio / Trainee";
    if (/\b(junior|jr\.?)\b/.test(lower)) return "Júnior";

    if (years !== null) {
      if (years >= 1) return "Júnior";
      return "Estágio / Trainee";
    }
    return "Pleno";
  }

  function suggestRoles(skills, text) {
    const skillSet = new Set(skills);
    const normText = normalizeText(text);
    const scored = [];

    for (const [role, expected] of Object.entries(ROLE_PROFILES)) {
      const overlap = expected.filter((s) => skillSet.has(s)).length;
      if (overlap === 0) continue;
      let score = overlap / Math.max(expected.length * 0.5, 1);
      const roleWords = normalizeText(role).split(" ").filter((w) => w.length > 3);
      if (roleWords.some((w) => normText.includes(w))) score += 0.35;
      scored.push([score, role]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.length ? scored.slice(0, 3).map((s) => s[1]) : ["Profissional de Tecnologia / Geral"];
  }

  function detectLanguages(text) {
    const lower = normalizeText(text);
    const map = {
      "Português": ["portugues", "nativo"],
      "Inglês": ["ingles", "english", "toefl", "ielts", "cambridge"],
      Espanhol: ["espanhol", "spanish"],
      "Francês": ["frances", "french"],
      "Alemão": ["alemao", "german"],
    };
    return Object.entries(map)
      .filter(([, kws]) => kws.some((k) => lower.includes(k)))
      .map(([lang]) => lang);
  }

  function detectEducation(text) {
    const lower = normalizeText(text).replace(/\bengenharia\s+de\s+prompts?\b/g, "");
    const map = {
      Doutorado: [/\bdoutorado\b/, /\bphd\b/, /\bph\.d\b/],
      Mestrado: [/\bmestrado\b/, /\bmaster\b/, /\bm\.sc\b/],
      "Pós-graduação / MBA": [/\bpos[- ]graduacao\b/, /\bmba\b/, /\bespecializacao\b/],
      "Ensino Superior": [
        /\bbacharelado\b/, /\bgraduacao\b/, /\btecnologo\b/, /\blicenciatura\b/,
        /\bcurso\s+superior\b/, /\bensino\s+superior\b/, /\bcst\b/,
        /\banalise\s+e\s+desenvolvimento\s+de\s+sistemas\b/, /\bciencia\s+da\s+computacao\b/,
        /\bengenharia\b/, /\bsistemas\s+de\s+informacao\b/, /\badministracao\b/,
      ],
      "Curso Técnico": [/\btecnico\s+em\b/, /\bensino\s+tecnico\b/],
    };
    return Object.entries(map)
      .filter(([, patterns]) => patterns.some((p) => p.test(lower)))
      .map(([label]) => label);
  }

  function evaluateAtsReadiness({ rawText, pages, wordCount, skills, email, phone, linkedin, github }) {
    const norm = normalizeText(rawText);
    const checks = [];
    let score = 0;

    if (pages >= 1 && pages <= 2 && wordCount >= 120 && wordCount <= 1400) {
      score += 20;
      checks.push({ status: "ok", label: "Extensão ideal para ATS", tip: `${pages} página(s) e ${wordCount} palavras — leitura rápida por recrutadores e ATS.` });
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
      const miss = [
        !hasSum ? "Resumo" : null,
        !hasExp ? "Experiência" : null,
        !hasEdu ? "Formação" : null,
      ].filter(Boolean);
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

    const hasMetrics = /(\d+\s*%|r\$\s*\d|\$\s*\d|\b\d+x\b|\b\d{2,}\s*(?:usuarios|clientes|projetos|mil|k)\b)/.test(norm);
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

  async function extractTextFromPdfFile(file) {
    const buffer = await file.arrayBuffer();
    const header = new TextDecoder("ascii").decode(new Uint8Array(buffer.slice(0, 8)));
    if (!header.trimStart().startsWith("%PDF-")) {
      throw new Error("O arquivo enviado não é um PDF válido (assinatura %PDF ausente).");
    }
    if (typeof pdfjsLib === "undefined") {
      throw new Error("Biblioteca PDF.js não carregou. Verifique sua conexão com a internet.");
    }
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
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

  function detectCountry(text) {
    const lower = normalizeText(text);
    const brSignals = [
      /\bbrasil\b/, /\bbrazil\b/, /\+55\b/,
      /\b(belo\s+horizonte|sao\s+paulo|rio\s+de\s+janeiro|curitiba|porto\s+alegre|campinas|florianopolis|recife|salvador|brasilia|fortaleza|goiania|minas\s+gerais)\b/,
      /[-–—]\s*(sp|rj|mg|rs|pr|sc|ba|pe|ce|df|go|es|pa|am)\b/,
    ];
    if (brSignals.some((re) => re.test(lower))) return "Brasil";
    if (/\b(portugal|lisboa|porto|\+351)\b/.test(lower)) return "Portugal";
    if (/\b(united\s+states|estados\s+unidos|new\s+york|san\s+francisco|california)\b/.test(lower)) return "Estados Unidos";
    if (/\b(united\s+kingdom|london|reino\s+unido)\b/.test(lower)) return "Reino Unido";
    if (/\b(germany|deutschland|berlin|munich|alemanha)\b/.test(lower)) return "Alemanha";
    if (/\b(canada|toronto|vancouver|montreal)\b/.test(lower)) return "Canadá";
    return "Brasil";
  }

  function classifyGeoPriority(job, userCountry = "Brasil") {
    const countryNorm = normalizeText(userCountry || "Brasil");
    const hay = normalizeText(`${job.location || ""} ${job.source || ""} ${job.company_origin || ""}`);
    const brSignals = [
      "brasil", "brazil", "sao paulo", "belo horizonte", "rio de janeiro",
      "curitiba", "porto alegre", "campinas", "florianopolis", "recife",
      "goiania", "base brasil", "github br", ", sp", ", rj", ", mg", ", rs", ", pr",
    ];
    const isUserCountry = countryNorm === "brasil" ? brSignals.some((s) => hay.includes(s)) : (countryNorm && hay.includes(countryNorm));
    if (isUserCountry) {
      return { scope: "local_country", label: `${countryNorm === "brasil" ? "🇧🇷" : "📍"} ${userCountry}`, bonus: 7 };
    }
    const globalSignals = ["anywhere", "worldwide", "remoto global", "latam", "south america", "americas", "global"];
    if (globalSignals.some((s) => hay.includes(s))) {
      return { scope: "global_remote", label: "🌎 Global / LATAM", bonus: 2 };
    }
    return { scope: "international", label: "🌐 Internacional", bonus: 0 };
  }

  function parseResumeText(rawText, filename, pages = 1) {
    const skills = extractSkills(rawText);
    const years = estimateExperienceYears(rawText);
    const seniority = detectSeniority(rawText, years);
    const suggestedRoles = suggestRoles(skills, rawText);
    const languages = detectLanguages(rawText);
    const education = detectEducation(rawText);
    const country = detectCountry(rawText);

    const email = (rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) || [])[0] || null;
    const phone = (rawText.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\d{4}|\d{4})[-.\s]?\d{4}/) || [])[0] || null;
    const linkedin = (rawText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+/i) || [])[0] || null;
    const github = (rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9\-_]+/i) || [])[0] || null;

    const wordCount = rawText.split(/\s+/).filter(Boolean).length;
    const atsAudit = evaluateAtsReadiness({ rawText, pages, wordCount, skills, email, phone, linkedin, github });

    return {
      filename,
      pages,
      word_count: wordCount,
      skills,
      suggested_roles: suggestedRoles,
      seniority,
      estimated_years: years,
      languages,
      education,
      email,
      phone: phone ? phone.trim() : null,
      linkedin,
      github,
      country,
      ats_audit: atsAudit,
      raw_text: rawText,
    };
  }

  function tokenize(text) {
    const norm = normalizeText(text);
    const matches = norm.match(/[a-z0-9+#]{2,}/g) || [];
    return matches.filter((t) => !STOPWORDS.has(t));
  }

  function countTokens(tokens) {
    const map = new Map();
    for (const t of tokens) map.set(t, (map.get(t) || 0) + 1);
    return map;
  }

  function computeIdf(docMaps) {
    const total = Math.max(docMaps.length, 1);
    const df = new Map();
    for (const m of docMaps) {
      for (const term of m.keys()) df.set(term, (df.get(term) || 0) + 1);
    }
    const idf = new Map();
    for (const [term, freq] of df.entries()) {
      idf.set(term, Math.log((total + 1) / (freq + 1)) + 1.0);
    }
    return idf;
  }

  function tfidfCosine(mapA, mapB, idf) {
    if (!mapA.size || !mapB.size) return 0;
    const weight = (t, tf) => (1 + Math.log(tf)) * (idf.get(t) || 1);
    let dot = 0;
    for (const [k, v] of mapA.entries()) {
      if (mapB.has(k)) dot += weight(k, v) * weight(k, mapB.get(k));
    }
    if (!dot) return 0;
    let normA = 0;
    let normB = 0;
    for (const [k, v] of mapA.entries()) normA += weight(k, v) ** 2;
    for (const [k, v] of mapB.entries()) normB += weight(k, v) ** 2;
    return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
  }

  function parseSalaryValue(salaryStr) {
    if (!salaryStr) return 0;
    const nums = [];
    for (const m of salaryStr.matchAll(/(\d+(?:[.,]\d+)?)\s*k\b/gi)) {
      const val = Math.round(parseFloat(m[1].replace(",", ".")) * 1000);
      if (!Number.isNaN(val)) nums.push(val);
    }
    for (const m of salaryStr.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d{4,6})/g)) {
      const cleaned = m[1].replace(/[.,]/g, "");
      if (/^\d+$/.test(cleaned)) nums.push(parseInt(cleaned, 10));
    }
    return nums.length ? Math.max(...nums) : 0;
  }

  function postedSortKey(postedAt) {
    const val = String(postedAt || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(val) ? `1:${val}` : "0:";
  }

  function seniorityScore(cSen, jSen) {
    const diff = Math.abs((SENIORITY_RANK[cSen] || 3) - (SENIORITY_RANK[jSen] || 3));
    if (diff === 0) return 1.0;
    if (diff === 1) return 0.72;
    if (diff === 2) return 0.4;
    return 0.15;
  }

  function matchJobs({
    jobs,
    candidateSkills,
    candidateText = "",
    candidateSeniority = "Pleno",
    suggestedRoles = [],
    modalityFilter = "",
    seniorityFilter = "",
    searchQuery = "",
    minScore = 0,
    sortBy = "match",
    userCountry = "Brasil",
  }) {
    const cSkillMap = new Map(candidateSkills.map((s) => [s.toLowerCase(), s]));
    const relatedPool = new Set();
    for (const s of candidateSkills) {
      for (const rel of RELATED_SKILLS[s] || []) relatedPool.add(rel);
    }

    const cTokens = countTokens(tokenize(`${candidateText} ${candidateSkills.join(" ")} ${suggestedRoles.join(" ")}`));
    const roleTokens = new Set(tokenize(suggestedRoles.join(" ")));
    const jobCounters = jobs.map((j) =>
      countTokens(tokenize(`${j.title || ""} ${(j.skills || []).join(" ")} ${j.description || ""}`))
    );
    const idf = computeIdf([...jobCounters, cTokens]);

    const normQuery = searchQuery ? normalizeText(searchQuery) : "";
    const normMod = modalityFilter ? normalizeText(modalityFilter) : "";
    const normSen = seniorityFilter ? normalizeText(seniorityFilter) : "";

    const results = [];
    jobs.forEach((job, idx) => {
      if (normMod && !normalizeText(job.modality || "").includes(normMod)) return;
      if (normSen && !normalizeText(job.seniority || "").includes(normSen)) return;
      if (normQuery) {
        const hay = normalizeText(`${job.title} ${job.company} ${job.location} ${(job.skills || []).join(" ")} ${job.description}`);
        if (!hay.includes(normQuery)) return;
      }

      const jobSkills = job.skills || [];
      const matched = [];
      const rawMissing = [];
      for (const js of jobSkills) {
        if (cSkillMap.has(js.toLowerCase())) matched.push(js);
        else rawMissing.push(js);
      }
      const related = rawMissing.filter((s) => relatedPool.has(s));
      const missing = rawMissing.filter((s) => !related.includes(s));

      let skillScore = 0.25;
      if (jobSkills.length) {
        const hits = matched.length + 0.45 * related.length;
        const cov = Math.min(hits / jobSkills.length, 1);
        const breadth = Math.min(hits / 5, 1);
        skillScore = 0.72 * cov + 0.28 * breadth;
      }

      const textSim = Math.min(tfidfCosine(cTokens, jobCounters[idx], idf) * 2.4, 1);
      const senScore = seniorityScore(candidateSeniority, job.seniority || "Pleno");
      const titleTokens = tokenize(job.title || "");
      const roleScore = titleTokens.some((t) => roleTokens.has(t)) ? 1.0 : 0.35;

      const geo = classifyGeoPriority(job, userCountry);
      const weighted = 0.55 * skillScore + 0.22 * textSim + 0.13 * senScore + 0.10 * roleScore;
      const matchScore = Math.round(Math.min(Math.max(weighted * 100 + geo.bonus, 5), 99));
      if (matchScore < minScore) return;

      let reason = "Compatibilidade baseada no contexto geral do currículo e área de atuação";
      if (matched.length && related.length) {
        reason = `${matched.length} skill(s) exata(s) (${matched.slice(0, 3).join(", ")}) + ${related.length} relacionada(s) (${related.slice(0, 2).join(", ")})`;
      } else if (matched.length) {
        reason = `${matched.length} de ${Math.max(jobSkills.length, matched.length)} habilidades compatíveis (${matched.slice(0, 4).join(", ")})`;
      } else if (related.length) {
        reason = `Afinidade por ecossistema relacionado (${related.slice(0, 3).join(", ")})`;
      }

      const skillsTxt = matched.length ? matched.slice(0, 4).join(", ") : "minha experiência na área";
      const pitch = `Olá! Vi a oportunidade de ${job.title} na ${job.company} e acredito ter ótima aderência ao perfil (${candidateSeniority}), especialmente pela minha experiência prática com ${skillsTxt}. Fico à disposição para conversarmos sobre como posso contribuir com o time!`;

      results.push({
        ...job,
        match_score: matchScore,
        score_breakdown: {
          skills: Math.round(skillScore * 100),
          semantic: Math.round(textSim * 100),
          seniority: Math.round(senScore * 100),
          role: Math.round(roleScore * 100),
        },
        matched_skills: matched,
        related_skills: related.slice(0, 4),
        missing_skills: missing.slice(0, 6),
        match_reason: reason,
        geo_scope: geo.scope,
        geo_label: geo.label,
        salary_numeric: parseSalaryValue(job.salary || ""),
        pitch_suggestion: pitch,
      });
    });

    if (sortBy === "salary") {
      results.sort((a, b) => b.salary_numeric - a.salary_numeric || b.match_score - a.match_score);
    } else if (sortBy === "recent") {
      results.sort((a, b) => postedSortKey(b.posted_at).localeCompare(postedSortKey(a.posted_at)) || b.match_score - a.match_score);
    } else {
      results.sort((a, b) => b.match_score - a.match_score || b.matched_skills.length - a.matched_skills.length);
    }
    return results;
  }

  function computeSkillGaps(rankedJobs, topN = 12) {
    const sample = rankedJobs.slice(0, topN);
    if (!sample.length) return [];
    const counts = new Map();
    for (const j of sample) {
      for (const s of j.missing_skills || []) counts.set(s, (counts.get(s) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([skill, count]) => ({
        skill,
        demand_count: count,
        demand_pct: Math.round((count / sample.length) * 100),
      }));
  }

  function stripHtml(raw) {
    return String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  function inferJobSeniority(title) {
    const lower = String(title || "").toLowerCase();
    if (/(staff|principal|lead|head|architect|especialista)/.test(lower)) return "Sênior / Liderança";
    if (/(senior|sênior|sr\.|sr )/.test(lower)) return "Sênior";
    if (/(junior|júnior|jr\.|jr )/.test(lower)) return "Júnior";
    if (/(intern|estágio|estagio|trainee)/.test(lower)) return "Estágio / Trainee";
    return "Pleno";
  }

  async function loadLocalJobs() {
    if (cache.has("local")) return cache.get("local").data;
    const resp = await fetch("./data/local_jobs.json");
    const data = await resp.json();
    cache.set("local", { ts: Date.now(), data });
    return data;
  }

  async function fetchWithTimeout(url, ms = 4500) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error("HTTP error");
      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchRemotive(primarySkill = "") {
    const safe = String(primarySkill || "").replace(/[^a-zA-Z0-9\s.+]/g, "").trim();
    const key = `remotive:${safe.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

    try {
      const q = safe ? `&search=${encodeURIComponent(safe)}` : "";
      let payload = await fetchWithTimeout(`https://remotive.com/api/remote-jobs?limit=20${q}`);
      if (!(payload.jobs || []).length && safe) {
        payload = await fetchWithTimeout("https://remotive.com/api/remote-jobs?limit=20");
      }
      const jobs = (payload.jobs || []).slice(0, 20).map((item) => {
        const desc = stripHtml(item.description);
        const skills = extractSkills(`${item.title || ""} ${(item.tags || []).join(" ")} ${desc}`);
        return {
          id: `remotive-${item.id}`,
          title: item.title || "Vaga Remota",
          company: item.company_name || "Empresa Internacional",
          location: item.candidate_required_location || "Remoto Global",
          modality: "Remoto",
          seniority: inferJobSeniority(item.title),
          salary: item.salary || "A combinar",
          skills,
          description: desc.slice(0, 950) + (desc.length > 950 ? "..." : ""),
          url: item.url || "https://remotive.com",
          source: "Remotive (Ao Vivo)",
          posted_at: String(item.publication_date || "").slice(0, 10),
        };
      });
      cache.set(key, { ts: Date.now(), data: jobs });
      return jobs;
    } catch {
      return [];
    }
  }

  async function fetchArbeitnow() {
    const key = "arbeitnow";
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

    try {
      const payload = await fetchWithTimeout("https://www.arbeitnow.com/api/job-board-api");
      const jobs = (payload.data || []).slice(0, 20).map((item, idx) => {
        const desc = stripHtml(item.description);
        const skills = extractSkills(`${item.title || ""} ${(item.tags || []).join(" ")} ${desc}`);
        return {
          id: `arbeitnow-${item.slug || idx}`,
          title: item.title || "Tech Job",
          company: item.company_name || "Empresa",
          location: item.location || (item.remote ? "Remoto" : "Internacional"),
          modality: item.remote ? "Remoto" : "Presencial",
          seniority: inferJobSeniority(item.title),
          salary: "A combinar",
          skills,
          description: desc.slice(0, 950) + (desc.length > 950 ? "..." : ""),
          url: item.url || "https://www.arbeitnow.com",
          source: "Arbeitnow (Ao Vivo)",
          posted_at: item.created_at ? new Date(item.created_at * 1000).toISOString().slice(0, 10) : "",
        };
      });
      cache.set(key, { ts: Date.now(), data: jobs });
      return jobs;
    } catch {
      return [];
    }
  }

  function buildDeepSearchTerms(skills, roles, primarySkill) {
    const skillMap = {
      "Segurança da Informação": "security",
      "Threat Hunting / YARA": "cybersecurity",
      "LLM / IA Generativa": "ai",
      "Machine Learning": "machine learning",
      "QA / Testes": "qa",
      "Scrum / Ágil": "agile",
    };
    const terms = [];
    for (const s of skills || []) {
      const mapped = String(skillMap[s] || s).replace(/[^a-zA-Z0-9\s.+]/g, "").trim();
      if (mapped && !terms.some((t) => t.toLowerCase() === mapped.toLowerCase())) terms.push(mapped);
      if (terms.length >= 4) break;
    }
    const roleKeywords = [
      ["ciberseguranca", "cybersecurity"],
      ["cientista de dados", "data science"],
      ["engenheiro de dados", "data engineer"],
      ["devops", "devops"],
      ["full stack", "full stack"],
      ["backend", "backend"],
      ["frontend", "frontend"],
    ];
    for (const r of roles || []) {
      const nr = normalizeText(r);
      for (const [k, term] of roleKeywords) {
        if (nr.includes(k) && !terms.some((t) => t.toLowerCase() === term)) {
          terms.push(term);
          break;
        }
      }
    }
    if (!terms.length && primarySkill) {
      const safe = String(primarySkill).replace(/[^a-zA-Z0-9\s.+]/g, "").trim();
      if (safe) terms.push(safe);
    }
    return terms.length ? terms.slice(0, 4) : [""];
  }

  async function fetchJobicy(tag = "") {
    const safe = String(tag || "").replace(/[^a-zA-Z0-9\s-]/g, "").trim().toLowerCase();
    const key = `jobicy:${safe}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
    try {
      const q = safe ? `&tag=${encodeURIComponent(safe)}` : "";
      let payload = await fetchWithTimeout(`https://jobicy.com/api/v2/remote-jobs?count=20${q}`, 6000);
      if (!(payload.jobs || []).length && safe) {
        payload = await fetchWithTimeout("https://jobicy.com/api/v2/remote-jobs?count=20", 6000);
      }
      const jobs = (payload.jobs || []).slice(0, 20).map((item) => {
        const title = stripHtml(item.jobTitle || "Vaga Remota");
        const desc = stripHtml(item.jobDescription || item.jobExcerpt || "");
        const skills = extractSkills(`${title} ${(item.jobIndustry || []).join(" ")} ${desc}`);
        return {
          id: `jobicy-${item.id}`,
          title,
          company: stripHtml(item.companyName || "Empresa"),
          location: stripHtml(item.jobGeo || "Remoto Global"),
          modality: "Remoto",
          seniority: inferJobSeniority(`${title} ${item.jobLevel || ""}`),
          salary: "A combinar",
          skills,
          description: desc.slice(0, 950) + (desc.length > 950 ? "..." : ""),
          url: item.url || "https://jobicy.com",
          source: "Jobicy (Ao Vivo)",
          posted_at: String(item.pubDate || "").slice(0, 10),
        };
      });
      cache.set(key, { ts: Date.now(), data: jobs });
      return jobs;
    } catch {
      return [];
    }
  }

  async function fetchRemoteOk() {
    const key = "remoteok";
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
    try {
      const payload = await fetchWithTimeout("https://remoteok.com/api", 6000);
      const items = (Array.isArray(payload) ? payload : []).filter((x) => x && x.position).slice(0, 35);
      const jobs = items.map((item) => {
        const title = String(item.position || "Remote Tech Job").trim();
        const desc = stripHtml(item.description || "");
        const skills = extractSkills(`${title} ${(item.tags || []).join(" ")} ${desc}`);
        const sMin = Number(item.salary_min || 0);
        const sMax = Number(item.salary_max || 0);
        const salary = sMin && sMax ? `USD ${sMin.toLocaleString("en-US")} - ${sMax.toLocaleString("en-US")}` : sMax ? `USD ${sMax.toLocaleString("en-US")}` : "A combinar";
        return {
          id: `remoteok-${item.id}`,
          title,
          company: String(item.company || "Empresa Internacional"),
          location: String(item.location || "Remoto Global"),
          modality: "Remoto",
          seniority: inferJobSeniority(title),
          salary,
          skills,
          description: desc.slice(0, 950) + (desc.length > 950 ? "..." : ""),
          url: item.apply_url || item.url || "https://remoteok.com",
          source: "RemoteOK (Ao Vivo)",
          posted_at: String(item.date || "").slice(0, 10),
        };
      });
      cache.set(key, { ts: Date.now(), data: jobs });
      return jobs;
    } catch {
      return [];
    }
  }

  async function fetchGitHubBr(repo = "backend-br/vagas") {
    const key = `gh:${repo}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
    try {
      const issues = await fetchWithTimeout(`https://api.github.com/repos/${repo}/issues?state=open&per_page=20`, 6000);
      if (!Array.isArray(issues)) return [];
      const jobs = issues
        .filter((it) => !it.pull_request)
        .map((item) => {
          const title = String(item.title || "").trim();
          const body = stripHtml(item.body || "");
          const labels = (item.labels || []).map((l) => l.name || "");
          const norm = normalizeText(`${labels.join(" ")} ${title}`);
          const compM = title.match(/(?:\bna\b|\bno\b|@)\s+([^|\-\[\]]{2,45})$/i);
          const company = compM ? compM[1].trim() : `Comunidade ${repo.split("/")[0]}`;
          const modality = norm.includes("remoto") || norm.includes("remote") ? "Remoto" : norm.includes("hibrido") ? "Híbrido" : "Presencial";
          const locM = title.match(/\[([^\]]{2,35})\]/);
          const location = locM ? locM[1].trim() : modality === "Remoto" ? "Remoto (Brasil)" : "Brasil";
          return {
            id: `gh-${repo.replace("/", "-")}-${item.id}`,
            title,
            company,
            location,
            modality,
            seniority: inferJobSeniority(`${title} ${labels.join(" ")}`),
            salary: "A combinar",
            skills: extractSkills(`${title} ${labels.join(" ")} ${body}`),
            description: body.slice(0, 950) + (body.length > 950 ? "..." : ""),
            url: item.html_url || `https://github.com/${repo}/issues`,
            source: `GitHub BR (${repo.split("/")[0]})`,
            posted_at: String(item.created_at || "").slice(0, 10),
          };
        });
      cache.set(key, { ts: Date.now(), data: jobs });
      return jobs;
    } catch {
      return [];
    }
  }

  async function collectJobs({ sourceFilter = "all", primarySkill = "", includeLive = true, deepSearch = true, skills = [], suggestedRoles = [] }) {
    let jobs = [];
    const sources = { local_br: 0, remotive: 0, arbeitnow: 0, jobicy: 0, remoteok: 0, github_br: 0, deep_search: deepSearch };

    if (sourceFilter === "all" || sourceFilter === "local") {
      const local = await loadLocalJobs();
      jobs.push(...local);
      sources.local_br = local.length;
    }

    const shouldLive = sourceFilter === "live" || (includeLive && sourceFilter === "all");
    if (shouldLive) {
      const terms = deepSearch ? buildDeepSearchTerms(skills, suggestedRoles, primarySkill) : [primarySkill];
      const tasks = [
        ...terms.slice(0, deepSearch ? 3 : 1).map((t) => fetchRemotive(t).then((d) => ["remotive", d])),
        ...terms.slice(0, deepSearch ? 2 : 1).map((t) => fetchJobicy(t).then((d) => ["jobicy", d])),
        fetchArbeitnow().then((d) => ["arbeitnow", d]),
        fetchGitHubBr("backend-br/vagas").then((d) => ["github_br", d]),
      ];
      if (deepSearch) {
        tasks.push(fetchGitHubBr("qa-brasil/vagas").then((d) => ["github_br", d]));
        tasks.push(fetchRemoteOk().then((d) => ["remoteok", d]));
      }
      const batches = await Promise.all(tasks);
      for (const [key, data] of batches) {
        jobs.push(...data);
        sources[key] = (sources[key] || 0) + data.length;
      }
    }

    const seen = new Set();
    jobs = jobs.filter((j) => {
      const k = `${normalizeText(j.title)}::${normalizeText(j.company)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return { jobs, sources };
  }

  function buildExternalLinks(skills, roles, userCountry = "Brasil") {
    const query = (skills.slice(0, 3).join(" ") || roles[0] || "tecnologia").trim();
    const rawRole = roles[1] || roles[0] || query;
    const roleParts = rawRole.split("/").map((p) => p.trim()).filter(Boolean);
    const roleQuery = roleParts.sort((a, b) => b.length - a.length)[0] || query;
    const deepDork = `("${roleQuery}" OR "${query}") ("vaga" OR "remote" OR "remoto") ${userCountry}`;
    const compBrDork = `(site:gupy.io OR site:boards.greenhouse.io OR site:jobs.lever.co) ("${roleQuery}" OR "${query}") (${userCountry} OR "Remoto")`;
    const compGlobalDork = `(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com) ("${roleQuery}" OR "${query}") ("Remote" OR "LATAM" OR "Brazil")`;
    const enc = encodeURIComponent(query);
    const encRole = encodeURIComponent(roleQuery);
    const encDork = encodeURIComponent(deepDork);
    const encCountry = encodeURIComponent(userCountry);
    return [
      { portal: `Sites de Empresas (${userCountry})`, url: `https://www.google.com/search?q=${encodeURIComponent(compBrDork)}` },
      { portal: "Carreiras Diretas (Global)", url: `https://www.google.com/search?q=${encodeURIComponent(compGlobalDork)}` },
      { portal: "Google Jobs (Busca Profunda)", url: `https://www.google.com/search?q=${encDork}&ibp=htl;jobs` },
      { portal: "LinkedIn (Skills)", url: `https://www.linkedin.com/jobs/search/?keywords=${enc}&location=${encCountry}` },
      { portal: "LinkedIn (Cargo)", url: `https://www.linkedin.com/jobs/search/?keywords=${encRole}&location=${encCountry}` },
      { portal: "Gupy", url: `https://portal.gupy.io/job-search/term=${encRole}` },
      { portal: "Indeed Brasil", url: `https://br.indeed.com/jobs?q=${enc}&l=${encCountry}` },
      { portal: "Glassdoor Brasil", url: `https://www.glassdoor.com.br/Vaga/brasil-${encodeURIComponent(roleQuery.toLowerCase().replace(/\s+/g, "-"))}-vagas-SRCH_IL.0,6_IN36.htm` },
      { portal: "Programathor", url: `https://programathor.com.br/jobs?search=${enc}` },
      { portal: "InfoJobs", url: `https://www.infojobs.com.br/empregos.aspx?palabra=${encRole}` },
    ];
  }

  function compareCustomJob({ jobTitle, jobDescription, candidateSkills, candidateText, candidateSeniority, suggestedRoles }) {
    const inferredSeniority = (() => {
      const combined = normalizeText(`${jobTitle} ${String(jobDescription || "").slice(0, 300)}`);
      if (/\b(staff|principal|tech\s+lead|lead|head|architect|arquiteto|especialista)\b/.test(combined)) return "Sênior / Liderança";
      if (/\b(senior|sr\.?)\b/.test(combined)) return "Sênior";
      if (/\b(estagio|estagiario|intern|trainee)\b/.test(combined)) return "Estágio / Trainee";
      if (/\b(junior|jr\.?)\b/.test(combined)) return "Júnior";
      if (/\b(pleno|mid[- ]?level)\b/.test(combined)) return "Pleno";
      return candidateSeniority;
    })();
    const synthetic = {
      id: "custom-job",
      title: jobTitle || "Vaga Personalizada",
      company: "Vaga Colada",
      location: "Conforme descrição",
      modality: "Não informada",
      seniority: inferredSeniority,
      salary: "A combinar",
      skills: extractSkills(`${jobTitle} ${jobDescription}`),
      description: jobDescription,
      url: "#",
      source: "Comparação Direta",
      posted_at: "Hoje",
    };
    const matched = matchJobs({
      jobs: [synthetic],
      candidateSkills,
      candidateText,
      candidateSeniority,
      suggestedRoles,
    })[0];

    const tips = [];
    if (matched.missing_skills.length) {
      tips.push(`Se você possui experiência com ${matched.missing_skills.slice(0, 4).join(", ")}, mencione explicitamente no currículo com exemplos práticos.`);
    }
    if (matched.related_skills.length) {
      tips.push(`Você já tem base próxima em ${matched.related_skills.slice(0, 3).join(", ")} — destaque sua facilidade de transição.`);
    }
    if (matched.match_score >= 75) {
      tips.push("Excelente aderência! Personalize o resumo do currículo usando o título desta vaga e candidate-se.");
    } else {
      tips.push("Adapte os tópicos da sua última experiência usando as palavras-chave principais da descrição.");
    }
    return { ...matched, optimization_tips: tips };
  }

  function buildSamplePdfBlob() {
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

  function buildAtsImprovementPlan({
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
    const missingSec = [
      !hasSum ? "RESUMO PROFISSIONAL" : null,
      !hasExp ? "EXPERIÊNCIA PROFISSIONAL" : null,
      !hasEdu ? "FORMAÇÃO ACADÊMICA" : null,
    ].filter(Boolean);
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

  return {
    availableSkills: Object.keys(SKILL_CATALOG).sort(),
    sampleResumeText: SAMPLE_RESUME_LINES.join("\n"),
    extractTextFromPdfFile,
    parseResumeText,
    suggestRoles,
    collectJobs,
    matchJobs,
    computeSkillGaps,
    buildExternalLinks,
    compareCustomJob,
    buildAtsImprovementPlan,
    buildSamplePdfBlob,
  };
})();
