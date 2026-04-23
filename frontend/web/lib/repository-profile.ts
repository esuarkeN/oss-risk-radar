import type { DependencyRecord } from "@/lib/types";

export const REPOSITORY_PROFILE_VERSION = "repository profile";

export function isRepositoryProfile(dependency: Pick<DependencyRecord, "ecosystem" | "packageVersion"> | null | undefined) {
  return dependency?.ecosystem === "unknown" && dependency.packageVersion === REPOSITORY_PROFILE_VERSION;
}

export function dependencyDisplayName(dependency: DependencyRecord) {
  if (isRepositoryProfile(dependency)) {
    return dependency.repository?.fullName ?? dependency.packageName;
  }
  return dependency.packageName;
}

export function dependencyDisplayVersion(dependency: DependencyRecord) {
  if (isRepositoryProfile(dependency)) {
    return "Repository profile";
  }
  return dependency.packageVersion;
}
