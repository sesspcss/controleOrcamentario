/**
 * LC 131 - Dashboard Power BI Style v3
 * Abas, grupo simplificado (Custeio/Investimento/Pessoal),
 * fonte simplificada (Tesouro/Federal/Demais), filtros cascateados.
 */

import React, { useEffect, useState, useRef, useCallback, memo, useMemo } from 'react';
import { supabase } from './supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts';
import {
  RefreshCw, AlertCircle, DollarSign, TrendingUp, CheckCircle2,
  Download, Filter, X, Upload, FileSpreadsheet,
  ChevronLeft, ChevronRight, ChevronDown, Settings,
  Database, BarChart3, Search, SlidersHorizontal,
  Building2, MapPin, Layers, Users, LayoutDashboard, FileText,
  Table2, Globe, Briefcase, Map as MapIcon, Menu, Lock,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SP_COORDS } from './sp-coords';
import { findRegionCoord } from './drs-coords';

// --- Utility -------------------------------------------------------------------
function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

function fmt(val: number | null | undefined, type: 'currency' | 'number' | 'compact' = 'number'): string {
  if (val === null || val === undefined || isNaN(Number(val))) return ' -';
  const n = Number(val);
  if (type === 'currency') return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  if (type === 'compact') {
    if (n >= 1e9) return 'R$ ' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return 'R$ ' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return 'R$ ' + (n / 1e3).toFixed(0) + 'k';
    return n.toLocaleString('pt-BR');
  }
  return n.toLocaleString('pt-BR');
}
function fmtAxis(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(0) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'k';
  return String(v);
}
function shortLabel(v: string, max = 20): string {
  const s = String(v ?? '');
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}
function stripNumPrefix(s: string): string {
  return String(s ?? '').replace(/^[A-Za-z]{0,2}\d+[\s./]*[-–:]\s*/, '').trim().toUpperCase();
}

// --- Power BI Color Palette ---------------------------------------------------
const CHART_COLORS = [
  '#118DFF','#12239E','#E66C37','#6B007B','#E044A7',
  '#744EC2','#D9B300','#D64550','#197278','#1AAB40',
  '#BE0B31','#4E8542','#C83D95','#016DB2','#F28E2B',
];
const GRUPO_COLORS: Record<string, string> = {
  Custeio: '#118DFF', Investimento: '#E66C37', Pessoal: '#6B007B', Outros: '#A6A6A6',
};
const FONTE_COLORS: Record<string, string> = {
  Tesouro: '#118DFF', Federal: '#12239E', 'Demais Fontes': '#E66C37',
};
// Series padrão para gráficos com 3 grandezas (emp + liq + pago)
const S3 = [
  { key: 'empenhado',  name: 'Empenhado',  color: '#118DFF' },
  { key: 'liquidado',  name: 'Liquidado',  color: '#1AAB40' },
  { key: 'pago_total', name: 'Pago Total', color: '#E66C37' },
];
// Series padrão para gráficos com 2 grandezas (emp + pago)
const S2 = [
  { key: 'empenhado',  name: 'Empenhado',  color: '#118DFF' },
  { key: 'pago_total', name: 'Pago Total', color: '#E66C37' },
];

// --- Types ----------------------------------------------------------------------
type DataRow = Record<string, unknown>;
type Tab = 'resumo' | 'regional' | 'mapa' | 'despesas' | 'fornecedores' | 'dados' | 'pivot';

interface KPIs { empenhado: number; liquidado: number; pago: number; pago_total: number; total: number; municipios: number }
interface AnoRow { ano: number; empenhado: number; liquidado: number; pago_total: number; registros: number }
interface DrsRow { drs: string; empenhado: number; liquidado: number; pago_total: number }
interface GrupoRow { grupo_despesa: string; empenhado: number; liquidado: number; pago_total: number }
interface GrupoSimplRow { grupo_simpl: string; empenhado: number; liquidado: number; pago_total: number }
interface FonteSimplRow { fonte_simpl: string; empenhado: number; liquidado: number; pago_total: number }
interface MunicRow { municipio: string; empenhado: number; pago_total: number }
interface FonteRow { fonte_recurso: string; empenhado: number; pago_total: number }
interface ElementoRow { elemento: string; empenhado: number; pago_total: number }
interface RegiaoAdRow { regiao_ad: string; empenhado: number; pago_total: number }
interface UoRow { uo: string; empenhado: number; liquidado: number; pago_total: number }
interface RrasRow { rras: string; empenhado: number; liquidado: number; pago_total: number }
interface TipoDespesaRow { tipo_despesa: string; empenhado: number; liquidado: number; pago_total: number }
interface RotuloRow { rotulo: string; empenhado: number; pago_total: number }
interface FavorecidoRow { favorecido: string; empenhado: number; pago_total: number; contratos: number }
interface ProjetoRow { projeto: string; empenhado: number; pago_total: number; registros: number }
interface UgRow { ug: string; empenhado: number; pago_total: number }
interface RegiaoSaRow { regiao_sa: string; empenhado: number; pago_total: number }

interface CachedData {
  kpis: KPIs;
  porAno: AnoRow[];
  porDrs: DrsRow[];
  porGrupo: GrupoRow[];
  porGrupoSimpl: GrupoSimplRow[];
  porFonteSimpl: FonteSimplRow[];
  porMunic: MunicRow[];
  porFonte: FonteRow[];
  porElemento: ElementoRow[];
  porRegiaoAd: RegiaoAdRow[];
  porUo: UoRow[];
  porRras: RrasRow[];
  porTipoDespesa: TipoDespesaRow[];
  porRotulo: RotuloRow[];
  porFavorecido: FavorecidoRow[];
  porProjeto: ProjetoRow[];
  porUg: UgRow[];
  porRegiaoSa: RegiaoSaRow[];
}

type DetailFilterKey = 'p_drs'|'p_regiao_ad'|'p_rras'|'p_regiao_sa'|'p_municipio'|'p_grupo_despesa'|'p_tipo_despesa'|'p_rotulo'|'p_fonte_recurso'|'p_codigo_ug'|'p_uo'|'p_elemento'|'p_favorecido';

const FILTER_META: { key: DetailFilterKey; label: string; distinctKey: string }[] = [
  { key: 'p_drs',           label: 'DRS',                distinctKey: 'distinct_drs'        },
  { key: 'p_regiao_ad',     label: 'Região Admin.',       distinctKey: 'distinct_regiao_ad'  },
  { key: 'p_municipio',     label: 'Município',           distinctKey: 'distinct_municipio'  },
  { key: 'p_rras',          label: 'RRAS',               distinctKey: 'distinct_rras'       },
  { key: 'p_regiao_sa',     label: 'Região de Saúde',    distinctKey: 'distinct_regiao_sa'  },
  { key: 'p_grupo_despesa', label: 'Grupo Despesa',      distinctKey: 'distinct_grupo'      },
  { key: 'p_elemento',      label: 'Elemento',           distinctKey: 'distinct_elemento'   },
  { key: 'p_tipo_despesa',  label: 'Tipo Despesa',       distinctKey: 'distinct_tipo'       },
  { key: 'p_rotulo',        label: 'Rótulo',             distinctKey: 'distinct_rotulo'     },
  { key: 'p_fonte_recurso', label: 'Fonte Recurso',      distinctKey: 'distinct_fonte'      },
  { key: 'p_uo',            label: 'Unid. Orçamentária', distinctKey: 'distinct_uo'         },
  { key: 'p_favorecido',    label: 'Favorecido',         distinctKey: 'distinct_favorecido' },
  { key: 'p_codigo_ug',     label: 'Código UG',          distinctKey: 'distinct_codigo_ug'  },
];

interface DetailRow {
  id: number; ano_referencia: number;
  drs: string; regiao_ad: string; rras: string; regiao_sa: string;
  cod_ibge: string; municipio: string;
  codigo_nome_uo: string; codigo_nome_ug: string; codigo_ug: string;
  codigo_nome_projeto_atividade: string; codigo_projeto_atividade: string;
  codigo_nome_fonte_recurso: string; fonte_recurso: string; fonte_simpl: string;
  codigo_nome_grupo: string; grupo_despesa: string; grupo_simpl: string;
  codigo_nome_elemento: string; codigo_elemento: string;
  tipo_despesa: string; rotulo: string;
  unidade: string;
  codigo_nome_favorecido: string; codigo_favorecido: string;
  descricao_processo: string; numero_processo: string;
  empenhado: number; liquidado: number; pago: number;
  pago_anos_anteriores: number; pago_total: number;
}

const TABLE_COLS: { key: keyof DetailRow; label: string; numeric?: boolean; w: string }[] = [
  { key: 'ano_referencia',                label: 'Ano',                    w: '56px'  },
  { key: 'drs',                           label: 'DRS',                    w: '200px' },
  { key: 'regiao_ad',                     label: 'Região Admin.',          w: '160px' },
  { key: 'rras',                          label: 'RRAS',                   w: '100px' },
  { key: 'regiao_sa',                     label: 'Região de Saúde',        w: '160px' },
  { key: 'cod_ibge',                      label: 'Cód. IBGE',              w: '80px'  },
  { key: 'municipio',                     label: 'Município',              w: '150px' },
  { key: 'codigo_nome_uo',                label: 'Cód. Nome UO',           w: '220px' },
  { key: 'codigo_nome_ug',                label: 'Cód. Nome UG',           w: '220px' },
  { key: 'codigo_nome_projeto_atividade', label: 'Cód. Nome Proj. Ativ.',  w: '240px' },
  { key: 'codigo_projeto_atividade',      label: 'Cód. Projeto',           w: '100px' },
  { key: 'codigo_nome_fonte_recurso',     label: 'Cód. Nome Fonte Recurso',w: '220px' },
  { key: 'fonte_simpl',                   label: 'Fonte de Recursos',      w: '140px' },
  { key: 'codigo_nome_grupo',             label: 'Cód. Nome Grupo',        w: '220px' },
  { key: 'grupo_simpl',                   label: 'Grupo de Despesa',       w: '140px' },
  { key: 'codigo_nome_elemento',          label: 'Cód. Nome Elemento',     w: '220px' },
  { key: 'tipo_despesa',                  label: 'Tipo de Despesa',        w: '150px' },
  { key: 'rotulo',                        label: 'Rótulo',                 w: '150px' },
  { key: 'unidade',                       label: 'Unidade',                w: '220px' },
  { key: 'codigo_nome_favorecido',        label: 'Cód. Nome Favorecido',   w: '240px' },
  { key: 'codigo_favorecido',             label: 'CNPJ',                   w: '140px' },
  { key: 'descricao_processo',            label: 'Descrição Processo',     w: '200px' },
  { key: 'numero_processo',               label: 'Número Processo',        w: '160px' },
  { key: 'empenhado',         label: 'Empenhado',         numeric: true, w: '140px' },
  { key: 'liquidado',         label: 'Liquidado',         numeric: true, w: '140px' },
  { key: 'pago',              label: 'Pago Exerc.',       numeric: true, w: '140px' },
  { key: 'pago_anos_anteriores', label: 'Pago Ant.',      numeric: true, w: '140px' },
  { key: 'pago_total',        label: 'Pago Total',        numeric: true, w: '140px' },
];

// -- Direct REST query helpers (bypass slow lc131_detail RPC) --
const FILTER_TO_COL: Record<string, string> = {
  p_drs: 'drs', p_regiao_ad: 'regiao_ad', p_rras: 'rras', p_regiao_sa: 'regiao_sa',
  p_municipio: 'municipio', p_grupo_despesa: 'codigo_nome_grupo', p_tipo_despesa: 'tipo_despesa',
  p_rotulo: 'rotulo', p_uo: 'codigo_nome_uo', p_elemento: 'codigo_nome_elemento',
  p_favorecido: 'codigo_nome_favorecido',
};

const EMPTY_DISTINCTS: Record<string, string[]> = {
  distinct_drs: [],
  distinct_regiao_ad: [],
  distinct_rras: [],
  distinct_regiao_sa: [],
  distinct_municipio: [],
  distinct_grupo: [],
  distinct_tipo: [],
  distinct_rotulo: [],
  distinct_fonte: [],
  distinct_codigo_ug: [],
  distinct_uo: [],
  distinct_elemento: [],
  distinct_favorecido: [],
};

function uniqueSorted(values: Array<unknown>): string[] {
  return Array.from(
    new Set(
      values
        .map(v => String(v ?? '').trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function firstFilled(...values: Array<unknown>): string {
  for (const value of values) {
    const clean = String(value ?? '').trim();
    if (clean) return clean;
  }
  return '';
}

function normalizeTipoText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function classifyTipoDespesaClient(descricao: unknown, tipo: unknown): string {
  const rawTipo = String(tipo ?? '').trim();
  if (rawTipo) return rawTipo;

  const d = normalizeTipoText(descricao);
  if (!d) return 'OUTROS';

  if (d.includes('BATA CINZA')) return 'INTRAORÇAMENTÁRIA - BATA CINZA PPP';
  if (d.includes('TRANSFERENCIA INTRA ORCAMENTARIA') || d.includes('INTRA ORCAMENTARIA')) return 'INTRAORÇAMENTÁRIA';
  if (d.includes('FUNDO A FUNDO PAB')) return 'FUNDO A FUNDO PAB';
  if (d.includes('RESIDENCIA TERAPEUTICA')) return 'RESIDÊNCIA TERAPÊUTICA';
  if (d.includes('FUNDO A FUNDO') && d.includes('DEMANDA')) return 'FUNDO A FUNDO - DEMANDAS PARLAMENTARES';
  if (d.includes('FUNDO A FUNDO') && d.includes('EMENDA')) return 'FUNDO A FUNDO - EMENDA';
  if (d.includes('FUNDO A FUNDO')) return 'FUNDO A FUNDO';
  if (d.includes('RLM FERNANDOPOLIS') || d.includes('FERNANDOPOLIS')) return 'RLM FERNANDÓPOLIS';
  if (d.includes('RLM MOGI MIRIM') || (d.includes('LUCY MONTORO') && d.includes('MOGI MIRIM'))) return 'RLM MOGI MIRIM';
  if (d.includes('RLM SAO JOSE DOS CAMPOS') || (d.includes('RLM') && d.includes('SAO JOSE DOS CAMPOS'))) return 'RLM SÃO JOSÉ DOS CAMPOS';
  if (d.includes('RLM') && d.includes('RIO PRETO')) return 'RLM SAO JOSE DO RIO PRETO';
  if ((d.includes('RLM') || d.includes('LUCY MONTORO')) && d.includes('DIADEMA')) return 'RLM DIADEMA';
  if (d.includes('RLM TAUBATE') || (d.includes('LUCY MONTORO') && d.includes('TAUBATE'))) return 'RLM TAUBATE';
  if (d.includes('RLM BOTUCATU') || (d.includes('LUCY MONTORO') && d.includes('BOTUCATU'))) return 'RLM BOTUCATU';
  if (d.includes('PARIQUERA')) return 'RLM PARIQUERA ACÚ';
  if (d.includes('RLM SOROCABA') || (d.includes('LUCY MONTORO') && d.includes('SOROCABA'))) return 'RLM SOROCABA';
  if (d.includes('RLM') && (d.includes('PRESIDENTE PRUDENTE') || d.includes('PRES. PRUDENTE'))) return 'RLM PRESIDENTE PRUDENTE';
  if (d.includes('RLM SANTOS') || (d.includes('LUCY MONTORO') && d.includes('SANTOS'))) return 'RLM SANTOS';
  if ((d.includes('RLM') || d.includes('LUCY MONTORO')) && d.includes('MARILIA')) return 'RLM MARILIA';
  if ((d.includes('RLM') || d.includes('LUCY MONTORO')) && d.includes('CAMPINAS')) return 'RLM CAMPINAS';
  if (d.includes('LUCY MONTORO') || d.includes('RLM') || d.includes('INST. REAB. LUCY')) return 'REDE LUCY MONTORO';
  if (d.includes('FAMEMA')) return 'HCFAMEMA';
  if (d.includes('NAOR BOTUCATU') || d.includes('HCBOTUCATU')) return 'HCBOTUCATU';
  if (d.includes('HC SAO PAULO') || d.includes('HCSP')) return 'HCSP';
  if (d.includes('RIBEIRAO')) return 'HCRIBEIRÃO';
  if (d.includes('HEMOCENTRO')) return 'AUTARQUIA - HEMOCENTRO';
  if (d.includes('FURP')) return 'AUTARQUIA - FURP';
  if (d.includes('ONCOCENT')) return 'AUTARQUIA - ONCOCENTRO';
  if (d.includes('GESTAO ESTADUAL') || d.includes('GESTAO PLENA')) return 'GESTÃO ESTADUAL';
  if (d.includes('CONVENIO')) return 'CONVÊNIO';
  if (d.includes('EMENDA')) return 'EMENDA';
  if (d.includes('PEROLA BYINGTON') || d.includes('PPP')) return 'PPP';
  if (d.includes('CORUJAO') || d.includes('CIRURGIA ELETIVA') || d.includes('MUTIRAO CIRURGIA')) return 'CIRURGIAS ELETIVAS';
  if (d.includes('PISO') && d.includes('ENFERM')) return 'PISO ENFERMAGEM';
  if (d.includes('CASAS DE APOIO')) return 'CASAS DE APOIO';
  if (d.includes('AEDES AEGYPTI')) return 'AEDES AEGYPTI';
  if (d.includes('SISTEMA PRISIONAL')) return 'SISTEMA PRISIONAL';
  if ((d.includes('ACAO CIVIL') || d.includes('AÇÃO CIVIL')) && d.includes('BAURU')) return 'AÇÃO CIVIL - BAURU';
  if (d.includes('DOSE CERTA')) return 'DOSE CERTA';
  if (d.includes('GLICEMIA')) return 'GLICEMIA';
  if (d.includes('QUALIS MAIS')) return 'QUALIS MAIS';
  if (d.includes('ATENCAO BASICA')) return 'ATENÇÃO BÁSICA';
  if (d.includes('SORRIA SP')) return 'SORRIA SP';
  if (d.includes('IGM SUS PAULISTA')) return 'IGM SUS PAULISTA';
  if (d.includes('TABELA SUS')) return 'TABELA SUS PAULISTA';
  if (d.includes('REPELENTE')) return 'REPELENTE';
  if (d.includes('TEA') || d.includes('AUTISTA')) return 'TEA';

  return 'OUTROS';
}

function buildDistinctState(d?: Record<string, unknown>): Record<string, string[]> {
  return {
    distinct_drs: dedupeAndTrack((d?.distinct_drs as string[] ?? []), normalizeDrs, _drsRawVariants),
    distinct_regiao_ad: uniqueSorted(d?.distinct_regiao_ad as string[] ?? []),
    distinct_rras: dedupeAndTrack((d?.distinct_rras as string[] ?? []), normalizeRras, _rrasRawVariants),
    distinct_regiao_sa: uniqueSorted(d?.distinct_regiao_sa as string[] ?? []),
    distinct_municipio: uniqueSorted(d?.distinct_municipio as string[] ?? []),
    distinct_grupo: uniqueSorted(d?.distinct_grupo as string[] ?? []),
    distinct_tipo: uniqueSorted(d?.distinct_tipo as string[] ?? []),
    distinct_rotulo: uniqueSorted(d?.distinct_rotulo as string[] ?? []),
    distinct_fonte: uniqueSorted(d?.distinct_fonte as string[] ?? []),
    distinct_codigo_ug: uniqueSorted(d?.distinct_codigo_ug as string[] ?? []),
    distinct_uo: uniqueSorted(d?.distinct_uo as string[] ?? []),
    distinct_elemento: uniqueSorted(d?.distinct_elemento as string[] ?? []),
    distinct_favorecido: uniqueSorted(d?.distinct_favorecido as string[] ?? []),
  };
}

function buildDistinctStateFromRows(rows: Record<string, unknown>[]): Record<string, string[]> {
  return {
    distinct_drs: dedupeAndTrack(rows.map(r => String(r.drs ?? '')).filter(Boolean), normalizeDrs, _drsRawVariants),
    distinct_regiao_ad: uniqueSorted(rows.map(r => r.regiao_ad)),
    distinct_rras: dedupeAndTrack(rows.map(r => String(r.rras ?? '')).filter(Boolean), normalizeRras, _rrasRawVariants),
    distinct_regiao_sa: uniqueSorted(rows.map(r => r.regiao_sa)),
    distinct_municipio: uniqueSorted(rows.map(r => r.municipio)),
    distinct_grupo: uniqueSorted(rows.map(r => r.codigo_nome_grupo ?? r.grupo_despesa)),
    distinct_tipo: uniqueSorted(rows.map(r => r.tipo_despesa)),
    distinct_rotulo: uniqueSorted(rows.map(r => r.rotulo)),
    distinct_fonte: uniqueSorted(rows.map(r => r.codigo_nome_fonte_recurso ?? r.fonte_recurso)),
    distinct_codigo_ug: uniqueSorted(rows.map(r => r.codigo_ug)),
    distinct_uo: uniqueSorted(rows.map(r => r.codigo_nome_uo ?? r.uo)),
    distinct_elemento: uniqueSorted(rows.map(r => r.codigo_nome_elemento ?? r.elemento)),
    distinct_favorecido: uniqueSorted(rows.map(r => r.codigo_nome_favorecido ?? r.favorecido)),
  };
}

function hasAnyDistinctOptions(nextDistincts: Record<string, string[]>): boolean {
  return Object.values(nextDistincts).some(list => Array.isArray(list) && list.length > 0);
}

function pruneFiltersByDistincts(
  currentFilters: Partial<Record<DetailFilterKey, string[]>>,
  nextDistincts: Record<string, string[]>,
): Partial<Record<DetailFilterKey, string[]>> {
  const pruned: Partial<Record<DetailFilterKey, string[]>> = {};
  for (const meta of FILTER_META) {
    const selected = currentFilters[meta.key] ?? [];
    if (!selected.length) continue;
    const allowed = new Set(nextDistincts[meta.distinctKey] ?? []);
    const kept = allowed.size ? selected.filter(v => allowed.has(v)) : selected;
    if (kept.length) pruned[meta.key] = kept;
  }
  return pruned;
}

function applyFiltersToQuery(
  query: any,
  activeFilters: Partial<Record<DetailFilterKey, string[]>>,
  search = '',
) {
  for (const f of FILTER_META) {
    if (f.key === 'p_codigo_ug' && search.trim()) continue;
    const v = activeFilters[f.key];
    if (!Array.isArray(v) || v.length === 0) continue;
    const expanded = expandFilterValues(f.key, v);
    if (f.key === 'p_fonte_recurso') query = query.or(buildFonteOrFilter(expanded));
    else if (f.key === 'p_codigo_ug') query = query.in('codigo_ug', expanded);
    else {
      const col = FILTER_TO_COL[f.key];
      if (col) query = query.in(col, expanded);
    }
  }
  if (search.trim()) query = query.in('codigo_ug', [search.trim()]);
  return query;
}

function buildFonteOrFilter(values: string[]): string {
  const parts: string[] = [];
  for (const v of values) {
    if (v === 'Tesouro') parts.push('codigo_nome_fonte_recurso.ilike.%tesouro%');
    if (v === 'Federal') parts.push(
      'codigo_nome_fonte_recurso.ilike.%fed%',
      'codigo_nome_fonte_recurso.ilike.%união%',
      'codigo_nome_fonte_recurso.ilike.%uniao%',
      'codigo_nome_fonte_recurso.ilike.%fundo nacional%',
      'codigo_nome_fonte_recurso.ilike.%transferência%',
      'codigo_nome_fonte_recurso.ilike.%transferencia%',
      'codigo_nome_fonte_recurso.ilike.%SUS%',
    );
    if (v === 'Demais Fontes') parts.push(
      'and(codigo_nome_fonte_recurso.not.ilike.%tesouro%,codigo_nome_fonte_recurso.not.ilike.%fed%,codigo_nome_fonte_recurso.not.ilike.%união%,codigo_nome_fonte_recurso.not.ilike.%uniao%,codigo_nome_fonte_recurso.not.ilike.%fundo nacional%,codigo_nome_fonte_recurso.not.ilike.%transferência%,codigo_nome_fonte_recurso.not.ilike.%transferencia%,codigo_nome_fonte_recurso.not.ilike.%SUS%)',
    );
  }
  return parts.join(',');
}

function enrichDetailRow(r: Record<string, unknown>): DetailRow {
  const row = r as unknown as DetailRow;
  const src = String(row.codigo_nome_fonte_recurso ?? '').toLowerCase();
  row.fonte_simpl = src.includes('tesouro') ? 'Tesouro'
    : (src.includes('fed') || src.includes('união') || src.includes('uniao') || src.includes('fundo nacional')
       || src.includes('transferência') || src.includes('transferencia') || src.includes('sus')) ? 'Federal'
    : 'Demais Fontes';
  const g = String(row.codigo_nome_grupo ?? '');
  row.grupo_simpl = g.startsWith('1') ? 'Pessoal' : g.startsWith('2') ? 'Dívida' : g.startsWith('3') ? 'Custeio' : g.startsWith('4') ? 'Investimento' : 'Outros';
  // tipo_despesa is already enriched from TIPO_DESPESA.xlsx via tipo_despesa_ref
  row.pago_total = (Number(row.pago) || 0) + (Number(row.pago_anos_anteriores) || 0);
  return row;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'mapa',          label: 'Mapa',          icon: <MapIcon className="w-3.5 h-3.5" /> },
  { id: 'resumo',        label: 'Resumo',        icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: 'regional',      label: 'Regional',      icon: <Globe className="w-3.5 h-3.5" /> },
  { id: 'despesas',      label: 'Despesas',       icon: <Briefcase className="w-3.5 h-3.5" /> },
  { id: 'fornecedores',  label: 'Fornecedores',  icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'dados',         label: 'Dados',          icon: <Table2 className="w-3.5 h-3.5" /> },
  { id: 'pivot',         label: 'Pagamentos',     icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
];

type UploadStep = 'idle'|'parsing'|'preview'|'uploading'|'done'|'error';

function parseCSV(text: string): DataRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.replace(/"/g,'').trim().toLowerCase().replace(/\s+/g,'_'));
  return lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.replace(/"/g,'').trim());
    const row: DataRow = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
}

// --- Reusable Components ---
function Spinner({ size = 4 }: { size?: number }) {
  return <RefreshCw className={`w-${size} h-${size} animate-spin text-[#118DFF]`} />;
}

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#E5E5E5] shadow-lg rounded-lg px-3 py-2 text-xs min-w-[150px] max-w-xs">
      {label && <p className="font-semibold text-[#333] mb-1 text-[11px] border-b border-[#F0F0F0] pb-1 truncate">{stripNumPrefix(String(label))}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3 mt-0.5">
          <span className="flex items-center gap-1.5 text-[#666]">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />
            <span className="truncate max-w-[100px]">{p.name}</span>
          </span>
          <span className="font-bold text-[#333] shrink-0">{typeof p.value === 'number' ? fmt(p.value, 'currency') : p.value}</span>
        </div>
      ))}
    </div>
  );
};

interface KpiCardProps { label: string; value: string; sub?: string; icon: React.ReactNode; color: string }
const KpiCard = memo(({ label, value, sub, icon, color }: KpiCardProps) => (
  <div className="bg-white rounded-lg border border-[#E5E5E5] p-4 hover:shadow-md transition-shadow">
    <div className="flex items-center gap-2 mb-2">
      <span style={{ color }} className="opacity-70">{icon}</span>
      <span className="text-[10px] font-semibold text-[#666] uppercase tracking-wide">{label}</span>
    </div>
    <p className="text-xl font-bold text-[#333] leading-none">{value}</p>
    {sub && <p className="text-[10px] text-[#999] mt-1">{sub}</p>}
  </div>
));

function Card({ title, children, badge, noPad, icon }: {
  title: string; children: React.ReactNode; badge?: React.ReactNode; noPad?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#F0F0F0] flex items-center gap-2">
        {icon && <span className="text-[#999]">{icon}</span>}
        <p className="font-semibold text-[#333] text-[13px] flex-1">{title}</p>
        {badge}
      </div>
      {noPad ? children : <div className="p-4">{children}</div>}
    </div>
  );
}

interface SegFaixa { label: string; min: number; max?: number; color: string; count: number; total: number }
interface FavRow { favorecido: string; empenhado: number; pago_total: number; contratos: number }
function SegmentacaoFornecedores({ segData, sorted, totalFav }: { segData: SegFaixa[]; sorted: FavRow[]; totalFav: number }) {
  const [expanded, setExpanded] = React.useState<number | null>(null);
  return (
    <div className="flex flex-col gap-2 mt-1">
      {segData.map((f, i) => {
        const share = totalFav > 0 ? f.total / totalFav * 100 : 0;
        const isOpen = expanded === i;
        const members = sorted.filter(r => r.empenhado >= f.min && (f.max === undefined || r.empenhado < f.max));
        return (
          <div key={i}>
            <div
              className={cn('flex items-center gap-3 cursor-pointer rounded', isOpen && 'bg-[#F7F9FF]')}
              onClick={() => setExpanded(isOpen ? null : i)}
            >
              <div className="w-24 shrink-0 py-1 pl-1">
                <p className="text-[11px] font-semibold text-[#333]">{f.label}</p>
                <p className="text-[10px] text-[#999]">{f.count} forn.</p>
              </div>
              <div className="flex-1 relative h-6 bg-[#F0F0F0] rounded overflow-hidden">
                {share > 0 && <div className="absolute top-0 left-0 h-full rounded" style={{ width: share + '%', background: f.color, opacity: 0.75 }} />}
                <span className="absolute inset-0 flex items-center pl-2 text-[10px] font-bold text-white drop-shadow">
                  {f.total > 0 ? `${fmt(f.total, 'compact')} · ${share.toFixed(1)}%` : <span className="text-[#AAA] font-normal">0 - 0.0%</span>}
                </span>
              </div>
              {members.length > 0 && (
                <ChevronDown className={cn('w-3.5 h-3.5 text-[#999] shrink-0 transition-transform', isOpen && 'rotate-180')} />
              )}
            </div>
            {isOpen && members.length > 0 && (
              <div className="mt-1 ml-1 border-l-2 pl-3 flex flex-col gap-1" style={{ borderColor: f.color }}>
                {members.map((r, j) => {
                  const execPct = r.empenhado > 0 ? r.pago_total / r.empenhado * 100 : 0;
                  const ec = execPct >= 80 ? '#1AAB40' : execPct >= 50 ? '#D9B300' : '#D64550';
                  return (
                    <div key={j} className="flex items-center gap-2 py-0.5">
                      <span className="text-[10px] text-[#999] font-mono w-4 text-right shrink-0">{j+1}</span>
                      <span className="flex-1 text-[11px] text-[#333] truncate" title={stripNumPrefix(r.favorecido)}>{stripNumPrefix(r.favorecido)}</span>
                      <span className="text-[10px] font-bold text-[#118DFF] shrink-0 w-16 text-right">{fmt(r.empenhado, 'compact')}</span>
                      <span className="text-[10px] font-bold shrink-0 w-10 text-right" style={{ color: ec }}>{execPct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <div className="mt-1 pt-2 border-t border-[#F0F0F0] flex items-center justify-between text-[10px] text-[#999]">
        <span>{sorted.length} favorecidos no total</span>
        <span className="font-bold text-[#333]">Total: {fmt(totalFav, 'compact')}</span>
      </div>
    </div>
  );
}

function MultiSelect({ label, options, value, onChange, loading }: {
  label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; loading?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = options.filter(Boolean).filter(o => !search || stripNumPrefix(o).toLowerCase().includes(search.toLowerCase()) || o.toLowerCase().includes(search.toLowerCase()));
  const hasValue = value.length > 0;
  const toggle = (opt: string) => value.includes(opt) ? onChange(value.filter(v => v !== opt)) : onChange([...value, opt]);
  const _s0 = hasValue && value.length === 1 ? stripNumPrefix(value[0]) : '';
  const displayLabel = hasValue
    ? value.length === 1 ? (_s0.length > 14 ? _s0.slice(0, 13) + '\u2026' : _s0) : value.length + ' sel.'
    : 'Todos';

  return (
    <div className="flex flex-col gap-0.5 min-w-0 relative" ref={ref}>
      <label className="text-[9px] font-bold text-[#999] uppercase tracking-wider truncate">{label}</label>
      <button type="button" onClick={() => setOpen(v => !v)}
        className={cn('w-full text-left text-[11px] border rounded-md px-2 py-1.5 pr-6 focus:outline-none focus:ring-1 focus:ring-[#118DFF] transition bg-white relative',
          hasValue ? 'border-[#118DFF] bg-blue-50 text-[#118DFF] font-semibold' : 'border-[#D0D0D0] text-[#666] hover:border-[#118DFF]',
          loading && options.length === 0 && 'border-[#118DFF]')}>
        <span className="truncate block">{displayLabel}</span>
        <ChevronDown className={cn('absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#999] transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-0.5 w-80 bg-white border border-[#E5E5E5] rounded-lg shadow-xl overflow-hidden">
          <div className="p-1.5 border-b border-[#F0F0F0]">
            <input autoFocus type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
              className="w-full text-[11px] border border-[#E5E5E5] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#118DFF]" />
          </div>
          {hasValue && (
            <button type="button" onClick={() => { onChange([]); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 text-[11px] text-red-500 font-semibold hover:bg-red-50 border-b border-[#F0F0F0] flex items-center gap-1">
              <X className="w-2.5 h-2.5" /> Limpar
            </button>
          )}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-[11px] text-[#999] text-center">
                {loading ? 'Carregando opções...' : options.length === 0 ? 'Sem opções para os filtros atuais' : 'Nenhum resultado'}
              </p>
            ) : filtered.map(o => (
              <label key={o} className="flex items-center gap-2 px-2 py-1.5 hover:bg-blue-50 cursor-pointer">
                <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} className="w-3 h-3 rounded accent-[#118DFF] shrink-0" />
                <span className="text-[11px] text-[#333] whitespace-normal break-words leading-tight" title={stripNumPrefix(o)}>{stripNumPrefix(o)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HBarChart({ data, xKey, labelKey, height = 300, colorOffset = 0 }: {
  data: Record<string, unknown>[]; xKey: string; labelKey: string; height?: number; colorOffset?: number;
}) {
  if (!data?.length) return <div className="flex items-center justify-center h-24 text-[#CCC]"><Database className="w-6 h-6" /></div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 2, bottom: 2 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F0F0F0" />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#999' }} tickFormatter={fmtAxis} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={labelKey} width={140} axisLine={false} tickLine={false}
            tick={{ fontSize: 10, fill: '#555' }} tickFormatter={v => shortLabel(stripNumPrefix(String(v)), 22)} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey={xKey} name="Empenhado" radius={[0, 4, 4, 0]} maxBarSize={14}>
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + colorOffset) % CHART_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function GroupedBarChart({ data, categoryKey, series, height = 320, angleLabels = false }: {
  data: Record<string, unknown>[];
  categoryKey: string;
  series: { key: string; name: string; color: string }[];
  height?: number;
  angleLabels?: boolean;
}) {
  if (!data?.length) return <div className="flex items-center justify-center h-24 text-[#CCC]"><Database className="w-6 h-6" /></div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: angleLabels ? 72 : 28 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
          <XAxis
            dataKey={categoryKey}
            tick={{ fontSize: 10, fill: '#555' }}
            tickFormatter={v => shortLabel(stripNumPrefix(String(v)), angleLabels ? 16 : 24)}
            angle={angleLabels ? -35 : 0}
            textAnchor={angleLabels ? 'end' : 'middle'}
            interval={0}
            axisLine={false}
            tickLine={false}
            height={angleLabels ? 70 : 30}
          />
          <YAxis tick={{ fontSize: 10, fill: '#999' }} tickFormatter={fmtAxis} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11, paddingLeft: 12 }} />
          {series.map(s => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HGroupedBarChart({ data, yKey, series, height = 300 }: {
  data: Record<string, unknown>[];
  yKey: string;
  series: { key: string; name: string; color: string }[];
  height?: number;
}) {
  if (!data?.length) return <div className="flex items-center justify-center h-24 text-[#CCC]"><Database className="w-6 h-6" /></div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 10, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F0F0F0" />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#999' }} tickFormatter={fmtAxis} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={yKey} width={135} axisLine={false} tickLine={false}
            tick={{ fontSize: 10, fill: '#555' }} tickFormatter={v => shortLabel(stripNumPrefix(String(v)), 20)} />
          <Tooltip content={<ChartTooltip />} />
          <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11, paddingLeft: 8 }} />
          {series.map(s => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[0, 3, 3, 0]} maxBarSize={16} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutLegend({ data, nameKey, colors }: { data: Record<string, unknown>[]; nameKey: string; colors: Record<string, string> }) {
  const total = data.reduce((s, r) => s + Number(r.empenhado ?? 0), 0);
  return (
    <div className="flex flex-col gap-2 mt-2">
      {data.map((d, i) => {
        const name = String(d[nameKey]);
        const val = Number(d.empenhado ?? 0);
        const pct = total > 0 ? (val / total) * 100 : 0;
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colors[name] || CHART_COLORS[i] }} />
            <span className="text-[12px] text-[#333] font-medium flex-1">{name}</span>
            <span className="text-[12px] font-bold text-[#333] shrink-0">{fmt(val, 'currency')}</span>
            <span className="text-[10px] text-[#999] w-10 text-right shrink-0">{pct.toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}

// --- Interactive Map ---
interface MapMunic { municipio: string; drs: string; empenhado: number; liquidado: number; pago_total: number; registros: number }
interface MapRegion { name: string; empenhado: number; liquidado: number; pago_total: number; municipios: number; registros: number }
interface MapKpis { empenhado: number; liquidado: number; pago_total: number; registros: number; municipios: number; drs_count: number }

// Canonical DRS names (17 regions) — normalizes all variants
const DRS_CANONICAL: Record<number, string> = {
  1: 'DRS 01 - Grande São Paulo', 2: 'DRS 02 - Araçatuba', 3: 'DRS 03 - Araraquara',
  4: 'DRS 04 - Baixada Santista', 5: 'DRS 05 - Barretos', 6: 'DRS 06 - Bauru',
  7: 'DRS 07 - Campinas', 8: 'DRS 08 - Franca', 9: 'DRS 09 - Marília',
  10: 'DRS 10 - Piracicaba', 11: 'DRS 11 - Presidente Prudente', 12: 'DRS 12 - Registro',
  13: 'DRS 13 - Ribeirão Preto', 14: 'DRS 14 - São João da Boa Vista',
  15: 'DRS 15 - São José do Rio Preto', 16: 'DRS 16 - Sorocaba', 17: 'DRS 17 - Taubaté',
};
const _romanMap: Record<string, number> = { i:1,ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8,ix:9,x:10,xi:11,xii:12,xiii:13,xiv:14,xv:15,xvi:16,xvii:17 };
function normalizeDrs(raw: string): string {
  if (!raw) return raw;
  const numMatch = raw.match(/\b0?(\d{1,2})\b/);
  if (numMatch) { const n = parseInt(numMatch[1]); if (DRS_CANONICAL[n]) return DRS_CANONICAL[n]; }
  const romanMatch = raw.match(/DRS\s+([IVXL]+)/i);
  if (romanMatch) { const n = _romanMap[romanMatch[1].toLowerCase()]; if (n && DRS_CANONICAL[n]) return DRS_CANONICAL[n]; }
  return raw;
}
function normalizeRras(raw: string): string {
  if (!raw) return raw;
  const m = raw.match(/\b0?(\d{1,2})\b/);
  if (m) { const n = parseInt(m[1]); if (n >= 1 && n <= 17) return `RRAS ${String(n).padStart(2, '0')}`; }
  return raw;
}

// Reverse mapping: normalized name -> set of raw DB names (for filter expansion)
const _drsRawVariants: Record<string, Set<string>> = {};
const _rrasRawVariants: Record<string, Set<string>> = {};

function dedupeAndTrack(
  rawList: string[],
  normFn: (s: string) => string,
  variantMap: Record<string, Set<string>>,
): string[] {
  const seen = new Map<string, string>();
  for (const raw of rawList) {
    const norm = normFn(raw);
    if (!variantMap[norm]) variantMap[norm] = new Set();
    variantMap[norm].add(raw);
    if (!seen.has(norm)) seen.set(norm, norm);
  }
  return Array.from(seen.values()).sort();
}

function expandFilterValues(
  key: string,
  values: string[],
): string[] {
  if (key === 'p_drs') {
    const expanded: string[] = [];
    for (const v of values) { const s = _drsRawVariants[v]; if (s) s.forEach(r => expanded.push(r)); else expanded.push(v); }
    return expanded;
  }
  if (key === 'p_rras') {
    const expanded: string[] = [];
    for (const v of values) { const s = _rrasRawVariants[v]; if (s) s.forEach(r => expanded.push(r)); else expanded.push(v); }
    return expanded;
  }
  return values;
}

function mergeDrsRegions(regions: MapRegion[]): MapRegion[] {
  const map = new Map<string, MapRegion>();
  for (const r of regions) {
    const key = normalizeDrs(r.name);
    const existing = map.get(key);
    if (existing) {
      existing.empenhado += r.empenhado;
      existing.liquidado += r.liquidado;
      existing.pago_total += r.pago_total;
      existing.municipios += r.municipios;
      existing.registros += r.registros;
    } else {
      map.set(key, { ...r, name: key });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.empenhado - a.empenhado);
}

// Module-level caches (persist across tab switches)
const _mapDataCache: Record<string, { kpis: MapKpis; drsList: MapRegion[]; allMunics: MapMunic[] }> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _ibgeGeoJson: any = null;

// Reverse lookup: IBGE code - municipality name
const _codeToName: Record<string, string> = {};
Object.entries(SP_COORDS).forEach(([name, d]) => { _codeToName[d.cod] = name; });

// 17 DRS palette  - vivid and distinct
const DRS_PALETTE = [
  '#4ECDC4','#FF6B6B','#45B7D1','#FFA07A','#98D8C8',
  '#F7DC6F','#BB8FCE','#85C1E9','#F0B27A','#82E0AA',
  '#F1948A','#AED6F1','#A9DFBF','#FAD7A0','#D2B4DE',
  '#A3E4D7','#EDBB99',
];

function getDrsColor(name: string, idx: number): string {
  const m = name.match(/(\d+)/);
  if (m) { const n = parseInt(m[1]); if (n >= 1 && n <= 17) return DRS_PALETTE[n - 1]; }
  return DRS_PALETTE[idx % DRS_PALETTE.length];
}

async function fetchIBGE(): Promise<unknown> {
  if (_ibgeGeoJson) return _ibgeGeoJson;
  const r = await fetch('https://servicodados.ibge.gov.br/api/v3/malhas/estados/35?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio');
  if (!r.ok) return null;
  _ibgeGeoJson = await r.json();
  return _ibgeGeoJson;
}

function MiniKpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[#222] rounded-lg px-4 py-3">
      <p className="text-[10px] uppercase font-bold text-[#888]">{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color }}>{value}</p>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-[#333]/50">
      <span className="text-xs text-[#AAA] truncate flex-1" title={label}>{shortLabel(label, 40)}</span>
      <span className="text-xs font-bold text-[#89CFF0] shrink-0">{value}</span>
    </div>
  );
}

// --- Progress Modal ---
function ProgressModal({ message }: { message: string }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    let frame: number; let start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(92, (elapsed / 4000) * 100 + Math.sin(elapsed / 300) * 3);
      setPct(p);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1B1B1B] rounded-2xl p-8 shadow-2xl border border-[#333] w-[360px] flex flex-col items-center gap-4">
        <div className="relative w-16 h-16">
          <svg viewBox="0 0 44 44" className="w-full h-full animate-spin" style={{ animationDuration: '1.4s' }}>
            <circle cx="22" cy="22" r="18" fill="none" stroke="#333" strokeWidth="4" />
            <circle cx="22" cy="22" r="18" fill="none" stroke="#118DFF" strokeWidth="4"
              strokeDasharray={`${pct * 1.13} 200`} strokeLinecap="round" transform="rotate(-90 22 22)" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-[#118DFF]">{Math.round(pct)}%</span>
        </div>
        <div className="text-center">
          <p className="text-white text-sm font-semibold">{message}</p>
          <p className="text-[#888] text-xs mt-1">Processando dados do orçamento...</p>
        </div>
        <div className="w-full h-1.5 bg-[#333] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#118DFF] to-[#45B7D1] rounded-full transition-all duration-200"
            style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function InteractiveMap({ anoSel, onNavigate }: {
  anoSel: number | 'todos';
  onNavigate: (filters: Partial<Record<DetailFilterKey, string[]>>, tab: Tab) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<L.Map | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geoLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hlLayerRef = useRef<any>(null);
  const labelsRef = useRef<L.LayerGroup | null>(null);

  const [kpis, setKpis] = useState<MapKpis | null>(null);
  const [drsList, setDrsList] = useState<MapRegion[]>([]);
  const [allMunics, setAllMunics] = useState<MapMunic[]>([]);
  const [geoLoaded, setGeoLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<'estado' | 'regiao'>('estado');
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [activeMunic, setActiveMunic] = useState<MapMunic | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [municDetail, setMunicDetail] = useState<{ projetos: { projeto: string; empenhado: number }[]; favorecidos: { favorecido: string; empenhado: number }[]; fontes: { fonte: string; empenhado: number }[]; elementos: { elemento: string; empenhado: number }[]; grupos: { grupo: string; empenhado: number }[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // -- Lookups (memoized) --
  const municToDrs = useMemo(() => { const m: Record<string, string> = {}; allMunics.forEach(mu => { if (mu.drs) m[mu.municipio] = mu.drs; }); return m; }, [allMunics]);
  const municByName = useMemo(() => { const m: Record<string, MapMunic> = {}; allMunics.forEach(mu => { m[mu.municipio] = mu; }); return m; }, [allMunics]);
  const drsColorMap = useMemo(() => { const m: Record<string, string> = {}; drsList.forEach((d, i) => { m[d.name] = getDrsColor(d.name, i); }); return m; }, [drsList]);

  function execPct(emp: number, pago: number): string {
    if (emp <= 0) return '#555';
    const p = (pago / emp) * 100;
    return p >= 80 ? '#1AAB40' : p >= 50 ? '#D9B300' : '#D64550';
  }

  // -- Init Leaflet --
  useEffect(() => {
    if (!containerRef.current || mapInst.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false, scrollWheelZoom: true, attributionControl: false,
      zoomSnap: 0.5, zoomDelta: 0.5,
    }).setView([-22.3, -48.8], 7);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.attribution({ position: 'bottomleft' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OSM &copy; CARTO', maxZoom: 18,
    }).addTo(map);
    labelsRef.current = L.layerGroup().addTo(map);
    mapInst.current = map;
    setTimeout(() => map.invalidateSize(), 250);
    return () => { map.remove(); mapInst.current = null; };
  }, []);

  // -- Load IBGE GeoJSON + Supabase data --
  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const key = String(anoSel);
        // Fetch both in parallel
        const [geo, cached] = await Promise.all([
          fetchIBGE(),
          _mapDataCache[key] ? Promise.resolve(_mapDataCache[key]) : (async () => {
            const params: Record<string, unknown> = {};
            if (anoSel !== 'todos') params.p_ano = Number(anoSel);
            let d: Record<string, unknown>;
            const { data: mapRpc, error: mapErr } = await supabase.rpc('lc131_map_data', params);
            if (mapErr) {
              const { data: dashRpc, error: dashErr } = await supabase.rpc('lc131_dashboard', params);
              if (dashErr) throw new Error(dashErr.message);
              d = dashRpc as Record<string, unknown>;
              const dk = d.kpis as Record<string, number> ?? {};
              d = {
                kpis: { empenhado: dk.empenhado, liquidado: dk.liquidado, pago_total: dk.pago_total, registros: dk.total, municipios: dk.municipios, drs_count: ((d.por_drs as unknown[]) ?? []).length },
                por_drs: d.por_drs,
                municipios: ((d.por_municipio as Record<string, unknown>[] ?? [])).map(r => ({ ...r, drs: '', liquidado: 0, registros: 0 })),
              };
            } else { d = mapRpc as Record<string, unknown>; }
            const k = d.kpis as Record<string, number>;
            const mergedDrs = mergeDrsRegions((d.por_drs as Record<string, unknown>[] ?? []).map(r => ({ name: String(r.drs ?? ''), empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago_total: Number(r.pago_total ?? 0), municipios: Number(r.municipios ?? 0), registros: Number(r.registros ?? 0) })));
            const result = {
              kpis: { empenhado: Number(k?.empenhado ?? 0), liquidado: Number(k?.liquidado ?? 0), pago_total: Number(k?.pago_total ?? 0), registros: Number(k?.registros ?? 0), municipios: Number(k?.municipios ?? 0), drs_count: mergedDrs.length } as MapKpis,
              drsList: mergedDrs,
              allMunics: ((d.municipios as Record<string, unknown>[]) ?? []).map(r => ({
                municipio: String(r.municipio ?? ''), drs: normalizeDrs(String(r.drs ?? '')),
                empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago_total: Number(r.pago_total ?? 0), registros: Number(r.registros ?? 0),
              })) as MapMunic[],
            };
            _mapDataCache[key] = result;
            return result;
          })(),
        ]);
        if (geo) setGeoLoaded(true);
        setKpis(cached.kpis); setDrsList(cached.drsList); setAllMunics(cached.allMunics);
      } catch (e: unknown) { setError((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, [anoSel]);

  // -- Render map layers --
  const regionMap = municToDrs;
  const regionList = drsList;

  useEffect(() => {
    const map = mapInst.current;
    if (!map || !drsList.length) return;
    // Clear old layers
    if (geoLayerRef.current) { map.removeLayer(geoLayerRef.current); geoLayerRef.current = null; }
    if (hlLayerRef.current) { map.removeLayer(hlLayerRef.current); hlLayerRef.current = null; }
    labelsRef.current?.clearLayers();

    if (geoLoaded && _ibgeGeoJson) {
      if (level === 'estado') renderEstado(map);
      else if (level === 'regiao' && activeRegion) renderRegiao(map);
    } else {
      renderCircleFallback(map);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drsList, allMunics, geoLoaded, level, activeRegion]);

  function renderEstado(map: L.Map) {
    geoLayerRef.current = L.geoJSON(_ibgeGeoJson, {
      style: (feature) => {
        const code = String(feature?.properties?.codarea ?? '');
        const mName = _codeToName[code] || '';
        const rName = regionMap[mName] || '';
        const color = drsColorMap[rName] || '#e0e0e0';
        return { fillColor: color, fillOpacity: rName ? 0.6 : 0.15, color: '#888', weight: 0.6, opacity: 0.6 };
      },
      onEachFeature: (feature, layer) => {
        const code = String(feature?.properties?.codarea ?? '');
        const mName = _codeToName[code] || '';
        const rName = regionMap[mName] || '';
        if (!rName) return;
        const mu = municByName[mName];
        layer.bindTooltip(
          `<div style="min-width:160px"><strong>${mName}</strong><div style="color:#2563eb;font-size:10px">${rName}</div>${mu ? `<div style="margin-top:3px;font-size:11px">Emp: <strong>${fmt(mu.empenhado, 'compact')}</strong></div>` : ''}</div>`,
          { className: 'map-tooltip-dark', direction: 'top' }
        );
        layer.on({
          mouseover: (e: L.LeafletMouseEvent) => {
            const t = e.target as L.Path;
            t.setStyle({ fillOpacity: 0.85, weight: 2.5, color: '#333' }); t.bringToFront();
          },
          mouseout: (e: L.LeafletMouseEvent) => geoLayerRef.current?.resetStyle(e.target),
          click: () => drillIntoRegion(rName),
        });
      },
    }).addTo(map);
    // DRS labels
    regionList.forEach(reg => {
      const c = findRegionCoord(reg.name);
      if (!c) return;
      const icon = L.divIcon({
        className: 'drs-label',
        html: `<div class="drs-label-inner drs-label-clickable"><strong>${reg.name.replace(/^DRS\s*/i, '').replace(/^\d+\s*-\s*/, '').trim() || reg.name}</strong><span>${fmt(reg.empenhado, 'compact')}</span></div>`,
        iconSize: [150, 48], iconAnchor: [75, 24],
      });
      const marker = L.marker([c.lat, c.lng], { icon, interactive: true }).addTo(labelsRef.current!);
      marker.on('click', () => drillIntoRegion(reg.name));
    });
  }

  function renderRegiao(map: L.Map) {
    if (!_ibgeGeoJson || !activeRegion) return;
    const filteredFeatures = _ibgeGeoJson.features.filter((f: { properties?: { codarea?: string } }) => {
      const code = String(f.properties?.codarea ?? '');
      const mName = _codeToName[code] || '';
      return regionMap[mName] === activeRegion;
    });
    // Background: all SP dim
    geoLayerRef.current = L.geoJSON(_ibgeGeoJson, {
      style: () => ({ fillColor: '#d0d0d0', fillOpacity: 0.3, color: '#aaa', weight: 0.3 }),
    }).addTo(map);
    // Foreground: highlighted region
    const rc = drsColorMap[activeRegion] || '#118DFF';
    hlLayerRef.current = L.geoJSON({ type: 'FeatureCollection', features: filteredFeatures }, {
      style: (feature) => {
        const code = String(feature?.properties?.codarea ?? '');
        const mName = _codeToName[code] || '';
        const mu = municByName[mName];
        const color = mu ? execPct(mu.empenhado, mu.pago_total) : rc;
        return { fillColor: color, fillOpacity: 0.7, color: '#fff', weight: 1.5, opacity: 1 };
      },
      onEachFeature: (feature, layer) => {
        const code = String(feature?.properties?.codarea ?? '');
        const mName = _codeToName[code] || '';
        const mu = municByName[mName];
        const pct = mu && mu.empenhado > 0 ? ((mu.pago_total / mu.empenhado) * 100).toFixed(1) : '0';
        layer.bindTooltip(
          `<div style="min-width:200px"><strong style="font-size:13px">${mName}</strong><br/><div style="margin-top:4px;display:grid;grid-template-columns:1fr auto;gap:3px 12px">
            <span style="color:#2563eb">Empenhado:</span><strong>${mu ? fmt(mu.empenhado, 'compact') : ' -'}</strong>
            <span style="color:#16a34a">Liquidado:</span><strong>${mu ? fmt(mu.liquidado, 'compact') : ' -'}</strong>
            <span style="color:#ea580c">Pago Total:</span><strong>${mu ? fmt(mu.pago_total, 'compact') : ' -'}</strong>
            <span style="color:#555">Execução:</span><strong>${pct}%</strong></div></div>`,
          { className: 'map-tooltip-dark', direction: 'top' }
        );
        layer.on({
          mouseover: (e: L.LeafletMouseEvent) => { const t = e.target as L.Path; t.setStyle({ fillOpacity: 0.9, weight: 2.5 }); t.bringToFront(); },
          mouseout: (e: L.LeafletMouseEvent) => hlLayerRef.current?.resetStyle(e.target),
          click: () => { if (mu) selectMunicipality(mu); },
        });
      },
    }).addTo(map);
    // Zoom to region
    const b = hlLayerRef.current.getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [50, 50], maxZoom: 10, animate: true, duration: 1 });
    // Municipality labels
    const munics = allMunics.filter(m => regionMap[m.municipio] === activeRegion).sort((a, b) => b.empenhado - a.empenhado);
    munics.slice(0, 30).forEach(m => {
      const c = SP_COORDS[m.municipio];
      if (!c) return;
      const icon = L.divIcon({
        className: 'munic-label',
        html: `<div class="munic-label-inner">${m.municipio}</div>`,
        iconSize: [100, 20], iconAnchor: [50, 10],
      });
      L.marker([c.lat, c.lng], { icon, interactive: false }).addTo(labelsRef.current!);
    });
  }

  function renderCircleFallback(map: L.Map) {
    if (!labelsRef.current) return;
    const maxEmp = Math.max(...regionList.map(d => d.empenhado), 1);
    regionList.forEach(reg => {
      const c = findRegionCoord(reg.name);
      if (!c) return;
      const radius = Math.max(14, Math.sqrt(reg.empenhado / maxEmp) * 48);
      const color = execPct(reg.empenhado, reg.pago_total);
      L.circleMarker([c.lat, c.lng], { radius, fillColor: color, color: '#fff', weight: 2, opacity: 0.9, fillOpacity: 0.7 })
        .bindTooltip(`<strong>${reg.name}</strong><br/>Emp: ${fmt(reg.empenhado, 'compact')}`, { className: 'map-tooltip-dark', direction: 'top' })
        .on('click', () => drillIntoRegion(reg.name))
        .addTo(labelsRef.current!);
    });
  }

  // -- Actions --
  function drillIntoRegion(name: string) {
    setActiveRegion(name); setActiveMunic(null); setMunicDetail(null);
    setLevel('regiao'); setSidebarOpen(true);
  }

  function selectMunicipality(m: MapMunic) {
    setActiveMunic(m); setMunicDetail(null); setSidebarOpen(true);
    const c = SP_COORDS[m.municipio];
    if (c) mapInst.current?.flyTo([c.lat, c.lng], 11, { duration: 0.8 });
    loadMunicDetail(m.municipio);
  }

  async function loadMunicDetail(mun: string) {
    setDetailLoading(true);
    try {
      const params: Record<string, unknown> = { p_municipio: mun };
      if (anoSel !== 'todos') params.p_ano = Number(anoSel);
      const { data: rpc } = await supabase.rpc('lc131_dashboard', params);
      if (!rpc) return;
      const d = rpc as Record<string, unknown>;
      setMunicDetail({
        projetos: ((d.por_projeto as Record<string, unknown>[] ?? []).slice(0, 8)).map(r => ({ projeto: String(r.projeto), empenhado: Number(r.empenhado ?? 0) })),
        favorecidos: ((d.por_favorecido as Record<string, unknown>[] ?? []).slice(0, 8)).map(r => ({ favorecido: String(r.favorecido), empenhado: Number(r.empenhado ?? 0) })),
        fontes: (() => {
          const raw = (d.por_fonte as Record<string, unknown>[] ?? []);
          const acc: Record<string, number> = {};
          for (const r of raw) {
            const s = String(r.fonte ?? r.fonte_recurso ?? '').toLowerCase();
            const cat = s.includes('tesouro') ? 'Tesouro'
              : (s.includes('fed') || s.includes('unia') || s.includes('uniao') || s.includes('fundo nacional') || s.includes('transfere') || s.includes('sus')) ? 'Federal'
              : 'Demais Fontes';
            acc[cat] = (acc[cat] ?? 0) + Number(r.empenhado ?? 0);
          }
          return Object.entries(acc).map(([fonte, empenhado]) => ({ fonte, empenhado })).sort((a, b) => b.empenhado - a.empenhado);
        })(),
        elementos: ((d.por_elemento as Record<string, unknown>[] ?? []).slice(0, 6)).map(r => ({ elemento: String(r.elemento), empenhado: Number(r.empenhado ?? 0) })),
        grupos: ((d.por_grupo as Record<string, unknown>[] ?? []).slice(0, 6)).map(r => ({ grupo: String(r.grupo_despesa), empenhado: Number(r.empenhado ?? 0) })),
      });
    } catch { /* silent */ }
    finally { setDetailLoading(false); }
  }

  function goBack() {
    if (activeMunic) { setActiveMunic(null); setMunicDetail(null); return; }
    if (level === 'regiao') {
      setActiveRegion(null); setLevel('estado'); setSidebarOpen(false);
      mapInst.current?.flyTo([-22.3, -48.8], 7, { duration: 1.2 });
    }
  }

  function goHome() {
    setLevel('estado'); setActiveRegion(null); setActiveMunic(null); setMunicDetail(null); setSidebarOpen(false);
    mapInst.current?.flyTo([-22.3, -48.8], 7, { duration: 1 });
  }

  const currentRegion = activeRegion ? regionList.find(d => d.name === activeRegion) : null;
  const currentMunics = activeRegion ? allMunics.filter(m => m.drs === activeRegion).sort((a, b) => b.empenhado - a.empenhado) : [];

  // -- RENDER --
  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 84px)' }}>
      {/* 3D wrapper */}
      <div className="absolute inset-0 map-3d-wrapper map-light">
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/70">
          <div className="bg-[#1B1B1B] rounded-2xl p-8 flex flex-col items-center gap-3 shadow-2xl border border-[#333]">
            <Spinner size={8} />
            <p className="text-white text-sm font-semibold">Carregando mapa do Estado de SP...</p>
            <p className="text-[#888] text-xs">GeoJSON IBGE + dados orçamentários</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-red-900/95 backdrop-blur text-white px-5 py-3 rounded-xl text-sm shadow-2xl max-w-lg text-center">
          <p className="font-bold mb-1">Erro ao carregar mapa</p>
          <p className="text-red-200 text-xs font-mono">{error}</p>
          <p className="text-red-300 text-[10px] mt-2">Execute <code className="bg-red-800 px-1 rounded">scripts/compact_functions_all.sql</code> no Supabase SQL Editor</p>
        </div>
      )}

      {/* Breadcrumb + toggle */}
      <div className="absolute top-4 left-4 z-[1000] flex items-center gap-2 flex-wrap">
        {level !== 'estado' && (
          <button onClick={goBack}
            className="flex items-center gap-1 px-3 py-2 bg-[#1B1B1B]/90 backdrop-blur text-white rounded-lg text-xs font-semibold hover:bg-[#333] transition shadow-lg border border-[#333]">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
        )}
        <div className="flex items-center gap-1 px-3 py-2 bg-[#1B1B1B]/90 backdrop-blur text-white rounded-lg text-xs shadow-lg border border-[#333]">
          <button onClick={goHome} className={cn('hover:text-[#118DFF] transition', level === 'estado' && 'text-[#118DFF] font-bold')}>
            Estado SP
          </button>
          {activeRegion && (
            <>
              <ChevronRight className="w-3 h-3 text-gray-400" />
              <button onClick={() => { setActiveMunic(null); setMunicDetail(null); }}
                className={cn('hover:text-[#118DFF] transition truncate max-w-[200px]', !activeMunic && 'text-[#118DFF] font-bold')}>
                {activeRegion}
              </button>
            </>
          )}
          {activeMunic && (
            <>
              <ChevronRight className="w-3 h-3 text-gray-400" />
              <span className="text-[#118DFF] font-bold">{activeMunic.municipio}</span>
            </>
          )}
        </div>

      </div>

      {/* Bottom KPI bar */}
      {kpis && !sidebarOpen && !loading && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-6 px-8 py-4 bg-[#1B1B1B]/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-[#333]">
          <div className="text-center">
            <p className="text-[9px] text-[#888] uppercase font-bold">Empenhado</p>
            <p className="text-lg font-bold text-[#89CFF0]">{fmt(kpis.empenhado, 'currency')}</p>
          </div>
          <div className="w-px h-8 bg-[#333]" />
          <div className="text-center">
            <p className="text-[9px] text-[#888] uppercase font-bold">Liquidado</p>
            <p className="text-lg font-bold text-[#90EE90]">{fmt(kpis.liquidado, 'currency')}</p>
          </div>
          <div className="w-px h-8 bg-[#333]" />
          <div className="text-center">
            <p className="text-[9px] text-[#888] uppercase font-bold">Pago Total</p>
            <p className="text-lg font-bold text-[#FFB347]">{fmt(kpis.pago_total, 'currency')}</p>
          </div>
          <div className="w-px h-8 bg-[#333]" />
          <div className="text-center">
            <p className="text-[9px] text-[#888] uppercase font-bold">DRS</p>
            <p className="text-lg font-bold text-white">{kpis.drs_count}</p>
          </div>
          <div className="w-px h-8 bg-[#333]" />
          <div className="text-center">
            <p className="text-[9px] text-[#888] uppercase font-bold">Municípios</p>
            <p className="text-lg font-bold text-white">{kpis.municipios}</p>
          </div>
        </div>
      )}

      {/* --.-SIDEBAR --.-*/}
      {sidebarOpen && (
        <div className="absolute top-4 right-4 bottom-4 z-[1000] w-[520px] bg-[#1B1B1B]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-[#333] flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-[#333] flex items-center justify-between shrink-0">
            <div className="min-w-0">
              <p className="font-bold text-white text-base truncate">{activeMunic ? activeMunic.municipio : activeRegion}</p>
              <p className="text-[11px] text-[#888] mt-1">
                {activeMunic ? `${activeMunic.drs} · ${activeMunic.registros} registros`
                  : `${currentMunics.length} municípios · ${currentRegion?.registros ?? 0} registros`}
              </p>
            </div>
            <button onClick={() => { setSidebarOpen(false); setActiveMunic(null); setMunicDetail(null); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#333] text-[#888] shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
            {/* KPIs */}
            {activeMunic ? (
              <div className="grid grid-cols-2 gap-2">
                <MiniKpi label="Empenhado" value={fmt(activeMunic.empenhado, 'currency')} color="#89CFF0" />
                <MiniKpi label="Liquidado" value={fmt(activeMunic.liquidado, 'currency')} color="#90EE90" />
                <MiniKpi label="Pago Total" value={fmt(activeMunic.pago_total, 'currency')} color="#FFB347" />
                <MiniKpi label="% Execução" value={(activeMunic.empenhado > 0 ? (activeMunic.pago_total / activeMunic.empenhado * 100).toFixed(1) : '0') + '%'} color={execPct(activeMunic.empenhado, activeMunic.pago_total)} />
              </div>
            ) : currentRegion ? (
              <div className="grid grid-cols-2 gap-2">
                <MiniKpi label="Empenhado" value={fmt(currentRegion.empenhado, 'currency')} color="#89CFF0" />
                <MiniKpi label="Liquidado" value={fmt(currentRegion.liquidado, 'currency')} color="#90EE90" />
                <MiniKpi label="Pago Total" value={fmt(currentRegion.pago_total, 'currency')} color="#FFB347" />
                <MiniKpi label="% Execução" value={(currentRegion.empenhado > 0 ? (currentRegion.pago_total / currentRegion.empenhado * 100).toFixed(1) : '0') + '%'} color={execPct(currentRegion.empenhado, currentRegion.pago_total)} />
              </div>
            ) : null}

            {/* DRS - municipality list */}
            {level === 'regiao' && !activeMunic && (
              <div>
                <p className="text-[10px] text-[#888] uppercase font-bold mb-2 flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" /> Municípios ({currentMunics.length})
                </p>
                <div className="space-y-0.5">
                  {currentMunics.map((m, i) => {
                    const barW = currentMunics[0]?.empenhado > 0 ? (m.empenhado / currentMunics[0].empenhado) * 100 : 0;
                    return (
                      <button key={i} onClick={() => selectMunicipality(m)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#333] transition text-left group relative overflow-hidden">
                        <div className="absolute inset-y-0 left-0 bg-[#118DFF]/10 rounded-lg" style={{ width: barW + '%' }} />
                        <span className="relative w-2 h-2 rounded-full shrink-0" style={{ background: execPct(m.empenhado, m.pago_total) }} />
                        <span className="relative text-white text-[11px] truncate flex-1">{m.municipio}</span>
                        <span className="relative text-[#89CFF0] text-[11px] font-mono font-bold shrink-0">{fmt(m.empenhado, 'currency')}</span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => onNavigate({ p_drs: [activeRegion!] }, 'regional')}
                  className="w-full mt-3 py-2.5 bg-[#118DFF]/20 text-[#89CFF0] text-xs font-bold rounded-lg hover:bg-[#118DFF]/30 transition flex items-center justify-center gap-2">
                  <Globe className="w-3.5 h-3.5" /> Ver Análise Regional
                </button>
              </div>
            )}

            {/* Municipality detail */}
            {activeMunic && (
              <>
                {detailLoading ? (
                  <div className="flex flex-col items-center gap-3 py-8"><Spinner size={6} /><p className="text-[#888] text-xs">Carregando detalhes...</p></div>
                ) : municDetail ? (
                  <div className="space-y-4">
                    {municDetail.projetos.length > 0 && (<div>
                      <p className="text-[10px] text-[#888] uppercase font-bold mb-1.5 flex items-center gap-1"><Briefcase className="w-3 h-3" /> Projetos</p>
                      {municDetail.projetos.map((p, i) => <DetailItem key={i} label={p.projeto} value={fmt(p.empenhado, 'currency')} />)}
                    </div>)}
                    {municDetail.favorecidos.length > 0 && (<div>
                      <p className="text-[10px] text-[#888] uppercase font-bold mb-1.5 flex items-center gap-1"><Users className="w-3 h-3" /> Favorecidos</p>
                      {municDetail.favorecidos.map((f, i) => <DetailItem key={i} label={stripNumPrefix(f.favorecido)} value={fmt(f.empenhado, 'currency')} />)}
                    </div>)}
                    {municDetail.fontes.length > 0 && (<div>
                      <p className="text-[10px] text-[#888] uppercase font-bold mb-1.5 flex items-center gap-1"><Database className="w-3 h-3" /> Fontes</p>
                      {municDetail.fontes.map((f, i) => <DetailItem key={i} label={f.fonte} value={fmt(f.empenhado, 'currency')} />)}
                    </div>)}
                    {municDetail.elementos.length > 0 && (<div>
                      <p className="text-[10px] text-[#888] uppercase font-bold mb-1.5 flex items-center gap-1"><Layers className="w-3 h-3" /> Elementos</p>
                      {municDetail.elementos.map((e, i) => <DetailItem key={i} label={stripNumPrefix(e.elemento)} value={fmt(e.empenhado, 'currency')} />)}
                    </div>)}
                    {municDetail.grupos.length > 0 && (<div>
                      <p className="text-[10px] text-[#888] uppercase font-bold mb-1.5 flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Grupos</p>
                      {municDetail.grupos.map((g, i) => <DetailItem key={i} label={g.grupo} value={fmt(g.empenhado, 'currency')} />)}
                    </div>)}
                  </div>
                ) : null}
                <div className="space-y-2 pt-2">
                  <button onClick={() => onNavigate({ p_municipio: [activeMunic.municipio] }, 'resumo')}
                    className="w-full py-3 bg-[#118DFF] text-white text-sm font-bold rounded-lg hover:bg-[#0D7AE8] transition flex items-center justify-center gap-2">
                    <LayoutDashboard className="w-4 h-4" /> Ver Dashboard Completo
                  </button>
                  <button onClick={() => onNavigate({ p_municipio: [activeMunic.municipio] }, 'dados')}
                    className="w-full py-2.5 bg-[#333] text-[#CCC] text-xs font-bold rounded-lg hover:bg-[#444] transition flex items-center justify-center gap-2">
                    <Table2 className="w-3.5 h-3.5" /> Ver Dados Detalhados
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      {!loading && (
        <div className="absolute bottom-6 right-4 z-[1000] bg-[#1B1B1B]/90 backdrop-blur rounded-xl px-4 py-3 shadow-xl border border-[#333]">
          <p className="text-[9px] text-[#888] uppercase font-bold mb-2 tracking-wider">% Execução (Pago/Emp)</p>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#1AAB40]" /><span className="text-[11px] text-[#CCC]">≥ 80%</span></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#D9B300]" /><span className="text-[11px] text-[#CCC]">50–80%</span></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#D64550]" /><span className="text-[11px] text-[#CCC]">{'< 50%'}</span></div>
          </div>
          {level === 'estado' && drsList.length > 0 && (
            <>
              <div className="border-t border-[#333] my-2.5" />
              <p className="text-[9px] text-[#888] uppercase font-bold mb-2 tracking-wider">DRS (clique para detalhar)</p>
              <div className="flex flex-col gap-0.5 max-h-[280px] overflow-y-auto custom-scrollbar">
                {regionList.map((d, i) => (
                  <button key={i} onClick={() => drillIntoRegion(d.name)}
                    className="flex items-center gap-2 hover:bg-[#333] rounded-lg px-2 py-1 transition text-left">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: drsColorMap[d.name] || '#999' }} />
                    <span className="text-[10px] text-[#CCC] truncate">{d.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// --- Upload Panel ---
function UploadPanel({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<UploadStep>('idle');
  const [rows, setRows] = useState<DataRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [uploadMode, setUploadMode] = useState<'replace'|'incremental'>('incremental');
  const [dbCount, setDbCount] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('lc131_despesas').select('id', { count: 'estimated' }).limit(1)
      .then(({ count }) => setDbCount(count ?? 0));
  }, []);

  const handleFile = async (file: File) => {
    setFileName(file.name); setStep('parsing');
    try {
      let raw: DataRow[] = [];
      if (file.name.match(/\.(xlsx|xls)$/i)) {
        const XLSX = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (matrix.length < 2) throw new Error('Arquivo vazio');
        // Detecta a linha de cabeçalho (primeira com >= 3 textos não-numéricos)
        let hIdx = 0;
        for (let i = 0; i < Math.min(10, matrix.length); i++) {
          const row = matrix[i] as unknown[];
          const nonEmpty = row.filter(v => v !== '' && v != null);
          const textCells = nonEmpty.filter(v => typeof v === 'string' && isNaN(Number(v)));
          if (nonEmpty.length >= 3 && textCells.length / nonEmpty.length > 0.6) { hIdx = i; break; }
        }
        const headers = (matrix[hIdx] as unknown[]).map(h =>
          String(h).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
            .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'').replace(/^_+|_+$/g,'').replace(/__+/g,'_') || 'col'
        );
        const SKIP = ['total geral','total','subtotal'];
        for (let i = hIdx + 1; i < matrix.length; i++) {
          const arr = matrix[i] as unknown[];
          if (arr.every(v => v === '' || v == null)) continue;
          const first = String(arr[0] ?? '').toLowerCase().trim();
          if (SKIP.some(p => first.startsWith(p))) continue;
          const row: DataRow = {};
          headers.forEach((col, j) => {
            const v = arr[j] ?? '';
            row[col] = v === '' ? null : v;
          });
          raw.push(row);
        }
      } else if (file.name.match(/\.(csv|txt)$/i)) {
        raw = parseCSV(await file.text());
      } else throw new Error('Use .xlsx ou .csv');
      if (!raw.length) throw new Error('Arquivo vazio');
      setRows(raw); setStep('preview');
    } catch (e: unknown) { setMessage((e as Error).message); setStep('error'); }
  };

  const handleUpload = async () => {
    if (!confirm) { setConfirm(true); return; }
    setConfirm(false); setStep('uploading'); setProgress(0);
    const CHUNK = 500; let uploaded = 0;
    try {
      // Valida quais colunas existem na tabela
      const testRow = rows[0];
      const allCols = Object.keys(testRow);
      let validCols = [...allCols];
      for (let attempts = 0; attempts < 5; attempts++) {
        const { error } = await supabase.from('lc131_despesas').select(validCols.join(',')).limit(1);
        if (!error) break;
        const m = error.message.match(/column\s+\w+\.(\w+)\s+does not exist/);
        if (m) { validCols = validCols.filter(c => c !== m[1]); continue; }
        throw error;
      }
      const colsToRemove = allCols.filter(c => !validCols.includes(c));
      let uploadRows = rows;
      if (colsToRemove.length > 0) {
        uploadRows = rows.map(r => {
          const clean = { ...r };
          for (const c of colsToRemove) delete clean[c];
          return clean;
        });
      }

      // Detecta o ano do arquivo
      const detectedYear = uploadRows[0]?.ano_referencia ? Number(uploadRows[0].ano_referencia) : null;

      if (uploadMode === 'replace') {
        // Deleta apenas o ano detectado via RPC (SECURITY DEFINER, bypass RLS)
        if (detectedYear) {
          setMessage(`Deletando registros de ${detectedYear}...`);
          const { error: delErr } = await supabase.rpc('lc131_delete_year', { p_ano: detectedYear });
          if (delErr) throw new Error(`Erro ao deletar ano ${detectedYear}: ${delErr.message}`);
        } else {
          throw new Error('Não foi possível detectar o ano do arquivo. Verifique a coluna ano_referencia.');
        }
        setMessage('');
        for (let i = 0; i < uploadRows.length; i += CHUNK) {
          const { error } = await supabase.from('lc131_despesas').insert(uploadRows.slice(i, i + CHUNK));
          if (error) throw error;
          uploaded += Math.min(CHUNK, uploadRows.length - i);
          setProgress(Math.round((uploaded / uploadRows.length) * 100));
        }
      } else {
        // Incremental: deleta o ano e reimporta tudo (mais confiável que fingerprint)
        if (detectedYear) {
          setMessage(`Substituindo registros de ${detectedYear}...`);
          const { error: delErr } = await supabase.rpc('lc131_delete_year', { p_ano: detectedYear });
          if (delErr) throw new Error(`Erro ao deletar ano ${detectedYear}: ${delErr.message}`);
          setMessage('');
        }
        for (let i = 0; i < uploadRows.length; i += CHUNK) {
          const { error } = await supabase.from('lc131_despesas').insert(uploadRows.slice(i, i + CHUNK));
          if (error) throw error;
          uploaded += Math.min(CHUNK, uploadRows.length - i);
          setProgress(Math.round((uploaded / uploadRows.length) * 100));
        }
      }

      try { await supabase.rpc('refresh_dashboard_batch', { p_batch_size: 10000 }); } catch { /* optional */ }
      setMessage(uploaded.toLocaleString('pt-BR') + ` registros de ${detectedYear ?? '?'} importados com sucesso!`); setStep('done');
    } catch (e: unknown) { setMessage((e as Error).message); setStep('error'); }
  };

  const reset = () => { setStep('idle'); setRows([]); setFileName(''); setProgress(0); setMessage(''); setConfirm(false); setUploadMode('incremental'); };
  const cols = rows.length ? Object.keys(rows[0]) : [];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg h-full bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E5E5E5] flex items-center justify-between bg-[#FAFAFA]">
          <div className="flex items-center gap-2.5">
            <Upload className="w-4 h-4 text-[#118DFF]" />
            <div>
              <p className="font-bold text-[#333] text-sm">Importar LC 131</p>
              <p className="text-[10px] text-[#999]">Importar registros novos ou substituir</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#E5E5E5]">
            <X className="w-4 h-4 text-[#666]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {dbCount !== null && (
            <div className="flex items-center justify-between bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg px-4 py-2.5">
              <span className="text-[11px] text-[#666] flex items-center gap-1.5"><Database className="w-3.5 h-3.5" />Registros no banco</span>
              <span className="font-bold text-sm font-mono text-[#333]">{dbCount.toLocaleString('pt-BR')}</span>
            </div>
          )}
          {step === 'idle' && (
            <div onDrop={e => { e.preventDefault(); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]); }}
              onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
              className="bg-[#F8FBFF] border-2 border-dashed border-[#118DFF]/30 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-[#118DFF] transition group">
              <FileSpreadsheet className="w-10 h-10 text-[#118DFF]/40 group-hover:text-[#118DFF]" />
              <div className="text-center">
                <p className="font-semibold text-[#333]">Arraste ou clique para selecionar</p>
                <p className="text-xs text-[#999] mt-1">.xlsx ou .csv</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </div>
          )}
          {step === 'parsing' && <div className="flex flex-col items-center gap-3 py-10"><Spinner size={7} /><p className="text-sm text-[#666]">Processando...</p></div>}
          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button onClick={() => setUploadMode('incremental')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${uploadMode === 'incremental' ? 'bg-[#118DFF] text-white border-[#118DFF]' : 'bg-white text-[#666] border-[#D0D0D0] hover:bg-[#F8FBFF]'}`}>
                  Substituir Ano
                </button>
                <button onClick={() => setUploadMode('replace')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${uploadMode === 'replace' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-[#666] border-[#D0D0D0] hover:bg-red-50'}`}>
                  Substituir Tudo
                </button>
              </div>
              <div className={`border rounded-lg p-3 flex items-start gap-2.5 ${uploadMode === 'replace' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${uploadMode === 'replace' ? 'text-amber-600' : 'text-blue-600'}`} />
                <div>
                  <p className={`font-semibold text-sm ${uploadMode === 'replace' ? 'text-amber-800' : 'text-blue-800'}`}>
                    {uploadMode === 'replace' ? 'Substituição total (todos os anos)' : 'Substituição por ano'}
                  </p>
                  <p className={`text-xs mt-0.5 ${uploadMode === 'replace' ? 'text-amber-700' : 'text-blue-700'}`}>
                    {uploadMode === 'replace'
                      ? <>Deleta <strong>todos os {dbCount?.toLocaleString('pt-BR') ?? '?'}</strong> registros e importa <strong>{rows.length.toLocaleString('pt-BR')}</strong> de <span className="font-mono">{fileName}</span>.</>
                      : <>Deleta apenas os registros do <strong>ano detectado no arquivo</strong> e reimporta <strong>{rows.length.toLocaleString('pt-BR')}</strong> linhas de <span className="font-mono">{fileName}</span>. Outros anos não são afetados.</>
                    }
                  </p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#999] uppercase mb-1">Colunas ({cols.length})</p>
                <div className="flex flex-wrap gap-1">{cols.slice(0,20).map(c => <span key={c} className="px-1.5 py-0.5 bg-[#F0F0F0] text-[#666] text-[9px] font-mono rounded">{c}</span>)}</div>
              </div>
              {!confirm ? (
                <div className="flex gap-2 pt-1">
                  <button onClick={reset} className="flex-1 py-2 text-sm font-semibold text-[#666] border border-[#D0D0D0] rounded-lg hover:bg-[#FAFAFA]">Cancelar</button>
                  <button onClick={handleUpload} className="flex-1 py-2 text-sm font-bold bg-[#118DFF] text-white rounded-lg hover:bg-[#0D7AE8]">Importar</button>
                </div>
              ) : (
                <div className={`border rounded-lg p-3 space-y-2 ${uploadMode === 'replace' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                  <p className={`font-semibold text-sm ${uploadMode === 'replace' ? 'text-red-800' : 'text-blue-800'}`}>
                    {uploadMode === 'replace' ? 'Tem certeza? Deleta TODOS os anos.' : 'Confirma substituição do ano?'}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirm(false)} className="flex-1 py-1.5 text-xs font-semibold border border-[#D0D0D0] rounded bg-white">Não</button>
                    <button onClick={handleUpload} className={`flex-1 py-1.5 text-xs font-bold text-white rounded ${uploadMode === 'replace' ? 'bg-red-600' : 'bg-[#118DFF]'}`}>
                      {uploadMode === 'replace' ? 'Sim, substituir' : 'Sim, importar novos'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {step === 'uploading' && (
            <div className="space-y-3 py-6">
              <div className="flex items-center gap-2 justify-center"><Spinner size={5} /><p className="text-sm text-[#666]">Enviando... {progress}%</p></div>
              <div className="h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                <div className="h-full bg-[#118DFF] rounded-full transition-all duration-300" style={{ width: progress + '%' }} />
              </div>
            </div>
          )}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <div><p className="font-bold text-[#333]">Importação concluída!</p><p className="text-sm text-[#666] mt-1">{message}</p></div>
              <button onClick={reset} className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg">Outro</button>
            </div>
          )}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle className="w-10 h-10 text-red-300" />
              <div><p className="font-bold text-red-700">Erro</p><p className="text-xs text-red-500 mt-1 font-mono">{message}</p></div>
              <button onClick={reset} className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-lg">Tentar novamente</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-
// --- Main App ---
// --.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-
export default function App() {
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string|null>(null);
  const [viewMissing, setViewMissing]     = useState(false);
  const [uploadOpen, setUploadOpen]       = useState(false);
  const [pwdGateOpen, setPwdGateOpen]     = useState(false);
  const [pwdInput, setPwdInput]           = useState('');
  const [pwdError, setPwdError]           = useState(false);
  const [menuOpen, setMenuOpen]           = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<Map<string, CachedData>>(new Map());
  const initialLoaded = useRef(false);
  const [data, setData]                   = useState<CachedData|null>(null);

  const [activeTab, setActiveTab]         = useState<Tab>('mapa');
  const [anoSel, setAnoSel]               = useState<number|'todos'>(new Date().getFullYear());
  const [filters, setFilters]             = useState<Partial<Record<DetailFilterKey, string[]>>>({});
  const [distincts, setDistincts]         = useState<Record<string, string[]>>({});
  const [distinctsLoading, setDistinctsLoading] = useState(false);
  const [filtersOpen, setFiltersOpen]     = useState(false);
  const [availableAnos, setAvailableAnos] = useState<number[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [detailRows, setDetailRows]       = useState<DetailRow[]>([]);
  const [detailTotal, setDetailTotal]     = useState(0);
  const [detailPage, setDetailPage]       = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError]     = useState<string|null>(null);
  const [tableSearch, setTableSearch]     = useState('');
  const [xlsxLoading, setXlsxLoading]     = useState(false);
  const DETAIL_PAGE_SIZE = 200;

  // -- Pivot tab --
  type PivotRawRow = { municipio: string; rotulo: string; ano_referencia: number; pago_total: number; empenhado: number; liquidado: number };
  const [pivotRaw, setPivotRaw]             = useState<PivotRawRow[]>([]);
  const [pivotLoading, setPivotLoading]     = useState(false);
  const [pivotError, setPivotError]         = useState<string|null>(null);
  const [pivotExpanded, setPivotExpanded]   = useState<Set<string>>(new Set());
  const [pivotValueKey, setPivotValueKey]   = useState<'pago_total'|'empenhado'|'liquidado'>('pago_total');
  const [pivotXlsxLoading, setPivotXlsxLoading] = useState(false);

  // -- Retry helper for RPC calls (handles upstream timeouts) --
  const rpcWithRetry = useCallback(async (fnName: string, params: Record<string, unknown>, retries = 3) => {
    for (let attempt = 0; attempt < retries; attempt++) {
      const { data, error } = await supabase.rpc(fnName, params);
      if (!error) return { data, error: null };
      if (error.message?.includes('timeout') || error.message?.includes('upstream') || error.code === 'PGRST000') {
        if (attempt < retries - 1) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); continue; }
      }
      return { data, error };
    }
    return { data: null, error: { code: 'TIMEOUT', message: 'upstream request timeout após múltiplas tentativas' } };
  }, []);

  // -- Load dashboard --
  const loadDashboard = useCallback(async (ano: number | 'todos', activeFilters: Partial<Record<DetailFilterKey, string[]>>) => {
    const cacheKey = JSON.stringify({ ano, ...activeFilters });
    if (cacheRef.current.has(cacheKey)) { setData(cacheRef.current.get(cacheKey)!); return; }
    if (!initialLoaded.current) setLoading(true); else setDashboardLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = {};
      if (ano !== 'todos') params.p_ano = Number(ano);
      Object.entries(activeFilters).forEach(([k, v]) => { if (Array.isArray(v) && v.length > 0) params[k] = expandFilterValues(k, v).join('|'); });
      const { data: rpc, error: rpcErr } = await rpcWithRetry('lc131_dashboard', params);
      if (rpcErr) {
        if (rpcErr.code === 'PGRST202' || rpcErr.message?.includes('does not exist')) { setViewMissing(true); setLoading(false); setDashboardLoading(false); return; }
        throw new Error(rpcErr.code + ': ' + rpcErr.message);
      }
      const d = rpc as Record<string, unknown>;
      const kr = d.kpis as Record<string, unknown> ?? {};
      const parsed: CachedData = {
        kpis: { empenhado: Number(kr.empenhado ?? 0), liquidado: Number(kr.liquidado ?? 0), pago: Number(kr.pago ?? 0), pago_total: Number(kr.pago_total ?? 0), total: Number(kr.total ?? 0), municipios: Number(kr.municipios ?? 0) },
        porAno: ((d.por_ano as Record<string,unknown>[] ?? [])).map(r => ({ ano: Number(r.ano), empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago_total: Number(r.pago_total ?? 0), registros: Number(r.registros ?? 0) })).sort((a, b) => a.ano - b.ano),
        porGrupoSimpl: ((d.por_grupo_simpl as Record<string,unknown>[] ?? [])).map(r => ({ grupo_simpl: String(r.grupo_simpl), empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago_total: Number(r.pago_total ?? 0) })),
        porFonteSimpl: ((d.por_fonte_simpl as Record<string,unknown>[] ?? [])).map(r => ({ fonte_simpl: String(r.fonte_simpl), empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago_total: Number(r.pago_total ?? 0) })),
        porGrupo: ((d.por_grupo as Record<string,unknown>[] ?? [])).map(r => ({ grupo_despesa: String(r.grupo_despesa), empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago_total: Number(r.pago_total ?? 0) })),
        porDrs: (() => { const raw = ((d.por_drs as Record<string,unknown>[] ?? [])).map(r => ({ drs: normalizeDrs(String(r.drs)), empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago_total: Number(r.pago_total ?? 0) })); const m = new Map<string, typeof raw[0]>(); for (const r of raw) { const e = m.get(r.drs); if (e) { e.empenhado += r.empenhado; e.liquidado += r.liquidado; e.pago_total += r.pago_total; } else { m.set(r.drs, { ...r }); } } return Array.from(m.values()).sort((a, b) => b.empenhado - a.empenhado); })(),
        porMunic: ((d.por_municipio as Record<string,unknown>[] ?? [])).map(r => ({ municipio: String(r.municipio), empenhado: Number(r.empenhado ?? 0), pago_total: Number(r.pago_total ?? 0) })),
        porFonte: ((d.por_fonte as Record<string,unknown>[] ?? [])).map(r => ({ fonte_recurso: String(r.fonte ?? r.fonte_recurso ?? ''), empenhado: Number(r.empenhado ?? 0), pago_total: Number(r.pago_total ?? 0) })),
        porElemento: ((d.por_elemento as Record<string,unknown>[] ?? [])).map(r => ({ elemento: String(r.elemento), empenhado: Number(r.empenhado ?? 0), pago_total: Number(r.pago_total ?? 0) })),
        porRegiaoAd: ((d.por_regiao_ad as Record<string,unknown>[] ?? [])).map(r => ({ regiao_ad: String(r.regiao_ad), empenhado: Number(r.empenhado ?? 0), pago_total: Number(r.pago_total ?? 0) })),
        porUo: ((d.por_uo as Record<string,unknown>[] ?? [])).map(r => ({ uo: String(r.uo), empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago_total: Number(r.pago_total ?? 0) })),
        porRras: (() => { const raw = ((d.por_rras as Record<string,unknown>[] ?? [])).map(r => ({ rras: normalizeRras(String(r.rras)), empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago_total: Number(r.pago_total ?? 0) })); const m = new Map<string, typeof raw[0]>(); for (const r of raw) { const e = m.get(r.rras); if (e) { e.empenhado += r.empenhado; e.liquidado += r.liquidado; e.pago_total += r.pago_total; } else { m.set(r.rras, { ...r }); } } return Array.from(m.values()).sort((a, b) => b.empenhado - a.empenhado); })(),
        porTipoDespesa: ((d.por_tipo_despesa as Record<string,unknown>[] ?? [])).map(r => ({ tipo_despesa: String(r.tipo_despesa), empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago_total: Number(r.pago_total ?? 0) })),
        porRotulo: ((d.por_rotulo as Record<string,unknown>[] ?? [])).map(r => ({ rotulo: String(r.rotulo), empenhado: Number(r.empenhado ?? 0), pago_total: Number(r.pago_total ?? 0) })),
        porFavorecido: ((d.por_favorecido as Record<string,unknown>[] ?? [])).map(r => ({ favorecido: String(r.favorecido), empenhado: Number(r.empenhado ?? 0), pago_total: Number(r.pago_total ?? 0), contratos: Number(r.contratos ?? 0) })),
        porProjeto: ((d.por_projeto as Record<string,unknown>[] ?? [])).map(r => ({ projeto: String(r.projeto), empenhado: Number(r.empenhado ?? 0), pago_total: Number(r.pago_total ?? 0), registros: Number(r.registros ?? 0) })),
        porUg: ((d.por_ug as Record<string,unknown>[] ?? [])).map(r => ({ ug: String(r.ug), empenhado: Number(r.empenhado ?? 0), pago_total: Number(r.pago_total ?? 0) })),
        porRegiaoSa: ((d.por_regiao_sa as Record<string,unknown>[] ?? [])).map(r => ({ regiao_sa: String(r.regiao_sa), empenhado: Number(r.empenhado ?? 0), pago_total: Number(r.pago_total ?? 0) })),
      };
      cacheRef.current.set(cacheKey, parsed);
      if (ano === 'todos' && Object.keys(activeFilters).length === 0) setAvailableAnos(parsed.porAno.map(r => r.ano));
      setData(parsed);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { initialLoaded.current = true; setLoading(false); setDashboardLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const [{ data: maxR }, { data: minR }] = await Promise.all([
            supabase.from('lc131_despesas').select('ano_referencia').order('ano_referencia', { ascending: false }).limit(1).single(),
            supabase.from('lc131_despesas').select('ano_referencia').order('ano_referencia', { ascending: true }).limit(1).single(),
          ]);
          const maxAno = (maxR?.ano_referencia as number) ?? new Date().getFullYear();
          const minAno = (minR?.ano_referencia as number) ?? maxAno;
          const anos = Array.from({ length: maxAno - minAno + 1 }, (_, i) => minAno + i);
          setAvailableAnos(anos);
          setAnoSel(maxAno);
          loadDashboard(maxAno, {});
          loadDistincts({}, maxAno);
          return;
        } catch {
          if (attempt < 2) await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
          else { setError('Servidor indisponível. Aguarde alguns minutos e recarregue a página.'); setLoading(false); }
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dashDebounce = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!initialLoaded.current) return;           // skip first render  - initial effect handles it
    clearTimeout(dashDebounce.current);
    dashDebounce.current = setTimeout(() => loadDashboard(anoSel, filters), 400);
    return () => clearTimeout(dashDebounce.current);
  }, [anoSel, filters, loadDashboard]);

  const loadDistincts = useCallback(async (cf: Partial<Record<DetailFilterKey, string[]>>, ano: number | 'todos') => {
    setDistinctsLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (ano !== 'todos') params.p_ano = Number(ano);
      Object.entries(cf).forEach(([k, v]) => { if (Array.isArray(v) && v.length > 0) params[k] = expandFilterValues(k, v).join('|'); });

      let nextDistincts = EMPTY_DISTINCTS;
      const { data: rpc, error: rpcErr } = await rpcWithRetry('lc131_distincts', params);
      if (!rpcErr) nextDistincts = buildDistinctState(rpc as Record<string, unknown> | undefined);

      if (!hasAnyDistinctOptions(nextDistincts) || (nextDistincts.distinct_tipo?.length ?? 0) === 0) {
        let query = supabase.from('lc131_despesas')
          .select('drs, regiao_ad, municipio, rras, regiao_sa, codigo_nome_grupo, codigo_nome_elemento, tipo_despesa, descricao_processo, rotulo, codigo_nome_fonte_recurso, codigo_nome_uo, codigo_nome_favorecido, codigo_ug')
          .limit(5000);
        if (ano !== 'todos') query = query.eq('ano_referencia', Number(ano));
        query = applyFiltersToQuery(query, cf, '');

        let { data: fallbackRows, error: fallbackErr } = await query;

        if (!fallbackErr && Array.isArray(fallbackRows)) {
          nextDistincts = buildDistinctStateFromRows(fallbackRows as Record<string, unknown>[]);
        }
      }

      if ((nextDistincts.distinct_tipo?.length ?? 0) === 0 && data?.porTipoDespesa?.length) {
        nextDistincts = {
          ...nextDistincts,
          distinct_tipo: uniqueSorted(data.porTipoDespesa.map(r => r.tipo_despesa)),
        };
      }

      setDistincts(nextDistincts);
      const pruned = pruneFiltersByDistincts(cf, nextDistincts);
      if (JSON.stringify(pruned) !== JSON.stringify(cf)) setFilters(pruned);
      return nextDistincts;
    } catch {
      const fallbackFromCharts = {
        ...EMPTY_DISTINCTS,
        distinct_tipo: uniqueSorted(data?.porTipoDespesa?.map(r => r.tipo_despesa) ?? []),
      };
      setDistincts(fallbackFromCharts);
      return fallbackFromCharts;
    } finally {
      setDistinctsLoading(false);
    }
  }, [data, rpcWithRetry]);

  const loadDetail = useCallback(async (page: number, search = '') => {
    setDetailLoading(true); setDetailError(null);
    try {
      // Direct REST query – avoids the slow COUNT(*) in lc131_detail RPC
      let query = supabase.from('lc131_despesas')
        .select('*', { count: 'exact' })
        .order('empenhado', { ascending: false, nullsFirst: false })
        .range(page * DETAIL_PAGE_SIZE, (page + 1) * DETAIL_PAGE_SIZE - 1);

      if (anoSel !== 'todos') query = query.eq('ano_referencia', Number(anoSel));
      query = applyFiltersToQuery(query, filters, search);

      let { data, count, error } = await query;

      // tipo_despesa is now the enriched column (from TIPO_DESPESA.xlsx mapping)

      if (error) throw new Error(error.message);
      const rows = (data ?? []).map(r => enrichDetailRow(r as Record<string, unknown>));
      setDetailTotal(count ?? rows.length); setDetailRows(rows); setDetailPage(page);
    } catch (e: unknown) { setDetailError((e as Error).message); }
    finally { setDetailLoading(false); }
  }, [anoSel, filters]);

  const detailDeb = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (activeTab !== 'dados') return;
    clearTimeout(detailDeb.current);
    detailDeb.current = setTimeout(() => loadDetail(0, tableSearch), 600);
    return () => clearTimeout(detailDeb.current);
  }, [filters, anoSel, activeTab]);

  // -- Load pivot --
  const loadPivot = useCallback(async () => {
    setPivotLoading(true); setPivotError(null);
    try {
      const SKIP_KEYS = new Set(['p_codigo_ug', 'p_fonte_recurso']);
      const params: Record<string, unknown> = {};
      Object.entries(filters).forEach(([k, v]) => {
        if (SKIP_KEYS.has(k)) return;
        if (Array.isArray(v) && v.length > 0) params[k] = expandFilterValues(k, v).join('|');
      });
      const { data, error } = await supabase.rpc('lc131_pivot', params);
      if (error) throw new Error(error.message);
      setPivotRaw(data ?? []);
    } catch (e: unknown) {
      setPivotError((e as Error).message);
    } finally {
      setPivotLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (activeTab !== 'pivot') return;
    loadPivot();
  }, [activeTab, filters, loadPivot]);

  useEffect(() => {
    if (!initialLoaded.current) return;
    loadDistincts(filters, anoSel);
  }, [anoSel, loadDistincts]);

  const setFilter = async (key: DetailFilterKey, val: string[]) => {
    const nf = { ...filters };
    if (val.length > 0) nf[key] = val; else delete nf[key];
    setFilters(nf);
    await loadDistincts(nf, anoSel);
  };
  const clearFilters = async () => { setFilters({}); await loadDistincts({}, anoSel); };
  const activeFilterCount = Object.values(filters).filter(v => Array.isArray(v) && v.length > 0).length;
  const handleRefresh = () => { cacheRef.current.clear(); setData(null); loadDashboard(anoSel, filters); loadDistincts(filters, anoSel); };

  const switchTab = (t: Tab) => {
    setActiveTab(t);
    if (t === 'dados') { loadDetail(0, tableSearch); if (Object.keys(distincts).length === 0) loadDistincts(filters, anoSel); }
    if (t === 'pivot') loadPivot();
  };

  const exportCSV = () => {
    if (!detailRows.length) return;
    const headers = TABLE_COLS.map(c => c.label).join(',');
    const body = detailRows.map(r => TABLE_COLS.map(c => '"' + String(r[c.key] ?? '').replace(/"/g,'""') + '"').join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + headers + '\n' + body], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = 'lc131_' + anoSel + '.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const downloadAllXlsx = async () => {
    setXlsxLoading(true);
    try {
      const BATCH = 1000; // Supabase REST hard-caps at 1000 rows per request
      let offset = 0;
      const allRows: DetailRow[] = [];
      while (true) {
        let q = supabase.from('lc131_despesas')
          .select('*')
          .order('empenhado', { ascending: false, nullsFirst: false })
          .range(offset, offset + BATCH - 1);
        if (anoSel !== 'todos') q = q.eq('ano_referencia', Number(anoSel));
        q = applyFiltersToQuery(q, filters, tableSearch);
        const { data: batch, error } = await q;
        if (error) throw new Error(error.message);
        const fetched = (batch ?? []).map(r => enrichDetailRow(r as Record<string, unknown>));
        allRows.push(...fetched);
        if (fetched.length < BATCH) break;
        offset += BATCH;
      }
      const XLSX = await import('xlsx');
      const sheetData = [
        TABLE_COLS.map(c => c.label),
        ...allRows.map(r => TABLE_COLS.map(c => {
          const v = r[c.key];
          if (c.numeric) return Number(v ?? 0) || 0;
          const s = String(v ?? '');
          if (!s || s === 'null' || s === 'undefined') return '';
          return (c.key as string).startsWith('codigo_nome_') ? stripNumPrefix(s) : s;
        })),
      ];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dados');
      XLSX.writeFile(wb, `lc131_${anoSel}_completo.xlsx`);
    } catch (e: unknown) {
      alert('Erro ao gerar XLSX: ' + (e as Error).message);
    } finally {
      setXlsxLoading(false);
    }
  };

  const kpis = data?.kpis;
  const pctLiq = kpis && kpis.empenhado > 0 ? (kpis.liquidado / kpis.empenhado) * 100 : 0;
  const pctPago = kpis && kpis.empenhado > 0 ? (kpis.pago_total / kpis.empenhado) * 100 : 0;

  // -- Setup missing --
  if (viewMissing) return (
    <div className="min-h-screen bg-[#F3F2F1] flex items-center justify-center p-6">
      <div className="bg-white rounded-lg border border-amber-200 p-6 max-w-md w-full space-y-3">
        <AlertCircle className="w-6 h-6 text-amber-400" />
        <p className="font-bold text-[#333]">Setup necessário</p>
        <p className="text-sm text-[#666]">Execute <code className="bg-[#F0F0F0] px-1 rounded text-xs">scripts/supabase_setup.sql</code> no Supabase.</p>
        <button onClick={handleRefresh} className="w-full py-2 bg-[#118DFF] text-white text-sm font-bold rounded-lg flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> Verificar
        </button>
      </div>
    </div>
  );

  // --.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-
  // --- RENDER ------------------------------------------------------------------
  // --.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-
  return (
    <div className="min-h-screen bg-[#F3F2F1]">
      {/* --.-.-.-.-.-.-.-HEADER --.-.-.-.-.-.-.-*/}
      <header className="sticky top-0 z-40 bg-[#1B1B1B] text-white shadow-md">
        <div className="max-w-screen-2xl mx-auto px-4 h-11 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/img/logo1.png" alt="Logo CSS" className="h-[84px] w-auto" />
            <span className="font-bold text-[13px] tracking-tight">Controle de Despesas</span>
            <span className="text-[12px] text-[#888] hidden sm:inline">Coordenadoria de Gestão Orçamentária e Financeira</span>
          </div>
          <div className="flex items-center gap-2">
            {activeTab !== 'mapa' && (
              <button onClick={filtersOpen ? () => setFiltersOpen(false) : () => { setFiltersOpen(true); if (!Object.keys(distincts).length) loadDistincts(filters, anoSel); }}
                className={cn('flex items-center gap-1 px-2.5 h-7 rounded text-[11px] font-semibold transition',
                  filtersOpen || activeFilterCount > 0 ? 'bg-[#118DFF] text-white' : 'bg-[#333] text-[#CCC] hover:bg-[#444]')}>
                <SlidersHorizontal className="w-3 h-3" />
                <span className="hidden sm:inline">Filtros</span>
                {activeFilterCount > 0 && <span className="bg-white text-[#118DFF] text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">{activeFilterCount}</span>}
              </button>
            )}
            {/* Hamburger menu */}
            <div ref={menuRef} className="relative">
              <button onClick={() => setMenuOpen(v => !v)} className="w-7 h-7 flex items-center justify-center rounded bg-[#333] hover:bg-[#444] text-[#CCC]">
                <Menu className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-[39]" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-9 z-40 w-44 bg-[#1B1B1B] border border-[#333] rounded-xl shadow-2xl overflow-hidden">
                    <button onClick={() => { handleRefresh(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-[12px] font-semibold text-[#CCC] hover:bg-[#333] transition">
                      <RefreshCw className={cn('w-3.5 h-3.5 shrink-0', loading && 'animate-spin')} />
                      Atualizar dados
                    </button>
                    <div className="border-t border-[#333]" />
                    <button onClick={() => { setPwdInput(''); setPwdError(false); setPwdGateOpen(true); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-[12px] font-semibold text-[#118DFF] hover:bg-[#333] transition">
                      <Upload className="w-3.5 h-3.5 shrink-0" />
                      Importar planilha
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* --.-.-.-.-.-.-.-TABS + YEARS --.-.-.-.-.-.-.-*/}
      <div className="sticky top-11 z-30 bg-white border-b border-[#E5E5E5] shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-4 flex items-center justify-between gap-3 h-10">
          {/* Tabs */}
          <div className="flex items-center gap-0">
            {TABS.map(t => (
              <button key={t.id} onClick={() => switchTab(t.id)}
                className={cn('flex items-center gap-1.5 px-3 h-10 text-[12px] font-semibold border-b-2 transition-colors',
                  activeTab === t.id ? 'border-[#118DFF] text-[#118DFF]' : 'border-transparent text-[#666] hover:text-[#333] hover:border-[#CCC]')}>
                {t.icon}<span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
          {/* Year pills */}
          <div className="flex items-center gap-0.5 overflow-x-auto">
            <button onClick={() => setAnoSel('todos')}
              className={cn('px-2.5 py-1 text-[11px] font-bold rounded transition',
                anoSel === 'todos' ? 'bg-[#118DFF] text-white' : 'text-[#999] hover:bg-[#F0F0F0]')}>Todos</button>
            {availableAnos.map(a => (
              <button key={a} onClick={() => setAnoSel(a)}
                className={cn('px-2.5 py-1 text-[11px] font-bold rounded transition',
                  anoSel === a ? 'bg-[#118DFF] text-white' : 'text-[#999] hover:bg-[#F0F0F0]')}>{a}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading modal */}
      {dashboardLoading && <ProgressModal message="Aplicando filtros..." />}

      {/* --.-.-.-.-.-.-.-FILTER BAR --.-.-.-.-.-.-.-*/}
      {filtersOpen && (
        <div className="sticky top-[84px] z-20 bg-white border-b border-[#E5E5E5] shadow-md">
          <div className="max-w-screen-2xl mx-auto px-4 py-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7 gap-2">
              {FILTER_META.map(f => (
                <MultiSelect key={f.key} label={f.label} options={(distincts[f.distinctKey] ?? []) as string[]}
                  value={filters[f.key] ?? []} onChange={(v: string[]) => setFilter(f.key, v)} loading={distinctsLoading} />
              ))}
            </div>
            {activeFilterCount > 0 && (
              <div className="flex justify-end mt-1.5">
                <button onClick={clearFilters} className="text-[11px] text-red-500 hover:text-red-700 font-semibold flex items-center gap-1">
                  <X className="w-3 h-3" /> Limpar filtros ({activeFilterCount})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --.-.-.-.-.-.-.-MAP TAB  - full viewport --.-.-.-.-.-.-.-*/}
      {activeTab === 'mapa' && (
        <InteractiveMap anoSel={anoSel} onNavigate={(f, tab) => {
          Object.entries(f).forEach(([k, v]) => setFilter(k as DetailFilterKey, v ?? []));
          setActiveTab(tab);
        }} />
      )}

      {/* --.-.-.-.-.-.-.-MAIN CONTENT --.-.-.-.-.-.-.-*/}
      {activeTab !== 'mapa' && (
      <main className="max-w-screen-2xl mx-auto px-4 py-5 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1"><p className="font-semibold text-red-700 text-sm">Erro</p><p className="text-xs text-red-400 font-mono">{
              error.includes('timeout') || error.includes('upstream')
                ? 'Servidor sobrecarregado. Aguarde alguns segundos e clique em Retry.'
                : error
            }</p></div>
            <button onClick={handleRefresh} className="px-2.5 py-1 bg-red-500 text-white text-xs font-bold rounded">Retry</button>
          </div>
        )}

        {/* ---------- TAB: RESUMO ---------- */}
        {activeTab === 'resumo' && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {loading && !data
                ? [...Array(6)].map((_, i) => <div key={i} className="bg-white rounded-lg border border-[#E5E5E5] h-20 animate-pulse" />)
                : kpis && <>
                  <KpiCard label="Empenhado"    value={fmt(kpis.empenhado, 'currency')} icon={<DollarSign className="w-4 h-4" />} color="#118DFF" sub={fmt(kpis.total) + ' registros'} />
                  <KpiCard label="Liquidado"    value={fmt(kpis.liquidado, 'currency')} icon={<CheckCircle2 className="w-4 h-4" />} color="#1AAB40" sub={pctLiq.toFixed(1) + '% do empenhado'} />
                  <KpiCard label="Pago Total"   value={fmt(kpis.pago_total, 'currency')} icon={<TrendingUp className="w-4 h-4" />} color="#E66C37" sub={pctPago.toFixed(1) + '% do empenhado'} />
                  <KpiCard label="% Execução"   value={pctPago.toFixed(1) + '%'} icon={<BarChart3 className="w-4 h-4" />} color="#6B007B" sub="pago / empenhado" />
                  <KpiCard label="Municípios"   value={fmt(kpis.municipios)} icon={<MapPin className="w-4 h-4" />} color="#197278" sub={(data?.porDrs.length ?? 0) + ' DRS'} />
                  <KpiCard label="Registros"    value={fmt(kpis.total)} icon={<Database className="w-4 h-4" />} color="#744EC2" sub={availableAnos.length + ' anos'} />
                </>}
            </div>

            {/* Grupo Simplificado + Fonte Simplificada  - DESTAQUE */}
            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Grupo de Despesa */}
                <Card title="Grupo de Despesa" icon={<Layers className="w-4 h-4" />}>
                  <div className="flex items-start gap-6">
                    <div className="w-44 h-44 shrink-0">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <PieChart>
                          <Pie data={data.porGrupoSimpl} cx="50%" cy="50%" outerRadius={80} innerRadius={40}
                            dataKey="empenhado" nameKey="grupo_simpl" paddingAngle={3} strokeWidth={0}>
                            {data.porGrupoSimpl.map((g) => <Cell key={g.grupo_simpl} fill={GRUPO_COLORS[g.grupo_simpl] || '#A6A6A6'} />)}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 pt-2">
                      <DonutLegend data={data.porGrupoSimpl as unknown as Record<string,unknown>[]} nameKey="grupo_simpl" colors={GRUPO_COLORS} />
                      <div className="mt-3 pt-3 border-t border-[#F0F0F0]">
                        {data.porGrupoSimpl.map((g, i) => {
                          const tot = data.porGrupoSimpl.reduce((s, r) => s + r.empenhado, 0);
                          const w = tot > 0 ? (g.empenhado / tot) * 100 : 0;
                          return (
                            <div key={i} className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-[#666] w-20 shrink-0">{g.grupo_simpl}</span>
                              <div className="flex-1 h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: w + '%', background: GRUPO_COLORS[g.grupo_simpl] || '#A6A6A6' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Fonte de Recursos */}
                <Card title="Fonte de Recursos" icon={<Database className="w-4 h-4" />}>
                  <div className="flex items-start gap-6">
                    <div className="w-44 h-44 shrink-0">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <PieChart>
                          <Pie data={data.porFonteSimpl} cx="50%" cy="50%" outerRadius={80} innerRadius={40}
                            dataKey="empenhado" nameKey="fonte_simpl" paddingAngle={3} strokeWidth={0}>
                            {data.porFonteSimpl.map((f) => <Cell key={f.fonte_simpl} fill={FONTE_COLORS[f.fonte_simpl] || '#A6A6A6'} />)}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 pt-2">
                      <DonutLegend data={data.porFonteSimpl as unknown as Record<string,unknown>[]} nameKey="fonte_simpl" colors={FONTE_COLORS} />
                      <div className="mt-3 pt-3 border-t border-[#F0F0F0]">
                        {data.porFonteSimpl.map((f, i) => {
                          const tot = data.porFonteSimpl.reduce((s, r) => s + r.empenhado, 0);
                          const w = tot > 0 ? (f.empenhado / tot) * 100 : 0;
                          return (
                            <div key={i} className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-[#666] w-24 shrink-0">{f.fonte_simpl}</span>
                              <div className="flex-1 h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: w + '%', background: FONTE_COLORS[f.fonte_simpl] || '#A6A6A6' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Evolução Anual */}
            {data && data.porAno.length > 1 && (
              <Card title="Evolução Anual - Empenhado / Liquidado / Pago" icon={<TrendingUp className="w-4 h-4" />}>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <AreaChart data={data.porAno} margin={{ left: 10, right: 10, top: 4 }}>
                      <defs>
                        <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#118DFF" stopOpacity={0.15} /><stop offset="95%" stopColor="#118DFF" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gL" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1AAB40" stopOpacity={0.15} /><stop offset="95%" stopColor="#1AAB40" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#E66C37" stopOpacity={0.15} /><stop offset="95%" stopColor="#E66C37" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                      <XAxis dataKey="ano" tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#999' }} tickFormatter={fmtAxis} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#666' }} />
                      <Area type="monotone" dataKey="empenhado" name="Empenhado" stroke="#118DFF" fill="url(#gE)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="liquidado" name="Liquidado" stroke="#1AAB40" fill="url(#gL)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="pago_total" name="Pago Total" stroke="#E66C37" fill="url(#gP)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* DRS + Municípios resumo */}
            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Top 5 DRS  - Empenhado" icon={<MapPin className="w-4 h-4" />}
                  badge={<span className="text-[10px] font-bold text-[#118DFF] bg-blue-50 px-1.5 py-0.5 rounded">{data.porDrs.length}</span>}>
                  <HGroupedBarChart data={data.porDrs.slice(0,5) as unknown as Record<string,unknown>[]} yKey="drs" series={S3} height={220} />
                </Card>
                <Card title="Top 5 Municípios - Empenhado" icon={<Building2 className="w-4 h-4" />}
                  badge={<span className="text-[10px] font-bold text-[#1AAB40] bg-green-50 px-1.5 py-0.5 rounded">{data.porMunic.length}</span>}>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <BarChart data={data.porMunic.slice(0,5)} margin={{ left: 6, right: 10, top: 2 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                        <XAxis dataKey="municipio" tick={{ fontSize: 10, fill: '#999' }} angle={-30} textAnchor="end" height={50} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#999' }} tickFormatter={fmtAxis} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="empenhado" name="Empenhado" radius={[4,4,0,0]} maxBarSize={36}>
                          {data.porMunic.slice(0,5).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            )}

            {/* Grupo detalhado + Fonte detalhada */}
            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Top 5 Grupos Detalhados  - Emp. vs Liq. vs Pago" icon={<BarChart3 className="w-4 h-4" />}>
                  <HGroupedBarChart
                    data={data.porGrupo.slice(0,5) as unknown as Record<string,unknown>[]}
                    yKey="grupo_despesa"
                    series={S3}
                    height={220}
                  />
                </Card>
                <Card title="Top 5 Fontes Detalhadas  - Empenhado" icon={<Database className="w-4 h-4" />}>
                  <HGroupedBarChart data={data.porFonte.slice(0,5) as unknown as Record<string,unknown>[]} yKey="fonte_recurso" series={S2} height={200} />
                </Card>
              </div>
            )}

            {/* Elemento + UO */}
            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Top 5 Elementos  - Empenhado" icon={<Database className="w-4 h-4" />}>
                  <HGroupedBarChart data={data.porElemento.slice(0,5) as unknown as Record<string,unknown>[]} yKey="elemento" series={S2} height={200} />
                </Card>
                <Card title="Top 5 UO  - Empenhado" icon={<Building2 className="w-4 h-4" />}>
                  <HGroupedBarChart data={data.porUo.slice(0,5) as unknown as Record<string,unknown>[]} yKey="uo" series={S3} height={220} />
                </Card>
              </div>
            )}

            {/* RRAS + Região Administrativa */}
            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Top 5 RRAS  - Empenhado" icon={<Layers className="w-4 h-4" />}>
                  <HGroupedBarChart data={data.porRras.slice(0,5) as unknown as Record<string,unknown>[]} yKey="rras" series={S3} height={220} />
                </Card>
                <Card title="Top 5 Região Administrativa  - Empenhado" icon={<Globe className="w-4 h-4" />}>
                  <HGroupedBarChart data={data.porRegiaoAd.slice(0,5) as unknown as Record<string,unknown>[]} yKey="regiao_ad" series={S2} height={200} />
                </Card>
              </div>
            )}

            {/* Região de Saúde + Tipo Despesa */}
            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Top 5 Região de Saúde  - Empenhado" icon={<MapPin className="w-4 h-4" />}>
                  <HGroupedBarChart data={data.porRegiaoSa.slice(0,5) as unknown as Record<string,unknown>[]} yKey="regiao_sa" series={S2} height={200} />
                </Card>
                <Card title="Top 5 Tipo de Despesa  - Empenhado" icon={<BarChart3 className="w-4 h-4" />}>
                  <HGroupedBarChart data={data.porTipoDespesa.slice(0,5) as unknown as Record<string,unknown>[]} yKey="tipo_despesa" series={S3} height={220} />
                </Card>
              </div>
            )}

            {/* UG */}
            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Top 5 UG  - Empenhado" icon={<Building2 className="w-4 h-4" />}>
                  <HGroupedBarChart data={data.porUg.slice(0,5) as unknown as Record<string,unknown>[]} yKey="ug" series={S2} height={200} />
                </Card>
                <Card title="Top 5 Projetos  - Empenhado" icon={<Layers className="w-4 h-4" />}>
                  <HGroupedBarChart data={data.porProjeto.slice(0,5) as unknown as Record<string,unknown>[]} yKey="projeto" series={S2} height={200} />
                </Card>
              </div>
            )}

            {/* Favorecido + Projeto */}
            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Top 5 Favorecidos  - Empenhado" icon={<Users className="w-4 h-4" />}>
                  <HGroupedBarChart data={data.porFavorecido.slice(0,5) as unknown as Record<string,unknown>[]} yKey="favorecido" series={S2} height={200} />
                </Card>
                <Card title="Top 5 Rótulos — Empenhado" icon={<Layers className="w-4 h-4" />}>
                  <HGroupedBarChart data={data.porRotulo.slice(0,5) as unknown as Record<string,unknown>[]} yKey="rotulo" series={S2} height={200} />
                </Card>
              </div>
            )}
          </>
        )}

        {/* ---------- TAB: REGIONAL ---------- */}
        {activeTab === 'regional' && data && (() => {
          const totalEmpDrs = data.porDrs.reduce((s, r) => s + r.empenhado, 0);
          const avgExecDrs = data.porDrs.length > 0
            ? data.porDrs.reduce((s, r) => s + (r.empenhado > 0 ? r.pago_total / r.empenhado : 0), 0) / data.porDrs.length * 100
            : 0;
          const topDrs = [...data.porDrs].sort((a, b) => b.empenhado - a.empenhado)[0];
          const worstExecDrs = [...data.porDrs].filter(r => r.empenhado > 0).sort((a, b) => (a.pago_total / a.empenhado) - (b.pago_total / b.empenhado))[0];
          const bestExecDrs = [...data.porDrs].filter(r => r.empenhado > 0).sort((a, b) => (b.pago_total / b.empenhado) - (a.pago_total / a.empenhado))[0];
          const drsExecData = data.porDrs.map(r => ({
            ...r,
            pct_exec: r.empenhado > 0 ? Math.round(r.pago_total / r.empenhado * 100) : 0,
            gap: r.empenhado - r.pago_total,
          }));
          const municTop10 = data.porMunic.slice(0, 10);
          const totalMunic = data.porMunic.reduce((s, r) => s + r.empenhado, 0);
          // Pareto: top 20% DRS share
          const drsCount = data.porDrs.length;
          const top20pctDrs = Math.max(1, Math.round(drsCount * 0.2));
          const top20empSum = [...data.porDrs].sort((a,b)=>b.empenhado-a.empenhado).slice(0,top20pctDrs).reduce((s,r)=>s+r.empenhado,0);
          const concentracao = totalEmpDrs > 0 ? (top20empSum / totalEmpDrs * 100) : 0;

          return (
            <>
              {/* KPIs regionais */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">DRS com mais recursos</p>
                  <p className="font-bold text-[#118DFF] text-sm truncate">{topDrs?.drs?.replace(/^DRS \d+ - /, '') ?? '-'}</p>
                  <p className="text-[11px] text-[#666] mt-0.5">{fmt(topDrs?.empenhado ?? 0, 'compact')}</p>
                </div>
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Execução média DRS</p>
                  <p className="font-bold text-[22px] leading-none" style={{ color: avgExecDrs >= 70 ? '#1AAB40' : avgExecDrs >= 40 ? '#D9B300' : '#D64550' }}>{avgExecDrs.toFixed(1)}%</p>
                  <p className="text-[11px] text-[#999] mt-0.5">pago / empenhado</p>
                </div>
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Melhor execução</p>
                  <p className="font-bold text-[#1AAB40] text-sm truncate">{bestExecDrs?.drs?.replace(/^DRS \d+ - /, '') ?? '-'}</p>
                  <p className="text-[11px] text-[#666] mt-0.5">{bestExecDrs ? (bestExecDrs.pago_total / bestExecDrs.empenhado * 100).toFixed(1) : 0}%</p>
                </div>
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Menor execução</p>
                  <p className="font-bold text-[#D64550] text-sm truncate">{worstExecDrs?.drs?.replace(/^DRS \d+ - /, '') ?? '-'}</p>
                  <p className="text-[11px] text-[#666] mt-0.5">{worstExecDrs ? (worstExecDrs.pago_total / worstExecDrs.empenhado * 100).toFixed(1) : 0}%</p>
                </div>
              </div>

              {/* Taxa de execução por DRS - heatmap horizontal */}
              <Card title="Taxa de Execução por DRS  (Pago / Empenhado)" icon={<BarChart3 className="w-4 h-4" />}
                badge={<span className="text-[10px] text-[#999] bg-[#F0F0F0] px-1.5 py-0.5 rounded font-semibold">Concentração top-20%: {concentracao.toFixed(0)}%</span>}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr>
                      <th className="text-left text-[10px] font-bold text-[#999] uppercase pb-2 pr-3">DRS</th>
                      <th className="text-right text-[10px] font-bold text-[#118DFF] uppercase pb-2 px-3 w-36">Empenhado</th>
                      <th className="text-right text-[10px] font-bold text-[#E66C37] uppercase pb-2 px-3 w-32">Pago Total</th>
                      <th className="text-right text-[10px] font-bold text-[#999] uppercase pb-2 px-3 w-20">Exec.</th>
                      <th className="text-[10px] font-bold text-[#999] uppercase pb-2 pl-3">Barra de Execução</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[#F7F7F7]">
                      {drsExecData.sort((a, b) => b.pct_exec - a.pct_exec).map((row, i) => {
                        const color = row.pct_exec >= 80 ? '#1AAB40' : row.pct_exec >= 50 ? '#D9B300' : '#D64550';
                        const shareW = totalEmpDrs > 0 ? (row.empenhado / totalEmpDrs) * 100 : 0;
                        return (
                          <tr key={i} className="hover:bg-blue-50/20">
                            <td className="py-1.5 pr-3 text-[11px] font-medium text-[#333] whitespace-nowrap">{row.drs.replace(/^DRS \d+ - /, '')}</td>
                            <td className="py-1.5 px-3 text-right font-mono text-[11px] text-[#118DFF]">{fmt(row.empenhado, 'compact')}</td>
                            <td className="py-1.5 px-3 text-right font-mono text-[11px] text-[#E66C37]">{fmt(row.pago_total, 'compact')}</td>
                            <td className="py-1.5 px-3 text-right">
                              <span className="text-[11px] font-bold" style={{ color }}>{row.pct_exec}%</span>
                            </td>
                            <td className="py-1.5 pl-3 w-full min-w-[180px]">
                              <div className="relative h-4 bg-[#F0F0F0] rounded overflow-hidden">
                                <div className="absolute top-0 left-0 h-full rounded opacity-20 bg-blue-400" style={{ width: shareW + '%' }} />
                                <div className="absolute top-0 left-0 h-full rounded" style={{ width: row.pct_exec + '%', background: color, opacity: 0.85 }} />
                                <span className="absolute inset-0 flex items-center pl-1.5 text-[9px] font-bold text-white drop-shadow">{row.pct_exec}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* DRS empenhado vs gap (não pago) — stacked */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Empenhado vs Pago por DRS  (Gap em vermelho)" icon={<MapPin className="w-4 h-4" />}>
                  <div style={{ height: 320 }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <BarChart data={drsExecData.sort((a,b)=>b.empenhado-a.empenhado)} layout="vertical"
                        margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F0F0F0" />
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#999' }} tickFormatter={fmtAxis} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="drs" width={130} axisLine={false} tickLine={false}
                          tick={{ fontSize: 10, fill: '#555' }} tickFormatter={v => shortLabel(String(v).replace(/^DRS \d+ - /, ''), 17)} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="pago_total" name="Pago Total" fill="#1AAB40" radius={[0,0,0,0]} stackId="a" maxBarSize={16} />
                        <Bar dataKey="gap" name="Não Pago" fill="#D6455080" radius={[0,3,3,0]} stackId="a" maxBarSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* Top 10 municípios com share */}
                <Card title="Top 10 Municípios por Empenhado" icon={<Building2 className="w-4 h-4" />}
                  badge={<span className="text-[10px] text-[#999] bg-[#F0F0F0] px-1.5 py-0.5 rounded font-semibold">{data.porMunic.length} municípios</span>}>
                  <div className="flex flex-col gap-1.5 mt-1">
                    {municTop10.map((m, i) => {
                      const share = totalMunic > 0 ? (m.empenhado / totalMunic) * 100 : 0;
                      const pctPg = m.empenhado > 0 ? (m.pago_total / m.empenhado) * 100 : 0;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] text-[#999] font-mono w-4 shrink-0">{i+1}</span>
                          <span className="text-[11px] font-medium text-[#333] w-28 shrink-0 truncate">{m.municipio}</span>
                          <div className="flex-1 relative h-5 bg-[#F0F0F0] rounded overflow-hidden">
                            <div className="absolute top-0 left-0 h-full bg-blue-400 opacity-30 rounded" style={{ width: share + '%' }} />
                            <div className="absolute top-0 left-0 h-full bg-[#1AAB40] opacity-70 rounded" style={{ width: Math.min(pctPg, 100) * share / 100 + '%' }} />
                            <span className="absolute inset-0 flex items-center pl-1.5 text-[9px] font-bold text-[#333]">{fmt(m.empenhado, 'compact')} · {share.toFixed(1)}%</span>
                          </div>
                          <span className="text-[10px] font-bold w-10 text-right shrink-0" style={{ color: pctPg >= 70 ? '#1AAB40' : '#D9B300' }}>{pctPg.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>

              {/* RRAS + Região de Saúde side by side - full */}
              {(data.porRras.length > 0 || data.porRegiaoSa.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {data.porRras.length > 0 && (
                    <Card title="RRAS — Empenhado / Liquidado / Pago" icon={<Layers className="w-4 h-4" />}
                      badge={<span className="text-[10px] font-bold text-[#197278] bg-teal-50 px-1.5 py-0.5 rounded">{data.porRras.length}</span>}>
                      <HGroupedBarChart data={data.porRras as unknown as Record<string,unknown>[]} yKey="rras" series={S3}
                        height={Math.max(200, data.porRras.length * 40)} />
                    </Card>
                  )}
                  {data.porRegiaoSa.length > 0 && (
                    <Card title="Regiões de Saúde — Empenhado / Pago" icon={<MapPin className="w-4 h-4" />}
                      badge={<span className="text-[10px] font-bold text-[#D64550] bg-red-50 px-1.5 py-0.5 rounded">{data.porRegiaoSa.length}</span>}>
                      <HGroupedBarChart data={data.porRegiaoSa as unknown as Record<string,unknown>[]} yKey="regiao_sa" series={S2}
                        height={Math.max(200, data.porRegiaoSa.length * 40)} />
                    </Card>
                  )}
                </div>
              )}

              {/* Ranking DRS completo com semáforo */}
              <Card title="Ranking Completo de DRS" noPad icon={<BarChart3 className="w-4 h-4" />}
                badge={<span className="text-[10px] text-[#999] bg-[#F0F0F0] px-1.5 py-0.5 rounded font-semibold">{data.porDrs.length} DRS</span>}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#FAFAFA] border-b border-[#E5E5E5]">
                      <th className="w-8 px-3 py-2.5 text-[10px] font-bold text-[#999] uppercase">#</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-bold text-[#999] uppercase">DRS</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold text-[#118DFF] uppercase">Empenhado</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold text-[#1AAB40] uppercase">Liquidado</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold text-[#E66C37] uppercase">Pago Total</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold text-[#999] uppercase">Gap (R$)</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold text-[#999] uppercase">% Exec.</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-[#999] uppercase hidden md:table-cell">Participação</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[#F0F0F0]">
                      {[...data.porDrs].sort((a,b)=>b.empenhado-a.empenhado).map((row, i) => {
                        const pct = row.empenhado > 0 ? (row.pago_total / row.empenhado) * 100 : 0;
                        const barW = totalEmpDrs > 0 ? (row.empenhado / totalEmpDrs) * 100 : 0;
                        const gap = row.empenhado - row.pago_total;
                        const color = pct >= 80 ? '#1AAB40' : pct >= 50 ? '#D9B300' : '#D64550';
                        return (
                          <tr key={i} className="hover:bg-blue-50/30">
                            <td className="px-3 py-2 text-xs text-[#CCC] font-mono">{i + 1}</td>
                            <td className="px-3 py-2 font-semibold text-[#333] text-[12px]">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} title={pct >= 80 ? 'Alta execução' : pct >= 50 ? 'Execução média' : 'Baixa execução'} />
                                {row.drs}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-[#118DFF] text-[12px]">{fmt(row.empenhado, 'currency')}</td>
                            <td className="px-3 py-2 text-right font-mono text-[#1AAB40] text-[12px]">{fmt(row.liquidado, 'currency')}</td>
                            <td className="px-3 py-2 text-right font-mono text-[#E66C37] text-[12px]">{fmt(row.pago_total, 'currency')}</td>
                            <td className="px-3 py-2 text-right font-mono text-[#D64550] text-[12px]">{fmt(gap, 'currency')}</td>
                            <td className="px-3 py-2 text-right">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: color + '18', color }}>{pct.toFixed(1)}%</span>
                            </td>
                            <td className="px-3 py-2 hidden md:table-cell">
                              <div className="flex items-center gap-1.5">
                                <div className="w-24 h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                                  <div className="h-full rounded-full bg-[#118DFF]" style={{ width: barW + '%' }} />
                                </div>
                                <span className="text-[10px] text-[#999]">{barW.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {kpis && (
                      <tfoot><tr className="bg-[#1B1B1B] text-white">
                        <td className="px-3 py-2.5" colSpan={2}><span className="text-[10px] font-bold text-[#888]">TOTAL</span></td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-blue-300">{fmt(kpis.empenhado, 'currency')}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-green-300">{fmt(kpis.liquidado, 'currency')}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-orange-300">{fmt(kpis.pago_total, 'currency')}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-red-300">{fmt(kpis.empenhado - kpis.pago_total, 'currency')}</td>
                        <td className="px-3 py-2.5 text-right font-bold">{kpis.empenhado > 0 ? ((kpis.pago_total / kpis.empenhado) * 100).toFixed(1) : '0'}%</td>
                        <td className="hidden md:table-cell" />
                      </tr></tfoot>
                    )}
                  </table>
                </div>
              </Card>
            </>
          );
        })()}

        {/* ---------- TAB: DESPESAS ---------- */}
        {activeTab === 'despesas' && data && (() => {
          const totalEmpElem = data.porElemento.reduce((s, r) => s + r.empenhado, 0);
          const totalEmpGrupo = data.porGrupo.reduce((s, r) => s + r.empenhado, 0);
          const elemExecData = data.porElemento.map(r => ({
            ...r,
            pct_exec: r.empenhado > 0 ? Math.round(r.pago_total / r.empenhado * 100) : 0,
            gap: r.empenhado - r.pago_total,
            share: totalEmpElem > 0 ? r.empenhado / totalEmpElem * 100 : 0,
          }));
          // Execução por grupo detalhado
          const grupoExec = data.porGrupo.map(r => ({
            ...r,
            pct_exec: r.empenhado > 0 ? r.pago_total / r.empenhado * 100 : 0,
            liq_pct: r.empenhado > 0 ? r.liquidado / r.empenhado * 100 : 0,
            gap: r.empenhado - r.pago_total,
          })).sort((a, b) => b.empenhado - a.empenhado);
          const globalExec = kpis && kpis.empenhado > 0 ? kpis.pago_total / kpis.empenhado * 100 : 0;
          const globalLiq = kpis && kpis.empenhado > 0 ? kpis.liquidado / kpis.empenhado * 100 : 0;
          const topElem = elemExecData.sort((a, b) => b.empenhado - a.empenhado)[0];
          const worstElem = elemExecData.filter(r => r.empenhado > 0).sort((a, b) => a.pct_exec - b.pct_exec)[0];

          return (
            <>
              {/* KPIs despesas */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Taxa Liquidação</p>
                  <p className="text-[22px] font-bold leading-none" style={{ color: globalLiq >= 70 ? '#1AAB40' : globalLiq >= 40 ? '#D9B300' : '#D64550' }}>{globalLiq.toFixed(1)}%</p>
                  <p className="text-[11px] text-[#999] mt-0.5">liquidado / empenhado</p>
                </div>
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Taxa Execução</p>
                  <p className="text-[22px] font-bold leading-none" style={{ color: globalExec >= 70 ? '#1AAB40' : globalExec >= 40 ? '#D9B300' : '#D64550' }}>{globalExec.toFixed(1)}%</p>
                  <p className="text-[11px] text-[#999] mt-0.5">pago / empenhado</p>
                </div>
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Maior elemento</p>
                  <p className="text-[12px] font-bold text-[#118DFF] truncate">{stripNumPrefix(topElem?.elemento ?? '-')}</p>
                  <p className="text-[11px] text-[#666] mt-0.5">{fmt(topElem?.share, 'number') ? topElem.share.toFixed(1) + '% do total' : '-'}</p>
                </div>
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Elemento c/ menor exec.</p>
                  <p className="text-[12px] font-bold text-[#D64550] truncate">{stripNumPrefix(worstElem?.elemento ?? '-')}</p>
                  <p className="text-[11px] text-[#666] mt-0.5">{worstElem ? worstElem.pct_exec + '% execução' : '-'}</p>
                </div>
              </div>

              {/* Funil de execução Emp → Liq → Pago */}
              <Card title="Funil de Execução Orçamentária" icon={<TrendingUp className="w-4 h-4" />}
                badge={<span className="text-[10px] text-[#999] bg-[#F0F0F0] px-1.5 py-0.5 rounded font-semibold">Valores globais do filtro</span>}>
                <div className="flex flex-col gap-2 mt-1">
                  {kpis && (() => {
                    const stages = [
                      { label: 'Empenhado', value: kpis.empenhado, color: '#118DFF', pct: 100 },
                      { label: 'Liquidado', value: kpis.liquidado, color: '#1AAB40', pct: kpis.empenhado > 0 ? kpis.liquidado / kpis.empenhado * 100 : 0 },
                      { label: 'Pago Total', value: kpis.pago_total, color: '#E66C37', pct: kpis.empenhado > 0 ? kpis.pago_total / kpis.empenhado * 100 : 0 },
                    ];
                    return stages.map((s, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-[11px] font-semibold text-[#555] w-24 shrink-0">{s.label}</span>
                        <div className="flex-1 relative h-8 bg-[#F0F0F0] rounded overflow-hidden">
                          <div className="absolute top-0 left-0 h-full rounded transition-all" style={{ width: s.pct + '%', background: s.color, opacity: 0.82 }} />
                          <div className="absolute inset-0 flex items-center px-3 justify-between">
                            <span className="text-[11px] font-bold text-white drop-shadow">{fmt(s.value, 'compact')}</span>
                            <span className="text-[10px] font-bold text-white drop-shadow">{s.pct.toFixed(1)}%</span>
                          </div>
                        </div>
                        {i < stages.length - 1 && (
                          <span className="text-[10px] text-[#999] w-20 text-right shrink-0">
                            ▼ {i === 0
                              ? (kpis.empenhado > 0 ? ((kpis.empenhado - kpis.liquidado) / kpis.empenhado * 100).toFixed(1) : '0') + '% não liq.'
                              : (kpis.liquidado > 0 ? ((kpis.liquidado - kpis.pago_total) / kpis.liquidado * 100).toFixed(1) : '0') + '% não pago'}
                          </span>
                        )}
                        {i === stages.length - 1 && (
                          <span className="text-[10px] text-[#D64550] font-bold w-20 text-right shrink-0">
                            Gap: {fmt(kpis.empenhado - kpis.pago_total, 'compact')}
                          </span>
                        )}
                      </div>
                    ));
                  })()}
                </div>
              </Card>

              {/* Grupos + Elementos grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Grupo detalhado com barra de execução */}
                <Card title="Grupos de Despesa — Análise de Execução" icon={<Layers className="w-4 h-4" />}>
                  <div className="flex flex-col gap-2 mt-1">
                    {grupoExec.map((g, i) => {
                      const color = g.pct_exec >= 80 ? '#1AAB40' : g.pct_exec >= 50 ? '#D9B300' : '#D64550';
                      const shareW = totalEmpGrupo > 0 ? (g.empenhado / totalEmpGrupo) * 100 : 0;
                      return (
                        <div key={i} className="bg-[#FAFAFA] rounded-lg p-2.5 border border-[#F0F0F0]">
                          <div className="flex items-start justify-between mb-1.5">
                            <span className="text-[11px] font-semibold text-[#333] flex-1 pr-2">{stripNumPrefix(g.grupo_despesa)}</span>
                            <span className="text-[11px] font-bold shrink-0" style={{ color }}>{g.pct_exec.toFixed(1)}%</span>
                          </div>
                          <div className="flex gap-2 items-center text-[10px] text-[#999] mb-1.5">
                            <span className="text-[#118DFF] font-semibold">{fmt(g.empenhado, 'compact')}</span>
                            <span>·</span>
                            <span className="text-[#1AAB40]">Liq {g.liq_pct.toFixed(0)}%</span>
                            <span>·</span>
                            <span className="text-[#D64550]">Gap {fmt(g.gap, 'compact')}</span>
                          </div>
                          <div className="relative h-2.5 bg-[#EBEBEB] rounded overflow-hidden">
                            <div className="absolute top-0 left-0 h-full bg-blue-200 rounded" style={{ width: shareW + '%' }} />
                            <div className="absolute top-0 left-0 h-full rounded" style={{ width: Math.min(g.pct_exec, 100) + '%', background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Elemento — share + execução */}
                <Card title="Top 10 Elementos — Share + Execução" icon={<Database className="w-4 h-4" />}>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr>
                        <th className="text-left text-[10px] font-bold text-[#999] uppercase pb-2 pr-2">Elemento</th>
                        <th className="text-right text-[10px] font-bold text-[#118DFF] uppercase pb-2 px-2 w-24">Valor</th>
                        <th className="text-right text-[10px] font-bold text-[#999] uppercase pb-2 px-2 w-16">Share</th>
                        <th className="text-right text-[10px] font-bold text-[#E66C37] uppercase pb-2 pl-2 w-16">Exec.</th>
                      </tr></thead>
                      <tbody className="divide-y divide-[#F7F7F7]">
                        {elemExecData.sort((a,b)=>b.empenhado-a.empenhado).slice(0,10).map((e, i) => {
                          const c = e.pct_exec >= 80 ? '#1AAB40' : e.pct_exec >= 50 ? '#D9B300' : '#D64550';
                          return (
                            <tr key={i} className="hover:bg-blue-50/20">
                              <td className="py-1.5 pr-2">
                                <div className="text-[11px] font-medium text-[#333] truncate max-w-[180px]">{stripNumPrefix(e.elemento)}</div>
                                <div className="mt-0.5 h-1.5 bg-[#F0F0F0] rounded overflow-hidden">
                                  <div className="h-full bg-blue-300 rounded" style={{ width: e.share + '%' }} />
                                </div>
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono text-[11px] text-[#118DFF]">{fmt(e.empenhado, 'compact')}</td>
                              <td className="py-1.5 px-2 text-right text-[11px] text-[#666]">{e.share.toFixed(1)}%</td>
                              <td className="py-1.5 pl-2 text-right text-[11px] font-bold" style={{ color: c }}>{e.pct_exec}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              {/* UO + UG comparativo */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Unidades Orçamentárias — Emp / Liq / Pago (completo)" icon={<Building2 className="w-4 h-4" />}>
                  <HGroupedBarChart data={data.porUo as unknown as Record<string,unknown>[]} yKey="uo" series={S3}
                    height={Math.max(220, data.porUo.length * 45)} />
                </Card>
                <Card title="Projetos / Atividades — Emp / Pago (completo)" icon={<Briefcase className="w-4 h-4" />}>
                  <HGroupedBarChart data={data.porProjeto.slice(0,15) as unknown as Record<string,unknown>[]} yKey="projeto" series={S2}
                    height={Math.max(220, Math.min(data.porProjeto.length, 15) * 45)} />
                </Card>
              </div>

              {/* Tipo de Despesa + Rótulo */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Tipo de Despesa — Execução detalhada" icon={<Briefcase className="w-4 h-4" />}>
                  {data.porTipoDespesa.length > 0 ? (
                    <div className="flex flex-col gap-2.5">
                      {data.porTipoDespesa.map((t, i) => {
                        const tot = data.porTipoDespesa.reduce((s, r) => s + r.empenhado, 0);
                        const pctShare = tot > 0 ? t.empenhado / tot * 100 : 0;
                        const pctExec = t.empenhado > 0 ? t.pago_total / t.empenhado * 100 : 0;
                        const pctLiq2 = t.empenhado > 0 ? t.liquidado / t.empenhado * 100 : 0;
                        const c = pctExec >= 80 ? '#1AAB40' : pctExec >= 50 ? '#D9B300' : '#D64550';
                        return (
                          <div key={i} className="p-2.5 bg-[#FAFAFA] rounded-lg border border-[#F0F0F0]">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CHART_COLORS[(i+4) % CHART_COLORS.length] }} />
                                <span className="text-[11px] font-semibold text-[#333]">{stripNumPrefix(t.tipo_despesa)}</span>
                              </div>
                              <span className="text-[10px] font-bold" style={{ color: c }}>{pctExec.toFixed(1)}%</span>
                            </div>
                            <div className="flex gap-3 text-[10px] text-[#999] mb-1.5">
                              <span className="text-[#118DFF]">{fmt(t.empenhado, 'compact')}</span>
                              <span>Liq: <b className="text-[#1AAB40]">{pctLiq2.toFixed(0)}%</b></span>
                              <span>Share: <b>{pctShare.toFixed(1)}%</b></span>
                            </div>
                            <div className="relative h-2 bg-[#EBEBEB] rounded overflow-hidden">
                              <div className="absolute h-full bg-blue-200 rounded" style={{ width: pctShare + '%' }} />
                              <div className="absolute h-full rounded" style={{ width: pctExec + '%', background: c, opacity: 0.8 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : <div className="text-center text-[#CCC] py-6"><Database className="w-6 h-6 mx-auto" /></div>}
                </Card>

                {/* Rótulo LC 131 */}
                <Card title="Rótulo LC 131 — Execução detalhada" icon={<Layers className="w-4 h-4" />}>
                  {data.porRotulo.length > 0 ? (
                    <div className="flex flex-col gap-2.5">
                      {data.porRotulo.map((t, i) => {
                        const tot = data.porRotulo.reduce((s, r) => s + r.empenhado, 0);
                        const pctShare = tot > 0 ? t.empenhado / tot * 100 : 0;
                        const pctExec = t.empenhado > 0 ? t.pago_total / t.empenhado * 100 : 0;
                        const c = pctExec >= 80 ? '#1AAB40' : pctExec >= 50 ? '#D9B300' : '#D64550';
                        return (
                          <div key={i} className="p-2.5 bg-[#FAFAFA] rounded-lg border border-[#F0F0F0]">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                <span className="text-[11px] font-semibold text-[#333]">{t.rotulo || '(sem rótulo)'}</span>
                              </div>
                              <span className="text-[10px] font-bold" style={{ color: c }}>{pctExec.toFixed(1)}%</span>
                            </div>
                            <div className="flex gap-3 text-[10px] text-[#999] mb-1.5">
                              <span className="text-[#118DFF]">{fmt(t.empenhado, 'compact')}</span>
                              <span>Share: <b>{pctShare.toFixed(1)}%</b></span>
                            </div>
                            <div className="relative h-2 bg-[#EBEBEB] rounded overflow-hidden">
                              <div className="absolute h-full bg-blue-200 rounded" style={{ width: pctShare + '%' }} />
                              <div className="absolute h-full rounded" style={{ width: pctExec + '%', background: c, opacity: 0.8 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : <div className="text-center text-[#CCC] py-6"><Database className="w-6 h-6 mx-auto" /></div>}
                </Card>
              </div>

              {/* Tabela full de elementos */}
              <Card title="Tabela Completa — Elementos de Despesa" noPad icon={<Table2 className="w-4 h-4" />}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#FAFAFA] border-b border-[#E5E5E5]">
                      <th className="w-8 px-3 py-2.5 text-[10px] font-bold text-[#999]">#</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-bold text-[#999] uppercase">Elemento</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold text-[#118DFF] uppercase">Empenhado</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold text-[#E66C37] uppercase">Pago Total</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold text-[#999] uppercase">Share</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold text-[#999] uppercase">Exec.</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-[#999] uppercase hidden md:table-cell">Barra</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[#F0F0F0]">
                      {elemExecData.sort((a,b)=>b.empenhado-a.empenhado).map((e, i) => {
                        const c = e.pct_exec >= 80 ? '#1AAB40' : e.pct_exec >= 50 ? '#D9B300' : '#D64550';
                        return (
                          <tr key={i} className="hover:bg-blue-50/30">
                            <td className="px-3 py-2 text-xs text-[#CCC] font-mono">{i + 1}</td>
                            <td className="px-3 py-2 text-[#333] text-[12px] max-w-xs truncate" title={e.elemento}>{stripNumPrefix(e.elemento)}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-[#118DFF] text-[12px]">{fmt(e.empenhado, 'currency')}</td>
                            <td className="px-3 py-2 text-right font-mono text-[#E66C37] text-[12px]">{fmt(e.pago_total, 'currency')}</td>
                            <td className="px-3 py-2 text-right text-[12px] text-[#666]">{e.share.toFixed(1)}%</td>
                            <td className="px-3 py-2 text-right">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: c + '18', color: c }}>{e.pct_exec}%</span>
                            </td>
                            <td className="px-3 py-2 hidden md:table-cell">
                              <div className="relative w-32 h-2 bg-[#F0F0F0] rounded overflow-hidden">
                                <div className="absolute h-full bg-blue-200" style={{ width: e.share + '%' }} />
                                <div className="absolute h-full rounded" style={{ width: e.pct_exec + '%', background: c, opacity: 0.7 }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          );
        })()}

        {/* ---------- TAB: FORNECEDORES ---------- */}
        {activeTab === 'fornecedores' && data && (() => {
          const totalFav = data.porFavorecido.reduce((s, r) => s + r.empenhado, 0);
          const sorted = [...data.porFavorecido].sort((a, b) => b.empenhado - a.empenhado);
          // Concentração: top 5 vs resto
          const top5Sum = sorted.slice(0, 5).reduce((s, r) => s + r.empenhado, 0);
          const top10Sum = sorted.slice(0, 10).reduce((s, r) => s + r.empenhado, 0);
          const concentracao5 = totalFav > 0 ? top5Sum / totalFav * 100 : 0;
          const concentracao10 = totalFav > 0 ? top10Sum / totalFav * 100 : 0;
          // Pareto acumulado
          let cumSum = 0;
          const paretoData = sorted.map(r => {
            cumSum += r.empenhado;
            return { ...r, cumPct: totalFav > 0 ? cumSum / totalFav * 100 : 0 };
          });
          // Faixas de valor para segmentação
          const faixas = [
            { label: '> R$50M', min: 50e6, color: '#118DFF' },
            { label: 'R$10M–50M', min: 10e6, max: 50e6, color: '#1AAB40' },
            { label: 'R$1M–10M', min: 1e6, max: 10e6, color: '#D9B300' },
            { label: 'R$100k–1M', min: 100e3, max: 1e6, color: '#E66C37' },
            { label: '< R$100k', min: 0, max: 100e3, color: '#D64550' },
          ];
          const segData = faixas.map(f => ({
            ...f,
            count: sorted.filter(r => r.empenhado >= f.min && (f.max === undefined || r.empenhado < f.max)).length,
            total: sorted.filter(r => r.empenhado >= f.min && (f.max === undefined || r.empenhado < f.max)).reduce((s, r) => s + r.empenhado, 0),
          }));
          const avgContratos = sorted.length > 0 ? sorted.reduce((s, r) => s + r.contratos, 0) / sorted.length : 0;
          const topFav = sorted[0];
          const maxContratos = sorted.reduce((m, r) => r.contratos > m.contratos ? r : m, sorted[0] ?? { favorecido: '-', contratos: 0 });

          return (
            <>
              {/* KPIs fornecedores */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Concentração Top 5</p>
                  <p className="text-[22px] font-bold leading-none text-[#118DFF]">{concentracao5.toFixed(1)}%</p>
                  <p className="text-[11px] text-[#999] mt-0.5">dos recursos</p>
                </div>
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Concentração Top 10</p>
                  <p className="text-[22px] font-bold leading-none" style={{ color: concentracao10 > 80 ? '#D64550' : '#1AAB40' }}>{concentracao10.toFixed(1)}%</p>
                  <p className="text-[11px] text-[#999] mt-0.5">dos recursos</p>
                </div>
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Maior favorecido</p>
                  <p className="text-[11px] font-bold text-[#118DFF] truncate">{stripNumPrefix(topFav?.favorecido ?? '-')}</p>
                  <p className="text-[11px] text-[#666] mt-0.5">{fmt(topFav?.empenhado ?? 0, 'compact')}</p>
                </div>
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Mais contratos</p>
                  <p className="text-[11px] font-bold text-[#6B007B] truncate">{stripNumPrefix(maxContratos?.favorecido ?? '-')}</p>
                  <p className="text-[11px] text-[#666] mt-0.5">{maxContratos?.contratos ?? 0} contratos · média {avgContratos.toFixed(0)}/forn.</p>
                </div>
              </div>

              {/* Mapa de calor Pareto + Segmentação */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Segmentação por faixa de valor */}
                <Card title="Segmentação de Fornecedores por Porte" icon={<Users className="w-4 h-4" />}>
                  <SegmentacaoFornecedores segData={segData} sorted={sorted} totalFav={totalFav} />
                </Card>

                {/* Curva de concentração (Pareto visual) */}
                <Card title="Curva de Pareto — Concentração de Recursos" icon={<TrendingUp className="w-4 h-4" />}
                  badge={<span className="text-[10px] text-[#999] bg-[#F0F0F0] px-1.5 py-0.5 rounded font-semibold">Top 5: {concentracao5.toFixed(1)}%</span>}>
                  <div className="flex flex-col gap-1.5 mt-1">
                    {/* Visual step chart showing cumulative % */}
                    {sorted.slice(0, 12).map((r, i) => {
                      const share = totalFav > 0 ? r.empenhado / totalFav * 100 : 0;
                      const cum = paretoData[i].cumPct;
                      const execPct = r.empenhado > 0 ? r.pago_total / r.empenhado * 100 : 0;
                      const c = execPct >= 80 ? '#1AAB40' : execPct >= 50 ? '#D9B300' : '#D64550';
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] text-[#999] font-mono w-4 shrink-0 text-right">{i+1}</span>
                          <div className="flex-1 relative h-5 bg-[#F0F0F0] rounded overflow-hidden">
                            <div className="absolute top-0 left-0 h-full bg-[#118DFF] opacity-25 rounded" style={{ width: cum + '%' }} />
                            <div className="absolute top-0 left-0 h-full bg-[#118DFF] rounded" style={{ width: share + '%', opacity: 0.7 }} />
                            <span className="absolute inset-0 flex items-center pl-1.5 text-[9px] font-semibold text-[#333] truncate max-w-[70%]">{stripNumPrefix(r.favorecido)}</span>
                          </div>
                          <span className="text-[10px] text-[#118DFF] font-bold w-12 text-right shrink-0">{share.toFixed(1)}%</span>
                          <span className="text-[10px] font-bold w-10 text-right shrink-0" style={{ color: c }}>{execPct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                    <div className="text-[10px] text-[#999] mt-1 flex justify-end gap-3">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#118DFF] opacity-25 inline-block" />% acum.</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#118DFF] opacity-70 inline-block" />share</span>
                      <span className="flex items-center gap-1"><b>%</b> exec.</span>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Gráfico top 15 */}
              <Card title="Top 15 Favorecidos — Empenhado / Pago" icon={<Users className="w-4 h-4" />}>
                <HGroupedBarChart data={sorted.slice(0,15) as unknown as Record<string,unknown>[]} yKey="favorecido" series={S2}
                  height={Math.max(300, 15 * 40)} />
              </Card>

              {/* Ranking completo com métricas */}
              <Card title="Ranking Completo de Favorecidos" noPad icon={<Table2 className="w-4 h-4" />}
                badge={<span className="text-[10px] text-[#999] bg-[#F0F0F0] px-1.5 py-0.5 rounded font-semibold">{sorted.length} fornecedores</span>}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[#FAFAFA] border-b border-[#E5E5E5]">
                      <th className="w-8 px-3 py-2.5 text-[10px] font-bold text-[#999]">#</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-bold text-[#999] uppercase">Favorecido</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold text-[#118DFF] uppercase">Empenhado</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold text-[#E66C37] uppercase">Pago Total</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold text-[#999] uppercase">Exec.</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold text-[#999] uppercase">Contratos</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-bold text-[#999] uppercase">Share</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-[#999] uppercase hidden md:table-cell">Barra</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[#F0F0F0]">
                      {sorted.map((row, i) => {
                        const execPct = row.empenhado > 0 ? row.pago_total / row.empenhado * 100 : 0;
                        const share = totalFav > 0 ? row.empenhado / totalFav * 100 : 0;
                        const c = execPct >= 80 ? '#1AAB40' : execPct >= 50 ? '#D9B300' : '#D64550';
                        const porte = row.empenhado >= 50e6 ? '🔵' : row.empenhado >= 10e6 ? '🟢' : row.empenhado >= 1e6 ? '🟡' : row.empenhado >= 100e3 ? '🟠' : '🔴';
                        return (
                          <tr key={i} className="hover:bg-blue-50/30">
                            <td className="px-3 py-2 text-xs text-[#CCC] font-mono">{i + 1}</td>
                            <td className="px-3 py-2 max-w-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px]" title="Porte">{porte}</span>
                                <span className="text-[#333] text-[12px] truncate" title={stripNumPrefix(row.favorecido)}>{stripNumPrefix(row.favorecido)}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-[#118DFF] text-[12px]">{fmt(row.empenhado, 'currency')}</td>
                            <td className="px-3 py-2 text-right font-mono text-[#E66C37] text-[12px]">{fmt(row.pago_total, 'currency')}</td>
                            <td className="px-3 py-2 text-right">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: c + '18', color: c }}>{execPct.toFixed(1)}%</span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-[#6B007B] text-[12px]">{fmt(row.contratos)}</td>
                            <td className="px-3 py-2 text-right text-[12px] text-[#999]">{share.toFixed(1)}%</td>
                            <td className="px-3 py-2 hidden md:table-cell">
                              <div className="w-28 h-2 bg-[#F0F0F0] rounded overflow-hidden">
                                <div className="h-full rounded bg-[#118DFF]" style={{ width: share + '%', opacity: 0.6 }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot><tr className="bg-[#1B1B1B] text-white">
                      <td className="px-3 py-2.5" colSpan={2}><span className="text-[10px] font-bold text-[#888]">TOTAL</span></td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-blue-300">{fmt(totalFav, 'currency')}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-orange-300">{fmt(sorted.reduce((s,r)=>s+r.pago_total,0), 'currency')}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-green-300">{totalFav > 0 ? (sorted.reduce((s,r)=>s+r.pago_total,0)/totalFav*100).toFixed(1) : '0'}%</td>
                      <td className="px-3 py-2.5 text-right font-mono text-purple-300">{fmt(sorted.reduce((s,r)=>s+r.contratos,0))}</td>
                      <td className="px-3 py-2.5 text-right text-[#888]">100%</td>
                      <td className="hidden md:table-cell" />
                    </tr></tfoot>
                  </table>
                </div>
              </Card>
            </>
          );
        })()}

        {/* ---------- TAB: DADOS ---------- */}
        {activeTab === 'dados' && (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#999]" />
                <input type="text" value={tableSearch} onChange={e => setTableSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadDetail(0, tableSearch)}
                  placeholder="Cód. UG + Enter..."
                  className="w-full pl-8 pr-3 py-2 text-xs border border-[#D0D0D0] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#118DFF] bg-white" />
              </div>
              <button onClick={exportCSV} disabled={!detailRows.length}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#1AAB40] text-white text-xs font-bold rounded-lg hover:bg-[#159033] disabled:opacity-40">
                <Download className="w-3.5 h-3.5" /> CSV (página)
              </button>
              <button onClick={downloadAllXlsx} disabled={xlsxLoading || detailTotal === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#217346] text-white text-xs font-bold rounded-lg hover:bg-[#1a5c38] disabled:opacity-40">
                {xlsxLoading ? <Spinner size={3} /> : <Download className="w-3.5 h-3.5" />}
                XLSX (todos)
              </button>
              <span className="text-xs text-[#999]">{detailLoading ? <Spinner size={3} /> : fmt(detailTotal) + ' registros'}</span>
            </div>

            <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
              {detailError ? (
                <div className="p-5 flex items-start gap-2 text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div><p className="font-semibold text-sm">Erro</p><p className="text-xs font-mono mt-0.5">{
                    detailError.includes('timeout') || detailError.includes('upstream')
                      ? 'Servidor sobrecarregado. Aguarde alguns segundos e tente novamente.'
                      : detailError
                  }</p>
                  <button onClick={() => loadDetail(detailPage, tableSearch)} className="mt-2 px-3 py-1 bg-red-500 text-white text-xs font-bold rounded hover:bg-red-600">Retry</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto" style={{ maxHeight: '65vh' }}>
                    <table className="text-xs border-collapse" style={{ minWidth: '3400px' }}>
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-[#1B1B1B]">
                          {TABLE_COLS.map(col => (
                            <th key={col.key}
                              className={cn('px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-[#888] whitespace-nowrap border-r border-white/5', col.numeric && 'text-right')}
                              style={{ minWidth: col.w }}>{col.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0F0F0]">
                        {detailLoading && detailRows.length === 0 ? (
                          <tr><td colSpan={TABLE_COLS.length} className="py-14 text-center text-[#CCC]"><Spinner size={6} /></td></tr>
                        ) : detailRows.length === 0 ? (
                          <tr><td colSpan={TABLE_COLS.length} className="py-14 text-center text-[#CCC]"><Database className="w-7 h-7 mx-auto mb-1 opacity-30" /><p>Nenhum registro</p></td></tr>
                        ) : detailRows.map((row, i) => (
                          <tr key={row.id ?? i} className={cn('hover:bg-blue-50/30', i % 2 === 1 && 'bg-[#FAFAFA]')}>
                            {TABLE_COLS.map(col => {
                              const v = row[col.key];
                              if (col.numeric) {
                                const n = Number(v ?? 0);
                                return <td key={col.key} className="px-2.5 py-2 text-right font-mono font-semibold text-[#333] whitespace-nowrap border-r border-[#F0F0F0]">
                                  {n !== 0 ? fmt(n, 'currency') : <span className="text-[#DDD]"> -</span>}
                                </td>;
                              }
                              const s = String(v ?? '');
                              const empty = !s || s === 'null' || s === 'undefined';
                              const isCodeName = (col.key as string).startsWith('codigo_nome_');
                              const display = isCodeName ? stripNumPrefix(s) : s;
                              return <td key={col.key} className="px-2.5 py-2 border-r border-[#F0F0F0]"
                                style={{ maxWidth: col.w, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={display}>
                                {empty ? <span className="text-[#DDD]"> -</span>
                                  : col.key === 'drs' ? <span className="font-semibold text-[#118DFF]">{display}</span>
                                  : col.key === 'municipio' ? <span className="font-medium text-[#333]">{display}</span>
                                  : <span className="text-[#555]">{display}</span>}
                              </td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2.5 border-t border-[#E5E5E5] bg-[#FAFAFA] flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-[#666]">
                      <strong>{detailPage * DETAIL_PAGE_SIZE + 1} -{Math.min((detailPage + 1) * DETAIL_PAGE_SIZE, detailTotal)}</strong> de <strong>{fmt(detailTotal)}</strong>
                    </p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => loadDetail(detailPage - 1, tableSearch)} disabled={detailLoading || detailPage === 0}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-white border border-[#D0D0D0] rounded hover:bg-[#F0F0F0] disabled:opacity-40">
                        <ChevronLeft className="w-3 h-3" />Anterior</button>
                      <span className="px-2.5 py-1.5 text-xs font-bold bg-[#1B1B1B] text-white rounded min-w-[32px] text-center">{detailPage + 1}</span>
                      <button onClick={() => loadDetail(detailPage + 1, tableSearch)} disabled={detailLoading || (detailPage + 1) * DETAIL_PAGE_SIZE >= detailTotal}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-white border border-[#D0D0D0] rounded hover:bg-[#F0F0F0] disabled:opacity-40">
                        Próxima<ChevronRight className="w-3 h-3" /></button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* ---------- TAB: TABELA DINÂMICA ---------- */}
        {activeTab === 'pivot' && (() => {
          // Derive years present in the data
          const pivotAnos = Array.from(new Set(pivotRaw.map(r => r.ano_referencia))).sort((a, b) => a - b);

          // Build hierarchical structure: municipio → rotulos → byYear
          type PivotMunic = {
            municipio: string;
            byYear: Record<number, number>;
            total: number;
            rotulos: { rotulo: string; byYear: Record<number, number>; total: number }[];
          };
          const municMap = new Map<string, PivotMunic>();
          for (const row of pivotRaw) {
            const v = (row[pivotValueKey] as number) ?? 0;
            if (!municMap.has(row.municipio)) {
              municMap.set(row.municipio, { municipio: row.municipio, byYear: {}, total: 0, rotulos: [] });
            }
            const munic = municMap.get(row.municipio)!;
            munic.byYear[row.ano_referencia] = (munic.byYear[row.ano_referencia] ?? 0) + v;
            munic.total += v;
            let rot = munic.rotulos.find(r => r.rotulo === row.rotulo);
            if (!rot) { rot = { rotulo: row.rotulo, byYear: {}, total: 0 }; munic.rotulos.push(rot); }
            rot.byYear[row.ano_referencia] = (rot.byYear[row.ano_referencia] ?? 0) + v;
            rot.total += v;
          }
          const municRows = Array.from(municMap.values())
            .sort((a, b) => a.municipio.localeCompare(b.municipio, 'pt-BR'));
          municRows.forEach(m => m.rotulos.sort((a, b) => b.total - a.total));

          // Grand totals
          const grandByYear: Record<number, number> = {};
          let grandTotal = 0;
          for (const m of municRows) {
            for (const ano of pivotAnos) { grandByYear[ano] = (grandByYear[ano] ?? 0) + (m.byYear[ano] ?? 0); }
            grandTotal += m.total;
          }

          // XLSX export — flat rows: municipio | rotulo | ano1 | ano2 | ... | total
          const downloadPivotXlsx = async () => {
            setPivotXlsxLoading(true);
            try {
              const XLSX = await import('xlsx');
              const valLabel = pivotValueKey === 'pago_total' ? 'Pago Total' : pivotValueKey === 'empenhado' ? 'Empenhado' : 'Liquidado';
              const header = ['Município', 'Rótulo', ...pivotAnos.map(String), 'Total Geral'];
              const rows: (string | number)[][] = [header];
              for (const m of municRows) {
                // municipality summary row
                rows.push([m.municipio, `TOTAL ${m.municipio}`, ...pivotAnos.map(a => m.byYear[a] ?? 0), m.total]);
                // rotulo sub-rows
                for (const r of m.rotulos) {
                  rows.push([m.municipio, r.rotulo, ...pivotAnos.map(a => r.byYear[a] ?? 0), r.total]);
                }
              }
              // grand total row
              rows.push(['TOTAL GERAL', '', ...pivotAnos.map(a => grandByYear[a] ?? 0), grandTotal]);
              const ws = XLSX.utils.aoa_to_sheet(rows);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, valLabel);
              XLSX.writeFile(wb, `pivot_municipio_rotulo_${pivotValueKey}.xlsx`);
            } catch (e: unknown) {
              alert('Erro ao gerar XLSX: ' + (e as Error).message);
            } finally {
              setPivotXlsxLoading(false);
            }
          };

          const COL_W = 130;
          const totalPages = municRows.length;

          return (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-[#666]">Valor:</span>
                {(['pago_total', 'empenhado', 'liquidado'] as const).map(k => (
                  <button key={k} onClick={() => setPivotValueKey(k)}
                    className={cn('px-2.5 py-1.5 text-xs font-bold rounded-lg transition',
                      pivotValueKey === k ? 'bg-[#118DFF] text-white' : 'bg-white border border-[#D0D0D0] text-[#555] hover:bg-[#F0F0F0]')}>
                    {k === 'pago_total' ? 'Pago Total' : k === 'empenhado' ? 'Empenhado' : 'Liquidado'}
                  </button>
                ))}
                <div className="flex-1" />
                <button onClick={() => setPivotExpanded(new Set(municRows.map(m => m.municipio)))}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-[#D0D0D0] rounded hover:bg-[#F0F0F0]">
                  Expandir todos
                </button>
                <button onClick={() => setPivotExpanded(new Set())}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-[#D0D0D0] rounded hover:bg-[#F0F0F0]">
                  Recolher todos
                </button>
                <button onClick={downloadPivotXlsx} disabled={pivotXlsxLoading || !pivotRaw.length}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#217346] text-white text-xs font-bold rounded-lg hover:bg-[#1a5c38] disabled:opacity-40">
                  {pivotXlsxLoading ? <Spinner size={3} /> : <Download className="w-3.5 h-3.5" />}
                  Exportar XLSX
                </button>
                <span className="text-xs text-[#999]">
                  {pivotLoading ? <Spinner size={3} /> : `${fmt(totalPages)} municípios`}
                </span>
              </div>

              <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
                {pivotError ? (
                  <div className="p-5 flex items-start gap-2 text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-sm">Erro</p>
                      <p className="text-xs font-mono mt-0.5">{pivotError.includes('Could not find the function') ? 'Função lc131_pivot não encontrada. Execute scripts/create-pivot-fn.sql no Supabase SQL Editor.' : pivotError}</p>
                      <button onClick={loadPivot} className="mt-2 px-3 py-1 bg-red-500 text-white text-xs font-bold rounded hover:bg-red-600">Retry</button>
                    </div>
                  </div>
                ) : pivotLoading && !pivotRaw.length ? (
                  <div className="py-16 flex items-center justify-center"><Spinner size={8} /></div>
                ) : (
                  <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
                    <table className="text-xs border-collapse w-full">
                      <thead className="sticky top-0 z-20">
                        <tr className="bg-[#1B1B1B] text-white">
                          <th className="sticky left-0 z-30 bg-[#1B1B1B] px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-[#888] whitespace-nowrap border-r border-white/10"
                            style={{ minWidth: '220px' }}>
                            Município / Rótulo
                          </th>
                          {pivotAnos.map(ano => (
                            <th key={ano} className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-[#888] whitespace-nowrap border-r border-white/10"
                              style={{ minWidth: `${COL_W}px` }}>{ano}</th>
                          ))}
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-[#FFD700] whitespace-nowrap"
                            style={{ minWidth: `${COL_W}px` }}>Total Geral</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0F0F0]">
                        {municRows.map((munic, mi) => {
                          const isOpen = pivotExpanded.has(munic.municipio);
                          return (
                            <React.Fragment key={munic.municipio}>
                              {/* Municipality row */}
                              <tr
                                className={cn('cursor-pointer select-none', mi % 2 === 0 ? 'bg-[#F0F6FF]' : 'bg-[#E8F0FE]', 'hover:bg-[#D8EBFF]')}
                                onClick={() => setPivotExpanded(prev => {
                                  const next = new Set(prev);
                                  isOpen ? next.delete(munic.municipio) : next.add(munic.municipio);
                                  return next;
                                })}
                              >
                                <td className="sticky left-0 z-10 px-3 py-2 font-bold text-[#1B1B1B] whitespace-nowrap border-r border-[#D0D8E8]"
                                  style={{ minWidth: '220px', background: mi % 2 === 0 ? '#F0F6FF' : '#E8F0FE' }}>
                                  <span className="flex items-center gap-1.5">
                                    {isOpen
                                      ? <ChevronDown className="w-3 h-3 text-[#118DFF] shrink-0" />
                                      : <ChevronRight className="w-3 h-3 text-[#999] shrink-0" />}
                                    {munic.municipio}
                                  </span>
                                </td>
                                {pivotAnos.map(ano => (
                                  <td key={ano} className="px-3 py-2 text-right font-mono font-semibold text-[#1B1B1B] whitespace-nowrap border-r border-[#D0D8E8]">
                                    {munic.byYear[ano] ? fmt(munic.byYear[ano], 'currency') : <span className="text-[#CCC]">-</span>}
                                  </td>
                                ))}
                                <td className="px-3 py-2 text-right font-mono font-bold text-[#118DFF] whitespace-nowrap">
                                  {fmt(munic.total, 'currency')}
                                </td>
                              </tr>
                              {/* Rotulo sub-rows */}
                              {isOpen && munic.rotulos.map(rot => (
                                <tr key={rot.rotulo} className="bg-white hover:bg-[#F8FAFF]">
                                  <td className="sticky left-0 z-10 px-3 py-1.5 text-[#444] whitespace-nowrap border-r border-[#F0F0F0] bg-white"
                                    style={{ minWidth: '220px' }}>
                                    <span className="pl-6">{rot.rotulo}</span>
                                  </td>
                                  {pivotAnos.map(ano => (
                                    <td key={ano} className="px-3 py-1.5 text-right font-mono text-[#555] whitespace-nowrap border-r border-[#F0F0F0]">
                                      {rot.byYear[ano] ? fmt(rot.byYear[ano], 'currency') : <span className="text-[#EEE]">-</span>}
                                    </td>
                                  ))}
                                  <td className="px-3 py-1.5 text-right font-mono font-semibold text-[#333] whitespace-nowrap">
                                    {fmt(rot.total, 'currency')}
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                        {/* Grand total row */}
                        {municRows.length > 0 && (
                          <tr className="bg-[#1B1B1B] text-white">
                            <td className="sticky left-0 z-10 px-3 py-2.5 font-bold text-[10px] uppercase tracking-wide text-[#888] bg-[#1B1B1B]"
                              style={{ minWidth: '220px' }}>
                              Total Geral
                            </td>
                            {pivotAnos.map(ano => (
                              <td key={ano} className="px-3 py-2.5 text-right font-mono font-bold text-blue-300 whitespace-nowrap border-r border-white/10">
                                {fmt(grandByYear[ano] ?? 0, 'currency')}
                              </td>
                            ))}
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-[#FFD700] whitespace-nowrap">
                              {fmt(grandTotal, 'currency')}
                            </td>
                          </tr>
                        )}
                        {!pivotLoading && !pivotRaw.length && (
                          <tr><td colSpan={pivotAnos.length + 2} className="py-14 text-center text-[#CCC]">
                            <Database className="w-7 h-7 mx-auto mb-1 opacity-30" /><p>Nenhum dado encontrado</p>
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          );
        })()}

        {/* Footer */}
        <div className="flex items-center justify-between py-3 border-t border-[#E5E5E5] text-[10px] text-[#BBB] flex-wrap gap-2">
          <span className="font-mono">lc131_despesas · teikzwrfsxjipxozzhbr.supabase.co</span>
          <span>Controle de Despesas · Coordenadoria de Gestão Orçamentária e Financeira · SES/SP · {new Date().getFullYear()}</span>
        </div>
      </main>
      )}

      {uploadOpen && <UploadPanel onClose={() => setUploadOpen(false)} />}

      {/* Password gate modal */}
      {pwdGateOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) { setPwdGateOpen(false); setPwdInput(''); setPwdError(false); } }}>
          <div className="bg-white rounded-xl shadow-2xl w-80 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#118DFF] shrink-0" />
              <p className="font-bold text-[#333] text-sm">Acesso restrito</p>
            </div>
            <p className="text-[11px] text-[#999] -mt-2">Informe a senha para importar planilha.</p>
            <form onSubmit={e => { e.preventDefault(); if (pwdInput === 'cgof@#$2026') { setPwdGateOpen(false); setPwdInput(''); setPwdError(false); setUploadOpen(true); } else { setPwdError(true); setPwdInput(''); } }}>
              <input
                autoFocus
                type="password"
                placeholder="Senha"
                value={pwdInput}
                onChange={ev => { setPwdInput(ev.target.value); setPwdError(false); }}
                className={cn('w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#118DFF] transition', pwdError ? 'border-red-400 bg-red-50' : 'border-[#D0D0D0]')}
              />
              {pwdError && <p className="text-[11px] text-red-500 mt-1">Senha incorreta. Tente novamente.</p>}
              <div className="flex gap-2 mt-4">
                <button type="button" onClick={() => { setPwdGateOpen(false); setPwdInput(''); setPwdError(false); }}
                  className="flex-1 px-3 py-2 text-[12px] font-semibold border border-[#D0D0D0] rounded-lg hover:bg-[#F0F0F0] transition">Cancelar</button>
                <button type="submit"
                  className="flex-1 px-3 py-2 text-[12px] font-semibold bg-[#118DFF] text-white rounded-lg hover:bg-[#0070d8] transition">Entrar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
