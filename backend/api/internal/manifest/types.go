package manifest

type PackageRef struct {
	Name      string
	Version   string
	Ecosystem string
	Direct    bool
	Path      []string
}

type DependencyEdge struct {
	From string
	To   string
}

type Result struct {
	RootName     string
	Ecosystem    string
	Dependencies []PackageRef
	Edges        []DependencyEdge
}
