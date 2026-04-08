package manifest

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var ErrUnsupportedArtifact = errors.New("unsupported artifact")

func ParseArtifact(fileName string, content []byte) (Result, error) {
	switch strings.ToLower(filepath.Base(fileName)) {
	case "package-lock.json":
		return parsePackageLock(content)
	case "requirements.txt":
		return parseRequirements(content)
	case "poetry.lock":
		return parsePoetryLock(content)
	case "go.mod":
		return parseGoMod(content)
	default:
		return Result{}, fmt.Errorf("%w: %s", ErrUnsupportedArtifact, fileName)
	}
}

func MustParseArtifact(fileName string, content []byte) Result {
	result, err := ParseArtifact(fileName, content)
	if err != nil {
		panic(err)
	}
	return result
}

type packageLockDocument struct {
	Name         string                        `json:"name"`
	Packages     map[string]packageLockPackage `json:"packages"`
	Dependencies map[string]packageLockEntry   `json:"dependencies"`
}

type packageLockPackage struct {
	Version      string            `json:"version"`
	Dependencies map[string]string `json:"dependencies"`
}

type packageLockEntry struct {
	Version      string                      `json:"version"`
	Dependencies map[string]packageLockEntry `json:"dependencies"`
}

func parsePackageLock(content []byte) (Result, error) {
	var lock packageLockDocument
	if err := json.Unmarshal(content, &lock); err != nil {
		return Result{}, fmt.Errorf("decode package-lock: %w", err)
	}

	rootName := lock.Name
	if rootName == "" {
		rootName = "root"
	}

	directNames := map[string]bool{}
	if root, ok := lock.Packages[""]; ok {
		for name := range root.Dependencies {
			directNames[name] = true
		}
	}
	if len(directNames) == 0 {
		for name := range lock.Dependencies {
			directNames[name] = true
		}
	}

	depsByName := map[string]PackageRef{}
	edges := make([]DependencyEdge, 0)
	visited := map[string]bool{}

	var walk func(parent string, name string, entry packageLockEntry, path []string, direct bool)
	walk = func(parent string, name string, entry packageLockEntry, path []string, direct bool) {
		key := parent + ">" + name + "@" + entry.Version
		if visited[key] {
			return
		}
		visited[key] = true

		dep, exists := depsByName[name]
		if !exists || (!dep.Direct && direct) {
			depsByName[name] = PackageRef{
				Name:      name,
				Version:   entry.Version,
				Ecosystem: "npm",
				Direct:    direct,
				Path:      append([]string(nil), path...),
			}
		}
		edges = append(edges, DependencyEdge{From: parent, To: name})
		for childName, child := range entry.Dependencies {
			walk(name, childName, child, append(path, childName), false)
		}
	}

	for name, entry := range lock.Dependencies {
		walk(rootName, name, entry, []string{rootName, name}, directNames[name])
	}

	dependencies := mapValuesSorted(depsByName)
	if len(dependencies) == 0 && len(lock.Packages) > 0 {
		for path, item := range lock.Packages {
			if path == "" || path == "node_modules" {
				continue
			}
			name := filepath.Base(path)
			dependencies = append(dependencies, PackageRef{
				Name:      name,
				Version:   item.Version,
				Ecosystem: "npm",
				Direct:    strings.Count(path, "node_modules/") == 1,
				Path:      []string{rootName, name},
			})
			edges = append(edges, DependencyEdge{From: rootName, To: name})
		}
	}

	return Result{RootName: rootName, Ecosystem: "npm", Dependencies: dependencies, Edges: uniqueEdges(edges)}, nil
}

var requirementPattern = regexp.MustCompile(`^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*(?:==|>=|<=|~=|!=)\s*([^\s;]+)`)

func parseRequirements(content []byte) (Result, error) {
	scanner := bufio.NewScanner(bytes.NewReader(content))
	dependencies := make([]PackageRef, 0)
	edges := make([]DependencyEdge, 0)
	rootName := "requirements"

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "--") || strings.HasPrefix(line, "-r") {
			continue
		}
		line = strings.SplitN(line, "#", 2)[0]
		match := requirementPattern.FindStringSubmatch(strings.TrimSpace(line))
		if len(match) != 3 {
			continue
		}
		name := normalizePythonName(match[1])
		version := match[2]
		dependencies = append(dependencies, PackageRef{Name: name, Version: version, Ecosystem: "pypi", Direct: true, Path: []string{rootName, name}})
		edges = append(edges, DependencyEdge{From: rootName, To: name})
	}
	if err := scanner.Err(); err != nil {
		return Result{}, fmt.Errorf("scan requirements: %w", err)
	}
	return Result{RootName: rootName, Ecosystem: "pypi", Dependencies: dependencies, Edges: uniqueEdges(edges)}, nil
}

func normalizePythonName(name string) string {
	return strings.ToLower(strings.ReplaceAll(strings.TrimSpace(name), "_", "-"))
}

func parsePoetryLock(content []byte) (Result, error) {
	scanner := bufio.NewScanner(bytes.NewReader(content))
	rootName := "poetry"
	dependencies := make([]PackageRef, 0)
	edges := make([]DependencyEdge, 0)
	current := map[string]string{}

	flush := func() {
		name := normalizePythonName(current["name"])
		version := current["version"]
		if name == "" || version == "" {
			current = map[string]string{}
			return
		}
		direct := current["category"] == "main" || current["groups"] == "['main']" || current["optional"] == "false"
		dependencies = append(dependencies, PackageRef{Name: name, Version: version, Ecosystem: "pypi", Direct: direct, Path: []string{rootName, name}})
		edges = append(edges, DependencyEdge{From: rootName, To: name})
		current = map[string]string{}
	}

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "[[package]]" {
			flush()
			continue
		}
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		value := strings.Trim(strings.TrimSpace(parts[1]), `"`)
		current[key] = value
	}
	flush()
	if err := scanner.Err(); err != nil {
		return Result{}, fmt.Errorf("scan poetry.lock: %w", err)
	}
	return Result{RootName: rootName, Ecosystem: "pypi", Dependencies: dependencies, Edges: uniqueEdges(edges)}, nil
}

func parseGoMod(content []byte) (Result, error) {
	scanner := bufio.NewScanner(bytes.NewReader(content))
	rootName := "module"
	dependencies := make([]PackageRef, 0)
	edges := make([]DependencyEdge, 0)
	inBlock := false

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		if strings.HasPrefix(line, "module ") {
			rootName = strings.TrimSpace(strings.TrimPrefix(line, "module "))
			continue
		}
		if strings.HasPrefix(line, "require (") {
			inBlock = true
			continue
		}
		if inBlock && line == ")" {
			inBlock = false
			continue
		}
		if strings.HasPrefix(line, "require ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "require "))
		} else if !inBlock {
			continue
		}
		direct := !strings.Contains(line, "// indirect")
		line = strings.SplitN(line, "//", 2)[0]
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		name := fields[0]
		dependencies = append(dependencies, PackageRef{Name: name, Version: fields[1], Ecosystem: "go", Direct: direct, Path: []string{rootName, name}})
		edges = append(edges, DependencyEdge{From: rootName, To: name})
	}
	if err := scanner.Err(); err != nil {
		return Result{}, fmt.Errorf("scan go.mod: %w", err)
	}
	return Result{RootName: rootName, Ecosystem: "go", Dependencies: dependencies, Edges: uniqueEdges(edges)}, nil
}

func mapValuesSorted(values map[string]PackageRef) []PackageRef {
	dependencies := make([]PackageRef, 0, len(values))
	for _, dependency := range values {
		dependencies = append(dependencies, dependency)
	}
	sort.Slice(dependencies, func(i, j int) bool {
		return dependencies[i].Name < dependencies[j].Name
	})
	return dependencies
}

func uniqueEdges(edges []DependencyEdge) []DependencyEdge {
	seen := map[string]bool{}
	unique := make([]DependencyEdge, 0, len(edges))
	for _, edge := range edges {
		key := edge.From + "->" + edge.To
		if seen[key] {
			continue
		}
		seen[key] = true
		unique = append(unique, edge)
	}
	return unique
}
