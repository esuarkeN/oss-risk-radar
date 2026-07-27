param(
  [switch]$Watch,
  # Bind the signed Steckbrief into the front matter and write a separate,
  # gitignored output. Use this for the copy that is handed in; the plain build
  # stays free of the signature so it can live in the public repository.
  [switch]$Submission
)

$ErrorActionPreference = "Stop"

$ThesisRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BuildDir = Join-Path $ThesisRoot "build"
$MainFile = Join-Path $ThesisRoot "main.tex"

if ($Submission) {
  $JobName = "thesis-submission"
  $PreTex = '\def\WITHSTECKBRIEF{}'
  $TexArg = "$PreTex\input{main.tex}"
  $Steckbrief = Join-Path $ThesisRoot "frontmatter\steckbrief.pdf"
  if (-not (Test-Path $Steckbrief)) {
    Write-Warning "frontmatter\steckbrief.pdf not found - the submission build will be produced WITHOUT the Steckbrief page."
  }
} else {
  $JobName = "thesis"
  $PreTex = ""
  $TexArg = $MainFile
}

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

    $preArgs = @()
    if ($PreTex) { $preArgs += "-usepretex=$PreTex" }

    # NB the -jobname argument must be quoted: PowerShell does not expand a variable
    # in a token it parses as a parameter name, so -jobname=$JobName would be passed
    # through literally.
    & latexmk @watchArgs @preArgs -pdf -interaction=nonstopmode -halt-on-error `
      "-jobname=$JobName" -outdir="$BuildDir" "$MainFile"
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
