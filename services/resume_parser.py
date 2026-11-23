from __future__ import annotations

import io
import re
import unicodedata
from dataclasses import dataclass, asdict
from datetime import date
from typing import BinaryIO

from pypdf import PdfReader


# Catálogo de habilidades: nome canônico -> padrões regex (case-insensitive)
SKILL_CATALOG: dict[str, list[str]] = {
    # Linguagens
    "Python": [r"\bpython\b"],
    "JavaScript": [r"\bjavascript\b", r"\bjs\b", r"\becmascript\b"],
    "TypeScript": [r"\btypescript\b", r"\bts\b"],
    "Java": [r"\bjava\b(?!script)"],
    "C#": [r"c#", r"\bcsharp\b", r"\.net\b", r"\bdotnet\b"],
    "C++": [r"c\+\+", r"\bcpp\b"],
    "Go": [r"\bgolang\b", r"\bgo\b(?=\s*[,/\-|]|\s+(?:developer|backend|dev))"],
    "Rust": [r"\brust\b"],
    "PHP": [r"\bphp\b"],
    "Ruby": [r"\bruby\b"],
    "Kotlin": [r"\bkotlin\b"],
    "Swift": [r"\bswift\b"],
    "Dart": [r"\bdart\b"],
    "SQL": [r"\bsql\b", r"\btsql\b", r"\bpl/sql\b"],
    "HTML": [r"\bhtml5?\b"],
    "CSS": [r"\bcss3?\b", r"\bsass\b", r"\bscss\b"],
    # Frontend & Mobile
    "React": [r"\breact(?:\.?js)?\b"],
    "Next.js": [r"\bnext\.?js\b"],
    "Vue.js": [r"\bvue(?:\.?js)?\b"],
    "Angular": [r"\bangular\b"],
    "Tailwind CSS": [r"\btailwind(?:\s*css)?\b"],
    "React Native": [r"\breact\s+native\b"],
    "Flutter": [r"\bflutter\b"],
    "Android": [r"\bandroid\b"],
    "iOS": [r"\bios\b"],
    # Backend & APIs
    "Node.js": [r"\bnode(?:\.?js)?\b"],
    "Express": [r"\bexpress(?:\.?js)?\b"],
    "NestJS": [r"\bnest\.?js\b"],
    "Django": [r"\bdjango\b"],
    "FastAPI": [r"\bfastapi\b"],
    "Flask": [r"\bflask\b"],
    "Spring Boot": [r"\bspring\s*boot\b", r"\bspring\b"],
    "Laravel": [r"\blaravel\b"],
    "Ruby on Rails": [r"\bruby\s+on\s+rails\b", r"\brails\b"],
    "REST API": [r"\brest(?:ful)?\b", r"\bapis?\s+rest\b"],
    "GraphQL": [r"\bgraphql\b"],
    "Microsserviços": [r"\bmicrosservi[cç]os\b", r"\bmicroservices?\b"],
    # Bancos de Dados
    "PostgreSQL": [r"\bpostgres(?:ql)?\b"],
    "MySQL": [r"\bmysql\b"],
    "SQLite": [r"\bsqlite\b"],
    "MongoDB": [r"\bmongo(?:db)?\b"],
    "NoSQL": [r"\bnosql\b"],
    "Redis": [r"\bredis\b"],
    "SQL Server": [r"\bsql\s*server\b"],
    "Oracle": [r"\boracle\b"],
    "Elasticsearch": [r"\belasticsearch\b"],
    # Cloud & DevOps
    "AWS": [r"\baws\b", r"\bamazon\s+web\s+services\b"],
    "Azure": [r"\bazure\b"],
    "GCP": [r"\bgcp\b", r"\bgoogle\s+cloud\b"],
    "Docker": [r"\bdocker\b"],
    "Kubernetes": [r"\bkubernetes\b", r"\bk8s\b"],
    "Terraform": [r"\bterraform\b"],
    "DevOps": [r"\bdevops\b"],
    "CI/CD": [r"\bci\s*/\s*cd\b", r"\bgithub\s+actions\b", r"\bgitlab\s+ci\b", r"\bjenkins\b", r"\bintegra[cç][aã]o\s+cont[ií]nua\b"],
    "Linux": [r"\blinux\b", r"\bubuntu\b", r"\bbash\b", r"\bshell\s*script\b"],
    "Git": [r"\bgit\b", r"\bgithub\b", r"\bgitlab\b"],
    # Segurança da Informação
    "Segurança da Informação": [r"\bseguran[cç]a\s+da\s+informa[cç][aã]o\b", r"\bcyber\s*security\b", r"\bciberseguran[cç]a\b", r"\binfosec\b"],
    "Threat Hunting / YARA": [r"\bthreat\s+hunting\b", r"\byara\b", r"\bsoc\b", r"\bsiem\b"],
    # Dados & IA
    "Pandas": [r"\bpandas\b"],
    "NumPy": [r"\bnumpy\b"],
    "Streamlit": [r"\bstreamlit\b"],
    "Machine Learning": [r"\bmachine\s+learning\b", r"\bscikit[- ]?learn\b", r"\baprendizado\s+de\s+m[aá]quina\b"],
    "Deep Learning": [r"\bdeep\s+learning\b", r"\bpytorch\b", r"\btensorflow\b", r"\bkeras\b"],
    "LLM / IA Generativa": [r"\bllms?\b", r"\blangchain\b", r"\bopenai\b", r"\bia\s+generativa\b", r"\bgenerative\s+ai\b", r"\brag\b"],
    "Apache Spark": [r"\bspark\b", r"\bpyspark\b"],
    "Airflow": [r"\bairflow\b"],
    "Power BI": [r"\bpower\s*bi\b"],
    "Tableau": [r"\btableau\b"],
    "Excel": [r"\bexcel\b"],
    "ETL": [r"\betl\b", r"\belt\b", r"\bdbt\b"],
    # QA & Testes
    "QA / Testes": [r"\bqa\b", r"\bquality\s+assurance\b", r"\btestes?\s+automatizados?\b", r"\bpytest\b", r"\bjest\b"],
    "Cypress": [r"\bcypress\b"],
    "Selenium": [r"\bselenium\b"],
    "Playwright": [r"\bplaywright\b"],
    # Design & Produto
    "Figma": [r"\bfigma\b"],
    "UI/UX": [r"\bui\s*/\s*ux\b", r"\bux\s*/\s*ui\b", r"\bux\s+design\b", r"\bui\s+design\b", r"\bdesign\s+system\b"],
    "Product Management": [r"\bproduct\s+manager\b", r"\bproduct\s+owner\b", r"\bgest[aã]o\s+de\s+produtos?\b", r"\broadmap\b"],
    "Scrum / Ágil": [r"\bscrum\b", r"\bkanban\b", r"\bagile\b", r"\bmetodologias?\s+[aá]geis\b"],
    "Jira": [r"\bjira\b"],
    # Negócios, Marketing & Corporativo
    "Marketing Digital": [r"\bmarketing\s+digital\b", r"\btr[aá]fego\s+pago\b", r"\bgoogle\s+ads\b", r"\bmeta\s+ads\b", r"\bseo\b"],
    "CRM": [r"\bcrm\b", r"\bsalesforce\b", r"\bhubspot\b", r"\brd\s+station\b"],
    "Vendas / Comercial": [r"\bvendas\b", r"\bcomercial\b", r"\bb2b\b", r"\bsdr\b", r"\baccount\s+executive\b"],
    "Finanças / Contabilidade": [r"\bfinan[cç]as\b", r"\bcontabilidade\b", r"\bdre\b", r"\bfluxo\s+de\s+caixa\b", r"\bfp&a\b"],
    "SAP": [r"\bsap\b", r"\berp\b"],
    "RH / Recrutamento": [r"\brecursos\s+humanos\b", r"\brecrutamento\b", r"\bsele[cç][aã]o\b", r"\bpeople\s+analytics\b"],
}

# Mapa de proximidade semântica: se o candidato domina uma skill, possui afinidade parcial com relacionadas
RELATED_SKILLS: dict[str, set[str]] = {
    "Python": {"Django", "FastAPI", "Flask", "Pandas", "NumPy"},
    "Django": {"Python", "FastAPI", "Flask", "REST API"},
    "FastAPI": {"Python", "Django", "Flask", "REST API"},
    "Flask": {"Python", "FastAPI", "Django", "REST API"},
    "React": {"Next.js", "TypeScript", "JavaScript", "Vue.js", "Angular"},
    "Next.js": {"React", "TypeScript", "JavaScript"},
    "Vue.js": {"React", "JavaScript", "TypeScript", "Angular"},
    "Angular": {"TypeScript", "React", "Vue.js"},
    "Node.js": {"Express", "NestJS", "TypeScript", "JavaScript", "REST API"},
    "Express": {"Node.js", "NestJS", "REST API"},
    "NestJS": {"Node.js", "TypeScript", "Express", "REST API"},
    "PostgreSQL": {"SQL", "MySQL", "SQLite", "SQL Server", "Oracle"},
    "MySQL": {"SQL", "PostgreSQL", "SQLite", "SQL Server"},
    "SQLite": {"SQL", "PostgreSQL", "MySQL"},
    "SQL Server": {"SQL", "PostgreSQL", "MySQL"},
    "AWS": {"Azure", "GCP", "Docker", "Terraform", "DevOps"},
    "Azure": {"AWS", "GCP", "Docker", "DevOps"},
    "GCP": {"AWS", "Azure", "Docker", "DevOps"},
    "Docker": {"Kubernetes", "CI/CD", "Linux", "DevOps"},
    "Kubernetes": {"Docker", "AWS", "GCP", "Azure", "Terraform", "DevOps"},
    "DevOps": {"Docker", "Kubernetes", "CI/CD", "Linux", "AWS"},
    "Segurança da Informação": {"Threat Hunting / YARA", "Linux", "Python", "DevOps"},
    "Threat Hunting / YARA": {"Segurança da Informação", "Python", "Rust", "Linux"},
    "Streamlit": {"Python", "Pandas", "Power BI"},
    "Power BI": {"Tableau", "Excel", "SQL"},
    "Tableau": {"Power BI", "SQL", "Excel"},
    "Cypress": {"Playwright", "Selenium", "QA / Testes"},
    "Playwright": {"Cypress", "Selenium", "QA / Testes"},
    "Selenium": {"Cypress", "Playwright", "QA / Testes"},
    "Flutter": {"Dart", "React Native", "Android", "iOS"},
    "React Native": {"React", "Flutter", "Android", "iOS"},
    "Machine Learning": {"Deep Learning", "Python", "Pandas", "NumPy", "LLM / IA Generativa"},
    "Deep Learning": {"Machine Learning", "Python", "LLM / IA Generativa"},
    "LLM / IA Generativa": {"Python", "Machine Learning", "FastAPI"},
}

ROLE_PROFILES: dict[str, set[str]] = {
    "Desenvolvedor Full Stack": {"React", "Node.js", "TypeScript", "JavaScript", "PostgreSQL", "Next.js", "HTML", "CSS", "REST API"},
    "Desenvolvedor Backend": {"Python", "Java", "C#", "Go", "Node.js", "Django", "FastAPI", "Flask", "Spring Boot", "PostgreSQL", "Docker", "Microsserviços", "REST API", "SQL"},
    "Desenvolvedor Frontend": {"React", "Vue.js", "Angular", "Next.js", "TypeScript", "JavaScript", "HTML", "CSS", "Tailwind CSS", "Figma"},
    "Engenheiro de Dados / Analytics": {"Python", "SQL", "Apache Spark", "Airflow", "ETL", "AWS", "GCP", "Azure", "PostgreSQL", "Pandas"},
    "Cientista de Dados / IA": {"Python", "Machine Learning", "Deep Learning", "Pandas", "NumPy", "LLM / IA Generativa", "SQL"},
    "Analista de Dados / BI": {"SQL", "Power BI", "Tableau", "Excel", "Python", "ETL"},
    "Engenheiro DevOps / Cloud": {"AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux", "DevOps"},
    "Engenheiro / Analista de Cibersegurança": {"Segurança da Informação", "Threat Hunting / YARA", "Python", "Rust", "Linux", "SQL", "DevOps"},
    "Desenvolvedor Mobile": {"React Native", "Flutter", "Kotlin", "Swift", "Android", "iOS", "Dart"},
    "Engenheiro de QA": {"QA / Testes", "Cypress", "Selenium", "Playwright", "CI/CD", "JavaScript", "Python"},
    "Product Designer (UI/UX)": {"Figma", "UI/UX", "HTML", "CSS", "Product Management"},
    "Product Manager / PO": {"Product Management", "Scrum / Ágil", "Jira", "SQL", "Power BI"},
    "Analista de Marketing Digital": {"Marketing Digital", "CRM", "Excel", "Power BI"},
    "Analista Financeiro / Administrativo": {"Finanças / Contabilidade", "Excel", "Power BI", "SAP"},
    "Executivo Comercial / Vendas": {"Vendas / Comercial", "CRM", "Excel"},
}

ACTION_VERB_PATTERNS = [
    r"\bdesenvolv\w*", r"\blider\w*", r"\bcri(?:ou|ei|ando|acao|ar)\b", r"\bimplement\w*",
    r"\botimiz\w*", r"\breduz\w*", r"\baument\w*", r"\bgerenci\w*", r"\barquitet\w*",
    r"\bautomatiz\w*", r"\bcoord\w*", r"\bconstru\w*", r"\bentreg\w*", r"\bprojet(?:ou|ei|ando|ar)\b",
    r"\bmigr\w*", r"\bconduz\w*", r"\bplanej\w*",
    r"\bbuilt\b", r"\bled\b", r"\bdeveloped\b", r"\bimplemented\b", r"\boptimized\b",
    r"\breduced\b", r"\bincreased\b", r"\bmanaged\b",
]


@dataclass
class ResumeProfile:
    filename: str
    char_count: int
    word_count: int
    pages: int
    skills: list[str]
    suggested_roles: list[str]
    seniority: str
    estimated_years: int | None
    languages: list[str]
    education: list[str]
    email: str | None
    phone: str | None
    linkedin: str | None
    github: str | None
    ats_audit: dict
    summary_excerpt: str
    raw_text: str

    def to_dict(self, include_raw_text: bool = False) -> dict:
        data = asdict(self)
        if not include_raw_text:
            data.pop("raw_text", None)
        return data


def normalize_text(text: str) -> str:
    """Remove acentos e normaliza espaços para comparações auxiliares."""
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", stripped).strip().lower()


def validate_pdf_header(file_stream: BinaryIO) -> None:
    """Valida os magic bytes (%PDF-) para impedir arquivos corrompidos ou falsos PDFs."""
    pos = file_stream.tell()
    header = file_stream.read(8)
    file_stream.seek(pos)
    if not header or not header.lstrip().startswith(b"%PDF-"):
        raise ValueError("O arquivo enviado não é um PDF válido (assinatura %PDF ausente).")


def extract_text_from_pdf(file_stream: BinaryIO) -> tuple[str, int]:
    """Valida e extrai o texto de todas as páginas de um PDF."""
    validate_pdf_header(file_stream)
    reader = PdfReader(file_stream)
    pages_text: list[str] = []
    for page in reader.pages:
        content = page.extract_text() or ""
        if content.strip():
            pages_text.append(content)
    full_text = "\n".join(pages_text).strip()
    return full_text, len(reader.pages)


def extract_skills(text: str) -> list[str]:
    """Identifica habilidades técnicas e profissionais presentes no texto."""
    found: list[str] = []
    for skill_name, patterns in SKILL_CATALOG.items():
        for pattern in patterns:
            if re.search(pattern, text, flags=re.IGNORECASE):
                found.append(skill_name)
                break
    return found


def estimate_experience_years(text: str) -> int | None:
    """Estima anos de experiência evitando confundir anos de graduação ou idade da empresa."""
    explicit_matches = re.findall(
        r"(\d{1,2})\s*\+?\s*(?:anos?|years?)\s+(?:de\s+(?:experi[eê]ncia|atua[cç][aã]o|carreira|trajet[oó]ria|ti)|of\s+experience)",
        text,
        flags=re.IGNORECASE,
    )
    prefix_matches = re.findall(
        r"(?:trajet[oó]ria|experi[eê]ncia|atua[cç][aã]o|carreira)[^.\n]{0,35}?\b(\d{1,2})\s*\+?\s*(?:anos?|years?)\b",
        text,
        flags=re.IGNORECASE,
    )
    candidates = [int(m) for m in (explicit_matches + prefix_matches) if 0 < int(m) <= 40]
    if candidates:
        return max(candidates)

    current_year = date.today().year
    # Tenta isolar a seção de experiência profissional antes de extrair intervalos de datas
    exp_section = text
    exp_match = re.search(
        r"(?:experi[eê]ncia(?:\s+profissional)?|hist[oó]rico\s+profissional|work\s+experience)(.*?)(?:forma[cç][aã]o|educa[cç][aã]o|idiomas|certifica[cç][oõ]es|$)",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if exp_match and len(exp_match.group(1).strip()) > 30:
        exp_section = exp_match.group(1)

    # Captura intervalos tipo "2020 - 2024" ou "2021 - atual"
    ranges = re.findall(
        r"\b(199\d|20[0-2]\d)\s*[-–—aà]+\s*(199\d|20[0-2]\d|atual|presente|present|current)\b",
        exp_section,
        flags=re.IGNORECASE,
    )
    if ranges:
        starts: list[int] = []
        ends: list[int] = []
        for start_s, end_s in ranges:
            start_y = int(start_s)
            end_y = current_year if not end_s.isdigit() else int(end_s)
            if 1990 <= start_y <= current_year and start_y <= end_y <= current_year + 1:
                starts.append(start_y)
                ends.append(min(end_y, current_year))
        if starts and ends:
            span = max(ends) - min(starts)
            if 0 < span <= 35:
                return span

    return None


def detect_seniority(text: str, years: int | None) -> str:
    """Classifica o nível de senioridade do candidato."""
    lower = normalize_text(text)

    if re.search(r"\b(tech\s+lead|staff|principal|especialista|arquiteto|head\s+de|gerente|coordenador)\b", lower):
        return "Sênior / Liderança"
    if re.search(r"\b(senior|sr\.?)\b", lower):
        return "Sênior"
    if years is not None and years >= 6:
        return "Sênior"
    if re.search(r"\b(pleno|mid[- ]?level)\b", lower):
        return "Pleno"
    if years is not None and years >= 3:
        return "Pleno"
    if re.search(r"\b(estagiario|estagio|intern|trainee)\b", lower):
        return "Estágio / Trainee"
    if re.search(r"\b(junior|jr\.?)\b", lower):
        return "Júnior"

    if years is not None:
        if years >= 1:
            return "Júnior"
        return "Estágio / Trainee"

    return "Pleno"


def suggest_roles(skills: list[str], text: str) -> list[str]:
    """Sugere os cargos mais aderentes com base nas skills e texto do currículo."""
    skill_set = set(skills)
    scored: list[tuple[float, str]] = []
    norm_text = normalize_text(text)

    for role, expected_skills in ROLE_PROFILES.items():
        overlap = len(skill_set & expected_skills)
        if overlap == 0:
            continue
        score = overlap / max(len(expected_skills) * 0.5, 1)
        role_keywords = [w for w in normalize_text(role).split() if len(w) > 3]
        if any(k in norm_text for k in role_keywords):
            score += 0.35
        scored.append((score, role))

    scored.sort(key=lambda item: item[0], reverse=True)
    roles = [role for _, role in scored[:3]]
    return roles if roles else ["Profissional de Tecnologia / Geral"]


def detect_languages(text: str) -> list[str]:
    lower = normalize_text(text)
    found: list[str] = []
    lang_map = {
        "Português": ["portugues", "nativo"],
        "Inglês": ["ingles", "english", "toefl", "ielts", "cambridge"],
        "Espanhol": ["espanhol", "spanish"],
        "Francês": ["frances", "french"],
        "Alemão": ["alemao", "german"],
    }
    for lang, keywords in lang_map.items():
        if any(k in lower for k in keywords):
            found.append(lang)
    return found


def detect_education(text: str) -> list[str]:
    lower = normalize_text(text)
    # Remove expressão "engenharia de prompts" para evitar falso positivo em Ensino Superior
    cleaned = re.sub(r"\bengenharia\s+de\s+prompts?\b", "", lower)
    levels: list[str] = []
    edu_map = {
        "Doutorado": [r"\bdoutorado\b", r"\bphd\b", r"\bph\.d\b"],
        "Mestrado": [r"\bmestrado\b", r"\bmaster\b", r"\bm\.sc\b"],
        "Pós-graduação / MBA": [r"\bpos[- ]graduacao\b", r"\bmba\b", r"\bespecializacao\b"],
        "Ensino Superior": [
            r"\bbacharelado\b", r"\bgraduacao\b", r"\btecnologo\b", r"\blicenciatura\b",
            r"\bcurso\s+superior\b", r"\bensino\s+superior\b", r"\bcst\b",
            r"\banalise\s+e\s+desenvolvimento\s+de\s+sistemas\b", r"\bciencia\s+da\s+computacao\b",
            r"\bengenharia\b", r"\bsistemas\s+de\s+informacao\b", r"\badministracao\b",
        ],
        "Curso Técnico": [r"\btecnico\s+em\b", r"\bensino\s+tecnico\b"],
    }
    for label, patterns in edu_map.items():
        if any(re.search(p, cleaned) for p in patterns):
            levels.append(label)
    return levels


def evaluate_ats_readiness(
    raw_text: str,
    pages: int,
    word_count: int,
    skills: list[str],
    email: str | None,
    phone: str | None,
    linkedin: str | None,
    github: str | None,
) -> dict:
    """Diagnostica a qualidade ATS do currículo (0–100) com checklist acionável."""
    norm = normalize_text(raw_text)
    checks: list[dict] = []
    score = 0

    # 1. Legibilidade e extensão (20 pts)
    ideal_length = 1 <= pages <= 2 and 120 <= word_count <= 1400
    if ideal_length:
        score += 20
        checks.append({"status": "ok", "label": "Extensão ideal para ATS", "tip": f"{pages} página(s) e {word_count} palavras — leitura rápida por recrutadores e ATS."})
    else:
        score += 10
        tip = "Mantenha o currículo entre 1 e 2 páginas (150–1200 palavras) para melhor triagem."
        checks.append({"status": "warn", "label": "Extensão fora do padrão ideal", "tip": tip})

    # 2. Dados de contato e links profissionais (20 pts)
    contact_points = 0
    missing_contacts = []
    if email:
        contact_points += 10
    else:
        missing_contacts.append("e-mail")
    if phone or linkedin or github:
        contact_points += 10
    else:
        missing_contacts.append("telefone ou LinkedIn/GitHub")
    score += contact_points
    if contact_points == 20:
        checks.append({"status": "ok", "label": "Contato e presença profissional", "tip": "E-mail e canais profissionais detectados corretamente."})
    else:
        checks.append({"status": "warn", "label": "Informações de contato incompletas", "tip": f"Inclua {' e '.join(missing_contacts)} no cabeçalho."})

    # 3. Seções estruturadas (20 pts)
    has_exp = any(k in norm for k in ["experiencia", "experience", "historico profissional"])
    has_edu = any(k in norm for k in ["formacao", "educacao", "education", "academica"])
    has_summary = any(k in norm for k in ["resumo", "objetivo", "sobre", "summary", "profile"])
    sections_found = sum([has_exp, has_edu, has_summary])
    if sections_found == 3:
        score += 20
        checks.append({"status": "ok", "label": "Estrutura de seções padrão ATS", "tip": "Resumo, Experiência e Formação claramente identificáveis."})
    else:
        score += sections_found * 6
        missing_sec = [name for ok, name in [(has_summary, "Resumo"), (has_exp, "Experiência"), (has_edu, "Formação")] if not ok]
        checks.append({"status": "warn", "label": "Seções padrão ausentes", "tip": f"Use títulos claros para: {', '.join(missing_sec)}."})

    # 4. Densidade de palavras-chave / Skills (20 pts)
    if len(skills) >= 6:
        score += 20
        checks.append({"status": "ok", "label": "Boa densidade de palavras-chave", "tip": f"{len(skills)} habilidades técnicas/profissionais reconhecidas."})
    elif len(skills) >= 3:
        score += 12
        checks.append({"status": "warn", "label": "Poucas palavras-chave técnicas", "tip": "Detalhe mais ferramentas, linguagens e metodologias usadas nos projetos."})
    else:
        score += 5
        checks.append({"status": "fail", "label": "Baixa cobertura de palavras-chave", "tip": "Adicione uma seção explícita de Habilidades com termos padrão do mercado."})

    # 5. Resultados mensuráveis & verbos de ação (20 pts)
    has_metrics = bool(re.search(r"(\d+\s*%|r\$\s*\d|\$\s*\d|\b\d+x\b|\b\d{2,}\s*(?:usuarios|clientes|projetos|mil|k)\b)", norm))
    has_verbs = sum(1 for p in ACTION_VERB_PATTERNS if re.search(p, norm)) >= 2
    if has_metrics and has_verbs:
        score += 20
        checks.append({"status": "ok", "label": "Impacto mensurável e verbos de ação", "tip": "Ótimo uso de métricas e verbos de conquista nas experiências."})
    elif has_verbs:
        score += 12
        checks.append({"status": "warn", "label": "Faltam resultados quantificados", "tip": "Adicione números e métricas (ex: 'reduziu tempo de resposta em 35%', 'atendeu 50 mil usuários')."})
    else:
        score += 6
        checks.append({"status": "warn", "label": "Experiências muito descritivas", "tip": "Comece os tópicos com verbos de ação (Desenvolveu, Otimizou, Liderou) acompanhados de métricas."})

    # 6. Alerta de campos de modelo / placeholders não preenchidos
    placeholders = re.findall(
        r"\[(?:inserir|confirmar|ajustar|informar|digite|seu\s+|preencher)[^\]]*\]",
        norm,
    )
    if placeholders:
        score = max(score - 10, 0)
        checks.append(
            {
                "status": "warn",
                "label": f"{len(placeholders)} campo(s) de modelo não preenchido(s)",
                "tip": "Remova ou preencha instruções entre colchetes como '[Inserir mês/ano...]' antes de enviar o currículo.",
            }
        )

    level = "Excelente" if score >= 85 else ("Bom" if score >= 65 else "Precisa de Ajustes")
    return {
        "score": min(score, 100),
        "level": level,
        "checks": checks,
    }


def parse_resume_pdf(file_stream: BinaryIO, filename: str = "curriculo.pdf") -> ResumeProfile:
    """Pipeline completo de leitura, extração e auditoria ATS do currículo em PDF."""
    raw_text, pages = extract_text_from_pdf(file_stream)
    if not raw_text:
        raise ValueError(
            "Não foi possível extrair texto deste PDF. Verifique se o arquivo não é apenas uma imagem escaneada."
        )

    skills = extract_skills(raw_text)
    years = estimate_experience_years(raw_text)
    seniority = detect_seniority(raw_text, years)
    roles = suggest_roles(skills, raw_text)
    languages = detect_languages(raw_text)
    education = detect_education(raw_text)

    email_match = re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", raw_text)
    phone_match = re.search(r"(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\d{4}|\d{4})[-.\s]?\d{4}", raw_text)
    linkedin_match = re.search(r"(?:https?://)?(?:www\.)?linkedin\.com/in/[a-zA-Z0-9\-_%]+", raw_text, flags=re.IGNORECASE)
    github_match = re.search(r"(?:https?://)?(?:www\.)?github\.com/[a-zA-Z0-9\-_]+", raw_text, flags=re.IGNORECASE)

    email = email_match.group(0) if email_match else None
    phone = phone_match.group(0).strip() if phone_match else None
    linkedin = linkedin_match.group(0) if linkedin_match else None
    github = github_match.group(0) if github_match else None

    word_count = len(raw_text.split())
    ats_audit = evaluate_ats_readiness(
        raw_text=raw_text,
        pages=pages,
        word_count=word_count,
        skills=skills,
        email=email,
        phone=phone,
        linkedin=linkedin,
        github=github,
    )

    clean_excerpt = re.sub(r"\s+", " ", raw_text).strip()[:320]
    if len(raw_text) > 320:
        clean_excerpt += "..."

    return ResumeProfile(
        filename=filename,
        char_count=len(raw_text),
        word_count=word_count,
        pages=pages,
        skills=skills,
        suggested_roles=roles,
        seniority=seniority,
        estimated_years=years,
        languages=languages,
        education=education,
        email=email,
        phone=phone,
        linkedin=linkedin,
        github=github,
        ats_audit=ats_audit,
        summary_excerpt=clean_excerpt,
        raw_text=raw_text,
    )


def generate_sample_resume_pdf() -> bytes:
    """Gera um PDF válido de currículo de exemplo em Python puro (sem dependências extras)."""
    lines = [
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
    ]

    def pdf_escape(s: str) -> str:
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    content_commands = ["BT", "/F1 10.5 Tf", "45 770 Td", "15 TL"]
    for idx, line in enumerate(lines):
        escaped = pdf_escape(line)
        if idx == 0:
            content_commands.append(f"({escaped}) Tj")
        else:
            content_commands.append(f"T* ({escaped}) Tj")
    content_commands.append("ET")
    stream_bytes = "\n".join(content_commands).encode("latin-1")

    objects: list[bytes] = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        f"5 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n".encode("ascii")
        + stream_bytes
        + b"\nendstream\nendobj\n",
    ]

    buffer = io.BytesIO()
    buffer.write(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(buffer.tell())
        buffer.write(obj)

    xref_pos = buffer.tell()
    buffer.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    buffer.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        buffer.write(f"{offset:010d} 00000 n \n".encode("ascii"))

    buffer.write(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("ascii")
    )
    return buffer.getvalue()
