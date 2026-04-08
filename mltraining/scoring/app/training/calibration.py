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
        calibrated: list[float] = []
        for prediction in predictions:
            calibrated.append(_lookup_bin_rate(self.bins, prediction))
        return calibrated


def _lookup_bin_rate(bins: list[CalibrationBinSummary], prediction: float) -> float:
    clipped = max(0.0, min(1.0, prediction))
    for index, bin_summary in enumerate(bins):
        is_last = index == len(bins) - 1
        if clipped < bin_summary.upper_bound or is_last:
            return bin_summary.empirical_rate
    return bins[-1].empirical_rate


def fit_histogram_calibrator(predictions: list[float], labels: list[int], bin_count: int = 10) -> HistogramCalibrator:
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
            empirical_rate = sum(bucket_labels) / count
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
