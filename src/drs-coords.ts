/**
 * Coordenadas centrais das 17 DRS (Departamento Regional de Saúde)
 * do Estado de São Paulo. Funciona também para RRAS.
 */
export interface RegionCoord { lat: number; lng: number }

const REGIONS: { lat: number; lng: number; kw: string[] }[] = [
  { lat: -23.55,  lng: -46.63, kw: ['grande são paulo','grande sao paulo','capital','drs i ','drs 01','drs 1 ','rras 1 ','rras 01'] },
  { lat: -21.21,  lng: -50.43, kw: ['araçatuba','aracatuba','drs ii','drs 02','drs 2 ','rras 2 ','rras 02'] },
  { lat: -21.78,  lng: -48.18, kw: ['araraquara','drs iii','drs 03','drs 3 ','rras 3 ','rras 03'] },
  { lat: -23.96,  lng: -46.33, kw: ['baixada santista','santos','drs iv','drs 04','drs 4 ','rras 4 ','rras 04'] },
  { lat: -20.55,  lng: -48.57, kw: ['barretos','drs v ','drs 05','drs 5 ','rras 5 ','rras 05'] },
  { lat: -22.32,  lng: -49.07, kw: ['bauru','drs vi','drs 06','drs 6 ','rras 6 ','rras 06'] },
  { lat: -22.91,  lng: -47.06, kw: ['campinas','drs vii','drs 07','drs 7 ','rras 7 ','rras 07'] },
  { lat: -20.54,  lng: -47.40, kw: ['franca','drs viii','drs 08','drs 8 ','rras 8 ','rras 08'] },
  { lat: -22.21,  lng: -49.95, kw: ['marília','marilia','drs ix','drs 09','drs 9 ','rras 9 ','rras 09'] },
  { lat: -22.73,  lng: -47.65, kw: ['piracicaba','drs x ','drs 10','rras 10'] },
  { lat: -22.12,  lng: -51.39, kw: ['presidente prudente','prudente','drs xi','drs 11','rras 11'] },
  { lat: -24.49,  lng: -47.84, kw: ['registro','drs xii','drs 12','rras 12'] },
  { lat: -21.17,  lng: -47.81, kw: ['ribeirão preto','ribeirao preto','drs xiii','drs 13','rras 13'] },
  { lat: -21.97,  lng: -46.80, kw: ['são joão','sao joao','boa vista','drs xiv','drs 14','rras 14'] },
  { lat: -20.82,  lng: -49.38, kw: ['rio preto','são josé','sao jose','drs xv','drs 15','rras 15'] },
  { lat: -23.50,  lng: -47.45, kw: ['sorocaba','drs xvi','drs 16','rras 16'] },
  { lat: -23.02,  lng: -45.56, kw: ['taubaté','taubate','drs xvii','drs 17','rras 17','vale do paraíba','vale do paraiba','são josé dos campos','sao jose dos campos'] },
  { lat: -23.65,  lng: -45.41, kw: ['rras 18','rras18','litoral norte','caraguatatuba','ubatuba'] },
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
