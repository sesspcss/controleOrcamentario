/**
 * Coordenadas centrais das 17 DRS e das 18 RRAS do Estado de São Paulo.
 * DRS = Departamento Regional de Saúde (17 regiões)
 * RRAS = Redes Regionais de Atenção à Saúde (18 redes — NÃO coincidem 1:1 com DRS)
 *
 * Mapeamento DRS → RRAS:
 *   DRS I  → RRAS 01 (ABC), RRAS 02 (Alto Tietê), RRAS 03 (Franco da Rocha),
 *             RRAS 04 (Mananciais), RRAS 05 (Rota dos Bandeirantes), RRAS 06 (São Paulo)
 *   DRS II  → RRAS 12  |  DRS III → RRAS 18  |  DRS IV → (litoral, não listado)
 *   DRS V   → RRAS 13 (parcial)  |  DRS VI  → RRAS 09
 *   DRS VII → RRAS 16  |  DRS VIII → (Franca, não listado)
 *   DRS IX  → RRAS 10  |  DRS X  → RRAS 14  |  DRS XI → RRAS 11
 *   DRS XII → RRAS 07  |  DRS XIII → RRAS 13 (parcial)
 *   DRS XIV → RRAS 15  |  DRS XVI → RRAS 08  |  DRS XVII → RRAS 17
 */
export interface RegionCoord { lat: number; lng: number }

const REGIONS: { lat: number; lng: number; kw: string[] }[] = [
  // ── DRS (17 Departamentos Regionais de Saúde) ──────────────────────────
  { lat: -23.55,  lng: -46.63, kw: ['grande são paulo','grande sao paulo','capital','drs i ','drs 01','drs 1 '] },
  { lat: -21.21,  lng: -50.43, kw: ['araçatuba','aracatuba','drs ii ','drs 02','drs 2 '] },
  { lat: -21.78,  lng: -48.18, kw: ['araraquara','drs iii','drs 03','drs 3 '] },
  { lat: -23.96,  lng: -46.33, kw: ['baixada santista','santos','drs iv','drs 04','drs 4 '] },
  { lat: -20.55,  lng: -48.57, kw: ['barretos','drs v ','drs 05','drs 5 '] },
  { lat: -22.32,  lng: -49.07, kw: ['bauru','drs vi','drs 06','drs 6 '] },
  { lat: -22.91,  lng: -47.06, kw: ['campinas','drs vii','drs 07','drs 7 '] },
  { lat: -20.54,  lng: -47.40, kw: ['franca','drs viii','drs 08','drs 8 '] },
  { lat: -22.21,  lng: -49.95, kw: ['marília','marilia','drs ix','drs 09','drs 9 '] },
  { lat: -22.73,  lng: -47.65, kw: ['piracicaba','drs x ','drs 10'] },
  { lat: -22.12,  lng: -51.39, kw: ['presidente prudente','prudente','drs xi','drs 11'] },
  { lat: -24.49,  lng: -47.84, kw: ['registro','drs xii','drs 12'] },
  { lat: -21.17,  lng: -47.81, kw: ['ribeirão preto','ribeirao preto','drs xiii','drs 13'] },
  { lat: -21.97,  lng: -46.80, kw: ['são joão','sao joao','boa vista','drs xiv','drs 14'] },
  { lat: -20.82,  lng: -49.38, kw: ['rio preto','são josé','sao jose','drs xv','drs 15'] },
  { lat: -23.50,  lng: -47.45, kw: ['sorocaba','drs xvi','drs 16'] },
  { lat: -23.02,  lng: -45.56, kw: ['taubaté','taubate','drs xvii','drs 17','vale do paraíba','vale do paraiba','são josé dos campos','sao jose dos campos'] },

  // ── RRAS (18 Redes Regionais de Atenção à Saúde) — coordenadas corretas ─
  // RRAS 01: ABC Paulista (DRS I) — Santo André / São Bernardo / Mauá
  { lat: -23.69,  lng: -46.49, kw: ['rras 01','rras01','rras 1 '] },
  // RRAS 02: Alto do Tietê (DRS I) — Mogi das Cruzes / Suzano
  { lat: -23.50,  lng: -46.16, kw: ['rras 02','rras02','rras 2 '] },
  // RRAS 03: Franco da Rocha (DRS I) — Franco da Rocha / Francisco Morato
  { lat: -23.31,  lng: -46.73, kw: ['rras 03','rras03','rras 3 '] },
  // RRAS 04: Mananciais (DRS I) — Taboão da Serra / Itapecerica / Embu
  { lat: -23.67,  lng: -46.85, kw: ['rras 04','rras04','rras 4 '] },
  // RRAS 05: Rota dos Bandeirantes (DRS I) — Barueri / Cotia / Carapicuíba
  { lat: -23.53,  lng: -46.92, kw: ['rras 05','rras05','rras 5 '] },
  // RRAS 06: São Paulo capital (DRS I)
  { lat: -23.55,  lng: -46.63, kw: ['rras 06','rras06','rras 6 '] },
  // RRAS 07: Vale do Ribeira (DRS XII) — Registro / Iguape / Cananéia
  { lat: -24.49,  lng: -47.84, kw: ['rras 07','rras07','rras 7 ','vale do ribeira'] },
  // RRAS 08: Sorocaba (DRS XVI) — Sorocaba / Votorantim / Itu
  { lat: -23.50,  lng: -47.46, kw: ['rras 08','rras08','rras 8 '] },
  // RRAS 09: Polo Cuesta / Bauru (DRS VI) — Bauru / Jaú / Lençóis
  { lat: -22.33,  lng: -48.92, kw: ['rras 09','rras09','rras 9 ','polo cuesta'] },
  // RRAS 10: Alta Paulista / Marília (DRS IX) — Adamantina / Marília / Assis
  { lat: -22.19,  lng: -50.48, kw: ['rras 10','rras10'] },
  // RRAS 11: Presidente Prudente (DRS XI)
  { lat: -22.18,  lng: -51.80, kw: ['rras 11','rras11','pontal do paranapanema'] },
  // RRAS 12: Araçatuba (DRS II) — Araçatuba / Andradina / Auriflama
  { lat: -20.93,  lng: -50.79, kw: ['rras 12','rras12'] },
  // RRAS 13: Barretos + Ribeirão Preto (DRS V + XIII) — centroide
  { lat: -21.03,  lng: -48.20, kw: ['rras 13','rras13'] },
  // RRAS 14: Piracicaba / Rio Claro (DRS X)
  { lat: -22.57,  lng: -47.54, kw: ['rras 14','rras14'] },
  // RRAS 15: Baixa Mogiana / São João da Boa Vista (DRS XIV)
  { lat: -21.94,  lng: -46.92, kw: ['rras 15','rras15','baixa mogiana'] },
  // RRAS 16: Campinas / Bragança Paulista (DRS VII)
  { lat: -22.97,  lng: -46.62, kw: ['rras 16','rras16'] },
  // RRAS 17: Taubaté / Vale do Paraíba (DRS XVII)
  { lat: -23.02,  lng: -45.56, kw: ['rras 17','rras17'] },
  // RRAS 18: Araraquara / São Carlos (DRS III)
  { lat: -21.85,  lng: -48.22, kw: ['rras 18','rras18'] },
];

export function findRegionCoord(name: string): RegionCoord | null {
  if (!name) return null;
  const l = (name + ' ').toLowerCase();
  for (const r of REGIONS) {
    for (const k of r.kw) {
      if (l.includes(k)) return { lat: r.lat, lng: r.lng };
    }
  }
  return null;
}

