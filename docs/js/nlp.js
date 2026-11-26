/**
 * VagaPulse AI — Pipeline de Extração Canônica e Normalização Léxica (PT-BR & EN)
 * Módulo ES puro, zero dependências externas.
 */

export const STOPWORDS = new Set([
  // Português
  "a", "ao", "aos", "as", "ate", "com", "como", "da", "das", "de", "dela", "dele",
  "do", "dos", "e", "em", "entre", "era", "essa", "esse", "esta", "este", "eu",
  "foi", "ha", "isso", "isto", "ja", "mais", "mas", "me", "menos", "mesmo", "meu",
  "na", "nas", "nao", "nem", "no", "nos", "nossa", "nosso", "num", "numa", "o",
  "os", "ou", "para", "pela", "pelas", "pelo", "pelos", "por", "qual", "que",
  "quem", "se", "sem", "ser", "seu", "sua", "suas", "seus", "sobre", "somos",
  "sao", "tambem", "tem", "ter", "teu", "tua", "um", "uma", "umas", "uns", "vai",
  "voce", "vaga", "empresa", "equipe", "time", "atuar", "experiencia", "conhecimento",
  "trabalho", "oportunidade", "atividades", "requisitos", "diferencial", "beneficios",
  // Inglês
  "about", "all", "am", "an", "and", "any", "are", "as", "at", "be", "been",
  "being", "both", "but", "by", "can", "could", "did", "do", "does", "doing",
  "down", "during", "each", "few", "for", "from", "further", "had", "has", "have",
  "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "how",
  "if", "in", "into", "is", "it", "its", "itself", "just", "me", "more", "most",
  "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once", "only",
  "or", "other", "our", "ours", "out", "over", "own", "same", "she", "should",
  "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "then",
  "there", "these", "they", "this", "those", "through", "to", "too", "under",
  "until", "up", "very", "was", "we", "were", "what", "when", "where", "which",
  "while", "who", "whom", "why", "will", "with", "you", "your", "yours",
  "role", "team", "company", "looking", "work", "position", "job", "required",
  // Francês
  "avec", "pour", "dans", "sur", "sous", "chez", "par", "une", "des", "les",
  "est", "sont", "nous", "vous", "votre", "notre", "poste", "equipe", "entreprise",
  "recherche", "profil", "competences", "mission", "missions", "travail", "etre",
  // Espanhol
  "con", "para", "por", "una", "unas", "unos", "los", "las", "del", "sobre",
  "nosotros", "nuestro", "puesto", "empresa", "equipo", "trabajo", "requisitos",
  "experiencia", "conocimientos", "buscamos", "perfil", "funciones",
]);

/**
 * Dicionário de aliases / sinônimos -> nome canônico da skill (PT-BR e EN).
 */
export const SKILL_ALIASES = {
  // Linguagens
  "py": "Python",
  "python": "Python",
  "python3": "Python",
  "js": "JavaScript",
  "javascript": "JavaScript",
  "ecmascript": "JavaScript",
  "es6": "JavaScript",
  "ts": "TypeScript",
  "typescript": "TypeScript",
  "java": "Java",
  "c#": "C#",
  "csharp": "C#",
  ".net": "C#",
  "dotnet": "C#",
  "c++": "C++",
  "cpp": "C++",
  "golang": "Go",
  "rust": "Rust",
  "php": "PHP",
  "ruby": "Ruby",
  "kotlin": "Kotlin",
  "swift": "Swift",
  "dart": "Dart",
  "sql": "SQL",
  "tsql": "SQL",
  "t-sql": "SQL",
  "pl/sql": "SQL",
  "html": "HTML",
  "html5": "HTML",
  "css": "CSS",
  "css3": "CSS",
  "sass": "CSS",
  "scss": "CSS",
  // Frontend & Mobile
  "react": "React",
  "reactjs": "React",
  "react.js": "React",
  "next": "Next.js",
  "nextjs": "Next.js",
  "next.js": "Next.js",
  "vue": "Vue.js",
  "vuejs": "Vue.js",
  "vue.js": "Vue.js",
  "angular": "Angular",
  "angularjs": "Angular",
  "tailwind": "Tailwind CSS",
  "tailwindcss": "Tailwind CSS",
  "tailwind css": "Tailwind CSS",
  "react native": "React Native",
  "flutter": "Flutter",
  "android": "Android",
  "ios": "iOS",
  // Backend & APIs
  "node": "Node.js",
  "nodejs": "Node.js",
  "node.js": "Node.js",
  "express": "Express",
  "expressjs": "Express",
  "express.js": "Express",
  "nestjs": "NestJS",
  "nest.js": "NestJS",
  "django": "Django",
  "fastapi": "FastAPI",
  "flask": "Flask",
  "spring": "Spring Boot",
  "spring boot": "Spring Boot",
  "springboot": "Spring Boot",
  "laravel": "Laravel",
  "rails": "Ruby on Rails",
  "ruby on rails": "Ruby on Rails",
  "rest": "REST API",
  "restful": "REST API",
  "rest api": "REST API",
  "api rest": "REST API",
  "apis rest": "REST API",
  "graphql": "GraphQL",
  "microsservicos": "Microsserviços",
  "microservicos": "Microsserviços",
  "microservices": "Microsserviços",
  // Bancos de dados
  "postgres": "PostgreSQL",
  "postgresql": "PostgreSQL",
  "mysql": "MySQL",
  "sqlite": "SQLite",
  "mongo": "MongoDB",
  "mongodb": "MongoDB",
  "nosql": "NoSQL",
  "redis": "Redis",
  "sql server": "SQL Server",
  "mssql": "SQL Server",
  "oracle": "Oracle",
  "elasticsearch": "Elasticsearch",
  // Cloud & DevOps
  "aws": "AWS",
  "amazon web services": "AWS",
  "azure": "Azure",
  "gcp": "GCP",
  "google cloud": "GCP",
  "google cloud platform": "GCP",
  "docker": "Docker",
  "k8s": "Kubernetes",
  "kubernetes": "Kubernetes",
  "terraform": "Terraform",
  "iac": "Terraform",
  "devops": "DevOps",
  "devsecops": "DevOps",
  "ci/cd": "CI/CD",
  "cicd": "CI/CD",
  "github actions": "CI/CD",
  "gitlab ci": "CI/CD",
  "jenkins": "CI/CD",
  "integracao continua": "CI/CD",
  "continuous integration": "CI/CD",
  "linux": "Linux",
  "ubuntu": "Linux",
  "bash": "Linux",
  "shell script": "Linux",
  "git": "Git",
  "github": "Git",
  "gitlab": "Git",
  // Segurança
  "seguranca da informacao": "Segurança da Informação",
  "ciberseguranca": "Segurança da Informação",
  "cybersecurity": "Segurança da Informação",
  "cyber security": "Segurança da Informação",
  "infosec": "Segurança da Informação",
  "information security": "Segurança da Informação",
  "threat hunting": "Threat Hunting / YARA",
  "yara": "Threat Hunting / YARA",
  "soc": "Threat Hunting / YARA",
  "siem": "Threat Hunting / YARA",
  "detection engineering": "Threat Hunting / YARA",
  // Dados & IA
  "pandas": "Pandas",
  "numpy": "NumPy",
  "streamlit": "Streamlit",
  "ml": "Machine Learning",
  "machine learning": "Machine Learning",
  "scikit-learn": "Machine Learning",
  "sklearn": "Machine Learning",
  "aprendizado de maquina": "Machine Learning",
  "deep learning": "Deep Learning",
  "dl": "Deep Learning",
  "pytorch": "Deep Learning",
  "tensorflow": "Deep Learning",
  "keras": "Deep Learning",
  "llm": "LLM / IA Generativa",
  "llms": "LLM / IA Generativa",
  "genai": "LLM / IA Generativa",
  "gen ai": "LLM / IA Generativa",
  "ia generativa": "LLM / IA Generativa",
  "generative ai": "LLM / IA Generativa",
  "langchain": "LLM / IA Generativa",
  "openai": "LLM / IA Generativa",
  "rag": "LLM / IA Generativa",
  "prompt engineering": "LLM / IA Generativa",
  "engenharia de prompts": "LLM / IA Generativa",
  "spark": "Apache Spark",
  "pyspark": "Apache Spark",
  "apache spark": "Apache Spark",
  "airflow": "Airflow",
  "power bi": "Power BI",
  "powerbi": "Power BI",
  "tableau": "Tableau",
  "excel": "Excel",
  "etl": "ETL",
  "elt": "ETL",
  "dbt": "ETL",
  // QA & Testes
  "qa": "QA / Testes",
  "quality assurance": "QA / Testes",
  "testes automatizados": "QA / Testes",
  "automated testing": "QA / Testes",
  "pytest": "QA / Testes",
  "jest": "QA / Testes",
  "cypress": "Cypress",
  "selenium": "Selenium",
  "playwright": "Playwright",
  // Produto & Design
  "figma": "Figma",
  "ui/ux": "UI/UX",
  "ux/ui": "UI/UX",
  "ux design": "UI/UX",
  "ui design": "UI/UX",
  "design system": "UI/UX",
  "product manager": "Product Management",
  "product owner": "Product Management",
  "product management": "Product Management",
  "gestao de produtos": "Product Management",
  "roadmap": "Product Management",
  "scrum": "Scrum / Ágil",
  "kanban": "Scrum / Ágil",
  "agile": "Scrum / Ágil",
  "metodologias ageis": "Scrum / Ágil",
  "jira": "Jira",
  // Negócios & Corporativo
  "marketing digital": "Marketing Digital",
  "digital marketing": "Marketing Digital",
  "trafego pago": "Marketing Digital",
  "google ads": "Marketing Digital",
  "meta ads": "Marketing Digital",
  "seo": "Marketing Digital",
  "crm": "CRM",
  "salesforce": "CRM",
  "hubspot": "CRM",
  "rd station": "CRM",
  "vendas": "Vendas / Comercial",
  "comercial": "Vendas / Comercial",
  "sales": "Vendas / Comercial",
  "b2b": "Vendas / Comercial",
  "sdr": "Vendas / Comercial",
  "account executive": "Vendas / Comercial",
  "financas": "Finanças / Contabilidade",
  "contabilidade": "Finanças / Contabilidade",
  "finance": "Finanças / Contabilidade",
  "dre": "Finanças / Contabilidade",
  "fp&a": "Finanças / Contabilidade",
  "sap": "SAP",
  "erp": "SAP",
  "recursos humanos": "RH / Recrutamento",
  "recrutamento": "RH / Recrutamento",
  "human resources": "RH / Recrutamento",
  "talent acquisition": "RH / Recrutamento",
  "people analytics": "RH / Recrutamento",
};

export const CANONICAL_SKILLS = [...new Set(Object.values(SKILL_ALIASES))].sort();

// Regex extra para termos curtos ou com pontuação que exigem delimitação cuidadosa
const SPECIAL_SKILL_PATTERNS = {
  Go: [/\bgolang\b/i, /\bgo\b(?=\s*[,/\-|]|\s+(?:developer|backend|dev|engineer))/i],
  "C#": [/(?:^|[\s,(/])c#(?=$|[\s,)/.;:])/i, /\b(?:csharp|dotnet)\b/i, /\.net\b/i],
  "C++": [/(?:^|[\s,(/])c\+\+(?=$|[\s,)/.;:])/i, /\bcpp\b/i],
  Java: [/\bjava\b(?!script)/i],
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Compila padrões de busca a partir do dicionário de aliases
const COMPILED_SKILL_PATTERNS = (() => {
  const bySkill = new Map();
  for (const [alias, canonical] of Object.entries(SKILL_ALIASES)) {
    if (canonical === "C#" || canonical === "C++" || canonical === "Java") continue;
    if (!bySkill.has(canonical)) bySkill.set(canonical, []);
    bySkill.get(canonical).push(new RegExp(`(?<![a-z0-9])${escapeRegex(alias)}(?![a-z0-9])`, "i"));
  }
  for (const [canonical, patterns] of Object.entries(SPECIAL_SKILL_PATTERNS)) {
    bySkill.set(canonical, patterns);
  }
  return bySkill;
})();

/**
 * Grafo não-direcionado de competências com pesos de afinidade por proximidade.
 */
export const SKILL_GRAPH = {
  Python: ["Django", "FastAPI", "Flask", "Pandas", "NumPy", "Machine Learning", "LLM / IA Generativa", "ETL"],
  Django: ["Python", "FastAPI", "Flask", "REST API", "PostgreSQL"],
  FastAPI: ["Python", "Django", "Flask", "REST API", "Docker"],
  Flask: ["Python", "FastAPI", "Django", "REST API"],
  JavaScript: ["TypeScript", "React", "Node.js", "Vue.js", "Angular", "HTML", "CSS", "Cypress", "Playwright"],
  TypeScript: ["JavaScript", "React", "Next.js", "Node.js", "NestJS", "Angular"],
  React: ["Next.js", "TypeScript", "JavaScript", "Vue.js", "Angular", "Tailwind CSS", "React Native"],
  "Next.js": ["React", "TypeScript", "JavaScript", "Tailwind CSS"],
  "Vue.js": ["React", "JavaScript", "TypeScript", "Angular"],
  Angular: ["TypeScript", "JavaScript", "React", "Vue.js"],
  "Tailwind CSS": ["CSS", "HTML", "React", "Next.js"],
  HTML: ["CSS", "JavaScript", "Tailwind CSS", "React"],
  CSS: ["HTML", "Tailwind CSS", "JavaScript", "UI/UX"],
  "Node.js": ["Express", "NestJS", "TypeScript", "JavaScript", "REST API", "MongoDB"],
  Express: ["Node.js", "NestJS", "REST API"],
  NestJS: ["Node.js", "TypeScript", "Express", "REST API"],
  Java: ["Spring Boot", "Microsserviços", "SQL", "PostgreSQL", "Docker"],
  "Spring Boot": ["Java", "Microsserviços", "REST API", "PostgreSQL"],
  "C#": ["SQL Server", "Azure", "REST API", "Microsserviços"],
  Go: ["Docker", "Kubernetes", "Microsserviços", "REST API", "Linux"],
  Rust: ["Linux", "Threat Hunting / YARA", "Segurança da Informação", "C++"],
  SQL: ["PostgreSQL", "MySQL", "SQLite", "SQL Server", "Oracle", "ETL", "Power BI"],
  PostgreSQL: ["SQL", "MySQL", "SQLite", "SQL Server", "Oracle"],
  MySQL: ["SQL", "PostgreSQL", "SQLite", "SQL Server"],
  SQLite: ["SQL", "PostgreSQL", "MySQL"],
  "SQL Server": ["SQL", "PostgreSQL", "MySQL", "C#"],
  MongoDB: ["NoSQL", "Node.js", "Elasticsearch"],
  NoSQL: ["MongoDB", "Redis", "Elasticsearch"],
  Redis: ["NoSQL", "Docker", "Microsserviços"],
  AWS: ["Azure", "GCP", "Docker", "Kubernetes", "Terraform", "DevOps"],
  Azure: ["AWS", "GCP", "Docker", "DevOps", "C#"],
  GCP: ["AWS", "Azure", "Docker", "Kubernetes", "DevOps"],
  Docker: ["Kubernetes", "CI/CD", "Linux", "DevOps", "AWS"],
  Kubernetes: ["Docker", "AWS", "GCP", "Azure", "Terraform", "DevOps"],
  Terraform: ["AWS", "GCP", "Azure", "Kubernetes", "DevOps"],
  DevOps: ["Docker", "Kubernetes", "CI/CD", "Linux", "AWS", "Terraform"],
  "CI/CD": ["Docker", "Git", "DevOps", "QA / Testes"],
  Linux: ["Docker", "DevOps", "Segurança da Informação", "Threat Hunting / YARA", "Rust"],
  Git: ["CI/CD", "DevOps"],
  "Segurança da Informação": ["Threat Hunting / YARA", "Linux", "Python", "DevOps", "AWS"],
  "Threat Hunting / YARA": ["Segurança da Informação", "Python", "Rust", "Linux", "Machine Learning"],
  Pandas: ["Python", "NumPy", "Streamlit", "Machine Learning", "ETL", "SQL"],
  NumPy: ["Python", "Pandas", "Machine Learning", "Deep Learning"],
  Streamlit: ["Python", "Pandas", "Power BI", "LLM / IA Generativa"],
  "Machine Learning": ["Deep Learning", "Python", "Pandas", "NumPy", "LLM / IA Generativa"],
  "Deep Learning": ["Machine Learning", "Python", "NumPy", "LLM / IA Generativa"],
  "LLM / IA Generativa": ["Python", "Machine Learning", "Deep Learning", "FastAPI", "Streamlit"],
  "Apache Spark": ["Python", "SQL", "ETL", "Airflow", "AWS"],
  Airflow: ["Python", "ETL", "Apache Spark", "SQL"],
  ETL: ["SQL", "Python", "Airflow", "Apache Spark", "Pandas", "Power BI"],
  "Power BI": ["Tableau", "Excel", "SQL", "ETL"],
  Tableau: ["Power BI", "SQL", "Excel"],
  "QA / Testes": ["Cypress", "Playwright", "Selenium", "CI/CD", "Python", "JavaScript"],
  Cypress: ["Playwright", "Selenium", "QA / Testes", "JavaScript"],
  Playwright: ["Cypress", "Selenium", "QA / Testes", "TypeScript"],
  Selenium: ["Cypress", "Playwright", "QA / Testes", "Python"],
  Flutter: ["Dart", "React Native", "Android", "iOS"],
  "React Native": ["React", "Flutter", "TypeScript", "Android", "iOS"],
  Figma: ["UI/UX", "HTML", "CSS", "Product Management"],
  "UI/UX": ["Figma", "HTML", "CSS", "Product Management"],
  "Product Management": ["Scrum / Ágil", "Jira", "UI/UX", "SQL"],
  "Scrum / Ágil": ["Jira", "Product Management", "CI/CD"],
};

// Constroi grafo simétrico para garantir bidirecionalidade
const SYMMETRIC_GRAPH = (() => {
  const adj = new Map();
  const addEdge = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  for (const [src, neighbors] of Object.entries(SKILL_GRAPH)) {
    for (const dst of neighbors) addEdge(src, dst);
  }
  return adj;
})();

/**
 * Calcula afinidade no grafo de competências com decaimento por distância (hop 1 = 0.55, hop 2 = 0.25).
 */
export function findRelatedSkillsViaGraph(candidateSkills, missingSkills, maxHops = 2) {
  const candSet = new Set(candidateSkills);
  const hopWeights = { 1: 0.55, 2: 0.25 };
  const matches = [];

  for (const target of missingSkills) {
    if (candSet.has(target)) continue;
    // BFS a partir da skill alvo até maxHops
    const visited = new Set([target]);
    let frontier = [target];
    let bestHop = Infinity;
    let viaSkill = null;

    for (let hop = 1; hop <= maxHops; hop++) {
      const nextFrontier = [];
      for (const node of frontier) {
        const neighbors = SYMMETRIC_GRAPH.get(node);
        if (!neighbors) continue;
        for (const nb of neighbors) {
          if (visited.has(nb)) continue;
          visited.add(nb);
          if (candSet.has(nb)) {
            bestHop = hop;
            viaSkill = nb;
            break;
          }
          nextFrontier.push(nb);
        }
        if (viaSkill) break;
      }
      if (viaSkill) break;
      frontier = nextFrontier;
    }

    if (viaSkill && bestHop <= maxHops) {
      matches.push({
        skill: target,
        hop: bestHop,
        via: viaSkill,
        weight: hopWeights[bestHop] || 0.2,
      });
    }
  }
  return matches;
}

export const ROLE_PROFILES = {
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

export const SENIORITY_LEVELS = {
  "Estágio": 1,
  "Júnior": 2,
  "Pleno": 3,
  "Sênior": 4,
  "Especialista": 5,
};

const SECTOR_KEYWORDS = {
  "Cibersegurança": ["seguranca", "cyber", "threat", "yara", "soc", "siem", "infosec", "pentest", "risco", "vulnerability"],
  "Dados & IA": ["dados", "data", "analytics", "machine learning", "ai", "ia", "llm", "bi", "scientist", "pandas", "spark", "etl"],
  "Engenharia de Software": ["desenvolvedor", "software", "developer", "backend", "frontend", "full stack", "fullstack", "engineer", "api", "mobile"],
  "DevOps & Cloud": ["devops", "sre", "cloud", "kubernetes", "docker", "terraform", "infraestrutura", "aws", "azure", "gcp"],
  "QA & Qualidade": ["qa", "quality assurance", "testes", "cypress", "playwright", "selenium", "automation"],
  "Produto & Design": ["product", "produto", "figma", "ui/ux", "ux", "design", "scrum", "agile"],
  "Educação & Tecnologia": ["professor", "docencia", "educacao", "ensino", "didatico", "treinamento", "instrutor"],
  "Negócios & Operações": ["marketing", "vendas", "comercial", "financeiro", "contabilidade", "recursos humanos", "crm", "sap"],
};

/**
 * Normalização léxica: lowercase, decomposição NFKD, remoção de diacríticos e colapso de espaços.
 */
export function normalizeText(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Stemming / lematização leve bilíngue (PT-BR e EN) preservando termos técnicos curtos.
 */
export function stemToken(token) {
  if (!token || token.length <= 3) return token;
  if (/[+#.]/.test(token)) return token;
  let t = token;
  // PT-BR sufixos comuns
  if (t.length > 6 && t.endsWith("coes")) return t.slice(0, -4) + "cao";
  if (t.length > 6 && t.endsWith("mentos")) return t.slice(0, -6);
  if (t.length > 6 && t.endsWith("mento")) return t.slice(0, -5);
  if (t.length > 6 && t.endsWith("mente")) return t.slice(0, -5);
  if (t.length > 6 && (t.endsWith("adores") || t.endsWith("adoras"))) return t.slice(0, -4);
  if (t.length > 5 && (t.endsWith("ando") || t.endsWith("endo") || t.endsWith("indo"))) return t.slice(0, -4);
  // EN sufixos comuns
  if (t.length > 6 && t.endsWith("ation")) return t.slice(0, -5);
  if (t.length > 5 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 5 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith("ed")) return t.slice(0, -2);
  if (t.length > 4 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us")) return t.slice(0, -1);
  return t;
}

/**
 * Tokeniza texto com normalização, remoção de stopwords, stemming opcional e resolução de aliases.
 */
export function tokenize(text, { stem = true, expandAliases = true } = {}) {
  const rawStr = String(text || "");
  const norm = normalizeText(rawStr);
  const rawTokens = norm.match(/[a-z0-9+#.]{2,}/g) || [];
  const out = [];
  for (const raw of rawTokens) {
    const clean = raw.replace(/^\.+|\.+$/g, "");
    if (!clean || clean.length < 2 || STOPWORDS.has(clean)) continue;
    if (expandAliases && SKILL_ALIASES[clean]) {
      const canonical = normalizeText(SKILL_ALIASES[clean]);
      for (const part of canonical.split(/\s+/)) {
        if (part.length >= 2 && !STOPWORDS.has(part)) {
          out.push(stem ? stemToken(part) : part);
        }
      }
    }
    out.push(stem ? stemToken(clean) : clean);
  }
  // Suporte a tokens CJK / Japonês (Hiragana, Katakana, Kanji)
  const jpChunks = rawStr.match(/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]{2,}/g) || [];
  for (const chunk of jpChunks) {
    out.push(chunk);
    if (chunk.length > 2) {
      for (let i = 0; i < chunk.length - 1; i++) {
        out.push(chunk.slice(i, i + 2));
      }
    }
  }
  return out;
}

/**
 * Extrai lista canônica única de skills resolvendo sinônimos/aliases PT-BR e EN.
 */
export function extractSkillsCanonical(text) {
  const raw = String(text || "");
  const norm = normalizeText(raw);
  const found = new Set();

  for (const [canonical, patterns] of COMPILED_SKILL_PATTERNS.entries()) {
    const target = canonical === "C#" || canonical === "C++" || canonical === "Java" ? raw : norm;
    if (patterns.some((re) => re.test(target))) {
      found.add(canonical);
    }
  }
  return [...found];
}

/**
 * Normaliza qualquer token ou lista de skills via dicionário de aliases.
 */
export function resolveSkillAlias(skillName) {
  const raw = String(skillName || "").trim();
  if (!raw) return "";
  const norm = normalizeText(raw);
  if (SKILL_ALIASES[norm]) return SKILL_ALIASES[norm];
  const matched = extractSkillsCanonical(raw);
  return matched[0] || raw;
}

const MONTH_NAME_MAP = {
  jan: 1, janeiro: 1, january: 1,
  fev: 2, fevereiro: 2, feb: 2, february: 2,
  mar: 3, marco: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  mai: 5, maio: 5, may: 5,
  jun: 6, junho: 6, june: 6,
  jul: 7, julho: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  set: 9, setembro: 9, sep: 9, sept: 9, september: 9,
  out: 10, outubro: 10, oct: 10, october: 10,
  nov: 11, novembro: 11, november: 11,
  dez: 12, dezembro: 12, dec: 12, december: 12,
};

function parseMonthToken(token, fallback) {
  if (!token) return fallback;
  const c = String(token).trim().toLowerCase().replace(/\.$/, "");
  if (/^\d+$/.test(c)) {
    const m = parseInt(c, 10);
    return m >= 1 && m <= 12 ? m : fallback;
  }
  return MONTH_NAME_MAP[c] || fallback;
}

/**
 * Parsing tolerante de anos de experiência ("3+ anos", "5-7 anos", "01/1992 - Atual", "trajetória superior a 20 anos").
 */
export function parseExperienceYears(text) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const norm = normalizeText(text);

  // 1. Intervalos com faixa numérica explícita ("5-7 anos", "3 a 5 anos", "3+ years")
  const explicitRanges = [
    ...norm.matchAll(/\b(\d{1,2})\s*(?:[-–]|a|to)\s*(\d{1,2})\s*\+?\s*(?:anos?|years?|yrs?)\b/g),
  ].map((m) => Math.max(parseInt(m[1], 10), parseInt(m[2], 10)));

  const explicitSingle = [
    ...norm.matchAll(/\b(\d{1,2})\s*\+?\s*(?:anos?|years?|yrs?)\s*(?:de\s+(?:experiencia|atuacao|carreira|trajetoria|ti)|em\s+(?:ambientes|tecnologia|ti|desenvolvimento|dados|seguranca)|of\s+experience|\bexp\b)/g),
    ...norm.matchAll(/(?:trajetoria|experiencia|atuacao|carreira|mais\s+de|superior\s+a|acima\s+de|ha\s+mais\s+de|at\s+least|minimum|minimo)[^.]{0,40}?\b(\d{1,2})\s*\+?\s*(?:anos?|years?|yrs?)\b/g),
  ].map((m) => parseInt(m[1], 10));

  const explicitCandidates = [...explicitRanges, ...explicitSingle].filter((n) => n > 0 && n <= 50);
  const explicitYears = explicitCandidates.length ? Math.max(...explicitCandidates) : null;

  // 2. Datas na seção de experiência (pegando a data mais antiga registrada até a data atual)
  let expSection = norm;
  const secMatch = norm.match(
    /(?:experiencia(?:\s+profissional)?|historico\s+profissional|work\s+experience)([\s\S]*?)(?:formacao|educacao|idiomas|certificacoes|projetos|$)/
  );
  if (secMatch && secMatch[1].trim().length > 20) {
    expSection = secMatch[1];
  }

  const monthPat = "(?:0?[1-9]|1[0-2]|jan(?:eiro|uary)?|fev(?:ereiro)?|feb(?:ruary)?|mar(?:co|ch)?|abr(?:il)?|apr(?:il)?|mai(?:o)?|may|jun(?:ho|e)?|jul(?:ho|y)?|ago(?:sto)?|aug(?:ust)?|set(?:embro)?|sept?(?:ember)?|out(?:ubro)?|oct(?:ober)?|nov(?:embro|ember)?|dez(?:embro)?|dec(?:ember)?)";
  const yearPat = "(?:19[7-9]\\d|20[0-3]\\d)";
  const presentPat = "(?:atual(?:mente)?|presente|present|current|hoje|o\\s+momento|momento)";
  const rangeRe = new RegExp(
    `(?:(${monthPat})\\s*(?:de\\s+|[/\\.\\-]\\s*|\\s+))?\\b(${yearPat})\\b\\s*(?:[-–—]+|\\ba\\b|\\bate\\b|\\bto\\b)\\s*(?:(${presentPat})\\b|(?:(${monthPat})\\s*(?:de\\s+|[/\\.\\-]\\s*|\\s+))?\\b(${yearPat})\\b)`,
    "g"
  );

  const startPts = [];
  for (const m of expSection.matchAll(rangeRe)) {
    const startY = parseInt(m[2], 10);
    if (startY < 1970 || startY > currentYear) continue;
    startPts.push(startY * 12 + parseMonthToken(m[1], currentMonth));
  }

  const sinceRe = new RegExp(`\\b(?:desde|since|a\\s+partir\\s+de)\\s+(?:(${monthPat})\\s*(?:de\\s+|[/\\.\\-]\\s*|\\s+))?\\b(${yearPat})\\b`, "g");
  for (const m of expSection.matchAll(sinceRe)) {
    const startY = parseInt(m[2], 10);
    if (startY >= 1970 && startY <= currentYear) {
      startPts.push(startY * 12 + parseMonthToken(m[1], currentMonth));
    }
  }

  const singleDateRe = new RegExp(`\\b(${monthPat})\\s*(?:de\\s+|[/\\.\\-]\\s*)\\s*(${yearPat})\\b`, "g");
  for (const m of expSection.matchAll(singleDateRe)) {
    const startY = parseInt(m[2], 10);
    if (startY >= 1970 && startY <= currentYear) {
      startPts.push(startY * 12 + parseMonthToken(m[1], 1));
    }
  }

  let dateSpanYears = null;
  if (startPts.length) {
    const nowIdx = currentYear * 12 + currentMonth;
    const totalMonths = nowIdx - Math.min(...startPts);
    if (totalMonths >= 6) {
      const calc = Math.max(1, Math.round(totalMonths / 12));
      if (calc > 0 && calc <= 55) dateSpanYears = calc;
    }
  }

  if (dateSpanYears !== null && explicitYears !== null) return Math.max(dateSpanYears, explicitYears);
  return dateSpanYears !== null ? dateSpanYears : explicitYears;
}

/**
 * Normaliza senioridade para os 5 níveis canônicos: Estágio, Júnior, Pleno, Sênior, Especialista.
 */
export function normalizeSeniority(text, years = null) {
  const lower = normalizeText(text);
  if (/\b(tech\s+lead|staff|principal|especialista|specialist|architect|arquiteto|head\s+of|head\s+de|director|diretor|gerente|manager|coordenador|lead)\b/.test(lower)) {
    return "Especialista";
  }
  if (/\b(senior|sr\.?|sênior)\b/.test(lower)) return "Sênior";
  if (years !== null && years >= 6) return "Sênior";
  if (/\b(pleno|mid[- ]?level|intermediate|pl\.?)\b/.test(lower)) return "Pleno";
  if (years !== null && years >= 3) return "Pleno";
  if (/\b(estagiario|estagio|intern|internship|trainee|aprendiz)\b/.test(lower)) return "Estágio";
  if (/\b(junior|jr\.?|entry[- ]?level)\b/.test(lower)) return "Júnior";

  if (years !== null) {
    if (years >= 1) return "Júnior";
    return "Estágio";
  }
  return "Pleno";
}

export function detectLanguages(text) {
  const lower = normalizeText(text);
  const map = {
    Português: ["portugues", "portuguese", "nativo"],
    Inglês: ["ingles", "english", "toefl", "ielts", "cambridge", "fluent english"],
    Espanhol: ["espanhol", "spanish"],
    Francês: ["frances", "french"],
    Alemão: ["alemao", "german", "deutsch"],
  };
  return Object.entries(map)
    .filter(([, kws]) => kws.some((k) => lower.includes(k)))
    .map(([lang]) => lang);
}

/**
 * Detecta o idioma predominante de um texto (pt, en, fr, es ou ja).
 */
export function detectLanguageCode(text) {
  const raw = String(text || "");
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(raw) || (raw.match(/[\u4e00-\u9faf]/g) || []).length >= 3) {
    return "ja";
  }
  const norm = normalizeText(raw);
  const tokens = norm.match(/[a-z]{2,}/g) || [];
  if (!tokens.length) return "pt";
  const ptMarkers = new Set(["para", "com", "vaga", "empresa", "experiencia", "atuar", "conhecimento", "requisitos", "desenvolvimento", "trabalho", "equipe", "dados", "remoto", "hibrido", "presencial", "voce", "nossa"]);
  const enMarkers = new Set(["with", "for", "and", "the", "you", "your", "team", "experience", "looking", "role", "skills", "requirements", "engineering", "software", "remote", "hybrid", "company", "build"]);
  const frMarkers = new Set(["avec", "pour", "dans", "entreprise", "equipe", "poste", "recherche", "competences", "developpement", "teletravail", "hybride", "nous", "votre", "profil", "missions"]);
  const esMarkers = new Set(["para", "con", "empresa", "puesto", "experiencia", "conocimientos", "requisitos", "equipo", "trabajo", "buscamos", "desarrollo", "remoto", "hibrido"]);

  let pt = 0;
  let en = 0;
  let fr = 0;
  let es = 0;
  for (const t of tokens) {
    if (ptMarkers.has(t)) pt++;
    if (enMarkers.has(t)) en++;
    if (frMarkers.has(t)) fr++;
    if (esMarkers.has(t)) es++;
  }
  const scores = [
    ["en", en],
    ["fr", fr],
    ["es", es],
    ["pt", pt],
  ].sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : "pt";
}

export function detectEducation(text) {
  const lower = normalizeText(text).replace(/\bengenharia\s+de\s+prompts?\b/g, "");
  const map = {
    Doutorado: [/\bdoutorado\b/, /\bphd\b/, /\bph\.d\b/],
    Mestrado: [/\bmestrado\b/, /\bmaster(?:'s|\s+degree)?\b/, /\bm\.sc\b/],
    "Pós-graduação / MBA": [/\bpos[- ]graduacao\b/, /\bmba\b/, /\bespecializacao\b/],
    "Ensino Superior": [
      /\bbacharelado\b/, /\bbachelor\b/, /\bgraduacao\b/, /\btecnologo\b/, /\blicenciatura\b/,
      /\bcurso\s+superior\b/, /\bensino\s+superior\b/, /\bcst\b/, /\bcomputer\s+science\b/,
      /\banalise\s+e\s+desenvolvimento\s+de\s+sistemas\b/, /\bciencia\s+da\s+computacao\b/,
      /\bengenharia\b/, /\bsistemas\s+de\s+informacao\b/, /\badministracao\b/,
    ],
    "Curso Técnico": [/\btecnico\s+em\b/, /\bensino\s+tecnico\b/],
  };
  return Object.entries(map)
    .filter(([, patterns]) => patterns.some((p) => p.test(lower)))
    .map(([label]) => label);
}

export function detectCountry(text) {
  const lower = normalizeText(text);
  const brSignals = [
    /\bbrasil\b/, /\bbrazil\b/, /\+55\b/,
    /\b(belo\s+horizonte|sao\s+paulo|rio\s+de\s+janeiro|curitiba|porto\s+alegre|campinas|florianopolis|recife|salvador|brasilia|fortaleza|goiania|minas\s+gerais)\b/,
    /[-–—,\s]\s*(sp|rj|mg|rs|pr|sc|ba|pe|ce|df|go|es|pa|am)\b/,
  ];
  if (brSignals.some((re) => re.test(lower))) return "Brasil";
  if (/\b(portugal|lisboa|porto|\+351)\b/.test(lower)) return "Portugal";
  if (/\b(united\s+states|estados\s+unidos|usa|new\s+york|san\s+francisco|california)\b/.test(lower)) return "Estados Unidos";
  if (/\b(united\s+kingdom|london|reino\s+unido)\b/.test(lower)) return "Reino Unido";
  if (/\b(germany|deutschland|berlin|munich|alemanha)\b/.test(lower)) return "Alemanha";
  if (/\b(canada|toronto|vancouver|montreal)\b/.test(lower)) return "Canadá";
  return "Brasil";
}

export function detectWorkModel(text) {
  const raw = String(text || "");
  const lower = normalizeText(raw);
  if (/\b(hibrido|hybrid|hybride)\b/.test(lower) || /ハイブリッド/.test(raw)) return "Híbrido";
  if (/\b(remoto|remote|home\s+office|teletrabalho|teletravail|teletrabajo|anywhere|work\s+from\s+home)\b/.test(lower) || /リモート|在宅/.test(raw)) return "Remoto";
  if (/\b(presencial|on[- ]?site|onsite|sur\s+site)\b/.test(lower) || /出社/.test(raw)) return "Presencial";
  return "Não informado";
}

export function detectSector(text, skills = []) {
  const lower = normalizeText(`${text} ${skills.join(" ")}`);
  let bestSector = "Tecnologia & Geral";
  let bestScore = 0;
  for (const [sector, kws] of Object.entries(SECTOR_KEYWORDS)) {
    let hits = 0;
    for (const kw of kws) {
      if (lower.includes(kw)) hits++;
    }
    if (hits > bestScore) {
      bestScore = hits;
      bestSector = sector;
    }
  }
  return bestSector;
}

export function suggestRoles(skills, text) {
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

export function normalizeTitle(title) {
  return normalizeText(title)
    .replace(/\((?:m\/f\/d|f\/m\/d|pcd|afirmativa[^)]*|remoto[^)]*)\)/g, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\b(vaga|oportunidade)\s+(de|para)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai estrutura canônica completa do currículo em PDF.
 */
export function extractCanonicalProfile(rawText, filename = "curriculo.pdf", pages = 1) {
  const skills = extractSkillsCanonical(rawText);
  const experienceYears = parseExperienceYears(rawText);
  const seniority = normalizeSeniority(rawText, experienceYears);
  const suggestedRoles = suggestRoles(skills, rawText);
  const languages = detectLanguages(rawText);
  const education = detectEducation(rawText);
  const country = detectCountry(rawText);
  const workModel = detectWorkModel(rawText);
  const sector = detectSector(rawText, skills);
  const profileLanguage = detectLanguageCode(rawText);

  const firstLine = String(rawText || "").split(/\r?\n/).find((l) => l.trim().length > 3) || suggestedRoles[0];
  const normalizedTitle = normalizeTitle(firstLine);

  const email = (rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) || [])[0] || null;
  const phone = (rawText.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\d{4}|\d{4})[-.\s]?\d{4}/) || [])[0] || null;
  const linkedin = (rawText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+/i) || [])[0] || null;
  const github = (rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9\-_]+/i) || [])[0] || null;

  const wordCount = rawText.split(/\s+/).filter(Boolean).length;

  return {
    filename,
    pages,
    word_count: wordCount,
    normalizedTitle,
    seniority,
    seniorityLevel: SENIORITY_LEVELS[seniority] || 3,
    skills,
    suggested_roles: suggestedRoles,
    estimated_years: experienceYears,
    experienceYears,
    languages,
    profileLanguage,
    education,
    location: country,
    workModel,
    sector,
    country,
    email,
    phone: phone ? phone.trim() : null,
    linkedin,
    github,
    raw_text: rawText,
  };
}

/**
 * Extrai estrutura canônica completa de uma vaga (título, senioridade, skills, anos, idiomas, modelo, setor).
 */
export function extractCanonicalJob(job) {
  const title = String(job.title || "");
  const description = String(job.description || "");
  const combined = `${title} ${(job.skills || []).join(" ")} ${description}`;

  const rawSkills = [...(job.skills || []), ...extractSkillsCanonical(combined)];
  const skills = [...new Set(rawSkills.map(resolveSkillAlias).filter(Boolean))];
  const experienceYears = parseExperienceYears(`${title} ${description}`);
  const seniority = normalizeSeniority(job.seniority || title, experienceYears);
  const workModel = job.modality && job.modality !== "Não informada"
    ? job.modality
    : detectWorkModel(`${title} ${job.location || ""} ${description}`);
  const jobLanguage = detectLanguageCode(`${title} ${description}`);
  const languages = detectLanguages(combined);
  if (!languages.length) {
    languages.push(jobLanguage === "en" ? "Inglês" : jobLanguage === "es" ? "Espanhol" : "Português");
  }
  const education = detectEducation(combined);
  const sector = job.sector || detectSector(combined, skills);

  return {
    ...job,
    skills,
    canonical: {
      normalizedTitle: normalizeTitle(title),
      seniority,
      seniorityLevel: SENIORITY_LEVELS[seniority] || 3,
      skills,
      experienceYears,
      languages,
      jobLanguage,
      education,
      location: job.location || "Não informado",
      workModel,
      sector,
    },
    seniority,
    modality: workModel,
    jobLanguage,
    sector,
  };
}
