from __future__ import annotations

import io
import re
import unicodedata
import zipfile
from datetime import datetime, timezone
from typing import Any
from xml.sax.saxutils import escape as xml_escape

from services.resume_parser import extract_skills, suggest_roles


CV_TEMPLATES: dict[str, dict[str, str]] = {
    "complete": {"label": "Currículo Profissional Completo", "focus": "Visão integral de carreira, entregas, projetos e formação"},
    "executive": {"label": "Currículo Executivo", "focus": "Liderança, estratégia, KPIs, governança e impacto em negócios"},
    "technical": {"label": "Currículo Técnico", "focus": "Arquitetura, stack tecnológica, projetos e entregas mensuráveis"},
    "academic": {"label": "Currículo Acadêmico", "focus": "Formação, pesquisa, publicações, docência e projetos científicos"},
    "technology": {"label": "Currículo para Tecnologia", "focus": "Sistemas escaláveis, cloud, engenharia e colaboração ágil"},
    "infosec": {"label": "Currículo para Segurança da Informação", "focus": "Defesa cibernética, AppSec, SIEM, governança e resposta a incidentes"},
    "data_analytics": {"label": "Currículo para Análise de Dados", "focus": "SQL, Python, BI, modelagem estatística e indicadores de negócio"},
    "software_dev": {"label": "Currículo para Desenvolvimento de Software", "focus": "APIs, frontend/backend, testes automatizados e CI/CD"},
    "edtech": {"label": "Currículo para Educação e Tecnologia", "focus": "Ensino técnico, metodologias ativas, LMS e capacitação digital"},
    "job_tailored": {"label": "Currículo Personalizado para Vaga", "focus": "Alinhado aos requisitos e palavras-chave reais da vaga selecionada"},
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tag_field(value: Any, origin: str, confidence: int = 85, confirmed: bool = False) -> dict[str, Any]:
    now = _now_iso()
    return {
        "value": value,
        "origin": origin,
        "imported_at": now,
        "updated_at": now,
        "confidence": confidence,
        "validation_status": "confirmed" if confirmed else "pending_review",
        "user_confirmed": confirmed,
    }


class LinkedinDataNormalizer:
    """Normaliza dados oficiais do LinkedIn e entradas manuais/PDF no esquema canônico com proveniência."""

    def normalize(
        self,
        *,
        linkedin_data: dict[str, Any] | None = None,
        manual_data: dict[str, Any] | None = None,
        resume_text: str = "",
    ) -> dict[str, Any]:
        li = linkedin_data or {}
        man = manual_data or {}

        name = man.get("name") or li.get("name") or ""
        name_origin = "user_manual" if man.get("name") else ("linkedin_api" if li.get("name") else "missing")

        email = man.get("email") or li.get("email") or ""
        email_origin = "user_manual" if man.get("email") else ("linkedin_api" if li.get("email") else "missing")

        headline = man.get("headline") or ""
        summary = man.get("summary") or ""
        experiences = list(man.get("experiences") or [])
        education = list(man.get("education") or [])
        courses = list(man.get("courses") or [])
        certifications = list(man.get("certifications") or [])
        languages = list(man.get("languages") or [])
        projects = list(man.get("projects") or [])
        soft_skills = list(man.get("soft_skills") or [])
        links = list(man.get("links") or [])

        extracted_skills = extract_skills(resume_text) if resume_text else []
        manual_skills = list(man.get("technical_skills") or [])
        tech_skills = list(dict.fromkeys([*manual_skills, *extracted_skills]))
        if not headline and tech_skills:
            roles = suggest_roles(tech_skills, resume_text)
            headline = roles[0] if roles else ""

        conflicts = []
        if li.get("name") and man.get("name") and li["name"].strip().lower() != man["name"].strip().lower():
            conflicts.append({"field": "name", "linkedin": li["name"], "manual": man["name"], "status": "needs_confirmation"})
        if li.get("email") and man.get("email") and li["email"].strip().lower() != man["email"].strip().lower():
            conflicts.append({"field": "email", "linkedin": li["email"], "manual": man["email"], "status": "needs_confirmation"})

        return {
            "name": _tag_field(name, name_origin, 95 if name else 0, bool(man.get("name"))),
            "headline": _tag_field(headline, "user_manual" if man.get("headline") else ("resume_extract" if headline else "missing"), 85 if headline else 0, bool(man.get("headline"))),
            "summary": _tag_field(summary, "user_manual" if summary else "missing", 90 if summary else 0, bool(summary)),
            "email": _tag_field(email, email_origin, 95 if email else 0, bool(man.get("email") or li.get("email_verified"))),
            "experiences": _tag_field(experiences, "user_manual" if experiences else "missing", 90 if experiences else 0, bool(experiences)),
            "technical_skills": _tag_field(tech_skills, "user_manual" if manual_skills else ("resume_extract" if extracted_skills else "missing"), 88 if tech_skills else 0, bool(manual_skills)),
            "soft_skills": _tag_field(soft_skills, "user_manual" if soft_skills else "missing", 85 if soft_skills else 0, bool(soft_skills)),
            "education": _tag_field(education, "user_manual" if education else "missing", 90 if education else 0, bool(education)),
            "courses": _tag_field(courses, "user_manual" if courses else "missing", 85 if courses else 0, bool(courses)),
            "certifications": _tag_field(certifications, "user_manual" if certifications else "missing", 90 if certifications else 0, bool(certifications)),
            "languages": _tag_field(languages, "user_manual" if languages else "missing", 85 if languages else 0, bool(languages)),
            "projects": _tag_field(projects, "user_manual" if projects else "missing", 88 if projects else 0, bool(projects)),
            "links": _tag_field(links, "user_manual" if links else "missing", 90 if links else 0, bool(links)),
            "conflicts": conflicts,
            "unavailable_from_linkedin_api": li.get("unavailable_fields", []),
            "updated_at": _now_iso(),
        }


class CvOptimizationEngine:
    """
    Analisa perfil consolidado sem inventar dados.
    Diferencia: Informação comprovada, declarada, inferência da IA, sugestão e pendente de confirmação.
    """

    def analyze_profile(self, profile: dict[str, Any]) -> dict[str, Any]:
        incomplete = []
        suggestions = []
        unverified_skills = []
        missing_in_skills_section = []

        name = (profile.get("name") or {}).get("value") or ""
        summary = (profile.get("summary") or {}).get("value") or ""
        experiences = (profile.get("experiences") or {}).get("value") or []
        tech_skills = (profile.get("technical_skills") or {}).get("value") or []
        education = (profile.get("education") or {}).get("value") or []

        if not name:
            incomplete.append("Nome profissional ausente.")
        if not summary:
            incomplete.append("Resumo profissional ausente.")
        if not experiences:
            incomplete.append("Nenhuma experiência profissional estruturada cadastrada.")
        if not education:
            incomplete.append("Formação acadêmica não informada.")

        exp_text = " ".join(
            f"{e.get('role', '')} {e.get('company', '')} {e.get('responsibilities', '')} {e.get('results', '')} {' '.join(e.get('technologies') or [])}"
            for e in experiences if isinstance(e, dict)
        )
        exp_skills = extract_skills(exp_text) if exp_text.strip() else []
        declared_lower = {s.lower() for s in tech_skills}

        for sk in exp_skills:
            if sk.lower() not in declared_lower:
                missing_in_skills_section.append(sk)
                suggestions.append({
                    "classification": "Sugestão de melhoria (pendente de confirmação)",
                    "message": f"A tecnologia '{sk}' aparece nas suas experiências, mas não na seção de competências.",
                })

        exp_lower = exp_text.lower()
        for sk in tech_skills:
            if sk.lower() not in exp_lower:
                unverified_skills.append(sk)

        if unverified_skills:
            suggestions.append({
                "classification": "Informação declarada sem evidência em experiências",
                "message": f"Competências declaradas sem projeto/experiência associada: {', '.join(unverified_skills[:5])}.",
            })

        # Verifica datas antigas ou inválidas nas experiências
        outdated = []
        for e in experiences:
            if isinstance(e, dict):
                end = str(e.get("end_date") or "").strip()
                if end and re.match(r"^\d{4}", end) and int(end[:4]) < 2020:
                    outdated.append(f"{e.get('role', 'Cargo')} ({end})")
        if outdated:
            suggestions.append({
                "classification": "Inferência da IA",
                "message": f"Experiências anteriores a 2020 identificadas ({', '.join(outdated[:3])}); revise se estão atualizadas.",
            })

        return {
            "incomplete_fields": incomplete,
            "skills_in_experience_missing_from_list": missing_in_skills_section,
            "declared_skills_without_evidence": unverified_skills,
            "conflicts": profile.get("conflicts", []),
            "suggestions": suggestions,
            "ats_readiness": {
                "has_contact": bool(name and (profile.get("email") or {}).get("value")),
                "has_summary": bool(summary),
                "has_experiences": bool(experiences),
                "has_skills": bool(tech_skills),
                "has_education": bool(education),
            },
        }


class CvBuilderService:
    """Constrói currículos ATS em 10 formatos e exporta PDF e DOCX reais sem bibliotecas externas."""

    def build_cv_text(
        self,
        profile: dict[str, Any],
        template_key: str = "complete",
        job_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        tpl = CV_TEMPLATES.get(template_key, CV_TEMPLATES["complete"])
        name = (profile.get("name") or {}).get("value") or "PROFISSIONAL"
        headline = (profile.get("headline") or {}).get("value") or tpl["label"]
        email = (profile.get("email") or {}).get("value") or ""
        links = (profile.get("links") or {}).get("value") or []
        summary = (profile.get("summary") or {}).get("value") or ""
        experiences = list((profile.get("experiences") or {}).get("value") or [])
        tech_skills = list((profile.get("technical_skills") or {}).get("value") or [])
        soft_skills = list((profile.get("soft_skills") or {}).get("value") or [])
        education = list((profile.get("education") or {}).get("value") or [])
        certifications = list((profile.get("certifications") or {}).get("value") or [])
        languages = list((profile.get("languages") or {}).get("value") or [])
        projects = list((profile.get("projects") or {}).get("value") or [])

        # Ordenação cronológica reversa segura (sem quebrar com datas inválidas)
        def _sort_key(item: dict[str, Any]) -> str:
            s = str(item.get("start_date") or "")
            return s if re.match(r"^\d{4}", s) else "0000"

        experiences = [e for e in experiences if isinstance(e, dict)]
        experiences.sort(key=_sort_key, reverse=True)

        # Se orientado à vaga, prioriza competências reais que casam com a vaga (sem inventar!)
        job_matched = []
        if job_context:
            j_text = f"{job_context.get('title', '')} {job_context.get('description', '')}".lower()
            job_matched = [s for s in tech_skills if s.lower() in j_text]
            remaining = [s for s in tech_skills if s not in job_matched]
            tech_skills = [*job_matched, *remaining]

        lines = [
            f"{name.upper()} — {headline}",
            " | ".join([p for p in [email, *links[:2]] if p]),
            "",
            "RESUMO PROFISSIONAL",
            summary or f"Atuação direcionada a {headline} ({tpl['focus']}).",
            "",
        ]
        if tech_skills or soft_skills:
            lines.append("COMPETÊNCIAS")
            if tech_skills:
                lines.append(f"Técnicas: {' · '.join(tech_skills)}")
            if soft_skills:
                lines.append(f"Comportamentais: {' · '.join(soft_skills)}")
            lines.append("")

        if experiences:
            lines.append("EXPERIÊNCIA PROFISSIONAL")
            for exp in experiences:
                period = f"{exp.get('start_date', '')} - {exp.get('end_date') or 'Atual'}".strip(" -")
                lines.append(f"{exp.get('role', 'Cargo')} | {exp.get('company', 'Empresa')} ({period})")
                if exp.get("responsibilities"):
                    lines.append(f"- Responsabilidades: {exp['responsibilities']}")
                if exp.get("results"):
                    lines.append(f"- Resultados: {exp['results']}")
                if exp.get("technologies"):
                    lines.append(f"- Tecnologias: {', '.join(exp['technologies'])}")
                lines.append("")

        if projects:
            lines.append("PROJETOS")
            for p in projects:
                lines.append(f"- {p.get('name', p) if isinstance(p, dict) else p}")
            lines.append("")

        if education:
            lines.append("FORMAÇÃO ACADÊMICA")
            for ed in education:
                lines.append(f"- {ed.get('degree', ed) if isinstance(ed, dict) else ed}")
            lines.append("")

        if certifications:
            lines.append("CERTIFICAÇÕES")
            for c in certifications:
                lines.append(f"- {c}")
            lines.append("")

        if languages:
            lines.append("IDIOMAS")
            lines.append(" | ".join(str(l) for l in languages))

        text = "\n".join(lines).strip()
        return {
            "template": template_key,
            "template_label": tpl["label"],
            "job_matched_skills": job_matched,
            "content_text": text,
        }

    def export_pdf_bytes(self, text: str) -> bytes:
        normalized = unicodedata.normalize("NFD", str(text or ""))
        ascii_text = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
        ascii_text = re.sub(r"[^\x20-\x7E\n]", " ", ascii_text)

        raw_lines: list[str] = []
        for ln in ascii_text.splitlines():
            ln = ln.strip()
            if not ln:
                raw_lines.append(" ")
                continue
            while len(ln) > 88:
                split_at = ln.rfind(" ", 0, 88)
                if split_at <= 0:
                    split_at = 88
                raw_lines.append(ln[:split_at])
                ln = ln[split_at:].strip()
            raw_lines.append(ln)
        if not raw_lines:
            raw_lines = ["Curriculo VagaPulse AI"]

        pages = [raw_lines[i : i + 48] for i in range(0, len(raw_lines), 48)]
        esc = lambda s: s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        font_id = 3 + len(pages) * 2
        objects: list[str] = ["1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", ""]
        page_ids: list[int] = []

        for idx, plines in enumerate(pages):
            pid = 3 + idx * 2
            cid = pid + 1
            page_ids.append(pid)
            cmds = ["BT", "/F1 10 Tf", "45 785 Td", "14 TL"]
            for li, line in enumerate(plines):
                cmds.append(f"({esc(line)}) Tj" if li == 0 else f"T* ({esc(line)}) Tj")
            cmds.append("ET")
            stream = "\n".join(cmds)
            objects.append(f"{pid} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {cid} 0 R >>\nendobj\n")
            objects.append(f"{cid} 0 obj\n<< /Length {len(stream)} >>\nstream\n{stream}\nendstream\nendobj\n")

        objects[1] = f"2 0 obj\n<< /Type /Pages /Kids [{' '.join(f'{i} 0 R' for i in page_ids)}] /Count {len(page_ids)} >>\nendobj\n"
        objects.append(f"{font_id} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n")

        buf = io.BytesIO()
        buf.write(b"%PDF-1.4\n")
        offsets = [0]
        for obj in objects:
            offsets.append(buf.tell())
            buf.write(obj.encode("latin-1"))
        xref_pos = buf.tell()
        buf.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("latin-1"))
        for off in offsets[1:]:
            buf.write(f"{off:010d} 00000 n \n".encode("latin-1"))
        buf.write(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("latin-1"))
        return buf.getvalue()

    def export_docx_bytes(self, text: str) -> bytes:
        paragraphs = []
        for line in str(text or "").splitlines():
            escaped = xml_escape(line)
            if line.isupper() and len(line.strip()) > 3:
                paragraphs.append(f"<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space=\"preserve\">{escaped}</w:t></w:r></w:p>")
            else:
                paragraphs.append(f"<w:p><w:r><w:t xml:space=\"preserve\">{escaped}</w:t></w:r></w:p>")

        document_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body>{''.join(paragraphs)}<w:sectPr/></w:body></w:document>"
        )
        content_types = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            "</Types>"
        )
        rels_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            "</Relationships>"
        )
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("[Content_Types].xml", content_types)
            zf.writestr("_rels/.rels", rels_xml)
            zf.writestr("word/document.xml", document_xml)
        return buf.getvalue()
