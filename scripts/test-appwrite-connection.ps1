#!/usr/bin/env pwsh

$headers = @{
    "X-Appwrite-Project" = "69ea271e000d28e3afce"
    "X-Appwrite-Key" = "standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204"
    "Content-Type" = "application/json"
}

$url = "https://fra.cloud.appwrite.io/v1/databases/database-69ea274b00316d3d1dfb"

try {
    Write-Host "🔍 Testando conexão com Appwrite..." -ForegroundColor Cyan
    Write-Host "URL: $url" -ForegroundColor Gray
    
    $response = Invoke-WebRequest -Uri $url -Headers $headers -Method Get -TimeoutSec 10
    
    Write-Host "✅ Conexão OK! Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ""
    Write-Host $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 2
    
} catch {
    Write-Host "❌ Erro: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
