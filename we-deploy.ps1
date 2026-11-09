param([string]$Src = "D:\project\dsh-Visualization\wallpaper\debug.html", [int]$Monitor = 1, [string]$Shot = "dbg")
$we = "d:\software\steam\steamapps\common\wallpaper_engine"
$proj = "$we\projects\myprojects\DSH-Visualization"

Get-Process wallpaper64,wallpaper32 -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5

Remove-Item "$proj\index.html" -Force -ErrorAction SilentlyContinue
Copy-Item $Src "$proj\index.html" -Force
"deployed: " + (Get-Item "$proj\index.html").Length + " bytes"

Start-Process "$we\wallpaper64.exe"
Start-Sleep -Seconds 10
& "$we\wallpaper64.exe" -control openWallpaper -file "$proj\project.json" -monitor $Monitor 2>&1 | Out-Null
Start-Sleep -Seconds 9

Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 2560, 900
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen((New-Object System.Drawing.Point 2560, 0), [System.Drawing.Point]::Empty, (New-Object System.Drawing.Size 2560, 900))
$bmp.Save("D:\project\dsh-Visualization\shots\$Shot.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
"saved shots/$Shot.png"
