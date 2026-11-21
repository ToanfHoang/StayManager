# Chạy StayManager ở chế độ phát triển: API (cổng 4100) + giao diện (cổng 5173). CSDL SQLite tự tạo.
# Chạy: powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1
$root = Split-Path -Parent $PSScriptRoot
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\backend'; npm run dev" -WindowStyle Normal
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\frontend'; npm run dev" -WindowStyle Normal
Start-Sleep -Seconds 5
Start-Process 'http://localhost:5173'
Write-Host 'Đã mở StayManager tại http://localhost:5173' -ForegroundColor Green
