param([string]$Name = "t")
$we = "d:\software\steam\steamapps\common\wallpaper_engine"
$proj = "$we\projects\myprojects\DSH-Visualization"
Copy-Item "D:\project\dsh-Visualization\wallpaper\test.html" "$proj\index.html" -Force

Get-Process wallpaper64,wallpaper32 -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Start-Process "$we\wallpaper64.exe"
Start-Sleep -Seconds 9
& "$we\wallpaper64.exe" -control openWallpaper -file "$proj\project.json" -monitor 1 2>&1 | Out-Null
Start-Sleep -Seconds 9

Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 2560, 1440
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen((New-Object System.Drawing.Point 2560, 0), [System.Drawing.Point]::Empty, (New-Object System.Drawing.Size 2560, 1440))
$bmp.Save("D:\project\dsh-Visualization\shots\$Name.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

$c = Get-NetTCPConnection -LocalPort 8799 -ErrorAction SilentlyContinue
$est = @($c | Where-Object { $_.State -eq 'Established' }).Count
"connections established: $est ; saved shots/$Name.png"
