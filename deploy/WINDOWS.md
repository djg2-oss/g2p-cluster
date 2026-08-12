# Windows quick start (no Docker)

```powershell
cd C:\Users\Djg2\Downloads\g2p-cluster
git pull origin main

powershell -ExecutionPolicy Bypass -File deploy\start-cluster.ps1
```

Open: http://127.0.0.1:8080/

Test:
```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8080/api/pipeline -ContentType "application/json" -Body '{"text":"solve 2x^2+3x-5=0"}'
```

Stop:
```powershell
powershell -ExecutionPolicy Bypass -File deploy\stop-cluster.ps1
```

Optional UTF-8 console:
```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```
