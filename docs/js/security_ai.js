/**
 * VagaPulse AI — Motor Autônomo de IA para Detecção de Invasões & Acessos Não Autorizados (Navegador)
 * Monitora entradas, parâmetros de URL e uploads em tempo real, persistindo um documento de auditoria.
 */

import { idbGet, idbSet } from "./storage.js";

const THREAT_PATTERNS = [
  {
    category: "XSS / Script Injection",
    weight: 45,
    regex: /(<\s*script\b|javascript\s*:|\bon(?:error|load|mouseover|focus)\s*=|<\s*iframe\b|<\s*svg\b[^>]*on\w+=)/i,
    detail: "Tentativa de injeção de script/XSS detectada.",
  },
  {
    category: "SQL Injection",
    weight: 45,
    regex: /(\bunion\b\s+\bselect\b|\bor\b\s+1\s*=\s*1|;\s*drop\s+table|\bsleep\s*\(|\bwaitfor\s+delay\b|'\s*or\s*'1'\s*=\s*'1)/i,
    detail: "Padrão de injeção SQL detectado.",
  },
  {
    category: "Path Traversal / LFI",
    weight: 45,
    regex: /(\.\.\/|\.\.\\|%2e%2e%2f|\/etc\/passwd|c:\\windows\\win\.ini)/i,
    detail: "Tentativa de travessia de diretórios.",
  },
  {
    category: "Command Injection / RCE",
    weight: 50,
    regex: /(;\s*(?:cat|ls|whoami|curl|wget|bash|sh)\b|&&\s*(?:whoami|id|powershell)|`[^`]{2,}`|\$\([^)]+\))/i,
    detail: "Padrão de injeção de comando detectado.",
  },
  {
    category: "Acesso Não Autorizado / Rota Sensível",
    weight: 40,
    regex: /(\/\.env|\/\.git|\/wp-admin|\/phpmyadmin|\/admin\b|token=|bypass_auth|escalate)/i,
    detail: "Tentativa de acesso a rota administrativa ou parâmetro não autorizado.",
  },
];

function severityFromScore(score) {
  if (score >= 80) return "CRÍTICA";
  if (score >= 55) return "ALTA";
  if (score >= 30) return "MÉDIA";
  return "BAIXA";
}

function sanitizeExcerpt(text, maxLen = 160) {
  const clean = String(text || "").replace(/[\r\n\t]+/g, " ").trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}...` : clean;
}

export class AutonomousSecurityAIGuard {
  constructor() {
    this.incidents = [];
    this.onChangeCallbacks = new Set();
    this._recentSignatures = new Map(); // evita duplicar o mesmo evento em rajada de digitação
  }

  async init() {
    const saved = await idbGet("security_incidents", []);
    this.incidents = Array.isArray(saved) ? saved : [];
    this.inspectCurrentUrl();
    this._notify();
    return this.incidents;
  }

  onChange(fn) {
    this.onChangeCallbacks.add(fn);
    return () => this.onChangeCallbacks.delete(fn);
  }

  _notify() {
    for (const fn of this.onChangeCallbacks) {
      try {
        fn(this.getStats());
      } catch {
        // ignore listener errors
      }
    }
  }

  getStats() {
    const total = this.incidents.length;
    const blocked = this.incidents.filter((i) => i.blocked).length;
    return { total, blocked, incidents: this.incidents };
  }

  inspectValue(source, value) {
    const raw = String(value || "");
    if (raw.length < 3) return { riskScore: 0, blocked: false, categories: [] };

    let riskScore = 0;
    const categories = [];
    const signals = [];

    for (const rule of THREAT_PATTERNS) {
      if (rule.regex.test(raw)) {
        riskScore += rule.weight;
        categories.push(rule.category);
        signals.push(rule.detail);
      }
    }

    riskScore = Math.min(100, riskScore);
    const blocked = riskScore >= 80;
    if (riskScore >= 30) {
      this._recordIncident({
        source,
        riskScore,
        severity: severityFromScore(riskScore),
        categories,
        signals,
        blocked,
        excerpt: sanitizeExcerpt(raw),
      });
    }
    return { riskScore, blocked, categories, signals };
  }

  inspectCurrentUrl() {
    if (typeof window === "undefined" || !window.location) return { riskScore: 0, blocked: false };
    const fullUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return this.inspectValue("URL / QueryParams", decodeURIComponentSafe(fullUrl));
  }

  inspectUploadedFile(fileName, headerText = "") {
    const nameCheck = this.inspectValue("Upload Filename", fileName);
    if (headerText && !String(headerText).trimStart().startsWith("%PDF-")) {
      this._recordIncident({
        source: "Upload PDF",
        riskScore: 70,
        severity: "ALTA",
        categories: ["Arquivo Adulterado / Magic Bytes Inválidos"],
        signals: ["Arquivo enviado com extensão .pdf sem assinatura %PDF-."],
        blocked: true,
        excerpt: sanitizeExcerpt(fileName),
      });
      return { riskScore: 70, blocked: true, categories: ["Arquivo Adulterado"] };
    }
    return nameCheck;
  }

  _recordIncident(entry) {
    const sig = `${entry.source}:${entry.categories.join(",")}:${entry.excerpt}`;
    const now = Date.now();
    const lastTs = this._recentSignatures.get(sig) || 0;
    if (now - lastTs < 4000) return;
    this._recentSignatures.set(sig, now);

    const incident = {
      id: `sec-${now}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date(now).toISOString(),
      ...entry,
      actionTaken: entry.blocked ? "BLOQUEADO NA ORIGEM" : "REGISTRADO E MONITORADO",
    };
    this.incidents.unshift(incident);
    if (this.incidents.length > 250) this.incidents = this.incidents.slice(0, 250);
    idbSet("security_incidents", this.incidents);
    this._notify();
  }

  generateMarkdownDocument() {
    const { total, blocked } = this.getStats();
    const lines = [
      "# Documento Autônomo de Auditoria de Segurança — VagaPulse AI",
      "",
      `- **Gerado em (UTC):** \`${new Date().toISOString()}\``,
      `- **Total de tentativas detectadas:** \`${total}\``,
      `- **Tentativas bloqueadas autonomamente:** \`${blocked}\``,
      "",
      "## Tentativas de Invasão e Acessos Não Autorizados",
      "",
      "| Timestamp (UTC) | Origem | Risco | Severidade | Categorias | Ação | Trecho |",
      "| :--- | :--- | :---: | :---: | :--- | :--- | :--- |",
    ];
    if (!this.incidents.length) {
      lines.push("| — | Nenhuma tentativa suspeita registrada | 0/100 | BAIXA | — | — | — |");
    } else {
      for (const inc of this.incidents) {
        const cats = (inc.categories || []).join(", ");
        const excerpt = String(inc.excerpt || "").replaceAll("|", "/");
        lines.push(
          `| \`${inc.timestamp}\` | ${inc.source} | **${inc.riskScore}/100** | ${inc.severity} | ${cats} | ${inc.actionTaken} | \`${excerpt}\` |`
        );
      }
    }
    return lines.join("\n") + "\n";
  }

  downloadSecurityDocument() {
    const content = this.generateMarkdownDocument();
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "relatorio_seguranca_vagapulse.md";
    a.click();
    URL.revokeObjectURL(url);
  }
}

function decodeURIComponentSafe(str) {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}
