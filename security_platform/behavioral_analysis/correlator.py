from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Any

from security_platform.core.events import CorrelatedIncident, SecurityEvent


class ThreatCorrelator:
    """
    Correlaciona eventos de segurança em janelas deslizantes por IP/usuário.
    Exemplo: múltiplas falhas de autenticação + enumeração/escalada -> Incidente Crítico (Account Takeover).
    """

    def __init__(self, window_seconds: int = 300) -> None:
        self.window_seconds = window_seconds
        self._ip_events: dict[str, deque[tuple[float, SecurityEvent]]] = defaultdict(deque)
        self._incidents: list[CorrelatedIncident] = []

    def ingest(self, event: SecurityEvent) -> CorrelatedIncident | None:
        now = time.time()
        dq = self._ip_events[event.source]
        dq.append((now, event))
        cutoff = now - self.window_seconds
        while dq and dq[0][0] < cutoff:
            dq.popleft()

        recent = [ev for _, ev in dq]
        if len(recent) < 2:
            return None

        distinct_types = {ev.event_type for ev in recent}
        total_risk = sum(ev.risk_score for ev in recent)
        mitre_all = list(dict.fromkeys(m for ev in recent for m in ev.mitre_attack))

        # Correlação multi-estágio ou rajada persistente
        if len(distinct_types) >= 2 or len(recent) >= 3 or total_risk >= 140:
            avg_conf = min(99, round(sum(ev.confidence for ev in recent) / len(recent)) + 8)
            sev = "CRÍTICA" if (total_risk >= 150 or len(distinct_types) >= 3) else "ALTA"
            incident = CorrelatedIncident(
                title=f"Ataque Correlacionado ({', '.join(sorted(distinct_types)[:3])})",
                severity=sev,
                risk_score=min(100, round(total_risk / max(1, len(recent)) + len(distinct_types) * 12)),
                confidence=avg_conf,
                source_ip=event.source,
                mitre_attack=mitre_all,
                event_ids=[ev.event_id for ev in recent[-10:]],
                rationale=(
                    f"{len(recent)} eventos suspeitos em {self.window_seconds}s vindos de {event.source} "
                    f"cobrindo {len(distinct_types)} vetores distintos ({', '.join(sorted(distinct_types))})."
                ),
                recommended_actions=[
                    "Bloquear IP temporariamente via SOAR",
                    "Revisar linha do tempo forense",
                    "Validar integridade das rotas/sessões afetadas",
                ],
            )
            self._incidents.append(incident)
            if len(self._incidents) > 200:
                self._incidents = self._incidents[-200:]
            return incident
        return None

    def get_incidents(self, limit: int = 30) -> list[dict[str, Any]]:
        return [i.to_dict() for i in reversed(self._incidents[-limit:])]
