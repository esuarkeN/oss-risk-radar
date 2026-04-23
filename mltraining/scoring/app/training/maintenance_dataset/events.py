from __future__ import annotations

from datetime import datetime
import gzip
from io import BytesIO, StringIO, TextIOWrapper
import json
from pathlib import Path
from typing import Iterable
from urllib.request import urlopen

from app.training.maintenance_dataset.adapters import parse_datetime
from app.training.maintenance_dataset.entities import CommitEvent, IssueState, NormalizedEvent, PullRequestState, RepositoryHistory


def normalize_repo_name(value: str | None) -> str | None:
    if not value:
        return None
    return value.strip().lower()


def is_human_actor(actor: str | None) -> bool:
    if actor is None:
        return False
    normalized = actor.strip().lower()
    return normalized != "" and not normalized.endswith("[bot]") and "[bot]" not in normalized and "bot/" not in normalized


class GHArchiveAdapter:
    def load_repository_histories(
        self,
        sources: list[str],
        repository_names: set[str] | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> dict[str, RepositoryHistory]:
        normalized_names = {name.lower() for name in repository_names} if repository_names else None
        histories: dict[str, RepositoryHistory] = {}
        for source in sources:
            for line in self._iter_lines(source):
                payload = json.loads(line)
                repo_name = normalize_repo_name(payload.get("repo", {}).get("name"))
                if repo_name is None:
                    continue
                if normalized_names is not None and repo_name not in normalized_names:
                    continue
                event = self._normalize_event(payload, repo_name)
                if event is None:
                    continue
                if start is not None and event.occurred_at < start:
                    continue
                if end is not None and event.occurred_at > end:
                    continue
                history = histories.setdefault(repo_name, RepositoryHistory(repository_full_name=repo_name))
                self._apply_event(history, event)

        for history in histories.values():
            history.releases = sorted(set(history.releases))
            history.stars = sorted(history.stars)
            history.forks = sorted(history.forks)
            history.commits.sort(key=lambda item: item.occurred_at)
        return histories

    def _iter_lines(self, source: str) -> Iterable[str]:
        if source.startswith("http://") or source.startswith("https://"):
            yield from self._iter_lines_from_remote(source)
            return

        path = Path(source)
        if path.is_dir():
            files = sorted(item for item in path.rglob("*") if item.is_file() and self._is_supported_file(item))
            for item in files:
                yield from self._iter_lines_from_file(item)
            return
        yield from self._iter_lines_from_file(path)

    def _iter_lines_from_remote(self, source: str) -> Iterable[str]:
        with urlopen(source, timeout=20) as response:
            body = response.read()
        if source.endswith(".gz"):
            with gzip.GzipFile(fileobj=BytesIO(body)) as handle:
                text = handle.read().decode("utf-8")
        else:
            text = body.decode("utf-8")
        for line in StringIO(text):
            if line.strip():
                yield line

    def _iter_lines_from_file(self, path: Path) -> Iterable[str]:
        if path.suffix == ".gz":
            with gzip.open(path, "rt", encoding="utf-8-sig") as handle:
                for line in handle:
                    if line.strip():
                        yield line
            return

        with path.open("r", encoding="utf-8-sig") as handle:
            for line in handle:
                if line.strip():
                    yield line

    def _is_supported_file(self, path: Path) -> bool:
        suffixes = path.suffixes
        if not suffixes:
            return False
        normalized = "".join(suffixes[-2:]) if len(suffixes) >= 2 else suffixes[-1]
        return normalized in {".json", ".jsonl", ".ndjson", ".json.gz", ".jsonl.gz", ".ndjson.gz"}

    def _normalize_event(self, payload: dict[str, object], repo_name: str) -> NormalizedEvent | None:
        created_at = parse_datetime(payload.get("created_at"))
        if created_at is None:
            return None
        event_type = str(payload.get("type", ""))
        actor = payload.get("actor", {})
        actor_login = actor.get("login") if isinstance(actor, dict) else None
        body = payload.get("payload", {})
        if not isinstance(body, dict):
            body = {}

        if event_type == "PushEvent":
            commits = body.get("commits")
            commit_count = len(commits) if isinstance(commits, list) and commits else 1
            return NormalizedEvent(repo_full_name=repo_name, kind="push", occurred_at=created_at, actor=actor_login, count=commit_count)

        if event_type == "IssuesEvent":
            action = str(body.get("action", ""))
            issue = body.get("issue", {}) if isinstance(body.get("issue"), dict) else {}
            issue_id = str(issue.get("id") or issue.get("number") or "")
            if not issue_id:
                return None
            if action == "opened":
                return NormalizedEvent(
                    repo_full_name=repo_name,
                    kind="issue_opened",
                    occurred_at=created_at,
                    actor=actor_login,
                    item_id=issue_id,
                    item_created_at=parse_datetime(issue.get("created_at")) or created_at,
                )
            if action == "closed":
                return NormalizedEvent(
                    repo_full_name=repo_name,
                    kind="issue_closed",
                    occurred_at=created_at,
                    actor=actor_login,
                    item_id=issue_id,
                    item_closed_at=parse_datetime(issue.get("closed_at")) or created_at,
                )
            return None

        if event_type == "PullRequestEvent":
            action = str(body.get("action", ""))
            pr = body.get("pull_request", {}) if isinstance(body.get("pull_request"), dict) else {}
            pr_id = str(pr.get("id") or pr.get("number") or body.get("number") or "")
            if not pr_id:
                return None
            created = parse_datetime(pr.get("created_at")) or created_at
            closed = parse_datetime(pr.get("closed_at"))
            merged = parse_datetime(pr.get("merged_at"))
            author = None
            if isinstance(pr.get("user"), dict):
                author = pr["user"].get("login")
            if action == "opened":
                return NormalizedEvent(repo_full_name=repo_name, kind="pr_opened", occurred_at=created_at, actor=actor_login, item_id=pr_id, item_created_at=created, count=1)
            if action == "closed" and merged is not None:
                return NormalizedEvent(repo_full_name=repo_name, kind="pr_merged", occurred_at=created_at, actor=actor_login, item_id=pr_id, item_created_at=created, item_closed_at=closed or created_at, item_merged_at=merged)
            if action == "closed":
                return NormalizedEvent(repo_full_name=repo_name, kind="pr_closed_unmerged", occurred_at=created_at, actor=actor_login, item_id=pr_id, item_created_at=created, item_closed_at=closed or created_at)
            return None

        if event_type == "ReleaseEvent":
            release = body.get("release", {}) if isinstance(body.get("release"), dict) else {}
            published_at = parse_datetime(release.get("published_at")) or created_at
            return NormalizedEvent(repo_full_name=repo_name, kind="release", occurred_at=published_at, actor=actor_login)

        if event_type == "CreateEvent" and str(body.get("ref_type", "")).lower() == "tag":
            return NormalizedEvent(repo_full_name=repo_name, kind="release", occurred_at=created_at, actor=actor_login)

        if event_type == "WatchEvent":
            return NormalizedEvent(repo_full_name=repo_name, kind="star", occurred_at=created_at, actor=actor_login)

        if event_type == "ForkEvent":
            return NormalizedEvent(repo_full_name=repo_name, kind="fork", occurred_at=created_at, actor=actor_login)

        return None

    def _apply_event(self, history: RepositoryHistory, event: NormalizedEvent) -> None:
        if history.coverage_start is None or event.occurred_at < history.coverage_start:
            history.coverage_start = event.occurred_at
        if history.coverage_end is None or event.occurred_at > history.coverage_end:
            history.coverage_end = event.occurred_at

        if event.kind == "push":
            history.commits.append(CommitEvent(occurred_at=event.occurred_at, actor=event.actor, count=event.count))
            return
        if event.kind == "issue_opened" and event.item_id:
            history.issues[event.item_id] = IssueState(issue_id=event.item_id, created_at=event.item_created_at or event.occurred_at)
            return
        if event.kind == "issue_closed" and event.item_id:
            issue = history.issues.get(event.item_id)
            if issue is None:
                issue = IssueState(issue_id=event.item_id, created_at=event.item_created_at or event.occurred_at)
                history.issues[event.item_id] = issue
            issue.closed_at = event.item_closed_at or event.occurred_at
            return
        if event.kind == "pr_opened" and event.item_id:
            existing = history.pull_requests.get(event.item_id)
            author = event.actor
            history.pull_requests[event.item_id] = PullRequestState(
                pr_id=event.item_id,
                created_at=event.item_created_at or event.occurred_at,
                author=author if author else (existing.author if existing else None),
                closed_at=existing.closed_at if existing else None,
                merged_at=existing.merged_at if existing else None,
            )
            return
        if event.kind in {"pr_merged", "pr_closed_unmerged"} and event.item_id:
            pr = history.pull_requests.get(event.item_id)
            if pr is None:
                pr = PullRequestState(pr_id=event.item_id, created_at=event.item_created_at or event.occurred_at, author=event.actor)
                history.pull_requests[event.item_id] = pr
            pr.closed_at = event.item_closed_at or event.occurred_at
            if event.kind == "pr_merged":
                pr.merged_at = event.item_merged_at or pr.closed_at
            return
        if event.kind == "release":
            history.releases.append(event.occurred_at)
            return
        if event.kind == "star":
            history.stars.append(event.occurred_at)
            return
        if event.kind == "fork":
            history.forks.append(event.occurred_at)
