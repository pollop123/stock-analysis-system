"""AI analysis provider seam.

One small interface — ``AIAnalysisProvider.analyze`` — returns a validated
``AIAnalysisResponse`` or None. Everything the provider must do to get there
(build the HTTP client, strip markdown fences, parse JSON, validate the shape,
echo-check the request id) sits behind the seam in the adapter. The job service
depends on this interface, never on the OpenAI client or DeepSeek's response
shape; tests substitute ``FakeAIProvider``.
"""

from __future__ import annotations

from typing import Optional, Protocol

from app.schemas import AIAnalysisResponse
from app.services.summaries import generate_deepseek_analysis


class AIAnalysisProvider(Protocol):
    """Everything a caller must know to request an AI analysis."""

    name: str

    def analyze(
        self,
        *,
        stock_code: str,
        company_name: str,
        context_data: dict,
        timeout_seconds: Optional[float] = None,
    ) -> Optional[AIAnalysisResponse]:
        """Return a validated analysis, or None when the provider can't deliver one."""
        ...


class DeepSeekProvider:
    """Production adapter. Owns the DeepSeek/OpenAI HTTP coupling end to end."""

    name = "deepseek"

    def analyze(
        self,
        *,
        stock_code: str,
        company_name: str,
        context_data: dict,
        timeout_seconds: Optional[float] = None,
    ) -> Optional[AIAnalysisResponse]:
        return generate_deepseek_analysis(
            stock_code=stock_code,
            company_name=company_name,
            context_data=context_data,
            timeout_seconds=timeout_seconds,
        )


class FakeAIProvider:
    """Test adapter. Returns a canned response or raises a configured error —
    no OpenAI client, no HTTP, no response shape to patch."""

    name = "fake"

    def __init__(
        self,
        *,
        response: Optional[AIAnalysisResponse] = None,
        error: Optional[Exception] = None,
    ):
        self.response = response
        self.error = error
        self.calls: list[dict] = []

    def analyze(
        self,
        *,
        stock_code: str,
        company_name: str,
        context_data: dict,
        timeout_seconds: Optional[float] = None,
    ) -> Optional[AIAnalysisResponse]:
        self.calls.append(
            {
                "stock_code": stock_code,
                "company_name": company_name,
                "context_data": context_data,
                "timeout_seconds": timeout_seconds,
            }
        )
        if self.error is not None:
            raise self.error
        return self.response
