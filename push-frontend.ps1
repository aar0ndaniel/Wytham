param(
  [string]$RepositoryPath = $PSScriptRoot,
  [string]$SourceBranch = 'main',
  [string]$MirrorBranch = 'deploy/frontend',
  [string]$Remote = 'origin'
)

$ErrorActionPreference = 'Stop'

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & git -C $RepositoryPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

Invoke-Git fetch $Remote $SourceBranch $MirrorBranch

$sourceTip = & git -C $RepositoryPath rev-parse $SourceBranch
if ($LASTEXITCODE -ne 0) {
  throw "Unable to resolve $SourceBranch"
}

$mirrorTip = & git -C $RepositoryPath rev-parse "$Remote/$MirrorBranch"
if ($LASTEXITCODE -ne 0) {
  throw "Unable to resolve $Remote/$MirrorBranch"
}

Invoke-Git push $Remote "${sourceTip}:refs/heads/$SourceBranch"
Invoke-Git push $Remote "${sourceTip}:refs/heads/$MirrorBranch" "--force-with-lease=refs/heads/${MirrorBranch}:$mirrorTip"

Write-Host "Pushed $sourceTip to $SourceBranch and $MirrorBranch on $Remote."