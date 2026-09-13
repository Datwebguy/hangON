$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'narration.txt'
$outputPath = Join-Path $PSScriptRoot 'public\narration.wav'
New-Item -ItemType Directory -Force (Split-Path $outputPath) | Out-Null
$edgePath = Join-Path $PSScriptRoot 'public\narration-edge.mp3'
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    & python -m edge_tts -f $scriptPath -v en-US-AriaNeural --rate=+18% --volume=+0% --pitch=+0Hz --write-media $edgePath
    if ($LASTEXITCODE -eq 0) {
        & ffmpeg -y -i $edgePath -ar 48000 -ac 2 -c:a pcm_s16le $outputPath | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Output 'Used Edge neural speech for the narration.'
            Write-Output "Created $outputPath"
            exit 0
        }
    }
}
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = -1
$synth.Volume = 100
$voice = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'en-*' } | Select-Object -First 1
if ($voice) {
    try { $synth.SelectVoice($voice.VoiceInfo.Name) } catch { $voice = $null }
}
if ($voice) {
    $synth.SetOutputToWaveFile($outputPath)
    $synth.Speak((Get-Content -Raw $scriptPath))
    $synth.Dispose()
} else {
    $synth.Dispose()
    & ffmpeg -y -f lavfi -i "flite=textfile=$scriptPath" -ar 48000 -ac 2 -c:a pcm_s16le $outputPath | Out-Null
    if ($LASTEXITCODE -ne 0) {
        & ffmpeg -y -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -t 120 -c:a pcm_s16le $outputPath | Out-Null
        Write-Warning 'Offline speech synthesis was unavailable; created a silent narration track. Use narration.txt for voiceover recording.'
    } else {
        Write-Output 'Used FFmpeg flite for offline narration.'
    }
}
Write-Output "Created $outputPath"
