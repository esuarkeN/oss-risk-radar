# Bachelor Thesis LaTeX Workspace

This folder contains the thesis source. The structure is based on the shape of
the `kannX/phs-latex-templates` project: central metadata, central settings,
chapter files, references, images, and code snippets.

## Build

From the repository root:

```powershell
npm.cmd run thesis:build
```

The rendered PDF is written to:

```text
tex/thesis/build/thesis.pdf
```

For continuous preview while writing:

```powershell
npm.cmd run thesis:watch
```

To remove generated files:

```powershell
npm.cmd run thesis:clean
```

## Requirements

Install a LaTeX distribution that provides `latexmk`, `pdflatex`, and `biber`.

- Windows: MiKTeX or TeX Live
- macOS: MacTeX
- Linux: TeX Live

The build script prefers `latexmk` with `pdflatex`. If `latexmk` is missing, it
falls back to a direct `pdflatex`/`biber` build.

## Editing

- Change title, author, university, and supervisor data in `metadata.tex`.
- Add or remove chapters in `main.tex`.
- Put chapter text in `chapters/`.
- Put bibliography entries in `references.bib`.
- Put diagrams, screenshots, and figures in `images/`.
- Put source listings or exports in `code/`.
