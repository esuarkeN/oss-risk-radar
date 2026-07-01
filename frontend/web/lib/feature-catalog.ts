/**
 * Single source of truth for the 43 full-history features (feature-set-v3-full-history).
 * Mirrors the thesis appendix "Full-History Feature Reference" (tex/thesis/appendix/appendix-a.tex)
 * and the training-code identifiers in
 * mltraining/scoring/app/training/maintenance_dataset/features.py (HISTORICAL_FEATURE_NAMES).
 *
 * Used by the /docs feature glossary and by the per-repository analysis panel tooltips so that the
 * plain-language meaning of every feature stays consistent across the thesis, the code, and the UI.
 */

export type FeatureGroupName =
  | "Commit activity"
  | "Contributor activity and concentration"
  | "Issue activity and backlog"
  | "Pull-request activity"
  | "Release activity"
  | "Age and popularity proxies"
  | "Diagnostic and binary flags"
  | "Derived risk proxies"
  | "Responsiveness and backlog pressure";

export interface FeatureDoc {
  /** Exact identifier used in training code, model artifacts, and the runtime interface. */
  key: string;
  /** Short human label shown in charts and tables. */
  label: string;
  group: FeatureGroupName;
  /** Time context, e.g. "Last 90 days" or "At observation time t". */
  window: string;
  /** Exact meaning; every value is measured at or before the observation time t. */
  definition: string;
  /** Why the feature is part of the inactivity-risk model. */
  rationale: string;
}

export interface FeatureGroupDoc {
  group: FeatureGroupName;
  blurb: string;
}

/** Group-level one-liners for the documentation page. */
export const FEATURE_GROUPS: FeatureGroupDoc[] = [
  { group: "Commit activity", blurb: "How much and how steadily code is being written." },
  { group: "Contributor activity and concentration", blurb: "Who is contributing, and how exposed the project is to a single maintainer." },
  { group: "Issue activity and backlog", blurb: "Whether maintainers keep pace with incoming issues." },
  { group: "Pull-request activity", blurb: "Whether outside contributions are still being reviewed and merged." },
  { group: "Release activity", blurb: "Whether usable versions still reach users." },
  { group: "Age and popularity proxies", blurb: "Maturity and reach, which shape the baseline risk." },
  { group: "Diagnostic and binary flags", blurb: "Simple yes/no signals and diagnostic metadata." },
  { group: "Derived risk proxies", blurb: "Trend and concentration signals combined into risk-oriented scores." },
  { group: "Responsiveness and backlog pressure", blurb: "How quickly maintainers respond and how much stale work has piled up." },
];

export const FEATURE_CATALOG: FeatureDoc[] = [
  // Commit activity
  {
    key: "commits_30d",
    label: "Commits 30d",
    group: "Commit activity",
    window: "Last 30 days",
    definition: "Number of human commits in the 30 days before t.",
    rationale: "Short-term development pulse; captures whether the project is moving right now.",
  },
  {
    key: "commits_90d",
    label: "Commits 90d",
    group: "Commit activity",
    window: "Last 90 days",
    definition: "Number of human commits in the 90 days before t.",
    rationale: "Quarter-scale activity level that is less noisy than the 30-day count.",
  },
  {
    key: "commits_365d",
    label: "Commits 365d",
    group: "Commit activity",
    window: "Last 365 days",
    definition: "Number of human commits in the 365 days before t.",
    rationale: "Annual development volume; also the baseline against which the year-over-year drop is measured.",
  },
  {
    key: "active_commit_months_365d",
    label: "Active commit months",
    group: "Commit activity",
    window: "Last 365 days",
    definition: "Count of distinct calendar months (0–12) in the last year that contain at least one human commit.",
    rationale: "Separates steady maintenance from a single burst: 300 commits in one month is a weaker health signal than the same work spread across ten months.",
  },
  {
    key: "days_since_last_commit",
    label: "Days since commit",
    group: "Commit activity",
    window: "At t",
    definition: "Days between t and the most recent human commit.",
    rationale: "Direct staleness signal; a long silence is one of the strongest indicators of impending inactivity.",
  },

  // Contributor activity and concentration
  {
    key: "contributors_90d",
    label: "Contributors 90d",
    group: "Contributor activity and concentration",
    window: "Last 90 days",
    definition: "Distinct human contributors in the last 90 days.",
    rationale: "Breadth of recent participation; a proxy for the size of the active team.",
  },
  {
    key: "contributors_365d",
    label: "Contributors 365d",
    group: "Contributor activity and concentration",
    window: "Last 365 days",
    definition: "Distinct human contributors in the last 365 days.",
    rationale: "Annual contributor base; the reference for the contributor drop.",
  },
  {
    key: "new_contributors_365d",
    label: "New contributors",
    group: "Contributor activity and concentration",
    window: "Last 365 days",
    definition: "Contributors active in the last year who never committed before the window started.",
    rationale: "Measures inflow of fresh maintainers; a project with no newcomers is more exposed to attrition.",
  },
  {
    key: "top1_contributor_commit_share_365d",
    label: "Top contributor share",
    group: "Contributor activity and concentration",
    window: "Last 365 days",
    definition: "Share (0–1) of the last year's commits made by the single most active contributor.",
    rationale: "Key-person dependency: a high share means the project is fragile if that one person leaves.",
  },
  {
    key: "top2_contributor_commit_share_365d",
    label: "Top 2 contributor share",
    group: "Contributor activity and concentration",
    window: "Last 365 days",
    definition: "Combined commit share of the two most active contributors in the last year.",
    rationale: "Detects a very small core team even when no single person dominates.",
  },
  {
    key: "contributor_concentration_index",
    label: "Contributor concentration index",
    group: "Contributor activity and concentration",
    window: "Last 365 days",
    definition: "Herfindahl index: sum of squared per-contributor commit shares over the last year.",
    rationale: "A single scalar for how concentrated contributions are (1.0 = one person, near 0 = evenly spread).",
  },
  {
    key: "maintainer_concentration_flag",
    label: "Maintainer concentration",
    group: "Contributor activity and concentration",
    window: "Last 365 days",
    definition: "1 if the top contributor share ≥ 0.7 or the top-two share ≥ 0.85, else 0.",
    rationale: "Binary bus-factor alarm for the clearly single-maintainer case.",
  },

  // Issue activity and backlog
  {
    key: "opened_issues_90d",
    label: "Issues opened 90d",
    group: "Issue activity and backlog",
    window: "Last 90 days",
    definition: "Issues created in the last 90 days.",
    rationale: "Inbound user demand and engagement with the project.",
  },
  {
    key: "closed_issues_90d",
    label: "Issues closed 90d",
    group: "Issue activity and backlog",
    window: "Last 90 days",
    definition: "Issues closed in the last 90 days.",
    rationale: "Maintainer throughput on the issue tracker.",
  },
  {
    key: "issue_closure_ratio_90d",
    label: "Issue closure ratio",
    group: "Issue activity and backlog",
    window: "Last 90 days",
    definition: "Closed divided by opened issues over the last 90 days.",
    rationale: "Whether maintainers keep pace with inflow, expressed relatively so it is comparable across project sizes.",
  },
  {
    key: "issue_backlog_growth_90d",
    label: "Backlog growth",
    group: "Issue activity and backlog",
    window: "Last 90 days",
    definition: "Relative change in the open-issue count between t−90 days and t.",
    rationale: "A backlog that is trending upward signals that maintainers are losing control; size-normalized.",
  },
  {
    key: "stale_open_issues_count_at_obs",
    label: "Stale open issues",
    group: "Issue activity and backlog",
    window: "At t",
    definition: "Issues opened before t−90 days that are still open at t.",
    rationale: "Long-unaddressed items indicate neglect of the tracker.",
  },

  // Pull-request activity
  {
    key: "opened_prs_90d",
    label: "PRs opened 90d",
    group: "Pull-request activity",
    window: "Last 90 days",
    definition: "Pull requests created in the last 90 days.",
    rationale: "Contribution inflow from outside the core team.",
  },
  {
    key: "merged_prs_90d",
    label: "PRs merged 90d",
    group: "Pull-request activity",
    window: "Last 90 days",
    definition: "Pull requests merged in the last 90 days.",
    rationale: "Direct evidence that maintainers are still integrating outside work.",
  },
  {
    key: "closed_unmerged_prs_90d",
    label: "PRs closed unmerged",
    group: "Pull-request activity",
    window: "Last 90 days",
    definition: "Pull requests closed without merging in the last 90 days.",
    rationale: "A high count relative to merges can signal rejection or disengagement from contributions.",
  },
  {
    key: "pr_merge_ratio_90d",
    label: "PR merge ratio",
    group: "Pull-request activity",
    window: "Last 90 days",
    definition: "Merged divided by opened pull requests over the last 90 days.",
    rationale: "Responsiveness to contributors, expressed relatively.",
  },
  {
    key: "stale_open_prs_count_at_obs",
    label: "Stale open PRs",
    group: "Pull-request activity",
    window: "At t",
    definition: "Pull requests opened before t−90 days that are still open at t.",
    rationale: "Ignored contributions discourage further contribution and indicate maintainer absence.",
  },

  // Release activity
  {
    key: "releases_365d",
    label: "Releases 365d",
    group: "Release activity",
    window: "Last 365 days",
    definition: "GitHub releases published in the last 365 days.",
    rationale: "Shipping cadence: whether usable versions still reach users.",
  },
  {
    key: "days_since_last_release",
    label: "Days since release",
    group: "Release activity",
    window: "At t",
    definition: "Days since the most recent release or package version.",
    rationale: "Release staleness; complements commit staleness for projects that ship rarely.",
  },
  {
    key: "versions_published_365d",
    label: "Versions published",
    group: "Release activity",
    window: "Last 365 days",
    definition: "Package-registry versions published in the last 365 days.",
    rationale: "Package-level shipping, which can differ from repository releases.",
  },

  // Age and popularity proxies
  {
    key: "package_age_days",
    label: "Package age",
    group: "Age and popularity proxies",
    window: "At t",
    definition: "Days from the first published package version to t.",
    rationale: "Maturity context: young and long-established packages have different baseline inactivity risk.",
  },
  {
    key: "repo_age_days",
    label: "Repository age",
    group: "Age and popularity proxies",
    window: "At t",
    definition: "Days from repository creation to t.",
    rationale: "Normalizes gaps and cadence against how long the project has existed.",
  },
  {
    key: "stars_total_at_obs",
    label: "Stars at observation",
    group: "Age and popularity proxies",
    window: "At t",
    definition: "Cumulative stars observed up to t (a lower-bound proxy reconstructed from archive events).",
    rationale: "Popularity and visibility; more attention tends to correlate with continued maintenance.",
  },
  {
    key: "forks_total_at_obs",
    label: "Forks at observation",
    group: "Age and popularity proxies",
    window: "At t",
    definition: "Cumulative forks observed up to t.",
    rationale: "Reuse and derivative activity around the project.",
  },
  {
    key: "dependency_count_at_obs",
    label: "Dependency count",
    group: "Age and popularity proxies",
    window: "At t",
    definition: "Declared dependency count of the resolved package version at t.",
    rationale: "Proxy for maintenance burden and integration complexity.",
  },
  {
    key: "popularity_tier_at_obs",
    label: "Popularity tier",
    group: "Age and popularity proxies",
    window: "At t",
    definition: "Low / medium / high tier (0/1/2) derived from star and fork thresholds.",
    rationale: "Coarse popularity bucket, because inactivity dynamics differ between obscure and widely used projects.",
  },

  // Diagnostic and binary flags
  {
    key: "repo_archived_at_obs",
    label: "Archived at observation",
    group: "Diagnostic and binary flags",
    window: "At t",
    definition: "1 if the repository is archived by t, else 0.",
    rationale: "Retained as diagnostic metadata only; already-archived rows are excluded from fitting so archival cannot become a shortcut label.",
  },
  {
    key: "has_recent_release_flag",
    label: "Recent release",
    group: "Diagnostic and binary flags",
    window: "Last 365 days",
    definition: "1 if any release or package version appeared in the last 365 days.",
    rationale: "Simple “is it still shipping” indicator that is robust when exact counts are sparse.",
  },
  {
    key: "has_recent_pr_merge_flag",
    label: "Recent PR merge",
    group: "Diagnostic and binary flags",
    window: "Last 90 days",
    definition: "1 if any pull request was merged in the last 90 days.",
    rationale: "Simple “are maintainers still integrating” indicator.",
  },

  // Derived risk proxies
  {
    key: "activity_drop_365d_vs_prev_365d",
    label: "Activity drop",
    group: "Derived risk proxies",
    window: "Year over year",
    definition: "Relative decline in commits from the previous year to the last year (positive = fewer commits).",
    rationale: "Captures deceleration, enabling earlier detection of decline than the absolute level alone.",
  },
  {
    key: "contributors_drop_365d_vs_prev_365d",
    label: "Contributor drop",
    group: "Derived risk proxies",
    window: "Year over year",
    definition: "Relative decline in the contributor count from the previous year to the last year.",
    rationale: "Detects a shrinking maintainer base before commits fully stop.",
  },
  {
    key: "release_gap_risk",
    label: "Release gap risk",
    group: "Derived risk proxies",
    window: "At t",
    definition: "Score in [0,1] for how overdue the next release is relative to the project's own release cadence (age-based when no release history exists).",
    rationale: "Normalizes release silence against the project's normal rhythm rather than an absolute threshold.",
  },
  {
    key: "concentration_risk_score",
    label: "Concentration risk",
    group: "Derived risk proxies",
    window: "Last 365 days",
    definition: "Composite score in [0,1] combining top-1 and top-2 shares, the Herfindahl index, and the concentration flag.",
    rationale: "A single interpretable bus-factor risk value that consolidates the concentration features.",
  },

  // Responsiveness and backlog pressure
  {
    key: "issue_first_response_median_days_365d",
    label: "Issue first response",
    group: "Responsiveness and backlog pressure",
    window: "Last 365 days",
    definition: "Median days from issue creation to the first maintainer response over the last year.",
    rationale: "Slowing first responses indicate disengaging maintainers, independently of resolution speed.",
  },
  {
    key: "issue_resolution_median_days_365d",
    label: "Issue resolution time",
    group: "Responsiveness and backlog pressure",
    window: "Last 365 days",
    definition: "Median days from issue creation to closure over the last year.",
    rationale: "How quickly reported problems are actually resolved.",
  },
  {
    key: "stale_issue_share_at_obs",
    label: "Stale issue share",
    group: "Responsiveness and backlog pressure",
    window: "At t",
    definition: "Stale open issues divided by the current open backlog.",
    rationale: "The fraction of the backlog that is old, expressed relatively so it is comparable across sizes.",
  },
  {
    key: "pr_response_median_days_365d",
    label: "PR response time",
    group: "Responsiveness and backlog pressure",
    window: "Last 365 days",
    definition: "Median days to the first response, merge, or close on pull requests over the last year.",
    rationale: "Responsiveness to contributors, the pull-request counterpart to issue first response.",
  },
  {
    key: "pr_merge_latency_median_days_365d",
    label: "PR merge latency",
    group: "Responsiveness and backlog pressure",
    window: "Last 365 days",
    definition: "Median days from creation to merge for merged pull requests over the last year.",
    rationale: "Integration speed for work that is ultimately accepted.",
  },
];

export const featureDocByKey: Record<string, FeatureDoc> = Object.fromEntries(
  FEATURE_CATALOG.map((doc) => [doc.key, doc]),
);

/** key -> short label, for reuse by the analysis panel's label lookup. */
export const featureCatalogLabels: Record<string, string> = Object.fromEntries(
  FEATURE_CATALOG.map((doc) => [doc.key, doc.label]),
);

/** Features grouped in display order, for the documentation glossary. */
export function featureCatalogByGroup(): { group: FeatureGroupDoc; features: FeatureDoc[] }[] {
  return FEATURE_GROUPS.map((group) => ({
    group,
    features: FEATURE_CATALOG.filter((doc) => doc.group === group.group),
  }));
}
