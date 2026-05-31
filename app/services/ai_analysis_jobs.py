import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import AIAnalysisJob, Stock
from app.schemas import AIAnalysisResponse
from app.services.ai_analysis_cache import ai_analysis_cache
from app.services.ai_provider import AIAnalysisProvider, DeepSeekProvider

logger = logging.getLogger(__name__)

AI_ANALYSIS_BUSY_DETAIL = "系統繁忙，暫時無法產生 AI 分析"
ACTIVE_JOB_STATUSES = ("pending", "running")


class AIAnalysisProviderUnavailable(Exception):
    """Raised when provider work should not be accepted right now."""


class AIAnalysisJobService:
    def __init__(self, provider: AIAnalysisProvider | None = None):
        self._provider = provider or DeepSeekProvider()
        self._lock = threading.Lock()
        self._executor: ThreadPoolExecutor | None = None
        self._capacity = threading.BoundedSemaphore(
            settings.ai_analysis_max_concurrent_jobs + settings.ai_analysis_max_queued_jobs
        )
        self._consecutive_failures = 0
        self._circuit_opened_at: float | None = None
        self._half_open_in_flight = False

    def get_recent_success(self, db: Session, stock: Stock) -> AIAnalysisResponse | None:
        if settings.ai_analysis_cache_ttl_seconds <= 0:
            return None

        cutoff = datetime.now(timezone.utc) - timedelta(
            seconds=settings.ai_analysis_cache_ttl_seconds
        )
        job = (
            db.query(AIAnalysisJob)
            .filter(
                AIAnalysisJob.stock_id == stock.id,
                AIAnalysisJob.status == "success",
                AIAnalysisJob.completed_at >= cutoff,
            )
            .order_by(AIAnalysisJob.completed_at.desc())
            .first()
        )
        if not job or not job.result_json:
            return None

        try:
            result = AIAnalysisResponse.model_validate_json(job.result_json)
        except Exception:
            logger.warning("Stored AI analysis job result is invalid", exc_info=True)
            return None

        ai_analysis_cache.set(stock.symbol, result, settings.ai_analysis_cache_ttl_seconds)
        return result

    def get_active_job(self, db: Session, stock: Stock) -> AIAnalysisJob | None:
        jobs = (
            db.query(AIAnalysisJob)
            .filter(
                AIAnalysisJob.stock_id == stock.id,
                AIAnalysisJob.status.in_(ACTIVE_JOB_STATUSES),
            )
            .order_by(AIAnalysisJob.created_at.desc())
            .all()
        )

        now = datetime.now(timezone.utc)
        stale_jobs = []
        active_job = None
        for job in jobs:
            if self._is_stale_active_job(job, now):
                job.status = "failed"
                job.last_error = "AI analysis job expired before completion"
                job.completed_at = now
                stale_jobs.append(job)
                continue

            if active_job is None:
                active_job = job

        if stale_jobs:
            db.commit()
        return active_job

    def has_recent_failure(self, db: Session, stock: Stock) -> bool:
        cutoff = datetime.now(timezone.utc) - timedelta(
            seconds=settings.ai_analysis_circuit_cooldown_seconds
        )
        failed_job = (
            db.query(AIAnalysisJob)
            .filter(
                AIAnalysisJob.stock_id == stock.id,
                AIAnalysisJob.status == "failed",
                AIAnalysisJob.completed_at >= cutoff,
            )
            .order_by(AIAnalysisJob.completed_at.desc())
            .first()
        )
        return failed_job is not None

    def enqueue(
        self,
        db: Session,
        *,
        stock: Stock,
        user_id: int,
        context_data: dict,
    ) -> AIAnalysisJob:
        half_open_trial = self._ensure_provider_available()

        if not self._capacity.acquire(blocking=False):
            if half_open_trial:
                self._cancel_half_open_trial()
            raise AIAnalysisProviderUnavailable("AI analysis provider queue is full")

        job = AIAnalysisJob(stock_id=stock.id, user_id=user_id, status="pending")
        try:
            db.add(job)
            db.commit()
            db.refresh(job)
            self._get_executor().submit(
                self._run_job,
                job.id,
                stock.symbol,
                stock.name,
                context_data,
            )
        except Exception:
            self._capacity.release()
            if half_open_trial:
                self._cancel_half_open_trial()
            db.rollback()
            if job.id is not None:
                job.status = "failed"
                job.last_error = "Failed to enqueue AI analysis job"
                job.completed_at = datetime.now(timezone.utc)
                db.commit()
            raise

        return job

    def shutdown(self) -> None:
        with self._lock:
            executor = self._executor
            self._executor = None
        if executor:
            executor.shutdown(wait=False, cancel_futures=True)

    def _get_executor(self) -> ThreadPoolExecutor:
        with self._lock:
            if self._executor is None:
                self._executor = ThreadPoolExecutor(
                    max_workers=settings.ai_analysis_max_concurrent_jobs,
                    thread_name_prefix="ai-analysis",
                )
            return self._executor

    def _ensure_provider_available(self) -> bool:
        now = time.monotonic()
        with self._lock:
            if self._circuit_opened_at is None:
                return False

            elapsed = now - self._circuit_opened_at
            if elapsed < settings.ai_analysis_circuit_cooldown_seconds:
                raise AIAnalysisProviderUnavailable("AI analysis provider circuit is open")

            if self._half_open_in_flight:
                raise AIAnalysisProviderUnavailable("AI analysis provider trial is in flight")

            self._half_open_in_flight = True
            return True

    def _cancel_half_open_trial(self) -> None:
        with self._lock:
            self._half_open_in_flight = False

    def _record_success(self) -> None:
        with self._lock:
            self._consecutive_failures = 0
            self._circuit_opened_at = None
            self._half_open_in_flight = False

    def _record_failure(self) -> None:
        with self._lock:
            self._consecutive_failures += 1
            self._half_open_in_flight = False
            if self._consecutive_failures >= settings.ai_analysis_circuit_failure_threshold:
                self._circuit_opened_at = time.monotonic()

    def _is_stale_active_job(self, job: AIAnalysisJob, now: datetime) -> bool:
        job_timestamp = job.started_at or job.created_at
        if not job_timestamp:
            return False
        if job_timestamp.tzinfo is None:
            job_timestamp = job_timestamp.replace(tzinfo=timezone.utc)

        stale_cutoff = now - timedelta(seconds=settings.ai_analysis_job_stale_seconds)
        return job_timestamp <= stale_cutoff

    def _run_job(
        self,
        job_id: int,
        stock_code: str,
        company_name: str,
        context_data: dict,
    ) -> None:
        try:
            with SessionLocal() as db:
                job = db.query(AIAnalysisJob).filter(AIAnalysisJob.id == job_id).first()
                if not job:
                    return

                job.status = "running"
                job.started_at = datetime.now(timezone.utc)
                db.commit()

                result = self._provider.analyze(
                    stock_code=stock_code,
                    company_name=company_name,
                    context_data=context_data,
                    timeout_seconds=settings.ai_analysis_provider_timeout_seconds,
                )

                if not result:
                    job.status = "failed"
                    job.last_error = "Provider returned no valid AI analysis"
                    job.completed_at = datetime.now(timezone.utc)
                    db.commit()
                    self._record_failure()
                    return

                job.status = "success"
                job.result_json = result.model_dump_json()
                job.last_error = None
                job.completed_at = datetime.now(timezone.utc)
                db.commit()
                ai_analysis_cache.set(
                    stock_code,
                    result,
                    settings.ai_analysis_cache_ttl_seconds,
                )
                self._record_success()
        except Exception as exc:
            logger.warning("AI analysis job failed: %s", exc)
            self._record_failure()
            with SessionLocal() as db:
                job = db.query(AIAnalysisJob).filter(AIAnalysisJob.id == job_id).first()
                if job:
                    job.status = "failed"
                    job.last_error = str(exc)[:500]
                    job.completed_at = datetime.now(timezone.utc)
                    db.commit()
        finally:
            self._capacity.release()


ai_analysis_job_service = AIAnalysisJobService()
