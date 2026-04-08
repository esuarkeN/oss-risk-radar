package manifest

import "testing"

func TestParseRequirements(t *testing.T) {
	result, err := ParseArtifact("requirements.txt", []byte("requests==2.32.3\nurllib3>=2.2.1\n"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Dependencies) != 2 || result.Dependencies[0].Name != "requests" || result.Dependencies[1].Version != "2.2.1" {
		t.Fatalf("unexpected dependencies: %#v", result.Dependencies)
	}
	if len(result.Edges) != 2 {
		t.Fatalf("expected 2 edges, got %d", len(result.Edges))
	}
}

func TestParsePackageLock(t *testing.T) {
	content := []byte(`{
  "name": "demo-app",
  "packages": {
    "": {"dependencies": {"lodash": "^4.17.21"}}
  },
  "dependencies": {
    "lodash": {
      "version": "4.17.21",
      "dependencies": {
        "semver": {"version": "7.6.0"}
      }
    }
  }
}`)
	result, err := ParseArtifact("package-lock.json", content)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.RootName != "demo-app" || len(result.Dependencies) != 2 || len(result.Edges) != 2 {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestParsePoetryLock(t *testing.T) {
	content := []byte("[[package]]\nname = \"fastapi\"\nversion = \"0.115.12\"\ncategory = \"main\"\noptional = false\n\n[[package]]\nname = \"pydantic\"\nversion = \"2.11.3\"\n")
	result, err := ParseArtifact("poetry.lock", content)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Dependencies) != 2 || result.Dependencies[0].Name != "fastapi" {
		t.Fatalf("unexpected dependencies: %#v", result.Dependencies)
	}
}

func TestParseGoMod(t *testing.T) {
	content := []byte("module demo\n\nrequire (\n github.com/gin-gonic/gin v1.10.0\n golang.org/x/net v0.34.0 // indirect\n)\n")
	result, err := ParseArtifact("go.mod", content)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Dependencies) != 2 || result.Dependencies[0].Name != "github.com/gin-gonic/gin" {
		t.Fatalf("unexpected dependencies: %#v", result.Dependencies)
	}
	if !result.Dependencies[0].Direct || result.Dependencies[1].Direct {
		t.Fatalf("expected indirect marker to be preserved: %#v", result.Dependencies)
	}
}
