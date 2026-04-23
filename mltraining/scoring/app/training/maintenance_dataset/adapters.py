from __future__ import annotations

from datetime import UTC, datetime
import json
from typing import Any
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from app.training.maintenance_dataset.entities import (
    GitHubRepositoryMetadata,
    PackageVersionRecord,
    RegistryPackageMetadata,
    ResolvedRepositoryMetadata,
    normalize_ecosystem,
)


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def normalize_repository_url(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().replace("git+", "")
    if normalized.endswith(".git"):
        normalized = normalized[:-4]
    return normalized.rstrip("/")


def repository_full_name_from_url(repository_url: str | None) -> str | None:
    normalized = normalize_repository_url(repository_url)
    if not normalized:
        return None
    parsed = urlparse(normalized)
    path = parsed.path.strip("/")
    parts = path.split("/")
    if len(parts) < 2:
        return None
    return f"{parts[0]}/{parts[1]}".lower()


def _get_json(url: str, headers: dict[str, str] | None = None, timeout: int = 15) -> Any:
    request = Request(url, headers=headers or {})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _repository_url_from_registry_payload(payload: dict[str, Any]) -> str | None:
    repository = payload.get("repository")
    if isinstance(repository, dict):
        return normalize_repository_url(repository.get("url"))
    if isinstance(repository, str):
        return normalize_repository_url(repository)

    project_urls = payload.get("project_urls")
    if isinstance(project_urls, dict):
        for key in ("Source", "Source Code", "Repository", "Homepage"):
            value = project_urls.get(key)
            if value:
                return normalize_repository_url(str(value))

    homepage = payload.get("homepage") or payload.get("home_page")
    if homepage:
        return normalize_repository_url(str(homepage))
    return None


def _dependency_count_from_payload(payload: dict[str, Any]) -> int | None:
    version = payload.get("version", payload)
    for key in ("dependencies", "requirements"):
        value = version.get(key)
        if isinstance(value, list):
            return len(value)
    return None


def _direct_dependents_count_from_payload(payload: dict[str, Any]) -> int | None:
    candidates = [
        payload.get("numDirectDependents"),
        payload.get("directDependentsCount"),
        payload.get("dependentPackages"),
        payload.get("directDependentCount"),
    ]
    version = payload.get("version")
    if isinstance(version, dict):
        candidates.extend(
            [
                version.get("numDirectDependents"),
                version.get("directDependentsCount"),
                version.get("dependentPackages"),
                version.get("directDependentCount"),
            ]
        )
    for value in candidates:
        if isinstance(value, int):
            return value
    return None


class DepsDevAdapter:
    def __init__(self, base_url: str = "https://api.deps.dev/v3", timeout: int = 15) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def resolve_repository(self, ecosystem: str, package_name: str, version: str | None) -> ResolvedRepositoryMetadata | None:
        if not version:
            return None
        system = normalize_ecosystem(ecosystem)
        endpoint = f"{self.base_url}/systems/{system}/packages/{quote(package_name, safe='')}/versions/{quote(version, safe='')}"
        payload = _get_json(endpoint, timeout=self.timeout)
        version_payload = payload.get("version", {})
        links = version_payload.get("links", []) or payload.get("links", [])
        repository_url = None
        for link in links:
            label = str(link.get("label", "")).upper()
            candidate_url = normalize_repository_url(link.get("url"))
            if label == "SOURCE_REPO" or (candidate_url and "github.com" in candidate_url.lower()):
                repository_url = candidate_url
                break

        return ResolvedRepositoryMetadata(
            repository_url=repository_url,
            repository_full_name=repository_full_name_from_url(repository_url),
            dependency_count=_dependency_count_from_payload(payload),
            direct_dependents_count=_direct_dependents_count_from_payload(payload),
            source_url=endpoint,
        )


class NpmRegistryAdapter:
    def __init__(self, base_url: str = "https://registry.npmjs.org", timeout: int = 15) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def get_package_metadata(self, package_name: str) -> RegistryPackageMetadata:
        endpoint = f"{self.base_url}/{quote(package_name, safe='@/')}"
        payload = _get_json(endpoint, timeout=self.timeout)
        time_payload = payload.get("time", {})
        versions: list[PackageVersionRecord] = []
        for version, timestamp in time_payload.items():
            if version in {"created", "modified"}:
                continue
            published_at = parse_datetime(timestamp)
            if published_at is None:
                continue
            versions.append(PackageVersionRecord(version=version, published_at=published_at))
        versions.sort(key=lambda item: item.published_at)

        repository_url = _repository_url_from_registry_payload(payload)
        return RegistryPackageMetadata(repository_url=repository_url, source_url=endpoint, versions=versions)


class PyPIRegistryAdapter:
    def __init__(self, base_url: str = "https://pypi.org", timeout: int = 15) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def get_package_metadata(self, package_name: str) -> RegistryPackageMetadata:
        endpoint = f"{self.base_url}/pypi/{quote(package_name, safe='')}/json"
        payload = _get_json(endpoint, timeout=self.timeout)
        versions: list[PackageVersionRecord] = []
        for version, files in payload.get("releases", {}).items():
            if not isinstance(files, list) or not files:
                continue
            timestamps = [
                parse_datetime(item.get("upload_time_iso_8601") or item.get("upload_time"))
                for item in files
            ]
            published_at = min((value for value in timestamps if value is not None), default=None)
            if published_at is None:
                continue
            versions.append(PackageVersionRecord(version=version, published_at=published_at))
        versions.sort(key=lambda item: item.published_at)

        info = payload.get("info", {})
        repository_url = _repository_url_from_registry_payload(info)
        return RegistryPackageMetadata(repository_url=repository_url, source_url=endpoint, versions=versions)


class GitHubRepositoryAdapter:
    def __init__(self, token: str | None = None, base_url: str = "https://api.github.com", timeout: int = 15) -> None:
        self.token = token or ""
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def get_repository(self, repository_url: str) -> GitHubRepositoryMetadata:
        full_name = repository_full_name_from_url(repository_url)
        if full_name is None:
            raise ValueError(f"invalid GitHub repository URL: {repository_url}")
        owner, repo = full_name.split("/", 1)
        endpoint = f"{self.base_url}/repos/{quote(owner, safe='')}/{quote(repo, safe='')}"
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        payload = _get_json(endpoint, headers=headers, timeout=self.timeout)
        return GitHubRepositoryMetadata(
            full_name=str(payload.get("full_name", full_name)).lower(),
            url=normalize_repository_url(str(payload.get("html_url", repository_url))) or repository_url,
            default_branch=str(payload.get("default_branch", "main")),
            created_at=parse_datetime(payload.get("created_at")),
            is_fork=bool(payload.get("fork", False)),
            current_archived=bool(payload.get("archived", False)),
            source_url=endpoint,
        )
