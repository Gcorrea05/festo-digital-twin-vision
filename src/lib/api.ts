const API_BASE_URL = "http://localhost:8000/api"; // ajuste se backend estiver em outra porta

// Função genérica para requisições
async function apiGet(path: string) {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Erro na API: ${res.status}`);
  }
  return res.json();
}

// Exemplos de funções específicas
export async function getLiveMetrics() {
  return apiGet("/metrics/live");
}

export async function getProductionStats() {
  return apiGet("/metrics/production");
}
