param(
  [switch]$Watch
)

$ErrorActionPreference = "Stop"

$ThesisRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BuildDir = Join-Path $ThesisRoot "build"
$MainFile = Join-Path $ThesisRoot "main.tex"

New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null

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

    & latexmk @watchArgs -pdf -interaction=nonstopmode -halt-on-error `
      -jobname=thesis -outdir="$BuildDir" "$MainFile"
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

    & pdflatex -interaction=batchmode -halt-on-error -jobname=thesis -output-directory="$BuildDir" "$MainFile"
    & biber --input-directory "$BuildDir" --output-directory "$BuildDir" thesis
    & pdflatex -interaction=batchmode -halt-on-error -jobname=thesis -output-directory="$BuildDir" "$MainFile"
    & pdflatex -interaction=batchmode -halt-on-error -jobname=thesis -output-directory="$BuildDir" "$MainFile"
    exit $LASTEXITCODE
  }

  Require-CommandHint
}
finally {
  Pop-Location
}
