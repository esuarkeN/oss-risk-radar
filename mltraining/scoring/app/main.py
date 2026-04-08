from fastapi import FastAPI

from app.api.routes import router
from app.config import settings


app = FastAPI(
    title="OSS Risk Radar Scoring Service",
    version=settings.service_version,
    description="Explainable heuristic scoring service for OSS dependency inactivity risk triage.",
)
app.include_router(router)
