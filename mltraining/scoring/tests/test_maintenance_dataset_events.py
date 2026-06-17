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


def test_gharchive_adapter_skips_corrupt_gzip_files(tmp_path) -> None:
    source = tmp_path / "events.json.gz"
    source.write_bytes(b"\x00\x00not-gzip")

    histories = GHArchiveAdapter().load_repository_histories([str(source)])

    assert histories == {}


def test_gharchive_adapter_prefilters_repository_names_before_json_decode(tmp_path) -> None:
    source = tmp_path / "events.jsonl"
    target_event = _event("WatchEvent", "2023-01-01T00:00:00Z", {}, actor="viewer")
    source.write_text(
        '{"repo":{"name":"other/project"},"payload":\n' + json.dumps(target_event),
        encoding="utf-8",
    )

    histories = GHArchiveAdapter().load_repository_histories([str(source)], repository_names={"acme/project"})

    assert list(histories) == ["acme/project"]
    assert histories["acme/project"].stars == [datetime(2023, 1, 1, tzinfo=UTC)]


def test_gharchive_adapter_skips_malformed_target_repository_lines(tmp_path) -> None:
    source = tmp_path / "events.jsonl"
    valid_event = _event("WatchEvent", "2023-01-01T00:00:00Z", {}, actor="viewer")
    source.write_text(
        '{"repo":{"name":"acme/project"},"payload":"bad\u0001value"}\n' + json.dumps(valid_event),
        encoding="utf-8",
    )

    histories = GHArchiveAdapter().load_repository_histories([str(source)], repository_names={"acme/project"})

    assert list(histories) == ["acme/project"]
    assert histories["acme/project"].stars == [datetime(2023, 1, 1, tzinfo=UTC)]


def test_gharchive_adapter_skips_files_outside_date_window_before_json_decode(tmp_path) -> None:
    source = tmp_path / "2020-01-01-0.json"
    source.write_text('{"repo":{"name":"acme/project"},"payload":\n', encoding="utf-8")

    histories = GHArchiveAdapter().load_repository_histories(
        [str(tmp_path)],
        repository_names={"acme/project"},
        start=datetime(2021, 1, 1, tzinfo=UTC),
        end=datetime(2021, 1, 2, tzinfo=UTC),
    )

    assert histories == {}
