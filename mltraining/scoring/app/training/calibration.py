from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class CalibrationBinSummary:
    lower_bound: float
    upper_bound: float
    count: int
    average_prediction: float
    empirical_rate: float


@dataclass(slots=True)
class HistogramCalibrator:
    bins: list[CalibrationBinSummary]

    def predict(self, predictions: list[float]) -> list[float]:
        anchors = _interpolation_anchors(self.bins)
        return [_interpolated_rate(anchors, prediction) for prediction in predictions]


def _interpolation_anchors(bins: list[CalibrationBinSummary]) -> list[tuple[float, float]]:
    """Anchor points ``(average_prediction, empirical_rate)`` for piecewise-linear calibration.

    Only populated bins are used as anchors: empty bins carry forward a neighbour's rate,
    so anchoring on them would reintroduce flat segments. ``empirical_rate`` is already
    monotonic non-decreasing from ``fit_histogram_calibrator``, so sorting by the raw-score
    axis yields a monotone mapping.
    """
    populated = [(bin_summary.average_prediction, bin_summary.empirical_rate) for bin_summary in bins if bin_summary.count > 0]
    anchors = populated or [(bin_summary.average_prediction, bin_summary.empirical_rate) for bin_summary in bins]
    return sorted(anchors)


def _interpolated_rate(anchors: list[tuple[float, float]], prediction: float) -> float:
    if not anchors:
        return max(0.0, min(1.0, prediction))
    clipped = max(0.0, min(1.0, prediction))
    if clipped <= anchors[0][0]:
        return anchors[0][1]
    if clipped >= anchors[-1][0]:
        return anchors[-1][1]
    for (x0, y0), (x1, y1) in zip(anchors, anchors[1:], strict=False):
        if clipped <= x1:
            if x1 == x0:
                return y1
            weight = (clipped - x0) / (x1 - x0)
            return y0 + weight * (y1 - y0)
    return anchors[-1][1]


def fit_histogram_calibrator(
    predictions: list[float],
    labels: list[int],
    bin_count: int = 10,
    smoothing_weight: float = 4.0,
) -> HistogramCalibrator:
    if len(predictions) != len(labels):
        raise ValueError("predictions and labels must have the same length")
    if not predictions:
        raise ValueError("predictions cannot be empty")

    width = 1.0 / bin_count
    raw_bins: list[dict[str, list[float] | list[int]]] = [
        {"predictions": [], "labels": []} for _ in range(bin_count)
    ]

    for prediction, label in zip(predictions, labels, strict=True):
        clipped = max(0.0, min(1.0, prediction))
        index = min(bin_count - 1, int(clipped / width))
        raw_bins[index]["predictions"].append(clipped)
        raw_bins[index]["labels"].append(int(label))

    base_rate = sum(int(label) for label in labels) / len(labels)
    summaries: list[CalibrationBinSummary] = []
    previous_rate = 0.0
    for index, bucket in enumerate(raw_bins):
        lower = round(index * width, 6)
        upper = round((index + 1) * width, 6)
        bucket_predictions = bucket["predictions"]
        bucket_labels = bucket["labels"]
        count = len(bucket_predictions)
        if count:
            average_prediction = sum(bucket_predictions) / count
            empirical_rate = (sum(bucket_labels) + (base_rate * smoothing_weight)) / (count + smoothing_weight)
        else:
            average_prediction = lower + (width / 2)
            empirical_rate = previous_rate

        monotonic_rate = max(previous_rate, empirical_rate)
        previous_rate = monotonic_rate
        summaries.append(
            CalibrationBinSummary(
                lower_bound=lower,
                upper_bound=upper,
                count=count,
                average_prediction=round(average_prediction, 6),
                empirical_rate=round(monotonic_rate, 6),
            )
        )

    return HistogramCalibrator(bins=summaries)
