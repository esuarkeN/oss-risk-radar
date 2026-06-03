from datetime import UTC, datetime
import json

from app.training.maintenance_dataset.events import GHArchiveAdapter


def _event(event_type: str, created_at: str, payload: dict, actor: str = "maintainer") -> dict:
    return {
        "type": event_type,
        "created_at": created_at,
        "actor": {"login": actor},
        "repo": {"name": "acme/project"},
        "payload": payload,
    }


def test_gharchive_adapter_tracks_issue_comments_and_pr_reviews_as_responses(tmp_path) -> None:
    source = tmp_path / "events.jsonl"
    events = [
        _event(
            "PullRequestEvent",
            "2023-01-01T00:00:00Z",
            {
                "action": "opened",
                "number": 7,
                "pull_request": {
                    "number": 7,
                    "created_at": "2023-01-01T00:00:00Z",
                    "user": {"login": "alice"},
                },
            },
            actor="alice",
        ),
        _event(
            "PullRequestReviewEvent",
            "2023-01-02T00:00:00Z",
            {
                "action": "submitted",
                "pull_request": {
                    "number": 7,
                    "created_at": "2023-01-01T00:00:00Z",
                    "user": {"login": "alice"},
                },
                "review": {"submitted_at": "2023-01-02T00:00:00Z"},
            },
        ),
        _event(
            "IssueCommentEvent",
            "2023-01-03T00:00:00Z",
            {
                "action": "created",
                "issue": {
                    "number": 7,
                    "created_at": "2023-01-01T00:00:00Z",
                    "user": {"login": "alice"},
                    "pull_request": {"url": "https://api.github.com/repos/acme/project/pulls/7"},
                },
                "comment": {"created_at": "2023-01-03T00:00:00Z"},
            },
        ),
        _event(
            "IssuesEvent",
            "2023-01-04T00:00:00Z",
            {
                "action": "opened",
                "issue": {
                    "number": 9,
                    "created_at": "2023-01-04T00:00:00Z",
                    "user": {"login": "reporter"},
                },
            },
            actor="reporter",
        ),
        _event(
            "IssueCommentEvent",
            "2023-01-05T00:00:00Z",
            {
                "action": "created",
                "issue": {
                    "number": 9,
                    "created_at": "2023-01-04T00:00:00Z",
                    "user": {"login": "reporter"},
                },
                "comment": {"created_at": "2023-01-05T00:00:00Z"},
            },
        ),
    ]
    source.write_text("\n".join(json.dumps(item) for item in events), encoding="utf-8")

    histories = GHArchiveAdapter().load_repository_histories([str(source)])

    history = histories["acme/project"]
    assert history.pull_requests["7"].author == "alice"
    assert history.pull_requests["7"].first_response_at == datetime(2023, 1, 2, tzinfo=UTC)
    assert history.issues["9"].author == "reporter"
    assert history.issues["9"].first_response_at == datetime(2023, 1, 5, tzinfo=UTC)
