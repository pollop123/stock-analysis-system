"""Tests for the AI analysis provider seam.

The job service now depends on the ``AIAnalysisProvider`` interface, so it can be
driven end to end with a fake provider — no OpenAI client to patch, no DeepSeek
response shape to fabricate. (The DeepSeek adapter's own behavior is covered in
tests/test_ai_analysis.py via ``generate_deepseek_analysis``.)
"""

import json

import pytest

from app.models import AIAnalysisJob, User
from app.schemas import AIAnalysisResponse
from app.services.ai_analysis_cache import AIAnalysisCache
from app.services.ai_analysis_jobs import AIAnalysisJobService
from app.services.ai_provider import DeepSeekProvider, FakeAIProvider


def _response(request_id: str = "rid", action: int = 1) -> AIAnalysisResponse:
    return AIAnalysisResponse.model_validate(
        json.loads(
            json.dumps(
                {
                    "request_id": request_id,
                    "action": action,
                    "summary": {"short_sentence": "s", "long_sentence": "l"},
                    "reasons": {"technical": "t", "fundamental": "f", "comprehensive": "c"},
                }
            )
        )
    )


class _KeepOpen:
    """Context manager that yields a shared session without closing it."""

    def __init__(self, session):
        self.session = session

    def __enter__(self):
        return self.session

    def __exit__(self, *exc):
        return False


class TestFakeAIProvider:
    def test_returns_configured_response(self):
        resp = _response("abc")
        provider = FakeAIProvider(response=resp)
        out = provider.analyze(stock_code="2330", company_name="TSMC", context_data={})
        assert out is resp
        assert provider.calls[0]["stock_code"] == "2330"

    def test_raises_configured_error(self):
        provider = FakeAIProvider(error=RuntimeError("boom"))
        with pytest.raises(RuntimeError, match="boom"):
            provider.analyze(stock_code="2330", company_name="TSMC", context_data={})


class TestDeepSeekProviderDelegates:
    def test_delegates_to_generate(self, monkeypatch):
        seen = {}

        def fake_generate(*, stock_code, company_name, context_data, timeout_seconds=None):
            seen.update(locals())
            return _response("delegated")

        monkeypatch.setattr("app.services.ai_provider.generate_deepseek_analysis", fake_generate)
        provider = DeepSeekProvider()
        out = provider.analyze(stock_code="2330", company_name="TSMC", context_data={"k": "v"}, timeout_seconds=9)
        assert out.request_id == "delegated"
        assert seen["stock_code"] == "2330"
        assert seen["timeout_seconds"] == 9


class TestJobServiceUsesProvider:
    def test_default_provider_is_deepseek(self):
        assert isinstance(AIAnalysisJobService()._provider, DeepSeekProvider)

    def test_injected_provider_is_used(self):
        fake = FakeAIProvider(response=_response())
        assert AIAnalysisJobService(provider=fake)._provider is fake

    def test_run_job_success_with_fake_provider(self, db_session, sample_stocks, monkeypatch):
        user = User(username="aiuser", email="ai@example.com", hashed_password="x")
        db_session.add(user)
        db_session.commit()
        job = AIAnalysisJob(stock_id=sample_stocks[0].id, user_id=user.id, status="pending")
        db_session.add(job)
        db_session.commit()

        monkeypatch.setattr(
            "app.services.ai_analysis_jobs.SessionLocal", lambda: _KeepOpen(db_session)
        )
        # Isolate the success-path cache write from the global singleton.
        monkeypatch.setattr("app.services.ai_analysis_jobs.ai_analysis_cache", AIAnalysisCache())

        fake = FakeAIProvider(response=_response("run-job-rid", action=1))
        service = AIAnalysisJobService(provider=fake)
        service._capacity.acquire()  # _run_job releases in finally
        service._run_job(job.id, sample_stocks[0].symbol, sample_stocks[0].name, {"industry": "半導體業"})

        db_session.refresh(job)
        assert job.status == "success"
        assert job.result_json is not None
        assert json.loads(job.result_json)["request_id"] == "run-job-rid"
        assert fake.calls[0]["company_name"] == sample_stocks[0].name

    def test_run_job_failure_with_fake_provider(self, db_session, sample_stocks, monkeypatch):
        user = User(username="aiuser2", email="ai2@example.com", hashed_password="x")
        db_session.add(user)
        db_session.commit()
        job = AIAnalysisJob(stock_id=sample_stocks[0].id, user_id=user.id, status="pending")
        db_session.add(job)
        db_session.commit()

        monkeypatch.setattr(
            "app.services.ai_analysis_jobs.SessionLocal", lambda: _KeepOpen(db_session)
        )

        service = AIAnalysisJobService(provider=FakeAIProvider(response=None))
        service._capacity.acquire()
        service._run_job(job.id, sample_stocks[0].symbol, sample_stocks[0].name, {})

        db_session.refresh(job)
        assert job.status == "failed"
        assert job.last_error == "Provider returned no valid AI analysis"
