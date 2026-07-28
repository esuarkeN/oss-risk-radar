param(
  [switch]$Watch,
  # Build the copy that is handed in: personal data from metadata-private.tex on the
  # title page and under the declaration, plus the signed Steckbrief bound into the
  # front matter. Written to a separate, gitignored output. The plain build stays
  # redacted and free of the signature so it can live in the public repository.
  [switch]$Submission
)

$ErrorActionPreference = "Stop"

$ThesisRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BuildDir = Join-Path $ThesisRoot "build"
$MainFile = Join-Path $ThesisRoot "main.tex"

if ($Submission) {
  $JobName = "thesis-submission"
  $Steckbrief = Join-Path $ThesisRoot "frontmatter\steckbrief.pdf"
  if (-not (Test-Path $Steckbrief)) {
    Write-Warning "frontmatter\steckbrief.pdf not found - the submission build will be produced WITHOUT the Steckbrief page."
  }
  $PrivateMetadata = Join-Path $ThesisRoot "metadata-private.tex"
  if (-not (Test-Path $PrivateMetadata)) {
    Write-Warning "metadata-private.tex not found - the submission build will be produced WITHOUT matriculation number, e-mail, study group, examiners and signing city."
  }
} else {
  $JobName = "thesis"
  $TexArg = $MainFile
}

New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null

# The submission flag is set through a generated wrapper file rather than by passing
# TeX code on the command line. Windows PowerShell drops the leading backslash of an
# argument such as \def\SUBMISSIONBUILD{}\input{main.tex}, so pdflatex received it as
# the filename "defSUBMISSIONBUILD" and stopped. \input resolves against the working
# directory, which is the thesis root, so main.tex and its chapters are still found.
if ($Submission) {
  $TexArg = Join-Path $BuildDir "$JobName.tex"
  Set-Content -Path $TexArg -Encoding utf8 -Value '\def\SUBMISSIONBUILD{}\input{main.tex}'
}

function Require-CommandHint {
  Write-Error @"
No LaTeX compiler was found.

Install a LaTeX distribution such as MiKTeX or TeX Live, then make sure
latexmk, pdflatex, and biber are available on PATH.

Expected output after setup:
  tex/thesis/build/thesis.pdf
"@
}

$latexmk = Get-Command latexmk -ErrorAction SilentlyContinue
$pdflatex = Get-Command pdflatex -ErrorAction SilentlyContinue
$biber = Get-Command biber -ErrorAction SilentlyContinue
$perl = Get-Command perl -ErrorAction SilentlyContinue

Push-Location $ThesisRoot
try {
  if ($latexmk -and $perl) {
    $watchArgs = @()
    if ($Watch) {
      $watchArgs += "-pvc"
    }

    # NB the -jobname argument must be quoted: PowerShell does not expand a variable
    # in a token it parses as a parameter name, so -jobname=$JobName would be passed
    # through literally.
    & latexmk @watchArgs -pdf -interaction=nonstopmode -halt-on-error `
      "-jobname=$JobName" -outdir="$BuildDir" "$TexArg"
    if ($LASTEXITCODE -eq 0) {
      exit 0
    }
    if ($Watch -or -not $pdflatex) {
      exit $LASTEXITCODE
    }

    Write-Warning "latexmk failed; falling back to pdflatex/biber."
  }

  if ($latexmk -and -not $perl) {
    Write-Warning "latexmk was found, but Perl is missing; using pdflatex/biber fallback."
  }

  if ($pdflatex) {
    if (-not $biber) {
      Write-Error "pdflatex was found, but biber is missing. Install biber or add it to PATH."
    }

    & pdflatex -interaction=batchmode -halt-on-error "-jobname=$JobName" -output-directory="$BuildDir" "$TexArg"
    & biber --input-directory "$BuildDir" --output-directory "$BuildDir" $JobName
    & pdflatex -interaction=batchmode -halt-on-error "-jobname=$JobName" -output-directory="$BuildDir" "$TexArg"
    & pdflatex -interaction=batchmode -halt-on-error "-jobname=$JobName" -output-directory="$BuildDir" "$TexArg"
    exit $LASTEXITCODE
  }

  Require-CommandHint
}
finally {
  Pop-Location
}
