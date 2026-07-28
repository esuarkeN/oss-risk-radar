# Bachelor Thesis LaTeX Workspace

This folder contains the thesis source. The structure is based on the shape of
the `kannX/phs-latex-templates` project: central metadata, central settings,
chapter files, references, images, and code snippets.

## Build

There are two builds. From the repository root:

```powershell
npm.cmd run thesis:build             # public version  -> build/thesis.pdf
npm.cmd run thesis:build:submission  # handed-in copy  -> build/thesis-submission.pdf
```

| | `thesis.pdf` | `thesis-submission.pdf` |
| --- | --- | --- |
| Body text, figures, appendix | identical | identical |
| Author name, title, program, university | yes | yes |
| Matriculation number, e-mail, study group | no | yes |
| Examiners on the Deckblatt | no | yes |
| Signing city under the declaration | no | yes |
| Handwritten signature on the declaration | no | yes |
| Signed Telekom Steckbrief | no | yes |
| Tracked in git | yes | no (gitignored) |

Three files carry the personal parts, all gitignored and all read only by
`scripts/build.ps1 -Submission`:

| File | Contents |
| --- | --- |
| `metadata-private.tex` | matriculation number, e-mail, study group, examiners, signing city |
| `frontmatter/steckbrief.pdf` | signed Telekom Steckbrief, bound after the Deckblatt |
| `frontmatter/signature.png` | scanned signature, placed on the rule of the declaration (transparent background, ~700 px wide) |

Keep a backup of the three outside the repository — a fresh clone will not contain
them, and the submission build then falls back to the redacted version, warning
once per missing file.

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

- Change title, author, and university data in `metadata.tex` (public values only).
- Change matriculation number, e-mail, study group, examiners, and signing city in
  `metadata-private.tex`. Never move those values into `metadata.tex`.
- Add or remove chapters in `main.tex`.
- Put chapter text in `chapters/`.
- Put bibliography entries in `references.bib`.
- Put diagrams, screenshots, and figures in `images/`.
- Put source listings or exports in `code/`.
