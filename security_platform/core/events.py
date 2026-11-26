from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class SecurityEvent:
    source: str
    event_type: str
    asset: str
    indicators: list[str]
    mitre_attack: list[str]
    owasp_category: list[str]
    cwe: list[str]
    evidence: str
    confidence: int
    severity: str
    risk_score: int
    recommended_countermeasure: str
    user: str = "anonymous"
    status: str = "detected"
    event_id: str = field(default_factory=lambda: f"evt-{uuid.uuid4().hex[:12]}")
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class CorrelatedIncident:
    title: str
    severity: str
    risk_score: int
    confidence: int
    source_ip: str
    mitre_attack: list[str]
    event_ids: list[str]
    rationale: str
    recommended_actions: list[str]
    status: str = "open"
    incident_id: str = field(default_factory=lambda: f"inc-{uuid.uuid4().hex[:10]}")
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
