from __future__ import annotations

import io
import re
import xml.etree.ElementTree as ET
import zipfile
from typing import Any

from pypdf import PdfReader

from services.linkedin_cv.ats_engine import analyze_job_description
from services.resume_parser import extract_skills

SECTION_PATTERNS: dict[str, re.Pattern[str]] = {
    "summary": re.compile(r"^(?:resumo(?:\s+profissional)?|objetivo|professional\s+summary|summary|profil)\b", re.IGNORECASE),
    "skills": re.compile(r"^(?:compet[êe]ncias(?:\s+t[ée]cnicas)?|habilidades|technical\s+skills|skills|comp[ée]tences)\b", re.IGNORECASE),
    "experience": re.compile(r"^(?:experi[êe]ncia(?:\s+profissional)?|hist[óo]rico|professional\s+experience|experience)\b", re.IGNORECASE),
    "education": re.compile(r"^(?:forma[çc][ãa]o(?:\s+acad[êe]mica)?|educa[çc][ãa]o|education|formaci[óo]n)\b", re.IGNORECASE),
    "certifications": re.compile(r"^(?:certifica[çc][õo]es|certifications)\b", re.IGNORECASE),
    "projects": re.compile(r"^(?:projetos(?:\s+relevantes)?|key\s+projects|projects)\b", re.IGNORECASE),
    "languages": re.compile(r"^(?:idiomas|languages|langues)\b", re.IGNORECASE),
}


def simulate_ats_reading(
    *,
    file_bytes: bytes | None = None,
    filename: str = "",
    raw_text: str = "",
    job_description: str = "",
) -> dict[str, Any]:
    """
    Módulo 1 — Simulador Inteligente de Leitura ATS.
    Executa extração real de PDF/DOCX, reconstrução de ordem de leitura,
    detecção de problemas estruturais e comparação com a vaga.
    Nota: avaliação técnica própria; não reproduz internals proprietários de terceiros.
    """
    issues: list[str] = []
    file_format = "text"
    extracted_text = str(raw_text or "").strip()

    if file_bytes:
        low_name = filename.lower()
        if low_name.endswith(".pdf") or file_bytes.lstrip().startswith(b"%PDF-"):
            file_format = "pdf"
            try:
                reader = PdfReader(io.BytesIO(file_bytes))
                pages_txt = [(p.extract_text() or "").strip() for p in reader.pages]
                extracted_text = "\n".join(t for t in pages_txt if t).strip()
                if not extracted_text:
                    issues.append("PDF sem texto extraível (possível PDF composto apenas por imagens / falha de OCR).")
            except Exception as exc:
                issues.append(f"Falha ao extrair texto do PDF: {exc}")
        elif low_name.endswith(".docx") or file_bytes.startswith(b"PK"):
            file_format = "docx"
            try:
                with zipfile.ZipFile(io.BytesIO(file_bytes), "r") as zf:
                    names = zf.namelist()
                    xml_raw = zf.read("word/document.xml").decode("utf-8", errors="replace")
                    if "<w:tbl" in xml_raw:
                        issues.append("Tabelas detectadas no DOCX (<w:tbl>) — podem embaralhar a ordem de leitura ATS.")
                    if "<w:cols" in xml_raw and 'w:num="2"' in xml_raw:
                        issues.append("Múltiplas colunas detectadas no DOCX — risco de mistura de seções.")
                    if "<w:drawing" in xml_raw or "<w:pict" in xml_raw:
                        issues.append("Elementos gráficos/imagens detectados no DOCX.")
                    if any(n.startswith("word/header") or n.startswith("word/footer") for n in names):
                        issues.append("Cabeçalhos/rodapés presentes no DOCX — evite colocar contatos essenciais neles.")
                    root = ET.fromstring(xml_raw)
                    paras = []
                    for p in root.iter():
                        if p.tag.endswith("}p"):
                            txt = "".join(t.text for t in p.iter() if t.tag.endswith("}t") and t.text).strip()
                            if txt:
                                paras.append(txt)
                    extracted_text = "\n".join(paras).strip()
                    if not extracted_text:
                        issues.append("DOCX sem texto legível extraível.")
            except Exception as exc:
                issues.append(f"Falha ao extrair texto do DOCX: {exc}")
        else:
            file_format = "unsupported"
            issues.append("Formato não suportado para simulação ATS (envie PDF ou DOCX).")

    if "\ufffd" in extracted_text:
        issues.append("Caracteres especiais corrompidos (U+FFFD) detectados na extração.")

    lines = [ln.strip() for ln in extracted_text.splitlines() if ln.strip()]
    seen_lines: set[str] = set()
    duplicates = 0
    for ln in lines:
        low = ln.lower()
        if low in seen_lines and len(low) > 15:
            duplicates += 1
        seen_lines.add(low)
    if duplicates > 0:
        issues.append(f"{duplicates} linha(s) duplicada(s) detectada(s) no documento.")

    # Reconstrução de seções e origem/confiança
    recognized_sections: list[str] = []
    structured: dict[str, Any] = {
        "candidate": {"name": lines[0] if lines else "", "origin": "line_1", "confidence": 88 if lines else 0},
        "contacts": [],
        "summary": [],
        "skills": [],
        "experiences": [],
        "education": [],
        "certifications": [],
        "languages": [],
        "projects": [],
        "links": [],
    }

    current_sec = "header"
    for idx, ln in enumerate(lines, start=1):
        matched_sec = None
        for sec_key, pat in SECTION_PATTERNS.items():
            if pat.match(ln):
                matched_sec = sec_key
                break
        if matched_sec:
            current_sec = matched_sec
            if matched_sec not in recognized_sections:
                recognized_sections.append(matched_sec)
            continue

        item = {"text": ln, "origin": f"line_{idx}", "confidence": 86}
        if current_sec == "summary":
            structured["summary"].append(item)
        elif current_sec == "experience":
            structured["experiences"].append(item)
        elif current_sec == "education":
            structured["education"].append(item)
        elif current_sec == "certifications":
            structured["certifications"].append(item)
        elif current_sec == "languages":
            structured["languages"].append(item)
        elif current_sec == "projects":
            structured["projects"].append(item)

    emails = re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", extracted_text)
    phones = re.findall(r"(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,3}\)?[\s-]?)?\d{4,5}[-\s]?\d{4}", extracted_text)
    links = re.findall(r"https?://[^\s|]+|(?:linkedin\.com/in/|github\.com/)[A-Za-z0-9_.-]+", extracted_text, re.IGNORECASE)
    for em in emails:
        structured["contacts"].append({"type": "email", "value": em, "origin": "regex_email", "confidence": 96})
    for ph in phones[:2]:
        structured["contacts"].append({"type": "phone", "value": ph, "origin": "regex_phone", "confidence": 85})
    for lk in links:
        structured["links"].append({"url": lk, "origin": "regex_url", "confidence": 92})

    skills_found = extract_skills(extracted_text)
    structured["skills"] = [{"name": s, "origin": "nlp_skill_catalog", "confidence": 90} for s in skills_found]

    if not emails:
        issues.append("E-mail profissional não identificado no texto extraível.")
    if not recognized_sections:
        issues.append("Nenhuma seção padrão ATS reconhecida (ex.: RESUMO PROFISSIONAL, EXPERIÊNCIA, COMPETÊNCIAS).")

    # Consistência cronológica simples
    years = [int(y) for y in re.findall(r"\b(19\d{2}|20\d{2})\b", extracted_text)]
    if any(y > 2030 for y in years):
        issues.append("Data futura inconsistente detectada no currículo.")

    # Comparação com vaga (se fornecida)
    job_compat = None
    unrecognized_info: list[str] = []
    if job_description.strip():
        ja = analyze_job_description(job_description)
        req_skills = ja.get("mandatory_skills") or []
        found_low = {s.lower() for s in skills_found}
        matched = [s for s in req_skills if s.lower() in found_low]
        missing = [s for s in req_skills if s.lower() not in found_low]
        job_compat = {
            "score": round((len(matched) / len(req_skills)) * 100) if req_skills else 80,
            "matched_keywords": matched,
            "missing_keywords": missing,
        }
        if missing:
            unrecognized_info.append(f"Termos da vaga não localizados no texto extraído: {', '.join(missing[:5])}")

    extraction_pct = max(0, min(100, (40 if extracted_text else 0) + min(30, len(recognized_sections) * 8) + (15 if emails else 0) + (15 if skills_found else 0) - len(issues) * 6))
    text_integrity = 100 if (extracted_text and "\ufffd" not in extracted_text) else (45 if extracted_text else 0)

    recommendations = []
    if issues:
        recommendations.extend(f"Corrigir: {iss}" for iss in issues[:4])
    else:
        recommendations.append("Documento limpo e compatível com leitura linear por sistemas ATS.")

    return {
        "disclaimer": "Avaliação técnica própria do Simulador ATS VagaPulse AI (não reproduz algoritmos proprietários internos de Workday, Gupy, Greenhouse etc.).",
        "file_format": file_format,
        "extraction_pct": extraction_pct,
        "text_integrity": text_integrity,
        "recognized_sections": recognized_sections,
        "identified_keywords": skills_found,
        "unrecognized_info": unrecognized_info,
        "structural_issues": issues,
        "job_compatibility": job_compat,
        "recommendations": recommendations,
        "reconstructed_profile": structured,
        "extracted_text": extracted_text,
    }
